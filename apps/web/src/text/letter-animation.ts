import type { TextCanvasContext } from "./layout";
import { CORNER_RADIUS_MAX, CORNER_RADIUS_MIN } from "./background";
import { getTextBackgroundRect, setCanvasLetterSpacing } from "./layout";
import type {
	MeasuredTextLayout,
	ResolvedTextBackgroundLike,
} from "./primitives";
import { clamp } from "@/utils/math";

export type LetterAnimationStyle =
	| "none"
	| "pop-cascade"
	| "typewriter-pro"
	| "wave-kinetic"
	| "slide-up-reveal"
	| "bounce-elastic"
	| "glitch-cyber"
	| "neon-pulse"
	| "word-karaoke"
	| "flip-3d"
	| "scatter-converge"
	| "heartbeat-sync"
	| "pop-out-cascade"
	| "scatter-out"
	| "drop-out";

export interface LetterAnimationOption {
	value: LetterAnimationStyle;
	label: string;
	badge: string;
	description: string;
}

export const LETTER_ANIMATION_OPTIONS: ReadonlyArray<LetterAnimationOption> = [
	{
		value: "none",
		label: "Sin animación (Estático)",
		badge: "Base",
		description: "Texto fijo sin movimiento por carácter",
	},
	{
		value: "pop-cascade",
		label: "Pop Viral CapCut (Cascada)",
		badge: "Viral #1",
		description: "Aparición elástica letra por letra con rebote energético",
	},
	{
		value: "word-karaoke",
		label: "Karaoke / Énfasis por Palabra",
		badge: "Reels 2026",
		description: "Resalta cada palabra con pastilla activa y zoom dinámico",
	},
	{
		value: "typewriter-pro",
		label: "Máquina de Escribir + Cursor Neón",
		badge: "Tech HUD",
		description: "Escritura secuencial en vivo con cursor láser parpadeante",
	},
	{
		value: "wave-kinetic",
		label: "Ola Cinética Continua",
		badge: "2027 Flow",
		description: "Movimiento sinusoidal fluido y rotación armónica por letra",
	},
	{
		value: "slide-up-reveal",
		label: "Revelación Editorial Suave",
		badge: "Editorial",
		description: "Ascenso limpio carácter por carácter con aparición gradual",
	},
	{
		value: "bounce-elastic",
		label: "Caída con Rebote Elástico",
		badge: "Dinámico",
		description: "Las letras caen con física de resorte y amortiguación",
	},
	{
		value: "glitch-cyber",
		label: "Glitch Cyberpunk RGB 2027",
		badge: "Cyber 2027",
		description: "Aberración cromática Cian/Magenta y micro-saltos digitales",
	},
	{
		value: "neon-pulse",
		label: "Pulso Láser Neón",
		badge: "Glow",
		description: "Onda luminosa con resplandor intenso recorriendo cada letra",
	},
	{
		value: "flip-3d",
		label: "Giro 3D por Carácter",
		badge: "3D Motion",
		description: "Rotación en perspectiva horizontal con revelado secuencial",
	},
	{
		value: "scatter-converge",
		label: "Convergencia Orbital",
		badge: "Cosmos",
		description: "Las letras convergen desde el espacio hacia su centro óptico",
	},
	{
		value: "heartbeat-sync",
		label: "Latido Rítmico (Beat Sync)",
		badge: "Música",
		description: "Pulso de escala sincronizado en onda para acompañar el ritmo",
	},
];

export interface WordRelativeTiming {
	word: string;
	startOffset: number;
	endOffset: number;
}

export interface ResolvedLetterAnimationState {
	style: LetterAnimationStyle;
	speed: number;
	intensity: number;
	accentColor: string;
	localTimeSec: number;
	durationSec: number;
	strokeWidth?: number;
	strokeColor?: string;
	shadowBlur?: number;
	shadowColor?: string;
	karaokeMode?: "pill" | "highlight";
	wordTimings?: WordRelativeTiming[];
}

function easeOutBack(x: number): number {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeOutCubic(x: number): number {
	return 1 - Math.pow(1 - x, 3);
}

function easeOutElastic(x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const c4 = (2 * Math.PI) / 3;
	return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

export function drawAnimatedTextLayout({
	ctx,
	layout,
	textColor,
	background,
	backgroundColor,
	textBaseline = "middle",
	animation,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
	textBaseline?: CanvasTextBaseline;
	animation: ResolvedLetterAnimationState;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.fillStyle = textColor;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: 0 });

	if (
		background?.enabled &&
		backgroundColor &&
		backgroundColor !== "transparent" &&
		layout.lines.length > 0
	) {
		const backgroundRect = getTextBackgroundRect({
			textAlign: layout.textAlign,
			block: layout.block,
			background: {
				...background,
				color: backgroundColor,
			},
			fontSizeRatio: layout.fontSizeRatio,
		});
		if (backgroundRect) {
			const p =
				clamp({
					value: background.cornerRadius,
					min: CORNER_RADIUS_MIN,
					max: CORNER_RADIUS_MAX,
				}) / 100;
			const radius =
				(Math.min(backgroundRect.width, backgroundRect.height) / 2) * p;
			ctx.fillStyle = backgroundColor;
			ctx.beginPath();
			ctx.roundRect(
				backgroundRect.left,
				backgroundRect.top,
				backgroundRect.width,
				backgroundRect.height,
				radius,
			);
			ctx.fill();
			ctx.fillStyle = textColor;
		}
	}

	const { style, speed, intensity, accentColor, localTimeSec } = animation;
	const t = Math.max(0, localTimeSec) * Math.max(0.1, speed);
	const amp = Math.max(0.1, intensity);
	const fontSize = layout.scaledFontSize;

	if (style === "word-karaoke") {
		drawWordKaraokeLayout({
			ctx,
			layout,
			textColor,
			accentColor,
			textBaseline,
			t,
			amp,
			animation,
		});
		return;
	}

	// Count total characters across all lines for sequential animations
	const lineGraphemes = layout.lines.map((line) => Array.from(line));
	const totalChars = Math.max(
		1,
		lineGraphemes.reduce((acc, arr) => acc + arr.length, 0),
	);

	let globalCharIndex = 0;
	const typewriterRevealCount =
		style === "typewriter-pro" ? Math.floor(t * 14) : totalChars;

	for (let lineIdx = 0; lineIdx < layout.lines.length; lineIdx++) {
		const chars = lineGraphemes[lineIdx];
		if (chars.length === 0) continue;

		const lineY =
			lineIdx * layout.lineHeightPx - layout.block.visualCenterOffset;
		const charWidths = chars.map((ch) => ctx.measureText(ch).width);
		const totalLineWidth =
			charWidths.reduce((sum, w) => sum + w, 0) +
			Math.max(0, chars.length - 1) * layout.letterSpacing;

		let cursorX = 0;
		if (layout.textAlign === "center") {
			cursorX = -totalLineWidth / 2;
		} else if (layout.textAlign === "right") {
			cursorX = -totalLineWidth;
		}

		for (let i = 0; i < chars.length; i++) {
			const ch = chars[i];
			const w = charWidths[i];
			const charCenterX = cursorX + w / 2;
			cursorX += w + layout.letterSpacing;

			const idx = globalCharIndex++;
			const stagger = idx * 0.045;
			const localCharT = t - stagger;

			if (style === "typewriter-pro" && idx >= typewriterRevealCount) {
				if (idx === typewriterRevealCount) {
					// Draw blinking neon cursor right at the active insertion point
					const blink = Math.sin(localTimeSec * 12) >= -0.2;
					if (blink) {
						ctx.save();
						ctx.fillStyle = accentColor || "#38bdf8";
						ctx.shadowColor = accentColor || "#38bdf8";
						ctx.shadowBlur = fontSize * 0.35;
						const cursorW = Math.max(3, fontSize * 0.12);
						const cursorH = fontSize * 0.92;
						ctx.fillRect(
							charCenterX - w / 2 + 2,
							lineY - cursorH / 2,
							cursorW,
							cursorH,
						);
						ctx.restore();
					}
				}
				continue;
			}

			let dx = 0;
			let dy = 0;
			let scaleX = 1;
			let scaleY = 1;
			let rotateRad = 0;
			let alpha = 1;
			let glowBlur = 0;
			let glowColor = accentColor || "#38bdf8";
			let drawColor = textColor;

			switch (style) {
				case "pop-cascade": {
					const prog = clamp({ value: localCharT / 0.38, min: 0, max: 1 });
					if (prog <= 0) {
						alpha = 0;
						scaleX = 0.01;
						scaleY = 0.01;
					} else {
						const eased = easeOutBack(prog);
						const overshoot = 1 + (eased - 1) * (1.25 * amp);
						const s = prog < 1 ? overshoot : 1;
						scaleX = s;
						scaleY = s;
						dy = (1 - easeOutCubic(prog)) * fontSize * 0.35 * amp;
						alpha = clamp({ value: prog * 2.2, min: 0, max: 1 });
					}
					break;
				}

				case "wave-kinetic": {
					const phase = t * 4.8 - idx * 0.42;
					dy = Math.sin(phase) * (fontSize * 0.22 * amp);
					rotateRad = Math.cos(phase) * 0.08 * amp;
					const s = 1 + Math.sin(phase * 2) * 0.06 * amp;
					scaleX = s;
					scaleY = s;
					break;
				}

				case "slide-up-reveal": {
					const prog = clamp({ value: localCharT / 0.42, min: 0, max: 1 });
					const eased = easeOutCubic(prog);
					dy = (1 - eased) * fontSize * 0.75 * amp;
					alpha = eased;
					break;
				}

				case "bounce-elastic": {
					const prog = clamp({ value: localCharT / 0.68, min: 0, max: 1 });
					if (prog <= 0) {
						alpha = 0;
						dy = -fontSize * 1.1 * amp;
					} else {
						const eased = easeOutElastic(prog);
						dy = (1 - eased) * (-fontSize * 0.9 * amp);
						scaleY = 1 + (1 - prog) * Math.sin(prog * Math.PI * 4) * 0.22 * amp;
						scaleX = 2 - scaleY;
						alpha = clamp({ value: prog * 3, min: 0, max: 1 });
					}
					break;
				}

				case "glitch-cyber": {
					const seed = Math.sin(t * 28 + idx * 19.37) * 43758.5453;
					const frac = seed - Math.floor(seed);
					const isGlitching = frac > 0.68;
					if (isGlitching) {
						dx = (frac - 0.84) * fontSize * 0.45 * amp;
						dy = Math.cos(t * 55 + idx * 7) * fontSize * 0.14 * amp;
						scaleX = 1 + (frac - 0.75) * 0.35 * amp;
					}
					// Draw RGB split layers
					ctx.save();
					ctx.translate(charCenterX + dx, lineY + dy);
					ctx.textAlign = "center";
					ctx.textBaseline = textBaseline;
					const splitOffset = (isGlitching ? 0.12 : 0.045) * fontSize * amp;
					ctx.fillStyle = "#00f0ff";
					ctx.globalAlpha = 0.75;
					ctx.fillText(ch, -splitOffset, -splitOffset * 0.25);
					ctx.fillStyle = "#ff0055";
					ctx.fillText(ch, splitOffset, splitOffset * 0.25);
					ctx.restore();
					break;
				}

				case "neon-pulse": {
					const wave = 0.5 + 0.5 * Math.sin(t * 5.2 - idx * 0.35);
					glowBlur = fontSize * (0.15 + wave * 0.55 * amp);
					glowColor = accentColor || "#38bdf8";
					const s = 1 + wave * 0.09 * amp;
					scaleX = s;
					scaleY = s;
					if (wave > 0.78) {
						drawColor = "#ffffff";
					}
					break;
				}

				case "flip-3d": {
					const prog = clamp({ value: localCharT / 0.48, min: 0, max: 1 });
					if (prog <= 0) {
						alpha = 0;
						scaleX = 0.01;
					} else {
						const angle = (1 - easeOutCubic(prog)) * Math.PI * amp;
						scaleX = Math.max(0.05, Math.abs(Math.cos(angle)));
						scaleY = 1 + Math.sin(angle) * 0.18 * amp;
						alpha = clamp({ value: prog * 1.8, min: 0, max: 1 });
					}
					break;
				}

				case "scatter-converge": {
					const prog = clamp({ value: localCharT / 0.55, min: 0, max: 1 });
					const inv = 1 - easeOutCubic(prog);
					const angle = (idx * 2.3999632) % (Math.PI * 2);
					dx = Math.cos(angle) * fontSize * 1.35 * inv * amp;
					dy = Math.sin(angle) * fontSize * 0.95 * inv * amp;
					rotateRad = (idx % 2 === 0 ? 1 : -1) * inv * 1.2 * amp;
					const s = 0.3 + 0.7 * easeOutCubic(prog);
					scaleX = s;
					scaleY = s;
					alpha = easeOutCubic(prog);
					break;
				}

				case "heartbeat-sync": {
					const beatPhase = (t * 2.4 - idx * 0.06) % 1;
					const pulse =
						beatPhase >= 0 && beatPhase < 0.22
							? Math.sin((beatPhase / 0.22) * Math.PI)
							: beatPhase >= 0.28 && beatPhase < 0.46
								? 0.55 * Math.sin(((beatPhase - 0.28) / 0.18) * Math.PI)
								: 0;
					const s = 1 + pulse * 0.24 * amp;
					scaleX = s;
					scaleY = s;
					dy = -pulse * fontSize * 0.08 * amp;
					if (pulse > 0.3) {
						glowBlur = fontSize * 0.25 * pulse * amp;
						glowColor = accentColor || "#f43f5e";
					}
					break;
				}

				case "pop-out-cascade": {
					const prog = clamp({ value: localCharT / 0.38, min: 0, max: 1 });
					const eased = prog * prog;
					const s = Math.max(0.01, 1 - eased);
					scaleX = s;
					scaleY = s;
					dy = -eased * fontSize * 0.3 * amp;
					alpha = clamp({ value: 1 - eased, min: 0, max: 1 });
					break;
				}

				case "scatter-out": {
					const prog = clamp({ value: localCharT / 0.45, min: 0, max: 1 });
					const eased = prog * prog;
					const angle = (idx * 2.3999632) % (Math.PI * 2);
					dx = Math.cos(angle) * fontSize * 1.45 * eased * amp;
					dy = Math.sin(angle) * fontSize * 1.05 * eased * amp;
					rotateRad = (idx % 2 === 0 ? 1 : -1) * eased * 1.4 * amp;
					const s = Math.max(0.05, 1 - eased * 0.75);
					scaleX = s;
					scaleY = s;
					alpha = clamp({ value: 1 - eased, min: 0, max: 1 });
					break;
				}

				case "drop-out": {
					const prog = clamp({ value: localCharT / 0.42, min: 0, max: 1 });
					const eased = prog * prog;
					dy = eased * fontSize * 1.25 * amp;
					rotateRad = (idx % 2 === 0 ? 1 : -1) * eased * 0.45 * amp;
					alpha = clamp({ value: 1 - prog * 1.15, min: 0, max: 1 });
					break;
				}

				default:
					break;
			}

			if (alpha <= 0.005) continue;

			ctx.save();
			ctx.translate(charCenterX + dx, lineY + dy);
			if (rotateRad !== 0) {
				ctx.rotate(rotateRad);
			}
			if (scaleX !== 1 || scaleY !== 1) {
				ctx.scale(scaleX, scaleY);
			}
			ctx.globalAlpha *= alpha;
			ctx.textAlign = "center";
			ctx.textBaseline = textBaseline;
			const strokeW = (animation.strokeWidth ?? 0) * (fontSize / 48);
			if (strokeW > 0.2) {
				ctx.save();
				ctx.strokeStyle = animation.strokeColor || "#000000";
				ctx.lineWidth = strokeW * 2;
				ctx.lineJoin = "round";
				ctx.lineCap = "round";
				if ((animation.shadowBlur ?? 0) > 0) {
					ctx.shadowColor = animation.shadowColor || "rgba(0,0,0,0.85)";
					ctx.shadowBlur = animation.shadowBlur ?? 8;
				}
				ctx.strokeText(ch, 0, 0);
				ctx.restore();
			}
			ctx.fillStyle = drawColor;
			if (glowBlur > 0) {
				ctx.shadowColor = glowColor;
				ctx.shadowBlur = glowBlur;
			} else if (strokeW <= 0.2 && (animation.shadowBlur ?? 0) > 0) {
				ctx.shadowColor = animation.shadowColor || "rgba(0,0,0,0.85)";
				ctx.shadowBlur = animation.shadowBlur ?? 8;
			}
			ctx.fillText(ch, 0, 0);
			ctx.restore();
		}

		// If typewriter finished the line, keep blinking cursor at the end of last line
		if (
			style === "typewriter-pro" &&
			lineIdx === layout.lines.length - 1 &&
			typewriterRevealCount >= totalChars
		) {
			const blink = Math.sin(localTimeSec * 10) >= 0;
			if (blink) {
				ctx.save();
				ctx.fillStyle = accentColor || "#38bdf8";
				ctx.shadowColor = accentColor || "#38bdf8";
				ctx.shadowBlur = fontSize * 0.3;
				const cursorW = Math.max(3, fontSize * 0.12);
				const cursorH = fontSize * 0.9;
				ctx.fillRect(cursorX + 4, lineY - cursorH / 2, cursorW, cursorH);
				ctx.restore();
			}
		}
	}
}

function drawWordKaraokeLayout({
	ctx,
	layout,
	textColor,
	accentColor,
	textBaseline,
	t,
	amp,
	animation,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	accentColor: string;
	textBaseline: CanvasTextBaseline;
	t: number;
	amp: number;
	animation: ResolvedLetterAnimationState;
}): void {
	const lineTokens = layout.lines.map(
		(line) => line.match(/\S+|\s+/g) ?? [line],
	);
	const totalWords = Math.max(
		1,
		lineTokens.reduce(
			(sum, tokens) =>
				sum + tokens.filter((tok) => tok.trim().length > 0).length,
			0,
		),
	);

	let activeWordIdx = 0;
	let wordSubProgress = 0.5;
	const { localTimeSec, durationSec, wordTimings } = animation;

	if (Array.isArray(wordTimings) && wordTimings.length > 0) {
		let matched = -1;
		for (let i = 0; i < wordTimings.length; i++) {
			const wt = wordTimings[i]!;
			if (localTimeSec >= wt.startOffset - 0.04 && localTimeSec <= wt.endOffset + 0.06) {
				matched = i;
				const span = Math.max(0.06, wt.endOffset - wt.startOffset);
				wordSubProgress = clamp({
					value: (localTimeSec - wt.startOffset) / span,
					min: 0,
					max: 1,
				});
				break;
			}
			if (localTimeSec > wt.endOffset) {
				matched = i;
				wordSubProgress = 1;
			}
		}
		activeWordIdx = clamp({
			value: matched >= 0 ? matched : 0,
			min: 0,
			max: totalWords - 1,
		});
	} else if (durationSec > 0.08) {
		const norm = clamp({
			value: localTimeSec / Math.max(0.15, durationSec * 0.94),
			min: 0,
			max: 0.9999,
		});
		const exactPos = norm * totalWords;
		activeWordIdx = Math.min(totalWords - 1, Math.floor(exactPos));
		wordSubProgress = exactPos - activeWordIdx;
	} else {
		activeWordIdx = Math.floor(t * 2.6) % totalWords;
		wordSubProgress = (t * 2.6) % 1;
	}

	const popScale =
		1 + Math.sin(Math.min(1, wordSubProgress * 2.2) * Math.PI) * 0.16 * amp;
	const isHighlightMode = animation.karaokeMode === "highlight";
	const strokeW =
		(animation.strokeWidth ?? 0) * (layout.scaledFontSize / 48);

	let currentWordCounter = 0;

	for (let lineIdx = 0; lineIdx < layout.lines.length; lineIdx++) {
		const tokens = lineTokens[lineIdx];
		const lineY =
			lineIdx * layout.lineHeightPx - layout.block.visualCenterOffset;
		const tokenWidths = tokens.map(
			(tok) =>
				ctx.measureText(tok).width +
				Math.max(0, Array.from(tok).length - 1) * layout.letterSpacing,
		);
		const totalWidth = tokenWidths.reduce((a, b) => a + b, 0);

		let cursorX = 0;
		if (layout.textAlign === "center") {
			cursorX = -totalWidth / 2;
		} else if (layout.textAlign === "right") {
			cursorX = -totalWidth;
		}

		for (let i = 0; i < tokens.length; i++) {
			const tok = tokens[i];
			const w = tokenWidths[i];
			const centerX = cursorX + w / 2;
			cursorX += w;

			if (tok.trim().length === 0) continue;

			const wordIdx = currentWordCounter++;
			const isActive = wordIdx === activeWordIdx;
			const isPast = wordIdx < activeWordIdx;

			ctx.save();
			ctx.translate(centerX, lineY);
			ctx.textAlign = "center";
			ctx.textBaseline = textBaseline;
			setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

			if (isActive && !isHighlightMode) {
				ctx.scale(popScale, popScale);
				const padX = layout.scaledFontSize * 0.22;
				const padY = layout.scaledFontSize * 0.14;
				const pillW = w + padX * 2;
				const pillH = layout.scaledFontSize * 1.05 + padY;
				ctx.fillStyle = accentColor || "#38bdf8";
				ctx.shadowColor = accentColor || "#38bdf8";
				ctx.shadowBlur = layout.scaledFontSize * 0.28;
				ctx.beginPath();
				ctx.roundRect(
					-pillW / 2,
					-pillH / 2,
					pillW,
					pillH,
					layout.scaledFontSize * 0.22,
				);
				ctx.fill();
				ctx.shadowBlur = 0;
				ctx.fillStyle = "#090d16";
				ctx.fillText(tok, 0, 0);
			} else {
				if (isActive && isHighlightMode) {
					ctx.scale(popScale, popScale);
				}
				if (strokeW > 0.2) {
					ctx.save();
					ctx.strokeStyle = animation.strokeColor || "#000000";
					ctx.lineWidth = strokeW * 2.1;
					ctx.lineJoin = "round";
					ctx.lineCap = "round";
					ctx.strokeText(tok, 0, 0);
					ctx.restore();
				}
				ctx.fillStyle =
					isActive && isHighlightMode
						? accentColor || "#facc15"
						: textColor;
				ctx.globalAlpha = isActive ? 1 : isPast ? 0.96 : 0.82;
				ctx.fillText(tok, 0, 0);
			}
			ctx.restore();
		}
	}
}
