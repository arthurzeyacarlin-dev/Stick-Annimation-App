// Run: node --import ./scripts/money-test-loader.mjs --test src/lib/account/emailSignals.test.ts
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { emailSignalBody, forgetSentEmailSignals, isRealEmail, sendAccountDeletedSignal, sendEmailSignals, signalsFor, type EmailSignalStatus } from "./emailSignals.ts";

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
  assert.deepEqual(sendEmailSignals("u1", "kid@gmail.com", trial, fakeFetch(calls)), ["Started Trial"]);
  assert.deepEqual(sendEmailSignals("u1", "kid@gmail.com", trial, fakeFetch(calls)), []);
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
  sendEmailSignals("u2", "a@gmail.com", trial, fakeFetch(calls));
  assert.deepEqual(sendEmailSignals("u2", "a@gmail.com", paid("starter"), fakeFetch(calls)), ["Started Plan"]);
  await settle();
  assert.deepEqual(calls.map((c) => c.body.data.attributes.unique_id), ["trial-u2", "plan-u2"]);
  assert.deepEqual(signalsFor(paid("creator")), ["Started Plan"]);
});

test("nothing is sent without the setting, without an email, or for a test address", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("u3", "check@example.test", trial, fakeFetch(calls)), []);
  assert.deepEqual(sendEmailSignals("u3", null, trial, fakeFetch(calls)), []);
  delete process.env.DIAMOND_EMAIL_SITE_ID;
  assert.deepEqual(sendEmailSignals("u3", "real@gmail.com", trial, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(isRealEmail("real@gmail.com"), true);
  assert.equal(isRealEmail("x@example.com"), false);
});

test("an account that is already paid sends only Started Plan, never Started Trial", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("u5", "p@gmail.com", paid("studio"), fakeFetch(calls)), ["Started Plan"]);
  await settle();
  assert.deepEqual(calls.map((c) => c.body.data.attributes.unique_id), ["plan-u5"]);
  assert.equal("time" in calls[0].body.data.attributes, false);
});

test("a trial that is already over sends nothing", async () => {
  const calls: Call[] = [];
  assert.deepEqual(signalsFor(trialOver), []);
  assert.deepEqual(sendEmailSignals("u6", "old@gmail.com", trialOver, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 0);
});

test("reserved test domains never send anything", async () => {
  const calls: Call[] = [];
  const reserved = ["a@example.com", "a@example.org", "a@example.net", "a@mail.example.com", "a@EXAMPLE.COM", "a@diamond.test", "a@x.invalid",
    "a@app.localhost", "a@mac.local", "a@shop.example", "a@localhost", "not-an-address"];
  for (const email of reserved) {
    assert.equal(isRealEmail(email), false, email);
    assert.deepEqual(sendEmailSignals(`r-${email}`, email, trial, fakeFetch(calls)), [], email);
    assert.deepEqual(sendEmailSignals(`r-${email}`, email, paid("creator"), fakeFetch(calls)), [], email);
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
  sendEmailSignals("u4", "b@gmail.com", trial, fakeFetch(calls, false));
  await settle();
  sendEmailSignals("u4", "b@gmail.com", trial, (async () => { throw new Error("offline"); }) as typeof fetch);
  await settle();
  assert.deepEqual(sendEmailSignals("u4", "b@gmail.com", trial, fakeFetch(calls)), ["Started Trial"]);
  await settle();
  assert.equal(calls.length, 2);
});
