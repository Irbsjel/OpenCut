import type {
	TranscriptionSegment,
	TranscriptionWord,
} from "@/transcription/types";
import type { SubtitleCue, SubtitleStyleOverrides } from "./types";
import memesCatalogJson from "./memes-catalog.json";

export interface CatalogMeme {
	id: string;
	name: string;
	imageUrl: string;
	remoteUrl?: string;
	era: "actual" | "clasico";
	keywords: string[];
}

/**
 * Multi-panel or blank-box comparison templates ("plantillas") that require multiple text boxes
 * to be understood are excluded so we ONLY place real, self-contained single-image reaction memes.
 */
export const EXCLUDED_TEMPLATE_MEME_IDS = new Set<string>([
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

export function isRealSingleImageMeme(meme: CatalogMeme): boolean {
	if (EXCLUDED_TEMPLATE_MEME_IDS.has(meme.id)) return false;
	const lowerName = meme.name.toLowerCase();
	if (
		lowerName.includes("template") ||
		lowerName.includes("plantilla") ||
		lowerName.includes(" vs ") ||
		lowerName.includes("chart") ||
		lowerName.includes("whiteboard") ||
		lowerName.includes("sign")
	) {
		return false;
	}
	return true;
}

export const MEME_CATALOG: ReadonlyArray<CatalogMeme> = (
	memesCatalogJson as CatalogMeme[]
).filter(isRealSingleImageMeme);

export interface SinaiMemePlacement {
	cueIndex: number;
	kind?: "meme" | "image";
	memeId: string;
	memeName: string;
	imageUrl: string;
	caption: string;
	imagePrompt?: string;
}

export type CaptionPacingMode = "dynamic" | "balanced" | "sentence";

export interface CaptionStylePreset {
	id: string;
	label: string;
	badge: string;
	previewBg: string;
	previewText: string;
	previewAccent: string;
	fontFamily: string;
	fontSize: number;
	fontWeight: "normal" | "bold";
	color: string;
	accentColor: string;
	uppercase?: boolean;
	strokeWidth: number;
	strokeColor: string;
	shadowBlur: number;
	shadowColor: string;
	backgroundEnabled: boolean;
	backgroundColor: string;
	karaokeMode?: "highlight" | "pill";
	cornerRadius: number;
	paddingX: number;
	paddingY: number;
	animIn: string;
	animInDuration: number;
	animLoop: string;
	animLoopSpeed: number;
	animLoopIntensity: number;
	animOut: string;
	animOutDuration: number;
	letterAnimation: string;
}

export const CAPTION_STYLE_PRESETS: ReadonlyArray<CaptionStylePreset> = [
	{
		id: "clean-nofill",
		label: "Sin Fondo",
		badge: "Clean",
		previewBg: "transparent",
		previewText: "#ffffff",
		previewAccent: "#ffffff",
		fontFamily: "Montserrat",
		fontSize: 5.2,
		fontWeight: "bold",
		color: "#ffffff",
		accentColor: "#facc15",
		uppercase: false,
		strokeWidth: 5,
		strokeColor: "#000000",
		shadowBlur: 10,
		shadowColor: "rgba(0,0,0,0.85)",
		backgroundEnabled: false,
		backgroundColor: "transparent",
		karaokeMode: "highlight",
		cornerRadius: 0,
		paddingX: 0,
		paddingY: 0,
		animIn: "fade-in",
		animInDuration: 0.12,
		animLoop: "none",
		animLoopSpeed: 1.0,
		animLoopIntensity: 1.0,
		animOut: "fade-out",
		animOutDuration: 0.12,
		letterAnimation: "none",
	},
	{
		id: "hormozi",
		label: "Hormozi",
		badge: "Sin Fondo",
		previewBg: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
		previewText: "#ffffff",
		previewAccent: "#facc15",
		fontFamily: "Montserrat",
		fontSize: 5.8,
		fontWeight: "bold",
		color: "#ffffff",
		accentColor: "#facc15",
		uppercase: true,
		strokeWidth: 6,
		strokeColor: "#000000",
		shadowBlur: 14,
		shadowColor: "rgba(0,0,0,0.85)",
		backgroundEnabled: false,
		backgroundColor: "#000000",
		karaokeMode: "highlight",
		cornerRadius: 28,
		paddingX: 18,
		paddingY: 10,
		animIn: "zoom-in",
		animInDuration: 0.16,
		animLoop: "letter-karaoke",
		animLoopSpeed: 1.0,
		animLoopIntensity: 1.15,
		animOut: "none",
		animOutDuration: 0.12,
		letterAnimation: "word-karaoke",
	},
	{
		id: "karaoke-pill",
		label: "Karaoke",
		badge: "CapCut",
		previewBg: "linear-gradient(135deg, #090d16 0%, #172554 100%)",
		previewText: "#ffffff",
		previewAccent: "#38bdf8",
		fontFamily: "Montserrat",
		fontSize: 5.4,
		fontWeight: "bold",
		color: "#ffffff",
		accentColor: "#38bdf8",
		uppercase: false,
		strokeWidth: 4,
		strokeColor: "#020617",
		shadowBlur: 10,
		shadowColor: "rgba(0,0,0,0.75)",
		backgroundEnabled: false,
		backgroundColor: "#090d16",
		cornerRadius: 34,
		paddingX: 20,
		paddingY: 10,
		animIn: "pop-elastic",
		animInDuration: 0.18,
		animLoop: "letter-karaoke",
		animLoopSpeed: 1.0,
		animLoopIntensity: 1.0,
		animOut: "none",
		animOutDuration: 0.12,
		letterAnimation: "word-karaoke",
	},
	{
		id: "minimal-clean",
		label: "Fondo Negro",
		badge: "Dark Box",
		previewBg: "#000000",
		previewText: "#ffffff",
		previewAccent: "#facc15",
		fontFamily: "Inter",
		fontSize: 4.8,
		fontWeight: "bold",
		color: "#ffffff",
		accentColor: "#facc15",
		uppercase: false,
		strokeWidth: 0,
		strokeColor: "#000000",
		shadowBlur: 6,
		shadowColor: "rgba(0,0,0,0.5)",
		backgroundEnabled: true,
		backgroundColor: "#000000",
		cornerRadius: 24,
		paddingX: 22,
		paddingY: 11,
		animIn: "fade-in",
		animInDuration: 0.14,
		animLoop: "letter-karaoke",
		animLoopSpeed: 1.0,
		animLoopIntensity: 1.0,
		animOut: "fade-out",
		animOutDuration: 0.12,
		letterAnimation: "word-karaoke",
	},
	{
		id: "white-box",
		label: "Fondo Blanco",
		badge: "Light Box",
		previewBg: "#ffffff",
		previewText: "#09090b",
		previewAccent: "#2563eb",
		fontFamily: "Inter",
		fontSize: 4.8,
		fontWeight: "bold",
		color: "#09090b",
		accentColor: "#2563eb",
		uppercase: false,
		strokeWidth: 0,
		strokeColor: "#ffffff",
		shadowBlur: 8,
		shadowColor: "rgba(0,0,0,0.35)",
		backgroundEnabled: true,
		backgroundColor: "#ffffff",
		cornerRadius: 24,
		paddingX: 22,
		paddingY: 11,
		animIn: "fade-in",
		animInDuration: 0.14,
		animLoop: "letter-karaoke",
		animLoopSpeed: 1.0,
		animLoopIntensity: 1.0,
		animOut: "fade-out",
		animOutDuration: 0.12,
		letterAnimation: "word-karaoke",
	},
	{
		id: "pop-viral",
		label: "Pop",
		badge: "Dinámico",
		previewBg: "linear-gradient(135deg, #3b0764 0%, #1e1b4b 100%)",
		previewText: "#fde047",
		previewAccent: "#f97316",
		fontFamily: "Montserrat",
		fontSize: 5.6,
		fontWeight: "bold",
		color: "#fde047",
		accentColor: "#f97316",
		uppercase: false,
		strokeWidth: 6,
		strokeColor: "#090d16",
		shadowBlur: 12,
		shadowColor: "rgba(0,0,0,0.85)",
		backgroundEnabled: false,
		backgroundColor: "#000000",
		cornerRadius: 28,
		paddingX: 18,
		paddingY: 10,
		animIn: "letter-pop-cascade",
		animInDuration: 0.26,
		animLoop: "none",
		animLoopSpeed: 1.1,
		animLoopIntensity: 1.1,
		animOut: "none",
		animOutDuration: 0.12,
		letterAnimation: "pop-cascade",
	},
	{
		id: "neon-cyber",
		label: "Neón",
		badge: "Glow",
		previewBg: "linear-gradient(135deg, #020617 0%, #083344 100%)",
		previewText: "#ffffff",
		previewAccent: "#00f0ff",
		fontFamily: "Orbitron",
		fontSize: 5.2,
		fontWeight: "bold",
		color: "#ffffff",
		accentColor: "#00f0ff",
		uppercase: true,
		strokeWidth: 3,
		strokeColor: "#083344",
		shadowBlur: 18,
		shadowColor: "#00f0ff",
		backgroundEnabled: false,
		backgroundColor: "#000000",
		cornerRadius: 24,
		paddingX: 16,
		paddingY: 8,
		animIn: "fade-in",
		animInDuration: 0.14,
		animLoop: "letter-neon-pulse",
		animLoopSpeed: 1.15,
		animLoopIntensity: 1.2,
		animOut: "none",
		animOutDuration: 0.12,
		letterAnimation: "neon-pulse",
	},
	{
		id: "meme-impact",
		label: "Meme",
		badge: "Impacto",
		previewBg: "linear-gradient(135deg, #111827 0%, #374151 100%)",
		previewText: "#ffffff",
		previewAccent: "#4ade80",
		fontFamily: "Anton",
		fontSize: 6.2,
		fontWeight: "bold",
		color: "#ffffff",
		accentColor: "#4ade80",
		uppercase: true,
		strokeWidth: 7,
		strokeColor: "#000000",
		shadowBlur: 10,
		shadowColor: "rgba(0,0,0,0.9)",
		backgroundEnabled: false,
		backgroundColor: "#000000",
		cornerRadius: 16,
		paddingX: 16,
		paddingY: 8,
		animIn: "pop-elastic",
		animInDuration: 0.15,
		animLoop: "none",
		animLoopSpeed: 1.0,
		animLoopIntensity: 1.0,
		animOut: "none",
		animOutDuration: 0.12,
		letterAnimation: "none",
	},
];

interface SemanticEmojiRule {
	keywords: string[];
	emoji: string;
	category: string;
	accent: string;
	visualTitle: string;
}

const SEMANTIC_EMOJI_RULES: ReadonlyArray<SemanticEmojiRule> = [
	{
		keywords: [
			"fuego",
			"increible",
			"increíble",
			"brutal",
			"epico",
			"épico",
			"potente",
			"intenso",
			"calor",
			"energia",
			"energía",
			"fire",
			"insane",
			"wild",
			"lit",
		],
		emoji: "🔥",
		category: "impact",
		accent: "#f97316",
		visualTitle: "IMPACTO TOTAL",
	},
	{
		keywords: [
			"idea",
			"mente",
			"cerebro",
			"pensar",
			"piensa",
			"entender",
			"razon",
			"razón",
			"logica",
			"lógica",
			"secreto",
			"saber",
			"aprender",
			"conocimiento",
			"sinapsis",
			"brain",
			"mind",
			"think",
			"smart",
		],
		emoji: "🧠",
		category: "mind",
		accent: "#a855f7",
		visualTitle: "CONCEPTO CLAVE",
	},
	{
		keywords: [
			"luz",
			"solucion",
			"solución",
			"descubrir",
			"descubrimiento",
			"clave",
			"truco",
			"tip",
			"consejo",
			"revelar",
			"brillante",
		],
		emoji: "💡",
		category: "idea",
		accent: "#facc15",
		visualTitle: "IDEA BRILLANTE",
	},
	{
		keywords: [
			"cohete",
			"futuro",
			"avanzar",
			"crecer",
			"despegar",
			"velocidad",
			"espacio",
			"universo",
			"cosmos",
			"estrella",
			"estrellas",
			"galaxia",
			"big bang",
			"rocket",
			"launch",
			"space",
		],
		emoji: "🚀",
		category: "cosmos",
		accent: "#38bdf8",
		visualTitle: "DESPEGUE",
	},
	{
		keywords: [
			"dinero",
			"millones",
			"precio",
			"valor",
			"ganar",
			"negocio",
			"inversion",
			"inversión",
			"ventas",
			"oro",
			"riqueza",
			"money",
			"cash",
			"profit",
		],
		emoji: "💰",
		category: "money",
		accent: "#22c55e",
		visualTitle: "ALTO VALOR",
	},
	{
		keywords: [
			"subir",
			"crecimiento",
			"exito",
			"éxito",
			"resultados",
			"mejorar",
			"nivel",
			"progreso",
			"estadistica",
			"datos",
			"growth",
			"stonks",
		],
		emoji: "📈",
		category: "growth",
		accent: "#10b981",
		visualTitle: "EN ASCENSO",
	},
	{
		keywords: [
			"rapido",
			"rápido",
			"ahora",
			"ya",
			"inmediato",
			"rayo",
			"poder",
			"fuerza",
			"impacto",
			"cambio",
			"transformar",
			"fast",
			"power",
		],
		emoji: "⚡",
		category: "power",
		accent: "#eab308",
		visualTitle: "ALTA ENERGÍA",
	},
	{
		keywords: [
			"mira",
			"mirar",
			"observa",
			"ver",
			"ojo",
			"ojos",
			"atencion",
			"atención",
			"cuidado",
			"fijate",
			"fíjate",
			"look",
			"watch",
			"see",
		],
		emoji: "👀",
		category: "attention",
		accent: "#38bdf8",
		visualTitle: "OJO A ESTO",
	},
	{
		keywords: [
			"peligro",
			"error",
			"errores",
			"problema",
			"nunca",
			"jamas",
			"jamás",
			"prohibido",
			"alerta",
			"fallo",
			"riesgo",
			"warning",
			"stop",
			"wrong",
		],
		emoji: "⚠️",
		category: "warning",
		accent: "#ef4444",
		visualTitle: "ALERTA",
	},
	{
		keywords: [
			"tiempo",
			"segundos",
			"minutos",
			"horas",
			"historia",
			"pasado",
			"antes",
			"despues",
			"después",
			"reloj",
			"esperar",
			"time",
			"wait",
		],
		emoji: "⏳",
		category: "time",
		accent: "#f59e0b",
		visualTitle: "FACTOR TIEMPO",
	},
	{
		keywords: [
			"ganador",
			"campeon",
			"campeón",
			"logro",
			"meta",
			"objetivo",
			"victoria",
			"primero",
			"mejor",
			"top",
			"win",
			"winner",
			"best",
		],
		emoji: "🏆",
		category: "victory",
		accent: "#facc15",
		visualTitle: "META LOGRADA",
	},
	{
		keywords: [
			"exacto",
			"preciso",
			"punto",
			"enfoque",
			"centro",
			"objetivo",
			"clave",
			"target",
			"focus",
		],
		emoji: "🎯",
		category: "target",
		accent: "#f43f5e",
		visualTitle: "EN EL BLANCO",
	},
	{
		keywords: [
			"ciencia",
			"fisica",
			"física",
			"quimica",
			"química",
			"biologia",
			"biología",
			"átomo",
			"atomo",
			"experimento",
			"ley",
			"gravedad",
			"ondas",
		],
		emoji: "🔬",
		category: "science",
		accent: "#06b6d4",
		visualTitle: "CIENCIA VIVA",
	},
	{
		keywords: [
			"inteligencia artificial",
			"ia",
			"robot",
			"codigo",
			"código",
			"sistema",
			"algoritmo",
			"digital",
			"tecnologia",
			"tecnología",
			"ai",
			"tech",
		],
		emoji: "🤖",
		category: "tech",
		accent: "#6366f1",
		visualTitle: "TECNOLOGÍA IA",
	},
	{
		keywords: [
			"amor",
			"corazon",
			"corazón",
			"vida",
			"pasion",
			"pasión",
			"sentir",
			"gracias",
			" Increíble",
			"love",
			"heart",
		],
		emoji: "❤️",
		category: "emotion",
		accent: "#ec4899",
		visualTitle: "EMOCIÓN",
	},
	{
		keywords: [
			"risa",
			"gracioso",
			"broma",
			"chiste",
			"meme",
			"jaja",
			"loco",
			"absurdo",
			"funny",
			"lol",
		],
		emoji: "😂",
		category: "humor",
		accent: "#facc15",
		visualTitle: "MOMENTO MEME",
	},
	{
		keywords: [
			"musica",
			"música",
			"sonido",
			"voz",
			"audio",
			"escucha",
			"escuchar",
			"ritmo",
			"cancion",
			"canción",
		],
		emoji: "🎵",
		category: "audio",
		accent: "#8b5cf6",
		visualTitle: "RITMO Y SONIDO",
	},
	{
		keywords: [
			"mundo",
			"planeta",
			"tierra",
			"global",
			"naturaleza",
			"agua",
			"oceano",
			"océano",
			"origen",
		],
		emoji: "🌍",
		category: "world",
		accent: "#10b981",
		visualTitle: "ORIGEN GLOBAL",
	},
];

export interface ContextualMatch {
	emoji: string;
	category: string;
	accent: string;
	visualTitle: string;
	keyword: string;
}

export function analyzeSubtitleContext(text: string): ContextualMatch {
	const clean = text.toLowerCase().trim();

	for (const rule of SEMANTIC_EMOJI_RULES) {
		for (const kw of rule.keywords) {
			const regex = new RegExp(`(^|[^a-záéíóúñ])${kw}([^a-záéíóúñ]|$)`, "i");
			if (regex.test(clean)) {
				return {
					emoji: rule.emoji,
					category: rule.category,
					accent: rule.accent,
					visualTitle: rule.visualTitle,
					keyword: kw.toUpperCase(),
				};
			}
		}
	}

	if (clean.includes("?") || clean.includes("¿")) {
		return {
			emoji: "🤔",
			category: "question",
			accent: "#f59e0b",
			visualTitle: "¿QUÉ PASA AQUÍ?",
			keyword: "PREGUNTA",
		};
	}

	if (clean.includes("!") || clean.includes("¡")) {
		return {
			emoji: "✨",
			category: "emphasis",
			accent: "#facc15",
			visualTitle: "MOMENTO CLAVE",
			keyword: "ÉNFASIS",
		};
	}

	const words = text
		.trim()
		.replace(/[.,!¡?¿;:"'()]/g, "")
		.split(/\s+/)
		.filter((w) => w.length >= 4);
	const longestWord =
		words.sort((a, b) => b.length - a.length)[0]?.toUpperCase() || "CLAVE";

	return {
		emoji: "✨",
		category: "general",
		accent: "#38bdf8",
		visualTitle: longestWord.slice(0, 16),
		keyword: longestWord.slice(0, 14),
	};
}

export function detectContextualEmoji(text: string): string {
	return analyzeSubtitleContext(text).emoji;
}

export function getSuggestedEmojisForText(text: string): string[] {
	const primary = detectContextualEmoji(text);
	const pool = ["🔥", "🧠", "💡", "🚀", "👀", "⚡", "🎯", "✨", "🤯", "😂", "💰", "🏆"];
	return [primary, ...pool.filter((e) => e !== primary)].slice(0, 8);
}

export function stripTrailingEmoji(text: string): string {
	return text
		.replace(
			/\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][\u{FE0F}\u{200D}]*)+$/gu,
			"",
		)
		.trim();
}

export function toggleEmojiOnText(text: string, emoji?: string): string {
	const base = stripTrailingEmoji(text);
	const chosen = emoji || detectContextualEmoji(base);
	if (text.trim().endsWith(chosen)) {
		return base;
	}
	return `${base} ${chosen}`.trim();
}

export function buildSmartCaptionChunks({
	segments,
	pacing = "balanced",
	autoEmojis = false,
	timeOffsetSeconds = 0,
}: {
	segments: TranscriptionSegment[];
	pacing?: CaptionPacingMode;
	autoEmojis?: boolean;
	timeOffsetSeconds?: number;
}): SubtitleCue[] {
	const maxWordsPerCue =
		pacing === "dynamic" ? 3 : pacing === "balanced" ? 5 : 9;
	const minDuration = pacing === "dynamic" ? 0.45 : 0.65;
	const cues: SubtitleCue[] = [];
	let lastEndTime = 0;

	for (const seg of segments) {
		const rawText = (seg.text ?? "").trim();
		if (!rawText) continue;

		const segStart = Math.max(0, (seg.start ?? 0) + timeOffsetSeconds);
		const segEnd = Math.max(
			segStart + 0.25,
			(seg.end ?? segStart + 1.2) + timeOffsetSeconds,
		);

		const segWords: TranscriptionWord[] =
			Array.isArray(seg.words) && seg.words.length > 0
				? seg.words.map((w) => ({
						word: w.word.trim(),
						start: Math.max(0, w.start + timeOffsetSeconds),
						end: Math.max(
							w.start + timeOffsetSeconds + 0.05,
							w.end + timeOffsetSeconds,
						),
					}))
				: (() => {
						const parts = rawText.split(/\s+/).filter(Boolean);
						const dur = Math.max(0.25, segEnd - segStart);
						const step = dur / Math.max(1, parts.length);
						return parts.map((word, idx) => ({
							word,
							start: Number((segStart + idx * step).toFixed(3)),
							end: Number((segStart + (idx + 1) * step).toFixed(3)),
						}));
					})();

		let currentWords: TranscriptionWord[] = [];

		const flushCurrent = () => {
			if (currentWords.length === 0) return;
			const first = currentWords[0]!;
			const last = currentWords[currentWords.length - 1]!;
			const startTime = Math.max(lastEndTime, first.start);
			const rawDuration = Math.max(minDuration, last.end - startTime);
			let text = currentWords.map((w) => w.word).join(" ").trim();
			let emoji: string | undefined;

			if (autoEmojis && text.length >= 4) {
				const match = analyzeSubtitleContext(text);
				if (match.category !== "general" || cues.length % 2 === 0) {
					emoji = match.emoji;
					text = `${text} ${emoji}`;
				}
			}

			cues.push({
				text,
				startTime: Number(startTime.toFixed(3)),
				duration: Number(rawDuration.toFixed(3)),
				words: [...currentWords],
				emoji,
			});
			lastEndTime = Number((startTime + rawDuration + 0.015).toFixed(3));
			currentWords = [];
		};

		for (let i = 0; i < segWords.length; i++) {
			const w = segWords[i]!;
			const prev = currentWords[currentWords.length - 1];
			const pauseGap = prev ? w.start - prev.end : 0;

			if (prev && pauseGap > 0.42 && currentWords.length >= 2) {
				flushCurrent();
			}

			currentWords.push(w);

			const endsSentence = /[.!?¡¿;:]$/.test(w.word);
			const endsClause = /[,]$/.test(w.word) && currentWords.length >= 3;

			if (
				currentWords.length >= maxWordsPerCue ||
				endsSentence ||
				endsClause
			) {
				flushCurrent();
			}
		}

		flushCurrent();
	}

	return cues;
}

export function buildStyleOverridesFromPreset(
	preset: CaptionStylePreset,
	verticalAlign: "top" | "middle" | "bottom" = "bottom",
): SubtitleStyleOverrides {
	return {
		fontFamily: preset.fontFamily,
		fontSize: preset.fontSize,
		fontWeight: preset.fontWeight,
		color: preset.color,
		textAlign: "center",
		background: {
			enabled: preset.backgroundEnabled,
			color: preset.backgroundColor,
			cornerRadius: preset.cornerRadius,
			paddingX: preset.paddingX,
			paddingY: preset.paddingY,
		},
		placement: {
			verticalAlign,
			marginVerticalRatio: verticalAlign === "bottom" ? 0.12 : 0.08,
		},
	};
}

export interface MemeArchetype {
	id: string;
	label: string;
	emoji: string;
	topText: string;
	bottomText: string;
	bgGradient: [string, string, string];
	accent: string;
}

export const MEME_ARCHETYPES: ReadonlyArray<MemeArchetype> = [
	{
		id: "mind-blown",
		label: "Mind Blown 🤯",
		emoji: "🤯",
		topText: "CUANDO LO DESCUBRES",
		bottomText: "NIVEL CÓSMICO ACTIVADO",
		bgGradient: ["#3b0764", "#7e22ce", "#090d16"],
		accent: "#facc15",
	},
	{
		id: "stonks",
		label: "Stonks 📈",
		emoji: "📈",
		topText: "RENDIMIENTO",
		bottomText: "STONKS +1000%",
		bgGradient: ["#064e3b", "#059669", "#022c22"],
		accent: "#4ade80",
	},
	{
		id: "wait-what",
		label: "Espera... ¿Qué? 👀",
		emoji: "👀",
		topText: "ESPERA UN SEGUNDO...",
		bottomText: "¿CÓMO QUE ASÍ FUNCIONA?",
		bgGradient: ["#1e3a8a", "#2563eb", "#090d16"],
		accent: "#38bdf8",
	},
	{
		id: "this-is-fine",
		label: "Todo Bien 🔥",
		emoji: "🔥",
		topText: "TODO BAJO CONTROL",
		bottomText: "ABSOLUTAMENTE EPICO",
		bgGradient: ["#7c2d12", "#ea580c", "#090d16"],
		accent: "#fde047",
	},
	{
		id: "galaxy-brain",
		label: "Galaxy Brain 🧠",
		emoji: "🧠",
		topText: "CONEXIÓN NEURONAL",
		bottomText: "IQ 9000 DESBLOQUEADO",
		bgGradient: ["#1e1b4b", "#4f46e5", "#020617"],
		accent: "#c084fc",
	},
	{
		id: "epic-win",
		label: "Victoria Épica 🏆",
		emoji: "🏆",
		topText: "EXPECTATIVA VS REALIDAD",
		bottomText: "RESULTADO LEGENDARIO",
		bgGradient: ["#713f12", "#ca8a04", "#090d16"],
		accent: "#fef08a",
	},
];

export function pickMemeArchetypeForText(text: string): MemeArchetype {
	const match = analyzeSubtitleContext(text);
	if (match.category === "mind" || match.category === "idea" || match.category === "science") {
		return MEME_ARCHETYPES[4]!;
	}
	if (match.category === "growth" || match.category === "money") {
		return MEME_ARCHETYPES[1]!;
	}
	if (match.category === "attention" || match.category === "question") {
		return MEME_ARCHETYPES[2]!;
	}
	if (match.category === "impact" || match.category === "warning" || match.category === "power") {
		return MEME_ARCHETYPES[3]!;
	}
	if (match.category === "victory") {
		return MEME_ARCHETYPES[5]!;
	}
	return MEME_ARCHETYPES[0]!;
}

/**
 * Detects whether an image or canvas contains transparent background pixels (alpha < 240).
 */
export function hasTransparentPixels(
	source: HTMLImageElement | HTMLCanvasElement,
): boolean {
	try {
		const w =
			"naturalWidth" in source
				? source.naturalWidth || source.width
				: source.width;
		const h =
			"naturalHeight" in source
				? source.naturalHeight || source.height
				: source.height;
		if (w <= 0 || h <= 0) return false;
		const probeSize = 64;
		const c = document.createElement("canvas");
		c.width = probeSize;
		c.height = probeSize;
		const pctx = c.getContext("2d");
		if (!pctx) return false;
		pctx.clearRect(0, 0, probeSize, probeSize);
		pctx.drawImage(source, 0, 0, probeSize, probeSize);
		const data = pctx.getImageData(0, 0, probeSize, probeSize).data;
		let transparentCount = 0;
		for (let i = 3; i < data.length; i += 16) {
			if ((data[i] ?? 255) < 235) {
				transparentCount++;
				if (transparentCount >= 4) return true;
			}
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Renders a die-cut sticker outline (white or black border) around a transparent foreground canvas
 * while keeping the background 100% transparent.
 */
export function renderTransparentCanvasWithDieCutBorder({
	fgCanvas,
	borderColor = "white",
	borderWidthPx = 11,
}: {
	fgCanvas: HTMLCanvasElement;
	borderColor?: "white" | "black";
	borderWidthPx?: number;
}): HTMLCanvasElement {
	const w = fgCanvas.width;
	const h = fgCanvas.height;
	const out = document.createElement("canvas");
	out.width = w;
	out.height = h;
	const ctx = out.getContext("2d");
	if (!ctx) return fgCanvas;

	ctx.clearRect(0, 0, w, h);

	// Build solid silhouette mask of the foreground in the chosen border color
	const silhouette = document.createElement("canvas");
	silhouette.width = w;
	silhouette.height = h;
	const sctx = silhouette.getContext("2d");
	if (sctx) {
		sctx.clearRect(0, 0, w, h);
		sctx.drawImage(fgCanvas, 0, 0);
		sctx.globalCompositeOperation = "source-in";
		sctx.fillStyle = borderColor === "black" ? "#000000" : "#ffffff";
		sctx.fillRect(0, 0, w, h);
	}

	// Subtle drop shadow under the die-cut sticker so it stands out on any video
	ctx.save();
	ctx.shadowColor =
		borderColor === "black"
			? "rgba(255, 255, 255, 0.35)"
			: "rgba(0, 0, 0, 0.55)";
	ctx.shadowBlur = 16;
	ctx.shadowOffsetY = 4;

	const steps = 24;
	const radii = [borderWidthPx * 0.55, borderWidthPx];
	for (const r of radii) {
		for (let i = 0; i < steps; i++) {
			const angle = (i / steps) * Math.PI * 2;
			const dx = Math.cos(angle) * r;
			const dy = Math.sin(angle) * r;
			ctx.drawImage(silhouette, dx, dy);
		}
	}
	ctx.restore();

	// Draw original transparent foreground on top
	ctx.drawImage(fgCanvas, 0, 0);
	return out;
}

/**
 * Processes an uploaded/custom image file placed from the Subtitles panel:
 * - If the image has NO background (transparent PNG/WebP), keeps it 100% backgroundless
 *   and adds a die-cut white or black border around its silhouette.
 * - If the image has a solid background, adds a clean white or black frame border.
 */
export async function processCustomOverlayImageFile({
	file,
	borderColor = "white",
}: {
	file: File;
	borderColor?: "white" | "black";
}): Promise<File> {
	const objectUrl = URL.createObjectURL(file);
	try {
		const img = await loadMemeImageElement(objectUrl);
		if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
			return file;
		}
		const size = 640;
		const pad = 28;
		const avail = size - pad * 2;
		const scale = Math.min(avail / img.naturalWidth, avail / img.naturalHeight);
		const dw = Math.round(img.naturalWidth * scale);
		const dh = Math.round(img.naturalHeight * scale);
		const dx = Math.round((size - dw) / 2);
		const dy = Math.round((size - dh) / 2);

		const isTransparent = hasTransparentPixels(img);
		let finalCanvas: HTMLCanvasElement;

		if (isTransparent) {
			// Keep 100% transparent background and draw die-cut white/black border around silhouette
			const fg = document.createElement("canvas");
			fg.width = size;
			fg.height = size;
			const fgCtx = fg.getContext("2d");
			if (fgCtx) {
				fgCtx.clearRect(0, 0, size, size);
				fgCtx.drawImage(img, dx, dy, dw, dh);
			}
			finalCanvas = renderTransparentCanvasWithDieCutBorder({
				fgCanvas: fg,
				borderColor,
				borderWidthPx: 12,
			});
		} else {
			// Opaque image: keep clean rounded frame with white or black border
			finalCanvas = document.createElement("canvas");
			finalCanvas.width = size;
			finalCanvas.height = size;
			const ctx = finalCanvas.getContext("2d");
			if (ctx) {
				ctx.clearRect(0, 0, size, size);
				ctx.save();
				ctx.beginPath();
				ctx.roundRect(dx, dy, dw, dh, 24);
				ctx.clip();
				ctx.drawImage(img, dx, dy, dw, dh);
				ctx.restore();

				ctx.strokeStyle = borderColor === "black" ? "#000000" : "#ffffff";
				ctx.lineWidth = 10;
				ctx.beginPath();
				ctx.roundRect(dx, dy, dw, dh, 24);
				ctx.stroke();
			}
		}

		const blob: Blob = await new Promise((resolve) =>
			finalCanvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.95),
		);
		const baseName = file.name.replace(/\.[^.]+$/, "");
		return new File([blob], `${baseName}-sticker-${borderColor}.png`, {
			type: "image/png",
		});
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

/**
 * Generates a 100% backgroundless (transparent PNG) die-cut visual sticker
 * with a configurable white or black silhouette border ("sin fondo y con borde blanco o negro").
 */
export async function generateContextualVisualCardFile({
	text,
	index = 0,
	borderColor = "white",
}: {
	text: string;
	index?: number;
	borderColor?: "white" | "black";
}): Promise<{ file: File; title: string; emoji: string }> {
	const cleanText = stripTrailingEmoji(text);
	const context = analyzeSubtitleContext(cleanText);
	const size = 640;
	const fg = document.createElement("canvas");
	fg.width = size;
	fg.height = size;
	const ctx = fg.getContext("2d");

	if (ctx) {
		// 100% transparent background (NO background rectangle)
		ctx.clearRect(0, 0, size, size);

		// Expressive centerpiece icon/emoji
		ctx.font =
			'228px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(context.emoji, size * 0.5, size * 0.42);

		// Concise concept title directly below with contrasting fill so die-cut border wraps both
		ctx.font = '900 42px "Montserrat", "Inter", sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.lineWidth = 10;
		ctx.strokeStyle = borderColor === "white" ? "#09090b" : "#ffffff";
		ctx.fillStyle = borderColor === "white" ? "#09090b" : "#ffffff";
		const labelText = context.visualTitle.slice(0, 18);
		ctx.strokeText(labelText, size * 0.5, size * 0.77);
		ctx.fillText(labelText, size * 0.5, size * 0.77);
	}

	const borderedCanvas = renderTransparentCanvasWithDieCutBorder({
		fgCanvas: fg,
		borderColor,
		borderWidthPx: 13,
	});

	const blob: Blob = await new Promise((resolve) =>
		borderedCanvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.95),
	);
	const file = new File(
		[blob],
		`sticker-sin-fondo-${borderColor}-${index + 1}.png`,
		{
			type: "image/png",
		},
	);
	return { file, title: context.visualTitle, emoji: context.emoji };
}

/**
 * Generates or extracts a Contextual Meme Card (either using a live captured video frame
 * from the active video or a stylized viral reaction card) with top/bottom Impact meme text.
 */
function normalizeForMemeMatch(str: string): string {
	return str
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

export function getSuggestedMemesForText(
	text: string,
	limit = 6,
): CatalogMeme[] {
	const norm = normalizeForMemeMatch(stripTrailingEmoji(text));
	const tokens = new Set(
		norm.split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3),
	);

	const scored: Array<{ meme: CatalogMeme; score: number }> = [];
	for (let i = 0; i < MEME_CATALOG.length; i++) {
		const meme = MEME_CATALOG[i]!;
		let score = i < 36 ? 0.4 : 0;
		for (const kw of meme.keywords || []) {
			const nkw = normalizeForMemeMatch(kw);
			if (!nkw) continue;
			if (norm.includes(nkw)) {
				score += nkw.length >= 5 ? 6 : 3.5;
			} else if (tokens.has(nkw)) {
				score += 3;
			}
		}
		if (score > 0.5) {
			scored.push({ meme, score });
		}
	}

	scored.sort((a, b) => b.score - a.score);
	const picked: CatalogMeme[] = [];
	const used = new Set<string>();
	for (const item of scored) {
		if (picked.length >= limit) break;
		if (!used.has(item.meme.id)) {
			used.add(item.meme.id);
			picked.push(item.meme);
		}
	}

	for (const fallback of MEME_CATALOG.slice(0, 12)) {
		if (picked.length >= limit) break;
		if (!used.has(fallback.id)) {
			used.add(fallback.id);
			picked.push(fallback);
		}
	}

	return picked;
}

export function searchMemesCatalog(
	query: string,
	limit = 30,
): CatalogMeme[] {
	const q = normalizeForMemeMatch(query.trim());
	if (!q) {
		return MEME_CATALOG.slice(0, limit);
	}
	const results: Array<{ meme: CatalogMeme; score: number }> = [];
	for (const meme of MEME_CATALOG) {
		const nameNorm = normalizeForMemeMatch(meme.name);
		let score = 0;
		if (nameNorm.includes(q)) score += 10;
		for (const kw of meme.keywords || []) {
			const kwNorm = normalizeForMemeMatch(kw);
			if (kwNorm.includes(q) || q.includes(kwNorm)) {
				score += 5;
			}
		}
		if (score > 0) {
			results.push({ meme, score });
		}
	}
	results.sort((a, b) => b.score - a.score);
	return results.slice(0, limit).map((r) => r.meme);
}

export async function detectContextualMemesWithSinaiAI(
	cues: Array<{
		index: number;
		startTime: number;
		duration: number;
		text: string;
	}>,
): Promise<SinaiMemePlacement[]> {
	if (cues.length === 0) return [];
	try {
		const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/videos";
		const resp = await fetch(`${basePath}/api/memes/detect`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cues }),
		});
		if (resp.ok) {
			const data = (await resp.json()) as {
				ok?: boolean;
				placements?: SinaiMemePlacement[];
			};
			if (Array.isArray(data.placements) && data.placements.length > 0) {
				return data.placements;
			}
		}
	} catch {
		// fallback to local semantic selection over the 1,414-meme catalog
	}

	const fallback: SinaiMemePlacement[] = [];
	let lastSec = -999;
	const usedIds = new Set<string>();
	for (const cue of cues) {
		if (cue.startTime - lastSec < 8.5) continue;
		const suggestions = getSuggestedMemesForText(cue.text, 4);
		const chosen = suggestions.find((m) => !usedIds.has(m.id)) ?? suggestions[0];
		if (!chosen) continue;
		usedIds.add(chosen.id);
		lastSec = cue.startTime;
		const shortCaption = stripTrailingEmoji(cue.text)
			.split(/\s+/)
			.slice(0, 5)
			.join(" ");
		fallback.push({
			cueIndex: cue.index,
			memeId: chosen.id,
			memeName: chosen.name,
			imageUrl: `/videos/api/memes/image?id=${encodeURIComponent(chosen.id)}`,
			caption: shortCaption,
		});
	}
	return fallback;
}

function loadMemeImageElement(url: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		const timer = setTimeout(() => resolve(null), 12000);
		img.onload = () => {
			clearTimeout(timer);
			resolve(img);
		};
		img.onerror = () => {
			clearTimeout(timer);
			resolve(null);
		};
		img.src = url;
	});
}

/**
 * Automatically detects and crops out solid white or solid black blank template bars
 * at the top, bottom, left, or right of any meme image so only the real photo is drawn.
 */
function detectPhotoCropRect(img: HTMLImageElement): {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
} {
	const nw = img.naturalWidth || img.width;
	const nh = img.naturalHeight || img.height;
	if (nw <= 32 || nh <= 32) {
		return { sx: 0, sy: 0, sw: nw, sh: nh };
	}
	try {
		const probeW = 96;
		const probeH = 96;
		const c = document.createElement("canvas");
		c.width = probeW;
		c.height = probeH;
		const pctx = c.getContext("2d");
		if (!pctx) return { sx: 0, sy: 0, sw: nw, sh: nh };
		pctx.drawImage(img, 0, 0, probeW, probeH);
		const data = pctx.getImageData(0, 0, probeW, probeH).data;

		const isBlankRow = (y: number): boolean => {
			let whiteCount = 0;
			for (let x = 4; x < probeW - 4; x += 2) {
				const idx = (y * probeW + x) * 4;
				const r = data[idx] ?? 0;
				const g = data[idx + 1] ?? 0;
				const b = data[idx + 2] ?? 0;
				if (r > 240 && g > 240 && b > 240) whiteCount++;
			}
			const samples = Math.floor((probeW - 8) / 2);
			return whiteCount >= samples * 0.88;
		};

		const isBlankCol = (x: number): boolean => {
			let whiteCount = 0;
			for (let y = 4; y < probeH - 4; y += 2) {
				const idx = (y * probeW + x) * 4;
				const r = data[idx] ?? 0;
				const g = data[idx + 1] ?? 0;
				const b = data[idx + 2] ?? 0;
				if (r > 240 && g > 240 && b > 240) whiteCount++;
			}
			const samples = Math.floor((probeH - 8) / 2);
			return whiteCount >= samples * 0.88;
		};

		let top = 0;
		while (top < probeH * 0.48 && isBlankRow(top)) top++;
		let bottom = probeH - 1;
		while (bottom > probeH * 0.52 && isBlankRow(bottom)) bottom--;
		let left = 0;
		while (left < probeW * 0.48 && isBlankCol(left)) left++;
		let right = probeW - 1;
		while (right > probeW * 0.52 && isBlankCol(right)) right--;

		const sx = Math.round((left / probeW) * nw);
		const sy = Math.round((top / probeH) * nh);
		const sw = Math.max(32, Math.round(((right - left + 1) / probeW) * nw));
		const sh = Math.max(32, Math.round(((bottom - top + 1) / probeH) * nh));
		return { sx, sy, sw, sh };
	} catch {
		return { sx: 0, sy: 0, sw: nw, sh: nh };
	}
}

/**
 * Generates a real AI contextual image (via /api/memes/generate-image powered by Flux-1-Schnell)
 * when a subtitle segment is better suited for a conceptual/illustrative image instead of a meme.
 * Preserves transparent backgrounds with white/black die-cut borders if transparent, or frames cleanly.
 */
export async function generateContextualAIImageFile({
	text,
	imagePrompt,
	title,
	index = 0,
	borderColor = "white",
}: {
	text: string;
	imagePrompt?: string;
	title?: string;
	index?: number;
	borderColor?: "white" | "black";
}): Promise<{ file: File; title: string }> {
	const cleanText = stripTrailingEmoji(text);
	const context = analyzeSubtitleContext(cleanText);
	const displayTitle = (title || context.visualTitle).trim().slice(0, 28);
	const effectivePrompt =
		imagePrompt ||
		`3D vibrant conceptual illustration representing "${cleanText}", expressive centerpiece subject, dramatic lighting, no text`;

	const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/videos";
	const genUrl = `${basePath}/api/memes/generate-image?prompt=${encodeURIComponent(effectivePrompt)}&text=${encodeURIComponent(cleanText)}`;
	const loadedImg = await loadMemeImageElement(genUrl);

	if (
		!loadedImg ||
		loadedImg.naturalWidth <= 0 ||
		loadedImg.naturalHeight <= 0
	) {
		const fallbackSticker = await generateContextualVisualCardFile({
			text: cleanText,
			index,
			borderColor,
		});
		return { file: fallbackSticker.file, title: fallbackSticker.title };
	}

	const size = 580;

	if (hasTransparentPixels(loadedImg)) {
		const fg = document.createElement("canvas");
		fg.width = size;
		fg.height = size;
		const fgCtx = fg.getContext("2d");
		if (fgCtx) {
			fgCtx.clearRect(0, 0, size, size);
			const pad = 28;
			const avail = size - pad * 2;
			const scale = Math.min(
				avail / loadedImg.naturalWidth,
				avail / loadedImg.naturalHeight,
			);
			const dw = loadedImg.naturalWidth * scale;
			const dh = loadedImg.naturalHeight * scale;
			fgCtx.drawImage(
				loadedImg,
				(size - dw) / 2,
				(size - dh) / 2,
				dw,
				dh,
			);
		}
		const stickerCanvas = renderTransparentCanvasWithDieCutBorder({
			fgCanvas: fg,
			borderColor,
			borderWidthPx: 12,
		});
		const blob: Blob = await new Promise((resolve) =>
			stickerCanvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.95),
		);
		return {
			file: new File([blob], `imagen-ia-sin-fondo-${index + 1}.png`, {
				type: "image/png",
			}),
			title: displayTitle,
		};
	}

	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		ctx.clearRect(0, 0, size, size);
		const pad = 16;
		const cardW = size - pad * 2;
		const cardH = size - pad * 2;
		const radius = 28;

		ctx.save();
		ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
		ctx.shadowBlur = 22;
		ctx.beginPath();
		ctx.roundRect(pad, pad, cardW, cardH, radius);
		ctx.clip();

		const scaleCover = Math.max(
			cardW / loadedImg.naturalWidth,
			cardH / loadedImg.naturalHeight,
		);
		const dw = loadedImg.naturalWidth * scaleCover;
		const dh = loadedImg.naturalHeight * scaleCover;
		ctx.drawImage(
			loadedImg,
			pad + (cardW - dw) / 2,
			pad + (cardH - dh) / 2,
			dw,
			dh,
		);
		ctx.restore();

		ctx.strokeStyle = borderColor === "black" ? "#000000" : "#ffffff";
		ctx.lineWidth = 7;
		ctx.beginPath();
		ctx.roundRect(pad, pad, cardW, cardH, radius);
		ctx.stroke();
	}

	const blob: Blob = await new Promise((resolve) =>
		canvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.94),
	);
	return {
		file: new File([blob], `imagen-ia-${index + 1}.png`, {
			type: "image/png",
		}),
		title: displayTitle,
	};
}

/**
 * Generates a real Meme Overlay Card (using the 1,414-meme repertoire cached via /api/memes/image)
 * formatted as a clean, understandable square picture-in-picture card for the center of the screen.
 */
export async function generateContextualMemeFile({
	text,
	memeId,
	captionOverride,
	archetypeId,
	sourceCanvas,
	index = 0,
	borderColor = "white",
}: {
	text: string;
	memeId?: string;
	captionOverride?: string;
	archetypeId?: string;
	sourceCanvas?: HTMLCanvasElement | OffscreenCanvas | null;
	index?: number;
	borderColor?: "white" | "black";
}): Promise<{ file: File; label: string; memeId: string }> {
	const suggested = getSuggestedMemesForText(text, 1)[0];
	const targetMeme =
		(memeId ? MEME_CATALOG.find((m) => m.id === memeId) : undefined) ??
		suggested ??
		MEME_CATALOG[0]!;

	const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/videos";
	const proxyUrl = `${basePath}/api/memes/image?id=${encodeURIComponent(targetMeme.id)}`;
	const loadedImg = await loadMemeImageElement(proxyUrl);

	const cleanCaption = stripTrailingEmoji(captionOverride || text)
		.trim()
		.toUpperCase();
	const words = cleanCaption.split(/\s+/).filter(Boolean);
	const topLine =
		words.length > 4
			? words.slice(0, Math.ceil(words.length / 2)).join(" ")
			: cleanCaption;
	const bottomLine =
		words.length > 4
			? words.slice(Math.ceil(words.length / 2), 9).join(" ")
			: "";

	const size = 580;

	// If the loaded meme image has a transparent background (no background),
	// keep it 100% backgroundless and apply the white or black die-cut sticker border!
	if (
		loadedImg &&
		loadedImg.naturalWidth > 0 &&
		loadedImg.naturalHeight > 0 &&
		hasTransparentPixels(loadedImg)
	) {
		const fg = document.createElement("canvas");
		fg.width = size;
		fg.height = size;
		const fgCtx = fg.getContext("2d");
		if (fgCtx) {
			fgCtx.clearRect(0, 0, size, size);
			const pad = 34;
			const availW = size - pad * 2;
			const availH = size - pad * 2 - (topLine ? 56 : 0);
			const scale = Math.min(
				availW / loadedImg.naturalWidth,
				availH / loadedImg.naturalHeight,
			);
			const dw = loadedImg.naturalWidth * scale;
			const dh = loadedImg.naturalHeight * scale;
			const dx = (size - dw) / 2;
			const dy = pad + (availH - dh) / 2;
			fgCtx.drawImage(loadedImg, dx, dy, dw, dh);

			if (topLine) {
				fgCtx.font = '900 32px "Anton", "Impact", "Montserrat", sans-serif';
				fgCtx.textAlign = "center";
				fgCtx.textBaseline = "middle";
				fgCtx.lineJoin = "round";
				fgCtx.lineWidth = 8;
				fgCtx.strokeStyle = "#000000";
				fgCtx.fillStyle = "#ffffff";
				const textY = size - pad - 18;
				fgCtx.strokeText(
					bottomLine ? `${topLine} ${bottomLine}` : topLine,
					size * 0.5,
					textY,
					size - 48,
				);
				fgCtx.fillText(
					bottomLine ? `${topLine} ${bottomLine}` : topLine,
					size * 0.5,
					textY,
					size - 48,
				);
			}
		}
		const stickerCanvas = renderTransparentCanvasWithDieCutBorder({
			fgCanvas: fg,
			borderColor,
			borderWidthPx: 12,
		});
		const blob: Blob = await new Promise((resolve) =>
			stickerCanvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.94),
		);
		const file = new File(
			[blob],
			`meme-sin-fondo-${targetMeme.id}-${index + 1}.png`,
			{
				type: "image/png",
			},
		);
		return { file, label: targetMeme.name, memeId: targetMeme.id };
	}

	// Real single-image reaction meme: crop out any blank white template bars and render
	// with classic top/bottom Impact typography over subtle edge vignettes so faces stay uncovered.
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");

	if (ctx) {
		ctx.clearRect(0, 0, size, size);
		const pad = 16;
		const cardW = size - pad * 2;
		const cardH = size - pad * 2;
		const radius = 28;

		ctx.save();
		ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
		ctx.shadowBlur = 22;
		ctx.beginPath();
		ctx.roundRect(pad, pad, cardW, cardH, radius);
		ctx.clip();

		if (loadedImg && loadedImg.naturalWidth > 0 && loadedImg.naturalHeight > 0) {
			const crop = detectPhotoCropRect(loadedImg);
			const scaleCover = Math.max(cardW / crop.sw, cardH / crop.sh);
			const dw = crop.sw * scaleCover;
			const dh = crop.sh * scaleCover;
			const dx = pad + (cardW - dw) / 2;
			const dy = pad + (cardH - dh) / 2;
			ctx.drawImage(
				loadedImg,
				crop.sx,
				crop.sy,
				crop.sw,
				crop.sh,
				dx,
				dy,
				dw,
				dh,
			);
		} else if (
			sourceCanvas &&
			sourceCanvas.width > 0 &&
			sourceCanvas.height > 0
		) {
			const scale = Math.max(
				cardW / sourceCanvas.width,
				cardH / sourceCanvas.height,
			);
			const sw = sourceCanvas.width * scale;
			const sh = sourceCanvas.height * scale;
			ctx.drawImage(
				sourceCanvas as CanvasImageSource,
				pad + (cardW - sw) / 2,
				pad + (cardH - sh) / 2,
				sw,
				sh,
			);
		} else {
			const archetype =
				MEME_ARCHETYPES.find((m) => m.id === archetypeId) ??
				pickMemeArchetypeForText(text);
			const grad = ctx.createRadialGradient(
				size * 0.5,
				size * 0.5,
				20,
				size * 0.5,
				size * 0.5,
				cardH * 0.6,
			);
			grad.addColorStop(0, archetype.bgGradient[1]);
			grad.addColorStop(1, archetype.bgGradient[2]);
			ctx.fillStyle = grad;
			ctx.fillRect(pad, pad, cardW, cardH);

			ctx.font =
				'170px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(archetype.emoji, size * 0.5, size * 0.5);
		}

		// Subtle top & bottom dark edge vignette so Impact text is 100% readable without covering the face
		const topGrad = ctx.createLinearGradient(0, pad, 0, pad + 95);
		topGrad.addColorStop(0, "rgba(0,0,0,0.62)");
		topGrad.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = topGrad;
		ctx.fillRect(pad, pad, cardW, 95);

		const botGrad = ctx.createLinearGradient(
			0,
			pad + cardH - 95,
			0,
			pad + cardH,
		);
		botGrad.addColorStop(0, "rgba(0,0,0,0)");
		botGrad.addColorStop(1, "rgba(0,0,0,0.68)");
		ctx.fillStyle = botGrad;
		ctx.fillRect(pad, pad + cardH - 95, cardW, 95);

		// Classic single-image meme top/bottom Impact caption with thick black stroke & white fill
		ctx.font = '900 33px "Anton", "Impact", "Montserrat", sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.lineWidth = 8;
		ctx.strokeStyle = "#000000";
		ctx.fillStyle = "#ffffff";

		if (topLine && !bottomLine) {
			const yBottom = pad + cardH - 34;
			ctx.strokeText(topLine, size * 0.5, yBottom, cardW - 28);
			ctx.fillText(topLine, size * 0.5, yBottom, cardW - 28);
		} else {
			if (topLine) {
				const yTop = pad + 34;
				ctx.strokeText(topLine, size * 0.5, yTop, cardW - 28);
				ctx.fillText(topLine, size * 0.5, yTop, cardW - 28);
			}
			if (bottomLine) {
				const yBottom = pad + cardH - 34;
				ctx.strokeText(bottomLine, size * 0.5, yBottom, cardW - 28);
				ctx.fillText(bottomLine, size * 0.5, yBottom, cardW - 28);
			}
		}

		ctx.restore();

		// Clean frame border in chosen borderColor (white or black)
		ctx.strokeStyle = borderColor === "black" ? "#000000" : "#ffffff";
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.roundRect(pad, pad, cardW, cardH, radius);
		ctx.stroke();
	}

	const blob: Blob = await new Promise((resolve) =>
		canvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.94),
	);
	const file = new File([blob], `meme-${targetMeme.id}-${index + 1}.png`, {
		type: "image/png",
	});
	return { file, label: targetMeme.name, memeId: targetMeme.id };
}
