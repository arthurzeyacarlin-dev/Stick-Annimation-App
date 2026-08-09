type PlaybackFrameLike = {
  cellType: string;
};

const MIN_PLAYBACK_FPS = 1;
const MAX_PLAYBACK_FPS = 55;
const MAX_CATCH_UP_FRAMES = 5;
const MAX_VISUAL_ADVANCE_PER_TICK = 1;
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
}: {
  authoredFrameCount: number;
  totalLayerCount: number;
  timelineFps: number;
  performanceProtectionTriggered?: boolean;
}) => {
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
