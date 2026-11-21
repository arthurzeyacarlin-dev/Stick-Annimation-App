import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, completeCardChange } from "@/src/lib/account/stripeBilling";

// Nov 21: back from the card page. Body {sessionId}. The new card is used for every payment; an unpaid bill is tried again at once.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await readJson(request).catch(() => null) as { sessionId?: unknown } | null;
  try {
    return NextResponse.json(await completeCardChange(access.session.user.id, body?.sessionId), { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
