// A THING THAT IS HIT REACTS (Arthur, 2026-10-08: a punch at a thing that never moves looks like it missed): when a
// punch or kick lands on a thing — an object or a placed prop it names as its `target`, or one standing just where the
// strike lands — the thing answers by the strike's power: a HANGING thing swings away and settles back (a damped
// swing about its top), a STANDING thing rocks away on its far bottom edge and settles, and a LIGHT one (smaller than
// LIGHT_THING x the figure's height) is knocked back along the floor. General for every thing and every strike.
import type { CharacterKey, ObjectKey, Scene, SceneObject } from "../engine.ts";
import type { EffectTrack } from "../effects/types.ts";
import { objectHalfExtents } from "../objects.ts";
import { propBox } from "../laws/propBox.ts";

// BALLS HIT THINGS (Oct 14, "the ball goes through the wall"): a solid thing standing on the ground (the same names the `solid`
// law knows: a wall, crate, box, rock, log, fence, barrel, post, car, a tree's trunk…) is a WALL for a struck or dropped ball: the
// ball bounces back off its side (losing some speed) and lands on its top. Boxes in plan px, active between start and end.
export const SOLID_THING = /\b(box|crate|chest|log|rock|stone|boulder|block|barrel|trunk|bale|fence|wall|bin|suitcase|snowman|cauldron|tree|stump|post|pole|pillar|car|truck|van|bus|door|gate|building|house|shed|cabinet|fridge|locker|sofa|couch)\b/i;
export type SolidWall = { left: number; right: number; top: number; start: number; end: number };
export function solidWalls(effects: readonly EffectTrack[] | undefined, height: number, groundY: number): SolidWall[] {
  const out: SolidWall[] = [];
  for (const e of effects ?? []) {
    if (e.kind !== "prop" || !e.anchor || "character" in (e.anchor as object) || "object" in (e.anchor as object)) continue;
    const p = e.params ?? {}, name = String(p.name ?? p.symbol ?? "");
    if (!SOLID_THING.test(name) || p.flies === true || p.hangs === true) continue;
    const b = propBox({ height, groundY } as never, e);
    if (!b || b.bottom < groundY - 0.02 * height || b.bottom - b.top < 0.05 * height) continue; // only things standing on the ground
    // (a tree: only its trunk is solid — the leaves are not a wall)
    const trunk = /\btree\b/i.test(name) && !/\btrunk|stump\b/i.test(name);
    // (A THING ON A POLE — a bus-stop sign, a street lamp, a flag, a sign post — only its POLE is solid, Arthur Oct 15: the snowball
    // "never hits him" — it bounced off a whole bus-stop-sized box in the air. A "bus stop" is not a bus.)
    const pole = !trunk && /\b(pole|post|sign|signpost|lamp|lamppost|street ?light|flag|bus stop)\b/i.test(name) && !/\b(box|crate|wall|fence|building|house|shed|car|truck|van|gate|door)\b/i.test(name);
    const half = trunk ? Math.min((b.right - b.left) / 2, 0.06 * height) : pole ? Math.min((b.right - b.left) / 2, 0.025 * height) : (b.right - b.left) / 2;
    out.push({ left: b.cx - half, right: b.cx + half, top: trunk ? groundY - 0.45 * (b.bottom - b.top) : b.top, start: e.start ?? -Infinity, end: e.end ?? Infinity });
  }
  return out;
}
// One step of a ball against the walls: moving from x0 to x (centre, radius r, centre height y) — if it ran into a wall's side
// below the wall's top, it stops at the side and bounces back with `keep` of its speed. Returns the new x and vx.
export function bounceOffWalls(walls: readonly SolidWall[], t: number, x0: number, x: number, y: number, vx: number, r: number, keep = 0.6): { x: number; vx: number } {
  for (const w of walls) {
    if (t < w.start || t >= w.end || y + 0.5 * r < w.top) continue;
    if (vx > 0 && x0 + r <= w.left + 1 && x + r > w.left) return { x: w.left - r - (x + r - w.left) * keep, vx: -vx * keep };
    if (vx < 0 && x0 - r >= w.right - 1 && x - r < w.right) return { x: w.right + r + (w.right - (x - r)) * keep, vx: -vx * keep };
  }
  return { x, vx };
}

export const LIGHT_THING = 0.35; // x the figure's height: a thing smaller than this is light (knocked back)
export type ThingHit = { t: number; power: number; dir: 1 | -1; kick?: boolean; height?: string; aimX?: number };

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
      // (EASES IN — Arthur's law #1, Oct 14: the first swing picture jumped 21 px: the push builds over the first 0.25 s, smoothstep)
      const u = Math.min(dt / 0.25, 1), eased = u * u * (3 - 2 * u);
      angle -= h.dir * (10 + 22 * p) * Math.exp(-1.6 * dt) * Math.sin(eased * Math.PI / 2 + Math.max(0, dt - 0.25) * 2 * Math.PI / 1.1);
    } else {
      // tips away (~0.12 s), rocks back, settles in ~0.8 s; a light thing also slides back
      angle += h.dir * (4 + 10 * p) * Math.exp(-4 * dt) * Math.sin(Math.min(dt / 0.12, 1) * Math.PI / 2 + Math.max(0, dt - 0.12) * 2 * Math.PI / 0.45);
      slide += h.dir * p * (1 - Math.exp(-6 * dt));
    }
  }
  return { angle, slide };
}

const keyAt = (keys: CharacterKey[], t: number) => keys.reduce((best, k) => (Math.abs(k.t - t) < Math.abs(best.t - t) ? k : best), keys[0]);

type Striker = { id: string; facing: string; energy?: number; actions: { move: string; params?: Record<string, unknown>; energy?: number }[] };

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
      // (the strike's power: measured in a fight, else the move's own energy — a soft kick is soft, a hard one hard)
      out.push({ t, power: power[`${c.id}.strike${k}`] ?? a.energy ?? c.energy ?? 0.6, dir, kick: a.move === "kick", height: String(a.params?.height ?? "mid"), ...(typeof a.params?.toward === "number" ? { aimX: a.params.toward as number } : {}) });
    }
  }
  return out;
}

// Keys for a still object (one key, nobody holding it) that is hit: its reaction, sampled every 1/24 s.
// A STRUCK BALL FLIES (Arthur, Oct 12: "it looks like he kicked pretty hard on the ball, but it barely moved… like it was glued to
// the ground"): a ball kicked or punched leaves at a speed from the strike's power (cause → effect: a hard kick sends it far), on an
// arc for the kick's height (low skims, high lofts), falls with gravity, bounces lower each time, rolls, slows to a stop — and
// bounces back off the page edges instead of leaving.
const BALL_G = 5.8; // x height per second², real gravity for a ~1.7 m figure
function ballFlight(o: SceneObject, hit: ThingHit, height: number, groundY: number, end: number, pageWidth: number, walls: readonly SolidWall[] = []): ObjectKey[] {
  const k0 = o.keys[0], r = objectHalfExtents(o.look, 0, 1, 1).halfH, floor = groundY - r;
  const p = Math.min(1.2, Math.max(0.2, hit.power));
  let vx = hit.dir * (1 + 7 * p * p) * height, vy = -(hit.kick ? ({ low: 0.6, mid: 1.6, high: 2.6 } as Record<string, number>)[hit.height ?? "mid"] ?? 1.6 : 1.2) * (0.6 + 0.6 * p) * height;
  const dt = 1 / 24, lo = 0.03 * pageWidth + r, hi = 0.97 * pageWidth - r;
  // (NO INVISIBLE WALL — Arthur, Oct 12: the page-edge bounce "looks like the end of the world": if this kick would carry the ball off
  // the page, it leaves a little softer, so it rolls to a natural stop before the edge)
  const fly = (vx0: number, write: boolean) => {
    let x = k0.x, y = Math.min(k0.y, floor), rot = 0, vxx = vx0, vyy = vy, far = 0;
    const keys: ObjectKey[] = [k0];
    for (let t = hit.t; t <= end + 1e-6; t += dt) {
      if (write) keys.push({ t, x, y, rotation: rot, ease: "linear" });
      vyy += BALL_G * height * dt; const x0 = x; x += vxx * dt; y += vyy * dt; rot += (vxx * dt / Math.max(1, r)) * (180 / Math.PI);
      if (walls.length) ({ x, vx: vxx } = bounceOffWalls(walls, t, x0, x, y, vxx, r));
      if (y >= floor) { y = floor; vyy = Math.abs(vyy) > 0.5 * height ? -Math.abs(vyy) * 0.5 : 0; vxx *= vyy === 0 ? Math.exp(-2.2 * dt) : 0.8; }
      far = Math.max(far, vx0 > 0 ? x - hi : lo - x);
    }
    return { keys, far };
  };
  for (let tries = 0; tries < 8 && fly(vx, false).far > 0; tries += 1) vx *= 0.8;
  // (AIMED — Arthur, Oct 12: "the user said kick it into the goal… he kicked the ball wherever he wanted": a struck ball aimed at a
  // spot — a goal, a net, a hoop, a target, or "toward": x — leaves at the speed that carries it right there)
  if (hit.aimX !== undefined && Math.sign(hit.aimX - k0.x) === Math.sign(vx || 1)) {
    const stopAt = (v: number) => { const ks = fly(v, true).keys; return ks[ks.length - 1].x; };
    let lo2 = 0.05 * Math.abs(vx), hi2 = 3 * Math.abs(vx);
    for (let it = 0; it < 18; it += 1) { const mid = (lo2 + hi2) / 2; if (Math.abs(stopAt(Math.sign(vx) * mid) - k0.x) < Math.abs(hit.aimX - k0.x)) lo2 = mid; else hi2 = mid; }
    vx = Math.sign(vx) * (lo2 + hi2) / 2;
  }
  return fly(vx, true).keys;
}
export function objectReacts(o: SceneObject, hits: ThingHit[], height: number, groundY: number, end: number, pageWidth = 1920, walls: readonly SolidWall[] = []): SceneObject {
  if (!hits.length || o.keys.length !== 1 || o.segments?.length) return o;
  const k0 = o.keys[0], { halfW, halfH } = objectHalfExtents(o.look, 0, 1, 1);
  const isBall = (o.look as { kind?: string } | undefined)?.kind === "ball";
  if (isBall && 2 * Math.max(halfW, halfH) < LIGHT_THING * height) { const h0 = hits.reduce((a, b) => (b.t < a.t ? b : a)); return { ...o, keys: ballFlight(o, h0, height, groundY, end, pageWidth, walls), struckFlight: [h0.t, end] } as SceneObject; }
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
  const walls = solidWalls((scene as { effects?: EffectTrack[] }).effects, height, scene.groundY);
  const objects = (scene.objects ?? []).map((o) => {
    if (o.keys.length !== 1 || o.segments?.length) return o;
    const { halfW } = objectHalfExtents(o.look, 0, 1, 1);
    // (a goal, net, hoop, basket or target in the scene is where a struck ball is aimed, unless the strike says "toward")
    const goals = (((scene as { effects?: { kind?: string; anchor?: { x?: number }; params?: Record<string, unknown> }[] }).effects) ?? []).filter((e) => e.kind === "prop" && typeof e.anchor?.x === "number" && /goal|net|hoop|basket|target|bin|bucket/i.test(String(e.params?.name ?? e.params?.symbol ?? e.params?.scriptId ?? ""))).map((e) => e.anchor!.x as number);
    const hits = hitsOn(o.id, o.keys[0].x, halfW, height, characters, built, marks, power).map((h) => h.aimX !== undefined || !goals.length ? h : { ...h, aimX: goals.filter((gx) => Math.sign(gx - o.keys[0].x) === h.dir).sort((a, b) => Math.abs(a - o.keys[0].x) - Math.abs(b - o.keys[0].x))[0] });
    return objectReacts(o, hits, height, scene.groundY, scene.durationSec, Number((scene as { stageWidth?: number }).stageWidth ?? 1920), walls);
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
