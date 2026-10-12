import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { getCreditUseByKind } from "@/src/lib/account/aiCredits";

// SPEC-0020 Phase 9: the credits this account spent per AI action kind in the current window
// (this month, or the free trial) — the AI Dashboard's "Used this month" list. Read only.
export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    return NextResponse.json({ schema: "diamond-account-credit-use/v1", rows: getCreditUseByKind(access.session.user.id) },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Your usage couldn't be read. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
