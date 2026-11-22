import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { acceptV1Canvas, lunaInstructions, lunaTurnContent, lunaTurnInput, normalizeV1LunaTurn, readEngineWords, readLunaBook, readSonnetBrain, v1CanvasLimits } from "./v1LunaBook.ts";
import { createV1Animator, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { fakeLuna, fakeSpawner, makeTestRoot, REAL_LUNA_BOOK, REAL_ENGINE_BOOK } from "./__fixtures__/v1TestRoot.ts";
import { createV1SonnetTurnGenerator, V1_SONNET_TOOL, type FetchLike, type LedgerIO } from "../../anthropic/generateV1SonnetTurn.ts";
import { V1AnimatorController } from "../../../components/workspace/ai/v1/v1AnimatorController.ts";
import { v1HasInk, v1PageBoxInBitmap, v1PictureSize, v1UserLayers } from "../../../components/workspace/ai/v1/v1CanvasPicture.ts";
import type { V1CanvasPicture } from "./v1AnimatorContract.ts";

// (Nov 2 final round) THE AI SEES THE CANVAS. TEST FIXTURES ONLY: the "pictures" below are tiny hand-made base64 strings labelled
// FIXTURE (not real drawings), a fake fetch / fake Luna answer every call. Nothing here calls an AI ($0).
const book = readLunaBook(REAL_LUNA_BOOK);
const words = readEngineWords(REAL_ENGINE_BOOK);
const FIXTURE_PIC: V1CanvasPicture = { mediaType: "image/jpeg", data: Buffer.from("FIXTURE canvas picture").toString("base64").replace(/=+$/, "").padEnd(32, "A"), width: 768, height: 432 };

test("book: the canvas section is read (limits + rules), and its rules are in the AI's instructions", () => {
  assert.ok(book.canvas, "luna-book.json has a canvas section");
  const { ground, ...limits } = v1CanvasLimits(book)!; // (Nov 2 final round) + the book's ground-line ruler (v1PageFit.test.ts)
  assert.deepEqual(limits, { maxPx: 768, mediaType: "image/jpeg", quality: 0.72, maxBytes: 350000, sheetFrames: 6 }); // (Nov 2 night) + the contact sheet's frames
  assert.equal(ground?.minLenFigureWidths, 1.5);
  const sys = lunaInstructions(book, words);
  assert.match(sys, /CANVAS \(what the user drew\):/);
  for (const rule of book.canvas!.rules) assert.ok(sys.includes(rule), "every canvas rule reaches the AI");
  assert.match(sys, /ONE stick figure/i);
  assert.match(sys, /lines his step-overs and jumps up with their drawn things/i); // (Nov 2 night) moments lined up with the drawing
  assert.equal(v1CanvasLimits({ canvas: null }), null, "no canvas section = off");
});

test("server guard: only a picture inside the book's limits is used; anything else is dropped (never an error)", () => {
  assert.deepEqual(acceptV1Canvas(book, FIXTURE_PIC), FIXTURE_PIC);
  assert.equal(acceptV1Canvas(book, null), null);
  assert.equal(acceptV1Canvas(book, { ...FIXTURE_PIC, mediaType: "image/gif" }), null, "another type");
  assert.equal(acceptV1Canvas(book, { ...FIXTURE_PIC, mediaType: "image/png" }), null, "not the book's type");
  assert.equal(acceptV1Canvas(book, { ...FIXTURE_PIC, width: 769 }), null, "a side over max_px");
  assert.equal(acceptV1Canvas(book, { ...FIXTURE_PIC, height: 0 }), null);
  assert.equal(acceptV1Canvas(book, { ...FIXTURE_PIC, data: "A".repeat(4 * 120000) }), null, "over max_bytes");
  assert.equal(acceptV1Canvas(book, { ...FIXTURE_PIC, data: "data:image/jpeg;base64,AAAA" }), null, "not plain base64");
  assert.equal(acceptV1Canvas({ canvas: null }, FIXTURE_PIC), null, "the book's section removed = never used");
});

test("turn content: with a picture = ONE image block first + the turn text with the book's note; without = the same text as before", () => {
  const input = { message: "animate this", recentConversation: [], current: null, checkerSaid: null };
  const plain = lunaTurnContent(book, input);
  assert.equal(plain, lunaTurnInput(book, input));
  assert.ok(!("canvas" in JSON.parse(plain as string)));
  const withPic = lunaTurnContent(book, { ...input, canvas: FIXTURE_PIC });
  assert.ok(Array.isArray(withPic));
  assert.deepEqual(withPic[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: FIXTURE_PIC.data } });
  assert.equal(withPic[1].type, "text");
  assert.equal(JSON.parse((withPic[1] as { text: string }).text).canvas, book.canvas!.note);
});

test("Sonnet call: the picture goes in the user message as a base64 image block; no picture = plain text, no image", async () => {
  const { root, lx } = makeTestRoot();
  const books = { book, words, brain: readSonnetBrain(join(lx, "v1k", "luna-book.json"), root, {}) };
  const sent: { messages: { content: unknown }[] }[] = [];
  const answer = { intent: "create", say: "FIXTURE: I can see your three figures and the path. I'll animate one figure doing the moves.", blocks: [{ sentence: "A stick figure runs, vaults and jumps." }], colour: null, ops: null };
  const fetch: FetchLike = async (_u, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: "msg_fixture", model: "claude-sonnet-5-5", content: [{ type: "tool_use", name: V1_SONNET_TOOL, input: answer }], usage: { input_tokens: 900, output_tokens: 100 } }) }; };
  const ledger: LedgerIO = { read: () => ({ total: 0, calls: [] }), write: () => {} };
  const gen = createV1SonnetTurnGenerator({ fetch, ledger, env: { ANTHROPIC_API_KEY: "test-not-a-key", CLAUDE_TEST_BUDGET_USD: "40" } });
  const req = { jobId: "j", turnId: "t", projectId: "p", message: "animate this", recentConversation: [], current: null, checkerSaid: null };
  assert.equal((await gen({ ...req, canvas: FIXTURE_PIC }, books)).ok, true);
  assert.equal((await gen(req, books)).ok, true);
  const first = sent[0].messages[0].content as { type: string; source?: { type: string; media_type: string; data: string } }[];
  assert.equal(first[0].type, "image");
  assert.deepEqual(first[0].source, { type: "base64", media_type: "image/jpeg", data: FIXTURE_PIC.data });
  assert.equal(typeof sent[1].messages[0].content, "string", "no picture = no image block (no extra cost)");
});

test("runner: a picture inside the limits reaches the AI call; one outside them is dropped and the turn still answers", async () => {
  const { env } = makeTestRoot();
  const config = v1EngineConfig(env)!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) });
  const { luna, inputs } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "conversation", "conversation");
  const { spawn } = fakeSpawner(() => ({ code: 0 }));
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const me = { ownerId: "o", projectId: "p", animationId: null, message: "what do you think of my drawing?", recentConversation: [] };
  assert.equal((await animator.turn({ ...me, canvas: FIXTURE_PIC })).ok, true);
  assert.deepEqual(inputs[0].canvas, FIXTURE_PIC);
  assert.equal((await animator.turn({ ...me, canvas: { ...FIXTURE_PIC, width: 5000 } })).ok, true);
  assert.equal(inputs[1].canvas, undefined, "too big = not sent");
  assert.deepEqual(animator.canvasLimits(), v1CanvasLimits(book), "the panel gets the book's limits");
});

test("panel: the picture is sent with a chat turn only when the book allows it AND the user has drawn something", async () => {
  const bodies: Record<string, unknown>[] = [];
  let canvasAnswer: unknown = v1CanvasLimits(book);
  const fetch = async (url: string, init?: RequestInit) => {
    if (!init?.body) return new Response(JSON.stringify({ animation: null, lines: [], canvas: canvasAnswer }), { status: 200 });
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ turn: { intent: "conversation", say: "FIXTURE reply" }, animation: null, started: false }), { status: 200 });
  };
  let drawn: V1CanvasPicture | null = FIXTURE_PIC;
  const asked: unknown[] = [];
  const make = () => new V1AnimatorController({ projectId: "p", fetch, place: () => true, onChange: () => {}, setTimer: () => 0, clearTimer: () => {}, wait: async () => {},
    picture: (limits, aiLayerId) => { asked.push({ limits, aiLayerId }); return drawn; } });
  const c = make();
  await c.restore();
  await c.send("animate this");
  assert.deepEqual(bodies[0].canvas, FIXTURE_PIC, "user drawing -> one picture with the turn");
  assert.deepEqual(asked[0], { limits: v1CanvasLimits(book), aiLayerId: null });
  drawn = null;
  await c.send("hi");
  assert.ok(!("canvas" in bodies[1]), "nothing drawn -> nothing sent");
  canvasAnswer = null; drawn = FIXTURE_PIC;
  const off = make();
  await off.restore();
  await off.send("animate this");
  assert.ok(!("canvas" in bodies[2]), "book section off -> never sent");
  assert.equal(asked.length, 2, "the canvas is not even read when it is off");
});

test("picture helpers: page fitted to max_px, AI layers left out, ink found only on the page", () => {
  assert.deepEqual(v1PictureSize(768), { width: 768, height: 432 });
  assert.deepEqual(v1PictureSize(4000), { width: 1920, height: 1080 }, "never bigger than the page");
  const layers = [{ id: "layer-1", name: "Layer 1" }, { id: "ai-7", name: "anything" }, { id: "layer-3", name: "AI: Stick figure" }];
  assert.deepEqual(v1UserLayers(layers, { layerIds: ["ai-7"], layerNames: ["AI: Stick figure"] }).map((l) => l.id), ["layer-1"]);
  const bmp = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
  assert.equal(v1HasInk(bmp, [0, 0, 10, 10]), false, "empty = no picture");
  bmp.data[(2 * 10 + 8) * 4 + 3] = 255; // one painted pixel at (8, 2)
  assert.equal(v1HasInk(bmp, [0, 0, 10, 10]), true);
  assert.equal(v1HasInk(bmp, [0, 0, 5, 10]), false, "ink off the page does not count");
  assert.deepEqual(v1PageBoxInBitmap({ scale: 0.5, offsetX: 10, offsetY: 20 }, { width: 1000, height: 600 }, { width: 1000, height: 600 }), [10, 20, 970, 560]);
});
