import type { V1CanvasLimits, V1CanvasPicture } from "../../../../lib/ai/v1Animator/v1AnimatorContract.ts";
import { v1FindGroundLines, v1FindThings, v1InkMask, type V1GroundLine, type V1GroundRule, type V1Thing } from "../../../../lib/ai/v1Animator/v1PageFit.ts";

// (Nov 2 final round) THE AI SEES THE CANVAS: ONE small picture of what the USER drew, sent with a chat turn so the AI can guide them
// ("I can see your three figures and the path..."). Only the user's layers (the AI's own figure layer is left out), only the current frame,
// only the page (1920 x 1080), downscaled to the book's max_px, white behind. Nothing of theirs drawn on the page = null = nothing sent.
// The pure parts (which layers, the size, "is anything drawn") are tested with node --test; makeV1CanvasPicture needs a browser.

export const V1_PAGE = { width: 1920, height: 1080 } as const;

// The picture's size: the page fitted inside maxPx (long side), whole pixels, never bigger than the page.
export function v1PictureSize(maxPx: number): { width: number; height: number } {
  const k = Math.min(1, maxPx / Math.max(V1_PAGE.width, V1_PAGE.height));
  return { width: Math.max(1, Math.floor(V1_PAGE.width * k)), height: Math.max(1, Math.floor(V1_PAGE.height * k)) };
}

// The user's layers: every layer that is not the AI's (by id, or by the AI layer's name).
export function v1UserLayers<L extends { id: string; name: string }>(layers: L[], skip: { layerIds: string[]; layerNames: string[] }): L[] {
  const ids = new Set(skip.layerIds), names = new Set(skip.layerNames);
  return layers.filter((layer) => !ids.has(layer.id) && !names.has(layer.name));
}

// Is anything painted inside the box (x0, y0, x1, y1 in the bitmap's own pixels)? (alpha > a tiny threshold; early exit on the first pixel)
export function v1HasInk(bitmap: { width: number; height: number; data: ArrayLike<number> }, box: [number, number, number, number]): boolean {
  const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1]));
  const x1 = Math.min(bitmap.width, Math.ceil(box[2])), y1 = Math.min(bitmap.height, Math.ceil(box[3]));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0, i = (y * bitmap.width + x0) * 4 + 3; x < x1; x += 1, i += 4) if (bitmap.data[i] > 8) return true;
  }
  return false;
}

// The page's box in one centered bitmap's pixels (the editor draws frame pictures centered on the drawing canvas; page -> canvas
// pixel = page * map.scale + offset, the same map engineDrawingBridge.bitmapToInk uses).
export function v1PageBoxInBitmap(map: { scale: number; offsetX: number; offsetY: number }, canvas: { width: number; height: number }, bitmap: { width: number; height: number }): [number, number, number, number] {
  const left = Math.floor(canvas.width / 2) - Math.floor(bitmap.width / 2), top = Math.floor(canvas.height / 2) - Math.floor(bitmap.height / 2);
  return [map.offsetX - left, map.offsetY - top, V1_PAGE.width * map.scale + map.offsetX - left, V1_PAGE.height * map.scale + map.offsetY - top];
}

// (browser) The picture: each user bitmap is drawn where the canvas shows it, the page cut out and scaled down, encoded at the book's
// type + quality. null = nothing of theirs on the page, no browser, or the encoded picture is over the book's byte limit.
export function makeV1CanvasPicture(
  bitmaps: ImageData[], canvas: { width: number; height: number }, map: { scale: number; offsetX: number; offsetY: number }, limits: V1CanvasLimits,
): V1CanvasPicture | null {
  const out = composeV1Page(bitmaps, canvas, map, limits.maxPx);
  if (!out) return null;
  const url = out.toDataURL(limits.mediaType, limits.quality);
  const prefix = `data:${limits.mediaType};base64,`;
  if (!url.startsWith(prefix)) return null;
  const data = url.slice(prefix.length);
  return Math.floor((data.length * 3) / 4) <= limits.maxBytes ? { mediaType: limits.mediaType, data, width: out.width, height: out.height } : null;
}

// (Nov 2 final round, browser) THE USER'S GROUND LINES ($0): the same page picture of their layers (current frame) -> every long,
// near-horizontal, open-on-top ink run, in page pixels (v1PageFit.ts, the book's ruler). null = nothing of theirs drawn.
export function makeV1GroundLines(
  bitmaps: ImageData[], canvas: { width: number; height: number }, map: { scale: number; offsetX: number; offsetY: number }, rule: V1GroundRule, maxPx: number,
): { lines: V1GroundLine[]; things: V1Thing[] } | null {
  const out = composeV1Page(bitmaps, canvas, map, maxPx);
  const ctx = out?.getContext("2d");
  if (!out || !ctx) return null;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const mask = v1InkMask(img.data, out.width, out.height, rule.inkDiff);
  return { lines: v1FindGroundLines(mask, out.width, out.height, rule, V1_PAGE.width, V1_PAGE.height), things: v1FindThings(mask, out.width, out.height, rule, V1_PAGE.width, V1_PAGE.height) };
}

// (Nov 2 night) THE TIMELINE CONTACT SHEET: which frames to show. keys[i] = what the user's layers hold on frame i ("" = nothing drawn);
// the frames where that changes (the first drawn frame counts), spread evenly over the timeline down to max (first and last kept).
// Fewer than 2 changing frames = null (nothing moves: the current-frame picture says it all). Pure; 0-based frame indexes.
export function v1SheetFrames(keys: string[], max: number): number[] | null {
  const changes: number[] = [];
  keys.forEach((k, i) => { if (k && (i === 0 || k !== keys[i - 1])) changes.push(i); });
  if (changes.length < 2 || max < 2) return null;
  if (changes.length <= max) return changes;
  const out = Array.from({ length: max }, (_, j) => changes[Math.round((j * (changes.length - 1)) / (max - 1))]);
  return out.filter((f, j) => j === 0 || f !== out[j - 1]);
}
// The grid of a sheet of n tiles: columns x rows (as square as possible, wider than tall like the page).
export const v1SheetGrid = (n: number) => { const cols = Math.ceil(Math.sqrt(n)); return { cols, rows: Math.ceil(n / cols) }; };

// (browser, Nov 2 night) the contact sheet: each chosen frame's page picture (the same compose as the canvas picture) as one tile, in time
// order left to right then down, in ONE picture inside the book's max_px, encoded at its type + quality. frames = 1-based frame numbers.
export function makeV1ContactSheet(
  frames: { index: number; bitmaps: ImageData[] }[], canvas: { width: number; height: number }, map: { scale: number; offsetX: number; offsetY: number }, limits: V1CanvasLimits,
): V1CanvasPicture | null {
  if (typeof document === "undefined" || frames.length < 2) return null;
  const size = v1PictureSize(limits.maxPx), grid = v1SheetGrid(frames.length);
  const tileW = Math.floor(size.width / grid.cols), tileH = Math.floor(size.height / grid.rows);
  const out = document.createElement("canvas");
  out.width = size.width; out.height = size.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size.width, size.height);
  const shown: number[] = [];
  frames.forEach((f, i) => {
    const page = composeV1Page(f.bitmaps, canvas, map, limits.maxPx);
    const x = (i % grid.cols) * tileW, y = Math.floor(i / grid.cols) * tileH;
    if (page) { const k = Math.min(tileW / page.width, tileH / page.height); ctx.drawImage(page, x, y, page.width * k, page.height * k); }
    ctx.strokeStyle = "#999999"; ctx.strokeRect(x + 0.5, y + 0.5, tileW - 1, tileH - 1); // (tile edges, so the frames read apart)
    shown.push(f.index + 1);
  });
  const url = out.toDataURL(limits.mediaType, limits.quality), prefix = `data:${limits.mediaType};base64,`;
  if (!url.startsWith(prefix)) return null;
  const data = url.slice(prefix.length);
  return Math.floor((data.length * 3) / 4) <= limits.maxBytes ? { mediaType: limits.mediaType, data, width: out.width, height: out.height, frames: shown } : null;
}

// (browser) the user's layers drawn where the canvas shows them, the page cut out, scaled to maxPx, white behind; null = nothing drawn
function composeV1Page(bitmaps: ImageData[], canvas: { width: number; height: number }, map: { scale: number; offsetX: number; offsetY: number }, maxPx: number): HTMLCanvasElement | null {
  if (typeof document === "undefined" || map.scale <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
  const inked = bitmaps.filter((b) => b.width > 0 && b.height > 0 && v1HasInk(b, v1PageBoxInBitmap(map, canvas, b)));
  if (!inked.length) return null;
  const size = v1PictureSize(maxPx);
  const out = document.createElement("canvas");
  out.width = size.width; out.height = size.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  const k = size.width / (V1_PAGE.width * map.scale); // canvas pixels -> picture pixels
  const tmp = document.createElement("canvas");
  const tctx = tmp.getContext("2d");
  if (!tctx) return null;
  for (const bitmap of inked) {
    tmp.width = bitmap.width; tmp.height = bitmap.height;
    tctx.putImageData(bitmap, 0, 0);
    const left = Math.floor(canvas.width / 2) - Math.floor(bitmap.width / 2), top = Math.floor(canvas.height / 2) - Math.floor(bitmap.height / 2);
    // (alpha-blended: drawImage, not putImageData, so layers stack)
    ctx.drawImage(tmp, (left - map.offsetX) * k, (top - map.offsetY) * k, bitmap.width * k, bitmap.height * k);
  }
  return out;
}
