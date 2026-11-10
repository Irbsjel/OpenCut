import { useSyncExternalStore } from "react";
import type { AnimationPropertyPath, ElementAnimations } from "@/animation/types";
import { NUMBER_CHANNEL_LAYOUT, type ParamValues } from "@/params";
import type { Transform } from "@/rendering";
import {
	type MediaTime,
	roundMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import { MIN_TRANSFORM_SCALE } from "./transform";
import {
	getChannel,
	removeElementKeyframe,
	setChannel,
	upsertPathKeyframe,
} from "./keyframes";
import { getKeyframeAtTime, hasKeyframesForPath } from "./keyframe-query";
import { isScalarChannel } from "./interpolation";
import { resolveAnimationPathValueAtTime } from "./resolve";

export const TRANSFORM_ANIMATION_PATHS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const satisfies ReadonlyArray<AnimationPropertyPath>;

export type TransformAnimationPath = (typeof TRANSFORM_ANIMATION_PATHS)[number];

const AUTO_KEYFRAME_STORAGE_KEY = "opencut:auto-keyframe-transform:v1";

let autoKeyframeEnabledState = true;
if (typeof window !== "undefined") {
	try {
		const saved = window.localStorage.getItem(AUTO_KEYFRAME_STORAGE_KEY);
		if (saved === "false") {
			autoKeyframeEnabledState = false;
		} else if (saved === "true") {
			autoKeyframeEnabledState = true;
		}
	} catch {
		// ignore storage errors
	}
}

const autoKeyframeListeners = new Set<() => void>();

export function getAutoKeyframeEnabled(): boolean {
	return autoKeyframeEnabledState;
}

export function setAutoKeyframeEnabled(enabled: boolean): void {
	if (autoKeyframeEnabledState === enabled) {
		return;
	}
	autoKeyframeEnabledState = enabled;
	if (typeof window !== "undefined") {
		try {
			window.localStorage.setItem(
				AUTO_KEYFRAME_STORAGE_KEY,
				enabled ? "true" : "false",
			);
		} catch {
			// ignore storage errors
		}
	}
	for (const listener of autoKeyframeListeners) {
		listener();
	}
}

export function subscribeAutoKeyframe(listener: () => void): () => void {
	autoKeyframeListeners.add(listener);
	return () => {
		autoKeyframeListeners.delete(listener);
	};
}

export function useAutoKeyframeEnabled(): [boolean, (enabled: boolean) => void] {
	const enabled = useSyncExternalStore(
		subscribeAutoKeyframe,
		getAutoKeyframeEnabled,
		() => true,
	);
	return [enabled, setAutoKeyframeEnabled];
}

function safeRoundTime(ticks: number): MediaTime {
	if (!Number.isFinite(ticks) || ticks <= 0) {
		return ZERO_MEDIA_TIME;
	}
	return roundMediaTime({ time: ticks });
}

function getDefaultToleranceTicks(): number {
	const tps =
		typeof TICKS_PER_SECOND === "number" && Number.isFinite(TICKS_PER_SECOND)
			? TICKS_PER_SECOND
			: 120_000;
	return Math.round(tps / 30);
}

function resolveTransformSnapshot({
	baseTransform,
	animations,
	localTime,
}: {
	baseTransform: Transform;
	animations: ElementAnimations | undefined;
	localTime: number;
}): Transform {
	const safeLocalTime = Math.max(0, Number.isFinite(localTime) ? localTime : 0);
	return {
		position: {
			x: resolveAnimationPathValueAtTime({
				animations,
				propertyPath: "transform.positionX",
				localTime: safeLocalTime,
				fallbackValue: baseTransform.position.x,
			}),
			y: resolveAnimationPathValueAtTime({
				animations,
				propertyPath: "transform.positionY",
				localTime: safeLocalTime,
				fallbackValue: baseTransform.position.y,
			}),
		},
		scaleX: resolveAnimationPathValueAtTime({
			animations,
			propertyPath: "transform.scaleX",
			localTime: safeLocalTime,
			fallbackValue: baseTransform.scaleX,
		}),
		scaleY: resolveAnimationPathValueAtTime({
			animations,
			propertyPath: "transform.scaleY",
			localTime: safeLocalTime,
			fallbackValue: baseTransform.scaleY,
		}),
		rotate: resolveAnimationPathValueAtTime({
			animations,
			propertyPath: "transform.rotate",
			localTime: safeLocalTime,
			fallbackValue: baseTransform.rotate,
		}),
	};
}

export function getTransformPathValue({
	transform,
	propertyPath,
}: {
	transform: Transform;
	propertyPath: TransformAnimationPath;
}): number {
	switch (propertyPath) {
		case "transform.positionX":
			return Math.round(transform.position.x * 100) / 100;
		case "transform.positionY":
			return Math.round(transform.position.y * 100) / 100;
		case "transform.scaleX":
			return Math.max(
				MIN_TRANSFORM_SCALE,
				Math.round(transform.scaleX * 1000) / 1000,
			);
		case "transform.scaleY":
			return Math.max(
				MIN_TRANSFORM_SCALE,
				Math.round(transform.scaleY * 1000) / 1000,
			);
		case "transform.rotate":
			return Math.round(transform.rotate * 100) / 100;
	}
}

export function hasAnyTransformKeyframes(
	animations: ElementAnimations | undefined,
): boolean {
	if (!animations) {
		return false;
	}
	return TRANSFORM_ANIMATION_PATHS.some((propertyPath) =>
		hasKeyframesForPath({ animations, propertyPath }),
	);
}

export function getTransformKeyframeTimes({
	animations,
}: {
	animations: ElementAnimations | undefined;
}): MediaTime[] {
	if (!animations) {
		return [];
	}
	const timeSet = new Set<number>();
	for (const propertyPath of TRANSFORM_ANIMATION_PATHS) {
		const channel = getChannel({ animations, propertyPath });
		if (!channel || !isScalarChannel(channel)) {
			continue;
		}
		for (const key of channel.keys) {
			if (typeof key.time === "number" && Number.isFinite(key.time)) {
				timeSet.add(key.time);
			}
		}
	}
	return Array.from(timeSet)
		.sort((a, b) => a - b)
		.map((ticks) => safeRoundTime(ticks));
}

export function findNearestTransformKeyframeTime({
	animations,
	localTime,
	toleranceTicks,
}: {
	animations: ElementAnimations | undefined;
	localTime: number;
	toleranceTicks?: number;
}): MediaTime | null {
	const tol = toleranceTicks ?? getDefaultToleranceTicks();
	const times = getTransformKeyframeTimes({ animations });
	let nearest: MediaTime | null = null;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const t of times) {
		const dist = Math.abs(t - localTime);
		if (dist <= tol && dist < bestDist) {
			bestDist = dist;
			nearest = t;
		}
	}
	return nearest;
}

export function hasTransformKeyframeAtTime({
	animations,
	localTime,
	toleranceTicks,
}: {
	animations: ElementAnimations | undefined;
	localTime: number;
	toleranceTicks?: number;
}): boolean {
	return (
		findNearestTransformKeyframeTime({
			animations,
			localTime,
			toleranceTicks,
		}) !== null
	);
}

export function upsertTransformNumberKeyframe({
	animations,
	propertyPath,
	time,
	value,
}: {
	animations: ElementAnimations | undefined;
	propertyPath: TransformAnimationPath;
	time: MediaTime;
	value: number;
}): ElementAnimations | undefined {
	return upsertPathKeyframe({
		animations,
		propertyPath,
		time,
		value,
		channelLayout: NUMBER_CHANNEL_LAYOUT,
		coerceValue: ({ value: v }) => (typeof v === "number" ? v : null),
	});
}

export function upsertAllTransformKeyframesAtTime({
	baseTransform,
	animations,
	localTime,
}: {
	baseTransform: Transform;
	animations: ElementAnimations | undefined;
	localTime: number;
}): ElementAnimations | undefined {
	const snappedExisting = findNearestTransformKeyframeTime({
		animations,
		localTime,
	});
	const targetTime = snappedExisting ?? safeRoundTime(localTime);
	const resolvedAtTime = resolveTransformSnapshot({
		baseTransform,
		animations,
		localTime: targetTime,
	});

	let nextAnimations = animations;
	for (const propertyPath of TRANSFORM_ANIMATION_PATHS) {
		const value = getTransformPathValue({
			transform: resolvedAtTime,
			propertyPath,
		});
		nextAnimations = upsertTransformNumberKeyframe({
			animations: nextAnimations,
			propertyPath,
			time: targetTime,
			value,
		});
	}
	return nextAnimations;
}

export function removeTransformKeyframesAtTime({
	animations,
	localTime,
	toleranceTicks,
}: {
	animations: ElementAnimations | undefined;
	localTime: number;
	toleranceTicks?: number;
}): ElementAnimations | undefined {
	if (!animations) {
		return undefined;
	}
	const tol = toleranceTicks ?? getDefaultToleranceTicks();
	const targetTime =
		findNearestTransformKeyframeTime({
			animations,
			localTime,
			toleranceTicks: tol,
		}) ?? safeRoundTime(localTime);

	let nextAnimations: ElementAnimations | undefined = animations;
	for (const propertyPath of TRANSFORM_ANIMATION_PATHS) {
		const channel = getChannel({ animations: nextAnimations, propertyPath });
		if (!channel || !isScalarChannel(channel)) {
			continue;
		}
		for (const key of channel.keys) {
			if (Math.abs(key.time - targetTime) <= tol) {
				nextAnimations = removeElementKeyframe({
					animations: nextAnimations,
					propertyPath,
					keyframeId: key.id,
				});
			}
		}
	}
	return nextAnimations;
}

export function clearAllTransformKeyframes({
	animations,
}: {
	animations: ElementAnimations | undefined;
}): ElementAnimations | undefined {
	if (!animations) {
		return undefined;
	}
	let nextAnimations: ElementAnimations | undefined = animations;
	for (const propertyPath of TRANSFORM_ANIMATION_PATHS) {
		nextAnimations = setChannel({
			animations: nextAnimations,
			propertyPath,
			channel: undefined,
		});
	}
	return nextAnimations;
}

export function applyInteractiveTransformUpdate({
	initialParams,
	initialAnimations,
	baseTransformAtZero,
	localTime,
	isWithinRange,
	nextTransform,
	changedPaths,
	autoKeyframe = getAutoKeyframeEnabled(),
}: {
	initialParams: ParamValues;
	initialAnimations: ElementAnimations | undefined;
	baseTransformAtZero: Transform;
	localTime: number;
	isWithinRange: boolean;
	nextTransform: Transform;
	changedPaths: ReadonlyArray<TransformAnimationPath>;
	autoKeyframe?: boolean;
}): {
	params: ParamValues;
	animations: ElementAnimations | undefined;
} {
	const nextParams: ParamValues = { ...initialParams };
	let nextAnimations: ElementAnimations | undefined = initialAnimations;

	const snappedExistingTime = findNearestTransformKeyframeTime({
		animations: initialAnimations,
		localTime,
	});
	const targetTime = snappedExistingTime ?? safeRoundTime(localTime);
	const elementAlreadyHasTransformKeys =
		hasAnyTransformKeyframes(initialAnimations);

	for (const propertyPath of changedPaths) {
		const nextValue = getTransformPathValue({
			transform: nextTransform,
			propertyPath,
		});
		const pathAlreadyAnimated = hasKeyframesForPath({
			animations: initialAnimations,
			propertyPath,
		});

		const shouldWriteKeyframes =
			isWithinRange &&
			(pathAlreadyAnimated ||
				elementAlreadyHasTransformKeys ||
				(autoKeyframe && targetTime > 0));

		if (shouldWriteKeyframes) {
			if (!pathAlreadyAnimated && targetTime > 0) {
				const initialValueAtZero = getTransformPathValue({
					transform: baseTransformAtZero,
					propertyPath,
				});
				const existingZeroKey = getKeyframeAtTime({
					animations: nextAnimations,
					propertyPath,
					time: ZERO_MEDIA_TIME,
				});
				if (!existingZeroKey) {
					nextAnimations = upsertTransformNumberKeyframe({
						animations: nextAnimations,
						propertyPath,
						time: ZERO_MEDIA_TIME,
						value: initialValueAtZero,
					});
				}
			}

			nextAnimations = upsertTransformNumberKeyframe({
				animations: nextAnimations,
				propertyPath,
				time: targetTime,
				value: nextValue,
			});

			if (targetTime === 0) {
				nextParams[propertyPath] = nextValue;
			}
		} else {
			nextParams[propertyPath] = nextValue;
		}
	}

	return {
		params: nextParams,
		animations: nextAnimations,
	};
}
