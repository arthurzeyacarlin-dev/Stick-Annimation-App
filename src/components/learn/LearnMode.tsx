"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";

// SPEC-0022 Phase 6 (Arthur 2026-10-13): the one-time guided setup ("learn mode"). Steps across the new Home (redesign
// 2026-10-26). Each step outlines ONE thing with a blue glow and a card that explains it. Nothing can be clicked while
// learning. It appears once; Settings → Guided tour starts it again.
type Where = "home" | "credits" | "editor";
type Step = { where: Where; title: string; text: string; find: () => HTMLElement | null };

const visible = (element: Element | null | undefined): HTMLElement | null => {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? element as HTMLElement : null;
};
// Each step finds its control by a data-tour tag, so renaming a button's words can never break the tour again.
const byTour = (name: string) => () => visible(document.querySelector(`[data-tour="${name}"]`));

const STEPS: Step[] = [
  { where: "home", title: "New project", text: "Start a blank animation. Every animation you make begins here.", find: byTour("new-project") },
  { where: "home", title: "Open project", text: "All your saved animations. Edit, watch or export any of them.", find: byTour("open-project") },
  { where: "home", title: "Pick up where you left off", text: "Your latest animation waits here. Click it to keep going.", find: byTour("recent") },
  { where: "home", title: "AI Dashboard", text: "See your AI credits and how many you have used.", find: byTour("ai-dashboard") },
  { where: "home", title: "Notifications and Menu", text: "The bell shows new messages. The menu has Help (ask the Assistant anything), Report a Problem and more.", find: byTour("bell-menu") },
  { where: "home", title: "Export", text: "Turn an animation into a video, a GIF or pictures you can share.", find: byTour("export") },
  { where: "home", title: "Your account", text: "Your profile, settings and plan, and Log out.", find: byTour("account") },
];

type Saved = { seen: boolean; active: boolean; step: number };
const keyFor = (userId: string) => `da-learn-v1:${userId}`;
const read = (userId: string): Saved => {
  try { const value = JSON.parse(localStorage.getItem(keyFor(userId)) ?? "null") as Saved | null; if (value && typeof value.step === "number") return value; } catch { /* no storage */ }
  return { seen: false, active: false, step: 0 };
};

/** Starts learn mode again (Settings → Guided tour). */
export function startLearnMode() { window.dispatchEvent(new CustomEvent("da-learn-start")); }

export function LearnMode() {
  const account = useAccountSession();
  const userId = account?.id ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [lost, setLost] = useState(false);
  const pathRef = useRef(pathname);
  const rectRef = useRef(rect);
  const lostSince = useRef(0);
  const nav = useRef({ step: -1, pushedAt: 0, clicks: 0, clickedAt: 0 });

  const save = useCallback((next: Saved) => {
    setSaved(next);
    if (userId) { try { localStorage.setItem(keyFor(userId), JSON.stringify(next)); } catch { /* no storage */ } }
  }, [userId]);

  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  // Load this account's saved state.
  useEffect(() => {
    if (!userId) return;
    const timer = window.setTimeout(() => setSaved(read(userId)), 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  // Settings → Learn mode.
  useEffect(() => {
    const start = () => { save({ seen: true, active: true, step: 0 }); setWelcome(false); };
    window.addEventListener("da-learn-start", start);
    return () => window.removeEventListener("da-learn-start", start);
  }, [save]);

  // The welcome card: only once, only on Home, only when Home is really showing.
  useEffect(() => {
    if (!saved || saved.seen || saved.active) return;
    const id = window.setInterval(() => {
      const home = pathRef.current === "/" && !!byTour("new-project")() && !document.querySelector("[data-project-recovery-prompt]") && !document.querySelector(".drawing-right-panel");
      setWelcome(home);
    }, 700);
    return () => window.clearInterval(id);
  }, [saved]);

  // While learning: keep the outline on the target, take the user to the right screen.
  const active = !!saved?.active;
  const stepIndex = saved?.step ?? 0;
  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (!step) return;
    nav.current = { step: stepIndex, pushedAt: 0, clicks: 0, clickedAt: 0 };
    const loop = () => {
      const now = performance.now();
      const state = nav.current;
      const path = pathRef.current;
      const inEditor = !!document.querySelector(".drawing-right-panel");
      if (step.where === "credits" && path !== "/credits" && now - state.pushedAt > 1500) { state.pushedAt = now; router.push("/credits"); }
      if (step.where === "home" && (path !== "/" ) && now - state.pushedAt > 1500) { state.pushedAt = now; router.push("/"); }
      if (step.where === "editor" && !inEditor) {
        if (path !== "/") { if (now - state.pushedAt > 1500) { state.pushedAt = now; router.push("/"); } }
        else if (state.clicks < 4 && now - state.clickedAt > 1800) {
          const button = byTour("new-project")();
          if (button) { state.clicks += 1; state.clickedAt = now; button.click(); }
        }
      }
      const target = step.find();
      if (target) {
        lostSince.current = 0;
        const box = target.getBoundingClientRect();
        const next = { left: box.left, top: box.top, width: box.width, height: box.height };
        const prev = rectRef.current;
        if (!prev || Math.abs(prev.left - next.left) > 0.5 || Math.abs(prev.top - next.top) > 0.5 || Math.abs(prev.width - next.width) > 0.5 || Math.abs(prev.height - next.height) > 0.5) { rectRef.current = next; setRect(next); }
        setLost(false);
      } else {
        if (!lostSince.current) lostSince.current = now;
        if (now - lostSince.current > (step.where === "editor" ? 800 : 2500)) { rectRef.current = null; setRect(null); setLost(true); }
      }
    };
    loop();
    const timer = window.setInterval(loop, 120);
    return () => window.clearInterval(timer);
  }, [active, stepIndex, router]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setConfirmStop((value) => !value); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!userId || !saved) return null;

  const closeWelcome = (start: boolean) => { setWelcome(false); save({ seen: true, active: start, step: 0 }); };

  if (!active) {
    if (!welcome) return null;
    return (
      <div role="dialog" aria-modal="true" aria-label="Welcome to Diamond Animator" className="da-learn-scrim">
        <style>{LEARN_CSS}</style>
        <div className="da-learn-welcome">
          <button type="button" className="da-learn-close" aria-label="Close" onClick={() => closeWelcome(false)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
          <span className="da-learn-logo"><DiamondLogo size={44} /></span>
          <h2>Welcome to Diamond Animator</h2>
          <p>Want a quick guided tour? It takes about a minute and shows you the important parts.</p>
          <div className="da-learn-actions">
            <button type="button" className="da-learn-primary" onClick={() => closeWelcome(true)}>Start guided tour</button>
            <button type="button" className="da-learn-quiet" onClick={() => closeWelcome(false)}>Don&apos;t show again</button>
          </div>
        </div>
      </div>
    );
  }

  const step = STEPS[stepIndex] ?? STEPS[0];
  const last = stepIndex >= STEPS.length - 1;
  const pad = 6;
  const below = rect ? rect.top + rect.height + 170 < innerHeight : true;
  const cardLeft = rect ? Math.min(Math.max(12, rect.left + rect.width / 2 - 170), innerWidth - 352) : 0;
  const finish = () => { setFinishing(false); save({ seen: true, active: false, step: 0 }); };
  const filled = finishing ? STEPS.length : stepIndex;
  const goNext = () => {
    if (!last) { save({ ...saved, step: stepIndex + 1 }); return; }
    setFinishing(true);
    window.setTimeout(finish, 650);
  };

  return (
    <>
      <style>{LEARN_CSS}</style>
      <div onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.preventDefault()} style={{ position: "fixed", inset: 0, zIndex: 9000, cursor: "default" }} />
      {rect && (
        <div aria-hidden="true" className="da-learn-ring" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      )}
      {rect && (
        <div role="status" className="da-learn-card" style={{ left: Math.max(12, cardLeft), top: below ? rect.top + rect.height + pad + 14 : undefined, bottom: below ? undefined : innerHeight - rect.top + pad + 14 }}>
          <span aria-hidden="true" className="da-learn-tip" data-below={below ? "true" : undefined} style={{ left: Math.min(Math.max(rect.left + rect.width / 2 - Math.max(12, cardLeft), 20), 320) - 7 }} />
          <span className="da-learn-count">Step {stepIndex + 1} of {STEPS.length}</span>
          <strong>{step.title}</strong>
          <span className="da-learn-text">{step.text}</span>
        </div>
      )}
      {lost && (
        <div role="status" className="da-learn-card da-learn-lost">
          <strong>{step.title}</strong>
          <span className="da-learn-text">{step.where === "editor" ? "Opening a new project so we can show you this. One moment…" : `${step.text} (It isn't on this screen right now. Press Next to keep going.)`}</span>
        </div>
      )}
      <div className="da-learn-bar">
        <div className="da-learn-track" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((_, index) => (
            <span key={index}><span style={{ width: index < filled ? "100%" : "0%" }} /></span>
          ))}
        </div>
        <span className="da-learn-num">{Math.min(stepIndex + 1, STEPS.length)}/{STEPS.length}</span>
        <button type="button" className="da-learn-quiet da-learn-small" onClick={() => setConfirmStop(true)}>Stop</button>
        <button type="button" className="da-learn-primary da-learn-small" onClick={goNext} disabled={finishing}>{last ? "Finish" : "Next"}</button>
      </div>
      {confirmStop && (
        <div role="dialog" aria-modal="true" className="da-learn-scrim" style={{ zIndex: 9010 }}>
          <div className="da-learn-welcome da-learn-confirm">
            <h3>Stop guided tour?</h3>
            <p>You can start it again any time in Settings.</p>
            <div className="da-learn-actions">
              <button type="button" className="da-learn-quiet" onClick={() => { setConfirmStop(false); finish(); }}>Stop</button>
              <button type="button" className="da-learn-primary" onClick={() => setConfirmStop(false)}>Keep going</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const LEARN_CSS = `
.da-learn-scrim { position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center; padding: 16px; background: rgba(3, 9, 20, .74); }
.da-learn-welcome { position: relative; overflow: hidden; isolation: isolate; width: min(440px, 100%); padding: 34px 28px 28px; border-radius: 20px; border: 1px solid #244267; text-align: center; color: #f6f9ff;
  background: radial-gradient(ellipse 360px 200px at 50% -30px, rgba(0, 102, 255, .3), transparent 75%), #071120; box-shadow: 0 30px 80px rgba(0, 0, 0, .55); }
.da-learn-welcome::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background-image: radial-gradient(circle, rgba(92, 140, 220, .4) 1.3px, transparent 1.8px); background-size: 26px 26px;
  -webkit-mask-image: radial-gradient(ellipse 260px 160px at 50% 0%, #000 0%, transparent 75%); mask-image: radial-gradient(ellipse 260px 160px at 50% 0%, #000 0%, transparent 75%); }
.da-learn-logo { display: inline-block; line-height: 0; margin-bottom: 14px; color: #fff; filter: drop-shadow(0 0 16px rgba(0, 102, 255, .8)); }
.da-learn-welcome h2, .da-learn-welcome h3 { margin: 0 0 8px; font-family: var(--font-display), var(--font-geist-sans), sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
.da-learn-welcome h3 { font-size: 20px; }
.da-learn-welcome p { margin: 0 0 22px; color: #c9d6ea; font-size: 14px; line-height: 1.55; }
.da-learn-confirm { padding-top: 26px; }
.da-learn-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.da-learn-primary, .da-learn-quiet { min-height: 42px; padding: 0 18px; border-radius: 11px; font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; transition: none; }
.da-learn-primary { border: 1px solid #0066ff; background: linear-gradient(180deg, #2b7bff, #0066ff); color: #fff; box-shadow: 0 8px 22px rgba(0, 102, 255, .32); }
.da-learn-primary:hover:enabled { background: var(--da-hover-super, #3d8bff); border-color: var(--da-hover-super, #3d8bff); box-shadow: 0 10px 26px rgba(0, 102, 255, .45); }
.da-learn-quiet { border: 1px solid #244267; background: transparent; color: #f6f9ff; }
.da-learn-quiet:hover { background: var(--da-hover-soft, #0b2550); border-color: var(--da-hover-soft, #0b2550); }
.da-learn-small { min-height: 36px; padding: 0 12px; font-size: 13px; }
.da-learn-close { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: #8fabd0; cursor: pointer; }
.da-learn-close:hover { background: var(--da-hover-soft, #0b2550); color: #fff; }
.da-learn-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.da-learn-ring { position: fixed; z-index: 9001; pointer-events: none; border-radius: 16px; box-shadow: 0 0 0 2px #0066ff, 0 0 22px 4px rgba(0,102,255,.75); animation: da-learn-glow 1.6s ease-in-out infinite;
  transition: left 260ms cubic-bezier(.3,.7,.2,1), top 260ms cubic-bezier(.3,.7,.2,1), width 260ms cubic-bezier(.3,.7,.2,1), height 260ms cubic-bezier(.3,.7,.2,1); }
@keyframes da-learn-glow { 0%,100% { box-shadow: 0 0 0 2px #0066ff, 0 0 14px 2px rgba(0,102,255,.55); } 50% { box-shadow: 0 0 0 2px #66b3ff, 0 0 30px 8px rgba(0,102,255,.9); } }
.da-learn-card { position: fixed; z-index: 9003; width: 340px; max-width: calc(100vw - 24px); padding: 16px 18px; border-radius: 16px; border: 1px solid #2b5c99; color: #f6f9ff;
  background: #071120; box-shadow: 0 22px 54px rgba(0,0,0,.55), 0 0 26px rgba(0,102,255,.16); }
.da-learn-card strong { display: block; margin: 2px 0 4px; font-family: var(--font-display), var(--font-geist-sans), sans-serif; font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
.da-learn-count { display: block; color: #6fa8ff; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.da-learn-text { display: block; color: #c9d6ea; font-size: 13.5px; line-height: 1.55; }
.da-learn-tip { position: absolute; bottom: -8px; width: 14px; height: 14px; transform: rotate(45deg); background: #071120; border-right: 1px solid #2b5c99; border-bottom: 1px solid #2b5c99; }
.da-learn-tip[data-below] { bottom: auto; top: -8px; border: 0; border-left: 1px solid #2b5c99; border-top: 1px solid #2b5c99; }
.da-learn-lost { left: 50%; top: 90px; transform: translateX(-50%); width: 380px; }
.da-learn-bar { position: fixed; z-index: 9004; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; width: min(420px, calc(100vw - 24px)); padding: 8px 8px 8px 14px;
  border-radius: 14px; border: 1px solid #2b5c99; background: rgba(7, 17, 32, .96); color: #f6f9ff; box-shadow: 0 16px 40px rgba(0,0,0,.5), 0 0 24px rgba(0,102,255,.18); }
.da-learn-track { display: flex; gap: 3px; flex: 1 1 auto; }
.da-learn-track > span { position: relative; flex: 1; height: 6px; overflow: hidden; border-radius: 999px; background: rgba(0,102,255,.16); }
.da-learn-track > span > span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: linear-gradient(90deg, #2b7bff, #66b3ff); transition: width 520ms cubic-bezier(.3,.7,.2,1); }
.da-learn-num { font-size: 12px; color: #8fabd0; white-space: nowrap; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .da-learn-ring { animation: none; transition: none; } }
`;
