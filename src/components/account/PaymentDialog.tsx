"use client";

import { useEffect, useRef, useState } from "react";
import { ACCOUNT_PLANS, CYCLE_WORD, TOP_UP_PACKS, type BillingInterval, type PaidPlanId, type TopUpPackId } from "@/src/lib/account/plans";
import { creditsText, dollarsText } from "@/src/lib/account/credits";
import { postBilling, useBillingInfo } from "./billingClient";
import styles from "./PaymentDialog.module.css";

// Nov 21 (Arthur: "I don't want it to pop up Stripe ever again... Instead of typing to Stripe, they type in my app"):
// every card is typed HERE, in Diamond Animator's own dialog. The three card boxes are the payment company's secure fields (the
// card number goes straight to them and never reaches Diamond Animator), drawn in the app's own colors, font and borders.
// Nothing here names the payment company.

export type PaymentFor =
  | { kind: "plan"; plan: PaidPlanId; interval: BillingInterval; codes?: { first50?: string; youtube?: string } }
  | { kind: "pack"; pack: TopUpPackId }
  | { kind: "card" };

type Start = { clientSecret: string | null; intent: "payment" | "setup"; ref: string; amountCents: number; savedCard: { brand: string; last4: string } | null };   // (Nov 22) the saved card's id never comes to the browser
type PlanDone = { status: { kind: string; label?: string; credits: number; waitingForPayment?: boolean; arriving?: boolean; added?: boolean } };

// The same start asked twice at once (the page drawing twice, a double click) shares ONE answer, so it is one payment.
const starts = new Map<string, Promise<Start>>();
function startOnce(key: string, ask: () => Promise<Start>): Promise<Start> {
  const running = starts.get(key);
  if (running) return running;
  const made = ask();
  starts.set(key, made);
  window.setTimeout(() => { if (starts.get(key) === made) starts.delete(key); }, 5000);
  return made;
}

// ---------- the payment company's browser script (loaded once, only when a card dialog opens) ----------
type CardField = { mount: (element: HTMLElement) => void; destroy: () => void; on: (event: string, handler: (detail: { complete?: boolean; error?: { message?: string } }) => void) => void };
type Fields = { create: (type: "cardNumber" | "cardExpiry" | "cardCvc", options: Record<string, unknown>) => CardField };
type ConfirmResult = { error?: { message?: string }; paymentIntent?: { status: string }; setupIntent?: { status: string } };
type CardScript = {
  elements: (options: Record<string, unknown>) => Fields;
  confirmCardPayment: (secret: string, data: Record<string, unknown>) => Promise<ConfirmResult>;
  confirmCardSetup: (secret: string, data: Record<string, unknown>) => Promise<ConfirmResult>;
};
declare global { interface Window { Stripe?: (key: string) => CardScript } }
let scriptLoad: Promise<void> | null = null;
function loadCardScript(): Promise<void> {
  if (window.Stripe) return Promise.resolve();
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://js.stripe.com/v3/";
    tag.async = true;
    tag.onload = () => (window.Stripe ? resolve() : reject(new Error("load")));
    tag.onerror = () => { scriptLoad = null; reject(new Error("load")); };
    document.head.appendChild(tag);
  });
  return scriptLoad;
}

// The card boxes in Diamond Animator's look (the same white text, gray hints, Geist and red errors as every other field).
const FIELD_STYLE = {
  base: { color: "#f5f5f6", fontFamily: "Geist, system-ui, -apple-system, sans-serif", fontSize: "15px", fontWeight: "500", iconColor: "#a3a3ab",
    "::placeholder": { color: "#85858e" }, ":-webkit-autofill": { color: "#f5f5f6" } },
  invalid: { color: "#ff8a95", iconColor: "#ff8a95" },
};

const nextPaymentDay = (interval: BillingInterval) => {
  const date = new Date();
  if (interval === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else if (interval === "week") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
};

// (Nov 22, Fable's money check) after a real payment: one more fresh check with the payment company a few seconds later, and every
// credits counter reads again - a plan or pack that was a moment behind shows without waiting for the minute's check
function checkAgainSoon() {
  window.setTimeout(() => {
    void fetch("/api/account/plan?fresh=1", { cache: "no-store" }).catch(() => undefined)
      .finally(() => window.dispatchEvent(new Event("diamond-account-plan-changed")));
  }, 5000);
}

export function PaymentDialog({ payFor, onClose: close, onDone: done }: { payFor: PaymentFor; onClose: () => void; onDone: (words: string) => void }) {
  const billing = useBillingInfo();
  const [start, setStart] = useState<Start | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [useSaved, setUseSaved] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");   // (Nov 22) paying with the saved card needs the account's password
  // (Nov 22, Fable's money check) once the money really moved, this dialog never pays again and never says "nothing was charged"
  const paidRef = useRef(false);
  const [paid, setPaid] = useState(false);
  const onClose = () => { if (paidRef.current) checkAgainSoon(); close(); };
  const onDone = (words: string) => { if (paidRef.current) checkAgainSoon(); done(words); };
  const [ready, setReady] = useState({ number: false, expiry: false, cvc: false });
  const [focus, setFocus] = useState<"number" | "expiry" | "cvc" | null>(null);
  const numberRef = useRef<HTMLDivElement | null>(null);
  const expiryRef = useRef<HTMLDivElement | null>(null);
  const cvcRef = useRef<HTMLDivElement | null>(null);
  const cardScript = useRef<CardScript | null>(null);
  const numberField = useRef<CardField | null>(null);

  // 1. Ask the app's server to make the payment (nothing is charged until the person presses Pay).
  const startKey = JSON.stringify(payFor);
  useEffect(() => {
    let alive = true;
    const body = payFor.kind === "plan" ? { step: "start", kind: "plan", plan: payFor.plan, interval: payFor.interval, codes: payFor.codes }
      : payFor.kind === "pack" ? { step: "start", kind: "pack", pack: payFor.pack } : { step: "start", kind: "card" };
    startOnce(startKey, () => postBilling<Start>("/api/account/billing/pay", body))
      .then((result) => { if (alive) { setStart(result); setUseSaved(Boolean(result.savedCard)); } })
      .catch((error: unknown) => { if (alive) setProblem(error instanceof Error ? error.message : "Payment couldn't start. Nothing was charged. Try again."); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startKey is payFor's content
  }, [startKey]);

  // 2. The card boxes, in the app's look (only when a new card is typed).
  const showCardBoxes = Boolean(start) && !(useSaved && start?.savedCard);
  useEffect(() => {
    if (!showCardBoxes || !billing.cardKey) return;
    let alive = true;
    const made: CardField[] = [];
    loadCardScript().then(() => {
      if (!alive || !window.Stripe || !numberRef.current || !expiryRef.current || !cvcRef.current) return;
      cardScript.current = window.Stripe(billing.cardKey!);
      const fields = cardScript.current.elements({ fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" }], locale: "en" });
      const make = (type: "cardNumber" | "cardExpiry" | "cardCvc", element: HTMLDivElement, key: "number" | "expiry" | "cvc", placeholder?: string) => {
        const field = fields.create(type, { style: FIELD_STYLE, ...(placeholder ? { placeholder } : {}), ...(type === "cardNumber" ? { showIcon: true, disableLink: true } : {}) });
        field.mount(element);
        field.on("change", (detail) => { setReady((now) => ({ ...now, [key]: Boolean(detail.complete) })); if (detail.error?.message) setProblem(detail.error.message); else setProblem(null); });
        field.on("focus", () => setFocus(key));
        field.on("blur", () => setFocus((now) => (now === key ? null : now)));
        made.push(field);
        return field;
      };
      numberField.current = make("cardNumber", numberRef.current, "number", "1234 1234 1234 1234");
      make("cardExpiry", expiryRef.current, "expiry", "MM / YY");
      make("cardCvc", cvcRef.current, "cvc", "123");
    }).catch(() => { if (alive) setProblem("The card form couldn't load. Check your internet connection and try again. Nothing was charged."); });
    return () => { alive = false; for (const field of made) field.destroy(); numberField.current = null; };
  }, [showCardBoxes, billing.cardKey]);

  // 3. Pay (or save the card), then let the app's server check what really happened.
  const pay = async () => {
    if (!start || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (start.clientSecret && !paidRef.current) {
        await loadCardScript();
        cardScript.current ??= window.Stripe ? window.Stripe(billing.cardKey!) : null;
        if (!cardScript.current) throw new Error("The card form couldn't load. Nothing was charged. Try again.");
        if (useSaved && start.savedCard && payFor.kind !== "card") {
          // (Nov 22, Arthur: "there needs to be a verification ... a stranger or a baby that tops up 15 times") the saved card is charged by
          // the app's server, and only after it checked the password; when the bank asks (3-D Secure) the card form finishes it here
          const saved = await postBilling<{ status: string; clientSecret: string | null }>("/api/account/billing/pay", { step: "saved", kind: payFor.kind, ref: start.ref, password });
          if (saved.status === "requires_action" && saved.clientSecret) {
            const bank = await cardScript.current.confirmCardPayment(saved.clientSecret, {});
            if (bank.error) throw new Error(`${bank.error.message ?? "Your bank didn't confirm the payment."} Nothing was charged.`);
          } else if (saved.status !== "succeeded" && saved.status !== "processing") throw new Error("Your card wasn't accepted. Nothing was charged. Try a different card.");
        } else {
          const card = { card: numberField.current, billing_details: { name: name.trim() || undefined } };
          const result = start.intent === "setup"
            ? await cardScript.current.confirmCardSetup(start.clientSecret, { payment_method: card })
            : await cardScript.current.confirmCardPayment(start.clientSecret, { payment_method: card });
          if (result.error) throw new Error(`${result.error.message ?? "Your card wasn't accepted."} Nothing was charged.`);
        }
        paidRef.current = true;
        setPaid(true);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That didn't go through. Nothing was charged. Try again.");
      setBusy(false);
      return;
    }
    // the money moved (or nothing had to be paid): the app's server says what arrived - asked again on a hiccup, never paid again
    for (let attempt = 0; ; attempt++) {
      try {
        if (payFor.kind === "plan") {
          const { status } = await postBilling<PlanDone>("/api/account/billing/pay", { step: "done", kind: "plan", ref: start.ref });
          onDone(status.arriving ? `Your payment went through! You're on ${status.label}, and your ${creditsText(status.credits)} arrive within a minute.`
            : status.waitingForPayment ? `You're on ${status.label}! Your ${creditsText(status.credits)} come the moment your payment goes through.`
            : `You're on ${status.label}! ${creditsText(status.credits)} are ready.`);
        } else if (payFor.kind === "pack") {
          const { status } = await postBilling<PlanDone>("/api/account/billing/pay", { step: "done", kind: "pack", ref: start.ref });
          onDone(status.arriving ? `Your payment went through! Your ${creditsText(status.credits)} arrive within a minute. They never expire.` : `${creditsText(status.credits)} added. They never expire.`);
        } else {
          const result = await postBilling<{ paymentProblem: boolean }>("/api/account/billing/pay", { step: "done", kind: "card", ref: start.ref });
          onDone(result.paymentProblem ? "Your new card is saved, but the payment still didn't go through. Try another card." : "Your new card is saved. Every payment uses it from now on.");
        }
        return;
      } catch (error) {
        if (paidRef.current && attempt < 2) { await new Promise((done) => window.setTimeout(done, 2000)); continue; }
        setProblem(paidRef.current
          ? "Your payment went through. Your credits will show within a minute - please don't pay again. If they don't show, reload the page."
          : error instanceof Error ? error.message : "That didn't go through. Nothing was charged. Try again.");
        setBusy(false);
        return;
      }
    }
  };

  const title = payFor.kind === "plan" ? `Pay for ${ACCOUNT_PLANS[payFor.plan].label}`
    : payFor.kind === "pack" ? `Buy ${creditsText(TOP_UP_PACKS.find((pack) => pack.id === payFor.pack)?.credits ?? 0)}` : "Change your card";
  const typedReady = ready.number && ready.expiry && ready.cvc;
  const usingSaved = Boolean(useSaved && start?.savedCard && payFor.kind !== "card");
  const canSubmit = Boolean(start) && !busy && Boolean(billing.cardKey) && (paid || (usingSaved ? password.length > 0 : typedReady));
  const amount = start ? dollarsText(start.amountCents) : "";
  const label = busy ? (paid ? "Checking" : payFor.kind === "card" ? "Saving" : "Paying")
    : paid ? "Check again" : payFor.kind === "card" ? "Save card" : start ? `Pay ${amount}` : "Pay";

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="pay-title" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className={styles.dialog}>
        <h2 id="pay-title" className={styles.title}>{title}</h2>

        {payFor.kind === "plan" && <dl className={styles.facts}>
          <div><dt>You get</dt><dd>{creditsText(ACCOUNT_PLANS[payFor.plan].credits)} every {CYCLE_WORD}</dd></div>
          <div><dt>You pay today</dt><dd>{start ? amount : " "}</dd></div>
          <div><dt>Next payment</dt><dd>{nextPaymentDay(payFor.interval)}</dd></div>
        </dl>}
        {payFor.kind === "pack" && <dl className={styles.facts}>
          <div><dt>You get</dt><dd>{creditsText(TOP_UP_PACKS.find((pack) => pack.id === payFor.pack)?.credits ?? 0)}, never expire</dd></div>
          <div><dt>You pay today</dt><dd>{start ? amount : " "}</dd></div>
        </dl>}
        {payFor.kind === "card" && <p className={styles.text}>Your new card is used for every payment from now on. Nothing is charged now.</p>}

        {!start && !problem && <p className={styles.text}>Getting ready</p>}

        {start?.savedCard && payFor.kind !== "card" && <div className={styles.choice} role="radiogroup" aria-label="Which card">
          <button type="button" role="radio" aria-checked={useSaved} className={styles.choiceItem} onClick={() => setUseSaved(true)}>
            <span className={styles.dot} aria-hidden="true" />
            <span>{start.savedCard.brand.charAt(0).toUpperCase() + start.savedCard.brand.slice(1)} ending {start.savedCard.last4}</span>
          </button>
          <button type="button" role="radio" aria-checked={!useSaved} className={styles.choiceItem} onClick={() => setUseSaved(false)}>
            <span className={styles.dot} aria-hidden="true" />
            <span>Use a different card</span>
          </button>
        </div>}

        {usingSaved && <label className={styles.label}>Your Diamond Animator password
          <input className={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" maxLength={256}
            onKeyDown={(event) => { if (event.key === "Enter" && canSubmit) void pay(); }} />
          <span className={styles.hint}>For your safety, paying with your saved card always asks for your password.</span>
        </label>}

        {start && !billing.cardKey && billing.mode !== null && !showCardBoxes && <p className={styles.problem} role="alert">Card payments aren&apos;t set up yet. Nothing was charged.</p>}
        {start && showCardBoxes && (billing.cardKey ? <div className={styles.card}>
          <label className={styles.label}>Card number
            <div ref={numberRef} className={styles.box} data-focus={focus === "number"} />
          </label>
          <div className={styles.row}>
            <label className={styles.label}>Expiry date
              <div ref={expiryRef} className={styles.box} data-focus={focus === "expiry"} />
            </label>
            <label className={styles.label}>Security code
              <div ref={cvcRef} className={styles.box} data-focus={focus === "cvc"} />
            </label>
          </div>
          <label className={styles.label}>Name on card
            <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} autoComplete="cc-name" placeholder="Your name" maxLength={80} />
          </label>
        </div> : <p className={styles.problem} role="alert">Card payments aren&apos;t set up yet. Nothing was charged.</p>)}

        {billing.mode === "test" && <p className={styles.test}>Test mode, no real money: card 4242 4242 4242 4242, any future date, any 3 numbers.</p>}
        {problem && <p className={styles.problem} role="alert">{problem}</p>}

        <div className={styles.buttons}>
          <button type="button" className={styles.primary} disabled={!canSubmit} onClick={() => void pay()}>{label}</button>
          <button type="button" className={styles.plain} disabled={busy} onClick={onClose}>Not now</button>
        </div>
        <p className={styles.secure}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          Your card is encrypted and sent securely. Diamond Animator never sees or stores your card number.
        </p>
      </div>
    </div>
  );
}
