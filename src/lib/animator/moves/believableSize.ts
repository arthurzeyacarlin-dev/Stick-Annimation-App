// BELIEVABLE SIZE BY NAME (Arthur, Oct 15: "a stick figure tripping over a little tiny black thing — if it was supposed to be a
// skateboard, fail"; the shovel in the park drawn as a tiny line). A common thing has a believable HEIGHT next to a person (× the
// figure's height). When the size written for it would draw it CLEARLY wrong — under half the smallest believable height or over
// double the biggest — it is drawn at the nearest end of the believable range instead. Anything inside that wide band is left exactly
// as written (a big toy box, a small kid's shovel stay what was asked). Its parts keep their shapes; only the size changes.
import type { EffectTrack } from "../effects/types.ts";
import { withEverydayPicture } from "../effects/everydayThings.ts";
import { placedSymbolName, symbolRecipeFor } from "../symbolMaker.ts";

type Range = [number, number];
// (first match wins: more specific names first — "toy box" before "box", "basketball hoop" before "ball")
export const BELIEVABLE: [RegExp, Range][] = [
  [/\b(basketball hoop|hoop|goal ?post|street ?light|lamp ?post|flag ?pole|tree|house|building|car|truck|bus|tent)\b/i, [0, Infinity]],
  [/\bladder\b/i, [1.0, 1.6]],
  [/\b(punching bag|heavy bag|sandbag)\b/i, [0.35, 1.2]],
  [/\b(trash can|garbage can|bin|barrel|trash)\b/i, [0.25, 0.55]],
  [/\b(door|doorway|fridge|refrigerator|wardrobe|closet)\b/i, [0.9, 1.3]],
  [/\b(shovel|spade|rake|broom|mop|hoe|pitchfork)\b/i, [0.55, 0.75]],
  [/\b(table|desk|counter)\b/i, [0.3, 0.5]],
  [/\b(chair|stool|seat)\b/i, [0.35, 0.6]],
  [/\b(bench)\b/i, [0.25, 0.55]],
  [/\b(bed|couch|sofa)\b/i, [0.2, 0.5]],
  [/\b(bucket|pail|watering can)\b/i, [0.15, 0.25]],
  [/\b(skateboard)\b/i, [0.04, 0.1]],
  [/\b(bike|bicycle|scooter)\b/i, [0.35, 0.6]],
  [/\b(suitcase|backpack|bag|sack|basket)\b/i, [0.12, 0.35]],
  [/\b(crate|box|chest|package|parcel)\b/i, [0.12, 0.45]],
  [/\b(ball|football|soccer ball|basketball|beach ball)\b/i, [0.07, 0.18]],
  [/\b(bottle|cup|mug|glass|can|phone|book)\b/i, [0.03, 0.12]],
];

// The typical height (x the figure) of a built-in recipe symbol when no size is written.
export const TYPICAL_RECIPE_SIZE: Record<string, number> = { tree: 1.6, rock: 0.35, box: 0.35, shield: 0.45, torch: 0.4, star: 0.2, spike: 0.2, sword: 0.5, bat: 0.5 };

export function believableRange(name: string): Range | null {
  for (const [re, r] of BELIEVABLE) if (re.test(name)) return r;
  return null;
}

// The thing's drawn height in figure heights: a symbol's size, or its parts' height (in its own units) × its size.
function partsTall(parts: unknown[]): number {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const ys = parts.filter((q): q is Record<string, unknown> => !!q && typeof q === "object").flatMap((r) => {
    const y = n(r.y, 0), h = r.shape === "circle" ? Math.abs(n(r.w, 0.3)) : n(r.h, r.shape === "line" ? 0 : 0.3);
    return r.shape === "line" ? [y, y + h] : [y - Math.abs(h) / 2, y + Math.abs(h) / 2];
  });
  return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
}

export function believableSize(e0: EffectTrack): EffectTrack {
  if (e0.kind !== "prop" || !e0.params || e0.params.flies === true) return e0;
  // (EVERY NAMED THING HAS A PICTURE — effects/everydayThings.ts: a named thing with no parts and no built-in symbol gets its
  // everyday parts and believable size here, at plan time, so the laws measure what is drawn)
  let filled = withEverydayPicture(e0.params, (n) => placedSymbolName(n) !== undefined);
  // (a built-in recipe symbol with no size written gets its typical size, never the one-size-fits-all 0.5 — Oct 15: a tree drawn
  // shorter than the figure)
  const recipe = !(typeof filled.size === "number" && filled.size > 0) && !(Array.isArray(filled.parts) && filled.parts.length)
    ? symbolRecipeFor(String(filled.symbol ?? filled.name ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean).pop() ?? "") : undefined;
  if (recipe && TYPICAL_RECIPE_SIZE[recipe]) filled = { ...filled, size: TYPICAL_RECIPE_SIZE[recipe] };
  const e = filled === e0.params ? e0 : { ...e0, params: filled };
  const p = e.params!, size = typeof p.size === "number" && p.size > 0 ? p.size : null;
  if (size === null) return e;
  const range = believableRange(`${String(p.name ?? "")} ${String(p.symbol ?? "")}`);
  if (!range || !Number.isFinite(range[1])) return e;
  const parts = Array.isArray(p.parts) && p.parts.length ? p.parts : null;
  const unit = parts ? partsTall(parts) : 1;
  // (parts still in page pixels — not read into the thing's units — are left alone: partsInPropUnits runs first)
  if (!(unit > 0) || unit > 6) return e;
  const tall = unit * size;
  const want = tall < 0.5 * range[0] ? range[0] : tall > 2 * range[1] ? range[1] : null;
  if (want === null) return e;
  return { ...e, params: { ...p, size: want / unit } };
}
