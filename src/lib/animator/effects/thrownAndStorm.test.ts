// Arthur's Terra review 2026-10-07: a power ball really thrown with its effects ON it, a real thunderstorm, real bubbles.
import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { planToScene, type ScenePlan } from "../moves/plan.ts";
import { LIBRARY } from "../moves/library.ts";
import { ballLook } from "../objects.ts";
import { buildEffectFrames, objectLanding, BACKGROUND_PIECES, EFFECTS } from "./index.ts";
import { stormStrikes } from "./thunderstorm.ts";
import type { Shape } from "./types.ts";
type Line = Extract<Shape, { kind: "line" }>;

const H = 300, G = 900;
const ballPlan = (): ScenePlan => ({
  id: "ball", title: "power ball", height: H, groundY: G, stageWidth: 1920,
  objects: [{ id: "energyBall", look: ballLook("ball", { size: 45, color: "#9b30ff" }) }],
  characters: [{ id: "a", name: "A", x: 500, facing: "right", actions: [{ move: "throw", params: { object: "energyBall", distance: 500 } }] }],
  effects: [{ kind: "glow", start: 0, end: 2.6, anchor: { object: "energyBall" }, params: { color: "#b04dff" } }, { kind: "sparks", start: 1.4, end: 2.1, anchor: { object: "energyBall", landing: true } }],
});

for (const fps of [8, 12, 24]) {
  test(`a thrown object nobody holds starts in the thrower's hands and really flies; its effects ride on it (${fps} fps)`, () => {
    const plan = ballPlan(), scene = planToScene(plan, LIBRARY), built = buildScene(scene, fps);
    const n = built.frames.length, o0 = built.objects[0][0], s0 = built.frames[0][0].skeleton;
    assert.ok(Math.min(Math.hypot(o0.x - s0.rHand.x, o0.y - s0.rHand.y), Math.hypot(o0.x - s0.lHand.x, o0.y - s0.lHand.y)) < 40, "in the hands at the start");
    const land = objectLanding(built, "energyBall", G)!;
    // (It bursts where it lands, so it is gone after that — Arthur: it doesn't roll on.)
    const seen = built.objects.map((f) => f.find((o) => o.id === "energyBall")).filter((o) => o !== undefined);
    assert.ok(seen[seen.length - 1]!.x - o0.x > 350, "thrown forward, not floating beside him");
    assert.equal(built.objects[n - 1].find((o) => o.id === "energyBall"), undefined, "gone after it bursts");
    assert.ok(land && land.t > scene.marks["a.throw1.release"] && Math.abs(land.y - G) < 1, "it lands on the ground after the release");
    const fx = buildEffectFrames({ ...scene, effects: plan.effects }, built);
    const mid = Math.round((scene.marks["a.throw1.release"] + 0.3) * fps), ball = built.objects[mid][0];
    const glow = fx[mid].front.find((s) => s.kind === "circle") as { x: number; y: number } | undefined;
    assert.ok(glow && Math.hypot(glow.x - ball.x, glow.y - ball.y) < 30, "the glow is ON the ball in flight");
    const burstAt = Math.ceil(land.t * fps - 1e-9) + 1;
    const sparks = fx[Math.min(n - 1, burstAt)].front.filter((s) => Math.hypot(((s as { x?: number }).x ?? land.x) - land.x, ((s as { y?: number }).y ?? land.y) - land.y) < 250).length;
    assert.ok(sparks > 0, "the burst happens where and when it lands");
  });
}

test("thunderstorm: dark gray sky, heavy rain, lightning about every 1-2 s, far ones and near ones", () => {
  assert.ok(BACKGROUND_PIECES.thunderstorm);
  const stage = { width: 1920, groundY: G, height: H };
  const strikes = stormStrikes({}, stage, 8);
  const gaps = strikes.slice(1).map((s, i) => s.t - strikes[i].t);
  assert.ok(strikes.length >= 5 && gaps.every((g) => g >= 0.8 && g <= 2.1), `about every 1-2 s: ${gaps.map((g) => g.toFixed(2))}`);
  assert.ok(strikes.some((s) => s.near) && strikes.some((s) => !s.near), "some near, some far");
  const shapes = BACKGROUND_PIECES.thunderstorm.draw({ kind: "thunderstorm" }, 0.1, stage);
  const sky = shapes[1] as { fill: string };
  assert.ok(parseInt(sky.fill.slice(1, 3), 16) < 0x60, "dark sky");
  assert.ok(shapes.filter((s) => s.kind === "symbol").length >= 40, "heavy rain");
  const near = strikes.find((s) => s.near)!, far = strikes.find((s) => !s.near)!;
  const flashNear = BACKGROUND_PIECES.thunderstorm.draw({ kind: "thunderstorm" }, near.t + 0.2, stage).filter((s) => s.kind === "rect" && (s as { fill?: string }).fill === "#f2f5ff");
  assert.ok(flashNear.length === 1, "a near strike flashes the sky");
  const farShapes = BACKGROUND_PIECES.thunderstorm.draw({ kind: "thunderstorm" }, far.t + 0.3, stage).filter((s): s is Line => s.kind === "line" && (s.stroke === "#dfe8ff" || s.stroke === "#ffffff"));
  assert.ok(farShapes.length > 0 && farShapes.every((s) => (s.alpha ?? 1) <= 0.5 + 1e-9 && Math.max(...s.points.filter((_: number, i: number) => i % 2 === 1)) <= G - 0.4 * H), "far strikes faint and on the horizon");
});

test("bubbles move, wobble, and some pop; same at any frame rate", () => {
  const b = EFFECTS.bubbles, ctx = (t: number) => ({ t, duration: 4, fps: 24, at: { x: 900, y: 600 }, height: H, groundY: G, stageWidth: 1920 });
  const a = b.draw(ctx(1), { color: "#ff6fb5" }), c = b.draw(ctx(1.25), { color: "#ff6fb5" });
  const rings = (s: typeof a) => s.filter((x): x is Line => x.kind === "line" && x.stroke === "#ff6fb5");
  assert.ok(rings(a).length >= 4, "rings");
  assert.notDeepEqual(rings(a)[0].points.slice(0, 2), rings(c)[0].points.slice(0, 2), "they move");
  assert.deepEqual(b.draw(ctx(1), { color: "#ff6fb5" }), a, "pure");
  let pops = 0;
  for (let t = 0.3; t < 3.7; t += 1 / 24) pops += b.draw(ctx(t), {}).filter((x) => x.kind === "circle" && (x.r ?? 0) < 5 && x.fill && x.fill !== "#ffffff").length > 0 ? 1 : 0;
  assert.ok(pops > 0, "some pop");
});

// H31 (Phase 3 self-review): a glowing power ball is thrown OVERHAND and can burst into STARS; parkour spikes sit
// under the running jumps and the whole scene stays on the page.
test("a glowing power ball is thrown overhand and bursts into stars where it lands", async () => {
  const { sceneForPage } = await import("../director/repair.ts");
  const plan = { id: "p", title: "p", height: 300, groundY: 900, objects: [{ id: "orb", look: ballLook("ball", { size: 45, color: "#9b30ff" }), heldBy: "a" }],
    characters: [{ id: "a", x: 500, facing: "right" as const, actions: [{ move: "throw", params: { object: "orb", distance: 700 } }] }],
    effects: [{ kind: "glow", start: 0, end: 3, anchor: { object: "orb" } }, { kind: "sparks", start: 0, end: 0.8, anchor: { object: "orb", landing: true }, params: { burst: true, stars: true } }] };
  const scene = sceneForPage(plan as never, 1920).scene as ReturnType<typeof planToScene>;
  assert.ok(scene.marks["a.throw1.cocked"] !== undefined, "overhand (it has the cocked-behind-the-head mark)");
  const built = buildScene(scene, 12), fx = buildEffectFrames(scene, built);
  assert.ok(fx.some((f) => [...f.back, ...f.front].some((s) => s.kind === "poly")), "stars are drawn");
});

test("parkour: spikes go under the running jumps and the runner stays on the page", async () => {
  const { sceneForPage } = await import("../director/repair.ts");
  const run = (d: number) => ({ move: "run", params: { distance: d } }), jump = { move: "jump", params: { height: 0.45, distance: 260 } };
  const plan = { id: "k", title: "k", height: 300, groundY: 900, characters: [{ id: "a", x: 150, facing: "right" as const, actions: [run(300), jump, run(160), jump, run(160), jump, run(160), { move: "catchBreath", params: { seconds: 1.5 } }] }],
    background: { pieces: [580, 1000, 1420].map((x) => ({ kind: "spikes", params: { x, count: 1, size: 0.25 } })) } };
  const { plan: fitted, scene } = sceneForPage(plan as never, 1920);
  const built = buildScene(scene, 24), xs = built.frames.map((f) => f[0].skeleton.hip.x);
  assert.ok(Math.min(...xs) > 0 && Math.max(...xs) < 1920, `on the page (${Math.min(...xs)}..${Math.max(...xs)})`);
  const spikes = fitted.background!.pieces.map((p) => p.params!.x as number);
  [1, 2, 3].forEach((n, i) => {
    const s = built.frames[Math.round((scene as unknown as { marks: Record<string, number> }).marks[`a.jump${n}.top`] * 24)][0].skeleton;
    assert.ok(Math.abs((s.lFoot.x + s.rFoot.x) / 2 - spikes[i]) < 30, `spike ${n} under jump ${n}`);
  });
});

test("LIGHTNING STRIKES AWAY FROM PEOPLE: a storm's near bolts land beside the figures, never through them", async () => {
  const plan = { id: "storm", title: "storm", height: 300, groundY: 900, background: { pieces: [{ kind: "thunderstorm", params: { every: 0.5, near: 1 } }] },
    characters: [{ id: "a", x: 960, facing: "right" as const, actions: [{ move: "wait", params: { seconds: 6 } }] }] };
  const scene = planToScene(plan as unknown as ScenePlan, LIBRARY) as unknown as { background: { pieces: { kind: string; params?: Record<string, unknown> }[] } };
  const storm = scene.background.pieces.find((p) => p.kind === "thunderstorm")!;
  const strikes = stormStrikes(storm.params ?? {}, { width: 1920, groundY: 900, height: 300 }, 6).filter((k) => k.near);
  assert.ok(strikes.length >= 5, "near strikes happen");
  for (const k of strikes) assert.ok(Math.abs(k.x - 960) >= 0.9 * 300 - 1e-6, `a near bolt at ${k.x.toFixed(0)} is beside the figure, not through it`);
  // (the storm still has its ground under it)
  assert.ok(scene.background.pieces.some((p) => p.kind === "ground"));
});

test("AN EFFECT RIDING ON A THROWN THING LASTS AS LONG AS IT FLIES: a glow the plan ends too early keeps going to the landing", () => {
  const plan = ballPlan();
  plan.effects![0] = { ...plan.effects![0], end: 0.9 }; // (ends before the ball has even landed)
  const scene = planToScene(plan, LIBRARY), built = buildScene(scene, 12);
  const land = objectLanding(built, "energyBall", G)!;
  const glow = (scene as { effects?: { kind: string; end: number }[] }).effects!.find((e) => e.kind === "glow")!;
  assert.ok(land.t > 0.9 && Math.abs(glow.end - land.t) < 1e-9, `the glow lasts to the landing (${glow.end.toFixed(2)} s vs ${land.t.toFixed(2)} s)`);
  assert.equal(plan.effects![0].end, 0.9, "the plan itself is not changed");
});

test("A LASTING CHANGE STAYS TO THE END: a placed moon and a car with no way back are still there in the last picture", () => {
  const plan: ScenePlan = {
    id: "moon", title: "car to the moon", height: H, groundY: G, stageWidth: 1920,
    characters: [{ id: "a", name: "A", x: 500, facing: "right", actions: [{ move: "wait", params: { seconds: 4 } }] }],
    effects: [
      { kind: "transform", start: 0.2, end: 4, anchor: { character: "a", joint: "hip" }, params: { into: "car", size: 0.45, path: [{ t: 0, dx: 0, dy: 0 }, { t: 4, dx: 900, dy: -400 }] } },
      { kind: "prop", start: 0, end: 4, anchor: { x: 1500, y: 250 }, params: { symbol: "moon", size: 0.3 } },
      { kind: "flash", start: 0, end: 0.4, anchor: { x: 500, y: 700 } },
    ],
  };
  const scene = planToScene(plan, LIBRARY) as unknown as { durationSec: number; effects: { kind: string; end: number }[] };
  for (const kind of ["transform", "prop"]) assert.equal(scene.effects.find((e) => e.kind === kind)!.end, scene.durationSec, `${kind} reaches the very end`);
  assert.equal(scene.effects.find((e) => e.kind === "flash")!.end, 0.4, "a short effect keeps its own end");
});

test("A GLOW AROUND A THING IS BIGGER THAN THE THING: a glow written smaller than the ball is grown to show around it", () => {
  const plan = ballPlan();
  plan.effects![0] = { ...plan.effects![0], params: { ...plan.effects![0].params, size: 0.3 } };
  const scene = planToScene(plan, LIBRARY), built = buildScene(scene, 12);
  const glow = (scene as { effects?: { kind: string; params?: { size?: number } }[] }).effects!.find((e) => e.kind === "glow")!;
  const reach = 0.13 * H * glow.params!.size!; // the glow recipe's outer radius
  assert.ok(reach >= 1.8 * 22.5 - 1e-6, `the glow reaches ${reach.toFixed(1)} px around a 22.5 px ball`);
  assert.ok(built.frames.length > 0);
});
