import { digest, stableJson } from "../assistant/assistantContracts.ts";
import {
  isAiAnimatorTerminalStatus,
  normalizeAiAnimatorJobSnapshot,
  type AiAnimatorConversationMessage,
  type AiAnimatorJobSnapshot,
} from "../ai/aiAnimatorContract.ts";
import {
  readAccountAiAnimatorLedger,
  upsertAiAnimatorJob,
  writeAccountAiAnimatorLedger,
} from "../ai/aiAnimatorStorage.ts";
import { getConfiguredAccountDataOwner, readAccountJson, subscribeAccountDataChanges, writeAccountJson } from "../account/accountDataClient.ts";
import type { TerraLedgerTerminalV1 } from "./notificationContracts.ts";
import { publishValidatedNotificationTerminalV1 } from "./notificationStorage.ts";

export const TERRA_PENDING_STORAGE_KEY_V1 = "diamond_terra_pending_jobs_v1";
const TERRA_PENDING_CHANGED_EVENT_V1 = "diamond-terra-pending-changed-v1";
const TERRA_LOCK_KEY_V1 = "diamond_terra_completion_lease_v1";
const POLL_INTERVAL_MS = 300;
const REQUEST_TIMEOUT_MS = 10_000;
const PREPARED_GRACE_MS = 18_000;
const MAX_PENDING = 40;

export type TerraPendingDescriptorV1 = {
  schema: "terra-pending-descriptor/v1";
  workspaceIdentity: string;
  projectId: string;
  projectGeneration: number;
  projectTitle: string;
  jobId: string;
  turnId: string;
  createdAt: number;
  acceptedAt: number | null;
};

type TerraObserverSnapshotV1 = Readonly<{ pending: readonly TerraPendingDescriptorV1[]; faults: Readonly<Record<string, string>> }>;
let snapshot: TerraObserverSnapshotV1 = { pending: [], faults: {} };
const listeners = new Set<(value: TerraObserverSnapshotV1) => void>();
const posting = new Set<string>();
const polling = new Map<string, AbortController>();
let rootOwners = 0;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let scanInFlight = false;

const normalizedIdentity = (value: unknown): value is string => typeof value === "string" && value === value.normalize("NFC") && new TextEncoder().encode(value).byteLength >= 1 && new TextEncoder().encode(value).byteLength <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const sanitizeProjectTitle = (value: string) => {
  const normalized = value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || "Untitled project";
  const scalars = Array.from(normalized);
  return scalars.length <= 120 ? normalized : `${scalars.slice(0, 119).join("")}…`;
};

const validDescriptor = (value: unknown): value is TerraPendingDescriptorV1 => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join("|") === ["acceptedAt", "createdAt", "jobId", "projectGeneration", "projectId", "projectTitle", "schema", "turnId", "workspaceIdentity"].sort().join("|") &&
    row.schema === "terra-pending-descriptor/v1" && normalizedIdentity(row.workspaceIdentity) && normalizedIdentity(row.projectId) && normalizedIdentity(row.jobId) && normalizedIdentity(row.turnId) &&
    Number.isSafeInteger(row.projectGeneration) && Number(row.projectGeneration) >= 0 && Number.isSafeInteger(row.createdAt) && Number(row.createdAt) > 0 &&
    (row.acceptedAt === null || Number.isSafeInteger(row.acceptedAt) && Number(row.acceptedAt) >= Number(row.createdAt)) &&
    typeof row.projectTitle === "string" && sanitizeProjectTitle(row.projectTitle) === row.projectTitle;
};

const readPending = async (): Promise<{ rows: TerraPendingDescriptorV1[]; revision: number }> => {
  if (typeof window === "undefined") return { rows: [], revision: 0 };
  if (getConfiguredAccountDataOwner()) {
    const record = await readAccountJson<{ schema: "account-terra-pending/v1"; rows: unknown[] }>("terra-pending", "all");
    if (!record) return { rows: [], revision: 0 };
    if (record.value?.schema !== "account-terra-pending/v1" || !Array.isArray(record.value.rows)) throw new Error("terra-pending-storage-invalid");
    return { rows: record.value.rows.filter(validDescriptor).slice(-MAX_PENDING), revision: record.revision };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TERRA_PENDING_STORAGE_KEY_V1) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return { rows: [], revision: 0 };
    return { rows: parsed.filter(validDescriptor).slice(-MAX_PENDING), revision: 0 };
  } catch { return { rows: [], revision: 0 }; }
};

const notifyPending = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TERRA_PENDING_CHANGED_EVENT_V1));
};

const writePending = async (rows: TerraPendingDescriptorV1[], expectedRevision: number) => {
  if (typeof window === "undefined") throw new Error("terra-pending-storage-unavailable");
  if (getConfiguredAccountDataOwner()) {
    await writeAccountJson("terra-pending", "all", { schema: "account-terra-pending/v1", rows: rows.slice(-MAX_PENDING) }, expectedRevision);
  } else {
    window.localStorage.setItem(TERRA_PENDING_STORAGE_KEY_V1, JSON.stringify(rows.slice(-MAX_PENDING)));
  }
  notifyPending();
};

const emit = (pending: readonly TerraPendingDescriptorV1[] = snapshot.pending, faults = snapshot.faults) => {
  snapshot = Object.freeze({ pending: Object.freeze([...pending]), faults: Object.freeze({ ...faults }) });
  for (const listener of listeners) listener(snapshot);
};

export function subscribeTerraObserverV1(listener: (value: TerraObserverSnapshotV1) => void) {
  listeners.add(listener);
  listener(snapshot);
  return () => { listeners.delete(listener); };
}

const withTerraLock = async <T>(run: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== "undefined" && navigator.locks?.request) return navigator.locks.request("diamond-terra-completion-v1", { mode: "exclusive" }, run);
  if (typeof window === "undefined") return run();
  const owner = crypto.randomUUID();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = Date.now();
    let current: { owner?: string; expiresAt?: number } = {};
    try { current = JSON.parse(window.localStorage.getItem(TERRA_LOCK_KEY_V1) ?? "{}") as typeof current; } catch { /* replace malformed lease */ }
    if (!current.owner || !Number.isSafeInteger(current.expiresAt) || Number(current.expiresAt) <= now) {
      window.localStorage.setItem(TERRA_LOCK_KEY_V1, JSON.stringify({ owner, expiresAt: now + 5_000 }));
      const claimed = JSON.parse(window.localStorage.getItem(TERRA_LOCK_KEY_V1) ?? "{}") as typeof current;
      if (claimed.owner === owner) {
        try { return await run(); }
        finally {
          const live = JSON.parse(window.localStorage.getItem(TERRA_LOCK_KEY_V1) ?? "{}") as typeof current;
          if (live.owner === owner) window.localStorage.removeItem(TERRA_LOCK_KEY_V1);
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("terra-completion-lock-busy");
};

export function setTerraJobPostingV1(jobId: string, value: boolean) {
  if (value) posting.add(jobId);
  else posting.delete(jobId);
  scheduleScan(0);
}

export async function registerPendingTerraJobV1(descriptor: TerraPendingDescriptorV1, userMessage: AiAnimatorConversationMessage, localJob: AiAnimatorJobSnapshot) {
  if (!validDescriptor(descriptor) || normalizeAiAnimatorJobSnapshot(localJob) === null || localJob.jobId !== descriptor.jobId || localJob.turnId !== descriptor.turnId || localJob.projectId !== descriptor.projectId || localJob.projectGeneration !== descriptor.projectGeneration || userMessage.role !== "user" || userMessage.jobId !== descriptor.jobId) throw new Error("invalid-terra-pending-source");
  const rows = await withTerraLock(async () => {
    const { ledger, revision } = await readAccountAiAnimatorLedger(descriptor.projectId);
    const existing = ledger.jobs.find(job => job.jobId === descriptor.jobId);
    if (existing && stableJson(existing) !== stableJson(localJob)) throw new Error("terra-pending-conflict");
    const messages = ledger.messages.some(message => message.id === userMessage.id) ? ledger.messages : [...ledger.messages, userMessage];
    await writeAccountAiAnimatorLedger(upsertAiAnimatorJob({ ...ledger, messages }, localJob), revision);
    const pending = await readPending();
    const prior = pending.rows.find(row => row.jobId === descriptor.jobId);
    if (prior && stableJson(prior) !== stableJson(descriptor)) throw new Error("terra-descriptor-conflict");
    const nextRows = [...pending.rows.filter(row => row.jobId !== descriptor.jobId), descriptor];
    await writePending(nextRows, pending.revision);
    return nextRows;
  });
  emit(rows);
  scheduleScan(0);
}

export async function markTerraJobAcceptedV1(jobId: string) {
  const rows = await withTerraLock(async () => {
    const pending = await readPending();
    const descriptor = pending.rows.find(row => row.jobId === jobId);
    if (!descriptor || descriptor.acceptedAt !== null) return pending.rows;
    const nextRows = pending.rows.map(row => row.jobId === jobId ? { ...row, acceptedAt: Date.now() } : row);
    await writePending(nextRows, pending.revision);
    return nextRows;
  });
  emit(rows);
}

const terminalMessage = (snapshot: AiAnimatorJobSnapshot) => {
  const finalEvent = snapshot.events.at(-1);
  if (snapshot.status === "done") return finalEvent?.reply?.reply ?? "Terra completed the request without a readable reply. No animation changed.";
  if (snapshot.status === "cancelled") return "Cancelled. No animation changed.";
  return finalEvent?.errorMessage ?? "Terra could not finish this request. No animation changed. Try again when the service is available.";
};

const verifySequence = (previous: AiAnimatorJobSnapshot | undefined, next: AiAnimatorJobSnapshot) => {
  if (!previous) return;
  if (isAiAnimatorTerminalStatus(previous.status)) {
    if (stableJson(previous) !== stableJson(next)) throw new Error("terra-terminal-conflict");
    return;
  }
  if (next.lastSequence < previous.lastSequence || stableJson(next.events.slice(0, previous.events.length)) !== stableJson(previous.events)) throw new Error("terra-sequence-conflict");
};

const buildLedgerTerminal = async (descriptor: TerraPendingDescriptorV1, terminal: AiAnimatorJobSnapshot, messageId: string): Promise<TerraLedgerTerminalV1> => {
  const body = {
    schema: "terra-ledger-terminal/v1" as const,
    projectId: descriptor.projectId,
    projectGeneration: descriptor.projectGeneration,
    jobId: descriptor.jobId,
    terminalSequence: terminal.lastSequence,
    outcome: terminal.status as "done" | "failed" | "cancelled",
    messageId,
    committedAt: Date.parse(terminal.completedAt!),
  };
  return { ...body, digest: await digest(body) };
};

export async function acceptTerraJobSnapshotV1(descriptor: TerraPendingDescriptorV1, value: unknown) {
  if (!validDescriptor(descriptor)) throw new Error("invalid-terra-descriptor");
  const incoming = normalizeAiAnimatorJobSnapshot(value);
  if (!incoming || incoming.jobId !== descriptor.jobId || incoming.turnId !== descriptor.turnId || incoming.projectId !== descriptor.projectId || incoming.projectGeneration !== descriptor.projectGeneration) throw new Error("invalid-terra-job-update");
  const terminalSource = await withTerraLock(async (): Promise<{ snapshot: AiAnimatorJobSnapshot; ledgerTerminal: TerraLedgerTerminalV1 } | null> => {
    const { ledger, revision } = await readAccountAiAnimatorLedger(descriptor.projectId);
    const previous = ledger.jobs.find(job => job.jobId === descriptor.jobId);
    const pending = await readPending();
    const liveDescriptor = pending.rows.find(row => row.jobId === descriptor.jobId);
    const replacesProvisionalStart = liveDescriptor?.acceptedAt === null && previous?.status === "thinking" && previous.lastSequence === 1;
    if (!replacesProvisionalStart) verifySequence(previous, incoming);
    let next = upsertAiAnimatorJob(ledger, incoming);
    if (isAiAnimatorTerminalStatus(incoming.status)) {
      const messageId = `terra_${incoming.jobId}_terminal`;
      if (!next.messages.some(message => message.jobId === incoming.jobId && message.role === "assistant")) {
        next = { ...next, messages: [...next.messages, { id: messageId, jobId: incoming.jobId, role: "assistant", content: terminalMessage(incoming), createdAt: incoming.completedAt! }] };
      }
      await writeAccountAiAnimatorLedger(next, revision);
      const reread = (await readAccountAiAnimatorLedger(descriptor.projectId)).ledger;
      const terminal = reread.jobs.find(job => job.jobId === descriptor.jobId);
      const savedMessage = reread.messages.find(message => message.jobId === descriptor.jobId && message.role === "assistant");
      if (!terminal || !isAiAnimatorTerminalStatus(terminal.status) || !savedMessage || stableJson(terminal) !== stableJson(incoming)) throw new Error("terra-terminal-reread-failed");
      const occurredAt = Date.parse(terminal.completedAt ?? "");
      if (!Number.isSafeInteger(occurredAt) || occurredAt <= 0) throw new Error("terra-terminal-time-invalid");
      const source = { snapshot: terminal, ledgerTerminal: await buildLedgerTerminal(descriptor, terminal, savedMessage.id) };
      await writePending(pending.rows.filter(row => row.jobId !== descriptor.jobId), pending.revision);
      return source;
    } else {
      await writeAccountAiAnimatorLedger(next, revision);
      if (descriptor.acceptedAt === null) {
        await writePending(pending.rows.map(row => row.jobId === descriptor.jobId ? { ...row, acceptedAt: Date.now() } : row), pending.revision);
      }
      return null;
    }
  });
  emit((await readPending()).rows);
  if (terminalSource && terminalSource.snapshot.status !== "cancelled") {
    const outcome = terminalSource.snapshot.status;
    if (outcome !== "done" && outcome !== "failed") throw new Error("terra-terminal-outcome-invalid");
    await publishValidatedNotificationTerminalV1({
      schema: "terra-notification-terminal/v1",
      snapshot: terminalSource.snapshot,
      workspaceIdentity: descriptor.workspaceIdentity,
      projectId: descriptor.projectId,
      projectGeneration: descriptor.projectGeneration,
      projectTitle: descriptor.projectTitle,
      ledgerTerminal: terminalSource.ledgerTerminal,
      outcome,
      occurredAt: terminalSource.ledgerTerminal.committedAt,
    });
  }
  scheduleScan(0);
  return isAiAnimatorTerminalStatus(incoming.status);
}

const failureSnapshot = (descriptor: TerraPendingDescriptorV1, previous: AiAnimatorJobSnapshot, code: string, message: string): AiAnimatorJobSnapshot => {
  const completedAt = new Date().toISOString();
  return {
    ...previous,
    status: "failed",
    intent: null,
    lastSequence: previous.lastSequence + 1,
    updatedAt: completedAt,
    completedAt,
    telemetry: { ...previous.telemetry, outcome: "failed", latencyMs: Math.max(0, Date.now() - Date.parse(previous.createdAt)) },
    events: [...previous.events, { sequence: previous.lastSequence + 1, status: "failed", createdAt: completedAt, errorCode: code, errorMessage: message }],
  };
};

const poll = async (descriptor: TerraPendingDescriptorV1, controller: AbortController) => {
  try {
    while (!controller.signal.aborted && rootOwners > 0) {
      const current = (await readPending()).rows.find(row => row.jobId === descriptor.jobId);
      if (!current) break;
      const ledger = (await readAccountAiAnimatorLedger(current.projectId)).ledger;
      const previous = ledger.jobs.find(job => job.jobId === current.jobId);
      if (!previous || isAiAnimatorTerminalStatus(previous.status)) break;
      const response = await fetch(`/api/ai-animator?jobId=${encodeURIComponent(current.jobId)}&projectId=${encodeURIComponent(current.projectId)}`, {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      if (response.status === 404 && current.acceptedAt === null && Date.now() - current.createdAt < PREPARED_GRACE_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      const body = await response.json().catch(() => null);
      const next = normalizeAiAnimatorJobSnapshot(body);
      if (!response.ok || !next) {
        const failed = failureSnapshot(current, previous, response.status === 404 ? "server_interrupted" : "reconnect_failed", response.status === 404
          ? "The server was interrupted before Terra finished. No animation changed. Send the message again to retry."
          : "AI Animator could not reconnect. No animation changed.");
        await acceptTerraJobSnapshotV1(current, failed);
        break;
      }
      if (await acceptTerraJobSnapshotV1(current, next)) break;
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      const current = (await readPending()).rows.find(row => row.jobId === descriptor.jobId);
      const previous = current ? (await readAccountAiAnimatorLedger(current.projectId)).ledger.jobs.find(job => job.jobId === current.jobId) : null;
      if (current && previous && !isAiAnimatorTerminalStatus(previous.status)) {
        await acceptTerraJobSnapshotV1(current, failureSnapshot(current, previous, "reconnect_failed", error instanceof Error ? error.message : "AI Animator could not reconnect. No animation changed.")).catch(failure => {
          emit(snapshot.pending, { ...snapshot.faults, [descriptor.jobId]: failure instanceof Error ? failure.message : "Terra terminalization failed." });
        });
      }
    }
  } finally {
    polling.delete(descriptor.jobId);
    scheduleScan(POLL_INTERVAL_MS);
  }
};

async function scan() {
  if (scanInFlight || rootOwners === 0) return;
  scanInFlight = true;
  try {
    const rows = (await readPending()).rows;
    emit(rows);
    for (const descriptor of rows) {
      if (posting.has(descriptor.jobId) || polling.has(descriptor.jobId)) continue;
      const controller = new AbortController();
      polling.set(descriptor.jobId, controller);
      void poll(descriptor, controller);
    }
  } finally { scanInFlight = false; }
}

function scheduleScan(delay = POLL_INTERVAL_MS) {
  if (rootOwners === 0 || scanTimer) return;
  scanTimer = setTimeout(() => { scanTimer = null; void scan(); }, delay);
}

export function startTerraCompletionObserverV1() {
  rootOwners += 1;
  if (rootOwners === 1 && typeof window !== "undefined") {
    const changed = () => scheduleScan(0);
    const visible = () => { if (document.visibilityState === "visible") scheduleScan(0); };
    window.addEventListener(TERRA_PENDING_CHANGED_EVENT_V1, changed);
    window.addEventListener("storage", changed);
    window.addEventListener("focus", changed);
    document.addEventListener("visibilitychange", visible);
    const unsubscribeAccount = subscribeAccountDataChanges("terra-pending", "all", changed);
    (startTerraCompletionObserverV1 as unknown as { cleanup?: () => void }).cleanup = () => {
      window.removeEventListener(TERRA_PENDING_CHANGED_EVENT_V1, changed);
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", changed);
      document.removeEventListener("visibilitychange", visible);
      unsubscribeAccount();
    };
    scheduleScan(0);
  }
  return () => {
    rootOwners = Math.max(0, rootOwners - 1);
    if (rootOwners > 0) return;
    (startTerraCompletionObserverV1 as unknown as { cleanup?: () => void }).cleanup?.();
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    for (const controller of polling.values()) controller.abort();
    polling.clear();
  };
}

export function getPendingTerraDescriptorV1(jobId: string) {
  return snapshot.pending.find(row => row.jobId === jobId) ?? null;
}

export async function rebindPendingTerraProjectV1(workspaceIdentity: string, projectId: string, projectTitle: string) {
  const rows = await withTerraLock(async () => {
    const pending = await readPending();
    const matches = pending.rows.filter(row => row.workspaceIdentity === workspaceIdentity);
    if (!matches.length || matches.every(row => row.projectId === projectId && row.projectTitle === sanitizeProjectTitle(projectTitle))) return pending.rows;
    // Current accepted server jobs are keyed by projectId. Rebinding is safe only
    // before acceptance; accepted jobs keep their exact original project identity.
    if (matches.some(row => row.acceptedAt !== null && row.projectId !== projectId)) throw new Error("terra-accepted-project-rebind-blocked");
    const nextRows = pending.rows.map(row => row.workspaceIdentity !== workspaceIdentity ? row : { ...row, projectId, projectTitle: sanitizeProjectTitle(projectTitle) });
    await writePending(nextRows, pending.revision);
    return nextRows;
  });
  emit(rows);
}
