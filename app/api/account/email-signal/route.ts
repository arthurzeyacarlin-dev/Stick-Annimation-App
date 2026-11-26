import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { sendExportedVideoSignal } from "@/src/lib/account/emailSignals";

// Follow-up emails (SPEC-0030): the export window says a video (MP4 or GIF) was really saved. Signed in only; the only fact
// it accepts is "Exported Video", sent once per account. Never fails the export: it answers at once.
export const runtime = "nodejs";
export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  let body: unknown = null;
  try { body = await request.json(); } catch { /* checked below */ }
  if ((body as { signal?: unknown } | null)?.signal !== "Exported Video") return NextResponse.json({ error: "Unknown signal." }, { status: 400 });
  sendExportedVideoSignal(access.session.user.id, access.session.user.email);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
