import type { CharacterKey } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { clampPose, STAND, type PoseAngles } from "../rig.ts";
import { forwardSign, lerpPose, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";

// RIDING (Oct 14, Arthur on the skateboard ollie: "he's going the speed of sound… doesn't even look like he's on a skateboard
// stance… when he hops over the bench he doesn't decelerate… breaking 3 laws: speed, an animation principle, not the right
// stance"). A ride is a BODY ON A ROLLING THING, so it obeys three rules every ride shares (skateboard, scooter):
// 1. THE RIDE STANCE: feet on the deck front and back (side stance), knees bent, arms out for balance (on a scooter: hands on
//    the bar); the FRONT foot never leaves the deck, so the board stays under the feet.
// 2. SPEED COMES FROM PUSHES and friction takes it away: the back foot reaches down beside the board, plants and sweeps back
//    (the body speeds up DURING the push, never instantly), returns to the deck; then a glide where the speed eases down.
//    Never faster than the travel-speed law's ride limit (laws/measure.ts "travelSpeed": ~4 H/s).
// 3. A TRICK HAS ITS ANTICIPATION AND ITS COST: an ollie = crouch (wind-up) → pop (board and body rise together on a gravity
//    arc over the obstacle) → land with bent knees (absorb) and some speed is lost; the ride ends slowing down to a stop.
// The board itself is drawn by the engine (autoEffects.ts "THE RIDE BRINGS ITS BOARD"), anchored under the front foot.
export type RideParams = { on?: "skateboard" | "scooter"; distance?: number; pushes?: number; trick?: "ollie"; over?: number; overWidth?: number; height?: number; stop?: boolean };
export const RIDE_DECK = 0.055; // x H: the deck top above the ground (wheels + deck)
export const RIDE_BOARD = 0.46; // x H: the board's length
export const RIDE_ABOUT = "Ride a skateboard or scooter (`on`, default skateboard) `distance` px forward: side stance on the deck (knees bent, arms out; scooter: hands on the bar), `pushes` (2) push-offs with the back foot (speed grows during each push), a glide that slows by itself, and (`stop`, default true) a smooth slow-down to a stop on the board. `trick: \"ollie\"` with `over` = the stage x of the obstacle's middle and `overWidth` its width px (a prop you place there, low: under 0.35 H; facing left-right): crouch, pop, board and body arc over it together (`height` x H clearance, 0.3), land with bent knees, ride on. The engine draws the board/scooter under the feet (don't add one). Then it steps off the front of the board (the board stays). Marks `push1`.., `pop`, `land`, `stopped`, `off`.";

const G = 5.8; // gravity, H per second² (9.8 m/s² for a 1.7 m body)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (u: number) => { const t = clamp(u, 0, 1); return t * t * (3 - 2 * t); };
const bump = (u: number) => Math.sin(Math.PI * clamp(u, 0, 1)); // 0 → 1 → 0

// The ride poses (facing right, forward +): the LEFT leg is the front foot on the deck.
const GLIDE = (scooter: boolean): PoseAngles => ({ ...STAND, lean: scooter ? 10 : 6, head: 2, lHip: 24, lKnee: 30, rHip: -20, rKnee: 30,
  lShoulder: scooter ? 58 : 72, lElbow: scooter ? 18 : 24, rShoulder: scooter ? 52 : -62, rElbow: scooter ? 22 : 26 });
const CROUCH: PoseAngles = { ...STAND, lean: 22, head: 6, lHip: 70, lKnee: 100, rHip: 22, rKnee: 92, lShoulder: 30, lElbow: 30, rShoulder: -40, rElbow: 30 };
const AIR: PoseAngles = { ...STAND, lean: 12, head: 2, lHip: 72, lKnee: 96, rHip: 30, rKnee: 104, lShoulder: 88, lElbow: 20, rShoulder: -78, rElbow: 22 };
// THE OLLIE IS A REAL JUMP (Arthur, Oct 15: "when he hops he doesn't extend his legs — he bends and stays bent"): crouch → POP (the
// legs SNAP straight, the body shoots up) → TUCK (knees up over the obstacle) → REACH (the legs stretch down for the deck) → absorb.
const POP: PoseAngles = { ...STAND, lean: 6, head: 0, lHip: 16, lKnee: 8, rHip: -2, rKnee: 12, lShoulder: 58, lElbow: 22, rShoulder: -58, rElbow: 24 };
const REACH: PoseAngles = { ...STAND, lean: 10, head: 2, lHip: 34, lKnee: 36, rHip: -14, rKnee: 40, lShoulder: 80, lElbow: 22, rShoulder: -70, rElbow: 24 };
// FRICTION BRAKE (Arthur, Oct 15: "when he slows down it looks like telekinesis — his foot should drag on the ground"): the back foot
// comes off the deck, reaches back and DRAGS flat on the ground behind the board while the front knee bends to carry the weight.
const BRAKE_POSE = (scooter: boolean): PoseAngles => ({ ...GLIDE(scooter), lean: scooter ? 6 : 2, head: 0, lHip: 34, lKnee: 48, rHip: -30, rKnee: 8,
  lShoulder: scooter ? 58 : 60, lElbow: scooter ? 18 : 20, rShoulder: scooter ? 52 : -50, rElbow: scooter ? 22 : 22 });
const STOPPED = (scooter: boolean): PoseAngles => ({ ...GLIDE(scooter), lean: scooter ? 6 : 3, lHip: 14, lKnee: 16, rHip: -12, rKnee: 16, lShoulder: scooter ? 58 : 30, rShoulder: scooter ? 52 : -24, lElbow: scooter ? 18 : 20, rElbow: scooter ? 22 : 18 });

const skel = (p: PoseAngles) => forwardKinematics(p, "right", { x: 0, y: 0 }, 1, "normal", false);
// The pose with the back foot `extra` (x H) LOWER than the front foot (0 = both on the deck; RIDE_DECK = on the ground): the back
// knee is solved (bisection) — the front leg never moves for it.
// (THE BACK FOOT REALLY REACHES — Arthur, Oct 15: "by a few pixels the leg behind him is floating": when even a straight back knee
// cannot reach that low, the back thigh swings in under the hip — the smallest swing that reaches — before the knee is solved.)
function backFootDown(p0: PoseAngles, extra: number): PoseAngles {
  let p = p0;
  // (first the FRONT knee bends deeper — the rider sinks onto the deck foot, as a real foot-brake or push does — then, if that is
  // still not enough, the back thigh swings in)
  for (let k = 1; k <= 40 && skel({ ...p, rKnee: 0 }).rFoot.y < skel(p).lFoot.y + extra; k += 1) p = { ...p0, lHip: p0.lHip + 0.5 * k, lKnee: p0.lKnee + k };
  const want2 = skel(p).lFoot.y + extra;
  if (skel({ ...p, rKnee: 0 }).rFoot.y < want2) {
    let best = p.rHip, bestY = -Infinity, found = false;
    for (let d = 1; d <= 70 && !found; d += 1) { const y = skel({ ...p, rHip: p0.rHip + d, rKnee: 0 }).rFoot.y; if (y > bestY) { bestY = y; best = p0.rHip + d; } if (y >= want2) found = true; }
    if (found) { let a = best - 1, b = best; for (let i = 0; i < 20; i += 1) { const m = (a + b) / 2; if (skel({ ...p, rHip: m, rKnee: 0 }).rFoot.y >= want2) b = m; else a = m; } best = b; }
    p = { ...p, rHip: best };
  }
  const want3 = skel(p).lFoot.y + extra;
  let lo = 0, hi = 150;
  for (let i = 0; i < 24; i += 1) { const mid = (lo + hi) / 2; if (skel({ ...p, rKnee: mid }).rFoot.y > want3) lo = mid; else hi = mid; }
  return { ...p, rKnee: (lo + hi) / 2 };
}
// HANDS ON THE BAR, EXACTLY (Arthur, Oct 15: "broken scooter" — the scooter is one piece, its bar fixed to the deck, so the hands
// must be exactly on it whatever the legs and lean do): both arms are solved (shoulder + elbow) so each hand is at `grip` (x H, from
// the FRONT foot — the deck the bar is fixed to). A held thing fixed to something else is gripped where it IS, never where a pose
// guessed it would be.
function armsTo(p: PoseAngles, grip: { x: number; y: number }): PoseAngles {
  // (out of reach: the chest leans toward the bar — the legs stay where they are, a hip angle is measured from the chest — until the
  // straight-ish arms reach it)
  let best = armsSolve(p, grip);
  for (let more = 2; more <= 30 && best.miss > 0.002; more += 2) {
    const r = armsSolve({ ...p, lean: p.lean + more, lHip: p.lHip + more, rHip: p.rHip + more }, grip);
    if (r.miss < best.miss) best = r;
  }
  return best.pose;
}
function armsSolve(p: PoseAngles, grip: { x: number; y: number }): { pose: PoseAngles; miss: number } {
  let q = { ...p };
  for (const side of ["l", "r"] as const) {
    const S = `${side}Shoulder` as const, E = `${side}Elbow` as const, hand = `${side}Hand` as const;
    const err = (o: PoseAngles) => { const k = skel(o); return [k[hand].x - k.lFoot.x - grip.x, k[hand].y - k.lFoot.y - grip.y] as const; };
    for (let it = 0; it < 30; it += 1) {
      const [ex, ey] = err(q); if (Math.hypot(ex, ey) < 1e-4) break;
      const h = 0.5, a = err({ ...q, [S]: q[S] + h }), b = err({ ...q, [E]: q[E] + h });
      const j11 = (a[0] - ex) / h, j21 = (a[1] - ey) / h, j12 = (b[0] - ex) / h, j22 = (b[1] - ey) / h, det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-9) break;
      const dS = (j22 * ex - j12 * ey) / det, dE = (-j21 * ex + j11 * ey) / det, m = Math.min(1, 25 / Math.max(Math.abs(dS), Math.abs(dE)));
      q = { ...q, [S]: q[S] - dS * m, [E]: clamp(q[E] - dE * m, 0, 160) };
    }
  }
  const k = skel(q);
  return { pose: q, miss: Math.max(...[k.lHand, k.rHand].map((h) => Math.hypot(h.x - k.lFoot.x - grip.x, h.y - k.lFoot.y - grip.y))) };
}
// The lift that keeps the FRONT foot exactly on the deck (the engine sets the lowest body point `lift` above the ground).
function liftFor(p: PoseAngles, deckUp: number, H: number) {
  const s = skel(p);
  const lowest = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y);
  return Math.max(0, (deckUp - (lowest - s.lFoot.y)) * H);
}

export function ride(start: Stance, params: RideParams, settings: MoveSettings): MoveOutput {
  const H = settings.height, sign = forwardSign(start.facing);
  const scooter = params.on === "scooter";
  // (a short ride has fewer pushes: about one push for every 1.6 body heights of ride)
  const pushes = clamp(Math.min(Math.round(Number(params.pushes ?? 2)), Math.floor(Math.max(0.3 * H, Number(params.distance ?? 4 * H)) / (1.6 * H)) || 1), 1, 4);
  const want = Math.max(0.3 * H, Number(params.distance ?? 4 * H));
  const ollie = params.trick === "ollie" && !scooter;
  const clear = clamp(Number(params.height ?? 0.3), 0.15, 0.45);
  const overAt = ollie && Number.isFinite(Number(params.over)) ? (Number(params.over) - start.x) * sign / H : ollie ? want / H * 0.55 : NaN; // x H ahead
  const stop = params.stop !== false;
  // THE WHOLE BOARD CLEARS THE WHOLE OBSTACLE: in the air it must travel the obstacle's width + the board's length (+ a margin),
  // so the slower it rolls the higher (longer) the pop — the arc's middle over the obstacle's middle.
  const span = Math.max(0.2 * H, Number(params.overWidth ?? 0.5 * H)) / H + RIDE_BOARD + 0.2;
  const popUp = (vel: number) => Math.min(0.75, Math.max(clear + RIDE_DECK, G * (span / Math.max(vel, 0.4)) ** 2 / 8));
  const glidePose = GLIDE(scooter), stopPose = STOPPED(scooter), brakePose = BRAKE_POSE(scooter);
  // --- the speed plan (H/s), simulated in small steps: step on, pushes, glide (friction), ollie, slow-down to a stop ---
  // (a short ride — a small page — pushes softer: the push gives only the speed that distance needs)
  const dt = 1 / 48, PUSH = 0.95, DV = (scooter ? 0.85 : 1.0) * clamp(want / (2.5 * H), 0.3, 1), VMAX = 3.0, FRICTION = 0.18, BRAKE = 1.5, DRAG_IN = 0.25;
  type Sample = { t: number; x: number; v: number; pose: PoseAngles; up: number; mark?: string; push?: boolean; drag?: boolean };
  const out: Sample[] = [];
  let t = 0, x = 0, v = 0;
  const settleIn = 0.45; // step onto the deck: from the start pose into the ride stance
  for (; t < settleIn - 1e-9; t += dt) out.push({ t, x, v, pose: lerpPose(start.pose, glidePose, smooth(t / settleIn)), up: RIDE_DECK * smooth(t / settleIn) });
  // pushes
  for (let k = 0; k < pushes; k += 1) {
    // (no push into the obstacle: a push that would still be going when the ollie must start is left out)
    if (ollie && k > 0 && x + (v + DV / 2) * PUSH + (v + DV) * (0.32 + Math.sqrt(2 * popUp(v + DV) / G)) >= overAt) break;
    const t0 = t;
    for (; t < t0 + PUSH - 1e-9; t += dt) {
      const u = (t - t0) / PUSH;
      // back leg: reach forward-down (0..0.3), plant and sweep back (0.3..0.7), lift back onto the deck (0.7..1)
      const rHip = u < 0.3 ? -20 + 34 * smooth(u / 0.3) : u < 0.7 ? 14 - 50 * smooth((u - 0.3) / 0.4) : -36 + 16 * smooth((u - 0.7) / 0.3);
      const extra = u < 0.3 ? RIDE_DECK * smooth(u / 0.3) : u < 0.7 ? RIDE_DECK : RIDE_DECK * (1 - smooth((u - 0.7) / 0.3)) - 0.04 * bump((u - 0.7) / 0.3);
      const b = bump(u);
      const p = backFootDown({ ...glidePose, rHip, lHip: glidePose.lHip + 14 * b, lKnee: glidePose.lKnee + 22 * b, lean: glidePose.lean + 10 * b,
        lShoulder: scooter ? glidePose.lShoulder : glidePose.lShoulder - 30 * b, rShoulder: scooter ? glidePose.rShoulder : glidePose.rShoulder + 40 * b }, extra);
      // the speed grows only while the foot pushes (u 0.3..0.7), eased (no instant start)
      if (u >= 0.3 && u < 0.7) v += DV * (Math.PI / 2) * Math.sin(Math.PI * (u - 0.3) / 0.4) * dt / 0.4;
      v = Math.min(VMAX, Math.max(0, v - (u < 0.3 || u >= 0.7 ? FRICTION * dt : 0)));
      out.push({ t, x, v, pose: p, up: RIDE_DECK, mark: u < dt / PUSH ? `push${k + 1}` : undefined, push: true });
      x += v * dt;
    }
  }
  const pushedX = x;
  // the glide (and the ollie on the way): friction eases the speed down; the stop needs v²/(2·BRAKE) to come to rest
  const stopAt = Math.max(pushedX + 0.5, want / H);
  let phase: "glide" | "crouch" | "air" | "land" | "brake" = "glide", pt = 0, airT = 0, vAir = 0, landed = false;
  const CROUCH_S = 0.32, LAND_S = 0.36;
  for (let guard = 0; guard < 48 * 30; guard += 1) {
    let pose = glidePose, up = RIDE_DECK, mark: string | undefined;
    if (phase === "glide") {
      v = Math.max(0, v - FRICTION * dt);
      // the ollie starts so the arc's middle is over the obstacle (pop + half the air time ahead)
      if (ollie && !landed && x + v * (CROUCH_S + Math.sqrt(2 * popUp(v) / G)) >= overAt) { phase = "crouch"; pt = 0; }
      else if (stop && (x + 1.3 * (v * v) / (2 * BRAKE) >= stopAt || (v < 0.4 && (!ollie || landed)))) { phase = "brake"; pt = 0; }
    }
    if (phase === "crouch") {
      const u = pt / CROUCH_S; pose = lerpPose(glidePose, CROUCH, smooth(u));
      v = Math.max(0, v - FRICTION * dt);
      if (pt >= CROUCH_S) { phase = "air"; pt = 0; vAir = Math.sqrt(2 * G * popUp(v)); airT = 2 * vAir / G; mark = "pop"; }
    }
    if (phase === "air") {
      const u = pt / airT, h = vAir * pt - 0.5 * G * pt * pt;
      pose = u < 0.25 ? lerpPose(CROUCH, POP, smooth(u / 0.25)) : u < 0.5 ? lerpPose(POP, AIR, smooth((u - 0.25) / 0.25)) : u < 0.85 ? lerpPose(AIR, REACH, smooth((u - 0.5) / 0.35)) : REACH;
      up = RIDE_DECK + Math.max(0, h);
      if (pt >= airT) { phase = "land"; pt = 0; mark = "land"; v *= 0.88; landed = true; } // the landing costs some speed
    }
    if (phase === "land") {
      const u = pt / LAND_S; pose = u < 0.4 ? lerpPose(REACH, CROUCH, smooth(u / 0.4)) : lerpPose(CROUCH, glidePose, smooth((u - 0.4) / 0.6));
      // (the legs absorb fast; the arms float down slowly over the whole landing — no snap of the hands)
      const arms = lerpPose(REACH, glidePose, smooth(u));
      pose = { ...pose, lShoulder: arms.lShoulder, lElbow: arms.lElbow, rShoulder: arms.rShoulder, rElbow: arms.rElbow };
      v = Math.max(0, v - FRICTION * dt);
      if (pt >= LAND_S) { phase = "glide"; pt = 0; }
    }
    if (phase === "brake") {
      // the back foot goes down (0.25 s) and DRAGS: the friction grows as it presses (no dead stop), the speed falls visibly faster
      const down = smooth(pt / DRAG_IN);
      v = Math.max(0, v - BRAKE * dt * (0.25 + 0.75 * down) * (v > 0.25 ? 1 : 0.5 + 2 * v));
      pose = backFootDown(lerpPose(glidePose, brakePose, down), RIDE_DECK * down);
      if (pt === 0) mark = "drag";
      if (v <= 0.01) { v = 0; out.push({ t, x, v, pose, up, mark: "stopped", drag: true }); t += dt; break; }
    }
    out.push({ t, x, v, pose: phase === "glide" ? glidePose : pose, up, mark, drag: phase === "brake" });
    x += v * dt; t += dt; pt += dt;
    if (!stop && phase === "glide" && (x >= want / H || v < 0.4) && (!ollie || landed)) break;
  }
  // settle into the stopped pose
  const last = out[out.length - 1]!;
  const tEnd0 = t;
  if (stop) for (; t < tEnd0 + 0.5 - 1e-9; t += dt) out.push({ t, x, v: 0, pose: backFootDown(lerpPose(last.pose, stopPose, smooth((t - tEnd0) / 0.5)), RIDE_DECK), up: RIDE_DECK, drag: true });
  // --- keys every other sample (24 a second); the pose's back foot is kept on the deck when not pushing ---
  const keys: CharacterKey[] = [];
  const marks: Record<string, number> = {};
  const g0 = rideGeometry(true), grip = { x: g0.gripX, y: g0.gripY };
  out.forEach((s, i) => {
    if (s.mark) marks[s.mark] = start.t + s.t;
    if (i % 2 !== 0 && i !== out.length - 1) return;
    const legs = s.push || s.drag ? s.pose : backFootDown(s.pose, 0);
    const pose = clampPose(scooter ? armsTo(legs, grip) : legs).pose;
    keys.push({ t: start.t + s.t, x: start.x + sign * s.x * H, pose, lift: liftFor(pose, s.up, H), contacts: [], facing: start.facing, ease: "linear", xEase: "linear", liftEase: "linear" });
  });
  // STEP OFF (Oct 14, the scooter's foot popped when the next move began on the ground): a stopped ride ends by stepping off the
  // front of the board — the front foot steps down onto the ground ahead of it, the back foot follows — and the board stays where it
  // stopped (autoEffects.ts puts it there from the mark `off`). The next move starts standing on the ground.
  if (stop) {
    const a = keys[keys.length - 1]!;
    marks.off = a.t;
    const fa = skel(a.pose), footB = a.x + sign * (fa.lFoot.x + 0.32) * H;
    const poseB = clampPose(backFootDown({ ...STAND, lean: 4, lHip: 26, lKnee: 6, rHip: -26, rKnee: 20, lShoulder: 20, rShoulder: -14 }, -RIDE_DECK)).pose;
    const fb = skel(poseB), fs = skel(STAND);
    keys.push({ t: a.t + 0.5, x: footB - sign * fb.lFoot.x * H, pose: poseB, lift: liftFor(poseB, 0, H), contacts: ["lFoot"], facing: start.facing, ease: "inOut", xEase: "inOut", liftEase: "inOut" });
    keys.push({ t: a.t + 1.0, x: footB - sign * fs.lFoot.x * H, pose: STAND, lift: 0, contacts: ["lFoot", "rFoot"], facing: start.facing });
    // (the ease of the segment INTO the step comes from the last ride key)
    a.ease = "inOut"; a.xEase = "inOut"; a.liftEase = "inOut";
    marks.stepped = a.t + 1.0;
  }
  const end = keys[keys.length - 1]!;
  return { keys, end: { t: end.t, x: end.x, facing: start.facing, pose: end.pose }, marks };
}

// Where the board goes (for autoEffects.ts): its middle between the feet of the glide stance, and (scooter) the grip — the
// hands — measured from the front foot, x H forward / down.
export function rideGeometry(scooter: boolean) {
  const s = skel(backFootDown(GLIDE(scooter), 0));
  return { mid: (s.rFoot.x - s.lFoot.x) / 2, gripX: (s.lHand.x + s.rHand.x) / 2 - s.lFoot.x, gripY: (s.lHand.y + s.rHand.y) / 2 - s.lFoot.y };
}

// Where the board stays after the rider steps off (autoEffects.ts): its middle x and the deck-top y, from the ride's last key on the
// deck (the key at the mark `off`).
export function boardSpot(key: CharacterKey, H: number, groundY: number, scooter: boolean) {
  const sign = forwardSign(key.facing ?? "right"), f = skel(key.pose);
  return { x: key.x + sign * (f.lFoot.x + rideGeometry(scooter).mid) * H, y: groundY - RIDE_DECK * H };
}
