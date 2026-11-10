/**
 * OpenTimelineIO JSON (schema Timeline.1 / Stack.1 / Track.1 / Clip.2 /
 * Gap.1 / ExternalReference.1 / RationalTime.1 / TimeRange.1) volgens de
 * publieke OTIO-documentatie. Eén track per (soort, tracknummer).
 */
import { floatToRate, rateToFloat, type Rate } from "./timecode";
import {
	clipSourceDuration,
	type InterchangeClip,
	type InterchangeKind,
	type InterchangeTimeline,
} from "./types";

type RationalTime = { OTIO_SCHEMA: "RationalTime.1"; rate: number; value: number };
type TimeRange = {
	OTIO_SCHEMA: "TimeRange.1";
	start_time: RationalTime;
	duration: RationalTime;
};

const time = (value: number, rate: Rate): RationalTime => ({
	OTIO_SCHEMA: "RationalTime.1",
	rate: rateToFloat(rate),
	value,
});

const range = (start: number, duration: number, rate: Rate): TimeRange => ({
	OTIO_SCHEMA: "TimeRange.1",
	start_time: time(start, rate),
	duration: time(duration, rate),
});

export function buildOtio(timeline: InterchangeTimeline): Record<string, unknown> {
	const { rate } = timeline;
	const groups = new Map<string, InterchangeClip[]>();
	for (const clip of timeline.clips) {
		const key = `${clip.kind}:${clip.track}`;
		groups.set(key, [...(groups.get(key) ?? []), clip]);
	}
	const keys = [...groups.keys()].sort((a, b) => {
		const [ka, ta] = a.split(":");
		const [kb, tb] = b.split(":");
		return (ka === kb ? 0 : ka === "video" ? -1 : 1) || Number(ta) - Number(tb);
	});
	const tracks = keys.map((key) => {
		const [kind, trackIndex] = key.split(":");
		const clips = [...(groups.get(key) ?? [])].sort((a, b) => a.recordIn - b.recordIn);
		const children: unknown[] = [];
		let cursor = 0;
		for (const clip of clips) {
			if (clip.recordIn > cursor) {
				children.push({
					OTIO_SCHEMA: "Gap.1",
					name: "",
					source_range: range(0, clip.recordIn - cursor, rate),
					metadata: {},
				});
			}
			children.push({
				OTIO_SCHEMA: "Clip.2",
				name: clip.name,
				source_range: range(clip.sourceIn, clipSourceDuration(clip), rate),
				media_references: {
					DEFAULT_MEDIA: {
						OTIO_SCHEMA: "ExternalReference.1",
						name: clip.media,
						target_url: clip.media,
						available_range: null,
						metadata: {},
					},
				},
				active_media_reference_key: "DEFAULT_MEDIA",
				effects:
					clip.speed !== 1
						? [
								{
									OTIO_SCHEMA: "LinearTimeWarp.1",
									name: "",
									effect_name: "LinearTimeWarp",
									time_scalar: clip.speed,
									metadata: {},
								},
							]
						: [],
				markers: [],
				metadata: { dgdh_cut: { id: clip.id, record_in: clip.recordIn, duration: clip.duration } },
			});
			cursor = clip.recordIn + clip.duration;
		}
		return {
			OTIO_SCHEMA: "Track.1",
			name: `${kind === "video" ? "V" : "A"}${Number(trackIndex) + 1}`,
			kind: kind === "video" ? "Video" : "Audio",
			children,
			effects: [],
			markers: [],
			metadata: {},
		};
	});
	return {
		OTIO_SCHEMA: "Timeline.1",
		name: timeline.name,
		global_start_time: time(timeline.startFrame, rate),
		tracks: {
			OTIO_SCHEMA: "Stack.1",
			name: "tracks",
			children: tracks,
			effects: [],
			markers: [],
			metadata: {},
		},
		metadata: {
			dgdh_cut: { width: timeline.width, height: timeline.height, drop_frame: timeline.dropFrame },
		},
	};
}

export function writeOtio(timeline: InterchangeTimeline): string {
	return `${JSON.stringify(buildOtio(timeline), null, 2)}\n`;
}

type Json = Record<string, unknown>;
const asObj = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});
const asArr = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

export function parseOtio(text: string): InterchangeTimeline {
	const root = asObj(JSON.parse(text));
	if (root.OTIO_SCHEMA !== "Timeline.1") {
		throw new Error(`geen OTIO Timeline (schema: ${String(root.OTIO_SCHEMA)})`);
	}
	const meta = asObj(asObj(root.metadata).dgdh_cut);
	const stack = asObj(root.tracks);
	let rate: Rate | null = null;
	const clips: InterchangeClip[] = [];
	const counters = { video: 0, audio: 0 };
	let n = 0;
	for (const track of asArr(stack.children)) {
		if (track.OTIO_SCHEMA !== "Track.1") continue;
		const kind: InterchangeKind = String(track.kind).toLowerCase() === "audio" ? "audio" : "video";
		const trackIndex = counters[kind]++;
		let cursor = 0;
		for (const child of asArr(track.children)) {
			const sr = asObj(child.source_range);
			const st = asObj(sr.start_time);
			const du = asObj(sr.duration);
			const itemRate = Number(du.rate ?? st.rate);
			if (!rate && Number.isFinite(itemRate)) rate = floatToRate(itemRate);
			const durationValue = Math.round(Number(du.value));
			if (child.OTIO_SCHEMA === "Gap.1") {
				cursor += durationValue;
				continue;
			}
			if (child.OTIO_SCHEMA !== "Clip.2" && child.OTIO_SCHEMA !== "Clip.1") {
				cursor += durationValue;
				continue;
			}
			const refs = asObj(child.media_references);
			const activeKey = String(child.active_media_reference_key ?? "DEFAULT_MEDIA");
			const ref = asObj(refs[activeKey] ?? child.media_reference);
			const warp = asArr(child.effects).find((e) => e.OTIO_SCHEMA === "LinearTimeWarp.1");
			const speed = warp ? Number(warp.time_scalar) || 1 : 1;
			const duration = speed !== 1 ? Math.round(durationValue / speed) : durationValue;
			n += 1;
			clips.push({
				id: `otio-${n}`,
				name: String(child.name ?? ""),
				kind,
				track: trackIndex,
				media: String(ref.target_url ?? ref.name ?? ""),
				recordIn: cursor,
				duration,
				sourceIn: Math.round(Number(st.value ?? 0)),
				speed,
			});
			cursor += duration;
		}
	}
	const gst = asObj(root.global_start_time);
	return {
		name: String(root.name ?? "Naamloos"),
		rate: rate ?? floatToRate(Number(gst.rate) || 30),
		width: Number(meta.width) || 0,
		height: Number(meta.height) || 0,
		startFrame: Math.round(Number(gst.value) || 0),
		dropFrame: Boolean(meta.drop_frame),
		clips,
	};
}
