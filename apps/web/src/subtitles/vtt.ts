import type { ParseSubtitleResult, SubtitleCue } from "./types";

const VTT_TIMESTAMP_SEPARATOR = /\s*-->\s*/;
const VTT_TIMESTAMP_PATTERN =
	/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{1,3})$/;

function parseVttTimestamp(raw: string): number {
	const token = raw.trim().split(/\s+/)[0] ?? "";
	const match = token.match(VTT_TIMESTAMP_PATTERN);
	if (!match) return Number.NaN;

	const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
	const minutes = Number.parseInt(match[2] ?? "0", 10);
	const seconds = Number.parseInt(match[3] ?? "0", 10);
	const ms = Number.parseInt((match[4] ?? "0").padEnd(3, "0"), 10);

	return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function cleanVttTags(text: string): string {
	return text
		.replace(/<\d{2}:\d{2}(?::\d{2})?[.,]\d{3}>/g, "")
		.replace(/<\/?[cibuvlangrubyrt][^>]*>/gi, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.trim();
}

export function parseVtt({ input }: { input: string }): ParseSubtitleResult {
	const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
	if (!normalized) {
		return { captions: [], skippedCueCount: 0, warnings: [] };
	}

	const blocks = normalized.split(/\n{2,}/);
	const cues: SubtitleCue[] = [];
	let skippedCueCount = 0;

	for (const block of blocks) {
		const trimmed = block.trim();
		if (
			!trimmed ||
			/^WEBVTT/i.test(trimmed) ||
			/^NOTE(\s|$)/i.test(trimmed) ||
			/^STYLE(\s|$)/i.test(trimmed) ||
			/^REGION(\s|$)/i.test(trimmed)
		) {
			continue;
		}

		const lines = trimmed
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0);
		if (lines.length === 0) continue;

		const tsIdx = lines.findIndex((l) => VTT_TIMESTAMP_SEPARATOR.test(l));
		if (tsIdx < 0) {
			skippedCueCount += 1;
			continue;
		}

		const timestampLine = lines[tsIdx]!;
		const [rawStart, rawEndWithSettings] = timestampLine.split(
			VTT_TIMESTAMP_SEPARATOR,
		);
		if (!rawStart || !rawEndWithSettings) {
			skippedCueCount += 1;
			continue;
		}

		const startTime = parseVttTimestamp(rawStart);
		const endTime = parseVttTimestamp(rawEndWithSettings);
		const duration = endTime - startTime;

		if (
			!Number.isFinite(startTime) ||
			!Number.isFinite(endTime) ||
			duration <= 0
		) {
			skippedCueCount += 1;
			continue;
		}

		const text = cleanVttTags(lines.slice(tsIdx + 1).join("\n"));
		if (!text) {
			skippedCueCount += 1;
			continue;
		}

		cues.push({
			text,
			startTime,
			duration,
		});
	}

	return {
		captions: cues,
		skippedCueCount,
		warnings: [],
	};
}

export function parseSubtitleJson({
	input,
}: {
	input: string;
}): ParseSubtitleResult {
	try {
		const data = JSON.parse(input) as unknown;
		const list = Array.isArray(data)
			? data
			: data && typeof data === "object"
				? ((data as Record<string, unknown>).captions ??
					(data as Record<string, unknown>).segments ??
					(data as Record<string, unknown>).cues ??
					[])
				: [];

		if (!Array.isArray(list)) {
			return { captions: [], skippedCueCount: 1, warnings: [] };
		}

		const cues: SubtitleCue[] = [];
		let skippedCueCount = 0;

		for (const item of list) {
			if (!item || typeof item !== "object") {
				skippedCueCount += 1;
				continue;
			}
			const rec = item as Record<string, unknown>;
			const text = String(rec.text ?? rec.content ?? "").trim();
			const startTime = Number(rec.startTime ?? rec.start ?? 0);
			const endTime =
				rec.end != null
					? Number(rec.end)
					: startTime + Number(rec.duration ?? 1.5);
			const duration =
				rec.duration != null ? Number(rec.duration) : endTime - startTime;

			if (!text || !Number.isFinite(startTime) || !Number.isFinite(duration) || duration <= 0) {
				skippedCueCount += 1;
				continue;
			}

			cues.push({
				text,
				startTime,
				duration,
				words: Array.isArray(rec.words) ? (rec.words as SubtitleCue["words"]) : undefined,
				emoji: typeof rec.emoji === "string" ? rec.emoji : undefined,
			});
		}

		return {
			captions: cues,
			skippedCueCount,
			warnings: [],
		};
	} catch {
		throw new Error("Archivo JSON de subtítulos inválido");
	}
}
