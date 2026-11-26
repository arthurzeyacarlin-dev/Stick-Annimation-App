"use client";

// SPEC-0029: on the Profile page, "Your testimonial" with Remove, so anyone can take it back (it leaves the Wall of Love at the
// next export). Shows nothing when they never left one.
import { useEffect, useState } from "react";
import styles from "@/src/components/account/AccountProfileScreen.module.css";

type Mine = { stars: number; text: string; featureOk: boolean };

export function OwnTestimonial() {
  const [mine, setMine] = useState<Mine | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/account/testimonials?mine=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { testimonial?: Mine | null } | null) => { if (alive) setMine(body?.testimonial ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const remove = async () => {
    setBusy(true);
    const ok = await fetch("/api/account/testimonials", { method: "DELETE" }).then((r) => r.ok).catch(() => false);
    setBusy(false);
    if (ok) { setMine(null); setNote("Your testimonial was removed."); } else setNote("That couldn't be removed. Try again.");
  };
  if (!mine) return note ? <p role="status" className={styles.ok}>{note}</p> : null;
  return (
    <div className={styles.label}>
      Your testimonial
      <span className={styles.readOnly}>{"★".repeat(mine.stars)}{mine.text ? ` “${mine.text}”` : ""}{mine.featureOk ? " · OK to feature" : " · private"}</span>
      <button type="button" className={styles.button} style={{ justifySelf: "start" }} disabled={busy} onClick={() => void remove()}>{busy ? "Removing…" : "Remove"}</button>
      {note && <p role="alert" className={styles.error}>{note}</p>}
    </div>
  );
}
