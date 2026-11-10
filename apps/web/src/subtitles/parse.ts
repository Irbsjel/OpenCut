import { parseAss } from "./ass";
import { parseSrt } from "./srt";
import { parseSubtitleJson, parseVtt } from "./vtt";
import type { ParseSubtitleResult } from "./types";
export type { ParseSubtitleResult, SubtitleCue } from "./types";

export function parseSubtitleFile({
	fileName,
	input,
}: {
	fileName: string;
	input: string;
}): ParseSubtitleResult {
	const extension = getFileExtension({ fileName });

	switch (extension) {
		case "srt":
			return parseSrt({ input });
		case "vtt":
			return parseVtt({ input });
		case "ass":
		case "ssa":
			return parseAss({ input });
		case "json":
			return parseSubtitleJson({ input });
		default: {
			// Auto-detect by content if extension is unknown or .txt
			const trimmed = input.trim();
			if (/^WEBVTT/i.test(trimmed)) {
				return parseVtt({ input });
			}
			if (/\[Script Info\]|\[Events\]/i.test(trimmed)) {
				return parseAss({ input });
			}
			if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
				return parseSubtitleJson({ input });
			}
			return parseSrt({ input });
		}
	}
}

function getFileExtension({ fileName }: { fileName: string }): string {
	const extension = fileName.split(".").pop();
	return extension?.toLowerCase() ?? "";
}
