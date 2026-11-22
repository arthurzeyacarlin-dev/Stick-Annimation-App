import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createV1Animator, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import type { V1Plan } from "./v1AnimatorContract.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { normalizeV1LunaTurn, readEngineWords, readLunaBook, serverWord } from "./v1LunaBook.ts";
import {
  dropNulls, newBlocks, nodeDirectorTool, planWithLuna, readDirectorBook, strictSchema, v1Director,
  type DirectorAsk, type DirectorQuestion, type DirectorTool,
} from "./v1LunaDirector.ts";
import { createV1LunaDirectorAsk } from "../../openai/generateV1LunaDirector.ts";
import type { getOpenAiClient } from "../../openai/client.ts";
import { AI_ANIMATOR_MODEL } from "../aiAnimatorContract.ts";
import { REAL_LUNA_BOOK, fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

// TEST FIXTURES ONLY: the labelled hand-made director answers (__fixtures__/v1-director-answers.fixture.json) stand in for Luna;
// the REAL luna-director.mjs builds the question + checks the answers (it reads the books only: no AI call, $0).
const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "__fixtures__", "v1-director-answers.fixture.json"), "utf8")) as Record<string, unknown>;
const SENTENCE = FX.sentence as string;
const REAL_ROOT = join(here, "..", "..", "..", "..", "..");
const book = readLunaBook(REAL_LUNA_BOOK), dbook = readDirectorBook(REAL_LUNA_BOOK);
const realTool = nodeDirectorTool(REAL_ROOT, dbook);
const plan = (...sentences: string[]): V1Plan => ({ contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false, blocks: sentences.map((s, i) => ({ id: `b${i + 1}`, sentence: s, seed_bump: 0 })) });
const fakeAsk = (...answers: (string | { fail: string })[]) => {
  const asked: DirectorQuestion[] = [];
  const ask: DirectorAsk = async (q) => {
    asked.push(q);
    const a = answers[Math.min(asked.length - 1, answers.length - 1)];
    return typeof a === "string" ? { ok: true, answer: structuredClone(FX[a]), costUsd: 0.003 } : { ok: false, detail: a.fail };
  };
  return { ask, asked };
};
const run = (over: Partial<Parameters<typeof planWithLuna>[0]> & { ask: DirectorAsk }) => {
  const tmp = mkdtempSync(join(tmpdir(), "v1-director-test-"));
  return planWithLuna({ plan: plan(SENTENCE), prevDir: null, outDir: join(tmp, "v1", "director"), cacheDir: join(tmp, "cache"), allowNew: true, book, director: dbook, tool: realTool, ...over });
};

test("switch: default claude (book director.default, Arthur Nov 2: Sonnet only); env can still pick luna", () => {
  assert.equal(dbook.default, "claude");
  assert.equal(v1Director(dbook, {}), "claude");
  assert.equal(v1Director(dbook, { DIAMOND_V1_DIRECTOR: "claude" }), "claude");
  assert.equal(v1Director(dbook, { DIAMOND_V1_DIRECTOR: " LUNA " }), "luna");
  assert.equal(v1Director(dbook, { DIAMOND_V1_DIRECTOR: "something" }), "claude", "an unknown value = the book default");
  assert.deepEqual(dbook.scriptFlags, ["--engine-director"]);
  // (Nov 4 PM12, root cause 1) the planner's settings come from the book (the clean environment drops the server's): lessons OFF = the passes' question
  assert.deepEqual(dbook.scriptEnv, { DIRECTOR_V1_LESSONS: "0" });
});

test("the real question is OpenAI-strict after strictSchema (every property required, optional ones nullable, no minItems)", async () => {
  const q = await realTool.question(SENTENCE);
  assert.match(q.user, /said_as/);
  assert.match(q.system, /one JSON object/);
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    assert.equal("minItems" in o, false);
    if (o.properties) {
      assert.deepEqual([...(o.required as string[])].sort(), Object.keys(o.properties as object).sort());
      assert.equal(o.additionalProperties, false);
      Object.values(o.properties as object).forEach(walk);
    }
    for (const [k, v] of Object.entries(o)) if (k !== "properties") walk(v);
  };
  const s = strictSchema(q.schema) as { properties: Record<string, { type: unknown }> };
  walk(s);
  assert.deepEqual(s.properties.label.type, ["string", "null"], "an optional field becomes nullable");
  assert.deepEqual(dropNulls({ a: null, b: [{ c: null, d: 1 }] }), { b: [{ d: 1 }] });
});

test("question -> Luna answer -> check -> director.json the engine reads; the same sentence again = the saved plan ($0)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "v1-director-cache-"));
  const one = fakeAsk("sprint_ok");
  const out = await planWithLuna({ plan: plan(SENTENCE), prevDir: null, outDir: join(tmp, "v1", "director"), cacheDir: join(tmp, "cache"), allowNew: true, book, director: dbook, tool: realTool, ask: one.ask });
  assert.ok(out.ok, JSON.stringify(out));
  if (!out.ok) return;
  assert.equal(one.asked.length, 1);
  assert.deepEqual(out.planned.map((p) => [p.from, p.asks]), [["luna", 1]]);
  const files = readdirSync(out.dir).filter((f) => f.endsWith(".director.json"));
  assert.equal(files.length, 1);
  const dj = JSON.parse(readFileSync(join(out.dir, files[0]), "utf8"));
  assert.equal(dj.sentence, SENTENCE, "passed_engine.py --director-dir finds it by its sentence");
  assert.equal(dj.via, "luna");
  assert.equal(dj.check.ok, true);
  assert.equal("label" in dj.plan, false, "Luna's strict-mode nulls are removed");
  assert.equal(dj.plan.beats[0].id, "sprint");
  const again = fakeAsk({ fail: "must not be asked" });
  const second = await planWithLuna({ plan: plan(SENTENCE), prevDir: null, outDir: join(tmp, "v2", "director"), cacheDir: join(tmp, "cache"), allowNew: true, book, director: dbook, tool: realTool, ask: again.ask });
  assert.ok(second.ok);
  assert.equal(again.asked.length, 0, "identical sentence -> the saved Luna plan, no AI call");
  if (second.ok) assert.equal(second.planned[0].from, "cache");
});

test("retry ONCE with the checker's errors; twice wrong = honest words, nothing written", async () => {
  const fixed = fakeAsk("bad_no_beats", "sprint_ok");
  const ok = await run({ ask: fixed.ask });
  assert.ok(ok.ok);
  assert.equal(fixed.asked.length, 2);
  assert.match(fixed.asked[1].user, /The checker found these problems/);
  assert.match(fixed.asked[1].user, /beats/);
  const bad = fakeAsk("bad_no_beats", "bad_no_beats", "sprint_ok");
  const no = await run({ ask: bad.ask });
  assert.equal(bad.asked.length, 2, "never a third ask");
  assert.equal(no.ok, false);
  if (!no.ok) assert.ok(no.words.startsWith(serverWord(book, "director_failed", { words: "" }).trim()), no.words);
  const down = await run({ ask: fakeAsk({ fail: "network" }).ask });
  assert.deepEqual(down, { ok: false, words: serverWord(book, "director_unreachable") });
});

test("only NEW blocks are planned; cache-only never asks Luna (the engine's own cache answers)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "v1-director-prev-"));
  mkdirSync(join(tmp, "blocks", "b1"), { recursive: true });
  writeFileSync(join(tmp, "blocks", "b1", "block.json"), "{}");
  writeFileSync(join(tmp, "report.json"), JSON.stringify({ blocks: [{ id: "b1", sentence: "A stick figure bows.", seedBump: 0 }] }));
  assert.deepEqual(newBlocks(plan("A stick figure bows.", SENTENCE), tmp).map((b) => b.sentence), [SENTENCE]);
  assert.deepEqual(newBlocks({ ...plan("A stick figure bows."), blocks: [{ id: "b1", sentence: "A stick figure bows.", seed_bump: 1 }] }, tmp).length, 1, "a redo (new seed_bump) is new");
  const none = fakeAsk({ fail: "must not be asked" });
  const out = await run({ allowNew: false, ask: none.ask });
  assert.ok(out.ok);
  assert.equal(none.asked.length, 0);
  if (out.ok) assert.deepEqual(out.planned.map((p) => p.from), ["engine_cache"]);
});

test("the OpenAI ask: same model, strict json_schema, book tokens, usage recorded", async () => {
  const sent: Record<string, unknown>[] = [], events: { stage: string }[] = [];
  const client = (() => ({ responses: { create: async (body: Record<string, unknown>) => { sent.push(body); return { id: "r1", model: AI_ANIMATOR_MODEL, output_text: JSON.stringify(FX.sprint_ok), usage: { input_tokens: 8000, output_tokens: 1000, total_tokens: 9000 } }; } } })) as unknown as typeof getOpenAiClient;
  const ask = createV1LunaDirectorAsk(client, (e) => { events.push(e as never); return true; })({ jobId: "j", turnId: "t", projectId: "p", sentence: SENTENCE }, dbook);
  const out = await ask({ system: "S", user: "U", schema: { type: "object" } });
  assert.ok(out.ok);
  if (out.ok) assert.ok(Math.abs((out.costUsd ?? 0) - 0.0028) < 1e-9, "8000 in x $0.2/M + 1000 out x $1.2/M");
  assert.equal(sent[0].model, AI_ANIMATOR_MODEL);
  assert.equal(sent[0].max_output_tokens, dbook.maxOutputTokens);
  assert.equal((sent[0].text as { format: { strict: boolean } }).format.strict, true);
  assert.deepEqual(events.map((e) => e.stage), ["dispatched", "provider_observed"]);
});

test("core: the director step runs before the engine (--director-dir); its failure = honest words, nothing spawned", async () => {
  for (const fails of [false, true]) {
    const { env } = makeTestRoot();
    const config = v1EngineConfig(env)!;
    const { spawn, calls } = fakeSpawner((c) => playEngineOk(c.args));
    const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) });
    const b = books();
    const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, b.words, b.book), "create_jacks_flip");
    const seen: string[] = [];
    const animator = createV1Animator({
      config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner,
      director: async (input) => { seen.push(input.plan.blocks[0].sentence); return fails ? { ok: false, words: serverWord(b.book, "director_unreachable") } : { ok: true, dir: join(input.versionDir, "director") }; },
    });
    const r = await animator.turn({ ownerId: "o", projectId: "p", animationId: null, message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [] });
    assert.ok(r.ok && r.animation);
    if (!r.ok || !r.animation) continue;
    const id = r.animation.animationId;
    const version = () => animator.get("o", "p", id)?.versions[0];
    await until(() => version()?.status !== "running");
    assert.equal(seen.length, 1);
    if (fails) {
      assert.equal(calls.length, 0, "nothing spawned");
      assert.equal(version()?.status, "failed");
      assert.equal(version()?.message, serverWord(b.book, "director_unreachable"));
    } else {
      assert.equal(version()?.status, "done");
      const args = calls[0].args;
      assert.ok(args.includes("--director-dir"));
      assert.match(args[args.indexOf("--director-dir") + 1], /v1\/director$/);
    }
  }
});

// (Nov 4 PM12) a SOFT check problem (two moves in one beat) is re-asked once, then the last answer is USED: never a "couldn't plan" dead end;
// a real (hard) problem still fails after the re-ask, as before
test("soft problem: re-asked once, then the plan is used; a hard problem still fails", async () => {
  const softTool: DirectorTool = { question: realTool.question, check: async () => ({ ok: false, soft: true, errors: ["Beat run holds more than one body move"] }) };
  const soft = fakeAsk("sprint_ok");
  const a = await run({ ask: soft.ask, tool: softTool });
  assert.ok(a.ok, JSON.stringify(a));
  assert.equal(soft.asked.length, dbook.retries + 1, "re-asked with the reason before using the last answer");
  const hardTool: DirectorTool = { question: realTool.question, check: async () => ({ ok: false, errors: ["figures: two figures"] }) };
  const hard = fakeAsk("sprint_ok");
  const b = await run({ ask: hard.ask, tool: hardTool });
  assert.equal(b.ok, false);
});

// (Nov 4 PM12, NO TELEPHONE) the chat AI's Kimodo steps reach the engine EXACTLY as written: no planner call, one figure, words + seconds unchanged
test("no telephone: the AI's steps become the engine plan word for word, with no AI call", async () => {
  const steps = [
    { text: "A person runs forward.", seconds: 2.5, travels: true },
    { text: "A person hops once while running forward.", seconds: 1.2, travels: true },
    { text: "A person keeps running forward.", seconds: 2, travels: true },
    { text: "A person does a backflip.", seconds: 2.4, travels: false },
  ];
  const tmp = mkdtempSync(join(tmpdir(), "v1-steps-"));
  const never = fakeAsk({ fail: "the planner must not be asked" });
  const p: V1Plan = { ...plan(), blocks: [{ id: "b1", sentence: steps.map((s) => s.text).join(" "), seed_bump: 0, steps }] };
  const out = await planWithLuna({ plan: p, prevDir: null, outDir: join(tmp, "d"), cacheDir: join(tmp, "c"), allowNew: true, book, director: dbook, tool: realTool, ask: never.ask });
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(never.asked.length, 0, "no planner question");
  const saved = JSON.parse(readFileSync(join(out.ok ? out.dir : "", readdirSync(out.ok ? out.dir : "")[0]), "utf8"));
  assert.equal(saved.plan.figures.length, 1);
  assert.deepEqual(saved.plan.beats.map((b: { move: string; free_s: number; exact: boolean }) => [b.move, b.free_s, b.exact]), steps.map((s) => [s.text, s.seconds, true]));
});
