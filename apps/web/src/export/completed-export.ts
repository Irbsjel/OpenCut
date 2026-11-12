/** Browser-owned export recovery: one completed file per project. */
export interface CompletedExport {
	projectId: string;
	filename: string;
	blob: Blob;
	createdAt: number;
}

async function openExports(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("opencut-completed-exports", 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore("files", { keyPath: "projectId" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function saveCompletedExport(
	record: CompletedExport,
): Promise<void> {
	const db = await openExports();
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction("files", "readwrite");
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
			tx.objectStore("files").put(record);
		});
	} finally {
		db.close();
	}
}

export async function loadCompletedExport({
	projectId,
}: {
	projectId: string;
}): Promise<CompletedExport | null> {
	const db = await openExports();
	try {
		return await new Promise((resolve, reject) => {
			const request = db
				.transaction("files", "readonly")
				.objectStore("files")
				.get(projectId);
			request.onsuccess = () => resolve(request.result ?? null);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}
