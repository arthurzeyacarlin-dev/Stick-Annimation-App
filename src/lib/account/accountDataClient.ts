"use client";

import type { AccountDataNamespace } from "./accountDataServer";

export type AccountDataClientRecord = {
  revision: number;
  digest: string;
  updatedAt: string;
  payload: Uint8Array;
};

type PendingWrite = { ownerId: string; promise: Promise<unknown> };
const pendingWrites = new Set<PendingWrite>();
const failedOwners = new Set<string>();
const ownerListeners = new Set<(ownerId: string | null, previousOwnerId: string | null) => void>();
let configuredOwnerId: string | null = null;

const LEASE_PREFIX = "diamond-account-data-write:";
const LEASE_MS = 15_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const currentOwner = () => {
  if (!configuredOwnerId) throw new Error("account_session_required");
  return configuredOwnerId;
};

export const configureAccountDataOwner = (ownerId: string | null) => {
  if (configuredOwnerId === ownerId) return;
  const previous = configuredOwnerId;
  configuredOwnerId = ownerId;
  for (const listener of ownerListeners) listener(ownerId, previous);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("diamond-account-owner-changed-v1", { detail: { ownerId } }));
};

export const getConfiguredAccountDataOwner = () => configuredOwnerId;
export const subscribeAccountDataOwner = (listener: (ownerId: string | null, previousOwnerId: string | null) => void) => {
  ownerListeners.add(listener);
  return () => { ownerListeners.delete(listener); };
};

const endpoint = (namespace: AccountDataNamespace, key: string) =>
  `/api/account/data?namespace=${encodeURIComponent(namespace)}&key=${encodeURIComponent(key)}`;

const responseRecord = async (response: Response): Promise<AccountDataClientRecord> => {
  const revision = Number(response.headers.get("x-account-data-revision"));
  const digest = response.headers.get("x-account-data-digest") ?? "";
  const updatedAt = response.headers.get("x-account-data-updated-at") ?? "";
  if (!Number.isSafeInteger(revision) || revision < 1 || !/^[0-9a-f]{64}$/.test(digest) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("account_data_readback_invalid");
  }
  return { revision, digest, updatedAt, payload: new Uint8Array(await response.arrayBuffer()) };
};

export async function readAccountData(namespace: AccountDataNamespace, key: string): Promise<AccountDataClientRecord | null> {
  currentOwner();
  const response = await fetch(endpoint(namespace, key), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (response.status === 204 || response.headers.get("X-Account-Data-Missing") === "1") return null;
  if (!response.ok) throw new Error(response.status === 401 ? "account_session_required" : "account_data_read_failed");
  return responseRecord(response);
}

const holdLease = (ownerId: string) => {
  const key = `${LEASE_PREFIX}${encodeURIComponent(ownerId)}:${crypto.randomUUID()}`;
  let stopped = false;
  let releaseWebLock: (() => void) | null = null;
  const refresh = () => {
    if (!stopped) localStorage.setItem(key, JSON.stringify({ expiresAt: Date.now() + LEASE_MS }));
  };
  refresh();
  const heartbeat = window.setInterval(refresh, LEASE_MS / 3);
  if (navigator.locks) {
    void navigator.locks.request(`${LEASE_PREFIX}${ownerId}`, { mode: "shared" }, async () => {
      if (!stopped) await new Promise<void>(resolve => { releaseWebLock = resolve; });
    }).catch(() => undefined);
  }
  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(heartbeat);
    localStorage.removeItem(key);
    releaseWebLock?.();
  };
};

const notify = (namespace: AccountDataNamespace, key: string) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("diamond-account-data-changed-v1", { detail: { namespace, key } }));
  try {
    const channel = new BroadcastChannel("diamond-account-data-invalidation-v1");
    channel.postMessage({ namespace, key });
    channel.close();
  } catch { /* focus polling remains authoritative */ }
};

const tracked = async <T>(ownerId: string, work: () => Promise<T>): Promise<T> => {
  const release = holdLease(ownerId);
  const entry: PendingWrite = { ownerId, promise: Promise.resolve() };
  const operation = Promise.resolve().then(work);
  entry.promise = operation;
  pendingWrites.add(entry);
  try {
    const result = await operation;
    failedOwners.delete(ownerId);
    return result;
  } catch (error) {
    failedOwners.add(ownerId);
    throw error;
  } finally {
    pendingWrites.delete(entry);
    release();
  }
};

export async function writeAccountData(namespace: AccountDataNamespace, key: string, payload: Uint8Array, expectedRevision: number) {
  const ownerId = currentOwner();
  return tracked(ownerId, async () => {
    const response = await fetch(endpoint(namespace, key), {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "X-Account-Data-Expected-Revision": String(expectedRevision) },
      body: payload as BodyInit,
      signal: AbortSignal.timeout(namespace === "recovery" ? 45_000 : 15_000),
    });
    if (!response.ok) throw new Error(response.status === 409 ? "account_data_conflict" : response.status === 413 ? "account_data_capacity" : "account_data_write_failed");
    const body = await response.json() as { revision?: unknown; digest?: unknown; updatedAt?: unknown };
    if (!Number.isSafeInteger(body.revision) || typeof body.digest !== "string" || !/^[0-9a-f]{64}$/.test(body.digest) || typeof body.updatedAt !== "string") {
      throw new Error("account_data_readback_invalid");
    }
    notify(namespace, key);
    return { revision: body.revision as number, digest: body.digest, updatedAt: body.updatedAt };
  });
}

export async function deleteAccountData(namespace: AccountDataNamespace, key: string, expectedRevision: number) {
  const ownerId = currentOwner();
  return tracked(ownerId, async () => {
    const response = await fetch(endpoint(namespace, key), {
      method: "DELETE",
      headers: { "X-Account-Data-Expected-Revision": String(expectedRevision) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(response.status === 409 ? "account_data_conflict" : "account_data_delete_failed");
    const body = await response.json() as { removed?: unknown };
    if (body.removed !== true) throw new Error("account_data_delete_readback_failed");
    notify(namespace, key);
  });
}

export async function readAccountJson<T>(namespace: AccountDataNamespace, key: string): Promise<(AccountDataClientRecord & { value: T }) | null> {
  const record = await readAccountData(namespace, key);
  if (!record) return null;
  return { ...record, value: JSON.parse(textDecoder.decode(record.payload)) as T };
}

export const writeAccountJson = <T>(namespace: AccountDataNamespace, key: string, value: T, expectedRevision: number) =>
  writeAccountData(namespace, key, textEncoder.encode(JSON.stringify(value)), expectedRevision);

export function subscribeAccountDataChanges(namespace: AccountDataNamespace, key: string, listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const changed = (event: Event) => {
    const detail = (event as CustomEvent<{ namespace?: unknown; key?: unknown }>).detail;
    if (detail?.namespace === namespace && detail.key === key) listener();
  };
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel("diamond-account-data-invalidation-v1");
    channel.onmessage = event => {
      if (event.data?.namespace === namespace && event.data?.key === key) listener();
    };
  } catch { /* focus polling remains authoritative */ }
  window.addEventListener("diamond-account-data-changed-v1", changed);
  const focus = () => listener();
  window.addEventListener("focus", focus);
  return () => {
    window.removeEventListener("diamond-account-data-changed-v1", changed);
    window.removeEventListener("focus", focus);
    channel?.close();
  };
}

const activeLeases = (ownerId: string) => {
  const prefix = `${LEASE_PREFIX}${encodeURIComponent(ownerId)}:`;
  const now = Date.now();
  let count = 0;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const record = JSON.parse(localStorage.getItem(key) ?? "null") as { expiresAt?: unknown } | null;
    if (typeof record?.expiresAt !== "number" || record.expiresAt <= now) localStorage.removeItem(key);
    else count += 1;
  }
  return count;
};

export const runAccountDataLogout = async (ownerId: string, signOut: () => Promise<void>) => {
  const writes = [...pendingWrites].filter(entry => entry.ownerId === ownerId);
  const results = await Promise.allSettled(writes.map(entry => entry.promise));
  if (results.some(result => result.status === "rejected") || failedOwners.has(ownerId)) throw new Error("account_data_pending_failed");
  if (navigator.locks) {
    let acquired = false;
    await navigator.locks.request(`${LEASE_PREFIX}${ownerId}`, { mode: "exclusive", ifAvailable: true }, async lock => {
      if (!lock) return;
      acquired = true;
      if (activeLeases(ownerId) > 0) throw new Error("account_data_other_tab_dirty");
      await signOut();
    });
    if (!acquired) throw new Error("account_data_other_tab_dirty");
  } else {
    if (activeLeases(ownerId) > 0) throw new Error("account_data_other_tab_dirty");
    await signOut();
  }
  failedOwners.delete(ownerId);
};
