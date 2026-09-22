"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { type Session } from "../../lib/assistant/assistantContracts";
import { AssistantText } from "./AssistantText";
import type { useAssistantSessions } from "./useAssistantSessions";
import styles from "./diamondAssistant.module.css";

type Chats = ReturnType<typeof useAssistantSessions>;
function ChatTitle({ session, animate }: { session: Session; animate: boolean }) {
  const wrapper = useRef<HTMLSpanElement>(null); const measure = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const update = () => setDistance(Math.max(0, (measure.current?.getBoundingClientRect().width ?? 0) - (wrapper.current?.clientWidth ?? 0)));
    update(); const observer = new ResizeObserver(update); if (wrapper.current) observer.observe(wrapper.current); if (measure.current) observer.observe(measure.current); return () => observer.disconnect();
  }, [session.title]);
  return <span ref={wrapper} className={styles.titleWindow} data-overflow={distance > 1} style={{ "--title-travel": `-${distance}px`, "--title-duration": `${Math.min(12, Math.max(2, distance / 38))}s` } as CSSProperties}>
    <span className={styles.chatTitle}><AssistantText text={session.title} animate={animate} title /></span><span ref={measure} className={styles.titleMeasure} aria-hidden="true">{session.title}</span>
  </span>;
}
export function AssistantSessionSidebar({ chats, mark }: { chats: Chats; mark: ReactNode }) {
  const [dialog, setDialog] = useState<{ kind: "rename" | "delete"; target: Session } | null>(null);
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null); const returnFocus = useRef<HTMLElement | null>(null); const newRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (dialog) dialogRef.current?.showModal(); }, [dialog]);
  const open = (kind: "rename" | "delete", target: Session) => { returnFocus.current = document.activeElement as HTMLElement; setName(target.title); setError(""); setDialog({ kind, target }); };
  const close = () => { dialogRef.current?.close(); setDialog(null); const target = returnFocus.current; requestAnimationFrame(() => (target?.isConnected ? target : newRef.current)?.focus()); };
  const submit = async () => {
    if (!dialog || saving) return; setSaving(true); setError("");
    try { if (dialog.kind === "rename") await chats.rename(dialog.target, name); else await chats.remove(dialog.target); close(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "This chat could not be changed."); }
    finally { setSaving(false); }
  };
  return <aside className={styles.sidebar} aria-label="Chat sessions">
    <div className={styles.brand}><span className={styles.brandMark}>{mark}</span><span>Diamond Animator<span className={styles.brandSubtitle}>Assistant</span></span></div>
    <button ref={newRef} className={styles.newChat} type="button" disabled={!chats.ready || chats.storageBlocked || chats.busy || chats.sessions.length >= 50} aria-describedby="assistant-sessions-note" onClick={chats.newChat}><span aria-hidden="true">＋</span> New Chat</button>
    <div className={styles.sessionList} data-full={chats.sessions.length >= 50}>
      <h2>Your chats</h2>
      {!chats.sessions.length && <p>{chats.ready ? "No chats yet" : "Loading chats…"}</p>}
      <p id="assistant-sessions-note" className={styles.sessionNote}>{chats.sessions.length >= 50 ? "Delete a chat before creating another." : !chats.sessions.length ? "Your chats will appear here after you send a message." : "Saved on this device"}</p>
      <div className={styles.chatCards}>
        {chats.sessions.map(session => <div key={session.id} className={styles.chatCard} data-selected={session.id === chats.selectedId} data-session-id={session.id}>
          <button className={styles.chatSelect} aria-label={`Open chat: ${session.title}`} aria-current={session.id === chats.selectedId ? "true" : undefined} title={session.title} onClick={() => chats.select(session.id)}><ChatTitle session={session} animate={!!chats.reveal[session.id] && session.titleSource === "automatic" && session.title !== "Untitled chat"} /></button>
          <div className={styles.chatActions}>
            <button type="button" aria-label={`Rename chat: ${session.title}`} title="Rename chat" onClick={() => open("rename", session)}>✎</button>
            <button type="button" aria-label={`Delete chat: ${session.title}`} title="Delete chat" onClick={() => open("delete", session)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></svg></button>
          </div>
        </div>)}
      </div>
    </div>
    <div className={styles.sidebarFoot}><span className={styles.previewDot} aria-hidden="true" /> A space for your questions</div>
    {dialog && <dialog ref={dialogRef} className={styles.chatDialog} aria-labelledby="chat-dialog-title" aria-describedby="chat-dialog-description" onCancel={event => { event.preventDefault(); close(); }}>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <h2 id="chat-dialog-title">{dialog.kind === "rename" ? "Rename chat" : "Delete chat?"}</h2>
        <p id="chat-dialog-description">{dialog.kind === "rename" ? "Your chosen name stays in charge of this chat." : `“${dialog.target.title}” and its conversation will be removed from this device.`}</p>
        {dialog.kind === "rename" && <label>Chat name<input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={160} /></label>}
        {dialog.kind === "delete" && dialog.target.turns.at(-1)?.status === "pending" && <p>Cancel the active answer and wait for it to stop before deleting this chat.</p>}
        {error && <p className={styles.dialogError} role="alert">{error} Close this dialog to review the current chat.</p>}
        <div className={styles.dialogActions}><button type="button" autoFocus={dialog.kind === "delete"} onClick={close}>Cancel</button><button type="submit" disabled={saving || (dialog.kind === "delete" && dialog.target.turns.at(-1)?.status === "pending")} className={dialog.kind === "delete" ? styles.dangerButton : ""}>{saving ? "Saving…" : dialog.kind === "rename" ? "Save name" : "Delete chat"}</button></div>
      </form>
    </dialog>}
  </aside>;
}
