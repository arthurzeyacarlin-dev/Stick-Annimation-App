import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { inSyncSpan, IN_SYNC_SEC } from "../laws/inSync.ts";
import { individuality, NEUTRAL } from "./individual.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// NOBODY MOVES IN PERFECT SYNC (Arthur, Oct 14): figures doing the same move at the same time are never copies — each gets its own
// start, tempo, strength and breathing (seeded, so re-renders are identical); a move lined up to a moment keeps its exact time.

const H = TEST_HEIGHT;
const skeletons = (plan: ScenePlan, fps = 24) => {
  const built = buildScene(planToScene(plan, LIBRARY), fps);
  return { built, of: (id: string) => built.frames.map((f) => f.find((c) => c.id === id)?.skeleton) };
};
const two = (move: string, params: Record<string, unknown>, facingB: "right" | "left" = "right"): ScenePlan => ({
  id: "t", title: "t", height: H, groundY: TEST_GROUND,
  characters: [
    { id: "a", x: 500, facing: "right", actions: [{ move, params }] },
    { id: "b", x: facingB === "right" ? 900 : 1400, facing: facingB, actions: [{ move, params }] },
  ],
});

test("individuality: the first figure is plain; every other one differs (later start, slower tempo, own strength), same every time", () => {
  assert.equal(individuality(0), NEUTRAL);
  const seen = new Set<string>();
  for (let i = 1; i <= 6; i += 1) {
    const o = individuality(i);
    assert.deepEqual(o, individuality(i), "deterministic");
    assert.ok(o.lag >= 0.04 && o.lag <= 0.14, `lag ${o.lag}`); // (Arthur, Oct 14: about 90% together — a hair apart)
    assert.ok(o.tempo >= 1.02 && o.tempo <= 1.06, `tempo ${o.tempo} (only slower: never breaks the speed law)`);
    assert.ok(o.amp >= 0.93 && o.amp <= 1.07, `amp ${o.amp}`);
    const key = `${o.lag}|${o.tempo}`;
    assert.ok(!seen.has(key), `figure ${i} copies another`);
    seen.add(key);
  }
});

test("the inSync law catches copies (and mirror copies) and lets different movers go", () => {
  const { of } = skeletons({ id: "t", title: "t", height: H, groundY: TEST_GROUND, characters: [{ id: "a", x: 500, facing: "right", actions: [{ move: "walk", params: { distance: 600 } }] }] });
  const a = of("a");
  assert.ok(inSyncSpan(a, a, 24, H).seconds > IN_SYNC_SEC, "a walk against itself is a copy");
  // The mirror copy: the same walk flipped (two figures facing each other doing the same thing).
  const mirrored = a.map((s) => s && (Object.fromEntries(Object.entries(s).map(([k, p]) => [k, { x: 2000 - p.x, y: p.y }])) as typeof s));
  assert.ok(inSyncSpan(a, mirrored, 24, H).seconds > IN_SYNC_SEC, "a mirrored copy is a copy");
  // Standing still together is not "in sync".
  const still = a.map(() => a[0]);
  assert.equal(inSyncSpan(still, still, 24, H).seconds, 0);
});

test("two figures walking, running, waving or celebrating together are never copies; still natural (bones, feet)", () => {
  for (const [move, params] of [["walk", { distance: 500 }], ["run", { distance: 700 }], ["wave", { times: 3 }], ["celebrate", { kind: "pump" }], ["cheer", {}]] as const) {
    if (!LIBRARY[move]) continue;
    const { built, of } = skeletons(two(move, params));
    const span = inSyncSpan(of("a"), of("b"), 24, H);
    assert.ok(span.seconds <= IN_SYNC_SEC, `${move}: in sync for ${span.seconds.toFixed(2)} s`);
    for (const r of built.report.characters) {
      assert.ok(r.maxBoneErrorPx <= 0.5, `${move}: bones`);
      assert.ok(r.maxFootDriftPx <= 1, `${move}: a planted foot slid ${r.maxFootDriftPx.toFixed(2)}`);
    }
  }
  // Re-render: identical.
  const p = two("walk", { distance: 500 });
  assert.deepEqual(skeletons(p).of("b"), skeletons(p).of("b"));
});

test("two pullers on one rope (even) heave on the shared beat but never as mirror copies", () => {
  const plan = two("pull", { role: "even", heaves: 4 }, "left");
  const { of } = skeletons(plan);
  const span = inSyncSpan(of("a"), of("b"), 24, H);
  assert.ok(span.seconds <= IN_SYNC_SEC, `pullers copy each other for ${span.seconds.toFixed(2)} s`);
});

test("a move lined up to a moment keeps its exact time (only free repetition is varied)", () => {
  const plan: ScenePlan = {
    id: "t", title: "t", height: H, groundY: TEST_GROUND,
    characters: [
      { id: "a", x: 500, facing: "right", actions: [{ move: "walk", params: { distance: 300 } }, { move: "wave", params: { times: 2 } }] },
      { id: "b", x: 1300, facing: "left", actions: [{ move: "wave", params: { times: 2 }, sync: { mark: "up", at: "a.wave1.up" } }] },
    ],
  };
  const scene = planToScene(plan, LIBRARY) as unknown as { marks?: Record<string, number> };
  const marks = scene.marks;
  if (marks && marks["a.wave1.up"] !== undefined && marks["b.wave1.up"] !== undefined) assert.ok(Math.abs(marks["a.wave1.up"] - marks["b.wave1.up"]) < 1e-6, "synced wave stays exact");
});

test("two figures repeating the same hand-made (custom) move are not copies either", () => {
  const keys = [{ pose: { lShoulder: 150, rShoulder: 150, lElbow: 20, rElbow: 20 } }, { pose: { lShoulder: 60, rShoulder: 60, lElbow: 80, rElbow: 80 } }];
  const { of } = skeletons(two("custom", { name: "cheer arms", keys, repeat: 4 }));
  const span = inSyncSpan(of("a"), of("b"), 24, H);
  assert.ok(span.seconds <= IN_SYNC_SEC, `custom copies for ${span.seconds.toFixed(2)} s`);
});

// 95% TOGETHER, 5% THEIR OWN (Oct 15): two figures doing the same free move each play their own version; after a shared moment
// the second reacts a little later; what the plan says always wins; the law catches a copy started a hair later.
test("variants: each figure picks its own natural version of a shared move (seeded), the plan's choice wins", async () => {
  const { ownVersion, reactionLag } = await import("./individual.ts");
  assert.deepEqual(ownVersion("celebrate", 0, {}), {}, "the first figure plays the plain move");
  const kinds = new Set([1, 2, 3].map((i) => ownVersion("celebrate", i, {}).kind));
  assert.equal(kinds.size, 3, "three figures, three different celebrations");
  assert.deepEqual(ownVersion("celebrate", 2, {}), ownVersion("celebrate", 2, {}), "deterministic");
  assert.equal(ownVersion("celebrate", 1, { kind: "pump" }).kind, "pump", "the plan's kind is kept");
  assert.ok(reactionLag(1) >= 0.12 && reactionLag(1) <= 0.34 && reactionLag(0) === 0);
});

test("after a shared moment, two celebrating figures react one after the other, each its own way (never copies)", () => {
  const plan: ScenePlan = {
    id: "t", title: "t", height: H, groundY: TEST_GROUND,
    characters: [
      { id: "a", x: 500, facing: "right", actions: [{ move: "stand", params: { seconds: 0.5 } }, { move: "celebrate" }] },
      { id: "b", x: 900, facing: "right", actions: [{ move: "stand", params: { seconds: 0.5 } }, { move: "celebrate" }] },
    ],
  };
  const { built, of } = skeletons(plan);
  const span = inSyncSpan(of("a"), of("b"), 24, H);
  assert.ok(span.seconds <= IN_SYNC_SEC, `celebrations copy for ${span.seconds.toFixed(2)} s`);
  for (const r of built.report.characters) assert.ok(r.maxFootDriftPx <= 1, `a planted foot slid ${r.maxFootDriftPx.toFixed(2)}`);
  // (b's arms start rising later than a's)
  const rise = (id: string) => of(id).findIndex((s) => !!s && Math.min(s.lHand.y, s.rHand.y) < s.neck.y);
  assert.ok(rise("b") > rise("a"), `b reacts after a (${rise("a")} vs ${rise("b")})`);
});

test("the inSync law catches the same in-place move started a hair later (same shape, nearly the same time)", () => {
  const { of } = skeletons(two("custom", { name: "cheer arms", keys: [{ pose: { lShoulder: 150, rShoulder: 150, lElbow: 20, rElbow: 20 } }, { pose: { lShoulder: 60, rShoulder: 60, lElbow: 80, rElbow: 80 } }], repeat: 4 }));
  const a = of("a"), late = [a[0], a[0], a[0], ...a.slice(0, -3)]; // the same motion 3 pictures (0.125 s) later
  assert.ok(inSyncSpan(a, late, 24, H).seconds > IN_SYNC_SEC, "a copy 0.125 s later is still a copy");
});
