import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { plainFailure, readLunaBook, serverWord } from "./v1LunaBook.ts";

// Nov 2 (Arthur's screenshot, Fable audit): the user never reads engine words. REAL book, $0.
const book = readLunaBook(join(process.env.DIAMOND_ENGINE_ROOT ?? "/Users/arthurcarlin/Projects/diamond-review", "ltx-effects", "v1k", "luna-book.json"));
const ARTHUR = "the animator could not make this part: Kimodo scene not made: [kimodo_scene] Kimodo did not make it: ['A person hops lightly three times, landing on both feet and standing up. (6s)'] - why: CALL CAP: 142 + 1 > 142 (no Kimodo call made)";

test("Arthur's error becomes one plain line: no [kimodo_scene], no CALL CAP numbers", () => {
  const said = serverWord(book, "failed_engine", { words: ARTHUR });
  assert.doesNotMatch(said, /kimodo_scene|CALL CAP|142|\[|\]|Kimodo scene/);
  assert.match(said, /^I couldn't finish this animation/);
});
test("unknown technical text -> the generic line; plain words stay; a Python error never shows", () => {
  assert.equal(plainFailure(book, "KeyError: 'beats' at passed_engine.py:732"), book.plainFailures!.generic);
  const friendly = "Something up high isn't drawn — you can draw it yourself on its own layer.";
  assert.equal(plainFailure(book, friendly), friendly);
  assert.doesNotMatch(serverWord(book, "director_failed", { words: "the director script did not answer with JSON" }), /JSON|script/);
});

test("(Nov 15) a full disk is said plainly - the engine's own sentence, and the system's raw error when a runner stops on it", () => {
  for (const raw of ["there is no space left on the disk for this animation's pictures, so nothing was made", "the animator could not make this part: OSError: [Errno 28] No space left on device"]) {
    const said = serverWord(book, "failed_engine", { words: raw });
    assert.match(said, /run out of storage space/);
    assert.doesNotMatch(said, /Errno|OSError|device/);
  }
});
test("head size + line thickness: numbers in the book range, merged by a style op, clamped, 1 = plain", async () => {
  const { readEngineWords, normalizeV1LunaTurn } = await import("./v1LunaBook.ts");
  const { cleanStyle } = await import("./v1AnimatorCore.ts");
  const words = readEngineWords(join(process.env.DIAMOND_ENGINE_ROOT ?? "/Users/arthurcarlin/Projects/diamond-review", "ltx-effects", "v1k", "passed_engine_book.json"));
  assert.deepEqual(words.style.scale.headScale, [0.4, 2.5]);
  assert.deepEqual(cleanStyle({ headScale: 1.3, penScale: 1 }), { headScale: 1.3 }, "1 = plain = no key");
  assert.equal(cleanStyle({ headScale: 1, penScale: 1 }), null);
  const turn = normalizeV1LunaTurn({ intent: "edit", say: "Bigger head!", blocks: null, ops: [{ op: "style", style: { hollowHead: null, glow: null, pen: null, headScale: 9, penScale: 1.5 }, removeGlow: false }], colour: null, look: null, mirror: null, size: null, fps: null, parts: null, partColours: null, style: null, requestedSeconds: null, storyPlan: null, still: null, speed: null, clear: null } as never, words, book);
  const st = (turn?.ops?.[0] as { style?: { headScale?: number; penScale?: number } } | undefined)?.style;
  if (st) { assert.equal(st.headScale, 2.5, "clamped to the book max"); assert.equal(st.penScale, 1.5); }
  assert.match(JSON.stringify(book.createRules), /headScale/);
});
