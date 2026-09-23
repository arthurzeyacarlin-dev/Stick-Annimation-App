"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AssistantDictationCapture, type DictationView } from "../../lib/assistant/assistantDictationCapture";
import { REASONING, type Reasoning } from "../../lib/assistant/assistantContracts";
import type { useAssistantSessions } from "./useAssistantSessions";
import styles from "./diamondAssistant.module.css";

export function AssistantComposer({ chats }: { chats: ReturnType<typeof useAssistantSessions> }) {
  const [dictation, setDictation] = useState<DictationView>({ phase: "idle", seconds: 0, message: "", levels: [] });
  const capture = useRef<AssistantDictationCapture | null>(null);
  const currentChats = useRef(chats);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { currentChats.current = chats; });
  useEffect(() => {
    const controller = new AssistantDictationCapture(setDictation, text => {
      const current = currentChats.current;
      const next = current.draft ? `${current.draft}${/\s$/.test(current.draft) ? "" : " "}${text}` : text;
      if (next.length > 12000) return false;
      current.setDraft(next); input.current?.focus(); return true;
    });
    capture.current = controller;
    const leave = () => controller.cancel("Dictation stopped because you left the Assistant. Nothing was inserted.");
    const hide = () => { if (document.hidden) leave(); };
    window.addEventListener("pagehide", leave); window.addEventListener("popstate", leave); document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("pagehide", leave); window.removeEventListener("popstate", leave); document.removeEventListener("visibilitychange", hide); controller.dispose(); capture.current = null; };
  }, []);
  const active = dictation.phase !== "idle";
  const send = () => { if (active) capture.current?.cancel(); void chats.send(); };
  const pending = chats.selected?.turns.at(-1)?.status === "pending";
  const full = !chats.selected && chats.sessions.length >= 50;
  const disabled = !chats.ready || chats.storageBlocked || chats.busy || pending || full;
  return <div className={styles.composerArea}>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); send(); }} aria-label="Message composer">
      <label htmlFor="assistant-message" className={styles.srOnly}>Message the Assistant</label>
      <textarea ref={input} id="assistant-message" value={chats.draft} onChange={event => chats.setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!disabled) send(); } }} placeholder="Ask about Diamond Animator…" rows={2} maxLength={12000} aria-describedby="assistant-preview-note" />
      {active && <div className={styles.dictationPanel} data-dictation-phase={dictation.phase}>
        <div className={styles.dictationState}>
          <span className={styles.recordingDot} aria-hidden="true" />
          <span>{dictation.phase === "recording" ? "Recording" : dictation.phase === "requesting" ? "Microphone permission" : dictation.phase === "stopping" ? "Finishing recording" : "Transcribing"}</span>
          {dictation.phase === "recording" && <span role="timer" aria-live="off" aria-label="Recording elapsed time">{Math.floor(dictation.seconds / 60)}:{String(Math.floor(dictation.seconds % 60)).padStart(2, "0")} / 2:00</span>}
        </div>
        {dictation.phase === "recording" && <div className={styles.waveform} role="img" aria-label="Live microphone waveform">{dictation.levels.map((level, i) => <span key={i} style={{ height: `${Math.max(2, level * 32)}px` }} />)}</div>}
        <div className={styles.dictationControls}>
          <button type="button" onClick={() => { capture.current?.cancel(); input.current?.focus(); }} aria-label="Cancel dictation">Cancel</button>
          {dictation.phase === "recording" && <button type="button" onClick={() => void capture.current?.stop()} aria-label="Stop dictation" className={styles.dictationStop}><span aria-hidden="true">■</span> Stop</button>}
        </div>
      </div>}
      <div className={styles.composerTools}>
        <label className={styles.reasoning}><span>Reasoning</span><select aria-label="Reasoning level" value={chats.reasoning} disabled={chats.busy || chats.storageBlocked} onChange={event => void chats.reasoningChange(event.target.value as Reasoning)}>{Object.entries(REASONING).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div className={styles.sendTools}>
          <button className={styles.microphone} type="button" disabled={active} onClick={() => void capture.current?.start()} aria-label="Dictate a message" title="Dictate a message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8" /></svg></button>
          {pending ? <button className={styles.send} type="button" aria-label="Cancel answer" title="Cancel answer" onClick={() => void chats.cancel()}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button> : <button className={styles.send} type="submit" disabled={disabled || !chats.draft.trim()} aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 11 6-6 6 6M12 5v14" /></svg></button>}
        </div>
      </div>
    </form>
    <p id="assistant-preview-note" className={styles.previewNote}>{full ? "You have 50 saved chats. Delete a chat before creating another." : "Diamond Animator guidance stays local; current public questions use cited web search. Dictation adds editable text; Stop sends audio to OpenAI for transcription. Audio is not saved."}</p>
    <div className={styles.dictationNotice} role="status" aria-live="polite">{dictation.message}</div>
    <div className={styles.notice} role="status">{chats.notice}{(chats.storageBlocked || chats.pausedJobs.length > 0) && <button className={styles.reconnect} type="button" onClick={chats.retryConnection}>Reconnect / retry saving</button>}</div>
  </div>;
}
