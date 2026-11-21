import { NextResponse } from "next/server";
import { BodyTooLarge, readBytes } from "@/src/lib/account/readJson";
import { handleStripeWebhook } from "@/src/lib/account/stripeBilling";

// Nov 20 (the money system): Stripe's webhook DOORBELL. Stripe calls this (no account session, no browser), so it is the one
// billing route without requireAccountRequest: instead every call must carry Stripe's signature for this endpoint's secret
// (STRIPE_WEBHOOK_SECRET), at most 5 minutes old, or it is refused. A signed call only says "check this account now"; what
// changes is always read fresh from Stripe by the sync, never taken from the message itself.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_EVENT_BYTES = 512 * 1024;

export async function POST(request: Request) {
  let payload: string;
  try {
    payload = Buffer.from(await readBytes(request, MAX_EVENT_BYTES)).toString("utf8");
  } catch (error) {
    return NextResponse.json({ error: error instanceof BodyTooLarge ? "too_large" : "unreadable" }, { status: error instanceof BodyTooLarge ? 413 : 400, headers: NO_STORE });
  }
  const result = handleStripeWebhook(payload, request.headers.get("stripe-signature"));
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}
