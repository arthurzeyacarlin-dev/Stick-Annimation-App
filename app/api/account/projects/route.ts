import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import {
  accountProjectErrorStatus, commitAccountProjectUpload, listAccountProjectHeads,
  parseAccountProjectUploadBody, prepareAccountProjectUpload,
} from "@/src/lib/account/projectServer";

export const runtime = "nodejs";
// Commit downloads and verifies up to ~140 MB of uploaded parts before saving the version.
export const maxDuration = 120;

const responseForError = (error: unknown) => {
  const code = error instanceof Error ? error.message : "account_project_failed";
  return NextResponse.json({ error: code }, { status: accountProjectErrorStatus(code) });
};

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  try { return NextResponse.json({ projects: await listAccountProjectHeads(access.session.user.id) }); }
  catch (error) { return responseForError(error); }
}

// Metadata only. The project bundle itself never passes through this server:
// "prepare" checks ownership/revision and returns signed upload links to the private
// bucket; the browser uploads the parts there; "commit" verifies those parts on the
// server (size, SHA-256, gzip, bundle, project identity) and only then saves the version.
export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json" || !(length <= 16_384)) {
    return NextResponse.json({ error: "account_project_invalid_request" }, { status: 400 });
  }
  try {
    const text = await request.text();
    if (text.length > 16_384) return NextResponse.json({ error: "account_project_invalid_request" }, { status: 400 });
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* rejected by the parser below */ }
    const { action, input } = parseAccountProjectUploadBody(body);
    const ownerId = access.session.user.id;
    if (action === "prepare") return NextResponse.json(await prepareAccountProjectUpload(ownerId, input));
    return NextResponse.json({ receipt: await commitAccountProjectUpload(ownerId, input) });
  } catch (error) { return responseForError(error); }
}
