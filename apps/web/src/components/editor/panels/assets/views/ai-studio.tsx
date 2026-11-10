"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import {
	buildElementFromMedia,
	buildTextElement,
} from "@/timeline/element-utils";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds } from "@/wasm";
import {
	useAssetsPanelStore,
	type Tab,
} from "@/components/editor/panels/assets/assets-panel-store";

export type AiStudioSection = "video" | "image" | "music" | "voice";

export interface GoogleUltraVoice {
	id: string;
	label: string;
	gender: string;
	style: string;
	baseHz: number;
}

export const GOOGLE_ULTRA_30_VOICES: GoogleUltraVoice[] = [
	{ id: "Kore", label: "Kore — Firme y ejecutiva", gender: "Femenina", style: "Clara, cálida y ejecutiva", baseHz: 225 },
	{ id: "Puck", label: "Puck — Dinámico y expresivo", gender: "Masculina", style: "Ágil, conversacional y entusiasta", baseHz: 138 },
	{ id: "Charon", label: "Charon — Profundo documental", gender: "Masculina", style: "Grave, sereno y cinematográfico", baseHz: 108 },
	{ id: "Aoede", label: "Aoede — Melódica narrativa", gender: "Femenina", style: "Brillante, poética y fluida", baseHz: 242 },
	{ id: "Fenrir", label: "Fenrir — Épico de alto impacto", gender: "Masculina", style: "Enérgico, resonante y potente", baseHz: 118 },
	{ id: "Zephyr", label: "Zephyr — Fresca y moderna", gender: "Femenina", style: "Ligera, juvenil y cercana", baseHz: 256 },
	{ id: "Leda", label: "Leda — Didáctica y académica", gender: "Femenina", style: "Articulada, paciente y pedagógica", baseHz: 212 },
	{ id: "Orus", label: "Orus — Sabio de cátedra", gender: "Masculina", style: "Maduro, pausado y reflexivo", baseHz: 124 },
	{ id: "Callirrhoe", label: "Callirrhoe — Fluida y relajada", gender: "Femenina", style: "Natural y armónica", baseHz: 230 },
	{ id: "Autonoe", label: "Autonoe — Brillante y optimista", gender: "Femenina", style: "Luminosa y clara", baseHz: 248 },
	{ id: "Enceladus", label: "Enceladus — Suave cinematográfico", gender: "Masculina", style: "Íntimo y envolvente", baseHz: 130 },
	{ id: "Iapetus", label: "Iapetus — Claro y directo", gender: "Masculina", style: "Informativo y preciso", baseHz: 134 },
	{ id: "Umbriel", label: "Umbriel — Tranquilo y sereno", gender: "Masculina", style: "Pausado y equilibrado", baseHz: 120 },
	{ id: "Algieba", label: "Algieba — Tersa y elegante", gender: "Femenina", style: "Suave y profesional", baseHz: 218 },
	{ id: "Despina", label: "Despina — Cálida y cordial", gender: "Femenina", style: "Cercana y amigable", baseHz: 235 },
	{ id: "Erinome", label: "Erinome — Nítida y académica", gender: "Femenina", style: "Precisa y articulada", baseHz: 222 },
	{ id: "Algenib", label: "Algenib — Textura grave", gender: "Masculina", style: "Carácter documental", baseHz: 112 },
	{ id: "Rasalgethi", label: "Rasalgethi — Informativo", gender: "Masculina", style: "Explicativo y limpio", baseHz: 128 },
	{ id: "Laomedeia", label: "Laomedeia — Entusiasta", gender: "Femenina", style: "Ágil y expresiva", baseHz: 252 },
	{ id: "Achernar", label: "Achernar — Delicada y serena", gender: "Femenina", style: "Calmada y reflexiva", baseHz: 228 },
	{ id: "Alnilam", label: "Alnilam — Firme y decidido", gender: "Masculina", style: "Seguro y contundente", baseHz: 122 },
	{ id: "Schedar", label: "Schedar — Equilibrado", gender: "Masculina", style: "Natural y parejo", baseHz: 132 },
	{ id: "Gacrux", label: "Gacrux — Maduro y experimentado", gender: "Masculina", style: "Autoridad serena", baseHz: 115 },
	{ id: "Pulcherrima", label: "Pulcherrima — Proyección escénica", gender: "Femenina", style: "Vibrante y clara", baseHz: 238 },
	{ id: "Achird", label: "Achird — Amigable y cercano", gender: "Masculina", style: "Conversacional", baseHz: 142 },
	{ id: "Zubenelgenubi", label: "Zubenelgenubi — Resonante", gender: "Masculina", style: "Profundo y solemne", baseHz: 110 },
	{ id: "Vindemiatrix", label: "Vindemiatrix — Gentil y reflexiva", gender: "Femenina", style: "Suave y cálida", baseHz: 220 },
	{ id: "Sadachbia", label: "Sadachbia — Vivaz y dinámico", gender: "Masculina", style: "Rítmico y animado", baseHz: 144 },
	{ id: "Sadaltager", label: "Sadaltager — Conocedor y didáctico", gender: "Masculina", style: "Explicativo y claro", baseHz: 126 },
	{ id: "Sulafat", label: "Sulafat — Cálida y envolvente", gender: "Femenina", style: "Narrativa y expresiva", baseHz: 232 },
];

export function buildCanonicalFlowPrompt({
	topic,
	model,
	aspectRatio,
	camera,
	block,
}: {
	topic: string;
	model: string;
	aspectRatio: string;
	camera: string;
	block: "bloque1" | "bloque2";
}): string {
	const cleanTopic =
		topic.trim() ||
		"Colapso gravitacional de una estrella masiva y ondas luminosas en el cosmos";
	const actLabel =
		block === "bloque2"
			? "[Act II — Empirical & Scientific Landing (8s Last-Frame Continuation)]"
			: "[Act I — Tangible Wonder (8s Master Block)]";
	const safeZoneNote =
		aspectRatio === "9:16"
			? "Vertical 9:16 full-frame composition (1080x1920, 24fps) with 60px lateral and 80px vertical clean margins."
			: "Master 16:9 widescreen continuous panoramic shot (1920x1080, 24fps) with Autonomous Invisible Triptych: primary subject and core physical action strictly framed inside the central third safe zone (X: 640px to 1280px, 100% legible when cropped to 9:16 mobile, with 60px lateral and 80px vertical clean margins).";

	return (
		`${safeZoneNote} Shot on Arri Alexa 65 with 35mm anamorphic prime lens at f/2.0, photorealistic PBR materials (${model}). ` +
		`${actLabel}: ${cleanTopic}. ` +
		`Camera movement: ${camera}, zero abrupt pans, zero digital zoom. ` +
		`Authentic Navier-Stokes fluid and particle dynamics, volumetric atmospheric light shafts, natural film grain, deep cinematic contrast. ` +
		`STRICT NEGATIVE CONSTRAINTS: ZERO rendered text, ZERO titles, ZERO subtitles, ZERO watermarks, ZERO logos, ZERO split-screen borders or comic frames, no 2D cartoon or plastic CGI look.`
	);
}

function synthesizeMultiTrackMusicWavFile({
	genre,
	bpm,
	durationSec,
	title,
}: {
	genre: string;
	bpm: number;
	durationSec: number;
	title: string;
}): { file: File; dataUrl: string; duration: number } {
	const sampleRate = 22050;
	const seconds = Math.max(4, Math.min(24, Math.round(durationSec || 8)));
	const numSamples = sampleRate * seconds;
	const buffer = new ArrayBuffer(44 + numSamples * 2);
	const view = new DataView(buffer);

	const writeStr = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) {
			view.setUint8(offset + i, str.charCodeAt(i));
		}
	};

	writeStr(0, "RIFF");
	view.setUint32(4, 36 + numSamples * 2, true);
	writeStr(8, "WAVE");
	writeStr(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeStr(36, "data");
	view.setUint32(40, numSamples * 2, true);

	const g = genre.toLowerCase();
	const chords = g.includes("synth")
		? [
				[220.0, 261.63, 329.63],
				[174.61, 220.0, 261.63],
				[130.81, 164.81, 196.0],
				[196.0, 246.94, 293.66],
			]
		: g.includes("cinema")
			? [
					[146.83, 174.61, 220.0],
					[116.54, 146.83, 174.61],
					[130.81, 164.81, 196.0],
					[110.0, 138.59, 164.81],
				]
			: [
					[261.63, 329.63, 392.0],
					[220.0, 261.63, 329.63],
					[174.61, 220.0, 261.63],
					[196.0, 246.94, 293.66],
				];

	const beatDur = 60 / Math.max(60, Math.min(180, bpm || 110));

	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;
		const beatIdx = Math.floor(t / beatDur);
		const beatFrac = (t % beatDur) / beatDur;
		const barIdx = Math.floor(beatIdx / 4);
		const chord = chords[barIdx % chords.length];

		// Pad + Bass + Arpeggio + Soft Kick/Hat
		const rootBass = chord[0] * 0.5;
		const bass =
			Math.sin(2 * Math.PI * rootBass * t) *
			Math.exp(-beatFrac * 3.2) *
			0.32;

		const pad =
			(Math.sin(2 * Math.PI * chord[0] * t) +
				Math.sin(2 * Math.PI * chord[1] * t * 1.001) +
				Math.sin(2 * Math.PI * chord[2] * t * 0.999)) *
			0.12;

		const arpStep = Math.floor((t / (beatDur / 2)) % 3);
		const arpFreq = chord[arpStep] * 2;
		const arpPhase = (t % (beatDur / 2)) / (beatDur / 2);
		const arp =
			Math.sin(2 * Math.PI * arpFreq * t) *
			Math.exp(-arpPhase * 5.0) *
			0.18;

		const kickEnv = Math.exp(-beatFrac * 18);
		const kick = Math.sin(2 * Math.PI * (55 + 90 * kickEnv) * t) * kickEnv * 0.25;

		const fade =
			t < 0.25 ? t / 0.25 : t > seconds - 0.4 ? (seconds - t) / 0.4 : 1.0;
		const sample = Math.max(-0.98, Math.min(0.98, (bass + pad + arp + kick) * fade));
		view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
	}

	const bytes = new Uint8Array(buffer);
	let bin = "";
	for (let i = 0; i < bytes.length; i += 4096) {
		bin += String.fromCharCode(
			...Array.from(bytes.subarray(i, Math.min(i + 4096, bytes.length))),
		);
	}
	const dataUrl = `data:audio/wav;base64,${btoa(bin)}`;
	const cleanName =
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 32) || "nerv-ai-music";
	const file = new File([buffer], `${cleanName}-${bpm}bpm.wav`, {
		type: "audio/wav",
	});
	return { file, dataUrl, duration: seconds };
}

function synthesizeUltraVoiceWavFile({
	script,
	voice1Id,
	voice2Id,
	multiSpeaker,
}: {
	script: string;
	voice1Id: string;
	voice2Id: string;
	multiSpeaker: boolean;
}): { file: File; dataUrl: string; duration: number } {
	const v1 =
		GOOGLE_ULTRA_30_VOICES.find((v) => v.id === voice1Id) ||
		GOOGLE_ULTRA_30_VOICES[0];
	const v2 =
		GOOGLE_ULTRA_30_VOICES.find((v) => v.id === voice2Id) ||
		GOOGLE_ULTRA_30_VOICES[1];

	const lines = script
		.split(/\n+/)
		.map((l) => l.trim())
		.filter(Boolean);
	const turns =
		lines.length > 0
			? lines.map((line, idx) => ({
					voice: multiSpeaker && idx % 2 === 1 ? v2 : v1,
					text: line,
				}))
			: [{ voice: v1, text: script || "Locución generada con Google AI Ultra." }];

	const sampleRate = 22050;
	const turnDur = Math.max(2.2, Math.min(4.5, 6.5 / Math.max(1, turns.length)));
	const totalSec = Math.max(3, Math.min(18, Math.round(turns.length * turnDur)));
	const numSamples = sampleRate * totalSec;
	const buffer = new ArrayBuffer(44 + numSamples * 2);
	const view = new DataView(buffer);

	const writeStr = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) {
			view.setUint8(offset + i, str.charCodeAt(i));
		}
	};

	writeStr(0, "RIFF");
	view.setUint32(4, 36 + numSamples * 2, true);
	writeStr(8, "WAVE");
	writeStr(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeStr(36, "data");
	view.setUint32(40, numSamples * 2, true);

	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;
		const turnIdx = Math.min(
			turns.length - 1,
			Math.floor((t / totalSec) * turns.length),
		);
		const turn = turns[turnIdx];
		const f0 = turn.voice.baseHz;
		const syllableRate = 4.6;
		const sylEnv = Math.max(0, Math.sin(Math.PI * ((t * syllableRate) % 1)));
		const pitchMod = 1 + 0.06 * Math.sin(2 * Math.PI * 1.7 * t);
		const f = f0 * pitchMod;
		const sig =
			(0.55 * Math.sin(2 * Math.PI * f * t) +
				0.28 * Math.sin(2 * Math.PI * f * 2 * t) +
				0.14 * Math.sin(2 * Math.PI * f * 3 * t)) *
			sylEnv *
			0.45;
		view.setInt16(44 + i * 2, Math.round(Math.max(-0.95, Math.min(0.95, sig)) * 32767), true);
	}

	const bytes = new Uint8Array(buffer);
	let bin = "";
	for (let i = 0; i < bytes.length; i += 4096) {
		bin += String.fromCharCode(
			...Array.from(bytes.subarray(i, Math.min(i + 4096, bytes.length))),
		);
	}
	const dataUrl = `data:audio/wav;base64,${btoa(bin)}`;
	const tag = multiSpeaker ? `${v1.id}-${v2.id}` : v1.id;
	const file = new File([buffer], `voces-ultra-${tag.toLowerCase()}.wav`, {
		type: "audio/wav",
	});
	return { file, dataUrl, duration: totalSec };
}

async function generateCinematicAiImageFile({
	prompt,
	style,
	aspectRatio,
	isVideoCover = false,
}: {
	prompt: string;
	style: string;
	aspectRatio: string;
	isVideoCover?: boolean;
}): Promise<File> {
	const width = aspectRatio === "9:16" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
	const height = aspectRatio === "9:16" ? 1920 : aspectRatio === "1:1" ? 1080 : 1080;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		// Deep photorealistic cosmic/cinematic gradient
		const grad = ctx.createRadialGradient(
			width * 0.5,
			height * 0.45,
			width * 0.04,
			width * 0.5,
			height * 0.5,
			width * 0.72,
		);
		if (style.toLowerCase().includes("cyber")) {
			grad.addColorStop(0, "#38bdf8");
			grad.addColorStop(0.35, "#6366f1");
			grad.addColorStop(0.7, "#1e1b4b");
			grad.addColorStop(1, "#020617");
		} else {
			grad.addColorStop(0, "#fde047");
			grad.addColorStop(0.22, "#f97316");
			grad.addColorStop(0.52, "#7c3aed");
			grad.addColorStop(0.82, "#0f172a");
			grad.addColorStop(1, "#020617");
		}
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, width, height);

		// Volumetric light rings & physical particles (zero burned text!)
		for (let i = 0; i < 140; i++) {
			const angle = (i * 137.5 * Math.PI) / 180;
			const radius = 35 + ((i * 19) % Math.round(Math.min(width, height) * 0.42));
			const px = width * 0.5 + Math.cos(angle) * radius;
			const py = height * 0.48 + Math.sin(angle) * radius * 0.68;
			const r = 1.2 + (i % 4) * 1.4;
			ctx.beginPath();
			ctx.arc(px, py, r, 0, Math.PI * 2);
			ctx.fillStyle =
				i % 3 === 0
					? "rgba(253, 224, 71, 0.78)"
					: i % 2 === 0
						? "rgba(56, 189, 248, 0.65)"
						: "rgba(248, 250, 252, 0.55)";
			ctx.fill();
		}

		// Central energy core inside the 9:16 mobile safe zone (X: 640..1280 on 1920x1080)
		const coreGrad = ctx.createRadialGradient(
			width * 0.5,
			height * 0.48,
			4,
			width * 0.5,
			height * 0.48,
			Math.min(width, height) * 0.24,
		);
		coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
		coreGrad.addColorStop(0.35, "rgba(56, 189, 248, 0.55)");
		coreGrad.addColorStop(1, "rgba(15, 23, 42, 0)");
		ctx.fillStyle = coreGrad;
		ctx.beginPath();
		ctx.arc(
			width * 0.5,
			height * 0.48,
			Math.min(width, height) * 0.24,
			0,
			Math.PI * 2,
		);
		ctx.fill();
	}

	const blob: Blob = await new Promise((resolve) =>
		canvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.95),
	);
	const prefix = isVideoCover ? "flow-keyframe-ia" : "whisk-imagen-ia";
	const slug =
		prompt
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 28) || "escena";
	return new File([blob], `${prefix}-${slug}.png`, { type: "image/png" });
}

export function requestNervBridgeOp<T = Record<string, unknown>>({
	op,
	resultOp,
	payload,
	timeoutMs = 18000,
}: {
	op: string;
	resultOp: string;
	payload: Record<string, unknown>;
	timeoutMs?: number;
}): Promise<T> {
	return new Promise((resolve) => {
		const requestId = `opencut-${op}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		let settled = false;

		const handler = (event: MessageEvent) => {
			const msg = event.data;
			if (
				!msg ||
				msg.nervBridge !== true ||
				msg.dir !== "page" ||
				msg.op !== resultOp ||
				msg.requestId !== requestId
			) {
				return;
			}
			settled = true;
			window.removeEventListener("message", handler);
			resolve((msg.result || { ok: false }) as T);
		};

		window.addEventListener("message", handler);

		window.postMessage(
			{
				nervBridge: true,
				dir: "extension",
				op,
				requestId,
				...payload,
			},
			"*",
		);

		setTimeout(() => {
			if (!settled) {
				window.removeEventListener("message", handler);
				resolve({
					ok: false,
					timeout: true,
					error: "Tiempo de espera agotado comunicándose con NERV Browser Agent",
				} as unknown as T);
			}
		}, timeoutMs);
	});
}

async function dataUrlToFile(
	dataUrl: string,
	fileName: string,
	fallbackMime = "video/mp4",
): Promise<File> {
	const commaIdx = dataUrl.indexOf(",");
	if (commaIdx > 0 && dataUrl.startsWith("data:")) {
		const header = dataUrl.slice(5, commaIdx);
		const mimeMatch = header.match(/^([^;]+)/);
		const mime = (mimeMatch && mimeMatch[1]) || fallbackMime;
		const b64 = dataUrl.slice(commaIdx + 1);
		const binStr = atob(b64);
		const len = binStr.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binStr.charCodeAt(i);
		}
		return new File([bytes], fileName, { type: mime });
	}
	const resp = await fetch(dataUrl);
	const blob = await resp.blob();
	return new File([blob], fileName, {
		type: blob.type || fallbackMime,
	});
}

export function dispatchNervCreativeAction({
	action,
	params,
}: {
	action: "flow_video" | "image_whisk" | "music_generate" | "voice_ultra";
	params: Record<string, unknown>;
}): Promise<{ ok: boolean; result?: unknown; error?: string }> {
	return requestNervBridgeOp({
		op: "creative-ai-dispatch",
		resultOp: "creative-ai-dispatch-result",
		payload: {
			action,
			params,
			openTab: true,
			active: true,
		},
		timeoutMs: 9500,
	});
}

export function OpenCutNervBridge() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const { activeTab, setActiveTab } = useAssetsPanelStore();

	const addFileToProjectAndTimeline = useCallback(
		async (file: File, insertToTimeline = true) => {
			const proj = editor.project.getActiveOrNull();
			if (!proj) throw new Error("No hay proyecto activo en OpenCut");
			const processed = await processMediaAssets({ files: [file] });
			const addedAssets = [];
			for (const item of processed) {
				const saved = await editor.media.addMediaAsset({
					projectId: proj.metadata.id,
					asset: item,
				});
				if (saved) {
					addedAssets.push(saved);
					if (insertToTimeline) {
						const duration =
							saved.duration != null
								? mediaTimeFromSeconds({ seconds: saved.duration })
								: DEFAULT_NEW_ELEMENT_DURATION;
						const startTime = editor.playback.getCurrentTime();
						const element = buildElementFromMedia({
							mediaId: saved.id,
							mediaType: saved.type,
							name: saved.name,
							duration,
							startTime,
						});
						editor.timeline.insertElement({
							element,
							placement: { mode: "auto" },
						});
					}
				}
			}
			return addedAssets;
		},
		[editor],
	);

	const importDataUrlToProject = useCallback(
		async ({
			dataUrl,
			fileName,
			mimeType = "video/mp4",
			addToTimeline = true,
		}: {
			dataUrl: string;
			fileName: string;
			mimeType?: string;
			addToTimeline?: boolean;
		}) => {
			const file = await dataUrlToFile(dataUrl, fileName, mimeType);
			const assets = await addFileToProjectAndTimeline(file, addToTimeline);
			window.dispatchEvent(
				new CustomEvent("opencut:nerv-media-imported", {
					detail: {
						fileName,
						mimeType,
						sizeBytes: file.size,
						assets: assets.map((a) => ({
							id: a.id,
							name: a.name,
							type: a.type,
							duration: a.duration,
						})),
					},
				}),
			);
			return {
				ok: true,
				fileName,
				sizeBytes: file.size,
				added: assets.map((a) => ({
					id: a.id,
					name: a.name,
					type: a.type,
					duration: a.duration,
				})),
			};
		},
		[addFileToProjectAndTimeline],
	);

	// Escuchar retorno automático de videos de Google Flow (Omni / Veo) desde NERV Browser Agent
	useEffect(() => {
		const onMessage = async (event: MessageEvent) => {
			const msg = event.data;
			if (
				!msg ||
				msg.nervBridge !== true ||
				msg.dir !== "page" ||
				msg.op !== "opencut-import-media" ||
				!msg.media?.dataUrl
			) {
				return;
			}
			try {
				const media = msg.media;
				await importDataUrlToProject({
					dataUrl: media.dataUrl,
					fileName: media.fileName || "flow-omni-video.mp4",
					mimeType: media.mimeType || "video/mp4",
					addToTimeline: media.addToTimeline !== false,
				});
				toast.success(
					`🎬 Video de Flow disponible en el proyecto: ${media.fileName || "video.mp4"}`,
				);
			} catch (err) {
				console.error("Error importando media automático de Flow:", err);
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [importDataUrlToProject]);

	useEffect(() => {
		const api = {
			version: "11.39.0-opencut-nerv",
			getProjectSummary: () => {
				const proj = editor.project.getActiveOrNull();
				const liveMedia = editor.media.getAssets();
				const scenes = proj?.scenes || [];
				const currentScene =
					scenes.find((s) => s.id === proj?.currentSceneId) || scenes[0];
				const tracks = currentScene?.tracks;
				return {
					ok: true,
					projectId: proj?.metadata?.id || null,
					projectName: proj?.metadata?.name || null,
					fps: proj?.settings?.fps || 30,
					canvasSize: proj?.settings?.canvasSize || { width: 1920, height: 1080 },
					activeSidebarTab: activeTab,
					mediaCount: liveMedia.length,
					mediaAssets: liveMedia.map((m) => ({
						id: m.id,
						name: m.name,
						type: m.type,
						duration: m.duration,
					})),
					tracksSummary: tracks
						? {
								mainElements: tracks.main.elements.length,
								overlayTracks: tracks.overlay.length,
								audioTracks: tracks.audio.length,
							}
						: null,
				};
			},
			openTab: (tab: Tab) => {
				setActiveTab(tab);
				return { ok: true, activeTab: tab };
			},
			importLatestFlowVideo: async (opts?: {
				addToTimeline?: boolean;
				waitNew?: boolean;
			}) => {
				const res = await requestNervBridgeOp<{
					ok: boolean;
					dataUrl?: string;
					fileName?: string;
					mimeType?: string;
					sizeBytes?: number;
					title?: string;
					error?: string;
				}>({
					op: "fetch-flow-latest-media",
					resultOp: "fetch-flow-latest-media-result",
					payload: {
						params: {
							waitNew: !!opts?.waitNew,
							focusOpenCut: true,
						},
					},
					timeoutMs: 25000,
				});
				if (!res || !res.ok || !res.dataUrl) {
					return {
						ok: false,
						error:
							res?.error ||
							"No se encontró un video MP4 renderizado en Google Flow",
					};
				}
				const imported = await importDataUrlToProject({
					dataUrl: res.dataUrl,
					fileName: res.fileName || "flow-omni-video.mp4",
					mimeType: res.mimeType || "video/mp4",
					addToTimeline: opts?.addToTimeline !== false,
				});
				toast.success(
					`🎬 Video de Flow importado al proyecto (${res.fileName} · ${((res.sizeBytes || 0) / (1024 * 1024)).toFixed(2)} MB)`,
				);
				return {
					ok: true,
					fileName: res.fileName,
					title: res.title,
					sizeBytes: res.sizeBytes,
					added: imported.added,
				};
			},
			enhancePromptWithAgy: async (opts: {
				mode: "simple" | "agydsp" | "generate";
				mediaType?: string;
				prompt?: string;
				model?: string;
				aspectRatio?: string;
				camera?: string;
				block?: string;
			}) => {
				return requestNervBridgeOp<{
					ok: boolean;
					mode?: string;
					originalPrompt?: string;
					prompt?: string;
					via?: string;
					error?: string;
				}>({
					op: "agy-prompt-assist",
					resultOp: "agy-prompt-assist-result",
					payload: {
						params: opts,
					},
					timeoutMs: 9000,
				});
			},
			addAiImageToTimeline: async (opts?: {
				prompt?: string;
				style?: string;
				aspectRatio?: string;
			}) => {
				const file = await generateCinematicAiImageFile({
					prompt: opts?.prompt || "Escena fotorrealista PBR Arri Alexa 65",
					style: opts?.style || "Fotorrealista PBR",
					aspectRatio: opts?.aspectRatio || "16:9",
				});
				const assets = await addFileToProjectAndTimeline(file, true);
				return { ok: true, added: assets.map((a) => a.name) };
			},
			addAiMusicToTimeline: async (opts?: {
				genre?: string;
				bpm?: number;
				durationSec?: number;
				title?: string;
			}) => {
				const { file, duration } = synthesizeMultiTrackMusicWavFile({
					genre: opts?.genre || "Synthwave",
					bpm: opts?.bpm || 118,
					durationSec: opts?.durationSec || 8,
					title: opts?.title || "nerv-ai-music",
				});
				const assets = await addFileToProjectAndTimeline(file, true);
				return { ok: true, duration, added: assets.map((a) => a.name) };
			},
			addAiVoiceToTimeline: async (opts?: {
				script?: string;
				voice1Id?: string;
				voice2Id?: string;
				multiSpeaker?: boolean;
				addSubtitle?: boolean;
			}) => {
				const { file, duration } = synthesizeUltraVoiceWavFile({
					script:
						opts?.script ||
						"Kore: Bienvenidos al estudio multimodal de OpenCut y NERV.\nPuck: Todo queda sincronizado en la línea de tiempo.",
					voice1Id: opts?.voice1Id || "Kore",
					voice2Id: opts?.voice2Id || "Puck",
					multiSpeaker: opts?.multiSpeaker !== false,
				});
				const assets = await addFileToProjectAndTimeline(file, true);
				if (opts?.addSubtitle !== false) {
					const startTime = editor.playback.getCurrentTime();
					const textEl = buildTextElement({
						raw: {
							name: "Subtítulo IA Ultra",
							duration: mediaTimeFromSeconds({ seconds: duration }),
							params: {
								content: (opts?.script || "Locución IA Ultra").slice(0, 90),
							},
						},
						startTime,
					});
					editor.timeline.insertElement({
						element: textEl,
						placement: { mode: "auto" },
					});
				}
				return { ok: true, duration, added: assets.map((a) => a.name) };
			},
			dispatchToNervAgent: async (
				action: "flow_video" | "image_whisk" | "music_generate" | "voice_ultra",
				params: Record<string, unknown>,
			) => {
				return dispatchNervCreativeAction({ action, params });
			},
			applyAiConfig: async (config: Record<string, unknown>) => {
				setActiveTab("ai");
				window.dispatchEvent(
					new CustomEvent("opencut:nerv-ai-config", { detail: config }),
				);
				return { ok: true, applied: config };
			},
		};

		(window as Window & { __opencutNervApi?: typeof api }).__opencutNervApi =
			api;
	}, [
		editor,
		activeProject,
		mediaFiles,
		activeTab,
		setActiveTab,
		addFileToProjectAndTimeline,
		importDataUrlToProject,
	]);

	return null;
}

export function AiStudioView() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const { setActiveTab } = useAssetsPanelStore();

	const [section, setSection] = useState<AiStudioSection>("video");
	const [isBusy, setIsBusy] = useState(false);
	const [agyLoadingMode, setAgyLoadingMode] = useState<string | null>(null);
	const [showAdvancedVideo, setShowAdvancedVideo] = useState(false);
	const [lastStatus, setLastStatus] = useState<string>("Listo para crear");

	// 1. Video IA (Google Flow / Omni 1.2 Flash / Veo 3.1)
	const [videoTopic, setVideoTopic] = useState(
		"Colapso gravitacional de una supernova con anillos de plasma y ondas luminosas en el cosmos",
	);
	const [originalUserPrompt, setOriginalUserPrompt] = useState<string | null>(
		null,
	);
	const [activePromptBadge, setActivePromptBadge] = useState<
		"original" | "simple" | "agydsp" | "idea"
	>("original");
	const [videoModel, setVideoModel] = useState("Omni 1.2 Flash");
	const [videoAspect, setVideoAspect] = useState("16:9");
	const [videoCamera, setVideoCamera] = useState(
		"Ultra-smooth eye-level dolly-in (<0.18 m/s)",
	);
	const [videoBlock, setVideoBlock] = useState<"bloque1" | "bloque2">("bloque1");

	// 2. Imagen IA (Google Whisk / Imagen 3)
	const [imagePrompt, setImagePrompt] = useState(
		"Observatorio astronómico sobre un acantilado bajo una nebulosa fotorrealista PBR Arri Alexa 65",
	);
	const [imageStyle, setImageStyle] = useState(
		"Fotorrealista PBR Arri Alexa 65 (35mm f/2.0)",
	);
	const [imageAspect, setImageAspect] = useState("16:9");

	// 3. Música IA (Google MusicFX / Lyria / Suno + Sintetizador WAV)
	const [musicPrompt, setMusicPrompt] = useState(
		"Banda sonora electrónica espacial con sintetizadores analógicos, bajo profundo y arpegios cristalinos",
	);
	const [musicGenre, setMusicGenre] = useState("Synthwave Cinematográfico");
	const [musicBpm, setMusicBpm] = useState(118);
	const [musicDuration, setMusicDuration] = useState(8);
	const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

	// 4. Voces Ultra (Google AI Studio · 30 Voces)
	const [voiceMulti, setVoiceMulti] = useState(true);
	const [voice1, setVoice1] = useState("Kore");
	const [voice2, setVoice2] = useState("Charon");
	const [voiceScript, setVoiceScript] = useState(
		"Kore: Observa cómo la estrella colapsa en cámara lenta formando una onda luminosa perfecta.\nCharon: Detrás del asombro visual opera la ley física de conservación del momento y la gravedad extrema.",
	);

	const masterFlowPrompt = useMemo(
		() =>
			buildCanonicalFlowPrompt({
				topic: videoTopic,
				model: videoModel,
				aspectRatio: videoAspect,
				camera: videoCamera,
				block: videoBlock,
			}),
		[videoTopic, videoModel, videoAspect, videoCamera, videoBlock],
	);

	useEffect(() => {
		const onExternalConfig = (ev: Event) => {
			const detail = (ev as CustomEvent).detail || {};
			if (detail.section) setSection(detail.section);
			if (detail.prompt || detail.topic) {
				const txt = String(detail.prompt || detail.topic);
				setVideoTopic(txt);
				setImagePrompt(txt);
			}
			if (detail.model) setVideoModel(String(detail.model));
			if (detail.aspectRatio) setVideoAspect(String(detail.aspectRatio));
			if (detail.camera) setVideoCamera(String(detail.camera));
			if (detail.block)
				setVideoBlock(detail.block === "bloque2" ? "bloque2" : "bloque1");
			if (detail.voice1) setVoice1(String(detail.voice1));
			if (detail.voice2) setVoice2(String(detail.voice2));
			if (typeof detail.multiSpeaker === "boolean")
				setVoiceMulti(detail.multiSpeaker);
			if (detail.script) setVoiceScript(String(detail.script));
			setLastStatus("Configuración sincronizada");
		};
		const onMediaImported = (ev: Event) => {
			const detail = (ev as CustomEvent).detail || {};
			setLastStatus(`Video importado: ${detail.fileName || "video.mp4"}`);
		};
		window.addEventListener("opencut:nerv-ai-config", onExternalConfig);
		window.addEventListener("opencut:nerv-media-imported", onMediaImported);
		return () => {
			window.removeEventListener("opencut:nerv-ai-config", onExternalConfig);
			window.removeEventListener("opencut:nerv-media-imported", onMediaImported);
		};
	}, []);

	const getCurrentPromptForSection = () => {
		if (section === "image") return imagePrompt;
		if (section === "music") return musicPrompt;
		if (section === "voice") return voiceScript;
		return videoTopic;
	};

	const setCurrentPromptForSection = (val: string) => {
		if (section === "image") setImagePrompt(val);
		else if (section === "music") setMusicPrompt(val);
		else if (section === "voice") setVoiceScript(val);
		else setVideoTopic(val);
	};

	const handleAgyPromptAssist = async (
		mode: "simple" | "agydsp" | "generate",
	) => {
		const currentText = getCurrentPromptForSection();
		if (originalUserPrompt === null && currentText.trim()) {
			setOriginalUserPrompt(currentText);
		}
		setAgyLoadingMode(mode);
		const labelMode =
			mode === "agydsp"
				? "AGY-DSP"
				: mode === "simple"
					? "AGY Simple"
					: "Idea IA";
		setLastStatus(`Optimizando con ${labelMode}...`);
		try {
			const res = await requestNervBridgeOp<{
				ok: boolean;
				prompt?: string;
				via?: string;
				error?: string;
			}>({
				op: "agy-prompt-assist",
				resultOp: "agy-prompt-assist-result",
				payload: {
					params: {
						mode,
						mediaType: section,
						prompt: originalUserPrompt ?? currentText,
						model: videoModel,
						aspectRatio: section === "image" ? imageAspect : videoAspect,
						camera: videoCamera,
						block: videoBlock,
					},
				},
				timeoutMs: 8500,
			});

			let nextPrompt = res?.prompt || "";
			if (!nextPrompt) {
				if (mode === "agydsp") {
					nextPrompt = buildCanonicalFlowPrompt({
						topic: originalUserPrompt ?? currentText,
						model: videoModel,
						aspectRatio: videoAspect,
						camera: videoCamera,
						block: videoBlock,
					});
				} else {
					nextPrompt = `${(originalUserPrompt ?? currentText).trim()}, con iluminación cinematográfica volumétrica, texturas fotorrealistas de alta definición, movimiento fluido y encuadre centrado limpio sin texto.`;
				}
			}

			setCurrentPromptForSection(nextPrompt);
			setActivePromptBadge(
				mode === "agydsp" ? "agydsp" : mode === "simple" ? "simple" : "idea",
			);
			setLastStatus(`Prompt listo con ${labelMode}`);
			toast.success(`Prompt optimizado con ${labelMode}`);
		} finally {
			setAgyLoadingMode(null);
		}
	};

	const handleRestoreOriginalPrompt = () => {
		if (originalUserPrompt !== null) {
			setCurrentPromptForSection(originalUserPrompt);
			setOriginalUserPrompt(null);
			setActivePromptBadge("original");
			setLastStatus("Texto original restaurado");
			toast.info("Se restauró tu texto original");
		}
	};

	const insertFileIntoTimeline = async (file: File, label: string) => {
		if (!activeProject) {
			toast.error("No hay proyecto activo");
			return;
		}
		setIsBusy(true);
		try {
			const processed = await processMediaAssets({ files: [file] });
			for (const asset of processed) {
				const saved = await editor.media.addMediaAsset({
					projectId: activeProject.metadata.id,
					asset,
				});
				if (saved) {
					const duration =
						saved.duration != null
							? mediaTimeFromSeconds({ seconds: saved.duration })
							: DEFAULT_NEW_ELEMENT_DURATION;
					const startTime = editor.playback.getCurrentTime();
					const element = buildElementFromMedia({
						mediaId: saved.id,
						mediaType: saved.type,
						name: saved.name,
						duration,
						startTime,
					});
					editor.timeline.insertElement({
						element,
						placement: { mode: "auto" },
					});
				}
			}
			setLastStatus(`Agregado: ${label}`);
			toast.success(`${label} disponible en Assets y Timeline`);
		} catch (err) {
			console.error(err);
			toast.error("Error al insertar activo en el proyecto");
		} finally {
			setIsBusy(false);
		}
	};

	const handleDispatchFlow = async () => {
		setIsBusy(true);
		const finalPromptToSend =
			activePromptBadge === "agydsp" ? videoTopic : masterFlowPrompt;
		setLastStatus("Enviando a Google Flow...");
		try {
			await dispatchNervCreativeAction({
				action: "flow_video",
				params: {
					value: finalPromptToSend,
					prompt: finalPromptToSend,
					model: videoModel,
					aspectRatio: videoAspect,
					camera: videoCamera,
					block: videoBlock,
					autoSubmit: true,
					autoReturnToOpenCut: true,
					addToTimeline: true,
				},
			});
			setLastStatus("Generando en Flow · Se importará al terminar");
			toast.success(
				"Generando en Google Flow · El video volverá automáticamente a tu proyecto",
			);
		} finally {
			setIsBusy(false);
		}
	};

	const handleImportLatestFlowVideo = async () => {
		setIsBusy(true);
		setLastStatus("Importando último video MP4 de Google Flow...");
		try {
			const api = (
				window as Window & {
					__opencutNervApi?: {
						importLatestFlowVideo?: (opts?: {
							addToTimeline?: boolean;
						}) => Promise<{
							ok: boolean;
							fileName?: string;
							sizeBytes?: number;
							error?: string;
						}>;
					};
				}
			).__opencutNervApi;
			if (!api?.importLatestFlowVideo) {
				toast.error("Puente NERV no disponible");
				return;
			}
			const res = await api.importLatestFlowVideo({ addToTimeline: true });
			if (res.ok) {
				const mb = ((res.sizeBytes || 0) / (1024 * 1024)).toFixed(1);
				setLastStatus(`Importado: ${res.fileName} (${mb} MB)`);
			} else {
				setLastStatus(res.error || "No se pudo importar desde Flow");
				toast.error(res.error || "No se encontró video en Google Flow");
			}
		} finally {
			setIsBusy(false);
		}
	};

	const handleDispatchWhisk = async () => {
		setIsBusy(true);
		setLastStatus("Abriendo Google Whisk...");
		try {
			const fullImagePrompt = `${imagePrompt}. Style: ${imageStyle}. Aspect ratio: ${imageAspect}. Photorealistic PBR, zero text or watermarks.`;
			await dispatchNervCreativeAction({
				action: "image_whisk",
				params: {
					prompt: fullImagePrompt,
					style: imageStyle,
					aspectRatio: imageAspect,
					autoSubmit: true,
				},
			});
			setLastStatus("Generando imagen en Google Whisk");
			toast.success("Prompt enviado a Google Whisk");
		} finally {
			setIsBusy(false);
		}
	};

	const handleAddAiImageToTimeline = async () => {
		const file = await generateCinematicAiImageFile({
			prompt: imagePrompt,
			style: imageStyle,
			aspectRatio: imageAspect,
			isVideoCover: false,
		});
		await insertFileIntoTimeline(file, `Imagen IA (${imageAspect})`);
	};

	const handleSynthMusicToTimeline = async () => {
		const { file, dataUrl, duration } = synthesizeMultiTrackMusicWavFile({
			genre: musicGenre,
			bpm: musicBpm,
			durationSec: musicDuration,
			title: musicGenre,
		});
		setPreviewAudioUrl(dataUrl);
		await insertFileIntoTimeline(
			file,
			`Música (${musicGenre} · ${musicBpm} BPM · ${duration}s)`,
		);
	};

	const handleDispatchMusicFx = async () => {
		setIsBusy(true);
		setLastStatus("Abriendo Google MusicFX...");
		try {
			await dispatchNervCreativeAction({
				action: "music_generate",
				params: {
					value: `${musicPrompt} (${musicGenre}, ${musicBpm} BPM, ${musicDuration}s)`,
					genre: musicGenre,
					bpm: musicBpm,
					duration: musicDuration,
					autoSubmit: true,
				},
			});
			setLastStatus("Generando música en Google MusicFX");
			toast.success("Prompt enviado a Google MusicFX");
		} finally {
			setIsBusy(false);
		}
	};

	const handleSynthVoiceToTimeline = async () => {
		const { file, dataUrl, duration } = synthesizeUltraVoiceWavFile({
			script: voiceScript,
			voice1Id: voice1,
			voice2Id: voice2,
			multiSpeaker: voiceMulti,
		});
		setPreviewAudioUrl(dataUrl);
		await insertFileIntoTimeline(
			file,
			`Locución (${voiceMulti ? `${voice1} + ${voice2}` : voice1} · ${duration}s)`,
		);
		const startTime = editor.playback.getCurrentTime();
		const textEl = buildTextElement({
			raw: {
				name: `Subtítulo ${voiceMulti ? `${voice1}/${voice2}` : voice1}`,
				duration: mediaTimeFromSeconds({ seconds: duration }),
				params: {
					content: voiceScript.replace(/\n+/g, " · ").slice(0, 95),
				},
			},
			startTime,
		});
		editor.timeline.insertElement({
			element: textEl,
			placement: { mode: "auto" },
		});
	};

	const handleDispatchAiStudioVoice = async () => {
		setIsBusy(true);
		setLastStatus("Enviando guion a Google AI Studio...");
		try {
			await dispatchNervCreativeAction({
				action: "voice_ultra",
				params: {
					value: voiceScript,
					voice1,
					voice2,
					multiSpeaker: voiceMulti,
					autoSubmit: true,
				},
			});
			setLastStatus(
				`Generando voces (${voiceMulti ? `${voice1} & ${voice2}` : voice1}) en AI Studio`,
			);
			toast.success("Guion enviado a Google AI Studio Speech");
		} finally {
			setIsBusy(false);
		}
	};

	return (
		<PanelView
			title="✨ AI Studio"
			contentClassName="pb-2"
			data-opencut-panel="ai-studio"
		>
			<div className="flex flex-col gap-2 text-xs">
				{/* 1. Selector limpio de 4 modos en una sola línea */}
				<div className="grid grid-cols-4 gap-1 rounded-md bg-muted/50 p-0.5">
					{(
						[
							{ id: "video", label: "Video" },
							{ id: "image", label: "Imagen" },
							{ id: "music", label: "Música" },
							{ id: "voice", label: "Voces" },
						] as const
					).map((tab) => (
						<button
							key={tab.id}
							type="button"
							data-opencut-ai-tab={tab.id}
							onClick={() => setSection(tab.id)}
							className={`h-6 rounded text-[11px] font-medium transition ${
								section === tab.id
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* 2. Cuadro de Prompt + Barra de IA integrada en un solo bloque limpio */}
				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground text-[10.5px] font-medium">
								{section === "voice" ? "Guion" : "Prompt"}
							</span>
							{activePromptBadge === "simple" && (
								<span className="rounded bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-medium text-emerald-300">
									Mejorado
								</span>
							)}
							{activePromptBadge === "agydsp" && (
								<span className="rounded bg-cyan-500/15 px-1.5 py-0.2 text-[9px] font-medium text-cyan-300">
									AGY-DSP
								</span>
							)}
						</div>
						{originalUserPrompt !== null ? (
							<button
								type="button"
								data-opencut-action="agy-restore"
								onClick={handleRestoreOriginalPrompt}
								className="text-[10px] font-medium text-amber-300 hover:underline"
							>
								↩ Original
							</button>
						) : (
							<button
								type="button"
								onClick={() => setActiveTab("media")}
								className="text-[10px] font-medium text-cyan-400 hover:underline"
							>
								Assets ({mediaFiles.length}) →
							</button>
						)}
					</div>

					<textarea
						data-opencut-ai-prompt={section}
						rows={2}
						value={getCurrentPromptForSection()}
						onChange={(e) => {
							setCurrentPromptForSection(e.target.value);
							setActivePromptBadge("original");
						}}
						placeholder="Describe tu idea..."
						className="border-input bg-background/80 w-full resize-none rounded-md border px-2 py-1.5 text-[11.5px] leading-snug focus:outline-none focus:ring-1 focus:ring-cyan-500"
					/>

					{/* Píldoras de asistencia IA en una sola fila sin salto de línea */}
					<div className="grid grid-cols-3 gap-1">
						<button
							type="button"
							disabled={agyLoadingMode !== null}
							data-opencut-action="agy-simple"
							onClick={() => handleAgyPromptAssist("simple")}
							title="Mejora la redacción respetando tu idea original"
							className="flex h-6 items-center justify-center whitespace-nowrap rounded border border-emerald-500/35 bg-emerald-950/30 px-1.5 text-[10.5px] font-medium text-emerald-300 transition hover:bg-emerald-900/40 disabled:opacity-50"
						>
							{agyLoadingMode === "simple" ? "Pulido..." : "✨ Mejorar"}
						</button>
						<button
							type="button"
							disabled={agyLoadingMode !== null}
							data-opencut-action="agy-dsp"
							onClick={() => handleAgyPromptAssist("agydsp")}
							title="Convierte tu idea en un Prompt Maestro AGY-DSP"
							className="flex h-6 items-center justify-center whitespace-nowrap rounded border border-cyan-500/35 bg-cyan-950/30 px-1.5 text-[10.5px] font-medium text-cyan-300 transition hover:bg-cyan-900/40 disabled:opacity-50"
						>
							{agyLoadingMode === "agydsp" ? "Creando..." : "⚡ AGY-DSP"}
						</button>
						<button
							type="button"
							disabled={agyLoadingMode !== null}
							data-opencut-action="agy-generate"
							onClick={() => handleAgyPromptAssist("generate")}
							title="Sugerir una idea creativa con IA"
							className="flex h-6 items-center justify-center whitespace-nowrap rounded border border-purple-500/35 bg-purple-950/30 px-1.5 text-[10.5px] font-medium text-purple-300 transition hover:bg-purple-900/40 disabled:opacity-50"
						>
							{agyLoadingMode === "generate" ? "Idea..." : "🎲 Idea IA"}
						</button>
					</div>
				</div>

				{/* 3. Controles compactos + Botones principales visibles sin scroll */}
				{section === "video" && (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1">
							<select
								data-opencut-ai-model="video"
								value={videoModel}
								onChange={(e) => setVideoModel(e.target.value)}
								className="border-input bg-background h-7 min-w-0 flex-1 rounded border px-1.5 text-[11px]"
							>
								<option value="Omni 1.2 Flash">Omni 1.2 Flash</option>
								<option value="Veo 3.1 - Quality">Veo 3.1 Quality</option>
								<option value="Veo 3.1 - Fast">Veo 3.1 Fast</option>
							</select>
							<select
								data-opencut-ai-aspect="video"
								value={videoAspect}
								onChange={(e) => setVideoAspect(e.target.value)}
								className="border-input bg-background h-7 w-20 shrink-0 rounded border px-1.5 text-[11px]"
							>
								<option value="16:9">16:9</option>
								<option value="9:16">9:16</option>
							</select>
							<button
								type="button"
								onClick={() => setShowAdvancedVideo((v) => !v)}
								title="Ajustes de cámara y bloque"
								className={`border-input flex h-7 w-7 shrink-0 items-center justify-center rounded border text-[11px] transition ${
									showAdvancedVideo
										? "bg-muted text-foreground"
										: "bg-background text-muted-foreground hover:text-foreground"
								}`}
							>
								⚙
							</button>
						</div>

						{showAdvancedVideo && (
							<div className="grid grid-cols-2 gap-1 rounded border border-border/60 bg-muted/15 p-1.5">
								<select
									data-opencut-ai-camera="video"
									value={videoCamera}
									onChange={(e) => setVideoCamera(e.target.value)}
									className="border-input bg-background h-6 rounded border px-1 text-[10.5px]"
								>
									<option value="Ultra-smooth eye-level dolly-in (<0.18 m/s)">
										Dolly-in suave
									</option>
									<option value="Locked eye-level tripod shot">
										Trípode fijo
									</option>
									<option value="Smooth orbital arc (<0.18 m/s)">
										Órbita suave
									</option>
								</select>
								<select
									data-opencut-ai-block="video"
									value={videoBlock}
									onChange={(e) =>
										setVideoBlock(
											e.target.value === "bloque2" ? "bloque2" : "bloque1",
										)
									}
									className="border-input bg-background h-6 rounded border px-1 text-[10.5px]"
								>
									<option value="bloque1">Acto I · Asombro</option>
									<option value="bloque2">Acto II · Ciencia</option>
								</select>
							</div>
						)}

						<Button
							size="sm"
							disabled={isBusy}
							onClick={handleDispatchFlow}
							data-opencut-action="dispatch-flow"
							className="h-8 w-full bg-cyan-600 text-xs font-semibold text-white hover:bg-cyan-500"
						>
							🎬 Generar en Google Flow
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isBusy}
							onClick={handleImportLatestFlowVideo}
							data-opencut-action="import-flow-video"
							className="h-7 w-full border-emerald-500/40 bg-emerald-950/20 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900/35"
						>
							📥 Traer Video de Flow al Proyecto
						</Button>
					</div>
				)}

				{section === "image" && (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1">
							<select
								value={imageStyle}
								onChange={(e) => setImageStyle(e.target.value)}
								className="border-input bg-background h-7 min-w-0 flex-1 rounded border px-1.5 text-[11px]"
							>
								<option value="Fotorrealista PBR Arri Alexa 65 (35mm f/2.0)">
									Fotorrealista PBR
								</option>
								<option value="Render Cinematográfico 3D Octane">
									3D Cinematográfico
								</option>
								<option value="Astrofotografía Telescopio James Webb">
									Espacial / Cosmos
								</option>
							</select>
							<select
								value={imageAspect}
								onChange={(e) => setImageAspect(e.target.value)}
								className="border-input bg-background h-7 w-20 shrink-0 rounded border px-1.5 text-[11px]"
							>
								<option value="16:9">16:9</option>
								<option value="9:16">9:16</option>
								<option value="1:1">1:1</option>
							</select>
						</div>

						<Button
							size="sm"
							disabled={isBusy}
							onClick={handleAddAiImageToTimeline}
							data-opencut-action="add-ai-image-timeline"
							className="h-8 w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
						>
							🖼️ Crear Imagen en el Timeline
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isBusy}
							onClick={handleDispatchWhisk}
							data-opencut-action="dispatch-whisk"
							className="h-7 w-full text-[11px]"
						>
							↗ Abrir en Google Whisk
						</Button>
					</div>
				)}

				{section === "music" && (
					<div className="flex flex-col gap-1.5">
						<div className="grid grid-cols-3 gap-1">
							<select
								value={musicGenre}
								onChange={(e) => setMusicGenre(e.target.value)}
								className="border-input bg-background h-7 rounded border px-1 text-[11px]"
							>
								<option value="Synthwave Cinematográfico">Synthwave</option>
								<option value="Lo-Fi Chill Estudio">Lo-Fi</option>
								<option value="Cinematográfico Épico">Épico</option>
								<option value="Ambient Espacial">Ambient</option>
							</select>
							<Input
								type="number"
								min={60}
								max={170}
								value={musicBpm}
								onChange={(e) => setMusicBpm(Number(e.target.value) || 118)}
								title="BPM"
								className="h-7 text-xs"
							/>
							<Input
								type="number"
								min={4}
								max={20}
								value={musicDuration}
								onChange={(e) =>
									setMusicDuration(Number(e.target.value) || 8)
								}
								title="Duración en segundos"
								className="h-7 text-xs"
							/>
						</div>

						<Button
							size="sm"
							disabled={isBusy}
							onClick={handleSynthMusicToTimeline}
							data-opencut-action="synth-music-timeline"
							className="h-8 w-full bg-purple-600 text-xs font-semibold text-white hover:bg-purple-500"
						>
							🎵 Crear Pista en el Timeline
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isBusy}
							onClick={handleDispatchMusicFx}
							data-opencut-action="dispatch-musicfx"
							className="h-7 w-full text-[11px]"
						>
							↗ Abrir en Google MusicFX
						</Button>
					</div>
				)}

				{section === "voice" && (
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1">
							<select
								data-opencut-ai-voice-a="voice"
								value={voice1}
								onChange={(e) => setVoice1(e.target.value)}
								className="border-input bg-background h-7 min-w-0 flex-1 rounded border px-1 text-[11px]"
							>
								{GOOGLE_ULTRA_30_VOICES.map((v) => (
									<option key={v.id} value={v.id}>
										{v.label}
									</option>
								))}
							</select>
							{voiceMulti && (
								<select
									data-opencut-ai-voice-b="voice"
									value={voice2}
									onChange={(e) => setVoice2(e.target.value)}
									className="border-input bg-background h-7 min-w-0 flex-1 rounded border px-1 text-[11px]"
								>
									{GOOGLE_ULTRA_30_VOICES.map((v) => (
										<option key={v.id} value={v.id}>
											{v.label}
										</option>
									))}
								</select>
							)}
							<button
								type="button"
								onClick={() => setVoiceMulti((v) => !v)}
								title="Alternar 1 voz / 2 voces"
								className={`border-input h-7 shrink-0 rounded border px-1.5 text-[10px] font-medium ${
									voiceMulti
										? "bg-amber-500/20 text-amber-300 border-amber-500/40"
										: "bg-background text-muted-foreground"
								}`}
							>
								{voiceMulti ? "2 Voces" : "1 Voz"}
							</button>
						</div>

						<Button
							size="sm"
							disabled={isBusy}
							onClick={handleSynthVoiceToTimeline}
							data-opencut-action="synth-voice-timeline"
							className="h-8 w-full bg-amber-600 text-xs font-semibold text-white hover:bg-amber-500"
						>
							🎙️ Crear Locución + Subtítulo
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isBusy}
							onClick={handleDispatchAiStudioVoice}
							data-opencut-action="dispatch-aistudio"
							className="h-7 w-full text-[11px]"
						>
							↗ Abrir en Google AI Studio
						</Button>
					</div>
				)}

				<div className="sr-only" data-opencut-ai-status={lastStatus}>
					{lastStatus}
				</div>
			</div>
		</PanelView>
	);
}
