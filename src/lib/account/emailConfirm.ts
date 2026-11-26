import "server-only";

import Database from "better-sqlite3";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ACCOUNT_LOCAL_ORIGIN } from "./accountConfig";
import { accountUsedTrial, readAccountPlanRecord, setTrialGate, startTrialAfterConfirm } from "./aiCredits";
import { sendAccountMail } from "./accountMail";
import { inboxHash, isConfirmCodeShape, isDisposableEmail, normalizeInbox, parseInboxList } from "./inbox";
import { OWNER_EMAILS } from "./owner";
import { ownerAlert } from "./ownerAlerts";

// (Dad, Nov 26) CONFIRM THE EMAIL, ONE FREE TRIAL PER REAL INBOX.
//   - Anyone can sign up and look around; the free trial (its AI credits) starts only once the email is confirmed: a link AND a
//     6-digit code (for phones) in one email. Login and logout are unchanged (no sign-in ever waits for this).
//   - One trial per real inbox (inbox.ts: anna+x@ = anna@, Gmail dots don't count). A salted fingerprint of each inbox that used a
//     trial is kept, also after the account is deleted, so "delete and sign up again" gets no second trial. Never the address.
//   - Throwaway email domains can't sign up. The owner's own test addresses (server setting DIAMOND_TRIAL_EXEMPT_EMAILS, never in the
//     code) are exempt: dad+test1@ and dad+test2@ each get a trial and a real confirm email.
//   - Many trials starting from one internet address in a day = an alert to the owner. Only an alert: schools share addresses.

const LOCAL_ROOT = path.resolve(process.cwd(), ".local/spec0015-phase3");
const CODE_LIFE_MS = 24 * 60 * 60 * 1000;
const RESEND_GAP_MS = 45_000;
const SENDS_PER_DAY = 6;
const TRIES_PER_CODE = 5;
/** Trials started from one internet address in 24 hours before the owner hears about it (alert only, never a block). */
export const TRIALS_PER_ADDRESS_ALERT = 5;

type Store = { db: Database.Database; salt: string };
const holder = globalThis as typeof globalThis & { diamondEmailConfirm?: Store };

function store(): Store {
  if (holder.diamondEmailConfirm) return holder.diamondEmailConfirm;
  fs.mkdirSync(LOCAL_ROOT, { recursive: true, mode: 0o700 });
  const saltPath = path.join(LOCAL_ROOT, "trial-inbox-salt");
  if (!fs.existsSync(saltPath)) fs.writeFileSync(saltPath, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
  const salt = fs.readFileSync(saltPath, "utf8").trim();
  const file = path.join(LOCAL_ROOT, "email-confirm.sqlite");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS trial_inbox_v1 (hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, at INTEGER NOT NULL, why TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS email_confirm_v1 (
      owner_id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
      tries INTEGER NOT NULL DEFAULT 0, last_sent_at INTEGER NOT NULL, sends INTEGER NOT NULL DEFAULT 0, sends_since INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_confirm_v1_token ON email_confirm_v1(token_hash);
    CREATE TABLE IF NOT EXISTS trial_address_v1 (address_hash TEXT NOT NULL, owner_id TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS trial_address_v1_hash ON trial_address_v1(address_hash, at);
  `);
  try { fs.chmodSync(file, 0o600); } catch { /* already private */ }
  holder.diamondEmailConfirm = { db, salt };
  return holder.diamondEmailConfirm;
}

const secretHash = (kind: string, value: string) => createHmac("sha256", store().salt).update(`${kind}:${value}`).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The owner's test addresses (and the owner) never count as a second trial and are never refused as throwaway. */
function isExemptInbox(inbox: string | null) {
  if (!inbox) return false;
  return [...parseInboxList(process.env.DIAMOND_TRIAL_EXEMPT_EMAILS), ...parseInboxList(OWNER_EMAILS.join(","))].includes(inbox);
}

/** Sign-up check (before the account exists): a throwaway email domain is refused. Returns the plain reason, or null. */
export function signUpEmailProblem(email: unknown): string | null {
  const inbox = normalizeInbox(email);
  if (isExemptInbox(inbox)) return null;
  // the owner can add domains without a code change (server setting DIAMOND_DISPOSABLE_DOMAINS, comma separated)
  const extra = String(process.env.DIAMOND_DISPOSABLE_DOMAINS ?? "").split(/[\s,;]+/).map((entry) => entry.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  if (isDisposableEmail(email, extra)) return "Please use your real email address. Throwaway email addresses can't start a free trial.";
  return null;
}

type AccountUser = { id: string; email: string; name?: string | null; ageGroup?: unknown };

/** The other accounts on the same real inbox that already used (or paid past) a free trial. */
async function inboxTrialTaken(inbox: string, ownerId: string): Promise<boolean> {
  const row = store().db.prepare("SELECT owner_id FROM trial_inbox_v1 WHERE hash = ?").get(inboxHash(inbox, store().salt)) as { owner_id: string } | undefined;
  if (row && row.owner_id !== ownerId) return true;
  // accounts from before the rule (no fingerprint yet): the same inbox on another account that has used its trial
  const { accountDatabase } = await import("./auth");
  const users = accountDatabase.prepare("SELECT id, email FROM user WHERE id != ?").all(ownerId) as { id: string; email: string }[];
  return users.some((user) => normalizeInbox(user.email) === inbox && accountUsedTrial(user.id));
}

/** Right after a sign-up: the trial waits for the email; or, when this inbox already had a trial, no trial (sent to Plans). */
export async function afterSignUp(user: AccountUser) {
  setTrialGate(user.id, "confirm");   // first, so nothing can ever start the trial before the email is confirmed
  const inbox = normalizeInbox(user.email);
  const taken = inbox && !isExemptInbox(inbox) ? await inboxTrialTaken(inbox, user.id) : false;
  if (taken) { setTrialGate(user.id, "no_trial"); return; }
  await sendConfirmEmail(user, { first: true });
}

export type ConfirmState = "confirm" | "confirmed" | "no_trial";
export function confirmState(ownerId: string): ConfirmState {
  const gate = readAccountPlanRecord(ownerId).trialGate ?? null;
  return gate === "confirm" || gate === "confirm_legacy" ? "confirm" : gate === "no_trial" ? "no_trial" : "confirmed";
}

const plainError = (message: string, status = 400) => Object.assign(new Error(message), { status });

/** Sends (or sends again) the email with the link and the 6-digit code. At most one every 45 seconds and 6 a day. */
export async function sendConfirmEmail(user: AccountUser, options: { first?: boolean } = {}, now = Date.now()) {
  if (confirmState(user.id) !== "confirm") return { sent: false };
  const { db } = store();
  const was = db.prepare("SELECT * FROM email_confirm_v1 WHERE owner_id = ?").get(user.id) as { last_sent_at: number; sends: number; sends_since: number } | undefined;
  const fresh = !was || now - was.sends_since > 24 * 60 * 60 * 1000;
  if (was && !options.first && now - was.last_sent_at < RESEND_GAP_MS) throw plainError("We just sent it. Give it a minute, and check your spam folder too.", 429);
  if (was && !fresh && was.sends >= SENDS_PER_DAY) throw plainError("We've sent a lot of emails today. Check your spam folder, or try again tomorrow.", 429);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = randomBytes(24).toString("base64url");
  db.prepare(`INSERT INTO email_confirm_v1 (owner_id, email, code_hash, token_hash, expires_at, tries, last_sent_at, sends, sends_since)
    VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)
    ON CONFLICT(owner_id) DO UPDATE SET email = excluded.email, code_hash = excluded.code_hash, token_hash = excluded.token_hash,
      expires_at = excluded.expires_at, tries = 0, last_sent_at = excluded.last_sent_at,
      sends = CASE WHEN ? THEN 1 ELSE email_confirm_v1.sends + 1 END, sends_since = CASE WHEN ? THEN excluded.sends_since ELSE email_confirm_v1.sends_since END`)
    .run(user.id, user.email, secretHash("code", `${user.id}:${code}`), secretHash("token", token), now + CODE_LIFE_MS, now, now, fresh ? 1 : 0, fresh ? 1 : 0);
  const link = `${ACCOUNT_LOCAL_ORIGIN}/api/account/email-confirm/link?token=${encodeURIComponent(token)}`;
  const parent = user.ageGroup === "parent";
  await sendAccountMail({
    to: user.email,
    subject: `Your Diamond Animator code: ${code}`,
    text: `Hi ${user.name?.trim() || "there"},\n\nWelcome to Diamond Animator! Confirm your email address to start ${parent ? "the free 14-day trial for your child's account" : "your free 14-day trial"}.\n\nYour code: ${code}\n\nOr open this link:\n${link}\n\nThe code and the link work for 24 hours. If you didn't make this account, you can ignore this email.`,
    link,
  });
  return { sent: true };
}

/** The address a request came from, as a salted fingerprint (never stored as the address). */
function addressHashOf(headers: Headers | null | undefined): string | null {
  const raw = headers?.get("cf-connecting-ip") ?? headers?.get("x-real-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0] ?? null;
  const ip = raw?.trim();
  return ip ? secretHash("address", ip) : null;
}

/** The email is confirmed: the inbox is checked once more (two sign-ups at the same time), its fingerprint is kept, the trial
 *  starts, and many trials from one address in a day tell the owner. */
async function finishConfirm(user: AccountUser, headers: Headers | null | undefined, now = Date.now()): Promise<ConfirmState> {
  const { db, salt } = store();
  const inbox = normalizeInbox(user.email);
  const exempt = isExemptInbox(inbox);
  if (inbox && !exempt && (await inboxTrialTaken(inbox, user.id))) {
    setTrialGate(user.id, "no_trial");
    db.prepare("DELETE FROM email_confirm_v1 WHERE owner_id = ?").run(user.id);
    return "no_trial";
  }
  if (inbox && !exempt) db.prepare("INSERT OR IGNORE INTO trial_inbox_v1 (hash, owner_id, at, why) VALUES (?, ?, ?, 'trial')").run(inboxHash(inbox, salt), user.id, now);
  const started = startTrialAfterConfirm(user.id, now);
  db.prepare("DELETE FROM email_confirm_v1 WHERE owner_id = ?").run(user.id);
  try {
    const { auth } = await import("./auth");
    await (await auth.$context).internalAdapter.updateUser(user.id, { emailVerified: true });
  } catch { /* the trial rule above is what counts */ }
  const address = addressHashOf(headers);
  if (started && address) {
    db.prepare("INSERT INTO trial_address_v1 (address_hash, owner_id, at) VALUES (?, ?, ?)").run(address, user.id, now);
    db.prepare("DELETE FROM trial_address_v1 WHERE at < ?").run(now - 7 * 24 * 60 * 60 * 1000);
    const count = (db.prepare("SELECT COUNT(DISTINCT owner_id) AS n FROM trial_address_v1 WHERE address_hash = ? AND at >= ?").get(address, now - 24 * 60 * 60 * 1000) as { n: number }).n;
    if (count >= TRIALS_PER_ADDRESS_ALERT) {
      ownerAlert(`trial-address:${address.slice(0, 16)}`, `${count} free trials started from the same internet address in the last 24 hours (newest account ${user.id}). This is only an alert, nothing was blocked: a school or family can share one address. If it looks like one person making many accounts, check them in the owner tools.`, now);
    }
  }
  return "confirmed";
}

/** The 6-digit code typed in the app. At most 5 tries per code (then a new one must be sent). */
export async function confirmByCode(user: AccountUser, code: unknown, headers: Headers | null | undefined, now = Date.now()): Promise<ConfirmState> {
  const state = confirmState(user.id);
  if (state !== "confirm") return state;
  if (!isConfirmCodeShape(code)) throw plainError("Type the 6 numbers from the email.");
  const { db } = store();
  const row = db.prepare("SELECT code_hash, expires_at, tries FROM email_confirm_v1 WHERE owner_id = ?").get(user.id) as { code_hash: string; expires_at: number; tries: number } | undefined;
  if (!row) throw plainError("Press \"Send the email again\" for a new code.");
  if (row.tries >= TRIES_PER_CODE) throw plainError("That was too many tries. Press \"Send the email again\" for a new code.", 429);
  if (now > row.expires_at) throw plainError("That code is too old. Press \"Send the email again\" for a new one.");
  if (!sameHash(row.code_hash, secretHash("code", `${user.id}:${code.trim()}`))) {
    db.prepare("UPDATE email_confirm_v1 SET tries = tries + 1 WHERE owner_id = ?").run(user.id);
    throw plainError("That code isn't right. Check the newest email from us and try again.");
  }
  return finishConfirm(user, headers, now);
}

/** The link in the email (it works signed out too, e.g. opened on a phone). */
export async function confirmByLink(token: unknown, headers: Headers | null | undefined, now = Date.now()): Promise<ConfirmState | "bad_link"> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return "bad_link";
  const { db } = store();
  const row = db.prepare("SELECT owner_id, expires_at FROM email_confirm_v1 WHERE token_hash = ?").get(secretHash("token", token)) as { owner_id: string; expires_at: number } | undefined;
  if (!row || now > row.expires_at) return "bad_link";
  const { accountDatabase } = await import("./auth");
  const user = accountDatabase.prepare("SELECT id, email, name FROM user WHERE id = ?").get(row.owner_id) as AccountUser | undefined;
  if (!user) return "bad_link";
  return finishConfirm(user, headers, now);
}

/** "Wrong email? Fix it": only while the email is not confirmed yet. The new address gets the email; the trial rule is checked
 *  again for it. The account's login email becomes the new one (that is the fix). */
export async function changeUnconfirmedEmail(user: AccountUser, email: unknown): Promise<{ email: string; state: ConfirmState }> {
  if (confirmState(user.id) !== "confirm") throw plainError("Your email is already confirmed. You can change it in Profile.", 409);
  const next = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(next) || next.length > 254) throw plainError("Type the whole email address, like name@example.com.");
  if (next === user.email.toLowerCase()) throw plainError("That's the same address. Check the spelling, or press \"Send the email again\".");
  const problem = signUpEmailProblem(next);
  if (problem) throw plainError(problem);
  const { auth } = await import("./auth");
  const context = await auth.$context;
  if (await context.internalAdapter.findUserByEmail(next)) throw plainError("That email already has an account. Log in with it instead.", 409);
  await context.internalAdapter.updateUser(user.id, { email: next, emailVerified: false });
  const moved = { ...user, email: next };
  const inbox = normalizeInbox(next);
  if (inbox && !isExemptInbox(inbox) && (await inboxTrialTaken(inbox, user.id))) {
    setTrialGate(user.id, "no_trial");
    store().db.prepare("DELETE FROM email_confirm_v1 WHERE owner_id = ?").run(user.id);
    return { email: next, state: "no_trial" };
  }
  store().db.prepare("UPDATE email_confirm_v1 SET last_sent_at = 0 WHERE owner_id = ?").run(user.id);   // the new address gets its email now
  await sendConfirmEmail(moved);
  return { email: next, state: "confirm" };
}

/** Deleting an account (called BEFORE its plan record goes): when it used its free trial, its inbox's fingerprint is kept, so
 *  the same inbox gets no second free trial. An account that never confirmed blocks nobody. */
export function rememberInboxOnDelete(user: { id: string; email: string }, now = Date.now()) {
  try {
    const inbox = normalizeInbox(user.email);
    const { db, salt } = store();
    if (inbox && !isExemptInbox(inbox) && accountUsedTrial(user.id)) db.prepare("INSERT OR IGNORE INTO trial_inbox_v1 (hash, owner_id, at, why) VALUES (?, ?, ?, 'deleted')").run(inboxHash(inbox, salt), user.id, now);
    db.prepare("DELETE FROM email_confirm_v1 WHERE owner_id = ?").run(user.id);
    db.prepare("DELETE FROM trial_address_v1 WHERE owner_id = ?").run(user.id);
  } catch { /* never stops a deletion */ }
}
