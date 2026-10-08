// Shared AI job state for the online app (many server copies on Vercel).
//
// Locally there is no shared store: each AI job service keeps its jobs in memory exactly as before.
// Online (DATABASE_URL set) the routes give the services a SharedJobStore, so:
// - a status poll that lands on another server copy still finds the job (it reads the stored snapshot);
// - a Cancel that lands on another server copy still stops the job (it writes the cancelled snapshot,
//   and the copy doing the work notices within a couple of seconds and stops the AI call);
// - "one active request per workspace / two per account" limits count every server copy.
//
// A stored row can only be changed while it is still active. The first copy that writes a finished
// state (done, failed or cancelled) wins; every later write is refused, so two copies can never both
// finish one job or both record its final usage event.

import { createHash } from "node:crypto";

export type SharedJobKind = "ai-animator" | "assistant" | "dictation";

export type SharedJobRow = {
  kind: SharedJobKind;
  jobId: string;
  ownerId: string;
  /** The project (AI Animator), chat session (Assistant) or dictation id the job belongs to. */
  scopeId: string;
  /** A one-way hash of the request (never the request itself), used to spot a reused job id. */
  fingerprint: string | null;
  active: boolean;
  cancelRequested: boolean;
  snapshot: unknown;
  createdAt: number;
  updatedAt: number;
};

export type SharedJobInsert = Pick<SharedJobRow, "kind" | "jobId" | "ownerId" | "scopeId" | "fingerprint" | "active" | "snapshot"> & {
  cancelRequested?: boolean;
};

export interface SharedJobStore {
  /** Adds a new job. Returns false (and changes nothing) when this kind + job id already exists. */
  insert(row: SharedJobInsert): Promise<boolean>;
  get(kind: SharedJobKind, jobId: string): Promise<SharedJobRow | null>;
  /** Saves a new snapshot only while the stored job is still active. False = another copy already finished it. */
  update(kind: SharedJobKind, jobId: string, next: { snapshot: unknown; active: boolean }): Promise<boolean>;
  /** Active jobs of one account created within the last `freshMs` (older ones belong to a stopped server copy). */
  listActive(kind: SharedJobKind, ownerId: string, freshMs: number): Promise<Array<{ jobId: string; scopeId: string }>>;
  /** Marks a job of this account as "please stop" (used by dictation). False when no such job exists for this account. */
  requestCancel(kind: SharedJobKind, jobId: string, ownerId: string): Promise<boolean>;
}

/** Sha-256 hex of a string, so request identities can be compared without storing the request text. */
export const sharedFingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

/** In-memory SharedJobStore for tests: behaves like the Postgres table (one map = one database). */
export class MemorySharedJobStore implements SharedJobStore {
  readonly rows = new Map<string, SharedJobRow>();
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  private key(kind: SharedJobKind, jobId: string) { return `${kind}\u0000${jobId}`; }
  async insert(row: SharedJobInsert) {
    const key = this.key(row.kind, row.jobId);
    if (this.rows.has(key)) return false;
    const at = this.now();
    this.rows.set(key, { ...row, cancelRequested: row.cancelRequested ?? false, snapshot: structuredClone(row.snapshot), createdAt: at, updatedAt: at });
    return true;
  }
  async get(kind: SharedJobKind, jobId: string) {
    const row = this.rows.get(this.key(kind, jobId));
    return row ? structuredClone(row) : null;
  }
  async update(kind: SharedJobKind, jobId: string, next: { snapshot: unknown; active: boolean }) {
    const row = this.rows.get(this.key(kind, jobId));
    if (!row || !row.active) return false;
    row.snapshot = structuredClone(next.snapshot); row.active = next.active; row.updatedAt = this.now();
    return true;
  }
  async listActive(kind: SharedJobKind, ownerId: string, freshMs: number) {
    const cutoff = this.now() - freshMs;
    return [...this.rows.values()]
      .filter((row) => row.kind === kind && row.ownerId === ownerId && row.active && row.createdAt > cutoff)
      .map((row) => ({ jobId: row.jobId, scopeId: row.scopeId }));
  }
  async requestCancel(kind: SharedJobKind, jobId: string, ownerId: string) {
    const row = this.rows.get(this.key(kind, jobId));
    if (!row || row.ownerId !== ownerId) return false;
    row.cancelRequested = true; row.updatedAt = this.now();
    return true;
  }
}

/**
 * Writes for one job, in order. Each write waits for the one before, so the stored snapshot never goes
 * backwards. `onRefused` runs once when the store says another server copy already finished the job.
 */
export class SharedJobWriter {
  private chain: Promise<boolean> = Promise.resolve(true);
  private refused = false;
  private readonly store: SharedJobStore;
  private readonly kind: SharedJobKind;
  private readonly jobId: string;
  private readonly onRefused: () => void;
  constructor(store: SharedJobStore, kind: SharedJobKind, jobId: string, onRefused: () => void) {
    this.store = store; this.kind = kind; this.jobId = jobId; this.onRefused = onRefused;
  }
  get wasRefused() { return this.refused; }
  /** Queues a save. Resolves true when it was stored, false when another copy finished the job first. */
  save(snapshot: unknown, active: boolean): Promise<boolean> {
    const copy = structuredClone(snapshot);
    this.chain = this.chain.then(async () => {
      if (this.refused) return false;
      let stored = false;
      try { stored = await this.store.update(this.kind, this.jobId, { snapshot: copy, active }); }
      catch { return false; } // A database hiccup must not crash the job; the next save tries again.
      if (!stored) { this.refused = true; this.onRefused(); }
      return stored;
    });
    return this.chain;
  }
  /** Resolves after every queued save has finished. */
  settled() { return this.chain.then(() => undefined); }
}

/**
 * While a job runs, checks the store every `everyMs` for a Cancel written by another server copy.
 * Calls `onCancelled` once (with the stored row) and stops. Returns a function that stops the checks.
 */
export function watchSharedCancellation(store: SharedJobStore, kind: SharedJobKind, jobId: string,
  onCancelled: (row: SharedJobRow) => void, everyMs = 2000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    try {
      const row = await store.get(kind, jobId);
      if (!stopped && row && (!row.active || row.cancelRequested)) { stopped = true; onCancelled(row); return; }
    } catch { /* Try again on the next tick. */ }
    if (!stopped) { timer = setTimeout(tick, everyMs); (timer as { unref?: () => void }).unref?.(); }
  };
  timer = setTimeout(tick, everyMs); (timer as { unref?: () => void }).unref?.();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
