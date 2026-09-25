"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import styles from "./diamondAssistant.module.css";
import { AssistantSessionSidebar } from "./AssistantSessionSidebar";
import { AssistantConversation } from "./AssistantConversation";
import { AssistantComposer } from "./AssistantComposer";
import { useAssistantSessions } from "./useAssistantSessions";
import { NotificationTrigger } from "@/src/components/notifications/NotificationTrigger";
import {
  clearNotificationNavigationIntentV1,
  confirmNotificationTargetArrivalV1,
  registerNotificationOriginSurfaceV1,
  registerNotificationTargetSurfaceV1,
} from "@/src/lib/notifications/notificationNavigation";

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

export function DiamondAssistantScreen() {
  const chats = useAssistantSessions();
  const [composerGeneration, setComposerGeneration] = useState(0);
  const backRef = useRef<HTMLAnchorElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarMaxWidth, setSidebarMaxWidth] = useState(SIDEBAR_MAX_WIDTH);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [navigationVersion, setNavigationVersion] = useState(0);
  useEffect(() => { backRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const changed = () => setNavigationVersion(version => version + 1);
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);

  useEffect(() => {
    const surface = screenRef.current;
    const session = chats.selected;
    const latestTurn = session?.turns.at(-1);
    if (!surface || !session || !latestTurn) return;
    const regions = Array.from(surface.querySelectorAll<HTMLElement>("[data-assistant-terminal-turn]"));
    const originRegion = regions
      .find(element => element.dataset.assistantTerminalTurn === latestTurn.id && element.dataset.assistantTerminalJob === latestTurn.jobId)
      ?? surface.querySelector<HTMLElement>("[data-assistant-conversation-region]");
    if (!originRegion) return;
    const origin = { kind: "assistant", sessionId: session.id, turnId: latestTurn.id, jobId: latestTurn.jobId } as const;
    const originHandle = registerNotificationOriginSurfaceV1({ origin, surfaceElement: surface, terminalRegionElement: originRegion });
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const requestedTurnId = hash.get("turn");
    const requestedJobId = hash.get("job");
    const requestedTurn = session.turns.find(turn => turn.id === requestedTurnId && (turn.jobId === requestedJobId || turn.priorAttempts?.some(attempt => attempt.jobId === requestedJobId)));
    const targetRegion = requestedTurn
      ? regions.find(element => element.dataset.assistantTerminalTurn === requestedTurn.id) ?? null
      : null;
    const target = requestedTurn && requestedJobId ? { kind: "assistant-turn", sessionId: session.id, turnId: requestedTurn.id, jobId: requestedJobId } as const : null;
    const targetHandle = target && targetRegion ? registerNotificationTargetSurfaceV1({ target, surfaceElement: surface, targetRegionElement: targetRegion }) : null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    if (target && targetHandle && targetRegion && hash.get("chat") === session.id) {
      const arrive = async (attempt: number) => {
        if (cancelled) return;
        const focusTarget = targetRegion.querySelector<HTMLElement>("button") ?? targetRegion;
        targetRegion.scrollIntoView({ block: "nearest" });
        focusTarget.focus({ preventScroll: true });
        try {
          const result = await confirmNotificationTargetArrivalV1(targetHandle);
          if (cancelled) return;
          if (result.matched) {
            clearNotificationNavigationIntentV1(target);
            return;
          }
        } catch { /* Keep an unread item when arrival cannot be confirmed. */ }
        if (attempt < 12) retryTimer = setTimeout(() => { void arrive(attempt + 1); }, 80);
      };
      frame = requestAnimationFrame(() => { void arrive(0); });
    }
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
      if (retryTimer) clearTimeout(retryTimer);
      originHandle.unregister();
      targetHandle?.unregister();
    };
  }, [chats.selected, navigationVersion]);

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
      <AssistantSessionSidebar chats={{ ...chats, newChat: () => { setComposerGeneration(value => value + 1); chats.newChat(); } }} mark={<DiamondMark />} />
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
          <span className={styles.headerActions}>
            <span className={styles.headerTitle}>Assistant</span>
            <NotificationTrigger view="assistant" />
          </span>
        </header>
        <AssistantConversation key={chats.selectedId ?? "blank"} chats={chats} mark={<DiamondMark />} />
        <AssistantComposer key={`${chats.selectedId ?? "blank"}:${composerGeneration}`} chats={chats} />
      </main>
    </div>
  );
}
