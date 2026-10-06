import assert from "node:assert/strict";
import { test } from "node:test";
import { PLACED_SYMBOLS } from "../symbolMaker.ts";
import { clashU, RECIPES, STEAM_GRAY, STEAM_LIGHT } from "./clash.ts";
import { EFFECTS } from "./index.ts";
import type { EffectContext, EffectParams, Point, Shape } from "./types.ts";

// SPEC-0017 Phase 2C extras (ELEMENTAL FIGHTS): where elements meet — the clash, ice cracking, ice shattering.

const H = 300, GROUND = 900;
const ctx = (t: number, duration: number, at: Point, target?: Point, fps = 12): EffectContext => ({ t, duration, fps, at, target, height: H, groundY: GROUND, stageWidth: 1920 });
const draw = (id: string, c: EffectContext, p: EffectParams = {}) => RECIPES.find((r) => r.id === id)!.draw(c, p);
const points = (shapes: Shape[]): Point[] => shapes.flatMap((s) => (s.kind === "circle" || s.kind === "rect" || s.kind === "symbol" ? [{ x: s.x, y: s.y }] : Array.from({ length: s.points.length / 2 }, (_, i) => ({ x: s.points[2 * i], y: s.points[2 * i + 1] }))));
const EYES = { x: 700, y: GROUND - 0.9 * H }, HANDS = { x: 1250, y: GROUND - 0.7 * H };
const PUSH = [0, 0.5, 0.12, 0.5, 0.5, 0.6, 0.8, 0.4, 1.1, 0.5, 1.3, 0.78];
const CLASH: EffectParams = { left: "laser", right: "ice", push: PUSH, reach: 0.12, cut: 1.3, burst: 1.66, burstX: 1130, burstY: GROUND - 0.75 * H, seed: 4 };
const CASES: { id: string; dur: number; at: Point; target?: Point; params: EffectParams }[] = [
  { id: "clash", dur: 3.2, at: EYES, target: HANDS, params: CLASH },
  { id: "clash", dur: 2.6, at: { x: 600, y: GROUND - 0.7 * H }, target: HANDS, params: { left: "fire", right: "water", push: [0, 0.5, 1, 0.3], burst: 1.2, seed: 2 } },
  { id: "iceStream", dur: 1.2, at: HANDS, target: EYES, params: { reach: 0.2 } },
  { id: "iceCracks", dur: 0.6, at: { x: 1100, y: GROUND - 0.6 * H }, params: { direction: 180, seed: 3 } },
  { id: "iceShatter", dur: 1.2, at: { x: 1100, y: GROUND }, params: { size: 0.35, tall: 1, direction: -60, seed: 5 } },
  { id: "iceShatter", dur: 0.8, at: { x: 1000, y: GROUND - 0.7 * H }, params: { size: 0.07, count: 6 } },
];

test("clash recipes: by these ids, registered in the effects list", () => {
  assert.deepEqual(RECIPES.map((r) => r.id), ["clash", "iceStream", "iceCracks", "iceShatter"]);
  for (const r of RECIPES) assert.equal(EFFECTS[r.id], r, r.id);
});

test("the same moment gives the same shapes at 8, 12 and 24 fps; finite; nothing below the ground", () => {
  for (const c of CASES) for (let t = 0; t <= c.dur; t += 1 / 24) {
    const a = draw(c.id, ctx(t, c.dur, c.at, c.target, 8), c.params), b = draw(c.id, ctx(t, c.dur, c.at, c.target, 24), c.params);
    assert.deepEqual(a, b, `${c.id} @${t.toFixed(2)}`);
    for (const p of points(a)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${c.id} @${t.toFixed(2)} finite`);
    for (const s of a) {
      if (s.kind === "circle") assert.ok(s.y + s.r <= GROUND + 1e-6, `${c.id} circle @${t.toFixed(2)}`);
      else if (s.kind === "line" || s.kind === "poly") for (let i = 1; i < s.points.length; i += 2) assert.ok(s.points[i] <= GROUND + 1e-6, `${c.id} ${s.kind} @${t.toFixed(2)}`);
    }
  }
});

test("the clash point slides back and forth along the push, toward the weaker side, and bursts where they last met", () => {
  const us = Array.from({ length: 27 }, (_, i) => clashU(PUSH, i * 0.05, 4));
  assert.ok(Math.max(...us) - Math.min(...us) > 0.15, `it moves (${Math.min(...us).toFixed(2)}..${Math.max(...us).toFixed(2)})`);
  assert.ok(clashU(PUSH, 0.5, 4) > 0.57 && clashU(PUSH, 0.8, 4) < 0.43, "back and forth");
  assert.ok(clashU(PUSH, 1.3, 4) > 0.72, "the winner's push drives it most of the way to the other side");
  // While they push: the white-hot star sits on the line between the sources, at the push's point.
  const star = (shapes: Shape[]) => shapes.filter((s): s is Extract<Shape, { kind: "poly" }> => s.kind === "poly" && s.fill === "#ffffff");
  for (const t of [0.3, 0.6, 0.9]) {
    const pts = points(star(draw("clash", ctx(t, 3.2, EYES, HANDS), CLASH)));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, want = EYES.x + (HANDS.x - EYES.x) * clashU(PUSH, t, 4);
    assert.ok(Math.abs(cx - want) < 0.06 * H, `@${t}: clash point at ${cx.toFixed(0)}, push says ${want.toFixed(0)}`);
  }
  // The streams reach the point (no gap, no overshoot): the laser's beams end at it.
  // After the burst: no streams from the sources; the burst's shards and steam spread from the burst spot.
  const after = draw("clash", ctx(2.1, 3.2, EYES, HANDS), CLASH);
  const near = points(after).filter((p) => Math.abs(p.x - EYES.x) < 0.1 * H && Math.abs(p.y - EYES.y) < 0.1 * H);
  assert.equal(near.length, 0, "nothing at the laser's eyes after the burst");
  const steam = after.filter((s) => s.kind === "poly" && typeof s.fill === "string" && /^#(9c9c9c|[a-f0-9]{6})$/.test(s.fill) && s.fill !== "#ffffff");
  assert.ok(steam.length >= 5, "a cloud of steam after the burst");
  const shards = after.filter((s) => s.kind === "symbol" || (s.kind === "poly" && s.stroke !== undefined));
  assert.ok(shards.length >= 5, "ice shards thrown out");
});

test("steam is gray and light gray — never dark gray", () => {
  const gray = (c: string) => { const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v) < 8 ? v[0] : null; };
  for (const t of [0.4, 1.0, 1.8, 2.4]) for (const s of draw("clash", ctx(t, 3.2, EYES, HANDS), CLASH)) {
    if (s.kind !== "poly" || typeof s.fill !== "string" || !s.fill.startsWith("#") || s.fill.length !== 7) continue;
    const v = gray(s.fill);
    if (v !== null && v < 250) assert.ok(v >= parseInt(STEAM_GRAY.slice(1, 3), 16) - 1 && v <= parseInt(STEAM_LIGHT.slice(1, 3), 16) + 1, `steam ${s.fill} @${t}`);
  }
});

test("cracks grow over time; the shattered ice falls, lands and fades; pieces are Ice crystal symbols when the app has one", () => {
  const length = (shapes: Shape[]) => shapes.filter((s) => s.kind === "line").reduce((sum, s) => { let L = 0; const p = (s as { points: number[] }).points; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return sum + L; }, 0);
  const c = CASES[3];
  assert.ok(length(draw("iceCracks", ctx(0.45, c.dur, c.at), c.params)) > 1.5 * length(draw("iceCracks", ctx(0.12, c.dur, c.at), c.params)), "the cracks spread");
  const s = CASES[4];
  const lowest = (t: number) => Math.max(...points(draw("iceShatter", ctx(t, s.dur, s.at), s.params)).map((p) => p.y));
  assert.ok(lowest(0.9) >= GROUND - 0.06 * H, "pieces end up on the ground");
  assert.equal(draw("iceShatter", ctx(s.dur, s.dur, s.at), s.params).filter((x) => (x.alpha ?? 1) > 0.05 && x.kind === "symbol").length, 0, "and fade out by the end");
  const pieces = draw("iceShatter", ctx(0.3, s.dur, s.at), s.params);
  if (PLACED_SYMBOLS["Ice crystal"]) assert.ok(pieces.some((x) => x.kind === "symbol" && x.name === "Ice crystal"), "Ice crystal symbols");
});
