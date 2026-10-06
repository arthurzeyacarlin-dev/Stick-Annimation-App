import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, momentTimes, type Scene } from "../engine.ts";
import { DEFAULT_STYLE, STAND, type Facing } from "../rig.ts";
import { blastHurt, blastPush, blastReaction, BLOWN_POSES, blownAway, STARTLE, THROWN_AT, type BlownAwayParams } from "./blownAway.ts";
import { FALLEN_BACK, getUp } from "./fall.ts";
import { HURT_STYLE_AT } from "./hit.ts";
import { hardBackLanding } from "./liftSlam.ts";
import { naturalWalkPace } from "./gait.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { surprisePlan } from "./tests.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import type { MoveSettings } from "./motion.ts";

// BLOWN AWAY (blownAway.ts): a blast close by throws a figure away from it like a rag doll.
const H = TEST_HEIGHT;
const SET: MoveSettings = { height: H, style: "natural", speed: "normal", energy: 0.5 };
const T0 = 0.3;

function sceneOf(facing: Facing, params: BlownAwayParams, x = 960, settings = SET): { scene: Scene; marks: Record<string, number>; endX: number } {
  const out = blownAway({ t: T0, x, facing, pose: STAND }, params, settings);
  const end = out.keys[out.keys.length - 1].t;
  const scene: Scene = {
    id: "ba", title: "ba", durationSec: Math.ceil((end + 0.2) * 10) / 10, groundY: TEST_GROUND,
    characters: [{ id: "a", name: "A", facing, height: H, style: DEFAULT_STYLE, keys: [{ t: 0, pose: STAND, x, lift: 0, contacts: ["lFoot", "rFoot"] }, ...out.keys] }],
    marks: Object.fromEntries(Object.entries(out.marks).map(([k, v]) => [`a.blownAway1.${k}`, v])),
  };
  return { scene, marks: out.marks, endX: out.end.x };
}
const hipAt = (scene: Scene, fps: number) => buildScene(scene, fps).frames.map((f) => f[0].skeleton.hip);

test("blownAway: registered, never in the random solo combos (old seeds stay the same)", () => {
  assert.ok(LIBRARY.blownAway && LIBRARY.blownAway.about.includes("blast"));
  for (let seed = 1; seed <= 40; seed += 1) {
    const plan = surprisePlan(seed, { style: "natural", speed: "normal", energy: 0.5, direction: 1 });
    assert.ok(plan.characters.every((c) => c.actions.every((a) => a.move !== "blownAway")), `seed ${seed}`);
  }
});

test("blownAway: a very fast launch, slowing to the top, then falling faster and faster (gravity)", () => {
  for (const facing of ["right", "left"] as const) {
    const { scene, marks } = sceneOf(facing, { from: { x: 1060 }, strength: 1 });
    const fps = 24, hips = hipAt(scene, fps);
    const i0 = Math.ceil(marks.blast * fps), iLand = Math.floor(marks.land * fps);
    // Launch: the first 3 pictures after the blast, hip speed far above walking speed.
    const pace = naturalWalkPace("natural", "normal", 0.5), walk = (pace.stepLength / pace.stepSeconds) * H;
    const launch = Math.hypot(hips[i0 + 3].x - hips[i0].x, hips[i0 + 3].y - hips[i0].y) / (3 / fps);
    assert.ok(launch > 2 * walk, `${facing}: launch ${launch.toFixed(0)} px/s vs walk ${walk.toFixed(0)} px/s`);
    // Vertical speed (up +) per picture through the flight: up, slowing, turns over, then down faster and faster.
    const vy: number[] = [];
    for (let i = i0 + 2; i < iLand; i += 1) vy.push((hips[i - 1].y - hips[i].y) * fps);
    assert.ok(vy[0] > 0 && vy[vy.length - 1] < 0, `${facing}: rises then falls (${vy[0].toFixed(0)} .. ${vy[vy.length - 1].toFixed(0)})`);
    const top = vy.findIndex((v) => v <= 0);
    for (let k = 1; k < top; k += 1) assert.ok(vy[k] < vy[k - 1] + 1, `${facing}: slows on the way up (picture ${k})`);
    for (let k = top + 1; k < vy.length; k += 1) assert.ok(vy[k] < vy[k - 1] + 1, `${facing}: falls faster and faster (picture ${k}: ${vy[k].toFixed(0)} after ${vy[k - 1].toFixed(0)})`);
    assert.ok(-vy[vy.length - 1] > 3 * Math.abs(vy[top] ?? 0) + 200, `${facing}: hits the floor fast`);
  }
});

test("blownAway: airborne in a C — hips leading away from the blast, hands and feet trailing toward it — never turned round, always away from the blast", () => {
  for (const facing of ["right", "left"] as const) for (const blastX of [1060, 860]) {
    const { scene, marks } = sceneOf(facing, { from: { x: blastX }, strength: 1 });
    const away = Math.sign(960 - blastX);
    const built = buildScene(scene, 24);
    const label = `${facing} blast ${blastX}`;
    // The C: from the shove's end until over the top.
    let checked = 0;
    built.frames.forEach((f, i) => {
      const t = i / 24;
      if (t < marks.fastTo || t > marks.peak) return;
      const s = f[0].skeleton;
      const ahead = (p: { x: number }) => (s.hip.x - p.x) * away;
      assert.ok(ahead(s.neck) > 0, `${label} ${t.toFixed(2)}: hips ahead of the shoulders`);
      for (const j of ["lFoot", "rFoot", "lHand", "rHand"] as const) assert.ok(ahead(s[j]) > 0, `${label} ${t.toFixed(2)}: ${j} trails toward the blast`);

      checked += 1;
    });
    assert.ok(checked >= 3, `${label}: the C is seen (${checked} pictures)`);
    // NEVER TURNED ROUND: the same facing in every picture, whichever way it faces the blast.
    assert.ok(built.frames.every((f) => f[0].facing === facing), `${label}: turned round`);
    assert.ok(scene.characters[0].keys.every((k) => (k.facing ?? facing) === facing), `${label}: a key turns it`);
    // Flies away from the blast.
    const hips = built.frames.map((f) => f[0].skeleton.hip);
    assert.ok((hips[Math.round(marks.land * 24)].x - 960) * away > 0.8 * H, `${label}: thrown away from the blast`);
  }
});

test("blownAway: lands on the floor (nothing through it), no joint jumps outside the FAST SPAN, the same at 8/12/24 fps", () => {
  const report: string[] = [];
  for (const facing of ["right", "left"] as const) for (const strength of [0.6, 1, 2]) {
    const { scene, marks } = sceneOf(facing, { from: { x: 1040 }, strength });
    const landHip: { x: number; y: number }[] = [];
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      const r = built.report.characters[0];
      const label = `${facing} strength ${strength} @${fps}`;
      assert.equal(r.belowGroundFrames, 0, `${label}: through the floor`);
      assert.ok(r.maxBoneErrorPx <= 0.5, `${label}: bones`);
      assert.ok(r.maxJointStepPx < 2880 / fps, `${label}: a joint jumped ${r.maxJointStepPx.toFixed(0)} px outside the fast span`);
      assert.ok(r.maxFastStepPx > 0 && r.maxFastStepPx < (4 * 2880) / fps, `${label}: fast span ${r.maxFastStepPx.toFixed(0)} px`);
      report.push(`${label}: step ${r.maxJointStepPx.toFixed(0)} / fast ${r.maxFastStepPx.toFixed(0)}`);
      // On the floor at the landing: a picture right on it (moments show), the lowest point on the ground.
      // THE CRASH IS SEEN: a picture shows the body on the floor at the landing (the hit-stop holds it there a
      // twelfth of a second; below 12 fps the engine also puts a picture within 1/48 s of the landing).
      const times = momentTimes(scene, fps);
      const onFloor = built.frames.some((f, k) => {
        if (times[k] < marks.land - 1 / 48 - 1e-6 || times[k] > marks.land + 1 / 12 + 1e-6) return false;
        const s = f[0].skeleton;
        return Math.abs(Math.max(s.hip.y, s.neck.y, s.lKnee.y, s.rKnee.y, s.lFoot.y, s.rFoot.y, s.head.y + 0.07 * H) - TEST_GROUND) < 0.07 * H;
      });
      assert.ok(onFloor, `${label}: a picture shows the crash on the floor`);
      landHip.push(buildScene(scene, fps).frames[built.frames.length - 1][0].skeleton.hip);
    }
    // Same timing and the same place whatever the frame rate.
    for (const p of landHip) assert.ok(Math.abs(p.x - landHip[2].x) < 1 && Math.abs(p.y - landHip[2].y) < 1, `${facing} ${strength}: same end at every fps`);
  }
  console.log(report.join("\n"));
});

test("blownAway: stronger or closer = thrown farther; weak or far = only a flinch (feet stay down)", () => {
  const travel = (blastX: number, strength: number) => { const { scene, marks } = sceneOf("right", { from: { x: blastX }, strength, getUp: false }); const hips = hipAt(scene, 24); return { d: Math.abs(hips[hips.length - 1].x - 960), marks }; };
  const near = travel(1040, 1), mid = travel(1200, 1), strong = travel(1200, 2);
  assert.ok(near.d > mid.d + 0.2 * H, `closer = farther (${near.d.toFixed(0)} vs ${mid.d.toFixed(0)})`);
  assert.ok(strong.d > mid.d + 0.2 * H, `stronger = farther (${strong.d.toFixed(0)} vs ${mid.d.toFixed(0)})`);
  // A stronger blast throws from farther away.
  assert.equal(blastReaction(blastPush(1, 2 * H, 0.46 * H, H)), "stagger");
  assert.equal(blastReaction(blastPush(3, 2 * H, 0.46 * H, H)), "thrown");
  assert.ok(blastPush(1, 0.2 * H, 0, H) >= THROWN_AT);
  for (const [blastX, strength] of [[1700, 1], [1080, 0.25]] as const) {
    const { scene, marks, endX } = sceneOf("right", { from: { x: blastX }, strength });
    assert.ok(marks.land === undefined && marks.react !== undefined, `${blastX}/${strength}: only a flinch`);
    assert.equal(endX, 960);
    const built = buildScene(scene, 24);
    const lifted = built.frames.some((f) => Math.min(f[0].skeleton.lFoot.y, f[0].skeleton.rFoot.y) < TEST_GROUND - 2);
    assert.ok(!lifted, `${blastX}/${strength}: the feet stay on the floor`);
    assert.ok(built.report.characters[0].maxFootDriftPx <= 1 && built.report.characters[0].maxJointStepPx < 120);
  }
});

test("blownAway: stays on the page (flies less near the edge), stays down when asked, gets up groggy by default", () => {
  for (const [x, blastX] of [[300, 400], [1620, 1520]] as const) {
    const { scene } = sceneOf("right", { from: { x: blastX }, strength: 2 }, x);
    for (const f of buildScene(scene, 24).frames) for (const p of Object.values(f[0].skeleton)) assert.ok(p.x > 0 && p.x < 1920, `x ${x}: on the page (${p.x.toFixed(0)})`);
  }
  const down = sceneOf("right", { from: { x: 1040 }, getUp: false });
  assert.ok(down.marks.still !== undefined && down.marks.up === undefined);
  const up = sceneOf("right", { from: { x: 1040 } });
  assert.ok(up.marks.up > up.marks.still + 0.9 && up.marks.ready >= up.marks.up, "lies still about a second, then gets up");
  const last = up.scene.characters[0].keys[up.scene.characters[0].keys.length - 1];
  assert.ok(last.pose.lean > 10 && (last.contacts ?? []).length === 2, "ends standing, hunched (hurt)");
});

test("blownAway: in a plan — timed to a blast with sync, the blast point from another figure's hand, page fit", () => {
  const plan: ScenePlan = {
    id: "g", title: "grenade", height: H, groundY: TEST_GROUND, stageWidth: 1920,
    characters: [
      { id: "b", x: 700, facing: "right", actions: [{ move: "wait", params: { seconds: 0.8 } }] },
      { id: "a", x: 900, facing: "left", actions: [{ move: "blownAway", params: { from: "b.rHand", strength: 1.2 }, sync: { mark: "blast", at: "b.wait1.end", offset: 0 } }] },
    ],
  };
  const scene = planToScene(plan, LIBRARY);
  assert.ok(scene.marks["a.blownAway1.land"] > scene.marks["a.blownAway1.blast"]);
  const built = buildScene(scene, 12);
  const a = built.report.characters.find((r) => r.id === "a")!;
  assert.equal(a.belowGroundFrames, 0);
  const hips = built.frames.map((f) => f.find((c) => c.id === "a")!.skeleton.hip);
  assert.ok(hips[Math.round(scene.marks["a.blownAway1.land"] * 12)].x > 900 + 0.5 * H, "thrown away from b's hand (to the right)");
});

test("blownAway: HARD LANDING — full speed into the floor, the shared slam landing (jolt, the back arches and eases straight)", () => {
  for (const facing of ["right", "left"] as const) {
    const { scene, marks } = sceneOf(facing, { from: { x: 1060 }, strength: 1 });
    // No slowing before contact: the hips drop faster every picture right up to the floor (24 fps).
    const hips = hipAt(scene, 24), iLand = Math.floor(marks.land * 24 + 1e-6);
    const drops = [];
    for (let i = Math.ceil(marks.peak * 24) + 1; i <= iLand; i += 1) drops.push(hips[i].y - hips[i - 1].y);
    for (let k = 1; k < drops.length; k += 1) assert.ok(drops[k] > drops[k - 1] - 0.5, `${facing}: slows before the floor (${drops.map((d) => d.toFixed(0)).join(",")})`);
    assert.ok(drops[drops.length - 1] >= Math.max(...drops) - 0.5, `${facing}: the fastest drop is the last one before contact`);
    // The shared landing (liftSlam.ts hardBackLanding) is what happens after the impact: the same poses.
    const keys = scene.characters[0].keys;
    const iImpact = keys.findIndex((k) => Math.abs(k.t - marks.land) < 1e-9);
    const shared = hardBackLanding({ t: marks.land, x: keys[iImpact].x, facing, pose: keys[iImpact].pose }, FALLEN_BACK, facing === "right" ? -1 : 1, SET);
    shared.keys.slice(1).forEach((k, j) => assert.deepEqual(keys[iImpact + 1 + j].pose, k.pose, `${facing}: landing key ${j} is the slam's`));
    // (Facing the blast it was thrown backward; its back to it, forward — never turned round.)
    assert.deepEqual(keys[iImpact].pose, (facing === "right" ? BLOWN_POSES.BACKWARD : BLOWN_POSES.FORWARD).IMPACT);
    // At 12 fps: on the floor at the hit, a jolt (bounced up), the back ARCHED (neck below the hips), easing
    // straight within 4-5 pictures.
    const fps = 12, frames = buildScene(scene, fps).frames, times = momentTimes(scene, fps);
    const after = frames.map((f, i) => ({ t: times[i], s: f[0].skeleton })).filter(({ t }) => t >= marks.land - 1 / fps && t <= marks.land + 0.8);
    const rest = TEST_GROUND - after[after.length - 1].s.hip.y;
    const arch = after.map(({ s }) => s.neck.y - s.hip.y);
    const top = arch.indexOf(Math.max(...arch));
    assert.ok(arch[top] > 0.015 * H, `${facing}: the back arches on the impact (${arch[top].toFixed(1)} px)`);
    assert.ok(top <= 3, `${facing}: the arch comes with the impact (picture ${top})`);
    const straight = arch.findIndex((a, k) => k > top && a <= 0.005 * H);
    assert.ok(straight > top && straight - top <= 5, `${facing}: the arch eases straight within 5 pictures (${arch.map((a) => a.toFixed(0)).join(",")})`);
    for (let k = top + 1; k <= straight; k += 1) assert.ok(arch[k] <= arch[k - 1] + 0.5, `${facing}: the arch eases out steadily`);
    const jolt = Math.max(...after.map(({ s }) => TEST_GROUND - s.hip.y - rest).slice(1, 5));
    assert.ok(jolt >= 0.04 * H && jolt <= 0.15 * H, `${facing}: a small jolt up off the floor (${jolt.toFixed(0)} px)`);
  }
});

test("blownAway: HURT AFTER A BIG HIT — a slow struggle up (sits up, sags back, tries again) and a hunched, swaying hurt stance; a stagger doesn't", () => {
  const { scene, marks } = sceneOf("right", { from: { x: 1060 }, strength: 1 });
  // Longer than the normal (hurt-timed) get-up from the back, with a sag in it.
  const normal = getUp({ t: 0, x: 0, facing: "right", pose: FALLEN_BACK }, { direction: "back" }, SET);
  const struggle = marks.ready - marks.still - 1; // (less the second lying still)
  assert.ok(struggle > normal.end.t + 1, `struggle ${struggle.toFixed(2)} s vs normal get-up ${normal.end.t.toFixed(2)} s`);
  assert.ok(marks.sag > marks.still && marks.sag < marks.up, "a sag before it gets up");
  const fps = 24, frames = buildScene(scene, fps).frames;
  const neckAt = (t: number) => frames[Math.round(t * fps)][0].skeleton.neck.y;
  assert.ok(neckAt(marks.sag) > neckAt(marks.sag - 0.4) + 0.05 * H, "it sags back down (the chest drops)");
  // Stands hurt: hunched, the hips lower than standing tall, swaying.
  const standHip = buildScene({ ...scene, characters: [{ ...scene.characters[0], keys: [{ t: 0, pose: STAND, x: 960, lift: 0 }] }], durationSec: 0.1 }, 24).frames[0][0].skeleton.hip.y;
  const tail = frames.filter((_, i) => i / fps >= marks.up + 0.3 && i / fps <= marks.ready).map((f) => f[0].skeleton);
  const leanOf = (s: (typeof tail)[number]) => (Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y) * 180) / Math.PI;
  const end = tail[tail.length - 1];
  assert.ok(leanOf(end) > 10 && end.hip.y > standHip + 0.02 * H, `hunched (${leanOf(end).toFixed(0)} deg) and low (${(end.hip.y - standHip).toFixed(0)} px)`);
  const leans = tail.map(leanOf);
  assert.ok(Math.max(...leans) - Math.min(...leans) > 4, "it sways");
  // The planner keeps it hurt afterwards (the hurt style from HURT_STYLE_AT); a stagger doesn't.
  assert.ok(blastHurt(blastPush(1, 100, 0.46 * H, H)) >= HURT_STYLE_AT);
  const plan = (x: number): ScenePlan => ({ id: "h", title: "h", height: H, groundY: TEST_GROUND, stageWidth: 1920, characters: [{ id: "a", x, facing: "right", actions: [{ move: "blownAway", params: { from: { x: 1100 }, strength: 1 } }, { move: "walk", params: { distance: 200 } }] }] });
  assert.ok(planToScene(plan(1000), LIBRARY).hurt.a >= HURT_STYLE_AT, "thrown: hurt for what follows");
  const staggered = planToScene(plan(1100 - 1.6 * H), LIBRARY);
  assert.ok(staggered.marks["a.blownAway1.land"] === undefined && (staggered.hurt.a ?? 0) < HURT_STYLE_AT, "a stagger: not the hurt style");
  const st = sceneOf("right", { from: { x: 960 + 1.6 * H }, strength: 1 });
  assert.equal(blastReaction(blastPush(1, 1.6 * H, 0.46 * H, H)), "stagger");
  assert.ok(st.marks.sag === undefined && st.marks.up === undefined, "a stagger has no struggle");
});

test("blownAway: STARTLE (far blast) — hands up fast but visibly, held, down slowly while it keeps watching the blast", () => {
  for (const [blastX, strength] of [[1700, 1], [1560, 1], [1080, 0.25]] as const) {
    const { scene, marks } = sceneOf("right", { from: { x: blastX }, strength });
    const label = `${blastX}/${strength}`;
    const raise = marks.react - marks.blast, lower = marks.ready - marks.watch;
    assert.ok(raise >= 0.15, `${label}: hands up in ${raise.toFixed(2)} s (a snap)`);
    assert.ok(lower >= 3 * raise && lower >= STARTLE.lower - 1e-6, `${label}: hands down in ${lower.toFixed(2)} s`);
    for (const fps of [12, 24]) {
      const frames = buildScene(scene, fps).frames, times = momentTimes(scene, fps);
      const up = frames.filter((_, i) => times[i] > marks.blast + 1e-6 && times[i] <= marks.react + 1e-6).length;
      if (fps === 12) assert.ok(up >= 2, `${label}: the raise is seen in ${up} picture(s) at 12 fps`);
      // Watching: the face toward the blast, the head aimed at the fireball, all the way down.
      const look = (Math.atan2(0.93 * H - 0.6 * H, Math.max(0.3 * H, Math.abs(blastX - 960))) * 180) / Math.PI;
      // (A far blast — a small bang close by is too low to watch without bending: only the far ones.)
      if (Math.abs(blastX - 960) >= 1.5 * H) frames.forEach((f, i) => {
        if (times[i] < marks.watch - 1e-6 || times[i] > marks.ready + 1e-6) return;
        const s = f[0].skeleton;
        assert.equal(f[0].facing, "right");
        const aim = (Math.atan2(s.head.x - s.neck.x, s.neck.y - s.head.y) * 180) / Math.PI;
        assert.ok(Math.abs(aim - look) < 12, `${label}@${fps} ${times[i].toFixed(2)}: the head looks ${aim.toFixed(0)} deg, the blast is at ${look.toFixed(0)}`);
      });
      const hands = (i: number) => Math.min(frames[i][0].skeleton.lHand.y, frames[i][0].skeleton.rHand.y);
      const iw = times.findIndex((t) => t >= marks.watch - 1e-6), ir = times.findIndex((t) => t >= marks.ready - 1e-6);
      assert.ok(hands(iw) < frames[iw][0].skeleton.neck.y, `${label}: hands up at the face`);
      assert.ok(hands(ir) > frames[ir][0].skeleton.hip.y - 0.1 * H, `${label}: hands down at the end`);
    }
  }
});

// NO UNNEEDED POSES: a neutral upright stand (the spine within 3 degrees of upright, both hands down at the sides).
const neutralStand = (s: { hip: { x: number; y: number }; neck: { x: number; y: number }; lHand: { x: number; y: number }; rHand: { x: number; y: number } }) => {
  const lean = Math.abs((Math.atan2(s.neck.x - s.hip.x, s.hip.y - s.neck.y) * 180) / Math.PI);
  const handsDown = [s.lHand, s.rHand].every((h) => h.y > s.hip.y - 0.12 * H && Math.abs(h.x - s.hip.x) < 0.12 * H);
  return lean < 3 && handsDown && s.hip.y < TEST_GROUND - 0.4 * H;
};
test("NO UNNEEDED POSES: a get-up flows straight into the hurt stance — never a normal stand first", () => {
  for (const facing of ["right", "left"] as const) {
    const { scene, marks } = sceneOf(facing, { from: { x: facing === "right" ? 1060 : 860 }, strength: 1 });
    for (const fps of [12, 24]) {
      const frames = buildScene(scene, fps).frames;
      frames.forEach((f, i) => {
        const t = i / fps;
        if (t < marks.still || t > marks.ready) return;
        assert.ok(!neutralStand(f[0].skeleton), `${facing}@${fps} ${t.toFixed(2)}: a neutral stand between the get-up and the hurt stance`);
      });
    }
  }
  // (Other get-ups followed by a styled move: the planner flows from the get-up's own "up" pose, never a stand.)
  for (const style of ["hurt", "tired", "angry"] as const) {
    const plan: ScenePlan = { id: "g", title: "g", height: H, groundY: TEST_GROUND, characters: [{ id: "a", x: 900, facing: "right", actions: [{ move: "fallDown", params: { direction: "back" } }, { move: "getUp" }, { move: "walk", params: { distance: 300 }, style }] }] };
    const scene = planToScene(plan, LIBRARY);
    // (From the get-up's "up" into the walk's first steps: the walk's own stop at the end is another matter.)
    const up = scene.marks["a.getUp1.up"];
    const frames = buildScene(scene, 24).frames;
    frames.forEach((f, i) => {
      const t = i / 24;
      if (t < up - 0.3 || t > up + 1.2) return;
      assert.ok(!neutralStand(f[0].skeleton), `getUp → ${style} walk ${t.toFixed(2)}: a neutral stand in between`);
    });
  }
});
