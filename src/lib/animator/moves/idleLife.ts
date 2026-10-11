// SPEC-0021 NEW COPY: carried over from the rejected copy (NOBODY FREEZES — Arthur's "everything animated" law): a figure that
// waits keeps breathing, shifting its weight a little; never a statue, never a drunk sway (TIMING.idle).
import type { CharacterKey } from "../engine.ts";
import { POSE_KEYS, STAND, type Facing, type PoseAngles } from "../rig.ts";
import { onTheGround } from "./turn.ts";
import { TIMING } from "./timing.ts";

// NOBODY FREEZES (Arthur, Block 1, 2026-10-09: "a lot of action, a lot of movement, not a lot of standing, not a lot of
// breaks"). A figure that has nothing to do for more than IDLE_MIN while the scene goes on — waiting for its moment in a
// fight, standing after its part is done, a long held pose — is never a statue: it gets life that fits the moment.
// - A FIGHTER keeps a bouncing guard: the knees dip and rise in a quick rhythm, the weight rocks forward and back.
// - ANYONE ELSE breathes, shifts its weight from foot to foot and looks around now and then.
// The planted feet stay exactly where they are (the engine locks them and re-bends the knees), the arms keep what they
// hold, and every still span starts and ends on its own keys — so every hit, catch and mark keeps its exact moment.
// Only spans where the figure stands on both feet (not lying, sitting, in the air or floating) get life; the last
// short beat of the scene stays a pose to read.
//
// THE SCENE ENDS WHEN THE STORY ENDS (same day): storyEndOf says when a figure's last real motion ends (the start of its
// final still pose), so the planner can end the scene END_BEAT after the last action instead of after long empty holds.

export const IDLE_MIN = 0.5; // s: stiller than this, mid-scene, is a freeze
export const END_BEAT = 0.7; // s: the pose to read after the story's last action
const FINAL_MIN = 1.2; // s: the final still pose only gets life when it is longer than a pose to read
const ANGLE_TOL = 6; // degrees: breathing (a few degrees) is still standing
const MOVE_TOL = 0.02; // x height
const LIFT_TOL = 0.01; // x height

export type LifeKind = "fighter" | "calm";
export type LifeOptions = {
  height: number;
  facing: Facing;
  kind: LifeKind;
  end: number; // the scene's last second
  seed?: number; // a little variety between figures
  skip?: (from: number, to: number) => boolean; // spans that must stay as they are (holding a power's aim)
  armsFree?: boolean; // nothing in the hands, not cuffed, no weapon: the arms may swing a little
};
export type Span = { i: number; j: number; from: number; to: number };

const facingsOf = (keys: readonly CharacterKey[], facing: Facing) => {
  let now = facing;
  return keys.map((k) => (now = k.facing ?? now));
};
const near = (a: CharacterKey, b: CharacterKey, height: number) =>
  Math.abs(a.x - b.x) <= MOVE_TOL * height && Math.abs((a.lift ?? 0) - (b.lift ?? 0)) <= LIFT_TOL * height && POSE_KEYS.every((p) => Math.abs(a.pose[p] - b.pose[p]) <= ANGLE_TOL);
// Standing on both feet (the engine keeps them planted), not lying, sitting, kneeling or deep in a squat.
const standing = (k: CharacterKey) =>
  (k.contacts?.includes("lFoot") ?? false) && (k.contacts?.includes("rFoot") ?? false) && (k.lift ?? 0) <= 0.5 && k.minFps === undefined && !onTheGround(k.pose) && k.pose.lKnee < 70 && k.pose.rKnee < 70;

// Every span of more than `min` seconds where the figure stands still (breathing at most).
export function stillSpans(keys: readonly CharacterKey[], height: number, facing: Facing, min = IDLE_MIN): Span[] {
  const faces = facingsOf(keys, facing), spans: Span[] = [];
  for (let i = 0; i < keys.length - 1;) {
    let j = i;
    if (standing(keys[i])) while (j + 1 < keys.length && standing(keys[j + 1]) && faces[j + 1] === faces[i] && near(keys[i], keys[j + 1], height)) j += 1;
    if (j > i && keys[j].t - keys[i].t >= min) { spans.push({ i, j, from: keys[i].t, to: keys[j].t }); i = j; } else i += 1;
  }
  return spans;
}

// When the figure's last real motion ends: the first key of its final still pose (breathing doesn't count).
export function storyEndOf(keys: readonly CharacterKey[], height: number): number {
  const last = keys[keys.length - 1];
  if (!last) return 0;
  let k = keys.length - 1;
  while (k > 0 && near(keys[k - 1], last, height)) k -= 1;
  return keys[k].t;
}

const withPose = (pose: PoseAngles, change: Partial<PoseAngles>): PoseAngles => ({ ...pose, ...change });
// A breath in: chest up, shoulders rise a little (the same breath as turn.ts stand).
// (Hands that hold something, are cuffed or hold a weapon keep their arms exactly: only the chest and head breathe.)
const breath = (p: PoseAngles, deep: number, arms: boolean) => withPose(p, { lean: p.lean - 1.2 * deep, head: p.head - 1.5 * deep, ...(arms ? { lShoulder: p.lShoulder + 3 * deep, rShoulder: p.rShoulder + 3 * deep } : {}) });

// THE BOOK STAND (Phase C, W1 + W2 "idle standing → weight shift + breathing, never a statue"): a plain stand (every angle within
// PLAIN_STAND of the rig's STAND) with free hands rests in the pose book's "idle-relaxed" — the arms bent a little, the chest and
// head slightly forward, the front knee soft — while it breathes and shifts its weight (the feet stay planted: the engine locks
// them). Any other still pose (a guard, a held pose, hands busy) keeps its own shape.
export const PLAIN_STAND = 10; // degrees
export function relaxedStand(p: PoseAngles): PoseAngles {
  if (!POSE_KEYS.every((k) => Math.abs(p[k] - STAND[k]) <= PLAIN_STAND)) return p;
  // (Arthur's approved pose-book "idle-relaxed", Phase B — inlined: the pose book itself is not in this copy)
  const r = { lean: 3, head: 5, lShoulder: -1.4, rShoulder: -17, lElbow: 28.9, rElbow: 27.6, lHip: 29.9, rHip: -3.5, lKnee: 25.5, rKnee: 2 };
  // (the head stays level while waiting — Phase C3: the book's head 5° forward + the old nod read as "looking down")
  return withPose(p, { lean: r.lean, head: Math.min(r.head, p.head + 1), lShoulder: r.lShoulder, rShoulder: r.rShoulder, lElbow: r.lElbow, rElbow: r.rElbow, lKnee: Math.max(p.lKnee, Math.min(r.lKnee, 14)) });
}

// The life for one still span: [time, pose, x] beats strictly inside it (the span's own first and last keys stay).
function beatsFor(base: CharacterKey, from: number, to: number, o: LifeOptions): { t: number; pose: PoseAngles; x: number }[] {
  const H = o.height, out: { t: number; pose: PoseAngles; x: number }[] = [];
  const p = o.kind === "calm" && o.armsFree ? relaxedStand(base.pose) : base.pose;
  const inhale = (q: PoseAngles, deep = 1) => breath(q, deep, o.armsFree === true);
  const len = to - from, room = to - Math.min(0.25, len / 3); // the last beat leaves time to settle back into the span's last pose
  const jitter = (n: number) => 0.06 * Math.sin(1.7 * n + 2.3 * (o.seed ?? 0));
  if (o.kind === "fighter") {
    // BOUNCING GUARD: a dip and rise every half second, rocking a little forward and back each second.
    const half = 0.25;
    for (let n = 0, t = from + Math.min(half, len / 2); t < room; n += 1, t += half) {
      const dip = n % 2 === 0, rock = (Math.floor(n / 2) % 2 === 0 ? 1 : -1) * 0.03 * H;
      out.push(dip
        ? { t, pose: withPose(p, { lKnee: p.lKnee + 20, rKnee: p.rKnee + 20, lHip: p.lHip + 10, rHip: p.rHip + 10, lean: p.lean + 3 }), x: base.x + rock }
        : { t, pose: inhale(p, 0.6), x: base.x + rock * 0.4 });
    }
    return out;
  }
  // CALM: breathe in while the weight shifts onto one foot, breathe out, look around (the head turns away and back),
  // shift onto the other foot — about one beat every 0.7 s, a little different for every figure.
  const side = (o.seed ?? 0) % 2 === 0 ? 1 : -1;
  // (Free hands swing a little with the breath; hands that hold something, are cuffed or hold a weapon keep their pose.)
  const arms = (q: PoseAngles, k: number) => (o.armsFree ? withPose(q, { lElbow: Math.max(0, q.lElbow + 8 * k), rElbow: Math.max(0, q.rElbow + 6 * k), lShoulder: q.lShoulder + 5 * k, rShoulder: q.rShoulder - 4 * k }) : q);
  // NO DRUNK IDLE (Phase C3, Arthur on h-3: "looking down, straightens his leg, swings left-right like he's drunk"): the old cycle
  // swung the hips 0.09 H side to side (±0.045 H), nodded the head 14° (+8 down / −6 up) and bent both knees 8° every 0.6 s. Now
  // (moves/timing.ts TIMING.idle): a weight shift of at most ±0.015 H, the head within ±2° (level), the knees soft by 3°, one beat
  // every ≈ 0.6 s (the breath rhythm; never a statue: the free arms swing a little with each breath) — breathing and a small shift, nothing a viewer reads as a sway.
  const I = TIMING.idle;
  // (the weight shift is a real one: the hips go over one foot by ≤ 0.02 H and the OTHER knee goes soft — one knee at a time, never
  // both knees bobbing; the head stays level)
  const soft = (q: PoseAngles, leg: "l" | "r") => withPose(q, leg === "l" ? { lKnee: q.lKnee + I.kneeDeg } : { rKnee: q.rKnee + I.kneeDeg });
  // (two beats: over the left foot, then over the right — every beat differs from the last and from the stand, so no still span is left)
  const cycle = [
    (q: PoseAngles) => ({ pose: arms(soft(withPose(inhale(q, 1.2), { head: q.head - I.headDeg }), side > 0 ? "l" : "r"), 1), dx: side * I.shift }),
    (q: PoseAngles) => ({ pose: arms(soft(withPose(inhale(q, 0.4), { head: q.head + I.headDeg / 2 }), side > 0 ? "r" : "l"), -1), dx: -side * I.shift }),
  ];
  for (let n = 0, t = from + Math.min(0.5, len / 2); t < room; n += 1, t += I.beat + jitter(n)) {
    const beat = cycle[n % cycle.length](p);
    out.push({ t, pose: beat.pose, x: base.x + beat.dx * H });
  }
  return out;
}

// The figure's keys with life in every still span. Keys outside the spans, and each span's first and last key, are
// untouched.
export function idleLife(keys: CharacterKey[], o: LifeOptions): CharacterKey[] {
  const spans = stillSpans(keys, o.height, o.facing).filter((s) => {
    const last = s.j === keys.length - 1 || s.to >= o.end - 1e-3;
    if (last && s.to - s.from < FINAL_MIN) return false;
    return !o.skip?.(s.from, s.to);
  });
  if (!spans.length) return keys;
  const out: CharacterKey[] = [];
  let next = 0;
  for (const s of spans) {
    for (; next < s.i; next += 1) out.push(keys[next]);
    const base = keys[s.i];
    // (The final pose of the scene: life runs to the end, then settles back into it.)
    const to = Math.min(s.to, o.end);
    const beats = beatsFor(base, s.from, to, o);
    out.push(beats.length ? { ...base, ease: undefined, xEase: undefined } : base);
    for (const b of beats) out.push({ ...base, t: b.t, pose: b.pose, x: b.x, ease: undefined, xEase: undefined, liftEase: undefined, contacts: base.contacts });
    next = s.j; // the span's last key stays
  }
  for (; next < keys.length; next += 1) out.push(keys[next]);
  return out;
}

// THE SCENE ENDS WHEN THE STORY ENDS: the last moment anything still happens — a figure's last real motion, a thing
// still moving on its own keys, a dropped / tossed / thrown-away thing still falling and rolling (about STILL_ROLLING),
// an effect that happens during the story (a travelling one until it arrives, any other for its first EFFECT_SEEN
// seconds; a placed prop or scenery that is there from the start doesn't count). Infinity = keep the scene's length:
// the user asked for its timing (`pace: "asked"`), the plan sets `until`, or every figure only stands or waits (a
// deliberate "stand there" while something plays).
const STILL_ROLLING = 1.2;
const EFFECT_SEEN = 2;
type StoryPlan = { until?: number; pace?: string; height: number; characters: readonly { id: string; size?: number; actions: readonly { move: string }[] }[]; objects?: readonly { keys?: readonly { t: number }[] }[] };
type StoryEvent = { t: number; kind: string; drop?: unknown; toss?: unknown; away?: unknown };
type StoryEffect = { kind: string; start: number; end: number; target?: unknown; params?: unknown };
export function storyEnd(plan: StoryPlan, built: ReadonlyMap<string, readonly CharacterKey[]>, events: readonly StoryEvent[], effects: readonly StoryEffect[]): number {
  if (plan.until !== undefined || plan.pace === "asked") return Infinity;
  if (plan.characters.every((c) => c.actions.every((a) => a.move === "stand" || a.move === "wait"))) return Infinity;
  let t = 0;
  for (const c of plan.characters) {
    const keys = built.get(c.id);
    if (keys?.length) t = Math.max(t, storyEndOf(keys, plan.height * (c.size ?? 1)));
  }
  for (const o of plan.objects ?? []) for (const k of o.keys ?? []) t = Math.max(t, k.t);
  for (const e of events) if (e.kind === "release" && (e.drop || e.toss || e.away)) t = Math.max(t, e.t + STILL_ROLLING);
  for (const e of effects) {
    if (e.kind === "prop" || !Number.isFinite(e.end)) continue;
    // (Words on the screen are read to their end, like a travelling thing that must arrive.)
    const travels = e.kind === "text" || e.target !== undefined || (e.params as { path?: unknown } | undefined)?.path !== undefined;
    if (travels) t = Math.max(t, e.end);
    else if (e.start > 0.05) t = Math.max(t, Math.min(e.end, e.start + EFFECT_SEEN));
  }
  return t;
}
