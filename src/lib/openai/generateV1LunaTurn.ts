import { createHash } from "node:crypto";
import {
  AI_ANIMATOR_MODEL,
  isAiAnimatorProviderModel,
  type AiAnimatorRequest,
  type AiAnimatorUsage,
} from "../ai/aiAnimatorContract.ts";
import type { V1LunaTurn } from "../ai/v1Animator/v1AnimatorContract.ts";
import {
  lunaInstructions, lunaTurnInput, lunaTurnSchema, normalizeV1LunaTurn,
  type EngineWords, type LunaBook, type V1LunaInput,
} from "../ai/v1Animator/v1LunaBook.ts";
import { getOpenAiClient } from "./client.ts";
import {
  noUsageEventRecorder, projectDispatchedEvent, projectProviderObservedEvent, type UsageEventRecorder,
} from "../usage-journal/usageJournalEvents.ts";

// AI ANIMATOR VERSION 1: ONE Luna turn -> V1LunaTurn (board/v1-single/PLAN_PARTB.md, helper B2). A NEW file beside
// generateAiAnimatorReply.ts (which is unchanged): the same client factory, the same model (AI_ANIMATOR_MODEL), the same usage
// recording calls (dispatched + provider-observed), a strict JSON schema. Luna's words come from her book (ltx-effects/v1k/
// luna-book.json) and the looks / stage words from the engine's book (v1k/passed_engine_book.json), both read by the caller at call time and passed in here.
// The server binds the real recorder (recordUsageEvent); tests pass a fake client and fixture answers ($0).

const INPUT_PRICE_PER_MILLION = 0.2; // (Luna's prices, the same as generateAiAnimatorReply.ts)
const OUTPUT_PRICE_PER_MILLION = 1.2;
const PRICING_VERSION = "project-conversation-estimator-v1";
export const V1_LUNA_MAX_OUTPUT_TOKENS = 4000;
export const V1_LUNA_REASONING_EFFORT = "low" as const;

export type V1LunaRequest = V1LunaInput & { jobId: string; turnId: string; projectId: string };
export type V1LunaBooks = { book: LunaBook; words: EngineWords };
export type V1LunaOutcome =
  | { ok: true; turn: V1LunaTurn; usage: AiAnimatorUsage; providerModel: string; responseId: string | null; latencyMs: number; promptDigest: string }
  | { ok: false; failure: "unreachable" | "bad_answer"; usage: AiAnimatorUsage | null; detail: string };

const estimateCostUsd = (inputTokens: number | null, outputTokens: number | null) =>
  inputTokens === null || outputTokens === null ? null : (inputTokens * INPUT_PRICE_PER_MILLION + outputTokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000;

// The usage journal's project identity (the same fields generateAiAnimatorReply.ts records; the workspace counts are not known here).
const usageIdentity = (request: V1LunaRequest): AiAnimatorRequest => ({
  jobId: request.jobId, turnId: request.turnId, message: request.message, reasoningLevel: "low", recentConversation: request.recentConversation,
  workspace: { projectId: request.projectId, projectTitle: "", projectGeneration: 0, totalLayers: 0, authoredFrameCount: 0, timelineFps: 0, activeTool: "" },
});

export const createV1LunaTurnGenerator = (
  clientFactory: typeof getOpenAiClient = getOpenAiClient,
  recorder: UsageEventRecorder = noUsageEventRecorder,
) => async (request: V1LunaRequest, books: V1LunaBooks, options: { signal?: AbortSignal } = {}): Promise<V1LunaOutcome> => {
  const meter = (event: Parameters<UsageEventRecorder>[0]) => { try { recorder(event); } catch { /* Best-effort observation only. */ } };
  const identity = usageIdentity(request);
  const startedAt = performance.now();
  const ask = () => {
    const client = clientFactory("terra-conversation");
    meter(projectDispatchedEvent(identity, Date.now(), AI_ANIMATOR_MODEL));
    return client.responses.create(
      {
        model: AI_ANIMATOR_MODEL,
        instructions: lunaInstructions(books.book, books.words),
        input: lunaTurnInput(books.book, request),
        reasoning: { effort: V1_LUNA_REASONING_EFFORT },
        max_output_tokens: V1_LUNA_MAX_OUTPUT_TOKENS,
        tools: [],
        store: false,
        text: {
          format: { type: "json_schema", name: "diamond_v1_luna_turn", strict: true, schema: lunaTurnSchema(books.words, books.book) },
          verbosity: "low",
        },
      },
      options.signal ? { signal: options.signal } : undefined,
    );
  };
  let response: Awaited<ReturnType<typeof ask>>;
  try {
    response = await ask();
  } catch (error) {
    return { ok: false, failure: "unreachable", usage: null, detail: error instanceof Error ? error.message.slice(0, 300) : "unreachable" };
  }
  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;
  const usage: AiAnimatorUsage = {
    inputTokens, outputTokens, totalTokens: response.usage?.total_tokens ?? null, estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
  };
  meter(projectProviderObservedEvent(identity, {
    requestedModel: AI_ANIMATOR_MODEL, returnedModel: response.model ?? null, responseId: response.id ?? null, usage, pricingVersion: PRICING_VERSION,
  }));
  if (!isAiAnimatorProviderModel(response.model)) return { ok: false, failure: "bad_answer", usage, detail: "a response from an unexpected model" };
  const raw = "output_text" in response && typeof response.output_text === "string" ? response.output_text : "";
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, failure: "bad_answer", usage, detail: "malformed structured output" }; }
  const turn = normalizeV1LunaTurn(parsed, books.words, books.book);
  if (!turn) return { ok: false, failure: "bad_answer", usage, detail: "the answer did not match the V1 turn contract" };
  return {
    ok: true, turn, usage, providerModel: String(response.model), responseId: response.id ?? null,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    promptDigest: createHash("sha256").update(request.message).digest("hex"),
  };
};
