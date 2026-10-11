import "server-only";

import fs from "node:fs";
import path from "node:path";

// SPEC-0020 Phase 1: account emails (password reset). Until the real email service (Resend, set up by dad) is
// connected, every email goes to a local test inbox on this computer: .local/dev-mail/outbox.ndjson, readable at
// /dev/mail in development. Nothing is sent over the internet.

export type AccountMail = { to: string; subject: string; text: string; link?: string };
export type AccountMailRecord = AccountMail & { at: string };

const OUTBOX_DIR = path.resolve(process.cwd(), ".local/dev-mail");
const OUTBOX_PATH = path.join(OUTBOX_DIR, "outbox.ndjson");
const MAX_READ = 50;

export async function sendAccountMail(mail: AccountMail) {
  const record: AccountMailRecord = { ...mail, at: new Date().toISOString() };
  fs.mkdirSync(OUTBOX_DIR, { recursive: true, mode: 0o700 });
  fs.appendFileSync(OUTBOX_PATH, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  console.info(`[account mail → test inbox] ${mail.subject} → ${mail.to}`);
}

/** Newest first. Only used by the development-only /dev/mail page. */
export function readAccountMailOutbox(): AccountMailRecord[] {
  let raw = "";
  try {
    raw = fs.readFileSync(OUTBOX_PATH, "utf8");
  } catch {
    return [];
  }
  return raw.split("\n").filter(Boolean).slice(-MAX_READ).reverse().flatMap((line) => {
    try {
      const value = JSON.parse(line) as AccountMailRecord;
      return typeof value.to === "string" && typeof value.subject === "string" ? [value] : [];
    } catch {
      return [];
    }
  });
}
