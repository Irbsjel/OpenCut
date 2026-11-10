"use client";

import { useEffect, useMemo, useState } from "react";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { useEditor } from "@/editor/use-editor";
import {
	useSubtitleStyleStore,
	type SubtitlePreviewBackdrop,
} from "@/subtitles/style-store";
import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import { mediaTimeToSeconds } from "@/wasm";
import { usePreviewViewport } from "./preview-viewport";

export function SubtitleLivePreviewOverlay() {
	const activeTab = useAssetsPanelStore((s) => s.activeTab);
	const {
		style,
		verticalAlign,
		previewBackdrop,
		setPreviewBackdrop,
		sampleText,
	} = useSubtitleStyleStore();
	const viewport = usePreviewViewport();
	const activeScene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const currentTimeTicks = useEditor((e) => e.playback.getCurrentTime());
	const currentTimeSec = mediaTimeToSeconds({ time: currentTimeTicks });

	const [activeWordIdx, setActiveWordIdx] = useState(2);

	const { hasSubtitleAtPlayhead, hasAnySubtitleInTimeline } = useMemo(() => {
		if (!activeScene?.tracks?.overlay) {
			return { hasSubtitleAtPlayhead: false, hasAnySubtitleInTimeline: false };
		}
		let anySub = false;
		let atPlayhead = false;
		for (const track of activeScene.tracks.overlay) {
			if (track.type !== "text") continue;
			for (const el of track.elements) {
				if (el.type !== "text") continue;
				if (
					el.params?.isSubtitle !== true &&
					!(typeof el.name === "string" && el.name.startsWith("Subtítulo"))
				) {
					continue;
				}
				anySub = true;
				const startSec = mediaTimeToSeconds({ time: el.startTime });
				const endSec = startSec + mediaTimeToSeconds({ time: el.duration });
				if (
					currentTimeSec >= startSec - 0.05 &&
					currentTimeSec <= endSec + 0.05
				) {
					atPlayhead = true;
				}
			}
		}
		return {
			hasSubtitleAtPlayhead: atPlayhead,
			hasAnySubtitleInTimeline: anySub,
		};
	}, [activeScene, currentTimeSec]);

	const words = useMemo(() => {
		const raw = style.uppercase ? sampleText.toUpperCase() : sampleText;
		return raw.trim().split(/\s+/).filter(Boolean);
	}, [sampleText, style.uppercase]);

	useEffect(() => {
		if (activeTab !== "captions") return;
		const timer = setInterval(() => {
			setActiveWordIdx((prev) => (prev + 1) % Math.max(1, words.length));
		}, 520);
		return () => clearInterval(timer);
	}, [activeTab, words.length]);

	if (activeTab !== "captions") {
		return null;
	}

	if (
		(hasAnySubtitleInTimeline || hasSubtitleAtPlayhead) &&
		previewBackdrop === "video"
	) {
		return null;
	}

	const displayScale = Math.max(0.15, viewport.sceneHeight / 1080);
	const rawFontPx =
		style.fontSize * (viewport.sceneHeight / FONT_SIZE_SCALE_REFERENCE);
	const maxFontByWidth = Math.max(13, viewport.sceneWidth * 0.072);
	const scaledFontPx = Math.max(12, Math.min(maxFontByWidth, rawFontPx * 0.78));
	const scaledStrokePx =
		style.strokeWidth > 0 && !style.backgroundEnabled
			? Math.max(1, style.strokeWidth * (scaledFontPx / 48) * 1.6)
			: 0;
	const scaledShadowBlur = Math.max(0, style.shadowBlur * displayScale);
	const scaledRadius = Math.max(4, style.cornerRadius * displayScale * 0.45);
	const scaledPadX = Math.max(8, style.paddingX * displayScale * 0.65);
	const scaledPadY = Math.max(4, style.paddingY * displayScale * 0.65);

	const effectiveCanvasBg =
		previewBackdrop === "black"
			? "#09090b"
			: previewBackdrop === "white"
				? "#f8fafc"
				: "transparent";

	const justifyClass =
		verticalAlign === "top"
			? "justify-start pt-10"
			: verticalAlign === "middle"
				? "justify-center"
				: "justify-end pb-[9%]";

	const isKaraokePill =
		style.karaokeMode === "pill" ||
		(style.id === "karaoke-pill" && style.karaokeMode !== "highlight");
	const isKaraokeHighlight =
		style.letterAnimation === "word-karaoke" && !isKaraokePill;

	return (
		<div
			className="pointer-events-none absolute overflow-hidden select-none"
			style={{
				left: viewport.sceneLeft,
				top: viewport.sceneTop,
				width: viewport.sceneWidth,
				height: viewport.sceneHeight,
				backgroundColor: effectiveCanvasBg,
				zIndex: 15,
			}}
		>
			{/* Selector compacto de lienzo de prueba (Sobre el video / Lienzo negro / Lienzo blanco) */}
			<div className="pointer-events-auto absolute inset-x-1 top-1.5 z-20 flex justify-center">
				<div className="flex items-center gap-0.5 rounded-md border border-border/70 bg-background/90 p-0.5 shadow-xs backdrop-blur-xs">
					{(
						[
							{ id: "video", label: "Sobre video" },
							{ id: "black", label: "Lienzo negro" },
							{ id: "white", label: "Lienzo blanco" },
						] as const satisfies ReadonlyArray<{
							id: SubtitlePreviewBackdrop;
							label: string;
						}>
					).map((mode) => (
						<button
							key={mode.id}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setPreviewBackdrop(mode.id);
							}}
							className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
								previewBackdrop === mode.id
									? "bg-secondary text-secondary-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{mode.label}
						</button>
					))}
				</div>
			</div>

			{/* Subtítulo de ejemplo posicionado en vivo sobre el reproductor (sin caja extra cuando backgroundEnabled === false) */}
			<div
				className={`flex size-full flex-col items-center px-2.5 ${justifyClass}`}
			>
				<div
					className="flex flex-wrap items-center justify-center gap-x-[0.28em] gap-y-0.5 text-center leading-tight transition-all duration-150"
					style={{
						maxWidth: "92%",
						fontFamily: `"${style.fontFamily}", sans-serif`,
						fontSize: `${scaledFontPx}px`,
						fontWeight: style.fontWeight === "bold" ? 800 : 500,
						color: style.color,
						backgroundColor: style.backgroundEnabled
							? style.backgroundColor
							: "transparent",
						borderRadius: style.backgroundEnabled
							? `${scaledRadius}px`
							: undefined,
						padding: style.backgroundEnabled
							? `${scaledPadY}px ${scaledPadX}px`
							: undefined,
						WebkitTextStroke:
							scaledStrokePx > 0
								? `${scaledStrokePx}px ${style.strokeColor}`
								: undefined,
						paintOrder: "stroke fill",
						textShadow:
							scaledShadowBlur > 0
								? `0 2px ${scaledShadowBlur}px ${style.shadowColor}`
								: !style.backgroundEnabled
									? "0 2px 6px rgba(0,0,0,0.85)"
									: undefined,
					}}
				>
					{words.map((word, idx) => {
						const isCurrent = idx === activeWordIdx;
						const wordColor =
							isCurrent && isKaraokeHighlight
								? style.accentColor
								: style.color;
						const wordBg =
							isCurrent && isKaraokePill ? style.accentColor : "transparent";
						const wordTextColor =
							isCurrent && isKaraokePill ? "#09090b" : wordColor;

						return (
							<span
								key={`${word}-${idx}`}
								className="inline-block transition-transform duration-150"
								style={{
									color: wordTextColor,
									backgroundColor: wordBg,
									borderRadius:
										isCurrent && isKaraokePill
											? `${Math.max(4, scaledRadius * 0.6)}px`
											: undefined,
									padding:
										isCurrent && isKaraokePill
											? `0.04em 0.22em`
											: undefined,
									transform:
										isCurrent && style.letterAnimation !== "none"
											? "scale(1.06)"
											: "scale(1)",
								}}
							>
								{word}
							</span>
						);
					})}
				</div>
			</div>
		</div>
	);
}
