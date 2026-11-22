"use client";
// (Nov 22, Arthur: "the AI Animator is the whole point of Diamond Animator ... it needs to feel built into the workspace, not a tiny
// add-on"; his pick so far = the command bar, "make it feel more integrated".) ONLY WHERE THE AI ANIMATOR SITS CHANGES: the same AI
// panel (DrawingAiPanel / V1AnimatorChat: its chat, card, picture, Animate, progress) is moved with a React portal into ONE host
// element that is moved in the page, so it is never made again and nothing it does changes. Phones keep the bottom sheet.
//   panel = as before: the right panel's "AI Animator" tab
//   bar   = 2 "Director bar": a message bar docked under the canvas, the chat opens above it
//   top   = 3 "Command bar": you type right in the top bar (Cmd/Ctrl+K); the chat and card drop down from it; the bar shows
//           what the AI Animator is doing (thinking, animating 42%, plan ready)
//   spot  = 4 "Spotlight": the top bar's field opens a big centred AI Animator over a dimmed editor, the card and picture large
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import workspaceThemeStyles from "../workspaceTheme.module.css";

export type AiLayout = "panel" | "bar" | "top" | "spot";
const LAYOUTS: AiLayout[] = ["panel", "bar", "top", "spot"];
const KEY = "diamond.aiLayout.v2";
const LAYOUT_EVENT = "diamond-ai-layout";
const DOCK_EVENT = "diamond-ai-dock";
const STATUS_EVENT = "diamond-ai-status";
const isLayout = (v: unknown): v is AiLayout => typeof v === "string" && (LAYOUTS as string[]).includes(v);

function readLayout(): AiLayout {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("aiLayout");
    if (isLayout(fromUrl)) return fromUrl;
    const saved = window.localStorage.getItem(KEY);
    if (isLayout(saved)) return saved;
  } catch { /* blocked storage: the default */ }
  return "top";
}
export function chooseAiLayout(layout: AiLayout) {
  try { window.localStorage.setItem(KEY, layout); } catch { /* this tab only */ }
  window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: layout }));
}

// the layout in use: phones (<= 640 px) always keep the bottom sheet ("panel")
export function useAiLayout(): { layout: AiLayout; chosen: AiLayout; phone: boolean } {
  const [chosen, setChosen] = useState<AiLayout>("panel");
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    setChosen(readLayout());
    const media = window.matchMedia("(max-width: 640px)");
    setPhone(media.matches);
    const onLayout = (e: Event) => setChosen(isLayout((e as CustomEvent).detail) ? (e as CustomEvent).detail : readLayout());
    const onMedia = () => setPhone(media.matches);
    window.addEventListener(LAYOUT_EVENT, onLayout);
    media.addEventListener("change", onMedia);
    return () => { window.removeEventListener(LAYOUT_EVENT, onLayout); media.removeEventListener("change", onMedia); };
  }, []);
  return { layout: phone ? "panel" : chosen, chosen, phone };
}

// ---- what the AI Animator is doing (sent by V1AnimatorChat; a look only)
export type AiStatus = { busy: string | null; phase: string | null; pct: number | null; part: [number, number] | null; waiting: boolean };
type AiSlots = { tab: HTMLElement | null; dock: HTMLElement | null; current: AiLayout };
type StatusWindow = Window & { __diamondAiStatus?: AiStatus; __diamondAiHost?: HTMLDivElement; __diamondAiSlots?: AiSlots };
export function sendAiStatus(status: AiStatus) {
  (window as StatusWindow).__diamondAiStatus = status;
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: status }));
}
function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    setStatus((window as StatusWindow).__diamondAiStatus ?? null);
    const on = (e: Event) => setStatus((e as CustomEvent).detail as AiStatus);
    window.addEventListener(STATUS_EVENT, on);
    return () => window.removeEventListener(STATUS_EVENT, on);
  }, []);
  return status;
}
function statusWords(s: AiStatus | null): { text: string; tone: "work" | "ready" } | null {
  if (!s) return null;
  if (s.busy === "thinking") return { text: s.phase === "searching" ? "Searching the web…" : s.phase === "finalizing" ? "Finalizing the plan…" : "Thinking…", tone: "work" };
  if (s.busy === "running" || s.busy === "finishing") {
    const part = s.part && s.part[1] > 1 ? ` · part ${s.part[0]} of ${s.part[1]}` : "";
    return { text: `Animating${typeof s.pct === "number" ? ` · ${Math.round(s.pct)}%` : "…"}${part}`, tone: "work" };
  }
  if (s.busy === "placing" || s.busy === "switching") return { text: "Putting it on the canvas…", tone: "work" };
  if (s.busy === "cancelling") return { text: "Stopping…", tone: "work" };
  if (s.waiting) return { text: "Your plan is ready · open it to Animate", tone: "ready" };
  return null;
}
const animatingPct = (s: AiStatus | null) => (s && typeof s.pct === "number" && (s.busy === "running" || s.busy === "finishing") ? Math.max(2, Math.min(100, s.pct)) : null);

// ---- the one host the AI panel lives in, moved between the right panel tab and the dock
// (kept on window so a code reload in development never leaves the panel in an old, detached host)
const slotsOf = (): AiSlots => ((window as StatusWindow).__diamondAiSlots ??= { tab: null, dock: null, current: "panel" });
export function aiPanelHost(): HTMLDivElement | null {
  if (typeof window === "undefined") return null;
  const w = window as StatusWindow;
  if (!w.__diamondAiHost) { w.__diamondAiHost = document.createElement("div"); w.__diamondAiHost.className = "ai-dock-host"; }
  return w.__diamondAiHost;
}
function placeHost() {
  const h = aiPanelHost();
  if (!h) return;
  const slots = slotsOf();
  const target = slots.current !== "panel" && slots.dock ? slots.dock : slots.tab;
  if (h && target && h.parentElement !== target) target.appendChild(h);
}
export function registerAiSlot(kind: "tab" | "dock", el: HTMLElement | null) { slotsOf()[kind] = el; placeHost(); }

const focusComposer = () => window.setTimeout(() => (aiPanelHost()?.querySelector("textarea") as HTMLTextAreaElement | null)?.focus(), 40);
export function openAiAnimator() {
  window.dispatchEvent(new CustomEvent(DOCK_EVENT, { detail: { open: true } }));
  focusComposer();
}

const Spark = ({ size = 14 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" fill="currentColor" />
  </svg>
);
const useMac = () => { const [mac, setMac] = useState(true); useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)); }, []); return mac; };

function StatusChip({ status, onOpen }: { status: AiStatus | null; onOpen: () => void }) {
  const words = statusWords(status);
  const pct = animatingPct(status);
  if (!words) return null;
  return (
    <button type="button" className="ai-status" data-tone={words.tone} onClick={onOpen} data-workspace-theme-exempt="">
      <span className="ai-status-dot" aria-hidden="true" /><span>{words.text}</span>
      {pct !== null && <span className="ai-status-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
    </button>
  );
}

// ---- the top bar's middle: 3 = room for the real message box (it sits over this spot); 4 = the field that opens Spotlight
export function AiTopBarSlot({ layout }: { layout: AiLayout }) {
  const mac = useMac();
  const status = useAiStatus();
  if (layout === "top") return <div className="ai-top-room" aria-hidden="true" />;
  if (layout !== "spot") return null;
  const words = statusWords(status);
  const pct = animatingPct(status);
  return (
    <button type="button" className="ai-top-field" onClick={openAiAnimator} aria-label="Ask the AI Animator" data-workspace-theme-exempt="">
      <span className="ai-top-spark"><Spark size={13} /></span>
      <span className="ai-top-text" data-tone={words?.tone}>{words ? words.text : "Tell the AI Animator what happens next…"}</span>
      <kbd>{mac ? "⌘" : "Ctrl"} K</kbd>
      {pct !== null && <span className="ai-field-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
    </button>
  );
}

// ---- the review switch (only while Arthur picks; removed after)
export function AiLayoutSwitcher({ chosen }: { chosen: AiLayout }) {
  const names: [AiLayout, string][] = [["panel", "Before"], ["bar", "2 · Director bar"], ["top", "3 · Command bar"], ["spot", "4 · Spotlight"]];
  return (
    <div className="ai-layout-switch" role="group" aria-label="Pick an AI Animator layout" data-workspace-theme-exempt="">
      <span>Layout</span>
      {names.map(([id, name]) => <button key={id} type="button" aria-pressed={chosen === id} onClick={() => chooseAiLayout(id)}>{name}</button>)}
    </div>
  );
}

// ---- the dock: the frame the AI panel is moved into for layouts 2-4
export function AiAnimatorDock({ layout, chosen, rightInset }: { layout: AiLayout; chosen: AiLayout; rightInset: number }) {
  useEffect(() => { slotsOf().current = layout; placeHost(); }, [layout]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const status = useAiStatus();
  const mac = useMac();
  const slotRef = useCallback((el: HTMLDivElement | null) => registerAiSlot("dock", el), []);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(false); }, [layout]);
  useEffect(() => {
    const onDock = (e: Event) => setOpen(Boolean((e as CustomEvent).detail?.open));
    window.addEventListener(DOCK_EVENT, onDock);
    return () => window.removeEventListener(DOCK_EVENT, onDock);
  }, []);
  // Cmd/Ctrl+K opens the AI Animator from anywhere in the editor; Escape closes it (not while the big picture is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (layout !== "panel" && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openAiAnimator(); }
      if (e.key === "Escape" && open && !document.querySelector(".v1-gate-big")) { setOpen(false); (document.activeElement as HTMLElement | null)?.blur?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, open]);
  // 3: a click anywhere else in the editor folds it back into the top bar (the big picture view is not "elsewhere")
  useEffect(() => {
    if (!open || layout !== "top") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || frameRef.current?.contains(t) || t.closest(".v1-gate-big, [role='dialog'], .ai-layout-switch")) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open, layout]);

  const footer = (
    <div className="ai-dock-foot">
      <span className="ai-dock-brand"><span className="ai-dock-logo" aria-hidden="true"><DiamondLogo size={14} /></span>AI Animator</span>
      <span className="ai-dock-hint">Animate anything · fine-tune every frame after</span>
      <button type="button" className="ai-dock-close" onClick={() => setOpen(false)} data-workspace-theme-exempt=""><kbd>Esc</kbd> Close</button>
    </div>
  );
  const middle = { left: `calc(64px + (100% - 64px - ${rightInset}px) / 2)`, transform: "translateX(-50%)", "--ai-right": `${rightInset}px` } as CSSProperties;
  const Chevron = ({ up }: { up: boolean }) => <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d={up ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5"} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  const toBody = (node: ReactNode) => (mounted ? createPortal(<div className={workspaceThemeStyles.workspace} style={{ display: "contents" }}>{node}</div>, document.body) : null);

  return (
    <>
      <style>{aiDockStyles}</style>
      <AiLayoutSwitcher chosen={chosen} />
      {layout === "bar" && (
        <div className="ai-dock-frame ai-dock-bar" data-expanded={open ? "true" : undefined} style={middle}
          onSubmitCapture={() => setOpen(true)} onClickCapture={(e) => { if ((e.target as HTMLElement).closest(".drawing-ai-examples")) setOpen(true); }}>
          <div className="ai-dock-head">
            <span className="ai-dock-logo" aria-hidden="true"><DiamondLogo size={16} /></span>
            <span className="ai-dock-title">AI Animator</span>
            <StatusChip status={status} onOpen={() => setOpen(true)} />
            <button type="button" className="ai-dock-icon" aria-label={open ? "Hide the chat" : "Show the chat"} onClick={() => setOpen((v) => !v)} data-workspace-theme-exempt=""><Chevron up={!open} /></button>
          </div>
          <div ref={slotRef} className="ai-dock-slot" />
        </div>
      )}
      {layout === "top" && toBody(
        <div ref={frameRef} className="ai-cmd" data-open={open ? "true" : undefined}
          onFocusCapture={(e) => { if ((e.target as HTMLElement).tagName === "TEXTAREA") setOpen(true); }}
          onSubmitCapture={() => setOpen(true)}>
          <div ref={slotRef} className="ai-dock-slot" />
          {!open && (statusWords(status)
            ? <div className="ai-cmd-status"><StatusChip status={status} onOpen={openAiAnimator} /></div>
            : <div className="ai-cmd-overlay"><kbd className="ai-cmd-kbd">{mac ? "⌘" : "Ctrl"} K</kbd></div>)}
          {!open && animatingPct(status) !== null && <span className="ai-field-progress" aria-hidden="true"><span style={{ width: `${animatingPct(status)}%` }} /></span>}
          {open && footer}
        </div>,
      )}
      {layout === "spot" && toBody(
        <div className="ai-spot-scrim" data-open={open ? "true" : undefined} onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="ai-spot" role="dialog" aria-label="AI Animator">
            <div ref={slotRef} className="ai-dock-slot" />
            {footer}
          </div>
        </div>,
      )}
    </>
  );
}

const aiDockStyles = `
.ai-dock-host { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.ai-dock-host > .workspace-ai-panel-shell { flex: 1 1 0 !important; border-top: 0 !important; }
.ai-dock-slot { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.ai-dock-frame, .ai-cmd, .ai-spot { color: var(--da-text, #f5f5f6); }
.ai-dock-frame .workspace-ai-panel-shell, .ai-cmd .workspace-ai-panel-shell, .ai-spot .workspace-ai-panel-shell { background: transparent !important; position: static !important; height: auto !important; min-height: 0 !important; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
.ai-dock-frame .workspace-ai-panel-shell > style + div, .ai-cmd .workspace-ai-panel-shell > style + div, .ai-spot .workspace-ai-panel-shell > style + div { display: none !important; }
.ai-dock-frame .workspace-ai-panel-shell > *, .ai-cmd .workspace-ai-panel-shell > *, .ai-spot .workspace-ai-panel-shell > * { background: transparent !important; }
.ai-dock-frame .drawing-ai-thread-head, .ai-cmd .drawing-ai-thread-head, .ai-spot .drawing-ai-thread-head { display: none !important; }
.ai-dock-logo { display: inline-flex; color: #fff; }
.ai-dock-title { font-size: 13px; font-weight: 600; white-space: nowrap; }
.ai-dock-icon { margin-left: auto; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 0; background: transparent; color: var(--da-muted, #a3a3ab); cursor: pointer; flex-shrink: 0; transition: none; }
.ai-dock-icon:hover { background: var(--da-hover, #3a3a41); color: #fff; }

/* the status chip: gray, instant hover; blue only for the bar of the animation being made and a plan that waits for Animate */
.ai-status { display: inline-flex; align-items: center; gap: 7px; min-width: 0; height: 24px; padding: 0 9px; border-radius: 7px; border: 0; background: transparent; color: var(--da-text-2, #d2d2d7); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: none; }
.ai-status:hover { background: var(--da-hover, #3a3a41); color: #fff; }
.ai-status > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; }
.ai-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--da-muted, #a3a3ab); flex-shrink: 0; animation: ai-pulse 1.4s ease-in-out infinite; }
.ai-status[data-tone="ready"] .ai-status-dot { background: var(--da-accent, #0066ff); animation: none; }
.ai-status-bar { width: 56px; height: 3px; border-radius: 2px; background: var(--da-line, #2c2c32); overflow: hidden; flex-shrink: 0; }
.ai-status-bar > span, .ai-field-progress > span { display: block; height: 100%; background: var(--da-accent, #0066ff); }
.ai-field-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--da-line, #2c2c32); pointer-events: none; }
@keyframes ai-pulse { 50% { opacity: .35; } }
.ai-cmd-kbd, .ai-top-field kbd, .ai-dock-close kbd { font: inherit; font-size: 11px; color: var(--da-muted, #a3a3ab); border: 1px solid var(--da-border, #2c2c32); border-radius: 6px; padding: 1px 6px; background: var(--da-panel, #1a1a1e); line-height: 16px; }

/* the message box in one line (3, and 2 when folded) */
.ai-cmd form[aria-label="AI Animator message composer"], .ai-dock-bar:not([data-expanded]) form[aria-label="AI Animator message composer"] {
  display: flex !important; flex-direction: row !important; align-items: center !important; gap: 6px !important; min-height: 0 !important; padding: 0 4px 0 12px !important; }
.ai-cmd form[aria-label="AI Animator message composer"] textarea, .ai-dock-bar:not([data-expanded]) form[aria-label="AI Animator message composer"] textarea {
  flex: 1 1 auto !important; min-width: 0; height: 34px !important; min-height: 34px !important; max-height: 34px !important; padding: 8px 0 !important; resize: none !important; line-height: 18px !important; overflow: hidden !important; white-space: nowrap; font-size: 13px !important; }
.ai-cmd form[aria-label="AI Animator message composer"] > [class*="tools"], .ai-dock-bar:not([data-expanded]) form[aria-label="AI Animator message composer"] > [class*="tools"] { flex: 0 0 auto !important; margin: 0 !important; padding: 0 !important; gap: 4px !important; }
.ai-cmd form[aria-label="AI Animator message composer"] [class*="iconButton"], .ai-dock-bar:not([data-expanded]) form[aria-label="AI Animator message composer"] [class*="iconButton"] { width: 28px !important; height: 28px !important; min-width: 28px !important; }

/* 3 - Command bar: the message box IS the middle of the top bar; the chat and card drop down from it */
.ai-top-room, .ai-cmd, .ai-top-field { --ai-w: clamp(300px, calc(100vw - 920px), 560px); }
.ai-top-room { width: var(--ai-w); height: 36px; }
.ai-cmd { position: fixed; z-index: 450; top: 6px; left: 50%; width: var(--ai-w); margin-left: calc(var(--ai-w) / -2); height: 36px;
  display: flex; flex-direction: column; border-radius: 10px; border: 1px solid var(--da-border, #2c2c32); background: var(--da-page, #111113); overflow: hidden; }
.ai-cmd:hover:not([data-open]) { border-color: var(--da-hover, #3a3a41); }
.ai-cmd .workspace-ai-messages-scroll, .ai-cmd .workspace-ai-composer-slot > :not(form) { display: none !important; }
.ai-cmd .workspace-ai-composer-slot { padding: 0 !important; order: -1; display: flex !important; flex-direction: column; }
.ai-cmd .workspace-ai-composer-slot > form { order: -1; }
.ai-cmd form[aria-label="AI Animator message composer"]::before { content: ""; width: 14px; height: 14px; flex: 0 0 14px; margin-right: 2px; background: currentColor; color: var(--da-muted, #a3a3ab);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z'/%3E%3C/svg%3E") center / contain no-repeat; }
.ai-cmd:focus-within form[aria-label="AI Animator message composer"]::before, .ai-cmd:hover form[aria-label="AI Animator message composer"]::before { color: var(--da-text-2, #d2d2d7); }
.ai-cmd form[aria-label="AI Animator message composer"] { border: 0 !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; height: 34px; }
.ai-cmd-overlay { position: absolute; top: 0; right: 108px; height: 34px; display: flex; align-items: center; pointer-events: none; }
.ai-cmd-status { position: absolute; top: 1px; bottom: 1px; left: 32px; right: 108px; display: flex; align-items: center; background: var(--da-page, #111113); }
.ai-cmd-status .ai-status { padding-left: 4px; max-width: 100%; }
.ai-cmd-kbd { pointer-events: none !important; }
.ai-cmd[data-open] { --ai-w: clamp(480px, calc(100vw - 920px), 560px); height: min(700px, calc(100vh - 96px)); background: var(--da-panel, #1a1a1e); border-color: var(--da-line, #2c2c32);
  border-radius: 12px; box-shadow: 0 28px 70px rgba(0,0,0,.6); }
.ai-cmd[data-open] .workspace-ai-messages-scroll { display: flex !important; border-top: 1px solid var(--da-line, #2c2c32); }
.ai-cmd[data-open] .workspace-ai-composer-slot > :not(form) { display: block !important; margin: 2px 10px 10px; }
.ai-cmd[data-open] form[aria-label="AI Animator message composer"] { height: 46px; }
.ai-cmd[data-open] form[aria-label="AI Animator message composer"] textarea { height: 46px !important; min-height: 46px !important; max-height: 46px !important; padding: 14px 0 !important; font-size: 14px !important; }

/* the footer of 3 and 4 */
.ai-dock-foot { display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 12px; border-top: 1px solid var(--da-line, #2c2c32); flex-shrink: 0; min-width: 0; }
.ai-dock-brand { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--da-text-2, #d2d2d7); white-space: nowrap; }
.ai-dock-hint { font-size: 12px; color: var(--da-muted, #a3a3ab); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 1 auto; }
.ai-dock-close { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; border-radius: 7px; border: 0; background: transparent; color: var(--da-muted, #a3a3ab); font: inherit; font-size: 12px; cursor: pointer; flex-shrink: 0; transition: none; }
.ai-dock-close:hover { background: var(--da-hover, #3a3a41); color: #fff; }

/* 2 - Director bar: docked under the canvas; the chat opens above the message box after sending */
.ai-dock-frame { position: absolute; z-index: 30; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background: var(--da-panel, #1a1a1e); border: 1px solid var(--da-line, #2c2c32); border-radius: 14px; box-shadow: 0 20px 56px rgba(0,0,0,.5); }
.ai-dock-head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 6px 12px; flex-shrink: 0; min-width: 0; }
.ai-dock-bar { bottom: 14px; width: min(720px, calc(100% - 64px - var(--ai-right, 0px) - 32px)); max-height: calc(100% - 28px); }
.ai-dock-bar:not([data-expanded]) .workspace-ai-messages-scroll { display: none !important; }
.ai-dock-bar:not([data-expanded]) .ai-dock-slot, .ai-dock-bar:not([data-expanded]) .ai-dock-host, .ai-dock-bar:not([data-expanded]) .workspace-ai-panel-shell { flex: 0 0 auto !important; }
.ai-dock-bar[data-expanded] { height: min(600px, calc(100% - 28px)); }
.ai-dock-bar[data-expanded] .ai-dock-head { border-bottom: 1px solid var(--da-line, #2c2c32); }
.ai-dock-bar .drawing-ai-empty .drawing-ai-logo, .ai-dock-bar .drawing-ai-empty > strong, .ai-dock-bar .drawing-ai-empty-text { display: none !important; }

/* 4 - Spotlight: a big centred AI Animator over a dimmed editor; the message box on top, the card and picture large */
.ai-top-field { position: relative; display: inline-flex; align-items: center; gap: 9px; width: var(--ai-w); height: 36px; padding: 0 6px 0 12px; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--da-border, #2c2c32); background: var(--da-page, #111113); color: var(--da-muted, #a3a3ab); font: inherit; font-size: 13px; cursor: text; text-align: left; transition: none; }
.ai-top-field:hover { border-color: var(--da-hover, #3a3a41); color: var(--da-text-2, #d2d2d7); }
.ai-top-field:focus-visible { outline: 2px solid var(--da-focus, #4d94ff); outline-offset: 1px; }
.ai-top-spark { display: inline-flex; color: var(--da-text-2, #d2d2d7); }
.ai-top-text { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-top-text[data-tone] { color: var(--da-text-2, #d2d2d7); }
.ai-spot-scrim { position: fixed; inset: 0; z-index: 1200; background: rgba(6,7,9,.55); display: flex; justify-content: center; align-items: flex-start; padding-top: 9vh; visibility: hidden; opacity: 0; transition: opacity .14s ease, visibility 0s linear .14s; }
.ai-spot-scrim[data-open] { visibility: visible; opacity: 1; transition: opacity .14s ease; }
.ai-spot { width: min(780px, 92vw); height: min(760px, 82vh); display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; border: 1px solid var(--da-line, #2c2c32); background: var(--da-panel, #1a1a1e); box-shadow: 0 40px 100px rgba(0,0,0,.65); }
.ai-spot .workspace-ai-composer-slot { order: -1; padding: 12px 12px 10px !important; border-bottom: 1px solid var(--da-line, #2c2c32); display: flex !important; flex-direction: column; }
.ai-spot .workspace-ai-composer-slot > form { order: -1; }
.ai-spot .workspace-ai-composer-slot > :not(form) { margin-top: 10px; }
.ai-spot .workspace-ai-messages-scroll { padding: 16px 18px !important; }

/* the review switch, bottom right (over the empty foot of the right panel) */
.ai-layout-switch { position: fixed; right: 16px; bottom: 78px; z-index: 31; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 11px;
  background: var(--da-page, #111113); border: 1px solid var(--da-line, #2c2c32); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.ai-layout-switch > span { font-size: 11px; font-weight: 600; color: var(--da-muted, #a3a3ab); padding: 0 8px 0 6px; text-transform: uppercase; letter-spacing: .06em; }
.ai-layout-switch button { height: 26px; padding: 0 10px; border-radius: 8px; border: 0; background: transparent; color: var(--da-text-2, #d2d2d7); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: none; }
.ai-layout-switch button:hover { background: var(--da-hover, #3a3a41); color: #fff; }
.ai-layout-switch button[aria-pressed="true"] { background: var(--da-selected-bg, #3a3a41); box-shadow: inset 0 0 0 1px var(--da-selected-border, #55555e); color: #fff; }
@media (prefers-reduced-motion: reduce) { .ai-spot-scrim, .ai-status-dot { transition: none !important; animation: none !important; } }
@media (max-width: 640px) { .ai-layout-switch, .ai-cmd { display: none !important; } }
`;
