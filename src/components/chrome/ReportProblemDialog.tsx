"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import chrome from "./appChrome.module.css";
import styles from "./ReportProblemDialog.module.css";
import { CloseButton } from "@/src/components/ui/CloseButton";
import {
  PROBLEM_REPORT_PICK_MAX_BYTES, PROBLEM_REPORT_PICK_TYPES, PROBLEM_REPORT_SCREENS, PROBLEM_REPORT_SCREENSHOT_MAX_BYTES,
  PROBLEM_REPORT_SCREENSHOT_MAX_SIDE, PROBLEM_REPORT_TEXT_MAX, type ProblemReportScreen,
} from "@/src/lib/account/problemReports";

// SPEC-0020 Phase 6: "Report a Problem" (side menu → Support). What happened + where + an optional screenshot.
// The screenshot is shrunk here (≤ 1600 px, JPEG) so it stays small; the server checks everything again.
const THANKS = "Thanks — Arthur will read this.";

/** A first guess for "Where were you?" from the page the menu was opened on. */
function guessScreen(pathname: string): ProblemReportScreen {
  if (pathname === "/") return "home";
  if (/^\/(account|plans|credits|settings)(\/|$)/.test(pathname)) return "account-plans";
  return "other";
}

const dataUrlBytes = (url: string) => Math.floor((url.length - url.indexOf(",") - 1) * 3 / 4);

/** Shrinks a picture to at most 1600 px on its long side and saves it as a JPEG under ~1 MB. */
async function shrinkScreenshot(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PROBLEM_REPORT_SCREENSHOT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("screenshot_unreadable");
      // JPEG has no see-through parts: paint the app's page color behind transparent screenshots.
      context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--da-page").trim() || "black";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.85, 0.72, 0.6]) {
        const url = canvas.toDataURL("image/jpeg", quality);
        if (url.startsWith("data:image/jpeg;base64,") && dataUrlBytes(url) <= PROBLEM_REPORT_SCREENSHOT_MAX_BYTES) return url;
      }
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    throw new Error("screenshot_too_big");
  } finally {
    bitmap.close();
  }
}

export function ReportProblemDialog({ onClose }: { onClose: () => void }) {
  const textId = useId();
  const screenId = useId();
  const fileId = useId();
  const counterId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [screen, setScreen] = useState<ProblemReportScreen>(() => typeof window === "undefined" ? "other" : guessScreen(window.location.pathname));
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => { textRef.current?.focus({ preventScroll: true }); }, []);
  // After sending, the thank-you line shows for a moment and then the window closes by itself.
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(timer);
  }, [sent, onClose]);

  const pickPicture = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!(PROBLEM_REPORT_PICK_TYPES as readonly string[]).includes(file.type)) {
      setError("The screenshot must be a PNG, JPEG or WebP picture.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > PROBLEM_REPORT_PICK_MAX_BYTES) {
      setError("That picture is bigger than 4 MB. Please choose a smaller one.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setPictureBusy(true);
    try { setScreenshot(await shrinkScreenshot(file)); }
    catch {
      setScreenshot(null);
      setError("That picture couldn't be read. Try a different one, or send the report without it.");
      if (fileRef.current) fileRef.current.value = "";
    }
    setPictureBusy(false);
  };

  const removePicture = () => {
    setScreenshot(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || pictureBusy) return;
    setError(null);
    if (!text.trim()) {
      setError("Please tell us what happened.");
      textRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/account/problem-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, screen, screenshot }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        setError(typeof body?.error === "string" ? body.error : "Your report couldn't be sent. Try again in a moment.");
        setSending(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Your report couldn't be sent. Check your internet and try again.");
    }
    setSending(false);
  };

  return (
    <div onClick={onClose} className={chrome.modalScrim}>
      <div role="dialog" aria-modal="true" aria-labelledby={`${textId}-title`} className={`darkScroll ${chrome.modal} ${styles.dialog}`} onClick={(event) => event.stopPropagation()}>
        <div className={chrome.modalHead}>
          <div className={chrome.modalTitleGroup}>
            <div className={chrome.sectionLabel}>Support</div>
            <h2 id={`${textId}-title`} className={chrome.modalTitle}>Report a Problem</h2>
          </div>
          <CloseButton label="Close report a problem" onClick={onClose} />
        </div>

        {sent ? (
          <p role="status" className={styles.thanks}>{THANKS}</p>
        ) : (
          <form className={styles.form} onSubmit={(event) => void send(event)} noValidate>
            <div className={styles.field}>
              <label htmlFor={textId} className={styles.label}>What happened?</label>
              <textarea
                ref={textRef}
                id={textId}
                className={styles.textarea}
                value={text}
                maxLength={PROBLEM_REPORT_TEXT_MAX}
                required
                rows={6}
                aria-describedby={counterId}
                placeholder="Tell us what you were doing and what went wrong."
                onChange={(event) => setText(event.target.value)}
              />
              <span id={counterId} className={styles.counter}>{text.length.toLocaleString("en-US")} / {PROBLEM_REPORT_TEXT_MAX.toLocaleString("en-US")}</span>
            </div>

            <div className={styles.field}>
              <label htmlFor={screenId} className={styles.label}>Where were you?</label>
              <select id={screenId} className={styles.select} value={screen} onChange={(event) => setScreen(event.target.value as ProblemReportScreen)}>
                {PROBLEM_REPORT_SCREENS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Screenshot <span className={styles.optional}>(optional)</span></span>
              <input ref={fileRef} id={fileId} type="file" tabIndex={-1} aria-label="Screenshot file" accept={PROBLEM_REPORT_PICK_TYPES.join(",")} className={styles.fileInput}
                onChange={(event) => void pickPicture(event.target.files?.[0])} />
              <div className={styles.pictureRow}>
                <button type="button" className={styles.button} disabled={pictureBusy || sending} onClick={() => fileRef.current?.click()}>
                  {pictureBusy ? "Getting the picture ready" : screenshot ? "Choose another picture" : "Add a screenshot"}
                </button>
                {screenshot && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL preview */}
                    <img src={screenshot} alt="Screenshot to send" className={styles.preview} />
                    <button type="button" className={styles.button} onClick={removePicture}>Remove</button>
                  </>
                )}
              </div>
              <small className={styles.hint}>PNG, JPEG or WebP, up to 4 MB.</small>
            </div>

            {error && <p role="alert" className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={sending || pictureBusy}>{sending ? "Sending" : "Send report"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
