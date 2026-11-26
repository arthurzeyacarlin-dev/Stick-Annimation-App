// Run: node --import ./scripts/money-test-loader.mjs --test src/lib/account/emailSignals.test.ts
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { dueSignals, emailSignalBody, forgetSentEmailSignals, isRealEmail, sendAccountDeletedSignal, sendEmailSignals, sendExportedVideoSignal, signalsFor, type EmailSignalStatus } from "./emailSignals.ts";

type Call = { url: string; body: ReturnType<typeof emailSignalBody> };
const fakeFetch = (calls: Call[], ok = true) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return { ok } as Response;
  }) as typeof fetch;
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const STARTED = Date.UTC(2026, 10, 20, 9, 30);
const trial: EmailSignalStatus = { plan: "trial", locked: false, windowStart: STARTED };
const trialOver: EmailSignalStatus = { plan: "trial", locked: true, windowStart: STARTED - 30 * 86_400_000 };
const paid = (plan: "starter" | "creator" | "studio"): EmailSignalStatus => ({ plan, locked: false, windowStart: STARTED });

beforeEach(() => { forgetSentEmailSignals(); process.env.DIAMOND_EMAIL_SITE_ID = "SITE1"; });

test("a trial account sends Started Trial once, however often its plan is read", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("u1", "kid@gmail.com", trial, {}, fakeFetch(calls)), ["Started Trial"]);
  assert.deepEqual(sendEmailSignals("u1", "kid@gmail.com", trial, {}, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /company_id=SITE1$/);
  assert.equal(calls[0].body.data.attributes.metric.data.attributes.name, "Started Trial");
  assert.equal(calls[0].body.data.attributes.unique_id, "trial-u1");
  // stamped with the trial's real start, not "now"
  assert.equal((calls[0].body.data.attributes as { time?: string }).time, new Date(STARTED).toISOString());
  assert.equal(calls[0].body.data.attributes.profile.data.attributes.email, "kid@gmail.com");
});

test("picking a plan sends Started Plan, so the trial emails stop", async () => {
  const calls: Call[] = [];
  sendEmailSignals("u2", "a@gmail.com", trial, {}, fakeFetch(calls));
  assert.deepEqual(sendEmailSignals("u2", "a@gmail.com", paid("starter"), {}, fakeFetch(calls)), ["Started Plan"]);
  await settle();
  assert.deepEqual(calls.map((c) => c.body.data.attributes.unique_id), ["trial-u2", "plan-u2"]);
  assert.deepEqual(signalsFor(paid("creator")), ["Started Plan"]);
});

test("nothing is sent without the setting, without an email, or for a test address", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("u3", "check@example.test", trial, {}, fakeFetch(calls)), []);
  assert.deepEqual(sendEmailSignals("u3", null, trial, {}, fakeFetch(calls)), []);
  delete process.env.DIAMOND_EMAIL_SITE_ID;
  assert.deepEqual(sendEmailSignals("u3", "real@gmail.com", trial, {}, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(isRealEmail("real@gmail.com"), true);
  assert.equal(isRealEmail("x@example.com"), false);
});

test("an account that is already paid sends only Started Plan, never Started Trial", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("u5", "p@gmail.com", paid("studio"), {}, fakeFetch(calls)), ["Started Plan"]);
  await settle();
  assert.deepEqual(calls.map((c) => c.body.data.attributes.unique_id), ["plan-u5"]);
  assert.equal("time" in calls[0].body.data.attributes, false);
});

test("a trial that is already over sends nothing", async () => {
  const calls: Call[] = [];
  assert.deepEqual(signalsFor(trialOver), []);
  assert.deepEqual(sendEmailSignals("u6", "old@gmail.com", trialOver, {}, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 0);
});

test("reserved test domains never send anything", async () => {
  const calls: Call[] = [];
  const reserved = ["a@example.com", "a@example.org", "a@example.net", "a@mail.example.com", "a@EXAMPLE.COM", "a@diamond.test", "a@x.invalid",
    "a@app.localhost", "a@mac.local", "a@shop.example", "a@localhost", "not-an-address"];
  for (const email of reserved) {
    assert.equal(isRealEmail(email), false, email);
    assert.deepEqual(sendEmailSignals(`r-${email}`, email, trial, {}, fakeFetch(calls)), [], email);
    assert.deepEqual(sendEmailSignals(`r-${email}`, email, paid("creator"), {}, fakeFetch(calls)), [], email);
    assert.deepEqual(sendAccountDeletedSignal(`r-${email}`, email, fakeFetch(calls)), [], email);
  }
  await settle();
  assert.equal(calls.length, 0);
  for (const email of ["kid@gmail.com", "a@myexample.com", "a@contest.io", "a@local.co", "a@testing.org"]) assert.equal(isRealEmail(email), true, email);
});

test("a deleted account sends Deleted Account once, and a problem never throws", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendAccountDeletedSignal("u7", "gone@gmail.com", fakeFetch(calls)), ["Deleted Account"]);
  assert.deepEqual(sendAccountDeletedSignal("u7", "gone@gmail.com", fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.data.attributes.metric.data.attributes.name, "Deleted Account");
  assert.equal(calls[0].body.data.attributes.unique_id, "deleted-u7");
  assert.equal(calls[0].body.data.attributes.profile.data.attributes.email, "gone@gmail.com");
  assert.deepEqual(sendAccountDeletedSignal("u8", "gone2@gmail.com", (() => { throw new Error("offline"); }) as unknown as typeof fetch), ["Deleted Account"]);
  await settle();
  delete process.env.DIAMOND_EMAIL_SITE_ID;
  assert.deepEqual(sendAccountDeletedSignal("u9", "gone3@gmail.com", fakeFetch(calls)), []);
  assert.deepEqual(sendAccountDeletedSignal("u9", null, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 1);
});

test("a failed send never throws and is tried again next time", async () => {
  const calls: Call[] = [];
  sendEmailSignals("u4", "b@gmail.com", trial, {}, fakeFetch(calls, false));
  await settle();
  sendEmailSignals("u4", "b@gmail.com", trial, {}, (async () => { throw new Error("offline"); }) as typeof fetch);
  await settle();
  assert.deepEqual(sendEmailSignals("u4", "b@gmail.com", trial, {}, fakeFetch(calls)), ["Started Trial"]);
  await settle();
  assert.equal(calls.length, 2);
});

// ---------- SPEC-0030: the whole year of emails ----------
const MONTH2 = STARTED + 30 * 86_400_000;
const member = (extra: Partial<EmailSignalStatus> = {}): EmailSignalStatus =>
  ({ plan: "creator", locked: false, windowStart: STARTED, lockReason: null, billingStatus: "active", paymentProblem: false, waitingForPayment: false, cancelAtPeriodEnd: false, ...extra });
const ids = (calls: Call[]) => calls.map((c) => c.body.data.attributes.unique_id);

test("a paid month sends Plan Paid once per month, and Started Plan once per plan", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("m1", "m@gmail.com", member(), { subscriptionId: "sub_A" }, fakeFetch(calls)), ["Started Plan", "Plan Paid"]);
  assert.deepEqual(sendEmailSignals("m1", "m@gmail.com", member(), { subscriptionId: "sub_A" }, fakeFetch(calls)), []);
  assert.deepEqual(sendEmailSignals("m1", "m@gmail.com", member({ windowStart: MONTH2 }), { subscriptionId: "sub_A" }, fakeFetch(calls)), ["Plan Paid"]);
  // someone who left and came back with a new plan counts again, so the win-back emails stop
  assert.deepEqual(sendEmailSignals("m1", "m@gmail.com", member({ windowStart: MONTH2 }), { subscriptionId: "sub_B" }, fakeFetch(calls)), ["Started Plan"]);
  await settle();
  assert.deepEqual(ids(calls), ["plan-m1-sub_A", `paid-m1-${STARTED}`, `paid-m1-${MONTH2}`, "plan-m1-sub_B"]);
});

test("a payment that didn't go through sends Payment Failed (not Plan Paid) until it is paid", () => {
  assert.deepEqual(signalsFor(member({ paymentProblem: true })), ["Started Plan", "Payment Failed"]);
  assert.deepEqual(signalsFor(member({ billingStatus: "past_due" })), ["Started Plan", "Payment Failed"]);
  // a new month waiting for its payment is not "paid" yet
  assert.deepEqual(signalsFor(member({ waitingForPayment: true })), ["Started Plan"]);
  const failed = dueSignals("m2", member({ paymentProblem: true }));
  assert.equal(failed[1].id, `failed-m2-${STARTED}`);
});

test("cancelling sends Cancelled Plan once; the plan really running out sends Plan Ended once", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("m3", "c@gmail.com", member({ cancelAtPeriodEnd: true }), { subscriptionId: "sub_C" }, fakeFetch(calls)), ["Started Plan", "Plan Paid", "Cancelled Plan"]);
  assert.deepEqual(sendEmailSignals("m3", "c@gmail.com", member({ cancelAtPeriodEnd: true }), { subscriptionId: "sub_C" }, fakeFetch(calls)), []);
  const ended = member({ locked: true, lockReason: "plan_ended", billingStatus: "canceled", cancelAtPeriodEnd: true });
  assert.deepEqual(sendEmailSignals("m3", "c@gmail.com", ended, { subscriptionId: "sub_C" }, fakeFetch(calls)), ["Plan Ended"]);
  assert.deepEqual(sendEmailSignals("m3", "c@gmail.com", ended, { subscriptionId: "sub_C" }, fakeFetch(calls)), []);
  await settle();
  assert.deepEqual(ids(calls), ["plan-m3-sub_C", `paid-m3-${STARTED}`, "cancelled-m3-sub_C", "ended-m3-sub_C"]);
  // someone who cancels and then turns it back on never gets Plan Ended
  assert.deepEqual(signalsFor(member()), ["Started Plan", "Plan Paid"]);
});

test("the first animation sends Made First Animation once, in the trial or on a plan", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("f1", "f@gmail.com", trial, { madeFirstAnimation: false }, fakeFetch(calls)), ["Started Trial"]);
  assert.deepEqual(sendEmailSignals("f1", "f@gmail.com", trial, { madeFirstAnimation: true }, fakeFetch(calls)), ["Made First Animation"]);
  assert.deepEqual(sendEmailSignals("f1", "f@gmail.com", member(), { madeFirstAnimation: true }, fakeFetch(calls)), ["Started Plan", "Plan Paid"]);
  await settle();
  assert.deepEqual(ids(calls), ["trial-f1", "first-animation-f1", "plan-f1", `paid-f1-${STARTED}`]);
  assert.equal(calls[1].body.data.attributes.metric.data.attributes.name, "Made First Animation");
  assert.equal("time" in calls[1].body.data.attributes, false);
});

test("an exported video sends Exported Video once per account, and never for a test address", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendExportedVideoSignal("e1", "e@gmail.com", fakeFetch(calls)), ["Exported Video"]);
  assert.deepEqual(sendExportedVideoSignal("e1", "e@gmail.com", fakeFetch(calls)), []);
  assert.deepEqual(sendExportedVideoSignal("e2", "e@example.com", fakeFetch(calls)), []);
  assert.deepEqual(sendExportedVideoSignal("e3", "e3@gmail.com", (() => { throw new Error("offline"); }) as unknown as typeof fetch), ["Exported Video"]);
  await settle();
  assert.deepEqual(ids(calls), ["export-e1"]);
});
