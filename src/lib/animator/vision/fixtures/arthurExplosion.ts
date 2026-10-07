// Arthur's own deliberately bad mushroom-cloud explosion drawing (2026-10-07), decoded once from his PNG (a 490x770
// canvas crop) at 1/2 scale into arthur-explosion.json: a colour palette + run-length palette indices (0 = empty).
// Returned as an InkImage on a transparent layer; one picture pixel = 2 page units, top-left at (x0, y0).
import fs from "node:fs";
import type { InkImage } from "../types.ts";

export function arthurExplosion(x0 = 600, y0 = 200): InkImage {
  const fx = JSON.parse(fs.readFileSync(new URL("./arthur-explosion.json", import.meta.url), "utf8")) as { width: number; height: number; palette: number[][]; runs: number[] };
  const data = new Uint8ClampedArray(fx.width * fx.height * 4);
  let p = 0;
  for (let i = 0; i < fx.runs.length; i += 2) for (let k = 0; k < fx.runs[i + 1]; k++, p++) if (fx.runs[i]) { const c = fx.palette[fx.runs[i] - 1]; data.set([c[0], c[1], c[2], 255], p * 4); }
  return { width: fx.width, height: fx.height, data, x0, y0, scale: 0.5 };
}
