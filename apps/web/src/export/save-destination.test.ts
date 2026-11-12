import { afterEach, expect, test } from "bun:test";
import { chooseExportDestination } from "./save-destination";

const originalWindow = globalThis.window;
afterEach(() => {
	globalThis.window = originalWindow;
});

test("opens Save As synchronously while the export click still has activation", async () => {
	let called = false;
	const handle = { name: "video.mp4" } as FileSystemFileHandle;
	globalThis.window = {
		showSaveFilePicker(options: any) {
			called = true;
			expect(options.suggestedName).toBe("Clase 9-16.mp4");
			expect(options.types[0].accept).toEqual({ "video/mp4": [".mp4"] });
			return Promise.resolve(handle);
		},
	} as any;
	const result = chooseExportDestination({
		filename: "Clase 9:16.mp4",
		format: "mp4",
	});
	expect(called).toBe(true);
	expect(await result).toBe(handle);
});

test("native dialog cancellation reaches the caller before it starts rendering", async () => {
	globalThis.window = {
		showSaveFilePicker: () =>
			Promise.reject(new DOMException("cancel", "AbortError")),
	} as any;
	await expect(
		chooseExportDestination({ filename: "v.webm", format: "webm" }),
	).rejects.toHaveProperty("name", "AbortError");
});

test("unsupported browsers take the automatic download path", async () => {
	globalThis.window = {} as any;
	expect(
		await chooseExportDestination({ filename: "v.mp4", format: "mp4" }),
	).toBeNull();
});
