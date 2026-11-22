import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyV1Ops, createV1Animator, fitInkBox, friendlyV1Report, honestLength, makeSecondsOf, normalizeV1Report, oneTakeSentences, planFromCreate, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import type { V1AnimationSnapshot, V1EditOp, V1Plan, V1Version } from "./v1AnimatorContract.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { acceptV1Sheet, lunaInstructions, lunaTurnContent, lunaTurnInput, lunaTurnSchema, normalizeV1LunaTurn, readEngineWords, readLunaBook, serverWord } from "./v1LunaBook.ts";
import { v1SheetFrames } from "../../../components/workspace/ai/v1/v1CanvasPicture.ts";
import { ANSWERS, fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";
import { V1AnimatorController, keptPreviousWords, resultLineFor, type V1PlaceTarget } from "../../../components/workspace/ai/v1/v1AnimatorController.ts";
import { createV1CanvasPlacer } from "../../../components/workspace/ai/v1/v1CanvasPlacer.ts";

// Nov 2 (AUDIT_POINT_NOV2): separate actions -> separate parts, the engine's checks + kept_previous, clear canvas, one figure,
// fixed ground line. TEST FIXTURES ONLY: the labelled hand-written answers in __fixtures__ + the REAL books + a fake engine. $0, no AI call.
const ME = { ownerId: "owner-1", projectId: "project-1" };
function setup(play: Parameters<typeof fakeSpawner>[0], ...keys: string[]) {
  const { lx, env } = makeTestRoot();
  const book = readLunaBook(join(lx, "v1k", "luna-book.json")), words = readEngineWords(join(lx, "v1k", "passed_engine_book.json"));
  const config = v1EngineConfig(env)!;
  const { spawn, calls } = fakeSpawner(play);
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), ...keys);
  const make = () => createV1Animator({ config: () => config, books: () => ({ book, words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  return { book, words, calls, animator: make(), make };
}
const ask = (animator: ReturnType<typeof createV1Animator>, message: string, animationId: string | null = null) => animator.turn({ ...ME, animationId, message, recentConversation: [] });
const planOf = (args: string[]) => JSON.parse(readFileSync(args[1], "utf8")) as V1Plan;
// the fake engine + an inkBox per version (where he moves; a bigger size = a bigger box), and optional checks / kept_previous
function playWith(extra: (plan: V1Plan) => Record<string, unknown>) {
  return (call: { args: string[] }) => {
    const p = playEngineOk(call.args);
    const outDir = call.args[call.args.indexOf("--out-dir") + 1];
    return { ...p, before: () => { p.before?.(); const r = JSON.parse(readFileSync(join(outDir, "report.json"), "utf8")); writeFileSync(join(outDir, "report.json"), JSON.stringify({ ...r, ...extra(planOf(call.args)) })); } };
  };
}
const inkFor = (plan: V1Plan) => { const z = plan.size ?? 1; return { inkBox: [900 - 100 * z, 1000 - 600 * z, 1100 + 100 * z, 1000] }; };

test("1. (Nov 2 night) ONE TAKE: the AI's parts are the separate actions; the server keeps them in ONE block (one take); past the book's one_take limits = takes in order", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_flip_point_parts");
  const turn = normalizeV1LunaTurn(ANSWERS.create_flip_point_parts, t.words, t.book)!;
  assert.deepEqual(turn.blocks, [{ sentence: "A stick figure does a front flip, then points forward.", parts: ["A stick figure does a front flip.", "A stick figure points forward."] }]);
  assert.deepEqual(planFromCreate(turn, t.book, t.words)!.blocks, [{ id: "b1", sentence: "A stick figure does a front flip, then points forward.", seed_bump: 0 }], "the AI's own whole sentence, one take");
  const out = await ask(t.animator, "he does a front flip, then points at the camera");
  assert.ok(out.ok && out.started);
  assert.deepEqual(planOf(t.calls[0].args).blocks.map((b) => b.sentence), ["A stick figure does a front flip, then points forward."], "the engine gets ONE block");
  if (out.ok) assert.doesNotMatch(out.turn.say, /2 parts/);
  // more actions than one_take_max_beats -> as few takes as allowed, the actions shared out in order (the engine continues each from the last)
  const n = t.book.longScenes.oneTakeMaxBeats + 1, acts = Array.from({ length: n }, (_, i) => `A stick figure does move ${i + 1}.`);
  const many = oneTakeSentences({ blocks: [{ sentence: "A stick figure does many moves.", parts: acts }] }, t.book);
  assert.equal(many.length, 2);
  assert.deepEqual(many.join(" "), acts.join(" "), "every action, in order, nothing dropped");
  // asked longer than one_take_max_s -> more takes even with few actions
  assert.equal(oneTakeSentences({ blocks: [{ sentence: "x", parts: ["A.", "B.", "C."] }], requestedSeconds: t.book.longScenes.oneTakeMaxS * 2 + 1 }, t.book).length, 3);
  const schema = JSON.stringify(lunaTurnSchema(t.words, t.book));
  assert.ok(schema.includes('"parts"') && schema.includes(`"maxItems":${t.book.createMaxParts}`) && schema.includes('"beat"'));
  const text = lunaInstructions(t.book, t.words);
  assert.match(text, /ONE TAKE/);
  assert.match(text, /EDIT ONE MOVE/);
  assert.match(text, /sexual/, "(Nov 2 night) the one content refusal is in the book");
  // a rewrite with parts (an edit) still splits as before
  const base: V1Plan = { contract: "v1-blocks", colour: "#111111", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "A stick figure does a front flip, then points forward.", seed_bump: 0 }, { id: "b2", sentence: "A stick figure waves.", seed_bump: 2 }] };
  const split = applyV1Ops(base, normalizeV1LunaTurn(ANSWERS.edit_resplit_b1, t.words, t.book)!.ops!, t.book, t.words);
  assert.ok("plan" in split);
  if ("plan" in split) assert.deepEqual(split.plan.blocks, [
    { id: "b1", sentence: "A stick figure does a front flip.", seed_bump: 0 }, { id: "b3", sentence: "A stick figure points forward.", seed_bump: 0 }, base.blocks[1]]);
});

test("1b2. (Nov 7, Arthur: an edit changes only what he named) a rewrite of ONE move keeps every other move's old words exactly", () => {
  const t = setup((call) => playEngineOk(call.args));
  const beats = ["jab", "cross", "hook", "duck"];
  const base: V1Plan = { contract: "v1-blocks", colour: "#111111", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "A person throws a fast jab. A person throws a hard cross. A person throws a hook. A person ducks.", seed_bump: 0, beats }] };
  const reworded = "A person in a boxing stance throws one fast straight jab. A person in a boxing stance throws one hard cross. A person throws one very big wide hook. A person in a boxing stance ducks quickly.";
  const moved = applyV1Ops(base, [{ op: "rewrite", block: "b1", sentence: reworded, beat: 3 }], t.book, t.words);
  assert.ok("plan" in moved);
  if ("plan" in moved) assert.equal(moved.plan.blocks[0].sentence, "A person throws a fast jab. A person throws a hard cross. A person throws one very big wide hook. A person ducks.");
  // a different number of moves (he asked for more) = the AI's whole new words, as before
  const more = applyV1Ops(base, [{ op: "rewrite", block: "b1", sentence: reworded + " A person waves.", beat: 3 }], t.book, t.words);
  if ("plan" in more) assert.ok(more.plan.blocks[0].sentence.includes("waves"));
});

test("1b. (Nov 2 night) EDIT BY MOVE: rewrite beat k keeps the frozen beats and sends edit_from_beat k-1; beat 1 / no beats = whole block; a bad beat = plain words", () => {
  const t = setup((call) => playEngineOk(call.args));
  const beats = ["does a front flip", "points forward", "waves"];
  const base: V1Plan = { contract: "v1-blocks", colour: "#111111", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "A stick figure does a front flip, points forward and waves.", seed_bump: 1, beats }] };
  const op = normalizeV1LunaTurn({ intent: "edit", say: "ok", ops: [{ op: "rewrite", block: "b1", sentence: "A stick figure does a front flip, spins and waves.", parts: null, beat: 2 }] }, t.words, t.book)!.ops!;
  assert.deepEqual(op[0], { op: "rewrite", block: "b1", sentence: "A stick figure does a front flip, spins and waves.", beat: 2 });
  const moved = applyV1Ops(base, op, t.book, t.words);
  assert.ok("plan" in moved);
  if ("plan" in moved) assert.deepEqual(moved.plan.blocks[0], { id: "b1", sentence: "A stick figure does a front flip, spins and waves.", seed_bump: 0, beats, edit_from_beat: 1 });
  const whole = applyV1Ops(base, [{ ...op[0], beat: 1 } as V1EditOp], t.book, t.words);
  if ("plan" in whole) assert.deepEqual(whole.plan.blocks[0], { id: "b1", sentence: "A stick figure does a front flip, spins and waves.", seed_bump: 0 });
  const bad = applyV1Ops(base, [{ ...op[0], beat: 9 } as V1EditOp], t.book, t.words);
  assert.ok("error" in bad && bad.error === serverWord(t.book, "op_no_beat", { block: "b1", beat: "9" }));
  // a later edit never carries an old edit_from_beat; a look edit keeps the frozen beats
  const look = applyV1Ops({ ...base, blocks: [{ ...base.blocks[0], edit_from_beat: 1 }] }, [{ op: "colour", colour: "#ff0000" }], t.book, t.words);
  if ("plan" in look) assert.deepEqual(look.plan.blocks[0], base.blocks[0]);
  // the AI sees the moves of each block
  const input = JSON.parse(lunaTurnInput(t.book, { message: "x", recentConversation: [], current: base, checkerSaid: null }));
  assert.deepEqual(input.currentAnimation.blocks[0].moves, beats);
  // the first fit is used EXACTLY for an edited take (no union widening): the kept start never moves
  const fit = { inkBox: [100, 100, 300, 300] as [number, number, number, number], mirror: false };
  assert.deepEqual(fitInkBox(fit, { inkBox: [50, 50, 400, 400], stage: [1000, 1000] }, false, true), [100, 100, 300, 300]);
  assert.deepEqual(fitInkBox(fit, { inkBox: [50, 50, 400, 400], stage: [1000, 1000] }, false), [50, 50, 400, 400]);
});

test("1c. (Nov 2 night) LONG / EXPENSIVE GUIDE: the making-time estimate from the book; over max_make_s = the guided shorter plan; ~10 s asks are made at once", () => {
  const t = setup((call) => playEngineOk(call.args));
  const ls = t.book.longScenes;
  const ten = { intent: "create" as const, say: "ok", blocks: [{ sentence: "A stick figure waves." }], requestedSeconds: 10 };
  assert.equal(makeSecondsOf(10, t.book), ls.makeSBase + ls.makeSPerAskedS * 10);
});

test("1d. (Nov 2 night) the timeline contact sheet: frames where the user's layers change, at most the book's max; the server guard", () => {
  const t = setup((call) => playEngineOk(call.args));
  assert.deepEqual(v1SheetFrames(["a", "a", "b", "b", "c"], 4), [0, 2, 4]);
  assert.equal(v1SheetFrames(["a", "a", "a"], 4), null, "nothing moves = no sheet");
  assert.equal(v1SheetFrames(["", "", "a"], 4), null);
  assert.deepEqual(v1SheetFrames(["a", "b", "c", "d", "e", "f", "g"], 4), [0, 2, 4, 6], "spread evenly, first and last kept");
  const pic = { mediaType: "image/jpeg", data: "AAAA", width: 10, height: 10 };
  assert.equal(acceptV1Sheet(t.book, pic), null, "no frame numbers = no sheet");
  assert.deepEqual(acceptV1Sheet(t.book, { ...pic, frames: [1, 5] })?.frames, [1, 5]);
  assert.equal(acceptV1Sheet(t.book, { ...pic, frames: [1, 2, 3, 4, 5, 6, 7] }), null, "more than the book's max_frames");
  const content = lunaTurnContent(t.book, { message: "x", recentConversation: [], current: null, checkerSaid: null, canvas: pic as never, sheet: { ...pic, frames: [1, 5] } as never });
  assert.ok(Array.isArray(content) && content.filter((c) => c.type === "image").length === 2);
});

test("2. the engine's checks in plain words on the result card; kept_previous -> 'That try came out worse, so I kept your version...'", async () => {
  const t = setup(playWith(() => ({ kept_previous: { block: "b2", why: "held point 0.1 s < 0.4 s" } })), "create_flip_point_parts");
  const raw = { ok: true, refused: null, labels: [], fps: 24, stage: [1944, 1116], layersDir: "/FIXTURE", lengthS: 1, kimodoCalls: 1, frames: { edited: 0, added: 0, deleted: 0 },
    kept_previous: { block: "b2", why: "held point 0.1 s" },
    blocks: [{ id: "b2", sentence: "A stick figure points forward.", made: "new", frames: 3, checks: [{ action: "points forward", sign: "held_point_s", value: 1.1, pass: true }, { action: "holds it", sign: "still_s", value: 0, pass: false }, { bad: 1 }] }] };
  const report = friendlyV1Report(normalizeV1Report(raw)!, t.book);
  assert.deepEqual(report.keptPrevious, { block: "b2", why: "held point 0.1 s" });
  assert.equal(report.keptPreviousSay, "That try came out worse, so I kept your version. Want me to try once more?");
  assert.deepEqual(report.blocks[0].checks?.map((c) => c.pass), [true, false], "an unreadable check row is left out");
  assert.deepEqual(report.blocks[0].checkWords, [serverWord(t.book, "check_not_seen", { action: "holds it" })], "(Nov 2 night) only what went wrong is said");
  // the panel: checks on the block, and the kept words as an AI line
  const version = { n: 2, plan: {}, edits: [], status: "done", stage: null, progress: null, report, message: null, createdAt: "", finishedAt: "" } as unknown as V1Version;
  assert.deepEqual(resultLineFor(version).blocks[0].checks, report.blocks[0].checkWords);
  assert.equal(keptPreviousWords(version), report.keptPreviousSay);
  assert.equal(keptPreviousWords({ ...version, report: { ...report, keptPrevious: null } }), null);
  // the server saves the kept line with the chat (a reload shows it again)
  const a = await ask(t.animator, "flip then point");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  assert.ok(t.animator.latest(ME.ownerId, ME.projectId).lines.some((l) => l.text === report.keptPreviousSay));
  // the book: never promise "this time"
  assert.ok(t.book.honesty.some((h) => /this time/.test(h)));
});

test("3. clear op: 'start fresh' clears the AI layer ($0, no engine run); ALL frames asks first in one sentence; the book never says it can't", async () => {
  const t = setup((call) => playEngineOk(call.args), "create_flip_point_parts", "edit_clear_ai", "edit_clear_all", "edit_clear_all_yes");
  const a = await ask(t.animator, "flip then point");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  t.animator.setLayer(ME.ownerId, ME.projectId, id, "layer-7", 48);
  const c = await ask(t.animator, "remove all the frames and start fresh", id);
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.deepEqual(c.turn.clear, { scope: "ai" });
  assert.equal(c.started, false);
  assert.equal(c.animation, null, "the panel starts fresh");
  assert.equal(t.calls.length, 1, "no engine run");
  assert.equal(t.animator.get(ME.ownerId, ME.projectId, id)!.layerId, null, "the cleared layer is forgotten");
  const all = await ask(t.animator, "delete every frame on the canvas, my drawings too");
  assert.ok(all.ok && all.turn.intent === "clarify" && !all.turn.clear);
  if (all.ok) assert.equal(all.turn.say, serverWord(t.book, "clear_all_confirm"));
  const yes = await ask(t.animator, "yes");
  assert.ok(yes.ok && yes.turn.clear?.scope === "all");
  assert.ok(t.book.capabilities.can.some((l) => /Clear the canvas/.test(l)));
  assert.ok(t.book.honesty.some((h) => /never say you cannot clear it/.test(h)));
  assert.ok(t.book.editOps.includes("clear"));
});

// ---- the panel side: clear + a new animation replaces the old figure's layer
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const PICS = { fps: 24, stage: [1920, 1080] as [number, number], pictures: ["data:image/png;base64,QQ==", "data:image/png;base64,Qg=="] };
const done = (animationId: string): V1AnimationSnapshot => ({ animationId, projectId: "proj-1", current: 1, versions: [{ n: 1, plan: { contract: "v1-blocks", colour: "#111", look: "neckless", mirror: false, blocks: [] }, edits: null, status: "done", stage: null, progress: null, report: { ok: true, refused: null, blocks: [], labels: [], frames: { edited: 0, added: 2, deleted: 0 }, lengthS: 1, kimodoCalls: 1, fps: 24, stage: [1920, 1080], layersDir: "/F", video: null }, message: null, createdAt: "", finishedAt: "" }] });
const withPics = (animation: V1AnimationSnapshot) => ({ animation, resultVersion: 1, resultError: null, result: { fps: 24, figureLayers: { fps: 24, stage: [1920, 1080], layers: [{ id: "f", name: "f", pictures: PICS.pictures }] } } });

test("3b. panel: a NEW animation replaces the previous figure's layer; clear calls the canvas (one Undo) and starts fresh", async () => {
  const queue: Response[] = [
    json({ turn: { intent: "create", say: "I'll make A." }, animation: done("A"), started: true }), json(withPics(done("A"))),
    json({ turn: { intent: "create", say: "I'll make B." }, animation: done("B"), started: true }), json(withPics(done("B"))),
    json({ turn: { intent: "edit", say: "Clearing.", clear: { scope: "ai" } }, animation: null, started: false }),
  ];
  const targets: V1PlaceTarget[] = [], clears: unknown[] = [];
  let n = 0;
  const controller = new V1AnimatorController({
    projectId: "proj-1", fetch: async (url, init) => { if (init?.method === "POST" && String(init.body).includes('"layer"')) return json({}); return queue.shift()!; },
    place: (target) => { targets.push(target); return { layerId: `layer-${++n}`, count: 2 }; },
    clear: (scope, layer) => { clears.push({ scope, layer }); return true; },
    onChange: () => {}, setTimer: () => 0, clearTimer: () => {}, wait: async () => {},
  });
  await controller.send("make A");
  await controller.send("make B");
  assert.equal(targets[0].replace, undefined);
  assert.deepEqual(targets[1].replace, { layerId: "layer-1", count: 2 }, "B goes where A was (one figure)");
  await controller.send("start fresh");
  assert.deepEqual(clears, [{ scope: "ai", layer: { layerId: "layer-2", count: 2 } }]);
  assert.equal(controller.current.animationId, null);
  assert.equal(controller.current.snapshot, null);
  // the placer: clearCanvas names the placed layer + the AI layer name; a missing bridge = false (nothing changed)
  const asked: unknown[] = [];
  const bridge = { place: () => true, info: () => ({ frameIndex: 0, layerId: "L9", layerName: "", fps: 24, spans: [] }), goToFrame: () => {}, pageMap: () => null, frameInk: () => null,
    clearCanvas: (r: unknown) => { asked.push(r); return true; } };
  const placer = createV1CanvasPlacer(bridge, async (urls) => urls.map((u) => (u ? ({} as CanvasImageSource) : null)));
  await placer({ animationId: "A", version: 1 }, PICS);
  assert.ok(placer.clearCanvas("all", null));
  assert.deepEqual(asked, [{ layerIds: ["L9"], layerNames: ["AI: Stick figure"], all: true }]);
  assert.equal(createV1CanvasPlacer({ ...bridge, clearCanvas: undefined }, async () => []).clearCanvas("ai", null), false);
});

test("4. fixed ground line: every version uses the FIRST version's page fit (size edit = same box); kept across a reload; mirrored with the take", async () => {
  const t = setup(playWith(inkFor), "create_flip_point_parts", "edit_bigger");
  const a = await ask(t.animator, "flip then point");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  await ask(t.animator, "make him bigger", id);
  await until(() => t.animator.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "done");
  const snap = t.animator.get(ME.ownerId, ME.projectId, id)!;
  assert.deepEqual(snap.versions[1].report!.inkBox, [760, 160, 1240, 1000], "the bigger version's own box is bigger");
  assert.deepEqual(snap.fit, { inkBox: [800, 400, 1200, 1000], mirror: false });
  const cur = t.animator.currentResult(ME.ownerId, ME.projectId, id);
  assert.ok(cur && "result" in cur);
  if (cur && "result" in cur) assert.deepEqual(cur.result.figureLayers!.inkBox, [760, 160, 1240, 1000], "(Nov 2) v2 moves outside v1's box -> both boxes together: all of him stays on the page, feet line kept");
  // (Nov 15) the pictures travel in pieces: asked from picture 1 on, the answer starts at picture 1 and still says how many there are in all
  const later = t.animator.currentResult(ME.ownerId, ME.projectId, id, 1);
  if (cur && "result" in cur && later && "result" in later) {
    const pics = (r: typeof cur) => r.result.figureLayers!.layers[0].pictures;
    assert.equal(cur.total >= pics(cur).length && cur.total > 1, true);
    assert.deepEqual(pics(later), pics(cur).slice(1));
    assert.equal(later.total, cur.total);
  } else assert.fail("the pictures from picture 1 on");
  assert.deepEqual(fitInkBox({ inkBox: [800, 400, 1200, 1000], mirror: false }, { inkBox: [820, 420, 1180, 1000], stage: [1944, 1116] }, false), [800, 400, 1200, 1000], "inside the first box = the first fit, unchanged");
  // a reload (a new server process on the same folder) keeps the fit
  const again = t.make();
  const restored = again.latest(ME.ownerId, ME.projectId).animation!;
  assert.deepEqual(restored.fit, { inkBox: [800, 400, 1200, 1000], mirror: false });
  // mirrored take = the same box mirrored across the stage
  assert.deepEqual(fitInkBox({ inkBox: [800, 400, 1200, 1000], mirror: false }, { inkBox: null, stage: [1944, 1116] }, true), [744, 400, 1144, 1000]);
  assert.deepEqual(fitInkBox(null, { inkBox: [1, 2, 3, 4], stage: [10, 10] }, false), [1, 2, 3, 4], "no fit yet = its own box");
  // (honest length: one action = the old words)
  assert.match(honestLength({ intent: "create", say: "I'll make him run.", blocks: [{ sentence: "A stick figure runs." }] }, t.book), /made as one part/); // (Nov 2) the real length shows when made
});
