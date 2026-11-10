import { create } from "zustand";
import {
	CAPTION_STYLE_PRESETS,
	type CaptionStylePreset,
} from "./contextual-enrichment";

export type SubtitleBackgroundMode = "none" | "black" | "white" | "custom";
export type SubtitlePreviewBackdrop = "video" | "black" | "white";
export type StickerBorderColor = "white" | "black";
export type OverlayImageAnimationPreset =
	| "zoom-in-pop"
	| "elastic-drop"
	| "slide-up"
	| "spin-in"
	| "fade-in"
	| "pulse-beat"
	| "float-hover"
	| "shake-handheld"
	| "none";

export function resolveOverlayAnimationParams(
	preset: OverlayImageAnimationPreset,
): {
	animIn: string;
	animInDuration: number;
	animLoop: string;
	animLoopSpeed: number;
	animLoopIntensity: number;
	animOut: string;
	animOutDuration: number;
} {
	switch (preset) {
		case "zoom-in-pop":
			return {
				animIn: "zoom-in-pop",
				animInDuration: 0.24,
				animLoop: "none",
				animLoopSpeed: 1,
				animLoopIntensity: 1,
				animOut: "fade-out",
				animOutDuration: 0.18,
			};
		case "elastic-drop":
			return {
				animIn: "elastic-drop",
				animInDuration: 0.34,
				animLoop: "none",
				animLoopSpeed: 1,
				animLoopIntensity: 1,
				animOut: "zoom-out-shrink",
				animOutDuration: 0.18,
			};
		case "slide-up":
			return {
				animIn: "slide-up",
				animInDuration: 0.25,
				animLoop: "none",
				animLoopSpeed: 1,
				animLoopIntensity: 1,
				animOut: "slide-down-out",
				animOutDuration: 0.2,
			};
		case "spin-in":
			return {
				animIn: "spin-in",
				animInDuration: 0.3,
				animLoop: "none",
				animLoopSpeed: 1,
				animLoopIntensity: 1,
				animOut: "fade-out",
				animOutDuration: 0.18,
			};
		case "fade-in":
			return {
				animIn: "fade-in",
				animInDuration: 0.22,
				animLoop: "none",
				animLoopSpeed: 1,
				animLoopIntensity: 1,
				animOut: "fade-out",
				animOutDuration: 0.22,
			};
		case "pulse-beat":
			return {
				animIn: "zoom-in-pop",
				animInDuration: 0.22,
				animLoop: "pulse-beat",
				animLoopSpeed: 1.2,
				animLoopIntensity: 1.1,
				animOut: "fade-out",
				animOutDuration: 0.18,
			};
		case "float-hover":
			return {
				animIn: "fade-in",
				animInDuration: 0.22,
				animLoop: "float-hover",
				animLoopSpeed: 1.0,
				animLoopIntensity: 1.0,
				animOut: "fade-out",
				animOutDuration: 0.18,
			};
		case "shake-handheld":
			return {
				animIn: "zoom-in-pop",
				animInDuration: 0.2,
				animLoop: "shake-handheld",
				animLoopSpeed: 1.3,
				animLoopIntensity: 1.15,
				animOut: "fade-out",
				animOutDuration: 0.16,
			};
		case "none":
			return {
				animIn: "none",
				animInDuration: 0.2,
				animLoop: "none",
				animLoopSpeed: 1,
				animLoopIntensity: 1,
				animOut: "none",
				animOutDuration: 0.15,
			};
	}
}

function inferBackgroundMode(preset: CaptionStylePreset): SubtitleBackgroundMode {
	if (!preset.backgroundEnabled) return "none";
	const bg = preset.backgroundColor.trim().toLowerCase();
	if (
		bg === "#ffffff" ||
		bg === "#fff" ||
		bg === "#f8fafc" ||
		bg.startsWith("rgba(255")
	) {
		return "white";
	}
	if (
		bg === "#000000" ||
		bg === "#000" ||
		bg === "#090d16" ||
		bg.startsWith("rgba(0") ||
		bg.startsWith("rgba(9")
	) {
		return "black";
	}
	return "custom";
}

function isLightHex(color: string): boolean {
	const clean = color.replace(/^#/, "").trim();
	if (clean.length < 6) return true;
	const r = parseInt(clean.slice(0, 2), 16) || 0;
	const g = parseInt(clean.slice(2, 4), 16) || 0;
	const b = parseInt(clean.slice(4, 6), 16) || 0;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.6;
}

export function resolveContrastPlateColor(style: CaptionStylePreset): "black" | "white" {
	if (style.backgroundEnabled) {
		return isLightHex(style.backgroundColor) ? "black" : "white";
	}
	return isLightHex(style.color) ? "black" : "white";
}

interface SubtitleStyleStore {
	activePresetId: string;
	style: CaptionStylePreset;
	verticalAlign: "top" | "middle" | "bottom";
	backgroundMode: SubtitleBackgroundMode;
	previewBackdrop: SubtitlePreviewBackdrop;
	sampleText: string;
	stickerBorderColor: StickerBorderColor;
	overlayImageAnimation: OverlayImageAnimationPreset;
	selectPreset: (presetId: string) => CaptionStylePreset;
	updateStyle: (patch: Partial<CaptionStylePreset>) => CaptionStylePreset;
	setBackgroundMode: (mode: SubtitleBackgroundMode) => CaptionStylePreset;
	setVerticalAlign: (align: "top" | "middle" | "bottom") => void;
	setPreviewBackdrop: (backdrop: SubtitlePreviewBackdrop) => void;
	setSampleText: (text: string) => void;
	setStickerBorderColor: (border: StickerBorderColor) => void;
	setOverlayImageAnimation: (anim: OverlayImageAnimationPreset) => void;
}

const DEFAULT_PRESET = CAPTION_STYLE_PRESETS[0]!;

export const useSubtitleStyleStore = create<SubtitleStyleStore>((set, get) => ({
	activePresetId: DEFAULT_PRESET.id,
	style: { ...DEFAULT_PRESET },
	verticalAlign: "bottom",
	backgroundMode: inferBackgroundMode(DEFAULT_PRESET),
	previewBackdrop: "video",
	sampleText: "Así se ven tus subtítulos en vivo 🔥",
	stickerBorderColor: "white",
	overlayImageAnimation: "zoom-in-pop",

	selectPreset: (presetId) => {
		const found =
			CAPTION_STYLE_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_PRESET;
		const nextStyle: CaptionStylePreset = { ...found };
		const bgMode = inferBackgroundMode(nextStyle);
		set({
			activePresetId: found.id,
			style: nextStyle,
			backgroundMode: bgMode,
		});
		return nextStyle;
	},

	updateStyle: (patch) => {
		const current = get().style;
		const nextStyle: CaptionStylePreset = {
			...current,
			...patch,
		};
		const bgMode = inferBackgroundMode(nextStyle);
		set({
			style: nextStyle,
			backgroundMode: bgMode,
		});
		return nextStyle;
	},

	setBackgroundMode: (mode) => {
		const current = get().style;
		let nextStyle: CaptionStylePreset;
		if (mode === "none") {
			nextStyle = {
				...current,
				backgroundEnabled: false,
				karaokeMode: "highlight",
				color:
					current.color === "#09090b" || current.color === "#000000"
						? "#ffffff"
						: current.color,
				strokeWidth: current.strokeWidth === 0 ? 5 : current.strokeWidth,
			};
		} else if (mode === "black") {
			nextStyle = {
				...current,
				backgroundEnabled: true,
				backgroundColor: "#000000",
				color:
					current.color === "#09090b" || current.color === "#000000"
						? "#ffffff"
						: current.color,
				strokeWidth: 0,
			};
		} else if (mode === "white") {
			nextStyle = {
				...current,
				backgroundEnabled: true,
				backgroundColor: "#ffffff",
				color:
					current.color.toLowerCase() === "#ffffff"
						? "#09090b"
						: current.color,
				strokeWidth: 0,
			};
		} else {
			nextStyle = {
				...current,
				backgroundEnabled: true,
			};
		}
		set({
			style: nextStyle,
			backgroundMode: mode,
		});
		return nextStyle;
	},

	setVerticalAlign: (align) => set({ verticalAlign: align }),
	setPreviewBackdrop: (backdrop) => set({ previewBackdrop: backdrop }),
	setSampleText: (text) => set({ sampleText: text }),
	setStickerBorderColor: (border) => set({ stickerBorderColor: border }),
	setOverlayImageAnimation: (anim) => set({ overlayImageAnimation: anim }),
}));
