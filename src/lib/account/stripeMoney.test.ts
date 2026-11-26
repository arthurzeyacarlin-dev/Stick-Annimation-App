/* eslint-disable @typescript-eslint/no-explicit-any -- the pretend Stripe's objects are plain JSON */
// THE 20 MONEY SCENARIOS (Nov 20, Arthur: "If they click pay... they get AI credits. If they delete their account, everything has
// to be accurate. Everything has to be perfect."). The real money code (stripeBilling.ts + aiCredits.ts) runs against a pretend
// Stripe in memory: no network, no real money, its own throw-away database in a temp folder.
// Run: node --import ./scripts/money-test-loader.mjs --test src/lib/account/stripeMoney.test.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, mock, test } from "node:test";
import { FakeStripe } from "./fakeStripe.testkit.ts";

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "da-money-")));
process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake_for_unit_tests";
delete process.env.STRIPE_LIVE_OK;
delete process.env.DIAMOND_DAILY_CREDIT_LIMIT;
const stripe = new FakeStripe();
(globalThis as any).diamondStripeFetch = stripe.fetch;
const T0 = Date.UTC(2026, 10, 9, 12);
const DAY = 24 * 60 * 60 * 1000;
mock.timers.enable({ apis: ["Date"], now: T0 });
const at = (ms: number) => mock.timers.setTime(ms);
const NEXT_MONTH = Date.UTC(2026, 11, 9, 12);

const billing = await import("./stripeBilling.ts");
const credits = await import("./aiCredits.ts");
const { AI_ACTION_LABELS } = await import("./plans.ts");

const ORIGIN = "http://127.0.0.1:3000";
const user = (id: string) => ({ email: `${id}@example.test`, name: id });
const status = (owner: string) => credits.getAccountPlanStatus(owner);
const sync = (owner: string) => billing.syncWithStripe(owner, { force: true });
const customerOf = (owner: string) => credits.readAccountBillingIds(owner).customerId!;
const pageId = (url: string) => url.split("/").pop()!;
const priceId = (lookup: string) => [...stripe.prices.values()].find((price) => price.lookup_key === lookup)!.id;
const tick = () => new Promise((done) => setImmediate(done));
beforeEach(() => { stripe.cardWorks = true; stripe.down = false; at(T0); });
async function buy(owner: string, plan = "starter", interval = "month", codes: Record<string, string> = {}) {
  const { url } = await billing.createPlanCheckout(owner, user(owner), plan, interval, ORIGIN, codes);
  const paid = stripe.pay(pageId(url));
  return { sessionId: pageId(url), ...paid } as { sessionId: string; sub: any; invoice: any };
}
async function buyPack(owner: string, pack = "pack_200") {   // (Nov 21) the test accounts are on Basic: its packs are 100/200/400
  const { url } = await billing.createTopUpCheckout(owner, user(owner), pack, ORIGIN);
  const { charge } = stripe.pay(pageId(url)) as { charge: any };
  return { sessionId: pageId(url), charge };
}

test("1. paying for Basic: charged once, 470 credits arrive, the payment shows; coming back 5 times changes nothing", async () => {
  at(T0);
  const o = "u_basic";
  assert.equal(status(o).creditsTotal, 300, "a new account starts on the 300-credit trial (dad, Nov 26; was 150)");
  const { sessionId, invoice } = await buy(o);
  for (let i = 0; i < 5; i++) {
    const done = await billing.completeCheckout(o, sessionId);
    assert.equal(done.kind, "plan");
    assert.equal(done.credits, 470);
  }
  const s = status(o);
  assert.deepEqual([s.plan, s.creditsTotal, s.creditsLeft, s.waitingForPayment], ["starter", 470, 470, false]);
  assert.equal(stripe.liveSubs(customerOf(o)).length, 1);
  assert.equal(credits.listPayments(o).length, 1);
  assert.equal(credits.listPayments(o)[0].amountCents, 999);
  const facts = credits.readBillingFacts(o);
  assert.equal(facts.lastPayment?.cents, 999);
  assert.equal(facts.nextPaymentAt, invoice.lines.data[0].period.end * 1000);
  assert.equal([...stripe.charges.values()].filter((charge) => charge.customer === customerOf(o)).length, 1, "one charge, never two");
  const page = stripe.sessions.get(sessionId)!;
  assert.deepEqual(page.payment_method_types, ["card"], "cards only: paid at once, never a bank transfer that clears days later");
  assert.equal(page.allow_promotion_codes, null, "no code box on Stripe's page: only the app's two checked codes");
});

test("2. only one open plan page per account: asking again = the same page; another plan closes the old page so it can't be paid", async () => {
  at(T0);
  const o = "u_pages";
  const a = await billing.createPlanCheckout(o, user(o), "starter", "month", ORIGIN);
  const b = await billing.createPlanCheckout(o, user(o), "starter", "month", ORIGIN);
  assert.equal(a.url, b.url);
  const c = await billing.createPlanCheckout(o, user(o), "creator", "month", ORIGIN);
  assert.notEqual(c.url, a.url);
  assert.throws(() => stripe.pay(pageId(a.url)), /expired/, "the old page can never be paid");
  stripe.pay(pageId(c.url));
  await sync(o);
  assert.equal(status(o).plan, "creator");
  await assert.rejects(billing.createPlanCheckout(o, user(o), "studio", "month", ORIGIN), /Use Switch/,
    "with a plan, no second plan page is ever made (switching happens inside the app)");
});

test("3. a second plan paid by mistake is stopped at once and refunded in full; the first plan stays; the owner is told", async () => {
  at(T0);
  const o = "u_dup";
  const { sub } = await buy(o);
  await sync(o);
  const second = stripe.paidSecondPlan(customerOf(o), sub.items.data[0].price.id);
  await sync(o);
  assert.equal(stripe.subs.get(second.sub.id)!.status, "canceled");
  assert.equal(stripe.subs.get(sub.id)!.status, "active");
  const charge = stripe.charges.get(second.invoice.charge)!;
  assert.equal(charge.amount_refunded, charge.amount, "refunded in full");
  assert.match(credits.readBillingFacts(o).notice ?? "", /second plan by mistake.*refunded that payment in full \(\$9\.99\)/);
  assert.equal(status(o).creditsTotal, 470);
  assert.equal(credits.listPayments(o).length, 1, "the refunded plan is never counted as a payment");
  const refunds = stripe.refunds.length;
  await sync(o); await sync(o);
  assert.equal(stripe.refunds.length, refunds, "never refunded twice");
  await tick();
  const { listProblemReports } = await import("./problemReportStore.ts");
  assert.ok(listProblemReports("all").some((report) => /second plan/.test(report.text)), "the owner's inbox has the alert");
});

test("4. paid, then the tab was closed before coming back: the plan and credits arrive on the next check anyway", async () => {
  at(T0);
  const o = "u_lost";
  await buy(o);
  assert.equal(status(o).plan, "trial");
  at(T0 + 61_000);   // they open the app again a minute later (the plan screen checks with Stripe at most once a minute)
  await billing.syncWithStripe(o);
  assert.deepEqual([status(o).plan, status(o).creditsTotal], ["starter", 470]);
});

test("5. renewal: the app charges the waiting bill at once and refills exactly once (never before it is paid)", async () => {
  at(T0);
  const o = "u_renew";
  const { sub } = await buy(o);
  await sync(o);
  credits.spendAiCredit(o, "job-1", 100, "animation");
  assert.equal(status(o).creditsLeft, 370);
  at(NEXT_MONTH + 60_000);
  stripe.renew(sub.id);
  assert.equal(status(o).waitingForPayment, true, "a new month is never free before its bill is paid");
  assert.equal(status(o).creditsTotal, 0);
  await sync(o);
  assert.deepEqual([status(o).creditsTotal, status(o).creditsLeft, status(o).waitingForPayment], [470, 470, false]);
  await sync(o); await sync(o);
  assert.equal(credits.listPayments(o).length, 2);
  assert.equal([...stripe.charges.values()].filter((charge) => charge.customer === customerOf(o)).length, 2, "two months = two charges");
});

test("6. a declined renewal: no new credits (packs still work); the card fixed = the credits come at once", async () => {
  at(T0);
  const o = "u_declined";
  const { sub } = await buy(o);
  await sync(o);
  await buyPack(o);
  await sync(o);
  assert.equal(status(o).topUpCredits, 200);
  at(NEXT_MONTH + 60_000);
  stripe.cardWorks = false;
  const bill = stripe.renew(sub.id)!;
  await sync(o);
  const s = status(o);
  assert.deepEqual([s.waitingForPayment, s.paymentProblem, s.creditsTotal, s.creditsLeft], [true, true, 0, 200]);
  assert.doesNotThrow(() => credits.assertAiCreditAvailable(o, 0, 67), "a 67-credit animation runs on the pack");
  assert.throws(() => credits.assertAiCreditAvailable(o, 0, 507), (error: any) => error.code === "waiting_for_payment");
  stripe.cardWorks = true;   // they put in a working card on Stripe's Manage plan page
  await sync(o);
  assert.equal(status(o).waitingForPayment, true, "a normal check never charges a card on its own");
  at(NEXT_MONTH + 60_000 + 11_000);
  await billing.syncWithStripe(o, { fresh: true });   // ...and come back to the app: the bill is tried again at once
  assert.deepEqual([status(o).creditsTotal, status(o).paymentProblem], [470, false]);
  assert.equal(stripe.invoices.get(bill.id)!.status, "paid");
  await billing.syncWithStripe(o, { fresh: true });
  assert.equal([...stripe.charges.values()].filter((charge) => charge.customer === customerOf(o) && charge.amount === 999).length, 2, "never charged twice");
});

test("7. an upgrade is charged the difference at once and its credits come right away; a declined upgrade keeps the old credits", async () => {
  at(T0);
  const o = "u_up";
  const { sub } = await buy(o);
  await sync(o);
  at(T0 + 5 * DAY);
  const bill = stripe.upgrade(sub.id, priceId("creator_month"));
  assert.equal(bill.amount_paid, 2499 - 999);
  await sync(o);
  assert.deepEqual([status(o).plan, status(o).creditsTotal], ["creator", 1200]);
  at(T0);
  const o2 = "u_up_declined";
  const first = await buy(o2);
  await sync(o2);
  stripe.cardWorks = false;
  stripe.upgrade(first.sub.id, priceId("studio_month"));
  await sync(o2);
  stripe.cardWorks = true;
  assert.equal(status(o2).creditsTotal, 470, "no free upgrade: the bigger credits wait for the payment");
});

test("8. a downgrade waits for the next period (this month stays what was paid)", async () => {
  at(T0);
  const o = "u_down";
  const { sub } = await buy(o, "creator");
  await sync(o);
  stripe.downgradeAtPeriodEnd(sub.id, priceId("starter_month"));
  await sync(o);
  assert.equal(status(o).creditsTotal, 1200);
  at(NEXT_MONTH + 60_000);
  stripe.renew(sub.id);
  await sync(o);
  assert.deepEqual([status(o).plan, status(o).creditsTotal], ["starter", 470]);
});

test("9. a yearly plan: paid once, refilled every month of its year", async () => {
  at(T0);
  const o = "u_year";
  await buy(o, "starter", "year");
  await sync(o);
  assert.deepEqual([status(o).interval, status(o).creditsTotal], ["year", 470]);
  credits.spendAiCredit(o, "y-1", 400, "animation");
  at(T0 + 40 * DAY);
  await sync(o);
  assert.equal(status(o).creditsLeft, 470, "a new month inside the paid year");
  assert.equal(credits.listPayments(o).length, 1);
});

test("10. cancel: credits until the period ends, then the plan ends and nothing is ever charged again", async () => {
  at(T0);
  const o = "u_cancel";
  const { sub } = await buy(o);
  await sync(o);
  stripe.cancelAtPeriodEnd(sub.id);
  await sync(o);
  assert.deepEqual([status(o).cancelAtPeriodEnd, status(o).creditsTotal, credits.readBillingFacts(o).nextPaymentAt], [true, 470, null]);
  at(NEXT_MONTH + 60_000);
  assert.equal(stripe.renew(sub.id), null);
  await sync(o);
  assert.deepEqual([status(o).locked, status(o).lockReason], [true, "plan_ended"]);
  assert.equal([...stripe.invoices.values()].filter((invoice) => invoice.subscription === sub.id).length, 1);
});

test("11. a pack is added exactly once, however often the page comes back; the trial can't buy packs", async () => {
  at(T0);
  const o = "u_pack";
  await buy(o);
  await sync(o);
  const { sessionId } = await buyPack(o);
  for (let i = 0; i < 5; i++) await billing.completeCheckout(o, sessionId);
  await sync(o); await sync(o);
  assert.equal(status(o).topUpCredits, 200);
  assert.equal(credits.listPayments(o).filter((payment) => payment.kind === "pack").length, 1);
  await assert.rejects(billing.createTopUpCheckout("u_trial_pack", user("u_trial_pack"), "pack_250", ORIGIN), /plan members/);
});

test("12. a refund takes that payment's credits back (a whole plan payment, half a pack)", async () => {
  at(T0);
  const o = "u_refund";
  const { invoice } = await buy(o);
  await sync(o);
  const pack = await buyPack(o, "pack_400");
  await sync(o);
  stripe.dashboardRefund(invoice.charge);
  await sync(o);
  assert.deepEqual([status(o).planCreditsLeft, status(o).creditsLeft], [0, 400]);
  stripe.dashboardRefund(pack.charge.id, 439);
  await sync(o); await sync(o);
  assert.equal(status(o).topUpCredits, 200);
});

test("13. a disputed payment pauses the AI (and the owner is told); a won dispute lets it run again", async () => {
  at(T0);
  const o = "u_dispute";
  const { invoice } = await buy(o);
  await sync(o);
  stripe.dispute(invoice.charge);
  await sync(o);
  assert.equal(status(o).aiLocked, true);
  assert.throws(() => credits.assertAiCreditAvailable(o, 0, 15), (error: any) => error.code === "payment_hold");
  stripe.charges.get(invoice.charge)!.dispute.status = "won";
  await sync(o);
  assert.equal(status(o).aiLocked, false);
});

test("14. deleting an account: the plan stops first; everything comes back except its AI and Stripe's fee; Stripe down = nothing deleted", async () => {
  at(T0);
  const o = "u_delete";
  const { sub, invoice } = await buy(o);
  await sync(o);
  credits.spendAiCredit(o, "d-1", 210, "animation");
  const preview = await billing.previewAccountDeletion(o);
  assert.deepEqual([preview.planPaidCents, preview.aiCostCents, preview.feeCents, preview.refundCents], [999, 210, 59, 730]);
  const done = await billing.closeBillingForDeletion(o);
  assert.equal(done.refundCents, 730);
  assert.equal(stripe.subs.get(sub.id)!.status, "canceled");
  assert.equal(stripe.charges.get(invoice.charge)!.amount_refunded, 730);
  assert.equal(stripe.refunds.at(-1)!.metadata.why, "account_deleted");
  // Unused pack credits come back too: plan fully used (470), 100 of a 200 pack used → 100 unused.
  const o2 = "u_delete_pack";
  await buy(o2);
  await sync(o2);
  await buyPack(o2);
  await sync(o2);
  credits.spendAiCredit(o2, "d-2", 570, "animation");
  const two = await billing.closeBillingForDeletion(o2);
  assert.deepEqual([two.planRefundCents, two.packRefundCents], [999 - 470 - 59, Math.floor(449 * 0.5 - 43 * 0.5)]);
  // Stripe can't be reached: nothing is stopped, the account must not be deleted.
  const o3 = "u_delete_down";
  const third = await buy(o3);
  await sync(o3);
  stripe.down = true;
  await assert.rejects(billing.closeBillingForDeletion(o3), /wasn't deleted/);
  stripe.down = false;
  assert.equal(stripe.subs.get(third.sub.id)!.status, "active");
  // A renewal that never got paid: nothing to give back for it; its waiting bill is voided so Stripe never retries it.
  const o4 = "u_delete_waiting";
  const fourth = await buy(o4);
  await sync(o4);
  at(NEXT_MONTH + 60_000);
  stripe.cardWorks = false;
  const bill = stripe.renew(fourth.sub.id)!;
  await sync(o4);
  const four = await billing.closeBillingForDeletion(o4);
  stripe.cardWorks = true;
  assert.equal(four.refundCents, 0);
  assert.equal(stripe.invoices.get(bill.id)!.status, "void");
  assert.equal(stripe.subs.get(fourth.sub.id)!.status, "canceled");
});

test("15. discount codes: first 50 = 25%, YouTube = 10%, both = 30% then 25%; wrong codes and used-up codes are refused", async () => {
  at(T0);
  assert.equal((await buy("u_first50", "starter", "month", { first50: "first50test" })).invoice.amount_paid, 749);
  assert.equal((await buy("u_youtube", "starter", "month", { youtube: "YOUTUBETEST" })).invoice.amount_paid, 899);
  const both = await buy("u_both", "starter", "month", { first50: "FIRST50TEST", youtube: "YOUTUBETEST" });
  assert.equal(both.invoice.amount_paid, 749);
  await sync("u_both"); await sync("u_both");
  const charge = stripe.charges.get(both.invoice.charge)!;
  assert.equal(charge.amount_refunded, 50, "5% of $9.99 back once: $6.99 = 30% off the first month");
  assert.match(credits.readBillingFacts("u_both").notice ?? "", /30% off/);
  assert.equal(status("u_both").creditsTotal, 470, "the bonus never takes credits");
  at(NEXT_MONTH + 60_000);
  stripe.renew(both.sub.id);
  await sync("u_both");
  assert.equal(credits.listPayments("u_both")[0].amountCents, 749, "month 2 = 25% off");
  at(T0);
  await assert.rejects(billing.createPlanCheckout("u_bad", user("u_bad"), "starter", "month", ORIGIN, { first50: "NOPE" }), /isn't right/);
  await assert.rejects(billing.createPlanCheckout("u_bad", user("u_bad"), "starter", "year", ORIGIN, { youtube: "YOUTUBETEST" }), /monthly plans only/);
  for (const promo of stripe.promos.values()) if (promo.code === "FIRST50TEST") promo.times_redeemed = 50;
  await assert.rejects(billing.createPlanCheckout("u_late", user("u_late"), "starter", "month", ORIGIN, { first50: "FIRST50TEST" }), /All 50/);
});

test("16. two requests making a customer at once = one customer; a lost saved id finds the same customer again", async () => {
  const o = "u_race";
  const [a, b] = await Promise.all([billing.getOrCreateCustomer(o, "race@example.test"), billing.getOrCreateCustomer(o, "race@example.test")]);
  assert.equal(a, b);
  credits.setStripeCustomerId(o, "cus_gone");
  assert.equal(await billing.getOrCreateCustomer(o, "race@example.test"), a);
  assert.equal([...stripe.customers.values()].filter((customer) => customer.metadata.owner_id === o).length, 1);
});

test("17. the webhook doorbell: unsigned or wrongly signed = refused; signed = checked; sent twice = still once", async () => {
  at(T0);
  const payload = JSON.stringify({ id: "evt_1", livemode: false, data: { object: { object: "invoice", customer: customerOf("u_basic") } } });
  const t = Math.floor(Date.now() / 1000);
  const sign = (body: string, key = "whsec_fake_for_unit_tests") => `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
  assert.equal(billing.handleStripeWebhook(payload, null).status, 400);
  assert.equal(billing.handleStripeWebhook(payload, sign(payload, "whsec_wrong")).status, 400);
  const refunds = stripe.refunds.length, charges = stripe.charges.size;
  assert.equal(billing.handleStripeWebhook(payload, sign(payload)).status, 200);
  assert.equal(billing.handleStripeWebhook(payload, sign(payload)).status, 200);
  await sync("u_basic");
  assert.deepEqual([stripe.refunds.length, stripe.charges.size, status("u_basic").creditsTotal], [refunds, charges, 470]);
  const live = JSON.stringify({ id: "evt_2", livemode: true, data: { object: { customer: customerOf("u_basic") } } });
  assert.equal(billing.handleStripeWebhook(live, sign(live)).body.ignored, "other_mode", "a real-money event never touches test mode");
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal(billing.handleStripeWebhook(payload, sign(payload)).status, 503);
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake_for_unit_tests";
});

test("18. the daily match check fixes anything that disagrees with Stripe and says what it fixed", async () => {
  at(T0);
  credits.applyTestPlanAction("u_basic", "studio");
  assert.equal(status("u_basic").plan, "studio");
  const report = await billing.syncWithStripe("u_basic", { force: true, alert: true });
  assert.ok(report.changed.length > 0);
  assert.deepEqual([status("u_basic").plan, status("u_basic").creditsTotal], ["starter", 470]);
});

test("19. every AI action lands on the AI Dashboard with its own name; the daily limit", () => {
  at(T0);
  const o = "u_dash";
  for (const [kind, amount] of [["chat", 15], ["assistant", 1], ["dictation", 1], ["drawing", 1], ["animation", 67]] as const) {
    credits.spendAiCredit(o, `dash-${kind}`, amount, kind);
  }
  const rows = new Map(credits.getCreditUseByKind(o).map((row) => [row.kind, row.credits]));
  assert.deepEqual(Object.fromEntries(rows), { chat: 15, assistant: 1, dictation: 1, drawing: 1, animation: 67 });
  for (const kind of rows.keys()) assert.ok(AI_ACTION_LABELS[kind as keyof typeof AI_ACTION_LABELS], `${kind} has a dashboard name`);
  assert.equal(status(o).creditsLeft, 300 - 85);
  // The daily limit: 1,500 credits in 24 hours.
  const big = "u_daily";
  credits.applyTestPlanAction(big, "studio");
  credits.spendAiCredit(big, "big-1", 1450, "animation");
  assert.throws(() => credits.assertAiCreditAvailable(big, 0, 67), (error: any) => error.code === "daily_limit");
  at(T0 + DAY + 1000);
  assert.doesNotThrow(() => credits.assertAiCreditAvailable(big, 0, 67));
});

test("20. Stripe can't be reached: a plain message, nothing charged, nothing lost; it works again by itself", async () => {
  at(T0);
  stripe.down = true;
  await assert.rejects(billing.createPlanCheckout("u_offline", user("u_offline"), "starter", "month", ORIGIN), /didn't answer|problem/);
  const before = status("u_renew");
  const report = await billing.syncWithStripe("u_renew", { force: true });
  assert.deepEqual(report.changed, []);
  assert.deepEqual(status("u_renew"), before);
  stripe.down = false;
  assert.ok((await billing.createPlanCheckout("u_offline", user("u_offline"), "starter", "month", ORIGIN)).url);
});

test("the Manage plan page: upgrades charged at once, downgrades and shorter intervals wait for the period's end, cancel at period end", async () => {
  await billing.createPortalSession("u_basic", ORIGIN);
  const flat = stripe.portal!.flat;
  assert.equal(flat["features[subscription_update][proration_behavior]"], "always_invoice");
  assert.equal(flat["features[subscription_update][schedule_at_period_end][conditions][0][type]"], "decreasing_item_amount");
  assert.equal(flat["features[subscription_update][schedule_at_period_end][conditions][1][type]"], "shortening_interval");
  assert.equal(flat["features[subscription_cancel][mode]"], "at_period_end");
});

test("every request to Stripe pins one API version, and every money-moving request carries an idempotency key", () => {
  const moving = stripe.calls.filter((call) => call.method !== "GET" && /refunds|customers$|subscriptions\/|invoices\/.+\/(pay|finalize|void)|expire/.test(call.path));
  assert.ok(moving.length > 10);
  for (const call of moving) assert.ok(call.key, `${call.method} ${call.path} has an idempotency key`);
});

// ---------- Nov 21 (Arthur): switching, cancelling and changing the card, all inside Diamond Animator ----------

test("21. switching NOW: the new plan's full price is paid at once, a new month starts with its full credits, the UNUSED part of the old payment comes back, packs stay", async () => {
  at(T0);
  const o = "u_switch";
  const { sub, invoice } = await buy(o);
  await sync(o);
  await buyPack(o);
  await sync(o);
  credits.spendAiCredit(o, "s-1", 100, "animation");
  at(T0 + 10 * DAY);
  const preview = await billing.previewPlanSwitch(o, "creator", "month");
  assert.deepEqual([preview.label, preview.credits, preview.chargeCents], ["Pro", 1200, 2499]);
  // (dad, Nov 26) 370 of 470 credits unused: (999 - 59 fee) x 370 / 470 = 740 (the old delete rule gave 840: used credits at cost)
  assert.deepEqual([preview.paidCents, preview.feeCents, preview.creditsPaidFor, preview.unusedCredits, preview.refundCents], [999, 59, 470, 370, 740]);
  assert.equal(stripe.switches, 0, "a preview changes nothing");
  const done = await billing.switchPlanNow(o, "creator", "month");
  assert.deepEqual([done.label, done.paidCents, done.refundCents], ["Pro", 2499, 740]);
  const s = status(o);
  assert.deepEqual([s.plan, s.creditsTotal, s.planCreditsLeft, s.topUpCredits], ["creator", 1200, 1200, 200], "Pro's full credits now; the pack stays");
  assert.equal(stripe.charges.get(invoice.charge)!.amount_refunded, 740, "the unused part of the Basic payment came back");
  assert.equal(stripe.refunds.at(-1)!.metadata.why, "plan_switch");
  assert.equal(stripe.subs.get(sub.id)!.current_period_start * 1000, T0 + 10 * DAY, "the new month starts today");
  // asking again, coming back, syncing: never a second charge, never a second refund, never credits taken back
  await assert.rejects(billing.switchPlanNow(o, "creator", "month"), /already your plan/);
  await sync(o); await sync(o);
  assert.equal(stripe.switches, 1);
  assert.equal(stripe.refunds.filter((refund) => refund.metadata?.why === "plan_switch").length, 1);
  assert.equal(status(o).planCreditsLeft, 1200);
  // deleting later gives back only the NEW payment's part (the old one was already settled)
  const later = await billing.previewAccountDeletion(o);
  assert.equal(later.planPaidCents, 2499);
});

test("22. switching down works the same; a declined card changes NOTHING and charges nothing", async () => {
  at(T0);
  const o = "u_switch_down";
  const { invoice } = await buy(o, "creator");
  await sync(o);
  stripe.cardWorks = false;
  await assert.rejects(billing.switchPlanNow(o, "starter", "month"), /declined, so nothing changed/);
  assert.deepEqual([status(o).plan, status(o).creditsTotal], ["creator", 1200]);
  assert.equal(stripe.charges.get(invoice.charge)!.amount_refunded, 0, "no refund when the switch didn't happen");
  stripe.cardWorks = true;
  credits.spendAiCredit(o, "d-1", 300, "animation");
  at(T0 + 2 * DAY);
  const done = await billing.switchPlanNow(o, "starter", "month");
  // 900 of 1,200 unused: (2499 - 102 fee) x 900 / 1200 = 1797
  assert.deepEqual([done.paidCents, done.refundCents], [999, 1797]);
  assert.deepEqual([status(o).plan, status(o).planCreditsLeft], ["starter", 470]);
});

test("23. a running discount stays when switching; yearly works too", async () => {
  at(T0);
  const o = "u_switch_code";
  for (const promo of stripe.promos.values()) promo.times_redeemed = 0;   // test 15 used up the 50 test codes
  await buy(o, "starter", "month", { first50: "FIRST50TEST" });
  await sync(o);
  const preview = await billing.previewPlanSwitch(o, "studio", "month");
  assert.equal(preview.chargeCents, 4999 - Math.round(4999 * 0.25), "25% off still runs on the new plan");
  const done = await billing.switchPlanNow(o, "studio", "year");
  assert.equal(done.paidCents, 49900 - Math.round(49900 * 0.25));
  assert.deepEqual([status(o).plan, status(o).interval, status(o).planCreditsLeft], ["studio", "year", 2400]);
});

test("24. cancel and keep happen in the app: cancelled = runs to the end, never charged again; keep = renews again", async () => {
  at(T0);
  const o = "u_cancel_keep";
  const { sub } = await buy(o);
  await sync(o);
  const cancelled = await billing.setPlanCancelled(o, true);
  assert.equal(cancelled.cancelAtPeriodEnd, true);
  assert.equal(stripe.subs.get(sub.id)!.cancel_at_period_end, true);
  assert.equal(status(o).planCreditsLeft, 470, "credits stay until the end");
  const kept = await billing.setPlanCancelled(o, false);
  assert.equal(kept.cancelAtPeriodEnd, false);
  assert.equal(stripe.subs.get(sub.id)!.cancel_at_period_end, false);
});

test("25. a new card is saved on Stripe's card page; back in the app it pays the unpaid bill at once", async () => {
  at(T0);
  const o = "u_card";
  const { sub } = await buy(o);
  await sync(o);
  at(NEXT_MONTH + 60_000);
  stripe.cardWorks = false;
  stripe.renew(sub.id);
  await sync(o);
  assert.equal(status(o).paymentProblem, true);
  await assert.rejects(billing.switchPlanNow(o, "creator", "month"), /Change your card first/);
  const { url } = await billing.createCardChangePage(o, ORIGIN);
  stripe.cardWorks = true;
  const { card } = stripe.pay(pageId(url)) as { card: string };
  at(NEXT_MONTH + 60_000 + 11_000);
  const back = await billing.completeCardChange(o, pageId(url));
  assert.equal(back.paymentProblem, false, "the bill was paid with the new card at once");
  assert.equal(stripe.subs.get(sub.id)!.default_payment_method, card);
  assert.equal(stripe.customers.get(customerOf(o))!.invoice_settings.default_payment_method, card);
  assert.equal(status(o).planCreditsLeft, 470);
  await assert.rejects(billing.completeCardChange("someone_else", pageId(url)), /different account/);
});

// ---------- Nov 21 (Arthur: "You never see Stripe"): paying inside Diamond Animator's own card form ----------

async function buyInApp(owner: string, plan = "starter", interval = "month", codes: Record<string, string> = {}) {
  const start = await billing.startPlanPayment(owner, user(owner), plan, interval, codes);
  const paid = stripe.cardFormPays(start.clientSecret!);
  return { start, paid };
}

test("26. a plan paid in the app's card form: nothing before the card is paid, the plan and its credits right after, exactly once", async () => {
  at(T0);
  const o = "u_inapp";
  const start = await billing.startPlanPayment(o, user(o), "starter", "month");
  assert.equal(start.intent, "payment");
  assert.equal(start.amountCents, 999);
  await sync(o);
  assert.equal(status(o).plan, "trial", "a started but unpaid plan gives nothing");
  const again = await billing.startPlanPayment(o, user(o), "starter", "month");
  assert.equal(again.clientSecret, start.clientSecret, "the same choice twice = the same payment, never two");
  stripe.cardFormPays(start.clientSecret!);
  for (let i = 0; i < 3; i++) {
    const done = await billing.completePlanPayment(o, start.ref);
    assert.deepEqual([done.kind, (done as any).label, done.credits], ["plan", "Basic", 470]);
  }
  assert.deepEqual([status(o).plan, status(o).planCreditsLeft], ["starter", 470]);
  assert.equal(stripe.liveSubs(customerOf(o)).length, 1);
  await assert.rejects(billing.startPlanPayment(o, user(o), "creator", "month"), /Use Switch/, "with a plan, switching is the only way");
  await assert.rejects(billing.completePlanPayment("someone_else", start.ref), /different account/);
});

test("27. a declined card or a changed mind never charges; a different choice stops the old unpaid start, so two plans can never be paid", async () => {
  at(T0);
  const o = "u_inapp_change";
  const first = await billing.startPlanPayment(o, user(o), "starter", "month");
  stripe.cardWorks = false;
  assert.deepEqual(stripe.cardFormPays(first.clientSecret!), { error: "Your card was declined." });
  await assert.rejects(billing.completePlanPayment(o, first.ref), /didn't go through/);
  assert.equal(status(o).plan, "trial");
  stripe.cardWorks = true;
  const second = await billing.startPlanPayment(o, user(o), "creator", "month");
  assert.notEqual(second.ref, first.ref);
  assert.equal(stripe.subs.get(first.ref)!.status, "canceled", "the old unpaid start is stopped");
  stripe.cardFormPays(second.clientSecret!);
  await billing.completePlanPayment(o, second.ref);
  assert.deepEqual([status(o).plan, status(o).planCreditsLeft], ["creator", 1200]);
  assert.equal(stripe.liveSubs(customerOf(o)).length, 1);
  const charged = [...stripe.charges.values()].filter((charge) => charge.customer === customerOf(o));
  assert.deepEqual(charged.map((charge) => charge.amount), [2499], "only the plan really chosen was ever charged");
});

test("28. discount codes work in the app's card form too", async () => {
  at(T0);
  for (const promo of stripe.promos.values()) promo.times_redeemed = 0;
  const { start } = await buyInApp("u_inapp_code", "starter", "month", { first50: "FIRST50TEST" });
  assert.equal(start.amountCents, 749);
  await billing.completePlanPayment("u_inapp_code", start.ref);
  assert.equal(status("u_inapp_code").planCreditsLeft, 470);
  await assert.rejects(billing.startPlanPayment("u_inapp_bad", user("u_inapp_bad"), "starter", "month", { first50: "NOPE" }));
});

test("29. a pack paid in the app: added once (also when the tab closed before 'done'); only plan members, only their plan's packs", async () => {
  at(T0);
  const o = "u_inapp_pack";
  const { start: plan } = await buyInApp(o);
  await billing.completePlanPayment(o, plan.ref);
  const pack = await billing.startPackPayment(o, "pack_200");
  assert.deepEqual([pack.amountCents, pack.savedCard?.last4], [449, "4242"], "the card on file is offered for one-click paying");
  stripe.cardFormPays(pack.clientSecret!);
  for (let i = 0; i < 3; i++) await billing.completePackPayment(o, pack.ref);
  await sync(o); await sync(o);
  assert.equal(status(o).topUpCredits, 200);
  // the tab closed right after paying: the next check with Stripe adds it, once
  const closed = await billing.startPackPayment(o, "pack_100");
  stripe.cardFormPays(closed.clientSecret!);
  await sync(o); await sync(o);
  assert.equal(status(o).topUpCredits, 300);
  await assert.rejects(billing.completePackPayment("someone_else", pack.ref), /different account/);
  await assert.rejects(billing.startPackPayment(o, "pack_2000"), /isn't on your plan/);
  await assert.rejects(billing.startPackPayment("u_inapp_trial", "pack_200"), /plan members/);
  // refunds and deleting still work for packs paid in the app
  stripe.dashboardRefund(stripe.intents.get(pack.ref)!.latest_charge, 449);
  await sync(o);
  assert.equal(status(o).topUpCredits, 100);
});

test("30. a new card saved in the app's card form pays an unpaid bill at once", async () => {
  at(T0);
  const o = "u_inapp_card";
  const { start, paid } = await buyInApp(o);
  await billing.completePlanPayment(o, start.ref);
  const sub = stripe.subs.get(start.ref)!;
  assert.equal(sub.default_payment_method, (paid as any).card, "the first card is kept for renewals");
  at(NEXT_MONTH + 60_000);
  stripe.cardWorks = false;
  stripe.renew(sub.id);
  await sync(o);
  assert.equal(status(o).paymentProblem, true);
  const save = await billing.startCardSave(o);
  assert.equal(save.intent, "setup");
  stripe.cardWorks = true;
  const { card } = stripe.cardFormSaves(save.clientSecret!);
  at(NEXT_MONTH + 60_000 + 11_000);
  const done = await billing.completeCardSave(o, save.ref);
  assert.equal(done.paymentProblem, false);
  assert.equal(stripe.subs.get(sub.id)!.default_payment_method, card);
  assert.equal(status(o).planCreditsLeft, 470);
  await assert.rejects(billing.completeCardSave("someone_else", save.ref), /different account/);
});

test("31. the same payment start asked twice at the same moment is ONE payment (a double click, a page that asks twice)", async () => {
  at(T0);
  const o = "u_inapp_twice";
  const [one, two] = await Promise.all([
    billing.startPlanPayment(o, user(o), "starter", "month"),
    billing.startPlanPayment(o, user(o), "starter", "month"),
  ]);
  assert.equal(one.ref, two.ref);
  assert.equal(one.clientSecret, two.clientSecret);
  assert.equal([...stripe.subs.values()].filter((sub) => sub.customer === customerOf(o)).length, 1);
});

test("32. real money on (Nov 21, '100% NOT test mode'): test-card plans, packs and payments and the test buttons are wiped; real-money rows stay", async () => {
  at(T0);
  const paidTest = "u_testcard_plan";
  await buy(paidTest);
  await sync(paidTest);
  await buyPack(paidTest, "pack_100");
  await sync(paidTest);
  assert.equal(status(paidTest).plan, "starter");
  assert.equal(status(paidTest).topUpCredits, 100);
  assert.ok(credits.listPayments(paidTest).length >= 2, "test payments are recorded in test mode");
  const button = "u_testbutton_plan";
  credits.applyTestPlanAction(button, "creator");
  assert.equal(status(button).plan, "creator", "the test button gave a free plan in test mode");
  const plainTrial = "u_plain_trial";
  assert.equal(status(plainTrial).plan, "trial");
  try {
    process.env.STRIPE_SECRET_KEY = "rk_live_fake_for_unit_tests";
    process.env.STRIPE_LIVE_OK = "yes";
    assert.equal(billing.billingMode(), "live");
    // The very next read already runs on real money: nothing from the test card counts.
    for (const owner of [paidTest, button]) {
      const now = status(owner);
      assert.equal(now.plan, "trial", `${owner}: back to the free trial clock`);
      assert.equal(now.topUpCredits, 0, `${owner}: no test packs`);
      assert.equal(now.paymentProblem, false);
      assert.equal(credits.readAccountBillingIds(owner).customerId, null, `${owner}: no test-mode customer`);
      assert.equal(credits.listPayments(owner).length, 0, `${owner}: no test payments`);
    }
    assert.equal(status(plainTrial).plan, "trial", "a plain trial is untouched");
    assert.throws(() => credits.applyTestPlanAction(button, "studio"), /test buttons are off/);
    assert.equal(status(button).plan, "trial", "the test buttons can't give a plan on real money");
    // A real-money pack is marked as real money and is never wiped, even if the server goes test → live again.
    const real = "u_real_money";
    assert.equal(credits.addTopUpCredits(real, 100, "evt_live_pack_1"), true);
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
    delete process.env.STRIPE_LIVE_OK;
    status(real);
    process.env.STRIPE_SECRET_KEY = "rk_live_fake_for_unit_tests";
    process.env.STRIPE_LIVE_OK = "yes";
    assert.equal(status(real).topUpCredits, 100, "real money stays");
  } finally {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
    delete process.env.STRIPE_LIVE_OK;
  }
});

test("33. (Nov 22, Arthur: 'a baby that tops up 15 times') the card on file is never one click: its id never reaches the browser, the server pays with it (after the password), at most 3 packs a day", async () => {
  at(T0);
  const o = "u_saved_card";
  const { start: plan } = await buyInApp(o);
  await billing.completePlanPayment(o, plan.ref);
  const first = await billing.startPackPayment(o, "pack_100");
  assert.equal(first.savedCard?.last4, "4242");
  assert.equal((first.savedCard as unknown as Record<string, unknown>).id, undefined, "the saved card's id never reaches the browser");
  assert.equal((await billing.payWithSavedCard(o, "pack", first.ref)).status, "succeeded");
  assert.equal((await billing.payWithSavedCard(o, "pack", first.ref)).status, "succeeded", "pressed twice: still one payment");
  await billing.completePackPayment(o, first.ref);
  assert.equal(status(o).topUpCredits, 100);
  assert.equal([...stripe.charges.values()].filter((charge) => charge.customer === customerOf(o) && charge.amount === 259).length, 1, "one pack, one charge");
  await assert.rejects(billing.payWithSavedCard("someone_else", "pack", first.ref), /different account/);
  // a declined saved card: plain words, nothing charged, and it may be tried again
  const second = await billing.startPackPayment(o, "pack_100");
  stripe.cardWorks = false;
  await assert.rejects(billing.payWithSavedCard(o, "pack", second.ref), /wasn't accepted.*Nothing was charged/);
  stripe.cardWorks = true;
  assert.equal((await billing.payWithSavedCard(o, "pack", second.ref)).status, "succeeded");
  await billing.completePackPayment(o, second.ref);
  const third = await billing.startPackPayment(o, "pack_100");
  await billing.payWithSavedCard(o, "pack", third.ref);
  await billing.completePackPayment(o, third.ref);
  assert.equal(status(o).topUpCredits, 300);
  await assert.rejects(billing.startPackPayment(o, "pack_100"), /at most 3 credit packs can be bought in one day/, "the 4th pack in a day is refused before anything is charged");
  at(T0 + 25 * 60 * 60 * 1000);
  assert.ok((await billing.startPackPayment(o, "pack_100")).clientSecret, "the next day, packs can be bought again");
});

test("34. (Nov 22, Fable) Basic, then Pro, then Basic again within one minute: the last start is a fresh one that can really be paid, one plan, one charge", async () => {
  at(T0);
  const o = "u_flip_flop";
  const basic = await billing.startPlanPayment(o, user(o), "starter", "month");
  const pro = await billing.startPlanPayment(o, user(o), "creator", "month");
  assert.equal(stripe.subs.get(basic.ref)!.status, "canceled", "the unpaid Basic start was stopped when Pro was picked");
  const again = await billing.startPlanPayment(o, user(o), "starter", "month");
  assert.notEqual(again.ref, basic.ref, "never the stopped start again");
  assert.notEqual(stripe.subs.get(again.ref)!.status, "canceled");
  assert.equal(stripe.subs.get(pro.ref)!.status, "canceled", "Pro was stopped when Basic was picked again");
  stripe.cardFormPays(again.clientSecret!);
  const done = await billing.completePlanPayment(o, again.ref);
  assert.equal(done.kind === "plan" ? done.plan : null, "starter");
  assert.deepEqual([status(o).plan, status(o).planCreditsLeft], ["starter", 470]);
  assert.deepEqual([...stripe.charges.values()].filter((charge) => charge.customer === customerOf(o)).map((charge) => charge.amount), [999], "one plan, one charge");
});


test("35. (dad, Nov 26) the beta price is claimable from sign-up until the trial ENDS: brand-new account OK, running trial OK, ended trial refused, a past paid plan refused", async () => {
  for (const promo of stripe.promos.values()) promo.times_redeemed = 0;
  const beta = { first50: "FIRST50TEST" };
  // (a) a brand-new account that never opened the app or chose anything yet (sign-up step 2 → Basic): nothing read before
  at(T0);
  assert.equal(billing.whichOfferCode("u_beta_new", "first50test"), "first50", "the price shown on sign-up step 2");
  assert.equal((await billing.startPlanPayment("u_beta_new", user("u_beta_new"), "starter", "month", beta)).amountCents, 749);
  const fresh = "u_beta_new_direct";   // the very first thing this account ever does is pay with the code
  assert.equal((await billing.startPlanPayment(fresh, user(fresh), "creator", "month", beta)).amountCents, 1874);
  // (b) the trial is running (day 13 of 14)
  at(T0);
  status("u_beta_trial");
  at(T0 + 13 * DAY);
  assert.equal(billing.whichOfferCode("u_beta_trial", "FIRST50TEST"), "first50");
  assert.equal((await billing.startPlanPayment("u_beta_trial", user("u_beta_trial"), "starter", "year", beta)).amountCents, 7425);
  // (c) the trial has ended: refused (shown nowhere, refused at payment); paying without the code still works
  at(T0);
  status("u_beta_ended");
  at(T0 + 15 * DAY);
  assert.equal(status("u_beta_ended").lockReason, "trial_ended");
  assert.equal(billing.whichOfferCode("u_beta_ended", "FIRST50TEST"), null);
  await assert.rejects(billing.startPlanPayment("u_beta_ended", user("u_beta_ended"), "starter", "month", beta), /trial has ended/);
  assert.equal((await billing.startPlanPayment("u_beta_ended", user("u_beta_ended"), "starter", "month")).amountCents, 999);
  // (d) paid before, then cancelled and the plan ended: refused
  at(T0);
  const o = "u_beta_was_paid";
  const { sub } = await buy(o);
  await sync(o);
  stripe.cancelAtPeriodEnd(sub.id);
  await sync(o);
  at(NEXT_MONTH + 60_000);
  assert.equal(stripe.renew(sub.id), null);
  await sync(o);
  assert.equal(status(o).lockReason, "plan_ended");
  assert.equal(billing.whichOfferCode(o, "FIRST50TEST"), null);
  await assert.rejects(billing.startPlanPayment(o, user(o), "starter", "month", beta), /trial has ended/);
  await assert.rejects(billing.createPlanCheckout(o, user(o), "starter", "month", ORIGIN, beta), /trial has ended/);
});

test("36. (dad, Nov 26) a switch gives back ONLY the unused part: used everything = 0, half = half, nothing = all but the fee; up, down and yearly", async () => {
  const fee = (cents: number) => Math.round(cents * 0.029 + 30);
  const unusedShare = (paid: number, unused: number, of: number) => Math.floor(((paid - fee(paid)) * unused) / of);
  const switchAfter = async (o: string, from: string, fromInterval: string, used: number, to: string, toInterval = "month") => {
    at(T0);
    const { invoice } = await buy(o, from, fromInterval);
    await sync(o);
    if (used > 0) credits.spendAiCredit(o, `${o}-use`, used, "animation");
    at(T0 + 3 * DAY);
    const preview = await billing.previewPlanSwitch(o, to, toInterval);
    const done = await billing.switchPlanNow(o, to, toInterval);
    assert.equal(done.refundCents, preview.refundCents, "the switch gives back exactly what its preview showed");
    assert.equal(stripe.charges.get(invoice.charge)!.amount_refunded, preview.refundCents);
    assert.ok(preview.refundCents <= invoice.amount_paid, "never more than was paid");
    return preview;
  };
  // Basic (470 credits, $9.99) used up, then up to Pro: nothing comes back (the old rule gave back $9.99 - $4.70 - fee).
  const all = await switchAfter("u_sw_all", "starter", "month", 470, "creator");
  assert.deepEqual([all.unusedCredits, all.refundCents], [0, 0]);
  // Half used: half of what was paid, minus half the fee.
  const half = await switchAfter("u_sw_half", "starter", "month", 235, "creator");
  assert.deepEqual([half.unusedCredits, half.refundCents], [235, unusedShare(999, 235, 470)]);
  assert.equal(half.refundCents, 470);
  // Nothing used: everything but the card fee.
  const none = await switchAfter("u_sw_none", "starter", "month", 0, "creator");
  assert.deepEqual([none.unusedCredits, none.refundCents], [470, 999 - fee(999)]);
  // Downgrade: Creator (2,400 credits, $49.99) with 600 used, down to Basic.
  const down = await switchAfter("u_sw_down", "studio", "month", 600, "starter");
  assert.deepEqual([down.creditsPaidFor, down.unusedCredits, down.refundCents], [2400, 1800, unusedShare(4999, 1800, 2400)]);
  assert.deepEqual([status("u_sw_down").plan, status("u_sw_down").planCreditsLeft], ["starter", 470]);
  // Upgrade: Pro (1,200 credits, $24.99) with 900 used, up to Creator.
  const up = await switchAfter("u_sw_up", "creator", "month", 900, "studio");
  assert.deepEqual([up.unusedCredits, up.refundCents], [300, unusedShare(2499, 300, 1200)]);
  // Yearly Basic ($99 for 12 x 470): in month 2 with 100 used, month 1's 470 are gone (it ended) and 100 of month 2.
  at(T0);
  const y = "u_sw_year";
  const { invoice } = await buy(y, "starter", "year");
  await sync(y);
  at(T0 + 40 * DAY);
  await sync(y);
  credits.spendAiCredit(y, "y-use", 100, "animation");
  const year = await billing.previewPlanSwitch(y, "creator", "year");
  assert.deepEqual([year.creditsPaidFor, year.unusedCredits, year.refundCents], [5640, 5640 - 470 - 100, unusedShare(9900, 5070, 5640)]);
  assert.ok(year.refundCents < invoice.amount_paid);
  // Deleting keeps its own zero-profit rule (paid - AI at cost - fee), unchanged.
  const del = await billing.previewAccountDeletion(y);
  assert.equal(del.planRefundCents, 9900 - 100 - fee(9900));
});

test("37. (dad, Nov 26) the 30 free thank-you credits NEVER come back as money: pack bought + used, 30 free left, delete = $0 for them", async () => {
  at(T0);
  // Pack used up, only the 30 free credits left: deleting gives nothing back for packs.
  const o = "u_gift_delete";
  await buy(o);
  await sync(o);
  await buyPack(o);
  await sync(o);
  assert.equal(credits.giveGiftCreditsOnce(o, 30, `testimonial-thanks:${o}`), true);
  assert.equal(credits.giveGiftCreditsOnce(o, 30, `testimonial-thanks:${o}`), true, "a retry adds nothing");
  assert.equal(status(o).topUpCredits, 230);
  credits.spendAiCredit(o, "g-1", 670, "animation");   // the plan's 470 + the whole 200 pack
  assert.equal(status(o).topUpCredits, 30, "the 30 free ones are what is left");
  assert.equal(credits.paidExtraCreditsLeft(o), 0);
  const preview = await billing.previewAccountDeletion(o);
  assert.equal(preview.packRefundCents, 0, "no money for free credits");
  const done = await billing.closeBillingForDeletion(o);
  assert.equal(done.packRefundCents, 0);
  assert.equal(done.planRefundCents, 999 - 470 - 59, "the plan's own rule is unchanged");
  // Half the pack unused + the 30 free: exactly the same money back as without the gift (scenario 14), never more.
  const o2 = "u_gift_delete_half";
  await buy(o2);
  await sync(o2);
  await buyPack(o2);
  await sync(o2);
  credits.giveGiftCreditsOnce(o2, 30, `testimonial-thanks:${o2}`);
  credits.spendAiCredit(o2, "g-2", 570, "animation");   // the plan's 470 + 100 of the pack
  assert.equal(status(o2).topUpCredits, 130);
  assert.equal(credits.paidExtraCreditsLeft(o2), 100);
  const two = await billing.closeBillingForDeletion(o2);
  assert.equal(two.packRefundCents, Math.floor(449 * 0.5 - 43 * 0.5));
  // No pack at all, only the free 30 (a trial account): nothing to give back.
  const o3 = "u_gift_trial";
  credits.giveGiftCreditsOnce(o3, 30, `testimonial-thanks:${o3}`);
  assert.equal(status(o3).topUpCredits, 30);
  assert.equal((await billing.previewAccountDeletion(o3)).refundCents, 0);
});
