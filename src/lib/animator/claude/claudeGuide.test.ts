import assert from "node:assert/strict";
import { test } from "node:test";
import { animatorGuide } from "./claudeAnimator.ts";
import { LIBRARY } from "../moves/library.ts";
import { BACKGROUND_PIECES, EFFECTS } from "../effects/index.ts";
import { PLACED_SYMBOLS } from "../symbolMaker.ts";
import { effectsTestButtons } from "../moves/tests2c.ts";

// THE ENGINE WRITES CLAUDE'S BOOK (SPEC-0021, Arthur's audit, Oct 12): every move, effect, background piece, drawable symbol and
// passed recipe the engine has is in the book Claude animates from — nothing the engine can do is hidden from Claude again.
test("Claude's book shows everything the engine can do", () => {
  const g = animatorGuide();
  const missing = [
    ...Object.keys(LIBRARY).filter((k) => !g.includes(`- ${k}:`)).map((k) => `move ${k}`),
    ...Object.keys(EFFECTS).filter((k) => !g.includes(`- ${k}:`)).map((k) => `effect ${k}`),
    ...Object.keys(BACKGROUND_PIECES).filter((k) => !g.includes(`- ${k}:`)).map((k) => `background ${k}`),
    ...Object.keys(PLACED_SYMBOLS).filter((k) => !g.includes(k)).map((k) => `symbol ${k}`),
    ...effectsTestButtons().filter((b) => !g.includes(`${b.label}:`)).map((b) => `recipe ${b.label}`),
  ];
  assert.deepEqual(missing, []);
  for (const rule of ["BUILT FROM SIMPLE PARTS", "\"seated\": true", "HAZARDS ARE CLEARED", "NOTHING IS LATE"]) assert.ok(g.includes(rule), rule);
});
