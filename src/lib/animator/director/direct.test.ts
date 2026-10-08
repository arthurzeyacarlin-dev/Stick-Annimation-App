import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "../moves/library.ts";
import { PRINCIPLES } from "../moves/lessons.ts";
import type { ScenePlan } from "../moves/plan.ts";
import { direct, type DirectProgress, type Provider } from "./direct.ts";
import { directorInstructions, principleName } from "./prompt.ts";
import { checkPlan, keepOnPage, repairPlan, sceneForPage, type DirectedPlan } from "./repair.ts";
import { DIRECTOR_SCHEMA, planFrom, planTo } from "./schema.ts";
import { budgetCall, LUNA_PRICES as LUNA, PRICES as TERRA } from "./terraProvider.ts";

// SPEC-0017 Phase 3: the director with a FAKE provider (no paid AI calls in tests).

const USAGE = { inputTokens: 6_000, outputTokens: 900, cachedTokens: 0 };
type Call = Parameters<Provider>[0];
const fake = (answers: unknown[], searches: string[][] = []) => {
  const calls: Call[] = [];
  const provider: Provider = async (input) => {
    calls.push(input);
    const i = calls.length - 1;
    return { json: answers[Math.min(i, answers.length - 1)], usage: USAGE, searches: searches[i] ?? [] };
  };
  return { provider, calls };
};
const nullEdit = { character: null, move: null, nth: null, effect: null, newMove: null, params: [], action: null, amount: null, color: null, name: null, fps: null };
const act = (move: string, params: Record<string, unknown> = {}) => ({ move, params: Object.entries(params).map(([name, value]) => ({ name, value: JSON.stringify(value) })), style: null, speed: null, energy: null, sync: null });
const who = (id: string, x: number, facing: "left" | "right", color: string, actions: unknown[]) => ({ id, name: id[0].toUpperCase() + id.slice(1), namedByUser: false, x, facing, color, style: null, speed: null, energy: null, guard: null, cuffed: false, wears: [], actions });
const terraPlan = (characters: unknown[]) => ({ title: "Test", fps: null, canvasColor: null, characters, objects: [], effects: [], background: [] });
const SAYS = "First I'll place Blue and Red, then I'll make Blue punch, and finally I'll make Red react — then your animation is ready.";
const answer = (plan: unknown, edits: unknown[] = []) => ({ reply: "Here you go!", says: SAYS, plan, edits });
const FIGHT = terraPlan([
  who("blue", 800, "right", "#2563eb", [act("walk", { distance: 100 }), act("punch", { target: "red" })]),
  who("red", 1150, "left", "#e02424", [act("getHit", { from: "blue" })]),
]);
const REQ = { prompt: "Blue walks up and punches Red", fps: 24, stageWidth: 1920 };

test("a good plan: ok, every stage in order, the frames build", async () => {
  const { provider, calls } = fake([answer(FIGHT)]);
  const stages: DirectProgress[] = [];
  const r = await direct(REQ, { provider, onProgress: (p) => stages.push(p) });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(calls.length, 1);
  assert.equal(r.reviewed, false);
  assert.equal(r.says, SAYS);
  assert.deepEqual(r.repairs, []);
  assert.ok(r.costUsd > 0 && r.costUsd < 0.03);
  assert.deepEqual(r.usage, USAGE);
  assert.deepEqual(stages.map((s) => s.stage), ["thinking", "animating", "animating", "animating", "animating", "ready"]);
  assert.deepEqual(stages.filter((s) => s.stage === "animating").map((s) => s.percent), [10, 40, 70, 90]);
  // The page rebuilds the frames from the plan with the engine.
  const built = buildScene(sceneForPage(r.plan, REQ.stageWidth).scene, REQ.fps);
  assert.ok(built.frames.length > 24);
  assert.equal(built.report.ok, true);
  // The call carried the strict schema, the stable instructions and money-capped output room.
  assert.equal(calls[0].schema, DIRECTOR_SCHEMA);
  assert.equal(calls[0].instructions, directorInstructions());
  assert.ok(calls[0].maxOutputTokens >= 1200 && calls[0].maxOutputTokens <= 2000);
});

test("an unknown move is repaired to the nearest library move", async () => {
  const plan = terraPlan([who("blue", 900, "right", "#2563eb", [act("fireball", { energy: 7 }), act("jumpp")])]);
  const r = await direct(REQ, { provider: fake([answer(plan)]).provider });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.plan.characters[0].actions.map((a) => a.move), ["fireBlast", "jump"]);
  assert.equal(r.plan.characters[0].actions[0].params?.energy, 1);
  assert.ok(r.repairs.some((x) => x.includes("\"fireball\" isn't a move I know")));
  assert.ok(r.repairs.some((x) => x.includes("between 0 and 1")));
});

test("a broken body: exactly ONE review call, with the problems; the fixed plan is used", async () => {
  // A broken body: an original move whose key poses push the figure below the ground (the engine's checks find it).
  const wide = terraPlan([who("blue", 960, "right", "#2563eb", [act("custom", { keys: [{ pose: { lHip: 170, rHip: -170, lKnee: 160, rKnee: 160 }, feet: "both", dx: 400 }, { pose: { lean: 90 }, lift: -200 }] })])]);
  const fixed = terraPlan([who("blue", 960, "right", "#2563eb", [act("wave")])]);
  const { provider, calls } = fake([answer(wide), answer(fixed)]);
  const req = REQ;
  const r = await direct(req, { provider });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].input.includes("engineFoundProblems"));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.reviewed, true);
  assert.deepEqual(r.plan.characters.map((c) => c.id), ["blue"]);
  assert.ok(r.repairs.some((x) => x.startsWith("The AI fixed:")));
  // A review that doesn't help: still only one more call, and the plan is kept.
  const again = fake([answer(wide)]);
  const r2 = await direct(req, { provider: again.provider });
  assert.equal(again.calls.length, 2);
  assert.equal(r2.ok, true);
  if (r2.ok) assert.ok((r2.problems ?? []).length > 0);
});

test("cost cap: a request that could cost more than maxUsd is refused before sending", async () => {
  const { provider, calls } = fake([answer(FIGHT)]);
  const stages: string[] = [];
  const r = await direct(REQ, { provider, maxUsd: 0.01, prices: TERRA, onProgress: (p) => stages.push(p.stage) }); // (at Terra's price; Luna's is 10x lower)
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
  if (!r.ok) { assert.match(r.message, /cost more than \$0\.01/); assert.equal(r.costUsd, 0); }
  assert.deepEqual(stages, ["thinking", "failed"]);
  // The default 4-cent cap: the worst case of the first call (every output token, reasoning included) stays inside it.
  const budget = budgetCall(directorInstructions(), JSON.stringify(REQ));
  assert.ok(budget.ok && budget.worstUsd <= 0.04, `worst case $${budget.worstUsd}`);
});

test("follow-up: only the asked change; everything else stays identical", async () => {
  const previous = planFrom(FIGHT, "scene-1")! as ScenePlan;
  const edits = [{ ...nullEdit, kind: "stronger", character: "blue", move: "punch", nth: 1 }];
  const r = await direct({ ...REQ, prompt: "make the punch stronger", previousPlan: previous }, { provider: fake([answer(null, edits)]).provider });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.plan.id, "scene-1");
  const [blueBefore, redBefore] = previous.characters, [blue, red] = r.plan.characters;
  assert.deepEqual(red, redBefore);
  assert.deepEqual(blue.actions[0], blueBefore.actions[0]);
  assert.equal(blue.actions.length, blueBefore.actions.length);
  assert.ok((blue.actions[1].energy ?? 0.5) > 0.5);
  assert.deepEqual({ ...blue.actions[1], energy: undefined }, { ...blueBefore.actions[1], energy: undefined });
  // A whole new plan in a follow-up: every change is listed, so an unasked one (a kick) can be seen.
  const more = terraPlan([
    who("blue", 800, "right", "#2563eb", [act("walk", { distance: 100 }), act("punch", { target: "red" }), act("kick")]),
    who("red", 1150, "left", "#e02424", [act("getHit", { from: "blue" })]),
  ]);
  const r2 = await direct({ ...REQ, prompt: "make the punch stronger", previousPlan: previous }, { provider: fake([answer(more)]).provider });
  assert.equal(r2.ok, true);
  if (r2.ok) assert.ok(r2.repairs.includes("Changed: Blue got a new kick."), r2.repairs.join(" | "));
});

test("size shows age and role: a dad full size, his kid smaller, a giant word wins; the kid still walks without sliding", () => {
  const plan = planFrom(terraPlan([who("dad", 700, "right", "#2563eb", [act("walk", { distance: 200 })]), who("kid", 1100, "left", "#e02424", [act("walk", { distance: 150 })]), who("giantBaby", 1400, "left", "#16a34a", [act("wave")])]), "family")! as ScenePlan;
  const r = repairPlan(plan, 1920);
  const [dad, kid, giant] = r.plan.characters;
  assert.equal(dad.size, undefined);
  assert.equal(kid.size, 0.7);
  assert.ok((giant.size ?? 1) > 1);
  const built = buildScene(sceneForPage(r.plan, 1920).scene, 12);
  const kidReport = built.report.characters.find((c) => c.id === "kid")!;
  assert.ok(kidReport.maxBoneErrorPx < 1 && kidReport.maxFootDriftPx < 3, JSON.stringify(kidReport));
});

test("edit the SAME animation again and again: only the asked effect knobs change, the same bubbles stay", async () => {
  const withBubbles = { ...FIGHT, effects: [{ kind: "bubbles", start: 0, end: 4, anchor: { character: "blue", joint: "rHand", object: null, landing: null, x: null, y: null, dx: null, dy: null }, target: null, params: [{ name: "count", value: "8" }, { name: "color", value: "\"#ff8fd3\"" }], layer: null }] };
  let plan = planFrom(withBubbles, "scene-b")! as ScenePlan;
  const before = structuredClone(plan);
  // "bigger bubbles", then "fewer, and just floating around": two follow-ups on the same plan.
  for (const edits of [
    [{ ...nullEdit, kind: "bigger", effect: "bubbles" }],
    [{ ...nullEdit, kind: "effectParams", effect: "bubbles", params: [{ name: "count", value: "4" }, { name: "motion", value: "\"float\"" }] }],
  ]) {
    const r = await direct({ ...REQ, prompt: "change the bubbles", previousPlan: plan }, { provider: fake([answer(null, edits)]).provider });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    plan = r.plan;
  }
  assert.equal(plan.id, "scene-b");
  assert.deepEqual(plan.characters, before.characters);
  const [b0] = before.effects!, [b1] = plan.effects!;
  assert.deepEqual({ ...b1, params: undefined }, { ...b0, params: undefined });
  assert.equal(b1.params?.count, 4);
  assert.equal(b1.params?.motion, "float");
  assert.equal(b1.params?.color, "#ff8fd3");
  assert.ok(Number(b1.params?.size) > 0.06, "still bigger from the first edit");
});

test("searching shows only when Terra searched; a failed call is a friendly failure", async () => {
  const stages: string[] = [];
  const searching = fake([answer(FIGHT)], [["how does a capoeira kick look"]]);
  const r = await direct({ ...REQ, allowSearch: true }, { provider: searching.provider, maxUsd: 0.05, onProgress: (p) => stages.push(p.stage) });
  assert.equal(searching.calls[0].allowSearch, true);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.searches, ["how does a capoeira kick look"]);
  assert.deepEqual(stages.slice(0, 3), ["thinking", "searching", "animating"]);
  // A cap the plain call fits but the search fee doesn't: Terra answers without searching, and says so.
  const plain = fake([answer(FIGHT)]);
  // (Room for the smallest plan plus half a search fee: the plain call fits, the search fee doesn't.)
  const minimal = budgetCall(directorInstructions(), JSON.stringify({ ...REQ, allowSearch: true }), 1, 1200, false, LUNA).worstUsd; // (Luna = the default)
  const r1 = await direct({ ...REQ, allowSearch: true }, { provider: plain.provider, maxUsd: minimal + 0.005 });
  assert.equal(plain.calls[0].allowSearch, false);
  if (r1.ok) assert.ok(r1.repairs.some((x) => x.includes("skipped searching")));
  const broken: Provider = async () => { throw new Error("network down"); };
  const f = await direct(REQ, { provider: broken });
  assert.equal(f.ok, false);
  if (!f.ok) assert.match(f.message, /try again/);
  const empty = await direct(REQ, { provider: fake([answer(terraPlan([]))]).provider });
  assert.equal(empty.ok, false);
});

test("prompt: compact, stable, has every principle, move (incl. custom) and the reference key poses", () => {
  const s = directorInstructions();
  console.log(`director prompt: ${s.length} characters (~${Math.ceil(s.length / 4)} tokens)`);
  assert.ok(s.length <= 30_000, `prompt is ${s.length} characters`);
  assert.equal(directorInstructions(), s);
  assert.ok(s.startsWith("You are Luna"));
  for (const id of Object.keys(LIBRARY)) assert.ok(s.includes(`\n- ${id}: `), id);
  if (LIBRARY.custom) assert.ok(s.includes(LIBRARY.custom.about), "the custom move's about in full");
  // Every principle is there: the first ones in words, the rest by name.
  for (const p of PRINCIPLES) assert.ok(s.includes(principleName(p)), p.slice(0, 40));
  for (const id of ["walk", "punch", "jump", "wave"]) assert.ok(s.includes(`\n${id} (`), id);
});

test("schema: strict (every property required, no extra properties); plans go both ways", () => {
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object") {
      assert.equal(n.additionalProperties, false);
      assert.deepEqual([...(n.required as string[])].sort(), Object.keys(n.properties as object).sort());
    }
    Object.values(n).forEach(walk);
  };
  walk(DIRECTOR_SCHEMA);
  const plan = planFrom(FIGHT)!;
  assert.deepEqual(planFrom(planTo(plan))!.characters, plan.characters);
});

test("an original move whose key poses are WORDS (Terra's first real robot dance) is a problem Terra must fix", () => {
  const words = { id: "w", title: "w", height: 300, groundY: 900, stageWidth: 1920, characters: [{ id: "d", x: 960, facing: "right" as const, actions: [{ move: "custom", params: { keys: [{ pose: "torso leaned left, left arm straight sideways", hold: 0.3 }, { pose: "upright, arms up" }] } }] }] };
  const check = checkPlan(words as unknown as Parameters<typeof checkPlan>[0], 12, 1920);
  assert.ok(check.problems.some((p) => /written in words/.test(p)), check.problems.join(" | "));
  const angles = { ...words, characters: [{ ...words.characters[0], actions: [{ move: "custom", params: { keys: [{ pose: { lean: -10, lShoulder: 90, rShoulder: 90, lElbow: 90 }, hold: 0.3 }, { pose: { lShoulder: 170, rShoulder: 170 } }] } }] }] };
  assert.ok(!checkPlan(angles as unknown as Parameters<typeof checkPlan>[0], 12, 1920).problems.some((p) => /written in words/.test(p)));
});

// Arthur's parkour review (2026-10-07 round 2): Terra wrote jump {distance: 500, height: 300}; height is x BODY HEIGHT,
// so the runner flew to space and "leaves the page" stayed after the review. Knobs are clamped to their library range,
// and a figure still lost after the review is kept on the page by the engine.
test("repair clamps: a jump height in pixels becomes body heights inside 0.1-1.2, written down", () => {
  const plan = planFrom(terraPlan([who("runner", 500, "right", "#2563eb", [act("run", { distance: 300 }), act("jump", { distance: 500, height: 300 }), act("jump", { height: 4 })])]), "t")!;
  const r = repairPlan(plan, 1920);
  const jumps = r.plan.characters[0].actions.filter((a) => a.move === "jump");
  for (const j of jumps) assert.ok((j.params!.height as number) >= 0.1 && (j.params!.height as number) <= 1.2, `height ${j.params!.height}`);
  assert.equal(jumps[0].params!.distance, 500);
  assert.equal(jumps[0].params!.height, 1);
  assert.equal(jumps[1].params!.height, 1.2);
  assert.equal(r.repairs.filter((t) => /jump height was/.test(t)).length, 2);
});

test("parkour: Terra's jump {distance: 500, height: 300} x4 -> clamped, the runner stays on the page", async () => {
  const far = (n: number) => Array.from({ length: n }, () => [act("run", { distance: 600 }), act("jump", { distance: 500, height: 300 })]).flat();
  const PARKOUR = terraPlan([who("runner", 300, "right", "#2563eb", far(4))]);
  const { provider } = fake([answer(PARKOUR), answer(PARKOUR)]);
  const r = await direct({ prompt: "A runner does parkour over 4 spikes", fps: 24, stageWidth: 1920 }, { provider });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(!(r.problems ?? []).some((p) => /leaves the page/.test(p)), `still lost: ${r.problems?.join(" ")}`);
  assert.equal(r.repairs.filter((t) => /jump height was 300/.test(t)).length, 4);
  for (const a of r.plan.characters[0].actions) if (a.move === "jump") assert.ok((a.params!.height as number) <= 1.2);
});

test("keep on page: a figure still lost after the review is brought back by the engine, written down", () => {
  // (Unrepaired on purpose: the jumps go to space, so the check finds the runner lost.)
  const actions = Array.from({ length: 4 }, () => [{ move: "run", params: { distance: 600 } }, { move: "jump", params: { distance: 500, height: 300 } }]).flat();
  const plan: DirectedPlan = { id: "p", title: "Parkour", height: 1080, groundY: 900, characters: [{ id: "runner", name: "Runner", x: 300, facing: "right", actions }] };
  const before = checkPlan(plan, 24, 1920);
  assert.deepEqual(before.lost, ["runner"]);
  const kept = keepOnPage(plan, before, 24, 1920);
  assert.equal(kept.check.lost, undefined);
  assert.ok(!kept.check.problems.some((p) => /leaves the page/.test(p)));
  assert.ok(kept.repairs.some((t) => /Runner left the page, so I kept them on it/.test(t)), kept.repairs.join(" | "));
  // Nothing else changed: same moves in the same order.
  assert.deepEqual(kept.plan.characters[0].actions.map((a) => a.move), actions.map((a) => a.move));
});

test("Terra's prompt carries Arthur's scene lessons (fights, parkour, throws, storms, edits = timing only)", () => {
  const s = directorInstructions();
  for (const words of ["striking distance", "RUNNING jump over EACH spike", "x BODY HEIGHT", "THROWING a power ball", "THUNDERSTORM", "change ONLY the timing"]) assert.ok(s.includes(words), words);
  assert.ok(s.length <= 30_000, `prompt is ${s.length} characters`);
});

// AUDIT (H44): a follow-up changes only what was asked — a guard the user asked for earlier stays.
test("follow-up keeps the earlier asked-for guard (\"make the punch stronger\" doesn't drop it)", async () => {
  const previous = planFrom(FIGHT, "scene-1")! as ScenePlan;
  previous.characters[0].guard = "realistic";
  const edits = [{ ...nullEdit, kind: "stronger", character: "blue", move: "punch", nth: 1 }];
  const r = await direct({ ...REQ, prompt: "make the punch stronger", previousPlan: previous }, { provider: fake([answer(null, edits)]).provider });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.plan.characters[0].guard, "realistic");
});

test("Luna side by side: the SAME instructions and checks, only the model and its price differ", async () => {
  const { costUsd: cost, LUNA_MODEL, LUNA_PRICES, PRICES } = await import("./terraProvider.ts");
  assert.equal(LUNA_MODEL, "gpt-5.6-luna");
  // 10,000 tokens in + 1,000 out: Luna $0.0032, Terra $0.032 (ten times more).
  const use = { inputTokens: 10_000, outputTokens: 1_000, cachedTokens: 0 };
  assert.ok(Math.abs(cost(use, 0, LUNA_PRICES) - 0.0032) < 1e-9);
  assert.ok(Math.abs(cost(use, 0, PRICES) - 0.032) < 1e-9);
  const plan = terraPlan([who("blue", 600, "right", "#2563eb", [act("walk", { distance: 300 })])]);
  const answer = { reply: "Here it is.", says: SAYS, plan, edits: [] };
  const terra = fake([answer]), luna = fake([answer]);
  const req = { prompt: "Blue walks.", fps: 12, stageWidth: 1920 };
  const a = await direct(req, { provider: terra.provider, prices: PRICES });
  const b = await direct(req, { provider: luna.provider, prices: LUNA_PRICES });
  assert.ok(a.ok && b.ok);
  assert.equal(luna.calls[0].instructions, terra.calls[0].instructions, "Luna gets exactly Terra's instructions");
  assert.equal(luna.calls[0].input, terra.calls[0].input);
  assert.ok(b.costUsd < a.costUsd / 5, "Luna's cost uses Luna's price");
});

// H42 (Arthur's parkour card): running over hazards keeps the speed and uses the smallest move that clears.
test("parkour: a lone spike gets a running leap, two close spikes are crossed IN STRIDE (a foot between, same speed)", async () => {
  const { footfalls } = await import("./repair.ts");
  const spike = (x: number) => ({ kind: "spikes", params: { x, count: 1, size: 0.25 } });
  const plan = { id: "p", title: "Parkour", height: 300, groundY: 900, characters: [{ id: "runner", name: "Runner", x: 150, facing: "right", actions: [
    { move: "run", params: { distance: 400 } }, { move: "jump", params: { height: 0.45, distance: 260 } }, { move: "run", params: { distance: 1000 } }, { move: "catchBreath", params: { seconds: 1.5 } }] }],
    background: { pieces: [spike(700), spike(1400), spike(1550)] } } as unknown as DirectedPlan;
  const check = checkPlan(plan, 24, 1920);
  assert.ok(!check.problems.some((p) => /off the page|leaves the page/.test(p)), check.problems.join(" | "));
  const skel = check.built.frames.map((f) => f[0].skeleton), h = check.plan.height;
  const xs = check.plan.background!.pieces.map((p) => p.params!.x as number).sort((a, b) => a - b);
  const steps = footfalls(skel, check.plan.groundY, h);
  // No foot ever comes down on a spike.
  for (const s of xs) for (const x of steps) assert.ok(Math.abs(x - s) > 0.15 * h, `a foot lands at ${Math.round(x)}, on the spike at ${Math.round(s)}`);
  // Exactly one footfall between the two close spikes (one foot between, the other strides over)...
  assert.equal(steps.filter((x) => x > xs[1] && x < xs[2]).length, 1, `steps ${steps.map(Math.round)} spikes ${xs.map(Math.round)}`);
  // ...and the run keeps its speed through the course: no stop between the spikes.
  const hips = skel.map((s) => s.hip.x), from = hips.findIndex((x) => x > xs[0] - 0.5 * h), to = hips.findIndex((x) => x > xs[2] + 0.3 * h);
  const v = hips.slice(from + 1, to).map((x, k) => x - hips[from + k]), mean = v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(Math.min(...v) > 0.7 * mean, `speed drops to ${Math.min(...v).toFixed(1)} of ${mean.toFixed(1)} px a picture`);
});

// H42 (Arthur's fire-vs-water card): ranged attacks need room — about twice a punch's striking distance.
test("a beam/blast duel starts about 2x a punch's striking distance apart; a punch fight keeps its gap", async () => {
  const { RANGED_GAP, STRIKING_DISTANCE } = await import("./repair.ts");
  const duel = { id: "p", title: "Fire vs water", height: 300, groundY: 900, characters: [
    { id: "red", name: "Red", x: 860, facing: "right", actions: [{ move: "fireBlast", params: { target: "blue" } }] },
    { id: "blue", name: "Blue", x: 1060, facing: "left", actions: [{ move: "waterShield" }] }] } as unknown as DirectedPlan;
  const r = repairPlan(duel, 1920);
  const gap = Math.abs(r.plan.characters[1].x - r.plan.characters[0].x);
  assert.ok(Math.abs(gap - RANGED_GAP * 300) < 1 && RANGED_GAP === 2 * STRIKING_DISTANCE, `gap ${gap}`);
  assert.ok(r.repairs.some((t) => /reaches far/.test(t)));
  assert.equal((r.plan.characters[0].x + r.plan.characters[1].x) / 2, 960);
  assert.ok(!checkPlan(r.plan, 24, 1920).problems.some((p) => /off the page|leaves the page/.test(p)));
  const fight = { ...duel, characters: [{ ...duel.characters[0], actions: [{ move: "punch", params: { target: "blue" } }] }, { ...duel.characters[1], actions: [{ move: "block" }] }] } as DirectedPlan;
  const f = repairPlan(fight, 1920);
  assert.deepEqual(f.plan.characters.map((c) => c.x), [860, 1060]);
});

// AUDIT (H44): a wrong move name keeps its most specific word — never a different move than asked.
test("nearestMove: tiptoeWalk = tiptoe, victoryJump / victory = celebrate, running = run, laser = laserEyes", async () => {
  const { nearestMove } = await import("./repair.ts");
  assert.equal(nearestMove("tiptoeWalk", {}), "tiptoe");
  assert.equal(nearestMove("victoryJump", {}), "celebrate");
  assert.equal(nearestMove("victory", {}), "celebrate");
  assert.equal(nearestMove("running", {}), "run");
  assert.equal(nearestMove("laser", {}), "laserEyes");
});

// AUDIT (H44): the heart of the principles (weight, body rules, page rule) is always given IN WORDS, wherever new
// principles are added in the list.
test("prompt: weight, body rules and page rule are given in words", () => {
  const s = directorInstructions();
  for (const words of ["planted feet never slide", "bones never stretch", "always stays fully inside it"]) assert.ok(s.includes(words), words);
});

test("SEPARATE HAZARDS: both AIs' real parkour plan (one 'spikes' row, count 3, spacing 200, three jumps) -> three spikes, one under each jump", () => {
  const plan = {
    id: "parkour", title: "parkour", height: 300, groundY: 900,
    background: { pieces: [{ kind: "spikes", params: { count: 3, x: 464, spacing: 200 } }] },
    characters: [{ id: "runner", x: 105, facing: "right" as const, actions: [
      { move: "run", params: { distance: 259 } }, { move: "jump", params: { height: 0.45, distance: 199 } },
      { move: "jump", params: { height: 0.45, distance: 199 } }, { move: "jump", params: { height: 0.45, distance: 199 } }, { move: "catchBreath", params: {} }] }],
  } as unknown as DirectedPlan;
  const page = sceneForPage(plan, 1920);
  const spikes = (page.plan.background?.pieces ?? []).filter((p) => p.kind === "spikes");
  assert.equal(spikes.length, 3, "three separate spikes, not one clump");
  const built = buildScene(page.scene, 24);
  const marks = (page.scene as { marks?: Record<string, number> }).marks ?? {};
  spikes.forEach((p, n) => {
    const top = marks[`runner.jump${n + 1}.top`];
    const f = built.frames[Math.round(top * 24)][0].skeleton;
    assert.ok(Math.abs((f.lFoot.x + f.rFoot.x) / 2 - (p.params!.x as number)) < 30, `spike ${n + 1} is under jump ${n + 1}'s highest point`);
  });
});

// FIGURES STAY BIG ENOUGH TO READ (H52): Luna's real parkour plan (a long course; the page fit zoomed it to 0.495 x,
// a tiny runner). The engine shortens the course instead (written down), so the figure stays at least PAGE_FLOOR x
// its size, the same moves in the same order, every spike under a jump's highest point, nothing off the page.
test("FIGURES STAY BIG: Luna's long parkour course is shortened, not zoomed out to a tiny runner", () => {
  const plan = {
    id: "parkour", title: "parkour", height: 300, groundY: 900,
    background: { pieces: [1217, 2228, 3204].map((x) => ({ kind: "spikes", params: { x } })) },
    characters: [{ id: "runner", x: 186, facing: "right" as const, actions: [
      { move: "run", params: { distance: 180 } }, { move: "jump", params: { height: 0.45, distance: 180 } },
      { move: "run", params: { distance: 100 } }, { move: "jump", params: { height: 0.45, distance: 180 } },
      { move: "run", params: { distance: 100 } }, { move: "jump", params: { height: 0.45, distance: 180 } },
      { move: "run", params: { distance: 120 } }, { move: "catchBreath", params: { duration: 4 } }] }],
  } as unknown as DirectedPlan;
  const fixed = repairPlan(plan, 1920);
  assert.ok(fixed.repairs.some((r) => /course was too long/.test(r)), "the shortening is written down");
  assert.deepEqual(fixed.plan.characters[0].actions.map((a) => a.move), plan.characters[0].actions.map((a) => a.move), "same moves, same order");
  const check = checkPlan(fixed.plan, 24, 1920);
  assert.deepEqual(check.problems, [], "nothing off the page");
  assert.ok(check.plan.height >= 0.6 * 300 - 0.5, `the runner stays big (${Math.round(check.plan.height)} px of 300)`);
  const marks = (check.scene as { marks?: Record<string, number> }).marks ?? {};
  const spikes = (check.plan.background?.pieces ?? []).filter((p) => p.kind === "spikes");
  assert.equal(spikes.length, 3);
  spikes.forEach((p, n) => {
    const f = check.built.frames[Math.round(marks[`runner.jump${n + 1}.top`] * 24)][0].skeleton;
    assert.ok(Math.abs((f.lFoot.x + f.rFoot.x) / 2 - (p.params!.x as number)) < 30, `spike ${n + 1} is under jump ${n + 1}'s highest point`);
  });
});
