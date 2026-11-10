"use client";

import { toast } from "sonner";
import { resolveAnimationPathValueAtTime } from "@/animation";
import {
	clearAllTransformKeyframes,
	getTransformKeyframeTimes,
	hasTransformKeyframeAtTime,
	removeTransformKeyframesAtTime,
	upsertAllTransformKeyframesAtTime,
	useAutoKeyframeEnabled,
} from "@/animation/transform-keyframes";
import { Section, SectionContent, SectionFields } from "@/components/section";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { useEditor } from "@/editor/use-editor";
import type { ParamValue, ParamValues } from "@/params";
import {
	getElementParams,
	readElementParamValue,
	writeElementParamValue,
	type ElementParamDefinition,
} from "@/params/registry";
import { buildTransformFromParams } from "@/rendering";
import type { TimelineElement } from "@/timeline";
import {
	type MediaTime,
	mediaTimeToSeconds,
	roundMediaTime,
	TICKS_PER_SECOND,
} from "@/wasm";
import { cn } from "@/utils/ui";

export function ElementParamsTab({
	element,
	trackId,
	paramKeys,
	sectionKey,
}: {
	element: TimelineElement;
	trackId: string;
	paramKeys?: readonly string[];
	sectionKey: string;
}) {
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const params = getElementParams({ element }).filter(
		(param) => !paramKeys || paramKeys.includes(param.key),
	);
	const baseValues = buildValues({ element, params });

	return (
		<Section sectionKey={`${element.id}:${sectionKey}`}>
			<SectionContent className="pt-4 space-y-3.5">
				{sectionKey === "transform" && "params" in element ? (
					<CapCutTransformKeyframeBar
						element={element}
						trackId={trackId}
						localTime={localTime}
						isPlayheadWithinElementRange={isPlayheadWithinElementRange}
					/>
				) : null}
				<SectionFields>
					{params
						.filter((param) => isVisible({ param, values: baseValues }))
						.map((param) => (
							<ElementParamField
								key={param.key}
								element={element}
								trackId={trackId}
								param={param}
								baseValue={baseValues[param.key] ?? param.default}
								localTime={localTime}
								isPlayheadWithinElementRange={isPlayheadWithinElementRange}
							/>
						))}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function CapCutTransformKeyframeBar({
	element,
	trackId,
	localTime,
	isPlayheadWithinElementRange,
}: {
	element: TimelineElement & { params: ParamValues };
	trackId: string;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}) {
	const editor = useEditor();
	const [autoKeyframe, setAutoKeyframe] = useAutoKeyframeEnabled();

	const keyframeTimes = getTransformKeyframeTimes({
		animations: element.animations,
	});
	const toleranceTicks = Math.round(TICKS_PER_SECOND / 30);
	const isAtKeyframe =
		isPlayheadWithinElementRange &&
		hasTransformKeyframeAtTime({
			animations: element.animations,
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
		const targetTimelineTime = roundMediaTime({
			time: Math.max(
				element.startTime,
				Math.min(
					element.startTime + element.duration,
					element.startTime + targetLocalTime,
				),
			),
		});
		editor.playback.seek({ time: targetTimelineTime });
	};

	const handleToggleMasterKeyframe = () => {
		if (!isPlayheadWithinElementRange) {
			seekToLocalTime(localTime);
		}
		const baseTransform = buildTransformFromParams({ params: element.params });
		if (isAtKeyframe) {
			const nextAnimations = removeTransformKeyframesAtTime({
				animations: element.animations,
				localTime,
				toleranceTicks,
			});
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: { animations: nextAnimations },
					},
				],
			});
			editor.timeline.commitPreview();
			toast.success("Keyframe de posición eliminado en este punto");
		} else {
			const nextAnimations = upsertAllTransformKeyframesAtTime({
				baseTransform,
				animations: element.animations,
				localTime,
			});
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: { animations: nextAnimations },
					},
				],
			});
			editor.timeline.commitPreview();
			const sec = mediaTimeToSeconds({ time: localTime }).toFixed(2);
			toast.success(`Posición guardada con Keyframe ◆ en ${sec}s`);
		}
	};

	const handleCenterPosition = () => {
		const centeredParams: ParamValues = {
			...element.params,
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
		};
		if (isPlayheadWithinElementRange && keyframeTimes.length > 0) {
			const nextAnimations = upsertAllTransformKeyframesAtTime({
				baseTransform: buildTransformFromParams({ params: centeredParams }),
				animations: setCenteredAtLocalTime({
					element,
					localTime,
				}),
				localTime,
			});
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						updates: {
							params: centeredParams,
							animations: nextAnimations,
						},
					},
				],
			});
			editor.timeline.commitPreview();
			toast.success("Posición centrada en este Keyframe ◆");
			return;
		}

		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { params: centeredParams },
				},
			],
		});
		editor.timeline.commitPreview();
		toast.success("Posición y escala restablecidas al centro");
	};

	const handleClearAllKeyframes = () => {
		const nextAnimations = clearAllTransformKeyframes({
			animations: element.animations,
		});
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { animations: nextAnimations },
				},
			],
		});
		editor.timeline.commitPreview();
		toast.success("Todos los keyframes de posición/escala fueron eliminados");
	};

	return (
		<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5">
					<span className="inline-block size-2.5 rotate-45 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
					<span className="text-xs font-semibold text-foreground">
						Keyframes CapCut (Posición y Zoom)
					</span>
				</div>
				<span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
					{keyframeTimes.length}{" "}
					{keyframeTimes.length === 1 ? "keyframe" : "keyframes"}
				</span>
			</div>

			<div className="flex items-center gap-1.5">
				<button
					type="button"
					disabled={prevKeyframeTime === null}
					onClick={() => {
						if (prevKeyframeTime !== null) {
							seekToLocalTime(prevKeyframeTime);
						}
					}}
					title="Ir al keyframe anterior"
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80 text-xs font-bold text-foreground transition hover:bg-accent disabled:opacity-35"
				>
					◀
				</button>

				<button
					type="button"
					onClick={handleToggleMasterKeyframe}
					className={cn(
						"flex h-8 flex-1 items-center justify-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition",
						isAtKeyframe
							? "border-amber-400 bg-amber-500/25 text-amber-200 hover:bg-amber-500/35"
							: "border-cyan-500/50 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25",
					)}
				>
					<span
						className={cn(
							"inline-block size-2.5 rotate-45 transition",
							isAtKeyframe
								? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
								: "border border-cyan-300 bg-transparent",
						)}
					/>
					{isAtKeyframe
						? "Keyframe guardado aquí (Quitar ◆)"
						: "+ Guardar Posición aquí (◆)"}
				</button>

				<button
					type="button"
					disabled={nextKeyframeTime === null}
					onClick={() => {
						if (nextKeyframeTime !== null) {
							seekToLocalTime(nextKeyframeTime);
						}
					}}
					title="Ir al siguiente keyframe"
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80 text-xs font-bold text-foreground transition hover:bg-accent disabled:opacity-35"
				>
					▶
				</button>
			</div>

			{keyframeTimes.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1 pt-0.5">
					{keyframeTimes.map((time, idx) => {
						const active = Math.abs(time - localTime) <= toleranceTicks;
						return (
							<button
								key={time}
								type="button"
								onClick={() => seekToLocalTime(time)}
								className={cn(
									"inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition",
									active
										? "bg-amber-400 text-black font-semibold shadow-sm"
										: "bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground",
								)}
								title={`Saltar al keyframe #${idx + 1}`}
							>
								<span className="inline-block size-1.5 rotate-45 bg-current" />
								{mediaTimeToSeconds({ time }).toFixed(2)}s
							</button>
						);
					})}
				</div>
			) : null}

			<div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
				<button
					type="button"
					onClick={() => setAutoKeyframe(!autoKeyframe)}
					className={cn(
						"flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition",
						autoKeyframe
							? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
							: "bg-muted/50 text-muted-foreground border border-border/50",
					)}
					title="Cuando está activo, mover o escalar el video en la vista previa guarda automáticamente un Keyframe en ese instante"
				>
					<span
						className={cn(
							"inline-block size-2 rounded-full",
							autoKeyframe ? "bg-emerald-400" : "bg-muted-foreground",
						)}
					/>
					Auto-guardar al mover: {autoKeyframe ? "SÍ" : "NO"}
				</button>

				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleCenterPosition}
						className="rounded border border-border/60 bg-background/70 px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
						title="Centrar posición (0, 0) y escala (100%)"
					>
						Centrar
					</button>
					{keyframeTimes.length > 0 ? (
						<button
							type="button"
							onClick={handleClearAllKeyframes}
							className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive transition hover:bg-destructive/20"
							title="Eliminar todos los keyframes de posición y escala de este clip"
						>
							Limpiar ◆
						</button>
					) : null}
				</div>
			</div>

			<p className="text-[10px] leading-tight text-muted-foreground">
				Tip CapCut: Mueve el cabezal en la línea de tiempo y arrastra el video
				en la pantalla (o pulsa <b>+ Guardar Posición aquí ◆</b>) para animar el
				movimiento entre dos puntos.
			</p>
		</div>
	);
}

function setCenteredAtLocalTime({
	element,
	localTime,
}: {
	element: TimelineElement & { params: ParamValues };
	localTime: MediaTime;
}) {
	const removed = removeTransformKeyframesAtTime({
		animations: element.animations,
		localTime,
	});
	return removed;
}

function ElementParamField({
	element,
	trackId,
	param,
	baseValue,
	localTime,
	isPlayheadWithinElementRange,
}: {
	element: TimelineElement;
	trackId: string;
	param: ElementParamDefinition;
	baseValue: ParamValue;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}) {
	const resolvedValue = resolveAnimationPathValueAtTime({
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		fallbackValue: baseValue,
	});
	const animatedParam = useKeyframedParamProperty({
		param,
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue,
		buildBaseUpdates: ({ value }) =>
			writeElementParamValue({ element, param, value }),
	});

	return (
		<PropertyParamField
			param={param}
			value={resolvedValue}
			onPreview={animatedParam.onPreview}
			onCommit={animatedParam.onCommit}
			keyframe={
				param.keyframable === false
					? undefined
					: {
							isActive: animatedParam.isKeyframedAtTime,
							isDisabled: !isPlayheadWithinElementRange,
							onToggle: animatedParam.toggleKeyframe,
						}
			}
		/>
	);
}

function buildValues({
	element,
	params,
}: {
	element: TimelineElement;
	params: readonly ElementParamDefinition[];
}): ParamValues {
	const values: ParamValues = {};
	for (const param of params) {
		const value = readElementParamValue({ element, param });
		if (value !== null) {
			values[param.key] = value;
		}
	}
	return values;
}

function isVisible({
	param,
	values,
}: {
	param: ElementParamDefinition;
	values: ParamValues;
}): boolean {
	return (param.dependencies ?? []).every((dependency) =>
		areParamValuesEqual({
			left: values[dependency.param],
			right: dependency.equals,
		}),
	);
}

function areParamValuesEqual({
	left,
	right,
}: {
	left: ParamValue | undefined;
	right: ParamValue;
}): boolean {
	return left === right;
}
