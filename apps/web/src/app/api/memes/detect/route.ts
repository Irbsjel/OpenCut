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
	kind: "meme" | "image";
	memeId: string;
	memeName: string;
	imageUrl: string;
	caption: string;
	imagePrompt?: string;
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
		path.join(home, "sistema/tools/nerv-sinapsis/keys_pool.json"),
	].filter((p): p is string => Boolean(p));
}

const GEMINI_MODELS = [
	"gemini-3.1-flash-lite-preview",
	"gemini-3-flash-preview",
	"gemini-flash-lite-latest",
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

	if (result.length < limit) {
		const step = Math.max(
			1,
			Math.floor(CATALOG.length / (limit - result.length)),
		);
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
				max_tokens: 1500,
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
		// proceed to keys_pool.json
	}

	const providers = await loadSinaiPool();
	if (!providers) return null;

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
							maxOutputTokens: 4096,
							...(model.startsWith("gemini-3") && {
								thinkingConfig: { thinkingBudget: 0 },
							}),
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
							max_tokens: 1500,
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

const CONCEPTUAL_IMAGE_KEYWORDS = [
	"cerebro",
	"hemisferio",
	"hemisferios",
	"neurona",
	"neuronal",
	"sinapsis",
	"puente",
	"corteza",
	"amigdala",
	"memoria",
	"universo",
	"cosmos",
	"ciencia",
	"fisica",
	"atomo",
	"energia",
	"evolucion",
	"historia",
	"aprendizaje",
];

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

		// Check if this cue is better suited for an illustrative AI image instead of a meme
		const matchedConcept = CONCEPTUAL_IMAGE_KEYWORDS.find((kw) =>
			norm.includes(kw),
		);
		if (matchedConcept) {
			lastPlacedTime = cue.startTime;
			const cleanWords = cue.text
				.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
				.trim()
				.split(/\s+/)
				.slice(0, 5)
				.join(" ");
			const prompt = `3D vibrant conceptual illustration representing "${cue.text.trim()}", glowing neural or scientific visual metaphor, cinematic lighting, centered subject, no text`;
			placements.push({
				cueIndex: cue.index,
				kind: "image",
				memeId: "ai-generated-image",
				memeName: `Imagen IA · ${cleanWords}`,
				imageUrl: `/videos/api/memes/generate-image?prompt=${encodeURIComponent(prompt)}`,
				caption: cleanWords,
				imagePrompt: prompt,
			});
			continue;
		}

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
				kind: "meme",
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
			"Eres el director creativo visual de Sinaí para edición de video viral y educativo. " +
			"Tu tarea es analizar las líneas de subtítulos de un video y elegir SOLO aquellos momentos clave (dejando al menos 7 a 12 segundos entre uno y otro) donde insertar un apoyo visual en pantalla. " +
			"Para cada momento elegido, DEBES decidir inteligentemente si conviene más:\n" +
			"A) `\"kind\": \"meme\"`: Cuando el momento es cómico, irónico, sarcástico o de reacción cotidiana -> elige un `memeId` válido del catálogo (todos son reacciones de una sola imagen, JAMÁS plantillas) y escribe un `caption` corto y gracioso en español (máximo 7 palabras) que se entienda en una sola imagen.\n" +
			"B) `\"kind\": \"image\"`: Cuando en vez de un meme conviene más una IMAGEN ILUSTRATIVA O CONCEPTUAL (por ejemplo, cuando se explica el cerebro, un puente neuronal, una metáfora visual, ciencia, emociones profundas o aprendizaje) -> pon `\"kind\": \"image\"`, escribe un `imagePrompt` en inglés descriptivo y cinematográfico para generar esa imagen con IA (sin texto ni letras dentro de la imagen), y un `caption` corto en español (3 a 5 palabras) como título.\n" +
			"REGLAS ESTRICTAS:\n" +
			"1. Combina memes reales (`kind: \"meme\"`) en momentos de humor/reacción e imágenes generadas (`kind: \"image\"`) en momentos conceptuales/explicativos.\n" +
			"2. No repitas el mismo `memeId`.\n" +
			'3. Devuelve ÚNICAMENTE JSON válido con el formato: {"placements": [{"cueIndex": 4, "kind": "meme", "memeId": "sad-escobar", "caption": "LO TENÍAS EN LA PUNTA DE LA LENGUA"}, {"cueIndex": 64, "kind": "image", "imagePrompt": "3D glowing neural bridge connecting two brain hemispheres, cinematic volumetric lighting, no text", "caption": "PUENTE NEURONAL"}]}';

		const userPrompt =
			`CATÁLOGO DE MEMES DISPONIBLES (preseleccionados de ${CATALOG.length} memes de una sola imagen):\n${catalogSummary}\n\n` +
			`SUBTÍTULOS DEL VIDEO:\n${cuesSummary}\n\n` +
			"Selecciona los momentos ideales decidiendo en cada uno si conviene más `meme` o `image` y responde solo en JSON.";

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
						kind?: "meme" | "image";
						memeId?: string;
						caption?: string;
						imagePrompt?: string;
					}>;
				};

				if (Array.isArray(parsed.placements) && parsed.placements.length > 0) {
					const validPlacements: DetectedMemePlacement[] = [];
					let lastSec = -999;
					const hasLaterCues = rawCues.some((c) => c.startTime >= 2.2);

					for (const item of parsed.placements) {
						const cueIdx = Number(item.cueIndex);
						const cue = rawCues.find((c) => c.index === cueIdx);
						if (!cue) continue;
						if (hasLaterCues && cue.startTime < 2.2) continue;
						if (cue.startTime - lastSec < 5.5) continue;

						if (item.kind === "image" || (!item.memeId && item.imagePrompt)) {
							const prompt = String(
								item.imagePrompt ||
									`3D cinematic conceptual illustration of ${cue.text}`,
							).trim();
							const caption = String(item.caption || cue.text)
								.trim()
								.slice(0, 42);
							lastSec = cue.startTime;
							validPlacements.push({
								cueIndex: cue.index,
								kind: "image",
								memeId: "ai-generated-image",
								memeName: `Imagen IA · ${caption}`,
								imageUrl: `/videos/api/memes/generate-image?prompt=${encodeURIComponent(prompt)}`,
								caption,
								imagePrompt: prompt,
							});
							continue;
						}

						const meme = item.memeId ? CATALOG_MAP.get(item.memeId) : undefined;
						if (!meme) continue;
						lastSec = cue.startTime;

						validPlacements.push({
							cueIndex: cue.index,
							kind: "meme",
							memeId: meme.id,
							memeName: meme.name,
							imageUrl: `/videos/api/memes/image?id=${encodeURIComponent(meme.id)}`,
							caption: String(item.caption || meme.name)
								.trim()
								.slice(0, 48),
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
						: "Error detectando memes e imágenes contextuales.",
			},
			{ status: 500 },
		);
	}
}
