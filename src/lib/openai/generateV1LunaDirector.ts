import {
  AI_ANIMATOR_MODEL,
  isAiAnimatorProviderModel,
  type AiAnimatorRequest,
  type AiAnimatorUsage,
} from "../ai/aiAnimatorContract.ts";
import type { DirectorAsk, DirectorBook, DirectorQuestion } from "../ai/v1Animator/v1LunaDirector.ts";
import { getOpenAiClient } from "./client.ts";
import {
  noUsageEventRecorder, projectDispatchedEvent, projectProviderObservedEvent, type UsageEventRecorder,
} from "../usage-journal/usageJournalEvents.ts";

// LUNA AS THE ANIMATION DIRECTOR (Nov 2): ONE Luna call = the question luna-director.mjs built ({system, user, schema}) -> one JSON
// plan. The same client factory, model (AI_ANIMATOR_MODEL), prices and usage recording calls as generateV1LunaTurn.ts; the schema
// arrives already made OpenAI-strict (v1LunaDirector.ts strictSchema). The tokens + reasoning effort come from luna-book.json `director`.
// Tests pass a fake client ($0).

const INPUT_PRICE_PER_MILLION = 0.2; // (Luna's prices, the same as generateAiAnimatorReply.ts)
const OUTPUT_PRICE_PER_MILLION = 1.2;
const PRICING_VERSION = "project-conversation-estimator-v1";

export type V1DirectorRequest = { jobId: string; turnId: string; projectId: string; sentence: string };
const estimateCostUsd = (inputTokens: number | null, outputTokens: number | null) =>
  inputTokens === null || outputTokens === null ? null : (inputTokens * INPUT_PRICE_PER_MILLION + outputTokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000;
const usageIdentity = (r: V1DirectorRequest): AiAnimatorRequest => ({
  jobId: r.jobId, turnId: r.turnId, message: r.sentence, reasoningLevel: "low", recentConversation: [],
  workspace: { projectId: r.projectId, projectTitle: "", projectGeneration: 0, totalLayers: 0, authoredFrameCount: 0, timelineFps: 0, activeTool: "" },
});

export const createV1LunaDirectorAsk = (
  clientFactory: typeof getOpenAiClient = getOpenAiClient,
  recorder: UsageEventRecorder = noUsageEventRecorder,
) => (request: V1DirectorRequest, director: DirectorBook, options: { signal?: AbortSignal } = {}): DirectorAsk => async (q: DirectorQuestion) => {
  const meter = (event: Parameters<UsageEventRecorder>[0]) => { try { recorder(event); } catch { /* Best-effort observation only. */ } };
  const identity = usageIdentity(request);
  let response;
  try {
    const client = clientFactory("terra-conversation");
    meter(projectDispatchedEvent(identity, Date.now(), AI_ANIMATOR_MODEL));
    response = await client.responses.create(
      {
        model: AI_ANIMATOR_MODEL,
        instructions: q.system,
        input: q.user,
        reasoning: { effort: director.reasoningEffort },
        max_output_tokens: director.maxOutputTokens,
        tools: [],
        store: false,
        text: { format: { type: "json_schema", name: "diamond_v1_director_plan", strict: true, schema: q.schema as Record<string, unknown> }, verbosity: "low" },
      },
      options.signal ? { signal: options.signal } : undefined,
    );
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message.slice(0, 300) : "unreachable" };
  }
  const inputTokens = response.usage?.input_tokens ?? null, outputTokens = response.usage?.output_tokens ?? null;
  const usage: AiAnimatorUsage = { inputTokens, outputTokens, totalTokens: response.usage?.total_tokens ?? null, estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens) };
  meter(projectProviderObservedEvent(identity, {
    requestedModel: AI_ANIMATOR_MODEL, returnedModel: response.model ?? null, responseId: response.id ?? null, usage, pricingVersion: PRICING_VERSION,
  }));
  if (!isAiAnimatorProviderModel(response.model)) return { ok: false, detail: "a response from an unexpected model" };
  const raw = typeof response.output_text === "string" ? response.output_text : "";
  // (a malformed answer still goes to the checker, which says what is wrong: the one retry can fix it)
  let answer: unknown = null;
  try { answer = JSON.parse(raw); } catch { answer = null; }
  return { ok: true, answer, costUsd: usage.estimatedCostUsd };
};
