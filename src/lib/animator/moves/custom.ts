import type { CharacterKey, FootContact } from "../engine.ts";
import type { Ease } from "../easing.ts";
import { forwardKinematics } from "../pose.ts";
import { clampPose, POSE_KEYS, PROPORTIONS, STAND, type PoseAngles } from "../rig.ts";
import { balanceMargin, balancedHips, BALANCE_MARGIN, supportOf, weightAhead } from "./balance.ts";
import { amplitudeOf, continueElbows, forwardSign, JOINT_DEG_PER_SEC, jointChangeSeconds, lerpPose, tempoOf, weightBend, windUp, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { footAt, handAt, travel } from "./squat.ts";
import { RAMP_SCALE } from "./styles.ts";

// SPEC-0017 Phase 3: ORIGINAL MOVES (Arthur, 2026-10-07: "Terra tells the engine WHAT, the engine must know HOW — key
// poses, symbols, animations — including acceleration and deceleration, anticipation, follow-through"). A move nobody
// taught the engine (a robot dance, tiptoeing, a dab, a kata, a victory celebration...) is written by the AI as a few
// rough KEY POSES. The AI says WHAT the body does; the fundamentals are the ENGINE's rules, added here to any key poses:
// - TIMING when a key has no `at`: a bigger change takes longer (THREE SPEEDS: wind-ups at a walking pace, strikes at a
//   running pace, everything else at a jogging pace; the style's and speed's tempo on top).
// - ANTICIPATION: before the biggest change, every strike and every take-off, a small move the OTHER way first
//   (motion.ts windUp; a crouch before going up) — unless the AI already wrote one.
// - EASE: out of and into every held pose (the motion stops there smoothly), smooth through passing keys (no stop, no
//   hold-then-snap); a strike speeds up into its hit.
// - FOLLOW-THROUGH: after a strike, a landing or a big change that stops, the body goes a little past the pose (a
//   landing dips) and settles back into it.
// - ARCS: angles are what move, so limbs swing on arcs; shoulders take the shortest way round.
// - PLANTED FEET NEVER SLIDE: a foot planted at two keys keeps its spot (the legs re-bend to reach it); a planted foot
//   that must end up somewhere else STEPS (it lifts on the way, the other foot stays).
// - BALANCE: standing on the feet, the weight stays over them (balance.ts balancedHips) — the hips shift, not the feet.
// - GRAVITY: keys with `lift` > 0 are in the air — the times between take-off and landing come from gravity (slowing
//   on the way up, speeding up on the way down), whatever `at` says.
// - BODY LIMITS: every pose is kept inside the rig's bend limits (clampPose); missing or broken angles = the pose before.

export type CustomFeet = "both" | "front" | "back" | "none";
// HAND TARGETS (Oct 14): a key may say WHERE a hand goes instead of its arm angles — `rHand` / `lHand` (or `hand` = the right
// one) { x, y }: x = forward from the hips (x height, + = the way it faces), y = height above the floor (x height). The engine
// solves that arm (two-bone IK: shoulder + elbow) so the hand reaches exactly there (or reaches straight toward it when too
// far). Painting a sun = keys tracing a circle; pointing, pressing a button, writing on a board, touching a shelf.
export type HandTarget = { x: number; y: number };
export type CustomKey = { pose?: Partial<PoseAngles>; at?: number; dx?: number; lift?: number; feet?: CustomFeet; hold?: number; strike?: boolean; hand?: HandTarget; rHand?: HandTarget; lHand?: HandTarget; kneel?: boolean | "l" | "r" };

// THE KNEEL (Arthur, Oct 14, his drawing at the campfire: "whenever a stick figure goes to kneel down… not even a comfortable
// pose"): a real half-kneel — the DOWN knee on the floor (that thigh nearly upright, its shin flat on the floor behind), the
// other foot planted flat in front with its shin upright (thigh about level), the back leaning forward so the hands reach low.
// The weight rests on the knee and the front foot, so it can be held as long as needed (lighting a fire, tying a shoe, petting a
// dog, picking a flower, looking at something on the floor). The hips only fold to the rig's limit: leaning further forward than
// ~38° tips the front thigh down and the front foot steps a little further out.
// (hands working DOWN AT THE FLOOR from a kneel — tying the front shoe, planting, picking a flower: the chest folds over the front
// thigh, like a person does; Arthur, Oct 15: "he's touching his shin, not his feet")
export const KNEEL_FOLD_LOW = 0.18, KNEEL_FOLD_LEAN = 70;
const OWN_FOOT = /\b(shoes?|shoelaces?|laces?|boots?|socks?|sneakers?|his foot|her foot|their foot|ankle)\b/i;
export const KNEEL_MAX_LEAN = 42; // (further would fold the front thigh down and push the front foot out: the hand reaches instead)
export function kneelPose(pose: PoseAngles, down: "l" | "r", maxLean = KNEEL_MAX_LEAN): PoseAngles {
  const front = down === "l" ? "r" : "l";
  const T = PROPORTIONS.thigh, S = PROPORTIONS.shin, DEG = Math.PI / 180;
  const lean = clamp(pose.lean, -10, maxLean), back = -4; // (the down thigh: 4° behind upright)
  const h = T * Math.cos(back * DEG); // the hips this high: the down knee is on the floor
  const thigh = clamp(128 - lean, 80, 90); // (the front thigh about level, unless the chest folds onto it)
  const dy = h - T * Math.cos(thigh * DEG), shin = Math.atan2(Math.sqrt(Math.max(0, S * S - dy * dy)), dy) / DEG;
  return clampPose({ ...pose, lean, [`${down}Hip`]: back + lean, [`${down}Knee`]: back + 90, [`${front}Hip`]: thigh + lean, [`${front}Knee`]: thigh - shin } as PoseAngles).pose;
}

// The pose with its hands moved to the key's hand targets (facing-right body units: hips at 0, y down; the floor under the
// lowest foot, minus the lift).
export function reachHands(pose: PoseAngles, k: CustomKey, lift = 0, maxLean = 105): PoseAngles {
  const want = { r: k.rHand ?? k.hand, l: k.lHand };
  if (!want.r && !want.l) return pose;
  let out = pose;
  // TWO HANDS ON ONE TOOL — THE GRIP COMES TO THE BODY (Arthur, Oct 15, his drawing of sweeping: "standing upright, small lean,
  // knees slightly bent, both hands on the handle"). A key with BOTH hand targets is a two-hand grip (a broom, a rake, a shovel,
  // a mop, an axe, a roller on a pole, a bat, a steering wheel). When the grip is out of comfortable reach the body never topples
  // forward to it (that was the flat lunge with the tool in the sky): the lean stays ≤ TOOL_JOB_LEAN and the WHOLE GRIP slides
  // toward the shoulders — both hands by the same amount, so the tool keeps the angle the plan gave it — until both hands are
  // within comfortable reach.
  const pair = twoHandGrip(out, want.r, want.l, lift);
  if (pair) { out = pair.pose; want.r = pair.r; want.l = pair.l; maxLean = Math.min(maxLean, Math.max(TOOL_JOB_LEAN, pose.lean)); }
  for (const side of ["r", "l"] as const) {
    const t = want[side], x = num(t?.x), y = num(t?.y);
    if (x === undefined || y === undefined) continue;
    const tx = clamp(x, -1.5, 1.5), ty = clamp(y, -0.2, 2), arm = PROPORTIONS.upperArm + PROPORTIONS.forearm;
    // (too far for the arm: the body leans toward it — forward, or back for a point behind / high — up to 45°)
    for (let n = 0; n < 9; n += 1) {
      const b = bodyOf(out), floor = Math.max(b.lFoot.y, b.rFoot.y) + lift, d = Math.hypot(tx - b.neck.x, floor - ty - b.neck.y);
      if (d <= 0.97 * arm || Math.abs(out.lean - pose.lean) >= 45 || out.lean + 5 > maxLean) break;
      out = clampPose({ ...out, lean: out.lean + 5 * (tx >= b.neck.x ? 1 : -1) }).pose;
    }
    const b = bodyOf(out), floor = Math.max(b.lFoot.y, b.rFoot.y) + lift;
    out = clampPose(handAt(out, side, tx - b.neck.x, floor - ty - b.neck.y)).pose;
  }
  return out;
}
export const TOOL_JOB_LEAN = 35; // (degrees: the most a figure leans while working a tool with both hands)
export const TOOL_JOB_CHEST = 0.68; // (x height above the floor: chest height)
export const TOOL_JOB_REACH = 0.9; // (x the arm's length: a comfortable two-hand grip, elbows a little bent)
export function twoHandGrip(pose: PoseAngles, r: HandTarget | undefined, l: HandTarget | undefined, lift = 0): { pose: PoseAngles; r: HandTarget; l: HandTarget } | undefined {
  const rx = num(r?.x), lx = num(l?.x), ry = num(r?.y), ly = num(l?.y);
  if (rx === undefined || ry === undefined || lx === undefined || ly === undefined) return undefined;
  if (Math.hypot(rx - lx, ry - ly) > 0.45) return undefined; // (hands far apart: two separate reaches, not one tool)
  // (both hands down at the floor — tying a shoe, planting a seed, picking up a pebble — is handwork, not a long tool's grip: the
  // hands go exactly there; Oct 15: the grip rule slid the shoelace hands up to the shin)
  if (ry < KNEEL_FOLD_LOW && ly < KNEEL_FOLD_LOW) return undefined;
  const arm = TOOL_JOB_REACH * (PROPORTIONS.upperArm + PROPORTIONS.forearm);
  // (a far grip: first lean toward it — but never past TOOL_JOB_LEAN — then slide the grip in for the rest)
  const fwd = (rx + lx) / 2 >= 0 ? 1 : -1;
  // (the key's own lean is the AI's choice — a heavy push may lean further — the GRIP only never adds lean past TOOL_JOB_LEAN)
  let lean = pose.lean, body = pose;
  const shoulderOf = (p: PoseAngles) => { const b = bodyOf(p); return { x: b.neck.x, y: Math.max(b.lFoot.y, b.rFoot.y) + lift - b.neck.y }; }; // (target units: forward, up from the floor)
  const farOf = (sh: { x: number; y: number }) => Math.max(Math.hypot(rx - sh.x, ry - sh.y), Math.hypot(lx - sh.x, ly - sh.y));
  while (farOf(shoulderOf(body)) > arm && Math.abs(lean + 5 * fwd) <= TOOL_JOB_LEAN) { lean += 5 * fwd; body = clampPose({ ...pose, lean }).pose; }
  const shoulder = shoulderOf(body);
  // (a tool pointing DOWN to the floor — the lower hand clearly lower and further out, like a broom, a rake, a mop, a shovel — is
  // worked from CHEST height: the top hand no higher than TOOL_JOB_CHEST, the lower hand near the hip; both drop by the same amount)
  const [hi, lo] = ry >= ly ? [{ x: rx, y: ry }, { x: lx, y: ly }] : [{ x: lx, y: ly }, { x: rx, y: ry }];
  const down = hi.y - lo.y > 0.06 && Math.abs(lo.x) > Math.abs(hi.x) - 0.02 ? Math.max(0, hi.y - TOOL_JOB_CHEST) : 0;
  const RY = ry - down, LY = ly - down;
  const out = (dx: number) => Math.max(Math.hypot(rx + dx - shoulder.x, RY - shoulder.y), Math.hypot(lx + dx - shoulder.x, LY - shoulder.y));
  // (slide the grip toward the shoulders — the same shift for both hands, sideways only, so the tool keeps its angle and the
  // hands keep their planned heights — never past the shoulders)
  const toward = Math.sign(shoulder.x - (rx + lx) / 2) || -1, limit = Math.abs(shoulder.x - (rx + lx) / 2);
  let dx = 0;
  while (out(dx) > arm && Math.abs(dx) + 0.01 <= limit) dx += 0.01 * toward;
  if (dx === 0 && down === 0 && body === pose) return undefined;
  return { pose: body, r: { x: rx + dx, y: RY }, l: { x: lx + dx, y: LY } };
}
// `seated`: the whole move happens ON A SEAT (a chair, a bench, a stool drawn as a prop under the hips): the seat carries the
// weight, so the hips stay where the pose puts them — behind the feet — instead of being pulled over the feet to balance
// (Arthur, Oct 12: "a stick figure at his desk… typing" was mimed standing because nothing could sit on a chair).
// `startsInPose`: the figure is ALREADY in the first key's pose when the move starts — a scene that opens with someone sitting at
// a desk, lying in bed, crouched — instead of moving into it from standing (Oct 12: the desk scene began with a stand-up-sit).
export type CustomParams = { keys?: CustomKey[]; name?: string; repeat?: number; seated?: boolean; startsInPose?: boolean };

export const CUSTOM_ABOUT = "ORIGINAL MOVE for anything not in the library (a robot dance, tiptoeing, a dab, a kata, a celebration...): `keys` = rough KEY POSES in order, each { pose: angles like the lessons' key poses (side view, facing right; missing angles = the key before), at?: seconds from the move's start (missing = the engine times it), dx?: px forward from the key before, lift?: px in the air, feet?: \"both\"|\"front\"|\"back\"|\"none\" planted (default: the feet on the floor), hold?: seconds to hold it, strike?: true for a hit, rHand?/lHand?: {x: forward from the hips, y: up from the floor} (x height) = put that hand exactly there (the engine bends the arm), kneel?: true = one knee down, front foot flat: to reach anything LOW (never a held squat) }; `repeat` (1..8) plays them again; `name`. Write ONLY the key poses: the ENGINE adds the timing, an anticipation (POWER moves only; kneel/bend/reach go straight), ease in/out at holds, follow-through and settle, gravity in the air, planted feet that never slide (a planted foot that must move steps) and balance. Marks: `k1`..`kN` (each key), `hit` (first strike), `land`. A TOUCH FROM THE NAME: name the touch (put / lean / press / grab / knock / pat / shake hands / fist bump / kick X) and the engine walks the figure into reach and puts the hand or foot ON the named thing or partner. A key may say it outright: `touch: \"<thing name>\"` or `touch: \"<figure id>\"` / `\"<figure id>.<joint>\"`.";

type Side = "l" | "r";
type Inner = { t: number; pose: PoseAngles; hx: number; lift: number; planted: Side[]; ease?: Ease; liftEase?: Ease; xEase?: Ease };
type Resolved = { pose: PoseAngles; at?: number; dx: number; lift: number; feet?: CustomFeet; hold?: number; strike: boolean; kneel?: Side };

// POWER OR CAREFUL (Arthur, Oct 14: "whenever a stick figure goes to kneel down, it's so slow. They always lean back super fast,
// then slowly lean forward"). A wind-up (a move the other way first) belongs ONLY to a POWER move — a strike, a jump, a throw, a
// chop, a kick, a big fast swing. A CAREFUL move — kneeling, crouching, bending, reaching, picking up, sitting, lighting, placing,
// petting, tying — goes STRAIGHT to its pose at a calm human speed (a person kneels in ~0.6–0.9 s): no backward jerk first.
// Decided by the move: a strike key or a take-off = power; a careful word in its name = careful; a power word = power; otherwise
// only a big, fast change that does not go down low is power.
const POWER_WORDS = /\b(punch|kick|strike|strikes|hit|hits|smash|slam|chop|swing|throw|toss|hurl|pitch|jump|leap|hop|spike|serve|hammer|whack|slap|karate|kata|dunk|shoot|launch|pound|stomp|bash|uppercut|jab|attack|fling|dab|flex)/i;
const CAREFUL_WORDS = /\b(kneel|crouch|bend|bow|reach|pick|sit|light|place|put|set down|lay|lie|lower|pet|stroke|tie|lace|touch|press|pour|plant|gather|collect|feed|warm|peek|look|pray|squat|tend|fix|wipe|clean|dig|search)/i;
export function isPowerMove(params: CustomParams, keys: { strike?: boolean; lift?: number; pose: PoseAngles; at?: number }[], start: PoseAngles): boolean {
  if (keys.some((k) => k.strike || (k.lift ?? 0) > 0.004)) return true;
  const name = String(params?.name ?? "");
  if (CAREFUL_WORDS.test(name)) return false;
  if (POWER_WORDS.test(name)) return true;
  let before = start, t0 = 0;
  for (const k of keys) {
    const c = travel(before, k.pose), lower = bodyOf(k.pose), upper = bodyOf(before);
    const goesLow = Math.max(lower.lFoot.y, lower.rFoot.y) < Math.max(upper.lFoot.y, upper.rFoot.y) - 0.08;
    const fast = k.at !== undefined && c / Math.max(0.05, k.at - t0) > STRIKE_PACE * 0.8;
    if (!goesLow && (fast || c >= 1.0)) return true;
    before = k.pose; if (k.at !== undefined) t0 = k.at;
  }
  return false;
}
const hipsUp = (pose: PoseAngles) => { const b = bodyOf(pose); return Math.max(b.lFoot.y, b.rFoot.y); };
const CAREFUL_MIN = 0.6, CAREFUL_MAX = 0.9; // seconds: a careful big change (kneeling down, getting up from it, bending low)

// Body speeds (x height per second, the furthest joint): THREE SPEEDS (lessons PRINCIPLES "SMOOTH, NOT ROBOTIC").
const WALK_PACE = 1.2; // anticipation
const JOG_PACE = 2.2; // everything else
const STRIKE_PACE = 3.6; // a strike: a hand or foot at strike speed
const GRAVITY = 5.6; // x height per second squared (9.8 m/s^2 for a 1.75 m figure)
const REACH = (PROPORTIONS.thigh + PROPORTIONS.shin) * 0.9995;
const STEP_MIN = 0.05; // x height: a planted foot further than this from where the next pose wants it steps there
const FOOT_LIFT = 0.07; // x height: how high a stepping foot is lifted on the way
const MAX_KEYS = 24;

const bodyOf = (pose: PoseAngles) => forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const SIDES: readonly Side[] = ["l", "r"];
const foot = (side: Side) => `${side}Foot` as "lFoot" | "rFoot";

// The AI's rough key -> a whole pose (missing angles = the pose before; shoulders the shortest way round; inside limits).
function resolvePose(previous: PoseAngles, partial: unknown): PoseAngles {
  const out = { ...previous };
  if (partial && typeof partial === "object") {
    for (const key of POSE_KEYS) {
      const value = num((partial as Record<string, unknown>)[key]);
      if (value === undefined) continue;
      let v = clamp(value, -720, 720);
      if (key === "lShoulder" || key === "rShoulder") { while (v - previous[key] > 180) v -= 360; while (v - previous[key] < -180) v += 360; }
      out[key] = v;
    }
  }
  return continueElbows(previous, clampPose(out).pose);
}

// Which feet are planted at a key (side view, facing-relative: the front foot is the one further forward).
function plantedOf(pose: PoseAngles, lift: number, feet: CustomFeet | undefined): Side[] {
  if (lift > 0.004) return [];
  const b = bodyOf(pose);
  const low = Math.max(b.lFoot.y, b.rFoot.y);
  const front: Side = b.lFoot.x >= b.rFoot.x ? "l" : "r";
  const back: Side = front === "l" ? "r" : "l";
  // (A foot the pose clearly holds up — a kick, a knee raise — is never planted, whatever `feet` says.)
  const down = (side: Side, tolerance: number) => low - b[foot(side)].y <= tolerance;
  if (feet === "none") return [];
  // (front / back: of the feet that are down; a pose with one foot up stands on the other.)
  if (feet === "front" || feet === "back") {
    const near = SIDES.filter((s) => down(s, 0.12));
    if (near.length === 1) return near;
    return [feet === "front" ? front : back];
  }
  if (feet === "both") return SIDES.filter((s) => down(s, 0.12));
  // (Default: a folded leg (knee bent 35+) a little higher than the other is lifted — a step, a knee raise; a straight-ish
  // leg reaching back or forward is a stance on the floor even when the AI's rough angles leave it a bit high.)
  return SIDES.filter((s) => down(s, pose[`${s}Knee`] >= 35 ? 0.025 : 0.1));
}

// The legs placed for planted feet at `spots` (x height, forward of the start hips) with the hips at `hx`, `h` above the
// floor; a free foot is kept off the floor (or put at `free`). Balanced: the hips shift so the weight is over the feet.
function placeLegs(pose: PoseAngles, hx: number, planted: Side[], spots: Partial<Record<Side, number>>, free?: { side: Side; x: number }, seated = false) {
  const b = bodyOf(pose);
  if (planted.length === 0) return { pose, hx };
  const h = Math.max(...planted.map((s) => b[foot(s)].y));
  const legsAt = (at: number) => {
    let hh = h;
    for (const s of planted) hh = Math.min(hh, Math.sqrt(Math.max(0.01, REACH * REACH - (spots[s]! - at) ** 2)));
    let p = pose;
    for (const s of planted) p = footAt(p, s, spots[s]! - at, hh);
    for (const s of SIDES) {
      if (planted.includes(s)) continue;
      if (free && free.side === s) { p = footAt(p, s, free.x - at, hh - FOOT_LIFT); continue; }
      const fb = bodyOf(p);
      if (fb[foot(s)].y > hh - 0.02) p = footAt(p, s, fb[foot(s)].x, hh - 0.04);
    }
    return clampPose(p).pose;
  };
  // Hips within reach of every planted foot.
  const xs = planted.map((s) => spots[s]!);
  const lo = Math.max(...xs) - REACH * 0.97, hi = Math.min(...xs) + REACH * 0.97;
  let at = lo <= hi ? clamp(hx, lo, hi) : (lo + hi) / 2;
  // BALANCE: the weight stays over the planted feet (only moved when it would fall over).
  const feetX = xs;
  if (!seated && balanceMargin(legsAt(at), at, feetX) < BALANCE_MARGIN) {
    const s = supportOf(feetX);
    const w = at + weightAhead(legsAt(at));
    const aim = clamp(w, s.back + BALANCE_MARGIN * 1.5, s.front - BALANCE_MARGIN * 1.5);
    at = balancedHips(legsAt, feetX, s.front - s.back > BALANCE_MARGIN * 3 ? aim : s.middle);
    if (lo <= hi) at = clamp(at, lo, hi);
  }
  return { pose: legsAt(at), hx: at };
}

// The crouch before going up (and the dip of a landing): hips and knees bend, the chest leans in a little.
const crouch = (pose: PoseAngles, depth: number): PoseAngles => clampPose({ ...pose, lean: pose.lean + 10 * depth, lHip: pose.lHip + 28 * depth, rHip: pose.rHip + 28 * depth, lKnee: pose.lKnee + 56 * depth, rKnee: pose.rKnee + 56 * depth }).pose;

// A LIMB THAT TAKES THE BODY'S WEIGHT BENDS (Arthur, cartwheel: "the arms need to bend a little from the weight"): a
// hand down on the floor (as low as the lowest foot or hand: a handstand, push-up, cartwheel, vault) carries the body,
// so its elbow bends CLEARLY (A BODY IS HEAVY, motion.ts `weightBend`: by its share of the weight — one hand alone bends
// most, two hands share it, feet on the floor too take some); when the hand lifts off the arm straightens again.
// (Landing feet get the same rule from the landing dip below: the knees give, then straighten.)
export const WEIGHT_GIVE = weightBend(1 / 3); // degrees: the least a planted elbow bends
export function bearWeight(pose: PoseAngles, lift: number): PoseAngles {
  if (lift > 0.004) return pose;
  const b = bodyOf(pose);
  const floor = Math.max(b.lFoot.y, b.rFoot.y, b.lHand.y, b.rHand.y);
  const hands = SIDES.filter((s) => floor - b[`${s}Hand`].y <= 0.03);
  const feetDown = SIDES.some((s) => floor - b[`${s}Foot`].y <= 0.03);
  const give = weightBend((feetDown ? 2 / 3 : 1) / Math.max(1, hands.length));
  let p = pose;
  for (const s of hands) if (p[`${s}Elbow`] < give) p = { ...p, [`${s}Elbow`]: give };
  return p;
}

// How different two poses are in angle (for "did the AI already write a wind-up?").
const deltaOf = (a: PoseAngles, b: PoseAngles) => POSE_KEYS.map((k) => b[k] - a[k]);
const dot = (u: number[], v: number[]) => u.reduce((s, x, i) => s + x * v[i], 0);
const size = (u: number[]) => Math.sqrt(dot(u, u));

export function custom(start: Stance, params: CustomParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const tempo = tempoOf(settings);
  const robot = RAMP_SCALE[settings.style] === 0;
  const amp = amplitudeOf(settings);
  const raw = Array.isArray(params?.keys) ? params.keys.filter((k) => k && typeof k === "object").slice(0, MAX_KEYS) : [];
  const repeat = Math.round(clamp(num(params?.repeat) ?? 1, 1, 8));
  const seatedMove = params?.seated === true;
  // (A repeat is timed by the engine: its `at`s would point back into the first time through.)
  const list: CustomKey[] = [];
  for (let n = 0; n < repeat; n += 1) for (const k of raw) list.push(n === 0 ? k : { ...k, at: undefined });
  // (KNEELING STAYS KNEELING: a key that kneels makes the low keys right next to it — both knees bent 60+ on the floor, the
  // AI's rough crouches — kneel on the same knee: a body that stays down low rests in the one comfortable low pose)
  const kneels: (Side | undefined)[] = list.map((k) => (k.kneel === "l" || k.kneel === "r" ? k.kneel : k.kneel === true ? "r" : undefined));
  {
    let raw = start.pose;
    const low = list.map((k) => { raw = resolvePose(raw, k.pose); return (num(k.lift) ?? 0) <= 0 && raw.lKnee >= 60 && raw.rKnee >= 60; });
    for (let pass = 0; pass < 2; pass += 1) for (let i = 0; i < list.length; i += 1) {
      if (kneels[i]) continue;
      const near = [kneels[i - 1], kneels[i + 1]].find((s) => s);
      if (near && low[i]) kneels[i] = near;
    }
  }
  const keys: Resolved[] = [];
  let before = start.pose;
  list.forEach((k, n) => {
    const lift = clamp(num(k.lift) ?? 0, 0, 1.5 * H) / H, kneel = lift <= 0.004 ? kneels[n] : undefined;
    let pose = resolvePose(before, k.pose);
    if (kneel) pose = kneelPose(pose, kneel);
    // (OWN FEET ARE TOUCHED ON THE FOOT — tying a shoe, pulling on a boot or a sock: the hands go onto the FRONT foot's shoe, wherever
    // the kneel put it, not where the AI guessed; Arthur, Oct 15: "he's not touching his feet")
    if (kneel && OWN_FOOT.test(String(params?.name ?? ""))) { const b = bodyOf(pose), f = kneel === "l" ? b.rFoot : b.lFoot, floor = Math.max(b.lFoot.y, b.rFoot.y), fx = f.x - b.hip.x, fy = floor - f.y; k = { ...k, rHand: { x: fx + 0.035, y: fy + 0.045 }, lHand: { x: fx - 0.005, y: fy + 0.05 } }; }
    const low = (h: unknown) => typeof (h as { y?: unknown } | undefined)?.y === "number" && (h as { y: number }).y < KNEEL_FOLD_LOW;
    pose = reachHands(bearWeight(pose, lift), k, lift, kneel ? (low(k.rHand) || low(k.lHand) ? KNEEL_FOLD_LEAN : KNEEL_MAX_LEAN) : 105);
    if (kneel) pose = kneelPose(pose, kneel, low(k.rHand) || low(k.lHand) ? KNEEL_FOLD_LEAN : KNEEL_MAX_LEAN); // (the legs refit the lean the reach asked for)
    before = pose;
    const feet = kneel ? "both" : (["both", "front", "back", "none"] as const).find((f) => f === k.feet);
    keys.push({ pose, at: num(k.at) !== undefined ? clamp(num(k.at)!, 0, 60) : undefined, dx: clamp(num(k.dx) ?? 0, -1.5 * H, 1.5 * H) / H, lift, feet, hold: num(k.hold) !== undefined ? clamp(num(k.hold)!, 0, 5) : undefined, strike: k.strike === true, kneel });
  });
  const power = isPowerMove(params, keys, start.pose), carefulName = CAREFUL_WORDS.test(String(params?.name ?? ""));

  const s0 = bodyOf(start.pose);
  const spots: Partial<Record<Side, number>> = { l: s0.lFoot.x, r: s0.rFoot.x };
  const out: Inner[] = [{ t: start.t, pose: start.pose, hx: 0, lift: 0, planted: ["l", "r"] }];
  if (params?.startsInPose === true && keys.length && keys[0].lift <= 0.004) {
    const b0 = bodyOf(keys[0].pose);
    const hx0 = seatedMove ? SIDES.reduce((acc, sd) => acc + (spots[sd]! - b0[foot(sd)].x), 0) / 2 : 0;
    const placed0 = placeLegs(keys[0].pose, hx0, ["l", "r"], spots, undefined, seatedMove);
    out[0] = { t: start.t, pose: placed0.pose, hx: placed0.hx, lift: 0, planted: ["l", "r"] };
  }
  const marks: Record<string, number> = {};
  const last = () => out[out.length - 1];
  // Add a key: planted feet keep their spots (or `stepTo`), new ones plant where the pose puts them, legs re-bent to reach.
  const push = (t: number, pose: PoseAngles, hx: number, lift: number, planted: Side[], o: { stepTo?: { side: Side; x: number }; free?: { side: Side; x: number }; ease?: Ease; liftEase?: Ease; xEase?: Ease } = {}) => {
    const prev = last();
    if (t <= prev.t + 1e-3) t = prev.t + 1e-3;
    if (o.ease) prev.ease = robot ? "linear" : o.ease;
    prev.liftEase = o.liftEase ?? prev.ease;
    prev.xEase = o.xEase ?? prev.ease;
    const b = bodyOf(pose);
    for (const s of SIDES) if (!planted.includes(s) || !prev.planted.includes(s)) delete spots[s];
    for (const s of planted) {
      if (o.stepTo?.side === s) spots[s] = o.stepTo.x;
      else if (spots[s] === undefined) spots[s] = hx + b[foot(s)].x;
    }
    // (SEATED: the hips go back ONTO THE SEAT while the planted feet stay — where the pose itself puts the feet ahead of the hips —
    // so a seated pose (thighs level, shins down) really sits instead of crouching over the feet)
    if (seatedMove && lift <= 0.004 && planted.length) { const back = planted.map((s0) => (spots[s0] ?? hx + b[foot(s0)].x) - b[foot(s0)].x); hx = back.reduce((x, y) => x + y, 0) / back.length; }
    const placed = lift > 0.004 ? { pose: clampPose(pose).pose, hx } : placeLegs(pose, hx, planted, spots, o.free, seatedMove);
    out.push({ t, pose: continueElbows(prev.pose, placed.pose), hx: placed.hx, lift, planted });
    return out[out.length - 1];
  };

  // ANTICIPATION goes before the biggest change (and every strike and take-off).
  let anticipated = false;
  const changeOf = (a: PoseAngles, k: Resolved, aLift: number) => travel(a, k.pose) + Math.abs(k.dx) + 2 * Math.abs(k.lift - aLift);
  let biggest = -1, most = 0.15;
  keys.forEach((k, i) => { const c = changeOf(i === 0 ? start.pose : keys[i - 1].pose, k, i === 0 ? 0 : keys[i - 1].lift); if (c > most) { most = c; biggest = i; } });

  let cursor = start.t; // when the body may start leaving its current pose
  let hx = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const K = keys[i];
    const A = last();
    const fromUser = i === 0 ? start.pose : keys[i - 1].pose;
    const aLift = A.lift;
    // (A KNEEL is made around the front foot: it stays planted where it is, the hips go back and down from it, and the down
    // leg steps back to put its knee on the floor — never re-bent by the leg solver into a lunge.)
    const frontSide: Side | undefined = K.kneel ? (K.kneel === "l" ? "r" : "l") : undefined;
    const targetHx = frontSide && A.planted.includes(frontSide) && spots[frontSide] !== undefined && !(i > 0 && keys[i - 1].kneel) ? spots[frontSide]! - bodyOf(K.pose)[foot(frontSide)].x : hx + K.dx;
    const isLast = i === keys.length - 1;
    const c = changeOf(A.pose, K, aLift);

    // ---- In the air (GRAVITY): from the last grounded key, up to the top and down to the landing.
    if (K.lift > 0.004) {
      const takeoff = aLift <= 0.004;
      if (takeoff && !robot) {
        // A crouch first (and the arms go back), unless the body is already low.
        const low = Math.max(A.pose.lKnee, A.pose.rKnee) > 50;
        const ant = low ? A.pose : crouch(windUp(A.pose, K.pose, 0.2 * amp, { only: ["lShoulder", "rShoulder", "lElbow", "rElbow"] }), 0.45 * amp);
        const tAnt = clamp(travel(A.pose, ant) / WALK_PACE, 0.16, 0.4) * tempo;
        if (!low) { push(cursor + tAnt, ant, hx, 0, A.planted, { ease: "smooth" }); cursor += tAnt; }
      }
      // The whole air run: its top decides the times of every key in it.
      let j = i;
      while (j + 1 < keys.length && keys[j + 1].lift > 0.004) j += 1;
      const run = keys.slice(i, j + 1);
      const top = Math.max(...run.map((k) => k.lift));
      const peak = i + run.findIndex((k) => k.lift === top);
      const up = Math.sqrt((2 * Math.max(top - aLift, 0)) / GRAVITY);
      const t0 = cursor;
      for (let n = i; n <= j; n += 1) {
        const k = keys[n];
        const t = n <= peak ? t0 + up - Math.sqrt((2 * (top - k.lift)) / GRAVITY) : t0 + up + Math.sqrt((2 * (top - k.lift)) / GRAVITY);
        hx += k.dx;
        push(Math.max(t, last().t + 0.06), k.pose, hx, k.lift, [], { ease: "smooth", liftEase: n <= peak ? "out" : "in", xEase: "linear" });
        marks[`k${n + 1}`] = last().t;
      }
      cursor = last().t;
      // The landing: the next key (on the ground), or a stand when nothing comes after.
      const land = keys[j + 1];
      const fall = Math.sqrt((2 * last().lift) / GRAVITY);
      const drop = last().lift;
      const landPose = land ? land.pose : { ...last().pose, lHip: STAND.lHip, rHip: STAND.rHip, lKnee: STAND.lKnee, rKnee: STAND.rKnee };
      hx += land ? land.dx : 0;
      const landed = push(cursor + Math.max(fall, 0.08), landPose, hx, 0, plantedOf(landPose, 0, land?.feet ?? "both").length ? plantedOf(landPose, 0, land?.feet ?? "both") : ["l", "r"], { ease: "smooth", liftEase: "in", xEase: "linear" });
      marks.land ??= landed.t;
      if (land) marks[`k${j + 2}`] = landed.t;
      hx = landed.hx;
      cursor = landed.t;
      // FOLLOW-THROUGH: the landing dips (weight), then settles.
      if (!robot) {
        // (A BODY IS HEAVY: the knees give clearly — both feet share the weight, a bigger fall bends them more.)
        const dip = push(cursor + 0.1 * tempo, crouch(landPose, (weightBend(0.5, drop / 0.5) / 56) * amp), hx, 0, landed.planted, { ease: "out" });
        hx = dip.hx;
        const settle = push(dip.t + 0.2 * tempo, landPose, hx, 0, landed.planted, { ease: "smooth" });
        hx = settle.hx;
        cursor = settle.t;
      }
      const holdLand = land?.hold ?? (j + 1 === keys.length - 1 ? 0.35 : 0);
      if (holdLand > 0) { const next = keys[j + 2]; const h = push(cursor + holdLand, next ? lerpPose(last().pose, next.pose, 0.03) : last().pose, hx, 0, last().planted, { ease: "smooth" }); cursor = h.t; hx = h.hx; }
      i = land ? j + 1 : j;
      continue;
    }

    // ---- On the ground.
    const strike = K.strike;
    let dur = (strike ? clamp(c / STRIKE_PACE, 0.1, 0.3) : clamp(c / JOG_PACE, 0.18, 1.2)) * tempo;
    // JOINTS MOVE AT A HUMAN SPEED (motion.ts jointChangeSeconds): a big pose change never snaps (the first key too,
    // from the stand). Measured between the poses as written (the planted legs' re-bending is not a change).
    if (!strike) dur = Math.max(dur, jointChangeSeconds(fromUser, K.pose, settings));
    // (A CAREFUL big change — kneeling down, getting up from it, bending low — at a calm human speed: 0.6–0.9 s.)
    // (per key: a key that goes down low or comes up from low is careful even inside a power move — kneeling to strike a match)
    const lowChange = Math.abs(hipsUp(K.pose) - hipsUp(A.pose)) > 0.08;
    if (!strike && c >= 0.3 && ((!power && carefulName) || lowChange)) {
      // (the whole-body sum rule would make a kneel take 2 s — "so slow": a careful change is held only to the single fastest joint)
      const most = Math.max(...POSE_KEYS.map((j) => Math.abs(K.pose[j] - fromUser[j])));
      dur = Math.max(clamp(dur, CAREFUL_MIN * tempo, CAREFUL_MAX * tempo), (most / JOINT_DEG_PER_SEC) * tempo / (0.85 + 0.3 * clamp(settings.energy, 0, 1)));
    }
    // ANTICIPATION: before the biggest change and every strike — unless the AI already wrote a move the other way.
    // (ONE wind-up, only where it belongs — Arthur, Oct 12: "he lifts up his feet like three times in a row before he actually hits":
    // the wind-up comes once — before the biggest change or the move's first strike — and moves only the joints that act (the
    // kicking leg, the punching arm), never the standing leg; a combo's later strikes flow from the one before)
    let ant: PoseAngles | undefined;
    // (and never on a key that takes the body DOWN low — kneeling to strike a match is careful even though the match is struck)
    if (!robot && power && !anticipated && hipsUp(K.pose) >= hipsUp(A.pose) - 0.08 && (i === biggest || (strike && c > 0.15))) {
      const prevUser = i >= 2 ? keys[i - 2].pose : i === 1 ? start.pose : undefined;
      const u = prevUser ? deltaOf(prevUser, fromUser) : [], v = deltaOf(fromUser, K.pose);
      const already = prevUser !== undefined && size(u) > 10 && dot(u, v) < -0.25 * size(u) * size(v);
      const acting = (POSE_KEYS as readonly string[]).filter((j) => j !== "lean" && j !== "head" && Math.abs((K.pose as Record<string, number>)[j] - (A.pose as Record<string, number>)[j]) > 15) as typeof POSE_KEYS[number][];
      if (!already && acting.length) { ant = clampPose(windUp(A.pose, K.pose, (strike ? 0.28 : 0.2) * amp, { only: acting })).pose; anticipated = true; }
    }
    let tAnt = ant ? clamp(travel(A.pose, ant) / WALK_PACE, 0.15, 0.4) * tempo : 0;
    let T: number;
    if (K.at !== undefined) {
      T = Math.max(start.t + K.at, cursor + 0.06);
      const avail = T - cursor, need = dur + tAnt;
      if (need > avail) { const k = avail / need; dur *= k; tAnt *= k; }
      // A long wait before it: a moving hold (drifts a hair toward the next pose, never frozen dead).
      else if (avail - need > 0.1) { const h = push(T - need, lerpPose(A.pose, K.pose, 0.03), hx, 0, A.planted, { ease: "smooth" }); hx = h.hx; }
    } else T = cursor + tAnt + dur;
    if (ant) { const a = push(T - dur, ant, hx - 0.15 * K.dx, 0, A.planted, { ease: "smooth" }); hx = a.hx; }
    const from = last();
    // A planted foot that must be somewhere else STEPS (lifts on the way; the other foot stays).
    const want = plantedOf(K.pose, 0, K.feet);
    const bK = bodyOf(K.pose);
    const needs = SIDES.filter((s) => want.includes(s) && from.planted.includes(s) && spots[s] !== undefined).map((s) => ({ s, d: targetHx + bK[foot(s)].x - spots[s]! })).filter((n) => Math.abs(n.d) > STEP_MIN);
    let stepTo: { side: Side; x: number } | undefined;
    // (Only for real travel (`dx`) or a stance that gets wider or narrower: leaning or turning the hips moves the hips,
    // not the feet.)
    const both = SIDES.every((s) => want.includes(s) && from.planted.includes(s) && spots[s] !== undefined);
    const widens = both && Math.abs((bK.lFoot.x - bK.rFoot.x) - (spots.l! - spots.r!)) > 0.08;
    // (kneel to kneel: both feet stay where they are; the legs re-bend)
    if (needs.length > 0 && !(K.kneel && i > 0 && keys[i - 1].kneel) && (Math.abs(K.dx) >= STEP_MIN || Math.abs(targetHx - hx) >= STEP_MIN || widens)) {
      needs.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      const side = needs[0].s, other: Side = side === "l" ? "r" : "l";
      const anchored = from.planted.includes(other) && want.includes(other) && spots[other] !== undefined;
      const x = needs.length > 1 && anchored ? spots[other]! + (bK[foot(side)].x - bK[foot(other)].x) : targetHx + bK[foot(side)].x;
      // (Only with a key in between where it is off the floor: a foot never jumps while planted.)
      if (anchored && dur >= 0.12) {
        stepTo = { side, x };
        const mid = push(T - dur / 2, lerpPose(from.pose, K.pose, 0.5), (from.hx + targetHx) / 2, 0, [other], { ease: strike ? "in" : "smooth", free: { side, x: (spots[side]! + x) / 2 } });
        hx = mid.hx;
      }
    }
    const arrived = push(T, K.pose, targetHx, 0, want, { ease: strike ? "in" : "smooth", stepTo });
    hx = arrived.hx;
    marks[`k${i + 1}`] = arrived.t;
    if (strike) marks.hit ??= arrived.t;
    cursor = arrived.t;
    // FOLLOW-THROUGH and SETTLE where the motion stops (a strike, a held pose, the end) after a real change.
    const hold = K.hold ?? (isLast ? 0.4 : strike ? 0.08 : 0);
    const stops = strike || hold > 0 || isLast;
    if (!robot && stops && (strike || c >= 0.2)) {
      const over = clampPose(lerpPose(from.pose, K.pose, 1 + (strike ? 0.14 : 0.07) * amp)).pose;
      const f = push(cursor + (strike ? 0.09 : 0.12) * tempo, over, hx, 0, arrived.planted, { ease: strike ? "out" : "smooth" });
      const s = push(f.t + (strike ? 0.2 : 0.18) * tempo, K.pose, f.hx, 0, arrived.planted, { ease: "smooth" });
      hx = s.hx;
      cursor = s.t;
    }
    if (hold > 0) {
      const next = keys[i + 1];
      const h = push(cursor + hold * (K.hold !== undefined ? 1 : tempo), next && next.lift <= 0.004 ? lerpPose(K.pose, next.pose, 0.03) : K.pose, hx, 0, last().planted, { ease: "smooth" });
      hx = h.hx;
      cursor = h.t;
    }
  }
  // GETTING UP FROM THE FLOOR TAKES TIME (Arthur, Oct 15, tying a shoe: "he gets up abnormally fast, no acceleration or
  // deceleration"): a move that ends kneeling / crouched low rises like a person — lean forward over the front foot, push up
  // (~0.5 s), then straighten (~0.5 s), easing in and out — instead of the next move snapping the body upright.
  {
    const L0 = last(), bend = Math.min(Math.abs(L0.pose.lKnee - STAND.lKnee), Math.abs(L0.pose.rKnee - STAND.rKnee)); // (BOTH knees down: a kneel / crouch, never a one-leg reach)
    if (keys.length > 0 && keys[keys.length - 1].kneel && L0.lift <= 0.004 && bend > 60) { // (the move ENDS kneeling — not a reach that bends the knees)
      const standing = { ...L0.pose, lean: 0, lHip: STAND.lHip, rHip: STAND.rHip, lKnee: STAND.lKnee, rKnee: STAND.rKnee };
      const mid = { ...lerpPose(L0.pose, standing, 0.5), lean: Math.max(L0.pose.lean, 18) };
      const up1 = push(L0.t + 0.5 * tempo, mid, L0.hx, 0, ["l", "r"], { ease: "smooth" });
      push(up1.t + 0.5 * tempo, standing, up1.hx, 0, ["l", "r"], { ease: "smooth" });
    }
  }
  // It ends standing on both feet (a foot left up comes down; the arms stay as they are).
  if (last().planted.length < 2 && last().lift <= 0.004 && keys.length > 0) {
    const L = last();
    const pose = { ...L.pose, lHip: STAND.lHip, rHip: STAND.rHip, lKnee: STAND.lKnee, rKnee: STAND.rKnee };
    push(L.t + clamp(travel(L.pose, pose) / JOG_PACE, 0.2, 0.6) * tempo, pose, L.hx, 0, ["l", "r"], { ease: "smooth" });
  }
  if (keys.length === 0) push(start.t + 0.3, start.pose, 0, 0, ["l", "r"], { ease: "smooth" });

  const sign = forwardSign(start.facing);
  const charKeys: CharacterKey[] = out.map((k) => ({
    t: k.t, x: start.x + sign * k.hx * H, pose: k.pose, lift: k.lift * H, facing: start.facing,
    contacts: k.planted.map(foot) as FootContact[],
    ...(k.ease ? { ease: k.ease } : {}), ...(k.xEase ? { xEase: k.xEase } : {}), ...(k.liftEase ? { liftEase: k.liftEase } : {}),
  }));
  const end = charKeys[charKeys.length - 1];
  marks.done = end.t;
  return { keys: charKeys, end: { t: end.t, x: end.x, facing: start.facing, pose: end.pose }, marks };
}

// (For the tests: which feet the engine plants for a pose.)
export const customPlanted = plantedOf;
