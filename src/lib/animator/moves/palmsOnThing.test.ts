import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { ballLook, boxLook } from "../objects.ts";
import { palmsOnSmallThings } from "../contacts.ts";
import { LIBRARY } from "./library.ts";
import { fitPlanToPage, type ScenePlan } from "./plan.ts";

// BOTH PALMS ON A SMALL THING (contacts.ts palmsOnSmallThings): the two-hand catch / hold poses are drawn for a basketball, so a
// baseball or a baton caught "in both hands" used to sit between the hands with each palm ~10 px off it. Every two-hand hold of
// a light thing now closes both palms onto its edge, smoothly (no pop), and a basketball is left as it was.

const catchPlan = (look: ReturnType<typeof ballLook>): ScenePlan => ({
  id: "palms", title: "palms", height: 300, groundY: 900,
  characters: [
    { id: "s", x: 400, facing: "right", actions: [{ move: "stand", params: { seconds: 0.3 } }, { move: "throw", params: { object: "ball", to: "d" } }] },
    { id: "d", x: 1300, facing: "left", actions: [{ move: "catch", params: { object: "ball", from: "s" } }] },
  ],
  objects: [{ id: "ball", look, heldBy: "s" }],
});

test("palms: a small ball caught in both hands sits on BOTH palms on every picture of the hold, and the hands never jump", () => {
  for (const size of [16, 22, 30]) for (const fps of [12, 24]) {
    const scene = fitPlanToPage(catchPlan(ballLook("ball", { size })), LIBRARY, 1920);
    const built = buildScene(scene, fps);
    const hold = scene.objects![0].segments!.find((g) => g.mode === "held" && g.character === "d")!;
    assert.ok(hold && hold.mode === "held" && hold.joint === "hands", "Dad holds it in both hands");
    for (let i = Math.ceil(hold.from * fps); i < built.frames.length; i += 1) {
      const o = built.objects[i].find((x) => x.id === "ball")!, d = built.frames[i].find((c) => c.id === "d")!;
      const r = size / 2;
      for (const h of [d.skeleton.lHand, d.skeleton.rHand]) {
        const off = Math.abs(Math.hypot(h.x - o.x, h.y - o.y) - r);
        assert.ok(off <= 2, `${size}px @${fps}: a palm is ${off.toFixed(1)} px off the ball's edge at ${(i / fps).toFixed(2)} s`);
      }
    }
    // (smooth: Dad's hands move no more than a tenth of his height between two pictures around the catch)
    for (let i = Math.max(1, Math.floor(hold.from * fps) - 6); i < Math.min(built.frames.length, Math.ceil(hold.from * fps) + 6); i += 1) {
      const a = built.frames[i - 1].find((c) => c.id === "d")!, b = built.frames[i].find((c) => c.id === "d")!;
      for (const j of ["lHand", "rHand"] as const) {
        const step = Math.hypot(b.skeleton[j].x - a.skeleton[j].x, b.skeleton[j].y - a.skeleton[j].y);
        assert.ok(step <= 0.1 * 300 * (24 / fps), `${size}px @${fps}: Dad's ${j} jumps ${step.toFixed(1)} px at picture ${i}`);
      }
    }
  }
});

test("palms: declared only for two-hand holds of LIGHT things, never over a hand a move already declared", () => {
  const seg = (joint: "hands" | "rHand") => [{ from: 1, to: 3, mode: "held" as const, character: "a", joint }];
  const ball = { id: "b", name: "b", look: ballLook("ball", { size: 22 }), keys: [], segments: seg("hands") };
  const box = { id: "x", name: "x", look: boxLook({ size: 150 }), keys: [], segments: seg("hands") };
  const one = { id: "c", name: "c", look: ballLook("ball", { size: 22 }), keys: [], segments: seg("rHand") };
  const out = palmsOnSmallThings([ball, box, one], () => 300);
  assert.deepEqual(out.map((c) => `${c.joint}:${(c.target as { object: string }).object}`), ["lHand:b", "rHand:b"]);
  const kept = palmsOnSmallThings([ball], () => 300, [{ figure: "a", joint: "lHand", target: { x: 0, y: 0 }, from: 2, to: 2.5 }]);
  assert.deepEqual(kept.map((c) => c.joint), ["rHand"]);
});
