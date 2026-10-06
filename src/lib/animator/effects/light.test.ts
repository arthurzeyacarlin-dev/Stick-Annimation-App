import assert from "node:assert/strict";
import test from "node:test";
import { EFFECTS } from "./index.ts";
import { flickerBrightness, RECIPES } from "./light.ts";
import type { EffectContext, EffectParams, Shape } from "./types.ts";

// LIGHT (SPEC-0017 Phase 2C): a flickering bulb, a soft pulsing glow and a quick flash, all made by rules.

const GROUND = 900;
const ctxAt = (t: number, over: Partial<EffectContext> = {}): EffectContext => ({ t, duration: 4, fps: 24, at: { x: 960, y: GROUND - 500 }, height: 300, groundY: GROUND, stageWidth: 1920, ...over });
const circles = (s: Shape[]) => s.filter((x): x is Extract<Shape, { kind: "circle" }> => x.kind === "circle");
const allY = (s: Shape[]) => s.flatMap((x) => (x.kind === "circle" ? [x.y + x.r] : x.kind === "rect" ? [x.y + x.h] : x.kind === "symbol" ? [x.y] : x.points.filter((_, i) => i % 2 === 1)));
// The bulb's light = the alpha of its biggest circle.
const lightOf = (s: Shape[]) => { const c = circles(s); if (!c.length) return 0; const big = c.reduce((a, b) => (b.r > a.r ? b : a)); return big.r > 100 ? big.alpha ?? 1 : 0; };

test("light: the ids are registered", () => {
  assert.deepEqual(RECIPES.map((r) => r.id), ["flicker", "glow", "flash"]);
  for (const id of ["flicker", "glow", "flash"]) assert.ok(EFFECTS[id]);
});

test("light: the same moment and knobs give the same shapes", () => {
  for (const id of ["flicker", "glow", "flash"]) for (const t of [0, 0.07, 0.5, 1.3]) assert.deepEqual(EFFECTS[id].draw(ctxAt(t), { seed: 3 }), EFFECTS[id].draw(ctxAt(t), { seed: 3 }));
  assert.deepEqual(EFFECTS.flicker.draw(ctxAt(1.25, { fps: 8 }), {}), EFFECTS.flicker.draw(ctxAt(1.25, { fps: 30 }), {}));
});

test("flicker: the brightness changes over time but the bulb is mostly on, with dips and a blackout", () => {
  for (const seed of [1, 2, 3, 4]) {
    const samples = Array.from({ length: 600 }, (_, i) => flickerBrightness(i / 60, { seed }));
    const on = samples.filter((b) => b > 0.7).length / samples.length;
    assert.ok(on >= 0.6, `seed ${seed}: on ${(on * 100).toFixed(0)}% of the time`);
    assert.ok(samples.some((b) => b < 0.45), `seed ${seed}: it dips`);
    assert.ok(new Set(samples.map((b) => b.toFixed(2))).size > 10, "it is not constant");
  }
  // over 10 s, some seed blacks out
  assert.ok([1, 2, 3, 4].some((seed) => Array.from({ length: 600 }, (_, i) => flickerBrightness(i / 60, { seed })).some((b) => b < 0.1)));
  // the drawn light follows it
  const lights = Array.from({ length: 120 }, (_, i) => lightOf(EFFECTS.flicker.draw(ctxAt(i / 24), { seed: 2 })));
  assert.ok(Math.max(...lights) - Math.min(...lights) > 0.06, "the light brightens and dims");
  // more turbulence = more trouble
  const off = (turbulence: number) => Array.from({ length: 2000 }, (_, i) => flickerBrightness(i / 50, { seed: 5, turbulence })).filter((b) => b < 0.5).length;
  assert.ok(off(1) > off(0));
});

test("flicker: the bulb is drawn, and the ground under it is lit when it is on", () => {
  const s = EFFECTS.flicker.draw(ctxAt(0.05), {});
  // STILL THINGS ARE SYMBOLS: the bulb itself (glass + screw base) is the "Light bulb" symbol, on top; its light is drawn.
  const bulb = s.at(-1);
  assert.ok(bulb?.kind === "symbol" && bulb.name === "Light bulb" && Math.abs(bulb.x - 960) < 1e-9, "the bulb");
  assert.ok(!s.some((x) => x.kind === "rect"), "the screw base is in the symbol, not drawn");
  assert.ok(circles(s).some((c) => c.r > 5 && c.r < 40 && Math.abs(c.x - 960) < 1), "the glass");
  const groundLit = (shapes: Shape[]) => shapes.some((x) => x.kind === "poly" && x.points.filter((_, i) => i % 2 === 1).some((y) => Math.abs(y - GROUND) < 0.5) && (x.alpha ?? 1) > 0.1);
  assert.ok(groundLit(s));
  // in a blackout the ground is dark
  const black = Array.from({ length: 2000 }, (_, i) => i / 50).find((t) => flickerBrightness(t, { seed: 1 }) < 0.1);
  if (black !== undefined) assert.ok(!groundLit(EFFECTS.flicker.draw(ctxAt(black), { seed: 1 })));
});

test("light: the color knob works", () => {
  for (const id of ["flicker", "glow", "flash"]) {
    const s = EFFECTS[id].draw(ctxAt(0.1, { duration: 2 }), { color: "#9b4dff" } as EffectParams);
    assert.ok(s.some((x) => ("fill" in x && x.fill === "#9b4dff") || ("stroke" in x && x.stroke === "#9b4dff")), id);
  }
});

test("glow: soft and steady, pulsing gently around the anchor", () => {
  const at = { x: 500, y: 600 };
  const sizes = Array.from({ length: 48 }, (_, i) => Math.max(...circles(EFFECTS.glow.draw(ctxAt(0.3 + i / 24, { at }), {})).map((c) => c.r)));
  assert.ok(Math.max(...sizes) > Math.min(...sizes) + 1, "it pulses");
  assert.ok(Math.max(...sizes) < Math.min(...sizes) * 1.35, "gently");
  const c = circles(EFFECTS.glow.draw(ctxAt(1, { at }), {}));
  assert.ok((c.reduce((a, b) => (b.r > a.r ? b : a)).alpha ?? 1) <= 0.3, "the aura is soft");
});

test("flash: a quick burst that grows, then is gone", () => {
  const at = { x: 960, y: 700 };
  const big = (t: number) => Math.max(0, ...circles(EFFECTS.flash.draw(ctxAt(t, { at }), {})).map((c) => c.r));
  assert.ok(big(0) > 0, "bright on the first picture");
  assert.ok(big(0.14) > big(0.02), "it grows");
  assert.ok(EFFECTS.flash.draw(ctxAt(0.1, { at }), {}).some((x) => x.kind === "line"), "rays");
  assert.deepEqual(EFFECTS.flash.draw(ctxAt(0.45, { at }), {}), []);
});

test("light: nothing below the ground", () => {
  for (const id of ["flicker", "glow", "flash"]) for (const y of [GROUND - 500, GROUND - 60, GROUND - 5]) for (const t of [0, 0.05, 0.1, 0.2, 0.8]) {
    const ys = allY(EFFECTS[id].draw(ctxAt(t, { at: { x: 960, y } }), {}));
    if (ys.length) assert.ok(Math.max(...ys) <= GROUND + 1e-6, `${id} at y ${y}, t ${t}: ${Math.max(...ys)}`);
  }
});
