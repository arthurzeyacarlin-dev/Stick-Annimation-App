import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { buildEffectFrames } from "../effects/index.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import "./transform.ts";

// A THING THAT IS HIT REACTS + AN ORIGINAL SYMBOL FROM SIMPLE PARTS (hitThings.ts, transform.ts drawProp).
const base = { id: "p", title: "t", height: 300, groundY: 900 };
const punch = (x = 650) => ({ id: "fighter", x, facing: "right" as const, actions: [{ move: "punch", params: { distance: 250 } }] });
const xs = (shapes: { kind: string; points?: number[] }[]) => shapes.flatMap((s) => (s.points ?? []).filter((_, i) => i % 2 === 0));

test("a thing standing where the punch lands is drawn, reached and rocks after the hit (Luna's plan: box 180)", () => {
  const plan = { ...base, objects: [{ id: "thing", look: { kind: "box", size: 180, color: "#8B4513", filled: false, thickness: 6, detail: "plain" } }], characters: [punch()] } as unknown as ScenePlan;
  const scene = planToScene(plan, LIBRARY), built = buildScene(scene, 12);
  const hit = scene.marks["fighter.strike1.hit"];
  assert.ok(hit > 0);
  const at = (i: number) => built.objects[i].find((o) => o.id === "thing")!;
  assert.ok(built.frames.every((_, i) => at(i)), "the thing is in every picture");
  const before = built.frames.map((_, i) => i).filter((i) => i / 12 < hit - 0.01);
  assert.ok(before.every((i) => Math.abs(at(i).rotation) < 0.01 && Math.abs(at(i).x - at(0).x) < 0.5), `still before the hit ${before.map((i) => `${at(i).x.toFixed(1)}/${at(i).rotation.toFixed(2)}`)}`);
  const after = built.frames.map((_, i) => i).filter((i) => i / 12 > hit && i / 12 < hit + 0.5);
  assert.ok(Math.max(...after.map((i) => Math.abs(at(i).rotation))) > 4, "rocks after the hit");
  // the fist reaches its near side
  const near = at(0).x - 90, reach = Math.max(...built.frames.map((f) => Math.max(f[0].skeleton.lHand.x, f[0].skeleton.rHand.x)));
  assert.ok(Math.abs(reach - near) < 25, `fist ${reach.toFixed(0)} vs near side ${near.toFixed(0)}`);
  // it settles back on the ground where it stood
  const last = at(built.frames.length - 1);
  assert.ok(Math.abs(last.rotation) < 0.5 && Math.abs(last.x - at(0).x) < 2 && Math.abs(last.y - at(0).y) < 2);
});

test("a strike at a figure leaves the things in the scene alone", () => {
  const plan = { ...base, objects: [{ id: "thing", look: { kind: "box", size: 120, color: "#888" }, keys: [{ t: 0, x: 300, y: 840 }] }],
    characters: [{ id: "a", x: 700, facing: "right", actions: [{ move: "punch", params: { target: "b" } }] }, { id: "b", x: 900, facing: "left", actions: [{ move: "getHit", params: { from: "a" } }] }] } as unknown as ScenePlan;
  const scene = planToScene(plan, LIBRARY);
  assert.equal(scene.objects?.[0].keys.length, 1);
});

for (const [name, anchor, parts, hanging] of [
  ["standing", { x: 930, y: 860 }, [{ shape: "rect", x: 0, y: 0.2, w: 0.08, h: 0.6, color: "#6b4f2a" }, { shape: "round", x: 0, y: -0.25, w: 0.5, h: 0.3, color: "#2e6fd1" }], false],
  ["hanging", { x: 915, y: 700 }, [{ shape: "line", x: 0, y: -0.5, w: 0, h: 0.2 }, { shape: "round", x: 0, y: 0.1, w: 0.32, h: 0.8, color: "#c0392b" }, { shape: "ellipse", x: 0, y: -0.3, w: 0.3, h: 0.08 }], true],
] as const) {
  test(`an original symbol from parts (${name}) is drawn outlined, ${hanging ? "swings away" : "rocks"} when punched and settles`, () => {
    const plan = { ...base, characters: [punch()], effects: [{ kind: "prop", start: 0, end: 4, anchor, params: { size: hanging ? 0.75 : 0.55, parts } }] } as unknown as ScenePlan;
    const scene = planToScene(plan, LIBRARY), built = buildScene(scene, 12);
    const frames = buildEffectFrames(scene as never, built);
    const hit = scene.marks["fighter.strike1.hit"];
    const shapes = (i: number) => [...frames[i].back, ...frames[i].front];
    // (NOTHING FLOATS: a hanging thing also gets the chain it hangs from, up out of the page)
    assert.equal(shapes(0).length, parts.length + (hanging ? 1 : 0), "every part drawn (and a hanging thing's chain)");
    assert.ok(shapes(0).every((s) => s.kind === "line" || ("stroke" in s && s.stroke)), "outlined");
    const bottom = Math.max(...shapes(0).flatMap((s) => ("points" in s ? s.points.filter((_, i) => i % 2 === 1) : [])));
    if (!hanging) assert.ok(Math.abs(bottom - 900) < 3, `stands on the ground (${bottom})`);
    const i0 = Math.floor((hit - 0.02) * 12), after = [1, 2, 3].map((d) => Math.ceil(hit * 12) + d);
    assert.deepEqual(shapes(i0), shapes(0), `still before the hit (${i0})`);
    // its lowest part (hanging) / its top (standing) moves AWAY from the striker
    // (the body part — after the chain, for a hanging thing)
    const lowXs = (i: number) => { const s = shapes(i)[hanging ? 2 : 1]; return xs([s]).reduce((a, b) => a + b, 0) / xs([s]).length; };
    assert.ok(Math.max(...after.map(lowXs)) > lowXs(0) + 3, `moves away: ${after.map(lowXs).map((v) => v.toFixed(0))} vs ${lowXs(0).toFixed(0)}`);
    const reach = Math.max(...built.frames.map((f) => Math.max(f[0].skeleton.lHand.x, f[0].skeleton.rHand.x)));
    assert.ok(reach > Math.min(...xs(shapes(0))) - 10, `the fist reaches it: ${reach.toFixed(0)} vs ${Math.min(...xs(shapes(0))).toFixed(0)}`);
    assert.ok(Math.abs(lowXs(frames.length - 1) - lowXs(0)) < (hanging ? 6 : 2), `settles (a hanging thing on its long chain: within 6 px as the scene ends): last ${lowXs(frames.length - 1).toFixed(1)} vs first ${lowXs(0).toFixed(1)} (${frames.length} pictures, hit at ${hit.toFixed(2)} s)`);
  });
}
