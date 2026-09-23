"use client";
import { REASONING, type Reasoning } from "../../lib/assistant/assistantContracts";
import type { useAssistantSessions } from "./useAssistantSessions";
import styles from "./diamondAssistant.module.css";

export function AssistantComposer({ chats }: { chats: ReturnType<typeof useAssistantSessions> }) {
  const pending = chats.selected?.turns.at(-1)?.status === "pending";
  const full = !chats.selected && chats.sessions.length >= 50;
  const disabled = !chats.ready || chats.storageBlocked || chats.busy || pending || full;
  return <div className={styles.composerArea}>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void chats.send(); }} aria-label="Message composer">
      <label htmlFor="assistant-message" className={styles.srOnly}>Message the Assistant</label>
      <textarea id="assistant-message" value={chats.draft} onChange={event => chats.setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!disabled) void chats.send(); } }} placeholder="Ask about Diamond Animator…" rows={2} maxLength={12000} aria-describedby="assistant-preview-note" />
      <div className={styles.composerTools}>
        <label className={styles.reasoning}><span>Reasoning</span><select aria-label="Reasoning level" value={chats.reasoning} disabled={chats.busy || chats.storageBlocked} onChange={event => void chats.reasoningChange(event.target.value as Reasoning)}>{Object.entries(REASONING).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div className={styles.sendTools}>
          <button className={styles.microphone} type="button" disabled aria-label="Microphone — coming soon" title="Dictation is coming soon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8" /></svg></button>
          {pending ? <button className={styles.send} type="button" aria-label="Cancel answer" title="Cancel answer" onClick={() => void chats.cancel()}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button> : <button className={styles.send} type="submit" disabled={disabled || !chats.draft.trim()} aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 11 6-6 6 6M12 5v14" /></svg></button>}
        </div>
      </div>
    </form>
    <p id="assistant-preview-note" className={styles.previewNote}>{full ? "You have 50 saved chats. Delete a chat before creating another." : "Diamond Animator guidance stays local; current public questions use cited web search. Microphone coming soon."}</p>
    <div className={styles.notice} role="status">{chats.notice}{(chats.storageBlocked || chats.pausedJobs.length > 0) && <button className={styles.reconnect} type="button" onClick={chats.retryConnection}>Reconnect / retry saving</button>}</div>
  </div>;
}
