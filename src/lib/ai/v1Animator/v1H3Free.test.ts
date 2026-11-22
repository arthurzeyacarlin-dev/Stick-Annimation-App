// (Nov 18, Arthur: "H3 animates whatever I want; our system makes it editable") the new road: a turn with no animation yet gets the H3 rules; a turn with an animation (every edit) never does
import { test } from "node:test";
import assert from "node:assert/strict";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { planFromCreate } from "./v1AnimatorCore.ts";
import { lunaInstructions, lunaTurnInput, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { makeTestRoot } from "./__fixtures__/v1TestRoot.ts";
import type { V1LunaTurn, V1Plan } from "./v1AnimatorContract.ts";

const load = (h3Free: boolean) => { const { env } = makeTestRoot({ oneTake: true, h3Free }), c = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!; return { book: readLunaBook(c.lunaBook), words: readEngineWords(c.engineBook) }; };
const input = (current: V1Plan | null) => ({ message: "he walks off and comes back", recentConversation: [], current, checkerSaid: null });
const turn = { intent: "create", say: "ok", colour: "#111111", leftward: true, cameraMoves: false, scene: "a wall", room: "big", start: "left", blocks: [{ id: "b1", sentence: "He walks off." }], kimodoSteps: [{ text: "He walks off.", seconds: 2, travels: true }] } as unknown as V1LunaTurn;

test("a new animation gets the H3 rules, a turn with an animation does not", () => {
  const { book, words } = load(true), first = JSON.parse(lunaTurnInput(book, input(null)));
  assert.ok(first.newAnimationRules.length > 0);
  const plan = planFromCreate(turn, book, words, "he walks off")!;
  assert.equal(JSON.parse(lunaTurnInput(book, input(plan))).newAnimationRules, undefined);
});
test("H3 road: no mirror and no first-picture orders; its camera is its own", () => {
  const { book, words } = load(true), plan = planFromCreate(turn, book, words, "he walks off")!;
  assert.equal(plan.mirror, false); assert.equal(plan.cameraMoves, true); assert.equal(plan.scene, undefined); assert.equal(plan.room, undefined); assert.equal(plan.start, undefined);
});
test("switch off = the old road, and the shared instructions are the same either way", () => {
  const on = load(true), off = load(false), plan = planFromCreate(turn, off.book, off.words, "he walks off")!;
  assert.equal(JSON.parse(lunaTurnInput(off.book, input(null))).newAnimationRules, undefined);
  assert.equal(plan.mirror, true); assert.equal(plan.scene, "a wall");
  assert.equal(lunaInstructions(on.book, on.words), lunaInstructions(off.book, off.words));
});
test("(Nov 20 night) the effects he names are made (flat 2D); backgrounds are not made", () => {
  const { book } = load(true);
  assert.ok(!book.capabilities.cannot.some((l) => /^Effects/.test(l))); assert.ok(book.capabilities.cannot.some((l) => /^Backgrounds/.test(l))); assert.ok(book.capabilities.can.some((l) => /^Effects he asks for/.test(l)));
});
