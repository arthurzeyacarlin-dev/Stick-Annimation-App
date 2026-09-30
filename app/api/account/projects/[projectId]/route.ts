import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import { accountProjectHeadReceipt, deleteAccountProject, readAccountProjectBundle } from "@/src/lib/account/projectServer";

export const runtime = "nodejs";

const responseForError = (error: unknown) => {
  const code = error instanceof Error ? error.message : "account_project_failed";
  const status = code === "account_project_not_found" ? 404 : code === "stale_revision" ? 409 :
    code === "account_project_invalid_scope" ? 400 : 503;
  return NextResponse.json({ error: code }, { status });
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
    const raw = await readAccountProjectBundle(access.session.user.id, projectId);
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
  const body = await request.json().catch(() => null) as { expectedRevision?: unknown; expectedDigest?: unknown } | null;
  if (!body || !Number.isSafeInteger(body.expectedRevision) || typeof body.expectedDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.expectedDigest)) {
    return NextResponse.json({ error: "account_project_invalid_request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await deleteAccountProject(access.session.user.id, projectId, body.expectedRevision as number, body.expectedDigest));
  } catch (error) { return responseForError(error); }
}
