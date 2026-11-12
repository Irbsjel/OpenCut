import type { ExportResult } from "./index";
let active = false;
const busy = (): ExportResult => ({
	success: false,
	error:
		"Ya hay una exportación en curso. Cancélala o espera a que termine antes de iniciar otra.",
});

/** Native codecs and the shared compositor must have a single owner. */
export async function withExclusiveExport(
	run: () => Promise<ExportResult>,
): Promise<ExportResult> {
	if (active) return busy();
	active = true;
	try {
		const locks =
			typeof navigator !== "undefined" ? navigator.locks : undefined;
		if (!locks) return await run();
		return await locks.request(
			"opencut-video-export",
			{ ifAvailable: true },
			(lock) => (lock ? run() : busy()),
		);
	} finally {
		active = false;
	}
}
