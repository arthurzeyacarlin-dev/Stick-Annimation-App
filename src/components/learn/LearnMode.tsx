"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";

// SPEC-0022 Phase 6 (Arthur 2026-10-13): the one-time guided setup ("learn mode"). 10 small steps across Home, the AI
// Dashboard and the editor. Each step outlines ONE thing with a blue glow and an arrow; hovering it explains it. Nothing
// can be clicked while learning. It appears once; Settings → Learn mode starts it again.
type Where = "home" | "credits" | "editor";
type Step = { where: Where; title: string; text: string; find: () => HTMLElement | null };

const visible = (element: Element | null | undefined): HTMLElement | null => {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? element as HTMLElement : null;
};
const byText = (selector: string, pattern: RegExp) => () =>
  visible([...document.querySelectorAll(selector)].find((element) => pattern.test(element.textContent ?? "") && visible(element)));

const commonAncestor = (a: Element | null, b: Element | null): HTMLElement | null => {
  if (!a || !b) return null;
  let node: Element | null = a;
  while (node && !node.contains(b)) node = node.parentElement;
  return visible(node);
};
const STEPS: Step[] = [
  { where: "home", title: "New Project", text: "Start a blank animation. Every animation you make begins here.", find: byText("button", /New Project/) },
  { where: "home", title: "Open Project", text: "Continue an animation you saved before.", find: byText("button", /Open Project/) },
  { where: "home", title: "Help", text: "Ask the Assistant anything about Diamond Animator, any time.", find: byText("button", /Ask the Assistant/) },
  { where: "home", title: "AI Dashboard", text: "See your AI credits and what you have used.", find: byText("a,button", /AI Dashboard/) },
  { where: "home", title: "Notifications and Menu", text: "The bell shows new messages. The menu next to it has Settings and Report a Problem.", find: () => {
    const bell = document.querySelector("[data-notification-trigger-owner] button");
    const menu = document.querySelector('header button[aria-label*="enu" i], button[aria-label="Menu"], button[aria-label="Open menu"]');
    return commonAncestor(bell, menu) ?? visible(bell);
  } },
  { where: "home", title: "Export animation", text: "Turn your animation into a video or pictures you can share.", find: byText("button", /Export animation/) },
];

type Saved = { seen: boolean; active: boolean; step: number };
const keyFor = (userId: string) => `da-learn-v1:${userId}`;
const read = (userId: string): Saved => {
  try { const value = JSON.parse(localStorage.getItem(keyFor(userId)) ?? "null") as Saved | null; if (value && typeof value.step === "number") return value; } catch { /* no storage */ }
  return { seen: false, active: false, step: 0 };
};

/** Starts learn mode again (Settings → Learn mode). */
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
      const home = pathRef.current === "/" && !!byText("button", /New Project/)() && !document.querySelector("[data-project-recovery-prompt]") && !document.querySelector(".drawing-right-panel");
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
          const button = byText("button", /New Project|Continue creating/)();
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
      <div role="dialog" aria-modal="true" aria-label="Welcome to Diamond Animator" style={{ position: "fixed", inset: 0, zIndex: 9000, display: "grid", placeItems: "center", background: "rgba(3,9,20,0.72)" }}>
        <style>{LEARN_CSS}</style>
        <div style={{ position: "relative", width: "min(420px, calc(100vw - 32px))", padding: "28px 26px", borderRadius: 16, border: "1px solid var(--da-line, #163058)", background: "var(--da-panel, #071120)", color: "var(--da-text, #f6f9ff)", textAlign: "center" }}>
          <button type="button" className="da-learn-btn" aria-label="Close" onClick={() => closeWelcome(false)} style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: 10, border: "1px solid transparent", background: "transparent", color: "var(--da-muted, #8fabd0)", fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
          <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>Welcome to Diamond Animator</h2>
          <p style={{ margin: "0 0 20px", color: "var(--da-text-2, #c9d6ea)", fontSize: 14, lineHeight: 1.5 }}>Want a quick guided setup? It takes about a minute and shows you the important parts.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" className="da-learn-btn" onClick={() => closeWelcome(true)} style={{ ...BUTTON, background: "#1b3358", borderColor: "#3a6aa3", color: "#fff" }}>Guided setup</button>
            <button type="button" className="da-learn-btn" onClick={() => closeWelcome(false)} style={BUTTON}>Don&apos;t show again</button>
          </div>
        </div>
      </div>
    );
  }

  const step = STEPS[stepIndex] ?? STEPS[0];
  const last = stepIndex >= STEPS.length - 1;
  const pad = 6;
  const below = rect ? rect.top + rect.height + 150 < innerHeight : true;
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
        <div aria-hidden="true" className="da-learn-ring" style={{ position: "fixed", zIndex: 9001, pointerEvents: "none", left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 14 }} />
      )}
      {rect && (
        <div role="status" style={{ position: "fixed", zIndex: 9003, left: cardLeft, width: 340, top: below ? rect.top + rect.height + pad + 12 : undefined, bottom: below ? undefined : innerHeight - rect.top + pad + 12, padding: "14px 16px", borderRadius: 14, border: "1px solid #3a6aa3", background: "var(--da-panel, #071120)", color: "var(--da-text, #f6f9ff)", boxShadow: "0 18px 44px rgba(0,0,0,.5)" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: Math.min(Math.max(rect.left + rect.width / 2 - cardLeft, 20), 320) - 8, [below ? "top" : "bottom"]: -8, width: 14, height: 14, transform: "rotate(45deg)", background: "var(--da-panel, #071120)", [below ? "borderLeft" : "borderRight"]: "1px solid #3a6aa3", [below ? "borderTop" : "borderBottom"]: "1px solid #3a6aa3" }} />
          <strong style={{ display: "block", marginBottom: 4, fontSize: 15 }}>{step.title}</strong>
          <span style={{ color: "var(--da-text-2, #c9d6ea)", fontSize: 13, lineHeight: 1.5 }}>{step.text}</span>
        </div>
      )}
      {lost && (
        <div role="status" style={{ position: "fixed", zIndex: 9003, left: "50%", top: 90, transform: "translateX(-50%)", width: 360, maxWidth: "calc(100vw - 32px)", padding: "14px 16px", borderRadius: 14, border: "1px solid #3a6aa3", background: "var(--da-panel, #071120)", color: "var(--da-text, #f6f9ff)", fontSize: 13, lineHeight: 1.5 }}>
          <strong style={{ display: "block", marginBottom: 4, fontSize: 15 }}>{step.title}</strong>
          {step.where === "editor" ? "Opening a new project so we can show you this. One moment…" : `${step.text} (It isn't on this screen right now. Press Next to keep going.)`}
        </div>
      )}
      <div style={{ position: "fixed", zIndex: 9004, left: "50%", top: 8, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, width: "min(380px, calc(100vw - 24px))", padding: "6px 8px 6px 12px", borderRadius: 12, border: "1px solid #3a6aa3", background: "var(--da-panel, #071120)", color: "var(--da-text, #f6f9ff)", boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}>
        <div style={{ display: "flex", gap: 2, flex: "1 1 auto", padding: 2, borderRadius: 8, border: "1px solid #3a6aa3" }} aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((_, index) => (
            <span key={index} style={{ position: "relative", flex: 1, height: 8, overflow: "hidden", borderRadius: index === 0 ? "5px 0 0 5px" : index === STEPS.length - 1 ? "0 5px 5px 0" : 0, background: "rgba(0,102,255,.14)" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: index < filled ? "100%" : "0%", background: "#0066ff", transition: "width 520ms cubic-bezier(.3,.7,.2,1)" }} />
            </span>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "var(--da-muted, #8fabd0)", whiteSpace: "nowrap" }}>{Math.min(stepIndex + 1, STEPS.length)}/{STEPS.length}</span>
        <button type="button" className="da-learn-btn" onClick={() => setConfirmStop(true)} style={{ ...BUTTON, minHeight: 28, padding: "0 10px", fontSize: 12 }}>Stop</button>
        <button type="button" className="da-learn-btn" onClick={goNext} disabled={finishing} style={{ ...BUTTON, minHeight: 28, padding: "0 12px", fontSize: 12, background: "#0066ff", borderColor: "#0066ff", color: "#fff" }}>{last ? "Finish" : "Next"}</button>
      </div>
      {confirmStop && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 9010, display: "grid", placeItems: "center", background: "rgba(3,9,20,0.6)" }}>
          <div style={{ width: "min(380px, calc(100vw - 32px))", padding: "22px", borderRadius: 16, border: "1px solid var(--da-line, #163058)", background: "var(--da-panel, #071120)", color: "var(--da-text, #f6f9ff)", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Stop learn mode?</h3>
            <p style={{ margin: "0 0 18px", color: "var(--da-text-2, #c9d6ea)", fontSize: 14, lineHeight: 1.5 }}>You can start it again any time in Settings.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button type="button" className="da-learn-btn" onClick={() => { setConfirmStop(false); finish(); }} style={BUTTON}>Stop</button>
              <button type="button" className="da-learn-btn" onClick={() => setConfirmStop(false)} style={{ ...BUTTON, background: "#0066ff", borderColor: "#0066ff", color: "#fff" }}>Keep going</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const BUTTON: React.CSSProperties = { minHeight: 38, padding: "0 16px", borderRadius: 10, border: "1px solid var(--da-border, #244267)", background: "transparent", color: "var(--da-text, #f6f9ff)", fontSize: 14, fontWeight: 600, cursor: "pointer" };

const LEARN_CSS = `
.da-learn-btn:hover { background: #0066ff !important; border-color: #0066ff !important; color: #ffffff !important; }
.da-learn-ring { box-shadow: 0 0 0 2px #0066ff, 0 0 22px 4px rgba(0,102,255,.75); animation: da-learn-glow 1.6s ease-in-out infinite; }
@keyframes da-learn-glow { 0%,100% { box-shadow: 0 0 0 2px #0066ff, 0 0 14px 2px rgba(0,102,255,.55); } 50% { box-shadow: 0 0 0 2px #66b3ff, 0 0 28px 8px rgba(0,102,255,.9); } }
.da-learn-arrow { animation: da-learn-bob 1s ease-in-out infinite; }
@keyframes da-learn-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .da-learn-ring, .da-learn-arrow { animation: none; } }
`;
