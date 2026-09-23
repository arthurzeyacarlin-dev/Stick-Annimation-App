"use client";
import { useEffect, useState } from "react";
import styles from "./diamondAssistant.module.css";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  return reduced;
}
export function AssistantText({ text, animate = false, title = false }: { text: string; animate?: boolean; title?: boolean }) {
  const reduced = useReducedMotion(); const [count, setCount] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate || reduced) return;
    let frame = 0; const started = performance.now(); const duration = Math.min(720, Math.max(220, text.length * 3.5));
    const tick = (now: number) => { const next = Math.min(text.length, Math.max(1, Math.ceil(text.length * (now - started) / duration))); setCount(next); if (next < text.length) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [text, animate, reduced, title]);
  const complete = !animate || reduced || count >= text.length;
  const leading = Math.max(0, count - (title ? 9 : 22));
  return <span data-assistant-reveal={complete ? "complete" : "revealing"}><span className={styles.srOnly}>{text}</span><span aria-hidden="true">{complete ? text : <>{text.slice(0, leading)}<span className={styles.leadingText}>{text.slice(leading, count)}</span></>}</span></span>;
}
export function AssistantActivity({ label }: { label: string }) {
  return <div className={styles.activity} role="status" aria-live="polite"><span className={styles.activityLabel} data-text={label} data-sweep-pattern="paired-continuous-long-pause">{label}</span></div>;
}
