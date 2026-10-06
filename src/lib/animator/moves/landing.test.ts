import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type Scene } from "../engine.ts";
import { DEFAULT_STYLE, STAND, withPose, type Facing } from "../rig.ts";
import { fall, FALLEN_BACK, FALLEN_FORWARD } from "./fall.ts";
import { hardBackLanding, LANDING, landOnBack } from "./liftSlam.ts";
import type { MoveSettings } from "./motion.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// LANDINGS DEPEND ON THE FALL (liftSlam.ts landOnBack): one landing rule for every fall onto the body, scaled by
// how fast it hits — a normal fall barely bounces, a slam or blast is the passed slam landing, a huge fall
// bounces high, flips and lands face down.
const H = TEST_HEIGHT;
const SET: MoveSettings = { height: H, style: "natural", speed: "normal", energy: 0.5 };
// The back hitting the floor, legs still up (as a body arrives at a hard landing).
const IMPACT = withPose(FALLEN_BACK, { head: 20, lHip: FALLEN_BACK.lHip + 30, rHip: FALLEN_BACK.rHip + 24, lKnee: 40, rKnee: 30 });
const sceneOf = (keys: CharacterKey[], facing: Facing = "right"): Scene => ({
  id: "l", title: "l", durationSec: Math.ceil((keys[keys.length - 1].t + 0.2) * 10) / 10, groundY: TEST_GROUND,
  characters: [{ id: "a", name: "a", facing, height: H, style: DEFAULT_STYLE, keys }],
});
function landed(speed: number, facing: Facing = "right") {
  const impact = { t: 0.2, x: 960, facing, pose: IMPACT };
  const out = landOnBack(impact, FALLEN_BACK, 1, SET, { speed, front: FALLEN_FORWARD });
  const keys: CharacterKey[] = [{ t: 0, pose: IMPACT, x: 960, lift: 0, contacts: [], ease: "linear" }, ...out.keys.slice(1)];
  const frames = buildScene(sceneOf(keys, facing), 48).frames.map((f) => f[0].skeleton);
  const rest = frames[frames.length - 1].hip.y;
  const after = frames.slice(Math.round(0.2 * 48));
  return { out, frames: after, bounce: Math.max(...after.map((s) => rest - s.hip.y)), built: buildScene(sceneOf(keys, facing), 24) };
}

test("landings: the bounce grows with the impact speed (small fall .. slam .. huge fall)", () => {
  const speeds = [1, 2, 3, LANDING.bigFrom, 7.7, LANDING.bigTo, 15, 20, 30];
  const bounces = speeds.map((v) => landed(v).bounce);
  for (let i = 1; i < bounces.length; i += 1) assert.ok(bounces[i] >= bounces[i - 1] - 1, `bounce shrinks at ${speeds[i]} H/s: ${bounces.map((b) => b.toFixed(0)).join(", ")}`);
  assert.ok(bounces[0] < bounces[4] && bounces[4] < bounces[bounces.length - 1], `grows: ${bounces.map((b) => b.toFixed(0)).join(", ")}`);
  for (const v of speeds) assert.equal(landed(v).built.report.characters[0].belowGroundFrames, 0, `${v} H/s: through the floor`);
});

test("landings: a slam-speed landing is exactly the passed slam landing", () => {
  for (const v of [LANDING.bigFrom, 7.7, LANDING.bigTo]) {
    const impact = { t: 1, x: 900, facing: "left" as const, pose: IMPACT };
    assert.deepEqual(landOnBack(impact, FALLEN_BACK, -1, SET, { speed: v }), hardBackLanding(impact, FALLEN_BACK, -1, SET), `${v} H/s`);
  }
});

test("landings: a normal fall onto the back (a knock-down) barely bounces — 2% of the height or less", () => {
  for (const facing of ["right", "left"] as const) for (const speed of [0, 200]) {
    const out = fall({ t: 0.2, x: 960, facing, pose: STAND }, { direction: "back", speed }, SET);
    const frames = buildScene(sceneOf([{ t: 0, pose: STAND, x: 960, lift: 0, contacts: ["lFoot", "rFoot"] }, ...out.keys], facing), 48).frames.map((f) => f[0].skeleton);
    const iBack = frames.findIndex((s) => s.neck.y >= TEST_GROUND - 0.06 * H && s.hip.y >= TEST_GROUND - 0.12 * H);
    assert.ok(iBack > 0, "the back hits the floor");
    const rest = frames[frames.length - 1].hip.y, low = Math.min(...frames.slice(iBack).map((s) => s.hip.y));
    const bounce = rest - low;
    assert.ok(bounce <= 0.02 * H, `${facing} ${speed}: bounce ${bounce.toFixed(1)} px`);
  }
});

test("landings: a huge fall bounces high (0.6 x height or more), turns right over (180 degrees or more) and lands face down", () => {
  for (const facing of ["right", "left"] as const) {
    const { bounce, frames, built, out } = landed(30, facing);
    assert.ok(bounce >= 0.6 * H, `${facing}: bounce ${(bounce / H).toFixed(2)} x height`);
    // The torso's turn (hip to neck), unwrapped, from the hit to the second landing.
    let turn = 0, last = Math.atan2(frames[0].neck.x - frames[0].hip.x, frames[0].hip.y - frames[0].neck.y);
    let most = 0;
    for (const s of frames) {
      const a = Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y);
      let d = a - last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      turn += d; last = a; most = Math.max(most, Math.abs(turn));
    }
    assert.ok((most * 180) / Math.PI >= 180, `${facing}: turned ${((most * 180) / Math.PI).toFixed(0)} degrees`);
    assert.ok(out.end.pose.lean > 60, `${facing}: ends face down (lean ${out.end.pose.lean.toFixed(0)})`);
    const r = built.report.characters[0];
    assert.equal(r.belowGroundFrames, 0, `${facing}: through the floor`);
    assert.ok(r.maxBoneErrorPx <= 0.5);
  }
  // Below the flip it bounces and comes back down on its back.
  assert.ok(landed(15).out.end.pose.lean < -60, "a big-but-not-huge fall stays on its back");
});
