"use client";

import { useEditor } from "@/editor/use-editor";
import {
	buildGraphicParamPath,
	getKeyframeAtTime,
	hasKeyframesForPath,
	upsertPathKeyframe,
} from "@/animation";
import {
	findNearestTransformKeyframeTime,
	hasAnyTransformKeyframes,
	TRANSFORM_ANIMATION_PATHS,
	type TransformAnimationPath,
	useAutoKeyframeEnabled,
} from "@/animation/transform-keyframes";
import type {
	AnimationPath,
	ElementAnimations,
} from "@/animation/types";
import {
	coerceParamValue,
	getParamChannelLayout,
	type ParamDefinition,
} from "@/params";
import type { TimelineElement } from "@/timeline";
import { type MediaTime, ZERO_MEDIA_TIME } from "@/wasm";

export interface KeyframedParamPropertyResult {
	hasAnimatedKeyframes: boolean;
	isKeyframedAtTime: boolean;
	keyframeIdAtTime: string | null;
	onPreview: (value: number | string | boolean) => void;
	onCommit: () => void;
	toggleKeyframe: () => void;
}

export function useKeyframedParamProperty({
	param,
	trackId,
	elementId,
	animations,
	propertyPath,
	localTime,
	isPlayheadWithinElementRange,
	resolvedValue,
	buildBaseUpdates,
}: {
	param: ParamDefinition;
	trackId: string;
	elementId: string;
	animations: ElementAnimations | undefined;
	propertyPath?: AnimationPath;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	resolvedValue: number | string | boolean;
	buildBaseUpdates: ({
		value,
	}: {
		value: number | string | boolean;
	}) => Partial<TimelineElement>;
}): KeyframedParamPropertyResult {
	const editor = useEditor();
	const [autoKeyframe] = useAutoKeyframeEnabled();
	const resolvedPropertyPath =
		propertyPath ?? buildGraphicParamPath({ paramKey: param.key });
	const isTransformPath = TRANSFORM_ANIMATION_PATHS.includes(
		resolvedPropertyPath as TransformAnimationPath,
	);
	const hasAnimatedKeyframes = hasKeyframesForPath({
		animations,
		propertyPath: resolvedPropertyPath,
	});
	const snappedTime = isTransformPath
		? (findNearestTransformKeyframeTime({
				animations,
				localTime,
			}) ?? localTime)
		: localTime;
	const keyframeAtTime = isPlayheadWithinElementRange
		? (getKeyframeAtTime({
				animations,
				propertyPath: resolvedPropertyPath,
				time: localTime,
			}) ??
			(snappedTime !== localTime
				? getKeyframeAtTime({
						animations,
						propertyPath: resolvedPropertyPath,
						time: snappedTime,
					})
				: null))
		: null;
	const keyframeIdAtTime = keyframeAtTime?.id ?? null;
	const isKeyframedAtTime = keyframeAtTime !== null;
	const shouldUseAnimatedChannel =
		isPlayheadWithinElementRange &&
		(hasAnimatedKeyframes ||
			(isTransformPath &&
				(hasAnyTransformKeyframes(animations) ||
					(autoKeyframe && localTime > 0))));

	const previewValue: KeyframedParamPropertyResult["onPreview"] = (value) => {
		if (shouldUseAnimatedChannel) {
			let nextAnimations = animations;
			if (!hasAnimatedKeyframes && snappedTime > 0) {
				nextAnimations = upsertPathKeyframe({
					animations: nextAnimations,
					propertyPath: resolvedPropertyPath,
					time: ZERO_MEDIA_TIME,
					value: resolvedValue,
					channelLayout: getParamChannelLayout({ param }),
					coerceValue: ({ value: nextValue }) =>
						coerceParamValue({
							param,
							value: nextValue,
						}),
				});
			}
			nextAnimations = upsertPathKeyframe({
				animations: nextAnimations,
				propertyPath: resolvedPropertyPath,
				time: snappedTime,
				value,
				channelLayout: getParamChannelLayout({ param }),
				coerceValue: ({ value: nextValue }) =>
					coerceParamValue({
						param,
						value: nextValue,
					}),
			});
			editor.timeline.previewElements({
				updates: [
					{
						trackId,
						elementId,
						updates: {
							animations: nextAnimations,
						},
					},
				],
			});
			return;
		}

		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId,
					updates: buildBaseUpdates({ value }),
				},
			],
		});
	};

	const toggleKeyframe = () => {
		if (!isPlayheadWithinElementRange) {
			return;
		}

		if (keyframeIdAtTime) {
			editor.timeline.removeKeyframes({
				keyframes: [
					{
						trackId,
						elementId,
						propertyPath: resolvedPropertyPath,
						keyframeId: keyframeIdAtTime,
					},
				],
			});
			return;
		}

		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId,
					propertyPath: resolvedPropertyPath,
					time: localTime,
					value: resolvedValue,
				},
			],
		});
	};

	return {
		hasAnimatedKeyframes,
		isKeyframedAtTime,
		keyframeIdAtTime,
		onPreview: previewValue,
		onCommit: () => editor.timeline.commitPreview(),
		toggleKeyframe,
	};
}
