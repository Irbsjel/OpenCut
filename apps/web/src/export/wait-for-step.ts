export class ExportStepTimeout extends Error {
	constructor(label: string, timeoutMs: number) {
		super(
			`${label}: no hubo respuesta durante ${Math.round(timeoutMs / 1000)} segundos.`,
		);
		this.name = "ExportStepTimeout";
	}
}

/** Bound native codec / file waits and detach listeners on every outcome. */
export function waitForExportStep<T>(
	operation: () => Promise<T>,
	{
		label,
		timeoutMs,
		signal,
	}: { label: string; timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;
		const finish = (failed: boolean, result: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			if (failed) reject(result);
			else resolve(result as T);
		};
		const abort = () =>
			finish(
				true,
				signal?.reason ??
					new DOMException("Exportación cancelada", "AbortError"),
			);
		if (signal?.aborted) {
			abort();
			return;
		}
		signal?.addEventListener("abort", abort, { once: true });
		timer = setTimeout(
			() => finish(true, new ExportStepTimeout(label, timeoutMs)),
			timeoutMs,
		);
		try {
			operation().then(
				(value) => finish(false, value),
				(error) => finish(true, error),
			);
		} catch (error) {
			finish(true, error);
		}
	});
}
