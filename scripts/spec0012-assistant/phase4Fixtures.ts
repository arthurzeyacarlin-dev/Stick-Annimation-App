import type OpenAI from "openai";
import { ASSISTANT_MODEL, type AssistantRequest, type ProviderResult } from "../../src/lib/assistant/assistantContracts.ts";
import { fixtureRequest } from "./phase2Fixtures.ts";

export const youtubePrompt = "As of today, what are YouTube Shorts’ current maximum video length and recommended vertical upload specifications, and which Diamond Animator export settings should I use to match them?";
export const youtubeAnswer = "As of today, YouTube Shorts can be up to 3 minutes long. Use a vertical 9:16 upload, ideally 1080 × 1920 pixels. In Diamond Animator, save first, open Export, choose YouTube Shorts, select 1080p, and export the local MP4; the app does not upload it for you.";
export const youtubeTitle = "YouTube Shorts export settings";
export const youtubeSource = "https://support.google.com/youtube/answer/15424877";
export const youtubeSourceTitle = "Understand three-minute YouTube Shorts";

export function searchRequest(overrides: Partial<AssistantRequest> = {}) { return fixtureRequest({ message: youtubePrompt, ...overrides }); }

export function searchProviderResult(request: AssistantRequest): ProviderResult {
  const firstEnd = youtubeAnswer.indexOf(". Use") + 1; const secondEnd = youtubeAnswer.indexOf(". In") + 1;
  const citations = [
    { index: 1, title: youtubeSourceTitle, url: youtubeSource, startIndex: 0, endIndex: firstEnd },
    { index: 1, title: youtubeSourceTitle, url: youtubeSource, startIndex: firstEnd + 1, endIndex: secondEnd },
  ];
  return {
    reply: { answer: youtubeAnswer, title: youtubeTitle, citations },
    usage: { inputTokens: 500, outputTokens: 250, totalTokens: 750, estimatedCostUsd: .014, priceDate: "2026-09-23", responseId: `search_${request.jobId}`, latencyMs: 120, model: ASSISTANT_MODEL, reasoning: request.reasoningLevel, toolCalls: 1 },
    search: { topic: "current YouTube Shorts requirements", toolCalls: 1, processedSourceCount: 1, actions: [{ type: "search", queries: ["current YouTube Shorts maximum length vertical upload specifications"] }], sources: [{ title: youtubeSourceTitle, url: youtubeSource }] },
  };
}

export function responseFixture(options: { sourceUrl?: string; title?: string; answer?: string; annotations?: boolean; webCalls?: number; actionSourceUrls?: string[] } = {}) {
  const answer = options.answer ?? youtubeAnswer; const title = options.title ?? youtubeTitle; const sourceUrl = options.sourceUrl ?? youtubeSource; const raw = JSON.stringify({ answer, title });
  const answerStart = raw.indexOf(answer); const firstEnd = answer.indexOf(". Use") >= 0 ? answer.indexOf(". Use") + 1 : answer.length;
  const annotations = options.annotations === false ? [] : [{ type: "url_citation" as const, start_index: answerStart, end_index: answerStart + firstEnd, title: youtubeSourceTitle, url: sourceUrl }];
  const calls = Array.from({ length: options.webCalls ?? 1 }, (_, index) => ({ id: `search_call_${index}`, type: "web_search_call" as const, status: "completed" as const, action: { type: "search" as const, query: "current YouTube Shorts requirements", queries: ["current YouTube Shorts requirements"], sources: (options.actionSourceUrls ?? [youtubeSource]).map(url => ({ type: "url" as const, url })) } }));
  const response = {
    id: "response_fixture_phase4", object: "response", created_at: 1, status: "completed", model: ASSISTANT_MODEL,
    output: [...calls, { id: "message_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: raw, annotations }] }],
    usage: { input_tokens: 500, input_tokens_details: { cached_tokens: 0 }, output_tokens: 250, output_tokens_details: { reasoning_tokens: 25 }, total_tokens: 750 },
  } as unknown as OpenAI.Responses.Response;
  return { raw, response };
}
