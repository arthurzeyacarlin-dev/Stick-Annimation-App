import { resolve } from "node:path";
import type { UsageJournalEventInput, UsageJournalSummary } from "./usageJournalContract.ts";
import { UsageJournalStore, type UsageJournalPolicy } from "./usageJournalStore.ts";
import { recordAccountUsageEvent } from "../account-usage/accountUsageStore.ts";
import { projectUsageJournal } from "./usageJournalProjection.ts";
import { postgresConfigured } from "../server/postgres.ts";

export const USAGE_JOURNAL_RETENTION_DAYS = 90;
export const USAGE_JOURNAL_POLICY: Readonly<UsageJournalPolicy> = Object.freeze({
  retentionDays: USAGE_JOURNAL_RETENTION_DAYS,
  maxFileBytes: 32 * 1024 * 1024,
  queueLimit: 256,
  batchSize: 32,
  writeRetryLimit: 2,
  writeRetryDelayMs: 25,
});

const owner = globalThis as typeof globalThis & { diamondUsageJournalV1?: UsageJournalStore };
const filePath = () => process.env.DIAMOND_USAGE_JOURNAL_PATH?.trim() || resolve(process.cwd(), ".local/usage-journal/v1.ndjson");
const journal = () => owner.diamondUsageJournalV1 ??= new UsageJournalStore({ filePath: filePath(), policy: USAGE_JOURNAL_POLICY });

// The local-instance journal is a file on this computer (.local/usage-journal).
// Online (DATABASE_URL set) there is no writable disk to keep it on, so it is
// switched off: nothing is written, and per-account usage still goes to
// Postgres through recordAccountUsageEvent.
const journalEnabled = () => !postgresConfigured();

export function recordUsageEvent(event: UsageJournalEventInput): boolean {
  try { recordAccountUsageEvent(event); } catch { /* Metering never interrupts an AI reply. */ }
  if (!journalEnabled()) return false;
  try { return journal().enqueue(event); }
  catch { return false; }
}

export async function readUsageSummary(): Promise<UsageJournalSummary> {
  if (!journalEnabled()) {
    return projectUsageJournal([], {
      retentionDays: USAGE_JOURNAL_RETENTION_DAYS, now: Date.now(), queueDepth: 0, droppedEvents: 0, failedWrites: 0,
      pendingCoverageGaps: 0, lastError: "journal_disabled_online", unavailable: true,
    });
  }
  return journal().summary();
}
