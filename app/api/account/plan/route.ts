import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { getAccountPlanStatus } from "@/src/lib/account/aiCredits";

// SPEC-0020 Phase 2: this account's plan, AI credits and trial days (for the credits counter and the AI Dashboard).
export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    return NextResponse.json({ schema: "diamond-account-plan/v1", status: getAccountPlanStatus(access.session.user.id) },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Your plan couldn't be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
