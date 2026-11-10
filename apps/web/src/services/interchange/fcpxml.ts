/**
 * FCPXML 1.10 schrijven en lezen, volgens de publieke FCPXML-referentie.
 *
 * Opbouw: de hoofdtrack (video track 0) staat in de spine, met <gap> voor
 * lege plekken. Alle overige clips (overlay-video, audio) hangen als
 * verbonden clips (lane) aan het eerste spine-item. Dat item staat altijd
 * op offset 0, dus offset(kind) = start(item) + recordtijd.
 */
import {
	framesToRationalSeconds,
	rationalSecondsToFrames,
	type Rate,
} from "./timecode";
import {
	clipSourceDuration,
	type InterchangeClip,
	type InterchangeTimeline,
} from "./types";

const FORMAT_NAMES: Record<string, string> = {
	"1080/25": "FFVideoFormat1080p25",
	"1080/30": "FFVideoFormat1080p30",
	"1080/24": "FFVideoFormat1080p24",
	"2160/25": "FFVideoFormat2160p25",
	"2160/30": "FFVideoFormat2160p30",
};

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
	return value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

export function writeFcpxml(timeline: InterchangeTimeline): string {
	const { rate } = timeline;
	const t = (frames: number) => framesToRationalSeconds({ frames, rate });
	const width = timeline.width || 1920;
	const height = timeline.height || 1080;
	const fmtName = FORMAT_NAMES[`${height}/${Math.round(rate.num / rate.den)}`];
	const totalFrames = timeline.clips.reduce((m, c) => Math.max(m, c.recordIn + c.duration), 0);

	// Assets: één per uniek mediabestand, lang genoeg voor het hoogste bronpunt.
	const assetIds = new Map<string, string>();
	const assetExtent = new Map<string, number>();
	for (const clip of timeline.clips) {
		if (!assetIds.has(clip.media)) assetIds.set(clip.media, `r${assetIds.size + 2}`);
		assetExtent.set(
			clip.media,
			Math.max(assetExtent.get(clip.media) ?? 0, clip.sourceIn + clipSourceDuration(clip)),
		);
	}

	const main = timeline.clips
		.filter((c) => c.kind === "video" && c.track === 0)
		.sort((a, b) => a.recordIn - b.recordIn);
	const others = timeline.clips.filter((c) => !(c.kind === "video" && c.track === 0));

	const clipAttrs = (c: InterchangeClip) =>
		`ref="${assetIds.get(c.media)}" name="${escapeXml(c.name)}" duration="${t(c.duration)}" start="${t(c.sourceIn)}"`;
	const timemap = (c: InterchangeClip) =>
		c.speed === 1
			? ""
			: `<timeMap><timept time="0s" value="0s" interp="linear"/><timept time="${t(c.duration)}" value="${t(clipSourceDuration(c))}" interp="linear"/></timeMap>`;
	const note = (c: InterchangeClip) => `<note>${escapeXml(`dgdh-cut:${c.id}`)}</note>`;

	type SpineItem = { kind: "gap"; at: number; len: number } | { kind: "clip"; clip: InterchangeClip };
	const spine: SpineItem[] = [];
	let cursor = 0;
	for (const clip of main) {
		if (clip.recordIn > cursor) spine.push({ kind: "gap", at: cursor, len: clip.recordIn - cursor });
		spine.push({ kind: "clip", clip });
		cursor = clip.recordIn + clip.duration;
	}
	if (spine.length === 0 || (spine[0].kind === "clip" && spine[0].clip.recordIn > 0)) {
		spine.unshift({ kind: "gap", at: 0, len: Math.max(totalFrames, 1) });
	}
	if (cursor < totalFrames && main.length === 0) spine[0] = { kind: "gap", at: 0, len: totalFrames };

	const parentStart = (() => {
		const first = spine[0];
		return first.kind === "clip" ? first.clip.sourceIn : 0;
	})();

	const connected = (indent: string) =>
		others
			.sort((a, b) => a.kind.localeCompare(b.kind) || a.track - b.track || a.recordIn - b.recordIn)
			.map((c) => {
				const lane = c.kind === "video" ? c.track : -(c.track + 1);
				const role = c.kind === "audio" ? ' audioRole="dialogue"' : "";
				return `${indent}<asset-clip ${clipAttrs(c)} offset="${t(parentStart + c.recordIn)}" lane="${lane}"${role}>${note(c)}${timemap(c)}</asset-clip>`;
			})
			.join("\n");

	const spineXml = spine
		.map((item, index) => {
			const inner = index === 0 && others.length > 0 ? `\n${connected("\t\t\t\t\t\t")}\n\t\t\t\t\t` : "";
			if (item.kind === "gap") {
				return `\t\t\t\t\t<gap name="Gap" offset="${t(item.at)}" start="0s" duration="${t(item.len)}">${inner}</gap>`;
			}
			const c = item.clip;
			return `\t\t\t\t\t<asset-clip ${clipAttrs(c)} offset="${t(c.recordIn)}">${note(c)}${timemap(c)}${inner}</asset-clip>`;
		})
		.join("\n");

	const assetsXml = [...assetIds.entries()]
		.map(([media, id]) => {
			return `\t\t<asset id="${id}" name="${escapeXml(media)}" start="0s" duration="${t(assetExtent.get(media) ?? 0)}" hasVideo="1" hasAudio="1" format="r1">\n\t\t\t<media-rep kind="original-media" src="file:///${encodeURI(media)}"/>\n\t\t</asset>`;
		})
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
	<resources>
		<format id="r1"${fmtName ? ` name="${fmtName}"` : ""} frameDuration="${framesToRationalSeconds({ frames: 1, rate })}" width="${width}" height="${height}" colorSpace="1-1-1 (Rec. 709)"/>
${assetsXml}
	</resources>
	<library>
		<event name="${escapeXml(timeline.name)}">
			<project name="${escapeXml(timeline.name)}">
				<sequence format="r1" duration="${t(Math.max(totalFrames, 1))}" tcStart="${t(timeline.startFrame)}" tcFormat="${timeline.dropFrame ? "DF" : "NDF"}" audioLayout="stereo" audioRate="48k">
					<spine>
${spineXml}
					</spine>
				</sequence>
			</project>
		</event>
	</library>
</fcpxml>
`;
}

// ---------------------------------------------------------------------------
// Minimale XML-lezer (genoeg voor onze eigen en gangbare FCPXML-bestanden)
// ---------------------------------------------------------------------------

interface XmlNode {
	tag: string;
	attrs: Record<string, string>;
	children: XmlNode[];
	text: string;
}

export function parseXml(source: string): XmlNode {
	const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
	const stack: XmlNode[] = [root];
	const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
	let match: RegExpExecArray | null = re.exec(source);
	while (match) {
		const [whole, closing, opening, attrSource, selfClose, text] = match;
		const top = stack[stack.length - 1];
		if (closing) {
			if (top.tag !== closing) throw new SyntaxError(`XML: </${closing}> sluit <${top.tag}> niet`);
			stack.pop();
		} else if (opening) {
			const attrs: Record<string, string> = {};
			for (const a of attrSource.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
				attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? "");
			}
			const node: XmlNode = { tag: opening, attrs, children: [], text: "" };
			top.children.push(node);
			if (!selfClose) stack.push(node);
		} else if (text !== undefined) {
			top.text += unescapeXml(text);
		} else if (!whole.startsWith("<!") && !whole.startsWith("<?")) {
			throw new SyntaxError("XML: onverwacht token");
		}
		match = re.exec(source);
	}
	if (stack.length !== 1) throw new SyntaxError(`XML: <${stack[stack.length - 1].tag}> niet gesloten`);
	const first = root.children[0];
	if (!first) throw new SyntaxError("XML: leeg document");
	return first;
}

function find(node: XmlNode, tag: string): XmlNode | undefined {
	return node.children.find((c) => c.tag === tag);
}

function findDeep(node: XmlNode, tag: string): XmlNode | undefined {
	if (node.tag === tag) return node;
	for (const c of node.children) {
		const hit = findDeep(c, tag);
		if (hit) return hit;
	}
	return undefined;
}

export function parseFcpxml(source: string): InterchangeTimeline {
	const root = parseXml(source);
	if (root.tag !== "fcpxml") throw new Error("geen fcpxml-document");
	const resources = find(root, "resources");
	const format = resources?.children.find((c) => c.tag === "format");
	const frameDuration = format?.attrs.frameDuration;
	if (!frameDuration) throw new Error("fcpxml: format zonder frameDuration");
	const m = /^(\d+)\/(\d+)s$/.exec(frameDuration);
	if (!m) throw new Error(`fcpxml: onbekende frameDuration ${frameDuration}`);
	const rate: Rate = { num: Number(m[2]), den: Number(m[1]) };
	const frames = (value: string | undefined) =>
		value ? rationalSecondsToFrames({ value, rate }) : 0;

	const assets = new Map<string, string>();
	for (const a of resources?.children ?? []) {
		if (a.tag === "asset") assets.set(a.attrs.id, a.attrs.name ?? a.attrs.id);
	}
	const sequence = findDeep(root, "sequence");
	const project = findDeep(root, "project");
	const spine = sequence ? find(sequence, "spine") : undefined;
	if (!sequence || !spine) throw new Error("fcpxml: geen sequence/spine");

	const clips: InterchangeClip[] = [];
	let n = 0;
	const toClip = (node: XmlNode, recordIn: number, lane: number): InterchangeClip => {
		const timeMap = find(node, "timeMap");
		const duration = frames(node.attrs.duration);
		const tlDuration = duration;
		let speed = 1;
		if (timeMap) {
			const pts = timeMap.children.filter((c) => c.tag === "timept");
			const last = pts[pts.length - 1];
			if (last) {
				const sourceSpan = frames(last.attrs.value);
				speed = tlDuration > 0 ? sourceSpan / tlDuration : 1;
			}
		}
		const noteText = find(node, "note")?.text ?? "";
		n += 1;
		return {
			id: /^dgdh-cut:(.+)$/.exec(noteText)?.[1] ?? `fcpxml-${n}`,
			name: node.attrs.name ?? "",
			kind: lane < 0 || node.attrs.audioRole ? "audio" : "video",
			track: lane < 0 ? -lane - 1 : lane,
			media: assets.get(node.attrs.ref ?? "") ?? "",
			recordIn,
			duration: tlDuration,
			sourceIn: frames(node.attrs.start),
			speed,
		};
	};

	spine.children.forEach((item) => {
		if (item.tag !== "asset-clip" && item.tag !== "gap" && item.tag !== "clip") return;
		const offset = frames(item.attrs.offset);
		const parentStart = frames(item.attrs.start);
		if (item.tag !== "gap") clips.push(toClip(item, offset, 0));
		for (const child of item.children) {
			if (child.tag !== "asset-clip" && child.tag !== "clip") continue;
			const lane = Number(child.attrs.lane ?? 1);
			clips.push(toClip(child, frames(child.attrs.offset) - parentStart, lane));
		}
	});

	return {
		name: project?.attrs.name ?? "Naamloos",
		rate,
		width: Number(format?.attrs.width) || 0,
		height: Number(format?.attrs.height) || 0,
		startFrame: frames(sequence.attrs.tcStart),
		dropFrame: sequence.attrs.tcFormat === "DF",
		clips,
	};
}
