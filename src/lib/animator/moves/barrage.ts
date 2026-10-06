import { forwardKinematics } from "../pose.ts";
import { realSeconds } from "./hit.ts";
import { PROPORTIONS, withPose, type PoseAngles, type Point } from "../rig.ts";
import { beatSeconds, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { blendPose, feetOf, GUARD, isRobot, plantedLegs, STAND_HIP, stepPose, windKind, type Feet, type PlacedBeat, type Side, placedBeatsToKeys, armFromWorld } from "./punch.ts";
import type { Other } from "./grapple.ts";
import { handAt, safePose } from "./squat.ts";

// SPEC-0017 Phase 2 round 15: BARRAGE (Arthur: "That wasn't really a barrage — I was expecting twice as
// fast ... and him leaning back a little more so the punches feel powerful"). A two-figure move pair:
// the attacker throws 6–10 straight punches in a row, one about every 0.27 s, hands alternating left/right
// (sometimes the same hand twice), at the face or the chest; the one barraged covers up and takes them on
// the forearms, is driven back a step, and the LAST punch gets through under the guard to the stomach.
// Rules:
// - STRAIGHT OUT, STRAIGHT BACK: a straight goes out level with the arm straight at contact and back along
//   the same line; every punch has a small load first (lean back, punch); overhands and uppercuts mixed in.
// - POWER: the body leans back a little, rocking forward a touch on every punch; the feet stay planted
//   (one small step in at the start if the other is out of reach).
// - EVERY PUNCH LANDS ON THE FOREARMS: the attacker aims at the other's real covered forearms (worked out
//   from the same cover pose the one barraged really uses), so fist and forearm meet each time.
// Poses are facing-relative and in body heights (x height): forward = +x, y grows downward, floor at 0.

const LEG = PROPORTIONS.thigh + PROPORTIONS.shin;
const ARM = PROPORTIONS.upperArm + PROPORTIONS.forearm;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// TIMING (x the natural, normal-speed, energy 0.5 seconds): a punch every LOAD + OUT seconds (Arthur: "I like
// the speed — make it a little faster": about every 0.2 s at first).
const OUT = 0.13; // the fist drives out with the whole body (speeding up into the hit)
const LOAD = 0.1; // LEAN BACK, PUNCH: the whole-body load before every punch ("a tiny hair slower": ~0.21 s a punch)
const WIND = 0.2; // the first punch's short anticipation
// DRIVEN BACK: the one barraged steps back this far (x height) once, half way through.
export const BARRAGE_BACK = 0.12; // (round 7, Arthur: "he could even push blue back a little")
export const barrageCount = (count?: number) => Math.round(clamp(Number(count ?? 8) || 8, 6, 10));
// Which hand throws punch i (1-based) of n: alternating, sometimes the same hand twice; the last is the
// back hand (the power hand).
// ALWAYS LEFT, RIGHT, LEFT, RIGHT (round 8, Arthur: "It needs to be a constant left, right pattern"): the
// hands strictly alternate, never the same hand twice; an overhand or uppercut is thrown by the arm that
// was cocked behind (the next one in the alternation).
export function barrageHands(n: number): Side[] {
  return Array.from({ length: n }, (_, i) => (i % 2 ? "r" : "l") as Side);
}
// Where along the other's forearm punch i lands (0 = elbow, 1 = fist): high = the face, low = the chest.
const along = (i: number) => [0.5, 0.2, 0.4, 0.15, 0.55, 0.3][i % 6];
// (Bisection: the x in lo..hi where f(x) crosses zero; f(lo) > 0 > f(hi) or the other way round.)
function solve(f: (x: number) => number, lo: number, hi: number) {
  const up = f(lo) < f(hi);
  for (let k = 0; k < 30; k += 1) { const m = (lo + hi) / 2; if ((f(m) < 0) === up) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// ONE STEADY RHYTHM (Arthur, latest: "it should be always the same speed ... after this, the next punch
// should be coming ... always that speed like it currently is. But for uppercuts, overhands, throwing new
// strikes"): every punch — straight, overhand, uppercut or strong — comes on the same beat (LOAD + OUT);
// the small lean back fits inside the beat. Only a long barrage tires: after BARRAGE_TIRES seconds of
// punching the beat slows gently, up to 1.2x five seconds later. (A 6–10 punch barrage never gets there.)
// `elapsed` = seconds since the first punch. x the base beat.
export const BARRAGE_TIRES = 15;
export function barrageTempo(elapsed: number): number {
  return 1 + 0.2 * clamp((elapsed - BARRAGE_TIRES) / 5, 0, 1);
}
// A MIX OF PUNCHES (Arthur: "I like the straight punches, but also overhands, uppercuts, and strong punches —
// like three strong punches in a barrage"): punch i (1..n-1; the last is the body shot) is a straight, an
// overhand (the fist comes from up by the temple over the guard and down onto it) or an uppercut (from low
// by the stomach up into the bottom of the guard); about three are STRONG (a bigger load, leaning further
// back, a little longer). The first is always a straight; at least one overhand and one uppercut; the
// pattern changes with `seed` and the count.
export type BarragePunch = { kind: "straight" | "overhand" | "uppercut"; strong: boolean };
export function barragePattern(n: number, seed = 0): BarragePunch[] {
  const r = (i: number, k: number) => { const v = Math.sin(91.345 * i + 47.853 * n + 13.17 * seed + 7.31 * k) * 24634.6345; return v - Math.floor(v); };
  const out: BarragePunch[] = Array.from({ length: n - 1 }, () => ({ kind: "straight" as BarragePunch["kind"], strong: false }));
  // (Round 7, Arthur: "add the overhands": EVERY barrage has at least one overhand AND one uppercut — never
  // the first punch, never just before the last, never two of them in a row; a long one may get a third.)
  const slots = Array.from({ length: Math.max(0, n - 3) }, (_, k) => k + 2).sort((a, b) => r(a, 1) - r(b, 1));
  const kinds: BarragePunch["kind"][] = r(0, 2) < 0.5 ? ["overhand", "uppercut"] : ["uppercut", "overhand"];
  if (n >= 9) kinds.push(r(0, 3) < 0.5 ? "overhand" : "uppercut");
  for (const kind of kinds) {
    const i = slots.find((j) => out[j - 1].kind === "straight" && out[j - 2]?.kind === "straight" && (out[j]?.kind ?? "straight") === "straight");
    if (i) out[i - 1].kind = kind;
  }
  // (Three strong ones, spread out: never two in a row.)
  const order = Array.from({ length: n - 3 }, (_, k) => k + 3).sort((a, b) => r(b, 4) - r(a, 4));
  let strong = 0;
  for (const i of order) if (strong < 3 && !out[i - 2].strong && !out[i]?.strong) { out[i - 1].strong = true; strong += 1; }
  return out;
}
// EVERY PUNCH TOUCHES (Arthur: "I need to see impact always on blue with Red's hands ... it visually,
// physically should be punching something"): each hit lands ON a picture (one beat = exactly 4 pictures at
// 12 a second, 8 at 24, and the first hit is put on a whole picture), the fist really on the other's guard
// (it aims at where the knock puts the guard); the fist stays there a hair (HIT_STOP) while the guard, head
// and chest are KNOCKED BACK on that same picture, and they recover by the next one.
// (Round 7, Arthur: "seriously make it slower": 1/2 s a punch — 6 pictures at 12 a second; the contact
// held over 2 of them.)
export const BARRAGE_BEAT = 5 / 12; // (round 10, Arthur: "a bit faster visually": 5 pictures at 12 a second — the contact held over 2, then 3 in-betweens)
export const HIT_STOP = 0.11;
const RECOVER = 0.09;
export const barrageKnock = (i: number) => ({ push: -0.03, back: 17 * (0.9 + 0.2 * (i % 2)) });
// After which punch the one barraged steps back.
export const backAfter = (n: number) => Math.floor(n / 2);

function legsDrop(feet: Feet, at: number, straight = 0.985) {
  let drop = 0.01;
  for (const foot of [feet.l, feet.r]) {
    const h = foot - at, length = LEG * straight;
    drop = Math.max(drop, STAND_HIP - Math.sqrt(Math.max(0, length * length - h * h)));
  }
  return drop;
}
const fk = (pose: PoseAngles, at: number) => forwardKinematics(pose, "right", { x: at, y: -(STAND_HIP - dropOf(pose)) }, 1, "normal", false);
const hipDrop = new WeakMap<PoseAngles, number>();
const dropOf = (pose: PoseAngles) => hipDrop.get(pose) ?? 0.015;
const legs = (pose: PoseAngles, feet: Feet, at: number, extra = 0.015) => {
  const drop = legsDrop(feet, at) + extra;
  const out = safePose(plantedLegs(pose, feet, at, drop));
  hipDrop.set(out, drop);
  return out;
};

// COVER UP (the one barraged): forearms up in front of the face, elbows forward, chin tucked (like a
// block); `back` = how far a blow tips it back; `open` = the guard knocked a little apart.
export function coverPose(from: PoseAngles, feet: Feet, at: number, back = 0): PoseAngles {
  const lean = GUARD.lean + 6 - back;
  const upper = withPose(from, {
    lean, head: GUARD.head + 12 - back,
    ...armFromWorld(lean, "l", { upper: 80, fore: 176 }),
    ...armFromWorld(lean, "r", { upper: 70, fore: 170 }),
  });
  return legs(upper, feet, at);
}
// The covered forearm a punch lands on (the lead one, nearer the attacker), in the barraged one's frame.
function forearmPoint(pose: PoseAngles, at: number, u: number): Point {
  const s = fk(pose, at);
  return { x: s.lElbow.x + (s.lHand.x - s.lElbow.x) * u, y: s.lElbow.y + (s.lHand.y - s.lElbow.y) * u };
}
// The stomach (the last punch), in the barraged one's frame.
function stomachPoint(pose: PoseAngles, at: number): Point {
  const s = fk(pose, at);
  return { x: s.hip.x + (s.neck.x - s.hip.x) * 0.5, y: s.hip.y + (s.neck.y - s.hip.y) * 0.5 };
}

// `tires`: a long, all-out barrage — only then does he slow down as he tires (off by default).
export type BarrageParams = { other?: Other; distance?: number; count?: number; seed?: number; tires?: boolean };

// BARRAGE (attacker). Marks `windup`, `hit1`..`hitN` (each fist landing), `cock` (the last wind-up), `hit`
// (= the last), `ready` = `end` (back in its stand, facing the other).
const LAST_OUT = 0.18; // seconds: the last (big) punch's way out, at the least
export function barrage(start: Stance, params: BarrageParams, settings: MoveSettings): MoveOutput {
  const n = barrageCount(params.count);
  const hands = barrageHands(n);
  const pattern = barragePattern(n, Number(params.seed ?? 0));
  const feet0 = feetOf(start.pose);
  const o = params.other;
  const d = o ? o.dx : (params.distance ?? 0.67 * settings.height) / settings.height;
  const flip = !o || o.facing === "opposite" ? -1 : 1;
  // The other's covered body (as the one barraged will stand: its own feet, hips at 0 then BARRAGE_BACK
  // back), turned into this figure's frame.
  const theirFeet = o ? feetOf(o.pose) : { l: 0.04, r: -0.04 };
  const toMine = (p: Point, back: number): Point => ({ x: d + flip * (p.x - back), y: p.y });
  // (DRIVEN BACK: its back foot steps back after punch backAfter(n), its front foot after the next one.)
  const theirRear: Side = theirFeet.l >= theirFeet.r ? "r" : "l";
  // (`knocked`: where the guard is once the fist has knocked it back; else where the fist first meets it.)
  const target = (i: number, knocked = true): Point => {
    const k = backAfter(n), half = i === k + 1, back = i > k + 1 ? BARRAGE_BACK : half ? BARRAGE_BACK / 2 : 0;
    const feet = i > k + 1 ? { l: theirFeet.l - BARRAGE_BACK, r: theirFeet.r - BARRAGE_BACK } : half ? { ...theirFeet, [theirRear]: theirFeet[theirRear] - BARRAGE_BACK } as Feet : theirFeet;
    const kind = pattern[i - 1]?.kind;
    if (i === n) return toMine(stomachPoint(coverPose(o?.pose ?? GUARD, feet, -back), -back), 0);
    const knock = knocked ? barrageKnock(i) : { push: 0, back: 0 }, cover = coverPose(o?.pose ?? GUARD, feet, -back + knock.push, knock.back);
    return toMine(forearmPoint(cover, -back + knock.push, kind === "overhand" ? 0.85 : kind === "uppercut" ? 0.03 : along(i)), 0);
  };
  // POWER: leaning back a little, rocking forward on each punch (more on the last).
  const robot = isRobot(settings);
  const L0 = robot ? -2 : -8;
  const front: Side = feet0.l >= feet0.r ? "l" : "r", rear: Side = front === "l" ? "r" : "l";
  const chinOf = (side: Side): Point => ({ x: side === front ? 0.09 : 0.06, y: -0.02 });
  const body = (lean: number, feet: Feet, at: number, extra = 0.015) => legs(withPose(start.pose, { lean, head: -0.6 * lean + 2 }), feet, at, extra);
  // A pose: the body, `side`'s fist at `fist` (frame point) or at the chin, the other fist at the chin.
  const posed = (lean: number, feet: Feet, at: number, punch?: { side: Side; fist: Point }, extra = 0.015, fists: Partial<Record<Side, Point>> = {}) => {
    let pose = body(lean, feet, at, extra);
    const drop = hipDrop.get(pose)!;
    const neck = fk(pose, at).neck;
    for (const side of ["l", "r"] as Side[]) {
      const fist = punch && punch.side === side ? punch.fist : fists[side];
      const p = fist ? { x: fist.x - neck.x, y: fist.y - neck.y } : chinOf(side);
      pose = handAt(pose, side, p.x, p.y);
    }
    const out = safePose(pose);
    hipDrop.set(out, drop);
    return out;
  };
  // A STRAIGHT PUNCH (lead review: "at each hit the arm is nearly straight ... level from the shoulder to
  // the target"): the fist lands with the elbow only STRAIGHT_BEND degrees bent, so the shoulder is exactly
  // REACH from the spot it hits. The body reaches the last bit by rocking into it: `u` 0..1 = leaning back
  // with the hips back .. leaning in with the hips forward (still a little back for power).
  const STRAIGHT_BEND = 12;
  const REACH = Math.sqrt(PROPORTIONS.upperArm ** 2 + PROPORTIONS.forearm ** 2 + 2 * PROPORTIONS.upperArm * PROPORTIONS.forearm * Math.cos((STRAIGHT_BEND * Math.PI) / 180)) - 0.004;
  // (LEAN BACK, PUNCH: at the hit the body has driven forward PAST upright onto the front foot.)
  // (Round 9: the last body shot DUCKS — knees bent deep, the body only a little forward — so the arm goes
  // in level to the stomach and the heads stay a head's width apart.)
  const LAST_DIP = 0.13;
  const leanOf = (u: number, last = false) => (last ? 2 + 6 * u : -3 + 9 * u);
  const hipsOf = (u: number, last = false) => (last ? 0.01 + 0.04 * u : -0.005 + 0.065 * u);
  // THE BARRAGE STANCE: the front foot forward, the back foot back (a punching base), set where every
  // blocked punch can land straight: the hips `S` from where they started (a step in, or back if too close).
  const STANCE = { front: 0.11, rear: -0.09 };
  const stanceFeet = (S: number): Feet => ({ [front]: S + STANCE.front, [rear]: S + STANCE.rear }) as Feet;
  // RED FOLLOWS HIM IN: after Blue is driven back a step, Red steps in after him (front foot, then back
  // foot), so every punch still reaches. `shiftOf(i)` = how far each foot has moved in for punch i.
  const kB = backAfter(n);
  const shiftOf = (i: number) => { const j = Math.min(i, n - 1); return { [front]: j >= kB + 2 ? BARRAGE_BACK : 0, [rear]: j >= kB + 3 ? BARRAGE_BACK : 0 } as Feet; };
  const extraOf = (i: number) => { const f = shiftOf(i); return (f.l + f.r) / 2; };
  const feetAt = (i: number, S: number): Feet => { const f = shiftOf(i), b = stanceFeet(S); return { l: b.l + f.l, r: b.r + f.r }; };
  const neckAt = (u: number, S: number, last = false, feet = stanceFeet(S), extra = 0) => fk(body(leanOf(u, last), feet, S + extra + hipsOf(u, last), last ? LAST_DIP : 0.015), S + extra + hipsOf(u, last)).neck;
  // (An overhand lands with the elbow a little more bent, an uppercut more still.)
  const reachOf = (bend: number) => Math.sqrt(PROPORTIONS.upperArm ** 2 + PROPORTIONS.forearm ** 2 + 2 * PROPORTIONS.upperArm * PROPORTIONS.forearm * Math.cos((bend * Math.PI) / 180)) - 0.004;
  const reachFor = (i: number) => i === n ? REACH : pattern[i - 1].kind === "overhand" ? reachOf(30) : pattern[i - 1].kind === "uppercut" ? reachOf(55) : REACH;
  const gapAt = (i: number, u: number, S: number, last = false, feet?: Feet, extra = 0, knocked = true) => {
    const t = target(i, knocked), neck = neckAt(u, S, last, feet, extra);
    return Math.hypot(t.x - neck.x, t.y - neck.y) - reachFor(i);
  };
  // (Where the hips must be for punch i to land straight at rocking `u`: the hips shift the neck one for one.)
  // (Set so the fist MEETS the guard with the arm straight; the knock is followed by driving on into it.)
  const needS = (i: number, u: number) => { const g = (S: number) => gapAt(i, u, S, false, feetAt(i, S), extraOf(i), false); return g(0) > 0 ? solve(g, 0, 0.6) : -solve((S) => -g(-S), 0, 0.4); };
  let lo = -Infinity, hi = Infinity;
  for (let i = 1; i < n; i += 1) if (pattern[i - 1].kind === "straight") { lo = Math.max(lo, needS(i, 1)); hi = Math.min(hi, needS(i, 0)); }
  // (PERSONAL SPACE, hit.ts: the hips never come closer than 0.3 x height to the other's, even as it is
  // driven back.)
  const room = d + BARRAGE_BACK - 0.32 - 0.05;
  const S = clamp(lo <= hi ? (lo + hi) / 2 : (lo + hi) / 2, -0.25, Math.min(0.35, room));
  const feet = stanceFeet(S);
  // How far it rocks into punch i (blocked ones), so the fist lands with the arm straight.
  // (Following the knock the body drives on further into it: up to 1.8 of the rock.)
  const rockOf = (i: number, knocked = true) => { const top = knocked ? 2.2 : 1.3, g = (u: number) => gapAt(i, u, S, false, feetAt(i, S), extraOf(i), knocked); return g(0) <= 0 ? 0 : g(top) >= 0 ? top : solve(g, 0, top); };
  // THE LAST ONE STEPS IN: the front foot steps in with the power punch to reach under the guard.
  const feetN = feetAt(n - 1, S), xN = extraOf(n - 1);
  const lastNeed = (E: number) => gapAt(n, 0.6, S, true, { ...feetN, [front]: feetN[front] + E } as Feet, xN + 0.6 * E);
  const E = lastNeed(0) <= 0 ? 0 : clamp(solve(lastNeed, 0, 0.25), 0, Math.max(0, Math.min(0.16, room - S - xN - 0.05)));
  const feetL: Feet = { ...feetN, [front]: feetN[front] + E } as Feet;
  const uLast = gapAt(n, 0, S, true, feetL, xN + 0.6 * E) <= 0 ? 0 : gapAt(n, 1.6, S, true, feetL, xN + 0.6 * E) >= 0 ? 1.6 : solve((u) => gapAt(n, u, S, true, feetL, xN + 0.6 * E), 0, 1.6);
  const beats: PlacedBeat[] = [];
  // 1. Into the barrage stance (front foot first going in, back foot first going back), then the short
  // anticipation (fists to the chin, leaning back).
  const ready = posed(L0 - 3, feet, S - 0.02);
  const lead: Side = S >= 0 ? front : rear, trail: Side = lead === front ? rear : front;
  const to1 = { ...feet0, [lead]: feet[lead] } as Feet;
  const at1 = (to1.l + to1.r) / 2;
  const land1 = posed(L0 - 2, to1, at1);
  if (Math.abs(to1[lead] - feet0[lead]) > 0.01) beats.push(
    { kind: "settle", ease: "smooth", pose: safePose(stepPose(blendPose(start.pose, land1, 0.5), feet0, to1, at1 / 2, legsDrop(feet0, at1 / 2) + 0.015, lead, 0.04)), seconds: 0.14, at: at1 / 2, contacts: [`${trail}Foot`] },
    { kind: "settle", ease: "smooth", pose: land1, seconds: 0.09, at: at1 },
  );
  if (Math.abs(feet[trail] - to1[trail]) > 0.01) beats.push(
    { kind: "settle", ease: "smooth", pose: safePose(stepPose(blendPose(land1, ready, 0.5), to1, feet, (at1 + S) / 2, legsDrop(to1, (at1 + S) / 2) + 0.015, trail, 0.035)), seconds: 0.12, at: (at1 + S) / 2, contacts: [`${lead}Foot`] },
  );
  // 2. The punches. THE SWITCH (Arthur's drawing, round 5: "When the arm goes in front, the arm in front
  // goes in back. So that looks like a switch, a punch ... Boom, boom, boom"): on every hit one arm is
  // straight on the target while the other is COCKED BEHIND THE HEAD — the upper arm pointing back (about
  // 80% of a strong punch's wind-up), the elbow folded hard so the fist curls up by the back of the head.
  // Each punch swaps them: the cocked arm drives forward to straight while the straight one pulls back
  // into the cocked pose, both upper arms swinging THROUGH DOWN past the ribs (never over the top, so they
  // swing back and forth, never round and round). Between hits the body rocks back a little (lean back,
  // punch). An overhand cocks higher (the fist up behind the head), an uppercut and the last body shot
  // cock low behind the hip.
  // ONE BEAT FOR EVERYONE (lead, round 5: in a fight the energy and speed made it 0.13 s a punch): the
  // beat is about 0.235 s and only a little quicker or slower with the mood, never outside 0.21–0.25 s
  // (real seconds, whatever the energy or speed); only a long barrage tires.
  // (Round 6, Arthur: "it's too fast ... only visible for like three frames": one beat of exactly 1/3 s in
  // every mood, energy and speed — 4 pictures at 12 a second — so every hit falls on a picture.)
  const BEAT = BARRAGE_BEAT;
  const realOf = (kind: "action" | "hold", sec: number) => sec <= 1e-9 ? 0 : (sec * sec) / beatSeconds(kind, sec, settings);
  const real = (sec: number) => realOf("action", sec);
  void realSeconds;
  type Cock = { upper: number; elbow: number };
  const COCKED: Cock = { upper: -73, elbow: 218 };
  const cockOf = (kind: string): Cock => kind === "overhand" ? { upper: -80, elbow: 228 } : kind === "uppercut" || kind === "body" ? { upper: -40, elbow: 70 } : COCKED;
  const setArm = (pose: PoseAngles, side: Side, arm: Cock) => ({ ...pose, [`${side}Shoulder`]: arm.upper + pose.lean, [`${side}Elbow`]: arm.elbow }) as PoseAngles;
  const armOfPose = (pose: PoseAngles, side: Side): Cock => ({ upper: pose[`${side}Shoulder`] - pose.lean, elbow: pose[`${side}Elbow`] });
  const keep = (pose: PoseAngles, from: PoseAngles) => { hipDrop.set(pose, hipDrop.get(from) ?? 0.015); return pose; };
  const kindOf = (i: number) => (i === n ? "body" : pattern[i - 1].kind);
  // The hit pose of punch i: its arm straight on the target; the other cocked for its next punch.
  const hitPose = (i: number, knocked = true) => {
    const side = hands[i - 1], o: Side = side === "l" ? "r" : "l", last = i === n, u = last ? uLast : rockOf(i, knocked);
    const at = last ? S + xN + 0.6 * E + hipsOf(u, true) : S + extraOf(i) + hipsOf(u);
    const base = last ? posed(leanOf(u, true), feetL, at, { side, fist: target(i) }, LAST_DIP) : posed(leanOf(u), feetAt(i, S), at, { side, fist: target(i, knocked) });
    const next = i < n && hands[i] === o ? cockOf(kindOf(i + 1)) : COCKED;
    return { pose: keep(setArm(base, o, next), base), at, u };
  };
  // In between (lean back): the body rocked back, both arms `k` of the way through their switch.
  const between = (from: PoseAngles, to: PoseAngles, k: number, lean: number, at: number, feetNow: Feet, dip = 0.015, own?: Partial<Record<Side, Cock>>) => {
    let pose = body(lean, feetNow, at, dip);
    for (const sd of ["l", "r"] as Side[]) {
      const a = armOfPose(from, sd), b = armOfPose(to, sd);
      pose = setArm(pose, sd, own?.[sd] ?? { upper: a.upper + (b.upper - a.upper) * k, elbow: a.elbow + (b.elbow - a.elbow) * k });
    }
    return keep(pose, body(lean, feetNow, at, dip));
  };
  // The first punch's anticipation (his drawing): the first punching arm cocked behind the head, the other
  // straight out in front at head height, "almost aiming"; leaning back a little.
  const first = hands[0], firstOther: Side = first === "l" ? "r" : "l";
  const aimBase = body(-6, feet, S - 0.03);
  let prevPose = keep(setArm(setArm(aimBase, first, cockOf(kindOf(1))), firstOther, { upper: 84, elbow: 8 }), aimBase);
  // (ON A PICTURE: the wait before the first hit is stretched a hair so it lands on a whole 1/12 s.)
  const alignAt = beats.length;
  beats.push({ kind: windKind(settings), pose: prevPose, seconds: WIND, at: S - 0.03, name: "windup" });
  let prevAt = S - 0.03;
  for (let i = 1; i <= n; i += 1) {
    const side = hands[i - 1], last = i === n, kind = kindOf(i), strong = !last && pattern[i - 1].strong;
    const hit = hitPose(i);
    // (The long-barrage tiring still slows it, in whole pictures.)
    // NO SLOWING DOWN (round 8, Arthur: "He slows down a little too much ... he wasn't even punching for that
    // long"): every punch, the last one too, on the same 1/2 s beat; only a long all-out barrage (`tires`)
    // slows a little as he tires, in whole pictures.
    const gap = Math.max(5, Math.round(5 * (params.tires ? barrageTempo(i * BEAT) : 1))) / 12, lastGap = gap;
    const outReal = last ? 0.2 : (gap - HIT_STOP - 1 / 48) * 0.57, loadReal = (last ? lastGap : gap) - HIT_STOP - 1 / 48 - outReal;
    {
      // LEAN BACK: rocked back (further for a strong one and the last), the arms part way through the switch;
      // the same hand twice comes back only to the chest (no time for the whole swing).
      const again = i > 1 && hands[i - 2] === side;
      const was = i > 1 ? feetAt(i - 1, S) : feet, now = last ? feetL : feetAt(i, S);
      const moved: Side | undefined = Math.abs(now.l - was.l) > 0.005 ? "l" : Math.abs(now.r - was.r) > 0.005 ? "r" : undefined;
      const lean = -9 - (strong ? 4 : 0) - (last ? 5 : 0), at = S + (extraOf(i - 1) + (last ? xN + 0.3 * E : extraOf(i))) / 2 - 0.03 - (strong || last ? 0.015 : 0), dip = last ? 0.6 * LAST_DIP : kind === "uppercut" ? 0.035 : 0.015;
      const own: Partial<Record<Side, Cock>> = last ? { [side]: cockOf("body") } : again ? { [side]: { upper: 5, elbow: 125 } } : {};
      const load = between(prevPose, hit.pose, last ? 0.5 : 0.4, lean, at, was, dip, own);
      // (A step in — following him, or into the last punch — happens here, one foot in the air.)
      beats.push({ kind: "action", ease: "smooth", pose: moved ? keep(safePose(stepPose(load, was, now, at, legsDrop(was, at) + 0.015, moved, 0.04)), load) : load, seconds: real(loadReal), at, name: last ? "cock" : undefined, contacts: moved ? [`${moved === "l" ? "r" : "l"}Foot`] : undefined });
    }
    // PUNCH: the body drives forward, the cocked arm straight onto the target. (Every switch goes through
    // the lean-back key, so no elbow ever has to fold more than half a turn in one go and flip over.)
    // (The fist is on the guard a moment BEFORE the hit mark too — 1/48 s, what the engine counts as "on the
    // picture" when it moves a picture onto a moment at low picture rates — so the picture always shows it.)
    // CONTACT, THEN THE KNOCK: the fist meets the guard (1/48 s before the hit mark), then both are driven
    // back together to where the knock puts the guard (1/48 s after it), so on the picture of the hit the
    // fist is on the guard while the guard is going back.
    const meet = hitPose(i, false);
    beats.push({ kind: "action", ease: last ? "smooth" : "linear", pose: meet.pose, seconds: real(outReal), at: meet.at, name: `hit${i}` });
    beats.push({ kind: "action", ease: "linear", pose: hit.pose, seconds: real(2 / 48), at: hit.at });
    // HIT-STOP: the fist stays on the guard a hair.
    beats.push({ kind: "hold", pose: hit.pose, seconds: realOf("hold", HIT_STOP - 1 / 48), at: hit.at });
    prevPose = hit.pose; prevAt = hit.at;
  }
  void prevAt;
  // 3. Follow-through on the last, then back into the stance, hands loose at the chest.
  const endAt = S + xN + 0.3 * E, end = posed(0, feetL, endAt);
  void robot;
  beats.push(
    // (NO LIMB THROUGH ANOTHER BODY: the fist comes straight back out low at once, before the other folds
    // over where it was.)
    { kind: "action", ease: "out", pose: posed(L0, feetL, endAt, undefined, 0.015, { [hands[n - 1]]: { ...fk(body(L0, feetL, endAt), endAt).neck, x: fk(body(L0, feetL, endAt), endAt).neck.x + 0.03, y: fk(body(L0, feetL, endAt), endAt).neck.y + 0.12 } }), seconds: real(0.14), at: endAt },
    { kind: "settle", pose: end, seconds: 0.4, at: endAt, name: "ready", recover: true },
  );
  // (The hit mark is the middle of the contact: 1/48 s after the fist meets the guard.)
  const shifted = (o: MoveOutput): MoveOutput => { const marks = { ...o.marks }; for (let i = 1; i <= n; i += 1) marks[`hit${i}`] += 1 / 48; return { ...o, marks }; };
  let out = shifted(placedBeatsToKeys(start, beats, settings));
  const t1 = out.marks.hit1, delta = Math.ceil(t1 * 12 - 1e-6) / 12 - t1;
  if (delta > 1e-6) {
    // (Held in the anticipation pose, both feet down.)
    beats.splice(alignAt + 1, 0, { kind: "hold", pose: beats[alignAt].pose, seconds: realOf("hold", delta), at: beats[alignAt].at });
    out = shifted(placedBeatsToKeys(start, beats, settings));
  }
  return { ...out, marks: { ...out.marks, hit: out.marks[`hit${n}`], end: out.end.t } };
}

// ---- BARRAGED (the one punched) -----------------------------------------------------------------------

export type BarragedParams = { from?: string; hits?: number[]; count?: number; seed?: number };

// BARRAGED: covers up (forearms in front of the face), each punch lands on the forearms with a small
// knock-back jolt (head and chest giving a little each time), driven back one step half way through; the
// LAST punch gets in under the guard to the stomach: it doubles over at the stomach, then straightens
// back into its stand. `hits` (filled in by the planner from the attacker's marks) = when each punch
// lands, seconds after the first. Marks `covered`, `hit1`..`hitN`, `hit` (= the last), `react`, `ready`.
export function barraged(start: Stance, params: BarragedParams, settings: MoveSettings): MoveOutput {
  const hits = params.hits?.length ? params.hits : Array.from({ length: barrageCount(params.count) }, (_, i) => i * BARRAGE_BEAT);
  const n = hits.length;
  const feet0 = feetOf(start.pose);
  const front: Side = feet0.l >= feet0.r ? "l" : "r", rear: Side = front === "l" ? "r" : "l";
  const robot = isRobot(settings);
  // (Real seconds: the beats are timed in real seconds, whatever the mood.)
  const real = { ...settings, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
  const RAISE = 0.16;
  const beats: PlacedBeat[] = [];
  let feet = feet0, at = 0;
  beats.push({ kind: "action", ease: "smooth", pose: coverPose(start.pose, feet, at), seconds: RAISE, at, name: "covered" });
  beats.push({ kind: "hold", pose: coverPose(start.pose, feet, at), seconds: 0.04, at });
  for (let i = 1; i <= n; i += 1) {
    // IMPACT ON EVERY PUNCH (Arthur: "I need to see impact always on blue"): the arriving fist drives the
    // guard, head and chest back INTO the hit, so the contact picture shows the knock; held a hair with the
    // fist (HIT_STOP), then they recover by the next picture. (The last one: under the guard, see below.)
    const knock = barrageKnock(i), last = i === n;
    // (The fist meets the guard 1/48 s before the hit mark; the guard then goes back with it.)
    beats.push({ kind: "hold", pose: coverPose(start.pose, feet, at), seconds: 1 / 48, at, name: `hit${i}` });
    if (last) { beats.push({ kind: "hold", pose: coverPose(start.pose, feet, at), seconds: 2 / 48, at }); break; }
    const knocked = coverPose(start.pose, feet, at + knock.push, knock.back);
    beats.push({ kind: "action", ease: "linear", pose: knocked, seconds: 2 / 48, at: at + knock.push });
    beats.push({ kind: "hold", pose: knocked, seconds: HIT_STOP - 1 / 48, at: at + knock.push });
    const rest = hits[i] - hits[i - 1] - HIT_STOP - 1 / 48 - 1 / 48;
    if (i === backAfter(n) || i === backAfter(n) + 1) {
      // DRIVEN BACK: after one punch the back foot steps back, after the next the front foot follows (each
      // seen in the air, between the punches).
      const side = i === backAfter(n) ? rear : front, stay: Side = side === rear ? front : rear;
      const to = { ...feet, [side]: feet[side] - BARRAGE_BACK } as Feet, at1 = at - 0.5 * BARRAGE_BACK;
      const land = coverPose(start.pose, to, at1);
      const mid = (at + at1) / 2;
      beats.push(
        { kind: "action", ease: "smooth", pose: safePose(stepPose(blendPose(coverPose(start.pose, feet, at, 3), land, 0.5), feet, to, mid, legsDrop(feet, mid) + 0.015, side, 0.035)), seconds: 0.55 * rest, at: mid, contacts: [`${stay}Foot`] },
        { kind: "action", ease: "smooth", pose: land, seconds: 0.45 * rest, at: at1 },
      );
      feet = to; at = at1;
    } else {
      beats.push({ kind: "settle", pose: coverPose(start.pose, feet, at), seconds: Math.min(RECOVER, rest), at });
      if (rest - RECOVER > 1e-6) beats.push({ kind: "hold", pose: coverPose(start.pose, feet, at), seconds: rest - RECOVER, at });
    }
  }
  // THE LAST ONE GETS THROUGH: doubled over at the stomach (hips pushed back, knees giving, head down,
  // hands to the belly), then back up into its stand.
  // (Its hips pushed back as it folds, so its head never meets the puncher's.)
  // (Round 9: it folds BACK from the hips — hips driven back, the chest only a little forward, the head
  // tucked down — so the heads always keep a head's width apart.)
  const lean = GUARD.lean + 10;
  const doubled = legs(withPose(start.pose, { lean, head: 32, ...armFromWorld(lean, "l", { upper: 25, fore: 95 }), ...armFromWorld(lean, "r", { upper: 15, fore: 90 }) }), feet, at - 0.16, 0.06);
  const standUp = legs(withPose(start.pose, { lean: 6, head: 4 }), feet, at, 0.015);
  beats.push(
    { kind: "action", ease: "out", pose: doubled, seconds: 0.15, at: at - 0.16, name: "react" },
    { kind: "hold", pose: doubled, seconds: 0.3, at: at - 0.16 },
    { kind: "settle", pose: standUp, seconds: 0.55, at, name: "ready", recover: true },
  );
  const out = placedBeatsToKeys(start, beats, real);
  for (let i = 1; i <= n; i += 1) out.marks[`hit${i}`] += 1 / 48;
  return { ...out, marks: { ...out.marks, hit: out.marks[`hit${n}`] } };
}
