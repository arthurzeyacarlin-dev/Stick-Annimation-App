// GRENADE review scenes (SPEC-0017 Phase 2C, 2026-10-06 — Arthur: "the app doesn't know what an explosion is").
// A soldier (wearing the Military cap) holds a Grenade and throws it:
// 1. "Grenade: throw far (overhand)": OVERHAND (overhand = far: wind-up behind the head, step in, follow-through);
//    it arcs far, hits the ground, bounces lower each time, rolls a little, settles; a short pause (the fuse), then
//    it EXPLODES far away (a ground explosion: flash, fireball, stem and cloud on top, debris, the cloud breaks up and
//    fades). A wooden crate stands just past where it settles: the blast BREAKS it and throws its pieces up in arcs. He is far
//    away, so the blast only makes him flinch (blownAway's rule: far = a flinch). A small screen shake on the blast.
// 2. "Grenade: drop close (underhand)": an UNDERHAND toss (underhand = short); it bounces and settles close to him,
//    he is standing there when it goes off (a blast is sudden: no turning round first) and he is BLOWN AWAY
//    (blownAway.ts). He WEARS the cap (`wears`, wear.ts): on his head in every picture, lying and getting up too.
// The figure's moves come first; the grenade's flight starts exactly where his hand let go of it (worked out from
// the built figure), and the blast is timed to where and when the grenade settles — so it all stays together even
// if the move rules change. Effects at fixed spots say how much room they take (`fit`), so the page fit and the
// centering keep the far explosion on the page.
import { buildScene } from "../engine.ts";
import { EFFECTS } from "../effects/index.ts";
import { BLAST_REACH, EXPLOSION_SECONDS, EXPLOSION_SIZE, GRENADE_ASPECT, THROWN_AT, GRENADE_LENGTH, grenadePath, type GrenadePath } from "../effects/explosion.ts";
import type { BackgroundSpec, EffectFit, EffectTrack, Point } from "../effects/types.ts";
import { DEFAULT_STYLE } from "../rig.ts";
import { shapeBounds } from "../symbolMaker.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type Action, type CharacterPlan, type ScenePlan } from "./plan.ts";
import type { ShakePlan } from "./camera.ts";
import { WHOLE_SCENE } from "./wear.ts";

const GROUND = 900, HEIGHT = 280, STAGE = 1920;
export const SOLDIER = "soldier";
// THE EFFORT MATCHES THE FLIGHT (THROWING): the grenade leaves the hand at the hand's own speed and direction, so the
// throw itself decides how far and how high it goes. Far: a strong lofted overhand (`effort` 1.1, `loft`) let go about
// 40 degrees up at about 4 figure heights a second — a tall arc landing a little over 3 figure heights out.
// Close: NO SLOW MOTION — the passed underhand pass's rhythm (the basketball pass Arthur passed: every beat — the
// back-swing, the forward swing, the release, the follow-through — exactly as long), with a SMALLER swing (`swing`
// 0.4: a short back-swing and a smaller follow-through), so the hand lets go slower and the grenade lands about 1.5
// figure heights out on a clear arc; the grenade just isn't caught.
// (`distance` = the throw's aim, for its wind-up.)
export const FAR_LAND = 2.9, CLOSE_LAND = 0.92;
export const FAR_THROW = { effort: 1.1, loft: true }, CLOSE_THROW = { swing: 0.4 };
// HOW STRONG the close grenade is: by the blast rule (blownAway's push), just strong enough — with a little to spare —
// that it throws him from wherever it settles (`strength: "toThrow"`).
export const THROW_HIM = 1.15;
// The fuse: seconds from settling to the blast (close: his beat to react).
export const FAR_FUSE = 0.7, CLOSE_FUSE = 0.95;
// The screen shake on the blast (camera.ts: only on a really big impact — small, short).
const SHAKE = { strength: 0.009, seconds: 0.35 };
const BACKGROUND: BackgroundSpec = { seed: 4, pieces: [
  { kind: "sky", params: { time: "day" } },
  { kind: "sun", params: { x: 300, y: 260 } },
  { kind: "hills", params: { h: 260 } },
  { kind: "ground" },
] };

export type GrenadeScene = { plan: ScenePlan & { shake: ShakePlan[] }; release: number; path: GrenadePath; land: Point; rest: Point; boom: number; from: Point; velocity: Point; strength: number };

// Where the held grenade is at the release, and the hand's velocity as it lets go (px/s): how far and which way the
// hand carried it over its last stretch into the release (the last half of the way from the throw's key before it) — the grenade leaves
// with exactly that velocity. (The hand's last stretch, not one in-between picture: the in-betweens ease through each
// key, which would make the speed right at the key mean nothing.)
export function handVelocityAt(scene: ReturnType<typeof planToScene>, release: number, id = SOLDIER) {
  const keys = scene.characters.find((c) => c.id === id)!.keys, k = keys.findIndex((key) => Math.abs(key.t - release) < 1e-6);
  // (its last half: closer to the way it is going right at the release on a curved swing)
  const t0 = (keys[Math.max(0, k - 1)].t + release) / 2, fps = 240, built = buildScene(scene, fps);
  const at = (t: number) => { const c = built.frames[Math.round(t * fps)].find((f) => f.id === id)!; return heldAt(c.skeleton.rHand, c.skeleton.rElbow, scene.characters[0].height); };
  const now = at(release), before = at(t0), dt = Math.max(1 / fps, Math.round(release * fps) / fps - Math.round(t0 * fps) / fps);
  return { at: now, v: { x: (now.x - before.x) / dt, y: (now.y - before.y) / dt }, from: t0 };
}

function heldAt(hand: Point, elbow: Point, height: number): Point {
  const dx = hand.x - elbow.x, dy = hand.y - elbow.y, L = Math.hypot(dx, dy) || 1, out = (GRENADE_LENGTH * GRENADE_ASPECT * height) / 2 * 0.8;
  return { x: hand.x + (dx / L) * out, y: hand.y + (dy / L) * out };
}

// The room (x height) an effect at a fixed spot takes over its whole life, measured from its own shapes.
export function measureFit(track: EffectTrack, height: number, groundY = GROUND, stageWidth = STAGE): EffectFit {
  const recipe = EFFECTS[track.kind], at = track.anchor as Point, target = track.target as Point | undefined;
  let left = 0, right = 0, top = 0;
  for (let t = 0; t <= Math.min(track.end - track.start, 20) + 1e-9; t += 1 / 24) {
    const shapes = recipe.draw({ t, duration: track.end - track.start, fps: 24, at, target, height, groundY, stageWidth }, track.params ?? {});
    if (!shapes.length) continue;
    const b = shapeBounds(shapes);
    left = Math.min(left, b.minX - at.x); right = Math.max(right, b.maxX - at.x); top = Math.max(top, at.y - b.minY);
  }
  const pad = 0.04 * height;
  return { left: (left - pad) / height, right: (right + pad) / height, top: (top + pad) / height };
}

// The soldier's look: black, a classic stick figure.
// (He WEARS the Military cap: wear.ts puts it on his head in every picture of the scene.)
const soldier = (x: number, actions: Action[]): CharacterPlan => ({ id: SOLDIER, name: "Soldier", x, facing: "right", look: { color: DEFAULT_STYLE.color }, wears: ["militaryCap"], actions });

// Builds a grenade scene. `react(t)` = his moves after the throw, timed with syncs on his own release (`at`).
type Timing = { at: string; settle: number; boom: number; rest: Point; end: number; strength: number };
function grenadeScene(o: { id: string; title: string; x: number; landAt: number; fuse: number; overhand: boolean; throw: { effort?: number; loft?: boolean; swing?: number }; strength?: number | "toThrow"; crate?: number; seed: number; react: (t: Timing) => Action[] }): GrenadeScene {
  const H = HEIGHT;
  const throwAction: Action = { move: "throw", params: { distance: o.landAt * H, overhand: o.overhand, handOff: false, ...o.throw } };
  // 1. The throw on its own, to find where and when his hand lets go.
  const base: ScenePlan = { id: o.id, title: o.title, height: H, groundY: GROUND, stageWidth: STAGE, characters: [soldier(o.x, [{ move: "stand", params: { seconds: 0.6 } }, throwAction, { move: "stand", params: { seconds: 1 } }])] };
  const s0 = planToScene(base, LIBRARY), release = s0.marks[`${SOLDIER}.throw1.release`];
  const velocity = handVelocityAt(s0, release);
  const from = velocity.at;
  const path = grenadePath({ from, velocity: velocity.v, groundY: GROUND, height: H });
  const land = { x: (path.segments[0] as { x0: number; vx: number }).x0 + (path.segments[0] as { vx: number }).vx * path.land, y: GROUND };
  // (The blast on a quarter second, so at 8, 12 and 24 pictures a second there is a picture right on it and the
  // impact picture right after.)
  const settle = release + path.settle, boom = Math.ceil((settle + o.fuse) * 4) / 4, rest = { x: path.restX, y: GROUND };
  const end = boom + EXPLOSION_SECONDS;
  // 2. His whole story, timed to the grenade (syncs on his own release: `offset` = seconds after it).
  // (strength "toThrow": the blast's push on his hips must reach THROWN_AT x THROW_HIM: strength / (1 + (d / reach)^2).)
  const hipsFrom = Math.abs(rest.x - o.x) / (BLAST_REACH * H), strength = o.strength === "toThrow" ? Math.max(1, THROWN_AT * THROW_HIM * (1 + hipsFrom * hipsFrom)) : o.strength ?? 1;
  const timing: Timing = { at: `${SOLDIER}.throw1.release`, settle: settle - release, boom: boom - release, rest, end: end - release, strength };
  const plan: ScenePlan = { ...base, characters: [soldier(o.x, [{ move: "stand", params: { seconds: 0.6 } }, throwAction, ...o.react(timing)])] };
  const effects: EffectTrack[] = [
    // the Grenade in his throwing hand until he lets go...
    { kind: "grenade", start: 0, end: release, anchor: { character: SOLDIER, joint: "rHand" }, target: { character: SOLDIER, joint: "rElbow" }, params: { mode: "held" } },
    // ...then flying, bouncing, rolling and lying there until it blows up
    { kind: "grenade", start: release + 1e-6, end: boom - 0.01, anchor: from, target: land, params: { mode: "flight", vx: velocity.v.x / H, vy: velocity.v.y / H } },
    // THE EXPLOSION where it settled (behind the figures: his body reads over the cloud)
    { kind: "explosion", start: boom, end, anchor: rest, params: { size: EXPLOSION_SIZE, strength, seed: o.seed }, layer: "back" },
  ];
  if (o.crate !== undefined) effects.push({ kind: "crateBreak", start: 0, end: WHOLE_SCENE, anchor: { x: rest.x + o.crate * H, y: GROUND }, target: rest, params: { breakAt: boom, strength, size: 0.3, seed: o.seed + 1 } });
  for (const e of effects) if (!("character" in e.anchor)) e.fit = measureFit(e, H);
  return { plan: { ...plan, effects, background: BACKGROUND, shake: [{ at: boom, ...SHAKE }] }, release, path, land, rest, boom, from, velocity: velocity.v, strength };
}

// 1. THROW FAR (OVERHAND): far away, the blast only startles him (blownAway's own rule: far = a flinch); he
// watches the cloud go.
export function grenadeFarScene(): GrenadeScene {
  return grenadeScene({
    id: "grenade-far", title: "Grenade: throw far (overhand)", x: 330, landAt: FAR_LAND, fuse: FAR_FUSE, overhand: true, throw: FAR_THROW, crate: 0.95, seed: 11,
    react: (t) => [
      { move: "blownAway", params: { from: { x: t.rest.x }, strength: t.strength }, sync: { mark: "blast", at: t.at, offset: t.boom } },
      { move: "stand", params: { seconds: 0.5 } }, { move: "stand", params: { seconds: 0.1 }, sync: { mark: "start", at: t.at, offset: t.end } },
    ],
  });
}

// 2. DROP CLOSE (UNDERHAND): a firm underhand toss with a real arc; it bounces and settles close to him; he is
// standing there when it goes off (a blast is sudden: no turning round) and it BLOWS HIM AWAY; he lies there a
// moment and gets up slowly.
export function grenadeCloseScene(): GrenadeScene {
  return grenadeScene({
    id: "grenade-close", title: "Grenade: drop close (underhand)", x: 760, landAt: CLOSE_LAND, fuse: CLOSE_FUSE, overhand: false, throw: CLOSE_THROW, strength: "toThrow", seed: 23,
    // (BLASTS ARE SUDDEN: he does NOT turn round first — he is standing there when it goes off, and is thrown.)
    react: (t) => [
      { move: "blownAway", params: { from: { x: t.rest.x }, strength: t.strength, seconds: 1 }, sync: { mark: "blast", at: t.at, offset: t.boom } },
    ],
  });
}

export const grenadeFarPlan = () => grenadeFarScene().plan;
export const grenadeClosePlan = () => grenadeCloseScene().plan;
