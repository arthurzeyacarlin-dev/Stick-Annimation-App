// (Dad, Nov 26: "people should have to confirm their email address to sign up for a free trial, and they can't create free email
// addresses like using the + sign like I did... make sure that that's not a loophole") ONE FREE TRIAL PER REAL INBOX.
// The pure rules (no database, no network), tested in inbox.test.ts.
import { createHmac } from "node:crypto";
import { DISPOSABLE_EMAIL_DOMAINS } from "./disposableEmailDomains.ts";

/** The real inbox an address delivers to: lowercase; everything after "+" is dropped (anna+test1@x.com = anna@x.com); on Gmail
 *  the dots don't count either and googlemail.com is gmail.com (a.n.n.a@googlemail.com = anna@gmail.com). Null = not an address. */
export function normalizeInbox(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1).replace(/\.+$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  if (!local) return null;
  return `${local}@${domain}`;
}

/** A throwaway ("10-minute") email domain, or one under it (mail.mailinator.com). `extra` = the owner's own additions. */
export function isDisposableEmail(email: unknown, extra: readonly string[] = []): boolean {
  const inbox = normalizeInbox(email);
  if (!inbox) return false;
  const domain = inbox.slice(inbox.indexOf("@") + 1);
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (DISPOSABLE_EMAIL_DOMAINS.has(candidate) || extra.includes(candidate)) return true;
  }
  return false;
}

/** The salted fingerprint kept for an inbox that used a free trial: never the address itself. */
export const inboxHash = (inbox: string, salt: string) => createHmac("sha256", salt).update(`trial-inbox:${inbox}`).digest("hex");

/** The owner's own list (a server setting, never in the code): comma or space separated addresses. Each one is compared as its
 *  real inbox, so dad+test1@... and dad+test2@... both count as the listed dad@... */
export function parseInboxList(value: string | undefined | null): string[] {
  return String(value ?? "").split(/[\s,;]+/).map((entry) => normalizeInbox(entry)).filter((entry): entry is string => Boolean(entry));
}

/** The 6-digit code for phones (the email also has a link). */
export const CONFIRM_CODE_LENGTH = 6;
export const isConfirmCodeShape = (code: unknown): code is string => typeof code === "string" && /^\d{6}$/.test(code.trim());
