import { NextResponse } from "next/server";
import { readUsageSummary } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest } from "@/src/lib/account/access";

export const runtime = "nodejs";
// requireAccountRequest runs the shared same-site check (local http or the configured https app address).

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    return NextResponse.json(await readUsageSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Local usage records are temporarily unavailable." }, { status: 503,
      headers: { "Cache-Control": "no-store" } });
  }
}
