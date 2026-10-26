"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppHeader } from "./AppHeader";
import styles from "./MainScreen.module.css";

// Redesign Phase 2 (Arthur 2026-10-26): the main screen after logging in. It only draws; every action is passed in
// from ExistingHome, which keeps the same project, recent-project and export code as before.
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--main-display" });

type Recent =
  | { status: "ready"; title: string; edited: string; poster: ReactNode | null; previewFailed: boolean }
  | { status: "loading" | "empty" | "failed" };

type Props = {
  firstName: string | null;
  mainRef: RefObject<HTMLElement | null>;
  newProjectButtonRef: RefObject<HTMLButtonElement | null>;
  recentButtonRef: RefObject<HTMLButtonElement | null>;
  openProjectButtonRef: RefObject<HTMLButtonElement | null>;
  creating: boolean;
  recent: Recent;
  recentNotice: string | null;
  onNewProject: () => void;
  onContinueRecent: () => void;
  onOpenProjects: () => void;
  onExport: () => void;
};

// First visit = the browser has never shown this account's Home before; that whole visit (this tab) stays "Welcome".
// A later visit says "Welcome back". If storage is blocked we just say "Welcome".
function useGreeting(userId: string | null) {
  const [greeting, setGreeting] = useState<"Welcome" | "Welcome back" | null>(null);
  useEffect(() => {
    if (!userId) return;
    let next: "Welcome" | "Welcome back" = "Welcome";
    try {
      const seenKey = `diamond.homeSeen.v1:${userId}`;
      const firstVisitKey = `diamond.firstVisit.v1:${userId}`;
      if (!window.localStorage.getItem(seenKey)) {
        window.localStorage.setItem(seenKey, "1");
        window.sessionStorage.setItem(firstVisitKey, "1");
      } else if (!window.sessionStorage.getItem(firstVisitKey)) next = "Welcome back";
    } catch { /* storage blocked */ }
    const timer = window.setTimeout(() => setGreeting(next), 0);
    return () => window.clearTimeout(timer);
  }, [userId]);
  return greeting;
}

export function MainScreen(props: Props) {
  const { firstName, recent, mainRef, newProjectButtonRef, recentButtonRef, openProjectButtonRef } = props;
  const greeting = useGreeting(useAccountSession()?.id ?? null);
  // The first visit gets brand-new words everywhere (Arthur): nothing about "jumping back" or "where you left off".
  const firstVisit = greeting !== "Welcome back";
  return (
    <div className={`${styles.screen} ${display.variable}`}>
      <div className={styles.lattice} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <AppHeader page="home" onExport={props.onExport} />

      <main ref={mainRef} className={styles.main}>
        <section className={styles.hero} aria-labelledby="main-heading">
          {/* Arthur 2026-10-26: the first visit says "Welcome, Name"; after they leave and come back, "Welcome back, Name".
              Hidden (space kept) until we know which, so the words never flip. */}
          <p className={styles.eyebrow} style={greeting ? undefined : { visibility: "hidden" }}>
            {`${greeting ?? "Welcome"}${firstName ? `, ${firstName}` : ""}`}
          </p>
          <h1 id="main-heading" className={styles.title}>What story will you <span className={styles.accent}>animate</span> today?</h1>
          <p className={styles.subtitle} style={greeting ? undefined : { visibility: "hidden" }}>{firstVisit
            ? "Your first animation starts here. Draw it yourself, or let the AI Animator help."
            : "Start a fresh canvas, or jump back into something you were making."}</p>
        </section>

        <section className={styles.actions} aria-label="Start">
          <button ref={newProjectButtonRef} type="button" data-tour="new-project" className={`${styles.tile} ${styles.tilePrimary}`} onClick={props.onNewProject} disabled={props.creating}>
            <span className={styles.tileIcon}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span>
            <span className={styles.tileText}><strong>{props.creating ? "Creating your project…" : "New project"}</strong><small>Start with a blank canvas</small></span>
          </button>
          <button ref={openProjectButtonRef} type="button" data-tour="open-project" className={styles.tile} onClick={props.onOpenProjects}>
            <span className={styles.tileIcon}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg></span>
            <span className={styles.tileText}><strong>Open project</strong><small>All your saved animations</small></span>
          </button>
        </section>

        <section className={styles.recentSection} aria-labelledby="recent-heading" data-tour="recent">
          <h2 id="recent-heading" className={styles.sectionTitle}>{firstVisit ? "Your latest animation" : "Pick up where you left off"}</h2>
          {recent.status === "ready" ? (
            <button ref={recentButtonRef} type="button" className={styles.recent} onClick={props.onContinueRecent} aria-label={`Continue ${recent.title}`}>
              <span className={styles.poster}>{recent.poster ?? <span className={styles.posterNote}>{recent.previewFailed ? "Preview unavailable" : "Loading preview"}</span>}</span>
              <span className={styles.recentInfo}>
                <span className={styles.recentLabel}>{recent.edited}</span>
                <strong className={styles.recentTitle}>{recent.title}</strong>
                <span className={styles.recentCta}>Continue <span aria-hidden="true">→</span></span>
              </span>
            </button>
          ) : (
            <div className={styles.recentEmpty}>
              <strong>{recent.status === "loading" ? "Loading your latest project…" : recent.status === "failed" ? "Your latest project couldn't load" : "Nothing here yet"}</strong>
              <span>{recent.status === "failed" ? "It's safe. Find it in Open project." : recent.status === "empty" ? "Your first animation starts with New project." : ""}</span>
            </div>
          )}
          {props.recentNotice && <p className={styles.notice} role="status">{props.recentNotice}</p>}
        </section>
      </main>
    </div>
  );
}
