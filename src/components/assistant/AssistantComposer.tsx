"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AssistantDictationCapture, type DictationView } from "../../lib/assistant/assistantDictationCapture";
import type { useAssistantSessions } from "./useAssistantSessions";
import styles from "./diamondAssistant.module.css";
import { ChatDictateButton, ChatDictationPanel, ChatDictationStatus, ChatEffortPicker, ChatSendButton, ChatStopButton, ChatToolsRow, chatComposerStyles, pickAutoEffort, type ChatEffort } from "../ui/ChatComposerParts";

export function AssistantComposer({ chats }: { chats: ReturnType<typeof useAssistantSessions> }) {
  const [dictation, setDictation] = useState<DictationView>({ phase: "idle", seconds: 0, message: "", levels: [] });
  const capture = useRef<AssistantDictationCapture | null>(null);
  const currentChats = useRef(chats);
  const input = useRef<HTMLTextAreaElement>(null);
  const [effort, setEffort] = useState<ChatEffort>("auto");
  // Effort always starts on Auto: a new chat or another chat goes back to Auto (Arthur).
  const selectedChatId = chats.selected?.id ?? null;
  useEffect(() => { setEffort("auto"); }, [selectedChatId]);
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
  const send = () => { if (active) capture.current?.cancel(); void chats.send(effort === "auto" ? pickAutoEffort(chats.draft) : effort); };
  const pending = chats.selected?.turns.at(-1)?.status === "pending";
  const full = !chats.selected && chats.sessions.length >= 50;
  const disabled = !chats.ready || chats.storageBlocked || chats.busy || pending || full;
  return <div className={styles.composerArea}>
    <form className={chatComposerStyles.box} onSubmit={event => { event.preventDefault(); send(); }} aria-label="Message composer">
      <label htmlFor="assistant-message" className={styles.srOnly}>Message the Assistant</label>
      <textarea ref={input} id="assistant-message" value={chats.draft} onChange={event => chats.setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!disabled) send(); } }} placeholder="Ask about Diamond Animator" rows={2} maxLength={12000} aria-describedby="assistant-preview-note" />
      {active
        ? <ChatDictationPanel dictation={dictation} onCancel={() => { capture.current?.cancel(); input.current?.focus(); }} onStop={() => void capture.current?.stop()} />
        : <ChatToolsRow
          left={<ChatEffortPicker value={effort} onChange={setEffort} disabled={chats.busy || chats.storageBlocked} />}
          right={<>
            <ChatDictateButton disabled={active} onClick={() => void capture.current?.start()} />
            {pending ? <ChatStopButton label="Cancel answer" onClick={() => void chats.cancel()} /> : <ChatSendButton disabled={disabled || !chats.draft.trim()} />}
          </>}
        />}
    </form>
    <p id="assistant-preview-note" className={styles.previewNote}>{full ? "You have 50 saved chats. Delete a chat before creating another." : "Explains Diamond Animator. Can’t edit your projects. Answers may use web search; voice is sent to OpenAI to type it and isn’t saved."}</p>
    <ChatDictationStatus dictation={dictation} />
    <div className={styles.notice} role="status">{chats.notice}{(chats.storageBlocked || chats.pausedJobs.length > 0) && <button className={styles.reconnect} type="button" onClick={chats.retryConnection}>Reconnect / retry saving</button>}</div>
  </div>;
}
