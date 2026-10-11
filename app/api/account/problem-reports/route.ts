import { NextResponse } from "next/server";
import packageInfo from "@/package.json";
import { requireAccountRequest } from "@/src/lib/account/access";
import { isOwnerEmail } from "@/src/lib/account/owner";
import { checkProblemReportInput, isProblemReportId, isProblemReportStatus, problemReportExcerpt, problemReportReporterName } from "@/src/lib/account/problemReports";
import {
  countNewProblemReports, listProblemReports, listUnseenProblemReports, markProblemReportsSeen, saveProblemReport, setProblemReportStatus,
} from "@/src/lib/account/problemReportStore";

// SPEC-0020 Phase 6: "Report a Problem".
//   POST  — any signed-in account sends a report (max 5 per hour).
//   GET   — owner only: the inbox list (?status=new|done|all), or ?summary=1 for the menu count + the bell.
//   PATCH — owner only: { id, status: "new" | "done" } or { seenIds: [...] } (the bell has shown these).
// Anyone who isn't the owner gets a plain "not found" for GET/PATCH.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const notFound = () => json({ error: "Not found." }, 404);

async function readJson(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return { tooBig: true } as const;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES * 1.1) return { tooBig: true } as const;
  try { return { body: JSON.parse(text) as unknown } as const; } catch { return { body: null } as const; }
}

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const read = await readJson(request);
  if ("tooBig" in read) return json({ error: "The report is too big. Try a smaller screenshot." }, 413);
  const check = checkProblemReportInput(read.body);
  if (!check.ok) return json({ error: check.message }, 400);
  try {
    const { user } = access.session;
    const saved = saveProblemReport({
      ...check.value,
      userId: user.id,
      userName: typeof user.name === "string" ? user.name.trim().slice(0, 80) : "",
      userEmail: user.email,
      appVersion: typeof packageInfo.version === "string" ? packageInfo.version : null,
    });
    if (!saved.ok) return json({ error: saved.message }, 429);
    return json({ schema: "diamond-problem-report/v1", id: saved.report.id }, 201);
  } catch {
    return json({ error: "Your report couldn't be sent. Try again in a moment." }, 503);
  }
}

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (!isOwnerEmail(access.session.user.email)) return notFound();
  const params = new URL(request.url).searchParams;
  try {
    if (params.get("summary") === "1") {
      const unseen = listUnseenProblemReports(access.session.user.id).map((report) => ({
        id: report.id,
        createdAt: report.createdAt,
        reporterName: problemReportReporterName(report.userName, report.userEmail),
        excerpt: problemReportExcerpt(report.text),
      }));
      return json({ schema: "diamond-problem-report-summary/v1", newCount: countNewProblemReports(), unseen });
    }
    const status = params.get("status") ?? "new";
    const filter = status === "all" || isProblemReportStatus(status) ? status : "new";
    return json({ schema: "diamond-problem-report-list/v1", newCount: countNewProblemReports(), reports: listProblemReports(filter) });
  } catch {
    return json({ error: "Reports couldn't be loaded. Try again." }, 503);
  }
}

export async function PATCH(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (!isOwnerEmail(access.session.user.email)) return notFound();
  const read = await readJson(request);
  const body = "body" in read && read.body && typeof read.body === "object" ? read.body as Record<string, unknown> : null;
  try {
    if (body && Array.isArray(body.seenIds)) {
      const ids = body.seenIds.filter(isProblemReportId).slice(0, 100);
      markProblemReportsSeen(access.session.user.id, ids);
      return json({ ok: true });
    }
    if (!body || !isProblemReportId(body.id) || !isProblemReportStatus(body.status)) return json({ error: "That change couldn't be read. Reload the page and try again." }, 400);
    if (!setProblemReportStatus(body.id, body.status)) return json({ error: "That report wasn't found. Reload the page." }, 404);
    return json({ ok: true, newCount: countNewProblemReports() });
  } catch {
    return json({ error: "That change couldn't be saved. Try again." }, 503);
  }
}
