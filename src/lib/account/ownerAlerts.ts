// Money alerts for Arthur and dad (Nov 20). Each alert lands in the owner's in-app problem-report inbox (the bell + /reports),
// sent by "Payments check", so nobody needs a new screen; it is also written to the server log. When real email is on
// (Resend), the same inbox is what gets emailed. Never throws: an alert must never break a payment step.

const recent = new Map<string, number>();

/** Tells the owner something about money. The same `key` is told at most once a day. */
export function ownerAlert(key: string, text: string, now = Date.now()) {
  const last = recent.get(key);
  if (last !== undefined && now - last < 24 * 60 * 60 * 1000) return;
  recent.set(key, now);
  console.warn(`[money alert] ${text}`);
  void (async () => {
    try {
      const { saveProblemReport } = await import("./problemReportStore");
      saveProblemReport({
        userId: "system:payments", userName: "Payments check", userEmail: "payments@diamondanimator.com",
        screen: "account-plans", text: `[Payments check] ${text}`.slice(0, 2000), screenshot: null, appVersion: null,
      }, now);
    } catch { /* the log line above is enough when the inbox can't be reached */ }
  })();
}
