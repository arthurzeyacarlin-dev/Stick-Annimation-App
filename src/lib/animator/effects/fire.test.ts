// Fire recipes (SPEC-0017 Phase 2C): pure, rising, building up, on the page, and obeying the color knobs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES, fireParticle } from "./fire.ts";
import type { EffectContext, EffectParams, Shape } from "./types.ts";

const IDS = ["fire", "fireStream", "fireball", "fireBurst", "wildfire"];
const recipe = (id: string) => RECIPES.find((r) => r.id === id)!;
const ctx = (t: number, over: Partial<EffectContext> = {}): EffectContext => ({ t, duration: 3, fps: 12, at: { x: 900, y: 900 }, height: 300, groundY: 900, stageWidth: 1920, ...over });
// each recipe with the anchor/target it is made for
const setups: Record<string, Partial<EffectContext>> = {
  fire: {},
  fireStream: { at: { x: 760, y: 760 }, target: { x: 1300, y: 800 } },
  fireball: { at: { x: 760, y: 760 }, target: { x: 1400, y: 740 } },
  fireBurst: { duration: 1.2 },
  wildfire: { duration: 4 },
};
const fillsOf = (shapes: Shape[]) => new Set(shapes.map((s) => ("fill" in s && s.fill) || ("stroke" in s && s.stroke) || ""));

test("all five fire recipes are there", () => {
  for (const id of IDS) assert.ok(recipe(id), id);
  for (const r of RECIPES) assert.ok(r.about.length > 40, r.id);
});

test("deterministic: the same moment gives the same shapes", () => {
  for (const id of IDS) for (const t of [0, 0.37, 1.2, 2.5]) {
    const c = ctx(t, setups[id]);
    assert.deepEqual(recipe(id).draw(c, { seed: 4 }), recipe(id).draw(c, { seed: 4 }), `${id} at ${t}`);
  }
});

test("fire rises: a flame particle goes up over its life, and the flame stands above its base", () => {
  const o = { x: 900, y: 850, h: 100, w: 40, life: 0.6, rise: 0.75, lean: 0, turbulence: 0.5, seed: 7 };
  for (let i = 0; i < 6; i += 1) {
    const born = fireParticle(i, 5, o).bornAt;
    const ys = [0.02, 0.2, 0.4, 0.6, 0.8, 0.97].map((f) => fireParticle(i, born + f * o.life, o).y);
    for (let j = 1; j < ys.length; j += 1) assert.ok(ys[j] < ys[j - 1], `particle ${i} rises`);
  }
  const shapes = recipe("fire").draw(ctx(1.5), {});
  const top = Math.min(...shapes.flatMap((s) => (s.kind === "circle" ? [s.y - s.r] : s.kind === "rect" || s.kind === "symbol" ? [s.y] : s.points.filter((_, j) => j % 2 === 1))));
  assert.ok(900 - top > 300 * 0.3, `flame reaches up (${900 - top}px)`);
  // a burst's fire is thrown up: its average height goes up after the flash
  const avgY = (sh: Shape[]) => { const c = sh.filter((s) => s.kind === "circle") as Extract<Shape, { kind: "circle" }>[]; return c.reduce((a, s) => a + s.y, 0) / c.length; };
  assert.ok(avgY(recipe("fireBurst").draw(ctx(0.5, setups.fireBurst), {})) < avgY(recipe("fireBurst").draw(ctx(0.04, setups.fireBurst), {})));
});

test("build-up: few shapes at the start, more in the middle", () => {
  for (const id of ["fire", "fireStream", "wildfire"]) {
    const D = setups[id].duration ?? 3;
    const first = recipe(id).draw(ctx(0, setups[id]), {}).length;
    const mid = recipe(id).draw(ctx(D / 2, setups[id]), {}).length;
    assert.ok(mid > first * 2 && mid >= 10, `${id}: ${first} at the start, ${mid} in the middle`);
  }
  // and the fire dies down at the end
  assert.ok(recipe("fire").draw(ctx(2.99), {}).length < recipe("fire").draw(ctx(1.5), {}).length);
});

test("nothing is drawn below the ground or off the page", () => {
  const ground = 900;
  for (const id of IDS) for (let t = 0; t <= (setups[id].duration ?? 3); t += 0.05) {
    const c = ctx(t, { ...setups[id], at: id === "fireStream" || id === "fireball" ? { x: 760, y: 880 } : { x: 1850, y: 905 }, target: id === "fireStream" || id === "fireball" ? { x: 1300, y: 960 } : undefined });
    for (const s of recipe(id).draw(c, { turbulence: 1.2, spread: 60 })) {
      if (s.kind === "circle") { assert.ok(s.y + s.r <= ground + 1e-6, `${id} circle at ${t}`); assert.ok(s.x >= 0 && s.x <= 1920); }
      else if (s.kind === "rect") assert.ok(s.y + s.h <= ground + 1e-6);
      else if (s.kind !== "symbol") for (let j = 0; j + 1 < s.points.length; j += 2) { assert.ok(s.points[j + 1] <= ground + 1e-6, `${id} point at ${t}`); assert.ok(s.points[j] >= 0 && s.points[j] <= 1920); }
    }
  }
});

test("the color knobs change the colors (blue fire, green fire)", () => {
  const blue: EffectParams = { color: "#2f7bff", color2: "#bfe3ff" };
  const green: EffectParams = { color: "#21c45d", color2: "#c8ffb0" };
  for (const id of IDS) {
    const c = ctx(id === "fireBurst" ? 0.3 : 1.4, setups[id]);
    const orange = fillsOf(recipe(id).draw(c, {}));
    const b = fillsOf(recipe(id).draw(c, blue));
    const g = fillsOf(recipe(id).draw(c, green));
    assert.ok(orange.has("#ff8a1f") && b.has("#2f7bff") && g.has("#21c45d"), `${id} uses the main color`);
    assert.ok(!b.has("#ff8a1f") && !b.has("#ffd23f") && !b.has("#e53b1c") && !g.has("#ff8a1f") && !g.has("#e53b1c"), `${id}: no orange/red left in blue/green fire`);
    // blue fire is blue: every fill has more blue than red (the gray smoke stays gray)
    for (const col of b) if (/^#[0-9a-f]{6}$/i.test(col) && col !== "#9a9a9a") {
      const [r, , bl] = [1, 3, 5].map((j) => parseInt(col.slice(j, j + 2), 16));
      assert.ok(bl >= r, `${id}: ${col} should look blue`);
    }
  }
});

// DRAWABLE BY HAND, NOT TOO SIMPLE (Arthur, round 3): fire is drawn like his favorite standing flame — a few
// layered flat shapes (red, orange, yellow) whose outlines are rough ZIGZAGS with many points that change every
// picture, plus little flames breaking off — about a minute and a half to draw one picture by hand. Not hundreds
// of circles, and not too simple: no spears, no diamonds (no 4–6 point shapes), no straight-line cones.
const polysOf = (shapes: Shape[]) => shapes.filter((s) => s.kind === "poly") as Extract<Shape, { kind: "poly" }>[];
// how many times an outline switches from turning left to turning right (a zigzag switches a lot)
const zigzags = (pts: number[]) => {
  let n = 0, prev = 0;
  const m = pts.length / 2;
  for (let i = 0; i < m; i += 1) {
    const a = i, b = (i + 1) % m, c = (i + 2) % m;
    const cross = (pts[2 * b] - pts[2 * a]) * (pts[2 * c + 1] - pts[2 * b + 1]) - (pts[2 * b + 1] - pts[2 * a + 1]) * (pts[2 * c] - pts[2 * b]);
    const sg = Math.sign(cross);
    if (sg && prev && sg !== prev) n += 1;
    if (sg) prev = sg;
  }
  return n;
};
const mainShape = (shapes: Shape[]) => polysOf(shapes).sort((a, b) => b.points.length - a.points.length)[0];
// the outline's shape with where it is taken away (so a moving flame that keeps its shape counts as "the same")
const centred = (pts: number[]) => { const m = pts.length / 2; let cx = 0, cy = 0; for (let i = 0; i < m; i += 1) { cx += pts[2 * i] / m; cy += pts[2 * i + 1] / m; } return pts.map((v, i) => v - (i % 2 ? cy : cx)); };
const differs = (a: number[], b: number[]) => a.length !== b.length || centred(a).some((v, i) => Math.abs(v - centred(b)[i]) > 2);

test("drawable by hand, not too simple: zigzag flame shapes with many points, a few dozen shapes, that move", () => {
  const cases: { id: string; over: Partial<EffectContext>; full: [number, number] }[] = [
    { id: "fireStream", over: setups.fireStream, full: [0.4, 2.4] },
    { id: "fireStream", over: { at: { x: 560, y: 700 }, target: { x: 1360, y: 760 }, duration: 1.4 }, full: [0.5, 1] },
    { id: "fireball", over: setups.fireball, full: [0.8, 2.8] },
    { id: "fireBurst", over: setups.fireBurst, full: [0.05, 0.45] },
  ];
  for (const { id, over, full } of cases) for (const params of [{}, { color: "#2f7bff", color2: "#bfe3ff" }] as EffectParams[]) {
    const dur = over.duration ?? 3;
    let prev: number[] | undefined, moved = 0, pairs = 0;
    for (let f = 0; f / 12 <= dur; f += 1) {
      const t = f / 12, shapes = recipe(id).draw(ctx(t, over), params);
      const at = `${id} ${JSON.stringify(params)} at ${t.toFixed(2)}s`;
      assert.ok(shapes.length <= 60, `${at}: ${shapes.length} shapes (never hundreds of pieces)`);
      assert.ok(shapes.filter((s) => "glow" in s && s.glow).length <= 1, `${at}: one soft glow at most`);
      // every flame shape is a zigzag flame, never a 4–6 point diamond or spear
      for (const p of polysOf(shapes)) assert.ok(p.points.length / 2 >= 12, `${at}: a ${p.points.length / 2}-point shape`);
      if (t < full[0] || t > full[1]) { prev = undefined; continue; }
      assert.ok(shapes.length >= (id === "fireBurst" ? 8 : 10), `${at}: only ${shapes.length} shapes (too simple)`);
      const main = mainShape(shapes);
      assert.ok(main.points.length / 2 >= 16, `${at}: main shape has ${main.points.length / 2} points`);
      assert.ok(zigzags(main.points) >= 8, `${at}: main outline zigzags only ${zigzags(main.points)} times`);
      if (prev) { pairs += 1; if (differs(prev, main.points)) moved += 1; }
      prev = main.points;
    }
    assert.ok(pairs > 0 && moved === pairs, `${id}: its outline changes every picture (${moved} of ${pairs})`);
  }
  // the blast's head is ragged and ROUND where it hits — as wide as the fire there, never a spear point
  const c = ctx(1.5, setups.fireStream), L = Math.hypot(540, 40), ux = 540 / L, uy = 40 / L;
  const pts = mainShape(recipe("fireStream").draw(c, {})).points;
  const P = pts.flatMap((v, i) => (i % 2 ? [] : [[(v - 760) * ux + (pts[i + 1] - 760) * uy, -(v - 760) * uy + (pts[i + 1] - 760) * ux]]));
  const front = Math.max(...P.map((q) => q[0])), back = Math.min(...P.map((q) => q[0]));
  const across = (qs: number[][]) => Math.max(...qs.map((q) => q[1])) - Math.min(...qs.map((q) => q[1]));
  assert.ok(Math.abs(front - L) < 0.12 * L, `the fire reaches what it is aimed at (${front.toFixed(0)} of ${L.toFixed(0)} px)`);
  assert.ok(across(P.filter((q) => q[0] >= front - 0.12 * (front - back))) > 0.45 * across(P), "a round head, not a spear tip");
  // wildfire is a row of real flames, still not hundreds of pieces
  for (let f = 0; f / 12 <= 4; f += 1) assert.ok(recipe("wildfire").draw(ctx(f / 12, setups.wildfire), {}).length <= 60);
  // the default colors are the 4 flat fire colors: red, orange, yellow, gray smoke
  for (const id of ["fireStream", "fireball", "fireBurst"]) {
    const all = new Set<string>();
    for (let f = 0; f <= 36; f += 1) for (const col of fillsOf(recipe(id).draw(ctx(f / 12, setups[id]), {}))) all.add(col);
    for (const col of all) assert.ok(["#e53b1c", "#ff8a1f", "#ffd23f", "#9a9a9a"].includes(col), `${id}: unexpected color ${col}`);
    for (const col of ["#e53b1c", "#ff8a1f", "#ffd23f"]) assert.ok(all.has(col), `${id} uses ${col}`);
  }
});
