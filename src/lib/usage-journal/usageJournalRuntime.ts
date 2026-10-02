import { resolve } from "node:path";
import type { UsageJournalEventInput, UsageJournalSummary } from "./usageJournalContract.ts";
import { UsageJournalStore, type UsageJournalPolicy } from "./usageJournalStore.ts";
import { recordAccountUsageEvent } from "../account-usage/accountUsageStore.ts";

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

export function recordUsageEvent(event: UsageJournalEventInput): boolean {
  recordAccountUsageEvent(event);
  try { return journal().enqueue(event); }
  catch { return false; }
}

export async function readUsageSummary(): Promise<UsageJournalSummary> {
  return journal().summary();
}
