import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePausedPlaybackReturnState, resolvePlaybackRenderScale } from "./timelinePlayback.ts";

test("(Nov 15) one layer with pictures plays at full size however long it is; several layers with pictures as before", () => {
  const long = { authoredFrameCount: 844, totalLayerCount: 2, timelineFps: 24 };
  assert.equal(resolvePlaybackRenderScale({ ...long, pictureLayerCount: 1 }), 1);
  assert.equal(resolvePlaybackRenderScale({ ...long, pictureLayerCount: 2 }), 1, "(Nov 19) two layers with pictures: full size");
  assert.equal(resolvePlaybackRenderScale({ ...long, pictureLayerCount: 3 }), 1, "(Nov 19) three layers with pictures: full size");
  assert.equal(resolvePlaybackRenderScale({ ...long, pictureLayerCount: 4 }), resolvePlaybackRenderScale(long), "four or more: as before");
  assert.ok(resolvePlaybackRenderScale(long) < 1, "(not told how many layers have pictures: as before)");
  assert.equal(resolvePlaybackRenderScale({ ...long, pictureLayerCount: 1, performanceProtectionTriggered: true }), resolvePlaybackRenderScale({ ...long, performanceProtectionTriggered: true }), "the protection still wins");
});

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
