"use client";

import { useEffect } from "react";
import { APPEARANCE_COOKIE, appearanceCookieValue } from "@/src/lib/account/appearance";

// SPEC-0020 Phase 3: keeps <html data-theme data-accent> and the appearance cookie in step with Settings
// (in every open tab). Signed-out screens stay on the default look.
export function AppearanceSync() {
  // Arthur 2026-10-13: no Appearance setting. The app is always Dark + Diamond blue (older saved choices are ignored).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "dark";
    root.dataset.accent = "blue";
    document.cookie = `${APPEARANCE_COOKIE}=${appearanceCookieValue({ theme: "dark", accent: "blue" })}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
