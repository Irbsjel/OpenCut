import type { Transform } from "@/rendering";
import { clamp } from "@/utils/math";

export type TransitionCategory =
	| "all"
	| "camera"
	| "light"
	| "mask"
	| "glitch"
	| "3d"
	| "text";

export type TransitionVisualFxKind =
	| "none"
	| "whip-blur-x"
	| "whip-blur-y"
	| "radial-zoom-blur"
	| "flash-white"
	| "flash-black"
	| "light-leak-warm"
	| "film-burn"
	| "anamorphic-flare"
	| "dreamy-glow"
	| "glitch-rgb-slice"
	| "vhs-tracking"
	| "iris-circle"
	| "diagonal-wipe"
	| "blinds-venetian"
	| "split-doors"
	| "clock-radial"
	| "diamond-reveal"
	| "cube-3d-shade";

export interface TransitionVisualFx {
	kind: TransitionVisualFxKind;
	/** 0 = peak of transition at cut boundary, 1 = settled into normal clip */
	progress: number;
	/** 1 = entering (In), -1 = exiting (Out) */
	direction: 1 | -1;
	/** Signed directional vector (-1 or 1) */
	signedVector?: number;
}

export type ClipAnimInStyle =
	| "none"
	| "fade-in"
	| "zoom-in-pop"
	| "zoom-out-drop"
	| "cross-zoom-in"
	| "slide-up"
	| "slide-down"
	| "slide-left"
	| "slide-right"
	| "spin-in"
	| "spin-ccw-in"
	| "elastic-drop"
	| "pendulum-in"
	| "whip-pan-in"
	| "whip-pan-left-in"
	| "whip-pan-up-in"
	| "whip-pan-down-in"
	| "flash-white-in"
	| "flash-black-in"
	| "light-leak-in"
	| "film-burn-in"
	| "anamorphic-flare-in"
	| "dreamy-blur-in"
	| "iris-circle-in"
	| "diagonal-wipe-in"
	| "blinds-venetian-in"
	| "split-doors-in"
	| "clock-radial-in"
	| "diamond-reveal-in"
	| "cube-3d-in"
	| "flip-3d-in"
	| "glitch-in"
	| "vhs-tracking-in"
	| "letter-pop-cascade"
	| "letter-typewriter"
	| "letter-slide-up"
	| "letter-bounce"
	| "letter-flip-3d"
	| "letter-scatter";

export type ClipAnimLoopStyle =
	| "none"
	| "pulse-beat"
	| "float-hover"
	| "pendulum-swing"
	| "shake-handheld"
	| "jello-wobble"
	| "zoom-breathe"
	| "spin-continuous"
	| "glitch-loop"
	| "flash-strobe"
	| "letter-wave"
	| "letter-karaoke"
	| "letter-neon-pulse"
	| "letter-heartbeat"
	| "letter-glitch-rgb";

export type ClipAnimOutStyle =
	| "none"
	| "fade-out"
	| "zoom-out-shrink"
	| "zoom-in-explode"
	| "cross-zoom-out"
	| "slide-down-out"
	| "slide-up-out"
	| "slide-left-out"
	| "slide-right-out"
	| "spin-out"
	| "spin-ccw-out"
	| "whip-pan-right-out"
	| "whip-pan-left-out"
	| "whip-pan-up-out"
	| "whip-pan-down-out"
	| "flash-white-out"
	| "flash-black-out"
	| "light-leak-out"
	| "film-burn-out"
	| "anamorphic-flare-out"
	| "dreamy-blur-out"
	| "iris-circle-out"
	| "diagonal-wipe-out"
	| "blinds-venetian-out"
	| "split-doors-out"
	| "clock-radial-out"
	| "diamond-reveal-out"
	| "cube-3d-out"
	| "flip-3d-out"
	| "glitch-out"
	| "vhs-tracking-out"
	| "letter-pop-out"
	| "letter-scatter-out"
	| "letter-drop-out";

export interface AnimPresetOption<T extends string = string> {
	value: T;
	label: string;
	badge: string;
	description: string;
	category?: TransitionCategory;
	textOnly?: boolean;
	icon: string;
}

export const CLIP_ANIM_IN_OPTIONS: ReadonlyArray<
	AnimPresetOption<ClipAnimInStyle>
> = [
	{
		value: "none",
		label: "Sin Entrada",
		badge: "Base",
		description: "Inicia directamente sin transición de entrada",
		category: "all",
		icon: "○",
	},
	// CÁMARA & MOVIMIENTO (CapCut Pro / GL-Transitions)
	{
		value: "whip-pan-in",
		label: "Whip Pan Derecha (Blur)",
		badge: "CapCut Pro",
		description: "Barrido ultrarrápido de cámara con desenfoque direccional multicapa",
		category: "camera",
		icon: "»",
	},
	{
		value: "whip-pan-left-in",
		label: "Whip Pan Izquierda (Blur)",
		badge: "CapCut Pro",
		description: "Barrido lateral inverso con estela de velocidad y frenado exponencial",
		category: "camera",
		icon: "«",
	},
	{
		value: "whip-pan-up-in",
		label: "Whip Pan Vertical ↑",
		badge: "Reels Pro",
		description: "Barrido vertical ascendente con rastro de movimiento de cámara",
		category: "camera",
		icon: "⇈",
	},
	{
		value: "whip-pan-down-in",
		label: "Whip Pan Vertical ↓",
		badge: "Reels Pro",
		description: "Barrido vertical descendente con desaceleración cinematográfica",
		category: "camera",
		icon: "⇊",
	},
	{
		value: "cross-zoom-in",
		label: "Cross-Zoom Óptico",
		badge: "GL #1",
		description: "Inmersión de lente con desenfoque radial concéntrico estilo GL CrossZoom",
		category: "camera",
		icon: "⊚",
	},
	{
		value: "zoom-in-pop",
		label: "Zoom Pop Elástico",
		badge: "CapCut #1",
		description: "Aparición explosiva con rebote calibrado desde el centro",
		category: "camera",
		icon: "⊕",
	},
	{
		value: "zoom-out-drop",
		label: "Pull-Out / Aterrizaje Óptico",
		badge: "Impacto",
		description: "Desciende desde macro 2.1x hasta su encuadre real con rastro radial",
		category: "camera",
		icon: "⊖",
	},
	{
		value: "spin-in",
		label: "Vórtice Horario (Spin Cut)",
		badge: "Giro Pro",
		description: "Giro rápido de cámara en sentido horario con expansión suave",
		category: "camera",
		icon: "↻",
	},
	{
		value: "spin-ccw-in",
		label: "Vórtice Antihorario",
		badge: "Giro Pro",
		description: "Giro rápido inverso con aterrizaje exponencial al encuadre",
		category: "camera",
		icon: "↺",
	},
	{
		value: "pendulum-in",
		label: "Swing Péndulo Cinemático",
		badge: "Fluido",
		description: "Entrada en arco gravitacional con amortiguación armónica",
		category: "camera",
		icon: "⌒",
	},
	{
		value: "elastic-drop",
		label: "Resorte Gravitacional",
		badge: "Física",
		description: "Caída vertical con rebote de resorte amortiguado",
		category: "camera",
		icon: "↯",
	},
	{
		value: "slide-up",
		label: "Push Suave desde Abajo",
		badge: "Push",
		description: "Ascenso limpio con curva de desaceleración cuártica",
		category: "camera",
		icon: "↑",
	},
	{
		value: "slide-down",
		label: "Push Suave desde Arriba",
		badge: "Push",
		description: "Descenso limpio con frenado suave al centro",
		category: "camera",
		icon: "↓",
	},
	{
		value: "slide-left",
		label: "Push Derecha → Izquierda",
		badge: "Push",
		description: "Deslizamiento lateral limpio desde la derecha",
		category: "camera",
		icon: "←",
	},
	{
		value: "slide-right",
		label: "Push Izquierda → Derecha",
		badge: "Push",
		description: "Deslizamiento lateral limpio desde la izquierda",
		category: "camera",
		icon: "→",
	},

	// LUZ, CINE & ÓPTICA (DaVinci Resolve / Premiere / GL)
	{
		value: "flash-white-in",
		label: "Flash Fotográfico Blanco",
		badge: "Cine Flash",
		description: "Destello de exposición blanco cálido que se disipa al revelar la escena",
		category: "light",
		icon: "☀",
	},
	{
		value: "flash-black-in",
		label: "Dip to Black (Negro Cine)",
		badge: "Hollywood",
		description: "Emergencia profunda desde negro de sala con curva gamma suave",
		category: "light",
		icon: "●",
	},
	{
		value: "light-leak-in",
		label: "Light Leak Ámbar 35mm",
		badge: "GL Leak",
		description: "Fuga de luz cálida dorada y magenta que recorre el lente al entrar",
		category: "light",
		icon: "🌅",
	},
	{
		value: "film-burn-in",
		label: "Film Burn Celuloide",
		badge: "Vintage Pro",
		description: "Quemado orgánico de película analógica en tonos rubí y ámbar",
		category: "light",
		icon: "🔥",
	},
	{
		value: "anamorphic-flare-in",
		label: "Destello Anamórfico Cian",
		badge: "Sci-Fi 4K",
		description: "Haz luminoso horizontal de lente anamórfica estilo cine",
		category: "light",
		icon: "━",
	},
	{
		value: "dreamy-blur-in",
		label: "Evocación Dreamy (Bloom)",
		badge: "GL Dreamy",
		description: "Revelado etéreo con halo de luz difusa y flotación óptica",
		category: "light",
		icon: "✧",
	},
	{
		value: "fade-in",
		label: "Disolvencia Suave (Fade In)",
		badge: "Clásico",
		description: "Aparición gradual con curva S de opacidad cinematográfica",
		category: "light",
		icon: "◐",
	},

	// CORTES GEOMÉTRICOS & MÁSCARAS (GL-Transitions)
	{
		value: "iris-circle-in",
		label: "Iris Circular (Circle Open)",
		badge: "GL Mask",
		description: "Apertura circular concéntrica desde el centro del encuadre",
		category: "mask",
		icon: "◯",
	},
	{
		value: "diagonal-wipe-in",
		label: "Barrido Diagonal 45°",
		badge: "GL Wipe",
		description: "Corte diagonal limpio con bisel luminoso dinámico",
		category: "mask",
		icon: "⟋",
	},
	{
		value: "blinds-venetian-in",
		label: "Persianas Ópticas (Blinds)",
		badge: "GL Blinds",
		description: "Apertura sincronizada en franjas paralelas escalonadas",
		category: "mask",
		icon: "▤",
	},
	{
		value: "split-doors-in",
		label: "Puertas Dobles (Doorway)",
		badge: "GL Door",
		description: "Apertura simétrica tipo telón desde el eje central",
		category: "mask",
		icon: "⫿",
	},
	{
		value: "clock-radial-in",
		label: "Reloj Radial 360°",
		badge: "GL Radial",
		description: "Barrido angular de 360° en sentido horario desde las 12",
		category: "mask",
		icon: "◔",
	},
	{
		value: "diamond-reveal-in",
		label: "Revelado Diamante",
		badge: "GL Rombo",
		description: "Expansión geométrica en rombo desde el núcleo de la imagen",
		category: "mask",
		icon: "◇",
	},

	// GLITCH, CYBER & 3D
	{
		value: "glitch-in",
		label: "Glitch RGB Split & Slices",
		badge: "CapCut Cyber",
		description: "Separación cromática Rojo/Cian real con corte de bandas horizontales",
		category: "glitch",
		icon: "⚡",
	},
	{
		value: "vhs-tracking-in",
		label: "Sincronía VHS Analógica",
		badge: "Retro Tape",
		description: "Ajuste de tracking magnético con barrido de líneas y crominancia",
		category: "glitch",
		icon: "📼",
	},
	{
		value: "cube-3d-in",
		label: "Cubo 3D Perspectiva",
		badge: "GL Cube",
		description: "Rotación de cara de cubo en 3D con sombreado lateral dinámico",
		category: "3d",
		icon: "❐",
	},
	{
		value: "flip-3d-in",
		label: "Giro 3D Axial (Flip)",
		badge: "3D Pro",
		description: "Despliegue en perspectiva sobre el eje central con brillo especular",
		category: "3d",
		icon: "◧",
	},

	// Exclusivas por letra para Texto
	{
		value: "letter-pop-cascade",
		label: "Letras: Cascada Pop",
		badge: "Letras #1",
		description: "Cada letra salta en cascada con rebote elástico",
		category: "text",
		textOnly: true,
		icon: "Aa",
	},
	{
		value: "letter-typewriter",
		label: "Letras: Máquina + Cursor",
		badge: "Letras HUD",
		description: "Escritura secuencial carácter por carácter con cursor",
		category: "text",
		textOnly: true,
		icon: "▌",
	},
	{
		value: "letter-slide-up",
		label: "Letras: Ascenso Editorial",
		badge: "Letras",
		description: "Subida limpia letra por letra estilo Apple",
		category: "text",
		textOnly: true,
		icon: "A↑",
	},
	{
		value: "letter-bounce",
		label: "Letras: Rebote Elástico",
		badge: "Letras",
		description: "Las letras caen una a una con física de resorte",
		category: "text",
		textOnly: true,
		icon: "A↯",
	},
	{
		value: "letter-flip-3d",
		label: "Letras: Giro 3D",
		badge: "Letras 3D",
		description: "Cada carácter gira sobre su propio eje vertical",
		category: "text",
		textOnly: true,
		icon: "A◧",
	},
	{
		value: "letter-scatter",
		label: "Letras: Convergencia Orbital",
		badge: "Letras",
		description: "Las letras convergen desde distintas órbitas",
		category: "text",
		textOnly: true,
		icon: "✦",
	},
];

export const CLIP_ANIM_LOOP_OPTIONS: ReadonlyArray<
	AnimPresetOption<ClipAnimLoopStyle>
> = [
	{
		value: "none",
		label: "Sin Bucle Central",
		badge: "Base",
		description: "Estático durante la parte media del clip",
		icon: "○",
	},
	{
		value: "pulse-beat",
		label: "Pulso Rítmico (Beat)",
		badge: "CapCut #1",
		description: "Latido continuo de escala para mantener atención",
		icon: "♥",
	},
	{
		value: "float-hover",
		label: "Levitación 3D Suave",
		badge: "Fluido",
		description: "Flotación orgánica continua arriba y abajo",
		icon: "∿",
	},
	{
		value: "zoom-breathe",
		label: "Respiración Cinemática",
		badge: "Cine",
		description: "Zoom lento y continuo tipo Ken Burns",
		icon: "◎",
	},
	{
		value: "pendulum-swing",
		label: "Péndulo Armónico",
		badge: "Swing",
		description: "Balanceo rítmico suave de izquierda a derecha",
		icon: "↔",
	},
	{
		value: "shake-handheld",
		label: "Cámara en Mano (Shake)",
		badge: "Acción",
		description: "Vibración orgánica de energía y tensión",
		icon: "≋",
	},
	{
		value: "jello-wobble",
		label: "Gelatina Elástica (Wobble)",
		badge: "Viral",
		description: "Deformación elástica divertida en bucle",
		icon: "◈",
	},
	{
		value: "spin-continuous",
		label: "Rotación Continua 360°",
		badge: "Órbita",
		description: "Giro constante durante la sección central",
		icon: "↻",
	},
	{
		value: "glitch-loop",
		label: "Interferencia Cyberpunk",
		badge: "2027",
		description: "Micro-saltos digitales periódicos en bucle",
		icon: "⚡",
	},
	{
		value: "flash-strobe",
		label: "Destello Estroboscópico",
		badge: "Strobe",
		description: "Parpadeo rítmico de opacidad para música",
		icon: "✦",
	},
	// Exclusivas por letra/palabra para Texto
	{
		value: "letter-karaoke",
		label: "Letras: Karaoke por Palabra",
		badge: "Reels #1",
		description: "Resalta palabra por palabra con pastilla neón activa",
		textOnly: true,
		icon: "🆎",
	},
	{
		value: "letter-wave",
		label: "Letras: Ola Cinética",
		badge: "Letras",
		description: "Onda sinusoidal continua recorriendo cada letra",
		textOnly: true,
		icon: "A∿",
	},
	{
		value: "letter-neon-pulse",
		label: "Letras: Pulso Láser Neón",
		badge: "Glow",
		description: "Onda de resplandor luminoso letra por letra",
		textOnly: true,
		icon: "A✦",
	},
	{
		value: "letter-heartbeat",
		label: "Letras: Latido en Onda",
		badge: "Beat",
		description: "Pulso rítmico escalonado carácter por carácter",
		textOnly: true,
		icon: "A♥",
	},
	{
		value: "letter-glitch-rgb",
		label: "Letras: Glitch RGB Cian/Magenta",
		badge: "Cyber 27",
		description: "Desfase cromático RGB por carácter en tiempo real",
		textOnly: true,
		icon: "A⚡",
	},
];

export const CLIP_ANIM_OUT_OPTIONS: ReadonlyArray<
	AnimPresetOption<ClipAnimOutStyle>
> = [
	{
		value: "none",
		label: "Sin Salida",
		badge: "Base",
		description: "Termina directamente al finalizar el clip",
		category: "all",
		icon: "○",
	},
	// CÁMARA & MOVIMIENTO
	{
		value: "whip-pan-right-out",
		label: "Whip Pan Salida Derecha",
		badge: "CapCut Pro",
		description: "Disparo lateral hacia la derecha con desenfoque direccional",
		category: "camera",
		icon: "»",
	},
	{
		value: "whip-pan-left-out",
		label: "Whip Pan Salida Izquierda",
		badge: "CapCut Pro",
		description: "Disparo lateral hacia la izquierda con estela de velocidad",
		category: "camera",
		icon: "«",
	},
	{
		value: "whip-pan-up-out",
		label: "Whip Pan Salida Arriba ↑",
		badge: "Reels Pro",
		description: "Barrido vertical acelerado hacia el borde superior",
		category: "camera",
		icon: "⇈",
	},
	{
		value: "whip-pan-down-out",
		label: "Whip Pan Salida Abajo ↓",
		badge: "Reels Pro",
		description: "Barrido vertical acelerado hacia el borde inferior",
		category: "camera",
		icon: "⇊",
	},
	{
		value: "cross-zoom-out",
		label: "Cross-Zoom Salida Óptica",
		badge: "GL #1",
		description: "Aceleración hacia la cámara con desenfoque radial GL CrossZoom",
		category: "camera",
		icon: "⊚",
	},
	{
		value: "zoom-out-shrink",
		label: "Pull-Back / Contracción",
		badge: "CapCut #1",
		description: "Se aleja rápidamente hacia el fondo con rastro óptico",
		category: "camera",
		icon: "⊖",
	},
	{
		value: "zoom-in-explode",
		label: "Expansión Hiperespacial",
		badge: "Impacto",
		description: "Atraviesa el lente hacia adelante mientras se funde",
		category: "camera",
		icon: "⊕",
	},
	{
		value: "spin-out",
		label: "Vórtice de Salida Horario",
		badge: "Giro Pro",
		description: "Gira en sentido horario y se contrae al cerrar el corte",
		category: "camera",
		icon: "↻",
	},
	{
		value: "spin-ccw-out",
		label: "Vórtice Salida Antihorario",
		badge: "Giro Pro",
		description: "Giro rápido inverso de cámara hacia el siguiente plano",
		category: "camera",
		icon: "↺",
	},
	{
		value: "slide-down-out",
		label: "Push Salida Abajo",
		badge: "Push",
		description: "Sale acelerando suavemente hacia el borde inferior",
		category: "camera",
		icon: "↓",
	},
	{
		value: "slide-up-out",
		label: "Push Salida Arriba",
		badge: "Push",
		description: "Sale acelerando suavemente hacia el borde superior",
		category: "camera",
		icon: "↑",
	},
	{
		value: "slide-left-out",
		label: "Push Salida Izquierda",
		badge: "Push",
		description: "Desplazamiento lateral limpio hacia la izquierda",
		category: "camera",
		icon: "←",
	},
	{
		value: "slide-right-out",
		label: "Push Salida Derecha",
		badge: "Push",
		description: "Desplazamiento lateral limpio hacia la derecha",
		category: "camera",
		icon: "→",
	},

	// LUZ, CINE & ÓPTICA
	{
		value: "flash-white-out",
		label: "Flash Blanco de Salida",
		badge: "Cine Flash",
		description: "Sube la exposición hasta blanco puro justo en el corte",
		category: "light",
		icon: "☀",
	},
	{
		value: "flash-black-out",
		label: "Dip to Black (Cierre Negro)",
		badge: "Hollywood",
		description: "Cae suavemente a negro de sala antes del siguiente plano",
		category: "light",
		icon: "●",
	},
	{
		value: "light-leak-out",
		label: "Light Leak Ámbar Salida",
		badge: "GL Leak",
		description: "Fuga de luz dorada envuelve la escena al cerrar el clip",
		category: "light",
		icon: "🌅",
	},
	{
		value: "film-burn-out",
		label: "Film Burn Salida 35mm",
		badge: "Vintage Pro",
		description: "Destello de celuloide quemado al terminar el segmento",
		category: "light",
		icon: "🔥",
	},
	{
		value: "anamorphic-flare-out",
		label: "Flare Anamórfico Salida",
		badge: "Sci-Fi 4K",
		description: "Destello horizontal cian cubre la transición de salida",
		category: "light",
		icon: "━",
	},
	{
		value: "dreamy-blur-out",
		label: "Disolvencia Dreamy Salida",
		badge: "GL Dreamy",
		description: "Desvanecimiento etéreo con resplandor suave",
		category: "light",
		icon: "✧",
	},
	{
		value: "fade-out",
		label: "Disolvencia Suave (Fade Out)",
		badge: "Clásico",
		description: "Desvanecimiento limpio hasta transparente",
		category: "light",
		icon: "◑",
	},

	// CORTES GEOMÉTRICOS & MÁSCARAS
	{
		value: "iris-circle-out",
		label: "Cierre Iris Circular",
		badge: "GL Mask",
		description: "El encuadre se cierra en círculo hacia el centro",
		category: "mask",
		icon: "◯",
	},
	{
		value: "diagonal-wipe-out",
		label: "Cierre Diagonal 45°",
		badge: "GL Wipe",
		description: "Barrido diagonal de salida con borde luminoso",
		category: "mask",
		icon: "⟋",
	},
	{
		value: "blinds-venetian-out",
		label: "Cierre Persianas (Blinds)",
		badge: "GL Blinds",
		description: "Cierre sincronizado en franjas paralelas",
		category: "mask",
		icon: "▤",
	},
	{
		value: "split-doors-out",
		label: "Cierre Puertas Dobles",
		badge: "GL Door",
		description: "Cierre simétrico hacia el centro del encuadre",
		category: "mask",
		icon: "⫿",
	},
	{
		value: "clock-radial-out",
		label: "Cierre Reloj Radial",
		badge: "GL Radial",
		description: "Barrido circular de salida en sentido horario",
		category: "mask",
		icon: "◔",
	},
	{
		value: "diamond-reveal-out",
		label: "Cierre Diamante",
		badge: "GL Rombo",
		description: "Contracción en rombo hacia el centro",
		category: "mask",
		icon: "◇",
	},

	// GLITCH & 3D
	{
		value: "glitch-out",
		label: "Glitch RGB Split & CRT Off",
		badge: "CapCut Cyber",
		description: "Separación RGB y colapso de señal horizontal al cortar",
		category: "glitch",
		icon: "⚡",
	},
	{
		value: "vhs-tracking-out",
		label: "Corte VHS Analógico",
		badge: "Retro Tape",
		description: "Salto de cinta magnética y distorsión de croma al salir",
		category: "glitch",
		icon: "📼",
	},
	{
		value: "cube-3d-out",
		label: "Salida Cubo 3D",
		badge: "GL Cube",
		description: "La escena gira como la cara saliente de un cubo 3D",
		category: "3d",
		icon: "❐",
	},
	{
		value: "flip-3d-out",
		label: "Plegado 3D de Salida",
		badge: "3D Pro",
		description: "Cierre en perspectiva horizontal 3D",
		category: "3d",
		icon: "◨",
	},

	// Exclusivas por letra para Texto
	{
		value: "letter-pop-out",
		label: "Letras: Desaparición Cascada",
		badge: "Letras",
		description: "Las letras se contraen una por una al final",
		category: "text",
		textOnly: true,
		icon: "Aa",
	},
	{
		value: "letter-scatter-out",
		label: "Letras: Dispersión Orbital",
		badge: "Letras",
		description: "Cada letra sale disparada hacia el espacio",
		category: "text",
		textOnly: true,
		icon: "✦",
	},
	{
		value: "letter-drop-out",
		label: "Letras: Desplome Secuencial",
		badge: "Letras",
		description: "Las letras caen por gravedad una tras otra",
		category: "text",
		textOnly: true,
		icon: "A↓",
	},
];

/**
 * Curated repertoire of professional Cut Transitions (Clip A Out -> Clip B In)
 * modeled after CapCut Pro, DaVinci Resolve, Premiere Pro & gl-transitions.
 */
export interface CutTransitionPreset {
	id: string;
	name: string;
	badge: string;
	category: Exclude<TransitionCategory, "all" | "text">;
	description: string;
	icon: string;
	defaultDuration: number;
	outStyle: ClipAnimOutStyle;
	inStyle: ClipAnimInStyle;
	accentColor: string;
}

export const CUT_TRANSITION_PRESETS: ReadonlyArray<CutTransitionPreset> = [
	// 1. CÁMARA & MOVIMIENTO
	{
		id: "whip-pan-right",
		name: "Whip Pan Derecha (Motion Blur)",
		badge: "CapCut Pro #1",
		category: "camera",
		description: "Barrido lateral ultrarrápido con desenfoque direccional continuo entre ambos clips",
		icon: "»",
		defaultDuration: 0.4,
		outStyle: "whip-pan-right-out",
		inStyle: "whip-pan-in",
		accentColor: "#38bdf8",
	},
	{
		id: "whip-pan-left",
		name: "Whip Pan Izquierda (Motion Blur)",
		badge: "CapCut Pro",
		category: "camera",
		description: "Barrido lateral hacia la izquierda con estela de velocidad sincronizada",
		icon: "«",
		defaultDuration: 0.4,
		outStyle: "whip-pan-left-out",
		inStyle: "whip-pan-left-in",
		accentColor: "#38bdf8",
	},
	{
		id: "whip-pan-up",
		name: "Whip Pan Vertical ↑ (Reels)",
		badge: "Reels Viral",
		category: "camera",
		description: "Transición vertical de alta energía con rastro óptico ascendente",
		icon: "⇈",
		defaultDuration: 0.4,
		outStyle: "whip-pan-up-out",
		inStyle: "whip-pan-up-in",
		accentColor: "#38bdf8",
	},
	{
		id: "whip-pan-down",
		name: "Whip Pan Vertical ↓ (Reels)",
		badge: "Reels Viral",
		category: "camera",
		description: "Caída rápida de cámara entre planos con frenado exponencial",
		icon: "⇊",
		defaultDuration: 0.4,
		outStyle: "whip-pan-down-out",
		inStyle: "whip-pan-down-in",
		accentColor: "#38bdf8",
	},
	{
		id: "cross-zoom-pro",
		name: "Cross-Zoom Óptico (Pull In)",
		badge: "GL-Transition #1",
		category: "camera",
		description: "Atraviesa el primer clip con zoom radial y emerge en el segundo plano sin corte brusco",
		icon: "⊚",
		defaultDuration: 0.45,
		outStyle: "cross-zoom-out",
		inStyle: "cross-zoom-in",
		accentColor: "#60a5fa",
	},
	{
		id: "zoom-pull-back",
		name: "Pull-Out Óptico (Alejamiento)",
		badge: "CapCut Camera",
		category: "camera",
		description: "El plano actual se aleja desde macro revelando la escena entrante con inercia",
		icon: "⊖",
		defaultDuration: 0.45,
		outStyle: "zoom-out-shrink",
		inStyle: "zoom-out-drop",
		accentColor: "#60a5fa",
	},
	{
		id: "spin-vortex-cw",
		name: "Vórtice 360° (Spin Cut)",
		badge: "Dinámico",
		category: "camera",
		description: "Rotación acelerada de cámara en sentido horario que enlaza ambos clips",
		icon: "↻",
		defaultDuration: 0.45,
		outStyle: "spin-out",
		inStyle: "spin-in",
		accentColor: "#818cf8",
	},
	{
		id: "spin-vortex-ccw",
		name: "Vórtice Inverso (Counter Spin)",
		badge: "Dinámico",
		category: "camera",
		description: "Giro de cámara antihorario con desaceleración suave en el plano entrante",
		icon: "↺",
		defaultDuration: 0.45,
		outStyle: "spin-ccw-out",
		inStyle: "spin-ccw-in",
		accentColor: "#818cf8",
	},

	// 2. LUZ, CINE & ÓPTICA
	{
		id: "light-leak-35mm",
		name: "Light Leak Ámbar 35mm",
		badge: "Cine Orgánico",
		category: "light",
		description: "Fuga de luz cálida dorada y magenta que envuelve el corte como película de cine",
		icon: "🌅",
		defaultDuration: 0.65,
		outStyle: "light-leak-out",
		inStyle: "light-leak-in",
		accentColor: "#f59e0b",
	},
	{
		id: "film-burn-vintage",
		name: "Film Burn Celuloide",
		badge: "DaVinci Pro",
		category: "light",
		description: "Quemado orgánico de celuloide en tonos rubí, naranja y oro sobre el cambio de plano",
		icon: "🔥",
		defaultDuration: 0.6,
		outStyle: "film-burn-out",
		inStyle: "film-burn-in",
		accentColor: "#f97316",
	},
	{
		id: "camera-flash-white",
		name: "Flash Blanco Fotográfico",
		badge: "Impacto Beat",
		category: "light",
		description: "Destello exponencial de cámara que oculta el corte y decae suavemente en el nuevo clip",
		icon: "☀",
		defaultDuration: 0.35,
		outStyle: "flash-white-out",
		inStyle: "flash-white-in",
		accentColor: "#fde047",
	},
	{
		id: "cinema-dip-black",
		name: "Dip to Black (Negro de Sala)",
		badge: "Hollywood",
		category: "light",
		description: "Transición narrativa por negro profundo con curva gamma cinematográfica",
		icon: "●",
		defaultDuration: 0.7,
		outStyle: "flash-black-out",
		inStyle: "flash-black-in",
		accentColor: "#94a3b8",
	},
	{
		id: "anamorphic-flare",
		name: "Destello Anamórfico Sci-Fi",
		badge: "Lente 2.39:1",
		category: "light",
		description: "Trazo luminoso horizontal cian/azul estilo lente anamórfica Arri/Panavision",
		icon: "━",
		defaultDuration: 0.55,
		outStyle: "anamorphic-flare-out",
		inStyle: "anamorphic-flare-in",
		accentColor: "#38bdf8",
	},
	{
		id: "dreamy-memory",
		name: "Evocación Dreamy (Bloom)",
		badge: "GL Dreamy",
		category: "light",
		description: "Fundido etéreo con resplandor difuso y suave ondulación para flashbacks o narrativa",
		icon: "✧",
		defaultDuration: 0.75,
		outStyle: "dreamy-blur-out",
		inStyle: "dreamy-blur-in",
		accentColor: "#c084fc",
	},
	{
		id: "cross-dissolve-cinema",
		name: "Disolvencia Cruzada (S-Curve)",
		badge: "Estándar Pro",
		category: "light",
		description: "Fundido limpio con curva S sinusoidal para continuidad temporal suave",
		icon: "◐",
		defaultDuration: 0.65,
		outStyle: "fade-out",
		inStyle: "fade-in",
		accentColor: "#cbd5e1",
	},

	// 3. CORTES GEOMÉTRICOS & MÁSCARAS (GL-Transitions)
	{
		id: "iris-circle-open",
		name: "Iris Circular (GL CircleOpen)",
		badge: "GL Mask",
		category: "mask",
		description: "Apertura circular concéntrica con halo suave estilo cine clásico y animación",
		icon: "◯",
		defaultDuration: 0.55,
		outStyle: "iris-circle-out",
		inStyle: "iris-circle-in",
		accentColor: "#34d399",
	},
	{
		id: "diagonal-shutter",
		name: "Corte Diagonal 45° (GL Wipe)",
		badge: "Editorial",
		category: "mask",
		description: "Barrido diagonal limpio a 45° con bisel luminoso entre ambas escenas",
		icon: "⟋",
		defaultDuration: 0.5,
		outStyle: "diagonal-wipe-out",
		inStyle: "diagonal-wipe-in",
		accentColor: "#34d399",
	},
	{
		id: "venetian-blinds",
		name: "Persianas Ópticas (GL Blinds)",
		badge: "GL Blinds",
		category: "mask",
		description: "Transición arquitectónica por franjas paralelas sincronizadas",
		icon: "▤",
		defaultDuration: 0.55,
		outStyle: "blinds-venetian-out",
		inStyle: "blinds-venetian-in",
		accentColor: "#34d399",
	},
	{
		id: "split-doorway",
		name: "Puertas Simétricas (GL Doorway)",
		badge: "GL Door",
		category: "mask",
		description: "Apertura central simétrica tipo telón hacia los extremos del lienzo",
		icon: "⫿",
		defaultDuration: 0.55,
		outStyle: "split-doors-out",
		inStyle: "split-doors-in",
		accentColor: "#34d399",
	},
	{
		id: "clock-radial-sweep",
		name: "Barrido Radial 360° (Clock)",
		badge: "GL Radial",
		category: "mask",
		description: "Transición angular de 360° estilo cronómetro para cambios de tiempo",
		icon: "◔",
		defaultDuration: 0.6,
		outStyle: "clock-radial-out",
		inStyle: "clock-radial-in",
		accentColor: "#34d399",
	},
	{
		id: "diamond-prism",
		name: "Revelado Diamante",
		badge: "GL Rombo",
		category: "mask",
		description: "Transición geométrica en rombo desde el centro del encuadre",
		icon: "◇",
		defaultDuration: 0.55,
		outStyle: "diamond-reveal-out",
		inStyle: "diamond-reveal-in",
		accentColor: "#34d399",
	},

	// 4. GLITCH & CYBER
	{
		id: "glitch-rgb-memories",
		name: "Glitch RGB Split & Slices",
		badge: "Cyberpunk #1",
		category: "glitch",
		description: "Separación cromática Rojo/Cian y desplazamiento de bandas horizontales sobre el corte",
		icon: "⚡",
		defaultDuration: 0.4,
		outStyle: "glitch-out",
		inStyle: "glitch-in",
		accentColor: "#f43f5e",
	},
	{
		id: "vhs-tape-cut",
		name: "Corte VHS / Tracking Analógico",
		badge: "Retro Tape",
		category: "glitch",
		description: "Distorsión de señal magnética con barrido de líneas de tracking",
		icon: "📼",
		defaultDuration: 0.45,
		outStyle: "vhs-tracking-out",
		inStyle: "vhs-tracking-in",
		accentColor: "#fb7185",
	},

	// 5. 3D & PERSPECTIVA
	{
		id: "cube-3d-rotate",
		name: "Rotación Cubo 3D (GL Cube)",
		badge: "3D Studio",
		category: "3d",
		description: "El clip saliente y el entrante rotan como caras adyacentes de un cubo 3D iluminado",
		icon: "❐",
		defaultDuration: 0.55,
		outStyle: "cube-3d-out",
		inStyle: "cube-3d-in",
		accentColor: "#a78bfa",
	},
	{
		id: "flip-3d-card",
		name: "Giro Axial 3D (Card Flip)",
		badge: "3D Studio",
		category: "3d",
		description: "Pliegue en perspectiva horizontal con sombreado especular en el corte",
		icon: "◧",
		defaultDuration: 0.5,
		outStyle: "flip-3d-out",
		inStyle: "flip-3d-in",
		accentColor: "#a78bfa",
	},
];

export interface ClipComboPreset {
	id: string;
	title: string;
	badge: string;
	description: string;
	textOnly?: boolean;
	animIn: ClipAnimInStyle;
	animInDuration: number;
	animLoop: ClipAnimLoopStyle;
	animLoopSpeed: number;
	animLoopIntensity: number;
	animOut: ClipAnimOutStyle;
	animOutDuration: number;
}

export const CLIP_COMBO_PRESETS: ReadonlyArray<ClipComboPreset> = [
	{
		id: "capcut-viral-clip",
		title: "Combo Viral CapCut (In + Bucle + Out)",
		badge: "Universal #1",
		description: "Zoom Pop de entrada + Levitación 3D en bucle + Contracción final",
		animIn: "zoom-in-pop",
		animInDuration: 0.5,
		animLoop: "float-hover",
		animLoopSpeed: 1.1,
		animLoopIntensity: 1.0,
		animOut: "zoom-out-shrink",
		animOutDuration: 0.45,
	},
	{
		id: "whip-pan-speed-combo",
		title: "Whip Pan Speed Edit (Reels / TikTok Pro)",
		badge: "Reels #1",
		description: "Whip Pan con Motion Blur de entrada + Respiración suave + Whip Pan de salida",
		animIn: "whip-pan-in",
		animInDuration: 0.4,
		animLoop: "zoom-breathe",
		animLoopSpeed: 0.9,
		animLoopIntensity: 0.85,
		animOut: "whip-pan-right-out",
		animOutDuration: 0.4,
	},
	{
		id: "cinema-light-leak-combo",
		title: "Cine Analógico 35mm (Light Leak + Ken Burns)",
		badge: "Cine 35mm",
		description: "Fuga de luz cálida al entrar + Zoom Ken Burns continuo + Film Burn al salir",
		animIn: "light-leak-in",
		animInDuration: 0.65,
		animLoop: "zoom-breathe",
		animLoopSpeed: 0.8,
		animLoopIntensity: 0.9,
		animOut: "film-burn-out",
		animOutDuration: 0.6,
	},
	{
		id: "cinema-doc-pro",
		title: "Documental 4K (Dip to Black + Ken Burns)",
		badge: "Hollywood",
		description: "Emergencia desde negro + Respiración óptica continua + Cierre a negro",
		animIn: "flash-black-in",
		animInDuration: 0.65,
		animLoop: "zoom-breathe",
		animLoopSpeed: 0.75,
		animLoopIntensity: 0.9,
		animOut: "flash-black-out",
		animOutDuration: 0.65,
	},
	{
		id: "cross-zoom-impact-combo",
		title: "Cross-Zoom & Beat Rítmico",
		badge: "GL Impact",
		description: "Cross-Zoom radial de entrada + Pulso de latido central + Cross-Zoom de salida",
		animIn: "cross-zoom-in",
		animInDuration: 0.45,
		animLoop: "pulse-beat",
		animLoopSpeed: 1.25,
		animLoopIntensity: 1.1,
		animOut: "cross-zoom-out",
		animOutDuration: 0.45,
	},
	{
		id: "scifi-anamorphic-combo",
		title: "Sci-Fi Anamórfico (Flare + Levitación + Cubo 3D)",
		badge: "Sci-Fi Pro",
		description: "Destello anamórfico cian al entrar + Flotación suave + Salida en Cubo 3D",
		animIn: "anamorphic-flare-in",
		animInDuration: 0.55,
		animLoop: "float-hover",
		animLoopSpeed: 0.9,
		animLoopIntensity: 0.85,
		animOut: "cube-3d-out",
		animOutDuration: 0.5,
	},
	{
		id: "cyberpunk-2027-combo",
		title: "Cyberpunk 2027 Glitch RGB Total",
		badge: "Cyber 2027",
		description: "Entrada Glitch RGB Split + Interferencia en bucle + Apagado CRT Off",
		animIn: "glitch-in",
		animInDuration: 0.45,
		animLoop: "glitch-loop",
		animLoopSpeed: 1.2,
		animLoopIntensity: 1.1,
		animOut: "glitch-out",
		animOutDuration: 0.4,
	},
	{
		id: "text-viral-karaoke-full",
		title: "Texto: Cascada In + Karaoke Bucle + Pop Out",
		badge: "Texto Viral",
		description: "Entra letra por letra, resalta palabras en bucle y sale en cascada",
		textOnly: true,
		animIn: "letter-pop-cascade",
		animInDuration: 0.65,
		animLoop: "letter-karaoke",
		animLoopSpeed: 1.15,
		animLoopIntensity: 1.2,
		animOut: "letter-pop-out",
		animOutDuration: 0.55,
	},
	{
		id: "text-neon-wave-full",
		title: "Texto: Giro 3D In + Ola Cinética + Dispersión Out",
		badge: "Texto 2027",
		description: "Entra con giro 3D por letra, ondula en bucle y se dispersa al final",
		textOnly: true,
		animIn: "letter-flip-3d",
		animInDuration: 0.65,
		animLoop: "letter-wave",
		animLoopSpeed: 1.2,
		animLoopIntensity: 1.1,
		animOut: "letter-scatter-out",
		animOutDuration: 0.6,
	},
];

export interface ResolvedClipAnimationParams {
	animIn: ClipAnimInStyle;
	animInDuration: number;
	animLoop: ClipAnimLoopStyle;
	animLoopSpeed: number;
	animLoopIntensity: number;
	animOut: ClipAnimOutStyle;
	animOutDuration: number;
}

export function readClipAnimationParams(
	params?: Record<string, unknown>,
): ResolvedClipAnimationParams {
	if (!params) {
		return {
			animIn: "none",
			animInDuration: 0.5,
			animLoop: "none",
			animLoopSpeed: 1,
			animLoopIntensity: 1,
			animOut: "none",
			animOutDuration: 0.5,
		};
	}

	let animIn =
		typeof params.animIn === "string" && params.animIn.length > 0
			? (params.animIn as ClipAnimInStyle)
			: "none";
	let animLoop =
		typeof params.animLoop === "string" && params.animLoop.length > 0
			? (params.animLoop as ClipAnimLoopStyle)
			: "none";
	const animOut =
		typeof params.animOut === "string" && params.animOut.length > 0
			? (params.animOut as ClipAnimOutStyle)
			: "none";

	// Backward compatibility with single letterAnimation param on TextElement
	const legacyLetter =
		typeof params.letterAnimation === "string" ? params.letterAnimation : "none";
	if (animIn === "none" && animLoop === "none" && legacyLetter !== "none") {
		switch (legacyLetter) {
			case "pop-cascade":
				animIn = "letter-pop-cascade";
				break;
			case "typewriter-pro":
				animIn = "letter-typewriter";
				break;
			case "slide-up-reveal":
				animIn = "letter-slide-up";
				break;
			case "bounce-elastic":
				animIn = "letter-bounce";
				break;
			case "flip-3d":
				animIn = "letter-flip-3d";
				break;
			case "scatter-converge":
				animIn = "letter-scatter";
				break;
			case "wave-kinetic":
				animLoop = "letter-wave";
				break;
			case "word-karaoke":
				animLoop = "letter-karaoke";
				break;
			case "neon-pulse":
				animLoop = "letter-neon-pulse";
				break;
			case "heartbeat-sync":
				animLoop = "letter-heartbeat";
				break;
			case "glitch-cyber":
				animLoop = "letter-glitch-rgb";
				break;
		}
	}

	return {
		animIn,
		animInDuration:
			typeof params.animInDuration === "number"
				? clamp({ value: params.animInDuration, min: 0.1, max: 10 })
				: 0.5,
		animLoop,
		animLoopSpeed:
			typeof params.animLoopSpeed === "number"
				? clamp({ value: params.animLoopSpeed, min: 0.2, max: 3 })
				: typeof params.letterAnimationSpeed === "number"
					? params.letterAnimationSpeed
					: 1,
		animLoopIntensity:
			typeof params.animLoopIntensity === "number"
				? clamp({ value: params.animLoopIntensity, min: 0.2, max: 2.5 })
				: typeof params.letterAnimationIntensity === "number"
					? params.letterAnimationIntensity
					: 1,
		animOut,
		animOutDuration:
			typeof params.animOutDuration === "number"
				? clamp({ value: params.animOutDuration, min: 0.1, max: 10 })
				: 0.5,
	};
}

function easeOutCubic(x: number): number {
	return 1 - Math.pow(1 - x, 3);
}

function easeInCubic(x: number): number {
	return x * x * x;
}

function easeOutQuart(x: number): number {
	return 1 - Math.pow(1 - x, 4);
}

function easeInQuart(x: number): number {
	return x * x * x * x;
}

function easeOutExpo(x: number): number {
	return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function easeInExpo(x: number): number {
	return x <= 0 ? 0 : Math.pow(2, 10 * (x - 1));
}

function easeInOutSine(x: number): number {
	return -(Math.cos(Math.PI * x) - 1) / 2;
}

function easeOutBack(x: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeOutElastic(x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const c4 = (2 * Math.PI) / 3;
	return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

export function applyClipPhaseAnimations({
	baseTransform,
	baseOpacity,
	clipParams,
	localTimeSec,
	timelineTimeSec,
	durationSec,
	canvasWidth = 1920,
	canvasHeight = 1080,
	isText = false,
}: {
	baseTransform: Transform;
	baseOpacity: number;
	clipParams?: Record<string, unknown>;
	localTimeSec: number;
	timelineTimeSec?: number;
	durationSec: number;
	canvasWidth?: number;
	canvasHeight?: number;
	isText?: boolean;
}): {
	transform: Transform;
	opacity: number;
	isAnimated: boolean;
	transitionFx: TransitionVisualFx | null;
} {
	const cfg = readClipAnimationParams(clipParams);
	const hasWholeIn =
		cfg.animIn !== "none" && !(isText && cfg.animIn.startsWith("letter-"));
	const hasWholeLoop =
		cfg.animLoop !== "none" && !(isText && cfg.animLoop.startsWith("letter-"));
	const hasWholeOut =
		cfg.animOut !== "none" && !(isText && cfg.animOut.startsWith("letter-"));

	if (!hasWholeIn && !hasWholeLoop && !hasWholeOut) {
		return {
			transform: baseTransform,
			opacity: baseOpacity,
			isAnimated:
				cfg.animIn !== "none" ||
				cfg.animLoop !== "none" ||
				cfg.animOut !== "none",
			transitionFx: null,
		};
	}

	const safeDuration = Math.max(0.1, durationSec);
	const inDur =
		cfg.animIn !== "none"
			? clamp({ value: cfg.animInDuration, min: 0.08, max: safeDuration * 0.85 })
			: 0;
	const outDur =
		cfg.animOut !== "none"
			? clamp({
					value: cfg.animOutDuration,
					min: 0.08,
					max: Math.max(0.08, safeDuration - inDur * 0.5),
				})
			: 0;

	let dx = 0;
	let dy = 0;
	let scaleX = 1;
	let scaleY = 1;
	let rotateDeg = 0;
	let opacityMult = 1;
	let transitionFx: TransitionVisualFx | null = null;

	// 1. ENTRADA (IN - Primera parte)
	if (hasWholeIn && localTimeSec < inDur) {
		const p = clamp({ value: localTimeSec / inDur, min: 0, max: 1 });
		const eased = easeOutCubic(p);
		const easedQuart = easeOutQuart(p);
		const easedExpo = easeOutExpo(p);
		const inv = 1 - eased;
		const invQuart = 1 - easedQuart;
		const invExpo = 1 - easedExpo;

		switch (cfg.animIn) {
			case "fade-in":
				opacityMult *= isText
					? clamp({ value: 0.88 + 0.12 * easeInOutSine(p), min: 0.88, max: 1 })
					: easeInOutSine(p);
				break;
			case "zoom-in-pop": {
				const s = isText
					? 0.84 + 0.16 * easeOutBack(p)
					: 0.82 + 0.18 * easeOutBack(p);
				scaleX *= s;
				scaleY *= s;
				opacityMult *= clamp({ value: 0.88 + p * 0.5, min: 0.88, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "cross-zoom-in": {
				const s = isText ? 0.42 + 0.58 * easedExpo : 1 + invExpo * 0.48;
				scaleX *= s;
				scaleY *= s;
				opacityMult *= clamp({ value: p * 3.0, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "zoom-out-drop": {
				const s = 1 + invExpo * 1.15;
				scaleX *= s;
				scaleY *= s;
				opacityMult *= clamp({ value: p * 2.2, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "slide-up":
				dy += invQuart * canvasHeight * 0.48;
				opacityMult *= clamp({ value: p * 2.0, min: 0, max: 1 });
				break;
			case "slide-down":
				dy -= invQuart * canvasHeight * 0.48;
				opacityMult *= clamp({ value: p * 2.0, min: 0, max: 1 });
				break;
			case "slide-left":
				dx += invQuart * canvasWidth * 0.52;
				opacityMult *= clamp({ value: p * 2.0, min: 0, max: 1 });
				break;
			case "slide-right":
				dx -= invQuart * canvasWidth * 0.52;
				opacityMult *= clamp({ value: p * 2.0, min: 0, max: 1 });
				break;
			case "spin-in": {
				const s = Math.max(0.12, easedExpo);
				scaleX *= s;
				scaleY *= s;
				rotateDeg -= invExpo * 165;
				opacityMult *= clamp({ value: p * 2.4, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "spin-ccw-in": {
				const s = Math.max(0.12, easedExpo);
				scaleX *= s;
				scaleY *= s;
				rotateDeg += invExpo * 165;
				opacityMult *= clamp({ value: p * 2.4, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "pendulum-in": {
				const damp = Math.exp(-4.2 * p) * Math.cos(p * Math.PI * 2.5);
				rotateDeg += damp * 28;
				dx -= damp * canvasWidth * 0.22;
				dy -= Math.abs(damp) * canvasHeight * 0.08;
				opacityMult *= clamp({ value: p * 2.5, min: 0, max: 1 });
				break;
			}
			case "elastic-drop": {
				const el = easeOutElastic(p);
				dy -= (1 - el) * canvasHeight * 0.4;
				opacityMult *= clamp({ value: p * 2.5, min: 0, max: 1 });
				break;
			}
			case "whip-pan-in": {
				dx -= invExpo * canvasWidth * 0.85;
				scaleX *= 1 + invExpo * 0.32;
				scaleY *= 1 - invExpo * 0.08;
				opacityMult *= clamp({ value: p * 3.0, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-x",
					progress: p,
					direction: 1,
					signedVector: -1,
				};
				break;
			}
			case "whip-pan-left-in": {
				dx += invExpo * canvasWidth * 0.85;
				scaleX *= 1 + invExpo * 0.32;
				scaleY *= 1 - invExpo * 0.08;
				opacityMult *= clamp({ value: p * 3.0, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-x",
					progress: p,
					direction: 1,
					signedVector: 1,
				};
				break;
			}
			case "whip-pan-up-in": {
				dy += invExpo * canvasHeight * 0.85;
				scaleY *= 1 + invExpo * 0.32;
				scaleX *= 1 - invExpo * 0.08;
				opacityMult *= clamp({ value: p * 3.0, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-y",
					progress: p,
					direction: 1,
					signedVector: 1,
				};
				break;
			}
			case "whip-pan-down-in": {
				dy -= invExpo * canvasHeight * 0.85;
				scaleY *= 1 + invExpo * 0.32;
				scaleX *= 1 - invExpo * 0.08;
				opacityMult *= clamp({ value: p * 3.0, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-y",
					progress: p,
					direction: 1,
					signedVector: -1,
				};
				break;
			}
			case "flash-white-in": {
				scaleX *= 1 + inv * 0.06;
				scaleY *= 1 + inv * 0.06;
				transitionFx = {
					kind: "flash-white",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "flash-black-in": {
				scaleX *= 1 + inv * 0.04;
				scaleY *= 1 + inv * 0.04;
				opacityMult *= eased;
				transitionFx = {
					kind: "flash-black",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "light-leak-in": {
				scaleX *= 1 + inv * 0.08;
				scaleY *= 1 + inv * 0.08;
				opacityMult *= clamp({ value: p * 1.8, min: 0, max: 1 });
				transitionFx = {
					kind: "light-leak-warm",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "film-burn-in": {
				scaleX *= 1 + inv * 0.1;
				scaleY *= 1 + inv * 0.1;
				opacityMult *= clamp({ value: p * 1.9, min: 0, max: 1 });
				transitionFx = {
					kind: "film-burn",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "anamorphic-flare-in": {
				scaleX *= 1 + invExpo * 0.12;
				scaleY *= 1 + invExpo * 0.04;
				opacityMult *= clamp({ value: p * 2.2, min: 0, max: 1 });
				transitionFx = {
					kind: "anamorphic-flare",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "dreamy-blur-in": {
				const wave = Math.sin(p * Math.PI * 2) * inv;
				scaleX *= 1 + inv * 0.14;
				scaleY *= 1 + inv * 0.14;
				dy += wave * canvasHeight * 0.025;
				rotateDeg += wave * 2.5;
				opacityMult *= easeInOutSine(p);
				transitionFx = {
					kind: "dreamy-glow",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "iris-circle-in": {
				scaleX *= 1 + inv * 0.06;
				scaleY *= 1 + inv * 0.06;
				transitionFx = {
					kind: "iris-circle",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "diagonal-wipe-in": {
				transitionFx = {
					kind: "diagonal-wipe",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "blinds-venetian-in": {
				transitionFx = {
					kind: "blinds-venetian",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "split-doors-in": {
				scaleX *= 1 + inv * 0.05;
				scaleY *= 1 + inv * 0.05;
				transitionFx = {
					kind: "split-doors",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "clock-radial-in": {
				transitionFx = {
					kind: "clock-radial",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "diamond-reveal-in": {
				scaleX *= 1 + inv * 0.06;
				scaleY *= 1 + inv * 0.06;
				transitionFx = {
					kind: "diamond-reveal",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "cube-3d-in": {
				const angle = invQuart * Math.PI * 0.48;
				dx += invQuart * canvasWidth * 0.46;
				scaleX *= Math.max(0.08, Math.cos(angle));
				scaleY *= 1 - Math.sin(angle) * 0.14;
				opacityMult *= clamp({ value: p * 2.4, min: 0, max: 1 });
				transitionFx = {
					kind: "cube-3d-shade",
					progress: p,
					direction: 1,
					signedVector: 1,
				};
				break;
			}
			case "flip-3d-in": {
				const angle = inv * Math.PI * 0.85;
				scaleX *= Math.max(0.05, Math.abs(Math.cos(angle)));
				scaleY *= 1 + Math.sin(angle) * 0.15;
				opacityMult *= clamp({ value: p * 1.8, min: 0, max: 1 });
				transitionFx = {
					kind: "cube-3d-shade",
					progress: p,
					direction: 1,
					signedVector: -1,
				};
				break;
			}
			case "glitch-in": {
				const jitter = Math.sin(localTimeSec * 90) * inv;
				dx += jitter * canvasWidth * 0.045;
				dy += Math.cos(localTimeSec * 70) * inv * canvasHeight * 0.02;
				scaleX *= 1 + Math.abs(jitter) * 0.18;
				opacityMult *= clamp({ value: p * 2.5, min: 0, max: 1 });
				transitionFx = {
					kind: "glitch-rgb-slice",
					progress: p,
					direction: 1,
				};
				break;
			}
			case "vhs-tracking-in": {
				const trackJitter = Math.sin(localTimeSec * 65) * inv;
				dy += trackJitter * canvasHeight * 0.05;
				dx += Math.cos(localTimeSec * 110) * inv * canvasWidth * 0.02;
				opacityMult *= clamp({ value: p * 2.2, min: 0, max: 1 });
				transitionFx = {
					kind: "vhs-tracking",
					progress: p,
					direction: 1,
				};
				break;
			}
		}
	}

	// 2. ENMEDIO / BUCLE (LOOP - Parte central)
	if (hasWholeLoop) {
		const loopStart = inDur * 0.65;
		const loopEnd = safeDuration - outDur * 0.65;
		if (localTimeSec >= loopStart && localTimeSec <= loopEnd) {
			let env = 1;
			if (inDur > 0 && localTimeSec < inDur) {
				env = clamp({
					value: (localTimeSec - loopStart) / Math.max(0.05, inDur - loopStart),
					min: 0,
					max: 1,
				});
			}
			if (outDur > 0 && localTimeSec > safeDuration - outDur) {
				const outStart = safeDuration - outDur;
				env *= clamp({
					value:
						1 - (localTimeSec - outStart) / Math.max(0.05, loopEnd - outStart),
					min: 0,
					max: 1,
				});
			}

			const t = (timelineTimeSec ?? localTimeSec - loopStart) * cfg.animLoopSpeed;
			const amp = cfg.animLoopIntensity * env;

			switch (cfg.animLoop) {
				case "pulse-beat": {
					const phase = (t * 1.8) % 1;
					const beat =
						phase < 0.22
							? Math.sin((phase / 0.22) * Math.PI)
							: phase >= 0.28 && phase < 0.45
								? 0.5 * Math.sin(((phase - 0.28) / 0.17) * Math.PI)
								: 0;
					const s = 1 + beat * 0.1 * amp;
					scaleX *= s;
					scaleY *= s;
					break;
				}
				case "float-hover": {
					dy += Math.sin(t * Math.PI * 1.6) * (canvasHeight * 0.028 * amp);
					dx += Math.cos(t * Math.PI * 0.8) * (canvasWidth * 0.01 * amp);
					rotateDeg += Math.sin(t * Math.PI * 1.2) * (1.8 * amp);
					break;
				}
				case "zoom-breathe": {
					const s = 1 + (0.5 - 0.5 * Math.cos(t * Math.PI * 1.1)) * 0.12 * amp;
					scaleX *= s;
					scaleY *= s;
					break;
				}
				case "pendulum-swing": {
					rotateDeg += Math.sin(t * Math.PI * 1.8) * (7.5 * amp);
					dx += Math.sin(t * Math.PI * 1.8) * (canvasWidth * 0.018 * amp);
					break;
				}
				case "shake-handheld": {
					dx +=
						(Math.sin(t * 22) * 0.6 + Math.cos(t * 37) * 0.4) *
						canvasWidth *
						0.014 *
						amp;
					dy +=
						(Math.cos(t * 19) * 0.6 + Math.sin(t * 31) * 0.4) *
						canvasHeight *
						0.014 *
						amp;
					rotateDeg += Math.sin(t * 27) * 1.6 * amp;
					break;
				}
				case "jello-wobble": {
					const w = Math.sin(t * Math.PI * 2.8) * 0.1 * amp;
					scaleX *= 1 + w;
					scaleY *= 1 - w * 0.85;
					rotateDeg += Math.cos(t * Math.PI * 2.8) * 2.5 * amp;
					break;
				}
				case "spin-continuous": {
					rotateDeg += t * 90 * amp;
					break;
				}
				case "glitch-loop": {
					const g = Math.sin(t * 31) * Math.cos(t * 17);
					if (g > 0.62) {
						dx += Math.sin(t * 95) * canvasWidth * 0.032 * amp;
						dy += Math.cos(t * 80) * canvasHeight * 0.012 * amp;
						scaleX *= 1 + (g - 0.62) * 0.35 * amp;
						if (!transitionFx) {
							transitionFx = {
								kind: "glitch-rgb-slice",
								progress: clamp({ value: 1 - (g - 0.62) * 2.2, min: 0.15, max: 0.9 }),
								direction: 1,
							};
						}
					}
					break;
				}
				case "flash-strobe": {
					const wave = 0.5 + 0.5 * Math.cos(t * Math.PI * 4);
					opacityMult *=
						1 - (1 - wave) * clamp({ value: 0.65 * amp, min: 0, max: 0.9 });
					break;
				}
			}
		}
	}

	// 3. SALIDA (OUT - Parte final)
	if (hasWholeOut && localTimeSec > safeDuration - outDur) {
		const p = clamp({
			value: (localTimeSec - (safeDuration - outDur)) / outDur,
			min: 0,
			max: 1,
		});
		const rem = 1 - p; // 1 at start of Out, 0 at cut boundary
		const eased = easeInCubic(p);
		const easedQuart = easeInQuart(p);
		const easedExpo = easeInExpo(p);

		switch (cfg.animOut) {
			case "fade-out":
				opacityMult *= 1 - easeInOutSine(p);
				break;
			case "zoom-out-shrink": {
				const s = isText
					? Math.max(0.08, 1 - easedExpo * 0.82)
					: 1 + easedExpo * 0.35;
				scaleX *= s;
				scaleY *= s;
				opacityMult *= clamp({ value: rem * 2.2, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "zoom-in-explode":
			case "cross-zoom-out": {
				const s = 1 + easedExpo * 1.25;
				scaleX *= s;
				scaleY *= s;
				opacityMult *= clamp({ value: rem * 1.8, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "slide-down-out":
				dy += easedQuart * canvasHeight * 0.48;
				opacityMult *= 1 - eased * 0.92;
				break;
			case "slide-up-out":
				dy -= easedQuart * canvasHeight * 0.48;
				opacityMult *= 1 - eased * 0.92;
				break;
			case "slide-left-out":
				dx -= easedQuart * canvasWidth * 0.52;
				opacityMult *= 1 - eased * 0.92;
				break;
			case "slide-right-out":
				dx += easedQuart * canvasWidth * 0.52;
				opacityMult *= 1 - eased * 0.92;
				break;
			case "whip-pan-right-out": {
				dx += easedExpo * canvasWidth * 0.85;
				scaleX *= 1 + easedExpo * 0.32;
				scaleY *= 1 - easedExpo * 0.08;
				opacityMult *= clamp({ value: rem * 2.4, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-x",
					progress: rem,
					direction: -1,
					signedVector: 1,
				};
				break;
			}
			case "whip-pan-left-out": {
				dx -= easedExpo * canvasWidth * 0.85;
				scaleX *= 1 + easedExpo * 0.32;
				scaleY *= 1 - easedExpo * 0.08;
				opacityMult *= clamp({ value: rem * 2.4, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-x",
					progress: rem,
					direction: -1,
					signedVector: -1,
				};
				break;
			}
			case "whip-pan-up-out": {
				dy -= easedExpo * canvasHeight * 0.85;
				scaleY *= 1 + easedExpo * 0.32;
				scaleX *= 1 - easedExpo * 0.08;
				opacityMult *= clamp({ value: rem * 2.4, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-y",
					progress: rem,
					direction: -1,
					signedVector: -1,
				};
				break;
			}
			case "whip-pan-down-out": {
				dy += easedExpo * canvasHeight * 0.85;
				scaleY *= 1 + easedExpo * 0.32;
				scaleX *= 1 - easedExpo * 0.08;
				opacityMult *= clamp({ value: rem * 2.4, min: 0, max: 1 });
				transitionFx = {
					kind: "whip-blur-y",
					progress: rem,
					direction: -1,
					signedVector: 1,
				};
				break;
			}
			case "spin-out": {
				const s = Math.max(0.12, 1 - easedExpo * 0.85);
				scaleX *= s;
				scaleY *= s;
				rotateDeg += easedExpo * 165;
				opacityMult *= clamp({ value: rem * 2.0, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "spin-ccw-out": {
				const s = Math.max(0.12, 1 - easedExpo * 0.85);
				scaleX *= s;
				scaleY *= s;
				rotateDeg -= easedExpo * 165;
				opacityMult *= clamp({ value: rem * 2.0, min: 0, max: 1 });
				transitionFx = {
					kind: "radial-zoom-blur",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "flash-white-out": {
				scaleX *= 1 + eased * 0.06;
				scaleY *= 1 + eased * 0.06;
				transitionFx = {
					kind: "flash-white",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "flash-black-out": {
				scaleX *= 1 - eased * 0.04;
				scaleY *= 1 - eased * 0.04;
				opacityMult *= 1 - eased;
				transitionFx = {
					kind: "flash-black",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "light-leak-out": {
				scaleX *= 1 + eased * 0.08;
				scaleY *= 1 + eased * 0.08;
				opacityMult *= clamp({ value: rem * 1.6, min: 0, max: 1 });
				transitionFx = {
					kind: "light-leak-warm",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "film-burn-out": {
				scaleX *= 1 + eased * 0.1;
				scaleY *= 1 + eased * 0.1;
				opacityMult *= clamp({ value: rem * 1.6, min: 0, max: 1 });
				transitionFx = {
					kind: "film-burn",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "anamorphic-flare-out": {
				scaleX *= 1 + easedExpo * 0.12;
				scaleY *= 1 + easedExpo * 0.04;
				opacityMult *= clamp({ value: rem * 1.8, min: 0, max: 1 });
				transitionFx = {
					kind: "anamorphic-flare",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "dreamy-blur-out": {
				scaleX *= 1 + eased * 0.14;
				scaleY *= 1 + eased * 0.14;
				opacityMult *= 1 - easeInOutSine(p);
				transitionFx = {
					kind: "dreamy-glow",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "iris-circle-out": {
				transitionFx = {
					kind: "iris-circle",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "diagonal-wipe-out": {
				transitionFx = {
					kind: "diagonal-wipe",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "blinds-venetian-out": {
				transitionFx = {
					kind: "blinds-venetian",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "split-doors-out": {
				transitionFx = {
					kind: "split-doors",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "clock-radial-out": {
				transitionFx = {
					kind: "clock-radial",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "diamond-reveal-out": {
				transitionFx = {
					kind: "diamond-reveal",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "cube-3d-out": {
				const angle = easedQuart * Math.PI * 0.48;
				dx -= easedQuart * canvasWidth * 0.46;
				scaleX *= Math.max(0.08, Math.cos(angle));
				scaleY *= 1 - Math.sin(angle) * 0.14;
				opacityMult *= clamp({ value: rem * 2.2, min: 0, max: 1 });
				transitionFx = {
					kind: "cube-3d-shade",
					progress: rem,
					direction: -1,
					signedVector: -1,
				};
				break;
			}
			case "flip-3d-out": {
				const angle = eased * Math.PI * 0.5;
				scaleX *= Math.max(0.04, Math.cos(angle));
				scaleY *= 1 + Math.sin(angle) * 0.15;
				opacityMult *= 1 - eased;
				transitionFx = {
					kind: "cube-3d-shade",
					progress: rem,
					direction: -1,
					signedVector: 1,
				};
				break;
			}
			case "glitch-out": {
				dx += Math.sin(localTimeSec * 95) * canvasWidth * 0.04 * p;
				scaleX *= 1 + p * 0.25;
				opacityMult *= clamp({ value: rem * 2.2, min: 0, max: 1 });
				transitionFx = {
					kind: "glitch-rgb-slice",
					progress: rem,
					direction: -1,
				};
				break;
			}
			case "vhs-tracking-out": {
				dy -= Math.sin(localTimeSec * 70) * canvasHeight * 0.045 * p;
				opacityMult *= clamp({ value: rem * 2.0, min: 0, max: 1 });
				transitionFx = {
					kind: "vhs-tracking",
					progress: rem,
					direction: -1,
				};
				break;
			}
		}
	}

	return {
		transform: {
			position: {
				x: baseTransform.position.x + dx,
				y: baseTransform.position.y + dy,
			},
			scaleX: baseTransform.scaleX * scaleX,
			scaleY: baseTransform.scaleY * scaleY,
			rotate: baseTransform.rotate + rotateDeg,
		},
		opacity: clamp({ value: baseOpacity * opacityMult, min: 0, max: 1 }),
		isAnimated: true,
		transitionFx,
	};
}
