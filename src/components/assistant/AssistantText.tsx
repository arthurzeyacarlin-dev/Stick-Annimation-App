"use client";
import { useEffect, useState } from "react";
import type { Citation } from "../../lib/assistant/assistantContracts";
import styles from "./diamondAssistant.module.css";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  return reduced;
}
function citedText(text: string, citations: Citation[]) {
  const grouped = new Map<number, Citation[]>();
  for (const citation of citations) grouped.set(citation.endIndex, [...(grouped.get(citation.endIndex) ?? []), citation]);
  const ends = [...grouped.keys()].sort((a, b) => a - b); const output = []; let cursor = 0;
  for (const end of ends) {
    output.push(text.slice(cursor, end));
    for (const citation of grouped.get(end)!) output.push(<a key={`${citation.index}-${citation.url}-${citation.startIndex}-${citation.endIndex}`} className={styles.citation} href={citation.url} target="_blank" rel="noreferrer noopener" aria-label={`Source ${citation.index}: ${citation.title} (opens in a new tab)`}>[{citation.index}]</a>);
    cursor = end;
  }
  output.push(text.slice(cursor)); return output;
}
export function AssistantText({ text, animate = false, title = false, citations = [] }: { text: string; animate?: boolean; title?: boolean; citations?: Citation[] }) {
  const reduced = useReducedMotion(); const [count, setCount] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate || reduced) return;
    let frame = 0; const started = performance.now(); const duration = Math.min(720, Math.max(220, text.length * 3.5));
    const tick = (now: number) => { const next = Math.min(text.length, Math.max(1, Math.ceil(text.length * (now - started) / duration))); setCount(next); if (next < text.length) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [text, animate, reduced, title]);
  const complete = !animate || reduced || count >= text.length;
  const leading = Math.max(0, count - (title ? 9 : 22));
  if (complete && citations.length) return <span data-assistant-reveal="complete">{citedText(text, citations)}</span>;
  return <span data-assistant-reveal={complete ? "complete" : "revealing"}><span className={styles.srOnly}>{text}</span><span aria-hidden="true">{complete ? text : <>{text.slice(0, leading)}<span className={styles.leadingText}>{text.slice(leading, count)}</span></>}</span></span>;
}
export function AssistantActivity({ label }: { label: string }) {
  return <div className={styles.activity} role="status" aria-live="polite"><span className={styles.activityLabel} data-text={label} data-sweep-pattern="paired-continuous-long-pause">{label}</span></div>;
}
