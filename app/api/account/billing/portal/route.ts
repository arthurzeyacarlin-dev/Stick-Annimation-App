import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, billingOrigin, createPortalSession } from "@/src/lib/account/stripeBilling";

// SPEC-0020 Phase 9 (Stripe TEST MODE only): open Stripe's "Manage plan" page (switch plan, cancel, card, invoices).
// Body {returnTo?: "/plans" | "/credits"} → {url}.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as { returnTo?: unknown } | null;
  const returnPath = body?.returnTo === "/plans" ? "/plans" : "/credits";
  try {
    const result = await createPortalSession(access.session.user.id, billingOrigin(request), returnPath);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
