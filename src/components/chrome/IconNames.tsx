"use client";

import { useEffect } from "react";

// UX Step 1 (Arthur, Nov 11): every icon shows its name on hover. ONE rule for the whole app, mounted once in the
// layout: a button or link that has a screen-reader name (aria-label) but no visible words gets that name as its
// tooltip. Every future icon button gets it for free; a control with visible words is left alone.
const nameIcon = (element: Element) => {
  if (!(element instanceof HTMLElement) || element.title) return;
  const label = element.getAttribute("aria-label");
  if (label && !element.textContent?.trim()) element.title = label;
};

export function IconNames() {
  useEffect(() => {
    const apply = () => document.querySelectorAll("button[aria-label], a[aria-label]").forEach(nameIcon);
    apply();
    let timer = 0;
    const observer = new MutationObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(apply, 150); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, []);
  return null;
}
