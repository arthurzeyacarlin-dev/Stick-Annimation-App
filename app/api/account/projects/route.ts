import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { listAccountProjectHeads, saveAccountProjectBundle } from "@/src/lib/account/projectServer";

export const runtime = "nodejs";

const responseForError = (error: unknown) => {
  const code = error instanceof Error ? error.message : "account_project_failed";
  const status = code === "stale_revision" ? 409 : code === "account_project_import_forbidden" ? 403 :
    code === "project_too_large" ? 413 : code === "bundle_invalid" || code === "account_project_invalid_scope" ? 400 : 503;
  return NextResponse.json({ error: code }, { status });
};

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  try { return NextResponse.json({ projects: await listAccountProjectHeads(access.session.user.id) }); }
  catch (error) { return responseForError(error); }
}

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const expectedHeader = request.headers.get("x-expected-revision");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/octet-stream" ||
    expectedHeader === null || !/^(new|[1-9][0-9]{0,9})$/.test(expectedHeader)) {
    return NextResponse.json({ error: "account_project_invalid_request" }, { status: 400 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 140_000_000) return NextResponse.json({ error: "project_too_large" }, { status: 413 });
  try {
    const raw = new Uint8Array(await request.arrayBuffer());
    const expectedRevision = expectedHeader === "new" ? null : Number(expectedHeader);
    const receipt = await saveAccountProjectBundle(access.session.user.id, raw, expectedRevision);
    if (!receipt) return NextResponse.json({ error: "account_project_readback_failed" }, { status: 503 });
    return NextResponse.json({ receipt });
  } catch (error) { return responseForError(error); }
}
