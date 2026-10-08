import type { CharacterKey, FootContact } from "../engine.ts";
import { monotoneTangents, sampleChannel } from "../easing.ts";
import { solveTwoBone } from "../ik.ts";
import { forwardKinematics } from "../pose.ts";
import { boneLengths, STAND, type PoseAngles, type Point } from "../rig.ts";
import { RAMP_SCALE, STYLE_CHANGES, tune, type GaitTuning, type MoveSpeed, type MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2: walk and run, built from where the feet are planted.
// The hips travel smoothly; each standing foot stays exactly where it landed; the swinging foot
// follows a natural arc; leg angles come from those foot positions, so nothing slides or pops.
// The engine then adds the in-betweens and checks every body rule.

export type GaitKind = "walk" | "jog" | "run";
export type GaitOptions = {
  kind: GaitKind; startX: number; distance: number; direction: 1 | -1; height: number;
  startT?: number; speed?: MoveSpeed; style?: MoveStyle; energy?: number;
  // ARRIVE INTO IT: the next move goes down (pick something up, squat, sit): stop still leaning in,
  // without straightening up first.
  keepLean?: boolean;
  // TIPTOE (Phase 3): the walk on tiptoe (TIPTOE below).
  tiptoe?: boolean;
};
export type GaitResult = { keys: CharacterKey[]; endT: number; endX: number };

const WALK_BASE: GaitTuning = { stepLength: 0.3, stepSeconds: 0.5, clearance: 0.07, reach: 0.995, dip: 0.025, lean: 4, head: -2, armSwing: 24, elbowBase: 14, elbowSwing: 18, armForward: 0, hold: 0, linear: false };
// Run recipe: a long stride with the legs split wide in the air, a whole-body forward lean, a clear
// moment in the air every step, a leg that folds under the body and then opens into a long reach
// (not a march), and loose arms swinging far forward and back: the elbow bends as the arm comes
// forward and opens out as it goes back (never locked at 90 degrees).
// (Arthur, round 6: "too fast, my eyes can't even see it running"; new projects play at 12 frames a
// second, so a step lasts about 5-6 pictures: contact, push-off, airborne, passing...)
const RUN_BASE: GaitTuning = { stepLength: 1.1, stepSeconds: 0.5, clearance: 0.25, reach: 0.99, dip: 0.02, lean: 25, head: -16, armSwing: 72, elbowBase: 42, elbowSwing: 18, armForward: 0, hold: 0, linear: false };
// (Arthur, round 6: "the legs are a little too wide": the back foot lifts a little sooner, so the legs
// never split far apart; with the shorter steps the widest split is about 20% narrower.)
const WALK_DOUBLE_SUPPORT = 0.14; // share of a step with both feet down
// EVERY WALK LIFTS ITS FEET (Arthur, round 11, the sad walk: "he's dragging his foot behind ... it doesn't
// look like a walk"). Whatever the mood (sad, tired, hurt, robot, low energy), a walking foot leaves the
// floor going UP first (it lifts before it swings forward) and clearly clears the floor: the cruise lift
// is never under WALK_MIN_CLEARANCE and no swing, not even the first or the closing one, lifts under
// WALK_MIN_LIFT (both x height). A mood shows in the posture, the pace and the step length, never by
// sliding the foot along the floor. (The natural walk lifts more than both, so it doesn't change.)
const WALK_MIN_CLEARANCE = 0.055;
const WALK_MIN_LIFT = 0.04;
// WALK, JOG, RUN (Arthur, round 8: "there's only two speeds, walk and run; why shouldn't there be an
// in-between?"). A JOG is about twice walking speed and NEVER airborne: one foot is always down (a short
// moment with both down as the next foot lands), knees soft, the body bouncing a little on each landing,
// arms bent near 90 degrees pumping small. A RUN is the "end of the world, I need to get there" speed:
// a clear moment in the air every step, both feet off the ground (see AIRBORNE below).
// (Round 10, Arthur jogged in his room: "jogging, you're actually airborne a little ... no flight looks like walking".)
// A jog has a SHORT, LOW moment in the air every step (well under half a second; the feet just clear the floor),
// with the foot down for most of the step: short quick steps, soft knees, a small bounce, arms bent near 90 degrees.
const JOG_BASE: GaitTuning = { stepLength: 0.42, stepSeconds: 0.34, clearance: 0.12, reach: 0.97, dip: 0.035, lean: 8, head: -6, armSwing: 40, elbowBase: 80, elbowSwing: 12, armForward: 0, hold: 0, linear: false };
const JOG_STANCE = 0.62; // share of a step with the foot down (the rest is the short hop)
const JOG_AHEAD = 0.13; // the jogging foot lands this far in front of the hips, x height
const JOG_BEHIND = 0.15; // and pushes off once the hips have passed it by this much
const JOG_FLIGHT_PEAK = 0.012; // how high the body floats in the hop, x height (just off the floor)
const JOG_MIN_STEP_SECONDS = 0.28;
// The hips of a jog stay at least this high (x the legs' reach) over the ground a foot covers: a faster or
// livelier jog takes quicker steps, never longer ones that would sink it into a crouch.
const JOG_LOWEST_HIPS = 0.9;
const JOG_LEG_SWING = { thigh: 0.45, knee: 0.55 }; // the jog's knee lift and heel kick, x the run's
const RUN_STANCE = 0.32; // share of a step with the foot on the ground (the rest is airborne)
// (Round 7: "the legs, same as the arms: equal space in front and behind" — the foot reaches further
// ahead to land and pushes off a little less far behind.)
const RUN_AHEAD = 0.25; // how far in front of the hips the foot lands, x height
// The foot pushes off once the hips have passed it by this much (x height). Like a real runner the
// ground contact covers about the same length at any speed, so a slow first step stays down longer.
const RUN_BEHIND = 0.25;

// Running swing leg as smooth phase curves (u: 0 = push-off, 1 = landing), shaped on average human
// running: the thigh keeps going back a moment after push-off, swings through under the body and
// peaks about 45 degrees forward late in the swing, then pulls back a little to land; the knee folds
// to about 90 degrees as the leg passes under the body, then opens out into a long reach before the
// landing. Each curve = straight blend from the push-off angle to the landing angle + a few sine
// waves (which are zero at both ends, so the leg leaves and lands exactly on the planted poses).
// AIRBORNE (Arthur, round 8, with a drawing: "it's never truly airborne, it's almost like marching").
// In the air both feet are clearly off the ground: the back foot has just left its spot and the front foot
// hasn't landed yet. (The legs don't switch in the air: the leg in front at the push-off lands in front;
// legs and arms pass each other only while a foot is on the ground.) The back leg's heel kicks up behind right after the
// push-off (the knee folds early, not only as it passes under the body), and the front leg's knee is
// driven up high, the thigh nearly level, the shin hanging under it, before it reaches down to land.
// (Was: the knee folded most only while passing under the body and the thigh peaked late at about 45
// degrees, so in the air both feet trailed low in a long scissor: a march.) Shapes = how far the swing
// leg is from a straight blend between its push-off and landing angles (zero at both ends), by phase
// u (0 = push-off, 1 = landing; the body is in the air for about u < 0.4 and u > 0.6).
const SWING_THIGH_SHAPE: [number, number][] = [[0, 0], [0.15, -2], [0.35, 8], [0.55, 45], [0.7, 63], [0.85, 36], [1, 0]];
const SWING_KNEE_SHAPE: [number, number][] = [[0, 0], [0.15, 56], [0.35, 107], [0.55, 103], [0.7, 83], [0.85, 44], [1, 0]];
// The first step from standing: the knee lifts and drives forward (no kick back).
const DRIVE_THIGH_WAVES = [36, 8];
const DRIVE_KNEE_WAVES = [50, 18];
// Arms: a smooth back-and-forth over the stride, each arm with the opposite leg; most forward just
// before that leg lands.
const ARM_PEAK_PHASE = 0.84;
// ARM SWING RULE (Arthur, 2026-10-04 round 4): the arms swing to balance the legs (their weight helps
// the body along), so whenever the legs step, the arms swing and PASS each other, every step, from the
// first step to the last. Getting going, the swings start small and grow bigger each step; stopping,
// they shrink each step until the figure stands. Their speed always follows the steps (slow steps,
// slow swings). Size of the swing (x the cruise swing) on the first / last step, and over how many
// steps it grows / shrinks (a slower ramp style adds the same extra steps as its speed-up).
// (A run pushes off hard: its arms start bigger and reach full swing by the second step.)
const ARM_FIRST: Record<GaitKind, number> = { walk: 0.38, jog: 0.45, run: 0.5 };
const ARM_LAST = 0.35;
const ARM_GROW_STEPS: Record<GaitKind, number> = { walk: 2, jog: 2, run: 2 };
const ARM_SHRINK_STEPS: Record<GaitKind, number> = { walk: 2, jog: 2, run: 2 };

const RUN_MIN_STEP_SECONDS = 0.34; // the quickest a running step may be (see SEEN, NOT A BLUR)
const RUN_FLIGHT_PEAK = 0.05; // how high the body floats in each flight, x height
const BASES: Record<GaitKind, GaitTuning> = { walk: WALK_BASE, jog: JOG_BASE, run: RUN_BASE };

// ---- Tempo ramp: speed up quickly, cruise, slow down quickly, stand ----
// (Arthur, 2026-10-04: "teaching the engine multiplication and division".) A person does not freeze in
// a ready pose: they just start with a small, slow step (small arm and leg swings) and reach full
// speed in a bit under a second; stopping takes a bit under a second too (see RAMP_SCALE for tired, hurt, robot). Every step has a speed
// factor f (1 = the cruise recipe above, untouched). Like real walkers and runners, both the step
// LENGTH and the step RATE grow with speed: length x f^STRIDE_SHARE, duration x f^(STRIDE_SHARE-1),
// so length / duration = f x cruise speed. The swing sizes (arm swing, knee fold, foot lift, bounce,
// flight) grow with the step's "size", which is 0 when nearly still and 1 at cruise.
const STRIDE_SHARE = 0.9;
const SIZE_FLOOR = 0.15; // speed factor at which the swings would be zero
const LEG_SWING_MIN = 0.6; // the legs still fold and lift this much (x cruise) at the smallest size
const RUN_CONTACT_SHARE = 0.25; // a slower run keeps the foot down over a slightly shorter patch
const RUN_PUSH_SHARE = 0.6; // while speeding up the foot lands closer under the body and pushes off sooner
const RUN_FIRST_SHARE = 0.7; // share of a step the hips cover while the first foot swings (from standing)
const RUN_STOP_SHARE = 0.35; // and this much of the last step while the runner stops
const RUN_STOP_LAND = 0.42; // the stopping foot lands this far (x the last step) after the last running landing
const CROUCH_SECONDS = 1.5; // lead-in time per unit of knee bend in the style's stance (sneaky: about 0.25 s)
const KNEE_CLEARANCE = 0.02; // a knee stays at least this far (x height) above the floor
const RUN_CROUCH_SHARE = 0.6; // a crouched run keeps its hips a little higher than a crouched walk
const MIN_STOP_STEP = 0.15; // seconds: a foot needs at least this long to step (even out of a fast sprint)

type Ramp = {
  settle: number; hold: number; // seconds: lean in and shift the weight before the first foot lifts, then a still moment
  setLean: number; setCrouch: number; setShift: number; setElbow: number; // extra lean (deg), hips lower (x H), hips forward (x H), extra elbow bend (deg)
  accelSteps: number; decelSteps: number; startSpeed: number; endSpeed: number; // speed-up / slow-down lengths (steps) and first / last speed factors
  accelLean: number; // extra lean while speeding up (deg, at the smallest size)
  uprightOnStop: number; // share of the cruise lean given up while slowing down
  stopLean: number; // lean at the stopping landing (deg; negative = a slight backward brake)
  stopSeconds: number; // the closing step(s), x the last step's duration
  settleSeconds: number; // from the last landing into the plain stand
};
const RAMPS: Record<GaitKind, Ramp> = {
  run: { settle: 0.06, hold: 0, setLean: 0, setCrouch: 0.012, setShift: 0.012, setElbow: 0, accelSteps: 1.2, decelSteps: 0, startSpeed: 0.6, endSpeed: 0.6, accelLean: 10, uprightOnStop: 0.8, stopLean: -3, stopSeconds: 0.3, settleSeconds: 0.15 },
  walk: { settle: 0.05, hold: 0, setLean: 0, setCrouch: 0.003, setShift: 0.008, setElbow: 0, accelSteps: 1, decelSteps: 0, startSpeed: 0.85, endSpeed: 0.62, accelLean: 1.5, uprightOnStop: 0.5, stopLean: 0, stopSeconds: 0.75, settleSeconds: 0.15 },
  jog: { settle: 0.05, hold: 0, setLean: 0, setCrouch: 0.008, setShift: 0.01, setElbow: 0, accelSteps: 1.1, decelSteps: 0, startSpeed: 0.7, endSpeed: 0.6, accelLean: 5, uprightOnStop: 0.7, stopLean: -1, stopSeconds: 0.45, settleSeconds: 0.15 },
};
// A style's ramp: longer for tired / heavy / hurt bodies (a hurt one also hesitates before going and
// starts slower); none at all for a robot. Energy too: lively bodies get going and stop quicker, low
// energy ones slower (energy 0.5 = normal; 0.85 about 25% quicker, 0.2 about 30% slower).
// Extra speed-up / slow-down steps per unit of ramp scale above natural (walking steps take longer).
const RAMP_STEPS_PER_SCALE: Record<GaitKind, number> = { run: 1.6, jog: 1.2, walk: 0.7 };
// The first step from standing is a quick, short one.
const FIRST_STEP_TIME: Record<GaitKind, number> = { run: 0.92, jog: 0.88, walk: 0.82 };
function rampFor(kind: GaitKind, style: MoveStyle, energy = 0.5): Ramp {
  const base = RAMPS[kind], r = RAMP_SCALE[style] * 2 ** (1.2 * (0.5 - clamp(energy, 0, 1)));
  if (r === 0) return { ...base, settle: 0, hold: 0, setLean: 0, setCrouch: 0, setShift: 0, setElbow: 0, accelSteps: 0, decelSteps: 0, startSpeed: 1, endSpeed: 1, accelLean: 0, uprightOnStop: 0, stopLean: 0, stopSeconds: 0.5, settleSeconds: 0.15 };
  // The first and last steps: closer to full speed for a lively body, slower for a tired or hurt one.
  const edge = (speed: number) => (r < 1 ? 1 - (1 - speed) * r : speed / Math.sqrt(r));
  return { ...base, settle: base.settle * r ** 2.5, accelSteps: Math.max(0.5, base.accelSteps + RAMP_STEPS_PER_SCALE[kind] * (r - 1)), decelSteps: Math.max(0, base.decelSteps + RAMP_STEPS_PER_SCALE[kind] * (r - 1)), startSpeed: edge(base.startSpeed), endSpeed: edge(base.endSpeed), stopSeconds: base.stopSeconds * Math.max(1, Math.sqrt(r)), settleSeconds: base.settleSeconds * Math.sqrt(r) };
}
const lengthOf = (f: number) => f ** STRIDE_SHARE;
const durationOf = (f: number) => f ** (STRIDE_SHARE - 1);

type Foot = "l" | "r";
type Plant = { x: number; from: number; to: number };
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth01 = (v: number) => { const u = clamp(v, 0, 1); return u * u * (3 - 2 * u); };
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const sizeOf = (f: number) => clamp((f - SIZE_FLOOR) / (1 - SIZE_FLOOR), 0, 1);

// A smooth, never-overshooting curve through (time, value) points; flat before the first and after the last.
function curve(points: [number, number][], linear = false) {
  const pts: [number, number][] = [];
  for (const p of [...points].sort((a, b) => a[0] - b[0])) {
    if (pts.length && p[0] - pts[pts.length - 1][0] < 1e-6) pts[pts.length - 1] = p; else pts.push(p);
  }
  const times = pts.map((p) => p[0]), values = pts.map((p) => p[1]);
  const tangents = monotoneTangents(times, values), eases = times.map(() => (linear ? "linear" as const : undefined));
  return (time: number) => sampleChannel(times, values, tangents, eases, time);
}

// Speed factor of each step: rising smoothly from the start speed to the top speed, falling smoothly
// to the end speed (a share of the top speed).
function speedProfile(ramp: Ramp, n: number, squeeze: number, top: number) {
  const up = Math.max(1, ramp.accelSteps * squeeze), down = ramp.decelSteps, last = ramp.endSpeed * top;
  return Array.from({ length: n }, (_, i) => {
    const rising = ramp.accelSteps > 0 ? ramp.startSpeed + (top - ramp.startSpeed) * smooth01(i / up) : top;
    const falling = down > 0 ? last + (top - last) * smooth01((n - 1 - i) / down) : top;
    return { f: Math.min(rising, falling), speedingUp: rising <= falling };
  });
}

// How many steps, how fast each is, and the cruise step length that covers the distance exactly.
// Long distances: the full speed-up, cruise, the full slow-down. A short distance can't fit all of
// that: it squeezes the speed-up into fewer steps (never under two) and/or tops out below full speed,
// whichever keeps the steps closest to the cruise length with the smoothest speed changes.
function planSteps(kind: GaitKind, D: number, cruiseLength: number, ramp: Ramp) {
  const units = (f: number[]) => kind !== "walk"
    ? RUN_FIRST_SHARE * lengthOf(f[0]) + sum(f.slice(1).map(lengthOf)) + RUN_STOP_SHARE * lengthOf(f[f.length - 1])
    : sum(f.map(lengthOf));
  // Average hip speed of each step as seen on screen, including the first step (from standing) and the
  // closing step(s), which are slower than their speed factor.
  const seen = (f: number[]) => kind !== "walk" ? [0.65 * f[0], ...f.slice(1), 0.36 * f[f.length - 1], 0.17 * f[f.length - 1]] : [0.47 * f[0], ...f.slice(1), 0.55 * f[f.length - 1]];
  // Quick speed-ups and slow-downs (about half a second) are meant to be big changes per step.
  const smoothJump = kind !== "walk" ? 0.6 : 0.65;
  let best: { score: number; steps: ReturnType<typeof speedProfile>; L: number } | null = null;
  const maxN = Math.max(4, Math.ceil((2 * D) / cruiseLength) + 8);
  for (const top of [1, 0.9, 0.8, 0.7, 0.6]) for (const squeeze of [1, 0.85, 0.7, 0.55]) {
    for (let n = 2; n <= maxN; n += 1) {
      const steps = speedProfile(ramp, n, squeeze, top);
      const f = steps.map((s) => s.f);
      const L = D / units(f);
      const v = seen(f), peak = Math.max(...v);
      const jump = Math.max(0, ...v.slice(1).map((x, i) => Math.abs(x - v[i]) / peak));
      const score = 3 * Math.abs(Math.log(Math.max(L, 1e-9) / cruiseLength)) + 3 * (1 - Math.max(...f)) + 0.4 * (1 - squeeze) + 6 * Math.max(0, jump - smoothJump);
      if (!best || score < best.score - 1e-9) best = { score, steps, L };
    }
  }
  return best!;
}

// Uniform Catmull-Rom through points (used for the running foot's path).
function catmull(points: [number, number][], u: number): [number, number] {
  const n = points.length - 1;
  const f = clamp(u, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n, i + 2)];
  const c = (a: number, b: number, c2: number, d: number) => 0.5 * ((2 * b) + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

// Hip and knee angles that put a foot at a target (side view, facing forward = +x, y down).
function legAngles(hip: Point, foot: Point, lean: number, thigh: number, shin: number) {
  // The knee bends to the front/under side of the hip-to-foot line (never up and over).
  const dx = foot.x - hip.x, dy = foot.y - hip.y, length = Math.hypot(dx, dy) || 1;
  const solved = solveTwoBone(hip, foot, thigh, shin, { x: dy / length, y: -dx / length });
  const thighAngle = deg(Math.atan2(solved.mid.x - hip.x, solved.mid.y - hip.y));
  const shinAngle = deg(Math.atan2(solved.end.x - solved.mid.x, solved.end.y - solved.mid.y));
  // Stay inside the body's bend limits (the engine would clamp anyway; doing it here keeps poses exact).
  return { hip: clamp(thighAngle + lean, -45, 130), knee: clamp(thighAngle - shinAngle, 0, 150), kneeY: solved.mid.y };
}

// The step plan for a distance (used by the tests).
// RIGHT GAIT FOR THE DISTANCE (W14, round 14, Arthur: "walking fast looks weird"): the pace of a natural
// walk with these settings — never a longer stride or a quicker step than the library's own natural walk
// (a slow, tired or hurt walk may be slower). `brisk`: this figure's own walk would be quicker than that.
export function naturalWalkPace(style: MoveStyle, speed: MoveSpeed, energy: number) {
  const t = tune(WALK_BASE, style, speed, energy);
  const stepLength = Math.min(WALK_BASE.stepLength, t.stepLength), stepSeconds = Math.max(WALK_BASE.stepSeconds, t.stepSeconds);
  return { stepLength, stepSeconds, brisk: t.stepSeconds < 0.9 * WALK_BASE.stepSeconds || t.stepLength / t.stepSeconds > 1.15 * (WALK_BASE.stepLength / WALK_BASE.stepSeconds) };
}
export const planGaitSteps = (kind: GaitKind, distance: number, cruiseLength: number, style: MoveStyle = "natural", energy = 0.5) => planSteps(kind, distance, cruiseLength, rampFor(kind, style, energy));
// The longest distance up to `maxDistance` that the move covers with its natural step length (the plan
// stretches or squeezes steps to land exactly; this picks a distance where it hardly has to).
export function naturalDistance(options: Omit<GaitOptions, "distance">, maxDistance: number, tolerance = 0.035) {
  const t = tune(BASES[options.kind], options.style ?? "natural", options.speed ?? "normal", options.energy ?? 0.5);
  if (options.tiptoe && options.kind === "walk") tiptoeTuning(t);
  const cruise = t.stepLength * options.height, ramp = rampFor(options.kind, options.style ?? "natural", options.energy ?? 0.5);
  for (let d = maxDistance; d >= 0.6 * maxDistance; d -= 2) {
    if (Math.abs(planSteps(options.kind, d, cruise, ramp).L / cruise - 1) <= tolerance) return d;
  }
  return maxDistance;
}
// TIPTOE (Arthur, Terra review: "one leg just stays there and the other leg goes around it really slowly; he's
// not tiptoeing"). A tiptoe is a real walk (both feet take turns, each planted foot stays put) made small and
// careful: SHORT steps, each knee lifted HIGHER than a walk's and set down softly, up on the toes (the standing
// leg straight, the body tall, rising a little after each landing — the feet barely touch), a careful little
// pause after each landing, slow and steady travel, the head down watching the floor, and the arms lifted in
// front and bent for balance — and (Arthur, round 2: "they need to go left, right, left, right, passing each
// other, slowly") still swinging opposite the legs, passing each other every step, as slowly as the steps.
export const TIPTOE_ARMS = 22; // degrees: upper arms lifted forward for balance
export const TIPTOE_SWING = 28; // degrees each way: the bent arms pass each other every step
export function tiptoeTuning(t: GaitTuning) {
  t.stepLength *= 0.55;
  t.stepSeconds *= 1.35;
  t.clearance = Math.max(t.clearance * 1.9, 0.12);
  t.reach = 1;
  t.dip = -0.012;
  t.lean = 5;
  t.head = 12;
  t.armSwing = TIPTOE_SWING;
  t.elbowBase = 62; // (bent, but open enough that the hands really swing past each other)
  t.elbowSwing = 14;
  t.hold = Math.max(t.hold, 0.08);
  return t;
}
export const TIPTOE_ABOUT = "Tiptoe forward `distance` px (a quiet, careful walk; or walk with `tiptoe: true`): short careful steps, each knee lifted higher than a walk and set down softly, up on the toes (standing leg straight, body tall), a tiny pause after each landing, slow steady travel, head down watching the floor, arms lifted in front and bent for balance. Styles and speeds still apply (sneaky = a low crouch, tiptoe = tall and light).";

export function buildGait(options: GaitOptions): GaitResult {
  const H = options.height;
  // A jog is built like a run (bouncing hips, a swinging leg that folds and drives) with a shorter, lower hop.
  const run = options.kind !== "walk", jog = options.kind === "jog";
  const base = BASES[options.kind];
  const t = tune(base, options.style ?? "natural", options.speed ?? "normal", options.energy ?? 0.5);
  // Running arms already swing wide; styles may not push them past a natural pump.
  if (run) {
    t.armSwing = Math.min(t.armSwing, jog ? 55 : 80);
    // SEEN, NOT A BLUR: even the fastest run keeps each step long enough to be seen (about 4 pictures
    // at 12 frames a second); a faster runner covers more ground per step instead.
    const minStep = jog ? JOG_MIN_STEP_SECONDS : RUN_MIN_STEP_SECONDS;
    if (t.stepSeconds < minStep) { t.stepLength *= Math.sqrt(minStep / t.stepSeconds); t.stepSeconds = minStep; }
    // Style postures are set for walking; a run keeps its own lean and arm bend and moves half way
    // toward the style (an angry or tired run leans further, a happy one a little less).
    const change = STYLE_CHANGES[options.style ?? "natural"];
    if (change.lean !== undefined) t.lean = base.lean + 0.5 * (change.lean - WALK_BASE.lean);
    if (change.elbowBase !== undefined) t.elbowBase = base.elbowBase + 0.5 * (change.elbowBase - WALK_BASE.elbowBase);
  }
  if (!run) t.clearance = Math.max(t.clearance, WALK_MIN_CLEARANCE); // EVERY WALK LIFTS ITS FEET
  if (options.tiptoe && !run) tiptoeTuning(t);
  const ramp0 = rampFor(options.kind, options.style ?? "natural", options.energy ?? 0.5);
  const ramp = options.keepLean ? { ...ramp0, uprightOnStop: Math.min(ramp0.uprightOnStop, 0.2), stopLean: Math.max(0, ramp0.stopLean) } : ramp0;
  const bones = boneLengths(H);
  const leg = bones.thigh + bones.shin;
  if (jog) {
    // (One stance covers about JOG_STANCE of a step.)
    const longest = (2 * Math.sqrt(1 - JOG_LOWEST_HIPS ** 2) * t.reach * leg) / JOG_STANCE / H;
    t.stepLength = Math.min(t.stepLength, longest);
  }
  const R = leg * t.reach;
  const Ts = t.stepSeconds;
  const startT = options.startT ?? 0;
  // GO: a short lean-in and weight shift onto the front of the feet, then the first (small, slow) step.
  // (A crouching style, like sneaky, needs a moment to sink into its bent-knee stance.)
  const tSet = startT + Math.max(ramp.settle, CROUCH_SECONDS * (1 - t.reach));
  const t0 = tSet + ramp.hold;
  const D = Math.max(0, options.distance);
  const standFeet = forwardKinematics(STAND, "right", { x: 0, y: 0 }, H);
  const stand: Record<Foot, number> = { l: standFeet.lFoot.x, r: standFeet.rFoot.x };
  const lead: Foot = "r", trail: Foot = "l";
  const other = (f: Foot): Foot => (f === "l" ? "r" : "l");

  // The step plan: speed factor, length, duration and swing size of every step; landing k at T[k].
  const plan = planSteps(options.kind, D, t.stepLength * H, ramp);
  const n = plan.steps.length;
  const speedF = plan.steps.map((s) => s.f);
  const len = speedF.map((f) => plan.L * lengthOf(f));
  const dur = speedF.map((f, i) => Ts * durationOf(f) * (i === 0 ? FIRST_STEP_TIME[options.kind] : 1));
  const size = speedF.map(sizeOf);
  const T: number[] = [t0];
  for (let k = 1; k <= n; k += 1) T.push(T[k - 1] + dur[k - 1]);
  const durAfter = (k: number) => dur[Math.min(k, n - 1)]; // the step that starts at landing k

  const plants: Record<Foot, Plant[]> = { l: [], r: [] };
  const shift = ramp.setShift * H;
  const hipPoints: [number, number][] = [[startT, 0], [tSet, shift], [t0, shift]];
  const landings: { t: number; give: number }[] = [];
  let endT: number;
  const runPlants: { plant: Plant; behind: number; base: number; d: number; size: number }[] = []; // run: push-off set by the hips
  const stopPoints: { lean: [number, number][] } = { lean: [] };

  if (!run) {
    const ds = (k: number) => WALK_DOUBLE_SUPPORT * durAfter(k);
    const xs = [0];
    for (let k = 1; k <= n; k += 1) xs.push(xs[k - 1] + len[k - 1]);
    plants[lead].push({ x: stand[lead], from: startT, to: t0 });
    plants[trail].push({ x: stand[trail], from: startT, to: T[1] + ds(1) });
    for (let k = 1; k <= n; k += 1) {
      const foot: Foot = k % 2 === 1 ? lead : trail;
      const x = k === n ? D + stand[foot] : xs[k];
      plants[foot].push({ x, from: T[k], to: k === n ? Infinity : T[k + 1] + ds(k + 1) });
      landings.push({ t: T[k], give: 0.5 * durAfter(k) });
      hipPoints.push([T[k], k === n ? D - len[n - 1] / 2 : (xs[k - 1] + xs[k]) / 2]);
    }
    // Last step: the other foot comes alongside and the walker stops.
    const lastFoot = n % 2 === 1 ? trail : lead;
    const Tf = T[n] + ramp.stopSeconds * dur[n - 1];
    plants[lastFoot].push({ x: D + stand[lastFoot], from: Tf, to: Infinity });
    landings.push({ t: Tf, give: 0.5 * dur[n - 1] });
    hipPoints.push([Tf, D]);
    stopPoints.lean.push([Tf, t.lean * (1 - ramp.uprightOnStop) + ramp.stopLean]);
    endT = Tf;
  } else {
    // Shorter-striding styles and speeds also land and push off a little closer to the hips; slower
    // steps a little closer still.
    const reachScale = clamp(t.stepLength / base.stepLength, 0.7, 1.12);
    const stopLand = Math.max(MIN_STOP_STEP, RUN_STOP_LAND * dur[n - 1]);
    // Ground contact patch of the step that starts at landing k: shorter while speeding up (quick
    // pushes), a little shorter while slowing down.
    const contact = (k: number) => {
      const step = Math.min(k, n - 1);
      return reachScale * speedF[step] ** (plan.steps[step].speedingUp ? RUN_PUSH_SHARE : RUN_CONTACT_SHARE);
    };
    plants[lead].push({ x: stand[lead], from: startT, to: t0 + 0.02 });
    const trailPlant = { x: stand[trail], from: startT, to: t0 + (jog ? JOG_STANCE : RUN_STANCE) * dur[0] };
    plants[trail].push(trailPlant);
    runPlants.push({ plant: trailPlant, behind: (jog ? JOG_BEHIND : RUN_BEHIND) * H * contact(0), base: t0, d: dur[0], size: size[0] });
    let hip = 0;
    for (let k = 1; k <= n; k += 1) {
      const foot: Foot = k % 2 === 1 ? lead : trail;
      hip += k === 1 ? RUN_FIRST_SHARE * len[0] : len[k - 1];
      // The foot lands in front of the hips, then pushes off far behind. While speeding up the foot
      // lands closer under the body (it pushes rather than reaches).
      const ahead = (jog ? JOG_AHEAD : RUN_AHEAD) * H * contact(k - 1);
      const plant = { x: hip + ahead, from: T[k], to: k === n ? T[k] + stopLand + 0.03 : T[k] + (jog ? JOG_STANCE : RUN_STANCE) * dur[k] };
      plants[foot].push(plant);
      if (k < n) runPlants.push({ plant, behind: (jog ? JOG_BEHIND : RUN_BEHIND) * H * contact(k), base: T[k], d: dur[k], size: size[k] });
      landings.push({ t: T[k], give: (jog ? JOG_STANCE : RUN_STANCE) * durAfter(k) });
      hipPoints.push([T[k], hip]);
    }
    // Stopping: the other foot lands beside the hips, then a small catch step brings the feet together.
    const lastFoot = other(n % 2 === 1 ? lead : trail);
    const stopFoot = other(lastFoot);
    const Tf = T[n] + stopLand;
    plants[lastFoot].push({ x: D + stand[lastFoot], from: Tf, to: Infinity });
    const Tc = Tf + Math.max(MIN_STOP_STEP, ramp.stopSeconds * dur[n - 1]);
    plants[stopFoot].push({ x: D + stand[stopFoot], from: Tc, to: Infinity });
    landings.push({ t: Tf, give: RUN_STANCE * dur[n - 1] }, { t: Tc, give: RUN_STANCE * dur[n - 1] });
    hipPoints.push([Tf, D - 0.12 * len[n - 1]], [Tc, D]);
    // (Arriving into a move that goes down, the runner stays leaning in as it stops.)
    const arriveLean = options.keepLean ? 0.45 * t.lean : null;
    stopPoints.lean.push([Tf, arriveLean ?? ramp.stopLean], [Tc, arriveLean ?? 0.4 * ramp.stopLean]);
    endT = Tc;
  }

  const hipX = curve(hipPoints, t.linear);
  for (const { plant, behind, base, d, size: s } of runPlants) {
    // A slow step may keep the foot down longer (no long floaty flight while getting going).
    let lo = base + 0.25 * d, hi = base + (0.6 + 0.3 * (1 - s)) * d;
    const target = plant.x + behind;
    if (hipX(hi) <= target) { plant.to = hi; continue; }
    if (hipX(lo) >= target) { plant.to = lo; continue; }
    for (let i = 0; i < 40; i += 1) { const mid = (lo + hi) / 2; if (hipX(mid) < target) lo = mid; else hi = mid; }
    plant.to = hi;
  }

  // Things that change smoothly over the move, set per step at the middle of the step.
  const mids = speedF.map((_, i) => (T[i] + T[i + 1]) / 2);
  // Swing size per step, set at the middle of the step; a speeding-up step sets it at its start, so the
  // arms and legs are at full size once the speed-up (about half a second) is over.
  const sizeAt = curve([...mids.map((m, i): [number, number] => [plan.steps[i].speedingUp && speedF[i] < 1 ? T[i] : m, size[i]]), [endT, 0]]);
  const legScaleAt = (time: number) => LEG_SWING_MIN + (1 - LEG_SWING_MIN) * sizeAt(time);
  const lengthScaleAt = curve(mids.map((m, i): [number, number] => [m, lengthOf(speedF[i])]));
  // Lean: further over in the set pose and while speeding up; back toward upright while slowing down.
  const leanAt = curve([
    [startT, 0], [tSet, 0.5 * t.lean + ramp.setLean], [t0, 0.5 * t.lean + ramp.setLean],
    ...mids.map((m, i): [number, number] => [m, plan.steps[i].speedingUp
      ? t.lean + ramp.accelLean * (1 - size[i])
      : t.lean * (1 - ramp.uprightOnStop * (1 - size[i]))]),
    ...stopPoints.lean,
  ]);
  // Knees soften in the set pose, and the first push straightens them out again.
  // A crouching style (sneaky) also keeps its hips low the whole way: it sinks while getting going.
  const low = (t.crouch ?? 0) * H * (run ? RUN_CROUCH_SHARE : 1);
  const crouchAt = curve([[startT, 0], [tSet, low + ramp.setCrouch * H], [t0, low + ramp.setCrouch * H], [T[1], low + 0.35 * ramp.setCrouch * H], [T[Math.min(2, n)], low], [endT, low]]);
  // Running arms: extra elbow bend in the set pose, fading as the runner gets going.
  const elbowAddAt = curve([[t0, ramp.setElbow * (1 - size[0])], ...mids.map((m, i): [number, number] => [m, plan.steps[i].speedingUp ? ramp.setElbow * (1 - size[i]) : 0])]);
  // ARM SWING RULE: the size of the arm swing in each step (see ARM_FIRST); a robot swings at full size.
  const extraSteps = Math.max(0, ramp.accelSteps - RAMPS[options.kind].accelSteps);
  // (A short trip can't spend most of its steps growing and shrinking: it gets to full swing sooner. A
  // short dash pumps the arms hard: full swing by its middle step.)
  const short = run ? Math.max(1, Math.floor((n - 1) / 2)) : Math.max(2, Math.round((n - 1) / 3));
  const grow = Math.min(ARM_GROW_STEPS[options.kind] + extraSteps, short), shrink = Math.min(ARM_SHRINK_STEPS[options.kind] + extraSteps, short);
  // ARMS HANG BY GRAVITY (Arthur, round 5: "equally spaced in front and behind"): whatever the lean and
  // the elbow bend, the swing is centred so the hand reaches as far in front of the shoulder as behind it.
  const handAhead = (shoulder: number, elbow: number) => bones.upperArm * Math.sin(rad(shoulder - t.lean)) + bones.forearm * Math.sin(rad(shoulder - t.lean + elbow));
  const centred = (arm: (w: number, c: number) => { shoulder: number; elbow: number }) => {
    let lo = -80, hi = 80;
    for (let i = 0; i < 40; i += 1) {
      const c = (lo + hi) / 2, f = arm(1, c), b = arm(-1, c);
      if (handAhead(f.shoulder, f.elbow) + handAhead(b.shoulder, b.elbow) > 0) hi = c; else lo = c;
    }
    return (lo + hi) / 2;
  };
  const walkArm = (w: number, c: number) => ({ shoulder: c + t.armSwing * w, elbow: t.elbowBase + t.elbowSwing * Math.max(0, w) });
  // Running arms (Arthur, round 6: "the arms are stiff as rock, 90-degree angles ... they have to go
  // equally in front of him far away, same for behind him"; round 7: "they're not really going behind
  // the stick figure, just up, down, up, down. They need to go left, right: the arms actually need to go
  // behind the stick figure"): loose, big and swinging AROUND THE BODY. A runner leans forward, so
  // "behind him" means behind his back, not behind straight down: the upper arm swings back to
  // `armSwing` degrees behind the body line and just far enough forward that the hand is as far in front
  // of the body line as it is behind it (if a bent front arm can't reach that far, the back swing is
  // shortened to match). The elbow bends a little more coming forward and opens going back, never locked.
  const runElbow = (w: number) => Math.max(8, t.elbowBase + t.elbowSwing * w);
  // How far the hand is in front of the body line (angles from the body's downward line).
  const reachOf = (fromBody: number, elbow: number) => bones.upperArm * Math.sin(rad(fromBody)) + bones.forearm * Math.sin(rad(fromBody + elbow));
  let runBack = t.armSwing, runFront = 0;
  if (run) {
    let best = 0;
    for (let a = 0; a <= 100; a += 0.25) if (reachOf(a, runElbow(1)) > reachOf(best, runElbow(1)) + 1e-9) best = a;
    const frontMax = reachOf(best, runElbow(1));
    while (runBack > 10 && -reachOf(-runBack, runElbow(-1)) > frontMax) runBack -= 0.25;
    const backReach = -reachOf(-runBack, runElbow(-1));
    runFront = best;
    for (let a = 0; a <= best; a += 0.25) if (reachOf(a, runElbow(1)) >= backReach) { runFront = a; break; }
  }
  // The upper arm's angle from the body line goes smoothly from -runBack (w = -1) to runFront (w = 1).
  const runArm = (w: number) => ({ shoulder: (runFront - runBack) / 2 + ((runFront + runBack) / 2) * w, elbow: runElbow(w) });
  const armCentre = run ? 0 : options.tiptoe ? TIPTOE_ARMS : centred(walkArm);
  const armSizeOf = (i: number) => ramp.accelSteps <= 0 ? 1
    : Math.min(1, ARM_FIRST[options.kind] + (1 - ARM_FIRST[options.kind]) * (i / grow), ARM_LAST + (1 - ARM_LAST) * ((n - 1 - i) / shrink));
  const armEnvelopeAt = curve([[startT, 0], [t0, ramp.accelSteps <= 0 ? 1 : 0.5 * ARM_FIRST[options.kind]], ...mids.map((m, i): [number, number] => [m, armSizeOf(i)]), [endT, ramp.accelSteps <= 0 ? 1 : 0.4 * ARM_LAST]]);
  // Arm swing timing: frozen while getting ready, then following the steps (one full swing per two steps).
  const phasePoints: [number, number][] = [[startT, -0.5], [t0, -0.5]];
  for (let k = 1; k <= n; k += 1) phasePoints.push([T[k], (k - 1) / 2]);
  phasePoints.push([endT, (n - 1) / 2 + (0.5 * (endT - T[n])) / dur[n - 1]]);
  const phaseAt = curve(phasePoints);
  // Only once the last foot has landed do the arms settle into their resting stand.
  const relaxAt = curve([[T[n], 0], [endT, 0.85]]);
  // The arms bend into their running / walking carry early in the first step (while their swing is still small).
  const readyAt = curve([[startT, 0], [t0 + 0.4 * dur[0], 1]]);

  const plantAt = (foot: Foot, time: number) => plants[foot].find((p) => time >= p.from - 1e-9 && time <= p.to + 1e-9) ?? null;
  const plantedHeight = (time: number) => {
    const x = hipX(time);
    let h = Infinity;
    for (const foot of ["l", "r"] as const) {
      const p = plantAt(foot, time);
      if (p) h = Math.min(h, Math.sqrt(Math.max(0, R * R - Math.min(0.999 * R, Math.abs(x - p.x)) ** 2)));
    }
    if (h === Infinity) return null;
    const last = landings.filter((l) => l.t <= time + 1e-9).pop();
    // The knees give a little after each landing (more at speed). A runner's give lasts only while
    // the foot is down, so the leg is straight again for the push-off.
    if (last !== undefined && time - last.t < last.give) h -= t.dip * H * legScaleAt(time) * Math.sin(Math.PI * (time - last.t) / last.give);
    return h;
  };
  const hipHeightRaw = (time: number) => {
    const planted = plantedHeight(time);
    if (planted !== null) return planted;
    // Flight: a smooth arc between take-off and landing (higher at speed).
    const offs = (["l", "r"] as const).flatMap((f) => plants[f].map((p) => p.to)).filter((x) => x < time).sort((a, b) => b - a);
    const ons = (["l", "r"] as const).flatMap((f) => plants[f].map((p) => p.from)).filter((x) => x > time).sort((a, b) => a - b);
    const a = offs[0], b = ons[0];
    const ha = plantedHeight(a) ?? R, hb = plantedHeight(b) ?? R;
    const w = (time - a) / Math.max(1e-6, b - a);
    return ha + (hb - ha) * w + 4 * (jog ? JOG_FLIGHT_PEAK : RUN_FLIGHT_PEAK) * H * sizeAt((a + b) / 2) * w * (1 - w);
  };
  // How high a knee is when the hips are at height h over a planted foot `d` behind them (the knee
  // bends forward, so a foot far behind low hips brings that knee down toward the floor).
  const kneeHeightOver = (h: number, d: number) => {
    const L = Math.hypot(h, d), half = Math.min(L / 2, bones.thigh);
    return h / 2 - Math.sqrt(Math.max(0, bones.thigh * bones.thigh - half * half)) * (d / Math.max(L, 1e-9));
  };
  // Body rule: the hips never sink so low that a knee would touch the floor (deep crouches).
  const kneeClear = KNEE_CLEARANCE * H;
  const hipHeight = (time: number) => {
    let h = hipHeightRaw(time) - crouchAt(time);
    const x = hipX(time);
    for (const foot of ["l", "r"] as const) {
      const p = plantAt(foot, time);
      if (!p || p.x >= x) continue;
      for (let i = 0; i < 200 && kneeHeightOver(h, x - p.x) < kneeClear; i += 1) h += 0.25;
    }
    return h;
  };
  // Where a foot is in its swing (run only): from which take-off to which landing, and how far along.
  const swingPhase = (foot: Foot, time: number) => {
    const list = plants[foot];
    const prev = [...list].reverse().find((q) => q.to < time);
    const next = list.find((q) => q.from > time);
    if (!prev || !next) return null;
    return { prev, next, u: (time - prev.to) / Math.max(1e-6, next.from - prev.to) };
  };
  const footAt = (foot: Foot, time: number): { x: number; h: number; planted: boolean } => {
    const p = plantAt(foot, time);
    if (p) return { x: p.x, h: 0, planted: true };
    const list = plants[foot];
    const prev = [...list].reverse().find((q) => q.to < time)!;
    const next = list.find((q) => q.from > time)!;
    const v = (time - prev.to) / Math.max(1e-6, next.from - prev.to);
    const lift = run ? t.clearance * H * legScaleAt((prev.to + next.from) / 2) : Math.max(WALK_MIN_LIFT * H, t.clearance * H * legScaleAt((prev.to + next.from) / 2));
    if (!run || next.from === Infinity) {
      const s = v * v * (3 - 2 * v);
      return { x: prev.x + (next.x - prev.x) * s, h: lift * Math.sin(Math.PI * v), planted: false };
    }
    // Running foot: kick up behind, drive the knee forward, reach down to land.
    const relA = prev.x - hipX(prev.to), relB = next.x - hipX(next.from);
    const [rel, h] = catmull([
      [relA, 0],
      [-0.2 * H, 0.55 * lift],
      [-0.1 * H, 1.0 * lift],
      [0.12 * H, 0.75 * lift],
      [relB + 0.04 * H, 0.2 * lift],
      [relB, 0],
    ], v);
    // Keep the kick inside what a knee can do: the foot never folds closer to the hip than half a leg.
    const hx = hipX(time), hh = hipHeight(time);
    let fx = hx + rel, fh = Math.max(0, h);
    const dx = fx - hx, dy = hh - fh, dist = Math.hypot(dx, dy), minDist = 0.5 * leg;
    if (dist < minDist && dist > 1e-6) { fx = hx + (dx / dist) * minDist; fh = Math.max(0, hh - (dy / dist) * minDist); }
    return { x: fx, h: fh, planted: false };
  };

  // Running swing leg from the phase shapes (see AIRBORNE). Livelier runs fold the knee
  // further and swing the thigh further; tired, small or slow runs less.
  // (Measured against this gait's own natural foot lift, so a jog's lower lift isn't read as "tired".)
  const lively = 0.25 * t.clearance / base.clearance;
  const kneeFold = clamp(1 + 1.6 * (lively - 0.25), 0.85, 1.15) * (jog ? JOG_LEG_SWING.knee : 1);
  const thighSwing = clamp(0.6 + 1.6 * lively, 0.75, 1.25) * (jog ? JOG_LEG_SWING.thigh : 1);
  const waves = (amps: number[], u: number) => amps.reduce((total, a, i) => total + a * Math.sin((i + 1) * Math.PI * u), 0);
  const swingThigh = curve(SWING_THIGH_SHAPE), swingKnee = curve(SWING_KNEE_SHAPE);
  const runSwingLeg = (swing: { prev: Plant; next: Plant; u: number }, time: number) => {
    const at = (when: number, footX: number) => {
      const lean = leanAt(when);
      const angles = legAngles({ x: hipX(when), y: -hipHeight(when) }, { x: footX, y: 0 }, lean, bones.thigh, bones.shin);
      return { thigh: angles.hip - lean, knee: angles.knee };
    };
    const start = at(swing.prev.to, swing.prev.x), end = at(swing.next.from, swing.next.x);
    const u = clamp(swing.u, 0, 1);
    const grow = legScaleAt(time), lean = leanAt(time);
    // A foot that leaves from under the body (the first step from standing) has no push-off behind
    // to follow through from, and a slow step has little speed to carry the leg back: the knee lifts
    // and drives forward instead of kicking back. At cruise this is exactly the running swing.
    const behind = swing.prev.from <= startT ? 0 : sizeAt(time);
    const thighWave = behind * swingThigh(u) + (1 - behind) * waves(DRIVE_THIGH_WAVES, u);
    const kneeWave = behind * swingKnee(u) + (1 - behind) * waves(DRIVE_KNEE_WAVES, u);
    const thighAngle = start.thigh + (end.thigh - start.thigh) * u + grow * thighSwing * thighWave; // from vertical, forward +
    // The first step from standing and the stopping steps are short and low: the foot's clearance fades
    // gently toward the landing, so it sets down smoothly instead of being held up and snapping down.
    const edgeStep = swing.next.to === Infinity || swing.prev.from <= startT;
    let knee = start.knee + (end.knee - start.knee) * u + grow * kneeFold * kneeWave;
    // The swinging foot always clears the ground (it folds a little more if it would scrape).
    const hh = hipHeight(time), upper = rad(thighAngle), margin = 0.065 * H * grow * (edgeStep ? Math.sin(Math.PI * u) : Math.min(1, 3 * Math.sin(Math.PI * u)));
    const room = (hh - Math.cos(upper) * bones.thigh - margin) / bones.shin;
    if (room < 1) knee = Math.max(knee, thighAngle + deg(Math.acos(clamp(room, -1, 1))));
    const hipAngle = clamp(thighAngle + lean, -45, 130), kneeAngle = clamp(knee, 0, 150);
    // Knee and foot height (for the ground check) from the chosen angles.
    const thighDown = rad(hipAngle - lean);
    const kneeY = -hh + Math.cos(thighDown) * bones.thigh;
    return { hip: hipAngle, knee: kneeAngle, kneeY, footY: kneeY + Math.cos(thighDown - rad(kneeAngle)) * bones.shin };
  };

  // Sample keys densely (the same number per step at any speed), always including every landing and take-off.
  const perStep = run ? 8 : 6;
  const events = new Set<number>([startT, (startT + tSet) / 2, tSet, t0, endT]);
  for (const foot of ["l", "r"] as const) for (const p of plants[foot]) { if (p.from > startT) events.add(p.from); if (Number.isFinite(p.to)) events.add(p.to); }
  for (let k = 0; k < n; k += 1) for (let i = 0; i < perStep; i += 1) events.add(T[k] + (i * dur[k]) / perStep);
  for (let time = T[n]; time < endT; time += dur[n - 1] / perStep) events.add(time);
  const times = [...events].filter((x) => x >= startT && x <= endT).sort((a, b) => a - b)
    .filter((x, i, all) => i === 0 || x - all[i - 1] > 1e-4);

  const facing = options.direction > 0 ? "right" as const : "left" as const;
  const ease = t.linear ? "linear" as const : undefined;
  let keys: CharacterKey[] = times.map((time) => {
    const x = hipX(time);
    const h = hipHeight(time);
    const lean = leanAt(time);
    const hip = { x, y: -h };
    const feet = { l: footAt("l", time), r: footAt("r", time) };
    const legFor = (foot: Foot) => {
      const swing = run && !feet[foot].planted ? swingPhase(foot, time) : null;
      if (!swing || swing.next.from === Infinity) return legAngles(hip, { x: feet[foot].x, y: -feet[foot].h }, lean, bones.thigh, bones.shin);
      return runSwingLeg(swing, time);
    };
    const legL = legFor("l");
    const legR = legFor("r");
    // Each arm swings with the opposite leg (left arm forward when the right leg is forward); the
    // swing grows and shrinks step by step (ARM SWING RULE).
    let lArm: number, rArm: number, lElbow: number, rElbow: number;
    if (run) {
      // Running arms: a smooth wave over the stride (one full swing per two steps). Elbows bend a
      // little more going forward.
      const phase = phaseAt(time);
      // Small swings while getting going, growing each step; shrinking each step while stopping.
      const armSize = armEnvelopeAt(time);
      const wave = (p: number) => armSize * Math.cos(2 * Math.PI * (p - ARM_PEAK_PHASE));
      const lWave = wave(phase), rWave = wave(phase - 0.5); // phase 0 = right foot lands, 0.5 = left foot lands
      // The hand reaches as far behind the shoulder as in front (see runArm and ARMS HANG BY GRAVITY).
      const shoulderAt = (w: number) => runArm(w).shoulder;
      const extraBend = elbowAddAt(time);
      const elbowAt = (w: number) => runArm(w).elbow + extraBend;
      lArm = shoulderAt(lWave);
      rArm = shoulderAt(rWave);
      lElbow = elbowAt(lWave);
      rElbow = elbowAt(rWave);
    } else {
      const reach = 22 * lengthScaleAt(time); // shorter steps swing the legs less far, so the arms follow them
      // The arms balance the legs: they swing opposite each other by how far the legs are split (so
      // even a crouched walker, with both thighs forward, swings its arms past each other every step).
      const split = clamp((legR.hip - legL.hip) / (2 * reach), -1, 1) * armEnvelopeAt(time);
      lArm = armCentre + t.armSwing * split;
      rArm = armCentre - t.armSwing * split;
      const elbow = (arm: number) => t.elbowBase + t.elbowSwing * Math.max(0, (arm - armCentre) / Math.max(1, t.armSwing));
      lElbow = elbow(lArm);
      rElbow = elbow(rArm);
    }
    const relax = 1 - readyAt(time) * (1 - relaxAt(time));
    const toRest = (value: number, rest: number) => value + (rest - value) * relax;
    const pose: PoseAngles = {
      lean, head: t.head,
      lShoulder: toRest(lArm, STAND.lShoulder), rShoulder: toRest(rArm, STAND.rShoulder), lElbow: toRest(lElbow, STAND.lElbow), rElbow: toRest(rElbow, STAND.rElbow),
      lHip: legL.hip, rHip: legR.hip, lKnee: legL.knee, rKnee: legR.knee,
    };
    // Height of the lowest foot or knee above the ground (0 whenever a foot is down).
    const footHeight = (limb: { kneeY: number; footY?: number }, foot: Foot) => (limb.footY !== undefined ? -limb.footY : feet[foot].h);
    const lowest = Math.min(footHeight(legL, "l"), footHeight(legR, "r"), -legL.kneeY, -legR.kneeY);
    const contacts: FootContact[] = [];
    if (feet.l.planted) contacts.push("lFoot");
    if (feet.r.planted) contacts.push("rFoot");
    return { t: time, x: options.startX + options.direction * x, lift: Math.max(0, lowest), pose, contacts, facing, ease, xEase: ease, liftEase: ease };
  });

  // Start from a normal stand; the set pose blends in before the first step.
  keys[0] = { ...keys[0], pose: STAND, lift: 0 };

  // Robot / sneaky / heavy: a short stillness after each landing.
  if (t.hold > 0) {
    const holdAfter = landings.map((l) => l.t).filter((l) => l < endT - 1e-6);
    const shiftBy = (time: number) => holdAfter.filter((l) => l < time - 1e-6).length * t.hold;
    const out: CharacterKey[] = [];
    for (const key of keys) {
      const moved = { ...key, t: key.t + shiftBy(key.t) };
      out.push(moved);
      if (holdAfter.some((l) => Math.abs(l - key.t) < 1e-6)) out.push({ ...moved, t: moved.t + t.hold });
    }
    keys = out;
    endT += holdAfter.length * t.hold;
  }

  // Settle into a normal stand.
  const settleT = endT + ramp.settleSeconds;
  keys.push({ t: settleT, x: options.startX + options.direction * D, pose: STAND, contacts: ["lFoot", "rFoot"], facing, ease, xEase: ease });
  return { keys, endT: settleT, endX: options.startX + options.direction * D };
}
