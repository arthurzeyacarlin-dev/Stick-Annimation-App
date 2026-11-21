import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { isTrustedAccountRequest } from "@/src/lib/account/accountConfig";
import { billingErrorResponse, devTestClock, type DevClockAction } from "@/src/lib/account/stripeBilling";

// DEVELOPMENT ONLY (Nov 20): Stripe test clocks, to prove renewal day on the real Stripe in test mode (no real money, ever).
// 404 outside `next dev`, from the network or from another site, and whenever payments aren't in Stripe test mode.
// Body {action: "start" | "advance" | "card_fails" | "card_works" | "state", days?}.
export const runtime = "nodejs";
const ACTIONS: readonly DevClockAction[] = ["start", "advance", "card_fails", "card_works", "state"];
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development" || !isTrustedAccountRequest(request)) return new NextResponse(null, { status: 404 });
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as { action?: unknown; days?: unknown } | null;
  const action = ACTIONS.find((value) => value === body?.action);
  if (!action) return NextResponse.json({ error: "Unknown test clock action." }, { status: 400 });
  try {
    const { user } = access.session;
    return NextResponse.json(await devTestClock(user.id, { email: user.email, name: user.name }, action, Number(body?.days) || 0), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
