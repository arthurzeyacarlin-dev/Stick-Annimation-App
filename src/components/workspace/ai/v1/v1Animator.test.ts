// AI Animator V1 panel tests (B3). Run: node --test src/components/workspace/ai/v1/v1Animator.test.ts
// Every snapshot below is a LABELLED TEST FIXTURE written by hand for these tests ("FIXTURE" in its words) — not a real
// Luna reply and not a real engine result. Nothing here calls the server, Luna or Kimodo ($0).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import ts from "typescript";
import type { V1AnimationSnapshot, V1Version } from "../../../../lib/ai/v1Animator/v1AnimatorContract.ts";
import { V1AnimatorController, V1_PANEL_WORDS, emptyV1PanelState, framesDelta, framesSummary, friendlyLabel, gentleBarPct, progressWords, readV1Pictures, readV1Progress, readV1Effort, readV1Snapshot, saveV1Effort, timeLeftWords, undoRedoState, v1EffortKey, type V1PanelState, type V1VersionPictures, V1_LAYER_REMOVED } from "./v1AnimatorController.ts";
import { createV1CanvasPlacer, v1PlacementFps, v1RetimeIndices } from "./v1CanvasPlacer.ts";

// ---- A tiny loader so the .tsx view can be rendered here: "@/..." paths, extensionless imports, .tsx and .css files.
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const tryFile = (base: string) => [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => existsSync(candidate) && !candidate.endsWith("/"));
// (Node 24 has module.registerHooks; this repo's @types/node is older, so it is typed here.)
type ResolveResult = { url: string; shortCircuit?: boolean };
type LoadResult = { format: string; source: string | Uint8Array; shortCircuit?: boolean };
type Hooks = {
  resolve: (specifier: string, context: { parentURL?: string }, next: (specifier: string, context: { parentURL?: string }) => ResolveResult) => ResolveResult;
  load: (url: string, context: object, next: (url: string, context: object) => LoadResult) => LoadResult;
};
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: Hooks) => void };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      const file = tryFile(resolvePath(ROOT, specifier.slice(2)));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !context.parentURL.includes("/node_modules/")) { // (packages resolve themselves)
      const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
      if (!existsSync(base) || !/\.[a-z]+$/i.test(base)) {
        const file = tryFile(base);
        if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
      }
    }
    // (next/link etc.: Node's ESM needs the file's .js ending for a package's sub-path without an "exports" map)
    if (/^next\/[a-z-]+$/.test(specifier)) return next(`${specifier}.js`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "export default new Proxy({}, { get: (_, key) => String(key) });", shortCircuit: true };
    if (url.endsWith(".tsx")) {
      const source = readFileSync(fileURLToPath(url), "utf8");
      const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, allowImportingTsExtensions: true, verbatimModuleSyntax: false } });
      return { format: "module", source: out.outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});

// ---- Labelled fixtures
const FIXTURE_PICTURES: V1VersionPictures = { fps: 24, stage: [1920, 1080], pictures: ["data:image/png;base64,FIXTURE-0", "data:image/png;base64,FIXTURE-1", null, "data:image/png;base64,FIXTURE-3"] };
// B2's answer shape (app/api/ai-animator/v1/route.ts): { animation, result (the CURRENT version's EngineBlockResult), resultVersion, resultError }
const withPictures = (animation: V1AnimationSnapshot, n: number) => ({
  animation, resultVersion: n, resultError: null,
  result: { fps: 24, figures: [{ id: "fig", name: "Fig" }], frames: [[], [], [], []], effects: [], lengthS: 4 / 24, video: null, continuedFromLastPose: false,
    figureLayers: { fps: 24, stage: [1920, 1080], layers: [{ id: "fig", name: "Fig", pictures: FIXTURE_PICTURES.pictures }] } },
});
const noPictures = (animation: V1AnimationSnapshot) => ({ animation, result: null, resultVersion: null, resultError: null });
const turnAnswer = (say: string, intent: string, animation: V1AnimationSnapshot | null) => ({ turn: { intent, say }, animation, started: Boolean(animation) });
// (CONTRACT_SAME_ENGINE v1-blocks shapes; typed loosely so the fixtures survive T1's exact contract type names)
const plan = { contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "FIXTURE", seed_bump: 0 }] };
const version = (n: number, patch: Record<string, unknown>): V1Version => ({ n, plan, edits: null, status: "running", stage: null, report: null, message: null, createdAt: "2026-11-01T00:00:00Z", finishedAt: null, ...patch }) as unknown as V1Version;
const doneReport = (blocks: { sentence: string; made: "new" | "same"; labels?: string[]; frames?: number; id?: string }[], labels: string[] = [], frames: { edited: number; added: number; deleted: number } | null = null) => ({
  ok: true, refused: null, labels, lengthS: 4.2, kimodoCalls: 0, fps: 24, stage: [1920, 1080] as [number, number], layersDir: "/FIXTURE", video: null,
  blocks: blocks.map((b, i) => ({ id: b.id ?? `b${i + 1}`, sentence: b.sentence, made: b.made, firstFrame: 0, frames: b.frames ?? 50, lengthS: 2.1, moves: ["FIXTURE beat"], labels: b.labels ?? [] })),
  ...(frames ? { frames } : {}),
});
const snap = (versions: V1Version[], current: number): V1AnimationSnapshot => ({ animationId: "anim-FIXTURE", projectId: "proj-1", versions, current });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// A fake server: each call is answered by the next queued answer for that kind (turn / get / pictures / undo / redo / cancel).
function fakeServer() {
  const queues: Record<string, Response[]> = {};
  const calls: { kind: string; body: Record<string, unknown> | null; url: string }[] = [];
  const answer = (kind: string, response: Response) => { (queues[kind] ??= []).push(response); };
  const fetch = async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://local");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    const kind = body ? String(body.action) : !parsed.searchParams.get("animationId") ? "restore" : parsed.searchParams.get("layers") === "0" ? "get" : "pictures";
    calls.push({ kind, body, url });
    const next = queues[kind]?.shift();
    if (!next) throw new Error(`no fixture answer queued for ${kind}`);
    return next;
  };
  return { answer, fetch, calls };
}
function rig(options: { place?: (n: number) => boolean; now?: () => number } = {}) {
  const server = fakeServer();
  const timers: (() => void)[] = [];
  const states: V1PanelState[] = [];
  const placed: number[] = [];
  const controller = new V1AnimatorController({
    projectId: "proj-1", fetch: server.fetch, onChange: (s) => states.push(s),
    place: (target) => { placed.push(target.version); return options.place ? options.place(target.version) : true; },
    setTimer: (run) => { timers.push(run); return timers.length; }, clearTimer: () => {}, now: options.now ?? (() => 0), wait: async () => {},
  });
  const tick = async () => { const run = timers.shift(); assert.ok(run, "a poll was scheduled"); run(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
  return { server, controller, states, placed, timers, tick };
}

test("words: progress from PROGRESS lines, time left, frames line", () => {
  assert.deepEqual(readV1Progress({ progress: { pct: 40, etaS: 100 } }), { pct: 40, etaS: 100 });
  assert.deepEqual(readV1Progress({ stage: { code: "animating", words: "x", progress: { pct: 140, eta_s: "12" } } }), { pct: 100, etaS: 12 });
  assert.deepEqual(readV1Progress({ stage: { code: "animating", words: "x", pct: 5, etaS: -3 } }), { pct: 5, etaS: null }, "a bad eta = unknown");
  assert.deepEqual(readV1Progress({ stage: null }), { pct: null, etaS: null });
  assert.equal(timeLeftWords(100), "About 1 min 40 s left");
  assert.equal(timeLeftWords(97), "About 1 min 40 s left", "rounded up, never promises less");
  assert.equal(timeLeftWords(120), "About 2 min left");
  assert.equal(timeLeftWords(33), "About 35 s left");
  assert.equal(timeLeftWords(4), "Almost done");
  assert.equal(timeLeftWords(null), "Working out the time left");
  assert.equal(framesSummary(doneReport([{ sentence: "a", made: "same" }, { sentence: "b", made: "new" }], [], { edited: 76, added: 0, deleted: 0 }), true), "76 frames edited · 0 added · 0 deleted");
  assert.equal(framesSummary(doneReport([{ sentence: "a", made: "new", frames: 240 }]), false), "240 frames made");
  assert.equal(framesSummary(doneReport([{ sentence: "a", made: "new", frames: 1 }], [], { edited: 1, added: 2, deleted: 3 }), true), "1 frame edited · 2 added · 3 deleted");
  assert.equal(framesSummary(null, false), "", "nothing known = no line, never a made-up count");
  assert.deepEqual(framesDelta(doneReport([{ sentence: "a", made: "same" }], [], { edited: 76, added: 48, deleted: 4 }), true), { plus: 124, minus: 4 }, "edited + added = the plus, deleted = the minus");
  assert.deepEqual(framesDelta(doneReport([{ sentence: "a", made: "new", frames: 176 }]), false), { plus: 176, minus: 0 }, "first version: all made");
  assert.equal(framesDelta(null, false), null, "nothing known = no numbers");
  assert.equal(readV1Snapshot({ nope: 1 }), null);
  assert.equal(readV1Snapshot({ snapshot: snap([], 0) })?.animationId, "anim-FIXTURE");
  assert.equal(readV1Snapshot({ animation: snap([], 0) })?.animationId, "anim-FIXTURE");
  assert.deepEqual(readV1Pictures(withPictures(snap([], 1), 1), 1), { ...FIXTURE_PICTURES, inkBox: null });
  assert.equal(readV1Pictures(withPictures(snap([], 1), 1), 2), null, "pictures of another version never count");
  assert.equal(readV1Pictures({ ...withPictures(snap([], 1), 1), result: { figureLayers: { fps: 24, stage: [1920, 1080], layers: [{ pictures: [null] }] } } }, 1), null, "no picture at all = nothing to place");
  assert.deepEqual(undoRedoState(snap([version(1, { status: "done" }), version(2, { status: "refused" }), version(3, { status: "done" })], 3)), { canUndo: true, canRedo: false });
});

test("create: Thinking -> Luna's words -> Animating card (bar + time left, never backwards) -> Putting it on the canvas -> placed + result line", async () => {
  let clock = 1000;
  const { server, controller, states, placed, tick } = rig({ now: () => clock });
  server.answer("turn", json(turnAnswer("FIXTURE: Sure, a backflip and then he kneels.", "create", snap([version(1, { stage: { code: "planning", words: "Planning" } })], 0))));
  const sending = controller.send("FIXTURE do a backflip then kneel");
  assert.equal(controller.current.activity, "Thinking", "the gradient line says Thinking while Luna answers");
  assert.equal(controller.current.lines[0].kind, "user");
  await sending;
  assert.equal(controller.current.lines[1].kind, "work", "(Nov 17) what he did, folded into one grey line, comes first");
  assert.equal(controller.current.lines[2].kind, "ai");
  assert.equal(controller.current.busy, "running");
  assert.equal(controller.current.activity, null, "while animating: the card, not the gradient line");
  assert.deepEqual(controller.current.progress, { pct: null, etaS: null, at: 1000 });
  assert.equal(server.calls[0].body?.action, "turn");
  assert.equal(server.calls[0].body?.projectId, "proj-1");
  assert.equal("animationId" in (server.calls[0].body ?? {}), false, "no animation yet on the first turn");

  clock = 2500;
  server.answer("get", json(noPictures(snap([version(1, { stage: { code: "animating", words: "Animating" }, progress: { pct: 30, etaS: 100 } })], 0))));
  await tick();
  assert.deepEqual(controller.current.progress, { pct: 30, etaS: 100, at: 2500 });
  clock = 4000;
  server.answer("get", json(noPictures(snap([version(1, { stage: { code: "drawing", words: "Drawing", pct: 20, etaS: 100 } })], 0))));
  await tick();
  assert.deepEqual(controller.current.progress, { pct: 30, etaS: 100, at: 2500 }, "the bar never goes backwards; the same eta keeps counting down");
  server.answer("get", json(noPictures(snap([version(1, { stage: { code: "drawing", words: "Drawing", progress: { pct: 80, etaS: 20 } } })], 0))));
  await tick();
  assert.deepEqual(controller.current.progress, { pct: 80, etaS: 20, at: 4000 });
  assert.ok(states.every((st) => !/\bof\b \d|move \d/i.test(st.activity ?? "")), "no 'move i of n' anywhere");

  const madeV1 = snap([version(1, { status: "done", report: doneReport([{ sentence: "does a backflip", made: "new", frames: 60 }, { sentence: "kneels down", made: "new", frames: 41, labels: ["FIXTURE: he stays kneeling - standing back up comes later", "FIXTURE m2 kind=kneel STAGE /tmp/x.json"] }]) })], 1);
  server.answer("get", json(noPictures(madeV1)));
  server.answer("pictures", json(withPictures(madeV1, 1)));
  await tick();
  assert.ok(states.some((s) => s.stage === V1_PANEL_WORDS.placing && s.busy === "finishing"), "Putting it on the canvas was shown above the bar");
  assert.ok(states.every((s) => s.busy !== "finishing" || s.progress?.onCanvas === true || gentleBarPct(s.progress?.pct ?? null, 1000) <= 95), "(Nov 17) never past 95% before it is on the canvas");
  const kinds = controller.current.lines.map((l) => l.kind);
  assert.equal(kinds[kinds.length - 2], "work", "(Nov 17) the made version folds into one grey line just above its result");
  assert.deepEqual(placed, [1]);
  const result = controller.current.lines.at(-1);
  assert.equal(result?.kind, "result");
  if (result?.kind === "result") {
    assert.deepEqual(result.blocks.map((b) => b.sentence), ["does a backflip", "kneels down"]);
    assert.deepEqual(result.blocks.map((b) => b.mark), ["made", "made"], "first version: no re-made / unchanged marks");
    assert.equal(result.summary, "101 frames made");
    assert.deepEqual(result.delta, { plus: 101, minus: 0 });
    assert.equal(result.edited, false);
    assert.equal(result.lengthS, 4.2);
    assert.deepEqual(result.blocks[1].labels, ["FIXTURE: he stays kneeling - standing back up comes later"], "a technical label is never shown");
  }
  assert.equal(controller.current.activity, null);
  assert.equal(controller.current.progress, null, "the card goes away once it is made");
  assert.equal(controller.current.busy, null);
  assert.equal(controller.current.placedVersion, 1);
  const pictureCall = server.calls.find((c) => c.kind === "pictures");
  assert.match(pictureCall?.url ?? "", /animationId=anim-FIXTURE/);
  assert.doesNotMatch(server.calls.filter((c) => c.kind === "get").map((c) => c.url).join(" "), /layers=1/);
  assert.ok(server.calls.filter((c) => c.kind === "get").every((c) => /layers=0/.test(c.url)), "polls never carry the big pictures");
});

test("edit -> frames line + re-made / new / unchanged marks; Undo swaps back instantly (pictures kept, no new fetch); Redo forward", async () => {
  const { server, controller, placed } = rig();
  const v1 = version(1, { status: "done", report: doneReport([{ sentence: "does a backflip", made: "new" }, { sentence: "kneels down", made: "new" }]) });
  server.answer("turn", json(turnAnswer("FIXTURE: here it is", "create", snap([v1], 1))));
  server.answer("pictures", json(withPictures(snap([v1], 1), 1)));
  await controller.send("FIXTURE backflip then kneel");
  assert.deepEqual(placed, [1]);

  const v2 = version(2, { status: "done", edits: [{ op: "rewrite", block: "b1", sentence: "does a big backflip" }, { op: "append", sentence: "waves" }], report: doneReport([{ sentence: "does a big backflip", made: "new" }, { sentence: "kneels down", made: "same" }, { sentence: "waves", made: "new" }], [], { edited: 76, added: 48, deleted: 0 }) });
  server.answer("turn", json(turnAnswer("FIXTURE: higher backflip, the kneel stays the same", "edit", snap([v1, v2], 2))));
  server.answer("pictures", json(withPictures(snap([v1, v2], 2), 2)));
  await controller.send("FIXTURE jump higher");
  assert.equal(server.calls.find((c) => c.kind === "turn" && c.body?.message === "FIXTURE jump higher")?.body?.animationId, "anim-FIXTURE", "an edit names the animation");
  const recent = server.calls.at(-2)?.body?.recentConversation as { role: string; content: string }[];
  assert.deepEqual(recent.map((m) => m.role), ["user", "assistant"]);
  const edited = controller.current.lines.filter((l) => l.kind === "result").at(-1);
  assert.ok(edited?.kind === "result" && edited.edited);
  if (edited?.kind === "result") {
    assert.deepEqual(edited.blocks.map((b) => b.mark), ["re-made", "unchanged", "new"], "an added block says new, not re-made");
    assert.equal(edited.summary, "76 frames edited · 48 added · 0 deleted");
    assert.deepEqual(edited.delta, { plus: 124, minus: 0 });
  }
  assert.deepEqual(placed, [1, 2]);
  assert.deepEqual(undoRedoState(controller.current.snapshot), { canUndo: true, canRedo: false });

  server.answer("undo", json(withPictures(snap([v1, v2], 1), 1)));
  const picturesBefore = server.calls.filter((c) => c.kind === "pictures").length;
  await controller.step("undo");
  assert.deepEqual(placed, [1, 2, 1]);
  assert.equal(server.calls.filter((c) => c.kind === "pictures").length, picturesBefore, "Undo reuses the kept pictures");
  assert.equal(controller.current.placedVersion, 1);
  assert.equal(controller.current.lines.some((l) => l.kind === "note"), false, "Undo is silent: no chat line");
  assert.deepEqual(undoRedoState(controller.current.snapshot), { canUndo: false, canRedo: true });

  server.answer("redo", json(withPictures(snap([v1, v2], 2), 2)));
  await controller.step("redo");
  assert.deepEqual(placed, [1, 2, 1, 2]);
  assert.equal(controller.current.placedVersion, 2);
});

test("(Nov 15) an animation of any length loads: the pictures come in pieces and are put together in order; a missing piece = nothing placed", async () => {
  const pieceOf = (animation: V1AnimationSnapshot, pictures: (string | null)[], total: number) => { const all = withPictures(animation, 1); return { ...all, resultTotal: total, result: { ...all.result, figureLayers: { ...all.result.figureLayers, layers: [{ id: "fig", name: "Fig", pictures }] } } }; };
  const run = async (pieces: (string | null)[][], total: number) => {
    const server = fakeServer(), got: (string | null)[][] = [], states: V1PanelState[] = [];
    const controller = new V1AnimatorController({ projectId: "proj-1", fetch: server.fetch, onChange: (s) => states.push(s), place: (_target, pictures) => { got.push(pictures.pictures); return true; },
      setTimer: () => 1, clearTimer: () => {}, now: () => 0, wait: async () => {} });
    const v1 = version(1, { status: "done", report: doneReport([{ sentence: "a long story", made: "new" }]) });
    server.answer("turn", json(turnAnswer("FIXTURE: here it is", "create", snap([v1], 1))));
    for (const piece of pieces) server.answer("pictures", json(pieceOf(snap([v1], 1), piece, total)));
    await controller.send("FIXTURE a long story");
    return { got, asked: server.calls.filter((c) => c.kind === "pictures").map((c) => new URL(c.url, "http://local").searchParams.get("from")), lines: states.at(-1)!.lines };
  };
  const whole = await run([["data:image/png;base64,P0", "data:image/png;base64,P1"], ["data:image/png;base64,P2"], ["data:image/png;base64,P3", "data:image/png;base64,P4"]], 5);
  assert.deepEqual(whole.got, [["data:image/png;base64,P0", "data:image/png;base64,P1", "data:image/png;base64,P2", "data:image/png;base64,P3", "data:image/png;base64,P4"]], "every picture, in order, placed once");
  assert.deepEqual(whole.asked, [null, "2", "3"], "each next piece is asked from the picture after the last one that came");
  const short = await run([["data:image/png;base64,P0", "data:image/png;base64,P1"]], 5).catch(() => null);   // (the fake server has no second piece = a failed request)
  assert.deepEqual(short?.got, [], "a piece that never came: nothing is placed (never half an animation)");
  assert.ok(short?.lines.some((l) => l.kind === "ai" && l.tone === "error"), "and it is said");
});
test("(Nov 15) the panel keeps a bounded amount of picture text: the version used longest ago is let go and asked again on Undo; a version bigger than the room is not kept", async () => {
  const run = async (keptPictureText: number) => {
    const server = fakeServer(), placed: number[] = [];
    const controller = new V1AnimatorController({ projectId: "proj-1", fetch: server.fetch, onChange: () => {}, place: (target) => { placed.push(target.version); return { layerId: "L1", count: 4 }; },
      setTimer: () => 1, clearTimer: () => {}, now: () => 0, wait: async () => {}, keptPictureText });
    const v1 = version(1, { status: "done", report: doneReport([{ sentence: "waves", made: "new" }]) }), v2 = version(2, { status: "done", edits: [{ op: "append", sentence: "bows" }], report: doneReport([{ sentence: "waves", made: "same" }, { sentence: "bows", made: "new" }]) });
    server.answer("turn", json(turnAnswer("FIXTURE one", "create", snap([v1], 1)))); server.answer("pictures", json(withPictures(snap([v1], 1), 1))); server.answer("layer", json({ animation: snap([v1], 1) }));
    await controller.send("FIXTURE wave");
    server.answer("turn", json(turnAnswer("FIXTURE two", "edit", snap([v1, v2], 2)))); server.answer("pictures", json(withPictures(snap([v1, v2], 2), 2)));
    await controller.send("FIXTURE then bow");
    server.answer("undo", json(noPictures(snap([v1, v2], 1)))); server.answer("pictures", json(withPictures(snap([v1, v2], 1), 1)));
    await controller.step("undo");
    return { placed, fetches: server.calls.filter((c) => c.kind === "pictures").length };
  };
  const one = FIXTURE_PICTURES.pictures.reduce((sum, url) => sum + (url ? url.length : 0), 0);
  assert.deepEqual(await run(one * 2), { placed: [1, 2, 1], fetches: 2 }, "room for both versions: Undo is instant, nothing is asked again");
  assert.deepEqual(await run(one), { placed: [1, 2, 1], fetches: 3 }, "room for one: version 1 was let go when version 2 came, and is asked again on Undo");
  assert.deepEqual(await run(one - 1), { placed: [1, 2, 1], fetches: 3 }, "a version bigger than the room: placed all the same, just not kept");
});
test("(Nov 15) a finished version that never reached the canvas (no layer known) is put there when the panel opens again", async () => {
  const r = rig();
  const made = snap([version(1, { status: "done", report: doneReport([{ sentence: "FIXTURE a long story", made: "new" }]) })], 1);
  r.server.answer("restore", json({ animation: { ...made, layerId: null, fps: null }, lines: [{ role: "user", text: "FIXTURE a long story", at: "t" }] }));
  r.server.answer("pictures", json(withPictures(made, 1)));
  await r.controller.restore();
  assert.deepEqual(r.placed, [1], "placed now");
  assert.equal(r.controller.current.placedVersion, 1);
  assert.ok(r.controller.current.lines.some((l) => l.kind === "result" && l.version === 1), "with its result line");
});

test("(Nov 15 night) THE PANEL LOOKS: the server's note names a layer the canvas does not hold = the version is put there on opening; never a second time, never when he took it away", async () => {
  const made = snap([version(1, { status: "done", finishedAt: "2026-11-01T00:01:00Z", report: doneReport([{ sentence: "FIXTURE basketball", made: "new" }]) })], 1);
  const settle = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
  const open = async (note: Record<string, unknown>, holds: (() => boolean | null) | null) => {
    const r = rig();
    if (holds) (r.controller as unknown as { deps: { holds: unknown } }).deps.holds = holds;
    r.server.answer("restore", json({ animation: { ...made, ...note }, lines: [] }));
    r.server.answer("pictures", json(withPictures(made, 1)));
    const done = r.controller.restore();
    for (let k = 0; k < 4; k += 1) { await settle(); r.timers.shift()?.(); }
    await done;
    return r;
  };
  assert.deepEqual((await open({ layerId: "layer-3", layerCount: 4 }, () => false)).placed, [1], "the project was left before the save: the canvas is empty, so it is put there");
  assert.deepEqual((await open({ layerId: "layer-3", layerCount: 4 }, () => true)).placed, [], "the canvas holds it: nothing is placed, so never a second layer");
  let asked = 0;
  assert.deepEqual((await open({ layerId: "layer-3", layerCount: 4 }, () => (asked++ === 0 ? false : true))).placed, [], "one 'no' while the project is still opening is not enough");
  assert.deepEqual((await open({ layerId: "layer-3", layerCount: 4 }, () => null)).placed, [], "a canvas that cannot say = as before");
  assert.deepEqual((await open({ layerId: "layer-3", layerCount: 4 }, null)).placed, [], "no look given = as before");
  assert.deepEqual((await open({ layerId: V1_LAYER_REMOVED }, () => false)).placed, [], "he took the layer away himself: it is never put back by itself");
  // the layer is there, but the project was saved BEFORE the current version was finished: it holds an older version
  const when = Date.parse(made.versions[0].finishedAt ?? "") || 0;
  assert.ok(when > 0, "the fixture version has a finish time");
  const openSaved = async (savedAt: number | null) => {
    const r = rig();
    Object.assign((r.controller as unknown as { deps: Record<string, unknown> }).deps, { holds: () => true, savedAt: () => savedAt });
    r.server.answer("restore", json({ animation: { ...made, layerId: "layer-3", layerCount: 4 }, lines: [] }));
    r.server.answer("pictures", json(withPictures(made, 1)));
    await r.controller.restore();
    return r.placed;
  };
  assert.deepEqual(await openSaved(when - 60_000), [1], "saved a minute before the version was finished: the new version is put on the canvas");
  assert.deepEqual(await openSaved(when + 60_000), [], "saved after it: the canvas has it, nothing is placed");
  assert.deepEqual(await openSaved(null), [], "never saved / unknown: as before");
  // Undo / Redo and then the project was left before the save: this browser noted which version that saved state holds
  const openNoted = async (note: { n: number; at: number } | null) => {
    const r = rig();
    Object.assign((r.controller as unknown as { deps: Record<string, unknown> }).deps, { holds: () => true, savedAt: () => when + 60_000, kept: { read: () => note, write: () => {} } });
    r.server.answer("restore", json({ animation: { ...made, layerId: "layer-3", layerCount: 4 }, lines: [] }));
    r.server.answer("pictures", json(withPictures(made, 1)));
    await r.controller.restore();
    return r.placed;
  };
  assert.deepEqual(await openNoted({ n: 2, at: when + 60_000 }), [1], "the saved project holds version 2, the current one is 1: version 1 is put on the canvas");
  assert.deepEqual(await openNoted({ n: 1, at: when + 60_000 }), [], "it holds the current version: nothing is placed");
  assert.deepEqual(await openNoted({ n: 2, at: when + 5 }), [], "a note about another saved state does not count");
  assert.deepEqual(await openNoted(null), [], "no note: as before");
});

test("(Nov 15 night) a layer he takes off the canvas himself is noted on the server, once, and only after it was seen there", async () => {
  const made = snap([version(1, { status: "done", report: doneReport([{ sentence: "FIXTURE basketball", made: "new" }]) })], 1);
  const r = rig();
  let there = true;
  (r.controller as unknown as { deps: { holds: unknown } }).deps.holds = () => there;
  r.server.answer("restore", json({ animation: { ...made, layerId: "layer-3", layerCount: 4 }, lines: [] }));
  await r.controller.restore();
  const notes = () => r.server.calls.filter((c) => c.kind === "layer");
  there = false; r.controller.noticeLayer(); r.controller.noticeLayer(); r.controller.noticeLayer();
  assert.equal(notes().length, 0, "never seen on the canvas by this panel: nothing is noted (a project that is still opening)");
  there = true; r.controller.noticeLayer();
  there = false; r.controller.noticeLayer();
  assert.equal(notes().length, 0, "one look is not enough");
  r.server.answer("layer", json({ animation: made }));
  r.controller.noticeLayer();
  assert.equal(notes().length, 1); assert.equal(notes()[0].body!.layerId, V1_LAYER_REMOVED);
  r.controller.noticeLayer(); r.controller.noticeLayer();
  assert.equal(notes().length, 1, "noted once");
});

test("refused: a plain AI line with the book's words, nothing placed, no result line, no fake animating", async () => {
  const { server, controller, placed } = rig();
  server.answer("turn", json(turnAnswer("FIXTURE: I can only animate one single stick figure.", "refuse", null)));
  await controller.send("FIXTURE two people dancing");
  assert.deepEqual(placed, []);
  assert.equal(controller.current.activity, null);
  assert.deepEqual(controller.current.lines.filter((l) => l.kind !== "work").map((l) => l.kind), ["user", "ai"]);
  // a version the engine itself refused
  server.answer("turn", json(turnAnswer("", "create", snap([version(1, { status: "refused", message: "FIXTURE refusal words from the book" })], 0))));
  await controller.send("FIXTURE a dog");
  assert.deepEqual(placed, []);
  const last = controller.current.lines.at(-1);
  assert.ok(last?.kind === "ai" && last.text === "FIXTURE refusal words from the book");
  assert.equal(controller.current.lines.some((l) => l.kind === "result"), false);
});

test("failed / server error / cancel: honest lines, nothing added to the canvas", async () => {
  const { server, controller, placed, tick } = rig();
  server.answer("turn", json({ error: "FIXTURE: Luna is resting, try again soon." }, 503));
  await controller.send("FIXTURE wave");
  const error = controller.current.lines.at(-1);
  assert.ok(error?.kind === "ai" && error.tone === "error" && error.text === "FIXTURE: Luna is resting, try again soon.");
  assert.equal(controller.current.busy, null);
  server.answer("turn", json({ error: "FIXTURE TypeError: engine.py exit 2 (m1 kind)" }, 500));
  await controller.send("FIXTURE wave");
  const friendly = controller.current.lines.at(-1);
  assert.ok(friendly?.kind === "ai" && !/TypeError|engine\.py|m1/.test(friendly.text), "a raw technical error is never shown");

  server.answer("turn", json(turnAnswer("FIXTURE ok", "create", snap([version(1, { stage: { code: "animating", words: "Animating" } })], 0))));
  await controller.send("FIXTURE wave");
  server.answer("get", json(noPictures(snap([version(1, { status: "failed", message: "FIXTURE: the motion check failed twice" })], 0))));
  await tick();
  const failed = controller.current.lines.at(-1);
  assert.ok(failed?.kind === "ai" && failed.text === "FIXTURE: the motion check failed twice");
  assert.deepEqual(placed, []);

  server.answer("turn", json(turnAnswer("FIXTURE ok", "create", snap([version(1, { status: "failed" }), version(2, { stage: { code: "animating", words: "Animating" } })], 0))));
  await controller.send("FIXTURE wave again");
  assert.equal(controller.current.busy, "running");
  server.answer("cancel", json({ animation: snap([version(1, { status: "failed" }), version(2, { status: "cancelled", message: "FIXTURE: Stopped. Nothing was added." })], 0) }));
  const cancelling = controller.cancel();
  assert.equal(controller.current.busy, "cancelling", "the card says Stopping while it stops");
  await cancelling;
  const stopped = controller.current.lines.at(-1);
  assert.ok(stopped?.kind === "ai" && /Stopped/.test(stopped.text));
  assert.equal(controller.current.activity, null);
  assert.equal(controller.current.progress, null);
  assert.deepEqual(placed, []);
});

test("never interrupt: a busy canvas -> no message, no button; it is placed by itself the moment it is free", async () => {
  let allow = false;
  const { server, controller, placed, tick } = rig({ place: () => allow });
  const made = snap([version(1, { status: "done", report: doneReport([{ sentence: "waves", made: "new" }]) })], 1);
  server.answer("turn", json(turnAnswer("FIXTURE ok", "create", made)));
  server.answer("pictures", json(withPictures(made, 1)));
  await controller.send("FIXTURE wave");
  assert.equal(controller.current.pendingPlace, 1);
  assert.equal(controller.current.placedVersion, null);
  assert.deepEqual(controller.current.lines.filter((l) => l.kind !== "work").map((l) => l.kind), ["user", "ai"], "no 'stop playing' line");
  assert.equal(controller.current.lines.some((l) => /stop|busy|Put it on the canvas/i.test("text" in l ? l.text : "")), false);
  await tick(); // still busy: tried again silently
  assert.deepEqual(placed, [1, 1]);
  allow = true;
  await tick();
  assert.deepEqual(placed, [1, 1, 1]);
  assert.equal(controller.current.pendingPlace, null);
  assert.equal(controller.current.placedVersion, 1);
  assert.equal(controller.current.lines.at(-1)?.kind, "result");
});

test("progress: the bar shows 100% before the result appears", async () => {
  const { server, controller, states, tick } = rig();
  server.answer("turn", json(turnAnswer("FIXTURE ok", "create", snap([version(1, { progress: { pct: 60, etaS: 20 } })], 0))));
  await controller.send("FIXTURE wave");
  assert.equal(controller.current.progress?.pct, 60);
  const done = snap([version(1, { status: "done", report: doneReport([{ sentence: "waves", made: "new" }]) })], 1);
  server.answer("get", json(noPictures(done)));
  server.answer("pictures", json(withPictures(done, 1)));
  await tick();
  const full = states.findIndex((s) => s.busy === "finishing" && s.progress?.onCanvas === true);
  const result = states.findIndex((s) => s.lines.some((l) => l.kind === "result"));
  const made = states.findIndex((s) => s.busy === "finishing");
  assert.ok(made >= 0 && full > made && result > full, "(Nov 17) made -> 'Putting it on the canvas' under 95% -> 100% only once it IS on the canvas -> the result");
  assert.equal(controller.current.busy, null);
});

test("speed op ($0): a speed-only edit re-places the SAME version re-timed, no engine run", async () => {
  const { server, controller } = rig();
  const placedSpeeds: (number | null | undefined)[] = [];
  const c2 = new V1AnimatorController({ projectId: "proj-1", fetch: server.fetch, onChange: () => {}, place: (target) => { placedSpeeds.push(target.speed); return true; }, setTimer: () => 0, clearTimer: () => {}, wait: async () => {} });
  void controller;
  const v1 = version(1, { status: "done", report: doneReport([{ sentence: "runs", made: "new" }]) });
  server.answer("turn", json(turnAnswer("FIXTURE ok", "create", snap([v1], 1))));
  server.answer("pictures", json(withPictures(snap([v1], 1), 1)));
  await c2.send("FIXTURE run");
  server.answer("turn", json(turnAnswer("FIXTURE: faster it is", "edit", { ...snap([v1], 1), speed: 1.5 })));
  await c2.send("FIXTURE make him faster");
  assert.deepEqual(placedSpeeds, [null, 1.5]);
  assert.equal(server.calls.filter((c) => c.kind === "pictures").length, 1, "the kept pictures are re-timed (no new fetch)");
});

test("speed re-timing: faster drops pictures, slower repeats them, the last picture stays last", () => {
  assert.deepEqual(v1RetimeIndices(8, 1), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(v1RetimeIndices(8, 2), [0, 2, 4, 7]);
  assert.deepEqual(v1RetimeIndices(4, 0.5), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(v1RetimeIndices(240, 1.5).length, 160);
  assert.deepEqual(v1RetimeIndices(0, 2), []);
});

test("placer never interrupts: playing -> paused, placed, played again", async () => {
  let playing = true;
  const log: string[] = [];
  const bridge = {
    place: (_scene: unknown, placement: { mode: string }) => { log.push(playing ? "place-while-playing" : `place:${placement.mode}`); return !playing; },
    info: () => ({ frameIndex: 0, layerId: "layer-9", layerName: "AI", fps: 24, spans: [] }),
    goToFrame: () => {}, pageMap: () => null, frameInk: () => null,
    isPlaying: () => playing,
    pausePlayback: () => { log.push("pause"); playing = false; return true; },
    resumePlayback: () => { log.push("resume"); playing = true; },
  };
  const placer = createV1CanvasPlacer(bridge as never, async (urls) => urls.map((u) => (u ? ({} as CanvasImageSource) : null)), async () => {});
  const result = await placer({ animationId: "anim-FIXTURE", version: 1, speed: 2 }, FIXTURE_PICTURES);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(result, { layerId: "layer-9", count: 2 }, "speed 2 = half the pictures");
  assert.deepEqual(log, ["pause", "place:new-layer", "resume"]);
});

test("canvas placer: first version = a new layer; later versions REPLACE that same layer; (Nov 2) a new animation REPLACES the old one's layer", async () => {
  const placements: { mode: string; layerId?: string; count?: number; layers?: number }[] = [];
  let layerCounter = 0, active = "";
  let refuseReplace = false;
  const bridge = {
    place: (scene: unknown, placement: { mode: "new-layer" | "replace"; layerId?: string; count?: number }) => {
      const figs = (scene as { prebuiltFigureLayers?: { layers: unknown[] } }).prebuiltFigureLayers;
      if (placement.mode === "replace" && refuseReplace) return false;
      placements.push({ mode: placement.mode, layerId: placement.layerId, count: placement.count, layers: figs?.layers.length });
      if (placement.mode === "new-layer") active = `layer-${++layerCounter}`;
      return true;
    },
    info: () => ({ frameIndex: 0, layerId: active, layerName: "AI: Animator stick figure", fps: 24, spans: [] }),
    goToFrame: () => {}, pageMap: () => null, frameInk: () => null,
  };
  const decode = async (urls: readonly (string | null)[]) => urls.map((url) => url ? ({ fixture: url } as unknown as CanvasImageSource) : null);
  const placer = createV1CanvasPlacer(bridge, decode);
  assert.deepEqual(await placer({ animationId: "a", version: 1 }, FIXTURE_PICTURES), { layerId: "layer-1", count: 4 }, "says where it went (kept by the server)");
  assert.ok(await placer({ animationId: "a", version: 2 }, FIXTURE_PICTURES));
  assert.deepEqual(placements[0], { mode: "new-layer", layerId: undefined, count: undefined, layers: 1 });
  assert.deepEqual(placements[1], { mode: "replace", layerId: "layer-1", count: 4, layers: 1 });
  refuseReplace = true; // (the layer was deleted)
  await placer({ animationId: "a", version: 1 }, FIXTURE_PICTURES);
  assert.equal(placements[2].mode, "new-layer");
  refuseReplace = false;
  await placer({ animationId: "b", version: 1 }, FIXTURE_PICTURES);
  // (Nov 2, one figure rule: replaces the earlier rule "a different animation never overwrites the first one's layer")
  assert.deepEqual(placements[3], { mode: "replace", layerId: "layer-2", count: 4, layers: 1 }, "a new animation takes the old figure's layer (app Undo brings it back)");
  assert.equal(await placer({ animationId: "c", version: 1 }, { ...FIXTURE_PICTURES, pictures: [null, null] }), false, "no pictures = nothing placed");
});

test("view: Thinking gradient line, Animating card, frames line + marks, Undo/Redo with icons, refusal, error", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { V1AnimatorThread, v1ThreadStyles } = await import("./V1AnimatorThread.tsx");
  const Reply = ({ message }: { message: { content: string } }) => React.createElement("div", { "data-fixture-reply": "" }, message.content);
  const render = (state: V1PanelState, readOnly = false) => renderToStaticMarkup(React.createElement(V1AnimatorThread, { state, Reply, readOnly, onRevealed: () => {}, onUndo: () => {}, onRedo: () => {}, onCancel: () => {} }));

  const thinking = render({ ...emptyV1PanelState(), busy: "thinking", activity: "Thinking", lines: [{ id: 1, kind: "user", text: "FIXTURE backflip" }] });
  assert.match(thinking, /data-text="Thinking"/, "Thinking = the same AssistantActivity gradient line");
  assert.doesNotMatch(thinking, /data-v1-card/);

  const running = render({ ...emptyV1PanelState(), busy: "running", activity: null, progress: { pct: 42, etaS: 100, at: 0 }, lines: [{ id: 1, kind: "user", text: "FIXTURE backflip" }, { id: 2, kind: "ai", text: "FIXTURE sure" }] });
  assert.match(running, /data-v1-card=""/);
  assert.match(running, /data-text="Animating"[^]*data-v1-card=""/, "Animating = the standalone gradient line ABOVE the card");
  assert.doesNotMatch(running.slice(running.indexOf("data-v1-card")), /data-text=/, "no action word inside the card");
  assert.match(running, /class="v1-card-time">About 1 min 40 s left</);
  // (Nov 17) the engine's 42% is drawn as 40% (scaled into 0-95: 100% only once it is on the canvas)
  assert.match(running, /role="progressbar"[^>]*aria-valuetext="40%, About 1 min 40 s left"[^>]*aria-valuenow="40"/);
  assert.match(running, /width:39.9%/);
  assert.match(running, /class="v1-pct" aria-hidden="true">40%</, "the percentage sits next to the time left");
  assert.match(running, /<button type="button" class="v1-x" aria-label="Cancel animation" title="Cancel animation"><svg/, "Cancel = an X icon button inside the card");
  assert.doesNotMatch(running, /\bof \d|move \d/i, "no 'move i of n' while animating");
  assert.match(running, /class="ai-animator-message v1-reply"[^>]*>[^]*<p aria-hidden="true">FIXTURE sure<\/p>/, "AI words = the panel's paragraph reply");

  const noEta = render({ ...emptyV1PanelState(), busy: "running", activity: null, progress: null });
  assert.match(noEta, /Working out the time left/);
  assert.doesNotMatch(noEta, /aria-valuenow/, "unknown progress is not pretended");
  const stopping = render({ ...emptyV1PanelState(), busy: "cancelling", activity: null, progress: { pct: 60, etaS: 40, at: 0 } });
  assert.match(stopping, /data-text="Stopping"/);
  assert.match(stopping, /Nothing will be added to the canvas/);
  assert.match(stopping, /aria-label="Cancel animation" title="Stopping…" disabled="">/);

  const v1 = version(1, { status: "done" }), v2 = version(2, { status: "done" });
  const done = render({ ...emptyV1PanelState(), snapshot: snap([v1, v2], 2), placedVersion: 2, lines: [
    { id: 3, kind: "result", version: 2, edited: true, lengthS: 4.2, summary: "76 frames edited · 0 added · 0 deleted", delta: { plus: 76, minus: 0 }, labels: ["FIXTURE whole-animation label"], blocks: [
      { n: 1, id: "b1", sentence: "does a big backflip", mark: "re-made", labels: [] },
      { n: 2, id: "b2", sentence: "kneels down", mark: "unchanged", labels: ["FIXTURE he stays kneeling"] },
    ] },
  ] });
  assert.match(done, /Version 2/);
  assert.match(done, /4\.2 seconds/);
  assert.match(done, /on the canvas/);
  assert.match(done, /data-v1-versions=""[^]*data-v1-delta=""[^>]*title="76 frames edited · 0 added · 0 deleted"[^]*Undo[^]*Redo/, "the numbers sit ABOVE Undo / Redo in one card");
  assert.match(done, /class="v1-plus">\+76<\/span><span class="v1-minus v1-zero">\u221200?<\/span>|class="v1-plus">\+76<\/span><span class="v1-minus v1-zero">−0<\/span>/, "green plus, −0 (always red, zero included)");
  assert.doesNotMatch(done, /v1-summary/, "the plain counts line became the coloured numbers");
  assert.match(done, /does a big backflip<\/span><span class="v1-mark v1-mark-re-made">edited</);   // (Nov 15: a changed part is "edited" - an edit is never a re-make)
  assert.match(done, /kneels down<\/span><span class="v1-mark v1-mark-unchanged">unchanged</);
  assert.match(done, /class="v1-label">FIXTURE he stays kneeling/, "honest labels, muted");
  assert.match(done, /FIXTURE whole-animation label/);
  assert.match(done, /<button type="button" title="Show the version before"><svg[^]*?<\/svg>Undo<\/button>/, "Undo: icon + text, enabled (version 1 exists)");
  assert.match(done, /<button type="button" title="Show the version after" disabled=""><svg[^]*?<\/svg>Redo<\/button>/, "Redo off (nothing after version 2)");
  assert.doesNotMatch(done, /role="status"|data-v1-card=""/, "nothing moving when nothing happens");
  assert.match(render({ ...emptyV1PanelState(), snapshot: snap([v1, v2], 2), placedVersion: 2, lines: [{ id: 3, kind: "result", version: 2, edited: true, lengthS: 4.2, summary: "", labels: [], blocks: [] }] }, true), /disabled="">.*Undo/, "read-only: Undo off");

  const refused = render({ ...emptyV1PanelState(), lines: [{ id: 4, kind: "user", text: "FIXTURE two people" }, { id: 5, kind: "ai", text: "FIXTURE I can only animate one single stick figure" }] });
  assert.match(refused, /FIXTURE I can only animate one single stick figure/);
  assert.doesNotMatch(refused.replace(/<button[^>]*class="v1-copy[^"]*"[^>]*>.*?<\/button>/g, ""), /v1-result|<button|data-v1-card/);   // (Nov 18: the Copy button under a message is allowed)

  const failed = render({ ...emptyV1PanelState(), lines: [{ id: 6, kind: "ai", tone: "error", text: "FIXTURE couldn't reach Luna" }] });
  assert.match(failed, /role="alert"/);

  const first = render({ ...emptyV1PanelState(), snapshot: snap([v1], 1), placedVersion: 1, lines: [{ id: 7, kind: "result", version: 1, edited: false, lengthS: 3, summary: "72 frames made", delta: { plus: 72, minus: 0 }, labels: [], blocks: [{ n: 1, id: "b1", sentence: "waves", mark: "made", labels: [] }] }] });
  assert.match(first, /class="v1-plus">\+72</);
  assert.match(first, /disabled=""><svg[^]*?<\/svg>Undo<\/button>[^]*disabled=""><svg[^]*?<\/svg>Redo<\/button>/, "first version: the Undo / Redo card is there, both dulled");
  assert.doesNotMatch(first, /re-made|unchanged/, "first version: no marks");
  const older = render({ ...emptyV1PanelState(), snapshot: snap([v1, v2], 2), placedVersion: 2, lines: [
    { id: 8, kind: "result", version: 1, edited: false, lengthS: 3, summary: "", delta: { plus: 72, minus: 0 }, labels: [], blocks: [] },
    { id: 9, kind: "result", version: 2, edited: true, lengthS: 3, summary: "", delta: { plus: 10, minus: 4 }, labels: [], blocks: [] },
  ] });
  assert.equal(older.match(/data-v1-versions/g)?.length, 1, "only the latest version has the Undo / Redo card");
  assert.match(older, /class="v1-minus">−4</, "a real deletion is red");

  const pending = render({ ...emptyV1PanelState(), pendingPlace: 1 });
  assert.doesNotMatch(pending, /Put it on the canvas/, "never a 'Put it on the canvas' button");
  const made = render({ ...emptyV1PanelState(), busy: "finishing", stage: "Putting it on the canvas", progress: { pct: 100, etaS: 0, at: 0 } });
  assert.match(made, /data-text="Putting it on the canvas"/, "(Nov 17) made, not yet on the canvas: the real stage word");
  assert.doesNotMatch(made, /100%/, "(Nov 17) never 100% before it is on the canvas");
  const full = render({ ...emptyV1PanelState(), busy: "finishing", progress: { pct: 100, etaS: 0, at: 0, onCanvas: true } });
  assert.match(full, /class="v1-pct" aria-hidden="true">100%</, "the card shows the full bar once it is on the canvas");

  // (Nov 17, Part 2) thinking: the changing words line, his words as he writes them, and the folded grey line with its arrow
  const writing = render({ ...emptyV1PanelState(), busy: "thinking", activity: "Thinking", thinking: { since: 0, words: ["Noodling", "Almost done thinking"], say: "Here is the plan", phase: "finalizing" }, lines: [{ id: 1, kind: "user", text: "FIXTURE story" }] });
  assert.match(writing, /data-text="Finalizing answer"/, "(Nov 22) what he really does, in the Help Assistant's words - never made-up words");
  assert.doesNotMatch(writing, /Noodling/);
  assert.match(writing, /data-v1-live=""[^]*Here is the plan/, "his words show as he writes them");
  const folded = render({ ...emptyV1PanelState(), lines: [{ id: 1, kind: "work", summary: "Thought for 7 seconds, made the plan", steps: ["Thought for 7 seconds", "Made the plan"] }] });
  assert.match(folded, /<details class="v1-work" data-v1-work=""><summary>Thought for 7 seconds, made the plan<span class="v1-work-arrow" aria-hidden="true">›<\/span><\/summary>/, "ONE grey line with a small arrow, closed by default");
  assert.doesNotMatch(folded, /<details[^>]*open/, "closed by default");

  // phones + reduced motion: everything wraps, nothing has a fixed width, the bar does not animate for reduced motion
  assert.match(v1ThreadStyles, /@media \(prefers-reduced-motion: reduce\) \{ \.v1-bar-fill \{ transition: none; \} \.v1-bar-fill::after \{ animation: none; display: none; \} \}/);
  assert.doesNotMatch(v1ThreadStyles, /(?:^|[;{ ])(?:min-)?width:\s*\d{3,}px/, "no wide fixed widths");
});

// ---- Nov 2 (Arthur's bugs). LABELLED TEST FIXTURES ONLY ($0).
test("reload restore: the saved chat + the animation come back; the next edit goes to the SAME animation + layer", async () => {
  const r = rig();
  const made = snap([version(1, { status: "done", report: doneReport([{ sentence: "FIXTURE waves", made: "new" }]) })], 1);
  r.server.answer("restore", json({ animation: { ...made, layerId: "layer-7", layerCount: 4, fps: null }, lines: [
    { role: "user", text: "FIXTURE a stick figure waves", at: "t" }, { role: "assistant", text: "FIXTURE I'll make him wave.", at: "t" },
    { role: "assistant", kind: "result", version: 1, text: "Version 1 is on the canvas.", at: "t" },
  ] }));
  await r.controller.restore();
  const st = r.controller.current;
  assert.equal(st.animationId, "anim-FIXTURE");
  assert.equal(st.placedVersion, 1, "the canvas already holds it (saved with the project): not placed again");
  assert.deepEqual(st.lines.map((l) => l.kind), ["user", "ai", "result"]);
  assert.equal(r.placed.length, 0);
  // "make this stick figure tinier" after the reload: the turn carries the restored animation id + the restored chat
  const edited = snap([made.versions[0], version(2, { status: "done", edits: [{ op: "size", size: 0.7 }], report: doneReport([{ sentence: "FIXTURE waves", made: "same" }]) })], 2);
  r.server.answer("turn", json(turnAnswer("FIXTURE I'll make him smaller.", "edit", edited)));
  r.server.answer("pictures", json(withPictures(edited, 2)));
  r.server.answer("layer", json({ animation: edited }));
  let target: unknown = null;
  (r.controller as unknown as { deps: { place: (t: unknown) => unknown } }).deps.place = (t) => { target = t; return { layerId: "layer-7", count: 4 }; };
  await r.controller.send("make this stick figure tinier");
  const turn = r.server.calls.find((c) => c.kind === "turn")!.body!;
  assert.equal(turn.animationId, "anim-FIXTURE");
  assert.equal((turn.recentConversation as unknown[]).length, 2, "the restored lines are the conversation Luna sees");
  assert.deepEqual((target as { layer: unknown }).layer, { layerId: "layer-7", count: 4 }, "replaces THE layer it was on before the reload");
});

test("fps: the engine's 24 fps is never thrown away; the fps op re-places at the asked fps", async () => {
  assert.equal(v1PlacementFps(12, 24, null), 12, "a 12 fps project stays 12 (Nov 11, Arthur)");
  assert.equal(v1PlacementFps(30, 24, null), 30, "never lowered unasked");
  assert.equal(v1PlacementFps(24, 24, 12), 12, "the fps op wins");
  const r = rig();
  const made = snap([version(1, { status: "done", report: doneReport([{ sentence: "FIXTURE runs", made: "new" }]) })], 1);
  r.server.answer("restore", json({ animation: made, lines: [] }));
  await r.controller.restore();
  r.server.answer("turn", json({ turn: { intent: "edit", say: "FIXTURE I'll play it at 12." }, animation: { ...made, fps: 12 }, started: false }));
  r.server.answer("pictures", json(withPictures({ ...made, fps: 12 }, 1)));
  let target: { fps?: number | null } | null = null;
  (r.controller as unknown as { deps: { place: (t: unknown) => unknown } }).deps.place = (t) => { target = t as { fps?: number | null }; return true; };
  await r.controller.send("play it at 12 fps");
  assert.equal(target!.fps, 12);
  assert.equal(r.server.calls.filter((c) => c.kind === "turn").length, 1);
});

// Nov 2 polish (Arthur's asks 1, 2, 4, 5). TEST FIXTURES ONLY: hand-written labelled lines, $0.
test("view (Nov 2): paragraphs as <p>; a still pose says Drawing; the app's own blue on the bar; Undo / Redo dulled when unusable, solid blue on hover", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { V1AnimatorThread, v1ThreadStyles } = await import("./V1AnimatorThread.tsx");
  const render = (state: V1PanelState) => renderToStaticMarkup(React.createElement(V1AnimatorThread, { state, readOnly: false, onRevealed: () => {}, onUndo: () => {}, onRedo: () => {}, onCancel: () => {} }));
  const say = "FIXTURE I'll draw one stick figure standing still.\n\nFIXTURE You could make him **wave** next.";
  const html = render({ ...emptyV1PanelState(), lines: [{ id: 1, kind: "ai", text: say }] });
  assert.equal((html.match(/<p aria-hidden="true">/g) ?? []).length, 2, "two paragraphs");
  assert.doesNotMatch(html, /\*\*/, "no markdown junk");
  const still = { n: 1, still: true, status: "running", plan: { contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false, blocks: [] }, edits: null, stage: null, progress: null, report: null, message: null, createdAt: "", finishedAt: null } as unknown as V1Version;
  const snap = (v: V1Version): V1AnimationSnapshot => ({ animationId: "a", projectId: "p", versions: [v], current: 0 });
  const drawing = render({ ...emptyV1PanelState(), busy: "running", snapshot: snap(still), progress: { pct: 10, etaS: 20, at: 0 } });
  assert.match(drawing, /data-text="Drawing"/);
  const moving = render({ ...emptyV1PanelState(), busy: "running", snapshot: snap({ ...still, still: undefined }), progress: { pct: 10, etaS: 20, at: 0 } });
  assert.match(moving, /data-text="Animating"/);
  assert.equal(V1_PANEL_WORDS.drawing, "Drawing");
  // (Nov 22, D-0246) main's gray look: one blue on the bar, no glow; gray card buttons that turn solid gray on hover; blue only on Animate
  assert.match(v1ThreadStyles, /\.v1-bar-fill \{[^}]*background-image: linear-gradient\(90deg, var\(--da-accent, #0066ff\)/);
  assert.match(v1ThreadStyles, /\.v1-versions \.v1-actions button:hover:enabled \{[^}]*background: var\(--da-hover, #3a3a41\)/);
  assert.match(v1ThreadStyles, /\.v1-versions \.v1-actions button:disabled \{[^}]*opacity: \.42[^}]*background: transparent/);
  assert.match(v1ThreadStyles, /\.v1-versions \.v1-actions button\.v1-primary \{[^}]*background: var\(--da-accent, #0066ff\)/);
  assert.match(v1ThreadStyles, /\.v1-plus, \.v1-plus\.v1-zero \{ color: var\(--da-success/);
});

test("Nov 2: 'not in V1, not drawn: X' labels read friendly; a long 99% says 'Finishing up…' and the bar keeps creeping", () => {
  assert.equal(friendlyLabel("not in V1, not drawn: something appearing nearby (no objects in V1)"), "Something appearing nearby isn't drawn — you can draw it yourself on its own layer.");
  assert.equal(friendlyLabel("FIXTURE plain note"), "FIXTURE plain note");
  assert.equal(progressWords(99, 3, 2), "Almost done");
  assert.equal(progressWords(99, 3, 6), "Finishing up…");
  assert.equal(progressWords(100, null, 30), "Finishing up…");
  assert.equal(progressWords(80, 40, 30), "About 40 s left");
  assert.equal(gentleBarPct(50, 0), 47.5, "(Nov 17) scaled into 0-95");
  assert.ok(gentleBarPct(99, 10) > gentleBarPct(99, 2) && gentleBarPct(99, 1000) <= 95, "(Nov 17) never past 95 before the canvas");
  assert.equal(gentleBarPct(100, 0, true), 100, "100 = on the canvas");
  assert.equal(progressWords(5, 3, 0), "Taking a little longer than planned", "(Nov 17) never 'Almost done' at 5%");
  assert.equal(progressWords(95, 3, 0), "Almost done");
});

// (Nov 2 final round, owner) EFFORT: the SAME picker as the Help assistant; the level goes with each turn; remembered per project.
test("effort: the chosen level goes in the turn body; none sent = no field (today's body); remembered per project, blocked storage = Auto", async () => {
  for (const level of ["auto", "low", "medium", "high"] as const) {
    const { server, controller } = rig();
    server.answer("turn", json(turnAnswer("FIXTURE: Happy to help.", "conversation", null)));
    await controller.send("FIXTURE hello", level);
    assert.equal(server.calls[0].body?.effort, level, `${level} rides with the turn`);
  }
  const { server, controller } = rig();
  server.answer("turn", json(turnAnswer("FIXTURE: Happy to help.", "conversation", null)));
  await controller.send("FIXTURE hello");
  assert.equal("effort" in (server.calls[0].body ?? {}), false);
  const mem: Record<string, string> = {};
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  assert.equal(readV1Effort(storage, "proj-1"), "auto", "starts on Auto");
  saveV1Effort(storage, "proj-1", "high");
  assert.equal(readV1Effort(storage, "proj-1"), "high");
  assert.equal(readV1Effort(storage, "proj-2"), "auto", "per project");
  mem[v1EffortKey("proj-3")] = "max";
  assert.equal(readV1Effort(storage, "proj-3"), "auto", "a strange stored value = Auto");
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readV1Effort(blocked, "proj-1"), "auto");
  assert.doesNotThrow(() => saveV1Effort(blocked, "proj-1", "low"));
  assert.equal(readV1Effort(null, "proj-1"), "auto");
});

test("effort UI: the AI Animator chat renders the SAME ChatEffortPicker (same component, look, menu, labels) as the Help assistant", () => {
  const chat = readFileSync(resolvePath(ROOT, "src/components/workspace/ai/v1/V1AnimatorChat.tsx"), "utf8");
  const assistant = readFileSync(resolvePath(ROOT, "src/components/assistant/AssistantComposer.tsx"), "utf8");
  const parts = readFileSync(resolvePath(ROOT, "src/components/ui/ChatComposerParts.tsx"), "utf8");
  for (const source of [chat, assistant]) assert.match(source, /import \{[^}]*\bChatEffortPicker\b[^}]*\} from "[^"]*\/ui\/ChatComposerParts"/);
  assert.match(chat, /left=\{<ChatEffortPicker value=\{effort\} onChange=\{chooseEffort\} disabled=\{[^}]+\} \/>\}/, "in the composer's tools row, left, like the assistant");
  assert.match(chat, /send\(message, effort\)/);
  assert.doesNotMatch(chat, /effortButton|effortValue|EFFORT_STOPS/, "not restyled or copied: the shared component only");
  for (const label of ["Auto", "Low", "Medium", "High"]) assert.match(parts, new RegExp(`label: "${label}"`));
});

// ---- (Nov 3) The out-of-credits card. FIXTURE balances written by hand (no server, $0).
const FIXTURE_PLAN = (patch: Partial<import("../../../../lib/account/plans.ts").AccountPlanStatus>): import("../../../../lib/account/plans.ts").AccountPlanStatus => ({
  plan: "starter", label: "Starter", creditsTotal: 180, creditsUsed: 180, creditsLeft: 0, planCreditsLeft: 0, topUpCredits: 0, locked: false, lockReason: null,
  aiLocked: false, low: false, windowStart: Date.UTC(2026, 10, 1, 12), windowEnd: Date.UTC(2026, 11, 1, 12), trialEndsAt: null, trialDaysLeft: null,
  refillsAt: Date.UTC(2026, 11, 1, 12), interval: "month", billingStatus: "active", paymentProblem: false, waitingForPayment: false, cancelAtPeriodEnd: false, ...patch,
});

test("out-of-credits card: shows under one chat message's cost, hidden from it up / unknown / locked; both links /credits; paid vs trial words", async () => {
  const { v1OutOfCreditsView, V1OutOfCreditsCard } = await import("./V1OutOfCreditsCard.tsx");
  const paid0 = v1OutOfCreditsView(FIXTURE_PLAN({ creditsLeft: 0 }));
  assert.ok(paid0, "0 credits = the card");
  assert.equal(paid0.title, "You're out of credits");
  assert.equal(paid0.line, "0 credits left · refills on December 1");
  assert.equal(paid0.next, null);
  assert.deepEqual(paid0.links, [{ label: "See my usage", href: "/credits" }, { label: "Buy a pack", href: "/credits" }]);
  assert.equal(v1OutOfCreditsView(FIXTURE_PLAN({ creditsLeft: 1 }))?.line, "1 credit left · refills on December 1", "the real number left (1 < one chat message)");
  const { AI_ACTION_CREDITS } = await import("../../../../lib/account/plans.ts");   // (Nov 11 prices) the card hides from one chat message up
  for (const left of [AI_ACTION_CREDITS.chat, AI_ACTION_CREDITS.chat + 1, 180]) assert.equal(v1OutOfCreditsView(FIXTURE_PLAN({ creditsLeft: left })), null, `${left} credits = no card (it hides after a refill)`);
  assert.equal(v1OutOfCreditsView(null), null, "balance not read yet = no card");
  assert.equal(v1OutOfCreditsView(FIXTURE_PLAN({ locked: true, lockReason: "plan_ended" })), null, "a locked account has its own message");
  assert.equal(v1OutOfCreditsView(FIXTURE_PLAN({ aiLocked: true, paymentProblem: true })), null);
  const trial = v1OutOfCreditsView(FIXTURE_PLAN({ plan: "trial", label: "Free trial", creditsLeft: 1, refillsAt: null, interval: null, trialEndsAt: Date.UTC(2026, 10, 10, 12), trialDaysLeft: 7 }));
  assert.ok(trial);
  assert.equal(trial.line, "1 credit left · free trial ends on November 10");
  assert.equal(trial.next, "Choose a plan to keep animating.");
  assert.doesNotMatch(trial.line, /refills/, "a trial never refills");

  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(React.createElement(V1OutOfCreditsCard, { view: paid0 }));
  assert.match(html, /class="v1-card v1-out"/, "the app's card look");
  assert.equal((html.match(/<a [^>]*href="\/credits"/g) ?? []).length, 2, "two links, both to the AI Dashboard");
  assert.match(html, />See my usage<\/a>/);
  assert.match(html, />Buy a pack<\/a>/);
  assert.doesNotMatch(html, /<button/, "no close button: it stays while out of credits");
  const chat = readFileSync(resolvePath(ROOT, "src/components/workspace/ai/v1/V1AnimatorChat.tsx"), "utf8");
  assert.match(chat, /useAccountPlan\(\)/, "the panel reads the live balance");
  assert.match(chat, /composer=\{<>\s*\{outOfCredits && <V1OutOfCreditsCard view=\{outOfCredits\} \/>\}\s*<form/, "just above the message box (inside the box's slot, so it is never hidden)");
});

test("out-of-credits: a 402 refusal asks the page to read the balance again at once (the account-plan event)", async () => {
  const { announceAccountPlanChanged } = await import("./V1OutOfCreditsCard.tsx");
  const { ACCOUNT_PLAN_CHANGED_EVENT } = await import("../../../account/useAccountPlan.ts");
  const page = new EventTarget();
  const heard: string[] = [];
  page.addEventListener(ACCOUNT_PLAN_CHANGED_EVENT, (event) => heard.push(event.type));
  const server = fakeServer();
  const controller = new V1AnimatorController({ projectId: "proj-1", fetch: server.fetch, onChange: () => {}, place: () => true, setTimer: () => 0, clearTimer: () => {}, wait: async () => {}, onCreditsRefused: () => announceAccountPlanChanged(page) });
  server.answer("turn", json({ error: "This costs 15 credits and you have 0 credits left. Your credits refill on December 1, or buy an extra pack. Nothing was changed." }, 402));
  await controller.send("FIXTURE wave");
  assert.deepEqual(heard, ["diamond-account-plan-changed"], "one refresh, right after the refusal");
  assert.match(controller.current.lines.at(-1)?.kind === "ai" ? (controller.current.lines.at(-1) as { text: string }).text : "", /costs 15 credits/, "the honest refusal line still shows");
  server.answer("turn", json({ error: "FIXTURE busy" }, 500));
  await controller.send("FIXTURE wave again");
  assert.equal(heard.length, 1, "other failures do not touch the balance");
});

// (Nov 20, Fable: since Nov 19 the next part starts only after the AI has written it, so the panel found nothing running and stopped
// watching - his story looked cut off half way until he typed) the panel keeps watching while parts are still to come
test("(Nov 20) a story in parts: after part 1 the panel keeps watching while the next part is written, then follows and places part 2 by itself; Stop in between ends it plainly", async () => {
  const { server, controller, placed, tick } = rig();
  server.answer("turn", json(turnAnswer("FIXTURE: a long story.", "create", snap([version(1, {})], 0))));
  await controller.send("FIXTURE a long story");
  const part1 = { ...snap([version(1, { status: "done", report: doneReport([{ sentence: "part one", made: "new", frames: 60 }]) })], 1), storyPartsLeft: 1 };
  server.answer("get", json(noPictures(part1)));
  server.answer("pictures", json(withPictures(part1, 1)));
  await tick();
  assert.deepEqual(placed, [1], "part 1 is on the canvas");
  assert.equal(controller.current.busy, "running", "the panel is still busy: the story is not all there");
  assert.equal(controller.current.stage, V1_PANEL_WORDS.nextPart);
  server.answer("get", json(noPictures(part1)));   // the AI is still writing part 2: nothing runs yet
  await tick();
  assert.equal(controller.current.busy, "running", "still watching");
  const running2 = { ...snap([version(1, { status: "done", report: doneReport([{ sentence: "part one", made: "new", frames: 60 }]) }), version(2, {})], 1) };
  server.answer("get", json(noPictures(running2)));
  await tick();
  const made2 = snap([version(1, { status: "done", report: doneReport([{ sentence: "part one", made: "new", frames: 60 }]) }), version(2, { status: "done", report: doneReport([{ sentence: "part one", made: "same", frames: 60 }, { sentence: "part two", made: "new", frames: 50 }], [], { edited: 0, added: 50, deleted: 0 }) })], 2);
  server.answer("get", json(noPictures(made2)));
  server.answer("pictures", json(withPictures(made2, 2)));
  await tick();
  assert.deepEqual(placed, [1, 2], "part 2 came onto the canvas by itself");
  assert.equal(controller.current.busy, null, "the story is all there: his box is free");

  // Stop between two parts
  const s2 = rig();
  s2.server.answer("turn", json(turnAnswer("FIXTURE: a long story.", "create", snap([version(1, {})], 0))));
  await s2.controller.send("FIXTURE a long story");
  s2.server.answer("get", json(noPictures(part1)));
  s2.server.answer("pictures", json(withPictures(part1, 1)));
  await s2.tick();
  s2.server.answer("cancel", json(snap(part1.versions, 1)));
  await s2.controller.cancel();
  assert.equal(s2.controller.current.busy, null);
  assert.match(String((s2.controller.current.lines.at(-1) as { text?: string }).text), /^Stopped\. The rest of your story was not made/);
});

test("(Nov 20, Fable) a restart while part 2 is being made: the panel says so, waits, and places the part the server makes again", async () => {
  const { server, controller, placed, tick } = rig();
  const p1 = version(1, { status: "done", report: doneReport([{ sentence: "part one", made: "new", frames: 60 }]) });
  server.answer("turn", json(turnAnswer("FIXTURE: a long story.", "create", snap([version(1, {})], 0))));
  await controller.send("FIXTURE a long story");
  const part1 = { ...snap([p1], 1), storyPartsLeft: 1 };
  server.answer("get", json(noPictures(part1)));
  server.answer("pictures", json(withPictures(part1, 1)));
  await tick();
  server.answer("get", json(noPictures({ ...snap([p1, version(2, {})], 1), storyPartsLeft: 1 })));
  await tick();
  for (let i = 0; i < 10; i++) { server.answer("get", new Response("down", { status: 502 })); await tick(); }   // the server restarts (~15 s)
  assert.equal(controller.current.busy, "running", "a story waits longer than 9 s for its server");
  server.answer("get", json(noPictures({ ...snap([p1, version(2, { status: "failed", message: "FIXTURE interrupted" })], 1), storyPartsLeft: 1 })));
  await tick();
  assert.match(String((controller.current.lines.at(-1) as { text?: string }).text), /it is being made again now/);
  assert.equal(controller.current.busy, "running", "and it waits for the part made again");
  const made3 = snap([p1, version(2, { status: "failed", message: "FIXTURE interrupted" }), version(3, { status: "done", report: doneReport([{ sentence: "part two", made: "new", frames: 50 }], [], { edited: 0, added: 50, deleted: 0 }) })], 3);
  server.answer("get", json(noPictures(made3)));
  server.answer("pictures", json(withPictures(made3, 3)));
  await tick();
  assert.deepEqual(placed, [1, 3], "the rest of the story came onto the canvas by itself");
  assert.equal(controller.current.busy, null);
});

test("(Nov 21, Arthur: edited parts look laggy) one even rate on screen: a mix of half-rate and full-rate parts shows the full-rate ones on twos; one kind = unchanged", async () => {
  const { v1EvenRateIndices } = await import("./v1CanvasPlacer.ts");
  const ones = Array.from({ length: 48 }, () => false);
  const twos = Array.from({ length: 48 }, (_, i) => i % 2 === 1);
  const mixed = [...ones, ...twos];
  const shown = v1EvenRateIndices(mixed);
  assert.equal(shown.length, 96, "the count stays: the timing never changes");
  assert.ok(shown.slice(0, 40).every((v, i) => v === i || v === i - 1), "a full-rate picture shows itself or the one before");
  assert.ok(shown.slice(2, 36).filter((v, i) => v !== i + 2).length >= 15, "the full-rate stretch is shown on twos");
  assert.deepEqual(shown.slice(56), Array.from({ length: 40 }, (_, i) => i + 56), "the half-rate part is shown as it is");
  assert.deepEqual(v1EvenRateIndices(ones.concat(ones)), Array.from({ length: 96 }, (_, i) => i), "all full rate: nothing changes");
  assert.deepEqual(v1EvenRateIndices(twos.concat(twos)), Array.from({ length: 96 }, (_, i) => i), "all half rate: nothing changes");
  const still = Array.from({ length: 96 }, () => true);
  assert.deepEqual(v1EvenRateIndices(still), Array.from({ length: 96 }, (_, i) => i), "a held pose: nothing changes");
});
