// TOOLS DO REAL WORK CYCLES (Arthur, Oct 14, on digging: "no animation of him getting both arms, stabbing it into the dirt with
// the shovel, scooping it up, and putting it in the pile… no animation of the debris… of the hole getting bigger"). A tool job is
// a CYCLE of key poses the engine animates with BOTH HANDS ON THE TOOL: the held prop is anchored at the top hand (the one in the
// plan's prop anchor), the other hand is put on the shaft further down by the arm solver (custom.ts hand targets), and the tool is
// drawn running from the top hand through the lower hand (effects/index.ts forearmOf — two hands on one tool).
// Jobs (each `times` cycles; marks k1..kN per key, `hit` = the first bite):
//   dig    — raise and aim, STAB the blade in (lowest moment = a dig: the hole deepens), lever back, lift the scoop, toss it onto
//            the pile (effects/causes.ts: a dirt clump rides the blade and falls on the pile; the pile grows at each toss).
//   chop   — both hands at the end of the handle, the axe high up behind the head, then DOWN into the log (a strike: `hit`).
//   hammer — a short raise and a quick hit down (one hand).
//   rake   — reach forward, tines down, DRAG toward you (the leaves move — effects/index.ts pushedByTools); sweep = push away.
import { custom, type CustomKey } from "./custom.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";

export type WorkJob = "dig" | "chop" | "hammer" | "rake" | "sweep";
export type WorkParams = { job?: WorkJob; times?: number; tool?: number; hand?: "right" | "left" };

type P = { x: number; y: number };
// One key: the top hand at `top`, the tool pointing along `dir` (facing right, y up); the other hand `down` tool-lengths down the shaft.
function grip(top: P, dir: P, down: number, pose: CustomKey["pose"], extra: Partial<CustomKey> = {}, left = false): CustomKey {
  const L = Math.hypot(dir.x, dir.y) || 1, low = { x: top.x + (dir.x / L) * down, y: top.y + (dir.y / L) * down };
  return left ? { pose, lHand: top, rHand: low, feet: "both", ...extra } : { pose, rHand: top, lHand: low, feet: "both", ...extra };
}

export function workKeys(job: WorkJob, tool: number, left = false): CustomKey[] {
  const d = 0.4 * tool; // (the lower hand: 40% of the tool down from the top hand)
  const g = (top: P, dir: P, pose: CustomKey["pose"], extra: Partial<CustomKey> = {}, down = d) => grip(top, dir, down, pose, extra, left);
  switch (job) {
    case "chop": return [
      g({ x: -0.02, y: 1.22 }, { x: -0.45, y: 0.9 }, { lean: -8, head: -5, lHip: 10, lKnee: 10, rHip: -5, rKnee: 5 }, { hold: 0.15 }, 0.12 * tool),
      g({ x: 0.42, y: 0.5 }, { x: 0.75, y: -0.65 }, { lean: 30, head: 20, lHip: 35, lKnee: 35, rHip: 15, rKnee: 30 }, { strike: true, hold: 0.2 }, 0.12 * tool),
    ];
    case "hammer": return [
      { pose: { lean: 10, head: 15 }, rHand: { x: 0.25, y: 0.95 }, feet: "both", hold: 0.05 },
      { pose: { lean: 18, head: 20 }, rHand: { x: 0.45, y: 0.55 }, feet: "both", strike: true, hold: 0.12 },
    ];
    case "rake": return [
      g({ x: 0.55, y: 0.8 }, { x: 0.55, y: -0.84 }, { lean: 28, head: 15, lHip: 30, lKnee: 20, rHip: 10, rKnee: 15 }, { hold: 0.1 }),
      g({ x: 0.1, y: 0.82 }, { x: 0.75, y: -0.66 }, { lean: 8, head: 10, lHip: 12, lKnee: 12, rHip: 4, rKnee: 8 }, { hold: 0.15 }),
    ];
    case "sweep": return [
      g({ x: 0.05, y: 0.8 }, { x: 0.7, y: -0.72 }, { lean: 10, head: 10 }, { hold: 0.1 }),
      g({ x: 0.45, y: 0.75 }, { x: 0.55, y: -0.84 }, { lean: 25, head: 15, lHip: 25, lKnee: 20 }, { hold: 0.15 }),
    ];
    default: return [ // dig — one cycle ≈ 1.5 s (the `at`s are set by work(): DIG_TIMES)
      // aim: the blade over the ground in front, both hands on the shaft
      g({ x: 0.26, y: 0.86 }, { x: 0.3, y: -0.95 }, { lean: 10, head: 12, lHip: 12, lKnee: 12, rHip: 2, rKnee: 6 }),
      // STAB it in: weight forward and down onto it, knees bent (the lowest moment = a dig)
      g({ x: 0.4, y: 0.56 }, { x: 0.28, y: -0.96 }, { lean: 26, head: 20, lHip: 38, lKnee: 48, rHip: 18, rKnee: 42 }),
      // lever back: the top hand pulls down and back, the blade pries the dirt loose
      g({ x: 0.2, y: 0.52 }, { x: 0.7, y: -0.71 }, { lean: 20, head: 15, lHip: 30, lKnee: 40, rHip: 12, rKnee: 34 }),
      // lift the scoop, blade nearly level (the dirt rides on it)
      g({ x: 0.16, y: 0.72 }, { x: 0.96, y: -0.28 }, { lean: 6, head: 6, lHip: 14, lKnee: 16, rHip: 2, rKnee: 8 }),
      // swing it forward to the pile and dump: the blade swings out level and tips down
      g({ x: 0.32, y: 0.86 }, { x: 0.93, y: -0.36 }, { lean: 2, head: 0, lHip: 8, lKnee: 8, rHip: 0, rKnee: 2 }),
    ];
  }
}
// (DIG timing, seconds into each cycle: aim, stab, lever, lift, dump — a cycle is 1.5 s; the first starts 0.45 s in)
const DIG_TIMES = [0, 0.32, 0.62, 0.92, 1.2], DIG_CYCLE = 1.5, DIG_LEAD = 0.75; // (a calm start: the shovel comes up from the side without a hypersonic hand)

export const WORK_ABOUT = "Tool job, both hands on the tool (prop on the top hand): `job` dig|chop|rake|sweep|hammer, `times`, `tool` length x height (0.5).";

export function work(start: Stance, params: WorkParams, settings: MoveSettings): MoveOutput {
  const job = (["dig", "chop", "hammer", "rake", "sweep"] as const).includes(params?.job as WorkJob) ? (params.job as WorkJob) : "dig";
  const tool = Math.min(1, Math.max(0.25, Number(params?.tool) || 0.5));
  const times = Math.round(Math.min(8, Math.max(1, Number(params?.times) || 3)));
  const keys = workKeys(job, tool, params?.hand === "left");
  if (job === "dig") {
    // (a dig is a brisk, even rhythm: each cycle's keys at fixed times — the engine's own pacing made a 4-dig scene 40 s long)
    const all: CustomKey[] = [];
    const cycles = Math.min(times, 4); // (24 keys at most)
    for (let n = 0; n < cycles; n += 1) keys.forEach((k, j) => all.push({ ...k, at: DIG_LEAD + n * DIG_CYCLE + DIG_TIMES[j] }));
    all.push({ ...keys[0], at: DIG_LEAD + cycles * DIG_CYCLE }); // (back to aim, ready)
    return custom(start, { name: "work: dig", keys: all }, settings);
  }
  return custom(start, { name: `work: ${job}`, repeat: times, keys }, settings);
}
