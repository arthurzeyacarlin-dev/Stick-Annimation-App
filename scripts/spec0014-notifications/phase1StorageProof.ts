import type { Page } from "playwright-core";

export type StorageProofResult = {
  status: "PASS";
  assertions: number;
  receipts: string[];
  observations: Record<string, unknown>;
};

export async function runPhase1StorageProof(page: Page): Promise<StorageProofResult> {
  let assertions = 0;
  const expect = (condition: unknown, message: string) => {
    assertions += 1;
    if (!condition) throw new Error(`storage-proof:${message}`);
  };
  const receipts: string[] = [];

  await page.evaluate(() => (window as unknown as { spec0014: { reset(): Promise<void> } }).spec0014.reset());
  const firstFiveHundred = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { publishOffline(id: string): Promise<unknown>; snapshot(): Promise<{ rows: Array<{ readAt: number | null }>; revision: number; fault: unknown }>; rawStats(): Promise<{ count: number; bytes: number; revision: number }> } }).spec0014;
    for (let index = 0; index < 500; index += 1) await api.publishOffline(`offline_capacity_${String(index).padStart(4, "0")}`);
    return { snapshot: await api.snapshot(), raw: await api.rawStats() };
  });
  expect(firstFiveHundred.snapshot.rows.length === 500, "500 validated rows persist");
  expect(firstFiveHundred.snapshot.rows.every(row => row.readAt === null), "500 capacity rows remain unread");
  expect(firstFiveHundred.raw.count === 500, "raw row count is exactly 500");
  expect(firstFiveHundred.raw.bytes < 2 * 1024 * 1024, "row-count limit is reached before byte limit in the compact vector");
  receipts.push("storage-500-rows");

  const overRowLimit = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { publishOffline(id: string): Promise<unknown>; snapshot(): Promise<{ rows: unknown[] }>; rawStats(): Promise<{ count: number; revision: number }> } }).spec0014;
    let error = "";
    try { await api.publishOffline("offline_capacity_0500"); } catch (caught) { error = caught instanceof Error ? `${caught.name}:${caught.message}` : String(caught); }
    return { error, snapshot: await api.snapshot(), raw: await api.rawStats() };
  });
  expect(overRowLimit.error.includes("QuotaExceededError"), "501st unread row is rejected");
  expect(overRowLimit.raw.count === 500, "501st rejection changes no raw row");
  receipts.push("storage-501st-unread-rejected");

  const duplicate = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { publishOffline(id: string): Promise<{ status: string }>; rawStats(): Promise<{ revision: number; count: number }> } }).spec0014;
    const before = await api.rawStats();
    const result = await api.publishOffline("offline_capacity_0000");
    const after = await api.rawStats();
    return { before, after, status: result.status };
  });
  expect(duplicate.status === "duplicate", "duplicate terminal delivery is idempotent");
  expect(duplicate.before.revision === duplicate.after.revision && duplicate.before.count === duplicate.after.count, "duplicate is a true no-op without revision churn");
  receipts.push("storage-duplicate-noop");

  const prune = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { snapshot(): Promise<{ rows: Array<{ notificationId: string; readAt: number | null }> }>; mark(id: string): Promise<number>; publishOffline(id: string): Promise<unknown>; rawStats(): Promise<{ count: number }> } }).spec0014;
    const before = await api.snapshot();
    const oldest = before.rows.at(-1)!;
    await api.mark(oldest.notificationId);
    await api.publishOffline("offline_capacity_replacement");
    const after = await api.snapshot();
    return { oldestId: oldest.notificationId, after, raw: await api.rawStats() };
  });
  expect(prune.raw.count === 500 && prune.after.rows.length === 500, "a new row prunes one oldest valid read row");
  expect(!prune.after.rows.some(row => row.notificationId === prune.oldestId), "the oldest read row, not unread history, was pruned");
  expect(prune.after.rows.every(row => row.readAt === null), "all surviving capacity rows remain unread");
  receipts.push("storage-read-only-pruning");

  const corrupt = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { injectCorrupt(key: string, padding: number): Promise<void>; snapshot(): Promise<{ rows: Array<{ notificationId: string }>; fault: { code: string } | null }>; rawStats(): Promise<{ count: number }>; mark(id: string): Promise<number>; corruptExists(key: string): Promise<boolean> } }).spec0014;
    await api.injectCorrupt("corrupt_preserved_0001", 64);
    const quarantined = await api.snapshot();
    const marked = await api.mark(quarantined.rows[0].notificationId);
    return { quarantined, marked, raw: await api.rawStats(), corruptStillThere: await api.corruptExists("corrupt_preserved_0001") };
  });
  expect(corrupt.quarantined.fault?.code === "corrupt-rows", "corrupt raw bytes raise a storage fault");
  expect(corrupt.quarantined.rows.length === 500, "validated rows remain visible while a corrupt row is quarantined");
  expect(corrupt.marked === 1, "validated rows remain writable beside quarantined bytes");
  expect(corrupt.corruptStillThere, "corrupt raw bytes are preserved");
  expect(corrupt.raw.count === 500, "capacity reconciliation prunes only a now-read valid row, never corrupt bytes");
  receipts.push("storage-corrupt-quarantine-preserved");

  const corruptKeyCollision = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { reset(): Promise<void>; publishOffline(id: string): Promise<{ notification: { notificationId: string } }>; injectCorrupt(key: string, padding: number): Promise<void>; rawRow(key: string): Promise<unknown> } }).spec0014;
    await api.reset();
    const seeded = await api.publishOffline("offline_corrupt_key_collision");
    const notificationId = seeded.notification.notificationId;
    await api.reset();
    await api.injectCorrupt(notificationId, 91);
    const before = await api.rawRow(notificationId);
    let error = "";
    try { await api.publishOffline("offline_corrupt_key_collision"); } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    const after = await api.rawRow(notificationId);
    return { notificationId, before, after, error };
  });
  expect(corruptKeyCollision.error.includes("conflicting-terminal"), "a corrupt raw key collision is preserved as an integrity fault");
  expect(JSON.stringify(corruptKeyCollision.before) === JSON.stringify(corruptKeyCollision.after), "publication never overwrites colliding corrupt bytes");
  receipts.push("storage-corrupt-key-collision-preserved");

  const byteBoundary = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { reset(): Promise<void>; injectExactRawBytes(bytes: number): Promise<{ bytes: number }>; rawStats(): Promise<{ bytes: number }>; snapshot(): Promise<{ fault: { code: string } | null }>; publishOffline(id: string): Promise<unknown> } }).spec0014;
    await api.reset();
    const exact = await api.injectExactRawBytes(2 * 1024 * 1024);
    const exactFault = await api.snapshot();
    let exactPublishError = "";
    try { await api.publishOffline("offline_exact_boundary"); } catch (caught) { exactPublishError = caught instanceof Error ? `${caught.name}:${caught.message}` : String(caught); }
    await api.reset();
    const over = await api.injectExactRawBytes(2 * 1024 * 1024 + 1);
    const overFault = await api.snapshot();
    return { exact, over, exactFault, overFault, exactPublishError };
  });
  expect(byteBoundary.exact.bytes === 2 * 1024 * 1024, "exact 2 MiB durable-row boundary is measured in real IndexedDB");
  expect(byteBoundary.over.bytes === 2 * 1024 * 1024 + 1, "one-byte-over durable boundary is measured in real IndexedDB");
  expect(byteBoundary.exactPublishError.includes("QuotaExceededError"), "a new unread row cannot exceed the exact byte boundary");
  expect(byteBoundary.exactFault.fault?.code === "corrupt-rows" && byteBoundary.overFault.fault?.code === "corrupt-rows", "unreadable boundary fillers remain preserved and faulted");
  receipts.push("storage-2mib-boundary");

  const lockResults = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { reset(): Promise<void>; publishOffline(id: string): Promise<{ status: string }>; rawStats(): Promise<{ count: number; revision: number }>; setLockMode(mode: "auto" | "lease"): void; injectLease(owner: string, expiresAt: number): Promise<void> } }).spec0014;
    await api.reset();
    api.setLockMode("auto");
    const webLock = await Promise.all([api.publishOffline("offline_web_lock_same"), api.publishOffline("offline_web_lock_same")]);
    const webLockRaw = await api.rawStats();
    api.setLockMode("lease");
    await api.injectLease("expired_owner", Date.now() - 1);
    const takeover = await api.publishOffline("offline_lease_takeover");
    const leaseRaw = await api.rawStats();
    return { webLock: webLock.map(result => result.status).sort(), webLockRaw, takeover: takeover.status, leaseRaw };
  });
  equalArrays(lockResults.webLock, ["committed", "duplicate"], "Web Locks serialize duplicate delivery");
  expect(lockResults.webLockRaw.count === 1 && lockResults.webLockRaw.revision === 1, "Web Locks converge on one commit");
  expect(lockResults.takeover === "committed" && lockResults.leaseRaw.count === 2, "expired fallback lease is taken over and committed");
  receipts.push("storage-web-lock-and-lease-takeover");

  const activeLease = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { injectLease(owner: string, expiresAt: number): Promise<void>; publishOffline(id: string): Promise<unknown>; rawStats(): Promise<{ count: number }> } }).spec0014;
    await api.injectLease("active_other_owner", Date.now() + 60_000);
    let error = "";
    try { await api.publishOffline("offline_active_lease"); } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    return { error, raw: await api.rawStats() };
  });
  expect(activeLease.error.includes("lease"), "active fallback lease blocks another owner");
  expect(activeLease.raw.count === 2, "failed lease ownership changes no notification rows");
  receipts.push("storage-fallback-active-lease");

  const versionAndRecovery = await page.evaluate(async () => {
    const api = (window as unknown as { spec0014: { setLockMode(mode: "auto" | "lease"): void; reset(): Promise<void>; observeBlockedUpgrade(): Promise<boolean>; snapshot(): Promise<{ rows: unknown[]; fault: { code: string } | null }>; recoverFromHigherVersion(): Promise<{ rows: unknown[]; fault: { code: string } | null }> } }).spec0014;
    api.setLockMode("auto");
    await api.reset();
    const blockedEventObserved = await api.observeBlockedUpgrade();
    const faulted = await api.snapshot();
    const recovered = await api.recoverFromHigherVersion();
    return { blockedEventObserved, faulted, recovered };
  });
  expect(versionAndRecovery.blockedEventObserved, "a real IndexedDB version upgrade emits blocked while another connection is held");
  expect(versionAndRecovery.faulted.fault?.code === "version", "higher IndexedDB version produces an explicit version fault");
  expect(versionAndRecovery.recovered.fault === null && versionAndRecovery.recovered.rows.length === 0, "successful reopen/reread clears the fault without fabricating an event");
  receipts.push("storage-version-fault-recovery");

  return {
    status: "PASS",
    assertions,
    receipts,
    observations: {
      fiveHundred: firstFiveHundred.raw,
      exactBytes: byteBoundary.exact.bytes,
      oneByteOver: byteBoundary.over.bytes,
      webLocks: lockResults.webLock,
      fallbackLeaseTakeover: lockResults.takeover,
      blockedEventObserved: versionAndRecovery.blockedEventObserved,
      versionFault: versionAndRecovery.faulted.fault,
      limitations: {
        browserNativeQuotaExhaustion: "UNPROVEN; deterministic app 2 MiB quota path proven",
        browserNativeOpenBlockedEvent: "PROVEN through a held real IndexedDB connection and version upgrade",
        finalCasAdversarialInterleaving: "pending browser proof",
      },
    },
  };
}

function equalArrays(actual: unknown[], expected: unknown[], message: string) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) throw new Error(`storage-proof:${message}`);
}
