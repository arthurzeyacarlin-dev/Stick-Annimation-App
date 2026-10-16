// SPEC-0021 (Arthur, Oct 12: "a stick figure at his desk, working, typing, and drinking from a mug" — Claude said it could not
// draw a desk, a chair or a mug and mimed it standing). A PASSED RECIPE (the laws pass it; the pictures were checked): things
// built from simple parts (a chair under the seated hips, a desk with a laptop, a mug held in the hand, drawn in front of it), a
// SEATED original move (the seat carries the weight: the hips go back onto it while the feet stay planted), typing with the
// near hand while the far hand holds the mug, and a sip. NOT in Claude's book (Arthur: no hand-written outputs — Claude builds
// its own every time): it is the engine's REGRESSION TEST for seats and held things (scenesDesk.test.ts).
import type { ScenePlan } from "./plan.ts";

const SEAT = { lean: 4, head: 6, lHip: 88, rHip: 92, lKnee: 92, rKnee: 88 };
const typeA = { ...SEAT, lean: 8, head: 14, lShoulder: 55, lElbow: 75, rShoulder: 5, rElbow: 95 };
const typeB = { ...SEAT, lean: 8, head: 14, lShoulder: 46, lElbow: 90, rShoulder: 8, rElbow: 92 };
export function deskTypingPlan(): ScenePlan {
  return {
  id: "desk", title: "At his desk: typing and a sip of coffee", height: 300, groundY: 900, pace: "natural",
  background: { pieces: [{ kind: "sky", params: { color: "#dfe6ee", color2: "#f4f6f8" } }, { kind: "ground", params: { color: "#8a7a66" } }] },
  characters: [{ id: "a", name: "worker", x: 860, facing: "right", look: { color: "#1f2937" }, actions: [
    { move: "custom", params: { name: "sitting at the desk", seated: true, startsInPose: true, keys: [{ pose: { ...SEAT, lShoulder: 45, rShoulder: 10, lElbow: 85, rElbow: 95 }, feet: "both", hold: 0.3 }] } },
    { move: "custom", params: { name: "typing at the keyboard", seated: true, repeat: 6, keys: [{ pose: typeA, feet: "both", hold: 0.06 }, { pose: typeB, feet: "both", hold: 0.06 }] } },
    { move: "custom", params: { name: "sip from the mug", seated: true, keys: [{ pose: { ...typeA, rShoulder: 25, rElbow: 145, head: -6, lean: 2 }, feet: "both", hold: 0.7 }, { pose: typeB, feet: "both", hold: 0.1 }] } },
    { move: "custom", params: { name: "typing at the keyboard", seated: true, repeat: 6, keys: [{ pose: typeA, feet: "both", hold: 0.06 }, { pose: typeB, feet: "both", hold: 0.06 }] } },
  ] }],
  effects: [
    { kind: "prop", start: -1, end: 30, anchor: { x: 800, y: 860 }, params: { size: 0.55, parts: [
      { shape: "rect", x: -0.2, y: 0.3, w: 0.04, h: 0.4, color: "#5b4636" }, { shape: "rect", x: 0.2, y: 0.3, w: 0.04, h: 0.4, color: "#5b4636" },
      { shape: "rect", x: 0, y: 0.106, w: 0.52, h: 0.06, color: "#7a5c45" }, { shape: "rect", x: -0.24, y: -0.25, w: 0.05, h: 0.72, color: "#7a5c45" } ] } },
    { kind: "prop", start: -1, end: 30, anchor: { x: 958, y: 860 }, params: { size: 0.47, parts: [
      { shape: "rect", x: 0.4, y: 0.0, w: 0.4, h: 0.94, color: "#6b4f3a" },
      { shape: "rect", x: 0, y: -0.49, w: 1.3, h: 0.08, color: "#8b6a4f" },
      { shape: "rect", x: -0.42, y: -0.56, w: 0.5, h: 0.05, color: "#9aa3ad" }, { shape: "rect", x: -0.14, y: -0.76, w: 0.05, h: 0.38, color: "#3b4552" } ] } },
    { kind: "prop", start: -1, end: 30, anchor: { character: "a", joint: "rHand" }, layer: "front", params: { size: 0.11, parts: [
      { shape: "rect", x: 0, y: 0, w: 0.7, h: 1, color: "#f4f4f4" }, { shape: "circle", x: -0.45, y: 0, w: 0.35, color: "#f4f4f4" } ] } },
  ],
} as unknown as ScenePlan;
}
