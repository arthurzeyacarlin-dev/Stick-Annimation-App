import test from "node:test";
import assert from "node:assert/strict";
import { DiamondAssistantJobService, ASSISTANT_ANSWER_CREDITS } from "./assistantJobService.ts";
import { ASSISTANT_MODEL, ASSISTANT_PRICES_PER_MILLION, AssistantError, CATALOG_VERSION } from "./assistantContracts.ts";

// Arthur (2026-10-27): every Help Assistant answer costs AI credits — checked before the (paid) call, spent once
// when the answer arrives, never for a refused, failed or stopped answer. A pretend provider: no paid call.
const request = (n: number) => ({ schema: "diamond-assistant-request/v1", jobId: `job-test-${n}0000`, sessionId: `session-${n}0000`, turnId: `turn-test-${n}0000`,
  message: "How do I add a keyframe?", reasoningLevel: "low", recentConversation: [], catalogVersion: CATALOG_VERSION, clientSessionRevision: 1 });
const price = ASSISTANT_PRICES_PER_MILLION[ASSISTANT_MODEL];
const answer = async () => ({ reply: { answer: "Press F6.", title: "Keyframes" }, usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100,
  estimatedCostUsd: (1000 * price.input + 100 * price.output) / 1000000, priceDate: "2026-09-22", responseId: "resp_test_1234", latencyMs: 10, model: ASSISTANT_MODEL, reasoning: "low", toolCalls: 0 } });
const failing = async () => { throw new Error("provider down"); };
function gate(creditsLeft: number) {
  const spent: { jobId: string; credits?: number; kind?: string }[] = [];
  return { spent, assertAvailable(_owner: string, reserved: number, cost = 1) {
    if (creditsLeft - reserved < cost) throw Object.assign(new Error(`This needs ${cost} credits and your free trial has ${creditsLeft} left.`), { status: 402 });
  }, spend(_owner: string, jobId: string, credits?: number, kind?: string) { spent.push({ jobId, credits, kind }); } };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test("an answered Help Assistant message spends 1 credit, once, as an assistant use", async () => {
  const credits = gate(75);
  const jobs = new DiamondAssistantJobService(answer as never, 5000, 0, undefined, credits as never);
  jobs.submit(request(1), "owner-1"); await settle();
  assert.equal(jobs.get("job-test-10000", "session-10000", "owner-1")?.status, "done");
  assert.deepEqual(credits.spent, [{ jobId: "job-test-10000", credits: ASSISTANT_ANSWER_CREDITS, kind: "assistant" }]);
  assert.equal(ASSISTANT_ANSWER_CREDITS, 1);
});

test("with no credits left the answer is refused before any AI call, with a plain reason", async () => {
  let called = false;
  const jobs = new DiamondAssistantJobService((async () => { called = true; return answer(); }) as never, 5000, 0, undefined, gate(0) as never);
  assert.throws(() => jobs.submit(request(2), "owner-2"), (error: unknown) => error instanceof AssistantError && error.code === "credits" && /0 left/.test(error.message));
  await settle(); assert.equal(called, false);
});

test("a failed answer costs nothing", async () => {
  const credits = gate(75);
  const jobs = new DiamondAssistantJobService(failing as never, 5000, 0, undefined, credits as never);
  jobs.submit(request(3), "owner-3"); await settle();
  assert.equal(jobs.get("job-test-30000", "session-30000", "owner-3")?.status, "failed");
  assert.deepEqual(credits.spent, []);
});
