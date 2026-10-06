import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type SceneFrames } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { JOINTS, STAND, withPose, type Facing, type JointName, type PoseAngles } from "../rig.ts";
import { fall, fallAndGetUp, FALLEN_BACK, FALLEN_FORWARD, getUp } from "./fall.ts";
import { jump, JUMP_DEFAULTS } from "./jump.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { pickUp } from "./pickUp.ts";
import { SEATED, sit, SIT_DEFAULTS, sitDown, standUp } from "./sit.ts";
import { squat, SQUAT_DEFAULTS } from "./squat.ts";
import { allSettings, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { HOLD_BALL } from "./throwCatch.ts";

// SPEC-0017 Phase 2: body moves 1 (jump, squat, sit, fall). Every move keeps the body rules in every style,
// speed, energy and direction, starts and ends standing still, and follows the motion lesson: a wind-up
// the OPPOSITE way, a fast action, then slowing down and settling. Each move also has a FLOW point (where
// its own action is over): when another move follows straight away, the planner drops the move's
// "recover" tail and starts the next move from there, so there is no needless standing still in between.

type Move = { name: string; run: (start: Stance, settings: MoveSettings) => MoveOutput; marks: string[]; flowAfter: string };
const MOVES: Move[] = [
  { name: "jump", run: (s, set) => jump(s, {}, set), marks: ["takeoff", "top", "land"], flowAfter: "land" },
  { name: "jump 300px", run: (s, set) => jump(s, { distance: 300 }, set), marks: ["takeoff", "top", "land"], flowAfter: "land" },
  { name: "squat", run: (s, set) => squat(s, {}, set), marks: ["bottom", "up"], flowAfter: "up" },
  { name: "sit", run: (s, set) => sit(s, {}, set), marks: ["seated", "up"], flowAfter: "up" },
  { name: "fall forward", run: (s, set) => fallAndGetUp(s, { direction: "forward" }, set), marks: ["impact", "down", "up"], flowAfter: "up" },
  { name: "fall back", run: (s, set) => fallAndGetUp(s, { direction: "back" }, set), marks: ["impact", "down", "up"], flowAfter: "up" },
];

const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const FACINGS: Facing[] = ["right", "left"];

// The head never dips below the floor either (the engine's floor check leaves the head out).
function assertHeadUp(built: SceneFrames, label: string) {
  for (const [i, [c]] of built.frames.entries()) assert.ok(c.skeleton.head.y + c.headRadius <= TEST_GROUND + 0.5, `${label}: head below the floor at frame ${i}`);
}

// Fastest any joint moves (px per second) between two times, measured on the real frames.
function peakSpeed(keys: CharacterKey[], from: number, to: number, fps = 60) {
  const frames = buildScene(sceneOfKeys(keys), fps).frames.map(([c]) => c.skeleton);
  let peak = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const t = (i - 0.5) / fps;
    if (t < from || t > to) continue;
    for (const j of JOINTS) peak = Math.max(peak, Math.hypot(frames[i][j].x - frames[i - 1][j].x, frames[i][j].y - frames[i - 1][j].y) * fps);
  }
  return peak;
}

// What the planner does when another move follows straight away: keep a move's keys only up to its flow
// point and start the next move from the flow stance; the last move keeps its recover tail. (The shared
// key is merged the way plan.ts merges it.)
function chainWithFlow(start: Stance, runs: ((from: Stance) => MoveOutput)[], useFlow = true) {
  const keys: CharacterKey[] = [];
  const outs: MoveOutput[] = [];
  let at = start;
  runs.forEach((run, i) => {
    const out = run(at);
    outs.push(out);
    const cut = useFlow && i < runs.length - 1 && out.flow;
    for (const key of cut ? out.keys.slice(0, out.flow!.keys) : out.keys) {
      if (keys.length && Math.abs(keys[keys.length - 1].t - key.t) < 1e-4) keys[keys.length - 1] = { ...key, ease: key.ease ?? keys[keys.length - 1].ease };
      else keys.push(key);
    }
    at = cut ? out.flow!.stance : out.end;
  });
  return { keys, outs, end: at };
}

// Where a joint is on the stage for a key (the engine's rule: the lowest foot or knee sits `lift` above
// the ground), facing right.
function jointOf(key: CharacterKey, joint: JointName) {
  const s = forwardKinematics(key.pose, "right", { x: key.x, y: 0 }, TEST_HEIGHT, "normal", false);
  const lowest = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + 0.07 * TEST_HEIGHT);
  return { x: s[joint].x, y: s[joint].y + TEST_GROUND - (key.lift ?? 0) - lowest };
}
// Arthur's anticipation rule: the wind-up (keys a -> b) moves `joint` the OPPOSITE way of the action
// (keys b -> c): the two movements point away from each other.
function assertOpposite(keys: CharacterKey[], [a, b, c]: [number, number, number], joint: JointName, label: string) {
  const p = [a, b, c].map((i) => jointOf(keys[i], joint));
  const wind = { x: p[1].x - p[0].x, y: p[1].y - p[0].y }, act = { x: p[2].x - p[1].x, y: p[2].y - p[1].y };
  assert.ok(Math.hypot(wind.x, wind.y) > 1, `${label}: the wind-up moves the ${joint} (${Math.hypot(wind.x, wind.y).toFixed(1)}px)`);
  const cos = (wind.x * act.x + wind.y * act.y) / (Math.hypot(wind.x, wind.y) * Math.hypot(act.x, act.y));
  assert.ok(cos < -0.3, `${label}: the wind-up goes the opposite way of the action (cos ${cos.toFixed(2)})`);
}
const keyAt = (out: MoveOutput, t: number) => out.keys.findIndex((k) => Math.abs(k.t - t) < 1e-9);

for (const move of MOVES) {
  test(`${move.name}: body rules hold in every style, speed, energy and direction; starts and ends standing; flows`, () => {
    for (const settings of allSettings()) for (const facing of FACINGS) {
      const label = `${move.name}/${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
      const start = startStance(facing, 960, 1);
      const out = move.run(start, settings);
      const built = assertNatural(sceneOfKeys(out.keys, facing), label);
      assertHeadUp(built, label);
      // Starts exactly where the last move ended.
      assert.equal(out.keys[0].t, start.t, `${label}: starts on time`);
      assert.equal(out.keys[0].x, start.x, `${label}: starts in place`);
      assert.deepEqual(out.keys[0].pose, STAND, `${label}: starts standing`);
      // Ends standing still, both feet planted, on the ground.
      const last = out.keys[out.keys.length - 1];
      assert.deepEqual(out.end.pose, STAND, `${label}: ends in the stand`);
      assert.deepEqual(last.pose, STAND, `${label}: last key is the stand`);
      assert.equal(last.lift ?? 0, 0, `${label}: ends on the ground`);
      assert.deepEqual([...(last.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${label}: both feet planted`);
      assert.equal(out.end.t, last.t, `${label}: end time`);
      assert.equal(out.end.x, last.x, `${label}: end place`);
      assert.equal(out.end.facing, facing, `${label}: still facing the same way`);
      const end = built.frames[built.frames.length - 1][0].skeleton;
      assert.ok(Math.abs(Math.max(end.lFoot.y, end.rFoot.y) - TEST_GROUND) < 0.5 && Math.abs(Math.min(end.lFoot.y, end.rFoot.y) - TEST_GROUND) < 1, `${label}: ends with both feet on the floor`);
      // Named moments exist, in order, inside the move.
      let previous = start.t;
      for (const name of move.marks) {
        const t = out.marks[name];
        assert.ok(t !== undefined, `${label}: mark "${name}"`);
        assert.ok(t > previous && t <= out.end.t, `${label}: mark "${name}" in order`);
        previous = t;
      }
      // Keys go forward in time.
      out.keys.forEach((k, i) => i > 0 && assert.ok(k.t > out.keys[i - 1].t, `${label}: keys in time order`));
      // Flow point: after the action is over, before the recover tail; on both feet; the flow stance is
      // exactly that key.
      assert.ok(out.flow, `${label}: has a flow point`);
      const flowKey = out.keys[out.flow.keys - 1];
      assert.ok(out.flow.keys >= 2 && out.flow.keys < out.keys.length, `${label}: flow point inside the move, before its recover tail`);
      assert.ok(flowKey.t >= out.marks[move.flowAfter] - 1e-9, `${label}: flows after "${move.flowAfter}"`);
      assert.deepEqual(out.flow.stance, { t: flowKey.t, x: flowKey.x, facing, pose: flowKey.pose }, `${label}: flow stance`);
      assert.equal(flowKey.lift ?? 0, 0, `${label}: flows from the ground`);
      assert.deepEqual([...(flowKey.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${label}: flows on both feet`);
      assert.ok(out.end.t - flowKey.t >= 0.15, `${label}: the recover tail it drops is real (${(out.end.t - flowKey.t).toFixed(2)}s)`);
    }
  });
}

test("flow: squat -> jump -> sit chain straight on (no standing between); body rules hold everywhere", () => {
  for (const settings of allSettings()) for (const facing of FACINGS) {
    const label = `squat>jump>sit/${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const runs = [(s: Stance) => squat(s, {}, settings), (s: Stance) => jump(s, {}, settings), (s: Stance) => sit(s, {}, settings)];
    const flowing = chainWithFlow(startStance(facing), runs);
    const built = assertNatural(sceneOfKeys(flowing.keys, facing), label);
    assertHeadUp(built, label);
    const [sq, jp] = flowing.outs;
    // The jump starts right where the squat is back up (still rising), and the sit right after the landing.
    assert.equal(jp.keys[0].t, sq.marks.up, `${label}: jump starts at the squat's "up"`);
    assert.deepEqual(jp.keys[0].pose, sq.flow!.stance.pose, `${label}: jump starts from the squat's flow pose`);
    assert.equal(flowing.outs[2].keys[0].t, jp.flow!.stance.t, `${label}: sit starts at the end of the landing`);
    // The squat's flow pose is nearly standing but not the rest pose (still on its way up).
    assert.notDeepEqual(sq.flow!.stance.pose, STAND, `${label}: flows before standing still`);
    // Shorter than standing up in between: by at least both recover tails (a move that starts part of the
    // way there, like sitting down from a landing crouch, is quicker too).
    const resting = chainWithFlow(startStance(facing), runs, false);
    const saved = (sq.end.t - sq.flow!.stance.t) + (jp.end.t - jp.flow!.stance.t);
    const lengthOf = (keys: CharacterKey[]) => keys[keys.length - 1].t - keys[0].t;
    assert.ok(lengthOf(resting.keys) - lengthOf(flowing.keys) >= saved - 1e-6, `${label}: saves the recover tails`);
    assert.deepEqual(flowing.end.pose, STAND, `${label}: the last move still ends standing`);
  }
});

test("flow: more chains (jump -> jump, squat -> squat, fall -> squat, sit -> jump, jump -> pick up) stay natural", () => {
  const chains: [string, (set: MoveSettings) => ((s: Stance) => MoveOutput)[]][] = [
    ["jump>jump 200px", (set) => [(s) => jump(s, {}, set), (s) => jump(s, { distance: 200 }, set)]],
    ["squat>squat", (set) => [(s) => squat(s, {}, set), (s) => squat(s, { depth: 0.6 }, set)]],
    ["fall>squat", (set) => [(s) => fallAndGetUp(s, {}, set), (s) => squat(s, {}, set)]],
    ["fall back>jump", (set) => [(s) => fallAndGetUp(s, { direction: "back" }, set), (s) => jump(s, {}, set)]],
    ["sit>jump", (set) => [(s) => sit(s, {}, set), (s) => jump(s, { distance: 150 }, set)]],
    ["jump>pickUp", (set) => [(s) => jump(s, { distance: 120 }, set), (s) => pickUp(s, {}, set)]],
  ];
  for (const settings of allSettings()) for (const facing of FACINGS) for (const [name, runs] of chains) {
    const label = `${name}/${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const flowing = chainWithFlow(startStance(facing), runs(settings));
    assertHeadUp(assertNatural(sceneOfKeys(flowing.keys, facing), label), label);
  }
});

// A boxing guard (hands up at the face, knees soft) and other moves' flow poses: every move must also
// start well from those, not only from the stand.
const GUARD: PoseAngles = withPose(STAND, { lean: 4, head: 6, lShoulder: 50, lElbow: 112, rShoulder: 28, rElbow: 136, lKnee: 8, rKnee: 8, lHip: 6, rHip: -2 });
const FLOW_STARTS: [string, (facing: Facing) => Stance][] = [
  ["guard", (f) => ({ ...startStance(f), pose: GUARD })],
  ["holding a ball", (f) => ({ ...startStance(f), pose: HOLD_BALL })],
  ...MOVES.map((m) => [`${m.name} flow`, (f: Facing) => m.run(startStance(f), NATURAL).flow!.stance] as [string, (facing: Facing) => Stance]),
  ["pick up flow", (f) => pickUp(startStance(f), {}, NATURAL).flow!.stance],
];

test("every move starts well from another move's flow pose (a landing crouch, a guard, holding a ball...)", () => {
  const settings = [...allSettings()].filter((s) => s.speed !== "normal" && s.energy !== 0.5);
  for (const [startName, startOf] of FLOW_STARTS) for (const move of MOVES) for (const set of settings) for (const facing of FACINGS) {
    const label = `${startName} -> ${move.name}/${set.style}/${set.speed}/${set.energy}/${facing}`;
    const start = startOf(facing);
    const out = move.run(start, set);
    assert.deepEqual(out.keys[0].pose, start.pose, `${label}: starts from the given pose`);
    assertHeadUp(assertNatural(sceneOfKeys(out.keys, facing), label), label);
    assert.deepEqual(out.end.pose, STAND, `${label}: ends standing`);
  }
});

test("anticipation goes the opposite way of the action (Arthur's rule), in every move", () => {
  for (const style of ["natural", "tired", "angry"] as const) {
    const set = { ...NATURAL, style };
    // Squat: the hips go forward and up (chest up, a breath in) before going down and back.
    const sq = squat(startStance(), {}, set);
    assertOpposite(sq.keys, [0, 1, keyAt(sq, sq.marks.bottom)], "hip", `squat/${style}`);
    // Jump: the arms swing back (and the body dips) before swinging forward and up.
    const jp = jump(startStance(), {}, set);
    assertOpposite(jp.keys, [0, 1, keyAt(jp, jp.marks.takeoff)], "lHand", `jump/${style}`);
    // Sit down: the hips go forward and up a little (chest up), then down and back into the squat.
    const sd = sitDown(startStance(), {}, set);
    assertOpposite(sd.keys, [0, 1, 2], "hip", `sitDown/${style}`);
    // Stand up: rock back, then forward and up.
    const su = standUp(sd.end, {}, set);
    assertOpposite(su.keys, [0, 1, 2], "neck", `standUp/${style}`);
    // Falling forward: sway back first; falling back: tip forward first.
    const ff = fall(startStance(), { direction: "forward" }, set);
    assertOpposite(ff.keys, [0, 1, 2], "neck", `fall forward/${style}`);
    const fb = fall(startStance(), { direction: "back" }, set);
    assertOpposite(fb.keys, [0, 1, 2], "neck", `fall back/${style}`);
    // Getting up from the face (Arthur, round 7: "the elbow should be right around his neck", not above
    // the head): propped up on the forearms (key 2), the chest SINKS onto the hands set under it (key 4)
    // before it pushes UP (key 6). (Round 6 checked the hands going straight down in front of the face
    // with the elbows up by the head: the pose Arthur rejected in round 7.) Sitting back, rock back before
    // sitting up.
    const gf = getUp(ff.end, {}, set);
    assertOpposite(gf.keys, [2, 4, 6], "neck", `getUp forward/${style}`);
    const gb = getUp(fb.end, {}, set);
    assertOpposite(gb.keys, [0, 1, 2], "head", `getUp back/${style}`);
  }
});

test("no needless resting: a brief squat hold and a short sit by default", () => {
  assert.ok(SQUAT_DEFAULTS.hold <= 0.2, "squat hold");
  assert.ok(SIT_DEFAULTS.seconds <= 1.5, "sit seconds");
  const out = squat(startStance(), {}, NATURAL);
  const bottom = keyAt(out, out.marks.bottom);
  assert.ok(out.keys[bottom + 1].t - out.marks.bottom <= 0.2 + 1e-9, "starts rising within 0.2s of reaching the bottom");
  // Sitting still between sitting down and standing up lasts the given seconds (breathing).
  const down = sitDown(startStance(), {}, NATURAL);
  const up = standUp(down.end, {}, NATURAL);
  assert.ok(Math.abs(sit(startStance(), {}, NATURAL).end.t - (down.end.t + SIT_DEFAULTS.seconds + (up.end.t - up.keys[0].t))) < 1e-6, "sit = sit down + breathe + stand up");
});

test("jump: the crouch is slow, the push is fast; travels exactly `distance`; flies on a gravity arc", () => {
  for (const settings of allSettings()) for (const facing of FACINGS) {
    if (settings.style === "robot") continue;
    const label = `${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const out = jump(startStance(facing), { distance: 250 }, settings);
    const crouch = out.keys[1].t - out.keys[0].t;
    const push = out.marks.takeoff - out.keys[1].t;
    assert.ok(push < crouch, `${label}: push ${push.toFixed(2)}s < crouch ${crouch.toFixed(2)}s`);
    assert.ok(Math.abs((out.end.x - out.keys[0].x) - (facing === "left" ? -250 : 250)) < 1e-6, `${label}: travels 250px`);
    // Up slowing down, down speeding up; steady forward speed in the air; both halves the same length.
    const top = out.keys.find((k) => k.t === out.marks.top)!;
    const leave = out.keys.find((k) => k.t === out.marks.takeoff)!;
    assert.equal(leave.liftEase, "out", `${label}: rises slowing down`);
    assert.equal(top.liftEase, "in", `${label}: falls speeding up`);
    assert.equal(leave.xEase, "linear");
    assert.equal(top.xEase, "linear");
    assert.ok(Math.abs((out.marks.top - out.marks.takeoff) - (out.marks.land - out.marks.top)) < 1e-9, `${label}: symmetric arc`);
  }
  // Natural: the push is far faster than the crouch (peak joint speed).
  const out = jump(startStance(), {}, NATURAL);
  const crouchPeak = peakSpeed(out.keys, 0, out.keys[1].t), pushPeak = peakSpeed(out.keys, out.keys[1].t, out.marks.takeoff);
  assert.ok(pushPeak > 3 * crouchPeak, `push ${pushPeak.toFixed(0)} vs crouch ${crouchPeak.toFixed(0)} px/s`);
});

test("jump: the feet really leave the ground and land; higher with energy, lower when heavy, a robot has no crouch", () => {
  const air = (settings: MoveSettings) => {
    const out = jump(startStance(), {}, settings);
    const frames = buildScene(sceneOfKeys(out.keys), 24).frames.map(([c]) => c.skeleton);
    const footUp = frames.map((s) => TEST_GROUND - Math.max(s.lFoot.y, s.rFoot.y));
    return { out, peak: Math.max(...footUp), airborne: footUp.filter((h) => h > 5).length };
  };
  const natural = air(NATURAL);
  assert.ok(natural.airborne >= 10, `in the air for ${natural.airborne} frames`);
  assert.ok(Math.abs(natural.peak - JUMP_DEFAULTS.height * TEST_HEIGHT) < 3, `top of the jump ${natural.peak.toFixed(0)}px`);
  assert.ok(air({ ...NATURAL, energy: 0.85 }).peak > natural.peak * 1.15, "more energy jumps higher");
  assert.ok(air({ ...NATURAL, style: "heavy" }).peak < natural.peak * 0.7, "heavy jumps lower");
  const robot = air({ ...NATURAL, style: "robot" }).out;
  assert.ok(robot.keys.every((k, i) => i === robot.keys.length - 1 || k.ease === "linear"), "robot moves at constant speeds");
  assert.ok(robot.marks.takeoff - robot.keys[0].t < natural.out.marks.takeoff - natural.out.keys[0].t, "robot: no slow crouch");
  // Happy bounces: two separate times in the air.
  const happy = jump(startStance(), {}, { ...NATURAL, style: "happy" });
  assert.equal(happy.keys.filter((k) => (k.contacts ?? []).length === 0 && (k.lift ?? 0) > 0).length >= 2, true, "happy hops twice");
  // The flow point is the bottom of the landing: knees bent, ready to go.
  const flow = natural.out.flow!.stance.pose;
  assert.ok(flow.lKnee > 45 && flow.rKnee > 45, `landing knees bent (${flow.lKnee.toFixed(0)})`);
});

test("squat: down with control, up quicker; the deeper the squat, the lower the hips; flows nearly up", () => {
  const out = squat(startStance(), {}, NATURAL);
  const bottom = keyAt(out, out.marks.bottom), up = keyAt(out, out.marks.up);
  const down = out.marks.bottom - out.keys[bottom - 1].t, rise = out.marks.up - out.keys[up - 1].t;
  assert.ok(rise < down, `rise ${rise.toFixed(2)}s < lowering ${down.toFixed(2)}s`);
  assert.ok(peakSpeed(out.keys, out.keys[up - 1].t, out.marks.up) > 1.3 * peakSpeed(out.keys, 0, out.keys[1].t), "the rise is faster than the wind-up");
  const lowest = (depth: number) => {
    const o = squat(startStance(), { depth, hold: 0.3 }, NATURAL);
    return Math.max(...buildScene(sceneOfKeys(o.keys), 24).frames.map(([c]) => c.skeleton.hip.y));
  };
  assert.ok(lowest(1) > lowest(0.5) + 20 && lowest(0.5) > lowest(0) + 20, "depth controls how low");
  // "up" (the flow point) is nearly standing and still rising: the hips keep going up after it.
  assert.equal(out.flow!.stance.t, out.marks.up);
  const hips = buildScene(sceneOfKeys(out.keys), 60).frames.map(([c]) => c.skeleton.hip.y);
  const at = Math.round(out.marks.up * 60);
  assert.ok(hips[at + 1] < hips[at - 1] - 0.05, "still rising at the flow point");
  assert.ok(hips[at] - hips[hips.length - 1] < 15, `nearly up at the flow point (${(hips[at] - hips[hips.length - 1]).toFixed(1)}px to go)`);
});

test("sit: sitDown ends in SEATED (hips on the floor), standUp from there ends standing; the stand-up push is the fast part", () => {
  const down = sitDown(startStance(), {}, NATURAL);
  assert.deepEqual(down.end.pose, SEATED);
  const built = buildScene(sceneOfKeys(down.keys), 24);
  const seated = built.frames[built.frames.length - 1][0].skeleton;
  assert.ok(TEST_GROUND - seated.hip.y < 8, `hips ${(TEST_GROUND - seated.hip.y).toFixed(1)}px above the floor`);
  assert.equal(built.report.characters[0].belowGroundFrames, 0);
  const up = standUp(down.end, {}, NATURAL);
  assert.deepEqual(up.end.pose, STAND);
  assert.ok(Math.abs(up.end.x - 960) < 1e-6, "stands back up where it sat down");
  assertNatural(sceneOfKeys([...down.keys, ...up.keys.slice(1)]), "sitDown + standUp");
  const rock = peakSpeed(up.keys, up.keys[0].t, up.keys[1].t), push = peakSpeed(up.keys, up.keys[1].t, up.keys[2].t);
  assert.ok(push > 3 * rock, `stand-up push ${push.toFixed(0)} vs rock-back ${rock.toFixed(0)} px/s`);
  // Longer sits take longer.
  assert.ok(sit(startStance(), { seconds: 4 }, NATURAL).end.t > sit(startStance(), { seconds: 1 }, NATURAL).end.t + 2.9);
  // From a landing crouch it sits down right where the feet landed, and stands back up over them.
  const landing = jump(startStance(), { distance: 120 }, NATURAL);
  const sitting = buildScene(sceneOfKeys(sitDown(landing.flow!.stance, {}, NATURAL).keys), 24).frames.map(([c]) => c.skeleton.lFoot.x);
  assert.ok(Math.max(...sitting) - Math.min(...sitting) < 1, "feet stay where they landed");
  assert.ok(Math.abs(sit(landing.flow!.stance, {}, NATURAL).end.x - landing.end.x) < 1, "stands up over the same feet");
});

test("fall: gravity speeds the fall up; ends lying (face down or on the back) on the floor; getUp stands", () => {
  for (const direction of ["forward", "back"] as const) {
    const out = fall(startStance(), { direction }, NATURAL);
    assert.deepEqual(out.end.pose, direction === "forward" ? FALLEN_FORWARD : FALLEN_BACK);
    const frames = buildScene(sceneOfKeys(out.keys), 60).frames.map(([c]) => c.skeleton);
    // Falling: the hips drop faster and faster until the impact (gravity).
    const impact = Math.round(out.marks.impact * 60);
    const drop = (i: number) => frames[i].hip.y - frames[i - 4].hip.y;
    assert.ok(drop(impact) > 1.5 * drop(impact - 8), `${direction}: speeds up as it falls`);
    // Lying: the hips, neck and head are on the floor.
    const lying = frames[frames.length - 1];
    assert.ok(TEST_GROUND - lying.hip.y < 8, `${direction}: hips on the floor`);
    assert.ok(TEST_GROUND - lying.neck.y < 20, `${direction}: chest on the floor (${(TEST_GROUND - lying.neck.y).toFixed(0)}px)`);
    // A fall ends on the ground: nothing to flow into but getting up.
    assert.equal(out.flow, undefined, `${direction}: no flow point while lying down`);
    const up = getUp(out.end, {}, NATURAL);
    assert.deepEqual(up.end.pose, STAND);
    assert.ok(up.flow && up.flow.stance.t === up.marks.up, `${direction}: getUp flows at "up"`);
    assertNatural(sceneOfKeys([...out.keys, ...up.keys.slice(1)]), `fall + getUp ${direction}`);
  }
});
