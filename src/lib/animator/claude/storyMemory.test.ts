import assert from "node:assert/strict";
import { test } from "node:test";
import { continueStory, memoryNote, rememberBlock } from "./storyMemory.ts";
import "../moves/transform.ts";

const look = (color: string) => ({ color, headFilled: true, neck: false });
const block1 = {
  id: "m1", height: 260, groundY: 900,
  characters: [
    { id: "a", name: "Tom", x: 700, facing: "right", look: look("#111111"), actions: [{ move: "throw", params: { object: "ball", to: "b" } }] },
    { id: "b", name: "Jay", x: 1200, facing: "left", look: look("#2563eb"), actions: [{ move: "catch", params: { object: "ball", from: "a" } }] },
  ],
  objects: [{ id: "ball", look: { kind: "ball", size: 40, color: "#ef4444", filled: true, thickness: 3, detail: "plain" }, heldBy: "a" }],
  background: { seed: 1, pieces: [{ kind: "sky", params: { time: "day" } }, { kind: "ground" }] },
};

test("STORY MEMORY: the next block carries on — same looks, where they ended, still holding what they held", () => {
  const mem = rememberBlock(block1);
  assert.ok(mem, "the block builds");
  const jay = mem!.characters.find((c) => c.id === "b")!;
  assert.deepEqual(jay.look, look("#2563eb"));
  assert.deepEqual(jay.holding, ["ball"], "Jay caught the ball and still holds it");
  // block 2 only says what changes: Jay walks; nothing about looks, spots or the ball
  const next = continueStory(mem!, { id: "m2", height: 260, groundY: 900, characters: [{ id: "a", actions: [{ move: "wave" }] }, { id: "b", actions: [{ move: "walk", params: { distance: 200 } }] }] });
  const chars = next.characters as { id: string; look?: unknown; x?: number; facing?: string }[];
  assert.deepEqual(chars.find((c) => c.id === "a")!.look, look("#111111"), "Tom keeps his look");
  assert.equal(chars.find((c) => c.id === "b")!.x, jay.x, "Jay starts where he ended");
  const ball = (next.objects as { id: string; heldBy?: string }[]).find((o) => o.id === "ball");
  assert.equal(ball?.heldBy, "b", "the ball is still in Jay's hands — not a new ball, not gone");
  // what the new block says wins
  const recolored = continueStory(mem!, { characters: [{ id: "b", look: look("#dc2626"), actions: [] }] });
  assert.deepEqual((recolored.characters as { look: unknown }[])[0].look, look("#dc2626"));
  assert.match(memoryNote(mem!), /Jay \(id b\).*holding ball/);
});
