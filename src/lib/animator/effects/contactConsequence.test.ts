// A CONTACT HAS A CONSEQUENCE (effects/contactConsequence.ts): a hand in a hazard reacts by its kind; careful (warming) hands keep a
// gap; a strike on a held thing pushes the holder's arms back with lengths kept.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import type { EffectTrack } from "./index.ts";
import { BODY_STATUS, hazardGap, hazardTouches, hazardZones, takeHit } from "./contactConsequence.ts";
import { hazardIntent } from "../claude/claudeAnimator.ts";

type Plan = Parameters<typeof makeEffectsTestScene>[0];
// (a figure that stands, then reaches forward and DOWN for 2 s, then stands again)
const reach = [{ move: "stand", params: { seconds: 1 } }, { move: "custom", params: { name: "reach", keys: [{ pose: { lean: 20, rShoulder: 70, rElbow: 5, lShoulder: 60, lElbow: 10 }, hold: 2 }] } }, { move: "stand", params: { seconds: 1.5 } }];
const plan = (effects: unknown[]) => ({ id: "t", title: "t", height: 300, groundY: 900, pace: "natural", characters: [{ id: "a", name: "A", x: 600, facing: "right", look: { color: "#222222" }, actions: reach }], effects }) as unknown as Plan;
const run = (p: Plan) => { const scene = makeEffectsTestScene(p, 1920); return { scene, built: buildScene(scene, 24) }; };
// where the reaching hand is at 2 s with nothing there
const handAt2 = (() => { const { built } = run(plan([])); return built.frames[48][0].skeleton.rHand; })();
const fire = (extra: Record<string, unknown> = {}) => ({ kind: "fire", start: -1, end: 30, anchor: { x: Math.round(handAt2.x), y: Math.round(handAt2.y + 40) }, params: { size: 0.35, ...extra } });

test("BURN: a hand that goes into a fire is pulled out within 0.15 s and never goes back in; the body flinches away", () => {
  const { scene, built } = run(plan([fire()]));
  const zones = hazardZones((scene as { effects?: EffectTrack[] }).effects ?? [], 300, 2);
  assert.ok(zones.length === 1 && zones[0].kind === "burn");
  const inside = built.frames.map((f) => hazardGap(zones[0], f[0].skeleton.rHand) <= 0);
  const first = inside.indexOf(true);
  assert.ok(first > 0, "the hand does reach the fire");
  const stretch = inside.slice(first).indexOf(false);
  assert.ok(stretch >= 0 && stretch <= Math.round(0.15 * 24), `out within 0.15 s (in for ${stretch} pictures)`);
  assert.ok(!inside.slice(first + stretch + 1).some(Boolean), "never back in");
  assert.ok(!hazardTouches(scene, built, 300).some((t) => (t.to - t.from + 1) / 24 > 0.3), "the law's check passes");
  // smooth: no joint jumps more than a fast hand would in one picture (2.5 H/s ≈ 31 px at 24 fps, a jerk allowed 2x)
  for (let i = 1; i < built.frames.length; i += 1) for (const j of ["rHand", "neck", "head"] as const) {
    const a = built.frames[i - 1][0].skeleton[j], b = built.frames[i][0].skeleton[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 70, `${j} pops at picture ${i}`);
  }
});

test("CAREFUL HANDS: a fire marked touch 'avoid' (only warming) is never entered, and nothing reacts", () => {
  const { scene, built } = run(plan([fire({ touch: "avoid" })]));
  const zone = hazardZones((scene as { effects?: EffectTrack[] }).effects ?? [], 300, 2)[0];
  assert.ok(built.frames.every((f) => hazardGap(zone, f[0].skeleton.rHand) > 0), "the hand keeps a gap");
  const near = built.frames[48][0].skeleton.rHand;
  assert.ok(hazardGap(zone, near) < 0.12 * 300, "…but stays close to it (warming)");
});

test("SHOCK: touching an electric fence throws the body back away from it", () => {
  const fence = { kind: "prop", start: -1, end: 30, anchor: { x: Math.round(handAt2.x + 10), y: Math.round(handAt2.y) }, params: { name: "electric fence", size: 0.3, parts: [{ shape: "rect", x: 0, y: 0, w: 0.3, h: 2 }] } };
  const { built } = run(plan([fence]));
  const { built: none } = run(plan([]));
  const k = 48 + 6;
  assert.ok(built.frames[k][0].skeleton.neck.x < none.frames[k][0].skeleton.neck.x - 5, "the neck is thrown back (away from the fence)");
});

test("hazardIntent: warming → avoid; an accident → felt; fire-proof → safe", () => {
  const p = { effects: [{ kind: "fire", anchor: { x: 1, y: 1 }, params: {} }, { kind: "prop", anchor: { x: 1, y: 1 }, params: { name: "rock" } }] };
  const mode = (w: string) => ((hazardIntent(p, w).effects as { params: { touch?: string } }[])[0].params.touch);
  assert.equal(mode("he lights the campfire, then warms his hands by it"), "avoid");
  assert.equal(mode("he warms up, then accidentally touches the fire"), undefined);
  assert.equal(mode("a man accidentally touches an electric fence"), undefined);
  assert.equal(mode("the fire-proof hero walks through the flames"), "safe");
  assert.equal(((hazardIntent(p, "warms his hands").effects as { params: { touch?: string } }[])[1].params.touch), undefined, "a rock is no hazard");
});

test("takeHit: the holder's hands give back, the elbows bend, bone lengths stay, then it recovers", () => {
  const { built } = run(plan([]));
  const len = (s: typeof built.frames[0][0]["skeleton"]) => [Math.hypot(s.rElbow.x - s.neck.x, s.rElbow.y - s.neck.y), Math.hypot(s.rHand.x - s.rElbow.x, s.rHand.y - s.rElbow.y)];
  const before = built.frames.map((f) => ({ ...f[0].skeleton }));
  takeHit(built, "a", 2, 1.4, -1);
  const k = 48 + 2, a = built.frames[k][0].skeleton;
  assert.ok(a.rHand.x < before[k].rHand.x - 15, "pushed back hard by a strong hit");
  const [u0, f0] = len(before[k]), [u1, f1] = len(a);
  assert.ok(Math.abs(u0 - u1) < 0.5 && Math.abs(f0 - f1) < 0.5, "upper arm and forearm keep their lengths");
  const end = 48 + Math.round(0.9 * 24);
  assert.ok(Math.hypot(built.frames[end][0].skeleton.rHand.x - before[end].rHand.x, built.frames[end][0].skeleton.rHand.y - before[end].rHand.y) < 1, "recovered");
});

test("A REFLEX IS THE FASTEST MOVE: the burnt hand is fully OUT of the fire within 2 pictures, and shakes only outside it (gap kept)", () => {
  const { scene, built } = run(plan([fire()]));
  const z = hazardZones((scene as { effects?: EffectTrack[] }).effects ?? [], 300, 2)[0];
  const gaps = built.frames.map((f) => hazardGap(z, f[0].skeleton.rHand));
  const first = gaps.findIndex((g) => g <= 0);
  assert.ok(first > 0);
  assert.ok(gaps[first + 2] > 0.04 * 300, `clear of the fire 2 pictures later (gap ${gaps[first + 2].toFixed(1)} px)`);
  assert.ok(gaps.slice(first + 3, first + 30).every((g) => g > 0.04 * 300), "the pain shake happens outside the danger");
  const rf = (built as { reflexes?: { who: string; from: number; to: number }[] }).reflexes ?? [];
  assert.ok(rf.some((r) => r.who === "a" && r.from <= first && r.to >= first + 2), "the reflex is marked (the speed laws step aside)");
  const st = ((scene as { effects?: EffectTrack[] }).effects ?? []).filter((e) => e.kind === "bodyStatus");
  assert.ok(st.some((e) => e.params?.status === "burn" && (e.anchor as { joint?: string }).joint === "rHand"), "a small flame on the burnt hand");
});

test("SHOCK SHOWN ON THE BODY: arcs on every limb, both arms out to the sides (not in front), every limb trembles fast", () => {
  const fence = { kind: "prop", start: -1, end: 30, anchor: { x: Math.round(handAt2.x + 10), y: Math.round(handAt2.y) }, params: { name: "electric fence", size: 0.3, parts: [{ shape: "rect", x: 0, y: 0, w: 0.3, h: 2 }] } };
  const { scene, built } = run(plan([fence]));
  const arcs = ((scene as { effects?: EffectTrack[] }).effects ?? []).filter((e) => e.kind === "bodyStatus" && e.params?.status === "shock");
  assert.ok(arcs.length >= 8 && arcs.every((e) => e.target), "arcs from joint to joint over the limbs and torso");
  const t0 = Math.round(arcs[0].start * 24);
  // the trembling: the left hand (not the touched one) changes direction often over the next 0.8 s
  let turns = 0;
  for (let i = t0 + 3; i < t0 + 22; i += 1) { const a = built.frames[i - 1][0].skeleton.lHand.x - built.frames[i - 2][0].skeleton.lHand.x, b = built.frames[i][0].skeleton.lHand.x - built.frames[i - 1][0].skeleton.lHand.x; if (a * b < 0) turns += 1; }
  assert.ok(turns >= 5, `trembling, not a lean (${turns} direction changes)`);
  const sk = built.frames[t0 + 8][0].skeleton;
  assert.ok(sk.lHand.x < sk.neck.x + 0.05 * 300 && sk.rHand.x < sk.neck.x + 0.05 * 300, "no arm held out in front / toward the fence (it is ahead, +x)");
  assert.ok(Math.min(sk.lHand.y, sk.rHand.y) < sk.neck.y, "an arm is flung up");
  const shapes = BODY_STATUS.draw({ t: 0.2, duration: 1, fps: 24, at: { x: 0, y: 0 }, target: { x: 0, y: 100 }, height: 300, groundY: 900, stageWidth: 1920 }, { status: "shock", seed: 2 });
  const shapes2 = BODY_STATUS.draw({ t: 0.25, duration: 1, fps: 24, at: { x: 0, y: 0 }, target: { x: 0, y: 100 }, height: 300, groundY: 900, stageWidth: 1920 }, { status: "shock", seed: 2 });
  assert.ok(shapes.length + shapes2.length > 0, "the arcs draw");
  for (const st of ["burn", "cold", "wet"]) assert.ok(BODY_STATUS.draw({ t: 0.35, duration: 1.2, fps: 24, at: { x: 0, y: 0 }, height: 300, groundY: 900, stageWidth: 1920 }, { status: st }).length > 0, `${st} draws on the body`);
});
