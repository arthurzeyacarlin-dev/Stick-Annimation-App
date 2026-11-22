import assert from "node:assert/strict";
import { test } from "node:test";
import { keepUnchanged, namedOnly } from "./v1AnimatorCore.ts";
import type { V1KimodoStep } from "./v1AnimatorContract.ts";

// (Nov 9, Arthur: "he does whatever I say" - and only that) a move the user's words never point at keeps its old words + animator. $0.
const old: V1KimodoStep[] = [
  { text: "A person waves hello.", seconds: 2, travels: false },
  { text: "A person lifts one knee high and stomps down hard.", seconds: 2.5, wan: true, travels: false },
  { text: "A person drops into a breakdance spin.", seconds: 7, wan: true, travels: false },
  { text: "A person stands and flexes both arms.", seconds: 3, travels: false },
];

test("an edit's untouched H3 move keeps H3 and its words; the named move changes", () => {
  // the user named move 2 only ("make the stomp bigger"); the AI also re-worded move 3 and gave it to Kimodo
  const next: V1KimodoStep[] = [old[0], { text: "A person lifts one knee very high and stomps down with a huge stomp.", seconds: 2.5, wan: true, changed: true, travels: false },
    { text: "A person does a breakdance move on the floor.", seconds: 7, wan: false, changed: true, travels: false }, old[3]];
  const out = keepUnchanged(namedOnly(next, old, [{ step: 2 }]), old);
  assert.equal(out[1].text, next[1].text);
  assert.equal(out[2].text, old[2].text);
  assert.equal(out[2].wan, true);
  assert.deepEqual(out[0], old[0]);
  assert.deepEqual(out[3], old[3]);
});

test("moves nobody named keep their old seconds (live: the AI re-timed 2 s moves to 2.5 s)", () => {
  const next = old.map((s, i) => ({ ...s, seconds: i === 1 ? 4 : 2.5, changed: true }));
  const out = keepUnchanged(namedOnly(next, old, [{ step: 2 }]), old);
  assert.deepEqual(out.map((s) => s.seconds), [2, 4, 7, 3]);
});

test("a new total length asked keeps every move's words but the AI's seconds", () => {
  const next = old.map((s) => ({ ...s, seconds: s.seconds / 2, changed: true }));
  const out = keepUnchanged(namedOnly(next, old, [{ step: 0 }], true), old);
  assert.deepEqual(out.map((s) => s.seconds), [1, 1.25, 3.5, 1.5]);
  assert.deepEqual(out.map((s) => s.text), old.map((s) => s.text));
});

test("a move added or removed: the new move is the AI's, every other move the old one (words, seconds, animator)", () => {
  const spin: V1KimodoStep = { text: "A person spins around once.", seconds: 2, changed: true, travels: false };
  const next: V1KimodoStep[] = [{ ...old[0], seconds: 2.5, changed: true }, spin, ...old.slice(1).map((s) => ({ ...s, seconds: 2.5, wan: false, changed: true }))];
  const out = keepUnchanged(namedOnly(next, old, [{ step: 2 }]), old);
  assert.deepEqual(out, [old[0], spin, ...old.slice(1)]);
  const cut = keepUnchanged(namedOnly([old[0], { ...old[2], seconds: 1 }, old[3]], old, [{ step: 0 }]), old);
  assert.deepEqual(cut, [old[0], old[2], old[3]]);
});
