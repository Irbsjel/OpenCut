import {
	getCompositorCanvas,
	getLastFrameProfile,
	initCompositor,
	releaseTexture,
	renderFrame,
	resizeCompositor,
	uploadTexture,
} from "opencut-wasm";
import {
	incrementCounter,
	isRenderPerfEnabled,
	recordWasmFrameProfile,
} from "@/diagnostics/render-perf";
import type { BlendMode } from "@/rendering";
import type { TransitionVisualFx } from "@/animation/clip-animations";
import type {
	ExternalTextureDescriptor,
	FrameDescriptor,
	QuadTransformDescriptor,
	RenderedTextureDescriptor,
	TextureUploadDescriptor,
} from "./types";

type RenderedCacheEntry = {
	kind: "rendered";
	canvas: OffscreenCanvas;
	contentHash: string;
	width: number;
	height: number;
	uploadedToWasm: boolean;
};

type ExternalCacheEntry = {
	kind: "external";
	source: CanvasImageSource;
	sourceRevision: number;
	backingCanvas: OffscreenCanvas | null;
	width: number;
	height: number;
	uploadedSource: CanvasImageSource | null;
	uploadedRevision: number;
};

function getSourceRevision(source: CanvasImageSource): number {
	return (
		(source as unknown as { __frameRevision?: number }).__frameRevision ?? 0
	);
}

function mapBlendModeToCompositeOp(
	blendMode: BlendMode,
): GlobalCompositeOperation {
	switch (blendMode) {
		case "multiply":
			return "multiply";
		case "screen":
			return "screen";
		case "overlay":
			return "overlay";
		case "darken":
			return "darken";
		case "lighten":
			return "lighten";
		case "color-dodge":
			return "color-dodge";
		case "color-burn":
			return "color-burn";
		case "hard-light":
			return "hard-light";
		case "soft-light":
			return "soft-light";
		case "difference":
			return "difference";
		case "exclusion":
			return "exclusion";
		case "hue":
			return "hue";
		case "saturation":
			return "saturation";
		case "color":
			return "color";
		case "luminosity":
			return "luminosity";
		default:
			return "source-over";
	}
}

class WasmCompositor {
	private outputCanvas: HTMLCanvasElement | null = null;
	private outputCtx: CanvasRenderingContext2D | null = null;
	private wasmCanvas: HTMLCanvasElement | null = null;
	private initializedSize: { width: number; height: number } | null = null;
	private wasmInitializedSize: { width: number; height: number } | null = null;
	private cache = new Map<string, RenderedCacheEntry | ExternalCacheEntry>();
	private pendingTextures: TextureUploadDescriptor[] = [];

	ensureInitialized({ width, height }: { width: number; height: number }) {
		if (!this.outputCanvas && typeof document !== "undefined") {
			this.outputCanvas = document.createElement("canvas");
			this.outputCanvas.width = width;
			this.outputCanvas.height = height;
			this.outputCtx = this.outputCanvas.getContext("2d", {
				alpha: true,
				desynchronized: true,
			});
			this.initializedSize = { width, height };
			return;
		}

		if (
			this.outputCanvas &&
			(!this.initializedSize ||
				this.initializedSize.width !== width ||
				this.initializedSize.height !== height)
		) {
			this.outputCanvas.width = width;
			this.outputCanvas.height = height;
			this.initializedSize = { width, height };
		}
	}

	private ensureWasmInitialized({
		width,
		height,
	}: {
		width: number;
		height: number;
	}) {
		if (!this.wasmCanvas) {
			initCompositor(width, height);
			this.wasmCanvas = getCompositorCanvas();
			this.wasmInitializedSize = { width, height };
			return;
		}

		if (
			!this.wasmInitializedSize ||
			this.wasmInitializedSize.width !== width ||
			this.wasmInitializedSize.height !== height
		) {
			resizeCompositor(width, height);
			this.wasmInitializedSize = { width, height };
		}
	}

	getCanvas(): HTMLCanvasElement {
		if (!this.outputCanvas) {
			throw new Error("Compositor is not initialized");
		}
		return this.outputCanvas;
	}

	syncTextures(textures: TextureUploadDescriptor[]) {
		this.pendingTextures = textures;
		const nextIds = new Set(textures.map((texture) => texture.id));
		for (const [previousId, entry] of this.cache.entries()) {
			if (!nextIds.has(previousId)) {
				if (
					this.wasmCanvas &&
					((entry.kind === "rendered" && entry.uploadedToWasm) ||
						(entry.kind === "external" && entry.uploadedSource !== null))
				) {
					try {
						releaseTexture(previousId);
					} catch {}
				}
				this.cache.delete(previousId);
			}
		}

		for (const texture of textures) {
			if (texture.kind === "external") {
				this.prepareExternalTexture(texture);
			} else {
				this.prepareRenderedTexture(texture);
			}
		}
	}

	render(
		frame: FrameDescriptor,
		targetCtx?: CanvasRenderingContext2D | null,
	) {
		if (!targetCtx) {
			this.ensureInitialized({ width: frame.width, height: frame.height });
		}
		const activeCtx = targetCtx ?? this.outputCtx;

		const hasGeometricMaskTransition = frame.items.some(
			(item) =>
				item.type === "layer" &&
				item.transitionFx &&
				(item.transitionFx.kind === "iris-circle" ||
					item.transitionFx.kind === "diagonal-wipe" ||
					item.transitionFx.kind === "blinds-venetian" ||
					item.transitionFx.kind === "split-doors" ||
					item.transitionFx.kind === "clock-radial" ||
					item.transitionFx.kind === "diamond-reveal" ||
					item.transitionFx.kind === "glitch-rgb-slice" ||
					item.transitionFx.kind === "vhs-tracking" ||
					item.transitionFx.kind === "whip-blur-x" ||
					item.transitionFx.kind === "whip-blur-y" ||
					item.transitionFx.kind === "radial-zoom-blur"),
		);

		const needsWasmGpu =
			!hasGeometricMaskTransition &&
			frame.items.some(
				(item) =>
					(item.type === "sceneEffect" && item.effectPassGroups.length > 0) ||
					(item.type === "layer" &&
						(item.effectPassGroups.length > 0 || item.mask !== null)),
			);

		if (!needsWasmGpu && activeCtx) {
			this.renderDirect2D(frame, activeCtx);
			return;
		}

		this.ensureWasmInitialized({ width: frame.width, height: frame.height });
		this.uploadAllToWasm();
		renderFrame(frame);
		if (isRenderPerfEnabled()) {
			recordWasmFrameProfile(
				getLastFrameProfile() as Array<{ name: string; durationMs: number }>,
			);
		}
		if (activeCtx && this.wasmCanvas) {
			activeCtx.clearRect(0, 0, frame.width, frame.height);
			activeCtx.drawImage(
				this.wasmCanvas,
				0,
				0,
				frame.width,
				frame.height,
			);
			for (const item of frame.items) {
				if (item.type === "layer" && item.transitionFx) {
					drawTransitionPostOverlay2D({
						ctx: activeCtx,
						canvasWidth: frame.width,
						canvasHeight: frame.height,
						transform: item.transform,
						transitionFx: item.transitionFx,
					});
				}
			}
		}
	}

	private renderDirect2D(
		frame: FrameDescriptor,
		ctx: CanvasRenderingContext2D,
	) {
		const { width, height } = frame;
		const [r, g, b, a] = frame.clear.color;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = "source-over";

		if (a <= 0) {
			ctx.clearRect(0, 0, width, height);
		} else {
			ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
			ctx.fillRect(0, 0, width, height);
		}

		for (const item of frame.items) {
			if (item.type !== "layer") continue;
			if (item.opacity <= 0) continue;

			const entry = this.cache.get(item.textureId);
			if (!entry) continue;

			const source = entry.kind === "external" ? entry.source : entry.canvas;
			drawLayer2D({
				ctx,
				canvasWidth: width,
				canvasHeight: height,
				source,
				sourceWidth: entry.width,
				sourceHeight: entry.height,
				transform: item.transform,
				opacity: item.opacity,
				blendMode: item.blendMode,
				transitionFx: item.transitionFx ?? null,
			});
		}

		ctx.restore();
	}

	private prepareExternalTexture(texture: ExternalTextureDescriptor) {
		const previous = this.cache.get(texture.id);
		const nextRevision = getSourceRevision(texture.source);
		if (
			previous?.kind === "external" &&
			previous.source === texture.source &&
			previous.sourceRevision === nextRevision &&
			previous.width === texture.width &&
			previous.height === texture.height
		) {
			incrementCounter({ name: "textureCacheHit" });
			return;
		}

		this.cache.set(texture.id, {
			kind: "external",
			source: texture.source,
			sourceRevision: nextRevision,
			backingCanvas:
				previous?.kind === "external" &&
				previous.width === texture.width &&
				previous.height === texture.height
					? previous.backingCanvas
					: null,
			width: texture.width,
			height: texture.height,
			uploadedSource: null,
			uploadedRevision: -1,
		});
	}

	private prepareRenderedTexture(texture: RenderedTextureDescriptor) {
		const previous = this.cache.get(texture.id);
		if (
			previous?.kind === "rendered" &&
			previous.contentHash === texture.contentHash &&
			previous.width === texture.width &&
			previous.height === texture.height
		) {
			incrementCounter({ name: "textureCacheHit" });
			return;
		}

		const canvas =
			previous?.kind === "rendered" &&
			previous.width === texture.width &&
			previous.height === texture.height
				? previous.canvas
				: createBackingCanvas({
						width: texture.width,
						height: texture.height,
					});

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error(`Failed to get 2d context for texture ${texture.id}`);
		}
		ctx.clearRect(0, 0, texture.width, texture.height);
		texture.draw(ctx);

		this.cache.set(texture.id, {
			kind: "rendered",
			canvas,
			contentHash: texture.contentHash,
			width: texture.width,
			height: texture.height,
			uploadedToWasm: false,
		});
	}

	private uploadAllToWasm() {
		for (const texture of this.pendingTextures) {
			const entry = this.cache.get(texture.id);
			if (!entry) continue;

			if (entry.kind === "external") {
				if (
					entry.uploadedSource === entry.source &&
					entry.uploadedRevision === entry.sourceRevision
				)
					continue;
				const offscreen = ensurePersistentOffscreenCanvas({
					entry,
					label: `texture upload ${texture.id}`,
				});
				incrementCounter({ name: "textureUpload" });
				incrementCounter({
					name: "textureUploadPixels",
					by: entry.width * entry.height,
				});
				uploadTexture({
					id: texture.id,
					source: offscreen,
					width: entry.width,
					height: entry.height,
				});
				entry.uploadedSource = entry.source;
				entry.uploadedRevision = entry.sourceRevision;
			} else if (!entry.uploadedToWasm) {
				incrementCounter({ name: "textureUpload" });
				incrementCounter({
					name: "textureUploadPixels",
					by: entry.width * entry.height,
				});
				uploadTexture({
					id: texture.id,
					source: entry.canvas,
					width: entry.width,
					height: entry.height,
				});
				entry.uploadedToWasm = true;
			}
		}
	}
}

export const wasmCompositor = new WasmCompositor();

function drawLayer2D({
	ctx,
	canvasWidth,
	canvasHeight,
	source,
	sourceWidth,
	sourceHeight,
	transform,
	opacity,
	blendMode,
	transitionFx,
}: {
	ctx: CanvasRenderingContext2D;
	canvasWidth: number;
	canvasHeight: number;
	source: CanvasImageSource;
	sourceWidth: number;
	sourceHeight: number;
	transform: QuadTransformDescriptor;
	opacity: number;
	blendMode: BlendMode;
	transitionFx: TransitionVisualFx | null;
}) {
	const x = transform.centerX - transform.width / 2;
	const y = transform.centerY - transform.height / 2;
	const flipX = transform.flipX ? -1 : 1;
	const flipY = transform.flipY ? -1 : 1;
	const requiresMatrix =
		transform.rotationDegrees !== 0 || flipX !== 1 || flipY !== 1;
	const baseAlpha = Math.max(0, Math.min(1, opacity));
	const p = transitionFx
		? Math.max(0, Math.min(1, transitionFx.progress))
		: 1;
	const intensity = 1 - p;

	ctx.save();
	ctx.globalAlpha = baseAlpha;
	ctx.globalCompositeOperation = mapBlendModeToCompositeOp(blendMode);

	// 1. Apply Geometric Mask Clipping if active (GL-Transitions Wipes & Masks)
	if (transitionFx && intensity > 0.005) {
		applyGeometricTransitionClip({
			ctx,
			transform,
			transitionFx,
			p,
		});
	}

	if (requiresMatrix) {
		ctx.translate(transform.centerX, transform.centerY);
		if (transform.rotationDegrees !== 0) {
			ctx.rotate((transform.rotationDegrees * Math.PI) / 180);
		}
		if (flipX !== 1 || flipY !== 1) {
			ctx.scale(flipX, flipY);
		}
		ctx.translate(-transform.centerX, -transform.centerY);
	}

	// 2. Multi-Sample Directional or Radial Motion Blur Echoes (Whip Pan / Cross-Zoom / Dreamy)
	if (transitionFx && intensity > 0.02) {
		if (transitionFx.kind === "whip-blur-x") {
			const dir = transitionFx.signedVector ?? 1;
			const maxShift = transform.width * 0.055 * intensity * dir;
			for (const step of [-2, -1, 1, 2]) {
				ctx.globalAlpha = baseAlpha * 0.18 * intensity;
				ctx.drawImage(
					source,
					x + step * maxShift,
					y,
					transform.width,
					transform.height,
				);
			}
			ctx.globalAlpha = baseAlpha;
		} else if (transitionFx.kind === "whip-blur-y") {
			const dir = transitionFx.signedVector ?? 1;
			const maxShift = transform.height * 0.055 * intensity * dir;
			for (const step of [-2, -1, 1, 2]) {
				ctx.globalAlpha = baseAlpha * 0.18 * intensity;
				ctx.drawImage(
					source,
					x,
					y + step * maxShift,
					transform.width,
					transform.height,
				);
			}
			ctx.globalAlpha = baseAlpha;
		} else if (
			transitionFx.kind === "radial-zoom-blur" ||
			transitionFx.kind === "dreamy-glow"
		) {
			const steps =
				transitionFx.kind === "dreamy-glow" ? [1.03, 1.06] : [1.03, 1.065, 1.1];
			for (const s of steps) {
				const scaleFactor = 1 + (s - 1) * intensity;
				const sw = transform.width * scaleFactor;
				const sh = transform.height * scaleFactor;
				ctx.globalAlpha = baseAlpha * 0.2 * intensity;
				ctx.drawImage(
					source,
					transform.centerX - sw / 2,
					transform.centerY - sh / 2,
					sw,
					sh,
				);
			}
			ctx.globalAlpha = baseAlpha;
		}
	}

	// 3. Draw Primary Frame
	ctx.drawImage(source, x, y, transform.width, transform.height);

	// 4. Glitch RGB Chromatic Split & Horizontal Slice Displacement
	if (
		transitionFx &&
		intensity > 0.02 &&
		(transitionFx.kind === "glitch-rgb-slice" ||
			transitionFx.kind === "vhs-tracking")
	) {
		const bandCount = transitionFx.kind === "glitch-rgb-slice" ? 6 : 4;
		for (let b = 0; b < bandCount; b++) {
			const seed = Math.sin(p * 53 + b * 17.3);
			if (Math.abs(seed) < 0.25) continue;
			const normY = (b + 0.5) / bandCount;
			const sliceFracH = 0.06 + (b % 3) * 0.035;
			const sy = Math.max(0, (normY - sliceFracH / 2) * sourceHeight);
			const sh = Math.max(2, Math.min(sourceHeight - sy, sliceFracH * sourceHeight));
			const dy = y + (sy / Math.max(1, sourceHeight)) * transform.height;
			const dh = (sh / Math.max(1, sourceHeight)) * transform.height;
			const offsetX =
				seed *
				transform.width *
				(transitionFx.kind === "glitch-rgb-slice" ? 0.08 : 0.035) *
				intensity;
			ctx.globalAlpha = baseAlpha * 0.9;
			ctx.drawImage(
				source,
				0,
				sy,
				sourceWidth,
				sh,
				x + offsetX,
				dy,
				transform.width,
				dh,
			);
		}

		// Additive Chromatic Aberration (Red/Cyan Split)
		const rgbShift = transform.width * 0.018 * intensity;
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		ctx.globalAlpha = baseAlpha * 0.38 * intensity;
		ctx.drawImage(
			source,
			x + rgbShift,
			y - rgbShift * 0.2,
			transform.width,
			transform.height,
		);
		ctx.drawImage(
			source,
			x - rgbShift,
			y + rgbShift * 0.2,
			transform.width,
			transform.height,
		);
		ctx.restore();
	}

	ctx.restore();

	// 5. Optical Light Leaks, Flashes, Film Burn, 3D Shading & Mask Edge Glow
	if (transitionFx && intensity > 0.01) {
		drawTransitionPostOverlay2D({
			ctx,
			canvasWidth,
			canvasHeight,
			transform,
			transitionFx,
		});
	}
}

function applyGeometricTransitionClip({
	ctx,
	transform,
	transitionFx,
	p,
}: {
	ctx: CanvasRenderingContext2D;
	transform: QuadTransformDescriptor;
	transitionFx: TransitionVisualFx;
	p: number;
}) {
	const cx = transform.centerX;
	const cy = transform.centerY;
	const w = transform.width;
	const h = transform.height;
	const left = cx - w / 2;
	const top = cy - h / 2;
	const smoothP = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

	switch (transitionFx.kind) {
		case "iris-circle": {
			const maxRadius = Math.hypot(w, h) * 0.56;
			const radius = Math.max(2, smoothP * maxRadius);
			ctx.beginPath();
			ctx.arc(cx, cy, radius, 0, Math.PI * 2);
			ctx.clip();
			break;
		}
		case "diagonal-wipe": {
			const span = w + h;
			const reach = smoothP * span * 1.15;
			ctx.beginPath();
			if (transitionFx.direction === 1) {
				ctx.moveTo(left, top);
				ctx.lineTo(left + reach, top);
				ctx.lineTo(left, top + reach);
			} else {
				ctx.moveTo(left + w, top + h);
				ctx.lineTo(left + w - reach, top + h);
				ctx.lineTo(left + w, top + h - reach);
			}
			ctx.closePath();
			ctx.clip();
			break;
		}
		case "blinds-venetian": {
			const slats = 10;
			const slatH = h / slats;
			ctx.beginPath();
			for (let i = 0; i < slats; i++) {
				const stagger = Math.min(
					1,
					Math.max(0, (smoothP * 1.25 - (i / slats) * 0.25)),
				);
				const openH = slatH * stagger;
				const sy = top + i * slatH + (slatH - openH) * 0.5;
				ctx.rect(left, sy, w, Math.max(0.5, openH));
			}
			ctx.clip();
			break;
		}
		case "split-doors": {
			const openW = w * smoothP;
			ctx.beginPath();
			ctx.rect(cx - openW / 2, top, Math.max(1, openW), h);
			ctx.clip();
			break;
		}
		case "clock-radial": {
			const maxR = Math.hypot(w, h) * 0.65;
			const startAngle = -Math.PI / 2;
			const endAngle = startAngle + smoothP * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.arc(cx, cy, maxR, startAngle, endAngle, false);
			ctx.closePath();
			ctx.clip();
			break;
		}
		case "diamond-reveal": {
			const rx = w * 0.95 * smoothP;
			const ry = h * 0.95 * smoothP;
			ctx.beginPath();
			ctx.moveTo(cx, cy - ry);
			ctx.lineTo(cx + rx, cy);
			ctx.lineTo(cx, cy + ry);
			ctx.lineTo(cx - rx, cy);
			ctx.closePath();
			ctx.clip();
			break;
		}
		default:
			break;
	}
}

function drawTransitionPostOverlay2D({
	ctx,
	canvasWidth,
	canvasHeight,
	transform,
	transitionFx,
}: {
	ctx: CanvasRenderingContext2D;
	canvasWidth: number;
	canvasHeight: number;
	transform: QuadTransformDescriptor;
	transitionFx: TransitionVisualFx;
}) {
	const p = Math.max(0, Math.min(1, transitionFx.progress));
	const intensity = 1 - p;
	if (intensity <= 0.01) return;

	const cx = transform.centerX;
	const cy = transform.centerY;
	const w = transform.width;
	const h = transform.height;
	const left = cx - w / 2;
	const top = cy - h / 2;

	ctx.save();

	switch (transitionFx.kind) {
		case "flash-white": {
			const alpha = Math.pow(intensity, 1.5) * 0.92;
			const grad = ctx.createRadialGradient(
				canvasWidth / 2,
				canvasHeight / 2,
				0,
				canvasWidth / 2,
				canvasHeight / 2,
				Math.hypot(canvasWidth, canvasHeight) * 0.65,
			);
			grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
			grad.addColorStop(0.65, `rgba(255, 250, 235, ${alpha * 0.85})`);
			grad.addColorStop(1, `rgba(255, 240, 200, ${alpha * 0.6})`);
			ctx.globalCompositeOperation = "screen";
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);
			break;
		}
		case "flash-black": {
			const alpha = Math.pow(intensity, 1.3) * 0.96;
			ctx.globalCompositeOperation = "source-over";
			ctx.fillStyle = `rgba(3, 5, 10, ${alpha})`;
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);
			break;
		}
		case "light-leak-warm": {
			ctx.globalCompositeOperation = "screen";
			const driftX = canvasWidth * (0.18 + 0.64 * p);
			const driftY = canvasHeight * (0.28 + 0.35 * Math.sin(p * Math.PI));
			const r1 = Math.max(canvasWidth, canvasHeight) * 0.72;
			const g1 = ctx.createRadialGradient(driftX, driftY, 0, driftX, driftY, r1);
			g1.addColorStop(0, `rgba(255, 215, 110, ${intensity * 0.88})`);
			g1.addColorStop(0.42, `rgba(251, 146, 60, ${intensity * 0.65})`);
			g1.addColorStop(0.75, `rgba(244, 63, 94, ${intensity * 0.32})`);
			g1.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = g1;
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);

			const driftX2 = canvasWidth * (0.85 - 0.55 * p);
			const driftY2 = canvasHeight * 0.72;
			const r2 = Math.max(canvasWidth, canvasHeight) * 0.55;
			const g2 = ctx.createRadialGradient(
				driftX2,
				driftY2,
				0,
				driftX2,
				driftY2,
				r2,
			);
			g2.addColorStop(0, `rgba(253, 224, 71, ${intensity * 0.65})`);
			g2.addColorStop(0.5, `rgba(249, 115, 22, ${intensity * 0.4})`);
			g2.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = g2;
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);
			break;
		}
		case "film-burn": {
			ctx.globalCompositeOperation = "screen";
			const sweepX =
				transitionFx.direction === 1
					? canvasWidth * (1 - p * 0.9)
					: canvasWidth * (p * 0.9);
			const r = Math.max(canvasWidth, canvasHeight) * 0.8;
			const burnGrad = ctx.createRadialGradient(
				sweepX,
				canvasHeight * 0.5,
				0,
				sweepX,
				canvasHeight * 0.5,
				r,
			);
			burnGrad.addColorStop(0, `rgba(255, 250, 205, ${intensity * 0.92})`);
			burnGrad.addColorStop(0.32, `rgba(249, 115, 22, ${intensity * 0.8})`);
			burnGrad.addColorStop(0.68, `rgba(220, 38, 38, ${intensity * 0.5})`);
			burnGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = burnGrad;
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);
			break;
		}
		case "anamorphic-flare": {
			ctx.globalCompositeOperation = "screen";
			const flareY = cy;
			const streakH = Math.max(24, canvasHeight * 0.14 * intensity);
			const linGrad = ctx.createLinearGradient(
				0,
				flareY - streakH,
				0,
				flareY + streakH,
			);
			linGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
			linGrad.addColorStop(0.35, `rgba(56, 189, 248, ${intensity * 0.55})`);
			linGrad.addColorStop(0.5, `rgba(224, 242, 254, ${intensity * 0.92})`);
			linGrad.addColorStop(0.65, `rgba(99, 102, 241, ${intensity * 0.55})`);
			linGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
			ctx.fillStyle = linGrad;
			ctx.fillRect(0, flareY - streakH, canvasWidth, streakH * 2);

			const coreR = Math.max(canvasWidth, canvasHeight) * 0.35;
			const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
			coreGrad.addColorStop(0, `rgba(255, 255, 255, ${intensity * 0.85})`);
			coreGrad.addColorStop(0.35, `rgba(56, 189, 248, ${intensity * 0.5})`);
			coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = coreGrad;
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);
			break;
		}
		case "cube-3d-shade": {
			const vec = transitionFx.signedVector ?? 1;
			const shadeGrad = ctx.createLinearGradient(left, top, left + w, top);
			if (vec > 0) {
				shadeGrad.addColorStop(0, `rgba(255, 255, 255, ${intensity * 0.22})`);
				shadeGrad.addColorStop(1, `rgba(0, 0, 0, ${intensity * 0.62})`);
			} else {
				shadeGrad.addColorStop(0, `rgba(0, 0, 0, ${intensity * 0.62})`);
				shadeGrad.addColorStop(1, `rgba(255, 255, 255, ${intensity * 0.22})`);
			}
			ctx.fillStyle = shadeGrad;
			ctx.fillRect(left, top, w, h);
			break;
		}
		case "glitch-rgb-slice":
		case "vhs-tracking": {
			ctx.globalCompositeOperation = "screen";
			const barY = ((p * 3.7) % 1) * canvasHeight;
			const barH = Math.max(6, canvasHeight * 0.04 * intensity);
			ctx.fillStyle =
				transitionFx.kind === "glitch-rgb-slice"
					? `rgba(56, 189, 248, ${intensity * 0.42})`
					: `rgba(255, 255, 255, ${intensity * 0.35})`;
			ctx.fillRect(0, barY, canvasWidth, barH);
			break;
		}
		default:
			break;
	}

	ctx.restore();
}

function createBackingCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): OffscreenCanvas {
	if (typeof OffscreenCanvas === "undefined") {
		throw new Error("OffscreenCanvas is not supported in this environment");
	}
	return new OffscreenCanvas(width, height);
}

function ensurePersistentOffscreenCanvas({
	entry,
	label,
}: {
	entry: ExternalCacheEntry;
	label: string;
}): OffscreenCanvas {
	if (entry.source instanceof OffscreenCanvas) {
		return entry.source;
	}

	if (typeof OffscreenCanvas === "undefined") {
		throw new Error(`OffscreenCanvas is required for ${label}`);
	}

	if (!entry.backingCanvas) {
		entry.backingCanvas = new OffscreenCanvas(entry.width, entry.height);
	}
	const context = entry.backingCanvas.getContext("2d");
	if (!context) {
		throw new Error(`Failed to get 2d context for ${label}`);
	}
	context.clearRect(0, 0, entry.width, entry.height);
	context.drawImage(entry.source, 0, 0, entry.width, entry.height);
	return entry.backingCanvas;
}
