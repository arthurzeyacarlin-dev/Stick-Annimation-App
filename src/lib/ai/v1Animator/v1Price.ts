// THE AI ANIMATOR'S PRICE (Nov 20, dad's credits plan): what the gate card shows, what is held while the run is made, and
// exactly what is charged when it is done - never more. 1 credit = 1 cent of real AI cost (plans.ts CREDIT_RATES).
// Plain numbers in, credits out: nothing here reads or changes how an animation is made.
import { AI_ACTION_CREDITS, CREDIT_RATES, type AiActionKind } from "../../account/plans.ts";

export type V1Price = { credits: number; kind: Extract<AiActionKind, "animation" | "addon" | "edit" | "look"> };

export type V1PriceInput = {
  /** A new animation: the seconds of ALL its steps (every part of a long story). */
  newSeconds?: number;
  /** An edit: the seconds H3 makes again (changed moves, and looks H3 draws into a step's words). */
  remadeSeconds?: number;
  /** An edit that adds steps at the end (an add-on / the next part). */
  added?: boolean;
  /** Looks put on the saved pictures without animating: how many fill/erase looks and how many redraw/reshape looks. */
  fillLooks?: number;
  redrawLooks?: number;
  /** The whole animation's length (a look runs over every picture that shows the thing). */
  animationSeconds?: number;
  /** A new line or head style = the animator makes the whole animation again as a new take. */
  newTake?: boolean;
  /** An edit that only removes steps (a 1-second join). */
  removeOnly?: boolean;
  /** One chat turn is part of the price, except for a long story's own next-part turns (the story paid it once). */
  chat?: boolean;
};

const seconds = (value: number | undefined) => Math.max(0, Number(value) || 0);

/** The credits of one AI Animator run, and which line of the AI Dashboard it goes on. */
export function priceOf(input: V1PriceInput): V1Price {
  const rate = CREDIT_RATES.perSecond;
  const chat = input.chat === false ? 0 : AI_ACTION_CREDITS.chat;
  if (input.newSeconds !== undefined) {
    return { credits: Math.ceil(rate * (seconds(input.newSeconds) + CREDIT_RATES.sceneSeconds) + chat), kind: "animation" };
  }
  const length = seconds(input.animationSeconds);
  // a new take makes the whole animation again, scene clip included: a new animation's price
  const remade = input.newTake ? Math.max(length, seconds(input.remadeSeconds)) + CREDIT_RATES.sceneSeconds : seconds(input.remadeSeconds);
  const looks = (input.fillLooks ?? 0) * CREDIT_RATES.fillPerSecond * length + (input.redrawLooks ?? 0) * CREDIT_RATES.redrawPerSecond * length;
  const join = input.removeOnly && remade === 0 ? rate : 0;
  const credits = Math.ceil(rate * remade + looks + join + chat);
  const kind: V1Price["kind"] = input.added ? "addon" : remade === 0 && join === 0 && looks >= 0 && !input.removeOnly ? "look" : "edit";
  return { credits, kind };
}

/** The part of a long story's ONE price that its later parts may still use (the first card's price, minus what was made). */
export const storyLeftAfter = (whole: V1Price, first: V1Price) => Math.max(0, whole.credits - first.credits);
