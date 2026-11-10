import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SinaiKeysPool {
	providers?: Record<
		string,
		{
			endpoint?: string;
			base_url?: string;
			keys?: string[];
			models?: string[];
		}
	>;
}

function getKeyPoolPaths(): string[] {
	const home = os.homedir();
	return [
		process.env.OPENCUT_KEYS_POOL_PATH,
		path.join(home, ".config/opencut/keys_pool.json"),
		path.join(home, "sistema/tools/nerv-sinapsis/keys_pool.json"),
	].filter((p): p is string => Boolean(p));
}

async function loadSinaiPool(): Promise<SinaiKeysPool["providers"]> {
	for (const p of getKeyPoolPaths()) {
		try {
			if (!existsSync(p)) continue;
			const raw = JSON.parse(await fs.readFile(p, "utf-8")) as SinaiKeysPool;
			if (raw?.providers && typeof raw.providers === "object") {
				return raw.providers;
			}
		} catch {
			// continue
		}
	}
	return {};
}

function resolveCacheDir(): string {
	const home = os.homedir();
	const roots = [
		process.env.OPENCUT_CLOUD_DIR,
		path.resolve(process.cwd(), "../../cloud-storage"),
		path.join(home, "active/opencut/cloud-storage"),
		path.join(home, "sistema/tools/opencut/cloud-storage"),
	].filter((r): r is string => Boolean(r));

	for (const root of roots) {
		if (existsSync(root)) {
			return path.join(root, "meme-cache");
		}
	}
	return "/tmp/opencut-meme-cache";
}

function buildVisualPrompt(rawPrompt: string, subtitleText: string): string {
	const base = (rawPrompt || subtitleText || "conceptual visual metaphor")
		.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
		.trim();
	return (
		`Cinematic 3D conceptual illustration of: ${base}. ` +
		"Single clear expressive subject in the center, vibrant dramatic volumetric lighting, " +
		"high contrast, photorealistic PBR materials, zero text, no letters, no words, no watermarks, 1:1 square composition."
	);
}

async function generateWithCloudflareWorkersAI(
	prompt: string,
): Promise<Buffer | null> {
	const providers = await loadSinaiPool();
	const cf = providers?.cloudflare;
	const apiKey = (cf?.keys ?? []).find(
		(k) => typeof k === "string" && k.trim().length > 0,
	);
	const endpoint = (cf?.endpoint || cf?.base_url || "").trim();
	if (!apiKey || !endpoint.includes("/ai/")) return null;

	const accountBase = endpoint.split("/ai/")[0];
	const models = [
		"@cf/black-forest-labs/flux-1-schnell",
		"@cf/bytedance/stable-diffusion-xl-lightning",
		"@cf/stabilityai/stable-diffusion-xl-base-1.0",
	];

	for (const model of models) {
		try {
			const url = `${accountBase}/ai/run/${model}`;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 16000);
			const payload = { prompt };
			const resp = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"User-Agent": "Mozilla/5.0",
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			clearTimeout(timer);
			if (!resp.ok) continue;

			const contentType = resp.headers.get("content-type") || "";
			if (contentType.includes("application/json")) {
				const data = (await resp.json()) as {
					result?: { image?: string };
				};
				const b64 = data?.result?.image;
				if (b64 && b64.length > 200) {
					return Buffer.from(b64, "base64");
				}
			} else {
				const arr = await resp.arrayBuffer();
				if (arr.byteLength > 512) {
					return Buffer.from(arr);
				}
			}
		} catch {
			// try next model
		}
	}
	return null;
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const promptParam = (searchParams.get("prompt") || "").trim();
		const textParam = (searchParams.get("text") || "").trim();
		if (!promptParam && !textParam) {
			return new NextResponse("Missing prompt or text", { status: 400 });
		}

		const fullPrompt = buildVisualPrompt(promptParam, textParam);
		const hash = createHash("sha1")
			.update(fullPrompt)
			.digest("hex")
			.slice(0, 16);

		const cacheDir = resolveCacheDir();
		await fs.mkdir(cacheDir, { recursive: true });
		const cachedFile = path.join(cacheDir, `ai-img-${hash}.jpg`);

		if (existsSync(cachedFile)) {
			const buf = await fs.readFile(cachedFile);
			if (buf.byteLength > 512) {
				return new NextResponse(buf, {
					status: 200,
					headers: {
						"Content-Type": "image/jpeg",
						"Cache-Control": "public, max-age=31536000, immutable",
						"Access-Control-Allow-Origin": "*",
					},
				});
			}
		}

		const generated = await generateWithCloudflareWorkersAI(fullPrompt);
		if (!generated) {
			return new NextResponse("AI image generation unavailable", {
				status: 502,
			});
		}

		await fs.writeFile(cachedFile, generated).catch(() => {});

		return new NextResponse(generated, {
			status: 200,
			headers: {
				"Content-Type": "image/jpeg",
				"Cache-Control": "public, max-age=31536000, immutable",
				"Access-Control-Allow-Origin": "*",
			},
		});
	} catch {
		return new NextResponse("Error generating contextual image", {
			status: 500,
		});
	}
}
