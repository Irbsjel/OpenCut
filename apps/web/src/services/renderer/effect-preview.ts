import { createCanvasSurface } from "./canvas-utils";
import { effectsRegistry, resolveEffectPasses } from "@/effects";
import { GAUSSIAN_BLUR_SHADER } from "@/effects/definitions/blur";
import { buildDefaultParamValues } from "@/params/registry";
import type { ParamValues } from "@/params";
import { gpuRenderer, isGpuAvailable } from "./gpu-renderer";

const PREVIEW_SIZE = 160;
const PREVIEW_IMAGE_PATH = "/videos/effects/preview.jpg";

class EffectPreviewService {
	private testSourceCanvas: OffscreenCanvas | null = null;
	private previewImageElement: HTMLImageElement | null = null;
	private onReadyCallbacks = new Set<() => void>();

	readonly PREVIEW_SIZE = PREVIEW_SIZE;

	constructor() {
		this.loadPreviewImage();
	}

	onPreviewImageReady({ callback }: { callback: () => void }): () => void {
		this.onReadyCallbacks.add(callback);
		return () => this.onReadyCallbacks.delete(callback);
	}

	renderPreview({
		effectType,
		params,
		targetCanvas,
		uniformDimensions,
	}: {
		effectType: string;
		params: ParamValues;
		targetCanvas: HTMLCanvasElement;
		uniformDimensions?: { width: number; height: number };
	}): void {
		const size = PREVIEW_SIZE;
		const targetCtx = targetCanvas.getContext(
			"2d",
		) as CanvasRenderingContext2D | null;
		if (!targetCtx) {
			return;
		}

		targetCanvas.width = size;
		targetCanvas.height = size;

		const source = this.getTestSource({ width: size, height: size });
		if (!source) {
			targetCtx.clearRect(0, 0, size, size);
			return;
		}

		try {
			const definition = effectsRegistry.get(effectType);
			const resolvedParams =
				Object.keys(params).length > 0
					? params
					: buildDefaultParamValues(definition.params);

			const passes = resolveEffectPasses({
				definition,
				effectParams: resolvedParams,
				width: uniformDimensions?.width ?? size,
				height: uniformDimensions?.height ?? size,
			});
			const result = this.applyGpuEffect({
				source,
				width: size,
				height: size,
				passes,
			});

			targetCtx.drawImage(result, 0, 0, size, size);
		} catch (error) {
			console.warn("Failed to render effect preview", { effectType, error });
			targetCtx.clearRect(0, 0, size, size);
			targetCtx.drawImage(source, 0, 0, size, size);
		}
	}

	private loadPreviewImage(): void {
		if (typeof window === "undefined") return;
		const image = new Image();
		image.onload = () => {
			this.testSourceCanvas = null;
			for (const callback of this.onReadyCallbacks) {
				callback();
			}
		};
		image.src = PREVIEW_IMAGE_PATH;
		this.previewImageElement = image;
	}

	private createTestSource({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): OffscreenCanvas {
		const { canvas, context } = createCanvasSurface({ width, height });
		const isImageReady =
			this.previewImageElement?.complete &&
			(this.previewImageElement.naturalWidth ?? 0) > 0;
		if (isImageReady && this.previewImageElement) {
			context.drawImage(this.previewImageElement, 0, 0, width, height);
			return canvas;
		}

		// Procedural fallback when /videos/effects/preview.jpg is unavailable
		const gradient = context.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, "#1d4ed8");
		gradient.addColorStop(0.5, "#7c3aed");
		gradient.addColorStop(1, "#db2777");
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

		context.fillStyle = "rgba(255, 255, 255, 0.9)";
		context.beginPath();
		context.arc(width * 0.35, height * 0.4, width * 0.18, 0, Math.PI * 2);
		context.fill();

		context.fillStyle = "rgba(255, 255, 255, 0.75)";
		context.fillRect(width * 0.48, height * 0.45, width * 0.34, height * 0.34);

		return canvas;
	}

	private getTestSource({
		width,
		height,
	}: {
		width: number;
		height: number;
	}): OffscreenCanvas {
		if (
			!this.testSourceCanvas ||
			this.testSourceCanvas.width !== width ||
			this.testSourceCanvas.height !== height
		) {
			this.testSourceCanvas = this.createTestSource({ width, height });
		}
		return this.testSourceCanvas;
	}

	private applyGpuEffect({
		source,
		width,
		height,
		passes,
	}: {
		source: OffscreenCanvas;
		width: number;
		height: number;
		passes: ReturnType<typeof resolveEffectPasses>;
	}): OffscreenCanvas {
		if (isGpuAvailable()) {
			return gpuRenderer.applyEffect({
				source,
				width,
				height,
				passes,
			});
		}

		let sigmaXSq = 0;
		for (const pass of passes) {
			if (pass.shader !== GAUSSIAN_BLUR_SHADER) continue;
			const sigma = typeof pass.uniforms.u_sigma === "number" ? pass.uniforms.u_sigma : 0;
			const dir = pass.uniforms.u_direction;
			if (Array.isArray(dir) && dir[0] === 1) {
				sigmaXSq += sigma * sigma;
			}
		}
		const blurPx = Math.sqrt(sigmaXSq);
		if (blurPx < 0.1) return source;

		const { canvas, context } = createCanvasSurface({ width, height });
		context.filter = `blur(${blurPx.toFixed(2)}px)`;
		context.drawImage(source, 0, 0, width, height);
		context.filter = "none";
		return canvas;
	}
}

export const effectPreviewService = new EffectPreviewService();
