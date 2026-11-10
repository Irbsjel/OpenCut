import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	DeleteElementsCommand,
	InsertElementCommand,
	type Command,
} from "@/commands";
import { mediaTimeToSeconds } from "@/wasm";
import type { TimelineTrack } from "@/timeline";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import type { SubtitleCue } from "./types";
import type { CaptionStylePreset } from "./contextual-enrichment";

export interface OverlayVisualWindow {
	startSec: number;
	endSec: number;
}

export function collectExemplifyingOverlayWindows(
	overlayTracks: TimelineTrack[],
): OverlayVisualWindow[] {
	const windows: OverlayVisualWindow[] = [];
	for (const track of overlayTracks) {
		if ("hidden" in track && track.hidden) continue;
		for (const el of track.elements) {
			if ("hidden" in el && el.hidden) continue;
			const isExemplifyingImageOrSticker =
				el.type === "image" || el.type === "sticker";
			if (!isExemplifyingImageOrSticker) continue;

			const startSec = mediaTimeToSeconds({ time: el.startTime });
			const durSec = mediaTimeToSeconds({ time: el.duration });
			if (durSec <= 0.05) continue;
			windows.push({
				startSec,
				endSec: startSec + durSec,
			});
		}
	}
	windows.sort((a, b) => a.startSec - b.startSec);
	return windows;
}

export function filterCaptionsAgainstOverlayWindows({
	captions,
	windows,
}: {
	captions: SubtitleCue[];
	windows: OverlayVisualWindow[];
}): SubtitleCue[] {
	if (windows.length === 0) return captions;
	const filtered: SubtitleCue[] = [];

	for (const cue of captions) {
		let start = cue.startTime;
		let end = cue.startTime + cue.duration;
		let drop = false;

		for (const win of windows) {
			const overlapStart = Math.max(start, win.startSec);
			const overlapEnd = Math.min(end, win.endSec);
			const overlap = overlapEnd - overlapStart;
			if (overlap <= 0.05) continue;

			const beforeRemaining = win.startSec - start;
			const afterRemaining = end - win.endSec;

			if (
				beforeRemaining >= 0.55 &&
				beforeRemaining >= afterRemaining &&
				overlap < (end - start) * 0.55
			) {
				end = Number((win.startSec - 0.02).toFixed(3));
			} else if (afterRemaining >= 0.55 && overlap < (end - start) * 0.55) {
				start = Number((win.endSec + 0.02).toFixed(3));
			} else {
				drop = true;
				break;
			}
		}

		if (!drop && end - start >= 0.3) {
			filtered.push({
				...cue,
				startTime: start,
				duration: Number((end - start).toFixed(3)),
			});
		}
	}

	return filtered;
}

export function insertCaptionChunksAsTextTrack({
	editor,
	captions,
	preset,
	verticalAlign = "bottom",
	replaceExisting = true,
}: {
	editor: EditorCore;
	captions: SubtitleCue[];
	preset?: CaptionStylePreset;
	verticalAlign?: "top" | "middle" | "bottom";
	replaceExisting?: boolean;
}): string | null {
	if (captions.length === 0) {
		return null;
	}

	const scene = editor.scenes.getActiveSceneOrNull();
	const overlayTracks = scene?.tracks?.overlay ?? [];
	const visualWindows = collectExemplifyingOverlayWindows(overlayTracks);
	const effectiveCaptions = filterCaptionsAgainstOverlayWindows({
		captions,
		windows: visualWindows,
	});
	if (effectiveCaptions.length === 0) {
		return null;
	}

	// Reuse existing subtitle text track instead of creating duplicate tracks
	const existingSubtitleTrack = overlayTracks.find(
		(t) =>
			t.type === "text" &&
			(t.elements.some(
				(el) => el.type === "text" && el.params?.isSubtitle === true,
			) ||
				t.elements.length === 0),
	);

	const commands: Command[] = [];
	let trackId: string;

	if (existingSubtitleTrack) {
		trackId = existingSubtitleTrack.id;
		if (replaceExisting) {
			const toRemove: Array<{ trackId: string; elementId: string }> = [];
			for (const t of overlayTracks) {
				if (t.type !== "text") continue;
				for (const el of t.elements) {
					if (el.type === "text" && el.params?.isSubtitle === true) {
						toRemove.push({ trackId: t.id, elementId: el.id });
					}
				}
			}
			if (toRemove.length > 0) {
				commands.push(new DeleteElementsCommand({ elements: toRemove }));
			}
		}
	} else {
		const addTrackCommand = new AddTrackCommand({ type: "text", index: 0 });
		trackId = addTrackCommand.getTrackId();
		commands.push(addTrackCommand);
	}

	const canvasSize = editor.project.getActive().settings.canvasSize;
	const insertCommands = effectiveCaptions.map(
		(caption, index) =>
			new InsertElementCommand({
				placement: { mode: "explicit", trackId },
				element: buildSubtitleTextElement({
					index,
					caption,
					canvasSize,
					preset,
					verticalAlign,
				}),
			}),
	);

	commands.push(...insertCommands);
	editor.command.execute({
		command: new BatchCommand(commands),
	});

	return trackId;
}
