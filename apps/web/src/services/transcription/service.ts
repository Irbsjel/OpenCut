import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionProgress,
	TranscriptionModelId,
	TranscriptionSegment,
} from "@/transcription/types";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_MODELS,
} from "@/transcription/models";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { decodeAudioToFloat32 } from "@/media/audio";
import type { WorkerMessage, WorkerResponse } from "./worker";

export interface TimelineClipDescriptor {
	mediaId: string;
	trackType: string;
	startTimeSec: number;
	durationSec: number;
	trimStartSec: number;
}

type ProgressCallback = (progress: TranscriptionProgress) => void;

class TranscriptionService {
	private worker: Worker | null = null;
	private currentModelId: TranscriptionModelId | null = null;
	private isInitialized = false;
	private isInitializing = false;

	async transcribeTimelineClips({
		clips,
		language = "auto",
		onProgress,
	}: {
		clips: TimelineClipDescriptor[];
		language?: TranscriptionLanguage;
		onProgress?: ProgressCallback;
	}): Promise<TranscriptionResult | null> {
		if (!clips || clips.length === 0) return null;

		onProgress?.({
			status: "transcribing",
			progress: 25,
			message: "Transcribing timeline audio...",
		});

		const endpoints = ["/videos/api/transcribe", "/api/transcribe"];
		for (const endpoint of endpoints) {
			try {
				const resp = await fetch(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						language: language ?? "auto",
						clips,
					}),
				});
				if (!resp.ok) continue;

				const data = (await resp.json()) as {
					ok?: boolean;
					engine?: string;
					language?: string;
					text?: string;
					segments?: TranscriptionSegment[];
				};
				if (data?.ok && Array.isArray(data.segments)) {
					onProgress?.({
						status: "complete",
						progress: 100,
						message: "Transcription complete",
					});
					return {
						text: data.text ?? "",
						segments: data.segments,
						language: data.language ?? language,
						engine: data.engine ?? "gemini-audio-chunked",
					};
				}
			} catch {
				// try next endpoint
			}
		}

		return null;
	}

	async transcribeAudioBlob({
		audioBlob,
		language = "auto",
		modelId = DEFAULT_TRANSCRIPTION_MODEL,
		onProgress,
	}: {
		audioBlob: Blob;
		language?: TranscriptionLanguage;
		modelId?: TranscriptionModelId;
		onProgress?: ProgressCallback;
	}): Promise<TranscriptionResult> {
		onProgress?.({
			status: "transcribing",
			progress: 25,
			message: "Capturando voz con Whisper Turbo...",
		});

		const endpoints = ["/videos/api/transcribe", "/api/transcribe"];
		for (const endpoint of endpoints) {
			try {
				const form = new FormData();
				form.append("audio", audioBlob, "timeline-audio.wav");
				form.append("language", language ?? "auto");

				const resp = await fetch(endpoint, {
					method: "POST",
					body: form,
				});
				if (!resp.ok) continue;

				const data = (await resp.json()) as {
					ok?: boolean;
					engine?: string;
					language?: string;
					text?: string;
					segments?: TranscriptionSegment[];
				};
				if (data?.ok && Array.isArray(data.segments)) {
					onProgress?.({
						status: "complete",
						progress: 100,
						message: "Transcripción completada",
					});
					return {
						text: data.text ?? "",
						segments: data.segments,
						language: data.language ?? language,
						engine: data.engine ?? "faster-whisper",
					};
				}
			} catch {
				// try next endpoint or fallback to local WebWorker
			}
		}

		const { samples } = await decodeAudioToFloat32({
			audioBlob,
			sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
		});
		return this.transcribe({
			audioData: samples,
			language,
			modelId,
			onProgress,
		});
	}

	async transcribe({
		audioData,
		language = "auto",
		modelId = DEFAULT_TRANSCRIPTION_MODEL,
		onProgress,
	}: {
		audioData: Float32Array;
		language?: TranscriptionLanguage;
		modelId?: TranscriptionModelId;
		onProgress?: ProgressCallback;
	}): Promise<TranscriptionResult> {
		await this.ensureWorker({ modelId, onProgress });

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Worker not initialized"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				switch (response.type) {
					case "transcribe-progress":
						onProgress?.({
							status: "transcribing",
							progress: response.progress,
							message: "Transcribing audio...",
						});
						break;

					case "transcribe-complete":
						this.worker?.removeEventListener("message", handleMessage);
						resolve({
							text: response.text,
							segments: response.segments,
							language,
							engine: "browser-whisper",
						});
						break;

					case "transcribe-error":
						this.worker?.removeEventListener("message", handleMessage);
						reject(new Error(response.error));
						break;

					case "cancelled":
						this.worker?.removeEventListener("message", handleMessage);
						reject(new Error("Transcription cancelled"));
						break;
				}
			};

			this.worker.addEventListener("message", handleMessage);

			this.worker.postMessage({
				type: "transcribe",
				audio: audioData,
				language,
			} satisfies WorkerMessage);
		});
	}

	cancel() {
		this.worker?.postMessage({ type: "cancel" } satisfies WorkerMessage);
	}

	private async ensureWorker({
		modelId,
		onProgress,
	}: {
		modelId: TranscriptionModelId;
		onProgress?: ProgressCallback;
	}): Promise<void> {
		const needsNewModel = this.currentModelId !== modelId;

		if (this.worker && this.isInitialized && !needsNewModel) {
			return;
		}

		if (this.isInitializing && !needsNewModel) {
			await this.waitForInit();
			return;
		}

		this.terminate();
		this.isInitializing = true;
		this.isInitialized = false;

		const model = TRANSCRIPTION_MODELS.find((m) => m.id === modelId);
		if (!model) {
			throw new Error(`Unknown model: ${modelId}`);
		}

		this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Failed to create worker"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				switch (response.type) {
					case "init-progress":
						onProgress?.({
							status: "loading-model",
							progress: response.progress,
							message: `Loading ${model.name} model...`,
						});
						break;

					case "init-complete":
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitialized = true;
						this.isInitializing = false;
						this.currentModelId = modelId;
						resolve();
						break;

					case "init-error":
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitializing = false;
						this.terminate();
						reject(new Error(response.error));
						break;
				}
			};

			this.worker.addEventListener("message", handleMessage);

			this.worker.postMessage({
				type: "init",
				modelId: model.huggingFaceId,
			} satisfies WorkerMessage);
		});
	}

	private waitForInit(): Promise<void> {
		return new Promise((resolve) => {
			const checkInit = () => {
				if (this.isInitialized) {
					resolve();
				} else if (!this.isInitializing) {
					resolve();
				} else {
					setTimeout(checkInit, 100);
				}
			};
			checkInit();
		});
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
		this.isInitialized = false;
		this.isInitializing = false;
		this.currentModelId = null;
	}
}

export const transcriptionService = new TranscriptionService();
