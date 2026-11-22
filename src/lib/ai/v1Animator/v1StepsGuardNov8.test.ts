import assert from "node:assert/strict";
import { test } from "node:test";
import { stepsLeftOut, withSteps } from "./v1LunaBook.ts";
import type { V1LunaTurn, V1Plan } from "./v1AnimatorContract.ts";

// (Nov 8 night, live: "try again" came back as a rewrite with no steps - the move list and its H3 marks were lost) a motion edit of an
// animation that has steps must give the steps again: else asked once more. $0.
const cur = { contract: "v1-blocks", colour: "#16a34a", look: "neckless", mirror: false,
  blocks: [{ id: "b1", sentence: "walks. walks on his hands.", seed_bump: 0, steps: [{ text: "walks", seconds: 4 }, { text: "walks on his hands", seconds: 5, wan: true }] }] } as unknown as V1Plan;
const noSteps = { intent: "edit", say: "ok", ops: [{ op: "rewrite", block: "b1", sentence: "walks, walks on hands", parts: ["walks.", "walks on hands."] }] } as unknown as V1LunaTurn;
const withAll = { ...noSteps, kimodoSteps: [{ text: "walks", seconds: 4 }, { text: "walks on his hands", seconds: 5, wan: true }] } as unknown as V1LunaTurn;

test("a motion edit without steps is asked once more; look edits and full answers are not", async () => {
  assert.equal(stepsLeftOut(noSteps, cur), true);
  assert.equal(stepsLeftOut(withAll, cur), false);
  assert.equal(stepsLeftOut({ intent: "edit", say: "ok", ops: [{ op: "colour", colour: "#ff0000" }] } as unknown as V1LunaTurn, cur), false);
  assert.equal(stepsLeftOut({ ...noSteps, ops: [{ op: "redo", block: "b1" }] } as unknown as V1LunaTurn, cur), false);
  assert.equal(stepsLeftOut(noSteps, { ...cur, blocks: [{ id: "b1", sentence: "walks", seed_bump: 0 }] } as unknown as V1Plan), false);   // (no steps before: as before)
  let asked = 0;
  const out = await withSteps({ ok: true as const, turn: noSteps }, cur, "say them all", async () => { asked += 1; return { ok: true as const, turn: withAll }; });
  assert.equal(asked, 1); assert.ok(out.ok && out.turn.kimodoSteps?.length === 2);
  type Out = { ok: true; turn: V1LunaTurn } | { ok: false; failure: string; detail: string };
  const kept = await withSteps<Out>({ ok: true, turn: noSteps }, cur, "say them all", async () => ({ ok: false as const, failure: "x", detail: "y" }));
  assert.ok(kept.ok && kept.turn === noSteps);   // (the re-ask failing never throws the first answer away)
  asked = 0; await withSteps({ ok: true as const, turn: withAll }, cur, "say them all", async () => { asked += 1; return { ok: true as const, turn: withAll }; });
  assert.equal(asked, 0);
});
