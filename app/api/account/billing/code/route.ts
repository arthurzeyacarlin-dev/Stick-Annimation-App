import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { whichOfferCode } from "@/src/lib/account/stripeBilling";

// SPEC-0031 (display only): GET ?code=FIRSTDIAMOND → { offer: "first50" | "youtube" | null }, so the plans and the pay dialog can
// show the beta price before paying. Signed in only. The first-50 code counts only while this account's trial runs. The payment itself checks the code again exactly as before.
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const code = (new URL(request.url).searchParams.get("code") ?? "").slice(0, 40);
  return NextResponse.json({ offer: whichOfferCode(access.session.user.id, code) }, { headers: NO_STORE });
}
