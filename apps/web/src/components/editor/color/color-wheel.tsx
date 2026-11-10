"use client";

import { useCallback, useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import {
	puckToWheel,
	wheelToPuck,
	type WheelValue,
} from "./grade-math";

const SIZE = 96;

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
	};
	return [f(5), f(3), f(1)];
}

/** Hue/verzadigings-schijf, bewust gedempt zodat de puck goed leesbaar blijft. */
function drawDisc(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	canvas.width = SIZE * dpr;
	canvas.height = SIZE * dpr;
	const img = ctx.createImageData(canvas.width, canvas.height);
	const r = canvas.width / 2;
	for (let y = 0; y < canvas.height; y++) {
		for (let x = 0; x < canvas.width; x++) {
			const dx = (x + 0.5 - r) / r;
			const dy = -(y + 0.5 - r) / r;
			const d = Math.hypot(dx, dy);
			if (d > 1) continue;
			const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
			const [cr, cg, cb] = hsvToRgb(hue, d * 0.7, 0.5);
			const o = (y * canvas.width + x) * 4;
			img.data[o] = Math.round(cr * 255);
			img.data[o + 1] = Math.round(cg * 255);
			img.data[o + 2] = Math.round(cb * 255);
			img.data[o + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
}

export function ColorWheel({
	label,
	value,
	onChange,
}: {
	label: string;
	value: WheelValue;
	onChange: (next: WheelValue) => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const areaRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (canvasRef.current) drawDisc(canvasRef.current);
	}, []);

	const move = useCallback(
		(clientX: number, clientY: number) => {
			const el = areaRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const x = ((clientX - rect.left) / rect.width) * 2 - 1;
			const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
			onChange(puckToWheel(x, y, value.luma));
		},
		[onChange, value.luma],
	);

	const puck = wheelToPuck(value);
	const reset = () => onChange({ hue: 0, amount: 0, luma: 0 });

	return (
		<div className="flex w-full min-w-0 flex-col items-center gap-2">
			<span className="text-xs font-medium uppercase tracking-wide">{label}</span>
			{/* biome-ignore lint/a11y/useSemanticElements: pointer-gestuur wiel met toetsenbord-alternatief */}
			<div
				ref={areaRef}
				role="group"
				aria-label={`${label} kleurwiel. Pijltjestoetsen verplaatsen, Delete herstelt.`}
				tabIndex={0}
				data-testid={`wheel-${label.toLowerCase()}`}
				className="focus-visible:ring-ring relative aspect-square w-full max-w-24 touch-none rounded-full focus-visible:ring-2 focus-visible:outline-hidden"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					move(e.clientX, e.clientY);
				}}
				onPointerMove={(e) => {
					if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX, e.clientY);
				}}
				onDoubleClick={reset}
				onKeyDown={(e) => {
					const step = e.shiftKey ? 0.1 : 0.02;
					const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
					const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
					if (e.key === "Delete" || e.key === "Backspace") {
						e.preventDefault();
						reset();
					} else if (dx || dy) {
						e.preventDefault();
						onChange(puckToWheel(puck.x + dx, puck.y + dy, value.luma));
					}
				}}
			>
				<canvas
					ref={canvasRef}
					className="border-border-strong size-full rounded-full border"
					aria-hidden="true"
				/>
				<span
					className="border-foreground bg-background pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
					style={{
						left: `${(puck.x * 0.5 + 0.5) * 100}%`,
						top: `${(-puck.y * 0.5 + 0.5) * 100}%`,
					}}
				/>
			</div>
			<Slider
				aria-label={`${label} helderheid`}
				value={[value.luma]}
				min={-1}
				max={1}
				step={0.01}
				onValueChange={([luma]) => onChange({ ...value, luma })}
			/>
			<span className="text-muted-foreground text-center text-xs tabular-nums break-words">
				{Math.round(value.hue)}° · {value.amount.toFixed(2)} · {value.luma.toFixed(2)}
			</span>
		</div>
	);
}
