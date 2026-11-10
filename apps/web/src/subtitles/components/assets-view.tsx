"use client";

import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { FontPicker } from "@/components/ui/font-picker";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { extractTimelineAudio } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/transcription/types";
import {
	transcriptionService,
	type TimelineClipDescriptor,
} from "@/services/transcription/service";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile, type SubtitleCue } from "@/subtitles/parse";
import {
	downloadSubtitleFile,
	type SubtitleExportFormat,
} from "@/subtitles/export";
import {
	CAPTION_STYLE_PRESETS,
	MEME_CATALOG,
	buildSmartCaptionChunks,
	detectContextualMemesWithSinaiAI,
	generateContextualAIImageFile,
	generateContextualMemeFile,
	generateContextualVisualCardFile,
	getSuggestedEmojisForText,
	getSuggestedMemesForText,
	processCustomOverlayImageFile,
	searchMemesCatalog,
	stripTrailingEmoji,
	toggleEmojiOnText,
	type CaptionPacingMode,
	type CaptionStylePreset,
} from "@/subtitles/contextual-enrichment";
import {
	resolveContrastPlateColor,
	resolveOverlayAnimationParams,
	useSubtitleStyleStore,
	type OverlayImageAnimationPreset,
	type StickerBorderColor,
	type SubtitleBackgroundMode,
} from "@/subtitles/style-store";
import { buildSubtitleTextElement } from "@/subtitles/build-subtitle-text-element";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { videoCache } from "@/services/video-cache/service";
import { Spinner } from "@/components/ui/spinner";
import {
	CloudUploadIcon,
	Delete02Icon,
	Download04Icon,
	Happy01Icon,
	Image01Icon,
	Link02Icon,
	PlusSignIcon,
	ScissorIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
} from "@/wasm";
import type { TextElement, TimelineElement, TimelineTrack } from "@/timeline";
import {
	AddTrackCommand,
	InsertElementCommand,
	BatchCommand,
	DeleteElementsCommand,
	UpdateElementsCommand,
} from "@/commands";
import { toast } from "sonner";
import { cn } from "@/utils/ui";

type AudioCaptureSource = "timeline" | "clip" | "mic";

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable opencut/prefer-object-params */

function formatShortTime(seconds: number): string {
	const safe = Math.max(0, seconds);
	const mins = Math.floor(safe / 60);
	const secs = safe % 60;
	return `${String(mins).padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
}

interface TimelineSubtitleItem {
	trackId: string;
	element: TextElement;
	startTimeSec: number;
	durationSec: number;
	endTimeSec: number;
	content: string;
}

function collectTimelineClipDescriptors(
	tracks: {
		main: TimelineTrack;
		overlay: TimelineTrack[];
		audio: TimelineTrack[];
	},
	includeMuted = false,
): TimelineClipDescriptor[] {
	const allTracks: TimelineTrack[] = [
		...tracks.audio,
		tracks.main,
		...tracks.overlay,
	];
	const descriptors: TimelineClipDescriptor[] = [];

	for (const track of allTracks) {
		if (!includeMuted && "muted" in track && track.muted) continue;
		for (const element of track.elements) {
			if (element.type !== "audio" && element.type !== "video") continue;
			if (!includeMuted && "muted" in element && element.muted) continue;
			if (!("mediaId" in element) || !element.mediaId) continue;

			const startTimeSec = mediaTimeToSeconds({ time: element.startTime });
			const durationSec = mediaTimeToSeconds({ time: element.duration });
			const trimStartSec = mediaTimeToSeconds({ time: element.trimStart });
			if (durationSec <= 0.05) continue;

			descriptors.push({
				mediaId: element.mediaId,
				trackType: element.type === "audio" ? "audio" : "video",
				startTimeSec,
				durationSec,
				trimStartSec,
			});
		}
	}

	return descriptors;
}

function normalizeHexForPicker(color: string, fallback = "FFFFFF"): string {
	const cleaned = color.trim().replace(/^#/, "");
	if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(cleaned)) {
		return cleaned.toUpperCase();
	}
	if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
		return cleaned
			.split("")
			.map((c) => c + c)
			.join("")
			.toUpperCase();
	}
	return fallback;
}

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [captureSource, setCaptureSource] =
		useState<AudioCaptureSource>("timeline");
	const [pacing, setPacing] = useState<CaptionPacingMode>("balanced");
	const [autoEmojis, setAutoEmojis] = useState<boolean>(false);
	const [autoMemes, setAutoMemes] = useState<boolean>(true);
	const [memeSearchQuery, setMemeSearchQuery] = useState<string>("");
	const [isRecordingMic, setIsRecordingMic] = useState(false);
	const [busyCueId, setBusyCueId] = useState<string | null>(null);

	const {
		activePresetId,
		style: activeStyle,
		verticalAlign,
		backgroundMode,
		stickerBorderColor,
		overlayImageAnimation,
		selectPreset,
		updateStyle,
		setBackgroundMode,
		setVerticalAlign,
		setStickerBorderColor,
		setOverlayImageAnimation,
	} = useSubtitleStyleStore();

	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const customImageInputRef = useRef<HTMLInputElement>(null);
	const [pendingImageCue, setPendingImageCue] =
		useState<TimelineSubtitleItem | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);

	const editor = useEditor();
	const activeScene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const currentTimeTicks = useEditor((e) => e.playback.getCurrentTime());
	const selectedRefs = useEditor((e) => e.selection.getSelectedElements());
	const currentTimeSec = mediaTimeToSeconds({ time: currentTimeTicks });

	const isProcessing = processing.status === "processing";

	const timelineSubtitles = useMemo<TimelineSubtitleItem[]>(() => {
		if (!activeScene?.tracks?.overlay) return [];
		const items: TimelineSubtitleItem[] = [];
		for (const track of activeScene.tracks.overlay) {
			if (track.type !== "text") continue;
			for (const el of track.elements) {
				if (el.type !== "text") continue;
				// Strictly only include subtitle elements, never pre-existing title/text overlays
				if (el.params?.isSubtitle !== true) continue;
				const startSec = mediaTimeToSeconds({ time: el.startTime });
				const durSec = mediaTimeToSeconds({ time: el.duration });
				items.push({
					trackId: track.id,
					element: el,
					startTimeSec: startSec,
					durationSec: durSec,
					endTimeSec: startSec + durSec,
					content: String(el.params.content ?? ""),
				});
			}
		}
		items.sort((a, b) => a.startTimeSec - b.startTimeSec);
		return items;
	}, [activeScene]);

	const selectedSubtitleItems = useMemo(() => {
		if (selectedRefs.length === 0) return [];
		const selectedIdSet = new Set(selectedRefs.map((r) => r.elementId));
		return timelineSubtitles.filter((item) =>
			selectedIdSet.has(item.element.id),
		);
	}, [selectedRefs, timelineSubtitles]);

	const applyStyleToItems = useCallback(
		(
			targetItems: TimelineSubtitleItem[],
			nextStyle: CaptionStylePreset,
			align = verticalAlign,
		) => {
			if (targetItems.length === 0) return;

			const canvasSize = editor.project.getActive().settings.canvasSize;
			const targetY =
				align === "top"
					? -canvasSize.height * 0.36
					: align === "middle"
						? 0
						: canvasSize.height * 0.34;

			const updates = targetItems.map((item) => ({
				trackId: item.trackId,
				elementId: item.element.id,
				patch: {
					params: {
						...item.element.params,
						fontFamily: nextStyle.fontFamily,
						fontSize: nextStyle.fontSize,
						fontWeight: nextStyle.fontWeight,
						color: nextStyle.color,
						"background.enabled": nextStyle.backgroundEnabled,
						"background.color": nextStyle.backgroundColor,
						"background.cornerRadius": nextStyle.cornerRadius,
						"background.paddingX": nextStyle.paddingX,
						"background.paddingY": nextStyle.paddingY,
						"transform.positionY": targetY,
						presetId: nextStyle.id,
						strokeWidth: nextStyle.strokeWidth,
						strokeColor: nextStyle.strokeColor,
						shadowBlur: nextStyle.shadowBlur,
						shadowColor: nextStyle.shadowColor,
						karaokeMode:
							nextStyle.karaokeMode ??
							(nextStyle.id === "karaoke-pill" ? "pill" : "highlight"),
						letterAnimationColor: nextStyle.accentColor,
						letterAnimation: nextStyle.letterAnimation,
						animIn: nextStyle.animIn,
						animInDuration: nextStyle.animInDuration,
						animLoop: nextStyle.animLoop,
						animLoopSpeed: nextStyle.animLoopSpeed,
						animLoopIntensity: nextStyle.animLoopIntensity,
						animOut: nextStyle.animOut,
						animOutDuration: nextStyle.animOutDuration,
					},
				},
			}));
			editor.timeline.updateElements({ updates });
		},
		[editor, verticalAlign],
	);

	const handleSelectPreset = useCallback(
		(presetId: string) => {
			const nextStyle = selectPreset(presetId);
			const targets =
				selectedSubtitleItems.length > 0
					? selectedSubtitleItems
					: timelineSubtitles;
			if (targets.length > 0) {
				applyStyleToItems(targets, nextStyle, verticalAlign);
			}
		},
		[
			selectPreset,
			selectedSubtitleItems,
			timelineSubtitles,
			applyStyleToItems,
			verticalAlign,
		],
	);

	const handleStylePatch = useCallback(
		(patch: Partial<CaptionStylePreset>) => {
			const nextStyle = updateStyle(patch);
			const targets =
				selectedSubtitleItems.length > 0
					? selectedSubtitleItems
					: timelineSubtitles;
			if (targets.length > 0) {
				applyStyleToItems(targets, nextStyle, verticalAlign);
			}
		},
		[
			updateStyle,
			selectedSubtitleItems,
			timelineSubtitles,
			applyStyleToItems,
			verticalAlign,
		],
	);

	const handleBackgroundModeChange = useCallback(
		(mode: SubtitleBackgroundMode) => {
			const nextStyle = setBackgroundMode(mode);
			const targets =
				selectedSubtitleItems.length > 0
					? selectedSubtitleItems
					: timelineSubtitles;
			if (targets.length > 0) {
				applyStyleToItems(targets, nextStyle, verticalAlign);
			}
		},
		[
			setBackgroundMode,
			selectedSubtitleItems,
			timelineSubtitles,
			applyStyleToItems,
			verticalAlign,
		],
	);

	const handleVerticalAlignChange = (align: "top" | "middle" | "bottom") => {
		setVerticalAlign(align);
		const targets =
			selectedSubtitleItems.length > 0
				? selectedSubtitleItems
				: timelineSubtitles;
		if (targets.length > 0) {
			applyStyleToItems(targets, activeStyle, align);
		}
	};

	const handleOverlayImageAnimationChange = useCallback(
		(nextAnim: OverlayImageAnimationPreset) => {
			setOverlayImageAnimation(nextAnim);
			const animParams = resolveOverlayAnimationParams(nextAnim);
			const scene = editor.scenes.getActiveSceneOrNull();
			if (!scene?.tracks?.overlay) return;
			const updates: Array<{
				trackId: string;
				elementId: string;
				patch: Partial<TimelineElement>;
			}> = [];
			for (const track of scene.tracks.overlay) {
				for (const el of track.elements) {
					if (
						el.type === "image" &&
						typeof el.name === "string" &&
						(el.name.startsWith("Meme ·") ||
							el.name.startsWith("Meme IA ·") ||
							el.name.startsWith("Imagen IA ·") ||
							el.name.startsWith("Sticker ·") ||
							el.params?.isSubtitleOverlay === true)
					) {
						updates.push({
							trackId: track.id,
							elementId: el.id,
							patch: {
								params: {
									...el.params,
									...animParams,
								},
							} as Partial<TimelineElement>,
						});
					}
				}
			}
			if (updates.length > 0) {
				editor.timeline.updateElements({ updates });
				toast.success(
					`Animación actualizada en ${updates.length} imágenes/memes`,
				);
			}
		},
		[editor, setOverlayImageAnimation],
	);

	const handlePacingChange = useCallback(
		(nextPacing: CaptionPacingMode) => {
			setPacing(nextPacing);
			if (timelineSubtitles.length === 0) return;

			// Reconstruct words from existing subtitle elements and update them in-place on the same track
			const segments = timelineSubtitles.map((item) => {
				let words: Array<{ word: string; start: number; end: number }> | undefined;
				const rawWT = item.element.params?.wordTimings;
				if (typeof rawWT === "string" && rawWT.startsWith("[")) {
					try {
						const parsed = JSON.parse(rawWT) as Array<{
							word: string;
							startOffset: number;
							endOffset: number;
						}>;
						words = parsed.map((w) => ({
							word: w.word,
							start: item.startTimeSec + w.startOffset,
							end: item.startTimeSec + w.endOffset,
						}));
					} catch {
						words = undefined;
					}
				}
				return {
					text: stripTrailingEmoji(item.content),
					start: item.startTimeSec,
					end: item.endTimeSec,
					words,
				};
			});

			const rechunked = buildSmartCaptionChunks({
				segments,
				pacing: nextPacing,
				autoEmojis,
				timeOffsetSeconds: 0,
			});

			if (rechunked.length > 0) {
				insertCaptionChunksAsTextTrack({
					editor,
					captions: rechunked,
					preset: activeStyle,
					verticalAlign,
					replaceExisting: true,
				});
			}
		},
		[timelineSubtitles, autoEmojis, editor, activeStyle, verticalAlign],
	);

	const handleApplyStyleToAllSubtitles = useCallback(() => {
		if (timelineSubtitles.length === 0) return;
		applyStyleToItems(timelineSubtitles, activeStyle, verticalAlign);
		toast.success(`Style applied to ${timelineSubtitles.length} captions`);
	}, [timelineSubtitles, applyStyleToItems, activeStyle, verticalAlign]);

	const handleProgress = useCallback((progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: `Loading model ${Math.round(progress.progress)}%`,
			});
		} else if (progress.status === "transcribing") {
			dispatch({
				type: "update_step",
				step: progress.message || "Transcribing...",
			});
		}
	}, []);

	const insertCaptions = useCallback(
		({ captions }: { captions: SubtitleCue[] }): boolean => {
			const trackId = insertCaptionChunksAsTextTrack({
				editor,
				captions,
				preset: activeStyle,
				verticalAlign,
			});
			return trackId !== null;
		},
		[editor, activeStyle, verticalAlign],
	);

	const clearExistingAutoSubtitles = useCallback(() => {
		const existingAutoSubs = timelineSubtitles.filter(
			(item) => item.element.params?.isSubtitle === true,
		);
		if (existingAutoSubs.length > 0) {
			editor.timeline.deleteElements({
				elements: existingAutoSubs.map((item) => ({
					trackId: item.trackId,
					elementId: item.element.id,
				})),
			});
		}
	}, [editor, timelineSubtitles]);

	const clearExistingAutoMemes = useCallback(() => {
		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene?.tracks) return;
		const toDelete: Array<{ trackId: string; elementId: string }> = [];
		const allTracks = [...(scene.tracks.overlay ?? []), scene.tracks.main];
		for (const track of allTracks) {
			if (!track?.elements) continue;
			for (const el of track.elements) {
				if (
					el.type === "image" &&
					typeof el.name === "string" &&
					(el.name.startsWith("Meme ·") ||
						el.name.startsWith("Meme IA ·") ||
						el.name.startsWith("Sticker ·") ||
						el.params?.isSubtitleOverlay === true)
				) {
					toDelete.push({ trackId: track.id, elementId: el.id });
				}
			}
		}
		if (toDelete.length > 0) {
			editor.timeline.deleteElements({ elements: toDelete });
		}
	}, [editor]);

	const insertContextualOverlayFile = useCallback(
		async ({
			file,
			name,
			startTimeSec,
			durationSec,
			scale = 0.34,
		}: {
			file: File;
			name: string;
			startTimeSec: number;
			durationSec: number;
			scale?: number;
		}) => {
			const proj = editor.project.getActiveOrNull();
			if (!proj) return;
			const processed = await processMediaAssets({ files: [file] });
			const animParams = resolveOverlayAnimationParams(overlayImageAnimation);
			const effectiveDurSec = Math.min(3.2, Math.max(1.5, durationSec));

			for (const assetItem of processed) {
				const saved = await editor.media.addMediaAsset({
					projectId: proj.metadata.id,
					asset: assetItem,
				});
				if (!saved) continue;

				const baseEl = buildElementFromMedia({
					mediaId: saved.id,
					mediaType: saved.type,
					name,
					duration: mediaTimeFromSeconds({
						seconds: effectiveDurSec,
					}),
					startTime: mediaTimeFromSeconds({ seconds: startTimeSec }),
				});

				if (baseEl.type === "image") {
					baseEl.params = {
						...(baseEl.params ?? {}),
						"transform.scaleX": scale,
						"transform.scaleY": scale,
						"transform.positionX": 0,
						"transform.positionY": 0,
						isSubtitleOverlay: true,
						...animParams,
					};
				}

				const scene = editor.scenes.getActiveSceneOrNull();
				const existingMemeTrack = scene?.tracks?.overlay?.find(
					(t) =>
						t.type === "video" &&
						(t.elements.length === 0 ||
							t.elements.every((el) => el.type === "image")),
				);

				if (existingMemeTrack) {
					// If an overlay image already exists at this cue's time window, replace it in-place
					const overlapping = existingMemeTrack.elements.filter((el) => {
						if (el.type !== "image") return false;
						const elStart = mediaTimeToSeconds({ time: el.startTime });
						const elEnd =
							elStart + mediaTimeToSeconds({ time: el.duration });
						return (
							elStart < startTimeSec + effectiveDurSec - 0.08 &&
							elEnd > startTimeSec + 0.08
						);
					});
					if (overlapping.length > 0) {
						editor.timeline.deleteElements({
							elements: overlapping.map((el) => ({
								trackId: existingMemeTrack.id,
								elementId: el.id,
							})),
						});
					}

					editor.timeline.insertElement({
						element: baseEl,
						placement: { mode: "explicit", trackId: existingMemeTrack.id },
					});
				} else {
					const insertIdx = Math.min(
						1,
						scene?.tracks?.overlay?.length ?? 0,
					);
					const addTrackCmd = new AddTrackCommand({
						type: "video",
						index: insertIdx,
					});
					const newTrackId = addTrackCmd.getTrackId();
					const insertCmd = new InsertElementCommand({
						element: baseEl,
						placement: { mode: "explicit", trackId: newTrackId },
					});
					editor.command.execute({
						command: new BatchCommand([addTrackCmd, insertCmd]),
					});
				}
			}
		},
		[editor, overlayImageAnimation],
	);

	const applySinaiMemesToCues = useCallback(
		async (
			cues: Array<{ startTime: number; duration: number; text: string }>,
			replaceOldMemes = true,
		): Promise<{ count: number; firstMemeStartSec: number | null }> => {
			if (cues.length === 0) return { count: 0, firstMemeStartSec: null };
			const placements = await detectContextualMemesWithSinaiAI(
				cues.map((c, index) => ({
					index,
					startTime: c.startTime,
					duration: c.duration,
					text: c.text,
				})),
			);
			if (placements.length === 0) return { count: 0, firstMemeStartSec: null };

			if (replaceOldMemes) {
				clearExistingAutoMemes();
			}

			let inserted = 0;
			let firstMemeStartSec: number | null = null;
			for (const placement of placements) {
				const cue = cues[placement.cueIndex];
				if (!cue) continue;
				try {
					if (placement.kind === "image") {
						const { file, title } = await generateContextualAIImageFile({
							text: cue.text,
							imagePrompt: placement.imagePrompt,
							title: placement.caption,
							index: placement.cueIndex,
							borderColor: stickerBorderColor,
						});
						await insertContextualOverlayFile({
							file,
							name: `Imagen IA · ${title}`,
							startTimeSec: cue.startTime,
							durationSec: Math.min(3.2, Math.max(1.8, cue.duration)),
							scale: 0.34,
						});
					} else {
						const { file, label } = await generateContextualMemeFile({
							text: cue.text,
							memeId: placement.memeId,
							captionOverride: placement.caption,
							index: placement.cueIndex,
							borderColor: stickerBorderColor,
						});
						await insertContextualOverlayFile({
							file,
							name: `Meme IA · ${label}`,
							startTimeSec: cue.startTime,
							durationSec: Math.min(3.0, Math.max(1.6, cue.duration)),
							scale: 0.34,
						});
					}
					if (firstMemeStartSec === null) {
						firstMemeStartSec = cue.startTime;
					}
					inserted++;
				} catch {
					// continue with next placement
				}
			}
			return { count: inserted, firstMemeStartSec };
		},
		[clearExistingAutoMemes, insertContextualOverlayFile, stickerBorderColor],
	);

	const finalizeSegmentsInsert = useCallback(
		async ({
			segments,
			timeOffsetSeconds = 0,
			replaceExisting = false,
		}: {
			segments: { start: number; end: number; text: string }[];
			timeOffsetSeconds?: number;
			replaceExisting?: boolean;
		}) => {
			dispatch({
				type: "update_step",
				step: "Generating captions...",
			});
			const captionChunks = buildSmartCaptionChunks({
				segments,
				pacing,
				autoEmojis,
				timeOffsetSeconds,
			});

			if (captionChunks.length === 0) {
				dispatch({
					type: "fail",
					error: "No speech detected in audio.",
				});
				return false;
			}

			if (replaceExisting) {
				clearExistingAutoSubtitles();
			}

			if (!insertCaptions({ captions: captionChunks })) {
				dispatch({
					type: "fail",
					error: "Failed to insert captions into timeline.",
				});
				return false;
			}

			let memesPlaced = 0;
			let firstMemeSec: number | null = null;
			if (autoMemes) {
				dispatch({
					type: "update_step",
					step: "Detecting contextual memes (Sinaí IA)...",
				});
				const memeRes = await applySinaiMemesToCues(
					captionChunks.map((c) => ({
						startTime: c.startTime,
						duration: c.duration,
						text: c.text,
					})),
					replaceExisting,
				);
				memesPlaced = memeRes.count;
				firstMemeSec = memeRes.firstMemeStartSec;
			}

			const previewTargetSec =
				firstMemeSec !== null
					? firstMemeSec + 0.25
					: (captionChunks[0]?.startTime ?? 0) + 0.2;
			editor.playback.seek({
				time: mediaTimeFromSeconds({ seconds: previewTargetSec }),
			});
			if (typeof document !== "undefined") {
				requestAnimationFrame(() => {
					for (const el of document.querySelectorAll<HTMLElement>(
						".overflow-y-auto, .overflow-auto",
					)) {
						if (el.scrollHeight > el.clientHeight && el.clientWidth > 400) {
							el.scrollTop = 0;
						}
					}
				});
			}

			dispatch({ type: "succeed", warnings: [] });
			toast.success(
				memesPlaced > 0
					? `${captionChunks.length} captions + ${memesPlaced} contextual memes generated`
					: `${captionChunks.length} captions generated`,
			);
			return true;
		},
		[
			editor,
			pacing,
			autoEmojis,
			autoMemes,
			clearExistingAutoSubtitles,
			insertCaptions,
			applySinaiMemesToCues,
		],
	);

	const transcribeBlobAndInsert = useCallback(
		async (
			audioBlob: Blob,
			timeOffsetSeconds = 0,
			replaceExisting = false,
		) => {
			dispatch({ type: "update_step", step: "Transcribing audio..." });
			const result = await transcriptionService.transcribeAudioBlob({
				audioBlob,
				language: selectedLanguage === "auto" ? undefined : selectedLanguage,
				onProgress: handleProgress,
			});

			await finalizeSegmentsInsert({
				segments: result.segments,
				timeOffsetSeconds,
				replaceExisting,
			});
		},
		[selectedLanguage, handleProgress, finalizeSegmentsInsert],
	);

	const handleGenerateTranscript = async () => {
		if (captureSource === "mic") {
			if (isRecordingMic && mediaRecorderRef.current) {
				mediaRecorderRef.current.stop();
				setIsRecordingMic(false);
				return;
			}
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: true,
				});
				recordedChunksRef.current = [];
				const recorder = new MediaRecorder(stream);
				mediaRecorderRef.current = recorder;
				recorder.ondataavailable = (ev) => {
					if (ev.data && ev.data.size > 0) {
						recordedChunksRef.current.push(ev.data);
					}
				};
				recorder.onstop = async () => {
					for (const track of stream.getTracks()) {
						track.stop();
					}
					const blob = new Blob(recordedChunksRef.current, {
						type: recorder.mimeType || "audio/webm",
					});
					if (blob.size < 100) {
						dispatch({
							type: "fail",
							error: "Recording is too short.",
						});
						return;
					}
					dispatch({
						type: "start",
						step: "Processing voice recording...",
					});
					try {
						const startSec = mediaTimeToSeconds({
							time: editor.playback.getCurrentTime(),
						});
						const proj = editor.project.getActiveOrNull();
						if (proj) {
							const voiceFile = new File(
								[blob],
								`voice-caption-${Date.now()}.webm`,
								{ type: blob.type || "audio/webm" },
							);
							const processed = await processMediaAssets({
								files: [voiceFile],
							});
							for (const item of processed) {
								const saved = await editor.media.addMediaAsset({
									projectId: proj.metadata.id,
									asset: item,
								});
								if (saved) {
									const el = buildElementFromMedia({
										mediaId: saved.id,
										mediaType: saved.type,
										name: "Recorded voice",
										duration: mediaTimeFromSeconds({
											seconds: saved.duration ?? 4,
										}),
										startTime: mediaTimeFromSeconds({ seconds: startSec }),
									});
									editor.timeline.insertElement({
										element: el,
										placement: { mode: "auto" },
									});
								}
							}
						}
						await transcribeBlobAndInsert(blob, startSec, false);
					} catch (err) {
						dispatch({
							type: "fail",
							error:
								err instanceof Error
									? err.message
									: "Failed to process voice recording",
						});
					}
				};
				recorder.start();
				setIsRecordingMic(true);
				toast.info("Recording voice... Click again to stop and transcribe.");
			} catch {
				dispatch({
					type: "fail",
					error: "Microphone access denied.",
				});
			}
			return;
		}

		dispatch({
			type: "start",
			step: "Transcribing timeline audio...",
		});

		try {
			const scene = editor.scenes.getActiveScene();

			if (captureSource === "clip") {
				const withTracks = editor.timeline.getElementsWithTracks({
					elements: selectedRefs,
				});
				const selectedMediaEl = withTracks.find(
					(item) =>
						item.element.type === "video" || item.element.type === "audio",
				)?.element;

				if (selectedMediaEl && "mediaId" in selectedMediaEl) {
					const clipStartSec = mediaTimeToSeconds({
						time: selectedMediaEl.startTime,
					});
					const clipDurSec = mediaTimeToSeconds({
						time: selectedMediaEl.duration,
					});
					const clipTrimSec = mediaTimeToSeconds({
						time: selectedMediaEl.trimStart,
					});

					const serverClipResult =
						await transcriptionService.transcribeTimelineClips({
							clips: [
								{
									mediaId: selectedMediaEl.mediaId,
									trackType:
										selectedMediaEl.type === "audio" ? "audio" : "video",
									startTimeSec: clipStartSec,
									durationSec: clipDurSec,
									trimStartSec: clipTrimSec,
								},
							],
							language:
								selectedLanguage === "auto" ? undefined : selectedLanguage,
							onProgress: handleProgress,
						});

					if (serverClipResult && serverClipResult.segments.length > 0) {
						await finalizeSegmentsInsert({
							segments: serverClipResult.segments,
							timeOffsetSeconds: 0,
							replaceExisting: false,
						});
						return;
					}

					const mediaAssets = editor.media.getAssets();
					const asset = mediaAssets.find(
						(a) => a.id === selectedMediaEl.mediaId,
					);
					if (asset?.file) {
						await transcribeBlobAndInsert(asset.file, clipStartSec, false);
						return;
					}
				}
			}

			// Fast Path: Server-side timeline clip transcription (0ms browser decoding)
			let timelineClips = collectTimelineClipDescriptors(scene.tracks, false);
			if (timelineClips.length === 0) {
				timelineClips = collectTimelineClipDescriptors(scene.tracks, true);
			}

			if (timelineClips.length > 0) {
				const serverResult =
					await transcriptionService.transcribeTimelineClips({
						clips: timelineClips,
						language:
							selectedLanguage === "auto" ? undefined : selectedLanguage,
						onProgress: handleProgress,
					});

				if (serverResult && serverResult.segments.length > 0) {
					await finalizeSegmentsInsert({
						segments: serverResult.segments,
						timeOffsetSeconds: 0,
						replaceExisting: true,
					});
					return;
				}
			}

			// Fallback for unsynced local browser blobs
			dispatch({
				type: "update_step",
				step: "Extracting audio...",
			});
			const audioBlob = await extractTimelineAudio({
				tracks: scene.tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});
			await transcribeBlobAndInsert(audioBlob, 0, true);
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error ? error.message : "An unexpected error occurred",
			});
		}
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Parsing subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid captions found in subtitle file.",
				});
				return;
			}

			if (!insertCaptions({ captions: result.captions })) {
				dispatch({
					type: "fail",
					error: "Failed to insert captions into timeline.",
				});
				return;
			}

			dispatch({ type: "succeed", warnings: result.warnings });
			toast.success(`${result.captions.length} captions imported`);
		} catch (error) {
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "Failed to import subtitle file",
			});
		}
	};

	const handleFileChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;
		await handleImportFile({ file });
	};

	const handleExportFormat = (format: SubtitleExportFormat) => {
		if (timelineSubtitles.length === 0) {
			toast.error("No captions on timeline to export.");
			return;
		}
		const activeProj = editor.project.getActiveOrNull();
		const cues: SubtitleCue[] = timelineSubtitles.map((item) => ({
			text: item.content,
			startTime: item.startTimeSec,
			duration: item.durationSec,
			style: {
				fontFamily: String(item.element.params.fontFamily ?? "Montserrat"),
				fontSize: Number(item.element.params.fontSize ?? 5.4),
				color: String(item.element.params.color ?? "#ffffff"),
			},
		}));
		downloadSubtitleFile({
			cues,
			format,
			projectName: activeProj?.metadata?.name || "captions",
			canvasSize: activeProj?.settings?.canvasSize,
		});
		toast.success(`Exported .${format.toUpperCase()}`);
	};

	const handleUpdateCueText = (
		item: TimelineSubtitleItem,
		nextText: string,
	) => {
		const words = nextText.trim().split(/\s+/).filter(Boolean);
		const dur = Math.max(0.2, item.durationSec);
		const step = dur / Math.max(1, words.length);
		const recalcWordTimings = words.map((w, idx) => ({
			word: activeStyle.uppercase ? w.toUpperCase() : w,
			startOffset: Number((idx * step).toFixed(3)),
			endOffset: Number(((idx + 1) * step).toFixed(3)),
		}));

		editor.timeline.updateElements({
			updates: [
				{
					trackId: item.trackId,
					elementId: item.element.id,
					patch: {
						params: {
							...item.element.params,
							content: nextText,
							wordTimings: JSON.stringify(recalcWordTimings),
						},
					},
				},
			],
		});
	};

	const handleSplitCue = (item: TimelineSubtitleItem) => {
		const words = item.content.trim().split(/\s+/).filter(Boolean);
		if (words.length < 2) {
			toast.info("At least 2 words are needed to split a caption.");
			return;
		}
		const midWord = Math.ceil(words.length / 2);
		const leftText = words.slice(0, midWord).join(" ");
		const rightText = words.slice(midWord).join(" ");
		const ratio = midWord / words.length;
		const leftDur = Math.max(0.25, Number((item.durationSec * ratio).toFixed(3)));
		const rightDur = Math.max(
			0.25,
			Number((item.durationSec - leftDur).toFixed(3)),
		);
		const rightStart = Number((item.startTimeSec + leftDur).toFixed(3));
		const canvasSize = editor.project.getActive().settings.canvasSize;

		const newRightEl = buildSubtitleTextElement({
			index: timelineSubtitles.length + 1,
			caption: {
				text: rightText,
				startTime: rightStart,
				duration: rightDur,
			},
			canvasSize,
			preset: activeStyle,
			verticalAlign,
		});
		newRightEl.params = {
			...item.element.params,
			content: rightText,
		};

		const updateCmd = new UpdateElementsCommand({
			updates: [
				{
					trackId: item.trackId,
					elementId: item.element.id,
					patch: {
						duration: mediaTimeFromSeconds({ seconds: leftDur }),
						params: {
							...item.element.params,
							content: leftText,
						},
					},
				},
			],
		});
		const insertCmd = new InsertElementCommand({
			placement: { mode: "explicit", trackId: item.trackId },
			element: newRightEl,
		});
		editor.command.execute({
			command: new BatchCommand([updateCmd, insertCmd]),
		});
	};

	const handleMergeWithNext = (idx: number) => {
		const current = timelineSubtitles[idx];
		const next = timelineSubtitles[idx + 1];
		if (!current || !next) return;

		const mergedText = `${current.content.trim()} ${next.content.trim()}`.trim();
		const mergedDur = Math.max(
			current.durationSec + next.durationSec,
			next.endTimeSec - current.startTimeSec,
		);

		const updateCmd = new UpdateElementsCommand({
			updates: [
				{
					trackId: current.trackId,
					elementId: current.element.id,
					patch: {
						duration: mediaTimeFromSeconds({ seconds: mergedDur }),
						params: {
							...current.element.params,
							content: mergedText,
						},
					},
				},
			],
		});
		const deleteCmd = new DeleteElementsCommand({
			elements: [{ trackId: next.trackId, elementId: next.element.id }],
		});
		editor.command.execute({
			command: new BatchCommand([updateCmd, deleteCmd]),
		});
	};

	const handleDeleteCue = (item: TimelineSubtitleItem) => {
		editor.timeline.deleteElements({
			elements: [{ trackId: item.trackId, elementId: item.element.id }],
		});
	};

	const handleAddBlankCueAfter = (item?: TimelineSubtitleItem) => {
		const startSec = item
			? item.endTimeSec + 0.05
			: mediaTimeToSeconds({ time: editor.playback.getCurrentTime() });
		const durSec = 2.0;
		const canvasSize = editor.project.getActive().settings.canvasSize;
		const cue: SubtitleCue = {
			text: "New caption",
			startTime: startSec,
			duration: durSec,
		};

		if (item) {
			const el = buildSubtitleTextElement({
				index: timelineSubtitles.length + 1,
				caption: cue,
				canvasSize,
				preset: activeStyle,
				verticalAlign,
			});
			editor.timeline.insertElement({
				placement: { mode: "explicit", trackId: item.trackId },
				element: el,
			});
		} else {
			insertCaptions({ captions: [cue] });
		}
		editor.playback.seek({
			time: mediaTimeFromSeconds({ seconds: startSec }),
		});
	};

	const handleBatchAutoEmojis = () => {
		if (timelineSubtitles.length === 0) return;
		editor.timeline.updateElements({
			updates: timelineSubtitles.map((item) => ({
				trackId: item.trackId,
				elementId: item.element.id,
				patch: {
					params: {
						...item.element.params,
						content: toggleEmojiOnText(item.content),
					},
				},
			})),
		});
		toast.success("Contextual emojis applied");
	};

	const handleBatchAutoMemes = async () => {
		if (timelineSubtitles.length === 0) {
			setAutoMemes(true);
			setAutoEmojis(false);
			toast.info(
				`Memes IA activado (${MEME_CATALOG.length} memes disponibles al generar)`,
			);
			return;
		}
		dispatch({
			type: "start",
			step: "Detecting contextual memes (Sinaí IA)...",
		});
		try {
			// Remove trailing auto-emojis so memes appear instead of inline emojis
			editor.timeline.updateElements({
				updates: timelineSubtitles.map((item) => ({
					trackId: item.trackId,
					elementId: item.element.id,
					patch: {
						params: {
							...item.element.params,
							content: stripTrailingEmoji(item.content),
						},
					},
				})),
			});

			const { count, firstMemeStartSec } = await applySinaiMemesToCues(
				timelineSubtitles.map((item) => ({
					startTime: item.startTimeSec,
					duration: item.durationSec,
					text: item.content,
				})),
				true,
			);
			if (firstMemeStartSec !== null) {
				editor.playback.seek({
					time: mediaTimeFromSeconds({ seconds: firstMemeStartSec + 0.25 }),
				});
			}
			dispatch({ type: "succeed", warnings: [] });
			toast.success(
				`Sinaí IA colocó ${count} memes contextuales (repertorio de ${MEME_CATALOG.length})`,
			);
		} catch {
			dispatch({
				type: "fail",
				error: "Failed to place contextual memes.",
			});
		}
	};

	const handleToggleAutoEmojis = () => {
		const next = !autoEmojis;
		setAutoEmojis(next);
		if (next && timelineSubtitles.length > 0) {
			handleBatchAutoEmojis();
		}
	};

	const handleToggleAutoMemes = () => {
		const next = !autoMemes;
		setAutoMemes(next);
		if (next) {
			setAutoEmojis(false);
			if (timelineSubtitles.length > 0) {
				void handleBatchAutoMemes();
			}
		} else {
			clearExistingAutoMemes();
		}
	};

	const handleInsertContextualImage = async (
		item: TimelineSubtitleItem,
		idx: number,
	) => {
		setBusyCueId(item.element.id);
		try {
			const { file, title } = await generateContextualAIImageFile({
				text: item.content,
				index: idx,
				borderColor: stickerBorderColor,
			});
			await insertContextualOverlayFile({
				file,
				name: `Imagen IA · ${title}`,
				startTimeSec: item.startTimeSec,
				durationSec: Math.min(3.2, Math.max(1.8, item.durationSec)),
				scale: 0.34,
			});
			editor.playback.seek({
				time: mediaTimeFromSeconds({ seconds: item.startTimeSec + 0.08 }),
			});
			toast.success(
				`Imagen contextual IA colocada (borde ${stickerBorderColor === "white" ? "blanco" : "negro"}): ${title}`,
			);
		} catch {
			toast.error("Failed to generate contextual image");
		} finally {
			setBusyCueId(null);
		}
	};

	const handleCustomImageUploadChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const rawFile = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!rawFile) return;

		const targetCue = pendingImageCue;
		setPendingImageCue(null);
		const startSec = targetCue
			? targetCue.startTimeSec
			: mediaTimeToSeconds({ time: editor.playback.getCurrentTime() });
		const durSec = targetCue ? targetCue.durationSec : 2.4;

		if (targetCue) {
			setBusyCueId(targetCue.element.id);
		}
		try {
			const processedFile = await processCustomOverlayImageFile({
				file: rawFile,
				borderColor: stickerBorderColor,
			});
			await insertContextualOverlayFile({
				file: processedFile,
				name: `Sticker · ${rawFile.name.replace(/\.[^.]+$/, "")}`,
				startTimeSec: startSec,
				durationSec: durSec,
				scale: 0.34,
			});
			editor.playback.seek({
				time: mediaTimeFromSeconds({ seconds: startSec + 0.08 }),
			});
			toast.success(
				`Imagen colocada (sin fondo conservado + borde ${stickerBorderColor === "white" ? "blanco" : "negro"})`,
			);
		} catch {
			toast.error("No se pudo procesar la imagen");
		} finally {
			setBusyCueId(null);
		}
	};

	const handleInsertContextualMeme = async (
		item: TimelineSubtitleItem,
		idx: number,
		memeId?: string,
	) => {
		setBusyCueId(item.element.id);
		try {
			let reactionCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
			try {
				const tracks = editor.scenes.getActiveSceneOrNull()?.tracks;
				const mediaAssets = editor.media.getAssets();
				const allVideoTracks: TimelineTrack[] = [
					...(tracks?.main ? [tracks.main] : []),
					...(tracks?.overlay.filter((t) => t.type === "video") ?? []),
				];
				for (const tr of allVideoTracks) {
					for (const el of tr.elements) {
						if (el.type !== "video") continue;
						const elStart = mediaTimeToSeconds({ time: el.startTime });
						const elDur = mediaTimeToSeconds({ time: el.duration });
						if (
							item.startTimeSec >= elStart - 0.05 &&
							item.startTimeSec <= elStart + elDur
						) {
							const asset = mediaAssets.find((a) => a.id === el.mediaId);
							if (asset?.file) {
								const localTime = Math.max(
									0,
									item.startTimeSec -
										elStart +
										mediaTimeToSeconds({ time: el.trimStart }),
								);
								const frame = await videoCache.getFrameAt({
									mediaId: el.mediaId,
									file: asset.file,
									time: localTime,
								});
								if (frame?.canvas) {
									reactionCanvas = frame.canvas;
									break;
								}
							}
						}
					}
					if (reactionCanvas) break;
				}
			} catch {
				// fallback to stylized card
			}

			const { file, label } = await generateContextualMemeFile({
				text: item.content,
				memeId,
				sourceCanvas: reactionCanvas,
				index: idx,
				borderColor: stickerBorderColor,
			});
			await insertContextualOverlayFile({
				file,
				name: `Meme · ${label}`,
				startTimeSec: item.startTimeSec,
				durationSec: Math.min(3.0, Math.max(1.6, item.durationSec)),
				scale: 0.32,
			});
			editor.playback.seek({
				time: mediaTimeFromSeconds({ seconds: item.startTimeSec + 0.08 }),
			});
			toast.success(`Meme real colocado en pantalla: ${label}`);
		} catch {
			toast.error("Failed to generate meme overlay");
		} finally {
			setBusyCueId(null);
		}
	};

	const error = processing.status === "idle" ? processing.error : null;
	const contrastPlate = resolveContrastPlateColor(activeStyle);

	return (
		<PanelView
			title="Captions"
			contentClassName="px-0 flex flex-col"
			actions={
				<div className="flex items-center gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isProcessing}
					>
						<HugeiconsIcon icon={CloudUploadIcon} />
						Import
					</Button>
					{timelineSubtitles.length > 0 && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button" variant="outline" size="sm">
									<HugeiconsIcon icon={Download04Icon} />
									Export
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{(["srt", "vtt", "ass", "txt"] as const).map((fmt) => (
									<DropdownMenuItem
										key={fmt}
										onClick={() => handleExportFormat(fmt)}
									>
										Export .{fmt.toUpperCase()}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.vtt,.ass,.ssa,.json"
				className="hidden"
				onChange={(e) => void handleFileChange(e)}
			/>
			<input
				ref={customImageInputRef}
				type="file"
				accept="image/png,image/webp,image/jpeg,image/gif"
				className="hidden"
				onChange={(e) => void handleCustomImageUploadChange(e)}
			/>

			{/* 1. Selección inmediata de Preset + Generación de Subtítulos */}
			<Section showTopBorder={false}>
				<SectionContent>
					<SectionFields>
						<SectionField label="Style preset">
							<div className="grid grid-cols-2 gap-1.5">
								{CAPTION_STYLE_PRESETS.map((preset) => {
									const isSelected = activePresetId === preset.id;
									const isWhiteBg = preset.id === "white-box";
									return (
										<button
											key={preset.id}
											type="button"
											onClick={() => handleSelectPreset(preset.id)}
											className={cn(
												"flex items-center justify-between rounded-md border px-2 py-1.5 text-left transition-colors",
												isSelected
													? "border-foreground bg-accent"
													: "border-border bg-background/40 hover:bg-accent/40",
											)}
										>
											<span
												className="truncate rounded px-1.5 py-0.5 text-xs font-bold"
												style={{
													fontFamily: `"${preset.fontFamily}", sans-serif`,
													backgroundColor: isWhiteBg
														? "#ffffff"
														: "#09090b",
													color: preset.previewText,
													border: isWhiteBg
														? "1px solid rgba(0,0,0,0.15)"
														: "1px solid rgba(255,255,255,0.12)",
												}}
											>
												{preset.label}
											</span>
											<span className="text-muted-foreground text-[10px]">
												{preset.badge}
											</span>
										</button>
									);
								})}
							</div>
						</SectionField>

						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) =>
									setSelectedLanguage(value as TranscriptionLanguage)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>

						<SectionField label="Source">
							<div className="flex flex-col gap-2">
								<Tabs
									value={captureSource}
									onValueChange={(v) => setCaptureSource(v as AudioCaptureSource)}
								>
									<TabsList className="w-full grid grid-cols-3">
										<TabsTrigger value="timeline" className="text-xs">
											Full video
										</TabsTrigger>
										<TabsTrigger value="clip" className="text-xs">
											Selected clip
										</TabsTrigger>
										<TabsTrigger value="mic" className="text-xs">
											Voiceover
										</TabsTrigger>
									</TabsList>
								</Tabs>

								<div className="grid grid-cols-2 gap-1.5">
									<Button
										type="button"
										variant={autoEmojis ? "secondary" : "outline"}
										size="sm"
										onClick={handleToggleAutoEmojis}
										title="Añadir emojis contextuales al texto de los subtítulos"
									>
										<HugeiconsIcon icon={Happy01Icon} />
										Emojis
									</Button>
									<Button
										type="button"
										variant={autoMemes ? "secondary" : "outline"}
										size="sm"
										onClick={handleToggleAutoMemes}
										disabled={isProcessing}
										title={`Detectar con el pool de IA de Sinaí qué meme colocar en medio de la pantalla (${MEME_CATALOG.length} memes)`}
									>
										<HugeiconsIcon icon={Image01Icon} />
										Memes ({MEME_CATALOG.length})
									</Button>
								</div>
							</div>
						</SectionField>
					</SectionFields>

					<div className="flex flex-col gap-2 pt-3">
						{error && (
							<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
								<p className="text-destructive text-xs">{error}</p>
							</div>
						)}

						<Button
							className="w-full"
							onClick={() => void handleGenerateTranscript()}
							disabled={isProcessing}
							variant={isRecordingMic ? "destructive" : "default"}
						>
							{isProcessing && <Spinner className="mr-1" />}
							{isProcessing
								? processing.step
								: isRecordingMic
									? "Stop recording"
									: "Generate transcript"}
						</Button>
					</div>
				</SectionContent>
			</Section>

			{/* 2. Parámetros Personalizables del Estilo */}
			<Section>
				<SectionHeader
					trailing={
						timelineSubtitles.length > 0 ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleApplyStyleToAllSubtitles}
								title="Apply current style to all existing captions on the timeline"
							>
								Apply to all
							</Button>
						) : undefined
					}
				>
					<SectionTitle>
						Style parameters
						{selectedSubtitleItems.length > 0
							? ` (${selectedSubtitleItems.length} selected)`
							: ""}
					</SectionTitle>
				</SectionHeader>
				<SectionContent>
					<SectionFields>
						{/* Mini vista previa inmediata con fondo negro o blanco según el estilo */}
						<div
							className="flex items-center justify-center rounded-md border border-border px-3 py-2.5 text-center transition-colors"
							style={{
								backgroundColor:
									contrastPlate === "black" ? "#09090b" : "#f8fafc",
							}}
						>
							<span
								className="inline-block leading-tight transition-all"
								style={{
									fontFamily: `"${activeStyle.fontFamily}", sans-serif`,
									fontSize: `${Math.max(13, Math.min(20, activeStyle.fontSize * 2.8))}px`,
									fontWeight: activeStyle.fontWeight === "bold" ? 800 : 500,
									textTransform: activeStyle.uppercase ? "uppercase" : "none",
									color: activeStyle.color,
									backgroundColor: activeStyle.backgroundEnabled
										? activeStyle.backgroundColor
										: "transparent",
									borderRadius: activeStyle.backgroundEnabled
										? `${Math.min(16, activeStyle.cornerRadius * 0.45)}px`
										: undefined,
									padding: activeStyle.backgroundEnabled
										? "4px 10px"
										: undefined,
									WebkitTextStroke:
										activeStyle.strokeWidth > 0 &&
										!activeStyle.backgroundEnabled
											? `${Math.max(1, activeStyle.strokeWidth * 0.28)}px ${activeStyle.strokeColor}`
											: undefined,
									paintOrder: "stroke fill",
									textShadow:
										activeStyle.shadowBlur > 0
											? `0 2px ${Math.min(12, activeStyle.shadowBlur)}px ${activeStyle.shadowColor}`
											: undefined,
								}}
							>
								Vista{" "}
								<span
									style={{
										color:
											activeStyle.id === "karaoke-pill"
												? "#09090b"
												: activeStyle.accentColor,
										backgroundColor:
											activeStyle.id === "karaoke-pill"
												? activeStyle.accentColor
												: "transparent",
										borderRadius:
											activeStyle.id === "karaoke-pill" ? "4px" : undefined,
										padding:
											activeStyle.id === "karaoke-pill"
												? "1px 5px"
												: undefined,
									}}
								>
									previa
								</span>{" "}
								en video
							</span>
						</div>

						<SectionField label="Font">
							<FontPicker
								defaultValue={activeStyle.fontFamily}
								onValuePreview={(fontFamily) =>
									handleStylePatch({ fontFamily })
								}
								onValueChange={(fontFamily) =>
									handleStylePatch({ fontFamily })
								}
							/>
						</SectionField>

						<SectionField label={`Size (${activeStyle.fontSize.toFixed(1)})`}>
							<div className="flex items-center gap-3">
								<Slider
									className="flex-1"
									min={2.5}
									max={10}
									step={0.1}
									value={[activeStyle.fontSize]}
									onValueChange={(vals) =>
										handleStylePatch({ fontSize: vals[0] ?? 5.4 })
									}
								/>
								<div className="flex items-center gap-1.5">
									<span className="text-muted-foreground text-xs">AA</span>
									<Switch
										checked={Boolean(activeStyle.uppercase)}
										onCheckedChange={(checked) =>
											handleStylePatch({ uppercase: checked })
										}
									/>
								</div>
							</div>
						</SectionField>

						<div className="grid grid-cols-2 gap-2">
							<SectionField label="Text color">
								<ColorPicker
									value={normalizeHexForPicker(activeStyle.color, "FFFFFF")}
									onChange={(hex) => handleStylePatch({ color: `#${hex}` })}
									onChangeEnd={(hex) => handleStylePatch({ color: `#${hex}` })}
								/>
							</SectionField>

							<SectionField label="Highlight color">
								<ColorPicker
									value={normalizeHexForPicker(
										activeStyle.accentColor,
										"FACC15",
									)}
									onChange={(hex) =>
										handleStylePatch({ accentColor: `#${hex}` })
									}
									onChangeEnd={(hex) =>
										handleStylePatch({ accentColor: `#${hex}` })
									}
								/>
							</SectionField>
						</div>

						<SectionField label="Background">
							<div className="flex flex-col gap-2">
								<Tabs
									value={backgroundMode}
									onValueChange={(v) =>
										handleBackgroundModeChange(v as SubtitleBackgroundMode)
									}
								>
									<TabsList className="w-full grid grid-cols-4">
										<TabsTrigger value="none" className="text-xs">
											None
										</TabsTrigger>
										<TabsTrigger value="black" className="text-xs">
											Black
										</TabsTrigger>
										<TabsTrigger value="white" className="text-xs">
											White
										</TabsTrigger>
										<TabsTrigger value="custom" className="text-xs">
											Custom
										</TabsTrigger>
									</TabsList>
								</Tabs>

								{activeStyle.backgroundEnabled && (
									<div className="grid grid-cols-2 gap-2 pt-1">
										<ColorPicker
											value={normalizeHexForPicker(
												activeStyle.backgroundColor,
												"000000",
											)}
											onChange={(hex) =>
												handleStylePatch({
													backgroundEnabled: true,
													backgroundColor: `#${hex}`,
												})
											}
											onChangeEnd={(hex) =>
												handleStylePatch({
													backgroundEnabled: true,
													backgroundColor: `#${hex}`,
												})
											}
										/>
										<div className="flex items-center gap-2">
											<span className="text-muted-foreground text-xs whitespace-nowrap">
												Radius
											</span>
											<Slider
												className="flex-1"
												min={0}
												max={48}
												step={2}
												value={[activeStyle.cornerRadius]}
												onValueChange={(vals) =>
													handleStylePatch({ cornerRadius: vals[0] ?? 24 })
												}
											/>
										</div>
									</div>
								)}
							</div>
						</SectionField>

						<SectionField
							label={`Stroke & shadow (${activeStyle.strokeWidth}px)`}
						>
							<div className="grid grid-cols-2 gap-2 items-center">
								<Slider
									min={0}
									max={12}
									step={0.5}
									value={[activeStyle.strokeWidth]}
									onValueChange={(vals) =>
										handleStylePatch({ strokeWidth: vals[0] ?? 0 })
									}
								/>
								<ColorPicker
									value={normalizeHexForPicker(
										activeStyle.strokeColor,
										"000000",
									)}
									onChange={(hex) =>
										handleStylePatch({ strokeColor: `#${hex}` })
									}
									onChangeEnd={(hex) =>
										handleStylePatch({ strokeColor: `#${hex}` })
									}
								/>
							</div>
						</SectionField>

						<div className="grid grid-cols-2 gap-2">
							<SectionField label="Position">
								<Tabs
									value={verticalAlign}
									onValueChange={(v) =>
										handleVerticalAlignChange(v as "top" | "middle" | "bottom")
									}
								>
									<TabsList className="w-full grid grid-cols-3">
										<TabsTrigger value="top" className="text-xs px-1.5">
											Top
										</TabsTrigger>
										<TabsTrigger value="middle" className="text-xs px-1.5">
											Mid
										</TabsTrigger>
										<TabsTrigger value="bottom" className="text-xs px-1.5">
											Bot
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</SectionField>

							<SectionField label="Animation">
								<Select
									value={activeStyle.letterAnimation}
									onValueChange={(letterAnimation) =>
										handleStylePatch({
											letterAnimation,
											animLoop:
												letterAnimation === "word-karaoke"
													? "letter-karaoke"
													: letterAnimation === "neon-pulse"
														? "letter-neon-pulse"
														: "none",
										})
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Animation" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="word-karaoke">Karaoke</SelectItem>
										<SelectItem value="pop-cascade">Pop cascade</SelectItem>
										<SelectItem value="neon-pulse">Neon glow</SelectItem>
										<SelectItem value="none">Static</SelectItem>
									</SelectContent>
								</Select>
							</SectionField>
						</div>

						<SectionField label="Pacing & context">
							<div className="flex flex-col gap-2">
								<Tabs
									value={pacing}
									onValueChange={(v) => handlePacingChange(v as CaptionPacingMode)}
									className="w-full"
								>
									<TabsList className="w-full grid grid-cols-3">
										<TabsTrigger value="dynamic" className="text-xs">
											1–3 words
										</TabsTrigger>
										<TabsTrigger value="balanced" className="text-xs">
											4–6 words
										</TabsTrigger>
										<TabsTrigger value="sentence" className="text-xs">
											Sentence
										</TabsTrigger>
									</TabsList>
								</Tabs>
								<div className="grid grid-cols-2 gap-1.5">
									<Button
										type="button"
										variant={autoEmojis ? "secondary" : "outline"}
										size="sm"
										onClick={handleToggleAutoEmojis}
										title="Añadir emojis contextuales al texto de los subtítulos"
									>
										<HugeiconsIcon icon={Happy01Icon} />
										Emojis
									</Button>
									<Button
										type="button"
										variant={autoMemes ? "secondary" : "outline"}
										size="sm"
										onClick={handleToggleAutoMemes}
										disabled={isProcessing}
										title={`Detectar con el pool de IA de Sinaí qué meme real colocar en medio de la pantalla (${MEME_CATALOG.length} memes reales)`}
									>
										<HugeiconsIcon icon={Image01Icon} />
										Memes ({MEME_CATALOG.length})
									</Button>
								</div>
							</div>
						</SectionField>

						<SectionField label="Imágenes sin fondo y Memes">
							<div className="flex flex-col gap-2">
								<div className="grid grid-cols-2 gap-2 items-center">
									<span className="text-muted-foreground text-xs">
										Borde (Sin fondo)
									</span>
									<Tabs
										value={stickerBorderColor}
										onValueChange={(v) =>
											setStickerBorderColor(v as StickerBorderColor)
										}
									>
										<TabsList className="w-full grid grid-cols-2">
											<TabsTrigger value="white" className="text-xs">
												Blanco
											</TabsTrigger>
											<TabsTrigger value="black" className="text-xs">
												Negro
											</TabsTrigger>
										</TabsList>
									</Tabs>
								</div>

								<div className="grid grid-cols-2 gap-2 items-center">
									<span className="text-muted-foreground text-xs">
										Animación imagen
									</span>
									<Select
										value={overlayImageAnimation}
										onValueChange={(v) =>
											handleOverlayImageAnimationChange(
												v as OverlayImageAnimationPreset,
											)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Animación" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="zoom-in-pop">Pop Zoom</SelectItem>
											<SelectItem value="elastic-drop">
												Rebote Elástico
											</SelectItem>
											<SelectItem value="slide-up">Slide Up</SelectItem>
											<SelectItem value="spin-in">Giro / Spin</SelectItem>
											<SelectItem value="fade-in">Fade In / Out</SelectItem>
											<SelectItem value="pulse-beat">Pulso Activo</SelectItem>
											<SelectItem value="float-hover">Flotar Suave</SelectItem>
											<SelectItem value="shake-handheld">
												Vibrar / Shake
											</SelectItem>
											<SelectItem value="none">Sin animación</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<Button
									type="button"
									variant="outline"
									size="sm"
									className="w-full"
									onClick={() => {
										setPendingImageCue(null);
										customImageInputRef.current?.click();
									}}
									title="Subir imagen sin fondo (PNG/WebP): conserva transparencia y añade borde blanco o negro con la animación elegida"
								>
									<HugeiconsIcon icon={CloudUploadIcon} />
									Colocar imagen sin fondo ({stickerBorderColor === "white" ? "Borde Blanco" : "Borde Negro"})
								</Button>
							</div>
						</SectionField>
					</SectionFields>
				</SectionContent>
			</Section>

			{/* 3. Lista Editable de Subtítulos del Timeline */}
			<Section showBottomBorder={false}>
				<SectionHeader
					trailing={
						<div className="flex items-center gap-1">
							{timelineSubtitles.length > 0 && (
								<>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={handleBatchAutoEmojis}
										title="Aplicar emojis contextuales a todos los subtítulos"
									>
										<HugeiconsIcon icon={Happy01Icon} />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={isProcessing}
										onClick={() => void handleBatchAutoMemes()}
										title={`Detectar y colocar memes con IA de Sinaí (${MEME_CATALOG.length} memes)`}
									>
										<HugeiconsIcon icon={Image01Icon} />
										Memes IA
									</Button>
								</>
							)}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() =>
									handleAddBlankCueAfter(
										timelineSubtitles[timelineSubtitles.length - 1],
									)
								}
								title="Add caption"
							>
								<HugeiconsIcon icon={PlusSignIcon} />
								Add
							</Button>
						</div>
					}
				>
					<SectionTitle>
						Captions{" "}
						{timelineSubtitles.length > 0
							? `(${timelineSubtitles.length})`
							: ""}
					</SectionTitle>
				</SectionHeader>

				<SectionContent className="flex flex-col gap-2">
					{timelineSubtitles.length === 0 ? (
						<p className="text-muted-foreground text-xs py-4 text-center">
							Preview your style directly on the video above, then click
							&ldquo;Generate transcript&rdquo; or import a file.
						</p>
					) : (
						timelineSubtitles.map((item, idx) => {
							const isActive =
								currentTimeSec >= item.startTimeSec - 0.05 &&
								currentTimeSec <= item.endTimeSec + 0.05;
							const suggestedEmojis = getSuggestedEmojisForText(
								item.content,
							).slice(0, 3);
							const suggestedMemes = getSuggestedMemesForText(
								item.content,
								2,
							);
							const catalogMatches = searchMemesCatalog(memeSearchQuery, 18);
							const isCueBusy = busyCueId === item.element.id;

							return (
								<div
									key={item.element.id}
									className={cn(
										"rounded-md border p-2.5 flex flex-col gap-2 transition-colors",
										isActive
											? "border-foreground/30 bg-accent/40"
											: "border-border bg-background/40",
									)}
								>
									<div className="flex items-center justify-between gap-1">
										<button
											type="button"
											onClick={() => {
												editor.playback.seek({
													time: mediaTimeFromSeconds({
														seconds:
															item.startTimeSec +
															Math.min(0.2, item.durationSec * 0.35),
													}),
												});
												editor.selection.setSelectedElements({
													elements: [
														{
															trackId: item.trackId,
															elementId: item.element.id,
														},
													],
												});
											}}
											className="text-muted-foreground hover:text-foreground text-xs font-mono transition-colors"
										>
											{formatShortTime(item.startTimeSec)} –{" "}
											{formatShortTime(item.endTimeSec)}
										</button>

										<div className="flex items-center gap-0.5">
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-6"
												onClick={() => handleSplitCue(item)}
												title="Split caption (Enter)"
											>
												<HugeiconsIcon
													icon={ScissorIcon}
													className="size-3.5"
												/>
											</Button>
											{idx < timelineSubtitles.length - 1 && (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-6"
													onClick={() => handleMergeWithNext(idx)}
													title="Merge with next caption"
												>
													<HugeiconsIcon
														icon={Link02Icon}
														className="size-3.5"
													/>
												</Button>
											)}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-6"
												disabled={isCueBusy}
												onClick={() => {
													setPendingImageCue(item);
													customImageInputRef.current?.click();
												}}
												title="Subir imagen propia sin fondo (con borde blanco o negro)"
											>
												<HugeiconsIcon
													icon={CloudUploadIcon}
													className="size-3.5"
												/>
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-6"
												disabled={isCueBusy}
												onClick={() =>
													void handleInsertContextualImage(item, idx)
												}
												title="Insertar sticker contextual sin fondo (con borde blanco o negro)"
											>
												<HugeiconsIcon
													icon={Image01Icon}
													className="size-3.5"
												/>
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-6"
												disabled={isCueBusy}
												onClick={() =>
													void handleInsertContextualMeme(item, idx)
												}
												title="Insertar meme real en una sola imagen"
											>
												<HugeiconsIcon
													icon={Happy01Icon}
													className="size-3.5"
												/>
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-6"
												onClick={() => handleDeleteCue(item)}
												title="Delete caption"
											>
												<HugeiconsIcon
													icon={Delete02Icon}
													className="size-3.5"
												/>
											</Button>
										</div>
									</div>

									<Input
										size="xs"
										variant="outline"
										value={item.content}
										onFocus={() => {
											editor.playback.seek({
												time: mediaTimeFromSeconds({
													seconds:
														item.startTimeSec +
														Math.min(0.2, item.durationSec * 0.35),
												}),
											});
										}}
										onChange={(e) => handleUpdateCueText(item, e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleSplitCue(item);
											}
										}}
										placeholder="Caption text..."
									/>

									<div className="flex flex-wrap items-center justify-between gap-1">
										<div className="flex items-center gap-0.5">
											{suggestedEmojis.map((emo) => (
												<Button
													key={emo}
													type="button"
													variant="ghost"
													size="sm"
													className="h-6 px-1.5 text-xs"
													onClick={() =>
														handleUpdateCueText(
															item,
															toggleEmojiOnText(item.content, emo),
														)
													}
													title="Añadir emoji al subtítulo"
												>
													{emo}
												</Button>
											))}
										</div>

										<div className="flex items-center gap-1">
											{suggestedMemes[0] && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={isCueBusy}
													className="h-6 px-1.5 text-[10px] max-w-[130px] truncate"
													onClick={() =>
														void handleInsertContextualMeme(
															item,
															idx,
															suggestedMemes[0]!.id,
														)
													}
													title={`Colocar meme sugerido: ${suggestedMemes[0].name}`}
												>
													🎭 {suggestedMemes[0].name.split("(")[0]?.trim()}
												</Button>
											)}

											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={isCueBusy}
														className="h-6 px-1.5 text-[10px]"
														title={`Elegir entre ${MEME_CATALOG.length} memes actuales y de siempre`}
													>
														+Memes
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent
													align="end"
													className="w-64 max-h-72 overflow-y-auto p-1.5"
												>
													<div className="pb-1.5">
														<Input
															size="xs"
															value={memeSearchQuery}
															onChange={(e) =>
																setMemeSearchQuery(e.target.value)
															}
															onKeyDown={(e) => e.stopPropagation()}
															placeholder={`Buscar en ${MEME_CATALOG.length} memes...`}
														/>
													</div>
													{catalogMatches.map((m) => (
														<DropdownMenuItem
															key={m.id}
															onClick={() =>
																void handleInsertContextualMeme(
																	item,
																	idx,
																	m.id,
																)
															}
															className="flex items-center justify-between gap-2 text-xs"
														>
															<span className="truncate">{m.name}</span>
															<span className="text-muted-foreground text-[10px] uppercase shrink-0">
																{m.era}
															</span>
														</DropdownMenuItem>
													))}
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								</div>
							);
						})
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
