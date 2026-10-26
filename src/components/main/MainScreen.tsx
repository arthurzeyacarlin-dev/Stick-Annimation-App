"use client";

import type { ReactNode, RefObject } from "react";
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

export function MainScreen(props: Props) {
  const { firstName, recent } = props;
  return (
    <div className={`${styles.screen} ${display.variable}`}>
      <div className={styles.lattice} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <AppHeader page="home" onExport={props.onExport} />

      <main ref={props.mainRef} className={styles.main}>
        <section className={styles.hero} aria-labelledby="main-heading">
          <p className={styles.eyebrow}>{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</p>
          <h1 id="main-heading" className={styles.title}>What story will you <span className={styles.accent}>animate</span> today?</h1>
          <p className={styles.subtitle}>Start a fresh canvas, or jump back into something you were making.</p>
        </section>

        <section className={styles.actions} aria-label="Start">
          <button ref={props.newProjectButtonRef} type="button" data-tour="new-project" className={`${styles.tile} ${styles.tilePrimary}`} onClick={props.onNewProject} disabled={props.creating}>
            <span className={styles.tileIcon}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span>
            <span className={styles.tileText}><strong>{props.creating ? "Creating your project…" : "New project"}</strong><small>Start with a blank canvas</small></span>
          </button>
          <button ref={props.openProjectButtonRef} type="button" data-tour="open-project" className={styles.tile} onClick={props.onOpenProjects}>
            <span className={styles.tileIcon}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg></span>
            <span className={styles.tileText}><strong>Open project</strong><small>All your saved animations</small></span>
          </button>
        </section>

        <section className={styles.recentSection} aria-labelledby="recent-heading" data-tour="recent">
          <h2 id="recent-heading" className={styles.sectionTitle}>Pick up where you left off</h2>
          {recent.status === "ready" ? (
            <button ref={props.recentButtonRef} type="button" className={styles.recent} onClick={props.onContinueRecent} aria-label={`Continue ${recent.title}`}>
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
