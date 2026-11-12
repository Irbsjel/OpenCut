import EventEmitter from "eventemitter3";
import { yieldToBrowser } from "@/export/yield-to-browser";

import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
	AudioBufferSource,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_HIGH,
	QUALITY_VERY_HIGH,
} from "mediabunny";
import type { FrameRate } from "opencut-wasm";
import { mediaTimeToSeconds } from "opencut-wasm";
import { TICKS_PER_SECOND } from "@/wasm";
import { frameRateToFloat } from "@/fps/utils";
import type { RootNode } from "./nodes/root-node";
import type { ExportFormat, ExportQuality } from "@/export";
import { CanvasRenderer } from "./canvas-renderer";
import { videoCache } from "@/services/video-cache/service";

type ExportParams = {
	width: number;
	height: number;
	fps: FrameRate;
	format: ExportFormat;
	quality: ExportQuality;
	shouldIncludeAudio?: boolean;
	audioBuffer?: AudioBuffer;
};

const qualityMap = {
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	high: QUALITY_HIGH,
	very_high: QUALITY_VERY_HIGH,
};

export type SceneExporterEvents = {
	progress: [progress: number];
	complete: [buffer: ArrayBuffer];
	error: [error: Error];
	cancelled: [];
};

export class SceneExporter extends EventEmitter<SceneExporterEvents> {
	private renderer: CanvasRenderer;
	private format: ExportFormat;
	private quality: ExportQuality;
	private shouldIncludeAudio: boolean;
	private audioBuffer?: AudioBuffer;

	private isCancelled = false;

	constructor({
		width,
		height,
		fps,
		format,
		quality,
		shouldIncludeAudio,
		audioBuffer,
	}: ExportParams) {
		super();
		this.renderer = new CanvasRenderer({
			width,
			height,
			fps,
		});

		this.format = format;
		this.quality = quality;
		this.shouldIncludeAudio = shouldIncludeAudio ?? false;
		this.audioBuffer = audioBuffer;
	}

	cancel(): void {
		this.isCancelled = true;
	}

	async export({
		rootNode,
	}: {
		rootNode: RootNode;
	}): Promise<ArrayBuffer | null> {
		const fps = this.renderer.fps;
		const fpsFloat = frameRateToFloat(fps);
		const ticksPerFrame = Math.round(
			(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
		);
		const frameCount = Math.max(
			1,
			Math.floor(rootNode.duration / ticksPerFrame),
		);

		let exportWidth = Math.max(2, Math.round(this.renderer.width / 2) * 2);
		let exportHeight = Math.max(2, Math.round(this.renderer.height / 2) * 2);
		let fullCodecString: string | undefined;
		let matchedHwAccel: "prefer-hardware" | "no-preference" = "no-preference";
		let matchedLatencyMode: "quality" | "realtime" = "quality";
		const targetBitrate = qualityMap[this.quality];

		if (this.format === "mp4" && typeof VideoEncoder !== "undefined") {
			const candidateCodecs = [
				"avc1.64002a",
				"avc1.640028",
				"avc1.640032",
				"avc1.4d002a",
				"avc1.4d0028",
				"avc1.4d0032",
				"avc1.42002a",
				"avc1.420028",
				"avc1.420032",
				"avc1.42001f",
			];
			const findSupportedCodec = async (
				w: number,
				h: number,
			): Promise<
				| {
						codec: string;
						hw: "prefer-hardware" | "no-preference";
						latencyMode: "quality" | "realtime";
				  }
				| undefined
			> => {
				for (const latencyMode of ["quality", "realtime"] as const) {
					for (const hw of ["prefer-hardware", "no-preference"] as const) {
						for (const codec of candidateCodecs) {
							try {
								const res = await VideoEncoder.isConfigSupported({
									codec,
									width: w,
									height: h,
									bitrate: Math.max(
										500_000,
										Math.round(w * h * fpsFloat * 0.12),
									),
									framerate: fpsFloat,
									hardwareAcceleration: hw,
									latencyMode,
								});
								if (res.supported) return { codec, hw, latencyMode };
							} catch {
								// try next
							}
						}
					}
				}
				return undefined;
			};

			const directMatch = await findSupportedCodec(exportWidth, exportHeight);
			if (directMatch) {
				fullCodecString = directMatch.codec;
				matchedHwAccel = directMatch.hw;
				matchedLatencyMode = directMatch.latencyMode;
			} else {
				// Fallback to 720p-equivalent (e.g. 720x1280 for 9:16 vertical) if the host H.264 encoder caps vertical height at 1280
				const maxDim = 1280;
				const scale = Math.min(1, maxDim / Math.max(exportWidth, exportHeight));
				const fallbackW = Math.max(
					2,
					Math.round((exportWidth * scale) / 2) * 2,
				);
				const fallbackH = Math.max(
					2,
					Math.round((exportHeight * scale) / 2) * 2,
				);
				const fallbackMatch = await findSupportedCodec(fallbackW, fallbackH);
				if (fallbackMatch) {
					exportWidth = fallbackW;
					exportHeight = fallbackH;
					fullCodecString = fallbackMatch.codec;
					matchedHwAccel = fallbackMatch.hw;
					matchedLatencyMode = fallbackMatch.latencyMode;
				}
			}
		}

		if (
			this.renderer.width !== exportWidth ||
			this.renderer.height !== exportHeight
		) {
			this.renderer.setSize({ width: exportWidth, height: exportHeight });
		}

		// Use an isolated canvas for export so live PreviewCanvas never races or overwrites exported frames
		const exportCanvas = document.createElement("canvas");
		exportCanvas.width = exportWidth;
		exportCanvas.height = exportHeight;

		const outputFormat =
			this.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

		const output = new Output({
			format: outputFormat,
			target: new BufferTarget(),
		});

		const videoSource = new CanvasSource(exportCanvas, {
			codec: this.format === "webm" ? "vp8" : "avc",
			bitrate: targetBitrate,
			keyFrameInterval: 2,
			hardwareAcceleration: matchedHwAccel,
			latencyMode: matchedLatencyMode,
			...(fullCodecString ? { fullCodecString } : {}),
			onEncoderConfig: (config) => {
				config.latencyMode = matchedLatencyMode;
			},
		});

		output.addVideoTrack(videoSource, { frameRate: fpsFloat });

		let audioSource: AudioBufferSource | null = null;
		if (this.shouldIncludeAudio && this.audioBuffer) {
			try {
				let audioCodec: "aac" | "opus" | null =
					this.format === "webm" ? "opus" : "aac";

				if (typeof AudioEncoder !== "undefined") {
					const checkAudioCodec = async (webCodec: string) => {
						try {
							const res = await AudioEncoder.isConfigSupported({
								codec: webCodec,
								sampleRate: this.audioBuffer!.sampleRate,
								numberOfChannels: this.audioBuffer!.numberOfChannels,
								bitrate: 192000,
							});
							return !!res.supported;
						} catch {
							return false;
						}
					};

					if (audioCodec === "aac") {
						const aacOk = await checkAudioCodec("mp4a.40.2");
						if (!aacOk) {
							const opusOk = await checkAudioCodec("opus");
							audioCodec = opusOk ? "opus" : null;
						}
					} else if (audioCodec === "opus") {
						const opusOk = await checkAudioCodec("opus");
						if (!opusOk) {
							const aacOk = await checkAudioCodec("mp4a.40.2");
							audioCodec = aacOk ? "aac" : null;
						}
					}
				}

				if (audioCodec) {
					audioSource = new AudioBufferSource({
						codec: audioCodec,
						bitrate: qualityMap[this.quality],
					});
					output.addAudioTrack(audioSource);
				}
			} catch (audioTrackErr) {
				console.warn(
					"Skipping audio track due to encoder config error:",
					audioTrackErr,
				);
				audioSource = null;
			}
		}

		let finalized = false;
		try {
			await output.start();

			if (audioSource && this.audioBuffer) {
				try {
					await audioSource.add(this.audioBuffer);
				} catch (audioAddErr) {
					throw new Error(
						"No se pudo codificar el audio: " + String(audioAddErr),
					);
				} finally {
					try {
						audioSource.close();
					} catch {
						// ignore
					}
				}
			}

			await videoCache.waitForAllVideosHarvested(rootNode);
			videoCache.setExportMode(true);

			this.emit("progress", 0.01);
			let lastEmittedProgress = 0.01;
			let lastEmitWallMs =
				typeof performance !== "undefined" ? performance.now() : Date.now();
			let lastYieldWallMs = lastEmitWallMs;

			for (let i = 0; i < frameCount; i++) {
				if (this.isCancelled) {
					await output.cancel();
					this.emit("cancelled");
					return null;
				}

				const timeTicks = i * ticksPerFrame;
				const timeSeconds = mediaTimeToSeconds({ time: timeTicks });
				await this.renderer.renderToCanvas({
					node: rootNode,
					time: timeTicks,
					targetCanvas: exportCanvas,
				});
				await videoSource.add(timeSeconds, 1 / fpsFloat);

				const nextProgress = ((i + 1) / frameCount) * 0.98;
				const nowWall =
					typeof performance !== "undefined" ? performance.now() : Date.now();
				if (
					nextProgress - lastEmittedProgress >= 0.01 ||
					nowWall - lastEmitWallMs >= 90 ||
					i === frameCount - 1
				) {
					lastEmittedProgress = nextProgress;
					lastEmitWallMs = nowWall;
					this.emit("progress", nextProgress);
				}
				if (nowWall - lastYieldWallMs >= 45) {
					lastYieldWallMs = nowWall;
					await yieldToBrowser();
				}
			}

			if (this.isCancelled) {
				await output.cancel();
				this.emit("cancelled");
				return null;
			}

			videoSource.close();
			await output.finalize();
			finalized = true;
			this.emit("progress", 1);

			const buffer = output.target.buffer;
			if (!buffer) {
				this.emit("error", new Error("Failed to export video"));
				return null;
			}

			this.emit("complete", buffer);
			return buffer;
		} finally {
			if (!finalized) await output.cancel().catch(() => {});
			videoCache.setExportMode(false);
		}
	}
}
