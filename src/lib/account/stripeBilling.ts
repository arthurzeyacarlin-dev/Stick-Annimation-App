import "server-only";

// SPEC-0020 Phase 9: Stripe billing in TEST MODE ONLY. Real money is impossible here: every call first checks that
// STRIPE_SECRET_KEY is a Stripe test key (sk_test_/rk_test_) and refuses otherwise. Cards are typed only on Stripe's
// own hosted Checkout page; this app never sees card numbers. There are no webhooks while the app is local: after a
// checkout the screen asks the server to read the finished session (completeCheckout), and the plan status route
// "pulls" the subscription from Stripe at most once a minute (syncSubscription). The pure rules are in
// stripeBillingRules.ts (tested without network).
import {
  addTopUpCredits, applySubscriptionState, getAccountPlanStatus, markBillingSynced, readAccountBillingIds, readAccountPlanRecord, setStripeCustomerId,
} from "./aiCredits";
import { ACCOUNT_PLANS, isPaidPlanId, PAID_PLAN_IDS, TOP_UP_PACKS, type BillingInterval, type PaidPlanId, type TopUpPackId, isTopUpPackId } from "./plans";
import {
  assertTestStripeKey, BillingError, billingModeForKey, encodeStripeForm, isBillingInterval, mapSubscriptionStatus, planLookupKey,
  STRIPE_CATALOG, subscriptionPeriodStartMs, subscriptionPlan, type BillingMode, type CatalogEntry, type FormValue,
} from "./stripeBillingRules";

export { BillingError } from "./stripeBillingRules";

const STRIPE_API = "https://api.stripe.com/v1";
const SYNC_EVERY_MS = 60_000;
const SERVICE_PROBLEM = "The payment service had a problem. Try again in a moment.";

/** A Stripe API error, kept in plain words for the person; the Stripe code is only for our own checks. */
class StripeApiError extends BillingError {
  stripeCode: string | null;
  constructor(status: number, stripeCode: string | null) {
    super(SERVICE_PROBLEM, status >= 500 ? 502 : status === 429 ? 503 : 502);
    this.stripeCode = stripeCode;
  }
}

/** "test" when a Stripe test key is set, otherwise "off". The key itself never leaves the server. */
export const billingMode = (): BillingMode => billingModeForKey(process.env.STRIPE_SECRET_KEY);

/** The app's own address for Stripe's return links (only local hosts pass requireAccountRequest). */
export const billingOrigin = (request: Request) => `http://${request.headers.get("host") ?? "localhost:3000"}`;

/** Turns any error into a plain-words message + status for the API routes. */
export function billingErrorResponse(error: unknown): { error: string; status: number } {
  if (error instanceof BillingError) return { error: error.message, status: error.status };
  console.warn("[billing] unexpected problem:", error instanceof Error ? error.name : "unknown");
  return { error: SERVICE_PROBLEM, status: 500 };
}

async function stripeRequest<T>(method: "GET" | "POST", path: string, params: Record<string, FormValue> = {}): Promise<T> {
  const key = assertTestStripeKey(process.env.STRIPE_SECRET_KEY);
  const body = encodeStripeForm(params);
  const url = method === "GET" && body ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: method === "POST" ? body : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new BillingError("The payment service didn't answer. Try again in a moment.", 502);
  }
  const data = await response.json().catch(() => null) as (T & { error?: { type?: string; code?: string } }) | null;
  if (!response.ok || !data) {
    const code = data?.error?.code ?? null;
    console.warn(`[billing] Stripe ${method} ${path.split("/").slice(0, 3).join("/")} failed: ${response.status} ${data?.error?.type ?? ""} ${code ?? ""}`);
    throw new StripeApiError(response.status, code);
  }
  return data;
}

// ---------- Catalog (products + prices found or created by lookup key) and the customer portal ----------

type StripeProductRef = string | { id: string; active?: boolean; deleted?: boolean };
type StripePrice = {
  id: string; lookup_key: string | null; unit_amount: number | null; currency: string; active: boolean;
  recurring: { interval: string } | null; product: StripeProductRef;
};
export type StripeCatalog = Record<string, { priceId: string; productId: string }>;

type BillingGlobal = typeof globalThis & {
  diamondStripeCatalog?: Promise<StripeCatalog>;
  diamondStripeCatalogKey?: string;
  diamondStripePortalConfig?: Promise<string>;
  diamondStripeSyncs?: Map<string, Promise<void>>;
  diamondStripeReconciles?: Map<string, number>;
  diamondStripeCustomers?: Map<string, Promise<string>>;
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
  // Month and year prices of one plan share one product: reuse whichever product already exists.
  const products = new Map<string, string>();
  for (const entry of STRIPE_CATALOG) {
    const price = found.get(entry.lookupKey);
    if (price && productUsable(price.product) && !products.has(entry.productKey)) products.set(entry.productKey, productIdOf(price.product));
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
      });
      productId = product.id;
      products.set(entry.productKey, productId);
    }
    // transfer_lookup_key moves the key from an old (changed or archived) price to this new one.
    const price = await stripeRequest<StripePrice>("POST", "/prices", {
      product: productId, currency: "usd", unit_amount: entry.unitAmount, lookup_key: entry.lookupKey, transfer_lookup_key: true,
      nickname: entry.productName + (entry.kind === "plan" ? (entry.interval === "month" ? " (monthly)" : " (yearly)") : ""),
      recurring: entry.kind === "plan" ? { interval: entry.interval } : undefined,
      metadata: { diamond_key: entry.lookupKey },
    });
    catalog[entry.lookupKey] = { priceId: price.id, productId };
  }
  return catalog;
}

/** Finds or creates the 9 prices (6 plan prices, 3 credit packs) once per server start. */
export function ensureStripeCatalog(): Promise<StripeCatalog> {
  // Reload when the plans or packs change (a server that stays running keeps this cache).
  const key = TOP_UP_PACKS.map((pack) => `${pack.id}:${pack.usd}`).join(",");
  if (cache.diamondStripeCatalogKey !== key) { cache.diamondStripeCatalog = undefined; cache.diamondStripeCatalogKey = key; }
  if (!cache.diamondStripeCatalog) {
    cache.diamondStripeCatalog = loadCatalog().catch((error) => { cache.diamondStripeCatalog = undefined; throw error; });
  }
  return cache.diamondStripeCatalog;
}

async function configurePortal(): Promise<string> {
  const catalog = await ensureStripeCatalog();
  // Each plan product with its prices (normally one product holding the month + year price).
  const byProduct = new Map<string, string[]>();
  for (const plan of PAID_PLAN_IDS) {
    for (const interval of ["month", "year"] as const) {
      const item = catalog[planLookupKey(plan, interval)];
      if (!item) continue;
      byProduct.set(item.productId, [...(byProduct.get(item.productId) ?? []), item.priceId]);
    }
  }
  const features: Record<string, FormValue> = {
    subscription_update: {
      enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations",
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
  });
  return created.id;
}

/** Sets up the "Manage plan" page (cancel at period end, switch between the 3 plans, card, invoices) once per server start. */
export function ensurePortalConfiguration(): Promise<string> {
  if (!cache.diamondStripePortalConfig) {
    cache.diamondStripePortalConfig = configurePortal().catch((error) => { cache.diamondStripePortalConfig = undefined; throw error; });
  }
  return cache.diamondStripePortalConfig;
}

// ---------- Customers ----------

export type BillingUser = { email: string; name?: string | null };

/** This account's Stripe customer (made on first checkout; remade if the saved one is gone). */
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
    const created = await stripeRequest<{ id: string }>("POST", "/customers", {
      email, name: name || undefined, metadata: { owner_id: ownerId },
    });
    setStripeCustomerId(ownerId, created.id);
    return created.id;
  })().finally(() => pending.delete(ownerId));
  pending.set(ownerId, work);
  return work;
}

// ---------- Subscriptions ----------

type StripeSubscription = {
  id: string; status: string; customer: string | { id: string } | null; cancel_at_period_end?: boolean; cancel_at?: number | null;
  current_period_start?: number | null;
  items?: { data?: { current_period_start?: number | null; price?: { lookup_key?: string | null; recurring?: { interval?: string | null } | null } | null }[] } | null;
};

/** Saves what Stripe says about a subscription. Returns the plan, or null if the subscription isn't one of ours. */
function applyFromSubscription(ownerId: string, subscription: StripeSubscription) {
  const planAndInterval = subscriptionPlan(subscription);
  const status = mapSubscriptionStatus(subscription.status);
  if (!planAndInterval || status === "none") return null;
  applySubscriptionState(ownerId, {
    plan: planAndInterval.plan,
    interval: planAndInterval.interval,
    status,
    periodStartedAt: subscriptionPeriodStartMs(subscription, readAccountPlanRecord(ownerId).periodStartedAt),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    subscriptionId: subscription.id,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
  });
  return { ...planAndInterval, status };
}

/**
 * Pulls the subscription from Stripe (at most once a minute unless forced) — this replaces webhooks while the app is
 * local. Never throws: on any problem the last saved state stays.
 */
// Found in testing (2026-10-12): if the account isn't signed in when Stripe sends the buyer back (session
// expired, another tab signed out), the return page can't finish the payment and the credits/plan would be
// missing. So, at most once a minute, the app looks at the customer's recent finished Checkout pages and
// finishes any it missed. Each one is applied once (top-ups are claimed by session id; a plan only if the
// account doesn't already have that subscription). Webhooks replace this when the app is online.
const RECONCILE_EVERY_MS = 60_000;
async function reconcileRecentCheckouts(ownerId: string) {
  const ids = readAccountBillingIds(ownerId);
  if (!ids.customerId) return;
  const times = (cache.diamondStripeReconciles ??= new Map());
  if (Date.now() - (times.get(ownerId) ?? 0) < RECONCILE_EVERY_MS) return;
  times.set(ownerId, Date.now());
  const list = await stripeRequest<{ data: StripeCheckoutSession[] }>("GET", "/checkout/sessions", { customer: ids.customerId, status: "complete", limit: 10 });
  for (const session of list.data ?? []) {
    if (session.client_reference_id !== ownerId) continue;
    const kind = session.metadata?.kind;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    const missedPlan = kind === "plan" && subscriptionId && subscriptionId !== readAccountBillingIds(ownerId).subscriptionId;
    if (kind !== "topup" && !missedPlan) continue;
    try { await completeCheckout(ownerId, session.id); } catch { /* not paid yet, or already handled */ }
  }
}

export async function syncSubscription(ownerId: string, options: { force?: boolean } = {}): Promise<void> {
  try {
    if (billingMode() !== "test") return;
    try { await reconcileRecentCheckouts(ownerId); } catch { /* keep going: the plan status must always load */ }
    const ids = readAccountBillingIds(ownerId);
    if (!ids.subscriptionId) return;
    // A canceled subscription never comes back in Stripe; a new plan arrives through completeCheckout.
    if (readAccountPlanRecord(ownerId).billingStatus === "canceled") return;
    if (!options.force && ids.syncedAt && Date.now() - ids.syncedAt < SYNC_EVERY_MS) return;
    const pending = (cache.diamondStripeSyncs ??= new Map());
    const running = pending.get(ownerId);
    if (running) return await running;
    const subscriptionId = ids.subscriptionId;
    const work = (async () => {
      try {
        const subscription = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
        if (!applyFromSubscription(ownerId, subscription)) markBillingSynced(ownerId);
      } catch (error) {
        console.warn("[billing] subscription check failed; keeping the last saved plan:", error instanceof BillingError ? error.message : "unknown");
        try { markBillingSynced(ownerId); } catch { /* keep the last state */ }
      }
    })().finally(() => pending.delete(ownerId));
    pending.set(ownerId, work);
    await work;
  } catch {
    // Never break the caller (the plan status must always load).
  }
}

/** True when this account already pays for a plan (so a second subscription must not be made). */
function hasLiveSubscription(ownerId: string) {
  const ids = readAccountBillingIds(ownerId);
  const status = getAccountPlanStatus(ownerId);
  return Boolean(ids.subscriptionId) && status.plan !== "trial" && (status.billingStatus === "active" || status.billingStatus === "past_due");
}

// ---------- Checkout, completion, portal ----------

/** Stripe's "Manage plan" page for this account. */
export async function createPortalSession(ownerId: string, origin: string, returnPath = "/credits"): Promise<{ url: string }> {
  assertTestStripeKey(process.env.STRIPE_SECRET_KEY);
  const { customerId } = readAccountBillingIds(ownerId);
  if (!customerId) throw new BillingError("There's no plan to manage yet. Choose a plan first.", 409);
  let configuration: string | undefined;
  try { configuration = await ensurePortalConfiguration(); } catch { configuration = undefined; /* fall back to Stripe's default page */ }
  const session = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
    customer: customerId, return_url: `${origin}${returnPath}`, configuration,
  });
  return { url: session.url };
}

/** Starts paying for a plan on Stripe's page. If a plan is already paid for, opens Manage plan instead (switching happens there). */
export async function createPlanCheckout(ownerId: string, user: BillingUser, plan: unknown, interval: unknown, origin: string): Promise<{ url: string; portal: boolean }> {
  assertTestStripeKey(process.env.STRIPE_SECRET_KEY);
  if (!isPaidPlanId(plan)) throw new BillingError("Choose Starter, Creator or Studio.");
  if (!isBillingInterval(interval)) throw new BillingError("Choose monthly or yearly.");
  await syncSubscription(ownerId, { force: true });
  if (hasLiveSubscription(ownerId)) return { ...(await createPortalSession(ownerId, origin, "/plans")), portal: true };
  const catalog = await ensureStripeCatalog();
  const price = catalog[planLookupKey(plan, interval)];
  if (!price) throw new BillingError("That plan isn't ready yet. Try again in a moment.", 503);
  const customer = await getOrCreateCustomer(ownerId, user.email, user.name);
  const session = await stripeRequest<{ url: string | null }>("POST", "/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: ownerId,
    line_items: [{ price: price.priceId, quantity: 1 }],
    metadata: { owner_id: ownerId, kind: "plan", plan, interval },
    subscription_data: { metadata: { owner_id: ownerId, plan, interval } },
    success_url: `${origin}/plans?checkout=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/plans?checkout=canceled`,
    allow_promotion_codes: true,
  });
  if (!session.url) throw new BillingError(SERVICE_PROBLEM, 502);
  return { url: session.url, portal: false };
}

/** Buys an extra credit pack on Stripe's page (members with a paid plan only). */
export async function createTopUpCheckout(ownerId: string, user: BillingUser, packId: unknown, origin: string): Promise<{ url: string }> {
  assertTestStripeKey(process.env.STRIPE_SECRET_KEY);
  if (!isTopUpPackId(packId)) throw new BillingError("Choose a credit pack.");
  await syncSubscription(ownerId);
  const status = getAccountPlanStatus(ownerId);
  if (status.plan === "trial" || status.locked || status.billingStatus === "canceled" || status.billingStatus === "none") {
    throw new BillingError("Extra credits are for members — choose a plan first", 403);
  }
  if (status.billingStatus === "past_due") {
    throw new BillingError("Your last payment didn't go through. Update your card in Manage plan first.", 409);
  }
  const pack = TOP_UP_PACKS.find((entry) => entry.id === packId)!;
  if (pack.plan !== status.plan) throw new BillingError("That pack is for a different plan. Pick one of your plan's packs.", 403);
  const catalog = await ensureStripeCatalog();
  const price = catalog[packId];
  if (!price) throw new BillingError("That pack isn't ready yet. Try again in a moment.", 503);
  const customer = await getOrCreateCustomer(ownerId, user.email, user.name);
  const session = await stripeRequest<{ url: string | null }>("POST", "/checkout/sessions", {
    mode: "payment",
    customer,
    client_reference_id: ownerId,
    line_items: [{ price: price.priceId, quantity: 1 }],
    metadata: { owner_id: ownerId, kind: "topup", pack: pack.id, credits: pack.credits },
    payment_intent_data: { metadata: { owner_id: ownerId, kind: "topup", pack: pack.id } },
    success_url: `${origin}/credits?topup=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/credits?topup=canceled`,
  });
  if (!session.url) throw new BillingError(SERVICE_PROBLEM, 502);
  return { url: session.url };
}

type StripeCheckoutSession = {
  id: string; mode: string; status: string | null; payment_status: string; client_reference_id: string | null;
  metadata: Record<string, string> | null; subscription: string | StripeSubscription | null;
};

export type CheckoutResult =
  | { kind: "plan"; plan: PaidPlanId; label: string; credits: number; interval: BillingInterval; billingStatus: string }
  | { kind: "topup"; pack: TopUpPackId; credits: number; added: boolean };

/** Reads a finished Stripe checkout and applies it to this account (safe to call more than once). */
export async function completeCheckout(ownerId: string, sessionId: unknown): Promise<CheckoutResult> {
  assertTestStripeKey(process.env.STRIPE_SECRET_KEY);
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) throw new BillingError("That payment couldn't be found.", 404);
  const session = await stripeRequest<StripeCheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`, { expand: ["subscription"] });
  if (session.client_reference_id !== ownerId || (session.metadata?.owner_id && session.metadata.owner_id !== ownerId)) {
    throw new BillingError("That payment belongs to a different account.", 403);
  }
  if (session.status === "expired") throw new BillingError("That payment page expired. No payment was made.", 409);
  if (session.status !== "complete") throw new BillingError("That payment isn't finished yet.", 409);
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    throw new BillingError("Your payment is still being processed. Check again in a few minutes.", 409);
  }
  const kind = session.metadata?.kind;
  if (kind === "plan" && session.mode === "subscription" && session.subscription) {
    const subscription = typeof session.subscription === "string"
      ? await stripeRequest<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(session.subscription)}`)
      : session.subscription;
    const applied = applyFromSubscription(ownerId, subscription);
    if (!applied) throw new BillingError("That plan couldn't be read. Try again in a moment.", 502);
    return {
      kind: "plan", plan: applied.plan, label: ACCOUNT_PLANS[applied.plan].label, credits: ACCOUNT_PLANS[applied.plan].credits,
      interval: applied.interval, billingStatus: applied.status,
    };
  }
  if (kind === "topup" && session.mode === "payment") {
    const pack = TOP_UP_PACKS.find((entry) => entry.id === session.metadata?.pack);
    if (!pack) throw new BillingError("That credit pack couldn't be read.", 502);
    const added = addTopUpCredits(ownerId, pack.credits, session.id);
    return { kind: "topup", pack: pack.id, credits: pack.credits, added };
  }
  throw new BillingError("That payment couldn't be read.", 400);
}
