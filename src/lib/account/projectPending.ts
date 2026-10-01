"use client";

import { runAccountDataLogout } from "./accountDataClient";

const LEASE_PREFIX = "diamond-p4u-owner-write:";
const LEASE_MS = 15_000;
const pending = new Set<{ ownerId: string; promise: Promise<unknown> }>();
const failedOwners = new Set<string>();

type DirtyEditor = { ownerId: string; dirty: boolean; save: () => Promise<boolean>; release: () => void };
let editor: DirtyEditor | null = null;

const lockName = (ownerId: string) => `diamond-p4u-owner-write:${ownerId}`;
const activeLeases = (ownerId: string) => {
  const now = Date.now();
  let count = 0;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(`${LEASE_PREFIX}${ownerId}:`)) continue;
      const record = JSON.parse(localStorage.getItem(key) ?? "null") as { expiresAt?: unknown } | null;
      if (typeof record?.expiresAt !== "number" || record.expiresAt <= now) {
        localStorage.removeItem(key);
      } else count += 1;
    }
  } catch { throw new Error("account_project_logout_check_failed"); }
  return count;
};

const holdOwnerWriteLease = (ownerId: string) => {
  const key = `${LEASE_PREFIX}${ownerId}:${crypto.randomUUID()}`;
  let stopped = false;
  let releaseWebLock: (() => void) | null = null;
  const refresh = () => {
    if (stopped) return;
    localStorage.setItem(key, JSON.stringify({ expiresAt: Date.now() + LEASE_MS }));
  };
  refresh();
  const heartbeat = window.setInterval(refresh, LEASE_MS / 3);
  if (navigator.locks) {
    void navigator.locks.request(lockName(ownerId), { mode: "shared" }, async () => {
      if (stopped) return;
      await new Promise<void>(resolve => { releaseWebLock = resolve; });
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

export const registerAccountDirtyEditor = (ownerId: string, save: () => Promise<boolean>) => {
  const current: DirtyEditor = { ownerId, dirty: false, save, release: () => undefined };
  editor = current;
  const setDirty = (dirty: boolean) => {
    if (editor !== current || current.dirty === dirty) return;
    current.dirty = dirty;
    if (dirty) current.release = holdOwnerWriteLease(ownerId);
    else { current.release(); current.release = () => undefined; }
  };
  return {
    setDirty,
    dispose: () => {
      current.release();
      if (editor === current) editor = null;
    },
  };
};

export const withAccountProjectWrite = async <T>(ownerId: string, work: () => Promise<T>): Promise<T> => {
  const release = holdOwnerWriteLease(ownerId);
  const entry = { ownerId, promise: Promise.resolve() as Promise<unknown> };
  const operation = Promise.resolve().then(work);
  entry.promise = operation;
  pending.add(entry);
  try {
    const result = await operation;
    failedOwners.delete(ownerId);
    return result;
  } catch (error) {
    failedOwners.add(ownerId);
    throw error;
  } finally {
    pending.delete(entry);
    release();
  }
};

export const runAccountProjectLogout = async (ownerId: string, signOut: () => Promise<void>) => {
  if (editor?.ownerId === ownerId && editor.dirty) {
    const saved = await editor.save();
    if (!saved || editor.dirty) throw new Error("account_project_unsaved_changes");
  }
  const writes = [...pending].filter(entry => entry.ownerId === ownerId);
  const results = await Promise.allSettled(writes.map(entry => entry.promise));
  if (results.some(result => result.status === "rejected") || failedOwners.has(ownerId)) {
    throw new Error("account_project_pending_failed");
  }
  if (editor?.ownerId === ownerId && editor.dirty) throw new Error("account_project_unsaved_changes");
  if (navigator.locks) {
    let acquired = false;
    await navigator.locks.request(lockName(ownerId), { mode: "exclusive", ifAvailable: true }, async lock => {
      if (!lock) return;
      acquired = true;
      if (activeLeases(ownerId) > 0) throw new Error("account_project_other_tab_dirty");
      await runAccountDataLogout(ownerId, signOut);
    });
    if (!acquired) throw new Error("account_project_other_tab_dirty");
  } else {
    if (activeLeases(ownerId) > 0) throw new Error("account_project_other_tab_dirty");
    await runAccountDataLogout(ownerId, signOut);
  }
  failedOwners.delete(ownerId);
};
