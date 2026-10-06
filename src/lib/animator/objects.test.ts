import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type FrameObject, type Scene, type SceneCharacter, type SceneObject } from "./engine.ts";
import { bounce, concatKeys, flightTime, GRAVITY, growShrink, slide, spin } from "./objectMoves.ts";
import { ballLook, boxLook, GRIP, objectHalfExtents } from "./objects.ts";
import { drawFrame } from "./render.ts";
import { DEFAULT_STYLE, STAND, withPose } from "./rig.ts";
import { animationBounds, centerAnimation, STAGE_CENTER_X, STAGE_HEIGHT } from "./stageFit.ts";
import { ENGINE_TEST_SCENES } from "./testScenes.ts";

// SPEC-0017 objects: a ball held, thrown and caught by stick figures, and object moves (slide, bounce,
// spin, grow/shrink). Self-contained: simple STAND-based figures, no moves library.

const GROUND = 900;
const BOTH: ("lFoot" | "rFoot")[] = ["lFoot", "rFoot"];
const ARMS = withPose(STAND, { lShoulder: 75, rShoulder: 85, lElbow: 20, rElbow: 15 });
const figure = (id: string, facing: "left" | "right", x: number, sway: number): SceneCharacter => ({
  id, name: id, facing, height: 300, style: DEFAULT_STYLE,
  keys: [
    { t: 0, x, pose: ARMS, contacts: BOTH },
    { t: 0.9, x: x + sway, pose: withPose(ARMS, { lShoulder: 105, rShoulder: 112, lElbow: 8, rElbow: 6, lean: 8 }), contacts: BOTH },
    { t: 1.8, x, pose: withPose(ARMS, { lShoulder: 60, rShoulder: 70 }), contacts: BOTH },
    { t: 2.5, x, pose: ARMS, contacts: BOTH },
  ],
});
const BALL = ballLook("basketball");
const passScene = (joint: "hands" | "rHand", apex = 120): Scene => ({
  id: "pass", title: "Pass", durationSec: 2.5, groundY: GROUND,
  characters: [figure("a", "right", 700, 25), figure("b", "left", 1200, -15)],
  objects: [{
    id: "ball", name: "Ball", look: BALL, keys: [],
    segments: [
      { from: 0, to: 1.0, mode: "held", character: "a", joint },
      { from: 1.0, to: 1.6, mode: "flight", apex, spin: 1 },
      { from: 1.6, to: 2.5, mode: "held", character: "b", joint },
    ],
  }],
});
const ballOf = (frame: FrameObject[]) => frame.find((o) => o.id === "ball")!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

for (const fps of [12, 24]) {
  test(`held in one hand, the ball follows the hand exactly (@${fps}fps)`, () => {
    const built = buildScene(passScene("rHand"), fps);
    const reach = (BALL.size / 2) * GRIP;
    for (let i = 0; i <= Math.round(1.0 * fps); i += 1) {
      const s = built.frames[i].find((c) => c.id === "a")!.skeleton;
      const along = { x: s.rHand.x - s.rElbow.x, y: s.rHand.y - s.rElbow.y }, length = Math.hypot(along.x, along.y);
      const expected = { x: s.rHand.x + (along.x / length) * reach, y: s.rHand.y + (along.y / length) * reach };
      assert.ok(dist(ballOf(built.objects[i]), expected) < 1e-9, `frame ${i}`);
    }
  });

  test(`held in both hands, the ball sits between them; thrown, it flies a true arc from hands to hands (@${fps}fps)`, () => {
    const built = buildScene(passScene("hands"), fps);
    const f0 = Math.round(1.0 * fps), f1 = Math.round(1.6 * fps);
    const balls = built.objects.map(ballOf);
    const reach = (BALL.size / 2) * GRIP;
    // Between the hands, both hands the same distance away and touching it.
    for (const [from, to, id] of [[0, f0, "a"], [f1, built.frames.length - 1, "b"]] as const) {
      for (let i = from; i <= to; i += 1) {
        const s = built.frames[i].find((c) => c.id === id)!.skeleton, ball = balls[i];
        assert.ok(Math.abs(dist(ball, s.lHand) - dist(ball, s.rHand)) < 1e-6, `frame ${i}: centered between the hands`);
        assert.ok(dist(ball, s.lHand) <= Math.max(reach, dist(s.lHand, s.rHand) / 2) + 1e-6, `frame ${i}: in the hands`);
      }
    }
    // The flight is a parabola: x moves evenly, y has constant downward acceleration (frame steps are even here).
    const step = 1 / fps;
    const ys = balls.slice(f0, f1 + 1).map((b) => b.y), xs = balls.slice(f0, f1 + 1).map((b) => b.x);
    const accel = (ys[2] - 2 * ys[1] + ys[0]) / (step * step);
    assert.ok(accel > 0, "gravity pulls it down");
    for (let i = 1; i < ys.length - 1; i += 1) {
      assert.ok(Math.abs((ys[i + 1] - 2 * ys[i] + ys[i - 1]) / (step * step) - accel) < 1e-6, `constant gravity at ${i}`);
      assert.ok(Math.abs(xs[i + 1] - 2 * xs[i] + xs[i - 1]) < 1e-9, `even sideways speed at ${i}`);
    }
    // Rises 120 px above the higher hand.
    assert.ok(Math.abs(Math.min(...ys) - (Math.min(ys[0], ys[ys.length - 1]) - 120)) < 0.6 * accel * step * step + 1e-6);
    // No jumps: leaving and arriving, the ball moves no more than the arc's own speed (plus the hands' motion).
    const steps = balls.slice(1).map((b, i) => dist(b, balls[i]));
    const flightMax = Math.max(...steps.slice(f0, f1));
    assert.ok(Math.max(...steps) <= flightMax + 1e-9, "fastest step is inside the flight");
    for (const i of [f0 - 1, f1]) assert.ok(steps[i] < flightMax, `hand-off step ${i}`);
    // Spins one extra turn in the air.
    assert.ok(Math.abs(balls[f1].rotation - balls[f0].rotation - 360) < 1e-9);
  });
}

test("objects never go below the ground", () => {
  const scene: Scene = {
    id: "dig", title: "Dig", durationSec: 1, groundY: GROUND, characters: [],
    objects: [
      { id: "ball", name: "Ball", look: BALL, keys: [{ t: 0, x: 900, y: 600 }, { t: 1, x: 900, y: GROUND + 200, scaleX: 1.3, scaleY: 0.7 }] },
      { id: "box", name: "Box", look: boxLook(), keys: [{ t: 0, x: 1100, y: 600 }, { t: 1, x: 1100, y: GROUND + 200, rotation: 45 }] },
    ],
  };
  for (const frame of buildScene(scene, 24).objects) for (const o of frame) {
    assert.ok(o.y + objectHalfExtents(o.look, o.rotation, o.scaleX, o.scaleY).halfH <= GROUND + 1e-9, `${o.id} at ${o.y}`);
  }
  const last = buildScene(scene, 24).objects.at(-1)!;
  assert.ok(Math.abs(last[1].y - (GROUND - (70 / 2) * Math.SQRT2)) < 1e-9, "a tilted box rests on its corner");
});

test("a bounce: lower each time, gravity timing, squash at every landing, comes to rest", () => {
  for (const fps of [12, 24]) for (const dx of [0, 300]) {
    const size = 48, height = 400;
    const motion = bounce({ x: 700 }, { height, bounces: 4, groundY: GROUND, size, dx, fps });
    assert.equal(motion.arcs.length, 4);
    assert.equal(motion.contacts.length, 5);
    for (let i = 1; i < motion.arcs.length; i += 1) assert.ok(Math.abs(motion.arcs[i].height / motion.arcs[i - 1].height - 0.6) < 1e-9, "each bounce 60% as high");
    for (const arc of motion.arcs) {
      assert.ok(Math.abs((arc.end - arc.start) - 2 * Math.sqrt((2 * arc.height) / GRAVITY)) < 1e-9, "time ∝ √height");
      assert.ok(Math.abs(arc.apex - (arc.start + arc.end) / 2) < 1e-9);
    }
    const scene: Scene = { id: "b", title: "Bounce", durationSec: motion.end + 0.2, groundY: GROUND, characters: [], objects: [{ id: "ball", name: "Ball", look: ballLook("ball", { size }), keys: motion.keys }] };
    const balls = buildScene(scene, fps).objects.map(ballOf);
    for (const b of balls) assert.ok(b.y + (size / 2) * b.scaleY <= GROUND + 1e-9, "on or above the ground");
    // The real top of each arc is reached (within a frame's worth of motion near the top).
    const first = motion.arcs[0];
    const top = Math.min(...balls.filter((_, i) => i / fps > first.start && i / fps < first.end).map((b) => b.y));
    assert.ok(Math.abs(top - (GROUND - size / 2 - first.height)) < 0.5 * GRAVITY / (fps * fps) + 1, `top ${top}`);
    for (const contact of motion.contacts) {
      const near = balls.filter((_, i) => i / fps >= contact - 1e-9 && i / fps <= contact + 0.1);
      assert.ok(near.some((b) => b.scaleY < 0.95 && b.scaleX > 1.03), `squash shows at ${contact.toFixed(2)}s @${fps}fps`);
    }
    const rest = balls.at(-1)!;
    assert.ok(Math.abs(rest.scaleX - 1) < 1e-9 && Math.abs(rest.scaleY - 1) < 1e-9 && Math.abs(rest.y - (GROUND - size / 2)) < 1e-9, "round and resting");
    assert.ok(Math.abs(rest.x - (700 + dx)) < 1e-6, "travels exactly dx");
    if (dx) assert.ok(rest.rotation > 300, "rolls as it travels");
  }
  // Tossed up from the ground: squashes first (anticipation), then goes up.
  const toss = bounce({ x: 700 }, { height: 200, bounces: 2, groundY: GROUND, size: 48, startY: GROUND - 24 });
  assert.ok((toss.keys[1].scaleY ?? 1) < 1 && toss.keys[1].t < toss.arcs[0].start);
});

test("slide, spin and grow/shrink speed up and slow down smoothly", () => {
  const speeds = (scene: Scene, pick: (o: FrameObject) => number) => {
    const values = buildScene(scene, 24).objects.map((frame) => pick(frame[0]));
    return values.slice(1).map((v, i) => Math.abs(v - values[i]));
  };
  const one = (keys: SceneObject["keys"], durationSec: number): Scene => ({ id: "o", title: "o", durationSec, groundY: GROUND, characters: [], objects: [{ id: "o", name: "o", look: boxLook(), keys }] });
  const glide = speeds(one(slide({ x: 600, y: 500 }, { x: 1300, y: 500 }, 1.5).keys, 1.5), (o) => o.x);
  const peak = Math.max(...glide);
  assert.ok(glide[0] < peak * 0.1 && glide.at(-1)! < peak * 0.1, "starts and stops gently");
  const curved = slide({ x: 600, y: 500 }, { x: 1300, y: 500 }, 1.5, { via: [{ x: 950, y: 300 }] });
  assert.equal(curved.keys.length, 3);
  const turn = speeds(one(spin({ x: 960, y: 500 }, 2, 1.5).keys, 1.5), (o) => o.rotation);
  assert.ok(turn[0] < Math.max(...turn) * 0.2 && turn.at(-1)! < Math.max(...turn) * 0.2);
  const grown = buildScene(one(growShrink({ x: 960, y: 500 }, 0.5, 1.5, 1).keys, 1), 24).objects.map((f) => f[0].scaleX);
  assert.ok(Math.max(...grown) > 1.55 && Math.abs(grown.at(-1)! - 1.5) < 1e-9, "pops past, then settles");
  const joined = concatKeys(slide({ x: 0, y: 0 }, { x: 10, y: 0 }, 1).keys, spin({ x: 10, y: 0 }, 1, 1, { t0: 1 }).keys);
  assert.ok(joined.every((k, i) => i === 0 || k.t > joined[i - 1].t));
  assert.ok(Math.abs(flightTime(500, 500, 100) - 2 * Math.sqrt(200 / GRAVITY)) < 1e-12);
});

test("the whole animation, ball included, is centered on the page and must fit", () => {
  const built = buildScene(passScene("hands", 300), 24);
  const figuresOnly = animationBounds(built.frames), all = animationBounds(built.frames, built.objects);
  assert.ok(all.top < figuresOnly.top - 100, "the high throw counts");
  const { fits, bounds, shift, objects, frames } = centerAnimation(built.frames, STAGE_HEIGHT * 16 / 9, built.objects);
  assert.ok(fits);
  assert.ok(Math.abs((bounds.left + bounds.right) / 2 - STAGE_CENTER_X) < 1e-6 && Math.abs((bounds.top + bounds.bottom) / 2 - STAGE_HEIGHT / 2) < 1e-6);
  assert.ok(Math.abs(objects![30][0].x - built.objects[30][0].x - shift.x) < 1e-9 && Math.abs(objects![30][0].y - built.objects[30][0].y - shift.y) < 1e-9);
  assert.ok(Math.abs(frames[30][0].skeleton.hip.y - built.frames[30][0].skeleton.hip.y - shift.y) < 1e-9, "figures and ball slide together");
  // Too high a throw does not fit (the scene must be made smaller, never cut off).
  const tooHigh = buildScene(passScene("hands", 900), 24);
  assert.equal(centerAnimation(tooHigh.frames, STAGE_HEIGHT * 16 / 9, tooHigh.objects).fits, false);
});

test("objects are drawn into the frame pictures, on top of the figures, and only real holds are held", async () => {
  // Node has no canvas: a recording stand-in.
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, name: string) => name in target ? target[name] : (...args: number[]) => {
      calls.push(`${name}(${args.map((a) => Math.round(a)).join(",")})`);
      return name === "getImageData" ? { data: new Uint8ClampedArray(args[2] * args[3] * 4) } : undefined;
    },
    set: (target, name: string, value) => { target[name] = value; return true; },
  });
  class TestImageData {
    width: number; height: number; data: Uint8ClampedArray;
    constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
  }
  const g = globalThis as unknown as Record<string, unknown>;
  g.ImageData = TestImageData;
  g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return ctx; } };
  const { frameStageBox, rasterizeFrames } = await import("./toFrames.ts");

  const built = buildScene(passScene("hands"), 12);
  const map = { scale: 1, offsetX: 0, offsetY: 0 };
  // The picture's box includes the ball.
  const mid = Math.round(1.3 * 12);
  const box = frameStageBox(built.frames[mid], built.objects[mid]), figuresBox = frameStageBox(built.frames[mid]);
  assert.ok(box.top < figuresBox.top, "the ball in the air is inside the picture");
  // The ball is drawn last (in front of the hands).
  calls.length = 0;
  drawFrame(ctx as unknown as CanvasRenderingContext2D, built.frames[0], map, built.objects[0]);
  const ballArc = calls.findIndex((c) => c.startsWith(`arc(0,0,${BALL.size / 2},`));
  const headArcs = calls.map((c, i) => [c, i] as const).filter(([c]) => /^arc\(\d+,\d+,21,/.test(c) && !c.startsWith("arc(0,0,"));
  assert.equal(headArcs.length, 2, "two heads");
  assert.ok(ballArc > Math.max(...headArcs.map(([, i]) => i)), "ball after the figures");
  assert.ok(calls.filter((c) => c.startsWith("arc(")).length >= 5, "ball plus basketball seams");

  // Still figures + a moving ball: no holds. Still figures + still ball: holds.
  const still: Scene = {
    id: "still", title: "Still", durationSec: 1, groundY: GROUND,
    characters: [{ id: "a", name: "a", facing: "right", height: 300, style: DEFAULT_STYLE, keys: [{ t: 0, x: 700, pose: STAND, contacts: BOTH }] }],
    objects: [{ id: "ball", name: "Ball", look: BALL, keys: slide({ x: 900, y: 800 }, { x: 1200, y: 800 }, 0.5).keys }],
  };
  const stillBuilt = buildScene(still, 12);
  const raster = rasterizeFrames(stillBuilt.frames, 1920, 1080, map, stillBuilt.objects);
  const moving = Math.round(0.5 * 12);
  assert.ok(raster.slice(0, moving + 1).every((r) => !r.hold), "the ball moves: every frame is drawn");
  assert.ok(raster.slice(moving + 1).every((r) => r.hold), "nothing moves: held");
  // Without objects, the same figures are all holds (old behaviour unchanged).
  assert.ok(rasterizeFrames(stillBuilt.frames, 1920, 1080, map).slice(2).every((r) => r.hold));
});

test("adding objects does not change the figures at all", () => {
  for (const scene of ENGINE_TEST_SCENES) for (const fps of [12, 24]) {
    const plain = buildScene(scene, fps);
    const withBall = buildScene({ ...scene, objects: passScene("hands").objects!.map((o) => ({ ...o, segments: [{ from: 0, to: scene.durationSec, mode: "held" as const, character: scene.characters[0].id, joint: "rHand" as const }] })) }, fps);
    assert.deepEqual(withBall.frames, plain.frames);
    assert.deepEqual(withBall.report, plain.report);
    assert.ok(plain.objects.every((frame) => frame.length === 0));
    assert.ok(withBall.objects.every((frame) => frame.length === 1));
  }
});
