import { expect, test } from "bun:test";
import { ExportStepTimeout, waitForExportStep } from "./wait-for-step";

test("stalled native work fails with its phase rather than waiting forever", async () => {
	await expect(
		waitForExportStep(() => new Promise(() => {}), {
			label: "Codificar cuadro 482",
			timeoutMs: 10,
		}),
	).rejects.toBeInstanceOf(ExportStepTimeout);
});
test("cancel interrupts a native promise which never settles", async () => {
	const controller = new AbortController();
	const waiting = waitForExportStep(() => new Promise(() => {}), {
		label: "Codificar",
		timeoutMs: 10000,
		signal: controller.signal,
	});
	controller.abort();
	await expect(waiting).rejects.toHaveProperty("name", "AbortError");
});
test("already cancelled export does not start native work", async () => {
	const controller = new AbortController();
	controller.abort();
	let called = false;
	await expect(
		waitForExportStep(
			async () => {
				called = true;
			},
			{ label: "Codificar", timeoutMs: 10000, signal: controller.signal },
		),
	).rejects.toHaveProperty("name", "AbortError");
	expect(called).toBe(false);
});
test("native errors and values survive the wrapper", async () => {
	expect(
		await waitForExportStep(async () => 42, {
			label: "Codificar",
			timeoutMs: 100,
		}),
	).toBe(42);
	await expect(
		waitForExportStep(
			async () => {
				throw new Error("disk error");
			},
			{ label: "Guardar", timeoutMs: 100 },
		),
	).rejects.toThrow("disk error");
});
