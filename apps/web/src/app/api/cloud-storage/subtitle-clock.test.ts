import { afterAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET } from "./route";

const root = await mkdtemp(path.join(os.tmpdir(), "opencut-subtitle-clock-"));
const previousRoot = process.env.OPENCUT_CLOUD_DIR;
afterAll(async () => {
	if (previousRoot === undefined) delete process.env.OPENCUT_CLOUD_DIR;
	else process.env.OPENCUT_CLOUD_DIR = previousRoot;
	await rm(root, { recursive: true, force: true });
});

test("cloud reads preserve every cue and karaoke clock across image intervals", async () => {
	process.env.OPENCUT_CLOUD_DIR = root;
	await mkdir(path.join(root, "projects"));
	const words = JSON.stringify([
		{ word: "HOLA", startOffset: 0, endOffset: 1 },
	]);
	const cues = [
		{ id: "before", startTime: 0, duration: 240000 },
		{ id: "inside", startTime: 300000, duration: 120000 },
		{ id: "straddling", startTime: 540000, duration: 240000 },
		{ id: "after", startTime: 840000, duration: 120000 },
	].map((c) => ({
		...c,
		type: "text",
		name: "Subtítulo",
		params: { isSubtitle: true, content: "HOLA", wordTimings: words },
	}));
	const project = {
		metadata: {
			id: "sync-test",
			name: "Sync",
			updatedAt: new Date().toISOString(),
		},
		settings: { canvasSize: { width: 1080, height: 1920 } },
		scenes: [
			{
				tracks: {
					main: { elements: [] },
					audio: [],
					overlay: [
						{
							type: "video",
							elements: [
								{
									id: "image",
									type: "image",
									startTime: 120000,
									duration: 480000,
									params: { isSubtitleOverlay: true },
								},
							],
						},
						{ type: "text", elements: cues },
					],
				},
			},
		],
	};
	await writeFile(
		path.join(root, "projects/sync-test.json"),
		JSON.stringify({ project, mediaMetadata: [] }),
	);
	for (let read = 0; read < 3; read++) {
		const response = await GET(
			new NextRequest("http://localhost/videos/api/cloud-storage?id=sync-test"),
		);
		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result.project.scenes[0].tracks.overlay[1].elements).toEqual(cues);
	}
});
