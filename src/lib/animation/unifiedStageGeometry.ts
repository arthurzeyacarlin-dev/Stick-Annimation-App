export const AUTHORED_STAGE = Object.freeze({ width: 1920, height: 1080 });
export const STAGE_RGBA_BYTES = 1920 * 1080 * 4;
// THE STAGE PIXEL SPACE (Nov 23). Every frame picture the editor makes or changes lives in ONE fixed pixel space that
// never depends on the screen: the 1920x1080 stage is 1920x1080 pixels in the middle of a drawing world 4.6x as big
// each way. The screen only decides how big that space is SHOWN (window size, screen sharpness, browser zoom).
// Before this, the space was "window size x screen sharpness", so a picture kept its size in screen pixels: the same
// figure looked bigger or smaller on another screen, and drawing on it baked it at that screen's size.
export const AUTHORING_WORLD_SCALE = 4.6;
export const STAGE_PIXEL_SPACE = Object.freeze({ width: 8832, height: 4968 });
export type PixelSpace = { width: number; height: number };
// How many of a space's pixels make one stage unit. This is exactly how export has always read a saved picture: the
// page it was made on (its space / 4.6) is fitted whole and centred in the 16:9 video.
export const pixelsPerStageUnit = (space: PixelSpace): number =>
  Math.max(space.width / STAGE_PIXEL_SPACE.width, space.height / STAGE_PIXEL_SPACE.height);
export const samePixelSpace = (a: PixelSpace, b: PixelSpace): boolean => a.width === b.width && a.height === b.height;
// A position along one axis of one space, in another space: both spaces share their middle point.
export const pixelSpaceScale = (from: PixelSpace, to: PixelSpace): number => pixelsPerStageUnit(to) / pixelsPerStageUnit(from);
// The page (16:9, whole stage) fitted inside the editor's canvas area, in the area's own CSS pixels.
export const fitStagePage = (areaWidth: number, areaHeight: number): { left: number; top: number; width: number; height: number } => {
  const scale = Math.max(0, Math.min(areaWidth / AUTHORED_STAGE.width, areaHeight / AUTHORED_STAGE.height));
  const width = AUTHORED_STAGE.width * scale, height = AUTHORED_STAGE.height * scale;
  return { left: (areaWidth - width) / 2, top: (areaHeight - height) / 2, width, height };
};
// Align backing pixels to a stable integer center. Unlike round((a-b)/2),
// these offsets compose and reverse exactly across odd/even resize sequences.
// This is bitmap allocation math, not quantization of authored geometry.
export const bitmapCenterOffset = (targetSize: number, sourceSize: number): number =>
  Math.floor(targetSize / 2) - Math.floor(sourceSize / 2);
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
