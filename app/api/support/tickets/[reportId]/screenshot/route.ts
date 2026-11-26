import { isProblemReportId } from "@/src/lib/account/problemReports";
import { readProblemReportScreenshot } from "@/src/lib/account/problemReportStore";
import { hasSupportApiKey, notFound } from "@/src/lib/support/supportHttp";

// SPEC-0027: a ticket's screenshot for the Claude routine (key only, see ../../route.ts).
export const runtime = "nodejs";

type Context = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: Context) {
  if (!hasSupportApiKey(request)) return notFound();
  const { reportId } = await context.params;
  if (!isProblemReportId(reportId)) return notFound();
  const picture = readProblemReportScreenshot(reportId);
  if (!picture) return notFound();
  return new Response(new Uint8Array(picture.bytes), {
    headers: { "Content-Type": picture.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
