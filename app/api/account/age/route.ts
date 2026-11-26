import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { isAgeGroup } from "@/src/lib/account/ageCheck";
import { readJson } from "@/src/lib/account/readJson";
import { isOwnerEmail } from "@/src/lib/account/owner";

// SPEC-0031 (dad, Nov 26 - COPPA): an account made before the age rule answers ONCE: "13plus" (Yes), "under13" (No) or
// "parent" (a parent whose child uses this account, after ticking the consent box). An answer is never changed here, so
// "No" can't be turned into "Yes" by pressing again; a mistake is fixed by writing to support.
export const runtime = "nodejs";
export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const user = access.session.user;
  let body: { ageGroup?: unknown; parentConsent?: unknown } | null = null;
  try { body = await readJson(request); } catch { /* checked below */ }
  const ageGroup = body?.ageGroup;
  if (!isAgeGroup(ageGroup) || (ageGroup === "parent" && body?.parentConsent !== true)) {
    return NextResponse.json({ error: "Please choose an answer." }, { status: 400 });
  }
  // The owner's account is never locked (the owner is 12): a parent agrees for it instead ("parent").
  if (ageGroup === "under13" && isOwnerEmail(user.email)) return NextResponse.json({ error: "A parent or guardian agrees for this account." }, { status: 400 });
  if (isAgeGroup(user.ageGroup)) return NextResponse.json({ ok: true, ageGroup: user.ageGroup }, { headers: { "Cache-Control": "no-store" } });
  const { auth } = await import("@/src/lib/account/auth");
  const context = await auth.$context;
  await context.internalAdapter.updateUser(user.id, { ageGroup, ageCheckedAt: new Date() });
  if (ageGroup === "under13") {
    // A child's account made before the rule may already be on the follow-up email list: the existing "stop the emails"
    // signal (the one a deleted account sends) is sent once, so no more marketing emails reach a child. Never waits.
    try { (await import("@/src/lib/account/emailSignals")).sendAccountDeletedSignal(user.id, user.email); } catch { /* best effort */ }
  }
  return NextResponse.json({ ok: true, ageGroup }, { headers: { "Cache-Control": "no-store" } });
}
