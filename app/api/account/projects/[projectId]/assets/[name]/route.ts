import { NextResponse } from "next/server";
import { readBytes } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { accountProjectResponseForError } from "@/src/lib/account/projectRouteErrors";
import { readAccountProjectAsset, saveAccountProjectAsset } from "@/src/lib/account/projectServer";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; name: string }> };
const NAME = /^([0-9a-f]{64})\.(raw|deflate)$/;

// (Nov 14, picture-by-picture saving) ONE picture of a project, named by its fingerprint: <sha256>.<raw|deflate>.
export async function GET(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const { projectId, name } = await context.params;
  try {
    const bytes = await readAccountProjectAsset(access.session.user.id, projectId, name);
    return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
  } catch (error) { return accountProjectResponseForError(error); }
}

export async function PUT(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const { projectId, name } = await context.params;
  const match = NAME.exec(name);
  const byteLength = Number(request.headers.get("x-asset-byte-length"));
  const encoding = request.headers.get("x-asset-encoding");
  if (!match || request.headers.get("content-type")?.split(";")[0] !== "application/octet-stream" || !Number.isSafeInteger(byteLength)) {
    return NextResponse.json({ error: "account_project_invalid_request" }, { status: 400 });
  }
  try {
    const bytes = await readBytes(request, 45_000_000);
    await saveAccountProjectAsset(access.session.user.id, projectId, {
      assetId: `sha256:${match[1]}`, sha256: match[1], byteLength, encoding,
      ...(match[2] === "deflate" ? { compression: "deflate", compressedByteLength: bytes.byteLength } : {}),
    }, bytes);
    return NextResponse.json({ saved: true });
  } catch (error) { return accountProjectResponseForError(error); }
}
