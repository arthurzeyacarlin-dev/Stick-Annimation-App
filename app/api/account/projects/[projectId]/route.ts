import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { accountProjectHeadReceipt, deleteAccountProject, readAccountProjectBundle, readAccountProjectDescription } from "@/src/lib/account/projectServer";

export const runtime = "nodejs";

// (Nov 12 security) only these known codes reach the client; any other error is "account_project_failed"
const KNOWN_CODES: Record<string, number> = {   // every code projectServer itself makes, with the status it always had
  account_project_not_found: 404, stale_revision: 409, account_project_invalid_scope: 400, account_project_read_failed: 503, account_project_readback_failed: 503,
  account_project_deleted: 503, account_project_delete_failed: 503, account_project_write_failed: 503, account_project_upload_failed: 503,
};
const responseForError = (error: unknown) => {
  const code = error instanceof Error && error.message in KNOWN_CODES ? error.message : "account_project_failed";
  return NextResponse.json({ error: code }, { status: KNOWN_CODES[code] ?? 503 });
};

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const { projectId } = await context.params;
  try {
    const receipt = await accountProjectHeadReceipt(access.session.user.id, projectId);
    if (!receipt) return NextResponse.json({ error: "account_project_not_found" }, { status: 404 });
    if (new URL(request.url).searchParams.get("head") === "1") return NextResponse.json({ receipt });
    // (Nov 14) ?description=1: only a small bundle is sent (a long project's description, or a small project whole); 204 = it is a big one-file bundle
    const descriptionOnly = new URL(request.url).searchParams.get("description") === "1";
    const raw = descriptionOnly ? await readAccountProjectDescription(access.session.user.id, projectId) : await readAccountProjectBundle(access.session.user.id, projectId);
    if (!raw) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(raw), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store",
        "X-Project-Revision": String(receipt.revision), "X-Project-Digest": receipt.projectDigest },
    });
  } catch (error) { return responseForError(error); }
}

export async function DELETE(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const { projectId } = await context.params;
  const body = await readJson(request).catch(() => null) as { expectedRevision?: unknown; expectedDigest?: unknown } | null;
  if (!body || !Number.isSafeInteger(body.expectedRevision) || typeof body.expectedDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.expectedDigest)) {
    return NextResponse.json({ error: "account_project_invalid_request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await deleteAccountProject(access.session.user.id, projectId, body.expectedRevision as number, body.expectedDigest));
  } catch (error) { return responseForError(error); }
}
