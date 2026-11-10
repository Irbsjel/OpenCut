"use client";

import { toast } from "sonner";
import type { useEditor } from "@/editor/use-editor";
import type { VideoElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";

type EditorInstance = ReturnType<typeof useEditor>;

export const LAST_FRAME_CONTINUITY_STORAGE_KEY =
	"opencut_last_frame_continuity_ref";

export interface LastFrameContinuityRef {
	name: string;
	sourceClipName: string;
	dataUrl: string;
	width: number;
	height: number;
	timestampSec: number;
	createdAt: number;
}

/**
 * Extrae el ÚLTIMO frame visible de un clip de video (equivalente en navegador a
 * `_extract_last_frame` de M1 `nerv-video/server.py` con `ffmpeg -sseof -0.1 -update 1`):
 * - Toma en cuenta `trimStart + duration` del clip en la línea de tiempo.
 * - Retrocede ~0.06s desde el borde final para garantizar un fotograma decodificado nítido.
 * - Lo inyecta automáticamente como `MediaAsset` tipo `image` en el proyecto activo
 *   (listo para arrastrar al timeline o usar como `start_image_url` / last-frame conditioning).
 * - Descarga el PNG localmente.
 */
export async function extractAndSaveClipLastFrame({
	editor,
	element,
	downloadFile = true,
}: {
	editor: EditorInstance;
	element: VideoElement;
	downloadFile?: boolean;
}): Promise<LastFrameContinuityRef | null> {
	const mediaAssets = editor.media.getAssets();
	const sourceAsset = mediaAssets.find((a) => a.id === element.mediaId);
	const videoSrc =
		sourceAsset?.url ??
		(sourceAsset?.file ? URL.createObjectURL(sourceAsset.file) : null);

	if (!videoSrc) {
		toast.error("No se encontró el archivo de video fuente para extraer el último frame.");
		return null;
	}

	const toastId = toast.loading("Extrayendo último frame (Continuidad IA)…");

	try {
		const video = document.createElement("video");
		video.crossOrigin = "anonymous";
		video.muted = true;
		video.playsInline = true;
		video.preload = "auto";
		video.src = videoSrc;

		await new Promise<void>((resolve, reject) => {
			const onLoaded = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("No se pudo decodificar el video para extraer el último frame."));
			};
			const cleanup = () => {
				video.removeEventListener("loadedmetadata", onLoaded);
				video.removeEventListener("error", onError);
			};
			video.addEventListener("loadedmetadata", onLoaded, { once: true });
			video.addEventListener("error", onError, { once: true });
		});

		const clipEndSec =
			(element.trimStart + element.duration) / TICKS_PER_SECOND;
		const rawTargetSec =
			Number.isFinite(video.duration) && video.duration > 0
				? Math.min(video.duration - 0.06, clipEndSec - 0.06)
				: Math.max(0, clipEndSec - 0.06);
		const targetSec = Math.max(0, rawTargetSec);

		await new Promise<void>((resolve) => {
			const onSeeked = () => {
				video.removeEventListener("seeked", onSeeked);
				resolve();
			};
			video.addEventListener("seeked", onSeeked, { once: true });
			video.currentTime = targetSec;
		});

		const width = video.videoWidth || sourceAsset?.width || 1280;
		const height = video.videoHeight || sourceAsset?.height || 720;

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Contexto 2D no disponible.");
		}
		ctx.drawImage(video, 0, 0, width, height);

		const dataUrl = canvas.toDataURL("image/png");
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob((b) => resolve(b), "image/png"),
		);
		if (!blob) {
			throw new Error("No se pudo codificar el PNG del último frame.");
		}

		const cleanBaseName = (sourceAsset?.name || element.name || "clip")
			.replace(/\.[^.]+$/, "")
			.replace(/[^a-zA-Z0-9_-]+/g, "_")
			.toLowerCase();
		const fileName = `ultimo_frame_${cleanBaseName}_${Math.round(targetSec * 100) / 100}s.png`;
		const pngFile = new File([blob], fileName, { type: "image/png" });
		const objectUrl = URL.createObjectURL(pngFile);

		const activeProject = editor.project.getActive();
		if (activeProject?.metadata?.id) {
			await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset: {
					name: fileName,
					type: "image",
					file: pngFile,
					url: objectUrl,
					thumbnailUrl: dataUrl,
					width,
					height,
					duration: 5,
				},
			});
		}

		const continuityRef: LastFrameContinuityRef = {
			name: fileName,
			sourceClipName: sourceAsset?.name || element.name,
			dataUrl,
			width,
			height,
			timestampSec: targetSec,
			createdAt: Date.now(),
		};

		try {
			localStorage.setItem(
				LAST_FRAME_CONTINUITY_STORAGE_KEY,
				JSON.stringify(continuityRef),
			);
			window.dispatchEvent(
				new CustomEvent("opencut:last-frame-extracted", {
					detail: continuityRef,
				}),
			);
		} catch {
			// Ignore storage quota errors for large dataUrls
		}

		if (downloadFile) {
			const a = document.createElement("a");
			a.href = objectUrl;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}

		toast.success(
			`Último frame extraído (${width}×${height} @ ${targetSec.toFixed(2)}s) y añadido a Assets`,
			{ id: toastId },
		);
		return continuityRef;
	} catch (error) {
		toast.error(
			error instanceof Error
				? error.message
				: "Error al extraer el último frame.",
			{ id: toastId },
		);
		return null;
	}
}
