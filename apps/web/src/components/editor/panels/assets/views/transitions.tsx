"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TICKS_PER_SECOND, type MediaTime } from "@/wasm";
import type { TimelineTrack, VisualElement } from "@/timeline";
import {
	CUT_TRANSITION_PRESETS,
	readClipAnimationParams,
	type CutTransitionPreset,
	type TransitionCategory,
} from "@/animation/clip-animations";
import { cn } from "@/utils/ui";
import {
	Sparkles,
	Play,
	RotateCcw,
	Wand2,
	Film,
	Layers,
	CheckCircle2,
	GripVertical,
	CopyCheck,
	Ban,
} from "lucide-react";

interface TimelineCutPair {
	id: string;
	index: number;
	trackId: string;
	trackName: string;
	outElement: VisualElement;
	inElement: VisualElement;
	cutTimeSec: number;
	activePresetId: string | null;
}

const CATEGORY_TABS: Array<{
	id: Exclude<TransitionCategory, "text">;
	label: string;
	icon: string;
}> = [
	{ id: "all", label: "Todas", icon: "✦" },
	{ id: "camera", label: "Cámara & Blur", icon: "»" },
	{ id: "light", label: "Luz & Cine 35mm", icon: "🌅" },
	{ id: "mask", label: "Máscaras GL", icon: "◯" },
	{ id: "glitch", label: "Glitch & VHS", icon: "⚡" },
	{ id: "3d", label: "3D Studio", icon: "❐" },
];

export function TransitionsView() {
	const editor = useEditor();
	const sceneTracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const { selectedElements } = useElementSelection();

	const selectedTransitionCutId = useAssetsPanelStore(
		(s) => s.selectedTransitionCutId,
	);
	const setSelectedTransitionCutId = useAssetsPanelStore(
		(s) => s.setSelectedTransitionCutId,
	);
	const setDraggingTransition = useAssetsPanelStore(
		(s) => s.setDraggingTransition,
	);

	const [selectedCategory, setSelectedCategory] =
		useState<Exclude<TransitionCategory, "text">>("all");
	const [targetMode, setTargetMode] = useState<"cuts" | "clip">("cuts");
	const [clipTargetPhase, setClipTargetPhase] = useState<"both" | "in" | "out">(
		"both",
	);
	const [durationSec, setDurationSec] = useState<number>(0.5);
	const [searchQuery, setSearchQuery] = useState<string>("");

	// Discover all visual tracks and consecutive clip cuts (Clip A -> Clip B)
	const { visualElementsMap, detectedCuts, firstVisualElement } = useMemo(() => {
		const orderedTracks: Array<{ track: TimelineTrack; label: string }> = [
			...(sceneTracks.main
				? [{ track: sceneTracks.main, label: "Pista Principal" }]
				: []),
			...(sceneTracks.overlay ?? []).map((t, idx) => ({
				track: t,
				label: t.name || `Overlay ${idx + 1}`,
			})),
		];

		const elemMap = new Map<
			string,
			{ trackId: string; element: VisualElement }
		>();
		const cuts: TimelineCutPair[] = [];
		let firstElem: { trackId: string; element: VisualElement } | null = null;
		let cutCounter = 1;

		for (const { track, label } of orderedTracks) {
			if ("hidden" in track && track.hidden) continue;
			if (track.type !== "video") continue;
			const visualElems = track.elements
				.filter(
					(el): el is VisualElement =>
						(el.type === "video" || el.type === "image") &&
						el.params?.isSubtitleOverlay !== true,
				)
				.slice()
				.sort((a, b) => a.startTime - b.startTime);

			for (const el of visualElems) {
				elemMap.set(el.id, { trackId: track.id, element: el });
				if (!firstElem) {
					firstElem = { trackId: track.id, element: el };
				}
			}

			for (let i = 0; i < visualElems.length - 1; i++) {
				const outEl = visualElems[i];
				const inEl = visualElems[i + 1];
				if (!outEl || !inEl) continue;

				const outCfg = readClipAnimationParams(
					outEl.params as Record<string, unknown>,
				);
				const inCfg = readClipAnimationParams(
					inEl.params as Record<string, unknown>,
				);
				const matchedPreset = CUT_TRANSITION_PRESETS.find(
					(p) => p.outStyle === outCfg.animOut && p.inStyle === inCfg.animIn,
				);

				cuts.push({
					id: `${track.id}:${outEl.id}->${inEl.id}`,
					index: cutCounter++,
					trackId: track.id,
					trackName: label,
					outElement: outEl,
					inElement: inEl,
					cutTimeSec: inEl.startTime / TICKS_PER_SECOND,
					activePresetId: matchedPreset?.id ?? null,
				});
			}
		}

		return {
			visualElementsMap: elemMap,
			detectedCuts: cuts,
			firstVisualElement: firstElem,
		};
	}, [sceneTracks]);

	// Always default to a SINGLE cut (closest to playhead or first cut), never "all-cuts"
	const activeCut = useMemo((): TimelineCutPair | null => {
		if (detectedCuts.length === 0) return null;
		if (selectedTransitionCutId) {
			const found = detectedCuts.find((c) => c.id === selectedTransitionCutId);
			if (found) return found;
		}
		const playheadSec = editor.playback.getCurrentTime() / TICKS_PER_SECOND;
		let closest = detectedCuts[0]!;
		let bestDiff = Math.abs(closest.cutTimeSec - playheadSec);
		for (const cut of detectedCuts) {
			const diff = Math.abs(cut.cutTimeSec - playheadSec);
			if (diff < bestDiff) {
				bestDiff = diff;
				closest = cut;
			}
		}
		return closest;
	}, [detectedCuts, selectedTransitionCutId, editor.playback]);

	useEffect(() => {
		if (
			activeCut &&
			(!selectedTransitionCutId ||
				!detectedCuts.some((c) => c.id === selectedTransitionCutId))
		) {
			setSelectedTransitionCutId(activeCut.id);
		}
	}, [activeCut, selectedTransitionCutId, detectedCuts, setSelectedTransitionCutId]);

	// Sync slider duration when switching between cuts on the timeline
	useEffect(() => {
		if (!activeCut) return;
		const outCfg = readClipAnimationParams(
			activeCut.outElement.params as Record<string, unknown>,
		);
		const inCfg = readClipAnimationParams(
			activeCut.inElement.params as Record<string, unknown>,
		);
		if (outCfg.animOut !== "none" || inCfg.animIn !== "none") {
			const existingDur = Math.max(
				outCfg.animOut !== "none" ? outCfg.animOutDuration : 0,
				inCfg.animIn !== "none" ? inCfg.animInDuration : 0,
			);
			if (existingDur >= 0.1) {
				setDurationSec(Number(existingDur.toFixed(2)));
			}
		}
	}, [activeCut?.id]);

	const activeSelectedVisual = useMemo(() => {
		for (const sel of selectedElements) {
			const found = visualElementsMap.get(sel.elementId);
			if (found) return found;
		}
		return firstVisualElement;
	}, [selectedElements, visualElementsMap, firstVisualElement]);

	const filteredPresets = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return CUT_TRANSITION_PRESETS.filter((preset) => {
			if (selectedCategory !== "all" && preset.category !== selectedCategory) {
				return false;
			}
			if (!q) return true;
			return (
				preset.name.toLowerCase().includes(q) ||
				preset.description.toLowerCase().includes(q) ||
				preset.badge.toLowerCase().includes(q)
			);
		});
	}, [selectedCategory, searchQuery]);

	const previewAtTimeSec = (timeSec: number) => {
		const startSec = Math.max(0, timeSec - Math.max(0.6, durationSec + 0.25));
		editor.playback.seek({
			time: Math.round(startSec * TICKS_PER_SECOND) as MediaTime,
		});
		if (!editor.playback.getIsPlaying()) {
			editor.playback.play();
		}
	};

	const applyPresetToSingleCut = (
		cut: TimelineCutPair,
		preset: CutTransitionPreset | null,
		dur: number,
	) => {
		const outParams = {
			...((cut.outElement.params as Record<string, unknown>) ?? {}),
			animOut: preset ? preset.outStyle : "none",
			animOutDuration: dur,
		};
		const inParams = {
			...((cut.inElement.params as Record<string, unknown>) ?? {}),
			animIn: preset ? preset.inStyle : "none",
			animInDuration: dur,
		};

		editor.timeline.updateElements({
			updates: [
				{
					trackId: cut.trackId,
					elementId: cut.outElement.id,
					patch: { params: outParams } as Partial<VisualElement>,
				},
				{
					trackId: cut.trackId,
					elementId: cut.inElement.id,
					patch: { params: inParams } as Partial<VisualElement>,
				},
			],
		});
	};

	const applyDurationLive = (nextDur: number, commitHistory: boolean) => {
		const clampedDur = Math.max(0.1, Math.min(3.0, Number(nextDur.toFixed(2))));
		setDurationSec(clampedDur);

		if (targetMode === "cuts" && activeCut) {
			const outRaw =
				(activeCut.outElement.params as Record<string, unknown>) ?? {};
			const inRaw =
				(activeCut.inElement.params as Record<string, unknown>) ?? {};
			const outCfg = readClipAnimationParams(outRaw);
			const inCfg = readClipAnimationParams(inRaw);
			const fallbackPreset = CUT_TRANSITION_PRESETS[0]!;
			const hasExisting =
				outCfg.animOut !== "none" || inCfg.animIn !== "none";

			const nextOutParams = {
				...outRaw,
				animOut: hasExisting ? outCfg.animOut : fallbackPreset.outStyle,
				animOutDuration: clampedDur,
			};
			const nextInParams = {
				...inRaw,
				animIn: hasExisting ? inCfg.animIn : fallbackPreset.inStyle,
				animInDuration: clampedDur,
			};

			editor.timeline.updateElements({
				updates: [
					{
						trackId: activeCut.trackId,
						elementId: activeCut.outElement.id,
						patch: { params: nextOutParams } as Partial<VisualElement>,
					},
					{
						trackId: activeCut.trackId,
						elementId: activeCut.inElement.id,
						patch: { params: nextInParams } as Partial<VisualElement>,
					},
				],
				pushHistory: commitHistory,
			});
			return;
		}

		if (activeSelectedVisual) {
			const { trackId, element } = activeSelectedVisual;
			const rawParams = (element.params as Record<string, unknown>) ?? {};
			const cfg = readClipAnimationParams(rawParams);
			const fallbackPreset = CUT_TRANSITION_PRESETS[0]!;
			const nextParams: Record<string, unknown> = { ...rawParams };

			if (clipTargetPhase === "in" || clipTargetPhase === "both") {
				if (cfg.animIn === "none") {
					nextParams.animIn = fallbackPreset.inStyle;
				}
				nextParams.animInDuration = clampedDur;
			}
			if (clipTargetPhase === "out" || clipTargetPhase === "both") {
				if (cfg.animOut === "none") {
					nextParams.animOut = fallbackPreset.outStyle;
				}
				nextParams.animOutDuration = clampedDur;
			}

			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: { params: nextParams } as Partial<VisualElement>,
					},
				],
				pushHistory: commitHistory,
			});
		}
	};

	const handleSelectPreset = (preset: CutTransitionPreset | null) => {
		const effectiveDur = durationSec || (preset?.defaultDuration ?? 0.5);

		// In "cuts" mode, apply ONLY to the single activeCut (never all cuts!)
		if (targetMode === "cuts" && activeCut) {
			applyPresetToSingleCut(activeCut, preset, effectiveDur);
			previewAtTimeSec(activeCut.cutTimeSec);
			return;
		}

		// Otherwise apply to active selected clip (or first clip on timeline)
		if (activeSelectedVisual) {
			const { trackId, element } = activeSelectedVisual;
			const rawParams = (element.params as Record<string, unknown>) ?? {};
			const nextParams: Record<string, unknown> = { ...rawParams };

			if (clipTargetPhase === "in" || clipTargetPhase === "both") {
				nextParams.animIn = preset ? preset.inStyle : "none";
				nextParams.animInDuration = effectiveDur;
			}
			if (clipTargetPhase === "out" || clipTargetPhase === "both") {
				nextParams.animOut = preset ? preset.outStyle : "none";
				nextParams.animOutDuration = effectiveDur;
			}

			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: { params: nextParams } as Partial<VisualElement>,
					},
				],
			});

			const seekTicks =
				clipTargetPhase === "out"
					? Math.max(
							element.startTime,
							element.startTime +
								element.duration -
								Math.round((effectiveDur + 0.35) * TICKS_PER_SECOND),
						)
					: element.startTime;
			editor.playback.seek({ time: seekTicks as MediaTime });
			if (!editor.playback.getIsPlaying()) {
				editor.playback.play();
			}
		}
	};

	const handleApplyActiveToAllCuts = () => {
		if (!activeCut || detectedCuts.length === 0) return;
		const preset = CUT_TRANSITION_PRESETS.find(
			(p) => p.id === activeCut.activePresetId,
		);
		if (!preset) return;
		const effectiveDur = durationSec || preset.defaultDuration;

		const updatesByElement = new Map<
			string,
			{ trackId: string; elementId: string; params: Record<string, unknown> }
		>();

		for (const cut of detectedCuts) {
			const prevOut =
				updatesByElement.get(cut.outElement.id)?.params ??
				((cut.outElement.params as Record<string, unknown>) ?? {});
			updatesByElement.set(cut.outElement.id, {
				trackId: cut.trackId,
				elementId: cut.outElement.id,
				params: {
					...prevOut,
					animOut: preset.outStyle,
					animOutDuration: effectiveDur,
				},
			});

			const prevIn =
				updatesByElement.get(cut.inElement.id)?.params ??
				((cut.inElement.params as Record<string, unknown>) ?? {});
			updatesByElement.set(cut.inElement.id, {
				trackId: cut.trackId,
				elementId: cut.inElement.id,
				params: {
					...prevIn,
					animIn: preset.inStyle,
					animInDuration: effectiveDur,
				},
			});
		}

		editor.timeline.updateElements({
			updates: Array.from(updatesByElement.values()).map((u) => ({
				trackId: u.trackId,
				elementId: u.elementId,
				patch: { params: u.params } as Partial<VisualElement>,
			})),
		});

		previewAtTimeSec(activeCut.cutTimeSec);
	};

	const handleAutoMixPro = () => {
		const curatedOrder = [
			"whip-pan-right",
			"cross-zoom-pro",
			"light-leak-35mm",
			"camera-flash-white",
			"iris-circle-open",
			"cube-3d-rotate",
			"film-burn-vintage",
			"glitch-rgb-memories",
		];
		const presets = curatedOrder
			.map((id) => CUT_TRANSITION_PRESETS.find((p) => p.id === id))
			.filter((p): p is CutTransitionPreset => Boolean(p));

		if (detectedCuts.length > 0) {
			const updatesByElement = new Map<
				string,
				{ trackId: string; elementId: string; params: Record<string, unknown> }
			>();

			detectedCuts.forEach((cut, idx) => {
				const preset = presets[idx % presets.length]!;
				const dur = durationSec || preset.defaultDuration;

				const prevOut =
					updatesByElement.get(cut.outElement.id)?.params ??
					((cut.outElement.params as Record<string, unknown>) ?? {});
				updatesByElement.set(cut.outElement.id, {
					trackId: cut.trackId,
					elementId: cut.outElement.id,
					params: {
						...prevOut,
						animOut: preset.outStyle,
						animOutDuration: dur,
					},
				});

				const prevIn =
					updatesByElement.get(cut.inElement.id)?.params ??
					((cut.inElement.params as Record<string, unknown>) ?? {});
				updatesByElement.set(cut.inElement.id, {
					trackId: cut.trackId,
					elementId: cut.inElement.id,
					params: {
						...prevIn,
						animIn: preset.inStyle,
						animInDuration: dur,
					},
				});
			});

			editor.timeline.updateElements({
				updates: Array.from(updatesByElement.values()).map((u) => ({
					trackId: u.trackId,
					elementId: u.elementId,
					patch: { params: u.params } as Partial<VisualElement>,
				})),
			});

			previewAtTimeSec(detectedCuts[0]!.cutTimeSec);
		} else if (activeSelectedVisual) {
			const preset = presets[0]!;
			handleSelectPreset(preset);
		}
	};

	const handleClearAllTransitions = () => {
		const updates: Array<{
			trackId: string;
			elementId: string;
			patch: Partial<VisualElement>;
		}> = [];

		for (const { trackId, element } of visualElementsMap.values()) {
			const rawParams = (element.params as Record<string, unknown>) ?? {};
			updates.push({
				trackId,
				elementId: element.id,
				patch: {
					params: {
						...rawParams,
						animIn: "none",
						animOut: "none",
					},
				} as Partial<VisualElement>,
			});
		}

		if (updates.length > 0) {
			editor.timeline.updateElements({ updates });
		}
	};

	const startDraggingTransition = (
		event: React.DragEvent,
		presetId: string,
		defaultDur?: number,
	) => {
		const effectiveDur = durationSec || defaultDur || 0.5;
		event.dataTransfer.effectAllowed = "copy";
		event.dataTransfer.setData(
			"application/x-opencut-transition",
			JSON.stringify({ presetId, durationSec: effectiveDur }),
		);
		setDraggingTransition({ presetId, durationSec: effectiveDur });
	};

	return (
		<div className="flex h-full flex-col gap-2.5 overflow-y-auto p-3 text-xs">
			{/* Top Studio Banner (scrolls naturally with the panel so nothing is blocked) */}
			<div className="shrink-0 rounded-xl border border-white/10 bg-gradient-to-br from-[#0d1526] via-[#0b101b] to-[#131124] p-2.5 shadow-inner">
				<div className="flex items-center justify-between gap-2 mb-2">
					<div className="flex items-center gap-1.5">
						<Sparkles className="size-4 text-sky-400 shrink-0" />
						<div>
							<h3 className="font-bold text-white text-xs leading-tight">
								Transiciones CapCut & GL
							</h3>
							<p className="text-[10px] text-slate-400">
								Arrastra al ícono <b>[⧉]</b> entre dos clips en la línea de tiempo o haz clic
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						{activeCut?.activePresetId && detectedCuts.length > 1 && (
							<button
								type="button"
								onClick={handleApplyActiveToAllCuts}
								className="flex cursor-pointer items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-200 border border-amber-400/35 hover:bg-amber-500/30"
								title="Aplicar la transición de este corte a todos los cortes del proyecto"
							>
								<CopyCheck className="size-3 text-amber-300" />
								Aplicar a todo
							</button>
						)}
						<button
							type="button"
							onClick={handleAutoMixPro}
							className="flex cursor-pointer items-center gap-1 rounded-lg bg-gradient-to-r from-sky-500/25 to-indigo-500/25 px-2 py-1 text-[10px] font-semibold text-sky-200 border border-sky-400/35 hover:from-sky-500/35 hover:to-indigo-500/35"
							title="Mezcla variada automática en los cortes"
						>
							<Wand2 className="size-3 text-sky-300" />
							Auto-Mix
						</button>
						<button
							type="button"
							onClick={handleClearAllTransitions}
							className="flex cursor-pointer items-center justify-center rounded-lg bg-white/5 p-1 text-slate-400 hover:bg-white/10 hover:text-white"
							title="Limpiar todas las transiciones de la pista"
						>
							<RotateCcw className="size-3" />
						</button>
					</div>
				</div>

				{/* Mode Switcher: Corte Individual vs Clip Individual */}
				<div className="grid grid-cols-2 gap-1 rounded-lg bg-black/40 p-1 border border-white/5">
					<button
						type="button"
						onClick={() => setTargetMode("cuts")}
						className={cn(
							"flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1 text-[11px] font-semibold transition",
							targetMode === "cuts"
								? "bg-sky-500/25 text-sky-200 border border-sky-400/40 shadow-sm"
								: "text-slate-400 hover:text-white",
						)}
					>
						<Film className="size-3" />
						<span>
							Corte Individual{" "}
							{activeCut ? `(#${activeCut.index})` : `(${detectedCuts.length})`}
						</span>
					</button>
					<button
						type="button"
						onClick={() => setTargetMode("clip")}
						className={cn(
							"flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1 text-[11px] font-semibold transition",
							targetMode === "clip"
								? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 shadow-sm"
								: "text-slate-400 hover:text-white",
						)}
					>
						<Layers className="size-3" />
						<span>Clip Seleccionado</span>
					</button>
				</div>

				{/* Single Cut Selector (never defaults to all-cuts) */}
				{targetMode === "cuts" ? (
					detectedCuts.length > 0 ? (
						<div className="mt-2 flex flex-col gap-1">
							<div className="flex items-center justify-between text-[10px] text-slate-400">
								<span>
									Corte seleccionado:{" "}
									<b className="text-sky-300">
										{activeCut
											? `Corte #${activeCut.index} (${activeCut.cutTimeSec.toFixed(1)}s)`
											: "Ninguno"}
									</b>
								</span>
								{activeCut?.activePresetId && (
									<button
										type="button"
										onClick={() => handleSelectPreset(null)}
										className="cursor-pointer text-[10px] text-rose-300 hover:underline"
									>
										Quitar de este corte
									</button>
								)}
							</div>
							<div className="flex items-center gap-1 overflow-x-auto pb-0.5">
								{detectedCuts.map((cut) => {
									const isCurrent = activeCut?.id === cut.id;
									return (
										<button
											key={cut.id}
											type="button"
											onClick={() => {
												setSelectedTransitionCutId(cut.id);
												previewAtTimeSec(cut.cutTimeSec);
											}}
											className={cn(
												"flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border transition",
												isCurrent
													? "border-sky-400 bg-sky-500/25 text-white shadow-sm"
													: "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
											)}
										>
											<span>
												⧉ Corte #{cut.index} ({cut.cutTimeSec.toFixed(1)}s)
											</span>
											{cut.activePresetId && (
												<CheckCircle2 className="size-2.5 text-emerald-400" />
											)}
										</button>
									);
								})}
							</div>
						</div>
					) : (
						<div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
							💡 Hay 1 solo clip en la pista: arrastra la transición al clip o divide un clip con <b>Split</b> para crear un corte <b>[⧉]</b>.
						</div>
					)
				) : (
					<div className="mt-2 flex items-center justify-between gap-1">
						<span className="truncate text-[10px] text-slate-300">
							Clip:{" "}
							<b className="text-white">
								{activeSelectedVisual?.element.name ?? "Ninguno"}
							</b>
						</span>
						<div className="flex items-center gap-1">
							{(
								[
									{ id: "both", label: "In + Out" },
									{ id: "in", label: "Solo In" },
									{ id: "out", label: "Solo Out" },
								] as const
							).map((ph) => (
								<button
									key={ph.id}
									type="button"
									onClick={() => setClipTargetPhase(ph.id)}
									className={cn(
										"cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-semibold border transition",
										clipTargetPhase === ph.id
											? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
											: "border-white/10 bg-white/5 text-slate-400 hover:text-white",
									)}
								>
									{ph.label}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Duration Control + Quick Pills */}
				<div className="mt-2 pt-2 border-t border-white/10">
					<div className="flex items-center justify-between mb-1">
						<span className="text-[10px] font-semibold text-slate-300">
							Duración de la Transición (Tiempo real)
						</span>
						<div className="flex items-center gap-1">
							{[0.3, 0.45, 0.65, 1.0, 1.5].map((presetDur) => (
								<button
									key={presetDur}
									type="button"
									onClick={() => applyDurationLive(presetDur, true)}
									className={cn(
										"cursor-pointer rounded px-1.5 py-[1px] text-[9px] font-mono transition",
										Math.abs(durationSec - presetDur) < 0.03
											? "bg-sky-500/30 text-sky-200 border border-sky-400/40"
											: "bg-white/5 text-slate-400 hover:text-white",
									)}
								>
									{presetDur}s
								</button>
							))}
							<span className="ml-1 font-mono text-[10px] font-bold text-sky-300">
								{durationSec.toFixed(2)}s
							</span>
						</div>
					</div>
					<input
						type="range"
						min={0.15}
						max={2.5}
						step={0.05}
						value={durationSec}
						onChange={(e) =>
							applyDurationLive(parseFloat(e.target.value), false)
						}
						onMouseUp={(e) =>
							applyDurationLive(
								parseFloat((e.target as HTMLInputElement).value),
								true,
							)
						}
						onTouchEnd={(e) =>
							applyDurationLive(
								parseFloat((e.target as HTMLInputElement).value),
								true,
							)
						}
						className="w-full accent-sky-400 cursor-pointer h-1.5"
					/>
				</div>
			</div>

			{/* Sticky Search + Category Pills */}
			<div className="sticky top-0 z-30 flex shrink-0 flex-col gap-1.5 bg-background/95 py-1 backdrop-blur">
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Buscar transición (ej. Whip Pan, Light Leak, Flash, Cubo, Iris)..."
					className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
				/>
				<div className="flex items-center gap-1 overflow-x-auto pb-0.5">
					{CATEGORY_TABS.map((cat) => (
						<button
							key={cat.id}
							type="button"
							onClick={() => setSelectedCategory(cat.id)}
							className={cn(
								"flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold border transition",
								selectedCategory === cat.id
									? "border-sky-400 bg-sky-500/20 text-white shadow-sm"
									: "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200",
							)}
						>
							<span>{cat.icon}</span>
							<span>{cat.label}</span>
						</button>
					))}
				</div>
			</div>

			{/* Transitions Grid (Full-panel scroll, Draggable cards onto timeline cuts) */}
			<div className="grid grid-cols-2 gap-2 pb-6 content-start">
				{/* "None / Clean Cut" Card */}
				<button
					type="button"
					draggable
					onDragStart={(e) => startDraggingTransition(e, "none", 0.5)}
					onDragEnd={() => setDraggingTransition(null)}
					onClick={() => handleSelectPreset(null)}
					className={cn(
						"group flex cursor-grab active:cursor-grabbing flex-col gap-1.5 rounded-xl border p-2 text-left transition-all",
						activeCut && !activeCut.activePresetId
							? "border-slate-400 bg-slate-800/40 text-white"
							: "border-white/10 bg-[#0d1322]/90 text-slate-300 hover:border-slate-400/50 hover:bg-[#131c31]",
					)}
				>
					<div className="relative flex h-11 w-full items-center justify-between overflow-hidden rounded-lg border border-white/10 bg-slate-950/90 px-2">
						<span className="inline-flex h-6 w-7 items-center justify-center rounded-md border border-white/15 bg-slate-900 text-xs text-slate-300">
							<Ban className="size-3.5" />
						</span>
						<span className="rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold text-slate-300 border border-white/10">
							Corte Directo
						</span>
					</div>
					<div className="flex items-center justify-between gap-1">
						<span className="truncate font-bold text-[11px] text-white">
							Sin Transición
						</span>
						<GripVertical className="size-3 shrink-0 text-slate-500 group-hover:text-slate-300" />
					</div>
					<p className="line-clamp-2 text-[9.5px] text-slate-400 leading-snug">
						Corte limpio sin efecto en la unión seleccionada
					</p>
				</button>

				{filteredPresets.map((preset) => {
					const isActiveOnCut = activeCut?.activePresetId === preset.id;
					return (
						<button
							key={preset.id}
							type="button"
							draggable
							onDragStart={(e) =>
								startDraggingTransition(e, preset.id, preset.defaultDuration)
							}
							onDragEnd={() => setDraggingTransition(null)}
							onClick={() => handleSelectPreset(preset)}
							title="Arrastra esta transición al botón [⧉] entre dos clips en la línea de tiempo, o haz clic para aplicarla al corte seleccionado"
							className={cn(
								"group flex cursor-grab active:cursor-grabbing flex-col gap-1.5 rounded-xl border p-2 text-left transition-all",
								isActiveOnCut
									? "border-sky-400 bg-sky-500/15 text-white shadow-[0_0_15px_rgba(56,189,248,0.15)]"
									: "border-white/10 bg-[#0d1322]/90 text-slate-200 hover:border-sky-400/50 hover:bg-[#131c31]",
							)}
						>
							<TransitionPreviewStage preset={preset} active={isActiveOnCut} />
							<div className="flex items-center justify-between gap-1">
								<span className="truncate font-bold text-[11px] text-white">
									{preset.name}
								</span>
								<div className="flex items-center gap-1 shrink-0">
									<GripVertical className="size-3 text-slate-500 group-hover:text-sky-300 transition-colors" />
									<Play className="size-2.5 text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity fill-current" />
								</div>
							</div>
							<p className="line-clamp-2 text-[9.5px] text-slate-400 leading-snug">
								{preset.description}
							</p>
						</button>
					);
				})}
			</div>

			<style>{`
				@keyframes tr-whip-x {
					0% { transform: translateX(-100%) scaleX(1.35); filter: blur(3px); opacity: 0.2; }
					45% { transform: translateX(0%) scaleX(1); filter: blur(0px); opacity: 1; }
					80% { transform: translateX(0%) scaleX(1); opacity: 1; }
					100% { transform: translateX(100%) scaleX(1.35); filter: blur(3px); opacity: 0.2; }
				}
				@keyframes tr-cross-zoom {
					0% { transform: scale(0.45); opacity: 0.15; }
					45% { transform: scale(1); opacity: 1; }
					80% { transform: scale(1.05); opacity: 1; }
					100% { transform: scale(2.1); opacity: 0; }
				}
				@keyframes tr-spin-vortex {
					0% { transform: scale(0.35) rotate(-145deg); opacity: 0.15; }
					50% { transform: scale(1) rotate(0deg); opacity: 1; }
					100% { transform: scale(0.35) rotate(145deg); opacity: 0.15; }
				}
				@keyframes tr-light-sweep {
					0% { transform: translateX(-110%) scale(1.2); opacity: 0; }
					45% { transform: translateX(0%) scale(1.35); opacity: 0.95; }
					100% { transform: translateX(110%) scale(1.2); opacity: 0; }
				}
				@keyframes tr-flash-spike {
					0%, 100% { opacity: 0; }
					42%, 55% { opacity: 0.95; }
				}
				@keyframes tr-iris-open {
					0% { clip-path: circle(8% at 50% 50%); }
					55%, 80% { clip-path: circle(75% at 50% 50%); }
					100% { clip-path: circle(8% at 50% 50%); }
				}
				@keyframes tr-glitch-rgb {
					0%, 100% { transform: translate(0, 0); text-shadow: -2px 0 #ff0055, 2px 0 #00e5ff; }
					25% { transform: translate(-4px, 1px) scaleX(1.08); }
					50% { transform: translate(4px, -1px) skewX(8deg); }
					75% { transform: translate(-2px, 2px); }
				}
				@keyframes tr-cube-3d {
					0% { transform: perspective(180px) rotateY(75deg) translateX(30%); opacity: 0.25; }
					50%, 75% { transform: perspective(180px) rotateY(0deg) translateX(0%); opacity: 1; }
					100% { transform: perspective(180px) rotateY(-75deg) translateX(-30%); opacity: 0.25; }
				}
			`}</style>
		</div>
	);
}

function TransitionPreviewStage({
	preset,
	active,
}: {
	preset: CutTransitionPreset;
	active: boolean;
}) {
	const animStyle = useMemo((): React.CSSProperties => {
		if (preset.id.includes("whip")) {
			return { animation: "tr-whip-x 2.1s cubic-bezier(0.16,1,0.3,1) infinite" };
		}
		if (preset.id.includes("zoom")) {
			return { animation: "tr-cross-zoom 2.2s cubic-bezier(0.22,1,0.36,1) infinite" };
		}
		if (preset.id.includes("spin")) {
			return { animation: "tr-spin-vortex 2.4s cubic-bezier(0.22,1,0.36,1) infinite" };
		}
		if (
			preset.category === "mask" ||
			preset.id.includes("iris") ||
			preset.id.includes("diamond")
		) {
			return { animation: "tr-iris-open 2.2s ease-in-out infinite" };
		}
		if (preset.category === "glitch") {
			return { animation: "tr-glitch-rgb 0.9s steps(3) infinite" };
		}
		if (preset.category === "3d") {
			return { animation: "tr-cube-3d 2.3s ease-in-out infinite" };
		}
		return {};
	}, [preset]);

	const isLightLeak =
		preset.id.includes("leak") ||
		preset.id.includes("burn") ||
		preset.id.includes("flare") ||
		preset.id.includes("dreamy");
	const isFlash =
		preset.id.includes("flash") || preset.id.includes("dip");

	return (
		<div
			className={cn(
				"relative flex h-11 w-full items-center justify-between overflow-hidden rounded-lg border px-2",
				active
					? "border-sky-400/60 bg-slate-950"
					: "border-white/10 bg-slate-950/90",
			)}
		>
			{/* Outgoing / Incoming Split Backdrop */}
			<div className="pointer-events-none absolute inset-0 flex">
				<div className="h-full w-1/2 bg-gradient-to-br from-slate-800/70 to-slate-900/90 border-r border-white/10 flex items-end p-1">
					<span className="text-[7px] font-bold text-slate-400">CLIP A</span>
				</div>
				<div className="h-full w-1/2 bg-gradient-to-bl from-indigo-950/80 to-slate-900/90 flex items-end justify-end p-1">
					<span className="text-[7px] font-bold text-sky-400/80">CLIP B</span>
				</div>
			</div>

			{/* Light Leak / Film Burn / Anamorphic Overlay */}
			{isLightLeak && (
				<div
					style={{
						animation: "tr-light-sweep 2.1s ease-in-out infinite",
						background: preset.id.includes("flare")
							? "linear-gradient(90deg, transparent, rgba(56,189,248,0.85), #ffffff, rgba(99,102,241,0.85), transparent)"
							: "radial-gradient(circle, rgba(253,224,71,0.9) 0%, rgba(249,115,22,0.75) 50%, rgba(244,63,94,0.35) 80%, transparent 100%)",
					}}
					className="pointer-events-none absolute inset-0 z-10 mix-blend-screen"
				/>
			)}

			{/* Camera Flash / Dip to Black Overlay */}
			{isFlash && (
				<div
					style={{
						animation: "tr-flash-spike 1.8s ease-out infinite",
						backgroundColor: preset.id.includes("black")
							? "#020617"
							: "#fffbeb",
					}}
					className="pointer-events-none absolute inset-0 z-10"
				/>
			)}

			{/* Animated Center Transition Emblem */}
			<div className="relative z-20 flex items-center gap-1.5">
				<span
					style={{
						...animStyle,
						borderColor: `${preset.accentColor}55`,
						boxShadow: `0 0 10px ${preset.accentColor}33`,
					}}
					className="inline-flex h-6 w-7 items-center justify-center rounded-md border bg-slate-900/90 text-xs font-bold text-white"
				>
					{preset.icon}
				</span>
			</div>

			<span
				style={{
					color: preset.accentColor,
				}}
				className="relative z-20 rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold tracking-wide border border-white/10"
			>
				{preset.badge}
			</span>
		</div>
	);
}
