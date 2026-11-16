import { NextResponse } from "next/server";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_CACHE_MS = 10 * 60 * 1000;
const SYNTH_TIMEOUT_MS = 4 * 60 * 1000;
let listCache: { at: number; body: unknown } | null = null;

function resolvePythonBinary(): string {
	const candidates = [
		process.env.OPENCUT_TTS_PYTHON_BIN,
		"/usr/bin/python3",
	].filter((c): c is string => Boolean(c));
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return "python3";
}

function resolveScriptPath(): string {
	const home = os.homedir();
	const candidates = [
		path.resolve(process.cwd(), "scripts/tts_engines.py"),
		path.resolve(process.cwd(), "apps/web/scripts/tts_engines.py"),
		path.join(home, "active/opencut/apps/web/scripts/tts_engines.py"),
	];
	return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

function runEngineScript({
	command,
	stdin,
	timeoutMs,
}: {
	command: "list" | "synth";
	stdin?: string;
	timeoutMs: number;
}): Promise<Record<string, unknown>> {
	return new Promise((resolve) => {
		const child = spawn(resolvePythonBinary(), [resolveScriptPath(), command], {
			env: { ...process.env, PYTHONIOENCODING: "utf-8" },
		});
		let out = "";
		let err = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			resolve({ ok: false, error: "El motor de voz tardó demasiado" });
		}, timeoutMs);
		child.stdout.on("data", (d) => {
			out += d.toString();
		});
		child.stderr.on("data", (d) => {
			err += d.toString();
		});
		child.on("close", () => {
			clearTimeout(timer);
			const lastLine = out.trim().split("\n").pop() ?? "";
			try {
				resolve(JSON.parse(lastLine));
			} catch {
				resolve({
					ok: false,
					error: (err || out || "Respuesta inválida del motor").slice(-400),
				});
			}
		});
		if (stdin) child.stdin.write(stdin);
		child.stdin.end();
	});
}

export async function GET(request: Request) {
	const refresh = new URL(request.url).searchParams.has("refresh");
	if (!refresh && listCache && Date.now() - listCache.at < LIST_CACHE_MS) {
		return NextResponse.json(listCache.body);
	}
	const body = await runEngineScript({ command: "list", timeoutMs: 30000 });
	if (body.ok) listCache = { at: Date.now(), body };
	return NextResponse.json(body, { status: body.ok ? 200 : 500 });
}

export async function POST(request: Request) {
	let payload: Record<string, unknown>;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
	}
	const text = String(payload.text ?? "").trim();
	if (!text) {
		return NextResponse.json({ ok: false, error: "El guion está vacío" }, { status: 400 });
	}

	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencut-tts-"));
	try {
		const result = await runEngineScript({
			command: "synth",
			timeoutMs: SYNTH_TIMEOUT_MS,
			stdin: JSON.stringify({
				engine: String(payload.engine ?? "edge"),
				voice: String(payload.voice ?? ""),
				voice2: String(payload.voice2 ?? ""),
				multiSpeaker: Boolean(payload.multiSpeaker),
				rate: Number(payload.rate ?? 0) || 0,
				pitch: Number(payload.pitch ?? 0) || 0,
				text,
				outDir,
			}),
		});
		const filePath = typeof result.path === "string" ? result.path : "";
		if (!result.ok || !filePath.startsWith(outDir)) {
			return NextResponse.json(
				{ ok: false, error: String(result.error ?? "No se generó audio") },
				{ status: 502 },
			);
		}
		const audio = await fs.readFile(filePath);
		return new NextResponse(new Uint8Array(audio), {
			status: 200,
			headers: {
				"Content-Type": String(result.mime ?? "audio/mpeg"),
				"Content-Length": String(audio.byteLength),
				"Cache-Control": "no-store",
			},
		});
	} finally {
		await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
	}
}
