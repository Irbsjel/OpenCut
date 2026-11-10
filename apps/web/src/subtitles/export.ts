import type { SubtitleCue } from "./types";

export type SubtitleExportFormat = "srt" | "vtt" | "ass" | "json" | "txt";

function pad2(n: number): string {
	return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function pad3(n: number): string {
	return String(Math.max(0, Math.floor(n))).padStart(3, "0");
}

export function formatSrtTimestamp(seconds: number): string {
	const safe = Math.max(0, seconds);
	const totalMs = Math.round(safe * 1000);
	const ms = totalMs % 1000;
	const totalSec = Math.floor(totalMs / 1000);
	const s = totalSec % 60;
	const totalMin = Math.floor(totalSec / 60);
	const m = totalMin % 60;
	const h = Math.floor(totalMin / 60);
	return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

export function formatVttTimestamp(seconds: number): string {
	return formatSrtTimestamp(seconds).replace(",", ".");
}

export function formatAssTimestamp(seconds: number): string {
	const safe = Math.max(0, seconds);
	const totalCs = Math.round(safe * 100);
	const cs = totalCs % 100;
	const totalSec = Math.floor(totalCs / 100);
	const s = totalSec % 60;
	const totalMin = Math.floor(totalSec / 60);
	const m = totalMin % 60;
	const h = Math.floor(totalMin / 60);
	return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

function hexToAssColor(hex: string | undefined, fallback = "&H00FFFFFF"): string {
	if (!hex) return fallback;
	const cleaned = hex.trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return fallback;
	const r = cleaned.slice(0, 2).toUpperCase();
	const g = cleaned.slice(2, 4).toUpperCase();
	const b = cleaned.slice(4, 6).toUpperCase();
	return `&H00${b}${g}${r}`;
}

export function exportToSrt(cues: SubtitleCue[]): string {
	const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
	return sorted
		.map((cue, idx) => {
			const start = formatSrtTimestamp(cue.startTime);
			const end = formatSrtTimestamp(cue.startTime + Math.max(0.1, cue.duration));
			const text = cue.text.trim();
			return `${idx + 1}\n${start} --> ${end}\n${text}`;
		})
		.join("\n\n")
		.concat("\n");
}

export function exportToVtt(cues: SubtitleCue[]): string {
	const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
	const body = sorted
		.map((cue, idx) => {
			const start = formatVttTimestamp(cue.startTime);
			const end = formatVttTimestamp(cue.startTime + Math.max(0.1, cue.duration));
			const text = cue.text.trim();
			return `${idx + 1}\n${start} --> ${end}\n${text}`;
		})
		.join("\n\n");
	return `WEBVTT\n\n${body}\n`;
}

export function exportToAss(
	cues: SubtitleCue[],
	canvasSize = { width: 1080, height: 1920 },
): string {
	const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
	const firstStyle = sorted[0]?.style;
	const fontName = firstStyle?.fontFamily || "Montserrat";
	const fontSizePx = Math.round(
		(firstStyle?.fontSize ?? 5) * (canvasSize.height / 100),
	);
	const primaryColour = hexToAssColor(firstStyle?.color, "&H00FFFFFF");

	const header = [
		"[Script Info]",
		"Title: OpenCut Subtitles",
		"ScriptType: v4.00+",
		`PlayResX: ${canvasSize.width}`,
		`PlayResY: ${canvasSize.height}`,
		"WrapStyle: 0",
		"ScaledBorderAndShadow: yes",
		"",
		"[V4+ Styles]",
		"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
		`Style: Default,${fontName},${Math.max(24, fontSizePx)},${primaryColour},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,80,1`,
		"",
		"[Events]",
		"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
	].join("\n");

	const events = sorted
		.map((cue) => {
			const start = formatAssTimestamp(cue.startTime);
			const end = formatAssTimestamp(cue.startTime + Math.max(0.1, cue.duration));
			const escaped = cue.text.trim().replace(/\r?\n/g, "\\N");
			return `Dialogue: 0,${start},${end},Default,,0,0,0,,${escaped}`;
		})
		.join("\n");

	return `${header}\n${events}\n`;
}

export function exportToSubtitleJson(cues: SubtitleCue[]): string {
	const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
	return JSON.stringify(
		{
			version: "1.0",
			exportedAt: new Date().toISOString(),
			captions: sorted.map((c, idx) => ({
				index: idx + 1,
				startTime: Number(c.startTime.toFixed(3)),
				endTime: Number((c.startTime + c.duration).toFixed(3)),
				duration: Number(c.duration.toFixed(3)),
				text: c.text,
				words: c.words,
				emoji: c.emoji,
			})),
		},
		null,
		2,
	);
}

export function exportToPlainText(cues: SubtitleCue[]): string {
	const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
	return sorted.map((c) => c.text.trim()).join("\n");
}

export function serializeSubtitles({
	cues,
	format,
	canvasSize,
}: {
	cues: SubtitleCue[];
	format: SubtitleExportFormat;
	canvasSize?: { width: number; height: number };
}): { content: string; mimeType: string; extension: string } {
	switch (format) {
		case "srt":
			return {
				content: exportToSrt(cues),
				mimeType: "application/x-subrip;charset=utf-8",
				extension: "srt",
			};
		case "vtt":
			return {
				content: exportToVtt(cues),
				mimeType: "text/vtt;charset=utf-8",
				extension: "vtt",
			};
		case "ass":
			return {
				content: exportToAss(cues, canvasSize),
				mimeType: "text/plain;charset=utf-8",
				extension: "ass",
			};
		case "json":
			return {
				content: exportToSubtitleJson(cues),
				mimeType: "application/json;charset=utf-8",
				extension: "json",
			};
		case "txt":
			return {
				content: exportToPlainText(cues),
				mimeType: "text/plain;charset=utf-8",
				extension: "txt",
			};
	}
}

export function downloadSubtitleFile({
	cues,
	format,
	projectName = "subtitulos",
	canvasSize,
}: {
	cues: SubtitleCue[];
	format: SubtitleExportFormat;
	projectName?: string;
	canvasSize?: { width: number; height: number };
}): void {
	const { content, mimeType, extension } = serializeSubtitles({
		cues,
		format,
		canvasSize,
	});
	const slug =
		projectName
			.toLowerCase()
			.replace(/[^a-z0-9-_]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 40) || "subtitulos";
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${slug}.${extension}`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2500);
}
