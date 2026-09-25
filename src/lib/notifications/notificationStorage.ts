import { stableJson } from "../assistant/assistantContracts.ts";
import {
  createNotificationEnvelopeFromTerminalV1,
  notificationBelongsToViewV1,
  notificationIdentityEqualsV1,
  resealNotificationReadStateV1,
  validateNotificationEnvelopeV1,
  type DiamondNotificationEnvelopeV1,
  type DiamondNotificationV1,
  type NotificationTargetV1,
  type NotificationTerminalReceiptV1,
} from "./notificationContracts.ts";
import { hasVisibleExactNotificationOriginV1 } from "./notificationNavigation.ts";

export const DIAMOND_NOTIFICATION_DATABASE_V1 = "diamond-notifications-v1";
export const DIAMOND_NOTIFICATION_STORES_V1 = Object.freeze({ notifications: "notifications", metadata: "metadata", leases: "leases" });
export const DIAMOND_NOTIFICATION_MAX_ROWS_V1 = 500;
export const DIAMOND_NOTIFICATION_MAX_DURABLE_BYTES_V1 = 2 * 1024 * 1024;

type StoredNotificationRowV1 = { recordKey: string; envelope: unknown };
type MetadataRowV1 = { key: "state"; revision: number };
type LeaseRowV1 = { key: "writer"; owner: string; expiresAt: number };

export type NotificationStorageFaultV1 = {
  code: "unavailable" | "blocked" | "version" | "quota" | "corrupt-rows" | "integrity" | "cas" | "lease" | "write";
  message: string;
};

export type ValidatedNotificationSnapshotV1 = {
  rows: DiamondNotificationV1[];
  envelopes: DiamondNotificationEnvelopeV1[];
  revision: number;
  fault: NotificationStorageFaultV1 | null;
};

export type NotificationPublicationResultV1 = {
  status: "committed" | "duplicate";
  notification: DiamondNotificationV1;
};

const emptySnapshot = (): ValidatedNotificationSnapshotV1 => ({ rows: [], envelopes: [], revision: 0, fault: null });
let snapshot = emptySnapshot();
let databasePromise: Promise<IDBDatabase> | null = null;
let broadcast: BroadcastChannel | null = null;
let rereadTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(value: ValidatedNotificationSnapshotV1) => void>();
const commitListeners = new Set<(notification: DiamondNotificationV1) => void>();
let proofLockMode: "auto" | "lease" = "auto";
let beforeCommitProofHook: (() => Promise<void>) | null = null;

const bytesOf = (value: unknown) => {
  try { return new TextEncoder().encode(stableJson(value)).byteLength; }
  catch { return Number.POSITIVE_INFINITY; }
};
const classifyError = (error: unknown): NotificationStorageFaultV1 => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "VersionError") return { code: "version", message: "Notification storage was created by an unsupported version." };
  if (name === "QuotaExceededError") return { code: "quota", message: "Notification storage is full." };
  if (String(error).includes("blocked")) return { code: "blocked", message: "Notification storage is blocked by another tab." };
  if (String(error).includes("lease")) return { code: "lease", message: "Notification storage could not acquire its fallback writer lease." };
  if (String(error).includes("compare-and-swap")) return { code: "cas", message: "Notification storage changed during a write." };
  if (String(error).includes("conflicting-terminal")) return { code: "integrity", message: "A conflicting terminal result was preserved as an integrity fault." };
  return { code: "write", message: "Notification storage could not be read or written." };
};

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("indexeddb-request-failed"));
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb-transaction-aborted"));
  transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb-transaction-failed"));
});

const openDatabase = () => {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("indexeddb-unavailable"));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DIAMOND_NOTIFICATION_DATABASE_V1, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DIAMOND_NOTIFICATION_STORES_V1.notifications)) database.createObjectStore(DIAMOND_NOTIFICATION_STORES_V1.notifications, { keyPath: "recordKey" });
      if (!database.objectStoreNames.contains(DIAMOND_NOTIFICATION_STORES_V1.metadata)) database.createObjectStore(DIAMOND_NOTIFICATION_STORES_V1.metadata, { keyPath: "key" });
      if (!database.objectStoreNames.contains(DIAMOND_NOTIFICATION_STORES_V1.leases)) database.createObjectStore(DIAMOND_NOTIFICATION_STORES_V1.leases, { keyPath: "key" });
    };
    request.onblocked = () => { blocked = true; reject(new Error("indexeddb-open-blocked")); };
    request.onerror = () => reject(request.error ?? new Error("indexeddb-open-failed"));
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  }).catch(error => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
};

const readRawState = async () => {
  const database = await openDatabase();
  const transaction = database.transaction([DIAMOND_NOTIFICATION_STORES_V1.notifications, DIAMOND_NOTIFICATION_STORES_V1.metadata], "readonly");
  const rows = await requestResult(transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.notifications).getAll()) as StoredNotificationRowV1[];
  const metadata = await requestResult(transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.metadata).get("state")) as MetadataRowV1 | undefined;
  await transactionDone(transaction);
  if (metadata !== undefined && (!metadata || typeof metadata !== "object" || Object.keys(metadata).sort().join("|") !== "key|revision" || metadata.key !== "state" || !Number.isSafeInteger(metadata.revision) || metadata.revision < 0)) throw new Error("corrupt-notification-metadata");
  return { rows, revision: metadata?.revision ?? 0 };
};

const validateRawState = async (state: Awaited<ReturnType<typeof readRawState>>) => {
  const envelopes: DiamondNotificationEnvelopeV1[] = [];
  let corruptCount = 0;
  for (const row of state.rows) {
    try {
      if (!row || typeof row !== "object" || Object.keys(row).sort().join("|") !== "envelope|recordKey" || typeof row.recordKey !== "string") throw new Error("corrupt-notification-row");
      const envelope = await validateNotificationEnvelopeV1(row.envelope);
      if (row.recordKey !== envelope.notification.notificationId) throw new Error("corrupt-notification-key");
      envelopes.push(envelope);
    } catch { corruptCount += 1; }
  }
  envelopes.sort((left, right) => right.notification.createdAt - left.notification.createdAt || left.notification.notificationId.localeCompare(right.notification.notificationId));
  return { envelopes, corruptCount };
};

const emitSnapshot = (next: ValidatedNotificationSnapshotV1) => {
  snapshot = next;
  for (const listener of listeners) listener(next);
};

const ensureInvalidationSources = () => {
  if (typeof window === "undefined") return;
  if (!broadcast && typeof BroadcastChannel !== "undefined") {
    broadcast = new BroadcastChannel("diamond-notifications-v1-invalidation");
    broadcast.onmessage = () => { void refreshNotificationsV1(); };
  }
  if (!rereadTimer) {
    const authoritative = () => { if (document.visibilityState === "visible") void refreshNotificationsV1(); };
    window.addEventListener("focus", authoritative);
    document.addEventListener("visibilitychange", authoritative);
    rereadTimer = setInterval(authoritative, 3_000);
  }
};

export async function refreshNotificationsV1(): Promise<ValidatedNotificationSnapshotV1> {
  try {
    const raw = await readRawState();
    const validated = await validateRawState(raw);
    const fault = validated.corruptCount ? { code: "corrupt-rows", message: `${validated.corruptCount} notification record${validated.corruptCount === 1 ? "" : "s"} failed validation. The raw bytes were preserved.` } as const : null;
    const next = { rows: validated.envelopes.map(row => row.notification), envelopes: validated.envelopes, revision: raw.revision, fault };
    emitSnapshot(next);
    return next;
  } catch (error) {
    const fault = String(error).includes("corrupt-notification-metadata") ? { code: "corrupt-rows", message: "Notification metadata failed validation. Its raw bytes were preserved." } as const : classifyError(error);
    const next = { rows: [], envelopes: [], revision: snapshot.revision, fault };
    emitSnapshot(next);
    return next;
  }
}

export async function getValidatedNotificationSnapshotV1() {
  ensureInvalidationSources();
  return refreshNotificationsV1();
}

export function subscribeNotificationsV1(listener: (value: ValidatedNotificationSnapshotV1) => void) {
  listeners.add(listener);
  ensureInvalidationSources();
  listener(snapshot);
  void refreshNotificationsV1();
  return () => { listeners.delete(listener); };
}

export function subscribeNotificationCommitsV1(listener: (notification: DiamondNotificationV1) => void) {
  commitListeners.add(listener);
  return () => { commitListeners.delete(listener); };
}

const acquireLease = async (owner: string) => {
  const database = await openDatabase();
  const transaction = database.transaction(DIAMOND_NOTIFICATION_STORES_V1.leases, "readwrite");
  const store = transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.leases);
  const current = await requestResult(store.get("writer")) as LeaseRowV1 | undefined;
  const now = Date.now();
  if (current && current.owner !== owner && current.expiresAt > now) {
    transaction.abort();
    throw new Error("fallback-lease-busy");
  }
  store.put({ key: "writer", owner, expiresAt: now + 4_000 } satisfies LeaseRowV1);
  await transactionDone(transaction);
};

const renewLease = async (owner: string) => {
  const database = await openDatabase();
  const transaction = database.transaction(DIAMOND_NOTIFICATION_STORES_V1.leases, "readwrite");
  const store = transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.leases);
  const current = await requestResult(store.get("writer")) as LeaseRowV1 | undefined;
  if (!current || current.owner !== owner) { transaction.abort(); throw new Error("fallback-lease-lost"); }
  store.put({ key: "writer", owner, expiresAt: Date.now() + 4_000 } satisfies LeaseRowV1);
  await transactionDone(transaction);
};

const releaseLease = async (owner: string) => {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(DIAMOND_NOTIFICATION_STORES_V1.leases, "readwrite");
    const store = transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.leases);
    const current = await requestResult(store.get("writer")) as LeaseRowV1 | undefined;
    if (current?.owner === owner) store.delete("writer");
    await transactionDone(transaction);
  } catch { /* an expired lease is recoverable */ }
};

const withSerializedWriter = async <T>(operation: (leaseOwner: string | null) => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (proofLockMode === "auto" && locks?.request) return locks.request("diamond-notifications-v1-writer", { mode: "exclusive" }, () => operation(null));
  const owner = crypto.randomUUID();
  await acquireLease(owner);
  let heartbeatError: unknown = null;
  const heartbeat = setInterval(() => { void renewLease(owner).catch(error => { heartbeatError ??= error; }); }, 1_000);
  try {
    const result = await operation(owner);
    if (heartbeatError) throw heartbeatError;
    return result;
  }
  finally { clearInterval(heartbeat); await releaseLease(owner); }
};

type Mutation = {
  rows: StoredNotificationRowV1[];
  result: unknown;
  changed: boolean;
  committedNotification?: DiamondNotificationV1;
  finalize?: () => Omit<Mutation, "finalize">;
};

const commitMutation = async <T>(mutator: (rows: StoredNotificationRowV1[], envelopes: DiamondNotificationEnvelopeV1[]) => Promise<Mutation>): Promise<T> => withSerializedWriter(async leaseOwner => {
  const observed = await readRawState();
  const validated = await validateRawState(observed);
  const mutation = await mutator(structuredClone(observed.rows), validated.envelopes);
  if (!mutation.changed) return mutation.result as T;
  if (beforeCommitProofHook) {
    const hook = beforeCommitProofHook;
    beforeCommitProofHook = null;
    await hook();
  }
  const database = await openDatabase();
  const storeNames = [DIAMOND_NOTIFICATION_STORES_V1.notifications, DIAMOND_NOTIFICATION_STORES_V1.metadata, DIAMOND_NOTIFICATION_STORES_V1.leases];
  const transaction = database.transaction(storeNames, "readwrite");
  const notificationStore = transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.notifications);
  const metadataStore = transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.metadata);
  const liveRows = await requestResult(notificationStore.getAll()) as StoredNotificationRowV1[];
  const liveMetadata = await requestResult(metadataStore.get("state")) as MetadataRowV1 | undefined;
  const liveRevision = liveMetadata === undefined ? 0 : liveMetadata && typeof liveMetadata === "object" && Object.keys(liveMetadata).sort().join("|") === "key|revision" && liveMetadata.key === "state" && Number.isSafeInteger(liveMetadata.revision) && liveMetadata.revision >= 0 ? liveMetadata.revision : -1;
  if (liveRevision !== observed.revision || stableJson(liveRows) !== stableJson(observed.rows)) {
    transaction.abort();
    throw new Error("compare-and-swap-failed");
  }
  if (leaseOwner) {
    const lease = await requestResult(transaction.objectStore(DIAMOND_NOTIFICATION_STORES_V1.leases).get("writer")) as LeaseRowV1 | undefined;
    if (!lease || lease.owner !== leaseOwner || lease.expiresAt <= Date.now()) { transaction.abort(); throw new Error("fallback-lease-final-verification-failed"); }
  }
  const finalMutation = mutation.finalize ? mutation.finalize() : mutation;
  if (!finalMutation.changed) {
    await transactionDone(transaction);
    return finalMutation.result as T;
  }
  notificationStore.clear();
  for (const row of finalMutation.rows) notificationStore.put(row);
  metadataStore.put({ key: "state", revision: observed.revision + 1 } satisfies MetadataRowV1);
  await transactionDone(transaction);
  broadcast?.postMessage({ revision: observed.revision + 1 });
  await refreshNotificationsV1();
  if (finalMutation.committedNotification) for (const listener of commitListeners) listener(finalMutation.committedNotification);
  return finalMutation.result as T;
}).catch(error => {
  const fault = String(error).includes("corrupt-notification") ? { code: "corrupt-rows", message: "A notification record failed validation. Its bytes were preserved." } as const : classifyError(error);
  emitSnapshot({ ...snapshot, fault });
  throw error;
});

const fitRowsWithinLimits = async (rows: StoredNotificationRowV1[], protectedKeys: ReadonlySet<string> = new Set()) => {
  const working = [...rows];
  const valid = new Map<string, DiamondNotificationEnvelopeV1>();
  for (const row of working) {
    try {
      const envelope = await validateNotificationEnvelopeV1(row.envelope);
      if (row.recordKey === envelope.notification.notificationId) valid.set(row.recordKey, envelope);
    } catch { /* corrupt rows remain immutable capacity occupants */ }
  }
  const over = () => working.length > DIAMOND_NOTIFICATION_MAX_ROWS_V1 || bytesOf(working) > DIAMOND_NOTIFICATION_MAX_DURABLE_BYTES_V1;
  const readCandidates = [...valid.values()].filter(envelope => envelope.notification.readAt !== null && !protectedKeys.has(envelope.notification.notificationId)).sort((left, right) => left.notification.createdAt - right.notification.createdAt || left.notification.notificationId.localeCompare(right.notification.notificationId));
  while (over() && readCandidates.length) {
    const candidate = readCandidates.shift()!;
    const index = working.findIndex(row => row.recordKey === candidate.notification.notificationId);
    if (index >= 0) working.splice(index, 1);
  }
  if (over()) throw new DOMException("Unread notifications cannot be evicted.", "QuotaExceededError");
  return working;
};

export async function publishValidatedNotificationTerminalV1(receipt: NotificationTerminalReceiptV1): Promise<NotificationPublicationResultV1> {
  const unreadEnvelope = await createNotificationEnvelopeFromTerminalV1(receipt, null);
  const readEnvelope = await resealNotificationReadStateV1(unreadEnvelope, unreadEnvelope.notification.createdAt);
  return commitMutation<NotificationPublicationResultV1>(async (rows, envelopes) => {
    const existing = envelopes.find(candidate => candidate.notification.notificationId === unreadEnvelope.notification.notificationId);
    if (existing) {
      const sameTerminal = stableJson(existing.binding) === stableJson(unreadEnvelope.binding);
      if (!sameTerminal) throw new Error("conflicting-terminal-outcome");
      return { rows, changed: false, result: { status: "duplicate", notification: existing.notification } satisfies NotificationPublicationResultV1 };
    }
    const incomingKey = unreadEnvelope.notification.notificationId;
    if (rows.some(row => row.recordKey === incomingKey)) throw new Error("conflicting-terminal-corrupt-key-collision");
    const capacityRows = await fitRowsWithinLimits([...rows, { recordKey: incomingKey, envelope: readEnvelope }], new Set([incomingKey]));
    const chooseAtCommit = () => {
      const envelope = hasVisibleExactNotificationOriginV1(unreadEnvelope.notification.origin) ? readEnvelope : unreadEnvelope;
      const finalRows = capacityRows.map(row => row.recordKey === incomingKey ? { recordKey: incomingKey, envelope } : row);
      return {
        rows: finalRows,
        changed: true,
        result: { status: "committed", notification: envelope.notification } satisfies NotificationPublicationResultV1,
        committedNotification: envelope.notification.readAt === null ? envelope.notification : undefined,
      };
    };
    return {
      rows: capacityRows,
      changed: true,
      result: { status: "committed", notification: readEnvelope.notification } satisfies NotificationPublicationResultV1,
      finalize: chooseAtCommit,
    };
  });
}

const markMatchingRead = async (matches: (notification: DiamondNotificationV1) => boolean, commitGuard?: () => boolean) => commitMutation<number>(async (rows, envelopes) => {
  const now = Date.now();
  let count = 0;
  const changed = new Map<string, DiamondNotificationEnvelopeV1>();
  for (const envelope of envelopes) {
    if (envelope.notification.readAt === null && matches(envelope.notification)) {
      changed.set(envelope.notification.notificationId, await resealNotificationReadStateV1(envelope, Math.max(now, envelope.notification.createdAt)));
      count += 1;
    }
  }
  if (!count) return { rows, changed: false, result: 0 };
  const nextRows = rows.map(row => changed.has(row.recordKey) ? { recordKey: row.recordKey, envelope: changed.get(row.recordKey)! } : row);
  const fittedRows = await fitRowsWithinLimits(nextRows);
  return {
    rows: fittedRows,
    changed: true,
    result: count,
    finalize: commitGuard ? () => commitGuard() ? { rows: fittedRows, changed: true, result: count } : { rows, changed: false, result: 0 } : undefined,
  };
});

export const markNotificationReadV1 = (notificationId: string) => markMatchingRead(notification => notification.notificationId === notificationId);
export const markAllNotificationsReadV1 = (view: "home" | "assistant") => markMatchingRead(notification => notificationBelongsToViewV1(notification, view));
export const markNotificationsReadForTargetV1 = (target: NotificationTargetV1, commitGuard?: () => boolean) => markMatchingRead(notification => notificationIdentityEqualsV1(notification.target, target), commitGuard);

export async function retryNotificationRecoveryV1() {
  if (databasePromise) {
    try { (await databasePromise).close(); } catch { /* reopen below */ }
  }
  databasePromise = null;
  return refreshNotificationsV1();
}

export function __setNotificationLockModeForProofV1(mode: "auto" | "lease") { proofLockMode = mode; }
export function __setNotificationBeforeCommitHookForProofV1(hook: (() => Promise<void>) | null) { beforeCommitProofHook = hook; }

export function __closeNotificationStorageForProofV1() {
  if (databasePromise) void databasePromise.then(database => database.close()).catch(() => undefined);
  databasePromise = null;
  broadcast?.close();
  broadcast = null;
  if (rereadTimer) clearInterval(rereadTimer);
  rereadTimer = null;
  snapshot = emptySnapshot();
  beforeCommitProofHook = null;
}
