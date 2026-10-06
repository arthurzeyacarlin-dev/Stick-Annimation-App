import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { STAND } from "../rig.ts";
import { fall, getUp } from "./fall.ts";
import { buildGait } from "./gait.ts";
import type { MoveSettings } from "./motion.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type Action } from "./plan.ts";
import { sitDown, standUp } from "./sit.ts";
import { allSettings, armPathProblems, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// SPEC-0017 Phase 2, round 4 (Arthur): falling follows the weight. Moving, there is no stop and no wobble:
// it trips mid-stride, face-plants and slides; standing still, only a short loss of balance first. A
// backward fall ends lying on the back, never sitting. Getting up is slow (it hurt).

const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
// A running pose with one foot on the floor (what the planner hands over mid-stride).
const RUN = buildGait({ kind: "run", startX: 0, distance: 1500, direction: 1, height: TEST_HEIGHT }).keys[21].pose;
const hips = (keys: Parameters<typeof sceneOfKeys>[0], fps = 60) => buildScene(sceneOfKeys(keys), fps).frames.map(([c]) => c.skeleton);

test("moving fall: the hips keep going forward (no stop and restart) until the slide ends", () => {
  for (const speed of [300, 600, 900, 1200]) for (const pose of [STAND, RUN]) {
    const out = fall({ ...startStance(), pose }, { direction: "forward", speed }, NATURAL);
    const frames = hips(out.keys);
    const impact = Math.round(out.marks.impact * 60);
    for (let i = 2; i < frames.length; i += 1) assert.ok(frames[i].hip.x >= frames[i - 1].hip.x - 0.01, `${speed}: hips went back at frame ${i}`);
    // Before the hit there is no pause: the hips move on every frame.
    for (let i = 2; i <= impact; i += 1) assert.ok(frames[i].hip.x - frames[i - 1].hip.x > 0.2, `${speed}: hips stopped at frame ${i} before the impact`);
    // Time to the hit comes from gravity: well under half a second when running.
    if (speed >= 600) assert.ok(out.marks.impact < 0.55, `${speed}: hits the floor after ${out.marks.impact.toFixed(2)}s`);
  }
});

test("slide length grows with speed", () => {
  const slide = (speed: number) => {
    const out = fall({ ...startStance(), pose: RUN }, { direction: "forward", speed }, NATURAL);
    const frames = hips(out.keys);
    return frames[frames.length - 1].hip.x - frames[Math.round(out.marks.impact * 60)].hip.x;
  };
  const s = [300, 600, 900, 1200].map(slide);
  for (let i = 1; i < s.length; i += 1) assert.ok(s[i] > s[i - 1], `slides ${s.map((v) => v.toFixed(0)).join(", ")} px`);
  assert.ok(s[3] > 100, `a sprint slides a good way (${s[3].toFixed(0)}px)`);
});

test("a backward fall ends lying on the back (torso near flat, hips on the floor), never resting seated", () => {
  for (const speed of [0, 600]) {
    const out = fall(startStance(), { direction: "back", speed }, NATURAL);
    const frames = hips(out.keys, 24);
    const end = frames[frames.length - 1];
    const tilt = (Math.atan2(Math.abs(end.neck.y - end.hip.y), Math.abs(end.neck.x - end.hip.x)) * 180) / Math.PI;
    assert.ok(tilt < 15, `${speed}: torso ${tilt.toFixed(0)} deg from flat`);
    assert.ok(TEST_GROUND - end.hip.y < 10, `${speed}: hips on the floor`);
    assert.ok(end.neck.x < end.hip.x, `${speed}: lying on the back (head behind)`);
    // Seated = hips on the floor with the chest more upright than 45 deg; never for more than a moment.
    let seated = 0, longest = 0;
    for (const s of frames) {
      const upright = Math.abs(s.neck.x - s.hip.x) < Math.abs(s.neck.y - s.hip.y);
      seated = TEST_GROUND - s.hip.y < 12 && upright ? seated + 1 : 0;
      longest = Math.max(longest, seated);
    }
    assert.ok(longest <= 2, `${speed}: seated for ${longest} frames`);
  }
});

test("getting up is slower than the calm stand-up from sitting (it hurt), except a robot", () => {
  for (const settings of allSettings()) {
    for (const direction of ["forward", "back"] as const) {
      const down = fall(startStance(), { direction }, settings);
      const up = getUp(down.end, {}, settings);
      // The calm stand-up: standing up from sitting, natural style, same speed and energy.
      const calmSettings = { ...settings, style: "natural" as const };
      const calm = standUp(sitDown(startStance(), {}, calmSettings).end, {}, calmSettings);
      const getUpTime = up.marks.up - up.keys[0].t, calmTime = calm.marks.up - calm.keys[0].t;
      const slower = 1.5;
      if (settings.style !== "robot") assert.ok(getUpTime > slower * calmTime, `${direction}/${settings.style}/${settings.speed}/${settings.energy}: get up ${getUpTime.toFixed(2)}s vs stand up ${calmTime.toFixed(2)}s`);
      assert.ok(up.flow && up.flow.stance.t === up.marks.up, "getUp flows at up");
      assertNatural(sceneOfKeys(up.keys), `getUp ${direction}/${settings.style}/${settings.speed}/${settings.energy}`);
    }
  }
});

test("standing fall: the loss of balance is short; moving falls have none", () => {
  const still = fall(startStance(), { direction: "forward" }, NATURAL);
  // The wobble = the beats before the trip (both feet still planted).
  const wobble = still.keys.filter((k, i) => i > 0 && (k.contacts ?? []).length === 2);
  const wobbleTime = wobble.length ? wobble[wobble.length - 1].t - still.keys[0].t : 0;
  assert.ok(wobbleTime > 0 && wobbleTime <= 0.35, `wobble ${wobbleTime.toFixed(2)}s`);
  const moving = fall({ ...startStance(), pose: RUN }, { direction: "forward", speed: 700 }, NATURAL);
  assert.equal(moving.keys.filter((k, i) => i > 0 && (k.contacts ?? []).length === 2).length, 0, "no wobble when moving");
});

test("every fall keeps the body rules: every style, both ways, standing and moving, 12 and 24 fps", () => {
  for (const settings of allSettings()) for (const facing of ["right", "left"] as const) for (const direction of ["forward", "back"] as const) {
    for (const [name, pose] of [["stand", STAND], ["run", RUN]] as const) for (const speed of name === "stand" ? [0, 300, 1200] : [300, 600, 900, 1200]) {
      const out = fall({ ...startStance(facing), pose }, { direction, speed }, settings);
      assertNatural(sceneOfKeys(out.keys, facing), `${direction} ${name} ${speed}/${settings.style}/${settings.speed}/${settings.energy}/${facing}`);
    }
  }
});

// ARMS NEVER ROUND THE HEAD (Arthur, round 6: our arms did a 180° turn round the head) and ELBOWS BY THE
// NECK (Arthur, round 7: "Right now the elbow is above his head... The elbow should be right around his
// neck"): from the face, an elbow never goes above the head; when the hands are set to push, they are
// under the chest and the elbows are up and back by the neck (behind it, never in front of it).
test("getting up: the arms never swing round the head or windmill; from the face the elbows stay by the neck (never above the head) and the hands push from under the chest", () => {
  const sign = (facing: "right" | "left") => (facing === "left" ? -1 : 1);
  for (const settings of allSettings()) for (const facing of ["right", "left"] as const) {
    const label = `${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const down = fall(startStance(facing), { direction: "forward" }, settings);
    const up = getUp(down.end, {}, settings);
    const frames = buildScene(sceneOfKeys(up.keys, facing), 24).frames.map(([c]) => c.skeleton);
    for (const [i, s] of frames.entries()) {
      // Low down (the shoulders under a third of the height up), no elbow is above the head.
      if (TEST_GROUND - s.neck.y > 0.33 * TEST_HEIGHT) break;
      const top = s.head.y - 0.07 * TEST_HEIGHT;
      for (const elbow of [s.lElbow, s.rElbow]) {
        const ahead = (elbow.x - s.neck.x) * sign(facing);
        assert.ok(!(elbow.y < top && ahead > 0), `${label}: frame ${i}: an elbow is above the head (${((top - elbow.y) / TEST_HEIGHT).toFixed(2)} x height over it)`);
      }
    }
    // The hands set to push (the lowest the chest gets after propping up): under the chest, elbows up behind the neck.
    const neckH = (k: number) => TEST_GROUND - frames[k].neck.y;
    let top = 0;
    while (top + 1 < frames.length && neckH(top + 1) >= neckH(top)) top += 1;
    let set = top;
    while (set + 1 < frames.length && neckH(set + 1) <= neckH(set)) set += 1;
    const s = frames[set];
    for (const side of ["l", "r"] as const) {
      const elbow = s[`${side}Elbow`], hand = s[`${side}Hand`];
      assert.ok((s.neck.x - hand.x) * sign(facing) > 0, `${label}: the ${side} hand is under the chest (behind the neck)`);
      assert.ok((s.neck.x - elbow.x) * sign(facing) > 0 && elbow.y < s.neck.y, `${label}: the ${side} elbow is up and back by the neck`);
    }
  }
});

test("getting up: the arms never swing round the head or windmill; from the face the hands stay low while the chest is down", () => {
  for (const settings of allSettings()) for (const direction of ["forward", "back"] as const) for (const facing of ["right", "left"] as const) {
    const label = `${direction}/${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const down = fall(startStance(facing), { direction }, settings);
    const up = getUp(down.end, {}, settings);
    for (const fps of [12, 24]) {
      const built = buildScene(sceneOfKeys(up.keys, facing), fps);
      assert.deepEqual(armPathProblems(built.frames, fps), [], `${label}@${fps}`);
      const frames = built.frames.map(([c]) => c.skeleton);
      if (direction !== "forward") continue;
      // While the chest is still down, the hands stay low (they come back the short way, never up over the head).
      const neck0 = frames[0].neck.y;
      for (const s of frames) {
        if (neck0 - s.neck.y > 0.05 * TEST_HEIGHT) break;
        const high = (TEST_GROUND - Math.min(s.lHand.y, s.rHand.y)) / TEST_HEIGHT;
        assert.ok(high < 0.12, `${label}@${fps}: a hand ${high.toFixed(2)} x height above the floor while lying`);
      }
    }
  }
});

test("a slow trip or a fall from a crouch stays under the speed limit, and a backward fall never pitches far forward first", () => {
  const walk = buildGait({ kind: "walk", startX: 0, distance: 600, direction: 1, height: TEST_HEIGHT }).keys;
  const crouch = { ...STAND, lean: 30, lHip: 70, rHip: 70, lKnee: 90, rKnee: 90 };
  for (const settings of allSettings()) for (const [name, pose] of [["walk", walk[3].pose], ["walk2", walk[5].pose], ["crouch", crouch]] as const) for (const speed of [40, 113, 200]) {
    for (const direction of ["forward", "back"] as const) {
      const out = fall({ ...startStance(), pose }, { direction, speed }, settings);
      assertNatural(sceneOfKeys(out.keys), `${direction} ${name} ${speed}/${settings.style}/${settings.speed}/${settings.energy}`);
      if (direction === "back") for (const key of out.keys) assert.ok(key.pose.lean - pose.lean <= 11, `${name} ${speed}: leans ${(key.pose.lean - pose.lean).toFixed(0)} degrees forward before falling back`);
    }
  }
});

// Round 7 (Arthur): ACCIDENTS HAVE A CAUSE, NO UNNECESSARY KEY POSES, EYES ON THE INJURY.
const planOf = (actions: Action[], style = "natural" as MoveSettings["style"], facing: "left" | "right" = "right") =>
  planToScene({ id: "t", title: "t", height: TEST_HEIGHT, groundY: TEST_GROUND, characters: [{ id: "a", x: 960, facing, style, actions }] }, LIBRARY);

test("an unaimed fall from standing is an accident: a step or two first, then a trip mid-step (a fall with a direction falls where it stands)", () => {
  for (const style of ["natural", "robot", "tired", "angry"] as const) for (const facing of ["right", "left"] as const) {
    const sign = facing === "left" ? -1 : 1;
    const accident = planOf([{ move: "stand", params: { seconds: 0.3 } }, { move: "fallDown" }, { move: "getUp" }], style, facing);
    const keys = accident.characters[0].keys, impact = accident.marks["a.impact"];
    const before = keys.filter((k) => k.t > 0.3 && k.t < impact);
    const lifts = before.filter((k, i) => i > 0 && (k.contacts ?? []).length === 1 && (before[i - 1].contacts ?? []).length === 2).length;
    assert.ok(lifts >= 2, `${style}/${facing}: steps before the fall (${lifts} foot lifts)`);
    const walked = (keys.find((k) => k.t >= impact)!.x - 960) * sign;
    assert.ok(walked > 0.5 * TEST_HEIGHT, `${style}/${facing}: it walked and tripped forward (${walked.toFixed(0)} px)`);
    assertNatural(accident, `accident ${style}/${facing}`);
    for (const fps of [12, 24]) assert.deepEqual(armPathProblems(buildScene(accident, fps).frames, fps), [], `accident ${style}/${facing}@${fps}`);
    // Asked to fall (a direction), it falls where it stands: no walking first.
    const asked = planOf([{ move: "fallDown", params: { direction: "forward" } }], style, facing);
    const lifted = asked.characters[0].keys.filter((k) => k.t < asked.marks["a.impact"] && (k.contacts ?? []).length === 1 && Math.abs(k.x - 960) < 1).length;
    assert.ok(asked.marks["a.impact"] < (accident.marks["a.impact"] - 0.3) && lifted <= 1, `${style}/${facing}: an aimed fall doesn't walk first`);
  }
});

test("getting up to sit down: no standing pose in between (it gets up only part way), and the hurt sit looks at its knee", () => {
  for (const style of ["natural", "tired", "angry", "robot"] as const) for (const direction of ["forward", "back"] as const) {
    const label = `${style}/${direction}`;
    const scene = planOf([{ move: "fallDown", params: { direction } }, { move: "getUp" }, { move: "sit" }], style);
    assertNatural(scene, label);
    const frames = buildScene(scene, 24).frames.map(([c]) => c.skeleton);
    const from = Math.round(scene.marks["a.down"] * 24), to = Math.round(scene.marks["a.seated"] * 24);
    const highest = Math.max(...frames.slice(from, to).map((s) => (TEST_GROUND - s.hip.y) / TEST_HEIGHT));
    // (Standing hips are 0.46 x height up, nearly standing 0.44; kneeling and crouching stay near 0.3 or under.)
    assert.ok(highest < 0.36, `${label}: the hips never come up near standing between lying and sitting (${highest.toFixed(2)} x height up)`);
    // Hurt (it fell): sitting, it leans over its knee and looks at it, both hands on it.
    const s = frames[to];
    const knee = s.lKnee;
    assert.ok(knee.x > s.neck.x && knee.y > s.head.y, `${label}: the knee is in front of and below the eyes`);
    for (const hand of [s.lHand, s.rHand]) assert.ok(Math.hypot(hand.x - knee.x, hand.y - knee.y) < 0.09 * TEST_HEIGHT, `${label}: a hand holds the knee`);
    const lean = Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y) * 180 / Math.PI;
    assert.ok(lean > 12, `${label}: leans over the knee (${lean.toFixed(0)} degrees)`);
    const look = Math.atan2(s.head.x - s.neck.x, s.neck.y - s.head.y) * 180 / Math.PI;
    assert.ok(look > lean + 15, `${label}: the head is turned down toward the knee (${look.toFixed(0)} vs body ${lean.toFixed(0)})`);
  }
});

// (The push itself no longer skids a foot — the body leaves the floor. NOT YET: the one stumble step before the fall still
// slips a foot 1-6 px as it lifts and lands — stumble() in hit.ts.)
for (const [id, todo] of [["swordFight", "the stumble step before the fall still slips a foot 1-3 px (stumble in hit.ts)"], ["elementalFight", "the stumble step before the fall still drags a foot 1-6 px (stumble in hit.ts)"]] as const) test(`a KNOCK-DOWN throws the body off its feet: no foot skids along the floor while the push carries it back (12 and 24 fps): ${id}`, { todo }, async () => {
  const { buildScene } = await import("../engine.ts");
  const { effectsTestScenes, makeEffectsTestScene } = await import("./tests2c.ts");
  const skids: string[] = [];
  {
    const entry = effectsTestScenes().find((e) => e.id === id)!;
    const scene = { ...makeEffectsTestScene(entry.plan!, 1920), stageWidth: 1920 };
    const down = Object.entries(scene.marks ?? {}).filter(([name]) => name.endsWith(".knockdown")).map(([, t]) => t as number);
    assert.ok(down.length > 0, `${id} has a knock-down`);
    for (const fps of [12, 24]) {
      const b = buildScene(scene, fps), g = scene.groundY;
      for (let i = 1; i < b.frames.length; i++) {
        const t = i / fps;
        if (!down.some((d) => t >= d && t <= d + 0.8)) continue;
        b.frames[i].forEach((c, ci) => {
          const p = b.frames[i - 1][ci]?.skeleton, q = c.skeleton, H = c.skeleton.hip ? (scene.characters[ci].height ?? 300) : 300;
          if (!p || g - p.hip.y < 0.38 * H || g - q.hip.y < 0.38 * H) return;
          for (const f of ["lFoot", "rFoot"] as const) if (Math.abs(p[f].y - g) < 2 && Math.abs(q[f].y - g) < 2 && Math.abs(q[f].x - p[f].x) > 1) skids.push(`${id} ${c.id}.${f} skids ${Math.abs(q[f].x - p[f].x).toFixed(1)} px at ${t.toFixed(2)} s @${fps}`);
        });
      }
    }
  }
  assert.deepEqual(skids, []);
});
