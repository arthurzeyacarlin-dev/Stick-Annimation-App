import { NextResponse } from "next/server";
import { ACCOUNT_LOCAL_ORIGIN } from "@/src/lib/account/accountConfig";

// (Dad, Nov 26) the link in the confirm email. It works signed out too (opened on a phone): the link itself says which account.
// Then the app opens: confirmed = the trial has started; this inbox already had a trial = Plans; an old or used link = home,
// where the code box can send a new one.
export const runtime = "nodejs";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const { confirmByLink } = await import("@/src/lib/account/emailConfirm");
  let state: Awaited<ReturnType<typeof confirmByLink>> = "bad_link";
  try { state = await confirmByLink(token, request.headers); } catch { /* shown as an old link */ }
  const to = state === "confirmed" ? "/?confirmed=1" : state === "no_trial" ? "/plans" : "/?confirm=old";
  return NextResponse.redirect(new URL(to, ACCOUNT_LOCAL_ORIGIN), { headers: { "Cache-Control": "no-store" } });
}
