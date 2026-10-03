"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProjectRecoveryPromptProps = {
  mode: "checking" | "valid" | "invalid";
  projectName?: string;
  lastMeaningfulEditAt?: string;
  busyAction?: "recover" | "discard" | null;
  message?: string | null;
  allowContinueHome?: boolean;
  onRecover?: () => void;
  onDiscard?: () => void;
  onContinueHome?: () => void;
};

const formatRecoveryTime = (value?: string) => {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export function ProjectRecoveryPrompt({
  mode,
  projectName,
  lastMeaningfulEditAt,
  busyAction = null,
  message = null,
  allowContinueHome = false,
  onRecover,
  onDiscard,
  onContinueHome,
}: ProjectRecoveryPromptProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const recoverButtonRef = useRef<HTMLButtonElement | null>(null);
  const discardButtonRef = useRef<HTMLButtonElement | null>(null);
  const busy = busyAction !== null;
  const recoveryTime = useMemo(() => formatRecoveryTime(lastMeaningfulEditAt), [lastMeaningfulEditAt]);

  useEffect(() => {
    if (mode === "checking") return;
    const target = mode === "valid" ? recoverButtonRef.current : discardButtonRef.current;
    target?.focus();
  }, [mode]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || mode === "checking") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [confirmingDiscard, mode, allowContinueHome]);

  if (mode === "checking") {
    return (
      <main className="recovery-shell" data-project-recovery-prompt="checking">
        <style>{recoveryStyles}</style>
        <div className="recovery-loading" role="status" aria-live="polite">
          <span className="recovery-spinner" aria-hidden="true" />
          <span>Checking for unsaved work…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="recovery-shell" data-project-recovery-prompt={mode}>
      <style>{recoveryStyles}</style>
      <div
        ref={dialogRef}
        className="recovery-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-description"
      >
        <div className="recovery-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M7 9.5h18v15H7z" stroke="currentColor" strokeWidth="2" />
            <path d="M10 6.5h12v6H10zM11 19h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="recovery-eyebrow">Local recovery</div>
        <h1 id="recovery-title">Unsaved work found</h1>
        <p id="recovery-description" className="recovery-description">
          {mode === "valid"
            ? "Diamond Animator found a verified local safety backup. Your saved project will not change unless you choose to save after recovery."
            : "Diamond Animator found a local safety backup, but it cannot be opened safely."}
        </p>

        <div className="recovery-details">
          <div>
            <span>Project</span>
            <strong>{projectName?.trim() || "Unknown project"}</strong>
          </div>
          <div>
            <span>Last protected</span>
            <strong>{recoveryTime}</strong>
          </div>
        </div>

        {message ? <p className="recovery-message" role="status">{message}</p> : null}

        {!confirmingDiscard ? (
          <div className="recovery-actions">
            <button
              ref={recoverButtonRef}
              type="button"
              className="recovery-primary"
              disabled={mode !== "valid" || busy}
              onClick={onRecover}
            >
              {busyAction === "recover" ? "Opening recovered work…" : "Recover Work"}
            </button>
            <button
              ref={discardButtonRef}
              type="button"
              className="recovery-secondary recovery-danger"
              disabled={busy}
              onClick={() => setConfirmingDiscard(true)}
            >
              Discard Draft
            </button>
          </div>
        ) : (
          <div className="recovery-confirm" role="alert">
            <strong>Discard this local safety backup?</strong>
            <span>Your officially saved projects will not be deleted.</span>
            <div className="recovery-confirm-actions">
              <button type="button" className="recovery-secondary" disabled={busy} onClick={() => setConfirmingDiscard(false)}>
                Cancel
              </button>
              <button ref={discardButtonRef} type="button" className="recovery-danger-confirm" disabled={busy} onClick={onDiscard}>
                {busyAction === "discard" ? "Discarding…" : "Discard Draft"}
              </button>
            </div>
          </div>
        )}

        {allowContinueHome ? (
          <button type="button" className="recovery-continue" disabled={busy} onClick={onContinueHome}>
            Continue to Home without deleting
          </button>
        ) : null}

        <p className="recovery-footnote">Recovery is stored only in this browser profile.</p>
      </div>
    </main>
  );
}

const recoveryStyles = `
  .recovery-shell {
    min-height: 100vh;
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    box-sizing: border-box;
    padding: 28px;
    color: #f6f9ff;
    background: radial-gradient(ellipse at 50% 30%, rgba(9, 33, 65, 0.16), transparent 50%), #030914;
  }
  .recovery-card {
    width: min(600px, 100%);
    position: relative;
    box-sizing: border-box;
    padding: 36px;
    border: 1px solid #163058;
    border-radius: 16px;
    background: #071120;
  }
  .recovery-mark {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    margin-bottom: 22px;
    border-radius: 12px;
    color: #8fabd0;
    background: #030914;
    border: 1px solid #163058;
  }
  .recovery-mark svg { width: 26px; height: 26px; }
  .recovery-eyebrow {
    margin-bottom: 8px;
    color: #7895bc;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .recovery-card h1 { margin: 0; color: #f6f9ff; font-size: clamp(28px, 5vw, 38px); font-weight: 800; line-height: 1.08; letter-spacing: -0.02em; }
  .recovery-description { margin: 14px 0 0; max-width: 52ch; color: #a8bddd; font-size: 15px; line-height: 1.6; }
  .recovery-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 26px;
  }
  .recovery-details > div {
    min-width: 0;
    padding: 14px 16px;
    border-radius: 12px;
    background: #030914;
    border: 1px solid #163058;
  }
  .recovery-details span { display: block; margin-bottom: 6px; color: #7895bc; font-size: 11px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase; }
  .recovery-details strong { display: block; overflow-wrap: anywhere; color: #f6f9ff; font-size: 14px; line-height: 1.35; }
  .recovery-message { margin: 18px 0 0; padding: 12px 14px; border-radius: 10px; color: #f3d89c; background: #030914; border: 1px solid rgba(255, 190, 65, 0.35); font-size: 13px; line-height: 1.5; }
  .recovery-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 26px; }
  .recovery-actions button, .recovery-confirm-actions button, .recovery-continue {
    min-height: 46px;
    padding: 11px 17px;
    border-radius: 10px;
    font: inherit;
    font-size: 14px;
    font-weight: 750;
    cursor: pointer;
    transition: none;
    box-shadow: none;
  }
  .recovery-actions button:focus-visible, .recovery-confirm-actions button:focus-visible, .recovery-continue:focus-visible { outline: 2px solid #66c7ff; outline-offset: 3px; }
  .recovery-actions button:disabled, .recovery-confirm-actions button:disabled, .recovery-continue:disabled { cursor: not-allowed; opacity: 0.45; }
  .recovery-primary { color: #ffffff; background: #0f2a52; border: 1px solid #3a6aa3; }
  .recovery-secondary { color: #c9d6ea; background: #071120; border: 1px solid #244267; }
  .recovery-continue { width: 100%; margin-top: 12px; color: #c9d6ea; background: #071120; border: 1px solid #244267; }
  .recovery-primary:hover:not(:disabled), .recovery-secondary:hover:not(:disabled), .recovery-continue:hover:not(:disabled) { color: #ffffff; background: #0066ff; border-color: #0066ff; }
  .recovery-danger, .recovery-danger-confirm { color: #ff8a95; background: #071120; border: 1px solid rgba(255, 138, 149, 0.35); }
  .recovery-danger:hover:not(:disabled), .recovery-danger-confirm:hover:not(:disabled) { color: #ffffff; background: #d23a52; border-color: #d23a52; }
  .recovery-confirm { margin-top: 24px; padding: 16px; border-radius: 12px; background: #030914; border: 1px solid rgba(255, 138, 149, 0.35); }
  .recovery-confirm > strong, .recovery-confirm > span { display: block; }
  .recovery-confirm > strong { color: #f6f9ff; font-size: 15px; }
  .recovery-confirm > span { margin-top: 6px; color: #a8bddd; font-size: 13px; line-height: 1.45; }
  .recovery-confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
  .recovery-footnote { margin: 22px 0 0; color: #8fabd0; font-size: 12px; text-align: center; }
  .recovery-loading { display: flex; align-items: center; gap: 12px; color: #a8bddd; font-size: 14px; }
  .recovery-spinner { width: 14px; height: 14px; box-sizing: border-box; border: 2px solid #3a6aa3; border-radius: 999px; }
  @media (max-width: 640px) {
    .recovery-shell { padding: 16px; align-items: center; }
    .recovery-card { padding: 26px 20px; }
    .recovery-details, .recovery-actions { grid-template-columns: 1fr; }
    .recovery-mark { width: 44px; height: 44px; margin-bottom: 18px; }
    .recovery-confirm-actions { flex-direction: column-reverse; }
    .recovery-confirm-actions button { width: 100%; }
  }
`;
