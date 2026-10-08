import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { CELEBRATE_KINDS } from "./celebrate.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// SPEC-0017 Phase 3 (Arthur's Terra review): CELEBRATE = one arm thrust straight up, the other bent (never both
// arms straight up), with anticipation and a settle; TIPTOE = a real, careful walk on tiptoe.

const planOf = (actions: { move: string; params?: Record<string, unknown> }[], facing: "right" | "left" = "right"): ScenePlan => ({
  id: "t", title: "t", height: TEST_HEIGHT, groundY: TEST_GROUND,
  characters: [{ id: "a", x: facing === "right" ? 300 : 1500, facing, actions }],
});
const handHeight = (s: { neck: { y: number }; lHand: { y: number }; rHand: { y: number } }) => ({ l: s.neck.y - s.lHand.y, r: s.neck.y - s.rHand.y });

test("celebrate: one arm up high, the other lower and bent; anticipation first, settle after; body rules at 8/12/24 fps", () => {
  for (const kind of CELEBRATE_KINDS) for (const seed of [1, 2, 3, 7]) for (const hand of ["left", "right"]) for (const facing of ["right", "left"] as const) {
    const label = `${kind}#${seed} ${hand} ${facing}`;
    const scene = planToScene(planOf([{ move: "celebrate", params: { kind, seed, hand } }], facing), LIBRARY);
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      const r = built.report.characters[0];
      assert.ok(r.maxBoneErrorPx <= 0.5, `${label}@${fps}: bones ${r.maxBoneErrorPx.toFixed(2)}`);
      assert.ok(r.maxFootDriftPx <= 1, `${label}@${fps}: foot slid ${r.maxFootDriftPx.toFixed(2)}`);
      assert.equal(r.belowGroundFrames, 0, `${label}@${fps}: below the floor`);
      const frames = built.frames.map((f) => f[0].skeleton);
      // The peak: the frame where the highest hand is highest.
      let peak = 0;
      frames.forEach((s, i) => { const h = handHeight(s), b = handHeight(frames[peak]); if (Math.max(h.l, h.r) > Math.max(b.l, b.r)) peak = i; });
      const h = handHeight(frames[peak]);
      const high = Math.max(h.l, h.r), low = Math.min(h.l, h.r);
      assert.ok(high > 0.25 * TEST_HEIGHT, `${label}@${fps}: the raised hand is high (${high.toFixed(0)})`);
      assert.ok(high - low > 0.15 * TEST_HEIGHT, `${label}@${fps}: NOT both arms straight up (${high.toFixed(0)} vs ${low.toFixed(0)})`);
      const upSide = h.l > h.r ? "l" : "r";
      // (The near arm goes up by default; `hand` picks it. The figure's "l" side is its near side facing right.)
      void upSide;
      // Anticipation: before the thrust the hips dip below standing.
      const hipY0 = frames[0].hip.y;
      const raisedAt = peak;
      const minHipBefore = Math.max(...frames.slice(0, Math.max(1, raisedAt)).map((s) => s.hip.y));
      assert.ok(minHipBefore > hipY0 + 0.01 * TEST_HEIGHT, `${label}@${fps}: knees dip before the thrust (${(minHipBefore - hipY0).toFixed(1)})`);
      // Settle: it ends back in the stand, hands down.
      const last = handHeight(frames[frames.length - 1]);
      assert.ok(last.l < 0 && last.r < 0, `${label}@${fps}: settles back with the hands down`);
    }
  }
});

const gaitOf = (move: string, distance: number, fps: number) => {
  const scene = planToScene(planOf([{ move, params: { distance } }]), LIBRARY);
  const built = buildScene(scene, fps);
  return { scene, built, frames: built.frames.map((f) => f[0].skeleton) };
};

test("tiptoe: travels the distance, steps alternate, feet never slide; shorter steps and higher knees than the walk", () => {
  for (const fps of [8, 12, 24]) {
    const walk = gaitOf("walk", 400, fps), tip = gaitOf("tiptoe", 400, fps);
    const r = tip.built.report.characters[0];
    assert.ok(r.maxBoneErrorPx <= 0.5, `@${fps}: bones ${r.maxBoneErrorPx.toFixed(2)}`);
    assert.ok(r.maxFootDriftPx <= 1, `@${fps}: foot slid ${r.maxFootDriftPx.toFixed(2)}`);
    assert.equal(r.belowGroundFrames, 0, `@${fps}: below the floor`);
    const hip0 = tip.frames[0].hip.x, hipEnd = tip.frames[tip.frames.length - 1].hip.x;
    assert.ok(Math.abs(hipEnd - hip0 - 400) < 12, `@${fps}: travels 400 (${(hipEnd - hip0).toFixed(0)})`);
    // Steps: count landings from the keys (a foot that becomes planted), and check they alternate.
    const stepsOf = (keys: { contacts?: string[] }[]) => {
      const out: string[] = [];
      for (let i = 1; i < keys.length; i += 1) for (const f of ["lFoot", "rFoot"]) if ((keys[i].contacts ?? []).includes(f) && !(keys[i - 1].contacts ?? []).includes(f)) out.push(f);
      return out;
    };
    const tipSteps = stepsOf(tip.scene.characters[0].keys), walkSteps = stepsOf(walk.scene.characters[0].keys);
    assert.ok(tipSteps.length >= walkSteps.length + 2, `@${fps}: more, shorter steps (${tipSteps.length} vs walk ${walkSteps.length})`);
    for (let i = 1; i < tipSteps.length - 1; i += 1) assert.notEqual(tipSteps[i], tipSteps[i - 1], `@${fps}: steps alternate (${tipSteps.join(",")})`);
    // Knees lifted higher than the walk's.
    const kneeLift = (frames: typeof tip.frames) => Math.max(...frames.map((s) => s.hip.y - Math.min(s.lKnee.y, s.rKnee.y))) - (frames[0].hip.y - Math.min(frames[0].lKnee.y, frames[0].rKnee.y));
    assert.ok(kneeLift(tip.frames) > kneeLift(walk.frames) + 0.02 * TEST_HEIGHT, `@${fps}: knees higher (${kneeLift(tip.frames).toFixed(1)} vs ${kneeLift(walk.frames).toFixed(1)})`);
    // Slow and steady: it takes longer than the walk.
    assert.ok(tip.scene.durationSec > 1.3 * walk.scene.durationSec, `@${fps}: slower than the walk`);
    // Arms lifted for balance: the hands mid-walk are higher than the walk's.
    const mid = (frames: typeof tip.frames) => frames[Math.floor(frames.length / 2)];
    const hands = (s: typeof tip.frames[0]) => (s.lHand.y + s.rHand.y) / 2;
    assert.ok(hands(mid(tip.frames)) < hands(mid(walk.frames)) - 0.05 * TEST_HEIGHT, `@${fps}: arms lifted for balance`);
  }
});

// Round 2 (Arthur): "the arm that is not pointing straight up should be a bit BEHIND his back".
test("celebrate: the bent arm is drawn back, the fist behind the body (thrust and hop) at 8/12/24 fps", () => {
  for (const kind of ["thrust", "hop"]) for (const facing of ["right", "left"] as const) for (const hand of ["left", "right"]) {
    const scene = planToScene(planOf([{ move: "celebrate", params: { kind, hand, seconds: 1 } }], facing), LIBRARY);
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      const frames = built.frames.map((f) => f[0].skeleton);
      // (While the pose is held: the frames where one hand is up above the head.)
      const held = frames.filter((s) => Math.min(s.lHand.y, s.rHand.y) < s.head.y);
      const back = Math.max(...held.map((s) => ((s.lHand.y > s.rHand.y ? s.lHand : s.rHand).x - s.neck.x) * (facing === "right" ? -1 : 1)));
      assert.ok(back > 0.02 * TEST_HEIGHT, `${kind} ${hand} ${facing}@${fps}: the other fist is behind the body (${back.toFixed(1)})`);
    }
  }
});

// Round 2 (Arthur): tiptoe arms "need to go left, right, left, right, passing each other, slowly".
test("tiptoe: the bent arms swing opposite the legs and pass each other every step at 8/12/24 fps", () => {
  for (const fps of [8, 12, 24]) {
    const tip = gaitOf("tiptoe", 400, fps);
    const sides = tip.frames.slice(2, -2).map((s) => Math.sign(s.lHand.x - s.rHand.x)).filter((v) => v !== 0);
    let passes = 0;
    for (let i = 1; i < sides.length; i += 1) if (sides[i] !== sides[i - 1]) passes += 1;
    assert.ok(passes >= 4, `@${fps}: the hands pass each other (${passes} times)`);
    const spread = Math.max(...tip.frames.map((s) => Math.abs(s.lHand.x - s.rHand.x)));
    assert.ok(spread > 0.1 * TEST_HEIGHT, `@${fps}: a real swing, not a twitch (${spread.toFixed(0)})`);
  }
});

// Phase 3 self-review (Arthur: "the other bent behind the back"): the elbow is back and the forearm angles IN toward the
// small of the back (the fist ahead of its elbow), not hanging straight down behind the body.
test("celebrate: the bent-behind arm's forearm angles in toward the back (thrust, 12/24 fps)", () => {
  for (const facing of ["right", "left"] as const) for (const fps of [12, 24]) {
    const built = buildScene(planToScene(planOf([{ move: "celebrate", params: { seconds: 1 } }], facing), LIBRARY), fps);
    const held = built.frames.map((f) => f[0].skeleton).filter((s) => Math.min(s.lHand.y, s.rHand.y) < s.head.y);
    const dir = facing === "right" ? 1 : -1;
    const inward = Math.max(...held.map((s) => { const low = s.lHand.y > s.rHand.y ? "l" : "r"; return (s[`${low}Hand`].x - s[`${low}Elbow`].x) * dir; }));
    assert.ok(inward > 0.02 * TEST_HEIGHT, `${facing}@${fps}: the forearm angles in toward the back (${inward.toFixed(1)})`);
  }
});

// NO UNNEEDED TURN AT THE START (Arthur, victory card: "he starts backwards, turns around, then he does the victory
// celebration... No unnecessary key poses"): a figure starts already facing the way its first move needs.
test("a figure starts already facing its first move: no turn in the first pictures (celebrate from front or right)", () => {
  for (const facing of ["front", "right"] as const) {
    const plan: ScenePlan = { id: "t", title: "t", height: TEST_HEIGHT, groundY: TEST_GROUND, characters: [{ id: "a", x: 700, facing, actions: [{ move: "celebrate" }] }] };
    const scene = planToScene(plan, LIBRARY);
    const keys = scene.characters[0].keys;
    const early = keys.filter((k) => k.t <= 0.3);
    assert.ok(early.every((k) => k.facing === keys[0].facing), `${facing}: no facing change in the first 0.3 s (${early.map((k) => k.facing).join(",")})`);
    assert.ok(!Object.keys(scene.marks ?? {}).some((m) => m.startsWith("a.turn")), `${facing}: no turn before the celebration`);
    assert.ok((scene.marks?.["a.celebrate1.raised"] ?? 9) < 0.8, `${facing}: the celebration starts straight away`);
  }
});
