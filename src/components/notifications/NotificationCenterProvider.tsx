"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getValidatedNotificationSnapshotV1,
  markAllNotificationsReadV1,
  markNotificationReadV1,
  retryNotificationRecoveryV1,
  subscribeNotificationsV1,
  type ValidatedNotificationSnapshotV1,
} from "@/src/lib/notifications/notificationStorage";

type NotificationCenterContextValue = {
  snapshot: ValidatedNotificationSnapshotV1;
  markRead(notificationId: string): Promise<number>;
  markAll(view: "home" | "assistant"): Promise<number>;
  retryRecovery(): Promise<void>;
};

const initialSnapshot: ValidatedNotificationSnapshotV1 = { rows: [], envelopes: [], revision: 0, fault: null };
const NotificationCenterContext = createContext<NotificationCenterContextValue | null>(null);

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => subscribeNotificationsV1(setSnapshot), []);
  useEffect(() => { void getValidatedNotificationSnapshotV1(); }, []);

  const markRead = useCallback((notificationId: string) => markNotificationReadV1(notificationId), []);
  const markAll = useCallback((view: "home" | "assistant") => markAllNotificationsReadV1(view), []);
  const retryRecovery = useCallback(async () => { await retryNotificationRecoveryV1(); }, []);
  const value = useMemo(() => ({ snapshot, markRead, markAll, retryRecovery }), [snapshot, markRead, markAll, retryRecovery]);

  return <NotificationCenterContext.Provider value={value}>{children}</NotificationCenterContext.Provider>;
}

export function useNotificationCenterV1() {
  const value = useContext(NotificationCenterContext);
  if (!value) throw new Error("NotificationTrigger must be rendered inside NotificationCenterProvider.");
  return value;
}
