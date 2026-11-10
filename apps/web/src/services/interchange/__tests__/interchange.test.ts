import { describe, expect, test } from "bun:test";
import {
	RATE_24,
	RATE_25,
	RATE_2997,
	RATE_30,
	parseEdl,
	parseFcpxml,
	parseOtio,
	sortClips,
	writeEdl,
	writeFcpxml,
	writeOtio,
	type InterchangeClip,
	type InterchangeTimeline,
} from "../index";
import type { Rate } from "../timecode";

const clip = (over: Partial<InterchangeClip> & Pick<InterchangeClip, "id" | "recordIn" | "duration">): InterchangeClip => ({
	name: `Clip ${over.id}`,
	kind: "video",
	track: 0,
	media: "interview-a.mp4",
	sourceIn: 0,
	speed: 1,
	...over,
});

function sample(rate: Rate, dropFrame = false): InterchangeTimeline {
	const base = Math.round(rate.num / rate.den);
	return {
		name: "Testproject & <co>",
		rate,
		width: 1920,
		height: 1080,
		startFrame: 3600 * base,
		dropFrame,
		clips: [
			clip({ id: "a", recordIn: 0, duration: base * 5, sourceIn: base * 2 }),
			clip({ id: "b", recordIn: base * 5, duration: base * 3, media: "b-roll.mov", sourceIn: 40 }),
			// gat van 2 s
			clip({ id: "c", recordIn: base * 10, duration: base * 4, media: "b-roll.mov", sourceIn: 400 }),
			clip({ id: "d", recordIn: base * 11, duration: base * 2, track: 1, media: "overlay.png" }),
			clip({ id: "e", recordIn: 0, duration: base * 14, kind: "audio", media: "muziek.wav" }),
		],
	};
}

const key = (c: InterchangeClip) =>
	[c.kind, c.recordIn, c.duration, c.sourceIn, c.media, c.name].join("|");
const keys = (t: InterchangeTimeline) => sortClips(t.clips).map(key).sort();

describe.each([
	["25", RATE_25, false],
	["30", RATE_30, false],
	["29.97 NDF", RATE_2997, false],
	["29.97 DF", RATE_2997, true],
	["24", RATE_24, false],
])("roundtrip %s fps", (_label, rate, dropFrame) => {
	const source = sample(rate, dropFrame);

	test("EDL: zelfde cuts en tijden", () => {
		const text = writeEdl(source);
		expect(text).toContain("FCM:");
		const back = parseEdl(text, { rate });
		expect(back.startFrame).toBe(source.startFrame);
		expect(keys(back)).toEqual(keys(source));
	});

	test("OTIO: zelfde cuts en tijden, geldige JSON", () => {
		const text = writeOtio(source);
		const json = JSON.parse(text);
		expect(json.OTIO_SCHEMA).toBe("Timeline.1");
		const back = parseOtio(text);
		expect(back.rate).toEqual(rate);
		expect(keys(back)).toEqual(keys(source));
	});

	test("FCPXML: zelfde cuts en tijden", () => {
		const text = writeFcpxml(source);
		const back = parseFcpxml(text);
		expect(back.rate).toEqual(rate);
		expect(back.startFrame).toBe(source.startFrame);
		expect(keys(back)).toEqual(keys(source));
		expect(back.name).toBe(source.name);
	});
});

describe("snelheid en randgevallen", () => {
	const rate = RATE_25;
	const slow: InterchangeTimeline = {
		name: "snel",
		rate,
		width: 1920,
		height: 1080,
		startFrame: 0,
		dropFrame: false,
		clips: [clip({ id: "s", recordIn: 25, duration: 50, speed: 2, sourceIn: 10 })],
	};
	test("2x snelheid blijft behouden in alle drie", () => {
		for (const back of [
			parseEdl(writeEdl(slow), { rate, startFrame: 0 }),
			parseOtio(writeOtio(slow)),
			parseFcpxml(writeFcpxml(slow)),
		]) {
			expect(back.clips).toHaveLength(1);
			expect(back.clips[0].duration).toBe(50);
			expect(back.clips[0].speed).toBe(2);
			expect(back.clips[0].recordIn).toBe(25);
			expect(back.clips[0].sourceIn).toBe(10);
		}
	});
	test("EDL-regel volgt CMX3600-layout", () => {
		const line = writeEdl(sample(RATE_25)).split("\n").find((l) => l.startsWith("001"));
		expect(line).toBe("001  INTERVIE V     C        00:00:02:00 00:00:07:00 01:00:00:00 01:00:05:00");
	});
	test("lege tijdlijn: FCPXML blijft parsebaar", () => {
		const empty = { ...slow, clips: [] };
		expect(() => parseFcpxml(writeFcpxml(empty))).not.toThrow();
	});
	test("EDL zonder events geeft fout", () => {
		expect(() => parseEdl("TITLE: x\n", { rate })).toThrow();
	});
});
