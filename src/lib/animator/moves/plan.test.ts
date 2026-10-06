import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { STAND } from "../rig.ts";
import { STAGE_CENTER_X, STAGE_HEIGHT, centerAnimation } from "../stageFit.ts";
import { lessonPack, PRINCIPLES } from "./lessons.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { COMBO_TESTS, SINGLE_MOVE_TESTS, makeSurpriseScene, makeTestScene, type TestLook } from "./tests.ts";
import { allSettings, assertNatural, sceneOfKeys, startStance } from "./testkit.ts";
import { stand, turn } from "./turn.ts";

test("turn around: right <-> left through facing the viewer, and to/from the front; body rules hold", () => {
  for (const s of allSettings()) for (const [from, to] of [["right", "left"], ["left", "right"], ["right", "front"], ["front", "left"]] as const) {
    const out = turn(startStance(from), { to }, s);
    const built = assertNatural(sceneOfKeys(out.keys, from), `turn ${from}->${to} ${s.style}/${s.speed}/${s.energy}`);
    assert.equal(out.end.facing, to);
    assert.equal(built.frames[built.frames.length - 1][0].facing, to);
  }
});

test("turning is a few real steps: feet lift and plant (never slide), and the view switches where side and front look alike", () => {
  const out = turn(startStance("right"), { to: "left" }, { height: 300, style: "natural", speed: "normal", energy: 0.5 });
  const frames = buildScene(sceneOfKeys(out.keys, "right"), 24).frames;
  const lifts = out.keys.filter((k, i) => i > 0 && (k.contacts ?? []).length === 1 && (out.keys[i - 1].contacts ?? []).length === 2).length;
  assert.equal(lifts, 2, `${lifts} steps`);
  let worst = 0;
  for (let i = 1; i < frames.length; i += 1) for (const j of Object.keys(frames[i][0].skeleton) as (keyof typeof frames[0][0]["skeleton"])[]) {
    const a = frames[i - 1][0].skeleton[j], b = frames[i][0].skeleton[j];
    worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
  }
  // (A step lifts and plants a foot; nothing may jump more than a normal step does.)
  assert.ok(worst < 20, `biggest joint step ${worst.toFixed(1)}px`);
});

test("standing breathes around the current pose and ends where it started", () => {
  for (const s of allSettings()) {
    const out = stand(startStance(), { seconds: 3 }, s);
    assertNatural(sceneOfKeys(out.keys), `stand ${s.style}`);
    assert.deepEqual(out.end.pose, out.keys[0].pose);
  }
});

test("a plan chains moves: each starts exactly where the last ended (walk, turn, walk back, slow turn, run)", () => {
  const plan: ScenePlan = { id: "p", title: "p", height: 300, groundY: 900, characters: [{ id: "a", x: 700, facing: "right", actions: [
    { move: "walk", params: { distance: 300 } }, { move: "turn" }, { move: "walk", params: { distance: 300 } }, { move: "turn", params: { slow: true } }, { move: "run", params: { distance: 500 } },
  ] }] };
  const scene = planToScene(plan, LIBRARY);
  const built = assertNatural(scene, "chain");
  const keys = scene.characters[0].keys;
  for (let i = 1; i < keys.length; i += 1) assert.ok(keys[i].t > keys[i - 1].t, "keys in time order, no duplicates");
  const hips = built.frames.map((f) => f[0].skeleton.hip.x);
  const back = hips.findIndex((x, i) => i > 0 && x < hips[i - 1] - 0.5); // starts walking back
  assert.ok(Math.abs(Math.max(...hips.slice(0, back)) - 1000) < 5, "walked out to 1000 (the turn shifts the weight onto the front foot)");
  assert.ok(Math.abs(Math.min(...hips.slice(back)) - (700 - 0.024 * 300)) < 3, "walked back to 700 (a turn ends a hair, 0.024 x height, along the new way)");
  assert.ok(Math.abs(hips[hips.length - 1] - 1200) < 3, "then ran to 1200");
  assert.deepEqual([...new Set(built.frames.map((f) => f[0].facing))], ["right", "front", "left"]);
});

test("figures are timed to each other: two high-five hands meet at the same moment", () => {
  const scene = makeTestScene("meetHighFive", { style: "natural", speed: "normal", energy: 0.5, direction: 1 });
  const marks = (scene as unknown as { marks: Record<string, number> }).marks;
  assert.ok(Math.abs(marks["a.slap"] - marks["b.slap"]) < 1e-6);
  const built = buildScene(scene, 24);
  const frame = built.frames[Math.round(marks["a.slap"] * 24)];
  const a = frame.find((c) => c.id === "a")!.skeleton.lHand, b = frame.find((c) => c.id === "b")!.skeleton.lHand;
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 7) <= 2, `hands ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)}px apart at the slap (tip to tip)`);
});

test("passing a ball: held, thrown on an arc, caught exactly when it arrives, held again", () => {
  const scene = makeTestScene("passBack", { style: "natural", speed: "normal", energy: 0.5, direction: 1 });
  const ball = scene.objects![0];
  // Who has it (holds may switch hands, e.g. to one hand for the throw): a, in the air, b, air, a, air, b.
  const owners = ball.segments!.map((s) => (s.mode === "held" ? (s as { character: string }).character : "air")).filter((o, i, all) => i === 0 || o !== all[i - 1]);
  assert.deepEqual(owners, ["a", "air", "b", "air", "a", "air", "b"]);
  const built = buildScene(scene, 24);
  // No jumps where the ball leaves or reaches the hands.
  let worst = 0;
  for (let i = 1; i < built.objects.length; i += 1) worst = Math.max(worst, Math.hypot(built.objects[i][0].x - built.objects[i - 1][0].x, built.objects[i][0].y - built.objects[i - 1][0].y));
  assert.ok(worst < 70, `ball moved ${worst.toFixed(0)}px in one frame`);
});

const LOOKS: TestLook[] = [
  { style: "natural", speed: "normal", energy: 0.5, direction: 1 },
  { style: "robot", speed: "fast", energy: 0.85, direction: -1 },
  { style: "tired", speed: "slow", energy: 0.2, direction: 1 },
  { style: "angry", speed: "fast", energy: 0.85, direction: -1 },
];

for (const entry of [...SINGLE_MOVE_TESTS, ...COMBO_TESTS]) {
  test(`test scene "${entry.title}": body rules, and the whole animation is centered and inside the page on every page shape`, () => {
    for (const look of LOOKS) for (const aspect of [9 / 16, 3 / 4, 1, 16 / 9]) {
      const width = STAGE_HEIGHT * aspect;
      const scene = makeTestScene(entry.id, look, width);
      const label = `${entry.id}/${look.style}@${aspect.toFixed(2)}`;
      if (scene.characters.length) assertNatural(scene, label);
      const built = buildScene(scene, 12);
      const fit = centerAnimation(built.frames, width, built.objects);
      assert.ok(fit.fits, `${label}: outside the page`);
      assert.ok(Math.abs((fit.bounds.left + fit.bounds.right) / 2 - STAGE_CENTER_X) < 0.5, `${label}: centered`);
    }
  });
}

test("flow: moves that follow each other don't go back to standing in between (jab, cross, kick)", () => {
  const scene = makeTestScene("fight", { style: "natural", speed: "normal", energy: 0.5, direction: 1 });
  const keys = scene.characters[0].keys;
  const marks = (scene as unknown as { marks: Record<string, number> }).marks;
  const restingBetween = keys.filter((k) => k.t > marks["a.punch1.hit"] && k.t < marks["a.kick1.hit"] && Math.abs(k.pose.rShoulder - (-6)) < 2 && Math.abs(k.pose.lShoulder - 8) < 2 && Math.abs(k.pose.lean) < 1);
  assert.equal(restingBetween.length, 0, "no plain standing pose between the moves");
});

// (Changed after Arthur's round-6 review: a fight used to end bent over, hands on knees, then standing up
// tall — he wants it to end in a TIRED FIGHTING STANCE, short, with no stand. THE END OF A FIGHT.)
test("a fight ends in its fighting stance, as tired as its effort (a long fight: back bent, guard low, breathing hard), briefly — no tall stand, and the kick's foot lands only once", () => {
  type Built = { marks: Record<string, number>; durationSec: number; characters: { keys: { t: number; pose: Record<string, number>; contacts?: string[]; lift?: number }[] }[] };
  const long = makeTestScene("longFight", { style: "natural", speed: "normal", energy: 0.5, direction: 1 }) as unknown as Built;
  const short = makeTestScene("fight", { style: "natural", speed: "normal", energy: 0.5, direction: 1 }) as unknown as Built;
  for (const [name, scene] of [["long", long], ["short", short]] as const) {
    const keys = scene.characters[0].keys, last = keys[keys.length - 1];
    assert.equal(scene.marks["a.bentOver"], undefined, `${name}: not bent over with hands on knees`);
    assert.ok(scene.marks["a.tired"] !== undefined, `${name}: settles into the tired fighting stance`);
    assert.notDeepEqual(last.pose, STAND, `${name}: does not end standing tall`);
    assert.ok(last.pose.lean > 10, `${name}: back bent forward (${last.pose.lean.toFixed(1)})`);
    // Short: from the last strike's hit to the end of the scene is only a few seconds.
    const lastHit = Math.max(...Object.entries(scene.marks).filter(([k]) => /^a\.strike\d+\.hit$/.test(k)).map(([, t]) => t));
    assert.ok(scene.durationSec - lastHit < 3.2, `${name}: ends ${(scene.durationSec - lastHit).toFixed(2)} s after the last hit`);
    // Both feet stay down from the moment the fighting ends.
    for (const k of keys.filter((key) => key.t >= scene.marks["a.tired"])) assert.equal((k.contacts ?? ["lFoot", "rFoot"]).length, 2, `${name}: both feet down at ${k.t.toFixed(2)}`);
  }
  // More effort, more tired.
  const lastOf = (s: Built) => s.characters[0].keys[s.characters[0].keys.length - 1].pose;
  assert.ok(lastOf(long).lean > lastOf(short).lean, "the long fight ends more bent over than the short one");
  // The fight ends with the kick: its foot comes down once and stays down (no landing, lifting and stepping again).
  const keys = short.characters[0].keys;
  for (const k of keys.filter((key) => key.t >= short.marks["a.kick1.land"])) assert.equal((k.contacts ?? ["lFoot", "rFoot"]).length, 2, `kick: foot stays down after landing (${k.t.toFixed(2)})`);
});

test("run, grab the ball, throw it: the ball lies where the hand reaches, then is held and thrown", () => {
  const scene = makeTestScene("runGrabThrow", { style: "natural", speed: "normal", energy: 0.5, direction: 1 });
  const marks = (scene as unknown as { marks: Record<string, number> }).marks;
  const built = buildScene(scene, 24);
  const at = (t: number) => built.objects[Math.round(t * 24)][0];
  const start = at(0), grabbed = at(marks["a.grab"]);
  assert.ok(Math.hypot(start.x - grabbed.x, start.y - grabbed.y) < 3, "picked up from where it lay");
  assert.ok(Math.abs(start.y + start.look.size / 2 - 900) < 1, "lying on the ground");
  assert.ok(at(marks["a.release"] + 0.15).y < grabbed.y - 50, "thrown up into the air");
});

test("lessons for the AI are made from the library itself", () => {
  const pack = lessonPack(LIBRARY, { walk: { distance: 300 }, run: { distance: 500 } });
  assert.equal(pack.principles, PRINCIPLES);
  assert.deepEqual(pack.moves.map((m) => m.id).sort(), Object.keys(LIBRARY).sort());
  for (const lesson of pack.moves) {
    assert.ok(lesson.keyPoses.length >= 2 && lesson.seconds > 0, `${lesson.id} has key poses`);
    assert.ok(lesson.about.length > 10);
  }
  // (Phase 2C: the powers — fire blast, water shield, teleport — took it just past 200 000; the 2C extras — laser
  // eyes, ice, handcuffs, moving backgrounds, camera, elemental fights — to about 227 000. Phase 3 must send the AI
  // only the lessons a request needs, or cache them, so each animation still costs a few cents or less. The
  // explosions, grenade, blast throw and weapon fights took it to about 242 000; weapon moves already send compact
  // lessons — lessonMarks.)
  assert.ok(JSON.stringify(pack).length < 260_000, "small enough to send to the AI");
});

// NEVER TOLD (Arthur, 2026-10-04): the engine must make animations nobody showed it. Random combos of
// library moves, in random orders, with random knobs, on every page shape: every one keeps the body
// rules (feet, bones, floor, joint limits, no jumps) and stays whole and centered on the page.
test("surprise combos nobody wrote keep every body rule and stay on the page", () => {
  const looks: TestLook[] = [
    { style: "natural", speed: "normal", energy: 0.5, direction: 1 }, { style: "angry", speed: "fast", energy: 0.85, direction: -1 },
    { style: "tired", speed: "slow", energy: 0.2, direction: 1 }, { style: "robot", speed: "normal", energy: 0.5, direction: -1 },
  ];
  for (let seed = 1; seed <= 40; seed += 1) {
    const look = looks[seed % looks.length];
    const width = STAGE_HEIGHT * [9 / 16, 3 / 4, 1, 16 / 9][seed % 4];
    const scene = makeSurpriseScene(seed * 7919, look, width);
    const label = `seed ${seed}: ${scene.title} (${look.style}, page ${width.toFixed(0)})`;
    const built = assertNatural(scene, label);
    const fit = centerAnimation(built.frames, width, built.objects);
    assert.ok(fit.fits, `${label}: outside the page`);
  }
});
