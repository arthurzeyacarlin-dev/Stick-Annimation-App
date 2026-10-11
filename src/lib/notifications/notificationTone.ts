import type { DiamondNotificationV1 } from "./notificationContracts.ts";

// SPEC-0020 Phase 3 (Arthur): every notification is good (green: AI replied, export finished, internet back),
// bad (red: something failed, internet lost, a warning) or news (blue: a new Diamond Animator update, a new problem report).
export type NotificationToneV1 = "news" | "bad" | "good";
export const NOTIFICATION_TONES_V1: NotificationToneV1[] = ["news", "bad", "good"];

export function notificationToneV1(notification: Pick<DiamondNotificationV1, "eventType" | "outcome">): NotificationToneV1 {
  // SPEC-0020 Phase 6: a new problem report (owner only) is news too, not a problem with the owner's own work.
  if (notification.eventType === "app.update.available" || notification.eventType === "support.problem-report.received") return "news";
  if (notification.outcome !== "completed" || notification.eventType === "system.internet.offline") return "bad";
  return "good";
}

export function countNotificationTonesV1(rows: Pick<DiamondNotificationV1, "eventType" | "outcome">[]) {
  const counts: Record<NotificationToneV1, number> = { news: 0, bad: 0, good: 0 };
  for (const row of rows) counts[notificationToneV1(row)] += 1;
  return counts;
}
