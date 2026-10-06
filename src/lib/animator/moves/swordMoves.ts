import type { CharacterKey, FootContact } from "../engine.ts";
import type { Ease } from "../easing.ts";
import { forwardKinematics } from "../pose.ts";
import type { Facing, PoseAngles } from "../rig.ts";
import { dashPunch, type DashParams } from "./dash.ts";
import { beatsToKeys, forwardSign, type Beat, type BeatKind, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { feetOf, isRobot, legReach, STAND_HIP } from "./punch.ts";
import { PROPORTIONS } from "../rig.ts";
import { weaponOf, type Weapon } from "./weapons.ts";

// SPEC-0017 Phase 2C extras (2026-10-06): WEAPON MOVES (Arthur: "two stick figures fight with swords... everything the
// engine learned about fighting, but with swords"). Built from what the engine already knows — anticipation (a wind-up
// the opposite way), acceleration into the hit, impact timing (a hit stop on contact), follow-through, weight, planted
// feet, dashes and airborne moves — with these rules:
// THE WEAPON IS PART OF THE ARM. A held weapon lies along the forearm, the grip in the hand (effects/weapons.ts), so
// every pose here is written as WORLD angles of [upper arm, forearm = weapon] (degrees from straight down, forward +:
// 90 = pointing at the opponent, 180 = straight up, 270 = straight back). Where the weapon points is where the forearm
// points. Two-handed: both arms take the same angles (both hands on the grip).
// WEAPON TIMING (Arthur, review 1: "far too fast... like sped up 3 times... swords hitting faster than an explosion"):
// a sword fight is READABLE — every attack has a wind-up you can see, a swing that speeds up into the contact, a hit
// stop on the contact, a follow-through (or a rebound off the other blade) and a recovery: about 0.6-1 s per ordinary
// attack. Only a STRONG attack is fast, and only after a clear, longer wind-up (a coil): then it comes in very fast,
// and the rest is back at the normal pace.
// FOOTWORK (Arthur, review 1: "feet sliding"): feet never slide. Every change of distance is a real STEP — one foot
// lifts, travels in the air and is placed while the other stays planted (plant, lift, place) — stepping in to attack,
// stepping back to recover or to make room, giving ground when a block is driven back. (The only feet off the floor
// together are a hop: a dodge, a spin, a dash.)
// The moves (every one works with any weapon in the table, moves/weapons.ts):
// - swordSlash (`side`: "down" = from high behind the head down across, "up" = from low behind rising across: one
//   after the other they trace an X — the alternating LEFT, RIGHT slashes);
// - swordChop (overhead, two hands), swordThrust (straight out at the chest), swordSpin (a hop and a full turn building
//   speed into a slash), dashSlash (run, airborne with both hands on the weapon cocked back, SLASH on landing);
// - swordBlock (`height` "mid": weapon upright in front; "high": over the head against a chop; "low": angled across a
//   thrust — blade meets blade; `parry`: knocks it aside), swordDodge (a hop back out of reach), swordStep (steps in
//   or out in the guard), swordVictory (weapon raised high).
// The attacker is told what happens to the strike (`blocked`, `parried`) so the weapon REBOUNDS off the other weapon
// instead of cutting on through it; `strong` = a strong attack. Every move marks "begin"/"end" (the planner's WEAPON
// HOLD, weaponKeys below, keeps the weapon up in the guard outside them), "windFrom"/"windup" (the wind-up) and "hit"
// (contact; reactions are timed to it).

type Side = "l" | "r";
type Arm = readonly [number, number];
const other = (s: Side): Side => (s === "l" ? "r" : "l");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// The elbow bend that points the forearm (the weapon) at world angle f from an upper arm at u: it only bends one way
// (0..150); a forearm asked to point "behind" the upper arm stays straight.
const elbowFor = (u: number, f: number) => { const e = (((f - u) % 360) + 360) % 360; return e > 255 ? 0 : Math.min(150, e); };
const mix = (a: Arm, b: Arm, k: number): Arm => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

// THE GUARD WITH A WEAPON: the weapon hand low in front, the weapon pointing up and forward at the other one; the free
// hand back by the hip (one-handed). Relative to the body (it leans with it).
// (Held well up — 60 degrees above level — so two guards at fighting distance never cross blades or reach into the other's
// head: the weapon comes forward only when it is used.)
export const READY: Arm = [25, 150];
const FREE_READY: Arm = [-25, 50];
const FREE_BACK: Arm = [-35, 25]; // back for balance as the weapon goes forward
const FREE_UP: Arm = [40, 110]; // forward and up as the weapon winds back
const STANCE_LEAN = 8;
const DROP = 0.06; // x height: the knees bent in the stance
const STEP_LIFT = 0.05; // x height: how high a stepping foot lifts off the floor
const LEG = PROPORTIONS.thigh + PROPORTIONS.shin;
const STANCE_HALF = 0.13; // x height: in the guard the front foot is this far in front of the hips, the back foot behind

// WEAPON TIMING, base seconds (natural style, normal speed; the engine's style/speed/energy scale them as for every move).
// SMOOTH, NOT ROBOTIC (Arthur, review 2: "a pose, then the arm snaps ultra fast to the next pose, then a delay at that
// pose, then another snap"): THREE SPEEDS, measured by how fast the weapon's tip travels (figure heights a second) —
// WIND-UPS at a WALKING pace (slow, smooth, easing in), STRIKES at a RUNNING pace (fast, speeding up into the contact,
// never a teleport: a strong strike still takes 2-3 pictures at 12 a second), EVERYTHING ELSE (steps, guards, blocks
// moving into place, follow-throughs, recoveries) at a JOGGING pace. A phase takes at least its base seconds, and longer
// if its tip has further to go at its pace. Motion flows from pose to pose — the arms keep moving through the steps,
// the follow-through runs on into the recovery — with no frozen holds; the only stop is the planned hit stop.
export const PACE = { walk: 4.5, jog: 5.5, run: 9, strongRun: 11 };
export const SWORD_TIMING = {
  wind: 0.5, // an ordinary wind-up (walking pace)
  coil: 0.6, // a strong attack's longer wind-up
  swing: 0.27, // an ordinary swing, speeding up into the contact (running pace)
  fast: 0.21, // a strong attack's swing: very fast — but 2+ pictures at 12 a second
  stop: 0.06, // the hit stop on the contact
  follow: 0.24, // follow-through / rebound (jogging pace)
  step: 0.28, // one foot's step (lift and place)
  closeIn: 0.17, // a step closing in or making room before an attack (quick: a jogging pace for the feet)
  recover: 0.2, // a step back out after an exchange
};
// How far the weapon's tip travels (x height) when the arm goes from one look to another: the upper arm turning swings
// it by its length, the forearm (and the weapon along it) by theirs.
export const tipTravel = (a: Arm, b: Arm) => ((Math.abs(b[0] - a[0]) * 0.16 + Math.abs(b[1] - a[1]) * 0.68) * Math.PI) / 180;
const paced = (base: number, a: Arm, b: Arm, pace: number) => Math.max(base, tipTravel(a, b) / pace);

// One key pose: body lean, the weapon arm, the free arm ("both": on the grip too), and where the feet are (x height,
// from the hips, forward +); `lifted`: that foot is off the floor by `liftBy` (stepping).
function swordPose(lean: number, hand: Side, arm: Arm, free: Arm | "both", feet: Record<Side, number>, drop: number, head = 0, lifted?: Side, liftBy = 0): PoseAngles {
  const p = { lean, head } as PoseAngles;
  const setArm = (side: Side, [u, f]: Arm) => {
    p[`${side}Shoulder`] = u + lean;
    p[`${side}Elbow`] = elbowFor(u, f);
  };
  setArm(hand, arm);
  setArm(other(hand), free === "both" ? [arm[0] - 4, arm[1]] : free);
  for (const side of ["l", "r"] as Side[]) {
    const leg = legReach(lean, { x: feet[side], y: STAND_HIP - drop - (side === lifted ? liftBy : 0) });
    p[`${side}Hip`] = leg.hip;
    p[`${side}Knee`] = leg.knee;
  }
  return p;
}

// A beat of a weapon move: hips at `at` (x height forward of where the move started), the front foot F and back foot B
// at `f` / `b` (x height from where the hips started), which feet are planted from this key on.
type SB = {
  kind: BeatKind; seconds: number; lean: number; arm: Arm; free: Arm | "both"; at: number; f: number; b: number; drop?: number;
  plant?: ("F" | "B")[]; lift?: number; name?: string; recover?: boolean; facing?: Facing; legs?: Partial<PoseAngles>; head?: number;
  lifted?: "F" | "B"; liftBy?: number; ease?: Ease; release?: boolean; xEase?: Ease; liftEase?: Ease;
};

// NO FOOT SLIDING, EVER (Arthur: "never a small foot slide — unless the user asks"): the engine locks a planted foot where
// it is in the first picture after it lands, and between two keys the leg angles are blended — so a long beat with the
// body moving over its planted feet lets a foot wander a few px before the lock (and pop back when it lifts). So every
// beat with a foot on the floor is cut into short pieces (KEY_STEP seconds), each with its legs solved again to its
// planted feet: wherever a picture falls, the feet are exactly where they stand. (The motion keeps its timing curve: the
// pieces follow the beat's own easing.)
const KEY_STEP = 0.02;
const easeOfKind = (kind: BeatKind, ease?: Ease) => {
  const e = ease ?? ({ anticipation: "smooth", action: "in", follow: "out", settle: "smooth", hold: "smooth" } as const)[kind];
  return (u: number) => (e === "linear" ? u : e === "in" ? u * u : e === "out" ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u));
};
function finerBeats(beats: SB[]): SB[] {
  const out: SB[] = [];
  beats.forEach((s, i) => {
    const prev = out[out.length - 1];
    const n = Math.floor(s.seconds / KEY_STEP);
    // (Not a strike's own swing — its easing into the contact stays the engine's — nor a turn or a hop.)
    if (!prev || n < 2 || s.kind === "action" || s.facing || s.legs || prev.legs || prev.facing || !(s.plant ?? ["F", "B"]).length || s.release) { out.push(s); return; }
    const ease = easeOfKind(s.kind, s.ease);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const freeOf = (l: SB): Arm => (l.free === "both" ? [l.arm[0] - 4, l.arm[1]] : l.free);
    for (let j = 1; j <= n; j += 1) {
      const k = ease(j / n), last = j === n;
      out.push({
        ...s, seconds: s.seconds / n, ease: "smooth",
        lean: lerp(prev.lean, s.lean, k), arm: mix(prev.arm, s.arm, k), free: prev.free === "both" && s.free === "both" ? "both" : last ? s.free : mix(freeOf(prev), freeOf(s), k),
        at: lerp(prev.at, s.at, k), f: lerp(prev.f, s.f, k), b: lerp(prev.b, s.b, k), drop: lerp(prev.drop ?? DROP, s.drop ?? DROP, k),
        ...(s.lifted ? { liftBy: lerp(prev.lifted === s.lifted ? prev.liftBy ?? STEP_LIFT : 0, s.liftBy ?? STEP_LIFT, k) } : {}),
        name: last ? s.name : undefined, recover: j === 1 ? s.recover : undefined,
      });
    }
    void i;
  });
  return out;
}

function swordKeys(start: Stance, settings: MoveSettings, hand: Side, beatsIn: SB[]): MoveOutput {
  const H = settings.height, f0 = feetOf(start.pose);
  const beats = finerBeats(beatsIn);
  // (A foot's let-go key keeps the legs where they are, but the arms and body flow on toward the next pose — no stop.)
  beats.forEach((s, i) => {
    const prev = beats[i - 1], next = beats[i + 1];
    if (!s.release || !prev || !next) return;
    const k = s.seconds / (s.seconds + next.seconds);
    s.arm = mix(prev.arm, next.arm, k);
    if (prev.free !== "both" && next.free !== "both") s.free = mix(prev.free, next.free, k);
  });
  // The front foot is the one further forward (the weapon side when even).
  const F: Side = Math.abs(f0.l - f0.r) < 0.01 ? hand : f0.l > f0.r ? "l" : "r", B = other(F);
  const startSign = forwardSign(start.facing);
  let prevAt = 0, facing: Facing = start.facing;
  const plain: Beat[] = beats.map((s) => {
    const feet = { [F]: s.f - s.at, [B]: s.b - s.at } as Record<Side, number>;
    // (FEET THAT REALLY REACH THE FLOOR: the hips sink as low as it takes for both planted legs to reach their feet — a
    // long lunge is a low one — so a planted foot is never pulled along by a leg that is too short.)
    const lifted = s.lifted ? (s.lifted === "F" ? F : B) : undefined;
    // (A foot just lifting counts too, so the hips don't bob up as it leaves the floor.)
    const reach = Math.min(...(["l", "r"] as Side[]).filter((side) => side !== lifted || s.liftBy !== undefined).map((side) => Math.sqrt(Math.max(0, (0.985 * LEG) ** 2 - feet[side] ** 2))));
    const drop = Math.max(s.drop ?? DROP, STAND_HIP - reach);
    let pose = swordPose(s.lean, hand, s.arm, s.free, feet, drop, s.head ?? 0, lifted, s.liftBy ?? STEP_LIFT);
    if (s.legs) pose = { ...pose, ...s.legs };
    // (Travel is given on the stage the way the move started facing; a beat that starts turned the other way moves
    // the other way round.)
    const dx = ((s.at - prevAt) * H * startSign) / forwardSign(facing);
    prevAt = s.at;
    facing = s.facing ?? facing;
    const plant = s.plant ?? ["F", "B"];
    const contacts = plant.map((k) => `${k === "F" ? F : B}Foot` as FootContact);
    return { kind: s.kind, seconds: s.seconds, pose, dx, lift: (s.lift ?? 0) * H, contacts, ...(s.name ? { name: s.name } : {}), ...(s.recover ? { recover: true } : {}), ...(s.facing ? { facing: s.facing } : {}), ...(s.ease ? { ease: s.ease } : {}), ...(s.xEase ? { xEase: s.xEase } : {}), ...(s.liftEase ? { liftEase: s.liftEase } : {}) };
  });
  // (WEAPON TIMING sets the pace of these moves itself — the three speeds — so the style's and energy's own stretching
  // of beats is left out; a robot still has no wind-ups.)
  const out = beatsToKeys(start, plain, settings.style === "robot" ? settings : { ...settings, style: "natural", speed: "normal", energy: 0.5 });
  out.marks.begin = start.t;
  out.marks.end = out.end.t;
  return out;
}

// FOOTWORK: a move's beats written as what the body does with its feet where they are, and STEPS (plant, lift, place).
type Look = { lean: number; arm: Arm; free: Arm | "both"; drop?: number; head?: number };
class Footwork {
  beats: SB[] = [];
  at = 0;
  f: number;
  b: number;
  // (`from`: how the body stands when the move starts — the first step's arms move on from there.)
  from?: Look;
  constructor(f: number, b: number, from?: Look) { this.f = f; this.b = b; this.from = from; }
  // Both feet planted where they are; the body (and hips, `at`) moves over them.
  pose(kind: BeatKind, seconds: number, look: Look, o: { at?: number; name?: string; recover?: boolean; ease?: Ease } = {}) {
    if (o.at !== undefined) this.at = o.at;
    this.beats.push({ kind, seconds, ...look, at: this.at, f: this.f, b: this.b, plant: ["F", "B"], ...(o.name ? { name: o.name } : {}), ...(o.recover ? { recover: true } : {}), ...(o.ease ? { ease: o.ease } : {}) });
  }
  // A STEP of one foot `dx` (x height): it is let go and LIFTS (mostly up), TRAVELS (up in the air) and is PLACED (mostly
  // down) — never skimming along the floor; the other stays planted; the hips travel `hips`. `half` = the look half way
  // (the arms keep moving through a step); `ease1` / `ease2`: the eases into the lift and into the placing.
  step(which: "F" | "B", dx: number, hips: number, kind: BeatKind, seconds: number, look: Look, o: { half?: Look; half2?: Look; name?: string; recover?: boolean; ease1?: Ease; ease2?: Ease } = {}) {
    const keep: "F" | "B" = which === "F" ? "B" : "F";
    const last: Look | undefined = this.beats[this.beats.length - 1] ?? this.from;
    this.release([keep]);
    // (The arms keep moving through the step, evenly: a quarter of the way as the foot lifts, most of the way as it
    // lands — a hand going onto the grip too, never in one jump.)
    const grip = (l: { arm: Arm; free: Arm | "both" }): Arm => (l.free === "both" ? [l.arm[0] - 4, l.arm[1]] : l.free);
    const along = (k: number): Look => !last ? look : { ...look, lean: last.lean + (look.lean - last.lean) * k, arm: mix(last.arm, look.arm, k), free: last.free === "both" && look.free === "both" ? "both" : mix(grip(last), grip(look), k) };
    // (easing in: the arms start slowly as the foot lifts — no snap out of a still guard)
    const half = o.half ?? along(0.08), half2 = o.half2 ?? o.half ?? along(0.6);
    const foot = (k: number) => ({ f: this.f + (which === "F" ? k * dx : 0), b: this.b + (which === "B" ? k * dx : 0) });
    // (LIFT straight up first — the foot leaves the floor before it travels: never pulled along it.)
    // (...and the body doesn't turn while it lifts: the lean changes as the foot travels.)
    this.beats.push({ kind, seconds: 0.25 * seconds, ...half, lean: last?.lean ?? half.lean, drop: last?.drop ?? half.drop, at: this.at + 0.03 * hips, ...foot(0), plant: [keep], lifted: which, liftBy: 0.7 * STEP_LIFT, ...(o.recover ? { recover: true } : {}), ...(o.ease1 ? { ease: o.ease1 } : {}) });
    this.beats.push({ kind, seconds: 0.45 * seconds, ...half2, at: this.at + 0.9 * hips, ...foot(1), plant: [keep], lifted: which, ease: o.ease1 ? "linear" : "smooth" });
    this.at += hips;
    if (which === "F") this.f += dx; else this.b += dx;
    this.beats.push({ kind, seconds: 0.3 * seconds, ...look, at: this.at, f: this.f, b: this.b, plant: ["F", "B"], ...(o.name ? { name: o.name } : {}), ...(o.ease2 ? { ease: o.ease2 } : {}) });
  }
  // LET GO OF A FOOT only as it moves: the feet stay planted all through the beat before (a wind-up, a block), and a
  // moment's key at its end lets that foot go (planted feet are held between two keys that both list them).
  release(keep: ("F" | "B")[]) {
    const prev = this.beats[this.beats.length - 1];
    if (!prev || (prev.plant ?? ["F", "B"]).every((k) => keep.includes(k))) return;
    const { name: _n, recover: _r, ease: _e, ...same } = prev;
    this.beats.push({ ...same, kind: "settle", seconds: 0.012, plant: (prev.plant ?? ["F", "B"]).filter((k) => keep.includes(k)), release: true });
  }
  // A step of one foot TO a place (x height from where the hips started), the hips going to `hipsTo`.
  stepTo(which: "F" | "B", x: number, hipsTo: number, kind: BeatKind, seconds: number, look: Look, o: { half?: Look; name?: string; recover?: boolean } = {}) {
    this.step(which, x - (which === "F" ? this.f : this.b), hipsTo - this.at, kind, seconds, look, o);
  }
  // Steps in (or out) `A` x height in the guard — front foot then back foot going in, back then front going out, in as
  // many short steps as it needs — each pair ending in the GUARD STANCE (feet STANCE_HALF in front of and behind the hips).
  shift(A: number, look: Look, seconds = SWORD_TIMING.step) {
    const inStance = Math.abs(this.f - this.at - STANCE_HALF) < 0.03 && Math.abs(this.b - this.at + STANCE_HALF) < 0.03;
    if (Math.abs(A) < 0.005 && inStance) return;
    const n = Math.max(1, Math.ceil(Math.abs(A) / 0.5 - 1e-9)), from = this.at;
    // (SMOOTH, NOT ROBOTIC: the arms move on evenly through EVERY step — never all the way in the first step and then
    // frozen through the next one, which reads as a stop and a snap.)
    const start = this.beats[this.beats.length - 1] ?? this.from;
    const grip = (l: { arm: Arm; free: Arm | "both" }): Arm => (l.free === "both" ? [l.arm[0] - 4, l.arm[1]] : l.free);
    const part = (k: number): Look => !start ? look : { ...look, lean: start.lean + (look.lean - start.lean) * k, arm: mix(start.arm, look.arm, k), free: start.free === "both" && look.free === "both" ? "both" : mix(grip(start), grip(look), k) };
    for (let i = 1; i <= n; i += 1) {
      const to = from + (A * i) / n, mid = (this.at + to) / 2;
      const first = part((2 * i - 1) / (2 * n)), second = part((2 * i) / (2 * n));
      if (A >= 0) { this.stepTo("F", to + STANCE_HALF, mid, "settle", seconds, first); this.stepTo("B", to - STANCE_HALF, to, "settle", seconds, second); }
      else { this.stepTo("B", to - STANCE_HALF, mid, "settle", seconds, first); this.stepTo("F", to + STANCE_HALF, to, "settle", seconds, second); }
    }
  }
  // Both feet off the floor (a hop): they land where they are given.
  air(kind: BeatKind, seconds: number, look: Look & { legs?: Partial<PoseAngles>; facing?: Facing }, o: { at: number; f: number; b: number; lift?: number; name?: string }) {
    const fromFloor = (this.beats[this.beats.length - 1]?.plant ?? ["F", "B"]).length > 0;
    this.release([]);
    // (A PUSH-OFF goes UP first: off the floor before it travels — feet never skim along it.)

    this.at = o.at; this.f = o.f; this.b = o.b;
    this.beats.push({ kind, seconds, ...look, at: o.at, f: o.f, b: o.b, plant: [], lift: o.lift ?? 0, ...(o.name ? { name: o.name } : {}), ...(fromFloor ? { xEase: "in" as Ease, liftEase: "out" as Ease } : {}) });
  }
  land(kind: BeatKind, seconds: number, look: Look & { facing?: Facing }, o: { name?: string } = {}) {
    this.beats.push({ kind, seconds, ...look, at: this.at, f: this.f, b: this.b, plant: ["F", "B"], ...(o.name ? { name: o.name } : {}) });
  }
}

// The feet a move starts from (x height from the hips): front and back.
const startFeet = (start: Stance, hand: Side) => {
  const f0 = feetOf(start.pose), F: Side = Math.abs(f0.l - f0.r) < 0.01 ? hand : f0.l > f0.r ? "l" : "r";
  return { f: f0[F], b: f0[other(F)] };
};
// Where the weapon arm is when a move starts ([upper arm, forearm] world angles): a strike straight after another starts
// from its follow-through, and its wind-up is paced from there.
const armOf = (start: Stance, hand: Side): Arm => { const u = start.pose[`${hand}Shoulder`] - start.pose.lean; return [u, u + start.pose[`${hand}Elbow`]]; };
const lookAtStart = (start: Stance, hand: Side): Look => ({ lean: start.pose.lean, arm: armOf(start, hand), free: armOf(start, other(hand)) });
const handOf = (params: Record<string, unknown>, start: Stance): Side => (params.hand === "l" || params.hand === "r" ? params.hand : start.facing === "left" ? "r" : "l");
// (The marks every weapon move adds: where its wind-up starts, and its FAST SPAN — engine.ts fastSpans — for a strong
// swing: from the turn of the coil to just after the contact.)
function finish(out: MoveOutput, windFrom: number | undefined, strong: boolean, swingFrom?: number): MoveOutput {
  if (windFrom !== undefined) out.marks.windFrom = windFrom;
  const from = out.marks.windup ?? swingFrom;
  if (strong && from !== undefined && out.marks.hit !== undefined) { out.marks.fastFrom = from - 0.09; out.marks.fastTo = out.marks.hit + 0.09; }
  return out;
}

// THE ATTACKS. Each: (steps in or out, `advance` x height, when the director gives one) -> WIND-UP the opposite way
// (the weight back a little) -> the SWING: the front foot STEPS IN `lunge` x height and is placed as the weapon arrives
// ("hit"), speeding up all the way -> HIT STOP -> FOLLOW-THROUGH (or the REBOUND off a block / parry) -> the back foot
// steps up after the front one -> back to the guard, stepping back out (back foot, front foot). It ends `advance`
// further on (a strike straight after starts from the follow-through instead: pressing, `advance + lunge`).
type Path = { wind: Arm; hit: Arm; follow: Arm; windLean: number; hitLean: number; both?: boolean; lunge: number; drop: number; strong?: boolean };
export const STRIKES: Record<string, Path> = {
  // LEFT, RIGHT: high behind the head sweeping down across ("\"), then low behind rising across ("/").
  down: { wind: [165, 282], hit: [100, 124], follow: [42, 40], windLean: -4, hitLean: 14, lunge: 0.22, drop: 0.09 },
  up: { wind: [-62, -40], hit: [94, 120], follow: [140, 158], windLean: 16, hitLean: 8, lunge: 0.22, drop: 0.1 },
  // Overhead with both hands: raised high behind, brought straight down onto the head (or the raised weapon). Strong.
  chop: { wind: [176, 226], hit: [106, 112], follow: [52, 42], windLean: -8, hitLean: 18, both: true, lunge: 0.25, drop: 0.11, strong: true },
  // Straight out at the chest, the arm and weapon in one line. Strong.
  thrust: { wind: [-22, 86], hit: [88, 92], follow: [86, 90], windLean: -2, hitLean: 16, lunge: 0.32, drop: 0.13, strong: true },
};

// `last`: the last strike of an exchange (default) steps back out of range after it; otherwise (`last: false`) the next
// strike follows straight on from where this one stepped in — PRESSING.
// `stay`: AT STRIKING DISTANCE (an exchange — Arthur, Oct 6: "after the dash they should be standing… striking about every
// second"): the lunge is only a lunge — after the follow-through the front foot steps straight back to where it started
// (one step, the back foot planted throughout) and the next wind-up flows on from there: no walking in or out.
export type SwordStrikeParams = { hand?: Side; side?: "down" | "up"; advance?: number; lunge?: number; blocked?: boolean; parried?: boolean; strong?: boolean; last?: boolean; stay?: boolean; weapon?: string };

function strike(path: Path, start: Stance, params: SwordStrikeParams, settings: MoveSettings): MoveOutput {
  const hand = handOf(params, start), w = weaponOf(params.weapon), both = path.both || w.hands === 2;
  const strong = params.strong === true || path.strong === true;
  const { f, b } = startFeet(start, hand);
  const A = params.advance === undefined ? 0 : clamp(Number(params.advance), -0.7, 1);
  const L = clamp(Number(params.lunge ?? path.lunge), 0, 0.42);
  const free = (arm: Arm): Arm | "both" => (both ? "both" : arm);
  const guard: Look = { lean: STANCE_LEAN, arm: READY, free: w.hands === 2 ? "both" : FREE_READY };
  const T = SWORD_TIMING, fw = new Footwork(f, b, lookAtStart(start, hand));
  // CLOSE IN AT ONCE, THE WIND-UP ON THE WAY IN (round 5, lead: "never standing face to face"): quick steps in (or out),
  // and the weapon already winding back as the feet go — half way there by the time they are set.
  // (...as far as a walking pace gets it in the steps' time: quick steps never whip the weapon back.)
  const stepsTime = 2 * T.closeIn * Math.max(1, Math.ceil(Math.abs(A) / 0.5)), startArm = armOf(start, hand);
  const onTheWay = isRobot(settings) ? startArm : mix(startArm, path.wind, Math.min(0.5, (0.8 * PACE.walk * stepsTime) / Math.max(1e-3, tipTravel(startArm, path.wind))));
  // (A two-handed strike from a one-handed guard: the free hand only goes half way to the grip on the quick steps in, and
  // on onto it through the wind-up — never flung across in a picture.)
  const startFree = armOf(start, other(hand)), startBoth = Math.abs(startFree[0] - startArm[0] + 4) < 3 && Math.abs(startFree[1] - startArm[1]) < 3;
  const freeOnTheWay: Arm | "both" = both && !startBoth && !isRobot(settings) ? mix(startFree, [onTheWay[0] - 4, onTheWay[1]], 0.5) : free(FREE_UP);
  fw.shift(A, { lean: STANCE_LEAN, arm: onTheWay, free: freeOnTheWay }, T.closeIn);
  const approached = fw.beats.length > 0, windStart = approached ? onTheWay : startArm;
  if (approached) fw.beats[fw.beats.length - 1].name = "approached";
  const blocked = params.blocked === true || params.parried === true;
  // (A robot has no wind-up — engine rule — so its swing goes straight from the guard.)
  const from = isRobot(settings) ? windStart : path.wind;
  // (A robot has no wind-up: its "wind-up" pose is where the arm already is.)
  const windArm = isRobot(settings) ? windStart : path.wind;
  const coiled: Look = { lean: path.windLean - 4, arm: windArm, free: free(FREE_UP), drop: 0.07 };
  if (strong) {
    // A STRONG attack: the front foot STEPS IN as it COILS (longer and deeper: raise and step), then the swing comes in
    // VERY FAST from there, the weight driving onto the front foot.
    fw.step("F", L, 0.45 * L, "anticipation", paced(approached ? 0.6 * T.coil : T.coil, windStart, path.wind, PACE.walk), coiled, { half: { ...coiled, arm: mix(windStart, path.wind, 0.6), free: freeOnTheWay === "both" || !approached ? coiled.free : mix(freeOnTheWay, [path.wind[0] - 4, path.wind[1]], 0.6) }, name: "windup" });
    // (In two halves — speeding up, then flat out — so the planted feet's legs bend evenly and never drift.)
    const fastS = paced(T.fast, path.wind, path.hit, PACE.strongRun), midLean = (path.windLean - 4 + path.hitLean) / 2;
    fw.pose("action", fastS / 2, { lean: midLean, arm: mix(windArm, path.hit, 0.28), free: free(FREE_BACK), drop: (0.07 + path.drop) / 2 }, { at: A + 0.52 * L, ease: "in" });
    fw.pose("action", fastS / 2, { lean: path.hitLean, arm: path.hit, free: free(FREE_BACK), drop: path.drop }, { at: A + 0.6 * L, name: "hit", ease: "linear" });
  } else {
    // WIND-UP the opposite way, the weight back a little; then the SWING: the front foot steps in and is placed as the
    // weapon arrives — speeding up all the way into the contact.
    fw.pose("anticipation", paced(approached ? 0.6 * T.wind : T.wind, windStart, path.wind, PACE.walk), { lean: path.windLean, arm: windArm, free: free(FREE_UP), drop: 0.07 }, { at: A - 0.03, name: "windup" });
    fw.step("F", L, 0.55 * L + 0.03, "action", paced(T.swing, path.wind, path.hit, PACE.run), { lean: path.hitLean, arm: path.hit, free: free(FREE_BACK), drop: path.drop }, { half: { lean: (path.windLean + path.hitLean) / 2, arm: mix(from, path.hit, isRobot(settings) ? 0.3 : 0.08), free: free(FREE_UP), drop: path.drop }, half2: { lean: (path.windLean + path.hitLean) / 2, arm: mix(from, path.hit, isRobot(settings) ? 0.75 : 0.45), free: free(FREE_UP), drop: path.drop }, ease1: "in", ease2: "linear" });
    fw.beats[fw.beats.length - 1].name = "hit";
  }
  // HIT STOP on the contact (the weapon held on the other blade, or into the body).
  fw.pose("hold", T.stop, { lean: path.hitLean + 2, arm: blocked ? mix(path.hit, path.wind, 0.06) : mix(path.hit, path.follow, 0.12), free: free(FREE_BACK), drop: path.drop }, { name: "contact" });
  // FOLLOW-THROUGH, or the REBOUND off the other weapon (knocked back up and out, the body checked).
  const rebound = mix(path.hit, path.wind, params.parried ? 0.6 : 0.3);
  fw.pose("follow", paced(T.follow, path.hit, blocked ? rebound : path.follow, PACE.jog), { lean: blocked ? path.hitLean - 8 : path.hitLean + 4, arm: blocked ? rebound : path.follow, free: free(FREE_BACK), drop: DROP + 0.02 });
  if (params.stay === true) {
    // AT STRIKING DISTANCE: the front foot pushes straight back to where it started — the stance it struck from.
    fw.stepTo("F", A + STANCE_HALF, A, "settle", T.recover, guard, { name: "follow" });
  } else {
    // The back foot steps up after the front one, into the guard stance (a strike straight after starts from here).
    fw.stepTo("B", A + L - STANCE_HALF, A + L, "settle", T.recover, guard, { name: "follow" });
  }
  // The last strike of an exchange: BACK OUT OF RANGE — back foot, then front foot, step back half the lunge.
  if (params.last !== false && params.stay !== true) {
    fw.stepTo("B", A + 0.5 * L - STANCE_HALF, A + 0.75 * L, "settle", T.recover, guard);
    fw.stepTo("F", A + 0.5 * L + STANCE_HALF, A + 0.5 * L, "settle", T.recover, guard);
  }
  fw.pose("settle", 0.08, guard, { name: "ready", recover: true });
  const out = swordKeys(start, settings, hand, fw.beats);
  // (The wind-up starts with the first step in.)
  return finish(out, start.t, strong, out.marks.approached ?? start.t);
}

export const swordSlash = (start: Stance, params: SwordStrikeParams, settings: MoveSettings) => strike(STRIKES[params.side === "up" ? "up" : "down"], start, params, settings);
export const swordChop = (start: Stance, params: SwordStrikeParams, settings: MoveSettings) => strike(STRIKES.chop, start, params, settings);
export const swordThrust = (start: Stance, params: SwordStrikeParams, settings: MoveSettings) => strike(STRIKES.thrust, start, params, settings);

// Where a hand is (x height from the neck, forward +, down +) for side-view arm angles [upper arm, forearm].
const rad = (d: number) => (d * Math.PI) / 180;
const sideHand = ([u, f]: Arm) => ({ x: PROPORTIONS.upperArm * Math.sin(rad(u)) + PROPORTIONS.forearm * Math.sin(rad(f)), y: PROPORTIONS.upperArm * Math.cos(rad(u)) + PROPORTIONS.forearm * Math.cos(rad(f)) });
// A FRONT-VIEW arm (pose.ts: the left arm drawn on the left, angles outward +) putting its hand at (x, y) from the neck
// (x height, screen right +); the weapon arm's forearm (the blade) as near pointing down as it can (seen end on), or
// as near pointing UP as it can (`weapon: "up"`: the blade turned away from us — the far side of a turn).
function frontArmTo(side: Side, x: number, y: number, weapon: boolean | "up"): Partial<PoseAngles> {
  const s = side === "l" ? -1 : 1;
  let best = { cost: Infinity, a: 0, e: 0 };
  for (let a = -120; a <= 120; a += 2) for (let e = 0; e <= 150; e += 2) {
    const hx = s * (PROPORTIONS.upperArm * Math.sin(rad(a)) + PROPORTIONS.forearm * Math.sin(rad(a + e))), hy = PROPORTIONS.upperArm * Math.cos(rad(a)) + PROPORTIONS.forearm * Math.cos(rad(a + e));
    const cost = 100 * Math.hypot(hx - x, hy - y) + (weapon === "up" ? 0.3 * (1 + Math.cos(rad(a + e))) : weapon ? 0.3 * (1 - Math.cos(rad(a + e))) : 0) + 0.002 * Math.abs(a);
    if (cost < best.cost) best = { cost, a, e };
  }
  return { [`${side}Shoulder`]: best.a, [`${side}Elbow`]: best.e } as Partial<PoseAngles>;
}

// THE SPIN'S TURN (Arthur, Oct 6 night: "the 360 degree turn ... just a little bit faster, still having acceleration and
// deceleration"): the turn's beats run at this share of their first length (the coil before it — the anticipation — and
// the landing slash keep theirs).
const SPIN_TURN = 0.78;
// SPIN ATTACK (strong): steps in, COILS (crouched, both hands on the grip, the blade out in front), then a little hop and
// a full turn holding the sword out in front with both hands — landing into a big level slash; hit stop,
// follow-through, and it steps back out.
export function swordSpin(start: Stance, params: SwordStrikeParams, settings: MoveSettings): MoveOutput {
  const hand = handOf(params, start), w = weaponOf(params.weapon), both = w.hands === 2;
  const { f, b } = startFeet(start, hand);
  const A = params.advance === undefined ? 0 : clamp(Number(params.advance), -0.7, 1);
  const L = clamp(Number(params.lunge ?? 0.3), 0, 0.5);
  const away: Facing = start.facing === "left" ? "right" : "left";
  const free = (arm: Arm): Arm | "both" => (both ? "both" : arm);
  const guard: Look = { lean: STANCE_LEAN, arm: READY, free: free(FREE_READY) };
  const T = SWORD_TIMING, fw = new Footwork(f, b, lookAtStart(start, hand));
  const COIL: Arm = [15, 138]; // (the coil: both hands on the grip low in front, the blade out in front tipped well up — clear of the other one's hands close in)
  const spinStart = armOf(start, hand), spinWay: Arm = isRobot(settings) ? spinStart : mix(spinStart, COIL, 0.5);
  fw.shift(A, { lean: STANCE_LEAN, arm: spinWay, free: free(FREE_UP) }, T.closeIn);
  const approached = fw.beats.length > 0;
  if (approached) fw.beats[fw.beats.length - 1].name = "approached";
  // (The coil: crouched, both hands onto the grip, the blade out in front and tipped up — clear of the other one close in.)
  fw.pose("anticipation", approached ? 0.6 * T.coil : T.coil, { lean: 16, arm: COIL, free: "both", drop: 0.12 }, { at: A - 0.02, name: "windup" });
  // THE TURN, THE SWORD OUT IN FRONT (Arthur, review 8: the spin he gave 10/10 — "holding the sword out in front of him
  // with both hands, turns a full 360, then slashes"; never lifted overhead unless asked): BOTH HANDS ON THE GRIP at chest
  // height, the blade held out in front and roughly level, sweeping round WITH the body — at them, then (side on to us)
  // toward us, away from them, away from us, and at them again. A body drawn from the side, then from the front, then
  // from the other side is mirrored at each switch: so at each switch the hands are drawn in to the chest (the same
  // place in both views, the blade angled down-forward — seen end on) and between the switches the blade sweeps out
  // level; in the front views the hands move ALONG THE FRONT OF THE CHEST from one side to the other — never a jump
  // across the body (a hand moves at most 0.45 h a picture at 12 a second).
  const tuck = { lHip: 40, rHip: 20, lKnee: 60, rKnee: 50 };
  const frontLegs = { lHip: 14, rHip: 14, lKnee: 24, rKnee: 24 };
  const IN_CHEST: Arm = [-30, 80], OUT: Arm = [40, 92], sgn = forwardSign(start.facing);
  // (In the front views: both hands where the side view draws them, k of the way from the side they came from.)
  // A FULL TURN READS AS ONE WAY ROUND (Arthur, review 9: "it looks like he went right, left — not a 360"): seen from
  // the side, what is held out in front traces an ELLIPSE — turning toward us the blade dips (`near`: pointing down, end
  // on), turning away from us it rises (pointing up) — so the tip goes at them, down, away, UP, at them: never the same
  // picture twice, never back and forth along one line.
  // (The far side: the hands a little higher at the chest — IN_HIGH — and the blade tipped up and back, never overhead.)
  const IN_HIGH: Arm = [-10, 125];
  const free2 = (far: boolean): Arm => far ? [IN_HIGH[0] - 4, IN_HIGH[1]] : [IN_CHEST[0] - 4, IN_CHEST[1]];
  const frontGrip = (k: number, far = false) => ({ ...frontArmTo(hand, sgn * k * sideHand(far ? IN_HIGH : IN_CHEST).x, sideHand(far ? IN_HIGH : IN_CHEST).y, far ? "up" : true), ...frontArmTo(other(hand), sgn * k * sideHand(free2(far)).x, sideHand(free2(far)).y, false) });
  const fly = (kind: BeatKind, seconds: number, arm: Arm, k: number, facing: Facing | undefined, legs: Partial<PoseAngles>, name?: string) => {
    fw.air(kind, seconds, { lean: 0, arm, free: "both", legs, ...(facing ? { facing } : {}) }, { at: A + k * L, f: f + A + k * L, b: b + A + k * L, lift: 0.05, ...(name ? { name } : {}) });
    const beat = fw.beats[fw.beats.length - 1];
    beat.legs = legs;
    if (facing) beat.facing = facing;
  };
  // (Each switch of the view is a short key, 0.02 s — instant to the eye: A VIEW SWITCH IS INSTANT, engine.ts.)
  const SWITCH = 0.02;
  fly("action", 0.12 * SPIN_TURN, IN_CHEST, 0.1, undefined, tuck, "spin"); // turning: the hands come in to the chest, the blade forward
  fly("settle", SWITCH, IN_CHEST, 0.15, "front", { ...frontLegs, ...frontGrip(1) }); // (side on to us: same place)
  fly("settle", 0.12 * SPIN_TURN, IN_CHEST, 0.3, undefined, { ...frontLegs, ...frontGrip(-1) }); // along the chest to the other side
  fly("settle", SWITCH, IN_CHEST, 0.34, away, tuck); // (back to them: same place)
  fly("settle", 0.12 * SPIN_TURN, OUT, 0.46, undefined, tuck); // the blade out level, away from them
  fly("settle", 0.1 * SPIN_TURN, IN_HIGH, 0.6, undefined, tuck); // and in again, the blade tipping up (turning away from us)
  // BEHIND THE BODY ON THE FAR SIDE (Arthur, review 10: "the sword has to go behind the stick figure" — then the turn
  // reads as a full 360, not a 180 and back): from turning our way's back to us until it faces them again, the sword is
  // drawn behind the figure (marks behindFrom / behindTo: the director puts that on the held weapon).
  fly("settle", SWITCH, IN_HIGH, 0.64, "front", { ...frontLegs, ...frontGrip(-1, true) }, "behindFrom"); // (back to us: same place, the blade up — the far side)
  fly("settle", 0.12 * SPIN_TURN, IN_HIGH, 0.76, undefined, { ...frontLegs, ...frontGrip(-0.2, true) }); // the hands toward the middle, the blade still up behind (a hand can't cross the body with the blade up)
  fly("settle", SWITCH, IN_HIGH, 0.8, start.facing, tuck, "behindTo"); // (facing them again, the blade coming down level into the slash)
  // LANDING INTO THE SLASH: level at them, the feet planted wide.
  fw.at = A + L; fw.f = A + L + STANCE_HALF + 0.04; fw.b = A + L - STANCE_HALF - 0.04;
  // (Turn and landing slash ~1.5x the pictures they first had — Arthur, review 6: "the spin is 10/10, just too fast".)
  fw.land("action", 0.2, { lean: 14, arm: [88, 100], free: "both", drop: 0.12 }, { name: "hit" });
  fw.beats[fw.beats.length - 1].facing = start.facing;
  const blocked = params.blocked === true || params.parried === true;
  fw.pose("hold", T.stop, { lean: 15, arm: blocked ? [92, 108] : [80, 90], free: "both", drop: 0.12 }, { name: "contact" });
  fw.pose("follow", T.follow, { lean: blocked ? 6 : 18, arm: blocked ? [120, 170] : [48, 40], free: "both", drop: 0.1 });
  fw.pose("settle", 0.15, guard, { name: "follow" });
  if (params.last !== false) {
    fw.stepTo("B", A + 0.5 * L - STANCE_HALF, A + 0.75 * L, "settle", T.recover, guard);
    fw.stepTo("F", A + 0.5 * L + STANCE_HALF, A + 0.5 * L, "settle", T.recover, guard);
  }
  fw.pose("settle", 0.08, guard, { name: "ready", recover: true });
  const out = swordKeys(start, settings, hand, fw.beats);
  return finish(out, start.t, true, approached ? out.marks.approached : start.t);
}

// DASH SLASH: the passed DASH PUNCH's run-up, push, flight and landing (dash.ts) — only the arms are the weapon's:
// running holding it, at the push both hands come onto the grip and cock it back over the shoulder, held (winding
// further, faster and faster) through the flight; WHEN THE FEET LAND, THE SLASH: down and across at them, then the
// follow-through, and back to the guard as it steps out of the skid. (`reachExtra`, x height: how much further the
// weapon reaches than a fist — the dash takes off and lands that much further out.)
export type DashSlashParams = DashParams & { hand?: Side; weapon?: string; reachExtra?: number; blocked?: boolean; parried?: boolean };
export const DASH_SLASH_REACH = 0.42;
// A WEAPON DASH FLIES ~HALF A SECOND AT FULL SPEED, THEN LANDS HEAVY AND STOPS FAST (Arthur, Oct 6: "airborne for maybe
// two-thirds of a second, half a second ... they're supposed to feel the motion, the weight of it"): dash.ts `air`/`heavy`.
export const WEAPON_DASH_AIR = 0.5;
// A POWERFUL AIRBORNE STRIKE (Arthur, Oct 6: "right when his feet touch the ground ... his sword swings down ... it
// should not be a tap. It should actually be powerful"): THE DOWNSWING STARTS IN THE AIR — the last DOWNSWING seconds
// of the flight (a strike at a running pace) — so the weapon ARRIVES AS THE FRONT FOOT PLANTS (contact = touch-down,
// never after it); the body drives into it (leaning in from the start of the downswing, the hips dropping with the
// landing); then a big follow-through past the contact — NO PAUSE ON THE CONTACT (Arthur, Oct 7: "he hits, the spark, but
// he doesn't stop there ... keeps swinging his arms down. After he hit, no delay"): the weapon slows as it meets the other
// blade and the spark flies, but it keeps moving straight on into the follow-through.
const DOWNSWING = 0.25; // seconds: the weapon's trip from cocked behind the head to the contact (3 pictures at 12 a second: a strike at a running pace, never hypersonic — a hand moves ≤ 0.45 h a picture)
const DASH_HIT_STOP = 0; // seconds held at the contact: none (it never freezes on the hit)
// A HEAVY STRIKE'S ENERGY GOES SOMEWHERE (Arthur, Oct 6 night: "it still looks like a tap ... all that energy has to do
// something. So the sword should go down all the way, and then slowly come back up"): straight after the contact the weapon
// carries on through and DOWN — pointing down, even when blocked (it glances off) — slowing to a stop there over
// DASH_FOLLOW seconds, then it comes back up slowly (a jogging pace) into the guard, ready for the next exchange.
const DASH_FOLLOW = 0.5;
const THROUGH: Arm = [-5, 62]; // (blocked: glanced off and carried on down, the hands by the hip, the blade pointing down in front)
export function dashSlash(start: Stance, params: DashSlashParams, settings: MoveSettings): MoveOutput {
  const H = settings.height, hand = handOf(params as Record<string, unknown>, start), w: Weapon = weaponOf(params.weapon);
  const extra = Number(params.reachExtra ?? DASH_SLASH_REACH) * H;
  const dash = dashPunch(start, { air: WEAPON_DASH_AIR, heavy: true, ...params, ...(params.distance !== undefined ? { distance: Math.max(0.4 * H, Number(params.distance) - extra) } : {}) }, settings);
  const m = dash.marks, t0 = start.t, push = m.push, land = m.land, hit = land, end = dash.end.t;
  const swing = Math.max(push + 0.08, land - DOWNSWING); // the downswing starts in the air
  const held = Math.min(end - 0.1, hit + DASH_HIT_STOP), after = Math.min(end - 0.12, held + DASH_FOLLOW);
  // (COCKED OVER THE SHOULDER, like the passed dash's fist cocked by the head: both hands up by the head, the weapon
  // pointing back and up behind it — never both arms straight up over a ducked head — winding further as it flies.)
  const COCK = (k: number): Arm => [120 + 10 * k, 250 + 12 * k];
  const blockedHit = params.blocked === true || params.parried === true;
  // (Blocked, it presses ON the other's blade — driving it down and back, the hands kept clear of the other's hands;
  // unblocked, it presses on through.)
  const SLASH: Arm = [104, 124], PRESS: Arm = blockedHit ? [110, 130] : [98, 116], FOLLOW: Arm = [28, 14]; // (a big follow-through: driven right through and down)
  const smooth = (u: number) => { const v = clamp(u, 0, 1); return v * v * (3 - 2 * v); };
  const mix = (a: Arm, b: Arm, k: number): Arm => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const armAt = (t: number): { arm: Arm; both: boolean; k?: number } => {
    if (t <= push) return { arm: mix(READY, COCK(0), smooth((t - t0) / Math.max(0.05, push - t0))), both: false, k: smooth((t - t0) / Math.max(0.05, push - t0)) };
    if (t <= swing) return { arm: COCK(((t - push) / Math.max(0.05, swing - push)) ** 2), both: true };
    if (t <= hit) return { arm: mix(COCK(1), SLASH, ((t - swing) / Math.max(0.05, hit - swing)) ** 1.5), both: true };
    // (THE HIT STOP: held on the contact, pressing a little further in — the weight behind it.)
    if (t <= held) return { arm: mix(SLASH, PRESS, smooth((t - hit) / Math.max(0.05, held - hit))), both: true };
    // (THE ENERGY GOES SOMEWHERE: on through and DOWN — blocked, it glances off and carries on down — slowing to a stop
    // there (easing out), then the weapon comes back up SLOWLY into the guard, ready for the next exchange.)
    // (Blocked, it never pauses: the hands drop and draw in toward the body FIRST (the upper arm leads) while the blade keeps
    // turning down — so it never sweeps across the other's hands — one continuous swing, slowing to a stop down in front.)
    const through = blockedHit ? THROUGH : FOLLOW;
    if (t <= after) {
      const u = clamp((t - held) / Math.max(0.05, after - held), 0, 1);
      if (!blockedHit) return { arm: mix(PRESS, through, 1 - (1 - u) * (1 - u) * (1 - u)), both: true };
      const e = 1 - (1 - u) * (1 - u); // (one swing slowing all the way down — it never stops and starts again)
      const path: [number, Arm][] = [[0, SLASH], [0.25, [130, 122]], [0.5, [30, 110]], [0.65, [0, 90]], [1, through]];
      let i = 0;
      while (i < path.length - 2 && e > path[i + 1][0]) i += 1;
      const [ta, aa] = path[i], [tb, ab] = path[i + 1];
      return { arm: mix(aa, ab, clamp((e - ta) / Math.max(1e-6, tb - ta), 0, 1)), both: true };
    }
    return { arm: mix(through, READY, smooth((t - after) / Math.max(0.05, end - after))), both: w.hands === 2 };
  };
  const keys: CharacterKey[] = dash.keys.map((key, i) => {
    if (i === 0) return key;
    const { arm, both, k } = armAt(key.t);
    const lean = key.pose.lean, p = { ...key.pose };
    const set = (side: Side, [u, f]: Arm) => { p[`${side}Shoulder`] = u + lean; p[`${side}Elbow`] = elbowFor(u, f); };
    set(hand, arm);
    // (The free hand joins the grip at the push; before that it pumps as it runs.)
    if (both && key.t > push + 0.05) set(other(hand), [arm[0] - 4, arm[1]]);
    else if (key.t > after && w.hands === 1) {
      // (After the follow-through the free hand lets go of the grip gradually — never in one jump.)
      const o = other(hand), e = smooth((key.t - after) / Math.max(0.05, end - after));
      const ownU = p[`${o}Shoulder`] - lean, ownF = ownU + p[`${o}Elbow`];
      set(o, [arm[0] - 4 + (ownU - arm[0] + 4) * e, arm[1] + (ownF - arm[1]) * e]);
    }
    // (The free hand is already on the grip: it came onto it over the last steps of the run-up — WEAPON HOLD.)
    if (key.t <= push + 0.05) set(other(hand), [arm[0] - 4, arm[1]]);
    // A HEAVY LANDING STRIKE (Arthur: "it looks like a tap"): a strike after a big wind-up carries the body's momentum —
    // as the feet land the body drives forward into the slash (leaning in up to 20 degrees, the legs kept where they are),
    // and eases back up through the follow-through.
    if (key.t > swing && key.t < end) {
      const u = key.t <= hit ? smooth((key.t - swing) / Math.max(0.05, hit - swing)) : key.t <= held ? 1 : 1 - smooth((key.t - held) / Math.max(0.05, end - held));
      const drive = 20 * u;
      // (legs and arms keep their own directions: the body pitches in over them, the sword still on its line)
      p.lean += drive; p.lHip += drive; p.rHip += drive; p.lShoulder += drive; p.rShoulder += drive;
    }
    // FOOTWORK (review 1): the back leg's step out of the skid is a real step — the swinging foot stays clear of the
    // floor until it is placed (never touching down early and sliding the rest of the way).
    if (key.t > m.stop + 1e-6 && key.t < m.step - 1e-6 && (key.contacts ?? []).length === 1) {
      const planted = key.contacts![0][0] as Side, swinging = other(planted);
      const body = forwardKinematics(p, "right", { x: 0, y: 0 }, 1, "normal", false);
      const u = (key.t - m.stop) / (m.step - m.stop), clear = body[`${planted}Foot`].y - 0.045 * Math.sin(Math.PI * u);
      const foot = body[`${swinging}Foot`];
      if (foot.y > clear) {
        const leg = legReach(p.lean, { x: foot.x, y: clear });
        p[`${swinging}Hip`] = leg.hip;
        p[`${swinging}Knee`] = leg.knee;
      }
    }
    return { ...key, pose: p };
  });
  // (Make sure there are keys right at the start of the downswing, the contact and the end of the hit stop.)
  const keyAt = (at: number, arm: Arm) => {
    if (keys.some((k) => Math.abs(k.t - at) < 1e-4)) return;
    const i = keys.findIndex((k) => k.t > at);
    if (i > 0) {
      const a = keys[i - 1], b = keys[i], u = (at - a.t) / (b.t - a.t);
      const pose = { ...a.pose } as PoseAngles;
      for (const name of Object.keys(pose) as (keyof PoseAngles)[]) pose[name] = a.pose[name] + (b.pose[name] - a.pose[name]) * u;
      const lean = pose.lean, set = (side: Side, [uu, f]: Arm) => { pose[`${side}Shoulder`] = uu + lean; pose[`${side}Elbow`] = elbowFor(uu, f); };
      set(hand, arm); set(other(hand), [arm[0] - 4, arm[1]]);
      keys.splice(i, 0, { ...a, t: at, x: a.x + (b.x - a.x) * u, lift: (a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * u, pose, minFps: undefined });
    }
  };
  keyAt(swing, COCK(1)); keyAt(hit, SLASH); keyAt(held, PRESS);
  const lastKey = keys[keys.length - 1];
  return { keys, end: { ...dash.end, pose: lastKey.pose }, marks: { ...m, hit, swing, begin: t0, end, fastFrom: swing, fastTo: hit }, flow: { keys: keys.length - 1, stance: { ...dash.end, pose: lastKey.pose } } };
}

// THE DEFENCES (timed by the planner so "hit" is the attacker's "hit").
// BLOCK: eyes on it (a readable get-ready), the weapon up into its way — upright in front ("mid"), over the head against
// a chop ("high"), angled across a thrust ("low") — blade meets blade at "hit", held a moment (the hit stop); the force
// checks the body and the arm, and it GIVES GROUND `push` x height with real steps back (back foot, front foot); a
// PARRY first knocks the other weapon aside (the weapon sweeps out and down). "ready": it can act again.
// `meet`: MEET IT — swing the weapon into the coming blade (from wound back the other way, speeding up into the contact):
// both blades moving into each other, a clash, not a held block.
export const MEET_READ = 0.38; // seconds: a meeting swing's wind-up (at least; longer at walking pace for a long way back)
export type SwordBlockParams = { hand?: Side; height?: "mid" | "high" | "low"; push?: number; parry?: boolean; strong?: boolean; meet?: boolean; weapon?: string; side?: "down" | "up"; driven?: boolean };
// (A block or parry meets the blade IN FRONT of the body: the hand out in front, the blade upright a hand's width before
// the face — never so close that the other blade's tip reaches the head past it.)
const BLOCK_MID: Arm = [45, 168];
const BLOCK_LOW: Arm = [38, 128]; // (against a thrust at the chest: the blade angled up across its line)
// (Against a chop: the hands up by the face in front, the blade angled up and out at the attacker over the head — the
// chop coming down meets its upper half first, never the hands.)
const BLOCK_HIGH: Arm = [100, 140];
// (Against a RISING slash — `side` "up", from low behind: the tip comes up from below and is furthest out as it passes
// level, so an upright blade with the hands low in front would have it sweep up past the hands to reach the upper half.
// So the blade LEANS OUT into its path, angled up and out at the attacker — its upper half the first thing the rising
// blade meets — and the hands stay back by the chest, behind the contact and out of the path.)
const BLOCK_RISING: Arm = [45, 135];
export function swordBlock(start: Stance, params: SwordBlockParams, settings: MoveSettings): MoveOutput {
  const hand = handOf(params as Record<string, unknown>, start), w = weaponOf(params.weapon), both = w.hands === 2 || params.height === "high";
  const { f, b } = startFeet(start, hand);
  const rising = params.meet === true && params.side === "up" && (params.height ?? "mid") === "mid";
  const P = clamp(Number(params.push ?? 0.06), 0, 0.5), block = params.height === "high" ? BLOCK_HIGH : params.height === "low" ? BLOCK_LOW : rising ? BLOCK_RISING : BLOCK_MID;
  const free = (arm: Arm): Arm | "both" => (both ? "both" : arm);
  // (Pressed back: the weapon tilts back toward the body, the upper arm rising with it.)
  const pushed: Arm = [block[0] + 15, block[1] + (params.strong ? 17 : 9)];
  const guard: Look = { lean: STANCE_LEAN, arm: READY, free: w.hands === 2 ? "both" : FREE_READY };
  const T = SWORD_TIMING, fw = new Footwork(f, b, lookAtStart(start, hand));
  // (Blocks move into place at a jogging pace: the get-ready, then into the blade's way.)
  if (params.meet) {
    // MEET IT — ITS OWN SHORT STRIKE (both fight): it sees the strike coming, winds its weapon back over the shoulder (a
    // short wind-up, the anticipation rule) and swings it forward at a strike's pace INTO the coming blade, arriving at
    // the same picture: both blades moving into each other.
    const wind: Arm = params.height === "high" ? [150, 262] : params.height === "low" ? [-35, 40] : [110, 245];
    // (THE UPPER HALF IN ITS PATH, THE HANDS OUT OF IT: the hands low and in front of the chest, the blade angled up and
    // forward so the coming blade meets it well up from the guard — never near the hands.)
    const meet: Arm = rising ? block : params.height === "mid" || params.height === undefined ? [40, 158] : block;
    // (It READS the attacker's anticipation: its own wind-up starts as the attacker's does and runs at a walking pace —
    // the director gives it that time — so it never stands dead still and then snaps back.)
    fw.pose("anticipation", paced(MEET_READ, READY, wind, PACE.walk), { lean: STANCE_LEAN - 6, arm: wind, free: free(FREE_UP), drop: 0.08 }, { name: "see" });
    fw.pose("action", paced(0.17, wind, meet, PACE.run), { lean: STANCE_LEAN + 8, arm: meet, free: free(FREE_BACK), drop: 0.09 }, { name: "hit", ease: "in" });
  } else {
    fw.pose("anticipation", 0.2, { lean: STANCE_LEAN + 2, arm: mix(READY, block, 0.4), free: free(FREE_READY), drop: 0.08 }, { name: "see" });
    fw.pose("settle", paced(0.18, mix(READY, block, 0.4), block, PACE.jog), { lean: STANCE_LEAN, arm: block, free: free([20, 110]), drop: 0.09 }, { name: "hit" });
  }
  // A HEAVY STRIKE DRIVES THE BLOCK BACK AT ONCE (`driven` — the dash slash; Arthur, Oct 7: the attacker "keeps swinging
  // down ... no delay"): no hold on the contact — the arms give and the body is driven back straight away, so the
  // attacker's weapon can carry on through without sliding down onto the hands.
  const driven = params.driven === true;
  fw.pose("hold", driven ? 0.01 : T.stop, { lean: STANCE_LEAN - 2, arm: mix(block, pushed, 0.3), free: free([20, 110]), drop: 0.09 }, { name: "contact" });
  // (Driven, the heavy blow knocks the block back: the hands come in toward the body and the blade tips back toward it.)
  const beaten: Arm = [block[0] - 30, block[1] + 20];
  if (driven && P >= 0.01) {
    // (KNOCKED BACK OFF ITS FEET: the blow throws it back in a short hop — the feet leave the floor, so nothing slides —
    // and it lands heavily, still guarding, the impact plain to see.)
    fw.air("follow", 0.11, { lean: -10, arm: beaten, free: free([-20, 60]), drop: 0.05 }, { at: -0.6 * P, f: f - 0.55 * P, b: b - 0.65 * P, lift: 0.05, name: "pushed" });
    fw.air("follow", 0.09, { lean: -6, arm: beaten, free: free([-20, 60]), drop: 0.08 }, { at: -P, f: f - P, b: b - P, lift: 0.02 });
    fw.land("follow", 0.12, { lean: -2, arm: mix(beaten, block, 0.4), free: free([-20, 60]), drop: 0.13 }, { name: "landed" });
    // (It gathers itself — a beat to recover from the blow, as long as the steps back would have taken — before it acts.)
    fw.pose("settle", 0.13, { ...guard, lean: STANCE_LEAN - 2 }, {});
  } else fw.pose("follow", 0.2, { lean: params.strong ? -4 : 2, arm: pushed, free: free([-20, 60]), drop: 0.1 }, { at: -0.03, name: "pushed" });
  if (params.parry) fw.pose("settle", P >= 0.01 ? 0.2 : 0.15, { lean: STANCE_LEAN + 4, arm: [70, 128], free: free(FREE_READY), drop: 0.08 }, { name: "parry" });
  // GIVING GROUND: real steps back (none for a push too small to step: AT STRIKING DISTANCE the weight only rocks back).
  if (P >= 0.01 && !driven) fw.shift(-P, { ...guard, lean: STANCE_LEAN - 2 }, 0.2);
  // (AT STRIKING DISTANCE, no steps: the rock back flows straight on into whatever comes next — its own strike's wind-up
  // — rather than pausing in the guard first.)
  fw.pose("settle", P >= 0.01 ? 0.16 : 0.08, guard, { recover: true });
  const out = swordKeys(start, settings, hand, fw.beats);
  out.marks.ready = out.flow?.stance.t ?? out.end.t;
  return out;
}

// DODGE: it sees it coming, crouches and HOPS BACK out of reach (`distance` x height) — in the air as the weapon
// passes where it was ("hit") — lands, and is back on guard.
export type SwordDodgeParams = { hand?: Side; distance?: number; weapon?: string };
export function swordDodge(start: Stance, params: SwordDodgeParams, settings: MoveSettings): MoveOutput {
  const hand = handOf(params as Record<string, unknown>, start), w = weaponOf(params.weapon);
  const { f, b } = startFeet(start, hand), D = clamp(Number(params.distance ?? 0.35), 0.1, 0.6);
  // (A longer hop takes a little longer in the air — the body and the hands never faster than a strike.)
  const air = Math.max(1, D / 0.42);
  const free = (arm: Arm): Arm | "both" => (w.hands === 2 ? "both" : arm);
  const fw = new Footwork(f, b, lookAtStart(start, hand));
  fw.pose("anticipation", 0.16, { lean: 14, arm: [22, 138], free: free(FREE_READY), drop: 0.13 }, { at: 0.01, name: "crouch" });
  fw.air("action", 0.12 * air, { lean: -6, arm: [10, 120], free: free([60, 80]), drop: 0.02 }, { at: -0.55 * D, f: f - 0.5 * D, b: b - 0.6 * D, lift: 0.07, name: "hit" });
  // (Still in the air as it arrives over its landing spot; then it comes straight down onto it — no skid.)
  fw.air("follow", 0.1 * air, { lean: 4, arm: [20, 118], free: free([40, 70]), drop: 0.11 }, { at: -D, f: f - D, b: b - D, lift: 0.03 });
  fw.land("follow", 0.1, { lean: 4, arm: [20, 118], free: free([40, 70]), drop: 0.11 }, { name: "land" });
  fw.pose("settle", 0.2, { lean: STANCE_LEAN, arm: READY, free: free(FREE_READY) }, { recover: true });
  const out = swordKeys(start, settings, hand, fw.beats);
  out.marks.ready = out.flow?.stance.t ?? out.end.t;
  return out;
}

// Steps in (or out, `advance` < 0) in the weapon guard: front foot, back foot.
export function swordStep(start: Stance, params: { hand?: Side; advance?: number; weapon?: string }, settings: MoveSettings): MoveOutput {
  const hand = handOf(params as Record<string, unknown>, start), w = weaponOf(params.weapon), A = clamp(Number(params.advance ?? 0), -0.7, 1.5);
  const { f, b } = startFeet(start, hand);
  const guard: Look = { lean: STANCE_LEAN, arm: READY, free: w.hands === 2 ? "both" : FREE_READY };
  // (CLOSE IN, THE GUARD GOES UP OUT OF THE WAY — as in the weapon hold: stepping in close (to kick), the weapon is raised
  // by the face as the feet go, so its blade never reaches across to the other's hands.)
  const closing: Look = A > 0 ? { ...guard, arm: mix(READY, CLOSE_GUARD, clamp(A / 0.25, 0, 1)) } : guard;
  const fw = new Footwork(f, b, lookAtStart(start, hand));
  fw.pose("settle", 0.06, guard);
  fw.shift(A, closing, SWORD_TIMING.closeIn);
  fw.pose("settle", 0.06, closing, { name: "stepped" });
  return swordKeys(start, settings, hand, fw.beats);
}

// VICTORY: the weapon raised high and held.
export function swordVictory(start: Stance, params: { hand?: Side; seconds?: number; weapon?: string }, settings: MoveSettings): MoveOutput {
  const hand = handOf(params as Record<string, unknown>, start), w = weaponOf(params.weapon);
  const { f, b } = startFeet(start, hand), hold = clamp(Number(params.seconds ?? 1.2), 0.3, 4);
  const fw = new Footwork(f, b, lookAtStart(start, hand));
  fw.pose("anticipation", 0.2, { lean: 10, arm: [60, 150], free: w.hands === 2 ? "both" : FREE_READY, drop: 0.08 });
  // (Raised up and a little forward, the sword pointing at the sky — so whatever comes next brings it down in front
  // without the hand sweeping round the head.)
  fw.pose("action", 0.3, { lean: -4, arm: [148, 174], free: w.hands === 2 ? "both" : [-30, 10], drop: 0.01 }, { name: "raised" });
  fw.pose("hold", hold, { lean: -2, arm: [146, 172], free: w.hands === 2 ? "both" : [-28, 12], drop: 0.01 });
  return swordKeys(start, settings, hand, fw.beats);
}

// ---- WEAPON HOLD (the planner, plan.ts, after building everyone) ----------------------------------------------------
// A fighter holding a weapon never lets go of it: outside its own weapon moves (waiting in the guard, running in,
// kicking, taking a hit) the weapon arm (both arms for a two-handed weapon) holds it in the guard — relative to the
// body, so it reels with a hit — and only a body thrown far over (falling, lying down) lets the engine's arm take it.
export const WEAPON_MOVES = new Set(["swordSlash", "swordChop", "swordThrust", "swordSpin", "dashSlash", "swordBlock", "swordDodge", "swordStep", "swordVictory"]);
type HeldTrack = { kind: string; anchor: unknown; params?: Record<string, unknown> };
// CLOSE IN, THE WEAPON GOES UP (keep fighting distance, round 3): a guard held out in front at close range would cross
// the other's blade or reach into its head, so the closer the other one is (from about 1.15 heights in to 0.8), the more
// the weapon is raised by the face, pointing at the sky — out of the way — until it is used.
export const CLOSE_GUARD: Arm = [96, 202];
const xAt = (keys: readonly CharacterKey[], t: number) => {
  if (t <= keys[0].t) return keys[0].x;
  for (let i = 1; i < keys.length; i += 1) if (keys[i].t >= t) { const a = keys[i - 1], b = keys[i], u = (t - a.t) / Math.max(1e-9, b.t - a.t); return a.x + (b.x - a.x) * u; }
  return keys[keys.length - 1].x;
};
export function weaponKeys(plan: { effects?: readonly HeldTrack[]; height?: number }, built: Map<string, CharacterKey[]>, marks: Record<string, number>) {
  const H = plan.height ?? 300;
  for (const track of plan.effects ?? []) {
    const anchor = track.anchor as { character?: string; joint?: string };
    if (track.kind !== "heldWeapon" || typeof anchor.character !== "string") continue;
    const id = anchor.character, hand: Side = anchor.joint === "rHand" ? "r" : "l", w = weaponOf(track.params?.weapon);
    const keys = built.get(id);
    if (!keys?.length) continue;
    const spans: [number, number][] = [];
    const named = new RegExp(`^${id}\\.([A-Za-z]+)(\\d+)\\.begin$`);
    for (const [name, t] of Object.entries(marks)) {
      const m = named.exec(name);
      const end = m && WEAPON_MOVES.has(m[1]) ? marks[`${id}.${m[1]}${m[2]}.end`] : undefined;
      if (end !== undefined) spans.push([t, end]);
    }
    // The weapon held in the guard at a key (the hold rule above), or undefined where the body lets go of it.
    const held = (k: CharacterKey): PoseAngles | undefined => {
      if (k.facing === "front") return undefined;
      const p = { ...k.pose }, keep = clamp(1 - (Math.abs(p.lean) - 35) / 35, 0, 1);
      if (keep <= 0) return undefined;
      // (Never frozen: a little idle sway of the weapon while it waits — SMOOTH, NOT ROBOTIC.)
      const sway = Math.sin((2 * Math.PI * k.t) / 1.7), sway2 = Math.sin((2 * Math.PI * k.t) / 1.7 + 0.9);
      const set = (side: Side, [u, f]: Arm) => {
        const shoulder = u + STANCE_LEAN + 3 * sway, elbow = f - u + 4 * sway2;
        const turn = ((shoulder - p[`${side}Shoulder`]) % 360 + 540) % 360 - 180;
        p[`${side}Shoulder`] = p[`${side}Shoulder`] + turn * keep;
        p[`${side}Elbow`] = p[`${side}Elbow`] + (elbow - p[`${side}Elbow`]) * keep;
      };
      const gap = Math.min(Infinity, ...[...built.entries()].filter(([o, ks]) => o !== id && ks.length).map(([, ks]) => Math.abs(xAt(ks, k.t) - k.x) / H));
      const c = clamp((1.15 - gap) / 0.35, 0, 1), close = c * c * (3 - 2 * c);
      const guard = mix(READY, CLOSE_GUARD, close);
      set(hand, guard);
      if (w.hands === 2) set(other(hand), [guard[0] - 4, guard[1]]);
      // (Running in to a dash slash, the free hand comes onto the grip over the last steps — on it at the take-off.)
      const dash = dashBegins.find((tb) => tb - k.t >= -1e-6 && tb - k.t < 0.45);
      if (dash !== undefined && w.hands === 1) {
        const o = other(hand), u = clamp(1 - (dash - k.t) / 0.45, 0, 1), e = u * u * (3 - 2 * u);
        const ownU = p[`${o}Shoulder`] - p.lean, ownF = ownU + p[`${o}Elbow`], gu = guard[0] - 4, gf = guard[1];
        p[`${o}Shoulder`] = ownU + (gu - ownU) * e + p.lean;
        p[`${o}Elbow`] = elbowFor(ownU + (gu - ownU) * e, ownF + (gf - ownF) * e);
      }
      return p;
    };
    // NO JUMP BETWEEN THE HOLD AND A MOVE: a weapon move was made from the body as the engine left it, not from the
    // guard the hold shows — so over its first HANDOVER seconds its arms are blended in from the held guard (and, after
    // it, the held guard is blended in from where the move left the arms).
    const HANDOVER = 0.32;
    const dashBegins = Object.entries(marks).filter(([name]) => new RegExp(`^${id}\\.dashSlash\\d+\\.begin$`).test(name)).map(([, t]) => t);
    const arms = (side: Side) => [`${side}Shoulder`, `${side}Elbow`] as const;
    const blendArms = (from: PoseAngles, to: PoseAngles, u: number) => {
      const out = { ...to }, k = u * u * (3 - 2 * u);
      for (const side of ["l", "r"] as Side[]) {
        const [sh, el] = arms(side);
        const turn = ((to[sh] - from[sh]) % 360 + 540) % 360 - 180;
        out[sh] = from[sh] + turn * k;
        out[el] = from[el] + (to[el] - from[el]) * k;
      }
      return out;
    };
    const firstKey = (t: number) => keys.find((q) => Math.abs(q.t - t) < 1e-6);
    built.set(id, keys.map((k) => {
      const inside = spans.find(([a, b]) => k.t > a + 1e-6 && k.t <= b + 1e-6);
      if (inside) {
        // (Only from the held guard: straight after another weapon move it already starts where that one left off.)
        const [a] = inside, at = firstKey(a), afterMove = spans.some(([a2, b2]) => a2 !== a && a > a2 + 1e-6 && a <= b2 + 1e-6);
        const from = at && !afterMove ? held(at) : undefined;
        return from && k.t - a < HANDOVER ? { ...k, pose: blendArms(from, k.pose, (k.t - a) / HANDOVER) } : k;
      }
      const p = held(k);
      if (!p) return k;
      const after = spans.filter(([, b]) => k.t > b && k.t - b < HANDOVER).sort((x, y) => y[1] - x[1])[0];
      const left = after ? firstKey(after[1]) : undefined;
      return { ...k, pose: left ? blendArms(left.pose, p, (k.t - after![1]) / HANDOVER) : p };
    }));
  }
}
