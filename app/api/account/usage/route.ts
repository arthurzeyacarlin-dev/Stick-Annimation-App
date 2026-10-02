import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { readAccountUsageRows } from "@/src/lib/account-usage/accountUsageStore";
import { projectAccountUsage } from "@/src/lib/account-usage/accountUsageProjection";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    const ownerId = access.session.user.id;
    const { rows, gap, readAt } = readAccountUsageRows(ownerId);
    return NextResponse.json({ schema: "diamond-account-usage/v1", ownerId,
      snapshot: projectAccountUsage(rows, readAt, gap), coverage: gap ? "partial" : "complete",
      prospective: true, paidPlan: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Account usage is unavailable; no zero-usage claim can be made." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
