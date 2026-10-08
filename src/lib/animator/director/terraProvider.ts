import { AI_ANIMATOR_LEGACY_MODEL, type AiAnimatorRequest } from "../../ai/aiAnimatorContract.ts";
import { getOpenAiClient } from "../../openai/client.ts";
import { noUsageEventRecorder, projectDispatchedEvent, projectProviderObservedEvent, type UsageEventRecorder } from "../../usage-journal/usageJournalEvents.ts";
import type { Provider } from "./direct.ts";

// SPEC-0017 Phase 3: the real Terra (OpenAI Responses API, strict JSON schema), the cost estimator and the
// money rule. The call shape is copied from src/lib/openai/generateAiAnimatorReply.ts.

// Prices (USD per million tokens), as generateAiAnimatorReply.ts. The cached-input price for this model isn't
// written anywhere in the project, so cached input is counted at the FULL input price (never under-estimates).
// (`cacheWritePerMillion`: what writing the prompt cache costs, for a model that charges it — Claude; else the input price.)
export type Prices = { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion: number | null; cacheWritePerMillion?: number | null; perSearchUsd: number };
export const PRICES: Prices = { inputPerMillion: 2, outputPerMillion: 12, cachedInputPerMillion: null, perSearchUsd: 0.01 };
// LUNA, the cheaper challenger (Arthur, 2026-10-07: Terra and Luna side by side in the bench, the SAME instructions and
// engine). Same provider, key and strict-plan support. Price from OpenAI's model page, checked 2026-10-07: $0.20 input /
// $1.20 output per million tokens (cached input again counted at the full price).
export const LUNA_MODEL = "gpt-5.6-luna";
// (Arthur, 2026-10-08: Luna replaces Terra everywhere; createTerraProvider() still builds Terra for comparisons.)
export const TERRA_MODEL = AI_ANIMATOR_LEGACY_MODEL;
export const LUNA_PRICES: Prices = { inputPerMillion: 0.2, outputPerMillion: 1.2, cachedInputPerMillion: null, perSearchUsd: 0.01 };
export const PRICING_VERSION = "director-estimator-v1";
// Each Terra call may cost at most this much (the pre-send check).
export const DEFAULT_MAX_USD = 0.04; // (Arthur: all Phase 3 tests together at most $0.50; 4 cents leaves room for a 2,000-token plan)
export const MAX_OUTPUT_TOKENS = 2000;
// A plan needs at least this much room to be written (REASONING TOKENS COUNT AS OUTPUT: max_output_tokens bounds
// reasoning + the answer together, so the worst case below includes them); less than this = refuse.
export const MIN_OUTPUT_TOKENS = 1200;
// Characters per token for the estimate (low = careful: more tokens than really sent).
const CHARS_PER_TOKEN = 3.5;

// (inputTokens = ALL input; cachedTokens = read from the cache; cacheWriteTokens = written to it, Claude only.)
export type Usage = { inputTokens: number; outputTokens: number; cachedTokens: number; cacheWriteTokens?: number };

export const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

export function costUsd(usage: Usage, searches = 0, prices: Prices = PRICES): number {
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  const written = Math.min(usage.cacheWriteTokens ?? 0, usage.inputTokens - cached);
  const cachedPrice = prices.cachedInputPerMillion ?? prices.inputPerMillion;
  const writePrice = prices.cacheWritePerMillion ?? prices.inputPerMillion;
  return ((usage.inputTokens - cached - written) * prices.inputPerMillion + cached * cachedPrice + written * writePrice + usage.outputTokens * prices.outputPerMillion) / 1_000_000 + searches * prices.perSearchUsd;
}

// THE PRE-SEND CHECK: the worst case of a call (all input at the full price + every output token it may write)
// must stay within `maxUsd`. Output room is cut down to what the money allows; if that leaves too little room to
// write a plan, the call is refused. (With web search on, one search fee is counted too; the pages a search reads
// add input tokens nobody can know before the call.)
export function budgetCall(instructions: string, input: string, maxUsd = DEFAULT_MAX_USD, wanted = MAX_OUTPUT_TOKENS, allowSearch = false, prices: Prices = PRICES) {
  const inputTokens = estimateTokens(instructions) + estimateTokens(input);
  const left = maxUsd - costUsd({ inputTokens, outputTokens: 0, cachedTokens: 0 }, allowSearch ? 1 : 0, prices);
  const maxOutputTokens = Math.max(0, Math.min(wanted, Math.floor((left * 1_000_000) / prices.outputPerMillion)));
  const worstUsd = costUsd({ inputTokens, outputTokens: maxOutputTokens, cachedTokens: 0 }, allowSearch ? 1 : 0, prices);
  return { inputTokens, maxOutputTokens, worstUsd, ok: maxOutputTokens >= MIN_OUTPUT_TOKENS };
}

type ResponseLike = {
  id?: string; model?: string; output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  output?: { type: string; action?: { type?: string; query?: string; queries?: string[] } }[];
};

// Usage recording: like generateAiAnimatorReply (dispatched + provider-observed events), only when the caller
// passes the project request it belongs to (the dev bench has none, so it records nothing).
export type TerraMeter = { recorder: UsageEventRecorder; request: AiAnimatorRequest };

export const createTerraProvider = (
  clientFactory: typeof getOpenAiClient = getOpenAiClient,
  meterFor: () => TerraMeter | null = () => null,
  reasoning: "low" | "medium" | "high" = "low",
  model: string = TERRA_MODEL,
  prices: Prices = PRICES,
): Provider => async ({ instructions, input, schema, maxOutputTokens, allowSearch, signal }) => {
  const meter = meterFor();
  const record = (event: Parameters<UsageEventRecorder>[0]) => { try { (meter?.recorder ?? noUsageEventRecorder)(event); } catch { /* Best-effort observation only. */ } };
  const client = clientFactory("terra-conversation");
  if (meter) record(projectDispatchedEvent(meter.request, Date.now(), model));
  const response = (await client.responses.create(
    {
      model,
      instructions,
      input,
      reasoning: { effort: reasoning },
      max_output_tokens: maxOutputTokens,
      // Terra searches only when it needs to (allowed per request).
      tools: allowSearch ? [{ type: "web_search", search_context_size: "low" }] : [],
      ...(allowSearch ? { tool_choice: "auto" as const } : {}),
      store: false,
      text: { format: { type: "json_schema", name: "diamond_animator_director_plan", strict: true, schema: schema as Record<string, unknown> }, verbosity: "low" },
    },
    signal ? { signal } : undefined,
  )) as unknown as ResponseLike;
  const usage: Usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    cachedTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
  const searches = (response.output ?? []).filter((o) => o.type === "web_search_call").flatMap((o) => o.action?.queries?.length ? o.action.queries : o.action?.query ? [o.action.query] : []);
  if (meter) {
    record(projectProviderObservedEvent(meter.request, {
      requestedModel: model, returnedModel: response.model ?? null, responseId: response.id ?? null, pricingVersion: PRICING_VERSION,
      usage: { inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null, totalTokens: response.usage?.total_tokens ?? null, estimatedCostUsd: costUsd(usage, searches.length, prices) },
    }));
  }
  // (The answer must come from the model asked for — the exact name, or that name with a dated version after it.)
  if (response.model !== model && !String(response.model ?? "").startsWith(`${model}-`)) throw new Error(`${model} answered from an unexpected model (${String(response.model)}).`);
  let json: unknown;
  try { json = JSON.parse(typeof response.output_text === "string" ? response.output_text : ""); } catch {
    throw Object.assign(new Error("Terra's answer was cut off or wasn't valid JSON."), { usage, searches });
  }
  return { json, usage, searches };
};

// The real one (the lead tests it; helpers never call it).
export const terraProvider: Provider = createTerraProvider();
// Luna: the same call with the same instructions and plan rules, only the model (and its price) differs.
export const lunaProvider: Provider = createTerraProvider(undefined, () => null, "low", LUNA_MODEL, LUNA_PRICES);
