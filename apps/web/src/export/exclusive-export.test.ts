import { afterEach, expect, test } from "bun:test";
import { withExclusiveExport } from "./exclusive-export";
const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => {
	if (original) Object.defineProperty(globalThis, "navigator", original);
	else Reflect.deleteProperty(globalThis, "navigator");
});
test("a held browser export lock refuses a second tab without starting its encoder", async () => {
	let called = false;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			locks: {
				request: async (name: string, options: any, fn: any) => {
					expect(name).toBe("opencut-video-export");
					expect(options.ifAvailable).toBe(true);
					return fn(null);
				},
			},
		},
	});
	const result = await withExclusiveExport(async () => {
		called = true;
		return { success: true };
	});
	expect(result.success).toBe(false);
	expect(called).toBe(false);
});
test("single-tab fallback is exclusive and releases after failure", async () => {
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {},
	});
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	const running = withExclusiveExport(async () => {
		await gate;
		return { success: true };
	});
	expect(
		(await withExclusiveExport(async () => ({ success: true }))).success,
	).toBe(false);
	release();
	expect((await running).success).toBe(true);
	await expect(
		withExclusiveExport(async () => {
			throw new Error("encode failed");
		}),
	).rejects.toThrow("encode failed");
	expect(
		(await withExclusiveExport(async () => ({ success: true }))).success,
	).toBe(true);
});
