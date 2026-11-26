"use client";

import { useEffect, useState } from "react";
import { OPEN_BETA_CODE } from "@/src/lib/account/salesCopy";
import { normalizeCode, type ShownOffer } from "@/src/lib/account/offerDisplay";
import { getConfiguredAccountDataOwner, readAccountJson, writeAccountJson } from "@/src/lib/account/accountDataClient";

// SPEC-0031: a link like /plans?code=FIRSTDIAMOND (or any page with ?code=) keeps the code in this browser, through sign-up,
// until it is used or replaced. The server says which offer it is (the payment checks it again, exactly as before).
// Dad, Nov 26: a real code is also kept ON THE ACCOUNT (its preferences), so the beta price follows the person to any device.
const KEY = "diamond.offerCode";
const ACCOUNT_KEY = "offer-code";
export const OFFER_CODE_EVENT = "diamond-offer-code-changed";

export function readSavedCode(): string {
  try { return normalizeCode(window.localStorage.getItem(KEY)); } catch { return ""; }
}
/** Keeps a code in this browser; tells the other parts of the page only when it really changed (never a loop). */
export function saveCode(code: string) {
  const clean = normalizeCode(code).slice(0, 40);
  if (clean === readSavedCode()) return;
  try { if (clean) window.localStorage.setItem(KEY, clean); else window.localStorage.removeItem(KEY); } catch { /* this page only */ }
  window.dispatchEvent(new Event(OFFER_CODE_EVENT));
}

/** Takes ?code= from the address (and removes it from the address bar). Returns the code it found. */
export function catchCodeFromAddress(): string {
  const params = new URLSearchParams(window.location.search);
  const code = normalizeCode(params.get("code"));
  if (!code) return "";
  params.delete("code");   // the address is cleaned FIRST, so the save below can never find the code there again
  const query = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  saveCode(code);
  return code;
}

export type SavedOffer = { code: string; offer: ShownOffer } | null;

/** The saved code and which offer it is (null while unknown, or when the code isn't a real one). `signedIn` = may ask the server. */
export function useSavedOffer(signedIn = true): { saved: SavedOffer; code: string } {
  const [code, setCode] = useState("");
  useEffect(() => {
    const read = () => setCode(catchCodeFromAddress() || readSavedCode() || normalizeCode(OPEN_BETA_CODE));
    const first = window.setTimeout(read, 0);
    window.addEventListener(OFFER_CODE_EVENT, read);
    return () => { window.clearTimeout(first); window.removeEventListener(OFFER_CODE_EVENT, read); };
  }, []);
  // nothing in this browser: the code kept on the account (signed in only)
  useEffect(() => {
    if (!signedIn || code || !getConfiguredAccountDataOwner()) return;
    let alive = true;
    readAccountJson<{ code?: unknown }>("preferences", ACCOUNT_KEY)
      .then((record) => { const kept = normalizeCode(record?.value?.code); if (alive && kept) saveCode(kept); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [signedIn, code]);
  const offer = useCodeCheck(signedIn ? code : "");
  // a real code is kept on the account too (once per code)
  useEffect(() => {
    if (!offer || !code || !getConfiguredAccountDataOwner()) return;
    void readAccountJson<{ code?: unknown }>("preferences", ACCOUNT_KEY)
      .then((record) => (normalizeCode(record?.value?.code) === code ? undefined
        : writeAccountJson("preferences", ACCOUNT_KEY, { schema: "offer-code/v1", code }, record?.revision ?? 0)))
      .catch(() => undefined);
  }, [offer, code]);
  return { saved: offer ? { code, offer } : null, code };
}

/** Which offer a code typed in a box is (checked by the server a moment after typing stops); null = none or not a real code. */
export function useCodeCheck(code: string): ShownOffer | null {
  const [offer, setOffer] = useState<{ code: string; offer: ShownOffer | null }>({ code: "", offer: null });
  const clean = normalizeCode(code);
  useEffect(() => {
    if (!clean) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/account/billing/code?code=${encodeURIComponent(clean)}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { offer?: unknown } | null) => {
          if (alive) setOffer({ code: clean, offer: body?.offer === "first50" || body?.offer === "youtube" ? body.offer : null });
        })
        .catch(() => undefined);
    }, 350);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [clean]);
  return clean && offer.code === clean ? offer.offer : null;
}
