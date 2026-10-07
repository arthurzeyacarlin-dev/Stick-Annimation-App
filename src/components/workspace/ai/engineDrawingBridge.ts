import type { SceneForPage } from "@/src/lib/animator/stageFit";
import type { InkImage } from "@/src/lib/animator/vision/types";

// SPEC-0017 "50-50" (helping with the user's OWN drawing): what the AI panel's engine tools need from the workspace.
// Page space = the engine's stage units (1080 tall, page centered on x = 960), exactly as applyAnimatorScene draws.
// The engine LOOKS at the drawing itself (Arthur: "no more asking questions"): the tools read a drawn frame as a
// picture (`frameInk`) and the engine finds the stick figure / the explosion in it. Nothing is clicked on the canvas.

// Where an engine scene goes: a new layer starting at a frame (empty cells before it; `skipFirstPicture` leaves the
// scene's first picture out — "Finish my animation", where it is the user's own last drawing), or in place of
// `count` frames of an existing layer (later frames move to after the inserted ones). One Undo either way.
export type AnimatorScenePlacement =
  | { mode: "new-layer"; frameIndex: number; skipFirstPicture?: boolean }
  | { mode: "replace"; layerId: string; frameIndex: number; count: number };

// A drawn picture on a layer: its first cell and its last held cell (0-based).
export type DrawnSpan = { start: number; end: number };

export type EngineDrawingInfo = {
  frameIndex: number;
  layerId: string;
  layerName: string;
  fps: number;
  spans: DrawnSpan[]; // the active layer's drawn pictures, in order
};

// page → drawing-canvas pixels: canvasX = x * scale + offsetX (same map as applyAnimatorScene).
export type PageToCanvasMap = { scale: number; offsetX: number; offsetY: number };

export type EngineDrawingBridge = {
  place: (source: SceneForPage, placement: AnimatorScenePlacement) => boolean;
  info: () => EngineDrawingInfo | null;
  goToFrame: (frameIndex: number) => void;
  pageMap: () => PageToCanvasMap | null;
  // The active layer's picture on a frame (a held cell gives the picture it holds), as page-space ink for the
  // engine's eyes; null when that cell has no drawing (or the canvas isn't ready). The frame being drawn on is
  // saved first, so a stroke just made counts.
  frameInk: (frameIndex: number) => InkImage | null;
};

// How much of the page a picture may cover (a stray dot far off the page must not make the picture huge).
const PAGE_LIMIT = { x0: -1000, x1: 2920, y0: -400, y1: 1480 };
const INK_PAD = 24; // page units of empty border around the ink
const INK_MAX_SIDE = 960; // picture pixels (the engine's eyes are fast up to about 960x540)

// One frame picture (an ImageData the drawing canvas shows centered — compact pictures included) → page-space ink:
// only the box around the painted pixels (plus a small border), at up to 1 pixel per page unit.
// Ink pixel (px, py) = page (x0 + px / scale, y0 + py / scale); page = (canvasPixel - offset) / map.scale.
// `overlay` draws what the cell shows on top of its picture (the Library symbols placed on it — an engine-drawn
// figure's head is one), in ink pixels; `pad` is how far (page units) it may reach past the picture's painted box.
export type InkOverlay = { pad: number; draw: (ctx: CanvasRenderingContext2D, ink: { x0: number; y0: number; scale: number }) => void };
export function bitmapToInk(bitmap: ImageData, canvasWidth: number, canvasHeight: number, map: PageToCanvasMap, overlay?: InkOverlay): InkImage | null {
  if (typeof document === "undefined" || map.scale <= 0 || bitmap.width <= 0 || bitmap.height <= 0) return null;
  const { width, height, data } = bitmap;
  // Where the picture sits on the canvas (the editor draws frame pictures centered).
  const left = Math.floor(canvasWidth / 2) - Math.floor(width / 2), top = Math.floor(canvasHeight / 2) - Math.floor(height / 2);
  // The page limit in picture pixels.
  const limX0 = Math.max(0, Math.floor(PAGE_LIMIT.x0 * map.scale + map.offsetX - left)), limX1 = Math.min(width, Math.ceil(PAGE_LIMIT.x1 * map.scale + map.offsetX - left));
  const limY0 = Math.max(0, Math.floor(PAGE_LIMIT.y0 * map.scale + map.offsetY - top)), limY1 = Math.min(height, Math.ceil(PAGE_LIMIT.y1 * map.scale + map.offsetY - top));
  let bx0 = limX1, by0 = limY1, bx1 = -1, by1 = -1;
  for (let y = limY0; y < limY1; y += 1) {
    const row = y * width * 4;
    for (let x = limX0; x < limX1; x += 1) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      by1 = y;
    }
  }
  if (bx1 < 0) return null;
  const toPageX = (px: number) => (left + px - map.offsetX) / map.scale, toPageY = (py: number) => (top + py - map.offsetY) / map.scale;
  const pad = INK_PAD + Math.max(0, overlay?.pad ?? 0);
  const x0 = toPageX(bx0) - pad, y0 = toPageY(by0) - pad;
  const pageW = toPageX(bx1 + 1) - toPageX(bx0) + 2 * pad, pageH = toPageY(by1 + 1) - toPageY(by0) + 2 * pad;
  const scale = Math.max(0.2, Math.min(1, INK_MAX_SIDE / Math.max(pageW, pageH)));
  const outW = Math.max(1, Math.ceil(pageW * scale)), outH = Math.max(1, Math.ceil(pageH * scale));
  // The painted box of the picture → a small canvas → drawn scaled into the ink picture.
  const cropW = bx1 - bx0 + 1, cropH = by1 - by0 + 1;
  const crop = document.createElement("canvas");
  crop.width = cropW; crop.height = cropH;
  const out = document.createElement("canvas");
  out.width = outW; out.height = outH;
  const cropCtx = crop.getContext("2d"), outCtx = out.getContext("2d", { willReadFrequently: true });
  if (!cropCtx || !outCtx) return null;
  cropCtx.putImageData(bitmap, -bx0, -by0, bx0, by0, cropW, cropH);
  const k = scale / map.scale;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.setTransform(k, 0, 0, k, (toPageX(bx0) - x0) * scale, (toPageY(by0) - y0) * scale);
  outCtx.drawImage(crop, 0, 0);
  if (overlay) {
    outCtx.save();
    overlay.draw(outCtx, { x0, y0, scale });
    outCtx.restore();
  }
  const pixels = outCtx.getImageData(0, 0, outW, outH);
  return { width: outW, height: outH, data: pixels.data, x0, y0, scale };
}
