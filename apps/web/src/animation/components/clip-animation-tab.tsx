"use client";

import { useState, useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import type { VisualElement } from "@/timeline";
import { TICKS_PER_SECOND, mediaTimeToSeconds, type MediaTime } from "@/wasm";
import {
	CLIP_ANIM_IN_OPTIONS,
	CLIP_ANIM_LOOP_OPTIONS,
	CLIP_ANIM_OUT_OPTIONS,
	CLIP_COMBO_PRESETS,
	readClipAnimationParams,
	type ClipAnimInStyle,
	type ClipAnimLoopStyle,
	type ClipAnimOutStyle,
	type ClipComboPreset,
	type TransitionCategory,
} from "@/animation/clip-animations";
import { cn } from "@/utils/ui";
import { extractAndSaveClipLastFrame } from "@/media/extract-last-frame";
import { Play, RotateCcw, Sparkles, ArrowRight, Repeat, LogOut, Camera } from "lucide-react";

type PhaseTab = "in" | "loop" | "out" | "combo";

export function ClipAnimationTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
		editor.playback.getCurrentTime(),
	);
	const [activePhase, setActivePhase] = useState<PhaseTab>("in");
	const [categoryFilter, setCategoryFilter] =
		useState<TransitionCategory>("all");

	useEffect(() => {
		let lastWall = 0;
		const unsubUpdate = editor.playback.onUpdate((t) => {
			const now = performance.now();
			if (now - lastWall >= 140) {
				lastWall = now;
				setCurrentTime(t);
			}
		});
		const unsubSeek = editor.playback.onSeek((t) => {
			const now = performance.now();
			if (now - lastWall >= 90) {
				lastWall = now;
				setCurrentTime(t);
			}
		});
		return () => {
			unsubUpdate();
			unsubSeek();
		};
	}, [editor.playback]);

	const isText = element.type === "text";
	const durationSec = Math.max(
		0.2,
		mediaTimeToSeconds({ time: element.duration }),
	);
	const localClipSec = Math.max(
		0,
		Math.min(
			durationSec,
			(currentTime - element.startTime) / TICKS_PER_SECOND,
		),
	);
	const playheadPct = Math.max(
		0,
		Math.min(100, (localClipSec / durationSec) * 100),
	);
	const rawParams =
		"params" in element && element.params
			? (element.params as Record<string, unknown>)
			: {};
	const cfg = readClipAnimationParams(rawParams);

	const inDur =
		cfg.animIn !== "none"
			? Math.min(cfg.animInDuration, durationSec * 0.85)
			: 0;
	const outDur =
		cfg.animOut !== "none"
			? Math.min(
					cfg.animOutDuration,
					Math.max(0.08, durationSec - inDur * 0.5),
				)
			: 0;
	const loopDur = Math.max(0, durationSec - inDur - outDur);

	const inWidthPct = Math.round((inDur / durationSec) * 100);
	const outWidthPct = Math.round((outDur / durationSec) * 100);
	const loopWidthPct = Math.max(0, 100 - inWidthPct - outWidthPct);

	const livePhaseNow: "in" | "loop" | "out" =
		inDur > 0.01 && localClipSec <= inDur
			? "in"
			: outDur > 0.01 && localClipSec >= durationSec - outDur
				? "out"
				: "loop";

	const patchClipParams = (
		patch: Record<string, string | number | boolean>,
		seekPhase?: "in" | "loop" | "out",
	) => {
		const nextParams = {
			...rawParams,
			...patch,
		};
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						params: nextParams,
					} as Partial<VisualElement>,
				},
			],
		});

		if (seekPhase) {
			seekToPhase(seekPhase, nextParams);
		}
	};

	const seekToPhase = (
		phase: "in" | "loop" | "out",
		overrideParams?: Record<string, unknown>,
	) => {
		const nextCfg = readClipAnimationParams(overrideParams ?? rawParams);
		const nextIn =
			nextCfg.animIn !== "none"
				? Math.min(nextCfg.animInDuration, durationSec * 0.85)
				: 0.5;
		const nextOut =
			nextCfg.animOut !== "none"
				? Math.min(nextCfg.animOutDuration, durationSec * 0.85)
				: 0.5;

		let offsetSec = 0.2;
		if (phase === "in") {
			offsetSec = Math.min(durationSec * 0.4, nextIn * 0.45);
		} else if (phase === "loop") {
			offsetSec = durationSec * 0.5;
		} else if (phase === "out") {
			offsetSec = Math.max(0.05, durationSec - nextOut * 0.55);
		}

		const targetTicks = Math.round(
			element.startTime + offsetSec * TICKS_PER_SECOND,
		) as MediaTime;
		editor.playback.seek({ time: targetTicks });
	};

	const handlePreviewClip = () => {
		editor.playback.seek({ time: element.startTime });
		if (!editor.playback.getIsPlaying()) {
			editor.playback.toggle();
		}
	};

	const handleResetAll = () => {
		patchClipParams({
			animIn: "none",
			animLoop: "none",
			animOut: "none",
			...(isText ? { letterAnimation: "none" } : {}),
		});
	};

	const handleApplyCombo = (combo: ClipComboPreset) => {
		patchClipParams(
			{
				animIn: combo.animIn,
				animInDuration: combo.animInDuration,
				animLoop: combo.animLoop,
				animLoopSpeed: combo.animLoopSpeed,
				animLoopIntensity: combo.animLoopIntensity,
				animOut: combo.animOut,
				animOutDuration: combo.animOutDuration,
			},
			"in",
		);
	};

	const inOptions = CLIP_ANIM_IN_OPTIONS.filter(
		(opt) =>
			(!opt.textOnly || isText) &&
			(categoryFilter === "all" ||
				opt.value === "none" ||
				opt.category === categoryFilter),
	);
	const loopOptions = CLIP_ANIM_LOOP_OPTIONS.filter(
		(opt) => !opt.textOnly || isText,
	);
	const outOptions = CLIP_ANIM_OUT_OPTIONS.filter(
		(opt) =>
			(!opt.textOnly || isText) &&
			(categoryFilter === "all" ||
				opt.value === "none" ||
				opt.category === categoryFilter),
	);
	const comboOptions = CLIP_COMBO_PRESETS.filter(
		(opt) => !opt.textOnly || isText,
	);

	const categoryPills: Array<{ id: TransitionCategory; label: string }> = [
		{ id: "all", label: "Todas" },
		{ id: "camera", label: "Cámara" },
		{ id: "light", label: "Luz 35mm" },
		{ id: "mask", label: "Máscaras GL" },
		{ id: "glitch", label: "Glitch" },
		{ id: "3d", label: "3D" },
		...(isText ? [{ id: "text" as TransitionCategory, label: "Letras" }] : []),
	];

	return (
		<div className="flex flex-col gap-3 p-3 text-xs">
			{/* Header + Interactive 3-Phase CapCut Bar */}
			<div className="rounded-xl border border-white/10 bg-[#0b101b] p-2.5 shadow-inner">
				<div className="flex items-center justify-between gap-2 mb-2">
					<div className="flex items-center gap-1.5">
						<Sparkles className="size-3.5 text-sky-400" />
						<span className="font-semibold text-white">
							Animación CapCut (3 Fases)
						</span>
					</div>
					<div className="flex items-center gap-1">
						{element.type === "video" && (
							<button
								type="button"
								onClick={() =>
									void extractAndSaveClipLastFrame({
										editor,
										element,
										downloadFile: true,
									})
								}
								className="flex cursor-pointer items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
								title="Extraer el último frame del clip como imagen en Assets y descargar PNG (Continuidad IA / Last-frame conditioning)"
							>
								<Camera className="size-2.5" />
								Último Frame
							</button>
						)}
						<button
							type="button"
							onClick={handlePreviewClip}
							className="flex cursor-pointer items-center gap-1 rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300 border border-sky-500/30 hover:bg-sky-500/30"
							title="Reproducir desde el inicio del clip"
						>
							<Play className="size-2.5 fill-current" />
							Probar Clip
						</button>
						<button
							type="button"
							onClick={handleResetAll}
							className="flex cursor-pointer items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
							title="Limpiar animaciones"
						>
							<RotateCcw className="size-2.5" />
						</button>
					</div>
				</div>

				{/* Visual 3-Phase Timeline Bar with Live Playhead Needle */}
				<div className="relative flex h-7 w-full overflow-hidden rounded-lg border border-white/15 bg-slate-950">
					{/* Live Playhead Needle */}
					<div
						style={{ left: `${playheadPct}%` }}
						className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-amber-400 shadow-[0_0_8px_#fbbf24]"
					>
						<div className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-amber-300" />
					</div>

					<button
						type="button"
						onClick={() => {
							setActivePhase("in");
							seekToPhase("in");
						}}
						style={{ width: `${Math.max(18, inWidthPct)}%` }}
						className={cn(
							"flex h-full cursor-pointer items-center justify-center gap-1 border-r border-dashed border-emerald-400/40 px-1.5 text-[10px] font-semibold transition-all",
							cfg.animIn !== "none"
								? "bg-gradient-to-r from-emerald-500/40 to-emerald-500/15 text-emerald-200"
								: "bg-white/[0.03] text-slate-500",
							(activePhase === "in" || livePhaseNow === "in") &&
								"ring-1 ring-inset ring-emerald-400",
						)}
						title="Fase 1: Entrada (Inicio)"
					>
						<span className="truncate">
							▶ 1. In {cfg.animIn !== "none" ? `${inDur.toFixed(1)}s` : "Off"}
						</span>
					</button>

					<button
						type="button"
						onClick={() => {
							setActivePhase("loop");
							seekToPhase("loop");
						}}
						style={{ width: `${Math.max(28, loopWidthPct)}%` }}
						className={cn(
							"flex h-full cursor-pointer items-center justify-center gap-1 border-r border-dashed border-indigo-400/40 px-1.5 text-[10px] font-semibold transition-all",
							cfg.animLoop !== "none"
								? "bg-indigo-500/30 text-indigo-200"
								: "bg-white/[0.02] text-slate-400",
							(activePhase === "loop" || livePhaseNow === "loop") &&
								"ring-1 ring-inset ring-indigo-400",
						)}
						title="Fase 2: Enmedio (Bucle continuo)"
					>
						<span className="truncate">
							↻ 2. Bucle {cfg.animLoop !== "none" ? `${loopDur.toFixed(1)}s` : "Fijo"}
						</span>
					</button>

					<button
						type="button"
						onClick={() => {
							setActivePhase("out");
							seekToPhase("out");
						}}
						style={{ width: `${Math.max(18, outWidthPct)}%` }}
						className={cn(
							"flex h-full cursor-pointer items-center justify-center gap-1 px-1.5 text-[10px] font-semibold transition-all",
							cfg.animOut !== "none"
								? "bg-gradient-to-l from-rose-500/40 to-rose-500/15 text-rose-200"
								: "bg-white/[0.03] text-slate-500",
							(activePhase === "out" || livePhaseNow === "out") &&
								"ring-1 ring-inset ring-rose-400",
						)}
						title="Fase 3: Salida (Final)"
					>
						<span className="truncate">
							3. Out {cfg.animOut !== "none" ? `${outDur.toFixed(1)}s` : "Off"} ◀
						</span>
					</button>
				</div>

				<div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
					<span className="flex items-center gap-1 font-medium text-amber-300">
						<span>📍 Cursor: {localClipSec.toFixed(2)}s</span>
						<span className="rounded bg-white/10 px-1 py-[1px] text-[9px] text-white">
							{livePhaseNow === "in"
								? "En Entrada"
								: livePhaseNow === "out"
									? "En Salida"
									: "En Bucle"}
						</span>
					</span>
					<span className="text-sky-300/90 font-medium">
						Duración: {durationSec.toFixed(1)}s
					</span>
				</div>
			</div>

			{/* 4 Phase Selector Tabs */}
			<div className="grid grid-cols-4 gap-1 rounded-lg bg-white/5 p-1">
				<button
					type="button"
					onClick={() => {
						setActivePhase("in");
						seekToPhase("in");
					}}
					className={cn(
						"flex cursor-pointer flex-col items-center justify-center rounded-md py-1.5 text-[11px] font-medium transition",
						activePhase === "in"
							? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
							: "text-slate-400 hover:text-white",
					)}
				>
					<div className="flex items-center gap-1">
						<ArrowRight className="size-3" />
						<span>Entrada</span>
					</div>
					<span className="text-[9px] opacity-75">
						{cfg.animIn !== "none" ? `${inDur.toFixed(1)}s` : "Inicio"}
					</span>
				</button>

				<button
					type="button"
					onClick={() => {
						setActivePhase("loop");
						seekToPhase("loop");
					}}
					className={cn(
						"flex cursor-pointer flex-col items-center justify-center rounded-md py-1.5 text-[11px] font-medium transition",
						activePhase === "loop"
							? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
							: "text-slate-400 hover:text-white",
					)}
				>
					<div className="flex items-center gap-1">
						<Repeat className="size-3" />
						<span>Bucle</span>
					</div>
					<span className="text-[9px] opacity-75">
						{cfg.animLoop !== "none" ? `${cfg.animLoopSpeed.toFixed(1)}x` : "Enmedio"}
					</span>
				</button>

				<button
					type="button"
					onClick={() => {
						setActivePhase("out");
						seekToPhase("out");
					}}
					className={cn(
						"flex cursor-pointer flex-col items-center justify-center rounded-md py-1.5 text-[11px] font-medium transition",
						activePhase === "out"
							? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
							: "text-slate-400 hover:text-white",
					)}
				>
					<div className="flex items-center gap-1">
						<LogOut className="size-3" />
						<span>Salida</span>
					</div>
					<span className="text-[9px] opacity-75">
						{cfg.animOut !== "none" ? `${outDur.toFixed(1)}s` : "Final"}
					</span>
				</button>

				<button
					type="button"
					onClick={() => setActivePhase("combo")}
					className={cn(
						"flex cursor-pointer flex-col items-center justify-center rounded-md py-1.5 text-[11px] font-medium transition",
						activePhase === "combo"
							? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
							: "text-slate-400 hover:text-white",
					)}
				>
					<div className="flex items-center gap-1">
						<Sparkles className="size-3" />
						<span>Combo</span>
					</div>
					<span className="text-[9px] opacity-75">3 en 1</span>
				</button>
			</div>

			{/* PHASE 1: ENTRADA (IN) */}
			{activePhase === "in" && (
				<div className="flex flex-col gap-2.5">
					<div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
						<div className="flex items-center justify-between mb-1">
							<span className="font-semibold text-emerald-300">
								Duración de Entrada (Primera Parte)
							</span>
							<span className="font-mono text-emerald-200">
								{cfg.animInDuration.toFixed(2)}s
							</span>
						</div>
						<input
							type="range"
							min={0.1}
							max={Math.min(5, Math.max(0.5, durationSec * 0.8))}
							step={0.05}
							value={cfg.animInDuration}
							onChange={(e) =>
								patchClipParams(
									{ animInDuration: parseFloat(e.target.value) },
									"in",
								)
							}
							className="w-full accent-emerald-400 cursor-pointer"
						/>
					</div>

					<div className="flex items-center gap-1 overflow-x-auto pb-0.5">
						{categoryPills.map((cat) => (
							<button
								key={cat.id}
								type="button"
								onClick={() => setCategoryFilter(cat.id)}
								className={cn(
									"shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-[10px] font-semibold border transition",
									categoryFilter === cat.id
										? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
										: "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
								)}
							>
								{cat.label}
							</button>
						))}
					</div>

					<div className="grid grid-cols-2 gap-1.5 pb-6 pr-0.5">
						{inOptions.map((opt) => {
							const selected = cfg.animIn === opt.value;
							return (
								<button
									key={opt.value}
									type="button"
									onClick={() =>
										patchClipParams(
											{ animIn: opt.value as ClipAnimInStyle },
											"in",
										)
									}
									className={cn(
										"flex cursor-pointer flex-col gap-1 rounded-lg border p-2 text-left transition",
										selected
											? "border-emerald-400 bg-emerald-500/15 text-white shadow-sm"
											: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-500/10",
									)}
								>
									<AnimationMiniStage
										phase="in"
										styleId={opt.value}
										icon={opt.icon}
										badge={opt.badge}
										selected={selected}
									/>
									<span className="truncate font-semibold text-[11px] text-white">
										{opt.label}
									</span>
									<span className="line-clamp-2 text-[9px] text-slate-400 leading-tight">
										{opt.description}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* PHASE 2: ENMEDIO / BUCLE (LOOP) */}
			{activePhase === "loop" && (
				<div className="flex flex-col gap-2.5">
					<div className="flex flex-col gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2.5">
						<div>
							<div className="flex items-center justify-between mb-1">
								<span className="font-semibold text-indigo-300">
									Velocidad del Bucle (Enmedio)
								</span>
								<span className="font-mono text-indigo-200">
									{cfg.animLoopSpeed.toFixed(1)}x
								</span>
							</div>
							<input
								type="range"
								min={0.2}
								max={3.0}
								step={0.1}
								value={cfg.animLoopSpeed}
								onChange={(e) => {
									const v = parseFloat(e.target.value);
									patchClipParams(
										{
											animLoopSpeed: v,
											...(isText ? { letterAnimationSpeed: v } : {}),
										},
										"loop",
									);
								}}
								className="w-full accent-indigo-400 cursor-pointer"
							/>
						</div>
						<div>
							<div className="flex items-center justify-between mb-1">
								<span className="font-semibold text-indigo-300">
									Intensidad / Amplitud
								</span>
								<span className="font-mono text-indigo-200">
									{cfg.animLoopIntensity.toFixed(1)}x
								</span>
							</div>
							<input
								type="range"
								min={0.2}
								max={2.5}
								step={0.1}
								value={cfg.animLoopIntensity}
								onChange={(e) => {
									const v = parseFloat(e.target.value);
									patchClipParams(
										{
											animLoopIntensity: v,
											...(isText ? { letterAnimationIntensity: v } : {}),
										},
										"loop",
									);
								}}
								className="w-full accent-indigo-400 cursor-pointer"
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-1.5 pb-6 pr-0.5">
						{loopOptions.map((opt) => {
							const selected = cfg.animLoop === opt.value;
							return (
								<button
									key={opt.value}
									type="button"
									onClick={() =>
										patchClipParams(
											{ animLoop: opt.value as ClipAnimLoopStyle },
											"loop",
										)
									}
									className={cn(
										"flex cursor-pointer flex-col gap-1 rounded-lg border p-2 text-left transition",
										selected
											? "border-indigo-400 bg-indigo-500/15 text-white shadow-sm"
											: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10",
									)}
								>
									<AnimationMiniStage
										phase="loop"
										styleId={opt.value}
										icon={opt.icon}
										badge={opt.badge}
										selected={selected}
									/>
									<span className="truncate font-semibold text-[11px] text-white">
										{opt.label}
									</span>
									<span className="line-clamp-2 text-[9px] text-slate-400 leading-tight">
										{opt.description}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* PHASE 3: SALIDA (OUT) */}
			{activePhase === "out" && (
				<div className="flex flex-col gap-2.5">
					<div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5">
						<div className="flex items-center justify-between mb-1">
							<span className="font-semibold text-rose-300">
								Duración de Salida (Parte Final)
							</span>
							<span className="font-mono text-rose-200">
								{cfg.animOutDuration.toFixed(2)}s
							</span>
						</div>
						<input
							type="range"
							min={0.1}
							max={Math.min(5, Math.max(0.5, durationSec * 0.8))}
							step={0.05}
							value={cfg.animOutDuration}
							onChange={(e) =>
								patchClipParams(
									{ animOutDuration: parseFloat(e.target.value) },
									"out",
								)
							}
							className="w-full accent-rose-400 cursor-pointer"
						/>
					</div>

					<div className="flex items-center gap-1 overflow-x-auto pb-0.5">
						{categoryPills.map((cat) => (
							<button
								key={cat.id}
								type="button"
								onClick={() => setCategoryFilter(cat.id)}
								className={cn(
									"shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-[10px] font-semibold border transition",
									categoryFilter === cat.id
										? "border-rose-400 bg-rose-500/20 text-rose-200"
										: "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
								)}
							>
								{cat.label}
							</button>
						))}
					</div>

					<div className="grid grid-cols-2 gap-1.5 pb-6 pr-0.5">
						{outOptions.map((opt) => {
							const selected = cfg.animOut === opt.value;
							return (
								<button
									key={opt.value}
									type="button"
									onClick={() =>
										patchClipParams(
											{ animOut: opt.value as ClipAnimOutStyle },
											"out",
										)
									}
									className={cn(
										"flex cursor-pointer flex-col gap-1 rounded-lg border p-2 text-left transition",
										selected
											? "border-rose-400 bg-rose-500/15 text-white shadow-sm"
											: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-rose-500/40 hover:bg-rose-500/10",
									)}
								>
									<AnimationMiniStage
										phase="out"
										styleId={opt.value}
										icon={opt.icon}
										badge={opt.badge}
										selected={selected}
									/>
									<span className="truncate font-semibold text-[11px] text-white">
										{opt.label}
									</span>
									<span className="line-clamp-2 text-[9px] text-slate-400 leading-tight">
										{opt.description}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* COMBO (IN + LOOP + OUT) */}
			{activePhase === "combo" && (
				<div className="flex flex-col gap-2 pb-6 pr-0.5">
					{comboOptions.map((combo) => {
						const isCurrent =
							cfg.animIn === combo.animIn &&
							cfg.animLoop === combo.animLoop &&
							cfg.animOut === combo.animOut;
						return (
							<button
								key={combo.id}
								type="button"
								onClick={() => handleApplyCombo(combo)}
								className={cn(
									"flex cursor-pointer flex-col gap-1.5 rounded-xl border p-2.5 text-left transition",
									isCurrent
										? "border-amber-400 bg-amber-500/15 text-white"
										: "border-white/10 bg-white/[0.03] hover:border-amber-500/40 hover:bg-amber-500/10",
								)}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-semibold text-xs text-white">
										{combo.title}
									</span>
									<span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
										{combo.badge}
									</span>
								</div>
								<p className="text-[10px] text-slate-300">
									{combo.description}
								</p>
								<div className="flex items-center gap-1.5 text-[9px]">
									<span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">
										In: {combo.animIn}
									</span>
									<span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">
										Bucle: {combo.animLoop}
									</span>
									<span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
										Out: {combo.animOut}
									</span>
								</div>
							</button>
						);
					})}
				</div>
			)}

			<style>{`
				@keyframes oc-in-zoom-pop {
					0% { transform: scale(0.35); opacity: 0.1; }
					70% { transform: scale(1.12); opacity: 1; }
					100% { transform: scale(1); opacity: 1; }
				}
				@keyframes oc-in-slide-up {
					0% { transform: translateY(14px); opacity: 0.1; }
					100% { transform: translateY(0); opacity: 1; }
				}
				@keyframes oc-in-slide-right {
					0% { transform: translateX(-16px); opacity: 0.1; }
					100% { transform: translateX(0); opacity: 1; }
				}
				@keyframes oc-in-spin {
					0% { transform: scale(0.3) rotate(-140deg); opacity: 0.1; }
					100% { transform: scale(1) rotate(0deg); opacity: 1; }
				}
				@keyframes oc-in-elastic {
					0% { transform: translateY(-16px) scale(1.2); opacity: 0.1; }
					65% { transform: translateY(3px) scale(0.95); opacity: 1; }
					100% { transform: translateY(0) scale(1); opacity: 1; }
				}
				@keyframes oc-loop-pulse {
					0%, 100% { transform: scale(1); }
					50% { transform: scale(1.18); }
				}
				@keyframes oc-loop-float {
					0%, 100% { transform: translateY(0px); }
					50% { transform: translateY(-5px); }
				}
				@keyframes oc-loop-pendulum {
					0%, 100% { transform: rotate(-10deg); }
					50% { transform: rotate(10deg); }
				}
				@keyframes oc-loop-shake {
					0%, 100% { transform: translate(0, 0); }
					25% { transform: translate(-3px, 2px); }
					50% { transform: translate(3px, -2px); }
					75% { transform: translate(-2px, -2px); }
				}
				@keyframes oc-loop-flicker {
					0%, 100% { opacity: 1; }
					40% { opacity: 0.35; }
					60% { opacity: 0.95; }
					75% { opacity: 0.25; }
				}
				@keyframes oc-out-zoom {
					0% { transform: scale(1); opacity: 1; }
					100% { transform: scale(0.35); opacity: 0.1; }
				}
				@keyframes oc-out-slide-down {
					0% { transform: translateY(0); opacity: 1; }
					100% { transform: translateY(14px); opacity: 0.1; }
				}
				@keyframes oc-out-spin {
					0% { transform: scale(1) rotate(0deg); opacity: 1; }
					100% { transform: scale(0.3) rotate(140deg); opacity: 0.1; }
				}
			`}</style>
		</div>
	);
}

function getMiniStageAnimationStyle(
	phase: "in" | "loop" | "out",
	styleId: string,
): React.CSSProperties {
	if (styleId === "none") return {};
	if (phase === "in") {
		if (styleId.includes("zoom") || styleId.includes("pop")) {
			return { animation: "oc-in-zoom-pop 1.5s cubic-bezier(0.22,1,0.36,1) infinite" };
		}
		if (styleId.includes("up")) {
			return { animation: "oc-in-slide-up 1.5s cubic-bezier(0.22,1,0.36,1) infinite" };
		}
		if (styleId.includes("right") || styleId.includes("left") || styleId.includes("typewriter")) {
			return { animation: "oc-in-slide-right 1.5s cubic-bezier(0.22,1,0.36,1) infinite" };
		}
		if (styleId.includes("spin")) {
			return { animation: "oc-in-spin 1.6s cubic-bezier(0.22,1,0.36,1) infinite" };
		}
		return { animation: "oc-in-elastic 1.5s ease-out infinite" };
	}
	if (phase === "loop") {
		if (styleId.includes("pulse") || styleId.includes("breath") || styleId.includes("karaoke")) {
			return { animation: "oc-loop-pulse 1.1s ease-in-out infinite" };
		}
		if (styleId.includes("float") || styleId.includes("wave")) {
			return { animation: "oc-loop-float 1.2s ease-in-out infinite" };
		}
		if (styleId.includes("pendulum")) {
			return { animation: "oc-loop-pendulum 1.2s ease-in-out infinite" };
		}
		if (styleId.includes("shake") || styleId.includes("jitter") || styleId.includes("glitch")) {
			return { animation: "oc-loop-shake 0.45s linear infinite" };
		}
		if (styleId.includes("flicker")) {
			return { animation: "oc-loop-flicker 1.1s linear infinite" };
		}
		return { animation: "oc-loop-pulse 1.4s ease-in-out infinite" };
	}
	// out
	if (styleId.includes("zoom") || styleId.includes("pop")) {
		return { animation: "oc-out-zoom 1.5s ease-in infinite" };
	}
	if (styleId.includes("spin") || styleId.includes("scatter")) {
		return { animation: "oc-out-spin 1.6s ease-in infinite" };
	}
	return { animation: "oc-out-slide-down 1.5s ease-in infinite" };
}

function AnimationMiniStage({
	phase,
	styleId,
	icon,
	badge,
	selected,
}: {
	phase: "in" | "loop" | "out";
	styleId: string;
	icon: string;
	badge: string;
	selected: boolean;
}) {
	const colorClasses =
		phase === "in"
			? "border-emerald-500/25 bg-emerald-950/35 text-emerald-300"
			: phase === "loop"
				? "border-indigo-500/25 bg-indigo-950/35 text-indigo-300"
				: "border-rose-500/25 bg-rose-950/35 text-rose-300";

	return (
		<div
			className={cn(
				"relative flex h-8 w-full items-center justify-between overflow-hidden rounded-md border px-2",
				colorClasses,
				selected && "ring-1 ring-white/30",
			)}
		>
			<div className="flex items-center gap-1.5">
				<span
					style={getMiniStageAnimationStyle(phase, styleId)}
					className="inline-flex h-5 w-6 items-center justify-center rounded bg-white/15 text-[11px] font-bold text-white shadow-sm"
				>
					{icon}
				</span>
			</div>
			<span className="rounded bg-black/40 px-1.5 py-0.5 text-[8px] font-semibold tracking-wide">
				{badge}
			</span>
		</div>
	);
}
