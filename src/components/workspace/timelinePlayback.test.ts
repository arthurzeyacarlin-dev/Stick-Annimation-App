import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePausedPlaybackReturnState } from "./timelinePlayback.ts";

test("Pause keeps the frame that is showing instead of jumping back to where Play started", () => {
  // Arthur: Play from frame 1, Pause on frame 7 -> it must stay on frame 7.
  const paused = resolvePausedPlaybackReturnState({
    returnState: { activeLayerId: "layer-a" },
    shownFrameIndex: 6,
    activeLayerId: "layer-a",
  });
  assert.deepEqual(paused, { activeLayerId: "layer-a", currentFrameIndex: 6, selectedTimelineIndex: 6 });
});

test("Pause still brings back the layer that was active before Play", () => {
  const paused = resolvePausedPlaybackReturnState({
    returnState: { activeLayerId: "layer-b" },
    shownFrameIndex: 3,
    activeLayerId: "layer-a",
  });
  assert.equal(paused.activeLayerId, "layer-b");
  assert.equal(paused.currentFrameIndex, 3);
  assert.equal(paused.selectedTimelineIndex, 3);
});

test("Pause with no saved state uses the current layer and the shown frame", () => {
  assert.deepEqual(
    resolvePausedPlaybackReturnState({ returnState: null, shownFrameIndex: 0, activeLayerId: "layer-a" }),
    { activeLayerId: "layer-a", currentFrameIndex: 0, selectedTimelineIndex: 0 },
  );
});
