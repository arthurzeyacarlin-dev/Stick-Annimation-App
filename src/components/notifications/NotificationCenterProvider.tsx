"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { listSessions } from "@/src/lib/assistant/assistantStorage";
import { startAssistantCompletionObserverV1 } from "@/src/lib/notifications/assistantCompletionObserver";
import { registerNotificationNavigationHandlerV1 } from "@/src/lib/notifications/notificationNavigation";
import type { NotificationTargetV1 } from "@/src/lib/notifications/notificationContracts";
import { startTerraCompletionObserverV1 } from "@/src/lib/notifications/terraCompletionObserver";
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
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const assistantTargetKey = useMemo(() => JSON.stringify(snapshot.rows.filter(row => row.target.kind === "assistant-turn").map(row => row.target)), [snapshot.rows]);

  useEffect(() => subscribeNotificationsV1(setSnapshot), []);
  useEffect(() => { void getValidatedNotificationSnapshotV1(); }, []);
  useEffect(() => {
    const stopAssistant = startAssistantCompletionObserverV1();
    const stopTerra = startTerraCompletionObserverV1();
    return () => { stopAssistant(); stopTerra(); };
  }, []);
  useEffect(() => {
    const targets = JSON.parse(assistantTargetKey) as NotificationTargetV1[];
    const handles = targets
      .map(target => registerNotificationNavigationHandlerV1({
        target,
        handler: async target => {
          if (target.kind !== "assistant-turn") return "unavailable";
          const session = (await listSessions()).sessions.find(candidate => candidate.id === target.sessionId);
          const turn = session?.turns.find(candidate => candidate.id === target.turnId && (candidate.jobId === target.jobId || candidate.priorAttempts?.some(attempt => attempt.jobId === target.jobId)));
          if (!session || !turn || turn.status === "pending") return "unavailable";
          const hash = `#chat=${encodeURIComponent(target.sessionId)}&turn=${encodeURIComponent(target.turnId)}&job=${encodeURIComponent(target.jobId)}`;
          if (window.location.pathname === "/assistant") {
            if (window.location.hash === hash) window.dispatchEvent(new Event("hashchange"));
            else window.location.hash = hash;
          } else router.push(`/assistant${hash}`);
          return "handled";
        },
      }));
    return () => { for (const handle of handles) handle.unregister(); };
  }, [assistantTargetKey, router]);

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
