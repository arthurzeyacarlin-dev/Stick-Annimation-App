import assert from "node:assert/strict";
import { test } from "node:test";
import { planDiff, revertUnasked } from "./claudeAnimator.ts";

// AN EDIT CHANGES ONLY WHAT WAS ASKED (Arthur, Oct 12: "he just wants it nighttime"): the engine lists what an edit changed, and
// puts back — exactly — every change the request check calls unasked.
const before = {
  id: "w", title: "walk", height: 300, groundY: 900,
  characters: [{ id: "o", name: "Orange", x: 300, facing: "right", look: { color: "#f80", head: "hollow" }, actions: [{ move: "walk", params: { distance: 600 } }] },
    { id: "r", name: "Red", x: 200, facing: "right", look: { color: "#d22" }, actions: [{ move: "walk", params: { distance: 600 } }] }],
  background: { pieces: [{ kind: "sky", params: { color: "#7ab8f5" } }, { kind: "ground" }] },
};
test("make it night: only the place changes; a sneaky change to a figure is put back", () => {
  const after = JSON.parse(JSON.stringify(before));
  after.background.pieces[0].params.color = "#0b1430";               // asked: night
  after.characters[0].actions = [{ move: "run", params: { distance: 900 } }]; // NOT asked
  after.characters[1].look.color = "#8b5a2b";                          // NOT asked
  const changed = planDiff(before, after);
  assert.deepEqual(changed.sort(), ["Orange's moves changed", "Red's look (color, head…) changed", "the place (background) changed"].sort());
  const fixed = revertUnasked(before, after, ["Orange's moves changed", "Red's look (color, head…) changed"]);
  assert.deepEqual(planDiff(before, fixed), ["the place (background) changed"]);
  assert.equal((fixed.background as typeof before.background).pieces[0].params?.color, "#0b1430");
});
test("change the red figure to brown: only Red's look changes", () => {
  const after = JSON.parse(JSON.stringify(before));
  after.characters[1].look.color = "#8b5a2b";
  assert.deepEqual(planDiff(before, after), ["Red's look (color, head…) changed"]);
});
