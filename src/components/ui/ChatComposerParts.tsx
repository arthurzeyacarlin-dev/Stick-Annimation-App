"use client";

import type { ReactNode } from "react";
import type { DictationView } from "@/src/lib/assistant/assistantDictationCapture";
import styles from "./chatComposer.module.css";

// Shared chat box pieces so the Assistant and the editor's AI Animator look and behave alike.
export const chatComposerStyles = styles;

export function ChatReasoningSelect<T extends string>({ value, options, onChange, disabled, title }: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className={styles.reasoning} title={title}>
      <span>Reasoning</span>
      <select aria-label="Reasoning level" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
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
    <button className={styles.iconButton} type="submit" disabled={disabled} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></svg>
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

export function ChatDictationPanel({ dictation, onCancel, onStop }: { dictation: DictationView; onCancel: () => void; onStop: () => void }) {
  if (dictation.phase === "idle") return null;
  return (
    <div className={styles.dictationPanel} data-dictation-phase={dictation.phase}>
      <div className={styles.dictationState}>
        <span className={styles.recordingDot} aria-hidden="true" />
        <span>{dictation.phase === "recording" ? "Recording" : dictation.phase === "requesting" ? "Microphone permission" : dictation.phase === "stopping" ? "Finishing recording" : "Transcribing"}</span>
        {dictation.phase === "recording" && <span role="timer" aria-live="off" aria-label="Recording elapsed time">{Math.floor(dictation.seconds / 60)}:{String(Math.floor(dictation.seconds % 60)).padStart(2, "0")} / 2:00</span>}
      </div>
      {dictation.phase === "recording" && <div className={styles.waveform} role="img" aria-label="Live microphone waveform">{dictation.levels.map((level, i) => <span key={i} style={{ height: `${Math.max(2, level * 32)}px` }} />)}</div>}
      <div className={styles.dictationControls}>
        <button type="button" onClick={onCancel} aria-label="Cancel dictation">Cancel</button>
        {dictation.phase === "recording" && <button type="button" onClick={onStop} aria-label="Stop dictation" className={styles.dictationStop}><span aria-hidden="true">■</span> Stop</button>}
      </div>
    </div>
  );
}

export function ChatToolsRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className={styles.tools}>
      {left}
      <div className={styles.actions}>{right}</div>
    </div>
  );
}
