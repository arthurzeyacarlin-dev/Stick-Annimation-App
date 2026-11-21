// Arthur, Nov 20: "Everything should be in credits." Every AI cost on every screen is a number of credits (1 credit = 1 cent of
// real AI cost inside the app). This file only turns a count into words; nothing here is money.

/** "470 credits", "1 credit", "1,200 credits", "−6 credits". */
export function creditsText(credits: number): string {
  const whole = Math.round(credits);
  const size = Math.abs(whole);
  return `${whole < 0 ? "−" : ""}${size.toLocaleString("en-US")} ${size === 1 ? "credit" : "credits"}`;
}

/** Dollars for a price in cents: "$9.99", "$0.59", "$1,200.00". Only for real payments (Stripe), never for AI use. */
export function dollarsText(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(Math.round(cents)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
