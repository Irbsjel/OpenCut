"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	IDENTITY_CURVE,
	evaluateCurve,
	sortCurvePoints,
	type CurveChannel,
	type CurvePoint,
	type GradeState,
} from "./grade-math";
import { cn } from "@/utils/ui";

const SIZE = 180;
const CHANNELS: Array<{ id: CurveChannel; label: string; stroke: string }> = [
	{ id: "master", label: "Master", stroke: "var(--foreground)" },
	{ id: "r", label: "Rood", stroke: "var(--destructive)" },
	{ id: "g", label: "Groen", stroke: "var(--constructive)" },
	{ id: "b", label: "Blauw", stroke: "#5a8ce6" },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function CurvesEditor({
	curves,
	onChange,
}: {
	curves: GradeState["curves"];
	onChange: (channel: CurveChannel, points: CurvePoint[]) => void;
}) {
	const [channel, setChannel] = useState<CurveChannel>("master");
	const [active, setActive] = useState<number | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const points = sortCurvePoints(curves[channel]);
	const stroke = CHANNELS.find((c) => c.id === channel)?.stroke ?? "var(--foreground)";

	const toLocal = (clientX: number, clientY: number): CurvePoint => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) return { x: 0, y: 0 };
		return {
			x: clamp01((clientX - rect.left) / rect.width),
			y: clamp01(1 - (clientY - rect.top) / rect.height),
		};
	};

	const path = Array.from({ length: 65 }, (_, i) => {
		const x = i / 64;
		return `${i === 0 ? "M" : "L"}${(x * SIZE).toFixed(1)},${((1 - evaluateCurve(points, x)) * SIZE).toFixed(1)}`;
	}).join(" ");

	const setPoint = (index: number, next: CurvePoint) => {
		const copy = points.map((p) => ({ ...p }));
		const isEnd = index === 0 || index === copy.length - 1;
		const minX = isEnd ? copy[index].x : (copy[index - 1]?.x ?? 0) + 0.01;
		const maxX = isEnd ? copy[index].x : (copy[index + 1]?.x ?? 1) - 0.01;
		copy[index] = { x: Math.max(minX, Math.min(maxX, next.x)), y: clamp01(next.y) };
		onChange(channel, copy);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-1" role="tablist" aria-label="Curvekanaal">
				{CHANNELS.map((c) => (
					<Button
						key={c.id}
						type="button"
						role="tab"
						aria-selected={channel === c.id}
						size="sm"
						variant={channel === c.id ? "secondary" : "ghost"}
						onClick={() => setChannel(c.id)}
					>
						{c.label}
					</Button>
				))}
			</div>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				role="application"
				aria-label={`${channel} curve. Klik om een punt toe te voegen, sleep om te wijzigen, dubbelklik op een punt om te verwijderen.`}
				data-testid="curves-editor"
				className="border-border-strong bg-background aspect-square w-full max-w-[220px] touch-none self-center rounded-sm border"
				onPointerDown={(e) => {
					if ((e.target as Element).tagName === "circle") return;
					const p = toLocal(e.clientX, e.clientY);
					const next = sortCurvePoints([...points, p]);
					onChange(channel, next);
					setActive(next.findIndex((q) => q === p));
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					if (active !== null && e.currentTarget.hasPointerCapture(e.pointerId)) {
						setPoint(active, toLocal(e.clientX, e.clientY));
					}
				}}
				onPointerUp={() => setActive(null)}
			>
				{[0.25, 0.5, 0.75].map((q) => (
					<g key={q} stroke="var(--border)" strokeWidth={1}>
						<line x1={q * SIZE} y1={0} x2={q * SIZE} y2={SIZE} />
						<line x1={0} y1={q * SIZE} x2={SIZE} y2={q * SIZE} />
					</g>
				))}
				<line x1={0} y1={SIZE} x2={SIZE} y2={0} stroke="var(--border-strong)" strokeDasharray="3 4" />
				<path d={path} fill="none" stroke={stroke} strokeWidth={2} />
				{points.map((p, i) => (
					<circle
						// biome-ignore lint/suspicious/noArrayIndexKey: punten hebben geen id; volgorde is stabiel tijdens slepen
						key={i}
						cx={p.x * SIZE}
						cy={(1 - p.y) * SIZE}
						r={5}
						className={cn("cursor-grab fill-background", active === i && "cursor-grabbing")}
						stroke={stroke}
						strokeWidth={2}
						onPointerDown={(e) => {
							e.stopPropagation();
							setActive(i);
							svgRef.current?.setPointerCapture(e.pointerId);
						}}
						onDoubleClick={() => {
							if (i === 0 || i === points.length - 1) return;
							onChange(channel, points.filter((_, j) => j !== i));
						}}
					/>
				))}
			</svg>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => onChange(channel, IDENTITY_CURVE.map((p) => ({ ...p })))}
			>
				Curve herstellen
			</Button>
		</div>
	);
}
