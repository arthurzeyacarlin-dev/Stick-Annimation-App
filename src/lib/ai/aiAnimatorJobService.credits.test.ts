// SPEC-0020 Phase 2: the AI Animator checks credits before a message starts and spends one credit only
// when the message gets an answer. Uses a pretend AI (no paid calls) and a pretend credit store.
// Run: node --test src/lib/ai/aiAnimatorJobService.credits.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { AiAnimatorJobService } from "./aiAnimatorJobService.ts";
import { AI_ANIMATOR_MODEL, type AiAnimatorProviderResult, type AiAnimatorRequest } from "./aiAnimatorContract.ts";
import type { AiCreditGate } from "../account/aiCredits.ts";

const request = (jobId: string, projectId = "11111111-1111-4111-8111-111111111111") => ({
  jobId, turnId: `turn-${jobId}`, message: "make a stick figure wave", reasoningLevel: "medium", recentConversation: [],
  workspace: { projectId, projectGeneration: 1 },
}) as unknown as AiAnimatorRequest;

const answer = async (): Promise<AiAnimatorProviderResult> => ({
  reply: { intent: "conversation", reply: "Sure!", focusedQuestion: null, planSummary: null } as AiAnimatorProviderResult["reply"],
  requestedModel: AI_ANIMATOR_MODEL, providerModel: AI_ANIMATOR_MODEL, responseId: null,
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } as AiAnimatorProviderResult["usage"],
  latencyMs: 1, promptDigest: "x",
});

const gate = (left: number) => {
  const spent: string[] = [];
  const credits: AiCreditGate = {
    assertAvailable: () => { if (left - spent.length <= 0) throw Object.assign(new Error("You're out of AI credits."), { status: 402 }); },
    spend: (_owner, jobId) => { spent.push(jobId); },
  };
  return { credits, spent };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("an answered message spends exactly one credit", async () => {
  const { credits, spent } = gate(5);
  const service = new AiAnimatorJobService(answer, undefined, credits);
  service.submit(request("a"), "owner-1");
  await settle();
  service.submit(request("a"), "owner-1"); // the same job sent again is not a new message
  await settle();
  assert.deepEqual(spent, ["a"]);
});

test("a failed message is free", async () => {
  const { credits, spent } = gate(5);
  const service = new AiAnimatorJobService(async () => { throw new Error("AI down"); }, undefined, credits);
  service.submit(request("b"), "owner-1");
  await settle();
  assert.equal(service.get("b", request("b").workspace.projectId, "owner-1")?.status, "failed");
  assert.deepEqual(spent, []);
});

test("with 0 credits the message never reaches the AI", async () => {
  const { credits } = gate(0);
  let calls = 0;
  const service = new AiAnimatorJobService(async () => { calls++; return answer(); }, undefined, credits);
  assert.throws(() => service.submit(request("c"), "owner-1"), (error: Error & { status?: number }) => error.status === 402);
  await settle();
  assert.equal(calls, 0);
});
