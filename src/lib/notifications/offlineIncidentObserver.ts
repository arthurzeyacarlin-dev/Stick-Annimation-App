import { observeBrowserOfflineV1, observeBrowserOnlineV1 } from "./notificationStorage.ts";

export type BrowserConnectivityObserverStateV1 = Readonly<{ offline: boolean }>;
export type BrowserConnectivityObservationSourceV1 = "browser-offline-event" | "browser-online-event" | "browser-initial-observation";

export async function reconcileBrowserConnectivityV1(source: BrowserConnectivityObservationSourceV1 = "browser-initial-observation") {
  if (typeof navigator === "undefined") return null;
  if (navigator.onLine === false) return observeBrowserOfflineV1(source === "browser-offline-event" ? "browser-offline-event" : "browser-initial-offline");
  return observeBrowserOnlineV1(source === "browser-online-event" ? "browser-online-event" : "browser-initial-online");
}

export function startBrowserConnectivityObserverV1(listener: (state: BrowserConnectivityObserverStateV1) => void) {
  if (typeof window === "undefined" || typeof navigator === "undefined") return () => undefined;

  let stopped = false;
  let lastOffline: boolean | null = null;
  let reconciliation = Promise.resolve<unknown>(undefined);

  const observe = (source: BrowserConnectivityObservationSourceV1) => {
    if (stopped) return;
    const offline = navigator.onLine === false;
    if (offline !== lastOffline) {
      lastOffline = offline;
      listener(Object.freeze({ offline }));
    }
    reconciliation = reconciliation
      .catch(() => undefined)
      .then(() => stopped ? undefined : reconcileBrowserConnectivityV1(source))
      .catch(() => undefined);
  };
  const observeVisible = () => {
    if (document.visibilityState === "visible") observe("browser-initial-observation");
  };
  const observeOfflineEvent = () => observe("browser-offline-event");
  const observeOnlineEvent = () => observe("browser-online-event");

  window.addEventListener("offline", observeOfflineEvent);
  window.addEventListener("online", observeOnlineEvent);
  window.addEventListener("focus", observeVisible);
  document.addEventListener("visibilitychange", observeVisible);
  observe("browser-initial-observation");

  return () => {
    stopped = true;
    window.removeEventListener("offline", observeOfflineEvent);
    window.removeEventListener("online", observeOnlineEvent);
    window.removeEventListener("focus", observeVisible);
    document.removeEventListener("visibilitychange", observeVisible);
  };
}
