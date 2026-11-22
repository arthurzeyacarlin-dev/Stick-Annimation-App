"use client";
// (Nov 22, Arthur's final pick: "Spotlight" - "when I click it, it needs to actually feel like I can command and make whatever I
// want".) The AI Animator is the editor's command: a field in the middle of the top bar (Cmd/Ctrl+K from anywhere) opens it big
// and centred over the editor; the message box sits at the bottom; once he presses Animate it gets out of the way and the top bar
// shows the work (Animating 42%) until the animation is on the canvas.
// ONLY WHERE THE AI ANIMATOR SITS CHANGES: the same AI panel (DrawingAiPanel / V1AnimatorChat: its chat, card, picture, Animate,
// progress) is moved with a React portal into ONE host element, so it is never made again and nothing it does changes.
// Phones (<= 640 px) keep the bottom sheet's "AI" tab exactly as before.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import { CloseButton } from "@/src/components/ui/CloseButton";
import workspaceThemeStyles from "../workspaceTheme.module.css";

export type AiLayout = "panel" | "spot";
const DOCK_EVENT = "diamond-ai-dock";
const STATUS_EVENT = "diamond-ai-status";

// where the AI Animator lives: the command (computers) or the bottom sheet tab (phones)
export function useAiLayout(): { layout: AiLayout; phone: boolean } {
  const [phone, setPhone] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    setPhone(media.matches); setReady(true);
    const onMedia = () => setPhone(media.matches);
    media.addEventListener("change", onMedia);
    return () => media.removeEventListener("change", onMedia);
  }, []);
  // (the first drawing matches the server's: the tab, then the command right after the page is up)
  return { layout: ready && !phone ? "spot" : "panel", phone };
}

// ---- what the AI Animator is doing (sent by V1AnimatorChat; a look only)
export type AiStatus = { busy: string | null; phase: string | null; pct: number | null; part: [number, number] | null; waiting: boolean; listening?: boolean };
type AiSlots = { tab: HTMLElement | null; dock: HTMLElement | null; current: AiLayout };
type AiWindow = Window & { __diamondAiStatus?: AiStatus; __diamondAiHost?: HTMLDivElement; __diamondAiSlots?: AiSlots };
export function sendAiStatus(status: AiStatus) {
  (window as AiWindow).__diamondAiStatus = status;
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: status }));
}
function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    setStatus((window as AiWindow).__diamondAiStatus ?? null);
    const on = (e: Event) => setStatus((e as CustomEvent).detail as AiStatus);
    window.addEventListener(STATUS_EVENT, on);
    return () => window.removeEventListener(STATUS_EVENT, on);
  }, []);
  return status;
}
const isMaking = (s: AiStatus | null) => Boolean(s && (s.busy === "running" || s.busy === "finishing" || s.busy === "placing" || s.busy === "switching"));
function statusWords(s: AiStatus | null): { text: string; tone: "work" | "ready" } | null {
  if (!s) return null;
  if (s.listening) return { text: "Listening…", tone: "work" };   // (Nov 23) dictating: the status says so, the waves show the voice
  if (s.busy === "thinking") return { text: s.phase === "searching" ? "Searching the web…" : s.phase === "finalizing" ? "Finalizing the plan…" : "Thinking…", tone: "work" };
  if (s.busy === "running" || s.busy === "finishing") {
    const part = s.part && s.part[1] > 1 ? ` · part ${s.part[0]} of ${s.part[1]}` : "";
    return { text: `Animating${typeof s.pct === "number" ? ` · ${Math.round(s.pct)}%` : "…"}${part}`, tone: "work" };
  }
  if (s.busy === "placing" || s.busy === "switching") return { text: "Putting it on the canvas…", tone: "work" };
  if (s.busy === "cancelling") return { text: "Stopping…", tone: "work" };
  if (s.waiting) return { text: "Your plan is ready · press Animate", tone: "ready" };
  return null;
}
const animatingPct = (s: AiStatus | null) => (s && typeof s.pct === "number" && (s.busy === "running" || s.busy === "finishing") ? Math.max(2, Math.min(100, s.pct)) : null);

// ---- the one host the AI panel lives in, moved between the phone sheet's tab and the command
// (kept on window so a code reload in development never leaves the panel in an old, detached host)
const slotsOf = (): AiSlots => ((window as AiWindow).__diamondAiSlots ??= { tab: null, dock: null, current: "panel" });
export function aiPanelHost(): HTMLDivElement | null {
  if (typeof window === "undefined") return null;
  const w = window as AiWindow;
  if (!w.__diamondAiHost) { w.__diamondAiHost = document.createElement("div"); w.__diamondAiHost.className = "ai-dock-host"; }
  return w.__diamondAiHost;
}
function placeHost() {
  const h = aiPanelHost();
  if (!h) return;
  const slots = slotsOf();
  const target = slots.current !== "panel" && slots.dock ? slots.dock : slots.tab;
  if (target && h.parentElement !== target) target.appendChild(h);
}
export function registerAiSlot(kind: "tab" | "dock", el: HTMLElement | null) { slotsOf()[kind] = el; placeHost(); }

export function openAiAnimator() {
  window.dispatchEvent(new CustomEvent(DOCK_EVENT, { detail: { open: true } }));
  window.setTimeout(() => (aiPanelHost()?.querySelector("textarea") as HTMLTextAreaElement | null)?.focus(), 60);
}

const Spark = ({ size = 14 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" fill="currentColor" />
  </svg>
);
const useMac = () => { const [mac, setMac] = useState(true); useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)); }, []); return mac; };

// ---- the command field in the middle of the top bar: it also shows what the AI Animator is doing
export function AiTopBarSlot() {
  const mac = useMac();
  const status = useAiStatus();
  const [done, setDone] = useState(false);
  const wasMaking = useRef(false);
  useEffect(() => {   // "Done" for a few seconds once a new animation is on the canvas
    const making = isMaking(status);
    if (wasMaking.current && !making && !status?.busy) { setDone(true); const t = window.setTimeout(() => setDone(false), 5000); wasMaking.current = false; return () => window.clearTimeout(t); }
    wasMaking.current = making;
  }, [status]);
  const words = statusWords(status);
  const pct = animatingPct(status);
  return (
    <button type="button" className="ai-top-field" onClick={openAiAnimator} aria-label="Make an animation" data-workspace-theme-exempt=""
      data-state={words ? words.tone : done ? "done" : undefined}>
      <span className="ai-top-spark"><Spark size={13} /></span>
      {words
        ? <span className="ai-top-text"><span className="ai-top-dot" aria-hidden="true" />{words.text}</span>
        : done
          ? <span className="ai-top-text"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 12 12" style={{ flexShrink: 0 }}><path d="M2.5 6.2 5 8.6l4.6-5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>Done · it&apos;s on your canvas</span>
          : <span className="ai-top-text ai-top-placeholder">Make an animation of anything…</span>}
      <kbd>{mac ? "⌘" : "Ctrl"} K</kbd>
      {pct !== null && <span className="ai-field-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
    </button>
  );
}

// ---- the command itself: big and centred over the editor
export function AiAnimatorDock({ layout }: { layout: AiLayout }) {
  useEffect(() => { slotsOf().current = layout; placeHost(); }, [layout]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const status = useAiStatus();
  const pressedAnimate = useRef(false);
  const slotRef = useCallback((el: HTMLDivElement | null) => registerAiSlot("dock", el), []);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (layout !== "spot") setOpen(false); }, [layout]);
  useEffect(() => {
    const onDock = (e: Event) => setOpen(Boolean((e as CustomEvent).detail?.open));
    window.addEventListener(DOCK_EVENT, onDock);
    return () => window.removeEventListener(DOCK_EVENT, onDock);
  }, []);
  // Cmd/Ctrl+K opens it from anywhere in the editor; Escape closes it (the big picture closes first)
  useEffect(() => {
    if (layout !== "spot") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) setOpen(false); else openAiAnimator(); }
      else if (e.key === "Escape" && open && !document.querySelector(".v1-gate-big")) { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, open]);
  // the command is given: once he pressed Animate and the animation is really being made, the editor comes back and the top bar
  // shows the work until it is on the canvas (an error or a question keeps it open, because nothing started)
  useEffect(() => {
    if (open && pressedAnimate.current && (status?.busy === "running" || status?.busy === "finishing")) { pressedAnimate.current = false; setOpen(false); }
  }, [open, status]);
  useEffect(() => { if (!open) pressedAnimate.current = false; }, [open]);
  // closing gives the keyboard back to where it was before (the canvas, a tool)
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => { if (previous && document.contains(previous) && !aiPanelHost()?.contains(previous)) previous.focus?.(); };
  }, [open]);

  const words = statusWords(status);
  const pct = animatingPct(status);
  const working = Boolean(status?.busy);
  if (!mounted || layout !== "spot") return <style>{aiDockStyles}</style>;
  return (
    <>
      <style>{aiDockStyles}</style>
      {createPortal(
        <div className={workspaceThemeStyles.workspace} style={{ display: "contents" }}>
          <div className="ai-spot-scrim" data-open={open ? "true" : undefined} onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            <section className="ai-spot" role="dialog" aria-modal="true" aria-label="Make an animation" data-working={working ? "true" : undefined}
              onClickCapture={(e) => { const b = (e.target as HTMLElement).closest("button"); if (b && /^\s*Animate\b/.test(b.textContent ?? "")) pressedAnimate.current = true; }}>
              {/* (Nov 23, Arthur: "I don't want it to sound like AI Animator anymore"; the X = the app's one close X) */}
              <header className="ai-spot-head" data-workspace-theme-exempt="">
                <span className="ai-spot-logo" aria-hidden="true"><DiamondLogo size={18} /></span>
                <span className="ai-spot-status" data-tone={words ? words.tone : "idle"}><span className="ai-top-dot" aria-hidden="true" />{words ? words.text.toLowerCase() : "ready"}</span>
                <CloseButton label="Close" onClick={() => setOpen(false)} className="ai-spot-close" />
              </header>
              <div className="ai-spot-line" data-mode={pct !== null ? "progress" : working ? "work" : undefined} aria-hidden="true">{pct !== null && <span style={{ width: `${pct}%` }} />}</div>
              <div ref={slotRef} className="ai-dock-slot" />
              <footer className="ai-spot-hints" aria-hidden="true">
                <span><kbd>↵</kbd> send</span><span><kbd>⇧ ↵</kbd> new line</span><span><kbd>esc</kbd> close</span>
                <span className="ai-spot-hints-end">anything except backgrounds and effects · each animation gets its own layer</span>
              </footer>
            </section>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const aiDockStyles = `
.ai-dock-host { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.ai-dock-host > .workspace-ai-panel-shell { flex: 1 1 0 !important; border-top: 0 !important; }
.ai-dock-slot { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }

/* ---- the field in the top bar: an input look, gray and instant like every field in the app */
.ai-top-field { --ai-w: clamp(300px, calc(100vw - 920px), 540px); position: relative; display: inline-flex; align-items: center; gap: 9px; width: var(--ai-w); height: 34px;
  padding: 0 6px 0 11px; border-radius: 10px; overflow: hidden; border: 1px solid var(--da-border, #2c2c32); background: var(--da-page, #111113);
  color: var(--da-muted, #a3a3ab); font: inherit; font-size: 13px; cursor: pointer; text-align: left; transition: none; }
.ai-top-field:hover { border-color: var(--da-hover, #3a3a41); background: #16161a; color: var(--da-text-2, #d2d2d7); }
.ai-top-field:hover .ai-top-spark { color: #fff; }
.ai-top-field:focus-visible { outline: 2px solid var(--da-focus, #4d94ff); outline-offset: 1px; }
.ai-top-spark { display: inline-flex; color: var(--da-text-2, #d2d2d7); }
.ai-top-text { display: inline-flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--da-text-2, #d2d2d7); }
.ai-top-placeholder { color: inherit; }
.ai-top-field[data-state="done"] .ai-top-text { color: #fff; }
.ai-top-field kbd, .ai-spot-hints kbd { font: inherit; font-size: 11px; line-height: 16px; color: var(--da-muted, #a3a3ab); border: 1px solid var(--da-border, #2c2c32); border-radius: 6px; padding: 1px 6px; background: var(--da-panel, #1a1a1e); }
.ai-top-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--da-text-2, #d2d2d7); flex-shrink: 0; animation: ai-pulse 1.4s ease-in-out infinite; }
[data-state="ready"] .ai-top-dot, [data-tone="ready"] .ai-top-dot { background: var(--da-accent, #0066ff); animation: none; }
.ai-field-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--da-line, #2c2c32); pointer-events: none; }
.ai-field-progress > span, .ai-spot-line > span { display: block; height: 100%; background: var(--da-accent, #0066ff); transition: width .4s ease; }
@keyframes ai-pulse { 50% { opacity: .3; } }

/* ---- the command: centred over a dimmed editor */
.ai-spot-scrim { position: fixed; inset: 0; z-index: 1200; display: flex; justify-content: center; align-items: flex-start; padding: 7vh 16px 4vh;
  background: rgba(6, 7, 9, .72); visibility: hidden; opacity: 0; transition: opacity .14s ease, visibility 0s linear .14s; }
.ai-spot-scrim[data-open] { visibility: visible; opacity: 1; transition: opacity .14s ease; }
.ai-spot { width: min(820px, 100%); height: min(800px, 86vh); display: flex; flex-direction: column; color: var(--da-text, #f5f5f6);
  border-radius: 16px; border: 1px solid var(--da-line, #2c2c32); background: var(--da-panel, #1a1a1e); box-shadow: 0 40px 110px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.03) inset;
  transform: translateY(8px) scale(.985); transition: transform .16s cubic-bezier(.2,.8,.2,1); }
.ai-spot-scrim[data-open] .ai-spot { transform: none; }

.ai-spot-head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 18px; min-width: 0; flex-shrink: 0; }
.ai-spot-logo { display: inline-flex; color: #fff; }
.ai-spot-status { display: inline-flex; align-items: center; gap: 8px; height: 26px; padding: 0 10px; border-radius: 8px; background: var(--da-page, #111113); border: 1px solid var(--da-border, #2c2c32);
  font-size: 12px; font-weight: 500; color: var(--da-text-2, #d2d2d7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ai-spot-head .ai-spot-close { margin-left: auto !important; }

/* the line under the head: still when idle, a moving sweep while he thinks, the blue bar while he animates */
.ai-spot-line { position: relative; height: 1px; flex-shrink: 0; background: var(--da-line, #2c2c32); overflow: hidden; }
.ai-spot-line[data-mode] { height: 2px; }
.ai-spot-line[data-mode="work"]::after { content: ""; position: absolute; inset: 0; width: 34%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); animation: ai-sweep 1.3s ease-in-out infinite; }
@keyframes ai-sweep { from { transform: translateX(-100%); } to { transform: translateX(300%); } }

/* the AI panel inside: the chat in the middle, the message box at the bottom */
.ai-spot .workspace-ai-panel-shell { background: transparent !important; position: static !important; height: auto !important; min-height: 0 !important; border: 0 !important;
  box-shadow: none !important; border-radius: 0 !important; flex: 1 1 0 !important; }
.ai-spot .workspace-ai-panel-shell > style + div { display: none !important; }
.ai-spot .workspace-ai-panel-shell > * { background: transparent !important; }
.ai-spot .drawing-ai-thread-head { display: none !important; }
.ai-spot .workspace-ai-messages-scroll { padding: 20px 28px 12px !important; gap: 12px !important; }
.ai-spot .workspace-ai-composer-slot { padding: 10px 20px 18px !important; }
.ai-spot .workspace-ai-composer-slot > :not(form) { margin-bottom: 10px; }
.ai-spot form[aria-label="AI Animator message composer"] { border-radius: 14px !important; }
.ai-spot form[aria-label="AI Animator message composer"] textarea { font-size: 15px !important; line-height: 22px !important; min-height: 50px !important; }

/* a new conversation: one clear question and command ideas */
.ai-spot .drawing-ai-empty { margin: auto 0; padding: 28px 0 8px !important; gap: 12px !important; }
.ai-spot .drawing-ai-empty > strong { font-size: 24px !important; font-weight: 650 !important; letter-spacing: -.02em; color: #fff !important; }
.ai-spot .drawing-ai-empty-text { max-width: 460px; font-size: 14px !important; line-height: 1.5 !important; }
.ai-spot .drawing-ai-examples { gap: 8px !important; margin-top: 6px; }
.ai-spot .drawing-ai-examples button { display: inline-flex !important; align-items: center; gap: 7px; height: 32px !important; padding: 0 12px !important; border-radius: 9px !important;
  border: 1px solid var(--da-border, #2c2c32) !important; background: var(--da-page, #111113) !important; color: var(--da-text-2, #d2d2d7) !important; font-size: 13px !important; transition: none !important; }
.ai-spot .drawing-ai-examples button::before { content: ""; width: 12px; height: 12px; flex: 0 0 12px; background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z'/%3E%3C/svg%3E") center / contain no-repeat; }
.ai-spot .drawing-ai-examples button:hover:enabled { background: var(--da-hover, #3a3a41) !important; border-color: var(--da-hover, #3a3a41) !important; color: #fff !important; }
.ai-spot .drawing-ai-cost { margin-top: 4px; }

/* ---- the command terminal feel (Arthur: "like a terminal: simple, professional, powerful" - not another chat) */
.ai-spot { --ai-mono: var(--font-geist-mono, ui-monospace, "SF Mono", Menlo, monospace); background: #141417; }
.ai-spot-head { border-bottom: 0; }
.ai-spot-status { font-family: var(--ai-mono); font-size: 12px; letter-spacing: 0; background: transparent; border: 0; padding: 0 4px; height: auto; color: var(--da-muted, #a3a3ab); }
.ai-spot-status[data-tone="work"] { color: var(--da-text-2, #d2d2d7); }
.ai-spot-status[data-tone="ready"] { color: #fff; }
.ai-spot-status[data-tone="idle"] .ai-top-dot { background: #3ccf7a; animation: none; }
.ai-spot .workspace-ai-messages-scroll { font-size: 14px; }
/* his commands: a prompt line, not a chat bubble */
.ai-spot .v1-user { align-self: stretch !important; max-width: none !important; padding: 2px 0 !important; border-radius: 0 !important; background: transparent !important;
  font-family: var(--ai-mono); font-size: 13.5px !important; line-height: 1.55 !important; color: #fff !important; }
.ai-spot .v1-user::before { content: "› "; color: var(--da-muted, #a3a3ab); font-weight: 600; }
.ai-spot .v1-copy { display: none !important; }
/* the input: one prompt line at the bottom */
.ai-spot .workspace-ai-composer-slot { padding: 0 !important; border-top: 1px solid var(--da-line, #2c2c32); background: #111113 !important; }
.ai-spot .workspace-ai-composer-slot > :not(form) { margin: 12px 20px 0; }
.ai-spot form[aria-label="AI Animator message composer"] { display: flex !important; flex-direction: row !important; align-items: flex-start !important; gap: 10px !important;
  border: 0 !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; padding: 14px 14px 12px 20px !important; min-height: 0 !important; }
.ai-spot form[aria-label="AI Animator message composer"]::before { content: "›"; font-family: var(--ai-mono); font-size: 18px; line-height: 24px; font-weight: 600; color: #fff; flex: 0 0 auto; }
.ai-spot form[aria-label="AI Animator message composer"] textarea { flex: 1 1 0 !important; width: auto !important; min-width: 0; font-family: var(--ai-mono) !important; font-size: 14px !important; line-height: 24px !important;
  min-height: 48px !important; max-height: 168px; padding: 0 !important; caret-color: #fff; border: 0 !important; outline: none !important; box-shadow: none !important; background: transparent !important; }
.ai-spot form[aria-label="AI Animator message composer"] textarea::placeholder { color: #6e6e76; }
.ai-spot form[aria-label="AI Animator message composer"]:not(:focus-within)::before { color: var(--da-muted, #a3a3ab); }
.ai-spot form[aria-label="AI Animator message composer"] > [class*="tools"] { flex: 0 0 auto !important; margin: 0 !important; padding: 0 !important; align-self: flex-end; gap: 6px !important; }
.ai-spot [class*="effortPopover"] { left: auto !important; right: -6px !important; }
.ai-spot-hints { display: flex; align-items: center; gap: 16px; padding: 8px 20px 10px; border-top: 1px solid var(--da-line, #2c2c32); background: #111113; border-radius: 0 0 16px 16px;
  font-family: var(--ai-mono); font-size: 11px; color: var(--da-muted, #a3a3ab); white-space: nowrap; overflow: hidden; flex-shrink: 0; }
.ai-spot-hints > span { display: inline-flex; align-items: center; gap: 6px; }
.ai-spot-hints kbd { font-family: var(--ai-mono); font-size: 10.5px; padding: 0 5px; }
.ai-spot-hints-end { margin-left: auto; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
/* a new session: the command line's welcome */
.ai-spot .drawing-ai-empty { align-items: flex-start !important; text-align: left !important; max-width: 560px !important; width: 100%; }
.ai-spot .drawing-ai-empty .drawing-ai-logo { display: none !important; }
.ai-spot .drawing-ai-empty { justify-items: start !important; justify-content: start !important; }
.ai-spot .drawing-ai-empty > * { text-align: left !important; align-self: flex-start !important; justify-self: start !important; margin-left: 0 !important; }
.ai-spot .drawing-ai-empty-text { color: var(--da-muted, #a3a3ab) !important; }
.ai-spot .drawing-ai-examples { justify-content: flex-start !important; flex-direction: row !important; flex-wrap: wrap !important; }
.ai-spot .drawing-ai-examples button { font-family: var(--ai-mono) !important; font-size: 12.5px !important; }
.ai-spot .drawing-ai-examples button::before { content: "›" !important; width: auto !important; height: auto !important; flex: 0 0 auto !important; background: none !important; -webkit-mask: none !important; mask: none !important; font-weight: 600; color: var(--da-muted, #a3a3ab); }
.ai-spot .drawing-ai-examples button:hover:enabled::before { color: #fff; }
.ai-spot .drawing-ai-cost { font-family: var(--ai-mono); font-size: 11.5px !important; color: var(--da-muted, #a3a3ab) !important; }

/* (Nov 23) talking: the waves get their own full line under what is typed (they were squeezed to one dot), white like the prompt */
.ai-spot form[aria-label="AI Animator message composer"] { flex-wrap: wrap !important; }
.ai-spot form[aria-label="AI Animator message composer"] > [class*="dictationPanel"] { flex: 1 0 100% !important; margin: 2px 0 0 !important; min-height: 44px !important; gap: 14px !important; }
.ai-spot [class*="dictationPanel"] [class*="waveform"] { height: 38px !important; }
.ai-spot [class*="dictationPanel"] [class*="waveform"] span { background: #fff !important; height: calc(4px + var(--wave, 0) * 34px) !important; }
/* (Nov 23) his words and the answers read like one session: the same type, no bubbles */
.ai-spot .v1-reply { font-family: var(--ai-mono); font-size: 13px !important; line-height: 1.65 !important; color: #c8c8ce !important; max-width: 100% !important; }
.ai-spot .v1-reply strong, .ai-spot .v1-reply h4 { color: #fff !important; }
.ai-spot .v1-note, .ai-spot .v1-error, .ai-spot .v1-activity { font-family: var(--ai-mono); font-size: 12px !important; }
.ai-spot [class*="effortButton"] { font-family: var(--ai-mono); }

@media (prefers-reduced-motion: reduce) { .ai-spot-scrim, .ai-spot, .ai-top-dot, .ai-spot-line::after { transition: none !important; animation: none !important; } }
@media (max-width: 640px) { .ai-spot-scrim { display: none !important; } }
`;
