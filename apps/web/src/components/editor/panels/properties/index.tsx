"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getPropertiesConfig } from "./registry";
import { cn } from "@/utils/ui";
import { EmptyView } from "./empty-view";

export function PropertiesPanel() {
	const editor = useEditor();
	useEditor(
		(e) =>
			e.timeline.getPreviewTracks() ?? e.scenes.getActiveSceneOrNull()?.tracks,
	);
	useEditor((e) => e.media.getAssets());
	const { selectedElements } = useElementSelection();
	const { activeTabPerType, setActiveTab } = usePropertiesStore();

	if (selectedElements.length === 0) {
		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-sm border">
				<EmptyView />
			</div>
		);
	}

	if (selectedElements.length > 1) {
		const handleClearMultiEffectsAndTransitions = () => {
			const elementsWithTracks = editor.timeline.getElementsWithTracks({
				elements: selectedElements,
			});
			const updates: Array<{
				trackId: string;
				elementId: string;
				patch: Record<string, unknown>;
			}> = [];
			const standaloneEffectsToDelete: Array<{
				trackId: string;
				elementId: string;
			}> = [];

			for (const { element: el, track: tr } of elementsWithTracks) {
				if (el.type === "effect") {
					standaloneEffectsToDelete.push({
						trackId: tr.id,
						elementId: el.id,
					});
					continue;
				}
				if (
					el.type === "video" ||
					el.type === "image" ||
					el.type === "text" ||
					el.type === "sticker" ||
					el.type === "graphic"
				) {
					const rawParams = (el.params as Record<string, unknown>) ?? {};
					updates.push({
						trackId: tr.id,
						elementId: el.id,
						patch: {
							params: {
								...rawParams,
								animIn: "none",
								animLoop: "none",
								animOut: "none",
								...(el.type === "text" ? { letterAnimation: "none" } : {}),
							},
							effects: [],
						},
					});
				}
			}

			if (updates.length > 0) {
				editor.timeline.updateElements({ updates });
			}
			if (standaloneEffectsToDelete.length > 0) {
				editor.timeline.deleteElements({ elements: standaloneEffectsToDelete });
			}
		};

		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center gap-3 overflow-hidden rounded-sm border p-4 text-center">
				<p className="text-muted-foreground text-sm font-medium">
					{selectedElements.length} clips seleccionados
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={handleClearMultiEffectsAndTransitions}
					className="text-xs"
				>
					Eliminar efectos y transiciones (conservar velocidades)
				</Button>
			</div>
		);
	}

	const mediaAssets = editor.media.getAssets();

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack) return null;

	const { element, track } = elementWithTrack;
	const config = getPropertiesConfig({ element, mediaAssets });
	const visibleTabs = config.tabs;

	const storedTabId = activeTabPerType[element.type];
	const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
	const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
	const activeTab =
		visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

	if (!activeTab) return null;

	return (
		<div className="panel bg-background flex h-full overflow-hidden rounded-sm border">
			<TooltipProvider delayDuration={0}>
				<div className="flex shrink-0 flex-col gap-0.5 border-r p-1 scrollbar-hidden overflow-y-auto">
					{visibleTabs.map((tab) => (
						<Tooltip key={tab.id}>
							<TooltipTrigger asChild>
								<Button
									variant={tab.id === activeTab.id ? "secondary" : "ghost"}
									size="icon"
									onClick={() =>
										setActiveTab({
											elementType: element.type,
											tabId: tab.id,
										})
									}
									aria-label={tab.label}
									className={cn(
										"shrink-0",
										"h-8 w-8",
										tab.id !== activeTab.id && "text-muted-foreground",
									)}
								>
									{tab.icon}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">{tab.label}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</TooltipProvider>
			<ScrollArea className="flex-1 scrollbar-hidden">
				{activeTab.content({ trackId: track.id })}
			</ScrollArea>
		</div>
	);
}
