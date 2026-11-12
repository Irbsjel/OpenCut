import fs from "node:fs/promises";

export class ChunkUploadError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

/** Never create sparse holes when a partial file is missing or requests race. */
export async function appendMediaChunk({
	filePath,
	offset,
	buffer,
	done,
	totalSize,
}: {
	filePath: string;
	offset: number;
	buffer: Buffer;
	done: boolean;
	totalSize?: number;
}): Promise<void> {
	if (!Number.isSafeInteger(offset) || offset < 0 || buffer.length === 0)
		throw new ChunkUploadError("Invalid chunk offset or size", 400);
	if (
		totalSize !== undefined &&
		(!Number.isSafeInteger(totalSize) ||
			totalSize <= 0 ||
			offset + buffer.length > totalSize)
	)
		throw new ChunkUploadError("Invalid total size", 400);
	const partPath = filePath + ".part",
		lockPath = partPath + ".lock";
	// Locks cover filesystem writes only (the HTTP body is already received).
	const lock = await fs
		.open(lockPath, "wx")
		.catch(async (error: NodeJS.ErrnoException) => {
			if (error.code !== "EEXIST") throw error;
			const stat = await fs.stat(lockPath).catch(() => null);
			if (stat && Date.now() - stat.mtimeMs > 60_000) {
				await fs.unlink(lockPath).catch(() => {});
				return fs.open(lockPath, "wx");
			}
			throw new ChunkUploadError(
				"Another chunk is being written; retry after checking upload offset",
				409,
			);
		});
	try {
		const stat = await fs.stat(partPath).catch(() => null);
		const length = stat?.size ?? 0;
		if (offset > length)
			throw new ChunkUploadError(
				`Missing chunk: expected offset ${length}, received ${offset}`,
				409,
			);
		const handle = await fs.open(partPath, stat ? "r+" : "wx");
		try {
			if (offset < length) {
				if (offset + buffer.length > length)
					throw new ChunkUploadError("Overlapping chunk", 409);
				const previous = Buffer.alloc(buffer.length);
				const read = await handle.read(previous, 0, buffer.length, offset);
				if (read.bytesRead !== buffer.length || !previous.equals(buffer))
					throw new ChunkUploadError(
						"Conflicting chunk; existing bytes preserved",
						409,
					);
			} else {
				let written = 0;
				while (written < buffer.length) {
					const result = await handle.write(
						buffer,
						written,
						buffer.length - written,
						offset + written,
					);
					if (!result.bytesWritten) throw new Error("No upload bytes written");
					written += result.bytesWritten;
				}
			}
			const current = (await handle.stat()).size;
			if (done && totalSize !== undefined && current !== totalSize)
				throw new ChunkUploadError(
					`Incomplete upload: ${current} of ${totalSize} bytes`,
					409,
				);
		} finally {
			await handle.close();
		}
		if (done) await fs.rename(partPath, filePath);
	} finally {
		await lock.close();
		await fs.unlink(lockPath).catch(() => {});
	}
}
