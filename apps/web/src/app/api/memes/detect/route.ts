import { NextResponse } from "next/server";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import memesCatalog from "@/subtitles/memes-catalog.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CatalogMemeItem {
	id: string;
	name: string;
	imageUrl: string;
	remoteUrl?: string;
	era: "actual" | "clasico";
	keywords: string[];
}

export interface MemePlacementInputCue {
	index: number;
	startTime: number;
	duration: number;
	text: string;
}

export interface DetectedMemePlacement {
	cueIndex: number;
	memeId: string;
	memeName: string;
	imageUrl: string;
	caption: string;
}

const EXCLUDED_TEMPLATE_MEME_IDS = new Set<string>([
	"expanding-brain",
	"galaxy-brain",
	"clown-makeup",
	"panik-kalm",
	"panik-kalm-panik",
	"two-buttons",
	"daily-struggle",
	"distracted-boyfriend",
	"distracted-girlfriend",
	"drake",
	"drakeposting",
	"doge-cheems",
	"winnie-pooh",
	"tuxedo-winnie-the-pooh",
	"trade-offer",
	"bell-curve",
	"midwit",
	"domino-effect",
	"two-guys-bus",
	"two-guys-on-a-bus",
	"scroll-of-truth",
	"change-my-mind",
	"running-away-balloon",
	"left-exit-12-off-ramp",
	"epic-handshake",
	"gru-s-plan",
	"american-chopper-argument",
	"phoebe-teaching-joey",
	"we-have-food-at-home",
	"peter-parker-s-glasses",
	"types-of-headaches",
	"mother-ignoring-kid-drowning-in-a-pool",
	"expectation-vs-reality",
	"grant-gustin-next-to-oliver-queen-s-grave",
	"jim-halpert-pointing-to-whiteboard",
	"who-killed-hannibal",
	"is-this-a-pigeon",
	"woman-yelling-cat",
	"always-has-been",
]);

const CATALOG = (memesCatalog as CatalogMemeItem[]).filter((m) => {
	if (EXCLUDED_TEMPLATE_MEME_IDS.has(m.id)) return false;
	const lower = m.name.toLowerCase();
	if (
		lower.includes("template") ||
		lower.includes("plantilla") ||
		lower.includes(" vs ") ||
		lower.includes("chart") ||
		lower.includes("whiteboard") ||
		lower.includes("sign")
	) {
		return false;
	}
	return true;
});
const CATALOG_MAP = new Map<string, CatalogMemeItem>(
	CATALOG.map((m) => [m.id, m]),
);

function getKeyPoolPaths(): string[] {
	const home = os.homedir();
	return [
		process.env.OPENCUT_KEYS_POOL_PATH,
		path.join(home, ".config/opencut/keys_pool.json"),
	].filter((p): p is string => Boolean(p));
}

const GEMINI_MODELS = [
	"gemini-flash-lite-latest",
	"gemini-2.5-flash",
	"gemini-3.1-flash-lite-preview",
	"gemini-3-flash-preview",
	"gemma-4-26b-a4b-it",
];

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

function normalizeText(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function preselectCandidateMemes(
	cues: MemePlacementInputCue[],
	limit = 90,
): CatalogMemeItem[] {
	// Always include the top 36 iconic reaction/storytelling memes
	const topCurated = CATALOG.slice(0, 36);
	const selectedIds = new Set<string>(topCurated.map((m) => m.id));
	const fullScriptNorm = normalizeText(cues.map((c) => c.text).join(" "));
	const scriptTokens = new Set(
		fullScriptNorm.split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3),
	);

	const scored: Array<{ meme: CatalogMemeItem; score: number }> = [];
	for (let i = 36; i < CATALOG.length; i++) {
		const meme = CATALOG[i]!;
		let score = 0;
		for (const kw of meme.keywords || []) {
			const normKw = normalizeText(kw);
			if (!normKw) continue;
			if (fullScriptNorm.includes(normKw)) {
				score += 5;
			} else if (scriptTokens.has(normKw)) {
				score += 3;
			}
		}
		if (meme.era === "actual") score += 0.5;
		if (score > 0) {
			scored.push({ meme, score });
		}
	}

	scored.sort((a, b) => b.score - a.score);
	const result = [...topCurated];
	for (const item of scored) {
		if (result.length >= limit) break;
		if (!selectedIds.has(item.meme.id)) {
			selectedIds.add(item.meme.id);
			result.push(item.meme);
		}
	}

	// Fill remaining slots with diverse popular templates from the 1414 catalog
	if (result.length < limit) {
		const step = Math.max(1, Math.floor(CATALOG.length / (limit - result.length)));
		for (let i = 36; i < CATALOG.length && result.length < limit; i += step) {
			const m = CATALOG[i]!;
			if (!selectedIds.has(m.id)) {
				selectedIds.add(m.id);
				result.push(m);
			}
		}
	}

	return result;
}

function cleanJsonResponse(raw: string): string {
	let cleaned = raw.trim();
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
	const firstBrace = cleaned.indexOf("{");
	const lastBrace = cleaned.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		return cleaned.slice(firstBrace, lastBrace + 1);
	}
	return cleaned;
}

async function querySinaiPoolJson({
	systemPrompt,
	userPrompt,
}: {
	systemPrompt: string;
	userPrompt: string;
}): Promise<{ rawText: string; engine: string } | null> {
	// 1. Try local OpenAI-compatible AI daemon (127.0.0.1:8099) if active
	try {
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), 4500);
		const resp = await fetch("http://127.0.0.1:8099/v1/chat/completions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				temperature: 0.2,
				max_tokens: 1400,
			}),
			signal: controller.signal,
		});
		clearTimeout(t);
		if (resp.ok) {
			const data = (await resp.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const txt = data.choices?.[0]?.message?.content?.trim();
			if (txt) {
				return { rawText: txt, engine: "local-ai-daemon" };
			}
		}
	} catch {
		// daemon not running on this node, proceed to configured keys_pool.json
	}

	const providers = await loadSinaiPool();
	if (!providers) return null;

	// 2. Rotate across Gemini models in Sinaí pool
	const gemini = providers.gemini;
	const geminiKeys = (gemini?.keys ?? []).filter(
		(k) => typeof k === "string" && k.trim().length > 0,
	);
	const geminiModels = Array.from(
		new Set([
			...GEMINI_MODELS,
			...(gemini?.models ?? []).map((m) => m.replace(/^models\//, "")),
		]),
	);

	for (const apiKey of geminiKeys) {
		for (const model of geminiModels) {
			try {
				const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), 14000);
				const resp = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						systemInstruction: { parts: [{ text: systemPrompt }] },
						contents: [{ role: "user", parts: [{ text: userPrompt }] }],
						generationConfig: {
							responseMimeType: "application/json",
							temperature: 0.25,
							maxOutputTokens: 1600,
						},
					}),
					signal: controller.signal,
				});
				clearTimeout(timer);
				if (!resp.ok) continue;
				const data = (await resp.json()) as {
					candidates?: Array<{
						content?: { parts?: Array<{ text?: string; thought?: boolean }> };
					}>;
				};
				const parts = data.candidates?.[0]?.content?.parts ?? [];
				const txt = parts
					.filter((p) => !p.thought)
					.map((p) => p.text ?? "")
					.join("")
					.trim();
				if (txt) {
					return { rawText: txt, engine: `sinai-gemini:${model}` };
				}
			} catch {
				// next model
			}
		}
	}

	// 3. Rotate across OpenAI-compatible providers in Sinaí pool (openai, cloudflare, groq, cerebras, openrouter)
	for (const provName of [
		"openai",
		"cloudflare",
		"groq",
		"cerebras",
		"openrouter",
		"mistral",
	]) {
		const prov = providers[provName];
		if (!prov) continue;
		const endpoint = (prov.endpoint || prov.base_url || "").trim();
		const keys = (prov.keys ?? []).filter(
			(k) => typeof k === "string" && k.trim().length > 0,
		);
		const models = (prov.models ?? []).filter(
			(m) => typeof m === "string" && m.trim().length > 0,
		);
		if (!endpoint || keys.length === 0 || models.length === 0) continue;

		for (const apiKey of keys) {
			for (const model of models.slice(0, 3)) {
				try {
					const controller = new AbortController();
					const timer = setTimeout(() => controller.abort(), 12000);
					const resp = await fetch(endpoint, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${apiKey}`,
						},
						body: JSON.stringify({
							model,
							messages: [
								{ role: "system", content: systemPrompt },
								{ role: "user", content: userPrompt },
							],
							temperature: 0.25,
							max_tokens: 1400,
						}),
						signal: controller.signal,
					});
					clearTimeout(timer);
					if (!resp.ok) continue;
					const data = (await resp.json()) as {
						choices?: Array<{ message?: { content?: string } }>;
					};
					const txt = data.choices?.[0]?.message?.content?.trim();
					if (txt) {
						return { rawText: txt, engine: `sinai-${provName}:${model}` };
					}
				} catch {
					// next model
				}
			}
		}
	}

	return null;
}

function buildSemanticFallbackPlacements(
	cues: MemePlacementInputCue[],
): DetectedMemePlacement[] {
	const placements: DetectedMemePlacement[] = [];
	let lastPlacedTime = -999;
	const usedMemeIds = new Set<string>();

	const hasLaterCues = cues.some((c) => c.startTime >= 2.2);

	for (const cue of cues) {
		if (hasLaterCues && cue.startTime < 2.2) continue;
		if (cue.startTime - lastPlacedTime < 8.5) continue;
		const norm = normalizeText(cue.text);
		if (norm.length < 10) continue;

		let bestMeme: CatalogMemeItem | null = null;
		let bestScore = 0;

		for (const meme of CATALOG) {
			let score = 0;
			for (const kw of meme.keywords || []) {
				const nkw = normalizeText(kw);
				if (nkw && norm.includes(nkw)) {
					score += nkw.length >= 5 ? 4 : 2;
				}
			}
			if (usedMemeIds.has(meme.id)) score *= 0.35;
			if (score > bestScore) {
				bestScore = score;
				bestMeme = meme;
			}
		}

		if (bestMeme && bestScore >= 2) {
			usedMemeIds.add(bestMeme.id);
			lastPlacedTime = cue.startTime;
			const cleanWords = cue.text
				.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
				.trim()
				.split(/\s+/)
				.slice(0, 5)
				.join(" ");
			placements.push({
				cueIndex: cue.index,
				memeId: bestMeme.id,
				memeName: bestMeme.name,
				imageUrl: `/videos/api/memes/image?id=${encodeURIComponent(bestMeme.id)}`,
				caption: cleanWords,
			});
		}
	}

	return placements;
}

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			cues?: MemePlacementInputCue[];
		};
		const rawCues = Array.isArray(body.cues) ? body.cues : [];
		if (rawCues.length === 0) {
			return NextResponse.json({
				ok: true,
				totalCatalogSize: CATALOG.length,
				placements: [],
			});
		}

		const candidateMemes = preselectCandidateMemes(rawCues, 95);
		const catalogSummary = candidateMemes
			.map(
				(m) =>
					`- "${m.id}": ${m.name} [${m.era}] (${(m.keywords || []).slice(0, 6).join(", ")})`,
			)
			.join("\n");

		const cuesSummary = rawCues
			.map(
				(c) =>
					`[${c.index}] (${c.startTime.toFixed(1)}s - ${(c.startTime + c.duration).toFixed(1)}s): "${c.text.replace(/\s+/g, " ").trim()}"`,
			)
			.join("\n");

		const systemPrompt =
			"Eres el director creativo de Sinaí para edición de video viral y educativo. " +
			"Tu tarea es analizar las líneas de subtítulos de un video y elegir SOLO aquellos momentos clave donde insertar un MEME REAL DE REACCIÓN EN UNA SOLA IMAGEN (que se entienda de inmediato en un vistazo, JAMÁS plantillas multipanel vacías) sea 100% congruente, gracioso o ilustrativo de lo que se está explicando. " +
			"REGLAS ESTRICTAS:\n" +
			"1. NO pongas memes en todas las líneas: selecciona SOLO donde realmente aplique y aporte valor cómico o narrativo (deja al menos 7 a 12 segundos de separación entre un meme y el siguiente).\n" +
			"2. Usa únicamente `memeId` válidos de la lista proporcionada (todos son reacciones directas de una sola imagen, no plantillas) y no repitas el mismo `memeId`.\n" +
			"3. Para cada momento elegido, escribe un `caption` de remate corto, gracioso y 100% entendible en español (máximo 6 palabras) que haga que el meme se entienda por sí mismo en esa sola imagen.\n" +
			'4. Devuelve ÚNICAMENTE JSON válido con el formato: {"placements": [{"cueIndex": 2, "memeId": "waiting-skeleton", "caption": "Esperando a Doña Lucha"}]}';

		const userPrompt =
			`CATÁLOGO DE MEMES DISPONIBLES (preseleccionados de ${CATALOG.length} memes):\n${catalogSummary}\n\n` +
			`SUBTÍTULOS DEL VIDEO:\n${cuesSummary}\n\n` +
			"Selecciona los momentos ideales donde aplica colocar un meme congruente y responde solo en JSON.";

		const aiResponse = await querySinaiPoolJson({
			systemPrompt,
			userPrompt,
		});

		if (aiResponse) {
			try {
				const cleaned = cleanJsonResponse(aiResponse.rawText);
				const parsed = JSON.parse(cleaned) as {
					placements?: Array<{
						cueIndex?: number;
						memeId?: string;
						caption?: string;
					}>;
				};

				if (Array.isArray(parsed.placements) && parsed.placements.length > 0) {
					const validPlacements: DetectedMemePlacement[] = [];
					let lastSec = -999;
					const hasLaterCues = rawCues.some((c) => c.startTime >= 2.2);

					for (const item of parsed.placements) {
						const cueIdx = Number(item.cueIndex);
						const cue = rawCues.find((c) => c.index === cueIdx);
						const meme = item.memeId ? CATALOG_MAP.get(item.memeId) : undefined;
						if (!cue || !meme) continue;
						if (hasLaterCues && cue.startTime < 2.2) continue;
						if (cue.startTime - lastSec < 5.5) continue;
						lastSec = cue.startTime;

						validPlacements.push({
							cueIndex: cue.index,
							memeId: meme.id,
							memeName: meme.name,
							imageUrl: `/videos/api/memes/image?id=${encodeURIComponent(meme.id)}`,
							caption: String(item.caption || meme.name)
								.trim()
								.slice(0, 42),
						});
					}

					if (validPlacements.length > 0) {
						return NextResponse.json({
							ok: true,
							engine: aiResponse.engine,
							totalCatalogSize: CATALOG.length,
							placements: validPlacements,
						});
					}
				}
			} catch {
				// fallback below
			}
		}

		const fallbackPlacements = buildSemanticFallbackPlacements(rawCues);
		return NextResponse.json({
			ok: true,
			engine: "sinai-semantic-catalog",
			totalCatalogSize: CATALOG.length,
			placements: fallbackPlacements,
		});
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Error detectando memes contextuales.",
			},
			{ status: 500 },
		);
	}
}
