import type { FrameCharacter, Scene, SceneFrames } from "@/src/lib/animator/engine";
import { compactRaster, compactRasterFromCrop } from "../../animation/compactRasterBitmap.ts";
import type { EngineBlockResult } from "./engineBlocksContract";
import { v1AlphaBox, v1PageRect, type V1GroundLine, type V1GroundRule, type V1Thing } from "../v1Animator/v1PageFit.ts";

// An engine block -> an app Scene that carries its finished frames (`prebuiltFrames`). The workspace puts it on the
// canvas with the SAME path as every engine scene (placeAnimatorScene): ordinary editable frames on a new layer,
// heads as Library symbols, one Undo. Nothing is re-animated: the frames are the engine's own drawn figures,
// only resampled to the project's frame rate.
// The engine page's own effects (fire, water, lasers…) come as pictures (`prebuiltEffectLayers`, already decoded): the
// workspace puts them on their own layers, UNDER and OVER the figures' layer, picture for picture with the figures.
export type EngineEffectPictures = { stage: [number, number]; shift: { x: number; y: number }; under: (CanvasImageSource | null)[]; over: (CanvasImageSource | null)[] };
// (Oct 30, wired V1) story-path figures: their own drawn pictures, one layer per figure (no skeleton is re-drawn)
export type EngineFigurePictures = { stage: [number, number]; shift: { x: number; y: number }; inkBox?: [number, number, number, number] | null; fitExtra?: EngineFitExtra | null; layers: { name: string; pictures: (CanvasImageSource | null)[] }[] };
export type EngineBlockScene = Scene & { prebuiltFrames: SceneFrames; prebuiltEffectLayers?: EngineEffectPictures; prebuiltFigureLayers?: EngineFigurePictures };

export function enginePrebuiltFrames(scene: Scene): SceneFrames | null {
  const prebuilt = (scene as Partial<EngineBlockScene>).prebuiltFrames;
  return prebuilt && Array.isArray(prebuilt.frames) && prebuilt.frames.length > 0 ? prebuilt : null;
}
export function enginePrebuiltFigureLayers(scene: Scene): EngineFigurePictures | null {
  const figs = (scene as Partial<EngineBlockScene>).prebuiltFigureLayers;
  return figs && figs.layers.some((layer) => layer.pictures.some(Boolean)) ? figs : null;
}
export function enginePrebuiltEffectLayers(scene: Scene): EngineEffectPictures | null {
  const fx = (scene as Partial<EngineBlockScene>).prebuiltEffectLayers;
  return fx && (fx.under.some(Boolean) || fx.over.some(Boolean)) ? fx : null;
}

// Picture i of the project (at `fps`) shows the engine picture nearest in time (no blending: poses stay the engine's).
export function resampleIndex(sourceCount: number, sourceFps: number, fps: number): number[] {
  if (!(sourceFps > 0) || !(fps > 0) || sourceFps === fps) return Array.from({ length: sourceCount }, (_, index) => index);
  const count = Math.max(1, Math.round((sourceCount * fps) / sourceFps));
  return Array.from({ length: count }, (_, index) => Math.min(sourceCount - 1, Math.round((index * sourceFps) / fps)));
}
export function resampleEngineFrames(frames: readonly FrameCharacter[][], sourceFps: number, fps: number): FrameCharacter[][] {
  return resampleIndex(frames.length, sourceFps, fps).map((index) => [...frames[index]]);
}

// NEXT BLOCK FROM THE LAST POSE: every engine render frames its own camera, so the same pose can arrive shifted on the
// page. The figures this block shares with the last picture already on the canvas are measured (their mean hip gap) and
// the whole block (figures + effects) slides by that one amount: the carried figures continue exactly where they
// stopped. Nothing else changes (sizes, motion). No shared figure = no slide.
export function continuationShift(previousLast: readonly FrameCharacter[] | null, first: readonly FrameCharacter[]): { x: number; y: number } {
  if (!previousLast?.length) return { x: 0, y: 0 };
  const gaps = first.flatMap((character) => {
    const before = previousLast.find((other) => other.id === character.id);
    const a = before?.skeleton.hip, b = character.skeleton.hip;
    return a && b ? [{ x: a.x - b.x, y: a.y - b.y }] : [];
  });
  if (!gaps.length) return { x: 0, y: 0 };
  return { x: gaps.reduce((sum, gap) => sum + gap.x, 0) / gaps.length, y: gaps.reduce((sum, gap) => sum + gap.y, 0) / gaps.length };
}
export function shiftFrames(frames: readonly FrameCharacter[][], shift: { x: number; y: number }): FrameCharacter[][] {
  if (!shift.x && !shift.y) return frames.map((frame) => [...frame]);
  return frames.map((frame) => frame.map((character) => ({
    ...character,
    skeleton: Object.fromEntries(Object.entries(character.skeleton).map(([joint, point]) => [joint, { ...point, x: point.x + shift.x, y: point.y + shift.y }])) as FrameCharacter["skeleton"],
  })));
}

export function engineBlockScene(result: EngineBlockResult, title: string, id: string, fps: number, previousLast: readonly FrameCharacter[] | null = null, effectPictures: { under: (CanvasImageSource | null)[]; over: (CanvasImageSource | null)[] } | null = null, figurePictures: { name: string; pictures: (CanvasImageSource | null)[] }[] | null = null): EngineBlockScene {
  const index = resampleIndex(result.frames.length, result.fps, fps);
  const shift = continuationShift(previousLast, result.frames[0] ?? []);
  const frames = shiftFrames(index.map((i) => result.frames[i]), shift);
  const first = frames[0] ?? [];
  const fxIndex = effectPictures && result.effectLayers ? resampleIndex(effectPictures.under.length, result.effectLayers.fps, fps) : null;
  return {
    id,
    title,
    durationSec: frames.length / fps,
    groundY: 0,
    characters: first.map((character) => ({
      id: character.id,
      name: result.figures.find((figure) => figure.id === character.id)?.name ?? character.id,
      facing: character.facing,
      height: 0,
      style: character.style,
      keys: [],
    })),
    prebuiltFrames: {
      fps,
      frames,
      objects: frames.map(() => []),
      report: { frameCount: frames.length, fps, characters: [], ok: true },
    },
    ...(figurePictures && result.figureLayers ? {
      prebuiltFigureLayers: {
        stage: result.figureLayers.stage, shift, inkBox: result.figureLayers.inkBox ?? null, fitExtra: result.figureLayers.fitExtra ?? null,
        layers: figurePictures.map((layer) => { const ix = resampleIndex(layer.pictures.length, result.figureLayers!.fps, fps); return { name: layer.name, pictures: frames.map((_, k) => layer.pictures[ix[Math.min(k, ix.length - 1)]] ?? null) }; }),
      },
    } : {}),
    ...(effectPictures && fxIndex && result.effectLayers ? {
      prebuiltEffectLayers: {
        stage: result.effectLayers.stage, shift,
        // (same length as the figures' pictures: the effects play in sync with them)
        under: frames.map((_, k) => effectPictures.under[fxIndex[Math.min(k, fxIndex.length - 1)]] ?? null),
        over: frames.map((_, k) => effectPictures.over[fxIndex[Math.min(k, fxIndex.length - 1)]] ?? null),
      },
    } : {}),
  };
}

// The effect pictures -> ordinary layer pictures on the drawing canvas (page -> canvas: canvas = offset + page x scale,
// the same map the figures are drawn with). An empty picture after an empty one is a hold. Browser only.
type StageToPixels = { scale: number; offsetX: number; offsetY: number };
type RasterPicture = { bitmap: ImageData; hold: false } | { bitmap: null; hold: true };
// (V1, Nov 1) `fit` = the page (canvas pixels) + where the figure moves (inkBox, stage pixels): the page's shape follows the
// window, so a wide engine picture would be cut at the sides. With fit, the figure's whole motion is CENTRED on the page
// (slid as one piece, like the app's own animations) and only shrunk when the motion is wider than the page; feet stay on
// the same line. Without fit (the wired path), exactly as before.
// (Nov 2 final round) fitExtra: camera "still" (fitted by the FIRST picture's figure height + start spot, so he can walk off the page) and the
// user's ground lines (his standing feet go on the one under him; v1PageFit.ts, the book's numbers). Absent = exactly the fit above.
export type EngineFitExtra = { whole?: boolean; camera?: "follow" | "still"; stillHeightShare?: number; ground?: { lines: V1GroundLine[]; rule: V1GroundRule; pageW: number; pageH: number; things?: V1Thing[] } | null; moments?: { x: number; y: number }[] | null };
export type EnginePageFit = { inkBox: [number, number, number, number]; pageLeftPx: number; pageWidthPx: number; pageTopPx?: number; pageHeightPx?: number } & EngineFitExtra;
// the first picture's figure box in stage pixels (browser: drawn once at stage size and scanned); null = none / no browser
function firstPictureBox(pictures: readonly (CanvasImageSource | null)[], stage: [number, number]): [number, number, number, number] | null {
  const first = pictures.find(Boolean);
  if (!first || typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = stage[0]; c.height = stage[1];
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(first, 0, 0, stage[0], stage[1]);
  return v1AlphaBox(ctx.getImageData(0, 0, stage[0], stage[1]).data, stage[0], stage[1]);
}
export function rasterizeEnginePictures(pictures: readonly (CanvasImageSource | null)[], stage: [number, number], shift: { x: number; y: number }, canvasWidth: number, canvasHeight: number, map: StageToPixels, fit: EnginePageFit | null = null): RasterPicture[] {
  const reference = { width: canvasWidth, height: canvasHeight };
  const empty = () => compactRasterFromCrop({ width: 0, height: 0, data: new Uint8ClampedArray(0), x: Math.floor(canvasWidth / 2), y: Math.floor(canvasHeight / 2), reference });
  let x0 = map.offsetX + shift.x * map.scale, y0 = map.offsetY + shift.y * map.scale, w = stage[0] * map.scale, h = stage[1] * map.scale;
  if (fit && fit.whole && fit.pageWidthPx > 0 && fit.pageHeightPx && fit.pageTopPx !== undefined) {
    // (Nov 14, Arthur: "in the pictures you send me it looks full screen, on the canvas it's not right" - the old fit shrank the animator's frame by
    // where the ink was and stood it on the page's bottom, so the frame's top edge lay a quarter down his page and a tree was cut flat in the
    // middle of white paper) the animator's frame IS the stage picture: it is laid on the page top edge to bottom edge, centred - nothing is
    // shrunk or slid by what is drawn. A picture made in the page's own shape lies on it edge to edge.
    h = fit.pageHeightPx; w = (h * stage[0]) / stage[1]; x0 = fit.pageLeftPx + fit.pageWidthPx / 2 - w / 2; y0 = fit.pageTopPx;
  } else if (fit && fit.pageWidthPx > 0) {
    // (Nov 2) the TOP too: the feet line stays where it is, so the highest point (a raised hand, a jump) must stay under the page top.
    // (Nov 2 final round) the maths lives in v1PageFit.ts (node-tested): + camera "still" + the user's ground line
    const needFirst = fit.camera === "still" || Boolean(fit.ground?.lines.length) || Boolean(fit.ground?.things?.length);
    const r = v1PageRect(stage, { x0, y0, scale: map.scale }, { ...fit, margin: 0.94, firstBox: needFirst ? firstPictureBox(pictures, stage) : null });
    x0 = r.x0; y0 = r.y0; w = r.w; h = r.h;
  }
  const bx0 = Math.max(0, Math.floor(x0)), by0 = Math.max(0, Math.floor(y0)), bx1 = Math.min(canvasWidth, Math.ceil(x0 + w)), by1 = Math.min(canvasHeight, Math.ceil(y0 + h));
  return pictures.map((picture, index) => {
    if (!picture) return index > 0 && !pictures[index - 1] ? { bitmap: null, hold: true } : { bitmap: empty(), hold: false };
    if (index > 0 && picture === pictures[index - 1]) return { bitmap: null, hold: true };
    if (!(bx1 > bx0 && by1 > by0)) return { bitmap: empty(), hold: false };
    const canvas = document.createElement("canvas");
    canvas.width = bx1 - bx0; canvas.height = by1 - by0;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("engine_effects_canvas_unavailable");
    ctx.drawImage(picture, x0 - bx0, y0 - by0, w, h);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // (Nov 2) shrink each engine picture to the box around the figure (lossless): a full-page box per picture made the
    // first playback unpack ~18 MB per frame (~3 GB for an AI animation), so the first play stuttered and the second was smooth.
    return { bitmap: compactRaster(compactRasterFromCrop({ width: canvas.width, height: canvas.height, data, x: bx0, y: by0, reference })), hold: false };
  });
}

// Data URLs -> decoded pictures (before the synchronous canvas placement). A picture that can't be decoded is null.
export async function decodeEnginePictures(urls: readonly (string | null)[]): Promise<(HTMLImageElement | null)[]> {
  return Promise.all(urls.map((url) => url ? new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url;
  }) : Promise.resolve(null)));
}
