"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AssistantActivity, AssistantText } from "./AssistantText";
import type { useAssistantSessions } from "./useAssistantSessions";
import styles from "./diamondAssistant.module.css";

export function AssistantConversation({ chats, mark }: { chats: ReturnType<typeof useAssistantSessions>; mark: ReactNode }) {
  const pane = useRef<HTMLElement>(null); const content = useRef<HTMLDivElement>(null); const follow = useRef(true); const [away, setAway] = useState(false);
  const session = chats.selected; const turn = session?.turns.at(-1); const live = turn ? chats.live[turn.jobId] : null;
  const paused = turn ? chats.pausedJobs.includes(turn.jobId) : false;
  useEffect(() => { if (pane.current) pane.current.scrollTop = pane.current.scrollHeight; }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (follow.current && pane.current && !document.querySelector("dialog[open]") && !window.getSelection()?.toString()) pane.current.scrollTop = pane.current.scrollHeight; });
    if (content.current) observer.observe(content.current); return () => observer.disconnect();
  }, [session?.id]);
  return <div className={styles.conversationRegion}>
    <section ref={pane} className={styles.conversation} aria-label="Conversation" tabIndex={0} onScroll={() => { if (!pane.current) return; const el = pane.current; const isAway = el.scrollHeight - el.scrollTop - el.clientHeight > 80; follow.current = !isAway; setAway(isAway); }}>
      {!session ? <div className={styles.greeting}>
        <div className={styles.heroMark}>{mark}</div>
        <h1 aria-label="How can I help you with Diamond Animator today?"><span>How can I help you with</span><span>Diamond Animator today?</span></h1>
      </div> : <div ref={content} className={styles.messageList}>
        <h1 className={styles.srOnly}>{session.title}</h1>
        {session.messages.map(message => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage} aria-label={message.role === "user" ? "Your message" : "Assistant reply"} data-message-id={message.id}>
          <span className={styles.messageRole}>{message.role === "user" ? "You" : "Diamond Animator"}</span>
          <div className={styles.messageText}><AssistantText text={message.text} animate={message.role === "assistant" && chats.reveal[session.id] === message.turnId} /></div>
          {!!message.citations?.length && <div className={styles.sources} aria-label="Sources"><span>Sources</span><ol>{[...new Map(message.citations.map(citation => [citation.url, citation])).values()].sort((a, b) => a.index - b.index).map(citation => <li key={citation.url}><a href={citation.url} target="_blank" rel="noreferrer noopener">[{citation.index}] {citation.title}<span className={styles.srOnly}> (opens in a new tab)</span></a></li>)}</ol></div>}
        </article>)}
        {chats.showLongWaitProgress && <p className={styles.longWaitProgress} data-assistant-progress={turn!.jobId} role="status"><AssistantText key={turn!.jobId} text="I’m putting together a clear, simple explanation…" animate /></p>}
        {turn?.status === "pending" && !paused && !chats.storageBlocked && (live?.status === "thinking" || live?.status === "searching" || live?.status === "finalizing") && <AssistantActivity label={live.status === "thinking" ? "Thinking" : live.status === "searching" ? `Searching ${live.events.at(-1)?.topic}…` : "Finalizing answer"} />}
        {turn?.status === "pending" && !live && !paused && <p className={styles.turnNote} role="status">Connecting…</p>}
        {turn && turn.status !== "pending" && turn.status !== "done" && <p className={styles.turnNote} role="status">{turn.error}</p>}
        {session.messages.length > 32 && <p className={styles.contextNote}>Replies use a bounded recent part of this chat.</p>}
      </div>}
    </section>
    {away && session && <button className={styles.jumpLatest} type="button" aria-label="Jump to latest" title="Jump to latest" onClick={() => { follow.current = true; setAway(false); if (pane.current) pane.current.scrollTo({ top: pane.current.scrollHeight, behavior: "instant" }); }}><span aria-hidden="true">↓</span></button>}
  </div>;
}
