import { framesIdentical, type FrameCharacter, type FrameObject, type Scene, type SceneFrames } from "./engine.ts";
import { drawShapes } from "./effects/draw.ts";
import { buildEffectFrames, type EffectScene } from "./effects/index.ts";
import type { Shape } from "./effects/types.ts";
import { lookThickness, objectHalfExtents, objectsIdentical } from "./objects.ts";
import { drawFrame, type StageToPixels } from "./render.ts";
import { JOINTS } from "./rig.ts";
import { placedSymbol } from "./symbolMaker.ts";
import { compactRasterFromCrop } from "../animation/compactRasterBitmap.ts";

export type RasterFrame = { bitmap: ImageData; hold: false } | { bitmap: null; hold: true };

const makeCanvas = (width: number, height: number) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

// The stage area one frame's picture covers (figures and objects, with room for line thickness).
export function frameStageBox(characters: readonly FrameCharacter[], objects: readonly FrameObject[] = []) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const character of characters) {
    const pad = character.headRadius + character.style.thickness + 2;
    for (const name of JOINTS) {
      const p = character.skeleton[name];
      left = Math.min(left, p.x - pad); right = Math.max(right, p.x + pad);
      top = Math.min(top, p.y - pad); bottom = Math.max(bottom, p.y + pad);
    }
  }
  for (const object of objects) {
    const { halfW, halfH } = objectHalfExtents(object.look, object.rotation, object.scaleX, object.scaleY);
    const pad = lookThickness(object.look) * Math.max(1, Math.abs(object.scaleX), Math.abs(object.scaleY)) + 2;
    left = Math.min(left, object.x - halfW - pad); right = Math.max(right, object.x + halfW + pad);
    top = Math.min(top, object.y - halfH - pad); bottom = Math.max(bottom, object.y + halfH + pad);
  }
  return { left, top, right, bottom };
}

// Turns engine frames into ordinary editor frame pictures. Each picture is a compact centered box
// that remembers the editor's full canvas size, so saving and export treat it exactly like a
// hand-drawn frame. Repeated pictures become holds. `objects` (same frame index) are drawn into the
// same pictures, on top of the figures.
// Opt-in `options` (default: unchanged): skipHeads / skipObjects leave heads / objects out of the
// pictures, for callers that show them as Library symbols instead. Holds are still decided from the
// whole frame (figures AND objects), so a hold never hides a moving head or ball.
// `effects` (Phase 2C, same frame index): effect shapes drawn behind the figures ("back") and in front
// ("front"), inside the same picture. Without it (or with empty lists) the pictures are exactly as before.
// skipSymbolShapes: placed symbols ("symbol" shapes: a bulb, a droplet) are left out of the pictures, for
// callers that place them as Library symbols instead; holds are still decided with them (a hold never hides a
// moving droplet).
export type FrameEffects = { back: readonly Shape[]; front: readonly Shape[] };
export type RasterizeFramesOptions = { skipHeads?: boolean; skipObjects?: boolean; effects?: readonly FrameEffects[]; skipSymbolShapes?: boolean };
const drawnOnly = (shapes: readonly Shape[], skip: boolean | undefined) => (skip ? shapes.filter((s) => s.kind !== "symbol") : shapes);

export function rasterizeFrames(frames: FrameCharacter[][], canvasWidth: number, canvasHeight: number, map: StageToPixels, objects?: readonly (readonly FrameObject[])[], options: RasterizeFramesOptions = {}): RasterFrame[] {
  const out: RasterFrame[] = [];
  const objectsAt = (index: number) => objects?.[index] ?? [];
  // Effects that draw nothing in a picture count as none (so that picture is drawn exactly as before).
  const fullEffectsAt = (index: number) => {
    const fx = options.effects?.[index];
    return fx && (fx.back.length > 0 || fx.front.length > 0) ? fx : undefined;
  };
  const effectsAt = (index: number) => {
    const fx = fullEffectsAt(index);
    if (!fx || !options.skipSymbolShapes) return fx;
    const drawn = { back: drawnOnly(fx.back, true), front: drawnOnly(fx.front, true) };
    return drawn.back.length > 0 || drawn.front.length > 0 ? drawn : undefined;
  };
  const effectKeys = options.effects ? frames.map((_, index) => { const fx = fullEffectsAt(index); return fx ? JSON.stringify(fx) : ""; }) : null;
  frames.forEach((characters, index) => {
    if (index > 0 && framesIdentical(characters, frames[index - 1]) && objectsIdentical(objectsAt(index), objectsAt(index - 1))
      && (!effectKeys || effectKeys[index] === effectKeys[index - 1])) { out.push({ bitmap: null, hold: true }); return; }
    const drawnObjects = options.skipObjects ? [] : objectsAt(index);
    const fx = effectsAt(index);
    const { left, top, right, bottom } = fx ? unionBox(frameStageBox(characters, drawnObjects), shapesStageBox([...fx.back, ...fx.front], map.scale)) : frameStageBox(characters, drawnObjects);
    const x0 = Math.max(0, Math.floor(map.offsetX + left * map.scale));
    const y0 = Math.max(0, Math.floor(map.offsetY + top * map.scale));
    const x1 = Math.min(canvasWidth, Math.ceil(map.offsetX + right * map.scale));
    const y1 = Math.min(canvasHeight, Math.ceil(map.offsetY + bottom * map.scale));
    // Compact frame: only the centered box around the figures is kept; it remembers the full canvas size.
    const reference = { width: canvasWidth, height: canvasHeight };
    if (!(x1 > x0 && y1 > y0)) {
      out.push({ bitmap: compactRasterFromCrop({ width: 0, height: 0, data: new Uint8ClampedArray(0), x: Math.floor(canvasWidth / 2), y: Math.floor(canvasHeight / 2), reference }), hold: false });
      return;
    }
    const boxWidth = x1 - x0, boxHeight = y1 - y0;
    const canvas = makeCanvas(boxWidth, boxHeight);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error("animator_canvas_unavailable");
    if (fx) drawShapes(ctx, fx.back, { scale: map.scale, offsetX: map.offsetX - x0, offsetY: map.offsetY - y0 });
    drawFrame(ctx, characters, { scale: map.scale, offsetX: map.offsetX - x0, offsetY: map.offsetY - y0 }, drawnObjects, options.skipHeads ? { skipHeads: true } : undefined);
    if (fx) drawShapes(ctx, fx.front, { scale: map.scale, offsetX: map.offsetX - x0, offsetY: map.offsetY - y0 });
    const box = ctx.getImageData(0, 0, boxWidth, boxHeight).data;
    out.push({ bitmap: compactRasterFromCrop({ width: boxWidth, height: boxHeight, data: box, x: x0, y: y0, reference }), hold: false });
  });
  return out;
}

// ---- SPEC-0017 Phase 2C: effects and backgrounds ----

type StageBox = { left: number; top: number; right: number; bottom: number };
const unionBox = (a: StageBox, b: StageBox): StageBox => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });

// The stage area effect shapes cover (line width included; a glow is in canvas pixels, so it is turned back
// into stage units with `scale`). Empty → an empty box (left = Infinity).
export function shapesStageBox(shapes: readonly Shape[], scale = 1): StageBox {
  const box: StageBox = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const add = (x: number, y: number, pad: number) => {
    box.left = Math.min(box.left, x - pad); box.right = Math.max(box.right, x + pad);
    box.top = Math.min(box.top, y - pad); box.bottom = Math.max(box.bottom, y + pad);
  };
  for (const s of shapes) {
    const glow = "glow" in s ? Math.max(0, s.glow ?? 0) : 0;
    const pad = ("stroke" in s && s.stroke ? (s.width ?? 2) / 2 : 0) + glow * 1.5 / Math.max(1e-6, scale) + 2;
    if (s.kind === "circle") {
      const r = Math.max(0, s.r);
      add(s.x - r, s.y - r, pad); add(s.x + r, s.y + r, pad);
    } else if (s.kind === "rect") {
      add(s.x, s.y, pad); add(s.x + s.w, s.y + s.h, pad);
    } else if (s.kind === "symbol") { // its box, turned any way
      const made = placedSymbol(s), half = (Math.hypot(made.width, made.height) / 2) * (s.scale ?? 1);
      add(s.x - half, s.y - half, pad); add(s.x + half, s.y + half, pad);
    } else {
      for (let i = 0; i + 1 < s.points.length; i += 2) add(s.points[i], s.points[i + 1], pad);
    }
  }
  return box;
}

const shiftShape = (s: Shape, dx: number, dy: number): Shape => s.kind === "circle" || s.kind === "rect" || s.kind === "symbol"
  ? { ...s, x: s.x + dx, y: s.y + dy }
  : { ...s, points: s.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };

// A scene's effects and background, one entry per picture (the same pictures as buildScene's), slid by the
// same `shift` as the centered animation (centerAnimation), so a flame stays on its hand and the ground stays
// under the feet. `effects` / `background` are left out when the scene has none or they draw nothing, so a
// plain scene gives {} and is drawn exactly as before.
// `top` (only a scene with "top" tracks: laser beams from the eyes): pictures for their own layer OVER the AI layer,
// so they are drawn over the head symbols.
export type SceneEffectLayers = { effects?: FrameEffects[]; background?: Shape[][]; top?: Shape[][] };
export function sceneEffectLayers(scene: Scene, built: SceneFrames, shift: { x: number; y: number } = { x: 0, y: 0 }): SceneEffectLayers {
  const fxScene = scene as EffectScene;
  if (!fxScene.effects?.length && !fxScene.background?.pieces?.length) return {};
  const pictures = buildEffectFrames(fxScene, built);
  const move = (shapes: Shape[]) => (shift.x === 0 && shift.y === 0 ? shapes : shapes.map((s) => shiftShape(s, shift.x, shift.y)));
  const out: SceneEffectLayers = {};
  if (pictures.some((p) => p.back.length > 0 || p.front.length > 0)) out.effects = pictures.map((p) => ({ back: move(p.back), front: move(p.front) }));
  if (pictures.some((p) => p.background.length > 0)) out.background = pictures.map((p) => move(p.background));
  if (pictures.some((p) => (p.top?.length ?? 0) > 0)) out.top = pictures.map((p) => move(p.top ?? []));
  return out;
}

// Background pictures (its own layer): each picture is the shapes drawn on their own, in a compact box like the
// figure pictures; a picture that is the same as the one before becomes a hold.
// `maxBytes` (memory guard): a background is usually as big as the page, so a moving part (drifting clouds)
// would make every picture a full-page image. When all the new pictures together would need more than
// `maxBytes`, the moving parts are redrawn only every few pictures (held in between; a part that stops moving
// is still drawn where it stops).
// `skipSymbolShapes`: as for rasterizeFrames (placed symbols left out of the pictures; holds still decided with them).
// `mustDraw` (THE CAMERA, camera.ts: SceneFrames.camera.redraw): pictures never held from an earlier one by the
// memory guard — a film cut (the new shot's background shows exactly on its first picture) and a screen shake
// (the background shakes with the figures, and is still again right after).
// `clip` (canvas px; MOVING BACKGROUNDS, effects/movingBackground.ts): only this area is drawn — the page, for a
// moving background's own layer (nothing outside the page is ever seen in playback or export).
export type ShapeFramesOptions = { maxBytes?: number; skipSymbolShapes?: boolean; mustDraw?: readonly number[]; clip?: { x0: number; y0: number; x1: number; y1: number } };
export function rasterizeShapeFrames(frames: readonly (readonly Shape[])[], canvasWidth: number, canvasHeight: number, map: StageToPixels, options: ShapeFramesOptions = {}): RasterFrame[] {
  const out: RasterFrame[] = [];
  const reference = { width: canvasWidth, height: canvasHeight };
  const clip = { x0: Math.max(0, Math.floor(options.clip?.x0 ?? 0)), y0: Math.max(0, Math.floor(options.clip?.y0 ?? 0)), x1: Math.min(canvasWidth, Math.ceil(options.clip?.x1 ?? canvasWidth)), y1: Math.min(canvasHeight, Math.ceil(options.clip?.y1 ?? canvasHeight)) };
  const pixelBox = (shapes: readonly Shape[]) => {
    const { left, top, right, bottom } = shapesStageBox(shapes, map.scale);
    return {
      x0: Math.max(clip.x0, Math.floor(map.offsetX + left * map.scale)), y0: Math.max(clip.y0, Math.floor(map.offsetY + top * map.scale)),
      x1: Math.min(clip.x1, Math.ceil(map.offsetX + right * map.scale)), y1: Math.min(clip.y1, Math.ceil(map.offsetY + bottom * map.scale)),
    };
  };
  const keys = frames.map((shapes) => JSON.stringify(shapes));
  const drawnAt = (index: number) => drawnOnly(frames[index], options.skipSymbolShapes);
  let step = 1;
  if (options.maxBytes !== undefined && frames.length > 0) {
    // (A compact picture is centered on the canvas, so it is sized like compactRasterFromCrop sizes it.)
    const centered = (full: number, start: number, end: number) => Math.min(full, 2 * Math.max(1, Math.floor(full / 2) - start, end - Math.floor(full / 2)));
    let bytes = 0, biggest = 0, pictures = 0;
    keys.forEach((key, index) => {
      if (index > 0 && key === keys[index - 1]) return;
      const { x0, y0, x1, y1 } = pixelBox(drawnAt(index));
      const size = x1 > x0 && y1 > y0 ? centered(canvasWidth, x0, x1) * centered(canvasHeight, y0, y1) * 4 : 0;
      bytes += size; biggest = Math.max(biggest, size); pictures += 1;
    });
    if (bytes > options.maxBytes) step = Math.ceil(pictures / Math.max(1, Math.floor(options.maxBytes / Math.max(1, biggest)) - 1));
  }
  let drawnKey = "", drawnIndex = -Infinity;
  const mustDraw = new Set(options.mustDraw ?? []);
  frames.forEach((_, index) => {
    const shapes = drawnAt(index), key = keys[index];
    const settled = index === frames.length - 1 || keys[index + 1] === key;
    if (index > 0 && (key === drawnKey || (index - drawnIndex < step && !settled && !mustDraw.has(index)))) { out.push({ bitmap: null, hold: true }); return; }
    drawnKey = key;
    drawnIndex = index;
    const { x0, y0, x1, y1 } = pixelBox(shapes);
    if (!(x1 > x0 && y1 > y0)) {
      out.push({ bitmap: compactRasterFromCrop({ width: 0, height: 0, data: new Uint8ClampedArray(0), x: Math.floor(canvasWidth / 2), y: Math.floor(canvasHeight / 2), reference }), hold: false });
      return;
    }
    const boxWidth = x1 - x0, boxHeight = y1 - y0;
    const canvas = makeCanvas(boxWidth, boxHeight);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error("animator_canvas_unavailable");
    drawShapes(ctx, shapes, { scale: map.scale, offsetX: map.offsetX - x0, offsetY: map.offsetY - y0 });
    const box = ctx.getImageData(0, 0, boxWidth, boxHeight).data;
    out.push({ bitmap: compactRasterFromCrop({ width: boxWidth, height: boxHeight, data: box, x: x0, y: y0, reference }), hold: false });
  });
  return out;
}
