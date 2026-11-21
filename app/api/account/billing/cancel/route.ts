import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, setPlanCancelled } from "@/src/lib/account/stripeBilling";

// Nov 21: cancel a plan (it runs to the end of what was paid, never charged again) or keep it. Body {cancel: boolean}.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await readJson(request).catch(() => null) as { cancel?: unknown } | null;
  if (typeof body?.cancel !== "boolean") return NextResponse.json({ error: "Say whether to cancel or keep the plan." }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json(await setPlanCancelled(access.session.user.id, body.cancel), { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
