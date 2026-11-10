import {
	Input,
	ALL_FORMATS,
	BlobSource,
	VideoSampleSink,
	type VideoCodec,
} from "mediabunny";
import { createTimelineAudioBuffer } from "@/media/audio";
import type { SceneTracks } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { TICKS_PER_SECOND } from "@/wasm";
import { renderThumbnailDataUrl } from "./thumbnail";

export type VideoFileData = {
	duration: number;
	width: number;
	height: number;
	fps: number;
	hasAudio: boolean;
	codec: VideoCodec | null;
	canDecode: boolean;
	thumbnailUrl: string | null;
};

async function fallbackVideoMetadataFromElement(
	file: File,
	hints?: { width?: number; height?: number; duration?: number },
): Promise<{
	duration: number;
	width: number;
	height: number;
	thumbnailUrl: string | null;
}> {
	const mimeType =
		file.type && file.type.startsWith("video/") ? file.type : "video/mp4";
	const blob =
		file.type === mimeType ? file : file.slice(0, file.size, mimeType);
	const objectUrl = URL.createObjectURL(blob);
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.preload = "auto";
	video.src = objectUrl;

	try {
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const timer = setTimeout(() => {
				if (!settled) {
					settled = true;
					resolve();
				}
			}, 7500);
			const done = () => {
				if (settled) return;
				if (video.videoWidth > 0 && video.videoHeight > 0) {
					settled = true;
					clearTimeout(timer);
					resolve();
				}
			};
			video.addEventListener("loadedmetadata", done);
			video.addEventListener("loadeddata", done);
			video.addEventListener("canplay", done);
			video.addEventListener(
				"error",
				() => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					reject(new Error("Could not load video element"));
				},
				{ once: true },
			);
			video.load();
		});

		const rawDur =
			Number.isFinite(video.duration) && video.duration > 0
				? video.duration
				: hints?.duration && hints.duration > 0
					? hints.duration
					: 8;

		const seekTarget = Math.min(0.12, Math.max(0.02, rawDur * 0.05));
		if (video.readyState < 2 || video.currentTime === 0) {
			await new Promise<void>((resolve) => {
				const t = setTimeout(resolve, 1200);
				video.addEventListener(
					"seeked",
					() => {
						clearTimeout(t);
						resolve();
					},
					{ once: true },
				);
				try {
					video.currentTime = seekTarget;
				} catch {
					clearTimeout(t);
					resolve();
				}
			});
		}

		const width =
			(video.videoWidth > 0 ? video.videoWidth : undefined) ||
			(hints?.width && hints.width > 0 ? hints.width : undefined) ||
			1280;
		const height =
			(video.videoHeight > 0 ? video.videoHeight : undefined) ||
			(hints?.height && hints.height > 0 ? hints.height : undefined) ||
			720;
		const duration =
			Number.isFinite(video.duration) && video.duration > 0
				? video.duration
				: hints?.duration && hints.duration > 0
					? hints.duration
					: 8;

		let thumbnailUrl: string | null = null;
		if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
			try {
				thumbnailUrl = renderThumbnailDataUrl({
					width: video.videoWidth,
					height: video.videoHeight,
					draw: ({ context, width: w, height: h }) => {
						context.drawImage(video, 0, 0, w, h);
					},
				});
			} catch {
				thumbnailUrl = null;
			}
		}

		return { duration, width, height, thumbnailUrl };
	} finally {
		try {
			video.pause();
			video.removeAttribute("src");
			video.load();
		} catch {
			// ignore
		}
		URL.revokeObjectURL(objectUrl);
	}
}

export async function readVideoFile({
	file,
}: {
	file: File;
}): Promise<VideoFileData> {
	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});

	let knownDuration = 0;
	let knownWidth = 0;
	let knownHeight = 0;

	try {
		knownDuration = await input.computeDuration();
		const videoTrack = await input.getPrimaryVideoTrack();

		if (!videoTrack) {
			throw new Error("No video track found in the file");
		}

		knownWidth = videoTrack.displayWidth || 0;
		knownHeight = videoTrack.displayHeight || 0;

		let fps = 24;
		try {
			const packetStats = await videoTrack.computePacketStats(100);
			if (
				packetStats?.averagePacketRate &&
				Number.isFinite(packetStats.averagePacketRate)
			) {
				fps = packetStats.averagePacketRate;
			}
		} catch {
			fps = 24;
		}

		let hasAudio = true;
		try {
			const audioTrack = await input.getPrimaryAudioTrack();
			hasAudio = audioTrack !== null;
		} catch {
			hasAudio = true;
		}

		let thumbnailUrl: string | null = null;
		try {
			const canDecodeWebCodecs = await videoTrack.canDecode();
			if (canDecodeWebCodecs && knownWidth > 0 && knownHeight > 0) {
				const sink = new VideoSampleSink(videoTrack);
				const frame = await sink.getSample(0.1);
				if (frame) {
					try {
						thumbnailUrl = renderThumbnailDataUrl({
							width: knownWidth,
							height: knownHeight,
							draw: ({ context, width, height }) => {
								frame.draw(context, 0, 0, width, height);
							},
						});
					} finally {
						try {
							frame.close();
						} catch {
							// ignore
						}
					}
				}
			}
		} catch {
			// WebCodecs VideoSampleSink failed on this platform; fall back to HTMLVideoElement for thumbnail
		}

		let finalDuration = knownDuration;
		let finalWidth = knownWidth;
		let finalHeight = knownHeight;

		if (
			!thumbnailUrl ||
			!Number.isFinite(finalDuration) ||
			finalDuration <= 0 ||
			finalWidth <= 0 ||
			finalHeight <= 0
		) {
			try {
				const fb = await fallbackVideoMetadataFromElement(file, {
					width: finalWidth,
					height: finalHeight,
					duration: finalDuration,
				});
				if (!thumbnailUrl) thumbnailUrl = fb.thumbnailUrl;
				if (!Number.isFinite(finalDuration) || finalDuration <= 0) {
					finalDuration = fb.duration;
				}
				if (!finalWidth || finalWidth <= 0) finalWidth = fb.width;
				if (!finalHeight || finalHeight <= 0) finalHeight = fb.height;
			} catch {
				// ignore fallback error
			}
		}

		return {
			duration: finalDuration,
			width: finalWidth,
			height: finalHeight,
			fps,
			hasAudio,
			codec: videoTrack.codec,
			canDecode: true,
			thumbnailUrl,
		};
	} catch {
		const fb = await fallbackVideoMetadataFromElement(file, {
			width: knownWidth,
			height: knownHeight,
			duration: knownDuration,
		});
		return {
			duration: fb.duration,
			width: fb.width,
			height: fb.height,
			fps: 24,
			hasAudio: true,
			codec: "avc",
			canDecode: true,
			thumbnailUrl: fb.thumbnailUrl,
		};
	} finally {
		input.dispose();
	}
}

const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const EMPTY_TIMELINE_SILENT_DURATION_SECONDS = 0.1;
const MIN_SILENT_DURATION_SECONDS = 0.001;

export const extractTimelineAudio = async ({
	tracks,
	mediaAssets,
	totalDuration,
	onProgress,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	totalDuration: number;
	onProgress?: (progress: number) => void;
}): Promise<Blob> => {
	if (totalDuration === 0) {
		return createWavBlob({
			samples: new Float32Array(
				SAMPLE_RATE * EMPTY_TIMELINE_SILENT_DURATION_SECONDS,
			),
		});
	}

	onProgress?.(10);

	let audioBuffer = await createTimelineAudioBuffer({
		tracks,
		mediaAssets,
		duration: totalDuration,
		sampleRate: SAMPLE_RATE,
	});

	if (!audioBuffer) {
		const unmutedTracks: SceneTracks = {
			main: { ...tracks.main, muted: false },
			overlay: tracks.overlay.map((t) => ({ ...t, muted: false })),
			audio: tracks.audio.map((t) => ({ ...t, muted: false })),
		};
		audioBuffer = await createTimelineAudioBuffer({
			tracks: unmutedTracks,
			mediaAssets,
			duration: totalDuration,
			sampleRate: SAMPLE_RATE,
		});
	}

	if (!audioBuffer) {
		const silentDurationSeconds = Math.max(
			MIN_SILENT_DURATION_SECONDS,
			totalDuration / TICKS_PER_SECOND,
		);
		const silentSamples = new Float32Array(
			Math.ceil(silentDurationSeconds * SAMPLE_RATE) * NUM_CHANNELS,
		);
		return createWavBlob({ samples: silentSamples });
	}

	onProgress?.(90);

	const interleavedSamples = interleaveAudioBuffer({ audioBuffer });
	onProgress?.(100);

	return createWavBlob({ samples: interleavedSamples });
};

function interleaveAudioBuffer({
	audioBuffer,
}: {
	audioBuffer: AudioBuffer;
}): Float32Array {
	const numChannels = Math.min(NUM_CHANNELS, audioBuffer.numberOfChannels);
	const interleavedSamples = new Float32Array(
		audioBuffer.length * NUM_CHANNELS,
	);

	for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex++) {
		for (let channel = 0; channel < NUM_CHANNELS; channel++) {
			const sourceChannel = Math.min(channel, Math.max(0, numChannels - 1));
			interleavedSamples[sampleIndex * NUM_CHANNELS + channel] =
				audioBuffer.getChannelData(sourceChannel)[sampleIndex] ?? 0;
		}
	}

	return interleavedSamples;
}

function createWavBlob({ samples }: { samples: Float32Array }): Blob {
	const numChannels = NUM_CHANNELS;
	const bitsPerSample = 16;
	const bytesPerSample = bitsPerSample / 8;
	const numSamples = samples.length / numChannels;
	const dataSize = numSamples * numChannels * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	// riff header
	writeString({ view, offset: 0, str: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeString({ view, offset: 8, str: "WAVE" });

	// fmt chunk
	writeString({ view, offset: 12, str: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, SAMPLE_RATE * numChannels * bytesPerSample, true);
	view.setUint16(32, numChannels * bytesPerSample, true);
	view.setUint16(34, bitsPerSample, true);

	// data chunk
	writeString({ view, offset: 36, str: "data" });
	view.setUint32(40, dataSize, true);

	// convert float32 [-1, 1] to int16 [-32768, 32767]
	let offset = 44;
	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i]));
		const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
		view.setInt16(offset, int16, true);
		offset += 2;
	}

	return new Blob([buffer], { type: "audio/wav" });
}

function writeString({
	view,
	offset,
	str,
}: {
	view: DataView;
	offset: number;
	str: string;
}): void {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}
