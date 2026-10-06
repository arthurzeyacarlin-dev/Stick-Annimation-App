import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { STAND } from "../rig.ts";
import { centerAnimation, STAGE_CENTER_X, STAGE_HEIGHT } from "../stageFit.ts";
import { FALLEN_BACK, getUp } from "./fall.ts";
import { BODY_CLEAR, bodyGap, coverUp, distanceToBody, kipUp, stompDown, stompSpot, type Other } from "./grapple.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { makeTestScene, type TestLook } from "./tests.ts";
import { armPathProblems, assertNatural, sceneOfKeys, TEST_HEIGHT } from "./testkit.ts";
import { MOVE_STYLES, type MoveStyle } from "./styles.ts";

// GROUND FIGHTING (grapple.ts): a stomp on someone lying down, and the one below covering up.

const lookOf = (style: MoveStyle, direction: 1 | -1 = 1): TestLook => ({ style, speed: "normal", energy: 0.6, direction });
// Blue walks round to Red lying on his back and stomps; Red covers up and gets up.
const groundPlan = (style: MoveStyle, gap = 380, aFacing: "right" | "left" = "right"): ScenePlan => ({
  id: "g", title: "g", height: TEST_HEIGHT, groundY: 900,
  characters: [
    { id: "a", x: 960 + (aFacing === "right" ? -1 : 1) * gap / 2, facing: aFacing, style, energy: 0.6, actions: [{ move: "wait", params: { seconds: 1.3 } }, { move: "stompDown", params: { target: "b" } }] },
    { id: "b", x: 960 + (aFacing === "right" ? 1 : -1) * gap / 2, facing: aFacing === "right" ? "left" : "right", style, energy: 0.5, actions: [{ move: "fallDown", params: { direction: "back" } }, { move: "coverUp", params: { from: "a" } }, { move: "getUp" }] },
  ],
});

// The most any joint touching the floor (within 1.5 px of it) in two pictures in a row moves along it, px.
function floorSlide(frames: { skeleton: Record<string, { x: number; y: number }> }[][], floor = Math.max(...frames.flatMap((f) => f.map((c) => c.skeleton.lFoot.y)))): number {
  let most = 0;
  for (let i = 1; i < frames.length; i += 1) for (const [k, c] of frames[i].entries()) for (const j of ["lFoot", "rFoot", "lHand", "rHand", "hip", "lKnee", "rKnee"]) {
    const a = frames[i - 1][k].skeleton[j], b = c.skeleton[j];
    if (Math.abs(a.y - floor) < 1.5 && Math.abs(b.y - floor) < 1.5) most = Math.max(most, Math.abs(b.x - a.x));
  }
  return most;
}

// How far the stomping foot (the higher one of A's feet) is from B's body (torso and arms), stage px.
function stompContact(scene: ReturnType<typeof planToScene>, fps: number) {
  const built = buildScene(scene, fps);
  const t = scene.marks["a.stompDown1.stomp"];
  // (Every frame from the landing on while the foot is pressed in: the first frame at or after it, and
  // the frames of the next 0.1 s.)
  let off = 0;
  for (let i = Math.ceil(t * fps - 1e-6); i <= Math.floor((t + 0.1) * fps + 1e-6); i += 1) {
    const frame = built.frames[i];
    const a = frame.find((c) => c.id === "a")!.skeleton, b = frame.find((c) => c.id === "b")!.skeleton;
    off = Math.max(off, Math.min(distanceToBody(a.lFoot, b), distanceToBody(a.rFoot, b)));
  }
  return { built, off };
}

test("ground fight: Blue walks to Red lying down and his stomping foot lands ON Red's body (every mood, both ways, 12 and 24 fps)", () => {
  for (const style of MOVE_STYLES) for (const facing of ["right", "left"] as const) {
    const scene = planToScene(groundPlan(style, 380, facing), LIBRARY);
    const label = `${style}/${facing}`;
    assertNatural(scene, label);
    // The one below is hit exactly when the foot lands.
    assert.ok(Math.abs(scene.marks["b.coverUp1.hit"] - scene.marks["a.stompDown1.stomp"]) < 1e-6, `${label}: Red reacts when the foot lands`);
    for (const fps of [12, 24]) {
      const { built, off } = stompContact(scene, fps);
      // GRABS AND STRIKES TOUCH: within a line's width (7 px) of the body.
      assert.ok(off <= 7, `${label}@${fps}: the stomp lands ${off.toFixed(1)} px off Red's body`);
      assert.deepEqual(armPathProblems(built.frames, fps), [], `${label}@${fps}: arm paths`);
    }
  }
});

test("stomp down: anticipation the opposite way (knee and foot go UP high first), a fast slam, eyes on the spot", () => {
  const H = TEST_HEIGHT;
  const settings = { height: H, style: "natural" as const, speed: "normal" as const, energy: 0.6 };
  const other: Other = { dx: 0.4, facing: "opposite", pose: FALLEN_BACK };
  const out = stompDown({ t: 0, x: 900, facing: "right", pose: STAND }, { other }, settings);
  const built = assertNatural(sceneOfKeys(out.keys), "stompDown");
  const fps = built.fps;
  const footY = (t: number) => { const s = built.frames[Math.ceil(t * fps - 1e-6)][0].skeleton; return Math.min(s.lFoot.y, s.rFoot.y); };
  // At the top of the wind-up the stomping foot is high (at least a quarter of the height off the floor)...
  assert.ok(900 - footY(out.marks.windup) > 0.25 * H, `foot only ${(900 - footY(out.marks.windup)).toFixed(0)} px up at the wind-up`);
  // ...and it comes down to the spot on the body (the spot is just above the floor).
  const spot = stompSpot(other);
  assert.ok(Math.abs(900 - footY(out.marks.stomp) - -spot.y * H) < 4, "foot lands at the body's height");
  // The slam is much quicker than the wind-up.
  const windup = out.marks.windup - out.keys[0].t, slam = out.marks.stomp - out.marks.windup;
  assert.ok(slam < 0.6 * windup, `slam ${slam.toFixed(2)} s vs wind-up ${windup.toFixed(2)} s`);
  // EYES: looking down at the spot at the wind-up and the slam (head tipped down past level).
  for (const name of ["windup", "stomp"] as const) {
    const key = out.keys.find((k) => Math.abs(k.t - out.marks[name]) < 1e-9)!;
    assert.ok(key.pose.lean + key.pose.head > 15, `${name}: looks down (${(key.pose.lean + key.pose.head).toFixed(0)} degrees)`);
  }
});

test("cover up: lying on the back it sees it coming, covers, is driven flat as it lay at the hit, and ends lying", () => {
  const settings = { height: TEST_HEIGHT, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
  const out = coverUp({ t: 0, x: 960, facing: "left", pose: FALLEN_BACK }, {}, settings);
  assert.ok(out.marks.sees < out.marks.covered && out.marks.covered < out.marks.hit && out.marks.hit < out.marks.down);
  const hit = out.keys.find((k) => Math.abs(k.t - out.marks.hit) < 1e-9)!;
  // Driven flat: the torso exactly as it lay (so the foot aimed there lands on it).
  assert.ok(Math.abs(hit.pose.lean - FALLEN_BACK.lean) < 1e-6);
  // Eyes on the foot before the hit (chin a touch up) — but the back stays flat on the floor (round 10:
  // Arthur rejected the shoulders lifting: "if he's laying down, he's laying down").
  const sees = out.keys.find((k) => Math.abs(k.t - out.marks.sees) < 1e-9)!;
  assert.ok(sees.pose.head > FALLEN_BACK.head && Math.abs(sees.pose.lean - FALLEN_BACK.lean) < 1e-6);
  // LYING IS LYING: in every picture (8, 12, 24 fps) the hips stay on the floor (within the lying rest
  // height + 1 px) and, apart from the fold right after the hit, the head and neck do too; the legs jolt
  // up after the hit and are slammed back down.
  for (const fps of [8, 12, 24]) {
    const built = buildScene(sceneOfKeys(out.keys, "left"), fps);
    const rest = 900 - built.frames[0][0].skeleton.hip.y;
    for (const [i, f] of built.frames.entries()) {
      const c = f[0], t = i / fps, s = c.skeleton;
      assert.ok(900 - s.hip.y <= rest + 1, `@${fps} ${t.toFixed(2)} s: hips ${(900 - s.hip.y).toFixed(1)} px off the floor`);
      const folding = t > out.marks.hit && t < out.marks.slam + 0.05;
      if (!folding) assert.ok(900 - (s.head.y + c.headRadius) <= 6, `@${fps} ${t.toFixed(2)} s: head ${(900 - s.head.y - c.headRadius).toFixed(1)} px off the floor`);
    }
  }
  const fold = out.keys.find((k) => Math.abs(k.t - out.marks.fold) < 1e-9)!, slam = out.keys.find((k) => Math.abs(k.t - out.marks.slam) < 1e-9)!;
  assert.ok(fold.pose.lean > FALLEN_BACK.lean && fold.pose.lHip > slam.pose.lHip + 30, "folds round the hit, legs jolt up, then slam down");
  assert.deepEqual(out.keys[out.keys.length - 1].pose, FALLEN_BACK);
  for (const k of out.keys.slice(1)) assert.deepEqual(k.contacts, [], "lying: no planted feet");
  assertNatural(sceneOfKeys(out.keys, "left"), "coverUp");
});

test("ground fight review combos: body rules, page fit (centered), arm paths and stomp contact at every page shape, every mood, 8-30 fps", () => {
  const rates = [8, 10, 12, 13, 15, 24, 30];
  for (const id of ["groundFight", "groundCounter"]) for (const [k, style] of MOVE_STYLES.entries()) {
    const aspect = [9 / 16, 3 / 4, 1, 4 / 3, 16 / 9][k % 5], width = STAGE_HEIGHT * aspect;
    const scene = makeTestScene(id, lookOf(style, k % 2 === 0 ? 1 : -1), width) as ReturnType<typeof planToScene>;
    const label = `${id} ${style}@${aspect.toFixed(2)}`;
    assert.ok(scene.marks["a.stompDown1.stomp"] !== undefined, `${label}: the stomp happens`);
    for (const fps of rates) {
      const { built, off } = stompContact(scene, fps);
      assert.ok(off <= 7, `${label}@${fps}: stomp ${off.toFixed(1)} px off the body`);
      for (const r of built.report.characters) {
        assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${label}@${fps}: body rules (${JSON.stringify(r)})`);
        assert.ok(r.maxJointStepPx < (120 * 24) / fps, `${label}@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)} px`);
      }
      // (Arm turning limits scale with the rate: 100 degrees a picture at 24 fps = 2400 degrees a second.)
      assert.deepEqual(armPathProblems(built.frames, fps, 2400 / fps), [], `${label}@${fps}: arm paths`);
      const fit = centerAnimation(built.frames, width, built.objects);
      assert.ok(fit.fits, `${label}@${fps}: off the page`);
      assert.ok(Math.abs((fit.bounds.left + fit.bounds.right) / 2 - STAGE_CENTER_X) < 0.5, `${label}@${fps}: not centered`);
    }
  }
});

test("kip-up: rocks back first (anticipation), is in the air a moment, lands on both feet, ends in its guard", () => {
  for (const style of MOVE_STYLES) {
    const settings = { height: TEST_HEIGHT, style, speed: "normal" as const, energy: 0.6 };
    // Someone stands just in front of its hips (on its feet side).
    const other: Other = { dx: 0.12, facing: "opposite", pose: STAND };
    const out = kipUp({ t: 0, x: 960, facing: "left", pose: FALLEN_BACK }, { other }, settings);
    void other;
    assert.ok(out.marks.rock < out.marks.kip && out.marks.kip < out.marks.land && out.marks.land < out.marks.up, `${style}: rock, kip, land, up in order`);
    const key = (name: string) => out.keys.find((k) => Math.abs(k.t - out.marks[name]) < 1e-9)!;
    // BACK HOP (round 13: "he gets up BACKWARDS: a little hop backwards ... his spine leans backwards"):
    // out of the crouch it hops back (in the air, leaning back) and stands 0.1-0.2+ body heights further back.
    assert.ok(out.marks.land < out.marks.hop && out.marks.hop < out.marks.up, `${style}: land, hop, up in order`);
    assert.ok((key("hop").lift ?? 0) > 0 && key("hop").pose.lean < 0, `${style}: in the air at the hop, the spine leaning back`);
    const hopBack = (key("up").x - key("land").x) / TEST_HEIGHT; // (facing left: back = +x)
    assert.ok(hopBack >= 0.1, `${style}: hops back ${hopBack.toFixed(2)} body heights`);
    // GET-UP PACE (round 12: "He gets up too fast ... two or three times slower"): lying still to standing
    // takes a natural time — about 2 s for a fresh natural fighter, never under 1.5 s whatever the mood (the
    // slow moods take longer) — one thing after another: the leg push is a steady push, not a kick, and the
    // arm push ("boom") is quick next to the parts around it.
    const lyingToUp = out.marks.up - out.keys[0].t;
    assert.ok(lyingToUp >= 1.5 && lyingToUp <= 5.5, `${style}: lying to standing ${lyingToUp.toFixed(2)} s (1.5-5.5 s)`);
    // (Blocked here — someone just in front of its hips — so it pushes back first: up to 3 s; round 13 adds the back hop.)
    if (style === "natural") assert.ok(lyingToUp >= 1.8 && lyingToUp <= 3, `natural: lying to standing about 2 s (${lyingToUp.toFixed(2)})`);
    // (The rise out of the squat — landed crouch to standing, with the hop — is slower than the arm push.)
    assert.ok(out.marks.kip - out.marks.rock < out.marks.up - out.marks.land, `${style}: the arm push is quick next to standing up`);
    assert.ok((key("kip").lift ?? 0) > 0 && (key("kip").contacts ?? []).length === 0, `${style}: in the air at the kip`);
    assert.deepEqual(key("land").contacts, ["lFoot", "rFoot"], `${style}: lands on both feet`);
    // Quicker than the hurt get-up (the same get-up: nobody near, so no push away first).
    const alone = kipUp({ t: 0, x: 960, facing: "left", pose: FALLEN_BACK }, {}, settings);
    assert.ok(alone.end.t < getUp({ t: 0, x: 960, facing: "left", pose: FALLEN_BACK }, {}, settings).end.t, `${style}: quicker than the slow get-up`);
    const built = assertNatural(sceneOfKeys(out.keys, "left"), `kipUp ${style}`);
    assert.deepEqual(armPathProblems(built.frames, 24), [], `kipUp ${style}: arm paths`);
    // NO SLIDE (round 13: "it's not really possible because the ground has FRICTION"): whatever touches the
    // floor in two pictures in a row (feet, hands, hips, knees) doesn't move along it (24 fps).
    // (Checked on the kip-up with room to get up: blocked, it still pushes back first — not built without a slide yet.)
    const free = assertNatural(sceneOfKeys(alone.keys, "left"), `kipUp alone ${style}`).frames;
    assert.ok(floorSlide(free) <= 4, `${style}: something slides ${floorSlide(free).toFixed(1)} px along the floor`);
  }
});

test("kip-up next to someone (the counter combo): from leaving the floor until its guard is up, no line of its body comes within BODY_CLEAR of theirs (every mood, both ways, 12 and 24 fps)", () => {
  for (const [k, style] of MOVE_STYLES.entries()) for (const direction of [1, -1] as const) {
    const look: TestLook = { style, speed: k % 3 === 0 ? "fast" : k % 3 === 1 ? "normal" : "slow", energy: 0.6, direction };
    const scene = makeTestScene("groundCounter", look, STAGE_HEIGHT * 16 / 9) as ReturnType<typeof planToScene>;
    const from = scene.marks["b.kipUp1.rock"], to = scene.marks["b.kipUp1.up"] + 0.3;
    for (const fps of [12, 24]) {
      const built = buildScene(scene, fps);
      let least = Infinity;
      for (let i = Math.ceil(from * fps); i <= Math.floor(to * fps); i += 1) {
        const a = built.frames[i].find((c) => c.id === "a")!, b = built.frames[i].find((c) => c.id === "b")!;
        least = Math.min(least, bodyGap(a.skeleton, b.skeleton, a.headRadius, b.headRadius));
      }
      assert.ok(least >= BODY_CLEAR * TEST_HEIGHT - 2, `${style}/${direction}@${fps}: comes ${least.toFixed(1)} px from Blue on the way up`);
    }
  }
});
