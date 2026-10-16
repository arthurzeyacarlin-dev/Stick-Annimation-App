import type { CharacterKey, FootContact } from "../engine.ts";
import type { Ease } from "../easing.ts";
import { clampPose, STAND, withPose, type PoseAngles } from "../rig.ts";
import { forwardSign, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { armReach, feetOf, plantedLegs, stepPose, unitBody, type Feet, type Side } from "./punch.ts";
import { individuality, NEUTRAL } from "./individual.ts";

// PULLING LOOKS STRONG (Arthur, Oct 14, the tug-of-war he failed: "their feet need to be planted… otherwise there's no strength.
// Their arms need to be shaking a little, just a hair. Their arms need to be holding it. Their knees need to be bent a little for
// stance. And they need to be pulling — they lean back a little, they pull a little with their arms, bend it. The rope should move
// a little."). ANY pull — tug of war, hauling a rope, a sled, a cart, a stuck door, a bell rope — is this one move:
// - a WIDE PLANTED STANCE (front foot toward what is pulled, back foot behind), knees bent, hips low;
// - BOTH HANDS on the rope in front, one just behind the other at the same height (`hands`: chest / waist / low), so a rope from
//   either hand passes through the other;
// - HEAVES on a beat: lean back + the arms bend in (quick, strong), STRAIN (the arms tremble a hair, ~1.5% of the height, fast),
//   then a small GIVE (lean comes up a little, arms longer);
// - `role` "win": after each heave the feet step back (the winner gains ground); "lose": dragged a step toward the pull on each
//   of the other side's heaves, then digs in again; "even" (default): feet stay planted.
// Timing is ABSOLUTE (one heave a `period`, never stretched by energy or style), so two pullers on the same rope who start at
// the same time heave and stumble on the same beat.

export type PullParams = { role?: "win" | "lose" | "even"; heaves?: number; seconds?: number; strength?: number; hands?: "chest" | "waist" | "low"; step?: number; period?: number; startsInPose?: boolean; slope?: number; fall?: boolean; final?: boolean; vary?: number };
export const PULL_ABOUT = "PULL with both hands (tug of war, rope, sled, cart, stuck door; never custom keys): wide planted stance, knees bent, hands together on the rope, HEAVES (lean back, arms bend), strains (tiny tremble), gives a little; one heave a second, so pullers heave together. `heaves` (3) or `seconds`; `role` even/win (steps back)/lose (dragged forward); `strength` 0..1; `hands` chest/waist/low; `step` (0.12); `fall`: true (role lose) = yanked off balance and FALLS forward at the end (a fall move follows); `final`: true (role win) = one huge last heave that throws the winner back a step. Rope = prop with \"string\" from rHand to the other end. Marks `heave1`.., `last`.";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// HANDS IN FRONT, ON THE ROPE (Arthur, Oct 14, the farmer: "the arm is supposed to be in FRONT, bending, extending a little for
// pulling. No arms going behind the stick figure when pulling"; the tug of war: "the stick figures are not really holding the
// rope"): the front hand sits out from the shoulder at an angle below level (`hands`), always at least 0.1 x height in front of
// the torso at that height (a too-low reach is raised until it is); a low rope leans back less and sinks the hips instead.
// The other hand sits just behind it ON THE ROPE'S LINE (`slope`: degrees the rope goes down toward its other end), so the rope
// runs through both fists. The elbows bend on a heave and straighten a little on the give.
const HAND_ANGLE = { chest: 14, waist: 26, low: 40 } as const;
const HAND_GAP = 0.075; // x height between the two fists on the rope
export const PULL_STANCE: Feet = { l: 0.16, r: -0.2 }; // x height from the hips at the start (front foot l, back foot r)
const HIP_SHARE = 0.42; // the hips sit a little nearer the back foot
export const TREMBLE_SECONDS = 0.07;

type Shape = { lean: number; reach: number; drop: number; shift: number };

export function pull(start: Stance, params: PullParams, settings: MoveSettings): MoveOutput {
  const H = settings.height, sign = forwardSign(start.facing);
  // NOBODY PULLS IN PERFECT SYNC (individual.ts, Arthur Oct 14): `vary` (the figure's place in the scene, set by the planner) gives
  // this puller its own strength, its own heave moment (a winner or an even puller heaves 0.04–0.12 s later, a little different
  // every heave — never a metronome) and its own tremble rhythm. The ROPE'S BEAT (`period`) stays shared, and a loser's yank stays
  // exactly on the beat of the other side's heave: they still interact, but are never mirror copies.
  const me = individuality(Math.max(0, Math.round(Number(params.vary ?? 0))));
  const s = clamp(Number(params.strength ?? 0.5 + 0.5 * settings.energy) * me.amp, 0, 1);
  const trembleS = TREMBLE_SECONDS * (1 + 0.3 * me.phase), trembleSign = me.phase > 0.5 ? -1 : 1;
  const heaveLate = (h: number) => (me === NEUTRAL ? 0 : (0.04 + 0.08 * me.phase) * (0.6 + 0.8 * ((me.phase + h * 0.618034) % 1)));
  const period = clamp(Number(params.period ?? 1), 0.7, 1.6);
  const heaves = clamp(Math.round(Number(params.heaves ?? (params.seconds ? Number(params.seconds) / period : 3))), 1, 12);
  const role = params.role === "win" || params.role === "lose" ? params.role : "even";
  const d = clamp(Number(params.step ?? 0.12), 0, 0.25);
  // (95% TOGETHER, 5% THEIR OWN, Oct 15: two pullers on one rope also pull their OWN WAY — not just a hair later: each other
  // puller picks its own grip (chest / low) and leans into the heave its own amount, so the heave SHAPES differ, never only the timing.)
  const vary = Math.max(0, Math.round(Number(params.vary ?? 0)));
  const ownGrip = me === NEUTRAL || params.hands !== undefined ? params.hands : (["waist", "chest", "low"] as const)[vary % 3];
  const handsAt = ownGrip === "chest" || ownGrip === "low" ? ownGrip : "waist";
  const ownLean = me === NEUTRAL ? 1 : 0.82 + 0.36 * me.phase;
  const leanK = handsAt === "low" ? 0.7 : 1, lowDrop = handsAt === "low" ? 0.03 : 0;
  const slope = (clamp(Number(params.slope ?? (handsAt === "low" ? 12 : 0)), -35, 45) * Math.PI) / 180;
  const fallsAtEnd = role === "lose" && params.fall === true, finalHeave = role === "win" && params.final === true;
  const BRACE: Shape = { lean: -(14 + 10 * s), reach: 0.28, drop: 0.065, shift: 0 };
  const HEAVE: Shape = { lean: -(24 + 14 * s) * ownLean, reach: 0.22, drop: 0.085, shift: -0.03 };
  const GIVE: Shape = { lean: -(9 + 5 * s), reach: 0.29, drop: 0.055, shift: 0.02 };
  const YANKED: Shape = { lean: -6, reach: 0.3, drop: 0.05, shift: 0.05 };
  // THE LOSERS FALL (Arthur, Oct 14: "animate them pulling so hard that purple and blue FALL DOWN as they're getting pulled"): the
  // winners' last heave is huge (`final`), the loser is yanked off balance — pitched forward, arms pulled straight out — and
  // stumbles a big step; the fall move after it (pullPlan adds one) takes them to the ground, still holding the rope.
  const PITCHED: Shape = { lean: 24, reach: 0.3, drop: 0.07, shift: 0.1 };
  const HUGE: Shape = { lean: -(34 + 8 * s), reach: 0.2, drop: 0.1, shift: -0.06 };

  // The pose for a shape with the feet at `feet` (x height from the start hips), `trem` = the tremble (-1..1).
  const poseFor = (sh: Shape, feet: Feet, trem = 0): { pose: PoseAngles; at: number } => {
    const at = feet.r + HIP_SHARE * (feet.l - feet.r) + sh.shift;
    const lean = (sh.lean < 0 ? sh.lean * leanK : sh.lean) + 0.6 * trem;
    const drop = sh.drop + (sh.lean < 0 ? lowDrop : 0);
    const legs = plantedLegs(withPose(STAND, { lean, head: clamp(-lean * 0.6 + 4, -30, 30) }), feet, at, drop);
    const body = unitBody(legs); // facing right, hips at x 0, feet on y 0 (+y down)
    const torsoX = (y: number) => body.hip.x + clamp((y - body.hip.y) / (body.neck.y - body.hip.y || 1), 0, 1) * (body.neck.x - body.hip.x);
    let phi = HAND_ANGLE[handsAt], hx = 0, hy = 0;
    for (let i = 0; i < 20; i += 1) { // (raise the reach until the fist is well in front of the body — never beside or behind it)
      hx = sh.reach * Math.cos((phi * Math.PI) / 180); hy = sh.reach * Math.sin((phi * Math.PI) / 180);
      if (body.neck.x + hx - HAND_GAP * Math.cos(slope) >= torsoX(body.neck.y + hy) + 0.07 || phi <= -2) break; // (the BACK fist too)
      phi -= 4;
    }
    const front = armReach(lean, { x: hx, y: hy }), back = armReach(lean, { x: hx - HAND_GAP * Math.cos(slope), y: hy - HAND_GAP * Math.sin(slope) });
    // THE STRAIN TREMBLE: the shoulders and elbows shake a hair (the hands move ~1.5% of the height).
    const pose = clampPose({ ...legs, lShoulder: front.shoulder + 2.5 * trem, lElbow: front.elbow - 4 * trem, rShoulder: back.shoulder - 2.5 * trem, rElbow: back.elbow + 4 * trem }).pose;
    return { pose, at };
  };

  const keys: CharacterKey[] = [];
  const marks: Record<string, number> = {};
  const push = (t: number, pose: PoseAngles, at: number, contacts: FootContact[] = ["lFoot", "rFoot"], ease: Ease = "smooth") => {
    const prev = keys[keys.length - 1];
    if (prev) { prev.ease = ease; prev.xEase = ease; prev.liftEase = ease; if (t <= prev.t + 1e-3) t = prev.t + 1e-3; }
    keys.push({ t, x: start.x + sign * at * H, pose, contacts, facing: start.facing, lift: 0 });
  };
  const step = (t0: number, t1: number, sh: Shape, from: Feet, to: Feet, side: Side) => {
    const mid = poseFor(sh, { l: (from.l + to.l) / 2, r: (from.r + to.r) / 2 });
    const planted: FootContact = side === "l" ? "rFoot" : "lFoot";
    const air = stepPose(mid.pose, from, to, mid.at, sh.drop, side, 0.04);
    push((t0 + t1) / 2, clampPose(air).pose, mid.at, [planted], "out");
    const end = poseFor(sh, to);
    push(t1, end.pose, end.at, ["lFoot", "rFoot"], "in");
  };

  // Into the stance: already in it when the scene opens with the pull; otherwise the back foot steps back into it.
  const own = feetOf(start.pose);
  let feet: Feet = own.l - own.r >= 0.3 ? own : { l: own.l, r: own.l - (PULL_STANCE.l - PULL_STANCE.r) };
  let t = start.t;
  const opens = params.startsInPose ?? start.t <= 0.05;
  if (opens) {
    if (own.l - own.r < 0.3) feet = PULL_STANCE;
    const b = poseFor(BRACE, feet);
    push(t, b.pose, b.at);
  } else {
    push(t, start.pose, 0);
    if (own.l - own.r < 0.3) { step(t, t + 0.4, BRACE, own, feet, "r"); t += 0.4; }
    else { const b = poseFor(BRACE, feet); t += 0.3; push(t, b.pose, b.at); }
  }

  const tremble = (from: number, to: number, sh: Shape, f: Feet) => {
    let k = 0;
    for (let u = from + trembleS; u < to - 0.02; u += trembleS, k += 1) { const p = poseFor(sh, f, (k % 2 ? -1 : 1) * trembleSign); push(u, p.pose, p.at, undefined, "linear"); }
    const p = poseFor(sh, f); push(to, p.pose, p.at, undefined, "linear");
  };

  for (let h = 1; h <= heaves; h += 1) {
    const P = period, t0 = t;
    if (fallsAtEnd && h === heaves) {
      // Yanked off balance: snapped upright, then pitched forward with a big stumbling step — the fall comes next.
      const y = poseFor(YANKED, feet); push(t0 + 0.2 * P, y.pose, y.at, undefined, "in");
      marks[`heave${h}`] = t0 + 0.26 * P;
      // (a REAL stumble — every foot that moves lifts, moves and lands; none slides: the front foot lurches forward, then the back
      // foot catches up under the body, so the fall starts from an ordinary narrow stance, never dragging a far-back foot)
      const a: Feet = { l: feet.l + 2.2 * d, r: feet.r }, b: Feet = { l: a.l, r: a.l - 0.12 };
      step(t0 + 0.2 * P, t0 + 0.42 * P, PITCHED, feet, a, "l");
      step(t0 + 0.42 * P, t0 + 0.64 * P, PITCHED, a, b, "r");
      feet = b; t = t0 + 0.64 * P;
      break;
    }
    if (finalHeave && h === heaves) {
      // The huge last heave: everything into it, and the winner is thrown back a big step when the other side gives.
      const hv = poseFor(HUGE, feet); push(t0 + 0.26 * P, hv.pose, hv.at, undefined, "out");
      marks[`heave${h}`] = t0 + 0.26 * P;
      const a: Feet = { l: feet.l, r: feet.r - 2 * d }, b: Feet = { l: feet.l - 1.6 * d, r: feet.r - 2 * d };
      step(t0 + 0.32 * P, t0 + 0.56 * P, HUGE, feet, a, "r");
      step(t0 + 0.56 * P, t0 + 0.8 * P, BRACE, a, b, "l");
      feet = b; t = t0 + 0.8 * P;
      break;
    }
    if (role === "lose") {
      // Yanked by the other side's heave: comes up, arms pulled straight, then a stumbling step forward (front foot, back foot),
      // then digs in again and strains against it.
      const y = poseFor(YANKED, feet); push(t0 + 0.26 * P, y.pose, y.at, undefined, "smooth");
      marks[`heave${h}`] = t0 + 0.26 * P;
      const a: Feet = { l: feet.l + d, r: feet.r }, b: Feet = { l: feet.l + d, r: feet.r + d };
      step(t0 + 0.26 * P, t0 + 0.44 * P, YANKED, feet, a, "l");
      step(t0 + 0.44 * P, t0 + 0.62 * P, BRACE, a, b, "r");
      feet = b;
      const hv = poseFor(BRACE, feet); push(t0 + 0.74 * P, hv.pose, hv.at, undefined, "out");
      tremble(t0 + 0.74 * P, t0 + P, BRACE, feet);
    } else {
      // THE HEAVE: quick and strong (eases out), lean back, arms bend in, hips sink back.
      const late = heaveLate(h);
      const hv = poseFor(HEAVE, feet); push(t0 + 0.28 * P + late, hv.pose, hv.at, undefined, "out");
      marks[`heave${h}`] = t0 + 0.28 * P + late;
      tremble(t0 + 0.28 * P + late, t0 + 0.56 * P, HEAVE, feet);
      if (role === "win") {
        // Gains ground: the back foot steps back, then the front foot.
        const a: Feet = { l: feet.l, r: feet.r - d }, b: Feet = { l: feet.l - d, r: feet.r - d };
        step(t0 + 0.56 * P, t0 + 0.78 * P, HEAVE, feet, a, "r");
        step(t0 + 0.78 * P, t0 + P, BRACE, a, b, "l");
        feet = b;
      } else {
        const g = poseFor(GIVE, feet); push(t0 + P, g.pose, g.at, undefined, "smooth");
      }
    }
    t = t0 + P;
  }
  // Braced, still holding on (the FLOW point: a move straight after — a celebration, a fall — starts from here). With nothing
  // after it, the strain lets go: the body comes up out of the lean into a relaxed wide stance, still holding the rope (never
  // frozen in a strain while the scene goes on).
  if (fallsAtEnd) { // (no recovery: the fall starts right from the pitched, stumbling pose)
    const lastKey = keys[keys.length - 1];
    marks.last = lastKey.t;
    return { keys, end: { t: lastKey.t, x: lastKey.x, facing: start.facing, pose: lastKey.pose }, marks, flow: { keys: keys.length, stance: { t: lastKey.t, x: lastKey.x, facing: start.facing, pose: lastKey.pose } } };
  }
  // (each puller lets go at its own pace: a little later and slower — never two figures relaxing as copies)
  const settle = 0.3 + 0.5 * me.lag, relax = (1 + me.lag) * me.tempo;
  const end = poseFor(BRACE, feet); push(t + settle, end.pose, end.at);
  marks.last = t + settle;
  const flow = { keys: keys.length, stance: { t: t + settle, x: keys[keys.length - 1].x, facing: start.facing, pose: end.pose } };
  const easy = poseFor({ lean: -3 * me.amp, reach: 0.3, drop: 0.03, shift: 0.02 }, feet); push(t + relax, easy.pose, easy.at);
  const last = keys[keys.length - 1];
  return { keys, end: { t: last.t, x: last.x, facing: start.facing, pose: last.pose }, marks, flow };
}
