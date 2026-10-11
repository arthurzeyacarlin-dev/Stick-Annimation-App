import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { isOwnerEmail } from "@/src/lib/account/owner";
import { isProblemReportId } from "@/src/lib/account/problemReports";
import { readProblemReportScreenshot } from "@/src/lib/account/problemReportStore";

// SPEC-0020 Phase 6: a problem report's screenshot, for the owner's inbox only (everyone else: "not found").
export const runtime = "nodejs";

type Context = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!isOwnerEmail(access.session.user.email)) return notFound();
  const { reportId } = await context.params;
  if (!isProblemReportId(reportId)) return notFound();
  try {
    const picture = readProblemReportScreenshot(reportId);
    if (!picture) return notFound();
    return new Response(new Uint8Array(picture.bytes), {
      headers: {
        "Content-Type": picture.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return NextResponse.json({ error: "The screenshot couldn't be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
