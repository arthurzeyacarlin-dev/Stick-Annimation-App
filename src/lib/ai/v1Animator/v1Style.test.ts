import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { applyV1Ops, planFromCreate } from "./v1AnimatorCore.ts";
import type { V1Plan } from "./v1AnimatorContract.ts";
import { lunaInstructions, lunaTurnSchema, normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { makeTestRoot } from "./__fixtures__/v1TestRoot.ts";

// Nov 2: APPEARANCE IS NEVER REFUSED (style = hollowHead / glow / pen). TEST FIXTURES ONLY: hand-written labelled answers below + the REAL books. $0, no AI call.
const books = () => {
  const { lx } = makeTestRoot();
  return { book: readLunaBook(join(lx, "v1k", "luna-book.json")), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")) };
};
const BASE: V1Plan = { contract: "v1-blocks", colour: "#7c3aed", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "A stick figure runs forward.", seed_bump: 0 }] };

test("style: the pen + glow names come from the engine book; the schema carries style at create and as an edit op", () => {
  const { words, book } = books();
  assert.deepEqual(words.style.pens, ["thin", "normal", "thick"]);
  assert.deepEqual(words.style.glowStrengths, ["soft", "strong"]);
  const s = JSON.stringify(lunaTurnSchema(words, book));
  assert.match(s, /"hollowHead"/); assert.match(s, /"removeGlow"/); assert.match(s, /"enum":\["style"\]/);
});

test("style: 'a purple stick figure with a red hollow head' (FIXTURE answer) -> create plan with colour + head part colour + hollow head", () => {
  const { words, book } = books();
  const raw = { intent: "create", say: "I'll make a purple stick figure with a red hollow head.\n\nYou could make him glow.", blocks: [{ sentence: "A stick figure does jumping jacks." }],
    colour: "#7c3aed", partColours: { head: "#dc2626", arms: null, body: null, legs: null }, style: { hollowHead: true, glow: null, pen: null }, size: null, still: false };
  const turn = normalizeV1LunaTurn(raw, words, book);
  assert.equal(turn?.intent, "create");
  const plan = planFromCreate(turn!, book, words)!;
  assert.deepEqual(plan.style, { hollowHead: true });
  assert.deepEqual(plan.partColours, { head: "#dc2626" });
  assert.equal(plan.colour, "#7c3aed");
  // no style named -> no style key (the engine's old path)
  const plain = planFromCreate(normalizeV1LunaTurn({ ...raw, style: null }, words, book)!, book, words)!;
  assert.equal("style" in plain, false);
  // (Nov 5) a bad look word never throws the answer away: that one setting is left out, the rest is kept
  const bad = normalizeV1LunaTurn({ ...raw, style: { hollowHead: true, glow: null, pen: "huge" } }, words, book)!;
  assert.ok(bad); assert.deepEqual(bad.style, { hollowHead: true });
});

test("style op (Nov 5): the COMPLETE new look - what it leaves out is gone (removing always works); nothing left = plain", () => {
  const { words, book } = books();
  const op = (style: unknown, removeGlow: unknown = null) => normalizeV1LunaTurn({ intent: "edit", say: "ok", ops: [{ op: "style", style, removeGlow }] }, words, book)!.ops!;
  let r = applyV1Ops(BASE, op({ hollowHead: null, glow: { colour: "#3b82f6", strength: null }, pen: null }), book, words);
  assert.ok("plan" in r); let p = (r as { plan: V1Plan }).plan;
  assert.deepEqual(p.style, { glow: { colour: "#3b82f6" } });
  r = applyV1Ops(p, op({ hollowHead: null, glow: { colour: "#3b82f6", strength: null }, pen: "thick", outlines: [{ colour: "#dc2626", width: null }, { colour: "#111111", width: null }] }), book, words); p = (r as { plan: V1Plan }).plan;
  assert.deepEqual(p.style, { glow: { colour: "#3b82f6" }, pen: "thick", outlines: [{ colour: "#dc2626" }, { colour: "#111111" }] });
  // "remove the red outline": the complete look without it
  r = applyV1Ops(p, op({ hollowHead: null, glow: { colour: "#3b82f6", strength: null }, pen: "thick", outlines: [{ colour: "#111111", width: null }] }), book, words); p = (r as { plan: V1Plan }).plan;
  assert.deepEqual(p.style, { glow: { colour: "#3b82f6" }, pen: "thick", outlines: [{ colour: "#111111" }] });
  r = applyV1Ops(p, op({ hollowHead: true, glow: null, pen: "thin" }), book, words); p = (r as { plan: V1Plan }).plan;
  assert.deepEqual(p.style, { hollowHead: true, pen: "thin" });
  r = applyV1Ops(p, op(null), book, words); p = (r as { plan: V1Plan }).plan;
  assert.equal("style" in p, false);
  assert.deepEqual(p, BASE);
});

test("style: the book says appearance is ALWAYS done, never refused (create, edit, refuse, honesty)", () => {
  const { words, book } = books();
  const ins = lunaInstructions(book, words);
  assert.match(ins, /APPEARANCE IS NEVER A REFUSE/);
  assert.match(ins, /Never say Version 1 cannot make a hollow or outlined body part/);
  assert.match(ins, /outline only/); assert.match(ins, /rainbow/); assert.match(ins, /make him glow blue/); assert.match(ins, /thicker lines/);
  assert.match(ins, /style \(hollow head, glow, thin \/ thick lines\)/);
});

test("style: every book example normalises (create + edit examples with style)", () => {
  const { words, book } = books();
  for (const ex of book.createExamples as Record<string, unknown>[]) {
    if (!ex.style) continue;
    const t = normalizeV1LunaTurn({ intent: "create", say: "x", ...ex }, words, book);
    assert.ok(t, JSON.stringify(ex));
  }
  for (const ex of book.editExamples as Record<string, unknown>[]) {
    if (!JSON.stringify(ex.ops).includes('"style"')) continue;
    assert.ok(normalizeV1LunaTurn({ intent: "edit", say: "x", ops: ex.ops }, words, book), JSON.stringify(ex));
  }
});
