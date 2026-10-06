import assert from "node:assert/strict";
import test from "node:test";
import { buildScene, type Scene } from "../engine.ts";
import { STAND } from "../rig.ts";
import { getHit, reactionOf, slumpedGuard } from "./hit.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type Action, type ScenePlan } from "./plan.ts";
import { feetOf, fightFeet } from "./punch.ts";
import { MOVE_STYLES } from "./styles.ts";
import { armPathProblems, TEST_HEIGHT } from "./testkit.ts";

// PARRY (round 12, Arthur: "Blue gets his arm, pushes it out of the way, and then he quickly kicks him,
// punches him"): getHit result "parry" — the lead forearm meets the punching arm at the wrist and sweeps it
// aside, no damage, the guard back at once; then the counter.

type P = { x: number; y: number };
const segDist = (p: P, a: P, b: P) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
// A punches B; B parries, then counters (a kick or a punch) and A takes it.
const parryPlan = (style: string, flip: boolean, technique: string, counter: "kick" | "punch"): ScenePlan => ({
  id: "parry", title: "parry", height: TEST_HEIGHT, groundY: 900,
  characters: [
    { id: "a", x: flip ? 1080 : 840, facing: flip ? "left" : "right", style: style as never, energy: 0.6, actions: [
      { move: "punch", params: { target: "b", technique, hand: "front" } },
      { move: "getHit", params: { from: "b" } },
    ] as Action[] },
    { id: "b", x: flip ? 840 : 1080, facing: flip ? "right" : "left", style: style as never, energy: 0.5, actions: [
      { move: "getHit", params: { from: "a", result: "parry" } },
      counter === "kick" ? { move: "kick", params: { target: "a" } } : { move: "punch", params: { target: "a", technique: "straight", hand: "back" } },
    ] as Action[] },
  ],
});
const JOINT_PX_PER_SEC = 2880, ARM_DEG_PER_SEC = 2400;
function bodyRules(scene: Scene, fps: number, label: string) {
  const built = buildScene(scene, fps);
  for (const r of built.report.characters) {
    assert.ok(r.maxBoneErrorPx <= 0.5, `${label}@${fps}: bones stretched ${r.maxBoneErrorPx.toFixed(2)}`);
    assert.ok(r.maxFootDriftPx <= 1, `${label}@${fps}: planted foot slid ${r.maxFootDriftPx.toFixed(2)}`);
    assert.equal(r.belowGroundFrames, 0, `${label}@${fps}: went through the floor`);
    assert.ok(r.maxJointStepPx < JOINT_PX_PER_SEC / fps, `${label}@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)}px`);
  }
  const arms = armPathProblems(built.frames, fps, ARM_DEG_PER_SEC / fps);
  assert.deepEqual(arms, [], `${label}@${fps}: ${arms.join("; ")}`);
}

test("reactionOf accepts parry; the parry move is fast and marks hit, parry, ready", () => {
  assert.equal(reactionOf({ result: "parry", power: 1.6 }), "parry");
  const start = { t: 0, x: 960, facing: "left" as const, pose: slumpedGuard(fightFeet(feetOf(STAND)), 0) };
  for (const style of MOVE_STYLES) {
    const out = getHit(start, { result: "parry", power: 1 }, { height: TEST_HEIGHT, style, speed: "normal", energy: 0.5 });
    assert.ok(out.marks.hit > 0 && out.marks.parry === out.marks.hit, `${style}: hit ${out.marks.hit}`);
    assert.ok(out.marks.hit < 0.25, `${style}: the forearm is up in time (${out.marks.hit.toFixed(2)}s)`);
    assert.ok(out.marks.ready - out.marks.hit < 0.5, `${style}: ready fast (${(out.marks.ready - out.marks.hit).toFixed(2)}s after the hit)`);
  }
});

test("parry: the forearm meets the punching fist; no damage; then the counter lands", () => {
  for (const flip of [false, true]) for (const technique of ["straight", "power", "overhand"]) for (const counter of ["kick", "punch"] as const) {
    const label = `${flip ? "left" : "right"} ${technique} -> ${counter}`;
    const scene = planToScene(parryPlan("natural", flip, technique, counter), LIBRARY);
    const hit = scene.marks["b.getHit1.hit"];
    assert.ok(Math.abs(hit - scene.marks["a.punch1.hit"]) < 1e-6, `${label}: the parry is on the punch's hit`);
    assert.ok(scene.marks["b.getHit1.react"] - hit < 0.15, `${label}: sweeps it aside at once`);
    assert.equal(scene.hurt.b ?? 0, 0, `${label}: a parry does no damage`);
    const counterHit = scene.marks[`b.${counter}1.hit`];
    assert.ok(counterHit > hit && Math.abs(scene.marks["a.getHit1.hit"] - counterHit) < 1e-6, `${label}: A takes the counter on its hit`);
    // The punching fist is on the parrying forearm at the hit (within a few px).
    const fps = 240, built = buildScene(scene, fps);
    const [A, B] = built.frames[Math.round(hit * fps)];
    const s = B.skeleton;
    const d = Math.min(...[A.skeleton.lHand, A.skeleton.rHand].map((h) => Math.min(segDist(h, s.lElbow, s.lHand), segDist(h, s.rElbow, s.rHand))));
    assert.ok(d < 8, `${label}: fist ${d.toFixed(1)}px from the forearm`);
    bodyRules(scene, 12, label);
  }
});

test("parry keeps the body rules and arm paths in every mood, both ways, 8-24 fps", () => {
  for (const style of MOVE_STYLES) for (const flip of [false, true]) {
    const scene = planToScene(parryPlan(style, flip, "straight", flip ? "punch" : "kick"), LIBRARY);
    for (const fps of [8, 12, 24]) bodyRules(scene, fps, `${style} ${flip ? "left" : "right"}`);
  }
});
