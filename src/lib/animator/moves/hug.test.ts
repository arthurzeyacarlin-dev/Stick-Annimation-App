import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { HUG_CLOSE } from "./hug.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";

// ONE CONTINUOUS APPROACH (Arthur, Oct 14: "when they ran up to each other they just stopped, then got a little bit closer"):
// a walk / jog / run straight into a hug never stops and then creeps closer — the hips keep closing the gap until the wrap,
// never standing still in between; the chests end HUG_CLOSE apart; the arms are already open when the feet stop.
const H = 300;
const plan = (a: Array<Record<string, unknown>>, b: Array<Record<string, unknown>>, bx = 1360): ScenePlan => ({
  id: "h", title: "h", height: H, groundY: 900, characters: [
    { id: "a", name: "a", x: 560, facing: "right", actions: a },
    { id: "b", name: "b", x: bx, facing: "left", actions: b },
  ],
} as unknown as ScenePlan);

function check(name: string, p: ScenePlan) {
  const scene = planToScene(p, LIBRARY);
  const touch = scene.marks["a.hug1.touch"] ?? scene.marks["a.touch"] ?? Object.entries(scene.marks).find(([k]) => k.startsWith("a.") && k.endsWith("touch"))?.[1];
  assert.ok(touch !== undefined, `${name}: a touch mark (${Object.keys(scene.marks).join(", ")})`);
  const fps = 48, frames = buildScene(scene, fps).frames;
  const hipX = (i: number, c: number) => frames[i][c].skeleton.hip.x;
  const iTouch = Math.round(touch! * fps);
  // the gap closes without a stop-and-go: once a has started moving, the hip never stands still (< 0.004 H per frame for
  // more than 0.15 s) and then moves on again before the touch
  for (const c of [0, 1]) {
    let still = 0, wasStill = false, started = false;
    for (let i = 1; i <= iTouch; i += 1) {
      const v = Math.abs(hipX(i, c) - hipX(i - 1, c));
      if (v > 0.01 * H) started = true;
      if (!started) continue;
      if (v < 0.002 * H) still += 1; else { if (still > 0.15 * fps && v > 0.004 * H) wasStill = true; still = 0; }
    }
    assert.ok(!wasStill, `${name}: figure ${c} stops, then creeps closer before the hug`);
  }
  const gap = Math.abs(hipX(iTouch, 1) - hipX(iTouch, 0));
  assert.ok(gap <= (HUG_CLOSE + 0.06) * H && gap >= (HUG_CLOSE - 0.06) * H, `${name}: hips ${(gap / H).toFixed(2)} H apart at the wrap`);
}

test("hug: a jog / run / walk straight into a hug is one continuous approach, chests together", () => {
  const hug = { move: "hug", params: { seconds: 1.2 } };
  check("jog both", plan([{ move: "jog", params: { distance: 330 } }, hug], [{ move: "jog", params: { distance: 330 } }, hug]));
  check("run to a walker", plan([{ move: "run", params: { distance: 420 } }, { move: "hug", params: { with: "b" } }], [{ move: "stand", params: { seconds: 0.6 } }, { move: "walk", params: { distance: 140 } }, { move: "hug", params: { with: "a" } }], 1320));
  check("walk to a still one", plan([{ move: "walk", params: { distance: 300 } }, { move: "hug", params: { with: "b" } }], [{ move: "stand", params: { seconds: 4 } }], 1100));
});

// HUGS NEVER WRAP AIR (Arthur, Oct 15): a fast one timed off the slow one's walk ("start 0.6 s after the other starts walking") and a
// hug timed off the other's hug: the timing must resolve (every move records its ".start"), so the arms close only when the bodies
// meet — both hugs' touches together, each one's hands on the other's back.
test("hug: timed off the partner's walk start, a fast runner never hugs the air before a slow walker arrives", () => {
  const p = plan(
    [{ move: "run", params: { distance: 560 }, sync: { mark: "start", at: "b.walk1.start", offset: 0.6 } }, { move: "hug", params: { with: "b", seconds: 1.4 } }],
    [{ move: "walk", params: { distance: 180 }, speed: "slow" }, { move: "hug", params: { with: "a", seconds: 1.4 }, sync: { mark: "start", at: "a.hug1.start" } }], 1400);
  const s = planToScene(p, LIBRARY as never);
  const ta = s.marks["a.hug1.touch"], tb = s.marks["b.hug1.touch"];
  assert.ok(Math.abs(ta - tb) < 0.6, `both arms close together (a ${ta.toFixed(2)} s, b ${tb.toFixed(2)} s)`);
  const frames = buildScene(s, 24).frames;
  for (const [me, them, t] of [["a", "b", ta], ["b", "a", tb]] as const) {
    const f = frames[Math.min(frames.length - 1, Math.round((t + 0.2) * 24))]!;
    const m = f.find((c) => c.id === me)!.skeleton, o = f.find((c) => c.id === them)!.skeleton;
    const gap = Math.min(...[m.lHand, m.rHand].map((h) => Math.abs(h.x - (o.neck.x + o.hip.x) / 2)));
    assert.ok(gap < 0.1 * H, `${me}'s hands are on ${them}'s back (${gap.toFixed(0)} px)`);
  }
});

// HUG AT THE PARTNER'S TORSO (Arthur, Oct 15: grandpa's arms closed over the little girl's head): a big figure hugging a small one
// comes down (knees bend) so its hands land ON the small one's back — and the small one's hands land on the big one's back.
test("hug: a big figure and a small child hug at the child's torso — every hand on a back, none in the air", () => {
  const p = plan([{ move: "walk", params: { distance: 200 } }, { move: "hug", params: { with: "b", seconds: 1.2 } }], [{ move: "walk", params: { distance: 120 } }, { move: "hug", params: { with: "a", seconds: 1.2 } }], 1300);
  (p.characters[1] as { size?: number }).size = 0.7;
  const s = planToScene(p, LIBRARY as never), frames = buildScene(s, 24).frames;
  for (const [me, them, myH] of [["a", "b", H], ["b", "a", 0.7 * H]] as const) {
    const t0 = s.marks[`${me}.hug1.touch`] + 0.1, t1 = s.marks[`${me}.hug1.release`] - 0.6;
    for (let i = Math.ceil(t0 * 24); i <= Math.floor(t1 * 24); i += 2) {
      const m = frames[i]!.find((c) => c.id === me)!.skeleton, o = frames[i]!.find((c) => c.id === them)!.skeleton;
      const A = o.neck, B = o.hip, dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1;
      const d = (q: { x: number; y: number }) => { const u = Math.max(0, Math.min(1, ((q.x - A.x) * dx + (q.y - A.y) * dy) / L2)); return Math.hypot(q.x - A.x - dx * u, q.y - A.y - dy * u); };
      const gap = Math.min(d(m.lHand), d(m.rHand));
      assert.ok(gap <= 0.1 * myH, `${me}'s hands ${gap.toFixed(0)} px from ${them}'s back at ${(i / 24).toFixed(2)} s`);
    }
  }
});
