import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type FrameCharacter, type Scene } from "../engine.ts";
import { flightTime } from "../objectMoves.ts";
import { ballLook, defaultApex, heldCenter } from "../objects.ts";
import { DEFAULT_STYLE, STAND, type Facing, type JointName, type Skeleton } from "../rig.ts";
import { beatSeconds, type MoveSettings, type Stance } from "./motion.ts";
import { allSettings, assertNatural, sceneOfKeys, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import {
  BALL_HAND, catchBall, catchOffset, catchPoint, handOffWithin, HOLD_BALL, isHandOff, launchSpeed, needsOverhand, overhandFrom, throwBall, throwsOverhand, UNDERHAND_TOP_SPEED,
} from "./throwCatch.ts";
import { centerAnimation } from "../stageFit.ts";
import { LIBRARY } from "./library.ts";
import { fitPlanToPage, type ScenePlan } from "./plan.ts";

// SPEC-0017 Phase 2 Round B, Arthur's round-4 review of throwing and catching:
// - "If you're doing far distance and you need to really throw, that's when overhand's useful. If it's
//   short distance, you should do like an uppercut": the engine picks the throw from a RULE (the speed
//   the ball needs vs. what an underhand swing can give), for any figure size and distance.
// - "He has to go to the standing pose. He has to be ready. And then when he's ready, his arms go out.
//   He grabs it": the catcher's hands come up to the chest first, then the arms go out to meet the ball.
// - Nobody stands around with an arm sticking out: after a throw the thrower ends in the plain stand.

const SIDES: Facing[] = ["right", "left"];
const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const fwd = (facing: Facing) => (facing === "left" ? -1 : 1);
const label = (name: string, s: MoveSettings, facing: Facing) => `${name}/${s.style}/${s.speed}/${s.energy}/${facing}/h${s.height}`;
const stanceOf = (facing: Facing, pose = STAND, t = 0.75, x = 820): Stance => ({ t, x, facing, pose });
const BALL_PX = ballLook("basketball").size / 2;

// One figure of any height doing these keys, as a scene.
function sceneFor(keys: CharacterKey[], facing: Facing, height: number): Scene {
  const end = Math.max(...keys.map((k) => k.t));
  return {
    id: "throw-test", title: "throw test", durationSec: Math.ceil((end + 0.2) * 10) / 10, groundY: TEST_GROUND,
    characters: [{ id: "a", name: "A", facing, height, style: DEFAULT_STYLE, keys: [{ ...keys[0], t: 0 }, ...keys] }],
  };
}
// The figure exactly at time t (the last frame of the scene cut at t, at a rate that puts a frame there).
function figureAt(keys: CharacterKey[], facing: Facing, t: number, height = TEST_HEIGHT): FrameCharacter {
  const scene = sceneFor(keys, facing, height);
  const built = buildScene({ ...scene, durationSec: t }, Math.ceil(t * 48) / t);
  return built.frames[built.frames.length - 1][0];
}
// Body measures in body heights: how far a joint is in front of the hips, and above the hips.
const ahead = (s: Skeleton, joint: JointName, facing: Facing, h: number) => ((s[joint].x - s.hip.x) * fwd(facing)) / h;
const above = (s: Skeleton, joint: JointName, h: number) => (s.hip.y - s[joint].y) / h;

test("which throw: worked out from the body and physics, underhand for short passes and overhand for long throws, for figures 200, 300 and 400 px tall", () => {
  // The rule's own numbers make sense: an underhand swing gives about 3.8 body heights per second, and
  // the ball needs more speed the further it has to go.
  assert.ok(UNDERHAND_TOP_SPEED > 3.3 && UNDERHAND_TOP_SPEED < 4.3, `underhand top speed ${UNDERHAND_TOP_SPEED.toFixed(2)} heights/s`);
  for (let gap = 50; gap < 2000; gap += 50) assert.ok(launchSpeed(gap + 50) > launchSpeed(gap), "a longer throw needs a faster ball");
  for (const height of [200, 300, 400]) {
    const from = overhandFrom(height);
    // Short passes (about a body height or two apart) are tossed underhand; long throws are overhand.
    assert.ok(from > 1.5 * height && from < 4.5 * height, `h${height}: overhand from ${(from / height).toFixed(2)} heights`);
    assert.equal(needsOverhand(0.99 * from, height), false, `h${height}: just under the threshold is underhand`);
    assert.equal(needsOverhand(1.01 * from, height), true, `h${height}: just over it is overhand`);
    for (const settings of [{ ...NATURAL, height }, { ...NATURAL, height, style: "angry" as const, energy: 0.85 }, { ...NATURAL, height, style: "robot" as const }]) {
      for (const facing of SIDES) for (const [distance, overhand] of [[1.2 * height, false], [0.9 * from, false], [1.1 * from, true], [5 * height, true]] as const) {
        const name = label(`throw ${(distance / height).toFixed(2)} heights`, settings, facing);
        assert.equal(throwsOverhand({ distance }, height), overhand, `${name}: kind`);
        const out = throwBall(stanceOf(facing, HOLD_BALL), { distance }, settings);
        // At the end of the wind-up: overhand = the ball up behind the head; underhand = down behind the hips.
        const w = figureAt(out.keys, facing, out.marks.windup, height).skeleton;
        if (overhand) assert.ok(w[BALL_HAND].y < w.neck.y, `${name}: overhand winds the ball up behind the head`);
        else assert.ok(above(w, BALL_HAND, height) < 0.1 && ahead(w, BALL_HAND, facing, height) < -0.1, `${name}: underhand swings the ball down and back behind the hips`);
      }
    }
    // The params can still say which: `overhand: true / false` always wins over the rule.
    const short = throwBall(stanceOf("right", HOLD_BALL), { distance: 1.2 * height, overhand: true }, { ...NATURAL, height });
    assert.ok(figureAt(short.keys, "right", short.marks.windup, height).skeleton[BALL_HAND].y < figureAt(short.keys, "right", short.marks.windup, height).skeleton.neck.y, `h${height}: overhand: true wins`);
    const long = throwBall(stanceOf("right", HOLD_BALL), { distance: 5 * height, overhand: false }, { ...NATURAL, height });
    assert.ok(above(figureAt(long.keys, "right", long.marks.windup, height).skeleton, BALL_HAND, height) < 0.1, `h${height}: overhand: false wins`);
  }
  // The planner's two test scenes (300 px figures): the pass (560 px apart) and run-grab-throw (about
  // 520 px apart) are short passes: underhand. A throw across most of the stage is overhand.
  assert.equal(needsOverhand(560, 300), false);
  assert.equal(needsOverhand(520, 300), false);
  assert.equal(needsOverhand(1100, 300), true);
});

test("underhand toss (like an uppercut): the ball swings down and back, then forward and up; it leaves the hand below the shoulders, rising and going forward", () => {
  // (Round 6: 250 px apart used to be tossed; Arthur: that close is a hand-off. The shortest toss is now
  // just past the hand-off reach.)
  for (const settings of allSettings()) for (const facing of SIDES) for (const distance of [300, 560]) {
    const name = label(`underhand-${distance}`, settings, facing);
    const out = throwBall(stanceOf(facing, HOLD_BALL), { distance }, settings);
    assert.equal(throwsOverhand({ distance }, settings.height), false, `${name}: underhand`);
    const at = (t: number) => figureAt(out.keys, facing, t);
    const r = at(out.marks.release), before = at(out.marks.release - 1 / 60);
    const ball = heldCenter(r, BALL_HAND, BALL_PX);
    // Let go in front, below the shoulders (about belly or chest height).
    assert.ok(ball.y > r.skeleton.neck.y + 0.03 * TEST_HEIGHT && ball.y < r.skeleton.hip.y, `${name}: released between the hips and the shoulders (${((r.skeleton.hip.y - ball.y) / TEST_HEIGHT).toFixed(2)} above the hips)`);
    assert.ok(ahead(r.skeleton, BALL_HAND, facing, TEST_HEIGHT) > 0.15, `${name}: released in front of the body`);
    // Rising and going forward as it leaves the hand.
    const b0 = heldCenter(before, BALL_HAND, BALL_PX);
    const vx = (ball.x - b0.x) * fwd(facing), vy = b0.y - ball.y;
    assert.ok(vx > 0 && vy > 0.3 * vx, `${name}: the ball leaves rising and forward (vx ${vx.toFixed(1)}, up ${vy.toFixed(1)} px per 1/60 s)`);
    // Before that the hand swung down and back behind the hips (the wind-up), passing low by the leg.
    const w = at(out.marks.windup).skeleton;
    assert.ok(ahead(w, BALL_HAND, facing, TEST_HEIGHT) < -0.1 && above(w, BALL_HAND, TEST_HEIGHT) < 0.1, `${name}: wound back behind the hips (${ahead(w, BALL_HAND, facing, TEST_HEIGHT).toFixed(2)} ahead, ${above(w, BALL_HAND, TEST_HEIGHT).toFixed(2)} up)`);
  }
});

test("after a throw the thrower settles into the plain standing pose, arms down and relaxed (no arm left hanging out); the flow point stays at the end of the follow-through", () => {
  for (const settings of allSettings()) for (const facing of SIDES) for (const distance of [400, 1000]) {
    const name = label(`throw-${distance}`, settings, facing);
    const out = throwBall(stanceOf(facing, HOLD_BALL), { distance }, settings);
    assertNatural(sceneOfKeys(out.keys, facing), name);
    assert.deepEqual(out.end.pose, STAND, `${name}: ends in the plain stand`);
    const last = figureAt(out.keys, facing, out.end.t).skeleton;
    // (In the plain stand the hands hang about level with the hips.)
    for (const hand of ["lHand", "rHand"] as const) assert.ok(above(last, hand, TEST_HEIGHT) < 0.02, `${name}: ${hand} down by the hips at the end`);
    // The flow point is the end of the follow-through (after the release); from there the arms come down
    // first (right away, before the front foot steps back), and they stay down.
    // (A robot has no follow-through: its flow point is the release itself.)
    assert.ok(out.flow && out.flow.stance.t >= out.marks.release - 1e-9, `${name}: flow at the end of the follow-through`);
    if (settings.style !== "robot") assert.ok(out.flow!.stance.t > out.marks.release + 0.05, `${name}: there is a follow-through before the flow point`);
    // (the key just before the front foot lifts to step back)
    const lifts = out.keys.findIndex((k, i) => i >= out.flow!.keys && (k.contacts ?? []).length < 2);
    // (Round 8: a ROBOT's stiff overhand arm goes back round over the head and down BEFORE its flow point —
    // whatever follows never has to swing it round from above the head — so there the arms are already
    // down at the flow point.)
    const stiff = settings.style === "robot" && out.keys.some((k) => Math.abs(k.pose.rElbow) < 1e-6);
    assert.ok(stiff ? lifts >= out.flow!.keys : lifts > out.flow!.keys, `${name}: the front foot steps back after the arms come down`);
    const down = out.keys[lifts - 1];
    // (Soon at the move's own pace: a slow or sneaky move is slower; a robot's arm comes down at the same
    // even speed it threw with.)
    const soon = beatSeconds("settle", settings.style === "robot" ? 1.2 : 0.8, settings);
    assert.ok(down.t - out.flow!.stance.t < soon, `${name}: the arms drop soon after the follow-through (${(down.t - out.flow!.stance.t).toFixed(2)} s, limit ${soon.toFixed(2)})`);
    for (const t of [down.t, (down.t + out.end.t) / 2, out.end.t]) {
      const s = figureAt(out.keys, facing, t).skeleton;
      for (const hand of ["lHand", "rHand"] as const) {
        assert.ok(above(s, hand, TEST_HEIGHT) < 0.06, `${name}@${t.toFixed(2)}: ${hand} hanging down (${above(s, hand, TEST_HEIGHT).toFixed(2)} above the hips)`);
        // (hanging from the shoulder: not held out in front of it or behind it)
        const out1 = ((s[hand].x - s.neck.x) * fwd(facing)) / TEST_HEIGHT;
        assert.ok(Math.abs(out1) < 0.12, `${name}@${t.toFixed(2)}: ${hand} hanging by the side (${out1.toFixed(2)} in front of the shoulder)`);
      }
    }
  }
});

test("catch: from the plain stand, the hands come up to the chest first (ready), THEN the arms go out and meet the ball at the catch point on the catch mark, then it comes in to the chest", () => {
  for (const settings of allSettings()) for (const facing of SIDES) {
    const name = label("catch", settings, facing);
    const start = stanceOf(facing);
    const out = catchBall(start, {}, settings);
    assertNatural(sceneOfKeys(out.keys, facing), name);
    assert.ok(Math.abs(out.marks.catch - start.t - catchOffset(settings)) < 1e-9, `${name}: catchOffset = time from the start to the catch`);
    assert.ok(out.marks.ready > start.t && out.marks.ready < out.marks.catch && out.marks.catch < out.marks.secured, `${name}: ready -> catch -> secured`);
    // At the start the hands hang by the body.
    const s0 = figureAt(out.keys, facing, start.t + 1e-3).skeleton;
    for (const hand of ["lHand", "rHand"] as const) {
      assert.ok(Math.abs(ahead(s0, hand, facing, TEST_HEIGHT)) < 0.12 && above(s0, hand, TEST_HEIGHT) < 0.06, `${name}: ${hand} by the body at the start`);
    }
    // READY: both hands up in front of the chest (between the hips and the head, a little in front),
    // elbows bent — not reaching out yet.
    const ready = figureAt(out.keys, facing, out.marks.ready).skeleton;
    for (const hand of ["lHand", "rHand"] as const) {
      const elbow = hand === "lHand" ? "lElbow" : "rElbow";
      assert.ok(above(ready, hand, TEST_HEIGHT) > 0.12 && ready[hand].y > ready.head.y, `${name}: ${hand} up at the chest when ready (${above(ready, hand, TEST_HEIGHT).toFixed(2)} above the hips)`);
      const out1 = ahead(ready, hand, facing, TEST_HEIGHT);
      assert.ok(out1 > 0.05 && out1 < 0.25, `${name}: ${hand} in front of the chest when ready (${out1.toFixed(2)})`);
      const u = { x: ready[elbow].x - ready.neck.x, y: ready[elbow].y - ready.neck.y }, f = { x: ready[hand].x - ready[elbow].x, y: ready[hand].y - ready[elbow].y };
      const bend = (Math.acos((u.x * f.x + u.y * f.y) / (Math.hypot(u.x, u.y) * Math.hypot(f.x, f.y))) * 180) / Math.PI;
      assert.ok(bend > 45, `${name}: ${hand} elbow bent when ready (${bend.toFixed(0)} deg)`);
    }
    // REACH: then the arms go out — the ball (between the hands) is at the catch point exactly at "catch",
    // further out than the hands were when ready.
    const meet = figureAt(out.keys, facing, out.marks.catch);
    const ball = heldCenter(meet, "hands", BALL_PX), point = catchPoint(facing, start.x, TEST_HEIGHT, TEST_GROUND);
    assert.ok(Math.hypot(ball.x - point.x, ball.y - point.y) < 1, `${name}: the hands meet the ball at the catch point (${Math.hypot(ball.x - point.x, ball.y - point.y).toFixed(2)} px off)`);
    const readyOut = Math.max(ahead(ready, "lHand", facing, TEST_HEIGHT), ahead(ready, "rHand", facing, TEST_HEIGHT));
    assert.ok(ahead(meet.skeleton, "lHand", facing, TEST_HEIGHT) > readyOut + 0.05, `${name}: the arms go out to meet the ball`);
    // Then the ball comes in to the chest and is held there.
    const held = heldCenter(figureAt(out.keys, facing, out.marks.secured), "hands", BALL_PX);
    assert.ok((held.x - ball.x) * fwd(facing) < -0.04 * TEST_HEIGHT, `${name}: the ball comes in to the chest`);
    assert.deepEqual(out.end.pose, HOLD_BALL, `${name}: ends holding the ball at the chest`);
  }
});

test("catch timing: started the way the planner starts it (its catch mark when the ball arrives), the catcher's hands come up about when the thrower lets go", () => {
  for (const settings of [NATURAL, { ...NATURAL, energy: 0.85 }, { ...NATURAL, style: "happy" as const }, { ...NATURAL, style: "robot" as const }]) {
    for (const gap of [520, 560, 700]) {
      const name = `${settings.style}/${settings.energy}/gap ${gap}`;
      const a = throwBall(stanceOf("right", HOLD_BALL, 0.5, 960 - gap / 2), { distance: gap }, settings);
      // The planner's flight: the hands-to-hands gap on the engine's arc under gravity.
      const flight = flightTime(0, 0, defaultApex({ x: 0, y: 0 }, { x: gap - 0.5 * TEST_HEIGHT, y: 0 }));
      const startB = a.marks.release + flight - catchOffset(settings);
      const b = catchBall(stanceOf("left", STAND, startB, 960 + gap / 2), {}, settings);
      assert.ok(Math.abs(b.marks.catch - (a.marks.release + flight)) < 1e-9, `${name}: catches when the ball arrives`);
      // The hands start to come up within a few tenths of a second of the release, and are ready (up at
      // the chest) while the ball is still in the air, before the arms go out to it.
      assert.ok(Math.abs(startB - a.marks.release) < 0.3, `${name}: the get-ready starts ${(startB - a.marks.release).toFixed(2)} s from the release`);
      assert.ok(b.marks.ready > a.marks.release && b.marks.ready < b.marks.catch - 0.1, `${name}: ready while the ball flies`);
    }
  }
  // The ready beat is a reaction time plus the time to raise the hands: about half a second when natural.
  const ready = catchBall(stanceOf("right"), {}, NATURAL).marks.ready - 0.75;
  assert.ok(ready > 0.35 && ready < 0.7, `ready after ${ready.toFixed(2)} s`);
});

test("a pass the planner's way: the underhand toss flies into the catcher's waiting hands; the ball never jumps, both figures keep the body rules", () => {
  for (const settings of [NATURAL, { ...NATURAL, style: "angry" as const, speed: "fast" as const, energy: 0.85 }, { ...NATURAL, style: "tired" as const, speed: "slow" as const, energy: 0.2 }]) {
    for (const facing of SIDES) {
      const gap = 560, dir = fwd(facing);
      const a = throwBall(stanceOf(facing, HOLD_BALL, 0.3, 960 - (dir * gap) / 2), { distance: gap }, settings);
      const flight = flightTime(0, 0, defaultApex({ x: 0, y: 0 }, { x: gap - 0.5 * TEST_HEIGHT, y: 0 }));
      const other: Facing = facing === "right" ? "left" : "right";
      const b = catchBall(stanceOf(other, STAND, a.marks.release + flight - catchOffset(settings), 960 + (dir * gap) / 2), {}, settings);
      const end = Math.max(a.end.t, b.end.t) + 0.2;
      const scene: Scene = {
        id: "pass", title: "pass", durationSec: Math.ceil(end * 10) / 10, groundY: TEST_GROUND,
        characters: [
          { id: "a", name: "A", facing, height: TEST_HEIGHT, style: DEFAULT_STYLE, keys: [{ ...a.keys[0], t: 0 }, ...a.keys] },
          { id: "b", name: "B", facing: other, height: TEST_HEIGHT, style: DEFAULT_STYLE, keys: [{ ...b.keys[0], t: 0 }, ...b.keys] },
        ],
        objects: [{
          id: "ball", name: "Ball", look: ballLook("basketball"), keys: [],
          segments: [
            { from: 0, to: a.marks.oneHand, mode: "held", character: "a", joint: "hands" },
            { from: a.marks.oneHand, to: a.marks.release, mode: "held", character: "a", joint: BALL_HAND },
            { from: a.marks.release, to: b.marks.catch, mode: "flight" },
            { from: b.marks.catch, to: end, mode: "held", character: "b", joint: "hands" },
          ],
        }],
      };
      const name = label("pass", settings, facing);
      const built = assertNatural(scene, name);
      let worst = 0;
      for (let i = 1; i < built.objects.length; i += 1) worst = Math.max(worst, Math.hypot(built.objects[i][0].x - built.objects[i - 1][0].x, built.objects[i][0].y - built.objects[i - 1][0].y));
      assert.ok(worst < 70, `${name}: ball moved ${worst.toFixed(0)} px in one frame`);
    }
  }
});

// ---- Arthur's round-6 review ----------------------------------------------------------------------

test("overhand, behind the head (round 6): the elbow goes up and back behind the head, the ball above and behind it, held a moment; no straight-arm sweep round the head on the way, never a full arm circle", () => {
  for (const settings of [NATURAL, { ...NATURAL, style: "angry" as const, energy: 0.85 }, { ...NATURAL, style: "tired" as const, speed: "slow" as const, energy: 0.2 }, { ...NATURAL, style: "robot" as const }]) {
    for (const facing of SIDES) {
      const name = label("overhand", settings, facing);
      const out = throwBall(stanceOf(facing, HOLD_BALL), { distance: 1100 }, settings);
      const at = (t: number) => figureAt(out.keys, facing, t);
      const w = at(out.marks.windup), s = w.skeleton, ball = heldCenter(w, BALL_HAND, BALL_PX);
      const back = (p: { x: number }) => ((s.neck.x - p.x) * fwd(facing)) / TEST_HEIGHT;
      // The elbow: up at about head height, just behind the head (within a head and a half of its centre).
      assert.ok(s.neck.y - s.rElbow.y > 0.08 * TEST_HEIGHT, `${name}: elbow up at head height (${((s.neck.y - s.rElbow.y) / TEST_HEIGHT).toFixed(2)} above the shoulders)`);
      assert.ok(back(s.rElbow) > 0.04 && Math.hypot(s.rElbow.x - s.head.x, s.rElbow.y - s.head.y) < 2.5 * w.headRadius, `${name}: elbow just behind the head`);
      // The ball: above the top of the head, and behind its centre.
      assert.ok(ball.y < s.head.y - w.headRadius && (s.head.x - ball.x) * fwd(facing) > 0, `${name}: ball above and behind the head`);
      // Held there a moment: for at least a tenth of a second the ball hardly moves.
      const later = heldCenter(at(out.marks.cocked), BALL_HAND, BALL_PX);
      assert.ok(out.marks.cocked - out.marks.windup > 0.06 && Math.hypot(later.x - ball.x, later.y - ball.y) < 0.05 * TEST_HEIGHT, `${name}: the cocked pose is held (${(out.marks.cocked - out.marks.windup).toFixed(2)} s)`);
      // On the way there, the ball stays up by the head (never swung out straight behind at shoulder
      // height or below it): from when it's in one hand to the wind-up it is never below the shoulders
      // and never further than an arm's length from the head.
      // (Round 8: not a ROBOT — "the right arm goes behind him, around his head, and throws": its straight
      // arm swings down and back behind it first; its own test is below.)
      if (settings.style !== "robot") for (let t = out.marks.oneHand; t <= out.marks.windup; t += 1 / 48) {
        const f = at(t), b = heldCenter(f, BALL_HAND, BALL_PX);
        assert.ok(b.y < f.skeleton.neck.y + 0.06 * TEST_HEIGHT, `${name}@${t.toFixed(2)}: ball by the head on the way up (${((b.y - f.skeleton.neck.y) / TEST_HEIGHT).toFixed(2)} below the shoulders)`);
        assert.ok(Math.hypot(b.x - f.skeleton.head.x, b.y - f.skeleton.head.y) < 0.36 * TEST_HEIGHT, `${name}@${t.toFixed(2)}: ball close to the head`);
      }
      // No windmill: from the start to the end of the follow-through the upper arm never turns 300 degrees
      // or more in one direction.
      let total = 0, prev: number | null = null, most = 0;
      for (let t = 0.75; t <= out.flow!.stance.t; t += 1 / 48) {
        const k = at(t).skeleton, a = (Math.atan2((k.rElbow.x - k.neck.x) * fwd(facing), k.rElbow.y - k.neck.y) * 180) / Math.PI;
        if (prev !== null) total += ((a - prev + 540) % 360) - 180;
        prev = a; most = Math.max(most, Math.abs(total));
      }
      assert.ok(most < 300, `${name}: upper arm turns at most ${most.toFixed(0)} degrees one way`);
    }
  }
});

const BALL_PLAN = (characters: ScenePlan["characters"]): ScenePlan => ({ id: "t", title: "t", height: TEST_HEIGHT, groundY: TEST_GROUND, characters, objects: [{ id: "ball", look: ballLook("basketball"), heldBy: "a" }] });
const passPlan = (gap: number, throwParams: Record<string, unknown> = {}): ScenePlan => BALL_PLAN([
  { id: "a", x: 960 - gap / 2, facing: "right", actions: [{ move: "throw", params: { object: "ball", to: "b", ...throwParams } }] },
  { id: "b", x: 960 + gap / 2, facing: "left", actions: [{ move: "catch", params: { object: "ball", from: "a" } }, { move: "wait", params: { seconds: 0.3 } }] },
]);
const ballSteps = (objects: { x: number; y: number; leaving?: boolean }[][]) => {
  let worst = 0;
  for (let i = 1; i < objects.length; i += 1) {
    const a = objects[i - 1][0], b = objects[i][0];
    if (a && b && !a.leaving && !b.leaving) worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return worst;
};

test("hand-off (round 6): partners close enough to meet half way (arms out, at most one small step) hand the ball over — no throw, no flight; further apart it's a toss", () => {
  // The rule's threshold comes from the arm length: about 0.9 body heights, for any size.
  for (const height of [200, 300, 400]) {
    const within = handOffWithin(height) / height;
    assert.ok(within > 0.7 && within < 1.1, `h${height}: hand-off up to ${within.toFixed(2)} heights apart`);
    assert.equal(isHandOff({ distance: 0.98 * handOffWithin(height) }, height), true);
    assert.equal(isHandOff({ distance: 1.02 * handOffWithin(height) }, height), false);
    assert.equal(isHandOff({ distance: 0.5 * height, handOff: false }, height), false, "handOff: false always throws");
  }
  for (const gap of [150, 220, 265]) {
    const scene = fitPlanToPage(passPlan(gap), LIBRARY, 1920);
    const name = `hand-off ${gap}px`;
    const built = assertNatural(scene, name);
    const ball = scene.objects![0];
    // Held by the giver, then by the taker: the moment it changes hands, both have it (no flight between).
    // (Round 7, the contact rule: the giver lets go just AFTER the taker's hands are on it — both hold it
    // a moment — never before.)
    const both = scene.marks["a.throw1.release"] - scene.marks["b.catch1.catch"];
    assert.ok(both >= 0 && both < 0.1, `${name}: changes hands while both hold it (giver lets go ${both.toFixed(3)} s after the take)`);
    assert.ok(ball.segments!.every((seg) => seg.mode === "held" || seg.to - seg.from < 1e-9), `${name}: no flight`);
    assert.ok(ballSteps(built.objects) < 0.06 * TEST_HEIGHT, `${name}: the ball moves smoothly (${ballSteps(built.objects).toFixed(1)} px a frame at 24 fps)`);
    // The giver holds it out in front with both hands, at about chest height, when it changes hands.
    const i = Math.round(scene.marks["b.catch1.catch"] * 24), giver = built.frames[i][0].skeleton, b = built.objects[i][0];
    assert.ok(b.x > giver.neck.x + 0.15 * TEST_HEIGHT && Math.abs(b.y - giver.neck.y) < 0.15 * TEST_HEIGHT, `${name}: held out at chest height`);
  }
  // Just past the reach: a real (underhand) toss through the air.
  const toss = fitPlanToPage(passPlan(320), LIBRARY, 1920);
  assert.ok(toss.objects![0].segments!.some((seg) => seg.mode === "flight" && seg.to - seg.from > 0.2), "320 px apart: tossed");
});

test("bounce pass (round 6): `bounce: true` sends the ball down to the floor once and up into the catcher's hands; the catch is timed to it automatically", () => {
  for (const [gap, overhand] of [[560, undefined], [900, undefined], [560, true]] as const) {
    const scene = fitPlanToPage(passPlan(gap, { bounce: true, ...(overhand ? { overhand } : {}) }), LIBRARY, 1920);
    const name = `bounce pass ${gap}${overhand ? " overhand" : ""}`;
    const built = assertNatural(scene, name);
    const flight = scene.objects![0].segments!.find((seg) => seg.mode === "flight")!;
    assert.ok(flight && flight.mode === "flight" && flight.bounce, `${name}: a bounce flight`);
    const floor = TEST_GROUND - ballLook("basketball").size / 2;
    const f0 = Math.round(flight.from * 24), f1 = Math.round(flight.to * 24);
    const ys = built.objects.slice(f0, f1 + 1).map((list) => list[0].y);
    const lowest = Math.max(...ys);
    assert.ok(floor - lowest < 0.05 * TEST_HEIGHT, `${name}: it reaches the floor (${(floor - lowest).toFixed(1)} px above it at the lowest frame)`);
    // Down, then up: one bounce (the height only turns once, at the floor).
    let turns = 0;
    for (let i = 2; i < ys.length; i += 1) if ((ys[i] - ys[i - 1]) * (ys[i - 1] - ys[i - 2]) < 0) turns += 1;
    assert.ok(turns <= 1, `${name}: one bounce (${turns} turns)`);
    assert.ok(ballSteps(built.objects) < 70, `${name}: the ball never jumps (${ballSteps(built.objects).toFixed(0)} px a frame)`);
  }
});

test("throw it away (round 6): `to: \"away\"` — a big overhand, the ball arcs up over the other figure and off the page, then it's gone; the off-page part never shrinks the scene", () => {
  const plan = BALL_PLAN([
    { id: "a", x: 1150, facing: "left", actions: [{ move: "throw", params: { object: "ball", to: "away" } }, { move: "wait", params: { seconds: 1.5 } }] },
    { id: "b", x: 700, facing: "right", actions: [{ move: "stand", params: { seconds: 3 } }] },
  ]);
  const scene = fitPlanToPage(plan, LIBRARY, 1920);
  assert.deepEqual(scene.characters.map((c) => c.keys[0].x), [1150, 700], "not squashed to fit");
  const built = assertNatural(scene, "throw away");
  const release = Math.round(scene.marks["a.throw1.release"] * 24);
  const thrower = built.frames[release - 1][0].skeleton;
  assert.ok(heldCenter(built.frames[release - 1][0], BALL_HAND, BALL_PX).y < thrower.neck.y, "thrown overhand");
  // It passes high over the other figure's head, flagged as leaving the page, and is gone at the end.
  const over = built.objects.slice(release).find((list) => list[0] && list[0].x < 700);
  assert.ok(over && over[0].leaving && over[0].y < built.frames[release][1].skeleton.head.y - 0.5 * TEST_HEIGHT, "arcs high over the other figure");
  assert.equal(built.objects[built.objects.length - 1].length, 0, "gone at the end");
  const page = centerAnimation(built.frames, 1920, built.objects);
  assert.ok(page.fits, "the rest of the animation fits the page");
});

test("never told (Arthur's round-6 example): an overhand bounce pass to a friend, who throws it away over the first one's head, then both sit down — built on a 16:9 page, every body rule kept", () => {
  const plan: ScenePlan = {
    id: "bounce-away", title: "Bounce pass, throw it away, sit", height: TEST_HEIGHT, groundY: TEST_GROUND,
    characters: [
      { id: "a", x: 700, facing: "right", actions: [{ move: "throw", params: { object: "ball", to: "b", bounce: true, overhand: true } }, { move: "wait", params: { seconds: 1.2 } }, { move: "sit", params: { seconds: 2 } }] },
      { id: "b", x: 1220, facing: "left", actions: [{ move: "catch", params: { object: "ball", from: "a" } }, { move: "throw", params: { object: "ball", to: "away" } }, { move: "sit", params: { seconds: 2 } }] },
    ],
    objects: [{ id: "ball", look: ballLook("basketball"), heldBy: "a" }],
  };
  const scene = fitPlanToPage(plan, LIBRARY, 1920);
  const built = assertNatural(scene, "round-6 example");
  const modes = scene.objects![0].segments!.map((seg) => (seg.mode === "held" ? `held:${seg.character}` : seg.bounce ? "bounce" : seg.away ? "away" : "flight"));
  assert.deepEqual(modes, ["held:a", "held:a", "bounce", "held:b", "held:b", "away"]);
  assert.ok(scene.marks["b.catch1.catch"] < scene.marks["b.throw1.release"] && scene.marks["b.throw1.release"] < scene.marks["b.sit1.seated"], "catch, throw away, then sit");
  assert.ok(centerAnimation(built.frames, 1920, built.objects).fits, "fits the page");
});
