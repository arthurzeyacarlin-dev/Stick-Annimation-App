"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseButton } from "@/src/components/ui/CloseButton";
import styles from "./StatusBanner.module.css";

// SPEC-0027 (Nov 26): the thin banner on every page (signed in or not) while a part of the app isn't working:
// "We're fixing a problem with X. Your work is safe." → "Resolved: X works again." It floats over the page (nothing moves,
// the canvas never resizes) and can be closed; a closed banner comes back only when the status changes.
// It asks the server once a minute while the page is visible, and when the window gets focus.
type Banner = { tone: "problem" | "resolved"; text: string; key: string };
const POLL_MS = 60_000;
const CLOSED_KEY = "diamond.statusBanner.closed";
/** The owner's status switches (ServiceStatusPanel) fire this so the banner updates at once. */
export const STATUS_CHANGED_EVENT = "diamond:status-changed";

const readClosed = () => { try { return window.localStorage.getItem(CLOSED_KEY); } catch { return null; } };
const writeClosed = (key: string) => { try { window.localStorage.setItem(CLOSED_KEY, key); } catch { /* closes for this page only */ } };

export function StatusBanner() {
  const pathname = usePathname() ?? "/";
  const [banner, setBanner] = useState<Banner | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const ask = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/support/status", { cache: "no-store" });
        const body = await response.json() as { banner?: Banner | null };
        if (!stopped && response.ok) setBanner(body.banner && typeof body.banner.text === "string" ? body.banner : null);
      } catch { /* no connection: keep what is shown */ }
    };
    const first = window.setTimeout(() => { setClosed(readClosed()); void ask(); }, 0);
    const timer = window.setInterval(() => void ask(), POLL_MS);
    const onFocus = () => void ask();
    window.addEventListener("focus", onFocus);
    window.addEventListener(STATUS_CHANGED_EVENT, onFocus);
    return () => { stopped = true; window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener(STATUS_CHANGED_EVENT, onFocus); };
  }, []);

  if (!banner || banner.key === closed || pathname === "/status") return null;
  return (
    <div className={styles.banner} data-tone={banner.tone} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <p className={styles.text}>{banner.text} <a href="/status" className={styles.link}>Status</a></p>
      <CloseButton label="Close this message" onClick={() => { writeClosed(banner.key); setClosed(banner.key); }} />
    </div>
  );
}
