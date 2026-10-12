import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";
import { billingMode, syncSubscription } from "@/src/lib/account/stripeBilling";

// SPEC-0020 Phase 2: this account's plan, AI credits and trial days (for the credits counter and the AI Dashboard).
// Phase 9: first pulls the subscription from Stripe (test mode, at most once a minute; a Stripe problem never breaks
// this), and says whether payments are on ("test") or not yet ("off").
export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const ownerId = access.session.user.id;
  try { await syncSubscription(ownerId); } catch { /* keep the last saved plan */ }
  try {
    return NextResponse.json({ schema: "diamond-account-plan/v1", status: getAccountPlanStatus(ownerId), billing: { mode: billingMode() } },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Your plan couldn't be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
