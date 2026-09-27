import { NextResponse } from "next/server";
import { readUsageSummary } from "@/src/lib/usage-journal/usageJournalRuntime";

export const runtime = "nodejs";
const localRequest = (request: Request) => {
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(host) && (!origin || origin === `http://${host}`) &&
    !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "");
};

export async function GET(request: Request) {
  if (!localRequest(request)) return NextResponse.json({ error: "Usage records are limited to this local app." }, { status: 403 });
  try {
    return NextResponse.json(await readUsageSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Local usage records are temporarily unavailable." }, { status: 503,
      headers: { "Cache-Control": "no-store" } });
  }
}
