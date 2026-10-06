import assert from "node:assert/strict";
import { test } from "node:test";
import { hasCamera, moveShape, SHAKE, type CameraScene } from "../camera.ts";
import { BACKGROUND_PIECES, buildEffectFrames, type EffectScene } from "../effects/index.ts";
import type { Shape } from "../effects/types.ts";
import { buildScene, momentTimes, type FrameCharacter, type Scene, type SceneFrames } from "../engine.ts";
import { JOINTS } from "../rig.ts";
import { centerAnimation, lostOffPage, STAGE_CENTER_X, STAGE_HEIGHT } from "../stageFit.ts";
import { cameraPlanToScene, CUT_AFTER, isCameraPlan, runOffCutArrivePlan, type CameraPlan } from "./camera.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { COMBO_TESTS, makeTestScene, SINGLE_MOVE_TESTS } from "./tests.ts";
import { effectsTestScenes, makeEffectsTestScene } from "./tests2c.ts";

// THE CAMERA (SPEC-0017 Phase 2C extras): film cuts between shots and screen shake on big impacts.

// Node has no canvas: a stand-in (as effectsFrames.test.ts), for the background layer's pictures.
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (target, name: string) => name in target ? target[name] : (...args: number[]) => {
    if (name === "createLinearGradient") return { addColorStop: () => undefined };
    return name === "getImageData" ? { data: new Uint8ClampedArray(args[2] * args[3] * 4) } : undefined;
  },
  set: (target, name: string, value) => { target[name] = value; return true; },
});
const g = globalThis as unknown as Record<string, unknown>;
g.ImageData ??= class { width: number; height: number; data: Uint8ClampedArray; constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
g.OffscreenCanvas ??= class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return ctx; } };
const { rasterizeShapeFrames, sceneEffectLayers } = await import("../toFrames.ts");
const { cameraMovingBackground } = await import("../cameraLayers.ts");

const FPS = [8, 12, 24];
const edges = (sw: number) => ({ left: STAGE_CENTER_X - sw / 2, right: STAGE_CENTER_X + sw / 2 });
const pad = (c: FrameCharacter) => c.headRadius + c.style.thickness;
// Some of the figure shows on the page / all of it does.
const seen = (c: FrameCharacter, sw: number) => JOINTS.some((n) => { const p = c.skeleton[n]; return p.x >= edges(sw).left && p.x <= edges(sw).right && p.y >= 0 && p.y <= STAGE_HEIGHT; });
const fullyIn = (c: FrameCharacter, sw: number) => JOINTS.every((n) => { const p = c.skeleton[n]; return p.x - pad(c) >= edges(sw).left && p.x + pad(c) <= edges(sw).right; });

const cache = new Map<string, { scene: CameraScene & { stageWidth: number }; b: SceneFrames; c: ReturnType<typeof centerAnimation>; fx: ReturnType<typeof buildEffectFrames> }>();
function made(plan: () => CameraPlan, name: string, sw: number, fps: number) {
  const key = `${name}/${sw}/${fps}`;
  if (!cache.has(key)) {
    const scene = cameraPlanToScene(plan(), LIBRARY, sw);
    const b = buildScene(scene, fps);
    cache.set(key, { scene, b, c: centerAnimation(b.frames, sw, b.objects), fx: buildEffectFrames(scene, b) });
  }
  return cache.get(key)!;
}
const runOff = (sw: number, fps: number) => made(runOffCutArrivePlan, "runOff", sw, fps);
// A copy of the test plan with its shot 2 changed.
const withShot2 = (change: (shot: NonNullable<CameraPlan["cuts"]>[number]) => object): CameraPlan => {
  const plan = runOffCutArrivePlan();
  return { ...plan, cuts: plan.cuts!.map((shot, i) => (i === 0 ? { ...shot, ...change(shot) } : shot)) };
};

test("a multi-shot plan builds: two shots joined by one cut, a sound body, the same look in both", () => {
  const plan = runOffCutArrivePlan();
  assert.ok(isCameraPlan(plan));
  for (const sw of [1920, 1440]) for (const fps of FPS) {
    const { scene, b } = runOff(sw, fps);
    assert.equal(scene.shots?.length, 2);
    assert.ok(hasCamera(scene));
    assert.ok(b.report.ok, `${sw}/${fps}: body rules`);
    assert.equal(b.camera?.cuts.length, 1);
    assert.equal(b.frames.length, b.camera!.shots[1].to);
    assert.ok(b.frames.every((list) => list.length === 1 && list[0].id === "a"), "the runner is in every picture");
    const first = b.frames[0][0], last = b.frames[b.frames.length - 1][0];
    assert.deepEqual(last.style, first.style, "same look after the cut");
    assert.equal(last.headRadius, first.headRadius, "same size after the cut");
  }
});

test("the cut lands on the right picture at 8, 12 and 24 fps (the runner is past the right edge, then past the left)", () => {
  for (const sw of [1920, 1440]) for (const fps of FPS) {
    const { scene, b, c } = runOff(sw, fps);
    const cut = b.camera!.cuts[0];
    assert.equal(cut, Math.round(scene.shots![1].start * fps), `${sw}/${fps}`);
    const before = c.frames[cut - 1][0], after = c.frames[cut][0];
    assert.ok(JOINTS.every((n) => before.skeleton[n].x - pad(before) > edges(sw).right), `${sw}/${fps}: gone off the right edge before the cut`);
    assert.ok(JOINTS.every((n) => after.skeleton[n].x + pad(after) < edges(sw).left), `${sw}/${fps}: off the left edge at the cut, about to run in`);
  }
});

test("the runner leaves the page only before the cut (on purpose, about a second before it), then runs in and stays", () => {
  for (const sw of [1920, 1440]) for (const fps of FPS) {
    const { b, c } = runOff(sw, fps);
    const cut = b.camera!.cuts[0], at = (i: number) => c.frames[i][0];
    assert.ok(fullyIn(at(0), sw), "starts on the page");
    let lastSeen = 0;
    for (let i = 0; i < cut; i += 1) if (seen(at(i), sw)) lastSeen = i;
    for (let i = 0; i <= lastSeen; i += 1) assert.ok(seen(at(i), sw), `${sw}/${fps}: never off and back in shot 1 (picture ${i})`);
    const gap = (cut - 1 - lastSeen) / fps;
    assert.ok(gap > CUT_AFTER - 0.25 && gap < CUT_AFTER + 0.25, `${sw}/${fps}: about a second of the empty place before the cut (${gap.toFixed(2)} s)`);
    let arrives = -1;
    for (let i = cut; i < c.frames.length; i += 1) if (seen(at(i), sw)) { arrives = i; break; }
    assert.ok(arrives > cut && (arrives - cut) / fps < 1.2, `${sw}/${fps}: runs in soon after the cut`);
    for (let i = arrives; i < c.frames.length; i += 1) assert.ok(seen(at(i), sw), `${sw}/${fps}: stays on the page after arriving (picture ${i})`);
    assert.ok(fullyIn(at(c.frames.length - 1), sw), "stops on the page");
    // Off the page only on purpose: every picture where it is not all on the page is marked (the page fit ignores it).
    c.frames.forEach((list, i) => { if (!fullyIn(list[0], sw)) assert.ok(list[0].offPage, `${sw}/${fps}: picture ${i} off the page but not marked`); });
    assert.ok(c.fits, `${sw}/${fps}: everything else fits the page`);
  }
});

test("lostOffPage: on purpose with a cut passes; just gone still fails", () => {
  for (const fps of [8, 12]) {
    const { b, c } = runOff(1920, fps);
    assert.deepEqual(lostOffPage(c.frames, 1920, b.camera!.cuts), [], "left on purpose, then a cut to it arriving");
    assert.deepEqual(lostOffPage(c.frames, 1920), [], "(and without telling it about the cut)");
  }
  // The next shot doesn't show it: just gone.
  const elsewhere = made(() => withShot2(() => ({ shake: [], characters: [{ id: "b", name: "Friend", x: 960, facing: "left", actions: [{ move: "stand", params: { seconds: 2 } }] }] })), "elsewhere", 1920, 12);
  assert.deepEqual(lostOffPage(elsewhere.c.frames, 1920, elsewhere.b.camera!.cuts).map((l) => l.id), ["a"]);
  // Leaving in the last shot (no cut after it): just gone.
  const lastShot = made(() => withShot2((shot) => ({ characters: shot.characters.map((ch) => ({ ...ch, leave: "right" as const })) })), "lastShot", 1920, 12);
  assert.deepEqual(lostOffPage(lastShot.c.frames, 1920, lastShot.b.camera!.cuts).map((l) => l.id), ["a"]);
  // An accident in an ordinary scene (a run far past the edge): still caught, with or without the cut list.
  const plain: ScenePlan = { id: "off", title: "off", height: 200, groundY: 900, characters: [{ id: "a", x: 960, facing: "right", actions: [{ move: "run", params: { distance: 2000 } }] }] };
  const frames = buildScene(planToScene(plain, LIBRARY), 12).frames;
  assert.deepEqual(lostOffPage(frames, 1920).map((l) => l.id), ["a"]);
  assert.deepEqual(lostOffPage(frames, 1920, []).map((l) => l.id), ["a"]);
});

test("each shot's background is on exactly its own pictures: it changes right on the cut", () => {
  for (const fps of FPS) {
    const { scene, b, fx } = runOff(1920, fps);
    const cut = b.camera!.cuts[0];
    assert.notDeepEqual(fx[cut].background, fx[cut - 1].background);
    scene.shots!.forEach((shot, k) => {
      const { from, to } = b.camera!.shots[k];
      const own = { ...shot.scene, durationSec: Math.max(shot.scene.durationSec, (to - from - 1) / fps) };
      const alone = buildEffectFrames(own, buildScene(own, fps));
      for (let i = from; i < to; i += 1) {
        const d = b.camera!.shake?.[i] ?? { x: 0, y: 0 };
        const want = alone[Math.min(i - from, alone.length - 1)].background;
        assert.deepEqual(fx[i].background, d.x === 0 && d.y === 0 ? want : want.map((s) => moveShape(s, d)), `${fps} fps: picture ${i} draws shot ${k + 1}'s background`);
      }
    });
    // The app's background layer: the cut (and a shake) is drawn even when the memory guard holds pictures.
    const map = { scale: 1, offsetX: 0, offsetY: 0 };
    const pictures = rasterizeShapeFrames(fx.map((f) => f.background), 1920, 1080, map, { maxBytes: 1, mustDraw: b.camera!.redraw });
    for (const i of b.camera!.redraw) assert.equal(pictures[i].hold, false, `${fps} fps: picture ${i} is redrawn`);
    assert.ok(b.camera!.redraw.includes(cut));
  }
});

test("screen shake: only where marked, strongest on the landing, fading to nothing, the same at 8/12/24 fps", () => {
  const firsts: unknown[] = [];
  for (const fps of FPS) {
    const { scene, b } = runOff(1920, fps);
    const shake = b.camera!.shake!;
    assert.ok(shake, "it shakes");
    const moved = shake.map((d, i) => (d.x !== 0 || d.y !== 0 ? i : -1)).filter((i) => i >= 0);
    // One short run of pictures, starting on the first picture at or after the landing.
    assert.deepEqual(moved, moved.map((_, k) => moved[0] + k), "one run of pictures");
    const shot = scene.shots![1], { from, to } = b.camera!.shots[1];
    const own = { ...shot.scene, durationSec: Math.max(shot.scene.durationSec, (to - from - 1) / fps) };
    const local = momentTimes(own, fps, buildScene(own, fps).frames.length);
    const land = shot.scene.marks!["a.jump1.land"], first = moved[0] - from;
    assert.ok(local[first] >= land - 1e-6 && (first === 0 || local[first - 1] < land - 1e-6), `${fps} fps: starts on the landing picture`);
    const seconds = local[moved[moved.length - 1] - from] - local[first];
    assert.ok(seconds < SHAKE.seconds && seconds >= SHAKE.seconds - 2 / fps, `${fps} fps: lasts about 0.3 s (${seconds.toFixed(3)})`);
    const size = (i: number) => Math.hypot(shake[i].x, shake[i].y);
    assert.ok(size(moved[0]) > 0.008 * STAGE_HEIGHT && size(moved[0]) <= SHAKE.maxStrength * STAGE_HEIGHT, "a few px, at most 1.5% of the page");
    assert.ok(size(moved[moved.length - 1]) < 0.3 * size(moved[0]), "fades fast");
    moved.forEach((i, k) => { if (k > 0) assert.ok(Math.sign(shake[i].y) !== Math.sign(shake[moved[k - 1]].y), "up, down, up..."); });
    assert.equal(shake[moved[moved.length - 1] + 1]?.y ?? 0, 0, "then still");
    firsts.push(shake[moved[0]]);
  }
  assert.deepEqual(firsts[1], firsts[0]);
  assert.deepEqual(firsts[2], firsts[0]);
});

test("screen shake moves the whole picture together (figures, effects, background) and never shows an empty edge", () => {
  const still = withShot2(() => ({ shake: [] }));
  for (const sw of [1920, 1440]) for (const fps of [8, 12]) {
    const { b, c, fx } = runOff(sw, fps);
    const calm = made(() => still, "calm", sw, fps);
    const shake = b.camera!.shake!;
    shake.forEach((d, i) => {
      const a = b.frames[i][0], q = calm.b.frames[i][0];
      for (const n of JOINTS) {
        assert.ok(Math.abs(a.skeleton[n].x - (q.skeleton[n].x + d.x)) < 1e-6 && Math.abs(a.skeleton[n].y - (q.skeleton[n].y + d.y)) < 1e-6, `${sw}/${fps}: figure moved with the picture (${i})`);
      }
      if (d.x !== 0 || d.y !== 0) assert.deepEqual(fx[i].background, calm.fx[i].background.map((s) => moveShape(s, d)), `${sw}/${fps}: background moved with it (${i})`);
      else assert.deepEqual(fx[i].background, calm.fx[i].background);
    });
    // The page as the app shows it (the story centered: c.shift): the sky and ground still cover every edge.
    const covers = (shapes: Shape[], x: number, y: number) => shapes.some((s) => s.kind === "rect" && s.fill && (s.alpha ?? 1) >= 1
      && x >= s.x + c.shift.x && x <= s.x + c.shift.x + s.w && y >= s.y + c.shift.y && y <= s.y + c.shift.y + s.h);
    const e = edges(sw);
    shake.forEach((d, i) => {
      if (d.x === 0 && d.y === 0) return;
      for (const [x, y] of [[e.left, 0], [e.right, 0], [e.left, STAGE_HEIGHT], [e.right, STAGE_HEIGHT], [STAGE_CENTER_X, 0], [STAGE_CENTER_X, STAGE_HEIGHT], [e.left, STAGE_HEIGHT / 2], [e.right, STAGE_HEIGHT / 2]]) {
        assert.ok(covers(fx[i].background, x, y), `${sw}/${fps}: picture ${i} shows no gap at (${x}, ${y})`);
      }
    });
  }
});

// Arthur (camera review): shot 1's hills stopped short of the right page edge. Every BAND piece (sky, ground, hills,
// grass) must reach past both page edges in every picture of every shot, as the app shows it (the story slid to the
// middle of the page: the centering shift) and while the picture shakes — on a wide, a square or a narrower page.
const BANDS = new Set(["sky", "ground", "hills", "grass"]);
const extentX = (shapes: Shape[]) => {
  let lo = Infinity, hi = -Infinity;
  for (const s of shapes) {
    if (s.kind === "rect") { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x + s.w); }
    else if (s.kind === "circle") { lo = Math.min(lo, s.x - s.r); hi = Math.max(hi, s.x + s.r); }
    else if (s.kind === "symbol") { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); }
    else for (let i = 0; i < s.points.length; i += 2) { lo = Math.min(lo, s.points[i]); hi = Math.max(hi, s.points[i]); }
  }
  return { lo, hi };
};
test("the background fills the page from edge to edge in every picture of every shot (centered, shaking, any page)", () => {
  for (const sw of [1920, 1440, 1080]) for (const fps of FPS) {
    const { scene, b, c } = runOff(sw, fps);
    const e = edges(sw);
    scene.shots!.forEach((shot, k) => {
      const own = shot.scene as EffectScene, { from, to } = b.camera!.shots[k];
      const stage = { width: own.stageWidth ?? 1920, groundY: own.groundY, height: own.characters[0]?.height ?? 300 };
      const bands = (own.background?.pieces ?? []).filter((piece) => BANDS.has(piece.kind));
      assert.ok(bands.length >= 2, "the shot has a sky and a ground");
      for (let i = from; i < to; i += 1) {
        const dx = (b.camera!.shake?.[i]?.x ?? 0) + c.shift.x;
        for (const piece of bands) {
          const { lo, hi } = extentX(BACKGROUND_PIECES[piece.kind].draw({ ...piece, params: { seed: own.background?.seed, ...piece.params } }, (i - from) / fps, stage));
          assert.ok(lo + dx <= e.left && hi + dx >= e.right, `${sw}/${fps} shot ${k + 1} picture ${i}: ${piece.kind} spans ${(lo + dx).toFixed(1)}..${(hi + dx).toFixed(1)}, the page ${e.left}..${e.right}`);
        }
      }
    });
  }
});

test("in the app, a moving background (the waterfall) gets its own smooth layers shot by shot; the still layer changes on the cut", () => {
  const r = (shape: Shape) => JSON.stringify(shape, (_k, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v));
  for (const sw of [1920, 1440]) for (const fps of FPS) {
    const { scene, b, c } = runOff(sw, fps);
    const layers = sceneEffectLayers(scene, b, c.shift), split = cameraMovingBackground(scene, b, c.shift);
    assert.ok(split && split.layers.length > 0, "the waterfall shot is split");
    const cut = b.camera!.cuts[0];
    layers.background!.forEach((list, i) => {
      const parts = [split!.still[i], ...split!.layers.map((layer) => layer.pictures[i])].flat();
      assert.deepEqual(parts.map(r).sort(), list.map(r).sort(), `${sw}/${fps}: picture ${i} has the same shapes, only in layers`);
      if (i < cut) assert.ok(split!.layers.every((layer) => layer.pictures[i].length === 0), "shot 1 (hills) has no moving layer");
    });
    assert.notDeepEqual(split!.still[cut], split!.still[cut - 1]);
    const after = split!.still.slice(cut).map((list, j) => (b.camera!.shake?.[cut + j]?.y ? "shaken" : JSON.stringify(list)));
    assert.equal(new Set(after.filter((k) => k !== "shaken")).size, 1, "shot 2's still part is one picture (held)");
  }
});

test("a shake in an ordinary one-shot plan: the same pictures, moved only on the impact", () => {
  const plan: CameraPlan = { id: "slam", title: "Big landing", height: 300, groundY: 900, characters: [{ id: "a", x: 900, facing: "right", actions: [{ move: "jump", params: { height: 0.6 } }] }], shake: [{ at: "a.jump1.land" }] };
  const { shake: _drop, ...plain } = plan;
  const scene = cameraPlanToScene(plan, LIBRARY, 1920), calm = makeEffectsTestScene(plain, 1920);
  assert.equal(scene.shots, undefined);
  for (const fps of FPS) {
    const b = buildScene(scene, fps), q = buildScene(calm, fps);
    assert.deepEqual(b.camera!.cuts, []);
    const moved = b.camera!.shake!.map((d, i) => (d.x !== 0 || d.y !== 0 ? i : -1)).filter((i) => i >= 0);
    assert.ok(moved.length >= 2 && moved.length <= Math.ceil(SHAKE.seconds * fps) + 1);
    b.frames.forEach((list, i) => { if (!moved.includes(i)) assert.deepEqual(list, q.frames[i], `${fps} fps: picture ${i} as before`); });
    assert.ok(Math.abs(b.frames[moved[0]][0].skeleton.hip.y - q.frames[moved[0]][0].skeleton.hip.y - b.camera!.shake![moved[0]].y) < 1e-9, "moved by the shake");
  }
});

test("plans without cuts or shake give exactly the same pictures as before", () => {
  const look = { style: "natural" as const, speed: "normal" as const, energy: 0.5, direction: 1 as const };
  // (The camera scene and the grenade and explosion-with-text scenes — a screen shake on the blast — use the camera on purpose; every other
  // effects scene must not.)
  const ON_PURPOSE = ["camera", "grenadeFar", "grenadeClose", "explosionText"];
  for (const entry of effectsTestScenes()) if (entry.plan && !ON_PURPOSE.includes(entry.id)) assert.ok(!isCameraPlan(entry.plan), entry.id);
  for (const id of ON_PURPOSE.slice(1)) assert.ok(isCameraPlan(effectsTestScenes().find((e) => e.id === id)!.plan!), `${id}: a screen shake on the blast`);
  for (const entry of [...SINGLE_MOVE_TESTS, ...COMBO_TESTS]) assert.ok(!isCameraPlan(entry.plan(look)), entry.id);
  const scenes: [string, Scene][] = [
    ["walkTurnWalk", makeTestScene("walkTurnWalk", look, 1920)],
    ["runGrabThrow", makeTestScene("runGrabThrow", look, 1920)],
    ["blockBlockHit", makeTestScene("blockBlockHit", look, 1920)],
    ...effectsTestScenes().filter((e) => e.plan && ["parkour", "lightningStrike", "sisterTest"].includes(e.id)).map((e) => [e.id, makeEffectsTestScene(e.plan!, 1920)] as [string, Scene]),
  ];
  assert.equal(scenes.length, 6);
  for (const [name, scene] of scenes) {
    assert.ok(!hasCamera(scene), name);
    for (const fps of FPS) {
      const plain = buildScene(scene, fps);
      assert.ok(!("camera" in plain), `${name}: built the ordinary way`);
      // Asking for "no shake" or "no shots" is the ordinary way too.
      assert.deepEqual(buildScene({ ...scene, shake: [], shots: [] } as CameraScene, fps), plain, `${name}@${fps}: empty camera = ordinary`);
      // One plain shot through the camera gives exactly the same pictures, effects and background.
      const one = buildScene({ ...scene, shots: [{ scene, start: 0 }] } as CameraScene, fps);
      assert.deepEqual(one.frames, plain.frames, `${name}@${fps}: same figures`);
      assert.deepEqual(one.objects, plain.objects, `${name}@${fps}: same objects`);
      assert.deepEqual(buildEffectFrames({ ...scene, shots: [{ scene, start: 0 }] } as CameraScene, one), buildEffectFrames(scene, plain), `${name}@${fps}: same effects and background`);
      assert.equal(one.camera!.shake, null);
      assert.deepEqual(one.camera!.cuts, []);
      assert.deepEqual(centerAnimation(one.frames, 1500, one.objects).shift, centerAnimation(plain.frames, 1500, plain.objects).shift, `${name}@${fps}: same page fit`);
    }
  }
});
