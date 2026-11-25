// (Nov 25, Arthur: "I don't want to keep topping up fal ... my dad should not find this problem") THE FAL MONEY WATCH.
// fal (the company whose AI makes the animations) is paid in advance from ONE account: the business's own, never a
// customer's. When that account is empty every animation stops. The app already says so honestly, takes no credits and
// tells the owner (v1AnimatorCore.ts, "ai-animator-fal-balance") - but only AFTER someone was stopped.
// This watch looks BEFORE: at most once every 10 minutes, while people use the AI Animator, it asks fal how much money is
// left (fal's own free account call - it makes nothing and costs nothing) and tells the owner in the in-app inbox when the
// money is getting low, with how many short animations are left. Customers never see or hear any of it.
// It only reads. It never pays, never moves money and never changes how animations are made, charged or refunded.
// The key is the one the engine already uses (diamond-engine/.env.local, FAL_KEY); it is never logged or sent anywhere but fal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ownerAlert } from "./ownerAlerts.ts";

/** 1 credit = 1 cent of real AI cost, and a short (10 second) animation is 67 credits. */
export const SHORT_ANIMATION_USD = 0.67;
export const FAL_LOW_USD = 10;
export const FAL_VERY_LOW_USD = 3;
const CHECK_EVERY_MS = 10 * 60 * 1000;
const BILLING_URL = "https://api.fal.ai/v1/account/billing?expand=credits";

export type FalBalance = { usd: number } | { unknown: string };

/** One key line of the engine's settings file (null = none). */
function keyLine(settings: string, name: string): string | null {
  for (const line of settings.split(/\r?\n/)) {
    if (!line.startsWith(`${name}=`)) continue;
    const key = line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
    return key || null;
  }
  return null;
}
/** The key the watch asks with. (Nov 25, live: fal answered the engine's own key with "This API key is not permitted to perform
 *  this action" - a key that may only make animations may not read the account's money.) So a second line, FAL_ADMIN_KEY (a key
 *  made on fal with the Admin scope), is used when it is there; without it the engine's FAL_KEY is tried as before. */
export function falKeyFrom(settings: string): string | null {
  return keyLine(settings, "FAL_ADMIN_KEY") ?? keyLine(settings, "FAL_KEY");
}

/** Asks fal how much money the account has. Any problem = { unknown } (never throws, never guesses a number). */
export async function readFalBalance(key: string, fetcher: typeof fetch = fetch): Promise<FalBalance> {
  try {
    const answer = await fetcher(BILLING_URL, { headers: { Authorization: `Key ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!answer.ok) {
      // fal's own short reason (e.g. "this key may not read billing", or "User is locked. Reason: Exhausted balance"); never the key
      let why = "";
      try { const text = await answer.text(); const body = JSON.parse(text) as { detail?: unknown; message?: unknown; error?: unknown };
        why = String(typeof body.detail === "string" ? body.detail : typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : JSON.stringify(body.detail ?? body.error ?? "")).replace(/\s+/g, " ").slice(0, 160); } catch { why = ""; }
      return { unknown: `fal answered ${answer.status}${why ? `: ${why}` : ""}` };
    }
    const body = await answer.json() as { credits?: { current_balance?: unknown; currency?: unknown } };
    const usd = Number(body?.credits?.current_balance);
    const currency = String(body?.credits?.currency ?? "USD").toUpperCase();
    if (!Number.isFinite(usd) || currency !== "USD") return { unknown: "fal's answer had no dollar balance" };
    return { usd };
  } catch { return { unknown: "fal could not be reached" }; }
}

const dollars = (usd: number) => `$${Math.max(0, usd).toFixed(2)}`;

/** What the owner is told for this balance (null = plenty left, nothing to say). */
export function falBalanceAlert(usd: number, low = FAL_LOW_USD, veryLow = FAL_VERY_LOW_USD): { key: string; text: string } | null {
  if (!(usd < low)) return null;
  const left = Math.max(0, Math.floor(usd / SHORT_ANIMATION_USD));
  const about = `${dollars(usd)} left, about ${left} short ${left === 1 ? "animation" : "animations"}`;
  return usd < veryLow
    ? { key: "ai-animator-fal-almost-empty", text: `The animator's money account (fal) is almost empty: ${about}. Add money to fal today, or the AI Animator stops for everyone. Nobody has been stopped yet and no credits are affected.` }
    : { key: "ai-animator-fal-low", text: `The animator's money account (fal) is getting low: ${about}. Add money to fal soon so nobody is stopped. Nothing is broken and no credits are affected.` };
}

type Watch = { lastAt: number; last: FalBalance | null; running: boolean };
const cache = globalThis as typeof globalThis & { diamondFalWatch?: Watch };

/** Called while people use the AI Animator. Looks at most once every 10 minutes, in the background; never throws, never waits. */
export function watchFalBalance(options: {
  root?: string | null; now?: number; fetcher?: typeof fetch; alert?: (key: string, text: string) => void;
  readSettings?: (path: string) => string; low?: number; veryLow?: number;
} = {}): Promise<FalBalance | null> {
  const watch = cache.diamondFalWatch ??= { lastAt: 0, last: null, running: false };
  const now = options.now ?? Date.now();
  if (watch.running || now - watch.lastAt < CHECK_EVERY_MS) return Promise.resolve(null);
  watch.running = true; watch.lastAt = now;
  return (async () => {
    try {
      const root = options.root ?? process.env.DIAMOND_ENGINE_ROOT?.trim();
      if (!root) return null;
      let key: string | null = null;
      try { key = falKeyFrom((options.readSettings ?? ((path) => readFileSync(path, "utf8")))(join(root, "diamond-engine", ".env.local"))); } catch { key = null; }
      if (!key) return null;
      const balance = await readFalBalance(key, options.fetcher);
      watch.last = balance;
      if ("unknown" in balance && /exhausted balance|user is locked|top up your balance/i.test(balance.unknown)) {
        console.warn("[fal money watch] fal says the account is EMPTY (locked): the AI Animator cannot make animations until money is added");
        try { (options.alert ?? ownerAlert)("ai-animator-fal-balance", "The animator's money account (fal) is EMPTY: fal has locked it, so the AI Animator cannot make animations right now. Add money to fal. Users are told nothing was made and no credits are taken."); } catch { /* the log line stays */ }
        return { usd: 0 };
      }
      if ("unknown" in balance) {
        const noRights = /not permitted|forbidden|unauthori[sz]ed|\b40[13]\b/i.test(balance.unknown);
        console.warn(`[fal money watch] the balance could not be read (${balance.unknown})${noRights ? ". This key may not read the account's money: add a line FAL_ADMIN_KEY=<a fal key with the Admin scope> to diamond-engine/.env.local" : ""}; the watch tries again in 10 minutes`);
        return balance;
      }
      const lowAt = options.low ?? (Number(process.env.DIAMOND_FAL_LOW_USD) > 0 ? Number(process.env.DIAMOND_FAL_LOW_USD) : FAL_LOW_USD);
      console.info(`[fal money watch] ${dollars(balance.usd)} left (the owner is told below ${dollars(lowAt)})`);
      const say = falBalanceAlert(balance.usd, lowAt, options.veryLow ?? Math.min(FAL_VERY_LOW_USD, lowAt));
      if (say) { try { (options.alert ?? ownerAlert)(say.key, say.text); } catch { /* the log line above stays */ } }
      return balance;
    } catch { return null; } finally { watch.running = false; }
  })();
}

/** (tests) forget the last look. */
export function resetFalWatch() { cache.diamondFalWatch = undefined; }
