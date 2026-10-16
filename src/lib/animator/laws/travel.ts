// LAW "travelSpeed" (broken) — Oct 14, Arthur on the skateboard ollie: "he's going the speed of sound". The natural-speed law
// (tooFast) only measured hands and feet against the hip; nothing measured the WHOLE BODY travelling over the ground. A body has a
// top travel speed for each activity (hip x a second, in its own heights): walk ~1.6, jog ~3, run ~5, sprint ~6.5, a skateboard or
// scooter ~4 — and it cannot start or stop travelling instantly (acceleration limit). Flights, falls, hits, jumps and powers
// (moves/timing.ts FAST_MOVES) are thrown by forces and are not judged here; a time lapse steps aside; asked-for speed gets 25 %.
import type { CharacterPlan } from "../moves/plan.ts";
import { FAST_MOVES, FAST_WORDS } from "../moves/timing.ts";

export const TRAVEL_MAX: [RegExp, number][] = [
  [/sprint|race|dash/i, 6.5], [/run|chase|flee/i, 5], [/jog|skip/i, 3],
  [/ride|skate|scooter|board|bike|cycl|sled|roll/i, 4], [/walk|tiptoe|sneak|stroll|escort|march/i, 1.6],
];
export const TRAVEL_DEFAULT = 1.8; // H/s: any other move (a step in, a hug, an original move): not faster than a brisk walk
export const TRAVEL_ACCEL_MAX = 7; // H/s²: the hips' travel speed changes at most this fast (a sprint start ≈ 4–6)
// (a RUN or sprint may brake harder: the library's passed fast angry run stops at ~10 H/s² — a skidding quick stop)
export const TRAVEL_ACCEL_RUN = 12;
const LAPSE = /\b(time ?lapse|timelapse|fast[- ]forward|sped up)\b/i;

export type TravelMeasure = { law: string; ok: boolean; value: number; limit: number; at?: number; who?: string; say: string };
export function travelLimit(move: string): number | null {
  for (const [re, v] of TRAVEL_MAX) if (re.test(move)) return v;
  return FAST_MOVES.test(move) ? null : TRAVEL_DEFAULT;
}

// hipX(id)[i] = the figure's hip x at picture i (undefined: not on the page); beats: each move's name and the time its last mark is
// reached (a picture belongs to the next beat to end).
export function travelSpeedLaw(characters: CharacterPlan[], hipX: (id: string) => (number | undefined)[], heightOf: (id: string) => number,
  beatsOf: (id: string) => { name: string; end: number }[], fps: number, cuts: number[], words: string, sayName: (id: string) => string): TravelMeasure {
  if (LAPSE.test(words)) return { law: "travelSpeed", ok: true, value: 0, limit: 0, say: "A time lapse: the travel-speed law steps aside." };
  const boost = FAST_WORDS.test(words) ? 1.25 : 1;
  const w = Math.max(2, Math.round(0.25 * fps)); // speed over a quarter second (a stride's sway does not count)
  let worst = 0, worstLim = 1, at: number | undefined, whoF = "", act = "", acc = 0, accAt: number | undefined, accWho = "";
  for (const c of characters) {
    const xs = hipX(c.id), Hc = heightOf(c.id), beats = beatsOf(c.id);
    // (a figure set to "fast" — or an action that is — was asked to hurry: its own limits get the same 25 %)
    const own = boost > 1 || (c as { speed?: string }).speed === "fast" || (c.actions ?? []).some((a) => (a as { speed?: string }).speed === "fast") ? 1.25 : 1;
    const nameAt = (t: number) => (beats.find((b) => b.end >= t - 1e-6) ?? beats[beats.length - 1])?.name ?? "stand";
    const v: (number | null)[] = xs.map(() => null);
    for (let i = w; i < xs.length; i += 1) {
      const a = xs[i - w], b = xs[i];
      if (a === undefined || b === undefined || cuts.some((k) => k > i - w && k <= i)) continue;
      const t0 = (i - w) / fps, t1 = i / fps, m0 = nameAt(t0), m1 = nameAt(t1);
      const l0 = travelLimit(m0), l1 = travelLimit(m1);
      if (l0 === null || l1 === null) continue; // thrown by a force (a hit, a fall, a jump, a power)
      v[i] = Math.abs(b - a) * fps / w / Hc;
      const lim = Math.max(l0, l1) * own;
      if (v[i]! / lim > worst / worstLim) { worst = v[i]!; worstLim = lim; at = t1; whoF = c.id; act = m1; }
      const p = v[i - w];
      if (p !== null && p !== undefined) { const d = Math.abs(v[i]! - p) / (w / fps) * (TRAVEL_ACCEL_MAX / (Math.max(l0, l1) >= 5 ? TRAVEL_ACCEL_RUN : TRAVEL_ACCEL_MAX)); if (d > acc) { acc = d; accAt = t1; accWho = c.id; } }
    }
  }
  const fast = worst > worstLim + 1e-6, jerk = acc > TRAVEL_ACCEL_MAX * boost + 1e-6;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { law: "travelSpeed", ok: !fast && !jerk, value: Math.round(worst * 100) / 100, limit: worstLim, at: fast ? at : jerk ? accAt : at, who: (fast ? whoF : jerk ? accWho : whoF) || undefined,
    say: fast ? `${sayName(whoF)} travels at ${r1(worst)} body heights a second at ${r1(at ?? 0)} s during "${act}": too fast (a person's top speed for that is ${worstLim} H a second).`
      : jerk ? `${sayName(accWho)} starts or stops travelling too suddenly at ${r1(accAt ?? 0)} s (speed changes ${r1(acc)} H a second² scaled to a walk's limit ${TRAVEL_ACCEL_MAX}; a run may brake up to ${TRAVEL_ACCEL_RUN}): speed builds up and eases down.`
      : `Everyone travels at a natural speed (fastest ${r1(worst)} H a second, limit ${worstLim}) and speeds up and slows down smoothly.` };
}
