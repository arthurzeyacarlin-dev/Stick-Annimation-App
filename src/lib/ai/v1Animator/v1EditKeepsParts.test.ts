// (Nov 8) EDIT KEEPS PARTS: an edit keeps every part before the first changed step exactly; only from the change on is made new.
// TEST FIXTURES ONLY (hand-written steps, $0, no engine run).
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { editBlocks, stepBlocks, stepsEdit, withAskedTiming } from "./v1AnimatorCore.ts";
import { readLunaBook } from "./v1LunaBook.ts";
import { makeTestRoot } from "./__fixtures__/v1TestRoot.ts";
import type { V1KimodoStep, V1Plan } from "./v1AnimatorContract.ts";

const { lx } = makeTestRoot();
const book = readLunaBook(join(lx, "v1k", "luna-book.json"));
const max = book.longScenes.stepsTakeMaxS;
const st = (text: string, seconds = 4, more: Partial<V1KimodoStep> = {}): V1KimodoStep => ({ text, seconds, travels: false, ...more });
const planOf = (blocks: V1Plan["blocks"]): V1Plan => ({ contract: "v1-blocks", colour: "#000000", look: "neckless", mirror: false, blocks } as V1Plan);
const one = planOf([{ id: "b1", sentence: "A runs. A jumps. A bows.", seed_bump: 0, steps: [st("A runs."), st("A jumps."), st("A bows.")], beats: ["run", "jump", "bow"] }]);

test("add-on at the end: the whole old part is kept exactly, only the new step is a new part", () => {
  const out = editBlocks([st("A runs."), st("A jumps."), st("A bows."), st("A waves.", 3, { changed: true })], one, book);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], one.blocks[0], "the old part, word for word, seed for seed");
  assert.equal(out[1].id, "b2"); assert.equal(out[1].seed_bump, 0);
  assert.deepEqual(out[1].steps?.map((s) => s.text), ["A waves."]);
});

test("a change inside the only part: the part keeps its id + seed and is marked edit_from_beat (the moves before it stay)", () => {
  const steps = [st("A runs."), st("A does a backflip.", 4, { changed: true }), st("A bows.")];
  assert.deepEqual(editBlocks(steps, one, book), [{ ...one.blocks[0], sentence: "A runs. A does a backflip. A bows.", steps, edit_from_beat: 1 }]);
});

test("edit from a move: an added move inside the part, timing kept only before the change; a change at move 1 keeps the moves after it (Nov 9 Fable); first AND last changed = the whole part new", () => {
  const timed = planOf([{ ...one.blocks[0], timing: [{ move: 0, factor: 0.5 }, { move: 2, factor: 0.5 }] }]);
  const steps = [st("A runs."), st("A spins.", 3, { changed: true }), st("A jumps."), st("A bows.")];
  const out = editBlocks(steps, timed, book);
  assert.equal(out.length, 1); assert.equal(out[0].id, "b1"); assert.equal(out[0].edit_from_beat, 1);
  assert.deepEqual(out[0].steps?.map((s) => s.text), ["A runs.", "A spins.", "A jumps.", "A bows."]); assert.deepEqual(out[0].timing, [{ move: 0, factor: 0.5 }]);
  const first = [st("A sprints.", 4, { changed: true }), st("A jumps."), st("A bows.")];
  assert.deepEqual(editBlocks(first, one, book), [{ ...one.blocks[0], sentence: "A sprints. A jumps. A bows.", steps: first, edit_from_beat: 0 }]);
  const both = [st("A sprints.", 4, { changed: true }), st("A jumps."), st("A waves.", 3, { changed: true })];
  assert.deepEqual(editBlocks(both, one, book), stepBlocks(both, book), "the part ends with another move: nothing after the change to keep");
  assert.deepEqual(editBlocks([st("A sprints.", 4, { changed: true })], planOf([{ id: "b1", sentence: "A runs.", seed_bump: 0, steps: [st("A runs.")] }]), book), stepBlocks([st("A sprints.", 4, { changed: true })], book), "a one-move part: whole");
});

test("the very same steps again = make it again: a new seed (as before)", () => {
  const out = editBlocks([st("A runs."), st("A jumps."), st("A bows.")], one, book);
  assert.equal(out.length, 1); assert.equal(out[0].seed_bump, 1);
});

test("long animation: a change in the last part keeps the first part; the last part keeps its id and the bow after the change (Nov 9 Fable: an edit from its first move)", () => {
  const long = planOf([
    { id: "b1", sentence: "A runs. A jumps.", seed_bump: 0, steps: [st("A runs.", max / 2), st("A jumps.", max / 2)] },
    { id: "b2", sentence: "A kicks. A bows.", seed_bump: 2, steps: [st("A kicks.", 5), st("A bows.", 5)] }]);
  const steps2 = [st("A kicks harder.", 5, { changed: true }), st("A bows.", 5)];
  const out = editBlocks([st("A runs.", max / 2), st("A jumps.", max / 2), ...steps2], long, book);
  assert.deepEqual(out[0], long.blocks[0]);
  assert.equal(out.length, 2); assert.deepEqual(out[1], { ...long.blocks[1], sentence: "A kicks harder. A bows.", steps: steps2, edit_from_beat: 0 });
  const both = [st("A kicks harder.", 5, { changed: true }), st("A waves.", 5, { changed: true })];
  const out2 = editBlocks([st("A runs.", max / 2), st("A jumps.", max / 2), ...both], long, book);
  assert.equal(out2[1].id, "b3", "both moves changed: a new part, never an old id");
});

test("long animation: a change in the FIRST part = every part new (the later parts follow the changed one)", () => {
  const long = planOf([
    { id: "b1", sentence: "A runs.", seed_bump: 0, steps: [st("A runs.", max)] },
    { id: "b2", sentence: "A bows.", seed_bump: 0, steps: [st("A bows.", 5)] }]);
  const steps = [st("A sprints.", max, { changed: true }), st("A bows.", 5)];
  assert.deepEqual(editBlocks(steps, long, book), stepBlocks(steps, book));
});

test("delete the last part: the parts before it are kept, nothing new is made", () => {
  const long = planOf([
    { id: "b1", sentence: "A runs.", seed_bump: 0, steps: [st("A runs.", max)] },
    { id: "b2", sentence: "A bows.", seed_bump: 0, steps: [st("A bows.", 5)] }]);
  assert.deepEqual(editBlocks([st("A runs.", max)], long, book), [long.blocks[0]]);
});

test("live case (Nov 8): every old step marked changed: true from the make, the same steps + an add-on -> the old part is still kept", () => {
  const made = planOf([{ id: "b1", sentence: "A runs. A jumps.", seed_bump: 0, steps: [st("A runs.", 4, { changed: true }), st("A jumps.", 4, { changed: true, airborne: true })] }]);
  const out = editBlocks([st("A runs.", 4, { changed: true }), st("A jumps.", 4, { changed: true, airborne: true }), st("A waves.", 3, { changed: true })], made, book);
  assert.equal(out.length, 2); assert.deepEqual(out[0], made.blocks[0]); assert.deepEqual(out[1].steps?.map((s) => s.text), ["A waves."]);
});

test("live case (Nov 8 night): a part that ends on H3 before an add-on keeps its moves before H3 and is made again from the H3 move", () => {
  const made = planOf([{ id: "b1", sentence: "A runs. A walks on his hands.", seed_bump: 0, steps: [st("A runs.", 4, { changed: true }), st("A walks on his hands.", 4, { changed: true, wan: true })] }]);
  const steps = [st("A runs.", 4), st("A walks on his hands.", 4, { wan: true }), st("A waves.", 3, { changed: true })];
  const got = editBlocks(steps, made, book);
  assert.equal(got[0].id, "b1"); assert.equal(got[0].edit_from_beat, 1); assert.equal(got[0].seed_bump, 1);
  assert.deepEqual(got.slice(1).flatMap((b) => b.steps ?? []).map((s) => s.text), ["A waves."]);
  assert.deepEqual(editBlocks(steps, made, book, {}), [made.blocks[0], ...editBlocks(steps, made, book, {}).slice(1)], "the made pictures say it ends on Kimodo: kept whole");
  const long = planOf([
    { id: "b1", sentence: "A runs.", seed_bump: 0, steps: [st("A runs.", max)] },
    { id: "b2", sentence: "A walks on his hands.", seed_bump: 0, steps: [st("A walks on his hands.", 5, { wan: true })] }]);
  const out = editBlocks([st("A runs.", max), st("A walks on his hands.", 5, { wan: true }), st("A waves.", 3)], long, book);
  assert.deepEqual(out[0], long.blocks[0], "the Kimodo part before it is still kept");
  assert.deepEqual(out.slice(1).flatMap((b) => b.steps ?? []).map((s) => s.text), ["A walks on his hands.", "A waves."]);
  assert.deepEqual(editBlocks([st("A runs.", max)], long, book), [long.blocks[0]], "deleting the H3 part keeps the part before (nothing joins after it)");
});

test("only a length changed (same words): the part gets the next seed so the engine makes it (never kept as the old pictures)", () => {
  const steps = [st("A runs."), st("A jumps.", 6, { changed: true }), st("A bows.")];
  const out = editBlocks(steps, one, book);
  assert.equal(out[0].edit_from_beat, 1); assert.equal(out[0].sentence, one.blocks[0].sentence); assert.equal(out[0].seed_bump, 1);
});

test("a kept part carries no edit marker from an older edit", () => {
  const marked = planOf([{ ...one.blocks[0], edit_from_beat: 1 }]);
  const out = editBlocks([...one.blocks[0].steps!, st("A waves.", 3, { changed: true })], marked, book);
  assert.equal("edit_from_beat" in out[0], false);
});

test("live Nov 8 eve: the SAME steps + 'redo move 4' + slow the punch -> only move 4 on is made again (edit_from_beat 3, next seed), slow motion kept", () => {
  const base = planOf([{ id: "b1", sentence: "A flips. A punches. A stands. A flips. A flexes.", seed_bump: 0,
    steps: [st("A flips."), st("A punches.", 3, { wan: true }), st("A stands."), st("A flips."), st("A flexes.")] }]);
  const applied = planOf([{ ...base.blocks[0], timing: [{ move: 1, factor: 0.5 }] }]);
  const ops = [{ op: "rewrite", block: "b1", sentence: base.blocks[0].sentence, beat: 4 }, { op: "timing", block: "b1", beat: 2, factor: 0.5 }] as any;
  const out = withAskedTiming(stepsEdit(base.blocks[0].steps!, applied, base, ops, book), applied, base);
  assert.equal(out.blocks[0].edit_from_beat, 3); assert.equal(out.blocks[0].seed_bump, 1); assert.deepEqual(out.blocks[0].timing, [{ move: 1, factor: 0.5 }]);
});

test("the same steps and only slow motion asked = a $0 re-draw (same seed, no edit mark, the timing on)", () => {
  const applied = planOf([{ ...one.blocks[0], timing: [{ move: 2, factor: 0.5 }] }]);
  const out = withAskedTiming(stepsEdit(one.blocks[0].steps!, applied, one, [{ op: "timing", block: "b1", beat: 3, factor: 0.5 }] as any, book), applied, one);
  assert.equal(out.blocks[0].seed_bump, 0); assert.equal("edit_from_beat" in out.blocks[0], false); assert.deepEqual(out.blocks[0].timing, [{ move: 2, factor: 0.5 }]);
});

test("'make it again' (redo) with the same steps = the part made again with the next seed (as before)", () => {
  const applied = planOf([{ ...one.blocks[0], seed_bump: 1 }]);
  const out = stepsEdit(one.blocks[0].steps!, applied, one, [{ op: "redo", block: "b1" }] as any, book);
  assert.equal(out.blocks[0].seed_bump, 1); assert.equal("edit_from_beat" in out.blocks[0], false);
});

test("changed steps + asked slow motion: the parts from the steps, the slow motion stays on its part", () => {
  const steps = [st("A runs."), st("A jumps."), st("A bows.", 4, { changed: true }), st("A waves.", 3, { changed: true })];
  const applied = planOf([{ ...one.blocks[0], timing: [{ move: 0, factor: 0.5 }] }]);
  const out = withAskedTiming(stepsEdit(steps, applied, one, [] as any, book), applied, one);
  assert.equal(out.blocks[0].id, "b1"); assert.deepEqual(out.blocks[0].timing, [{ move: 0, factor: 0.5 }]);
});

test("Nov 8 night: removing the last move(s) of a part keeps every move before them (edit_from_beat = where the removed moves started)", () => {
  const out = editBlocks([st("A runs."), st("A jumps.")], one, book);
  assert.equal(out.length, 1); assert.equal(out[0].id, "b1"); assert.equal(out[0].edit_from_beat, 2);
  assert.deepEqual(out[0].steps?.map((s) => s.text), ["A runs.", "A jumps."]);
});
