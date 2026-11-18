"use client";

import { useEffect, useState } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";

// Shown whenever a page is (re)loaded until it has something to show (in the server HTML, so it is visible at once),
// then it disappears; it never blocks clicks. New look (Nov 18): the app's gray, the white logo, the name and one thin line.
export function PageLoadingMark() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // setTimeout (not requestAnimationFrame) so it also clears in a background or embedded tab.
    const timer = window.setTimeout(() => setReady(true), 80);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div aria-hidden="true" className="da-loading" data-ready={ready ? "true" : undefined}>
      <div className="da-loading-mark">
        <span className="da-loading-logo"><DiamondLogo size={44} /></span>
        <span className="da-loading-name">Diamond Animator</span>
        <span className="da-loading-track"><span /></span>
      </div>
    </div>
  );
}
