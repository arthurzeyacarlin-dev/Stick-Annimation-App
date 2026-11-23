// Email follow-up signals (dad, Nov 21; made exact Nov 23). The email service that sends Diamond Animator's follow-up emails
// has to know three things about an account: its free trial started (and when), it picked a plan (then the trial emails
// stop), and it was deleted (then every email stops). Nothing else is sent: only the email address and one of those facts.
// It uses the email service's PUBLIC site ID (no secret key), set in DIAMOND_EMAIL_SITE_ID. Without that setting nothing is
// sent at all. A problem here never breaks the app: it is tried once per account while the server runs, and the email
// service ignores a repeat of the same signal.
import type { AccountPlanStatus } from "./plans.ts";

export type EmailSignal = "Started Trial" | "Started Plan" | "Deleted Account";
/** What the signals need from an account's plan: which plan, whether it is locked (trial over), and when its trial started. */
export type EmailSignalStatus = Pick<AccountPlanStatus, "plan" | "locked" | "windowStart">;
const REVISION = "2025-01-15";
const UNIQUE: Record<EmailSignal, string> = { "Started Trial": "trial", "Started Plan": "plan", "Deleted Account": "deleted" };
const sent = new Set<string>();

/** Test and made-up addresses never go to the email service: the reserved test domains (example.com/.org/.net and anything
 *  under them, .test, .invalid, .localhost, .local, .example) and anything that isn't shaped like an address. */
export const isRealEmail = (email: string) =>
  /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) && !/[@.](example\.(com|org|net)|test|invalid|localhost|local|example)$/i.test(email);

/** Which signals this account's plan calls for: a trial that is still running says "Started Trial"; a paid plan says only
 *  "Started Plan"; a trial that is over says nothing (no "your trial has started" weeks late). */
export const signalsFor = (status: EmailSignalStatus): EmailSignal[] =>
  status.plan !== "trial" ? ["Started Plan"] : status.locked ? [] : ["Started Trial"];

/** `at` = when it really happened (the trial's real start), so the follow-up emails count their days from the right moment. */
export function emailSignalBody(email: string, ownerId: string, signal: EmailSignal, at?: number) {
  return {
    data: {
      type: "event",
      attributes: {
        properties: {},
        ...(at != null && Number.isFinite(at) ? { time: new Date(at).toISOString() } : {}),
        // The same id for the same account and signal: a repeat is not counted twice.
        unique_id: `${UNIQUE[signal]}-${ownerId}`,
        metric: { data: { type: "metric", attributes: { name: signal } } },
        profile: { data: { type: "profile", attributes: { email } } },
      },
    },
  };
}

/** Sends the signals not sent yet for this account. Never waits, never throws. Returns the ones it started sending. */
function send(ownerId: string, email: string | null | undefined, signals: EmailSignal[], at: number | undefined, fetcher: typeof fetch): EmailSignal[] {
  const siteId = process.env.DIAMOND_EMAIL_SITE_ID?.trim();
  if (!siteId || !email || !isRealEmail(email)) return [];
  const due = signals.filter((signal) => !sent.has(`${signal}:${ownerId}`));
  for (const signal of due) {
    const key = `${signal}:${ownerId}`;
    sent.add(key);
    void Promise.resolve()
      .then(() => fetcher(`https://a.klaviyo.com/client/events?company_id=${encodeURIComponent(siteId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json", revision: REVISION },
        body: JSON.stringify(emailSignalBody(email, ownerId, signal, signal === "Started Trial" ? at : undefined)),
      }))
      .then((res) => { if (!res.ok) sent.delete(key); }, () => { sent.delete(key); });
  }
  return due;
}

/** Sends what is new for this account's plan. Never waits, never throws. Returns the signals it started sending. */
export const sendEmailSignals = (ownerId: string, email: string | null | undefined, status: EmailSignalStatus, fetcher: typeof fetch = fetch): EmailSignal[] =>
  send(ownerId, email, signalsFor(status), status.windowStart, fetcher);

/** The account was deleted: tells the email service once, so its emails stop. Never waits, never throws. */
export function sendAccountDeletedSignal(ownerId: string, email: string | null | undefined, fetcher: typeof fetch = fetch): EmailSignal[] {
  try { return send(ownerId, email, ["Deleted Account"], undefined, fetcher); } catch { return []; }
}

/** For tests. */
export const forgetSentEmailSignals = () => sent.clear();
