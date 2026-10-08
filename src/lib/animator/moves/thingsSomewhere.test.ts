import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";

// A THING IN THE SCENE IS ALWAYS SOMEWHERE (2026-10-08): Luna's real plan for "a powerful punch at a punching bag" — a
// box nobody holds, with no spot — used to draw no bag at all.
const lunaBag = (facing: "right" | "left") => ({
  id: "p", title: "Punching bag", height: 300, groundY: 900,
  objects: [{ id: "bag", look: { kind: "box", size: 180, color: "#8B4513", filled: false, thickness: 6, detail: "plain" } }],
  characters: [{ id: "fighter", x: 650, facing, actions: [{ move: "punch", params: { distance: 250 } }] }],
}) as unknown as ScenePlan;

for (const facing of ["right", "left"] as const) {
  test(`a thing nobody holds stands on the ground in reach in front of the one who punches (${facing})`, () => {
    const built = buildScene(planToScene(lunaBag(facing), LIBRARY), 24);
    const bag = built.objects[0].find((o) => o.id === "bag");
    assert.ok(bag, "the bag is drawn");
    const dir = facing === "right" ? 1 : -1;
    assert.ok(dir * (bag!.x - 650) > 0, "in front of him");
    assert.ok(Math.abs(bag!.y + 90 - 900) < 1, "standing on the ground");
    const fist = Math.max(...built.frames.map((f) => dir * (f[0].skeleton[dir > 0 ? "rHand" : "lHand"].x - 650)), ...built.frames.map((f) => dir * (f[0].skeleton[dir > 0 ? "lHand" : "rHand"].x - 650)));
    const nearEdge = dir * (bag!.x - 650) - 90;
    assert.ok(Math.abs(fist - nearEdge) < 25, `the punch reaches the bag (fist ${fist.toFixed(0)} px out, bag edge ${nearEdge.toFixed(0)} px)`);
  });
}

test("a thing someone holds or uses keeps its own place (a held ball, a ball picked up)", () => {
  const plan = { id: "q", title: "ball", height: 300, groundY: 900,
    objects: [{ id: "ball", look: { kind: "ball", size: 40, color: "#f00", filled: true } , heldBy: "a" }],
    characters: [{ id: "a", x: 600, facing: "right", actions: [{ move: "wait", params: { seconds: 1 } }] }] } as unknown as ScenePlan;
  const scene = planToScene(plan, LIBRARY) as unknown as { objects: { keys?: unknown[] }[] };
  assert.ok(!(scene.objects[0].keys?.length), "no spot forced on a held ball");
});

test("PARTS ARE MEASURED IN THE THING'S OWN SIZE: Luna's original symbol written in page pixels lands where it was meant, on the page", async () => {
  const { buildEffectFrames } = await import("../effects/index.ts");
  const plan = { id: "b", title: "bag", height: 300, groundY: 900, stageWidth: 1920,
    characters: [{ id: "fighter", x: 700, facing: "right", actions: [{ move: "punch", params: { distance: 250 } }] }],
    effects: [{ kind: "prop", start: 0, end: 4, anchor: { x: 950, y: 900 }, params: { symbol: "punchingBag", parts: [
      { shape: "ellipse", x: 950, y: 600, w: 110, h: 300, color: "#8b1e2d" }, { shape: "line", x: 950, y: 450, w: 0, h: 150, color: "#333333" }] }, layer: "back" }],
  } as unknown as ScenePlan;
  const scene = planToScene(plan, LIBRARY), built = buildScene(scene, 24);
  const fx = buildEffectFrames(scene as never, built);
  const thing = (sh: object) => "points" in sh && Array.isArray(sh.points) && (sh.points as number[])[1] > 0; // (not the chain from above the page)
  const pts = fx[0].back.concat(fx[0].front).filter(thing).flatMap((s) => (s as { points: number[] }).points);
  assert.ok(fx[0].back.concat(fx[0].front).some((sh) => "points" in sh && Array.isArray(sh.points) && (sh.points as number[])[1] < 0), "NOTHING FLOATS: it hangs from a chain coming down from above the page");
  const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
  assert.ok(xs.length > 10, "the thing is drawn");
  assert.ok(Math.min(...xs) > 850 && Math.max(...xs) < 1050, `around x 950 (${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)})`);
  assert.ok(Math.min(...ys) > 400 && Math.max(...ys) < 800, `between y 450 and 750 (${Math.min(...ys).toFixed(0)}–${Math.max(...ys).toFixed(0)})`);
});

// Luna's three real punching-bag answers (2026-10-08 audit): the bag written in page pixels, in pixels FROM its spot,
// and a little past the fist. Each must be drawn on the page and get hit.
const lunaBags = [
  { x: 700, d: 250, at: { x: 950, y: 900 }, size: 1, parts: [{ shape: "ellipse", x: 950, y: 735, w: 90, h: 300, color: "#8b1e2d" }, { shape: "line", x: 950, y: 585, w: 0, h: 150, color: "#555555" }] },
  { x: 700, d: 280, at: { x: 980, y: 900 }, size: undefined, parts: [{ shape: "ellipse", x: 0, y: -190, w: 70, h: 180, color: "#b32626" }, { shape: "line", x: 0, y: -280, w: 0, h: 90, color: "#444444" }, { shape: "line", x: -35, y: -280, w: 70, h: 0, color: "#444444" }, { shape: "ellipse", x: -50, y: -10, w: 100, h: 20, color: "#333333" }] },
  { x: 900, d: 300, at: { x: 1200, y: 900 }, size: undefined, parts: [{ shape: "ellipse", x: 1200, y: 650, w: 90, h: 260, color: "#8b1e1e" }, { shape: "line", x: 1200, y: 520, w: 0, h: 130, color: "#555555" }] },
];
lunaBags.forEach((b, k) => {
  test(`Luna's real punching bag #${k + 1}: drawn on the page, in reach, and it moves when punched`, async () => {
    const { buildEffectFrames } = await import("../effects/index.ts");
    const plan = { id: "b", title: "bag", height: 300, groundY: 900, stageWidth: 1920,
      characters: [{ id: "fighter", x: b.x, facing: "right", actions: [{ move: "punch", params: { distance: b.d } }] }],
      effects: [{ kind: "prop", start: 0, end: 4, anchor: b.at, params: { symbol: "punching bag", ...(b.size ? { size: b.size } : {}), parts: b.parts }, layer: "back" }] } as unknown as ScenePlan;
    const scene = planToScene(plan, LIBRARY), built = buildScene(scene, 24);
    const fx = buildEffectFrames(scene as never, built);
    const body = (i: number) => fx[i].back.concat(fx[i].front).filter((sh) => "points" in sh && Array.isArray(sh.points) && (sh.points as number[])[1] > 0) as { points: number[] }[];
    const xsAt = (i: number) => body(i).flatMap((s) => s.points.filter((_, j) => j % 2 === 0));
    const ys0 = body(0).flatMap((s) => s.points.filter((_, j) => j % 2 === 1));
    const xs0 = xsAt(0);
    assert.ok(xs0.length > 10, "drawn");
    assert.ok(Math.min(...ys0) > 0 && Math.max(...ys0) <= 905 && Math.min(...xs0) > 0 && Math.max(...xs0) < 1920, "on the page, never below the ground");
    const fist = Math.max(...built.frames.map((f) => Math.max(f[0].skeleton.rHand.x, f[0].skeleton.lHand.x)));
    assert.ok(fist >= Math.min(...xs0) - 12, `the punch reaches it (fist ${fist.toFixed(0)}, bag's near side ${Math.min(...xs0).toFixed(0)})`);
    const moved = fx.some((f, i) => i > 0 && Math.abs(Math.max(...xsAt(i)) - Math.max(...xs0)) > 3);
    assert.ok(moved, "it reacts to the hit");
  });
});
