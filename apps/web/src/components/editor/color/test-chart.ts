/** Eigen testbeeld voor het kleurpaneel: balken, grijsverloop, huidtoon-vlakken. */
export function drawTestChart(canvas: HTMLCanvasElement, width = 640, height = 360) {
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const bars = ["#bfbfbf", "#bfbf00", "#00bfbf", "#00bf00", "#bf00bf", "#bf0000", "#0000bf"];
	const barH = Math.round(height * 0.55);
	bars.forEach((color, i) => {
		ctx.fillStyle = color;
		ctx.fillRect((i * width) / bars.length, 0, width / bars.length + 1, barH);
	});
	const rampH = Math.round(height * 0.2);
	for (let x = 0; x < width; x++) {
		const v = Math.round((x / (width - 1)) * 255);
		ctx.fillStyle = `rgb(${v},${v},${v})`;
		ctx.fillRect(x, barH, 1, rampH);
	}
	const skin = ["#f1c9ae", "#d9a37f", "#b27a56", "#8a5a3c", "#5e3b27", "#3a2418"];
	const skinY = barH + rampH;
	skin.forEach((color, i) => {
		ctx.fillStyle = color;
		ctx.fillRect((i * width) / skin.length, skinY, width / skin.length + 1, height - skinY);
	});
}
