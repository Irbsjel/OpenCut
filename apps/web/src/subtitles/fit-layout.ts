/** Wrap subtitles at their original size; only a word wider than a line shrinks. */
export function fitSubtitleLayout({
	ctx,
	text,
	fontFamily,
	fontWeight,
	fontStyle,
	fontSize,
	canvasSize,
	lineHeight = 1.2,
	letterSpacing = 0,
	maxWidth = canvasSize.width * 0.8,
	strokeWidth = 5,
	shadowBlur = 10,
	paddingX = 0,
	paddingY = 0,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
	fontFamily: string;
	fontWeight: string;
	fontStyle: string;
	fontSize: number;
	canvasSize: { width: number; height: number };
	lineHeight?: number;
	letterSpacing?: number;
	maxWidth?: number;
	strokeWidth?: number;
	shadowBlur?: number;
	paddingX?: number;
	paddingY?: number;
}) {
	const emphasisScale = 1.2;
	const px = (fontSize * canvasSize.height) / 90;
	ctx.font = `${fontStyle} ${fontWeight} ${px}px "${fontFamily.replace(/"/g, '\\"')}", sans-serif`;
	if ("letterSpacing" in ctx) ctx.letterSpacing = `${letterSpacing}px`;
	const inset = (strokeWidth * px) / 48 + shadowBlur * 2;
	const measureAtScale = (word: string, scale: number) => {
		const font = ctx.font;
		ctx.font = font.replace(`${px}px`, `${px * scale}px`);
		const width = ctx.measureText(word).width;
		ctx.font = font;
		return width;
	};
	const available = Math.max(
		1,
		maxWidth / emphasisScale - inset * 2 - ((paddingX * fontSize) / 15) * 2,
	);
	const lines: string[] = [];
	const lineScales: number[] = [];
	const append = (line: string, scale = 1) => {
		lines.push(line);
		lineScales.push(scale);
	};
	for (const paragraph of text.trim().replace(/\r\n?/g, "\n").split("\n")) {
		let line = "";
		for (const word of paragraph.trim().split(/\s+/)) {
			const wordWidth = ctx.measureText(word).width;
			// Isolate oversized words so the adjacent words retain exactly their size.
			if (wordWidth > available) {
				if (line) append(line);
				let low = 0;
				let high = 1;
				for (let step = 0; step < 24; step++) {
					const middle = (low + high) / 2;
					if (measureAtScale(word, middle) <= available) low = middle;
					else high = middle;
				}
				append(word, Math.max(0.000001, low));
				line = "";
				continue;
			}
			const next = line ? `${line} ${word}` : word;
			if (line && ctx.measureText(next).width > available) {
				append(line);
				line = word;
			} else line = next;
		}
		if (line || !paragraph.trim()) append(line);
	}
	const width =
		(Math.max(
			0,
			...lines.map((line, i) => measureAtScale(line, lineScales[i])),
		) +
			inset * 2 +
			((paddingX * fontSize) / 15) * 2) *
		emphasisScale;
	const height =
		(lines.length * px * lineHeight +
			inset * 2 +
			((paddingY * fontSize) / 15) * 2) *
		emphasisScale;
	return {
		content: lines.join("\n"),
		fontSize,
		lineScales,
		width,
		height,
		inset,
		fits: width <= maxWidth + 0.01 && height <= canvasSize.height * 0.8,
	};
}
