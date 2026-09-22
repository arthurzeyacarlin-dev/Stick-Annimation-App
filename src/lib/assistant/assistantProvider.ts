import OpenAI from "openai";
import { ASSISTANT_LIMITS, ASSISTANT_MODEL, AssistantError, byteSize, insist, validateAnswer, validateUsage, type AssistantRequest, type ProviderResult } from "./assistantContracts.ts";
import { ASSISTANT_INSTRUCTIONS, retrieveKnowledge } from "./assistantKnowledge.ts";
import type { AssistantProvider } from "./assistantJobService.ts";

export const ASSISTANT_PRICE = Object.freeze({ date: "2026-09-22", inputPerMillion: 2, outputPerMillion: 12, requestUsd: .15 });
export function providerInput(request: AssistantRequest) {
  const input = JSON.stringify({ catalogVersion: request.catalogVersion, knowledge: retrieveKnowledge(request), recentConversation: request.recentConversation.map(m => ({ role: m.role, text: m.text })), userTurn: request.message });
  // One token per UTF-8 byte is a deliberately conservative upper estimate, including instructions/JSON.
  const estimatedTokens = byteSize(input) + byteSize(ASSISTANT_INSTRUCTIONS) + 512;
  insist(estimatedTokens <= ASSISTANT_LIMITS.inputTokens, "input", "This conversation is too large for one answer. Start a new chat with a shorter question.");
  return { input, estimatedTokens };
}
export const generateAssistantReply: AssistantProvider = async (request, options): Promise<ProviderResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AssistantError("configuration", "Terra is not configured on this review server. Your message is saved.");
  const { input, estimatedTokens } = providerInput(request);
  if (options.signal.aborted) throw new AssistantError("cancelled", "Cancelled");
  const maximumCostUsd = (estimatedTokens * ASSISTANT_PRICE.inputPerMillion + ASSISTANT_LIMITS.outputTokens * ASSISTANT_PRICE.outputPerMillion) / 1000000;
  insist(maximumCostUsd <= ASSISTANT_PRICE.requestUsd, "input", "This answer exceeds the per-request cost limit. Shorten your question or start a new chat.");
  const started = performance.now(); const client = new OpenAI({ apiKey, maxRetries: 0, timeout: ASSISTANT_LIMITS.deadlineMs });
  const stream = await client.responses.create({
    model: ASSISTANT_MODEL, instructions: ASSISTANT_INSTRUCTIONS, input,
    reasoning: { effort: request.reasoningLevel }, max_output_tokens: ASSISTANT_LIMITS.outputTokens,
    tools: [], store: false, stream: true,
    text: { format: { type: "json_schema", name: "diamond_assistant_answer", strict: true, schema: { type: "object", properties: { answer: { type: "string" }, title: { type: "string" } }, required: ["answer", "title"], additionalProperties: false } } },
  }, { signal: options.signal });
  let final: OpenAI.Responses.Response | null = null;
  for await (const event of stream) {
    if (event.type === "response.completed") final = event.response;
    if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") throw new AssistantError("output", "Terra could not finish a complete answer. Your message is saved.");
  }
  insist(final && final.status === "completed" && final.model === ASSISTANT_MODEL && final.usage, "output", "Terra returned an incomplete or unexpected response. Your message is saved.");
  insist(final.output.every(item => item.type === "message" || item.type === "reasoning"), "output", "An unexpected tool response was rejected. Your message is saved.");
  const raw = final.output.filter(item => item.type === "message").flatMap(item => item.content).map(part => part.type === "output_text" ? part.text : "").join("");
  let reply: unknown; try { reply = JSON.parse(raw); } catch { throw new AssistantError("output", "Terra returned an unreadable answer. Your message is saved."); }
  validateAnswer(reply);
  const usage = { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, totalTokens: final.usage.total_tokens, estimatedCostUsd: (final.usage.input_tokens * 2 + final.usage.output_tokens * 12) / 1000000, priceDate: "2026-09-22" as const, responseId: final.id, latencyMs: Math.round(performance.now() - started), model: ASSISTANT_MODEL, reasoning: request.reasoningLevel, toolCalls: 0 as const };
  validateUsage(usage); return { reply, usage };
};
