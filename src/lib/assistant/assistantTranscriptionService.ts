import { DICTATION_LIMITS as LIMITS, DictationError, TRANSCRIPTION_MODEL, isDictationId, transcriptText, validateWav, type DictationCode } from "./assistantDictationContract.ts";
import {
  dictationAcceptedEvent, dictationDispatchedEvent, dictationProviderObservedEvent, dictationTerminalEvent,
  noUsageEventRecorder, type UsageEventRecorder,
} from "../usage-journal/usageJournalEvents.ts";
import { watchSharedCancellation, type SharedJobStore } from "../ai-jobs/sharedJobStore.ts";

type Fetcher = typeof fetch;
export type TranscriptionReceipt = { requestedModel: string; returnedModel: string | null; identity: "fixed-endpoint-request"; providerRequestId: string | null; seconds: number; estimatedUsd: number; priceDate: string; latencyMs: number; transcriptionCalls: number; outcome: string };
type Entry = { controller: AbortController; active: boolean; at: number };
export type TranscriptionServiceOptions = {
  /** Who may use dictation. Default: this computer only (the original local review rule). */
  allowRequest?: (request: Request) => boolean;
  /** Online: the shared job table, so a Cancel that reaches another server copy still stops the recording upload. */
  sharedStore?: () => SharedJobStore | null;
  cancelCheckMs?: number;
};
// Online: a stored dictation still "active" this long after it started belongs to a stopped server copy.
const SHARED_STALE_MS = 120_000;
async function rejectBody(request: Request, code: string, status: number) { await request.body?.cancel().catch(() => {}); return reply({ code }, status); }
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const local = (request: Request) => {
  const host = request.headers.get("host") ?? ""; const origin = request.headers.get("origin");
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(host) && (!origin || origin === `http://${host}`) && !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "");
};
async function readBounded(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal, overflow: DictationCode = "limit"): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) throw new DictationError("empty");
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read(); if (signal.aborted) { value?.fill(0); signal.throwIfAborted(); } if (done) break;
      length += value.length; if (length > limit) { value.fill(0); await reader.cancel(); throw new DictationError(overflow); } chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); chunks.forEach(chunk => chunk.fill(0)); }
}

/** No raw payload or transcript is retained by this service. Only bounded cancellation tombstones. */
export class AssistantTranscriptionService {
  private readonly entries = new Map<string, Entry>();
  private readonly transport: Fetcher;
  private readonly key: () => string | undefined;
  private readonly timeoutMs: number;
  private readonly recordUsage: UsageEventRecorder;
  private readonly allowRequest: (request: Request) => boolean;
  private readonly sharedStore: () => SharedJobStore | null;
  private readonly cancelCheckMs: number;
  constructor(transport: Fetcher = fetch, key = () => process.env.OPENAI_API_KEY, timeoutMs: number = LIMITS.timeoutMs,
    recordUsage: UsageEventRecorder = noUsageEventRecorder, options: TranscriptionServiceOptions = {}) {
    this.transport = transport; this.key = key; this.timeoutMs = timeoutMs; this.recordUsage = recordUsage;
    this.allowRequest = options.allowRequest ?? local; this.sharedStore = options.sharedStore ?? (() => null);
    this.cancelCheckMs = options.cancelCheckMs ?? 1000;
  }
  private meter(event: Parameters<UsageEventRecorder>[0]) { try { this.recordUsage(event); } catch { /* Best-effort observation only. */ } }
  private prune() { for (const [id, entry] of this.entries) if (!entry.active && Date.now() - entry.at > 10 * 60 * 1000) this.entries.delete(id); }
  cancel(request: Request) {
    if (!this.allowRequest(request)) return reply({ code: "invalid" }, 403);
    const id = new URL(request.url).searchParams.get("id"); if (!isDictationId(id)) return reply({ code: "invalid" }, 400);
    this.prune(); const entry = this.entries.get(id);
    if (entry) entry.controller.abort("cancelled");
    else { if (this.entries.size >= LIMITS.identities) return reply({ code: "capacity" }, 429); const controller = new AbortController(); controller.abort("cancelled"); this.entries.set(id, { controller, active: false, at: Date.now() }); }
    return reply({ id, cancelled: true });
  }
  /** Online cancel: marks the dictation "please stop" in the shared table (or leaves a tombstone if it has not arrived yet). */
  async cancelShared(request: Request, ownerId: string) {
    const store = this.sharedStore(); if (!store) return this.cancel(request);
    if (!this.allowRequest(request)) return reply({ code: "invalid" }, 403);
    const id = new URL(request.url).searchParams.get("id"); if (!isDictationId(id)) return reply({ code: "invalid" }, 400);
    this.entries.get(id)?.controller.abort("cancelled");
    try {
      if (!await store.requestCancel("dictation", id, ownerId)
        && !await store.insert({ kind: "dictation", jobId: id, ownerId, scopeId: id, fingerprint: null, active: false, snapshot: null, cancelRequested: true })) {
        await store.requestCancel("dictation", id, ownerId); // The upload arrived at the same moment.
      }
    } catch { return reply({ code: "capacity" }, 503); }
    return reply({ id, cancelled: true });
  }
  async transcribe(request: Request, ownerId = "legacy-local-owner") {
    if (!this.allowRequest(request)) return rejectBody(request, "invalid", 403);
    const id = request.headers.get("x-dictation-id"); if (!isDictationId(id)) return rejectBody(request, "invalid", 400);
    if (request.headers.get("content-type") !== "audio/wav") return rejectBody(request, "format", 415);
    const advertised = request.headers.get("content-length");
    if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > LIMITS.bytes)) return rejectBody(request, "limit", 413);
    this.prune();
    if (this.entries.has(id)) return rejectBody(request, this.entries.get(id)!.controller.signal.aborted ? "cancelled" : "invalid", 409);
    const store = this.sharedStore();
    if (store) {
      // Online: limits count every server copy (two active dictations per account), and a Cancel
      // tombstone written by another copy wins, exactly like the local rule below.
      try {
        if ((await store.listActive("dictation", ownerId, SHARED_STALE_MS)).length >= LIMITS.active) return rejectBody(request, "capacity", 429);
        if (!await store.insert({ kind: "dictation", jobId: id, ownerId, scopeId: id, fingerprint: null, active: true, snapshot: null })) {
          return rejectBody(request, (await store.get("dictation", id))?.cancelRequested ? "cancelled" : "invalid", 409);
        }
      } catch { return rejectBody(request, "capacity", 503); }
    } else if (this.entries.size >= LIMITS.identities || [...this.entries.values()].filter(e => e.active).length >= LIMITS.active) return rejectBody(request, "capacity", 429);
    const entry: Entry = { controller: new AbortController(), active: true, at: Date.now() }; this.entries.set(id, entry);
    const stopWatching = store
      ? watchSharedCancellation(store, "dictation", id, () => entry.controller.abort("cancelled"), this.cancelCheckMs)
      : () => {};
    this.meter(dictationAcceptedEvent(id, entry.at));
    const signal = entry.controller.signal; const disconnect = () => entry.controller.abort("cancelled");
    request.signal.addEventListener("abort", disconnect, { once: true }); if (request.signal.aborted) disconnect();
    const timer = setTimeout(() => entry.controller.abort("timeout"), this.timeoutMs);
    let bytes: Uint8Array<ArrayBuffer> | undefined; let form: FormData | undefined;
    let receipt: TranscriptionReceipt = { requestedModel: TRANSCRIPTION_MODEL, returnedModel: null, identity: "fixed-endpoint-request", providerRequestId: null, seconds: 0, estimatedUsd: 0, priceDate: "2026-09-24", latencyMs: 0, transcriptionCalls: 0, outcome: "failed" };
    let journalOutcome: "succeeded" | "failed" | "cancelled" | "timeout" = "failed";
    const started = performance.now();
    try {
      bytes = await readBounded(request.body, LIMITS.bytes, signal);
      const audio = validateWav(bytes, request.headers.get("content-type")!);
      receipt = { ...receipt, seconds: audio.seconds, estimatedUsd: audio.estimatedUsd };
      if (audio.estimatedUsd > LIMITS.maxUsd) throw new DictationError("limit");
      const key = this.key(); if (!key) throw new DictationError("configuration");
      signal.throwIfAborted();
      form = new FormData(); form.set("file", new Blob([bytes], { type: "audio/wav" }), "dictation.wav"); form.set("model", TRANSCRIPTION_MODEL); form.set("response_format", "json");
      receipt.transcriptionCalls = 1;
      this.meter(dictationDispatchedEvent(id, Date.now()));
      const response = await this.transport("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal, redirect: "error" });
      form.delete("file"); form = undefined; bytes.fill(0); bytes = undefined;
      receipt.providerRequestId = /^[\w-]{1,160}$/.test(response.headers.get("x-request-id") ?? "") ? response.headers.get("x-request-id") : null;
      this.meter(dictationProviderObservedEvent(id, "provider-headers", { returnedModel: response.headers.get("openai-model"),
        providerRequestId: receipt.providerRequestId, seconds: receipt.seconds, estimatedCostUsd: receipt.estimatedUsd, complete: false }));
      if (!response.ok) { await response.body?.cancel(); throw new DictationError("provider"); }
      const output = await readBounded(response.body, LIMITS.responseBytes, signal, "invalid");
      let value; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(output)); } finally { output.fill(0); }
      // The documented transcription JSON does not guarantee a model echo. Never invent one.
      const returnedModel = value.model ?? response.headers.get("openai-model");
      this.meter(dictationProviderObservedEvent(id, "provider-body", { returnedModel: returnedModel ?? null,
        providerRequestId: receipt.providerRequestId, seconds: receipt.seconds, estimatedCostUsd: receipt.estimatedUsd, complete: true }));
      if (returnedModel != null && returnedModel !== TRANSCRIPTION_MODEL) throw new DictationError("invalid");
      receipt.returnedModel = returnedModel ?? null;
      const text = transcriptText(value.text); signal.throwIfAborted();
      receipt.outcome = "done"; receipt.latencyMs = Math.round(performance.now() - started); journalOutcome = "succeeded";
      return reply({ id, text, receipt });
    } catch (error) {
      const code = signal.aborted ? signal.reason === "timeout" ? "timeout" : "cancelled" : error instanceof DictationError ? error.code : "provider";
      journalOutcome = code === "timeout" ? "timeout" : code === "cancelled" ? "cancelled" : "failed";
      receipt.outcome = code; receipt.latencyMs = Math.round(performance.now() - started);
      return reply({ id, code, receipt }, code === "timeout" ? 504 : code === "cancelled" ? 409 : code === "provider" ? 502 : 400);
    } finally {
      clearTimeout(timer); request.signal.removeEventListener("abort", disconnect); form?.delete("file"); form = undefined; bytes?.fill(0); bytes = undefined;
      entry.active = false; entry.at = Date.now();
      this.meter(dictationTerminalEvent(id, journalOutcome, entry.at));
      stopWatching();
      if (store) { await store.update("dictation", id, { snapshot: null, active: false }).catch(() => false); this.entries.delete(id); }
    }
  }
}
