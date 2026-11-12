"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { formatTimecode } from "opencut-wasm";
import { invokeAction } from "@/actions";
import { getElementLocalTime } from "@/animation";
import {
	getTransformKeyframeTimes,
	hasTransformKeyframeAtTime,
	removeTransformKeyframesAtTime,
	upsertAllTransformKeyframesAtTime,
} from "@/animation/transform-keyframes";
import { buildTransformFromParams } from "@/rendering";
import { EditableTimecode } from "@/components/editable-timecode";
import { Button } from "@/components/ui/button";
import {
	FullScreenIcon,
	GridTableIcon,
	PauseIcon,
	PlayIcon,
	RepeatIcon,
	RepeatOffIcon,
} from "@hugeicons/core-free-icons";
import { UpdateProjectSettingsCommand } from "@/commands/project";
import { HugeiconsIcon } from "@hugeicons/react";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectTrigger,
	SelectContent,
	SelectItem,
	SelectSeparator,
} from "@/components/ui/select";
import { PREVIEW_ZOOM_PRESETS } from "@/preview/zoom";
import { usePreviewViewport } from "./preview-viewport";
import { GridPopover } from "./guide-popover";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuideById } from "@/guides";
import {
	mediaTimeToSeconds,
	roundMediaTime,
	TICKS_PER_SECOND,
	type MediaTime,
} from "@/wasm";
import {
	CLIP_ANIM_IN_OPTIONS,
	CLIP_ANIM_LOOP_OPTIONS,
	CLIP_ANIM_OUT_OPTIONS,
	readClipAnimationParams,
} from "@/animation/clip-animations";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { cn } from "@/utils/ui";

export function PreviewToolbar({
	onToggleFullscreen,
}: {
	onToggleFullscreen: () => void;
}) {
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const activeGuideDefinition = getGuideById(activeGuide);

	return (
		<div className="grid h-9 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
			<div className="flex min-w-0 items-center gap-2 overflow-hidden">
				<TimecodeDisplay />
				<CapCutQuickKeyframeControls />
				<SelectedClipPhaseInline />
			</div>
			<div className="justify-self-center flex items-center gap-1">
				<PlayPauseButton />
				<LoopToggleButton />
			</div>
			<div className="justify-self-end flex items-center gap-1.5">
				<FormatSelect />
				<ZoomSelect />
				<Separator orientation="vertical" className="h-4" />
				<GridPopover>
					<Button
						variant={activeGuideDefinition ? "secondary" : "text"}
						size="icon"
						title="Guías de encuadre y cuadrícula"
					>
						{activeGuideDefinition ? (
							activeGuideDefinition.renderTriggerIcon()
						) : (
							<HugeiconsIcon icon={GridTableIcon} />
						)}
					</Button>
				</GridPopover>
				<Button variant="text" size="icon" onClick={onToggleFullscreen}>
					<HugeiconsIcon icon={FullScreenIcon} />
				</Button>
			</div>
		</div>
	);
}

function CapCutQuickKeyframeControls() {
	const editor = useEditor();
	const selectedElements = useEditor((e) => e.selection.getSelectedElements());
	const selectedRef =
		selectedElements.length === 1 ? selectedElements[0] : null;
	const activeTrack = useEditor((e) =>
		selectedRef
			? e.timeline.getTrackById({ trackId: selectedRef.trackId })
			: null,
	);
	const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
		editor.playback.getCurrentTime(),
	);
	const setActiveTab = usePropertiesStore((s) => s.setActiveTab);

	useEffect(() => {
		let lastWall = 0;
		const unsubUpdate = editor.playback.onUpdate((t) => {
			const now = performance.now();
			if (now - lastWall >= 120) {
				lastWall = now;
				setCurrentTime(t);
			}
		});
		const unsubSeek = editor.playback.onSeek((t) => {
			lastWall = performance.now();
			setCurrentTime(t);
		});
		return () => {
			unsubUpdate();
			unsubSeek();
		};
	}, [editor.playback]);

	const activeElement =
		activeTrack?.elements.find((el) => el.id === selectedRef?.elementId) ??
		null;

	if (
		!activeElement ||
		!selectedRef ||
		activeElement.type === "audio" ||
		activeElement.type === "effect" ||
		!("params" in activeElement)
	) {
		return null;
	}

	const localTime = roundMediaTime({
		time: getElementLocalTime({
			timelineTime: currentTime,
			elementStartTime: activeElement.startTime,
			elementDuration: activeElement.duration,
		}),
	});
	const isInside =
		currentTime >= activeElement.startTime &&
		currentTime <= activeElement.startTime + activeElement.duration;
	const toleranceTicks = Math.round(TICKS_PER_SECOND / 30);
	const keyframeTimes = getTransformKeyframeTimes({
		animations: activeElement.animations,
	});
	const isAtKeyframe =
		isInside &&
		hasTransformKeyframeAtTime({
			animations: activeElement.animations,
			localTime,
			toleranceTicks,
		});

	const prevKeyframeTime =
		[...keyframeTimes]
			.reverse()
			.find((time) => time < localTime - toleranceTicks) ?? null;
	const nextKeyframeTime =
		keyframeTimes.find((time) => time > localTime + toleranceTicks) ?? null;

	const seekToLocalTime = (targetLocalTime: MediaTime) => {
		editor.playback.seek({
			time: roundMediaTime({ time: activeElement.startTime + targetLocalTime }),
		});
	};

	const handleToggleKeyframe = () => {
		setActiveTab({ elementType: activeElement.type, tabId: "transform" });
		if (!isInside) {
			seekToLocalTime(localTime);
		}
		const baseTransform = buildTransformFromParams({
			params: activeElement.params,
		});
		if (isAtKeyframe) {
			const nextAnimations = removeTransformKeyframesAtTime({
				animations: activeElement.animations,
				localTime,
				toleranceTicks,
			});
			editor.timeline.previewElements({
				updates: [
					{
						trackId: selectedRef.trackId,
						elementId: activeElement.id,
						updates: { animations: nextAnimations },
					},
				],
			});
			editor.timeline.commitPreview();
			toast.success("Keyframe ◆ eliminado en este punto");
		} else {
			const nextAnimations = upsertAllTransformKeyframesAtTime({
				baseTransform,
				animations: activeElement.animations,
				localTime,
			});
			editor.timeline.previewElements({
				updates: [
					{
						trackId: selectedRef.trackId,
						elementId: activeElement.id,
						updates: { animations: nextAnimations },
					},
				],
			});
			editor.timeline.commitPreview();
			const sec = mediaTimeToSeconds({ time: localTime }).toFixed(2);
			toast.success(`Posición guardada con Keyframe ◆ en ${sec}s`);
		}
	};

	return (
		<div className="flex items-center gap-0.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-1 py-0.5">
			{keyframeTimes.length > 0 ? (
				<button
					type="button"
					disabled={prevKeyframeTime === null}
					onClick={() => {
						if (prevKeyframeTime !== null) {
							seekToLocalTime(prevKeyframeTime);
						}
					}}
					className="px-1 text-[10px] font-bold text-amber-300 transition hover:text-amber-100 disabled:opacity-30"
					title="Keyframe anterior"
				>
					◀
				</button>
			) : null}
			<button
				type="button"
				onClick={handleToggleKeyframe}
				className={cn(
					"flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition",
					isAtKeyframe
						? "bg-amber-400 text-black shadow-sm"
						: "text-amber-200 hover:bg-amber-500/25",
				)}
				title="Guardar o quitar Keyframe de Posición/Zoom en este fotograma (estilo CapCut)"
			>
				<span
					className={cn(
						"inline-block size-2 rotate-45",
						isAtKeyframe ? "bg-black" : "bg-amber-400",
					)}
				/>
				<span>
					{isAtKeyframe
						? "◆ Keyframe"
						: keyframeTimes.length > 0
							? `+ Keyframe (${keyframeTimes.length})`
							: "+ Keyframe"}
				</span>
			</button>
			{keyframeTimes.length > 0 ? (
				<button
					type="button"
					disabled={nextKeyframeTime === null}
					onClick={() => {
						if (nextKeyframeTime !== null) {
							seekToLocalTime(nextKeyframeTime);
						}
					}}
					className="px-1 text-[10px] font-bold text-amber-300 transition hover:text-amber-100 disabled:opacity-30"
					title="Siguiente keyframe"
				>
					▶
				</button>
			) : null}
		</div>
	);
}

function SelectedClipPhaseInline() {
	const editor = useEditor();
	const selectedElements = useEditor((e) => e.selection.getSelectedElements());
	const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
		editor.playback.getCurrentTime(),
	);
	const setActiveTab = usePropertiesStore((s) => s.setActiveTab);

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

	const selectedRef =
		selectedElements.length === 1 ? selectedElements[0] : null;
	const activeTrack = selectedRef
		? editor.timeline.getTrackById({ trackId: selectedRef.trackId })
		: null;
	const activeElement =
		activeTrack?.elements.find((el) => el.id === selectedRef?.elementId) ??
		null;

	if (
		!activeElement ||
		activeElement.type === "audio" ||
		activeElement.type === "effect"
	) {
		return null;
	}

	const rawParams =
		"params" in activeElement && activeElement.params
			? (activeElement.params as Record<string, unknown>)
			: undefined;
	const cfg = readClipAnimationParams(rawParams);

	const hasIn = cfg.animIn !== "none";
	const hasLoop = cfg.animLoop !== "none";
	const hasOut = cfg.animOut !== "none";
	if (!hasIn && !hasLoop && !hasOut) {
		return null;
	}

	const durationSec = Math.max(0.2, activeElement.duration / TICKS_PER_SECOND);
	const localSec = (currentTime - activeElement.startTime) / TICKS_PER_SECOND;
	const isInside = localSec >= -0.02 && localSec <= durationSec + 0.02;
	const clampedSec = Math.max(0, Math.min(durationSec, localSec));

	const inDur = hasIn ? Math.min(cfg.animInDuration, durationSec * 0.85) : 0;
	const outDur = hasOut
		? Math.min(cfg.animOutDuration, Math.max(0.08, durationSec - inDur * 0.5))
		: 0;

	let currentPhase: "in" | "loop" | "out" | "outside" = "outside";
	if (isInside) {
		if (hasIn && clampedSec <= inDur && inDur > 0.01) {
			currentPhase = "in";
		} else if (hasOut && clampedSec >= durationSec - outDur && outDur > 0.01) {
			currentPhase = "out";
		} else {
			currentPhase = "loop";
		}
	}

	const jumpToPhase = (phase: "in" | "loop" | "out") => {
		setActiveTab({ elementType: activeElement.type, tabId: "animation" });
		let offsetSec = durationSec * 0.5;
		if (phase === "in") {
			offsetSec = Math.min(durationSec * 0.35, Math.max(0.15, inDur * 0.45));
		} else if (phase === "out") {
			offsetSec = Math.max(0.05, durationSec - Math.max(0.2, outDur * 0.5));
		}
		editor.playback.seek({
			time: roundMediaTime({
				time: activeElement.startTime + offsetSec * TICKS_PER_SECOND,
			}),
		});
	};

	return (
		<div className="hidden lg:flex items-center gap-1 truncate text-[10px]">
			{hasIn && (
				<button
					type="button"
					onClick={() => jumpToPhase("in")}
					className={cn(
						"cursor-pointer rounded px-1.5 py-0.5 font-semibold transition",
						currentPhase === "in"
							? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/60"
							: "bg-emerald-500/10 text-emerald-700/75 dark:text-emerald-300/75 hover:bg-emerald-500/20",
					)}
					title={`Fase 1 Entrada (${inDur.toFixed(1)}s)`}
				>
					▶ In
				</button>
			)}
			{hasLoop && (
				<button
					type="button"
					onClick={() => jumpToPhase("loop")}
					className={cn(
						"cursor-pointer rounded px-1.5 py-0.5 font-semibold transition",
						currentPhase === "loop"
							? "bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/60"
							: "bg-indigo-500/10 text-indigo-700/75 dark:text-indigo-300/75 hover:bg-indigo-500/20",
					)}
					title="Fase 2 Bucle Central"
				>
					↻ Bucle
				</button>
			)}
			{hasOut && (
				<button
					type="button"
					onClick={() => jumpToPhase("out")}
					className={cn(
						"cursor-pointer rounded px-1.5 py-0.5 font-semibold transition",
						currentPhase === "out"
							? "bg-rose-500/25 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/60"
							: "bg-rose-500/10 text-rose-700/75 dark:text-rose-300/75 hover:bg-rose-500/20",
					)}
					title={`Fase 3 Salida (${outDur.toFixed(1)}s)`}
				>
					Out ◀
				</button>
			)}
		</div>
	);
}

function TimecodeDisplay() {
	const editor = useEditor();
	const totalDuration = useEditor((e) => e.timeline.getTotalDuration());
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
		editor.playback.getCurrentTime(),
	);

	useEffect(() => {
		let lastUpdateWall = 0;
		const unsubscribeUpdate = editor.playback.onUpdate((time) => {
			const now = performance.now();
			if (now - lastUpdateWall >= 120) {
				lastUpdateWall = now;
				setCurrentTime(time);
			}
		});
		const unsubscribeSeek = editor.playback.onSeek((time) => {
			lastUpdateWall = performance.now();
			setCurrentTime(time);
		});
		const unsubscribePlayback = editor.playback.subscribe(() => {
			if (!editor.playback.getIsPlaying()) {
				setCurrentTime(editor.playback.getCurrentTime());
			}
		});
		return () => {
			unsubscribeUpdate();
			unsubscribeSeek();
			unsubscribePlayback();
		};
	}, [editor.playback]);

	return (
		<div className="flex items-center">
			<EditableTimecode
				time={currentTime}
				duration={totalDuration}
				format="HH:MM:SS:FF"
				fps={fps}
				onTimeChange={({ time }) => editor.playback.seek({ time })}
				className="text-center"
			/>
			<span className="text-muted-foreground px-2 font-mono text-xs">/</span>
			<span className="text-muted-foreground font-mono text-xs">
				{formatTimecode({
					time: totalDuration,
					format: "HH:MM:SS:FF",
					rate: fps,
				})}
			</span>
		</div>
	);
}

const FORMAT_PRESETS = [
	{ id: "16:9", label: "16:9 Horizontal", width: 1920, height: 1080 },
	{ id: "9:16", label: "9:16 Vertical", width: 1080, height: 1920 },
	{ id: "1:1", label: "1:1 Cuadrado", width: 1080, height: 1080 },
	{ id: "4:3", label: "4:3 Clásico", width: 1440, height: 1080 },
] as const;

function FormatSelect() {
	const editor = useEditor();
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	const canvasFitMode = useEditor(
		(e) => e.project.getActive().settings.canvasFitMode ?? "contain",
	);
	const { fitToScreen } = usePreviewViewport();

	const ratio =
		canvasSize.height > 0 ? canvasSize.width / canvasSize.height : 16 / 9;
	let currentId = "custom";
	let displayLabel = `${canvasSize.width}×${canvasSize.height}`;
	if (Math.abs(ratio - 16 / 9) < 0.05) {
		currentId = "16:9";
		displayLabel = "16:9";
	} else if (Math.abs(ratio - 9 / 16) < 0.05) {
		currentId = "9:16";
		displayLabel = "9:16";
	} else if (Math.abs(ratio - 1) < 0.05) {
		currentId = "1:1";
		displayLabel = "1:1";
	} else if (Math.abs(ratio - 4 / 3) < 0.05) {
		currentId = "4:3";
		displayLabel = "4:3";
	}

	const onValueChange = (value: string) => {
		if (value === "auto") {
			const activeScene = editor.scenes.getActiveSceneOrNull();
			const assets = editor.media.getAssets();
			const visualElements = activeScene
				? [
						...activeScene.tracks.overlay.flatMap(
							(t) => t.elements as Array<{ type: string; mediaId?: string }>,
						),
						...(activeScene.tracks.main.elements as Array<{
							type: string;
							mediaId?: string;
						}>),
					].filter((el) => el.type === "video" || el.type === "image")
				: [];
			const videoEls = visualElements.filter((el) => el.type === "video");
			const firstVisual = videoEls[0] ?? visualElements[0];
			const firstAsset = firstVisual?.mediaId
				? assets.find((a) => a.id === firstVisual.mediaId)
				: assets.find(
						(a) =>
							(a.type === "video" || a.type === "image") && a.width && a.height,
					);

			if (firstAsset?.width && firstAsset?.height) {
				const nextSize = { width: firstAsset.width, height: firstAsset.height };
				editor.project.updateSettings({
					settings: {
						canvasSize: nextSize,
						originalCanvasSize: nextSize,
						canvasSizeMode: "preset",
						userSelectedFormat: false,
					},
					pushHistory: true,
				});
				void editor.project.saveCurrentProject();
				requestAnimationFrame(() => fitToScreen());
			}
			return;
		}

		const preset = FORMAT_PRESETS.find((p) => p.id === value);
		if (!preset) return;
		editor.project.updateSettings({
			settings: {
				canvasSize: { width: preset.width, height: preset.height },
				canvasSizeMode: "preset",
				userSelectedFormat: true,
			},
			pushHistory: true,
		});
		void editor.project.saveCurrentProject();
		requestAnimationFrame(() => fitToScreen());
	};

	const toggleFitMode = () => {
		const nextMode = canvasFitMode === "cover" ? "contain" : "cover";
		editor.project.updateSettings({
			settings: { canvasFitMode: nextMode },
			pushHistory: true,
		});
		void editor.project.saveCurrentProject();
	};

	return (
		<div className="flex items-center gap-1">
			<Select value={currentId} onValueChange={onValueChange}>
				<SelectTrigger
					className="tabular-nums"
					title={`Formato del lienzo (${canvasSize.width}×${canvasSize.height})`}
				>
					{displayLabel}
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="auto">Auto (Según video)</SelectItem>
					<SelectSeparator />
					{FORMAT_PRESETS.map((preset) => (
						<SelectItem key={preset.id} value={preset.id}>
							{preset.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				variant={canvasFitMode === "cover" ? "secondary" : "text"}
				size="sm"
				className="h-7 px-2 text-[11px]"
				onClick={toggleFitMode}
				title={
					canvasFitMode === "cover"
						? "Modo Rellenar (Cover): llena todo el lienzo sin bordes negros"
						: "Modo Ajustar (Contain): muestra el video entero dentro del lienzo"
				}
			>
				{canvasFitMode === "cover" ? "Rellenar" : "Ajustar"}
			</Button>
		</div>
	);
}

function ZoomSelect() {
	const { isAtFit, zoomPercent, fitToScreen, setViewportPercent } =
		usePreviewViewport();

	const displayLabel = isAtFit ? "Fit" : `${zoomPercent}%`;

	const onValueChange = (value: string) => {
		if (value === "fit") {
			fitToScreen();
		} else {
			setViewportPercent({ percent: Number(value) });
		}
	};

	return (
		<Select
			value={isAtFit ? "fit" : String(zoomPercent)}
			onValueChange={onValueChange}
		>
			<SelectTrigger className="tabular-nums">{displayLabel}</SelectTrigger>
			<SelectContent>
				<SelectItem value="fit">Fit</SelectItem>
				<SelectSeparator />
				{PREVIEW_ZOOM_PRESETS.map((preset) => (
					<SelectItem key={preset} value={String(preset)}>
						{preset}%
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function PlayPauseButton() {
	const isPlaying = useEditor((e) => e.playback.getIsPlaying());

	return (
		<Button
			aria-label={isPlaying ? "Pausar" : "Reproducir"}
			variant="text"
			size="icon"
			onClick={() => invokeAction("toggle-play")}
		>
			<HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
		</Button>
	);
}

function LoopToggleButton() {
	const loop = useEditor((e) => e.project.getActive()?.settings.loop === true);

	return (
		<Button
			type="button"
			variant={loop ? "secondary" : "text"}
			size="icon"
			aria-pressed={loop}
			aria-label={loop ? "Disable loop playback" : "Enable loop playback"}
			title={loop ? "Loop is on" : "Loop is off"}
			onClick={() => {
				new UpdateProjectSettingsCommand({ loop: !loop }).execute();
			}}
		>
			<HugeiconsIcon icon={loop ? RepeatIcon : RepeatOffIcon} />
		</Button>
	);
}
