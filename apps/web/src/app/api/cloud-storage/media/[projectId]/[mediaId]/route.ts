import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

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
	_req: NextRequest,
	context: { params: Promise<{ projectId: string; mediaId: string }> },
) {
	try {
		const { mediaId } = await context.params;
		const safeMediaId = sanitizeId(mediaId);
		const filePath = path.join(getMediaPoolDir(), safeMediaId);
		const data = await fs.readFile(filePath);
		return new NextResponse(data, {
			status: 200,
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Length": String(data.byteLength),
				"Cache-Control": "public, max-age=31536000, immutable",
			},
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
			const offset = Number.parseInt(offsetParam, 10) || 0;
			const partPath = `${filePath}.part`;
			const buf = Buffer.from(arrayBuffer);
			const handle = await fs
				.open(partPath, offset === 0 ? "w" : "r+")
				.catch(() => fs.open(partPath, "w"));
			try {
				await handle.write(buf, 0, buf.byteLength, offset);
				await handle.truncate(offset + buf.byteLength);
			} finally {
				await handle.close();
			}
			if (doneParam === "1") {
				await fs.rename(partPath, filePath);
			}
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
			{ status: 500 },
		);
	}
}
