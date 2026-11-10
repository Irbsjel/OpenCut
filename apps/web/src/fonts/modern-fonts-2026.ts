export type ModernFontCategory =
	| "all"
	| "viral"
	| "tech2027"
	| "neoui"
	| "editorial"
	| "kinetic"
	| "mono";

export interface ModernFontDef {
	family: string;
	category: Exclude<ModernFontCategory, "all">;
	badge: string;
	description: string;
	weights: number[];
	previewText: string;
}

export const MODERN_FONT_CATEGORIES: ReadonlyArray<{
	key: ModernFontCategory;
	label: string;
}> = [
	{ key: "all", label: "Todas 26/27" },
	{ key: "viral", label: "Viral & Hooks" },
	{ key: "tech2027", label: "Futuro 2027" },
	{ key: "neoui", label: "Neo-UI" },
	{ key: "editorial", label: "Editorial" },
	{ key: "kinetic", label: "Cinética" },
	{ key: "mono", label: "Mono Lab" },
];

export const MODERN_FONTS_2026: ReadonlyArray<ModernFontDef> = [
	// 1. Viral & CapCut Hooks (2026-2027)
	{
		family: "Montserrat",
		category: "viral",
		badge: "Top #1 Viral",
		description: "Estándar de oro en subtítulos dinámicos y retención móvil",
		weights: [500, 700, 800, 900],
		previewText: "IMPACTO VIRAL 2026",
	},
	{
		family: "Bebas Neue",
		category: "viral",
		badge: "Hook Cine",
		description: "Titulares altos condensados para aperturas y capítulos",
		weights: [400],
		previewText: "TITULAR CINEMÁTICO",
	},
	{
		family: "Anton",
		category: "viral",
		badge: "Hook 3s",
		description: "Impacto máximo en 1 segundo para Reels, Shorts y TikTok",
		weights: [400],
		previewText: "ATENCIÓN TOTAL",
	},
	{
		family: "Archivo Black",
		category: "viral",
		badge: "Maximalista",
		description: "Grotesca ultra-pesada para énfasis de palabras clave",
		weights: [400],
		previewText: "PODER VISUAL",
	},
	{
		family: "Oswald",
		category: "viral",
		badge: "Dinámica",
		description: "Condensada moderna para subtítulos rápidos de alta energía",
		weights: [500, 700],
		previewText: "RITMO VERTICAL",
	},
	{
		family: "Titan One",
		category: "viral",
		badge: "Pop 3D",
		description: "Display voluminosa para creadores, gaming y reacciones",
		weights: [400],
		previewText: "¡EXPLOSIÓN POP!",
	},

	// 2. Futurismo & Tech 2027
	{
		family: "Space Grotesk",
		category: "tech2027",
		badge: "Tendencia 2027",
		description: "Geométrica brutalista ideal para IA, ciencia y tecnología",
		weights: [500, 700],
		previewText: "SINAPSIS AI 2027",
	},
	{
		family: "Syne",
		category: "tech2027",
		badge: "Vanguardia 27",
		description: "Display artística de diseño europeo y dirección creativa",
		weights: [600, 700, 800],
		previewText: "VANGUARDIA PURA",
	},
	{
		family: "Unbounded",
		category: "tech2027",
		badge: "Next-Gen",
		description: "Display expansiva de próxima generación para aperturas 2027",
		weights: [600, 700, 900],
		previewText: "HORIZONTE 2027",
	},
	{
		family: "Orbitron",
		category: "tech2027",
		badge: "Sci-Fi HUD",
		description: "Futurismo espacial, telemetría y cosmos",
		weights: [600, 700, 900],
		previewText: "ÓRBITA CUÁNTICA",
	},
	{
		family: "Chakra Petch",
		category: "tech2027",
		badge: "Cyberpunk",
		description: "Geometría angular técnica para estética cyber y HUD",
		weights: [600, 700],
		previewText: "NEURAL MATRIX",
	},
	{
		family: "Audiowide",
		category: "tech2027",
		badge: "Synth Neón",
		description: "Curvas electrónicas futuristas para música y ciencia ficción",
		weights: [400],
		previewText: "PULSO SÓNICO",
	},

	// 3. Neo-Grotescas & UI Pro (2026-2027)
	{
		family: "Plus Jakarta Sans",
		category: "neoui",
		badge: "UI Estrella 26",
		description: "Neo-grotesca moderna con legibilidad superior en 4K y móvil",
		weights: [500, 700, 800],
		previewText: "Claridad Absoluta",
	},
	{
		family: "Outfit",
		category: "neoui",
		badge: "Geométrica Pro",
		description: "Limpia, amigable y precisa para tecnología y educación",
		weights: [500, 700, 800],
		previewText: "Diseño Inteligente",
	},
	{
		family: "Sora",
		category: "neoui",
		badge: "Digital 2027",
		description: "Construcción óptica nítida pensada para interfaces y video",
		weights: [500, 700, 800],
		previewText: "Precisión Óptica",
	},
	{
		family: "Inter",
		category: "neoui",
		badge: "Estándar Pro",
		description: "Neutralidad perfecta para textos informativos y lower-thirds",
		weights: [500, 700, 800, 900],
		previewText: " Tipografía Universal",
	},
	{
		family: "Manrope",
		category: "neoui",
		badge: "Minimalista",
		description: "Semi-geométrica moderna para explicaciones científicas",
		weights: [500, 700, 800],
		previewText: "Síntesis Conceptual",
	},
	{
		family: "DM Sans",
		category: "neoui",
		badge: "Clean 2026",
		description: "Subtítulos limpios de bajo ruido visual",
		weights: [500, 700],
		previewText: "Narrativa Fluida",
	},

	// 4. Editorial & Lujo 2027
	{
		family: "Instrument Serif",
		category: "editorial",
		badge: "Editorial #1",
		description: "La serif de moda en 2026-2027 para contrastar con sans-serif",
		weights: [400],
		previewText: "Estética Editorial",
	},
	{
		family: "Playfair Display",
		category: "editorial",
		badge: "Alto Contraste",
		description: "Dramatismo clásico para documentales, historia y lujo",
		weights: [600, 700, 800],
		previewText: "Historia & Cosmos",
	},
	{
		family: "Fraunces",
		category: "editorial",
		badge: "Serif 2027",
		description: "Serif contemporánea con personalidad cálida y expresiva",
		weights: [600, 700, 900],
		previewText: "Relato Cinemático",
	},
	{
		family: "Cinzel",
		category: "editorial",
		badge: "Épica Tráiler",
		description: "Proporciones imperiales para ciencia, mitología y cine épico",
		weights: [600, 700, 900],
		previewText: "ORIGEN DEL COSMOS",
	},
	{
		family: "Cormorant Garamond",
		category: "editorial",
		badge: "Autor",
		description: "Refinamiento literario para citas y ensayos visuales",
		weights: [600, 700],
		previewText: "Filosofía Natural",
	},

	// 5. Expresivas & Cinéticas
	{
		family: "Bricolage Grotesque",
		category: "kinetic",
		badge: "Cinética 2027",
		description: "Expresiva y vibrante, diseñada para animación letra por letra",
		weights: [600, 700, 800],
		previewText: "Movimiento Vivo",
	},
	{
		family: "Righteous",
		category: "kinetic",
		badge: "Retro-Futuro",
		description: "Geometría curva con carácter único para títulos dinámicos",
		weights: [400],
		previewText: "ENERGÍA CREATIVA",
	},
	{
		family: "Kanit",
		category: "kinetic",
		badge: "Acción",
		description: "Terminaciones en ángulo ideales para transiciones rápidas",
		weights: [600, 700, 800],
		previewText: "VELOCIDAD PURA",
	},
	{
		family: "Permanent Marker",
		category: "kinetic",
		badge: "Street / Trazo",
		description: "Contraste manual urbano para notas de impacto",
		weights: [400],
		previewText: "TRAZO DIRECTO",
	},
	{
		family: "Caveat",
		category: "kinetic",
		badge: "Manuscrita",
		description: "Anotaciones orgánicas de pizarrón y cuaderno de campo",
		weights: [600, 700],
		previewText: "Apunte Científico",
	},

	// 6. Monospace & Datos 2027
	{
		family: "JetBrains Mono",
		category: "mono",
		badge: "Code & Data",
		description: "Monospace técnica para cifras, fórmulas y código en vivo",
		weights: [500, 700, 800],
		previewText: "E = mc² // 60FPS",
	},
	{
		family: "Space Mono",
		category: "mono",
		badge: "Lab 2027",
		description: "Estética de telemetría espacial y bitácora técnica",
		weights: [400, 700],
		previewText: "T+00:01:24.00",
	},
];

let batchStylesheetInjected = false;
const fontLoadListeners = new Set<() => void>();

export function subscribeFontLoad(listener: () => void): () => void {
	fontLoadListeners.add(listener);
	return () => fontLoadListeners.delete(listener);
}

export function notifyFontLoaded(): void {
	fontLoadListeners.forEach((fn) => {
		try {
			fn();
		} catch {}
	});
}

export function ensureModernFontsStylesheet(): void {
	if (typeof document === "undefined" || batchStylesheetInjected) return;
	batchStylesheetInjected = true;

	const linkId = "opencut-modern-fonts-2026-2027";
	if (document.getElementById(linkId)) return;

	const familiesQuery = MODERN_FONTS_2026.map((f) => {
		const encodedName = f.family.replace(/ /g, "+");
		const weights = Array.from(new Set([400, ...f.weights]))
			.sort((a, b) => a - b)
			.join(";");
		return `family=${encodedName}:wght@${weights}`;
	}).join("&");

	const link = document.createElement("link");
	link.id = linkId;
	link.rel = "stylesheet";
	link.href = `https://fonts.googleapis.com/css2?${familiesQuery}&display=swap`;
	link.addEventListener("load", () => {
		if (typeof document !== "undefined" && document.fonts) {
			document.fonts.ready.then(() => notifyFontLoaded());
		}
		notifyFontLoaded();
	});
	document.head.appendChild(link);
}
