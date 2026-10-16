import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// PULLING LOOKS STRONG (Arthur, Oct 14): feet planted, knees bent, both hands on the rope in front, leaning back, heaves with
// the arms bending in, a small tremble while straining; the loser is dragged forward, the winner gains ground — on the same beat.

const H = TEST_HEIGHT;
const tug = (energy = 0.7): ScenePlan => ({
  id: "t", title: "t", height: H, groundY: TEST_GROUND,
  characters: [
    { id: "a", x: 780, facing: "right", energy, actions: [{ move: "pull", params: { role: "win", heaves: 3 } }] },
    { id: "b", x: 1150, facing: "left", energy: 0.4, actions: [{ move: "pull", params: { role: "lose", heaves: 3 } }] },
  ],
});

test("pull: planted feet, bent knees, hands together in front at rope height, leaning back, small fast tremble", () => {
  for (const role of ["even", "win", "lose"]) for (const facing of ["right", "left"] as const) for (const hands of ["chest", "waist", "low"]) {
    const label = `${role} ${facing} ${hands}`;
    const plan: ScenePlan = { id: "t", title: "t", height: H, groundY: TEST_GROUND, characters: [{ id: "a", x: 960, facing, actions: [{ move: "pull", params: { role, hands } }] }] };
    for (const fps of [12, 24]) {
      const built = buildScene(planToScene(plan, LIBRARY), fps);
      const r = built.report.characters[0];
      assert.ok(r.maxBoneErrorPx <= 0.5, `${label}@${fps}: bones ${r.maxBoneErrorPx.toFixed(2)}`);
      assert.ok(r.maxFootDriftPx <= 1, `${label}@${fps}: a planted foot slid ${r.maxFootDriftPx.toFixed(2)}`);
      assert.equal(r.belowGroundFrames, 0, `${label}@${fps}: below the floor`);
      const sign = facing === "right" ? 1 : -1;
      let back = 0;
      for (const [i, f] of built.frames.entries()) {
        const s = f[0].skeleton;
        // Both hands together, in front of the chest, below the shoulders (on the rope, never up by the head).
        assert.ok(Math.hypot(s.lHand.x - s.rHand.x, s.lHand.y - s.rHand.y) < 0.13 * H, `${label}@${fps} #${i}: hands together`);
        assert.ok(sign * (s.lHand.x - s.neck.x) > 0.04 * H, `${label}@${fps} #${i}: hands in front`);
        assert.ok(s.lHand.y > s.neck.y - 0.02 * H, `${label}@${fps} #${i}: hands below the shoulders`);
        // Leaning back (the neck behind the hips) and knees bent (the hips lower than standing tall).
        if (sign * (s.neck.x - s.hip.x) < -0.02 * H) back += 1; // (the loser is yanked upright for a moment; the strain lets go at the end)
        assert.ok(TEST_GROUND - s.hip.y < 0.455 * H, `${label}@${fps} #${i}: knees bent`);
        // A wide stance whenever both feet are down.
        if (Math.abs(s.lFoot.y - s.rFoot.y) < 1) assert.ok(Math.abs(s.lFoot.x - s.rFoot.x) > 0.28 * H, `${label}@${fps} #${i}: wide stance`);
      }
      assert.ok(back >= (role === "lose" ? 0.6 : 0.8) * built.frames.length, `${label}@${fps}: leans back (${back}/${built.frames.length})`);
      // The tremble is small: the hand never jumps more than 4% of the height in one 24 fps frame while the feet stay.
      if (fps === 24) for (let i = 1; i < built.frames.length; i += 1) {
        const a = built.frames[i - 1][0].skeleton.lHand, b = built.frames[i][0].skeleton.lHand;
        assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < (role === "even" ? 0.065 : 0.1) * H, `${label} #${i}: hand jump ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(1)}`);
      }
    }
  }
});

test("pull: the arms really pull (hands come in toward the body on a heave) and tremble a hair", () => {
  const built = buildScene(planToScene({ id: "t", title: "t", height: H, groundY: TEST_GROUND, characters: [{ id: "a", x: 960, facing: "right", actions: [{ move: "pull", params: {} }] }] }, LIBRARY), 24);
  const reach = built.frames.map((f) => f[0].skeleton.lHand.x - f[0].skeleton.neck.x);
  assert.ok(Math.max(...reach) - Math.min(...reach) > 0.04 * H, `the arms bend in and out (${(Math.max(...reach) - Math.min(...reach)).toFixed(1)})`);
  // Tremble: the hand changes direction often (a shake), but by little.
  let turns = 0;
  for (let i = 2; i < reach.length; i += 1) if ((reach[i] - reach[i - 1]) * (reach[i - 1] - reach[i - 2]) < 0) turns += 1;
  assert.ok(turns >= 8, `the hands shake while straining (${turns} turns)`);
});

test("pull: winner gains ground, loser is dragged toward it on the same beat; feet never slide", () => {
  const built = buildScene(planToScene(tug(), LIBRARY), 24);
  for (const r of built.report.characters) assert.ok(r.maxFootDriftPx <= 1, `${r.id}: foot slid`);
  const first = built.frames[0], last = built.frames[built.frames.length - 1];
  const moved = (i: number) => last[i].skeleton.hip.x - first[i].skeleton.hip.x;
  assert.ok(moved(0) < -0.2 * H, `the winner (facing right) steps back to the left (${moved(0).toFixed(0)})`);
  assert.ok(moved(1) < -0.2 * H, `the loser (facing left) is dragged left too (${moved(1).toFixed(0)})`);
  // Same beat: the gap between the two hand pairs stays about the same (the rope stays taut, never stretches or slackens much).
  const gap = built.frames.map((f) => f[1].skeleton.lHand.x - f[0].skeleton.rHand.x);
  assert.ok(Math.max(...gap) - Math.min(...gap) < 0.4 * H, `the rope length stays steady (${(Math.max(...gap) - Math.min(...gap)).toFixed(0)})`);
});

test("pull: a rope-holder's custom pull/tug keys become the pull move (dragged = lose, the other side wins); other customs stay", async () => {
  const { pullsFromCustom } = await import("./pullPlan.ts");
  const { ropeTremble } = await import("./transform.ts");
  const key = (dx: number) => ({ pose: { lean: -20 }, dx });
  const shot = {
    groundY: TEST_GROUND, height: H,
    characters: [
      { id: "a", actions: [{ move: "custom", energy: 0.9, params: { name: "big heave back", keys: [key(0), key(-40)], repeat: 4 } }, { move: "celebrate" }] },
      { id: "b", actions: [{ move: "custom", params: { name: "dragged forward", keys: [key(0)] } }] },
      { id: "c", actions: [{ move: "custom", params: { name: "pull the rope", keys: [key(0)] } }] }, // (holds no rope: stays custom)
    ],
    effects: [{ kind: "prop", anchor: { character: "a", joint: "rHand" }, target: { character: "b", joint: "lHand" }, params: { string: true } }],
  };
  const out = pullsFromCustom(shot) as typeof shot;
  const a0 = out.characters[0].actions[0] as { move: string; energy?: number; params: { role: string; heaves: number } };
  assert.equal(a0.move, "pull"); assert.equal(a0.params.role, "win"); assert.equal(a0.params.heaves, 4); assert.equal(a0.energy, 0.9);
  assert.equal(out.characters[0].actions[1].move, "celebrate");
  assert.equal((out.characters[1].actions[0] as { params: { role: string } }).params.role, "lose");
  assert.equal(out.characters[2].actions[0].move, "custom");
  // The taut rope trembles a hair: never more than 3 px, and it does move.
  const v = Array.from({ length: 48 }, (_, i) => ropeTremble(i / 24, 400));
  assert.ok(Math.max(...v.map(Math.abs)) <= 3 && Math.max(...v) - Math.min(...v) > 2, "rope tremble is a hair");
});

test("pull: hands always in FRONT of the body (any rope height), back fist on the rope's line; a losing faller is yanked forward; a let-go rope FALLS", async () => {
  for (const hands of ["chest", "waist", "low"]) for (const facing of ["right", "left"] as const) for (const role of ["even", "win", "lose"]) {
    const plan: ScenePlan = { id: "t", title: "t", height: H, groundY: TEST_GROUND, characters: [{ id: "a", x: 960, facing, actions: [{ move: "pull", params: { role, hands, strength: 1 } }] }] };
    const built = buildScene(planToScene(plan, LIBRARY), 24), sign = facing === "right" ? 1 : -1;
    for (const [i, f] of built.frames.entries()) {
      const s = f[0].skeleton;
      for (const hand of [s.lHand, s.rHand]) {
        // the torso's x at the hand's height (between the hips and the neck): the fist is clearly in front of it
        const k = Math.min(1, Math.max(0, (hand.y - s.hip.y) / (s.neck.y - s.hip.y)));
        assert.ok(sign * (hand.x - (s.hip.x + k * (s.neck.x - s.hip.x))) > 0.05 * H, `${hands} ${facing} ${role} #${i}: a hand is beside/behind the body`);
      }
    }
  }
  // A loser with fall: true ends pitched forward (leaning toward the pull), and pullPlan adds the fall + the winners' huge heave.
  const { pullsFromCustom } = await import("./pullPlan.ts");
  const shot = {
    groundY: TEST_GROUND, height: H,
    characters: [{ id: "a", actions: [{ move: "pull", params: { role: "win" } }, { move: "celebrate" }] }, { id: "b", actions: [{ move: "pull", params: { role: "lose" } }, { move: "fall", params: { direction: "forward" } }] }],
    effects: [{ kind: "prop", anchor: { character: "a", joint: "rHand" }, target: { character: "b", joint: "lHand" }, params: { string: true } }],
  };
  const out = pullsFromCustom(shot) as typeof shot;
  assert.equal((out.characters[1].actions[0].params as { fall?: boolean }).fall, true);
  assert.equal((out.characters[0].actions[0].params as { final?: boolean }).final, true);
  assert.equal(out.characters[1].actions[1].move, "fallDown", "the loser stays down (fall → fallDown unless getUp: true)");
  const built = buildScene(planToScene({ id: "t", title: "t", height: H, groundY: TEST_GROUND, characters: [{ id: "b", x: 1150, facing: "left", actions: [{ move: "pull", params: { role: "lose", fall: true } }, { move: "fall", params: { direction: "forward" } }] }] }, LIBRARY), 24);
  assert.ok(built.report.characters[0].maxFootDriftPx <= 1, `the stumble really steps, no foot slides (${built.report.characters[0].maxFootDriftPx.toFixed(1)})`);
  const lowest = Math.min(...built.frames.map((f) => TEST_GROUND - f[0].skeleton.neck.y));
  assert.ok(lowest < 0.1 * H, `the loser falls to the ground (${lowest.toFixed(0)})`);
  // The let-go rope's free end falls over 0.4–0.7 s, never in one jump.
  const { ropeFall } = await import("./transform.ts");
  const from = { x: 900, y: TEST_GROUND - 0.5 * H }, ground = { x: 900, y: TEST_GROUND };
  assert.equal(ropeFall(0, from, ground, H), 0);
  assert.ok(ropeFall(0.2, from, ground, H) > 0 && ropeFall(0.2, from, ground, H) < 1);
  assert.equal(ropeFall(0.71, from, ground, H), 1);
  assert.equal(ropeFall(0, undefined, ground, H), 1);
});

test("pull: a hauled thing (boat, sled) comes toward a winning puller by the rope gained; a stump stays unless it comesOut", async () => {
  const { pullsFromCustom, haulGain } = await import("./pullPlan.ts");
  const shot = (name: string, extra = {}) => ({
    groundY: TEST_GROUND, height: H,
    characters: [{ id: "s", x: 1200, actions: [{ move: "pull", params: { role: "win", heaves: 4 } }] }],
    effects: [{ kind: "prop", start: -1.5, anchor: { x: 500, y: 860 }, target: { character: "s", joint: "rHand" }, params: { name, string: true, ...extra } }],
  });
  const boat = (pullsFromCustom(shot("rowing boat")) as { effects: { params: { haul?: { t0: number; period: number; heaves: number; step: number; dir: number } } }[] }).effects[0].params.haul!;
  assert.ok(boat && boat.dir === 1 && boat.t0 === 1.5, "the boat is hauled toward the sailor");
  assert.equal(haulGain(1.5, boat), 0);
  const gained = haulGain(1.5 + 4, boat);
  assert.ok(Math.abs(gained - 4 * 0.12 * H) < 1, `it comes the rope gained (${gained.toFixed(0)})`);
  for (let t = 1.5; t < 6; t += 0.05) assert.ok(haulGain(t + 0.05, boat) >= haulGain(t, boat), "never slides back");
  assert.equal((pullsFromCustom(shot("tree stump")) as { effects: { params: { haul?: unknown } }[] }).effects[0].params.haul, undefined);
  assert.ok((pullsFromCustom(shot("tree stump", { comesOut: true })) as { effects: { params: { haul?: unknown } }[] }).effects[0].params.haul);
});
