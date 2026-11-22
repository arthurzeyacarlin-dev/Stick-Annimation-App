/* eslint-disable @typescript-eslint/no-explicit-any -- a pretend Stripe for tests: its objects are plain JSON, as Stripe's are */
// A PRETEND STRIPE (tests only, never in the app): the parts of Stripe's API the money system uses, in memory, with Stripe's own
// rules where they matter for money - idempotency keys replay the first answer, an invoice can be paid only once, a refund can
// never be more than what is left, an expired checkout page can never be paid, a declined card leaves the bill open.
// Plus the person's and Stripe's own actions (pay a page, renew, upgrade, refund from the dashboard, dispute).

type Obj = Record<string, any>;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const missing = () => [404, { error: { type: "invalid_request_error", code: "resource_missing" } }] as const;
const bad = (code: string) => [400, { error: { type: "invalid_request_error", code } }] as const;

export class FakeStripe {
  private n = 0;
  customers = new Map<string, Obj>();
  products = new Map<string, Obj>();
  prices = new Map<string, Obj>();
  coupons = new Map<string, Obj>();
  promos = new Map<string, Obj>();
  sessions = new Map<string, Obj>();
  subs = new Map<string, Obj>();
  invoices = new Map<string, Obj>();
  charges = new Map<string, Obj>();
  refunds: Obj[] = [];
  portal: Obj | null = null;
  private idem = new Map<string, { status: number; body: unknown }>();
  /** Stripe can't be reached (every request fails like a network error). */
  down = false;
  /** The person's card works (false = declined). */
  cardWorks = true;
  calls: { method: string; path: string; key: string | null }[] = [];

  private id(prefix: string) { return `${prefix}_${(++this.n).toString().padStart(6, "0")}`; }
  private now() { return Math.floor(Date.now() / 1000); }
  private list(data: Obj[]) { return { object: "list", data, has_more: false }; }

  /** The Stripe "network" the app talks to (globalThis.diamondStripeFetch). */
  fetch = async (url: string, init: RequestInit): Promise<Response> => {
    if (this.down) throw new TypeError("fetch failed");
    const u = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const path = u.pathname.replace(/^\/v1/, "");
    const params = method === "POST" ? new URLSearchParams(String(init.body ?? "")) : u.searchParams;
    const key = (init.headers as Record<string, string> | undefined)?.["Idempotency-Key"] ?? null;
    this.calls.push({ method, path, key });
    if (key && this.idem.has(key)) { const saved = this.idem.get(key)!; return json(saved.status, saved.body); }
    const [status, body] = this.route(method, path, params);
    if (key && status < 500) this.idem.set(key, { status, body });
    return json(status, body);
  };

  private expandList(params: URLSearchParams) { return params.getAll("expand[]"); }

  private subOut(sub: Obj, expand: string[]) {
    const out = structuredClone(sub);
    if (expand.some((e) => e.endsWith("latest_invoice")) && out.latest_invoice) out.latest_invoice = structuredClone(this.invoices.get(out.latest_invoice));
    delete out._coupon; delete out._pendingPrice;
    return out;
  }
  private chargeOut(charge: Obj, expand: string[]) {
    const out = structuredClone(charge);
    if (!expand.some((e) => e.endsWith("dispute")) && out.dispute) out.dispute = out.dispute.id;
    if (!expand.some((e) => e.endsWith("balance_transaction"))) out.balance_transaction = `txn_${charge.id}`;
    return out;
  }

  private route(method: string, path: string, p: URLSearchParams): readonly [number, unknown] {
    const parts = path.split("/").filter(Boolean);
    const [a, b, c] = parts;
    // ---- catalog
    if (a === "prices" && !b && method === "GET") {
      const keys = p.getAll("lookup_keys[]");
      const data = [...this.prices.values()].filter((price) => price.active && keys.includes(price.lookup_key))
        .map((price) => ({ ...price, product: this.products.get(price.product) }));
      return [200, this.list(data)];
    }
    if (a === "prices" && !b && method === "POST") {
      const lookup = p.get("lookup_key");
      const existing = [...this.prices.values()].find((price) => price.lookup_key === lookup);
      if (existing && p.get("transfer_lookup_key") !== "true") return bad("lookup_key_taken");
      if (existing) existing.lookup_key = null;
      const price = {
        id: this.id("price"), object: "price", active: true, currency: p.get("currency"), unit_amount: Number(p.get("unit_amount")),
        lookup_key: lookup, product: p.get("product"), recurring: p.get("recurring[interval]") ? { interval: p.get("recurring[interval]") } : null,
        metadata: { diamond_key: p.get("metadata[diamond_key]") }, nickname: p.get("nickname"),
      };
      this.prices.set(price.id, price);
      return [200, price];
    }
    if (a === "products" && method === "POST") {
      if (b) { const product = this.products.get(b); if (!product) return missing(); product.name = p.get("name") ?? product.name; return [200, product]; }
      const product = { id: this.id("prod"), object: "product", active: true, name: p.get("name"), metadata: { diamond_key: p.get("metadata[diamond_key]") } };
      this.products.set(product.id, product);
      return [200, product];
    }
    // ---- portal
    if (a === "billing_portal" && b === "configurations") {
      if (method === "GET") return [200, this.list(this.portal ? [this.portal] : [])];
      const flat = Object.fromEntries([...p.entries()]);
      this.portal = { id: this.portal?.id ?? this.id("bpc"), flat };
      return [200, this.portal];
    }
    if (a === "billing_portal" && b === "sessions") return [200, { id: this.id("bps"), url: `https://billing.fake/${p.get("customer")}` }];
    // ---- customers
    if (a === "customers" && b === "search") {
      const owner = /metadata\['owner_id'\]:'([^']*)'/.exec(p.get("query") ?? "")?.[1];
      return [200, this.list([...this.customers.values()].filter((customer) => customer.metadata?.owner_id === owner))];
    }
    if (a === "customers" && b && method === "GET") return this.customers.has(b) ? [200, this.customers.get(b)] : missing();
    if (a === "customers" && method === "POST") {
      const customer = { id: this.id("cus"), object: "customer", email: p.get("email"), name: p.get("name"), metadata: { owner_id: p.get("metadata[owner_id]") } };
      this.customers.set(customer.id, customer);
      return [200, customer];
    }
    // ---- subscriptions
    if (a === "subscriptions" && !b && method === "GET") {
      const data = [...this.subs.values()].filter((sub) => sub.customer === p.get("customer") && (p.get("status") === "all" || sub.status === p.get("status")))
        .sort((x, y) => y.created - x.created || (y.id > x.id ? 1 : -1)).map((sub) => this.subOut(sub, this.expandList(p)));
      return [200, this.list(data)];
    }
    if (a === "subscriptions" && b && method === "GET") return this.subs.has(b) ? [200, this.subOut(this.subs.get(b)!, this.expandList(p))] : missing();
    if (a === "subscriptions" && b && method === "DELETE") {
      const sub = this.subs.get(b);
      if (!sub) return missing();
      if (sub.status === "canceled") return bad("subscription_already_canceled");
      sub.status = "canceled"; sub.canceled_at = this.now();
      return [200, this.subOut(sub, [])];
    }
    // ---- invoices
    if (a === "invoices" && !b && method === "GET") {
      const data = [...this.invoices.values()].filter((invoice) => invoice.subscription === p.get("subscription") && (!p.get("status") || invoice.status === p.get("status")))
        .sort((x, y) => y.created - x.created || (y.id > x.id ? 1 : -1));
      return [200, this.list(data.map((invoice) => structuredClone(invoice)))];
    }
    if (a === "invoices" && b && c === "finalize") {
      const invoice = this.invoices.get(b); if (!invoice) return missing();
      if (invoice.status !== "draft") return bad("invoice_not_draft");
      invoice.status = "open"; return [200, invoice];
    }
    if (a === "invoices" && b && c === "pay") {
      const invoice = this.invoices.get(b); if (!invoice) return missing();
      if (invoice.status === "paid") return bad("invoice_already_paid");
      if (invoice.status !== "open") return bad("invoice_not_open");
      return this.tryPay(invoice);
    }
    if (a === "invoices" && b && c === "void") {
      const invoice = this.invoices.get(b); if (!invoice) return missing();
      if (invoice.status !== "open") return bad("invoice_not_open");
      invoice.status = "void"; return [200, invoice];
    }
    // ---- refunds
    if (a === "refunds" && method === "POST") {
      const charge = [...this.charges.values()].find((entry) => entry.payment_intent === p.get("payment_intent"));
      if (!charge) return missing();
      const left = charge.amount - charge.amount_refunded;
      const amount = p.get("amount") ? Number(p.get("amount")) : left;
      if (amount <= 0 || amount > left) return bad("amount_too_large");
      charge.amount_refunded += amount; charge.refunded = charge.amount_refunded === charge.amount;
      const refund = { id: this.id("re"), object: "refund", amount, charge: charge.id, payment_intent: charge.payment_intent, reason: p.get("reason"), metadata: { why: p.get("metadata[why]") } };
      this.refunds.push(refund);
      return [200, refund];
    }
    // ---- checkout pages
    if (a === "checkout" && b === "sessions" && !c && method === "GET") {
      const data = [...this.sessions.values()].filter((session) => session.customer === p.get("customer") && (!p.get("status") || session.status === p.get("status")))
        .sort((x, y) => y.created - x.created || (y.id > x.id ? 1 : -1));
      return [200, this.list(data.map((session) => structuredClone(session)))];
    }
    if (a === "checkout" && b === "sessions" && c && parts[3] === "expire") {
      const session = this.sessions.get(c); if (!session) return missing();
      if (session.status !== "open") return bad("session_not_open");
      session.status = "expired"; session.url = null; return [200, session];
    }
    if (a === "checkout" && b === "sessions" && c && method === "GET") return this.sessions.has(c) ? [200, structuredClone(this.sessions.get(c))] : missing();
    if (a === "checkout" && b === "sessions" && method === "POST") {
      const id = this.id("cs_test");
      const meta = (prefix: string) => Object.fromEntries([...p.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length, -1), v]));
      const session = {
        id, object: "checkout.session", mode: p.get("mode"), status: "open", payment_status: "unpaid", customer: p.get("customer"),
        client_reference_id: p.get("client_reference_id"), metadata: meta("metadata["), subscription_metadata: meta("subscription_data[metadata]["),
        price: p.get("line_items[0][price]"), promotion_code: p.get("discounts[0][promotion_code]"), allow_promotion_codes: p.get("allow_promotion_codes"), payment_method_types: p.getAll("payment_method_types[]"),
        url: `https://checkout.fake/${id}`, created: this.now(), subscription: null, amount_total: null, payment_intent: null,
      };
      this.sessions.set(id, session);
      return [200, session];
    }
    // ---- charges
    if (a === "charges" && !b) {
      const data = [...this.charges.values()].filter((charge) => (p.get("customer") && charge.customer === p.get("customer")) || (p.get("payment_intent") && charge.payment_intent === p.get("payment_intent")))
        .sort((x, y) => y.created - x.created).map((charge) => this.chargeOut(charge, this.expandList(p)));
      return [200, this.list(data)];
    }
    if (a === "charges" && b) return this.charges.has(b) ? [200, this.chargeOut(this.charges.get(b)!, this.expandList(p))] : missing();
    // ---- coupons and codes
    if (a === "coupons" && b) return this.coupons.has(b) ? [200, this.coupons.get(b)] : missing();
    if (a === "coupons" && method === "POST") {
      const coupon = { id: p.get("id"), object: "coupon", percent_off: Number(p.get("percent_off")), duration: p.get("duration"), duration_in_months: p.get("duration_in_months") ? Number(p.get("duration_in_months")) : null };
      this.coupons.set(coupon.id!, coupon);
      return [200, coupon];
    }
    if (a === "promotion_codes" && method === "GET") return [200, this.list([...this.promos.values()].filter((promo) => promo.code === p.get("code")))];
    if (a === "promotion_codes" && method === "POST") {
      const promo = {
        id: this.id("promo"), object: "promotion_code", code: p.get("code"), coupon: this.coupons.get(p.get("coupon")!), active: true,
        max_redemptions: p.get("max_redemptions") ? Number(p.get("max_redemptions")) : null, times_redeemed: 0,
        first_time_transaction: p.get("restrictions[first_time_transaction]") === "true",
      };
      this.promos.set(promo.id, promo);
      return [200, promo];
    }
    return [404, { error: { type: "invalid_request_error", code: "unknown_route", message: `${method} ${path}` } }];
  }

  // ---------- money moving (Stripe's own rules) ----------

  private makeCharge(customer: string, amount: number) {
    const charge = {
      id: this.id("ch"), object: "charge", amount, amount_refunded: 0, refunded: false, customer, payment_intent: this.id("pi"),
      created: this.now(), dispute: null as Obj | null, balance_transaction: { fee: Math.round(amount * 0.029 + 30) },
    };
    this.charges.set(charge.id, charge);
    return charge;
  }
  private tryPay(invoice: Obj): readonly [number, unknown] {
    const sub = this.subs.get(invoice.subscription);
    invoice.attempt_count = (invoice.attempt_count ?? 0) + 1;
    if (!this.cardWorks) { if (sub) sub.status = "past_due"; return [402, { error: { type: "card_error", code: "card_declined" } }]; }
    if (invoice.amount_due > 0) { const charge = this.makeCharge(invoice.customer, invoice.amount_due); invoice.charge = charge.id; invoice.payment_intent = charge.payment_intent; }
    invoice.status = "paid"; invoice.amount_paid = invoice.amount_due;
    if (sub && (sub.status === "past_due" || sub.status === "unpaid")) sub.status = "active";
    return [200, invoice];
  }
  private addInterval(seconds: number, interval: string) {
    const d = new Date(seconds * 1000);
    if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
    else if (interval === "week") return seconds + 7 * 86400;
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return Math.floor(d.getTime() / 1000);
  }
  private invoiceFor(sub: Obj, amount: number, reason: string, start: number, end: number, status: "paid" | "draft" | "open") {
    const invoice: Obj = {
      id: this.id("in"), object: "invoice", customer: sub.customer, subscription: sub.id, billing_reason: reason, created: this.now(),
      status, amount_due: amount, amount_paid: 0, charge: null, payment_intent: null, attempt_count: 0, lines: { data: [{ period: { start, end } }] },
    };
    this.invoices.set(invoice.id, invoice);
    if (status === "paid") { invoice.status = "open"; this.tryPay(invoice); }
    sub.latest_invoice = invoice.id;
    return invoice;
  }
  private discounted(sub: Obj, unit: number) {
    const coupon = sub._coupon;
    if (!coupon || coupon.left <= 0) return unit;
    coupon.left--;
    return unit - Math.round((unit * coupon.percent_off) / 100);
  }

  /** The person pays a checkout page with their card. An expired or finished page can never be paid. */
  pay(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "open") throw new Error(`checkout page ${sessionId} is ${session?.status ?? "missing"}: it can't be paid`);
    if (!this.cardWorks) throw new Error("card declined on the checkout page (nothing is made)");
    const price = this.prices.get(session.price)!;
    if (session.mode === "subscription") {
      const promo = session.promotion_code ? this.promos.get(session.promotion_code) : null;
      if (promo) {
        if (!promo.active || (promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions)) throw new Error("promotion code used up");
        promo.times_redeemed++;
      }
      const start = this.now(), end = this.addInterval(start, price.recurring.interval);
      const sub: Obj = {
        id: this.id("sub"), object: "subscription", status: "active", created: start, customer: session.customer, cancel_at_period_end: false, cancel_at: null,
        current_period_start: start, current_period_end: end, metadata: session.subscription_metadata, latest_invoice: null,
        items: { data: [{ price: structuredClone(price) }] },
        _coupon: promo ? { percent_off: promo.coupon.percent_off, left: promo.coupon.duration === "once" ? 1 : promo.coupon.duration_in_months ?? 1 } : null,
      };
      this.subs.set(sub.id, sub);
      const invoice = this.invoiceFor(sub, this.discounted(sub, price.unit_amount), "subscription_create", start, end, "paid");
      Object.assign(session, { status: "complete", payment_status: "paid", subscription: sub.id, amount_total: invoice.amount_paid, url: null });
      return { sub, invoice };
    }
    const charge = this.makeCharge(session.customer, price.unit_amount);
    Object.assign(session, { status: "complete", payment_status: "paid", amount_total: price.unit_amount, payment_intent: charge.payment_intent, url: null });
    return { charge };
  }

  /** A second plan that got paid anyway (two checkout pages paid before the app could close one). */
  paidSecondPlan(customer: string, priceId: string) {
    const price = this.prices.get(priceId)!;
    const start = this.now() + 1, end = this.addInterval(start, price.recurring.interval);
    const sub: Obj = {
      id: this.id("sub"), object: "subscription", status: "active", created: start, customer, cancel_at_period_end: false, cancel_at: null,
      current_period_start: start, current_period_end: end, metadata: {}, latest_invoice: null, items: { data: [{ price: structuredClone(price) }] }, _coupon: null,
    };
    this.subs.set(sub.id, sub);
    const invoice = this.invoiceFor(sub, price.unit_amount, "subscription_create", start, end, "paid");
    return { sub, invoice };
  }

  /** The period ends: Stripe starts the next one and makes its bill (a draft, charged by Stripe about an hour later). */
  renew(subId: string) {
    const sub = this.subs.get(subId)!;
    if (sub.cancel_at_period_end) { sub.status = "canceled"; return null; }
    if (sub._pendingPrice) { sub.items.data[0].price = structuredClone(this.prices.get(sub._pendingPrice)); delete sub._pendingPrice; }
    const start = sub.current_period_end, end = this.addInterval(start, sub.items.data[0].price.recurring.interval);
    sub.current_period_start = start; sub.current_period_end = end;
    return this.invoiceFor(sub, this.discounted(sub, sub.items.data[0].price.unit_amount), "subscription_cycle", start, end, "draft");
  }
  /** Stripe's own try (an hour after the renewal, or a retry). */
  stripeTries(invoiceId: string) {
    const invoice = this.invoices.get(invoiceId)!;
    if (invoice.status === "draft") invoice.status = "open";
    return this.tryPay(invoice);
  }
  /** Manage plan: an upgrade, charged at once for the difference ("always_invoice"). */
  upgrade(subId: string, priceId: string) {
    const sub = this.subs.get(subId)!, old = sub.items.data[0].price.unit_amount, price = this.prices.get(priceId)!;
    sub.items.data[0].price = structuredClone(price);
    return this.invoiceFor(sub, Math.max(0, price.unit_amount - old), "subscription_update", this.now(), sub.current_period_end, "paid");
  }
  /** Manage plan: a downgrade, scheduled for the end of the paid period. */
  downgradeAtPeriodEnd(subId: string, priceId: string) { this.subs.get(subId)!._pendingPrice = priceId; }
  cancelAtPeriodEnd(subId: string) { this.subs.get(subId)!.cancel_at_period_end = true; }
  /** Dad refunds from the Stripe dashboard. */
  dashboardRefund(chargeId: string, amount?: number) {
    const charge = this.charges.get(chargeId)!;
    const cents = amount ?? charge.amount - charge.amount_refunded;
    charge.amount_refunded += cents; charge.refunded = charge.amount_refunded === charge.amount;
    this.refunds.push({ id: this.id("re"), amount: cents, charge: chargeId, payment_intent: charge.payment_intent, reason: "dashboard" });
  }
  /** The person's bank opens a dispute. */
  dispute(chargeId: string, status = "needs_response") { this.charges.get(chargeId)!.dispute = { id: this.id("dp"), status }; }

  liveSubs(customer: string) { return [...this.subs.values()].filter((sub) => sub.customer === customer && sub.status !== "canceled"); }
}
