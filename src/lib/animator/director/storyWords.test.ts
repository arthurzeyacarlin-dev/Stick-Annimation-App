import assert from "node:assert/strict";
import test from "node:test";
import { planToScene } from "../moves/plan.ts";
import { LIBRARY } from "../moves/library.ts";
import type { DirectedPlan } from "./repair.ts";
import { PLAN_GROUND, PLAN_HEIGHT } from "./schema.ts";
import { followStoryWords, MAX_TRAVEL_SECONDS } from "./storyWords.ts";

// H51: what the user's words mean for the plan (Luna's car-to-the-moon and tiptoe answers, rated BAD / far too long).

// Luna's real plan for "A stick figure turns into a car and drives to the moon".
const lunaCar = (): DirectedPlan => ({
  id: "t", title: "Car to the moon", height: PLAN_HEIGHT, groundY: PLAN_GROUND,
  characters: [{ id: "stick", x: 500, facing: "right", actions: [{ move: "stand", params: { seconds: 4 } }] }],
  effects: [
    { kind: "transform", start: 0, end: 4, anchor: { character: "stick", joint: "hip" }, params: { into: "car", size: 0.45, path: [{ t: 0, dx: 0, dy: 0 }, { t: 4, dx: 1100, dy: 0 }], back: true } },
    { kind: "prop", start: 0, end: 4, anchor: { x: 1500, y: 250 }, params: { symbol: "moon", size: 0.5 } },
  ],
} as DirectedPlan);

test("A CHANGE OF FORM STAYS: an un-asked `back` is dropped; 'turns back' keeps it", () => {
  const plan = lunaCar();
  const repairs = followStoryWords(plan, "A stick figure turns into a car and drives to the moon");
  assert.equal(plan.effects![0].params!.back, undefined);
  assert.ok(repairs.some((r) => /stays that way/.test(r)), repairs.join(" | "));
  for (const words of ["The car turns back into a stick figure", "he changes back", "then he morphs back to normal", "and back into a person"]) {
    const asked = lunaCar();
    followStoryWords(asked, words);
    assert.equal(asked.effects![0].params!.back, true, words);
  }
  // (A follow-up keeps a `back` the previous plan already had: "make it red" must not drop it.)
  const kept = lunaCar();
  followStoryWords(kept, "make the car red", lunaCar());
  assert.equal(kept.effects![0].params!.back, true);
  // ("drives back to the house" is not changing back.)
  const drive = lunaCar();
  followStoryWords(drive, "turns into a car and drives back to the house");
  assert.equal(drive.effects![0].params!.back, undefined);
});

test("GOING TO A THING ENDS AT IT: the car drives along the floor, then rises to the moon", () => {
  const plan = lunaCar();
  const repairs = followStoryWords(plan, "A stick figure turns into a car and drives to the moon");
  const path = plan.effects![0].params!.path as { t: number; dx: number; dy: number }[];
  const last = path[path.length - 1];
  const carMiddle = PLAN_GROUND - (0.45 * PLAN_HEIGHT) / 2;
  // It ends at the moon (from the hip at x 500, on the floor).
  assert.ok(Math.abs(500 + last.dx - 1500) < 30, JSON.stringify(path));
  assert.ok(Math.abs(carMiddle + last.dy - 250) < 5, JSON.stringify(path));
  // It drives on the floor first (a leg with dy 0 that covers ground), then goes up.
  assert.ok(path.some((p) => p.t > 0 && p.t < last.t && p.dy === 0 && p.dx > 300), JSON.stringify(path));
  // The trip is seen to its end: the effect, the moon and the scene last until the car arrives.
  const arrive = plan.effects![0].start + 0.8 + last.t;
  assert.ok(plan.effects![0].end >= arrive - 1e-9 && plan.effects![1].end >= arrive - 1e-9);
  assert.ok(planToScene(plan, LIBRARY).durationSec >= arrive, String(planToScene(plan, LIBRARY).durationSec));
  // (Arrived, the car and the moon stay to the last picture.)
  const duration = planToScene(plan, LIBRARY).durationSec;
  assert.ok(plan.effects![0].end >= duration && plan.effects![1].end >= duration);
  assert.ok(repairs.some((r) => /all the way to the moon/.test(r)), repairs.join(" | "));
  // A path already ending at the moon is left alone; no "to the moon" in the words = left alone.
  const already = lunaCar();
  (already.effects![0].params as { path: unknown }).path = [{ t: 2, dx: 600, dy: 0 }, { t: 4, dx: 1000, dy: Math.round(250 - carMiddle) }];
  const before = JSON.stringify(already.effects![0].params!.path);
  followStoryWords(already, "turns into a car and drives to the moon");
  assert.equal(JSON.stringify(already.effects![0].params!.path), before);
  const other = lunaCar();
  followStoryWords(other, "turns into a car and drives away");
  assert.equal((other.effects![0].params!.path as unknown[]).length, 2);
});

const walker = (move: string, distance: number): DirectedPlan => ({
  id: "w", title: "Across", height: PLAN_HEIGHT, groundY: PLAN_GROUND,
  characters: [{ id: "sneaky", x: 300, facing: "right", actions: [{ move, params: { distance } }] }],
} as DirectedPlan);
const seconds = (plan: DirectedPlan) => planToScene(plan, LIBRARY).durationSec - 0.25;

test("A SLOW WAY OF MOVING COVERS LESS GROUND: one tiptoe / walk lasts at most ~8 s at its own speed", () => {
  // Luna's tiptoe across the room (1400 px, ~27 s) and Terra's (900 px, ~15 s).
  for (const d of [1400, 900]) {
    const plan = walker("tiptoe", d);
    assert.ok(seconds(plan) > MAX_TRAVEL_SECONDS + 1);
    const repairs = followStoryWords(plan, "tiptoe across the room");
    const now = plan.characters[0].actions[0].params!.distance as number;
    assert.ok(now < d && now > 150, String(now));
    assert.ok(seconds(plan) <= MAX_TRAVEL_SECONDS + 0.05, String(seconds(plan)));
    assert.ok(repairs.some((r) => /too long/.test(r)));
  }
  // A run covers the same ground quickly: left alone. Asked for a long / slow one: left alone.
  const run = walker("run", 1400);
  followStoryWords(run, "runs across the room");
  assert.equal(run.characters[0].actions[0].params!.distance, 1400);
  const slow = walker("tiptoe", 1400);
  followStoryWords(slow, "tiptoe very slowly for a long time across the hall");
  assert.equal(slow.characters[0].actions[0].params!.distance, 1400);
});
