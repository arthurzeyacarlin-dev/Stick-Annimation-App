// Nov 26 (dad: "30 free credits is fine"): the testimonial thank-you goes through the normal extra-credit balance, once per
// account, shows on the balance, is never touched by a refund of a payment it isn't part of, and goes with the account.
// Run: node --test src/lib/account/giftCredits.test.ts  (uses a throwaway folder, never the real credits file)
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("gift credits: once per account, on the balance, kept by refunds of other payments, gone with the account", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gift-credits-"));
  const home = process.cwd();
  delete process.env.STRIPE_SECRET_KEY;
  process.chdir(dir);
  try {
    const credits = await import("./aiCredits.ts");
    const { testimonialThankYouEvent, TESTIMONIAL_THANK_YOU_CREDITS } = await import("./testimonials.ts");
    const before = credits.getAccountPlanStatus("u1");
    assert.equal(credits.giveGiftCreditsOnce("u1", TESTIMONIAL_THANK_YOU_CREDITS, testimonialThankYouEvent("u1")), true);
    // a retry / double click: true (they have them) but nothing more is added
    assert.equal(credits.giveGiftCreditsOnce("u1", TESTIMONIAL_THANK_YOU_CREDITS, testimonialThankYouEvent("u1")), true);
    const after = credits.getAccountPlanStatus("u1");
    assert.equal(after.topUpCredits, before.topUpCredits + 30);
    assert.equal(after.creditsLeft, before.creditsLeft + 30);
    // another account can't claim this one's thank-you record
    assert.equal(credits.giveGiftCreditsOnce("u2", 30, testimonialThankYouEvent("u1")), false);
    assert.equal(credits.getAccountPlanStatus("u2").topUpCredits, 0);
    // a refund of a pack bought later takes back only that pack's credits; the 30 free ones stay
    credits.addTopUpCredits("u1", 500, "cs_pack");
    credits.recordPayment({ stripeId: "cs_pack", ownerId: "u1", kind: "pack", amountCents: 500, credits: 500, plan: null, periodFrom: null, periodUntil: null,
      paidAt: Date.now(), chargeId: "ch_1", paymentIntentId: "pi_1", subscriptionId: null } as Parameters<typeof credits.recordPayment>[0]);
    assert.equal(credits.applyRefundTotal("cs_pack", 500), 500);
    assert.equal(credits.getAccountPlanStatus("u1").topUpCredits, 30);
    // deleting the account deletes them (and the once-only record) with everything else
    credits.deleteAccountPlan("u1");
    assert.equal(credits.getAccountPlanStatus("u1").topUpCredits, 0);
  } finally {
    process.chdir(home);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
