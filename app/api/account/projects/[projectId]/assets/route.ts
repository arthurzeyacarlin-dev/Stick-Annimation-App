import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { accountProjectResponseForError } from "@/src/lib/account/projectRouteErrors";
import { missingAccountProjectAssets } from "@/src/lib/account/projectServer";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

// (Nov 14, picture-by-picture saving) The app says which pictures a project needs; the answer is the ones the account
// does not hold yet. Only those are then sent, one by one (assets/[name]).
export async function POST(request: Request, context: Context) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  if (request.headers.get("x-account-owner") !== access.session.user.id) return NextResponse.json({ error: "account_session_changed" }, { status: 403 });
  const { projectId } = await context.params;
  try {
    const body = await readJson(request, 32 * 1024 * 1024).catch(() => null) as { assets?: unknown } | null;
    if (!body || !Array.isArray(body.assets)) return NextResponse.json({ error: "account_project_invalid_request" }, { status: 400 });
    return NextResponse.json({ missing: await missingAccountProjectAssets(access.session.user.id, projectId, body.assets) });
  } catch (error) { return accountProjectResponseForError(error); }
}
