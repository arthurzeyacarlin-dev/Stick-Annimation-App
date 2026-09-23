/** Assistant-only data. No workspace identifiers, commands, or project payloads. */
export const ASSISTANT_MODEL = "gpt-5.6-terra";
export const CATALOG_VERSION = "diamond-animator-knowledge/v1:2026-09-22";
export const ASSISTANT_LIMITS = Object.freeze({ sessions: 50, messages: 200, userChars: 12000, answerChars: 16000, sessionBytes: 1024 * 1024, databaseBytes: 32 * 1024 * 1024, contextMessages: 32, contextChars: 48000, inputTokens: 24000, outputTokens: 4000, deadlineMs: 55000, activeJobs: 2, replyReserveBytes: 68000 });
export const ASSISTANT_SEARCH_LIMITS = Object.freeze({ deadlineMs: 30000, toolCalls: 2, processedSources: 8, displayedSources: 6, queryChars: 512 });
export const REASONING = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra High" } as const;
export type Reasoning = keyof typeof REASONING;
export type Citation = { index: number; title: string; url: string; startIndex: number; endIndex: number };
export type SearchAction = { type: "search"; queries: string[] } | { type: "open_page"; url: string } | { type: "find_in_page"; url: string; pattern: string };
export type SearchSource = { title: string; url: string };
export type SearchReceipt = { topic: string; toolCalls: number; processedSourceCount: number; actions: SearchAction[]; sources: SearchSource[] };
export type Message = { id: string; turnId: string; role: "user" | "assistant"; text: string; at: number; citations?: Citation[] };
export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number; priceDate: "2026-09-22" | "2026-09-23"; responseId: string; latencyMs: number; model: typeof ASSISTANT_MODEL; reasoning: Reasoning; toolCalls: number };
export type PriorAttempt = { jobId: string; status: "failed" | "cancelled" | "interrupted"; endedAt: number; error: string };
export type Turn = { id: string; jobId: string; status: "pending" | "done" | "failed" | "cancelled" | "interrupted"; reasoning: Reasoning; at: number; acceptedAt: number | null; endedAt: number | null; contextIds: string[]; error: string | null; usage: Usage | null; search?: SearchReceipt; priorAttempts?: PriorAttempt[] };
export type Session = { schema: "diamond-assistant-session/v1"; id: string; title: string; titleSource: "automatic" | "manual"; manualTitleRevision: number; createdAt: number; updatedAt: number; reasoning: Reasoning; revision: number; digest: string; messages: Message[]; turns: Turn[] };
export type AssistantRequest = { schema: "diamond-assistant-request/v1"; jobId: string; sessionId: string; turnId: string; message: string; reasoningLevel: Reasoning; recentConversation: Message[]; catalogVersion: typeof CATALOG_VERSION; clientSessionRevision: number };
export type Answer = { answer: string; title: string; citations?: Citation[] };
export type ProviderResult = { reply: Answer; usage: Usage; search?: SearchReceipt };
export type JobStatus = "thinking" | "searching" | "finalizing" | "done" | "failed" | "cancelled";
export type JobEvent = { sequence: number; at: number; status: JobStatus; topic?: string };
export type JobSnapshot = { schema: "diamond-assistant-job/v1"; jobId: string; sessionId: string; turnId: string; reasoning: Reasoning; catalogVersion: typeof CATALOG_VERSION; status: JobStatus; events: JobEvent[]; result: ProviderResult | null; error: string | null };

export class AssistantError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "AssistantError"; this.code = code; }
}
export function insist(value: unknown, code = "invalid", message = "This chat record is invalid. It has been preserved; unsafe changes are blocked."): asserts value {
  if (!value) throw new AssistantError(code, message);
}
export const exactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
export const isId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
export const isReasoning = (value: unknown): value is Reasoning => typeof value === "string" && Object.hasOwn(REASONING, value);
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const normalizeText = (text: string) => text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
export function normalizeTitle(value: string) { return normalizeText(value).replace(/\s+/g, " "); }
const validText = (v: unknown, max: number): v is string => typeof v === "string" && v.isWellFormed() && v.length > 0 && v.length <= max && normalizeText(v) === v;
const validTitle = (v: unknown): v is string => typeof v === "string" && v.isWellFormed() && Array.from(v).length >= 1 && Array.from(v).length <= 80 && normalizeTitle(v) === v;
const validSourceTitle = (v: unknown): v is string => typeof v === "string" && v.isWellFormed() && Array.from(v).length >= 1 && Array.from(v).length <= 200 && normalizeTitle(v) === v;
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const byteSize = (value: unknown) => new TextEncoder().encode(stableJson(value)).byteLength;
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}
export async function sealSession(session: Session): Promise<Session> {
  const { digest: _old, ...body } = session; void _old;
  return { ...body, digest: await digest(body) };
}
export function validateMessage(value: unknown): asserts value is Message {
  insist(exactKeys(value, ["id", "turnId", "role", "text", "at"]) || exactKeys(value, ["id", "turnId", "role", "text", "at", "citations"]));
  insist(isId(value.id) && isId(value.turnId) && integer(value.at, 1));
  insist((value.role === "user" || value.role === "assistant") && validText(value.text, value.role === "user" ? ASSISTANT_LIMITS.userChars : ASSISTANT_LIMITS.answerChars));
  if ("citations" in value) { insist(value.role === "assistant"); validateCitations(value.citations, value.text); }
}
export function validateUsage(value: unknown): asserts value is Usage {
  insist(exactKeys(value, ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd", "priceDate", "responseId", "latencyMs", "model", "reasoning", "toolCalls"]));
  insist(integer(value.inputTokens, 0, ASSISTANT_LIMITS.inputTokens) && integer(value.outputTokens, 0, ASSISTANT_LIMITS.outputTokens) && value.totalTokens === value.inputTokens + value.outputTokens);
  insist(integer(value.toolCalls, 0, ASSISTANT_SEARCH_LIMITS.toolCalls));
  const expectedCost = (value.inputTokens * 2 + value.outputTokens * 12) / 1000000 + (value.priceDate === "2026-09-23" ? value.toolCalls * .01 : 0);
  insist(typeof value.estimatedCostUsd === "number" && Math.abs(value.estimatedCostUsd - expectedCost) < 1e-12 && value.estimatedCostUsd <= .15);
  insist((value.priceDate === "2026-09-22" ? value.toolCalls === 0 : value.priceDate === "2026-09-23") && isId(value.responseId) && integer(value.latencyMs, 0, 120000) && value.model === ASSISTANT_MODEL && isReasoning(value.reasoning));
}
export function validateAnswer(value: unknown): asserts value is Answer {
  insist(exactKeys(value, ["answer", "title"]) || exactKeys(value, ["answer", "title", "citations"]), "output", "Terra returned an invalid answer. Your message is saved.");
  insist(validText(value.answer, ASSISTANT_LIMITS.answerChars) && validTitle(value.title), "output", "Terra returned an invalid answer. Your message is saved.");
  if ("citations" in value) validateCitations(value.citations, value.answer);
}
function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port; } catch { return false; }
}
export function validateCitations(value: unknown, text: string): asserts value is Citation[] {
  insist(Array.isArray(value) && value.length >= 1 && value.length <= 32, "output", "Search citations could not be verified. Your message is saved.");
  const sourceIndexes = new Map<string, number>(); let priorStart = 0;
  for (let i = 0; i < value.length; i++) {
    const citation = value[i]; insist(exactKeys(citation, ["index", "title", "url", "startIndex", "endIndex"]));
    insist(integer(citation.index, 1, ASSISTANT_SEARCH_LIMITS.displayedSources) && validSourceTitle(citation.title) && validHttpsUrl(citation.url));
    insist(integer(citation.startIndex, 0, text.length - 1) && integer(citation.endIndex, citation.startIndex + 1, text.length) && citation.startIndex >= priorStart);
    const priorIndex = sourceIndexes.get(citation.url); insist(priorIndex === undefined || priorIndex === citation.index);
    sourceIndexes.set(citation.url, citation.index); insist(sourceIndexes.size <= ASSISTANT_SEARCH_LIMITS.displayedSources); priorStart = citation.startIndex;
  }
}
export function validateSearchReceipt(value: unknown): asserts value is SearchReceipt {
  insist(exactKeys(value, ["topic", "toolCalls", "processedSourceCount", "actions", "sources"]));
  insist(validText(value.topic, 120) && integer(value.toolCalls, 1, ASSISTANT_SEARCH_LIMITS.toolCalls) && integer(value.processedSourceCount, 1, ASSISTANT_SEARCH_LIMITS.processedSources));
  insist(Array.isArray(value.actions) && value.actions.length === value.toolCalls && Array.isArray(value.sources) && value.sources.length >= 1 && value.sources.length <= ASSISTANT_SEARCH_LIMITS.displayedSources);
  for (const action of value.actions) {
    insist(action && typeof action === "object");
    if (action.type === "search") {
      insist(exactKeys(action, ["type", "queries"]) && Array.isArray(action.queries) && action.queries.length >= 1 && action.queries.length <= ASSISTANT_SEARCH_LIMITS.processedSources);
      let queryChars = 0; for (const query of action.queries) { insist(validText(query, ASSISTANT_SEARCH_LIMITS.queryChars)); queryChars += Array.from(query).length; } insist(queryChars <= ASSISTANT_SEARCH_LIMITS.queryChars);
    }
    else if (action.type === "open_page") insist(exactKeys(action, ["type", "url"]) && validHttpsUrl(action.url));
    else if (action.type === "find_in_page") insist(exactKeys(action, ["type", "url", "pattern"]) && validHttpsUrl(action.url) && validText(action.pattern, 256));
    else insist(false);
  }
  const urls = new Set<string>(); for (const source of value.sources) { insist(exactKeys(source, ["title", "url"]) && validSourceTitle(source.title) && validHttpsUrl(source.url) && !urls.has(source.url)); urls.add(source.url); }
}
export function validateProviderResult(value: unknown): asserts value is ProviderResult {
  insist(exactKeys(value, ["reply", "usage"]) || exactKeys(value, ["reply", "usage", "search"]));
  validateAnswer(value.reply); validateUsage(value.usage);
  if ("search" in value) { validateSearchReceipt(value.search); insist(value.usage.toolCalls === value.search.toolCalls && "citations" in value.reply); }
  else insist(value.usage.toolCalls === 0 && !("citations" in value.reply));
}
export async function validateSession(value: unknown): Promise<Session> {
  insist(exactKeys(value, ["schema", "id", "title", "titleSource", "manualTitleRevision", "createdAt", "updatedAt", "reasoning", "revision", "digest", "messages", "turns"]));
  insist(value.schema === "diamond-assistant-session/v1" && isId(value.id) && validTitle(value.title));
  insist((value.titleSource === "manual" || value.titleSource === "automatic") && integer(value.revision, 1) && integer(value.manualTitleRevision, 0, value.revision));
  insist(value.titleSource === "manual" ? value.manualTitleRevision > 0 : value.manualTitleRevision === 0);
  insist(integer(value.createdAt, 1) && integer(value.updatedAt, value.createdAt) && isReasoning(value.reasoning));
  insist(typeof value.digest === "string" && /^[0-9a-f]{64}$/.test(value.digest));
  insist(Array.isArray(value.messages) && value.messages.length >= 1 && value.messages.length <= ASSISTANT_LIMITS.messages && Array.isArray(value.turns) && value.turns.length >= 1 && value.turns.length <= ASSISTANT_LIMITS.messages);
  const session = value as unknown as Session;
  const ids = new Set<string>(); const jobIds = new Set<string>();
  let cursor = 0; let pending = 0; let previousAt = session.createdAt;
  for (const turn of session.turns) {
    const basicKeys = ["id", "jobId", "status", "reasoning", "at", "acceptedAt", "endedAt", "contextIds", "error", "usage"];
    insist(exactKeys(turn, basicKeys) || exactKeys(turn, [...basicKeys, "search"]) || exactKeys(turn, [...basicKeys, "priorAttempts"]) || exactKeys(turn, [...basicKeys, "search", "priorAttempts"]));
    insist(isId(turn.id) && isId(turn.jobId) && !ids.has(turn.id) && !jobIds.has(turn.jobId) && isReasoning(turn.reasoning));
    ids.add(turn.id); jobIds.add(turn.jobId);
    if (turn.priorAttempts) {
      insist(Array.isArray(turn.priorAttempts) && turn.priorAttempts.length >= 1 && turn.priorAttempts.length <= 10);
      for (const attempt of turn.priorAttempts) {
        insist(exactKeys(attempt, ["jobId", "status", "endedAt", "error"]) && isId(attempt.jobId) && !jobIds.has(attempt.jobId));
        insist(["failed", "cancelled", "interrupted"].includes(attempt.status) && integer(attempt.endedAt, session.createdAt, turn.at) && validText(attempt.error, 240));
        jobIds.add(attempt.jobId);
      }
    }
    insist(integer(turn.at, previousAt, session.updatedAt)); previousAt = turn.at;
    insist(turn.acceptedAt === null || integer(turn.acceptedAt, turn.at, session.updatedAt));
    insist(["pending", "done", "failed", "cancelled", "interrupted"].includes(turn.status));
    const before = session.messages.slice(0, cursor);
    insist(Array.isArray(turn.contextIds) && turn.contextIds.length <= ASSISTANT_LIMITS.contextMessages && new Set(turn.contextIds).size === turn.contextIds.length);
    insist(stableJson(turn.contextIds) === stableJson(before.slice(before.length - turn.contextIds.length).map(m => m.id)));
    const user = session.messages[cursor++]; validateMessage(user);
    insist(user.role === "user" && user.turnId === turn.id && user.at === turn.at);
    if (turn.status === "pending") { pending++; insist(turn === session.turns.at(-1) && turn.endedAt === null && turn.error === null && turn.usage === null); }
    else { insist(integer(turn.endedAt, turn.at, session.updatedAt)); previousAt = turn.endedAt; }
    if (turn.status === "done") {
      const assistant = session.messages[cursor++]; validateMessage(assistant);
      insist(assistant.role === "assistant" && assistant.turnId === turn.id && assistant.at === turn.endedAt && turn.error === null);
      validateUsage(turn.usage); insist(turn.usage.reasoning === turn.reasoning);
      if ("search" in turn) { validateSearchReceipt(turn.search); insist(turn.usage.toolCalls === turn.search.toolCalls && !!assistant.citations); }
      else insist(turn.usage.toolCalls === 0 && !assistant.citations);
    } else if (turn.status !== "pending") { insist(validText(turn.error, 240) && turn.usage === null); }
  }
  insist(cursor === session.messages.length && pending <= 1 && new Set(session.messages.map(m => m.id)).size === session.messages.length);
  insist(session.messages.length + pending <= ASSISTANT_LIMITS.messages);
  insist(byteSize(session) + pending * ASSISTANT_LIMITS.replyReserveBytes <= ASSISTANT_LIMITS.sessionBytes, "size", "This chat is full. Start a new chat to continue.");
  const { digest: savedDigest, ...body } = session;
  insist(await digest(body) === savedDigest, "corrupt", "A saved chat failed its integrity check. Its bytes are preserved; changes are blocked.");
  return session;
}
export function recentContext(messages: Message[]): Message[] {
  let chars = 0; let start = messages.length;
  while (start > 0 && messages.length - start < ASSISTANT_LIMITS.contextMessages) {
    const candidate = messages[start - 1];
    if (chars + candidate.text.length > ASSISTANT_LIMITS.contextChars) break;
    chars += candidate.text.length; start--;
  }
  // Never send an orphaned answer at the left edge of the contiguous suffix.
  if (messages[start]?.role === "assistant") start++;
  return messages.slice(start);
}
export function validateRequest(value: unknown): AssistantRequest {
  insist(exactKeys(value, ["schema", "jobId", "sessionId", "turnId", "message", "reasoningLevel", "recentConversation", "catalogVersion", "clientSessionRevision"]));
  insist(value.schema === "diamond-assistant-request/v1" && isId(value.jobId) && isId(value.sessionId) && isId(value.turnId) && isReasoning(value.reasoningLevel) && value.catalogVersion === CATALOG_VERSION && integer(value.clientSessionRevision, 1));
  insist(validText(value.message, ASSISTANT_LIMITS.userChars) && Array.isArray(value.recentConversation) && value.recentConversation.length <= ASSISTANT_LIMITS.contextMessages);
  let chars = 0; const ids = new Set<string>(); const turns = new Set<string>(); let previous: Message | undefined;
  for (const message of value.recentConversation) {
    validateMessage(message); insist(!ids.has(message.id) && message.turnId !== value.turnId && (!previous || message.at >= previous.at));
    if (message.role === "user") { insist(!turns.has(message.turnId)); turns.add(message.turnId); }
    else insist(previous?.role === "user" && previous.turnId === message.turnId);
    ids.add(message.id); chars += message.text.length; previous = message;
  }
  insist(chars <= ASSISTANT_LIMITS.contextChars && (value.recentConversation.length === 0 || value.recentConversation[0].role === "user"));
  return value as unknown as AssistantRequest;
}
export function validateSnapshot(value: unknown, request: Pick<AssistantRequest, "jobId" | "sessionId" | "turnId" | "reasoningLevel">): JobSnapshot {
  insist(exactKeys(value, ["schema", "jobId", "sessionId", "turnId", "reasoning", "catalogVersion", "status", "events", "result", "error"]));
  insist(value.schema === "diamond-assistant-job/v1" && value.jobId === request.jobId && value.sessionId === request.sessionId && value.turnId === request.turnId && value.reasoning === request.reasoningLevel && value.catalogVersion === CATALOG_VERSION);
  insist(Array.isArray(value.events) && value.events.length >= 1 && value.events.length <= 8);
  const snapshot = value as unknown as JobSnapshot;
  for (let i = 0; i < snapshot.events.length; i++) {
    const e = snapshot.events[i]; insist((exactKeys(e, ["sequence", "at", "status"]) || exactKeys(e, ["sequence", "at", "status", "topic"])) && e.sequence === i + 1 && integer(e.at, i ? snapshot.events[i - 1].at : 1));
    insist(e.status === "searching" ? exactKeys(e, ["sequence", "at", "status", "topic"]) && validText(e.topic, 120) : exactKeys(e, ["sequence", "at", "status"]));
    insist(i === 0 ? e.status === "thinking" : ["thinking", "searching", "finalizing", "done", "failed", "cancelled"].includes(e.status));
    if (i) {
      const prior = snapshot.events[i - 1].status;
      insist(prior === "thinking" ? ["searching", "finalizing", "failed", "cancelled"].includes(e.status) : prior === "searching" ? ["thinking", "failed", "cancelled"].includes(e.status) : prior === "finalizing" && ["done", "failed", "cancelled"].includes(e.status));
    }
    if (e.status === "done") insist(snapshot.events[i - 1]?.status === "finalizing");
  }
  insist(snapshot.status === snapshot.events.at(-1)?.status);
  if (snapshot.status === "done") { validateProviderResult(snapshot.result); insist(snapshot.result.usage.reasoning === request.reasoningLevel && snapshot.error === null); }
  else { insist(snapshot.result === null); insist(snapshot.status === "failed" || snapshot.status === "cancelled" ? validText(snapshot.error, 240) : snapshot.error === null); }
  return snapshot;
}
export function requestFor(session: Session, turn: Turn): AssistantRequest {
  return validateRequest({ schema: "diamond-assistant-request/v1", jobId: turn.jobId, sessionId: session.id, turnId: turn.id, message: session.messages.find(m => m.turnId === turn.id && m.role === "user")!.text, reasoningLevel: turn.reasoning, recentConversation: session.messages.filter(m => turn.contextIds.includes(m.id)), catalogVersion: CATALOG_VERSION, clientSessionRevision: session.revision });
}
