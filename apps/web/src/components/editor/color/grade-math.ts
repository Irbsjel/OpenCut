/**
 * Primaire kleurcorrectie, eigen ontwerp.
 *
 * Volgorde per pixel (alle waarden 0..1, display-referred):
 *   belichting -> temperatuur/tint -> lift/gamma/gain -> contrast ->
 *   verzadiging -> curves (master, dan R/G/B).
 * De WebGL-shader in grade-renderer.ts implementeert exact dezelfde keten;
 * `applyGrade` hieronder is de CPU-referentie (tests, .cube-export,
 * fallback zonder WebGL).
 */

export type Rgb = [number, number, number];

/** Een kleurwiel: hue in graden, amount 0..1 (afstand tot midden), luma -1..1. */
export interface WheelValue {
	hue: number;
	amount: number;
	luma: number;
}

export interface CurvePoint {
	x: number;
	y: number;
}

export type CurveChannel = "master" | "r" | "g" | "b";

export interface GradeState {
	exposure: number; // stops, -3..3
	contrast: number; // -1..1
	temperature: number; // -1 (koel) .. 1 (warm)
	tint: number; // -1 (groen) .. 1 (magenta)
	saturation: number; // 0..2, 1 = neutraal
	lift: WheelValue;
	gamma: WheelValue;
	gain: WheelValue;
	curves: Record<CurveChannel, CurvePoint[]>;
}

export const IDENTITY_CURVE: CurvePoint[] = [
	{ x: 0, y: 0 },
	{ x: 1, y: 1 },
];

const NEUTRAL_WHEEL: WheelValue = { hue: 0, amount: 0, luma: 0 };

export function createDefaultGrade(): GradeState {
	return {
		exposure: 0,
		contrast: 0,
		temperature: 0,
		tint: 0,
		saturation: 1,
		lift: { ...NEUTRAL_WHEEL },
		gamma: { ...NEUTRAL_WHEEL },
		gain: { ...NEUTRAL_WHEEL },
		curves: {
			master: IDENTITY_CURVE.map((p) => ({ ...p })),
			r: IDENTITY_CURVE.map((p) => ({ ...p })),
			g: IDENTITY_CURVE.map((p) => ({ ...p })),
			b: IDENTITY_CURVE.map((p) => ({ ...p })),
		},
	};
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function curveIsIdentity(points: CurvePoint[]): boolean {
	return points.length === 2 && points[0].x === 0 && points[0].y === 0 && points[1].x === 1 && points[1].y === 1;
}

export function isIdentityGrade(grade: GradeState): boolean {
	const wheelIdle = (w: WheelValue) => w.amount === 0 && w.luma === 0;
	return (
		grade.exposure === 0 &&
		grade.contrast === 0 &&
		grade.temperature === 0 &&
		grade.tint === 0 &&
		grade.saturation === 1 &&
		wheelIdle(grade.lift) &&
		wheelIdle(grade.gamma) &&
		wheelIdle(grade.gain) &&
		(["master", "r", "g", "b"] as const).every((c) => curveIsIdentity(grade.curves[c]))
	);
}

/** Wiel -> nulgemiddelde RGB-offset (zuivere tint, geen helderheidsverschuiving). */
export function wheelToRgb(wheel: WheelValue): Rgb {
	const h = (wheel.hue * Math.PI) / 180;
	const third = (2 * Math.PI) / 3;
	return [
		wheel.amount * Math.cos(h),
		wheel.amount * Math.cos(h - third),
		wheel.amount * Math.cos(h - 2 * third),
	];
}

/** Wielpositie (puck) -> WheelValue; x,y in -1..1 met y omhoog. */
export function puckToWheel(x: number, y: number, luma: number): WheelValue {
	const amount = Math.min(1, Math.hypot(x, y));
	let hue = (Math.atan2(y, x) * 180) / Math.PI;
	if (hue < 0) hue += 360;
	return { hue: amount === 0 ? 0 : hue, amount, luma };
}

export function wheelToPuck(wheel: WheelValue): { x: number; y: number } {
	const h = (wheel.hue * Math.PI) / 180;
	return { x: wheel.amount * Math.cos(h), y: wheel.amount * Math.sin(h) };
}

// ---------------------------------------------------------------------------
// Curves: monotone kubische interpolatie (Fritsch-Carlson), 256 stappen
// ---------------------------------------------------------------------------

export function sortCurvePoints(points: CurvePoint[]): CurvePoint[] {
	return [...points].sort((a, b) => a.x - b.x);
}

export function evaluateCurve(points: CurvePoint[], x: number): number {
	const pts = sortCurvePoints(points);
	if (pts.length === 0) return clamp01(x);
	if (x <= pts[0].x) return clamp01(pts[0].y);
	const last = pts[pts.length - 1];
	if (x >= last.x) return clamp01(last.y);
	const n = pts.length;
	const dx: number[] = [];
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		dx.push(pts[i + 1].x - pts[i].x);
		slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1e-9));
	}
	const m: number[] = new Array(n).fill(0);
	m[0] = slope[0];
	m[n - 1] = slope[n - 2];
	for (let i = 1; i < n - 1; i++) {
		m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
	}
	for (let i = 0; i < n - 1; i++) {
		if (slope[i] === 0) {
			m[i] = 0;
			m[i + 1] = 0;
			continue;
		}
		const a = m[i] / slope[i];
		const b = m[i + 1] / slope[i];
		const s = a * a + b * b;
		if (s > 9) {
			const t = 3 / Math.sqrt(s);
			m[i] = t * a * slope[i];
			m[i + 1] = t * b * slope[i];
		}
	}
	let seg = 0;
	while (seg < n - 2 && x > pts[seg + 1].x) seg++;
	const t = (x - pts[seg].x) / dx[seg];
	const t2 = t * t;
	const t3 = t2 * t;
	const y =
		(2 * t3 - 3 * t2 + 1) * pts[seg].y +
		(t3 - 2 * t2 + t) * dx[seg] * m[seg] +
		(-2 * t3 + 3 * t2) * pts[seg + 1].y +
		(t3 - t2) * dx[seg] * m[seg + 1];
	return clamp01(y);
}

export const CURVE_LUT_SIZE = 256;

/** RGBA8 1D-LUT (256x1): master al in R/G/B verwerkt. Alpha altijd 255. */
export function buildCurveLut(grade: GradeState): Uint8Array {
	const out = new Uint8Array(CURVE_LUT_SIZE * 4);
	for (let i = 0; i < CURVE_LUT_SIZE; i++) {
		const x = i / (CURVE_LUT_SIZE - 1);
		const m = evaluateCurve(grade.curves.master, x);
		out[i * 4] = Math.round(evaluateCurve(grade.curves.r, m) * 255);
		out[i * 4 + 1] = Math.round(evaluateCurve(grade.curves.g, m) * 255);
		out[i * 4 + 2] = Math.round(evaluateCurve(grade.curves.b, m) * 255);
		out[i * 4 + 3] = 255;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Uniform-waarden (gedeeld tussen CPU-referentie en shader)
// ---------------------------------------------------------------------------

export interface GradeUniforms {
	exposure: number; // vermenigvuldiger 2^stops
	wb: Rgb; // temperatuur/tint-vermenigvuldiger
	lift: Rgb;
	gammaExp: Rgb; // exponent per kanaal (1/gamma)
	gain: Rgb;
	contrast: number; // helling rond 0.5
	saturation: number;
}

export function gradeToUniforms(grade: GradeState): GradeUniforms {
	const lift = wheelToRgb(grade.lift);
	const gamma = wheelToRgb(grade.gamma);
	const gain = wheelToRgb(grade.gain);
	const t = grade.temperature;
	const n = grade.tint;
	return {
		exposure: 2 ** grade.exposure,
		wb: [1 + 0.3 * t, 1 - 0.3 * n, 1 - 0.3 * t],
		lift: lift.map((v) => (v + grade.lift.luma) * 0.5) as Rgb,
		gammaExp: gamma.map((v) => 1 / 2 ** (v + grade.gamma.luma)) as Rgb,
		gain: gain.map((v) => 1 + v + grade.gain.luma) as Rgb,
		contrast: 1 + grade.contrast,
		saturation: grade.saturation,
	};
}

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

/** CPU-referentie van de shader. Invoer en uitvoer 0..1. */
export function applyGrade(
	rgb: Rgb,
	uniforms: GradeUniforms,
	curveLut: Uint8Array,
): Rgb {
	const out: Rgb = [0, 0, 0];
	for (let k = 0; k < 3; k++) {
		let c = rgb[k] * uniforms.exposure * uniforms.wb[k];
		c = c * uniforms.gain[k] + uniforms.lift[k] * (1 - c);
		c = Math.max(c, 0) ** uniforms.gammaExp[k];
		out[k] = (c - 0.5) * uniforms.contrast + 0.5;
	}
	const y = out[0] * LUMA[0] + out[1] * LUMA[1] + out[2] * LUMA[2];
	for (let k = 0; k < 3; k++) {
		const c = clamp01(y + (out[k] - y) * uniforms.saturation);
		// lineaire interpolatie in de 256-LUT, gelijk aan GL_LINEAR
		const pos = c * (CURVE_LUT_SIZE - 1);
		const lo = Math.floor(pos);
		const hi = Math.min(CURVE_LUT_SIZE - 1, lo + 1);
		const f = pos - lo;
		out[k] = (curveLut[lo * 4 + k] * (1 - f) + curveLut[hi * 4 + k] * f) / 255;
	}
	return out;
}

/** Verwerk een RGBA-buffer in place (voor de CPU-fallback). */
export function applyGradeToImageData(data: Uint8ClampedArray, grade: GradeState): void {
	const uniforms = gradeToUniforms(grade);
	const lut = buildCurveLut(grade);
	for (let i = 0; i < data.length; i += 4) {
		const [r, g, b] = applyGrade([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255], uniforms, lut);
		data[i] = Math.round(r * 255);
		data[i + 1] = Math.round(g * 255);
		data[i + 2] = Math.round(b * 255);
	}
}

// ---------------------------------------------------------------------------
// .cube 3D-LUT export (Adobe/Iridas cube-formaat, publiek gedocumenteerd)
// ---------------------------------------------------------------------------

export function buildCubeLut(grade: GradeState, size = 33, title = "DGDH CUT grade"): string {
	if (!Number.isInteger(size) || size < 2 || size > 65) {
		throw new RangeError("LUT-grootte moet een geheel getal van 2 t/m 65 zijn");
	}
	const uniforms = gradeToUniforms(grade);
	const lut = buildCurveLut(grade);
	const lines = [
		`TITLE "${title.replace(/"/g, "'")}"`,
		`LUT_3D_SIZE ${size}`,
		"DOMAIN_MIN 0.0 0.0 0.0",
		"DOMAIN_MAX 1.0 1.0 1.0",
		"",
	];
	const step = size - 1;
	// .cube: rood wisselt het snelst, dan groen, dan blauw
	for (let b = 0; b < size; b++) {
		for (let g = 0; g < size; g++) {
			for (let r = 0; r < size; r++) {
				const [or, og, ob] = applyGrade([r / step, g / step, b / step], uniforms, lut);
				lines.push(`${or.toFixed(6)} ${og.toFixed(6)} ${ob.toFixed(6)}`);
			}
		}
	}
	return `${lines.join("\n")}\n`;
}

export function parseCubeLut(text: string): { size: number; values: Float32Array } {
	let size = 0;
	const values: number[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const sizeMatch = /^LUT_3D_SIZE\s+(\d+)/.exec(line);
		if (sizeMatch) {
			size = Number(sizeMatch[1]);
			continue;
		}
		if (/^[A-Z_]+\b/.test(line)) continue;
		const parts = line.split(/\s+/).map(Number);
		if (parts.length === 3 && parts.every(Number.isFinite)) values.push(...parts);
	}
	if (!size || values.length !== size ** 3 * 3) throw new Error("ongeldige .cube");
	return { size, values: Float32Array.from(values) };
}
