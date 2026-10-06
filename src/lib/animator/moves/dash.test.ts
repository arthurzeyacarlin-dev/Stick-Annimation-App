import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, keysAt, momentTimes, type Scene } from "../engine.ts";
import { centerAnimation } from "../stageFit.ts";
import type { Point, Skeleton } from "../rig.ts";
import { MAX_AIR } from "./dash.ts";
import { armPathProblems, assertNatural } from "./testkit.ts";
import { makeTestScene, type TestLook } from "./tests.ts";
import { MOVE_STYLES, type MoveStyle } from "./styles.ts";

// DASH PUNCH (round 10, Arthur's pictures 69-70; dash.ts): run, bend low, push off, a short low dash (in the
// air under half a second: never floating), the fist lands on the target the same moment the front foot
// touches down, then a little skid to a stop. SQUASH & STRETCH only from 20 pictures a second.

const look = (style: MoveStyle): TestLook => ({ style, speed: "normal", energy: 0.5, direction: 1 });
const scenes = new Map<string, Scene>();
const sceneFor = (style: MoveStyle) => {
  if (!scenes.has(style)) scenes.set(style, makeTestScene("dashPunch", look(style)));
  return scenes.get(style)!;
};
const skeletonOf = (frame: { id: string; skeleton: Skeleton }[], id: string) => frame.find((c) => c.id === id)!.skeleton;
const segmentGap = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
};
// How far the nearer fist is from the target's body (torso line or head circle), px.
const fistGap = (a: Skeleton, b: Skeleton, headR: number) => Math.min(...[a.lHand, a.rHand].map((h) => Math.min(segmentGap(h, b.hip, b.neck), Math.abs(Math.hypot(h.x - b.head.x, h.y - b.head.y) - headR))));

test("dash punch: the fist lands on the target as the front foot touches down, every mood", () => {
  for (const style of MOVE_STYLES) {
    const scene = sceneFor(style), name = style;
    const way = scene.characters.find((c) => c.id === "a")!.facing === "left" ? -1 : 1;
    const hit = scene.marks!["a.dashPunch1.hit"];
    assert.ok(hit !== undefined, `${name}: has a hit`);
    assert.ok(Math.abs(scene.marks!["b.getHit1.hit"] - hit) < 1e-6, `${name}: the other one reacts right on the hit`);
    // A picture exactly at the hit (a rate that puts one there; from 12 a second up pictures are evenly spaced).
    const fps = Math.round(hit * 24) / hit, built = buildScene(scene, fps), i = Math.round(hit * fps);
    assert.ok(Math.abs(momentTimes(scene, fps)[i] - hit) < 1e-6, `${name}: a picture at the hit`);
    const a = skeletonOf(built.frames[i], "a"), b = skeletonOf(built.frames[i], "b");
    const headR = 0.07 * 300;
    assert.ok(fistGap(a, b, headR) <= 12, `${name}: fist ${fistGap(a, b, headR).toFixed(1)}px from the target at the hit`);
    // The front foot (the one nearer the target) is on the floor at the hit; the other one is up.
    const front = way > 0 ? (a.lFoot.x > a.rFoot.x ? a.lFoot : a.rFoot) : (a.lFoot.x < a.rFoot.x ? a.lFoot : a.rFoot);
    const back = front === a.lFoot ? a.rFoot : a.lFoot;
    assert.ok(Math.abs(front.y - 900) <= 1, `${name}: front foot ${(900 - front.y).toFixed(1)}px off the floor at the hit`);
    assert.ok(900 - back.y > 5, `${name}: back foot still up at the hit`);
  }
});

test("dash punch: a real dash — airborne under half a second (never floating), faster than the run, then slows down", () => {
  for (const style of MOVE_STYLES) {
    const scene = sceneFor(style), name = style;
    const m = scene.marks!, push = m["a.dashPunch1.push"], hit = m["a.dashPunch1.hit"], stop = m["a.dashPunch1.stop"];
    const built = buildScene(scene, 24);
    const frames = built.frames.map((f) => skeletonOf(f, "a"));
    const lowest = (s: Skeleton) => Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y);
    // Both feet off the floor: one stretch, between the push and the hit, shorter than MAX_AIR (< 0.5 s).
    let air = 0, longest = 0;
    frames.forEach((s) => { air = 900 - lowest(s) > 1 ? air + 1 : 0; longest = Math.max(longest, air); });
    assert.ok(longest > 0, `${name}: it leaves the ground`);
    assert.ok(longest / 24 < 0.5 && hit - push <= MAX_AIR + 1e-6, `${name}: in the air ${(hit - push).toFixed(2)}s (${longest} pictures)`);
    // Speed: faster in the dash than the run before it (not a robot: one speed), slower after the hit.
    const hipAt = (t: number) => frames[Math.min(frames.length - 1, Math.round(t * 24))].hip.x;
    const speed = (t0: number, t1: number) => Math.abs(hipAt(t1) - hipAt(t0)) / (t1 - t0);
    const run = speed(push - 0.55, push - 0.25), dash = speed(push + 0.04, hit - 0.04), after = speed(hit, stop + 0.1);
    if (style !== "robot") assert.ok(dash > run, `${name}: dash ${dash.toFixed(0)} px/s faster than the run ${run.toFixed(0)}`);
    assert.ok(after < 0.7 * dash, `${name}: slows down after the hit (${after.toFixed(0)} vs ${dash.toFixed(0)} px/s)`);
    assert.ok(stop > hit, `${name}: a skid after the hit`);
    // Never through the target: hips stay a body's width apart.
    const b = built.frames.map((f) => skeletonOf(f, "b"));
    frames.forEach((s, i) => assert.ok(Math.abs(b[i].hip.x - s.hip.x) > 0.3 * 300, `${name}: on top of the target at ${(i / 24).toFixed(2)}s`));
  }
});

test("dash punch: body rules, arm paths and page fit in every mood", () => {
  for (const style of MOVE_STYLES) {
    const scene = sceneFor(style);
    assertNatural(scene, `dash ${style}`);
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      const arms = armPathProblems(built.frames, fps, (100 * 24) / fps);
      assert.deepEqual(arms, [], `dash ${style}@${fps}: ${arms.join("; ")}`);
    }
  }
  for (const width of [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9].map((k) => 1080 * k)) {
    const scene = makeTestScene("dashPunch", look("natural"), width);
    assert.ok(centerAnimation(buildScene(scene, 12).frames, width).fits, `dash: fits a ${width.toFixed(0)} px page`);
  }
});

test("squash & stretch: only from 20 pictures a second, one squashed and one stretched key, never at 12", () => {
  const scene = sceneFor("natural");
  const keys = scene.characters.find((c) => c.id === "a")!.keys;
  const extra = keys.filter((k) => k.minFps !== undefined);
  assert.equal(extra.length, 2, "two squash/stretch keys");
  assert.ok(extra.every((k) => k.minFps! >= 20), "only from 20 fps");
  assert.equal(keysAt(keys, 12).length, keys.length - 2, "left out at 12 fps");
  assert.equal(keysAt(keys, 8).length, keys.length - 2, "left out at 8 fps");
  assert.equal(keysAt(keys, 24).length, keys.length, "there at 24 fps");
  // A robot has no squash and stretch.
  assert.equal(sceneFor("robot").characters.find((c) => c.id === "a")!.keys.filter((k) => k.minFps !== undefined).length, 0, "robot: none");
  // At 12 fps the pictures are the same as without them; at 24 fps they change the push-off pictures only.
  const plain = { ...scene, characters: scene.characters.map((c) => ({ ...c, keys: c.keys.filter((k) => k.minFps === undefined) })) };
  const same = (x: Scene, y: Scene, fps: number) => buildScene(x, fps).frames.every((f, i) => JSON.stringify(f) === JSON.stringify(buildScene(y, fps).frames[i]));
  assert.ok(same(scene, plain, 12), "12 fps unchanged");
  assert.ok(!same(scene, plain, 24), "24 fps shows them");
  // The stretched picture: the body nearly one straight line (head, neck, hip and the push foot).
  const built = buildScene(scene, 24), t = extra.find((k) => k.lift! > 0)!.t;
  const s = skeletonOf(built.frames[Math.round(t * 24)], "a");
  const angle = (p: Point, q: Point) => Math.atan2(q.y - p.y, q.x - p.x);
  const foot = Math.abs(s.lFoot.x - s.hip.x) > Math.abs(s.rFoot.x - s.hip.x) ? s.lFoot : s.rFoot;
  const bend = Math.abs(((angle(foot, s.hip) - angle(s.hip, s.neck)) * 180) / Math.PI);
  assert.ok(bend < 25, `stretched: body and push leg in a line (bend ${bend.toFixed(0)} degrees)`);
});
