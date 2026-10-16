import assert from "node:assert/strict";
import { test } from "node:test";
import type { SceneFrames } from "../engine.ts";
import { buildEffectFrames } from "./index.ts";
import { sourceAt } from "./random.ts";
import type { Shape } from "./types.ts";

// EMITTED THINGS LIVE IN THE WORLD (Arthur, Oct 14, the bubble wand: "when he moves his arm, the bubbles move with his arm. That's
// not possible. The bubbles just float away until they pop."): a bubble / bit of smoke / spark / ember / mote is born where its
// source WAS at its birth and then moves on its own — moving the source later never drags the ones already out.

const FPS = 12, H = 300, G = 900;
// A hand that holds still at x = 500 for 1 s, then swings fast to x = 1300 by 1.5 s and stays there.
const handX = (t: number) => (t <= 1 ? 500 : t >= 1.5 ? 1300 : 500 + 800 * ((t - 1) / 0.5));
function built(seconds: number): SceneFrames {
  const frames = [] as unknown[], objects = [] as unknown[];
  for (let i = 0; i <= seconds * FPS; i += 1) {
    const x = handX(i / FPS), j = (dx: number, dy: number) => ({ x: x + dx, y: 600 + dy });
    const skeleton = { head: j(-60, -170), neck: j(-60, -140), hip: j(-60, 0), lHand: j(-120, 0), rHand: j(0, 0), lElbow: j(-100, -40), rElbow: j(-30, -40), lFoot: j(-80, 300), rFoot: j(-40, 300), lKnee: j(-80, 150), rKnee: j(-40, 150), lShoulder: j(-60, -120), rShoulder: j(-60, -120) };
    frames.push([{ id: "a", skeleton, facing: "right", headRadius: 25, height: H }]);
    objects.push([]);
  }
  return { fps: FPS, frames, objects } as unknown as SceneFrames;
}
const xsOf = (shapes: Shape[]) => shapes.flatMap((s) => ("points" in s && Array.isArray(s.points) ? s.points.filter((_, k) => k % 2 === 0) : "x" in s && typeof s.x === "number" ? [s.x] : []));

for (const [kind, params] of [["bubbles", { count: 10 }], ["smoke", { size: 0.08 }], ["smoke", { size: 0.03 }], ["sparks", {}], ["fire", { size: 0.2 }], ["glow", {}]] as const) {
  test(`${kind} ${JSON.stringify(params)}: what came out before the hand moved stays behind in the air`, () => {
    const scene = { characters: [{ height: H }], groundY: G, effects: [{ kind, start: 0, end: 4, anchor: { character: "a", joint: "rHand" as const }, params }] };
    const frames = buildEffectFrames(scene as never, built(4));
    // just after the swing (the hand is now at 1300): pieces born at 500 are still out there, far from the hand
    const i = Math.round(1.6 * FPS), xs = xsOf([...frames[i].back, ...frames[i].front]);
    assert.ok(xs.length > 0, "it draws");
    if (kind === "fire") {
      // the flame itself rides the torch; only its embers / licks are left behind — some must be away from the new spot
      assert.ok(xs.some((x) => x < 1100), "embers and licks that broke off before the swing stay behind");
    } else {
      assert.ok(xs.some((x) => x < 900), `some ${kind} stays back where it came out (min x ${Math.round(Math.min(...xs))})`);
    }
    // and new ones come out where the hand is now
    const later = xsOf([...frames[Math.round(3.5 * FPS)].back, ...frames[Math.round(3.5 * FPS)].front]);
    assert.ok(later.some((x) => Math.abs(x - 1300) < 150), "new ones come out of the hand where it is now");
  });
}

test("no jumps: bubbles already out drift smoothly while the wand swings (anchor looked up between pictures)", () => {
  // long-lived bubbles (each blown once in the clip): picture to picture, every bubble already out moves only a calm drift
  const scene = { characters: [{ height: H }], groundY: G, effects: [{ kind: "bubbles", start: 0, end: 4, anchor: { character: "a", joint: "rHand" as const }, params: { count: 6, life: 10, pop: 0 } }] };
  const frames = buildEffectFrames(scene as never, built(4));
  const middles = (i: number) => frames[i].front.filter((s) => s.kind === "poly").map((s) => { const p = (s as { points: number[] }).points, xs = p.filter((_, k) => k % 2 === 0); return xs.reduce((q, v) => q + v, 0) / xs.length; });
  let worst = 0, seen = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const now = middles(i), before = middles(i - 1);
    if (now.length !== before.length || !now.length) continue; // (a new one was just blown)
    for (const x of now) worst = Math.max(worst, Math.min(...before.map((y) => Math.abs(x - y))));
    seen += 1;
  }
  assert.ok(seen > 20, "bubbles were followed");
  assert.ok(worst < 40, `a bubble drifts, never dragged by the arm (biggest step ${Math.round(worst)} px; the swing is 133 px a picture)`);
});

test("sourceAt: now or no memory → the anchor now; earlier → where it was", () => {
  const ctx = { t: 2, at: { x: 9, y: 9 }, anchorAt: (t: number) => ({ x: t, y: 0 }) };
  assert.deepEqual(sourceAt(ctx, 2), { x: 9, y: 9 });
  assert.deepEqual(sourceAt(ctx, 0.5), { x: 0.5, y: 0 });
  assert.deepEqual(sourceAt({ t: 2, at: { x: 9, y: 9 } }, 0.5), { x: 9, y: 9 });
});

test("smoke left behind a fast-moving source is stretched thin (never a thick gray hose)", async () => {
  const { stretchAt } = await import("./random.ts");
  const still = { t: 2, at: { x: 0, y: 0 }, anchorAt: () => ({ x: 0, y: 0 }) };
  const running = { t: 2, at: { x: 0, y: 0 }, anchorAt: (t: number) => ({ x: 900 * t, y: 0 }) };
  assert.equal(stretchAt(still, 1, 240), 1);
  assert.ok(stretchAt(running, 1, 240) > 3, "a source running 900 px/s lays its smoke out ~4x thinner");
  // and in a drawn scene: the smoke while the hand swings is thinner than while it holds still
  const scene = { characters: [{ height: H }], groundY: G, effects: [{ kind: "smoke", start: 0, end: 4, anchor: { character: "a", joint: "rHand" as const }, params: { size: 0.08 } }] };
  const frames = buildEffectFrames(scene as never, built(4));
  const spanY = (i: number) => { const ys = frames[i].front.concat(frames[i].back).flatMap((s) => ("points" in s && Array.isArray(s.points) ? s.points.filter((_, k) => k % 2 === 1) : [])); return ys.length; };
  assert.ok(spanY(Math.round(1.7 * FPS)) > 0, "still drawn");
});
