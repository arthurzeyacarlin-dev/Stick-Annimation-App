import assert from "node:assert/strict";
import { test } from "node:test";
import { makeSymbol, PLACED_SYMBOLS, placedSymbol, shapeBounds } from "../symbolMaker.ts";
import { CRACK_SECONDS, FALL_SECONDS, GROW_SECONDS, HIT_SECONDS, iceSpikeOutline, RECIPES, SHARD_STAGGER } from "./ice.ts";
import { ICE, ICE_DEEP } from "./iceCrystal.ts";
import { EFFECTS } from "./index.ts";
import type { EffectContext, EffectParams, Point, Shape } from "./types.ts";

// SPEC-0017 Phase 2C: ICE (Arthur 2026-10-06: "a stick figure lifts up his hand and an ice mountain appears, or he can
// throw ice crystals... a giant ice crystal is used like a water droplet — turn it into an ice symbol").

const H = 300, GROUND = 900;
const ctx = (t: number, duration: number, at: Point, target?: Point, fps = 12): EffectContext => ({ t, duration, fps, at, target, height: H, groundY: GROUND, stageWidth: 1920 });
const draw = (id: string, c: EffectContext, p: EffectParams = {}) => RECIPES.find((r) => r.id === id)!.draw(c, p);
type Sym = Extract<Shape, { kind: "symbol" }>;
const crystals = (shapes: Shape[]) => shapes.filter((s): s is Sym => s.kind === "symbol" && s.name === "Ice crystal");
// A spike's body: the glowing outlined polygon in the ice's dark edge color.
// Every spike is an "Ice spike" Library symbol placement; its outline on the stage (for where it stands and how tall).
const spikeSyms = (shapes: Shape[]) => shapes.filter((s): s is Sym => s.kind === "symbol" && s.name === "Ice spike");
const spikeBodies = (shapes: Shape[]) => spikeSyms(shapes).map((s) => ({ kind: "poly" as const, points: iceSpikeOutline(s) }));
// The falling pieces: Ice crystal chunks and Ice crumbs.
const crumbs = (shapes: Shape[]) => shapes.filter((s): s is Sym => s.kind === "symbol" && s.name === "Ice crumb");
const pieceSyms = (shapes: Shape[]) => [...crystals(shapes), ...crumbs(shapes)];
const ys = (s: { points: number[] }) => s.points.filter((_, i) => i % 2 === 1);
const xs = (s: { points: number[] }) => s.points.filter((_, i) => i % 2 === 0);
const tallOf = (s: { points: number[] }) => GROUND - Math.min(...ys(s));

// The ice mountain in the scene: a row from in front of the caster (x 700) to the target (x 1300); it reaches the
// target after 0.4 s, cracks at 1.6 s, shatters at 1.85 s, and its pieces are gone by the end.
const ROW = { at: { x: 700, y: GROUND }, target: { x: 1300, y: GROUND }, dur: 1.85 + FALL_SECONDS, params: { reach: 0.4, crack: 1.6, shatter: 1.85 } };
const row = (t: number, fps = 12) => draw("iceSpikes", ctx(t, ROW.dur, ROW.at, ROW.target, fps), ROW.params);

test("ice: the two recipes, by these ids, registered in the effects list", () => {
  assert.deepEqual(RECIPES.map((r) => r.id), ["iceSpikes", "iceShards"]);
  for (const r of RECIPES) { assert.equal(EFFECTS[r.id], r); assert.ok(r.about.length > 40, `${r.id} has a lesson line`); }
});

test("the Ice crystal is a Library symbol made like the Water droplet: a faceted shard in light blues and white, recolored by the knobs", () => {
  assert.deepEqual(PLACED_SYMBOLS["Ice crystal"], { kind: "crystal", size: 60 });
  const made = placedSymbol({ name: "Ice crystal" });
  assert.equal(made.name, "Ice crystal");
  const b = shapeBounds(made.shapes);
  assert.ok(b.minX >= -1e-6 && b.minY >= -1e-6 && b.maxX <= made.width + 1e-6 && b.maxY <= made.height + 1e-6, "inside its box");
  assert.ok(made.height === 60 && made.width < made.height, "a tall shard, point up");
  // DRAWABLE BY HAND, NOT TOO SIMPLE: a few flat faces, an outline, facet lines and a white highlight.
  const fills = made.shapes.flatMap((s) => ("fill" in s && s.fill ? [s.fill] : []));
  assert.ok(made.shapes.length >= 5 && made.shapes.length <= 10, `${made.shapes.length} shapes`);
  assert.ok(new Set(fills).size >= 3, "several flat blues");
  assert.ok(made.shapes.some((s) => s.kind === "line" && s.stroke === "#ffffff"), "a white highlight");
  assert.ok(made.shapes.some((s) => "stroke" in s && s.stroke === ICE_DEEP), "a dark outline");
  // "Ice crystal" also comes from its name, and a color knob recolors it.
  assert.deepEqual(makeSymbol({ name: "Ice crystal", size: 60 }).shapes, made.shapes);
  assert.notDeepEqual(placedSymbol({ name: "Ice crystal", color: "#b388ff" }).shapes, made.shapes);
});

test("ice is the same at 8, 12 and 24 fps: the same moment and knobs give the same shapes; nothing below the ground", () => {
  const cases: [string, Point, Point | undefined, number, EffectParams][] = [
    ["iceSpikes", ROW.at, ROW.target, ROW.dur, ROW.params],
    ["iceSpikes", { x: 960, y: GROUND }, undefined, 2.5, { size: 1.2, color: "#9be7ff" }],
    ["iceShards", { x: 700, y: 700 }, { x: 1250, y: 690 }, 1.5, {}],
    ["iceShards", { x: 700, y: 700 }, { x: 1300, y: GROUND }, 1.5, { count: 4, color: "#c4f1ff" }],
  ];
  for (const [id, at, target, dur, params] of cases) for (let t = 0; t <= dur + 1e-9; t += 1 / 24) {
    const a = draw(id, ctx(t, dur, at, target, 8), params), b = draw(id, ctx(t, dur, at, target, 24), params);
    assert.deepEqual(a, b, `${id} @${t.toFixed(2)}`);
    for (const s of a) {
      if (s.kind === "circle") assert.ok(s.y + s.r <= GROUND + 1e-6);
      else if (s.kind === "symbol") assert.ok(s.y <= GROUND, `${id}: a crystal below the ground @${t.toFixed(2)}`);
      else if (s.kind !== "rect") for (let i = 1; i < s.points.length; i += 2) assert.ok(s.points[i] <= GROUND + 1e-6, `${id} ${s.kind} below the ground @${t.toFixed(2)}`);
    }
  }
});

test("ICE MOUNTAIN: spikes grow straight up out of the ground, small to big, near to far, with a little overshoot", () => {
  // Nothing before the start; the first spike is the one near the caster, and it is small.
  assert.equal(spikeBodies(row(0)).length, 0);
  const first = spikeBodies(row(0.05));
  assert.equal(first.length, 1, "one spike so far");
  assert.ok(Math.abs((Math.min(...xs(first[0])) + Math.max(...xs(first[0]))) / 2 - 700) < 0.15 * H, "next to the caster");
  // Every spike stands ON the ground (its base on the ground line, never below it).
  for (const t of [0.1, 0.3, 0.6, 1.2]) for (const s of spikeBodies(row(t))) assert.ok(GROUND - Math.max(...ys(s)) <= 0.01 * H, `based on the ground @${t}`); // (its outline sits on it)
  // The row runs to the target: more and more spikes, the far ones the biggest ("from least to biggest").
  const counts = [0.05, 0.15, 0.25, 0.35, 0.45].map((t) => spikeBodies(row(t)).length);
  for (let i = 1; i < counts.length; i += 1) assert.ok(counts[i] >= counts[i - 1], `spikes keep coming (${counts})`);
  const up = spikeBodies(row(1));
  const byX = [...up].sort((a, b) => Math.min(...xs(a)) - Math.min(...xs(b)));
  assert.ok(tallOf(byX[0]) < 0.4 * H && Math.max(...up.map(tallOf)) > 0.75 * H, "small near the caster, big at the target");
  const biggest = up.reduce((a, b) => (tallOf(a) > tallOf(b) ? a : b));
  assert.ok(Math.abs(Math.max(...xs(biggest)) - 1300) < 0.3 * H, "the biggest is at the target");
  // One spike grows bigger over time (quickly), overshoots a little, then settles.
  const tallest = (t: number) => Math.max(...spikeBodies(row(t)).map(tallOf));
  const born = 0.4; // (the last spike)
  const grow = [0, 0.25, 0.5, 0.75].map((u) => tallest(born + 0.001 + u * GROW_SECONDS));
  for (let i = 1; i < grow.length; i += 1) assert.ok(grow[i] > grow[i - 1], `it grows (${grow.map((v) => v.toFixed(0))})`);
  // (growing is the placement scaling up: the same "Ice spike", bigger)
  const scales = [0, 0.5, 1].map((u) => Math.max(...spikeSyms(row(born + 0.001 + u * GROW_SECONDS * 0.75)).map((x) => x.scale ?? 1)));
  assert.ok(scales[0] < scales[1] && scales[1] < scales[2], "its scale grows");
  const peak = Math.max(...Array.from({ length: 40 }, (_, i) => tallest(born + (i / 40) * 0.6)));
  assert.ok(peak > tallest(1.2) * 1.02 && peak < tallest(1.2) * 1.15, "a little overshoot");
  // It holds still while it stands.
  assert.deepEqual(spikeBodies(row(1)), spikeBodies(row(1.4)));
});

test("ICE MOUNTAIN: holds, cracks, then shatters into Ice crystal pieces that fall and fade, with frost mist", () => {
  const cracks = (shapes: Shape[]) => shapes.filter((s) => s.kind === "line" && s.stroke === ICE_DEEP);
  assert.equal(cracks(row(1.4)).length, 0, "no cracks while it holds");
  assert.ok(cracks(row(1.6 + CRACK_SECONDS * 0.6)).length >= 2, "cracks before it shatters");
  assert.equal(pieceSyms(row(1.8)).length, 0, "no pieces before the shatter");
  const after = row(1.95);
  assert.equal(spikeBodies(after).length, 0, "the spikes are gone");
  const pieces = pieceSyms(after);
  assert.ok(pieces.length >= 8 && pieces.length <= 40, `a handful of pieces (${pieces.length}), never hundreds`);
  assert.ok(crystals(after).length >= 2 && crumbs(after).length >= 6, "big chunks are Ice crystals, the little bits Ice crumbs");
  // Mist: pale wavy shapes (no symbol, no outline).
  assert.ok(after.some((s) => s.kind === "poly" && !s.stroke && (s.alpha ?? 1) < 1 && s.points.length >= 40), "frost mist");
  // The pieces fall to the ground and fade, and are gone by the end.
  const later = pieceSyms(row(1.85 + 0.6));
  assert.ok(later.length > 0 && later.every((s) => (s.alpha ?? 1) < 1), "fading");
  const lowest = (shapes: Sym[]) => shapes.reduce((sum, s) => sum + s.y, 0) / shapes.length;
  assert.ok(lowest(later) > lowest(pieces), "they fall");
  assert.equal(pieceSyms(row(ROW.dur)).length, 0, "gone at the end");
});

test("ICE MOUNTAIN with no target: one mountain at the anchor, the small outer spikes first and the biggest in the middle last", () => {
  const c = (t: number) => draw("iceSpikes", ctx(t, 2.5, { x: 960, y: GROUND }), {});
  const early = spikeBodies(c(0.02)), all = spikeBodies(c(1));
  assert.ok(early.length >= 1 && all.length >= 5, `${early.length} → ${all.length} spikes`);
  assert.ok(Math.max(...early.map(tallOf)) < 0.6 * Math.max(...all.map(tallOf)) && Math.max(...all.map(tallOf)) > 0.8 * H, "small first, big last");
  const middle = all.reduce((a, b) => (tallOf(a) > tallOf(b) ? a : b));
  assert.ok(Math.abs((Math.min(...xs(middle)) + Math.max(...xs(middle))) / 2 - 960) < 0.2 * H, "the biggest in the middle");
});

test("THROWN CRYSTALS: Ice crystal symbols fly from the hand to the target, spinning, and shatter after the hit", () => {
  const hand = { x: 700, y: 700 }, target = { x: 1250, y: 690 }, travel = 0.35;
  const shards = (t: number) => draw("iceShards", ctx(t, 1.6, hand, target), { travel });
  // Right after the release: one crystal, at the hand; it travels toward the target.
  const c0 = crystals(shards(0.01));
  assert.equal(c0.length, 1);
  assert.ok(Math.hypot(c0[0].x - hand.x, c0[0].y - hand.y) < 0.1 * H, "leaves the hand");
  const path = [0.05, 0.15, 0.25, 0.33].map((t) => crystals(shards(t))[0]);
  for (let i = 1; i < path.length; i += 1) assert.ok(path[i].x > path[i - 1].x, "flies toward the target");
  assert.ok(Math.hypot(path[3].x - target.x, path[3].y - target.y) < 0.2 * H, "arrives at the target"); // (the three are spread a little up and down)
  assert.ok(new Set(path.map((s) => Math.round(s.rotation ?? 0))).size === path.length, "spinning");
  assert.equal(crystals(shards(0.2)).length, 3, "three crystals, a moment apart");
  // After the hit: the big crystal is gone; small pieces bounce back off the hit (toward the thrower) and fall.
  const hitT = travel + 0.02;
  const firstPieces = crumbs(shards(hitT));
  assert.ok(firstPieces.length >= 2, "pieces at the hit");
  for (const s of firstPieces) assert.ok(Math.hypot(s.x - target.x, s.y - target.y) < 0.2 * H, "where it hit");
  const piecesLater = crumbs(shards(travel + 0.3));
  assert.ok(piecesLater.some((s) => s.x < target.x - 0.05 * H) && piecesLater.some((s) => s.y > target.y), "back toward the thrower, and down");
  // A frost streak behind each flying crystal, and an icy crack-star on the hit.
  assert.ok(shards(0.15).some((s) => s.kind === "poly" && (s.alpha ?? 1) < 1), "frost streak");
  assert.ok(shards(hitT).some((s) => s.kind === "line" && (s.glow ?? 0) > 0), "crack-star");
  // All gone a moment after the last hit.
  assert.equal(pieceSyms(shards(travel + 2 * SHARD_STAGGER + HIT_SECONDS + 0.01)).length, 0);
});

test("THROWN CRYSTALS at the ground: a thin cold light on the ground at the hit (groundLight, about 0.02 x height thick)", () => {
  const onGround = draw("iceShards", ctx(0.4, 1.5, { x: 700, y: 700 }, { x: 1300, y: GROUND }), { travel: 0.35 });
  const light = onGround.filter((s) => s.kind === "poly" && (s.glow ?? 0) > 0 && Math.max(...ys(s)) >= GROUND - 1e-6);
  assert.ok(light.length > 0, "light on the ground");
  for (const s of light) assert.ok(GROUND - Math.min(...ys(s as Extract<Shape, { kind: "poly" }>)) <= 0.021 * H + 1e-6, "thin");
  const high = draw("iceShards", ctx(0.4, 1.5, { x: 700, y: 700 }, { x: 1250, y: 690 }), { travel: 0.35 });
  assert.ok(!high.some((s) => s.kind === "poly" && Math.min(...ys(s)) >= GROUND - 0.03 * H), "no ground light for a hit up in the air");
});

test("DRAWABLE BY HAND, NOT TOO SIMPLE: layered light blues with facet lines and a little glow; never hundreds of pieces", () => {
  for (let t = 0; t <= ROW.dur; t += 1 / 12) {
    const shapes = row(t);
    assert.ok(shapes.length <= 110, `${shapes.length} shapes @${t.toFixed(2)}`);
  }
  // The "Ice spike" symbol: a jagged outline (shelves down the sides), a lit face, ridge and facet lines, a white highlight.
  const spike = placedSymbol({ name: "Ice spike" });
  const outline = spike.shapes.find((s) => s.kind === "poly" && s.stroke === ICE_DEEP && !s.fill);
  assert.ok(outline && outline.kind === "poly" && outline.points.length >= 2 * 9, "jagged outline, not a plain triangle");
  assert.ok(new Set(spike.shapes.flatMap((s) => ("fill" in s && s.fill ? [s.fill] : []))).size >= 2, "a lit face and the ice");
  assert.ok(spike.shapes.filter((s) => s.kind === "line").length >= 3 && spike.shapes.some((s) => s.kind === "line" && s.stroke === "#ffffff"), "facet lines and a white highlight");
  // The row is varied: different sizes, slight turns, and some flipped.
  const standing = spikeSyms(row(1));
  assert.ok(new Set(standing.map((s) => (s.scale ?? 1).toFixed(2))).size >= standing.length - 1, "different sizes");
  assert.ok(standing.some((s) => s.flipX) && standing.some((s) => !s.flipX), "some flipped");
  assert.ok(standing.every((s) => Math.abs(s.rotation ?? 0) <= 3) && standing.some((s) => Math.abs(s.rotation ?? 0) > 0.3), "slightly turned");
  for (let t = 0; t <= 1.6; t += 1 / 12) assert.ok(draw("iceShards", ctx(t, 1.6, { x: 700, y: 700 }, { x: 1250, y: 690 }), { travel: 0.35 }).length <= 40);
  // The default ice colors are light blues.
  assert.equal(ICE, "#86cdf3");
});

test("the Ice spike and the Ice crumb are Library symbols too (STILL THINGS ARE SYMBOLS), inside their boxes; a spike never goes below the ground", () => {
  assert.deepEqual(PLACED_SYMBOLS["Ice spike"], { kind: "icespike", size: 100 });
  assert.deepEqual(PLACED_SYMBOLS["Ice crumb"], { kind: "icecrumb", size: 24 });
  for (const name of ["Ice spike", "Ice crumb"]) {
    const made = placedSymbol({ name });
    const b = shapeBounds(made.shapes);
    assert.equal(made.name, name);
    assert.ok(b.minX >= -1e-6 && b.minY >= -1e-6 && b.maxX <= made.width + 1e-6 && b.maxY <= made.height + 1e-6, `${name} inside its box`);
    assert.notDeepEqual(placedSymbol({ name, color: "#b388ff" }).shapes, made.shapes, `${name} recolors`);
  }
  // Every placed spike (turned, flipped, growing) stands on the ground: its outline never goes below it, and its base
  // is on it.
  for (const params of [ROW.params, { ...ROW.params, shape: "mountain" }]) for (let t = 0; t <= 1.8; t += 1 / 24) {
    for (const s of spikeSyms(draw("iceSpikes", ctx(t, ROW.dur, ROW.at, ROW.target), params))) {
      const yy = ys({ points: iceSpikeOutline(s) });
      assert.ok(Math.max(...yy) <= GROUND + 1e-6 && Math.max(...yy) >= GROUND - 0.012 * H, `on the ground @${t.toFixed(2)}`);
    }
  }
});
