import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, billingOrigin, createTopUpCheckout } from "@/src/lib/account/stripeBilling";

// SPEC-0020 Phase 9 (Stripe TEST MODE only): buy an extra credit pack on Stripe's own page (members only).
// Body {pack} → {url}.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as { pack?: unknown } | null;
  try {
    const { user } = access.session;
    const result = await createTopUpCheckout(user.id, { email: user.email, name: user.name }, body?.pack, billingOrigin(request));
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
