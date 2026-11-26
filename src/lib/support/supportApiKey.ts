// SPEC-0027: the ticket API's own secret key (server only). Tested in supportRules.test.ts.
import { createHash, timingSafeEqual } from "node:crypto";

/** The secret key on the server (DIAMOND_SUPPORT_API_KEY); too short or unset = the ticket API is switched off. */
export function supportApiKey(value = process.env.DIAMOND_SUPPORT_API_KEY): string | null {
  const key = value?.trim() ?? "";
  return key.length >= 24 ? key : null;
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** True only for "Authorization: Bearer <the exact key>". Compared in constant time. */
export function checkSupportApiKey(header: string | null, configured: string | null): boolean {
  if (!configured || !header) return false;
  const match = /^Bearer\s+(\S+)$/.exec(header.trim());
  if (!match) return false;
  return timingSafeEqual(digest(match[1]), digest(configured));
}

