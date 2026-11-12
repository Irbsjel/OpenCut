type CachedFrame = { canvas: { width: number; height: number } };
type PreviewFrames<T extends CachedFrame> = {
	lastUsedWallMs: number;
	scrubCache: Map<number, T>;
};

/** Enforce a project-wide RGBA budget, including frame zero. */
export function trimPreviewFrames<T extends CachedFrame>(
	caches: Iterable<PreviewFrames<T>>,
	maxBytes: number,
): void {
	const entries = [...caches].sort(
		(a, b) => a.lastUsedWallMs - b.lastUsedWallMs,
	);
	let bytes = 0;
	for (const { scrubCache } of entries) {
		for (const { canvas } of scrubCache.values())
			bytes += canvas.width * canvas.height * 4;
	}
	for (const { scrubCache } of entries) {
		for (const [key, { canvas }] of scrubCache) {
			if (bytes <= maxBytes) return;
			bytes -= canvas.width * canvas.height * 4;
			scrubCache.delete(key);
		}
	}
}
