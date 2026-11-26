import { getServerAccountSession } from "@/src/lib/account/access";
import { isTrustedAccountRequest } from "@/src/lib/account/accountConfig";
import { isOwnerEmail } from "@/src/lib/account/owner";
import { setServiceStatus } from "@/src/lib/account/problemReportStore";
import { bannerFor, isSetServiceState, isSupportArea, SERVICE_MESSAGE_MAX } from "@/src/lib/support/supportRules";
import { currentServiceStatus } from "@/src/lib/support/supportService";
import { hasSupportApiKey, json, notFound, readObject } from "@/src/lib/support/supportHttp";

// SPEC-0027 (Nov 26): the app status (Sign-in, AI Animator, Saving, Payments).
//   GET  — for everyone, signed in or not (the /status page and the banner): { statuses, banner }
//   POST — the owner (signed in, from the app) or the Claude routine (ticket API key):
//          { area: "signin" | "animator" | "saving" | "payments", state: "fixing" | "resolved" | "ok", message? }
export const runtime = "nodejs";

export async function GET() {
  try {
    const statuses = currentServiceStatus();
    return json({ schema: "diamond-status/v1", statuses, banner: bannerFor(statuses) });
  } catch {
    return json({ schema: "diamond-status/v1", statuses: [], banner: null });
  }
}

export async function POST(request: Request) {
  let by: string | null = hasSupportApiKey(request) ? "Claude" : null;
  if (!by && isTrustedAccountRequest(request)) {
    const session = await getServerAccountSession().catch(() => null);
    if (session && isOwnerEmail(session.user.email)) by = "owner";
  }
  if (!by) return notFound();
  const body = await readObject(request);
  if (!body || !isSupportArea(body.area) || !isSetServiceState(body.state)) {
    return json({ error: "area must be signin, animator, saving or payments; state must be fixing, resolved or ok." }, 400);
  }
  const message = typeof body.message === "string" ? body.message.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, SERVICE_MESSAGE_MAX) || null : null;
  try {
    setServiceStatus(body.area, body.state, message, by);
    const statuses = currentServiceStatus();
    return json({ ok: true, statuses, banner: bannerFor(statuses) });
  } catch {
    return json({ error: "The status couldn't be saved." }, 503);
  }
}
