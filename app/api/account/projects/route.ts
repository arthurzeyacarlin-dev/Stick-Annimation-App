import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { BodyTooLarge, readBytes } from "@/src/lib/account/readJson";
import { listAccountProjectHeads, saveAccountProjectBundle } from "@/src/lib/account/projectServer";

export const runtime = "nodejs";

// (Nov 4 PM12) the real reason, not a general 503. (Nov 12 security) only these known codes reach the client; any other error is "account_project_failed".
const KNOWN_CODES: Record<string, number> = {   // every code projectServer itself makes, with the status it always had
  stale_revision: 409, account_project_import_forbidden: 403, project_too_large: 413, account_storage_full: 413, project_limit_reached: 422,
  bundle_invalid: 400, account_project_invalid_scope: 400, account_project_deleted: 503, account_project_not_found: 503, account_project_readback_failed: 503,
  account_project_read_failed: 503, account_project_write_failed: 503, account_project_upload_failed: 503, account_project_delete_failed: 503,
  account_project_pictures_missing: 424,   // (Nov 14) a project description named a picture the account does not hold: nothing is saved, the next save sends it
};
const responseForError = (error: unknown) => {
  if (error instanceof BodyTooLarge) return NextResponse.json({ error: "project_too_large" }, { status: 413 });
  const code = error instanceof Error && error.message in KNOWN_CODES ? error.message : "account_project_failed";
  return NextResponse.json({ error: code }, { status: KNOWN_CODES[code] ?? 503 });
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
    const raw = new Uint8Array(await readBytes(request, 140_000_000));   // (Nov 12 security) counted in bytes, not trusted from the header
    const expectedRevision = expectedHeader === "new" ? null : Number(expectedHeader);
    const receipt = await saveAccountProjectBundle(access.session.user.id, raw, expectedRevision);
    if (!receipt) return NextResponse.json({ error: "account_project_readback_failed" }, { status: 503 });
    return NextResponse.json({ receipt });
  } catch (error) { return responseForError(error); }
}
