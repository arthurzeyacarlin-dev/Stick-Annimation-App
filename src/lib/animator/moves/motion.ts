import type { CharacterKey, FootContact } from "../engine.ts";
import type { Ease } from "../easing.ts";
import { forwardKinematics } from "../pose.ts";
import { clampPose, ELBOW_ACROSS_AUTO, HEAD_RADIUS, JOINT_LIMITS, jointRange, STAND, type Facing, type PoseAngles, type PoseKey } from "../rig.ts";
import { RAMP_SCALE, SPEED_CHANGES, STYLE_CHANGES, type MoveSpeed, type MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2: the shared motion lesson every body move uses (Arthur, 2026-10-04).
// Almost every movement is: ANTICIPATION (a slow wind-up the opposite way) -> ACTION (speeds up fast
// into the hit / jump / throw) -> FOLLOW-THROUGH (slows down past the target) -> SETTLE (eases back to
// rest). Each part speeds up and slows down smoothly; the action is the fast part. A move is written as
// a short list of BEATS (target pose + what kind of beat it is); this file turns beats into engine key
// poses with the right timing and easing. No frames are ever written by hand: the engine makes every
// frame in between from these keys and its body rules.

// `guard`: how a fighter stands between strikes (punch.ts FIGHT LOOK): "loose" (the default: a cartoon
// stick-figure fight, hands low, around the belly), "high" (loose, but the hands up at the chest: when the
// user asks for higher hands) or "realistic" (a real boxing/MMA guard, hands up at the chin: only when the
// user explicitly asks for realistic or educational fighting).
export type MoveSettings = { height: number; style: MoveStyle; speed: MoveSpeed; energy: number; guard?: "loose" | "high" | "realistic" };

// Where a character is between moves: standing still on both feet.
export type Stance = { t: number; x: number; facing: Facing; pose: PoseAngles };

// What a move hands back: its key poses, where it ends, and named moments (e.g. "hit", "release",
// "land") that other characters or objects can be timed to. `flow` is where the move's own action is
// over, before it goes back to resting: when another move follows straight away (punch -> punch), the
// next move starts from there instead of from a rest pose (Arthur, 2026-10-04: no needless standing).
export type MoveOutput = { keys: CharacterKey[]; end: Stance; marks: Record<string, number>; flow?: { keys: number; stance: Stance } };

export type BeatKind =
  | "anticipation" // slow wind-up (eases in and out); deeper and a bit longer with more energy
  | "action" // the fast part: speeds up all the way into its end (the hit); faster with more energy
  | "follow" // slows down after the action (eases out)
  | "settle" // eases back toward rest (smooth)
  | "hold"; // stays (or nearly stays) in place

export type Beat = {
  kind: BeatKind;
  pose: PoseAngles; // target pose at the end of this beat (facing-relative: forward is +)
  seconds: number; // base duration (natural style, normal speed, energy 0.5)
  name?: string; // a mark for this beat's end time
  dx?: number; // forward travel during this beat, px (negative = backward)
  lift?: number; // lowest foot/knee height above the ground at the end of the beat (0 = on the ground)
  contacts?: FootContact[]; // planted feet at the end of this beat (default: both)
  ease?: Ease; // override the beat kind's easing for the angles
  xEase?: Ease;
  liftEase?: Ease;
  facing?: Facing; // turn to this facing at the end of this beat
  // Part of going back to rest at the end of the move (left out when another move follows straight on).
  recover?: boolean;
};

export const BOTH_FEET: FootContact[] = ["lFoot", "rFoot"];

// Direction of "forward" on the stage for a facing.
export const forwardSign = (facing: Facing) => (facing === "left" ? -1 : 1);

// How long things take for a style and speed (x the natural, normal-speed timing).
export function tempoOf(settings: MoveSettings) {
  const style = STYLE_CHANGES[settings.style].scale?.stepSeconds ?? 1;
  return style * SPEED_CHANGES[settings.speed].stepSeconds;
}

// A BODY IS HEAVY (Arthur, cartwheel: "I can't genuinely see his arms bend ... the weight of a stick figure is actually
// heavy"): any limb that takes the body's weight bends CLEARLY at the elbow/knee — enough to SEE at stick-figure size —
// in proportion to how much of the weight it takes (`share`: 1 = alone, 0.5 = shared by two hands or two feet) and how
// hard it arrives (`impact` 0..1: a bigger landing bends more); it straightens again as the weight leaves it.
// A STICK FIGURE IS SKIN AND BONE (Arthur: "I don't want him as strong as Hulk ... he's skin and bone"): a light, weak
// body GIVES a lot under its own weight — ~54° when two limbs share it, ~60° for one alone, up to 66° on a hard
// landing — so it visibly sinks into the support and pushes back out of it (never a rigid wheel). How far is limited
// by the head and the floor (seenWeightArm: the head never within HEAD_CLEAR of the floor, no elbow through it).
export function weightBend(share: number, impact = 0): number {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return Math.round(Math.min(66, 48 + 12 * c(share) + 10 * c(impact)));
}

// HOW MUCH A SUPPORT GIVES depends on how much of the body is RIGHT ABOVE it (Arthur, cartwheel: "his arm should bend
// MOST when he's upside down — right when both of his arms are on the ground"): `over` 0..1 = how stacked the body is
// over its supports (1 = straight above them, e.g. upside down over both hands; ~0.2-0.3 = still leaning off them, the
// first or last hand of a cartwheel). Stacked = the deepest give (~66), leaning off = clearly less (~48-51).
// THE SINK IS SLOW: a move that reaches its deepest give eases DOWN into it (slow in), the whole-body turn slows to a
// crawl for a beat (SINK_BEAT s) at the bottom, then carries on and speeds up again.
export const SINK_BEAT = 0.1;
// WEIGHT HANDS OVER (Arthur, cartwheel): the support taking the weight eases into its bend until it stops; as the
// weight moves on to the next support the old one straightens while the new one starts to give (arms bend -> arms
// straighten as the landing legs bend -> legs straighten as he stands) — never both stiff, never both giving at once.

// A BODY TIPPING OVER LEADS WITH ITS WEIGHT (Arthur, cartwheel: "his legs need to start going in that direction —
// leaning over there because he's falling that way"): once the body tips past its support toward where it will land,
// the free legs swing toward that side (the landing leg reaches out for its spot early, the other follows) instead of
// trailing stiffly. Front view: `toward` = the figure's side it is falling to; that hip opens, the other closes.
export const FALL_LEAD = 15;
export function leadTheFall(pose: PoseAngles, toward: "l" | "r", amount = FALL_LEAD): PoseAngles {
  const away = toward === "l" ? "r" : "l";
  return { ...pose, [`${toward}Hip`]: pose[`${toward}Hip`] + amount, [`${away}Hip`]: Math.max(0, pose[`${away}Hip`] - amount) };
}
export function stackedBend(over: number, impact = 0): number {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return Math.round(Math.min(66, 44 + 22 * c(over) + 10 * c(impact)));
}

// A BEND THAT CARRIES WEIGHT MUST BE SEEN (Arthur, cartwheel: "I should genuinely see a bend in the arms"): a weight-
// bearing elbow bent next to the head is hidden by the head circle at stick-figure size. So the arm that carries the
// weight (its hand on the floor) bends by `bend` (the natural way only) and turns at the shoulder just enough that its
// elbow sits OUT, at least ELBOW_SEEN figure heights from the head's centre (in a front view: out to the side, away
// from the middle line — the planted hands land a little wider than the shoulders, so the bent arm makes a clear
// angle). The hand still reaches past the top of the head; given the body's `spin` (the whole-body turn, degrees) the
// head stays at least HEAD_CLEAR figure heights above the lowest point and the elbow never dips to the floor. If the
// bend would not let it, the bend is limited there (a light body gives, but the head never comes to the floor).
export const ELBOW_SEEN = 0.125;
export const HEAD_CLEAR = 0.05;
export function seenWeightArm(pose: PoseAngles, side: "l" | "r", bend: number, facing: Facing, spin?: number): PoseAngles {
  const S = `${side}Shoulder` as const, E = `${side}Elbow` as const;
  for (let elbow = Math.max(pose[E], bend); elbow >= pose[E]; elbow -= 2) {
    const found = seenAt(pose, S, E, side, elbow, facing, spin);
    if (found) return found;
  }
  return pose;
}
function seenAt(pose: PoseAngles, S: "lShoulder" | "rShoulder", E: "lElbow" | "rElbow", side: "l" | "r", elbow: number, facing: Facing, spin?: number): PoseAngles | null {
  const check = (s: number) => {
    const q = { ...pose, [S]: s, [E]: elbow };
    let seen = Infinity, clear = true;
    for (const neck of [false, true]) {
      const b = forwardKinematics(q, facing, { x: 0, y: 0 }, 1, "normal", neck);
      const el = b[`${side}Elbow`], hand = b[`${side}Hand`];
      seen = Math.min(seen, Math.hypot(el.x - b.head.x, el.y - b.head.y));
      const ux = b.head.x - b.neck.x, uy = b.head.y - b.neck.y, n = Math.hypot(ux, uy) || 1;
      if (((hand.x - b.neck.x) * ux + (hand.y - b.neck.y) * uy) / n < n + HEAD_RADIUS.normal + 0.005) clear = false;
      if (spin !== undefined) {
        // (Turned as the engine turns the whole body, about the middle of the trunk. A long-necked figure whose head
        // is nearer the floor even with straight arms keeps at least that gap.)
        const gap = (k: typeof b) => {
          const c = Math.cos((spin * Math.PI) / 180), sn = Math.sin((spin * Math.PI) / 180), my = (k.hip.y + k.neck.y) / 2, mx = (k.hip.x + k.neck.x) / 2;
          const y = (p: { x: number; y: number }) => my + (p.x - mx) * sn + (p.y - my) * c;
          const head = y(k.head) + HEAD_RADIUS.normal, low = Math.max(y(k.lHand), y(k.rHand), y(k.lFoot), y(k.rFoot), head);
          return { head: low - head, elbow: low - y(k[`${side}Elbow`]) };
        };
        const straight = gap(forwardKinematics({ ...q, [E]: pose[E] }, facing, { x: 0, y: 0 }, 1, "normal", neck)).head;
        const g = gap(b);
        if (g.head < Math.min(HEAD_CLEAR, straight) - 1e-6 || g.elbow < 0.01) clear = false;
      }
    }
    return { q, ok: clear && seen >= ELBOW_SEEN };
  };
  for (let turn = 0; turn <= 50; turn += 1) for (const sgn of [-1, 1]) { const c = check(pose[S] + sgn * turn); if (c.ok) return c.q; }
  return null;
}

// BIG WHOLE-BODY MOVES TAKE TIME (Arthur, phase 3, cartwheel rated OK but "it must be slower"): the body has weight,
// so the WHOLE body turning over (a cartwheel, flip, roll, full spin) never snaps by. At normal speed and energy it
// turns at most WHOLE_BODY_TURN_DEG_PER_SEC on average (a full 360 takes at least 1.3 s, ~1.6 s with its speed-up
// and slow-down); fast / full of energy turns quicker, slow / tired / heavy slower. A piece that speeds up or slows
// down (an eased one) peaks faster than its average, so it gets half as much time again. Any move that turns the
// whole body times each turning key with this: the key takes max(its own time, this).
export const WHOLE_BODY_TURN_DEG_PER_SEC = 280;
export function wholeBodyTurnSeconds(degrees: number, settings: MoveSettings, ease?: Ease): number {
  const e = Math.min(1, Math.max(0, settings.energy));
  const most = (WHOLE_BODY_TURN_DEG_PER_SEC * (0.85 + 0.3 * e)) / tempoOf(settings);
  const peak = ease === undefined || ease === "linear" ? 1 : 1.5;
  return (Math.abs(degrees) * peak) / most;
}

// JOINTS MOVE AT A HUMAN SPEED (Arthur, phase 3, a custom superhero pose: "he's really fast"): limbs have weight, so
// going from one pose to the next takes time in proportion to how much the body changes — never a snap. At normal
// speed and energy the biggest single joint turns at most JOINT_DEG_PER_SEC on average and all the joints together
// change at most BODY_DEG_PER_SEC (a whole-body pose change of ~170 degrees takes ~0.6 s); fast / full of energy is
// quicker, slow / tired slower, a robot snappier (x1.3) but still readable. A move's key (and its first key, reached
// from the figure's stand) takes max(its own time, this). Strikes are timed by their own strike speed.
export const JOINT_DEG_PER_SEC = 200;
export const BODY_DEG_PER_SEC = 280;
export function jointChangeSeconds(from: PoseAngles, to: PoseAngles, settings: MoveSettings): number {
  const e = Math.min(1, Math.max(0, settings.energy));
  const robot = RAMP_SCALE[settings.style] === 0 ? 1.3 : 1;
  const k = (robot * (0.85 + 0.3 * e)) / tempoOf(settings);
  const d = (Object.keys(STAND) as PoseKey[]).map((j) => Math.abs((to[j] ?? 0) - (from[j] ?? 0)));
  return Math.max(Math.max(...d) / (JOINT_DEG_PER_SEC * k), d.reduce((a, b) => a + b, 0) / (BODY_DEG_PER_SEC * k));
}

// How big a move is (x the natural size): energy makes wind-ups deeper and actions bigger.
export const amplitudeOf = (settings: MoveSettings) => 0.6 + 0.8 * Math.min(1, Math.max(0, settings.energy));

// Seconds for one beat.
export function beatSeconds(kind: BeatKind, seconds: number, settings: MoveSettings) {
  const e = Math.min(1, Math.max(0, settings.energy));
  const tempo = tempoOf(settings);
  const ramp = RAMP_SCALE[settings.style];
  if (ramp === 0 && (kind === "anticipation" || kind === "follow")) return 0; // a robot has no wind-up or follow-through
  // Tired / heavy / hurt bodies wind up and recover more slowly; the action itself stays quick-ish.
  const slow = ramp > 0 ? Math.sqrt(ramp) : 1;
  switch (kind) {
    case "action": return seconds * tempo * (1.3 - 0.6 * e);
    case "anticipation": return seconds * tempo * slow * (0.85 + 0.3 * e);
    case "follow": return seconds * tempo * slow;
    default: return seconds * tempo * slow;
  }
}

const KIND_EASE: Record<BeatKind, Ease> = { anticipation: "smooth", action: "in", follow: "out", settle: "smooth", hold: "smooth" };

// Blend two poses (k = 0 -> a, 1 -> b).
export const lerpPose = (a: PoseAngles, b: PoseAngles, k: number): PoseAngles => {
  const out = { ...a };
  for (const key of Object.keys(a) as PoseKey[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
};

// A pose made bigger or smaller around the rest pose (energy).
export const scaleFromRest = (pose: PoseAngles, k: number, rest: PoseAngles = STAND) => lerpPose(rest, pose, k);

// Turn a list of beats into key poses that start exactly at `start` and end standing.
export function beatsToKeys(start: Stance, beats: Beat[], settings: MoveSettings): MoveOutput {
  const robot = RAMP_SCALE[settings.style] === 0;
  let t = start.t, x = start.x, facing = start.facing;
  const marks: Record<string, number> = {};
  const keys: CharacterKey[] = [{ t, x, pose: start.pose, contacts: BOTH_FEET, facing, lift: 0 }];
  let flow: MoveOutput["flow"];
  for (const beat of beats) {
    const seconds = beatSeconds(beat.kind, beat.seconds, settings);
    if (seconds <= 1e-6) continue;
    if (beat.recover && !flow) {
      const here = keys[keys.length - 1];
      flow = { keys: keys.length, stance: { t: here.t, x: here.x, facing, pose: here.pose } };
    }
    const previous = keys[keys.length - 1];
    // The way the angles, travel and height change on the way INTO this beat's pose.
    previous.ease = robot ? "linear" : beat.ease ?? KIND_EASE[beat.kind];
    previous.xEase = robot ? "linear" : beat.xEase ?? previous.ease;
    previous.liftEase = robot ? "linear" : beat.liftEase ?? previous.ease;
    t += seconds;
    x += (beat.dx ?? 0) * forwardSign(facing);
    facing = beat.facing ?? facing;
    // Every pose stays inside the body's bend limits, whoever wrote it (a library move, breathing added
    // on top of a pose, or a new move the AI invents).
    // ELBOW CONTINUITY: the bend keeps going the way it was going (across, not back around).
    keys.push({ t, x, pose: continueElbows(previous.pose, clampPose(beat.pose).pose), lift: beat.lift ?? 0, contacts: beat.contacts ?? BOTH_FEET, facing });
    if (beat.name) marks[beat.name] = t;
  }
  const last = keys[keys.length - 1];
  return { keys, end: { t: last.t, x: last.x, facing, pose: last.pose }, marks, flow };
}

// ELBOW CONTINUITY (rig.ts HAND UP, ELBOW FREE): a held-up arm's elbow bend may pass through 180, so
// one look has two values (b and b - 360). When the next key's elbow is more than half a turn from this
// one's, it takes the other value — if the body allows it there — so the forearm keeps turning the way
// it was going (across the upper arm) instead of swinging all the way back round through straight.
export function continueElbows(previous: PoseAngles, pose: PoseAngles): PoseAngles {
  let out = pose;
  for (const key of ["lElbow", "rElbow"] as const) {
    const jump = out[key] - previous[key];
    if (Math.abs(jump) <= 180) continue;
    const probe = { ...out, [key]: out[key] - 360 * Math.sign(jump) };
    const [lo, hi] = jointRange(probe, key);
    // (Past ELBOW_ACROSS_AUTO only when the bend is already out there: a move took it there on purpose.)
    const top = Math.min(hi, Math.max(ELBOW_ACROSS_AUTO, previous[key]));
    if (probe[key] >= lo - 1e-9 && probe[key] <= top + 1e-9) out = probe;
  }
  return out;
}

// ANTICIPATION RULE (Arthur, 2026-10-04): a wind-up goes the OPPOSITE way from the action. Given where
// the body is (`from`) and where the action is going (`action`), the wind-up pulls every joint the
// other way by `k` x the action's own change (arms back before a punch or throw, the leg back before a
// kick, the arm back behind the head before a high-five), the torso leans against the action, and
// everything stays inside the body's bend limits. This is how the engine (and later the AI's own new
// moves) get a natural wind-up without anyone drawing it.
export function windUp(from: PoseAngles, action: PoseAngles, k = 0.45, options: { lean?: number; only?: PoseKey[] } = {}): PoseAngles {
  const out = { ...from };
  for (const key of (options.only ?? (Object.keys(from) as PoseKey[]))) {
    if (key === "lean" || key === "head") continue;
    out[key] = limit(key, from[key] - k * (action[key] - from[key]));
  }
  // The body leans away from where the action goes (a forward action -> lean back first).
  const forward = action.lean - from.lean;
  out.lean = limit("lean", from.lean - (options.lean ?? 0.6) * Math.max(Math.abs(forward), 8) * Math.sign(forward || 1));
  out.head = limit("head", from.head - 0.3 * (out.lean - from.lean));
  return out;
}

const limit = (key: PoseKey, value: number) => {
  const range = (JOINT_LIMITS as Record<string, readonly [number, number]>)[key];
  return range ? Math.min(range[1], Math.max(range[0], value)) : value;
};
