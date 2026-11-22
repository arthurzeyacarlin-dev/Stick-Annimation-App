// (Nov 19 evening, Arthur: "whatever I want changed gets changed, nothing else") THE EDIT CONTRACT of applyStepEdits.
// Measured on his 25 saved edits: every step that was re-animated without being asked came from a turn with a COLOUR in it - the chat AI
// lists every step that shows the thing and types their words again ("grey blade" -> "red axe head"), and those typed words reached the
// engine, which knows a step by its words + seconds. The contract: the APP decides what a step is, never the chat AI's typing.
//   1 a step not named                       = the saved step
//   2 a step named only with a colour look   = the saved step, every field, + the look
//   3 a step named twice (look + move)       = the move entry (the colour is kept on it)
//   4 a named step with the saved words and seconds, no look = the saved step
//   5 a look that is not a colour            = a move step (the animator draws it; the look editor is never reached)
//   6 a step carries no number of its own (no `from`, `step` or `after`): editBlocks compares the whole step, so any such field would read as a change
//   7 inserts and removals as before
// Run: node --test --experimental-strip-types src/lib/ai/v1Animator/v1EditContractNov19.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { applyStepEdits } from "./v1AnimatorCore.ts";
import type { V1KimodoStep } from "./v1AnimatorContract.ts";

type Step = V1KimodoStep & { from?: number };
const run = (saved: Step[], named: Step[], remove: number[] = []): Step[] => {
  const out = applyStepEdits(saved as V1KimodoStep[], named as V1KimodoStep[], remove);
  assert.ok(Array.isArray(out), `the order could not be applied: ${JSON.stringify(out)}`);
  return out as Step[];
};
// the two colour forms, as the engine reads them (kimodo/wan.py SWAP, ltx-effects/v1k/after_engine.py EXACT)
const SWAP = /^\s*colou?r\s+(#[0-9a-f]{6})\s+to\s+(#[0-9a-f]{6})\s*\.?\s*$/i;
const EXACT = /^\s*(?:the\s+)?(.+?)\s+(?:is|are)\s+[^()#]*\(\s*(#[0-9a-f]{6})\s*\)\s*\.?\s*$/i;
// (Nov 20) the looks put on the pictures without animating (after_engine.py FILL / ERASE / REDRAW)
const FORMS = [/^\s*from\s+(?:the\s+)?(.+?)\s+remove\s+(.+?)\s*\.?\s*$/i, /^\s*remove\s+(?:the\s+)?(.+?)\s*\.?\s*$/i, /^\s*(redraw|reshape)\s+(?:the\s+)?(.+?)\s*:\s*(.+?)\s*\.?\s*$/i];
const isColour = (look: string | undefined) => !!look && (SWAP.test(look) || EXACT.test(look) || FORMS.some((f) => f.test(look)));
// what the ENGINE compares (kimodo/wan.py edit / longer / relook: `key`): the words + the seconds
const key = (s: Step) => `${String(s.text).trim().toLowerCase()}|${Math.round(s.seconds * 100) / 100}`;
const bare = ({ from: _from, changed: _changed, step: _step, after: _after, ...s }: Step) => s;   // a step's own content
const same = (got: Step, saved: Step, why: string) => assert.deepEqual(bare(got), bare(saved), why);
// the steps the engine would animate again: the longest run of steps it still knows, in order, is what it keeps
const kept = (saved: Step[], out: Step[]) => {
  const a = saved.map(key), b = out.map(key), L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  return L[0][0];
};
const S = (text: string, seconds: number, more: Partial<Step> = {}): Step => ({ text, seconds, travels: false, ...more });

const saved3: Step[] = [
  S("A black stick figure holding a wooden axe with a grey steel blade stands facing right.", 3, { changed: true }),
  S("He swings the axe sideways into the robot.", 2, { before: "He stands on the left, the robot on the right.", travels: true, changed: true }),
  S("He bows his head and looks down at the axe.", 1, { before: "The axe lies on the ground.", face: "viewer", changed: true }),
];

test("1. a step that is not named is the saved step", () => {
  const out = run(saved3, [{ ...S("He kicks the robot over.", 1.5), step: 2, changed: true }]);
  assert.equal(out.length, 3);
  for (const i of [0, 2]) { same(out[i], saved3[i], `step ${i + 1} stays`); assert.equal(out[i].changed, false); }
});

for (const look of ["colour #aaaaaa to #bbbbbb", "color #22c55e to #f97316", "the axe head is red (#dc2626)",
  "from the black stick figure's head remove the eyes and mouth", "remove the small black speck below his right arm",
  "redraw the shovel's blade: rusty, with orange-brown rust patches over the grey", "reshape the black stick figure's head: a tall purple wizard hat on it"]) {
  test(`2. a step named only with the look "${look}" is the saved step + the look, whatever was typed for it (never animated again)`, () => {
    const typed: Step = { ...S("A black stick figure holding a wooden axe with a RED AXE HEAD stands facing right, re-typed.", 4.5, { before: "typed again", travels: true, face: "viewer" }), step: 1, look, changed: true };
    const out = run(saved3, [typed]);
    assert.equal(out.length, 3);
    same({ ...out[0], look: undefined } as Step, { ...saved3[0], look: undefined } as Step, "its words, seconds, before, travels and face are the saved ones");
    assert.equal(out[0].text, saved3[0].text); assert.equal(out[0].seconds, saved3[0].seconds); assert.equal(out[0].before, saved3[0].before); assert.equal(out[0].travels, saved3[0].travels); assert.equal(out[0].face, saved3[0].face);
    assert.equal(out[0].look, look); assert.equal(out[0].changed, true);
    assert.equal(kept(saved3, out), 3, "the engine sees no changed step");
  });
}

test("3. a step named twice (the look, and the move) is the move entry, and the colour is kept on it", () => {
  const look = "the axe head is red (#dc2626)";
  const move: Step = { ...S("He swings the red axe much harder, twice, into the robot.", 3, { before: "typed" }), step: 2, changed: true };
  for (const named of [[{ ...saved3[1], step: 2, look, changed: true }, move], [move, { ...saved3[1], text: "typed again", step: 2, look, changed: true }]] as Step[][]) {
    const out = run(saved3, named);
    assert.equal(out.length, 3, "one step, not two");
    assert.equal(out[1].text, move.text); assert.equal(out[1].seconds, 3); assert.equal(out[1].changed, true);
    assert.equal(out[1].look, look, "the colour is kept on the move step");
    assert.equal(kept(saved3, out), 2, "the engine animates exactly that step again");
  }
});

test("4. a named step with the saved words and seconds and no look is the saved step", () => {
  const out = run(saved3, [{ ...saved3[1], before: "typed again, differently", travels: false, face: "viewer", step: 2, changed: true }]);
  same(out[1], saved3[1], "only before / travels / face were typed again: nothing was asked");
  assert.equal(out[1].changed, false);
  assert.equal(kept(saved3, out), 3);
});

for (const look of ["he wears a red hat", "the tree is twice as big", "the tree has autumn colours: orange, red and yellow leaves", "he is fat: a big round belly"]) {
  test(`5. the look "${look}" is not a colour: its step is drawn again by the animator, and no look reaches the engine`, () => {
    const sameWords = run(saved3, [{ ...saved3[1], step: 2, look, changed: true }]);
    assert.ok(!sameWords[1].look, "the look field is gone");
    assert.ok(sameWords[1].text !== saved3[1].text && sameWords[1].text.startsWith(saved3[1].text.trim()) && sameWords[1].text.includes(look), `the saved words + the look: ${sameWords[1].text}`);
    assert.equal(sameWords[1].changed, true);
    assert.equal(kept(saved3, sameWords), 2, "the engine animates that step again");
    const typed = "He swings the axe sideways into the robot, wearing a tall red hat.";
    const newWords = run(saved3, [{ ...saved3[1], text: typed, step: 2, look, changed: true }]);
    assert.equal(newWords[1].text, typed, "the chat AI's own new words are used as they are");
    assert.ok(!newWords[1].look); assert.equal(newWords[1].changed, true);
  });
}

test("6. a step carries no number of its own: nothing but its content is saved", () => {
  const out = run(saved3, [{ ...S("He waves first.", 1), step: 0, after: 0, changed: true }, { ...saved3[0], step: 1, look: "colour #aaaaaa to #bbbbbb" }, { ...S("He walks off to the right.", 2), step: 0, after: 3, changed: true }], [2]);
  assert.deepEqual(out.map((s) => s.text), ["He waves first.", saved3[0].text, saved3[2].text, "He walks off to the right."]);
  assert.ok(out.every((s) => !("from" in s) && !("step" in s) && !("after" in s)));
});

test("7. inserts and removals as before; a number that is no saved step, or nothing left, is said plainly", () => {
  const a = S("new A", 1), b = S("new B", 1), c = S("new C", 1);
  const out = run(saved3, [{ ...c, step: 0, after: 3 }, { ...a, step: 0, after: 0 }, { ...b, step: 0, after: 1 }], [2]);
  assert.deepEqual(out.map((s) => s.text), ["new A", saved3[0].text, "new B", saved3[2].text, "new C"]);
  for (const s of out.filter((x) => x.text.startsWith("new"))) assert.equal(s.changed, true);
  assert.ok(out.every((s) => !("step" in s) && !("after" in s)), "the order's own numbers are not saved in a step");
  assert.deepEqual(applyStepEdits(saved3 as V1KimodoStep[], [{ ...a, step: 4 } as V1KimodoStep]), { error: "step_number" });
  assert.deepEqual(applyStepEdits(saved3 as V1KimodoStep[], [{ ...a, step: 0, after: 9 } as V1KimodoStep]), { error: "step_number" });
  assert.deepEqual(applyStepEdits(saved3 as V1KimodoStep[], [], [0]), { error: "step_number" });
  assert.deepEqual(applyStepEdits(saved3 as V1KimodoStep[], [], [1, 2, 3]), { error: "nothing_left" });
});

// ------------------------------------------------------------------------------------------------------------------------------------
// GENERATED ORDERS: saved animations of 1 to 40 steps, every kind of order at every place, with "Sonnet noise" (words, before, travels,
// face and seconds typed again on the steps it lists). The same seed = the same orders.
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const COLOURS = ["colour #aaaaaa to #bbbbbb", "color #22c55e to #f97316", "the axe head is red (#dc2626)", "The potion is blue (#2563eb)."];
const OTHER = ["he wears a red hat", "the tree is twice as big", "he is fat: a big round belly"];
type Kind = "keep" | "colour" | "both" | "move" | "same" | "other" | "remove";

test("generated orders: the engine sees as changed EXACTLY the steps whose move was named", () => {
  let orders = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const r = rng(seed), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)], n = 1 + Math.floor(r() * 40);
    const saved: Step[] = Array.from({ length: n }, (_, i) => S(`He does move number ${i + 1} of animation ${seed} with his ${pick(["left", "right"])} arm.`, 0.5 + Math.floor(r() * 8) / 2, {
      ...(r() < 0.6 ? { before: `Before ${i + 1} he stands at place ${Math.floor(r() * 9)}.` } : {}), travels: r() < 0.3, ...(r() < 0.15 ? { face: "viewer" as const } : {}),
      ...(r() < 0.2 ? { look: pick(COLOURS) } : {}), changed: r() < 0.5 }));
    // what the chat AI types again on a step it lists: any of its fields
    const noise = (s: Step): Step => ({ ...s, text: r() < 0.7 ? `${s.text.replace("arm", pick(["arm", "red arm", "orange arm"]))}${r() < 0.4 ? " Typed again." : ""}` : s.text,
      seconds: r() < 0.3 ? s.seconds + 0.5 : s.seconds, before: r() < 0.7 ? `typed again ${Math.floor(r() * 99)}` : s.before, travels: r() < 0.5 ? !s.travels : s.travels, ...(r() < 0.3 ? { face: "viewer" as const } : {}) });
    const kinds: Kind[] = saved.map(() => { const x = r(); return x < 0.5 ? "keep" : x < 0.68 ? "colour" : x < 0.74 ? "both" : x < 0.84 ? "move" : x < 0.9 ? "same" : x < 0.95 ? "other" : "remove"; });
    if (!kinds.some((k) => k !== "remove")) kinds[0] = "keep";   // (never an order that takes every step out)
    const named: Step[] = [], remove: number[] = [], want: { kind: Kind | "new"; from: number; look?: string; move?: Step }[] = [];
    const add = (after: number) => { for (let c = Math.floor(r() * 3) * (r() < 0.35 ? 1 : 0); c > 0; c--) { const s = S(`He does a new move ${after}-${c} of animation ${seed}.`, 1 + Math.floor(r() * 4) / 2); named.push({ ...s, step: 0, after, changed: true }); want.push({ kind: "new", from: 0, move: s }); } };
    add(0);
    saved.forEach((old, i) => {
      const k = kinds[i], look = k === "other" ? pick(OTHER) : pick(COLOURS);
      const moved: Step = { ...noise(old), text: `He does something else at step ${i + 1} of animation ${seed}.`, look: undefined };
      if (k === "colour") named.push({ ...noise(old), step: i + 1, look, changed: true });
      if (k === "both") { const two: Step[] = [{ ...noise(old), step: i + 1, look, changed: true }, { ...moved, step: i + 1, changed: true }]; named.push(...(r() < 0.5 ? two : two.reverse())); }
      if (k === "move") named.push({ ...moved, step: i + 1, changed: true });
      if (k === "same") named.push({ ...noise(old), text: old.text, seconds: old.seconds, look: undefined, step: i + 1, changed: true });
      if (k === "other") named.push({ ...noise(old), seconds: old.seconds, step: i + 1, look, changed: true });
      if (k === "remove") remove.push(i + 1); else want.push({ kind: k, from: i + 1, look, move: moved });
      add(i + 1);
    });
    const out = run(saved, named, remove), at = `seed ${seed}`;
    orders++;
    assert.equal(out.length, want.length, `${at}: ${want.length} steps`);
    let moves = 0;
    out.forEach((got, j) => {
      const w = want[j], old = w.from ? saved[w.from - 1] : null, where = `${at}, step ${j + 1} (${w.kind}, from ${w.from})`;
      assert.ok(!("from" in got) && !("step" in got) && !("after" in got), `${where}: no numbers of the order in a step`);
      assert.ok(!got.look || isColour(got.look), `${where}: a look that is not a colour never reaches the engine (${got.look})`);
      if (w.kind === "keep" || w.kind === "same") { same(got, old!, `${where}: the saved step`); assert.equal(got.changed, false, where); }
      if (w.kind === "colour") { same({ ...got, look: undefined } as Step, { ...old!, look: undefined } as Step, `${where}: the saved step under the look`); assert.equal(got.look, w.look, where); assert.equal(got.changed, true, where); }
      if (w.kind === "both") { assert.equal(got.text, w.move!.text, where); assert.equal(got.seconds, w.move!.seconds, where); assert.equal(got.look, /\(\s*#[0-9a-f]{6}\s*\)/i.test(String(w.look)) ? w.look : undefined, `${where}: a moved step keeps only the named-thing colour (the swap form would hide the move)`); assert.equal(got.changed, true, where); }
      if (w.kind === "move" || w.kind === "new") { assert.equal(got.text, w.move!.text, where); assert.equal(got.seconds, w.move!.seconds, where); assert.equal(got.changed, true, where); }
      if (w.kind === "other") { assert.ok(got.text !== old!.text, `${where}: its words changed, so the animator draws it`); assert.equal(got.changed, true, where); }
      if (w.kind === "both" || w.kind === "move" || w.kind === "other") { moves++; assert.notEqual(key(got), key(old!), `${where}: the engine must see this step as changed`); }
      else if (old) assert.equal(key(got), key(old), `${where}: the engine must see this step as the saved step`);
    });
    // the engine's own view, without `from`: the steps it still knows, in order = every step that was not moved or taken out
    assert.equal(kept(saved, out), saved.length - remove.length - moves, `${at}: the engine keeps exactly the steps nobody moved`);
  }
  assert.equal(orders, 600);
});

// ------------------------------------------------------------------------------------------------------------------------------------
// HIS TWO REAL TURNS, from disk: the plan that was sent to the engine then, given to the contract now (every step listed, as the chat AI
// typed it). Skipped when the project is not on this disk.
const APP = "/Users/arthurcarlin/Projects/diamond-review/ltx-effects/out/app-v1";
const stepsOf = (file: string): Step[] => (JSON.parse(readFileSync(file, "utf8")).blocks ?? []).flatMap((b: { steps?: Step[] }) => b.steps ?? []);
const versionDir = (pid: string) => { const root = existsSync(APP) ? readdirSync(APP).find((d) => d.startsWith(pid)) : undefined; if (!root) return null; const a = readdirSync(join(APP, root)).find((d) => existsSync(join(APP, root, d, "animation.json"))); return a ? join(APP, root, a) : null; };
const replay = (dir: string, from: number, to: number) => {
  const saved = stepsOf(join(dir, `v${from}`, "plan.json")), typed = stepsOf(join(dir, `v${to}`, "input.plan.json"));
  assert.equal(typed.length, saved.length, "the same number of steps");
  const out = run(saved, typed.map((s, i) => ({ ...s, step: i + 1 })));
  return { saved, typed, out, moved: out.map((s, i) => (key(s) !== key(saved[i]) ? i + 1 : 0)).filter(Boolean) };
};

const axe = versionDir("82199f9e");
test("his axe turn ('make the axe head red and make him stare at the ground longer'): only step 5 is animated again", { skip: !axe || !existsSync(join(axe, "v2", "input.plan.json")) }, () => {
  const { saved, typed, out, moved } = replay(axe!, 1, 2);
  assert.deepEqual(typed.map((s, i) => (key(s) !== key(saved[i]) ? i + 1 : 0)).filter(Boolean), [1, 4, 5, 6], "what the engine was given that evening: steps 1, 4 and 6 typed again with the look");
  assert.deepEqual(moved, [5], "with the contract: the stare, and nothing else");
  for (const i of [0, 1, 2, 3, 5]) { same({ ...out[i], look: undefined } as Step, { ...saved[i], look: undefined } as Step, `step ${i + 1} is the saved step`); assert.equal(out[i].look, "the axe head is red (#dc2626)"); }
  assert.equal(out[4].seconds, 3); assert.equal(kept(saved, out), 5);
});

const driver = versionDir("6c1a5d02");
test("his green-driver turn ('make him orange'): no step that got the colour is animated again", { skip: !driver || !existsSync(join(driver, "v3", "input.plan.json")) }, () => {
  const { saved, typed, out, moved } = replay(driver!, 2, 3);
  const looked = typed.map((s, i) => (s.look ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(looked, [6, 7, 8, 9, 10, 11, 12]);
  for (const n of looked) { assert.equal(key(out[n - 1]), key(saved[n - 1]), `step ${n}: the saved words and seconds`); assert.equal(out[n - 1].look, "color #22c55e to #f97316"); }
  // Steps 4 and 5 were listed WITHOUT a look, with only "green" typed as "orange". The app cannot tell that from an asked move (the same
  // seconds, other words): that is closed in the book ("a colour never changes a step's words") and shown on the card ("Step 4 changes.
  // It was: ..."). If the app ever closes it too, this list becomes [].
  assert.deepEqual(moved, [4, 5], "the only steps the engine would animate again are the two listed without a look");
});
