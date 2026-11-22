import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createV1LunaTurnGenerator } from "./generateV1LunaTurn.ts";
import type { getOpenAiClient } from "./client.ts";
import { AI_ANIMATOR_MODEL } from "../ai/aiAnimatorContract.ts";
import { readEngineWords, readLunaBook } from "../ai/v1Animator/v1LunaBook.ts";
import { ANSWERS, makeTestRoot } from "../ai/v1Animator/__fixtures__/v1TestRoot.ts";

// TEST FIXTURES ONLY: a fake OpenAI client that answers with the labelled hand-written fixture answers ($0, no AI call).
const books = () => {
  const { lx } = makeTestRoot();
  return { book: readLunaBook(join(lx, "v1k", "luna-book.json")), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")) };
};
const fakeClient = (answer: unknown, model: string = AI_ANIMATOR_MODEL, sent: Record<string, unknown>[] = []) => (() => ({
  responses: {
    create: async (body: Record<string, unknown>) => {
      sent.push(body);
      return { id: "resp_fixture", model, output_text: JSON.stringify(answer), usage: { input_tokens: 1000, output_tokens: 200, total_tokens: 1200 } };
    },
  },
})) as unknown as typeof getOpenAiClient;
const request = { jobId: "job-1", turnId: "turn-1", projectId: "project-1", message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [], current: null, checkerSaid: null };

test("one Luna turn: the same model + strict schema, the same usage journal calls, a normalised V1LunaTurn", async () => {
  const sent: Record<string, unknown>[] = [];
  const events: { stage: string; requestedModel?: string; estimatedCostUsd?: number | null }[] = [];
  const generate = createV1LunaTurnGenerator(fakeClient(ANSWERS.create_jacks_flip, `${AI_ANIMATOR_MODEL}-2026-10-01`, sent), (event) => { events.push(event as never); return true; });
  const out = await generate(request, books());
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.turn.intent, "create");
  assert.deepEqual(out.turn.blocks, [{ sentence: "A stick figure does a few jumping jacks and then a front flip." }]);
  assert.equal(sent[0].model, AI_ANIMATOR_MODEL);
  const format = (sent[0].text as { format: { strict: boolean; type: string } }).format;
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  assert.equal(sent[0].store, false);
  // SAME ENGINE: the schema sent to the provider is the blocks + ops turn (no V1K move kinds)
  const sentSchema = JSON.stringify((sent[0].text as { format: { schema: unknown } }).format.schema);
  assert.ok(sentSchema.includes('"blocks"') && sentSchema.includes('"rewrite"') && !sentSchema.includes('"kind"'));
  assert.deepEqual(events.map((e) => e.stage), ["dispatched", "provider_observed"]);
  assert.equal(events[1].estimatedCostUsd, (1000 * 0.2 + 200 * 1.2) / 1_000_000);
});

test("bad answers are said, never guessed: wrong model, broken JSON, an answer outside the contract; a thrown call = unreachable", async () => {
  const b = books();
  const wrongModel = await createV1LunaTurnGenerator(fakeClient(ANSWERS.conversation, "some-other-model"))(request, b);
  assert.deepEqual(wrongModel.ok ? null : wrongModel.failure, "bad_answer");
  const outside = await createV1LunaTurnGenerator(fakeClient(ANSWERS.create_two_blocks))(request, b);
  assert.deepEqual(outside.ok ? null : outside.failure, "bad_answer");
  const broken = (() => ({ responses: { create: async () => ({ id: "r", model: AI_ANIMATOR_MODEL, output_text: "{not json", usage: {} }) } })) as unknown as typeof getOpenAiClient;
  const brokenOut = await createV1LunaTurnGenerator(broken)(request, b);
  assert.deepEqual(brokenOut.ok ? null : brokenOut.failure, "bad_answer");
  const down = (() => ({ responses: { create: async () => { throw new Error("network down"); } } })) as unknown as typeof getOpenAiClient;
  const downOut = await createV1LunaTurnGenerator(down)(request, b);
  assert.deepEqual(downOut.ok ? null : downOut.failure, "unreachable");
});
