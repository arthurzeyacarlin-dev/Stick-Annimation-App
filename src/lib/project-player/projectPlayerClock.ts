export type ProjectPlayerClockAnchor = {
  mediaTimeSeconds: number;
  monotonicTimeSeconds: number;
  source: "performance" | "audio";
};

export const clampProjectPlayerTime = (value: number, durationSeconds: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, durationSeconds), Math.max(0, value));
};

export const projectPlayerFrameAtTime = (
  mediaTimeSeconds: number,
  fps: number,
  frameCount: number,
) => {
  if (frameCount <= 1) return 0;
  const safeFps = Math.max(1, fps);
  return Math.min(frameCount - 1, Math.floor(Math.max(0, mediaTimeSeconds) * safeFps));
};

export const sampleProjectPlayerClock = (
  anchor: ProjectPlayerClockAnchor,
  monotonicTimeSeconds: number,
  durationSeconds: number,
) => clampProjectPlayerTime(
  anchor.mediaTimeSeconds + Math.max(0, monotonicTimeSeconds - anchor.monotonicTimeSeconds),
  durationSeconds,
);
