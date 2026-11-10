/**
 * Scopes uit RGBA-pixels: histogram, waveform, vectorscope.
 * De berekeningen zijn puur (testbaar); tekenen gebeurt in draw*-functies.
 */

export interface ScopeData {
	histogram: { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array };
	/** counts[kanaal][x * WAVE_H + niveau]; kanaal 0=R 1=G 2=B */
	waveform: { width: number; counts: Uint32Array[]; max: number };
	/** counts[cbIndex * VEC_SIZE + crIndex] */
	vector: { counts: Uint32Array; max: number };
	pixels: number;
}

export const WAVE_H = 256;
export const VEC_SIZE = 128;
export const WAVE_COLUMNS = 256;

const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** Rec. 709 Cb/Cr op 0..1 invoer; waarden in -0.5..0.5. */
export function rgbToCbCr(r: number, g: number, b: number): { cb: number; cr: number } {
	const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
	return { cb: (b - y) / 1.8556, cr: (r - y) / 1.5748 };
}

export function computeScopes(
	data: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
): ScopeData {
	const cols = Math.min(WAVE_COLUMNS, width);
	const hist = {
		r: new Uint32Array(256),
		g: new Uint32Array(256),
		b: new Uint32Array(256),
		luma: new Uint32Array(256),
	};
	const waveCounts = [0, 1, 2].map(() => new Uint32Array(cols * WAVE_H));
	const vec = new Uint32Array(VEC_SIZE * VEC_SIZE);
	let waveMax = 0;
	let vecMax = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			hist.r[r]++;
			hist.g[g]++;
			hist.b[b]++;
			hist.luma[Math.round(LUMA[0] * r + LUMA[1] * g + LUMA[2] * b)]++;
			const col = Math.min(cols - 1, Math.floor((x * cols) / width));
			const cr = ++waveCounts[0][col * WAVE_H + r];
			const cg = ++waveCounts[1][col * WAVE_H + g];
			const cb = ++waveCounts[2][col * WAVE_H + b];
			waveMax = Math.max(waveMax, cr, cg, cb);
			const c = rgbToCbCr(r / 255, g / 255, b / 255);
			const vx = Math.min(VEC_SIZE - 1, Math.max(0, Math.floor((c.cb + 0.5) * VEC_SIZE)));
			const vy = Math.min(VEC_SIZE - 1, Math.max(0, Math.floor((c.cr + 0.5) * VEC_SIZE)));
			const count = ++vec[vx * VEC_SIZE + vy];
			if (count > vecMax) vecMax = count;
		}
	}
	return {
		histogram: hist,
		waveform: { width: cols, counts: waveCounts, max: Math.max(1, waveMax) },
		vector: { counts: vec, max: Math.max(1, vecMax) },
		pixels: width * height,
	};
}

type Ctx = CanvasRenderingContext2D;

const GRATICULE = "rgba(167,169,174,0.35)";
const LABEL = "#a7a9ae";

function clear(ctx: Ctx, w: number, h: number) {
	ctx.clearRect(0, 0, w, h);
	ctx.fillStyle = "#0e1116";
	ctx.fillRect(0, 0, w, h);
}

export function drawHistogram(ctx: Ctx, data: ScopeData, w: number, h: number) {
	clear(ctx, w, h);
	const { r, g, b } = data.histogram;
	let peak = 1;
	for (let i = 1; i < 255; i++) peak = Math.max(peak, r[i], g[i], b[i]);
	ctx.globalCompositeOperation = "lighter";
	for (const [arr, color] of [
		[r, "rgba(224,88,79,0.85)"],
		[g, "rgba(63,163,122,0.85)"],
		[b, "rgba(90,140,230,0.85)"],
	] as const) {
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.moveTo(0, h);
		for (let i = 0; i < 256; i++) {
			const v = Math.min(1, arr[i] / peak);
			ctx.lineTo((i / 255) * w, h - v * (h - 2));
		}
		ctx.lineTo(w, h);
		ctx.closePath();
		ctx.fill();
	}
	ctx.globalCompositeOperation = "source-over";
	ctx.strokeStyle = GRATICULE;
	ctx.lineWidth = 1;
	for (const q of [0.25, 0.5, 0.75]) {
		ctx.beginPath();
		ctx.moveTo(q * w, 0);
		ctx.lineTo(q * w, h);
		ctx.stroke();
	}
}

export function drawWaveform(ctx: Ctx, data: ScopeData, w: number, h: number) {
	clear(ctx, w, h);
	const { width: cols, counts, max } = data.waveform;
	const img = ctx.createImageData(w, h);
	const gain = 255 / Math.max(1, max * 0.15);
	for (let x = 0; x < w; x++) {
		const col = Math.min(cols - 1, Math.floor((x * cols) / w));
		for (let level = 0; level < WAVE_H; level++) {
			const y = Math.min(h - 1, Math.round((1 - level / (WAVE_H - 1)) * (h - 1)));
			const o = (y * w + x) * 4;
			for (let k = 0; k < 3; k++) {
				const v = counts[k][col * WAVE_H + level];
				if (v) img.data[o + k] = Math.min(255, img.data[o + k] + v * gain);
			}
			if (counts[0][col * WAVE_H + level] || counts[1][col * WAVE_H + level] || counts[2][col * WAVE_H + level]) {
				img.data[o + 3] = 255;
			}
		}
	}
	// zwarte achtergrond onder transparante pixels bewaren
	const bg = ctx.getImageData(0, 0, w, h);
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) {
			img.data[i] = bg.data[i];
			img.data[i + 1] = bg.data[i + 1];
			img.data[i + 2] = bg.data[i + 2];
			img.data[i + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	ctx.strokeStyle = GRATICULE;
	ctx.fillStyle = LABEL;
	ctx.font = "12px 'IBM Plex Mono', monospace";
	ctx.lineWidth = 1;
	for (const q of [0, 25, 50, 75, 100]) {
		const y = Math.round((1 - q / 100) * (h - 1)) + 0.5;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(w, y);
		ctx.stroke();
		if (q > 0 && q < 100) ctx.fillText(String(q), 3, y - 2);
	}
}

/** Posities (Cb, Cr) van 75% kleurbalk-doelen, voor het raster. */
export const VECTOR_TARGETS: Array<{ label: string; rgb: [number, number, number] }> = [
	{ label: "R", rgb: [0.75, 0, 0] },
	{ label: "Y", rgb: [0.75, 0.75, 0] },
	{ label: "G", rgb: [0, 0.75, 0] },
	{ label: "C", rgb: [0, 0.75, 0.75] },
	{ label: "B", rgb: [0, 0, 0.75] },
	{ label: "M", rgb: [0.75, 0, 0.75] },
];

/** Huidtoon-lijn: ongeveer 123 graden in de (Cb, Cr)-plank. */
export const SKIN_LINE_DEG = 123;

export function drawVectorscope(ctx: Ctx, data: ScopeData, size: number) {
	clear(ctx, size, size);
	const cx = size / 2;
	const radius = size / 2 - 2;
	ctx.strokeStyle = GRATICULE;
	ctx.lineWidth = 1;
	for (const rr of [0.5, 1]) {
		ctx.beginPath();
		ctx.arc(cx, cx, radius * rr, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.moveTo(cx, 2);
	ctx.lineTo(cx, size - 2);
	ctx.moveTo(2, cx);
	ctx.lineTo(size - 2, cx);
	ctx.stroke();
	// huidtoon-lijn
	const sk = (SKIN_LINE_DEG * Math.PI) / 180;
	ctx.strokeStyle = "rgba(181,140,103,0.8)";
	ctx.beginPath();
	ctx.moveTo(cx, cx);
	ctx.lineTo(cx + Math.cos(sk) * radius, cx - Math.sin(sk) * radius);
	ctx.stroke();
	// punten
	const { counts, max } = data.vector;
	ctx.fillStyle = "#f8f7f4";
	const cell = size / VEC_SIZE;
	for (let vx = 0; vx < VEC_SIZE; vx++) {
		for (let vy = 0; vy < VEC_SIZE; vy++) {
			const v = counts[vx * VEC_SIZE + vy];
			if (!v) continue;
			ctx.globalAlpha = Math.min(1, 0.25 + (v / max) * 0.75 * 4);
			ctx.fillRect(vx * cell, size - (vy + 1) * cell, Math.max(1, cell), Math.max(1, cell));
		}
	}
	ctx.globalAlpha = 1;
	// doelvakjes
	ctx.strokeStyle = LABEL;
	ctx.fillStyle = LABEL;
	ctx.font = "12px 'IBM Plex Mono', monospace";
	for (const t of VECTOR_TARGETS) {
		const { cb, cr } = rgbToCbCr(...t.rgb);
		const x = (cb + 0.5) * size;
		const y = size - (cr + 0.5) * size;
		ctx.strokeRect(x - 3, y - 3, 6, 6);
		ctx.fillText(t.label, x + 5, y - 4);
	}
}
