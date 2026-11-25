import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { createV1Animator, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { normalizeV1LunaTurn, readEngineWords, readLunaBook, serverWord } from "./v1LunaBook.ts";
import { fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

// (Nov 25, Arthur: "never ever say again another animation is being made" - many people at once) STRANGERS: many accounts, each
// with its own project, using the app at the same time. Test fixtures only (a fake engine that runs until the test lets it finish,
// and the labelled fake Sonnet answers). $0. Nothing about how an animation is made is looked at here: only WHO runs WHEN.

type Call = ReturnType<typeof fakeSpawner>["calls"][number];
function setup(atOnce: { n: number }, answers: string[]) {
  const { env } = makeTestRoot();
  const config = v1EngineConfig(env)!;
  // every engine run waits until the test finishes it (like a real job that takes a minute)
  const { spawn, calls } = fakeSpawner(() => ({ code: 0, stdout: ["STAGE planning Planning the moves"], hang: true }));
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) });
  const { book, words } = books();
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), ...answers);
  const ended: { ownerId: string; status: string }[] = [];
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true, atOnce: () => atOnce.n,
    usage: { engineRun: (r) => { ended.push({ ownerId: r.ownerId, status: r.status }); } } });
  // the engine finishes a run exactly as the real one does (STAGE / PROGRESS / RESULT lines, pictures, report)
  const finishRun = (call: Call) => {
    const p = playEngineOk(call.args);
    p.before?.();
    for (const line of p.stdout ?? []) call.child.stdout.emit("data", Buffer.from(line + "\n"));
    call.child.emit("close", p.code);
  };
  const running = () => calls.filter((c) => !c.child.killed && !(c as Call & { done?: boolean }).done);
  const finishOne = (call: Call) => { (call as Call & { done?: boolean }).done = true; finishRun(call); };
  return { animator, calls, config, book, ended, running, finishOne, say: (key: string) => serverWord(book, key) };
}
const person = (i: number) => ({ ownerId: `stranger-${i}`, projectId: `project-of-stranger-${i}` });
const NOBODY_BLOCKED = /Another animation|still making the last animation/;

test("100 strangers press Animate at the same moment: nobody is turned away; never more than the machine's number run at once; all 100 are made, each in its own folder", async () => {
  const atOnce = { n: 3 };
  const t = setup(atOnce, Array.from({ length: 100 }, () => "create_jacks_flip"));
  // everyone asks at once (Sonnet answers in parallel), then everyone presses Animate
  const cards = await Promise.all(Array.from({ length: 100 }, (_, i) => t.animator.turn({ ...person(i), animationId: null, message: "a stick figure does jumping jacks and a front flip", recentConversation: [] })));
  for (const c of cards) assert.ok(c.ok && !c.started && c.gate, "each stranger gets their own card");
  const presses = Array.from({ length: 100 }, (_, i) => t.animator.confirm(person(i).ownerId, person(i).projectId));
  for (const [i, p] of presses.entries()) {
    assert.ok(p.ok && p.started, `stranger ${i} is never turned away: ${JSON.stringify(p).slice(0, 200)}`);
    assert.doesNotMatch(JSON.stringify(p), NOBODY_BLOCKED);
  }
  await until(() => t.calls.length === 3);
  assert.equal(t.calls.length, 3, "the machine makes 3 at once; 97 wait in line (their card shows they are being made)");
  const ids = presses.map((p) => (p.ok && p.animation ? p.animation.animationId : ""));
  for (const [i, id] of ids.entries()) assert.equal(t.animator.get(person(i).ownerId, person(i).projectId, id)!.versions[0].status, "running");
  // the line moves: whenever one finishes, the next starts by itself, first come first served, never more than 3 at once
  let guard = 0;
  while (t.running().length && guard++ < 500) {
    assert.ok(t.running().length <= 3, `never more than 3 at once (saw ${t.running().length})`);
    const before = t.calls.length;
    t.finishOne(t.running()[0]);
    await until(() => t.calls.length === Math.min(100, before + 1) || t.calls.length === before);
  }
  await until(() => ids.every((id, i) => t.animator.get(person(i).ownerId, person(i).projectId, id)!.versions[0].status === "done"), 2000);
  assert.equal(t.calls.length, 100, "each animation was made exactly once");
  const folders = new Set(t.calls.map((c) => c.args[c.args.indexOf("--out-dir") + 1]));
  assert.equal(folders.size, 100, "every stranger's animation has its own folder");
  for (const [i, c] of t.calls.entries()) assert.ok(c.args[c.args.indexOf("--out-dir") + 1].includes(`project-of-stranger-${c.args[c.args.indexOf("--out-dir") + 1].match(/project-of-stranger-(\d+)/)![1]}`), `call ${i}`);
  // first come, first served: the engine started them in the order they pressed Animate
  const order = t.calls.map((c) => Number(c.args[c.args.indexOf("--out-dir") + 1].match(/project-of-stranger-(\d+)/)![1]));
  assert.deepEqual(order, Array.from({ length: 100 }, (_, i) => i));
  assert.equal(t.ended.filter((e) => e.status === "done").length, 100, "each run was metered once, to its own account");
  assert.deepEqual(new Set(t.ended.map((e) => e.ownerId)).size, 100);
});

test("an edit, 'clear' and 'make the rest' are never blocked by ANOTHER person's animation; only your own animation being made says so (as before)", async () => {
  const atOnce = { n: 1 };
  const t = setup(atOnce, ["create_jacks_flip", "create_jacks_flip", "edit_next_part", "edit_next_part"]);
  const A = person(1), B = person(2);
  await t.animator.turn({ ...B, animationId: null, message: "jacks", recentConversation: [] });
  const b = t.animator.confirm(B.ownerId, B.projectId);
  const bId = b.ok && b.animation ? b.animation.animationId : "";
  await until(() => t.calls.length === 1);
  t.finishOne(t.calls[0]);
  await until(() => t.animator.get(B.ownerId, B.projectId, bId)!.versions[0].status === "done");
  // A starts an animation and holds the only engine slot
  await t.animator.turn({ ...A, animationId: null, message: "jacks", recentConversation: [] });
  const a = t.animator.confirm(A.ownerId, A.projectId);
  assert.ok(a.ok && a.started);
  const aId = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.calls.length === 2);
  // B edits their own finished animation while A's runs: a card, then Animate = waits in line, never "busy"
  const edit = await t.animator.turn({ ...B, animationId: bId, message: "then he sits down", recentConversation: [] });
  assert.ok(edit.ok, JSON.stringify(edit).slice(0, 300));
  assert.doesNotMatch(JSON.stringify(edit), NOBODY_BLOCKED);
  const go = t.animator.confirm(B.ownerId, B.projectId);
  assert.ok(go.ok && go.started, JSON.stringify(go).slice(0, 300));
  assert.equal(t.calls.length, 2, "B's edit waits for the free slot (the machine makes 1 at once here)");
  // A's own animation, while it is being made: the same words as before ("This animation is still being made")
  const own = await t.animator.turn({ ...A, animationId: aId, message: "then he sits down", recentConversation: [] });
  assert.ok(own.ok && !own.started && own.turn.say === t.say("edit_while_running"), JSON.stringify(own).slice(0, 300));
  t.finishOne(t.calls[1]);
  await until(() => t.calls.length === 3);
  assert.ok(t.calls[2].args.includes("--prev"), "B's edit started by itself the moment A's ended");
  t.finishOne(t.calls[2]);
  await until(() => t.animator.get(B.ownerId, B.projectId, bId)!.versions[1]?.status === "done");
  assert.equal(t.animator.get(B.ownerId, B.projectId, bId)!.current, 2);
});

test("Stop while waiting in line: it never starts, nothing is charged, and the others are untouched", async () => {
  const atOnce = { n: 1 };
  const t = setup(atOnce, ["create_jacks_flip", "create_jacks_flip", "create_jacks_flip"]);
  const ids: string[] = [];
  for (const i of [1, 2, 3]) {
    await t.animator.turn({ ...person(i), animationId: null, message: "jacks", recentConversation: [] });
    const p = t.animator.confirm(person(i).ownerId, person(i).projectId);
    ids.push(p.ok && p.animation ? p.animation.animationId : "");
  }
  await until(() => t.calls.length === 1);
  const stop = t.animator.cancel(person(2).ownerId, person(2).projectId, ids[1]);
  assert.ok(stop.ok && stop.animation.versions[0].status === "cancelled", JSON.stringify(stop).slice(0, 200));
  t.finishOne(t.calls[0]);
  await until(() => t.calls.length === 2);
  assert.ok(t.calls[1].args[t.calls[1].args.indexOf("--out-dir") + 1].includes("project-of-stranger-3"), "the stopped one was skipped; stranger 3 went next");
  t.finishOne(t.calls[1]);
  await until(() => t.animator.get(person(3).ownerId, person(3).projectId, ids[2])!.versions[0].status === "done");
  assert.equal(t.calls.length, 2, "the stopped one never ran");
  assert.equal(t.animator.get(person(1).ownerId, person(1).projectId, ids[0])!.versions[0].status, "done");
  assert.deepEqual(t.ended.find((e) => e.ownerId === person(2).ownerId)?.status, "cancelled", "a stopped run costs nothing (metered as cancelled)");
});

test("the machine's number can change while the app runs (a bigger server): more start at once, and nobody waiting is lost", async () => {
  const atOnce = { n: 1 };
  const t = setup(atOnce, Array.from({ length: 6 }, () => "create_jacks_flip"));
  for (let i = 0; i < 6; i++) { await t.animator.turn({ ...person(i), animationId: null, message: "jacks", recentConversation: [] }); t.animator.confirm(person(i).ownerId, person(i).projectId); }
  await until(() => t.calls.length === 1);
  atOnce.n = 4;
  t.finishOne(t.calls[0]);
  await until(() => t.calls.length === 5);
  assert.equal(t.running().length, 4, "4 at once after the change");
  for (const c of [...t.running()]) t.finishOne(c);
  await until(() => t.calls.length === 6);
  t.finishOne(t.calls[5]);
  assert.equal(t.calls.length, 6);
});

test("a long story's next part is never broken by another person's animation: it waits for a free slot and goes on", async () => {
  const atOnce = { n: 1 };
  // stranger A's story is between two parts (the app restarted after part 1, as in the passed story test); stranger B holds the slot
  const first = setup({ n: 1 }, ["create_jacks_flip"]);
  const A = person(1), B = person(2);
  await first.animator.turn({ ...A, animationId: null, message: "jacks then a front flip", recentConversation: [] });
  const a = first.animator.confirm(A.ownerId, A.projectId);
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => first.calls.length === 1);
  first.finishOne(first.calls[0]);
  await until(() => first.animator.get(A.ownerId, A.projectId, id)!.versions[0].status === "done");
  const dir = `${first.config.outDir}/${A.projectId}/${id}`;
  writeFileSync(`${dir}/v1/colours.json`, JSON.stringify({ note: "" }));
  writeFileSync(`${dir}/story-pending.json`, JSON.stringify({ version: 1, left: 1, parts: [[{ text: "He sits down on the floor.", seconds: 3, travels: false }]], storyLeft: null, recentConversation: [] }));
  // the app restarts on the same folders; B presses Animate first and takes the only slot
  const { spawn, calls } = fakeSpawner(() => ({ code: 0, stdout: ["STAGE planning Planning the moves"], hang: true }));
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, readEngineWords(first.config.engineBook), first.book), "create_jacks_flip", "edit_next_part");
  const app = createV1Animator({ config: () => first.config, books: () => ({ book: first.book, words: readEngineWords(first.config.engineBook) }), luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true, atOnce: () => atOnce.n });
  await app.turn({ ...B, animationId: null, message: "jacks", recentConversation: [] });
  const b = app.confirm(B.ownerId, B.projectId);
  assert.ok(b.ok && b.started);
  await until(() => calls.length === 1);
  app.get(A.ownerId, A.projectId, id);   // A opens their project: the story goes on by itself
  await until(() => app.get(A.ownerId, A.projectId, id)!.versions[1]?.status === "running", 5000);
  assert.equal(calls.length, 1, "A's next part waits in line while B's animation is made");
  const finish = (c: (typeof calls)[number]) => { const p = playEngineOk(c.args); p.before?.(); for (const l of p.stdout ?? []) c.child.stdout.emit("data", Buffer.from(l + "\n")); c.child.emit("close", p.code); };
  finish(calls[0]);
  await until(() => calls.length === 2, 5000);
  finish(calls[1]);
  await until(() => app.get(A.ownerId, A.projectId, id)!.versions[1]?.status === "done", 5000);
  assert.equal(app.get(A.ownerId, A.projectId, id)!.current, 2, "A's whole story is there");
  assert.equal(readFileSync(`${dir}/story-pending.json`, "utf8"), "{}", "nothing left to come");
});
