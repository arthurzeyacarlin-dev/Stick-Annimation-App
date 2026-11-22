import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { applyV1Ops, createV1Animator, normalizeV1Conversation, normalizeV1Report, planFromCreate, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import type { V1Plan } from "./v1AnimatorContract.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { normalizeV1LunaTurn, readEngineWords, readLunaBook, serverWord } from "./v1LunaBook.ts";
import { fakeLuna, fakeSpawner, makeTestRoot, playEngineError, playEngineHang, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

// TEST FIXTURES ONLY: a fake passed_engine.py (plays the CLI contract) and a fake Luna (the labelled fixture answers). $0.
type Play = Parameters<typeof fakeSpawner>[0];
function setup(play: Play, ...answers: Parameters<typeof fakeLuna>[1][]) {
  const { env } = makeTestRoot();
  const config = v1EngineConfig(env)!;
  const { spawn, calls } = fakeSpawner(play);
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) });
  const { book, words } = books();
  const { luna, inputs } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), ...answers);
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, ...(GATE.on ? { gate: true } : {}) });
  return { animator, calls, config, book, words, inputs, say: (key: string, fill?: Record<string, string>) => serverWord(book, key, fill) };
}
const GATE = { on: false };
const ME = { ownerId: "owner-1", projectId: "project-1" };
const ask = (animator: ReturnType<typeof createV1Animator>, message: string, animationId: string | null = null) =>
  animator.turn({ ...ME, animationId, message, recentConversation: [] });
const planOf = (call: { args: string[] }) => JSON.parse(readFileSync(call.args[1], "utf8")) as V1Plan;
const BASE: V1Plan = { contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false,
  blocks: [{ id: "b1", sentence: "A stick figure does a few jumping jacks and then a front flip.", seed_bump: 0 }, { id: "b2", sentence: "A stick figure bows.", seed_bump: 1 }] };

test("applyV1Ops: only what was asked changes; untouched blocks stay exactly the same", () => {
  const { book, words } = setup(() => ({ code: 0 }));
  const ok = (ops: Parameters<typeof applyV1Ops>[1]) => { const r = applyV1Ops(BASE, ops, book, words); assert.ok("plan" in r, JSON.stringify(r)); return (r as { plan: V1Plan }).plan; };
  const rw = ok([{ op: "rewrite", block: "b1", sentence: "A stick figure does a few jumping jacks and then a backflip." }]);
  assert.deepEqual(rw.blocks[1], BASE.blocks[1]);
  assert.equal(rw.blocks[0].id, "b1");
  assert.deepEqual({ ...rw, blocks: [] }, { ...BASE, blocks: [] }, "colour / look / mirror untouched by a rewrite");
  const ap = ok([{ op: "append", sentence: "A stick figure sits down." }]);
  assert.deepEqual(ap.blocks.slice(0, 2), BASE.blocks);
  assert.deepEqual(ap.blocks[2], { id: "b3", sentence: "A stick figure sits down.", seed_bump: 0 });
  const del = ok([{ op: "delete", block: "b1" }]);
  assert.deepEqual(del.blocks, [BASE.blocks[1]]);
  assert.equal(ok([{ op: "delete", block: "b2" }, { op: "append", sentence: "x" }]).blocks[1].id, "b2", "an id one past the highest LEFT (b2 was deleted first)");
  assert.equal(ok([{ op: "redo", block: "b2" }]).blocks[1].seed_bump, 2);
  const looks = ok([{ op: "colour", colour: "#111111" }, { op: "mirror" }, { op: "look", look: "passed" }]);
  assert.deepEqual(looks.blocks, BASE.blocks, "colour / mirror / look never touch a block");
  assert.deepEqual([looks.colour, looks.mirror, looks.look], ["#111111", true, "passed"]);
  assert.deepEqual(applyV1Ops(BASE, [{ op: "rewrite", block: "b9", sentence: "x" }], book, words), { error: serverWord(book, "op_no_block", { block: "b9" }) });
  const one = { ...BASE, blocks: [BASE.blocks[0]] };
  assert.deepEqual(applyV1Ops(one, [{ op: "delete", block: "b1" }], book, words), { error: serverWord(book, "op_last_block") });
  assert.deepEqual(applyV1Ops(BASE, [{ op: "colour", colour: "#dc2626" }], book, words), { error: serverWord(book, "op_same") });
  assert.deepEqual(BASE.blocks[0].seed_bump, 0, "the base plan is never changed in place");
});

test("create: Luna's block -> a v1-blocks plan (book defaults) -> passed_engine.py --cache-only; PROGRESS -> version.progress; report blocks + frames", async () => {
  const t = setup(() => playEngineHang(), "create_jacks_flip");
  const out = await ask(t.animator, "a stick figure does a few jumping jacks and then a front flip");
  assert.ok(out.ok && out.started);
  if (!out.ok || !out.animation) return;
  await until(() => t.animator.get(ME.ownerId, ME.projectId, out.animation!.animationId)!.versions[0].progress !== null);
  const running = t.animator.get(ME.ownerId, ME.projectId, out.animation.animationId)!.versions[0];
  // (Nov 22, hour 2) the bar runs on real times, not the engine's guess (12 % / 100 s): just started = near 0 %, time left from the measured model
  assert.ok(running.progress && running.progress.pct < 5 && running.progress.etaS > 0, JSON.stringify(running.progress));
  assert.deepEqual(running.stage?.progress, running.progress);
  assert.ok(t.calls[0].args[0].endsWith("passed_engine.py"));
  assert.ok(t.calls[0].args.includes("--cache-only"));
  assert.deepEqual(planOf(t.calls[0]), { contract: "v1-blocks", colour: t.book.defaultColour, look: t.book.defaultLook, mirror: false, camera: "still", // (Nov 11) still by default
    blocks: [{ id: "b1", sentence: "A stick figure does a few jumping jacks and then a front flip.", seed_bump: 0 }],
    context: { words: "a stick figure does a few jumping jacks and then a front flip" } }); // (Nov 3 final part A) the planner sees the user's own words
  const stopped = t.animator.cancel(ME.ownerId, ME.projectId, out.animation.animationId);
  assert.ok(stopped.ok && stopped.animation.versions[0].status === "cancelled" && stopped.animation.versions[0].progress === null);
});

test("create -> done -> edit (rewrite b2 of 2 blocks): --prev, b1 'same', frames; undo / redo walk done versions", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_jacks_flip", "edit_next_part", "edit_backflip");
  const a = await ask(t.animator, "jacks then a front flip");
  assert.ok(a.ok && a.animation);
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  let snap = t.animator.get(ME.ownerId, ME.projectId, id)!;
  assert.equal(snap.current, 1);
  assert.deepEqual(snap.versions[0].report!.blocks.map((b) => [b.id, b.made, b.frames]), [["b1", "new", 3]]);
  assert.equal(snap.versions[0].progress, null, "progress is cleared when the version is done");
  await ask(t.animator, "then he sits down", id);
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "done");
  snap = t.animator.get(ME.ownerId, ME.projectId, id)!;
  assert.ok(t.calls[1].args.includes("--prev"));
  assert.deepEqual(snap.versions[1].report!.blocks.map((b) => [b.id, b.made]), [["b1", "same"], ["b2", "new"]]);
  assert.deepEqual(snap.versions[1].edits, [{ op: "append", sentence: "A stick figure sits down on the floor." }]);
  await ask(t.animator, "make it a backflip", id);
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[2]?.status === "done");
  snap = t.animator.get(ME.ownerId, ME.projectId, id)!;
  const p3 = planOf(t.calls[2]);
  const { beats: _b, ...b2 } = p3.blocks[1]; void _b; // (Nov 2 night) every made block carries its frozen beats now
  assert.deepEqual(b2, { id: "b2", sentence: "A stick figure sits down on the floor.", seed_bump: 0 }, "b2 untouched by b1's rewrite");
  assert.deepEqual(snap.versions[2].report!.blocks.map((b) => [b.id, b.made]), [["b1", "new"], ["b2", "same"]]);
  assert.deepEqual(snap.versions[2].report!.frames, { edited: 3, added: 0, deleted: 0 });   // (Nov 20) a re-made part changes its pictures; an edit that changed none made nothing (an honest failure)
  const u = t.animator.undo(ME.ownerId, ME.projectId, id);
  assert.ok(u.ok && u.animation.current === 2);
  const r = t.animator.redo(ME.ownerId, ME.projectId, id);
  assert.ok(r.ok && r.animation.current === 3);
  assert.equal(t.calls.length, 3, "undo / redo spawn nothing");
});

test("(Nov 14, no guards) ops that cannot apply: an honest failure at once - the AI is NOT asked again behind the user's back; nothing spawned", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_jacks_flip", "edit_unknown_block", "edit_unknown_block");
  const a = await ask(t.animator, "jacks");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  await ask(t.animator, "change part 7", id);
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "failed");
  assert.equal(t.inputs.length, 2, "one ask for the animation, one for the change - no hidden second ask");
  assert.equal(t.calls.length, 1);
  assert.equal(t.animator.get(ME.ownerId, ME.projectId, id)!.current, 1, "a failed version never becomes current");
});

test("(Nov 18) a first try that made nothing is no animation: the next turn is still a NEW animation", async () => {
  const t = setup(() => playEngineError("no money"), "create_jacks_flip", "create_jacks_flip");
  const a = await ask(t.animator, "jacks");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "failed");
  await ask(t.animator, "jacks", id);
  assert.equal((t.inputs[1] as { current: unknown }).current, null);
});

test("engine ERROR = its plain words to the user (no Luna retry); refused report = refused", async () => {
  const words = "this part needs a new plan or a new Kimodo take, and this run may not make new ones (cache only)";
  const t = setup(() => playEngineError(words), "create_jacks_flip");
  const a = await ask(t.animator, "jacks");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "failed");
  const v = t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0];
  assert.equal(v.message, t.say("failed_engine", { words }));
  assert.equal(t.inputs.length, 1);
  const r = setup((call) => playEngineOk(call.args, { refused: "V1 makes ONE stick figure - this part asks for 2 figures" }), "create_jacks_flip");
  const b = await ask(r.animator, "two guys");
  const bid = b.ok && b.animation ? b.animation.animationId : "";
  await until(() => r.animator.get(ME.ownerId, ME.projectId, bid)!.versions[0].status === "refused");
  assert.equal(r.animator.get(ME.ownerId, ME.projectId, bid)!.versions[0].message, "V1 makes ONE stick figure - this part asks for 2 figures");
});

test("report.json normalising + small helpers", () => {
  assert.equal(normalizeV1Report({ ok: true, fps: 0 }), null, "an ok report without fps / stage / layers is unreadable");
  const r = normalizeV1Report({ ok: true, refused: null, fps: 24, stage: [1944, 1116], layersDir: "/L", blocks: [{ id: "b1", sentence: "s", made: "same", frames: 7, labels: ["x"] }], frames: { edited: 76 } })!;
  assert.deepEqual(r.blocks[0].made, "same");
  assert.deepEqual(r.frames, { edited: 76, added: 0, deleted: 0 });
  const { book, words } = setup(() => ({ code: 0 }));
  assert.equal(planFromCreate({ intent: "create", say: "s", blocks: [{ sentence: " A stick figure jumps. " }], colour: "#2563eb" }, book, words)!.blocks[0].sentence, "A stick figure jumps.");
  assert.equal(planFromCreate({ intent: "create", say: "s" }, book, words), null);
  assert.deepEqual(normalizeV1Conversation(undefined), []);
});

// ---- Nov 2 (Arthur's bugs): memory after a reload / restart, the size op, the fps op, honest answers. TEST FIXTURES ONLY ($0).
test("reload / restart: a NEW runner on the same folder gets the animation + chat back; 'make him tinier' edits THAT animation (size op, $0)", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_jacks_flip");
  const a = await ask(t.animator, "jacks then a front flip");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  assert.ok(t.animator.setLayer(ME.ownerId, ME.projectId, id, "layer-ai-1", 3).ok);
  // (the server restarts: a fresh runner, nothing in memory, the same engine folder)
  const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna, inputs } = fakeLuna((raw) => normalizeV1LunaTurn(raw, t.words, t.book), "edit_tinier");
  const again = createV1Animator({ config: () => t.config, books: () => ({ book: t.book, words: t.words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const back = again.latest(ME.ownerId, ME.projectId);
  assert.equal(back.animation?.animationId, id);
  assert.equal(back.animation?.current, 1);
  assert.equal(back.animation?.layerId, "layer-ai-1");
  assert.deepEqual(back.lines.map((l) => [l.role, l.kind ?? null]), [["user", null], ["assistant", null], ["assistant", "result"]]);
  assert.equal(back.lines[0].text, "jacks then a front flip");
  assert.deepEqual(again.latest("someone-else", ME.projectId).lines, [], "another account never sees this chat");
  const e = await again.turn({ ...ME, animationId: id, message: "make this stick figure tinier", recentConversation: [] });
  assert.ok(e.ok && e.started, "the edit runs on the SAME animation after the restart");
  assert.equal(inputs[0].current?.blocks[0].sentence, "A stick figure does a few jumping jacks and then a front flip.", "Luna sees the current animation");
  await until(() => again.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "done", 5000);
  const plan = planOf(calls[0]);
  assert.equal(plan.size, 0.7);
  assert.deepEqual(plan.blocks.map(({ beats: _b, ...rest }) => rest), [{ id: "b1", sentence: "A stick figure does a few jumping jacks and then a front flip.", seed_bump: 0 }], "size never touches a block");
  assert.ok(plan.blocks[0].beats?.length, "(Nov 2 night) the frozen beats ride along unchanged");
  assert.ok(calls[0].args.includes("--prev"), "the same take is re-used ($0)");
  assert.equal(again.get(ME.ownerId, ME.projectId, id)!.current, 2);
});

test("size op: a number in the book's range; normal size = no size key; out of range = honest words", () => {
  const { book, words } = setup(() => ({ code: 0 }));
  const r = applyV1Ops(BASE, [{ op: "size", size: 0.5 }], book, words);
  assert.ok("plan" in r && r.plan.size === 0.5 && JSON.stringify(r.plan.blocks) === JSON.stringify(BASE.blocks));
  const back = applyV1Ops({ ...BASE, size: 0.5 }, [{ op: "size", size: words.size.normal }], book, words);
  assert.ok("plan" in back && !("size" in back.plan));
  assert.deepEqual(applyV1Ops(BASE, [{ op: "size", size: 1 }], book, words), { error: serverWord(book, "op_same") });
  assert.ok("error" in applyV1Ops(BASE, [{ op: "size", size: words.size.max * 2 }], book, words));
  assert.equal(normalizeV1LunaTurn({ intent: "edit", say: "x", ops: [{ op: "size", size: words.size.max * 2 }] }, words, book), null, "Luna's out-of-range size is a bad answer");
});

test("fps op: $0, no engine run, no new version; above the engine's fps = capped with honest words; 12 fps kept on the snapshot", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_jacks_flip", "edit_smoother", "edit_fps12");
  const a = await ask(t.animator, "jacks then a front flip");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  const smoother = await ask(t.animator, "make it smoother, 60 fps", id);
  assert.ok(smoother.ok && !smoother.started);
  if (!smoother.ok) return;
  assert.equal(smoother.turn.say, serverWord(t.book, "fps_capped", { fps: 24 }), "never pretends 60 fps is smoother");
  assert.equal(smoother.animation?.fps, null, "the engine's own 24 = no override");
  assert.equal(t.inputs[1].playback?.engineFps, 24, "Luna is told the engine's fps");
  const twelve = await ask(t.animator, "play it at 12 fps", id);
  assert.ok(twelve.ok && !twelve.started && twelve.animation?.fps === 12 && twelve.animation.versions.length === 1);
  assert.equal(t.calls.length, 1, "fps never runs the engine");
});

test("honest refusal + the book lists every op with an example", async () => {
  const t = setup(() => ({ code: 0 }), "refuse_honest_3d");
  const out = await ask(t.animator, "add a second guy who fights him");
  assert.ok(out.ok && out.turn.intent === "refuse" && out.turn.say.includes(t.book.capability) && t.calls.length === 0);
  for (const op of ["rewrite", "append", "delete", "redo", "colour", "mirror", "look", "size", "fps"]) {
    assert.ok(t.book.editOps.includes(op), `ops list names ${op}`);
    assert.ok(JSON.stringify(t.book.editExamples).includes(`"op":"${op}"`), `an example for ${op}`);
  }
  assert.ok(t.book.honesty.some((h) => /never make up/i.test(h)), "the honesty rule: never make up an answer");
});

// (Nov 2 final round, owner) EFFORT: the chat's level rides from the turn request to the brain call (absent = not sent = low).
// (fixture failures: no engine is started, only the brain call's input is read)
test("effort: the turn's level is handed to the brain call; no level = no field", async () => {
  const t = setup(() => playEngineHang(), { fail: "unreachable" }, { fail: "unreachable" });
  await t.animator.turn({ ...ME, animationId: null, message: "FIXTURE a backflip", recentConversation: [], effort: "high" });
  await ask(t.animator, "FIXTURE a backflip");
  assert.equal((t.inputs[0] as { effort?: string }).effort, "high");
  assert.equal("effort" in (t.inputs[1] as object), false);
});

// (Nov 11, Arthur's dad) the gate: a new animation is planned but NOT made or charged until Animate (confirm); a new message replaces it
test("gate: create waits at the card (nothing spawned); confirm starts exactly that plan; a new message replaces a waiting plan", async () => {
  GATE.on = true;
  try {
    const t = setup(() => playEngineHang(), "create_jacks_flip", "create_jacks_flip");
    const out = await ask(t.animator, "a stick figure does a few jumping jacks and then a front flip");
    assert.ok(out.ok && !out.started && out.gate && out.gate.credits > 0);
    assert.equal(t.calls.length, 0, "nothing is made before Animate");
    const again = await ask(t.animator, "a stick figure does a few jumping jacks and then a front flip");
    assert.ok(again.ok && !again.started && again.gate, "a new message = a new waiting plan");
    const go = t.animator.confirm(ME.ownerId, ME.projectId);
    assert.ok(go.ok && go.started && go.animation);
    assert.equal(t.calls.length, 1, "Animate starts the engine once");
    assert.equal(planOf(t.calls[0]).blocks[0].sentence, "A stick figure does a few jumping jacks and then a front flip.");
    const twice = t.animator.confirm(ME.ownerId, ME.projectId);
    assert.ok(!twice.ok && twice.status === 409, "a plan is started only once");
    if (go.ok && go.animation) t.animator.cancel(ME.ownerId, ME.projectId, go.animation.animationId);
  } finally { GATE.on = false; }
});

// (Nov 20, Fable B1/B2: his punch scene - fal had no money, no video came back, and it was saved as "Version 4"; the next edit built on it)
test("(Nov 20) an edit that changed no picture made nothing: an honest failure with the reason, never a version; the next edit starts from the last good one", async () => {
  const t = setup((call) => {
    const p = playEngineOk(call.args);
    if (!call.args.includes("--prev")) return p;
    const out = call.args[call.args.indexOf("--out-dir") + 1];
    return { ...p, before: () => {
      p.before?.();
      const rp = `${out}/report.json`; const r = JSON.parse(readFileSync(rp, "utf8"));
      r.frames = { edited: 0, added: 0, deleted: 0 };   // what his version 4 reported: the engine got no video back
      writeFileSync(rp, JSON.stringify(r));
      mkdirSync(`${out}/blocks/b2`, { recursive: true });
      writeFileSync(`${out}/blocks/b2/block.json`, JSON.stringify({ raw_labels: ["H3 Turbo could not make it (fal answered 403: User is locked. Reason: Exhausted balance. Top up your balance): the animation stayed as it was."] }));
    } };
  }, "create_jacks_flip", "edit_next_part");
  const a = await ask(t.animator, "jacks then a front flip");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  await ask(t.animator, "then he sits down", id);
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status !== "running");
  const snap = t.animator.get(ME.ownerId, ME.projectId, id)!;
  assert.equal(snap.versions[1].status, "failed", "nothing made is never a version");
  assert.equal(snap.current, 1, "the animation stays the last good version");
  // (Nov 22, plan hour 5) the user gets plain words - never our provider's name or its money; Arthur gets the alert (ownerAlert)
  assert.match(String(snap.versions[1].message), /^The animator can't make animations right now\. Nothing was made and no credits were taken/);
  assert.doesNotMatch(String(snap.versions[1].message), /fal|top(ped)? up|balance/i);
});

// (Nov 20, Arthur: "it cuts off halfway") the app restarted between part 1 and part 2 of his story: the story goes on by itself from the
// saved parts, and a message of his meanwhile is answered at once - never a change built on half a story
test("(Nov 20) a restart between two parts: the story goes on by itself; his message meanwhile is answered, nothing is built on half a story", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_jacks_flip");
  const a = await ask(t.animator, "jacks then a front flip");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  writeFileSync(`${t.config.outDir}/${ME.projectId}/${id}/v1/colours.json`, JSON.stringify({ note: "" }));   // (the step sheet the next part waits for)
  writeFileSync(`${t.config.outDir}/${ME.projectId}/${id}/story-pending.json`,
    JSON.stringify({ version: 1, left: 1, parts: [[{ text: "He sits down on the floor.", seconds: 3, travels: false }]], storyLeft: null, recentConversation: [] }));
  // the app restarts: a new animator on the same folders
  const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna, inputs } = fakeLuna((raw) => normalizeV1LunaTurn(raw, t.words, t.book), "edit_next_part");
  const again = createV1Animator({ config: () => t.config, books: () => ({ book: t.book, words: t.words }), luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true });
  assert.ok(again.get(ME.ownerId, ME.projectId, id), "his animation opens");
  const mine = await again.turn({ ...ME, animationId: id, message: "make him blue", recentConversation: [] });
  assert.ok(mine.ok && !mine.started && /still being made/.test(mine.turn.say), "his message while the rest is made is answered, nothing started from it");
  await until(() => again.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "done", 5000);
  assert.equal(calls.length, 1, "the rest of the story was made once");
  assert.ok(inputs.some((x) => /Add the next part of this story now/.test(JSON.stringify(x))), "the story's own next part was asked for");
  assert.ok(!inputs.some((x) => /make him blue/.test(JSON.stringify(x))), "his message was not sent to the AI during the story");
  assert.equal(again.get(ME.ownerId, ME.projectId, id)!.current, 2);
  assert.equal(readFileSync(`${t.config.outDir}/${ME.projectId}/${id}/story-pending.json`, "utf8"), "{}", "nothing left to come");
  const asked = inputs.length;
  await again.turn({ ...ME, animationId: id, message: "make him blue", recentConversation: [] });
  assert.equal(inputs.length, asked + 1, "once the story is all there, his messages go to the AI again");
});

test("(Nov 20, Fable) all or nothing: part of a change got no video while another part changed - the whole change fails, never a version with a step that was not made", async () => {
  const t = setup((call) => {
    const p = playEngineOk(call.args);
    if (!call.args.includes("--prev")) return p;
    const out = call.args[call.args.indexOf("--out-dir") + 1];
    return { ...p, before: () => {
      p.before?.();
      mkdirSync(`${out}/blocks/b2`, { recursive: true });
      writeFileSync(`${out}/blocks/b2/block.json`, JSON.stringify({ raw_labels: ["H3 Turbo could not make the change (no answer): that part stayed as it was."] }));
    } };
  }, "create_jacks_flip", "edit_next_part");
  const a = await ask(t.animator, "jacks then a front flip");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  await ask(t.animator, "then he sits down", id);
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status !== "running");
  const snap = t.animator.get(ME.ownerId, ME.projectId, id)!;
  assert.equal(snap.versions[1].status, "failed");
  assert.equal(snap.current, 1);
  assert.match(String(snap.versions[1].message), /^Nothing new was made - the animator \(H3\) gave no video back for part of it/);
});

test("(Nov 20) a story part that got no video (fal had no money): the rest is KEPT, exactly as the card said, and one press makes it", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_jacks_flip");
  const a = await ask(t.animator, "jacks then a front flip");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  const dir = `${t.config.outDir}/${ME.projectId}/${id}`;
  writeFileSync(`${dir}/v1/colours.json`, JSON.stringify({ note: "" }));
  const part = [{ text: "He sits down on the floor.", seconds: 3, travels: false }];
  writeFileSync(`${dir}/story-pending.json`, JSON.stringify({ version: 1, left: 1, parts: [part], storyLeft: null, recentConversation: [] }));
  const broke = { on: true };
  const { spawn, calls } = fakeSpawner((call) => {
    const p = playEngineOk(call.args);
    if (!broke.on) return p;
    const out = call.args[call.args.indexOf("--out-dir") + 1];
    return { ...p, before: () => {
      p.before?.();
      const rp = `${out}/report.json`; const r = JSON.parse(readFileSync(rp, "utf8")); r.frames = { edited: 0, added: 0, deleted: 0 }; writeFileSync(rp, JSON.stringify(r));
      mkdirSync(`${out}/blocks/b2`, { recursive: true });
      writeFileSync(`${out}/blocks/b2/block.json`, JSON.stringify({ raw_labels: ["H3 Turbo could not make it (fal answered 403: User is locked. Reason: Exhausted balance. Top up your balance)"] }));
    } };
  });
  const { luna, inputs } = fakeLuna((raw) => normalizeV1LunaTurn(raw, t.words, t.book), "edit_next_part", "edit_next_part");
  const app = createV1Animator({ config: () => t.config, books: () => ({ book: t.book, words: t.words }), luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true });
  app.get(ME.ownerId, ME.projectId, id);
  await until(() => app.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "failed", 5000);
  const held = app.get(ME.ownerId, ME.projectId, id)!;
  assert.equal(held.current, 1, "the failed part is never a version");
  assert.equal(held.storyPartsHeld, 1, "the rest of the story is kept");
  assert.equal(held.storyPartsLeft, undefined, "nothing is being made: his box is free");
  assert.match(String(held.versions[1].message), /can't make animations right now.*press "Make the rest of my story"/);
  assert.equal(JSON.parse(readFileSync(`${dir}/story-pending.json`, "utf8")).held, true, "kept on disk too (a restart keeps it, never makes it by itself)");
  broke.on = false;   // (fal is topped up)
  const go = app.continueStory(ME.ownerId, ME.projectId, id);
  assert.ok(go.ok && go.animation?.storyPartsLeft === 1);
  await until(() => app.get(ME.ownerId, ME.projectId, id)!.versions[2]?.status === "done", 5000);
  assert.equal(app.get(ME.ownerId, ME.projectId, id)!.current, 3);
  assert.equal(app.get(ME.ownerId, ME.projectId, id)!.storyPartsHeld, undefined);
  assert.equal(calls.length, 2);
  assert.equal(inputs.filter((x) => /He sits down on the floor\. \(3 s\)/.test(JSON.stringify(x))).length, 2, "both times the SAME kept steps were asked for");
  assert.ok(!app.continueStory(ME.ownerId, ME.projectId, id).ok, "nothing left to continue");
});

test("(Nov 20, Fable) a kept story: read back after a restart (never made by itself); 'Leave it as it is' lets it go; his own change lets it go too", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_jacks_flip");
  const a = await ask(t.animator, "jacks then a front flip");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  const dir = `${t.config.outDir}/${ME.projectId}/${id}`;
  const kept = JSON.stringify({ held: true, parts: [[{ text: "He sits down on the floor.", seconds: 3, travels: false }]], storyLeft: null, recentConversation: [] });
  const fresh = (...answers: Parameters<typeof fakeLuna>[1][]) => {
    const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
    const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, t.words, t.book), ...answers);
    return { app: createV1Animator({ config: () => t.config, books: () => ({ book: t.book, words: t.words }), luna: luna as V1LunaCall, spawn: spawn as Spawner, gate: true }), calls };
  };
  writeFileSync(`${dir}/story-pending.json`, kept);
  const one = fresh();
  assert.equal(one.app.get(ME.ownerId, ME.projectId, id)!.storyPartsHeld, 1, "kept after a restart");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(one.calls.length, 0, "never made by itself");
  assert.ok(one.app.dropStory(ME.ownerId, ME.projectId, id).ok);
  assert.equal(one.app.get(ME.ownerId, ME.projectId, id)!.storyPartsHeld, undefined, "Leave it as it is");
  assert.equal(readFileSync(`${dir}/story-pending.json`, "utf8"), "{}");
  writeFileSync(`${dir}/story-pending.json`, kept);
  const two = fresh("edit_next_part");
  assert.equal(two.app.get(ME.ownerId, ME.projectId, id)!.storyPartsHeld, 1);
  const card = await two.app.turn({ ...ME, animationId: id, message: "then he sits down", recentConversation: [] });
  assert.ok(card.ok && card.gate);
  assert.equal(two.app.get(ME.ownerId, ME.projectId, id)!.storyPartsHeld, 1, "a card alone changes nothing");
  assert.ok(two.app.confirm(ME.ownerId, ME.projectId).ok);
  assert.equal(two.app.get(ME.ownerId, ME.projectId, id)!.storyPartsHeld, undefined, "his own change lets the kept story go: it is never added on top later");
  await until(() => two.app.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "done", 5000);
});
