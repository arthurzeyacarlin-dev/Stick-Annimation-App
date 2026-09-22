import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ASSISTANT_FINALIZING_MS, DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { fixtureRequest, fixtureResult } from "./phase2Fixtures.ts";

const output = "output/spec-0012/phase-2-correction"; mkdirSync(output, { recursive: true });
const assertions: string[] = []; const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
const check = (value: unknown, name: string) => { assert.ok(value, name); assertions.push(name); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
equal(ASSISTANT_FINALIZING_MS, 3000, "production finalizing hold is exactly 3000ms");
let release: (() => void) | undefined; let calls = 0;
const request = fixtureRequest(); const answer = fixtureResult(request);
const service = new DiamondAssistantJobService(async (_request, options) => { calls++; equal(Object.keys(options), ["signal"], "provider cannot publish a premature finalizing event"); await new Promise<void>(resolve => { release = resolve; }); return answer; });
service.submit(request); await sleep(50); equal(service.get(request.jobId, request.sessionId)?.status, "thinking", "provider work remains Thinking");
release!(); await sleep(10); let snapshot = service.get(request.jobId, request.sessionId)!;
equal(snapshot.status, "finalizing", "complete validated answer starts finalizing"); equal(snapshot.result, null, "answer/title/usage stay private during final hold");
const finalizingAt = snapshot.events.at(-1)!.at; const duplicate = service.submit(request); equal(duplicate.events, snapshot.events, "duplicate submission does not restart final hold"); equal(calls, 1, "duplicate makes no second provider call");
answer.reply.answer = "An outside caller changed its copy.";
const cancelledRequest = fixtureRequest(); const cancelService = new DiamondAssistantJobService(async req => fixtureResult(req)); cancelService.submit(cancelledRequest); await sleep(10);
equal(cancelService.get(cancelledRequest.jobId, cancelledRequest.sessionId)?.status, "finalizing", "cancel fixture reaches actual final hold"); cancelService.cancelRequest(cancelledRequest);
const timedRequest = fixtureRequest(); const timed = new DiamondAssistantJobService(async req => fixtureResult(req), 50); timed.submit(timedRequest); await sleep(10);
equal(timed.get(timedRequest.jobId, timedRequest.sessionId)?.status, "finalizing", "deadline fixture reaches final hold before deadline");
for (const mutate of [
  (r: ReturnType<typeof fixtureResult>) => ({ ...r, extra: "invalid" }),
  (r: ReturnType<typeof fixtureResult>) => ({ ...r, reply: { answer: "ok", title: "" } }),
  (r: ReturnType<typeof fixtureResult>) => ({ ...r, usage: { ...r.usage, reasoning: "high" } }),
  (r: ReturnType<typeof fixtureResult>) => ({ ...r, usage: { ...r.usage, model: "unexpected" } }),
]) {
  const req = fixtureRequest(); const invalid = new DiamondAssistantJobService(async r => mutate(fixtureResult(r)) as ReturnType<typeof fixtureResult>); invalid.submit(req); await sleep(5);
  equal(invalid.get(req.jobId, req.sessionId)?.events.map(event => event.status), ["thinking", "failed"], "invalid complete result fails without ever Finalizing");
}
await sleep(Math.max(0, finalizingAt + 2700 - Date.now())); equal(service.get(request.jobId, request.sessionId)?.status, "finalizing", "valid answer is not published early during 3s hold");
await sleep(Math.max(0, finalizingAt + 3150 - Date.now())); snapshot = service.get(request.jobId, request.sessionId)!;
equal(snapshot.status, "done", "validated result publishes after hold"); const heldMs = snapshot.events[2].at - snapshot.events[1].at; check(heldMs >= 3000 && heldMs < 3400, "measured server hold approximately three seconds");
check(snapshot.result!.reply.answer !== answer.reply.answer, "validated held result is detached from provider-owned mutation");
equal(cancelService.get(cancelledRequest.jobId, cancelledRequest.sessionId)?.events.map(event => event.status), ["thinking", "finalizing", "cancelled"], "cancel wins permanently over late hold completion");
equal(timed.get(timedRequest.jobId, timedRequest.sessionId)?.events.map(event => event.status), ["thinking", "finalizing", "failed"], "deadline remains active and wins during final hold");
const restarted = new DiamondAssistantJobService(async req => { calls++; return fixtureResult(req); }); equal(restarted.get(request.jobId, request.sessionId), null, "server restart cannot resurrect held answer"); equal(calls, 1, "restart observation never sends again");
const provider = readFileSync("src/lib/assistant/assistantProvider.ts", "utf8"); check(!provider.includes("options.finalizing") && !provider.includes("response.output_text.delta"), "streaming delta cannot change the activity label");
const hook = readFileSync("src/components/assistant/useAssistantSessions.ts", "utf8"); check(hook.includes("ASSISTANT_LONG_WAIT_MS = 8000") && hook.includes("progressEligible") && hook.includes("progressShown"), "narration has a real long-wait threshold and per-job one-shot ownership");
writeFileSync(`${output}/correction-oracle.json`, JSON.stringify({ status: "PASS", assertions, finalizingHoldMs: heldMs, progressDelayMs: 8000, realProviderCalls: 0, paidCalls: 0 }, null, 2)); console.log(JSON.stringify({ status: "PASS", assertions: assertions.length, finalizingHoldMs: heldMs }));
