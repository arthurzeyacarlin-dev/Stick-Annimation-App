import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createV1Animator, type Spawner, type V1EngineRunEnd, type V1LunaCall, type V1UsageHooks } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";
import { claudeSpendBetween, createV1UsageMeter, v1EngineRunEvents, v1RunCharge } from "./v1UsageMeter.ts";
import type { V1Report } from "./v1AnimatorContract.ts";

// TEST FIXTURES ONLY ($0): fake Luna answers, a fake engine, a fixture Claude ledger. No AI, no Kimodo.
const ME = { ownerId: "owner-usage-1", projectId: "project-usage-1" };

function core(usage: V1UsageHooks, ...answers: Parameters<typeof fakeLuna>[1][]) {
  const { env } = makeTestRoot();
  const config = v1EngineConfig(env)!;
  const { spawn } = fakeSpawner((call) => playEngineOk(call.args));
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) });
  const { book, words } = books();
  const { luna, inputs } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), ...answers);
  return { animator: createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: spawn as Spawner, usage }), inputs };
}

test("core: one answered turn = one turnAnswered; one engine run = one engineRun (done + report); no credits = 402 and no AI call", async () => {
  const answered: string[] = [], runs: V1EngineRunEnd[] = [];
  const t = core({ creditsShort: () => null, turnAnswered: (i) => { answered.push(i.ownerId); }, engineRun: (r) => { runs.push(r); } }, "create_jacks_flip");
  const out = await t.animator.turn({ ...ME, animationId: null, message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [] });
  assert.ok(out.ok && out.started && out.animation);
  await until(() => runs.length === 1);
  assert.deepEqual(answered, [ME.ownerId]);
  assert.equal(runs[0].status, "done");
  assert.equal(runs[0].kind, "create");
  assert.equal(runs[0].ownerId, ME.ownerId);
  assert.ok(runs[0].report && runs[0].finishedAtMs >= runs[0].startedAtMs);

  const broke = core({ creditsShort: () => "This needs 2 credits and you have 0." }, "create_jacks_flip");
  const no = await broke.animator.turn({ ...ME, animationId: null, message: "a jump", recentConversation: [] });
  assert.deepEqual(no, { ok: false, status: 402, error: "This needs 2 credits and you have 0." });
  assert.equal(broke.inputs.length, 0, "no AI call when the account cannot pay");
});

const report = (over: Partial<V1Report> = {}): V1Report => ({
  ok: true, refused: null, labels: [], frames: { edited: 0, added: 0, deleted: 0 }, lengthS: 3, kimodoCalls: 1, fps: 24, stage: [800, 600], layersDir: "layers", video: null,
  blocks: [{ id: "b1", sentence: "x", made: "new", frames: 3, labels: [], firstFrame: 0, lengthS: 3, moves: [], seedBump: 0, redrawn: false, kimodoCalls: 1 }], ...over,
});

test("(Nov 20, money) a run is charged its card's locked price, never a guess from the report + the Claude ledger delta", () => {
  assert.deepEqual(v1RunCharge({ kind: "create", report: report(), price: { credits: 67, kind: "animation" } }), { credits: 67, kind: "animation" });
  assert.deepEqual(v1RunCharge({ kind: "edit", report: report({ blocks: [...report().blocks, { ...report().blocks[0], id: "b2" }] }), price: { credits: 27, kind: "addon" } }),
    { credits: 27, kind: "addon" }, "however many blocks came back new");
  assert.deepEqual(v1RunCharge({ kind: "edit", report: report(), price: null }), { credits: 12, kind: "edit" }, "no card: its own seconds at 4 a second");
  const ledger = { total: 1, calls: [
    { at: "2026-11-02T10:00:01.000Z", who: "director", model: "claude-x", usd: 0.01, usage: { input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 20 } },
    { at: "2026-11-02T10:00:02.000Z", who: "chat brain", model: "claude-x", usd: 0.5, usage: { input_tokens: 9, output_tokens: 9 } },
    { at: "2026-11-02T11:00:00.000Z", who: "director", model: "claude-x", usd: 0.7, usage: { input_tokens: 9, output_tokens: 9 } },
  ] };
  const from = Date.parse("2026-11-02T10:00:00.000Z"), to = Date.parse("2026-11-02T10:01:00.000Z");
  assert.deepEqual(claudeSpendBetween(ledger, from, to, "chat brain"), { calls: 1, inputTokens: 150, outputTokens: 20, usd: 0.01, model: "claude-x" });
  const run: V1EngineRunEnd = { ...ME, runId: "r0", kind: "create", status: "failed", report: null, startedAtMs: from, finishedAtMs: to };
  assert.equal(v1EngineRunEvents(run, claudeSpendBetween(null, from, to, null), "p").length, 0, "nothing called = nothing recorded");
});

test("meter -> the SAME stores the AI Dashboard reads (account usage + credits): one turn + one engine run; a failed run = its real spend, no credits", async () => {
  // the stores live under process.cwd()/.local: a fresh temp folder, never the app's own data
  process.chdir(mkdtempSync(join(tmpdir(), "v1-usage-")));
  const { recordUsageEvent } = await import("../../usage-journal/usageJournalRuntime.ts");
  const { withAccountUsageOwner, readAccountUsageRows } = await import("../../account-usage/accountUsageStore.ts");
  const { projectAccountUsage } = await import("../../account-usage/accountUsageProjection.ts");
  const { accountAiCreditGate, getCreditUseEvents, getAccountPlanStatus } = await import("../../account/aiCredits.ts");
  const start = Date.now() - 5_000;
  const ledger = { total: 0.03, calls: [
    { at: new Date(start + 1_000).toISOString(), who: "director", model: "claude-x", usd: 0.02, usage: { input_tokens: 1000, output_tokens: 200 } },
    { at: new Date(start + 1_500).toISOString(), who: "chat brain", model: "claude-x", usd: 0.01, usage: { input_tokens: 10, output_tokens: 10 } },
  ] };
  const meter = createV1UsageMeter({ credits: accountAiCreditGate, recorder: recordUsageEvent, withOwner: withAccountUsageOwner,
    readLedger: () => ({ ledger, exceptWho: "chat brain" }), pricingVersion: "test" });
  const before = getAccountPlanStatus(ME.ownerId).creditsUsed;

  assert.equal(meter.creditsShort!(ME.ownerId, 15), null);
  meter.turnAnswered!({ ...ME, turnId: "turn-1" });   // cost unknown: the old average, 15
  meter.turnAnswered!({ ...ME, turnId: "turn-2", costUsd: 0.0732 });   // (Nov 22) its real cost: 8 credits (1 per started cent)
  meter.engineRun!({ ...ME, runId: "run-1", kind: "create", status: "done", report: report(), startedAtMs: start, finishedAtMs: Date.now(), price: { credits: 27, kind: "animation" } });

  const credits = getCreditUseEvents(ME.ownerId).map((e) => [e.kind, e.credits]);
  assert.deepEqual(credits, [["chat", 15], ["chat", 8], ["animation", 27]]); // an answer = its real cost (15 only when unknown); the run = exactly its card's price
  assert.equal(getAccountPlanStatus(ME.ownerId).creditsUsed - before, 50, "the credits bar moved by the two answers + the card's price");

  const { rows, gap, readAt } = readAccountUsageRows(ME.ownerId);
  const snap = projectAccountUsage(rows, readAt, gap);
  assert.equal(snap.assistant.receipts.length, 0);
  const receipts = snap.project.receipts.map((r) => ({ model: r.model, tokens: r.totalTokens, usd: r.estimatedCostUsd, calls: r.toolCalls })).sort((a, b) => String(a.model).localeCompare(String(b.model)));
  assert.deepEqual(receipts, [{ model: "claude-x", tokens: 1200, usd: 0.02, calls: 1 }, { model: "kimodo", tokens: null, usd: null, calls: 1 }]);
  assert.equal(snap.project.state, "ready", JSON.stringify(snap.project.issues));

  // a failed run: the Claude call it really made is recorded; no credits
  meter.engineRun!({ ...ME, runId: "run-2", kind: "edit", status: "failed", report: null, startedAtMs: start, finishedAtMs: Date.now() });
  assert.equal(getCreditUseEvents(ME.ownerId).length, 3, "a failed run costs no credits");
  const after = projectAccountUsage(readAccountUsageRows(ME.ownerId).rows, Date.now(), false);
  assert.equal(after.project.receipts.length, 3);
  assert.equal(after.project.failed, 1);
});
