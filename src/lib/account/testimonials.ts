// SPEC-0029 (dad, Nov 26: "testimonials are a huge part of the success of this company"): the rules for testimonials,
// shared by the ask (browser) and the server. Plain logic only, so it can be tested on its own:
//   node --test src/lib/account/testimonials.test.ts
//
// THE KIDS RULE (COPPA): a testimonial may be featured (website Wall of Love, ads) ONLY when the person ticked
// "I'm 13 or older, and Diamond Animator may show my words, first name and photo", gave 4 or 5 stars, and the owner
// approved it. Everything else is private: the owner can read it, it is never exported or shown, and it is deleted with
// the account. We never ask anyone's age or birthday; the tick is the only signal.

export const TESTIMONIAL_TEXT_MAX = 280;
/** How many times the ask may be closed or skipped before it never comes back. */
export const TESTIMONIAL_MAX_SKIPS = 2;
/** Stars needed before a testimonial can be featured (and before the photo nudge is shown). */
export const TESTIMONIAL_FEATURE_MIN_STARS = 4;
export const TESTIMONIAL_RATE_LIMIT = 5;
export const TESTIMONIAL_RATE_WINDOW_MS = 60 * 60 * 1000;
/** The exact words of the one box (the consent). Saved with every answer, so it is clear what was agreed to. */
export const TESTIMONIAL_CONSENT_WORDS = "I'm 13 or older, and Diamond Animator may show my words, first name and photo on its website and ads.";

/** Nov 26 (dad: "Yeah, 30 free credits is fine"): THE THANK-YOU. Every answer gets the same credits, 1 star or 5 stars, featured
 *  or private (US FTC rule on reviews: a reward may never depend on the rating or on agreeing to be featured). Once per
 *  account, paid in the same save as the answer. Only for an account the ask was really shown to (asked through the normal
 *  card, and the account has made at least one AI animation on the server, so a script can't farm it). Taking the testimonial
 *  back later keeps the credits. They are free credits: never refunded as money. */
export const TESTIMONIAL_THANK_YOU_CREDITS = 30;
/** Said on the ask BEFORE they answer. */
export const TESTIMONIAL_THANK_YOU_LINE = `As a thank-you for your time, you get ${TESTIMONIAL_THANK_YOU_CREDITS} free credits, whatever you rate us.`;
/** Shown with every featured testimonial whose writer got the credits (the wall, the plans page, anything exported for ads). */
export const TESTIMONIAL_DISCLOSURE = `Got ${TESTIMONIAL_THANK_YOU_CREDITS} free credits for leaving a review`;
/** Written into the export, so whoever makes the website wall or an ad keeps the note. */
export const TESTIMONIAL_DISCLOSURE_RULE = "Every entry with a \"disclosure\" must show that note next to the quote wherever it is used (website, checkout, ads). The person got free credits for leaving a review, whatever they rated (US FTC rule on reviews).";
/** The one-time record of the thank-you in the credits database (one per account). */
export const testimonialThankYouEvent = (userId: string) => `testimonial-thanks:${userId}`;
/** The note for one testimonial: only when the person really got the credits (older answers got nothing, so no note). */
export const testimonialDisclosure = (t: { creditsGiven: number }) => (t.creditsGiven > 0 ? TESTIMONIAL_DISCLOSURE : null);

export type TestimonialWhere = "animation" | "export";
export type TestimonialStatus = "new" | "approved" | "hidden";
export const isTestimonialWhere = (value: unknown): value is TestimonialWhere => value === "animation" || value === "export";
export const isTestimonialStatus = (value: unknown): value is TestimonialStatus => value === "new" || value === "approved" || value === "hidden";
/** Testimonial ids look like "tm_" + 32 letters/numbers. */
export const isTestimonialId = (value: unknown): value is string => typeof value === "string" && /^tm_[a-z0-9]{32}$/.test(value);

/** What the server remembers per account about the ask. */
export type TestimonialAskState = { skips: number; answered: boolean; exportSeen: boolean };

/** Should the ask be shown now? Never again once answered or skipped twice; at an export only once ever. */
export function shouldAskTestimonial(state: TestimonialAskState | null, where: TestimonialWhere): boolean {
  const s = state ?? { skips: 0, answered: false, exportSeen: false };
  if (s.answered || s.skips >= TESTIMONIAL_MAX_SKIPS) return false;
  return where === "animation" || !s.exportSeen;
}

/** May this account answer now (the ask was due through the normal card)? Not after an answer or two skips. The export ask
 *  marks itself "seen" the moment it is on screen, so at Send only this is checked. */
export function canAnswerTestimonial(state: TestimonialAskState | null): boolean {
  return shouldAskTestimonial(state, "animation");
}

export type TestimonialInput = { stars: number; text: string; featureOk: boolean; where: TestimonialWhere };
export type TestimonialCheck = { ok: true; value: TestimonialInput } | { ok: false; message: string };

/** Keeps one line of plain words: no invisible control characters, single spaces, trimmed. */
export const cleanTestimonialText = (value: string) =>
  value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** Checks what the ask sent. Messages are plain words (shown to the person as they are). */
export function checkTestimonialInput(body: unknown): TestimonialCheck {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "That couldn't be read. Try again." };
  const { stars, text, featureOk, where } = body as Record<string, unknown>;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, message: "Pick 1 to 5 stars." };
  if (text !== undefined && text !== null && typeof text !== "string") return { ok: false, message: "That couldn't be read. Try again." };
  const cleaned = typeof text === "string" ? cleanTestimonialText(text) : "";
  if (Array.from(cleaned).length > TESTIMONIAL_TEXT_MAX) return { ok: false, message: `Please keep it under ${TESTIMONIAL_TEXT_MAX} characters.` };
  if (!isTestimonialWhere(where)) return { ok: false, message: "That couldn't be read. Try again." };
  return { ok: true, value: { stars, text: cleaned, featureOk: featureOk === true, where } };
}

/** May this testimonial ever be featured? (the kids rule above, without the owner's approval) */
export const canBeFeatured = (t: { stars: number; featureOk: boolean; text: string }) =>
  t.featureOk && t.stars >= TESTIMONIAL_FEATURE_MIN_STARS && t.text.length > 0;

/** Is it in the Wall of Love export? Featurable AND approved by the owner. */
export const isExported = (t: { stars: number; featureOk: boolean; text: string; status: TestimonialStatus }) =>
  t.status === "approved" && canBeFeatured(t);

/** The name shown on the wall: first name + last initial ("Maya Rodriguez" -> "Maya R."). An email is never shown. */
export function testimonialDisplayName(name: unknown): string {
  const clean = typeof name === "string" ? cleanTestimonialText(name) : "";
  if (!clean || clean.includes("@")) return "A Diamond Animator user";
  const words = clean.split(" ");
  const first = Array.from(words[0]).slice(0, 30).join("");
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return last ? `${first} ${last.toUpperCase()}.` : first;
}

/** The owner's edit of the shown name: plain words, 1 to 40 letters, never an email. */
export function checkDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = cleanTestimonialText(value);
  return clean && Array.from(clean).length <= 40 && !clean.includes("@") ? clean : null;
}

/** Should the "Add a photo" nudge follow this answer? Only for a featurable testimonial from someone with no photo. */
export const wantsPhotoNudge = (t: { stars: number; featureOk: boolean; text: string }, hasPhoto: boolean) =>
  !hasPhoto && t.featureOk && t.stars >= TESTIMONIAL_FEATURE_MIN_STARS;

/** At most 5 answers/skips per hour per account (simple abuse guard). */
export const testimonialRateOk = (recent: readonly number[], now = Date.now()) =>
  recent.filter((time) => time > now - TESTIMONIAL_RATE_WINDOW_MS && time <= now).length < TESTIMONIAL_RATE_LIMIT;

/** What the owner page shows for one testimonial. */
export type TestimonialSummary = {
  id: string;
  createdAt: number;
  userId: string;
  userName: string;
  userEmail: string;
  stars: number;
  text: string;
  featureOk: boolean;
  where: TestimonialWhere;
  status: TestimonialStatus;
  displayName: string;
  usePhoto: boolean;
  featurable: boolean;
  /** Free credits given as the thank-you (0 for answers from before Nov 26). */
  creditsGiven: number;
};

/** One entry of testimonials.json in the Wall of Love export. */
export type WallOfLoveEntry = { id: string; name: string; stars: number; quote: string; date: string; photo: string | null; disclosure: string | null };
