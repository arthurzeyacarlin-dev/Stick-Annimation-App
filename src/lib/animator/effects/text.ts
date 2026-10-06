// TEXT (SPEC-0017 Phase 2C, 2026-10-07 — Arthur: "It's going to be an explosion on the ground, in the middle of the
// screen. And then text is going to come out, whatever it is."). Words are an effect like any other: a recipe turns a
// moment into one "text" shape (types.ts TextShape), so ANY words can come out of ANY source (a blast, a punch, a
// mouth) at any frame rate. The way they move is a rule, never a drawing:
// TEXT POPS OUT (style "pop", the default): the words burst out of their source SMALL, shoot out fast (easing out:
// big gaps between the first pictures, smaller ones as they arrive — fast, but you can see every step), STRETCHED along
// the way they fly; they arrive TOO BIG and SQUASHED (overshoot), spring back past full size and settle (a squash and
// stretch that dies away), with a little tilt that wobbles and settles; then they HOLD STILL long enough to read (at
// least 1.2 s); to go, they swell a little first (anticipation) and then shrink and fade away fast.
import { clamp, lerp, rand, smooth } from "./random.ts";
import type { EffectRecipe, Shape, TextShape } from "./types.ts";

// The engine's cartoon font: heavy and rounded, on every computer (Arial Rounded MT Bold on Macs, Arial Black on
// Windows, then any bold sans-serif).
export const TEXT_FONT = '"Arial Rounded MT Bold", "Arial Black", "Arial Bold", Arial, sans-serif';
export const textFont = (size: number) => `900 ${Math.max(1, size)}px ${TEXT_FONT}`;
// The outline (x size): thick and dark, so light words read on a sky, a fire or smoke.
export const TEXT_OUTLINE = 0.16;
// How wide a line of words is, x its size (a heavy font: about 0.8 of the size a letter; thin letters and spaces less,
// M and W more) — a little generous, so a box measured from it always holds the words.
export function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /\s/.test(ch) ? 0.34 : /[!.,:;'|iIl1]/.test(ch) ? 0.4 : /[MWmw@]/.test(ch) ? 1.02 : 0.8;
  return w * size;
}
// A line of words' natural box (outline included): its width and height at `size`.
export const textBox = (text: string, size: number) => ({ w: textWidth(text, size) + TEXT_OUTLINE * size, h: 1.24 * size + TEXT_OUTLINE * size });
// The box (types.ts TextShape points) of words centered at (x, y), turned `rotation` degrees clockwise and stretched
// `scaleX` / `scaleY` about its center: top-left, top-right, bottom-right, bottom-left.
export function textCorners(text: string, size: number, x: number, y: number, rotation = 0, scaleX = 1, scaleY = 1): number[] {
  const box = textBox(text, size), hw = (box.w / 2) * scaleX, hh = (box.h / 2) * scaleY;
  const a = (rotation * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].flatMap(([dx, dy]) => [x + dx * c - dy * n, y + dx * n + dy * c]);
}
// Back from a box to where and how the words are drawn: center, turn (degrees), stretch.
export function textPlacement(s: TextShape) {
  const p = s.points, box = textBox(s.text, s.size);
  const cx = (p[0] + p[2] + p[4] + p[6]) / 4, cy = (p[1] + p[3] + p[5] + p[7]) / 4;
  const w = Math.hypot(p[2] - p[0], p[3] - p[1]), h = Math.hypot(p[6] - p[0], p[7] - p[1]);
  return { x: cx, y: cy, rotation: (Math.atan2(p[3] - p[1], p[2] - p[0]) * 180) / Math.PI, scaleX: w / box.w, scaleY: h / box.h };
}

// THE POP (seconds): out of the source in `shoot`, settled `settle` later, going away over the last `out` (the first
// `swell` of it a little swell). `from` = its size as it leaves the source, `peak` = how far past full size it grows,
// `tilt` = degrees it leaves at (it settles straight).
export const POP = { shoot: 0.3, settle: 0.6, out: 0.5, swell: 0.14, from: 0.2, peak: 1.28, tilt: 12 };
// Readable = still, straight and full size: scale within 3%, tilt within 2 degrees, not fading.
export const READ_SECONDS = 1.2;

// Where the words are in their pop at `t` of `duration` seconds: `travel` 0..1 of the way from the source to their
// spot, `scale` (1 = full size), `stretch` (>1 = taller and thinner, <1 = squashed), `rotation` (degrees), `alpha`.
// `side` (+1 / -1) = which way they tilt as they leave.
export function popAt(t: number, duration: number, side = 1) {
  const outAt = Math.max(POP.shoot + POP.settle, duration - POP.out);
  let travel: number, scale: number, stretch: number, rotation: number, alpha = 1;
  if (t < POP.shoot) {
    // flying out: fast, easing out; stretched along the flight at first, squashing as it arrives
    const u = clamp(t / POP.shoot, 0, 1), easeOut = 1 - (1 - u) ** 2;
    travel = 1 - (1 - u) ** 2.2;
    scale = lerp(POP.from, POP.peak, easeOut);
    stretch = 1 + 0.35 * (1 - u) ** 2 - 0.16 * u ** 3;
    rotation = lerp(side * POP.tilt, -side * POP.tilt * 0.6, easeOut);
  } else {
    // arrived: the overshoot springs back and dies away (scale, squash and tilt each a little spring)
    const v = t - POP.shoot;
    travel = 1;
    scale = 1 + (POP.peak - 1) * Math.exp(-v / 0.12) * Math.cos((2 * Math.PI * v) / 0.4);
    stretch = 1 - 0.16 * Math.exp(-v / 0.1) * Math.cos((2 * Math.PI * v) / 0.36);
    rotation = -side * POP.tilt * 0.6 * Math.exp(-v / 0.16) * Math.cos((2 * Math.PI * v) / 0.5);
  }
  if (t > outAt) {
    // going: a little swell first (anticipation), then shrink and fade fast (speeding up)
    const w = t - outAt;
    if (w < POP.swell) scale *= 1 + 0.07 * smooth(w / POP.swell);
    else {
      const e = clamp((w - POP.swell) / (POP.out - POP.swell), 0, 1) ** 2;
      scale *= 1.07 * (1 - 0.75 * e);
      alpha = 1 - e;
    }
  }
  return { travel, scale, stretch, rotation, alpha };
}

// The words at one moment. The source is the anchor; they shoot `rise` x height up (and `dx` x height sideways) from
// it and hold there. Knobs: text, size (letter height x figure height), color (top of the letters), color2 (bottom),
// outline (its color), rise, dx, style ("pop").
const text: EffectRecipe = {
  id: "text",
  about: "words (any text) shown in the scene, e.g. BOOM! out of an explosion or a shout. params: text, size (letter height x figure height, default 0.5), color/color2 (fill top/bottom), outline, rise/dx (where they go from the anchor, x height; default 1.3 up), style \"pop\": they burst out of the anchor small, shoot out, overshoot and settle, hold still to read, then swell, shrink and fade; give it at least 2 s",
  draw(ctx, params) {
    const words = String(params.text ?? "BOOM!").trim();
    if (!words) return [];
    const H = ctx.height, size = clamp(Number(params.size ?? 0.5), 0.05, 3) * H;
    const side = rand(Number(params.seed ?? 1), 3) < 0.5 ? -1 : 1;
    const p = popAt(ctx.t, ctx.duration, side);
    if (!(p.alpha > 0.01) || !(p.scale > 0.01)) return [];
    // from the source (a little above the anchor: out of the middle of a blast on the ground) to its spot
    const x0 = ctx.at.x, y0 = ctx.at.y - 0.25 * H, x1 = ctx.at.x + Number(params.dx ?? 0) * H, y1 = ctx.at.y - Number(params.rise ?? 1.3) * H;
    const points = textCorners(words, size, lerp(x0, x1, p.travel), lerp(y0, y1, p.travel), p.rotation, p.scale / p.stretch, p.scale * p.stretch);
    // (the whole box stays on the page: slid in from a side or down from the top)
    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    for (let i = 0; i < 8; i += 2) { minX = Math.min(minX, points[i]); maxX = Math.max(maxX, points[i]); minY = Math.min(minY, points[i + 1]); }
    // (a margin of half the outline: shape measurers add a stroke's half width round the box)
    const m = (TEXT_OUTLINE * size) / 2 + 2, W = ctx.stageWidth;
    const dx = maxX - minX > W - 2 * m ? W / 2 - (minX + maxX) / 2 : minX < m ? m - minX : maxX > W - m ? W - m - maxX : 0, dy = minY < m ? m - minY : 0;
    for (let i = 0; i < 8; i += 2) { points[i] += dx; points[i + 1] += dy; }
    const shape: Shape = {
      kind: "text", text: words, size, points,
      fill: String(params.color ?? "#fff27a"), fill2: String(params.color2 ?? "#ff8a1c"), stroke: String(params.outline ?? "#2b160b"), width: TEXT_OUTLINE * size, alpha: p.alpha,
    };
    return [shape];
  },
};

export const RECIPES: EffectRecipe[] = [text];
