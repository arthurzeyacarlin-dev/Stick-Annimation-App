"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import styles from "./diamondAssistant.module.css";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_MAX_WIDTH = 440;
const SIDEBAR_MIN_MAIN_WIDTH = 560;
const SIDEBAR_COMPACT_BREAKPOINT = 760;
const SIDEBAR_KEYBOARD_STEP = 12;

function DiamondMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l4-5h10l4 5-9 11L3 9z" />
    </svg>
  );
}

function AssistantSessionSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Chat sessions">
      <div className={styles.brand}>
        <span className={styles.brandMark}><DiamondMark /></span>
        <span>Diamond Animator<span className={styles.brandSubtitle}>Assistant</span></span>
      </div>
      <button className={styles.newChat} type="button" disabled aria-describedby="assistant-sessions-note">
        <span aria-hidden="true">＋</span> New Chat <span className={styles.soon}>Soon</span>
      </button>
      <div className={styles.sessionList}>
        <h2>Your chats</h2>
        <p>No chats yet</p>
        <p id="assistant-sessions-note" className={styles.sessionNote}>Saved conversations are coming soon.</p>
      </div>
      <div className={styles.sidebarFoot}>
        <span className={styles.previewDot} aria-hidden="true" /> A space for your questions
      </div>
    </aside>
  );
}

function AssistantConversation() {
  return (
    <section className={styles.conversation} aria-label="Conversation" tabIndex={0}>
      <div className={styles.greeting}>
        <div className={styles.heroMark}><DiamondMark /></div>
        <h1 aria-label="How can I help you with Diamond Animator today?">
          <span>How can I help you with</span>
          <span>Diamond Animator today?</span>
        </h1>
      </div>
    </section>
  );
}

function AssistantComposer() {
  const [draft, setDraft] = useState("");
  const [reasoning, setReasoning] = useState("medium");
  const [notice, setNotice] = useState("");
  const sendPreview = () => {
    if (draft.trim()) setNotice("Messaging is coming soon. Nothing was sent. Your draft stays here until you leave this page.");
  };

  return (
    <div className={styles.composerArea}>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); sendPreview(); }} aria-label="Message composer">
        <label htmlFor="assistant-message" className={styles.srOnly}>Message the Assistant</label>
        <textarea
          id="assistant-message"
          value={draft}
          onChange={event => { setDraft(event.target.value); setNotice(""); }}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendPreview();
            }
          }}
          placeholder="Ask about Diamond Animator…"
          rows={2}
          maxLength={12000}
          aria-describedby="assistant-preview-note"
        />
        <div className={styles.composerTools}>
          <label className={styles.reasoning}>
            <span>Reasoning</span>
            <select aria-label="Reasoning level" value={reasoning} onChange={event => setReasoning(event.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">Extra High</option>
            </select>
          </label>
          <div className={styles.sendTools}>
            <button className={styles.microphone} type="button" disabled aria-label="Microphone — coming soon" title="Dictation is coming soon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8" />
              </svg>
            </button>
            <button className={styles.send} type="submit" disabled={!draft.trim()} aria-label="Send" aria-describedby="assistant-preview-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 11 6-6 6 6M12 5v14" /></svg>
            </button>
          </div>
        </div>
      </form>
      <p id="assistant-preview-note" className={styles.previewNote}>Preview only. Messages aren’t sent or saved. Microphone coming soon.</p>
      <p className={styles.notice} role="status">{notice}</p>
    </div>
  );
}

export function DiamondAssistantScreen() {
  const backRef = useRef<HTMLAnchorElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarMaxWidth, setSidebarMaxWidth] = useState(SIDEBAR_MAX_WIDTH);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  useEffect(() => { backRef.current?.focus({ preventScroll: true }); }, []);

  const measureSidebarMaxWidth = () => {
    const screenWidth = screenRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.floor(screenWidth - SIDEBAR_MIN_MAIN_WIDTH)));
  };

  const resolveSidebarWidth = (requestedWidth: number) => {
    const max = measureSidebarMaxWidth();
    setSidebarMaxWidth(max);
    return Math.min(max, Math.max(SIDEBAR_MIN_WIDTH, Math.round(requestedWidth)));
  };

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const updateBounds = () => {
      if (window.innerWidth <= SIDEBAR_COMPACT_BREAKPOINT) {
        sidebarResizeRef.current = null;
        setSidebarResizing(false);
        return;
      }
      const max = measureSidebarMaxWidth();
      setSidebarMaxWidth(max);
      setSidebarWidth(current => Math.min(max, Math.max(SIDEBAR_MIN_WIDTH, current)));
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(screen);
    window.addEventListener("resize", updateBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

  useEffect(() => {
    if (!sidebarResizing) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [sidebarResizing]);

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || window.innerWidth <= SIDEBAR_COMPACT_BREAKPOINT) return;
    event.preventDefault();
    sidebarResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sidebarWidth };
    setSidebarResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    setSidebarWidth(resolveSidebarWidth(resize.startWidth + event.clientX - resize.startX));
  };

  const endSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    sidebarResizeRef.current = null;
    setSidebarResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const resizeSidebarWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (window.innerWidth <= SIDEBAR_COMPACT_BREAKPOINT) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSidebarWidth(current => resolveSidebarWidth(current - SIDEBAR_KEYBOARD_STEP));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSidebarWidth(current => resolveSidebarWidth(current + SIDEBAR_KEYBOARD_STEP));
    } else if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(measureSidebarMaxWidth());
    }
  };

  return (
    <div
      ref={screenRef}
      className={styles.screen}
      data-assistant-screen
      data-sidebar-resizing={sidebarResizing ? "true" : "false"}
      style={{ "--assistant-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <AssistantSessionSidebar />
      <div
        className={styles.sidebarResizer}
        role="separator"
        aria-label="Resize chat sessions sidebar"
        aria-orientation="vertical"
        aria-controls="assistant-conversation-main"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={sidebarMaxWidth}
        aria-valuenow={sidebarWidth}
        aria-valuetext={`${sidebarWidth} pixels`}
        tabIndex={0}
        data-assistant-sidebar-resizer
        data-resizing={sidebarResizing ? "true" : "false"}
        title="Drag or use arrow keys to resize the chat sessions sidebar."
        onPointerDown={startSidebarResize}
        onPointerMove={moveSidebarResize}
        onPointerUp={endSidebarResize}
        onPointerCancel={endSidebarResize}
        onLostPointerCapture={endSidebarResize}
        onKeyDown={resizeSidebarWithKeyboard}
      />
      <main id="assistant-conversation-main" className={styles.main}>
        <header className={styles.header}>
          <Link ref={backRef} href="/#ai-assistant" prefetch={false} className={styles.back}>
            <span aria-hidden="true">←</span> Back to Home
          </Link>
          <span className={styles.headerTitle}>Assistant</span>
        </header>
        <AssistantConversation />
        <AssistantComposer />
      </main>
    </div>
  );
}
