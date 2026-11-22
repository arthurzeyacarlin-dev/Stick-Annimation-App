import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import {
  billingErrorResponse, completeCardSave, completePackPayment, completePlanPayment, payWithSavedCard, startCardSave, startPackPayment, startPlanPayment,
} from "@/src/lib/account/stripeBilling";
import { passwordCheck } from "@/src/lib/account/passwordCheck";

// Nov 21 (Arthur: "You never see Stripe"): paying happens inside Diamond Animator's own card form.
// Body {step: "start", kind: "plan", plan, interval, codes?} | {step: "start", kind: "pack", pack} | {step: "start", kind: "card"}
//   → {clientSecret, intent, ref, amountCents, savedCard}   (the card form then confirms it; the card never reaches this server)
// Body {step: "done", kind, ref} → what arrived (checked with Stripe; safe to repeat).
// Body {step: "saved", kind: "plan" | "pack", ref, password} → (Nov 22) pays with the card on file, only after the account's password
//   is checked here: {status, clientSecret} (status "requires_action" = the bank asks; the card form finishes it, then "done").
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const body = await readJson(request).catch(() => null) as {
    step?: unknown; kind?: unknown; plan?: unknown; interval?: unknown; pack?: unknown; ref?: unknown; password?: unknown; codes?: { first50?: unknown; youtube?: unknown };
  } | null;
  const { user } = access.session;
  try {
    let result: unknown;
    if (body?.step === "start" && body.kind === "plan") {
      const codes = body.codes && typeof body.codes === "object" ? { first50: body.codes.first50, youtube: body.codes.youtube } : {};
      result = await startPlanPayment(user.id, { email: user.email, name: user.name }, body.plan, body.interval, codes);
    } else if (body?.step === "start" && body.kind === "pack") result = await startPackPayment(user.id, body.pack);
    else if (body?.step === "start" && body.kind === "card") result = await startCardSave(user.id);
    else if (body?.step === "done" && body.kind === "plan") result = { status: await completePlanPayment(user.id, body.ref) };
    else if (body?.step === "done" && body.kind === "pack") result = { status: await completePackPayment(user.id, body.ref) };
    else if (body?.step === "done" && body.kind === "card") result = await completeCardSave(user.id, body.ref);
    else if (body?.step === "saved" && (body.kind === "plan" || body.kind === "pack")) {
      const checked = await passwordCheck(request, user.id, body.password);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status, headers: NO_STORE });
      result = await payWithSavedCard(user.id, body.kind, body.ref);
    }
    else return NextResponse.json({ error: "Unknown payment step." }, { status: 400, headers: NO_STORE });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    const { error: message, status } = billingErrorResponse(error);
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
