// The effects registry and the per-picture builder (SPEC-0017 Phase 2C).
import type { FrameCharacter, Scene, SceneFrames } from "../engine.ts";
import { cameraEffectFrames, hasCamera } from "../camera.ts";
import { BACKGROUNDS } from "./backgrounds.ts";
import { RECIPES as CLASH } from "./clash.ts";
import { RECIPES as EXPLOSION } from "./explosion.ts";
import { RECIPES as FIRE } from "./fire.ts";
import { RECIPES as HANDCUFFS } from "./handcuffs.ts";
import { RECIPES as ICE } from "./ice.ts";
import { RECIPES as LASER } from "./laser.ts";
import { RECIPES as LIGHT } from "./light.ts";
import { RECIPES as LIGHTNING } from "./lightning.ts";
import { RECIPES as SMOKE } from "./smoke.ts";
import { RECIPES as TEXT } from "./text.ts";
import { RECIPES as WATER } from "./water.ts";
import { RECIPES as WEAPONS } from "./weapons.ts";
import type { Anchor, BackgroundRecipe, BackgroundSpec, EffectFrame, EffectRecipe, EffectTrack, Point, Shape } from "./types.ts";

export type * from "./types.ts";

export const EFFECTS: Record<string, EffectRecipe> = Object.fromEntries([...FIRE, ...SMOKE, ...WATER, ...LIGHTNING, ...LIGHT, ...ICE, ...LASER, ...HANDCUFFS, ...CLASH, ...EXPLOSION, ...WEAPONS, ...TEXT].map((r) => [r.id, r]));
export const BACKGROUND_PIECES: Record<string, BackgroundRecipe> = Object.fromEntries(BACKGROUNDS.map((r) => [r.id, r]));

// A scene with effects and a background (both optional; a plain scene draws none).
export type EffectScene = Scene & { effects?: EffectTrack[]; background?: BackgroundSpec; stageWidth?: number };

// Where an anchor is in one picture (a joint follows its character; a missing character → the point itself).
export function anchorAt(anchor: Anchor, characters: readonly FrameCharacter[]): Point | undefined {
  if (!("character" in anchor)) return anchor;
  const c = characters.find((f) => f.id === anchor.character);
  if (!c) return undefined;
  const p = c.skeleton[anchor.joint];
  if (anchor.onHead) {
    // (A spot on the face: "up the head" is from the neck to the head's middle; the face is a quarter turn from it.)
    const s = c.skeleton, ux = s.head.x - s.neck.x, uy = s.head.y - s.neck.y, L = Math.hypot(ux, uy) || 1;
    const side = c.facing === "left" ? -1 : c.facing === "right" ? 1 : 0, f = anchor.onHead.forward * c.headRadius, u = anchor.onHead.up * c.headRadius;
    return { x: s.head.x + (-side * uy * f + ux * u) / L + (anchor.dx ?? 0), y: s.head.y + (side * ux * f + uy * u) / L + (anchor.dy ?? 0) };
  }
  return { x: p.x + (anchor.dx ?? 0), y: p.y + (anchor.dy ?? 0) };
}

// Every picture's shapes: the background (behind everything), effects behind the figures, effects in front.
// Picture i is at time i / fps (the same clock as buildScene's pictures).
export function buildEffectFrames(scene: EffectScene, built: SceneFrames): EffectFrame[] {
  // THE CAMERA (camera.ts): only a scene with film cuts or a screen shake — each shot's own background and effects.
  if (built.camera && hasCamera(scene)) return cameraEffectFrames(scene, built, buildEffectFrames);
  const height = scene.characters[0]?.height ?? 300;
  const stageWidth = scene.stageWidth ?? 1920;
  return built.frames.map((characters, i) => {
    const t = i / built.fps;
    const frame: EffectFrame = { background: [], back: [], front: [] };
    for (const piece of scene.background?.pieces ?? []) {
      const recipe = BACKGROUND_PIECES[piece.kind];
      if (recipe) frame.background.push(...recipe.draw({ ...piece, params: { seed: scene.background?.seed, ...piece.params } }, t, { width: stageWidth, groundY: scene.groundY, height }));
    }
    for (const track of scene.effects ?? []) {
      if (t < track.start - 1e-9 || t > track.end + 1e-9) continue;
      const recipe = EFFECTS[track.kind];
      const at = anchorAt(track.anchor, characters);
      if (!recipe || !at) continue;
      const target = track.target ? anchorAt(track.target, characters) : undefined;
      // (`facing`: the way the anchor's figure faces — a cap's peak points that way.)
      const facing = "character" in track.anchor ? characters.find((c) => c.id === (track.anchor as { character: string }).character)?.facing : undefined;
      const shapes = recipe.draw({ t: t - track.start, duration: track.end - track.start, fps: built.fps, at, target, height, groundY: scene.groundY, stageWidth, ...(facing ? { facing } : {}) }, track.params ?? {});
      if (track.layer === "top") (frame.top ??= []).push(...shapes); // (over the heads: laser beams from the eyes)
      else (track.layer === "back" || track.behind?.some(([from, to]) => t >= from - 1e-9 && t < to - 1e-9) ? frame.back : frame.front).push(...shapes);
    }
    return frame;
  });
}

// The lesson lines for the AI: what each effect and background piece is.
export const effectLessons = () => [...Object.values(EFFECTS).map((r) => `${r.id}: ${r.about}`), ...Object.values(BACKGROUND_PIECES).map((r) => `background ${r.id}: ${r.about}`)];

export type { Shape };
