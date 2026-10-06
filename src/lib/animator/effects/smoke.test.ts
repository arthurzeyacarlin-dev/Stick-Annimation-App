import assert from "node:assert/strict";
import { test } from "node:test";
import { EFFECTS } from "./index.ts";
import { RECIPES } from "./smoke.ts";
import type { EffectContext, EffectParams, Point, Shape } from "./types.ts";

// SPEC-0017 Phase 2C: SMOKE recipes (rules with knobs, never drawn frames).

const H = 300, GROUND = 900;
type Circle = Extract<Shape, { kind: "circle" }>;
const ctx = (t: number, duration: number, at: Point, extra: Partial<EffectContext> = {}): EffectContext => ({ t, duration, fps: 12, at, height: H, groundY: GROUND, stageWidth: 1920, ...extra });
const draw = (id: string, c: EffectContext, p: EffectParams = {}) => RECIPES.find((r) => r.id === id)!.draw(c, p);
const circles = (shapes: Shape[]) => shapes.filter((s): s is Circle => s.kind === "circle");
const colors = (shapes: Shape[]) => shapes.flatMap((s) => ["fill" in s ? s.fill : undefined, "stroke" in s ? s.stroke : undefined].filter((c): c is string => typeof c === "string"));
const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
// Smoke is drawn as flat polygons with wavy outlines.
type Poly = Extract<Shape, { kind: "poly" }>;
const polys = (shapes: Shape[]) => shapes.filter((s): s is Poly => s.kind === "poly");
const xs = (s: Poly) => s.points.filter((_, i) => i % 2 === 0), ys = (s: Poly) => s.points.filter((_, i) => i % 2 === 1);
const centroid = (s: Poly): Point => ({ x: xs(s).reduce((a, v) => a + v, 0) / xs(s).length, y: ys(s).reduce((a, v) => a + v, 0) / ys(s).length });
const halfWidth = (s: Poly) => (Math.max(...xs(s)) - Math.min(...xs(s))) / 2;
const area2 = (s: Poly) => { let a = 0; for (let i = 0, j = s.points.length / 2 - 1; i < s.points.length / 2; j = i++) a += s.points[2 * j] * s.points[2 * i + 1] - s.points[2 * i] * s.points[2 * j + 1]; return a; };
const area = (s: Poly) => Math.abs(area2(s)) / 2;
// The outline as distances from its middle, each divided by their average (its shape, whatever its size or place).
const profile = (s: Poly) => { const c = centroid(s), d = Array.from({ length: s.points.length / 2 }, (_, i) => Math.hypot(s.points[2 * i] - c.x, s.points[2 * i + 1] - c.y)), m = d.reduce((a, v) => a + v, 0) / d.length; return d.map((v) => v / m); };
// The outline's shape as its reach in 24 directions round its middle (divided by the average reach).
const reach = (s: Poly) => {
  const c = centroid(s), bins: number[] = Array(24).fill(0);
  for (let i = 0; i < s.points.length; i += 2) {
    const a = Math.atan2(s.points[i + 1] - c.y, s.points[i] - c.x), k = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 24) % 24;
    bins[k] = Math.max(bins[k], Math.hypot(s.points[i] - c.x, s.points[i + 1] - c.y));
  }
  const m = bins.reduce((a, v) => a + v, 0) / 24;
  return bins.map((v) => v / m);
};
const shapeChange = (a: Poly, b: Poly) => { const [p, q] = [reach(a), reach(b)]; return p.reduce((s, v, i) => s + Math.abs(v - q[i]), 0) / 24; };
// How many bulges the outline has (a circle has none, an oval 2, a wavy outline more)...
const bulges = (s: Poly) => { const d = profile(s), n = d.length; let k = 0; for (let i = 0; i < n; i += 1) if (d[i] > d[(i + n - 1) % n] && d[i] >= d[(i + 1) % n]) k += 1; return k; };
// ...and how many dents (places where the outline curves inward; a circle or an oval has none).
const dents = (s: Poly) => {
  const P = s.points, n = P.length / 2;
  const turn = Math.sign(area2(s)), dent = Array.from({ length: n }, (_, i) => {
    const a = (i + n - 1) % n, b = (i + 1) % n, cross = (P[2 * i] - P[2 * a]) * (P[2 * b + 1] - P[2 * i + 1]) - (P[2 * i + 1] - P[2 * a + 1]) * (P[2 * b] - P[2 * i]);
    return Math.sign(cross) === -turn && Math.abs(cross) > 1e-6;
  });
  return dent.filter((d, i) => d && !dent[(i + n - 1) % n]).length;
};
const wavy = (s: Poly) => bulges(s) >= 3 || dents(s) >= 2;
const insidePoly = (p: Point, pts: number[]) => {
  let inside = false;
  for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
    const [xi, yi, xj, yj] = [pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1]];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// How many separate pieces (shapes that overlap are one piece).
const touch = (a: Poly, b: Poly) => {
  for (let i = 0; i < a.points.length; i += 2) if (insidePoly({ x: a.points[i], y: a.points[i + 1] }, b.points)) return true;
  for (let i = 0; i < b.points.length; i += 2) if (insidePoly({ x: b.points[i], y: b.points[i + 1] }, a.points)) return true;
  return false;
};
const pieces = (ps: Poly[]) => {
  const parent = ps.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ps.length; i += 1) for (let j = i + 1; j < ps.length; j += 1) if (touch(ps[i], ps[j])) parent[find(i)] = find(j);
  return new Set(ps.map((_, i) => find(i))).size;
};
const SOURCE = { x: 950, y: GROUND };
const HIP = { x: 950, y: GROUND - 0.5 * H };
const CASES: { id: string; at: Point; dur: number; params?: EffectParams }[] = [
  { id: "smoke", at: SOURCE, dur: 3 },
  { id: "smoke", at: { x: 950, y: GROUND - 20 }, dur: 2, params: { direction: 0, spread: 60, turbulence: 1, intensity: 2, size: 0.3 } },
  { id: "smokeBurst", at: HIP, dur: 1.4 },
  { id: "smokeBurst", at: { x: 950, y: GROUND - 10 }, dur: 1, params: { size: 1, intensity: 2 } },
];

test("smoke: the two recipes, by these exact ids, registered in the effects list", () => {
  assert.deepEqual(RECIPES.map((r) => r.id), ["smoke", "smokeBurst"]);
  for (const r of RECIPES) assert.equal(EFFECTS[r.id], r);
});

test("smoke is deterministic: same moment + knobs = same shapes, at 8, 12 or 24 fps", () => {
  for (const c of CASES) for (const t of [0, 0.12, 0.5, 1.1, c.dur - 0.05]) {
    const a = draw(c.id, ctx(t, c.dur, c.at, { fps: 8 }), c.params), b = draw(c.id, ctx(t, c.dur, c.at, { fps: 24 }), c.params);
    assert.deepEqual(a, b, `${c.id} @${t}`);
    assert.ok(circles(a).every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && s.r >= 0), `${c.id} @${t} finite`);
  }
});

test("nothing below the ground", () => {
  for (const c of CASES) for (let t = 0; t <= c.dur; t += 1 / 24) {
    for (const s of draw(c.id, ctx(t, c.dur, c.at), c.params)) {
      if (s.kind === "circle") assert.ok(s.y + s.r <= GROUND + 1e-6, `${c.id} @${t.toFixed(2)}`);
      else if (s.kind !== "rect" && s.kind !== "symbol") for (let i = 1; i < s.points.length; i += 2) assert.ok(s.points[i] <= GROUND + 1e-6, `${c.id} @${t.toFixed(2)}`);
    }
  }
});

test("smoke rises, widens and gets lighter as it goes up; it builds up from nothing", () => {
  const ps = polys(draw("smoke", ctx(1.8, 3, SOURCE)));
  const mean = ps.reduce((a, s) => a + centroid(s).y, 0) / ps.length;
  assert.ok(mean < SOURCE.y - 0.3 * H, `the smoke is above its source (${mean})`);
  const byHeight = [...ps].sort((p, q) => centroid(p).y - centroid(q).y), high = byHeight.slice(0, 3), low = byHeight.slice(-3);
  assert.ok(centroid(high[2]).y < SOURCE.y - 0.8 * H && centroid(low[0]).y > SOURCE.y - 0.8 * H, "it reaches up high");
  const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(avg(high.map(halfWidth)) > avg(low.map(halfWidth)), "wider up high");
  assert.ok(avg(high.map((s) => rgb(s.fill!)[0])) > avg(low.map((s) => rgb(s.fill!)[0])), "lighter up high");
  const amount = (t: number) => polys(draw("smoke", ctx(t, 3, SOURCE))).reduce((a, s) => a + area(s) * (s.alpha ?? 1), 0);
  assert.ok(amount(0) === 0 && amount(0.15) < amount(0.5) && amount(0.5) < amount(1.5), "build-up");
});

test("smoke breaks apart: a puff cloud is one piece, then it tears into separate wisps (not dust)", () => {
  const solid = (ps: Poly[]) => ps.filter((s) => (s.alpha ?? 1) > 0.05);
  const burstEarly = solid(polys(draw("smokeBurst", ctx(0.25, 1.4, HIP))));
  const burstLate = solid(polys(draw("smokeBurst", ctx(1.1, 1.4, HIP))));
  assert.equal(pieces(burstEarly), 1, "one cloud");
  assert.ok(pieces(burstLate) >= 4 && burstLate.length <= 16, `broken apart into ${pieces(burstLate)} pieces (${burstLate.length} shapes)`);
  assert.ok(Math.min(...burstLate.map(halfWidth)) > 0.08 * H, "the wisps are still bold shapes, not dots");
  for (const t of [2, 2.2, 2.4]) {
    const top = solid(polys(draw("smoke", ctx(t, 3, SOURCE)))).filter((s) => centroid(s).y < SOURCE.y - 1.1 * H);
    assert.ok(pieces(top) >= 2, `smoke @${t}: the top of the smoke has torn into wisps (${pieces(top)})`);
  }
});

test("SMOKE IS NOT CLOUDS: wavy many-point outlines that change every picture, rising and fading by a certain height, about 6–40 shapes a picture", () => {
  // drawable by hand: 6–40 flat shapes, each a wavy outline of many points (not circles, not plain ovals)
  for (const c of CASES) for (let t = 0; t <= c.dur; t += 1 / 12) {
    const shapes = draw(c.id, ctx(t, c.dur, c.at), c.params);
    assert.ok(shapes.length <= 40, `${c.id} @${t.toFixed(2)}: ${shapes.length} shapes`);
    assert.ok(shapes.every((s) => s.kind === "poly" || s.kind === "line"), "only wavy shapes (and the burst's few poof lines)");
    for (const s of polys(shapes)) {
      assert.ok(s.fill && !s.stroke && s.points.length >= 2 * 20, `${c.id} @${t.toFixed(2)}: one flat fill, a many-point outline (${s.points.length / 2})`);
      assert.ok(wavy(s), `${c.id} @${t.toFixed(2)}: a wavy outline (${bulges(s)} bulges, ${dents(s)} dents)`);
    }
  }
  const count = (id: string, t: number, dur: number, at: Point) => draw(id, ctx(t, dur, at)).length;
  for (let t = 0.9; t <= 2; t += 1 / 12) assert.ok(count("smoke", t, 3, SOURCE) >= 6, `smoke @${t.toFixed(2)}: a lot of smoke once it is going`);
  for (let t = 0; t <= 1.2; t += 1 / 12) assert.ok(count("smokeBurst", t, 1.4, HIP) >= 6, `smokeBurst @${t.toFixed(2)}`);
  // the outlines change from one picture to the next (not one stamp moved about): while the poof hangs there...
  const [b1, b2] = [0.3, 0.3 + 1 / 12].map((t) => polys(draw("smokeBurst", ctx(t, 1.4, HIP))));
  assert.equal(b1.length, b2.length);
  b1.forEach((s, i) => {
    const d = shapeChange(s, b2[i]);
    assert.ok(Math.hypot(centroid(s).x - centroid(b2[i]).x, centroid(s).y - centroid(b2[i]).y) < 0.05 * H && d > 0.01, `burst piece ${i} changes its outline (${d.toFixed(3)})`);
  });
  // ...and in the rising smoke
  const [s1, s2] = [1.5, 1.5 + 1 / 12].map((t) => polys(draw("smoke", ctx(t, 3, SOURCE))));
  let matched = 0, changed = 0;
  const gap = (p: Poly, q: Poly) => Math.hypot(centroid(p).x - centroid(q).x, centroid(p).y - centroid(q).y);
  for (const s of s1) {
    const twin = s2.filter((q) => area(q) > 0.7 * area(s) && area(q) < 1.4 * area(s)).sort((p, q) => gap(p, s) - gap(q, s))[0];
    if (!twin || gap(twin, s) > 0.12 * H) continue;
    matched += 1;
    if (shapeChange(s, twin) > 0.01) changed += 1;
  }
  assert.ok(matched >= 4 && changed >= matched * 0.75, `smoke outlines change every picture (${changed}/${matched})`);
  // it rises and fades with height: higher pieces are lighter and more see-through, and it is gone by a certain height
  const ps = polys(draw("smoke", ctx(1.9, 3, SOURCE))), above = (s: Poly) => (SOURCE.y - centroid(s).y) / H;
  const high = ps.filter((s) => above(s) > 1.1), low = ps.filter((s) => above(s) < 0.7);
  assert.ok(high.length >= 2 && low.length >= 2);
  const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(avg(high.map((s) => s.alpha ?? 1)) < avg(low.map((s) => s.alpha ?? 1)), "more see-through up high");
  assert.ok(avg(high.map((s) => rgb(s.fill!)[0])) > avg(low.map((s) => rgb(s.fill!)[0])), "lighter up high");
  for (let t = 0; t <= 3; t += 1 / 12) for (const s of polys(draw("smoke", ctx(t, 3, SOURCE)))) {
    if (above(s) > 1.5) assert.ok((s.alpha ?? 1) < 0.85, `smoke @${t.toFixed(2)}: see-through up high`);
    if (above(s) > 2.1) assert.ok((s.alpha ?? 1) < 0.2, `smoke @${t.toFixed(2)}: faded out by about 2 body heights (${above(s).toFixed(2)})`);
  }
});

test("the dark and middle grays never sit at a fixed height: how high each reaches swings up and down over time", () => {
  for (const seed of [1, 5, 9]) for (const [fill, name] of [["#6b6b6b", "dark"], ["#9d9d9d", "middle"]]) {
    const tops: number[] = [];
    for (let t = 3; t <= 7; t += 1 / 12) {
      const top = polys(draw("smoke", ctx(t, 9, SOURCE), { seed })).filter((s) => s.fill === fill).flatMap(ys);
      if (top.length) tops.push((SOURCE.y - Math.min(...top)) / H);
    }
    const swing = Math.max(...tops) - Math.min(...tops);
    assert.ok(tops.length >= 45 && swing > 0.25, `seed ${seed}: the ${name} gray's top swings by ${swing.toFixed(2)} body heights`);
  }
});

test("smokeBurst hides a figure in under 0.2 s (about 0.6 x height round the hip), then thins away", () => {
  const covered = (ps: Poly[], p: Point) => ps.some((s) => (s.alpha ?? 1) > 0.6 && insidePoly(p, s.points));
  const at18 = polys(draw("smokeBurst", ctx(0.18, 1.4, HIP)));
  for (const p of [HIP, { x: HIP.x, y: HIP.y - 0.45 * H }, { x: HIP.x + 0.08 * H, y: GROUND - 0.1 * H }, { x: HIP.x - 0.1 * H, y: HIP.y - 0.2 * H }]) assert.ok(covered(at18, p), `covers ${p.x},${p.y}`);
  const reachOf = (ps: Poly[]) => Math.max(...ps.flatMap((s) => Array.from({ length: s.points.length / 2 }, (_, i) => Math.hypot(s.points[2 * i] - HIP.x, s.points[2 * i + 1] - HIP.y))));
  const reach = reachOf(at18);
  assert.ok(reach >= 0.55 * H, `big enough (${reach})`);
  const reachEarly = reachOf(polys(draw("smokeBurst", ctx(0.02, 1.4, HIP))));
  assert.ok(reachEarly < reach * 0.6, "it bursts out (small at first)");
  assert.ok(draw("smokeBurst", ctx(1.39, 1.4, HIP)).every((s) => (s.alpha ?? 1) < 0.1), "thinned away at the end");
});

test("the color knobs: purple smoke is purple everywhere; default is gray", () => {
  for (const c of CASES) for (const t of [0.2, 0.9, c.dur - 0.1]) {
    for (const col of colors(draw(c.id, ctx(t, c.dur, c.at), { ...c.params, color: "#6a1fb0", color2: "#e2c6ff" }))) {
      const [r, g, b] = rgb(col);
      assert.ok(b > g && r > g, `${c.id} @${t}: ${col} is purple`);
    }
  }
  for (const col of colors(draw("smoke", ctx(1, 3, SOURCE)))) { const [r, g, b] = rgb(col); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 2, `${col} is gray`); }
});
