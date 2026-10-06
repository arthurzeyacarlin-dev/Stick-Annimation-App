import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type FootContact } from "../engine.ts";
import { JOINT_LIMITS, JOINTS, STAND, withPose, type Facing, type PoseAngles, type Skeleton } from "../rig.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { allSettings, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { lookBack, restPoseFor, stepInto, turn, type TurnParams } from "./turn.ts";

// SPEC-0017 Phase 2: turning around and looking back, after Arthur's review (2026-10-04): a turn around
// is TWO steps (one leg steps round while the hips twist, the other comes to it), quick and smooth; to
// look behind, only the upper body turns (about 90 degrees) — the feet stay put.

const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const SNEAKY: MoveSettings = { ...NATURAL, style: "sneaky" };
const QUICK: MoveSettings = { ...NATURAL, speed: "fast" };
const FULL: [Facing, Facing][] = [["right", "left"], ["left", "right"]];
const QUARTER: [Facing, Facing][] = [["right", "front"], ["front", "left"], ["front", "right"], ["left", "front"]];
// Start mid-scene and off-center, standing the way a figure stands for its facing.
const stanceAt = (facing: Facing, pose: PoseAngles = restPoseFor(facing)): Stance => ({ ...startStance(facing, 700, 1.25), pose });
const seconds = (out: MoveOutput, start: Stance) => out.end.t - start.t;

const frames24 = (keys: CharacterKey[], facing: Facing) => buildScene(sceneOfKeys(keys, facing), 24);
const skeletons = (keys: CharacterKey[], facing: Facing) => frames24(keys, facing).frames.map((f) => f[0].skeleton);

// The biggest distance any joint moves from one frame to the next (px).
function biggestStep(frames: Skeleton[]) {
  let worst = 0;
  for (let i = 1; i < frames.length; i += 1) for (const j of JOINTS) worst = Math.max(worst, Math.hypot(frames[i][j].x - frames[i - 1][j].x, frames[i][j].y - frames[i - 1][j].y));
  return worst;
}

// Is a foot planted at time t (the engine's rule: both keys around t list it)?
function plantedAt(keys: CharacterKey[], foot: FootContact, t: number) {
  const has = (key: CharacterKey) => Boolean(key.contacts?.includes(foot));
  if (t <= keys[0].t) return has(keys[0]);
  if (t >= keys[keys.length - 1].t) return has(keys[keys.length - 1]);
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1;
  return has(keys[i]) && has(keys[i + 1]);
}

// How far a planted foot moves between two frames where it is planted in both (px) — including the
// moment the view switches (the engine re-plants the feet there).
function plantedSlide(keys: CharacterKey[], frames: Skeleton[], fps = 24) {
  let worst = 0;
  for (let i = 1; i < frames.length; i += 1) for (const foot of ["lFoot", "rFoot"] as const) {
    if (!plantedAt(keys, foot, (i - 1) / fps) || !plantedAt(keys, foot, i / fps)) continue;
    worst = Math.max(worst, Math.hypot(frames[i][foot].x - frames[i - 1][foot].x, frames[i][foot].y - frames[i - 1][foot].y));
  }
  return worst;
}

// The feet that come off the ground, in order (a contact listed by one key and missing from the next).
const liftedFeet = (keys: CharacterKey[]) => keys.flatMap((key, i) => (i === 0 ? [] : (keys[i - 1].contacts ?? []).filter((c) => !(key.contacts ?? []).includes(c))));

// ---- Turning around -------------------------------------------------------------------------

test("turn around is two steps: one foot lifts and steps round, then the other lifts and comes to it", () => {
  for (const [from, to] of FULL) {
    const start = stanceAt(from);
    const out = turn(start, { to }, NATURAL);
    const label = `${from}->${to}`;
    // Exactly two foot lifts, one with each foot: right->left steps round with r, then l comes to it.
    assert.deepEqual(liftedFeet(out.keys), from === "right" ? ["rFoot", "lFoot"] : ["lFoot", "rFoot"], `${label}: two steps, one per foot`);
    // Each stepping foot really lifts (a little: 3-8% of the height) and lands again.
    const frames = skeletons(out.keys, from);
    for (const foot of ["lFoot", "rFoot"] as const) {
      const highest = TEST_GROUND - Math.min(...frames.map((s) => s[foot].y));
      assert.ok(highest > 0.03 * TEST_HEIGHT && highest < 0.08 * TEST_HEIGHT, `${label}: ${foot} lifts ${highest.toFixed(1)}px`);
      assert.ok(Math.abs(frames[frames.length - 1][foot].y - TEST_GROUND) < 0.5, `${label}: ${foot} lands`);
    }
    // Ends standing on both feet, facing the new way, in the plain stand, on (almost) the same spot: the
    // second foot comes to the first, so the body ends a hair along the new way.
    const last = out.keys[out.keys.length - 1];
    assert.equal(out.end.facing, to);
    assert.deepEqual(last.pose, STAND, `${label}: ends in the stand`);
    assert.deepEqual([...(last.contacts ?? [])].sort(), ["lFoot", "rFoot"]);
    const moved = (out.end.x - start.x) * (to === "left" ? -1 : 1);
    assert.ok(moved >= 0 && moved < 0.03 * TEST_HEIGHT, `${label}: turns on the spot (moved ${moved.toFixed(1)}px the new way)`);
    // Hips twist past 90 degrees: the view goes side -> facing the viewer -> the other side.
    assert.deepEqual([...new Set(frames24(out.keys, from).frames.map((f) => f[0].facing))], [from, "front", to]);
    assert.ok(out.marks.facingViewer > start.t && out.marks.turned > out.marks.facingViewer && out.marks.turned < out.end.t, `${label}: marks in order`);
    // The settle into the stand is the return to rest (a following move can start before it).
    assert.ok(out.flow && out.flow.stance.facing === to && out.flow.keys === out.keys.length - 1, `${label}: flow point before the settle`);
    assert.deepEqual([...(out.keys[out.flow!.keys - 1].contacts ?? [])].sort(), ["lFoot", "rFoot"], `${label}: flow pose stands on both feet`);
  }
});

test("turn timing: quick, because people turning around to go somewhere are impatient (round 4); slow and careful turns take longer", () => {
  for (const [from, to] of FULL) {
    const start = stanceAt(from);
    const time = (params: TurnParams, s: MoveSettings) => seconds(turn(start, { to, ...params }, s), start);
    const natural = time({}, NATURAL);
    assert.ok(natural > 0.55 && natural < 0.65, `natural turn ${natural.toFixed(2)}s`);
    // Fast or lively: about 0.45 s; at slow speed (relaxed, only half in a hurry): about 0.9 s.
    for (const s of [QUICK, { ...NATURAL, style: "happy", energy: 0.85 } as MoveSettings, { ...NATURAL, style: "angry", speed: "fast", energy: 0.85 } as MoveSettings]) {
      assert.ok(time({}, s) > 0.38 && time({}, s) < 0.52, `${s.style}/${s.speed}/${s.energy} turn ${time({}, s).toFixed(2)}s`);
    }
    const slowSpeed = time({}, { ...NATURAL, speed: "slow" });
    assert.ok(slowSpeed > 0.8 && slowSpeed < 1.0, `slow speed ${slowSpeed.toFixed(2)}s`);
    // "Slowly turn around": careful, no hurry, about a second.
    const careful = time({ slow: true }, NATURAL);
    assert.ok(careful > 0.9 && careful < 1.1 && careful > 1.5 * natural, `slow turn ${careful.toFixed(2)}s`);
    assert.ok(time({}, SNEAKY) > 1.3 * natural, "sneaky turn is slower");
    // Never a spin: even the liveliest, fastest turn keeps its two steps visible (over a third of a second).
    for (const s of allSettings()) assert.ok(time({}, s) > 0.36, `${s.style}/${s.speed}/${s.energy} not too quick`);
  }
  // Quarter turns are quicker still (one step).
  for (const [from, to] of QUARTER) {
    const start = stanceAt(from), quarter = seconds(turn(start, { to }, NATURAL), start);
    assert.ok(quarter > 0.3 && quarter < 0.55, `${from}->${to} ${quarter.toFixed(2)}s`);
  }
  // The counter-move eases in slowly; the steps are the quick part; the settle eases out.
  const out = turn(stanceAt("right"), { to: "left" }, NATURAL);
  assert.equal(out.keys[0].ease, "smooth");
  assert.equal(out.keys[out.keys.length - 2].ease, "smooth");
});

// Turning in a hurry moves the limbs a bit more per frame than a calm move (round 4: faster turns);
// still far inside the engine's body rules.
const TURN_STEP_NATURAL = 22, TURN_STEP_ANY = 28;

test("turn: nothing jumps between frames (24 fps), and planted feet never slide — not even when the view switches", () => {
  for (const [from, to] of [...FULL, ...QUARTER]) {
    const out = turn(stanceAt(from), { to }, NATURAL);
    const frames = skeletons(out.keys, from);
    const step = biggestStep(frames);
    assert.ok(step < TURN_STEP_NATURAL, `${from}->${to}: a joint moved ${step.toFixed(1)}px in one frame`);
    assert.ok(plantedSlide(out.keys, frames) < 0.5, `${from}->${to}: a planted foot moved ${plantedSlide(out.keys, frames).toFixed(2)}px`);
  }
  // Every style, speed and energy stays smooth too (lively, fast turns move a bit more per frame), and
  // wherever the frames fall (a move can start at any moment).
  for (const s of allSettings()) for (const [from, to] of [...FULL, ...QUARTER]) for (const t of [1.25, 1.26, 1.27]) {
    const out = turn({ ...stanceAt(from), t }, { to }, s);
    const frames = buildScene(sceneOfKeys(out.keys, from), 24).frames.map((f) => f[0].skeleton);
    const label = `${from}->${to} ${s.style}/${s.speed}/${s.energy} @${t}`;
    assert.ok(biggestStep(frames) < TURN_STEP_ANY, `${label}: ${biggestStep(frames).toFixed(1)}px in one frame`);
    assert.ok(plantedSlide(out.keys, frames) < 0.5, `${label}: planted foot moved ${plantedSlide(out.keys, frames).toFixed(2)}px`);
  }
});

test("turn: body rules for every style, speed and energy, to and from every facing (also slow)", () => {
  for (const s of allSettings()) for (const [from, to] of [...FULL, ...QUARTER]) for (const slow of [false, true]) {
    const start = stanceAt(from);
    const out = turn(start, { to, slow }, s);
    const label = `turn ${from}->${to} ${s.style}/${s.speed}/${s.energy}${slow ? " slow" : ""}`;
    const built = assertNatural(sceneOfKeys(out.keys, from), label, { maxJointStepPx24: TURN_STEP_ANY });
    assert.equal(built.frames[built.frames.length - 1][0].facing, to, `${label}: faces ${to}`);
    assert.deepEqual(out.keys[out.keys.length - 1].pose, restPoseFor(to), `${label}: ends in the stand`);
    assert.equal(out.keys[0].t, start.t);
    assert.deepEqual(out.keys[0].pose, start.pose);
    for (let i = 1; i < out.keys.length; i += 1) assert.ok(out.keys[i].t > out.keys[i - 1].t, `${label}: keys in time order`);
    // A quarter turn (to or from the front) is a single step.
    assert.equal(liftedFeet(out.keys).length, from === "front" || to === "front" ? 1 : 2, `${label}: steps`);
  }
});

test("turn: the counter-move goes the other way first (shoulders turn back a little, lean back, knees give)", () => {
  const start = stanceAt("right");
  const out = turn(start, { to: "left" }, NATURAL);
  const counter = out.keys[1].pose, first = out.keys[2].pose;
  // Turning toward the viewer, the near (l) arm swings back and the far (r) arm forward; first the other way.
  assert.ok(counter.lShoulder > STAND.lShoulder && first.lShoulder < STAND.lShoulder, "near arm forward first, then back");
  assert.ok(counter.rShoulder < STAND.rShoulder && first.rShoulder > STAND.rShoulder, "far arm back first, then forward");
  assert.ok(counter.lean < 0, "leans back a touch");
  assert.ok(counter.lKnee > STAND.lKnee && counter.rKnee > STAND.rKnee, "knees give");
});

// A fighting stance like the one punches and kicks flow out of: front (l) foot 0.16 H ahead of the hips,
// back foot 0.13 H behind, hips low, hands up by the chin. Legs worked out so both feet are on the ground.
function fightingStance(): PoseAngles {
  const lean = 4, below = 0.42;
  const leg = (dx: number) => {
    const bend = (Math.acos(Math.min(1, Math.hypot(dx, below) / 0.46)) * 180) / Math.PI, line = (Math.atan2(dx, below) * 180) / Math.PI;
    return { hip: line + bend + lean, knee: 2 * bend };
  };
  const front = leg(0.16), back = leg(-0.13);
  return withPose(STAND, { lean, head: 6, lShoulder: 50, lElbow: 112, rShoulder: 28, rElbow: 136, lHip: front.hip, lKnee: front.knee, rHip: back.hip, rKnee: back.knee });
}

test("turn from a fighting stance (feet wide apart, hands up): still two steps, feet never slide, ends standing", () => {
  const guard = fightingStance();
  for (const facing of ["right", "left"] as const) {
    const start = stanceAt(facing, guard);
    const first = skeletons([{ t: 0, x: start.x, pose: guard, contacts: ["lFoot", "rFoot"] }], facing)[0];
    assert.ok(Math.abs(first.lFoot.y - first.rFoot.y) < 0.5, "the test stance stands on both feet");
    for (const s of [NATURAL, SNEAKY, QUICK, { ...NATURAL, style: "angry", energy: 0.85 } as MoveSettings]) {
      const out = turn(start, {}, s);
      const label = `fighting stance ${facing} ${s.style}/${s.speed}`;
      const frames = skeletons(out.keys, facing);
      assertNatural(sceneOfKeys(out.keys, facing), label, { maxJointStepPx24: 32 });
      assert.equal(liftedFeet(out.keys).length, 2, `${label}: two steps`);
      assert.equal(out.end.facing, facing === "right" ? "left" : "right");
      assert.ok(plantedSlide(out.keys, frames) < 0.5, `${label}: planted foot moved ${plantedSlide(out.keys, frames).toFixed(2)}px`);
      assert.deepEqual(out.keys[out.keys.length - 1].pose, STAND);
    }
  }
});

test("turn: also from the side STAND pose drawn facing the viewer; turning to the way it already faces does nothing", () => {
  for (const to of ["left", "right"] as const) assertNatural(sceneOfKeys(turn(startStance("front"), { to }, NATURAL).keys, "front"), `front STAND -> ${to}`);
  const same = turn(stanceAt("left"), { to: "left" }, NATURAL);
  assert.equal(same.keys.length, 1);
  assert.equal(same.end.t, 1.25);
});

test("stepping into a stand (feet first) is quick too, in the same hurry: one step, nothing slides", () => {
  const guard = fightingStance();
  for (const facing of ["right", "left"] as const) for (const s of allSettings()) {
    const start = stanceAt(facing, guard);
    const out = stepInto(start, STAND, s);
    const label = `stepInto ${facing} ${s.style}/${s.speed}/${s.energy}`;
    assertNatural(sceneOfKeys(out.keys, facing), label, { maxJointStepPx24: TURN_STEP_ANY });
    assert.equal(liftedFeet(out.keys).length, 1, `${label}: one step`);
    assert.ok(plantedSlide(out.keys, skeletons(out.keys, facing)) < 0.5, `${label}: planted foot slid`);
    assert.deepEqual(out.end.pose, STAND);
    if (s.style === "natural" && s.speed === "normal" && s.energy === 0.5) assert.ok(seconds(out, start) < 0.6, `${label}: ${seconds(out, start).toFixed(2)}s`);
  }
});

// ---- Looking back ---------------------------------------------------------------------------

test("look back: the feet stay planted and the facing stays; the shoulders turn (near arm back, far arm forward), the head turns back", () => {
  for (const facing of ["right", "left"] as const) {
    const start = stanceAt(facing);
    const out = lookBack(start, {}, NATURAL);
    const built = frames24(out.keys, facing);
    const frames = built.frames.map((f) => f[0].skeleton);
    assert.ok(built.frames.every((f) => f[0].facing === facing), `${facing}: keeps facing`);
    assert.ok(out.keys.every((k) => (k.contacts ?? []).length === 2), `${facing}: both feet planted throughout`);
    assert.ok(plantedSlide(out.keys, frames) < 0.01, `${facing}: feet don't move`);
    // At the look: the near hand (l facing right, r facing left) is well behind where it started, the far
    // hand well in front; the head has turned back. Not a 180: the hips and legs don't turn.
    const fwd = facing === "left" ? -1 : 1, near = facing === "left" ? "rHand" : "lHand", far = facing === "left" ? "lHand" : "rHand";
    const at = (t: number) => frames[Math.round((t - 0) * 24)];
    const first = frames[0], look = at(out.marks.looking + 0.1);
    assert.ok((look[near].x - first[near].x) * fwd < -25, `${facing}: near arm swings back ${((look[near].x - first[near].x) * fwd).toFixed(0)}px`);
    assert.ok((look[far].x - first[far].x) * fwd > 25, `${facing}: far arm swings forward ${((look[far].x - first[far].x) * fwd).toFixed(0)}px`);
    assert.ok((look.head.x - first.head.x) * fwd < -8, `${facing}: head goes back`);
    const lookPose = out.keys.find((k) => Math.abs(k.t - out.marks.looking) < 1e-9)!.pose;
    assert.ok(lookPose.head <= -15 && lookPose.head >= JOINT_LIMITS.head[0], "head turned back, inside its limit");
    for (const foot of ["lFoot", "rFoot"] as const) assert.ok(Math.abs(look[foot].x - first[foot].x) < 0.01 && Math.abs(look.hip.x - first.hip.x) < 0.01, "legs and hips stay");
    // Ends in the pose it started with, after `looking` then `back`; the last settle is the return to rest.
    assert.ok(out.marks.looking > start.t && out.marks.back > out.marks.looking && out.marks.back < out.end.t);
    // (Round 7) `go`: the look is over, before turning back — where a run away starts (RUN FROM THE LOOK).
    assert.ok(out.marks.go > out.marks.looking && out.marks.go < out.marks.back, "go mark between looking and back");
    assert.deepEqual(out.end, { t: out.keys[out.keys.length - 1].t, x: start.x, facing, pose: start.pose });
    assert.ok(out.flow && out.flow.keys === out.keys.length - 1, "final settle is the return to rest");
  }
});

test("look back timing: about a second; slower and careful when sneaky; a quick look a bit under a second; `seconds` sets the look", () => {
  const start = stanceAt("right");
  const natural = seconds(lookBack(start, {}, NATURAL), start);
  assert.ok(natural >= 0.9 && natural <= 1.2, `natural ${natural.toFixed(2)}s`);
  const sneaky = seconds(lookBack(start, {}, SNEAKY), start);
  assert.ok(sneaky >= 1.0 && sneaky <= 1.6 && sneaky > natural, `sneaky ${sneaky.toFixed(2)}s`);
  const quick = seconds(lookBack(start, {}, QUICK), start);
  assert.ok(quick < 1.0 && quick < natural && quick > 0.7, `quick ${quick.toFixed(2)}s`);
  // The look itself lasts what was asked, whatever the style.
  for (const s of [NATURAL, SNEAKY, QUICK]) {
    const short = lookBack(start, { seconds: 0.2 }, s), long = lookBack(start, { seconds: 1.2 }, s);
    assert.ok(Math.abs(seconds(long, start) - seconds(short, start) - 1.0) < 1e-6, `${s.style}/${s.speed}: seconds is the look time`);
  }
});

test("look back: the counter-move goes the other way first, then a smooth turn", () => {
  for (const facing of ["right", "left"] as const) {
    const out = lookBack(stanceAt(facing), {}, NATURAL);
    const near = facing === "left" ? "rShoulder" : "lShoulder", far = facing === "left" ? "lShoulder" : "rShoulder";
    const counter = out.keys[1].pose, look = out.keys[2].pose;
    assert.ok(counter[near] > STAND[near] && look[near] < STAND[near], "near arm forward first, then back");
    assert.ok(counter[far] < STAND[far] && look[far] > STAND[far], "far arm back first, then forward");
    assert.ok(counter.head > 0 && look.head < 0, "head forward first, then back");
    assert.equal(out.keys[1].ease, "smooth", "the turn speeds up and slows down");
  }
});

test("look back: body rules and small frame steps for every style, speed and energy, facing right, left or the viewer, from a flow pose too", () => {
  for (const facing of ["right", "left", "front"] as const) {
    const natural = lookBack(stanceAt(facing), {}, NATURAL);
    assert.ok(biggestStep(skeletons(natural.keys, facing)) < 14, `${facing}: ${biggestStep(skeletons(natural.keys, facing)).toFixed(1)}px in one frame`);
    for (const s of allSettings()) {
      const start = stanceAt(facing);
      const out = lookBack(start, {}, s);
      const label = `lookBack ${facing} ${s.style}/${s.speed}/${s.energy}`;
      assertNatural(sceneOfKeys(out.keys, facing), label, { maxJointStepPx24: 17 });
      assert.deepEqual(out.end.pose, start.pose, `${label}: ends where it started`);
      assert.ok(out.marks.looking < out.marks.back, `${label}: marks`);
    }
  }
  // From a flow pose (hands up in a guard, feet apart), and it comes back to exactly that pose.
  const guard = fightingStance();
  for (const facing of ["right", "left"] as const) {
    const start = stanceAt(facing, guard);
    const out = lookBack(start, {}, NATURAL);
    const frames = skeletons(out.keys, facing);
    assertNatural(sceneOfKeys(out.keys, facing), `lookBack guard ${facing}`, { maxJointStepPx24: 14 });
    assert.ok(plantedSlide(out.keys, frames) < 0.01);
    assert.deepEqual(out.end.pose, guard);
  }
});
