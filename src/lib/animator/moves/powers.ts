// POWERS (SPEC-0017 Phase 2C): a body move and an effect together — fire blast from the hands, water shield,
// teleport. The body part is an ordinary move (keys + marks, built by the planner like a punch); the effect is
// an EffectTrack timed by that move's marks (powerEffects).
// Arthur's rules hold for powers like for every move: ANTICIPATION before every action (pull back, crouch),
// WEIGHT (the knees bend, the body steps into a push), EARTH GRAVITY, the body reacts AWAY from where the energy
// came from (a blast pushes the one who fires it back a little; fire hitting a shield pushes its holder back a
// little), nothing through bodies, and smooth (the body rules and the joint-step limit; a teleport's jump is a
// marked FAST SPAN, engine.ts fastSpans, hidden under a quick flash).
import type { CharacterKey } from "../engine.ts";
import type { Anchor, EffectParams, EffectTrack } from "../effects/types.ts";
import { STAND, withPose, type Facing, type PoseAngles, type Point } from "../rig.ts";
import { beatSeconds, forwardSign, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import type { ScenePlan } from "./plan.ts";
import { iceArrival, iceEffects, iceParams } from "./powerIce.ts";
import { laserEyesEffects, laserEyesParams } from "./powerLaser.ts";
import { elementalTracks } from "./elements.ts";
import {
  armOf, armReach, atLeast, backLegDrop, blendPose, feetOf, isRobot, placedBeatsToKeys, plantedLegs, powerOf, recoverBeats, STAND_HIP, stepPose, windKind, type Feet, type PlacedBeat,
} from "./punch.ts";

// The moves that make effects (their ids in the move LIBRARY).
export const POWER_MOVES = new Set<string>(["fireBlast", "waterShield", "teleport", "iceMountain", "iceThrow", "laserEyes", "iceBlast", "waterBlast"]);

// ---- Shared sizes (x the figure's height) ------------------------------------------------------------

// The water shield: a dome of water round the figure (water.ts "waterShield", anchored at the hip), its centre
// SHIELD_FORWARD in front of the hips and SHIELD_UP above them, radius SHIELD_RADIUS.
export const SHIELD_FORWARD = 0.05;
export const SHIELD_UP = 0;
export const SHIELD_RADIUS = 0.65;
// The fire stream flies at hand height (above the ground) and this fast (heights a second); it reaches its
// target after travelSeconds.
export const STREAM_HEIGHT = 0.72;
export const STREAM_SPEED = 3; // (about what fire.ts fireStream flies at: 900 px/s for a 300 px figure)
// A fire blast with no target fires this far (x height) when no `distance` is given.
const BLAST_DISTANCE = 2.6;
// A teleport with no `to` and no `distance` goes this far forward (x height).
const TELEPORT_DISTANCE = 2;

// ---- Body poses -------------------------------------------------------------------------------------

// Both arms putting the hands at the given spots (from the shoulder; x height, facing right, +y down).
const hands = (lean: number, l: Point, r: Point): Partial<PoseAngles> => {
  const a = armReach(lean, l), b = armReach(lean, r);
  return { ...armOf("l", a.shoulder, a.elbow), ...armOf("r", b.shoulder, b.elbow) };
};
// Where the hips are from the shoulder for a lean (so a hand can be put "at the hip").
const hipFromShoulder = (lean: number): Point => ({ x: 0.3 * Math.sin((lean * Math.PI) / 180), y: 0.3 * Math.cos((lean * Math.PI) / 180) });
// Beat seconds that come out as exactly `seconds` whatever the style or speed (a fast span must hold).
const exactly = (seconds: number, settings: MoveSettings) => seconds / Math.max(1e-6, beatSeconds("hold", 1, settings));

// FIRE BLAST: `target` (a character id) or `distance` px ahead; `seconds` = how long the fire pours out.
export type FireBlastParams = { target?: string; distance?: number; seconds?: number; color?: string; color2?: string };

export function fireBlast(start: Stance, params: FireBlastParams, settings: MoveSettings): MoveOutput {
  const power = Math.min(1.5, powerOf(settings));
  const robot = isRobot(settings);
  const feet0 = feetOf(start.pose);
  // ANTICIPATION: both hands pulled back to the hip, lean back, knees bend, hips back over the back foot.
  const windLean = -6 - 5 * power;
  const windAt = -0.03 * power;
  const hip = hipFromShoulder(windLean);
  const windup = plantedLegs(withPose(STAND, { lean: windLean, head: 4, ...hands(windLean, { x: hip.x - 0.07, y: hip.y - 0.04 }, { x: hip.x - 0.09, y: hip.y - 0.01 }) }), feet0, windAt, 0.05 + 0.02 * power);
  // THRUST: the front foot steps in (a lunge: front knee bent, back leg long), the body leans into it, both
  // palms straight out in front at chest height.
  const thrustFeet: Feet = { r: feet0.r, l: feet0.r + 0.34 + 0.04 * power };
  const thrustAt = feet0.r + 0.6 * (thrustFeet.l - thrustFeet.r);
  const thrustLean = 8 + 4 * power;
  const thrustArms = hands(thrustLean, { x: 0.3, y: -0.015 }, { x: 0.29, y: 0.035 });
  const thrust = plantedLegs(withPose(STAND, { lean: thrustLean, head: -4, ...thrustArms }), thrustFeet, thrustAt, backLegDrop(thrustFeet, thrustAt) + 0.03);
  // Half way: the front foot in the air, the hands passing the belly on their way out.
  const midAt = (windAt + thrustAt) / 2;
  const mid = stepPose(withPose(blendPose(windup, thrust, 0.5), hands((windLean + thrustLean) / 2, { x: 0.14, y: 0.16 }, { x: 0.12, y: 0.19 })), feet0, thrustFeet, midAt, 0.05, "l", 0.05);
  // RECOIL (the body reacts away from the energy): the fire pushes him back a little — the hips give back
  // over the back foot, the elbows give, then he braces and leans into the push again.
  const recoilAt = thrustAt - 0.035 * power;
  const recoil = plantedLegs(withPose(thrust, { lean: thrustLean - 5 - 2 * power, head: 0, ...hands(thrustLean - 5, { x: 0.27, y: 0.0 }, { x: 0.26, y: 0.045 }) }), thrustFeet, recoilAt, backLegDrop(thrustFeet, recoilAt) + 0.035);
  const brace = plantedLegs(withPose(thrust, { lean: thrustLean - 1, head: -2, ...hands(thrustLean - 1, { x: 0.295, y: -0.01 }, { x: 0.285, y: 0.04 }) }), thrustFeet, thrustAt - 0.012, backLegDrop(thrustFeet, thrustAt - 0.012) + 0.032);
  // After the fire: the arms come down to the sides, still in the lunge, then he steps back and stands.
  const lowerAt = thrustAt - 0.02;
  const lower = plantedLegs(withPose(STAND, { lean: 3, head: 0, ...hands(3, { x: 0.12, y: 0.24 }, { x: 0.1, y: 0.25 }) }), thrustFeet, lowerAt, backLegDrop(thrustFeet, lowerAt) + 0.02);
  const pour = Math.min(3, Math.max(0.4, Number(params.seconds ?? 0.8)));
  const hold = exactly(Math.max(0.1, pour - 0.18), settings);
  const beats: PlacedBeat[] = [
    { kind: windKind(settings), pose: windup, seconds: 0.36 * (robot ? 0.6 : 1), at: windAt, name: "windup" },
    { kind: "action", pose: mid, seconds: atLeast("action", 0.1, 0.09, settings), at: midAt, contacts: ["rFoot"] },
    { kind: "action", pose: thrust, seconds: atLeast("action", 0.09, 0.08, settings), at: thrustAt, name: "release" },
    { kind: robot ? "settle" : "follow", pose: recoil, seconds: 0.14, at: recoilAt, name: "recoil" },
    { kind: "settle", pose: brace, seconds: 0.18, at: thrustAt - 0.012 },
    { kind: "hold", pose: brace, seconds: hold, at: thrustAt - 0.012, name: "end" },
    { kind: "settle", pose: lower, seconds: 0.35, at: lowerAt },
    ...recoverBeats({ pose: lower, at: lowerAt }, thrustFeet, STAND),
  ];
  return placedBeatsToKeys(start, beats, settings);
}

// WATER SHIELD: `seconds` = how long it stays up; `impactAt` (scene seconds; the planner fills it in when a
// fire blast is aimed at this figure) = when something hits the shield: the holder is pushed back a little and
// braces again, but holds.
export type WaterShieldParams = { seconds?: number; impactAt?: number; color?: string; color2?: string };

export function waterShield(start: Stance, params: WaterShieldParams, settings: MoveSettings): MoveOutput {
  const robot = isRobot(settings);
  const feet0 = feetOf(start.pose);
  // ANTICIPATION: crouch a little, the forearms crossed low in front of the belly, head down.
  const crouchLean = 12;
  const crouch = plantedLegs(withPose(STAND, { lean: crouchLean, head: 8, ...hands(crouchLean, { x: 0.13, y: 0.27 }, { x: 0.16, y: 0.25 }) }), feet0, 0.01, 0.07);
  // RISE: the arms sweep up and spread (one hand up high in front, the other out low), knees braced.
  const holdLean = 5;
  const up = hands(holdLean, { x: 0.2, y: -0.21 }, { x: 0.26, y: 0.12 });
  const holdPose = plantedLegs(withPose(STAND, { lean: holdLean, head: -2, ...up }), feet0, 0.005, 0.035);
  const breathe = plantedLegs(withPose(STAND, { lean: holdLean + 1, head: -2, ...hands(holdLean + 1, { x: 0.205, y: -0.2 }, { x: 0.255, y: 0.13 }) }), feet0, 0.005, 0.04);
  // PUSHED BACK (the body reacts away from where the energy came from): the hips give back, the body leans back,
  // the hands give in toward the chest — then it leans in and braces again. Feet stay down: it holds.
  const pushed = plantedLegs(withPose(STAND, { lean: holdLean - 6, head: 2, ...hands(holdLean - 6, { x: 0.17, y: -0.19 }, { x: 0.22, y: 0.13 }) }), feet0, -0.02, 0.05);
  const lower = withPose(STAND, { lean: 2, ...hands(2, { x: 0.06, y: 0.27 }, { x: 0.04, y: 0.28 }) });
  const total = Math.min(6, Math.max(0.4, Number(params.seconds ?? 1.5)));
  // Up at: start + crouch + rise (real seconds, after the style and speed).
  const crouchS = beatSeconds(windKind(settings), robot ? 0.18 : 0.3, settings);
  const riseS = beatSeconds("action", 0.26, settings);
  const holdFrom = start.t + crouchS + riseS;
  const impact = typeof params.impactAt === "number" && params.impactAt > holdFrom + 0.05 && params.impactAt < holdFrom + total - 0.1 ? params.impactAt - holdFrom : undefined;
  const holdBeats: PlacedBeat[] = [];
  const steady = (seconds: number) => {
    // (Breathing while it holds: small, slow.)
    for (let left = seconds, i = 0; left > 1e-3; i += 1) {
      const s = Math.min(left, 0.6);
      holdBeats.push({ kind: "hold", pose: i % 2 === 0 ? breathe : holdPose, seconds: exactly(s, settings), at: 0.005 });
      left -= s;
    }
  };
  if (impact !== undefined) {
    steady(impact);
    const back = Math.min(0.14, total - impact - 0.05);
    holdBeats.push({ kind: "action", pose: pushed, seconds: exactly(back, settings), at: -0.02, name: "pushed" });
    const again = Math.min(0.3, total - impact - back);
    holdBeats.push({ kind: "settle", pose: holdPose, seconds: exactly(again, settings), at: 0.005 });
    steady(total - impact - back - again);
  } else steady(total);
  holdBeats[holdBeats.length - 1] = { ...holdBeats[holdBeats.length - 1], name: "release" };
  const beats: PlacedBeat[] = [
    { kind: windKind(settings), pose: crouch, seconds: robot ? 0.18 : 0.3, at: 0.01, name: "raise" },
    { kind: "action", pose: holdPose, seconds: 0.26, at: 0.005, name: "hold" },
    ...holdBeats,
    { kind: "settle", pose: plantedLegs(lower, feet0, 0, 0.01), seconds: 0.45, at: 0 },
    { kind: "settle", pose: STAND, seconds: 0.3, at: 0, recover: true },
  ];
  return placedBeatsToKeys(start, beats, settings);
}

// TELEPORT: `to` = the stage x to appear at, or `distance` px (forward +, back -).
// Arthur: "he literally just teleports over there and some quick flash happens" — QUICK: crouch, a quick flash,
// gone, there. Never a dust cloud. And NO TURNING ROUND first: a teleport goes anywhere, in front or behind, and
// the figure keeps facing the way it faced (the move never turns, and the planner adds no turn before it).
export type TeleportParams = { to?: number; distance?: number };
// Crouched before the jump, and crouched after it (seconds): long enough that a picture lands on each side of
// the jump at 8 pictures a second, so the jump is always between two pictures inside the FAST SPAN.
const COVER = 0.14;
const JUMP = 0.004;
// How long each teleport flash lasts (seconds: "flash" in effects/light.ts, sped up to fit). It is brightest
// FLASH_PEAK of the way in, so the "vanish" flash starts that much before the jump and is at its brightest as
// the body goes.
export const TELEPORT_FLASH = 0.15;
const FLASH_PEAK = 0.15 / 0.4; // (light.ts flash: grows for 0.15, fades for 0.25, at speed 1)

export function teleport(start: Stance, params: TeleportParams, settings: MoveSettings): MoveOutput {
  const sign = forwardSign(start.facing);
  const dx = typeof params.to === "number" ? params.to - start.x : sign * Number(params.distance ?? TELEPORT_DISTANCE * settings.height);
  const to = (dx * sign) / settings.height; // forward, x height
  const feet0 = feetOf(start.pose);
  // ANTICIPATION: a deep crouch, leaning in, arms pulled in by the knees (gathering).
  const lean = 20;
  const crouch = plantedLegs(withPose(STAND, { lean, head: 10, ...hands(lean, { x: 0.12, y: 0.3 }, { x: 0.09, y: 0.32 }) }), feet0, 0.02, 0.13);
  const rise = plantedLegs(withPose(STAND, { lean: 6, head: 0, ...hands(6, { x: 0.08, y: 0.27 }, { x: 0.05, y: 0.28 }) }), feet0, 0.01, 0.05);
  const beats: PlacedBeat[] = [
    { kind: windKind(settings), pose: crouch, seconds: isRobot(settings) ? 0.2 : 0.35, at: 0.02, name: "crouch" },
    // VANISH: crouched a moment while the flash flares (the same pose) ...
    { kind: "hold", pose: crouch, seconds: exactly(COVER, settings), at: 0.02 },
    // ... the body is gone in one instant (feet off the floor for that instant, so they can leave) ...
    { kind: "hold", pose: crouch, seconds: exactly(JUMP / 2, settings), at: 0.02 + to / 2, contacts: [] },
    { kind: "hold", pose: crouch, seconds: exactly(JUMP / 2, settings), at: 0.02 + to, name: "appear" },
    // ... and he is there, crouched, in the arrival flash; then he stands up (facing the same way as before).
    { kind: "hold", pose: crouch, seconds: exactly(COVER, settings), at: 0.02 + to, name: "landed" },
    { kind: "settle", pose: rise, seconds: 0.35, at: 0.01 + to },
    { kind: "settle", pose: STAND, seconds: 0.3, at: to, name: "end" },
  ];
  const out = placedBeatsToKeys(start, beats, settings);
  // FAST SPAN (engine.ts fastSpans): from the vanish to just after landing, the hips may cross the page between
  // two pictures (it is under a quick flash).
  const m = out.marks;
  // (The flash at the start spot starts here: it is brightest just as the body goes.)
  m.vanish = Math.max(m.crouch, m.appear - FLASH_PEAK * TELEPORT_FLASH);
  // (It opens a little before the vanish and closes a little after landing — slow, nearly still moments — so at
  // any frame rate, even with pictures moved onto marks, the pictures on each side of the jump are inside it.)
  m.fastFrom = Math.max(start.t, m.crouch - 0.1);
  m.fastTo = Math.min(out.end.t, m.landed + 0.08);
  delete m.landed;
  return out;
}

// ---- Effects --------------------------------------------------------------------------------------------

// How long the fire takes to reach its target (seconds).
export const travelSeconds = (distancePx: number, height: number) => Math.max(0.06, Math.abs(distancePx) / (STREAM_SPEED * height));

type KeysOf = (id: string) => readonly CharacterKey[] | undefined;
// Where a figure's hips are, and which way it faces, at a time (from its keys; else where the plan puts it).
function placeAt(plan: ScenePlan, id: string, t: number, keysOf?: KeysOf): { x: number; facing: Facing } {
  const c = plan.characters.find((ch) => ch.id === id);
  const keys = keysOf?.(id);
  if (!keys || keys.length === 0) return { x: c?.x ?? 960, facing: c?.facing ?? "right" };
  let facing: Facing = c?.facing ?? "right";
  for (const k of keys) { if (k.t > t + 1e-9) break; facing = k.facing ?? facing; }
  if (t <= keys[0].t) return { x: keys[0].x, facing };
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i].t >= t) { const a = keys[i - 1], b = keys[i], u = (t - a.t) / Math.max(1e-9, b.t - a.t); return { x: a.x + (b.x - a.x) * u, facing }; }
  }
  return { x: keys[keys.length - 1].x, facing };
}
const dirOf = (facing: Facing) => (facing === "left" ? -1 : 1);

// Each power action in the plan, with its number and marks.
function powerActions(plan: ScenePlan, marks: Record<string, number>) {
  const out: { id: string; move: string; k: number; params: Record<string, unknown>; mark: (name: string) => number | undefined }[] = [];
  for (const c of plan.characters) {
    const count: Record<string, number> = {};
    for (const a of c.actions) {
      count[a.move] = (count[a.move] ?? 0) + 1;
      if (!POWER_MOVES.has(a.move)) continue;
      const k = count[a.move], move = a.move;
      out.push({ id: c.id, move, k, params: a.params ?? {}, mark: (name) => marks[`${c.id}.${move}${k}.${name}`] });
    }
  }
  return out;
}

// How far a blast's fire flies (px, from the plan's spots): from the hands to the target (a figure's chest, or
// the near edge of its shield), or `distance`.
function blastDistance(plan: ScenePlan, attacker: string, params: Record<string, unknown>, shielded: boolean) {
  const a = plan.characters.find((c) => c.id === attacker);
  const t = typeof params.target === "string" ? plan.characters.find((c) => c.id === params.target) : undefined;
  if (!a) return 0;
  if (!t) return Number(params.distance ?? BLAST_DISTANCE * plan.height);
  const gap = Math.abs(t.x - a.x) - 0.3 * plan.height; // from the hands (about an arm in front)
  return Math.max(0.2 * plan.height, gap - (shielded ? (SHIELD_FORWARD + SHIELD_RADIUS) * plan.height : 0.05 * plan.height));
}

// Is `who` holding a water shield at time t (by the marks)?
function shieldAt(plan: ScenePlan, marks: Record<string, number>, who: string, t: number) {
  return powerActions(plan, marks).find((p) => p.id === who && p.move === "waterShield" && (p.mark("hold") ?? Infinity) <= t + 1e-6 && t <= (p.mark("release") ?? -Infinity) + 1e-6);
}

// When the k-th... fire blast aimed at `who` reaches it (scene seconds), if it is known yet.
export function fireArrival(plan: ScenePlan, marks: Record<string, number>, who: string): number | undefined {
  for (const p of powerActions(plan, marks)) {
    if (p.move !== "fireBlast" || p.params.target !== who) continue;
    const release = p.mark("release");
    if (release !== undefined) return release + travelSeconds(blastDistance(plan, p.id, p.params, true), plan.height);
  }
  return undefined;
}

// The planner's hook (plan.ts): fills in what a power move needs to know about the others before it is built —
// a water shield learns when a fire blast aimed at its holder will hit it (`impactAt`).
export function powerParams(plan: ScenePlan, characterId: string, move: string, params: Record<string, unknown>, marks: Record<string, number>): Record<string, unknown> {
  if (move === "iceMountain" || move === "iceThrow") return iceParams(plan, characterId, move, params); // (ICE: powerIce.ts)
  if (move === "laserEyes") return laserEyesParams(plan, characterId, params); // (LASER EYES: powerLaser.ts)
  if (move !== "waterShield" || params.impactAt !== undefined) return params;
  const impactAt = fireArrival(plan, marks, characterId) ?? iceArrival(plan, marks, characterId);
  return impactAt === undefined ? params : { ...params, impactAt };
}

// The effects every power move in the plan makes, from the built scene's marks ("<id>.<move><k>.<mark>").
// `keysOf` (optional): the built keys of a figure, for where it really is.
// Smoke where fire meets water: gray and light gray (no dark gray).
const STEAM_GRAY = "#9c9c9c", STEAM_LIGHT = "#d9d9d9";

export function powerEffects(plan: ScenePlan, marks: Record<string, number>, keysOf?: KeysOf): EffectTrack[] {
  const h = plan.height, ground = plan.groundY;
  const tracks: EffectTrack[] = [];
  const colors = (params: Record<string, unknown>): EffectParams => ({
    ...(typeof params.color === "string" ? { color: params.color } : {}),
    ...(typeof params.color2 === "string" ? { color2: params.color2 } : {}),
  });
  for (const p of powerActions(plan, marks)) {
    if (p.move === "fireBlast") {
      const release = p.mark("release"), end = p.mark("end");
      if (release === undefined || end === undefined) continue;
      const me = placeAt(plan, p.id, release, keysOf), dir = dirOf(me.facing);
      const targetId = typeof p.params.target === "string" && plan.characters.some((c) => c.id === p.params.target) ? p.params.target : undefined;
      const shielded = targetId ? shieldAt(plan, marks, targetId, release + travelSeconds(blastDistance(plan, p.id, p.params, true), h)) : undefined;
      const travel = travelSeconds(blastDistance(plan, p.id, p.params, !!shielded), h);
      const arrive = release + travel;
      let target: Anchor;
      if (targetId && shielded) {
        // The near edge of the shield, at the height the fire flies.
        const them = placeAt(plan, targetId, arrive, keysOf), theirDir = dirOf(them.facing);
        const rise = STREAM_HEIGHT - (STAND_HIP + SHIELD_UP);
        const across = Math.sqrt(Math.max(0, SHIELD_RADIUS ** 2 - rise ** 2));
        target = { character: targetId, joint: "hip", dx: (theirDir * SHIELD_FORWARD - dir * across) * h, dy: -(SHIELD_UP + rise) * h };
      } else if (targetId) target = { character: targetId, joint: "neck", dy: 0.1 * h };
      else target = { x: me.x + dir * (0.3 * h + Number(p.params.distance ?? BLAST_DISTANCE * h)), y: ground - STREAM_HEIGHT * h };
      const fx = colors(p.params);
      tracks.push({ kind: "fireStream", start: release, end, anchor: { character: p.id, joint: "lHand", dx: dir * 0.02 * h }, target, params: { ...fx, direction: dir > 0 ? 0 : 180, reach: travel } });
      tracks.push({ kind: "fireBurst", start: Math.min(arrive, end), end: end + 0.35, anchor: target, params: { ...fx } });
      // FIRE MEETS WATER (Arthur): plenty of smoke where it hits — gray and light gray, never dark gray: a big puff
      // on impact, then smoke that keeps rising off the hit spot while the fire keeps hitting, and fades after.
      if (shielded) {
        tracks.push({ kind: "smokeBurst", start: Math.min(arrive, end), end: end + 0.7, anchor: target, params: { color: STEAM_GRAY, color2: STEAM_LIGHT, size: 0.45, steam: true, direction: -90 } });
        tracks.push({ kind: "smoke", start: Math.min(arrive, end), end: end + 1.1, anchor: target, params: { color: STEAM_GRAY, color2: STEAM_LIGHT, size: 0.16, intensity: 1.3, wind: -0.15 * dir, steam: true } });
      }
    } else if (p.move === "waterShield") {
      const hold = p.mark("hold"), release = p.mark("release");
      if (hold === undefined || release === undefined) continue;
      const me = placeAt(plan, p.id, hold, keysOf), dir = dirOf(me.facing);
      tracks.push({ kind: "waterShield", start: hold, end: release, anchor: { character: p.id, joint: "hip", dx: dir * SHIELD_FORWARD * h, dy: -SHIELD_UP * h }, params: { size: SHIELD_RADIUS, direction: dir > 0 ? 0 : 180, ...colors(p.params) } });
    } else if (p.move === "teleport") {
      const vanish = p.mark("vanish"), appear = p.mark("appear");
      if (vanish === undefined || appear === undefined) continue;
      const start = placeAt(plan, p.id, vanish, keysOf);
      const from = start.x;
      const there = keysOf?.(p.id)?.length ? placeAt(plan, p.id, appear + 1e-3, keysOf).x
        : typeof p.params.to === "number" ? p.params.to : from + dirOf(start.facing) * Number(p.params.distance ?? TELEPORT_DISTANCE * h);
      const at = (x: number) => ({ x, y: ground - 0.4 * h });
      // A QUICK FLASH at each spot (never a dust cloud): bright as he goes, bright as he arrives, gone in
      // TELEPORT_FLASH seconds. (light.ts "flash" lasts 0.4 s at speed 1, so it is sped up to fit.)
      const quick: EffectParams = { size: 0.7, speed: 0.4 / TELEPORT_FLASH, ...colors(p.params) };
      tracks.push({ kind: "flash", start: vanish, end: vanish + TELEPORT_FLASH, anchor: at(from), params: quick });
      tracks.push({ kind: "flash", start: appear, end: appear + TELEPORT_FLASH, anchor: at(there), params: quick });
    } else if (p.move === "laserEyes") tracks.push(...laserEyesEffects(plan, p, keysOf)); // (LASER EYES: powerLaser.ts)
  }
  tracks.push(...iceEffects(plan, marks, keysOf)); // (ICE: powerIce.ts)
  // (ELEMENTS MEETING, elements.ts — last, once every power's own effects are made: a laser on an ice wall cracks and
  // shatters it, a beam zaps thrown crystals, two beams fired at each other clash...)
  return elementalTracks(plan, marks, tracks, keysOf);
}
