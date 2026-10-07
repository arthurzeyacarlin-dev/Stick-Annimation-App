import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEffectFrames } from "../effects/index.ts";
import { buildScene } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, type Facing, type Point, type PoseAngles, type Skeleton } from "../rig.ts";
import type { AnimationRead } from "../vision/readAnimation.ts";
import type { ReadDrawing } from "../vision/types.ts";
import { finishAnimation, type AnimationReadForFinish, type FinishPhase } from "./finishAnimation.ts";
import { JOINT_PICKS, readDrawnFigure, type DrawnLook, type JointPick } from "./fromDrawing.ts";

// Finish reads the WHOLE animation (built here by hand, as vision/readAnimation.ts would) and carries on.
const H = 300, FLOOR = 820;
const LOOK: DrawnLook = { color: "#2563eb", thickness: 6, headFilled: false, headRadius: HEAD_RADIUS.normal * H };
const PICKS = JOINT_PICKS.map((p) => p.joint);
const jointsOf = (s: Skeleton): Record<JointPick, Point> => Object.fromEntries(PICKS.map((j) => [j, { ...s[j] }])) as Record<JointPick, Point>;
const drawn = (pose: PoseAngles, facing: Facing, x: number, feetY: number) => {
  const s = forwardKinematics(pose, facing, { x, y: 0 }, H, "normal", false);
  const dy = feetY - Math.max(s.lFoot.y, s.rFoot.y);
  for (const p of Object.values(s)) p.y += dy;
  return jointsOf(s);
};
const CROUCH: PoseAngles = { lean: 25, head: -5, lShoulder: -30, rShoulder: -25, lElbow: 20, rElbow: 20, lHip: 75, rHip: 75, lKnee: 110, rKnee: 110 };
const TAKE_OFF: PoseAngles = { ...STAND, lean: 10, lShoulder: 120, rShoulder: 110, lHip: 10, rHip: -5, lKnee: 5, rKnee: 5 };
const HOP_UP: PoseAngles = { ...STAND, lShoulder: 150, rShoulder: 140, lHip: 20, rHip: -10, lKnee: 30, rKnee: 40 };
const STRIDE: PoseAngles = { ...STAND, lean: 12, lShoulder: 40, rShoulder: -40, lElbow: 60, rElbow: 60, lHip: 35, rHip: -25, lKnee: 20, rKnee: 50 };

// (The eyes' read of an animation fits straight in — checked by the type checker.)
export const fitsTheEyes = (a: AnimationRead): AnimationReadForFinish => a;

type Drawn = { pose: PoseAngles; x: number; feetY: number; phase: FinishPhase };
function read(list: Drawn[], step: number, facing: Facing = "right"): AnimationReadForFinish {
  const figures = list.map((d, i) => ({ frame: i * step, fig: readDrawnFigure(drawn(d.pose, facing, d.x, d.feetY), LOOK, { height: H, facing }) }));
  return { floor: FLOOR, height: H, figures, missed: [], effects: [], phases: list.map((d, i) => ({ frame: i * step, phase: d.phase })), going: "" };
}
const skeletons = (scene: ReturnType<typeof finishAnimation>, fps: number) => {
  const built = buildScene(scene, fps);
  const r = built.report.characters[0];
  assert.ok(r.belowGroundFrames === 0, `body rules ${JSON.stringify(r)}`);
  return built.frames.map((f) => f[0].skeleton);
};
// A hop finished right: it goes up (if `rises`), falls faster and faster, lands ON the floor (within 1%), never below,
// never runs, ends standing on the floor.
function checkHop(name: string, scene: ReturnType<typeof finishAnimation>, fps: number, startX: number, rises: boolean) {
  assert.equal(scene.groundY, FLOOR, `${name} @${fps}: the scene's floor`);
  assert.equal(scene.characters[0].height, H, `${name} @${fps}: size`);
  const frames = skeletons(scene, fps);
  const feetY = frames.map((f) => Math.max(f.lFoot.y, f.rFoot.y));
  assert.ok(Math.max(...feetY) <= FLOOR + 0.01 * H, `${name} @${fps}: goes below the floor (${Math.max(...feetY).toFixed(1)})`);
  const end = frames[frames.length - 1];
  assert.ok(Math.abs(Math.max(end.lFoot.y, end.rFoot.y) - FLOOR) <= 0.01 * H, `${name} @${fps}: ends at ${Math.max(end.lFoot.y, end.rFoot.y).toFixed(1)}, not on the floor`);
  assert.ok(Math.abs(end.neck.x - end.hip.x) < 0.08 * H && end.neck.y < end.hip.y - 0.2 * H, `${name} @${fps}: does not end standing`);
  assert.ok(Math.max(...frames.map((f) => Math.abs(f.hip.x - startX))) <= 0.35 * H, `${name} @${fps}: travels like a run`);
  const top = frames.reduce((b, f, i) => (f.hip.y < frames[b].hip.y ? i : b), 0);
  if (rises) {
    assert.ok(top > 0, `${name} @${fps}: never goes up`);
    assert.ok(frames[0].hip.y - frames[top].hip.y > 0.1 * H, `${name} @${fps}: barely leaves the floor (${(frames[0].hip.y - frames[top].hip.y).toFixed(1)}px)`);
    assert.ok(Math.min(...feetY.slice(0, top + 1)) < FLOOR - 0.08 * H, `${name} @${fps}: the feet never leave the floor`);
    // A hop, not a rocket (Arthur: "how the heck did he jump so high?"): the feet clear the floor by under 0.4 x the height.
    assert.ok(FLOOR - Math.min(...feetY) <= 0.4 * H, `${name} @${fps}: a rocket — the feet go ${(FLOOR - Math.min(...feetY)).toFixed(0)}px up`);
  }
  const land = feetY.findIndex((y, i) => i > top && y >= FLOOR - 0.01 * H);
  assert.ok(land > top, `${name} @${fps}: never lands`);
  const drops = frames.slice(top + 1, land + 1).map((f, i) => f.hip.y - frames[top + i].hip.y);
  for (let i = 1; i < drops.length - 1; i++) assert.ok(drops[i] >= drops[i - 1] - 0.5, `${name} @${fps}: the fall slows down (${drops.map((d) => d.toFixed(1)).join(", ")})`);
  if (drops.length >= 3) assert.ok(drops[drops.length - 2] > drops[0], `${name} @${fps}: the fall does not speed up (${drops.map((d) => d.toFixed(1)).join(", ")})`);
}

test("finishAnimation: a HOP (stand -> crouch -> legs extended) goes up and comes down onto the floor — never runs, never floats", () => {
  for (const fps of [8, 12, 24]) {
    const step = Math.max(1, Math.round(fps / 6));
    const a = read([{ pose: STAND, x: 700, feetY: FLOOR, phase: "standing" }, { pose: CROUCH, x: 700, feetY: FLOOR, phase: "anticipation" }, { pose: TAKE_OFF, x: 700, feetY: FLOOR - 2, phase: "takeoff" }], step);
    const scene = finishAnimation(a, "keepGoing", { stageWidth: 1920, fps });
    assert.match(scene.says, /hop/i);
    checkHop("hop", scene, fps, 700, true);
    // The first picture is the last drawing (the app skips it).
    const first = skeletons(scene, fps)[0], last = a.figures[2].fig.joints;
    assert.ok(Math.hypot(first.hip.x - last.hip.x, first.hip.y - last.hip.y) < 0.02 * H, `@${fps}: does not start at the drawing`);
  }
});

test("finishAnimation: a CROUCH (anticipation) finishes as the hop it was winding up for", () => {
  for (const fps of [8, 12, 24]) {
    const a = read([{ pose: STAND, x: 900, feetY: FLOOR, phase: "standing" }, { pose: CROUCH, x: 900, feetY: FLOOR, phase: "anticipation" }], 2);
    const scene = finishAnimation(a, "keepGoing", { stageWidth: 1920, fps });
    assert.match(scene.says, /crouch/i);
    checkHop("crouch", scene, fps, 900, true);
  }
});

test("finishAnimation: even from a VERY deep crouch, a finished hop stays a hop (never a rocket)", () => {
  const DEEP: PoseAngles = { ...CROUCH, lean: 35, lHip: 105, rHip: 105, lKnee: 145, rKnee: 145 };
  for (const fps of [8, 12, 24]) {
    const a = read([{ pose: STAND, x: 900, feetY: FLOOR, phase: "standing" }, { pose: DEEP, x: 900, feetY: FLOOR, phase: "anticipation" }, { pose: TAKE_OFF, x: 900, feetY: FLOOR - 2, phase: "takeoff" }], 2);
    checkHop("deep crouch", finishAnimation(a, "keepGoing", { stageWidth: 1920, fps }), fps, 900, true);
  }
});

test("finishAnimation: at the TOP / coming down it falls with gravity and lands on the floor", () => {
  for (const fps of [8, 12, 24]) {
    for (const phase of ["top", "falling"] as const) {
      const a = read([{ pose: STAND, x: 700, feetY: FLOOR, phase: "standing" }, { pose: CROUCH, x: 700, feetY: FLOOR, phase: "anticipation" }, { pose: HOP_UP, x: 700, feetY: FLOOR - 0.3 * H, phase }], 2);
      const scene = finishAnimation(a, "keepGoing", { stageWidth: 1920, fps });
      checkHop(phase, scene, fps, 700, false);
    }
  }
});

test("finishAnimation: a pose drawn FLOATING above the known floor comes down (no levitating), whatever its phase", () => {
  for (const fps of [8, 12, 24]) {
    const a = read([{ pose: STAND, x: 700, feetY: FLOOR, phase: "standing" }, { pose: STAND, x: 700, feetY: FLOOR - 0.4 * H, phase: "standing" }], 3);
    const scene = finishAnimation(a, "keepGoing", { stageWidth: 1920, fps });
    assert.match(scene.says, /air|float/i);
    checkHop("floating", scene, fps, 700, false);
    // The other choices also start from the floor they know: walking off never walks in the air.
    const walk = finishAnimation(a, "walkOff", { stageWidth: 1920, fps });
    assert.equal(walk.groundY, FLOOR);
    const frames = skeletons(walk, fps), late = frames.slice(Math.round(0.8 * fps));
    assert.ok(late.every((f) => Math.max(f.lFoot.y, f.rFoot.y) >= FLOOR - 0.02 * H), `@${fps}: walks in the air`);
  }
});

test("finishAnimation: a RUN keeps running off the page", () => {
  for (const fps of [8, 12, 24]) {
    const list: Drawn[] = [0, 1, 2, 3].map((k) => ({ pose: k % 2 ? STAND : STRIDE, x: 600 + k * 0.25 * H, feetY: FLOOR, phase: "running" }));
    const step = Math.max(1, Math.round(fps / 8));
    const scene = finishAnimation(read(list, step), "keepGoing", { stageWidth: 1920, fps });
    assert.match(scene.says, /running/i);
    const frames = skeletons(scene, fps);
    assert.ok(frames[frames.length - 1].hip.x > 1920, `@${fps}: does not leave the page (${frames[frames.length - 1].hip.x.toFixed(0)})`);
    assert.ok(frames.every((f) => Math.max(f.lFoot.y, f.rFoot.y) <= FLOOR + 0.01 * H), `@${fps}: below the floor`);
  }
});

const effectRead = (kind: ReadDrawing["kind"], box: ReadDrawing["box"], colors: string[]): ReadDrawing => ({ kind, box, groundY: box.y + box.h, colors, figure: null, reason: "test" });
function checkEffect(name: string, a: AnimationReadForFinish, fps: number) {
  const scene = finishAnimation(a, "keepGoing", { stageWidth: 1920, fps });
  assert.equal(scene.characters.length, 0, `${name}: made a stick figure`);
  assert.ok(scene.effects && scene.effects.length > 0 && scene.effectHeight! > 0, `${name}: no effect`);
  const frames = buildEffectFrames(scene as Parameters<typeof buildEffectFrames>[0], buildScene(scene, fps));
  assert.ok(frames.length >= 2, `${name}: too short`);
  const count = (i: number) => frames[i].back.length + frames[i].front.length + (frames[i].top?.length ?? 0);
  assert.ok(count(0) > 0, `${name} @${fps}: the first picture is empty (it must start at the stage the drawing shows)`);
  return { scene, frames, count };
}

test("finishAnimation: LIGHTNING frames finish as lightning (the strike completes and fades) — no stick figure", () => {
  for (const fps of [8, 12, 24]) {
    const box = { x: 900, y: 200, w: 160, h: 520 };
    const a: AnimationReadForFinish = { floor: FLOOR, height: H, figures: [], missed: [0, 2], effects: [{ frame: 0, read: effectRead("lightning", box, ["#facc15"]) }, { frame: 2, read: effectRead("lightning", box, ["#facc15"]) }], phases: [] };
    const { scene, frames, count } = checkEffect("lightning", a, fps);
    assert.match(scene.says, /lightning/i);
    assert.ok(count(frames.length - 1) <= count(0), `@${fps}: it does not fade`);
  }
});

test("finishAnimation: EXPLOSION frames finish as an explosion, where and about as big as drawn", () => {
  for (const fps of [8, 12, 24]) {
    const small = { x: 820, y: 560, w: 200, h: 260 }, big = { x: 760, y: 440, w: 320, h: 380 };
    const a: AnimationReadForFinish = { floor: FLOOR, height: H, figures: [], missed: [], effects: [{ frame: 0, read: effectRead("explosion", small, ["#ef4444", "#f97316"]) }, { frame: 3, read: effectRead("explosion", big, ["#ef4444", "#f97316"]) }], phases: [] };
    const { scene } = checkEffect("explosion", a, fps);
    assert.match(scene.says, /explosion/i);
    const anchor = scene.effects![0].anchor as Point;
    assert.ok(Math.abs(anchor.x - (big.x + big.w / 2)) < 0.25 * big.w, `@${fps}: not where it was drawn (${anchor.x})`);
  }
  // Drawn at its full size (not growing): it starts at its biggest moment and only breaks up from there.
  const box = { x: 760, y: 440, w: 320, h: 380 };
  const one: AnimationReadForFinish = { floor: FLOOR, height: H, figures: [], missed: [], effects: [{ frame: 0, read: effectRead("explosion", box, ["#ef4444"]) }], phases: [] };
  const s = finishAnimation(one, "keepGoing", { stageWidth: 1920, fps: 12 });
  assert.ok(s.effects![0].start < 0, "it replays the early growth instead of starting where the drawing is");
});

test("finishAnimation: a FIGURE with effect lines in its last drawing is finished, and it says so", () => {
  const a = read([{ pose: STAND, x: 700, feetY: FLOOR, phase: "standing" }, { pose: STAND, x: 700, feetY: FLOOR, phase: "standing" }], 2);
  const withFire = { ...a, effects: [{ frame: 2, read: effectRead("fire", { x: 650, y: 600, w: 100, h: 200 }, ["#f97316"]) }] };
  const s = finishAnimation(withFire, "keepGoing", { stageWidth: 1920, fps: 12 });
  assert.equal(s.characters.length, 1);
  assert.match(s.says, /fire/i);
});

// Arthur (round 3): "It seems like he's hopping BACKWARDS." A hop drifts only the way the drawings were already going.
const drawnOnFeet = (pose: PoseAngles, facing: Facing, feetX: number, feetY: number) => {
  const j = drawn(pose, facing, 0, feetY), dx = feetX - (j.lFoot.x + j.rFoot.x) / 2;
  return Object.fromEntries(Object.entries(j).map(([k, p]) => [k, { x: p.x + dx, y: p.y }])) as Record<JointPick, Point>;
};
test("finishAnimation: a hop drifts only the way the drawn body was ALREADY going — straight up stays put, never backwards", () => {
  for (const fps of [8, 12, 24]) {
    for (const [name, dx, facing] of [["straight up", 0, "right"], ["forward", 0.12 * H, "right"], ["straight up facing left", 0, "left"], ["forward facing left", -0.12 * H, "left"], ["drawn going backwards", -0.12 * H, "right"]] as const) {
      const poses: [PoseAngles, FinishPhase][] = [[STAND, "standing"], [CROUCH, "anticipation"], [TAKE_OFF, "takeoff"]];
      // (The feet stand where they are drawn; the crouch's lean moves the HIPS — that is not travelling.)
      const figures = poses.map(([pose], i) => ({ frame: i * 2, fig: readDrawnFigure(drawnOnFeet(pose, facing, 800 + i * dx, FLOOR), LOOK, { height: H, facing }) }));
      const a: AnimationReadForFinish = { floor: FLOOR, height: H, figures, missed: [], effects: [], phases: poses.map(([, phase], i) => ({ frame: i * 2, phase })) };
      const eyes = { ...a, travel: { dir: Math.sign(dx) as -1 | 0 | 1, speed: Math.abs(dx) / (2 / fps) / H } };
      for (const [how, read] of [["last pose", a], ["crouch", { ...a, figures: figures.slice(0, 2), phases: a.phases.slice(0, 2) }], ["the eyes' travel", eyes]] as const) {
        const frames = skeletons(finishAnimation(read, "keepGoing", { stageWidth: 1920, fps }), fps);
        const x0 = frames[0].hip.x, xs = frames.map((f) => f.hip.x);
        const label = `${name} (${how}) @${fps}`;
        if (dx === 0 || how === "crouch" && Math.abs(dx) * 1 < 0.1 * H) {
          if (dx === 0) assert.ok(xs.every((x) => Math.abs(x - x0) <= 0.12 * H), `${label}: drifts (${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)} from ${x0.toFixed(0)})`);
          continue;
        }
        // Moving: it never goes the other way (the hips never come back more than a hair), and ends further along.
        // (After a crouch the hips first straighten up over the planted feet — 0.12 s — then the hop drifts.)
        const s = Math.sign(dx), from = how === "crouch" ? Math.ceil(0.12 * fps) : 0;
        let best = xs[from];
        for (const x of xs.slice(from)) { assert.ok(s * (x - best) >= -0.03 * H, `${label}: drifts the other way (${xs.map((v) => v.toFixed(0)).join(",")})`); best = s > 0 ? Math.max(best, x) : Math.min(best, x); }
        assert.ok(s * (xs[xs.length - 1] - x0) > 0.05 * H, `${label}: does not carry on the way it was going`);
      }
    }
  }
});

