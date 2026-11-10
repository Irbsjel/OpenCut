import { mediaTimeToSeconds, roundMediaTime, TICKS_PER_SECOND } from "@/wasm";
import { getElementLocalTime } from "@/animation";
import { resolveEffectParamsAtTime } from "@/animation/effect-param-channel";
import {
	buildGaussianBlurPasses,
	intensityToSigma,
} from "@/effects/definitions/blur";
import { effectsRegistry, resolveEffectPasses } from "@/effects";
import type { Effect, EffectPass } from "@/effects/types";
import { getSourceTimeAtClipTime } from "@/retime";
import {
	DEFAULT_GRAPHIC_SOURCE_SIZE,
	resolveGraphicElementParamsAtTime,
} from "@/graphics";
import {
	buildTextBackgroundFromElement,
	getTextMeasurementContext,
	measureTextElement,
} from "@/text/measure-element";
import { resolveColorAtTime, resolveOpacityAtTime } from "@/animation/values";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { videoCache } from "@/services/video-cache/service";
import type { CanvasRenderer } from "./canvas-renderer";
import type { AnyBaseNode } from "./nodes/base-node";
import {
	BlurBackgroundNode,
	type BackdropSource,
	type ResolvedBlurBackgroundNodeState,
} from "./nodes/blur-background-node";
import {
	EffectLayerNode,
	type ResolvedEffectLayerNodeState,
} from "./nodes/effect-layer-node";
import {
	GraphicNode,
	type ResolvedGraphicNodeState,
} from "./nodes/graphic-node";
import { ImageNode, loadImageSource } from "./nodes/image-node";
import { StickerNode, loadStickerSource } from "./nodes/sticker-node";
import { TextNode, type ResolvedTextNodeState } from "./nodes/text-node";
import type { LetterAnimationStyle } from "@/text/letter-animation";
import {
	applyClipPhaseAnimations,
	readClipAnimationParams,
} from "@/animation/clip-animations";
import { VideoNode } from "./nodes/video-node";
import type {
	ResolvedVisualNodeState,
	ResolvedVisualSourceNodeState,
	VisualNodeParams,
} from "./nodes/visual-node";

type ResolveContext = {
	renderer: CanvasRenderer;
	time: number;
	hasActiveExemplifyingOverlay?: boolean;
};

function hasActiveExemplifyingOverlayAtTime(
	rootNode: AnyBaseNode,
	time: number,
): boolean {
	for (const child of rootNode.children) {
		if (child instanceof ImageNode) {
			const clipTime = time - child.params.timeOffset;
			if (clipTime >= 0 && clipTime < child.params.duration) {
				const isSubOverlay =
					child.params.clipParams?.isSubtitleOverlay === true;
				const scaleX = Number(
					child.params.clipParams?.["transform.scaleX"] ??
						child.params.transform?.scaleX ??
						1,
				);
				if (isSubOverlay || scaleX < 0.95) {
					return true;
				}
			}
		} else if (child instanceof StickerNode) {
			const clipTime = time - child.params.timeOffset;
			if (clipTime >= 0 && clipTime < child.params.duration) {
				return true;
			}
		}
	}
	return false;
}

export async function resolveRenderTree({
	node,
	renderer,
	time,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
	time: number;
}): Promise<void> {
	const hasActiveExemplifyingOverlay = hasActiveExemplifyingOverlayAtTime(
		node,
		time,
	);
	await resolveNode({
		node,
		context: {
			renderer,
			time,
			hasActiveExemplifyingOverlay,
		},
	});
}

async function resolveNode({
	node,
	context,
}: {
	node: AnyBaseNode;
	context: ResolveContext;
}): Promise<void> {
	if (node instanceof VideoNode) {
		node.resolved = await resolveVideoNode({ node, context });
	} else if (node instanceof ImageNode) {
		node.resolved = await resolveImageNode({ node, context });
	} else if (node instanceof StickerNode) {
		node.resolved = await resolveStickerNode({ node, context });
	} else if (node instanceof GraphicNode) {
		node.resolved = resolveGraphicNode({ node, context });
	} else if (node instanceof TextNode) {
		node.resolved = resolveTextNode({ node, context });
	} else if (node instanceof BlurBackgroundNode) {
		node.resolved = await resolveBlurBackgroundNode({ node, context });
	} else if (node instanceof EffectLayerNode) {
		node.resolved = resolveEffectLayerNode({ node, context });
	}

	for (const child of node.children) {
		await resolveNode({ node: child, context });
	}
}

function resolveEffectPassGroups({
	effects,
	animations,
	localTime,
	width,
	height,
}: {
	effects: Effect[] | undefined;
	animations: VisualNodeParams["animations"];
	localTime: number;
	width: number;
	height: number;
}): EffectPass[][] {
	return (effects ?? [])
		.filter((effect) => effect.enabled)
		.map((effect) => {
			const resolvedParams = resolveEffectParamsAtTime({
				effectId: effect.id,
				params: effect.params,
				animations,
				localTime,
			});
			const definition = effectsRegistry.get(effect.type);
			return resolveEffectPasses({
				definition,
				effectParams: resolvedParams,
				width,
				height,
			});
		});
}

function resolveVisualState({
	params,
	context,
	sourceWidth,
	sourceHeight,
}: {
	params: VisualNodeParams;
	context: ResolveContext;
	sourceWidth: number;
	sourceHeight: number;
}): ResolvedVisualNodeState | null {
	const clipTime = context.time - params.timeOffset;
	if (clipTime < 0 || clipTime >= params.duration) {
		return null;
	}

	const localTime = getElementLocalTime({
		timelineTime: context.time,
		elementStartTime: params.timeOffset,
		elementDuration: params.duration,
	});
	const baseTransform = resolveTransformAtTime({
		baseTransform: params.transform,
		animations: params.animations,
		localTime,
	});
	const baseOpacity = resolveOpacityAtTime({
		baseOpacity: params.opacity,
		animations: params.animations,
		localTime,
	});
	const { transform, opacity, transitionFx } = applyClipPhaseAnimations({
		baseTransform,
		baseOpacity,
		clipParams: params.clipParams,
		localTimeSec: localTime / 120_000,
		timelineTimeSec: context.time / 120_000,
		durationSec: params.duration / 120_000,
		canvasWidth: context.renderer.width,
		canvasHeight: context.renderer.height,
		isText: false,
	});
	const fitMode = params.fitMode ?? "contain";
	const baseScale =
		fitMode === "cover"
			? Math.max(
					context.renderer.width / Math.max(1, sourceWidth),
					context.renderer.height / Math.max(1, sourceHeight),
				)
			: Math.min(
					context.renderer.width / Math.max(1, sourceWidth),
					context.renderer.height / Math.max(1, sourceHeight),
				);
	const effectWidth = Math.round(
		Math.abs(sourceWidth * baseScale * transform.scaleX),
	);
	const effectHeight = Math.round(
		Math.abs(sourceHeight * baseScale * transform.scaleY),
	);

	return {
		localTime,
		transform,
		opacity,
		transitionFx,
		fitMode,
		effectPasses: resolveEffectPassGroups({
			effects: params.effects,
			animations: params.animations,
			localTime,
			width: effectWidth,
			height: effectHeight,
		}),
	};
}

async function resolveVideoNode({
	node,
	context,
}: {
	node: VideoNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const clipTime = context.time - node.params.timeOffset;
	if (clipTime < 0 || clipTime >= node.params.duration) {
		if (
			videoCache.isPlaybackActive() &&
			clipTime < 0 &&
			clipTime >= -TICKS_PER_SECOND * 2.2
		) {
			const startSourceTicks =
				node.params.trimStart +
				getSourceTimeAtClipTime({
					clipTime: 0,
					retime: node.params.retime,
				});
			videoCache.prerollAt({
				mediaId: node.params.mediaId,
				file: node.params.file,
				time: mediaTimeToSeconds({
					time: roundMediaTime({ time: startSourceTicks }),
				}),
				leadTimeSec: mediaTimeToSeconds({
					time: roundMediaTime({ time: -clipTime }),
				}),
			});
		}
		return null;
	}

	const sourceTimeTicks =
		node.params.trimStart +
		getSourceTimeAtClipTime({
			clipTime,
			retime: node.params.retime,
		});
	const frame = await videoCache.getFrameAt({
		mediaId: node.params.mediaId,
		file: node.params.file,
		time: mediaTimeToSeconds({ time: roundMediaTime({ time: sourceTimeTicks }) }),
	});
	if (!frame) {
		return null;
	}

	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: frame.canvas.width,
		sourceHeight: frame.canvas.height,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: frame.canvas,
		sourceWidth: frame.canvas.width,
		sourceHeight: frame.canvas.height,
	};
}

async function resolveImageNode({
	node,
	context,
}: {
	node: ImageNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const clipTime = context.time - node.params.timeOffset;
	if (clipTime < 0 || clipTime >= node.params.duration) {
		return null;
	}

	let source: Awaited<ReturnType<typeof loadImageSource>>;
	try {
		source = await loadImageSource({
			url: node.params.url,
			maxSourceSize: node.params.maxSourceSize,
		});
	} catch {
		return null;
	}
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: source.width,
		sourceHeight: source.height,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: source.source,
		sourceWidth: source.width,
		sourceHeight: source.height,
	};
}

async function resolveStickerNode({
	node,
	context,
}: {
	node: StickerNode;
	context: ResolveContext;
}): Promise<ResolvedVisualSourceNodeState | null> {
	const clipTime = context.time - node.params.timeOffset;
	if (clipTime < 0 || clipTime >= node.params.duration) {
		return null;
	}

	let source: Awaited<ReturnType<typeof loadStickerSource>>;
	try {
		source = await loadStickerSource({ stickerId: node.params.stickerId });
	} catch {
		return null;
	}
	const sourceWidth = node.params.intrinsicWidth ?? source.width;
	const sourceHeight = node.params.intrinsicHeight ?? source.height;
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth,
		sourceHeight,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		source: source.source,
		sourceWidth,
		sourceHeight,
	};
}

function resolveGraphicNode({
	node,
	context,
}: {
	node: GraphicNode;
	context: ResolveContext;
}): ResolvedGraphicNodeState | null {
	const visualState = resolveVisualState({
		params: node.params,
		context,
		sourceWidth: DEFAULT_GRAPHIC_SOURCE_SIZE,
		sourceHeight: DEFAULT_GRAPHIC_SOURCE_SIZE,
	});
	if (!visualState) {
		return null;
	}

	return {
		...visualState,
		resolvedParams: resolveGraphicElementParamsAtTime({
			element: node.params,
			localTime: visualState.localTime,
		}),
	};
}

function resolveTextNode({
	node,
	context,
}: {
	node: TextNode;
	context: ResolveContext;
}): ResolvedTextNodeState | null {
	if (
		context.time < node.params.startTime ||
		context.time >= node.params.startTime + node.params.duration
	) {
		return null;
	}

	const isSubtitleNode =
		node.params.params?.isSubtitle === true ||
		(typeof node.params.name === "string" &&
			node.params.name.startsWith("Subtítulo"));
	if (isSubtitleNode && context.hasActiveExemplifyingOverlay) {
		return null;
	}

	const localTime = getElementLocalTime({
		timelineTime: context.time,
		elementStartTime: node.params.startTime,
		elementDuration: node.params.duration,
	});
	const localTimeSec = mediaTimeToSeconds({
		time: roundMediaTime({ time: localTime }),
	});
	const durationSec = mediaTimeToSeconds({ time: node.params.duration });
	const background = buildTextBackgroundFromElement({ element: node.params });

	const baseTransform = resolveTransformAtTime({
		baseTransform: node.params.transform,
		animations: node.params.animations,
		localTime,
	});
	const baseOpacity = resolveOpacityAtTime({
		baseOpacity: node.params.opacity,
		animations: node.params.animations,
		localTime,
	});
	const { transform, opacity, transitionFx } = applyClipPhaseAnimations({
		baseTransform,
		baseOpacity,
		clipParams: node.params.params,
		localTimeSec,
		durationSec,
		canvasWidth: context.renderer.width,
		canvasHeight: context.renderer.height,
		isText: true,
	});

	return {
		transform,
		opacity,
		transitionFx,
		textColor: resolveColorAtTime({
			baseColor:
				typeof node.params.params.color === "string"
					? node.params.params.color
					: "#ffffff",
			animations: node.params.animations,
			propertyPath: "color",
			localTime,
		}),
		backgroundColor: resolveColorAtTime({
			baseColor: background.color,
			animations: node.params.animations,
			propertyPath: "background.color",
			localTime,
		}),
		effectPasses: resolveEffectPassGroups({
			effects: node.params.effects,
			animations: node.params.animations,
			localTime,
			width: context.renderer.width,
			height: context.renderer.height,
		}),
		measuredText: (() => {
			const hasAnims =
				node.params.animations &&
				Object.keys(node.params.animations).length > 0;
			const loadedFontCount =
				typeof document !== "undefined" && document.fonts
					? document.fonts.size
					: 0;
			const measurementKey = `${node.params.canvasHeight}|${loadedFontCount}|${node.params.params.content}|${node.params.params.fontFamily}|${node.params.params.fontSize}|${node.params.params.fontWeight}|${node.params.params.fontStyle}|${node.params.params.letterSpacing}|${node.params.params.lineHeight}|${node.params.params["background.enabled"]}|${node.params.params["background.paddingX"]}|${node.params.params["background.paddingY"]}|${node.params.params["background.cornerRadius"]}`;
			if (!hasAnims) {
				if (
					!node.cachedStaticMeasurement ||
					node.cachedMeasurementKey !== measurementKey
				) {
					node.cachedStaticMeasurement = measureTextElement({
						element: node.params,
						canvasHeight: node.params.canvasHeight,
						localTime: 0,
						ctx: getTextMeasurementContext(),
					});
					node.cachedMeasurementKey = measurementKey;
				}
				return node.cachedStaticMeasurement;
			}
			return measureTextElement({
				element: node.params,
				canvasHeight: node.params.canvasHeight,
				localTime,
				ctx: getTextMeasurementContext(),
			});
		})(),
		letterAnimation: (() => {
			const clipAnim = readClipAnimationParams(node.params.params);
			const rawLegacy = node.params.params.letterAnimation;
			const legacyStyle: LetterAnimationStyle =
				typeof rawLegacy === "string" && rawLegacy.length > 0
					? (rawLegacy as LetterAnimationStyle)
					: "none";

			const inDur =
				clipAnim.animIn !== "none"
					? Math.min(clipAnim.animInDuration, durationSec * 0.85)
					: 0;
			const outDur =
				clipAnim.animOut !== "none"
					? Math.min(
							clipAnim.animOutDuration,
							Math.max(0.08, durationSec - inDur * 0.5),
						)
					: 0;

			let activeStyle: LetterAnimationStyle = "none";
			let phaseTimeSec = localTimeSec;
			let activeSpeed = clipAnim.animLoopSpeed;
			const activeIntensity = clipAnim.animLoopIntensity;

			if (
				clipAnim.animIn.startsWith("letter-") &&
				localTimeSec < inDur
			) {
				const mapIn: Record<string, LetterAnimationStyle> = {
					"letter-pop-cascade": "pop-cascade",
					"letter-typewriter": "typewriter-pro",
					"letter-slide-up": "slide-up-reveal",
					"letter-bounce": "bounce-elastic",
					"letter-flip-3d": "flip-3d",
					"letter-scatter": "scatter-converge",
				};
				activeStyle = mapIn[clipAnim.animIn] ?? "none";
				phaseTimeSec = localTimeSec;
				activeSpeed = Math.max(0.3, 0.65 / Math.max(0.15, inDur));
			} else if (
				clipAnim.animOut.startsWith("letter-") &&
				localTimeSec > durationSec - outDur
			) {
				const mapOut: Record<string, LetterAnimationStyle> = {
					"letter-pop-out": "pop-out-cascade",
					"letter-scatter-out": "scatter-out",
					"letter-drop-out": "drop-out",
				};
				activeStyle = mapOut[clipAnim.animOut] ?? "none";
				phaseTimeSec = Math.max(0, localTimeSec - (durationSec - outDur));
				activeSpeed = Math.max(0.3, 0.55 / Math.max(0.15, outDur));
			} else if (clipAnim.animLoop.startsWith("letter-")) {
				const mapLoop: Record<string, LetterAnimationStyle> = {
					"letter-wave": "wave-kinetic",
					"letter-karaoke": "word-karaoke",
					"letter-neon-pulse": "neon-pulse",
					"letter-heartbeat": "heartbeat-sync",
					"letter-glitch-rgb": "glitch-cyber",
				};
				activeStyle = mapLoop[clipAnim.animLoop] ?? "none";
				phaseTimeSec = Math.max(0, localTimeSec - inDur * 0.5);
				activeSpeed = clipAnim.animLoopSpeed;
			} else if (legacyStyle !== "none") {
				activeStyle = legacyStyle;
				phaseTimeSec = localTimeSec;
			}

			const accentColor =
				typeof node.params.params.letterAnimationColor === "string"
					? node.params.params.letterAnimationColor
					: "#38bdf8";
			const strokeWidth =
				typeof node.params.params.strokeWidth === "number"
					? node.params.params.strokeWidth
					: 0;
			const strokeColor =
				typeof node.params.params.strokeColor === "string"
					? node.params.params.strokeColor
					: "#000000";
			const shadowBlur =
				typeof node.params.params.shadowBlur === "number"
					? node.params.params.shadowBlur
					: 0;
			const shadowColor =
				typeof node.params.params.shadowColor === "string"
					? node.params.params.shadowColor
					: "rgba(0,0,0,0.85)";
			const karaokeMode =
				node.params.params.karaokeMode === "highlight" ? "highlight" : "pill";
			let wordTimings:
				| Array<{
						word: string;
						startOffset: number;
						endOffset: number;
				  }>
				| undefined;
			const rawWordTimings = node.params.params.wordTimings;
			if (node.cachedWordTimingsRaw === rawWordTimings && rawWordTimings != null) {
				wordTimings = node.cachedWordTimings;
			} else {
				if (Array.isArray(rawWordTimings)) {
					wordTimings = rawWordTimings as Array<{
						word: string;
						startOffset: number;
						endOffset: number;
					}>;
				} else if (
					typeof rawWordTimings === "string" &&
					rawWordTimings.startsWith("[")
				) {
					try {
						wordTimings = JSON.parse(rawWordTimings);
					} catch {
						wordTimings = undefined;
					}
				}
				node.cachedWordTimingsRaw = rawWordTimings;
				node.cachedWordTimings = wordTimings;
			}
			const quantizeHz = activeStyle === "word-karaoke" ? 20 : 30;
			return {
				style: activeStyle,
				speed: activeSpeed,
				intensity: activeIntensity,
				accentColor,
				localTimeSec:
					activeStyle === "none"
						? 0
						: Math.round(phaseTimeSec * quantizeHz) / quantizeHz,
				durationSec,
				strokeWidth,
				strokeColor,
				shadowBlur,
				shadowColor,
				karaokeMode,
				wordTimings,
			};
		})(),
	};
}

async function resolveBlurBackgroundNode({
	node,
	context,
}: {
	node: BlurBackgroundNode;
	context: ResolveContext;
}): Promise<ResolvedBlurBackgroundNodeState | null> {
	const clipTime = context.time - node.params.timeOffset;
	if (clipTime < 0 || clipTime >= node.params.duration) {
		return null;
	}

	const backdropSource = await resolveBackdropSource({ node, clipTime });
	if (!backdropSource) {
		return null;
	}

	return {
		backdropSource,
		passes: buildGaussianBlurPasses({
			sigmaX: intensityToSigma({
				intensity: node.params.blurIntensity,
				resolution: context.renderer.width,
				reference: 1920,
			}),
			sigmaY: intensityToSigma({
				intensity: node.params.blurIntensity,
				resolution: context.renderer.height,
				reference: 1080,
			}),
		}),
	};
}

async function resolveBackdropSource({
	node,
	clipTime,
}: {
	node: BlurBackgroundNode;
	clipTime: number;
}): Promise<BackdropSource | null> {
	if (node.params.mediaType === "video") {
		const sourceTimeTicks =
			node.params.trimStart +
			getSourceTimeAtClipTime({
				clipTime,
				retime: node.params.retime,
			});
		const frame = await videoCache.getFrameAt({
			mediaId: node.params.mediaId,
			file: node.params.file,
			time: mediaTimeToSeconds({ time: roundMediaTime({ time: sourceTimeTicks }) }),
		});
		if (!frame) {
			return null;
		}

		return {
			source: frame.canvas,
			width: frame.canvas.width,
			height: frame.canvas.height,
		};
	}

	const source = await loadImageSource({ url: node.params.url });
	return {
		source: source.source,
		width: source.width,
		height: source.height,
	};
}

function resolveEffectLayerNode({
	node,
	context,
}: {
	node: EffectLayerNode;
	context: ResolveContext;
}): ResolvedEffectLayerNodeState | null {
	const time = context.time;
	if (
		time < node.params.timeOffset - 1e-6 ||
		time >= node.params.timeOffset + node.params.duration + 1e-6
	) {
		return null;
	}

	const definition = effectsRegistry.get(node.params.effectType);
	const passes = resolveEffectPasses({
		definition,
		effectParams: node.params.effectParams,
		width: context.renderer.width,
		height: context.renderer.height,
	});
	if (passes.length === 0) {
		return null;
	}

	return {
		passes,
	};
}
