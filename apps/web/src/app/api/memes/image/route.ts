import { NextResponse } from "next/server";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import memesCatalog from "@/subtitles/memes-catalog.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CatalogMeme {
	id: string;
	name: string;
	imageUrl: string;
	remoteUrl?: string;
	era?: string;
	keywords?: string[];
}

const CATALOG = memesCatalog as CatalogMeme[];

function resolveCacheDir(): string {
	const home = os.homedir();
	const roots = [
		process.env.OPENCUT_CLOUD_DIR,
		path.resolve(process.cwd(), "../../cloud-storage"),
		path.join(home, "active/opencut/cloud-storage"),
	].filter((r): r is string => Boolean(r));

	for (const root of roots) {
		if (existsSync(root)) {
			return path.join(root, "meme-cache");
		}
	}
	return "/tmp/opencut-meme-cache";
}

function resolvePublicMemeFile(slug: string): string | null {
	const safe = slug.replace(/[^a-zA-Z0-9_-]/g, "");
	if (!safe) return null;
	const home = os.homedir();
	const bases = [
		path.resolve(process.cwd(), "public/memes"),
		path.resolve(process.cwd(), "apps/web/public/memes"),
		path.join(home, "active/opencut/apps/web/public/memes"),
	];
	for (const base of bases) {
		for (const ext of [".jpg", ".png", ".webp"]) {
			const candidate = path.join(base, `${safe}${ext}`);
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}
	return null;
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const id = (searchParams.get("id") || "").trim();
		const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");

		if (!safeId) {
			return new NextResponse("Missing meme id", { status: 400 });
		}

		// 1. Check built-in public/memes directory
		const localPublic = resolvePublicMemeFile(safeId);
		if (localPublic) {
			const buf = await fs.readFile(localPublic);
			const mime = localPublic.endsWith(".png") ? "image/png" : "image/jpeg";
			return new NextResponse(buf, {
				status: 200,
				headers: {
					"Content-Type": mime,
					"Cache-Control": "public, max-age=31536000, immutable",
					"Access-Control-Allow-Origin": "*",
				},
			});
		}

		// 2. Check cloud-storage/meme-cache
		const cacheDir = resolveCacheDir();
		await fs.mkdir(cacheDir, { recursive: true });
		const cachedJpg = path.join(cacheDir, `${safeId}.jpg`);
		const cachedPng = path.join(cacheDir, `${safeId}.png`);

		for (const candidate of [cachedJpg, cachedPng]) {
			if (existsSync(candidate)) {
				const buf = await fs.readFile(candidate);
				if (buf.byteLength > 256) {
					return new NextResponse(buf, {
						status: 200,
						headers: {
							"Content-Type": candidate.endsWith(".png")
								? "image/png"
								: "image/jpeg",
							"Cache-Control": "public, max-age=31536000, immutable",
							"Access-Control-Allow-Origin": "*",
						},
					});
				}
			}
		}

		// 3. Look up remoteUrl in 1,414-meme catalog and cache on disk
		const entry = CATALOG.find((m) => m.id === safeId);
		const remoteUrl = entry?.remoteUrl || entry?.imageUrl;
		if (!remoteUrl || !remoteUrl.startsWith("http")) {
			return new NextResponse("Meme not found", { status: 404 });
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 12000);
		const resp = await fetch(remoteUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
			},
			signal: controller.signal,
		});
		clearTimeout(timer);

		if (!resp.ok) {
			return new NextResponse("Failed to fetch meme template", { status: 502 });
		}

		const arrayBuf = await resp.arrayBuffer();
		const buf = Buffer.from(arrayBuf);
		const isPng =
			remoteUrl.endsWith(".png") ||
			(resp.headers.get("content-type") || "").includes("png");
		const cacheTarget = isPng ? cachedPng : cachedJpg;
		await fs.writeFile(cacheTarget, buf).catch(() => {});

		return new NextResponse(buf, {
			status: 200,
			headers: {
				"Content-Type": isPng ? "image/png" : "image/jpeg",
				"Cache-Control": "public, max-age=31536000, immutable",
				"Access-Control-Allow-Origin": "*",
			},
		});
	} catch {
		return new NextResponse("Error loading meme image", { status: 500 });
	}
}
