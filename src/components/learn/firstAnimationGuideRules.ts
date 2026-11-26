// Dad, Nov 26 14:54 ("Yes, build it"), after his live walkthrough: "after they create their first video, there should be a guide
// that says, hey, check your video... if you need to make edits, this is how you do it... if you want to add on to the scene,
// then you can do so and make it longer". The rules of the 3-step guide that shows ONCE per account, right after its first AI
// animation lands. Plain logic only (no React), so it can be tested on its own:
//   node --test src/components/learn/firstAnimationGuideRules.test.ts
//
// Every sentence was checked against the real app (Nov 26):
//  - an edit sends only his words + the canvas + the timeline sheet (v1AnimatorController "turn"): no frame selection exists;
//    the AI picks the steps to change (v1AnimatorCore edit ops);
//  - "then he bows" = the "append" edit: a new step added at the END (v1AnimatorCore "append", v1EditSizeNov2 test);
//  - every new animation and every edit waits on a card with its price until Animate is pressed (gate: true in
//    v1AnimatorServer). The AI's written answer itself costs its real cost (usually a credit or two), so the words say
//    "before anything is animated", not "before anything costs";
//  - drawing by hand never uses credits (the "drawing" credit kind is the AI's drawing help, not the pencil);
//  - (dad, 15:01: an extra nunchuck handle on ~5 frames was a 60-credit remake, erasing it by hand was free) the tools are
//    named "Eraser" and "Pencil" (DrawingToolBar: data-workspace-tool="eraser" / "brush", the left bar on a computer, the
//    Tools tray on a phone); clicking a frame on the timeline shows it to draw on (the guided tour says the same).

/** Remembered in the account's preferences on the server (so another phone or browser never shows it again). */
export const GUIDE_PREF_KEY = "first-animation-guide";
export type GuideSeen = { schema: "first-animation-guide/v1"; seenAt: string };

/** Only within the first 3 animations seen in this browser (the same window as the "It's yours" card), so a long-time user
 *  on a new device isn't walked through basics after their 50th animation. */
export const GUIDE_MAX_LANDED = 3;

export type GuideTarget = "play" | "ai" | "timeline" | "eraser";
/** `targets`: the controls outlined (the card sits by the first). */
export type GuideStep = { title: string; text: { computer: string; phone: string }; targets: readonly GuideTarget[] };

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    title: "Watch it",
    text: { computer: "Here's your animation. Press play to watch it.", phone: "Here's your animation. Tap play to watch it." },
    targets: ["play"],
  },
  {
    title: "Change it or make it longer",
    text: {
      computer: "Type a change, like “make him jump higher”, or what happens next, like “then he bows”. No need to select frames: the AI finds the right part. You'll see the price before anything is animated.",
      phone: "Tap AI and type a change, like “make him jump higher”, or what happens next, like “then he bows”. No need to select frames: the AI finds the right part. You'll see the price before anything is animated.",
    },
    targets: ["ai"],
  },
  {
    title: "Small fixes are free",
    text: {
      computer: "A stray line or an extra handle? Click that frame on the timeline and fix it yourself with the Eraser or Pencil: it's free. Save the AI for bigger changes.",
      phone: "A stray line or an extra handle? Tap that frame on the timeline and fix it yourself with the Eraser or Pencil: it's free. Save the AI for bigger changes.",
    },
    targets: ["timeline", "eraser"],
  },
];

/** Should this landing open the guide? `landedCount` = this browser's landing count; `seen` = the account's preference. */
export function shouldShowGuide(input: { landedCount: number; seen: boolean; tourRunning: boolean }): boolean {
  return !input.seen && !input.tourRunning && input.landedCount >= 1 && input.landedCount <= GUIDE_MAX_LANDED;
}

export const isGuideSeen = (value: unknown): boolean =>
  Boolean(value && typeof value === "object" && (value as Partial<GuideSeen>).schema === "first-animation-guide/v1");

// ---- where the card sits next to the outlined control (the same rule as the guided tour, LearnMode.tsx)
export type Box = { left: number; top: number; width: number; height: number };
export const GUIDE_CARD_HEIGHT = 170;
export const GUIDE_BAR_SPACE = 76;   // the bottom bar (progress + Skip / Next)
export const GUIDE_CARD_WIDTH = 340;

/** The outline around the control (never off screen) and the card: below it when there is room, else above, else inside.
 *  (Nov 26, phone test) a control in the bar's own place (the phone's bottom tab bar: the AI tab) would be covered by the
 *  Skip / Next bar, so the bar moves to the top of the screen for that step (`barAtTop`). */
export function placeGuideCard(rect: Box, view: { width: number; height: number }, pad = 6) {
  const left = Math.max(4, rect.left - pad), top = Math.max(4, rect.top - pad);
  const ring: Box = { left, top, width: Math.min(view.width - 4, rect.left + rect.width + pad) - left, height: Math.min(view.height - 4, rect.top + rect.height + pad) - top };
  const barAtTop = ring.top + ring.height > view.height - GUIDE_BAR_SPACE;
  const topSpace = barAtTop ? GUIDE_BAR_SPACE : 0, bottomSpace = barAtTop ? 0 : GUIDE_BAR_SPACE;
  const roomBelow = view.height - bottomSpace - (ring.top + ring.height), roomAbove = ring.top - topSpace;
  const place: "below" | "above" | "inside" = roomBelow >= GUIDE_CARD_HEIGHT && roomBelow >= roomAbove ? "below" : roomAbove >= GUIDE_CARD_HEIGHT ? "above" : roomBelow >= GUIDE_CARD_HEIGHT ? "below" : "inside";
  const cardWidth = Math.min(GUIDE_CARD_WIDTH, view.width - 24);
  const cardLeft = Math.max(12, Math.min(rect.left + rect.width / 2 - cardWidth / 2, view.width - cardWidth - 12));
  const cardTop = place === "below" ? ring.top + ring.height + 14 : place === "inside" ? Math.max(12 + topSpace, Math.min(ring.top + ring.height - GUIDE_CARD_HEIGHT + 8, view.height - bottomSpace - GUIDE_CARD_HEIGHT)) : undefined;
  const cardBottom = place === "above" ? Math.max(view.height - ring.top + 14, bottomSpace + 8) : undefined;
  const tipLeft = Math.min(Math.max(rect.left + rect.width / 2 - cardLeft, 20), cardWidth - 20) - 7;
  return { ring, place, cardLeft, cardTop, cardBottom, tipLeft, barAtTop };
}

// ---- who goes first: while the guide is deciding or showing, the "It's yours" card (and its testimonial ask) waits
export type GuidePhase = "idle" | "checking" | "showing";
let phase: GuidePhase = "idle";
const listeners = new Set<() => void>();
export const getGuidePhase = () => phase;
export function setGuidePhase(next: GuidePhase) {
  if (phase === next) return;
  phase = next;
  for (const listener of listeners) listener();
}
export function subscribeGuidePhase(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
