// SPEC-0017 TRANSFORM (Arthur, 2026-10-07: "a stick figure turns into a car and drives to the moon" — "it has to
// learn what a car looks like and what a stick figure looks like, and somehow MORPH it smoothly").
// The effect `transform` on a figure (anchor = its hip): ANTICIPATION (the figure crouches, squashing down and out),
// then the figure's lines squash flat toward the floor and spread toward the symbol's outline while the SYMBOL
// (a Library symbol: symbolMaker.ts PLACED_SYMBOLS, e.g. "car") grows in its place with a small overshoot and a
// sparkle puff; the figure is GONE after the morph (buildScene → morphFigures) and the symbol takes over at the same
// spot. Then it MOVES along `path` (each leg eases in and out, tilting toward where it goes). `back: true` = the
// reverse (the symbol shrinks away and the figure grows back up). `prop` = a still symbol (a moon in the sky).
import { addBuiltHook, type FrameCharacter, type Scene, type SceneFrames } from "../engine.ts";
import type { EffectContext, EffectParams, EffectRecipe, EffectTrack, Shape } from "../effects/types.ts";
import { placedSymbol, placedSymbolName } from "../symbolMaker.ts";
import { withEverydayPicture } from "../effects/everydayThings.ts";
import { hitWobble, type ThingHit } from "./hitThings.ts";
import { haulGain } from "./pullPlan.ts";

export const MORPH_SECONDS = 0.8;
const CROUCH_END = 0.3, GONE_AT = 0.75, GROW_FROM = 0.35, GROW_TO = 0.85;
const smooth = (u: number) => { const k = Math.min(1, Math.max(0, u)); return k * k * (3 - 2 * k); };

// The placed symbol's name for "car" / "Car" / a kind ("moon").
export function symbolName(into: unknown): string | undefined {
  return placedSymbolName(into);
}

// How the figure is squashed at morph share u (0..1): null = gone.
export function figureSquash(u: number): { sx: number; sy: number } | null {
  if (u < CROUCH_END) { const k = smooth(u / CROUCH_END); return { sx: 1 + 0.1 * k, sy: 1 - 0.18 * k }; }
  if (u < GONE_AT) { const k = smooth((u - CROUCH_END) / (GONE_AT - CROUCH_END)); return { sx: 1.1 + 0.5 * k, sy: 0.82 - 0.67 * k }; }
  return null;
}

const morphOf = (track: EffectTrack) => Math.min(Number(track.params?.morph ?? MORPH_SECONDS), track.end - track.start);

// The figures with their morphs applied (called at the end of engine.ts buildScene): squashed toward the floor under
// their middle during a morph, and left out of the pictures while they are a symbol.
export function morphFigures(scene: Scene, built: SceneFrames): SceneFrames {
  const tracks = ((scene as { effects?: EffectTrack[] }).effects ?? []).filter((e) => e.kind === "transform" && "character" in e.anchor);
  if (tracks.length === 0) return built;
  const groundY = scene.groundY;
  const frames = built.frames.map((characters, i) => {
    const t = i / built.fps;
    const out: FrameCharacter[] = [];
    for (const c of characters) {
      const own = tracks.filter((e) => (e.anchor as { character: string }).character === c.id).sort((a, b) => a.start - b.start);
      let hidden = false, squash: { sx: number; sy: number } | null = { sx: 1, sy: 1 };
      for (const e of own) {
        if (t < e.start - 1e-9) break;
        const back = e.params?.back === true, morph = morphOf(e);
        if (t <= e.start + morph + 1e-9) { const u = (t - e.start) / morph; squash = figureSquash(back ? 1 - u : u); hidden = false; break; }
        hidden = !back; squash = hidden ? null : { sx: 1, sy: 1 };
      }
      if (hidden || !squash) continue;
      if (squash.sx === 1 && squash.sy === 1) { out.push(c); continue; }
      const pts = Object.values(c.skeleton), cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const skeleton = Object.fromEntries(Object.entries(c.skeleton).map(([j, p]) => [j, { x: cx + (p.x - cx) * squash!.sx, y: groundY + (p.y - groundY) * squash!.sy }])) as typeof c.skeleton;
      out.push({ ...c, skeleton, headRadius: c.headRadius * Math.sqrt(squash.sx * squash.sy) });
    }
    return out;
  });
  return { ...built, frames };
}

type PathPoint = { t: number; dx: number; dy: number };
const pathOf = (params: EffectParams): PathPoint[] => (Array.isArray(params.path) ? params.path : [])
  .map((p) => ({ t: Number((p as PathPoint).t), dx: Number((p as PathPoint).dx ?? 0), dy: Number((p as PathPoint).dy ?? 0) }))
  .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.dx) && Number.isFinite(p.dy))
  .sort((a, b) => a.t - b.t);

// Where the symbol is `s` seconds after the morph (each leg eases in and out) and its tilt (toward where it goes).
export function alongPath(path: PathPoint[], s: number): { dx: number; dy: number; rotation: number } {
  let from = { t: 0, dx: 0, dy: 0 };
  for (const to of path) {
    if (s <= to.t) {
      const k = (s - from.t) / Math.max(1e-6, to.t - from.t), e = smooth(k);
      const angle = (Math.atan2(to.dy - from.dy, Math.abs(to.dx - from.dx) || 1e-6) * 180) / Math.PI * Math.sign(to.dx - from.dx || 1);
      const tilt = Math.max(-40, Math.min(40, angle)) * Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
      return { dx: from.dx + (to.dx - from.dx) * e, dy: from.dy + (to.dy - from.dy) * e, rotation: Math.abs(to.dy - from.dy) > 1 ? tilt : 0 };
    }
    from = to;
  }
  return { dx: from.dx, dy: from.dy, rotation: 0 };
}

const sparkles = (x: number, y: number, r: number, k: number, color: string): Shape[] => {
  if (k <= 0 || k >= 1) return [];
  const out: Shape[] = [], fade = 1 - k;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.3, d = r * (0.4 + 0.9 * k), s = r * 0.12 * fade + 2;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.7;
    out.push({ kind: "poly", points: [px, py - s, px + s * 0.3, py - s * 0.3, px + s, py, px + s * 0.3, py + s * 0.3, px, py + s, px - s * 0.3, py + s * 0.3, px - s, py, px - s * 0.3, py - s * 0.3], fill: color, alpha: fade });
  }
  out.push({ kind: "circle", x, y, r: r * (0.5 + 0.6 * k), fill: "#ffffff", alpha: 0.35 * fade });
  return out;
};

function drawTransform(ctx: EffectContext, params: EffectParams): Shape[] {
  const name = symbolName(params.into);
  if (!name) return [];
  const made = placedSymbol({ name, color: params.color, color2: params.color2 });
  const scale = (Number(params.size ?? 0.45) * ctx.height) / made.height; // size = the symbol's height x the figure's
  const w = made.width * scale, h = made.height * scale;
  const morph = Math.min(Number(params.morph ?? MORPH_SECONDS), ctx.duration), back = params.back === true;
  const x0 = ctx.at.x, y0 = ctx.groundY - h / 2; // on the floor where the figure stood
  const out: Shape[] = [];
  let grow = 1, alpha = 1, move = { dx: 0, dy: 0, rotation: 0 };
  if (ctx.t < morph) {
    const u = back ? 1 - ctx.t / morph : ctx.t / morph;
    const k = Math.min(1, Math.max(0, (u - GROW_FROM) / (GROW_TO - GROW_FROM)));
    if (k <= 0) grow = 0;
    else { const c = 1.7; grow = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); alpha = Math.min(1, k / 0.5); } // a small overshoot
    out.push(...sparkles(x0, ctx.groundY - h * 0.6, Math.max(w, h) * 0.7, (ctx.t / morph - 0.3) / 0.7, String(params.sparkle ?? "#ffe27a")));
  } else if (!back) move = alongPath(pathOf(params), ctx.t - morph);
  else return out;
  const flip = ctx.facing === "left";
  if (grow > 0) out.unshift({ kind: "symbol", name, x: x0 + move.dx, y: y0 + move.dy, scale: scale * Math.max(0.05, grow), rotation: flip ? -move.rotation : move.rotation, ...(flip ? { flipX: true } : {}), ...(alpha < 1 ? { alpha } : {}), ...(params.color ? { color: String(params.color) } : {}), ...(params.color2 ? { color2: String(params.color2) } : {}) });
  return out;
}

// AN ORIGINAL SYMBOL FROM SIMPLE PARTS (Arthur, 2026-10-08: "teach the engine to create its own original symbols"):
// a thing with no built-in symbol is a prop drawn from params.parts — a short list of {shape: rect | round | circle |
// ellipse | rock (rough, lumpy) | line, x, y, w, h, color} in units of the prop's size (its height; x, y = the part's center, 0,0 = the
// prop's center, + = right / down; a line goes from x,y to x+w,y+h) — each part filled and outlined dark so it reads
// at stick-figure size. A prop whose bottom is near the floor stands ON it; one higher up hangs there. A hit prop
// reacts (hitThings.ts): it swings (hanging) or rocks (standing) by the strike's power.
type Part = { shape?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; color?: unknown };
export function partsShapes(parts: Part[], S: number, cx: number, cy: number, angle: number, px: number, py: number, outline: string): Shape[] {
  const a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const turn = (x: number, y: number) => [px + (x - px) * cos - (y - py) * sin, py + (x - px) * sin + (y - py) * cos];
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const width = Math.max(2.5, 0.022 * S);
  const out: Shape[] = [];
  for (const p of parts.slice(0, 16)) {
    const x = cx + num(p.x, 0) * S, y = cy + num(p.y, 0) * S, w = Math.abs(num(p.w, 0.3)) * S, h = Math.abs(num(p.h, 0.3)) * S;
    const fill = typeof p.color === "string" ? p.color : "#9a9a9a", shape = String(p.shape ?? "rect");
    if (shape === "line") { out.push({ kind: "line", points: [...turn(x, y), ...turn(x + num(p.w, 0) * S, y + num(p.h, 0) * S)], stroke: fill === "#9a9a9a" ? outline : fill, width: Math.max(width, 0.03 * S) }); continue; }
    const pts: number[] = [];
    if (shape === "rock") {
      // (A ROUGH NATURAL ROCK — a slab growing out of a wall, a rock pillar: a boxy, lumpy outline, every one different (seeded by
      // where it is), always INSIDE its w × h box so what it measures (propBox) is what it shows)
      const seed = Math.abs(Math.sin(num(p.x, 0) * 12.9898 + num(p.y, 0) * 78.233 + w * 0.37)) * 43758.5453;
      for (let i = 0; i < 24; i += 1) {
        const u = (i / 24) * 2 * Math.PI, c = Math.cos(u), sn = Math.sin(u), k = 1 - 0.16 * (((Math.sin(seed + i * 2.71) + 1) / 2) ** 2);
        pts.push(...turn(x + (w / 2) * Math.sign(c) * Math.abs(c) ** 0.5 * k, y + (h / 2) * Math.sign(sn) * Math.abs(sn) ** 0.5 * k));
      }
    } else if (shape === "circle" || shape === "ellipse") {
      const rx = w / 2, ry = shape === "circle" ? w / 2 : h / 2;
      for (let i = 0; i < 20; i += 1) pts.push(...turn(x + rx * Math.cos((i / 20) * 2 * Math.PI), y + ry * Math.sin((i / 20) * 2 * Math.PI)));
    } else if (shape === "triangle") {
      // (a triangle in its w × h box, point up — a roof, a flame, a tent, a net)
      pts.push(...turn(x, y - h / 2), ...turn(x + w / 2, y + h / 2), ...turn(x - w / 2, y + h / 2));
    } else {
      const r = shape === "round" ? Math.min(w, h) * 0.3 : 0, steps = r > 0 ? 4 : 1;
      for (const [qx, qy, a0] of [[x + w / 2 - r, y - h / 2 + r, -90], [x + w / 2 - r, y + h / 2 - r, 0], [x - w / 2 + r, y + h / 2 - r, 90], [x - w / 2 + r, y - h / 2 + r, 180]])
        for (let i = 0; i < steps; i += 1) { const u = ((a0 + (90 * i) / Math.max(1, steps - 1)) * Math.PI) / 180; pts.push(...turn(qx + r * Math.cos(u), qy + r * Math.sin(u))); }
    }
    out.push({ kind: "poly", points: pts, fill, stroke: outline, width });
  }
  return out;
}

// A STRING TO A HAND, AND THINGS THAT FLY DRIFT (Arthur, Oct 12: a kite with no string that never moved). A thing that flies
// (a kite, a balloon… or "flies": true) drifts and tilts gently on the air unless "drift": false; "string": true (or a color)
// with the prop's TARGET on a figure's hand ({ character, joint: "rHand" }) draws a string from the thing's bottom to that
// hand, sagging under its own weight and swaying a little — a kite, a balloon, a leash, a fishing line, a rope.
// (a PULLED rope — tug of war, a leash pulling, a rope being hauled — is TAUT: "taut": true makes it a straight line; Arthur, Oct 12:
// "the rope is supposed to be fully straightened out because they're really pulling")
// (A TAUT ROPE IS ALIVE — Arthur, Oct 14: "the rope should move a little": a pulled rope trembles a hair across its length (~0.6% of
// it, fast) on top of following the hands as they heave; the rope's free end hangs on past a hand that holds it, so BOTH hands
// of a puller are on it, whichever one it is tied to.)
export const ROPE_BROWN = "#b5823c"; // (Arthur, Oct 14: "make the rope a brighter brown")
export function ropeTremble(t: number, len: number) { return Math.min(3, 0.006 * len) * (Math.sin(2 * Math.PI * 7.3 * t) * 0.7 + Math.sin(2 * Math.PI * 4.1 * t + 1.3) * 0.3); }
function stringShape(from: { x: number; y: number }, to: { x: number; y: number }, t: number, color: string, width: number, taut = false): Shape {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy), sag = taut ? 0 : Math.min(0.18 * len, 120), sway = taut ? 0 : 0.03 * len * Math.sin(1.3 * t);
  const shake = taut ? ropeTremble(t, len) : 0, nx = len > 1e-6 ? -dy / len : 0, ny = len > 1e-6 ? dx / len : 0;
  const pts: number[] = [];
  for (let k = 0; k <= 16; k += 1) { const u = k / 16, bow = 4 * u * (1 - u); pts.push(from.x + dx * u + sway * bow + shake * nx * bow, from.y + dy * u + sag * bow + shake * ny * bow); }
  return { kind: "line", points: pts, stroke: color, width };
}
// How far (0..1) a let-go rope's free end has fallen `t` s after the hand let go (1 = on the ground; no `dropFrom` = already down):
// a real fall under gravity (a figure is ~1.7 m tall), kept between 0.4 and 0.7 s so the eye sees it.
export function ropeFall(t: number, dropFrom: { x: number; y: number } | undefined, ground: { x: number; y: number }, height: number): number {
  if (!dropFrom) return 1;
  const g = (9.8 * height) / 1.7, T = Math.min(0.7, Math.max(0.4, Math.sqrt((2 * Math.max(0, ground.y - dropFrom.y)) / g)));
  return Math.min(1, Math.max(0, t / T));
}
// The rope's loose end past a hand: it carries on the way the rope goes, then hangs down (`length` px).
function ropeTail(end: { x: number; y: number }, away: { x: number; y: number }, length: number, color: string, width: number): Shape {
  const dx = end.x - away.x, dy = end.y - away.y, len = Math.hypot(dx, dy) || 1, pts: number[] = [];
  // (STRAIGHT ON through the puller's other fist first — the two fists sit ~0.075 x height apart on the rope's line, pull.ts —
  // and only then does the loose end droop; Arthur, Oct 14: "the stick figures are not really holding the rope")
  const straight = 0.62;
  for (let k = 0; k <= 10; k += 1) { const u = k / 10, w = Math.max(0, (u - straight) / (1 - straight)); pts.push(end.x + (dx / len) * length * (u - 0.3 * w * w * (1 - straight)), end.y + (dy / len) * length * u + 0.7 * length * w * w * (1 - straight)); }
  return { kind: "line", points: pts, stroke: color, width };
}
function drawProp(ctx0: EffectContext, params: EffectParams): Shape[] {
  // (only what RIDES THE AIR drifts — a kite, a balloon, a bird, a butterfly, a bee, a drone, a plane, a ghost, or "flies": true;
  // the moon, the sun, stars, clouds and rockets fly too but never bob)
  const flier = params.flies === true || /kite|balloon|bird|butterfly|bee|drone|plane|ghost/i.test(String(params.symbol ?? ""));
  const seed = Number(params.seed ?? 3), drift = flier && params.drift !== false && ctx0.facing === undefined;
  // (a HAULED thing — pullPlan.ts hauled — comes toward its puller by the rope gained, along its own surface: its height stays)
  const haul = params.haul as { t0: number; period: number; heaves: number; step: number; dir: number } | undefined;
  const ctxH: EffectContext = haul && Number.isFinite(haul.step) ? { ...ctx0, at: { x: ctx0.at.x + haul.dir * haulGain(ctx0.t, haul), y: ctx0.at.y } } : ctx0;
  const ctx: EffectContext = drift ? { ...ctxH, at: { x: ctxH.at.x + 0.05 * ctxH.height * Math.sin(1.1 * ctxH.t + seed), y: ctxH.at.y + 0.035 * ctxH.height * Math.sin(1.7 * ctxH.t + 2 * seed) } } : ctxH;
  const shapes = drawPropBody(ctx, params);
  if (!params.string || !ctx.target) return shapes;
  const S = Number(params.size ?? 0.5) * ctx.height;
  // (EXACT GRIP — Arthur, Oct 15: "it's just a pixel, he's not holding — we're going for perfection": a string whose thing is IN a
  // figure's hand starts exactly AT that hand, never half the thing's size below it; a kite's/balloon's string leaves its bottom)
  const from = ctx.facing !== undefined && !flier ? { x: ctx.at.x, y: ctx.at.y } : { x: ctx.at.x, y: ctx.at.y + 0.5 * S };
  // (A ROPE BEING PULLED IS TIGHT AND THICK — Arthur, Oct 12: "it needs to look like a straight line… they're freaking pulling it": a
  // string from a thing that does not ride the air to a figure's hand is a pulled rope — straight and thick by default; a kite's or a
  // balloon's string keeps its light sag. "taut": false / true overrides.)
  const rope = params.taut === true || (params.taut !== false && !flier);
  // (a rope someone LET GO of: thick like before, hanging from the hand that still holds it and lying along the ground)
  if (params.slack === true) {
    // (THE LET-GO END FALLS, LIKE A WHIP — Arthur, Oct 14: "when red lets go, the rope teleports on the ground. It's supposed to be an
    // animation of it falling, like a whip": `dropFrom` = where the hand let go; the free end falls from there under gravity
    // (0.4–0.7 s), the rope sags in as it falls and a wave runs along it, dying out as the end lands; then it lies as before.)
    const drop = params.dropFrom as { x?: unknown; y?: unknown } | undefined, dp = drop && Number.isFinite(Number(drop.x)) && Number.isFinite(Number(drop.y)) ? { x: Number(drop.x), y: Number(drop.y) } : undefined;
    const u = ropeFall(ctx.t, dp, ctx.target, ctx.height);
    const a = from, b = dp && u < 1 ? { x: dp.x + (ctx.target.x - dp.x) * (1 - (1 - u) ** 2), y: dp.y + (ctx.target.y - dp.y) * u * u } : ctx.target;
    const away = Math.sign(ctx.target.x - a.x) || 1, pts: number[] = [], span = Math.abs(b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const whip = dp && u < 1 ? 0.07 * Math.hypot(dp.x - a.x, dp.y - a.y) * (1 - u) : 0, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    for (let k = 0; k <= 12; k += 1) {
      const s = k / 12, wave = whip * Math.sin(Math.PI * s) * Math.sin(2 * Math.PI * (1.4 * s - 2.4 * ctx.t));
      pts.push(a.x + (b.x - a.x) * s + wave * nx, Math.min(ctx.groundY, ctx.target.y, a.y + (b.y - a.y) * s + Math.min(1, u) * 0.12 * span * 4 * s * (1 - s) + wave * ny));
    } // (hangs away from the body, sags, never below the ground)
    const tip = { x: b.x + away * 0.25 * span * Math.min(1, u), y: b.y };
    pts.push(tip.x, tip.y);
    // (THE BODY STAYS WITH THE END THAT WAS LET GO — Arthur, Oct 14: "the red is holding this orange dot… when he lets go, blue is
    // now holding that — no teleporting allowed": the thing's own shapes (a knot, a handle, a tag) were in the hand that let go, so
    // they fall WITH that free end and lie at its tip — never jump into the other holder's hand)
    const body = drawPropBody({ ...ctx, at: { x: tip.x, y: tip.y - 0.5 * S * Math.min(1, u) } }, params);
    return [{ kind: "line", points: pts, stroke: typeof params.string === "string" ? params.string : ROPE_BROWN, width: Math.max(5, 0.02 * ctx.height) }, ...body];
  }
  const color = typeof params.string === "string" ? params.string : rope ? ROPE_BROWN : "#3a3a3a", width = rope ? Math.max(5, 0.02 * ctx.height) : Math.max(1.5, 0.006 * ctx.height);
  const line = stringShape(from, ctx.target, ctx.t, color, width, rope);
  if (!rope) return [line, ...shapes];
  // (the loose ends: past the target hand always; past the anchor too when the anchor is a figure's hand, not a sled or a door)
  const tails = [ropeTail(ctx.target, from, 0.15 * ctx.height, color, width)];
  if (ctx.facing !== undefined) tails.push(ropeTail(from, ctx.target, 0.15 * ctx.height, color, width));
  return [line, ...tails, ...shapes];
}
// HELD TOOLS TILT WITH THE HAND (Arthur, Oct 14: "a shovel never tilts as he digs, a bubble wand shows as a dot"): a LONG thing
// held in a hand (its parts at least ~1.8× as long as wide, or a tool's name: shovel, rake, broom, brush, wand, sword, axe, bat,
// hammer, stick…) is gripped near its HANDLE end (the end away from its heavy head — the blade, the bristles, the wand's loop) and points the way the forearm points (elbow → hand), turning with it every picture. Things that hang
// from a hand (a bucket, a bag, a lantern, a basket, a cup…) or "upright": true stay hanging straight; "tilts": true/false overrides.
const HANGS_HELD = /bucket|pail|bag|sack|lantern|basket|purse|suitcase|briefcase|case|box|kettle|cage|watering|jug|bottle|cup|mug|glass|can\b|tray|plate|bowl|book|phone|ball/i;
const HANGS_BY_HANDLE = /bucket|pail|\bbag\b|sack|lantern|basket|purse|suitcase|briefcase|kettle|cage|watering/i;
const TOOL_HELD = /shovel|spade|rake|broom|mop|brush|wand|sword|blade|knife|axe|hammer|bat\b|club|stick|racket|paddle|spear|hoe|pitchfork|baton|saber|pen\b|pencil|spoon|ladle|net\b/i;
// (CARRIED UPRIGHT — the lead, Oct 14: a carried flag pointed down into the ground along the forearm: a flag, sign, banner, torch,
// candle, umbrella, trophy, ice cream, lantern pole, staff… stays as drawn, pole up, gripped near its BOTTOM, whatever the arm does;
// only tools that are swung or used follow the forearm.)
const UPRIGHT_HELD = /flag|sign|banner|torch|candle|umbrella|trophy|ice ?cream|cone|pole|staff|placard|balloon|sparkler|bouquet|flower/i;
// (the same rule, for whoever needs to know where such a thing's head is — effects/index.ts: smoke from a carried torch rises from
// its top, straight above the hand, never from where a tilted torch's tip would be)
export function carriedUpright(params: EffectParams): boolean {
  if (params.upright === true) return true;
  if (params.tilts === true || params.tilts === false) return false;
  const name = `${params.name ?? ""} ${params.symbol ?? ""}`;
  return UPRIGHT_HELD.test(name) && !TOOL_HELD.test(name.replace(UPRIGHT_HELD, ""));
}
export const FLOOR_TOOL = /broom|mop|rake|hoe|shovel|spade|pitchfork|squeegee/i, SLIDING_TOOL = /broom|mop|rake|squeegee/i;
export const MIN_FLOOR_TOOL = 0.82; // (x the figure: a real broom or rake is ~1.4 m for a 1.75 m person)
function heldTool(parts: Part[], S: number, ctx: EffectContext, params: EffectParams): Shape[] | undefined {
  const name = `${params.name ?? ""} ${params.symbol ?? ""}`;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  if (params.tilts === false || params.upright === true || params.hangs === true) return undefined;
  // (each part's extent in parts units; a line runs from (x, y) to (x + w, y + h))
  const box = parts.map((p) => {
    const x = num(p.x, 0), y = num(p.y, 0), w = num(p.w, String(p.shape) === "line" ? 0 : 0.3), h = num(p.h, String(p.shape) === "line" ? 0 : 0.3);
    if (String(p.shape ?? "rect") === "line") return { x0: Math.min(x, x + w), x1: Math.max(x, x + w), y0: Math.min(y, y + h), y1: Math.max(y, y + h), area: 0.03 * Math.hypot(w, h), cy: y + h / 2 };
    const W = Math.abs(w), H = String(p.shape) === "circle" ? W : Math.abs(h);
    return { x0: x - W / 2, x1: x + W / 2, y0: y - H / 2, y1: y + H / 2, area: W * H, cy: y };
  });
  const top = Math.min(...box.map((b) => b.y0)), bottom = Math.max(...box.map((b) => b.y1)), left = Math.min(...box.map((b) => b.x0)), right = Math.max(...box.map((b) => b.x1));
  const span = bottom - top, wide = right - left;
  const named = TOOL_HELD.test(name) && !(HANGS_HELD.test(name) && !/brush|wand|stick/i.test(name));
  if (span <= 1e-6) return undefined;
  if (params.tilts !== true && UPRIGHT_HELD.test(name) && !TOOL_HELD.test(name.replace(UPRIGHT_HELD, ""))) {
    // (upright: not turned; the hand holds it a little up from its bottom end)
    const gyU = bottom - 0.12 * span, nearU = box.filter((b) => b.y0 <= gyU + 1e-6 && b.y1 >= gyU - 1e-6), gxU = nearU.length ? nearU.reduce((a, b) => a + (b.x0 + b.x1) / 2, 0) / nearU.length : (left + right) / 2;
    const { angle: wob } = hitWobble(Array.isArray(params.hits) ? (params.hits as ThingHit[]) : [], ctx.t, true);
    return partsShapes(parts, S, ctx.at.x - gxU * S, ctx.at.y - gyU * S, wob, ctx.at.x, ctx.at.y, String(params.outline ?? "#1f1f1f"));
  }
  if (params.tilts !== true && !named && (HANGS_HELD.test(name) || span < 1.8 * wide)) return undefined;
  // (the heavy head: where most of the thing's area is — the grip is at the other end, a little in from it)
  const area = box.reduce((a, b) => a + b.area, 0) || 1, heavy = box.reduce((a, b) => a + b.area * b.cy, 0) / area;
  const d = heavy >= (top + bottom) / 2 ? 1 : -1; // +1: head at the bottom, gripped near the top
  const gy = d === 1 ? top + 0.12 * span : bottom - 0.12 * span;
  const near = box.filter((b) => b.y0 <= gy + 1e-6 && b.y1 >= gy - 1e-6), gx = near.length ? near.reduce((a, b) => a + (b.x0 + b.x1) / 2, 0) / near.length : (left + right) / 2;
  // REAL-SIZE LONG TOOLS, HEAD ON THE FLOOR (Arthur, Oct 15, his drawing of sweeping: "the handle angled down to the broom head
  // flat on the floor ahead, the head pushing along the floor"). A long floor tool — a broom, a mop, a rake, a hoe, a shovel, a
  // spade, a pitchfork — is as long as a real one (≥ 0.82 of the figure: a hand at chest height reaches the floor with it), and a
  // SLIDING one (broom, mop, rake, squeegee) keeps its head ON the floor whenever the floor is within its reach: the shaft turns
  // down (or up) from the hand just enough that the head's far end rests on the ground, on the side the shaft already points.
  const floorTool = FLOOR_TOOL.test(name), sliding = SLIDING_TOOL.test(name);
  if (floorTool && span * S < MIN_FLOOR_TOOL * ctx.height) S = (MIN_FLOOR_TOOL * ctx.height) / span;
  let f = ctx.forearm!, slide = 0;
  // (a digging tool — a shovel, a spade, a hoe — may bite into the ground by a blade's depth when it stabs, never deeper: a held
  // tool is never drawn sunk into the floor)
  const bite = sliding ? 0 : 0.08 * ctx.height;
  if (floorTool && Number.isFinite(ctx.groundY)) {
    const reach = (d === 1 ? bottom - gy : gy - top) * S, drop = ctx.groundY - ctx.at.y, gap = drop - f.y * reach;
    if (reach > 1e-6 && drop > 0 && gap < -bite && f.y > 0) slide = Math.min(0.6 * reach, reach - (drop + bite) / f.y); // (it would sink: the hand holds it further down the shaft — the head rests on the floor)
    else if (sliding && reach > 1e-6 && drop > 0 && drop < reach && gap > 0 && f.y > -0.3) {
      // (it floats just above the floor: the shaft tips down until the head rests on it — fully when it is close, easing off when
      // it is held well up, so a lifted tool stays lifted and nothing ever jumps)
      const th = Math.atan2(f.x, f.y), phi = Math.acos(drop / reach) * (th >= 0 ? 1 : -1), w = Math.min(1, Math.max(0, 1 - (gap - 0.12 * ctx.height) / (0.2 * ctx.height))) * Math.min(1, (reach - drop) / (0.15 * ctx.height));
      const a = th + w * (phi - th);
      f = { x: Math.sin(a), y: Math.cos(a) };
    }
  }
  // (turn the thing so its handle → head line runs along the forearm: local (0, d) → (forearm.x, forearm.y))
  const angle = (Math.atan2(-d * f.x, d * f.y) * 180) / Math.PI;
  const { angle: wobble } = hitWobble(Array.isArray(params.hits) ? (params.hits as ThingHit[]) : [], ctx.t, true);
  const ax = ctx.at.x - f.x * slide, ay = ctx.at.y - f.y * slide;
  return partsShapes(parts, S, ax - gx * S, ay - gy * S, angle + wobble, ax, ay, String(params.outline ?? "#1f1f1f"));
}
function drawPropBody(ctx: EffectContext, params0: EffectParams): Shape[] {
  // (EVERY NAMED THING HAS A PICTURE — effects/everydayThings.ts: a "ball", "broom", "chair" with no parts and no built-in symbol
  // gets its parts from the everyday picture book, so every parts rule below works on it; never drawn as nothing)
  const params = withEverydayPicture(params0, (n) => symbolName(n) !== undefined);
  let S = Number(params.size ?? 0.5) * ctx.height;
  const hits = Array.isArray(params.hits) ? (params.hits as ThingHit[]) : [];
  if (Array.isArray(params.parts) && params.parts.length) {
    const parts = params.parts.filter((p): p is Part => !!p && typeof p === "object");
    // (a LINE part runs from y to y + h — Oct 15: a scooter's stem going UP from its deck counted as reaching far below it, so the
    // parked scooter floated; every other part is centered on y)
    const ext = (p: Part): [number, number] => { const y = typeof p.y === "number" ? p.y : 0, h = typeof p.h === "number" ? p.h : 0.3; return p.shape === "line" ? [Math.min(y, y + h), Math.max(y, y + h)] : [y - Math.abs(h) / 2, y + Math.abs(h) / 2]; };
    const bottom = Math.max(...parts.map((p) => ext(p)[1])) * S;
    const top = Math.min(...parts.map((p) => ext(p)[0])) * S;
    // (on the floor: its lowest part's bottom on the ground line, never floating just above it or sunk into it)
    // (A HELD THING — anchored to a figure's hand or body: the engine gives it the figure's facing — is carried by the hand: it
    // never snaps onto the floor and never hangs from a chain; Arthur, Oct 12: a mug in the hand had a chain up to the sky)
    const held = ctx.facing !== undefined;
    if (held && ctx.forearm && !params.string) { const tool = heldTool(parts, S, ctx, params); if (tool) return tool; }
    // (ON A WALL / DOWN IN A PIT — tumble.ts: a rock or ledge placed on a wall (`onWall`) or wholly below the ground line, sticking out
    // of a cliff face or a pit's side, stays exactly where it was put: it neither snaps up onto the floor nor hangs from a chain)
    const inWall = !held && (params.onWall === true || ctx.at.y + top > ctx.groundY + 0.02 * ctx.height);
    const standing = !held && !inWall && ctx.at.y + bottom >= ctx.groundY - 0.25 * S;
    // (HANGS FROM THE HAND BY ITS HANDLE — Oct 15: a held bucket was drawn with the hand in its middle: a bucket, pail, bag, lantern,
    // basket, suitcase, kettle or watering can carried in one hand hangs BELOW the hand, its top (the handle) in the fist)
    const byHandle = held && !params.string && params.upright !== true && HANGS_BY_HANDLE.test(`${params.name ?? ""} ${params.symbol ?? ""}`);
    const cy = standing ? ctx.groundY - bottom : byHandle ? ctx.at.y - top : ctx.at.y;
    const { angle } = hitWobble(hits, ctx.t, !standing);
    // (a standing thing rocks on the edge of what touches the floor — its lowest part — never lifting off it)
    const foot = parts.reduce((a, p) => ((typeof p.y === "number" ? p.y : 0) + Math.abs(typeof p.h === "number" ? p.h : 0.3) / 2 > (typeof a.y === "number" ? a.y : 0) + Math.abs(typeof a.h === "number" ? a.h : 0.3) / 2 ? p : a));
    const edge = (Math.abs(typeof foot.x === "number" ? foot.x : 0) + Math.abs(typeof foot.w === "number" ? foot.w : 0.3) / 2) * S;
    // NOTHING FLOATS (Arthur, 2026-10-08: "it's floating — it needs a stand or to be hooked up to a chain"): a thing
    // that neither stands on the floor nor flies (a bird, a balloon, a kite, a cloud, the moon...) HANGS from something:
    // a chain from its top up out of the page, and it swings on that chain (a long chain swings it less sharply).
    const flies = params.flies === true || /bird|balloon|kite|plane|cloud|drone|ufo|ghost|butterfly|bee|star|moon|sun|planet|rocket|spaceship|fly|float|hover/i.test(String(params.symbol ?? ""));
    if (!standing && !flies && !held && !inWall && params.hangs !== false) {
      const topPart = parts.reduce((a, p) => ((typeof p.y === "number" ? p.y : 0) < (typeof a.y === "number" ? a.y : 0) ? p : a));
      const hx = ctx.at.x + (typeof topPart.x === "number" ? topPart.x : 0) * S, hy = cy + top;
      const chainTop = -0.05 * ctx.height;
      if (hy > chainTop + 0.05 * ctx.height) {
        const k = Math.min(1, (bottom - top) / Math.max(1, cy + bottom - chainTop)) * 1.6;
        const swing = angle * k, a = (swing * Math.PI) / 180;
        // (the chain's end, swung about its top by the same turn the parts get: a rigid pendulum)
        const end = [hx - (hy - chainTop) * Math.sin(a), chainTop + (hy - chainTop) * Math.cos(a)];
        const chain: Shape = { kind: "line", points: [hx, chainTop, end[0], end[1]], stroke: String(params.chainColor ?? "#4a4a4a"), width: Math.max(2, 0.012 * ctx.height) };
        // (the thing hangs from the chain's end and turns with it)
        return [chain, ...partsShapes(parts, S, ctx.at.x + (end[0] - hx), cy + (end[1] - hy), swing, end[0], end[1], String(params.outline ?? "#1f1f1f"))];
      }
    }
    const px = ctx.at.x + (standing ? (Math.sign(angle) || 1) * edge : 0), py = standing ? ctx.groundY : cy + top;
    return partsShapes(parts, S, ctx.at.x, cy, angle, px, py, String(params.outline ?? "#1f1f1f"));
  }
  // (a thing named only by its `name` — no `symbol` — is looked up by its name too: a prop "crate" is a crate, never nothing)
  const name = symbolName(params.symbol ?? params.name);
  if (!name) return [];
  const made = placedSymbol({ name, color: params.color, color2: params.color2 });
  // (A LONG LYING THING'S SIZE — Oct 15, a sword at the default size drawn 3 figures long: `size` is a thing's height, but a thing
  // drawn lying along x (a sword, a bat, a stick: 3+ times as long as tall) is never asked for by its thickness: when reading the
  // size as its height would make it longer than 1.2 figures, it is read as its LENGTH instead)
  if (made.width >= 3 * made.height && (S / made.height) * made.width > 1.2 * ctx.height) S *= made.height / made.width;
  // (A THING ON THE FLOOR STANDS ON IT — the symbol twin of the parts rule above: Oct 15, a crate placed at the floor line was drawn
  // half sunk into it. Not held, not flying, its bottom at or near the floor → its bottom on the ground line.)
  const half = (S / 2) * (made.height > 0 ? 1 : 0), heldSym = ctx.facing !== undefined;
  const fliesSym = params.flies === true || /bird|balloon|kite|plane|cloud|drone|ufo|ghost|butterfly|bee|star|moon|sun|planet|rocket|spaceship/i.test(name);
  const y = !heldSym && !fliesSym && params.onWall !== true && ctx.at.y + half >= ctx.groundY - 0.25 * S && ctx.at.y - half < ctx.groundY ? ctx.groundY - half : ctx.at.y;
  const { angle } = hitWobble(hits, ctx.t, y + S / 2 < ctx.groundY - 0.05 * ctx.height);
  return [{ kind: "symbol", name, x: ctx.at.x, y, scale: S / made.height, ...(angle ? { rotation: angle } : {}), ...(params.color ? { color: String(params.color) } : {}) }];
}

export const RECIPES: EffectRecipe[] = [
  {
    id: "transform",
    about: "figure morphs into params.into (car), then moves on path. Anchor {character, joint:'hip'}; params {into:'car'|'moon', size: its height x the figure's (0.45), morph: s (0.8), path:[{t: s after the morph, dx, dy: px from where it formed}], back}: crouch, squash, the symbol grows in its place with sparkles, the figure is gone; then it moves along path (each leg eases, tilts up when flying). back:true = turns back into the figure",
    staysWhenGone: true,
    draw: drawTransform,
  },
  { id: "prop", about: "a thing: params.symbol (moon, car, or ANY everyday thing by its plain name — ball, soccer ball, broom, shovel, rake, mop, bucket, cup, book, chair, table, desk, bench, door, gate, ladder, skateboard, bike, tree, house, campfire, stove, frying pan, phone, flashlight, punching bag, basketball hoop: drawn from the engine's picture book at a real size, no parts needed)/params.parts (only for things the book lacks) at anchor x,y; size=height x figure (0.5); flies: true drifts on the air; string: true + target {character, joint:'rHand'} ties it to a hand", draw: drawProp },
];

// The engine runs the morph after building any scene (a hook, so engine.ts never imports this file back).
addBuiltHook(morphFigures);
