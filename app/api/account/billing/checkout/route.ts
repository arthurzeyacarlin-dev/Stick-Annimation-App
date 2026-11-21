import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, billingOrigin, createPlanCheckout } from "@/src/lib/account/stripeBilling";

// Start paying for a plan on Stripe's own page. Body {plan, interval, codes?: {first50?, youtube?}} → {url}.
// If a plan is already paid for, the url opens Manage plan instead (portal: true). Asking twice gives the same page.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await readJson(request).catch(() => null) as { plan?: unknown; interval?: unknown; codes?: { first50?: unknown; youtube?: unknown } } | null;
  const codes = body?.codes && typeof body.codes === "object" ? { first50: body.codes.first50, youtube: body.codes.youtube } : {};
  try {
    const { user } = access.session;
    const result = await createPlanCheckout(user.id, { email: user.email, name: user.name }, body?.plan, body?.interval, billingOrigin(request), codes);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
