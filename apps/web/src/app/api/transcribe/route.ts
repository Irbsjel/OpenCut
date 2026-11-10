import { NextResponse } from "next/server";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK_SECONDS = 25;
const SAMPLE_RATE = 16000;

interface TranscribeWord {
	word: string;
	start: number;
	end: number;
}

interface TranscribeSegment {
	start: number;
	end: number;
	text: string;
	words?: TranscribeWord[];
}

export interface TimelineClipDescriptor {
	mediaId: string;
	trackType: "audio" | "video" | "overlay";
	startTimeSec: number;
	durationSec: number;
	trimStartSec: number;
}

function resolveMediaPoolFile(mediaId: string): string | null {
	const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, "");
	if (!safeId) return null;
	const home = os.homedir();
	const roots = [
		process.env.OPENCUT_CLOUD_DIR,
		path.resolve(process.cwd(), "../../cloud-storage"),
		path.join(home, "active/opencut/cloud-storage"),
	].filter((r): r is string => Boolean(r));

	for (const root of roots) {
		const candidate = path.join(root, "media-pool", safeId);
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function resolvePythonBinary(): string {
	const home = os.homedir();
	const candidates = [
		process.env.OPENCUT_PYTHON_BIN,
		path.join(home, ".local/share/opencut/venv/bin/python"),
		"/usr/bin/python3",
		"python3",
	].filter((c): c is string => Boolean(c));
	for (const candidate of candidates) {
		if (candidate === "python3" || existsSync(candidate)) {
			return candidate;
		}
	}
	return "python3";
}

function resolveScriptPath(): string {
	const home = os.homedir();
	const candidates = [
		path.resolve(process.cwd(), "scripts/transcribe_whisper.py"),
		path.resolve(process.cwd(), "apps/web/scripts/transcribe_whisper.py"),
		path.join(home, "active/opencut/apps/web/scripts/transcribe_whisper.py"),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return candidates[0]!;
}

async function readProviderKeys(providerName: string): Promise<string[]> {
	const home = os.homedir();
	const poolPaths = [
		process.env.OPENCUT_KEYS_POOL_PATH,
		path.join(home, ".config/opencut/keys_pool.json"),
	].filter((p): p is string => Boolean(p));
	for (const p of poolPaths) {
		try {
			if (!existsSync(p)) continue;
			const raw = JSON.parse(await fs.readFile(p, "utf-8"));
			const keys = raw?.providers?.[providerName]?.keys;
			if (Array.isArray(keys)) {
				const valid = keys.filter(
					(k): k is string => typeof k === "string" && k.trim().length > 0,
				);
				if (valid.length > 0) return valid;
			}
		} catch {
			// ignore
		}
	}
	return [];
}

function interpolateWords(
	text: string,
	start: number,
	end: number,
): TranscribeWord[] {
	const parts = text.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return [];
	const span = Math.max(0.2, end - start);
	const totalChars = Math.max(
		1,
		parts.reduce((acc, w) => acc + Math.max(1, w.length), 0),
	);
	let cursor = start;
	return parts.map((w, idx) => {
		const weight = Math.max(1, w.length) / totalChars;
		const wDur =
			idx === parts.length - 1 ? Math.max(0.05, end - cursor) : span * weight;
		const item: TranscribeWord = {
			word: w,
			start: Number(cursor.toFixed(3)),
			end: Number((cursor + wDur).toFixed(3)),
		};
		cursor += wDur;
		return item;
	});
}

function parseSegmentsResiliently(rawText: string): {
	language?: string;
	segments: Array<{ start?: number; end?: number; text?: string }>;
} | null {
	let cleaned = rawText.trim();
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
	try {
		const firstBrace = cleaned.indexOf("{");
		const lastBrace = cleaned.lastIndexOf("}");
		const jsonSlice =
			firstBrace !== -1 && lastBrace > firstBrace
				? cleaned.slice(firstBrace, lastBrace + 1)
				: cleaned;
		const parsed = JSON.parse(jsonSlice) as {
			language?: string;
			segments?: Array<{ start?: number; end?: number; text?: string }>;
		};
		if (Array.isArray(parsed.segments)) {
			return { language: parsed.language, segments: parsed.segments };
		}
	} catch {
		// Salvage individual {"start": ..., "end": ..., "text": "..."} objects if truncated
		const salvaged: Array<{ start?: number; end?: number; text?: string }> = [];
		const regex =
			/\{\s*"start"\s*:\s*([0-9.]+)\s*,\s*"end"\s*:\s*([0-9.]+)\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
		let match: RegExpExecArray | null = null;
		while ((match = regex.exec(cleaned)) !== null) {
			salvaged.push({
				start: Number(match[1]),
				end: Number(match[2]),
				text: match[3]?.replace(/\\"/g, '"').trim(),
			});
		}
		if (salvaged.length > 0) {
			return { language: "es", segments: salvaged };
		}
	}
	return null;
}

function normalizeChunkSegments({
	rawSegments,
	timeOffsetSec,
	maxEndSec,
}: {
	rawSegments: Array<{ start?: number; end?: number; text?: string }>;
	timeOffsetSec: number;
	maxEndSec?: number;
}): TranscribeSegment[] {
	const segments: TranscribeSegment[] = [];
	for (const seg of rawSegments) {
		const text = String(seg.text ?? "").trim();
		if (!text) continue;
		const relStart = Math.max(0, Number(seg.start ?? 0));
		const relEnd = Math.max(
			relStart + 0.35,
			Number(seg.end ?? relStart + 1.5),
		);
		const absStart = Number((timeOffsetSec + relStart).toFixed(3));
		let absEnd = Number((timeOffsetSec + relEnd).toFixed(3));
		if (maxEndSec !== undefined) {
			if (absStart >= maxEndSec - 0.08) continue;
			absEnd = Math.min(maxEndSec, Math.max(absStart + 0.25, absEnd));
		}
		segments.push({
			start: absStart,
			end: Number(absEnd.toFixed(3)),
			text,
			words: interpolateWords(text, absStart, absEnd),
		});
	}
	return segments;
}

async function transcribeChunkWithOpenAIWhisper({
	chunkPath,
	language,
	timeOffsetSec,
	maxEndSec,
	apiKey,
}: {
	chunkPath: string;
	language: string;
	timeOffsetSec: number;
	maxEndSec?: number;
	apiKey: string;
}): Promise<{ language?: string; segments: TranscribeSegment[] } | null> {
	try {
		const fileBuf = await fs.readFile(chunkPath);
		const form = new FormData();
		form.append(
			"file",
			new Blob([fileBuf], { type: "audio/mp3" }),
			"chunk.mp3",
		);
		form.append("model", "whisper-1");
		form.append("response_format", "verbose_json");
		if (language && language !== "auto") {
			form.append("language", language);
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 25000);
		const resp = await fetch(
			"https://api.openai.com/v1/audio/transcriptions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: form,
				signal: controller.signal,
			},
		);
		clearTimeout(timer);
		if (!resp.ok) return null;

		const data = (await resp.json()) as {
			language?: string;
			segments?: Array<{ start?: number; end?: number; text?: string }>;
		};
		if (!Array.isArray(data.segments)) return null;

		return {
			language: data.language,
			segments: normalizeChunkSegments({
				rawSegments: data.segments,
				timeOffsetSec,
				maxEndSec,
			}),
		};
	} catch {
		return null;
	}
}

async function transcribeChunkWithLocalWhisper({
	chunkPath,
	language,
	timeOffsetSec,
	maxEndSec,
}: {
	chunkPath: string;
	language: string;
	timeOffsetSec: number;
	maxEndSec?: number;
}): Promise<{ language?: string; segments: TranscribeSegment[] } | null> {
	try {
		const pythonBin = resolvePythonBinary();
		const scriptPath = resolveScriptPath();
		const { stdout } = await execFileAsync(
			pythonBin,
			[scriptPath, chunkPath, language || "auto"],
			{
				timeout: 60_000,
				maxBuffer: 8 * 1024 * 1024,
			},
		);
		const trimmed = stdout.trim();
		const lastLine = trimmed.split("\n").pop() || trimmed;
		const parsed = JSON.parse(lastLine) as {
			ok?: boolean;
			language?: string;
			segments?: Array<{ start?: number; end?: number; text?: string }>;
		};
		if (!parsed?.ok || !Array.isArray(parsed.segments)) return null;
		return {
			language: parsed.language,
			segments: normalizeChunkSegments({
				rawSegments: parsed.segments,
				timeOffsetSec,
				maxEndSec,
			}),
		};
	} catch {
		return null;
	}
}

async function transcribeSingleChunkWithFallback({
	chunkPath,
	mimeType,
	language,
	timeOffsetSec,
	maxEndSec,
	geminiKeys,
	openaiKeys,
}: {
	chunkPath: string;
	mimeType: string;
	language: string;
	timeOffsetSec: number;
	maxEndSec?: number;
	geminiKeys: string[];
	openaiKeys: string[];
}): Promise<{
	language?: string;
	segments: TranscribeSegment[];
} | null> {
	const chunkBuffer = await fs.readFile(chunkPath);
	const b64Audio = chunkBuffer.toString("base64");
	const langHint =
		language && language !== "auto"
			? `The spoken language is "${language}".`
			: "Detect the spoken language automatically.";

	const models = [
		"gemini-flash-lite-latest",
		"gemini-2.5-flash",
		"gemini-3.1-flash-lite-preview",
		"gemini-3-flash-preview",
	];

	for (const apiKey of geminiKeys) {
		for (const model of models) {
			try {
				const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
				const payload = {
					contents: [
						{
							parts: [
								{
									inlineData: {
										mimeType: mimeType || "audio/mp3",
										data: b64Audio,
									},
								},
								{
									text:
										`Transcribe ALL spoken words in this audio chunk from start (0.0s) to the end of the chunk with accurate start and end timestamps in seconds relative to this chunk. ` +
										`${langHint} Break sentences into short natural phrases of 3 to 6 words. If there is no speech at all (only silence or music without vocals), return {"language":"es","segments":[]}. ` +
										`Return ONLY valid JSON: {"language": "es", "segments": [{"start": 0.0, "end": 1.8, "text": "..."}]}`,
								},
							],
						},
					],
					generationConfig: {
						responseMimeType: "application/json",
						temperature: 0.0,
						maxOutputTokens: 2048,
					},
				};

				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 22000);
				const resp = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
					signal: controller.signal,
				});
				clearTimeout(timeout);

				if (resp.status === 429 || resp.status === 503) {
					await new Promise((r) => setTimeout(r, 450));
					continue;
				}
				if (!resp.ok) continue;

				const data = (await resp.json()) as {
					candidates?: Array<{
						content?: { parts?: Array<{ text?: string; thought?: boolean }> };
					}>;
				};
				const parts = data.candidates?.[0]?.content?.parts ?? [];
				const rawJsonText = parts
					.filter((p) => !p.thought)
					.map((p) => p.text ?? "")
					.join("")
					.trim();
				if (!rawJsonText) continue;

				const parsed = parseSegmentsResiliently(rawJsonText);
				if (!parsed) continue;

				return {
					language: parsed.language,
					segments: normalizeChunkSegments({
						rawSegments: parsed.segments,
						timeOffsetSec,
						maxEndSec,
					}),
				};
			} catch {
				// try next model in Sinaí pool
			}
		}
	}

	// Fallback 2: OpenAI Whisper from Sinaí keys_pool.json
	for (const oaiKey of openaiKeys) {
		const oaiRes = await transcribeChunkWithOpenAIWhisper({
			chunkPath,
			language,
			timeOffsetSec,
			maxEndSec,
			apiKey: oaiKey,
		});
		if (oaiRes) return oaiRes;
	}

	// Fallback 3: Local Faster-Whisper on this specific chunk
	return transcribeChunkWithLocalWhisper({
		chunkPath,
		language,
		timeOffsetSec,
		maxEndSec,
	});
}

async function transcribeAllChunksGuaranteed({
	chunkFiles,
	language,
}: {
	chunkFiles: Array<{
		path: string;
		offsetSec: number;
		maxEndSec?: number;
		mimeType: string;
	}>;
	language: string;
}): Promise<{
	ok: boolean;
	engine: string;
	language: string;
	duration: number;
	text: string;
	segments: TranscribeSegment[];
} | null> {
	if (chunkFiles.length === 0) return null;
	const geminiKeys = await readProviderKeys("gemini");
	const openaiKeys = await readProviderKeys("openai");

	// Use concurrency = 2 to avoid burst 429 on single API key while staying fast
	const CONCURRENCY = 2;
	const results: Array<{
		language?: string;
		segments: TranscribeSegment[];
	} | null> = new Array(chunkFiles.length).fill(null);

	for (let i = 0; i < chunkFiles.length; i += CONCURRENCY) {
		const slice = chunkFiles.slice(i, i + CONCURRENCY);
		await Promise.all(
			slice.map(async (item, idx) => {
				results[i + idx] = await transcribeSingleChunkWithFallback({
					chunkPath: item.path,
					mimeType: item.mimeType,
					language,
					timeOffsetSec: item.offsetSec,
					maxEndSec: item.maxEndSec,
					geminiKeys,
					openaiKeys,
				});
			}),
		);
	}

	const allSegments: TranscribeSegment[] = [];
	let detectedLang = language && language !== "auto" ? language : "es";
	let anySuccess = false;

	for (const res of results) {
		if (!res) continue;
		anySuccess = true;
		if (res.language && detectedLang === "es") {
			detectedLang = res.language;
		}
		for (const seg of res.segments) {
			allSegments.push(seg);
		}
	}

	if (!anySuccess || allSegments.length === 0) {
		return null;
	}

	allSegments.sort((a, b) => a.start - b.start);
	const duration = allSegments[allSegments.length - 1]!.end;

	return {
		ok: true,
		engine: "sinai-pool-stt",
		language: detectedLang,
		duration,
		text: allSegments.map((s) => s.text).join(" "),
		segments: allSegments,
	};
}

function selectPrimaryTimelineClips(
	clips: TimelineClipDescriptor[],
): TimelineClipDescriptor[] {
	const valid = clips.filter(
		(c) =>
			c &&
			typeof c.mediaId === "string" &&
			c.durationSec > 0.25 &&
			resolveMediaPoolFile(c.mediaId) !== null,
	);
	if (valid.length === 0) return [];

	const longAudioClips = valid.filter(
		(c) => c.trackType === "audio" && c.durationSec >= 5,
	);

	const selected: TimelineClipDescriptor[] = [];
	for (const clip of valid) {
		if (clip.trackType !== "audio" && longAudioClips.length > 0) {
			const clipStart = clip.startTimeSec;
			const clipEnd = clip.startTimeSec + clip.durationSec;
			let coveredSec = 0;
			for (const aud of longAudioClips) {
				const aStart = aud.startTimeSec;
				const aEnd = aud.startTimeSec + aud.durationSec;
				const overlap = Math.max(
					0,
					Math.min(clipEnd, aEnd) - Math.max(clipStart, aStart),
				);
				coveredSec += overlap;
			}
			if (coveredSec >= clip.durationSec * 0.5) {
				continue;
			}
		}
		if (
			clip.trackType === "audio" &&
			clip.durationSec < 2.2 &&
			longAudioClips.length > 0
		) {
			continue;
		}
		selected.push(clip);
	}

	selected.sort((a, b) => a.startTimeSec - b.startTimeSec);
	return selected;
}

function writeWavFileFromPcm16(
	samples: Int16Array,
	sampleRate: number,
): Buffer {
	const dataByteLength = samples.length * 2;
	const buf = Buffer.allocUnsafe(44 + dataByteLength);
	buf.write("RIFF", 0);
	buf.writeUInt32LE(36 + dataByteLength, 4);
	buf.write("WAVE", 8);
	buf.write("fmt ", 12);
	buf.writeUInt32LE(16, 16); // PCM chunk size
	buf.writeUInt16LE(1, 20); // PCM format
	buf.writeUInt16LE(1, 22); // Mono
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 2, 28); // Byte rate
	buf.writeUInt16LE(2, 32); // Block align
	buf.writeUInt16LE(16, 34); // Bits per sample
	buf.write("data", 36);
	buf.writeUInt32LE(dataByteLength, 40);
	Buffer.from(
		samples.buffer,
		samples.byteOffset,
		samples.byteLength,
	).copy(buf, 44);
	return buf;
}

async function buildChunkFilesFromTimelineClips({
	clips,
	workDir,
}: {
	clips: TimelineClipDescriptor[];
	workDir: string;
}): Promise<
	Array<{
		path: string;
		offsetSec: number;
		maxEndSec?: number;
		mimeType: string;
	}>
> {
	const selected = selectPrimaryTimelineClips(clips);
	if (selected.length === 0) return [];

	const totalDurationSec = Math.min(
		1800,
		Math.max(...selected.map((c) => c.startTimeSec + c.durationSec)),
	);
	if (totalDurationSec <= 0.2) return [];

	// Mix all selected timeline clips into a single continuous 16kHz mono PCM timeline buffer
	// so split clips and multi-track edits produce clean, uniform 25-second chunks across the full video
	const totalSamples = Math.ceil(totalDurationSec * SAMPLE_RATE);
	const masterPcm = new Int16Array(totalSamples);
	let mixedAny = false;

	await Promise.all(
		selected.map(async (clip, idx) => {
			const mediaPath = resolveMediaPoolFile(clip.mediaId);
			if (!mediaPath) return;
			const rawPath = path.join(workDir, `raw_clip_${idx}.pcm`);
			try {
				await execFileAsync(
					"ffmpeg",
					[
						"-y",
						"-ss",
						String(Math.max(0, clip.trimStartSec)),
						"-t",
						String(Math.max(0.2, clip.durationSec)),
						"-i",
						mediaPath,
						"-vn",
						"-ar",
						String(SAMPLE_RATE),
						"-ac",
						"1",
						"-f",
						"s16le",
						rawPath,
					],
					{ timeout: 25_000 },
				);
				if (!existsSync(rawPath)) return;
				const rawBuf = await fs.readFile(rawPath);
				if (rawBuf.byteLength < 64) return;

				const sampleCount = Math.floor(rawBuf.byteLength / 2);
				const destOffset = Math.max(
					0,
					Math.round(clip.startTimeSec * SAMPLE_RATE),
				);
				for (let s = 0; s < sampleCount; s++) {
					const targetIdx = destOffset + s;
					if (targetIdx >= totalSamples) break;
					const sample = rawBuf.readInt16LE(s * 2);
					const combined = masterPcm[targetIdx]! + sample;
					masterPcm[targetIdx] = Math.max(-32768, Math.min(32767, combined));
				}
				mixedAny = true;
			} catch {
				// clip has no audio stream
			}
		}),
	);

	if (!mixedAny) return [];

	// Slice masterPcm into uniform 25-second MP3 chunks covering 0.0s .. totalDurationSec
	const chunkFiles: Array<{
		path: string;
		offsetSec: number;
		maxEndSec?: number;
		mimeType: string;
	}> = [];
	const chunkCount = Math.ceil(totalDurationSec / CHUNK_SECONDS);

	for (let cIdx = 0; cIdx < chunkCount; cIdx++) {
		const offsetSec = cIdx * CHUNK_SECONDS;
		const endSec = Math.min(totalDurationSec, (cIdx + 1) * CHUNK_SECONDS);
		const durSec = endSec - offsetSec;
		if (durSec < 0.35) continue;

		const startSample = Math.floor(offsetSec * SAMPLE_RATE);
		const endSample = Math.min(totalSamples, Math.floor(endSec * SAMPLE_RATE));
		const slicePcm = masterPcm.subarray(startSample, endSample);

		// Check if chunk is completely silent (all zeros)
		let maxAmp = 0;
		for (let i = 0; i < slicePcm.length; i += 16) {
			const a = Math.abs(slicePcm[i]!);
			if (a > maxAmp) maxAmp = a;
		}
		if (maxAmp < 35) continue;

		const wavPath = path.join(workDir, `timeline_chunk_${cIdx}.wav`);
		const mp3Path = path.join(workDir, `timeline_chunk_${cIdx}.mp3`);
		await fs.writeFile(wavPath, writeWavFileFromPcm16(slicePcm, SAMPLE_RATE));

		try {
			await execFileAsync(
				"ffmpeg",
				[
					"-y",
					"-i",
					wavPath,
					"-c:a",
					"libmp3lame",
					"-b:a",
					"48k",
					mp3Path,
				],
				{ timeout: 15_000 },
			);
			if (existsSync(mp3Path)) {
				chunkFiles.push({
					path: mp3Path,
					offsetSec: Number(offsetSec.toFixed(3)),
					maxEndSec: Number(endSec.toFixed(3)),
					mimeType: "audio/mp3",
				});
			}
		} catch {
			chunkFiles.push({
				path: wavPath,
				offsetSec: Number(offsetSec.toFixed(3)),
				maxEndSec: Number(endSec.toFixed(3)),
				mimeType: "audio/wav",
			});
		}
	}

	return chunkFiles;
}

export async function POST(request: Request) {
	let workDir: string | null = null;
	try {
		const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		workDir = path.join(os.tmpdir(), `opencut-stt-${runId}`);
		await fs.mkdir(workDir, { recursive: true });

		const contentType = request.headers.get("content-type") || "";

		// Fast path 1: JSON timeline clip descriptors (mixes full timeline on server and transcribes 100% of chunks)
		if (contentType.includes("application/json")) {
			const body = (await request.json()) as {
				language?: string;
				clips?: TimelineClipDescriptor[];
			};
			const languageField = String(body.language ?? "auto")
				.trim()
				.toLowerCase();
			const clips = Array.isArray(body.clips) ? body.clips : [];

			const chunkFiles = await buildChunkFilesFromTimelineClips({
				clips,
				workDir,
			});
			if (chunkFiles.length === 0) {
				return NextResponse.json(
					{
						ok: false,
						error:
							"No se encontraron clips con audio en el pool del servidor.",
					},
					{ status: 404 },
				);
			}

			const fullTranscript = await transcribeAllChunksGuaranteed({
				chunkFiles,
				language: languageField,
			});
			if (fullTranscript && fullTranscript.segments.length > 0) {
				return NextResponse.json(fullTranscript);
			}

			return NextResponse.json(
				{
					ok: false,
					error: "No se detectaron diálogos en las pistas del proyecto.",
				},
				{ status: 422 },
			);
		}

		// Path 2: Multipart FormData upload (audio blob or single media file)
		const formData = await request.formData();
		const audioField = formData.get("audio");
		const languageField = String(formData.get("language") ?? "auto")
			.trim()
			.toLowerCase();

		if (!audioField || !(audioField instanceof Blob)) {
			return NextResponse.json(
				{
					ok: false,
					error: "No se recibió el archivo de audio para transcribir.",
				},
				{ status: 400 },
			);
		}

		const arrayBuffer = await audioField.arrayBuffer();
		const inputBuffer = Buffer.from(arrayBuffer);
		if (inputBuffer.byteLength < 64) {
			return NextResponse.json(
				{ ok: false, error: "El archivo de audio está vacío." },
				{ status: 400 },
			);
		}

		const origName =
			"name" in audioField && typeof audioField.name === "string"
				? audioField.name
				: "timeline-audio.wav";
		const ext = path.extname(origName) || ".bin";
		const inputPath = path.join(workDir, `input${ext}`);
		await fs.writeFile(inputPath, inputBuffer);

		const chunkPattern = path.join(workDir, "chunk_%03d.mp3");
		let chunkFiles: Array<{
			path: string;
			offsetSec: number;
			mimeType: string;
		}> = [];

		try {
			await execFileAsync(
				"ffmpeg",
				[
					"-y",
					"-i",
					inputPath,
					"-vn",
					"-ar",
					"16000",
					"-ac",
					"1",
					"-c:a",
					"libmp3lame",
					"-b:a",
					"48k",
					"-f",
					"segment",
					"-segment_time",
					String(CHUNK_SECONDS),
					chunkPattern,
				],
				{ timeout: 30_000 },
			);

			const entries = (await fs.readdir(workDir))
				.filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
				.sort();

			chunkFiles = entries.map((fname, idx) => ({
				path: path.join(workDir!, fname),
				offsetSec: idx * CHUNK_SECONDS,
				mimeType: "audio/mp3",
			}));
		} catch {
			chunkFiles = [
				{
					path: inputPath,
					offsetSec: 0,
					mimeType: "audio/wav",
				},
			];
		}

		const fullTranscript = await transcribeAllChunksGuaranteed({
			chunkFiles,
			language: languageField,
		});
		if (fullTranscript && fullTranscript.segments.length > 0) {
			return NextResponse.json(fullTranscript);
		}

		return NextResponse.json(
			{
				ok: false,
				error:
					"No se pudo transcribir en servidor; usando motor local del navegador.",
			},
			{ status: 502 },
		);
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Error procesando transcripción de audio.",
			},
			{ status: 500 },
		);
	} finally {
		if (workDir) {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	}
}
