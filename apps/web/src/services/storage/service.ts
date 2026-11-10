import type { TProject, TProjectMetadata } from "@/project/types";
import { getProjectDurationFromScenes } from "@/timeline/scenes";
import type { MediaAsset } from "@/media/types";
import { IndexedDBAdapter } from "./indexeddb-adapter";
import { OPFSAdapter } from "./opfs-adapter";
import {
	type StorageCapacityCheckResult,
	StorageQuotaExceededError,
	evaluateStorageCapacity,
	isStorageQuotaExceededError,
	readStorageQuotaStatus,
} from "./quota";
import type {
	MediaAssetData,
	StorageConfig,
	SerializedProject,
	SerializedScene,
} from "./types";
import type { SavedSoundsData, SavedSound, SoundEffect } from "@/sounds/types";
import {
	migrations,
	runStorageMigrations,
} from "@/services/storage/migrations";
import type { Bookmark, SceneTracks, TScene } from "@/timeline";
import { roundMediaTime } from "@/wasm";

function normalizeBookmarks({ raw }: { raw: unknown }): Bookmark[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item): Bookmark | null => {
			if (typeof item === "number") {
				return { time: roundMediaTime({ time: item }) };
			}
			const obj = item as Record<string, unknown>;
			if (
				typeof obj !== "object" ||
				obj === null ||
				typeof obj.time !== "number"
			) {
				return null;
			}
			return {
				time: roundMediaTime({ time: obj.time }),
				...(typeof obj.note === "string" && { note: obj.note }),
				...(typeof obj.color === "string" && { color: obj.color }),
				...(typeof obj.duration === "number" && {
					duration: roundMediaTime({ time: obj.duration }),
				}),
			};
		})
		.filter((b): b is Bookmark => b !== null);
}

class StorageService {
	private projectsAdapter: IndexedDBAdapter<SerializedProject>;
	private savedSoundsAdapter: IndexedDBAdapter<SavedSoundsData>;
	private config: StorageConfig;
	private migrationsPromise: Promise<void> | null = null;
	private cloudSyncPromise: Promise<void> | null = null;
	private mediaUploadLoopPromise: Promise<void> | null = null;
	private uploadedMediaKeys = new Set<string>();
	private pushProjectTimers = new Map<string, ReturnType<typeof setTimeout>>();

	private getCloudApiBase(): string {
		if (
			typeof window !== "undefined" &&
			!window.location.pathname.startsWith("/videos")
		) {
			return "/api/cloud-storage";
		}
		return "/videos/api/cloud-storage";
	}

	private async uploadSingleMediaToCloud({
		projectId,
		mediaId,
		file,
		fileHandle,
	}: {
		projectId: string;
		mediaId: string;
		file?: File | null;
		fileHandle?: FileSystemFileHandle;
	}): Promise<void> {
		if (typeof window === "undefined") return;
		if (this.uploadedMediaKeys.has(mediaId)) return;
		const url = `${this.getCloudApiBase()}/media/${encodeURIComponent(projectId)}/${encodeURIComponent(mediaId)}`;
		try {
			const headRes = await fetch(url, { method: "HEAD" });
			if (headRes.ok) {
				this.uploadedMediaKeys.add(mediaId);
				return;
			}
			let activeFile =
				file ?? (fileHandle ? await fileHandle.getFile() : null);
			if (!activeFile || activeFile.size === 0) return;

			const partSize =
				Number.parseInt(headRes.headers.get("X-Part-Size") || "0", 10) || 0;
			const startOffset =
				partSize > 0 && partSize < activeFile.size ? partSize : 0;
			const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks for fast 3s turnaround and instant resume
			for (
				let offset = startOffset;
				offset < activeFile.size;
				offset += CHUNK_SIZE
			) {
				if (fileHandle && offset > startOffset) {
					activeFile = await fileHandle.getFile().catch(() => activeFile);
					if (!activeFile) return;
				}
				const end = Math.min(offset + CHUNK_SIZE, activeFile.size);
				const isDone = end >= activeFile.size;
				const sliceBuf = await activeFile.slice(offset, end).arrayBuffer();
				const chunkUrl = `${url}?offset=${offset}&done=${isDone ? "1" : "0"}`;
				const putRes = await fetch(chunkUrl, {
					method: "PUT",
					headers: { "Content-Type": "application/octet-stream" },
					body: sliceBuf,
				});
				if (!putRes.ok) {
					void fetch(
						`${url}?diag=${encodeURIComponent(`put_status_${putRes.status}_at_${offset}`)}`,
						{ method: "HEAD" },
					).catch(() => {});
					return;
				}
			}
			this.uploadedMediaKeys.add(mediaId);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			void fetch(`${url}?diag=${encodeURIComponent(`err_${msg}`)}`, {
				method: "HEAD",
			}).catch(() => {});
		}
	}

	private runBackgroundMediaUpload(): Promise<void> {
		if (typeof window === "undefined") return Promise.resolve();
		if (this.mediaUploadLoopPromise) {
			return this.mediaUploadLoopPromise;
		}

		const executeUpload = async () => {
			try {
				const priorityProjects = [
					"51f6dd2f-aae9-4924-b0d9-38b44d85c571",
					"21489406-ad51-4a40-9849-b8ba6e543aff",
				];
				if (
					typeof navigator !== "undefined" &&
					"storage" in navigator &&
					"getDirectory" in navigator.storage
				) {
					const root = await navigator.storage.getDirectory();
					const dirEntries: Array<{
						projectId: string;
						dirHandle: FileSystemDirectoryHandle;
					}> = [];
					for await (const [dirName, handle] of (
						root as unknown as {
							entries(): AsyncIterable<[string, FileSystemHandle]>;
						}
					).entries()) {
						if (
							handle.kind !== "directory" ||
							!dirName.startsWith("media-files-")
						) {
							continue;
						}
						const projectId = dirName.slice("media-files-".length);
						if (!projectId) continue;
						dirEntries.push({
							projectId,
							dirHandle: handle as FileSystemDirectoryHandle,
						});
					}
					dirEntries.sort((a, b) => {
						const idxA = priorityProjects.indexOf(a.projectId);
						const idxB = priorityProjects.indexOf(b.projectId);
						if (idxA !== -1 && idxB !== -1) return idxA - idxB;
						if (idxA !== -1) return -1;
						if (idxB !== -1) return 1;
						return a.projectId.localeCompare(b.projectId);
					});

					const tasks: Array<{
						projectId: string;
						mediaId: string;
						fileHandle: FileSystemFileHandle;
					}> = [];

					for (const { projectId, dirHandle } of dirEntries) {
						for await (const [fName, fHandle] of (
							dirHandle as unknown as {
								entries(): AsyncIterable<[string, FileSystemHandle]>;
							}
						).entries()) {
							if (fHandle.kind !== "file" || !fName) continue;
							if (this.uploadedMediaKeys.has(fName)) continue;
							tasks.push({
								projectId,
								mediaId: fName,
								fileHandle: fHandle as FileSystemFileHandle,
							});
						}
					}

					let cursor = 0;
					const CONCURRENCY = 3;
					const workers = Array.from({ length: CONCURRENCY }, async () => {
						while (cursor < tasks.length) {
							const idx = cursor++;
							const task = tasks[idx];
							if (!task || this.uploadedMediaKeys.has(task.mediaId)) continue;
							await this.uploadSingleMediaToCloud({
								projectId: task.projectId,
								mediaId: task.mediaId,
								fileHandle: task.fileHandle,
							});
						}
					});
					await Promise.all(workers);
				}
			} catch {
				// ignore OPFS iteration error
			} finally {
				this.mediaUploadLoopPromise = null;
			}
		};

		if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks?.request) {
			this.mediaUploadLoopPromise = navigator.locks
				.request("opencut-cloud-media-upload", () => executeUpload())
				.catch(() => executeUpload());
		} else {
			this.mediaUploadLoopPromise = executeUpload();
		}

		return this.mediaUploadLoopPromise;
	}

	private pushProjectByIdToCloud(projectId: string): void {
		if (typeof window === "undefined") return;
		const existingTimer = this.pushProjectTimers.get(projectId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		const timer = setTimeout(() => {
			this.pushProjectTimers.delete(projectId);
			void (async () => {
				try {
					const project = await this.projectsAdapter.get(projectId);
					if (!project) return;
					const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
						projectId,
					});
					const mediaMetadata = await mediaMetadataAdapter.getAll();
					await fetch(`${this.getCloudApiBase()}?pushOnly=1`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							projects: [{ project, mediaMetadata }],
						}),
					});
					void this.runBackgroundMediaUpload();
				} catch {
					// ignore background sync errors
				}
			})();
		}, 2000);
		this.pushProjectTimers.set(projectId, timer);
	}

	async syncWithCloud(targetProjectId?: string): Promise<void> {
		if (typeof window === "undefined") return;
		// Schedule OPFS media upload after initial hydration so it never competes with loadProject
		setTimeout(() => {
			void this.runBackgroundMediaUpload();
		}, 8000);
		if (this.cloudSyncPromise) {
			return this.cloudSyncPromise;
		}

		this.cloudSyncPromise = (async () => {
			try {
				await this.ensureMigrations();
				const localProjects = await this.projectsAdapter.getAll();
				const localMap = new Map<string, string>();
				for (const lp of localProjects) {
					if (lp?.metadata?.id) {
						localMap.set(lp.metadata.id, lp.metadata.updatedAt || "");
					}
				}

				const query = targetProjectId
					? `?id=${encodeURIComponent(targetProjectId)}`
					: "";
				const getRes = await fetch(`${this.getCloudApiBase()}${query}`);
				const remoteMap = new Map<string, string>();
				if (getRes.ok) {
					const data = (await getRes.json()) as {
						projects?: Array<{
							project: SerializedProject;
							mediaMetadata: MediaAssetData[];
						}>;
						project?: SerializedProject;
						mediaMetadata?: MediaAssetData[];
					};
					const bundles =
						data.projects ??
						(data.project
							? [{ project: data.project, mediaMetadata: data.mediaMetadata ?? [] }]
							: []);
					for (const bundle of bundles) {
						if (!bundle?.project?.metadata?.id) continue;
						const pid = bundle.project.metadata.id;
						const remoteUpdated = bundle.project.metadata.updatedAt || "";
						remoteMap.set(pid, remoteUpdated);
						const localUpdated = localMap.get(pid);
						const localTime = localUpdated
							? new Date(localUpdated).getTime()
							: -1;
						const remoteTime = remoteUpdated
							? new Date(remoteUpdated).getTime()
							: 0;
						if (!localUpdated || remoteTime >= localTime) {
							const normalizedProject = {
								...bundle.project,
								id: pid,
							} as SerializedProject;
							await this.projectsAdapter.set({
								key: pid,
								value: normalizedProject,
							});
						}
						const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
							projectId: pid,
						});
						const existingKeys = new Set(
							await mediaMetadataAdapter.list().catch(() => []),
						);
						const remoteMediaIds = new Set<string>();
						for (const m of bundle.mediaMetadata ?? []) {
							if (!m?.id) continue;
							remoteMediaIds.add(m.id);
							if (!existingKeys.has(m.id) || remoteTime >= localTime) {
								await mediaMetadataAdapter.set({ key: m.id, value: m });
							}
						}
						if (remoteTime >= localTime && remoteMediaIds.size > 0) {
							for (const oldKey of existingKeys) {
								if (!remoteMediaIds.has(oldKey)) {
									await mediaMetadataAdapter.remove(oldKey).catch(() => {});
								}
							}
						}
					}
				}

				// Push any local project that is missing or newer than remote, one at a time
				for (const proj of localProjects) {
					const pid = proj?.metadata?.id;
					if (!pid) continue;
					if (targetProjectId && pid !== targetProjectId) continue;
					const remoteUpdated = remoteMap.get(pid);
					const localTime = new Date(proj.metadata.updatedAt || 0).getTime();
					const remoteTime = remoteUpdated
						? new Date(remoteUpdated).getTime()
						: -1;
					if (remoteTime < 0 || localTime > remoteTime) {
						const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
							projectId: pid,
						});
						const mediaMetadata = await mediaMetadataAdapter
							.getAll()
							.catch(() => []);
						await fetch(`${this.getCloudApiBase()}?pushOnly=1`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								projects: [{ project: proj, mediaMetadata }],
							}),
						}).catch(() => {});
					}
				}
			} catch {
				// ignore offline/sync error
			} finally {
				this.cloudSyncPromise = null;
			}
		})();

		return this.cloudSyncPromise;
	}

	constructor() {
		this.config = {
			projectsDb: "video-editor-projects",
			mediaDb: "video-editor-media",
			savedSoundsDb: "video-editor-saved-sounds",
			version: 1,
		};

		this.projectsAdapter = new IndexedDBAdapter<SerializedProject>({
			dbName: this.config.projectsDb,
			storeName: "projects",
			version: this.config.version,
		});

		this.savedSoundsAdapter = new IndexedDBAdapter<SavedSoundsData>({
			dbName: this.config.savedSoundsDb,
			storeName: "saved-sounds",
			version: this.config.version,
		});
	}

	private async ensureMigrations(): Promise<void> {
		if (this.migrationsPromise) {
			await this.migrationsPromise;
			return;
		}

		this.migrationsPromise = runStorageMigrations({ migrations }).then(
			() => undefined,
		);
		await this.migrationsPromise;
	}

	private getProjectMediaAdapters({ projectId }: { projectId: string }) {
		const mediaMetadataAdapter = new IndexedDBAdapter<MediaAssetData>({
			dbName: `${this.config.mediaDb}-${projectId}`,
			storeName: "media-metadata",
			version: this.config.version,
		});

		const mediaAssetsAdapter = new OPFSAdapter(`media-files-${projectId}`);

		return { mediaMetadataAdapter, mediaAssetsAdapter };
	}

	async canStoreFile({
		size,
	}: {
		size: number;
	}): Promise<StorageCapacityCheckResult> {
		const quotaStatus = await readStorageQuotaStatus();
		return evaluateStorageCapacity({
			requiredBytes: size,
			quotaStatus,
		});
	}

	isQuotaExceededError({ error }: { error: unknown }): boolean {
		return isStorageQuotaExceededError({ error });
	}

	private stripAudioBuffers({ tracks }: { tracks: SceneTracks }): SceneTracks {
		return {
			...tracks,
			audio: tracks.audio.map((track) => ({
				...track,
				elements: track.elements.map((element) => {
					const { buffer: _buffer, ...rest } = element;
					return rest;
				}),
			})),
		};
	}

	async saveProject({ project }: { project: TProject }): Promise<void> {
		const duration =
			project.metadata.duration ??
			getProjectDurationFromScenes({ scenes: project.scenes });
		const serializedScenes: SerializedScene[] = project.scenes.map((scene) => ({
			id: scene.id,
			name: scene.name,
			isMain: scene.isMain,
			tracks: this.stripAudioBuffers({ tracks: scene.tracks }),
			bookmarks: scene.bookmarks,
			createdAt: scene.createdAt.toISOString(),
			updatedAt: scene.updatedAt.toISOString(),
		}));

		const serializedProject: SerializedProject = {
			metadata: {
				id: project.metadata.id,
				name: project.metadata.name,
				thumbnail: project.metadata.thumbnail,
				duration,
				createdAt: project.metadata.createdAt.toISOString(),
				updatedAt: project.metadata.updatedAt.toISOString(),
			},
			scenes: serializedScenes,
			currentSceneId: project.currentSceneId,
			settings: project.settings,
			version: project.version,
			timelineViewState: project.timelineViewState,
		};

		await this.projectsAdapter.set({
			key: project.metadata.id,
			value: serializedProject,
		});
		void this.pushProjectByIdToCloud(project.metadata.id);
	}

	async loadProject({
		id,
	}: {
		id: string;
	}): Promise<{ project: TProject } | null> {
		await this.ensureMigrations();
		await this.syncWithCloud(id);
		const serializedProject = await this.projectsAdapter.get(id);

		if (!serializedProject) return null;

		if (
			typeof serializedProject !== "object" ||
			serializedProject === null ||
			typeof serializedProject.metadata !== "object" ||
			serializedProject.metadata === null
		) {
			console.warn(
				"[storage] Skipping malformed project entry (missing metadata):",
				{ id, entry: serializedProject },
			);
			return null;
		}

		const scenes =
			serializedProject.scenes?.map((scene) => ({
				id: scene.id,
				name: scene.name,
				isMain: scene.isMain,
				tracks: scene.tracks,
				bookmarks: normalizeBookmarks({ raw: scene.bookmarks }),
				createdAt: new Date(scene.createdAt),
				updatedAt: new Date(scene.updatedAt),
			})) ?? [];

		const project: TProject = {
			metadata: {
				id: serializedProject.metadata.id,
				name: serializedProject.metadata.name,
				thumbnail: serializedProject.metadata.thumbnail,
				duration: roundMediaTime({
					time:
						serializedProject.metadata.duration ??
						getProjectDurationFromScenes({ scenes }),
				}),
				createdAt: new Date(serializedProject.metadata.createdAt),
				updatedAt: new Date(serializedProject.metadata.updatedAt),
			},
			scenes,
			currentSceneId: serializedProject.currentSceneId || "",
			settings: serializedProject.settings,
			version: serializedProject.version,
			timelineViewState: serializedProject.timelineViewState,
		};

		return { project };
	}

	async loadAllProjects(): Promise<TProject[]> {
		const projectIds = await this.projectsAdapter.list();
		const projects: TProject[] = [];

		for (const id of projectIds) {
			const result = await this.loadProject({ id });
			if (result?.project) {
				projects.push(result.project);
			}
		}

		return projects.sort(
			(a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime(),
		);
	}

	async loadAllProjectsMetadata(): Promise<TProjectMetadata[]> {
		await this.ensureMigrations();
		await this.syncWithCloud();
		const serializedProjects = await this.projectsAdapter.getAll();

		const metadata: TProjectMetadata[] = [];
		for (const serializedProject of serializedProjects) {
			if (
				typeof serializedProject !== "object" ||
				serializedProject === null ||
				typeof serializedProject.metadata !== "object" ||
				serializedProject.metadata === null
			) {
				console.warn(
					"[storage] Skipping malformed project entry (missing metadata):",
					serializedProject,
				);
				continue;
			}

			let thumbnail = serializedProject.metadata.thumbnail;
			let name = serializedProject.metadata.name;
			if (
				!thumbnail ||
				name === "Untitled Project" ||
				name === "Proyecto NERV Studio" ||
				name === "New project"
			) {
				try {
					const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
						projectId: serializedProject.metadata.id,
					});
					const mediaMeta = await mediaMetadataAdapter.getAll();
					const primaryVideo =
						mediaMeta.find((m) => m.type === "video" && !m.ephemeral) ??
						mediaMeta.find((m) => m.type === "video") ??
						mediaMeta.find((m) => m.type === "image");
					if (!thumbnail && primaryVideo?.thumbnailUrl) {
						thumbnail = primaryVideo.thumbnailUrl;
					}
					if (
						primaryVideo &&
						(name === "Untitled Project" ||
							name === "Proyecto NERV Studio" ||
							name === "New project")
					) {
						const w =
							primaryVideo.width ||
							serializedProject.settings?.canvasSize?.width ||
							0;
						const h =
							primaryVideo.height ||
							serializedProject.settings?.canvasSize?.height ||
							0;
						const orient =
							w > 0 && h > 0
								? h > w
									? "Video Vertical (9:16)"
									: "Video Horizontal (16:9)"
								: "Proyecto de Video";
						const clip = (primaryVideo.name || "")
							.replace(/\.(mp4|mov|webm|mkv)$/i, "")
							.trim();
						name = clip ? `${orient} · ${clip}` : orient;
					}
				} catch {
					// ignore
				}
			}

			metadata.push({
				id: serializedProject.metadata.id,
				name,
				thumbnail,
				duration: roundMediaTime({
					time:
						serializedProject.metadata.duration ??
						getProjectDurationFromScenes({
							scenes: (serializedProject.scenes ?? []) as unknown as TScene[],
						}),
				}),
				createdAt: new Date(serializedProject.metadata.createdAt),
				updatedAt: new Date(serializedProject.metadata.updatedAt),
			});
		}

		return metadata.sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}

	async deleteProject({ id }: { id: string }): Promise<void> {
		await this.projectsAdapter.remove(id);
		if (typeof window !== "undefined") {
			void fetch(`${this.getCloudApiBase()}?id=${encodeURIComponent(id)}`, {
				method: "DELETE",
			}).catch(() => {});
		}
	}

	async updateMediaAssetMetadata({
		projectId,
		mediaAsset,
	}: {
		projectId: string;
		mediaAsset: MediaAsset;
	}): Promise<void> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const metadata: MediaAssetData = {
			id: mediaAsset.id,
			name: mediaAsset.name,
			type: mediaAsset.type,
			size: mediaAsset.file.size,
			lastModified: mediaAsset.file.lastModified,
			width: mediaAsset.width,
			height: mediaAsset.height,
			duration: mediaAsset.duration,
			thumbnailUrl: mediaAsset.thumbnailUrl,
			ephemeral: mediaAsset.ephemeral,
		};

		await mediaMetadataAdapter.set({
			key: mediaAsset.id,
			value: metadata,
		});
	}

	async saveMediaAsset({
		projectId,
		mediaAsset,
	}: {
		projectId: string;
		mediaAsset: MediaAsset;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		const metadata: MediaAssetData = {
			id: mediaAsset.id,
			name: mediaAsset.name,
			type: mediaAsset.type,
			size: mediaAsset.file.size,
			lastModified: mediaAsset.file.lastModified,
			width: mediaAsset.width,
			height: mediaAsset.height,
			duration: mediaAsset.duration,
			thumbnailUrl: mediaAsset.thumbnailUrl,
			ephemeral: mediaAsset.ephemeral,
		};

		let existedBefore = false;
		try {
			const existingFile = await mediaAssetsAdapter.get(mediaAsset.id);
			if (existingFile && existingFile.size > 0) {
				existedBefore = true;
			}
		} catch {
			// ignore
		}

		try {
			if (!existedBefore) {
				await mediaAssetsAdapter.set({
					key: mediaAsset.id,
					value: mediaAsset.file,
				});
			}
			await mediaMetadataAdapter.set({
				key: mediaAsset.id,
				value: metadata,
			});
			void this.uploadSingleMediaToCloud({
				projectId,
				mediaId: mediaAsset.id,
				file: mediaAsset.file,
			});
			void this.pushProjectByIdToCloud(projectId);
		} catch (error) {
			if (!existedBefore) {
				try {
					await mediaAssetsAdapter.remove(mediaAsset.id);
				} catch {
					// Ignore cleanup failures so the original storage error is preserved.
				}
			}

			if (this.isQuotaExceededError({ error })) {
				throw new StorageQuotaExceededError({
					requiredBytes: mediaAsset.file.size,
				});
			}

			throw error;
		}
	}

	async loadMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<MediaAsset | null> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		let [file, metadata] = await Promise.all([
			mediaAssetsAdapter.get(id),
			mediaMetadataAdapter.get(id),
		]);

		if ((!file || file.size === 0) && metadata && typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
			try {
				const root = await navigator.storage.getDirectory();
				for await (const [dirName, handle] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
					if (handle.kind !== "directory" || !dirName.startsWith("media-files-")) continue;
					const dirHandle = handle as FileSystemDirectoryHandle;
					try {
						const fHandle = await dirHandle.getFileHandle(id);
						const candidate = await fHandle.getFile();
						if (candidate.size > 0) {
							await mediaAssetsAdapter.set({ key: id, value: candidate });
							file = candidate;
							break;
						}
					} catch {
						// not in this project directory
					}
				}
			} catch {
				// ignore recovery error
			}
		}

		if ((!file || file.size === 0) && metadata && typeof window !== "undefined") {
			try {
				const cloudUrl = `${this.getCloudApiBase()}/media/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`;
				const cloudRes = await fetch(cloudUrl);
				if (cloudRes.ok) {
					const blob = await cloudRes.blob();
					if (blob.size > 0) {
						const cloudFile = new File([blob], metadata.name || id, {
							type: blob.type || "video/mp4",
							lastModified: metadata.lastModified || Date.now(),
						});
						await mediaAssetsAdapter
							.set({ key: id, value: cloudFile })
							.catch(() => {});
						file = cloudFile;
					}
				}
			} catch {
				// ignore cloud fetch error
			}
		}

		if (!file || !metadata) return null;

		try {
			const lowerName = (metadata.name || "").toLowerCase();
			const defaultMime =
				metadata.type === "video"
					? lowerName.endsWith(".webm")
						? "video/webm"
						: "video/mp4"
					: metadata.type === "audio"
						? lowerName.endsWith(".wav")
							? "audio/wav"
							: "audio/mpeg"
						: lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")
							? "image/jpeg"
							: lowerName.endsWith(".webp")
								? "image/webp"
								: "image/png";
			const resolvedMime =
				file.type && file.type.length > 0 ? file.type : defaultMime;
			if (file.type !== resolvedMime || file.name !== (metadata.name || id)) {
				file = new File(
					[file.slice(0, file.size, resolvedMime)],
					metadata.name || id,
					{
						type: resolvedMime,
						lastModified: metadata.lastModified || Date.now(),
					},
				);
			}
		} catch {
			// keep original file handle if zero-copy slice fails
		}

		let url: string;
		if (metadata.type === "image" && (!file.type || file.type === "")) {
			try {
				const text = await file.text();
				if (text.trim().startsWith("<svg")) {
					const svgBlob = new Blob([text], { type: "image/svg+xml" });
					url = URL.createObjectURL(svgBlob);
				} else {
					url = URL.createObjectURL(file);
				}
			} catch {
				url = URL.createObjectURL(file);
			}
		} else {
			url = URL.createObjectURL(file);
		}

		return {
			id: metadata.id,
			name: metadata.name,
			type: metadata.type,
			file,
			url,
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			thumbnailUrl: metadata.thumbnailUrl,
			ephemeral: metadata.ephemeral,
		};
	}

	async loadAllMediaAssets({
		projectId,
	}: {
		projectId: string;
	}): Promise<MediaAsset[]> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const mediaIds = await mediaMetadataAdapter.list();
		const loaded: Array<MediaAsset | null> = new Array(mediaIds.length).fill(
			null,
		);
		let cursor = 0;
		const CONCURRENCY = 4;
		const workers = Array.from({ length: CONCURRENCY }, async () => {
			while (cursor < mediaIds.length) {
				const idx = cursor++;
				const id = mediaIds[idx];
				if (!id) continue;
				loaded[idx] = await this.loadMediaAsset({ projectId, id }).catch(
					() => null,
				);
			}
		});
		await Promise.all(workers);
		return loaded.filter((item): item is MediaAsset => item !== null);
	}

	async deleteMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		await Promise.all([
			mediaAssetsAdapter.remove(id),
			mediaMetadataAdapter.remove(id),
		]);
	}

	async deleteProjectMedia({
		projectId,
	}: {
		projectId: string;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		await Promise.all([
			mediaMetadataAdapter.clear(),
			mediaAssetsAdapter.clear(),
		]);
	}

	async clearAllData(): Promise<void> {
		await this.projectsAdapter.clear();
		// project-specific media and timelines cleaned up when projects are deleted
	}

	async getStorageInfo(): Promise<{
		projects: number;
		isOPFSSupported: boolean;
		isIndexedDBSupported: boolean;
	}> {
		const projectIds = await this.projectsAdapter.list();

		return {
			projects: projectIds.length,
			isOPFSSupported: this.isOPFSSupported(),
			isIndexedDBSupported: this.isIndexedDBSupported(),
		};
	}

	async getProjectStorageInfo({ projectId }: { projectId: string }): Promise<{
		mediaItems: number;
	}> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const mediaIds = await mediaMetadataAdapter.list();

		return {
			mediaItems: mediaIds.length,
		};
	}

	async loadSavedSounds(): Promise<SavedSoundsData> {
		try {
			const savedSoundsData = await this.savedSoundsAdapter.get("user-sounds");
			return (
				savedSoundsData || {
					sounds: [],
					lastModified: new Date().toISOString(),
				}
			);
		} catch (error) {
			console.error("Failed to load saved sounds:", error);
			return { sounds: [], lastModified: new Date().toISOString() };
		}
	}

	async saveSoundEffect({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			if (currentData.sounds.some((sound) => sound.id === soundEffect.id)) {
				return; // Already saved
			}

			const savedSound: SavedSound = {
				id: soundEffect.id,
				name: soundEffect.name,
				username: soundEffect.username,
				previewUrl: soundEffect.previewUrl,
				downloadUrl: soundEffect.downloadUrl,
				duration: soundEffect.duration,
				tags: soundEffect.tags,
				license: soundEffect.license,
				savedAt: new Date().toISOString(),
			};

			const updatedData: SavedSoundsData = {
				sounds: [...currentData.sounds, savedSound],
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to save sound effect:", error);
			throw error;
		}
	}

	async removeSavedSound({ soundId }: { soundId: number }): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			const updatedData: SavedSoundsData = {
				sounds: currentData.sounds.filter((sound) => sound.id !== soundId),
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to remove saved sound:", error);
			throw error;
		}
	}

	async isSoundSaved({ soundId }: { soundId: number }): Promise<boolean> {
		try {
			const currentData = await this.loadSavedSounds();
			return currentData.sounds.some((sound) => sound.id === soundId);
		} catch (error) {
			console.error("Failed to check if sound is saved:", error);
			return false;
		}
	}

	async clearSavedSounds(): Promise<void> {
		try {
			await this.savedSoundsAdapter.remove("user-sounds");
		} catch (error) {
			console.error("Failed to clear saved sounds:", error);
			throw error;
		}
	}

	isOPFSSupported(): boolean {
		return OPFSAdapter.isSupported();
	}

	isIndexedDBSupported(): boolean {
		return "indexedDB" in window;
	}

	isFullySupported(): boolean {
		return this.isIndexedDBSupported() && this.isOPFSSupported();
	}
}

export const storageService = new StorageService();
export { StorageService };
