import type { Rate } from "./timecode";

export type InterchangeKind = "video" | "audio";

/** Eén clip op de tijdlijn, uitgedrukt in hele frames van de projectsnelheid. */
export interface InterchangeClip {
	id: string;
	name: string;
	kind: InterchangeKind;
	/** 0 = hoofdtrack; hoger = bovenliggende video-/audiotrack. */
	track: number;
	/** Bestandsnaam van de bron (voor reel/target_url). */
	media: string;
	recordIn: number;
	/** Duur op de tijdlijn. */
	duration: number;
	sourceIn: number;
	/** 1 = normaal; 2 = dubbele snelheid. */
	speed: number;
}

export interface InterchangeTimeline {
	name: string;
	rate: Rate;
	width: number;
	height: number;
	/** Frame waarop de tijdlijn begint (EDL gebruikt conventioneel 01:00:00:00). */
	startFrame: number;
	dropFrame: boolean;
	clips: InterchangeClip[];
}

export function clipRecordOut(clip: InterchangeClip): number {
	return clip.recordIn + clip.duration;
}

/** Aantal bronframes dat de clip verbruikt. */
export function clipSourceDuration(clip: InterchangeClip): number {
	return Math.round(clip.duration * clip.speed);
}

/** Stabiele volgorde voor vergelijken: soort, track, starttijd. */
export function sortClips(clips: InterchangeClip[]): InterchangeClip[] {
	return [...clips].sort(
		(a, b) =>
			(a.kind === b.kind ? 0 : a.kind === "video" ? -1 : 1) ||
			a.track - b.track ||
			a.recordIn - b.recordIn,
	);
}
