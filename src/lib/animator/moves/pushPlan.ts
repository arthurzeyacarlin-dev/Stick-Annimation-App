// MOVING THINGS — PUSHING IS WALKING (Arthur, Oct 15: "objects are NOT animated": the wheelbarrow / heavy box pusher went
// BACKWARDS — a moonwalk — and the thing never moved). Free, no AI. The AI writes a push as a repeating "custom" (lean in, legs
// apart, `dx` each key) and the custom move keeps the hips within reach of the planted feet and pulls the lean back over them
// (hands on the thing don't count as support), so the hips stay and the back leg trails. A push is really a WALK:
// in a plan, a figure with a thing it pushes in its hand (a prop anchored on its hand whose name is a ROLLING or SLIDING thing —
// a wheelbarrow, cart, stroller, pram, wagon, mower, box, crate, chair, sled…) doing a "custom" whose name says it pushes / wheels /
// drives / shoves it, travelling FORWARD overall, does a real walk instead (`pushing`, plan.ts gaitMove): the legs step forward with
// a real gait (slow, heavy), the upper body keeps the AI's own push pose (lean, both arms locked forward on the handle), and the thing
// in the hand goes ahead of the body at the body's speed. Distance = the custom's own travel (Σ dx × repeat).
// FAMILY: every push of a thing that travels — wheelbarrow, shopping cart, pram, lawn mower, box, crate, sled, wheelchair.
import { STAND, clampPose, type PoseAngles } from "../rig.ts";
import { forwardKinematics } from "../pose.ts";
import { handAt } from "./squat.ts";
import { propBox } from "../laws/propBox.ts";
type Rec = Record<string, unknown>;
export const ROLLS = /\b(wheel ?barrows?|barrows?|carts?|trolley|strollers?|prams?|buggy|wagons?|(lawn ?)?mowers?|wheelchairs?|skateboards?|scooters?|bikes?|bicycles?|balls?|carriages?|dolly)\b/i;
export const SLIDES = /\b(box(es)?|crates?|chairs?|sofa|couch|dresser|cabinets?|trunks?|chests?|desks?|bins?|barrels?|blocks?|boulders?|rocks?|piano|sled|sledge|tables?|fridge|refrigerator|furniture)\b/i;
export const HINGES = /\b(doors?|gates?|lids?|hatch|shutters?)\b/i;
export const SURFACES = /\b(tables?|shelf|shelves|counters?|desks?|benches?|workbench)\b/i;
// What kind of moving thing a name is (rolls on wheels / slides along the floor / swings on a hinge / something to put things on).
export function thingKind(name: string): "rolls" | "slides" | "hinge" | "surface" | undefined {
  if (ROLLS.test(name)) return "rolls";
  if (HINGES.test(name)) return "hinge";
  if (SLIDES.test(name)) return "slides";
  if (SURFACES.test(name)) return "surface";
  return undefined;
}
const PUSH_WORDS = /\b(push\w*|shov\w*|wheel(s|ing)?|driv\w*|roll(s|ing)?)\b/i;
const MOVE_KEYS = ["lean", "head", "lShoulder", "rShoulder", "lElbow", "rElbow"] as const;
const MAX_LEAN = 22; // degrees: a walking pusher leans in this much at most (more and the walk tips over)

export function pushesFromCustom(shot: Rec): Rec {
  const chars = shot.characters as Rec[] | undefined;
  if (!Array.isArray(chars)) return shot;
  const effects = (shot.effects as Rec[] | undefined) ?? [];
  const H = Number(shot.height ?? 300);
  const pushedBy = new Set<string>();
  for (const e of effects) {
    const a = e.anchor as { character?: string; joint?: string } | undefined, name = String((e.params as Rec | undefined)?.name ?? "");
    if (e.kind === "prop" && a?.character && /Hand$/.test(String(a.joint)) && (ROLLS.test(name) || SLIDES.test(name))) pushedBy.add(a.character);
  }
  if (!pushedBy.size) return shot;
  let changed = false;
  const handAbove = new Map<string, number>();
  // (how far below the hand the pushed thing's lowest drawn point is, x height: the hands go DOWN to that height, so the wheel /
  // the box's bottom is on the floor and the handles are in the hands)
  const bottomOf = (e: Rec) => {
    const p = (e.params as Rec | undefined) ?? {};
    if (!Array.isArray(p.parts) || !p.parts.length) return undefined;
    const S = (typeof p.size === "number" && p.size > 0 ? p.size : 0.5) * H;
    let bottom = -Infinity;
    for (const q of p.parts as Part[]) { const y = Number(q.y ?? 0), h = q.shape === "line" ? Number(q.h ?? 0) : Math.abs(Number(q.h ?? 0.3)); bottom = Math.max(bottom, q.shape === "line" ? Math.max(y, y + h) : y + h / 2); }
    return Number.isFinite(bottom) ? (bottom * S) / H : undefined;
  };
  const pushedThing = (id: string) => effects.find((e) => { const a = e.anchor as { character?: string; joint?: string } | undefined, name = String((e.params as Rec | undefined)?.name ?? ""); return e.kind === "prop" && a?.character === id && /Hand$/.test(String(a.joint)) && (ROLLS.test(name) || SLIDES.test(name)); });
  const mapped = chars.map((c) => {
    if (!pushedBy.has(String(c.id))) return c;
    const actions = ((c.actions as Rec[] | undefined) ?? []).map((a) => {
      const p = (a.params as Rec | undefined) ?? {};
      if (a.move !== "custom" || p.seated === true || !PUSH_WORDS.test(String(p.name ?? ""))) return a;
      const keys = Array.isArray(p.keys) ? (p.keys as Rec[]) : [];
      const repeat = Math.max(1, Math.min(8, Math.round(Number(p.repeat ?? 1)) || 1));
      const dx = keys.reduce((s, k) => s + (typeof k.dx === "number" ? k.dx : 0), 0) * repeat;
      if (dx < 0.3 * H) return a; // (a push on the spot, or backwards, stays the AI's own keys)
      // (the upper body of the AI's first key, the lean capped for walking; its hand targets — on the handle / the box's side — are
      // reached with the arms from a standing body, so the thing in the hand stays where the AI drew it: wheel / bottom on the floor)
      const raw = (keys[0]?.pose as Rec | undefined) ?? {};
      const upper: Partial<PoseAngles> = {};
      for (const k of MOVE_KEYS) if (typeof raw[k] === "number") upper[k] = raw[k] as number;
      upper.lean = Math.min(MAX_LEAN, upper.lean ?? 15);
      // (each hand put on its target with the lean FIXED — a walking pusher never folds further in to reach: the arms do the reaching)
      let reached = clampPose({ ...STAND, ...upper }).pose;
      const k0 = (keys[0] ?? {}) as { rHand?: { x?: unknown; y?: unknown }; hand?: { x?: unknown; y?: unknown }; lHand?: { x?: unknown; y?: unknown } };
      const thing = pushedThing(String(c.id)), low = thing ? bottomOf(thing) : undefined;
      for (const [side, tgt0] of [["r", k0.rHand ?? k0.hand], ["l", k0.lHand ?? k0.rHand ?? k0.hand]] as const) {
        // (NOT YET: putting the hands down at the handle height so the wheel is on the ground — Oct 15 try: the arms cannot reach that low
        // without a deeper crouch, so the handles came off the hands; needs the thing to TILT about its wheel first)
        void low; const tgt = tgt0;
        const x = Number(tgt?.x), y = Number(tgt?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const b = forwardKinematics(reached, "right", { x: 0, y: 0 }, 1, "normal", false), floor = Math.max(b.lFoot.y, b.rFoot.y);
        reached = clampPose(handAt(reached, side, Math.max(-1.5, Math.min(1.5, x)) - b.neck.x, floor - Math.max(-0.2, Math.min(2, y)) - b.neck.y)).pose;
      }
      const push: Record<string, number> = {};
      for (const k of MOVE_KEYS) push[k] = Math.round(reached[k] * 10) / 10;
      changed = true;
      // (ON THE GROUND, NOT IN THE AIR — Arthur, Oct 15: "no floating stuff": the pushed thing rides the hands, so its lowest drawn
      // point — the wheel, the box's bottom — is put on the floor for the push pose's hand height; only the handles are in the hands)
      const fk = forwardKinematics(reached, "right", { x: 0, y: 0 }, 1, "normal", false);
      handAbove.set(String(c.id), (Math.max(fk.lFoot.y, fk.rFoot.y) - fk.rHand.y) * H);
      const { params: _p, ...rest } = a; void _p;
      return { ...rest, move: "walk", params: { distance: Math.round(dx), pushing: push } };
    });
    return { ...c, actions };
  });
  return changed ? { ...shot, characters: mapped } : shot;
}

// HINGED DOORS SWING (Arthur, Oct 15: "the door pops open" — the AI draws a door as TWO props, a closed one that ends at `t` and an
// open one that starts at `t` at the same spot: a picture swap). Free, no AI: such a pair (names that say door / gate / lid / hatch,
// one closed — or not open — and one open, the open one starting within a picture of the closed one's end, anchors within 0.1 H, same
// size) becomes ONE hinged door: from `t` it swings for SWING_S seconds — the door panel narrows toward its hinge (a door turning
// away seen face-on), ease in and out, the dark doorway showing behind it — then it is drawn exactly as the AI's open door. Every
// in-between picture keeps the closed door's name and the whole doorway's box, so nothing jumps and nothing appears from nowhere.
// FAMILY: every door, gate, garden gate, cupboard / fridge door, lid, hatch, shutter that opens or closes (closing = the reverse).
const SWING_S = 0.5, SWING_STEPS = 12;
type Part = { shape?: string; x?: number; y?: number; w?: number; h?: number; color?: string };
const OPEN = /\bopen(ed|s)?\b|swung|ajar/i;
const DARK = (c: unknown) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? "")); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) < 200; };
export function doorsSwing(shot: Rec): Rec {
  const effects = shot.effects as Rec[] | undefined;
  if (!Array.isArray(effects)) return shot;
  const H = Number(shot.height ?? 300);
  const nameOf = (e: Rec) => String((e.params as Rec | undefined)?.name ?? "");
  const fixed = (e: Rec) => { const a = e.anchor as { x?: unknown; y?: unknown } | undefined; return a && typeof a.x === "number" && typeof a.y === "number" ? (a as { x: number; y: number }) : undefined; };
  const doors = effects.filter((e) => e.kind === "prop" && HINGES.test(nameOf(e)) && fixed(e));
  const extra: Rec[] = [];
  const replaced = new Map<Rec, Rec>();
  for (const open of doors) {
    if (!OPEN.test(nameOf(open))) continue;
    const t = Number(open.start ?? 0), ao = fixed(open)!;
    const closed = doors.find((c) => c !== open && !OPEN.test(nameOf(c)) && Math.abs(Number(c.end ?? 0) - t) <= 0.05 && Math.hypot(fixed(c)!.x - ao.x, fixed(c)!.y - ao.y) <= 0.1 * H
      && Number((c.params as Rec).size ?? 1) === Number((open.params as Rec).size ?? 1));
    if (!closed || replaced.has(open)) continue;
    const cp = (closed.params as Rec), op = (open.params as Rec);
    const cParts = (Array.isArray(cp.parts) ? cp.parts : []) as Part[], oParts = (Array.isArray(op.parts) ? op.parts : []) as Part[];
    const panel = cParts.find((q) => q.shape === "rect"), hole = oParts.find((q) => q.shape === "rect" && DARK(q.color));
    if (!panel || !hole) continue;
    const W = Number(panel.w ?? 0.4), cx = Number(panel.x ?? 0);
    // (the hinge: the side where the AI drew the open door's edge strip; else the side away from the handle; else the left)
    const strip = oParts.find((q) => q !== hole && q.shape === "rect");
    const knob = cParts.find((q) => q.shape === "circle");
    const side = strip ? (Number(strip.x ?? 0) >= cx ? 1 : -1) : knob ? (Number(knob.x ?? 0) >= cx ? -1 : 1) : -1;
    const hinge = cx + (side * W) / 2, endW = strip ? Math.min(W, Math.abs(Number(strip.w ?? 0.08))) : 0.08 * W;
    const ease = (u: number) => u * u * (3 - 2 * u);
    for (let i = 0; i < SWING_STEPS; i += 1) {
      // (ends exactly on the AI's open-door edge strip: no last-picture jump)
      const endX = strip ? Number(strip.x ?? 0) : hinge - (side * endW) / 2;
      const u = ease((i + 0.5) / SWING_STEPS), w = W + (endW - W) * u, x = cx + (endX - cx) * u;
      const parts: Part[] = [{ ...hole }, { ...panel, x, w }];
      // (the handle turns away with the panel and is hidden once the panel is edge-on)
      if (knob && u < 0.6) parts.push({ ...knob, x: hinge + (Number(knob.x ?? 0) - hinge) * (w / W) });
      extra.push({ ...closed, start: t + (i * SWING_S) / SWING_STEPS, end: t + ((i + 1) * SWING_S) / SWING_STEPS, params: { ...cp, parts, hinge: true } });
    }
    // (then the AI's own open door, under the same name: one door all the way through)
    replaced.set(open, { ...open, start: t + SWING_S, params: { ...op, name: nameOf(closed), was: nameOf(open) } });
  }
  if (!replaced.size) return shot;
  // (the closed door and the swing pictures end when the swing goes on: `hinge` = never stretched to the scene's end, plan.ts)
  const ending = new Set<Rec>();
  for (const [open] of replaced) { const t = Number(open.start ?? 0); for (const c of doors) if (c !== open && !OPEN.test(nameOf(c)) && Math.abs(Number(c.end ?? 0) - t) <= 0.05) ending.add(c); }
  const out = effects.map((e) => replaced.get(e) ?? (ending.has(e) ? { ...e, params: { ...(e.params as Rec), hinge: true } } : e));
  // (the swing pictures go right after the closed door, so the drawing order — what is in front — stays the same)
  const at = Math.max(0, out.findIndex((e) => [...replaced.values()].includes(e)));
  out.splice(at, 0, ...extra);
  return { ...shot, effects: out };
}

// PUT IT DOWN (Arthur, Oct 15: "the kid never puts the book on the table" — only a throw, a pass or a fall ever let go of a held
// thing, so a custom "puts the book on the table" kept it in the hand). Free, no AI: a custom move whose name says it PUTS / PLACES /
// SETS / LAYS / RESTS the thing ON a surface that is drawn in the scene (a prop whose name shares a word with what follows "on": the
// table, the shelf, the counter…; else the nearest surface-kind prop) lets go at its LOWEST hand key — when the held thing is at the
// surface (within 0.35 H across, 0.35 H above its top; a little short = it is slid on over 0.3 s) — and the thing rests on the surface's drawn top right there to the end.
// Too far from the surface → nothing changes (never a jump). FAMILY: a book on a table, a cup on a counter, a box on a shelf, a vase
// on a stand, a plate on a desk, a toy on a bed.
const PLACE_WORDS = /\b(put|puts|putting|place[sd]?|placing|sets?|setting|lays?|laying|rests?|resting|leaves?|drops? off)\b.*?\b(on|onto|upon|on top of)\s+(?:the |a |an |his |her |their |its )?(.+)$/i;
export const SLIDE_ON = 0.3;
type PlaceKey = { t: number; pose: unknown; x: number; facing?: unknown; lift?: number };
export function placeSpot(plan: unknown, name: string, keys: readonly PlaceKey[], centerOf: (k: PlaceKey) => { x: number; y: number } | undefined, half: number): { t: number; x: number; y: number; from?: { x: number; y: number } } | undefined {
  const m = PLACE_WORDS.exec(name);
  if (!m || keys.length < 2) return undefined;
  const p = plan as { effects?: Rec[]; height?: number };
  const H = Number(p.height ?? 300);
  const words = m[3].toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);
  const props = (p.effects ?? []).filter((e) => e.kind === "prop" && typeof (e.anchor as { x?: unknown })?.x === "number" && typeof (e.anchor as { y?: unknown })?.y === "number");
  const named = props.filter((e) => { const n = String((e.params as Rec | undefined)?.name ?? "").toLowerCase(); return words.some((w) => n.includes(w)); });
  const pool = named.length ? named : props.filter((e) => SURFACES.test(String((e.params as Rec | undefined)?.name ?? "")));
  if (!pool.length) return undefined;
  // (the key whose held thing comes CLOSEST to the surface's top — the moment the hand sets it down; a hand hanging at the side
  // afterwards is lower but nowhere near the surface)
  const centers = keys.slice(1).map((k) => ({ k, c: centerOf(k) })).filter((q): q is { k: PlaceKey; c: { x: number; y: number } } => !!q.c);
  let spot: { t: number; x: number; y: number; d: number; c: { x: number; y: number } } | undefined;
  for (const e of pool) {
    const box = propBox(plan as never, e as never);
    if (!box) continue;
    for (const { k, c } of centers) {
      const x = Math.min(box.right - half, Math.max(box.left + half, c.x)), d = Math.abs(x - c.x);
      if (d > 0.35 * H || c.y < box.top - 0.35 * H || c.y > box.top + 0.2 * H) continue;
      const score = Math.hypot(d, c.y - (box.top - half));
      if (!spot || score < Math.hypot(spot.d, spot.c.y - spot.y)) spot = { t: k.t, x, y: box.top - half, d, c };
    }
  }
  const c = spot?.c ?? { x: 0, y: 0 };
  // (a hand that let go a little short of the spot — up to 0.35 H — slides it on: `from` = where it left the hand, eased over SLIDE_ON s)
  return spot ? { t: spot.t, x: spot.x, y: spot.y, ...(spot.d > 0.03 * H || Math.abs(c.y - spot.y) > 0.03 * H ? { from: { x: c.x, y: c.y } } : {}) } : undefined;
}
