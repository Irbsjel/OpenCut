/** bun scripts/fit-project-subtitles.ts <bundle.json> <font.ttf> [--write <backup-dir>] */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fitSubtitleLayout } from "../src/subtitles/fit-layout";

const [bundlePath, fontPath, mode, backupDir, originalPath] =
	process.argv.slice(2);
if (!bundlePath || !fontPath || (mode && (mode !== "--write" || !backupDir))) {
	throw new Error(
		"Usage: bun scripts/fit-project-subtitles.ts <bundle.json> <Montserrat-bold.ttf> [--write <backup-dir>]",
	);
}
if (!GlobalFonts.registerFromPath(fontPath, "Montserrat"))
	throw new Error("Could not load Montserrat font");
const raw = await readFile(bundlePath, "utf8");
const bundle = JSON.parse(raw);
const canvasSize = bundle.project.settings.canvasSize;
const ctx = createCanvas(1, 1).getContext(
	"2d",
) as unknown as CanvasRenderingContext2D;
const originals = new Map<string, number>();
if (originalPath) {
	const original = JSON.parse(await readFile(originalPath, "utf8"));
	for (const scene of original.project.scenes)
		for (const track of scene.tracks.overlay ?? [])
			for (const element of track.elements ?? [])
				if (element.params?.isSubtitle === true)
					originals.set(element.id, element.params.fontSize);
}
let count = 0;
let smallest = Infinity;
let maxLines = 0;
for (const scene of bundle.project.scenes) {
	for (const track of scene.tracks.overlay ?? []) {
		for (const element of track.elements ?? []) {
			const p = element.params;
			if (element.type !== "text" || p?.isSubtitle !== true) continue;
			if (p.fontFamily !== "Montserrat")
				throw new Error(`Unexpected font: ${p.fontFamily}`);
			const text = String(p.content).replace(/\s+/g, " ").trim();
			const fitted = fitSubtitleLayout({
				ctx,
				text,
				canvasSize,
				fontFamily: p.fontFamily,
				fontSize: originals.get(element.id) ?? p.fontSize,
				fontWeight: p.fontWeight,
				fontStyle: p.fontStyle,
				lineHeight: p.lineHeight,
				letterSpacing: p.letterSpacing,
				strokeWidth: p.strokeWidth,
				shadowBlur: p.shadowBlur,
				paddingX: p["background.enabled"] ? p["background.paddingX"] : 0,
				paddingY: p["background.enabled"] ? p["background.paddingY"] : 0,
			});
			if (!fitted.fits) throw new Error(`Cannot fit subtitle ${element.id}`);
			const lines = fitted.content.split("\n").length;
			const blockHeight =
				((lines * fitted.fontSize * canvasSize.height) / 90) * p.lineHeight;
			// The lower edge stays at 85% of the frame, including emphasis effects.
			const y = canvasSize.height * 0.35 - fitted.height / 2;
			const lineWidth = Math.max(
				...fitted.content
					.split("\n")
					.map(
						(line, index) =>
							ctx.measureText(line).width * fitted.lineScales[index],
					),
			);
			const x =
				p.textAlign === "left"
					? -lineWidth / 2
					: p.textAlign === "right"
						? lineWidth / 2
						: 0;
			if (y - fitted.height / 2 < -canvasSize.height * 0.45)
				throw new Error("Subtitle exceeds top safe area");
			if (blockHeight <= 0) throw new Error("Invalid subtitle height");
			p.content = fitted.content;
			p.fontSize = fitted.fontSize;
			p.subtitleLineScales = JSON.stringify({
				content: fitted.content,
				scales: fitted.lineScales,
			});
			p["transform.positionX"] = x;
			p["transform.positionY"] = y;
			count++;
			smallest = Math.min(smallest, fitted.fontSize);
			maxLines = Math.max(maxLines, lines);
		}
	}
}
console.log(
	JSON.stringify({
		project: bundle.project.metadata.id,
		count,
		smallestFontSize: smallest,
		maxLines,
		canvasSize,
		write: mode === "--write",
	}),
);
if (mode === "--write") {
	await mkdir(backupDir, { recursive: true });
	const backup = path.join(
		backupDir,
		`${path.basename(bundlePath, ".json")}-${Date.now()}.json`,
	);
	await writeFile(backup, raw, { flag: "wx" });
	// Refuse to replace edits made after this script started.
	if ((await readFile(bundlePath, "utf8")) !== raw)
		throw new Error(
			"Project changed while fitting; retry after reviewing the newer version",
		);
	bundle.project.metadata.updatedAt = new Date().toISOString();
	const temporary = `${bundlePath}.subtitle-fit.tmp`;
	await writeFile(temporary, JSON.stringify(bundle), { flag: "wx" });
	await rename(temporary, bundlePath);
	console.log(`Saved; backup: ${backup}`);
}
