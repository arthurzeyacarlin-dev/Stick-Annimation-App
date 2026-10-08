// The effects registry and the per-picture builder (SPEC-0017 Phase 2C).
import { addBuiltHook, type FrameCharacter, type FrameObject, type Scene, type SceneFrames } from "../engine.ts";
import { objectHalfExtents } from "../objects.ts";
import { cameraEffectFrames, hasCamera } from "../camera.ts";
import { BACKGROUNDS } from "./backgrounds.ts";
import { RECIPES as BUBBLES } from "./bubbles.ts";
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
import { STORM } from "./thunderstorm.ts";
import { RECIPES as WATER } from "./water.ts";
import { RECIPES as WEAPONS } from "./weapons.ts";
import { RECIPES as TRANSFORM } from "../moves/transform.ts";
import type { Anchor, BackgroundRecipe, BackgroundSpec, EffectFrame, EffectParams, EffectRecipe, EffectTrack, Point, Shape } from "./types.ts";

export type * from "./types.ts";

export const EFFECTS: Record<string, EffectRecipe> = Object.fromEntries([...FIRE, ...SMOKE, ...WATER, ...LIGHTNING, ...LIGHT, ...ICE, ...LASER, ...HANDCUFFS, ...CLASH, ...EXPLOSION, ...WEAPONS, ...TEXT, ...BUBBLES, ...TRANSFORM].map((r) => [r.id, r]));
export const BACKGROUND_PIECES: Record<string, BackgroundRecipe> = Object.fromEntries([...BACKGROUNDS, ...STORM].map((r) => [r.id, r]));

// A scene with effects and a background (both optional; a plain scene draws none).
// (`effectHeight`: the figure size the effects are measured by when the scene has no figures — an effect put on the
// user's own drawing, moves/fromDrawing.ts; a scene with figures always uses its first figure's height.)
export type EffectScene = Scene & { effects?: EffectTrack[]; background?: BackgroundSpec; stageWidth?: number; effectHeight?: number };

// Where an anchor is in one picture (a joint follows its character; a missing character → the point itself).
// (An anchor on an OBJECT follows it in this picture's `objects`; gone from the picture → no effect there.)
export function anchorAt(anchor: Anchor, characters: readonly FrameCharacter[], objects: readonly FrameObject[] = []): Point | undefined {
  if ("object" in anchor) {
    const o = objects.find((f) => f.id === anchor.object);
    return o ? { x: o.x + (anchor.dx ?? 0), y: o.y + (anchor.dy ?? 0) } : undefined;
  }
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
  const height = scene.characters[0]?.height ?? scene.effectHeight ?? 300;
  const stageWidth = scene.stageWidth ?? 1920;
  // (A burst where a thrown thing LANDS: moved to that moment, fixed at that spot.)
  const landed = new Map<EffectTrack, EffectTrack>();
  for (const track of scene.effects ?? []) {
    const on = track.anchor;
    if (!("object" in on) || !on.landing) continue;
    const land = objectLanding(built, on.object, scene.groundY);
    if (land) landed.set(track, { ...track, start: land.t, end: land.t + (track.end - track.start), anchor: { x: land.x + (on.dx ?? 0), y: land.y + (on.dy ?? 0) } });
  }
  const lastSeen = new Map<EffectTrack, { at: Point; facing?: "left" | "right" | "front" }>(); // (staysWhenGone)
  return built.frames.map((characters, i) => {
    const t = i / built.fps;
    const frame: EffectFrame = { background: [], back: [], front: [] };
    for (const piece of scene.background?.pieces ?? []) {
      const recipe = BACKGROUND_PIECES[piece.kind];
      if (recipe) frame.background.push(...recipe.draw({ ...piece, params: { seed: scene.background?.seed, ...piece.params } }, t, { width: stageWidth, groundY: scene.groundY, height }));
    }
    for (const raw of scene.effects ?? []) {
      const track = landed.get(raw) ?? raw;
      if (t < track.start - 1e-9 || t > track.end + 1e-9) continue;
      const recipe = EFFECTS[track.kind];
      const seen = anchorAt(track.anchor, characters, built.objects[i]), at = seen ?? (recipe?.staysWhenGone ? lastSeen.get(raw)?.at : undefined);
      if (!recipe || !at) continue;
      const target = track.target ? anchorAt(track.target, characters, built.objects[i]) : undefined;
      // (`facing`: the way the anchor's figure faces — a cap's peak points that way.)
      const facing = "character" in track.anchor ? characters.find((c) => c.id === (track.anchor as { character: string }).character)?.facing ?? lastSeen.get(raw)?.facing : undefined;
      if (seen && recipe.staysWhenGone) lastSeen.set(raw, { at: seen, facing });
      const shapes = recipe.draw({ t: t - track.start, duration: track.end - track.start, fps: built.fps, at, target, height, groundY: scene.groundY, stageWidth, ...(facing ? { facing } : {}) }, track.params ?? {});
      if (track.layer === "top") (frame.top ??= []).push(...shapes); // (over the heads: laser beams from the eyes)
      else (track.layer === "back" || track.behind?.some(([from, to]) => t >= from - 1e-9 && t < to - 1e-9) ? frame.back : frame.front).push(...shapes);
    }
    return frame;
  });
}

// WHERE AND WHEN A THROWN THING LANDS: the first picture, after it has been up off the floor, in which it comes down
// onto the floor (its bottom within 3 px of the ground, falling or stopped), or hits a figure in flight (its middle
// inside a figure's body box, not its holder's hands); never landing → the last picture it is seen in.
export function objectLanding(built: SceneFrames, id: string, groundY: number): { t: number; x: number; y: number } | undefined {
  let up = false, fell = false, last: { t: number; x: number; y: number } | undefined, prev: FrameObject | undefined;
  for (let i = 0; i < built.objects.length; i += 1) {
    const o = built.objects[i].find((f) => f.id === id);
    if (!o) { prev = undefined; continue; }
    const bottom = o.y + objectHalfExtents(o.look, o.rotation, o.scaleX, o.scaleY).halfH;
    const here = { t: i / built.fps, x: o.x, y: Math.min(o.y, groundY) };
    if (up && prev && o.y >= prev.y - 0.5 && bottom >= groundY - 3) return { ...here, y: groundY };
    // (a bounce between two pictures, at a low frame rate: falling, then rising again near the floor)
    if (up && prev && fell && o.y < prev.y - 0.5 && bottom >= groundY - 80) return { t: (i - 0.5) / built.fps, x: (o.x + prev.x) / 2, y: groundY };
    fell = prev !== undefined && o.y > prev.y + 0.5;
    if (up && prev && Math.abs(o.x - prev.x) > 1) {
      for (const c of built.frames[i]) {
        const s = c.skeleton, xs = [s.head.x, s.hip.x, s.lFoot.x, s.rFoot.x], ys = [s.head.y - c.headRadius, s.lFoot.y, s.rFoot.y];
        const nearHands = Math.min(Math.hypot(s.lHand.x - o.x, s.lHand.y - o.y), Math.hypot(s.rHand.x - o.x, s.rHand.y - o.y)) < 80;
        if (!nearHands && o.x > Math.min(...xs) - 10 && o.x < Math.max(...xs) + 10 && o.y > Math.min(...ys) && o.y < Math.max(...ys)) return here;
      }
    }
    if (bottom < groundY - 30) up = true;
    last = here; prev = o;
  }
  return last;
}

// The lesson lines for the AI: what each effect and background piece is.
export const effectLessons = () => [...Object.values(EFFECTS).map((r) => `${r.id}: ${r.about}`), ...Object.values(BACKGROUND_PIECES).map((r) => `background ${r.id}: ${r.about}`)];

export type { Shape };

// AN IMPACT IS BIGGER THAN WHAT MADE IT (Arthur, 2026-10-08: the power ball's burst "is literally smaller than the
// ball"): a burst at a thing's landing (sparks or stars, a fiery burst, a flash, a splash, a shatter...) spreads at
// least IMPACT_REACH × the thing's own radius — measured on the recipe's OWN drawing (its clearly visible shapes), so it
// holds for every recipe, and a bigger ball makes a bigger burst. Only ever made bigger; words are not a burst.
export const IMPACT_REACH = 3.5;
const NOT_A_BURST = new Set(TEXT.map((r) => r.id));
// How far a burst reaches from where it is, at its widest in its first 0.3 s (an impact is big AT ONCE, not only when
// fading out): the body of it — 70% of its clearly visible shapes (alpha ≥ 0.2) are within this — not one stray spark.
export function burstReach(kind: string, params: EffectParams, at: Point, height: number, groundY: number, seconds: number): number {
  const recipe = EFFECTS[kind];
  if (!recipe) return 0;
  let reach = 0;
  for (let k = 0; k <= 12; k += 1) {
    const t = (k / 12) * Math.min(Math.max(0.05, seconds), 0.3), far: number[] = [];
    for (const s of recipe.draw({ t, duration: seconds, fps: 24, at, height, groundY, stageWidth: 1920 }, params)) {
      const q = s as { kind: string; alpha?: number; points?: number[]; x?: number; y?: number; r?: number };
      if ((q.alpha ?? 1) < 0.2) continue;
      const pts = Array.isArray(q.points) ? q.points : typeof q.x === "number" && typeof q.y === "number" ? [q.x, q.y] : [];
      let d = 0;
      for (let j = 0; j + 1 < pts.length; j += 2) d = Math.max(d, Math.hypot(pts[j] - at.x, pts[j + 1] - at.y) + (q.kind === "circle" ? q.r ?? 0 : 0));
      if (pts.length) far.push(d);
    }
    far.sort((x, y) => x - y);
    if (far.length) reach = Math.max(reach, far[Math.min(far.length - 1, Math.floor(far.length * 0.7))]);
  }
  return reach;
}
function impactBigEnough(e: EffectTrack, radius: number, land: { x: number; y: number } | undefined, a: { dx?: number; dy?: number }, height: number, groundY: number): EffectTrack {
  if (!radius || !land || NOT_A_BURST.has(e.kind) || !EFFECTS[e.kind]) return e;
  const at = { x: land.x + (a.dx ?? 0), y: land.y + (a.dy ?? 0) }, need = IMPACT_REACH * radius, seconds = e.end - e.start;
  const reachAt = (size: number | undefined) => burstReach(e.kind, size === undefined ? e.params ?? {} : { ...e.params, size }, at, height, groundY, seconds);
  const before = reachAt(undefined);
  if (before <= 0 || before >= need) return e;
  const given = typeof e.params?.size === "number" ? e.params.size : undefined;
  let size = given ?? 1, reach = reachAt(size);
  for (let k = 0; k < 5 && reach > 0 && reach < need && size < 2.5; k += 1) { size = Math.min(2.5, size * (need / reach) * 1.02); reach = reachAt(size); }
  return reach > before && (given === undefined || size > given) ? { ...e, params: { ...e.params, size } } : e;
}

// A THING THAT BURSTS IS GONE (Arthur: a thrown power ball "bursts into stars" — it doesn't roll on after): an object
// with an effect anchored at its landing ({object, landing: true}) is not drawn after it lands.
addBuiltHook((scene, built) => {
  // AN EFFECT RIDING ON A THROWN THING LASTS AS LONG AS THE THING FLIES (2026-10-07, Luna's power ball lost its glow
  // halfway): an effect on an object that lands keeps going until the landing, whatever end the plan wrote. (New
  // track objects — the plan's own are never changed.)
  const riding = (scene as Scene & { effects?: EffectTrack[] }).effects ?? [];
  if (riding.some((e) => typeof (e.anchor as { object?: unknown })?.object === "string")) {
    // A GLOW AROUND A THING IS BIGGER THAN THE THING (the same review: a glow `size` 0.3 was smaller than the ball and
    // hid behind it): a glow riding on an object reaches at least ~1.8× the object's own radius.
    const height = scene.characters[0]?.height ?? 300;
    const radiusOf = (id: string) => {
      const o = built.objects.flat().find((x) => x.id === id);
      if (!o) return 0;
      const { halfW, halfH } = objectHalfExtents(o.look, 0, Math.abs(o.scaleX ?? 1), Math.abs(o.scaleY ?? 1));
      return Math.max(halfW, halfH);
    };
    (scene as Scene & { effects?: EffectTrack[] }).effects = riding.map((e) => {
      const a = e.anchor as { object?: unknown; landing?: unknown; dx?: number; dy?: number };
      if (typeof a?.object === "string" && a.landing === true) return impactBigEnough(e, radiusOf(a.object), objectLanding(built, a.object, scene.groundY), a, height, scene.groundY);
      if (typeof a?.object !== "string") return e;
      const land = objectLanding(built, a.object, scene.groundY);
      let out = land && e.end < land.t ? { ...e, end: land.t } : e;
      if (e.kind === "glow") {
        const least = (1.8 * radiusOf(a.object)) / (0.13 * height); // (the glow's reach is 0.13 × height × size)
        const size = typeof e.params?.size === "number" ? e.params.size : 1;
        if (size < least) out = { ...out, params: { ...e.params, size: least } };
      }
      return out;
    });
  }
  const effects = (scene as Scene & { effects?: EffectTrack[] }).effects ?? [];
  const gone = new Map<string, number>();
  for (const e of effects) {
    const a = e.anchor as { object?: unknown; landing?: unknown };
    if (typeof a?.object !== "string" || a.landing !== true) continue;
    const land = objectLanding(built, a.object, scene.groundY);
    if (land) gone.set(a.object, Math.min(gone.get(a.object) ?? Infinity, land.t));
  }
  if (!gone.size) return built;
  // (Kept through the picture it lands in, so where it landed — and the burst there — stay the same.)
  return { ...built, objects: built.objects.map((frame, i) => frame.filter((o) => !(gone.has(o.id) && i > Math.ceil(gone.get(o.id)! * built.fps - 1e-6)))) };
});
