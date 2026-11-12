import { expect, test } from "bun:test";
import { VideoCache } from "./service";
import { ExportStepTimeout } from "@/export/wait-for-step";

function fixture() {
	const cache = new VideoCache() as any;
	cache.exportMode = true;
	const sink = {
		mediaId: "test",
		disposed: false,
		duration: 10,
		frameStep: 1 / 24,
		slots: [],
		lastUsedWallMs: 0,
	};
	cache.sinks.set("test", sink);
	return { cache, sink, file: new File([], "test.mp4") };
}
test("a stalled decoder is retired before a native recovery of the same requested time", async () => {
	const { cache, sink, file } = fixture();
	let calls = 0,
		retired = 0;
	let oldSignal: AbortSignal;
	const frame = {
		canvas: { width: 10, height: 10 },
		timestamp: 2,
		duration: 1 / 24,
	};
	cache.disposeExportDecoderState = () => retired++;
	cache.obtainExactExportFrame = async (
		s: any,
		t: number,
		signal: AbortSignal,
	) => {
		calls++;
		expect(t).toBe(2);
		if (calls === 1) {
			oldSignal = signal;
			throw new ExportStepTimeout("decoder", 20000);
		}
		expect(oldSignal!.aborted).toBe(true);
		expect(retired).toBe(1);
		expect(s.exportSinkFailed).toBe(true);
		return frame;
	};
	expect(await cache.getFrameAt({ mediaId: "test", file, time: 2 })).toBe(
		frame,
	);
	expect(calls).toBe(2);
	expect(cache.exportWaiters.size).toBe(0);
	expect(cache.exportingMedia.size).toBe(0);
});
test("stopping export interrupts pending decode and releases its pin", async () => {
	const { cache, file } = fixture();
	cache.obtainExactExportFrame = () => new Promise(() => {});
	const waiting = cache.getFrameAt({ mediaId: "test", file, time: 2 });
	await Promise.resolve();
	await Promise.resolve();
	cache.setExportMode(false);
	await expect(waiting).rejects.toThrow("AbortError");
	expect(cache.exportWaiters.size).toBe(0);
	expect(cache.exportingMedia.size).toBe(0);
});
test("idle eviction never closes a decoder while an export frame is waiting", () => {
	const cache = new VideoCache() as any;
	for (let i = 0; i < 8; i++)
		cache.sinks.set(String(i), {
			mediaId: String(i),
			lastUsedWallMs: performance.now() - 10000 + i,
			slots: [],
		});
	cache.exportingMedia.add("0");
	const closed: string[] = [];
	cache.clearVideoSink = ({ mediaId }: { mediaId: string }) => {
		closed.push(mediaId);
		cache.sinks.delete(mediaId);
	};
	cache.evictIdleVideoSinks();
	expect(closed).not.toContain("0");
	expect(cache.sinks.has("0")).toBe(true);
});
