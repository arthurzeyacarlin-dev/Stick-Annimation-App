// AN IMPACT IS BIGGER THAN WHAT MADE IT (Arthur, 2026-10-08, the power card "throws a spinning ball of purple energy
// that bursts into stars": "the explosion alone is literally smaller than the ball").
import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { planToScene, type ScenePlan } from "../moves/plan.ts";
import { LIBRARY } from "../moves/library.ts";
import { buildEffectFrames, objectLanding, IMPACT_REACH } from "./index.ts";
import type { EffectTrack, Shape } from "./types.ts";

const G = 900;
// Luna's real plan: a 45 px purple energy ball with a glow on it, and star sparks (size 0.5) where it lands.
const luna = (ball: number, burst: Record<string, unknown> = { burst: true, stars: true, color: "#D98BFF", size: 0.5 }) => ({
  id: "p", title: "t", height: 300, groundY: G, stageWidth: 1920,
  objects: [{ id: "energyBall", look: { kind: "ball", size: ball, color: "#9B30FF", filled: true, detail: "plain" }, heldBy: "thrower" }],
  characters: [{ id: "thrower", x: 500, facing: "right", actions: [{ move: "throw", params: { object: "energyBall", distance: 700, overhand: true } }] }],
  effects: [{ kind: "glow", start: 0, end: 3.5, anchor: { object: "energyBall" }, params: { color: "#9B30FF", size: 0.3 }, layer: "front" },
    { kind: "sparks", start: 2.4, end: 3.5, anchor: { object: "energyBall", landing: true }, params: burst, layer: "front" }],
}) as unknown as ScenePlan;

// The burst's pictures at 12 fps: the widest spread of its clearly seen stars, and the stars themselves.
function burst(ball: number, params?: Record<string, unknown>) {
  const scene = planToScene(luna(ball, params), LIBRARY), built = buildScene(scene, 12);
  const fx = buildEffectFrames(scene, built), land = objectLanding(built, "energyBall", G)!;
  const first = Math.ceil(land.t * 12 - 1e-6);
  let widest = 0;
  const stars: { r: number; alpha: number }[] = [];
  let flash = 0;
  for (let i = first + 1; i < Math.min(fx.length, first + 8); i += 1) {
    for (const s of fx[i].front as Shape[]) {
      if (s.kind !== "poly" || (s.alpha ?? 1) < 0.2) continue;
      const xs = s.points.filter((_, j) => j % 2 === 0), ys = s.points.filter((_, j) => j % 2 === 1);
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
      const r = Math.max(...xs.map((x, j) => Math.hypot(x - cx, ys[j] - cy)));
      if (s.points.length === 20) { stars.push({ r, alpha: s.alpha ?? 1 }); widest = Math.max(widest, Math.hypot(cx - land.x, cy - land.y)); }
      else if (i === first + 1) flash = Math.max(flash, Math.max(...xs) - land.x); // (the flash dome on the floor)
    }
  }
  const track = (scene as { effects?: EffectTrack[] }).effects!.find((e) => e.kind === "sparks")!;
  return { widest, stars, flash, size: track.params!.size as number };
}

test("Luna's power ball (45 px, star sparks size 0.5, figure 300 tall): the burst spreads ≥ 3× the ball's radius and its stars are clearly seen", () => {
  const b = burst(45), radius = 22.5;
  assert.ok(b.widest >= 3 * radius, `widest spread ${b.widest.toFixed(0)} px vs ball radius ${radius}`);
  assert.ok(b.size > 0.5, `the plan's size 0.5 was raised (${b.size.toFixed(2)})`);
  assert.ok(b.flash > radius, `the flash right after the landing (${b.flash.toFixed(0)} px) is bigger than the ball`);
  const seen = b.stars.filter((s) => s.alpha >= 0.5);
  assert.ok(seen.length >= 20, `plenty of bright stars over the burst (${seen.length})`);
  assert.ok(seen.every((s) => s.r >= 0.3 * radius), `each star is big enough to read (smallest ${Math.min(...seen.map((s) => s.r)).toFixed(1)} px)`);
  assert.ok(IMPACT_REACH >= 3);
});

test("a bigger ball makes a bigger burst; a burst already big enough is never made smaller", () => {
  const small = burst(45), big = burst(90);
  assert.ok(big.widest > small.widest * 1.5, `ball 90: ${big.widest.toFixed(0)} px vs ball 45: ${small.widest.toFixed(0)} px`);
  assert.ok(big.widest >= 3 * 45);
  assert.equal(burst(45, { burst: true, stars: true, color: "#D98BFF", size: 2 }).size, 2);
});

test("a wide star burst on the floor sprays up — none of it is lost under the ground", () => {
  const b = burst(45);
  const perPicture = b.stars.length / 7;
  assert.ok(perPicture >= 9, `about all 16 stars show, not half (${perPicture.toFixed(1)} a picture)`);
});
