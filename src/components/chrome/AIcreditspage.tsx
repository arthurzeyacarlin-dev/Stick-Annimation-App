"use client";

import { AppHeader, type HeaderBack } from "@/src/components/main/AppHeader";

type AppChromeProps = {
  /** The page hosting the global header. Only the nav link differs: Home links to the AI Dashboard, the Dashboard links Home. */
  page?: "home" | "dashboard";
  /** Legacy alias kept for existing callers: `theme="home"` is the same as `page="home"`. */
  theme?: "default" | "home";
  /** Nov 21: "Back" to where the person came from (the Help Assistant), instead of Home. */
  back?: HeaderBack;
};

// Redesign (Arthur 2026-10-26): every page that used the old header now gets the new one (same buttons and menus).
export function AppChrome({ page, theme, back }: AppChromeProps) {
  return <AppHeader page={page ?? (theme === "home" ? "home" : "dashboard")} back={back} />;
}
