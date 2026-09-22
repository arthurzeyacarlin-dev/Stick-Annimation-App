import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ASSISTANT_LIMITS, ASSISTANT_MODEL, CATALOG_VERSION, REASONING, byteSize, recentContext, sealSession, validateAnswer, validateRequest, validateSession, validateSnapshot } from "../../src/lib/assistant/assistantContracts.ts";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { ASSISTANT_INSTRUCTIONS, KNOWLEDGE_CATALOG, retrieveKnowledge } from "../../src/lib/assistant/assistantKnowledge.ts";
import { providerInput, ASSISTANT_PRICE } from "../../src/lib/assistant/assistantProvider.ts";
import { fixtureRequest, fixtureResult, fixtureSession, newcomerAnswer } from "./phase2Fixtures.ts";

const assertions: string[] = [];
const check = (condition: unknown, name: string) => { assert.ok(condition, name); assertions.push(name); };
const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
const rejects = async (run: () => unknown, name: string) => { let failed = false; try { await run(); } catch { failed = true; } check(failed, name); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
equal(ASSISTANT_MODEL, "gpt-5.6-terra", "fixed Terra model");
equal(REASONING, { low: "Low", medium: "Medium", high: "High", xhigh: "Extra High" }, "exact four reasoning mappings");
equal(ASSISTANT_LIMITS, { sessions: 50, messages: 200, userChars: 12000, answerChars: 16000, sessionBytes: 1048576, databaseBytes: 33554432, contextMessages: 32, contextChars: 48000, inputTokens: 24000, outputTokens: 4000, deadlineMs: 90000, activeJobs: 2, replyReserveBytes: 68000 }, "frozen ceilings");
const good = fixtureRequest(); validateRequest(good);
for (const extra of ["projectId", "workspace", "command", "action", "patch", "model", "tools", "search"]) await rejects(() => validateRequest({ ...good, [extra]: "forbidden" }), `request rejects ${extra}`);
for (const patch of [{ message: "" }, { message: "x".repeat(12001) }, { message: "\ud800" }, { reasoningLevel: "max" }, { catalogVersion: "old" }, { clientSessionRevision: NaN }, { recentConversation: [{ id: "user00001", turnId: "turn00001", role: "user", text: "Hello", at: 100 }, { id: "answer001", turnId: "turn00002", role: "assistant", text: "wrong", at: 50 }] }]) await rejects(() => validateRequest({ ...good, ...patch }), `request rejects ${JSON.stringify(patch).slice(0, 70)}`);
for (const reply of [{ answer: "ok", title: "" }, { answer: "ok", title: "x".repeat(81) }, { answer: "\ud800".repeat(16000), title: "Bad unicode" }, { answer: "ok", title: "Title", command: "delete" }]) await rejects(() => validateAnswer(reply), "strict answer/title rejects malformed output");
check(byteSize({ answer: "\uffff".repeat(16000), title: "😀".repeat(80) }) < ASSISTANT_LIMITS.replyReserveBytes - 2000, "reservation covers maximum validated Unicode answer/title plus receipt overhead");
const session = await fixtureSession(1, 100, 100); await validateSession(session); check(true, "200-message valid record accepted");
const history = recentContext(session.messages); check(history.length <= 32 && history[0].role === "user", "bounded complete suffix");
equal(history, session.messages.slice(-32), "context is newest contiguous suffix");
const oversizedHistory = session.messages.map(m => ({ ...m, text: "x".repeat(12000) })); check(recentContext(oversizedHistory).reduce((n, m) => n + m.text.length, 0) <= 48000, "48k context ceiling");
for (const mutate of [
  (s: typeof session) => { s.titleSource = "manual"; },
  (s: typeof session) => { s.messages[1].turnId = "wrong00001"; },
  (s: typeof session) => { s.messages[2].at = s.messages[0].at; s.turns[1].at = s.messages[0].at; },
  (s: typeof session) => { s.turns[1].contextIds = ["unknown001"]; },
  (s: typeof session) => { s.messages.push(s.messages[0]); },
]) { const copy = structuredClone(session); mutate(copy); await rejects(async () => validateSession(await sealSession(copy)), "rehash does not excuse invalid session structure"); }
const badDigest = structuredClone(session); badDigest.title = "Changed"; await rejects(() => validateSession(badDigest), "digest tampering rejected");
await rejects(async () => validateSession(await fixtureSession(2, 100, 16000)), "1 MiB UTF-8 record ceiling");
let calls = 0; let release: (() => void) | undefined;
const service = new DiamondAssistantJobService(async request => { calls++; await new Promise<void>(resolve => { release = resolve; }); return fixtureResult(request); });
const started = service.submit(good); equal(started.status, "thinking", "Thinking immediate at accepted submission");
service.submit(good); equal(calls, 1, "same request idempotent without second provider invocation");
await rejects(() => service.submit({ ...good, message: "Changed" }), "conflicting duplicate rejected");
await rejects(() => service.submit(fixtureRequest({ sessionId: good.sessionId })), "one active job per session");
equal(service.get(good.jobId, "wrong0001"), null, "cross-session lookup rejected");
service.cancelRequest(good); release!(); await sleep(1); equal(service.get(good.jobId, good.sessionId)?.status, "cancelled", "cancel wins over late successful provider result");
const early = fixtureRequest(); const beforeCalls = calls; service.cancelRequest(early); service.submit(early); equal(calls, beforeCalls, "cancel-before-POST tombstone prevents later provider invocation");
const doneService = new DiamondAssistantJobService(async request => fixtureResult(request), 90000, 0);
for (const reasoningLevel of Object.keys(REASONING) as Array<keyof typeof REASONING>) { const req = fixtureRequest({ reasoningLevel }); doneService.submit(req); await sleep(5); const result = doneService.get(req.jobId, req.sessionId)!; validateSnapshot(result, req); equal(result.result?.usage.reasoning, reasoningLevel, `${reasoningLevel} carried unchanged into terminal receipt`); equal(result.events.map(e => e.status), ["thinking", "finalizing", "done"], "truthful no-search event sequence"); }
const doneReq = fixtureRequest(); doneService.submit(doneReq); await sleep(5); const done = doneService.get(doneReq.jobId, doneReq.sessionId)!;
await rejects(() => validateSnapshot({ ...done, events: [done.events[0], done.events[1], { ...done.events[2], status: "finalizing" }], status: "finalizing", result: null }, doneReq), "repeated finalizing forbidden");
await rejects(() => validateSnapshot({ ...done, result: { ...done.result, usage: { ...done.result!.usage, model: "other" } } }, doneReq), "wrong provider model rejected");
const timeout = new DiamondAssistantJobService(async () => new Promise(() => {}), 10); const timed = fixtureRequest(); timeout.submit(timed); await sleep(30); equal(timeout.get(timed.jobId, timed.sessionId)?.status, "failed", "deadline settles even if provider ignores abort");
const capacity = new DiamondAssistantJobService(async () => new Promise(() => {}), 30); capacity.submit(fixtureRequest()); capacity.submit(fixtureRequest()); await rejects(() => capacity.submit(fixtureRequest()), "two active jobs per environment"); await sleep(40);
const invalid = new DiamondAssistantJobService(async req => ({ ...fixtureResult(req), reply: { answer: "x", title: "", action: "delete" } })); const invalidReq = fixtureRequest(); invalid.submit(invalidReq); await sleep(1); equal(invalid.get(invalidReq.jobId, invalidReq.sessionId)?.status, "failed", "invalid terminal answer not published");
check(providerInput(good).estimatedTokens <= 24000, "normal catalog guidance fits input estimate");
await rejects(() => providerInput(fixtureRequest({ message: "漢".repeat(12000) })), "conservative token estimate fails closed on oversized Unicode request");
equal(ASSISTANT_PRICE, { date: "2026-09-22", inputPerMillion: 2, outputPerMillion: 12, requestUsd: .15 }, "dated price and per-request ceiling retained without cumulative caps");
equal(KNOWLEDGE_CATALOG.version, CATALOG_VERSION, "versioned local catalog");
for (const topic of ["home", "projects", "tutorials", "save", "export", "drawing", "timeline", "animator", "assistant", "finalizer", "menu", "unknown"]) check(KNOWLEDGE_CATALOG.entries.some(e => e.id === topic && e.sources.length), `catalog has source-backed ${topic}`);
check(retrieveKnowledge(fixtureRequest({ message: "Which one lets me edit?", recentConversation: [{ id: "message001", turnId: "turn00001", role: "user", text: "Open Project or My Projects?", at: 1 }] })).some(e => e.id === "projects"), "follow-up catalog retrieval uses conversation history");
check(/paragraphs/.test(ASSISTANT_INSTRUCTIONS) && /No confirmed Version 2 date/.test(KNOWLEDGE_CATALOG.entries.find(e => e.id === "unknown")!.guidance), "natural prose and unknown-date constraints");
check(newcomerAnswer.includes("playback") && newcomerAnswer.includes("Coming Later") && newcomerAnswer.includes("cannot create or edit"), "newcomer deterministic answer is natural and capability-honest");
const runtimeRoots = ["src/lib/assistant", "src/components/assistant", "app/api/diamond-assistant"];
const imports: string[] = [];
for (const root of runtimeRoots) for (const name of readdirSync(root)) {
  if (!/\.tsx?$/.test(name)) continue; const source = readFileSync(`${root}/${name}`, "utf8");
  for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) { imports.push(`${root}/${name} -> ${match[1]}`); check(!/animation\/|recovery\/|export\/|aiAnimator|DrawingWorkspace|DrawingCanvas|project-library|open-project|manualCapability/.test(match[1]), `isolated import ${root}/${name}`); }
}
const provider = readFileSync("src/lib/assistant/assistantProvider.ts", "utf8"); check(/maxRetries: 0/.test(provider) && /tools: \[\], store: false/.test(provider) && !/web_search|fetch\(/.test(provider), "provider tools/search/retry disabled and only SDK transport");
const output = resolve("output/spec-0012/phase-2-correction"); mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "oracle.json"), JSON.stringify({ status: "PASS", assertions, imports, realProviderCalls: 0, paidCalls: 0, searchCalls: 0, projectMutations: 0 }, null, 2));
console.log(JSON.stringify({ status: "PASS", assertions: assertions.length, realProviderCalls: 0 }));
