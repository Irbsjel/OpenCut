import { test, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { appendMediaChunk } from "./chunk-upload";
async function fixture(run: (filePath: string) => Promise<void>) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencut-chunks-"));
	try {
		await run(path.join(dir, "asset"));
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}
test("rejects missing first chunk instead of creating zero-filled media", () =>
	fixture(async (filePath) => {
		await expect(
			appendMediaChunk({
				filePath,
				offset: 1024,
				buffer: Buffer.from("last"),
				done: true,
				totalSize: 1028,
			}),
		).rejects.toThrow("Missing chunk");
		expect(await fs.stat(filePath).catch(() => null)).toBeNull();
		expect(await fs.stat(filePath + ".part").catch(() => null)).toBeNull();
	}));
test("preserves complete bytes across resume and an identical retry", () =>
	fixture(async (filePath) => {
		const first = {
			filePath,
			offset: 0,
			buffer: Buffer.from("hello"),
			done: false,
			totalSize: 11,
		};
		await appendMediaChunk(first);
		await appendMediaChunk(first);
		await appendMediaChunk({
			filePath,
			offset: 5,
			buffer: Buffer.from(" world"),
			done: true,
			totalSize: 11,
		});
		expect(await fs.readFile(filePath, "utf8")).toBe("hello world");
	}));
test("conflicting restart cannot truncate an in-progress upload", () =>
	fixture(async (filePath) => {
		await appendMediaChunk({
			filePath,
			offset: 0,
			buffer: Buffer.from("good"),
			done: false,
			totalSize: 8,
		});
		await expect(
			appendMediaChunk({
				filePath,
				offset: 0,
				buffer: Buffer.from("bad!"),
				done: false,
				totalSize: 8,
			}),
		).rejects.toThrow("Conflicting chunk");
		expect(await fs.readFile(filePath + ".part", "utf8")).toBe("good");
	}));
test("incomplete finalize does not replace an existing good media file", () =>
	fixture(async (filePath) => {
		await fs.writeFile(filePath, "original");
		await expect(
			appendMediaChunk({
				filePath,
				offset: 0,
				buffer: Buffer.from("new"),
				done: true,
				totalSize: 9,
			}),
		).rejects.toThrow("Incomplete upload");
		expect(await fs.readFile(filePath, "utf8")).toBe("original");
	}));
