// Email follow-up signals (dad, Nov 21). The email service that sends Diamond Animator's follow-up emails has to know two
// things about an account: its free trial started, and it picked a plan (then the trial emails stop). Nothing else is sent:
// only the email address and one of those two facts. It uses the email service's PUBLIC site ID (no secret key), set in
// DIAMOND_EMAIL_SITE_ID. Without that setting nothing is sent at all. A problem here never breaks the app: it is tried once
// per account while the server runs, and the email service ignores a repeat of the same signal.
import type { AccountPlanStatus } from "./plans.ts";

export type EmailSignal = "Started Trial" | "Started Plan";
const REVISION = "2025-01-15";
const sent = new Set<string>();

/** Test and made-up addresses never go to the email service. */
export const isRealEmail = (email: string) =>
  /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) && !/@(example\.(com|org|net)|.*\.(test|invalid|localhost))$/i.test(email);

/** Which signals this account's plan calls for: everyone starts with a trial; a paid plan adds "Started Plan". */
export const signalsFor = (status: Pick<AccountPlanStatus, "plan">): EmailSignal[] =>
  status.plan === "trial" ? ["Started Trial"] : ["Started Trial", "Started Plan"];

export function emailSignalBody(email: string, ownerId: string, signal: EmailSignal) {
  return {
    data: {
      type: "event",
      attributes: {
        properties: {},
        // The same id for the same account and signal: a repeat is not counted twice.
        unique_id: `${signal === "Started Trial" ? "trial" : "plan"}-${ownerId}`,
        metric: { data: { type: "metric", attributes: { name: signal } } },
        profile: { data: { type: "profile", attributes: { email } } },
      },
    },
  };
}

/** Sends what is new for this account. Never waits, never throws. Returns the signals it started sending. */
export function sendEmailSignals(ownerId: string, email: string | null | undefined, status: Pick<AccountPlanStatus, "plan">, fetcher: typeof fetch = fetch): EmailSignal[] {
  const siteId = process.env.DIAMOND_EMAIL_SITE_ID?.trim();
  if (!siteId || !email || !isRealEmail(email)) return [];
  const due = signalsFor(status).filter((signal) => !sent.has(`${signal}:${ownerId}`));
  for (const signal of due) {
    const key = `${signal}:${ownerId}`;
    sent.add(key);
    void Promise.resolve()
      .then(() => fetcher(`https://a.klaviyo.com/client/events?company_id=${encodeURIComponent(siteId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json", revision: REVISION },
        body: JSON.stringify(emailSignalBody(email, ownerId, signal)),
      }))
      .then((res) => { if (!res.ok) sent.delete(key); }, () => { sent.delete(key); });
  }
  return due;
}

/** For tests. */
export const forgetSentEmailSignals = () => sent.clear();
