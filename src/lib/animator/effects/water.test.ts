import assert from "node:assert/strict";
import { test } from "node:test";
import { EFFECTS } from "./index.ts";
import type { EffectContext, EffectParams, Point, Shape } from "./types.ts";
import { RECIPES } from "./water.ts";

// SPEC-0017 Phase 2C: WATER recipes (rules with knobs, never drawn frames).

const H = 300, GROUND = 900;
const HIP = { x: 900, y: GROUND - 0.5 * H };
const ctx = (t: number, duration: number, at: Point, extra: Partial<EffectContext> = {}): EffectContext => ({ t, duration, fps: 12, at, height: H, groundY: GROUND, stageWidth: 1920, ...extra });
const draw = (id: string, c: EffectContext, p: EffectParams = {}) => RECIPES.find((r) => r.id === id)!.draw(c, p);
const points = (shapes: Shape[]): Point[] => shapes.flatMap((s) => (s.kind === "circle" || s.kind === "rect" || s.kind === "symbol" ? [{ x: s.x, y: s.y }] : Array.from({ length: s.points.length / 2 }, (_, i) => ({ x: s.points[2 * i], y: s.points[2 * i + 1] }))));
const colors = (shapes: Shape[]) => shapes.flatMap((s) => ["fill" in s ? s.fill : undefined, "stroke" in s ? s.stroke : undefined].filter((c): c is string => typeof c === "string"));
type Drop = Extract<Shape, { kind: "symbol" }>;
// Every water drop is the one "Water droplet" symbol (a small flat teardrop), placed and turned.
const dropsOf = (shapes: Shape[]) => shapes.filter((s): s is Drop => s.kind === "symbol" && s.name === "Water droplet");
const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const insidePoly = (p: Point, pts: number[]) => {
  let inside = false;
  for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
    const [xi, yi, xj, yj] = [pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1]];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const CASES: { id: string; at: Point; dur: number; target?: Point; params?: EffectParams }[] = [
  { id: "waterStream", at: { x: 700, y: 760 }, dur: 2 },
  { id: "waterStream", at: { x: 700, y: 760 }, dur: 2, target: { x: 1200, y: 720 } },
  { id: "waterStream", at: { x: 700, y: 760 }, dur: 1.5, params: { direction: 80, intensity: 2, turbulence: 1 } },
  { id: "waterShield", at: HIP, dur: 2 },
  { id: "waterShield", at: { x: 900, y: GROUND - 60 }, dur: 1.5, params: { size: 1, turbulence: 1 } },
  { id: "splash", at: { x: 900, y: GROUND }, dur: 1.2 },
  { id: "splash", at: { x: 900, y: GROUND - 200 }, dur: 1.2, params: { direction: 30, spread: 200, intensity: 2 } },
  { id: "waves", at: { x: 700, y: GROUND }, dur: 2.4 },
  { id: "waves", at: { x: 1300, y: GROUND }, dur: 2.4, params: { direction: 180, size: 0.6, turbulence: 1 } },
];

test("water: the four recipes, by these exact ids, registered in the effects list", () => {
  assert.deepEqual(RECIPES.map((r) => r.id), ["waterStream", "waterShield", "splash", "waves"]);
  for (const r of RECIPES) assert.equal(EFFECTS[r.id], r);
});

test("water is deterministic: same moment + knobs = same shapes, at 8, 12 or 24 fps", () => {
  for (const c of CASES) for (const t of [0, 0.1, 0.37, 0.9, c.dur - 0.05]) {
    const a = draw(c.id, ctx(t, c.dur, c.at, { target: c.target, fps: 8 }), c.params);
    const b = draw(c.id, ctx(t, c.dur, c.at, { target: c.target, fps: 24 }), c.params);
    assert.deepEqual(a, b, `${c.id} @${t}`);
    assert.ok(points(a).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `${c.id} @${t} finite`);
  }
  assert.notDeepEqual(draw("splash", ctx(0.3, 1, { x: 900, y: GROUND }), { seed: 1 }), draw("splash", ctx(0.3, 1, { x: 900, y: GROUND }), { seed: 2 }), "a new seed = new drops");
});

test("nothing below the ground: circles sit on it, lines and polygons stop at it", () => {
  for (const c of CASES) for (let t = 0; t <= c.dur; t += 1 / 24) {
    for (const s of draw(c.id, ctx(t, c.dur, c.at, { target: c.target }), c.params)) {
      if (s.kind === "circle") assert.ok(s.y + s.r <= GROUND + 1e-6, `${c.id} circle @${t.toFixed(2)}`);
      else if (s.kind !== "rect" && s.kind !== "symbol") for (let i = 1; i < s.points.length; i += 2) assert.ok(s.points[i] <= GROUND + 1e-6, `${c.id} ${s.kind} @${t.toFixed(2)}`);
    }
  }
});

test("water falls under gravity: a level jet bends down, splash drops come back down", () => {
  const at = { x: 700, y: 600 };
  const jet = draw("waterStream", ctx(1, 2, at), { direction: 0, turbulence: 0 }).filter((s) => s.kind === "poly");
  const far = points(jet).filter((p) => p.x > at.x + 400);
  assert.ok(far.length && far.every((p) => p.y > at.y + 40), "far along a level jet, the water is lower than the hand");
  const drops = (t: number) => dropsOf(draw("splash", ctx(t, 1.4, { x: 900, y: GROUND - 250 })));
  const meanY = (cs: { y: number }[]) => cs.reduce((a, c) => a + c.y, 0) / cs.length;
  assert.ok(meanY(drops(0.7)) > meanY(drops(0.2)) + 40, "splash drops fall back");
});

test("build-up: the jet grows out from the hand; the shield rises from the ground; waves start small", () => {
  const at = { x: 700, y: 760 };
  const reach = (t: number) => Math.max(...points(draw("waterStream", ctx(t, 2, at))).map((p) => Math.hypot(p.x - at.x, p.y - at.y)), 0);
  assert.ok(reach(0.08) < reach(0.2) && reach(0.2) < reach(0.6), `jet reach ${reach(0.08)} < ${reach(0.2)} < ${reach(0.6)}`);
  const top = (t: number) => Math.min(...points(draw("waterShield", ctx(t, 2, HIP))).map((p) => p.y));
  assert.ok(top(0.05) > GROUND - 0.2 * H, "the shield starts at the ground");
  assert.ok(top(0.2) > top(1) + 50, "and climbs up to its full height");
  const waveTop = (t: number) => Math.min(GROUND, ...points(draw("waves", ctx(t, 2.4, { x: 700, y: GROUND }))).map((p) => p.y));
  assert.ok(GROUND - waveTop(0.15) < GROUND - waveTop(1.3), "the first wave is smaller than the steady ones");
});

test("the color knobs: green water is green everywhere; default is blue", () => {
  const green = { color: "#1fbf4a", color2: "#c8ffd6" };
  for (const c of CASES) for (const t of [0.2, 0.8, c.dur - 0.1]) {
    for (const col of colors(draw(c.id, ctx(t, c.dur, c.at, { target: c.target }), { ...c.params, ...green }))) {
      const [r, g, b] = rgb(col);
      assert.ok(g >= r && g >= b, `${c.id} @${t}: ${col} is green`);
    }
  }
  assert.ok(colors(draw("waterShield", ctx(1, 2, HIP))).includes("#2f8fff"), "default shield water #2f8fff");
});

test("waterShield covers the figure: a see-through dome >= 0.6 x height round the hip, a brighter rim; bursts into falling drops", () => {
  const shapes = draw("waterShield", ctx(1, 2, HIP));
  const body = shapes.find((s) => s.kind === "poly")!;
  assert.ok(body.kind === "poly" && (body.alpha ?? 1) >= 0.35 && (body.alpha ?? 1) <= 0.5, "see-through fill");
  const xs = points([body]).map((p) => p.x), ys = points([body]).map((p) => p.y);
  assert.ok(Math.min(...xs) <= HIP.x - 0.6 * H && Math.max(...xs) >= HIP.x + 0.6 * H, "wide enough");
  assert.ok(Math.min(...ys) <= HIP.y - 0.6 * H, "tall enough (over the head)");
  for (const p of [{ x: HIP.x, y: HIP.y - 0.48 * H }, HIP, { x: HIP.x + 0.1 * H, y: GROUND - 10 }]) assert.ok(insidePoly(p, body.kind === "poly" ? body.points : []), `covers ${p.x},${p.y}`);
  assert.ok(shapes.some((s) => s.kind === "line" && (s.alpha ?? 1) > 0.8 && (s.glow ?? 0) > 0), "a bright rim");
  const late = draw("waterShield", ctx(1.95, 2, HIP));
  assert.ok(!late.some((s) => s.kind === "poly" && (s.alpha ?? 1) > 0.2), "the dome is gone at the end");
  assert.ok(dropsOf(late).length >= 6, "it burst into drops");
});

test("DRAWABLE BY HAND: water drops are ONE simple shape — the small teardrop, in the water color, and only a few", () => {
  const moments: { id: string; at: Point; dur: number; target?: Point; ts: number[]; most: number }[] = [
    { id: "waterShield", at: HIP, dur: 2, ts: [0.1, 0.2, 0.3], most: 4 }, // forming
    { id: "waterShield", at: HIP, dur: 2, ts: [1.45, 1.6, 1.75, 1.9], most: 16 }, // bursting
    { id: "splash", at: { x: 900, y: GROUND }, dur: 1.2, ts: [0.1, 0.25, 0.5, 0.8], most: 10 },
    { id: "waterStream", at: { x: 700, y: 760 }, dur: 2, target: { x: 1200, y: 720 }, ts: [0.5, 1, 1.5], most: 14 },
    { id: "waves", at: { x: 700, y: GROUND }, dur: 2.4, ts: [0.8, 1.3, 1.8], most: 9 },
  ];
  let seen = 0;
  for (const m of moments) for (const t of m.ts) {
    const shapes = draw(m.id, ctx(t, m.dur, m.at, { target: m.target }));
    const drops = dropsOf(shapes);
    seen += drops.length;
    assert.ok(drops.length <= m.most, `${m.id} @${t}: ${drops.length} drops`);
    for (const d of drops) {
      assert.equal(d.color, "#2f8fff", "the shield's blue");
      assert.ok((d.scale ?? 1) * 10 <= 0.025 * H, `small (${((d.scale ?? 1) * 10).toFixed(1)} px round end)`);
    }
    // no other little dots: every circle left is part of the shield bubble itself (its shine and rising bubbles)
    if (m.id !== "waterShield") assert.ok(!shapes.some((s) => s.kind === "circle" && s.r < 0.05 * H), `${m.id} @${t}: no dot spray`);
  }
  assert.ok(seen >= 20, "drops are there");
  const green = dropsOf(draw("splash", ctx(0.3, 1.2, { x: 900, y: GROUND }), { color: "#1fbf4a" }));
  assert.ok(green.length && green.every((d) => d.color === "#1fbf4a"), "one color family: the water color knob");
});
