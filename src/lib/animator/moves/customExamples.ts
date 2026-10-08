import type { CustomParams } from "./custom.ts";

// SPEC-0017 Phase 3: five moves nobody taught the engine, written the way the AI writes them — a few rough key poses,
// mostly without times (custom.test.ts checks them; the review sheet draws them).
export const NEVER_TAUGHT: Record<string, CustomParams> = {
  robotDance: { name: "robot dance", keys: [
    { pose: { lShoulder: 90, lElbow: 90, rShoulder: -20, rElbow: 0, head: 10 }, hold: 0.3 },
    { pose: { lShoulder: 0, lElbow: 90, rShoulder: 90, rElbow: 90, head: -10 }, hold: 0.3 },
    { pose: { lShoulder: 175, lElbow: 0, rShoulder: 0, rElbow: 0, lean: -5, head: 0 }, hold: 0.3 },
    { pose: { lShoulder: 90, rShoulder: 90, lElbow: 0, rElbow: 0, lHip: 18, rHip: 15, lKnee: 30, rKnee: 30 }, hold: 0.4 },
  ] },
  tiptoe: { name: "tiptoe", repeat: 2, keys: [
    { pose: { lean: 6, head: 6, lShoulder: 35, rShoulder: 35, lElbow: 110, rElbow: 110, lHip: 35, lKnee: 60, rHip: -5, rKnee: 5 } },
    { pose: { lHip: 18, lKnee: 8, rHip: -18, rKnee: 12 }, dx: 45 },
    { pose: { rHip: 35, rKnee: 60, lHip: -5, lKnee: 5 } },
    { pose: { rHip: 18, rKnee: 8, lHip: -18, lKnee: 12 }, dx: 45 },
  ] },
  victory: { name: "victory celebration", keys: [
    { pose: { lShoulder: 160, rShoulder: 150, lElbow: 20, rElbow: 20, head: -15, lean: -5 }, hold: 0.2 },
    { pose: { lHip: 35, rHip: 30, lKnee: 70, rKnee: 60 }, lift: 45 },
    { pose: { lHip: 3, rHip: -3, lKnee: 3, rKnee: 3 }, hold: 0.3 },
    { pose: { lShoulder: 175, rShoulder: -10, rElbow: 100, head: -20 }, hold: 0.5 },
  ] },
  dab: { name: "dab", keys: [
    { pose: { lean: 15, head: 25, lShoulder: 130, lElbow: 140, rShoulder: 120, rElbow: 0 }, strike: true, hold: 0.6 },
  ] },
  kata: { name: "karate kick kata", keys: [
    { pose: { lean: 5, lHip: 30, lKnee: 25, rHip: -25, rKnee: 15, lShoulder: 70, lElbow: 80, rShoulder: -30, rElbow: 100 }, hold: 0.3 },
    { pose: { rHip: 90, rKnee: 120, lHip: 5, lKnee: 10, lean: -5 } },
    { pose: { rHip: 100, rKnee: 0, lean: -15 }, strike: true },
    { pose: { rHip: 90, rKnee: 120 } },
    { pose: { rHip: -25, rKnee: 15, lHip: 30, lKnee: 25, lean: 5 }, hold: 0.3 },
    { pose: { lShoulder: -20, lElbow: 100, rShoulder: 90, rElbow: 0 }, strike: true, hold: 0.4 },
  ] },
};
