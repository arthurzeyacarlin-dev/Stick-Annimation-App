import type { MoveOutput } from "./motion.ts";

// NOBODY MOVES IN PERFECT SYNC (Arthur, Oct 14: "anyone that's in perfect sync is unnatural, period — walking, running, waving,
// pulling"). Two or more figures doing the same move at the same time are never copies: each figure gets its OWN small natural
// differences — it starts a little later, has its own tempo, its own strength and its own breathing phase. They are SEEDED FROM
// THE FIGURE (its place in the scene), so a re-render is identical. The first figure keeps the plain move (lag 0, tempo 1); every
// other figure gets a different, spread-out set (golden-ratio steps, so no two figures land on the same values).
// Only FREE repetition is varied: a move lined up to a moment (`sync`: a catch, a slap, a hit, a duck timed to a ball) keeps its
// exact time, and fight moves keep their own timing (the fight planner already lines strikes and reactions up).
// Tempo is only ever SLOWER (1.04–1.11): a slower copy can never break the natural speed law (moves/timing.ts HAND_SPEED_MAX).
export type Individual = { lag: number; tempo: number; amp: number; phase: number };

const frac = (v: number) => v - Math.floor(v);
export const NEUTRAL: Individual = { lag: 0, tempo: 1, amp: 1, phase: 0 };

// `index` = the figure's place in the scene (0 = the first figure: plain).
export function individuality(index: number): Individual {
  if (!(index > 0)) return NEUTRAL;
  const u = frac(0.31 + index * 0.618034), v = frac(0.17 + index * 0.381966), w = frac(0.53 + index * 0.7548);
  return {
    lag: Math.round((0.04 + 0.1 * u) * 1000) / 1000, // s: starts a little later (0.04–0.14 s) — Arthur: "90% together", a hair apart, never dramatic
    tempo: Math.round((1.02 + 0.04 * v) * 1000) / 1000, // its own (slower) tempo: +2–6 %
    amp: Math.round((0.93 + 0.14 * w) * 1000) / 1000, // its own strength / size: ±7 %
    phase: Math.round(u * 1000) / 1000, // its own breathing / tremble phase (0..1)
  };
}

// The moves that are free repetition (the same move, done side by side, would be a copy): walking, running, waving, cheering,
// celebrating, clapping, dancing. (Pulling varies inside pull.ts — the rope keeps the pullers on one beat.)
export const FREE_MOVES = /^(walk|run|jog|skip|march|wave|cheer|celebrate|clap|dance|bow|nod|talk)$/;

// A move's keys and marks played at `tempo` (> 1 = slower), from its own start time `t0` (the first key stays where it is).
export function atTempo(out: MoveOutput, t0: number, tempo: number): MoveOutput {
  if (tempo === 1) return out;
  const at = (t: number) => t0 + (t - t0) * tempo;
  const marks: Record<string, number> = {};
  for (const [k, t] of Object.entries(out.marks)) marks[k] = at(t);
  return {
    ...out,
    keys: out.keys.map((k) => ({ ...k, t: at(k.t) })),
    end: { ...out.end, t: at(out.end.t) },
    marks,
    ...(out.flow ? { flow: { ...out.flow, stance: { ...out.flow.stance, t: at(out.flow.stance.t) } } } : {}),
  };
}

// 95% TOGETHER, 5% THEIR OWN (Arthur, Oct 15: "red did hooray first, orange did it second ... one's a little faster, maybe one's
// hopping a little — 95% in sync, 5% not, so they don't look like robots"). Timing alone is not enough: two figures doing the
// same free move each pick their OWN NATURAL VERSION of it (a VARIANT), seeded from the figure, so a re-render is identical and
// two figures side by side never pick the same one. Only what the plan left open is filled in (a plan that says the kind keeps it).
// The first figure keeps the plain move. Variants are all whole, lawful moves of the library — never a broken or odd motion.
export const VARIANTS: Record<string, readonly Record<string, unknown>[]> = {
  // celebrate: fist thrust / both arms up "hooray" / a little hop / fist pumps
  celebrate: [{ kind: "thrust" }, { kind: "hooray" }, { kind: "hop" }, { kind: "pump" }],
  // wave: a big wave / a small quick one / a long slow one
  wave: [{}, { size: 0.7, times: 3 }, { size: 1.15, times: 2 }, { size: 0.85, times: 1 }],
  // a nod (talk "yes"): one nod / two / three small ones
  talk: [{}, { times: 1 }, { times: 3 }],
};
// The variant a figure plays (`index` = its place in the scene); params the plan already set always win.
export function ownVersion(move: string, index: number, params: Record<string, unknown>): Record<string, unknown> {
  const list = VARIANTS[move];
  if (!list || !(index > 0)) return params;
  const pick = list[index % list.length];
  const out = { ...params };
  for (const [k, v] of Object.entries(pick)) if (out[k] === undefined) out[k] = v;
  // (its own hand for a celebration (a wave keeps the hand the viewer can see), and its own hold — so even two of the same kind are not copies)
  if (move === "celebrate" && out.hand === undefined && index % 2 === 1) out.hand = "right";
  if (move === "celebrate" && out.seconds === undefined) out.seconds = Math.round((0.8 + 0.5 * frac(0.29 + index * 0.618034)) * 100) / 100;
  return out;
}
// REACTION TIME: after a shared moment (the last heave, a goal), people do not start their free move on the same picture — each
// reacts a little later than the first (0.12–0.34 s), so "one did hooray first, the other second".
export function reactionLag(index: number): number {
  if (!(index > 0)) return 0;
  return Math.round((0.12 + 0.22 * frac(0.43 + index * 0.618034)) * 1000) / 1000;
}
