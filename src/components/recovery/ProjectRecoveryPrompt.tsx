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
      <div className="recovery-orb recovery-orb-one" aria-hidden="true" />
      <div className="recovery-orb recovery-orb-two" aria-hidden="true" />
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
    padding: 28px;
    color: #f6f9ff;
    background:
      radial-gradient(circle at 18% 14%, rgba(41, 112, 229, 0.18), transparent 34%),
      radial-gradient(circle at 82% 86%, rgba(108, 63, 196, 0.14), transparent 32%),
      linear-gradient(160deg, #07111d 0%, #0a101a 48%, #090d16 100%);
  }
  .recovery-card {
    width: min(620px, 100%);
    position: relative;
    z-index: 2;
    box-sizing: border-box;
    padding: 42px;
    border: 1px solid rgba(138, 170, 222, 0.22);
    border-radius: 24px;
    background: linear-gradient(160deg, rgba(19, 29, 45, 0.97), rgba(11, 18, 30, 0.98));
    box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48), inset 0 1px rgba(255, 255, 255, 0.04);
  }
  .recovery-mark {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    margin-bottom: 24px;
    border-radius: 16px;
    color: #83b7ff;
    background: linear-gradient(145deg, rgba(61, 139, 255, 0.18), rgba(74, 99, 191, 0.08));
    border: 1px solid rgba(106, 164, 255, 0.28);
  }
  .recovery-mark svg { width: 30px; height: 30px; }
  .recovery-eyebrow {
    margin-bottom: 8px;
    color: #83b7ff;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  .recovery-card h1 { margin: 0; font-size: clamp(29px, 5vw, 42px); line-height: 1.04; letter-spacing: -0.035em; }
  .recovery-description { margin: 16px 0 0; max-width: 52ch; color: rgba(220, 229, 244, 0.72); font-size: 15px; line-height: 1.65; }
  .recovery-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 28px;
  }
  .recovery-details > div {
    min-width: 0;
    padding: 15px 16px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.075);
  }
  .recovery-details span { display: block; margin-bottom: 6px; color: rgba(184, 198, 220, 0.6); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
  .recovery-details strong { display: block; overflow-wrap: anywhere; color: rgba(247, 250, 255, 0.92); font-size: 14px; line-height: 1.35; }
  .recovery-message { margin: 18px 0 0; padding: 12px 14px; border-radius: 12px; color: #ffd9b0; background: rgba(126, 74, 22, 0.22); border: 1px solid rgba(233, 157, 75, 0.24); font-size: 13px; line-height: 1.5; }
  .recovery-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 28px; }
  .recovery-actions button, .recovery-confirm-actions button, .recovery-continue {
    min-height: 48px;
    padding: 12px 17px;
    border-radius: 12px;
    font: inherit;
    font-size: 14px;
    font-weight: 750;
    cursor: pointer;
    transition: transform 150ms ease, border-color 150ms ease, background 150ms ease, opacity 150ms ease;
  }
  .recovery-actions button:hover:not(:disabled), .recovery-confirm-actions button:hover:not(:disabled), .recovery-continue:hover:not(:disabled) { transform: translateY(-1px); }
  .recovery-actions button:focus-visible, .recovery-confirm-actions button:focus-visible, .recovery-continue:focus-visible { outline: 3px solid rgba(131, 183, 255, 0.52); outline-offset: 3px; }
  .recovery-actions button:disabled, .recovery-confirm-actions button:disabled, .recovery-continue:disabled { cursor: not-allowed; opacity: 0.45; }
  .recovery-primary { color: #07101b; background: linear-gradient(180deg, #99c7ff, #68a9ff); border: 1px solid #abd1ff; box-shadow: 0 9px 22px rgba(45, 126, 235, 0.22); }
  .recovery-secondary { color: rgba(245, 248, 255, 0.9); background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.12); }
  .recovery-danger { color: #ffc9c9; }
  .recovery-confirm { margin-top: 24px; padding: 16px; border-radius: 14px; background: rgba(111, 30, 38, 0.18); border: 1px solid rgba(238, 102, 116, 0.24); }
  .recovery-confirm > strong, .recovery-confirm > span { display: block; }
  .recovery-confirm > strong { color: #ffe5e7; font-size: 15px; }
  .recovery-confirm > span { margin-top: 6px; color: rgba(255, 220, 224, 0.68); font-size: 13px; line-height: 1.45; }
  .recovery-confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
  .recovery-danger-confirm { color: white; background: #b93b4a; border: 1px solid #dc6875; }
  .recovery-continue { width: 100%; margin-top: 12px; color: #bcd7ff; background: transparent; border: 1px solid rgba(115, 165, 237, 0.22); }
  .recovery-footnote { margin: 22px 0 0; color: rgba(173, 188, 211, 0.48); font-size: 12px; text-align: center; }
  .recovery-loading { z-index: 2; display: flex; align-items: center; gap: 12px; color: rgba(224, 234, 248, 0.78); font-size: 14px; }
  .recovery-spinner { width: 18px; height: 18px; border: 2px solid rgba(131, 183, 255, 0.22); border-top-color: #83b7ff; border-radius: 999px; animation: recovery-spin 800ms linear infinite; }
  .recovery-orb { position: absolute; width: 420px; height: 420px; border-radius: 999px; filter: blur(80px); opacity: 0.12; }
  .recovery-orb-one { left: -180px; top: -210px; background: #3586ff; }
  .recovery-orb-two { right: -210px; bottom: -230px; background: #7558e8; }
  @keyframes recovery-spin { to { transform: rotate(360deg); } }
  @media (max-width: 640px) {
    .recovery-shell { padding: 16px; align-items: center; }
    .recovery-card { padding: 28px 22px; border-radius: 19px; }
    .recovery-orb { display: none; }
    .recovery-details, .recovery-actions { grid-template-columns: 1fr; }
    .recovery-mark { width: 48px; height: 48px; margin-bottom: 20px; }
    .recovery-confirm-actions { flex-direction: column-reverse; }
    .recovery-confirm-actions button { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .recovery-actions button, .recovery-confirm-actions button, .recovery-continue { transition: none; }
    .recovery-spinner { animation-duration: 1.8s; }
  }
`;
