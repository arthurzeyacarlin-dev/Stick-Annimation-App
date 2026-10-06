import assert from "node:assert/strict";
import test from "node:test";
import { buildScene, momentTimes, type Scene } from "../engine.ts";
import { centerAnimation } from "../stageFit.ts";
import { armPathProblems, heldContactProblems } from "./testkit.ts";
import { COMBO_TESTS, makeSurpriseScene, makeTestScene, SINGLE_MOVE_TESTS, type TestLook } from "./tests.ts";

// FRAMES PER SECOND (Arthur, round 9, not optional): "every animation follows the project's FPS" — 8, 10,
// 12, 13, 15, 24, 30, whatever the user picked — with the same timing in seconds, just fewer or more
// pictures. The app builds every scene at the project's rate (buildScene(scene, timelineFps)), so every
// review scene and random combos must keep all the rules at the rates nobody looked at so far, and the
// key moments (a punch's hit, a take-off, a landing, a catch) must still get a picture of their own.
// Limits scale with the rate the way 24 -> 120 px and 12 -> 240 px do: the same speed per second.
const RATES = [8, 10, 13, 15, 30];
const LOOKS: TestLook[] = [
  { style: "natural", speed: "normal", energy: 0.5, direction: 1 }, { style: "angry", speed: "fast", energy: 0.85, direction: -1 },
  { style: "tired", speed: "slow", energy: 0.2, direction: 1 }, { style: "robot", speed: "normal", energy: 0.5, direction: -1 },
];
const PAGES = [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9].map((a) => 1080 * a);
const JOINT_PX_PER_SEC = 120 * 24; // 120 px a picture at 24 fps
const ARM_DEG_PER_SEC = 100 * 24; // 100 degrees a picture at 24 fps

type Pt = { x: number; y: number };
const angleDown = (a: Pt, b: Pt) => (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
const wrap180 = (d: number) => ((d + 540) % 360) - 180;

// READS THE RIGHT WAY ROUND: between two pictures an upper arm or forearm turns less than half a turn
// (more, and the eye sees it go the other way). Measured on the true motion (built at 96 fps).
const DENSE = 96;
function halfTurnProblems(scene: Scene, fps: number, built = buildScene(scene, DENSE)): string[] {
  const dense = DENSE, times = momentTimes(scene, fps);
  const out: string[] = [];
  for (let ci = 0; ci < scene.characters.length; ci += 1) for (const side of ["l", "r"] as const) {
    for (const [from, to] of [["neck", `${side}Elbow`], [`${side}Elbow`, `${side}Hand`]] as const) {
      const turned: number[] = [];
      let previous = 0;
      built.frames.forEach((frame, i) => {
        const a = angleDown(frame[ci].skeleton[from], frame[ci].skeleton[to]);
        turned.push(i === 0 ? a : turned[i - 1] + wrap180(a - previous));
        previous = a;
      });
      for (let i = 1; i < times.length; i += 1) {
        const a = Math.min(turned.length - 1, Math.round(times[i - 1] * dense)), b = Math.min(turned.length - 1, Math.round(times[i] * dense));
        const turn = Math.abs(turned[b] - turned[a]);
        if (turn >= 180) { out.push(`character ${ci} ${from}-${to} turns ${turn.toFixed(0)} degrees between two pictures at ${times[i].toFixed(2)}s`); break; }
      }
    }
  }
  return out;
}

function assertAtRate(scene: Scene, fps: number, stageWidth: number, label: string) {
  const built = buildScene(scene, fps);
  // Same timing in seconds: round(duration x fps) pictures after the first, the last one at the end.
  assert.ok(Math.abs(built.frames.length - (Math.round(scene.durationSec * fps) + 1)) <= 1, `${label}@${fps}: ${built.frames.length} pictures for ${scene.durationSec}s`);
  const limit = JOINT_PX_PER_SEC / fps;
  for (const r of built.report.characters) {
    assert.ok(r.maxBoneErrorPx <= 0.5, `${label}@${fps}: bones stretched ${r.maxBoneErrorPx.toFixed(2)}`);
    assert.ok(r.maxFootDriftPx <= 1, `${label}@${fps}: planted foot slid ${r.maxFootDriftPx.toFixed(2)}`);
    assert.equal(r.belowGroundFrames, 0, `${label}@${fps}: went through the floor`);
    assert.ok(r.maxJointStepPx < limit, `${label}@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)}px in one picture (limit ${limit.toFixed(0)})`);
  }
  assert.ok(centerAnimation(built.frames, stageWidth, built.objects).fits, `${label}@${fps}: off the page`);
  const arms = armPathProblems(built.frames, fps, ARM_DEG_PER_SEC / fps);
  assert.deepEqual(arms, [], `${label}@${fps}: ${arms.join("; ")}`);
  const touch = heldContactProblems(scene, built);
  assert.equal(touch.floating, 0, `${label}@${fps}: ${touch.problems.join("; ")}`);
  return built;
}

test("every review scene keeps the body rules, arm paths, ball contact, page fit and timing at 8, 10, 13, 15 and 30 fps", () => {
  for (const entry of [...SINGLE_MOVE_TESTS, ...COMBO_TESTS]) for (const [k, look] of LOOKS.entries()) {
    const width = PAGES[(k * 2 + entry.id.length) % PAGES.length];
    const scene = makeTestScene(entry.id, look, width);
    for (const fps of RATES) assertAtRate(scene, fps, width, `${entry.id} ${look.style} page ${width.toFixed(0)}`);
  }
});

test("random combos (the app's Random combo button) keep every rule at 8, 10, 13, 15 and 30 fps", () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const look = LOOKS[seed % LOOKS.length], width = PAGES[seed % PAGES.length];
    const scene = makeSurpriseScene(seed * 104729, look, width);
    for (const fps of RATES) assertAtRate(scene, fps, width, `seed ${seed} ${scene.title} (${look.style}, page ${width.toFixed(0)})`);
  }
});

test("arms never turn half a turn or more between two pictures, even at 8 fps", () => {
  for (const entry of [...SINGLE_MOVE_TESTS, ...COMBO_TESTS]) for (const look of LOOKS) {
    const scene = makeTestScene(entry.id, look, 1920), dense = buildScene(scene, DENSE);
    for (const fps of [8, 10, 12]) {
      const problems = halfTurnProblems(scene, fps, dense);
      assert.deepEqual(problems, [], `${entry.id} ${look.style}@${fps}: ${problems.join("; ")}`);
    }
  }
});

// KEY MOMENTS SHOW (engine.ts momentTimes): a plan's named moments (a hit, a take-off, the top of a jump, a
// landing, a release, a catch, a high-five's slap) get a picture within 1/48 s of them at any rate. Before
// this rule, at 8 fps only about a third of them had one (half at 12 fps); now about 9 in 10 at 8 fps and
// nearly all from 10 fps up. (When two moments are closer than one picture, only one can have it.)
// (Round 9, lead: the moment rule works below 12 fps; from 12 up the pictures stay evenly spaced, as Arthur rated them.)
test("key moments (hit, take-off, top, landing, release, catch, slap) get their own picture at 8 and 10 fps", () => {
  const scenes = [...SINGLE_MOVE_TESTS, ...COMBO_TESTS].flatMap((entry) => LOOKS.map((look) => makeTestScene(entry.id, look, 1920) as Scene));
  for (const fps of [8, 10]) {
    let all = 0, shown = 0;
    const missed: string[] = [];
    for (const scene of scenes) {
      const times = momentTimes(scene, fps);
      for (const [name, t] of Object.entries(scene.marks ?? {})) {
        if (!/^[^.]+\.[A-Za-z]+\d+\.(hit|takeoff|top|land|release|catch|slap|impact)$/.test(name) || t <= 0 || t >= scene.durationSec) continue;
        all += 1;
        if (Math.min(...times.map((p) => Math.abs(p - t))) <= 1 / 48 + 1e-9) shown += 1;
        else missed.push(`${scene.id} ${name}`);
      }
    }
    assert.ok(all > 300, `only ${all} moments`);
    assert.ok(shown >= 0.85 * all, `@${fps}: only ${shown} of ${all} key moments have a picture; missed ${missed.slice(0, 6).join(", ")}`);
  }
});

test("a punch's hit shows the arm straight out at 8 fps, as at 24 fps", () => {
  for (const look of LOOKS) {
    const scene = makeTestScene("punch", look, 1920) as Scene & { marks: Record<string, number> };
    const hit = scene.marks["a.punch1.hit"];
    const at = (fps: number) => {
      const built = buildScene(scene, fps), times = momentTimes(scene, fps);
      let best = 0;
      times.forEach((t, i) => { if (Math.abs(t - hit) < Math.abs(times[best] - hit)) best = i; });
      const s = built.frames[best][0].skeleton;
      return Math.max(Math.abs(s.lHand.x - s.neck.x), Math.abs(s.rHand.x - s.neck.x));
    };
    const reach24 = at(24);
    for (const fps of [8, 10]) assert.ok(at(fps) >= reach24 - 0.05 * 300, `${look.style}@${fps}: the hit picture reaches ${at(fps).toFixed(0)}px, at 24 fps ${reach24.toFixed(0)}px`);
  }
});
