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

test("(dad, Nov 26) a stopped or failed run is free but its REAL AI money counts toward the limits: fal + Claude during the run, never more than its price", async () => {
  const { falSpendBetween, stoppedRunCost } = await import("./v1UsageMeter.ts");
  const local = (ms: number) => { const d = new Date(ms), p = (n: number) => String(n).padStart(2, "0");   // wan.py writes local time, to the second
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const t0 = Date.now() - 60_000;
  const fal = { total: 9, calls: [{ at: local(t0 - 30_000), usd: 5 }, { at: local(t0 + 10_000), usd: 0.32 }, { at: local(t0 + 20_000), usd: 0.16 }, { at: local(t0 + 21_000), usd: -0.16 }] };
  assert.equal(falSpendBetween(fal, t0, t0 + 40_000), 0.32, "only the run's own time; a refused request's refund line takes it back");
  assert.equal(falSpendBetween(null, t0, t0 + 40_000), 0);
  assert.equal(stoppedRunCost({ kind: "create", report: null, price: { credits: 56, kind: "animation" } }, 0.32, 0.03), 35);
  assert.equal(stoppedRunCost({ kind: "create", report: null, price: { credits: 20, kind: "animation" } }, 0.32, 0.03), 20, "never more than its card's price");
  assert.equal(stoppedRunCost({ kind: "create", report: null, price: { credits: 56, kind: "animation" } }, 0, 0), 0, "stopped before the AI started = nothing");

  process.chdir(mkdtempSync(join(tmpdir(), "v1-usage-cost-")));
  const { accountAiCreditGate, getCreditUseEvents, getAccountPlanStatus, assertAiCreditAvailable } = await import("../../account/aiCredits.ts");
  const meter = createV1UsageMeter({ credits: accountAiCreditGate, recorder: () => undefined as never, withOwner: (_o, a) => a(),
    readLedger: () => ({ ledger: null, exceptWho: null }), readFalLedger: () => fal, pricingVersion: "test" });
  const who = "owner-stopped-run";
  meter.engineRun!({ ownerId: who, projectId: "p", runId: "run-stop", kind: "create", status: "cancelled", report: null, startedAtMs: t0, finishedAtMs: t0 + 40_000, price: { credits: 56, kind: "animation" } });
  meter.engineRun!({ ownerId: who, projectId: "p", runId: "run-fail", kind: "create", status: "failed", report: null, startedAtMs: t0, finishedAtMs: t0 + 40_000, price: { credits: 56, kind: "animation" } });
  meter.engineRun!({ ownerId: who, projectId: "p", runId: "run-refused", kind: "create", status: "refused", report: null, startedAtMs: t0, finishedAtMs: t0 + 40_000, price: { credits: 56, kind: "animation" } });
  assert.equal(getCreditUseEvents(who).length, 0, "the person still pays nothing");
  assert.equal(getAccountPlanStatus(who).creditsLeft, 300, "the balance is untouched (the 300-credit trial)");
  // the daily limit (1,500) now counts the 2 x 32 credits of real AI money: 1,436 more fit, 1,437 don't
  assert.doesNotThrow(() => assertAiCreditAvailable(who, 0, 1436 - 1500 + 150));   // (inside the trial's balance)
  process.env.DIAMOND_DAILY_CREDIT_LIMIT = "100";
  try {
    assert.doesNotThrow(() => assertAiCreditAvailable(who, 0, 36));
    assert.throws(() => assertAiCreditAvailable(who, 0, 37), (error: { code?: string }) => error.code === "daily_limit");
  } finally { delete process.env.DIAMOND_DAILY_CREDIT_LIMIT; }
});

test("(dad, Nov 26) a gate picture waiting at its card holds its real cost (balance), counts toward the daily + trial limits, and is settled once animated or charged", async () => {
  process.chdir(mkdtempSync(join(tmpdir(), "v1-usage-pic-")));
  const { accountAiCreditGate, getCreditUseEvents, assertAiCreditAvailable, TRIAL_HOUR_CREDITS } = await import("../../account/aiCredits.ts");
  const meter = createV1UsageMeter({ credits: accountAiCreditGate, recorder: () => undefined as never, withOwner: (_o, a) => a(),
    readLedger: () => ({ ledger: null, exceptWho: null }), pricingVersion: "test" });
  const who = "owner-pictures";
  assert.equal(meter.creditsShort!(who, 15), null, "a fresh trial account (300 credits)");
  // 12 new projects, one 24-credit first picture each, never animated: 288 of the trial's 300 credits are held
  for (let i = 0; i < 12; i++) meter.pictureWaiting!(who, `gate-picture-${i}`, 24);
  assert.equal(meter.creditsShort!(who, 12), null);
  assert.match(String(meter.creditsShort!(who, 13)), /credit/i, "13 more no longer fit: opening new projects is never free pictures");
  assert.equal(meter.creditsShort!(who, 30, 0, "gate-picture-0"), null, "animating picture 0: its own picture is in that price");
  meter.pictureWaiting!(who, "gate-picture-0", 0);   // animated (or charged): no longer waiting
  assert.equal(meter.creditsShort!(who, 30), null);
  assert.equal(getCreditUseEvents(who).length, 0, "waiting is never a charge");
  // the daily limit counts waiting pictures too
  process.env.DIAMOND_DAILY_CREDIT_LIMIT = "130";
  try { assert.throws(() => assertAiCreditAvailable(who, 0, 15), (error: { code?: string }) => error.code === "daily_limit"); }
  finally { delete process.env.DIAMOND_DAILY_CREDIT_LIMIT; }
  // the free trials' hourly limit counts them too
  const flood = "owner-flood";
  meter.pictureWaiting!(flood, "gate-picture-big", TRIAL_HOUR_CREDITS);
  assert.throws(() => assertAiCreditAvailable("owner-other-trial", 0, 15), (error: { code?: string }) => error.code === "busy_hour");
  meter.pictureWaiting!(flood, "gate-picture-big", 0);
  assert.doesNotThrow(() => assertAiCreditAvailable("owner-other-trial", 0, 15));
});

test("(dad, Nov 26) a free plan answer charges nothing (its real cost counts toward the limits); a paid change is charged its WARM cost, never above 20; the cold load is ours", async () => {
  process.chdir(mkdtempSync(join(tmpdir(), "v1-usage-plan-")));
  const { accountAiCreditGate, getCreditUseEvents, assertAiCreditAvailable } = await import("../../account/aiCredits.ts");
  const meter = createV1UsageMeter({ credits: accountAiCreditGate, recorder: () => undefined as never, withOwner: (_o, a) => a(),
    readLedger: () => ({ ledger: null, exceptWho: null }), pricingVersion: "test" });
  const who = "owner-planning";
  meter.turnAnswered!({ ownerId: who, projectId: "p", turnId: "plan-1", costUsd: 0.08, realCostUsd: 0.43, free: true });   // dad's cold first plan
  assert.equal(getCreditUseEvents(who).length, 0, "free: nothing charged");
  meter.turnAnswered!({ ownerId: who, projectId: "p", turnId: "change-5", costUsd: 0.0732, realCostUsd: 0.0732, free: false });
  meter.turnAnswered!({ ownerId: who, projectId: "p", turnId: "change-6", costUsd: 0.31, realCostUsd: 0.31, free: false });   // a long-thinking change
  meter.turnAnswered!({ ownerId: who, projectId: "p", turnId: "change-7", costUsd: 0.05, realCostUsd: 0.40, free: false });   // a paid change that hit a cold cache
  assert.deepEqual(getCreditUseEvents(who).map((e) => e.credits), [8, 20, 5], "warm cost, at most 20 (what the card said), never the cold load");
  // the daily limit counts everything we really paid: 43 + 8 + 31 + 40 = 122 credits
  process.env.DIAMOND_DAILY_CREDIT_LIMIT = "130";
  try {
    assert.doesNotThrow(() => assertAiCreditAvailable(who, 0, 8));
    assert.throws(() => assertAiCreditAvailable(who, 0, 9), (error: { code?: string }) => error.code === "daily_limit");
  } finally { delete process.env.DIAMOND_DAILY_CREDIT_LIMIT; }
});

test("(dad, Nov 26) free planning HOLDS its real cost until that project's Animate: project after project is never free planning without end", async () => {
  process.chdir(mkdtempSync(join(tmpdir(), "v1-usage-hold-")));
  const { accountAiCreditGate, getCreditUseEvents } = await import("../../account/aiCredits.ts");
  const meter = createV1UsageMeter({ credits: accountAiCreditGate, recorder: () => undefined as never, withOwner: (_o, a) => a(),
    readLedger: () => ({ ledger: null, exceptWho: null }), pricingVersion: "test" });
  const who = "owner-farming";
  assert.equal(meter.creditsShort!(who, 300), null, "a fresh 300-credit trial");
  // 8 projects, 4 free answers (10 credits each) in each, never animated
  for (let p = 0; p < 8; p++) {
    for (let t = 0; t < 4; t++) meter.turnAnswered!({ ownerId: who, projectId: `proj-${p}`, turnId: `t-${p}-${t}`, costUsd: 0.1, realCostUsd: 0.1, free: true });
  }
  assert.equal(getCreditUseEvents(who).length, 0, "nothing charged");
  // 8 x 40 = 320 > 300: the account can't plan or animate any more until something is animated
  assert.match(String(meter.creditsShort!(who, 15)), /credit/i);
  // Animating project 6 (its planning is in that price): its own holds are left out of its check...
  assert.equal(meter.creditsShort!(who, 20, 0, null, "proj-7"), null, "...the other 7 projects still hold 280: 20 are left");
  assert.match(String(meter.creditsShort!(who, 21, 0, null, "proj-7")), /credit/i, "...and not one more");
  // a fresh account: one project planned, then animated - its planning stops holding (it is covered by the card's price)
  const ok = "owner-normal";
  meter.creditsShort!(ok, 1);
  for (let t = 0; t < 4; t++) meter.turnAnswered!({ ownerId: ok, projectId: "p", turnId: `n-${t}`, costUsd: 0.1, realCostUsd: 0.1, free: true });
  assert.match(String(meter.creditsShort!(ok, 261)), /credit/i, "40 held");
  assert.equal(meter.creditsShort!(ok, 261, 0, null, "p"), null, "Animate in that project: its own planning is in its price");
  meter.planningSettled!(ok, "p");
  assert.equal(meter.creditsShort!(ok, 300), null, "after Animate nothing is held");
});
