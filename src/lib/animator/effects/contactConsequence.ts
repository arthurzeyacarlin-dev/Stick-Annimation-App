// A CONTACT HAS A CONSEQUENCE ON THE BODY (Arthur, Oct 15: "his arms are IN the fire — he's supposed to get burned. Close to an
// electric fence and touching it — he's supposed to get electrocuted. Hand on ice — it's supposed to hurt"; the karate board:
// "the energy is supposed to transfer — the holder's arms bend a little from the impact, just like if he got punched").
// Broad rules applied to EVERY built scene, from the real built frames (never a guessed time):
// 1. HAZARD TOUCH → REACTION: a hand that enters a hazard — a burning fire / flame, an electric fence / live wire, ice / snow,
//    spikes / thorns / cactus, a hot stove / pan / grill / lava — reacts within ~0.12 s by the hazard's kind:
//      burn  = the hand jerks out up to the face and shakes (blowing on it), the body flinches back;
//      shock = a stiff jolt back, the whole body trembles, the hand is let go (pulled away);
//      cold  = flinch back, both hands come together at the chest and rub;
//      spikes= jump back a little, the hand pulled in to the chest.
//    The hand stays OUT for as long as the plan would have had it in (it never goes back in), then eases home.
//    A hazard marked `touch: "avoid"` (the plan only wants warmth — "warms his hands by the fire") is never touched at all: the
//    hand stops a small gap before it (no reaction: nothing happened). `touch: "safe"` = on purpose (a fire-proof hero).
// 2. AN IMPACT TRANSFERS THROUGH A HELD THING: a strike on something a figure holds (board, pad, shield, bat, a caught ball) —
//    or a held thing that breaks — pushes the holder like a hit: the arms give back (elbows bend) by the strike's power, the
//    upper body rocks back, harder hits rock more and dip the knees; quick give, slow recovery (takeHit).
import type { FrameCharacter, Scene, SceneFrames } from "../engine.ts";
import type { EffectRecipe, EffectTrack, Point, Shape } from "./types.ts";
import type { Skeleton } from "../rig.ts";
import { worldAt, type World } from "../world.ts";

export type HazardKind = "burn" | "shock" | "cold" | "spikes";
export type HazardZone = { kind: HazardKind; cx: number; cy: number; rx: number; ry: number; mode: "react" | "avoid" | "safe"; what: string; lighter?: string; litBy?: string; litUntil?: number };
const BURN = /\b(fire|flames?|campfire|bonfire|torch flame|stove|hot ?plate|hot pan|frying pan|grill|lava|oven|iron|kettle|embers?|coals?)\b/i;
const SHOCK = /\b(electric|electrified|live wire|power ?line|high voltage|tesla|zapper|electric fence)\b/i;
const COLD = /\b(ice|icy|iceberg|snow|frozen|frost|icicle|freezer|dry ice)\b/i;
const SPIKES = /\b(spikes?|thorns?|cactus|barbed|nails? bed|bed of nails|razor)\b/i;
const FLAMES = new Set(["fire", "wildfire"]);
const LIGHTING = 1; // (s: the hand that lit a fire may still be at it this long after it catches — the touches law's window — then eases away over 0.4 s)

export function hazardKindOf(name: string): HazardKind | undefined {
  if (SHOCK.test(name)) return "shock";
  if (BURN.test(name)) return "burn";
  if (COLD.test(name)) return "cold";
  if (SPIKES.test(name)) return "spikes";
  return undefined;
}
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const modeOf = (e: EffectTrack): HazardZone["mode"] => e.params?.touch === "avoid" ? "avoid" : e.params?.touch === "safe" ? "safe" : "react";

// The hazards in the scene at time t (fixed spots only: a torch in one's own hand is not a hazard to its holder).
// `world` (world.ts worldAt): when given, a prop's zone is its DRAWN box — the one world every checker reads — not a box
// guessed from its parts round the anchor (the hot stove drawn at y 801–900 was "burning" a hand at y 760).
export function hazardZones(effects: readonly EffectTrack[], H: number, t: number, world?: World): HazardZone[] {
  const out: HazardZone[] = [];
  for (let index = 0; index < effects.length; index += 1) {
    const e = effects[index];
    if (t < e.start || t > e.end || !("x" in e.anchor) || "character" in e.anchor || "object" in e.anchor) continue;
    const a = e.anchor as Point;
    if (FLAMES.has(e.kind)) {
      // (the flame grows from a flicker over ~1 s: it only burns once it is there)
      const grow = num(e.params?.grow, 0), k = grow > 0 ? Math.min(1, Math.max(0.25, (t - e.start) / grow)) : 1;
      const h = num(e.params?.size, 0.35) * H * k;
      // (THE HAND THAT LIGHTS IT is there on purpose: the match / torch hand — the fire's `cause` — is not burned while it lights
      // it, for its first second)
      const c = (e as { cause?: { character?: string; joint?: string } }).cause, litBy = c?.character && c.joint ? `${c.character}:${c.joint}` : undefined;
      out.push({ kind: "burn", cx: a.x, cy: a.y - 0.42 * h, rx: 0.3 * h + 0.02 * H, ry: 0.5 * h, mode: modeOf(e), what: "the fire", ...(litBy ? { litBy, litUntil: e.start + LIGHTING, ...(t < e.start + LIGHTING + 0.4 ? { lighter: litBy } : {}) } : {}) });
      continue;
    }
    if (e.kind !== "prop") continue;
    const name = String(e.params?.name ?? e.params?.symbol ?? "");
    const kind = hazardKindOf(name) ?? (e.params?.hazard ? hazardKindOf(String(e.params.hazard)) ?? (["burn", "shock", "cold", "spikes"].includes(String(e.params.hazard)) ? e.params.hazard as HazardKind : undefined) : undefined);
    if (!kind) continue;
    const parts = (Array.isArray(e.params?.parts) ? e.params!.parts : []) as { shape?: string; x?: number; y?: number; w?: number; h?: number }[];
    const sz = num(e.params?.size, 0.2) * H;
    // (a "line" part runs from (x, y) by (w, h); every other part is centred on (x, y))
    const ext = (q: (typeof parts)[number], c: "x" | "y", d: "w" | "h") => q.shape === "line" ? Math.max(Math.abs(num(q[c], 0)), Math.abs(num(q[c], 0) + num(q[d], 0))) : Math.abs(num(q[c], 0)) + Math.abs(num(q[d], 0.3)) / 2;
    const w = parts.length ? Math.max(...parts.map((q) => ext(q, "x", "w"))) * sz : 0.5 * sz;
    const hh = parts.length ? Math.max(...parts.map((q) => ext(q, "y", "h"))) * sz : 0.5 * sz;
    // (a box, treated as a rounded box: inside = within its half-width and half-height)
    const drawn = world?.thing(index)?.box;
    if (drawn) { out.push({ kind, cx: (drawn.left + drawn.right) / 2, cy: (drawn.top + drawn.bottom) / 2, rx: (drawn.right - drawn.left) / 2, ry: (drawn.bottom - drawn.top) / 2, mode: modeOf(e), what: `the ${name}` }); continue; }
    out.push({ kind, cx: a.x, cy: a.y, rx: w, ry: hh, mode: modeOf(e), what: `the ${name}` });
  }
  return out;
}
// How far inside (≤ 0) or outside (> 0) a point is, in px (flames are ovals, things are boxes).
export function hazardGap(z: HazardZone, p: Point): number {
  if (z.kind === "burn" && z.what === "the fire") {
    const dx = (p.x - z.cx) / z.rx, dy = (p.y - z.cy) / z.ry, r = Math.hypot(dx, dy);
    return (r - 1) * Math.min(z.rx, z.ry);
  }
  return Math.max(Math.abs(p.x - z.cx) - z.rx, Math.abs(p.y - z.cy) - z.ry);
}

// --- body helpers (lengths kept: arms solved with two-bone IK, the upper body turned rigidly about the hip) ---
type Sk = Skeleton;
const rot = (p: Point, o: Point, a: number): Point => { const c = Math.cos(a), s = Math.sin(a); return { x: o.x + (p.x - o.x) * c - (p.y - o.y) * s, y: o.y + (p.x - o.x) * s + (p.y - o.y) * c }; };
function armTo(sk: Sk, side: "l" | "r", target: Point, l1: number, l2: number, elbowNear: Point) {
  const N = sk.neck, dx = target.x - N.x, dy = target.y - N.y, d0 = Math.hypot(dx, dy) || 1e-6;
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, d0)), ux = dx / d0, uy = dy / d0;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const P = { x: N.x + a * ux, y: N.y + a * uy };
  const e1 = { x: P.x - h * uy, y: P.y + h * ux }, e2 = { x: P.x + h * uy, y: P.y - h * ux };
  const e = Math.hypot(e1.x - elbowNear.x, e1.y - elbowNear.y) <= Math.hypot(e2.x - elbowNear.x, e2.y - elbowNear.y) ? e1 : e2;
  sk[`${side}Elbow`] = e;
  sk[`${side}Hand`] = { x: N.x + ux * d, y: N.y + uy * d };
}
function leanBack(sk: Sk, angle: number) {
  for (const j of ["neck", "head", "lElbow", "lHand", "rElbow", "rHand"] as const) sk[j] = rot(sk[j], sk.hip, angle);
}
const ease = (u: number) => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
const lens = (sk: Sk, side: "l" | "r") => [Math.hypot(sk[`${side}Elbow`].x - sk.neck.x, sk[`${side}Elbow`].y - sk.neck.y), Math.hypot(sk[`${side}Hand`].x - sk[`${side}Elbow`].x, sk[`${side}Hand`].y - sk[`${side}Elbow`].y)] as const;

// 2. TAKE A HIT THROUGH A HELD THING: the holder's hands give back `push` (from power), elbows bend, the upper body rocks back.
// `away` = +1 the hit pushes toward +x, -1 toward -x. Quick give (~0.07 s), slow recovery (~0.45 s).
export function takeHit(built: SceneFrames, who: string, t: number, power: number, away: number) {
  const fps = built.fps, i0 = Math.round(t * fps), H = heightOf(built, who);
  const p = Math.min(2, Math.max(0.3, power)), give = 0.07, back = 0.45 + 0.15 * p;
  const push = (0.05 + 0.06 * p) * H, lean = ((4 + 5 * p) * Math.PI) / 180, dip = p > 0.9 ? 0.02 * H * Math.min(1, p - 0.9) : 0;
  for (let i = i0; i < built.frames.length; i += 1) {
    const dt = (i - i0) / fps;
    if (dt > give + back) break;
    const w = dt <= give ? ease(dt / give) : 1 - ease((dt - give) / back);
    const row = built.frames[i], ci = row.findIndex((c) => c.id === who);
    if (ci < 0) continue;
    const f = row[ci], sk = { ...f.skeleton } as Sk;
    const L = { l: lens(sk, "l"), r: lens(sk, "r") };
    for (const s of ["l", "r"] as const) { const hd = sk[`${s}Hand`]; armTo(sk, s, { x: hd.x + away * push * w, y: hd.y + 0.15 * push * w }, L[s][0], L[s][1], sk[`${s}Elbow`]); }
    leanBack(sk, away * lean * w); // (a positive turn about the hip carries the neck toward +x: the body rocks the way it is pushed)
    if (dip) for (const j of ["hip", "neck", "head", "lElbow", "lHand", "rElbow", "rHand"] as const) sk[j] = { ...sk[j], y: sk[j].y + dip * w };
    row[ci] = { ...f, skeleton: sk };
  }
}
const heightOf = (built: SceneFrames, who: string) => { const c = built.frames[0]?.find((q) => q.id === who); return c ? Math.max(60, Math.abs(c.skeleton.lFoot.y - c.skeleton.head.y) + c.headRadius) : 300; };

// 1. A HAND IN A HAZARD: the reaction, written into the built frames.
type Touch = { who: string; side: "l" | "r"; zone: HazardZone; from: number; to: number };
export function hazardTouches(scene: Scene, built: SceneFrames, H: number, modes: HazardZone["mode"][] = ["react", "avoid"]): Touch[] {
  const effects = ((scene as Scene & { effects?: EffectTrack[] }).effects ?? []);
  if (!effects.some((e) => FLAMES.has(e.kind) || (e.kind === "prop" && hazardKindOf(String(e.params?.name ?? e.params?.symbol ?? "") + " " + String(e.params?.hazard ?? ""))))) return [];
  const out: Touch[] = [], open = new Map<string, Touch>();
  for (let i = 0; i < built.frames.length; i += 1) {
    const zones = hazardZones(effects, H, i / built.fps, worldAt(scene, built, i)).filter((z) => modes.includes(z.mode));
    for (const c of built.frames[i]) for (const side of ["l", "r"] as const) {
      const key = `${c.id}:${side}`, hand = c.skeleton[`${side}Hand`];
      const z = zones.find((q) => q.lighter !== `${c.id}:${side}Hand` && hazardGap(q, hand) <= 0);
      const cur = open.get(key);
      if (z && cur && cur.zone.what === z.what) cur.to = i;
      else if (z) { const tch = { who: c.id, side, zone: z, from: i, to: i }; open.set(key, tch); out.push(tch); }
      else if (cur && i - cur.to > Math.round(0.1 * built.fps)) open.delete(key);
    }
  }
  return out;
}

function react(built: SceneFrames, t: Touch, H: number) {
  const fps = built.fps, rise = t.zone.kind === "shock" ? REFLEX_PICS : Math.max(2, Math.round(0.2 * fps)) /* (the other hand: a shock throws it too, as fast as the reflex) */, stay = Math.max(t.to + Math.round(0.15 * fps), t.from + Math.round(1.0 * fps)), fall = Math.round(0.55 * fps);
  const z = t.zone, avoid = z.mode === "avoid";
  const half = Math.round(0.6 * fps); // (careful hands: the gap is kept a little before and after too, so the stop is smooth)
  for (let i = t.from - (avoid ? half : 0); i < Math.min(built.frames.length, avoid ? t.to + half : stay + fall); i += 1) {
    if (i < 0) continue;
    const row = built.frames[i], ci = row.findIndex((c) => c.id === t.who);
    if (ci < 0) continue;
    const f: FrameCharacter = row[ci], sk = { ...f.skeleton } as Sk;
    const k = i - t.from, w = avoid ? (i < t.from ? 0 : 1) : i <= stay ? ease(k / rise) : 1 - ease((i - stay) / fall);
    if (avoid) {
      // (CAREFUL HANDS keep a gap: the hand stops at the hazard's edge, pulled back along the arm — nothing happens)
      // (the hand that just lit it eases away over the last 0.4 s of its lighting time, never a pop)
      const s = t.side, lit = z.litBy === `${t.who}:${s}Hand` && z.litUntil !== undefined ? ease((i / fps - z.litUntil) / 0.4) : 1;
      if (lit <= 0) continue;
      const hand = sk[`${s}Hand`], g = hazardGap(z, hand), need = (0.05 * H - g) * lit;
      if (need <= 0) continue;
      const [l1, l2] = lens(sk, s), dx = sk.neck.x - hand.x, dy = sk.neck.y - hand.y, d = Math.hypot(dx, dy) || 1;
      // (back toward the shoulder AND up: a hand held over a fire warms above / beside it, never in it)
      let target = { x: hand.x + (dx / d) * need, y: hand.y };
      for (let n = 0; n < 6 && hazardGap(z, target) < 0.05 * H * lit; n += 1) target = { x: target.x + (dx / d) * 0.03 * H * lit, y: target.y - 0.015 * H * lit };
      armTo(sk, s, target, l1, l2, sk[`${s}Elbow`]);
      row[ci] = { ...f, skeleton: sk };
      continue;
    }
    if (w <= 0) continue;
    const facing = f.facing === "left" ? -1 : 1, away = Math.sign(sk.hip.x - z.cx) || -facing;
    const sec = k / fps, fade = Math.max(0, 1 - sec / 1.4);
    const L = { l: lens(sk, "l"), r: lens(sk, "r") };
    // A REFLEX IS THE FASTEST MOVE (Arthur, Oct 15: "pull your arm out! he's burning his arms"): the touched hand is yanked fully
    // OUT and away in the first REFLEX_PICS pictures (fast but flowing: accelerate then brake) — then the pain gesture (shake /
    // blow / rub / trembling) happens OUTSIDE the danger. Hands never stay or shake inside a hazard. (Marked on built.reflexes: the
    // tooFast / carefulWindUp laws do not judge an involuntary reflex.)
    const hand0 = sk[`${t.side}Hand`], outSpot = escapeSpot(z, hand0, sk, away, H);
    const snapU = k <= 0 ? 0 : k >= REFLEX_PICS ? 1 : REFLEX_CURVE[k - 1];
    // the pulled-in spot for the touched hand (and both hands for the cold rub / the shock)
    const face = { x: sk.head.x + facing * 0.09 * H, y: sk.head.y + 0.1 * H }, chest = { x: sk.neck.x + facing * 0.1 * H, y: sk.neck.y + 0.17 * H };
    const hands: ("l" | "r")[] = z.kind === "cold" || z.kind === "shock" || z.kind === "burn" ? ["l", "r"] : [t.side]; // (a shock throws BOTH arms stiff; after a burn the other hand holds the hurt one)
    const toPain = ease((k - REFLEX_PICS) / Math.max(2, Math.round(0.25 * fps))); // (after the snap: on to the pain gesture)
    for (const s of hands) {
      const home = sk[`${s}Hand`];
      let spot = z.kind === "burn" ? face : chest;
      if (z.kind === "burn") spot = { x: spot.x + 0.03 * H * Math.sin(2 * Math.PI * 3.5 * sec) * fade, y: spot.y + 0.018 * H * Math.cos(2 * Math.PI * 3.5 * sec) * fade }; // (shaking it out, hard)
      if (z.kind === "cold") spot = { x: spot.x + (s === "l" ? 1 : -1) * 0.025 * H * Math.sin(2 * Math.PI * 3 * sec), y: spot.y + (s === "l" ? 0.012 : -0.012) * H };
      // (shock: the touched arm thrown back AWAY, the other flung up, stiff — never both held in front, never toward the hazard)
      if (z.kind === "shock") spot = s === t.side ? { x: sk.neck.x + away * 0.3 * H, y: sk.neck.y + 0.02 * H } : { x: sk.neck.x + away * 0.06 * H, y: sk.neck.y - 0.3 * H }; // (the other arm flies UP — never toward the hazard)
      // AFTER THE PAIN, THE BODY RECOVERS (never a statue in the reflex pose): once the shake / trembling is over, the hurt hand is
      // cradled at the chest (the other hand holds it), outside the danger, until the plan's own pose takes over again.
      const after = ease((sec - (z.kind === "shock" ? SHOCK_SECONDS : 1.3)) / 0.6);
      if (after > 0 && z.kind !== "cold") { const cradle = { x: chest.x + (s === t.side ? 0 : facing * 0.03 * H), y: chest.y + (s === t.side ? 0 : 0.03 * H) }; spot = { x: spot.x + (cradle.x - spot.x) * after, y: spot.y + (cradle.y - spot.y) * after }; }
      spot = safeOf(z, spot, away, H); // (the pain gesture happens outside the danger)
      let target: Point;
      if (s === t.side && i <= stay) {
        // the touched hand: snap out first, then on to the pain spot
        const a = { x: home.x + (outSpot.x - home.x) * snapU, y: home.y + (outSpot.y - home.y) * snapU };
        target = { x: a.x + (spot.x - a.x) * toPain, y: a.y + (spot.y - a.y) * toPain };
      } else { const ww = z.kind === "burn" && s !== t.side ? w * after : w; target = { x: home.x + (spot.x - home.x) * ww, y: home.y + (spot.y - home.y) * ww }; }
      armTo(sk, s, target, L[s][0], L[s][1], sk[`${s}Elbow`]);
    }
    // the body flinches AWAY from the hazard (shock: a hard jolt; spikes / cold: a startled lean)
    const deg = z.kind === "shock" ? 14 : z.kind === "burn" ? 10 : 8;
    leanBack(sk, (away * deg * Math.PI * w) / 180);
    if (z.kind === "shock") {
      // (ELECTROCUTED: violent high-frequency trembling of EVERY limb — each joint its own phase, ~8 a second — for ~1 s, fading)
      const env = Math.max(0, 1 - sec / SHOCK_SECONDS) * Math.min(1, sec / 0.08) * w;
      const amp = 0.022 * H * env;
      ([["head", 0], ["neck", 1.3], ["lElbow", 2.1], ["lHand", 3.4], ["rElbow", 4.2], ["rHand", 5.0], ["lKnee", 0.7], ["rKnee", 2.8]] as const).forEach(([j, ph]) => {
        const kn = j === "lKnee" || j === "rKnee" ? 0.35 : j === "neck" || j === "head" ? 0.55 : 1;
        sk[j] = { x: sk[j].x + amp * kn * Math.sin(2 * Math.PI * 8 * sec + ph), y: sk[j].y + amp * kn * 0.6 * Math.cos(2 * Math.PI * 8 * sec + ph * 1.7) };
      });
    }
    row[ci] = { ...f, skeleton: sk };
  }
  if (!avoid) {
    // the reflex pictures are marked (involuntary: the natural-speed laws step aside)
    const rf = ((built as SceneFrames & { reflexes?: Reflex[] }).reflexes ??= []);
    rf.push({ who: t.who, from: t.from - 1, to: t.from + REFLEX_PICS + 2 + (z.kind === "shock" ? Math.round(SHOCK_SECONDS * fps) : 0) });
  }
}
export type Reflex = { who: string; from: number; to: number };
// (Oct 15: a reflex is fast but still FLOWS — 4 pictures, ~0.17 s, accelerate then brake; one 30 px jump between 8 px ones was a pop)
const REFLEX_PICS = 4, REFLEX_CURVE = [0.3, 0.68, 0.92, 1], SHOCK_SECONDS = 1.1;
// Where the hand goes in the reflex: straight out of the hazard, away from its middle and a little up, a clear gap outside it.
function escapeSpot(z: HazardZone, hand: Point, sk: Sk, away: number, H: number): Point {
  let dx = hand.x - z.cx, dy = hand.y - z.cy - 0.3 * z.ry; const d = Math.hypot(dx, dy) || 1;
  dx = dx / d * 0.6 + away * 0.4; dy = dy / d * 0.6 - 0.3; const d2 = Math.hypot(dx, dy) || 1;
  let p = { x: hand.x + (dx / d2) * 0.1 * H, y: hand.y + (dy / d2) * 0.1 * H };
  for (let n = 0; n < 12 && hazardGap(z, p) < 0.08 * H; n += 1) p = { x: p.x + (dx / d2) * 0.04 * H, y: p.y + (dy / d2) * 0.04 * H };
  // (a reflex pulls TOWARD the body: never further than an arm's reach from the shoulder)
  const r = Math.hypot(p.x - sk.neck.x, p.y - sk.neck.y), max = 0.42 * H;
  return r > max ? { x: sk.neck.x + (p.x - sk.neck.x) * max / r, y: sk.neck.y + (p.y - sk.neck.y) * max / r } : p;
}
// A spot moved out of the hazard (sideways, away) until it keeps a clear gap.
function safeOf(z: HazardZone, p: Point, away: number, H: number): Point {
  let q = p;
  for (let n = 0; n < 12 && hazardGap(z, q) < 0.08 * H; n += 1) q = { x: q.x + away * 0.04 * H, y: q.y - 0.01 * H };
  return q;
}

// SHOW THE CAUSE ON THE BODY (Arthur, Oct 15: "electricity is supposed to be ON him so they know he got electrocuted"): one shared
// "status on the body" family — the effect sits ON the figure (anchored on its joints, so it moves and shakes with it):
//   shock = electric arcs crawling along every limb and the torso (they flicker on/off — arcs only),
//   burn  = a small flame then a wisp of smoke on the burnt hand, cold = a frost puff, wet = drips falling off.
const BONES: [string, string][] = [["neck", "hip"], ["neck", "head"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["hip", "rKnee"], ["lKnee", "lFoot"], ["rKnee", "rFoot"]];
export function bodyStatusTracks(who: string, status: "shock" | "burn" | "cold" | "wet", start: number, joint: string, seconds?: number): EffectTrack[] {
  if (status === "shock") return BONES.map(([a, b], n) => ({ kind: "bodyStatus", start, end: start + (seconds ?? SHOCK_SECONDS), anchor: { character: who, joint: a } as EffectTrack["anchor"], target: { character: who, joint: b } as EffectTrack["anchor"], params: { status, seed: n + 1 }, layer: "front" as const }));
  return [{ kind: "bodyStatus", start, end: start + (seconds ?? (status === "burn" ? 1.5 : 1.1)), anchor: { character: who, joint } as EffectTrack["anchor"], params: { status, seed: 3 }, layer: "front" as const }];
}
const rnd = (seed: number, i: number) => { const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453; return x - Math.floor(x); };
export const BODY_STATUS: EffectRecipe = {
  id: "bodyStatus",
  about: "status ON a figure (added by the engine when a figure touches a hazard): params.status shock (arcs along the limbs) | burn (small flame + smoke on the hand) | cold (frost puff) | wet (drips); anchor a joint (shock: target the next joint)",
  draw: (ctx, params) => {
    const st = String(params.status ?? "shock"), H = ctx.height, seed = Number(params.seed ?? 1), fr = Math.round(ctx.t * ctx.fps);
    const life = ctx.duration > 0 ? ctx.t / ctx.duration : 0, fadeIn = Math.min(1, ctx.t / 0.06), fadeOut = Math.min(1, (1 - life) / 0.25), a = Math.max(0, Math.min(fadeIn, fadeOut));
    if (a <= 0) return [];
    if (st === "shock") {
      if (!ctx.target) return [];
      if (rnd(seed, fr) < 0.18) return []; // (arcs flicker: an arc is off now and then — arcs only)
      const A = ctx.at, B = ctx.target, len = Math.hypot(B.x - A.x, B.y - A.y) || 1, nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
      const out: Shape[] = [];
      for (const k of [0, 1]) {
        const n = 6, pts: number[] = [];
        for (let j = 0; j <= n; j += 1) {
          const u = j / n, off = j === 0 || j === n ? 0 : (rnd(seed * 7 + k, fr * 13 + j) - 0.5) * 0.06 * H;
          pts.push(A.x + (B.x - A.x) * u + nx * off, A.y + (B.y - A.y) * u + ny * off);
        }
        out.push({ kind: "line", points: pts, stroke: k ? "#ffffff" : "#7fd8ff", width: (k ? 1.6 : 3.4) * H / 300, alpha: a * (k ? 0.95 : 0.85), glow: k ? 0 : 10 });
      }
      return out;
    }
    const p = ctx.at;
    if (st === "burn") {
      const out: Shape[] = [];
      const flame = Math.max(0, 1 - ctx.t / 0.8) * a;
      if (flame > 0.02) {
        const h = 0.07 * H * (0.8 + 0.2 * Math.sin(ctx.t * 40 + seed)), w = 0.03 * H;
        out.push({ kind: "poly", points: [p.x - w, p.y, p.x - w * 0.4, p.y - h * 0.6, p.x + (rnd(seed, fr) - 0.5) * w * 0.6, p.y - h, p.x + w * 0.5, p.y - h * 0.55, p.x + w, p.y], fill: "#ff8a1f", alpha: flame, glow: 12 });
        out.push({ kind: "poly", points: [p.x - w * 0.5, p.y, p.x, p.y - h * 0.55, p.x + w * 0.5, p.y], fill: "#ffe066", alpha: flame });
      }
      for (let j = 0; j < 3; j += 1) {
        const born = 0.3 + j * 0.25, age = ctx.t - born;
        if (age < 0 || age > 0.9) continue;
        const src = ctx.anchorAt?.(born) ?? p;
        out.push({ kind: "circle", x: src.x + Math.sin(age * 4 + j) * 0.012 * H, y: src.y - 0.04 * H - age * 0.12 * H, r: (0.012 + age * 0.025) * H, fill: "#9a9a9a", alpha: a * 0.55 * (1 - age / 0.9) });
      }
      return out;
    }
    if (st === "cold") {
      const out: Shape[] = [];
      for (let j = 0; j < 6; j += 1) { const ang = (j / 6) * Math.PI * 2 + seed, r = (0.02 + 0.05 * Math.min(1, ctx.t / 0.5)) * H; out.push({ kind: "circle", x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r, r: 0.012 * H, fill: "#dff4ff", alpha: a * 0.8 }); }
      return out;
    }
    // wet: drips falling off the spot
    const out: Shape[] = [];
    for (let j = 0; j < 5; j += 1) { const born = j * 0.2, age = ctx.t - born; if (age < 0 || age > 0.5) continue; const src = ctx.anchorAt?.(born) ?? p; out.push({ kind: "circle", x: src.x + (rnd(seed, j) - 0.5) * 0.04 * H, y: src.y + 0.5 * 9.8 * age * age * 0.25 * H, r: 0.008 * H, fill: "#6fb7ff", alpha: a * 0.9 }); }
    return out;
  },
};

// The built hook (registered from effects/index.ts AFTER causes.ts, so the fires have their real start times).
export function contactConsequences(scene0: Scene, built: SceneFrames): SceneFrames {
  const scene = scene0 as Scene & { effects?: EffectTrack[] };
  if ((built as { camera?: unknown }).camera || !scene.effects?.length) return built;
  const H = scene.characters[0]?.height ?? 300;
  // (ONE SHOCK, ONE REACTION: a touch of the same hazard by the same figure while its reaction is still going — the hand bobbing
  // back in, the other hand — is part of that reaction, never a second jolt; the first reaction lasts as long as the plan stayed in)
  const merged: Touch[] = [];
  for (const t of hazardTouches(scene, built, H).sort((a, b) => a.from - b.from)) {
    const last = merged.find((m) => m.who === t.who && m.zone.what === t.zone.what && t.zone.mode === "react" && m.zone.mode === "react" && t.from <= Math.max(m.to + Math.round(0.15 * built.fps), m.from + built.fps) + Math.round(0.55 * built.fps));
    if (last && (last.side === t.side || t.zone.kind === "shock" || t.zone.kind === "cold")) last.to = Math.max(last.to, t.to);
    // (ONCE BURNT, CAREFUL: a LATER touch of a hazard this figure already felt keeps a gap instead — nobody puts a hand back on the
    // stove that just burnt it)
    else if (t.zone.mode === "react" && merged.some((m) => m.who === t.who && m.zone.what === t.zone.what && m.zone.mode === "react" && m.from < t.from)) merged.push({ ...t, zone: { ...t.zone, mode: "avoid" } });
    else merged.push({ ...t });
  }
  for (const t of merged) {
    react(built, t, H);
    // (the cause shown ON the body: arcs / a flame on the hand / frost — from the touch's real picture)
    if (t.zone.mode === "react" && t.zone.kind !== "spikes" && !scene.effects.some((e) => e.kind === "bodyStatus" && (e.anchor as { character?: string }).character === t.who && Math.abs(e.start - t.from / built.fps) < 1e-6)) scene.effects.push(...bodyStatusTracks(t.who, t.zone.kind, t.from / built.fps, `${t.side}Hand`));
  }
  heldImpacts(scene, built, H);
  return built;
}

// 2b. A STRIKE ON A HELD (unbroken) THING: a fist / foot of another figure entering a held prop's box fast pushes the holder.
const HELD_STRUCK = /\b(board|plank|pad|mitts?|shield|bat|ball|target|block|brick|tile|bag|book|tray|sign|melon|bottle)\b/i;
function heldImpacts(scene: Scene & { effects?: EffectTrack[] }, built: SceneFrames, H: number) {
  const fps = built.fps;
  for (const e of scene.effects ?? []) {
    const a = e.anchor as { character?: string; joint?: string; with?: string };
    if (e.kind !== "prop" || !a.character || !/^[lr]Hand$/.test(String(a.joint)) || !HELD_STRUCK.test(String(e.params?.name ?? e.params?.symbol ?? ""))) continue;
    const sz = num(e.params?.size, 0.2) * H, box = Math.max(0.06 * H, 0.6 * sz);
    let last = -Infinity;
    for (let i = Math.max(2, Math.ceil(e.start * fps)); i < Math.min(built.frames.length, Math.floor(e.end * fps)); i += 1) {
      const holder = built.frames[i].find((c) => c.id === a.character);
      if (!holder) continue;
      const hj = holder.skeleton[a.joint as "lHand"], oj = a.with ? holder.skeleton[a.with as "lHand"] : hj, at = { x: (hj.x + oj.x) / 2, y: (hj.y + oj.y) / 2 };
      for (const c of built.frames[i]) {
        if (c.id === a.character || i - last < 0.5 * fps) continue;
        for (const j of ["rHand", "lHand", "rFoot", "lFoot"] as const) {
          const p = c.skeleton[j], q = built.frames[i - 2].find((d) => d.id === c.id)?.skeleton[j];
          if (!q || Math.hypot(p.x - at.x, p.y - at.y) > box) continue;
          const speed = Math.hypot(p.x - q.x, p.y - q.y) / (2 / fps) / H; // (heights per second)
          if (speed < 2.2) continue;
          takeHit(built, a.character, i / fps, speed / 6, Math.sign(p.x - q.x) || 1);
          last = i;
          break;
        }
      }
    }
  }
}
