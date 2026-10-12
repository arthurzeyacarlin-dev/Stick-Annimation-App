import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { applyTestPlanAction, getAccountPlanStatus, getCreditUseByKind, TEST_PLAN_ACTIONS, type TestPlanAction } from "@/src/lib/account/aiCredits";

// SPEC-0020 Phase 2 (development only): the test switch for plans, credits and the trial clock.
// 404 outside development. Nothing is charged and no AI runs: it only changes this account's local plan record
// ("Pretend AI use" adds a fake usage entry). Phase 9 adds the credit, refill, payment and pretend-use buttons.
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
  const ownerId = access.session.user.id;
  const headers = { "Cache-Control": "no-store" };
  try {
    applyTestPlanAction(ownerId, action as TestPlanAction);
  } catch (error) {
    // A pretend AI action is refused like a real one (out of credits, payment problem, trial over).
    const refused = error as { status?: unknown; message?: unknown } | null;
    if (refused?.status === 402 && typeof refused.message === "string") {
      return NextResponse.json({ error: refused.message, status: getAccountPlanStatus(ownerId), creditUse: getCreditUseByKind(ownerId) }, { status: 402, headers });
    }
    throw error;
  }
  return NextResponse.json({ status: getAccountPlanStatus(ownerId), creditUse: getCreditUseByKind(ownerId) }, { headers });
}
