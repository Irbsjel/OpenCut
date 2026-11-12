import { afterEach, expect, test } from "bun:test";
import { yieldToBrowser } from "./yield-to-browser";
const original = Object.getOwnPropertyDescriptor(globalThis, "scheduler");
afterEach(() => {
	if (original) Object.defineProperty(globalThis, "scheduler", original);
	else Reflect.deleteProperty(globalThis, "scheduler");
});
test("uses scheduler tasks instead of background-throttled timers", async () => {
	let calls = 0;
	Object.defineProperty(globalThis, "scheduler", {
		configurable: true,
		value: {
			yield: async () => {
				calls++;
			},
		},
	});
	await yieldToBrowser();
	expect(calls).toBe(1);
});
test("message-channel fallback yields and closes without requiring timers", async () => {
	Object.defineProperty(globalThis, "scheduler", {
		configurable: true,
		value: undefined,
	});
	let completed = false;
	const promise = yieldToBrowser().then(() => {
		completed = true;
	});
	expect(completed).toBe(false);
	await promise;
	expect(completed).toBe(true);
});
