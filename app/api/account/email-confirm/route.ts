import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { readJson } from "@/src/lib/account/readJson";

// (Dad, Nov 26) the email confirm step: GET = where this account is ("confirm" / "confirmed" / "no_trial");
// POST { action: "send" } = send the email again; { action: "code", code } = the 6-digit code; { action: "change", email } =
// "Wrong email? Fix it" (only while not confirmed). Login and logout are not touched.
export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const user = access.session.user;
  const { ensureLegacyTrialGate } = await import("@/src/lib/account/aiCredits");
  ensureLegacyTrialGate(user.id, new Date(user.createdAt).getTime());
  const { confirmState } = await import("@/src/lib/account/emailConfirm");
  return NextResponse.json({ state: confirmState(user.id), email: user.email }, { headers: noStore });
}

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const user = access.session.user as { id: string; email: string; name?: string | null; ageGroup?: unknown };
  let body: { action?: unknown; code?: unknown; email?: unknown } | null = null;
  try { body = await readJson(request); } catch { /* checked below */ }
  const confirm = await import("@/src/lib/account/emailConfirm");
  try {
    if (body?.action === "send") {
      const { sent } = await confirm.sendConfirmEmail(user);
      return NextResponse.json({ ok: true, sent, state: confirm.confirmState(user.id) }, { headers: noStore });
    }
    if (body?.action === "code") {
      const state = await confirm.confirmByCode(user, body.code, request.headers);
      return NextResponse.json({ ok: true, state }, { headers: noStore });
    }
    if (body?.action === "change") {
      const changed = await confirm.changeUnconfirmedEmail(user, body.email);
      return NextResponse.json({ ok: true, ...changed }, { headers: noStore });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400, headers: noStore });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "That didn't work. Try again in a minute." }, { status, headers: noStore });
  }
}
