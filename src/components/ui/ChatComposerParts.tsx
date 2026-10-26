"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DictationView } from "@/src/lib/assistant/assistantDictationCapture";
import styles from "./chatComposer.module.css";

// Shared chat box pieces so the Assistant and the editor's AI Animator look and behave alike.
export const chatComposerStyles = styles;

// Effort (Arthur 2026-10-25): click "Effort" and a bar opens with a dot that slides between Auto, Low, Medium and High.
// It always starts on Auto (new chat, new project): the chat box then picks Low, Medium or High from the message itself
// (pickAutoEffort). The chosen level really goes to the AI as its thinking effort.
export type ChatEffort = "auto" | "low" | "medium" | "high";
const EFFORT_STOPS: ReadonlyArray<{ value: ChatEffort; label: string; hint: string }> = [
  { value: "auto", label: "Auto", hint: "Decides how long to think for you." },
  { value: "low", label: "Low", hint: "Great for fast, simple answers." },
  { value: "medium", label: "Medium", hint: "Thinks it through for everyday questions." },
  { value: "high", label: "High", hint: "Thinks deeply about hard problems." },
];
// Auto: short simple messages think a little, long or planning-type messages think hard, everything else in between.
export function pickAutoEffort(message: string): "low" | "medium" | "high" {
  const text = message.trim();
  const words = text ? text.split(/\s+/).length : 0;
  if (text.length > 400 || /\b(plan|step[- ]by[- ]step|explain why|compare|design|debug|story|scene|several|multiple)\b/i.test(text)) return "high";
  if (words <= 12) return "low";
  return "medium";
}
export function ChatEffortPicker({ value, onChange, disabled }: { value: ChatEffort; onChange: (value: ChatEffort) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const last = EFFORT_STOPS.length - 1;
  const index = Math.max(0, EFFORT_STOPS.findIndex((stop) => stop.value === value));
  const stopAt = (clientX: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box) return index;
    return Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * last);
  };
  const choose = (next: number) => { const stop = EFFORT_STOPS[Math.min(last, Math.max(0, next))]; if (stop.value !== value) onChange(stop.value); };
  return (
    <div className={styles.effort} ref={rootRef}>
      <button type="button" className={styles.effortButton} disabled={disabled} aria-expanded={open} aria-haspopup="dialog" aria-label={`Effort: ${EFFORT_STOPS[index].label}`} onClick={() => setOpen((was) => !was)}>
        {/* Arthur 2026-10-27: just the level (Auto, Low, Medium, High), no "Effort" word. */}
        <span className={styles.effortValue}>{EFFORT_STOPS[index].label}</span>
      </button>
      {open && <div className={styles.effortPopover} role="dialog" aria-label="Effort">
        <div className={styles.effortTop}><span className={styles.effortTitle}>Effort</span><span className={styles.effortHint}>{EFFORT_STOPS[index].hint}</span></div>
        <div
          className={styles.effortSlider} data-dragging={dragging ? "true" : "false"}
          role="slider" tabIndex={0} aria-label="Effort" aria-valuemin={0} aria-valuemax={last} aria-valuenow={index} aria-valuetext={EFFORT_STOPS[index].label}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); choose(stopAt(event.clientX)); }}
          onPointerMove={(event) => { if (dragging) choose(stopAt(event.clientX)); }}
          onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); choose(index + 1); }
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); choose(index - 1); }
            if (event.key === "Home") { event.preventDefault(); choose(0); }
            if (event.key === "End") { event.preventDefault(); choose(last); }
          }}
        >
          <div className={styles.effortTrack} ref={trackRef}>
            <div className={styles.effortFill} style={{ width: `${(index / last) * 100}%` }} />
            {EFFORT_STOPS.map((stop, i) => <span key={stop.value} className={styles.effortTick} data-on={i <= index ? "true" : "false"} style={{ left: `${(i / last) * 100}%` }} />)}
            <span className={styles.effortThumb} style={{ left: `${(index / last) * 100}%` }} />
          </div>
        </div>
        <div className={styles.effortStops}>
          {EFFORT_STOPS.map((stop, i) => (
            <button type="button" key={stop.value} data-hover="icon" data-selected={stop.value === value} style={{ left: `${(i / last) * 100}%` }} onClick={() => choose(i)}>{stop.label}</button>
          ))}
        </div>
        <div className={styles.effortEnds}><span>Auto-pick</span><span>Smarter</span></div>
      </div>}
    </div>
  );
}

export function ChatDictateButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className={styles.iconButton} type="button" disabled={disabled} onClick={onClick} aria-label="Dictate a message" title="Dictate a message">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8" /></svg>
    </button>
  );
}

export function ChatSendButton({ disabled, label = "Send" }: { disabled?: boolean; label?: string }) {
  return (
    <button className={`${styles.iconButton} ${styles.sendButton}`} type="submit" disabled={disabled} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6" /></svg>
    </button>
  );
}

export function ChatStopButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className={styles.iconButton} type="button" onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" /></svg>
    </button>
  );
}

// Dictation (Arthur 2026-10-25): while you talk the chat box shows only ✕ (left), round dots across the whole box that
// grow into waves with your voice, and ✓ (right) — the same size. Silence = still dots, a tiny noise = tiny waves,
// talking = big waves, very loud = full height. No warm-up animation and no loader: the dots appear still the moment
// you tap, and after ✓ the waves settle flat while your words turn into text. No words, no timer, never an error.
const WAVE_DOT = 4; // px: a still dot, and the width of every wave bar
const WAVE_GAP = 9; // px between dots, the same in every chat box
const waveHeight = (level: number) => Math.pow(Math.min(1, Math.max(0, level - 0.02) / 0.5), 0.7); // noise gate, then true to volume
export function ChatDictationPanel({ dictation, onCancel, onStop }: { dictation: DictationView; onCancel: () => void; onStop: () => void }) {
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [count, setCount] = useState(0);
  const idle = dictation.phase === "idle";
  useEffect(() => {
    const wave = waveRef.current;
    if (!wave) return;
    const measure = () => setCount(Math.max(1, Math.floor((wave.clientWidth + WAVE_GAP) / (WAVE_DOT + WAVE_GAP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wave);
    return () => observer.disconnect();
  }, [idle]);
  if (idle) return null;
  const recording = dictation.phase === "recording";
  const levels = recording ? dictation.levels : [];
  return (
    <div className={styles.dictationPanel} data-dictation-phase={dictation.phase}>
      <button type="button" className={`${styles.iconButton} ${styles.sendButton}`} onClick={onCancel} aria-label="Cancel dictation" title="Cancel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" /></svg>
      </button>
      <div ref={waveRef} className={styles.waveform} data-live={recording ? "true" : "false"} role="img" aria-label={recording ? "Listening" : "Working on your recording"}>
        {Array.from({ length: count }, (_, i) => {
          const level = levels.length ? levels[Math.floor((i * levels.length) / count)] : 0;
          return <span key={i} style={{ ["--wave" as string]: String(waveHeight(level)) }} />;
        })}
      </div>
      <button type="button" className={`${styles.iconButton} ${styles.sendButton}`} onClick={onStop} disabled={!recording} aria-label="Done, turn it into text" title="Done">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6" /></svg>
      </button>
    </div>
  );
}

// Replaces the old visible dictation notice: nothing is shown; screen readers hear only the live phases, never an error.
export function ChatDictationStatus({ dictation }: { dictation: DictationView }) {
  const text = dictation.phase === "recording" ? "Listening" : dictation.phase === "transcribing" || dictation.phase === "stopping" ? "Turning your recording into text" : "";
  return <div className={styles.srOnly} role="status" aria-live="polite">{text}</div>;
}

export function ChatToolsRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className={styles.tools}>
      {left}
      <div className={styles.actions}>{right}</div>
    </div>
  );
}
