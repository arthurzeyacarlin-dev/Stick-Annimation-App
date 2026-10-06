import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type FrameCharacter, type Scene } from "../engine.ts";
import { ballLook, GRIP, heldCenter } from "../objects.ts";
import { forwardKinematics } from "../pose.ts";
import { STAND, withPose, type Facing, type Point } from "../rig.ts";
import { jump } from "./jump.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { grabJoint, grabPoint, heldPoint, PICK_UP_DEFAULTS, PICK_UP_END, pickUp, pickUpEnd, type PickUpParams } from "./pickUp.ts";
import { squat } from "./squat.ts";
import { allSettings, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { HOLD_BALL, throwBall } from "./throwCatch.ts";

// SPEC-0017 Phase 2b: picking an object up off the ground. "You go down, pick it up" (Arthur): a small
// weight shift the opposite way, bend down with natural lifting form, the hand(s) take the object exactly
// where it lies (mark "grab"), rise with it to the chest (mark "up", the flow point), end holding it like
// HOLD_BALL so a throw can follow. The object is taken in one hand's grip (`grabJoint`; both hands come
// down on it together by default) and held in both hands ("hands", the ball between them) from "twoHands".

const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const FACINGS: Facing[] = ["right", "left"];
const sign = (f: Facing) => (f === "left" ? -1 : 1);
const sizeOf = (p: PickUpParams) => p.size ?? PICK_UP_DEFAULTS.size * TEST_HEIGHT;
const handOf = (p: PickUpParams) => p.hand ?? PICK_UP_DEFAULTS.hand;
const hold = (p: PickUpParams) => GRIP * sizeOf(p) / 2; // px from the object's centre to a holding hand

// The figure as the engine draws it at exactly time t (the last frame of a scene that ends at t, at a
// frame rate that puts a frame exactly there).
function figureAt(keys: CharacterKey[], facing: Facing, t: number): FrameCharacter {
  const scene = sceneOfKeys(keys, facing);
  const built = buildScene({ ...scene, durationSec: t }, Math.ceil(t * 24) / t);
  const last = built.frames.length - 1;
  assert.ok(Math.abs(Math.min(t, last / built.fps) - t) < 1e-9, "sampled at exactly t");
  return built.frames[last][0];
}
// Where the front foot (toes) of a stance is on the stage.
function toeOf(start: Stance) {
  const s = forwardKinematics(start.pose, start.facing, { x: start.x, y: 0 }, TEST_HEIGHT, "normal", false);
  return sign(start.facing) > 0 ? Math.max(s.lFoot.x, s.rFoot.x) : Math.min(s.lFoot.x, s.rFoot.x);
}
// A scene with the object lying at its grab point until the grab, then held the way the planner holds it.
function withObject(out: MoveOutput, start: Stance, params: PickUpParams, settings: MoveSettings): Scene {
  const g = grabPoint(start, params, settings, TEST_GROUND);
  const scene = sceneOfKeys(out.keys, start.facing);
  return {
    ...scene,
    objects: [{
      id: "ball", name: "ball", look: ballLook("basketball", { size: sizeOf(params) }), keys: [{ t: 0, x: g.x, y: g.y }],
      segments: [
        { from: out.marks.grab, to: out.marks.twoHands, mode: "held", character: "a", joint: grabJoint(params) },
        { from: out.marks.twoHands, to: scene.durationSec, mode: "held", character: "a", joint: "hands" },
      ],
    }],
  };
}
const toSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
};
// What the planner does when another move follows straight away (see body1.test.ts).
function chainWithFlow(start: Stance, runs: ((from: Stance) => MoveOutput)[]) {
  const keys: CharacterKey[] = [];
  let at = start;
  runs.forEach((run, i) => {
    const out = run(at);
    const cut = i < runs.length - 1 && out.flow;
    for (const key of cut ? out.keys.slice(0, out.flow!.keys) : out.keys) {
      if (keys.length && Math.abs(keys[keys.length - 1].t - key.t) < 1e-4) keys[keys.length - 1] = { ...key, ease: key.ease ?? keys[keys.length - 1].ease };
      else keys.push(key);
    }
    at = cut ? out.flow!.stance : out.end;
  });
  return keys;
}

const PARAMS: PickUpParams[] = [{}, { reach: 90 }, { hand: "rHand" }, { hand: "lHand", reach: 85, size: 36 }, { size: 70, reach: 95 }];

test("pickUp: body rules hold in every style, speed, energy and direction; ends holding it at the chest; marks and flow", () => {
  for (const settings of allSettings()) for (const facing of FACINGS) for (const params of [PARAMS[0], PARAMS[2]]) {
    const label = `pickUp ${handOf(params)}/${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const start = startStance(facing, 900, 0.5);
    const out = pickUp(start, params, settings);
    const built = assertNatural(sceneOfKeys(out.keys, facing), label);
    for (const [i, [c]] of built.frames.entries()) assert.ok(c.skeleton.head.y + c.headRadius <= TEST_GROUND + 0.5, `${label}: head below the floor at frame ${i}`);
    assert.equal(out.keys[0].t, start.t, `${label}: starts on time`);
    assert.equal(out.keys[0].x, start.x, `${label}: starts in place`);
    assert.deepEqual(out.keys[0].pose, STAND, `${label}: starts from the given pose`);
    // Ends standing where it started, holding the object at the chest (ready to throw).
    const last = out.keys[out.keys.length - 1];
    assert.deepEqual(out.end, { t: last.t, x: last.x, facing, pose: PICK_UP_END }, `${label}: end stance`);
    assert.deepEqual(PICK_UP_END, HOLD_BALL, "ends in throwCatch's holding pose");
    assert.deepEqual(pickUpEnd(params, TEST_HEIGHT), PICK_UP_END, "a basketball ends in HOLD_BALL");
    assert.ok(Math.abs(last.x - start.x) < 1e-6, `${label}: ends where it started`);
    assert.deepEqual([...(last.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${label}: both feet planted`);
    // Feet never leave the floor: every key plants both feet, on the ground.
    for (const key of out.keys) {
      assert.deepEqual([...(key.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${label}: feet planted`);
      assert.equal(key.lift ?? 0, 0, `${label}: on the ground`);
    }
    // Marks in order; the flow point is "up" (back up, before settling), on both feet.
    assert.ok(out.marks.grab > start.t && out.marks.twoHands > out.marks.grab && out.marks.up > out.marks.twoHands && out.marks.up < out.end.t, `${label}: marks grab < twoHands < up < end`);
    assert.ok(out.flow, `${label}: flows`);
    const flowKey = out.keys[out.flow.keys - 1];
    assert.equal(flowKey.t, out.marks.up, `${label}: flows at "up"`);
    assert.deepEqual(out.flow.stance, { t: flowKey.t, x: flowKey.x, facing, pose: flowKey.pose }, `${label}: flow stance`);
    out.keys.forEach((k, i) => i > 0 && assert.ok(k.t > out.keys[i - 1].t, `${label}: keys in time order`));
  }
});

test("pickUp: the hand(s) take the object exactly where grabPoint says it lies, resting on the ground", () => {
  for (const style of ["natural", "robot", "tired", "heavy", "hurt", "angry", "sneaky", "happy"] as const) for (const facing of FACINGS) for (const params of PARAMS) {
    const settings = { ...NATURAL, style, speed: "fast" as const };
    const label = `${style}/${facing}/${JSON.stringify(params)}`;
    const start = startStance(facing, 1000, 0.3);
    const out = pickUp(start, params, settings);
    const g = grabPoint(start, params, settings, TEST_GROUND);
    const size = sizeOf(params), radius = size / 2;
    // Resting on the ground, in front of the toes.
    assert.ok(Math.abs(g.y - (TEST_GROUND - radius)) < 0.5, `${label}: object on the ground`);
    assert.ok((g.x - toeOf(start)) * sign(facing) >= radius, `${label}: in front of the toes`);
    // At the grab, the engine's held object is exactly there (within 3 px), with the hand(s) on its surface.
    const figure = figureAt(out.keys, facing, out.marks.grab);
    const held = heldCenter(figure, grabJoint(params), radius);
    assert.ok(Math.hypot(held.x - g.x, held.y - g.y) < 3, `${label}: held at (${held.x.toFixed(1)}, ${held.y.toFixed(1)}) vs grab point (${g.x.toFixed(1)}, ${g.y.toFixed(1)})`);
    for (const hand of handOf(params) === "hands" ? (["lHand", "rHand"] as const) : [grabJoint(params)]) {
      const d = Math.hypot(figure.skeleton[hand].x - g.x, figure.skeleton[hand].y - g.y);
      assert.ok(Math.abs(d - GRIP * radius) < 3, `${label}: ${hand} touches the object (${d.toFixed(1)} px from its centre)`);
    }
    // heldPoint (the planner's helper) agrees with the engine.
    const key = out.keys.find((k) => Math.abs(k.t - out.marks.grab) < 1e-9)!;
    const hp = heldPoint(key.pose, facing, key.x, TEST_HEIGHT, TEST_GROUND, grabJoint(params), size);
    assert.ok(Math.hypot(hp.x - g.x, hp.y - g.y) < 3, `${label}: heldPoint agrees`);
  }
  // Where it asks for it (when reachable): `reach` px in front of the toes.
  for (const facing of FACINGS) for (const reach of [PICK_UP_DEFAULTS.reach * TEST_HEIGHT, 90]) {
    const start = startStance(facing);
    const g = grabPoint(start, { reach }, NATURAL, TEST_GROUND);
    assert.ok(Math.abs((g.x - toeOf(start)) * sign(facing) - reach) < 1, `${facing}: object ${reach.toFixed(0)}px in front of the toes (got ${((g.x - toeOf(start)) * sign(facing)).toFixed(1)})`);
  }
});

test("pickUp: the object lies still until grabbed, never goes through the floor or the legs, and moves smoothly once held", () => {
  for (const settings of allSettings()) for (const facing of FACINGS) for (const params of PARAMS) {
    const label = `${settings.style}/${settings.speed}/${settings.energy}/${facing}/${JSON.stringify(params)}`;
    const start = startStance(facing);
    const out = pickUp(start, params, settings);
    const scene = withObject(out, start, params, settings);
    const built = buildScene(scene, 24);
    const radius = sizeOf(params) / 2;
    const grabFrame = Math.round(out.marks.grab * 24), twoFrame = Math.round(out.marks.twoHands * 24);
    let previous: Point | null = null;
    for (const [i, [figure]] of built.frames.entries()) {
      const s = figure.skeleton;
      // Where the object really is: on the ground until it's picked up, then in the hand(s) (and not
      // kept above the floor by the engine: the hands must carry it above the floor themselves).
      const ball = i <= grabFrame ? built.objects[i][0] : heldCenter(figure, i < twoFrame ? grabJoint(params) : "hands", radius);
      // Held in both hands: each hand stays on the object (about one grip from its centre).
      if (i >= twoFrame) for (const hand of ["lHand", "rHand"] as const) {
        const d = Math.hypot(s[hand].x - ball.x, s[hand].y - ball.y);
        assert.ok(Math.abs(d - hold(params)) < 1.5, `${label}: ${hand} off the object at frame ${i} (${(d - hold(params)).toFixed(1)} px)`);
      }
      assert.ok(ball.y + radius <= TEST_GROUND + 1, `${label}: object through the floor at frame ${i}`);
      // Never through the legs (thighs and shins).
      const legs = Math.min(toSegment(ball, s.hip, s.lKnee), toSegment(ball, s.lKnee, s.lFoot), toSegment(ball, s.hip, s.rKnee), toSegment(ball, s.rKnee, s.rFoot));
      assert.ok(legs >= radius - 2, `${label}: object in the legs at frame ${i} (${(legs - radius).toFixed(1)} px)`);
      // Reaching for it, the hand comes to its surface, never into it.
      if (i < grabFrame) for (const hand of ["lHand", "rHand"] as const) assert.ok(Math.hypot(s[hand].x - ball.x, s[hand].y - ball.y) >= GRIP * radius - 2, `${label}: ${hand} inside the object at frame ${i}`);
      // No jumps: the object moves smoothly (and not at all at the moment it's picked up).
      if (previous) assert.ok(Math.hypot(ball.x - previous.x, ball.y - previous.y) < (i === grabFrame ? 1 : 45), `${label}: object jumped ${Math.hypot(ball.x - previous.x, ball.y - previous.y).toFixed(1)}px at frame ${i}`);
      // Switching from one hand's grip to both hands doesn't move it.
      if (i === twoFrame) {
        const one = heldCenter(figure, grabJoint(params), radius), both = heldCenter(figure, "hands", radius);
        assert.ok(Math.hypot(one.x - both.x, one.y - both.y) < 1, `${label}: object moves at the switch to both hands (${Math.hypot(one.x - both.x, one.y - both.y).toFixed(1)} px)`);
      }
      previous = ball;
    }
  }
});

test("pickUp: an object too close (it would touch the legs) or too far (out of reach) is moved to where it can be taken", () => {
  for (const facing of FACINGS) for (const reach of [0, 20, 400]) for (const style of ["natural", "hurt"] as const) {
    const settings = { ...NATURAL, style };
    const label = `${facing}/${reach}/${style}`;
    const start = startStance(facing);
    const params = { reach };
    const g = grabPoint(start, params, settings, TEST_GROUND);
    const ahead = (g.x - toeOf(start)) * sign(facing);
    if (reach >= 400) assert.ok(ahead < 0.45 * TEST_HEIGHT, `${label}: brought within reach (${ahead.toFixed(0)}px)`);
    else assert.ok(ahead > reach, `${label}: moved clear of the legs (${ahead.toFixed(0)}px)`);
    const out = pickUp(start, params, settings);
    assertNatural(sceneOfKeys(out.keys, facing), label);
    const held = heldCenter(figureAt(out.keys, facing, out.marks.grab), grabJoint(params), sizeOf(params) / 2);
    assert.ok(Math.hypot(held.x - g.x, held.y - g.y) < 3, `${label}: still taken exactly`);
  }
});

test("pickUp: you go down and pick it up — a small opposite weight shift, no stopping to stand and look", () => {
  for (const style of ["natural", "tired", "angry", "heavy"] as const) {
    const out = pickUp(startStance(), {}, { ...NATURAL, style });
    const grab = out.keys.findIndex((k) => Math.abs(k.t - out.marks.grab) < 1e-9);
    // Anticipation: the hips shift forward and up a little (chest up) before going down and back.
    const hip = (k: CharacterKey) => {
      const s = forwardKinematics(k.pose, "right", { x: k.x, y: 0 }, TEST_HEIGHT, "normal", false);
      return { x: s.hip.x, y: -Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y) };
    };
    const [a, b, c] = [hip(out.keys[0]), hip(out.keys[1]), hip(out.keys[grab])];
    const wind = { x: b.x - a.x, y: b.y - a.y }, act = { x: c.x - b.x, y: c.y - b.y };
    assert.ok(wind.x * act.x + wind.y * act.y < 0, `${style}: the weight shift goes the opposite way of bending down`);
    // Small and quick, flowing straight into the bend: no pause before going down — the hips only go
    // down from the weight shift to the grab, never stopping on the way (no standing to look first).
    assert.ok(out.keys[1].t - out.keys[0].t < 0.35, `${style}: short anticipation`);
    const hips = buildScene(sceneOfKeys(out.keys), 60).frames.map(([c]) => c.skeleton.hip.y);
    for (let i = Math.ceil(out.keys[1].t * 60) + 1; i <= Math.floor(out.marks.grab * 60); i += 1) assert.ok(hips[i] >= hips[i - 1] - 0.5, `${style}: keeps going down (frame ${i}: ${(hips[i] - hips[i - 1]).toFixed(2)}px)`);
    // Only a moment's grip at the bottom, then up.
    assert.ok(out.keys[grab + 1].t - out.keys[grab - 1].t < 0.2 * (style === "natural" || style === "angry" ? 1 : 1.3), `${style}: brief grip`);
  }
  // Natural lifting form at the grab: hips back (behind the feet), knees bent, back leaning forward.
  const out = pickUp(startStance(), {}, NATURAL);
  const key = out.keys.find((k) => Math.abs(k.t - out.marks.grab) < 1e-9)!;
  const s = forwardKinematics(key.pose, "right", { x: key.x, y: 0 }, TEST_HEIGHT, "normal", false);
  assert.ok(s.hip.x < Math.min(s.lFoot.x, s.rFoot.x), "hips back behind the feet");
  assert.ok(key.pose.lean > 35 && key.pose.lKnee > 60 && key.pose.rKnee > 60, `back leaning (${key.pose.lean.toFixed(0)}) and knees bent (${key.pose.lKnee.toFixed(0)})`);
  // The weight stays over the feet (not falling forward onto the object).
  assert.ok(Math.abs(key.x - 960) < 0.15 * TEST_HEIGHT, "hips stay over the feet");
});

test("pickUp: one hand reaches while the other rests on the front knee; both hold it at the chest at the end, any size", () => {
  for (const params of [{ hand: "rHand" }, { hand: "lHand" }, {}, { size: 36 }, { size: 70, hand: "rHand" }] as PickUpParams[]) {
    const label = JSON.stringify(params);
    const out = pickUp(startStance(), params, NATURAL);
    const s = figureAt(out.keys, "right", out.marks.grab).skeleton;
    if (handOf(params) !== "hands") {
      const free = handOf(params) === "rHand" ? "lHand" : "rHand";
      const knee = s.lKnee.x >= s.rKnee.x ? s.lKnee : s.rKnee;
      assert.ok(Math.hypot(s[free].x - knee.x, s[free].y - knee.y) < 0.08 * TEST_HEIGHT, `${label}: free hand on the knee`);
    } else assert.ok(Math.hypot(s.lHand.x - s.rHand.x, s.lHand.y - s.rHand.y) < 0.5, `${label}: both hands come down on it together`);
    // At the end the object is between the hands, each one grip from its centre (like HOLD_BALL).
    assert.deepEqual(out.end.pose, pickUpEnd(params, TEST_HEIGHT), `${label}: end pose`);
    const e = figureAt(out.keys, "right", out.end.t).skeleton;
    assert.ok(Math.abs(Math.hypot(e.lHand.x - e.rHand.x, e.lHand.y - e.rHand.y) - 2 * hold(params)) < 0.5, `${label}: hands one grip either side of it`);
  }
});

test("pickUp flows: squat -> pick up -> throw, jump -> pick up, from a guard; the grab stays exact from any start", () => {
  const guard = withPose(STAND, { lean: 4, head: 6, lShoulder: 50, lElbow: 112, rShoulder: 28, rElbow: 136, lKnee: 8, rKnee: 8, lHip: 6, rHip: -2 });
  const settings = [...allSettings()].filter((s) => s.energy !== 0.5 && s.speed !== "slow");
  for (const set of settings) for (const facing of FACINGS) {
    const label = `${set.style}/${set.speed}/${set.energy}/${facing}`;
    const chains: [string, ((s: Stance) => MoveOutput)[]][] = [
      ["squat>pickUp>throw", [(s) => squat(s, {}, set), (s) => pickUp(s, {}, set), (s) => throwBall(s, { distance: 500 }, set)]],
      ["jump>pickUp", [(s) => jump(s, { distance: 150 }, set), (s) => pickUp(s, { hand: "rHand" }, set)]],
      ["pickUp>pickUp", [(s) => pickUp(s, {}, set), (s) => squat(s, { depth: 0.5 }, set)]],
    ];
    for (const [name, runs] of chains) assertNatural(sceneOfKeys(chainWithFlow(startStance(facing), runs), facing), `${name}/${label}`);
    const fromGuard = pickUp({ ...startStance(facing), pose: guard }, {}, set);
    assertNatural(sceneOfKeys(fromGuard.keys, facing), `guard>pickUp/${label}`);
  }
  // The grab point is exact from a landing crouch or a guard too.
  for (const facing of FACINGS) {
    const starts: Stance[] = [jump(startStance(facing), { distance: 150 }, NATURAL).flow!.stance, { ...startStance(facing), pose: guard }, squat(startStance(facing), {}, NATURAL).flow!.stance];
    for (const start of starts) {
      const out = pickUp(start, {}, NATURAL);
      const g = grabPoint(start, {}, NATURAL, TEST_GROUND);
      const held = heldCenter(figureAt(out.keys, facing, out.marks.grab), grabJoint({}), sizeOf({}) / 2);
      assert.ok(Math.hypot(held.x - g.x, held.y - g.y) < 3, `${facing}: exact from a non-standing start (${Math.hypot(held.x - g.x, held.y - g.y).toFixed(2)} px)`);
    }
  }
});
