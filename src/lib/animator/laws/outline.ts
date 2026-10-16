// ONE TRUTH FOR THE LAWS (Oct 15 core audit: "10 files each compute where a thing is — the hazard code put the stove 100 px higher
// than it's drawn"). A contact law measures the REAL gap between a hand / foot / tool tip and the DRAWN outline of what it touches,
// on the FINAL frames, and passes only within CONTACT_GAP_PX (flat px) — never "+ half the object size", never 0.02–0.03 H slack.
// Where the outline comes from, best first:
//   1. the World (world.ts `worldAt`, when the build carries it): the exact drawn outline of every thing and figure at picture i;
//   2. what the page draws (the effect recipe's own shapes at picture i — measure.ts drawnBox);
//   3. propBox (the box a fixed prop is drawn in).
// So a law can never pass something drawn wrong: it looks where the page draws.
// Family: every touch law — held things, hands on things, honest hands, hits that land, touches that cause, rope grips, hugs,
// hazards (burn / shock / cold / spikes), touch intents.
export type P = { x: number; y: number };
export type BoxO = { left: number; right: number; top: number; bottom: number };
export type Outline = { box?: BoxO; circle?: { x: number; y: number; r: number }; points?: P[]; segs?: [P, P][]; pad?: number };

export const CONTACT_GAP_PX = 2; // a touch is a touch within this (flat px) of the drawn outline
export const LEGACY_HOLD_GAP = 0.01; // x H: an UNDECLARED legacy hold keeps this small gap tolerance until its move declares the contact

export const segGap = (p: P, a: P, b: P) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)); return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy); };
const inPoly = (p: P, pts: P[]) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside; } return inside; };
export const boxGap = (b: BoxO, p: P) => Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom));

// The gap (px, ≥ 0; 0 = on or inside) from a point to a drawn outline.
export function outlineGap(o: Outline, p: P): number {
  let best = Infinity;
  const pad = o.pad ?? 0;
  if (o.points && o.points.length >= 3) {
    if (inPoly(p, o.points)) return 0;
    for (let i = 0; i < o.points.length; i += 1) best = Math.min(best, segGap(p, o.points[i], o.points[(i + 1) % o.points.length]));
  } else if (o.points?.length) for (let i = 0; i + 1 < o.points.length; i += 1) best = Math.min(best, segGap(p, o.points[i], o.points[i + 1]));
  if (o.segs) for (const [a, b] of o.segs) best = Math.min(best, segGap(p, a, b));
  if (o.circle) best = Math.min(best, Math.max(0, Math.hypot(p.x - o.circle.x, p.y - o.circle.y) - o.circle.r));
  if (o.box) best = Math.min(best, boxGap(o.box, p));
  return Number.isFinite(best) ? Math.max(0, best - pad) : Infinity;
}

// --- the World (world.ts), read defensively: the build may carry `worldAt(i)` or `world[i]`; each picture lists things and
// figures with their drawn outline (`outline` / `points` / `box` / `circle`). Anything missing → null (the caller falls back).
type WorldEntry = { id?: string; key?: string; name?: string; outline?: unknown; points?: unknown; box?: unknown; circle?: unknown; segs?: unknown };
const asPts = (v: unknown): P[] | undefined => {
  if (!Array.isArray(v) || !v.length) return undefined;
  if (typeof v[0] === "number") { const o: P[] = []; for (let k = 0; k + 1 < v.length; k += 2) o.push({ x: v[k] as number, y: v[k + 1] as number }); return o; }
  if (v[0] && typeof (v[0] as P).x === "number") return v as P[];
  if (Array.isArray(v[0])) return asPts((v as unknown[]).flat()); // (several closed shapes: their points — a close enough outline)
  return undefined;
};
const toOutline = (e: WorldEntry): Outline | null => {
  const pts = asPts(e.outline) ?? asPts(e.points);
  const b = e.box as BoxO | undefined, c = e.circle as Outline["circle"] | undefined;
  const o: Outline = { ...(pts ? { points: pts } : {}), ...(b && typeof b.left === "number" ? { box: b } : {}), ...(c && typeof c.r === "number" ? { circle: c } : {}), ...(Array.isArray(e.segs) ? { segs: e.segs as [P, P][] } : {}) };
  return o.points || o.box || o.circle || o.segs ? o : null;
};
export function worldPicture(built: unknown, i: number): WorldEntry[] | null {
  const b = built as { worldAt?: (i: number) => unknown; world?: unknown[] };
  let w: unknown = null;
  try { w = typeof b.worldAt === "function" ? b.worldAt(i) : Array.isArray(b.world) ? b.world[i] : null; } catch { w = null; }
  if (!w) return null;
  const rec = w as { things?: unknown; objects?: unknown; props?: unknown; figures?: unknown };
  const list = Array.isArray(w) ? w : [rec.things, rec.objects, rec.props, rec.figures].flatMap((x) => (Array.isArray(x) ? x : []));
  return (list as WorldEntry[]).filter((x) => x && typeof x === "object");
}
// The World's drawn outline of a thing at picture i, by any of its ids (object id, script id, name).
export function worldOutline(built: unknown, i: number, ids: readonly (string | undefined)[]): Outline | null {
  const pic = worldPicture(built, i);
  if (!pic) return null;
  const want = ids.filter((x): x is string => typeof x === "string" && x.length > 0);
  const hit = pic.find((e) => want.some((id) => e.id === id || e.key === id || e.name === id));
  return hit ? toOutline(hit) : null;
}
// A figure's drawn body (bones as segments + its head circle), padded by half the line it is drawn with.
type Sk = Record<string, P>;
export const BODY_BONES: [string, string][] = [["head", "neck"], ["neck", "hip"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]];
export function bodyOutline(sk: Sk, headRadius: number, thickness: number, bones: [string, string][] = BODY_BONES): Outline {
  return { segs: bones.filter(([a, b]) => sk[a] && sk[b]).map(([a, b]) => [sk[a], sk[b]] as [P, P]), ...(sk.head ? { circle: { x: sk.head.x, y: sk.head.y, r: headRadius } } : {}), pad: thickness / 2 };
}

// TOUCH INTENT (Oct 15 audit: custom "touch/shake" moves had no contact at all): a custom move whose NAME says the hand goes onto
// something. Returns the touch verb, or null. ("shakes his fist / head", "pushes off", "holds still / on / up his hand" are not touches.)
const TOUCH_VERB = /\b(touch|touches|touching|hold|holds|holding|shake|shakes|shaking|handshake|press|presses|pressing|push|pushes|pushing|catch|catches|catching|grab|grabs|grabbing|knock|knocks|knocking|pat|pats|patting|tap|taps|tapping)\b/i;
const NOT_A_TOUCH = /\b(shak\w*\s+(his|her|their|its|the|a)?\s*(own\s+)?(fist|head|finger|hips|legs|body|arms?|hands? (in the air|out))|hold\w*\s+(still|on|up (his|her|their) (hand|arm)s?|breath|position|pose|the pose)|push\w*\s+(off|up|ups|himself|herself|forward|through)|knock\w*\s+(out|over|down) (himself|herself)|catch\w*\s+(his|her|their)\s+breath|(hold|press|pat|tap|touch|grab|rub|shak)\w*\s+(his|her|their|its)\s+(own\s+)?(arms?|hands?|head|face|breath|belly|stomach|tummy|chest|knees?|sides?|ears?|nose|chin|hips?|heart|fists?)\b|air\s*(guitar|punch|kiss)|\bmimes?\b|pretends?)\b/i;
// (true = the words say it is NOT a touch of something: a gesture, a self-touch, "pushes off")
export function notATouch(name: string): boolean { return !!name && NOT_A_TOUCH.test(name); }
export function touchVerb(name: string): string | null {
  if (!name || NOT_A_TOUCH.test(name)) return null;
  const m = TOUCH_VERB.exec(name);
  return m ? m[1].toLowerCase() : null;
}
// WHAT the touch is ON: the words after the touch verb up to a comma / "and" / "then" / "while" / "as" (the object phrase). Null =
// no object (a skater "pushes twice"), or the figure's OWN body ("grabs at his head", "shakes the snow off her hair") — a self-touch
// is not a touch of a target. A handshake's object is the partner's hand.
const SELF_PART = /\b(his|her|their|its|my)\s+(own\s+)?(head|hair|face|cheeks?|eyes?|ears?|nose|mouth|chin|neck|shoulders?|arms?|hands?|fingers?|fists?|chest|belly|stomach|tummy|sides?|hips?|knees?|legs?|feet|foot|back|heart|body|clothes|shirt|pants|hat|cap)\b/i;
const OBJECT_START = /^(the|a|an|on|at|onto|into|against|his|her|their|its|them|him|it|each|both|hands?|[A-Z][a-z]+)\b/;
export function touchObject(name: string): string | null {
  const m = TOUCH_VERB.exec(name ?? "");
  if (!m || NOT_A_TOUCH.test(name)) return null;
  if (/handshake|shak\w*\s+(his|her|their|the)?\s*hands?/i.test(name)) return "hand";
  const rest = name.slice(m.index + m[0].length).trim().split(/\s*(?:,|;|:|\.|\band\b|\bthen\b|\bwhile\b|\bas\b|\bbefore\b|\bafter\b|\bwith\s+(?:his|her|their)\b)\s*/i)[0].trim();
  if (!rest || !OBJECT_START.test(rest)) return null;
  // (a self-touch: the object is the figure's own body part — "his head", "off her hair"; "his friend on the back" is a target)
  if (SELF_PART.test(rest) && !/\b(on|at)\s+the\b/i.test(rest) && !/\b(his|her|their)\s+(friend|partner|brother|sister|mom|dad|mother|father|son|daughter|grandpa|grandma|teammate|opponent|dog|cat)\b/i.test(rest)) return null;
  return rest;
}

