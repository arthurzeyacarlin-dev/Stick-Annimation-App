export const AUTHORED_STAGE = Object.freeze({ width: 1920, height: 1080 });
export const STAGE_RGBA_BYTES = 1920 * 1080 * 4;
export type StagePoint = { x: number; y: number };
export type StagePresentation = { scale: number; offsetX: number; offsetY: number };

export function fitAuthoredStage(width: number, height: number): StagePresentation | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(width / AUTHORED_STAGE.width, height / AUTHORED_STAGE.height);
  return { scale, offsetX: (width - 1920 * scale) / 2, offsetY: (height - 1080 * scale) / 2 };
}
export const presentStagePoint = (p: StagePoint, t: StagePresentation): StagePoint => ({ x: t.offsetX + p.x * t.scale, y: t.offsetY + p.y * t.scale });
// Do not quantize presentation math. Authoring precision belongs to the existing
// command owner; repeated resize/project/unproject must not round the document.
export const authoredStagePoint = (p: StagePoint, t: StagePresentation): StagePoint => ({ x: (p.x - t.offsetX) / t.scale, y: (p.y - t.offsetY) / t.scale });
