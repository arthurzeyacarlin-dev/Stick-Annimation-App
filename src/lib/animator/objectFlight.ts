// EACH THING FLIES ITS OWN WAY (Arthur, Oct 15, the beach frisbee: "the arm should go almost around him, then fling it, and it should
// act weird in the air — stay in the air, do some weird stuff, then come down to the other figure — that's a frisbee; right now it
// looks like a ball"). What a thrown thing IS picks how it flies and how it is thrown — never one ballistic arc for everything:
//   ballistic — a ball, a rock, a can, a shoe: the gravity arc (objects.ts ballisticPoint), thrown under- or overhand;
//   glide     — a frisbee / flying disc / plate / boomerang: thrown BACKHAND (the arm wraps across the body, then flings out level);
//               flies FLAT with lift: shoots out, climbs a little, HANGS, curves (it banks and swings toward the camera and back),
//               slows, then drifts down to the catcher — about twice as long in the air as a ball over the same gap;
//   swoop     — a paper plane / glider / dart: launched with a push, glides and swoops (dips and climbs), nose along its path;
//   float     — a balloon / feather / leaf / bubble / tissue / petal: barely thrown, drifts slowly, sways side to side, sinks gently.
// Names only — the thing's own words (its id, its name, its look's kind); the plan never has to say how it flies.
export type FlightStyle = "ballistic" | "glide" | "swoop" | "float";

const GLIDE = /\b(frisbee|flying ?disc|disc|disk|plate|saucer|boomerang|ring toss|aerobie)s?\b/i;
const SWOOP = /\b(paper ?(air)?plane|paper ?jet|glider|airplane|aeroplane|plane)s?\b/i;
const FLOAT = /\b(balloon|feather|leaf|leaves|bubble|tissue|petal|napkin|plastic bag|dandelion|confetti)s?\b/i;

export function flightStyleOf(...words: (string | undefined)[]): FlightStyle {
  const w = words.filter(Boolean).join(" ").replace(/[-_]/g, " ");
  if (FLOAT.test(w)) return "float";
  if (SWOOP.test(w)) return "swoop";
  if (GLIDE.test(w)) return "glide";
  return "ballistic";
}

// How much longer than a ball's arc over the same gap the thing stays in the air.
export const FLIGHT_TIME_FACTOR: Record<FlightStyle, number> = { ballistic: 1, glide: 2, swoop: 2.2, float: 3 };

// A flat thing (a disc) is seen nearly edge-on from the side: its height x this.
export const FLAT_SCALE: Record<FlightStyle, number> = { ballistic: 1, glide: 0.38, swoop: 1, float: 1 };

const smooth = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

// Where the thing is at share u of its flight from `from` to `to` (screen px, y down), its bank / nose angle (degrees, + = clockwise)
// and how much nearer the camera it swings (a scale, 1 = not at all). `span` = the gap's width (px).
export function flightPoint(style: FlightStyle, from: { x: number; y: number }, to: { x: number; y: number }, u: number): { x: number; y: number; rotation: number; scale: number } {
  const dx = to.x - from.x, dir = Math.sign(dx) || 1, span = Math.abs(dx);
  const t = Math.min(1, Math.max(0, u));
  if (style === "glide") {
    // fast out of the hand, slower and slower (the air holds it): x speed 1.45 → 0.55
    const along = t + 0.45 * t * (1 - t);
    // lift: it climbs to a flat top early, HANGS there (the top is wide and flat, with a little extra lift in the middle — the "weird"
    // float), then drifts down to the hands
    const top = Math.min(0.22 * span, 40 + 0.14 * span);
    // (a flat-topped hump that peaks early — finite slopes at both hands, so it never pops out of the hand)
    const w = t + 0.3 * t * (1 - t), hang = 1 - (2 * w - 1) ** 4 + 0.1 * Math.sin(3 * Math.PI * t) * Math.sin(Math.PI * t);
    const base = from.y + (to.y - from.y) * smooth(t);
    // it banks: tilted up as it leaves, levels, tips the other way as it settles in
    // (grows in and out of the hands — no snap at the release or the catch)
    const rotation = dir * (-14 * Math.cos(Math.PI * t) + 6 * Math.sin(2 * Math.PI * t)) * smooth(t / 0.15) * smooth((1 - t) / 0.15);
    return { x: from.x + dx * along, y: base - top * hang, rotation, scale: 1 + 0.16 * Math.sin(Math.PI * t) * Math.sin(Math.PI * (t + 0.2)) };
  }
  if (style === "swoop") {
    const top = 0.14 * span;
    const y = from.y + (to.y - from.y) * t - top * Math.sin(Math.PI * t) + 0.06 * span * Math.sin(2.5 * Math.PI * t) * Math.sin(Math.PI * t);
    const dy = (to.y - from.y) - top * Math.PI * Math.cos(Math.PI * t) + 0.06 * span * 2.5 * Math.PI * Math.cos(2.5 * Math.PI * t) * Math.sin(Math.PI * t);
    return { x: from.x + dx * t, y, rotation: (Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI) * dir * smooth(t / 0.15) * smooth((1 - t) / 0.15), scale: 1 };
  }
  if (style === "float") {
    const top = Math.min(0.12 * span, 60);
    const sway = 0.06 * span * Math.sin(3 * Math.PI * t) * Math.sin(Math.PI * t);
    return { x: from.x + dx * smooth(t) + sway * 0.4, y: from.y + (to.y - from.y) * smooth(t) - top * Math.sin(Math.PI * t) + 0.25 * sway, rotation: 18 * Math.sin(3 * Math.PI * t), scale: 1 };
  }
  return { x: from.x + dx * t, y: from.y + (to.y - from.y) * t, rotation: 0, scale: 1 };
}
