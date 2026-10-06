import type { Ease } from "./easing.ts";
import type { ObjectKey } from "./engine.ts";
import type { Point } from "./rig.ts";

// SPEC-0017 object moves. Each returns ObjectKeys for a SceneObject (plus useful moments). Same motion
// lesson as the figures: everything speeds up and slows down smoothly, with anticipation where it makes
// sense, and real physics where it applies (falling, bouncing, thrown arcs).
// All times are seconds; `t0` (default 0) is when the move starts. Positions are object centers, stage px.

export type ObjectMotion = { keys: ObjectKey[]; start: number; end: number };

// Gravity on the 1920x1080 stage: a 300 px figure is about 1.75 m, so about 170 px per meter, times
// 9.8 m/s², a little stronger for snappier cartoon timing.
export const GRAVITY = 2000;

// Seconds a thrown object takes over an arc that rises `apex` px above the higher end (gravity-consistent).
// Use it to choose a flight segment's length: flight from `from` to `from + flightTime(...)`.
export function flightTime(fromY: number, toY: number, apex: number, gravity = GRAVITY) {
  const top = Math.min(fromY, toY) - Math.max(0, apex);
  return Math.sqrt((2 * (fromY - top)) / gravity) + Math.sqrt((2 * (toY - top)) / gravity);
}

// Joins key lists made one after another (drops a key that starts where the previous list ended).
export function concatKeys(...lists: ObjectKey[][]): ObjectKey[] {
  const out: ObjectKey[] = [];
  for (const list of lists) for (const key of list) {
    if (out.length > 0 && key.t <= out[out.length - 1].t + 1e-9) continue;
    out.push(key);
  }
  return out;
}

// Inverse of smoothstep (3u² - 2u³): the time share at which an eased move has covered share p.
const smoothstepInverse = (p: number) => 0.5 - Math.sin(Math.asin(1 - 2 * Math.min(1, Math.max(0, p))) / 3);
const rollAngle = (dx: number, size: number) => ((dx / (size / 2)) * 180) / Math.PI;

export type SlideOptions = {
  t0?: number;
  via?: Point[]; // pass through these points on the way (smooth curve)
  anticipate?: number; // px to back up first (only without `via`)
  rollSize?: number; // a ball of this size rolls (turns) as it slides sideways
  rotation?: number; // starting rotation (degrees)
  scale?: number;
};

// Slides from one place to another: speeds up, glides, slows down and stops.
export function slide(from: Point, to: Point, seconds: number, opts: SlideOptions = {}): ObjectMotion {
  const t0 = opts.t0 ?? 0, rotation0 = opts.rotation ?? 0, scale = opts.scale ?? 1;
  const key = (t: number, p: Point): ObjectKey => ({
    t, x: p.x, y: p.y, scaleX: scale, scaleY: scale,
    rotation: opts.rollSize ? rotation0 + rollAngle(p.x - from.x, opts.rollSize) : rotation0,
  });
  const keys: ObjectKey[] = [key(t0, from)];
  const via = opts.via ?? [];
  if (via.length === 0 && opts.anticipate) {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const back = { x: from.x - ((to.x - from.x) / length) * opts.anticipate, y: from.y - ((to.y - from.y) / length) * opts.anticipate };
    keys.push(key(t0 + seconds * 0.2, back));
  } else {
    // Via points are placed in time so the whole trip still eases in and out.
    const points = [from, ...via, to];
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    const total = cumulative[cumulative.length - 1] || 1;
    for (let i = 1; i < points.length - 1; i += 1) keys.push(key(t0 + seconds * smoothstepInverse(cumulative[i] / total), points[i]));
  }
  keys.push(key(t0 + seconds, to));
  return { keys, start: t0, end: t0 + seconds };
}

export type BounceOptions = {
  height: number; // px: first drop height (or, from the ground, the first throw's height)
  bounces: number; // bounces after the first landing
  groundY: number;
  size: number; // ball size (diameter)
  startY?: number; // center at the start (default: `height` above resting on the ground). On the ground = thrown up.
  dx?: number; // total px travelled sideways before coming to rest (+ right, - left; default 0 = in place)
  t0?: number;
  gravity?: number; // px/s² (default GRAVITY)
  restitution?: number; // each bounce reaches this share of the previous height (default 0.6)
  squash?: number; // squash at the first landing (0.25 = 25% flatter); harder landings squash more
  fps?: number; // when given, every squash lasts at least one frame so it always shows
  rotation?: number; // starting rotation (degrees)
  roll?: boolean; // turns as it travels (default: true when dx ≠ 0)
};
export type BounceArc = { start: number; apex: number; end: number; height: number }; // leaves the ground, top, lands
export type BounceMotion = ObjectMotion & { contacts: number[]; arcs: BounceArc[] };

// A dropped (or tossed-up) ball bouncing to rest, in place or travelling sideways. Real parabolas: each
// bounce reaches `restitution` of the last height and takes time ∝ √height. The ball squashes for a
// moment at each landing (anticipating the bounce back up), stretches while it moves fast, and settles.
export function bounce(at: { x: number }, opts: BounceOptions): BounceMotion {
  const dx = opts.dx ?? 0;
  if (dx === 0) return bounceWithSpeed(at.x, opts, 0);
  const unitDistance = bounceWithSpeed(at.x, opts, 1).distance;
  return bounceWithSpeed(at.x, opts, unitDistance > 0 ? dx / unitDistance : 0);
}

function bounceWithSpeed(x0: number, opts: BounceOptions, speed0: number): BounceMotion & { distance: number } {
  const r = opts.size / 2, g = opts.gravity ?? GRAVITY, keep = opts.restitution ?? 0.6, squash0 = opts.squash ?? 0.25, stretch0 = 0.12;
  const restY = opts.groundY - r, t0 = opts.t0 ?? 0, rotation0 = opts.rotation ?? 0;
  const roll = opts.roll ?? (opts.dx ?? 0) !== 0;
  const plateau = Math.max(0.05, opts.fps ? 1 / opts.fps : 0), touch = 0.02; // full-squash time; time to squash/unsquash
  const onGround = opts.startY !== undefined && opts.startY >= restY - 0.5;
  const firstHeight = Math.max(1, opts.startY !== undefined && !onGround ? restY - opts.startY : opts.height);
  const keys: ObjectKey[] = [], contacts: number[] = [], arcs: BounceArc[] = [];
  let t = t0, x = x0, speed = speed0;
  const key = (y: number, scaleX: number, scaleY: number, yEase: Ease, ease: Ease = "linear", xEase: Ease = "linear") =>
    keys.push({ t, x, y, scaleX, scaleY, rotation: roll ? rotation0 + rollAngle(x - x0, opts.size) : rotation0, yEase, ease, xEase });
  const advance = (seconds: number) => { t += seconds; x += speed * seconds; };
  const stretchFor = (h: number) => stretch0 * Math.sqrt(Math.max(0, h) / firstHeight);
  const squashFor = (h: number) => squash0 * Math.sqrt(Math.max(0, h) / firstHeight);
  // On the ground, squashed by `s` (bottom stays on the ground).
  const squashed = (s: number, yEase: Ease) => key(opts.groundY - r * (1 - s), 1 + s * 0.7, 1 - s, yEase);
  // Leaving / touching the ground, stretched by `s` along the motion.
  const stretched = (s: number, yEase: Ease) => key(opts.groundY - r * (1 + s), 1 - s * 0.6, 1 + s, yEase);
  const arc = (h: number) => {
    const half = Math.sqrt((2 * h) / g), start = t;
    stretched(stretchFor(h), "out"); // rising: slows down to the top
    advance(half);
    const apex = t;
    key(restY - h, 1, 1, "in"); // falling: speeds up
    advance(half);
    arcs.push({ start, apex, end: t, height: h });
  };

  const heights: number[] = [];
  for (let k = 1, h = firstHeight * keep; k <= opts.bounces && h >= 1; k += 1, h *= keep) heights.push(h);

  if (onGround) {
    // Anticipation: a little squash before the toss up.
    key(restY, 1, 1, "smooth", "smooth");
    t += 0.1;
    squashed(squashFor(firstHeight) * 0.6, "linear");
    t += plateau;
    squashed(squashFor(firstHeight) * 0.6, "linear");
    t += touch;
    arc(firstHeight);
  } else {
    key(restY - firstHeight, 1, 1, "in"); // dropped: falls, speeding up
    advance(Math.sqrt((2 * firstHeight) / g));
  }

  const landing = (h: number, last: boolean) => {
    contacts.push(t);
    stretched(stretchFor(h), "linear");
    advance(touch);
    squashed(squashFor(h), "linear");
    advance(plateau);
    squashed(squashFor(h), "linear");
    if (!last) { speed *= 0.85; advance(touch); }
  };
  let lastHeight = firstHeight;
  for (const h of heights) { landing(lastHeight, false); arc(h); lastHeight = h; }
  landing(lastHeight, true);

  // Comes to rest: round again, and (if travelling) rolls on a little, slowing to a stop.
  const settle = 0.15;
  const rollSec = speed !== 0 ? 0.5 : 0;
  const s = squashFor(lastHeight), xStart = x, tStart = t, end = t + Math.max(settle, rollSec);
  const steps = Math.max(1, Math.round((end - tStart) / 0.05));
  for (let i = 1; i <= steps; i += 1) {
    const u = i / steps, elapsed = (end - tStart) * u;
    const back = Math.min(1, elapsed / settle), soft = 1 - back * back * (3 - 2 * back); // squash left
    const rollU = rollSec > 0 ? Math.min(1, elapsed / rollSec) : 1;
    t = tStart + elapsed;
    x = xStart + speed * rollSec * 0.5 * (1 - (1 - rollU) * (1 - rollU)); // slows evenly to a stop
    key(opts.groundY - r * (1 - s * soft), 1 + s * soft * 0.7, 1 - s * soft, "linear");
  }
  return { keys, start: t0, end, contacts, arcs, distance: x - x0 };
}

export type SpinOptions = { t0?: number; startRotation?: number; windUp?: number /* degrees backward first; default up to 15 */; scale?: number };

// Spins in place: a small wind-up the other way, speeds up, spins, slows down and stops.
export function spin(at: Point, turns: number, seconds: number, opts: SpinOptions = {}): ObjectMotion {
  const t0 = opts.t0 ?? 0, r0 = opts.startRotation ?? 0, total = turns * 360, dir = Math.sign(total) || 1, scale = opts.scale ?? 1;
  const windUp = opts.windUp ?? Math.min(15, Math.abs(total) * 0.05);
  const key = (share: number, rotation: number): ObjectKey => ({ t: t0 + seconds * share, x: at.x, y: at.y, rotation, scaleX: scale, scaleY: scale });
  const keys = windUp > 0
    ? [key(0, r0), key(0.15, r0 - dir * windUp), key(0.35, r0 + total * 0.2), key(0.75, r0 + total * 0.8), key(1, r0 + total)]
    : [key(0, r0), key(0.3, r0 + total * 0.15), key(0.7, r0 + total * 0.85), key(1, r0 + total)];
  return { keys, start: t0, end: t0 + seconds };
}

export type GrowShrinkOptions = { t0?: number; pop?: boolean /* overshoot then settle; default when growing */; anticipate?: boolean /* swell a little before shrinking; default when shrinking */; rotation?: number };

// Grows or shrinks smoothly. Growing pops (goes a bit past, then settles); shrinking first swells a little.
export function growShrink(at: Point, fromScale: number, toScale: number, seconds: number, opts: GrowShrinkOptions = {}): ObjectMotion {
  const t0 = opts.t0 ?? 0, rotation = opts.rotation ?? 0, growing = toScale > fromScale;
  const key = (share: number, scale: number): ObjectKey => ({ t: t0 + seconds * share, x: at.x, y: at.y, rotation, scaleX: scale, scaleY: scale });
  const keys = [key(0, fromScale)];
  if (growing && (opts.pop ?? true)) keys.push(key(0.65, toScale + (toScale - fromScale) * 0.15));
  if (!growing && toScale < fromScale && (opts.anticipate ?? true)) keys.push(key(0.2, fromScale * 1.06));
  keys.push(key(1, toScale));
  return { keys, start: t0, end: t0 + seconds };
}
