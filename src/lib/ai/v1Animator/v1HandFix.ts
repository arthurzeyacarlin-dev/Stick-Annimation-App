// (Dad + Arthur, Nov 26 16:07-16:09) TWO WAYS TO CHANGE AN ANIMATION THAT EXISTS: fix it yourself on the timeline (free), or have the AI make
// it again (its real price). This file only works out WHERE the change is, from the animation's own plan (each step's seconds) and the
// timeline's pictures per second - nothing here reads or changes how anything is made. The step seconds are the plan's; H3's clip follows
// them closely but not to the picture, so every place is said as "about".

export type V1HandFix = {
  /** where the change is: seconds on the timeline, frame numbers (1 = the first frame; null when the pictures per second are unknown) */
  fromS: number; toS: number; fromFrame: number | null; toFrame: number | null;
  /** the plan's steps it covers (1 = the first step) */
  firstStep: number; lastStep: number;
  /** which way is recommended: only the look changes -> fix it yourself; the moves change -> make it again */
  recommend: "hand" | "remake";
  /** the AI way, said exactly: the whole animation made again, or only these steps (null = the AI can't make this change) */
  remake: { whole: boolean; firstStep: number; lastStep: number; seconds: number } | null;
};

/** Steps `first`..`last` (0-based, inclusive) of a plan whose steps last `seconds` each, at `fps` pictures a second. */
export function handFixPlace(steps: readonly { seconds: number }[], first: number, last: number, fps: number) {
  const len = (i: number) => Math.max(0, Number(steps[i]?.seconds) || 0);
  const lo = Math.max(0, Math.min(first, last)), hi = Math.min(steps.length - 1, Math.max(first, last));
  let fromS = 0;
  for (let i = 0; i < lo; i += 1) fromS += len(i);
  let toS = fromS;
  for (let i = lo; i <= hi; i += 1) toS += len(i);
  const round = (s: number) => Math.round(s * 10) / 10;
  const known = Number.isFinite(fps) && fps > 0;
  const fromFrame = known ? Math.floor(fromS * fps) + 1 : null;
  const toFrame = known ? Math.max(fromFrame!, Math.round(toS * fps)) : null;
  return { fromS: round(fromS), toS: round(toS), fromFrame, toFrame, firstStep: lo + 1, lastStep: hi + 1 };
}

/** The steps of the saved plan that an edit changes (0-based first..last), or null when it changes none of them (only adds at the end). */
export function changedStepRange(saved: readonly { text: string; seconds: number }[], edited: readonly { text: string; seconds: number }[] | null): [number, number] | null {
  if (!edited) return null;
  const same = (a: { text: string; seconds: number }, b?: { text: string; seconds: number }) => !!b && a.text.trim() === b.text.trim() && Number(a.seconds) === Number(b.seconds);
  let first = -1, last = -1;
  for (let i = 0; i < saved.length; i += 1) if (!same(saved[i], edited[i])) { if (first < 0) first = i; last = i; }
  return first < 0 ? null : [first, last];
}

/** The plain words of each way (the card and the chat use them). */
export function handFixWords(fix: V1HandFix) {
  const steps = fix.firstStep === fix.lastStep ? `step ${fix.firstStep}` : `steps ${fix.firstStep}–${fix.lastStep}`;
  const frames = fix.fromFrame !== null && fix.toFrame !== null ? `, frames about ${fix.fromFrame}–${fix.toFrame}` : "";
  const where = `${steps.charAt(0).toUpperCase()}${steps.slice(1)}: about ${fix.fromS}–${fix.toS} s${frames}.`;
  const last = fix.toFrame !== null ? `frame ${fix.toFrame}` : `${fix.toS} s`;
  const how = [
    `Press Take me there: it opens ${fix.fromFrame !== null ? `frame ${fix.fromFrame}` : `${fix.fromS} s`} with the Eraser and Onion skin on, so you see the frames around it.`,
    "Erase what's wrong with the Eraser, or draw what's missing with the Brush.",
    `Go frame by frame on the timeline up to ${last}.`,
  ];
  const remake = fix.remake
    ? fix.remake.whole ? `Remake the whole animation with this change: this makes the whole ${fix.remake.seconds}-second animation again.`
      : `Make ${fix.remake.firstStep === fix.remake.lastStep ? `step ${fix.remake.firstStep}` : `steps ${fix.remake.firstStep}–${fix.remake.lastStep}`} again with this change: the rest stays as it is.`
    : null;
  return { where, how, remake };
}
