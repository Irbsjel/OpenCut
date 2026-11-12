import { expect, test } from "bun:test";
import { VideoCache } from "./service";

function fixture() {
	const cache = new VideoCache() as any;
	const video = {
		currentTime: 1,
		readyState: 2,
		seeking: false,
		paused: false,
		playbackRate: 1,
		width: 16,
		height: 16,
	};
	const slot = {
		videoEl: video,
		lastTargetTime: -1,
		lastRequestWallMs: 0,
		estimatedRate: 1,
		lastFrame: null,
	};
	const still = {
		canvas: { width: 640, height: 360 },
		timestamp: 1,
		duration: 1 / 30,
	};
	const sink = {
		disposed: false,
		duration: 10,
		frameStep: 1 / 30,
		targetWidth: 640,
		targetHeight: 360,
		metadataDispatched: true,
		scrubCache: new Map([[30, still]]),
	};
	cache.sinks.set("test", sink);
	cache.selectSlotForTime = () => slot;
	cache.syncSinkDimensionsFromVideo = () => false;
	cache.drawSlotFrame = () => {
		throw new Error("Unnecessary intermediate canvas copy");
	};
	cache.obtainExactExportFrame = async () => still;
	cache.playbackActive = true;
	return { cache, video, still };
}

test("playing preview uses native video without an intermediate frame copy", async () => {
	const { cache, video } = fixture();
	const frame = await cache.getFrameAt({
		mediaId: "test",
		file: {} as File,
		time: 1,
		directPreview: true,
	});
	expect(frame.canvas).toBe(video);
	expect(video.width).toBe(640);
	expect((video as any).__frameRevision).toBeGreaterThan(0);
});

test("export always uses an exact captured frame, even when preview is requested", async () => {
	const { cache, still } = fixture();
	cache.exportMode = true;
	expect(
		await cache.getFrameAt({
			mediaId: "test",
			file: {} as File,
			time: 1,
			directPreview: true,
		}),
	).toBe(still);
});

test("paused scrubbing keeps its captured frame instead of a mutable video element", async () => {
	const { cache, still } = fixture();
	cache.playbackActive = false;
	expect(
		await cache.getFrameAt({
			mediaId: "test",
			file: {} as File,
			time: 1,
			directPreview: true,
		}),
	).toBe(still);
});
