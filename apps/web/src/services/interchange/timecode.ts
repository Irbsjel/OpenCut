/**
 * Timecode-conversie op gehele frames. Eigen implementatie op basis van
 * SMPTE 12M (non-drop en drop-frame voor 29.97 / 59.94).
 * Geen dependency op wasm zodat alles in unit tests draait.
 */

export type Rate = { num: number; den: number };

export const RATE_24: Rate = { num: 24, den: 1 };
export const RATE_25: Rate = { num: 25, den: 1 };
export const RATE_2997: Rate = { num: 30000, den: 1001 };
export const RATE_30: Rate = { num: 30, den: 1 };
export const RATE_5994: Rate = { num: 60000, den: 1001 };
export const RATE_60: Rate = { num: 60, den: 1 };

export function rateToFloat(rate: Rate): number {
	return rate.num / rate.den;
}

/** Nominale timebase (frames per timecode-seconde): 29.97 telt als 30. */
export function timebase(rate: Rate): number {
	return Math.round(rate.num / rate.den);
}

/** Drop-frame is alleen gedefinieerd voor 30000/1001 en 60000/1001. */
export function supportsDropFrame(rate: Rate): boolean {
	return rate.den === 1001 && (rate.num === 30000 || rate.num === 60000);
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

export function framesToTimecode({
	frames,
	rate,
	dropFrame = false,
}: {
	frames: number;
	rate: Rate;
	dropFrame?: boolean;
}): string {
	if (!Number.isInteger(frames) || frames < 0) {
		throw new RangeError(`frames moet een geheel getal >= 0 zijn, kreeg ${frames}`);
	}
	const base = timebase(rate);
	let count = frames;
	let separator = ":";
	if (dropFrame) {
		if (!supportsDropFrame(rate)) {
			throw new RangeError("drop-frame bestaat alleen voor 29.97 en 59.94");
		}
		const drop = base === 60 ? 4 : 2;
		const framesPer10Min = base * 60 * 10 - drop * 9;
		const framesPerMin = base * 60 - drop;
		const tenMinutes = Math.floor(count / framesPer10Min);
		const rest = count % framesPer10Min;
		count +=
			drop * 9 * tenMinutes +
			(rest > drop ? drop * Math.floor((rest - drop) / framesPerMin) : 0);
		separator = ";";
	}
	const ff = count % base;
	const totalSeconds = Math.floor(count / base);
	const ss = totalSeconds % 60;
	const mm = Math.floor(totalSeconds / 60) % 60;
	const hh = Math.floor(totalSeconds / 3600);
	return `${pad(hh)}:${pad(mm)}:${pad(ss)}${separator}${pad(ff)}`;
}

const TIMECODE_RE = /^(\d{1,2}):(\d{2}):(\d{2})([:;.,])(\d{2,3})$/;

export function isDropFrameTimecode(timecode: string): boolean {
	const match = TIMECODE_RE.exec(timecode.trim());
	return match ? match[4] === ";" || match[4] === "," : false;
}

export function timecodeToFrames({
	timecode,
	rate,
	dropFrame,
}: {
	timecode: string;
	rate: Rate;
	dropFrame?: boolean;
}): number {
	const match = TIMECODE_RE.exec(timecode.trim());
	if (!match) throw new SyntaxError(`ongeldige timecode: "${timecode}"`);
	const [hh, mm, ss, , ff] = match.slice(1).map((part, i) => (i === 3 ? 0 : Number(part)));
	const base = timebase(rate);
	if (ff >= base) throw new RangeError(`frame ${ff} past niet in timebase ${base}`);
	const useDrop = dropFrame ?? isDropFrameTimecode(timecode);
	let frames = (hh * 3600 + mm * 60 + ss) * base + ff;
	if (useDrop) {
		if (!supportsDropFrame(rate)) {
			throw new RangeError("drop-frame bestaat alleen voor 29.97 en 59.94");
		}
		const drop = base === 60 ? 4 : 2;
		const totalMinutes = hh * 60 + mm;
		frames -= drop * (totalMinutes - Math.floor(totalMinutes / 10));
	}
	return frames;
}

/** Ticks -> hele frames (afgerond op het dichtstbijzijnde frame). */
export function ticksToFrames({
	ticks,
	ticksPerSecond,
	rate,
}: {
	ticks: number;
	ticksPerSecond: number;
	rate: Rate;
}): number {
	return Math.round((ticks * rate.num) / (ticksPerSecond * rate.den));
}

export function framesToTicks({
	frames,
	ticksPerSecond,
	rate,
}: {
	frames: number;
	ticksPerSecond: number;
	rate: Rate;
}): number {
	return Math.round((frames * ticksPerSecond * rate.den) / rate.num);
}

const KNOWN_RATES: Rate[] = [
	{ num: 24000, den: 1001 },
	RATE_24,
	RATE_25,
	RATE_2997,
	RATE_30,
	{ num: 48, den: 1 },
	{ num: 50, den: 1 },
	RATE_5994,
	RATE_60,
	{ num: 120, den: 1 },
];

/** Float-fps (zoals in OTIO) terug naar een exact rationeel tempo. */
export function floatToRate(fps: number): Rate {
	const known = KNOWN_RATES.find((rate) => Math.abs(rateToFloat(rate) - fps) < 0.001);
	if (known) return known;
	if (Number.isInteger(fps)) return { num: fps, den: 1 };
	return { num: Math.round(fps * 1000), den: 1000 };
}

/** Seconden als exacte rationele string, zoals FCPXML eist ("1001/30000s"). */
export function framesToRationalSeconds({
	frames,
	rate,
}: {
	frames: number;
	rate: Rate;
}): string {
	if (frames === 0) return "0s";
	return `${frames * rate.den}/${rate.num}s`;
}

export function parseRationalSeconds(value: string): { num: number; den: number } {
	const match = /^(-?\d+)(?:\/(\d+))?s$/.exec(value.trim());
	if (!match) throw new SyntaxError(`ongeldige FCPXML-tijd: "${value}"`);
	return { num: Number(match[1]), den: match[2] ? Number(match[2]) : 1 };
}

export function rationalSecondsToFrames({
	value,
	rate,
}: {
	value: string;
	rate: Rate;
}): number {
	const { num, den } = parseRationalSeconds(value);
	return Math.round((num * rate.num) / (den * rate.den));
}
