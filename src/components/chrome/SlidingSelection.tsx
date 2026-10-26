"use client";

import { useEffect } from "react";

// Redesign (Arthur 2026-10-26): whenever you switch between choices in a group (12 / 24 / 30 fps, Show / Group by,
// panel tabs, Monthly / Yearly…), the highlight slides from the old choice to the new one, like the Create account /
// Log in switch. Purely visual: a short-lived copy of the highlight glides over; the real buttons are not changed.
const GROUPS = '[class*="segmented"], [role="tablist"], [role="radiogroup"], [role="group"], .da-sheet-tab-row, .workspace-properties-scroll div[style*="flex-wrap: wrap"]';
const SELECTED = '[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]';
const OWN_ANIMATION = '[role="group"][aria-label="Right panel"], .da-sheet-tab-row, [data-own-switch-animation]';

export function SlidingSelection() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onPointerDown = (event: PointerEvent) => {
      const button = (event.target as Element | null)?.closest("button");
      const group = button?.parentElement?.closest(GROUPS) as HTMLElement | null;
      if (!button || !group || button.matches(SELECTED)) return;
      // Groups with their own switch animation (the editor's panel tabs) keep it; we never add a second one (Arthur).
      if (group.matches(OWN_ANIMATION) || group.closest(OWN_ANIMATION)) return;
      const choices = Array.from(group.querySelectorAll<HTMLElement>(":scope > button, :scope > * > button")).filter((el) => el.closest(GROUPS) === group);
      const from = choices.find((el) => el.matches(SELECTED));
      if (!from || choices.length < 2 || choices.length > 8) return;
      const start = from.getBoundingClientRect();
      const look = getComputedStyle(from);
      const restore = () => {
        const to = choices.find((el) => el.matches(SELECTED));
        if (!to || to === from) return;
        const end = to.getBoundingClientRect();
        const ghost = document.createElement("span");
        Object.assign(ghost.style, {
          position: "fixed", left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`,
          borderRadius: look.borderRadius, background: look.backgroundColor, boxShadow: look.boxShadow, pointerEvents: "none", zIndex: "2000",
          transition: "transform 240ms cubic-bezier(.2, .8, .2, 1), width 240ms cubic-bezier(.2, .8, .2, 1)",
        } as CSSStyleDeclaration);
        document.body.appendChild(ghost);
        // The new choice keeps its words; only its own highlight waits until the glide lands (no blinking text).
        const keep = { background: to.style.background, boxShadow: to.style.boxShadow };
        to.style.setProperty("background", "transparent", "important");
        to.style.setProperty("box-shadow", "none", "important");
        ghost.style.zIndex = "0";
        ghost.style.mixBlendMode = "screen";
        requestAnimationFrame(() => {
          ghost.style.transform = `translate(${end.left - start.left}px, ${end.top - start.top}px)`;
          ghost.style.width = `${end.width}px`;
        });
        window.setTimeout(() => {
          to.style.removeProperty("background"); to.style.removeProperty("box-shadow");
          if (keep.background) to.style.background = keep.background;
          if (keep.boxShadow) to.style.boxShadow = keep.boxShadow;
          ghost.remove();
        }, 250);
      };
      // The choice changes on click; look again right after it.
      button.addEventListener("click", () => requestAnimationFrame(restore), { once: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);
  return null;
}
