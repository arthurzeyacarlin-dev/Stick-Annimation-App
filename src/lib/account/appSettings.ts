"use client";

import { useEffect, useState } from "react";
import { readAccountJson, subscribeAccountDataChanges, writeAccountJson } from "./accountDataClient";

// SPEC-0020 Phase 3: Diamond Animator's own settings (global for the account, separate from Profile and Plan),
// saved in the account's preferences (key "app"). Every setting here changes something real (Arthur: no
// "layout-only" settings). Changes reach every open tab (and the editor) right away.
export type NotificationVolume = "quiet" | "normal" | "loud";
export type AppTheme = "dark" | "light";
export const APP_ACCENTS = ["blue", "purple", "green", "orange", "pink", "red", "teal"] as const;
export type AppAccent = (typeof APP_ACCENTS)[number];
export const NEW_PROJECT_FPS_CHOICES = [12, 24, 30] as const;
export type NewProjectFps = (typeof NEW_PROJECT_FPS_CHOICES)[number];

export type AppSettingsV1 = {
  schema: "account-app-settings/v1";
  /** Play a "ding ding" when a notification arrives (on every page, the editor too). */
  notificationSound: boolean;
  notificationVolume: NotificationVolume;
  /** Swing the bell left-right when a notification arrives. */
  bellRing: boolean;
  /** Frames per second a new project starts with (it can still be changed in the editor). */
  newProjectFps: NewProjectFps;
  /** Appearance: Dark (navy, default) or Bright (white). */
  theme: AppTheme;
  /** The color every hover and switch turns (default blue #0066FF). */
  accent: AppAccent;
};

export const DEFAULT_APP_SETTINGS: AppSettingsV1 = {
  schema: "account-app-settings/v1", notificationSound: true, notificationVolume: "normal", bellRing: true, newProjectFps: 12, theme: "dark", accent: "blue",
};

const normalize = (value: unknown): AppSettingsV1 => {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    schema: "account-app-settings/v1",
    notificationSound: typeof row.notificationSound === "boolean" ? row.notificationSound : DEFAULT_APP_SETTINGS.notificationSound,
    notificationVolume: row.notificationVolume === "quiet" || row.notificationVolume === "loud" || row.notificationVolume === "normal" ? row.notificationVolume : DEFAULT_APP_SETTINGS.notificationVolume,
    bellRing: typeof row.bellRing === "boolean" ? row.bellRing : DEFAULT_APP_SETTINGS.bellRing,
    newProjectFps: (NEW_PROJECT_FPS_CHOICES as readonly unknown[]).includes(row.newProjectFps) ? row.newProjectFps as NewProjectFps : DEFAULT_APP_SETTINGS.newProjectFps,
    theme: row.theme === "light" ? "light" : "dark",
    accent: (APP_ACCENTS as readonly unknown[]).includes(row.accent) ? row.accent as AppAccent : "blue",
  };
};

let cache: { revision: number; value: AppSettingsV1 } | null = null;
let loading: Promise<AppSettingsV1> | null = null;
let watching = false;
const listeners = new Set<(value: AppSettingsV1) => void>();
const emit = () => { if (cache) for (const listener of listeners) listener(cache.value); };

function load(force = false): Promise<AppSettingsV1> {
  if (!loading || force) {
    loading = readAccountJson<unknown>("preferences", "app")
      .then((record) => { cache = { revision: record?.revision ?? 0, value: normalize(record?.value) }; emit(); return cache.value; })
      // A failed read must not freeze the defaults forever: the next use tries again.
      .catch(() => { loading = null; return cache?.value ?? DEFAULT_APP_SETTINGS; });
  }
  if (!watching && typeof window !== "undefined") {
    watching = true;
    subscribeAccountDataChanges("preferences", "app", () => void load(true));
  }
  return loading;
}

/** The latest saved settings (waits for the first read). Use right before acting, e.g. playing a sound. */
export const getAppSettings = () => (cache ? Promise.resolve(cache.value) : load());

/** The current settings (defaults until they load). Re-renders when they change, in any tab. */
export function useAppSettings() {
  const [value, setValue] = useState<AppSettingsV1>(cache?.value ?? DEFAULT_APP_SETTINGS);
  const [ready, setReady] = useState(cache !== null);
  useEffect(() => {
    const listener = (next: AppSettingsV1) => { setValue(next); setReady(true); };
    listeners.add(listener);
    if (cache) listener(cache.value);
    void load();
    return () => { listeners.delete(listener); };
  }, []);
  return { settings: value, ready };
}

export async function saveAppSettings(patch: Partial<Omit<AppSettingsV1, "schema">>) {
  await load(true);
  const current = cache ?? { revision: 0, value: DEFAULT_APP_SETTINGS };
  const next: AppSettingsV1 = normalize({ ...current.value, ...patch });
  const result = await writeAccountJson("preferences", "app", next, current.revision);
  cache = { revision: result.revision, value: next };
  emit();
}
