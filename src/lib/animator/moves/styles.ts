// SPEC-0017 Phase 2: move styles and speeds. A style changes HOW a move looks (posture, timing,
// swing sizes); the engine's body rules still apply to every style.

export const MOVE_STYLES = ["natural", "robot", "sneaky", "tired", "happy", "angry", "heavy", "hurt", "sad", "irritated"] as const;
export type MoveStyle = (typeof MOVE_STYLES)[number];
export const MOVE_SPEEDS = ["slow", "normal", "fast"] as const;
export type MoveSpeed = (typeof MOVE_SPEEDS)[number];

export type GaitTuning = {
  stepLength: number; // x height
  stepSeconds: number;
  clearance: number; // swing foot lift, x height
  reach: number; // how straight the standing leg is (1 = fully straight)
  dip: number; // knee give after landing, x height
  lean: number; // degrees forward
  head: number; // degrees (negative = chin up)
  armSwing: number; // degrees
  elbowBase: number;
  elbowSwing: number;
  armForward: number; // arms carried forward (degrees), e.g. sneaky hands up
  hold: number; // seconds of stillness after each landing (robot / sneaky)
  crouch?: number; // hips kept this much lower the whole move, x height (knees stay bent: sneaky)
  linear: boolean; // robot: constant-speed, sharp changes
};

type StyleChange = Partial<Omit<GaitTuning, "linear">> & { linear?: boolean; scale?: Partial<Record<"stepLength" | "stepSeconds" | "clearance" | "dip" | "armSwing", number>> };

// Changes on top of the natural walk/run (absolute values replace; `scale` multiplies).
export const STYLE_CHANGES: Record<MoveStyle, StyleChange> = {
  natural: {},
  robot: { reach: 1, dip: 0, lean: 0, head: 0, elbowBase: 4, elbowSwing: 0, hold: 0.1, linear: true, scale: { stepLength: 0.8, stepSeconds: 1.1, clearance: 0.6, armSwing: 1.15 } },
  // Sneaky (Arthur, 2026-10-04): crouched low (hips kept low the whole way), long careful high-stepping strides, slow, leaning in;
  // arms bent and carried close, but still swinging wide and slow with the long steps (round 4: "arms
  // need to pass wider, even when you're sneaky"). A small negative dip lifts the hips a little
  // after each landing, so the deep crouch doesn't sag at the end of each long step.
  sneaky: { reach: 0.84, dip: -0.025, crouch: 0.03, lean: 22, head: -14, elbowBase: 62, elbowSwing: 12, armForward: 4, hold: 0.05, scale: { stepLength: 1.12, stepSeconds: 1.5, clearance: 1.8, armSwing: 1.05 } },
  tired: { lean: 14, head: 18, elbowBase: 8, elbowSwing: 6, scale: { stepLength: 0.75, stepSeconds: 1.3, clearance: 0.5, dip: 1.6, armSwing: 0.95 } },
  happy: { lean: -2, head: -10, elbowBase: 30, scale: { stepLength: 1.05, stepSeconds: 0.85, clearance: 1.3, dip: 1.3, armSwing: 1.6 } },
  angry: { lean: 10, head: 6, elbowBase: 55, scale: { stepLength: 1.15, stepSeconds: 0.8, clearance: 1.1, dip: 1.4, armSwing: 1.4 } },
  heavy: { reach: 0.95, lean: 6, elbowBase: 25, hold: 0.05, scale: { stepLength: 0.85, stepSeconds: 1.3, dip: 2.2, armSwing: 1.1 } },
  hurt: { reach: 0.96, lean: 13, head: 14, elbowBase: 45, elbowSwing: 6, scale: { stepLength: 0.7, stepSeconds: 1.35, clearance: 0.5, dip: 1.4, armSwing: 1 } },
  // MOODS (Arthur's dad, round 7: "the engine needs to know moods: mad, irritated, happy, hurt, sad, tired").
  // Sad: slumped shoulders, head hanging down, slow short steps, arms hanging loose (still
  // swinging past each other, just slowly). Irritated: tense and quick, a little hunched forward, head
  // pushed forward, short sharp steps, arms held a bit bent and stiff, swinging hard. (Mad = angry.)
  // (Round 11, Arthur: "he's dragging his foot behind ... it doesn't look like a walk": a sad walk is still
  // a real walk, each foot lifts clearly off the floor; see EVERY WALK LIFTS ITS FEET in gait.ts.)
  sad: { lean: 10, head: 26, elbowBase: 10, elbowSwing: 4, scale: { stepLength: 0.8, stepSeconds: 1.35, clearance: 0.85, dip: 1.2, armSwing: 0.9 } },
  irritated: { lean: 7, head: 8, elbowBase: 45, elbowSwing: 10, scale: { stepLength: 0.95, stepSeconds: 0.85, clearance: 0.9, dip: 1.2, armSwing: 1.15 } },
};

// How long getting going and stopping takes, x the natural speed-up / slow-down (Arthur, 2026-10-04):
// a healthy person reaches full speed in a bit under a second and stops in a bit under a second; tired, heavy or
// hurt bodies take longer (a hurt one hesitates first); an angry one bursts off. A robot is the only
// one with no speed-up or slow-down at all: it starts and stops at full speed.
export const RAMP_SCALE: Record<MoveStyle, number> = { natural: 1, robot: 0, sneaky: 1.2, tired: 1.4, happy: 0.9, angry: 0.8, heavy: 1.3, hurt: 2.2, sad: 1.5, irritated: 0.85 };

// Slower moves swing the arms slower and a little less (still clearly passing); faster ones a little more.
export const SPEED_CHANGES: Record<MoveSpeed, { stepLength: number; stepSeconds: number; armSwing: number }> = {
  slow: { stepLength: 0.85, stepSeconds: 1.3, armSwing: 0.8 },
  normal: { stepLength: 1, stepSeconds: 1, armSwing: 1 },
  fast: { stepLength: 1.15, stepSeconds: 0.8, armSwing: 1.1 },
};

export function tune(base: GaitTuning, style: MoveStyle, speed: MoveSpeed, energy: number): GaitTuning {
  const change = STYLE_CHANGES[style];
  const out: GaitTuning = { ...base };
  for (const [key, value] of Object.entries(change)) {
    if (key === "scale" || key === "linear") continue;
    (out as Record<string, number | boolean>)[key] = value as number;
  }
  for (const [key, factor] of Object.entries(change.scale ?? {})) (out as Record<string, number | boolean>)[key] = (out[key as keyof GaitTuning] as number) * (factor as number);
  if (change.linear) out.linear = true;
  out.stepLength *= SPEED_CHANGES[speed].stepLength;
  out.stepSeconds *= SPEED_CHANGES[speed].stepSeconds;
  out.armSwing *= SPEED_CHANGES[speed].armSwing;
  // Energy 0..1 (0.5 = normal): bigger swings, deeper knee give and higher steps.
  const e = 0.6 + 0.8 * Math.min(1, Math.max(0, energy));
  out.armSwing *= e;
  out.dip *= e;
  out.clearance *= e;
  return out;
}
