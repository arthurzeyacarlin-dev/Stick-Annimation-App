import { isProblemReportStatus } from "@/src/lib/account/problemReports";
import { listProblemReports } from "@/src/lib/account/problemReportStore";
import { hasSupportApiKey, json, notFound } from "@/src/lib/support/supportHttp";

// SPEC-0027 (Nov 26): THE TICKET API for a scheduled Claude routine (docs/SUPPORT_ROUTINE.md).
// Only with "Authorization: Bearer <DIAMOND_SUPPORT_API_KEY>" (a server setting; unset = this API is off and answers 404).
// It can read tickets, add private notes, set status, post a reply DRAFT and set the app status. It can never send
// anything to a user: Arthur presses Send on /reports.
//   GET /api/support/tickets?status=new|working|done|all (default new)   — newest activity first, no screenshots
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasSupportApiKey(request)) return notFound();
  const status = new URL(request.url).searchParams.get("status") ?? "new";
  const filter = status === "all" || isProblemReportStatus(status) ? status : "new";
  try {
    return json({ schema: "diamond-ticket-list/v1", tickets: listProblemReports(filter, 200) });
  } catch {
    return json({ error: "Tickets couldn't be loaded." }, 503);
  }
}
