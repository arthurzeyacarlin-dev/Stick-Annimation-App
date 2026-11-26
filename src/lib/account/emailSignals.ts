// Email follow-up signals (dad, Nov 21; made exact Nov 23; the whole year of emails Nov 26, SPEC-0030). The email service that
// sends Diamond Animator's follow-up emails has to know a few facts about an account, so each person gets the right emails and
// they stop at the right moment: the trial started, the first animation landed, a video was exported, a plan was picked, a
// month was paid, a payment didn't go through, the plan was cancelled, the plan ended, the account was deleted.
// Nothing else is sent: only the email address and one of those facts. It uses the email service's PUBLIC site ID (no secret
// key), set in DIAMOND_EMAIL_SITE_ID. Without that setting nothing is sent at all. A problem here never breaks the app: each
// fact is tried once while the server runs, and the email service ignores a repeat of the same fact (the same unique id).
import type { AccountPlanStatus } from "./plans.ts";

export type EmailSignal =
  | "Started Trial" | "Made First Animation" | "Exported Video" | "Started Plan" | "Plan Paid"
  | "Payment Failed" | "Cancelled Plan" | "Plan Ended" | "Deleted Account";
/** What the signals need from an account's plan. Only plan, locked and windowStart are always there; the rest is a paid plan's. */
export type EmailSignalStatus = Pick<AccountPlanStatus, "plan" | "locked" | "windowStart">
  & Partial<Pick<AccountPlanStatus, "lockReason" | "billingStatus" | "paymentProblem" | "waitingForPayment" | "cancelAtPeriodEnd" | "emailConfirmNeeded">>;
/** Facts that are not in the plan status: the plan's own id (so someone who comes back counts again) and the first animation. */
export type EmailSignalExtras = { subscriptionId?: string | null; madeFirstAnimation?: boolean; firstName?: string | null };

/** Dad, Nov 26 11:34: emails greet people by first name ("Hi Maya,"), but a name goes to the email service ONLY for accounts
 *  marked 13 or older ("13plus") or a parent's account ("parent"). Never for "under13", never when it isn't known: then the
 *  emails say "Hi there,". Only the first word of the Name field, letters only (a name, not an email or a number), max 30. */
export function emailFirstName(name: unknown, ageGroup: unknown): string | null {
  if (ageGroup !== "13plus" && ageGroup !== "parent") return null;
  const first = typeof name === "string" ? name.trim().split(/\s+/)[0] ?? "" : "";
  return /^\p{L}[\p{L}'-]{0,29}$/u.test(first) ? first : null;
}
/** One fact to send: its name, the id that makes a repeat count once, and (for the trial) when it really happened. */
export type DueSignal = { signal: EmailSignal; id: string; at?: number };

const REVISION = "2025-01-15";
const sent = new Set<string>();

/** Test and made-up addresses never go to the email service: the reserved test domains (example.com/.org/.net and anything
 *  under them, .test, .invalid, .localhost, .local, .example) and anything that isn't shaped like an address. */
export const isRealEmail = (email: string) =>
  /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) && !/[@.](example\.(com|org|net)|test|invalid|localhost|local|example)$/i.test(email);

/** Which facts this account's plan calls for, each with its once-only id.
 *  Trial still running: "Started Trial" (a trial that is over says nothing: no "your trial has started" weeks late).
 *  Paid plan: "Started Plan" (once per plan); "Plan Paid" once per paid month; "Payment Failed" once per month it fails;
 *  "Cancelled Plan" once per plan when it is set to end; "Plan Ended" once per plan when it really ran out.
 *  Any account: "Made First Animation" once. */
export function dueSignals(ownerId: string, status: EmailSignalStatus, extras: EmailSignalExtras = {}): DueSignal[] {
  const due: DueSignal[] = [];
  if (status.plan === "trial") {
    // (dad, Nov 26) the trial starts when the email is confirmed: no "Started Trial" before that
    if (!status.locked && !status.emailConfirmNeeded) due.push({ signal: "Started Trial", id: `trial-${ownerId}`, at: status.windowStart });
  } else {
    const plan = extras.subscriptionId ? `${ownerId}-${extras.subscriptionId}` : ownerId;
    const month = `${ownerId}-${status.windowStart}`;
    due.push({ signal: "Started Plan", id: `plan-${plan}` });
    if (status.locked && status.lockReason === "plan_ended") due.push({ signal: "Plan Ended", id: `ended-${plan}` });
    else {
      if (status.paymentProblem || status.billingStatus === "past_due") due.push({ signal: "Payment Failed", id: `failed-${month}` });
      else if (status.billingStatus === "active" && !status.waitingForPayment) due.push({ signal: "Plan Paid", id: `paid-${month}` });
      if (status.cancelAtPeriodEnd) due.push({ signal: "Cancelled Plan", id: `cancelled-${plan}` });
    }
  }
  if (extras.madeFirstAnimation) due.push({ signal: "Made First Animation", id: `first-animation-${ownerId}` });
  return due;
}

/** The names only (kept for the tests and anyone who just wants to know which facts apply). */
export const signalsFor = (status: EmailSignalStatus, extras: EmailSignalExtras = {}): EmailSignal[] =>
  dueSignals("_", status, extras).map((due) => due.signal);

/** `at` = when it really happened (the trial's real start), so the follow-up emails count their days from the right moment. */
export function emailSignalBody(email: string, uniqueId: string, signal: EmailSignal, at?: number, firstName?: string | null) {
  return {
    data: {
      type: "event",
      attributes: {
        properties: {},
        ...(at != null && Number.isFinite(at) ? { time: new Date(at).toISOString() } : {}),
        // The same id for the same fact: a repeat is not counted twice.
        unique_id: uniqueId,
        metric: { data: { type: "metric", attributes: { name: signal } } },
        profile: { data: { type: "profile", attributes: { email, ...(firstName ? { first_name: firstName } : {}) } } },
      },
    },
  };
}

/** Sends the facts not sent yet. Never waits, never throws. Returns the ones it started sending. */
function send(email: string | null | undefined, signals: DueSignal[], fetcher: typeof fetch, firstName?: string | null): EmailSignal[] {
  const siteId = process.env.DIAMOND_EMAIL_SITE_ID?.trim();
  if (!siteId || !email || !isRealEmail(email)) return [];
  const due = signals.filter((one) => !sent.has(one.id));
  for (const one of due) {
    sent.add(one.id);
    void Promise.resolve()
      .then(() => fetcher(`https://a.klaviyo.com/client/events?company_id=${encodeURIComponent(siteId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json", revision: REVISION },
        body: JSON.stringify(emailSignalBody(email, one.id, one.signal, one.at, firstName)),
      }))
      .then((res) => { if (!res.ok) sent.delete(one.id); }, () => { sent.delete(one.id); });
  }
  return due.map((one) => one.signal);
}

/** Sends what is new for this account's plan. Never waits, never throws. Returns the signals it started sending. */
export function sendEmailSignals(ownerId: string, email: string | null | undefined, status: EmailSignalStatus,
  extras: EmailSignalExtras = {}, fetcher: typeof fetch = fetch): EmailSignal[] {
  try { return send(email, dueSignals(ownerId, status, extras), fetcher, extras.firstName); } catch { return []; }
}

/** A video (MP4 or GIF) was really saved: tells the email service once per account. Never waits, never throws. */
export function sendExportedVideoSignal(ownerId: string, email: string | null | undefined, fetcher: typeof fetch = fetch): EmailSignal[] {
  try { return send(email, [{ signal: "Exported Video", id: `export-${ownerId}` }], fetcher); } catch { return []; }
}

/** The account was deleted: tells the email service once, so its emails stop. Never waits, never throws. */
export function sendAccountDeletedSignal(ownerId: string, email: string | null | undefined, fetcher: typeof fetch = fetch): EmailSignal[] {
  try { return send(email, [{ signal: "Deleted Account", id: `deleted-${ownerId}` }], fetcher); } catch { return []; }
}

/** For tests. */
export const forgetSentEmailSignals = () => sent.clear();
