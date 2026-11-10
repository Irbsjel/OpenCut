"use client";

import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		const msg = String(error?.message || "");
		const isChunkError =
			error?.name === "ChunkLoadError" ||
			msg.includes("Loading chunk") ||
			msg.includes("Failed to fetch dynamically imported module") ||
			msg.includes("Importing a module script failed");

		if (isChunkError && typeof window !== "undefined") {
			const key = "opencut_global_chunk_reload_ts";
			const last = Number(sessionStorage.getItem(key) || "0");
			if (Date.now() - last > 10_000) {
				sessionStorage.setItem(key, String(Date.now()));
				window.location.reload();
				return;
			}
		}
		console.error("[OpenCut GlobalError]:", error);
	}, [error]);

	return (
		<html lang="es" className="dark">
			<body className="bg-zinc-950 text-zinc-100 flex min-h-screen w-full flex-col items-center justify-center p-6 text-center">
				<div className="max-w-md space-y-3 rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
					<h2 className="text-base font-semibold text-white">
						Recargando aplicación…
					</h2>
					<p className="text-xs text-zinc-400">
						El editor se actualizó recientemente. Haz clic abajo para continuar con tu proyecto intacto.
					</p>
					<div className="flex items-center justify-center gap-3 pt-2">
						<button
							type="button"
							onClick={() => reset()}
							className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500"
						>
							Continuar
						</button>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="rounded-lg border border-white/15 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
						>
							Recargar
						</button>
					</div>
				</div>
			</body>
		</html>
	);
}
