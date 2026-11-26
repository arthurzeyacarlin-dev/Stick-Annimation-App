import type { Metadata } from "next";
import Link from "next/link";
import { currentServiceStatus } from "@/src/lib/support/supportService";
import type { ServiceStatus } from "@/src/lib/support/supportRules";
import styles from "@/src/components/support/StatusPage.module.css";

// SPEC-0027 (Nov 26): the public status page. Works signed out (people who can't sign in must see it too).
// Each part of the app: Working / Checking reports / We're fixing it / Resolved. Set on /reports or by the ticket API;
// "Checking reports" comes by itself when 3+ people report the same part within 30 minutes.
export const metadata: Metadata = { title: "Status · Diamond Animator", description: "Is everything in Diamond Animator working right now?" };
export const dynamic = "force-dynamic";

const when = (time: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(time);

export default function StatusPage() {
  let statuses: ServiceStatus[] = [];
  try { statuses = currentServiceStatus(); } catch { /* shown as "couldn't be checked" below */ }
  const allOk = statuses.length > 0 && statuses.every((status) => status.state === "ok");
  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <p className={styles.eyebrow}>Diamond Animator</p>
        <h1 className={styles.title}>Status</h1>
        <p className={styles.lead}>
          {statuses.length === 0 ? "The status couldn't be checked right now. Please try again in a minute."
            : allOk ? "Everything is working." : "Something isn't working right. We're on it, and your work is safe."}
        </p>
        <ul className={styles.list}>
          {statuses.map((status) => (
            <li key={status.area} className={styles.row} data-state={status.state}>
              <span className={styles.name}>{status.label}</span>
              <span className={styles.state}><span className={styles.dot} aria-hidden="true" />{status.stateLabel}</span>
              {(status.message || status.since) && (
                <span className={styles.note}>{status.message}{status.message && status.since ? " · " : ""}{status.since ? `Updated ${when(status.since)} (US Central)` : ""}</span>
              )}
            </li>
          ))}
        </ul>
        <p className={styles.muted}>Need help? Open the app and press the help bubble in the bottom-right corner, or email support@diamondanimator.com.</p>
        <Link href="/" className={styles.link}>Open Diamond Animator</Link>
      </div>
    </main>
  );
}
