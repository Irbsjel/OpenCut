/** A seek timeout is an export error, never permission to reuse an older image. */
export async function seekExportVideo({
	video,
	time,
	timeoutMs = 10_000,
}: {
	video: HTMLVideoElement;
	time: number;
	timeoutMs?: number;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		let requested = false;
		const cleanup = () => {
			clearTimeout(timer);
			for (const event of ["loadedmetadata", "loadeddata", "canplay", "seeked"])
				video.removeEventListener(event, check);
			video.removeEventListener("error", fail);
		};
		const fail = () => {
			cleanup();
			reject(
				new Error(
					video.error?.message ||
						`No se pudo decodificar el video en ${time.toFixed(3)} s`,
				),
			);
		};
		const check = () => {
			if (video.error) {
				fail();
				return;
			}
			if (video.readyState < 1) return;
			if (!requested) {
				requested = true;
				if (Math.abs(video.currentTime - time) > 0.0005) {
					try {
						video.currentTime = time;
					} catch (e) {
						cleanup();
						reject(e);
						return;
					}
				}
			}
			if (
				!video.seeking &&
				video.readyState >= 2 &&
				Math.abs(video.currentTime - time) <= 0.005
			) {
				cleanup();
				resolve();
			}
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(
				new Error(
					`El video no entregó el cuadro de ${time.toFixed(3)} s. Comprueba el archivo original.`,
				),
			);
		}, timeoutMs);
		for (const event of ["loadedmetadata", "loadeddata", "canplay", "seeked"])
			video.addEventListener(event, check);
		video.addEventListener("error", fail);
		check();
	});
}
