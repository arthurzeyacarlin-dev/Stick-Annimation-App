import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { billingErrorResponse, previewAccountDeletion } from "@/src/lib/account/stripeBilling";

// Nov 20 (Arthur: "If they delete their account, everything has to be accurate"): what deleting this account would give back,
// read fresh from Stripe, shown in the Delete dialog BEFORE anything happens. Read only: nothing is stopped or refunded here.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    const preview = await previewAccountDeletion(access.session.user.id);
    return NextResponse.json({
      schema: "diamond-delete-preview/v1",
      hasPlan: preview.hasPlan,
      planPaidCents: preview.planPaidCents,
      aiCostCents: preview.aiCostCents,
      feeCents: preview.feeCents,
      planRefundCents: preview.planRefundCents,
      packRefundCents: preview.packRefundCents,
      refundCents: preview.refundCents,
    }, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
