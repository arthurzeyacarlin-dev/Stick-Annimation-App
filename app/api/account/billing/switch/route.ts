import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, previewPlanSwitch, switchPlanNow } from "@/src/lib/account/stripeBilling";
import { passwordCheck } from "@/src/lib/account/passwordCheck";

// Nov 21 (Arthur): switch plans right away, inside Diamond Animator. Body {plan, interval, confirm?}:
// without confirm → what it would cost and give back (nothing changes); with confirm: true → switches now.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await readJson(request).catch(() => null) as { plan?: unknown; interval?: unknown; confirm?: unknown; password?: unknown } | null;
  try {
    const ownerId = access.session.user.id;
    // (Nov 22, Arthur: "there needs to be a verification") a switch that charges the saved card asks for the account's password first
    if (body?.confirm === true && (await previewPlanSwitch(ownerId, body?.plan, body?.interval)).chargeCents > 0) {
      const checked = await passwordCheck(request, ownerId, body?.password);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status, headers: NO_STORE });
    }
    const result = body?.confirm === true
      ? { switched: await switchPlanNow(ownerId, body?.plan, body?.interval) }
      : { preview: await previewPlanSwitch(ownerId, body?.plan, body?.interval) };
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
