// TUMBLE (Oct 14, Arthur: "a stick figure falls down a cliff: he falls on one stone, bounces off the rock, goes right, falls on the
// next stone… left, right… until he hits the ground in the pit — no weird animation").
// PRINCIPLE: A FALLING BODY OBEYS GRAVITY AND HITS WHAT IS IN ITS WAY. Over an edge, the body flies on a real ballistic path
// (gravity, it keeps its sideways speed) and every surface under it — a rock or ledge on a cliff face, a step, a roof, a table, a
// platform, the floor of a pit — catches it: the body's LOWEST POINT touches that surface's top (a real contact, never through
// it), it crumples a little (the impact), bounces off losing speed, and goes off the side the hit was on (hit the rock's left half
// → it goes left; near the middle → back the other way: the zig-zag), turning over in the air the way it travels. A pit's walls
// throw it back in. The last hit is the lowest floor: smaller bounces, it slides to a stop, the turn (which follows the way it travels) eases to
// lying on its face or its back, and it LIES there (follow with `getUp`, which then gets up down there). General for every fall off anything.
import type { CharacterKey } from "../engine.ts";
import { HEAD_RADIUS, STAND, withPose, type PoseAngles } from "../rig.ts";
import { forwardKinematics } from "../pose.ts";
import { FALL_GRAVITY, FALLEN_BACK, FALLEN_FORWARD } from "./fall.ts";
import { forwardSign, lerpPose, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { safePose } from "./squat.ts";
import { holdPiece, sequence } from "./sequence.ts";
import { restSlope } from "./tumbleScene.ts";
import { registerTumbleForRagdoll } from "./ragdoll.ts"; // (the active ragdoll for falls — ragdoll.ts, behind `ragdollFalls.on`)

// A surface that catches a falling body: its top `top` (px ABOVE the scene's ground line; negative = down in a pit) from x `left`
// to `right`. A pit: its floor `bottom` (negative) between its walls `left` and `right`.
export type TumbleSurface = { left: number; right: number; top: number; cx?: number };
// (`floorAt(x)` = the DRAWN floor's top under a body lying at x — tumbleScene.ts reads it from the pit drawing; `bottom` = fallback)
// (`standAt(x)` = the drawn floor's top under FEET standing at x — narrower than a lying body: a figure that gets up stands on the floor under its feet)
export type TumblePit = { left: number; right: number; bottom: number; floorAt?: (x: number) => number; standAt?: (x: number) => number; wallAt?: (side: -1 | 1, y: number) => number };
export type TumbleParams = { lean0?: number; turn0?: number; speed?: number; surfaces?: TumbleSurface[]; pits?: TumblePit[]; level?: number; page?: [number, number] };

export const TUMBLE_BOUNCE = 0.42; // a body keeps this much of its downward speed, bouncing up off a hard surface
export const TUMBLE_SIDE_KEEP = 0.75; // ...and this much of its sideways speed
// SPIN FOLLOWS MOTION (Oct 14) + REAL FALLING BODIES (Oct 15, Arthur: "a fall, boom, then he does a forward flip, boom, maybe one
// last forward flip, boom — his legs and arms can't just be SHAKING… falling down the stairs there are little front flips… going
// right you flip right, going left the same"). A falling body is ONE RIGID THING that turns: what turns it is the fall itself.
// It keeps its turn speed in the air (nothing to push on), and only a HIT changes it: on contact the turn stops (the impact), and the
// bounce gives it a new one, the way it now travels — going the way it faces = FRONT flips, going backwards = BACK flips (never
// against its travel). How much it turns in one flight comes from how fast and how long it flies (a long drop = a full flip or more,
// a stair step = a little part-flip), and it is timed so the body comes down FLAT — on its back or its front — never head first: each
// landing is a clear "boom". Angles are the torso's tilt from upright, + = toward the way it faces (unbounded: 360 = one full flip).
const TURN_PER_SPEED = 160; // degrees per second of turn for each body height per second of travel
const TURN_MIN = 90, TURN_MAX = 420; // degrees per second (the natural turn speed from the travel: a tumbling body turns about once a second)
const TURN_FASTEST = 720; // degrees per second: a tucked body never turns faster than this
const CRUMPLE_S = 0.05; // seconds: the crumple from a hit peaks this fast, then flows off (the contact rule: quick)
export const TUMBLE_CONTACT_S = 0.07; // seconds: the body touches each rock — impact + crumple — and is off again (≤ ~0.1 s)
export const TUMBLE_FLOOR_CONTACT_S = 0.05; // seconds: a bounce off the floor touches it too (at least one picture ON the floor)
export const TUMBLE_FLOOR_BOUNCE = 0.22; // the floor gives back this much of the downward speed (a body is soft: a small, quick bounce)
// (the resting lean of each lying pose: the turn settles to the nearer one)
const LIE_FRONT = FALLEN_FORWARD.lean, LIE_BACK = FALLEN_BACK.lean;
// The lying orientation (front or back, any number of turns) nearest a total turn `lean`.
export function nearestLying(lean: number) {
  const k = (v: number) => v + 360 * Math.round((lean - v) / 360);
  const f = k(LIE_FRONT), b = k(LIE_BACK);
  return Math.abs(f - lean) <= Math.abs(b - lean) ? { lean: f, front: true } : { lean: b, front: false };
}
// HOW MUCH ONE FLIGHT TURNS (the rule above): `from` = the turn at take-off, `way` = +1 travelling the way it faces (front flips),
// -1 backwards (back flips), `natural` = degrees its speed would turn it in this flight, `T` its length (s). It lands flat (front or
// back) nearest that natural amount, never turning against the travel and never faster than a tucked body can.
// TURNS COME FROM THE FALL (Oct 15, Arthur: "into the pit he does two front flips from five feet — not natural; two flips would be
// from a very high place"). A body only turns over as much as its time in the air lets it: how far a flight DROPS caps its turn
// (a ~1-height drop — about five feet — turns well under half a turn: it lands on its face or back), and the whole fall's drop caps
// the sum of all its flips (a real cliff: one to two turns at most, never more). Degrees for a drop of `h` body heights:
export const turnCapForDrop = (h: number) => 165 * Math.sqrt(Math.max(0, h));
export const totalTurnCap = (h: number) => 360 * Math.min(2, Math.max(0.4, h / 4));
export const ROLL_MAX_DROP = 0.8; // body heights: a drop this small with forward speed is a roll over the edge (a step), not a flight
export const ROLL_RADIUS = 0.25; // body heights: a curled body rolls like a wheel this big
export const rollTurn = (travelH: number) => (180 / Math.PI) * (travelH / ROLL_RADIUS);
export function flightTurn(from: number, way: number, natural: number, T: number, cap = Infinity) {
  if (T <= 0 || way === 0) return 0;
  const most = Math.min(TURN_FASTEST * T, cap), least = Math.min(0.4 * natural, most);
  let best: number | undefined;
  for (let m = -3; m <= 4; m += 1) for (const v of [LIE_FRONT, LIE_BACK]) {
    const c = v + 360 * m + 360 * Math.round(from / 360), amt = way * (c - from);
    if (amt < least - 1e-9 || amt > most) continue;
    if (best === undefined || Math.abs(amt - natural) < Math.abs(best - natural)) best = amt;
  }
  // (capped by the drop: no flat landing in that range → the nearest flat landing it CAN reach — less turn, never past the cap
  // when one is in reach; it still comes down flat, never upright or head first)
  if (best === undefined) for (let m = -3; m <= 4; m += 1) for (const v of [LIE_FRONT, LIE_BACK]) {
    const c = v + 360 * m + 360 * Math.round(from / 360), amt = way * (c - from);
    if (amt < 0 || amt > most + 1e-9) continue;
    if (best === undefined || Math.abs(amt - Math.min(natural, most)) < Math.abs(best - Math.min(natural, most))) best = amt;
  }
  return way * (best ?? Math.min(natural, most));
}

const AIR: PoseAngles = safePose(withPose(STAND, { lean: 12, head: -12, lShoulder: 150, rShoulder: 115, lElbow: 35, rElbow: 45, lHip: 35, rHip: -12, lKnee: 45, rKnee: 25 }));
const CRUMPLED: PoseAngles = safePose(withPose(STAND, { lean: 40, head: 22, lShoulder: 70, rShoulder: 45, lElbow: 95, rElbow: 105, lHip: 80, rHip: 55, lKnee: 110, rKnee: 95 }));
// (IN THE AIR, TURNING: knees and arms pulled in — a body turning over curls up; AT THE IMPACT: it opens and braces — arms and legs
// out to meet the ground — then crumples)
const TUCK: PoseAngles = safePose(withPose(STAND, { lean: 38, head: 25, lShoulder: 75, rShoulder: 55, lElbow: 115, rElbow: 120, lHip: 110, rHip: 95, lKnee: 125, rKnee: 120 }));
// (knees still bent: the limbs that meet the ground first are not stilts — the body keeps coming down into the crumple, no hop up)
const BRACE: PoseAngles = safePose(withPose(STAND, { lean: 30, head: 12, lShoulder: 110, rShoulder: 80, lElbow: 30, rElbow: 35, lHip: 70, rHip: 50, lKnee: 75, rKnee: 85 }));
// FLUNG BY THE SPIN (Oct 15, Arthur: "the arms are supposed to be flying around from that weight and spinning, rotating, impact —
// not super weird, but not so stiff like now"): a turning body throws its arms and legs OUT (centrifugal) — splayed, elbows and
// knees opening — instead of a tight ball.
const FLUNG: PoseAngles = safePose(withPose(STAND, { lean: 20, head: -6, lShoulder: 135, rShoulder: -55, lElbow: 25, rElbow: 30, lHip: 50, rHip: -25, lKnee: 35, rKnee: 20 }));
// LIMBS LAG THE SPIN (secondary motion, every turning body): arms and legs have weight, so they trail the body's turn — the body
// turns, the limbs follow a moment later (a low-pass of the turn, `LIMB_LAG_S`), swinging back past the body when it stops.
// The faster it spins, the looser and wider they fly (`spinLoose`); before each impact they brace. Natural, never random flailing.
export const LIMB_LAG_S = 0.09;
export const spinLoose = (degPerS: number) => Math.min(1, Math.abs(degPerS) / 360);
export function limbsWithSpin(base: PoseAngles, lag: number, loose: number): PoseAngles {
  const l = Math.max(-45, Math.min(45, lag));
  const p = lerpPose(base, FLUNG, 0.8 * loose);
  return safePose({ ...p, lShoulder: p.lShoulder - l, rShoulder: p.rShoulder - 0.8 * l, lHip: p.lHip - 0.5 * l, rHip: p.rHip - 0.4 * l, lElbow: p.lElbow + 0.25 * Math.abs(l), rElbow: p.rElbow + 0.25 * Math.abs(l), head: p.head - 0.3 * l });
}
const TIP: PoseAngles = safePose(withPose(STAND, { lean: 32, head: -18, lShoulder: 165, rShoulder: 125, lElbow: 25, rElbow: 40, lHip: 18, rHip: -8, lKnee: 20, rKnee: 8 }));

// The tumble's path, step by step (px; y = height of the body's lowest point above the ground line). Returns samples every 1/24 s.
export function tumblePath(x0: number, dir: 1 | -1, H: number, params: TumbleParams) {
  const g = FALL_GRAVITY * H, dt = 1 / 480;
  const surfaces = params.surfaces ?? [], pits = params.pits ?? [];
  const [lo, hi] = params.page ?? [-Infinity, Infinity];
  const pitAt = (x: number) => pits.find((p) => x > p.left && x < p.right);
  // The highest surface top under x that is not above `y` (what would catch a body at height y there).
  const under = (x: number, y: number) => {
    let best: { top: number; s?: TumbleSurface } = { top: ((p) => (p ? (p.floorAt ? p.floorAt(x) : p.bottom) : 0))(pitAt(x)) };
    for (const s of surfaces) if (x >= s.left - 0.08 * H && x <= s.right + 0.08 * H && s.top <= y + 1e-6 && s.top > best.top) best = { top: s.top, s };
    return best;
  };
  let x = x0, y = params.level ?? 0, vx = dir * Math.max(0.35 * H, Math.abs(params.speed ?? 0.9 * H)), vy = 0, t = 0; // (over the edge it starts going down at once: no hop up, no float at the top)
  // (the torso's tilt and turn speed, facing-relative; it starts where the tip over the edge left it, turning on at the tip's speed)
  // (the turn is worked out after the path — it never changes where the body goes: see the second pass below)
  let lastHit = -1, lastS: TumbleSurface | undefined, sliding = false, still = -1, slideAt = -1;
  const out: { t: number; x: number; y: number; lean: number; crumple: number; down: number; contact: boolean; side: number }[] = [];
  const hits: number[] = [];
  // (ON THE ROCK: until `holdUntil` the body lies on the rock top, still; then the bounce it got from the hit (`pending`) sends it off)
  // (ENERGY: a bounce never goes higher than the body fell from — `apex` = the highest point since the last hit)
  let apex = y, hitK = 1; // (hitK: how hard the last hit was — a soft touch barely crumples: no pop)
  let floorAt = -1, holdUntil = -1, pending: { vx: number; vy: number } | undefined, side = dir as number;
  let next = 0;
  while (t < 12) {
    if (t >= next - 1e-9) {
      // (the crumple comes on fast but never in one jump: a quick swell into the hit, then it eases off — smooth law)
      out.push({ t, x, y, lean: 0, crumple: lastHit < 0 ? 0 : hitK * 0.6 * ((t - lastHit) / CRUMPLE_S) * Math.exp(1 - (t - lastHit) / CRUMPLE_S), down: sliding ? Math.min(1, (t - (still < 0 ? t : still)) / 0.35) : 0, contact: t < holdUntil, side });
      next += 1 / 24;
      if (still >= 0 && t - still > 0.9) break;
    }
    t += dt;
    if (t < holdUntil) continue;
    if (pending) { vx = pending.vx; vy = pending.vy; pending = undefined; }
    if (!sliding) vy -= g * dt;
    const px = x;
    x += vx * dt; y += vy * dt; apex = Math.max(apex, y);
    // (a pit's walls throw the body back in; the page edges too)
    for (const p of pits) {
      // (the walls as DRAWN at this depth — tumbleScene.ts `wallAt`; a pit's walls lean in going down)
      const L = (p.wallAt ? p.wallAt(-1, y) : p.left) + 0.12 * H, R = (p.wallAt ? p.wallAt(1, y) : p.right) - 0.12 * H;
      if (y < -0.02 * H && px >= L - 2 && x < L && vx < 0) { x = L; vx = -vx * 0.5; }
      if (y < -0.02 * H && px <= R + 2 && x > R && vx > 0) { x = R; vx = -vx * 0.5; }
    }
    if (x < lo && vx < 0) { x = lo; vx = -vx * 0.5; }
    if (x > hi && vx > 0) { x = hi; vx = -vx * 0.5; }
    const { top, s } = under(x, y - vy * dt);
    if (y <= top) {
      y = top;
      if (sliding) {
        vx *= Math.exp(-4 * dt);
        // (NOT UNDER A ROCK: a body that would come to rest right under a low rock or ledge rolls on until it is clear of it, so it
        // can get up on open floor)
        const over = surfaces.find((q) => q.top > y + 0.05 * H && q.top < y + 1.2 * H && x > q.left - 0.6 * H && x < q.right + 0.6 * H);
        if (over) { const away = x >= (over.cx ?? (over.left + over.right) / 2) ? 1 : -1; const room = pits.find((p) => x > p.left && x < p.right); const blockedAway = room && (away > 0 ? over.right + 0.9 * H > room.right : over.left - 0.9 * H < room.left); const d = blockedAway ? -away : away; vx = d * Math.max(Math.abs(vx), 0.5 * H); still = t; }
        continue;
      }
      // (STILL ON THE EDGE: a body not yet past it keeps going at its speed along the top until it goes over — it never stops there)
      if (!hits.length && floorAt < 0 && Math.abs(top - (params.level ?? 0)) < 1e-6 && t < 1.5 && pits.some((p) => { const e = dir > 0 ? p.left : p.right; return dir * (e - x) > 0 && dir * (e - x) < H; })) { vy = 0; continue; }
      const down = -vy;
      hitK = Math.min(1, Math.max(0, down / (1.5 * H)));
      hits.push(t);
      lastHit = t;
      if (s && down > 0.6 * H) {
        // A ROCK OR LEDGE: bounce up and off the side it was hit on (the middle → back the way it came: the zig-zag).
        const cx = s.cx ?? (s.left + s.right) / 2, half = Math.max(1, (s.right - s.left) / 2);
        let off: 1 | -1 = Math.abs(x - cx) < 0.25 * half || s === lastS ? (vx > 0 ? -1 : 1) : x > cx ? 1 : -1;
        // (a rock sticking out of a wall can't be left on the wall's side: it goes off its open side)
        // (...nor into the side of a higher one right beside it — the riser of the step above: stairs go on DOWN, never back in)
        const riser = (d: 1 | -1) => surfaces.some((q) => q !== s && q.top > s.top + 0.1 * H && (d < 0 ? q.right > s.left - 0.3 * H && q.right <= s.right + 1 : q.left < s.right + 0.3 * H && q.left >= s.left - 1));
        const blocked = (d: 1 | -1) => riser(d) || pits.some((p) => (d < 0 ? s.left - 0.15 * H < p.left + 0.12 * H && cx > p.left : s.right + 0.15 * H > p.right - 0.12 * H && cx < p.right)) || (d < 0 ? s.left - 0.15 * H < lo : s.right + 0.15 * H > hi);
        if (blocked(off) && !blocked(-off as 1 | -1)) off = -off as 1 | -1;
        vy = Math.max(0.9 * H, down * TUMBLE_BOUNCE);
        const edgeOf = (d: number) => (d > 0 ? s.right + 0.15 * H - x : x - (s.left - 0.15 * H));
        // DOWN ONTO THE NEXT THING (stairs, rocks, ledges): a body bounced off a surface falls onto what is below it on that side — the
        // highest surface lower down that it can reach past this one's edge. Nothing below on the side it was hit on → the other side.
        const nextOn = (d: number) => surfaces.filter((q) => q !== s && q.top < s.top - 0.15 * H && !blocked(d as 1 | -1) && d * ((d > 0 ? q.right : q.left) - (d > 0 ? s.right : s.left)) > 0.1 * H && Math.abs((q.cx ?? (q.left + q.right) / 2) - x) < 3.5 * H).sort((m, n) => n.top - m.top)[0];
        const target = nextOn(off) ?? (nextOn(-off) ? (off = -off as 1 | -1, nextOn(off)) : undefined);
        side = off;
        let want = Math.abs(vx) * TUMBLE_SIDE_KEEP;
        if (target) {
          // aim at the middle of its open part (past this one's edge): it lands ON it, not beside it
          const qc = target.cx ?? (target.left + target.right) / 2, open = off > 0 ? Math.max(qc, s.right + 0.3 * H) : Math.min(qc, s.left - 0.3 * H);
          // (to clear this one's edge AND come down on the next: it bounces HIGHER, not faster — a faster bounce would fly past it)
          // (solved, not guessed: the lowest bounce whose flight both clears the edge E and comes down on the target D away)
          const D = Math.abs(open - x), k = Math.min(0.95, (1.1 * edgeOf(off)) / Math.max(1, D)), drop = s.top - target.top;
          if (k > 0) vy = Math.min(2.6 * H, Math.max(vy, k * Math.sqrt((g * drop) / (2 * (1 - k)))));
          want = D / ((vy + Math.sqrt(vy * vy + 2 * g * drop)) / g);
        }
        // (a bounce loses energy: it rises at most ~a third of what it fell — never back up past where it came from)
        vy = Math.min(vy, Math.sqrt(2 * g * Math.max(0.15 * H, 0.35 * (apex - y))));
        if (target) { const drop = s.top - target.top, qc = target.cx ?? (target.left + target.right) / 2, open = off > 0 ? Math.max(qc, s.right + 0.3 * H) : Math.min(qc, s.left - 0.3 * H); want = Math.abs(open - x) / ((vy + Math.sqrt(vy * vy + 2 * g * drop)) / g); }
        vx = off * Math.min(3 * H, Math.max(want, edgeOf(off) / ((2 * vy) / g)));
        apex = y;
        lastS = s;
        // (it lands ON the rock and stays a moment — crumpled — before the bounce takes it off: a real contact, not a graze)
        pending = { vx, vy }; vx = 0; vy = 0; holdUntil = t + TUMBLE_CONTACT_S; next = Math.min(next, t); // (a picture AT the hit)
      } else if (down > 2 * H) {
        // THE FLOOR: a smaller bounce, it keeps going the way it went.
        // (a real contact: it is ON the floor for a moment — never a bounce that turns around in the air between two pictures)
        pending = { vx: vx * 0.5, vy: down * TUMBLE_FLOOR_BOUNCE }; vx = 0; vy = 0; holdUntil = t + TUMBLE_FLOOR_CONTACT_S; next = Math.min(next, t);
        lastS = undefined; if (floorAt < 0) floorAt = t;
      } else {
        // Down for good: it slides to a stop.
        vy = 0; sliding = true; still = t; slideAt = t; next = Math.min(next, t); if (floorAt < 0) floorAt = t;
      }
    }
  }
  // SECOND PASS — THE TURN (the rule at the top): flights are the times between leaving one thing and hitting the next. On contact
  // the turn holds (the impact); in a flight it turns at ONE steady speed (kept in the air) by flightTurn; once down for good it
  // eases onto its front or back, whichever is nearer.
  const hold = (h: number) => { let e = h; for (const q of out) { if (q.t < h - 1e-9) continue; if (!q.contact) break; e = q.t; } return e; }; // (the end of THIS contact)
  const flights: { from: number; to: number }[] = [];
  let off = 0;
  for (const h of hits) { if (h > off + 1e-6) flights.push({ from: off, to: h }); off = hold(h) + 1e-6; if (h >= slideAt - 1e-9 && slideAt >= 0) break; }
  const xAt = (tt: number) => { let best = out[0]; for (const q of out) if (Math.abs(q.t - tt) < Math.abs(best.t - tt)) best = q; return best.x; };
  let lean = params.lean0 ?? 0;
  // (the drop of each flight = its highest point minus where it lands; the whole fall's drop = start height minus the lowest point)
  const yAt = (tt: number) => { let best = out[0]; for (const q of out) if (Math.abs(q.t - tt) < Math.abs(best.t - tt)) best = q; return best.y; };
  const dropOf = (f: { from: number; to: number }) => (Math.max(...out.filter((q) => q.t >= f.from - 1e-9 && q.t <= f.to + 1e-9).map((q) => q.y), yAt(f.from)) - yAt(f.to)) / H;
  let budget = totalTurnCap(((params.level ?? 0) - Math.min(...out.map((q) => q.y))) / H);
  const plans = flights.map((f, i) => {
    const T = f.to - f.from, dx = xAt(f.to) - xAt(f.from), way = Math.abs(dx) < 0.05 * H ? (i === 0 ? 1 : 0) : Math.sign(dx * dir);
    // (the FIRST drop turns only as fast as the tip over the edge set it turning — angular momentum kept in the air: a fall, then
    // "boom"; after that each hit turns the body's sideways speed into its new turn: the flips come off the impacts)
    const natural = (i === 0 ? Math.min(TURN_MAX, Math.max(TURN_MIN, params.turn0 ?? TURN_MIN)) : Math.min(TURN_MAX, Math.max(TURN_MIN, (Math.abs(dx) / Math.max(T, 1e-3) / H) * TURN_PER_SPEED))) * T;
    // ROLL OVER THE EDGE (Oct 15, Arthur: "falling down the stairs there are little front flips"): a SHORT drop (a step) taken with
    // forward speed is not a free flight — the body rolls over the step's edge on its momentum, like a wheel: the turn comes from how
    // far it travels (`ROLL_RADIUS` heights per radian), not from the drop, and does not use up the free-flight budget. Free flights
    // (a cliff, a pit) keep the drop caps.
    const d = dropOf(f), roll = i > 0 && way > 0 && d < ROLL_MAX_DROP && Math.abs(dx) > 0.3 * H;
    const cap = roll ? rollTurn(Math.abs(dx) / H) : Math.max(0, Math.min(turnCapForDrop(d), budget));
    const amt = flightTurn(lean, way || 1, roll ? Math.max(natural, 0.6 * cap) : natural, T, cap), p = { ...f, from0: lean, amt };
    lean += amt; if (!roll) budget -= Math.abs(amt);
    return p;
  });
  let restFrom: { t: number; lean: number } | undefined;
  for (const q of out) {
    const f = plans.find((p) => q.t >= p.from - 1e-9 && q.t <= p.to + 1e-9);
    const before = plans.filter((p) => p.to <= q.t + 1e-9).pop();
    // (off a hit the new turn comes on over ~0.1 s — the push of the bounce — never a reversal from one picture to the next; then steady)
    const prog = (p: (typeof plans)[number], tt: number) => { const T = p.to - p.from, r = p.from > 1e-6 ? Math.min(0.1, T / 2) : 0, d = tt - p.from; return (d < r ? (d * d) / (2 * r) : d - r / 2) / Math.max(1e-6, T - r / 2); };
    q.lean = f ? f.from0 + f.amt * prog(f, q.t) : before ? before.from0 + before.amt : (params.lean0 ?? 0);
    if (slideAt >= 0 && q.t >= slideAt - 1e-9) {
      restFrom ??= { t: q.t, lean: q.lean };
      const r = nearestLying(restFrom.lean).lean;
      q.lean = restFrom.lean + (r - restFrom.lean) * smooth((q.t - restFrom.t) / 0.25);
    }
  }
  return { samples: out, hits, floorAt: floorAt < 0 ? t : floorAt, slideAt: slideAt < 0 ? floorAt : slideAt };
}

const smooth = (k: number) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };

// A figure stands at an edge and tumbles off it (`speed` px/s outward, default ~0.9 heights/s; `surfaces` / `pits` filled in by the
// planner from the scene). BUILT FROM LEARNED PIECES (sequence.ts): tip over the edge → [fly (fall / blownAway flight) → land ON the
// rock, lying on it, crumpled (getHit / slammed impact) → push off the side it landed on] for every rock → land on the floor → lie
// still a moment (fallDown) — then the plan's `getUp` gets up HURT (slow, the hurt timing). Marks: `edge` (over the edge), `hit1`,
// `hit2`… (each impact), `land` (the floor), `down` (lying still). The output's `level` = its resting height (px from the ground line).
export function tumble(start: Stance, params: TumbleParams, settings: MoveSettings): MoveOutput & { level: number; standAt?: (x: number) => number } {
  const H = settings.height, dir = forwardSign(start.facing) as 1 | -1;
  const level = params.level ?? 0;
  // THE EDGE: where what it stands on ends, the way it faces — a pit's near wall, or the end of the rock / roof it stands on; the hips
  // go just past it. Nothing near: it tips where it is.
  const support = level > 0.02 * H ? (params.surfaces ?? []).find((s) => Math.abs(s.top - level) < 0.05 * H && start.x >= s.left - 0.1 * H && start.x <= s.right + 0.1 * H) : undefined;
  const wall = support ? (dir > 0 ? support.right : support.left) : (params.pits ?? []).map((p) => (dir > 0 ? p.left : p.right)).filter((e) => dir * (e - start.x) > -0.1 * H && dir * (e - start.x) < 1.2 * H).sort((a, b) => Math.abs(a - start.x) - Math.abs(b - start.x))[0];
  const over = wall === undefined ? start.x + dir * 0.12 * H : wall + dir * 0.06 * H;
  // NO STOP BEFORE THE FALL (Arthur: "he walks and trips, like a runner trips"): a walk or run hands its speed over (plan.ts
  // momentum, as for a trip into `fall`): the body keeps going at that speed over the edge, pitching forward as it goes (the tip is
  // as long as the last bit of ground takes at that speed). From standing it leans out over its toes first.
  const moving = params.speed !== undefined && params.speed > 0.2 * H;
  const dist = Math.abs(over - start.x);
  const tipT = moving ? Math.min(0.5, Math.max(0.18, dist / params.speed!)) : Math.max(0.3, dist / (0.9 * H));
  const tipSpeed = moving ? Math.max(params.speed!, dist / tipT) : 2 * dist / tipT;
  // (the turn goes on at the speed the tip gave it — an "in" ease ends at about twice its average speed)
  const turn0 = Math.min(TURN_MAX, (2 * (TIP.lean - start.pose.lean)) / tipT);
  const { samples, hits, floorAt, slideAt } = tumblePath(over, dir, H, { ...params, speed: tipSpeed, lean0: TIP.lean, turn0, level, surfaces: (params.surfaces ?? []).filter((s) => s !== support) });
  const last = samples[samples.length - 1];
  // WHERE IT COMES TO REST it lies the way the turn left it: on its face (it went forward: the faceplant) or on its back.
  const FINAL = nearestLying(last.lean).front ? FALLEN_FORWARD : FALLEN_BACK;

  // THE WHOLE BODY TURNS (engine.ts `spin`, about its middle): the pose keeps its own shape (its own lean), the spin adds the rest of
  // the turn — so a flip is the body turning over as one piece. (With a spin the engine stands the body on its lowest point, hands
  // and elbows included: it lands ON an arm, never through the rock or floor.) Spin + = clockwise on the page = forward facing right.
  const keyAt = (s: (typeof samples)[number], pose: PoseAngles): CharacterKey => ({ t: start.t + tipT + s.t, x: s.x, pose, facing: start.facing, lift: s.y, contacts: [], ease: "linear", xEase: "linear", liftEase: "linear", spin: dir * (s.lean - pose.lean), spinEase: "linear" });
  const marks: Record<string, number> = {};
  const out = sequence(start, [
    // 1. OVER THE EDGE (fall.ts' trip): pitching forward, arms flung up — at the speed it came with.
    { name: "edge", run: (at) => ({ keys: [
      { t: at.t, x: at.x, pose: at.pose, facing: at.facing, lift: level, contacts: moving ? [] : ["lFoot", "rFoot"], ease: "in", xEase: moving ? "linear" : "in", liftEase: "linear" },
      { t: at.t + tipT, x: over, pose: TIP, facing: at.facing, lift: level, contacts: [], ease: "linear", xEase: "linear", liftEase: "linear" },
    ], end: { ...at, t: at.t + tipT, x: over, pose: TIP }, marks: {} }) },
    // 2. FLY → TOUCH EACH ROCK (a quick crumple) → OFF AGAIN, then the floor. The path decides where AND how the body is turned (the
    // turn follows the travel); the pieces decide the limbs: flung in the air (blownAway), curled by each hit (getHit), then lying.
    { name: "fall", run: (at) => {
      const keys: CharacterKey[] = [];
      // (the limbs' lagging turn: a low-pass of the body's turn; lag = how far the limbs trail it; spin = its speed)
      let lp = samples[0].lean;
      const lagOf = samples.map((s, i) => { const dt = i ? s.t - samples[i - 1].t : 1 / 24; lp += (s.lean - lp) * (1 - Math.exp(-dt / LIMB_LAG_S)); return { lag: s.lean - lp, spin: i ? (s.lean - samples[i - 1].lean) / Math.max(1e-3, dt) : 0 }; });
      // (the impact reaches the flung limbs over a few pictures — weight: a low-pass of the crumple — never a one-picture snap in)
      let cr = 0;
      const crOf = samples.map((s, i) => { const dt = i ? s.t - samples[i - 1].t : 1 / 24; cr += (Math.min(1, s.crumple * 1.6) - cr) * (1 - Math.exp(-dt / 0.06)); return cr; });
      for (const [si, s] of samples.entries()) {
        if (si === 0) continue;
        // THE LIMBS DO WHAT THE FALL MAKES THEM DO (no shaking, no random flail): off the edge they fling up (AIR); turning in the air
        // they pull in (TUCK) — a body turning over curls up; just before each hit they open and brace (BRACE), the hit crumples them
        // (CRUMPLED, quick), and they tuck again as the bounce turns it over. Down for good, they settle into lying.
        const prev = hits.filter((h) => h <= s.t + 1e-9).pop(), nextHit = hits.find((h) => h > s.t + 1e-9);
        let limbs = lerpPose(TIP, AIR, smooth(s.t / 0.25));
        const tuck = prev === undefined ? smooth((s.t - 0.3) / 0.3) : prev >= slideAt - 1e-9 ? 0 : smooth((s.t - prev - TUMBLE_CONTACT_S) / 0.25);
        // (a tiny hop — a short flight between two touches — is too short to curl up and open again: the limbs just ride it, no twitch)
        const gapOf = (h?: number) => (h === undefined ? Infinity : (hits.filter((q) => q < h - 1e-9).pop() ?? -Infinity));
        const hop = nextHit === undefined ? 1 : smooth((nextHit - gapOf(nextHit) - 0.2) / 0.25);
        // (turning, they fling out and trail the turn — only a light curl, never a stiff tucked ball)
        limbs = lerpPose(limbs, TUCK, 0.3 * tuck * hop);
        const air = s.t >= slideAt - 1e-9 ? 0 : Math.min(nextHit !== undefined ? smooth((nextHit - s.t) / 0.12) : 1, prev !== undefined ? smooth((s.t - prev - TUMBLE_CONTACT_S) / 0.12) : 1); // (eases off into each impact and back after it: no pop)
        limbs = lerpPose(limbs, limbsWithSpin(limbs, lagOf[si].lag, spinLoose(lagOf[si].spin)), air * Math.max(tuck * hop, prev === undefined ? smooth(s.t / 0.25) : 0));
        // (the brace is there AT the hit and flows off after it — never a pose change in the very picture of the impact)
        const brace = Math.max(nextHit !== undefined ? smooth(1 - (nextHit - s.t) / 0.16) : 0, prev !== undefined ? 1 - smooth((s.t - prev) / 0.15) : 0);
        const hopPrev = prev === undefined ? 1 : smooth((prev - gapOf(prev) - 0.2) / 0.25);
        limbs = lerpPose(limbs, BRACE, 0.7 * brace * Math.max(hop, hopPrev));
        limbs = lerpPose(limbs, CRUMPLED, Math.min(1, 1.3 * crOf[si]));
        limbs = lerpPose(limbs, FINAL, s.t >= slideAt ? smooth((s.t - slideAt) / 0.6) : 0); // (the limbs settle over ~0.6 s: no arm whipping into place)
        keys.push(keyAt(s, limbs));
      }
      const end = keys[keys.length - 1];
      end.pose = FINAL; end.lift = last.y; end.spin = dir * (nearestLying(last.lean).lean - FINAL.lean);
      hits.forEach((h, i) => (marks[`hit${i + 1}`] = start.t + tipT + h));
      if (hits.length) marks.land = start.t + tipT + floorAt;
      return { keys, end: { t: end.t, x: end.x, facing: at.facing, pose: FINAL }, marks };
    } },
    // 3. LIE STILL A MOMENT (fallDown), breathing — hurt — before the getUp.
    holdPiece("lie", 0.6, last.y, (k) => ({ head: FINAL.head + 4 * Math.sin(k * Math.PI) })),
  ]);
  // LYING FOLLOWS WHAT IT LIES ON (tumbleScene.ts restSlope): on a sloped pit floor the resting body turns to the floor's slope as it
  // settles (both ends touch, none floats), and turns back level in the last moments of lying, as it starts to get up. (Engine turn:
  // + degrees push the right end down, so a floor rising to the right needs a negative turn.)
  const tilt = -restSlope(params.pits ?? [], last.x, H);
  if (Math.abs(tilt) > 0.5) {
    const t0 = start.t + tipT + floorAt + 0.25, t1 = out.keys[out.keys.length - 1].t;
    let base = 0;
    for (const k of out.keys) {
      base = k.spin ?? base;
      if (k.t < t0) continue;
      const w = Math.min(smooth((k.t - t0) / 0.5), smooth((t1 - k.t) / 0.35));
      k.spin = base + tilt * w; k.spinEase = "inOut";
    }
  }
  const end = out.keys[out.keys.length - 1];
  out.marks.edge = start.t + tipT;
  out.marks.down = end.t;
  // (ACTIVE RAGDOLL, ragdoll.ts: the fall's world and window, so the hook can let the limbs swing with real weight — when it is on)
  registerTumbleForRagdoll({ edgeT: start.t + tipT, slideT: start.t + tipT + slideAt, downT: end.t, H, level, surfaces: params.surfaces ?? [], pits: params.pits ?? [], page: params.page ?? [-Infinity, Infinity] });
  // (WHERE IT WILL STAND: down in a pit, the floor under its feet once it is up — plan.ts eases the get-up onto it)
  const pit = (params.pits ?? []).find((p) => last.x > p.left && last.x < p.right);
  const standAt = pit?.standAt;
  return { ...out, end: { ...out.end, pose: FINAL }, level: end.lift ?? 0, ...(standAt ? { standAt } : {}) };
}

// HURT AFTER A HARD FALL (Oct 15, Arthur: "he should get up hurt — how is he not hurt?"): a fall leaves the body as hurt as the
// fall was hard — how far it dropped (`dropH` body heights) or how fast it hit the ground (`speedH` heights/s, a run tripping).
// About five feet (~1 height) or more, or a sprint into the ground, is past the hurt line (hit.ts HURT_STYLE_AT): it gets up slowly,
// struggling, a hand on its side, and moves on hurt (the hurt style: bent, slow, limping). A trip from a walk is not.
export function fallHurt(dropH: number, speedH = 0) {
  const fromDrop = dropH >= 0.5 ? 0.3 + 0.35 * dropH : 0;
  const fromSpeed = speedH > 2 ? 0.35 + 0.08 * speedH : 0;
  return Math.min(0.9, Math.max(fromDrop, fromSpeed));
}

export const TUMBLE_ABOUT = "Tumble off an edge (a cliff, a roof, a ledge, stairs): it FALLS FOR REAL (gravity) and every rock / ledge / step / roof / table prop below it and the floor of a `pit` background catch it: it touches each one quickly (brace → crumple, small quick bounce), bounces off left or right and the BOUNCE turns it over as one body — front flips going the way it faced, back flips going back, limbs flung loose by the spin, only the turns the drop gives (~1 H drop: under half a turn; high cliff: 2 max), landing flat (never head first) — hits the next one… until it lands at the bottom and lies the way it came down (follow with `getUp`, no direction needed — it gets up the way it lies, down there; a drop of ~1 H+ leaves it HURT: struggles up, then limps). A walk or run straight into the tumble keeps its speed (a trip, no stop at the edge). Stand it at the edge facing out (the cliff top is the ground line; put the drop in a `pit` piece and the rocks as props with `onWall: true` on the cliff face). `speed` px/s. Marks `edge`, `hit1`.., `land`, `down`.";
