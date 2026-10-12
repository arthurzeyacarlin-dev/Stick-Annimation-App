import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, billingOrigin, createPlanCheckout } from "@/src/lib/account/stripeBilling";

// SPEC-0020 Phase 9 (Stripe TEST MODE only): start paying for a plan on Stripe's own page.
// Body {plan, interval} → {url}. If a plan is already paid for, the url opens Manage plan instead (portal: true).
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as { plan?: unknown; interval?: unknown } | null;
  try {
    const { user } = access.session;
    const result = await createPlanCheckout(user.id, { email: user.email, name: user.name }, body?.plan, body?.interval, billingOrigin(request));
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
