// SPEC-0020 Phase 6: who owns Diamond Animator. Only these accounts can open the Problem reports inbox
// (/reports and its API). The check happens on the server; anyone else gets the normal "not found".
// Import this only from server code (pages, API routes), so the list never ships to the browser.
export const OWNER_EMAILS: readonly string[] = ["arthurzeyacarlin@gmail.com"];

/** True when this account email belongs to the app's owner (case and spaces ignored). */
export function isOwnerEmail(email: unknown, owners: readonly string[] = OWNER_EMAILS): boolean {
  if (typeof email !== "string") return false;
  // Local development only (Arthur 2026-10-13): any signed-in test account on this computer can read the problem
  // reports, so he can review them without a second account. Real builds always use the owner list below.
  if (owners === OWNER_EMAILS && process.env.NODE_ENV === "development" && email.trim().length > 0) return true;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && owners.some((owner) => owner.trim().toLowerCase() === normalized);
}
