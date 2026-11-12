import { test, expect } from "bun:test";
import { seekExportVideo } from "./export-seek";
class Video extends EventTarget {
	readyState = 2;
	seeking = false;
	error: MediaError | null = null;
	private t = 0;
	get currentTime() {
		return this.t;
	}
	set currentTime(t: number) {
		this.t = t;
		this.seeking = true;
	}
}
test("waits for requested frame instead of capturing the old frame after 180ms", async () => {
	const v = new Video();
	let done = false;
	const waiting = seekExportVideo({
		video: v as unknown as HTMLVideoElement,
		time: 2,
		timeoutMs: 1000,
	}).then(() => (done = true));
	await new Promise((r) => setTimeout(r, 220));
	expect(done).toBe(false);
	v.seeking = false;
	v.dispatchEvent(new Event("seeked"));
	await waiting;
	expect(done).toBe(true);
});
test("a timed-out seek is an error, never a successful stale frame", async () => {
	const v = new Video();
	await expect(
		seekExportVideo({
			video: v as unknown as HTMLVideoElement,
			time: 2,
			timeoutMs: 10,
		}),
	).rejects.toThrow("no entregó el cuadro");
});
test("source decoding failure is surfaced", async () => {
	const v = new Video();
	const waiting = seekExportVideo({
		video: v as unknown as HTMLVideoElement,
		time: 2,
	});
	v.error = { message: "Invalid NAL unit" } as MediaError;
	v.dispatchEvent(new Event("error"));
	await expect(waiting).rejects.toThrow("Invalid NAL");
});

test("cancelling a pending native seek rejects immediately and removes listeners", async () => {
	const v = new Video();
	const controller = new AbortController();
	const waiting = seekExportVideo({
		video: v as unknown as HTMLVideoElement,
		time: 2,
		signal: controller.signal,
	});
	controller.abort();
	await expect(waiting).rejects.toHaveProperty("name", "AbortError");
});
