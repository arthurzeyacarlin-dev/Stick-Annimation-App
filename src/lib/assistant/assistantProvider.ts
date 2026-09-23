import OpenAI from "openai";
import {
  ASSISTANT_LIMITS, ASSISTANT_MODEL, ASSISTANT_SEARCH_LIMITS, AssistantError, byteSize, insist, normalizeTitle, validateAnswer, validateProviderResult,
  type Answer, type AssistantRequest, type Citation, type ProviderResult, type SearchAction, type SearchReceipt,
} from "./assistantContracts.ts";
import { ASSISTANT_INSTRUCTIONS, ASSISTANT_SEARCH_INSTRUCTIONS, retrieveKnowledge } from "./assistantKnowledge.ts";
import { decideAssistantSearch, type SearchDecision } from "./assistantSearchPolicy.ts";
import type { AssistantProvider, AssistantProviderActivity, AssistantProviderOptions } from "./assistantJobService.ts";

export const ASSISTANT_PRICE = Object.freeze({ date: "2026-09-22", inputPerMillion: 2, outputPerMillion: 12, requestUsd: .15 });
export const ASSISTANT_SEARCH_PRICE = Object.freeze({ date: "2026-09-23", webSearchCallUsd: .01 });
type ResponseStream = AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
export type AssistantResponseRequest = OpenAI.Responses.ResponseCreateParamsStreaming & { max_tool_calls?: number };
export type AssistantResponsesClient = { create: (body: AssistantResponseRequest, options: { signal: AbortSignal }) => Promise<ResponseStream> };
export type AssistantClientFactory = (apiKey: string) => AssistantResponsesClient;

function clientFactory(apiKey: string): AssistantResponsesClient {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: ASSISTANT_LIMITS.deadlineMs });
  return { create: async (body, options) => client.responses.create(body as OpenAI.Responses.ResponseCreateParamsStreaming, options) };
}

export function providerInput(request: AssistantRequest) {
  const decision = decideAssistantSearch(request);
  const knowledge = retrieveKnowledge(request);
  const input = decision.mode === "required"
    ? JSON.stringify({ catalogVersion: request.catalogVersion, knowledge, publicQuestion: decision.publicQuery })
    : JSON.stringify({ catalogVersion: request.catalogVersion, knowledge, recentConversation: request.recentConversation.map(m => ({ role: m.role, text: m.text })), userTurn: request.message });
  const instructions = decision.mode === "required" ? ASSISTANT_SEARCH_INSTRUCTIONS : ASSISTANT_INSTRUCTIONS;
  const estimatedTokens = byteSize(input) + byteSize(instructions) + 512;
  insist(estimatedTokens <= ASSISTANT_LIMITS.inputTokens, "input", "This conversation is too large for one answer. Start a new chat with a shorter question.");
  return { input, instructions, estimatedTokens, decision };
}

export function buildAssistantResponseRequest(request: AssistantRequest) {
  const prepared = providerInput(request);
  const common = {
    model: ASSISTANT_MODEL,
    instructions: prepared.instructions,
    input: prepared.input,
    reasoning: { effort: request.reasoningLevel },
    max_output_tokens: ASSISTANT_LIMITS.outputTokens,
    store: false,
    stream: true as const,
    parallel_tool_calls: false,
    text: { format: { type: "json_schema" as const, name: "diamond_assistant_answer", strict: true, schema: { type: "object", properties: { answer: { type: "string" }, title: { type: "string" } }, required: ["answer", "title"], additionalProperties: false } } },
  };
  const body: AssistantResponseRequest = prepared.decision.mode === "required"
    ? { ...common, tools: [{ type: "web_search", search_context_size: "low" }], tool_choice: "required", max_tool_calls: ASSISTANT_SEARCH_LIMITS.toolCalls, include: ["web_search_call.action.sources"] }
    : { ...common, tools: [] };
  return { ...prepared, body };
}

function canonicalPublicUrl(raw: string) {
  let url: URL; try { url = new URL(raw); } catch { throw new AssistantError("output", "A search source URL was invalid. Your message is saved."); }
  const host = url.hostname.toLowerCase();
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)?.slice(1).map(Number);
  const privateIpv4 = !!ipv4 && (ipv4.some(octet => octet > 255) || ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 || (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127) || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168) || ipv4[0] >= 224);
  const privateHost = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa") || host.includes(":") || privateIpv4;
  insist(url.protocol === "https:" && !url.username && !url.password && !url.port && !privateHost && raw.length <= 2048, "output", "A private or unsupported search source was rejected. Your message is saved.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

function answerStringMap(raw: string) {
  const match = /"answer"\s*:\s*"/.exec(raw); insist(match, "output", "Terra returned an unreadable answer. Your message is saved.");
  const start = match.index + match[0].length; const boundaries = new Map<number, number>([[start, 0]]); let cursor = start; let decoded = "";
  while (cursor < raw.length) {
    if (raw[cursor] === '"') return { answer: decoded, start, end: cursor, boundaries };
    let length = 1; if (raw[cursor] === "\\") length = raw[cursor + 1] === "u" ? 6 : 2;
    insist(cursor + length <= raw.length, "output", "Terra returned an unreadable answer. Your message is saved.");
    let value: string; try { value = JSON.parse(`"${raw.slice(cursor, cursor + length)}"`); } catch { throw new AssistantError("output", "Terra returned an unreadable answer. Your message is saved."); }
    decoded += value; cursor += length; boundaries.set(cursor, decoded.length);
  }
  throw new AssistantError("output", "Terra returned an unreadable answer. Your message is saved.");
}

type TextEdit = { start: number; end: number; replacement: string };

/**
 * The provider owns facts; the app owns presentation. Remove source syntax and
 * lightweight Markdown that occasionally leaks through a structured response,
 * while retaining a monotonic boundary map for the verified citations.
 */
export function normalizeAssistantPresentation(text: string, citations: Citation[] = []): { text: string; citations: Citation[] } {
  const edits: TextEdit[] = [];
  const addMatches = (pattern: RegExp, replacement: string | ((match: string) => string)) => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index!; const end = start + match[0].length;
      if (edits.some(edit => start < edit.end && end > edit.start)) continue;
      edits.push({ start, end, replacement: typeof replacement === "function" ? replacement(match[0]) : replacement });
    }
  };
  // Sources are rendered in the dedicated Sources panel. Remove both ordinary
  // Markdown links and the common parenthesized-source form from answer prose.
  addMatches(/\(?\[[^\]\n]{1,200}\]\(https:\/\/[^\s)]+\)\)?/g, "");
  addMatches(/\(?https:\/\/[^\s)]+\)?/g, "");
  addMatches(/(?:\*\*|__|`)/g, "");
  addMatches(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
  addMatches(/^[ \t]*[-*][ \t]+/gm, () => "• ");
  edits.sort((a, b) => a.start - b.start || b.end - a.end);

  const boundaries = new Array<number>(text.length + 1).fill(0); let cursor = 0; let output = "";
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    while (cursor < edit.start) { boundaries[cursor] = output.length; output += text[cursor]; cursor++; boundaries[cursor] = output.length; }
    const before = output.length; for (let index = edit.start; index < edit.end; index++) boundaries[index] = before;
    output += edit.replacement; cursor = edit.end; boundaries[cursor] = output.length;
  }
  while (cursor < text.length) { boundaries[cursor] = output.length; output += text[cursor]; cursor++; boundaries[cursor] = output.length; }
  const cleaned = output.replace(/[ \t]+(?=\n)/g, "").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
  insist(cleaned.length >= 1, "output", "Terra returned an unreadable answer. Your message is saved.");

  // trim/whitespace normalization can shift a boundary by a few characters.
  // Citation links are rendered in the Sources panel; keep each verified source
  // attached to the nearest surviving answer character for persisted integrity.
  const mapped = citations.map(citation => {
    const approximate = boundaries[Math.min(text.length, citation.endIndex)] ?? cleaned.length;
    const endIndex = Math.max(1, Math.min(cleaned.length, approximate));
    return { ...citation, startIndex: endIndex - 1, endIndex };
  }).sort((a, b) => a.startIndex - b.startIndex || a.index - b.index);
  return { text: cleaned, citations: mapped };
}

type SearchActionRecord = { action: SearchAction; urls: string[]; consultedUrls: string[] };

function actionRecord(call: OpenAI.Responses.ResponseFunctionWebSearch): SearchActionRecord {
  const action = call.action;
  if (action.type === "search") {
    const queries = (action.queries?.length ? action.queries : [action.query]).filter(Boolean);
    insist(queries.length >= 1 && queries.length <= ASSISTANT_SEARCH_LIMITS.processedSources && queries.reduce((total, query) => total + Array.from(query).length, 0) <= ASSISTANT_SEARCH_LIMITS.queryChars, "output", "The web search exceeded its query limit. Your message is saved.");
    const consultedUrls = (action.sources ?? []).map(source => canonicalPublicUrl(source.url));
    return { action: { type: "search", queries }, urls: consultedUrls, consultedUrls };
  }
  if (action.type === "open_page") {
    insist(action.url, "output", "The web search opened an unverified page. Your message is saved.");
    const url = canonicalPublicUrl(action.url); return { action: { type: "open_page", url }, urls: [url], consultedUrls: [] };
  }
  const url = canonicalPublicUrl(action.url); insist(action.pattern.length <= 256, "output", "The web search exceeded its find limit. Your message is saved.");
  return { action: { type: "find_in_page", url, pattern: action.pattern }, urls: [url], consultedUrls: [] };
}

function consultedSourceTitle(url: string) {
  const title = new URL(url).hostname.replace(/^www\./, "");
  insist(title.length >= 1 && Array.from(title).length <= 200, "output", "A search source title was invalid. Your message is saved.");
  return title;
}

function searchResult(final: OpenAI.Responses.Response, raw: string, annotations: OpenAI.Responses.ResponseOutputText.URLCitation[], decision: Extract<SearchDecision, { mode: "required" }>): { answer: Answer; search: SearchReceipt } {
  const calls = final.output.filter((item): item is OpenAI.Responses.ResponseFunctionWebSearch => item.type === "web_search_call");
  insist(calls.length >= 1 && calls.length <= ASSISTANT_SEARCH_LIMITS.toolCalls && calls.every(call => call.status === "completed"), "output", "Current public information could not be verified. Your message is saved.");
  const actionRecords = calls.map(actionRecord); const actualUrls = new Set(actionRecords.flatMap(record => record.urls));
  insist(actualUrls.size >= 1, "output", "Current public information could not be verified. Your message is saved.");
  const mapping = answerStringMap(raw); let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new AssistantError("output", "Terra returned an unreadable answer. Your message is saved."); }
  validateAnswer(parsed); const parsedAnswer = parsed as Answer; insist(parsedAnswer.answer === mapping.answer, "output", "Search annotations did not match the answer. Your message is saved.");
  const sourceIndex = new Map<string, number>(); const sourceTitles = new Map<string, string>(); const citations: Citation[] = [];
  if (annotations.length) {
    for (const annotation of annotations.sort((a, b) => a.start_index - b.start_index || a.end_index - b.end_index)) {
      const url = canonicalPublicUrl(annotation.url); insist(actualUrls.has(url), "output", "A forged search citation was rejected. Your message is saved.");
      const startIndex = mapping.boundaries.get(annotation.start_index); const endIndex = mapping.boundaries.get(annotation.end_index);
      insist(startIndex !== undefined && endIndex !== undefined && annotation.start_index >= mapping.start && annotation.end_index <= mapping.end && endIndex > startIndex, "output", "Search citations did not align with the answer. Your message is saved.");
      const title = normalizeTitle(annotation.title); insist(title.length >= 1 && Array.from(title).length <= 200, "output", "A search source title was invalid. Your message is saved.");
      if (!sourceIndex.has(url)) {
        // Extra provider candidates are not a user error. Keep the first bounded
        // set of verified sources and ignore additional display-only citations.
        if (sourceIndex.size >= ASSISTANT_SEARCH_LIMITS.displayedSources) continue;
        sourceIndex.set(url, sourceIndex.size + 1); sourceTitles.set(url, title);
      }
      citations.push({ index: sourceIndex.get(url)!, title: sourceTitles.get(url)!, url, startIndex, endIndex });
    }
  } else {
    // OpenAI documents action.sources as the complete URL set consulted while
    // forming the answer. If native inline annotations are entirely absent,
    // recover only from that provider-owned metadata. Neutral host labels avoid
    // inventing page titles, and the whole-answer range makes the weaker
    // answer-level association explicit. Any present annotation still takes the
    // strict range/title/provenance path above and cannot use this recovery.
    const consultedUrls = [...new Set(actionRecords.flatMap(record => record.consultedUrls))];
    insist(consultedUrls.length >= 1, "output", "Current public information was returned without verifiable citations. Your message is saved.");
    for (const url of consultedUrls.slice(0, ASSISTANT_SEARCH_LIMITS.displayedSources)) {
      const title = consultedSourceTitle(url); const index = sourceIndex.size + 1;
      sourceIndex.set(url, index); sourceTitles.set(url, title);
      citations.push({ index, title, url, startIndex: 0, endIndex: parsedAnswer.answer.length });
    }
  }
  insist(citations.length >= 1, "output", "Current public information was returned without verifiable citations. Your message is saved.");
  insist(!/\b(?:i|we)\s+(?:watched|viewed|listened to|downloaded|inspected)\b/i.test(parsedAnswer.answer), "output", "An unsupported media-viewing claim was rejected. Your message is saved.");
  const sources = [...sourceIndex.entries()].sort((a, b) => a[1] - b[1]).map(([url]) => ({ title: sourceTitles.get(url)!, url }));
  const processedUrls = new Set(sources.map(source => source.url));
  for (const url of actualUrls) { if (processedUrls.size >= ASSISTANT_SEARCH_LIMITS.processedSources) break; processedUrls.add(url); }
  const presentation = normalizeAssistantPresentation(parsedAnswer.answer, citations);
  return { answer: { answer: presentation.text, title: parsedAnswer.title, citations: presentation.citations }, search: { topic: decision.topic, toolCalls: calls.length, processedSourceCount: processedUrls.size, actions: actionRecords.map(record => record.action), sources } };
}

function emit(options: AssistantProviderOptions, activity: AssistantProviderActivity) { options.onActivity?.(activity); }

export function createAssistantProvider(factory: AssistantClientFactory = clientFactory, searchDeadlineMs: number = ASSISTANT_SEARCH_LIMITS.deadlineMs): AssistantProvider {
  return async (request, options): Promise<ProviderResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AssistantError("configuration", "Terra is not configured on this review server. Your message is saved.");
    const prepared = buildAssistantResponseRequest(request); if (options.signal.aborted) throw new AssistantError("cancelled", "Cancelled");
    const maximumToolCost = prepared.decision.mode === "required" ? ASSISTANT_SEARCH_LIMITS.toolCalls * ASSISTANT_SEARCH_PRICE.webSearchCallUsd : 0;
    const maximumCostUsd = (prepared.estimatedTokens * ASSISTANT_PRICE.inputPerMillion + ASSISTANT_LIMITS.outputTokens * ASSISTANT_PRICE.outputPerMillion) / 1000000 + maximumToolCost;
    insist(maximumCostUsd <= ASSISTANT_PRICE.requestUsd, "input", "This answer exceeds the per-request cost limit. Shorten your question or start a new chat.");
    const started = performance.now(); const client = factory(apiKey); const searchAbort = new AbortController();
    const signal = AbortSignal.any([options.signal, searchAbort.signal]); let searchTimer: ReturnType<typeof setTimeout> | null = null; let activeSearchId: string | null = null; let final: OpenAI.Responses.Response | null = null;
    const completedSearchIds = new Set<string>();
    const startSearch = (id: string) => {
      if (completedSearchIds.has(id) || activeSearchId === id) return;
      insist(activeSearchId === null, "output", "Terra returned an overlapping search lifecycle. Your message is saved.");
      activeSearchId = id; emit(options, { type: "search-start", topic: prepared.decision.mode === "required" ? prepared.decision.topic : "current public information" });
      searchTimer = setTimeout(() => searchAbort.abort("search-timeout"), searchDeadlineMs);
    };
    const endSearch = (id: string) => {
      if (completedSearchIds.has(id)) return;
      completedSearchIds.add(id);
      if (activeSearchId !== id) return;
      activeSearchId = null; if (searchTimer) clearTimeout(searchTimer); searchTimer = null; emit(options, { type: "search-end" });
    };
    const endActiveSearch = () => { if (activeSearchId) endSearch(activeSearchId); };
    try {
      const stream = await client.create(prepared.body, { signal });
      for await (const event of stream) {
        if (prepared.decision.mode === "required" && event.type === "response.output_item.added" && event.item.type === "web_search_call") startSearch(event.item.id);
        else if (prepared.decision.mode === "required" && (event.type === "response.web_search_call.in_progress" || event.type === "response.web_search_call.searching")) startSearch(event.item_id);
        else if (event.type === "response.web_search_call.completed") endSearch(event.item_id);
        if (event.type === "response.completed") final = event.response;
        if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") throw new AssistantError("output", "Terra could not finish a complete answer. Your message is saved.");
      }
    } catch (error) {
      if (searchAbort.signal.aborted && !options.signal.aborted) throw new AssistantError("search", "Current public information could not be verified before the search deadline. Your message is saved.");
      if (!options.signal.aborted && error instanceof Error && (error instanceof TypeError || /^(?:APIConnectionError|APIConnectionTimeoutError)$/.test(error.name))) {
        throw new AssistantError("network", prepared.decision.mode === "required"
          ? "Could not reach web search. Check your internet connection. Your question is saved; no current answer was published. Reconnect, then choose Retry."
          : "Terra could not connect. Your question is saved; no answer was published. Reconnect, then choose Retry.");
      }
      throw error;
    } finally { if (searchTimer) clearTimeout(searchTimer); }
    insist(final && final.status === "completed" && final.model === ASSISTANT_MODEL && final.usage, "output", "Terra returned an incomplete or unexpected response. Your message is saved.");
    endActiveSearch();
    insist(final.output.every(item => item.type === "message" || item.type === "reasoning" || item.type === "web_search_call"), "output", "An unexpected tool response was rejected. Your message is saved.");
    const textParts = final.output.filter(item => item.type === "message").flatMap(item => item.content).filter((part): part is OpenAI.Responses.ResponseOutputText => part.type === "output_text");
    const raw = textParts.map(part => part.text).join(""); let reply: Answer; let search: SearchReceipt | undefined;
    if (prepared.decision.mode === "required") {
      let offset = 0; const annotations: OpenAI.Responses.ResponseOutputText.URLCitation[] = [];
      for (const part of textParts) { for (const annotation of part.annotations ?? []) if (annotation.type === "url_citation") annotations.push({ ...annotation, start_index: annotation.start_index + offset, end_index: annotation.end_index + offset }); offset += part.text.length; }
      ({ answer: reply, search } = searchResult(final, raw, annotations, prepared.decision));
    } else {
      insist(final.output.every(item => item.type !== "web_search_call") && textParts.every(part => (part.annotations ?? []).length === 0), "output", "An unexpected search response was rejected. Your message is saved.");
      try { reply = JSON.parse(raw); } catch { throw new AssistantError("output", "Terra returned an unreadable answer. Your message is saved."); }
      validateAnswer(reply); insist(!("citations" in reply));
      const presentation = normalizeAssistantPresentation(reply.answer);
      reply = { answer: presentation.text, title: reply.title };
    }
    const toolCalls = search?.toolCalls ?? 0;
    const usage = { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, totalTokens: final.usage.total_tokens, estimatedCostUsd: (final.usage.input_tokens * 2 + final.usage.output_tokens * 12) / 1000000 + toolCalls * ASSISTANT_SEARCH_PRICE.webSearchCallUsd, priceDate: toolCalls ? ASSISTANT_SEARCH_PRICE.date : ASSISTANT_PRICE.date, responseId: final.id, latencyMs: Math.round(performance.now() - started), model: ASSISTANT_MODEL, reasoning: request.reasoningLevel, toolCalls } as const;
    const result: ProviderResult = search ? { reply, usage, search } : { reply, usage }; validateProviderResult(result); return result;
  };
}

export const generateAssistantReply = createAssistantProvider();
