"use client";

import { useEffect, useState } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";

// Arthur 2026-10-13: whenever a page is (re)loaded, show the Diamond logo, small and 50% see-through, centered on the
// dark navy, until the page has something to show. It is in the server HTML (visible at once) and fades away when the
// page is ready. It never blocks clicks.
export function PageLoadingMark() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // setTimeout (not requestAnimationFrame) so it also clears in a background or embedded tab.
    const timer = window.setTimeout(() => setReady(true), 80);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 9999, display: "grid", placeItems: "center", background: "#030914",
        color: "#ffffff", opacity: ready ? 0 : 1, visibility: ready ? "hidden" : "visible", pointerEvents: "none",
        transition: "opacity 220ms ease-out, visibility 0s linear 220ms",
      }}
    >
      <span style={{ opacity: 0.5, display: "block", lineHeight: 0 }}><DiamondLogo size={72} /></span>
    </div>
  );
}
