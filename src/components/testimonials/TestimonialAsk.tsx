"use client";

// SPEC-0029 (dad, Nov 26): the ask at the happy moment. "Loving it? ★★★★★" — a star opens one line of words and (for 4-5
// stars) the one box that lets us feature them. Short and skippable: "Not now" (or the card's X) counts as a skip; after
// an answer or two skips it never comes back (the server remembers it per account). A happy person with no profile
// photo then gets "Add a photo" (the same picture the Profile page saves).
import { useEffect, useRef, useState, type ChangeEvent, type MutableRefObject } from "react";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import { saveProfilePicture } from "@/src/lib/account/profilePicture";
import { TESTIMONIAL_CONSENT_WORDS, TESTIMONIAL_FEATURE_MIN_STARS, TESTIMONIAL_TEXT_MAX, type TestimonialWhere } from "@/src/lib/account/testimonials";
import styles from "./TestimonialAsk.module.css";

type Step = "checking" | "gone" | "stars" | "form" | "sending" | "photo" | "thanks";
const API = "/api/account/testimonials";
const post = (body: unknown) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });

export function TestimonialAsk({ where, checked = false, skipRef, onGone }: {
  where: TestimonialWhere;
  /** The caller already asked the server and the ask is due (skips the check). */
  checked?: boolean;
  /** The card's own X calls this, so closing the card counts as one skip. */
  skipRef?: MutableRefObject<(() => void) | null>;
  /** Called when there is nothing (more) to show. */
  onGone?: () => void;
}) {
  const account = useAccountSession();
  const [step, setStep] = useState<Step>(checked ? "stars" : "checking");
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [featureOk, setFeatureOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const goneRef = useRef(onGone);
  useEffect(() => { goneRef.current = onGone; });

  useEffect(() => {
    if (checked) return;
    let alive = true;
    fetch(`${API}?ask=${where}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { ask?: boolean } | null) => { if (alive) setStep(body?.ask ? "stars" : "gone"); })
      .catch(() => { if (alive) setStep("gone"); });
    return () => { alive = false; };
  }, [checked, where]);

  // the export ask is shown once ever (the moment it is on screen)
  useEffect(() => { if (where === "export" && step === "stars") void post({ seen: "export" }).catch(() => {}); }, [where, step]);
  useEffect(() => { if (step === "gone") goneRef.current?.(); }, [step]);
  useEffect(() => {
    if (step !== "thanks") return;
    const t = window.setTimeout(() => setStep("gone"), 2600);
    return () => window.clearTimeout(t);
  }, [step]);

  const skip = () => { void post({ skip: true, where }).catch(() => {}); setStep("gone"); };
  const open = step === "stars" || step === "form";
  useEffect(() => {
    if (!skipRef) return;
    skipRef.current = open ? skip : null;
    return () => { skipRef.current = null; };
  });

  const send = async () => {
    setStep("sending");
    setError(null);
    try {
      const response = await post({ stars, text, featureOk: stars >= TESTIMONIAL_FEATURE_MIN_STARS && featureOk, where });
      const body = await response.json().catch(() => null) as { photoNudge?: boolean; error?: string } | null;
      if (!response.ok) { setError(body?.error ?? "That couldn't be sent. Try again."); setStep("form"); return; }
      setStep(body?.photoNudge && !account?.image ? "photo" : "thanks");
    } catch { setError("We couldn't reach Diamond Animator. Try again."); setStep("form"); }
  };

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    try {
      if (await saveProfilePicture(file)) setStep("thanks");
      else setError("That picture couldn't be saved. Try a different one.");
    } catch { setError("That picture couldn't be read. Try a different one."); }
  };

  if (step === "checking" || step === "gone") return null;
  if (step === "thanks") return <div className={styles.ask} role="status"><p className={styles.thanks}>Thank you! That means a lot to us.</p></div>;
  if (step === "photo") return (
    <div className={styles.ask}>
      <p className={styles.thanks}>Thank you! Add a photo so people can see who said it.</p>
      <div className={styles.row}>
        <button type="button" className={styles.primary} onClick={() => fileRef.current?.click()}>Add a photo</button>
        <button type="button" className={styles.quiet} onClick={() => setStep("thanks")}>No thanks</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e)} />
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
  const happy = stars >= TESTIMONIAL_FEATURE_MIN_STARS;
  return (
    <div className={styles.ask}>
      <div className={styles.starsRow}>
        <span className={styles.question}>{step === "stars" ? "Loving it?" : happy ? "Thanks! What do you like?" : "Thanks! What could be better?"}</span>
        <span className={styles.stars} role="group" aria-label="Rate Diamond Animator">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={styles.star} data-on={n <= stars ? "true" : undefined} aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={n === stars} onClick={() => { setStars(n); setStep((s) => (s === "stars" ? "form" : s)); }}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8Z" /></svg>
            </button>
          ))}
        </span>
        {step === "stars" && <button type="button" className={styles.quiet} onClick={skip}>Not now</button>}
      </div>
      {step !== "stars" && (
        <>
          <input className={styles.input} value={text} maxLength={TESTIMONIAL_TEXT_MAX} onChange={(e) => setText(e.target.value)}
            placeholder={happy ? "One sentence (optional)" : "Tell us in a few words (optional)"} aria-label="Your words" />
          {happy && (
            <label className={styles.box}>
              <input type="checkbox" checked={featureOk} onChange={(e) => setFeatureOk(e.target.checked)} />
              <span>{TESTIMONIAL_CONSENT_WORDS}</span>
            </label>
          )}
          <div className={styles.row}>
            <button type="button" className={styles.primary} disabled={step === "sending"} onClick={() => void send()}>{step === "sending" ? "Sending…" : "Send"}</button>
            <button type="button" className={styles.quiet} disabled={step === "sending"} onClick={skip}>Not now</button>
          </div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </>
      )}
    </div>
  );
}
