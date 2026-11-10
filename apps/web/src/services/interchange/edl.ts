/**
 * CMX3600 EDL schrijven en lezen (publieke, de-facto specificatie).
 * Eén event per clip; video-tracks worden allemaal "V" (CMX kent geen
 * meerdere videotracks), audiotracks A, A2, A3, A4.
 */
import {
	framesToTimecode,
	isDropFrameTimecode,
	rateToFloat,
	timecodeToFrames,
	type Rate,
} from "./timecode";
import {
	clipRecordOut,
	clipSourceDuration,
	sortClips,
	type InterchangeClip,
	type InterchangeTimeline,
} from "./types";

function reelName(media: string): string {
	const base = media.replace(/\.[^.]+$/, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
	return (base || "AX").slice(0, 8).padEnd(8, " ");
}

function trackField(clip: InterchangeClip): string {
	if (clip.kind === "video") return "V";
	return clip.track === 0 ? "A" : `A${clip.track + 1}`;
}

export function writeEdl(timeline: InterchangeTimeline): string {
	const { rate, dropFrame } = timeline;
	const tc = (frames: number) => framesToTimecode({ frames, rate, dropFrame });
	const lines: string[] = [
		`TITLE: ${timeline.name}`,
		`FCM: ${dropFrame ? "DROP FRAME" : "NON-DROP FRAME"}`,
		"",
	];
	const events = sortClips(timeline.clips).sort((a, b) => a.recordIn - b.recordIn);
	events.forEach((clip, index) => {
		const reel = reelName(clip.media);
		const srcIn = clip.sourceIn;
		const srcOut = clip.sourceIn + clipSourceDuration(clip);
		const recIn = timeline.startFrame + clip.recordIn;
		const recOut = timeline.startFrame + clipRecordOut(clip);
		lines.push(
			`${String(index + 1).padStart(3, "0")}  ${reel} ${trackField(clip).padEnd(5)} C        ${tc(srcIn)} ${tc(srcOut)} ${tc(recIn)} ${tc(recOut)}`,
		);
		if (clip.speed !== 1) {
			const fps = (rateToFloat(rate) * clip.speed).toFixed(1).padStart(5, "0");
			lines.push(`M2   ${reel} ${fps}                ${tc(srcIn)}`);
		}
		lines.push(`* FROM CLIP NAME: ${clip.name}`);
		lines.push(`* SOURCE FILE: ${clip.media}`);
		lines.push("");
	});
	return `${lines.join("\n")}\n`;
}

export interface ParseEdlOptions {
	rate: Rate;
	/** Begin van de tijdlijn in de EDL; default 01:00:00:00 als de eerste record-in daar staat. */
	startFrame?: number;
}

const EVENT_RE =
	/^(\d{3,6})\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:(\S+)\s+)?(\d\d:\d\d:\d\d[:;]\d\d)\s+(\d\d:\d\d:\d\d[:;]\d\d)\s+(\d\d:\d\d:\d\d[:;]\d\d)\s+(\d\d:\d\d:\d\d[:;]\d\d)\s*$/;

export function parseEdl(text: string, options: ParseEdlOptions): InterchangeTimeline {
	const { rate } = options;
	const rows = text.split(/\r?\n/);
	let title = "Naamloos";
	let dropFrame = false;
	type Raw = {
		reel: string;
		track: string;
		srcIn: number;
		srcOut: number;
		recIn: number;
		recOut: number;
		speed: number;
		name?: string;
		media?: string;
	};
	const raws: Raw[] = [];
	for (const row of rows) {
		const line = row.trim();
		if (!line) continue;
		if (line.startsWith("TITLE:")) {
			title = line.slice(6).trim() || title;
			continue;
		}
		if (line.startsWith("FCM:")) {
			dropFrame = /^FCM:\s*DROP/i.test(line);
			continue;
		}
		const last = raws[raws.length - 1];
		if (line.startsWith("*")) {
			const nameMatch = /^\*\s*FROM CLIP NAME:\s*(.*)$/i.exec(line);
			const fileMatch = /^\*\s*SOURCE FILE:\s*(.*)$/i.exec(line);
			if (last && nameMatch) last.name = nameMatch[1].trim();
			if (last && fileMatch) last.media = fileMatch[1].trim();
			continue;
		}
		if (line.startsWith("M2")) {
			const parts = line.split(/\s+/);
			const fps = Number(parts[2]);
			if (last && Number.isFinite(fps) && fps > 0) last.speed = fps / rateToFloat(rate);
			continue;
		}
		const match = EVENT_RE.exec(line);
		if (!match) continue;
		const [, , reel, track, transition, , a, b, c, d] = match;
		if (transition !== "C") {
			throw new Error(`EDL-overgang "${transition}" wordt niet ondersteund (alleen C)`);
		}
		const df = isDropFrameTimecode(a) || dropFrame;
		const toFrames = (timecode: string) => timecodeToFrames({ timecode, rate, dropFrame: df });
		if (isDropFrameTimecode(a)) dropFrame = true;
		raws.push({
			reel,
			track,
			srcIn: toFrames(a),
			srcOut: toFrames(b),
			recIn: toFrames(c),
			recOut: toFrames(d),
			speed: 1,
		});
	}
	if (raws.length === 0) throw new Error("EDL bevat geen events");
	const startFrame =
		options.startFrame ?? (Math.min(...raws.map((r) => r.recIn)) >= 3600 * Math.round(rate.num / rate.den) ? 3600 * Math.round(rate.num / rate.den) : 0);
	const clips: InterchangeClip[] = raws.map((raw, index) => {
		const isAudio = raw.track.startsWith("A");
		const audioTrack = /^A(\d)$/.exec(raw.track);
		const duration = raw.recOut - raw.recIn;
		return {
			id: `edl-${index + 1}`,
			name: raw.name ?? raw.reel,
			kind: isAudio ? "audio" : "video",
			track: audioTrack ? Number(audioTrack[1]) - 1 : 0,
			media: raw.media ?? raw.reel,
			recordIn: raw.recIn - startFrame,
			duration,
			sourceIn: raw.srcIn,
			speed: raw.speed !== 1 ? raw.speed : duration > 0 ? (raw.srcOut - raw.srcIn) / duration : 1,
		};
	});
	return { name: title, rate, width: 0, height: 0, startFrame, dropFrame, clips };
}
