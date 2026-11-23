import "server-only";

import fs from "node:fs";
import path from "node:path";

// SPEC-0020 Phase 1: account emails (password reset). Until the real email service (Resend, set up by dad) is
// connected, every email goes to a local test inbox on this computer: .local/dev-mail/outbox.ndjson, readable at
// /dev/mail in development. Nothing is sent over the internet.
// Nov 23: the real sender. ONLY when both RESEND_API_KEY and ACCOUNT_MAIL_FROM (for example
// "Diamond Animator <support@diamondanimator.com>") are set, the email really goes out through Resend and the test
// inbox is not used. With either one missing, everything is exactly as before.

export type AccountMail = { to: string; subject: string; text: string; link?: string };
export type AccountMailRecord = AccountMail & { at: string };

const OUTBOX_DIR = path.resolve(process.cwd(), ".local/dev-mail");
const OUTBOX_PATH = path.join(OUTBOX_DIR, "outbox.ndjson");
const MAX_READ = 50;

/** The real sender's settings, or null (then the test inbox is used). */
export function realMailSender() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ACCOUNT_MAIL_FROM?.trim();
  return key && from ? { key, from } : null;
}

export async function sendAccountMail(mail: AccountMail, fetcher: typeof fetch = fetch) {
  const sender = realMailSender();
  if (sender) {
    // A problem is logged (never the address or the link) and not thrown: "Forgot password?" must answer the same way
    // whether or not the email went out, so nobody can find out which emails have accounts.
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${sender.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      });
      if (!response.ok) console.error(`[account mail] not sent (${response.status}): ${mail.subject}`);
    } catch {
      console.error(`[account mail] not sent (no connection): ${mail.subject}`);
    }
    return;
  }
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
