// TUMBLE (tumble.ts): WHAT CATCHES A FALLING BODY in a scene — read from the scene itself, never asked for. Every placed solid prop
// (the `solid` law's things: rock, stone, boulder, crate, log, car… plus ledges, cliffs, steps, stairs, roofs, tables, platforms,
// shelves, benches) is a surface with its top; every `pit` background piece is a floor below the ground line with walls.
import { pitOutline } from "../effects/backgrounds.ts";
import type { EffectTrack } from "../effects/types.ts";
import { propBox } from "../laws/propBox.ts";
import { SOLID_THING } from "./hitThings.ts";
import type { TumblePit, TumbleSurface } from "./tumble.ts";

export const CATCHES_A_FALL = /\b(ledge|cliff|step|steps|stair|stairs|roof|table|desk|platform|shelf|bench|crag|outcrop|slab|beam|branch)\b/i;

type PlanLike = { height: number; groundY: number; stageWidth?: number; effects?: EffectTrack[]; background?: { pieces?: { kind: string; params?: Record<string, unknown> }[] } };

export function tumbleScene(plan: PlanLike): { surfaces: TumbleSurface[]; pits: TumblePit[]; page: [number, number] } {
  const H = plan.height, G = plan.groundY;
  const surfaces: TumbleSurface[] = [];
  for (const e of plan.effects ?? []) {
    if (e.kind !== "prop" || !e.anchor || "character" in (e.anchor as object) || "object" in (e.anchor as object)) continue;
    const p = e.params ?? {}, name = String(p.name ?? p.symbol ?? "");
    if (!(SOLID_THING.test(name) || CATCHES_A_FALL.test(name)) || p.flies === true || p.hangs === true) continue;
    const b = propBox({ height: H, groundY: G } as never, e);
    if (!b || b.bottom - b.top < 0.02 * H) continue;
    surfaces.push({ left: b.left, right: b.right, top: G - b.top, cx: b.cx });
  }
  // (ONE SOURCE OF TRUTH — the pit as DRAWN, effects/backgrounds.ts pitOutline: its walls narrow going down and its floor is rough;
  // the body bounces inside the walls' narrowest part and lies ON the drawn floor under it — its lowest point on the floor's highest
  // point under its length, never floating over a dip, never sunk into a bump.)
  const pits: TumblePit[] = scenePits(plan).map((g) => {
    const lie = 0.45 * H;
    const floorAt = (x: number) => { let top = Infinity; for (let k = 0; k <= 12; k += 1) top = Math.min(top, g.floorY(x - lie + (2 * lie * k) / 12)); for (const p of g.floor) if (p.x >= x - lie && p.x <= x + lie) top = Math.min(top, p.y); return G - top; };
    // (standing: the floor's highest point under the FEET — about a foot either side — so a standing figure is ON the floor, not on the
    // top of a bump half a body away)
    const standAt = (x: number) => { const f = 0.12 * H; let top = Infinity; for (let k = 0; k <= 6; k += 1) top = Math.min(top, g.floorY(x - f + (2 * f * k) / 6)); for (const p of g.floor) if (p.x >= x - f && p.x <= x + f) top = Math.min(top, p.y); return G - top; };
    return { left: g.left[0].x, right: g.right[0].x, bottom: G - Math.min(...g.floor.map((p) => p.y)), floorAt, standAt, wallAt: (side: -1 | 1, y: number) => g.wallX(side, G - y) };
  });
  const W = plan.stageWidth ?? 1920;
  const mid = 960, half = (W * 0.92) / 2;
  return { surfaces, pits, page: [mid - half, mid + half] };
}

// ---- THE DRAWN PIT, for everything that touches it ----
type Pt = { x: number; y: number };
const along = (pts: Pt[], v: number, by: "x" | "y") => {
  const o = by === "x" ? "y" : "x", q = [...pts].sort((a, b) => a[by] - b[by]);
  if (v <= q[0][by]) return q[0][o];
  for (let i = 1; i < q.length; i += 1) if (v <= q[i][by]) { const a = q[i - 1], b = q[i], u = (v - a[by]) / Math.max(1e-9, b[by] - a[by]); return a[o] + (b[o] - a[o]) * u; }
  return q[q.length - 1][o];
};
export type PitGeom = { left: Pt[]; right: Pt[]; floor: Pt[]; top: number; wallX: (side: -1 | 1, y: number) => number; floorY: (x: number) => number };
// Every (finished, not being dug) `pit` piece as the page draws it (page px, y down).
export function scenePits(plan: PlanLike): PitGeom[] {
  const out: PitGeom[] = [];
  for (const piece of plan.background?.pieces ?? []) {
    const q = piece.params ?? {};
    if (piece.kind !== "pit" || (Array.isArray(q.steps) && q.steps.length)) continue;
    const o = pitOutline(q as never, { width: plan.stageWidth ?? 1920, height: plan.height, groundY: plan.groundY });
    if (!(o.w > 0 && o.h > 0)) continue;
    const floor = [o.left[o.left.length - 1], ...o.bottom, o.right[o.right.length - 1]];
    out.push({ left: o.left, right: o.right, floor, top: o.y, wallX: (side, y) => along(side < 0 ? o.left : o.right, y, "y"), floorY: (x) => along(floor, x, "x") });
  }
  return out;
}

// SCENERY RESTS ON SOMETHING (Oct 14, Arthur on the cliff fall: "the rocks float in mid-air — they need to be connected on the wall or
// something, like a pillar"). A rock / ledge / shelf / platform placed on a wall or down in a pit (drawn where it was put —
// transform.ts drawProp) must TOUCH something: the pit's wall beside it, or the floor under it. One that doesn't is attached by the
// engine: it grows out of the NEAREST wall (a piece of the same rock reaching into the wall), or — when the floor is nearer — stands
// on a pillar down to the floor. Its top (what catches a falling body) stays where it was put. Run on every plan before drawing
// (plan.ts planToScene), so the drawing, the falling body and the laws all see the same rock.
export const SCENERY_REACH = 0.02; // x figure height: closer than this to a wall / the floor = touching it
type PartLike = { shape?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; color?: unknown };
export function sceneryRest(plan: PlanLike, e: EffectTrack): { touches: boolean; gap: number; side?: -1 | 1; to?: "wall" | "floor"; at?: number; pit?: PitGeom } | null {
  const H = plan.height, G = plan.groundY, p = e.params ?? {};
  if (e.kind !== "prop" || !e.anchor || "character" in (e.anchor as object) || "object" in (e.anchor as object)) return null;
  if (!Array.isArray(p.parts) || !p.parts.length || p.flies === true || p.hangs === true) return null;
  const b = propBox({ height: H, groundY: G } as never, e);
  if (!b || !(p.onWall === true || b.top > G + 0.02 * H) || b.bottom >= G - 0.25 * H && b.top <= G) return null;
  const pit = scenePits(plan).find((g) => b.cx > g.wallX(-1, (b.top + b.bottom) / 2) - 0.5 * (b.right - b.left) && b.cx < g.wallX(1, (b.top + b.bottom) / 2) + 0.5 * (b.right - b.left) && b.top > g.top - 0.05 * H);
  if (!pit) return b.top > G ? { touches: true, gap: 0 } : { touches: false, gap: Infinity }; // (below the ground line, not in a pit: in solid ground)
  const mid = (b.top + b.bottom) / 2, gl = b.left - pit.wallX(-1, mid), gr = pit.wallX(1, mid) - b.right, gf = pit.floorY(b.cx) - b.bottom;
  const best = Math.min(gl, gr, gf);
  if (best <= SCENERY_REACH * H) return { touches: true, gap: Math.max(0, best), pit };
  return gf < Math.min(gl, gr) ? { touches: false, gap: gf, to: "floor", at: pit.floorY(b.cx), pit } : { touches: false, gap: Math.min(gl, gr), side: gl <= gr ? -1 : 1, to: "wall", at: pit.wallX(gl <= gr ? -1 : 1, mid), pit };
}
export function restScenery<T extends PlanLike>(plan: T): T {
  if (!plan.effects?.length || !plan.background?.pieces?.some((q) => q.kind === "pit")) return plan;
  let changed = false;
  const effects = plan.effects.map((e) => {
    const r = sceneryRest(plan, e);
    if (!r || r.touches || r.at === undefined || !Number.isFinite(r.gap)) return e;
    const p = e.params ?? {}, S = (typeof p.size === "number" && p.size > 0 ? p.size : 0.5) * plan.height, a = e.anchor as { x: number; y: number };
    const parts = (p.parts as PartLike[]).filter((q) => q && typeof q === "object");
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const ext = parts.map((q) => ({ x0: n(q.x, 0) - Math.abs(n(q.w, 0.3)) / 2, x1: n(q.x, 0) + Math.abs(n(q.w, 0.3)) / 2, y0: n(q.y, 0) - Math.abs(n(q.h, 0.3)) / 2, y1: n(q.y, 0) + Math.abs(n(q.h, 0.3)) / 2 }));
    const minX = Math.min(...ext.map((q) => q.x0)), maxX = Math.max(...ext.map((q) => q.x1)), top = Math.min(...ext.map((q) => q.y0)), bot = Math.max(...ext.map((q) => q.y1));
    // (the same rock: its colour a shade darker — the part of it in the wall's shadow — and a rough natural outline, transform.ts "rock")
    const base = String(parts[0]?.color ?? "#7c7f86"), m = /^#([0-9a-f]{6})$/i.exec(base);
    const color = m ? `#${[0, 2, 4].map((i) => Math.round(parseInt(m[1].slice(i, i + 2), 16) * 0.82).toString(16).padStart(2, "0")).join("")}` : base, thick = bot - top;
    let piece: PartLike;
    if (r.to === "wall") {
      // (a piece of the same rock reaching INTO the wall a little, a bit thinner than the rock, under its top)
      const wall = (r.at - a.x) / S + (r.side ?? -1) * 0.04 * plan.height / S, near = r.side! < 0 ? minX + 0.15 * (maxX - minX) : maxX - 0.15 * (maxX - minX);
      piece = { shape: "rock", x: (wall + near) / 2, y: top + 0.5 * thick + 0.04 * thick, w: Math.abs(near - wall), h: 0.92 * thick, color };
    } else {
      // (a pillar from under the rock down into the floor)
      const floor = (r.at - a.y) / S + 0.03 * plan.height / S;
      piece = { shape: "rock", x: (minX + maxX) / 2, y: (bot - 0.1 * thick + floor) / 2, w: 0.45 * (maxX - minX), h: floor - (bot - 0.1 * thick), color };
    }
    changed = true;
    return { ...e, params: { ...p, onWall: true, parts: [piece, ...parts] } } as EffectTrack;
  });
  return changed ? { ...plan, effects } : plan;
}

// A BODY LYING AT REST FOLLOWS WHAT IT LIES ON (the lead, Oct 14: lying flat over a sloped pit floor, one end floated): the slope, in
// degrees (+ = the floor rises to the right), of the drawn floor under a body lying at x — 0 on a flat rock / ground. The motion
// (tumble's settle, any lie-down on a slope, a sloped roof, stairs) turns the lying body by this so both ends touch; the get-up turns
// it back level as it rises. Shared so every move that lies down reads the same floor.
export function restSlope(pits: TumblePit[], x: number, H: number): number {
  const p = pits.find((q) => x > q.left && x < q.right);
  if (!p?.floorAt) return 0;
  const d = 0.3 * H, rise = p.floorAt(x + d) - p.floorAt(x - d);
  return Math.max(-20, Math.min(20, (Math.atan2(rise, 2 * d) * 180) / Math.PI));
}

// A THING ON TOP OF ANOTHER THING RESTS ON IT (Oct 14 night audit: a cake on a table was drawn hanging on a chain from the top of
// the page, because only the ground and walls counted as support). A placed, non-flying prop whose bottom sits on the top of
// another placed prop (a table, a shelf, a counter, a box) is resting — never hung — so it gets `hangs: false`.
export function restOnSupports<T extends PlanLike>(plan: T): T {
  const effects = plan.effects ?? [];
  if (effects.length < 2) return plan;
  const H = plan.height, G = (plan as { groundY?: number }).groundY ?? 900;
  const boxes = effects.map((e) => (e.kind === "prop" ? propBox(plan as never, e) : null));
  let changed = false;
  const next = effects.map((e, i) => {
    const p = e.params ?? {}, a = e.anchor as { x?: unknown; y?: unknown };
    // (where it is PLACED: its anchor is its bottom — the drawing puts it there, whatever the catalog says)
    if (e.kind !== "prop" || typeof a.x !== "number" || typeof a.y !== "number" || p.hangs !== undefined || p.flies === true || a.y >= G - 0.02 * H) return e;
    const x = a.x as number, y = a.y as number;
    const onTop = boxes.some((s, j) => s && j !== i && Math.abs(s.top - y) <= 0.04 * H && s.left - 0.02 * H < x && s.right + 0.02 * H > x);
    if (!onTop) return e;
    changed = true;
    return { ...e, params: { ...p, hangs: false } };
  });
  return changed ? ({ ...plan, effects: next } as T) : plan;
}
