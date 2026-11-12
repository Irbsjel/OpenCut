import { expect, test } from "bun:test";
import { trimPreviewFrames } from "./preview-budget";
const frame = () => ({ canvas: { width: 640, height: 360 } });
const bytes = 640 * 360 * 4;

test("frame zero can be evicted and cannot disable the memory limit", () => {
	const cache = {
		lastUsedWallMs: 1,
		scrubCache: new Map(Array.from({ length: 200 }, (_, i) => [i, frame()])),
	};
	trimPreviewFrames([cache], bytes * 24);
	expect(cache.scrubCache.size).toBe(24);
	expect(cache.scrubCache.has(0)).toBe(false);
	expect(cache.scrubCache.has(199)).toBe(true);
});
test("budget spans all videos and favors recently used clips", () => {
	const old = {
		lastUsedWallMs: 1,
		scrubCache: new Map([
			[0, frame()],
			[1, frame()],
		]),
	};
	const active = {
		lastUsedWallMs: 20,
		scrubCache: new Map([
			[0, frame()],
			[1, frame()],
		]),
	};
	trimPreviewFrames([active, old], bytes * 2);
	expect(old.scrubCache.size).toBe(0);
	expect(active.scrubCache.size).toBe(2);
});
test("accounting uses pixel dimensions instead of an arbitrary frame count", () => {
	const cache = {
		lastUsedWallMs: 1,
		scrubCache: new Map([
			[0, { canvas: { width: 1920, height: 1080 } }],
			[1, frame()],
		]),
	};
	trimPreviewFrames([cache], bytes);
	expect([...cache.scrubCache.keys()]).toEqual([1]);
});
