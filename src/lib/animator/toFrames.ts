import { framesIdentical, type FrameCharacter } from "./engine.ts";
import { drawFrame, type StageToPixels } from "./render.ts";
import { JOINTS } from "./rig.ts";
import { compactRasterFromCrop } from "../animation/compactRasterBitmap.ts";

export type RasterFrame = { bitmap: ImageData; hold: false } | { bitmap: null; hold: true };

const makeCanvas = (width: number, height: number) => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

// Turns engine frames into ordinary editor frame pictures. Each picture is a compact centered box
// that remembers the editor's full canvas size, so saving and export treat it exactly like a
// hand-drawn frame. Repeated pictures become holds.
export function rasterizeFrames(frames: FrameCharacter[][], canvasWidth: number, canvasHeight: number, map: StageToPixels): RasterFrame[] {
  const out: RasterFrame[] = [];
  frames.forEach((characters, index) => {
    if (index > 0 && framesIdentical(characters, frames[index - 1])) { out.push({ bitmap: null, hold: true }); return; }
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const character of characters) {
      const pad = character.headRadius + character.style.thickness + 2;
      for (const name of JOINTS) {
        const p = character.skeleton[name];
        left = Math.min(left, p.x - pad); right = Math.max(right, p.x + pad);
        top = Math.min(top, p.y - pad); bottom = Math.max(bottom, p.y + pad);
      }
    }
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
    drawFrame(ctx, characters, { scale: map.scale, offsetX: map.offsetX - x0, offsetY: map.offsetY - y0 });
    const box = ctx.getImageData(0, 0, boxWidth, boxHeight).data;
    out.push({ bitmap: compactRasterFromCrop({ width: boxWidth, height: boxHeight, data: box, x: x0, y: y0, reference }), hold: false });
  });
  return out;
}
