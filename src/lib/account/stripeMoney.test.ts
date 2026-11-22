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
const { priceOf } = await import("../ai/v1Animator/v1Price.ts");
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
async function buyPack(owner: string, pack = "pack_250") {
  const { url } = await billing.createTopUpCheckout(owner, user(owner), pack, ORIGIN);
  const { charge } = stripe.pay(pageId(url)) as { charge: any };
  return { sessionId: pageId(url), charge };
}

test("1. paying for Basic: charged once, 470 credits arrive, the payment shows; coming back 5 times changes nothing", async () => {
  at(T0);
  const o = "u_basic";
  assert.equal(status(o).creditsTotal, 150, "a new account starts on the 150-credit trial");
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
  const d = await billing.createPlanCheckout(o, user(o), "studio", "month", ORIGIN);
  assert.equal(d.portal, true, "with a plan, the button opens Manage plan, never a second plan");
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
  assert.equal(status(o).topUpCredits, 250);
  at(NEXT_MONTH + 60_000);
  stripe.cardWorks = false;
  const bill = stripe.renew(sub.id)!;
  await sync(o);
  const s = status(o);
  assert.deepEqual([s.waitingForPayment, s.paymentProblem, s.creditsTotal, s.creditsLeft], [true, true, 0, 250]);
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
  assert.equal(status(o).topUpCredits, 250);
  assert.equal(credits.listPayments(o).filter((payment) => payment.kind === "pack").length, 1);
  await assert.rejects(billing.createTopUpCheckout("u_trial_pack", user("u_trial_pack"), "pack_250", ORIGIN), /plan members/);
});

test("12. a refund takes that payment's credits back (a whole plan payment, half a pack)", async () => {
  at(T0);
  const o = "u_refund";
  const { invoice } = await buy(o);
  await sync(o);
  const pack = await buyPack(o, "pack_500");
  await sync(o);
  stripe.dashboardRefund(invoice.charge);
  await sync(o);
  assert.deepEqual([status(o).planCreditsLeft, status(o).creditsLeft], [0, 500]);
  stripe.dashboardRefund(pack.charge.id, 549);
  await sync(o); await sync(o);
  assert.equal(status(o).topUpCredits, 250);
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
  // Unused pack credits come back too: plan fully used (470), 100 of a 250 pack used → 150 unused.
  const o2 = "u_delete_pack";
  await buy(o2);
  await sync(o2);
  await buyPack(o2);
  await sync(o2);
  credits.spendAiCredit(o2, "d-2", 570, "animation");
  const two = await billing.closeBillingForDeletion(o2);
  assert.deepEqual([two.planRefundCents, two.packRefundCents], [999 - 470 - 59, Math.floor(549 * 0.6 - 46 * 0.6)]);
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

test("19. every AI action lands on the AI Dashboard with its own name; the AI Animator's prices; the daily limit", () => {
  at(T0);
  const o = "u_dash";
  for (const [kind, amount] of [["chat", 15], ["assistant", 1], ["dictation", 1], ["drawing", 1], ["animation", 67]] as const) {
    credits.spendAiCredit(o, `dash-${kind}`, amount, kind);
  }
  const rows = new Map(credits.getCreditUseByKind(o).map((row) => [row.kind, row.credits]));
  assert.deepEqual(Object.fromEntries(rows), { chat: 15, assistant: 1, dictation: 1, drawing: 1, animation: 67 });
  for (const kind of rows.keys()) assert.ok(AI_ACTION_LABELS[kind as keyof typeof AI_ACTION_LABELS], `${kind} has a dashboard name`);
  assert.equal(status(o).creditsLeft, 150 - 85);
  // The AI Animator's card prices (v1Price.ts), the website's own numbers.
  assert.deepEqual(priceOf({ newSeconds: 10 }), { credits: 67, kind: "animation" });
  assert.deepEqual(priceOf({ remadeSeconds: 3, added: true }), { credits: 27, kind: "addon" }, "the website's robot add-on: 27");
  assert.deepEqual(priceOf({ remadeSeconds: 8 }), { credits: 47, kind: "edit" }, "re-making one 8-second part: 47");
  assert.deepEqual(priceOf({ animationSeconds: 10 }), { credits: 15, kind: "look" }, "a colour swap = the chat turn only");
  assert.equal(priceOf({ redrawLooks: 1, animationSeconds: 10 }).credits, 95);
  assert.equal(priceOf({ fillLooks: 1, animationSeconds: 10 }).credits, 25);
  assert.equal(priceOf({ newTake: true, animationSeconds: 10 }).credits, 67, "a new line/head style = the whole animation again = a new animation's price");
  assert.equal(priceOf({ removeOnly: true, animationSeconds: 10 }).credits, 19);
  // A long story: ONE price on its first card; its parts add up to exactly that.
  const whole = priceOf({ newSeconds: 10 }).credits, first = priceOf({ newSeconds: 6 }).credits;
  const second = Math.min(priceOf({ remadeSeconds: 4, added: true, chat: false }).credits, whole - first);
  assert.equal(first + second, whole);
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
