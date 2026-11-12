import { trimPreviewFrames } from "./preview-budget";
import { seekExportVideo } from "./export-seek";
import {
	ALL_FORMATS,
	BlobSource,
	EncodedPacketSink,
	Input,
	VideoSampleSink,
	type EncodedPacket,
	type InputVideoTrack,
	type Rotation,
	type VideoSample,
	type WrappedCanvas,
} from "mediabunny";
import type { AnyBaseNode } from "@/services/renderer/nodes/base-node";
import { VideoNode } from "@/services/renderer/nodes/video-node";

const MAX_DECODE_DIMENSION = 640;
const EXPORT_DECODE_DIMENSION = 1280;
const BASE_CACHE_FPS = 30;
const MAX_SCRUB_CACHE_FRAMES = 24;
const MAX_PREVIEW_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_RESIDENT_VIDEO_SINKS = 8;
const RING_BUFFER_SIZE = 3;
const MAX_ACTIVE_EXPORT_DECODERS = 4;

let nextFrameRevision = 1;
function stampCanvasRevision(
	canvas: HTMLCanvasElement | OffscreenCanvas | HTMLVideoElement,
): void {
	(canvas as unknown as { __frameRevision?: number }).__frameRevision =
		++nextFrameRevision;
}

export type PreviewVideoFrame = Omit<WrappedCanvas, "canvas"> & {
	canvas: HTMLCanvasElement | OffscreenCanvas | HTMLVideoElement;
};

export interface DiscoveredVideoMetadata {
	mediaId: string;
	duration: number;
	width: number;
	height: number;
	thumbnailDataUrl?: string;
	isIntrinsic: boolean;
}

interface VideoPlayerSlot {
	slotIndex: number;
	videoEl: HTMLVideoElement;
	ringCanvases: HTMLCanvasElement[];
	ringCtxs: Array<CanvasRenderingContext2D | null>;
	ringCursor: number;
	lastDrawnMediaTime: number;
	lastFrame: WrappedCanvas | null;
	lastTargetTime: number;
	lastRequestWallMs: number;
	estimatedRate: number;
	seekInFlight: Promise<WrappedCanvas | null> | null;
	seekTargetTime: number;
	prerollTargetTime: number;
}

interface InternalSampleDecoder {
	getDecodeQueueSize(): number;
	decode(packet: EncodedPacket): void;
	flush(): Promise<void>;
	close(): void;
	inputTimestamps?: number[];
	decoder?: VideoDecoder | null;
}

interface ExportDecoderState {
	input: Input;
	videoTrack: InputVideoTrack;
	packetSink: EncodedPacketSink;
	sampleSink: VideoSampleSink;
	decoder: InternalSampleDecoder | null;
	exportW: number;
	exportH: number;
	rotation: Rotation;
	currentPacket: EncodedPacket | null;
	packetsEnded: boolean;
	decodeFloorTime: number;
	preRollFrame: WrappedCanvas | null;
	decodedFrames: WrappedCanvas[];
	freeCanvases: HTMLCanvasElement[];
	lastRequestedTime: number;
	lastUsedWallMs: number;
	decoderError: Error | null;
	notifyWaiter: (() => void) | null;
}

interface VideoSinkData {
	mediaId: string;
	rawBlob: Blob;
	slots: [VideoPlayerSlot, VideoPlayerSlot];
	exportVideo: HTMLVideoElement | null;
	exportDecoderState: ExportDecoderState | null;
	exportSinkFailed: boolean;
	exportCanvases: HTMLCanvasElement[];
	exportCtxs: Array<CanvasRenderingContext2D | null>;
	exportRingCursor: number;
	lastExportRequestedTime: number;
	lastExportFrame: WrappedCanvas | null;
	objectUrl: string;
	intrinsicWidth: number;
	intrinsicHeight: number;
	hasIntrinsicMetadata: boolean;
	metadataDispatched: boolean;
	thumbnailDataUrl?: string;
	targetWidth: number;
	targetHeight: number;
	currentFrame: WrappedCanvas | null;
	duration: number;
	fps: number;
	frameStep: number;
	scrubCache: Map<number, WrappedCanvas>;
	disposed: boolean;
	lastUsedWallMs: number;
}

function computeTargetDimensions({
	width,
	height,
	maxOverride,
}: {
	width: number;
	height: number;
	maxOverride?: number;
}): { targetWidth: number; targetHeight: number } {
	const safeW = Math.max(2, width);
	const safeH = Math.max(2, height);
	const maxDim = maxOverride ?? MAX_DECODE_DIMENSION;
	const decodeScale = Math.min(1, maxDim / Math.max(safeW, safeH));
	const rawW = Math.max(2, Math.round(safeW * decodeScale));
	const rawH = Math.max(2, Math.round(safeH * decodeScale));
	const targetWidth = rawW % 2 === 0 ? rawW : rawW + 1;
	const targetHeight = rawH % 2 === 0 ? rawH : rawH + 1;
	return { targetWidth, targetHeight };
}

let hiddenVideoContainer: HTMLDivElement | null = null;
function getHiddenVideoContainer(): HTMLDivElement | null {
	if (typeof document === "undefined") return null;
	if (hiddenVideoContainer && hiddenVideoContainer.isConnected) {
		return hiddenVideoContainer;
	}
	const div = document.createElement("div");
	div.setAttribute("data-opencut-video-pool", "true");
	div.style.cssText =
		"position:fixed;left:-9999px;top:-9999px;width:8px;height:8px;opacity:0.01;pointer-events:none;overflow:hidden;z-index:-1;";
	document.body?.appendChild(div);
	hiddenVideoContainer = div;
	return div;
}

function createHiddenVideoElement(objectUrl: string): HTMLVideoElement {
	const v = document.createElement("video");
	v.muted = true;
	v.playsInline = true;
	v.preload = "auto";
	v.crossOrigin = "anonymous";
	v.width = 16;
	v.height = 16;
	v.src = objectUrl;
	getHiddenVideoContainer()?.appendChild(v);
	return v;
}

function createPlayerSlot(
	slotIndex: number,
	videoEl: HTMLVideoElement,
): VideoPlayerSlot {
	return {
		slotIndex,
		videoEl,
		ringCanvases: [],
		ringCtxs: [],
		ringCursor: 0,
		lastDrawnMediaTime: -1,
		lastFrame: null,
		lastTargetTime: -1,
		lastRequestWallMs: 0,
		estimatedRate: 1.0,
		seekInFlight: null,
		seekTargetTime: -1,
		prerollTargetTime: -1,
	};
}

export class VideoCache {
	private sinks = new Map<string, VideoSinkData>();
	private initPromises = new Map<string, Promise<void>>();
	private dirtyAfterAsyncSeek = false;
	private exportMode = false;
	private playbackActive = false;
	private watchdogTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		if (typeof window !== "undefined") {
			this.watchdogTimer = setInterval(() => {
				this.pauseIdlePlayers();
			}, 220);
		}
	}

	setPlaybackActive(active: boolean): void {
		if (this.playbackActive === active) return;
		this.playbackActive = active;
		if (!active) {
			for (const sinkData of this.sinks.values()) {
				for (const slot of sinkData.slots) {
					if (!slot.videoEl.paused) {
						try {
							slot.videoEl.pause();
						} catch {
							// ignore
						}
					}
				}
			}
		}
	}

	isPlaybackActive(): boolean {
		return this.playbackActive && !this.exportMode;
	}

	setExportMode(enabled: boolean): void {
		this.exportMode = enabled;
		for (const sinkData of this.sinks.values()) {
			sinkData.lastExportRequestedTime = -1;
			sinkData.lastExportFrame = null;
			if (!enabled) {
				this.disposeExportDecoderState(sinkData);
			}
			for (const slot of sinkData.slots) {
				if (!slot.videoEl.paused) {
					try {
						slot.videoEl.pause();
					} catch {
						// ignore
					}
				}
			}
		}
		if (enabled) {
			this.dirtyAfterAsyncSeek = false;
		}
	}

	isExporting(): boolean {
		return this.exportMode;
	}

	markDirty(): void {
		if (this.exportMode) return;
		this.dirtyAfterAsyncSeek = true;
	}

	consumeDirtyFlag(): boolean {
		if (this.exportMode) return false;
		if (!this.dirtyAfterAsyncSeek) return false;
		this.dirtyAfterAsyncSeek = false;
		return true;
	}

	private pauseIdlePlayers(): void {
		this.evictIdleVideoSinks();
		const nowWall =
			typeof performance !== "undefined" ? performance.now() : Date.now();
		for (const sinkData of this.sinks.values()) {
			if (sinkData.disposed) continue;
			for (const slot of sinkData.slots) {
				if (
					!slot.videoEl.paused &&
					((!this.playbackActive && !this.exportMode) ||
						nowWall - slot.lastRequestWallMs > 320)
				) {
					try {
						slot.videoEl.pause();
					} catch {
						// ignore
					}
				}
			}
		}
	}

	private evictIdleVideoSinks(): void {
		if (this.sinks.size < MAX_RESIDENT_VIDEO_SINKS) return;
		const now = performance.now();
		const candidates = [...this.sinks.values()]
			.filter(
				(s) =>
					now - s.lastUsedWallMs > 2500 &&
					s.slots.every((slot) => !slot.seekInFlight),
			)
			.sort((a, b) => a.lastUsedWallMs - b.lastUsedWallMs);
		for (const sink of candidates) {
			if (this.sinks.size < MAX_RESIDENT_VIDEO_SINKS) break;
			this.clearVideoSink({ mediaId: sink.mediaId });
		}
	}

	getDiscoveredMetadata(): DiscoveredVideoMetadata[] {
		const list: DiscoveredVideoMetadata[] = [];
		for (const s of this.sinks.values()) {
			if (
				!s.disposed &&
				s.hasIntrinsicMetadata &&
				s.intrinsicWidth > 0 &&
				s.intrinsicHeight > 0
			) {
				list.push({
					mediaId: s.mediaId,
					duration: s.duration,
					width: s.intrinsicWidth,
					height: s.intrinsicHeight,
					thumbnailDataUrl: s.thumbnailDataUrl,
					isIntrinsic: true,
				});
			}
		}
		return list;
	}

	prerollAt({
		mediaId,
		file,
		time,
		leadTimeSec,
	}: {
		mediaId: string;
		file: File;
		time: number;
		leadTimeSec?: number;
	}): void {
		if (this.exportMode) return;
		const sinkData = this.sinks.get(mediaId);
		if (!sinkData) {
			void this.ensureSink({ mediaId, file });
			return;
		}
		if (sinkData.disposed) return;

		sinkData.lastUsedWallMs = performance.now();
		const clampedTime =
			sinkData.duration > 0
				? Math.max(
						0,
						Math.min(
							time,
							Math.max(0, sinkData.duration - sinkData.frameStep * 0.35),
						),
					)
				: Math.max(0, time);

		const nowWall =
			typeof performance !== "undefined" ? performance.now() : Date.now();

		// If any active slot is already playing into clampedTime, do not touch idle slots
		for (const slot of sinkData.slots) {
			if (
				!slot.videoEl.paused &&
				Math.abs(slot.videoEl.currentTime - clampedTime) <= 0.45
			) {
				return;
			}
		}

		// Check if any idle slot is already positioned near clampedTime
		for (const slot of sinkData.slots) {
			const isSlotBusy = nowWall - slot.lastRequestWallMs <= 180;
			if (isSlotBusy) continue;

			if (Math.abs(slot.videoEl.currentTime - clampedTime) <= 0.12) {
				if (
					slot.videoEl.readyState >= 2 &&
					(!slot.lastFrame ||
						Math.abs(slot.lastDrawnMediaTime - clampedTime) > 0.05)
				) {
					this.drawSlotFrame(sinkData, slot, slot.videoEl.currentTime, true);
				}
				// Warm-start hardware decoder right before the clip junction (within 85ms) so there is zero play() spin-up pause at the cut!
				if (
					this.playbackActive &&
					leadTimeSec !== undefined &&
					leadTimeSec <= 0.085 &&
					slot.videoEl.paused &&
					!slot.videoEl.seeking &&
					slot.videoEl.readyState >= 2
				) {
					slot.prerollTargetTime = clampedTime;
					slot.videoEl.playbackRate = 1.0;
					slot.videoEl.play().catch(() => {});
				}
				return;
			}

			if (
				Math.abs(slot.prerollTargetTime - clampedTime) <= 0.12 ||
				(slot.seekInFlight &&
					Math.abs(slot.seekTargetTime - clampedTime) <= 0.12)
			) {
				return;
			}
		}

		// Find an idle slot (not actively rendering within the last 160ms)
		const idleSlot = sinkData.slots.find(
			(s) =>
				nowWall - s.lastRequestWallMs > 160 &&
				s.seekInFlight === null &&
				s.videoEl.paused,
		);
		if (!idleSlot) return;

		idleSlot.prerollTargetTime = clampedTime;
		try {
			const seekDest =
				clampedTime === 0 && idleSlot.videoEl.currentTime === 0
					? 0.001
					: clampedTime;
			const onSeeked = () => {
				if (!sinkData.disposed && idleSlot.videoEl.readyState >= 2) {
					this.drawSlotFrame(
						sinkData,
						idleSlot,
						idleSlot.videoEl.currentTime,
						true,
					);
				}
			};
			idleSlot.videoEl.addEventListener("seeked", onSeeked, { once: true });
			idleSlot.videoEl.currentTime = seekDest;
			if (!idleSlot.videoEl.seeking && idleSlot.videoEl.readyState >= 2) {
				idleSlot.videoEl.removeEventListener("seeked", onSeeked);
				this.drawSlotFrame(
					sinkData,
					idleSlot,
					idleSlot.videoEl.currentTime,
					true,
				);
			}
		} catch {
			// ignore
		}
	}

	getFrameAt(params: {
		mediaId: string;
		file: File;
		time: number;
	}): Promise<WrappedCanvas | null>;
	getFrameAt(params: {
		mediaId: string;
		file: File;
		time: number;
		directPreview: boolean;
	}): Promise<PreviewVideoFrame | null>;
	async getFrameAt({
		mediaId,
		file,
		time,
		directPreview = false,
	}: {
		mediaId: string;
		file: File;
		time: number;
		directPreview?: boolean;
	}): Promise<PreviewVideoFrame | null> {
		await this.ensureSink({ mediaId, file });

		const sinkData = this.sinks.get(mediaId);
		if (!sinkData || sinkData.disposed) return null;

		sinkData.lastUsedWallMs = performance.now();
		const clampedTime =
			sinkData.duration > 0
				? Math.max(
						0,
						Math.min(
							time,
							Math.max(0, sinkData.duration - sinkData.frameStep * 0.35),
						),
					)
				: Math.max(0, time);
		const targetIdx = Math.round(clampedTime / sinkData.frameStep);

		// 1. Deterministic frame-accurate path during video export
		if (this.exportMode) {
			let exportFrame: WrappedCanvas | null;
			try {
				exportFrame = await this.obtainExactExportFrame(sinkData, clampedTime);
			} catch (error) {
				throw new Error(
					`No se pudo exportar «${file.name}» en ${clampedTime.toFixed(3)} s: ${String(error)}`,
				);
			}
			if (!exportFrame)
				throw new Error(
					`No se pudo obtener un cuadro de ${file.name} en ${clampedTime.toFixed(3)} s`,
				);
			sinkData.currentFrame = exportFrame;
			return exportFrame;
		}

		const nowWall =
			typeof performance !== "undefined" ? performance.now() : Date.now();
		const slot = this.selectSlotForTime(sinkData, clampedTime, nowWall);

		// Instant deduplication when BlurBackgroundNode and VideoNode request the same timestamp on the same tick
		if (
			slot.lastFrame &&
			!slot.seekInFlight &&
			Math.abs(clampedTime - slot.lastFrame.timestamp) < 0.02 &&
			Math.abs(slot.lastDrawnMediaTime - clampedTime) < 0.35 &&
			nowWall - slot.lastRequestWallMs < 16
		) {
			return slot.lastFrame;
		}

		const dtWallSec = (nowWall - slot.lastRequestWallMs) / 1000;
		const dtMediaSec = clampedTime - slot.lastTargetTime;
		const isSequentialForward =
			slot.lastTargetTime >= 0 &&
			dtMediaSec >= -0.015 &&
			dtMediaSec <= 0.35 &&
			dtWallSec >= 0 &&
			dtWallSec <= 0.32;

		if (isSequentialForward && dtWallSec >= 0.006 && dtMediaSec > 0.001) {
			const instRate = Math.max(0.25, Math.min(4.0, dtMediaSec / dtWallSec));
			slot.estimatedRate = slot.estimatedRate * 0.7 + instRate * 0.3;
		} else if (!isSequentialForward) {
			slot.estimatedRate = 1.0;
		}

		slot.lastTargetTime = clampedTime;
		slot.lastRequestWallMs = nowWall;

		const isLivePlayback = this.playbackActive || isSequentialForward;

		// 2. LIVE HARDWARE PLAYBACK FAST PATH (0.2ms synchronous, PLL-locked <video> decoder)
		if (isLivePlayback) {
			const v = slot.videoEl;
			const drift = v.currentTime - clampedTime;
			if (!v.seeking && v.readyState >= 2 && Math.abs(drift) <= 0.55) {
				if (v.paused) {
					v.playbackRate = slot.estimatedRate;
					v.play().catch(() => {});
				} else {
					const rateAdjust =
						Math.abs(drift) <= 0.03
							? 1.0
							: Math.max(0.55, Math.min(1.65, 1.0 - drift * 1.6));
					const desiredRate = Math.max(
						0.25,
						Math.min(4.0, slot.estimatedRate * rateAdjust),
					);
					if (Math.abs(v.playbackRate - desiredRate) > 0.03) {
						v.playbackRate = desiredRate;
					}
				}

				if (directPreview && this.playbackActive) {
					// Sample the live native decoder directly in the compositor. The
					// intermediate video -> canvas copy dominates CPU on older machines.
					this.syncSinkDimensionsFromVideo(sinkData, v);
					if (v.width !== sinkData.targetWidth) v.width = sinkData.targetWidth;
					if (v.height !== sinkData.targetHeight)
						v.height = sinkData.targetHeight;
					if (!sinkData.metadataDispatched)
						this.emitIntrinsicMetadataIfNeeded(sinkData);
					stampCanvasRevision(v);
					return {
						canvas: v,
						timestamp: clampedTime,
						duration: sinkData.frameStep,
					};
				}

				const liveFrame = this.drawSlotFrame(
					sinkData,
					slot,
					clampedTime,
					false,
				);
				if (liveFrame) {
					sinkData.currentFrame = liveFrame;
					return liveFrame;
				}
			}

			// Need to seek slot to clampedTime and immediately start playing
			const soughtLive = await this.seekSlotAndPlay(
				sinkData,
				slot,
				clampedTime,
				targetIdx,
				true,
			);
			if (soughtLive) {
				sinkData.currentFrame = soughtLive;
				return soughtLive;
			}
			return slot.lastFrame ?? sinkData.currentFrame;
		}

		// 3. PAUSED / SCRUBBING PATH: Check LRU scrubCache first
		const cachedScrub = sinkData.scrubCache.get(targetIdx);
		if (cachedScrub) {
			sinkData.currentFrame = cachedScrub;
			return cachedScrub;
		}

		// If slot is already sitting at clampedTime while paused
		if (
			!slot.videoEl.seeking &&
			slot.videoEl.readyState >= 2 &&
			Math.abs(slot.videoEl.currentTime - clampedTime) <=
				sinkData.frameStep * 0.85
		) {
			const frame = this.drawSlotFrame(sinkData, slot, clampedTime, true);
			if (frame) {
				this.storeScrubCache(sinkData, targetIdx, frame);
				sinkData.currentFrame = frame;
				return frame;
			}
		}

		const soughtScrub = await this.seekSlotAndPlay(
			sinkData,
			slot,
			clampedTime,
			targetIdx,
			false,
		);
		if (soughtScrub) {
			sinkData.currentFrame = soughtScrub;
			return soughtScrub;
		}

		return slot.lastFrame ?? sinkData.currentFrame;
	}

	private selectSlotForTime(
		sinkData: VideoSinkData,
		clampedTime: number,
		nowWall: number,
	): VideoPlayerSlot {
		const [s0, s1] = sinkData.slots;

		// 1. Prefer a slot whose hardware decoder is ALREADY playing near clampedTime
		const s0PlayingNear =
			!s0.videoEl.paused &&
			Math.abs(s0.videoEl.currentTime - clampedTime) <= 0.45;
		const s1PlayingNear =
			!s1.videoEl.paused &&
			Math.abs(s1.videoEl.currentTime - clampedTime) <= 0.45;
		if (s0PlayingNear && !s1PlayingNear) return s0;
		if (s1PlayingNear && !s0PlayingNear) return s1;

		// 2. If a slot was actively tracking this clip stream within the last 400ms
		const s0Tracking =
			nowWall - s0.lastRequestWallMs <= 400 &&
			Math.abs(s0.lastTargetTime - clampedTime) <= 0.48;
		const s1Tracking =
			nowWall - s1.lastRequestWallMs <= 400 &&
			Math.abs(s1.lastTargetTime - clampedTime) <= 0.48;
		if (s0Tracking && !s1Tracking) return s0;
		if (s1Tracking && !s0Tracking) return s1;

		// 3. If one of the slots is already pre-rolled / positioned near clampedTime
		const d0 = Math.abs(s0.videoEl.currentTime - clampedTime);
		const d1 = Math.abs(s1.videoEl.currentTime - clampedTime);
		if (d0 <= 0.3 && d1 > 0.3) return s0;
		if (d1 <= 0.3 && d0 > 0.3) return s1;

		// 4. Pick whichever slot is not currently busy with another clip stream
		const s0Busy = nowWall - s0.lastRequestWallMs <= 180;
		const s1Busy = nowWall - s1.lastRequestWallMs <= 180;
		if (s0Busy && !s1Busy) return s1;
		if (s1Busy && !s0Busy) return s0;

		return d0 <= d1 ? s0 : s1;
	}

	private drawSlotFrame(
		sinkData: VideoSinkData,
		slot: VideoPlayerSlot,
		timestamp: number,
		forceRedraw: boolean,
	): WrappedCanvas | null {
		const v = slot.videoEl;
		if (v.readyState < 2) return slot.lastFrame;

		const dimsChanged = this.syncSinkDimensionsFromVideo(sinkData, v);
		const { targetWidth, targetHeight, frameStep } = sinkData;
		if (targetWidth <= 0 || targetHeight <= 0) return slot.lastFrame;

		const mediaTime = v.currentTime;
		// Reuse current ring canvas if video decoder is still on the exact same media frame
		if (
			!forceRedraw &&
			!dimsChanged &&
			slot.lastFrame &&
			slot.lastFrame.canvas.width === targetWidth &&
			slot.lastFrame.canvas.height === targetHeight &&
			Math.abs(mediaTime - slot.lastDrawnMediaTime) < 0.006
		) {
			return slot.lastFrame;
		}

		slot.ringCursor = (slot.ringCursor + 1) % RING_BUFFER_SIZE;
		let canvas = slot.ringCanvases[slot.ringCursor];
		let ctx = slot.ringCtxs[slot.ringCursor] ?? null;

		if (
			!canvas ||
			canvas.width !== targetWidth ||
			canvas.height !== targetHeight ||
			!ctx
		) {
			canvas = document.createElement("canvas");
			canvas.width = targetWidth;
			canvas.height = targetHeight;
			ctx = canvas.getContext("2d", { alpha: false });
			slot.ringCanvases[slot.ringCursor] = canvas;
			slot.ringCtxs[slot.ringCursor] = ctx;
		}
		if (!ctx) return slot.lastFrame;

		try {
			ctx.drawImage(v, 0, 0, targetWidth, targetHeight);
		} catch {
			return slot.lastFrame;
		}

		stampCanvasRevision(canvas);
		slot.lastDrawnMediaTime = mediaTime;
		const wrapped: WrappedCanvas = {
			canvas,
			timestamp,
			duration: frameStep,
		};
		slot.lastFrame = wrapped;

		if (dimsChanged || !sinkData.metadataDispatched) {
			this.emitIntrinsicMetadataIfNeeded(sinkData, canvas);
		}

		return wrapped;
	}

	private storeScrubCache(
		sinkData: VideoSinkData,
		targetIdx: number,
		frame: WrappedCanvas,
	): void {
		if (sinkData.scrubCache.has(targetIdx)) return;
		if (sinkData.scrubCache.size >= MAX_SCRUB_CACHE_FRAMES) {
			const oldestKey = sinkData.scrubCache.keys().next().value;
			if (oldestKey !== undefined) {
				sinkData.scrubCache.delete(oldestKey);
			}
		}
		const copyCanvas = document.createElement("canvas");
		copyCanvas.width = frame.canvas.width;
		copyCanvas.height = frame.canvas.height;
		const copyCtx = copyCanvas.getContext("2d", { alpha: false });
		if (!copyCtx) return;
		try {
			copyCtx.drawImage(frame.canvas, 0, 0);
			stampCanvasRevision(copyCanvas);
			sinkData.scrubCache.set(targetIdx, {
				canvas: copyCanvas,
				timestamp: frame.timestamp,
				duration: frame.duration,
			});
			trimPreviewFrames(this.sinks.values(), MAX_PREVIEW_CACHE_BYTES);
		} catch {
			// ignore
		}
	}

	private async seekSlotAndPlay(
		sinkData: VideoSinkData,
		slot: VideoPlayerSlot,
		targetTime: number,
		targetIdx: number,
		shouldPlayAfterSeek: boolean,
	): Promise<WrappedCanvas | null> {
		if (sinkData.disposed) return null;

		const v = slot.videoEl;

		// If a seek is already in flight on this slot to a nearby timestamp, do NOT cancel it!
		if (slot.seekInFlight) {
			const tolerance = shouldPlayAfterSeek ? 0.75 : 0.12;
			if (Math.abs(slot.seekTargetTime - targetTime) <= tolerance) {
				if (shouldPlayAfterSeek) {
					const raced = await Promise.race([
						slot.seekInFlight,
						new Promise<null>((r) => setTimeout(() => r(null), 28)),
					]);
					return raced ?? slot.lastFrame ?? sinkData.currentFrame;
				}
				return slot.seekInFlight;
			}
			await Promise.race([
				slot.seekInFlight,
				new Promise((r) => setTimeout(r, shouldPlayAfterSeek ? 35 : 160)),
			]);
		}

		const seekDest = shouldPlayAfterSeek
			? sinkData.duration > 0
				? Math.min(
						Math.max(0, sinkData.duration - sinkData.frameStep * 0.35),
						targetTime + 0.025,
					)
				: targetTime + 0.025
			: targetTime;

		slot.seekTargetTime = seekDest;

		let seekPromise: Promise<WrappedCanvas | null> | null = null;
		seekPromise = (async (): Promise<WrappedCanvas | null> => {
			try {
				if (!v.paused) {
					try {
						v.pause();
					} catch {
						// ignore
					}
				}

				if (v.readyState < 2) {
					await new Promise<void>((resolve) => {
						const t = setTimeout(resolve, 320);
						const onReady = () => {
							if (v.readyState >= 2) {
								clearTimeout(t);
								resolve();
							}
						};
						v.addEventListener("loadeddata", onReady, { once: true });
						v.addEventListener("canplay", onReady, { once: true });
					});
				}

				if (Math.abs(v.currentTime - seekDest) > 0.015) {
					await new Promise<void>((resolve) => {
						const t = setTimeout(resolve, shouldPlayAfterSeek ? 180 : 260);
						v.addEventListener(
							"seeked",
							() => {
								clearTimeout(t);
								resolve();
							},
							{ once: true },
						);
						try {
							v.currentTime = seekDest;
						} catch {
							clearTimeout(t);
							resolve();
						}
					});
				}

				if (sinkData.disposed) return null;

				const captured =
					v.readyState >= 2
						? this.drawSlotFrame(sinkData, slot, v.currentTime, true)
						: null;

				if (captured) {
					sinkData.currentFrame = captured;
					if (!shouldPlayAfterSeek) {
						this.storeScrubCache(sinkData, targetIdx, captured);
					}
				}

				// Always start hardware playback immediately if timeline is playing
				if (
					(shouldPlayAfterSeek || this.playbackActive) &&
					!this.exportMode &&
					!sinkData.disposed
				) {
					v.playbackRate = slot.estimatedRate;
					v.play().catch(() => {});
				}

				if (!this.exportMode && captured) {
					this.dirtyAfterAsyncSeek = true;
					if (typeof window !== "undefined") {
						window.dispatchEvent(
							new CustomEvent("opencut-video-frame-ready", {
								detail: { mediaId: sinkData.mediaId },
							}),
						);
					}
				}

				return captured;
			} finally {
				if (slot.seekInFlight === seekPromise) {
					slot.seekInFlight = null;
				}
			}
		})();

		slot.seekInFlight = seekPromise;

		if (shouldPlayAfterSeek) {
			const fastResult = await Promise.race([
				seekPromise,
				new Promise<null>((r) => setTimeout(() => r(null), 42)),
			]);
			return fastResult ?? slot.lastFrame ?? sinkData.currentFrame;
		}

		return seekPromise;
	}

	private disposeExportDecoderState(sinkData: VideoSinkData): void {
		const state = sinkData.exportDecoderState;
		if (!state) return;
		sinkData.exportDecoderState = null;
		state.preRollFrame = null;
		state.decodedFrames.length = 0;
		state.freeCanvases.length = 0;
		if (state.notifyWaiter) {
			const wake = state.notifyWaiter;
			state.notifyWaiter = null;
			wake();
		}
		if (state.decoder) {
			try {
				state.decoder.close();
			} catch {
				// ignore
			}
			state.decoder = null;
		}
		try {
			state.input.dispose();
		} catch {
			// ignore
		}
	}

	private evictOldestExportDecoderIfNeeded(activeMediaId: string): void {
		const activeSinks: VideoSinkData[] = [];
		for (const s of this.sinks.values()) {
			if (s.exportDecoderState && s.mediaId !== activeMediaId) {
				activeSinks.push(s);
			}
		}
		if (activeSinks.length < MAX_ACTIVE_EXPORT_DECODERS) return;
		activeSinks.sort(
			(a, b) =>
				(a.exportDecoderState?.lastUsedWallMs ?? 0) -
				(b.exportDecoderState?.lastUsedWallMs ?? 0),
		);
		while (activeSinks.length >= MAX_ACTIVE_EXPORT_DECODERS) {
			const oldest = activeSinks.shift();
			if (oldest) {
				this.disposeExportDecoderState(oldest);
			}
		}
	}

	private getExactSampleTimestamp(sample: VideoSample): number {
		const rawData = (
			sample as unknown as {
				_data?: { timestamp?: number };
			}
		)._data;
		if (
			rawData &&
			typeof rawData.timestamp === "number" &&
			Number.isFinite(rawData.timestamp)
		) {
			return rawData.timestamp / 1_000_000;
		}
		return sample.timestamp;
	}

	private drawSampleToPreRoll(
		state: ExportDecoderState,
		sample: VideoSample,
		exactTimestamp: number,
		fallbackStep: number,
	): void {
		let canvas = state.preRollFrame?.canvas as HTMLCanvasElement | undefined;
		if (
			!canvas ||
			canvas.width !== state.exportW ||
			canvas.height !== state.exportH
		) {
			canvas = document.createElement("canvas");
			canvas.width = state.exportW;
			canvas.height = state.exportH;
		}
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) return;
		ctx.resetTransform();
		sample.drawWithFit(ctx, {
			fit: "fill",
			rotation: state.rotation,
		});
		stampCanvasRevision(canvas);
		state.preRollFrame = {
			canvas,
			timestamp: exactTimestamp,
			duration: Math.max(0.016, sample.duration || fallbackStep),
		};
	}

	private drawSampleToExportPool(
		state: ExportDecoderState,
		sample: VideoSample,
		exactTimestamp: number,
		fallbackStep: number,
	): void {
		let canvas = state.freeCanvases.pop();
		if (
			!canvas ||
			canvas.width !== state.exportW ||
			canvas.height !== state.exportH
		) {
			canvas = document.createElement("canvas");
			canvas.width = state.exportW;
			canvas.height = state.exportH;
		}
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) return;
		ctx.resetTransform();
		sample.drawWithFit(ctx, {
			fit: "fill",
			rotation: state.rotation,
		});
		stampCanvasRevision(canvas);
		const frameItem: WrappedCanvas = {
			canvas,
			timestamp: exactTimestamp,
			duration: Math.max(0.016, sample.duration || fallbackStep),
		};

		let insertIdx = state.decodedFrames.length;
		while (
			insertIdx > 0 &&
			state.decodedFrames[insertIdx - 1]!.timestamp > exactTimestamp + 0.0005
		) {
			insertIdx--;
		}
		if (
			insertIdx > 0 &&
			Math.abs(
				state.decodedFrames[insertIdx - 1]!.timestamp - exactTimestamp,
			) <= 0.0005
		) {
			const old = state.decodedFrames[insertIdx - 1]!;
			state.freeCanvases.push(old.canvas as HTMLCanvasElement);
			state.decodedFrames[insertIdx - 1] = frameItem;
		} else {
			state.decodedFrames.splice(insertIdx, 0, frameItem);
		}
	}

	private async createExportDecoderInstance(
		sinkData: VideoSinkData,
		state: ExportDecoderState,
	): Promise<InternalSampleDecoder> {
		const createDecoderFn = (
			state.sampleSink as unknown as {
				_createDecoder: (
					onSample: (sample: VideoSample) => void,
					onError: (error: Error) => void,
				) => Promise<InternalSampleDecoder>;
			}
		)._createDecoder;

		return createDecoderFn.call(
			state.sampleSink,
			(sample: VideoSample) => {
				try {
					if (sinkData.disposed || sinkData.exportDecoderState !== state) {
						return;
					}
					const exactTs = this.getExactSampleTimestamp(sample);
					if (exactTs < state.decodeFloorTime - 0.09) {
						if (
							exactTs >= state.decodeFloorTime - 0.35 ||
							state.preRollFrame === null
						) {
							this.drawSampleToPreRoll(
								state,
								sample,
								exactTs,
								sinkData.frameStep,
							);
						}
					} else {
						this.drawSampleToExportPool(
							state,
							sample,
							exactTs,
							sinkData.frameStep,
						);
					}
				} finally {
					try {
						sample.close();
					} catch {
						// ignore
					}
					if (state.notifyWaiter) {
						const wake = state.notifyWaiter;
						state.notifyWaiter = null;
						wake();
					}
				}
			},
			(error: Error) => {
				state.decoderError = error;
				if (state.notifyWaiter) {
					const wake = state.notifyWaiter;
					state.notifyWaiter = null;
					wake();
				}
			},
		);
	}

	private async obtainExactExportFrame(
		sinkData: VideoSinkData,
		targetTime: number,
	): Promise<WrappedCanvas | null> {
		if (sinkData.disposed) return null;

		const safeTarget =
			sinkData.duration > 0
				? Math.max(
						0,
						Math.min(targetTime, Math.max(0, sinkData.duration - 0.015)),
					)
				: Math.max(0, targetTime);

		// Same-tick deduplication (e.g. BlurBackgroundNode + VideoNode requesting identical timestamp)
		if (
			sinkData.lastExportFrame !== null &&
			sinkData.lastExportRequestedTime >= 0 &&
			Math.abs(sinkData.lastExportRequestedTime - safeTarget) < 0.0005
		) {
			return sinkData.lastExportFrame;
		}

		const nowWall =
			typeof performance !== "undefined" ? performance.now() : Date.now();

		// Fast Path: Direct EncodedPacketSink + VideoSampleSink decoder with immediate VideoSample.close()
		if (!sinkData.exportSinkFailed && typeof VideoDecoder !== "undefined") {
			if (!sinkData.exportDecoderState) {
				try {
					this.evictOldestExportDecoderIfNeeded(sinkData.mediaId);
					const input = new Input({
						source: new BlobSource(sinkData.rawBlob),
						formats: ALL_FORMATS,
					});
					const videoTrack = await input.getPrimaryVideoTrack();
					if (videoTrack && (await videoTrack.canDecode())) {
						if (sinkData.duration <= 0) {
							const computedDur = await videoTrack
								.computeDuration()
								.catch(() => 0);
							if (Number.isFinite(computedDur) && computedDur > 0) {
								sinkData.duration = computedDur;
							}
						}
						const { targetWidth: exportW, targetHeight: exportH } =
							computeTargetDimensions({
								width:
									videoTrack.displayWidth || sinkData.intrinsicWidth || 1280,
								height:
									videoTrack.displayHeight || sinkData.intrinsicHeight || 720,
								maxOverride: EXPORT_DECODE_DIMENSION,
							});
						const state: ExportDecoderState = {
							input,
							videoTrack,
							packetSink: new EncodedPacketSink(videoTrack),
							sampleSink: new VideoSampleSink(videoTrack),
							decoder: null,
							exportW,
							exportH,
							rotation: videoTrack.rotation,
							currentPacket: null,
							packetsEnded: false,
							decodeFloorTime: 0,
							preRollFrame: null,
							decodedFrames: [],
							freeCanvases: [],
							lastRequestedTime: -1,
							lastUsedWallMs: nowWall,
							decoderError: null,
							notifyWaiter: null,
						};
						state.decoder = await this.createExportDecoderInstance(
							sinkData,
							state,
						);
						sinkData.exportDecoderState = state;
					} else {
						input.dispose();
						sinkData.exportSinkFailed = true;
					}
				} catch {
					sinkData.exportSinkFailed = true;
				}
			}

			const state = sinkData.exportDecoderState;
			if (state && state.decoder) {
				try {
					state.lastUsedWallMs = nowWall;

					const needsSeek =
						state.lastRequestedTime < 0 ||
						safeTarget < state.lastRequestedTime - 0.02 ||
						safeTarget > state.lastRequestedTime + 1.5 ||
						state.decoderError !== null;

					if (needsSeek) {
						if (state.decoderError) {
							try {
								state.decoder.close();
							} catch {
								// ignore
							}
							state.decoderError = null;
							state.decoder = await this.createExportDecoderInstance(
								sinkData,
								state,
							);
						} else if (state.lastRequestedTime >= 0) {
							state.decodeFloorTime = Number.POSITIVE_INFINITY;
							await state.decoder.flush().catch(() => {});
							if (Array.isArray(state.decoder.inputTimestamps)) {
								state.decoder.inputTimestamps.length = 0;
							}
						}
						state.preRollFrame = null;
						for (const f of state.decodedFrames) {
							state.freeCanvases.push(f.canvas as HTMLCanvasElement);
						}
						state.decodedFrames.length = 0;
						state.decodeFloorTime = Math.max(0, safeTarget - 0.005);
						state.packetsEnded = false;

						const keyPacket =
							(await state.packetSink.getKeyPacket(safeTarget, {
								verifyKeyPackets: true,
							})) ??
							(await state.packetSink.getFirstKeyPacket({
								verifyKeyPackets: true,
							}));
						state.currentPacket = keyPacket;
						if (!state.currentPacket) {
							state.packetsEnded = true;
						}
					}

					const frameTolerance = 0.000001;
					const pruneExpiredFrames = () => {
						while (
							state.decodedFrames.length >= 2 &&
							state.decodedFrames[1]!.timestamp <= safeTarget + frameTolerance
						) {
							const expired = state.decodedFrames.shift()!;
							state.freeCanvases.push(expired.canvas as HTMLCanvasElement);
						}
					};

					const hasSufficientLookahead = () => {
						if (state.decodedFrames.length === 0) return false;
						const newest = state.decodedFrames[state.decodedFrames.length - 1]!;
						return (
							newest.timestamp > safeTarget + 0.015 &&
							state.decodedFrames.length >= 2
						);
					};

					pruneExpiredFrames();

					while (
						!hasSufficientLookahead() &&
						!state.packetsEnded &&
						!state.decoderError
					) {
						const maxDecodeQueue = state.decodedFrames.length === 0 ? 24 : 14;
						let fedInBurst = 0;
						while (
							!hasSufficientLookahead() &&
							state.currentPacket !== null &&
							state.decoder.getDecodeQueueSize() < maxDecodeQueue &&
							fedInBurst < 12 &&
							!state.decoderError
						) {
							const pkt = state.currentPacket;
							state.currentPacket = await state.packetSink.getNextPacket(pkt);
							state.decoder.decode(pkt);
							fedInBurst++;
							pruneExpiredFrames();
						}

						if (hasSufficientLookahead() || state.decoderError) {
							break;
						}

						if (state.currentPacket === null) {
							await state.decoder.flush();
							state.packetsEnded = true;
							break;
						}

						if (!hasSufficientLookahead() && !state.decoderError) {
							const rawDecoder = state.decoder.decoder;
							await new Promise<void>((resolve) => {
								const t = setTimeout(() => {
									if (state.notifyWaiter === wake) state.notifyWaiter = null;
									rawDecoder?.removeEventListener("dequeue", wake);
									resolve();
								}, 4);
								const wake = () => {
									clearTimeout(t);
									if (state.notifyWaiter === wake) state.notifyWaiter = null;
									rawDecoder?.removeEventListener("dequeue", wake);
									resolve();
								};
								state.notifyWaiter = wake;
								rawDecoder?.addEventListener("dequeue", wake, { once: true });
							});
							pruneExpiredFrames();
						}
					}

					pruneExpiredFrames();

					// Proactive multi-packet lookahead so B-pyramid groups decode in parallel with compositing/encoding
					let lookaheadFed = 0;
					while (
						state.currentPacket !== null &&
						!state.packetsEnded &&
						!state.decoderError &&
						state.decoder.getDecodeQueueSize() < 10 &&
						state.decodedFrames.length < 6 &&
						lookaheadFed < 4
					) {
						const lookaheadPkt = state.currentPacket;
						state.currentPacket =
							await state.packetSink.getNextPacket(lookaheadPkt);
						state.decoder.decode(lookaheadPkt);
						lookaheadFed++;
					}

					const chosenFrame =
						state.decodedFrames[0] ?? state.preRollFrame ?? null;
					if (chosenFrame) {
						if (
							chosenFrame.timestamp > safeTarget + 0.000001 ||
							chosenFrame.timestamp + chosenFrame.duration <
								safeTarget - 0.000001
						) {
							throw new Error(
								"Decoded frame does not cover requested source time",
							);
						}
						stampCanvasRevision(chosenFrame.canvas);
						state.lastRequestedTime = safeTarget;
						sinkData.lastExportRequestedTime = safeTarget;
						sinkData.lastExportFrame = chosenFrame;
						return chosenFrame;
					}
				} catch {
					this.disposeExportDecoderState(sinkData);
					sinkData.exportSinkFailed = true;
				}
			}
		}

		// An isolated native decoder avoids races with preview seeks. Wait for the
		// requested image, or fail clearly instead of encoding a stale cached frame.
		const exportVideo = (sinkData.exportVideo ??= createHiddenVideoElement(
			sinkData.objectUrl,
		));
		try {
			await seekExportVideo({ video: exportVideo, time: safeTarget });
		} catch (error) {
			throw new Error(
				`No se pudo exportar «${sinkData.rawBlob instanceof File ? sinkData.rawBlob.name : sinkData.mediaId}» en ${safeTarget.toFixed(3)} s: ${String(error)}`,
			);
		}

		if (exportVideo.readyState >= 2) {
			this.syncSinkDimensionsFromVideo(sinkData, exportVideo);
			const { targetWidth: exportW, targetHeight: exportH } =
				computeTargetDimensions({
					width: sinkData.intrinsicWidth || exportVideo.videoWidth || 1280,
					height: sinkData.intrinsicHeight || exportVideo.videoHeight || 720,
					maxOverride: EXPORT_DECODE_DIMENSION,
				});
			if (exportW > 0 && exportH > 0) {
				sinkData.exportRingCursor =
					(sinkData.exportRingCursor + 1) % RING_BUFFER_SIZE;
				let canvas = sinkData.exportCanvases[sinkData.exportRingCursor];
				let ctx = sinkData.exportCtxs[sinkData.exportRingCursor] ?? null;
				if (
					!canvas ||
					canvas.width !== exportW ||
					canvas.height !== exportH ||
					!ctx
				) {
					canvas = document.createElement("canvas");
					canvas.width = exportW;
					canvas.height = exportH;
					ctx = canvas.getContext("2d", { alpha: false });
					sinkData.exportCanvases[sinkData.exportRingCursor] = canvas;
					sinkData.exportCtxs[sinkData.exportRingCursor] = ctx;
				}
				if (ctx) {
					try {
						ctx.drawImage(exportVideo, 0, 0, exportW, exportH);
						stampCanvasRevision(canvas);
						const wrapped: WrappedCanvas = {
							canvas,
							timestamp: exportVideo.currentTime,
							duration: sinkData.frameStep,
						};
						sinkData.lastExportRequestedTime = safeTarget;
						sinkData.lastExportFrame = wrapped;
						return wrapped;
					} catch {
						// fall through
					}
				}
			}
		}

		throw new Error(
			`No se pudo dibujar el cuadro de ${sinkData.mediaId} en ${safeTarget.toFixed(3)} s`,
		);
	}

	async preloadInitialVideos(rootNode: AnyBaseNode): Promise<void> {
		const videoNodes: VideoNode[] = [];
		const walk = (node: AnyBaseNode) => {
			if (
				node instanceof VideoNode &&
				node.params.timeOffset <= 0 &&
				node.params.duration > 0
			) {
				videoNodes.push(node);
			}
			for (const child of node.children) {
				walk(child);
			}
		};
		walk(rootNode);

		await Promise.all(
			videoNodes.map(async (vn) => {
				await this.ensureSink({
					mediaId: vn.params.mediaId,
					file: vn.params.file,
				});
			}),
		);
	}

	private syncSinkDimensionsFromVideo(
		sinkData: VideoSinkData,
		sourceVideo: HTMLVideoElement = sinkData.slots[0].videoEl,
	): boolean {
		const vw = sourceVideo.videoWidth;
		const vh = sourceVideo.videoHeight;
		if (!vw || !vh || vw <= 0 || vh <= 0) {
			return false;
		}

		let changed = false;
		if (
			Number.isFinite(sourceVideo.duration) &&
			sourceVideo.duration > 0 &&
			Math.abs(sinkData.duration - sourceVideo.duration) > 0.05
		) {
			sinkData.duration = sourceVideo.duration;
			changed = true;
		}

		const { targetWidth, targetHeight } = computeTargetDimensions({
			width: vw,
			height: vh,
		});

		if (
			!sinkData.hasIntrinsicMetadata ||
			sinkData.intrinsicWidth !== vw ||
			sinkData.intrinsicHeight !== vh ||
			sinkData.targetWidth !== targetWidth ||
			sinkData.targetHeight !== targetHeight
		) {
			sinkData.intrinsicWidth = vw;
			sinkData.intrinsicHeight = vh;
			sinkData.targetWidth = targetWidth;
			sinkData.targetHeight = targetHeight;
			sinkData.hasIntrinsicMetadata = true;
			sinkData.scrubCache.clear();
			changed = true;
		}

		return changed;
	}

	private emitIntrinsicMetadataIfNeeded(
		sinkData: VideoSinkData,
		sampleCanvas?: HTMLCanvasElement,
	): void {
		if (
			typeof window === "undefined" ||
			!sinkData.hasIntrinsicMetadata ||
			sinkData.intrinsicWidth <= 0 ||
			sinkData.intrinsicHeight <= 0
		) {
			return;
		}

		const fallbackCanvas = sinkData.currentFrame?.canvas;
		const sourceCanvas =
			sampleCanvas ??
			(fallbackCanvas instanceof HTMLCanvasElement
				? fallbackCanvas
				: undefined);
		if (sourceCanvas && !sinkData.thumbnailDataUrl) {
			try {
				const maxThumbW = 320;
				const scale = Math.min(1, maxThumbW / Math.max(1, sourceCanvas.width));
				const thumbW = Math.max(16, Math.round(sourceCanvas.width * scale));
				const thumbH = Math.max(16, Math.round(sourceCanvas.height * scale));
				const thumbCanvas = document.createElement("canvas");
				thumbCanvas.width = thumbW;
				thumbCanvas.height = thumbH;
				const thumbCtx = thumbCanvas.getContext("2d");
				if (thumbCtx) {
					thumbCtx.drawImage(sourceCanvas, 0, 0, thumbW, thumbH);
					sinkData.thumbnailDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.72);
				} else {
					sinkData.thumbnailDataUrl = sourceCanvas.toDataURL(
						"image/jpeg",
						0.72,
					);
				}
			} catch {
				// ignore
			}
		}

		sinkData.metadataDispatched = true;
		window.dispatchEvent(
			new CustomEvent("opencut-video-metadata-ready", {
				detail: {
					mediaId: sinkData.mediaId,
					duration: sinkData.duration,
					width: sinkData.intrinsicWidth,
					height: sinkData.intrinsicHeight,
					thumbnailDataUrl: sinkData.thumbnailDataUrl,
					isIntrinsic: true,
				},
			}),
		);
	}

	private async ensureSink({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		const existing = this.sinks.get(mediaId);
		if (existing) {
			existing.lastUsedWallMs = performance.now();
			return;
		}
		this.evictIdleVideoSinks();

		if (this.initPromises.has(mediaId)) {
			await this.initPromises.get(mediaId);
			return;
		}

		const initPromise = this.initializeSink({ mediaId, file }).finally(() => {
			this.initPromises.delete(mediaId);
		});

		this.initPromises.set(mediaId, initPromise);
		await initPromise;
	}

	private async readFileBuffer(
		mediaId: string,
		file: File,
	): Promise<ArrayBuffer | Blob> {
		try {
			return await file.arrayBuffer();
		} catch {
			if (
				typeof navigator !== "undefined" &&
				"storage" in navigator &&
				"getDirectory" in navigator.storage
			) {
				try {
					const root = await navigator.storage.getDirectory();
					for await (const [dirName, handle] of (
						root as unknown as {
							entries(): AsyncIterable<[string, FileSystemHandle]>;
						}
					).entries()) {
						if (
							handle.kind !== "directory" ||
							!dirName.startsWith("media-files-")
						)
							continue;
						const dirHandle = handle as FileSystemDirectoryHandle;
						try {
							const fh = await dirHandle.getFileHandle(mediaId);
							const recovered = await fh.getFile();
							if (recovered.size > 0) {
								return await recovered.arrayBuffer();
							}
						} catch {
							// not in this project dir
						}
					}
				} catch {
					// ignore
				}
			}
			return file;
		}
	}

	private async initializeSink({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		try {
			const mimeType =
				file.type && file.type.startsWith("video/") ? file.type : "video/mp4";
			const blob =
				file.size > 0
					? file.slice(0, file.size, mimeType)
					: new Blob([await this.readFileBuffer(mediaId, file)], {
							type: mimeType,
						});
			const objectUrl = URL.createObjectURL(blob);

			const video0 = createHiddenVideoElement(objectUrl);
			const video1 = createHiddenVideoElement(objectUrl);
			video1.preload = "metadata";

			await new Promise<void>((resolve, reject) => {
				let settled = false;
				const checkReady = () => {
					if (
						video0.readyState >= 2 &&
						video0.videoWidth > 0 &&
						video0.videoHeight > 0
					) {
						done();
					}
				};
				const done = () => {
					if (settled) return;
					settled = true;
					cleanup();
					resolve();
				};
				const fail = () => {
					if (settled) return;
					settled = true;
					cleanup();
					reject(
						new Error(video0.error?.message || "Failed to load video element"),
					);
				};
				const timer = setTimeout(done, 5000);
				const cleanup = () => {
					clearTimeout(timer);
					video0.removeEventListener("loadedmetadata", checkReady);
					video0.removeEventListener("loadeddata", done);
					video0.removeEventListener("canplay", done);
					video0.removeEventListener("canplaythrough", done);
					video0.removeEventListener("error", fail);
				};
				if (
					video0.readyState >= 2 &&
					video0.videoWidth > 0 &&
					video0.videoHeight > 0
				) {
					done();
					return;
				}
				video0.addEventListener("loadedmetadata", checkReady);
				video0.addEventListener("loadeddata", done, { once: true });
				video0.addEventListener("canplay", done, { once: true });
				video0.addEventListener("canplaythrough", done, { once: true });
				video0.addEventListener("error", fail, { once: true });
				video0.load();
			});

			if (video0.videoWidth <= 0 || video0.videoHeight <= 0) {
				await new Promise<void>((resolve) => {
					const t = setTimeout(resolve, 1500);
					const onMeta = () => {
						clearTimeout(t);
						resolve();
					};
					video0.addEventListener("loadedmetadata", onMeta, { once: true });
					video0.addEventListener("resize", onMeta, { once: true });
				});
			}

			const hasIntrinsic = video0.videoWidth > 0 && video0.videoHeight > 0;
			const displayW = hasIntrinsic ? video0.videoWidth : 1280;
			const displayH = hasIntrinsic ? video0.videoHeight : 720;
			const duration =
				Number.isFinite(video0.duration) && video0.duration > 0
					? video0.duration
					: 0;

			const { targetWidth, targetHeight } = computeTargetDimensions({
				width: displayW,
				height: displayH,
			});
			const frameStep = 1 / BASE_CACHE_FPS;

			const slot0 = createPlayerSlot(0, video0);
			const slot1 = createPlayerSlot(1, video1);

			const sinkData: VideoSinkData = {
				mediaId,
				rawBlob: blob,
				slots: [slot0, slot1],
				exportVideo: null,
				exportDecoderState: null,
				exportSinkFailed: false,
				exportCanvases: [],
				exportCtxs: [],
				exportRingCursor: 0,
				lastExportRequestedTime: -1,
				lastExportFrame: null,
				objectUrl,
				intrinsicWidth: hasIntrinsic ? displayW : 0,
				intrinsicHeight: hasIntrinsic ? displayH : 0,
				hasIntrinsicMetadata: hasIntrinsic,
				metadataDispatched: false,
				targetWidth,
				targetHeight,
				currentFrame: null,
				duration,
				fps: BASE_CACHE_FPS,
				frameStep,
				scrubCache: new Map(),
				disposed: false,
				lastUsedWallMs: performance.now(),
			};

			if (video0.readyState < 2 || video0.currentTime > 0.05) {
				await new Promise<void>((resolve) => {
					const t = setTimeout(resolve, 350);
					video0.addEventListener(
						"seeked",
						() => {
							clearTimeout(t);
							resolve();
						},
						{ once: true },
					);
					try {
						video0.currentTime = 0.001;
					} catch {
						clearTimeout(t);
						resolve();
					}
				});
			}

			this.syncSinkDimensionsFromVideo(sinkData, video0);
			const frame0 = this.drawSlotFrame(sinkData, slot0, 0, true);
			if (frame0) {
				sinkData.currentFrame = frame0;
				slot1.lastFrame = frame0;
				this.storeScrubCache(sinkData, 0, frame0);
			} else if (sinkData.hasIntrinsicMetadata) {
				this.emitIntrinsicMetadataIfNeeded(sinkData);
			}

			this.sinks.set(mediaId, sinkData);
			this.dirtyAfterAsyncSeek = true;
			if (typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent("opencut-video-frame-ready", {
						detail: { mediaId },
					}),
				);
			}
		} catch (error) {
			console.error(`Failed to initialize video sink for ${mediaId}:`, error);
		}
	}

	clearVideo({ mediaId }: { mediaId: string }): void {
		this.clearVideoSink({ mediaId });
	}

	clearVideoSink({ mediaId }: { mediaId: string }): void {
		const sinkData = this.sinks.get(mediaId);
		if (sinkData) {
			sinkData.disposed = true;
			this.disposeExportDecoderState(sinkData);
			for (const v of [
				sinkData.slots[0].videoEl,
				sinkData.slots[1].videoEl,
				sinkData.exportVideo,
			]) {
				if (!v) continue;
				try {
					v.pause();
					v.removeAttribute("src");
					v.load();
					v.remove();
				} catch {
					// ignore
				}
			}
			try {
				URL.revokeObjectURL(sinkData.objectUrl);
			} catch {
				// ignore
			}
			sinkData.scrubCache.clear();
			this.sinks.delete(mediaId);
		}

		this.initPromises.delete(mediaId);
	}

	clearAll(): void {
		for (const [mediaId] of this.sinks) {
			this.clearVideoSink({ mediaId });
		}
	}

	async preloadVideo({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		await this.ensureSink({ mediaId, file });
	}

	getStats() {
		let totalCachedFrames = 0;
		for (const s of this.sinks.values()) {
			totalCachedFrames += s.scrubCache.size;
		}
		return {
			totalSinks: this.sinks.size,
			activeSinks: 0,
			initializingSinks: this.initPromises.size,
			cachedFrames: totalCachedFrames,
		};
	}
}

export const videoCache = new VideoCache();
