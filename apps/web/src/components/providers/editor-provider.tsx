"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsListener } from "@/actions/use-keybindings";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditorActions } from "@/actions/use-editor-actions";
import { loadFontAtlas } from "@/fonts/google-fonts";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";
import { storageService } from "@/services/storage/service";
import { videoCache } from "@/services/video-cache/service";
import { OpenCutNervBridge } from "@/components/editor/panels/assets/views/ai-studio";

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { setLoadingProject } = useKeybindingsStore();

	useEffect(() => {
		setLoadingProject(isLoading);
	}, [isLoading, setLoadingProject]);

	useEffect(() => {
		let cancelled = false;
		const editor = EditorCore.getInstance();

		const loadProject = async () => {
			try {
				setIsLoading(true);
				void initializeGpuRenderer().then(() => {
					editor.renderer.setDegraded(!isGpuAvailable());
				});
				await editor.project.loadProject({ id: projectId });

				if (cancelled) return;

				setIsLoading(false);
				loadFontAtlas();
			} catch (err) {
				if (cancelled) return;

				const isNotFound =
					err instanceof Error &&
					(err.message.includes("not found") ||
						err.message.includes("does not exist"));

				if (isNotFound) {
					try {
						await editor.project.createNewProject({
							id: projectId,
							name: "Proyecto NERV Studio",
						});
						await editor.project.loadProject({ id: projectId });
						if (cancelled) return;
						setIsLoading(false);
						loadFontAtlas();
					} catch (_createErr) {
						setError("Failed to create project");
						setIsLoading(false);
					}
				} else {
					const wasmPanic = (window as Window & { __wasmPanic?: string })
						.__wasmPanic;
					if (wasmPanic) {
						delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
						setError(wasmPanic);
					} else {
						setError(
							err instanceof Error ? err.message : "Failed to load project",
						);
					}
					setIsLoading(false);
				}
			}
		};

		loadProject();

		return () => {
			cancelled = true;
		};
	}, [projectId, router]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Loading project...</p>
				</div>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Exiting project...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			<OpenCutNervBridge />
			{children}
		</>
	);
}

function EditorRuntimeBindings() {
	const editor = useEditor();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);

	useEffect(() => {
		editor.command.isRippleEnabled = rippleEditingEnabled;
	}, [editor, rippleEditingEnabled]);

	useEffect(() => {
		const pause = () => editor.playback.pause();
		const onVisibilityChange = () => {
			if (document.hidden) pause();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pagehide", pause);
		return () => {
			pause();
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pagehide", pause);
		};
	}, [editor]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [editor]);

	useEffect(() => {
		const applyVideoMetadata = (detail: {
			mediaId?: string;
			duration?: number;
			width?: number;
			height?: number;
			isIntrinsic?: boolean;
			thumbnailDataUrl?: string;
		}) => {
			if (!detail?.mediaId) return;
			if (detail.isIntrinsic === false) return;

			const assets = editor.media.getAssets();
			const asset = assets.find((a) => a.id === detail.mediaId);
			let assetUpdated = false;
			let dimensionsChanged = false;

			if (asset) {
				let nextDuration = asset.duration;
				let nextWidth = asset.width;
				let nextHeight = asset.height;
				let nextThumb = asset.thumbnailUrl;

				if (
					detail.duration &&
					detail.duration > 0 &&
					(!asset.duration || Math.abs(asset.duration - detail.duration) > 0.25)
				) {
					nextDuration = detail.duration;
					assetUpdated = true;
				}
				if (detail.width && detail.width > 0 && asset.width !== detail.width) {
					nextWidth = detail.width;
					assetUpdated = true;
					dimensionsChanged = true;
				}
				if (
					detail.height &&
					detail.height > 0 &&
					asset.height !== detail.height
				) {
					nextHeight = detail.height;
					assetUpdated = true;
					dimensionsChanged = true;
				}
				if (
					detail.thumbnailDataUrl &&
					(!asset.thumbnailUrl || dimensionsChanged)
				) {
					nextThumb = detail.thumbnailDataUrl;
					assetUpdated = true;
				}
				if (assetUpdated) {
					const updatedAsset = {
						...asset,
						duration: nextDuration,
						width: nextWidth,
						height: nextHeight,
						thumbnailUrl: nextThumb,
					};
					editor.media.setAssets({
						assets: assets.map((a) =>
							a.id === detail.mediaId ? updatedAsset : a,
						),
					});
					const activeProj = editor.project.getActiveOrNull();
					if (activeProj) {
						void storageService.updateMediaAssetMetadata({
							projectId: activeProj.metadata.id,
							mediaAsset: updatedAsset,
						});
					}
					videoCache.markDirty();
				}
			}

			const activeScene = editor.scenes.getActiveSceneOrNull();
			if (!activeScene) return;

			// Heal project canvasSize if it was stuck on a default/fallback landscape size (1280x720 or 1920x1080)
			// while the primary timeline video asset is actually vertical (and the user hasn't manually picked a format).
			if (
				detail.width &&
				detail.height &&
				detail.width > 0 &&
				detail.height > 0
			) {
				const activeProj = editor.project.getActiveOrNull();
				if (
					activeProj &&
					activeProj.settings.canvasSizeMode !== "custom" &&
					!activeProj.settings.userSelectedFormat
				) {
					const visualElements = [
						...activeScene.tracks.overlay.flatMap(
							(t) => t.elements as Array<{ type: string; mediaId?: string }>,
						),
						...(activeScene.tracks.main.elements as Array<{
							type: string;
							mediaId?: string;
						}>),
					].filter((el) => el.type === "video" || el.type === "image");

					const videoElements = visualElements.filter(
						(el) => el.type === "video",
					);
					const firstVisual = videoElements[0] ?? visualElements[0];
					const currentCanvas = activeProj.settings.canvasSize;
					const isFallbackLandscape =
						(currentCanvas.width === 1280 && currentCanvas.height === 720) ||
						(currentCanvas.width === 1920 && currentCanvas.height === 1080);
					const isAssetVertical = detail.width < detail.height;

					if (
						firstVisual?.mediaId === detail.mediaId &&
						isFallbackLandscape &&
						isAssetVertical &&
						(currentCanvas.width !== detail.width ||
							currentCanvas.height !== detail.height)
					) {
						const nextCanvasSize = {
							width: detail.width,
							height: detail.height,
						};
						editor.project.updateSettings({
							settings: {
								canvasSize: nextCanvasSize,
								originalCanvasSize: nextCanvasSize,
							},
							pushHistory: false,
						});
					}
				}
			}

			if (!detail.duration || detail.duration <= 0) return;

			// Heal any video element that was given the 5.0s (600,000 ticks) or 10.0s (1,200,000 ticks) fallback duration
			const actualTicks = Math.round(detail.duration * 120_000);
			if (actualTicks <= 0) return;

			let tracksChanged = false;
			const healTrackElements = <
				T extends {
					type: string;
					mediaId?: string;
					startTime: number;
					duration: number;
					sourceDuration?: number;
					trimStart: number;
					trimEnd: number;
				},
			>(
				elements: T[],
			): T[] => {
				let rippleShift = 0;
				return elements.map((el, idx) => {
					const shiftedEl =
						rippleShift !== 0
							? { ...el, startTime: Math.max(0, el.startTime + rippleShift) }
							: el;

					if (
						shiftedEl.type !== "video" ||
						shiftedEl.mediaId !== detail.mediaId
					) {
						return shiftedEl;
					}
					const wasFallback5s =
						shiftedEl.duration === 600_000 &&
						(shiftedEl.sourceDuration === 600_000 || !shiftedEl.sourceDuration);
					const wasFallback10s =
						shiftedEl.duration === 1_200_000 &&
						(shiftedEl.sourceDuration === 1_200_000 ||
							!shiftedEl.sourceDuration) &&
						Math.abs(detail.duration! - 10) > 0.5;

					if (
						(wasFallback5s || wasFallback10s) &&
						shiftedEl.trimStart === 0 &&
						shiftedEl.trimEnd === 0 &&
						shiftedEl.duration !== actualTicks
					) {
						const oldEnd = el.startTime + el.duration;
						const nextEl = elements[idx + 1];
						const wasContiguousWithNext =
							nextEl && Math.abs(nextEl.startTime - oldEnd) <= 12_000;
						const maxAllowedDuration =
							nextEl && !wasContiguousWithNext
								? Math.max(60_000, nextEl.startTime - shiftedEl.startTime)
								: actualTicks;
						const nextDuration = Math.min(actualTicks, maxAllowedDuration);
						if (wasContiguousWithNext) {
							rippleShift += nextDuration - shiftedEl.duration;
						}
						tracksChanged = true;
						return {
							...shiftedEl,
							duration: nextDuration,
							sourceDuration: actualTicks,
						};
					}
					if (
						shiftedEl.sourceDuration !== actualTicks &&
						(wasFallback5s || wasFallback10s)
					) {
						tracksChanged = true;
						return {
							...shiftedEl,
							sourceDuration: actualTicks,
						};
					}
					return shiftedEl;
				});
			};

			const nextOverlay = activeScene.tracks.overlay.map((track) => {
				if (track.type !== "video") return track;
				return {
					...track,
					elements: healTrackElements(track.elements),
				};
			});

			let nextMainElements = healTrackElements(
				activeScene.tracks.main.elements,
			);

			if (
				tracksChanged &&
				nextMainElements.length === 1 &&
				nextMainElements[0]?.type === "image" &&
				nextMainElements[0]?.duration === 600_000
			) {
				nextMainElements = [
					{
						...nextMainElements[0],
						duration: actualTicks,
					},
				];
			}

			if (tracksChanged) {
				editor.timeline.updateTracks({
					...activeScene.tracks,
					overlay: nextOverlay,
					main: {
						...activeScene.tracks.main,
						elements: nextMainElements,
					},
				});
				void editor.project.saveCurrentProject();
			}
		};

		const handleVideoMetadata = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					mediaId?: string;
					duration?: number;
					width?: number;
					height?: number;
					isIntrinsic?: boolean;
					thumbnailDataUrl?: string;
				}>
			).detail;
			applyVideoMetadata(detail);
		};

		// Immediately apply any metadata already discovered while EditorProvider was loading
		for (const discovered of videoCache.getDiscoveredMetadata()) {
			applyVideoMetadata(discovered);
		}

		window.addEventListener(
			"opencut-video-metadata-ready",
			handleVideoMetadata,
		);
		return () =>
			window.removeEventListener(
				"opencut-video-metadata-ready",
				handleVideoMetadata,
			);
	}, [editor]);

	useEditorActions();
	useKeybindingsListener();
	return null;
}
