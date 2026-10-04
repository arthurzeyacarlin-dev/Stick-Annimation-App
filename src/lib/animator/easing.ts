// Timing curves. "smooth" = monotone cubic through the keys: soft start and stop,
// no overshoot, and no full stop at every key (only where the motion turns around).
export type Ease = "smooth" | "linear" | "in" | "out" | "inOut";

export const easeValue = (ease: Exclude<Ease, "smooth">, u: number) => {
  const t = Math.min(1, Math.max(0, u));
  if (ease === "linear") return t;
  if (ease === "in") return t * t; // speeds up (falling)
  if (ease === "out") return 1 - (1 - t) * (1 - t); // slows down (rising)
  return t * t * (3 - 2 * t);
};

// Fritsch–Butland tangents: zero at both ends and at turning points, monotone elsewhere.
export function monotoneTangents(times: readonly number[], values: readonly number[]): number[] {
  const n = values.length;
  const tangents = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const h0 = times[i] - times[i - 1], h1 = times[i + 1] - times[i];
    const d0 = (values[i] - values[i - 1]) / h0, d1 = (values[i + 1] - values[i]) / h1;
    if (d0 * d1 <= 0) continue;
    tangents[i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  }
  return tangents;
}

// Sample one channel at time t. eases[i] (if not "smooth") overrides the segment that starts at key i.
export function sampleChannel(times: readonly number[], values: readonly number[], tangents: readonly number[], eases: readonly (Ease | undefined)[], t: number): number {
  const n = values.length;
  if (n === 0) return 0;
  if (t <= times[0] || n === 1) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let i = 0;
  while (i < n - 2 && t >= times[i + 1]) i += 1;
  const h = times[i + 1] - times[i];
  const u = h > 0 ? (t - times[i]) / h : 1;
  const ease = eases[i] ?? "smooth";
  if (ease !== "smooth") return values[i] + (values[i + 1] - values[i]) * easeValue(ease, u);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * values[i] + (u3 - 2 * u2 + u) * h * tangents[i] + (-2 * u3 + 3 * u2) * values[i + 1] + (u3 - u2) * h * tangents[i + 1];
}

// Keep each step of a freely turning angle under half a turn (shortest way round).
export const unwrapAngles = (values: readonly number[]) => {
  const out: number[] = [];
  for (const value of values) {
    if (out.length === 0) { out.push(value); continue; }
    let next = value;
    const previous = out[out.length - 1];
    while (next - previous > 180) next -= 360;
    while (next - previous < -180) next += 360;
    out.push(next);
  }
  return out;
};
