import { NextResponse } from "next/server";
import { readUsageSummary } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest, isTrustedAccountRequest } from "@/src/lib/account/access";
import { isOwnerEmail } from "@/src/lib/account/owner";

export const runtime = "nodejs";
// (Nov 25, going online) "this app only": the same check as accounts use - this Mac's own address here, the one public
// https address online (accountConfig.ts). The account check before it still decides who may use it.
const localRequest = (request: Request) => isTrustedAccountRequest(request);

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (!localRequest(request)) return NextResponse.json({ error: "Usage records are limited to this local app." }, { status: 403 });
  if (!isOwnerEmail(access.session.user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });   // (Nov 12 security) the whole app's records: owner only
  try {
    return NextResponse.json(await readUsageSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Local usage records are temporarily unavailable." }, { status: 503,
      headers: { "Cache-Control": "no-store" } });
  }
}
