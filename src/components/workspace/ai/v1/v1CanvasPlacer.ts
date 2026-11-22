import { engineBlockScene } from "../../../../lib/ai/engineBlocks/engineBlockScene.ts";
import type { EngineBlockResult } from "../../../../lib/ai/engineBlocks/engineBlocksContract";
import type { EngineDrawingBridge } from "../engineDrawingBridge";
import type { V1PlaceTarget, V1Placer, V1VersionPictures } from "./v1AnimatorController.ts";
import type { V1ClearScope } from "../../../../lib/ai/v1Animator/v1AnimatorContract.ts";

// AI Animator V1: one version's stick-figure pictures -> the canvas, through the SAME wired path as the engine blocks
// (engineBlockScene -> bridge.place -> placeAnimatorScene: an editable "AI:" layer of ordinary frames, one canvas Undo).
// The FIRST version of an animation goes on a new layer; every later version (an edit, Undo, Redo) REPLACES that same
// layer's pictures. If that layer was deleted, it goes on a new layer again (said by nothing: the user sees it).
// (Nov 2, one figure rule) a NEW animation REPLACES the previous animation's layer (one canvas Undo brings the old one back).
// (Nov 2) clearCanvas: the AI layer(s) off the canvas (or every frame), one canvas Undo.

// The workspace names a figure layer "AI: <title> <figure name>", so the layer reads "AI: Stick figure".
export const V1_LAYER_TITLE = "Stick";
export const V1_FIGURE_LAYER_NAME = "figure";
// (the name the workspace gives the layer: "AI: <title> <figure name>")
export const V1_LAYER_NAME = `AI: ${V1_LAYER_TITLE} ${V1_FIGURE_LAYER_NAME}`;
export type V1ClearBridge = { clearCanvas?: (request: { layerIds: string[]; layerNames: string[]; all: boolean }) => boolean };

type Decode = (urls: readonly (string | null)[]) => Promise<(CanvasImageSource | null)[]>;
type Placed = { animationId: string; layerId: string; count: number };

export function v1EngineResult(pictures: V1VersionPictures, ground: V1PlaceTarget["ground"] = null): EngineBlockResult {
  // (Nov 2 final round) camera "still" (fit by his first picture) + the user's ground lines ride to the page fit (v1PageFit.ts)
  // (Nov 14) whole: the animator's frame is laid on the page top to bottom, as it is (engineBlockScene.ts) - every V1 animation is the animator's own frames
  const fitExtra = { whole: true, ...(pictures.camera === "still" ? { camera: "still" as const, stillHeightShare: pictures.stillHeightShare } : {}), ...(ground ? { ground } : {}), ...(pictures.moments?.length ? { moments: pictures.moments } : {}) };
  return {
    fps: pictures.fps,
    figures: [{ id: "figure", name: V1_FIGURE_LAYER_NAME }],
    frames: pictures.pictures.map(() => []), // (the figure is the engine's own drawn pictures: no skeleton is re-drawn)
    effects: [],
    figureLayers: { fps: pictures.fps, stage: pictures.stage, inkBox: pictures.inkBox ?? null, fitExtra, layers: [{ id: "figure", name: V1_FIGURE_LAYER_NAME, pictures: pictures.pictures }] },
    lengthS: pictures.pictures.length / pictures.fps,
    video: null,
    continuedFromLastPose: false,
  };
}

// The project's fps for a placement: the fps op's value when asked; else the PROJECT's own fps (Nov 11, Arthur: "I like animating at 12 fps,
// whatever fps I put at the top left") - a 12 fps project gets every 2nd engine picture, evenly spaced, same length in seconds.
export function v1PlacementFps(projectFps: number | null, engineFps: number, asked: number | null | undefined): number {
  if (asked && asked > 0) return asked;
  return projectFps && projectFps > 0 ? projectFps : engineFps;
}

// (Nov 2) op speed, $0: the same pictures re-timed at the same fps — faster drops pictures, slower repeats them (1 = as made).
// Picture i of the new list = picture floor(i * speed) of the made list; the last made picture is always the last one shown.
export function v1RetimeIndices(count: number, speed: number | null | undefined): number[] {
  const s = speed && speed > 0 ? speed : 1;
  if (count <= 0) return [];
  if (Math.abs(s - 1) < 1e-6) return Array.from({ length: count }, (_, i) => i);
  const length = Math.max(1, Math.round(count / s));
  return Array.from({ length }, (_, i) => (i === length - 1 ? count - 1 : Math.min(count - 1, Math.floor(i * s))));
}
const retime = <T>(items: readonly T[], indices: readonly number[]) => indices.map((i) => items[i]);

// (Nov 21, Arthur: "when he edits something, that specific part is laggy ... it's how we show and display the animations")
// ONE EVEN RATE ON SCREEN. H3 draws about one clip in three with every picture shown twice (12 real pictures a second); short
// edit clips most often. An animation that MIXES those with full-rate parts plays unevenly: the half-rate part looks laggy next
// to the smooth one (his first excavator part was half rate all through, and it looked smooth to him). Display only: when one
// animation holds both kinds, each full-rate stretch is shown on twos too (every second picture holds the one before), so the
// whole animation plays at one even rate. Nothing is made, changed or removed in the version; the count and the timing stay.
// copyOfPrev[i] = picture i is (nearly) the same as picture i-1. Returns, for every picture, the picture to show.
export function v1EvenRateIndices(copyOfPrev: readonly boolean[]): number[] {
  const n = copyOfPrev.length, show = Array.from({ length: n }, (_, i) => i);
  if (n < 48) return show;
  const W = 12, kind: ("twos" | "ones" | "still")[] = [];
  for (let i = 0; i < n; i++) {
    let copies = 0, total = 0, alternating = 0;
    for (let j = Math.max(1, i - W); j <= Math.min(n - 1, i + W); j++) { total++; if (copyOfPrev[j]) { copies++; if (j > 1 && !copyOfPrev[j - 1]) alternating++; } }
    const share = total ? copies / total : 0;
    kind.push(share >= 0.8 ? "still" : share >= 0.3 && alternating >= copies * 0.7 ? "twos" : share <= 0.12 ? "ones" : "still");
  }
  const twos = kind.filter((k) => k === "twos").length, ones = kind.filter((k) => k === "ones").length;
  if (twos < 24 || ones < 24) return show;   // (one kind only: it already plays at one rate - nothing changes)
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (kind[i] !== "ones") { start = -1; continue; }
    if (start < 0) start = i;
    if ((i - start) % 2 === 1) show[i] = i - 1;
  }
  return show;
}

// which pictures are (nearly) the same as the one before: each is drawn small once and its see-through outline compared
// (a browser without a canvas - or any error - = no picture counts as a copy, so nothing changes)
function copyFlags(images: readonly (CanvasImageSource | null)[]): boolean[] {
  const none = images.map(() => false);
  try {
    const W = 64, H = 36;
    const canvas: { getContext(id: "2d", o?: unknown): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null } | null =
      typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : typeof document !== "undefined" ? Object.assign(document.createElement("canvas"), { width: W, height: H }) : null;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (!ctx) return none;
    const alphaOf = (im: CanvasImageSource | null) => { if (!im) return null; ctx.clearRect(0, 0, W, H); ctx.drawImage(im, 0, 0, W, H); const d = ctx.getImageData(0, 0, W, H).data; const a = new Float32Array(W * H); for (let k = 0; k < W * H; k++) a[k] = d[k * 4 + 3] / 255; return a; };
    const diffs: number[] = [0];
    let prev = alphaOf(images[0] ?? null);
    for (let i = 1; i < images.length; i++) {
      const cur = alphaOf(images[i] ?? null);
      let d = 1;
      if (prev && cur) { d = 0; for (let k = 0; k < cur.length; k++) d += Math.abs(cur[k] - prev[k]); d /= cur.length; }
      diffs.push(d); prev = cur;
    }
    const moving = diffs.slice(1).filter((d) => d > 0).sort((x, y) => x - y);
    if (!moving.length) return none;
    const step = moving[Math.floor(moving.length * 0.75)];   // a real step of the drawing
    return diffs.map((d, i) => i > 0 && d < step * 0.15);
  } catch { return none; }
}

type PlaybackControls = { isPlaying?: () => boolean; pausePlayback?: () => boolean; resumePlayback?: () => void };
type Wait = (ms: number) => Promise<void>;
const realWait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PAUSE_SETTLE_MS = 50, PAUSE_MAX_MS = 3000;

export function createV1CanvasPlacer(bridge: EngineDrawingBridge & { setFps?: (fps: number) => void } & PlaybackControls & V1ClearBridge, decode: Decode, wait: Wait = realWait): V1Placer & { forget: () => void; clearCanvas: (scope: V1ClearScope, layer: { layerId: string; count: number } | null) => boolean; layerId: () => string | null } {
  let placed: Placed | null = null;
  const decoded = new Map<string, (CanvasImageSource | null)[]>(); // "animation:version" -> pictures (Undo/Redo = instant)
  const evenRate = new Map<string, number[]>(); // (Nov 21) "animation:version" -> the picture to show for every picture (one even rate)
  const placer = async (target: V1PlaceTarget, made: V1VersionPictures) => {
    const key = `${target.animationId}:${target.version}`;
    let decodedImages = decoded.get(key);
    // (Nov 14, his desk story: versions of 172, 479, 560 and 792 pictures were all kept here, and the page ran out of memory while
    // placing the fourth) only the version being placed is kept; an older one is decoded again when Undo / Redo asks for it
    if (!decodedImages) { decoded.clear(); evenRate.clear(); decodedImages = await decode(made.pictures); decoded.set(key, decodedImages); }
    if (!decodedImages.some(Boolean)) return false;
    // (Nov 21) one even rate on screen - only when the project shows more than 12 pictures a second (at 12 every second picture is shown anyway)
    const shownFps = v1PlacementFps(bridge.info()?.fps ?? null, made.fps, target.fps);
    let even = evenRate.get(key);
    if (!even) { even = shownFps > 12 ? v1EvenRateIndices(copyFlags(decodedImages)) : decodedImages.map((_, i) => i); evenRate.set(key, even); }
    const evenMap = even;
    const indices = v1RetimeIndices(made.pictures.length, target.speed).map((i) => evenMap[i] ?? i);
    const images = retime(decodedImages, indices);
    const pictures: V1VersionPictures = { ...made, pictures: retime(made.pictures, indices) };
    // (Nov 2, Arthur: never interrupt the user) the timeline is playing: pause it, place, and play it again — never a message
    const wasPlaying = bridge.isPlaying?.() === true && bridge.pausePlayback?.() === true;
    if (wasPlaying) for (let waited = 0; bridge.isPlaying?.() && waited < PAUSE_MAX_MS; waited += PAUSE_SETTLE_MS) await wait(PAUSE_SETTLE_MS);
    if (wasPlaying) await wait(PAUSE_SETTLE_MS); // (the paused frame is restored first, so it never lands on top of the placement)
    try { return placeNow(target, pictures, images); } finally { if (wasPlaying) void wait(PAUSE_SETTLE_MS).then(() => bridge.resumePlayback?.()); } // (after the placed frame is drawn)
  };
  const placeNow = (target: V1PlaceTarget, pictures: V1VersionPictures, images: (CanvasImageSource | null)[]) => {
    const projectFps = bridge.info()?.fps ?? null;
    const fps = v1PlacementFps(projectFps, pictures.fps, target.fps);
    if (fps !== projectFps && bridge.setFps) bridge.setFps(fps);
    const scene = engineBlockScene(v1EngineResult(pictures, target.ground ?? null), V1_LAYER_TITLE, `v1-${target.animationId}-${target.version}`, fps, null, null, [{ name: V1_FIGURE_LAYER_NAME, pictures: images }]);
    const count = scene.prebuiltFrames.frames.length;
    // (after a reload the panel knows the layer from the server)
    const same = placed && placed.animationId === target.animationId ? placed : target.layer ? { animationId: target.animationId, ...target.layer } : null;
    // (a new animation: the previous animation's layer is replaced - one figure on the canvas)
    const previous = same ? null : target.replace ?? (placed ? { layerId: placed.layerId, count: placed.count } : null);
    const into = same ?? previous;
    let ok = into ? bridge.place(scene, { mode: "replace", layerId: into.layerId, frameIndex: 0, count: into.count }) : false;
    if (!ok) ok = bridge.place(scene, { mode: "new-layer", frameIndex: 0 });
    if (!ok) return false;
    const layerId = bridge.info()?.layerId ?? into?.layerId ?? null;
    placed = layerId ? { animationId: target.animationId, layerId, count } : null;
    return placed ? { layerId: placed.layerId, count } : true;
  };
  const forget = () => { placed = null; decoded.clear(); evenRate.clear(); };
  const clearCanvas = (scope: V1ClearScope, layer: { layerId: string; count: number } | null) => {
    if (!bridge.clearCanvas) return false;
    const layerIds = [...new Set([placed?.layerId, layer?.layerId].filter((id): id is string => Boolean(id)))];
    const ok = bridge.clearCanvas({ layerIds, layerNames: [V1_LAYER_NAME], all: scope === "all" });
    if (ok) forget();
    return ok;
  };
  return Object.assign(placer, { forget, clearCanvas, layerId: () => placed?.layerId ?? null }); // (layerId: the AI layer, left out of the canvas picture)
}
