import { requireAccountRequest } from "@/src/lib/account/access";
import { isProblemReportId, problemReportReporterName } from "@/src/lib/account/problemReports";
import { addTicketMessage, countUserUnread, listUserTickets, markUserTicketsRead, readProblemReport } from "@/src/lib/account/problemReportStore";
import { cleanTicketMessage } from "@/src/lib/support/supportRules";
import { afterUserFollowUp } from "@/src/lib/support/supportService";
import { json, notFound, readObject } from "@/src/lib/support/supportHttp";

// SPEC-0027 (Nov 26): the help bubble's "My messages" — only the signed-in person's own tickets, and only what they may see
// (their messages and Arthur's replies; never private notes or Claude's drafts).
//   GET   — { tickets, unread }  ·  GET ?count=1 — just { unread } (the bubble's dot)
//   POST  — { reportId, text }: the person answers in their own ticket (the owner gets an instant alert email)
//   PATCH — { read: true }: they opened their messages
export const runtime = "nodejs";

const MINE_MAX_PER_HOUR = 20;
const recent = new Map<string, number[]>();

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const userId = access.session.user.id;
  try {
    if (new URL(request.url).searchParams.get("count") === "1") return json({ unread: countUserUnread(userId) });
    const tickets = listUserTickets(userId).map(({ id, createdAt, text, status, area, hasScreenshot, lastActivityAt, userUnread, messages }) =>
      ({ id, createdAt, text, status, area, hasScreenshot, lastActivityAt, userUnread, messages: messages.map(({ id, createdAt, kind, text }) => ({ id, createdAt, kind, text })) }));
    return json({ schema: "diamond-my-tickets/v1", tickets, unread: countUserUnread(userId) });
  } catch {
    return json({ error: "Your messages couldn't be loaded. Try again in a moment." }, 503);
  }
}

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const { user } = access.session;
  const body = await readObject(request);
  if (!body || !isProblemReportId(body.reportId)) return json({ error: "That message couldn't be read. Reload the page and try again." }, 400);
  const text = cleanTicketMessage(body.text);
  if (!text.ok) return json({ error: text.message }, 400);
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((at) => now - at < 60 * 60 * 1000);
  if (mine.length >= MINE_MAX_PER_HOUR) return json({ error: "You've sent a lot of messages in the last hour. Please wait a little and try again." }, 429);
  try {
    const report = readProblemReport(body.reportId);
    if (!report || report.userId !== user.id) return notFound();
    if (!addTicketMessage(report.id, "user", problemReportReporterName(user.name, user.email), text.text, now)) return notFound();
    recent.set(user.id, [...mine, now]);
    afterUserFollowUp(report, text.text);
    return json({ ok: true }, 201);
  } catch {
    return json({ error: "Your message couldn't be sent. Try again in a moment." }, 503);
  }
}

export async function PATCH(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    markUserTicketsRead(access.session.user.id);
    return json({ ok: true, unread: 0 });
  } catch {
    return json({ error: "That couldn't be saved." }, 503);
  }
}
