import type { FrameCharacter, FrameObject, Scene } from "./engine.ts";
import { lookThickness, objectHalfExtents } from "./objects.ts";
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

type ObjectFrames = readonly (readonly FrameObject[])[];

// ON THE PAGE (explosions, 2026-10-06): the room taken by effects at FIXED spots that say so (EffectTrack `fit`: a
// grenade exploding far from everyone, a crate's pieces flying), so the page fit and the centering count them like
// a figure. null when no effect says so (then everything is exactly as before).
type FitTrack = { kind?: string; anchor: { x: number; y: number } | { character: string }; fit?: { left: number; right: number; top: number }; params?: { size?: unknown } };
// A THING PLACED IN THE SCENE IS SEEN (2026-10-07, Luna's car to the moon: the moon at a fixed spot was left off the
// page, and so was the car driving to it): a `prop` at a fixed spot counts for the page fit like an effect that says
// `fit` — its size (x the figure height) all round it.
const propFit = (e: FitTrack) => {
  const r = Math.max(0.1, Math.min(4, typeof e.params?.size === "number" ? e.params.size : 0.3));
  return { left: -r, right: r, top: r };
};
export function effectFitBounds(scene: Scene): Bounds | null {
  const tracks = ((scene as Scene & { effects?: FitTrack[] }).effects ?? []).filter((e) => (e.fit || e.kind === "prop") && !("character" in e.anchor));
  if (!tracks.length) return null;
  const height = scene.characters[0]?.height ?? 300, b: Bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const e of tracks) {
    const at = e.anchor as { x: number; y: number }, fit = e.fit ?? propFit(e);
    b.left = Math.min(b.left, at.x + fit.left * height); b.right = Math.max(b.right, at.x + fit.right * height);
    b.top = Math.min(b.top, at.y - fit.top * height); b.bottom = Math.max(b.bottom, scene.groundY);
  }
  return b;
}

// Everything the animation's drawing covers over all its frames (heads and line thickness included),
// objects (balls, boxes) included when given.
// (`extra`: more room that must show — effects at fixed spots that say so: effectFitBounds.)
export function animationBounds(frames: FrameCharacter[][], objects?: ObjectFrames, extra?: Bounds | null): Bounds {
  const b: Bounds = extra && Number.isFinite(extra.left) ? { ...extra } : { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const characters of frames) for (const character of characters) {
    if (character.offPage) continue; // running off the page or in from its edge on purpose (a film cut, camera.ts)
    const half = character.style.thickness / 2;
    for (const name of JOINTS) {
      const p = character.skeleton[name];
      const pad = name === "head" ? character.headRadius + half : half;
      b.left = Math.min(b.left, p.x - pad); b.right = Math.max(b.right, p.x + pad);
      b.top = Math.min(b.top, p.y - pad); b.bottom = Math.max(b.bottom, p.y + pad);
    }
  }
  for (const list of objects ?? []) for (const object of list) {
    if (object.leaving) continue; // thrown away off the page: it may leave the page
    const { halfW, halfH } = objectHalfExtents(object.look, object.rotation, object.scaleX, object.scaleY);
    const half = (lookThickness(object.look) * Math.max(Math.abs(object.scaleX), Math.abs(object.scaleY))) / 2;
    b.left = Math.min(b.left, object.x - halfW - half); b.right = Math.max(b.right, object.x + halfW + half);
    b.top = Math.min(b.top, object.y - halfH - half); b.bottom = Math.max(b.bottom, object.y + halfH + half);
  }
  return b;
}

// Slides the whole animation so it is centered on the page (both ways). `fits` says whether it is then
// fully inside the visible page. Objects (same frame index), when given, count and slide with the figures.
// (`extra`: effects at fixed spots that must show too — an explosion far away: effectFitBounds(scene).)
export function centerAnimation(frames: FrameCharacter[][], stageWidth: number, objects?: FrameObject[][], extra?: Bounds | null) {
  const before = animationBounds(frames, objects, extra);
  if (!Number.isFinite(before.left)) return { frames, objects, fits: true, bounds: before, shift: { x: 0, y: 0 } };
  const shift = { x: STAGE_CENTER_X - (before.left + before.right) / 2, y: STAGE_HEIGHT / 2 - (before.top + before.bottom) / 2 };
  const moved = shift.x === 0 && shift.y === 0 ? frames : frames.map((characters) => characters.map((character) => {
    const skeleton = { ...character.skeleton };
    for (const name of JOINTS) skeleton[name] = { x: character.skeleton[name].x + shift.x, y: character.skeleton[name].y + shift.y };
    return { ...character, skeleton };
  }));
  const movedObjects = !objects || (shift.x === 0 && shift.y === 0) ? objects
    : objects.map((list) => list.map((object) => ({ ...object, x: object.x + shift.x, y: object.y + shift.y })));
  const bounds = { left: before.left + shift.x, right: before.right + shift.x, top: before.top + shift.y, bottom: before.bottom + shift.y };
  const half = stageWidth / 2;
  const fits = bounds.left >= STAGE_CENTER_X - half - 1e-6 && bounds.right <= STAGE_CENTER_X + half + 1e-6 && bounds.top >= -1e-6 && bounds.bottom <= STAGE_HEIGHT + 1e-6;
  return { frames: moved, objects: movedObjects, fits, bounds, shift };
}

// OFF THE PAGE ONLY ON PURPOSE (Arthur, 2026-10-06): a figure may leave the page only when the story sends it
// somewhere, and then the scene cuts to it there. This check finds figures that leave the page completely
// (no joint showing) and are never seen again before the end: "just gone". `frames` are as shown on the page
// (after centerAnimation). Each lost figure comes with the last picture it was seen in (-1 = never seen).
// FILM CUTS (camera.ts): with `cuts` (the pictures where a new shot starts: SceneFrames.camera.cuts), each shot
// is checked on its own. A figure may leave the page in a shot that a cut ends ON PURPOSE when the NEXT shot shows
// it (arriving or already there); gone in the last shot, or not shown in the next one, is still "just gone".
// Without `cuts` the check is exactly as before.
export function lostOffPage(frames: readonly (readonly FrameCharacter[])[], stageWidth: number, cuts?: readonly number[]): { id: string; lastSeen: number }[] {
  const left = STAGE_CENTER_X - stageWidth / 2, right = STAGE_CENTER_X + stageWidth / 2;
  const seen = (c: FrameCharacter) => JOINTS.some((name) => { const p = c.skeleton[name]; return p.x >= left && p.x <= right && p.y >= 0 && p.y <= STAGE_HEIGHT; });
  if (cuts?.length) {
    const starts = [...new Set([0, ...cuts.filter((c) => c > 0 && c < frames.length)])].sort((a, b) => a - b);
    const shots = starts.map((from, k) => ({ from, to: starts[k + 1] ?? frames.length }));
    const ids = [...new Set(frames.flatMap((list) => list.map((c) => c.id)))];
    const lost: { id: string; lastSeen: number }[] = [];
    for (const id of ids) {
      let seenLast = -1;
      for (let k = 0; k < shots.length; k += 1) {
        let there = -1;
        for (let i = shots[k].from; i < shots[k].to; i += 1) { const c = frames[i].find((f) => f.id === id); if (!c) continue; there = i; if (seen(c)) seenLast = i; }
        if (there < 0 || seenLast >= there) continue; // not in this shot, or still on the page at its end
        const next = shots[k + 1];
        const shownNext = next !== undefined && frames.slice(next.from, next.to).some((list) => list.some((c) => c.id === id && seen(c)));
        if (!shownNext) { lost.push({ id, lastSeen: seenLast }); break; }
      }
    }
    return lost;
  }
  const lastThere = new Map<string, number>(), lastSeen = new Map<string, number>();
  frames.forEach((characters, i) => { for (const c of characters) { lastThere.set(c.id, i); if (seen(c)) lastSeen.set(c.id, i); } });
  return [...lastThere].filter(([id, i]) => (lastSeen.get(id) ?? -1) < i).map(([id]) => ({ id, lastSeen: lastSeen.get(id) ?? -1 }));
}
