/* eslint-disable @typescript-eslint/no-explicit-any -- the account library's own objects are plain JSON here */
// (Dad, Nov 26) CONFIRM THE EMAIL, ONE FREE TRIAL PER REAL INBOX: the real sign-up (the account library with its real hooks), a
// throw-away account database in a temp folder, and the local test inbox (no email leaves the computer). $0, no AI, no payments.
// Run: node --import ./scripts/money-test-loader.mjs --test src/lib/account/emailConfirm.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "da-email-confirm-")));
fs.mkdirSync(".local/spec0015-phase3", { recursive: true });
fs.writeFileSync(".local/spec0015-phase3/auth-secret", "test-secret-for-the-email-confirm-test-only-0123456789");
delete process.env.RESEND_API_KEY;
process.env.DIAMOND_TRIAL_EXEMPT_EMAILS = "family.tester@gmail.com";

const { auth } = await import("./auth.ts");
const { getMigrations } = await import("better-auth/db/migration");
await (await getMigrations(auth.options)).runMigrations();
const confirm = await import("./emailConfirm.ts");
const credits = await import("./aiCredits.ts");

const outbox = () => fs.existsSync(".local/dev-mail/outbox.ndjson")
  ? fs.readFileSync(".local/dev-mail/outbox.ndjson", "utf8").trim().split("\n").map((line) => JSON.parse(line) as { to: string; subject: string; text: string; link?: string }) : [];
const lastMail = (to: string) => outbox().filter((mail) => mail.to === to).at(-1);
const codeOf = (to: string) => /Your code: (\d{6})/.exec(lastMail(to)?.text ?? "")?.[1] ?? "";
const signUp = async (email: string, ageAnswer = "13plus") => {
  const result = await auth.api.signUpEmail({ body: { name: "Tester", email, password: "a-long-password-1", ageAnswer } as any });
  return result.user as any as { id: string; email: string; name: string; ageGroup?: string };
};
const status = (id: string) => credits.getAccountPlanStatus(id);
const headersFrom = (ip: string) => new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` });

test("a new account can look around, but its free trial starts only when the email is confirmed (the 6-digit code)", async () => {
  const anna = await signUp("Anna.Smith@gmail.com");
  assert.equal(confirm.confirmState(anna.id), "confirm");
  const before = status(anna.id);
  assert.deepEqual([before.plan, before.creditsTotal, before.creditsLeft, before.locked, before.emailConfirmNeeded], ["trial", 0, 0, false, true]);
  assert.throws(() => credits.assertAiCreditAvailable(anna.id, 0, 15), (error: any) => error.code === "confirm_email" && /Confirm your email/.test(error.message));
  const mail = lastMail("anna.smith@gmail.com");
  assert.ok(mail && /Your code: \d{6}/.test(mail.text) && mail.link?.includes("/api/account/email-confirm/link?token="), "one email with the code AND the link");
  await assert.rejects(confirm.confirmByCode(anna, "000000" === codeOf(anna.email) ? "111111" : "000000", null), /isn't right/);
  assert.equal(await confirm.confirmByCode(anna, codeOf(anna.email), headersFrom("203.0.113.9")), "confirmed");
  const after = status(anna.id);
  assert.deepEqual([after.creditsTotal, after.creditsLeft, after.emailConfirmNeeded, after.trialDaysLeft], [300, 300, false, 14], "the 14 days start now");
  assert.doesNotThrow(() => credits.assertAiCreditAvailable(anna.id, 0, 15));
  assert.equal(((await (await auth.$context).internalAdapter.findUserById(anna.id)) as any).emailVerified, true);
});

test("one free trial per REAL inbox: +tags, Gmail dots and googlemail are the same inbox; the second account signs up but gets no trial", async () => {
  for (const twin of ["anna.smith+test1@gmail.com", "annasmith@googlemail.com", "A.N.N.A.S.M.I.T.H@gmail.com"]) {
    const other = await signUp(twin);
    assert.equal(confirm.confirmState(other.id), "no_trial", twin);
    const s = status(other.id);
    assert.deepEqual([s.creditsTotal, s.locked, s.lockReason], [0, true, "no_trial"]);
    assert.throws(() => credits.assertAiCreditAvailable(other.id, 0, 15), (error: any) => error.code === "no_trial" && /already had its free trial/.test(error.message));
    assert.equal(lastMail(twin.toLowerCase()), undefined, "no confirm email for an account that gets no trial");
  }
  // a different person on the same email service is a different inbox
  const bob = await signUp("bob+anything@gmail.com");
  assert.equal(confirm.confirmState(bob.id), "confirm");
});

test("two sign-ups on one inbox before either confirms: the first to confirm gets the trial, the second gets none", async () => {
  const one = await signUp("race@example-mail.org");
  const two = await signUp("race+2@example-mail.org");
  assert.equal(confirm.confirmState(two.id), "confirm");
  assert.equal(await confirm.confirmByCode(one, codeOf(one.email), null), "confirmed");
  assert.equal(await confirm.confirmByCode(two, codeOf(two.email), null), "no_trial");
  assert.equal(status(two.id).lockReason, "no_trial");
});

test("deleting the account and signing up again gets NO new trial (a salted fingerprint stays, never the address)", async () => {
  const carl = await signUp("carl@example-mail.org");
  await confirm.confirmByCode(carl, codeOf(carl.email), null);
  confirm.rememberInboxOnDelete(carl);
  credits.deleteAccountPlan(carl.id);
  await (await auth.$context).internalAdapter.deleteUser(carl.id);
  const again = await signUp("carl+new@example-mail.org");
  assert.equal(confirm.confirmState(again.id), "no_trial");
  const store = fs.readFileSync(".local/spec0015-phase3/email-confirm.sqlite");
  assert.ok(!store.includes(Buffer.from("carl@example-mail.org")) && !store.includes(Buffer.from("carl")), "the address itself is never kept");
  // an account that never confirmed blocks nobody when it is deleted
  const typo = await signUp("dora@example-mail.org");
  confirm.rememberInboxOnDelete(typo);
  credits.deleteAccountPlan(typo.id);
  await (await auth.$context).internalAdapter.deleteUser(typo.id);
  const dora = await signUp("dora@example-mail.org");
  assert.equal(confirm.confirmState(dora.id), "confirm");
});

test("throwaway email domains can't sign up; the owner's own test addresses (a server setting) are exempt: each +tag gets a trial and a real email", async () => {
  await assert.rejects(signUp("someone@mailinator.com"), (error: any) => /real email address/.test(error.message ?? error.body?.message));
  await assert.rejects(signUp("someone@mx.guerrillamail.com"), (error: any) => /real email address/.test(error.message ?? error.body?.message));
  process.env.DIAMOND_DISPOSABLE_DOMAINS = "brand-new-temp.io";
  await assert.rejects(signUp("x@brand-new-temp.io"), (error: any) => /real email address/.test(error.message ?? error.body?.message));
  delete process.env.DIAMOND_DISPOSABLE_DOMAINS;
  const first = await signUp("family.tester+test1@gmail.com");
  const second = await signUp("family.tester+test2@gmail.com");
  for (const account of [first, second]) {
    assert.equal(confirm.confirmState(account.id), "confirm");
    assert.ok(codeOf(account.email), "a real confirm email to the +tag address");
    assert.equal(await confirm.confirmByCode(account, codeOf(account.email), null), "confirmed");
    assert.equal(status(account.id).creditsTotal, 300);
  }
});

test("the link in the email confirms too (signed out), once; 5 wrong codes = a new code is needed; resend is limited", async () => {
  const eve = await signUp("eve@example-mail.org");
  const token = new URL(lastMail(eve.email)!.link!).searchParams.get("token");
  assert.equal(await confirm.confirmByLink("not-a-real-token-at-all-123", null), "bad_link");
  assert.equal(await confirm.confirmByLink(token, null), "confirmed");
  assert.equal(status(eve.id).creditsTotal, 300);
  assert.equal(await confirm.confirmByLink(token, null), "bad_link", "a used link does nothing");

  const finn = await signUp("finn@example-mail.org");
  const right = codeOf(finn.email), wrong = right === "999999" ? "999998" : "999999";
  for (let i = 0; i < 5; i++) await assert.rejects(confirm.confirmByCode(finn, wrong, null), /isn't right/);
  await assert.rejects(confirm.confirmByCode(finn, right, null), /too many tries/, "even the right code waits for a new email after 5 wrong tries");
  await assert.rejects(confirm.sendConfirmEmail(finn), /just sent it/, "not twice within 45 seconds");
  const later = Date.now() + 60_000;
  assert.deepEqual(await confirm.sendConfirmEmail(finn, {}, later), { sent: true });
  assert.equal(await confirm.confirmByCode(finn, codeOf(finn.email), null, later), "confirmed");
});

test("\"Wrong email? Fix it\": an unconfirmed account moves to the right address and gets the email there; the trial rule is checked again", async () => {
  const gus = await signUp("gus@exmaple-mail.org");
  const moved = await confirm.changeUnconfirmedEmail(gus, "gus@example-mail.org");
  assert.deepEqual(moved, { email: "gus@example-mail.org", state: "confirm" });
  const user = (await (await auth.$context).internalAdapter.findUserById(gus.id)) as any;
  assert.equal(user.email, "gus@example-mail.org", "logging in now uses the fixed address");
  assert.equal(await confirm.confirmByCode({ ...gus, email: moved.email }, codeOf("gus@example-mail.org"), null), "confirmed");
  await assert.rejects(confirm.changeUnconfirmedEmail({ ...gus, email: moved.email }, "other@example-mail.org"), /already confirmed/);
  const hal = await signUp("hal@example-mail.org");
  await assert.rejects(confirm.changeUnconfirmedEmail(hal, "x@mailinator.com"), /real email address/);
  await assert.rejects(confirm.changeUnconfirmedEmail(hal, "eve@example-mail.org"), /already has an account/);
  assert.deepEqual(await confirm.changeUnconfirmedEmail(hal, "anna.smith+hal@gmail.com"), { email: "anna.smith+hal@gmail.com", state: "no_trial" });
});

test("a parent's account (SPEC-0031) confirms the parent's own email", async () => {
  const parent = await signUp("parent.person@example-mail.org", "parent");
  assert.match(lastMail(parent.email)!.text, /trial for your child's account/);
  assert.equal(await confirm.confirmByCode(parent, codeOf(parent.email), null), "confirmed");
});

test("many trials from one internet address in a day = ONE alert to the owner, never a block (schools share addresses)", async () => {
  const warned: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => { warned.push(args.map(String).join(" ")); };
  try {
    for (let i = 0; i < 6; i++) {
      const kid = await signUp(`pupil${i}@school-mail.org`);
      assert.equal(await confirm.confirmByCode(kid, codeOf(kid.email), headersFrom("198.51.100.7")), "confirmed", "never blocked");
    }
  } finally { console.warn = realWarn; }
  const alerts = warned.filter((line) => /free trials started from the same internet address/.test(line));
  assert.equal(alerts.length, 1, "told once a day");
  assert.match(alerts[0], /5 free trials/);
  assert.ok(!fs.readFileSync(".local/spec0015-phase3/email-confirm.sqlite").includes(Buffer.from("198.51.100.7")), "the address itself is never kept");
});

test("accounts from before the rule: a plan or real AI use = confirmed; an unused trial confirms on its next animation (its dates stay)", async () => {
  const g = globalThis as any;
  credits.getAccountPlanStatus("old-active");
  credits.spendAiCredit("old-active", "old-job", 30, "animation");
  credits.getAccountPlanStatus("old-unused");
  // the rule arrives: the migration runs once on the existing rows
  g.diamondAccountPlansDatabase.prepare("DELETE FROM account_meta_v1 WHERE key = 'trial-gate-legacy'").run();
  g.diamondAccountPlansDatabase.prepare("UPDATE account_plan_v1 SET trial_gate = NULL WHERE owner_id IN ('old-active', 'old-unused')").run();
  g.diamondAccountPlansSchema = 0;
  const startedAt = credits.readAccountPlanRecord("old-unused").trialStartedAt;
  assert.equal(status("old-active").emailConfirmNeeded, false);
  assert.equal(status("old-active").creditsTotal, 300);
  assert.equal(status("old-unused").emailConfirmNeeded, true);
  assert.equal(confirm.confirmState("old-unused"), "confirm");
  assert.equal(credits.startTrialAfterConfirm("old-unused"), true);
  assert.equal(credits.readAccountPlanRecord("old-unused").trialStartedAt, startedAt, "an older account keeps its trial dates");
  // an older account that never opened the app has no row yet: it confirms too
  credits.ensureLegacyTrialGate("old-never-opened", Date.now() - 3 * 24 * 60 * 60 * 1000);
  assert.equal(status("old-never-opened").emailConfirmNeeded, true);
  assert.equal(status("old-never-opened").trialDaysLeft, 11);
});
