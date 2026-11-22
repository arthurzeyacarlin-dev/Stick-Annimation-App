import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { applyTestPlanAction, getAccountPlanStatus } from "@/src/lib/account/aiCredits";

// (Nov 4 PM12, Arthur's testing) DEVELOPMENT ONLY: opening this link adds test credits to the logged-in account (the same "plus 100" test switch
// as /api/dev/plan, repeated), then opens the AI Dashboard. 404 outside `next dev`. Nothing is charged; only the local test plan record changes.
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const ownerId = access.session.user.id;
  if (getAccountPlanStatus(ownerId).plan === "trial") applyTestPlanAction(ownerId, "creator");   // (Nov 12, Arthur testing) a paid test plan: no first-day limit
  for (let i = 0; i < 10_000; i++) applyTestPlanAction(ownerId, "plus_100");
  const status = getAccountPlanStatus(ownerId);
  return NextResponse.redirect(new URL(`/credits?test_credits=${status.creditsLeft}`, request.url));
}
