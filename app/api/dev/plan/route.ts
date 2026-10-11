import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { applyTestPlanAction, getAccountPlanStatus, TEST_PLAN_ACTIONS, type TestPlanAction } from "@/src/lib/account/aiCredits";

// SPEC-0020 Phase 2 (development only): the test switch for plans, credits and the trial clock.
// 404 outside development. Real plans come from payments in SPEC-0020 Phase 5.
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  const action = body?.action;
  if (typeof action !== "string" || !(TEST_PLAN_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Unknown test action." }, { status: 400 });
  }
  applyTestPlanAction(access.session.user.id, action as TestPlanAction);
  return NextResponse.json({ status: getAccountPlanStatus(access.session.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
