"use client";

import { AppHeader } from "@/src/components/main/AppHeader";

type AppChromeProps = {
  /** The page hosting the global header. Only the nav link differs: Home links to the AI Dashboard, the Dashboard links Home. */
  page?: "home" | "dashboard";
  /** Legacy alias kept for existing callers: `theme="home"` is the same as `page="home"`. */
  theme?: "default" | "home";
};

// Redesign (Arthur 2026-10-26): every page that used the old header now gets the new one (same buttons and menus).
export function AppChrome({ page, theme }: AppChromeProps) {
  return <AppHeader page={page ?? (theme === "home" ? "home" : "dashboard")} />;
}
