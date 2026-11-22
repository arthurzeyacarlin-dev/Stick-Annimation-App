import "server-only";
import { auth } from "./auth";

// (Nov 22, Arthur: "if we do top up, there needs to be a verification ... maybe a password ... secure, but not too secure")
// Paying with the card on file asks for the account's password, checked here by the login system itself (Better Auth's own
// password check - the login, logout and sessions are not changed). Five wrong tries in 15 minutes and the payment box waits:
// nobody can guess a password through it. A right password clears the count.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_WRONG = 5;
const wrong = new Map<string, number[]>();

export async function passwordCheck(request: Request, ownerId: string, password: unknown): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = Date.now();
  const recent = (wrong.get(ownerId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_WRONG) return { ok: false, error: "Too many wrong passwords. Wait 15 minutes, then try again. Nothing was charged.", status: 429 };
  if (typeof password !== "string" || !password) return { ok: false, error: "Type your Diamond Animator password to pay with your saved card. Nothing was charged.", status: 400 };
  try {
    await auth.api.verifyPassword({ body: { password: password.slice(0, 256) }, headers: request.headers });
    wrong.delete(ownerId);
    return { ok: true };
  } catch {
    recent.push(now);
    wrong.set(ownerId, recent);
    return { ok: false, error: "That password isn't right. Nothing was charged.", status: 403 };
  }
}
