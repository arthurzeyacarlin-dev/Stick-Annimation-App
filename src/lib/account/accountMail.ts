import "server-only";

import fs from "node:fs";
import path from "node:path";

// SPEC-0020 Phase 1: account emails (password reset). Until the real email service (Resend, set up by dad) is
// connected, every email goes to a local test inbox on this computer: .local/dev-mail/outbox.ndjson, readable at
// /dev/mail in development. Nothing is sent over the internet.

export type AccountMail = { to: string; subject: string; text: string; link?: string };
export type AccountMailRecord = AccountMail & { at: string };

// (Nov 11 security) real sending: when RESEND_API_KEY is set, mails go out through Resend; without it, the local outbox as before.
export const realMailConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim());
// No address gets more than 3 account mails an hour (reset / verification): a forgetful user is never blocked, a bot cannot bomb an inbox.
const MAILS_PER_HOUR = 3;
const recentByAddress = new Map<string, number[]>();
const allowedNow = (to: string, now = Date.now()) => {
  const key = to.trim().toLowerCase();
  const recent = (recentByAddress.get(key) ?? []).filter((at) => now - at < 60 * 60 * 1000);
  if (recentByAddress.size > 5000) recentByAddress.clear();
  if (recent.length >= MAILS_PER_HOUR) { recentByAddress.set(key, recent); return false; }
  recentByAddress.set(key, [...recent, now]);
  return true;
};

const OUTBOX_DIR = path.resolve(process.cwd(), ".local/dev-mail");
const OUTBOX_PATH = path.join(OUTBOX_DIR, "outbox.ndjson");
const MAX_READ = 50;

export async function sendAccountMail(mail: AccountMail) {
  if (!allowedNow(mail.to)) { console.warn(`[account mail] dropped: more than ${MAILS_PER_HOUR} an hour for one address`); return; }
  if (realMailConfigured()) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.ACCOUNT_MAIL_FROM ?? "Diamond Animator <no-reply@diamondanimator.com>", to: mail.to, subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) throw new Error(`The email service answered ${response.status}.`);
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
