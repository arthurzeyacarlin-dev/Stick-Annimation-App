"use client";
import { useEffect, useRef, type RefObject } from "react";
import { TYPED_EXAMPLES } from "./aiStart";

// (Nov 23) real examples type themselves into an EMPTY field's placeholder and delete again, slowly, so it shows what typing
// does. It writes only the field's placeholder text (no React state), so nothing around the field is drawn again while it
// types: the chat, a waiting plan card and Home stay exactly as they are. Reduced motion: the first example, still.
// When it stops, the field gets back the placeholder React gave it (`restore`).
export function useTypedPlaceholder(field: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, active: boolean, restore: string, examples: readonly string[] = TYPED_EXAMPLES) {
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    if (!active || examples.length === 0) { el.placeholder = restoreRef.current; return; }
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* old browser */ }
    if (reduce) { el.placeholder = examples[0]; return () => { el.placeholder = restoreRef.current; }; }
    let index = 0, length = 0, typing = true, timer = 0;
    const show = (text: string) => { el.placeholder = text || restoreRef.current; };
    const tick = () => {
      const example = examples[index % examples.length];
      if (typing) {
        length += 1;
        show(example.slice(0, length));
        if (length >= example.length) { typing = false; timer = window.setTimeout(tick, 1900); return; }
        timer = window.setTimeout(tick, 42 + Math.random() * 38);
      } else {
        length = Math.max(0, length - 2);
        show(example.slice(0, length));
        if (length === 0) { typing = true; index += 1; timer = window.setTimeout(tick, 450); return; }
        timer = window.setTimeout(tick, 16);
      }
    };
    timer = window.setTimeout(tick, 700);
    return () => { window.clearTimeout(timer); el.placeholder = restoreRef.current; };
  }, [field, active, examples]);
}
