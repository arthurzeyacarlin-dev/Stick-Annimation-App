// (Dad, Nov 26) the plan card's money words, kept apart so they are tested ($0): ONE price = the card's price (planning included) + what
// the first picture adds when animated = exactly what Animate charges. Changing the plan: the first 3 changes are free; after that the
// card says what a change costs BEFORE it is sent. On an edit card: a small fix can be made by hand, for free.
import { creditsText } from "../../../../lib/account/credits.ts";
import { PAID_CHANGE_MAX_CREDITS } from "../../../../lib/account/plans.ts";
import type { V1GatePicture } from "./v1AnimatorController.ts";

export const FREE_FIX_LINE = "Small fix? Click the frame on the timeline and erase or draw it yourself: it's free.";
/** What a change of the plan costs, said BEFORE it is sent: the words are free (the first 3), but a first picture already drawn is
 *  replaced by a change and is charged its real cost (dad, Nov 26, option d) - the exact number, because that picture is already made. */
export function changeCostLine(freeChangesLeft: number | undefined, picture?: V1GatePicture): string | null {
  if (freeChangesLeft === undefined) return null;
  const words = freeChangesLeft > 0 ? `Changing the plan is free: ${freeChangesLeft} change${freeChangesLeft === 1 ? "" : "s"} left.`
    : `A change now costs what it really costs, never more than ${creditsText(PAID_CHANGE_MAX_CREDITS)}.`;
  const replaced = picture?.state === "ready" && picture.credits > 0 ? ` A change draws a new first picture: this one costs ${creditsText(picture.credits)}.` : "";
  return words + replaced;
}
export const animatePrice = (credits: number, picture?: V1GatePicture) => credits + (picture?.state === "ready" ? Math.max(0, picture.animateCredits) : 0);
