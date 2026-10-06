// TEXT IN ANIMATION (SPEC-0017 Phase 2C, 2026-10-07): words pop out of their source, hold still to read, then go —
// for any words, at any frame rate — and the "Explosion with text" test scene.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { moveShape } from "../camera.ts";
import { effectsTestButtons, makeEffectsTestScene } from "../moves/tests2c.ts";
import { explosionTextPlan, TEXT_AFTER, TEXT_BOOM } from "../moves/scenesText.ts";
import { shapeBounds } from "../symbolMaker.ts";
import { shapesStageBox } from "../toFrames.ts";
import { buildEffectFrames, EFFECTS, type EffectScene } from "./index.ts";
import { POP, popAt, READ_SECONDS, textCorners, textPlacement, textWidth } from "./text.ts";
import type { EffectContext, Shape, TextShape } from "./types.ts";

const H = 280, G = 900;
const ctx = (t: number, duration = 3, at = { x: 960, y: G }): EffectContext => ({ t, duration, fps: 12, at, height: H, groundY: G, stageWidth: 1920 });
const texts = (shapes: readonly Shape[]) => shapes.filter((s): s is TextShape => s.kind === "text");
// The longest stretch (seconds) the words are readable: full size, straight, not squashed, not fading, not moving.
function longestRead(duration: number, step = 1 / 120) {
  let best = 0, from = -1;
  for (let t = 0; t <= duration + 1e-9; t += step) {
    const p = popAt(t, duration);
    const ok = p.travel === 1 && Math.abs(p.scale - 1) <= 0.03 && Math.abs(p.stretch - 1) <= 0.03 && Math.abs(p.rotation) <= 2 && p.alpha >= 0.99;
    if (ok && from < 0) from = t;
    if (!ok && from >= 0) { best = Math.max(best, t - from); from = -1; }
    if (ok) best = Math.max(best, t - from);
  }
  return best;
}

test("text: the recipe is registered and draws one word box (any words; none for empty words)", () => {
  assert.ok(EFFECTS.text);
  const [s] = texts(EFFECTS.text.draw(ctx(1.5), { text: "POW!" }));
  assert.equal(s.text, "POW!");
  assert.equal(s.points.length, 8);
  assert.ok(s.stroke && s.fill && (s.width ?? 0) > 0.1 * s.size, "a thick dark outline and a fill");
  assert.equal(EFFECTS.text.draw(ctx(1.5), { text: "  " }).length, 0);
});

test("text: the box goes back to where, how turned and how stretched the words are", () => {
  const pts = textCorners("BOOM!", 100, 700, 400, 9, 1.3, 0.8);
  const p = textPlacement({ kind: "text", text: "BOOM!", size: 100, points: pts });
  assert.ok(Math.abs(p.x - 700) < 1e-6 && Math.abs(p.y - 400) < 1e-6);
  assert.ok(Math.abs(p.rotation - 9) < 1e-6 && Math.abs(p.scaleX - 1.3) < 1e-6 && Math.abs(p.scaleY - 0.8) < 1e-6);
  // moved like any shape (the camera's shake), measured like any shape (the page fit, the app's picture box)
  const s: TextShape = { kind: "text", text: "BOOM!", size: 100, points: pts };
  const moved = moveShape(s, { x: 50, y: -20 }) as TextShape, q = textPlacement(moved);
  assert.ok(Math.abs(q.x - 750) < 1e-6 && Math.abs(q.y - 380) < 1e-6 && Math.abs(q.rotation - 9) < 1e-6);
  const b = shapeBounds([s]), box = shapesStageBox([s]);
  assert.ok(b.maxX - b.minX >= textWidth("BOOM!", 100) * 1.2 && box.right - box.left >= b.maxX - b.minX);
});

test("text: TEXT POPS OUT — small out of the source, overshoots past full size, settles to full size", () => {
  const d = 3;
  assert.ok(popAt(0, d).scale <= 0.25 && popAt(0, d).travel === 0, "leaves small, from the source");
  let peak = 0;
  for (let t = 0; t <= 0.6; t += 1 / 120) peak = Math.max(peak, popAt(t, d).scale);
  assert.ok(peak > 1.15 && peak < 1.4, `grows past full size (${peak.toFixed(2)})`);
  // stretched along the flight at first, squashed as it arrives
  assert.ok(popAt(0.02, d).stretch > 1.2 && popAt(POP.shoot, d).stretch < 0.9);
  // settled: full size and straight by a second
  for (const t of [1, 1.5, 2]) { const p = popAt(t, d); assert.ok(Math.abs(p.scale - 1) < 0.01 && Math.abs(p.rotation) < 0.5, `settled at ${t}`); }
  // it tilts as it leaves and the wobble dies away
  assert.ok(Math.abs(popAt(0, d).rotation) >= 8);
});

test("text: never a jump — the words move in steps you can see, fastest first (easing out), and every value is smooth", () => {
  for (const fps of [8, 12, 24]) {
    let last = popAt(0, 3), gaps: number[] = [];
    for (let i = 1; i / fps <= 3; i += 1) {
      const p = popAt(i / fps, 3);
      gaps.push(p.travel - last.travel);
      // (no picture-to-picture jump in size or tilt, at 8 a second too)
      assert.ok(Math.abs(p.scale - last.scale) < (fps === 8 ? 0.8 : 0.6), `size step at ${fps} fps, picture ${i}`);
      assert.ok(Math.abs(p.rotation - last.rotation) < 20, `tilt step at ${fps} fps`);
      last = p;
    }
    gaps = gaps.filter((g) => g > 1e-6);
    assert.ok(gaps.length >= 2, `at least 2 pictures on the way at ${fps} fps`);
    assert.ok(gaps[0] <= 0.75, `the first step is not the whole way (${fps} fps)`);
    for (let k = 1; k < gaps.length; k += 1) assert.ok(gaps[k] <= gaps[k - 1] + 1e-9, "easing out");
  }
});

test("text: HOLDS STILL long enough to read (1.2 s+), then swells a little and shrinks and fades away", () => {
  for (const d of [2.2, 3, 3.1, 5]) assert.ok(longestRead(d) >= READ_SECONDS, `${d} s: readable ${longestRead(d).toFixed(2)} s`);
  const d = 3, outAt = d - POP.out;
  assert.ok(popAt(outAt + POP.swell, d).scale > 1.03, "a little swell first (anticipation)");
  const end = popAt(d, d), late = popAt(d - 0.1, d);
  assert.ok(end.alpha <= 0.01 && end.scale < 0.5 && late.scale < 1 && late.alpha < 1, "shrinks and fades away");
});

test("text: stays on the page (words near the edge are kept inside it)", () => {
  for (const x of [40, 960, 1880]) for (const t of [0.05, 0.3, 0.5, 1.5, 2.8]) {
    for (const s of texts(EFFECTS.text.draw(ctx(t, 3, { x, y: G }), { text: "KABOOOM!" }))) {
      const b = shapeBounds([s]);
      assert.ok(b.minX >= -1 && b.maxX <= 1921 && b.minY >= 0 && b.maxY <= G, `x ${x} at ${t}s`);
    }
  }
});

test("scene: Explosion with text — the 20th Effects (2C) button, builds at 8, 12 and 24 fps, words a beat after the blast", () => {
  const buttons = effectsTestButtons(), i = buttons.findIndex((b) => b.id === "explosionText");
  assert.equal(i, 19);
  assert.equal(buttons[i - 1].id, "swordFight");
  assert.equal(buttons[i].label, "Explosion with text");
  const plan = buttons[i].make()!;
  const scene = makeEffectsTestScene(plan, 1920) as EffectScene;
  for (const fps of [8, 12, 24]) {
    const built = buildScene(scene, fps), fx = buildEffectFrames(scene, built), seconds = built.frames.length / fps;
    assert.ok(seconds >= 4 && seconds <= 5.2, `about 4-5 s (${seconds.toFixed(2)})`);
    const width = scene.stageWidth ?? 1920;
    let first = -1, readFrames = 0;
    fx.forEach((f, k) => {
      const words = texts([...f.back, ...f.front, ...(f.top ?? [])]);
      if (!words.length) return;
      if (first < 0) first = k;
      assert.equal(words[0].text, "BOOM!");
      const b = shapeBounds(words);
      assert.ok(b.minX >= -1 && b.maxX <= width + 1 && b.maxY <= scene.groundY, `on the page at ${k}`);
      const p = textPlacement(words[0]);
      if (Math.abs(p.scaleX - 1) < 0.03 && Math.abs(p.scaleY - 1) < 0.03 && Math.abs(p.rotation) < 2 && (words[0].alpha ?? 1) > 0.99) readFrames += 1;
    });
    assert.ok(first >= 0 && first / fps >= TEXT_BOOM + TEXT_AFTER - 1e-9 && first / fps < TEXT_BOOM + TEXT_AFTER + 0.2, `words come out ${TEXT_AFTER}s after the blast (${fps} fps)`);
    assert.ok(readFrames / fps >= READ_SECONDS, `readable ${(readFrames / fps).toFixed(2)} s at ${fps} fps`);
    // the explosion is there when the words come out of it
    assert.ok(fx[first].back.length > 0, "the blast behind the words");
  }
  // any words
  const pow = explosionTextPlan("POW!");
  assert.equal(pow.effects!.find((e) => e.kind === "text")!.params!.text, "POW!");
});

test("scene 20: a white page, two stick figures, an AIR explosion high above them (bursts evenly all round) and the words straight out of its middle (Arthur, Oct 7)", () => {
  const plan = explosionTextPlan();
  assert.equal(plan.background, undefined, "a plain white page (no background)");
  assert.equal(plan.characters.length, 2, "two stick figures");
  const blast = plan.effects!.find((e) => e.kind === "explosion")!, words = plan.effects!.find((e) => e.kind === "text")!;
  assert.equal(blast.params?.air, true, "an air explosion: it bursts evenly in all directions (on the ground it could only go up)");
  const at = blast.anchor as { x: number; y: number };
  assert.ok(plan.groundY - at.y > 1.5 * plan.height, "high in the air, above the figures' heads");
  assert.deepEqual(words.anchor, blast.anchor, "the words come out of the blast's middle");
});

test("scene 20: the blast is FELT — the whole picture jolts hard for just 2 impact pictures at 12 a second, then stops dead (Arthur, Oct 7)", async () => {
  const { buildScene } = await import("../engine.ts");
  const { makeEffectsTestScene } = await import("../moves/tests2c.ts");
  const scene = { ...makeEffectsTestScene(explosionTextPlan(), 1920), stageWidth: 1920 };
  const b = buildScene(scene, 12) as unknown as { camera: { shake: { x: number; y: number }[] } };
  const jolted = b.camera.shake.map((p, i) => ({ i, d: Math.hypot(p.x, p.y) })).filter((p) => p.d > 0.5);
  assert.equal(jolted.length, 2, `two impact pictures (${jolted.map((p) => p.i).join(",")})`);
  assert.ok(jolted.every((p) => p.d > 0.012 * 1080), "both hard jolts, not a wobble");
  assert.equal(jolted[0].i, Math.round(TEXT_BOOM * 12), "on the blast");
});
