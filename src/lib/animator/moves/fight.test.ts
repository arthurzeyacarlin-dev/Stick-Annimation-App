import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { animationBounds } from "../stageFit.ts";
import { STAND } from "../rig.ts";
import { makeFightScene } from "./fightScene.ts";
import { getHit, reactionFor, slumpedGuard } from "./hit.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type Action, type ScenePlan } from "./plan.ts";
import { feetOf, fightFeet, GUARD } from "./punch.ts";
import { assertNatural, TEST_HEIGHT } from "./testkit.ts";
import { makeTestScene } from "./tests.ts";

// SPEC-0017 Phase 2: the energetic fight (Arthur, 2026-10-05) — getting hit, damage, and the fight
// director's random fights.

const duel = (attacker: Action[], defender: Action[], energy = 0.6): ScenePlan => ({
  id: "duel", title: "duel", height: TEST_HEIGHT, groundY: 900,
  characters: [
    { id: "a", x: 840, facing: "right", style: "natural", energy, actions: attacker },
    { id: "b", x: 1080, facing: "left", style: "natural", energy: 0.5, actions: defender },
  ],
});
const strikesAndHits = (strike: Action, n: number) => duel(
  Array.from({ length: n }, () => ({ ...strike, params: { ...strike.params, target: "b" } })),
  Array.from({ length: n }, () => ({ move: "getHit", params: { from: "a" } })),
);

test("the reaction follows the power: small = flinch, medium = stagger, big = knocked down", () => {
  assert.equal(reactionFor(0.4, 0), "flinch");
  assert.equal(reactionFor(1.0, 0), "stagger");
  assert.equal(reactionFor(1.6, 0), "knockdown");
  // A hurt body is knocked about more easily.
  assert.equal(reactionFor(1.2, 0), "stagger");
  assert.equal(reactionFor(1.2, 0.8), "knockdown");
});

test("recovery takes longer the more it hurts", () => {
  const start = { t: 0, x: 960, facing: "left" as const, pose: slumpedGuard(fightFeet(feetOf(STAND)), 0) };
  const settings = { height: TEST_HEIGHT, style: "natural" as const, speed: "normal" as const, energy: 0.6 };
  for (const power of [0.4, 1.0, 1.7]) {
    const fresh = getHit(start, { power, hurt: 0, after: 0.1 }, settings);
    const hurt = getHit(start, { power, hurt: 0, after: 0.8 }, settings);
    assert.ok(hurt.marks.ready > fresh.marks.ready + 0.05, `power ${power}: ready ${fresh.marks.ready.toFixed(2)} -> ${hurt.marks.ready.toFixed(2)}`);
  }
});

test("10 big wound-up hits beat a fighter (slumped); 25 little jabs leave it fine", () => {
  const big = planToScene(strikesAndHits({ move: "punch", params: { technique: "overhand", hand: "back" } }, 10), LIBRARY);
  assert.ok((big.hurt.b ?? 0) >= 0.85, `10 overhands: hurt ${big.hurt.b}`);
  for (const [k, power] of Object.entries(big.power)) assert.ok(power >= 1, `${k}: an overhand is a big hit (${power.toFixed(2)})`);
  // Slumped: its back bent forward much more than in a fresh guard.
  const last = big.characters[1].keys[big.characters[1].keys.length - 1];
  assert.ok(last.pose.lean >= GUARD.lean + 15 || Math.abs(last.pose.lean) > 50, `posture lean ${last.pose.lean.toFixed(0)}`);
  assertNatural(big, "10 overhands");

  const small = planToScene(strikesAndHits({ move: "punch", params: { technique: "straight", hand: "front" } }, 25), LIBRARY);
  assert.ok((small.hurt.b ?? 0) <= 0.25, `25 jabs: hurt ${small.hurt.b}`);
  for (const [k, power] of Object.entries(small.power)) assert.ok(power < 0.7, `${k}: a jab is a small hit (${power.toFixed(2)})`);
  assertNatural(small, "25 jabs");
});

test("every reaction happens exactly when its hit lands", () => {
  const scene = planToScene(strikesAndHits({ move: "kick", params: { height: "high" } }, 3), LIBRARY);
  for (let k = 1; k <= 3; k += 1) assert.ok(Math.abs(scene.marks[`b.getHit${k}.hit`] - scene.marks[`a.strike${k}.hit`]) < 1e-6, `hit ${k}`);
});

test("energetic fights: new every seed, natural, on the page, about 30 s, hits on time", () => {
  const page = 1920;
  for (const seed of [1, 2, 3, 5, 8, 13]) {
    const scene = makeFightScene(seed, {}, page);
    const label = `fight ${seed}`;
    // Fighters never pass through each other (Red stays on the left) — except standing over one who is down
    // (PRESS THE ADVANTAGE: a stomp lands on the belly, the stomper's hips over the body lying there).
    const lying = (f: { skeleton: { hip: { y: number } } }) => f.skeleton.hip.y > scene.groundY - 0.2 * 300;
    // (Both standing, they never change sides; stepping over one who lies there — a stomp — may leave them
    // on each other's far side, and they go on from there.)
    let side = 0;
    buildScene(scene, 12).frames.forEach((frame, i) => {
      // (...and a grab-spin-throw swings the other one round: sides may change between its grab and release.)
      const spinning = Object.entries(scene.marks).some(([n, t0]) => /\.(spinThrow|liftSlam)\d+\.grab$/.test(n) && i / 12 >= t0 - 1e-6 && i / 12 <= (scene.marks[n.replace(/grab$/, "release")] ?? scene.marks[n.replace(/grab$/, "slam")] ?? t0) + 0.5);
      if (lying(frame[0]) || lying(frame[1]) || spinning) { side = 0; return; }
      const now = Math.sign(frame[1].skeleton.hip.x - frame[0].skeleton.hip.x);
      assert.ok(side === 0 || now === side, `${label}: crossed at ${(i / 12).toFixed(2)} s`);
      side = now;
    });
    assertNatural(scene, label);
    // (The editor centers the whole animation on the page: it fits if it is no wider than the page.)
    const b = animationBounds(buildScene(scene, 12).frames);
    assert.ok(b.right - b.left <= page * 0.92 + 1, `${label}: fits the page (${b.left.toFixed(0)}..${b.right.toFixed(0)})`);
    assert.ok(scene.durationSec >= 25 && scene.durationSec <= 50, `${label}: ${scene.durationSec}s`);
    assert.ok(/Red|Blue/.test(scene.title), `${label}: ${scene.title}`);
    for (const [name, t] of Object.entries(scene.marks)) {
      const m = /^(\w)\.getHit(\d+)\.hit$/.exec(name);
      if (!m) continue;
      const attacker = m[1] === "a" ? "b" : "a";
      assert.ok(Math.abs(t - scene.marks[`${attacker}.strike${m[2]}.hit`]) < 1e-3, `${label}: ${name} on time (within 1 ms)`);
    }
    // Somebody really got hurt.
    assert.ok(Math.max(...Object.values(scene.hurt)) >= 0.3, `${label}: hurt ${JSON.stringify(scene.hurt)}`);
  }
});

// NO PORTAL PUNCHES (round 16, Arthur: "Red is punching and Blue's far away and he's getting punched — it's like a
// portal"): every hit that lands — a punch, a kick, each barrage punch, a dash punch — really touches the other
// body (a fist or foot within a few px of its head, chest, arms or legs, a picture either side of the moment),
// and the one hit is never thrown TOWARD the one who hit it (the energy comes from where the hit came from).
test("energetic fights: every landed hit really reaches the other body, and pushes it away", () => {
  const fps = 24;
  const segment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (const seed of [1, 2, 4, 6]) {
    const scene = makeFightScene(seed, {}, 1920), built = buildScene(scene, fps), H = 300;
    const ids = scene.characters.map((c) => c.id);
    for (const [name, t] of Object.entries(scene.marks)) {
      const m = /^(\w+)\.(strike\d+\.hit|barrage\d+\.hit\d+|dashPunch\d+\.hit)$/.exec(name);
      if (!m) continue;
      const ai = ids.indexOf(m[1]), di = 1 - ai, f = Math.min(built.frames.length - 1, Math.round(t * fps));
      const reach = Math.min(...[f - 1, f, f + 1].filter((g) => g >= 0 && g < built.frames.length).map((g) => {
        const A = built.frames[g][ai].skeleton, D = built.frames[g][di].skeleton, r = built.frames[g][di].headRadius;
        const body = (p: { x: number; y: number }) => Math.min(Math.hypot(p.x - D.head.x, p.y - D.head.y) - r, segment(p, D.neck, D.hip), segment(p, D.neck, D.lElbow), segment(p, D.neck, D.rElbow),
          segment(p, D.lElbow, D.lHand), segment(p, D.rElbow, D.rHand), segment(p, D.hip, D.lKnee), segment(p, D.hip, D.rKnee));
        return Math.min(body(A.lHand), body(A.rHand), body(A.lFoot), body(A.rFoot));
      }));
      assert.ok(reach < 0.18 * H, `fight ${seed}: ${name} at ${t.toFixed(2)}s lands ${(reach / H).toFixed(2)} x height away from the other body`);
      const D0 = built.frames[f][di].skeleton, A0 = built.frames[f][ai].skeleton, f2 = Math.min(built.frames.length - 1, f + Math.round(0.15 * fps));
      const moved = (built.frames[f2][di].skeleton.hip.x - D0.hip.x) * (Math.sign(D0.hip.x - A0.hip.x) || 1);
      assert.ok(moved > -0.06 * H, `fight ${seed}: ${name} at ${t.toFixed(2)}s throws the one hit TOWARD the hitter (${(moved / H).toFixed(2)} x height)`);
    }
  }
});

// A DASH TAKES OFF FAR OUT (round 16, Arthur on fight 2: "the airborne was a little too late. He was too close to the
// person by then... like three times farther away"): the fight's opening dash leaves the floor about as far from the
// target as the passed dash punch does — at least 90% of its hip-to-hip gap at the push.
test("energetic fights: the opening dash takes off about as far out as the passed dash punch", () => {
  const fps = 60, H = 300;
  const takeoff = (scene: Parameters<typeof buildScene>[0] & { marks?: Record<string, number> }) => {
    const built = buildScene(scene, fps), ids = scene.characters.map((c) => c.id);
    const [name, t] = Object.entries(scene.marks ?? {}).find(([k]) => /^\w+\.dashPunch1\.push$/.test(k))!;
    const ai = ids.indexOf(name.split(".")[0]), f = built.frames[Math.min(built.frames.length - 1, Math.round(t * fps))];
    return Math.abs(f[ai].skeleton.hip.x - f[1 - ai].skeleton.hip.x) / H;
  };
  const alone = takeoff(makeTestScene("dashPunch", { style: "natural", speed: "normal", energy: 0.5, direction: 1 } as never, 1920));
  for (const seed of [2, 4]) {
    const gap = takeoff(makeFightScene(seed, {}, 1920));
    assert.ok(gap >= 0.9 * alone, `fight ${seed}: the dash takes off ${gap.toFixed(2)} x height out, the passed dash punch ${alone.toFixed(2)}`);
  }
});
