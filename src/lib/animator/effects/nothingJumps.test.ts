// NOTHING EVER JUMPS (Arthur, Oct 14, a13 tug of war: the rope's knot jumped from Red's hand to Blue's when Red let go): where one
// thing's track takes over from another (let go, handed over, put down, a prop split), its drawn body starts where it was and
// travels — falls when dropped, glides hand to hand. effects/index.ts thingGlides + the rope's body riding its let-go end.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import { EFFECTS, buildEffectFrames, shapesCenter } from "./index.ts";

type Plan = Parameters<typeof makeEffectsTestScene>[0];
const H = 300, G = 900;
const run = (plan: unknown) => { const scene = makeEffectsTestScene(plan as Plan, 1920); const built = buildScene(scene, 24); return { built, fx: buildEffectFrames(scene as never, built) }; };
const fig = (id: string, x: number, facing: string) => ({ id, name: id, x, facing, look: { color: "#222222" }, actions: [{ move: "stand", params: { seconds: 3 } }] });
const ball = { name: "ball", size: 0.15, parts: [{ shape: "circle", x: 0, y: 0, w: 1, h: 1, color: "#f97316" }] };
const steps = (fx: ReturnType<typeof run>["fx"]) => { const c = fx.map((f) => shapesCenter(f.front)); return c.slice(1).map((p, i) => (p && c[i] ? Math.hypot(p.x - c[i]!.x, p.y - c[i]!.y) : 0)); };

test("NOTHING EVER JUMPS: a thing let go of falls from the hand to the floor — never pops onto it", () => {
  const { fx, built } = run({ id: "t", title: "t", height: H, groundY: G, pace: "natural", characters: [fig("a", 600, "right")], effects: [
    { kind: "prop", start: -1.5, end: 1, anchor: { character: "a", joint: "rHand" }, params: { ...ball, letGo: true } },
    { kind: "prop", start: 1, end: 60, anchor: { x: 760, y: G }, params: ball },
  ] });
  const s = steps(fx), at = Math.round(built.fps);
  assert.ok(Math.max(...s.slice(at - 2, at + 3)) < 0.1 * H, `no jump when it is let go (${s.slice(at - 2, at + 3).map(Math.round)})`);
  const end = shapesCenter(fx[fx.length - 1].front)!;
  assert.ok(Math.abs(end.x - 760) < 2 && end.y > G - 0.2 * H, "it lands where its new track puts it");
  const mid = shapesCenter(fx[at + 3].front)!, start = shapesCenter(fx[at - 1].front)!;
  assert.ok(mid.y > start.y + 2 && mid.y < end.y - 2, "it is still falling a few pictures later");
});

test("NOTHING EVER JUMPS: a thing handed from one hand to another travels between the hands", () => {
  const { fx, built } = run({ id: "t", title: "t", height: H, groundY: G, pace: "natural", characters: [fig("a", 500, "right"), fig("b", 1100, "left")], effects: [
    { kind: "prop", start: -1.5, end: 1, anchor: { character: "a", joint: "rHand" }, params: { ...ball, letGo: true } },
    { kind: "prop", start: 1, end: 60, anchor: { character: "b", joint: "lHand" }, params: ball },
  ] });
  const s = steps(fx), at = Math.round(built.fps);
  assert.ok(Math.max(...s) < 0.2 * H, `never more than a small step a picture (${Math.round(Math.max(...s))} px)`);
  assert.ok(s.slice(at, at + 6).filter((v) => v > 2).length >= 4, "it moves over several pictures");
});

test("NOTHING EVER JUMPS: a stretched rope let go of keeps its body (knot) on the end that was let go, falling with it", () => {
  const draw = EFFECTS.prop.draw, dropFrom = { x: 700, y: 650 }, hold = { x: 1100, y: 650 }, ground = { x: 760, y: G - 2 };
  const ctx = (t: number) => ({ t, duration: 5, fps: 24, at: hold, target: ground, height: H, groundY: G, stageWidth: 1920, facing: "left" as const });
  const params = { name: "rope", size: 0.05, string: "#b08850", slack: true, dropFrom, parts: [{ shape: "circle", x: 0, y: 0, w: 1, h: 1, color: "#b08850" }] };
  const body = (t: number) => shapesCenter(draw(ctx(t), params as never))!;
  assert.ok(Math.hypot(body(0).x - dropFrom.x, body(0).y - dropFrom.y) < 0.03 * H, `the knot starts in the hand that let go (${JSON.stringify(body(0))})`);
  assert.ok(body(2).y > G - 0.1 * H, "it ends on the ground");
  assert.ok(Math.hypot(body(2).x - hold.x, body(2).y - hold.y) > 0.5 * H, "never in the other holder's hand");
});
