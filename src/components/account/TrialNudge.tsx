"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AccountPlanStatus } from "@/src/lib/account/plans";
import { dueTrialNudge, isTrialNudgeStage, type TrialNudgeStage } from "@/src/lib/account/trialNudges";
import { betaReservedCopy, trialNudgeCopy, UNLOCK_LINE } from "@/src/lib/account/salesCopy";
import { readAccountJson, writeAccountJson } from "@/src/lib/account/accountDataClient";
import { CloseButton } from "@/src/components/ui/CloseButton";
import { useSavedOffer } from "./offerCode";
import { SavedCodeLine } from "./SalesRecap";
import { ACCOUNT_PLAN_CHANGED_EVENT } from "./useAccountPlan";
import styles from "./TrialNudge.module.css";

// SPEC-0031 (dad, Nov 26): a friendly card as the free trial ends (3 days left, last day, credits running low, credits used up).
// Each stage shows ONCE per account (remembered in the account's preferences, so another phone doesn't show it again). It
// floats bottom-left over the page (nothing moves, the canvas never resizes) and is never shown on the plans page itself.
// Dad, Nov 26 11:27 (fear of loss, and true): a trial account that has the beta code also gets a slim bar in the same place
// while no card is open: "Your beta price is reserved... It disappears when your free trial ends in N days. Lock it in".
// Closing the bar hides it for this visit (this tab); it comes back next time, stronger in the last 3 days.
const SEEN_KEY = "trial-nudges";
const HIDDEN_ON = ["/status", "/testimonials", "/reset-password", "/reports"];
// (Nov 26, dad: the beta lock-in "bold and upfront") on Home and Plans the beta bar is a wide banner at the top; elsewhere it
// stays the slim bar; in the editor it steps aside (it covered the timeline's controls). Only the bar, never the trial cards.
const TOP_BANNER_ON = new Set(["/", "/plans"]);
const READ_EVERY_MS = 5 * 60_000;
const BAR_CLOSED_KEY = "diamond.betaBar.closed";
type Seen = { schema: "trial-nudges/v1"; seen: TrialNudgeStage[] };

async function readSeen(): Promise<{ revision: number; seen: TrialNudgeStage[] }> {
  const record = await readAccountJson<Partial<Seen>>("preferences", SEEN_KEY);
  const seen = Array.isArray(record?.value?.seen) ? record.value.seen.filter(isTrialNudgeStage) : [];
  return { revision: record?.revision ?? 0, seen };
}

export function TrialNudge() {
  const pathname = usePathname() ?? "/";
  const [status, setStatus] = useState<AccountPlanStatus | null>(null);
  const [shown, setShown] = useState<TrialNudgeStage | null>(null);
  const { saved } = useSavedOffer();
  const [barClosed, setBarClosed] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => { try { setBarClosed(window.sessionStorage.getItem(BAR_CLOSED_KEY) === "1"); } catch { setBarClosed(false); } }, 0); return () => window.clearTimeout(timer); }, []);

  // The plan, read now, when it changes, and every few minutes (the credits counter keeps its own faster check).
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.hidden) return;
      fetch("/api/account/plan", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { status?: AccountPlanStatus } | null) => { if (alive && body?.status) setStatus(body.status); })
        .catch(() => undefined);
    };
    const first = window.setTimeout(read, 1500);
    const timer = window.setInterval(read, READ_EVERY_MS);
    window.addEventListener(ACCOUNT_PLAN_CHANGED_EVENT, read);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener(ACCOUNT_PLAN_CHANGED_EVENT, read); };
  }, []);

  // A stage that is due and not seen yet: shown, and saved as seen at once (so a reload or another device never repeats it).
  useEffect(() => {
    if (!status || status.plan !== "trial" || status.locked || shown) return;
    let alive = true;
    void (async () => {
      try {
        const { revision, seen } = await readSeen();
        const due = dueTrialNudge(status, seen);
        if (!alive || !due) return;
        await writeAccountJson<Seen>("preferences", SEEN_KEY, { schema: "trial-nudges/v1", seen: [...new Set([...seen, ...due.markSeen])] }, revision);
        if (alive) setShown(due.show);
      } catch { /* not saved = not shown: never shown twice */ }
    })();
    return () => { alive = false; };
  }, [status, shown]);

  if (!status || HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;
  // the trial cards are never shown on Plans (that page already is the answer); only the beta banner is
  if (pathname.startsWith("/plans") && shown) return null;
  const trialOn = status.plan === "trial" && !status.locked && !status.emailConfirmNeeded;   // (Nov 26) the confirm card shows first
  const trialEndsAt = status.trialEndsAt ?? status.windowEnd;
  if (!shown) {
    // the beta bar: only a running trial with a real first-50 code (the server already said the code still counts)
    if (!trialOn || saved?.offer !== "first50" || barClosed) return null;
    const beta = betaReservedCopy(trialEndsAt);
    const closeBar = () => { try { window.sessionStorage.setItem(BAR_CLOSED_KEY, "1"); } catch { /* this page only */ } setBarClosed(true); };
    return (
      <aside className={styles.bar} role="status" data-urgent={beta.urgent || undefined} data-place={TOP_BANNER_ON.has(pathname) ? "top" : undefined}>
        <p className={styles.barText}><span className={styles.diamond} aria-hidden="true">◆</span><strong>{beta.title}</strong> {beta.text}</p>
        <Link href={`/plans?code=${encodeURIComponent(saved.code)}`} prefetch={false} className={styles.primary}>{beta.button}</Link>
        <CloseButton label="Close this message" onClick={closeBar} />
      </aside>
    );
  }
  const copy = trialNudgeCopy(shown, { trialEndsAt, creditsLeft: status.creditsLeft, daysLeft: status.trialDaysLeft ?? 0 });
  const close = () => setShown(null);
  return (
    <aside className={styles.nudge} role="status" aria-labelledby="trial-nudge-title" data-stage={shown}>
      <div className={styles.head}>
        <h2 id="trial-nudge-title" className={styles.title}>{copy.title}</h2>
        <CloseButton label="Close" onClick={close} />
      </div>
      <p className={styles.text}>{copy.text}</p>
      <p className={styles.unlock}><strong>What a plan unlocks:</strong> {UNLOCK_LINE}</p>
      {saved && <SavedCodeLine code={saved.code} offer={saved.offer} trialEndsAt={trialOn ? trialEndsAt : null} className={styles.code} />}
      <div className={styles.buttons}>
        <Link href={saved ? `/plans?code=${encodeURIComponent(saved.code)}` : "/plans"} prefetch={false} className={styles.primary} onClick={close}>{saved?.offer === "first50" ? "Lock in my beta price" : "See plans"}</Link>
        <button type="button" className={styles.later} onClick={close}>Later</button>
      </div>
    </aside>
  );
}
