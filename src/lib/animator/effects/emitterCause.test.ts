import assert from "node:assert/strict";
import { test } from "node:test";
import type { SceneFrames } from "../engine.ts";
import { causeList, emitterNeed, mouthOf } from "./emitterCause.ts";
import { buildEffectFrames, fromToolHead, toolHeads } from "./index.ts";
import { bubbles } from "./bubbles.ts";
import { RECIPES as SMOKE } from "./smoke.ts";
import type { EffectTrack, Shape } from "./types.ts";

// EMITTERS ONLY WHEN THEIR CAUSE IS TRUE (Arthur, Oct 14, the bubble wand: "he should only blow bubbles when it's next to his face —
// he's shooting bubbles a mile away from him") and SMOKE RISES UP FROM ITS FLAME ("he is holding the torch, but the smoke is in front
// of him — why?").

const FPS = 12, H = 300, G = 900;
const wand: EffectTrack = { kind: "prop", start: 0, end: 9, anchor: { character: "a", joint: "rHand" }, params: { name: "bubble wand", size: 0.16, parts: [{ shape: "line", x: 0, y: 0.5, w: 0, h: -0.7 }, { shape: "circle", x: 0, y: -0.35, w: 0.4, h: 0.4 }] } };
const blow: EffectTrack = { kind: "bubbles", start: 0, end: 9, anchor: { character: "a", joint: "rHand" }, params: { count: 10 } };

// A kid facing right whose wand hand is at the mouth for 0–2 s, lowered and still at the hip for 2–5 s (talking), back at the mouth 5–7 s.
const handAt = (t: number) => (t < 2 || (t >= 5 && t < 7) ? { x: 530, y: 440 } : { x: 520, y: 620 });
function built(seconds: number): SceneFrames {
  const frames = [] as unknown[], objects = [] as unknown[];
  for (let i = 0; i <= seconds * FPS; i += 1) {
    const hand = handAt(i / FPS), j = (x: number, y: number) => ({ x, y });
    const skeleton = { head: j(500, 430), neck: j(500, 460), hip: j(500, 600), lHand: j(480, 640), rHand: hand, lElbow: j(480, 560), rElbow: j(hand.x - 30, (hand.y + 480) / 2 + 20), lFoot: j(480, 900), rFoot: j(520, 900), lKnee: j(480, 750), rKnee: j(520, 750), lShoulder: j(500, 480), rShoulder: j(500, 480) };
    frames.push([{ id: "a", skeleton, facing: "right", headRadius: 25, height: H }]);
    objects.push([]);
  }
  return { fps: FPS, frames, objects } as unknown as SceneFrames;
}

test("what needs a cause: a wand's bubbles need the mouth or a wave; a whistle needs the mouth; plain emitters need nothing", () => {
  assert.equal(emitterNeed(blow, [wand, blow]), "mouthOrMoving");
  assert.equal(emitterNeed({ ...blow, kind: "smoke" }, [{ ...wand, params: { ...wand.params, name: "whistle" } }]), "mouth");
  assert.equal(emitterNeed(blow, [blow]), undefined, "bubbles with nothing in the hand: a bubble machine / magic — not gated");
  assert.equal(emitterNeed({ ...blow, params: { motion: "float" } }, [wand]), undefined, "floating bubbles stay put");
  assert.equal(emitterNeed({ ...blow, params: { needs: "none" } }, [wand]), undefined, "the plan can switch it off");
  assert.equal(emitterNeed({ ...blow, kind: "smoke", anchor: { x: 1, y: 1 }, params: { needs: "moving" } }, []), "moving", "or ask for it outright");
});

test("the cause per picture: at the mouth → yes; held still at the hip → no; swept fast → yes", () => {
  const fig = (hand: { x: number; y: number }) => ({ id: "a", skeleton: { head: { x: 500, y: 430 }, rHand: hand }, facing: "right", headRadius: 25 }) as never;
  const m = mouthOf(fig({ x: 0, y: 0 }));
  assert.ok(m.x > 500 && m.y > 430, "the mouth is in front of and a little below the head's middle");
  const still = causeList("mouthOrMoving", [m, m, m, m, m], [fig(m), fig(m), fig(m), fig(m), fig(m)], FPS, H);
  assert.deepEqual(still, [true, true, true, true, true]);
  const hip = { x: 520, y: 620 };
  assert.deepEqual(causeList("mouthOrMoving", [hip, hip, hip, hip, hip], Array(5).fill(fig(hip)), FPS, H), [false, false, false, false, false]);
  const swing = Array.from({ length: 12 }, (_, k) => ({ x: 200 + (k % 4 < 2 ? k % 4 : 4 - (k % 4)) * 60 + k * 10, y: 700 + (k % 2) * 40 })); // a 1 s wave, back and forth
  assert.ok(causeList("mouthOrMoving", swing, Array(12).fill(fig(hip)), FPS, H).every(Boolean), "a fast wave makes bubbles");
  assert.ok(!causeList("mouth", swing, Array(12).fill(fig(hip)), FPS, H).some(Boolean), "a whistle waved about is silent");
  // lifting the wand up (a quick 0.25 s move) is not a wave: no bubbles on the way up
  const lift = Array.from({ length: 12 }, (_, k) => ({ x: 520, y: k < 4 ? 700 : k < 7 ? 700 - (k - 3) * 70 : 490 }));
  assert.ok(!causeList("moving", lift, Array(12).fill(fig(hip)), FPS, H).some(Boolean), "a quick lift is not a wave");
});

test("a kid blows, lowers the wand to talk, blows again: no NEW bubble is born while the wand is down", () => {
  const scene = { characters: [{ height: H }], groundY: G, effects: [wand, blow] };
  const frames = buildEffectFrames(scene as never, built(9));
  // the bubbles recipe told which births are allowed: replay it with the same gate and count births near the hand
  const countNear = (i: number, near: { x: number; y: number }) => frames[i].front.filter((s) => s.kind === "poly" && s.fill === "#8fd3ff" && "points" in s && Math.hypot(s.points[0] - near.x, s.points[1] - near.y) < 0.12 * H).length;
  // well into the talking part (4.5 s): every bubble out was blown at the mouth before 2 s and has floated away — none at the lowered wand
  const head = (i: number) => fromToolHead(blow, (built(9).frames[i]), toolHeads([wand], H));
  const talk = Math.round(4.5 * FPS);
  assert.equal(countNear(talk, head(talk)!), 0, "nothing comes out of the lowered wand");
  // blowing again (6 s): new small bubbles at the wand's loop again
  const again = Math.round(6 * FPS);
  assert.ok(countNear(again, head(again)!) > 0, "blowing again makes bubbles at the loop again");
  // and the recipe itself honours the gate: everything off → nothing at all
  assert.equal(bubbles({ t: 3, duration: 6, fps: FPS, at: { x: 500, y: 500 }, height: H, groundY: G, stageWidth: 1920, emitsAt: () => false }, { count: 10 }).length, 0);
});

test("SMOKE RISES UP FROM ITS FLAME: a carried torch's head is straight above the hand, whatever the forearm does", () => {
  const torch: EffectTrack = { kind: "prop", start: 0, end: 9, anchor: { character: "a", joint: "rHand" }, params: { name: "torch", size: 0.5, parts: [{ shape: "line", x: 0, y: 0.15, w: 0, h: -0.62 }, { shape: "round", x: 0, y: -0.52, w: 0.12, h: 0.12 }] } };
  const smoke: EffectTrack = { kind: "smoke", start: 0, end: 9, anchor: { character: "a", joint: "rHand", dy: -120 }, params: { size: 0.06 } };
  const f = built(1).frames[0]; // (the forearm points forward-up: a tilted tool's tip would be out in front)
  const hand = (f[0] as { skeleton: { rHand: { x: number; y: number } } }).skeleton.rHand;
  const head = fromToolHead(smoke, f, toolHeads([torch], H))!;
  assert.ok(Math.abs(head.x - hand.x) < 1, `torch head straight above the hand (dx ${head.x - hand.x})`);
  assert.ok(head.y < hand.y - 0.2 * H, "and up at the torch's top");
});

test("no wind in the scene → smoke goes straight up (no sideways drift unless the plan's wind says so)", () => {
  const smoke = SMOKE.find((r) => r.id === "smoke")!;
  const xs = (shapes: Shape[]) => shapes.flatMap((s) => ("points" in s ? s.points.filter((_, k) => k % 2 === 0) : []));
  const mid = (p: Record<string, unknown>) => { const v = xs(smoke.draw({ t: 3, duration: 8, fps: FPS, at: { x: 800, y: 700 }, height: H, groundY: G, stageWidth: 1920 }, p)); return v.reduce((a, b) => a + b, 0) / v.length; };
  for (const size of [0.03, 0.08, 0.12]) assert.ok(Math.abs(mid({ size }) - 800) < 0.12 * H, `size ${size}: the column stays over its source (${Math.round(mid({ size }) - 800)} px)`);
  assert.ok(mid({ size: 0.12, wind: 1 }) - 800 > 0.1 * H, "real wind still drifts it");
});
