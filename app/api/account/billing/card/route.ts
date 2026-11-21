import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, billingOrigin, createCardChangePage } from "@/src/lib/account/stripeBilling";

// Nov 21: change the card. Typing a card is the one thing done on Stripe's secure page (the number never touches Diamond Animator).
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    return NextResponse.json(await createCardChangePage(access.session.user.id, billingOrigin(request)), { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
