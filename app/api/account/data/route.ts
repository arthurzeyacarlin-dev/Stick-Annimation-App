import { NextResponse } from "next/server";
import { requireAccountRequest } from "@/src/lib/account/access";
import {
  AccountDataConflictError,
  assertAccountDataIdentity,
  deleteAccountDataRecord,
  readAccountDataRecord,
  writeAccountDataRecord,
} from "@/src/lib/account/accountDataServer";

export const runtime = "nodejs";

const identity = (request: Request) => {
  const url = new URL(request.url);
  return assertAccountDataIdentity(url.searchParams.get("namespace"), url.searchParams.get("key"));
};

const revision = (request: Request, allowZero: boolean) => {
  const raw = request.headers.get("x-account-data-expected-revision") ?? "";
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error("account_data_revision_invalid");
  return value;
};

const recordHeaders = (record: { revision: number; digest: string; updatedAt: string }) => ({
  "Cache-Control": "no-store",
  "X-Account-Data-Revision": String(record.revision),
  "X-Account-Data-Digest": record.digest,
  "X-Account-Data-Updated-At": record.updatedAt,
});

const safeError = (error: unknown) => {
  if (error instanceof AccountDataConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  const code = error instanceof Error ? error.message : "account_data_failed";
  const status = code.includes("capacity") ? 413 : code.includes("identity") || code.includes("revision") ? 400 : 500;
  return NextResponse.json({ error: code }, { status });
};

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    const { namespace, key } = identity(request);
    const record = await readAccountDataRecord(access.session.user.id, namespace, key);
    if (!record) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "X-Account-Data-Missing": "1",
        },
      });
    }
    return new NextResponse(Buffer.from(record.payload), { status: 200, headers: { ...recordHeaders(record), "Content-Type": "application/octet-stream" } });
  } catch (error) { return safeError(error); }
}

export async function PUT(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    const { namespace, key } = identity(request);
    const expectedRevision = revision(request, true);
    const record = await writeAccountDataRecord(access.session.user.id, namespace, key, expectedRevision, new Uint8Array(await request.arrayBuffer()));
    return NextResponse.json({ revision: record.revision, digest: record.digest, updatedAt: record.updatedAt }, { headers: recordHeaders(record) });
  } catch (error) { return safeError(error); }
}

export async function DELETE(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  try {
    const { namespace, key } = identity(request);
    const removed = await deleteAccountDataRecord(access.session.user.id, namespace, key, revision(request, false));
    return NextResponse.json({ removed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeError(error); }
}
