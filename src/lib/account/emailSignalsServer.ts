import "server-only";
// Follow-up emails (SPEC-0030): reads an account's plan facts (read only, nothing about credits or money changes) and passes
// them to emailSignals.ts. A quiet check every 6 hours also covers paying accounts that don't open the app, so "your payment
// didn't go through" and "your plan has ended" still reach the email service. Off when DIAMOND_EMAIL_SITE_ID is not set.
import { getAccountPlanStatus, hasMadeAnimation, listBillingOwners, readAccountBillingIds } from "./aiCredits";
import type { AccountPlanStatus } from "./plans";
import { sendEmailSignals } from "./emailSignals";

const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
const cache = globalThis as typeof globalThis & { diamondEmailSignalSweeper?: boolean };

/** Sends this account's new facts (the plan status is passed in when the caller already has it). Never waits, never throws. */
export function sendAccountEmailSignals(ownerId: string, email: string | null | undefined, status?: AccountPlanStatus) {
  try {
    sendEmailSignals(ownerId, email, status ?? getAccountPlanStatus(ownerId), {
      subscriptionId: readAccountBillingIds(ownerId).subscriptionId,
      madeFirstAnimation: hasMadeAnimation(ownerId),
    });
  } catch { /* the follow-up emails never break the app */ }
}

/** Starts the 6-hourly check once per server (first run 10 minutes after start). */
export function startEmailSignalSweeper() {
  if (cache.diamondEmailSignalSweeper || !process.env.DIAMOND_EMAIL_SITE_ID?.trim()) return;
  cache.diamondEmailSignalSweeper = true;
  const sweep = async () => {
    try {
      const { auth } = await import("./auth");
      const context = await auth.$context;
      for (const ownerId of listBillingOwners()) {
        try {
          const user = await context.internalAdapter.findUserById(ownerId);
          if (user?.email) sendAccountEmailSignals(ownerId, user.email);
        } catch { /* next account */ }
        await new Promise((done) => setTimeout(done, 200));
      }
    } catch { /* tried again in 6 hours */ }
  };
  setTimeout(() => { void sweep(); setInterval(() => void sweep(), SWEEP_EVERY_MS).unref?.(); }, 10 * 60 * 1000).unref?.();
}
