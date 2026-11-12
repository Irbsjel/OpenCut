import { getExportMimeType, type ExportFormat } from "./index";

// Keep this call in the click handler: transient activation expires during rendering.
export function chooseExportDestination({
	filename,
	format,
}: {
	filename: string;
	format: ExportFormat;
}): Promise<FileSystemFileHandle | null> {
	const picker = (
		window as Window & {
			showSaveFilePicker?: (options: {
				suggestedName: string;
				types: { description: string; accept: Record<string, string[]> }[];
			}) => Promise<FileSystemFileHandle>;
		}
	).showSaveFilePicker;
	if (!picker) return Promise.resolve(null);
	return picker.call(window, {
		suggestedName: filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-"),
		types: [
			{
				description: `Video ${format.toUpperCase()}`,
				accept: {
					[getExportMimeType({ format })]: [`.${format}`],
				},
			},
		],
	});
}

/** One scratch video per project, streamed to browser storage instead of RAM. */
export async function createExportScratchFile(projectId: string): Promise<{
	handle: FileSystemFileHandle;
	stream: FileSystemWritableFileStream;
} | null> {
	try {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle("export-scratch", {
			create: true,
		});
		const handle = await directory.getFileHandle(`${projectId}.video`, {
			create: true,
		});
		return { handle, stream: await handle.createWritable() };
	} catch {
		// Private browsing and exhausted storage still have the buffer/download fallback.
		return null;
	}
}
