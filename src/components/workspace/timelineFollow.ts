// Dad, Nov 26 15:03 (live walkthrough): "when you're playing the video... the timeline doesn't tell me where I'm actually at...
// Even when I scroll to the right, I can't find it... It should be moving on the timeline below."
// Where the timeline scrolls so the playhead stays in view. Display only: it never changes a frame, the fps or playback.
// Plain math, tested on its own: node --test src/components/workspace/timelineFollow.test.ts
//
// While playing it turns a PAGE (the line glides on its own between frames, so following it every frame would make it jump
// back a little each frame = jitter): when the line passes 80% of the visible strip, the strip moves so the line sits a
// third from the left, and the line glides on from there. It also comes back when a looping animation starts over.

export type TimelineView = { frameIndex: number; cell: number; viewWidth: number; scrollLeft: number; maxScroll: number };

export const FOLLOW_AHEAD = 0.8;
export const FOLLOW_ANCHOR = 1 / 3;

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
/** The scroll that puts this frame a third from the left (within the timeline's ends). */
const anchored = (view: TimelineView) => clamp(view.frameIndex * view.cell - view.viewWidth * FOLLOW_ANCHOR, Math.max(0, view.maxScroll));

/** While playing: the new scroll position, or null to stay. */
export function followPlayhead(view: TimelineView): number | null {
  if (!(view.viewWidth > 0) || !(view.cell > 0)) return null;
  const x = view.frameIndex * view.cell;
  if (x >= view.scrollLeft && x + view.cell <= view.scrollLeft + view.viewWidth * FOLLOW_AHEAD) return null;
  const target = anchored(view);
  return Math.abs(target - view.scrollLeft) < 1 ? null : target;
}

/** On pause: bring the current frame into view if any part of it is off-screen (null = it is already visible). */
export function revealFrame(view: TimelineView): number | null {
  if (!(view.viewWidth > 0) || !(view.cell > 0)) return null;
  const x = view.frameIndex * view.cell;
  if (x >= view.scrollLeft && x + view.cell <= view.scrollLeft + view.viewWidth) return null;
  const target = anchored(view);
  return Math.abs(target - view.scrollLeft) < 1 ? null : target;
}

/** A user's own move on the timeline (wheel, drag, touch, the scroll bar): from then on, until the next Play, it doesn't follow. */
export const isUserTimelineScroll = (target: EventTarget | null) =>
  typeof Element !== "undefined" && target instanceof Element && !!target.closest(".timeline-frame-main-scroll, .timeline-bottom-scrollbar-slider");
