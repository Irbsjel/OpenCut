import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { MediaAssetData, SerializedProject } from "@/services/storage/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CloudProjectBundle {
	project: SerializedProject;
	mediaMetadata: MediaAssetData[];
}

function getCloudRootDir(): string {
	return (
		process.env.OPENCUT_CLOUD_DIR ||
		path.resolve(process.cwd(), "../../cloud-storage")
	);
}

async function ensureDirs(): Promise<{
	projectsDir: string;
	mediaPoolDir: string;
}> {
	const root = getCloudRootDir();
	const projectsDir = path.join(root, "projects");
	const mediaPoolDir = path.join(root, "media-pool");
	await fs.mkdir(projectsDir, { recursive: true });
	await fs.mkdir(mediaPoolDir, { recursive: true });
	return { projectsDir, mediaPoolDir };
}

function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function getProjectMediaIds(bundle: CloudProjectBundle): string[] {
	const ids = new Set<string>();
	for (const m of bundle.mediaMetadata ?? []) {
		if (m?.id) ids.add(m.id);
	}
	for (const scene of bundle.project?.scenes ?? []) {
		const tracks = scene?.tracks;
		if (!tracks) continue;
		const allTracks = [
			...(tracks.main ? [tracks.main] : []),
			...(Array.isArray(tracks.overlay) ? tracks.overlay : []),
			...(Array.isArray(tracks.audio) ? tracks.audio : []),
		];
		for (const track of allTracks) {
			for (const el of track?.elements ?? []) {
				const mediaId = (el as { mediaId?: string })?.mediaId;
				if (mediaId) ids.add(mediaId);
			}
		}
	}
	return Array.from(ids).sort();
}

function countTimelineElements(project: SerializedProject): number {
	let count = 0;
	for (const scene of project?.scenes ?? []) {
		const tracks = scene?.tracks;
		if (!tracks) continue;
		count += tracks.main?.elements?.length ?? 0;
		for (const t of tracks.overlay ?? []) count += t?.elements?.length ?? 0;
		for (const t of tracks.audio ?? []) count += t?.elements?.length ?? 0;
		for (const t of tracks.text ?? []) count += t?.elements?.length ?? 0;
		for (const t of tracks.sticker ?? []) count += t?.elements?.length ?? 0;
		for (const t of tracks.effect ?? []) count += t?.elements?.length ?? 0;
	}
	return count;
}

const LEGACY_MEME_MEDIA_UPGRADES: Record<
	string,
	{ newId: string; name: string; fileName: string; isSticker?: boolean }
> = {
	"58a3b0fb-b081-4cc0-a2ef-dbab145cbe1a": {
		newId: "58a3b0fb-b081-4cc0-a2ef-dbab145cbe2c",
		name: "Sticker IA · Chispa Mental",
		fileName: "sticker-chispa-mental.png",
		isSticker: true,
	},
	"58a3b0fb-b081-4cc0-a2ef-dbab145cbe2b": {
		newId: "58a3b0fb-b081-4cc0-a2ef-dbab145cbe2c",
		name: "Sticker IA · Chispa Mental",
		fileName: "sticker-chispa-mental.png",
		isSticker: true,
	},
	"a817504d-b0cf-4920-9eb1-ba9fb343d5c9": {
		newId: "a817504d-b0cf-4920-9eb1-ba9fb343d5db",
		name: "Meme IA · En la Punta de la Lengua",
		fileName: "meme-real-sad-escobar.png",
	},
	"a817504d-b0cf-4920-9eb1-ba9fb343d5da": {
		newId: "a817504d-b0cf-4920-9eb1-ba9fb343d5db",
		name: "Meme IA · En la Punta de la Lengua",
		fileName: "meme-real-sad-escobar.png",
	},
	"e94c69e8-1280-44ca-9d5b-8875b8c1f2ca": {
		newId: "a817504d-b0cf-4920-9eb1-ba9fb343d5db",
		name: "Meme IA · En la Punta de la Lengua",
		fileName: "meme-real-sad-escobar.png",
	},
	"7808d354-61c0-4259-8e5f-75c7010403b8": {
		newId: "7808d354-61c0-4259-8e5f-75c7010403ca",
		name: "Meme IA · Indirecta en la Cena",
		fileName: "meme-real-monkey-puppet.png",
	},
	"7808d354-61c0-4259-8e5f-75c7010403c9": {
		newId: "7808d354-61c0-4259-8e5f-75c7010403ca",
		name: "Meme IA · Indirecta en la Cena",
		fileName: "meme-real-monkey-puppet.png",
	},
	"f6e0f22d-966c-4de5-88ce-58df01a03dbf": {
		newId: "7808d354-61c0-4259-8e5f-75c7010403ca",
		name: "Meme IA · Indirecta en la Cena",
		fileName: "meme-real-monkey-puppet.png",
	},
	"801f405a-95b0-476d-906d-42ef77b97198": {
		newId: "801f405a-95b0-476d-906d-42ef77b971aa",
		name: "Meme IA · Emoción vs Cerebro",
		fileName: "meme-real-evil-kermit.png",
	},
	"801f405a-95b0-476d-906d-42ef77b971a9": {
		newId: "801f405a-95b0-476d-906d-42ef77b971aa",
		name: "Meme IA · Emoción vs Cerebro",
		fileName: "meme-real-evil-kermit.png",
	},
};

const EXCLUDED_LEGACY_MEDIA_IDS = new Set<string>([
	...Object.keys(LEGACY_MEME_MEDIA_UPGRADES),
	"6cbc22d0-6de8-4249-9cba-49a56480d141",
	"402399fa-4384-4dbd-8137-273177e2acce",
	"d195486f-0ae7-4927-9fd2-781ebce199c0",
	"fffb0441-805a-4959-948a-1805d2127fb1",
	"8cbd7c84-0fcd-4f01-9d9a-eb99978bdf9b",
	"d680d61e-4db4-48af-9456-75635e5aab3d",
]);

function enrichBundleMetadata(bundle: CloudProjectBundle): CloudProjectBundle {
	const project = structuredClone(bundle.project) as SerializedProject & {
		id?: string;
	};
	project.id = project.metadata.id;
	const mediaMetadata = (
		Array.isArray(bundle.mediaMetadata)
			? structuredClone(bundle.mediaMetadata)
			: []
	).filter((m) => m?.id && !EXCLUDED_LEGACY_MEDIA_IDS.has(m.id));

	// Normalize any legacy duplicate main-track memes, template memes, or subtitle typos
	for (const scene of project.scenes ?? []) {
		const tracks = scene?.tracks;
		if (!tracks) continue;
		if (tracks.main?.elements) {
			tracks.main.elements = tracks.main.elements
				.filter(
					(e) =>
						!(
							e.type === "image" &&
							typeof e.name === "string" &&
							(e.name.toLowerCase().includes("meme") ||
								e.name.toLowerCase().includes("sticker") ||
								e.name.toLowerCase().includes("contexto-visual"))
						),
				)
				.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
		}
		for (const track of tracks.overlay ?? []) {
			if (track.type === "video" && Array.isArray(track.elements)) {
				for (const el of track.elements) {
					if (el.type !== "image") continue;
					const mediaId = (el as { mediaId?: string }).mediaId || "";
					const upg = LEGACY_MEME_MEDIA_UPGRADES[mediaId];
					const params = ((el as { params?: Record<string, unknown> }).params ??=
						{});
					params.isSubtitleOverlay = true;
					params.animationPreset =
						(params.animationPreset as string) || "zoom-in-pop";
					if (upg) {
						(el as { mediaId: string }).mediaId = upg.newId;
						el.name = upg.name;
						if (upg.isSticker) {
							params.borderColor = "white";
						}
						if (!mediaMetadata.some((m) => m.id === upg.newId)) {
							mediaMetadata.push({
								id: upg.newId,
								name: upg.fileName,
								type: "image",
								size: 350000,
								lastModified: Date.now(),
								width: 640,
								height: 640,
							});
						}
					}
				}
			}
			if (track.type === "text" && Array.isArray(track.elements)) {
				// Heal any subtitle track that was ripple-shifted earlier when a cue was deleted
				const losFrancesesCue = track.elements.find(
					(el) => el.id === "57ebf0b6-8f0d-484a-99ea-018af40bb6ca",
				);
				if (
					losFrancesesCue &&
					typeof losFrancesesCue.startTime === "number" &&
					losFrancesesCue.startTime >= 5_150_000 &&
					losFrancesesCue.startTime < 5_400_000
				) {
					const shiftRestore = 5_443_200 - losFrancesesCue.startTime;
					for (const el of track.elements) {
						if (
							typeof el.startTime === "number" &&
							el.startTime >= losFrancesesCue.startTime
						) {
							el.startTime += shiftRestore;
						}
					}
				}

				track.elements = track.elements.filter((el) => {
					if (el.id === "5d7051ef-9f7b-45ec-be04-c95c0c047c8c") return false;
					const c = String(
						(el as { params?: Record<string, unknown> }).params?.content ?? "",
					).trim();
					const stSec = (el.startTime ?? 0) / 120000;
					if (c === "Hola." && stSec > 95) return false;
					return true;
				});
				for (const el of track.elements) {
					const params = (el as { params?: Record<string, unknown> }).params;
					if (!params || typeof params.content !== "string") continue;
					if (params.content.includes("vivorear")) {
						params.content = params.content.replace("vivorear", "viborear");
					}
					if (params.content.trim().toLowerCase() === "papoy.") {
						params.content = "Papoi.";
					}
					if (params.content.includes("En sinapsis")) {
						params.content = params.content.replace(
							"En sinapsis",
							"En Sinapsis",
						);
					}
				}
			}
		}
	}

	const primaryVideo =
		mediaMetadata.find((m) => m.type === "video" && !m.ephemeral) ??
		mediaMetadata.find((m) => m.type === "video") ??
		mediaMetadata.find((m) => m.type === "image");

	if (!project.metadata.thumbnail && primaryVideo?.thumbnailUrl) {
		project.metadata.thumbnail = primaryVideo.thumbnailUrl;
	}

	const rawName = (project.metadata.name || "").trim();
	const isGenericName =
		!rawName ||
		rawName === "Untitled Project" ||
		rawName === "Proyecto NERV Studio" ||
		rawName === "New project";

	if (isGenericName && primaryVideo) {
		const w = primaryVideo.width || project.settings?.canvasSize?.width || 0;
		const h = primaryVideo.height || project.settings?.canvasSize?.height || 0;
		const orientLabel =
			w > 0 && h > 0
				? h > w
					? "Video Vertical (9:16)"
					: "Video Horizontal (16:9)"
				: "Proyecto de Video";
		const cleanClipName = (primaryVideo.name || "")
			.replace(/\.(mp4|mov|webm|mkv)$/i, "")
			.trim();
		project.metadata.name = cleanClipName
			? `${orientLabel} · ${cleanClipName}`
			: orientLabel;
	}

	return { project, mediaMetadata };
}

function mergeMediaMetadata(
	a: MediaAssetData[],
	b: MediaAssetData[],
): MediaAssetData[] {
	const map = new Map<string, MediaAssetData>();
	for (const item of [...(a ?? []), ...(b ?? [])]) {
		if (!item?.id || EXCLUDED_LEGACY_MEDIA_IDS.has(item.id)) continue;
		const prev = map.get(item.id);
		if (!prev) {
			map.set(item.id, item);
		} else {
			map.set(item.id, {
				...prev,
				...item,
				width: item.width || prev.width,
				height: item.height || prev.height,
				duration: item.duration || prev.duration,
				thumbnailUrl: item.thumbnailUrl || prev.thumbnailUrl,
			});
		}
	}
	return Array.from(map.values());
}

async function readAllServerBundles(
	projectsDir: string,
): Promise<Map<string, CloudProjectBundle>> {
	const map = new Map<string, CloudProjectBundle>();
	try {
		const files = await fs.readdir(projectsDir);
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			try {
				const raw = await fs.readFile(path.join(projectsDir, file), "utf8");
				const parsed = JSON.parse(raw) as CloudProjectBundle;
				if (parsed?.project?.metadata?.id) {
					const enriched = enrichBundleMetadata(parsed);
					map.set(enriched.project.metadata.id, enriched);
				}
			} catch {
				// ignore malformed file
			}
		}
	} catch {
		// ignore
	}
	return map;
}

async function writeServerBundle(
	projectsDir: string,
	bundle: CloudProjectBundle,
): Promise<void> {
	const safeId = sanitizeId(bundle.project.metadata.id);
	if (!safeId) return;
	const enriched = enrichBundleMetadata(bundle);
	const filePath = path.join(projectsDir, `${safeId}.json`);
	const tmpPath = `${filePath}.tmp-${ process.pid }-${ Date.now() }`;
	await fs.writeFile(tmpPath, JSON.stringify(enriched), "utf8");
	await fs.rename(tmpPath, filePath);
}

export async function GET(req: NextRequest) {
	try {
		const { projectsDir } = await ensureDirs();
		const id = req.nextUrl.searchParams.get("id");

		if (id) {
			const safeId = sanitizeId(id);
			try {
				const raw = await fs.readFile(
					path.join(projectsDir, `${safeId}.json`),
					"utf8",
				);
				const parsed = JSON.parse(raw) as CloudProjectBundle;
				if (parsed?.project?.metadata?.id) {
					return NextResponse.json(enrichBundleMetadata(parsed));
				}
			} catch {
				// fall through to full scan if filename differs from metadata.id
			}
		}

		const all = await readAllServerBundles(projectsDir);

		if (id) {
			const bundle = all.get(id);
			if (!bundle) {
				return NextResponse.json({ error: "Not found" }, { status: 404 });
			}
			return NextResponse.json(bundle);
		}

		const projects = Array.from(all.values()).sort((a, b) => {
			const tA = new Date(a.project.metadata.updatedAt || 0).getTime();
			const tB = new Date(b.project.metadata.updatedAt || 0).getTime();
			return tB - tA;
		});

		return NextResponse.json({ projects });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Server error" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	try {
		const { projectsDir } = await ensureDirs();
		const body = (await req.json()) as {
			projects?: CloudProjectBundle[];
			project?: SerializedProject;
			mediaMetadata?: MediaAssetData[];
		};

		const incomingList: CloudProjectBundle[] = Array.isArray(body.projects)
			? body.projects
			: body.project
				? [{ project: body.project, mediaMetadata: body.mediaMetadata ?? [] }]
				: [];

		const existingMap = await readAllServerBundles(projectsDir);

		for (const rawIncoming of incomingList) {
			if (!rawIncoming?.project?.metadata?.id) continue;
			const incoming = enrichBundleMetadata(rawIncoming);
			const id = incoming.project.metadata.id;
			const incomingMediaIds = getProjectMediaIds(incoming);
			const incomingElemCount = countTimelineElements(incoming.project);

			// Check if this incoming project matches a previously forked project by media signature
			if (incomingMediaIds.length > 0) {
				const deterministicForkId = `${id.slice(0, 24)}${incomingMediaIds[0].replace(/-/g, "").slice(0, 12)}`;
				if (deterministicForkId !== id && existingMap.has(deterministicForkId)) {
					const forkedExisting = existingMap.get(deterministicForkId)!;
					const forkedUpdated = new Date(
						forkedExisting.project.metadata.updatedAt || 0,
					).getTime();
					const incUpdated = new Date(
						incoming.project.metadata.updatedAt || 0,
					).getTime();
					const mergedMeta = mergeMediaMetadata(
						forkedExisting.mediaMetadata,
						incoming.mediaMetadata,
					);
					const baseProj =
						incUpdated >= forkedUpdated
							? incoming.project
							: forkedExisting.project;
					const updatedFork: CloudProjectBundle = enrichBundleMetadata({
						project: {
							...baseProj,
							metadata: {
								...baseProj.metadata,
								id: deterministicForkId,
								thumbnail:
									baseProj.metadata.thumbnail ||
									forkedExisting.project.metadata.thumbnail ||
									incoming.project.metadata.thumbnail,
							},
						},
						mediaMetadata: mergedMeta,
					});
					existingMap.set(deterministicForkId, updatedFork);
					await writeServerBundle(projectsDir, updatedFork);
					continue;
				}
			}

			const existing = existingMap.get(id);
			if (!existing) {
				if (
					incomingMediaIds.length === 0 &&
					incomingElemCount === 0 &&
					(!incoming.project.metadata.duration ||
						incoming.project.metadata.duration === 0)
				) {
					continue;
				}
				existingMap.set(id, incoming);
				await writeServerBundle(projectsDir, incoming);
				continue;
			}

			const existingMediaIds = getProjectMediaIds(existing);
			const existingElemCount = countTimelineElements(existing.project);

			// Never overwrite a non-empty project with an empty shell project
			if (
				incomingMediaIds.length === 0 &&
				incomingElemCount === 0 &&
				(existingMediaIds.length > 0 || existingElemCount > 0)
			) {
				continue;
			}

			if (
				existingMediaIds.length === 0 &&
				existingElemCount === 0 &&
				(incomingMediaIds.length > 0 || incomingElemCount > 0)
			) {
				existingMap.set(id, incoming);
				await writeServerBundle(projectsDir, incoming);
				continue;
			}

			const sharedMedia = incomingMediaIds.some((m) =>
				existingMediaIds.includes(m),
			);

			if (
				!sharedMedia &&
				incomingMediaIds.length > 0 &&
				existingMediaIds.length > 0
			) {
				// Two distinct non-empty projects created in different browsers under the same UUID!
				// Keep the newer project at `id` and fork the older project so neither is lost.
				const existTime = new Date(
					existing.project.metadata.updatedAt || 0,
				).getTime();
				const incTime = new Date(
					incoming.project.metadata.updatedAt || 0,
				).getTime();

				const [primaryBundle, secondaryBundle, secondaryMediaIds] =
					incTime >= existTime
						? [incoming, existing, existingMediaIds]
						: [existing, incoming, incomingMediaIds];

				const forkId = `${id.slice(0, 24)}${secondaryMediaIds[0].replace(/-/g, "").slice(0, 12)}`;
				const forkedBundle: CloudProjectBundle = enrichBundleMetadata({
					project: {
						...secondaryBundle.project,
						metadata: {
							...secondaryBundle.project.metadata,
							id: forkId,
						},
					},
					mediaMetadata: secondaryBundle.mediaMetadata,
				});

				existingMap.set(id, primaryBundle);
				existingMap.set(forkId, forkedBundle);
				await writeServerBundle(projectsDir, primaryBundle);
				await writeServerBundle(projectsDir, forkedBundle);
				continue;
			}

			// Same project: keep newer version and merge mediaMetadata (authoritative when pushOnly=1)
			const isPushOnly = req.nextUrl.searchParams.get("pushOnly") === "1";
			const nowMs = Date.now();
			const rawExistTime = new Date(
				existing.project.metadata.updatedAt || 0,
			).getTime();
			const existTime = Math.min(rawExistTime, nowMs);
			const incTime = new Date(
				incoming.project.metadata.updatedAt || 0,
			).getTime();
			const incomingWins = isPushOnly || incTime >= existTime;
			const winner = incomingWins ? incoming : existing;
			const loser = incomingWins ? existing : incoming;
			const merged: CloudProjectBundle = enrichBundleMetadata({
				project: {
					...winner.project,
					metadata: {
						...winner.project.metadata,
						thumbnail:
							winner.project.metadata.thumbnail ||
							loser.project.metadata.thumbnail,
					},
				},
				mediaMetadata: mergeMediaMetadata(
					existing.mediaMetadata,
					incoming.mediaMetadata,
				),
			});
			existingMap.set(id, merged);
			await writeServerBundle(projectsDir, merged);
		}

		if (req.nextUrl.searchParams.get("pushOnly") === "1") {
			return NextResponse.json({ ok: true });
		}

		const projects = Array.from(existingMap.values()).sort((a, b) => {
			const tA = new Date(a.project.metadata.updatedAt || 0).getTime();
			const tB = new Date(b.project.metadata.updatedAt || 0).getTime();
			return tB - tA;
		});

		return NextResponse.json({ projects });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE(req: NextRequest) {
	try {
		const { projectsDir } = await ensureDirs();
		const id = req.nextUrl.searchParams.get("id");
		if (!id) {
			return NextResponse.json({ error: "Missing id" }, { status: 400 });
		}
		const safeId = sanitizeId(id);
		await fs.unlink(path.join(projectsDir, `${safeId}.json`)).catch(() => {});
		return NextResponse.json({ ok: true });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Server error" },
			{ status: 500 },
		);
	}
}
