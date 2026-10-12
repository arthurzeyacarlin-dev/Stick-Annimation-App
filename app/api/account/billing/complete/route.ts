import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, completeCheckout } from "@/src/lib/account/stripeBilling";

// SPEC-0020 Phase 9 (Stripe TEST MODE only): after Stripe's page sends the person back, read the finished checkout
// and apply it (new plan, or extra credits). Safe to call twice. Body {sessionId} → {status}.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  try {
    const status = await completeCheckout(access.session.user.id, body?.sessionId);
    return NextResponse.json({ status }, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
