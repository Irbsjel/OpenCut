import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	DeleteElementsCommand,
	InsertElementCommand,
	type Command,
} from "@/commands";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import type { SubtitleCue } from "./types";
import type { CaptionStylePreset } from "./contextual-enrichment";

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
	const insertCommands = captions.map(
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
