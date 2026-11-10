import { describe, expect, test } from "bun:test";
import {
	RATE_24,
	RATE_25,
	RATE_2997,
	RATE_30,
	RATE_5994,
	floatToRate,
	framesToRationalSeconds,
	framesToTicks,
	framesToTimecode,
	rationalSecondsToFrames,
	ticksToFrames,
	timecodeToFrames,
} from "../timecode";

describe("non-drop timecode", () => {
	test.each([
		[RATE_24, 24 * 3600, "01:00:00:00"],
		[RATE_25, 25 * 3600 + 24, "01:00:00:24"],
		[RATE_30, 30 * 60 + 29, "00:01:00:29"],
		[RATE_2997, 30 * 3600, "01:00:00:00"],
	])("%j frame %d -> %s", (rate, frames, expected) => {
		expect(framesToTimecode({ frames, rate })).toBe(expected);
		expect(timecodeToFrames({ timecode: expected, rate })).toBe(frames);
	});
	test("frame buiten timebase geeft fout", () => {
		expect(() => timecodeToFrames({ timecode: "00:00:00:25", rate: RATE_25 })).toThrow();
	});
	test("25 fps roundtrip over een heel uur", () => {
		for (let f = 0; f < 25 * 3600 * 2; f += 997) {
			const tc = framesToTimecode({ frames: f, rate: RATE_25 });
			expect(timecodeToFrames({ timecode: tc, rate: RATE_25 })).toBe(f);
		}
	});
});

describe("29.97 drop-frame", () => {
	test("bekende waarden", () => {
		const df = (frames: number) => framesToTimecode({ frames, rate: RATE_2997, dropFrame: true });
		expect(df(1799)).toBe("00:00:59;29");
		expect(df(1800)).toBe("00:01:00;02");
		expect(df(17981)).toBe("00:09:59;29");
		expect(df(17982)).toBe("00:10:00;00");
		expect(df(107892)).toBe("01:00:00;00");
	});
	test("roundtrip over 3 uur, geen sprongen", () => {
		let previous = -1;
		for (let f = 0; f < 30 * 3600 * 3; f += 1) {
			const tc = framesToTimecode({ frames: f, rate: RATE_2997, dropFrame: true });
			const back = timecodeToFrames({ timecode: tc, rate: RATE_2997 });
			if (back !== f) throw new Error(`frame ${f} -> ${tc} -> ${back}`);
			previous = back;
		}
		expect(previous).toBe(30 * 3600 * 3 - 1);
	});
	test("59.94 drop-frame laat 4 frames vallen", () => {
		expect(framesToTimecode({ frames: 3600, rate: RATE_5994, dropFrame: true })).toBe("00:01:00;04");
		expect(framesToTimecode({ frames: 215784, rate: RATE_5994, dropFrame: true })).toBe("01:00:00;00");
	});
	test("drop-frame op 25 fps is ongeldig", () => {
		expect(() => framesToTimecode({ frames: 1, rate: RATE_25, dropFrame: true })).toThrow();
	});
});

describe("ticks en rationele seconden", () => {
	const TPS = 120_000;
	test("ticks -> frames voor 25, 29.97 en 30", () => {
		expect(ticksToFrames({ ticks: TPS, ticksPerSecond: TPS, rate: RATE_25 })).toBe(25);
		expect(ticksToFrames({ ticks: TPS, ticksPerSecond: TPS, rate: RATE_30 })).toBe(30);
		expect(ticksToFrames({ ticks: TPS * 1001, ticksPerSecond: TPS, rate: RATE_2997 })).toBe(30000);
	});
	test("frames -> ticks -> frames", () => {
		for (const rate of [RATE_24, RATE_25, RATE_2997, RATE_30]) {
			for (const frames of [0, 1, 7, 1234, 99999]) {
				const ticks = framesToTicks({ frames, ticksPerSecond: TPS, rate });
				expect(ticksToFrames({ ticks, ticksPerSecond: TPS, rate })).toBe(frames);
			}
		}
	});
	test("FCPXML-tijden", () => {
		expect(framesToRationalSeconds({ frames: 5, rate: RATE_2997 })).toBe("5005/30000s");
		expect(framesToRationalSeconds({ frames: 0, rate: RATE_25 })).toBe("0s");
		expect(rationalSecondsToFrames({ value: "5005/30000s", rate: RATE_2997 })).toBe(5);
		expect(rationalSecondsToFrames({ value: "125/25s", rate: RATE_25 })).toBe(125);
	});
	test("float fps naar exact tempo", () => {
		expect(floatToRate(29.97002997002997)).toEqual(RATE_2997);
		expect(floatToRate(25)).toEqual(RATE_25);
	});
});
