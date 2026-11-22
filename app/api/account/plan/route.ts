import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";
import { billingFacts, billingMode, startBillingSweeper, syncWithStripe } from "@/src/lib/account/stripeBilling";

// This account's plan, credits and trial days (the credits counter, the AI Dashboard, the Plans screen).
// First checks with Stripe (at most once a minute; a Stripe problem never breaks this), says whether payments are on
// ("test", "live" or "off"), and gives Stripe's own facts: the last payment, the next one, and any notice.
export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const ownerId = access.session.user.id;
  // ?fresh=1 = back from Stripe's page: check with Stripe now (at most once every 10 seconds per account)
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  try { await syncWithStripe(ownerId, { fresh }); } catch { /* keep the last saved plan */ }
  startBillingSweeper();
  try {
    return NextResponse.json({ schema: "diamond-account-plan/v1", status: getAccountPlanStatus(ownerId), billing: { mode: billingMode(), ...billingFacts(ownerId) } },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Your plan couldn't be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
