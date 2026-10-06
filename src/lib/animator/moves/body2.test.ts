import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type FrameCharacter, type Scene, type SceneObject } from "../engine.ts";
import { ballLook, heldCenter } from "../objects.ts";
import { DEFAULT_STYLE, STAND, STAND_FRONT, type Facing, type JointName, type PoseAngles, type Skeleton } from "../rig.ts";
import { highFive, highFiveMaxDistance, highFiveSlapOffset, touchGap } from "./highFive.ts";
import { kick } from "./kick.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { feetOf, inGuard, LEVEL_UP, punch } from "./punch.ts";
import { allSettings, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { BALL_HAND, catchBall, catchOffset, catchPoint, HOLD_BALL, releaseOffset, throwBall } from "./throwCatch.ts";
import { wave } from "./wave.ts";

// SPEC-0017 Phase 2 Round B body moves: punch, kick, wave, high-five, throw and catch — after Arthur's
// review (2026-10-04): every wind-up goes the opposite way of the action, moves FLOW into each other
// (no standing in between), and the ball is held in the hands, never by the face.

const SIDES: Facing[] = ["right", "left"];
const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const label = (name: string, s: MoveSettings, facing: Facing) => `${name}/${s.style}/${s.speed}/${s.energy}/${facing}`;
// Start mid-scene and off-center, so chaining (start time and place) is really tested.
const stanceAt = (facing: Facing, pose: PoseAngles = facing === "front" ? STAND_FRONT : STAND): Stance => ({ ...startStance(facing, 700, 1.25), pose });
const fwd = (facing: Facing) => (facing === "left" ? -1 : 1);

// Starts exactly where it was told, ends standing still in `endPose` on both feet where it started,
// the marks come in the given order inside the move, and the return to rest is marked (flow).
function assertMove(out: MoveOutput, start: Stance, endPose: PoseAngles, marks: string[], name: string, restMarks: string[] = []) {
  const first = out.keys[0], last = out.keys[out.keys.length - 1];
  assert.equal(first.t, start.t, `${name}: starts on time`);
  assert.equal(first.x, start.x, `${name}: starts in place`);
  assert.deepEqual(first.pose, start.pose, `${name}: starts from the given pose`);
  assert.deepEqual(last.pose, endPose, `${name}: ends in its rest pose`);
  assert.ok(Math.abs(last.x - start.x) < 1e-6, `${name}: ends where it started (${last.x} vs ${start.x})`);
  assert.equal(last.lift ?? 0, 0, `${name}: ends on the ground`);
  assert.deepEqual([...(last.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${name}: ends on both feet`);
  assert.deepEqual(out.end, { t: last.t, x: last.x, facing: start.facing, pose: endPose }, `${name}: end stance`);
  let previous = start.t, action = start.t;
  for (const mark of [...marks, ...restMarks]) {
    const t = out.marks[mark];
    assert.ok(t !== undefined, `${name}: mark "${mark}" exists`);
    assert.ok(t > previous && t <= last.t, `${name}: mark "${mark}" in order`);
    previous = t;
    if (marks.includes(mark)) action = t;
  }
  // FLOW: the return to rest is marked, and the flow point comes after the marks (the action is over).
  assert.ok(out.flow, `${name}: has a flow point`);
  assert.ok(out.flow!.keys >= 2 && out.flow!.keys < out.keys.length, `${name}: flow point inside the move`);
  const at = out.keys[out.flow!.keys - 1];
  assert.deepEqual(out.flow!.stance, { t: at.t, x: at.x, facing: start.facing, pose: at.pose }, `${name}: flow stance = the key before the rest`);
  assert.ok(at.t >= action - 1e-9, `${name}: flow after the action's marks`);
  for (const mark of restMarks) assert.ok(out.marks[mark] > at.t, `${name}: "${mark}" is part of the return to rest`);
  assert.deepEqual([...(at.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${name}: flow pose stands on both feet`);
}

// Frames at a fine rate (for speeds and directions).
const FINE_FPS = 120;
const fine = (keys: CharacterKey[], facing: Facing) => buildScene(sceneOfKeys(keys, facing), FINE_FPS).frames.map((f) => f[0].skeleton);
const at = (frames: Skeleton[], t: number) => frames[Math.min(frames.length - 1, Math.round(t * FINE_FPS))];
// A joint's forward / upward position from the hips (x height), and the torso's forward lean (degrees).
const ahead = (s: Skeleton, joint: JointName, facing: Facing) => ((s[joint].x - s.hip.x) * fwd(facing)) / TEST_HEIGHT;
const above = (s: Skeleton, joint: JointName) => (s.hip.y - s[joint].y) / TEST_HEIGHT;
const leanOf = (s: Skeleton, facing: Facing) => (Math.atan2((s.neck.x - s.hip.x) * fwd(facing), s.hip.y - s.neck.y) * 180) / Math.PI;

// Fastest a joint moves (px/s) between two times.
function peakSpeed(frames: Skeleton[], joint: JointName, from: number, to: number) {
  let peak = 0;
  for (let i = Math.ceil(from * FINE_FPS) + 1; i <= Math.min(frames.length - 1, Math.floor(to * FINE_FPS)); i += 1) {
    const a = frames[i - 1][joint], b = frames[i][joint];
    peak = Math.max(peak, Math.hypot(b.x - a.x, b.y - a.y) * FINE_FPS);
  }
  return peak;
}

// Arthur's lesson: the wind-up is slow and the action is fast (at least 3x the wind-up's top speed; a
// robot's even-speed moves at least 1.5x).
function assertFastAction(frames: Skeleton[], joint: JointName, windFrom: number, windTo: number, hit: number, name: string, ratio = 3) {
  const wind = peakSpeed(frames, joint, windFrom, windTo);
  const action = peakSpeed(frames, joint, windTo, hit);
  assert.ok(action >= ratio * wind, `${name}: action ${action.toFixed(0)} px/s is not ${ratio}x the wind-up ${wind.toFixed(0)} px/s`);
}

test("punch: natural body, guard -> slow wind-up the opposite way -> fast hit -> guard (flow) -> stand, every style/speed/energy, both directions", () => {
  for (const settings of allSettings()) for (const facing of SIDES) for (const hand of ["front", "back"] as const) for (const height of ["head", "body"] as const) {
    const name = label(`punch-${hand}-${height}`, settings, facing);
    const start = stanceAt(facing);
    const out = punch(start, { hand, height }, settings);
    assertNatural(sceneOfKeys(out.keys, facing), name);
    assertMove(out, start, STAND, ["guard", "windup", "hit", "back"], name);
    // The flow pose is the guard (hands up by the face, fighting stance).
    assert.ok(inGuard(out.flow!.stance.pose, feetOf(out.flow!.stance.pose)), `${name}: flows from the guard`);
    const robot = settings.style === "robot";
    const fist: JointName = hand === "back" ? "rHand" : "lHand";
    const frames = fine(out.keys, facing);
    const [g, w, h] = [at(frames, out.marks.guard), at(frames, out.marks.windup), at(frames, out.marks.hit)];
    // OPPOSITE WAY: the fist goes back (relative to the hips) and the body leans back, then both go forward.
    assert.ok(ahead(w, fist, facing) < ahead(g, fist, facing) - 0.05, `${name}: fist goes back in the wind-up`);
    assert.ok(ahead(h, fist, facing) > ahead(g, fist, facing) + 0.1, `${name}: then forward into the hit`);
    assert.ok(leanOf(w, facing) < leanOf(g, facing) - 1, `${name}: leans back in the wind-up`);
    assert.ok(leanOf(h, facing) > leanOf(g, facing) + 2, `${name}: leans forward into the hit`);
    assertFastAction(frames, fist, out.marks.guard, out.marks.windup, out.marks.hit, name, robot ? 1.5 : 3);
  }
});

test("punch: the cross winds up big (elbow back at shoulder height, fist up behind the head, other arm pointing at the target); the jab small", () => {
  for (const facing of SIDES) {
    const cross = punch(startStance(facing), {}, NATURAL), jab = punch(startStance(facing), { hand: "front" }, NATURAL);
    const c = at(fine(cross.keys, facing), cross.marks.windup), j = at(fine(jab.keys, facing), jab.marks.windup);
    // (Arthur's cocked arm, round 4: upper arm straight back, forearm folded up, so the fist is up behind the head.)
    assert.ok(ahead(c, "rElbow", facing) < ahead(c, "neck", facing) - 0.12, `${facing}: cross elbow well behind the shoulder`);
    assert.ok(Math.abs(c.rElbow.y - c.neck.y) < 0.06 * TEST_HEIGHT, `${facing}: ...at about shoulder height`);
    assert.ok(ahead(c, "rHand", facing) <= ahead(c, "head", facing), `${facing}: cross fist at or behind the head`);
    assert.ok(c.rHand.y < c.neck.y, `${facing}: cross fist up at or above shoulder height (forearm up)`);
    assert.ok(ahead(c, "lHand", facing) > ahead(c, "neck", facing) + 0.2, `${facing}: the other arm reaches toward the target`);
    assert.ok(ahead(j, "lHand", facing) > ahead(c, "rHand", facing) + 0.1, `${facing}: the jab draws back less`);
  }
});

// (Changed after Arthur's round-6 review: the head punch used to land at the middle of a same-size head,
// 0.83 x height, which from a lunge made the arm point UP — "the most common punch ... is a straight
// punch, not a punch up there or down there". Now a head punch flies level: as high as the head, or as a
// nearly level arm reaches (punch.ts LEVEL_UP); a body punch lands at the chest, lower.)
test("punch: the fist reaches straight out at the target height (head: level, as high as a level arm goes; body: the chest)", () => {
  for (const facing of SIDES) {
    const handAt = (height: "head" | "body") => {
      const out = punch(startStance(facing), { height }, NATURAL);
      const built = buildScene(sceneOfKeys(out.keys, facing), 240);
      const s = built.frames[Math.round(out.marks.hit * 240)][0].skeleton;
      assert.ok((s.rHand.x - s.hip.x) * fwd(facing) > 0.25 * TEST_HEIGHT, `${facing}: the arm reaches forward`);
      const up = (Math.atan2(s.neck.y - s.rHand.y, Math.abs(s.rHand.x - s.neck.x)) * 180) / Math.PI;
      return { y: (TEST_GROUND - s.rHand.y) / TEST_HEIGHT, up };
    };
    const head = handAt("head"), body = handAt("body");
    assert.ok(head.up <= LEVEL_UP + 1 && head.up >= 0, `${facing}: head punch flies level (${head.up.toFixed(1)} degrees up)`);
    assert.ok(Math.abs(body.y - 0.66) < 0.03, `${facing}: body punch at chest height (${body.y.toFixed(2)})`);
    assert.ok(head.y > body.y + 0.03, `${facing}: the head punch lands higher than the body punch (${head.y.toFixed(2)} vs ${body.y.toFixed(2)})`);
  }
});

test("kick: weight shift -> leg swings BACK while the body leans forward -> fast kick, leaning back -> lands in the fighting stance (flow) -> stand; standing foot never moves", () => {
  for (const settings of allSettings()) for (const facing of SIDES) for (const height of ["low", "mid", "high"] as const) {
    const name = label(`kick-${height}`, settings, facing);
    const start = stanceAt(facing);
    const out = kick(start, { height }, settings);
    const built = assertNatural(sceneOfKeys(out.keys, facing), name);
    assertMove(out, start, STAND, ["shift", "windup", "hit", "land"], name);
    assert.ok(inGuard(out.flow!.stance.pose, feetOf(out.flow!.stance.pose)), `${name}: lands in the fighting stance with the hands up`);
    // The standing (right) foot stays on its spot for the whole move.
    const feet = built.frames.map((f) => f[0].skeleton.rFoot);
    for (const foot of feet) assert.ok(Math.hypot(foot.x - feet[0].x, foot.y - feet[0].y) < 1, `${name}: standing foot moved`);
    // Only the standing foot is planted while the kicking foot is up.
    for (const key of out.keys) if (key.t > out.marks.shift && key.t < out.marks.land) assert.deepEqual(key.contacts, ["rFoot"], `${name}: only the standing foot planted`);
    const frames = fine(out.keys, facing);
    const [s, w, h] = [at(frames, out.marks.shift), at(frames, out.marks.windup), at(frames, out.marks.hit)];
    // OPPOSITE WAY: the foot goes behind the hip and the body leans forward; then the foot is in front
    // and the body leans back.
    assert.ok(ahead(w, "lFoot", facing) < -0.12, `${name}: foot behind the hip in the wind-up (${ahead(w, "lFoot", facing).toFixed(2)})`);
    assert.ok(ahead(h, "lFoot", facing) > 0.2, `${name}: foot in front at the hit`);
    assert.ok(leanOf(w, facing) > leanOf(s, facing) + 3, `${name}: leans forward in the wind-up`);
    assert.ok(leanOf(h, facing) < leanOf(s, facing) - 3, `${name}: leans back at the hit`);
    assertFastAction(frames, "lFoot", out.marks.shift, out.marks.windup, out.marks.hit, name, settings.style === "robot" ? 1.5 : 3);
  }
});

test("kick: the foot reaches the chosen height", () => {
  const want = { low: 0.2, mid: 0.5, high: 0.8 };
  for (const height of ["low", "mid", "high"] as const) {
    const out = kick(startStance(), { height }, NATURAL);
    const s = buildScene(sceneOfKeys(out.keys), 240).frames[Math.round(out.marks.hit * 240)][0].skeleton;
    assert.ok(Math.abs((TEST_GROUND - s.lFoot.y) / TEST_HEIGHT - want[height]) < 0.03, `${height} kick height`);
  }
});

test("wave: dips first, arm up, swings, arm down, in side and front view, either hand", () => {
  for (const settings of allSettings()) for (const facing of ["right", "left", "front"] as const) for (const hand of ["left", "right"] as const) for (const times of [1, 2, 3]) {
    const name = label(`wave-${hand}-${times}`, settings, facing);
    const start = stanceAt(facing);
    const out = wave(start, { hand, times }, settings);
    assertNatural(sceneOfKeys(out.keys, facing), name);
    assertMove(out, start, facing === "front" ? STAND_FRONT : STAND, ["up"], name, ["down"]);
    // The waving hand is above the head while waving.
    const built = buildScene(sceneOfKeys(out.keys, facing), 24);
    const mid = built.frames[Math.round(((out.marks.up + out.marks.down) / 2) * 24)][0].skeleton;
    assert.ok(mid[hand === "left" ? "lHand" : "rHand"].y < mid.head.y, `${name}: hand up while waving`);
  }
});

// Two figures facing each other `distance` apart, both doing the high-five at the same time.
function highFivePair(distance: number, settings: MoveSettings) {
  const a = highFive(startStance("right", 960 - distance / 2), { partnerDistance: distance }, settings);
  const b = highFive(startStance("left", 960 + distance / 2), { partnerDistance: distance }, settings);
  const scene: Scene = {
    id: "pair", title: "pair", durationSec: Math.ceil((a.end.t + 0.2) * 10) / 10, groundY: TEST_GROUND,
    characters: [
      { id: "a", name: "A", facing: "right", height: TEST_HEIGHT, style: DEFAULT_STYLE, keys: a.keys },
      { id: "b", name: "B", facing: "left", height: TEST_HEIGHT, style: DEFAULT_STYLE, keys: b.keys },
    ],
  };
  return { a, b, scene };
}

test("high-five: wind-up up and BACK behind the head while leaning back, step in, fast slap, bounce (flow), step back, every style/speed/energy, both directions", () => {
  for (const settings of allSettings()) for (const facing of SIDES) for (const distance of [150, 240, 300]) {
    const name = label(`highFive-${distance}`, settings, facing);
    const start = stanceAt(facing);
    const out = highFive(start, { partnerDistance: distance }, settings);
    assertNatural(sceneOfKeys(out.keys, facing), name);
    assertMove(out, start, STAND, ["ready", "cocked", "slap"], name, ["back"]);
    assert.ok(Math.abs(out.marks.slap - start.t - highFiveSlapOffset(settings)) < 1e-9, `${name}: slap offset`);
    const frames = fine(out.keys, facing);
    const [s, c, h] = [at(frames, start.t), at(frames, out.marks.cocked), at(frames, out.marks.slap)];
    // OPPOSITE WAY: the arm is up behind the head, the body leaning back; then forward at the slap.
    // (Arthur's round-6 drawing: the ELBOW up behind the head and the forearm standing up, the hand above
    // it and still behind the head. Before round 6 this asked for the hand folded right behind the head.)
    assert.ok(ahead(c, "lElbow", facing) < ahead(c, "head", facing) - 0.05 && c.lElbow.y < c.neck.y, `${name}: elbow up behind the head`);
    assert.ok(ahead(c, "lHand", facing) < ahead(c, "head", facing) - 0.03 && c.lHand.y < c.lElbow.y, `${name}: forearm up, hand behind the head`);
    assert.ok(c.lHand.y < c.neck.y, `${name}: hand up (above the shoulders)`);
    assert.ok(leanOf(c, facing) < leanOf(s, facing) - 1, `${name}: leans back in the wind-up`);
    assert.ok(ahead(h, "lHand", facing) > ahead(h, "head", facing) + 0.05, `${name}: hand in front at the slap`);
    assert.ok(leanOf(h, facing) > leanOf(c, facing) + 4, `${name}: leans in for the slap`);
    assertFastAction(frames, "lHand", start.t, out.marks.cocked, out.marks.slap, name, settings.style === "robot" ? 1.5 : 3);
  }
});

test("high-five: two mirrored figures' hands meet at the midpoint, about head height, at the slap", () => {
  const fps = 240;
  for (const settings of allSettings()) for (const distance of [150, 240, 300]) {
    const { a, scene } = highFivePair(distance, settings);
    const built = buildScene(scene, fps);
    assert.ok(built.report.ok, "body rules");
    // (Just after the slap: the hands stay pressed together for a moment.)
    const [ra, rb] = built.frames[Math.ceil(a.marks.slap * fps)];
    const ha = ra.skeleton.lHand, hb = rb.skeleton.lHand;
    const name = `${settings.style}/${settings.speed}/${settings.energy}/${distance}`;
    // Tip to tip: the hand points are one line thickness apart (the round line ends just touch).
    const apart = Math.hypot(ha.x - hb.x, ha.y - hb.y);
    assert.ok(Math.abs(apart - touchGap(DEFAULT_STYLE.thickness)) < 2, `${name}: hands ${apart.toFixed(1)}px apart at the slap`);
    assert.ok(Math.abs((ha.x + hb.x) / 2 - 960) < 1, `${name}: at the midpoint`);
    const up = (TEST_GROUND - ha.y) / TEST_HEIGHT;
    assert.ok(up > 0.84 && up < 0.97, `${name}: about head height (${up.toFixed(2)})`);
    // The hands never pass through each other.
    for (const [fa, fb] of built.frames) assert.ok(fa.skeleton.lHand.x - fb.skeleton.lHand.x < -touchGap(DEFAULT_STYLE.thickness) + 0.5, `${name}: hands crossed`);
  }
  assert.ok(highFiveMaxDistance(TEST_HEIGHT) > 300);
});

// A pass as the planner makes it: the thrower holds the ball in both hands until "oneHand", in the
// throwing hand until "release", it flies, and the catcher holds it in both hands from "catch" on.
function passScene(settings: MoveSettings, overhand: boolean, gap = 560, throwerPose: PoseAngles = HOLD_BALL) {
  const a = throwBall({ t: 0, x: 960 - gap / 2, facing: "right", pose: throwerPose }, { distance: gap, overhand }, settings);
  const lead = catchOffset(settings);
  const b = catchBall({ t: a.marks.release + 0.6 - lead, x: 960 + gap / 2, facing: "left", pose: STAND }, {}, settings);
  const end = Math.max(a.end.t, b.end.t) + 0.2;
  const ball: SceneObject = {
    id: "ball", name: "Ball", look: ballLook("basketball"), keys: [],
    segments: [
      { from: 0, to: a.marks.oneHand, mode: "held", character: "a", joint: "hands" },
      { from: a.marks.oneHand, to: a.marks.release, mode: "held", character: "a", joint: "rHand" },
      { from: a.marks.release, to: b.marks.catch, mode: "flight" },
      { from: b.marks.catch, to: end, mode: "held", character: "b", joint: "hands" },
    ],
  };
  const scene: Scene = {
    id: "pass", title: "pass", durationSec: Math.ceil(end * 10) / 10, groundY: TEST_GROUND,
    characters: [
      { id: "a", name: "A", facing: "right", height: TEST_HEIGHT, style: DEFAULT_STYLE, keys: a.keys },
      { id: "b", name: "B", facing: "left", height: TEST_HEIGHT, style: DEFAULT_STYLE, keys: [{ ...b.keys[0], t: 0 }, ...b.keys] },
    ],
    objects: [ball],
  };
  return { a, b, scene };
}

const BALL_PX = ballLook("basketball").size / 2;
const headClear = (c: FrameCharacter, ball: { x: number; y: number }) => Math.hypot(ball.x - c.skeleton.head.x, ball.y - c.skeleton.head.y) - c.headRadius - BALL_PX;

test("ball: held IN THE HANDS in front of the chest (HOLD_BALL, catch), never over the head; both hands on it", () => {
  for (const facing of SIDES) for (const pose of [HOLD_BALL]) {
    const s = buildScene(sceneOfKeys([{ t: 0, x: 960, pose, contacts: ["lFoot", "rFoot"] }, { t: 0.5, x: 960, pose, contacts: ["lFoot", "rFoot"] }], facing), 24).frames[0][0];
    const c = heldCenter(s, "hands", BALL_PX);
    assert.ok(headClear(s, c) > 0.02 * TEST_HEIGHT, `${facing}: ball clear of the head (${headClear(s, c).toFixed(1)} px)`);
    for (const hand of ["lHand", "rHand"] as const) assert.ok(Math.hypot(c.x - s.skeleton[hand].x, c.y - s.skeleton[hand].y) <= BALL_PX + 0.5, `${facing}: ${hand} on the ball`);
    assert.ok(ahead(s.skeleton, "lHand", facing) > 0.1 && (c.x - s.skeleton.neck.x) * fwd(facing) > 0.12 * TEST_HEIGHT, `${facing}: in front of the body`);
    const height = (TEST_GROUND - c.y) / TEST_HEIGHT;
    assert.ok(height > 0.5 && height < 0.7, `${facing}: at chest/belly height (${height.toFixed(2)})`);
  }
});

test("throw + catch: the ball never covers a head; in two hands it touches both, in one hand it rests in it; no jump when it goes into one hand", () => {
  for (const settings of allSettings()) for (const overhand of [true, false]) {
    const name = `${label("pass", settings, "right")}/${overhand ? "over" : "under"}`;
    const { a, b, scene } = passScene(settings, overhand, overhand ? 560 : 400);
    const built = buildScene(scene, 24);
    assert.ok(built.report.ok, `${name}: body rules`);
    const balls = built.objects.map((f) => f[0]);
    for (let i = 0; i < built.frames.length; i += 1) {
      const t = i / 24, ball = balls[i];
      const [ca, cb] = built.frames[i];
      // Held (thrower before the release, catcher after the catch): never over the head.
      if (t <= a.marks.release) assert.ok(headClear(ca, ball) > 0, `${name}@${t.toFixed(2)}: ball over the thrower's head (${headClear(ca, ball).toFixed(1)})`);
      if (t >= b.marks.catch) assert.ok(headClear(cb, ball) > 0, `${name}@${t.toFixed(2)}: ball over the catcher's head`);
      const holder = t < a.marks.oneHand ? ca : t >= b.marks.catch + 1e-9 ? cb : null;
      if (holder) for (const hand of ["lHand", "rHand"] as const) {
        assert.ok(Math.hypot(ball.x - holder.skeleton[hand].x, ball.y - holder.skeleton[hand].y) <= BALL_PX + 1, `${name}@${t.toFixed(2)}: ${hand} on the ball`);
      }
    }
    // At "oneHand" the ball is in the same place whether both hands or the throwing hand hold it, so
    // it does not jump when it goes into one hand (at 24 fps: the switch frame's step is no bigger
    // than the steps around it).
    const exact = buildScene(scene, 240).frames[Math.round(a.marks.oneHand * 240)][0];
    const both = heldCenter(exact, "hands", BALL_PX), one = heldCenter(exact, BALL_HAND, BALL_PX);
    assert.ok(Math.hypot(both.x - one.x, both.y - one.y) < 2, `${name}: ball ${Math.hypot(both.x - one.x, both.y - one.y).toFixed(2)} px apart in one hand vs both`);
    // On the frame where the planner switches it (the frame nearest "oneHand"), both ways of holding
    // put the ball within a few px of each other at 24 and 12 fps (it moves more than that per frame).
    for (const [fps, limit] of [[24, 3], [12, 5]] as const) {
      const c = buildScene(scene, fps).frames[Math.round(a.marks.oneHand * fps)][0];
      const j1 = heldCenter(c, "hands", BALL_PX), j2 = heldCenter(c, BALL_HAND, BALL_PX);
      assert.ok(Math.hypot(j1.x - j2.x, j1.y - j2.y) < limit, `${name}@${fps}fps: the ball jumps ${Math.hypot(j1.x - j2.x, j1.y - j2.y).toFixed(1)} px going into one hand`);
    }
  }
});

test("throw: gather (oneHand) -> slow wind-up the opposite way (arm back and up, ball behind the head, leaning back, other arm pointing) -> fastest at the release, forward and up -> follow-through (flow) -> stand", () => {
  for (const settings of allSettings()) for (const facing of SIDES) for (const overhand of [true, false]) for (const distance of [300, 900]) {
    const name = label(`throw-${overhand ? "over" : "under"}-${distance}`, settings, facing);
    const start = stanceAt(facing, HOLD_BALL);
    const out = throwBall(start, { distance, overhand }, settings);
    assertNatural(sceneOfKeys(out.keys, facing), name);
    assertMove(out, start, STAND, ["oneHand", "windup", "release"], name);
    assert.ok(Math.abs(out.marks.release - start.t - releaseOffset(settings, { distance, overhand })) < 1e-9, `${name}: release offset`);
    const frames = fine(out.keys, facing);
    const [g, w, r] = [at(frames, out.marks.oneHand), at(frames, out.marks.windup), at(frames, out.marks.release)];
    // OPPOSITE WAY: the throwing hand goes back (behind the head), the body leans back, the other hand
    // points forward; then the hand comes forward to let go.
    assert.ok(ahead(w, BALL_HAND, facing) < ahead(w, "head", facing) - 0.15, `${name}: hand back behind the body`);
    if (overhand) assert.ok(w[BALL_HAND].y < w.neck.y, `${name}: overhand: hand up above the shoulders`);
    assert.ok(ahead(w, "lHand", facing) > ahead(w, "neck", facing) + 0.2, `${name}: other arm points at the catcher`);
    assert.ok(leanOf(w, facing) < leanOf(g, facing) - 1, `${name}: leans back`);
    // (Overhand lets go right above the head, coming forward from behind it.)
    assert.ok(ahead(r, BALL_HAND, facing) > ahead(w, BALL_HAND, facing) + (overhand ? 0.1 : 0.2), `${name}: hand comes forward to let go`);
    assert.ok(leanOf(r, facing) > leanOf(w, facing) + 3, `${name}: leans into the throw`);
    if (settings.style === "robot") continue; // a robot's wind-up is a plain even-speed beat
    // A weak, lazy throw (low energy, tired, hurt) whips less hard than its wind-up; a real one 3x.
    assertFastAction(frames, BALL_HAND, out.marks.oneHand, out.marks.windup, out.marks.release, name, settings.energy < 0.5 || settings.style === "tired" || settings.style === "hurt" || (overhand && distance < 1.6 * TEST_HEIGHT) ? 1.4 : 2.3);
    // The hand is moving fastest at the release, forward and upward.
    const speeds = frames.slice(1).map((f, i) => {
      const p = f[BALL_HAND], q = frames[i][BALL_HAND];
      return { t: (i + 1) / FINE_FPS, vx: (p.x - q.x) * fwd(facing), vy: q.y - p.y, v: Math.hypot(p.x - q.x, p.y - q.y) };
    });
    const fastest = speeds.reduce((m, s) => (s.v > m.v ? s : m));
    const leaving = speeds[Math.floor(out.marks.release * FINE_FPS) - 1];
    assert.ok(leaving.v >= 0.9 * fastest.v, `${name}: ${leaving.v.toFixed(0)} px/s at the release, fastest ${fastest.v.toFixed(0)} px/s at ${fastest.t.toFixed(3)}`);
    // Let go right above the head, the hand moving forward (level or a little up/down as the body leans in).
    assert.ok(leaving.vx > 0 && leaving.vy > -0.3 * leaving.vx, `${name}: release goes forward (not down)`);
  }
});

test("catch: arms reach forward, the ball arrives in the hands, they give back toward the chest, held at the chest (flow); then throw it on", () => {
  for (const settings of allSettings()) for (const facing of SIDES) {
    const name = label("catch", settings, facing);
    const start = stanceAt(facing);
    const out = catchBall(start, {}, settings);
    assertNatural(sceneOfKeys(out.keys, facing), name);
    assertMove(out, start, HOLD_BALL, ["ready", "catch", "secured"], name);
    assert.ok(Math.abs(out.marks.catch - start.t - catchOffset(settings)) < 1e-9, `${name}: catch offset`);
    // At "catch" the ball (between the hands) is at the catch point, in front at chest/face height.
    const built = buildScene(sceneOfKeys(out.keys, facing), 240);
    const s = built.frames[Math.round(out.marks.catch * 240)][0];
    const c = heldCenter(s, "hands", BALL_PX), point = catchPoint(facing, start.x, TEST_HEIGHT, TEST_GROUND);
    assert.ok(Math.hypot(c.x - point.x, c.y - point.y) < 2, `${name}: ball at the catch point`);
    assert.ok((c.x - s.skeleton.neck.x) * fwd(facing) > 0.2 * TEST_HEIGHT, `${name}: hands out in front`);
    const secured = heldCenter(built.frames[Math.round(out.marks.secured * 240)][0], "hands", BALL_PX);
    assert.ok((secured.x - c.x) * fwd(facing) < -0.03 * TEST_HEIGHT, `${name}: gives back toward the chest`);
    // Chaining: catch -> throw from where the catch flows into it.
    const next = throwBall(out.flow!.stance, { distance: 600 }, settings);
    assertNatural(sceneOfKeys([...out.keys.slice(0, out.flow!.keys - 1), ...next.keys], facing), `${name} then throw`);
  }
});

// The planner's flow, simulated: each move starts from the one before's flow point (its return to rest
// left out); the last move keeps its return to rest.
type Step = [(start: Stance, params: never, settings: MoveSettings) => MoveOutput, Record<string, unknown>];
function chain(steps: Step[], start: Stance, settings: MoveSettings) {
  const keys: CharacterKey[] = [];
  const outs: MoveOutput[] = [];
  let here = start;
  steps.forEach(([move, params], i) => {
    const out = (move as (s: Stance, p: unknown, set: MoveSettings) => MoveOutput)(here, params, settings);
    outs.push(out);
    const last = i === steps.length - 1;
    const part = last ? out.keys : out.keys.slice(0, out.flow!.keys);
    for (const key of part) {
      if (keys.length && Math.abs(keys[keys.length - 1].t - key.t) < 1e-4) keys[keys.length - 1] = { ...key, ease: key.ease ?? keys[keys.length - 1].ease };
      else keys.push(key);
    }
    here = last ? out.end : out.flow!.stance;
  });
  return { keys, outs };
}

test("flow: jab -> cross -> kick -> jab chains straight from guard to guard (no standing in between), natural body, every style/speed/energy", () => {
  const steps: Step[] = [[punch, { hand: "front" }], [punch, { hand: "back" }], [kick, { height: "high" }], [punch, { hand: "front" }]];
  for (const settings of allSettings()) for (const facing of SIDES) {
    const name = label("jab-cross-kick-jab", settings, facing);
    const { keys, outs } = chain(steps, stanceAt(facing), settings);
    assertNatural(sceneOfKeys(keys, facing), name);
    // Standing (STAND) only at the very start and the very end.
    const standing = keys.filter((k) => JSON.stringify(k.pose) === JSON.stringify(STAND));
    assert.deepEqual(standing.map((k) => k.t), [keys[0].t, keys[keys.length - 1].t], `${name}: stands only at the start and the end`);
    // Between the first guard and the last hit the hands never drop below the chest (the guard stays up),
    // except the kick's balancing arms.
    const frames = buildScene(sceneOfKeys(keys, facing), 24).frames.map((f) => f[0].skeleton);
    const kickFrom = outs[2].keys[0].t, kickTo = outs[2].marks.land;
    for (let i = Math.ceil(outs[0].marks.guard * 24); i <= Math.floor(outs[3].marks.hit * 24); i += 1) {
      const t = i / 24;
      if (t > kickFrom && t < kickTo) continue;
      // (A strong cross is an overhand: its own arm goes up and back through the wind-up, and from the hit
      // until it is back in the guard the other arm swings back behind the body — Arthur's arms switch.)
      const crossing = t > outs[1].keys[0].t && t < outs[1].marks.hit;
      const switching = t > outs[1].marks.windup && t < outs[1].marks.back;
      for (const hand of ["lHand", "rHand"] as const) {
        if (crossing && hand === "rHand") continue;
        if (switching && hand === "lHand") continue;
        assert.ok(above(frames[i], hand) > 0.15, `${name}@${t.toFixed(2)}: ${hand} dropped (guard down)`);
      }
    }
    // Each move after the first starts in the guard and goes straight into its wind-up (no guard beat).
    for (const out of outs.slice(1)) assert.ok(inGuard(out.keys[0].pose, feetOf(out.keys[0].pose)), `${name}: starts from the guard`);
    assert.equal(outs[1].marks.guard, undefined, `${name}: the cross starts straight from the guard`);
    assert.equal(outs[3].marks.guard, undefined, `${name}: the last jab starts straight from the guard`);
  }
});

test("flow: every move works started from every move's flow pose (wide stance, hands up, arm up, ball held...)", () => {
  const moves: Record<string, Step> = {
    punch: [punch, {}], jab: [punch, { hand: "front" }], kick: [kick, {}], wave: [wave, {}], highFive: [highFive, { partnerDistance: 240 }],
    throw: [throwBall, { distance: 600 }], catch: [catchBall, {}],
  };
  const flowFrom = (name: string, facing: Facing) => {
    const [move, params] = moves[name];
    const start = stanceAt(facing, name === "throw" ? HOLD_BALL : STAND);
    return (move as (s: Stance, p: unknown, set: MoveSettings) => MoveOutput)(start, params, NATURAL);
  };
  for (const settings of [NATURAL, { ...NATURAL, style: "robot" as const }, { ...NATURAL, style: "angry" as const, energy: 0.85 }, { ...NATURAL, style: "tired" as const, energy: 0.2 }]) {
    for (const facing of SIDES) for (const first of Object.keys(moves)) for (const second of Object.keys(moves)) {
      const name = `${label(`${first}->${second}`, settings, facing)}`;
      const a = flowFrom(first, facing);
      const [move, params] = moves[second];
      const b = (move as (s: Stance, p: unknown, set: MoveSettings) => MoveOutput)(a.flow!.stance, params, settings);
      assertNatural(sceneOfKeys([...a.keys.slice(0, a.flow!.keys - 1), ...b.keys], facing), name);
      assert.deepEqual(b.end.pose, second === "catch" ? HOLD_BALL : STAND, `${name}: ends at rest`);
    }
  }
});
