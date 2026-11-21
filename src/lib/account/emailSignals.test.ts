// Run: node --import ./scripts/money-test-loader.mjs --test src/lib/account/emailSignals.test.ts
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { emailSignalBody, forgetSentEmailSignals, isRealEmail, sendEmailSignals, signalsFor } from "./emailSignals.ts";

type Call = { url: string; body: ReturnType<typeof emailSignalBody> };
const fakeFetch = (calls: Call[], ok = true) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return { ok } as Response;
  }) as typeof fetch;
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

beforeEach(() => { forgetSentEmailSignals(); process.env.DIAMOND_EMAIL_SITE_ID = "SITE1"; });

test("a trial account sends Started Trial once, however often its plan is read", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("u1", "kid@gmail.com", { plan: "trial" }, fakeFetch(calls)), ["Started Trial"]);
  assert.deepEqual(sendEmailSignals("u1", "kid@gmail.com", { plan: "trial" }, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /company_id=SITE1$/);
  assert.equal(calls[0].body.data.attributes.metric.data.attributes.name, "Started Trial");
  assert.equal(calls[0].body.data.attributes.unique_id, "trial-u1");
  assert.equal(calls[0].body.data.attributes.profile.data.attributes.email, "kid@gmail.com");
});

test("picking a plan sends Started Plan, so the trial emails stop", async () => {
  const calls: Call[] = [];
  sendEmailSignals("u2", "a@gmail.com", { plan: "trial" }, fakeFetch(calls));
  assert.deepEqual(sendEmailSignals("u2", "a@gmail.com", { plan: "starter" }, fakeFetch(calls)), ["Started Plan"]);
  await settle();
  assert.deepEqual(calls.map((c) => c.body.data.attributes.unique_id), ["trial-u2", "plan-u2"]);
  assert.deepEqual(signalsFor({ plan: "creator" }), ["Started Trial", "Started Plan"]);
});

test("nothing is sent without the setting, without an email, or for a test address", async () => {
  const calls: Call[] = [];
  assert.deepEqual(sendEmailSignals("u3", "check@example.test", { plan: "trial" }, fakeFetch(calls)), []);
  assert.deepEqual(sendEmailSignals("u3", null, { plan: "trial" }, fakeFetch(calls)), []);
  delete process.env.DIAMOND_EMAIL_SITE_ID;
  assert.deepEqual(sendEmailSignals("u3", "real@gmail.com", { plan: "trial" }, fakeFetch(calls)), []);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(isRealEmail("real@gmail.com"), true);
  assert.equal(isRealEmail("x@example.com"), false);
});

test("a failed send never throws and is tried again next time", async () => {
  const calls: Call[] = [];
  sendEmailSignals("u4", "b@gmail.com", { plan: "trial" }, fakeFetch(calls, false));
  await settle();
  sendEmailSignals("u4", "b@gmail.com", { plan: "trial" }, (async () => { throw new Error("offline"); }) as typeof fetch);
  await settle();
  assert.deepEqual(sendEmailSignals("u4", "b@gmail.com", { plan: "trial" }, fakeFetch(calls)), ["Started Trial"]);
  await settle();
  assert.equal(calls.length, 2);
});
