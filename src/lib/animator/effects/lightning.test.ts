import assert from "node:assert/strict";
import test from "node:test";
import { EFFECTS } from "./index.ts";
import { lightningPhases, RECIPES } from "./lightning.ts";
import type { EffectContext, EffectParams, Shape } from "./types.ts";

// LIGHTNING (SPEC-0017 Phase 2C): a bolt made by a rule (seeded midpoint displacement with branches), with a
// leader, a strike, re-strikes and a fade; sparks fly out and fall.

const GROUND = 900;
const ctxAt = (t: number, over: Partial<EffectContext> = {}): EffectContext => ({ t, duration: 1, fps: 24, at: { x: 900, y: GROUND }, target: { x: 1000, y: 700 }, height: 300, groundY: GROUND, stageWidth: 1920, ...over });
const bolt = (t: number, params: EffectParams = {}, over: Partial<EffectContext> = {}) => EFFECTS.lightning.draw(ctxAt(t, over), params);
const lines = (s: Shape[]) => s.filter((x): x is Extract<Shape, { kind: "line" }> => x.kind === "line");
const lowestY = (s: Shape[]) => Math.max(...lines(s).flatMap((l) => l.points.filter((_, i) => i % 2 === 1)));
const allY = (s: Shape[]) => s.flatMap((x) => (x.kind === "circle" ? [x.y + x.r] : x.kind === "rect" ? [x.y + x.h] : x.kind === "symbol" ? [x.y] : x.points.filter((_, i) => i % 2 === 1)));
const STRIKE = 0.15;

test("lightning: the ids are registered", () => {
  assert.deepEqual(RECIPES.map((r) => r.id), ["lightning", "sparks"]);
  assert.ok(EFFECTS.lightning && EFFECTS.sparks);
});

test("lightning: the same moment and knobs give the same shapes; a new seed gives a new bolt", () => {
  for (const t of [0.05, STRIKE, 0.3, 0.6]) assert.deepEqual(bolt(t, { seed: 4 }), bolt(t, { seed: 4 }));
  assert.notDeepEqual(bolt(STRIKE, { seed: 4 }), bolt(STRIKE, { seed: 5 }));
  // the same moment reached at a different frame rate is the same picture
  assert.deepEqual(bolt(0.25, { seed: 2 }, { fps: 8 }), bolt(0.25, { seed: 2 }, { fps: 24 }));
});

test("lightning: at the strike the bolt reaches the target (and the ground when there is no target)", () => {
  for (const seed of [1, 2, 3, 7]) {
    const s = lines(bolt(STRIKE, { seed }));
    const near = Math.min(...s.map((l) => Math.hypot(l.points[l.points.length - 2] - 1000, l.points[l.points.length - 1] - 700)));
    assert.ok(near <= 3, `seed ${seed}: the bolt ends ${near.toFixed(1)} px from the target`);
    // it comes from the top of the page
    assert.ok(Math.min(...s.map((l) => l.points[1])) <= 0, "it starts at the top of the page");
    const g = lines(bolt(STRIKE, { seed }, { target: undefined }));
    const ground = Math.min(...g.map((l) => Math.hypot(l.points[l.points.length - 2] - 900, l.points[l.points.length - 1] - GROUND)));
    assert.ok(ground <= 3, `seed ${seed}: the ground bolt ends ${ground.toFixed(1)} px from the anchor's ground`);
  }
});

test("lightning: it branches (more than one channel, the core drawn in white)", () => {
  for (const seed of [1, 2, 3]) {
    const cores = lines(bolt(STRIKE, { seed })).filter((l) => l.stroke === "#ffffff" && l.width >= 1 && l.points.length > 8);
    assert.ok(cores.length >= 3, `seed ${seed}: ${cores.length} channels`);
  }
});

test("lightning: the faint leader comes down first, then the bright strike, then re-strikes, then it fades", () => {
  const ph = lightningPhases(1, { seed: 1 });
  assert.ok(ph.leaderEnd > 0 && ph.leaderEnd <= ph.strikes[0][0]);
  const leader = bolt(0.05);
  const strike = bolt(STRIKE);
  assert.ok(lines(leader).length > 0, "a leader is drawn");
  assert.ok(lowestY(leader) < 700 - 20, "the leader has not reached the target yet");
  const maxW = (s: Shape[]) => Math.max(...lines(s).map((l) => l.width));
  const maxA = (s: Shape[]) => Math.max(...lines(s).filter((l) => l.points.length > 8).map((l) => l.alpha ?? 1)); // the bolt's channels (not the sparks)
  assert.ok(maxW(leader) < maxW(strike) / 2 && maxA(leader) < 0.6, "the leader is thin and faint");
  assert.ok(maxA(strike) >= 0.99, "the strike is bright");
  // the leader grows downward
  assert.ok(lowestY(bolt(0.02)) < lowestY(bolt(0.09)));
  // a re-strike: bright again, with a slightly different shape
  assert.ok(ph.strikes.length >= 2 && ph.strikes.length <= 3);
  const re = bolt((ph.strikes[1][0] + ph.strikes[1][1]) / 2);
  assert.ok(maxA(re) >= 0.85);
  assert.notDeepEqual(lines(re)[0].points, lines(strike)[0].points);
  // the gap between strikes is dim, and it is gone after the fade
  assert.ok(maxA(bolt((ph.strikes[0][1] + ph.strikes[1][0]) / 2)) < 0.5);
  assert.deepEqual(bolt(0.95), []);
});

test("lightning: the color knobs work (classic yellow-white default, purple only when asked, any core)", () => {
  const plain = lines(bolt(STRIKE));
  assert.ok(plain.some((l) => l.stroke === "#ffe14d") && plain.some((l) => l.stroke === "#ffffff"), "default: yellow glow, white core");
  assert.ok(!plain.some((l) => l.stroke === "#b48cff" || l.stroke === "#a64dff"), "default is not purple");
  const purple = lines(bolt(STRIKE, { color: "#a64dff" }));
  assert.ok(purple.some((l) => l.stroke === "#a64dff") && !purple.some((l) => l.stroke === "#ffe14d"), "purple when the color knob says so");
  assert.ok(lines(bolt(STRIKE, { color: "#8a2be2", color2: "#f0e0ff" })).some((l) => l.stroke === "#f0e0ff"));
});

test("lightning and sparks: nothing below the ground", () => {
  for (const t of [0, 0.05, STRIKE, 0.3, 0.5, 0.7]) {
    for (const over of [{}, { target: undefined }, { target: { x: 1000, y: GROUND } }]) {
      const ys = allY(bolt(t, { seed: 3 }, over));
      if (ys.length) assert.ok(Math.max(...ys) <= GROUND + 1e-6, `t ${t}: ${Math.max(...ys)}`);
    }
    const sp = allY(EFFECTS.sparks.draw(ctxAt(t, { at: { x: 900, y: GROUND - 20 } }), { seed: 2 }));
    if (sp.length) assert.ok(Math.max(...sp) <= GROUND + 1e-6);
  }
});

test("sparks: fly out of the anchor and fall; a burst stops, a stream keeps going", () => {
  const at = { x: 900, y: 600 };
  const sparks = (t: number, params: EffectParams = {}) => lines(EFFECTS.sparks.draw(ctxAt(t, { at, duration: 2 }), params));
  assert.deepEqual(sparks(0.3, { seed: 3 }), sparks(0.3, { seed: 3 }));
  const early = sparks(0.05, { burst: true, seed: 3 });
  assert.ok(early.length > 4, "a burst of sparks at the start");
  for (const l of early) assert.ok(Math.hypot(l.points[2] - at.x, l.points[3] - at.y) < 300 * 0.3, "they start near the anchor");
  // they fall: a spark's height drops later in its life (gravity)
  const mid = sparks(0.35, { burst: true, seed: 3 });
  const meanY = (s: typeof mid) => s.reduce((a, l) => a + l.points[3], 0) / s.length;
  assert.ok(meanY(mid) > meanY(sparks(0.12, { burst: true, seed: 3 })) - 1, "the sparks come down");
  assert.equal(sparks(1.5, { burst: true, seed: 3 }).length, 0, "a burst is over");
  assert.ok(sparks(1.5, { seed: 3 }).length > 0, "a stream keeps sparking");
  assert.ok(sparks(0.3, { color: "#b48cff" }).some((l) => l.stroke === "#b48cff"));
});
