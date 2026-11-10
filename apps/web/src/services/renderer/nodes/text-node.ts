import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import {
	drawMeasuredTextLayout,
	strokeMeasuredTextLayout,
} from "@/text/primitives";
import {
	drawAnimatedTextLayout,
	type ResolvedLetterAnimationState,
} from "@/text/letter-animation";
import type { MeasuredTextElement } from "@/text/measure-element";
import type { TransitionVisualFx } from "@/animation/clip-animations";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	effectPasses: EffectPass[][];
	measuredText: MeasuredTextElement;
	letterAnimation?: ResolvedLetterAnimationState;
	transitionFx?: TransitionVisualFx | null;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {
	cachedStaticMeasurement: MeasuredTextElement | null = null;
	cachedMeasurementKey: string | null = null;
	cachedWordTimingsRaw: unknown = null;
	cachedWordTimings:
		| Array<{
				word: string;
				startOffset: number;
				endOffset: number;
		  }>
		| undefined = undefined;
}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	if (resolved.letterAnimation && resolved.letterAnimation.style !== "none") {
		drawAnimatedTextLayout({
			ctx,
			layout: resolved.measuredText,
			textColor: resolved.textColor,
			background: resolved.measuredText.resolvedBackground,
			backgroundColor: resolved.backgroundColor,
			textBaseline: baseline,
			animation: resolved.letterAnimation,
		});
	} else {
		const rawStrokeWidth =
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
		const scaledStroke =
			rawStrokeWidth * (resolved.measuredText.scaledFontSize / 48) * 2;

		if (shadowBlur > 0) {
			ctx.shadowColor = shadowColor;
			ctx.shadowBlur = shadowBlur;
		}
		if (scaledStroke > 0.3 && !resolved.measuredText.resolvedBackground?.enabled) {
			strokeMeasuredTextLayout({
				ctx,
				layout: resolved.measuredText,
				strokeColor,
				strokeWidth: scaledStroke,
				textBaseline: baseline,
			});
			ctx.shadowBlur = 0;
		}

		drawMeasuredTextLayout({
			ctx,
			layout: resolved.measuredText,
			textColor: resolved.textColor,
			background: resolved.measuredText.resolvedBackground,
			backgroundColor: resolved.backgroundColor,
			textBaseline: baseline,
		});
	}

	ctx.restore();
}
