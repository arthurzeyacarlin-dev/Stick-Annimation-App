"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { V1_ANIMATOR_UI_ENABLED } from "@/src/lib/ai/v1Animator/v1AnimatorContract";
import { landedCount, queueAnimateStart } from "@/src/components/workspace/ai/aiStart";
import { useTypedPlaceholder } from "@/src/components/workspace/ai/useTypedExample";
import { AppHeader } from "./AppHeader";
import styles from "./MainScreen.module.css";

// Redesign Phase 2 (Arthur 2026-10-26): the main screen after logging in. It only draws; every action is passed in
// from ExistingHome, which keeps the same project, recent-project and export code as before.

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
  // (Nov 23, Arthur: "Home asks a question with no answer box") the answer box: type it here, and a new project opens with the
  // animate window ready and these words already typed. Nothing is sent or paid until they press send and Animate there.
  const [idea, setIdea] = useState("");
  const [ideaFocused, setIdeaFocused] = useState(false);
  const ideaRef = useRef<HTMLInputElement | null>(null);
  useTypedPlaceholder(ideaRef, V1_ANIMATOR_UI_ENABLED && !idea && !ideaFocused, "Type what you want to see…");
  const startAnimating = (event: FormEvent) => {
    event.preventDefault();
    if (props.creating) return;
    queueAnimateStart(idea.trim());
    props.onNewProject();
  };
  // a blank project still opens the animate window for someone who has never made an animation (Esc closes it)
  const newProject = () => { if (V1_ANIMATOR_UI_ENABLED && landedCount() === 0) queueAnimateStart(""); props.onNewProject(); };
  return (
    <div className={styles.screen}>

      <AppHeader page="home" onExport={props.onExport} />

      <main ref={mainRef} className={styles.main}>
        <div className={styles.frame}>
          <section className={styles.hero} aria-labelledby="main-heading">
            {/* Arthur 2026-10-26: the first visit says "Welcome, Name"; after they leave and come back, "Welcome back, Name".
                Hidden (space kept) until we know which, so the words never flip. */}
            <p className={styles.eyebrow} style={greeting ? undefined : { visibility: "hidden" }}>
              {`${greeting ?? "Welcome"}${firstName ? `, ${firstName}` : ""}`}
            </p>
            <h1 id="main-heading" className={styles.title}>What story will you animate today?</h1>
            <p className={styles.subtitle}>{V1_ANIMATOR_UI_ENABLED ? "Type what you want to see and the AI animates it for real. Or draw every frame yourself." : "Tell the AI your story, or draw every frame yourself."}</p>
            {V1_ANIMATOR_UI_ENABLED && (
              <form className={styles.prompt} onSubmit={startAnimating} aria-label="Animate with AI" data-tour="animate-home">
                <span className={styles.promptMark} aria-hidden="true">›</span>
                <input ref={ideaRef} className={styles.promptInput} value={idea} onChange={(event) => setIdea(event.target.value)} onFocus={() => setIdeaFocused(true)} onBlur={() => setIdeaFocused(false)}
                  placeholder="Type what you want to see…" aria-label="What do you want to animate?" maxLength={2000} autoComplete="off" spellCheck />
                <button type="submit" className={styles.promptGo} disabled={props.creating}>
                  {props.creating ? "Opening…" : "Animate"}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </form>
            )}
            {V1_ANIMATOR_UI_ENABLED && <p className={styles.promptNote}>A move, a stunt or a whole story. You see the plan and its exact price before anything is made.</p>}
          </section>

          <div className={styles.work}>
            <section className={styles.actions} aria-label="Start">
              <button ref={newProjectButtonRef} type="button" data-tour="new-project" className={`${styles.action} ${styles.actionPrimary}`} onClick={newProject} disabled={props.creating}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                <span className={styles.actionText}><strong>{props.creating ? "Creating your project…" : "New project"}</strong><small>Start with a blank canvas</small></span>
              </button>
              <button ref={openProjectButtonRef} type="button" data-tour="open-project" className={styles.action} onClick={props.onOpenProjects}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
                <span className={styles.actionText}><strong>Open project</strong><small>All your saved animations</small></span>
              </button>
            </section>

            <section aria-labelledby="recent-heading" data-tour="recent">
              <h2 id="recent-heading" className={styles.srOnly}>{firstVisit ? "Your latest animation" : "Pick up where you left off"}</h2>
              {recent.status === "ready" ? (
                <button ref={recentButtonRef} type="button" className={styles.recent} onClick={props.onContinueRecent} aria-label={`Continue ${recent.title}`}>
                  <span className={styles.poster}>{recent.poster ?? <span className={styles.posterNote}>{recent.previewFailed ? "No preview" : "Loading"}</span>}</span>
                  <span className={styles.recentInfo}>
                    <span className={styles.recentEyebrow} aria-hidden="true">{firstVisit ? "Your latest animation" : "Pick up where you left off"}</span>
                    <strong className={styles.recentTitle}>{recent.title}</strong>
                    <span className={styles.recentLabel}>{recent.edited}</span>
                  </span>
                  <span className={styles.recentCta}>Continue</span>
                </button>
              ) : (
                <div className={styles.recentEmpty}>
                  <strong>{recent.status === "loading" ? "Loading your latest project…" : recent.status === "failed" ? "Your latest project couldn't load" : "No animations yet"}</strong>
                  <span>{recent.status === "failed" ? "It's safe. Find it in Open project." : recent.status === "empty" ? V1_ANIMATOR_UI_ENABLED ? "Type one above, or start with New project." : "Your first one starts with New project." : ""}</span>
                </div>
              )}
              {props.recentNotice && <p className={styles.notice} role="status">{props.recentNotice}</p>}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
