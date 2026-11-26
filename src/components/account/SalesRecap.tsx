"use client";

import { useEffect, useState } from "react";
import { betaDeadlineLine, PROMISES, PROOF_TITLE, VALUE_BULLETS, VALUE_TITLE } from "@/src/lib/account/salesCopy";
import { offerLine, type ShownOffer } from "@/src/lib/account/offerDisplay";
import styles from "./SalesRecap.module.css";

// SPEC-0031: the plans page's mini sales page under the plans: what you get (two-part bullets), what animators say (only real
// quotes Arthur approved; nothing when there are none) and the promises. Words live in salesCopy.ts.

type Proof = { id: string; name: string; stars: number; quote: string; disclosure?: string | null };

/** `compact` = no title, small; `wide` = 3 columns on a computer (the trial-ended screen). */
export function ValueBullets({ compact = false, wide = false }: { compact?: boolean; wide?: boolean }) {
  return (
    <section className={styles.value} data-compact={compact || undefined} data-wide={wide || undefined} aria-labelledby={compact ? undefined : "value-title"}>
      {!compact && <h2 id="value-title" className={styles.title}>{VALUE_TITLE}</h2>}
      <ul className={styles.bullets}>
        {VALUE_BULLETS.map((bullet) => <li key={bullet.lead}><strong>{bullet.lead}</strong> <span>{bullet.text}</span></li>)}
      </ul>
    </section>
  );
}

function ProofStrip() {
  const [proof, setProof] = useState<Proof[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/account/testimonials?proof=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { proof?: Proof[] } | null) => { if (alive && Array.isArray(body?.proof)) setProof(body.proof.slice(0, 3)); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!proof.length) return null;
  return (
    <section className={styles.proof} aria-labelledby="proof-title">
      <h2 id="proof-title" className={styles.title}>{PROOF_TITLE}</h2>
      <ul className={styles.quotes}>
        {proof.map((one) => (
          <li key={one.id} className={styles.quote}>
            <span className={styles.stars} aria-label={`${one.stars} out of 5 stars`}>{"★".repeat(one.stars)}</span>
            <q>{one.quote}</q>
            <span className={styles.who}><span className={styles.initial} aria-hidden="true">{one.name.charAt(0)}</span>{one.name}</span>
            {one.disclosure && <span className={styles.disclosure}>{one.disclosure}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Promises() {
  return (
    <ul className={styles.promises}>
      {PROMISES.map((promise) => <li key={promise.title}><strong>{promise.title}</strong><span>{promise.text}</span></li>)}
    </ul>
  );
}

export function SalesRecap() {
  return <div className={styles.recap}><ValueBullets /><ProofStrip /><Promises /></div>;
}

/** "Your beta code FIRSTDIAMOND is saved: 25% off your first year." + (during the trial) when the beta price disappears. */
export function SavedCodeLine({ code, offer, trialEndsAt, className }: { code: string; offer: ShownOffer; trialEndsAt?: number | null; className?: string }) {
  return <p className={`${styles.saved}${className ? ` ${className}` : ""}`}><span aria-hidden="true">◆</span> Your {offer === "first50" ? "beta" : "YouTube"} code <strong>{code}</strong> is saved: {offerLine(offer)}
    {offer === "first50" && trialEndsAt ? <> <strong>{betaDeadlineLine(trialEndsAt)}</strong></> : null}</p>;
}
