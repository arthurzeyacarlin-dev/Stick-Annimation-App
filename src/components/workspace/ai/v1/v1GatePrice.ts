// (Dad, Nov 26) the plan card's money words, kept apart so they are tested ($0): ONE price = the card's price (planning included) + what
// the first picture adds when animated = exactly what Animate charges. Changing the plan: the first 3 changes are free; after that the
// card says what a change costs BEFORE it is sent. On an edit card: a small fix can be made by hand, for free.
import { creditsText } from "../../../../lib/account/credits.ts";
import { PAID_CHANGE_MAX_CREDITS } from "../../../../lib/account/plans.ts";
import type { V1GatePicture } from "./v1AnimatorController.ts";

export const FREE_FIX_LINE = "Small fix? Click the frame on the timeline and erase or draw it yourself: it's free.";
/** What a change of the plan costs, said BEFORE it is sent. The words of the plan: free (the first FREE_PLAN_CHANGES), then their warm
 *  cost, never above 20. Once the first picture is drawn, a change throws it away and it is charged its real cost (dad, Nov 26, rule d);
 *  the new plan goes back to step 1 (text): a new picture is drawn only when the new text is approved. */
export function changeCostLine(freeChangesLeft: number | undefined, picture?: V1GatePicture): string | null {
  if (freeChangesLeft === undefined) return null;
  const words = freeChangesLeft > 0 ? `Changing the plan is free: ${freeChangesLeft} change${freeChangesLeft === 1 ? "" : "s"} left.`
    : `A change now costs what it really costs, never more than ${creditsText(PAID_CHANGE_MAX_CREDITS)}.`;
  const thrown = picture?.state === "ready" && picture.credits > 0
    ? ` Changing it now throws this picture away: its ${creditsText(picture.credits)} are charged, and you approve the new text plan before a new picture is drawn.` : "";
  return words + thrown;
}

/** (dad, Nov 26 15:57) the 3 steps: TEXT plan -> first picture -> Animate. Step 1 offers the picture (never Animate, when there is a picture
 *  to draw), and says exactly how the picture is paid: its scene is the start of the animation (inside the price); a still of later / new
 *  things is extra, and already counted in the price shown up front. */
export function stepOneWords(picture: V1GatePicture): { button: string; note: string } | null {
  if (picture.state !== "offer" && picture.state !== "drawing") return null;
  const button = picture.state === "drawing" ? "Drawing the first picture" : "Looks right: show me the first picture";
  if (picture.state === "drawing") return { button, note: "The first picture is the start of your animation: it's included in the price above." };
  const extra = Math.max(0, picture.credits - picture.reused);
  const note = extra === 0 ? "The first picture is the start of your animation: it's included in the price above."
    : picture.reused > 0 ? `The first picture is the start of your animation: it's included in the price above (about ${creditsText(extra)} of that price draws the things that come in later).`
      : `The first picture shows the new things before anything moves: its about ${creditsText(extra)} are included in the price above.`;
  return { button, note };
}
/** Step 2, under the drawn picture: what it costs, exactly (all of it is in the Animate price). */
export function pictureReadyNote(picture: V1GatePicture): string | null {
  if (picture.state !== "ready" || picture.credits <= 0) return null;
  const extra = Math.max(0, picture.animateCredits), reused = Math.max(0, picture.credits - extra);
  if (extra === 0) return "It's the start of your animation: it's included in the Animate price, never paid twice.";
  if (reused > 0) return `It's the start of your animation (included in the Animate price, never paid twice). The things that come in later add ${creditsText(extra)}: that's in the Animate price too.`;
  return `It shows the new things: its ${creditsText(extra)} are in the Animate price.`;
}
/** The ONE price: up front in step 1 (with the estimated still of later / new things), exact once the picture is drawn. */
export const animatePrice = (credits: number, picture?: V1GatePicture) => credits + (picture?.state === "ready" ? Math.max(0, picture.animateCredits)
  : picture?.state === "offer" ? Math.max(0, picture.credits - picture.reused) : 0);
