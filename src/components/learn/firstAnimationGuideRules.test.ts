// Dad, Nov 26 14:54: the after-first-animation guide. Run: node --test src/components/learn/firstAnimationGuideRules.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUIDE_MAX_LANDED, GUIDE_STEPS, getGuidePhase, isGuideSeen, placeGuideCard, setGuidePhase, shouldShowGuide, subscribeGuidePhase,
} from "./firstAnimationGuideRules.ts";

test("shows once: only when the account hasn't seen it, within the first 3 animations, never over the guided tour", () => {
  assert.equal(shouldShowGuide({ landedCount: 1, seen: false, tourRunning: false }), true);
  assert.equal(shouldShowGuide({ landedCount: GUIDE_MAX_LANDED, seen: false, tourRunning: false }), true);
  assert.equal(shouldShowGuide({ landedCount: GUIDE_MAX_LANDED + 1, seen: false, tourRunning: false }), false, "a long-time user on a new device");
  assert.equal(shouldShowGuide({ landedCount: 1, seen: true, tourRunning: false }), false, "seen on any device = never again");
  assert.equal(shouldShowGuide({ landedCount: 1, seen: false, tourRunning: true }), false);
  assert.equal(shouldShowGuide({ landedCount: 0, seen: false, tourRunning: false }), false);
  assert.equal(isGuideSeen({ schema: "first-animation-guide/v1", seenAt: "2026-11-26T15:00:00Z" }), true);
  assert.equal(isGuideSeen(null), false);
  assert.equal(isGuideSeen({ seen: true }), false);
});

test("the 3 steps say what dad asked, point at the real controls, and never name a credit number", () => {
  assert.deepEqual(GUIDE_STEPS.map((s) => [s.title, s.targets.join("+")]), [["Watch it", "play"], ["Change it or make it longer", "ai"], ["Small fixes are free", "timeline+eraser"]]);
  const all = GUIDE_STEPS.flatMap((s) => [s.text.computer, s.text.phone]);
  for (const text of all) assert.doesNotMatch(text, /\d+\s*credit|\$\d|cents?\b/i, "no fixed price (the prices are being changed)");
  assert.match(GUIDE_STEPS[1].text.computer, /No need to select frames/);
  assert.match(GUIDE_STEPS[1].text.computer, /price before anything is animated/);
  assert.match(GUIDE_STEPS[1].text.computer, /then he bows/);
  // dad, 15:01: a small fix by hand is free (the real tool names), the AI is for bigger changes
  assert.match(GUIDE_STEPS[2].text.computer, /Eraser or Pencil: it's free/);
  assert.match(GUIDE_STEPS[2].text.computer, /Click that frame on the timeline/);
  assert.match(GUIDE_STEPS[2].text.phone, /Tap that frame on the timeline/);
  assert.match(GUIDE_STEPS[2].text.computer, /bigger changes/);
  // phones say "tap", computers say "press" / "click"
  for (const s of GUIDE_STEPS) assert.doesNotMatch(s.text.phone, /\b(click|press)\b/i);
  assert.match(GUIDE_STEPS[0].text.computer, /Press play/);
  assert.match(GUIDE_STEPS[1].text.phone, /^Tap AI/);
});

test("the card never leaves the screen and never covers the bottom bar (computer and phone sizes)", () => {
  const views = [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 640 }];
  const rects = [
    { left: 600, top: 8, width: 300, height: 32 },     // the AI box at the top
    { left: 20, top: 700, width: 36, height: 36 },     // play near the bottom
    { left: 0, top: 560, width: 1280, height: 180 },   // the timeline
    { left: 300, top: 790, width: 60, height: 54 },    // a phone bottom-bar tab
  ];
  for (const view of views) for (const rect of rects) {
    const spot = placeGuideCard(rect, view);
    assert.ok(spot.ring.left >= 4 && spot.ring.top >= 4 && spot.ring.left + spot.ring.width <= view.width - 4 + 0.001 && spot.ring.top + spot.ring.height <= view.height - 4 + 0.001, "outline on screen");
    assert.ok(spot.cardLeft >= 12 && spot.cardLeft + Math.min(340, view.width - 24) <= view.width - 12 + 0.001, "card on screen");
    // the Skip / Next bar (76 px at the bottom, or at the top when the control is down there) never covers the control
    const bar = spot.barAtTop ? { top: 0, bottom: 76 } : { top: view.height - 76, bottom: view.height };
    assert.ok(spot.ring.top + spot.ring.height <= bar.top + 0.001 || spot.ring.top >= bar.bottom - 0.001, "the bar never covers the outlined control");
    if (spot.cardBottom !== undefined) assert.ok(spot.cardBottom >= (spot.barAtTop ? 8 : 84), "card clear of the bar");
  }
  assert.equal(placeGuideCard({ left: 600, top: 8, width: 300, height: 32 }, { width: 1280, height: 800 }).place, "below");
  assert.equal(placeGuideCard({ left: 20, top: 700, width: 36, height: 36 }, { width: 1280, height: 800 }).place, "above");
  // the phone's AI tab in the bottom tab bar: the bar goes to the top, the card sits above the tab
  const aiTab = placeGuideCard({ left: 300, top: 760, width: 60, height: 52 }, { width: 375, height: 812 });
  assert.equal(aiTab.barAtTop, true);
  assert.equal(aiTab.place, "above");
  assert.equal(placeGuideCard({ left: 20, top: 140, width: 36, height: 36 }, { width: 375, height: 812 }).barAtTop, false);
});

test("the guide goes first: the 'It's yours' card waits while it is checking or showing", () => {
  let calls = 0;
  const stop = subscribeGuidePhase(() => { calls += 1; });
  assert.equal(getGuidePhase(), "idle");
  setGuidePhase("checking");
  setGuidePhase("checking");   // no change = no wake-up
  setGuidePhase("showing");
  setGuidePhase("idle");
  stop();
  setGuidePhase("showing");
  setGuidePhase("idle");
  assert.equal(calls, 3);
});
