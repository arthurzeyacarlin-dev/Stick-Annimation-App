import test from "node:test";
import assert from "node:assert/strict";
import { fallHurt, limbsWithSpin, rollTurn, spinLoose, totalTurnCap, tumble, tumblePath, turnCapForDrop, TUMBLE_CONTACT_S } from "./tumble.ts";
import { FALLEN_BACK, FALLEN_FORWARD } from "./fall.ts";
import { STAND } from "../rig.ts";
import { HURT_STYLE_AT } from "./hit.ts";

// A FALLING BODY OBEYS GRAVITY AND HITS WHAT IS IN ITS WAY: off a cliff edge into a pit with rocks staggered left/right on the way down.
test("a tumble zig-zags off each rock (never through one) and lies on the pit floor", () => {
  const H = 150, rock = (cx: number, top: number) => ({ left: cx - 75, right: cx + 75, top, cx });
  const surfaces = [rock(760, -104), rock(1010, -244), rock(800, -374), rock(1090, -480)];
  const { samples, hits } = tumblePath(709, 1, H, { surfaces, pits: [{ left: 700, right: 1900, bottom: -572 }], speed: 135 });
  assert.ok(hits.length >= 3, `hits ${hits.length}`);
  // never inside a rock: a sample over a rock is never below its top while above it a moment before
  for (let i = 1; i < samples.length; i += 1) for (const s of surfaces) {
    const a = samples[i - 1], b = samples[i];
    if (b.x > s.left && b.x < s.right && a.y >= s.top - 1) assert.ok(b.y >= s.top - 1, `through a rock at ${b.t}`);
  }
  // the sideways direction changes (left, right…)
  // (still moments — lying on a rock — don't count as a direction)
  let turns = 0, was = 0;
  for (let i = 1; i < samples.length; i += 1) { const d = Math.sign(Math.round(samples[i].x - samples[i - 1].x)); if (d && was && d !== was) turns += 1; if (d) was = d; }
  assert.ok(turns >= 2, `turns ${turns}`);
  // THE BODY REALLY TOUCHES EACH ROCK — and quickly: impact + crumple ≤ ~0.1 s, then off (Arthur: "the bounce needs to be faster")
  const touches = surfaces.map((s) => samples.filter((p) => p.contact && Math.abs(p.y - s.top) < 1 && p.x > s.left - 15 && p.x < s.right + 15).length);
  assert.ok(touches.filter((n) => n >= 1).length >= 4, `touches ${touches}`);
  assert.ok(touches.every((n) => n <= 3), `no long sit on a rock: ${touches}`);
  const last = samples[samples.length - 1];
  assert.ok(Math.abs(last.y + 572) < 2, `rests on the pit floor (${last.y})`);
  // ENERGY: a bounce never rises back past where the body fell from (here: never back up out of the pit, never above the 1st rock)
  const after1 = samples.filter((p) => p.t > hits[0] + 0.01);
  assert.ok(Math.max(...after1.map((p) => p.y)) < -104 + 0.6 * H, `bounces too high: ${Math.max(...after1.map((p) => p.y)).toFixed(0)}`);
});

// STAIRS (a sequence of learned pieces, DOWN ONTO THE NEXT THING): a body tumbling down stairs lands ON every step in turn (no
// skipping), never goes back into the riser of the step above, and ends lying on open floor past the last step.
test("a tumble down stairs lands on each step in turn and ends past the bottom step", () => {
  const H = 150, steps = [0, 1, 2, 3, 4].map((i) => ({ left: 702 + i * 135, right: 837 + i * 135, top: -78 * (i + 1), cx: 770 + i * 135 }));
  const { samples } = tumblePath(700, 1, H, { surfaces: steps, pits: [{ left: 700, right: 1800, bottom: -475 }], speed: 135 });
  const landed = steps.map((s) => samples.some((p) => p.contact && Math.abs(p.y - s.top) < 1 && p.x >= s.left - 15 && p.x <= s.right + 15));
  assert.deepEqual(landed, [true, true, true, true, true], "lands on every step");
  const last = samples[samples.length - 1];
  assert.ok(last.x > steps[4].right && Math.abs(last.y + 475) < 2, `lies on the floor past the stairs (${last.x.toFixed(0)}, ${last.y.toFixed(0)})`);
});

// REAL FALLING BODIES (Oct 15, Arthur: "a fall, boom, then a forward flip, boom… his legs and arms can't just be SHAKING… going right
// you flip right"): the body turns over AS ONE PIECE (pose lean + whole-body spin = its turn); in each flight it turns at one steady
// speed the way it travels (front flips going the way it faces, back flips going back — never against its travel); only a hit changes
// the turn; every landing is flat (front or back, never head first); in the air the limbs tuck, they never shake; it ends lying flat.
test("a tumble flips for real: steady turn per flight, the way it travels, flat landings, loose limbs, ends lying", () => {
  const H = 150, rock = (cx: number, top: number) => ({ left: cx - 75, right: cx + 75, top, cx });
  const turnOf = (k: { pose: { lean: number }; spin?: number }) => k.pose.lean + (k.spin ?? 0); // (facing right: spin + = forward)
  let flips = 0;
  for (const [surfaces, bottom] of [[[rock(760, -104), rock(1010, -244), rock(800, -374), rock(1090, -480)], -572], [[], -600], [[0, 1, 2, 3].map((i) => ({ left: 702 + i * 135, right: 837 + i * 135, top: -78 * (i + 1), cx: 770 + i * 135 }))  , -400]] as const) {
    const out = tumble({ t: 0, x: 640, facing: "right", pose: STAND }, { speed: 140, surfaces: [...surfaces], pits: [{ left: 700, right: 1900, bottom }] }, { height: H, style: "natural" } as never);
    const ks = out.keys.filter((k) => k.t >= out.marks.edge - 1e-6);
    const hits = Object.entries(out.marks).filter(([n]) => /^hit\d+$/.test(n)).map(([, t]) => t).sort((a, b) => a - b);
    // forward first: until the first hit the body only turns forward (head leads down, never a backflip off the edge)
    for (let i = 1; i < ks.length && ks[i].t <= hits[0]; i += 1) assert.ok(turnOf(ks[i]) >= turnOf(ks[i - 1]) - 0.5, `turns back before the first hit at ${ks[i].t.toFixed(2)}`);
    // each flight (between leaving one thing and hitting the next): ONE steady turn speed, the way it travels — never shaking
    const bounds = [out.marks.edge, ...hits];
    for (let f = 0; f + 1 < bounds.length; f += 1) {
      const fl = ks.filter((k) => k.t > bounds[f] + TUMBLE_CONTACT_S + 0.11 && k.t < bounds[f + 1] - 1e-6);
      if (fl.length < 3) continue;
      const w = fl.slice(1).map((k, i) => (turnOf(k) - turnOf(fl[i])) / (k.t - fl[i].t));
      assert.ok(Math.max(...w) - Math.min(...w) < 5, `flight ${f}: steady turn (${Math.min(...w).toFixed(0)}..${Math.max(...w).toFixed(0)} °/s)`);
      const travel = fl[fl.length - 1].x - fl[0].x, turned = turnOf(fl[fl.length - 1]) - turnOf(fl[0]);
      if (Math.abs(travel) > 0.1 * H) assert.ok(turned * travel >= 0, `flight ${f}: turns against its travel`);
      // (lands flat: at the hit the body is on its front or back, never head first)
      const atHit = ks.find((k) => Math.abs(k.t - bounds[f + 1]) < 1e-6);
      if (atHit) { const m = ((turnOf(atHit) % 360) + 360) % 360; assert.ok(m > 35 && m < 325, `flight ${f}: lands head first (${m.toFixed(0)}°)`); }
      flips = Math.max(flips, Math.abs(turnOf(fl[fl.length - 1]) - turnOf(fl[0])));
      // LOOSE in the air (Oct 15, mid-flight after the first hit): flung by the spin — never a stiff tucked ball (knees not folded shut)
      if (f > 0) for (const k of fl.filter((q) => q.t > bounds[f] + 0.25 && q.t < bounds[f + 1] - 0.18)) assert.ok(k.pose.lKnee < 110, `flight ${f}: not a stiff ball (${k.pose.lKnee.toFixed(0)})`);
    }
    const end = out.end.pose, last = out.keys[out.keys.length - 1];
    assert.ok(end === FALLEN_FORWARD || end === FALLEN_BACK, "ends in a lying pose");
    assert.ok(Math.abs(((last.spin ?? 0) % 360 + 360) % 360) < 1e-6 || Math.abs((((last.spin ?? 0) % 360) + 360) % 360 - 360) < 1e-6, `ends lying flat: whole turns only (${last.spin})`);
  }
  assert.ok(flips >= 180, `a long fall really turns over (${flips.toFixed(0)}°)`);
});

// IMPACTS (Oct 15): every hit is a real contact — at least one picture ON the thing (a floor bounce too, never turning round in the
// air between pictures) — and a bounce's height follows the drop: a stair step = a tiny hop, the long drop to the floor = a small one.
test("a tumble's bounces touch down and stay small: tiny on a stair, small off the floor", () => {
  const H = 150, steps = [0, 1, 2, 3, 4].map((i) => ({ left: 702 + i * 135, right: 837 + i * 135, top: -78 * (i + 1), cx: 770 + i * 135 }));
  const { samples, hits } = tumblePath(700, 1, H, { surfaces: steps, pits: [{ left: 700, right: 1800, bottom: -475 }], speed: 135 });
  for (let i = 1; i < hits.length; i += 1) {
    const peak = Math.max(...samples.filter((p) => p.t > hits[i - 1] && p.t < hits[i]).map((p) => p.y)), from = samples.find((p) => Math.abs(p.t - hits[i - 1]) < 1e-9)!.y;
    assert.ok(peak - from < 0.3 * H, `step bounce ${i}: ${((peak - from) / H).toFixed(2)} H`);
  }
  const cliff = tumblePath(709, 1, H, { pits: [{ left: 700, right: 1900, bottom: -900 }], speed: 135 });
  for (const h of cliff.hits) assert.ok(cliff.samples.some((p) => Math.abs(p.t - h) < 1e-9 && Math.abs(p.y + 900) < 1), `a picture on the floor at the hit ${h.toFixed(2)}`);
  const after = cliff.samples.filter((p) => p.t > cliff.hits[0]);
  assert.ok(Math.max(...after.map((p) => p.y)) + 900 < 0.5 * H, `floor bounce small (${((Math.max(...after.map((p) => p.y)) + 900) / H).toFixed(2)} H) after a 6 H drop`);
});

// TURNS COME FROM THE FALL (Oct 15, Arthur: "two front flips from five feet — not natural"): a ~1-height drop turns under half a
// turn; a deep cliff at most two; and the limbs trail the spin (secondary motion) and fly out with its speed.
test("a tumble turns only as much as the drop gives; limbs trail and fling with the spin", () => {
  const H = 150, turnOf = (k: { pose: { lean: number }; spin?: number }) => k.pose.lean + (k.spin ?? 0);
  const total = (bottom: number, surfaces: { left: number; right: number; top: number; cx?: number }[] = []) => {
    const out = tumble({ t: 0, x: 640, facing: "right", pose: STAND }, { speed: 160, surfaces, pits: [{ left: 700, right: 1900, bottom }] }, { height: H, style: "natural" } as never);
    const ks = out.keys.filter((k) => k.t >= out.marks.edge - 1e-6 && k.t <= (out.marks.land ?? Infinity) + 1e-6);
    return Math.max(...ks.map(turnOf)) - Math.min(...ks.map(turnOf));
  };
  const small = total(-H);
  assert.ok(small < 180, `a 1-height drop turns under half a turn (${small.toFixed(0)}°)`);
  const deep = total(-10 * H, [{ left: 760, right: 900, top: -3 * H, cx: 830 }, { left: 1000, right: 1140, top: -6 * H, cx: 1070 }]);
  assert.ok(deep <= 720 + 60, `a deep cliff turns at most two turns (${deep.toFixed(0)}°)`);
  assert.ok(turnCapForDrop(1) < 180 && turnCapForDrop(9) > 360 && totalTurnCap(20) === 720, "the caps follow the drop");
  const base = STAND, trail = limbsWithSpin(base, 30, 0), fast = limbsWithSpin(base, 0, 1);
  assert.ok(trail.lShoulder < base.lShoulder - 15, "turning forward, the arms trail behind the turn");
  assert.ok(Math.abs(fast.lShoulder - fast.rShoulder) > Math.abs(base.lShoulder - base.rShoulder) + 60, "spinning fast, the arms fly out wide");
  assert.ok(spinLoose(0) === 0 && spinLoose(720) === 1, "loose with spin speed");
});

// HURT AFTER A HARD FALL (Oct 15): about five feet (~1 height) or more, or a sprint into the ground, is past the hurt line.
test("a hard fall leaves the body hurt; a walking trip does not", () => {
  assert.ok(fallHurt(1) >= HURT_STYLE_AT && fallHurt(4) <= 0.9, "a 1-height drop hurts");
  assert.ok(fallHurt(0.2) === 0 && fallHurt(0, 1.2) === 0, "a small step down or a walking trip does not");
  assert.ok(fallHurt(0, 3.5) >= HURT_STYLE_AT, "a sprint into the ground hurts");
});

// ROLL OVER THE EDGE (Oct 15): down stairs the body rolls on its momentum — little front rolls — while free flights keep the drop caps.
test("down stairs a tumble rolls forward over the steps", () => {
  const H = 150, steps = [0, 1, 2, 3, 4].map((i) => ({ left: 702 + i * 135, right: 837 + i * 135, top: -78 * (i + 1), cx: 770 + i * 135 }));
  const out = tumble({ t: 0, x: 640, facing: "right", pose: STAND }, { speed: 160, surfaces: steps, pits: [{ left: 700, right: 1800, bottom: -475 }] }, { height: H, style: "natural" } as never);
  const turns = out.keys.filter((k) => k.t >= out.marks.edge && k.t <= (out.marks.land ?? Infinity)).map((k) => k.pose.lean + (k.spin ?? 0));
  assert.ok(Math.max(...turns) - Math.min(...turns) >= 300, `rolls over on the stairs (${(Math.max(...turns) - Math.min(...turns)).toFixed(0)}°)`);
  assert.ok(rollTurn(0.9) > 180 && rollTurn(0.9) < 240, "half a roll per step");
});

