import { AI_ANIMATOR_LEDGER_CHANGED_EVENT, AI_ANIMATOR_LEDGER_PREFIX } from "../ai/aiAnimatorStorage";
import { normalizeAiAnimatorJobSnapshot } from "../ai/aiAnimatorContract";
import { ASSISTANT_DB } from "../assistant/assistantStorage";
import { validateSession, type Session } from "../assistant/assistantContracts";
import { emptySource, type DashboardReceipt, type DashboardSnapshot, type DashboardSourceSnapshot } from "./dashboardContract";

const MAX_TERRA_KEYS = 500;
const MAX_TERRA_BYTES = 1_048_576;
const MAX_ASSISTANT_SESSIONS = 50;
const validCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validCost = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const validUtcTime = (value: unknown, now: number): number | null => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isSafeInteger(time) && time > 0 && time <= now && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19) ? time : null;
};
const makePartial = (source: DashboardSourceSnapshot, issue: string) => {
  source.issues.push(issue);
  source.state = "partial";
};
const yieldRead = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

async function readProject(now: number, signal?: AbortSignal): Promise<DashboardSourceSnapshot> {
  const source = emptySource();
  let storage: Storage;
  try { storage = window.localStorage; void storage.length; }
  catch { return { ...emptySource("unavailable"), issues: ["Project AI local records could not be read."] }; }
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(AI_ANIMATOR_LEDGER_PREFIX)) keys.push(key);
    }
  } catch { return { ...emptySource("unavailable"), issues: ["Project AI local records could not be enumerated."] }; }
  if (keys.length > MAX_TERRA_KEYS) makePartial(source, "Some Project AI records exceed the readable dashboard limit.");
  keys.sort();
  const seen = new Map<string, DashboardReceipt | null>();
  for (let index = 0; index < Math.min(keys.length, MAX_TERRA_KEYS); index++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (index && index % 20 === 0) await yieldRead();
    const key = keys[index];
    let raw: string | null;
    try { raw = storage.getItem(key); }
    catch { makePartial(source, "A Project AI record could not be read."); continue; }
    if (!raw || raw.length > MAX_TERRA_BYTES) { makePartial(source, "A Project AI record is empty or too large to inspect."); continue; }
    try {
      const projectId = decodeURIComponent(key.slice(AI_ANIMATOR_LEDGER_PREFIX.length));
      if (`${AI_ANIMATOR_LEDGER_PREFIX}${encodeURIComponent(projectId)}` !== key) throw Error("key");
      const ledger = JSON.parse(raw) as Record<string, unknown>;
      if (ledger.version !== 1 || ledger.projectId !== projectId || !Array.isArray(ledger.jobs) || ledger.jobs.length > 40) throw Error("ledger");
      for (const value of ledger.jobs) {
        const job = normalizeAiAnimatorJobSnapshot(value);
        if (!job || job.projectId !== projectId) { makePartial(source, "A Project AI job could not be verified."); continue; }
        if (job.status === "failed") { source.failed++; continue; }
        if (job.status === "cancelled") { source.cancelled++; continue; }
        if (job.status !== "done") { source.pending++; continue; }
        const at = validUtcTime(job.completedAt, now);
        const usage = job.telemetry.usage;
        if (at === null || job.telemetry.outcome !== "succeeded") { makePartial(source, "A Project AI completion has an invalid time or outcome."); continue; }
        const input = validCount(usage.inputTokens) ? usage.inputTokens : null;
        const output = validCount(usage.outputTokens) ? usage.outputTokens : null;
        const total = validCount(usage.totalTokens) ? usage.totalTokens : null;
        if (input !== null && output !== null && total !== null && input + output !== total) { makePartial(source, "A Project AI token total is inconsistent."); continue; }
        if (usage.estimatedCostUsd !== null && !validCost(usage.estimatedCostUsd)) { makePartial(source, "A Project AI cost estimate is invalid."); continue; }
        if (total === null) makePartial(source, "A Project AI completion has unknown token usage.");
        const identity = `${projectId}:${job.projectGeneration}:${job.jobId}`;
        const receipt: DashboardReceipt = {
          id: "", source: "project", at, inputTokens: input, outputTokens: output, totalTokens: total,
          estimatedCostUsd: usage.estimatedCostUsd, priceDate: null, model: job.telemetry.model,
          reasoning: job.reasoningLevel, toolCalls: 0,
        };
        if (seen.has(identity)) {
          if (JSON.stringify(seen.get(identity)) !== JSON.stringify(receipt)) {
            seen.set(identity, null);
            makePartial(source, "Conflicting duplicate Project AI receipts were excluded.");
          }
        } else seen.set(identity, receipt);
      }
    } catch { makePartial(source, "A Project AI ledger could not be verified; its original data is untouched."); }
  }
  source.receipts = [...seen.values()].filter((receipt): receipt is DashboardReceipt => receipt !== null)
    .map((receipt, index) => ({ ...receipt, id: `project-${index + 1}` }));
  if (source.state !== "partial") source.state = keys.length ? "ready" : "absent";
  return source;
}

type RawRow = { key: IDBValidKey; value: unknown };
function openExistingAssistant(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let absent = false;
    const request = indexedDB.open(ASSISTANT_DB, 1);
    request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
    request.onblocked = () => reject(Error("blocked"));
    request.onerror = () => absent ? resolve(null) : reject(request.error ?? Error("open"));
    request.onsuccess = () => {
      if (absent) { request.result.close(); resolve(null); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function readAssistantRows(db: IDBDatabase): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = db.transaction("sessions", "readonly"); }
    catch (error) { reject(error); return; }
    const store = transaction.objectStore("sessions");
    const values = store.getAll();
    const keys = store.getAllKeys();
    transaction.oncomplete = () => resolve(values.result.map((value, index) => ({ key: keys.result[index], value })));
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? Error("read"));
  });
}

async function readAssistant(now: number, signal?: AbortSignal): Promise<DashboardSourceSnapshot> {
  const source = emptySource();
  let db: IDBDatabase | null = null;
  try {
    db = await openExistingAssistant();
    if (!db) return source;
    const rows = await readAssistantRows(db);
    if (rows.length > MAX_ASSISTANT_SESSIONS) makePartial(source, "Some Assistant chats exceed the readable dashboard limit.");
    const seen = new Set<string>();
    for (let index = 0; index < Math.min(rows.length, MAX_ASSISTANT_SESSIONS); index++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const row = rows[index];
      let session: Session;
      try {
        session = await validateSession(row.value);
        if (row.key !== session.id) throw Error("key");
      } catch { makePartial(source, "An Assistant chat could not be verified; its original data is untouched."); continue; }
      for (const turn of session.turns) {
        if (turn.status === "failed" || turn.status === "interrupted") { source.failed++; source.priorAttempts += turn.priorAttempts?.length ?? 0; continue; }
        if (turn.status === "cancelled") { source.cancelled++; source.priorAttempts += turn.priorAttempts?.length ?? 0; continue; }
        if (turn.status === "pending") { source.pending++; source.priorAttempts += turn.priorAttempts?.length ?? 0; continue; }
        source.priorAttempts += turn.priorAttempts?.length ?? 0;
        if (turn.endedAt === null || turn.endedAt > now) { makePartial(source, "An Assistant completion has an invalid or future time."); continue; }
        const identity = `${session.id}:${turn.id}:${turn.jobId}`;
        if (seen.has(identity)) { makePartial(source, "A duplicate Assistant receipt was excluded."); continue; }
        seen.add(identity);
        const usage = turn.usage;
        if (!usage) { makePartial(source, "An Assistant completion has unknown token usage."); continue; }
        source.receipts.push({
          id: `assistant-${source.receipts.length + 1}`, source: "assistant", at: turn.endedAt,
          inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens,
          estimatedCostUsd: usage.estimatedCostUsd, priceDate: usage.priceDate,
          model: usage.model, reasoning: usage.reasoning, toolCalls: usage.toolCalls,
        });
      }
      if (index % 10 === 0) await yieldRead();
    }
    if (source.state !== "partial") source.state = rows.length ? "ready" : "absent";
    return source;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ...emptySource("unavailable"), issues: ["Assistant local records could not be read."] };
  } finally { db?.close(); }
}

export async function readDashboardSnapshot(signal?: AbortSignal): Promise<DashboardSnapshot> {
  const readAt = Date.now();
  const [project, assistant] = await Promise.all([readProject(readAt, signal), readAssistant(readAt, signal)]);
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  return { project, assistant, readAt };
}

export function subscribeDashboardChanges(onChange: () => void) {
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel("diamond-assistant-invalidation-v1"); channel.onmessage = onChange; }
  catch { /* Focus and timed rereads remain available. */ }
  const visibility = () => { if (document.visibilityState === "visible") onChange(); };
  const storage = (event: StorageEvent) => { if (event.key?.startsWith(AI_ANIMATOR_LEDGER_PREFIX)) onChange(); };
  window.addEventListener(AI_ANIMATOR_LEDGER_CHANGED_EVENT, onChange);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", visibility);
  const interval = window.setInterval(visibility, 10_000);
  return () => {
    channel?.close(); window.removeEventListener(AI_ANIMATOR_LEDGER_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", storage); window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", visibility); window.clearInterval(interval);
  };
}
