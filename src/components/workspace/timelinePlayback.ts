type PlaybackFrameLike = {
  cellType: string;
};

const MIN_PLAYBACK_FPS = 1;
const MAX_PLAYBACK_FPS = 55;
const MAX_CATCH_UP_FRAMES = 5;
// (Nov 14, Arthur: "some stuff is slow, some stuff is normal speed") it was 1: a picture that took longer than its own time to draw was
// shown late and the lost time thrown away, so a stretch of heavy pictures played in slow motion (measured with this rule at 24 fps: a
// picture every 70 ms = 60 % speed, every 120 ms = 35 %). Now the player keeps real time: a late tick moves on by the pictures that are due.
const MAX_VISUAL_ADVANCE_PER_TICK = MAX_CATCH_UP_FRAMES;
const PLAYBACK_UI_SYNC_INTERVAL_MS = 48;
const AI_GENERATED_SEQUENCE_FPS_SOFT_CAP = 18;
const AI_GENERATED_SEQUENCE_FPS_HARD_CAP = 15;
const AI_GENERATED_SEQUENCE_FPS_PROTECTED_CAP = 12;
const PLAYBACK_RENDER_SCALE_SOFT = 0.85;
const PLAYBACK_RENDER_SCALE_HARD = 0.72;
const PLAYBACK_RENDER_SCALE_PROTECTED = 0.6;

export const getAuthoredPlaybackFrameCount = <Frame extends PlaybackFrameLike>(
  frameCollections: ReadonlyArray<ReadonlyArray<Frame>>,
) => {
  let lastAuthoredFrameIndex = -1;

  for (const frames of frameCollections) {
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      if (frames[index] && frames[index].cellType !== "empty") {
        lastAuthoredFrameIndex = Math.max(lastAuthoredFrameIndex, index);
        break;
      }
    }
  }

  return Math.max(1, lastAuthoredFrameIndex + 1);
};

export const getClampedPlaybackFrameDurationMs = (fps: number) =>
  1000 / Math.max(MIN_PLAYBACK_FPS, Math.min(MAX_PLAYBACK_FPS, Math.round(fps)));

export const shouldSyncPlaybackUiState = ({
  lastUiSyncTimestampMs,
  nextTimestampMs,
  steps,
  droppedSteps,
}: {
  lastUiSyncTimestampMs: number;
  nextTimestampMs: number;
  steps: number;
  droppedSteps: number;
}) => {
  if (steps <= 0) {
    return false;
  }

  return (
    lastUiSyncTimestampMs <= 0 ||
    droppedSteps > 0 ||
    nextTimestampMs - lastUiSyncTimestampMs >= PLAYBACK_UI_SYNC_INTERVAL_MS
  );
};

export const resolveSafeGeneratedSequenceFps = ({
  suggestedFps,
  generatedFrameCount,
  totalLayerCount,
  renderScaleDownApplied = false,
  performanceProtectionTriggered = false,
}: {
  suggestedFps: number;
  generatedFrameCount: number;
  totalLayerCount: number;
  renderScaleDownApplied?: boolean;
  performanceProtectionTriggered?: boolean;
}) => {
  const normalizedSuggestedFps = Math.max(MIN_PLAYBACK_FPS, Math.min(MAX_PLAYBACK_FPS, Math.round(suggestedFps)));

  if (performanceProtectionTriggered || renderScaleDownApplied || generatedFrameCount >= 20 || totalLayerCount >= 6) {
    return Math.min(normalizedSuggestedFps, AI_GENERATED_SEQUENCE_FPS_PROTECTED_CAP);
  }

  if (generatedFrameCount >= 16 || totalLayerCount >= 5) {
    return Math.min(normalizedSuggestedFps, AI_GENERATED_SEQUENCE_FPS_HARD_CAP);
  }

  if (generatedFrameCount >= 10 || totalLayerCount >= 3) {
    return Math.min(normalizedSuggestedFps, AI_GENERATED_SEQUENCE_FPS_SOFT_CAP);
  }

  return normalizedSuggestedFps;
};

export const resolvePlaybackRenderScale = ({
  authoredFrameCount,
  totalLayerCount,
  timelineFps,
  performanceProtectionTriggered = false,
  pictureLayerCount,
}: {
  authoredFrameCount: number;
  totalLayerCount: number;
  timelineFps: number;
  performanceProtectionTriggered?: boolean;
  pictureLayerCount?: number;
}) => {
  // (Nov 15, Arthur: "in the app the animation looks blurry and laggy, the raw video does not" - measured in the app on his 35-second
  // story, 844 pictures at 24 a second: drawn at 60 % size every picture is squeezed, so it looks blurred and jagged next to the paused
  // picture; drawn at full size the Mac shows the same 24 of 24 pictures a second) ONE layer with pictures plays at full size, however
  // long it is. Several layers with pictures: the sizes below, as before.
  // (Nov 19 eve, Arthur: "Always the highest quality... not optional") up to 3 layers with pictures also play at full size.
  if (!performanceProtectionTriggered && pictureLayerCount !== undefined && pictureLayerCount >= 1 && pictureLayerCount <= 3) {
    return 1;
  }

  if (performanceProtectionTriggered || authoredFrameCount >= 24 || totalLayerCount >= 6 || timelineFps >= 24) {
    return PLAYBACK_RENDER_SCALE_PROTECTED;
  }

  if (authoredFrameCount >= 16 || totalLayerCount >= 5 || timelineFps >= 18) {
    return PLAYBACK_RENDER_SCALE_HARD;
  }

  if (authoredFrameCount >= 10 || totalLayerCount >= 3) {
    return PLAYBACK_RENDER_SCALE_SOFT;
  }

  return 1;
};

export const advancePlaybackAccumulator = (
  accumulatorMs: number,
  deltaMs: number,
  frameDurationMs: number,
) => {
  const clampedDeltaMs = Math.max(0, Math.min(deltaMs, frameDurationMs * MAX_CATCH_UP_FRAMES));
  let nextAccumulatorMs = accumulatorMs + clampedDeltaMs;
  let rawSteps = 0;

  while (nextAccumulatorMs >= frameDurationMs) {
    nextAccumulatorMs -= frameDurationMs;
    rawSteps += 1;
  }

  const steps = Math.min(rawSteps, MAX_VISUAL_ADVANCE_PER_TICK);
  const droppedSteps = Math.max(0, rawSteps - steps);
  if (droppedSteps > 0) {
    nextAccumulatorMs = Math.min(nextAccumulatorMs, frameDurationMs * 0.35);
  }

  return {
    accumulatorMs: nextAccumulatorMs,
    steps,
    droppedSteps,
  };
};

/**
 * Pause stops right on the frame that is showing. Only the active layer comes back from before
 * Play; the playhead and the selected frame stay where playback was paused.
 */
export const resolvePausedPlaybackReturnState = ({
  returnState,
  shownFrameIndex,
  activeLayerId,
}: {
  returnState: { activeLayerId: string } | null;
  shownFrameIndex: number;
  activeLayerId: string;
}) => ({
  activeLayerId: returnState?.activeLayerId ?? activeLayerId,
  currentFrameIndex: shownFrameIndex,
  selectedTimelineIndex: shownFrameIndex,
});
