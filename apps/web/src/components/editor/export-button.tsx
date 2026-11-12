"use client";

import { useEffect, useState } from "react";
import {
	loadCompletedExport,
	saveCompletedExport,
	type CompletedExport,
} from "@/export/completed-export";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import {
	getExportMimeType,
	getExportFileExtension,
	downloadBuffer,
} from "@/export";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/export/defaults";
import {
	buildInterchangeTimeline,
	INTERCHANGE_FORMATS,
	INTERCHANGE_META,
	serializeInterchange,
	type InterchangeFormat,
} from "@/services/interchange";
import { TICKS_PER_SECOND } from "@/wasm";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const exportState = useEditor((e) => e.project.getExportState());
	const hasProject = !!activeProject;

	const handlePopoverOpenChange = ({ open }: { open: boolean }) => {
		if (!open) {
			if (editor.project.getExportState().isExporting) {
				setIsExportPopoverOpen(false);
				return;
			}
			// Finished files live independently in the recovery cache.
			editor.project.clearExportState();
		}
		setIsExportPopoverOpen(open);
	};

	return (
		<Popover
			open={isExportPopoverOpen}
			onOpenChange={(open) => handlePopoverOpenChange({ open })}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-md bg-[#38BDF8] px-[0.12rem] py-[0.12rem] text-white",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
					onClick={hasProject ? () => setIsExportPopoverOpen(true) : undefined}
					disabled={!hasProject}
					onKeyDown={(event) => {
						if (hasProject && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							setIsExportPopoverOpen(true);
						}
					}}
				>
					<div className="relative flex items-center gap-1.5 rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7] px-4 py-1 shadow-[0_1px_3px_0px_rgba(0,0,0,0.65)]">
						<HugeiconsIcon icon={TransitionTopIcon} className="z-50 size-3.5" />
						<span className="z-50 text-[0.875rem]">
							{exportState.isExporting
								? `Export ${Math.round(exportState.progress * 100)}%`
								: "Export"}
						</span>
						<div className="absolute top-0 left-0 z-10 flex size-full items-center justify-center rounded-[0.6rem] bg-linear-to-t from-white/0 to-white/50">
							<div className="absolute top-[0.08rem] z-50 h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7]"></div>
						</div>
					</div>
				</button>
			</PopoverTrigger>
			{hasProject && <ExportPopover />}
		</Popover>
	);
}

const EXPORT_ASPECT_PRESETS = [
	{
		id: "9:16" as const,
		label: "9:16 Vertical",
		sub: "1080×1920 · Reels/TikTok/Shorts",
		width: 1080,
		height: 1920,
	},
	{
		id: "16:9" as const,
		label: "16:9 Horizontal",
		sub: "1920×1080 · YouTube/Cine",
		width: 1920,
		height: 1080,
	},
	{
		id: "1:1" as const,
		label: "1:1 Cuadrado",
		sub: "1080×1080 · Feed",
		width: 1080,
		height: 1080,
	},
];

function formatExportDuration(ms: number): string {
	const totalSec = Math.max(0, Math.round(ms / 1000));
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

function ExportPopover() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const exportState = useEditor((e) => e.project.getExportState());
	const {
		isExporting,
		progress,
		result: exportResult,
		totalFrames = 0,
		currentFrame = 0,
		elapsedMs = 0,
	} = exportState;
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [completed, setCompleted] = useState<CompletedExport | null>(null);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [recoveryError, setRecoveryError] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const projectId = activeProject.metadata.id;
	useEffect(() => {
		let active = true;
		setCompleted(null);
		void loadCompletedExport({ projectId })
			.then((record) => {
				if (active && record)
					setCompleted((current) =>
						!current || record.createdAt > current.createdAt ? record : current,
					);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [projectId]);
	useEffect(() => {
		if (!completed) {
			setDownloadUrl(null);
			return;
		}
		const url = URL.createObjectURL(completed.blob);
		setDownloadUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [completed]);

	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);

	const currentCanvasSize = activeProject.settings.canvasSize;
	const currentFitMode = activeProject.settings.canvasFitMode ?? "contain";
	const currentRatio =
		currentCanvasSize.height > 0
			? currentCanvasSize.width / currentCanvasSize.height
			: 16 / 9;
	const activeAspectId =
		Math.abs(currentRatio - 9 / 16) < 0.06
			? "9:16"
			: Math.abs(currentRatio - 16 / 9) < 0.06
				? "16:9"
				: Math.abs(currentRatio - 1) < 0.06
					? "1:1"
					: "custom";

	const handleSelectAspect = (
		preset: (typeof EXPORT_ASPECT_PRESETS)[number],
	) => {
		const isSwitchingToVertical = preset.id === "9:16";
		editor.project.updateSettings({
			settings: {
				canvasSize: { width: preset.width, height: preset.height },
				canvasSizeMode: "preset",
				userSelectedFormat: true,
				...(isSwitchingToVertical && currentRatio > 1
					? { canvasFitMode: "cover" as const }
					: {}),
			},
			pushHistory: true,
		});
		void editor.project.saveCurrentProject();
	};

	const handleSelectFitMode = (fitMode: "contain" | "cover") => {
		editor.project.updateSettings({
			settings: { canvasFitMode: fitMode },
			pushHistory: true,
		});
		void editor.project.saveCurrentProject();
	};

	const handleExport = async () => {
		if (
			!activeProject ||
			isSaving ||
			editor.project.getExportState().isExporting
		)
			return;

		const latestProject = editor.project.getActive();
		const exportCanvasSize = latestProject.settings.canvasSize;
		const exportFitMode = latestProject.settings.canvasFitMode ?? "contain";

		const result = await editor.project.export({
			options: {
				format,
				quality,
				fps: latestProject.settings.fps,
				includeAudio: shouldIncludeAudio,
				canvasSize: exportCanvasSize,
				fitMode: exportFitMode,
			},
		});

		if (result.cancelled) {
			editor.project.clearExportState();
			return;
		}

		if (result.success && result.buffer) {
			const record: CompletedExport = {
				projectId: latestProject.metadata.id,
				filename: `${latestProject.metadata.name}${getExportFileExtension({ format })}`,
				blob: new Blob([result.buffer], {
					type: getExportMimeType({ format }),
				}),
				createdAt: Date.now(),
			};
			setCompleted(record);
			setRecoveryError(false);
			setIsSaving(true);
			// Keep the finished file available even if Brave blocks an automatic download.
			try {
				await saveCompletedExport(record);
			} catch {
				setRecoveryError(true);
			}
			editor.project.clearExportState();
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		editor.project.cancelExport();
	};

	const handleInterchangeExport = (fmt: InterchangeFormat) => {
		const latestProject = editor.project.getActive();
		const assets = editor.media.getAssets();
		const timeline = buildInterchangeTimeline({
			project: latestProject,
			assets,
			ticksPerSecond: TICKS_PER_SECOND,
		});
		const content = serializeInterchange(fmt, timeline);
		const meta = INTERCHANGE_META[fmt];
		const enc = new TextEncoder().encode(content);
		downloadBuffer({
			buffer: enc.buffer as ArrayBuffer,
			filename: `${latestProject.metadata.name || "timeline"}${meta.extension}`,
			mimeType: meta.mime,
		});
	};

	return (
		<PopoverContent
			className="bg-background mr-4 flex w-84 flex-col p-0"
			onInteractOutside={(event) => {
				if (isExporting) {
					event.preventDefault();
				}
			}}
			onEscapeKeyDown={(event) => {
				if (isExporting) {
					event.preventDefault();
				}
			}}
		>
			{exportResult && !exportResult.success ? (
				<ExportError
					error={exportResult.error || "Unknown error occurred"}
					onRetry={handleExport}
				/>
			) : (
				<>
					<div className="flex items-center justify-between p-3 border-b">
						<h3 className="font-medium text-sm">
							{isExporting ? "Exporting project" : "Export project"}
						</h3>
						<span className="text-muted-foreground font-mono text-[11px]">
							{currentCanvasSize.width}×{currentCanvasSize.height}
						</span>
					</div>

					<div className="flex flex-col gap-3">
						{!isExporting && completed && downloadUrl && (
							<div className="mx-3 mt-3 space-y-2 rounded-md border border-green-500/40 p-3">
								<p className="text-sm font-medium">
									Video listo para descargar
								</p>
								<p className="break-all text-xs text-muted-foreground">
									{completed.filename}
								</p>
								<Button asChild className="w-full">
									<a href={downloadUrl} download={completed.filename}>
										Descargar video
									</a>
								</Button>
								<p className="text-xs text-muted-foreground">
									Puedes descargarlo otra vez sin volver a exportar.
								</p>
								{recoveryError && (
									<p className="text-xs text-destructive">
										No se pudo guardar la copia de recuperación. Descárgalo
										antes de cerrar esta pestaña.
									</p>
								)}
							</div>
						)}
						{!isExporting && (
							<>
								<div className="flex flex-col px-3 pt-3 gap-2.5">
									<div className="flex flex-col gap-1.5">
										<Label className="text-xs font-medium">
											Orientación / Formato de salida
										</Label>
										<div className="grid grid-cols-3 gap-1.5">
											{EXPORT_ASPECT_PRESETS.map((preset) => {
												const selected = activeAspectId === preset.id;
												return (
													<button
														key={preset.id}
														type="button"
														onClick={() => handleSelectAspect(preset)}
														className={cn(
															"flex flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center transition cursor-pointer",
															selected
																? "border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold"
																: "border-border hover:bg-accent/50 text-foreground",
														)}
													>
														<span className="text-xs">{preset.label}</span>
														<span className="text-[10px] opacity-75">
															{preset.width}×{preset.height}
														</span>
													</button>
												);
											})}
										</div>
									</div>

									<div className="flex flex-col gap-1.5">
										<Label className="text-xs font-medium">
											Encuadre en el lienzo
										</Label>
										<div className="grid grid-cols-2 gap-1.5">
											<button
												type="button"
												onClick={() => handleSelectFitMode("cover")}
												className={cn(
													"rounded-md border px-2 py-1 text-xs transition cursor-pointer",
													currentFitMode === "cover"
														? "border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold"
														: "border-border hover:bg-accent/50 text-foreground",
												)}
											>
												Rellenar pantalla (Cover)
											</button>
											<button
												type="button"
												onClick={() => handleSelectFitMode("contain")}
												className={cn(
													"rounded-md border px-2 py-1 text-xs transition cursor-pointer",
													currentFitMode === "contain"
														? "border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold"
														: "border-border hover:bg-accent/50 text-foreground",
												)}
											>
												Ajustar con bordes (Fit)
											</button>
										</div>
									</div>
								</div>

								<div className="flex flex-col">
									<Section
										collapsible
										defaultOpen={false}
										showTopBorder={false}
									>
										<SectionHeader>
											<SectionTitle>Format</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={format}
												onValueChange={(value) => {
													if (isExportFormat(value)) {
														setFormat(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mp4" id="mp4" />
													<Label htmlFor="mp4">
														MP4 (H.264) - Better compatibility
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="webm" id="webm" />
													<Label htmlFor="webm">
														WebM (VP9) - Smaller file size
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Quality</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={quality}
												onValueChange={(value) => {
													if (isExportQuality(value)) {
														setQuality(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="low" id="low" />
													<Label htmlFor="low">Low - Smallest file size</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="medium" id="medium" />
													<Label htmlFor="medium">Medium - Balanced</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="high" id="high" />
													<Label htmlFor="high">High - Recommended</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="very_high" id="very_high" />
													<Label htmlFor="very_high">
														Very high - Largest file size
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Audio</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-center space-x-2">
												<Checkbox
													id="include-audio"
													checked={shouldIncludeAudio}
													onCheckedChange={(checked) =>
														setShouldIncludeAudio(!!checked)
													}
												/>
												<Label htmlFor="include-audio">
													Include audio in export
												</Label>
											</div>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>
												Timeline NLE (EDL / FCPXML / OTIO)
											</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="grid grid-cols-3 gap-1.5">
												{INTERCHANGE_FORMATS.map((fmt) => {
													const meta = INTERCHANGE_META[fmt];
													return (
														<Button
															key={fmt}
															type="button"
															variant="outline"
															size="sm"
															className="h-7 text-[11px]"
															title={meta.label}
															onClick={() => handleInterchangeExport(fmt)}
														>
															{meta.extension.toUpperCase()}
														</Button>
													);
												})}
											</div>
										</SectionContent>
									</Section>
								</div>

								<div className="p-3 pt-0">
									<Button
										onClick={handleExport}
										disabled={isSaving}
										className="w-full gap-2"
									>
										<Download className="size-4" />
										Export
									</Button>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-center">
										<p className="text-muted-foreground text-sm font-medium">
											{progress >= 0.98
												? "Finalizando archivo…"
												: `${Math.round(progress * 100)}%`}
										</p>
										{totalFrames > 0 ? (
											<p className="text-muted-foreground font-mono text-xs">
												Frame {currentFrame} / {totalFrames}
											</p>
										) : (
											<p className="text-muted-foreground text-sm">100%</p>
										)}
									</div>
									<Progress value={progress * 100} className="w-full" />
									{elapsedMs > 0 && (
										<div className="text-muted-foreground flex items-center justify-between text-[11px]">
											<span>Elapsed {formatExportDuration(elapsedMs)}</span>
											{progress > 0.03 && progress < 0.99 && (
												<span>
													~
													{formatExportDuration(
														(elapsedMs / progress) * (1 - progress),
													)}{" "}
													remaining
												</span>
											)}
										</div>
									)}
								</div>

								{confirmCancel ? (
									<div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
										<p className="text-xs font-medium">
											Cancel export in progress?
										</p>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												className="h-7 flex-1 text-xs"
												onClick={() => setConfirmCancel(false)}
											>
												Keep exporting
											</Button>
											<Button
												variant="destructive"
												size="sm"
												className="h-7 flex-1 text-xs"
												onClick={() => {
													setConfirmCancel(false);
													handleCancel();
												}}
											>
												Confirm cancel
											</Button>
										</div>
									</div>
								) : (
									<Button
										variant="outline"
										className="w-full rounded-md"
										onClick={() => setConfirmCancel(true)}
									>
										Cancel
									</Button>
								)}
							</div>
						)}
					</div>
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">Export failed</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					Copy
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					Retry
				</Button>
			</div>
		</div>
	);
}
