import "server-only";

import { NextResponse } from "next/server";
import { BodyTooLarge } from "./readJson";

// (Nov 12 security) only these known codes reach the client; any other error is "account_project_failed".
// (Nov 14) one list for the picture routes (the two older project routes keep their own lists, unchanged).
const KNOWN_CODES: Record<string, number> = {
  project_too_large: 413, account_storage_full: 413, bundle_invalid: 400, account_project_invalid_scope: 400,
  account_project_not_found: 404, account_project_read_failed: 503, account_project_upload_failed: 503,
};

export const accountProjectResponseForError = (error: unknown) => {
  if (error instanceof BodyTooLarge) return NextResponse.json({ error: "project_too_large" }, { status: 413 });
  const code = error instanceof Error && error.message in KNOWN_CODES ? error.message : "account_project_failed";
  return NextResponse.json({ error: code }, { status: KNOWN_CODES[code] ?? 503 });
};
