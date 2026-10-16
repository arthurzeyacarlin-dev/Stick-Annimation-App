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

// BALLS HIT THINGS (Oct 14): a kicked ball that reaches a solid thing standing on the ground bounces back off it (slower),
// never passes through it; a tree only stops it at its trunk; a hanging or flying thing is no wall.
test("a kicked ball bounces back off a wall, crate or tree trunk instead of going through", async () => {
  const { objectReacts, solidWalls } = await import("./hitThings.ts");
  const H = 260, G = 900;
  const wall = { kind: "prop", start: -1.5, end: 60, anchor: { x: 1500, y: 900 }, params: { name: "brick wall", size: 1.1, parts: [{ shape: "rect", x: 0, y: 0, w: 0.35, h: 1 }] } } as never;
  const crate = { kind: "prop", start: 0, end: 60, anchor: { x: 1300, y: 900 }, params: { name: "wooden crate", size: 0.4, parts: [{ shape: "rect", x: 0, y: 0, w: 1, h: 1 }] } } as never;
  const kite = { kind: "prop", start: 0, end: 60, anchor: { x: 1300, y: 400 }, params: { name: "box kite", flies: true, size: 0.3, parts: [{ shape: "rect", x: 0, y: 0, w: 1, h: 1 }] } } as never;
  assert.equal(solidWalls([kite], H, G).length, 0, "a flying thing is no wall");
  for (const thing of [wall, crate]) {
    const walls = solidWalls([thing], H, G);
    assert.equal(walls.length, 1);
    const ball = { id: "ball", look: { kind: "ball", size: 40, color: "#fff", filled: true, thickness: 3 }, keys: [{ t: 0, x: 880, y: 880 }] } as never;
    const out = objectReacts(ball, [{ t: 0.5, power: 0.9, dir: 1, kick: true, height: "low" }], H, G, 6, 1920, walls);
    const xs = out.keys.map((k) => k.x), far = Math.max(...xs);
    assert.ok(far <= walls[0].left - 20 + 1, `never inside the ${(thing as { params: { name: string } }).params.name}: reached ${far.toFixed(0)}, side at ${walls[0].left.toFixed(0)}`);
    assert.ok(far > walls[0].left - 40, "it really reaches it");
    assert.ok(xs[xs.length - 1] < far - 0.3 * H, "and comes back");
  }
  const tree = { kind: "prop", start: 0, end: 60, anchor: { x: 1500, y: 900 }, params: { name: "big tree", size: 1.5, parts: [{ shape: "circle", x: 0, y: -0.5, w: 1, h: 1 }, { shape: "rect", x: 0, y: 0, w: 0.15, h: 0.6 }] } } as never;
  const tw = solidWalls([tree], H, G)[0];
  assert.ok(tw.right - tw.left <= 0.12 * H + 1, "a tree stops the ball only at its trunk");
});

// KICK A BALL BY NAME (Oct 14: `target: "ball"` walked the kicker backward for 3 s, then he kicked air 400 px away): the kicker
// steps up to the ball and the foot reaches it when the kick lands; the ball flies.
test("a kick at a ball named as its target steps up to the ball and the foot touches it", async () => {
  const { planToScene } = await import("./plan.ts");
  const { buildScene } = await import("../engine.ts");
  for (const ballX of [700, 1100]) {
    const plan = { ...base, height: 260, characters: [{ id: "k", x: 640, facing: "right" as const, actions: [{ move: "kick", params: { target: "ball" } }] }],
      objects: [{ id: "ball", look: { kind: "ball" as const, size: 40, color: "#fff", filled: true, thickness: 3 }, keys: [{ t: 0, x: ballX, y: 880 }] }] } as unknown as ScenePlan;
    const scene = planToScene(plan, LIBRARY);
    const hitT = scene.marks!["k.strike1.hit"];
    assert.ok(hitT !== undefined && hitT < 2.5, `the kick lands soon (${hitT})`);
    const built = buildScene(scene, 24), i = Math.round(hitT * 24);
    const foot = built.frames[i].find((c) => c.id === "k")!.skeleton.lFoot;
    const ball = built.objects[Math.max(0, i - 1)].find((o) => o.id === "ball")!;
    assert.ok(Math.hypot(foot.x - ball.x, foot.y - ball.y) < 20 + 0.12 * 260, `ball at ${ballX}: the foot (${foot.x.toFixed(0)},${foot.y.toFixed(0)}) touches the ball (${ball.x.toFixed(0)},${ball.y.toFixed(0)})`);
    const kx = scene.characters[0].keys.map((k) => k.x);
    assert.ok(Math.min(...kx) >= 640 - 5, "never walks backward away from the ball");
    assert.ok(built.objects[built.objects.length - 1].find((o) => o.id === "ball")!.x > ballX + 100, "the ball flies off");
  }
});

// A THING ON THE WATER FLOATS ON IT (Oct 14: a fishing float on the lake hung from a chain out of the sky): a placed thing at a
// water surface sits on the surface and is never drawn hanging; the same thing up in the air away from water still hangs.
test("a thing placed on a lake floats on its surface with no chain from the sky", async () => {
  const lake = { pieces: [{ kind: "sky", params: {} }, { kind: "water", params: { y: 770, h: 130 } }, { kind: "ground", params: {} }] };
  const float = { kind: "prop", start: 0, end: 4, anchor: { x: 1500, y: 800 }, params: { name: "fishing float", size: 0.05, parts: [{ shape: "circle", x: 0, y: 0, w: 1, h: 1 }] }, layer: "back" };
  for (const [anchor, onWater] of [[{ x: 1500, y: 800 }, true], [{ x: 1500, y: 300 }, false]] as const) {
    const plan = { ...base, background: lake, characters: [{ id: "a", x: 600, facing: "right" as const, actions: [{ move: "stand", params: { seconds: 2 } }] }], effects: [{ ...float, anchor }] } as unknown as ScenePlan;
    const scene = planToScene(plan, LIBRARY), built = buildScene(scene, 12);
    const frames = buildEffectFrames(scene as never, built);
    const lines = [...frames[6].back, ...frames[6].front].filter((s) => s.kind === "line" && (s.points ?? []).some((v, i) => i % 2 === 1 && v < 100));
    assert.equal(lines.length === 0, onWater, onWater ? "on the water: no chain up out of the page" : "up in the air: it still hangs on its chain");
    if (onWater) assert.equal((scene as { effects: { anchor: { y: number } }[] }).effects[0].anchor.y, 770, "it sits on the surface");
  }
});

// OBJECTS TIMED TO MOVES (Oct 14): an object's key synced to a move moment (`at` + `offset`, the words actions sync to) happens
// exactly then — a stuck kite stays until dad's last heave lands, then falls.
test("an object key timed to a move moment happens exactly at that moment", async () => {
  const { syncObjectKeys } = await import("./plan.ts");
  const plan = { ...base, height: 260, characters: [{ id: "d", x: 700, facing: "right" as const, actions: [{ move: "walk", params: { distance: 200 } }, { move: "pull", params: { heaves: 3 } }] }],
    objects: [{ id: "kite", look: { kind: "box" as const, size: 60, color: "#ef4444", filled: true, thickness: 4 }, keys: [{ t: 0, x: 1400, y: 500 }, { at: "d.pull1.last", x: 1400, y: 500 }, { at: "d.pull1.last", offset: 0.6, x: 1350, y: 860 }, { at: "nobody.jump1.land", x: 0, y: 0 }] }] } as unknown as ScenePlan;
  const scene = planToScene(plan, LIBRARY), last = scene.marks["d.pull1.last"];
  assert.ok(last !== undefined && last > 1, `the pull's last heave lands (${last})`);
  const keys = scene.objects![0].keys;
  assert.deepEqual(keys.map((k) => Number(k.t.toFixed(3))), [0, last, last + 0.6].map((t) => Number(t.toFixed(3))), "synced keys at the moment (+ offset); a moment that never comes is dropped");
  assert.equal(keys.length, 3);
  const built = buildScene(scene, 24), y = (t: number) => built.objects[Math.round(t * 24)].find((o) => o.id === "kite")!.y;
  assert.ok(Math.abs(y(last - 0.3) - 500) < 2, "still stuck just before the last heave");
  assert.ok(y(last + 0.6) > 800, "fallen after it");
  assert.deepEqual(syncObjectKeys({ objects: [] }, {}), { objects: [] });
});
