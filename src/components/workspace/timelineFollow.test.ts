// Dad, Nov 26 15:03: the timeline follows the playhead. Run: node --test src/components/workspace/timelineFollow.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { followPlayhead, revealFrame, type TimelineView } from "./timelineFollow.ts";

const CELL = 17;
const view = (frameIndex: number, scrollLeft: number, viewWidth = 900, frames = 361): TimelineView =>
  ({ frameIndex, cell: CELL, viewWidth, scrollLeft, maxScroll: Math.max(0, frames * CELL - viewWidth) });

/** Plays a whole animation frame by frame, applying each scroll the rule asks for; returns the scrolls and the line's places. */
function play(frames: number, viewWidth: number, loops = 1) {
  let scrollLeft = 0;
  const jumps: number[] = [], seen: number[] = [];
  for (let n = 0; n < frames * loops; n++) {
    const frameIndex = n % frames;
    const next = followPlayhead(view(frameIndex, scrollLeft, viewWidth, frames));
    if (next !== null) { jumps.push(next - scrollLeft); scrollLeft = next; }
    seen.push(frameIndex * CELL - scrollLeft);   // where the line is on screen
  }
  return { jumps, seen, scrollLeft };
}

test("a 15 s animation (361 frames): the line is ALWAYS on screen while it plays, on a computer and on a phone", () => {
  for (const width of [900, 330]) {
    const { seen } = play(361, width, 2);
    for (const x of seen) assert.ok(x >= 0 && x + CELL <= width, `line at ${x} must be inside 0..${width}`);
  }
});

test("it turns a page, it doesn't creep: few scrolls, each forward one lands the line a third from the left", () => {
  const { jumps } = play(361, 900);
  assert.ok(jumps.length > 0 && jumps.length <= Math.ceil((361 * CELL) / (900 * 0.4)), `${jumps.length} scrolls`);
  const forward = jumps.filter((j) => j > 0);
  for (const j of forward.slice(0, -1)) assert.ok(j >= 900 * 0.4, "a page, never a 1-frame nudge (that would jitter)");
  assert.equal(followPlayhead(view(30, 0)), null, "early frames: no scroll");
  const turn = followPlayhead(view(43, 0))!;   // 43 * 17 = 731 > 80% of 900
  assert.equal(Math.round(43 * CELL - turn), 300, "the line lands a third from the left");
});

test("a looping animation starting over scrolls back to the start", () => {
  assert.equal(followPlayhead(view(0, 4000)), 0);
});

test("the ends of the timeline are respected (never scrolled past the last frame or before the first)", () => {
  const last = followPlayhead(view(360, 4000))!;
  assert.ok(last <= 361 * CELL - 900);
  assert.equal(followPlayhead(view(5, 0)), null);
  assert.equal(followPlayhead({ ...view(100, 0), viewWidth: 0 }), null, "a timeline not measured yet");
});

test("on pause: an off-screen frame is brought into view; a visible one is left alone", () => {
  assert.equal(revealFrame(view(10, 0)), null);
  const back = revealFrame(view(10, 3000))!;
  assert.ok(10 * CELL >= back && 10 * CELL + CELL <= back + 900);
  const ahead = revealFrame(view(300, 0))!;
  assert.ok(300 * CELL >= ahead && 300 * CELL + CELL <= ahead + 900);
});
