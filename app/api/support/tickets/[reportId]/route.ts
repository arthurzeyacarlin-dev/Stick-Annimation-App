import { isProblemReportId, isProblemReportStatus } from "@/src/lib/account/problemReports";
import { addTicketMessage, readTicket, setProblemReportStatus } from "@/src/lib/account/problemReportStore";
import { cleanTicketMessage } from "@/src/lib/support/supportRules";
import { hasSupportApiKey, json, notFound, readObject } from "@/src/lib/support/supportHttp";

// SPEC-0027: one ticket for the Claude routine (key only, see ../route.ts).
//   GET  — the ticket with its whole conversation (hasScreenshot: the picture is at ./screenshot)
//   POST — { action: "note", text } · { action: "draft", text } (Arthur sees "Draft from Claude" and decides) ·
//          { action: "status", status: "new" | "working" | "done" }
export const runtime = "nodejs";

type Context = { params: Promise<{ reportId: string }> };
const AUTHOR = "Claude";

export async function GET(request: Request, context: Context) {
  if (!hasSupportApiKey(request)) return notFound();
  const { reportId } = await context.params;
  if (!isProblemReportId(reportId)) return notFound();
  try {
    const ticket = readTicket(reportId);
    return ticket ? json({ schema: "diamond-ticket/v1", ticket }) : notFound();
  } catch {
    return json({ error: "The ticket couldn't be loaded." }, 503);
  }
}

export async function POST(request: Request, context: Context) {
  if (!hasSupportApiKey(request)) return notFound();
  const { reportId } = await context.params;
  if (!isProblemReportId(reportId)) return notFound();
  const body = await readObject(request);
  if (!body) return json({ error: "The body must be a JSON object." }, 400);
  try {
    if (body.action === "status") {
      if (!isProblemReportStatus(body.status)) return json({ error: "status must be new, working or done." }, 400);
      return setProblemReportStatus(reportId, body.status) ? json({ ok: true, ticket: readTicket(reportId) }) : notFound();
    }
    if (body.action !== "note" && body.action !== "draft") return json({ error: "action must be note, draft or status." }, 400);
    const text = cleanTicketMessage(body.text);
    if (!text.ok) return json({ error: text.message }, 400);
    return addTicketMessage(reportId, body.action, AUTHOR, text.text) ? json({ ok: true, ticket: readTicket(reportId) }, 201) : notFound();
  } catch {
    return json({ error: "That couldn't be saved." }, 503);
  }
}
