import { STAND, withPose, type PoseAngles } from "../rig.ts";
import { type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { inventPose } from "./poseMaker.ts";
import { feetAhead, hipsOver, levelFeet, placeBeats, safePose, type PlacedBeat } from "./squat.ts";
import { beatsToKeys } from "./motion.ts";

// SPEC-0017 Phase 3 (Arthur, Terra review: "both of his arms just go straight up ... the cool pose with the
// sword when he straightens out his arm — that's a cool celebrating pose, but not holding a sword").
// CELEBRATE = the weapon-victory pose WITHOUT a weapon: ONE arm thrust up high and straight, the OTHER arm
// bent with a clenched fist (pumped), chest up and proud, feet planted. Never both arms straight up by default.
// The engine adds the fundamentals: ANTICIPATION (knees dip, the fist cocked low by the shoulder), a fast
// thrust (action), FOLLOW-THROUGH (the arm and chest go a hair past, then settle), a hold, and the settle back
// to the stand. `kind`: "thrust" (default), "hop" (a small hop into the pose), "pump" (then two fist pumps
// with the bent arm: "yes! yes!"); `seed` varies the angles (poseMaker's victory "pump" rule); `hand`
// left/right = the arm that goes up (default the near one); `seconds` = the hold.

export type CelebrateParams = { kind?: "thrust" | "hop" | "pump"; seed?: number; hand?: "left" | "right"; seconds?: number };
export const CELEBRATE_KINDS = ["thrust", "hop", "pump"] as const;
export const CELEBRATE_ABOUT = "Celebrate a win (no weapon): ANTICIPATION (knees dip, fist cocked low by the shoulder), then ONE arm thrust straight up high while the OTHER arm stays bent with a clenched fist, chest up, feet planted (never both arms straight up); follow-through (a hair past) and settle, hold `seconds` (1), back to the stand. `kind`: thrust (default) / hop (a small hop into it) / pump (then two fist pumps: \"yes! yes!\"); `seed` varies it; `hand` left/right = the arm that goes up. Mark `raised`.";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type Side = "l" | "r";

// The arms (and lean/head) of the victory "pump" pose, the legs of a planted stand.
// (Arthur, round 2: "the arm that is not pointing straight up should be a bit BEHIND his back": by default the
// bent arm is drawn back, the fist just behind the body; "pump" keeps it in front, where it pumps.)
function victoryArms(seed: number, up: Side, behind = false): Pick<PoseAngles, "lean" | "head" | "lShoulder" | "lElbow" | "rShoulder" | "rElbow"> {
  const p = inventPose("victory", seed, "pump").pose; // poseMaker: "l" goes up, "r" stays bent
  const down: Side = up === "l" ? "r" : "l";
  return {
    lean: clamp(p.lean, -8, -2), head: clamp(p.head, -16, -6),
    [`${up}Shoulder`]: p.lShoulder, [`${up}Elbow`]: Math.min(12, Math.abs(p.lElbow)),
    // The bent arm: fist pumped in front of the chest/waist, elbow clearly bent (never a second straight arm up).
    // Behind (Arthur, Phase 3 self-review: "bent behind the back"): elbow back, forearm angled IN toward the small of
    // the back (not hanging straight down), the fist just behind the body at the waist.
    [`${down}Shoulder`]: behind ? clamp(-46 - 0.1 * p.rShoulder, -52, -42) : clamp(p.rShoulder, -10, 25),
    [`${down}Elbow`]: behind ? 72 : clamp(Math.max(p.rElbow, 85), 85, 125),
  } as Pick<PoseAngles, "lean" | "head" | "lShoulder" | "lElbow" | "rShoulder" | "rElbow">;
}

export function celebrate(start: Stance, params: CelebrateParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const kind = CELEBRATE_KINDS.includes(params.kind as never) ? params.kind! : "thrust";
  const seed = Math.abs(Math.round(Number(params.seed ?? 1))) || 1;
  const up: Side = params.hand === "right" ? "r" : "l";
  const down: Side = up === "l" ? "r" : "l";
  const hold = clamp(Number(params.seconds ?? 1), 0.3, 4);
  const feet = feetAhead(start.pose) * H;
  const legs = { lHip: STAND.lHip, rHip: STAND.rHip, lKnee: STAND.lKnee, rKnee: STAND.rKnee };
  const arms = victoryArms(seed, up, kind !== "pump");
  const raised = levelFeet(safePose(withPose(STAND, { ...legs, ...arms })));
  // ANTICIPATION: the opposite way first — knees dip, chest forward and down, the rising fist cocked low by the shoulder.
  // EVERY TAKE-OFF HAS A WIND-UP: the hop dips as deep as a small jump does (a visible crouch, arms back).
  const dip = kind === "hop" ? 44 : 14;
  const ready = levelFeet(safePose(withPose(STAND, {
    lean: 12, head: 8, lHip: STAND.lHip + dip * 0.6, rHip: STAND.rHip + dip * 0.6, lKnee: STAND.lKnee + dip * 1.2, rKnee: STAND.rKnee + dip * 1.2,
    [`${up}Shoulder`]: 25, [`${up}Elbow`]: 125, [`${down}Shoulder`]: kind === "hop" ? -32 : -12, [`${down}Elbow`]: 75,
  } as Partial<PoseAngles>)));
  // FOLLOW-THROUGH: the arm and chest carry a hair past the pose, then settle back into it.
  const past = levelFeet(safePose(withPose(raised, { lean: raised.lean - 4, head: raised.head - 4, [`${up}Shoulder`]: raised[`${up}Shoulder`] + 6, [`${down}Elbow`]: raised[`${down}Elbow`] + 10 } as Partial<PoseAngles>)));
  const placed: PlacedBeat[] = [{ kind: "anticipation", seconds: kind === "hop" ? 0.32 : 0.26, pose: ready, at: hipsOver(feet, ready, H) }];
  if (kind === "hop") {
    // A small hop (the jump's rules, small height): push off into the air with the arm going up, land soft, then the pose.
    const air = levelFeet(safePose(withPose(raised, { lHip: 10, rHip: 4, lKnee: 22, rKnee: 22 })));
    const land = levelFeet(safePose(withPose(raised, { lHip: STAND.lHip + 10, rHip: STAND.rHip + 10, lKnee: STAND.lKnee + 20, rKnee: STAND.rKnee + 20, lean: 4 })));
    placed.push(
      { kind: "action", seconds: 0.2, pose: air, at: hipsOver(feet, air, H), lift: 0.1 * H, contacts: [], liftEase: "out", name: "raised" },
      { kind: "follow", seconds: 0.2, pose: land, at: hipsOver(feet, land, H), lift: 0, liftEase: "in" },
      { kind: "settle", seconds: 0.22, pose: past, at: hipsOver(feet, past, H) },
    );
  } else {
    placed.push(
      { kind: "action", seconds: 0.18, pose: raised, at: hipsOver(feet, raised, H), name: "raised" },
      { kind: "follow", seconds: 0.14, pose: past, at: hipsOver(feet, past, H) },
    );
  }
  placed.push({ kind: "settle", seconds: 0.2, pose: raised, at: hipsOver(feet, raised, H) });
  if (kind === "pump") {
    // Two fist pumps with the bent arm: the fist drives down and back, then comes up again ("yes! yes!").
    const pulled = levelFeet(safePose(withPose(raised, { [`${down}Shoulder`]: -22, [`${down}Elbow`]: 70, lean: raised.lean + 3, head: raised.head + 4 } as Partial<PoseAngles>)));
    for (let i = 0; i < 2; i += 1) placed.push(
      { kind: "action", seconds: 0.14, pose: pulled, at: hipsOver(feet, pulled, H), name: i === 0 ? "pump" : undefined },
      { kind: "follow", seconds: 0.18, pose: raised, at: hipsOver(feet, raised, H) },
    );
  }
  // A held pose still breathes: a small rise of the chest while holding.
  const breath = levelFeet(safePose(withPose(raised, { lean: raised.lean - 1.5, head: raised.head - 2, [`${up}Shoulder`]: raised[`${up}Shoulder`] + 2 } as Partial<PoseAngles>)));
  placed.push(
    { kind: "hold", seconds: hold, pose: breath, at: hipsOver(feet, breath, H), name: "held" },
    { kind: "settle", seconds: 0.45, pose: STAND, at: hipsOver(feet, STAND, H), recover: true },
  );
  return beatsToKeys(start, placeBeats(placed, settings), settings);
}
