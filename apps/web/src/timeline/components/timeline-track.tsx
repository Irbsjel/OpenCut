"use client";

import { useMemo, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TimelineElement } from "./timeline-element";
import {
	findTrackInSceneTracks,
	getTimelinePixelsPerSecond,
	timelineTimeToPixels,
	timelineTimeToSnappedPixels,
	type TimelineTrack,
	type TimelineElement as TimelineElementType,
	type VisualElement,
	type ElementDragView,
} from "@/timeline";
import {
	CUT_TRANSITION_PRESETS,
	readClipAnimationParams,
	type CutTransitionPreset,
} from "@/animation/clip-animations";
import { TICKS_PER_SECOND, type MediaTime } from "@/wasm";
import { TIMELINE_LAYERS } from "./layers";
import { cn } from "@/utils/ui";

interface TrackCutJunction {
	id: string;
	index: number;
	outElement: VisualElement;
	inElement: VisualElement;
	cutTime: MediaTime;
	leftPx: number;
	activePreset: CutTransitionPreset | null;
	hasAnyTransition: boolean;
	durationSec: number;
}

interface TimelineTrackContentProps {
	track: TimelineTrack;
	zoomLevel: number;
	dragView: ElementDragView;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onTrackMouseDown?: (event: React.MouseEvent) => void;
	onTrackMouseUp?: (event: React.MouseEvent) => void;
	shouldIgnoreClick?: () => boolean;
	targetElementId?: string | null;
}

export function TimelineTrackContent({
	track,
	zoomLevel,
	dragView,
	onResizeStart,
	onElementMouseDown,
	onElementClick,
	onTrackMouseDown,
	onTrackMouseUp,
	shouldIgnoreClick,
	targetElementId = null,
}: TimelineTrackContentProps) {
	const editor = useEditor();
	const previewTracks = useEditor((e) => e.timeline.getPreviewTracks());
	const { isElementSelected } = useElementSelection();
	const selectedTransitionCutId = useAssetsPanelStore(
		(s) => s.selectedTransitionCutId,
	);
	const openTransitionForCut = useAssetsPanelStore(
		(s) => s.openTransitionForCut,
	);
	const draggingTransition = useAssetsPanelStore((s) => s.draggingTransition);
	const setDraggingTransition = useAssetsPanelStore(
		(s) => s.setDraggingTransition,
	);
	const [hoveredCutId, setHoveredCutId] = useState<string | null>(null);

	const liveElements = useMemo(() => {
		if (!previewTracks) return track.elements;
		return (
			findTrackInSceneTracks({ tracks: previewTracks, trackId: track.id })
				?.elements ?? track.elements
		);
	}, [previewTracks, track.elements, track.id]);

	const { visualElements, cutJunctions } = useMemo(() => {
		// Only render CapCut-style video cut transition badges on video tracks (never on subtitle/text tracks)
		if (track.type !== "video") {
			return { visualElements: [] as VisualElement[], cutJunctions: [] as TrackCutJunction[] };
		}
		const visuals = liveElements
			.filter(
				(el): el is VisualElement =>
					(el.type === "video" || el.type === "image") &&
					el.params?.isSubtitleOverlay !== true,
			)
			.slice()
			.sort((a, b) => a.startTime - b.startTime);

		const cuts: TrackCutJunction[] = [];
		for (let i = 0; i < visuals.length - 1; i++) {
			const outEl = visuals[i];
			const inEl = visuals[i + 1];
			if (!outEl || !inEl) continue;

			const outCfg = readClipAnimationParams(
				outEl.params as Record<string, unknown>,
			);
			const inCfg = readClipAnimationParams(
				inEl.params as Record<string, unknown>,
			);
			const matchedPreset =
				CUT_TRANSITION_PRESETS.find(
					(p) => p.outStyle === outCfg.animOut && p.inStyle === inCfg.animIn,
				) ?? null;
			const hasAnyTransition =
				outCfg.animOut !== "none" || inCfg.animIn !== "none";
			const durationSec = Math.max(
				0.1,
				matchedPreset
					? Math.max(outCfg.animOutDuration, inCfg.animInDuration)
					: outCfg.animOut !== "none"
						? outCfg.animOutDuration
						: inCfg.animInDuration,
			);

			cuts.push({
				id: `${track.id}:${outEl.id}->${inEl.id}`,
				index: i + 1,
				outElement: outEl,
				inElement: inEl,
				cutTime: inEl.startTime,
				leftPx: timelineTimeToSnappedPixels({
					time: inEl.startTime,
					zoomLevel,
				}),
				activePreset: matchedPreset,
				hasAnyTransition,
				durationSec,
			});
		}

		return { visualElements: visuals, cutJunctions: cuts };
	}, [liveElements, track.id, zoomLevel]);

	const applyTransitionToCut = (
		cut: TrackCutJunction,
		presetId: string,
		durationSec: number,
	) => {
		const preset = CUT_TRANSITION_PRESETS.find((p) => p.id === presetId);
		if (!preset && presetId !== "none") return;

		const effectiveDur =
			durationSec > 0 ? durationSec : (preset?.defaultDuration ?? 0.5);
		const outParams = {
			...((cut.outElement.params as Record<string, unknown>) ?? {}),
			animOut: preset ? preset.outStyle : "none",
			animOutDuration: effectiveDur,
		};
		const inParams = {
			...((cut.inElement.params as Record<string, unknown>) ?? {}),
			animIn: preset ? preset.inStyle : "none",
			animInDuration: effectiveDur,
		};

		editor.timeline.updateElements({
			updates: [
				{
					trackId: track.id,
					elementId: cut.outElement.id,
					patch: { params: outParams } as Partial<VisualElement>,
				},
				{
					trackId: track.id,
					elementId: cut.inElement.id,
					patch: { params: inParams } as Partial<VisualElement>,
				},
			],
		});

		openTransitionForCut(cut.id);
		const startSec = Math.max(
			0,
			cut.cutTime / TICKS_PER_SECOND - Math.max(0.55, effectiveDur + 0.2),
		);
		editor.playback.seek({
			time: Math.round(startSec * TICKS_PER_SECOND) as MediaTime,
		});
		if (!editor.playback.getIsPlaying()) {
			editor.playback.play();
		}
	};

	const parseTransitionDragPayload = (
		e: React.DragEvent,
	): { presetId: string; durationSec: number } | null => {
		try {
			const raw = e.dataTransfer.getData("application/x-opencut-transition");
			if (raw) {
				const parsed = JSON.parse(raw) as {
					presetId?: string;
					durationSec?: number;
				};
				if (parsed.presetId) {
					return {
						presetId: parsed.presetId,
						durationSec:
							typeof parsed.durationSec === "number" ? parsed.durationSec : 0.5,
					};
				}
			}
		} catch {
			// Fallback to store state
		}
		return draggingTransition;
	};

	const findClosestCutJunction = (
		clientX: number,
		containerEl: HTMLElement,
	): TrackCutJunction | null => {
		if (cutJunctions.length === 0) return null;
		const rect = containerEl.getBoundingClientRect();
		const relX = clientX - rect.left;
		let best: TrackCutJunction | null = null;
		let bestDist = Number.POSITIVE_INFINITY;
		for (const cut of cutJunctions) {
			const dist = Math.abs(cut.leftPx - relX);
			if (dist < bestDist) {
				bestDist = dist;
				best = cut;
			}
		}
		return best;
	};

	return (
		<div className="relative size-full">
			<button
				type="button"
				className="absolute inset-0 m-0 size-full appearance-none border-0 bg-transparent p-0"
				aria-label={`Select ${track.name} track`}
				onMouseUp={(event) => {
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			/>
			{/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- spatial gesture surface; the wrapping <button> handles keyboard track selection, this <div> only forwards background clicks for box-select / deselect. */}
			<div
				className="relative h-full min-w-full"
				style={{ zIndex: TIMELINE_LAYERS.trackContent }}
				onMouseUp={(event) => {
					if (event.target !== event.currentTarget) return;
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
				onDragOver={(event) => {
					const isTransitionDrag =
						Boolean(draggingTransition) ||
						event.dataTransfer.types.includes(
							"application/x-opencut-transition",
						);
					if (!isTransitionDrag) return;
					event.preventDefault();
					event.stopPropagation();
					event.dataTransfer.dropEffect = "copy";
					const closest = findClosestCutJunction(
						event.clientX,
						event.currentTarget,
					);
					if (closest && hoveredCutId !== closest.id) {
						setHoveredCutId(closest.id);
					}
				}}
				onDragLeave={(event) => {
					if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
						return;
					}
					setHoveredCutId(null);
				}}
				onDrop={(event) => {
					const payload = parseTransitionDragPayload(event);
					if (!payload) return;
					event.preventDefault();
					event.stopPropagation();
					setHoveredCutId(null);
					setDraggingTransition(null);

					const targetCut = findClosestCutJunction(
						event.clientX,
						event.currentTarget,
					);
					if (targetCut) {
						applyTransitionToCut(
							targetCut,
							payload.presetId,
							payload.durationSec,
						);
						return;
					}

					// Single-clip track fallback: apply to the single visual clip
					if (visualElements.length === 1) {
						const onlyClip = visualElements[0]!;
						const preset = CUT_TRANSITION_PRESETS.find(
							(p) => p.id === payload.presetId,
						);
						if (!preset && payload.presetId !== "none") return;
						const nextParams = {
							...((onlyClip.params as Record<string, unknown>) ?? {}),
							animIn: preset ? preset.inStyle : "none",
							animInDuration: payload.durationSec,
							animOut: preset ? preset.outStyle : "none",
							animOutDuration: payload.durationSec,
						};
						editor.timeline.updateElements({
							updates: [
								{
									trackId: track.id,
									elementId: onlyClip.id,
									patch: { params: nextParams } as Partial<VisualElement>,
								},
							],
						});
						editor.playback.seek({ time: onlyClip.startTime });
						if (!editor.playback.getIsPlaying()) {
							editor.playback.play();
						}
					}
				}}
			>
				{track.elements.length === 0 ? (
					<div className="text-muted-foreground border-muted/30 pointer-events-none flex size-full items-center justify-center rounded-sm border-2 border-dashed text-xs" />
				) : (
					track.elements.map((element) => {
						const isSelected = isElementSelected({
							trackId: track.id,
							elementId: element.id,
						});

						return (
							<TimelineElement
								key={element.id}
								element={element}
								track={track}
								zoomLevel={zoomLevel}
								isSelected={isSelected}
								onResizeStart={({ event, element, side }) =>
									onResizeStart({ event, element, track, side })
								}
								onElementMouseDown={({ event, element }) =>
									onElementMouseDown({ event, element, track })
								}
								onElementClick={({ event, element }) =>
									onElementClick({ event, element, track })
								}
								dragView={dragView}
								isDropTarget={element.id === targetElementId}
							/>
						);
					})
				)}

				{/* CapCut-Style Cut Junction Badges [ ⧉ ] Between Consecutive Clips */}
				{cutJunctions.map((cut) => {
					const isSelectedCut = selectedTransitionCutId === cut.id;
					const isDropHover = hoveredCutId === cut.id;
					const spanWidthPx = Math.max(
						22,
						timelineTimeToPixels({
							time: Math.round(
								cut.durationSec * 2 * TICKS_PER_SECOND,
							) as MediaTime,
							zoomLevel,
						}),
					);
					const preset = cut.activePreset;

					const startDragResizeTransition = (
						event: React.MouseEvent,
						side: "left" | "right",
					) => {
						event.preventDefault();
						event.stopPropagation();
						openTransitionForCut(cut.id);

						const startX = event.clientX;
						const startDur = cut.durationSec;
						const pxPerSec = Math.max(
							10,
							getTimelinePixelsPerSecond({ zoomLevel }),
						);
						const outRaw =
							(cut.outElement.params as Record<string, unknown>) ?? {};
						const inRaw =
							(cut.inElement.params as Record<string, unknown>) ?? {};
						const outCfg = readClipAnimationParams(outRaw);
						const inCfg = readClipAnimationParams(inRaw);
						const fallbackPreset = CUT_TRANSITION_PRESETS[0]!;
						const hasExisting =
							outCfg.animOut !== "none" || inCfg.animIn !== "none";

						const applyDelta = (clientX: number, commitHistory: boolean) => {
							const deltaPx =
								side === "right" ? clientX - startX : startX - clientX;
							const nextDur = Math.max(
								0.1,
								Math.min(
									3.0,
									Number((startDur + deltaPx / pxPerSec).toFixed(2)),
								),
							);
							editor.timeline.updateElements({
								updates: [
									{
										trackId: track.id,
										elementId: cut.outElement.id,
										patch: {
											params: {
												...outRaw,
												animOut: hasExisting
													? outCfg.animOut
													: fallbackPreset.outStyle,
												animOutDuration: nextDur,
											},
										} as Partial<VisualElement>,
									},
									{
										trackId: track.id,
										elementId: cut.inElement.id,
										patch: {
											params: {
												...inRaw,
												animIn: hasExisting
													? inCfg.animIn
													: fallbackPreset.inStyle,
												animInDuration: nextDur,
											},
										} as Partial<VisualElement>,
									},
								],
								pushHistory: commitHistory,
							});
						};

						const onMove = (moveEvent: MouseEvent) => {
							applyDelta(moveEvent.clientX, false);
						};
						const onUp = (upEvent: MouseEvent) => {
							window.removeEventListener("mousemove", onMove);
							window.removeEventListener("mouseup", onUp);
							applyDelta(upEvent.clientX, true);
						};
						window.addEventListener("mousemove", onMove);
						window.addEventListener("mouseup", onUp);
					};

					return (
						<div
							key={cut.id}
							style={{
								left: `${cut.leftPx}px`,
								zIndex: TIMELINE_LAYERS.dragLine + 5,
							}}
							className="pointer-events-none absolute inset-y-0 -translate-x-1/2 flex items-center justify-center"
						>
							{/* Visual transition duration span bar across the cut seam (0ms real-time width + CapCut drag handles) */}
							{(cut.hasAnyTransition || isDropHover || draggingTransition) && (
								<div
									style={{
										width: `${spanWidthPx}px`,
										borderColor: isDropHover
											? "#38bdf8"
											: (preset?.accentColor ?? "rgba(56,189,248,0.75)"),
										background: isDropHover
											? "linear-gradient(90deg, rgba(56,189,248,0.42), rgba(99,102,241,0.42))"
											: cut.hasAnyTransition
												? "linear-gradient(90deg, rgba(14,165,233,0.28), rgba(168,85,247,0.28))"
												: "rgba(56,189,248,0.14)",
									}}
									className={cn(
										"pointer-events-none absolute h-[82%] rounded-md border-2 border-dashed",
										isDropHover && "scale-y-105 shadow-[0_0_14px_rgba(56,189,248,0.5)]",
									)}
								>
									{/* Left & Right interactive handles to expand/shrink transition duration directly on timeline */}
									<div
										role="separator"
										aria-label="Expandir inicio de transición"
										title="Arrastra para expandir o reducir la duración de la transición"
										onMouseDown={(e) => startDragResizeTransition(e, "left")}
										className="pointer-events-auto absolute inset-y-0 -left-1.5 w-3 cursor-ew-resize rounded-l bg-sky-400/30 hover:bg-sky-400/80"
									/>
									<div
										role="separator"
										aria-label="Expandir fin de transición"
										title="Arrastra para expandir o reducir la duración de la transición"
										onMouseDown={(e) => startDragResizeTransition(e, "right")}
										className="pointer-events-auto absolute inset-y-0 -right-1.5 w-3 cursor-ew-resize rounded-r bg-sky-400/30 hover:bg-sky-400/80"
									/>
								</div>
							)}

							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									if (event.shiftKey && cut.hasAnyTransition) {
										applyTransitionToCut(cut, "none", 0.5);
										return;
									}
									openTransitionForCut(cut.id);
									const seekSec = Math.max(
										0,
										cut.cutTime / TICKS_PER_SECOND - 0.5,
									);
									editor.playback.seek({
										time: Math.round(seekSec * TICKS_PER_SECOND) as MediaTime,
									});
								}}
								onContextMenu={(event) => {
									if (!cut.hasAnyTransition) return;
									event.preventDefault();
									event.stopPropagation();
									applyTransitionToCut(cut, "none", 0.5);
								}}
								onDragOver={(event) => {
									event.preventDefault();
									event.stopPropagation();
									event.dataTransfer.dropEffect = "copy";
									if (hoveredCutId !== cut.id) {
										setHoveredCutId(cut.id);
									}
								}}
								onDrop={(event) => {
									const payload = parseTransitionDragPayload(event);
									if (!payload) return;
									event.preventDefault();
									event.stopPropagation();
									setHoveredCutId(null);
									setDraggingTransition(null);
									applyTransitionToCut(
										cut,
										payload.presetId,
										payload.durationSec,
									);
								}}
								title={
									preset
										? `Corte #${cut.index}: ${preset.name} (${cut.durationSec.toFixed(2)}s) — Arrastra los bordes en la línea de tiempo para expandir duración, Clic para cambiar, Clic derecho para quitar`
										: `Corte #${cut.index} (${(cut.cutTime / TICKS_PER_SECOND).toFixed(1)}s) — Clic o arrastra aquí una transición estilo CapCut`
								}
								className={cn(
									"pointer-events-auto relative flex items-center justify-center gap-0.5 rounded-md border font-bold transition-colors cursor-pointer select-none shadow-md",
									isDropHover
										? "h-7 min-w-7 px-1.5 scale-125 border-sky-300 bg-sky-500 text-slate-950 shadow-[0_0_16px_#38bdf8]"
										: draggingTransition
											? "h-6 min-w-6 px-1 scale-110 border-amber-300 bg-amber-500/90 text-slate-950 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.7)]"
											: preset || cut.hasAnyTransition
												? "h-5 min-w-5 px-1.5 border-sky-400/90 bg-slate-900/95 text-sky-300 hover:border-sky-300"
												: isSelectedCut
													? "h-5 min-w-5 px-1 border-sky-400 bg-sky-950/95 text-sky-200 ring-2 ring-sky-400/50"
													: "h-4.5 min-w-4.5 px-0.5 border-white/30 bg-slate-900/85 text-slate-300 opacity-85 hover:opacity-100 hover:scale-110 hover:border-sky-400 hover:text-white",
								)}
							>
								<span className="text-[10px] leading-none">
									{isDropHover
										? "＋"
										: preset
											? preset.icon
											: cut.hasAnyTransition
												? "✦"
												: "⧉"}
								</span>
								{cut.hasAnyTransition && !isDropHover && (
									<span className="font-mono text-[8px] font-semibold leading-none text-sky-200">
										{cut.durationSec.toFixed(2)}s
									</span>
								)}
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
