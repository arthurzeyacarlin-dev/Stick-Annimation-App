"use client";
// (Nov 22, Arthur: "the AI Animator is the whole point of Diamond Animator ... it needs to feel built into the workspace, not a tiny
// add-on" - three layouts to pick from.) ONLY WHERE THE AI ANIMATOR SITS CHANGES: the same AI panel (DrawingAiPanel / V1AnimatorChat,
// its chat, card, picture, Animate, progress) is moved between places with a React portal into ONE host element that is moved in the
// page, so it is never made again and nothing it does changes. Phones keep the bottom sheet as before.
//   panel     = as before: the right panel's "AI Animator" tab
//   timeline  = 1 "Story timeline": a "+ Animate" button in the timeline; the AI card rises from the timeline over the canvas
//   bar       = 2 "Director bar": a message bar docked under the canvas, the chat opens above it
//   top       = 3 "Command bar": an "Ask the AI Animator" field in the top bar (Cmd/Ctrl+K); the AI card drops down from it
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";

export type AiLayout = "panel" | "timeline" | "bar" | "top";
const LAYOUTS: AiLayout[] = ["panel", "timeline", "bar", "top"];
const KEY = "diamond.aiLayout.v1";
const LAYOUT_EVENT = "diamond-ai-layout";
const DOCK_EVENT = "diamond-ai-dock";
const isLayout = (v: unknown): v is AiLayout => typeof v === "string" && (LAYOUTS as string[]).includes(v);

function readLayout(): AiLayout {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("aiLayout");
    if (isLayout(fromUrl)) return fromUrl;
    const saved = window.localStorage.getItem(KEY);
    if (isLayout(saved)) return saved;
  } catch { /* blocked storage: the default */ }
  return "panel";
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

// ---- the one host the AI panel lives in, moved between the right panel tab and the dock
// (kept on window so a code reload in development never leaves the panel in an old, detached host)
type HostWindow = Window & { __diamondAiHost?: HTMLDivElement };
const slots: { tab: HTMLElement | null; dock: HTMLElement | null } = { tab: null, dock: null };
let current: AiLayout = "panel";
export function aiPanelHost(): HTMLDivElement | null {
  if (typeof window === "undefined") return null;
  const w = window as HostWindow;
  if (!w.__diamondAiHost) { w.__diamondAiHost = document.createElement("div"); w.__diamondAiHost.className = "ai-dock-host"; }
  return w.__diamondAiHost;
}
function placeHost() {
  const h = aiPanelHost();
  const target = current !== "panel" && slots.dock ? slots.dock : slots.tab;
  if (h && target && h.parentElement !== target) target.appendChild(h);
}
export function registerAiSlot(kind: "tab" | "dock", el: HTMLElement | null) { slots[kind] = el; placeHost(); }
function useHostPlacement(layout: AiLayout) { useEffect(() => { current = layout; placeHost(); }, [layout]); }

export function openAiAnimator() {
  window.dispatchEvent(new CustomEvent(DOCK_EVENT, { detail: { open: true } }));
  // the message box of the moved panel gets the keyboard, so he can type at once
  window.setTimeout(() => (aiPanelHost()?.querySelector("textarea") as HTMLTextAreaElement | null)?.focus(), 60);
}

const Spark = ({ size = 14 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" fill="currentColor" />
  </svg>
);

// ---- 1: the button inside the timeline ("a plus button inside the timeline ... a card pops up saying the AI animator")
export function AiTimelineButton({ open }: { open: boolean }) {
  return (
    <button type="button" className="ai-tl-button" data-open={open ? "true" : undefined} onClick={() => (open ? window.dispatchEvent(new CustomEvent(DOCK_EVENT, { detail: { open: false } })) : openAiAnimator())}
      aria-label="AI Animator: animate anything" data-tooltip="AI Animator: tell him what happens next" data-tooltip-side="below">
      <span className="ai-tl-plus" aria-hidden="true">+</span><span>Animate with AI</span>
    </button>
  );
}

// ---- 3: the field in the top bar
export function AiTopBarField() {
  const [mac, setMac] = useState(true);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)); }, []);
  return (
    <button type="button" className="ai-top-field" onClick={openAiAnimator} aria-label="Ask the AI Animator">
      <span className="ai-top-spark"><Spark size={13} /></span>
      <span className="ai-top-text">Tell the AI Animator what happens next…</span>
      <kbd>{mac ? "⌘" : "Ctrl"} K</kbd>
    </button>
  );
}

// ---- the review switch (only while Arthur picks; removed after)
export function AiLayoutSwitcher({ chosen }: { chosen: AiLayout }) {
  const names: [AiLayout, string][] = [["panel", "Before"], ["timeline", "1 · Timeline"], ["bar", "2 · Director bar"], ["top", "3 · Command bar"]];
  return (
    <div className="ai-layout-switch" role="group" aria-label="Pick an AI Animator layout">
      <span>Layout</span>
      {names.map(([id, name]) => <button key={id} type="button" aria-pressed={chosen === id} onClick={() => chooseAiLayout(id)}>{name}</button>)}
    </div>
  );
}

// ---- the dock: the frame the AI panel is moved into for layouts 1-3
export function AiAnimatorDock({ layout, chosen, rightInset }: { layout: AiLayout; chosen: AiLayout; rightInset: number }) {
  useHostPlacement(layout);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const slotRef = useCallback((el: HTMLDivElement | null) => registerAiSlot("dock", el), []);
  useEffect(() => {
    const onDock = (e: Event) => { const want = Boolean((e as CustomEvent).detail?.open); setOpen(want); if (want) setExpanded(true); };
    window.addEventListener(DOCK_EVENT, onDock);
    return () => window.removeEventListener(DOCK_EVENT, onDock);
  }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent("diamond-ai-dock-state", { detail: { open } })); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (layout === "top" && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openAiAnimator(); }
      if (e.key === "Escape" && open && (layout === "timeline" || layout === "top")) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, open]);

  const middle = { left: `calc(64px + (100% - 64px - ${rightInset}px) / 2)`, transform: "translateX(-50%)", "--ai-right": `${rightInset}px` } as CSSProperties;
  const header = (closeLabel: string, onClose: () => void, icon: ReactNode) => (
    <div className="ai-dock-head">
      <span className="ai-dock-logo" aria-hidden="true"><DiamondLogo size={18} /></span>
      <span className="ai-dock-title">AI Animator</span>
      <span className="ai-dock-sub">Animate anything. Fine-tune every frame after.</span>
      <button type="button" className="ai-dock-close" aria-label={closeLabel} onClick={onClose}>{icon}</button>
    </div>
  );
  const X = <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  const Chevron = ({ up }: { up: boolean }) => <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d={up ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5"} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;

  return (
    <>
      <style>{aiDockStyles}</style>
      <AiLayoutSwitcher chosen={chosen} />
      {layout === "timeline" && (
        <div className="ai-dock-frame ai-dock-timeline" data-open={open ? "true" : undefined} aria-hidden={!open}>
          {header("Close the AI Animator", () => setOpen(false), X)}
          <div ref={slotRef} className="ai-dock-slot" />
        </div>
      )}
      {layout === "bar" && (
        <div className="ai-dock-frame ai-dock-bar" data-expanded={expanded ? "true" : undefined} style={middle}
          onSubmitCapture={() => setExpanded(true)} onClickCapture={(e) => { if ((e.target as HTMLElement).closest(".drawing-ai-examples")) setExpanded(true); }}>
          {header(expanded ? "Make the AI Animator smaller" : "Show the AI Animator chat", () => setExpanded((v) => !v), <Chevron up={!expanded} />)}
          <div ref={slotRef} className="ai-dock-slot" />
        </div>
      )}
      {layout === "top" && (
        <div className="ai-dock-frame ai-dock-top" data-open={open ? "true" : undefined} aria-hidden={!open} style={middle}>
          {header("Close the AI Animator", () => setOpen(false), X)}
          <div ref={slotRef} className="ai-dock-slot" />
        </div>
      )}
    </>
  );
}

// the open/closed state for the timeline button (it lives in another part of the editor)
export function useAiDockOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setOpen(Boolean((e as CustomEvent).detail?.open));
    window.addEventListener("diamond-ai-dock-state", on);
    return () => window.removeEventListener("diamond-ai-dock-state", on);
  }, []);
  return open;
}

const aiDockStyles = `
.ai-dock-host { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.ai-dock-host > .workspace-ai-panel-shell { flex: 1 1 0 !important; border-top: 0 !important; }
.ai-dock-frame { position: absolute; z-index: 30; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  background: var(--da-panel, #1a1a1e); border: 1px solid var(--da-line, #2c2c32); border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.02) inset; color: var(--da-text, #f5f5f6); }
.ai-dock-slot { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.ai-dock-frame .workspace-ai-panel-shell { background: transparent !important; }
.ai-dock-frame .workspace-ai-panel-shell > style + div { display: none !important; }
.ai-dock-frame .workspace-ai-panel-shell > * { background: transparent !important; }
.ai-dock-frame .workspace-ai-messages-scroll { background: transparent !important; }
.ai-dock-frame .drawing-ai-thread-head { display: none !important; }
.ai-dock-head { display: flex; align-items: center; gap: 9px; padding: 12px 12px 10px 14px; border-bottom: 1px solid var(--da-line, #2c2c32); flex-shrink: 0; min-width: 0; }
.ai-dock-logo { display: inline-flex; color: #fff; }
.ai-dock-title { font-size: 13px; font-weight: 650; white-space: nowrap; }
.ai-dock-sub { font-size: 12px; color: var(--da-muted, #a3a3ab); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 1 auto; }
.ai-dock-close { margin-left: auto; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 0; background: transparent; color: var(--da-muted, #a3a3ab); cursor: pointer; flex-shrink: 0; }
.ai-dock-close:hover { background: var(--da-hover, #2a2a30); color: #fff; }
.ai-dock-close:focus-visible { outline: 2px solid #4d94ff; outline-offset: 1px; }

/* 1 - rises from the timeline, on the left, over the canvas (the canvas never changes size) */
.ai-dock-timeline { left: 72px; bottom: 10px; width: 468px; height: min(660px, calc(100% - 20px));
  opacity: 0; transform: translateY(14px); pointer-events: none; visibility: hidden; transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s; }
.ai-dock-timeline[data-open] { opacity: 1; transform: none; pointer-events: auto; visibility: visible; transition: opacity .16s ease, transform .16s ease; }
.ai-tl-button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px 0 9px; border-radius: 9px; border: 1px solid #2f4f86;
  background: linear-gradient(180deg, rgba(0,102,255,.20), rgba(0,102,255,.10)); color: #e8f0ff; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.ai-tl-button svg { color: #6ea8ff; }
.ai-tl-button:hover, .ai-tl-button[data-open] { background: #0066ff; border-color: #0066ff; color: #fff; }
.ai-tl-button:hover svg, .ai-tl-button[data-open] svg { color: #fff; }
.ai-tl-button:focus-visible { outline: 2px solid #4d94ff; outline-offset: 2px; }
.ai-tl-plus { font-size: 16px; line-height: 1; font-weight: 500; margin-right: -1px; }

/* 2 - docked under the canvas, always there; the chat opens above the message box */
.ai-dock-bar { bottom: 14px; width: min(720px, calc(100% - 64px - var(--ai-right, 0px) - 32px)); max-height: calc(100% - 28px); }
.ai-dock-bar:not([data-expanded]) .workspace-ai-messages-scroll { display: none !important; }
.ai-dock-bar:not([data-expanded]) .ai-dock-slot, .ai-dock-bar:not([data-expanded]) .ai-dock-host, .ai-dock-bar:not([data-expanded]) .workspace-ai-panel-shell { flex: 0 0 auto !important; }
.ai-dock-bar:not([data-expanded]) .ai-dock-head { border-bottom: 0; padding-bottom: 4px; }
.ai-dock-bar[data-expanded] { height: min(600px, calc(100% - 28px)); }
.ai-dock-bar .drawing-ai-empty .drawing-ai-logo, .ai-dock-bar .drawing-ai-empty > strong, .ai-dock-bar .drawing-ai-empty-text { display: none !important; }
.ai-dock-bar .drawing-ai-empty { padding-top: 4px !important; }

/* 3 - drops down from the top bar's field */
.ai-dock-top { top: 10px; width: min(680px, calc(100% - 96px)); height: min(640px, calc(100% - 20px));
  opacity: 0; translate: 0 -10px; pointer-events: none; visibility: hidden; transition: opacity .16s ease, translate .16s ease, visibility 0s linear .16s; }
.ai-dock-top[data-open] { opacity: 1; translate: 0 0; pointer-events: auto; visibility: visible; transition: opacity .16s ease, translate .16s ease; }
.ai-top-field { display: inline-flex; align-items: center; gap: 9px; width: min(460px, 38vw); height: 32px; padding: 0 6px 0 10px; border-radius: 10px;
  border: 1px solid var(--da-border, #2c2c32); background: var(--da-page, #111113); color: var(--da-muted, #a3a3ab); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
.ai-top-field:hover { border-color: #3a3a41; background: #17171b; color: var(--da-text-2, #d2d2d7); }
.ai-top-field:focus-visible { outline: 2px solid #4d94ff; outline-offset: 1px; }
.ai-top-spark { display: inline-flex; color: #6ea8ff; }
.ai-top-text { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-top-field kbd { font: inherit; font-size: 11px; color: var(--da-muted, #a3a3ab); border: 1px solid var(--da-border, #2c2c32); border-radius: 6px; padding: 2px 6px; background: var(--da-panel, #1a1a1e); }

/* the review switch, bottom right (over the empty foot of the right panel) */
.ai-layout-switch { position: fixed; right: 16px; bottom: 78px; z-index: 31; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 11px;
  background: rgba(17,17,19,.92); border: 1px solid var(--da-line, #2c2c32); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.ai-layout-switch > span { font-size: 11px; font-weight: 600; color: var(--da-muted, #a3a3ab); padding: 0 8px 0 6px; text-transform: uppercase; letter-spacing: .06em; }
.ai-layout-switch button { height: 26px; padding: 0 10px; border-radius: 8px; border: 0; background: transparent; color: var(--da-text-2, #d2d2d7); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.ai-layout-switch button:hover { background: var(--da-hover, #2a2a30); color: #fff; }
.ai-layout-switch button[aria-pressed="true"] { background: var(--da-selected-bg, #3a3a41); color: #fff; }
@media (prefers-reduced-motion: reduce) { .ai-dock-timeline, .ai-dock-top { transition: none !important; } }
@media (max-width: 640px) { .ai-layout-switch { display: none; } }
`;
