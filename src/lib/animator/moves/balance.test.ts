import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type Scene } from "../engine.ts";
import { STAND, withPose, type Facing, type PoseAngles, type Skeleton } from "../rig.ts";
import { BALANCE_MARGIN, HEEL, TOE } from "./balance.ts";
import type { MoveSettings, Stance } from "./motion.ts";
import { feetOf, fightFeet, fightRest, GUARD, guardPose } from "./punch.ts";
import { MOVE_STYLES } from "./styles.ts";
import { assertNatural, sceneOfKeys, TEST_HEIGHT } from "./testkit.ts";
import { makeTestScene } from "./tests.ts";
import { catchBreath } from "./turn.ts";

// BALANCE (Arthur, round 8: tired, "his back leans by a lot ... it looks like he's supposed to be falling.
// How is he balancing?"). In every tired or out-of-breath pose the body's weight stays over its feet,
// inside the support (back heel to front toes) with room to spare: bent over, the hips go back, the knees
// bend and the hands rest on the knees; a tired fighting stance leans only a little.

const H = TEST_HEIGHT;
const SIDES: Facing[] = ["right", "left"];
const settingsFor = (style: MoveSettings["style"]): MoveSettings => ({ height: H, style, speed: "normal", energy: 0.5 });

// The weight's x on a drawn skeleton (the body parts' shares, as in squat.ts centerOfMass).
function weightX(s: Skeleton) {
  const mid = (a: { x: number }, b: { x: number }) => (a.x + b.x) / 2;
  return (0.08 * s.head.x + 0.46 * mid(s.hip, s.neck) + 0.03 * (mid(s.neck, s.lElbow) + mid(s.neck, s.rElbow)) + 0.025 * (mid(s.lElbow, s.lHand) + mid(s.rElbow, s.rHand))
    + 0.1 * (mid(s.hip, s.lKnee) + mid(s.hip, s.rKnee)) + 0.06 * (mid(s.lKnee, s.lFoot) + mid(s.rKnee, s.rFoot))) / 0.97;
}
// How far inside the support the weight is (x height), and how far it is from the middle of the feet.
function balanceOf(s: Skeleton, facing: Facing, height: number) {
  const dir = facing === "left" ? -1 : 1;
  const feet = [s.lFoot.x * dir, s.rFoot.x * dir], w = weightX(s) * dir;
  const back = Math.min(...feet), front = Math.max(...feet);
  return { margin: Math.min(w - (back - HEEL * height), front + TOE * height - w) / height, offMiddle: (w - (back + front) / 2) / height };
}
// The torso's lean from upright (degrees, forward +).
const leanOf = (s: Skeleton, facing: Facing) => (Math.atan2((s.neck.x - s.hip.x) * (facing === "left" ? -1 : 1), s.hip.y - s.neck.y) * 180) / Math.PI;
// Distance (px) from a point to a bone.
function toBone(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

// Every 24 fps frame of a character from `from` seconds on.
function framesFrom(scene: Scene, id: string, from: number) {
  const built = buildScene(scene, 24);
  return built.frames.map((f, i) => ({ t: i / 24, ch: f.find((c) => c.id === id)! })).filter((f) => f.t >= from - 1e-6 && f.ch && f.ch.facing !== "front");
}

// Stances a figure may be standing in when it runs out of breath: feet together, a stride, a fighting stance.
const STRIDE = withPose(STAND, { lHip: 24, rHip: -18, lKnee: 8, rKnee: 18 });
const FIGHTING = guardPose(fightFeet(feetOf(STAND)));
const STANCES: [string, PoseAngles][] = [["stand", STAND], ["stride", STRIDE], ["fighting stance", FIGHTING]];

test("BALANCE: catching its breath bent over, the hips go back and the knees bend so the weight stays over the feet, the hands rest on the knees (every style, both ways, any stance)", () => {
  for (const style of MOVE_STYLES) for (const facing of SIDES) for (const [name, pose] of STANCES) {
    const label = `catchBreath/${style}/${facing}/${name}`;
    const start: Stance = { t: 0.5, x: 900, facing, pose };
    const out = catchBreath(start, {}, settingsFor(style));
    const scene = sceneOfKeys(out.keys, facing);
    assertNatural(scene, label);
    const bent = out.marks.bentOver;
    for (const { t, ch } of framesFrom(scene, scene.characters[0].id, start.t)) {
      const { margin } = balanceOf(ch.skeleton, facing, H);
      assert.ok(margin >= BALANCE_MARGIN, `${label}: the weight is over the feet at ${t.toFixed(2)}s (${margin.toFixed(3)} inside, at least ${BALANCE_MARGIN})`);
      if (Math.abs(t - bent) < 1 / 48) {
        const s = ch.skeleton;
        assert.ok(leanOf(s, facing) > 30, `${label}: bent over (${leanOf(s, facing).toFixed(0)} degrees)`);
        // Hips back: well behind the middle of the feet.
        const behind = ((s.lFoot.x + s.rFoot.x) / 2 - s.hip.x) * (facing === "left" ? -1 : 1);
        assert.ok(behind > 0.05 * H, `${label}: the hips are pushed back behind the feet (${behind.toFixed(1)} px)`);
        for (const side of ["l", "r"] as const) {
          const knee = s[`${side}Knee`], hand = s[`${side}Hand`];
          assert.ok(toBone(hand, s.hip, knee) < 0.025 * H, `${label}: the ${side} hand rests on its thigh (${toBone(hand, s.hip, knee).toFixed(1)} px away)`);
          assert.ok(Math.hypot(hand.x - knee.x, hand.y - knee.y) < 0.4 * 0.23 * H, `${label}: ... just above the knee`);
        }
      }
    }
  }
});

test("BALANCE: a tired fighting stance leans only a little and keeps its weight over the middle of the feet (every style, both ways, any tiredness)", () => {
  for (const style of MOVE_STYLES) for (const facing of SIDES) for (const tired of [0.25, 0.6, 1]) {
    const label = `fightRest/${style}/${facing}/${tired}`;
    const start: Stance = { t: 0.5, x: 900, facing, pose: FIGHTING };
    const out = fightRest(start, { tired }, settingsFor(style));
    const scene = sceneOfKeys(out.keys, facing);
    assertNatural(scene, label);
    for (const { t, ch } of framesFrom(scene, scene.characters[0].id, start.t)) {
      const { margin, offMiddle } = balanceOf(ch.skeleton, facing, H);
      assert.ok(margin >= BALANCE_MARGIN, `${label}: the weight is over the feet at ${t.toFixed(2)}s (${margin.toFixed(3)} inside)`);
      if (t >= out.marks.tired - 1e-6) {
        assert.ok(Math.abs(offMiddle) < 0.03, `${label}: the weight is near the middle of the stance (${offMiddle.toFixed(3)} off) at ${t.toFixed(2)}s`);
        assert.ok(leanOf(ch.skeleton, facing) <= GUARD.lean + 10, `${label}: leans only a little (${leanOf(ch.skeleton, facing).toFixed(0)} degrees)`);
      }
    }
  }
});

test("BALANCE in Arthur's review scenes: parkour's catch-breath and the ends of 'Jab, punch, kick', 'Long fight' and 'Overhand from range, step in, uppercut' stay balanced, every style", () => {
  const scenes: [string, number][] = [["parkour", 1920], ["fight", 1080], ["longFight", 1080], ["rangeThenClose", 1080]];
  for (const [id, width] of scenes) for (const style of MOVE_STYLES) for (const direction of [1, -1] as const) {
    const scene = makeTestScene(id, { style, speed: "normal", energy: 0.5, direction }, width) as Scene & { marks: Record<string, number> };
    let seen = 0;
    for (const character of scene.characters) for (const [mark, lead] of [["bentOver", 0.55], ["tired", 0.45]] as const) {
      const at = scene.marks[`${character.id}.${mark}`];
      if (at === undefined) continue;
      seen += 1;
      for (const { t, ch } of framesFrom(scene, character.id, at - lead)) {
        const { margin } = balanceOf(ch.skeleton, ch.facing, character.height);
        assert.ok(margin >= BALANCE_MARGIN, `${id}/${style}/${direction}: ${character.id} is balanced at ${t.toFixed(2)}s (${margin.toFixed(3)} inside)`);
        if (mark === "tired" && t >= at) assert.ok(leanOf(ch.skeleton, ch.facing) <= GUARD.lean + 10, `${id}/${style}: the tired fighting stance leans only a little`);
      }
    }
    assert.ok(seen > 0, `${id}/${style}: ends tired`);
  }
});

// RESTING HANDS (Arthur, round 9: "when he's done fighting, his arms got to lower a bit more so I can
// visually see a change ... His hands are still up, but not up to his chest: a little lower than his
// chest"). Replaces round 8's "the guard sinks a little, fists toward the chest".
test("RESTING HANDS: a fight's tired stance has the hands below the chest (lower the more tired), still in front with the forearms forward, not hanging (every style, both ways)", () => {
  const handsOf = (s: Skeleton, facing: Facing) => (["l", "r"] as const).map((side) => {
    const dir = facing === "left" ? -1 : 1, hand = s[`${side}Hand`], elbow = s[`${side}Elbow`];
    return { up: (s.hip.y - hand.y) / H, front: ((hand.x - s.hip.x) * dir) / H, fore: ((hand.x - elbow.x) * dir) / H, chest: (s.hip.y - s.neck.y) / H };
  });
  for (const style of MOVE_STYLES) for (const facing of SIDES) {
    let before = Infinity;
    for (const tired of [0.25, 0.6, 1]) {
      const label = `fightRest/${style}/${facing}/${tired}`;
      const out = fightRest({ t: 0.5, x: 900, facing, pose: FIGHTING }, { tired }, settingsFor(style));
      const frames = framesFrom(sceneOfKeys(out.keys, facing), "a", out.marks.tired);
      const hands = handsOf(frames[frames.length - 1].ch.skeleton, facing);
      for (const h of hands) {
        // Below the chest: well under the shoulders (the chest is about a quarter of the torso below them).
        assert.ok(h.up < 0.6 * h.chest, `${label}: hand below the chest (${h.up.toFixed(3)} x height above the hips, shoulders ${h.chest.toFixed(3)})`);
        assert.ok(h.up > 0.06, `${label}: hand still up in front of the belly, not hanging (${h.up.toFixed(3)})`);
        assert.ok(h.front > 0.12 && h.fore > 0.1, `${label}: hand in front, forearm pointing forward (${h.front.toFixed(2)}, ${h.fore.toFixed(2)})`);
      }
      const mean = (hands[0].up + hands[1].up) / 2;
      assert.ok(mean < before - 0.01, `${label}: more tired, lower hands (${mean.toFixed(3)} after ${before.toFixed(3)})`);
      before = mean;
    }
  }
  // In Arthur's review scenes the resting hands end at least 2x lower than round 9's (about 0.2-0.29 x height above the hips).
  for (const [id, most] of [["longFight", 0.12], ["fight", 0.13], ["rangeThenClose", 0.15]] as const) {
    const scene = makeTestScene(id, { style: "natural", speed: "normal", energy: 0.5, direction: 1 }, 1080) as Scene & { marks: Record<string, number> };
    const frames = framesFrom(scene, "a", scene.marks["a.tired"]);
    for (const h of handsOf(frames[frames.length - 1].ch.skeleton, "right")) assert.ok(h.up < most, `${id}: resting hand at ${h.up.toFixed(3)} x height above the hips (at most ${most})`);
  }
});
