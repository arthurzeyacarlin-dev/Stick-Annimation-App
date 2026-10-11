"use client";

import { useEffect } from "react";
import { useAppSettings } from "@/src/lib/account/appSettings";
import { APPEARANCE_COOKIE, appearanceCookieValue } from "@/src/lib/account/appearance";

// SPEC-0020 Phase 3: keeps <html data-theme data-accent> and the appearance cookie in step with Settings
// (in every open tab). Signed-out screens stay on the default look.
export function AppearanceSync() {
  const { settings, ready } = useAppSettings();
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.accent = settings.accent;
    document.cookie = `${APPEARANCE_COOKIE}=${appearanceCookieValue({ theme: settings.theme, accent: settings.accent })}; path=/; max-age=31536000; samesite=lax`;
  }, [ready, settings.theme, settings.accent]);
  return null;
}
