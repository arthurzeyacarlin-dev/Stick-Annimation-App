"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PencilIcon } from "@/src/components/ui/ToolIcons";
import type { ComponentType, ReactNode } from "react";
import { AssistantActivity, useReducedMotion } from "@/src/components/assistant/AssistantText";
import { workspaceColors } from "../../workspaceTheme";
import { creditsText } from "@/src/lib/account/credits";
import { V1_PANEL_WORDS, gentleBarPct, progressWords, undoRedoState, v1ReplyBlocks, v1WorkWord, type V1ReplySeg, type V1ChatLine, type V1GatePicture, type V1FrameDelta, type V1PanelState, type V1Progress, type V1ResultBlockMark } from "./v1AnimatorController.ts";

// (Nov 17, Part 2) the changing words while he thinks (the server sends the book's list; these until it does). Never an "almost done" word:
// nothing knows when his thinking is almost done.
const THINKING_WORDS = ["Thinking", "Noodling", "Cooking", "Stirring", "Sketching the shots"];
const THINKING_WORD_MS = 2400;

// AI Animator V1 — what the chat shows (no fetching here; v1AnimatorController.ts owns the flow).
// Arthur's rules: only buttons and cards (the Animating card, the Undo / Redo card) get boxes; text and numbers stay
// plain with hairline dividers; EVERY action word (Thinking, Animating, Stopping, Putting it on the canvas) is the same
// standalone AssistantActivity gradient line as the Help Assistant, never inside a box (Nov 2); Luna's words type
// themselves out; never a "move i of n" count. Narrow panels (phones) wrap everything; nothing is wider than the panel; the canvas
// is never touched by this view. Reduced motion: no bar animation.

export type V1ReplyMessage = { id: string; role: "assistant"; content: string; createdAt: string };
export type V1ReplyComponent = ComponentType<{ message: V1ReplyMessage; animate: boolean; onRevealComplete: (messageId: string) => void }>;

type Props = {
  state: V1PanelState;
  Reply?: V1ReplyComponent; // (kept for the panel's API; V1 replies now render as paragraphs here)
  readOnly: boolean;
  onRevealed: (messageId: string) => void; // must be stable (useCallback): the typewriter restarts when it changes
  onUndo: () => void;
  onRedo: () => void;
  onCancel?: () => void;
  onAnimate?: (lineId: number) => void; // (Nov 11) the gate card's Animate
  onChangePlan?: () => void;
  onAnswer?: (answers: string[]) => void; // (Nov 11) a question card choice // (Nov 11) the gate card's Change it: the cursor goes to the message box
};

export const v1ReplyId = (id: number) => `v1-line-${id}`;
export const v1LineIdFromReply = (messageId: string) => Number(messageId.replace(/^v1-line-/, ""));
const seconds = (value: number) => `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} second${value === 1 ? "" : "s"}`;

// the home hero word "animate" (MainScreen.module.css .accent): the app's own brand blue, not a new one
const V1_BRAND_GRADIENT = "linear-gradient(90deg, var(--da-accent, #0066ff) 0%, var(--da-accent-hover, #1f7aff) 100%)";   // (Nov 22, D-0246) main's one blue, no glow

export const v1ThreadStyles = `
  .v1-user { align-self: flex-end; max-width: 88%; padding: 9px 12px; border-radius: 14px; white-space: pre-wrap; color: var(--da-text, #f5f5f6); background: #2c2c31; border: 0; font-size: 12px; line-height: 1.48; }   /* (Nov 22, Arthur) the same bubble as the Help Assistant: dark, no border */
  /* (Nov 18, Arthur: 'a copy and paste button' under my message and the AI's reply, like Claude's) */
  .v1-copy { margin-top: -6px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border: 0; border-radius: 6px; background: transparent; color: ${workspaceColors.textSecondary}; font-size: 11px; cursor: pointer; opacity: .7; }
  .v1-copy:hover, .v1-copy:focus-visible { opacity: 1; background: ${workspaceColors.selectedFill}; }
  .v1-copy-end { align-self: flex-end; } .v1-copy-start { align-self: flex-start; }
  .v1-error { align-self: flex-start; max-width: 92%; color: ${workspaceColors.danger}; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .v1-note { align-self: flex-start; max-width: 92%; color: ${workspaceColors.textMuted}; font-size: 11px; line-height: 1.45; }
  .v1-activity { align-self: flex-start; padding: 8px 4px 0; }
  /* (Nov 17, Part 2) what he did: ONE grey line with a small arrow, closed by default; a click opens the steps */
  .v1-work { align-self: flex-start; max-width: 92%; font-size: 11.5px; line-height: 1.45; color: ${workspaceColors.textMuted}; }
  .v1-work summary { display: inline-flex; align-items: baseline; gap: 6px; cursor: pointer; list-style: none; border-radius: 6px; }
  .v1-work summary::-webkit-details-marker { display: none; }
  .v1-work summary:hover { color: ${workspaceColors.textSecondary}; }
  .v1-work summary:focus-visible { outline: 2px solid var(--da-focus, #4d94ff); outline-offset: 2px; }
  .v1-work-arrow { display: inline-block; font-size: 12px; line-height: 1; transition: transform .15s ease; }
  .v1-work[open] .v1-work-arrow { transform: rotate(90deg); }
  .v1-work ol { margin: 6px 0 2px; padding: 0 0 0 14px; display: grid; gap: 3px; list-style: none; border-left: 1px solid ${workspaceColors.divider}; }
  .v1-card { position: relative; align-self: stretch; box-sizing: border-box; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; border-radius: 12px; border: 1px solid ${workspaceColors.border}; background: ${workspaceColors.chatBox}; }
  .v1-progress { flex: 1 1 auto; min-width: 0; display: grid; gap: 9px; }
  .v1-progress-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 4px 12px; min-width: 0; }
  .v1-card-time { min-width: 0; font-size: 11px; line-height: 1.3; color: ${workspaceColors.textMuted}; font-variant-numeric: tabular-nums; letter-spacing: .01em; overflow-wrap: anywhere; }
  .v1-pct { flex: 0 0 auto; font-size: 11px; line-height: 1.3; font-weight: 600; color: var(--da-muted, #a3a3ab); font-variant-numeric: tabular-nums; letter-spacing: .02em; }
  .v1-bar { position: relative; height: 8px; border-radius: 999px; background: color-mix(in srgb, ${workspaceColors.divider} 70%, #000 30%); box-shadow: inset 0 1px 2px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.04); }
  /* (Nov 2, Arthur) the app's own blue: the home hero word "animate" (MainScreen.module.css .accent) on the global blue --da-hover */
  .v1-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; max-width: 100%; border-radius: inherit; overflow: hidden; background: ${workspaceColors.hover}; background-image: ${V1_BRAND_GRADIENT}; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); transition: width 1.4s cubic-bezier(.25,.8,.3,1); }
  .v1-bar-fill::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); transform: translateX(-100%); animation: v1-bar-sheen 2.4s ease-in-out infinite; }
  @keyframes v1-bar-sheen { to { transform: translateX(100%); } }
  .v1-x { flex: 0 0 auto; display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border-radius: 8px; border: 1px solid transparent; background: transparent; color: ${workspaceColors.textMuted}; cursor: pointer; transition: none; }
  .v1-x svg { width: 14px; height: 14px; }
  .v1-x:hover:enabled { border-color: ${workspaceColors.border}; background: ${workspaceColors.hover}; color: #fff; }
  .v1-x:disabled { opacity: .45; cursor: not-allowed; }
  .v1-x:focus-visible { outline: 2px solid var(--da-focus, #4d94ff); outline-offset: 2px; }
  .v1-result { align-self: stretch; display: grid; gap: 6px; padding: 8px 0 2px; border-top: 1px solid ${workspaceColors.divider}; font-size: 12px; line-height: 1.5; color: ${workspaceColors.textSecondary}; overflow-wrap: anywhere; }
  .v1-result-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 11px; color: ${workspaceColors.textMuted}; }
  .v1-result-head strong { font-weight: 700; color: ${workspaceColors.textPrimary}; }
  .v1-on { color: ${workspaceColors.accentMuted}; }
  .v1-blocks { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  .v1-block { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
  .v1-block-words { min-width: 0; color: ${workspaceColors.textSecondary}; }
  .v1-mark { font-size: 10.5px; font-weight: 600; white-space: nowrap; }
  .v1-mark-re-made, .v1-mark-new { color: ${workspaceColors.accentMuted}; }
  .v1-mark-unchanged { color: ${workspaceColors.label}; }
  .v1-label { flex-basis: 100%; padding-left: 14px; font-size: 11px; color: ${workspaceColors.textMuted}; }
  .v1-labels { margin: 0; padding: 6px 0 0; list-style: none; display: grid; gap: 2px; border-top: 1px solid ${workspaceColors.divider}; font-size: 11px; color: ${workspaceColors.textMuted}; }
  .v1-actions { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
  /* (Arthur, Nov 2) the Undo / Redo card: the frame numbers on top, the two buttons below, equal widths */
  .v1-reply { align-self: flex-start; max-width: 92%; display: grid; gap: 10px; color: ${workspaceColors.textSecondary}; font-size: 12px; line-height: 1.55; }
  .v1-reply p { margin: 0; }
  .v1-reply h4 { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.4; color: ${workspaceColors.textPrimary}; }
  .v1-reply ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; list-style: disc outside; }
  .v1-reply li::marker { color: ${workspaceColors.accentMuted}; }
  .v1-reply li { margin: 0; }
  .v1-reply strong { font-weight: 600; color: ${workspaceColors.textPrimary}; }
  .v1-versions { flex-direction: column; align-items: stretch; gap: 10px; padding: 10px; margin-top: 2px; }
  .v1-versions .v1-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-top: 0; }
  .v1-versions .v1-delta { padding: 0 2px 9px; border-bottom: 1px solid ${workspaceColors.divider}; }
  .v1-gate { margin-top: 2px; }
  /* (Nov 17, Arthur: "the gate card sometimes doesn't show") a long reply typing out above it pushed the card below the panel's edge: while it waits it stays pinned at the bottom of the chat, right above the message box */
  /* (Nov 18, Arthur: the pinned gate card covered the chat when he scrolled up) the gate card is a normal card in the chat again; the chat scrolls down to it when it appears (V1AnimatorChat) */
  .v1-question .v1-actions { grid-template-columns: 1fr 1fr; }
  .v1-q { display: grid; gap: 6px; padding: 0 2px 8px; border-bottom: 1px solid ${workspaceColors.divider}; }
  .v1-q-text { font-size: 12.5px; font-weight: 600; color: ${workspaceColors.textPrimary}; }
  .v1-q-options { display: flex; flex-wrap: wrap; gap: 6px; }
  .v1-q-options button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 10px; border-radius: 9px; border: 1px solid ${workspaceColors.border}; background: transparent; color: ${workspaceColors.textSecondary}; font-size: 12px; cursor: pointer; }
  .v1-q-options button.v1-q-on { border-color: var(--da-selected-border, #55555e); background: var(--da-selected-bg, #3a3a41); color: #fff; box-shadow: var(--da-glow-selected); }
  .v1-gate-colour { display: flex; align-items: center; gap: 8px; list-style: none; margin-left: -18px; font-variant-numeric: tabular-nums; }
  .v1-swatch { width: 14px; height: 14px; border-radius: 4px; border: 1px solid ${workspaceColors.border}; flex: 0 0 auto; }
  .v1-gate-not { margin: 0; padding: 0 2px; font-size: 11.5px; color: ${workspaceColors.textMuted}; }
  .v1-gate-lines { margin: 0; padding: 0 2px 0 18px; display: grid; gap: 4px; list-style: disc outside; font-size: 12px; line-height: 1.5; color: ${workspaceColors.textSecondary}; }
  .v1-gate-lines li::marker { color: ${workspaceColors.accentMuted}; }
  .v1-gate-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 2px 9px; border-bottom: 1px solid ${workspaceColors.divider}; font-size: 13px; font-weight: 700; color: ${workspaceColors.textPrimary}; }
  .v1-gate-cost { font-size: 10.5px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: ${workspaceColors.textMuted}; font-variant-numeric: tabular-nums; }
  /* (Nov 22, Arthur: one picture with everything in it, a click makes it almost full screen) the gate card's first picture */
  .v1-gate-pic { display: block; width: 100%; padding: 0; border: 1px solid ${workspaceColors.border}; border-radius: 10px; overflow: hidden; background: #fff; cursor: zoom-in; text-align: left; }
  .v1-gate-pic img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; }
  /* (Nov 22, Arthur: "at the bottom of the image, visible text ... a beta user would only look at the image") the picture's own caption:
     why it is shown, readable in a few seconds; a bar under the picture, so it never hides a thing in it */
  .v1-gate-pic-say { display: block; padding: 7px 10px 8px; background: #15181d; color: #fff; font-size: 12px; font-weight: 600; line-height: 1.35; text-align: center; letter-spacing: .005em; }
  .v1-gate-pic:focus-visible { outline: 2px solid var(--da-focus, #4d94ff); outline-offset: 2px; }
  .v1-gate-pic-drawing { display: grid; aspect-ratio: 16 / 9; place-content: center; gap: 4px; text-align: center; cursor: default; color: ${workspaceColors.textSecondary}; font-size: 12.5px; font-weight: 600;
    background: linear-gradient(100deg, rgba(255,255,255,.03) 20%, rgba(255,255,255,.10) 40%, rgba(255,255,255,.03) 60%) ${workspaceColors.divider}; background-size: 220% 100%; animation: v1-gate-shine 1.6s linear infinite; }
  .v1-gate-pic-drawing small { font-size: 11px; font-weight: 500; color: ${workspaceColors.textMuted}; }
  @keyframes v1-gate-shine { from { background-position: 120% 0; } to { background-position: -120% 0; } }
  @media (prefers-reduced-motion: reduce) { .v1-gate-pic-drawing { animation: none; } }
  .v1-gate-pic-note { margin: 0; padding: 0 2px; font-size: 11.5px; line-height: 1.45; color: ${workspaceColors.textMuted}; }
  .v1-gate-big { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 4vh 4vw; background: rgba(8, 10, 14, .78); cursor: zoom-out; }
  .v1-gate-big figure { margin: 0; max-width: 92vw; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 18px 60px rgba(0,0,0,.45); }
  .v1-gate-big img { display: block; max-width: 92vw; max-height: calc(90vh - 52px); margin: 0 auto; }
  .v1-gate-big .v1-gate-pic-say { padding: 12px 16px 13px; font-size: 15px; }
  .v1-gate-big-close { position: fixed; top: max(14px, env(safe-area-inset-top, 0px)); right: max(14px, env(safe-area-inset-right, 0px)); width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(255,255,255,.14); color: #fff; font-size: 22px; line-height: 1; cursor: pointer; }
  .v1-delta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
  .v1-delta-caption { margin-left: auto; font-size: 10.5px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: ${workspaceColors.textMuted}; }
  /* (Arthur, Nov 2) the plus is ALWAYS green and the minus ALWAYS red, zero included */
  .v1-plus, .v1-plus.v1-zero { color: var(--da-success, #5fd49a); }
  .v1-minus, .v1-minus.v1-zero { color: ${workspaceColors.danger}; }
  .v1-actions button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 12px; border-radius: 10px; border: 1px solid ${workspaceColors.selectedBorder}; background: ${workspaceColors.selectedFill}; color: ${workspaceColors.textPrimary}; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; transition: none; }
  .v1-actions button svg { width: 14px; height: 14px; flex-shrink: 0; }
  .v1-actions button:hover:enabled { border-color: ${workspaceColors.hover}; background: ${workspaceColors.hover}; color: #fff; }
  .v1-actions button:disabled { cursor: not-allowed; opacity: .5; }
  .v1-actions button:focus-visible { outline: 2px solid var(--da-focus, #4d94ff); outline-offset: 2px; }
  /* (Nov 22, D-0246, Arthur: "the new button hovers, the new button colors ... genuinely polished") main's gray look: a dark card button
     at rest, the whole button solid gray on hover, instantly; blue only on the main action (Animate). !important beats the workspace-wide
     button hover (workspaceTheme). */
  .v1-versions .v1-actions button { justify-content: center; min-width: 0; min-height: 34px; padding: 6px 12px; border-radius: 10px; border-color: var(--da-border, #2c2c32); background: var(--da-card-fill, #1a1a1e); color: var(--da-text-2, #d2d2d7); box-shadow: var(--da-card-shadow); letter-spacing: .01em; }
  .v1-versions .v1-actions button:hover:enabled { border-color: var(--da-hover, #3a3a41) !important; background: var(--da-hover, #3a3a41) !important; background-image: none !important; color: #fff !important; box-shadow: var(--da-glow-hover) !important; transition: none; }
  .v1-versions .v1-actions button:hover:enabled svg { color: #fff; }
  .v1-versions .v1-actions button:active:enabled { background: var(--da-hover, #3a3a41); background-image: none; box-shadow: inset 0 1px 3px rgba(0,0,0,.35); }
  .v1-versions .v1-actions button.v1-primary { border-color: var(--da-accent, #0066ff); background: var(--da-accent, #0066ff); color: #fff; box-shadow: var(--da-glow-primary); }
  .v1-versions .v1-actions button.v1-primary:hover:enabled { border-color: var(--da-accent-hover, #1f7aff) !important; background: var(--da-accent-hover, #1f7aff) !important; box-shadow: var(--da-glow-primary-hover) !important; }
  .v1-versions .v1-actions button.v1-primary:active:enabled { background: var(--da-accent, #0066ff); }
  .v1-versions .v1-actions button:disabled { cursor: not-allowed; opacity: .42; border-color: ${workspaceColors.border}; background: transparent; color: ${workspaceColors.textMuted}; box-shadow: none; }
  /* (Nov 3, Arthur) the out-of-credits card above the message box: the Undo / Redo card's look; plain words, two link buttons */
  .v1-out { flex-direction: column; align-items: stretch; gap: 10px; padding: 10px; margin: 0 0 8px; }
  .v1-out .v1-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-top: 0; }
  .v1-out-words { display: grid; gap: 3px; padding: 0 2px; font-size: 11.5px; line-height: 1.45; color: ${workspaceColors.textMuted}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .v1-out-words strong { font-size: 13px; font-weight: 700; color: ${workspaceColors.textPrimary}; }
  .v1-out .v1-actions a { display: inline-flex; align-items: center; justify-content: center; min-width: 0; min-height: 34px; padding: 6px 12px; border-radius: 10px; border: 1px solid var(--da-border, #2c2c32); background: var(--da-card-fill, #1a1a1e); color: var(--da-text-2, #d2d2d7); box-shadow: var(--da-card-shadow); font: inherit; font-size: 12px; font-weight: 600; letter-spacing: .01em; text-align: center; text-decoration: none; cursor: pointer; transition: none; }
  .v1-out .v1-actions a:hover { border-color: var(--da-hover, #3a3a41) !important; background: var(--da-hover, #3a3a41) !important; background-image: none !important; color: #fff !important; box-shadow: var(--da-glow-hover) !important; transition: none; }
  .v1-out .v1-actions a:active { background: var(--da-hover, #3a3a41); background-image: none; box-shadow: inset 0 1px 3px rgba(0,0,0,.35); }
  .v1-out .v1-actions a:first-child { border-color: var(--da-accent, #0066ff); background: var(--da-accent, #0066ff); color: #fff; box-shadow: var(--da-glow-primary); }
  .v1-out .v1-actions a:first-child:hover { border-color: var(--da-accent-hover, #1f7aff) !important; background: var(--da-accent-hover, #1f7aff) !important; box-shadow: var(--da-glow-primary-hover) !important; }
  .v1-out .v1-actions a:focus-visible { outline: 2px solid var(--da-focus, #4d94ff); outline-offset: 2px; }
  @media (pointer: coarse) { .v1-actions button, .v1-versions .v1-actions button, .v1-out .v1-actions a { min-height: 40px; padding: 6px 16px; } .v1-x { width: 40px; height: 40px; } }
  @media (prefers-reduced-motion: reduce) { .v1-bar-fill { transition: none; } .v1-bar-fill::after { animation: none; display: none; } }
  @media (prefers-reduced-motion: reduce) { .v1-work-arrow { transition: none; } }
`;

// (the same arrows as the top bar's Undo / Redo, so the two read as one app)
const UndoIcon = () => <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5 1.75 7.75 6 12M2.25 7.75H14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const CloseIcon = () => <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
const RedoIcon = () => <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3.5 14.25 7.75 10 12M13.75 7.75H2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const MARK_WORDS: Record<Exclude<V1ResultBlockMark, "made">, string> = { "re-made": "edited", new: "new", unchanged: "unchanged" };

// The Animating card: a smooth bar (moves on with each PROGRESS line, never backwards) and the time left, counted down
// every second between engine updates. Cancel lives here.
function AnimatingCard({ progress, cancelling, readOnly, onCancel, word }: { progress: V1Progress | null; cancelling: boolean; readOnly: boolean; onCancel?: () => void; word: string }) {
  const at = progress?.at ?? 0;
  const etaS = progress?.etaS ?? null;
  const pct = progress?.pct ?? null;
  const high = pct !== null && pct >= 99;
  const [now, setNow] = useState(at);
  const [highSince, setHighSince] = useState<number | null>(null);
  useEffect(() => { setHighSince((since) => (high ? since ?? Date.now() : null)); }, [high]);
  useEffect(() => {
    setNow(Date.now());
    if (etaS === null && !high) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at, etaS, high]);
  const realLeft = etaS === null ? null : Math.max(0, etaS - Math.max(0, now - at) / 1000);
  // (Nov 2, Arthur: the time left never jumps UP - a later, bigger guess holds the shown time until the real time catches up)
  const lowest = useRef<number | null>(null);
  const left = realLeft === null ? null : Math.min(realLeft, lowest.current ?? realLeft);
  useEffect(() => { if (left !== null) lowest.current = left; }, [left]);
  const highForS = high && highSince !== null ? Math.max(0, now - highSince) / 1000 : 0;
  const onCanvas = progress?.onCanvas === true;
  // (Nov 17, Arthur: "100% means done") under 95% until it is ON THE CANVAS; the number shown is the bar's own width
  const shown = gentleBarPct(pct, highForS, onCanvas);
  const shownPct = pct === null && !onCanvas ? null : Math.round(shown);
  // (Nov 22, Arthur: "the progress bar has to be genuinely accurate") past its expected time it says so; a long story says which part
  const part = progress?.part ? `Part ${progress.part[0]} of ${progress.part[1]} · ` : "";
  const timeWords = cancelling ? "Nothing will be added to the canvas" : onCanvas ? "On the canvas" : part + (progress?.late ? "Taking a little longer than planned" : progressWords(pct, left, highForS));
  return (
    <>
      {/* (the action word is the standalone gradient line, never inside the card) */}
      <div className="v1-activity" aria-label="AI Animator status"><AssistantActivity label={cancelling ? V1_PANEL_WORDS.stopping : word} /></div>
      <section className="v1-card" aria-label="Animation progress" data-v1-card="">
        <div className="v1-progress">
          <div className="v1-bar" role="progressbar" aria-label="Animation progress" aria-valuemin={0} aria-valuemax={100} aria-valuetext={shownPct === null ? timeWords : `${shownPct}%, ${timeWords}`} {...(shownPct === null ? {} : { "aria-valuenow": shownPct })}>
            <div className="v1-bar-fill" style={{ width: `${shown}%` }} />
          </div>
          <div className="v1-progress-meta">
            <span className="v1-card-time">{timeWords}</span>
            {shownPct !== null && <span className="v1-pct" aria-hidden="true">{shownPct}%</span>}
          </div>
        </div>
        {onCancel && (
          <button type="button" className="v1-x" aria-label="Cancel animation" title={cancelling ? "Stopping…" : "Cancel animation"} disabled={readOnly || cancelling} onClick={onCancel}><CloseIcon /></button>
        )}
      </section>
    </>
  );
}

// "+176  −0  FRAMES CHANGED": frames made / edited / added (always green) and deleted (always red), zero included.
function FrameDelta({ delta, words }: { delta: V1FrameDelta; words: string }) {
  return (
    <span className="v1-delta" data-v1-delta="" title={words || undefined} aria-label={`${delta.plus} frames made or changed, ${delta.minus} deleted`}>
      <span className={`v1-plus${delta.plus === 0 ? " v1-zero" : ""}`}>+{delta.plus}</span>
      <span className={`v1-minus${delta.minus === 0 ? " v1-zero" : ""}`}>{"\u2212"}{delta.minus}</span>
      <span className="v1-delta-caption" aria-hidden="true">frames changed</span>
    </span>
  );
}

function ResultLine({ line, isLatest, state, readOnly, onUndo, onRedo }: { line: Extract<V1ChatLine, { kind: "result" }>; isLatest: boolean; state: V1PanelState; readOnly: boolean; onUndo: () => void; onRedo: () => void }) {
  const onCanvas = state.placedVersion === line.version;
  const { canUndo, canRedo } = undoRedoState(state.snapshot);
  const busy = Boolean(state.busy);
  return (
    <section className="v1-result" aria-label={`Animation version ${line.version}`} data-v1-result={line.version}>
      <div className="v1-result-head">
        <strong>Version {line.version}</strong>
        {line.lengthS > 0 && <span>{seconds(line.lengthS)}</span>}
        {onCanvas && <span className="v1-on">on the canvas</span>}
      </div>
      {line.blocks.length > 0 && (
        <ol className="v1-blocks" aria-label="Parts in order">
          {line.blocks.map((block) => (
            <li className="v1-block" key={block.n} data-v1-block={block.id} data-v1-mark={block.mark}>
              <span className="v1-block-words">{block.sentence}</span>
              {block.mark !== "made" && <span className={`v1-mark v1-mark-${block.mark}`}>{MARK_WORDS[block.mark]}</span>}
              {block.labels.map((label, index) => <span className="v1-label" key={index}>{label}</span>)}
              {(block.checks ?? []).map((check, index) => <span className="v1-label v1-check" key={`c${index}`} data-v1-check="">{check}</span>)}
            </li>
          ))}
        </ol>
      )}
      {line.labels.length > 0 && <ul className="v1-labels" aria-label="Notes">{line.labels.map((label, index) => <li key={index}>{label}</li>)}</ul>}
      {isLatest ? (
        <div className="v1-card v1-versions" data-v1-versions="" data-workspace-theme-exempt="">
          {line.delta && <FrameDelta delta={line.delta} words={line.summary} />}
          <div className="v1-actions" role="group" aria-label="Versions">
            <button type="button" title="Show the version before" disabled={readOnly || busy || !canUndo} onClick={onUndo}><UndoIcon />Undo</button>
            <button type="button" title="Show the version after" disabled={readOnly || busy || !canRedo} onClick={onRedo}><RedoIcon />Redo</button>
          </div>
        </div>
      ) : line.delta ? <FrameDelta delta={line.delta} words={line.summary} /> : line.summary ? <span className="v1-note">{line.summary}</span> : null}
    </section>
  );
}

// An AI reply in short paragraphs (<p> each, spaced), typed out like the shared Reply (same timing and gradient edge).
const TYPE_MIN_MS = 220, TYPE_MAX_MS = 720, TYPE_MS_PER_CHAR = 3.5, TYPE_EDGE = 14;
function ParagraphReply({ id, text, animate, onRevealComplete }: { id: string; text: string; animate: boolean; onRevealComplete: (messageId: string) => void }) {
  // (Nov 10, Arthur: like a pro app) a headline, bullets and bold, typed out the same way; every piece is plain text
  const blocks = v1ReplyBlocks(text);
  const total = blocks.reduce((sum, b) => sum + b.segs.reduce((t, s) => t + s.text.length, 0), 0);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(animate ? 0 : total);
  useEffect(() => {
    if (!animate || reduced || total === 0) { setShown(total); onRevealComplete(id); return; }
    const duration = Math.min(TYPE_MAX_MS, Math.max(TYPE_MIN_MS, total * TYPE_MS_PER_CHAR));
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setShown(Math.min(total, Math.max(1, Math.ceil(total * progress))));
      if (progress < 1) frame = requestAnimationFrame(tick); else onRevealComplete(id);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, reduced, id, total, onRevealComplete]);
  const complete = shown >= total;
  const edge = complete ? shown : Math.max(0, shown - TYPE_EDGE);
  let offset = 0;
  const piece = (s: V1ReplySeg, k: number) => {
    const start = offset; offset += s.text.length;
    if (!complete && shown <= start) return null;
    const node = complete || shown >= offset ? s.text
      : <>{s.text.slice(0, Math.max(0, edge - start))}<span className="ai-animator-typewriter-edge">{s.text.slice(Math.max(0, edge - start), shown - start)}</span></>;
    return s.bold ? <strong key={k}>{node}</strong> : <Fragment key={k}>{node}</Fragment>;
  };
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const closeList = () => { if (bullets.length) out.push(<ul key={`ul${out.length}`} aria-hidden="true">{bullets}</ul>); bullets = []; };
  blocks.forEach((b, i) => {
    const visible = complete || shown > offset, inner = b.segs.map(piece);
    if (!visible) return;
    if (b.kind === "li") { bullets.push(<li key={i}>{inner}</li>); return; }
    closeList();
    out.push(b.kind === "h" ? <h4 key={i} aria-hidden="true">{inner}</h4> : <p key={i} aria-hidden="true">{inner}</p>);
  });
  closeList();
  return (
    <div className="ai-animator-message v1-reply" data-ai-assistant-message={id} data-reveal-state={complete ? "complete" : "revealing"} aria-live="polite">
      <span className="ai-animator-sr-only">AI Animator: {blocks.map((b) => b.segs.map((s) => s.text).join("")).join(" ")}</span>
      {out}
    </div>
  );
}

// (Nov 17, Part 2) while he thinks: the gradient line with changing words; his words show below it as he writes them (no typing effect:
// they are real as they come)
function ThinkingLine({ words }: { words: string[] }) {
  const list = (words.length ? words : THINKING_WORDS).filter((w) => !/^almost\b/i.test(w.trim()));
  const shownList = list.length ? list : THINKING_WORDS;
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced || shownList.length < 2) return;
    const timer = setInterval(() => setI((k) => k + 1), THINKING_WORD_MS);
    return () => clearInterval(timer);
  }, [reduced, shownList.length]);
  return <div className="v1-activity" aria-label="AI Animator status"><AssistantActivity label={shownList[i % shownList.length]} /></div>;
}
function LiveWords({ text }: { text: string }) {
  const blocks = v1ReplyBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className="ai-animator-message v1-reply" data-v1-live="" aria-hidden="true">
      {blocks.map((b, i) => {
        const inner = b.segs.map((seg, k) => seg.bold ? <strong key={k}>{seg.text}</strong> : <Fragment key={k}>{seg.text}</Fragment>);
        return b.kind === "h" ? <h4 key={i}>{inner}</h4> : b.kind === "li" ? <ul key={i}><li>{inner}</li></ul> : <p key={i}>{inner}</p>;
      })}
    </div>
  );
}
// What he did, folded: "Thought for 7 seconds, made the plan ›" - closed by default, a click opens the steps.
function WorkLine({ line }: { line: Extract<V1ChatLine, { kind: "work" }> }) {
  return (
    <details className="v1-work" data-v1-work="">
      <summary>{line.summary}<span className="v1-work-arrow" aria-hidden="true">{"\u203A"}</span></summary>
      {line.steps.length > 0 && <ol>{line.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>}
    </details>
  );
}

// (Nov 11, Arthur's dad: no wasted credits) the card under the plan: nothing is made or charged until Animate. The Undo / Redo card's look.
const PlayIcon = () => <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8 5 3.2Z" fill="currentColor" /></svg>;
// (Nov 22, Arthur: "only one image for that one thing at the beginning", "if the user clicks on it, it should get almost full screen")
// the first picture of a new animation with things in it: everything in one picture, so sizes and looks can be compared before Animate
function GatePictureBox({ picture }: { picture: V1GatePicture }) {
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (!big) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [big]);
  if (picture.state === "none") return null;
  const isNew = picture.kind === "new";
  if (picture.state === "drawing") return <div className="v1-gate-pic v1-gate-pic-drawing" role="status"><span>{isNew ? "Drawing what's new…" : "Drawing everything in your animation…"}</span><small>{isNew ? "How the new things will look in your animation" : "Everything in your animation, in one picture"}</small></div>;
  if (picture.state === "failed") return <p className="v1-gate-not">The picture could not be drawn ({picture.why}). You can still animate.</p>;
  const say = isNew ? "This is how the new things will look. Once animated, their colours, sizes and shapes can't be changed."
    : "This is how everything will look. Once animated, colours, sizes and shapes can't be changed.";
  const alt = isNew ? "How the new things will look" : "Everything in your animation, in one picture";
  const animate = Math.max(0, picture.animateCredits), changed = picture.credits;
  const cost = changed <= 0 ? "" : animate <= 0 ? `The picture is included when you animate. If you change the plan instead, it costs ${creditsText(changed)}.`
    : animate < changed ? `This picture costs ${creditsText(animate)} when you animate, or ${creditsText(changed)} if you change the plan instead.` : `This picture costs ${creditsText(changed)}.`;
  return (
    <>
      <button type="button" className="v1-gate-pic" title="See it bigger" onClick={() => setBig(true)}><img src={picture.src} alt={alt} /><span className="v1-gate-pic-say">{say}</span></button>
      {cost && <p className="v1-gate-pic-note">{cost}</p>}
      {big && typeof document !== "undefined" && createPortal(
        <div className="v1-gate-big" role="dialog" aria-modal="true" aria-label="The picture" onClick={() => setBig(false)}>
          <figure><img src={picture.src} alt={alt} /><figcaption className="v1-gate-pic-say">{say}</figcaption></figure>
          <button type="button" className="v1-gate-big-close" aria-label="Close" onClick={() => setBig(false)}>{"×"}</button>
        </div>, document.body)}
    </>
  );
}
function GateCard({ credits, lines, notDrawn, colour, picture, busy, readOnly, onAnimate, onChange }: { credits: number; lines: string[]; notDrawn: string[]; colour: string | null; picture?: V1GatePicture; busy: boolean; readOnly: boolean; onAnimate: () => void; onChange: () => void }) {
  const drawing = picture?.state === "drawing";
  return (
    <div className="v1-card v1-versions v1-gate" data-v1-gate="" data-workspace-theme-exempt="">
      <div className="v1-gate-head"><span>Ready to animate</span><span className="v1-gate-cost">{creditsText(credits)}</span></div>
      {picture && <GatePictureBox picture={picture} />}
      {(lines.length > 0 || colour) && <ul className="v1-gate-lines">{colour && <li className="v1-gate-colour"><span className="v1-swatch" style={{ background: colour }} aria-hidden="true" />Stick figure: {colour.toUpperCase()}</li>}{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {notDrawn.length > 0 && <p className="v1-gate-not">Not drawn: {notDrawn.join(", ")}</p>}
      <div className="v1-actions" role="group" aria-label="Animate this plan">
        <button type="button" title={drawing ? "The first picture is being drawn" : "Make this animation"} disabled={readOnly || busy || drawing} onClick={onAnimate} className="v1-primary"><PlayIcon />Animate</button>
        <button type="button" title="Type what should be different" disabled={readOnly || busy} onClick={onChange}><PencilIcon size={14} />Change it</button>
      </div>
    </div>
  );
}

// (Nov 11, Arthur: ask when a real animator would) up to 3 short questions in ONE card, the first choice of each pre-picked, so one tap on
// Continue is enough; the answers go back as one message. The gate card's look.
const swatch = (o: string) => /^#[0-9a-f]{3,8}$/i.test(o.trim().split(/\s/)[0]) ? o.trim().split(/\s/)[0] : null;
function QuestionCard({ questions, busy, readOnly, onDone, onOwn }: { questions: { text: string; options: string[] }[]; busy: boolean; readOnly: boolean; onDone: (answers: string[]) => void; onOwn: () => void }) {
  const [picked, setPicked] = useState<number[]>(() => questions.map(() => 0));
  return (
    <div className="v1-card v1-versions v1-gate v1-question" data-v1-question="" data-workspace-theme-exempt="">
      {questions.map((q, qi) => (
        <div className="v1-q" key={qi} role="radiogroup" aria-label={q.text}>
          <span className="v1-q-text">{q.text}</span>
          <div className="v1-q-options">
            {q.options.map((o, oi) => (
              <button type="button" key={o} role="radio" aria-checked={picked[qi] === oi} className={picked[qi] === oi ? "v1-q-on" : ""} disabled={readOnly || busy}
                onClick={() => setPicked((p) => p.map((v, k) => (k === qi ? oi : v)))}>
                {swatch(o) && <span className="v1-swatch" style={{ background: swatch(o)! }} aria-hidden="true" />}{swatch(o) ? o.trim().split(/\s/).slice(1).join(" ") || o : o}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="v1-actions" role="group" aria-label="Answer">
        <button type="button" disabled={readOnly || busy} onClick={() => onDone(questions.map((q, qi) => `${q.text} ${q.options[picked[qi]].replace(/^#[0-9a-f]{3,8}\s+/i, "")}`))}>Continue</button>
        <button type="button" disabled={readOnly || busy} onClick={onOwn}><PencilIcon size={14} />Type your own</button>
      </div>
    </div>
  );
}

// (Nov 18, Arthur: "I always have to re-say everything word by word") copies one message's own words, exactly as written
function CopyButton({ text, end }: { text: string; end?: boolean }) {
  const [done, setDone] = useState(false);
  const shown = () => { setDone(true); setTimeout(() => setDone(false), 1500); };
  // (copied right inside the click - some app windows refuse the newer clipboard, and the click's permission runs out after a wait)
  const older = () => { try { const t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch { return false; } };
  const copy = () => { if (older()) shown(); else void navigator.clipboard?.writeText(text).then(shown, () => undefined); };
  return (
    <button type="button" className={`v1-copy ${end ? "v1-copy-end" : "v1-copy-start"}`} aria-label={done ? "Copied" : "Copy message"} title={done ? "Copied" : "Copy"} onClick={copy}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function V1AnimatorThread({ state, readOnly, onRevealed, onUndo, onRedo, onCancel, onAnimate, onChangePlan, onAnswer }: Props) {
  const latestResult = state.lines.reduce<number | null>((last, line) => line.kind === "result" ? line.id : last, null);
  // ("finishing" = the bar at 100% for a moment before the result appears; nothing to cancel any more)
  const animating = state.busy === "running" || state.busy === "cancelling" || state.busy === "finishing";
  return (
    <>
      {state.lines.map((line) => {
        if (line.kind === "user") return <Fragment key={line.id}><div className="ai-animator-message v1-user" data-ai-user-message={line.id}>{line.text}</div><CopyButton text={line.text} end /></Fragment>;
        if (line.kind === "ai" && line.tone === "error") return <Fragment key={line.id}><div className="ai-animator-message v1-error" role="alert">{line.text}</div><CopyButton text={line.text} /></Fragment>;
        if (line.kind === "ai") {
          const id = v1ReplyId(line.id);
          // (Nov 2) the panel's own paragraph reply: short <p> paragraphs, the same typewriter as the shared Reply, no markdown marks
          return <Fragment key={line.id}><ParagraphReply id={id} text={line.text} animate={state.reveal.includes(line.id)} onRevealComplete={onRevealed} /><CopyButton text={line.text} /></Fragment>;
        }
        if (line.kind === "work") return <WorkLine key={line.id} line={line} />;
        if (line.kind === "note") return <div className="ai-animator-message v1-note" role="status" key={line.id}>{line.text}</div>;
        if (line.kind === "question") return line.answered ? null : <QuestionCard key={line.id} questions={line.questions} busy={Boolean(state.busy)} readOnly={readOnly} onDone={(a) => onAnswer?.(a)} onOwn={() => onChangePlan?.()} />;
        if (line.kind === "gate") return line.state === "waiting" ? <GateCard key={line.id} credits={line.credits} lines={line.lines} notDrawn={line.notDrawn} colour={line.colour} picture={line.picture} busy={Boolean(state.busy)} readOnly={readOnly} onAnimate={() => onAnimate?.(line.id)} onChange={() => onChangePlan?.()} /> : null;
        return <ResultLine key={line.id} line={line} isLatest={line.id === latestResult} state={state} readOnly={readOnly} onUndo={onUndo} onRedo={onRedo} />;
      })}
      {/* (Nov 2, Arthur: never interrupt the user — a version waiting for a busy canvas is placed by itself, no button) */}
      {/* (Nov 17, Part 2) while he answers: the changing words, then his own words as he writes them */}
      {state.busy === "thinking" && state.thinking && <ThinkingLine words={state.thinking.words} />}
      {state.busy === "thinking" && state.thinking?.say.trim() ? <LiveWords text={state.thinking.say} /> : null}
      {/* (Nov 17) the word above the bar = the engine's real stage (Planning the moves, Animating, Drawing ..., Putting it on the canvas) */}
      {animating && <AnimatingCard progress={state.progress} cancelling={state.busy === "cancelling"} readOnly={readOnly || state.busy === "finishing"} onCancel={onCancel} word={state.stage ?? v1WorkWord(state.snapshot)} />}
      {/* (Arthur, 2026-10-08: the AI Animator and the Help Assistant show activity exactly alike — the same component.) */}
      {state.activity && !animating && !(state.busy === "thinking" && state.thinking) && <div className="v1-activity" aria-label="AI Animator status"><AssistantActivity label={state.activity} /></div>}
    </>
  );
}
