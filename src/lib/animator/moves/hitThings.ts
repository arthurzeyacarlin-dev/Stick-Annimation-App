// A THING THAT IS HIT REACTS (Arthur, 2026-10-08: a punch at a thing that never moves looks like it missed): when a
// punch or kick lands on a thing — an object or a placed prop it names as its `target`, or one standing just where the
// strike lands — the thing answers by the strike's power: a HANGING thing swings away and settles back (a damped
// swing about its top), a STANDING thing rocks away on its far bottom edge and settles, and a LIGHT one (smaller than
// LIGHT_THING x the figure's height) is knocked back along the floor. General for every thing and every strike.
import type { CharacterKey, ObjectKey, Scene, SceneObject } from "../engine.ts";
import type { EffectTrack } from "../effects/types.ts";
import { objectHalfExtents } from "../objects.ts";

export const LIGHT_THING = 0.35; // x the figure's height: a thing smaller than this is light (knocked back)
export type ThingHit = { t: number; power: number; dir: 1 | -1 };

// The reaction at `dt` seconds after the hit: the angle (degrees, + = away from the striker when dir = 1) and how far it
// slid (x the push). A damped swing for a hanging thing, a short rock for a standing one.
export function hitWobble(hits: ThingHit[], t: number, hanging: boolean): { angle: number; slide: number } {
  let angle = 0, slide = 0;
  for (const h of hits) {
    const dt = t - h.t;
    if (dt < 0) continue;
    const p = Math.min(1, Math.max(0.2, h.power));
    if (hanging) {
      // swings out (~0.25 s), back past the middle, out again smaller... settled in ~2.5 s
      // (about its TOP: a turn the other way is what swings its bottom away from the striker)
      angle -= h.dir * (10 + 22 * p) * Math.exp(-1.6 * dt) * Math.sin(Math.min(dt / 0.25, 1) * Math.PI / 2 + Math.max(0, dt - 0.25) * 2 * Math.PI / 1.1);
    } else {
      // tips away (~0.12 s), rocks back, settles in ~0.8 s; a light thing also slides back
      angle += h.dir * (4 + 10 * p) * Math.exp(-4 * dt) * Math.sin(Math.min(dt / 0.12, 1) * Math.PI / 2 + Math.max(0, dt - 0.12) * 2 * Math.PI / 0.45);
      slide += h.dir * p * (1 - Math.exp(-6 * dt));
    }
  }
  return { angle, slide };
}

const keyAt = (keys: CharacterKey[], t: number) => keys.reduce((best, k) => (Math.abs(k.t - t) < Math.abs(best.t - t) ? k : best), keys[0]);

type Striker = { id: string; facing: string; actions: { move: string; params?: Record<string, unknown> }[] };

// Every punch / kick landing on the thing at `x` (its near side `halfW` away) named `id`.
export function hitsOn(id: string, x: number, halfW: number, height: number, characters: Striker[], built: Map<string, CharacterKey[]>, marks: Record<string, number>, power: Record<string, number>): ThingHit[] {
  const out: ThingHit[] = [];
  for (const c of characters) {
    const keys = built.get(c.id);
    if (!keys?.length) continue;
    let k = 0;
    for (const a of c.actions) {
      if (a.move !== "punch" && a.move !== "kick") continue;
      k += 1;
      const t = marks[`${c.id}.strike${k}.hit`];
      if (t === undefined) continue;
      const target = a.params?.target;
      const at = keyAt(keys, t), facing = at.facing ?? c.facing, dir: 1 | -1 = facing === "left" ? -1 : 1;
      const gap = dir * (x - at.x) - halfW; // from the striker's hip to the thing's near side
      const named = target === id;
      // (Unnamed: only a strike at nobody that lands where the thing stands — its near side within an arm or leg.)
      if (!named && (typeof target === "string" || gap < -0.1 * height || gap > 0.75 * height)) continue;
      out.push({ t, power: power[`${c.id}.strike${k}`] ?? 0.6, dir });
    }
  }
  return out;
}

// Keys for a still object (one key, nobody holding it) that is hit: its reaction, sampled every 1/24 s.
export function objectReacts(o: SceneObject, hits: ThingHit[], height: number, groundY: number, end: number): SceneObject {
  if (!hits.length || o.keys.length !== 1 || o.segments?.length) return o;
  const k0 = o.keys[0], { halfW, halfH } = objectHalfExtents(o.look, 0, 1, 1);
  const hanging = k0.y + halfH < groundY - 0.05 * height;
  const light = 2 * Math.max(halfW, halfH) < LIGHT_THING * height;
  const push = light ? 0.35 * height : 0;
  const keys: ObjectKey[] = [k0];
  const first = Math.min(...hits.map((h) => h.t));
  for (let t = first; t <= end + 1e-6; t += 1 / 24) {
    const { angle, slide } = hitWobble(hits, t, hanging);
    const a = (angle * Math.PI) / 180, s = Math.sign(angle) || 1;
    // the pivot: the top middle (hanging) or the bottom edge it tips over (standing)
    const px = k0.x + (hanging ? 0 : s * halfW), py = k0.y + (hanging ? -halfH : halfH);
    const cx = k0.x - px, cy = k0.y - py;
    keys.push({ t, x: px + cx * Math.cos(a) - cy * Math.sin(a) + slide * push, y: py + cx * Math.sin(a) + cy * Math.cos(a), rotation: angle, ease: "linear" });
  }
  return { ...o, keys };
}

// The scene's things react to the hits on them (objects get keys; props get params.hits, drawn by drawProp).
export function thingsReactToHits<S extends Scene>(scene: S, height: number, characters: Striker[], built: Map<string, CharacterKey[]>, marks: Record<string, number>, power: Record<string, number>): S {
  const objects = (scene.objects ?? []).map((o) => {
    if (o.keys.length !== 1 || o.segments?.length) return o;
    const { halfW } = objectHalfExtents(o.look, 0, 1, 1);
    return objectReacts(o, hitsOn(o.id, o.keys[0].x, halfW, height, characters, built, marks, power), height, scene.groundY, scene.durationSec);
  });
  const effects = (scene as { effects?: EffectTrack[] }).effects?.map((e, i) => {
    const at = e.anchor as { x?: unknown; y?: unknown };
    if (e.kind !== "prop" || typeof at.x !== "number") return e;
    const size = (typeof e.params?.size === "number" ? e.params.size : 0.5) * height;
    const id = typeof e.params?.id === "string" ? e.params.id : `prop${i}`;
    const hits = hitsOn(id, at.x, size * 0.35, height, characters, built, marks, power).filter((h) => h.t >= e.start && h.t < e.end);
    return hits.length ? { ...e, params: { ...e.params, hits: hits.map((h) => ({ ...h, t: h.t - e.start })) } } : e;
  });
  return { ...scene, objects, ...(effects ? { effects } : {}) };
}
