import { parseEdl, writeEdl } from "./edl";
import { parseFcpxml, writeFcpxml } from "./fcpxml";
import { parseOtio, writeOtio } from "./otio";
import type { Rate } from "./timecode";
import type { InterchangeTimeline } from "./types";

export { buildInterchangeTimeline } from "./build-timeline";
export * from "./timecode";
export * from "./types";
export { parseEdl, writeEdl, parseFcpxml, writeFcpxml, parseOtio, writeOtio };

export const INTERCHANGE_FORMATS = ["edl", "fcpxml", "otio"] as const;
export type InterchangeFormat = (typeof INTERCHANGE_FORMATS)[number];

export const INTERCHANGE_META: Record<
	InterchangeFormat,
	{ label: string; extension: string; mime: string }
> = {
	edl: { label: "EDL (CMX3600)", extension: ".edl", mime: "text/plain" },
	fcpxml: { label: "FCPXML 1.10", extension: ".fcpxml", mime: "application/xml" },
	otio: { label: "OpenTimelineIO", extension: ".otio", mime: "application/json" },
};

export function serializeInterchange(
	format: InterchangeFormat,
	timeline: InterchangeTimeline,
): string {
	if (format === "edl") return writeEdl(timeline);
	if (format === "fcpxml") return writeFcpxml(timeline);
	return writeOtio(timeline);
}

export function parseInterchange(
	format: InterchangeFormat,
	text: string,
	rate: Rate,
): InterchangeTimeline {
	if (format === "edl") return parseEdl(text, { rate });
	if (format === "fcpxml") return parseFcpxml(text);
	return parseOtio(text);
}
