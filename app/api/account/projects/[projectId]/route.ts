import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import {
  accountProjectDownload, accountProjectErrorStatus, accountProjectHeadReceipt, deleteAccountProject,
} from "@/src/lib/account/projectServer";

export const runtime = "nodejs";

const responseForError = (error: unknown) => {
  const code = error instanceof Error ? error.message : "account_project_failed";
  return NextResponse.json({ error: code }, { status: accountProjectErrorStatus(code) });
};

type Context = { params: Promise<{ projectId: string }> };

// GET ?head=1 → the head receipt. GET → the receipt plus short-lived signed download
// links for the private bucket; the browser downloads and re-checks size + SHA-256.
export async function GET(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const { projectId } = await context.params;
  try {
    if (new URL(request.url).searchParams.get("head") === "1") {
      const receipt = await accountProjectHeadReceipt(access.session.user.id, projectId);
      if (!receipt) return NextResponse.json({ error: "account_project_not_found" }, { status: 404 });
      return NextResponse.json({ receipt });
    }
    return NextResponse.json(await accountProjectDownload(access.session.user.id, projectId), {
      headers: { "Cache-Control": "no-store" },
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
