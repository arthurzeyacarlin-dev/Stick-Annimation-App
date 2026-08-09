export {};

const timelinePlaybackModuleUrl = new URL("../src/components/workspace/timelinePlayback.ts", import.meta.url);
const {
  advancePlaybackAccumulator,
  getClampedPlaybackFrameDurationMs,
  resolvePlaybackRenderScale,
  resolveSafeGeneratedSequenceFps,
  shouldSyncPlaybackUiState,
} = await import(timelinePlaybackModuleUrl.href);

const frameDurationMs = getClampedPlaybackFrameDurationMs(24);

const nominalStep = advancePlaybackAccumulator(0, frameDurationMs, frameDurationMs);
const overloadedStep = advancePlaybackAccumulator(0, frameDurationMs * 3.4, frameDurationMs);
const carryOverStep = advancePlaybackAccumulator(overloadedStep.accumulatorMs, frameDurationMs * 0.6, frameDurationMs);
const shouldSkipImmediateUiSync = shouldSyncPlaybackUiState({
  lastUiSyncTimestampMs: 100,
  nextTimestampMs: 120,
  steps: 1,
  droppedSteps: 0,
});
const shouldForceUiSyncAfterInterval = shouldSyncPlaybackUiState({
  lastUiSyncTimestampMs: 100,
  nextTimestampMs: 180,
  steps: 1,
  droppedSteps: 0,
});
const shouldForceUiSyncWhenDroppingFrames = shouldSyncPlaybackUiState({
  lastUiSyncTimestampMs: 100,
  nextTimestampMs: 120,
  steps: 1,
  droppedSteps: 2,
});
const protectedFps = resolveSafeGeneratedSequenceFps({
  suggestedFps: 24,
  generatedFrameCount: 18,
  totalLayerCount: 4,
  renderScaleDownApplied: true,
  performanceProtectionTriggered: true,
});
const moderateFps = resolveSafeGeneratedSequenceFps({
  suggestedFps: 24,
  generatedFrameCount: 10,
  totalLayerCount: 3,
});
const protectedPlaybackRenderScale = resolvePlaybackRenderScale({
  authoredFrameCount: 24,
  totalLayerCount: 6,
  timelineFps: 24,
  performanceProtectionTriggered: true,
});
const moderatePlaybackRenderScale = resolvePlaybackRenderScale({
  authoredFrameCount: 12,
  totalLayerCount: 3,
  timelineFps: 18,
});
const lightPlaybackRenderScale = resolvePlaybackRenderScale({
  authoredFrameCount: 4,
  totalLayerCount: 1,
  timelineFps: 12,
});

const results = {
  nominalPlaybackStillAdvancesNormally: nominalStep.steps === 1,
  overloadedPlaybackDropsCatchUpHops: overloadedStep.steps === 1 && overloadedStep.droppedSteps >= 1,
  overloadedPlaybackKeepsOnlySmallAccumulatorRemainder: overloadedStep.accumulatorMs < frameDurationMs * 0.5,
  followUpTickContinuesSmoothly: carryOverStep.steps <= 1,
  playbackUiStateSkipsEverySingleTick: shouldSkipImmediateUiSync === false,
  playbackUiStateResyncsAfterInterval: shouldForceUiSyncAfterInterval === true,
  playbackUiStateResyncsAfterDroppedFrames: shouldForceUiSyncWhenDroppingFrames === true,
  heavyAiSequencesClampToProtectedFps: protectedFps <= 12,
  moderateAiSequencesStillClampSafely: moderateFps <= 18,
  heavyPlaybackUsesReducedRenderScale: protectedPlaybackRenderScale <= 0.6,
  moderatePlaybackUsesSoftenedRenderScale: moderatePlaybackRenderScale < 1,
  lightPlaybackKeepsFullRenderScale: lightPlaybackRenderScale === 1,
};

const allChecksPassed = Object.values(results).every(Boolean);

console.log(
  JSON.stringify(
    {
      allChecksPassed,
      results,
    },
    null,
    2,
  ),
);

if (!allChecksPassed) {
  process.exit(1);
}
