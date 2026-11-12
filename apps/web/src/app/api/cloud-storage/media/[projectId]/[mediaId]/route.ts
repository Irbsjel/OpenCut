import { appendMediaChunk, ChunkUploadError } from "@/services/storage/chunk-upload";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getMediaPoolDir(): string {
	const root =
		process.env.OPENCUT_CLOUD_DIR ||
		path.resolve(process.cwd(), "../../cloud-storage");
	return path.join(root, "media-pool");
}

function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function HEAD(
	req: NextRequest,
	context: { params: Promise<{ projectId: string; mediaId: string }> },
) {
	try {
		const { projectId, mediaId } = await context.params;
		const diag = req.nextUrl.searchParams.get("diag");
		if (diag) {
			console.log(`[cloud-media-diag] project=${projectId} media=${mediaId} diag=${diag}`);
		}
		const safeMediaId = sanitizeId(mediaId);
		const filePath = path.join(getMediaPoolDir(), safeMediaId);
		const stat = await fs.stat(filePath).catch(() => null);
		if (stat && stat.isFile() && stat.size > 0) {
			return new NextResponse(null, {
				status: 200,
				headers: {
					"Content-Length": String(stat.size),
				},
			});
		}
		const partStat = await fs.stat(`${filePath}.part`).catch(() => null);
		const partSize = partStat && partStat.isFile() ? partStat.size : 0;
		return new NextResponse(null, {
			status: 404,
			headers: {
				"X-Part-Size": String(partSize),
			},
		});
	} catch {
		return new NextResponse(null, { status: 404 });
	}
}

export async function GET(
	req: NextRequest,
	context: { params: Promise<{ projectId: string; mediaId: string }> },
) {
	try {
		const { mediaId } = await context.params;
		const safeMediaId = sanitizeId(mediaId);
		if (!safeMediaId) return new NextResponse(null, { status: 400 });
		const filePath = path.join(getMediaPoolDir(), safeMediaId);
		const stat = await fs.stat(filePath);
		if (!stat.isFile()) return new NextResponse(null, { status: 404 });
		const headers: Record<string, string> = {
			"Content-Type": "application/octet-stream",
			"Accept-Ranges": "bytes",
			"Cache-Control": "public, max-age=31536000, immutable",
		};
		let start = 0;
		let end = stat.size - 1;
		const range = req.headers.get("range");
		if (range) {
			const match = /^bytes=(\d*)-(\d*)$/.exec(range);
			if (!match || (!match[1] && !match[2]) || stat.size === 0) {
				return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
			}
			if (!match[1]) {
				start = Math.max(0, stat.size - Number(match[2]));
			} else {
				start = Number(match[1]);
				if (match[2]) end = Math.min(end, Number(match[2]));
			}
			if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
				return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
			}
			headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
		}
		headers["Content-Length"] = String(Math.max(0, end - start + 1));
		if (stat.size === 0) return new NextResponse(null, { headers });
		const stream = createReadStream(filePath, { start, end });
		return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
			status: range ? 206 : 200,
			headers,
		});
	} catch {
		return NextResponse.json({ error: "Media not found" }, { status: 404 });
	}
}

export async function PUT(
	req: NextRequest,
	context: { params: Promise<{ projectId: string; mediaId: string }> },
) {
	try {
		const { mediaId } = await context.params;
		const safeMediaId = sanitizeId(mediaId);
		if (!safeMediaId) {
			return NextResponse.json({ error: "Invalid mediaId" }, { status: 400 });
		}
		const poolDir = getMediaPoolDir();
		await fs.mkdir(poolDir, { recursive: true });
		const filePath = path.join(poolDir, safeMediaId);

		const offsetParam = req.nextUrl.searchParams.get("offset");
		const doneParam = req.nextUrl.searchParams.get("done");
		const arrayBuffer = await req.arrayBuffer();
		if (arrayBuffer.byteLength === 0) {
			return NextResponse.json({ error: "Empty chunk" }, { status: 400 });
		}

		if (offsetParam !== null) {
			const offset = Number(offsetParam);
			const buf = Buffer.from(arrayBuffer);
			const totalParam = req.nextUrl.searchParams.get("totalSize");
			await appendMediaChunk({
				filePath,
				offset,
				buffer: buf,
				done: doneParam === "1",
				totalSize: totalParam === null ? undefined : Number(totalParam),
			});
			console.log(
				`[cloud-media-put] media=${safeMediaId} offset=${offset} len=${buf.byteLength} done=${doneParam}`,
			);
			return NextResponse.json({
				ok: true,
				offset,
				size: arrayBuffer.byteLength,
				done: doneParam === "1",
			});
		}

		const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
		await fs.writeFile(tmpPath, Buffer.from(arrayBuffer));
		await fs.rename(tmpPath, filePath);

		return NextResponse.json({
			ok: true,
			size: arrayBuffer.byteLength,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Upload failed" },
			{ status: error instanceof ChunkUploadError ? error.status : 500 },
		);
	}
}
