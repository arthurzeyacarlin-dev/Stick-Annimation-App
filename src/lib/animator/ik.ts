import type { Point } from "./rig.ts";

// Two-bone solver (thigh + shin, or upper arm + forearm). Both bone lengths are kept exactly.
// `bendToward` picks which way the middle joint points (e.g. knees point forward).
export function solveTwoBone(root: Point, target: Point, upperLength: number, lowerLength: number, bendToward: Point) {
  const dx = target.x - root.x, dy = target.y - root.y;
  const rawDistance = Math.hypot(dx, dy);
  const minReach = Math.abs(upperLength - lowerLength) + 1e-3;
  const maxReach = upperLength + lowerLength - 1e-3;
  const distance = Math.min(maxReach, Math.max(minReach, rawDistance));
  const dir = rawDistance > 1e-9 ? { x: dx / rawDistance, y: dy / rawDistance } : { x: 0, y: 1 };
  const cosAlpha = (upperLength * upperLength + distance * distance - lowerLength * lowerLength) / (2 * upperLength * distance);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosAlpha)));
  const candidate = (sign: 1 | -1) => {
    const angle = sign * alpha;
    const rx = dir.x * Math.cos(angle) - dir.y * Math.sin(angle);
    const ry = dir.x * Math.sin(angle) + dir.y * Math.cos(angle);
    return { x: root.x + rx * upperLength, y: root.y + ry * upperLength };
  };
  const a = candidate(1), b = candidate(-1);
  const score = (p: Point) => (p.x - root.x) * bendToward.x + (p.y - root.y) * bendToward.y;
  const mid = score(a) >= score(b) ? a : b;
  const end = { x: root.x + dir.x * distance, y: root.y + dir.y * distance };
  // Recompute the end from the middle joint so the lower bone length is exact.
  const ex = end.x - mid.x, ey = end.y - mid.y;
  const lowerActual = Math.hypot(ex, ey) || 1;
  const exactEnd = { x: mid.x + (ex / lowerActual) * lowerLength, y: mid.y + (ey / lowerActual) * lowerLength };
  return { mid, end: exactEnd, drift: Math.hypot(exactEnd.x - target.x, exactEnd.y - target.y) };
}
