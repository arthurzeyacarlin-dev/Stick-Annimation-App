import { requireAccountRequest } from "@/src/lib/account/access";
import { isOwnerEmail } from "@/src/lib/account/owner";
import { isProblemReportId } from "@/src/lib/account/problemReports";
import { addTicketMessage, deleteTicketDraft, readTicket } from "@/src/lib/account/problemReportStore";
import { cleanTicketMessage } from "@/src/lib/support/supportRules";
import { sendOwnerReply } from "@/src/lib/support/supportService";
import { json, notFound, readObject } from "@/src/lib/support/supportHttp";

// SPEC-0027 (Nov 26): one ticket in the owner's inbox (/reports). Owner only; everyone else gets "not found".
//   GET  — the ticket with its whole conversation (the person's messages, Arthur's replies, private notes, Claude's draft)
//   POST — { action: "reply", text } (the person sees it in the help bubble AND gets it by email)
//          { action: "note", text } (private) · { action: "discard-draft", id }
export const runtime = "nodejs";

type Context = { params: Promise<{ reportId: string }> };

async function ownerTicket(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return { response: access.response } as const;
  if (!isOwnerEmail(access.session.user.email)) return { response: notFound() } as const;
  const { reportId } = await context.params;
  if (!isProblemReportId(reportId)) return { response: notFound() } as const;
  return { reportId, author: access.session.user.name?.trim() || "Arthur" } as const;
}

export async function GET(request: Request, context: Context) {
  const owner = await ownerTicket(request, context);
  if ("response" in owner) return owner.response;
  try {
    const ticket = readTicket(owner.reportId);
    return ticket ? json({ schema: "diamond-ticket/v1", ticket }) : notFound();
  } catch {
    return json({ error: "The ticket couldn't be loaded. Try again." }, 503);
  }
}

export async function POST(request: Request, context: Context) {
  const owner = await ownerTicket(request, context);
  if ("response" in owner) return owner.response;
  const body = await readObject(request);
  if (!body) return json({ error: "That couldn't be read. Reload the page and try again." }, 400);
  try {
    if (body.action === "discard-draft") {
      return typeof body.id === "string" && deleteTicketDraft(owner.reportId, body.id) ? json({ ok: true }) : notFound();
    }
    if (body.action !== "reply" && body.action !== "note") return json({ error: "That couldn't be read. Reload the page and try again." }, 400);
    const text = cleanTicketMessage(body.text);
    if (!text.ok) return json({ error: text.message }, 400);
    const message = body.action === "reply"
      ? sendOwnerReply(owner.reportId, text.text, owner.author)
      : addTicketMessage(owner.reportId, "note", owner.author, text.text);
    return message ? json({ ok: true, ticket: readTicket(owner.reportId) }) : notFound();
  } catch {
    return json({ error: "That couldn't be saved. Try again." }, 503);
  }
}
