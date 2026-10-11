// SPEC-0021 NEW COPY — the box a fixed prop is drawn in, for THE LAWS (copied from the rejected copy's tools/lunaTools.ts propBox,
// unchanged: it only MEASURES).
import type { DirectedPlan } from "../director/repair.ts";
import type { EffectTrack } from "../effects/types.ts";
import { thingFor } from "../things.ts";

// ---- where things are, on the plan (plan px: height H, ground G) ----
export type Box = { left: number; right: number; top: number; bottom: number; cx: number };
type Part = { shape?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown };
type Ends = { minX: number; maxX: number; top: number; bottom: number };
const H_OF = (plan: DirectedPlan) => plan.height ?? 300;
const G_OF = (plan: DirectedPlan) => plan.groundY ?? 900;
// The parts' extent in units of the prop's size (a LINE runs from x,y to x+w,y+h; anything else is centred on x,y).
function partsEnds(parts: unknown): Ends | null {
  if (!Array.isArray(parts) || !parts.length) return null;
  let minX = Infinity, maxX = -Infinity, top = Infinity, bottom = -Infinity;
  for (const raw of parts as Part[]) {
    if (!raw || typeof raw !== "object") continue;
    const x = typeof raw.x === "number" ? raw.x : 0, y = typeof raw.y === "number" ? raw.y : 0;
    const w = typeof raw.w === "number" ? raw.w : raw.shape === "line" ? 0 : 0.3, h = typeof raw.h === "number" ? raw.h : raw.shape === "line" ? 0 : 0.3;
    const xs = raw.shape === "line" ? [x, x + w] : [x - Math.abs(w) / 2, x + Math.abs(w) / 2], ys = raw.shape === "line" ? [y, y + h] : [y - Math.abs(h) / 2, y + Math.abs(h) / 2];
    minX = Math.min(minX, ...xs); maxX = Math.max(maxX, ...xs); top = Math.min(top, ...ys); bottom = Math.max(bottom, ...ys);
  }
  return Number.isFinite(minX) ? { minX, maxX, top, bottom } : null;
}
const propSize = (e: EffectTrack, H: number) => (typeof e.params?.size === "number" && e.params.size > 0 ? e.params.size : 0.5) * H;
// A catalog thing that always stands on the ground at its real size (its anchor's y and `size` are not its own).
const catalogGround = (e: EffectTrack) => { const k = thingFor(e.params?.symbol ?? e.params?.name); return k && (k.attach === "ground" || k.stands) && e.params?.flies !== true ? k : null; };
// The box a fixed prop is drawn in (moves/transform.ts drawProp's rules: a catalog thing at its real size on the ground; parts
// standing on the ground unless placed on a wall / a surface or hanging; else a symbol centred on its anchor). Null = held.
export function propBox(plan: DirectedPlan, e: EffectTrack): Box | null {
  const a = e.anchor as { x?: unknown; y?: unknown };
  if (typeof a.x !== "number" || typeof a.y !== "number") return null;
  const H = H_OF(plan), G = G_OF(plan), p = e.params ?? {}, S = propSize(e, H);
  const known = catalogGround(e);
  if (known) { const h = (known.aspect >= 1 ? known.size / known.aspect : known.size) * H, w = h * known.aspect; return { left: a.x - w / 2, right: a.x + w / 2, top: G - h, bottom: G, cx: a.x }; }
  const ends = thingFor(p.symbol ?? p.name) ? null : partsEnds(p.parts);
  if (ends) {
    const hpx = (ends.bottom - ends.top) * S;
    const standing = a.y + ends.bottom * S >= G - 0.25 * S || (p.onWall !== true && p.hangs !== true && p.flies !== true);
    const bottom = standing ? G : a.y + ends.bottom * S;
    return { left: a.x + ends.minX * S, right: a.x + ends.maxX * S, top: bottom - hpx, bottom, cx: a.x + ((ends.minX + ends.maxX) / 2) * S };
  }
  const h = Math.min(S, 1.2 * H), w = h * (thingFor(p.symbol ?? p.name)?.aspect ?? 1);
  return { left: a.x - w / 2, right: a.x + w / 2, top: a.y - h / 2, bottom: a.y + h / 2, cx: a.x };
}
