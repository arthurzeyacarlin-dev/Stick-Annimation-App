// Arthur's obvious stick figure the eyes missed (2026-10-07, round 4: "If you can see it, so should the engine"):
// a hollow SQUARE-ish head, one arm straight UP (a vertical line running up past the head), the other arm up
// diagonally to the right, the spine down, one leg straight down, one leg diagonal down-left. Decoded once from his
// PNG (a 400x264 canvas crop, full scale) into arthur-arms-up-box-head.json: a colour palette + run-length palette
// indices (0 = empty). Returned as an InkImage on a transparent layer; one picture pixel = 1 page unit.
import fs from "node:fs";
import type { InkImage } from "../types.ts";

export function arthurArmsUpBoxHead(x0 = 760, y0 = 400, scale = 1): InkImage {
  const fx = JSON.parse(fs.readFileSync(new URL("./arthur-arms-up-box-head.json", import.meta.url), "utf8")) as { width: number; height: number; palette: number[][]; runs: number[] };
  const data = new Uint8ClampedArray(fx.width * fx.height * 4);
  let p = 0;
  for (let i = 0; i < fx.runs.length; i += 2) for (let k = 0; k < fx.runs[i + 1]; k++, p++) if (fx.runs[i]) { const c = fx.palette[fx.runs[i] - 1]; data.set([c[0], c[1], c[2], 255], p * 4); }
  return { width: fx.width, height: fx.height, data, x0, y0, scale };
}
