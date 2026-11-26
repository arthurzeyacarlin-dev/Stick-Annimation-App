import "server-only";
import fs from "node:fs";
import path from "node:path";

// Stripe billing (Nov 20 rebuild, Arthur: "People are taking out their wallet and giving me money... it has to be perfect").
// ONE rule: Stripe is the truth, and the app always asks Stripe. syncWithStripe() reads this account's subscriptions, bills,
// refunds, disputes and finished checkout pages fresh from Stripe and applies them the same way every time, each Stripe
// object once. It runs when the plan loads (at most once a minute), when the person comes back from Stripe's page, when
// Stripe rings the webhook doorbell, and once a day for every paying account (the match check, which tells the owner).
//   - One plan only: any second live subscription is stopped at once and its payment refunded in full.
//   - A cycle's plan credits come only once that cycle is paid; an upgrade is charged at once, a downgrade waits for the
//     next cycle (the Manage plan page's settings).
//   - A refund takes that payment's credits back; a dispute pauses the AI.
//   - Deleting an account stops the plan first and gives back everything but the AI it used and Stripe's fee.
// Cards are typed only on Stripe's own pages; this app never sees a card number. Real money runs only with dad's
// restricted live key AND STRIPE_LIVE_OK=yes; otherwise test mode (fake cards) or off.
import {
  addFreeRefund, addTopUpCredits, applyRefundTotal, applySubscriptionState, claimBillingEvent, findOwnerByStripeCustomer,
  findPaymentByCharge, getAccountPlanStatus, listBillingOwners, listPayments, markBillingSynced, planCreditsUsedSince,
  readAccountBillingIds, readAccountPlanRecord, readBillingFacts, recordPayment, releaseBillingEvent, setBillingNotice,
  setDisputed, setStripeCustomerId,
} from "./aiCredits";
import {
  ACCOUNT_PLANS, addCycles, creditWindow, isPaidPlanId, PAID_PLAN_IDS, PLAN_CYCLE, TOP_UP_PACKS,
  type BillingInterval, type PaidPlanId, isTopUpPackId,
} from "./plans";
import { dollarsText, creditsText } from "./credits";
import {
  assertAllowedStripeKey, BillingError, billingModeForKey, BOTH_EXTRA_PERCENT, deletionRefund, normalizeCode, FIRST50_MONTHS, FIRST50_PERCENT, YOUTUBE_PERCENT, encodeStripeForm, estimateStripeFeeCents,
  idempotencyKey, isBillingInterval, isChargingSubscriptionStatus, isLiveSubscriptionStatus, mapSubscriptionStatus, pickOffer, planLookupKey, planUnitAmount,
  STRIPE_API_VERSION, STRIPE_CATALOG, subscriptionPeriodEndMs, subscriptionPeriodStartMs, subscriptionPlan, verifyStripeSignature,
  type BillingMode, type CatalogEntry, type DeletionRefund, type FormValue, type Offer, type RefundablePayment,
} from "./stripeBillingRules";
import { ownerAlert } from "./ownerAlerts";

export { BillingError } from "./stripeBillingRules";

const STRIPE_API = "https://api.stripe.com/v1";
const SYNC_EVERY_MS = 60_000;
const SERVICE_PROBLEM = "The payment service had a problem. Nothing was charged. Try again in a moment.";

/** A Stripe API error, kept in plain words for the person; the Stripe code is only for our own checks. */
class StripeApiError extends BillingError {
  stripeCode: string | null;
  httpStatus: number;
  constructor(status: number, stripeCode: string | null) {
    super(SERVICE_PROBLEM, status >= 500 ? 502 : status === 429 ? 503 : 502);
    this.stripeCode = stripeCode;
    this.httpStatus = status;
  }
}

const liveOk = () => process.env.STRIPE_LIVE_OK?.trim() === "yes";
const stripeKey = () => assertAllowedStripeKey(process.env.STRIPE_SECRET_KEY, liveOk());

/** "test", "live" or "off". The key itself never leaves the server. */
export const billingMode = (): BillingMode => billingModeForKey(process.env.STRIPE_SECRET_KEY, liveOk());

/** Nov 21 (Arthur: "You never see Stripe"): cards are typed in Diamond Animator's own card form (Stripe's secure fields, styled
 *  like the app). That form needs Stripe's PUBLIC browser key (pk_test_ / pk_live_, made to be shown in browsers). It must match
 *  the secret key's mode, or card payments stay off. */
export function billingPublicKey(): string | null {
  // the setting, or (this Mac's test copy) the git-ignored file .local/stripe-publishable-key, read when asked (no restart needed)
  let key = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY ?? "").trim();
  if (!key) {
    try { key = fs.readFileSync(path.join(process.cwd(), ".local", "stripe-publishable-key"), "utf8").trim(); } catch { key = ""; }
  }
  const mode = billingMode();
  if (mode === "test" && /^pk_test_[A-Za-z0-9]{10,}$/.test(key)) return key;
  if (mode === "live" && /^pk_live_[A-Za-z0-9]{10,}$/.test(key)) return key;
  return null;
}

/** Test copy on this Mac only (development + test mode): when no public key is set, the app finds its OWN test account's public
 *  key by itself, so nobody has to copy anything (Arthur, Nov 21). It makes one unused card page for this account, reads the
 *  public key that page carries, closes the page at once, and keeps the key in the git-ignored .local file. Live mode always
 *  uses the real setting instead. */
export async function ensureBillingPublicKey(): Promise<string | null> {
  const known = billingPublicKey();
  if (known || billingMode() !== "test" || process.env.NODE_ENV !== "development") return known;
  const pending = cache.diamondCardKeyLookup ??= (async () => {
    try {
      const page = await stripeRequest<{ id: string; url: string | null }>("POST", "/checkout/sessions", {
        mode: "setup", currency: "usd", payment_method_types: ["card"], metadata: { kind: "public-key-lookup" },
        success_url: "https://diamondanimator.com/", cancel_url: "https://diamondanimator.com/",
      });
      try { await stripeRequest("POST", `/checkout/sessions/${encodeURIComponent(page.id)}/expire`); } catch { /* it expires by itself */ }
      const fragment = page.url?.split("#")[1] ?? "";
      const bytes = Buffer.from(decodeURIComponent(fragment).replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const text = Buffer.from(bytes.map((byte) => byte ^ 5)).toString("utf8");
      const key = /pk_test_[A-Za-z0-9]{10,}/.exec(text)?.[0] ?? null;
      if (!key) return null;
      fs.mkdirSync(path.join(process.cwd(), ".local"), { recursive: true });
      fs.writeFileSync(path.join(process.cwd(), ".local", "stripe-publishable-key"), `${key}\n`, { mode: 0o600 });
      return key;
    } catch {
      return null;
    } finally {
      setTimeout(() => { cache.diamondCardKeyLookup = undefined; }, 60_000).unref?.();
    }
  })();
  return pending;
}

/** The app's own address for Stripe's return links. */
export const billingOrigin = (request: Request) => {
  const https = request.headers.get("x-forwarded-proto") === "https" || billingMode() === "live";
  return `${https ? "https" : "http"}://${request.headers.get("host") ?? "localhost:3000"}`;
};

/** Turns any error into a plain-words message + status for the API routes. */
export function billingErrorResponse(error: unknown): { error: string; status: number } {
  if (error instanceof BillingError) return { error: error.message, status: error.status };
  console.warn("[billing] unexpected problem:", error instanceof Error ? error.name : "unknown");
  return { error: SERVICE_PROBLEM, status: 500 };
}

// Tests replace the network with a pretend Stripe here (globalThis.diamondStripeFetch); the app always uses fetch.
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const transport = (): Transport => (globalThis as { diamondStripeFetch?: Transport }).diamondStripeFetch ?? fetch;

/** One request to Stripe. POST/DELETE with an idempotency key are retried once on a network problem or a Stripe hiccup:
 *  the same key makes Stripe do it only once, so a retry can never charge, refund or create anything twice. */
async function stripeRequest<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, FormValue> = {}, key?: string): Promise<T> {
  const secret = stripeKey();
  const body = encodeStripeForm(params);
  const url = method !== "POST" && body ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}`, "Stripe-Version": STRIPE_API_VERSION };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (key && method !== "GET") headers["Idempotency-Key"] = key;
  for (let attempt = 0; ; attempt++) {
    const mayRetry = attempt === 0 && (method === "GET" || Boolean(key));
    let response: Response;
    try {
      response = await transport()(url, { method, headers, body: method === "POST" ? body : undefined, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    } catch {
      if (mayRetry) { await new Promise((done) => setTimeout(done, 800)); continue; }
      throw new BillingError("The payment service didn't answer. Nothing was charged. Try again in a moment.", 502);
    }
    const data = await response.json().catch(() => null) as (T & { error?: { type?: string; code?: string } }) | null;
    if (response.ok && data) return data;
    if (mayRetry && (response.status >= 500 || response.status === 429)) { await new Promise((done) => setTimeout(done, 800)); continue; }
    const code = data?.error?.code ?? null;
    console.warn(`[billing] Stripe ${method} ${path.split("/").slice(0, 3).join("/")} failed: ${response.status} ${data?.error?.type ?? ""} ${code ?? ""}`);
    throw new StripeApiError(response.status, code);
  }
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

// ---------- Catalog (products + prices found or created by lookup key) and the customer portal ----------

type StripeProductRef = string | { id: string; active?: boolean; deleted?: boolean };
type StripePrice = {
  id: string; lookup_key: string | null; unit_amount: number | null; currency: string; active: boolean;
  recurring: { interval: string } | null; product: StripeProductRef; metadata?: Record<string, string> | null;
};
export type StripeCatalog = Record<string, { priceId: string; productId: string }>;

type BillingGlobal = typeof globalThis & {
  diamondStripeCatalog?: Promise<StripeCatalog>;
  diamondStripeCatalogKey?: string;
  diamondStripePortalConfig?: Promise<string>;
  diamondStripeSyncs?: Map<string, Promise<SyncReport>>;
  diamondStripeCustomers?: Map<string, Promise<string>>;
  diamondStripeSweeper?: boolean;
  diamondPlanChanges?: Map<string, Promise<unknown>>;
  diamondCardKeyLookup?: Promise<string | null>;
  diamondPayStarts?: Map<string, Promise<unknown>>;
};
const cache = globalThis as BillingGlobal;

const productIdOf = (product: StripeProductRef) => (typeof product === "string" ? product : product.id);
const productUsable = (product: StripeProductRef) => typeof product === "string" || (product.active !== false && !product.deleted);

const priceMatches = (price: StripePrice, entry: CatalogEntry) =>
  price.active && price.currency === "usd" && price.unit_amount === entry.unitAmount && productUsable(price.product) &&
  (entry.kind === "plan" ? price.recurring?.interval === entry.interval : !price.recurring);

async function loadCatalog(): Promise<StripeCatalog> {
  // Stripe looks up at most 10 lookup keys per request.
  const keys = STRIPE_CATALOG.map((entry) => entry.lookupKey);
  const prices: StripePrice[] = [];
  for (let index = 0; index < keys.length; index += 10) {
    const list = await stripeRequest<{ data: StripePrice[] }>("GET", "/prices", {
      lookup_keys: keys.slice(index, index + 10), active: true, limit: 100, expand: ["data.product"],
    });
    prices.push(...list.data);
  }
  const found = new Map(prices.filter((price) => price.lookup_key).map((price) => [price.lookup_key as string, price]));
  // All prices of one plan share one product: reuse whichever product already exists.
  const products = new Map<string, string>();
  for (const entry of STRIPE_CATALOG) {
    const price = found.get(entry.lookupKey);
    if (price && productUsable(price.product) && !products.has(entry.productKey)) products.set(entry.productKey, productIdOf(price.product));
  }
  for (const entry of STRIPE_CATALOG) {
    const id = products.get(entry.productKey);
    if (id && (entry.kind === "topup" || entry.interval === PLAN_CYCLE)) await stripeRequest("POST", `/products/${id}`, { name: entry.productName });
  }
  const catalog: StripeCatalog = {};
  for (const entry of STRIPE_CATALOG) {
    const existing = found.get(entry.lookupKey);
    if (existing && priceMatches(existing, entry)) {
      catalog[entry.lookupKey] = { priceId: existing.id, productId: productIdOf(existing.product) };
      continue;
    }
    let productId = products.get(entry.productKey);
    if (!productId) {
      const product = await stripeRequest<{ id: string }>("POST", "/products", {
        name: entry.productName, metadata: { diamond_key: entry.productKey },
      }, idempotencyKey("product", entry.productKey));
      productId = product.id;
      products.set(entry.productKey, productId);
    }
    // transfer_lookup_key moves the key from an old (changed or archived) price to this new one; the price's own
    // metadata keeps its diamond_key, so people still on the old price stay recognised (subscriptionPlan).
    const price = await stripeRequest<StripePrice>("POST", "/prices", {
      product: productId, currency: "usd", unit_amount: entry.unitAmount, lookup_key: entry.lookupKey, transfer_lookup_key: true,
      nickname: entry.productName + (entry.kind === "plan" ? ` (${entry.interval === "year" ? "yearly" : PLAN_CYCLE === "week" ? "weekly" : "monthly"})` : ""),
      recurring: entry.kind === "plan" ? { interval: entry.interval } : undefined,
      metadata: { diamond_key: entry.lookupKey },
    }, idempotencyKey("price", entry.lookupKey, entry.unitAmount, productId));
    catalog[entry.lookupKey] = { priceId: price.id, productId };
  }
  return catalog;
}

/** Finds or creates the plan prices and the 3 packs once per server start (again when a price changes). */
export function ensureStripeCatalog(): Promise<StripeCatalog> {
  const key = STRIPE_CATALOG.map((entry) => `${entry.lookupKey}:${entry.unitAmount}`).join(",");
  if (cache.diamondStripeCatalogKey !== key) { cache.diamondStripeCatalog = undefined; cache.diamondStripePortalConfig = undefined; cache.diamondStripeCatalogKey = key; }
  if (!cache.diamondStripeCatalog) {
    cache.diamondStripeCatalog = loadCatalog().catch((error) => { cache.diamondStripeCatalog = undefined; throw error; });
  }
  return cache.diamondStripeCatalog;
}

async function configurePortal(): Promise<string> {
  const catalog = await ensureStripeCatalog();
  const byProduct = new Map<string, string[]>();
  for (const plan of PAID_PLAN_IDS) {
    for (const interval of [PLAN_CYCLE, "year"] as const) {
      const item = catalog[planLookupKey(plan, interval)];
      if (!item) continue;
      byProduct.set(item.productId, [...(byProduct.get(item.productId) ?? []), item.priceId]);
    }
  }
  const features: Record<string, FormValue> = {
    subscription_update: {
      enabled: true, default_allowed_updates: ["price"],
      // An upgrade is charged right away (so its bigger credits are paid for before they arrive); a downgrade or a
      // shorter interval waits for the end of the paid cycle (the person keeps what they paid for).
      proration_behavior: "always_invoice",
      schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }] },
      products: [...byProduct].map(([product, prices]) => ({ product, prices })),
    },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
  };
  const list = await stripeRequest<{ data: { id: string }[] }>("GET", "/billing_portal/configurations", { is_default: true, active: true, limit: 1 });
  const current = list.data[0];
  if (current) {
    await stripeRequest("POST", `/billing_portal/configurations/${encodeURIComponent(current.id)}`, { features });
    return current.id;
  }
  const created = await stripeRequest<{ id: string }>("POST", "/billing_portal/configurations", {
    features, business_profile: { headline: "Diamond Animator: manage your plan" },
  }, idempotencyKey("portal", JSON.stringify(features)));
  return created.id;
}

/** Sets up the "Manage plan" page (cancel at period end, switch plans, card, invoices) once per server start. */
export function ensurePortalConfiguration(): Promise<string> {
  if (!cache.diamondStripePortalConfig) {
    cache.diamondStripePortalConfig = configurePortal().catch((error) => { cache.diamondStripePortalConfig = undefined; throw error; });
  }
  return cache.diamondStripePortalConfig;
}

// ---------- Customers: exactly one per account ----------

export type BillingUser = { email: string; name?: string | null };

async function findCustomerByOwner(ownerId: string): Promise<string | null> {
  const query = `metadata['owner_id']:'${ownerId.replace(/['\\]/g, "")}'`;
  const found = await stripeRequest<{ data: { id: string; deleted?: boolean }[] }>("GET", "/customers/search", { query, limit: 3 });
  return found.data.find((customer) => !customer.deleted)?.id ?? null;
}

/** This account's Stripe customer. The saved one is used; if none is saved, Stripe is searched first, and a new one is
 *  made with an idempotency key from the account, so a retry or two tabs can never make a second customer. */
export function getOrCreateCustomer(ownerId: string, email: string, name?: string | null): Promise<string> {
  const pending = (cache.diamondStripeCustomers ??= new Map());
  const running = pending.get(ownerId);
  if (running) return running;
  const work = (async () => {
    const { customerId } = readAccountBillingIds(ownerId);
    if (customerId) {
      try {
        const customer = await stripeRequest<{ id: string; deleted?: boolean }>("GET", `/customers/${encodeURIComponent(customerId)}`);
        if (!customer.deleted) return customer.id;
      } catch (error) {
        if (!(error instanceof StripeApiError && error.stripeCode === "resource_missing")) throw error;
      }
    }
    const existing = await findCustomerByOwner(ownerId);
    if (existing) { setStripeCustomerId(ownerId, existing); return existing; }
    const created = await stripeRequest<{ id: string }>("POST", "/customers", {
      email, name: name || undefined, metadata: { owner_id: ownerId },
    }, idempotencyKey("customer", ownerId, customerId ?? "first"));
    setStripeCustomerId(ownerId, created.id);
    return created.id;
  })().finally(() => pending.delete(ownerId));
  pending.set(ownerId, work);
  return work;
}

// ---------- The sync: Stripe is the truth ----------

type StripeInvoice = {
  id: string; status: string | null; amount_paid: number; created: number; charge: string | { id: string } | null;
  payment_intent: string | { id: string } | null; subscription: string | { id: string } | null; billing_reason?: string | null;
  lines?: { data?: { period?: { start?: number; end?: number } | null }[] } | null;
};
type StripeSubscription = {
  id: string; status: string; created: number; customer: string | { id: string } | null; cancel_at_period_end?: boolean; cancel_at?: number | null;
  current_period_start?: number | null; current_period_end?: number | null; metadata?: Record<string, string> | null;
  latest_invoice?: string | StripeInvoice | null; schedule?: string | { id: string } | null;
  discount?: { coupon?: { percent_off?: number | null } | null; end?: number | null } | null;
  items?: { data?: { id?: string; current_period_start?: number | null; current_period_end?: number | null; price?: { lookup_key?: string | null; metadata?: Record<string, string> | null; recurring?: { interval?: string | null } | null; unit_amount?: number | null } | null }[] } | null;
};
type StripeCheckoutSession = {
  id: string; mode: string; status: string | null; payment_status: string; client_reference_id: string | null; url?: string | null;
  metadata: Record<string, string> | null; subscription: string | StripeSubscription | null; amount_total?: number | null;
  payment_intent?: string | { id: string } | null; created?: number; customer?: string | { id: string } | null;
  setup_intent?: string | { id: string; payment_method?: string | { id: string } | null; status?: string } | null;
};
type StripePaymentIntent = {
  id: string; status: string; amount: number; amount_received?: number; client_secret?: string | null; created?: number;
  customer?: string | { id: string } | null; latest_charge?: string | { id: string } | null; metadata?: Record<string, string> | null;
};
type StripeSetupIntent = {
  id: string; status: string; client_secret?: string | null; customer?: string | { id: string } | null;
  payment_method?: string | { id: string } | null; metadata?: Record<string, string> | null;
};
type StripeCard = { id: string; card?: { brand?: string | null; last4?: string | null; exp_month?: number | null; exp_year?: number | null } | null };
type StripeCharge = {
  id: string; amount: number; amount_refunded: number; payment_intent: string | { id: string } | null; disputed?: boolean;
  dispute?: string | { id: string; status: string } | null; balance_transaction?: string | { fee?: number } | null;
};

export type SyncReport = { changed: string[] };

const LIVE_ORDER = (a: StripeSubscription, b: StripeSubscription) => {
  // Keep the oldest PAYING subscription; only if none is paying, the oldest one.
  const paying = (s: StripeSubscription) => (s.status === "active" || s.status === "trialing" ? 0 : 1);
  return paying(a) - paying(b) || a.created - b.created;
};

/** Reads everything about this account from Stripe and applies it, each Stripe object once. Never throws (a Stripe problem
 *  keeps the last saved state); `force` skips the once-a-minute wait. */
export async function syncWithStripe(ownerId: string, options: { force?: boolean; fresh?: boolean; alert?: boolean } = {}): Promise<SyncReport> {
  const empty: SyncReport = { changed: [] };
  if (billingMode() === "off") return empty;
  const ids = readAccountBillingIds(ownerId);
  // `fresh` = the person just came back from Stripe's page: check now, but never more than once every 10 seconds per account
  const gap = options.force ? 0 : options.fresh ? 10_000 : SYNC_EVERY_MS;
  if (gap > 0 && ids.syncedAt && Date.now() - ids.syncedAt < gap) return empty;
  const pending = (cache.diamondStripeSyncs ??= new Map());
  const running = pending.get(ownerId);
  if (running) return running;
  const work = (async (): Promise<SyncReport> => {
    const report: SyncReport = { changed: [] };
    try {
      await syncNow(ownerId, report, Boolean(options.force), Boolean(options.fresh));
    } catch (error) {
      console.warn("[billing] check with Stripe failed; keeping the last saved plan:", error instanceof BillingError ? error.message : "unknown");
    }
    try { markBillingSynced(ownerId); } catch { /* keep the last state */ }
    if (options.alert && report.changed.length) {
      ownerAlert(`match:${ownerId}:${report.changed.join("|")}`, `The daily payments check fixed account ${ownerId}: ${report.changed.join("; ")}.`);
    }
    return report;
  })().finally(() => pending.delete(ownerId));
  pending.set(ownerId, work);
  return work;
}

async function syncNow(ownerId: string, report: SyncReport, force: boolean, cameBack = false) {
  let customerId = readAccountBillingIds(ownerId).customerId;
  if (!customerId && force) {
    customerId = await findCustomerByOwner(ownerId);
    if (customerId) { setStripeCustomerId(ownerId, customerId); report.changed.push("found its Stripe customer"); }
  }
  if (!customerId) return;

  // 1. Subscriptions: exactly one may be live.
  const subs = await stripeRequest<{ data: StripeSubscription[] }>("GET", "/subscriptions", {
    customer: customerId, status: "all", limit: 20, expand: ["data.latest_invoice"],
  });
  const ours = (subs.data ?? []).filter((sub) => subscriptionPlan(sub));
  const live = ours.filter((sub) => isChargingSubscriptionStatus(sub.status)).sort(LIVE_ORDER);
  const keep = live[0] ?? null;
  for (const extra of live.slice(1)) await stopDuplicate(ownerId, extra, report);
  // No live plan: only a plan that was really paid can "end" (a first payment that never finished leaves the trial as it is).
  const saved = readAccountBillingIds(ownerId).subscriptionId;
  const ended = keep ? null : ours.find((sub) => sub.id === saved && listPayments(ownerId).some((payment) => payment.subscriptionId === sub.id)) ?? null;
  const current = keep ?? ended;
  if (keep && (await payRenewalNow(ownerId, keep) !== "skipped" || (cameBack && await retryUnpaidBill(keep)))) {
    // the renewal was just tried: read the subscription again (paid = this cycle counts at once; declined = it shows the problem at once)
    const fresh = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(keep.id)}`, { expand: ["latest_invoice"] });
    Object.assign(keep, fresh);
  }
  if (current) {
    if (applyKeep(ownerId, current)) report.changed.push(`plan is now ${current.status} (${subscriptionPlan(current)?.plan})`);
    await recordPlanPayments(ownerId, current, report);
    if (keep) await giveBothCodesBonus(ownerId, keep, report);
  }

  // 2. Finished checkout pages: packs (each once), and any open plan page left over once a plan exists.
  const done = await stripeRequest<{ data: StripeCheckoutSession[] }>("GET", "/checkout/sessions", { customer: customerId, status: "complete", limit: 20 });
  for (const session of done.data ?? []) {
    if (session.client_reference_id !== ownerId || session.mode !== "payment" || session.metadata?.kind !== "topup") continue;
    if (session.payment_status !== "paid") continue;
    const credits = packCreditsOf(session);
    if (credits <= 0) continue;
    recordPayment({
      stripeId: session.id, ownerId, kind: "pack", amountCents: session.amount_total ?? 0, credits, plan: null, periodFrom: null, periodUntil: null,
      paidAt: (session.created ?? Math.floor(Date.now() / 1000)) * 1000, chargeId: null, paymentIntentId: idOf(session.payment_intent ?? null), subscriptionId: null,
    });
    if (addTopUpCredits(ownerId, credits, session.id)) report.changed.push(`added a ${creditsText(credits)} pack`);
  }
  // (Nov 21) packs paid inside the app (the card form): each succeeded payment once, even if the tab closed before it said "done"
  const intents = await stripeRequest<{ data: StripePaymentIntent[] }>("GET", "/payment_intents", { customer: customerId, limit: 20 });
  for (const intent of intents.data ?? []) {
    if (intent.status === "succeeded" && intent.metadata?.kind === "topup" && intent.metadata?.owner_id === ownerId) {
      if (applyPackIntent(ownerId, intent)) report.changed.push(`added a ${creditsText(packCreditsOfIntent(intent))} pack`);
    }
  }
  if (keep) await closeOpenPlanPages(customerId, null);

  // 3. Refunds and disputes, read from the charges themselves.
  const charges = await stripeRequest<{ data: StripeCharge[] }>("GET", "/charges", { customer: customerId, limit: 40, expand: ["data.dispute"] });
  let disputed = false;
  for (const charge of charges.data ?? []) {
    const payment = findPaymentByCharge(charge.id, idOf(charge.payment_intent));
    if (payment && charge.amount_refunded > payment.refundedCents) {
      const taken = applyRefundTotal(payment.stripeId, charge.amount_refunded);
      if (taken > 0) report.changed.push(`a refund took back ${creditsText(taken)}`);
    }
    const dispute = typeof charge.dispute === "object" && charge.dispute ? charge.dispute : null;
    if (dispute && dispute.status !== "won" && dispute.status !== "warning_closed") {
      disputed = true;
      if (claimBillingEvent(ownerId, `dispute:${dispute.id}`, "dispute")) {
        ownerAlert(`dispute:${dispute.id}`, `A payment on account ${ownerId} is disputed with the bank (${dollarsText(charge.amount)}). The AI is paused for this account. Answer it in the Stripe dashboard.`);
      }
    }
  }
  if (setDisputed(ownerId, disputed)) report.changed.push(disputed ? "a dispute paused the AI" : "a dispute ended; the AI runs again");
}

/** Saves what Stripe says about the subscription that counts. Its latest bill decides whether this cycle is paid. */
function applyKeep(ownerId: string, sub: StripeSubscription): boolean {
  const planAndInterval = subscriptionPlan(sub)!;
  const status = mapSubscriptionStatus(sub.status);
  const record = readAccountPlanRecord(ownerId);
  const periodStartedAt = subscriptionPeriodStartMs(sub, record.periodStartedAt);
  const periodEndsAt = subscriptionPeriodEndMs(sub);
  const invoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null;
  // Paid = the newest bill is paid AND it belongs to this period (a renewal's bill is made at the period's start; an
  // upgrade's bill in the middle). A bill from the last period never pays for this one.
  const paidNow = status !== "canceled" && invoice?.status === "paid" && invoice.created * 1000 >= periodStartedAt - 12 * 60 * 60 * 1000;
  return applySubscriptionState(ownerId, {
    plan: planAndInterval.plan, interval: planAndInterval.interval, status, periodStartedAt, periodEndsAt,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at), subscriptionId: sub.id, customerId: idOf(sub.customer),
    paid: paidNow ? { plan: planAndInterval.plan, from: periodStartedAt, until: periodEndsAt ?? addCycles(periodStartedAt, 1) } : null,
  });
}

/** A renewal's bill waits about an hour at Stripe before the card is charged; until then the new cycle's credits would be 0.
 *  So the first time the app sees a renewal bill that was never tried, it asks Stripe to charge it now (once; an invoice can only
 *  ever be paid once). A declined card simply leaves it to Stripe's own retries, and the credits wait. */
async function payRenewalNow(ownerId: string, sub: StripeSubscription): Promise<"paid" | "declined" | "skipped"> {
  const invoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null;
  if (!invoice || invoice.billing_reason !== "subscription_cycle" || (invoice.status !== "draft" && invoice.status !== "open")) return "skipped";
  if ((invoice as { attempt_count?: number }).attempt_count) return "skipped";
  if (!claimBillingEvent(ownerId, `pay-now:${invoice.id}`, "renewal")) return "skipped";
  try {
    if (invoice.status === "draft") await stripeRequest("POST", `/invoices/${encodeURIComponent(invoice.id)}/finalize`, {}, idempotencyKey("finalize", invoice.id));
    const paid = await stripeRequest<StripeInvoice>("POST", `/invoices/${encodeURIComponent(invoice.id)}/pay`, {}, idempotencyKey("pay", invoice.id));
    return paid.status === "paid" ? "paid" : "declined";
  } catch {
    return "declined";   // declined or not ready: Stripe's own retries go on; the credits wait for the payment
  }
}

/** The person just came back from Stripe's page (maybe after putting in a new card) while a bill is unpaid: try that bill again now,
 *  so the credits come back at once instead of days later at Stripe's next retry. At most once a minute per bill; an invoice can only
 *  ever be paid once, so this can never charge twice. Returns true when it tried. */
async function retryUnpaidBill(sub: StripeSubscription): Promise<boolean> {
  const invoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null;
  if (!invoice || invoice.status !== "open" || (sub.status !== "past_due" && sub.status !== "unpaid")) return false;
  try {
    await stripeRequest("POST", `/invoices/${encodeURIComponent(invoice.id)}/pay`, {}, idempotencyKey("retry", invoice.id, Math.floor(Date.now() / 60_000)));
  } catch { /* still declined: the plan screen keeps saying so */ }
  return true;
}

/** Every paid bill of the subscription that counts, recorded once (the "last payment" line, refunds, deleting). */
async function recordPlanPayments(ownerId: string, sub: StripeSubscription, report: SyncReport) {
  const plan = subscriptionPlan(sub)!.plan;
  const invoices = await stripeRequest<{ data: StripeInvoice[] }>("GET", "/invoices", { subscription: sub.id, status: "paid", limit: 12 });
  for (const invoice of invoices.data ?? []) {
    if (invoice.amount_paid <= 0) continue;
    const period = invoice.lines?.data?.[0]?.period;
    const added = recordPayment({
      stripeId: invoice.id, ownerId, kind: "plan", amountCents: invoice.amount_paid, credits: ACCOUNT_PLANS[plan].credits, plan,
      periodFrom: period?.start ? period.start * 1000 : null, periodUntil: period?.end ? period.end * 1000 : null,
      paidAt: invoice.created * 1000, chargeId: idOf(invoice.charge), paymentIntentId: idOf(invoice.payment_intent), subscriptionId: sub.id,
    });
    if (added) report.changed.push(`recorded a ${dollarsText(invoice.amount_paid)} payment`);
  }
}

/** A second live subscription (two checkout pages paid): stopped at once and every one of its payments refunded in full. */
async function stopDuplicate(ownerId: string, sub: StripeSubscription, report: SyncReport) {
  const event = `duplicate:${sub.id}`;
  if (!claimBillingEvent(ownerId, event, "duplicate")) return;
  try {
    await stopSubscription(sub.id, "cancel-duplicate");
    const invoices = await stripeRequest<{ data: StripeInvoice[] }>("GET", "/invoices", { subscription: sub.id, status: "paid", limit: 12 });
    let refunded = 0;
    for (const invoice of invoices.data ?? []) {
      const intent = idOf(invoice.payment_intent);
      if (!intent || invoice.amount_paid <= 0) continue;
      await stripeRequest("POST", "/refunds", {
        payment_intent: intent, reason: "duplicate", metadata: { owner_id: ownerId, why: "second_plan_by_mistake" },
      }, idempotencyKey("refund-duplicate", invoice.id));
      refunded += invoice.amount_paid;
    }
    setBillingNotice(ownerId, `You started a second plan by mistake, so we stopped it at once and refunded that payment in full (${dollarsText(refunded)}). Your plan stays as it was.`);
    ownerAlert(event, `Account ${ownerId} paid for a second plan (two checkout pages). It was stopped and ${dollarsText(refunded)} refunded in full.`);
    report.changed.push(`stopped a second plan and refunded ${dollarsText(refunded)}`);
  } catch (error) {
    releaseBillingEvent(event);   // try again on the next check
    throw error;
  }
}

/** Both codes = 30% off the first cycle: the first-50 code took 25% at checkout; 5% of the list price comes back once. */
async function giveBothCodesBonus(ownerId: string, sub: StripeSubscription, report: SyncReport) {
  if (sub.metadata?.offer !== "both") return;
  const first = listPayments(ownerId).filter((payment) => payment.kind === "plan" && payment.subscriptionId === sub.id).at(-1);
  if (!first?.paymentIntentId) return;
  const event = `both-bonus:${sub.id}`;
  if (!claimBillingEvent(ownerId, event, "offer")) return;
  const { plan, interval } = subscriptionPlan(sub)!;
  const cents = Math.min(first.amountCents, Math.round((planUnitAmount(plan, interval) * BOTH_EXTRA_PERCENT) / 100));
  addFreeRefund(first.stripeId, cents);
  try {
    await stripeRequest("POST", "/refunds", {
      payment_intent: first.paymentIntentId, amount: cents, metadata: { owner_id: ownerId, why: "youtube_code_with_first50" },
    }, idempotencyKey("refund-both-bonus", sub.id));
    setBillingNotice(ownerId, `Your YouTube bonus: we gave back ${dollarsText(cents)} of your first payment, so your first ${PLAN_CYCLE} is 30% off.`);
    report.changed.push(`gave the both-codes bonus (${dollarsText(cents)})`);
  } catch (error) {
    addFreeRefund(first.stripeId, -cents);
    releaseBillingEvent(event);
    throw error;
  }
}

/** Stops a subscription at once (no new bill), and voids any bill of it still waiting, so Stripe never retries it later. */
async function stopSubscription(subscriptionId: string, why: string) {
  await stripeRequest("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { prorate: false, invoice_now: false }, idempotencyKey(why, subscriptionId));
  const open = await stripeRequest<{ data: StripeInvoice[] }>("GET", "/invoices", { subscription: subscriptionId, status: "open", limit: 10 });
  for (const invoice of open.data ?? []) {
    await stripeRequest("POST", `/invoices/${encodeURIComponent(invoice.id)}/void`, {}, idempotencyKey("void", invoice.id));
  }
}

/** Closes open plan checkout pages (all, or all but `except`), so an old page can never be paid after a plan exists. */
async function closeOpenPlanPages(customerId: string, except: string | null) {
  const open = await stripeRequest<{ data: StripeCheckoutSession[] }>("GET", "/checkout/sessions", { customer: customerId, status: "open", limit: 20 });
  for (const session of open.data ?? []) {
    if (session.mode !== "subscription" || session.id === except) continue;
    try {
      await stripeRequest("POST", `/checkout/sessions/${encodeURIComponent(session.id)}/expire`, {}, idempotencyKey("expire", session.id));
    } catch { /* already finished or expired */ }
  }
}

const packCreditsOf = (session: StripeCheckoutSession) => {
  const pack = TOP_UP_PACKS.find((entry) => entry.id === session.metadata?.pack);
  const fromMetadata = Number(session.metadata?.credits);   // set by this server when the page was made
  return pack?.credits ?? (Number.isFinite(fromMetadata) && fromMetadata > 0 ? Math.round(fromMetadata) : 0);
};

/** True when this account already has a plan that can charge it (so a second one must never be made). */
function hasLiveSubscription(ownerId: string) {
  const ids = readAccountBillingIds(ownerId);
  const record = readAccountPlanRecord(ownerId);
  return Boolean(ids.subscriptionId) && record.plan !== "trial" && !record.planEnded && (record.billingStatus === "active" || record.billingStatus === "past_due");
}

// ---------- The daily match check ----------

/** Starts (once per server) the daily check of every paying account. Any difference it fixes is told to the owner. */
export function startBillingSweeper() {
  if (cache.diamondStripeSweeper || billingMode() === "off") return;
  cache.diamondStripeSweeper = true;
  const sweep = async () => {
    for (const ownerId of listBillingOwners()) {
      await syncWithStripe(ownerId, { force: true, alert: true });
      await new Promise((done) => setTimeout(done, 1500));
    }
  };
  setTimeout(() => { void sweep(); setInterval(() => void sweep(), 24 * 60 * 60 * 1000).unref?.(); }, 5 * 60 * 1000).unref?.();
}

// ---------- Discount codes ----------

const OFFER_COUPONS: Record<"first50" | "youtube", { id: string; percent_off: number; duration: "once" | "repeating"; months?: number; name: string; max?: number }> = {
  first50: { id: "diamond-first50-25", percent_off: FIRST50_PERCENT, duration: "repeating", months: FIRST50_MONTHS, name: "First 50: 25% off the first year", max: 50 },
  youtube: { id: "diamond-youtube-10", percent_off: YOUTUBE_PERCENT, duration: "once", name: "YouTube: 10% off the first payment" },
};
/** The real codes people type (settings; in test mode they default to test codes). */
const offerCodes = () => ({
  first50: process.env.DIAMOND_FIRST50_CODE?.trim() || (billingMode() === "test" ? "FIRST50TEST" : null),
  youtube: process.env.DIAMOND_YOUTUBE_CODE?.trim() || (billingMode() === "test" ? "YOUTUBETEST" : null),
});

/** Dad, Nov 26: the beta (first-50) price can be claimed only while this account's free trial is still running. */
const trialRunning = (ownerId: string) => { const status = getAccountPlanStatus(ownerId); return status.plan === "trial" && !status.locked; };

/** SPEC-0031 (display only): which box a typed or linked code belongs in, so the screens can show the beta price before paying.
 *  The same check as paying (pickOffer + the real codes); nothing is asked of the payment service and nothing is charged. */
export function whichOfferCode(ownerId: string, code: unknown): "first50" | "youtube" | null {
  const typed = normalizeCode(code);
  if (!typed) return null;
  const codes = offerCodes();
  if (codes.first50 && typed === normalizeCode(codes.first50)) return trialRunning(ownerId) ? "first50" : null;
  if (codes.youtube && typed === normalizeCode(codes.youtube)) return "youtube";
  return null;
}

/** The Stripe promotion code for an offer (made once, with its limits: the first-50 code works 50 times, both once per person). */
async function promotionCodeFor(offer: "first50" | "youtube"): Promise<string> {
  const coupon = OFFER_COUPONS[offer];
  const code = offerCodes()[offer];
  if (!code) throw new BillingError("That code isn't available right now.", 409);
  try {
    await stripeRequest("GET", `/coupons/${coupon.id}`);
  } catch (error) {
    if (!(error instanceof StripeApiError && error.stripeCode === "resource_missing")) throw error;
    await stripeRequest("POST", "/coupons", {
      id: coupon.id, percent_off: coupon.percent_off, duration: coupon.duration, duration_in_months: coupon.months, name: coupon.name,
    }, idempotencyKey("coupon", coupon.id));
  }
  const found = await stripeRequest<{ data: { id: string; active: boolean; max_redemptions: number | null; times_redeemed: number; coupon: { id: string } }[] }>(
    "GET", "/promotion_codes", { code, limit: 5 });
  let promo = found.data.find((entry) => entry.coupon.id === coupon.id) ?? null;
  if (!promo) {
    promo = await stripeRequest("POST", "/promotion_codes", {
      coupon: coupon.id, code, max_redemptions: coupon.max, restrictions: { first_time_transaction: true },
    }, idempotencyKey("promotion-code", coupon.id, code));
  }
  if (!promo!.active || (promo!.max_redemptions != null && promo!.times_redeemed >= promo!.max_redemptions)) {
    throw new BillingError(offer === "first50" ? "All 50 first-50 discounts have been used." : "That YouTube code isn't active anymore.", 409);
  }
  return promo!.id;
}

// ---------- Checkout, completion, portal ----------

/** Stripe's "Manage plan" page for this account. */
export async function createPortalSession(ownerId: string, origin: string, returnPath = "/credits"): Promise<{ url: string }> {
  stripeKey();
  const { customerId } = readAccountBillingIds(ownerId);
  if (!customerId) throw new BillingError("There's no plan to manage yet. Choose a plan first.", 409);
  let configuration: string | undefined;
  try { configuration = await ensurePortalConfiguration(); } catch { configuration = undefined; /* fall back to Stripe's default page */ }
  const session = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
    customer: customerId, return_url: `${origin}${returnPath}?portal=back`, configuration,
  });
  startBillingSweeper();
  return { url: session.url };
}

/** Starts paying for a plan on Stripe's page. If a plan is already paid for, opens Manage plan instead (switching happens there).
 *  Only ONE open plan page per account: asking again gives back the same page; a different choice closes the old page. */
export async function createPlanCheckout(ownerId: string, user: BillingUser, plan: unknown, interval: unknown, origin: string,
  codes: { first50?: unknown; youtube?: unknown } = {}): Promise<{ url: string; portal: boolean }> {
  stripeKey();
  if (!isPaidPlanId(plan)) throw new BillingError("Choose Basic, Pro or Creator.");
  if (!isBillingInterval(interval)) throw new BillingError(`Choose ${PLAN_CYCLE === "week" ? "weekly" : "monthly"} or yearly.`);
  const offer = pickOffer(codes, offerCodes(), interval, { trialRunning: trialRunning(ownerId) });
  if (!offer.ok) throw new BillingError(offer.message, 400);
  await syncWithStripe(ownerId, { force: true });
  // Nov 21 (Arthur): someone who already pays switches inside Diamond Animator (switchPlanNow), never on a second page.
  if (hasLiveSubscription(ownerId)) throw new BillingError("You already have a plan. Use Switch on the Plans page to change it right away.", 409);
  const catalog = await ensureStripeCatalog();
  const price = catalog[planLookupKey(plan, interval)];
  if (!price) throw new BillingError("That plan isn't ready yet. Try again in a moment.", 503);
  const customer = await getOrCreateCustomer(ownerId, user.email, user.name);
  const offerName: Offer | "none" = offer.offer ?? "none";
  const open = await stripeRequest<{ data: StripeCheckoutSession[] }>("GET", "/checkout/sessions", { customer, status: "open", limit: 20 });
  const same = (open.data ?? []).find((session) => session.mode === "subscription" && session.url && session.metadata?.plan === plan &&
    session.metadata?.interval === interval && (session.metadata?.offer ?? "none") === offerName);
  await closeOpenPlanPages(customer, same?.id ?? null);
  startBillingSweeper();
  if (same?.url) return { url: same.url, portal: false };
  const discounts = offer.apply ? [{ promotion_code: await promotionCodeFor(offer.apply) }] : undefined;
  const session = await stripeRequest<{ url: string | null }>("POST", "/checkout/sessions", {
    mode: "subscription",
    // (Nov 20, live test) cards only (Apple Pay and Google Pay are cards too): a card is paid at once, so credits never wait days for a
    // bank transfer to clear, and nothing is ever given before the money is really there.
    payment_method_types: ["card"],
    adaptive_pricing: { enabled: false }, // USD only (Arthur 2026-10-13)
    customer,
    client_reference_id: ownerId,
    line_items: [{ price: price.priceId, quantity: 1 }],
    metadata: { owner_id: ownerId, kind: "plan", plan, interval, offer: offerName },
    subscription_data: { metadata: { owner_id: ownerId, plan, interval, offer: offerName } },
    success_url: `${origin}/plans?checkout=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/plans?checkout=canceled`,
    discounts,
  });
  if (!session.url) throw new BillingError(SERVICE_PROBLEM, 502);
  return { url: session.url, portal: false };
}

/** Buys an extra credit pack on Stripe's page (members with a paid plan only). */
export async function createTopUpCheckout(ownerId: string, user: BillingUser, packId: unknown, origin: string): Promise<{ url: string }> {
  stripeKey();
  if (!isTopUpPackId(packId)) throw new BillingError("Choose a credit pack.");
  await syncWithStripe(ownerId, { force: true });
  const status = getAccountPlanStatus(ownerId);
  if (status.plan === "trial" || status.locked || status.billingStatus === "canceled") {
    throw new BillingError("Extra packs are for plan members. Choose a plan first.", 403);
  }
  if (status.billingStatus === "past_due") {
    throw new BillingError("Your last payment didn't go through. Update your card in Manage plan first.", 409);
  }
  const pack = TOP_UP_PACKS.find((entry) => entry.id === packId)!;
  // (Nov 21) each plan has its own packs; a pack from another plan is refused
  if (!(pack.plans as readonly string[]).includes(status.plan)) throw new BillingError("That pack isn't on your plan. Pick one of the packs shown.", 403);
  const catalog = await ensureStripeCatalog();
  const price = catalog[packId];
  if (!price) throw new BillingError("That pack isn't ready yet. Try again in a moment.", 503);
  const customer = await getOrCreateCustomer(ownerId, user.email, user.name);
  const session = await stripeRequest<{ url: string | null }>("POST", "/checkout/sessions", {
    mode: "payment",
    payment_method_types: ["card"],
    adaptive_pricing: { enabled: false },
    customer,
    client_reference_id: ownerId,
    line_items: [{ price: price.priceId, quantity: 1 }],
    metadata: { owner_id: ownerId, kind: "topup", pack: pack.id, credits: pack.credits },
    payment_intent_data: { metadata: { owner_id: ownerId, kind: "topup", pack: pack.id } },
    success_url: `${origin}/credits?topup=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/credits?topup=canceled`,
  });
  if (!session.url) throw new BillingError(SERVICE_PROBLEM, 502);
  startBillingSweeper();
  return { url: session.url };
}

export type CheckoutResult =
  | { kind: "plan"; plan: PaidPlanId; label: string; credits: number; interval: BillingInterval; billingStatus: string; waitingForPayment: boolean; arriving?: boolean }
  | { kind: "topup"; pack: string; credits: number; added: boolean; arriving?: boolean };
// (Nov 22, Fable's money check before dad's one real payment) arriving = the money really moved, the credits are a moment behind:
// the person is told "your payment went through", never "nothing was charged, try again" (which could make them pay twice)

/** After Stripe's page sends the person back: checks that page belongs to this account, then runs the sync (which applies
 *  it exactly once) and says what arrived. Safe to call any number of times. */
export async function completeCheckout(ownerId: string, sessionId: unknown): Promise<CheckoutResult> {
  stripeKey();
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) throw new BillingError("That payment couldn't be found.", 404);
  const session = await stripeRequest<StripeCheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (session.client_reference_id !== ownerId || (session.metadata?.owner_id && session.metadata.owner_id !== ownerId)) {
    throw new BillingError("That payment belongs to a different account.", 403);
  }
  if (session.status === "expired") throw new BillingError("That payment page expired. No payment was made.", 409);
  if (session.status !== "complete") throw new BillingError("That payment isn't finished yet.", 409);
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    throw new BillingError("Your payment is still being processed. Check again in a few minutes.", 409);
  }
  await syncWithStripe(ownerId, { force: true });
  if (session.metadata?.kind === "plan" && session.mode === "subscription") {
    const status = getAccountPlanStatus(ownerId);
    const plan = isPaidPlanId(status.plan) ? status.plan : isPaidPlanId(session.metadata.plan) ? session.metadata.plan : null;
    if (!plan) throw new BillingError("Your plan is being set up. Refresh in a moment.", 502);
    return {
      kind: "plan", plan, label: ACCOUNT_PLANS[plan].label, credits: status.creditsTotal || ACCOUNT_PLANS[plan].credits,
      interval: status.interval ?? PLAN_CYCLE, billingStatus: status.billingStatus, waitingForPayment: status.waitingForPayment,
    };
  }
  if (session.metadata?.kind === "topup" && session.mode === "payment") {
    const credits = packCreditsOf(session);
    if (credits <= 0) throw new BillingError("That credit pack couldn't be read.", 502);
    return { kind: "topup", pack: session.metadata.pack ?? "", credits, added: listPayments(ownerId).some((payment) => payment.stripeId === session.id) };
  }
  throw new BillingError("That payment couldn't be read.", 400);
}

// ---------- The webhook doorbell ----------

/** Stripe rang: if the signature is right, check that account with Stripe now. The event itself is never trusted for what it
 *  says; the sync reads the fresh facts, so a late, repeated or out-of-order event can't put in a wrong state. */
export function handleStripeWebhook(payload: string, signature: string | null): { status: number; body: Record<string, unknown> } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || billingMode() === "off") return { status: 503, body: { error: "not_ready" } };
  if (!verifyStripeSignature(payload, signature, secret)) return { status: 400, body: { error: "bad_signature" } };
  let event: { livemode?: boolean; data?: { object?: { object?: string; id?: string; customer?: string | { id: string } | null; metadata?: Record<string, string> | null } } };
  try { event = JSON.parse(payload); } catch { return { status: 400, body: { error: "bad_payload" } }; }
  if (Boolean(event.livemode) !== (billingMode() === "live")) return { status: 200, body: { received: true, ignored: "other_mode" } };
  const object = event.data?.object;
  const customer = object?.object === "customer" ? object.id ?? null : idOf(object?.customer ?? null);
  const ownerId = customer ? findOwnerByStripeCustomer(customer) : null;
  if (ownerId) void syncWithStripe(ownerId, { force: true });
  startBillingSweeper();
  return { status: 200, body: { received: true } };
}

// ---------- Deleting an account ----------

export type DeletionPreview = DeletionRefund & { hasPlan: boolean };

async function feeCentsOf(chargeId: string | null, paymentIntentId: string | null, amountCents: number): Promise<number> {
  try {
    const charge = chargeId
      ? await stripeRequest<StripeCharge>("GET", `/charges/${encodeURIComponent(chargeId)}`, { expand: ["balance_transaction"] })
      : paymentIntentId
        ? (await stripeRequest<{ data: StripeCharge[] }>("GET", "/charges", { payment_intent: paymentIntentId, limit: 1, expand: ["data.balance_transaction"] })).data[0]
        : null;
    const fee = typeof charge?.balance_transaction === "object" ? charge?.balance_transaction?.fee : undefined;
    if (typeof fee === "number" && fee >= 0) return fee;
  } catch { /* fall back to Stripe's usual US fee */ }
  return estimateStripeFeeCents(amountCents);
}

const CANT_REACH = "We couldn't reach the payment service, so your account wasn't deleted (so you're never charged after it's gone). Nothing was changed. Try again in a minute.";

/** What deleting this account would give back right now (shown in the Delete dialog before anything happens). Reads Stripe
 *  fresh and strictly: if Stripe can't be reached, it says so instead of guessing. */
export async function previewAccountDeletion(ownerId: string): Promise<DeletionPreview> {
  const zero: DeletionPreview = { hasPlan: false, planPaidCents: 0, aiCostCents: 0, feeCents: 0, planRefundCents: 0, packRefundCents: 0, refundCents: 0, lines: [] };
  const saved = readAccountBillingIds(ownerId);
  if (!saved.customerId) return zero;
  if (billingMode() === "off") {
    if (saved.subscriptionId || listPayments(ownerId).length) throw new BillingError(CANT_REACH, 503);
    return zero;   // a customer that never paid anything: nothing to stop or give back
  }
  try { await syncNow(ownerId, { changed: [] }, true); markBillingSynced(ownerId); } catch { throw new BillingError(CANT_REACH, 503); }
  const ids = readAccountBillingIds(ownerId);
  const record = readAccountPlanRecord(ownerId);
  const status = getAccountPlanStatus(ownerId);
  const hasPlan = hasLiveSubscription(ownerId);
  const { start } = creditWindow(record, Date.now());
  const payments = listPayments(ownerId);
  // The plan payments that pay for today: this cycle's bill (and an upgrade's), or a yearly plan's year. A cycle that
  // isn't paid (its renewal failed) has nothing to give back; its waiting bill is voided when the plan stops.
  const paidFrom = record.paidFrom ?? start;
  const cyclePaid = hasPlan && !status.waitingForPayment;
  // (Nov 21) a bill counts when the period it paid for started in this one (a switch's old bill paid for the old period, so it is
  // never given back twice); bills without a period fall back to when they were paid.
  const planPaymentsRaw = cyclePaid ? payments.filter((payment) => payment.kind === "plan" && payment.subscriptionId === ids.subscriptionId &&
    (payment.periodFrom != null ? payment.periodFrom >= paidFrom - 60_000 : payment.paidAt >= paidFrom - 12 * 60 * 60 * 1000)) : [];
  const toRefundable = async (payment: (typeof payments)[number]): Promise<RefundablePayment> => ({
    stripeId: payment.stripeId, paymentIntentId: payment.paymentIntentId, kind: payment.kind, amountCents: payment.amountCents,
    refundedCents: payment.refundedCents, credits: payment.credits, feeCents: await feeCentsOf(payment.chargeId, payment.paymentIntentId, payment.amountCents),
  });
  const planPayments = await Promise.all(planPaymentsRaw.map(toRefundable));
  const packPayments = await Promise.all(payments.filter((payment) => payment.kind === "pack" && payment.refundedCents < payment.amountCents).map(toRefundable));
  const aiCost = cyclePaid ? planCreditsUsedSince(ownerId, Math.min(paidFrom, start)) : 0;
  return { hasPlan, ...deletionRefund(planPayments, aiCost, packPayments, status.topUpCredits) };
}

/** Before an account is deleted: stop every plan at once (never charged again), void waiting bills, close open payment pages,
 *  and give back everything but the AI it used and Stripe's fee. If Stripe can't be reached, this throws and the account is
 *  NOT deleted. Safe to run again after a failure: every step has its own idempotency key, and the refund is worked out
 *  again from what Stripe says is already refunded. */
export async function closeBillingForDeletion(ownerId: string): Promise<DeletionPreview> {
  const { customerId } = readAccountBillingIds(ownerId);
  if (!customerId) return previewAccountDeletion(ownerId);
  try {
    const preview = await previewAccountDeletion(ownerId);
    const subs = await stripeRequest<{ data: StripeSubscription[] }>("GET", "/subscriptions", { customer: customerId, status: "all", limit: 20 });
    for (const sub of subs.data ?? []) {
      if (isLiveSubscriptionStatus(sub.status)) await stopSubscription(sub.id, "cancel-delete");
    }
    await closeOpenPlanPages(customerId, null);
    for (const line of preview.lines) {
      await stripeRequest("POST", "/refunds", {
        payment_intent: line.paymentIntentId, amount: line.cents, reason: "requested_by_customer", metadata: { owner_id: ownerId, why: "account_deleted" },
      }, idempotencyKey("refund-delete", line.paymentIntentId, line.cents));
    }
    if (preview.hasPlan || preview.refundCents > 0) {
      ownerAlert(`deleted:${ownerId}`, `An account with a plan was deleted. Its plan was stopped and ${dollarsText(preview.refundCents)} given back (paid this ${PLAN_CYCLE} ${dollarsText(preview.planPaidCents)}, its AI ${dollarsText(preview.aiCostCents)}, Stripe's fee ${dollarsText(preview.feeCents)}; unused pack credits ${dollarsText(preview.packRefundCents)}).`);
    }
    return preview;
  } catch (error) {
    console.warn("[billing] closing billing before delete failed:", error instanceof BillingError ? error.message : "unknown");
    throw new BillingError(CANT_REACH, 503);
  }
}

// ---------- Paying inside Diamond Animator (Nov 21, Arthur: "I don't want it to pop up Stripe ever again... You never see him") ----------
// Every card is typed in Diamond Animator's own card form: Stripe's secure card fields, drawn in the app's look, inside the app's own
// dialog. The card number goes straight from those fields to Stripe; it never touches this server. Here the server only makes the
// payment ("intent"), and afterwards checks with Stripe what really happened (the sync), exactly as before.

export type CardPaymentStart = {
  /** What the card form confirms (a payment, or saving a card). Null when nothing has to be paid. */
  clientSecret: string | null; intent: "payment" | "setup"; ref: string; amountCents: number;
  /** The card already on file, if any: only its brand and last 4 digits (Nov 22: its id stays on the server; paying with it needs the password). */
  savedCard: { brand: string; last4: string } | null;
};
export type SavedCard = { id: string; brand: string; last4: string };
/** What the browser is told about the saved card: never its id. */
const shownCard = (card: SavedCard | null) => (card ? { brand: card.brand, last4: card.last4 } : null);
/** (Nov 22, Arthur: "a baby that tops up 15 times") at most this many credit packs in one day per account. */
export const PACKS_PER_DAY = 3;

const packCreditsOfIntent = (intent: StripePaymentIntent) => {
  const pack = TOP_UP_PACKS.find((entry) => entry.id === intent.metadata?.pack);
  const fromMetadata = Number(intent.metadata?.credits);
  return pack?.credits ?? (Number.isFinite(fromMetadata) && fromMetadata > 0 ? Math.round(fromMetadata) : 0);
};

/** One payment start at a time per account (a double click, two tabs, a page that asks twice): the second waits and then gets
 *  the SAME payment (the waiting plan start is reused; packs and cards share their minute's idempotency key). */
function oneAtATime<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const queue = (cache.diamondPayStarts ??= new Map<string, Promise<unknown>>());
  const mine = (queue.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(work);
  queue.set(ownerId, mine);
  void mine.finally(() => { if (queue.get(ownerId) === mine) queue.delete(ownerId); }).catch(() => undefined);
  return mine;
}

/** A pack paid in the app: recorded and added exactly once (the payment's own id is the claim). */
function applyPackIntent(ownerId: string, intent: StripePaymentIntent): boolean {
  const credits = packCreditsOfIntent(intent);
  if (credits <= 0) return false;
  recordPayment({
    stripeId: intent.id, ownerId, kind: "pack", amountCents: intent.amount_received ?? intent.amount, credits, plan: null, periodFrom: null, periodUntil: null,
    paidAt: (intent.created ?? Math.floor(Date.now() / 1000)) * 1000, chargeId: intent.latest_charge ? idOf(intent.latest_charge) : null,
    paymentIntentId: intent.id, subscriptionId: null,
  });
  return addTopUpCredits(ownerId, credits, intent.id);
}

/** The card on file (the plan's own card first, then the account's), for "Pay with Visa ending 4242". */
async function savedCardOf(ownerId: string): Promise<SavedCard | null> {
  const { customerId, subscriptionId } = readAccountBillingIds(ownerId);
  if (!customerId) return null;
  try {
    let card: StripeCard | null = null;
    if (subscriptionId) {
      const sub = await stripeRequest<{ default_payment_method?: StripeCard | string | null; status?: string }>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { expand: ["default_payment_method"] });
      if (sub.status !== "canceled" && typeof sub.default_payment_method === "object" && sub.default_payment_method) card = sub.default_payment_method;
    }
    if (!card) {
      const customer = await stripeRequest<{ invoice_settings?: { default_payment_method?: StripeCard | string | null } | null }>("GET", `/customers/${encodeURIComponent(customerId)}`, { expand: ["invoice_settings.default_payment_method"] });
      const found = customer.invoice_settings?.default_payment_method;
      if (typeof found === "object" && found) card = found;
    }
    return card?.card?.last4 ? { id: card.id, brand: card.card.brand ?? "card", last4: card.card.last4 } : null;
  } catch {
    return null;   // no saved card shown; typing one still works
  }
}

/** Starts paying for a plan IN THE APP (no Stripe page): a plan that waits for its first payment. Only one waiting start per
 *  account: an older unpaid start is stopped first (it never charged anything), so two plans can never both get paid. */
export function startPlanPayment(ownerId: string, user: BillingUser, plan: unknown, interval: unknown,
  codes: { first50?: unknown; youtube?: unknown } = {}): Promise<CardPaymentStart> {
  return oneAtATime(ownerId, () => startPlanPaymentNow(ownerId, user, plan, interval, codes));
}

async function startPlanPaymentNow(ownerId: string, user: BillingUser, plan: unknown, interval: unknown,
  codes: { first50?: unknown; youtube?: unknown }): Promise<CardPaymentStart> {
  stripeKey();
  if (!isPaidPlanId(plan)) throw new BillingError("Choose Basic, Pro or Creator.");
  if (!isBillingInterval(interval)) throw new BillingError(`Choose ${PLAN_CYCLE === "week" ? "weekly" : "monthly"} or yearly.`);
  const offer = pickOffer(codes, offerCodes(), interval, { trialRunning: trialRunning(ownerId) });
  if (!offer.ok) throw new BillingError(offer.message, 400);
  await syncWithStripe(ownerId, { force: true });
  if (hasLiveSubscription(ownerId)) throw new BillingError("You already have a plan. Use Switch on the Plans page to change it right away.", 409);
  const catalog = await ensureStripeCatalog();
  const price = catalog[planLookupKey(plan, interval)];
  if (!price) throw new BillingError("That plan isn't ready yet. Try again in a moment.", 503);
  const customer = await getOrCreateCustomer(ownerId, user.email, user.name);
  const offerName: Offer | "none" = offer.offer ?? "none";
  // an older start that was never paid: the same choice is used again; a different one is stopped (nothing was charged)
  const waiting = await stripeRequest<{ data: StripeSubscription[] }>("GET", "/subscriptions", { customer, status: "incomplete", limit: 10, expand: ["data.latest_invoice.payment_intent"] });
  for (const sub of waiting.data ?? []) {
    const choice = subscriptionPlan(sub);
    const invoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice as StripeInvoice & { payment_intent?: StripePaymentIntent | string | null } : null;
    const intent = invoice && typeof invoice.payment_intent === "object" ? invoice.payment_intent : null;
    if (choice?.plan === plan && choice.interval === interval && (sub.metadata?.offer ?? "none") === offerName && intent?.client_secret && intent.status !== "succeeded") {
      return { clientSecret: intent.client_secret, intent: "payment", ref: sub.id, amountCents: intent.amount, savedCard: shownCard(await savedCardOf(ownerId)) };
    }
    await stopSubscription(sub.id, "cancel-unpaid-start");
  }
  await closeOpenPlanPages(customer, null);
  const discounts = offer.apply ? [{ promotion_code: await promotionCodeFor(offer.apply) }] : undefined;
  let sub = await stripeRequest<StripeSubscription>("POST", "/subscriptions", {
    customer, items: [{ price: price.priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
    discounts, metadata: { owner_id: ownerId, plan, interval, offer: offerName },
    expand: ["latest_invoice.payment_intent"],
  }, idempotencyKey("app-plan", ownerId, plan, interval, offerName, Math.floor(Date.now() / 60_000)));
  // (Nov 22, Fable: Basic, then Pro, then Basic again within one minute replayed the first start, which had been stopped - its payment
  // could only fail) a stopped start is never handed out again: the next one is made, with a key that follows it
  let made = sub;
  for (let step = 0; step < 5; step++) {
    const now = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(made.id)}`);
    if (now.status !== "canceled" && now.status !== "incomplete_expired") break;
    made = await stripeRequest<StripeSubscription>("POST", "/subscriptions", {
      customer, items: [{ price: price.priceId }], payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
      discounts, metadata: { owner_id: ownerId, plan, interval, offer: offerName }, expand: ["latest_invoice.payment_intent"],
    }, idempotencyKey("app-plan", ownerId, plan, interval, offerName, Math.floor(Date.now() / 60_000), "after", made.id));
  }
  sub = made;
  startBillingSweeper();
  const invoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice as StripeInvoice & { payment_intent?: StripePaymentIntent | string | null; amount_due?: number } : null;
  const intent = invoice && typeof invoice.payment_intent === "object" ? invoice.payment_intent : null;
  return { clientSecret: intent?.client_secret ?? null, intent: "payment", ref: sub.id, amountCents: intent?.amount ?? invoice?.amount_due ?? 0, savedCard: shownCard(await savedCardOf(ownerId)) };
}

/** After the card form says it's paid: checks with Stripe (the sync) and says what arrived. Safe to call any number of times. */
export async function completePlanPayment(ownerId: string, subscriptionId: unknown): Promise<CheckoutResult> {
  stripeKey();
  if (typeof subscriptionId !== "string" || !/^sub_[A-Za-z0-9_]{6,200}$/.test(subscriptionId)) throw new BillingError("That payment couldn't be found.", 404);
  const sub = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (sub.metadata?.owner_id !== ownerId || idOf(sub.customer) !== readAccountBillingIds(ownerId).customerId) throw new BillingError("That payment belongs to a different account.", 403);
  // (Nov 22) the payment company can take a moment to mark a just-paid plan active: checked again for about 6 seconds
  let status = getAccountPlanStatus(ownerId);
  for (let tries = 0; tries < 4; tries++) {
    await syncWithStripe(ownerId, { force: true });
    status = getAccountPlanStatus(ownerId);
    if (isPaidPlanId(status.plan)) break;
    if (tries < 3) await new Promise((done) => setTimeout(done, 2000));
  }
  const plan = isPaidPlanId(status.plan) ? status.plan : subscriptionPlan(sub)?.plan ?? null;
  if (!plan || status.plan === "trial") {
    // the money moved but the plan is not saved yet: say so - the next check (at the latest the next page load) gives it, once
    const again = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { expand: ["latest_invoice.payment_intent"] });
    const invoice = typeof again.latest_invoice === "object" && again.latest_invoice ? again.latest_invoice as StripeInvoice & { payment_intent?: StripePaymentIntent | string | null } : null;
    const intent = invoice && typeof invoice.payment_intent === "object" ? invoice.payment_intent : null;
    const chosen = subscriptionPlan(again)?.plan ?? null;
    if (chosen && (intent?.status === "succeeded" || intent?.status === "processing" || invoice?.status === "paid")) {
      return { kind: "plan", plan: chosen, label: ACCOUNT_PLANS[chosen].label, credits: ACCOUNT_PLANS[chosen].credits, interval: subscriptionPlan(again)?.interval ?? PLAN_CYCLE,
        billingStatus: again.status, waitingForPayment: true, arriving: true };
    }
    throw new BillingError("Your payment didn't go through yet. Nothing was charged. Try again.", 409);
  }
  return {
    kind: "plan", plan, label: ACCOUNT_PLANS[plan].label, credits: status.creditsTotal || ACCOUNT_PLANS[plan].credits,
    interval: status.interval ?? PLAN_CYCLE, billingStatus: status.billingStatus, waitingForPayment: status.waitingForPayment,
  };
}

/** Starts buying an extra pack IN THE APP (members with a paid plan; only the packs of their own plan). */
export function startPackPayment(ownerId: string, packId: unknown): Promise<CardPaymentStart> {
  return oneAtATime(ownerId, () => startPackPaymentNow(ownerId, packId));
}

async function startPackPaymentNow(ownerId: string, packId: unknown): Promise<CardPaymentStart> {
  stripeKey();
  if (!isTopUpPackId(packId)) throw new BillingError("Choose a credit pack.");
  await syncWithStripe(ownerId, { force: true });
  const status = getAccountPlanStatus(ownerId);
  if (status.plan === "trial" || status.locked || status.billingStatus === "canceled") throw new BillingError("Extra packs are for plan members. Choose a plan first.", 403);
  if (status.billingStatus === "past_due") throw new BillingError("Your last payment didn't go through. Change your card first.", 409);
  const pack = TOP_UP_PACKS.find((entry) => entry.id === packId)!;
  if (!(pack.plans as readonly string[]).includes(status.plan)) throw new BillingError("That pack isn't on your plan. Pick one of the packs shown.", 403);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (listPayments(ownerId).filter((payment) => payment.kind === "pack" && payment.paidAt >= dayAgo).length >= PACKS_PER_DAY) {
    throw new BillingError(`For your safety, at most ${PACKS_PER_DAY} credit packs can be bought in one day. You can buy more tomorrow. Nothing was charged.`, 429);
  }
  const { customerId } = readAccountBillingIds(ownerId);
  if (!customerId) throw new BillingError("Choose a plan first.", 409);
  const packParams = {
    amount: Math.round(pack.usd * 100), currency: "usd", customer: customerId, payment_method_types: ["card"],
    description: `Diamond Animator: ${creditsText(pack.credits)}`,
    metadata: { owner_id: ownerId, kind: "topup", pack: pack.id, credits: pack.credits },
  };
  const minute = Math.floor(Date.now() / 60_000);
  let intent = await stripeRequest<StripePaymentIntent>("POST", "/payment_intents", packParams, idempotencyKey("app-pack", ownerId, pack.id, minute));
  // (Nov 22) a double click shares the minute's payment; but once that payment is PAID, a second pack in the same minute is a new
  // purchase on purpose - never the old, already-paid payment again (that said "added" and added nothing)
  // (a repeated request gets Stripe's FIRST answer back, "not paid yet": its state now is read before it is reused)
  for (let step = 0; step < PACKS_PER_DAY + 2; step++) {   // (each paid one points to the next: pack 1, then 2, then 3 in the same minute)
    const now = await stripeRequest<StripePaymentIntent>("GET", `/payment_intents/${encodeURIComponent(intent.id)}`);
    if (now.status !== "succeeded" && now.status !== "processing") break;
    intent = await stripeRequest<StripePaymentIntent>("POST", "/payment_intents", packParams, idempotencyKey("app-pack", ownerId, pack.id, minute, "after", intent.id));
  }
  startBillingSweeper();
  return { clientSecret: intent.client_secret ?? null, intent: "payment", ref: intent.id, amountCents: intent.amount, savedCard: shownCard(await savedCardOf(ownerId)) };
}

/** After the card form says the pack is paid: added exactly once (also by the sync, if this is never called). */
export async function completePackPayment(ownerId: string, paymentIntentId: unknown): Promise<CheckoutResult> {
  stripeKey();
  if (typeof paymentIntentId !== "string" || !/^pi_[A-Za-z0-9_]{6,200}$/.test(paymentIntentId)) throw new BillingError("That payment couldn't be found.", 404);
  const intent = await stripeRequest<StripePaymentIntent>("GET", `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
  if (intent.metadata?.owner_id !== ownerId || intent.metadata?.kind !== "topup") throw new BillingError("That payment belongs to a different account.", 403);
  if (intent.status === "processing") return { kind: "topup", pack: intent.metadata?.pack ?? "", credits: packCreditsOfIntent(intent), added: false, arriving: true };   // (Nov 22) paid, the bank is still finishing: the sync adds it, once
  if (intent.status !== "succeeded") throw new BillingError("That payment didn't go through. Nothing was charged.", 409);
  applyPackIntent(ownerId, intent);
  return { kind: "topup", pack: intent.metadata?.pack ?? "", credits: packCreditsOfIntent(intent), added: listPayments(ownerId).some((payment) => payment.stripeId === intent.id) };
}

// (Nov 22, Arthur: "if we do top up, there needs to be a verification ... a stranger, a hacker or a baby that tops up 15 times")
// A SAVED CARD IS NEVER ONE CLICK. The card on file is used only here, on the server, after the pay route checked the account's
// password; its id never reaches the browser, so a page cannot pay with it by itself. A typed card is its own proof (the old way).
// The same payment pressed twice is one charge (a payment can only ever be paid once). 3-D Secure still works: when the bank asks, the browser
// finishes it with the payment's own secret.
export async function payWithSavedCard(ownerId: string, kind: unknown, ref: unknown): Promise<{ status: string; clientSecret: string | null }> {
  stripeKey();
  let intent: StripePaymentIntent | null = null;
  if (kind === "pack") {
    if (typeof ref !== "string" || !/^pi_[A-Za-z0-9_]{6,200}$/.test(ref)) throw new BillingError("That payment couldn't be found. Nothing was charged.", 404);
    intent = await stripeRequest<StripePaymentIntent>("GET", `/payment_intents/${encodeURIComponent(ref)}`);
    if (intent.metadata?.owner_id !== ownerId || intent.metadata?.kind !== "topup") throw new BillingError("That payment belongs to a different account.", 403);
  } else if (kind === "plan") {
    if (typeof ref !== "string" || !/^sub_[A-Za-z0-9_]{6,200}$/.test(ref)) throw new BillingError("That payment couldn't be found. Nothing was charged.", 404);
    const sub = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(ref)}`, { expand: ["latest_invoice.payment_intent"] });
    if (sub.metadata?.owner_id !== ownerId || idOf(sub.customer) !== readAccountBillingIds(ownerId).customerId) throw new BillingError("That payment belongs to a different account.", 403);
    const invoice = typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice as StripeInvoice & { payment_intent?: StripePaymentIntent | string | null } : null;
    intent = invoice && typeof invoice.payment_intent === "object" ? invoice.payment_intent : null;
    if (!intent) throw new BillingError("That payment couldn't be found. Nothing was charged.", 404);
  } else throw new BillingError("Unknown payment.", 400);
  if (intent.status === "succeeded") return { status: "succeeded", clientSecret: null };
  const card = await savedCardOf(ownerId);
  if (!card) throw new BillingError("Your saved card couldn't be found. Use a different card. Nothing was charged.", 409);
  try {
    const confirmed = await stripeRequest<StripePaymentIntent>("POST", `/payment_intents/${encodeURIComponent(intent.id)}/confirm`,
      { payment_method: card.id, use_stripe_sdk: true });   // (one payment can only ever be paid once: pressing twice is never two charges; a declined card may be tried again)
    return { status: confirmed.status, clientSecret: confirmed.client_secret ?? null };
  } catch (error) {
    if (error instanceof StripeApiError && error.httpStatus === 402) throw new BillingError("Your card wasn't accepted. Nothing was charged. Try a different card.", 402);
    throw error;
  }
}

/** Starts saving a new card IN THE APP (nothing is charged). */
export function startCardSave(ownerId: string): Promise<CardPaymentStart> {
  return oneAtATime(ownerId, () => startCardSaveNow(ownerId));
}

async function startCardSaveNow(ownerId: string): Promise<CardPaymentStart> {
  stripeKey();
  const { customerId } = readAccountBillingIds(ownerId);
  if (!customerId) throw new BillingError("There's no card to change yet. Choose a plan first.", 409);
  const intent = await stripeRequest<StripeSetupIntent>("POST", "/setup_intents", {
    customer: customerId, payment_method_types: ["card"], usage: "off_session", metadata: { owner_id: ownerId, kind: "card" },
  }, idempotencyKey("app-card", ownerId, Math.floor(Date.now() / 60_000)));
  return { clientSecret: intent.client_secret ?? null, intent: "setup", ref: intent.id, amountCents: 0, savedCard: null };
}

/** After the card form saved the card: every payment uses it from now on, and an unpaid bill is tried again at once. */
export async function completeCardSave(ownerId: string, setupIntentId: unknown): Promise<{ paymentProblem: boolean }> {
  stripeKey();
  if (typeof setupIntentId !== "string" || !/^seti_[A-Za-z0-9_]{6,200}$/.test(setupIntentId)) throw new BillingError("That card change couldn't be found.", 404);
  const intent = await stripeRequest<StripeSetupIntent>("GET", `/setup_intents/${encodeURIComponent(setupIntentId)}`);
  const { customerId, subscriptionId } = readAccountBillingIds(ownerId);
  if (intent.metadata?.owner_id !== ownerId || intent.metadata?.kind !== "card" || idOf(intent.customer ?? null) !== customerId) {
    throw new BillingError("That card change belongs to a different account.", 403);
  }
  const card = intent.payment_method ? idOf(intent.payment_method) : null;
  if (intent.status !== "succeeded" || !card || !customerId) throw new BillingError("The new card wasn't saved. Nothing changed.", 409);
  await stripeRequest("POST", `/customers/${encodeURIComponent(customerId)}`, { invoice_settings: { default_payment_method: card } }, idempotencyKey("card-customer", setupIntentId));
  if (subscriptionId) {
    await stripeRequest("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { default_payment_method: card }, idempotencyKey("card-plan", setupIntentId));
  }
  await syncWithStripe(ownerId, { force: true, fresh: true });   // an unpaid bill is tried again with the new card
  return { paymentProblem: getAccountPlanStatus(ownerId).paymentProblem };
}

// ---------- Managing a plan inside Diamond Animator (Nov 21, Arthur: "Diamond Animator is what you see, behind the scenes it's
// Stripe") ----------
// Switching happens NOW: the new plan's full price is charged at once with the card on file, a new month starts today with the new
// plan's full credits, and what is left of the old payment comes back by the same fair rule as deleting (you pay only for the AI
// you used and Stripe's fee). Cancelling and keeping a plan are one click. Only typing a new card opens Stripe's secure card page.

export type SwitchPreview = {
  plan: PaidPlanId; interval: BillingInterval; label: string; credits: number;
  /** What is charged now with the card on file (a discount that is still running is taken off). */
  chargeCents: number;
  /** Given back from the current payment, and how: paid - AI used (1 credit = 1 cent) - Stripe's fee. */
  refundCents: number; paidCents: number; aiCostCents: number; feeCents: number;
  /** Pack credits stay as they are. */
  packCredits: number;
};
export type SwitchResult = { label: string; credits: number; paidCents: number; refundCents: number };

const PLAN_CHANGE_DOWN = "We couldn't reach the payment service, so nothing was changed. Try again in a minute.";

/** The live subscription that can be changed right now, after a strict check with Stripe (or a plain reason why not). */
async function changeablePlan(ownerId: string) {
  stripeKey();
  try { await syncNow(ownerId, { changed: [] }, true); markBillingSynced(ownerId); } catch { throw new BillingError(PLAN_CHANGE_DOWN, 503); }
  const status = getAccountPlanStatus(ownerId);
  const { subscriptionId } = readAccountBillingIds(ownerId);
  if (!subscriptionId || !hasLiveSubscription(ownerId) || status.plan === "trial") throw new BillingError("You don't have a plan yet. Choose one first.", 409);
  if (status.aiLocked) throw new BillingError("A payment on your account is being checked by your bank, so your plan can't change until that's settled.", 409);
  if (status.paymentProblem || status.waitingForPayment || status.billingStatus === "past_due") {
    throw new BillingError("Your last payment didn't go through. Change your card first, then you can switch.", 409);
  }
  const sub = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return { sub, status };
}

/** A schedule left by Stripe's old Manage plan page (a downgrade waiting for the period end) is let go, so the plan can change now. */
async function releaseSchedule(sub: StripeSubscription) {
  const schedule = sub.schedule ? idOf(sub.schedule) : null;
  if (!schedule) return;
  try {
    await stripeRequest("POST", `/subscription_schedules/${encodeURIComponent(schedule)}/release`, {}, idempotencyKey("release", schedule));
  } catch (error) {
    if (!(error instanceof StripeApiError && error.httpStatus < 500)) throw error;   // already released
  }
}

const runningDiscountPercent = (sub: StripeSubscription) => {
  const discount = sub.discount;
  if (!discount?.coupon?.percent_off) return 0;
  if (discount.end && discount.end * 1000 <= Date.now()) return 0;
  return Math.max(0, Math.min(100, discount.coupon.percent_off));
};

async function planSwitchQuote(ownerId: string, plan: unknown, interval: unknown) {
  if (!isPaidPlanId(plan)) throw new BillingError("Choose Basic, Pro or Creator.");
  if (!isBillingInterval(interval)) throw new BillingError(`Choose ${PLAN_CYCLE === "week" ? "weekly" : "monthly"} or yearly.`);
  const { sub, status } = await changeablePlan(ownerId);
  if (status.plan === plan && status.interval === interval) throw new BillingError("That's already your plan.", 409);
  // What is left of the payment for the current period comes back by the delete rule (packs are NOT given back: they stay).
  const refund = await previewAccountDeletion(ownerId);
  const planIds = new Set(listPayments(ownerId).filter((payment) => payment.kind === "plan").map((payment) => payment.stripeId));
  const lines = refund.lines.filter((line) => planIds.has(line.stripeId));
  const list = planUnitAmount(plan, interval);
  const preview: SwitchPreview = {
    plan, interval, label: ACCOUNT_PLANS[plan].label, credits: ACCOUNT_PLANS[plan].credits,
    chargeCents: list - Math.round((list * runningDiscountPercent(sub)) / 100),
    refundCents: lines.reduce((sum, line) => sum + line.cents, 0), paidCents: refund.planPaidCents, aiCostCents: refund.aiCostCents, feeCents: refund.feeCents,
    packCredits: status.topUpCredits,
  };
  return { sub, preview, lines };
}

/** What switching to `plan` now would cost and give back (shown before anything happens). */
export async function previewPlanSwitch(ownerId: string, plan: unknown, interval: unknown): Promise<SwitchPreview> {
  return (await planSwitchQuote(ownerId, plan, interval)).preview;
}

/** Switches the plan NOW. The card on file pays the new plan's full price first; if it is declined, nothing changes. Then the
 *  rest of the old payment is given back (never twice: each refund is claimed once, and the credits are not taken back for it). */
export async function switchPlanNow(ownerId: string, plan: unknown, interval: unknown): Promise<SwitchResult> {
  // One change at a time per account (two clicks or two tabs wait for each other; the second then sees "already your plan").
  const running = (cache.diamondPlanChanges ??= new Map<string, Promise<unknown>>());
  const before = running.get(ownerId) ?? Promise.resolve();
  const mine = before.catch(() => undefined).then(() => switchPlanNowOnce(ownerId, plan, interval));
  running.set(ownerId, mine);
  try { return await mine; } finally { if (running.get(ownerId) === mine) running.delete(ownerId); }
}

const declinedTries = new Map<string, number>();

async function switchPlanNowOnce(ownerId: string, plan: unknown, interval: unknown): Promise<SwitchResult> {
  const { sub, preview, lines } = await planSwitchQuote(ownerId, plan, interval);
  await releaseSchedule(sub);
  const catalog = await ensureStripeCatalog();
  const price = catalog[planLookupKey(preview.plan, preview.interval)];
  const itemId = sub.items?.data?.[0]?.id;
  if (!price || !itemId) throw new BillingError("That plan isn't ready yet. Try again in a moment.", 503);
  const periodKey = sub.current_period_start ?? sub.items?.data?.[0]?.current_period_start ?? 0;
  let updated: StripeSubscription;
  try {
    updated = await stripeRequest<StripeSubscription>("POST", `/subscriptions/${encodeURIComponent(sub.id)}`, {
      items: [{ id: itemId, price: price.priceId }],
      proration_behavior: "none", billing_cycle_anchor: "now", payment_behavior: "error_if_incomplete", cancel_at_period_end: false,
      metadata: { owner_id: ownerId, plan: preview.plan, interval: preview.interval, offer: sub.metadata?.offer ?? "none" },
      expand: ["latest_invoice"],
    }, idempotencyKey("switch-now", sub.id, periodKey, preview.plan, preview.interval, declinedTries.get(ownerId) ?? 0));
  } catch (error) {
    if (error instanceof StripeApiError && error.httpStatus === 402) {
      // Stripe keeps a declined try under its key: the next try (after the card is fixed) gets a new key. Nothing was charged,
      // so a new key can never pay twice; a double click without a decline still shares one key.
      declinedTries.set(ownerId, (declinedTries.get(ownerId) ?? 0) + 1);
      throw new BillingError("Your card was declined, so nothing changed and nothing was charged. Change your card and try again.", 402);
    }
    throw error;
  }
  const invoice = typeof updated.latest_invoice === "object" && updated.latest_invoice ? updated.latest_invoice : null;
  let refunded = 0;
  for (const line of lines) {
    if (!line.paymentIntentId || line.cents <= 0) continue;
    const event = `switch-refund:${line.stripeId}:${periodKey}`;
    if (!claimBillingEvent(ownerId, event, "switch")) continue;
    addFreeRefund(line.stripeId, line.cents);   // the old period's credits are gone anyway: this refund takes none back
    try {
      await stripeRequest("POST", "/refunds", {
        payment_intent: line.paymentIntentId, amount: line.cents, reason: "requested_by_customer", metadata: { owner_id: ownerId, why: "plan_switch" },
      }, idempotencyKey("refund-switch", line.paymentIntentId, line.cents, periodKey));
      refunded += line.cents;
    } catch {
      addFreeRefund(line.stripeId, -line.cents);
      releaseBillingEvent(event);
      ownerAlert(`switch-refund:${line.stripeId}:${periodKey}`, `Account ${ownerId} switched plans, but ${dollarsText(line.cents)} of its old payment couldn't be given back automatically. Refund it in the Stripe dashboard (payment ${line.paymentIntentId}).`);
    }
  }
  await syncWithStripe(ownerId, { force: true });
  const paidCents = invoice?.amount_paid ?? preview.chargeCents;
  setBillingNotice(ownerId, refunded > 0
    ? `You switched to ${preview.label}: ${dollarsText(paidCents)} paid today, and ${dollarsText(refunded)} of your last payment is on its way back to your card.`
    : `You switched to ${preview.label}: ${dollarsText(paidCents)} paid today.`);
  return { label: preview.label, credits: preview.credits, paidCents, refundCents: refunded };
}

/** Cancel (the plan runs to the end of what was paid, then stops; never charged again) or keep it after all. */
export async function setPlanCancelled(ownerId: string, cancel: boolean): Promise<{ cancelAtPeriodEnd: boolean; endsAt: number | null }> {
  stripeKey();
  try { await syncNow(ownerId, { changed: [] }, true); markBillingSynced(ownerId); } catch { throw new BillingError(PLAN_CHANGE_DOWN, 503); }
  const { subscriptionId } = readAccountBillingIds(ownerId);
  if (!subscriptionId || !hasLiveSubscription(ownerId)) throw new BillingError("You don't have a plan to change.", 409);
  const sub = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  await releaseSchedule(sub);
  await stripeRequest("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { cancel_at_period_end: cancel },
    idempotencyKey(cancel ? "cancel-at-end" : "keep-plan", subscriptionId, Math.floor(Date.now() / 60_000)));
  await syncWithStripe(ownerId, { force: true });
  const status = getAccountPlanStatus(ownerId);
  return { cancelAtPeriodEnd: status.cancelAtPeriodEnd, endsAt: status.cancelAtPeriodEnd ? status.refillsAt ?? status.windowEnd : null };
}

/** Typing a new card is the one thing that happens on Stripe's secure page (so the card number never touches Diamond Animator). */
export async function createCardChangePage(ownerId: string, origin: string): Promise<{ url: string }> {
  stripeKey();
  const { customerId } = readAccountBillingIds(ownerId);
  if (!customerId) throw new BillingError("There's no card to change yet. Choose a plan first.", 409);
  const session = await stripeRequest<{ url: string | null }>("POST", "/checkout/sessions", {
    mode: "setup", payment_method_types: ["card"], customer: customerId, client_reference_id: ownerId,
    metadata: { owner_id: ownerId, kind: "card" },
    success_url: `${origin}/plans?card=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/plans?card=canceled`,
  });
  if (!session.url) throw new BillingError(SERVICE_PROBLEM, 502);
  return { url: session.url };
}

/** Back from the card page: the new card becomes the one every payment uses, and an unpaid bill is tried again at once. */
export async function completeCardChange(ownerId: string, sessionId: unknown): Promise<{ paymentProblem: boolean }> {
  stripeKey();
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) throw new BillingError("That card change couldn't be found.", 404);
  const session = await stripeRequest<StripeCheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`, { expand: ["setup_intent"] });
  const { customerId, subscriptionId } = readAccountBillingIds(ownerId);
  if (session.client_reference_id !== ownerId || session.mode !== "setup" || session.metadata?.kind !== "card" || (session.customer && idOf(session.customer) !== customerId)) {
    throw new BillingError("That card change belongs to a different account.", 403);
  }
  if (session.status !== "complete") throw new BillingError("The new card wasn't saved. Nothing changed.", 409);
  const intent = typeof session.setup_intent === "object" && session.setup_intent ? session.setup_intent : null;
  const card = intent?.payment_method ? idOf(intent.payment_method) : null;
  if (!card || !customerId) throw new BillingError("The new card wasn't saved. Nothing changed.", 409);
  await stripeRequest("POST", `/customers/${encodeURIComponent(customerId)}`, { invoice_settings: { default_payment_method: card } }, idempotencyKey("card-customer", sessionId));
  if (subscriptionId) {
    await stripeRequest("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { default_payment_method: card }, idempotencyKey("card-plan", sessionId));
  }
  await syncWithStripe(ownerId, { force: true, fresh: true });   // "came back": an unpaid bill is tried again with the new card
  return { paymentProblem: getAccountPlanStatus(ownerId).paymentProblem };
}

/** The Plans screen's facts from Stripe: last payment, next payment, any notice. */
export const billingFacts = (ownerId: string) => readBillingFacts(ownerId);

// ---------- Development only: Stripe test clocks (prove renewal day on the real Stripe, in test mode) ----------

export type DevClockAction = "start" | "advance" | "card_fails" | "card_works" | "state";

/** Development + Stripe test mode only (the route is 404 elsewhere). "start" gives this account a Stripe test customer on a test
 *  clock (before it buys a plan); "advance" moves that clock `days` ahead (Stripe renews, retries, ends plans as if time passed);
 *  "card_fails"/"card_works" swap the customer's card for Stripe's test card that is always declined / always works. */
export async function devTestClock(ownerId: string, user: BillingUser, action: DevClockAction, days = 0): Promise<Record<string, unknown>> {
  if (process.env.NODE_ENV !== "development" || billingMode() !== "test") throw new BillingError("Test clocks are for development in test mode only.", 404);
  const { customerId } = readAccountBillingIds(ownerId);
  if (action === "start") {
    if (customerId) throw new BillingError("This account already has a Stripe customer; use a new test account.", 409);
    const clock = await stripeRequest<{ id: string }>("POST", "/test_helpers/test_clocks", { frozen_time: Math.floor(Date.now() / 1000), name: `dev ${ownerId}` });
    const customer = await stripeRequest<{ id: string }>("POST", "/customers", { email: user.email, name: user.name || undefined, test_clock: clock.id, metadata: { owner_id: ownerId } });
    setStripeCustomerId(ownerId, customer.id);
    return { clock: clock.id, customer: customer.id };
  }
  if (!customerId) throw new BillingError("Start a test clock first.", 409);
  const customer = await stripeRequest<{ test_clock: string | null }>("GET", `/customers/${encodeURIComponent(customerId)}`);
  if (!customer.test_clock) throw new BillingError("This customer has no test clock.", 409);
  const clockPath = `/test_helpers/test_clocks/${encodeURIComponent(customer.test_clock)}`;
  if (action === "advance") {
    const clock = await stripeRequest<{ frozen_time: number }>("GET", clockPath);
    const to = clock.frozen_time + Math.round(Math.max(0, days) * 86400);
    await stripeRequest("POST", `${clockPath}/advance`, { frozen_time: to });
    for (let i = 0; i < 40; i++) {   // the clock moves in the background: wait until Stripe is done (renewals, retries)
      const now = await stripeRequest<{ status: string; frozen_time: number }>("GET", clockPath);
      if (now.status === "ready") return { frozenTime: new Date(now.frozen_time * 1000).toISOString() };
      await new Promise((done) => setTimeout(done, 1500));
    }
    return { frozenTime: null, note: "still advancing" };
  }
  if (action === "card_fails" || action === "card_works") {
    const token = action === "card_fails" ? "pm_card_chargeCustomerFail" : "pm_card_visa";
    const pm = await stripeRequest<{ id: string }>("POST", `/payment_methods/${token}/attach`, { customer: customerId });
    await stripeRequest("POST", `/customers/${encodeURIComponent(customerId)}`, { invoice_settings: { default_payment_method: pm.id } });
    const { subscriptionId } = readAccountBillingIds(ownerId);
    if (subscriptionId) await stripeRequest("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { default_payment_method: pm.id });
    return { card: action };
  }
  const clock = await stripeRequest<{ frozen_time: number; status: string }>("GET", clockPath);
  return { frozenTime: new Date(clock.frozen_time * 1000).toISOString(), status: clock.status };
}
