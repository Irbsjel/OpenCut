"use client";

import { useEffect, useMemo, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import {
	MODERN_FONTS_2026,
	MODERN_FONT_CATEGORIES,
	ensureModernFontsStylesheet,
	notifyFontLoaded,
	type ModernFontCategory,
} from "@/fonts/modern-fonts-2026";
import { loadFullFont } from "@/fonts/google-fonts";
import {
	LETTER_ANIMATION_OPTIONS,
	type LetterAnimationStyle,
} from "@/text/letter-animation";
import { ClipAnimationTab } from "@/animation/components/clip-animation-tab";
import type { VisualElement } from "@/timeline";
import { Sparkles, Type, Wand2, Play } from "lucide-react";
import { cn } from "@/utils/ui";

interface KineticTextPreset {
	id: string;
	title: string;
	badge: string;
	sampleText: string;
	fontFamily: string;
	fontSize: number;
	fontWeight: "normal" | "bold";
	color: string;
	letterAnimation: LetterAnimationStyle;
	letterAnimationSpeed: number;
	letterAnimationIntensity: number;
	letterAnimationColor: string;
	bgEnabled: boolean;
	bgColor: string;
	bgRadius: number;
	letterSpacing?: number;
}

const KINETIC_TEXT_PRESETS_2026: ReadonlyArray<KineticTextPreset> = [
	{
		id: "viral-pop-capcut",
		title: "Hook Viral CapCut",
		badge: "Viral #1",
		sampleText: "¡ATENCIÓN EN 3 SEGUNDOS!",
		fontFamily: "Anton",
		fontSize: 9,
		fontWeight: "bold",
		color: "#facc15",
		letterAnimation: "pop-cascade",
		letterAnimationSpeed: 1.2,
		letterAnimationIntensity: 1.25,
		letterAnimationColor: "#facc15",
		bgEnabled: true,
		bgColor: "#090d16",
		bgRadius: 18,
		letterSpacing: 1,
	},
	{
		id: "reels-karaoke-2026",
		title: "Karaoke Reels Pro",
		badge: "Retención",
		sampleText: "SUBTÍTULOS DINÁMICOS EN VIVO",
		fontFamily: "Montserrat",
		fontSize: 8,
		fontWeight: "bold",
		color: "#ffffff",
		letterAnimation: "word-karaoke",
		letterAnimationSpeed: 1.1,
		letterAnimationIntensity: 1.15,
		letterAnimationColor: "#facc15",
		bgEnabled: true,
		bgColor: "#0f172a",
		bgRadius: 16,
	},
	{
		id: "futuro-2027-neon",
		title: "Futuro 2027 Neón",
		badge: "2027 Sci-Fi",
		sampleText: "SINAPSIS AI 2027",
		fontFamily: "Unbounded",
		fontSize: 8,
		fontWeight: "bold",
		color: "#e0f2fe",
		letterAnimation: "neon-pulse",
		letterAnimationSpeed: 1.2,
		letterAnimationIntensity: 1.3,
		letterAnimationColor: "#38bdf8",
		bgEnabled: true,
		bgColor: "#061326",
		bgRadius: 20,
		letterSpacing: 1.5,
	},
	{
		id: "cyber-glitch-rgb",
		title: "Cyberpunk Glitch RGB",
		badge: "Cyber 2027",
		sampleText: "SISTEMA NEURAL ACTIVO",
		fontFamily: "Orbitron",
		fontSize: 8,
		fontWeight: "bold",
		color: "#ffffff",
		letterAnimation: "glitch-cyber",
		letterAnimationSpeed: 1.3,
		letterAnimationIntensity: 1.2,
		letterAnimationColor: "#00f0ff",
		bgEnabled: true,
		bgColor: "#090a10",
		bgRadius: 12,
		letterSpacing: 2,
	},
	{
		id: "editorial-luxury-2027",
		title: "Editorial Lujo 2027",
		badge: "Editorial",
		sampleText: "La Belleza del Cosmos",
		fontFamily: "Instrument Serif",
		fontSize: 10,
		fontWeight: "normal",
		color: "#f8fafc",
		letterAnimation: "slide-up-reveal",
		letterAnimationSpeed: 1.0,
		letterAnimationIntensity: 1.0,
		letterAnimationColor: "#e2e8f0",
		bgEnabled: false,
		bgColor: "#000000",
		bgRadius: 0,
	},
	{
		id: "hud-typewriter-ai",
		title: "Terminal HUD Láser",
		badge: "Tech Code",
		sampleText: "T+00:01:24 // TELEMETRÍA OK",
		fontFamily: "JetBrains Mono",
		fontSize: 7,
		fontWeight: "bold",
		color: "#4ade80",
		letterAnimation: "typewriter-pro",
		letterAnimationSpeed: 1.25,
		letterAnimationIntensity: 1.0,
		letterAnimationColor: "#4ade80",
		bgEnabled: true,
		bgColor: "#051b11",
		bgRadius: 12,
	},
	{
		id: "syne-kinetic-wave",
		title: "Ola Cinética Syne",
		badge: "Vanguardia",
		sampleText: "MOVIMIENTO ARMÓNICO",
		fontFamily: "Syne",
		fontSize: 8,
		fontWeight: "bold",
		color: "#fda4af",
		letterAnimation: "wave-kinetic",
		letterAnimationSpeed: 1.15,
		letterAnimationIntensity: 1.1,
		letterAnimationColor: "#fb7185",
		bgEnabled: true,
		bgColor: "#1f0916",
		bgRadius: 22,
	},
	{
		id: "epic-cinema-converge",
		title: "Tráiler Épico Orbital",
		badge: "Cine 4K",
		sampleText: "EL ORIGEN DEL UNIVERSO",
		fontFamily: "Cinzel",
		fontSize: 8,
		fontWeight: "bold",
		color: "#fef08a",
		letterAnimation: "scatter-converge",
		letterAnimationSpeed: 0.95,
		letterAnimationIntensity: 1.15,
		letterAnimationColor: "#facc15",
		bgEnabled: true,
		bgColor: "#141109",
		bgRadius: 14,
		letterSpacing: 2.5,
	},
];

export function TextView() {
	const editor = useEditor();
	useEditor(
		(e) =>
			e.timeline.getPreviewTracks() ?? e.scenes.getActiveSceneOrNull()?.tracks,
	);
	const [activeTab, setActiveTab] = useState<
		"presets" | "animations" | "fonts"
	>("presets");
	const [fontCategory, setFontCategory] = useState<ModernFontCategory>("all");

	useEffect(() => {
		ensureModernFontsStylesheet();
	}, []);

	const filteredFonts = useMemo(() => {
		if (fontCategory === "all") return MODERN_FONTS_2026;
		return MODERN_FONTS_2026.filter((f) => f.category === fontCategory);
	}, [fontCategory]);

	const getSelectedOrFirstTextElement = () => {
		const selected = editor.selection.getSelectedElements();
		const withTracks = editor.timeline.getElementsWithTracks({
			elements: selected,
		});
		const selectedText = withTracks.find(
			({ element }) => element.type === "text",
		);
		if (selectedText) return selectedText;

		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) return null;
		for (const track of scene.tracks.overlay) {
			if (track.type === "text" && track.elements.length > 0) {
				return { track, element: track.elements[0] };
			}
		}
		return null;
	};

	const handleInsertPreset = async (preset: KineticTextPreset) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		loadFullFont({ family: preset.fontFamily, weights: [400, 700, 800] })
			.then(() => notifyFontLoaded())
			.catch(() => {});

		const currentTime = editor.playback.getCurrentTime();
		const existing = getSelectedOrFirstTextElement();

		if (existing) {
			editor.timeline.updateElements({
				updates: [
					{
						trackId: existing.track.id,
						elementId: existing.element.id,
						patch: {
							params: {
								...existing.element.params,
								fontFamily: preset.fontFamily,
								fontSize: preset.fontSize,
								fontWeight: preset.fontWeight,
								color: preset.color,
								letterAnimation: preset.letterAnimation,
								letterAnimationSpeed: preset.letterAnimationSpeed,
								letterAnimationIntensity: preset.letterAnimationIntensity,
								letterAnimationColor: preset.letterAnimationColor,
								letterSpacing: preset.letterSpacing ?? 0,
								"background.enabled": preset.bgEnabled,
								"background.color": preset.bgColor,
								"background.cornerRadius": preset.bgRadius,
							},
						},
					},
				],
			});
			editor.selection.setSelectedElements({
				elements: [
					{ trackId: existing.track.id, elementId: existing.element.id },
				],
			});
			return;
		}

		const element = buildTextElement({
			raw: {
				...DEFAULTS.text.element,
				name: preset.title,
				params: {
					...DEFAULTS.text.element.params,
					content: preset.sampleText,
					fontFamily: preset.fontFamily,
					fontSize: preset.fontSize,
					fontWeight: preset.fontWeight,
					color: preset.color,
					letterAnimation: preset.letterAnimation,
					letterAnimationSpeed: preset.letterAnimationSpeed,
					letterAnimationIntensity: preset.letterAnimationIntensity,
					letterAnimationColor: preset.letterAnimationColor,
					letterSpacing: preset.letterSpacing ?? 0,
					"background.enabled": preset.bgEnabled,
					"background.color": preset.bgColor,
					"background.cornerRadius": preset.bgRadius,
					"transform.positionY": 280,
				},
			},
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto", trackType: "text" },
		});
	};

	const handleApplyAnimation = (style: LetterAnimationStyle) => {
		const target = getSelectedOrFirstTextElement();
		if (!target) {
			handleInsertPreset({
				...KINETIC_TEXT_PRESETS_2026[0],
				letterAnimation: style,
			});
			return;
		}

		editor.timeline.updateElements({
			updates: [
				{
					trackId: target.track.id,
					elementId: target.element.id,
					patch: {
						params: {
							...target.element.params,
							letterAnimation: style,
						},
					},
				},
			],
		});
		editor.selection.setSelectedElements({
			elements: [{ trackId: target.track.id, elementId: target.element.id }],
		});
	};

	const handleApplyFont = (family: string, weights: number[]) => {
		loadFullFont({ family, weights })
			.then(() => notifyFontLoaded())
			.catch(() => {});

		const target = getSelectedOrFirstTextElement();
		if (!target) {
			handleInsertPreset({
				...KINETIC_TEXT_PRESETS_2026[0],
				fontFamily: family,
			});
			return;
		}

		editor.timeline.updateElements({
			updates: [
				{
					trackId: target.track.id,
					elementId: target.element.id,
					patch: {
						params: {
							...target.element.params,
							fontFamily: family,
						},
					},
				},
			],
		});
		editor.selection.setSelectedElements({
			elements: [{ trackId: target.track.id, elementId: target.element.id }],
		});
	};

	const handleAddNewText = () => {
		const currentTime = editor.playback.getCurrentTime();
		const element = buildTextElement({
			raw: {
				...DEFAULTS.text.element,
				name: "Texto 2026",
				params: {
					...DEFAULTS.text.element.params,
					content: "TEXTO EN VIVO 2026",
					fontFamily: "Montserrat",
					fontSize: 8,
					fontWeight: "bold",
					letterAnimation: "pop-cascade",
					"background.enabled": true,
					"background.color": "#0f172a",
					"background.cornerRadius": 14,
					"transform.positionY": 280,
				},
			},
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto", trackType: "text" },
		});
	};

	const getSelectedVisualElement = (): {
		track: { id: string };
		element: VisualElement;
	} | null => {
		const selected = editor.selection.getSelectedElements();
		const withTracks = editor.timeline.getElementsWithTracks({
			elements: selected,
		});
		const selectedVisual = withTracks.find(
			({ element }) => element.type !== "audio" && element.type !== "effect",
		);
		if (selectedVisual) {
			return {
				track: selectedVisual.track,
				element: selectedVisual.element as VisualElement,
			};
		}
		const fallbackText = getSelectedOrFirstTextElement();
		if (fallbackText) {
			return {
				track: fallbackText.track,
				element: fallbackText.element as VisualElement,
			};
		}
		const scene = editor.scenes.getActiveSceneOrNull();
		if (scene && scene.tracks.main.elements.length > 0) {
			return {
				track: scene.tracks.main,
				element: scene.tracks.main.elements[0] as VisualElement,
			};
		}
		return null;
	};

	const activeVisualTarget = getSelectedVisualElement();

	return (
		<PanelView title="Tipografía & Animación 2026–2027">
			<div className="flex flex-col gap-3 pb-4">
				<button
					type="button"
					onClick={handleAddNewText}
					className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow-md transition hover:brightness-110"
				>
					<Type className="size-3.5" />
					+ Agregar Capa de Texto 2026
				</button>

				<div className="grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
					<button
						type="button"
						onClick={() => setActiveTab("presets")}
						className={cn(
							"flex cursor-pointer items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition",
							activeTab === "presets"
								? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
								: "text-slate-400 hover:text-white",
						)}
					>
						<Sparkles className="size-3" />
						Estilos
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("animations")}
						className={cn(
							"flex cursor-pointer items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition",
							activeTab === "animations"
								? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
								: "text-slate-400 hover:text-white",
						)}
					>
						<Wand2 className="size-3" />
						In / Bucle / Out
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("fonts")}
						className={cn(
							"flex cursor-pointer items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition",
							activeTab === "fonts"
								? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
								: "text-slate-400 hover:text-white",
						)}
					>
						<Type className="size-3" />
						Fuentes 26/27
					</button>
				</div>

				{activeTab === "presets" && (
					<div className="grid grid-cols-1 gap-2">
						{KINETIC_TEXT_PRESETS_2026.map((preset) => (
							<button
								key={preset.id}
								type="button"
								onClick={() => handleInsertPreset(preset)}
								className="group flex cursor-pointer flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left transition hover:border-sky-500/40 hover:bg-sky-500/10"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="text-xs font-semibold text-white">
										{preset.title}
									</span>
									<span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
										{preset.badge}
									</span>
								</div>
								<div
									className="truncate rounded-md px-2.5 py-1.5 text-sm"
									style={{
										fontFamily: `"${preset.fontFamily}", sans-serif`,
										fontWeight: preset.fontWeight === "bold" ? 700 : 400,
										color: preset.color,
										backgroundColor: preset.bgEnabled
											? preset.bgColor
											: "rgba(15,23,42,0.5)",
									}}
								>
									{preset.sampleText}
								</div>
								<div className="flex items-center justify-between text-[10px] text-slate-400">
									<span>Fuente: {preset.fontFamily}</span>
									<span className="text-sky-400 group-hover:underline">
										Aplicar al texto →
									</span>
								</div>
							</button>
						))}
					</div>
				)}

				{activeTab === "animations" && (
					<div className="-mx-2">
						{activeVisualTarget ? (
							<ClipAnimationTab
								element={activeVisualTarget.element}
								trackId={activeVisualTarget.track.id}
							/>
						) : (
							<div className="flex flex-col gap-1.5 px-2">
								{LETTER_ANIMATION_OPTIONS.map((anim) => (
									<button
										key={anim.value}
										type="button"
										onClick={() => handleApplyAnimation(anim.value)}
										className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-sky-500/40 hover:bg-sky-500/10"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<Play className="size-3 shrink-0 text-sky-400" />
												<span className="truncate text-xs font-semibold text-white">
													{anim.label}
												</span>
											</div>
											<p className="mt-0.5 truncate text-[10px] text-slate-400">
												{anim.description}
											</p>
										</div>
										<span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
											{anim.badge}
										</span>
									</button>
								))}
							</div>
						)}
					</div>
				)}

				{activeTab === "fonts" && (
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-1">
							{MODERN_FONT_CATEGORIES.map((cat) => (
								<button
									key={cat.key}
									type="button"
									onClick={() => setFontCategory(cat.key)}
									className={cn(
										"cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-medium transition",
										fontCategory === cat.key
											? "bg-sky-500 text-slate-950 font-semibold"
											: "bg-white/5 text-slate-300 hover:bg-white/10",
									)}
								>
									{cat.label}
								</button>
							))}
						</div>
						<div className="flex flex-col gap-1.5">
							{filteredFonts.map((font) => (
								<button
									key={font.family}
									type="button"
									onClick={() => handleApplyFont(font.family, font.weights)}
									className="flex cursor-pointer flex-col gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-sky-500/40 hover:bg-sky-500/10"
								>
									<div className="flex items-center justify-between gap-2">
										<span
											className="truncate text-sm text-white"
											style={{
												fontFamily: `"${font.family}", sans-serif`,
												fontWeight: font.weights.includes(700) ? 700 : 400,
											}}
										>
											{font.family}
										</span>
										<span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
											{font.badge}
										</span>
									</div>
									<span className="truncate text-[10px] text-slate-400">
										{font.description}
									</span>
								</button>
							))}
						</div>
					</div>
				)}
			</div>
		</PanelView>
	);
}
