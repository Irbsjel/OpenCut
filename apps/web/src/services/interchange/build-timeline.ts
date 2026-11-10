import type { TProject } from "@/project/types";
import type { TimelineElement, VideoTrack } from "@/timeline/types";
import {
	RATE_2997,
	RATE_5994,
	ticksToFrames,
	type Rate,
} from "./timecode";
import type { InterchangeClip, InterchangeTimeline } from "./types";

type AssetLike = { id: string; name: string };

/**
 * Zet de hoofdscène van een project om naar het neutrale uitwisselmodel.
 * Alleen beeld- en audioclips; tekst, stickers, graphics en effecten hebben
 * geen equivalent in EDL en worden overgeslagen.
 */
export function buildInterchangeTimeline({
	project,
	assets,
	ticksPerSecond,
}: {
	project: Pick<TProject, "metadata" | "scenes" | "settings">;
	assets: AssetLike[];
	ticksPerSecond: number;
}): InterchangeTimeline {
	const scene = project.scenes.find((s) => s.isMain) ?? project.scenes[0];
	const rate: Rate = {
		num: project.settings.fps.numerator,
		den: project.settings.fps.denominator,
	};
	const assetName = new Map(assets.map((a) => [a.id, a.name]));
	const toFrames = (ticks: number) => ticksToFrames({ ticks, ticksPerSecond, rate });
	const clips: InterchangeClip[] = [];

	const push = (element: TimelineElement, kind: "video" | "audio", track: number) => {
		if (element.type !== "video" && element.type !== "image" && element.type !== "audio") return;
		const fallback = element.name;
		const media =
			"mediaId" in element
				? (assetName.get(element.mediaId) ?? fallback)
				: (element.sourceUrl.split("/").pop() ?? fallback);
		const retime = "retime" in element ? element.retime : undefined;
		const duration = toFrames(element.duration);
		if (duration <= 0) return;
		clips.push({
			id: element.id,
			name: fallback || media,
			kind,
			track,
			media,
			recordIn: toFrames(element.startTime),
			duration,
			sourceIn: toFrames(element.trimStart),
			speed: retime?.rate && retime.rate > 0 ? retime.rate : 1,
		});
	};

	if (scene) {
		for (const element of scene.tracks.main.elements) push(element, "video", 0);
		let videoIndex = 1;
		for (const track of scene.tracks.overlay) {
			if (track.type !== "video" || (track as VideoTrack).hidden) continue;
			for (const element of track.elements) push(element, "video", videoIndex);
			videoIndex += 1;
		}
		scene.tracks.audio.forEach((track, index) => {
			for (const element of track.elements) push(element, "audio", index);
		});
	}

	const dropFrame =
		(rate.num === RATE_2997.num && rate.den === RATE_2997.den) ||
		(rate.num === RATE_5994.num && rate.den === RATE_5994.den);
	return {
		name: project.metadata.name || "OpenCut Timeline",
		rate,
		width: project.settings.canvasSize.width,
		height: project.settings.canvasSize.height,
		startFrame: 3600 * Math.round(rate.num / rate.den),
		dropFrame,
		clips,
	};
}
