"use client";

import { useEffect } from "react";

// SHARED CHOICE ROWS (Arthur 2026-10-27): every row of choices works like the Create account / Log in switch.
// One pill sits UNDER the selected choice and slides to the new one when you click (240 ms, same curve as the
// switch). The buttons stay see-through, so hovering the selected choice changes nothing, and the words never move
// or blink. One mechanism for the whole app: add a row's selector here and it gets the exact same behaviour.
// Look of the pill: app/globals.css (.da-choice-pill).
export const CHOICE_ROWS = [
  '[class*="segmented"]',                                   // AI Dashboard Show / Group by, Settings volume + fps
  '[role="group"][aria-label="Right panel"]',                // editor panel tabs
  '[role="group"][aria-label^="Show prices"]',               // Plans Monthly / Yearly
  ".da-sheet-tab-row",                                       // phone panel tabs
  ".drawing-toolbar",                                        // editor tools
  '.workspace-properties-scroll div[style*="flex-wrap: wrap"]', // Shape type, Mode, and other tool choices
].join(", ");
const SELECTED = '[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"], [data-selected]';

function choicesOf(row: HTMLElement) {
  return Array.from(row.querySelectorAll<HTMLElement>(":scope > button, :scope > * > button")).filter((el) => el.closest(CHOICE_ROWS) === row);
}

function place(row: HTMLElement) {
  const choices = choicesOf(row);
  const selected = choices.find((el) => el.matches(SELECTED));
  let pill = row.querySelector<HTMLElement>(":scope > .da-choice-pill");
  // Only rows that really are a choice (2+ buttons, one picked) get a pill.
  if (!selected || choices.length < 2) { if (pill) pill.style.opacity = "0"; return; }
  if (!row.hasAttribute("data-da-choice-row")) {
    row.setAttribute("data-da-choice-row", "");
    if (getComputedStyle(row).position === "static") row.style.position = "relative";
  }
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "da-choice-pill";
    pill.setAttribute("aria-hidden", "true");
    row.insertBefore(pill, row.firstChild);
  }
  const rowBox = row.getBoundingClientRect();
  const box = selected.getBoundingClientRect();
  const x = box.left - rowBox.left - row.clientLeft + row.scrollLeft;
  const y = box.top - rowBox.top - row.clientTop + row.scrollTop;
  const next = `${Math.round(x * 10) / 10}|${Math.round(y * 10) / 10}|${Math.round(box.width)}|${Math.round(box.height)}`;
  if (pill.dataset.at === next) return;
  const first = !pill.dataset.at || pill.style.opacity === "0";
  pill.dataset.at = next;
  // First placement jumps (no slide from the corner); every later change slides.
  if (first) pill.style.setProperty("transition", "none", "important");
  pill.style.width = `${box.width}px`;
  pill.style.height = `${box.height}px`;
  pill.style.transform = `translate(${x}px, ${y}px)`;
  pill.style.borderRadius = getComputedStyle(selected).borderRadius;
  pill.style.opacity = "1";
  if (first) requestAnimationFrame(() => requestAnimationFrame(() => { if (pill) pill.style.removeProperty("transition"); }));
}

export function ChoicePills() {
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        document.querySelectorAll<HTMLElement>(CHOICE_ROWS).forEach(place);
      });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed", "aria-selected", "aria-checked", "data-selected", "class"] });
    const resize = new ResizeObserver(refresh);
    resize.observe(document.body);
    window.addEventListener("resize", refresh);
    // Panels slide and scroll; keep the pill under its choice.
    document.addEventListener("scroll", refresh, true);
    document.addEventListener("transitionend", refresh, true);
    return () => {
      observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
      document.removeEventListener("scroll", refresh, true);
      document.removeEventListener("transitionend", refresh, true);
    };
  }, []);
  return null;
}
