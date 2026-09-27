import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  USAGE_JOURNAL_SCHEMA,
  type StoredUsageEvent,
  type StoredUsageJournalRecord,
  type UsageJournalControlRecord,
  type UsageJournalEventInput,
  type UsageJournalSummary,
  type UsageOperationKind,
  type UsageOutcome,
  type UsageQuality,
  type UsageStage,
} from "./usageJournalContract.ts";
import { projectUsageJournal } from "./usageJournalProjection.ts";

export type UsageJournalPolicy = {
  retentionDays: number;
  maxFileBytes: number;
  queueLimit: number;
  batchSize: number;
  writeRetryLimit: number;
  writeRetryDelayMs: number;
};

export type UsageJournalStoreOptions = {
  filePath: string;
  policy: UsageJournalPolicy;
  now?: () => number;
  schedule?: (work: () => void) => void;
  sessionId?: string;
};

const usageKeys = [
  "schema", "type", "eventId", "operationId", "attemptId", "originId", "surface", "operationKind", "stage", "environment",
  "provider", "requestedModel", "returnedModel", "reasoning", "acceptedAt", "dispatchedAt", "finishedAt", "recordedAt", "outcome",
  "usageQuality", "providerResponseId", "providerRequestId", "pricingVersion", "inputTokens", "outputTokens", "totalTokens", "toolCalls",
  "audioSeconds", "estimatedCostUsd", "reportedCostUsd", "reportedCostUsdTicks", "reconciliationState", "transportAttemptCoverage",
].sort();
const controlKeys = ["schema", "type", "recordId", "recordedAt", "sessionId", "reason", "lostEvents"].sort();
const surfaces = ["project_ai", "guidance_assistant"];
const kinds: UsageOperationKind[] = ["conversation", "hosted_search", "dictation", "animation_job"];
const stages: UsageStage[] = ["accepted", "dispatched", "provider_observed", "terminal", "reconciled"];
const outcomes: UsageOutcome[] = ["active", "succeeded", "failed", "cancelled", "timeout"];
const qualities: UsageQuality[] = ["not_dispatched", "observed", "partial", "unknown", "reconciled"];
const reconciliations = ["not_required", "pending", "reconciled", "dead_letter"];
const attemptCoverage = ["not_dispatched", "single_dispatch", "application_attempt_only", "sdk_aggregate_unknown"];
const controlTypes = ["session_start", "coverage_gap"];
const controlReasons = ["process_start", "unclean_restart", "queue_overflow", "write_failure"];
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_CHECK_MS = 60 * 60 * 1000;

const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === keys.join("|");
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const nullable = <T>(value: unknown, check: (candidate: unknown) => candidate is T): value is T | null => value === null || check(value);
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max &&
  /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(value);
const opaque = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const enumValue = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === "string" && values.includes(value as T);
const nullableInteger = (value: unknown) => nullable(value, integer);
const nullableFinite = (value: unknown) => nullable(value, finite);
const nullableText = (value: unknown) => nullable(value, text);

function isStoredRecord(value: unknown): value is StoredUsageJournalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.schema !== USAGE_JOURNAL_SCHEMA || !integer(row.recordedAt)) return false;
  if (row.type === "usage") {
    return exactKeys(row, usageKeys) && opaque(row.eventId) && opaque(row.operationId) && opaque(row.attemptId) && opaque(row.originId) &&
      enumValue(row.surface, surfaces) && enumValue(row.operationKind, kinds) && enumValue(row.stage, stages) && text(row.environment) &&
      nullableText(row.provider) && nullableText(row.requestedModel) && nullableText(row.returnedModel) && nullableText(row.reasoning) &&
      nullableInteger(row.acceptedAt) && nullableInteger(row.dispatchedAt) && nullableInteger(row.finishedAt) &&
      nullable(row.outcome, (candidate): candidate is UsageOutcome => enumValue(candidate, outcomes)) &&
      nullable(row.usageQuality, (candidate): candidate is UsageQuality => enumValue(candidate, qualities)) &&
      nullableText(row.providerResponseId) && nullableText(row.providerRequestId) && nullableText(row.pricingVersion) &&
      nullableInteger(row.inputTokens) && nullableInteger(row.outputTokens) && nullableInteger(row.totalTokens) && nullableInteger(row.toolCalls) &&
      nullableFinite(row.audioSeconds) && nullableFinite(row.estimatedCostUsd) && nullableFinite(row.reportedCostUsd) &&
      (row.reportedCostUsdTicks === null || typeof row.reportedCostUsdTicks === "string" && /^\d{1,40}$/.test(row.reportedCostUsdTicks)) &&
      nullable(row.reconciliationState, (candidate): candidate is StoredUsageEvent["reconciliationState"] & string => enumValue(candidate, reconciliations)) &&
      nullable(row.transportAttemptCoverage, (candidate): candidate is StoredUsageEvent["transportAttemptCoverage"] & string => enumValue(candidate, attemptCoverage));
  }
  return enumValue(row.type, controlTypes) && exactKeys(row, controlKeys) && text(row.recordId) && text(row.sessionId) &&
    enumValue(row.reason, controlReasons) && nullableInteger(row.lostEvents);
}

const hash = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex");
const boundedReference = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;
const safeOptionalText = (value: string | null | undefined) => value == null ? null : text(value) ? value : null;
const safeInteger = (value: number | null | undefined) => value == null ? null : integer(value) ? value : null;
const safeFinite = (value: number | null | undefined) => value == null ? null : finite(value) ? value : null;

function normalizeEvent(input: UsageJournalEventInput, recordedAt: number): StoredUsageEvent | null {
  if (!text(input.eventKey) || !boundedReference(input.operationRef) || !boundedReference(input.attemptRef) ||
    !boundedReference(input.originRef) || !enumValue(input.surface, surfaces) || !enumValue(input.operationKind, kinds) ||
    input.operationKind === "animation_job" || !enumValue(input.stage, stages) || !text(input.environment) || !integer(recordedAt)) return null;
  const reportedTicks = input.reportedCostUsdTicks == null ? null : /^\d{1,40}$/.test(input.reportedCostUsdTicks) ? input.reportedCostUsdTicks : null;
  return {
    schema: USAGE_JOURNAL_SCHEMA, type: "usage",
    eventId: hash("event", input.surface, input.attemptRef, input.eventKey),
    operationId: hash("operation", input.surface, input.operationRef),
    attemptId: hash("attempt", input.surface, input.attemptRef),
    originId: hash("origin", input.surface, input.originRef),
    surface: input.surface, operationKind: input.operationKind, stage: input.stage, environment: input.environment,
    provider: safeOptionalText(input.provider), requestedModel: safeOptionalText(input.requestedModel),
    returnedModel: safeOptionalText(input.returnedModel), reasoning: safeOptionalText(input.reasoning),
    acceptedAt: safeInteger(input.acceptedAt), dispatchedAt: safeInteger(input.dispatchedAt), finishedAt: safeInteger(input.finishedAt), recordedAt,
    outcome: input.outcome && outcomes.includes(input.outcome) ? input.outcome : null,
    usageQuality: input.usageQuality && qualities.includes(input.usageQuality) ? input.usageQuality : null,
    providerResponseId: safeOptionalText(input.providerResponseId), providerRequestId: safeOptionalText(input.providerRequestId),
    pricingVersion: safeOptionalText(input.pricingVersion), inputTokens: safeInteger(input.inputTokens), outputTokens: safeInteger(input.outputTokens),
    totalTokens: safeInteger(input.totalTokens), toolCalls: safeInteger(input.toolCalls), audioSeconds: safeFinite(input.audioSeconds),
    estimatedCostUsd: safeFinite(input.estimatedCostUsd), reportedCostUsd: safeFinite(input.reportedCostUsd),
    reportedCostUsdTicks: reportedTicks,
    reconciliationState: input.reconciliationState && reconciliations.includes(input.reconciliationState) ? input.reconciliationState : null,
    transportAttemptCoverage: input.transportAttemptCoverage && attemptCoverage.includes(input.transportAttemptCoverage) ? input.transportAttemptCoverage : null,
  };
}

const control = (type: UsageJournalControlRecord["type"], sessionId: string, reason: UsageJournalControlRecord["reason"],
  recordedAt: number, lostEvents: number | null): UsageJournalControlRecord => ({
  schema: USAGE_JOURNAL_SCHEMA, type, recordId: randomUUID(), recordedAt, sessionId, reason, lostEvents,
});

const pause = (milliseconds: number) => milliseconds <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const errorCode = (error: unknown) => error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";

/**
 * Single-process, append-only, best-effort observation store. Construction and
 * enqueue perform no filesystem I/O; all durable work runs on the scheduled
 * telemetry worker and can never throw into the AI call path.
 */
export class UsageJournalStore {
  private readonly filePath: string;
  private readonly policy: UsageJournalPolicy;
  private readonly now: () => number;
  private readonly schedule: (work: () => void) => void;
  private readonly sessionId: string;
  private readonly queue: StoredUsageEvent[] = [];
  private readonly queuedIds = new Set<string>();
  private readonly seenIds = new Set<string>();
  private records: StoredUsageJournalRecord[] = [];
  private initialized = false;
  private sessionStarted = false;
  private pendingRestartGap = false;
  private unavailable = false;
  private scheduled = false;
  private flushing: Promise<void> | null = null;
  private fileBytes = 0;
  private lastRetentionCheck = 0;
  private droppedEvents = 0;
  private failedWrites = 0;
  private pendingCoverageGaps = 0;
  private lastError: string | null = null;

  constructor(options: UsageJournalStoreOptions) {
    if (!Number.isInteger(options.policy.retentionDays) || options.policy.retentionDays < 1 ||
      !Number.isInteger(options.policy.maxFileBytes) || options.policy.maxFileBytes < 4096 ||
      !Number.isInteger(options.policy.queueLimit) || options.policy.queueLimit < 1 ||
      !Number.isInteger(options.policy.batchSize) || options.policy.batchSize < 1 || options.policy.batchSize > options.policy.queueLimit ||
      !Number.isInteger(options.policy.writeRetryLimit) || options.policy.writeRetryLimit < 0 || options.policy.writeRetryLimit > 10 ||
      !Number.isInteger(options.policy.writeRetryDelayMs) || options.policy.writeRetryDelayMs < 0) throw new Error("Invalid usage journal policy.");
    this.filePath = options.filePath; this.policy = { ...options.policy }; this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((work) => setImmediate(work)); this.sessionId = options.sessionId ?? randomUUID();
  }

  enqueue(input: UsageJournalEventInput): boolean {
    try {
      const event = normalizeEvent(input, this.now());
      if (!event) { this.droppedEvents++; this.pendingCoverageGaps++; this.lastError = "invalid_event_rejected"; return false; }
      if (this.seenIds.has(event.eventId) || this.queuedIds.has(event.eventId)) return true;
      if (this.queue.length >= this.policy.queueLimit) {
        this.droppedEvents++; this.pendingCoverageGaps++; this.lastError = "queue_overflow"; return false;
      }
      this.queue.push(event); this.queuedIds.add(event.eventId); this.kick(); return true;
    } catch {
      this.droppedEvents++; this.pendingCoverageGaps++; this.lastError = "enqueue_failure"; return false;
    }
  }

  private kick() {
    if (this.scheduled || this.flushing) return;
    this.scheduled = true;
    this.schedule(() => { this.scheduled = false; void this.flush(); });
  }

  private async assertSafePath() {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.filePath), 0o700);
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) throw Object.assign(new Error("Unsafe usage journal path."), { code: "UNSAFE_PATH" });
      await chmod(this.filePath, 0o600);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  }

  private async initialize() {
    if (this.initialized) return;
    await this.assertSafePath();
    let raw = "";
    try { raw = await readFile(this.filePath, "utf8"); }
    catch (error) { if (errorCode(error) !== "ENOENT") throw error; }
    if (raw && !raw.endsWith("\n")) throw Object.assign(new Error("Usage journal has an incomplete final record."), { code: "CORRUPT_TAIL" });
    const parsed: StoredUsageJournalRecord[] = [];
    for (const line of raw.split("\n").filter(Boolean)) {
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw Object.assign(new Error("Usage journal JSON is corrupt."), { code: "CORRUPT_JSON" }); }
      if (!isStoredRecord(value)) throw Object.assign(new Error("Usage journal record is invalid."), { code: "CORRUPT_RECORD" });
      parsed.push(value);
    }
    this.records = parsed;
    this.fileBytes = Buffer.byteLength(raw);
    const now = this.now();
    await this.applyRetention(now, true);
    for (const record of this.records) if (record.type === "usage") this.seenIds.add(record.eventId);
    const priorSession = [...this.records].reverse().find((record): record is UsageJournalControlRecord => record.type === "session_start");
    this.pendingRestartGap = !!priorSession && priorSession.sessionId !== this.sessionId;
    this.initialized = true; this.unavailable = false; this.lastError = null;
  }

  private async startSession() {
    if (this.sessionStarted) return;
    const now = this.now();
    const startup: StoredUsageJournalRecord[] = [];
    if (this.pendingRestartGap) startup.push(control("coverage_gap", this.sessionId, "unclean_restart", now, null));
    startup.push(control("session_start", this.sessionId, "process_start", now, null));
    await this.appendRecords(startup);
    this.records.push(...startup); this.pendingRestartGap = false; this.sessionStarted = true;
  }

  private async appendRecords(records: StoredUsageJournalRecord[]) {
    if (!records.length) return;
    const bytes = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
    const byteLength = Buffer.byteLength(bytes);
    if (this.fileBytes + byteLength > this.policy.maxFileBytes) throw Object.assign(new Error("Usage journal reached its local size limit."), { code: "FILE_LIMIT" });
    const handle = await open(this.filePath, "a", 0o600);
    try { await handle.writeFile(bytes, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    this.fileBytes += byteLength;
  }

  private async rewriteRecords(records: StoredUsageJournalRecord[]) {
    const bytes = records.length ? records.map((record) => JSON.stringify(record)).join("\n") + "\n" : "";
    const temporary = `${this.filePath}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporary, this.filePath); await chmod(this.filePath, 0o600);
    } catch (error) {
      await unlink(temporary).catch(() => {}); throw error;
    }
    this.records = records; this.fileBytes = Buffer.byteLength(bytes);
  }

  private async applyRetention(now: number, force = false) {
    if (!force && now - this.lastRetentionCheck < RETENTION_CHECK_MS) return;
    this.lastRetentionCheck = now;
    const cutoff = now - this.policy.retentionDays * DAY_MS;
    const retained = this.records.filter((record) => record.recordedAt >= cutoff);
    if (retained.length !== this.records.length) await this.rewriteRecords(retained);
  }

  private async writeWithRetry(records: StoredUsageJournalRecord[]): Promise<boolean> {
    for (let attempt = 0; attempt <= this.policy.writeRetryLimit; attempt++) {
      try { await this.appendRecords(records); return true; }
      catch (error) {
        this.lastError = `journal_write_${errorCode(error)}`;
        if (attempt < this.policy.writeRetryLimit) await pause(this.policy.writeRetryDelayMs * (attempt + 1));
      }
    }
    return false;
  }

  private async runFlush() {
    try { await this.initialize(); }
    catch (error) {
      this.unavailable = true; this.lastError = `journal_open_${errorCode(error)}`;
      const lost = this.queue.splice(0);
      for (const event of lost) this.queuedIds.delete(event.eventId);
      this.failedWrites += lost.length; this.pendingCoverageGaps += lost.length;
      return;
    }
    await this.applyRetention(this.now()).catch((error) => { this.lastError = `journal_retention_${errorCode(error)}`; });
    if (!this.queue.length) return;
    try { await this.startSession(); }
    catch (error) {
      this.unavailable = true; this.lastError = `journal_start_${errorCode(error)}`;
      const lost = this.queue.splice(0);
      for (const event of lost) this.queuedIds.delete(event.eventId);
      this.failedWrites += lost.length; this.pendingCoverageGaps += lost.length;
      return;
    }
    while (this.queue.length) {
      const batch = this.queue.splice(0, this.policy.batchSize);
      const fresh = batch.filter((event) => !this.seenIds.has(event.eventId));
      const gaps = this.pendingCoverageGaps > 0 ? [control("coverage_gap", this.sessionId,
        this.lastError === "queue_overflow" ? "queue_overflow" : "write_failure", this.now(), this.pendingCoverageGaps)] : [];
      const ok = await this.writeWithRetry([...gaps, ...fresh]);
      for (const event of batch) this.queuedIds.delete(event.eventId);
      if (!ok) {
        this.failedWrites += fresh.length; this.pendingCoverageGaps += fresh.length; this.unavailable = false;
        continue;
      }
      this.records.push(...gaps, ...fresh);
      for (const event of fresh) this.seenIds.add(event.eventId);
      this.pendingCoverageGaps = 0; this.lastError = null; this.unavailable = false;
    }
  }

  private flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.runFlush().catch(() => {
      this.unavailable = true; this.lastError = "journal_worker_failure";
    }).finally(() => {
      this.flushing = null;
      if (this.queue.length) this.kick();
    });
    return this.flushing;
  }

  async drain(): Promise<void> {
    await this.flush();
    while (this.scheduled || this.flushing || this.queue.length) {
      this.scheduled = false;
      await this.flush();
    }
  }

  async summary(): Promise<UsageJournalSummary> {
    await this.drain();
    return projectUsageJournal(this.records, {
      retentionDays: this.policy.retentionDays, now: this.now(), queueDepth: this.queue.length,
      droppedEvents: this.droppedEvents, failedWrites: this.failedWrites,
      pendingCoverageGaps: this.pendingCoverageGaps + (this.pendingRestartGap ? 1 : 0),
      lastError: this.lastError, unavailable: this.unavailable,
    });
  }
}
