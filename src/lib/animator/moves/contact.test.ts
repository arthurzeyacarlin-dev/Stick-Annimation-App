import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, momentTimes, type FrameCharacter, type Scene } from "../engine.ts";
import { pictureOf } from "../objects.ts";
import { STAGE_HEIGHT } from "../stageFit.ts";
import { DEFAULT_STYLE, STAND, type Point, type Skeleton } from "../rig.ts";
import { highFive, highFiveSlapOffset, limbDistance, limbsCross, touchGap } from "./highFive.ts";
import type { MoveSettings } from "./motion.ts";
import { allSettings, armPathProblems, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { makeTestScene } from "./tests.ts";
import { MOVE_SPEEDS, MOVE_STYLES } from "./styles.ts";

// SPEC-0017 Phase 2 Round B — THE CONTACT RULE (Arthur's review, 2026-10-04: in the two-figure high-five
// "their hands aren't exactly touching"; the forearms crossed in an X above the heads). Touching body
// parts touch with the ENDS of the limbs (the hand is the end of the forearm), tip to tip: the round
// drawn line ends just touch (the hand points are one line thickness apart), and the limbs never pass
// through or cross each other on any frame. For a high-five the forearms stand up nearly straight and
// the palms meet side by side at the midpoint, then bounce apart.

const FRAME_RATES = [12, 24, 30];

type Pair = { a: Skeleton; b: Skeleton }; // a: on the left, facing right; b: on the right, facing left
const pairOf = (frame: FrameCharacter[]): Pair => ({ a: frame.find((c) => c.id === "a")!.skeleton, b: frame.find((c) => c.id === "b")!.skeleton });
const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
// How far a forearm leans toward the partner (degrees from straight up); `dir` = the way the figure faces.
const tiltOf = (s: Skeleton, dir: 1 | -1) => (Math.atan2((s.lHand.x - s.lElbow.x) * dir, s.lElbow.y - s.lHand.y) * 180) / Math.PI;

// Checks one two-figure high-five scene at 12, 24 and 30 fps.
function assertHighFiveContact(scene: Scene, slap: number, label: string, thickness: { a: number; b: number } = { a: DEFAULT_STYLE.thickness, b: DEFAULT_STYLE.thickness }) {
  const gap = touchGap(thickness.a, thickness.b);
  for (const fps of FRAME_RATES) {
    const name = `${label}@${fps}`;
    const built = buildScene(scene, fps);
    assert.ok(built.report.ok, `${name}: body rules`);
    // At the slap (the picture nearest it in time: KEY MOMENTS SHOW may move it): the hand tips just touch,
    // side by side, at the midpoint.
    const slapPicture = pictureOf(slap, fps, built.frames.length, momentTimes(scene, fps));
    const { a, b } = pairOf(built.frames[slapPicture]);
    const apart = dist(a.lHand, b.lHand);
    assert.ok(Math.abs(apart - gap) <= 2, `${name}: hand points ${apart.toFixed(2)}px apart at the slap (touching = ${gap}px)`);
    assert.ok(Math.abs(a.lHand.y - b.lHand.y) < 1, `${name}: hands side by side`);
    // (The place where the two round ends touch is halfway between the figures' starting hips.)
    const middle = (scene.characters[0].keys[0].x + scene.characters[1].keys[0].x) / 2;
    assert.ok(Math.abs(a.lHand.x + thickness.a / 2 - middle) < 1 && Math.abs(b.lHand.x - thickness.b / 2 - middle) < 1, `${name}: they touch at the midpoint`);
    // Palms from opposite sides: both forearms stand up nearly straight, leaning a little toward each other.
    for (const [s, dir, who] of [[a, 1, "a"], [b, -1, "b"]] as const) {
      const tilt = tiltOf(s, dir);
      // (Round 8: a ROBOT keeps its arm straight — "keeping its arms straight" — so its forearm leans in as
      // its straight arm does, up to 50 degrees; still tip to tip, never crossing.)
      const most = /\brobot\b/.test(label) ? 50 : 35;
      assert.ok(tilt >= 8 && tilt <= most, `${name}: ${who}'s forearm leans ${tilt.toFixed(1)} degrees (should stand up, 8..${most})`);
      assert.ok(s.lHand.y < s.lElbow.y && s.lHand.y < s.head.y, `${name}: ${who}'s hand up`);
    }
    // EVERY frame (wind-up, swing, press, bounce, fold): the forearms never cross or overlap, the arms never
    // cross, and the hands never pass each other.
    built.frames.forEach((frame, i) => {
      const at = `${name} t=${(i / fps).toFixed(3)}`;
      const p = pairOf(frame);
      assert.ok(!limbsCross(p.a.lElbow, p.a.lHand, p.b.lElbow, p.b.lHand), `${at}: forearms cross`);
      const closest = limbDistance(p.a.lElbow, p.a.lHand, p.b.lElbow, p.b.lHand);
      assert.ok(closest >= gap - 0.5, `${at}: forearm lines overlap (${closest.toFixed(2)}px apart, touching = ${gap}px)`);
      for (const [a1, a2] of [[p.a.neck, p.a.lElbow], [p.a.lElbow, p.a.lHand]]) for (const [b1, b2] of [[p.b.neck, p.b.lElbow], [p.b.lElbow, p.b.lHand]]) {
        assert.ok(!limbsCross(a1, a2, b1, b2), `${at}: arms cross`);
      }
      assert.ok(p.a.lHand.x <= p.b.lHand.x - gap + 0.5, `${at}: hands pass each other`);
    });
    // Then they bounce apart.
    const after = built.frames.slice(slapPicture, Math.round((slap + 0.4) * fps) + 1).map((f) => { const p = pairOf(f); return dist(p.a.lHand, p.b.lHand); });
    assert.ok(Math.max(...after) > gap + 20, `${name}: the hands bounce apart after the slap`);
  }
}

// Two figures facing each other `distance` apart, both doing the high-five at the same time.
function pairScene(distance: number, settings: MoveSettings, thickness = { a: DEFAULT_STYLE.thickness, b: DEFAULT_STYLE.thickness }) {
  const a = highFive({ t: 0, x: 960 - distance / 2, facing: "right", pose: STAND }, { partnerDistance: distance, thickness: thickness.a }, settings);
  const b = highFive({ t: 0, x: 960 + distance / 2, facing: "left", pose: STAND }, { partnerDistance: distance, thickness: thickness.b }, settings);
  assert.ok(Math.abs(a.marks.slap - b.marks.slap) < 1e-9, "both slaps at the same time");
  const scene: Scene = {
    id: "pair", title: "pair", durationSec: Math.ceil((Math.max(a.end.t, b.end.t) + 0.2) * 10) / 10, groundY: TEST_GROUND,
    characters: [
      { id: "a", name: "A", facing: "right", height: TEST_HEIGHT, style: { ...DEFAULT_STYLE, thickness: thickness.a }, keys: a.keys },
      { id: "b", name: "B", facing: "left", height: TEST_HEIGHT, style: { ...DEFAULT_STYLE, thickness: thickness.b }, keys: b.keys },
    ],
  };
  return { a, scene };
}

test("contact helpers: touching ends are one line thickness apart; an X crosses, tip to tip does not", () => {
  assert.equal(touchGap(7), 7);
  assert.equal(touchGap(12, 4), 8);
  // An X.
  assert.equal(limbsCross({ x: 0, y: 0 }, { x: 10, y: -10 }, { x: 10, y: 0 }, { x: 0, y: -10 }), true);
  assert.equal(limbDistance({ x: 0, y: 0 }, { x: 10, y: -10 }, { x: 10, y: 0 }, { x: 0, y: -10 }), 0);
  // A narrow V, tips one thickness apart: no crossing, and the closest points are the tips.
  const v = [{ x: -10, y: 30 }, { x: -3.5, y: 0 }, { x: 10, y: 30 }, { x: 3.5, y: 0 }] as const;
  assert.equal(limbsCross(v[0], v[1], v[2], v[3]), false);
  assert.ok(Math.abs(limbDistance(v[0], v[1], v[2], v[3]) - 7) < 1e-9);
  // Ends exactly on top of each other only touch (not a cross) — but the drawn lines overlap.
  assert.equal(limbsCross({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 0 }), false);
  assert.ok(limbDistance({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 0 }) < touchGap(7));
});

test("high-five review scenes (2 figures, and walk up + high-five): the hand tips just touch at the slap and the arms never cross, every style/speed/energy, 12/24/30 fps", () => {
  for (const id of ["highFive", "meetHighFive"]) for (const style of MOVE_STYLES) for (const speed of MOVE_SPEEDS) for (const energy of [0.2, 0.5, 0.85]) {
    const scene = makeTestScene(id, { style, speed, energy, direction: 1 }) as Scene & { marks: Record<string, number> };
    assert.ok(Math.abs(scene.marks["a.slap"] - scene.marks["b.slap"]) < 1e-6, `${id}: slaps synced`);
    assertHighFiveContact(scene, scene.marks["a.slap"], `${id}/${style}/${speed}/${energy}`);
  }
});

test("high-five, partners 150-300 px apart: tip to tip at the midpoint, forearms up, never crossing, every style/speed/energy, 12/24/30 fps", () => {
  for (const settings of allSettings()) for (const distance of [150, 180, 210, 240, 270, 300]) {
    const { a, scene } = pairScene(distance, settings);
    assertHighFiveContact(scene, a.marks.slap, `${distance}/${settings.style}/${settings.speed}/${settings.energy}`);
    const up = (TEST_GROUND - buildScene(scene, 24).frames[Math.round(a.marks.slap * 24)][0].skeleton.lHand.y) / TEST_HEIGHT;
    assert.ok(up > 0.84 && up < 0.97, `${distance}: about head height (${up.toFixed(2)})`);
  }
});

test("high-five: figures drawn with different line thicknesses still just touch (half of each line), and the slap time doesn't change", () => {
  for (const settings of [{ height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 }, { height: TEST_HEIGHT, style: "robot", speed: "fast", energy: 0.85 }] as MoveSettings[]) {
    const thickness = { a: 12, b: 4 };
    const { a, scene } = pairScene(240, settings, thickness);
    assertHighFiveContact(scene, a.marks.slap, `thick/thin ${settings.style}`, thickness);
    assert.ok(Math.abs(a.marks.slap - highFiveSlapOffset(settings)) < 1e-9, "slap time is the same for any thickness");
  }
});

// The page rule (plan.ts fitPlanToPage) moves the figures closer together on a narrow page and tells the
// high-five the new partner distance, so the hands still just touch there (before, they made an X).
test("high-five on a narrow page (phone shape): the hands still just touch", () => {
  for (const aspect of [9 / 16, 3 / 4]) {
    const scene = makeTestScene("meetHighFive", { style: "natural", speed: "normal", energy: 0.5, direction: 1 }, STAGE_HEIGHT * aspect) as Scene & { marks: Record<string, number> };
    const built = buildScene(scene, 24);
    const { a, b } = pairOf(built.frames[Math.round(scene.marks["a.slap"] * 24)]);
    assert.ok(Math.abs(dist(a.lHand, b.lHand) - touchGap(DEFAULT_STYLE.thickness)) <= 2, `${aspect.toFixed(2)}: hands ${dist(a.lHand, b.lHand).toFixed(1)}px apart`);
    for (const frame of built.frames) { const p = pairOf(frame); assert.ok(!limbsCross(p.a.lElbow, p.a.lHand, p.b.lElbow, p.b.lHand), `${aspect.toFixed(2)}: forearms cross`); }
  }
});

// ARM BEHIND THE HEAD (Arthur, round 6, his drawing: "the arm behind the stick figure is the one that is
// supposed to be high-fiving"): the wind-up raises the slapping arm up BEHIND the head — the elbow back
// and up behind the head, the forearm standing up — never up in front of the face with the hand curling
// over the top; it swings forward over the head into the slap and goes back down the way it came. No
// hand loops round the head and no arm windmills, every style/speed/energy and partner distance.
test("high-five: the wind-up raises the arm behind the head (elbow behind, forearm up), and the arms never loop round the head or windmill", () => {
  for (const settings of allSettings()) for (const distance of [150, 240, 300]) {
    const { a, scene } = pairScene(distance, settings);
    const label = `${distance}/${settings.style}/${settings.speed}/${settings.energy}`;
    for (const fps of [12, 24]) {
      const built = buildScene(scene, fps);
      assert.deepEqual(armPathProblems(built.frames, fps), [], `${label}@${fps}`);
      // Cocked (the end of the wind-up): both figures' slapping elbows are up behind the head, the hands above them.
      const { a: sa, b: sb } = pairOf(built.frames[Math.round(a.marks.cocked * fps)]);
      for (const [s, dir, who] of [[sa, 1, "a"], [sb, -1, "b"]] as const) {
        assert.ok((s.lElbow.x - s.neck.x) * dir < 0, `${label}@${fps}: ${who}'s elbow is behind the head`);
        assert.ok(s.lElbow.y < s.neck.y && s.lHand.y < s.lElbow.y, `${label}@${fps}: ${who}'s elbow up, forearm standing up`);
      }
      // All the way up (start to slap), the slapping hand is never in front of the face above the head:
      // it comes up the back way.
      // (Round 8: a ROBOT's arm is straight — "keeping its arms straight: go around behind its head" — so its
      // hand is a whole arm's length out, never by the face: it swings up the front and round behind the
      // head, because a straight arm swung up the back and over would carry the hand round the outside of
      // the head further than the arm-path rule allows.)
      if (settings.style !== "robot") for (const frame of built.frames.slice(0, Math.floor(a.marks.cocked * fps) + 1)) {
        const { a: s } = pairOf(frame);
        assert.ok(!(s.lHand.y < s.head.y && s.lHand.x > s.head.x + 2), `${label}@${fps}: the hand goes up in front of the face`);
      }
    }
  }
});
