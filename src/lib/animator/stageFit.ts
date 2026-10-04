import type { FrameCharacter, Scene } from "./engine.ts";
import { JOINTS } from "./rig.ts";

// SPEC-0017 page rule (Arthur, 2026-10-04): every animation stays fully inside the page, and the WHOLE
// animation (everything it does, start to end) is centered on the page. The figures keep their normal
// size and their motion is untouched: the animation is only slid (sideways and up/down) as one piece.
// The page shows the 1920x1080 stage scaled by its height and centered, so the part of the stage that
// shows is 1080 x the page's width/height wide, around x = 960.
export const STAGE_CENTER_X = 960;
export const STAGE_HEIGHT = 1080;
export type PageInfo = { stageWidth: number }; // visible stage width, in stage units
// A scene, or a recipe that makes the scene fit the page it will be shown on.
export type SceneForPage = Scene | ((page: PageInfo) => Scene);

export const visibleStageWidth = (pageWidth: number, pageHeight: number) => (pageWidth * STAGE_HEIGHT) / pageHeight;

export type Bounds = { left: number; right: number; top: number; bottom: number };

// Everything the animation's drawing covers over all its frames (heads and line thickness included).
export function animationBounds(frames: FrameCharacter[][]): Bounds {
  const b: Bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const characters of frames) for (const character of characters) {
    const half = character.style.thickness / 2;
    for (const name of JOINTS) {
      const p = character.skeleton[name];
      const pad = name === "head" ? character.headRadius + half : half;
      b.left = Math.min(b.left, p.x - pad); b.right = Math.max(b.right, p.x + pad);
      b.top = Math.min(b.top, p.y - pad); b.bottom = Math.max(b.bottom, p.y + pad);
    }
  }
  return b;
}

// Slides the whole animation so it is centered on the page (both ways). `fits` says whether it is then
// fully inside the visible page.
export function centerAnimation(frames: FrameCharacter[][], stageWidth: number) {
  const before = animationBounds(frames);
  if (!Number.isFinite(before.left)) return { frames, fits: true, bounds: before, shift: { x: 0, y: 0 } };
  const shift = { x: STAGE_CENTER_X - (before.left + before.right) / 2, y: STAGE_HEIGHT / 2 - (before.top + before.bottom) / 2 };
  const moved = shift.x === 0 && shift.y === 0 ? frames : frames.map((characters) => characters.map((character) => {
    const skeleton = { ...character.skeleton };
    for (const name of JOINTS) skeleton[name] = { x: character.skeleton[name].x + shift.x, y: character.skeleton[name].y + shift.y };
    return { ...character, skeleton };
  }));
  const bounds = { left: before.left + shift.x, right: before.right + shift.x, top: before.top + shift.y, bottom: before.bottom + shift.y };
  const half = stageWidth / 2;
  const fits = bounds.left >= STAGE_CENTER_X - half - 1e-6 && bounds.right <= STAGE_CENTER_X + half + 1e-6 && bounds.top >= -1e-6 && bounds.bottom <= STAGE_HEIGHT + 1e-6;
  return { frames: moved, fits, bounds, shift };
}
