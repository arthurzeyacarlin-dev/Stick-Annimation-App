"use client";

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

// One presentation-only hover owner for these two surfaces. Actual pointer
// movement selects the current control; background movement clears it.
// Click, pressed-button state, keyboard focus and navigation are not owners.
export function useInstantHover(groupSelector = "[data-hover-group]") {
  const marked = useRef(new Set<Element>());
  const pointerType = useRef("mouse");
  const clear = useCallback(() => {
    for (const element of marked.current) element.removeAttribute("data-pointer-hover");
    marked.current.clear();
  }, []);
  const track = useCallback((event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
    if ("pointerType" in event) pointerType.current = event.pointerType;
    if (pointerType.current === "touch") { clear(); return; }
    const next = new Set<Element>();
    let element = event.target instanceof Element ? event.target : null;
    if (!element || !event.currentTarget.contains(element)) { clear(); return; }
    while (element && element !== event.currentTarget) {
      if (element.matches(`button:not(:disabled):not([aria-disabled="true"]), a, ${groupSelector}`)) next.add(element);
      element = element.parentElement;
    }
    for (const previous of marked.current) if (!next.has(previous)) previous.removeAttribute("data-pointer-hover");
    for (const current of next) if (!marked.current.has(current)) current.setAttribute("data-pointer-hover", "true");
    marked.current = next;
  }, [clear, groupSelector]);
  useEffect(() => clear, [clear]);
  return {
    onPointerOverCapture: track,
    onPointerMoveCapture: track,
    onMouseOverCapture: track,
    onMouseMoveCapture: track,
    onPointerLeave: clear,
    onMouseLeave: clear,
    onPointerCancel: clear,
  };
}
