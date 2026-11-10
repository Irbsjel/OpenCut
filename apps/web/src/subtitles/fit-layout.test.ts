import { describe, expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { fitSubtitleLayout } from "./fit-layout";
const samples = [
	"SUBCONSCIENTE.",
	"LOS FRANCESES LE PUSIERON NOMBRE",
	"ESPERAS UNAS QUESADILLAS ✨",
	"SE DESVANECEN DE A POCO,",
	"Neuropsicofisiológicamente extraordinario",
	"una frase extensa ".repeat(60),
	"¿A QUIÉN\nNO 🤔",
	"ESPERAS\nUNAS\nQUESADILLAS\n✨",
];
describe("subtitle safe layout", () => {
	for (const canvasSize of [
		{ width: 1080, height: 1920 },
		{ width: 1920, height: 1080 },
		{ width: 360, height: 640 },
	]) {
		for (const text of samples) {
			test(`${canvasSize.width}x${canvasSize.height}: ${text.slice(0, 40)}`, () => {
				const ctx = createCanvas(1, 1).getContext(
					"2d",
				) as unknown as CanvasRenderingContext2D;
				const result = fitSubtitleLayout({
					ctx,
					text,
					canvasSize,
					fontSize: 5.8,
					fontFamily: "Arial",
					fontWeight: "bold",
					fontStyle: "normal",
					strokeWidth: 6,
					shadowBlur: 14,
					paddingX: 30,
					paddingY: 42,
				});
				expect(result.width).toBeLessThanOrEqual(canvasSize.width * 0.9);
				expect(result.fontSize).toBe(5.8);
				if (text.length < 200) expect(result.fits).toBe(true);
				else expect(result.fits).toBe(false);
				for (const [i, line] of result.content.split("\n").entries()) {
					if (result.lineScales[i] < 1)
						expect(line.trim().split(/\s+/).length).toBe(1);
				}
				expect(result.content.replace(/\s+/g, " ").trim()).toBe(
					text.replace(/\s+/g, " ").trim(),
				);
				expect(result.fontSize).toBeGreaterThan(text.length > 200 ? 0 : 0.5);
			});
		}
	}
});
