import type { PoseAngles } from "../rig.ts";
import { centerOfMass } from "./squat.ts";

// BALANCE (Arthur, round 8: "when the stick figure is tired, his back leans by a lot ... it looks like
// he's supposed to be falling. How is he balancing? He's supposed to bend his legs a little, maybe put
// his hands on his knees ... Or just lean his back a little — not by a mile."). A body standing on its
// feet keeps its weight (its centre of mass) over its feet: between the heel of the back foot and the
// toes of the front one, with a little room to spare. So a body that bends forward a lot pushes its hips
// BACK (the knees bend to let them) and props itself with its hands on its knees; a body that only sags
// (a tired fighting stance) leans just a little. The engine works out where the hips go from the pose
// and the planted feet, so it holds for any pose, stance or style — nothing here is a drawn frame.
//
// Units: x height (1 = the figure's standing height), measured forward (+) along the way the figure
// faces, from any origin (usually the hips where the move starts).

// A stick figure's feet are points (the ankles); a real foot reaches a little behind them (heel) and
// further in front (toes).
export const HEEL = 0.02, TOE = 0.06;
// How far inside the support the weight must stay.
export const BALANCE_MARGIN = 0.02;
// centerOfMass (squat.ts) adds up the body parts' shares of the weight; together they are 97%.
const WEIGHT_SHARES = 0.97;

// The ground the planted feet hold the body up over: from the back heel to the front toes. The weight
// aims at the middle between the feet as they are drawn (the ankles), the way a viewer judges it; that
// also leaves the most room the short way (behind the heels).
export function supportOf(feet: readonly number[]) {
  const back = Math.min(...feet), front = Math.max(...feet);
  return { back: back - HEEL, front: front + TOE, middle: (back + front) / 2 };
}

// Where the body's weight is, in front of its hips.
export const weightAhead = (pose: PoseAngles) => centerOfMass(pose) / WEIGHT_SHARES;

// How far inside the support the weight is (negative: outside — the body would fall over), with the hips
// at `at`.
export function balanceMargin(pose: PoseAngles, at: number, feet: readonly number[]) {
  const s = supportOf(feet), w = at + weightAhead(pose);
  return Math.min(w - s.back, s.front - w);
}

// Where the hips go so the weight sits over the middle of the support (or `aim`). `build` gives the pose
// for hips at `at` — its legs re-bent to the planted feet, its hands wherever they rest — since moving
// the hips changes the pose a little too.
export function balancedHips(build: (at: number) => PoseAngles, feet: readonly number[], aim = supportOf(feet).middle): number {
  // (The weight moves almost one for one with the hips, so a few secant steps find the spot.)
  const miss = (at: number) => at + weightAhead(build(at)) - aim;
  let a = aim - weightAhead(build(aim)), fa = miss(a);
  let b = a - fa, fb = miss(b);
  for (let i = 0; i < 12 && Math.abs(fb) > 1e-6; i += 1) {
    const slope = (fb - fa) / (Math.abs(b - a) > 1e-9 ? b - a : 1e-9);
    const next = b - fb / (slope > 0.2 && slope < 5 ? slope : 1);
    a = b; fa = fb; b = next; fb = miss(b);
  }
  return b;
}
