// EXPLOSIONS AND A GRENADE (SPEC-0017 Phase 2C, 2026-10-06 — Arthur: "the app doesn't know what an explosion is").
// Rules, not drawings, like every effect:
// - A GROUND explosion (a grenade, not a nuke) is a quick bright FLASH and a FIREBALL at the ground, then a thin STEM
//   rising with a big CLOUD on top (a small mushroom, almost a tree shape), dirt and stones thrown out (they fall and
//   land), a low dust skirt along the ground; the cloud's fire cools red → orange → gray, then the cloud BREAKS UP
//   into wisps and fades. A thin dim light on the ground, a dark scorch mark left behind.
// - An AIR explosion bursts EQUALLY in all directions (a round zigzag fireball, a ring of clouds), then rips open.
// - HOW FAR IT PUSHES depends on its strength and the distance (blastSpeed): a stronger blast knocks people back
//   from farther away (blastReach).
// - Things that BREAK are animated breaking apart, not symbols ("crateBreak": a wooden crate's planks and posts fly
//   away from the blast, spinning, fall under gravity and land on the ground, never below it).
// - STILL THINGS ARE SYMBOLS: the "Grenade" (held in the hand, then flying, bouncing lower each time, rolling a
//   little, turning as it rolls, settling) and the "Military cap" (an accessory symbol worn on the head, following
//   the head's place and tilt every picture) are Library symbols placed once per picture.
// DRAWABLE BY HAND, NOT TOO SIMPLE: a few layered flat colors (fire red/orange/yellow; smoke dark, middle and light
// gray-brown), rough wavy outlines that change every picture, a little glow. Stateless and seeded: the same moment
// always gives the same shapes, at 8, 12 or 24 pictures a second.
import { FIRE_ORANGE, FIRE_RED, FIRE_YELLOW, flameOutline, FLAME_BODY } from "./fire.ts";
import { groundBand, groundLight } from "./groundLight.ts";
import { clamp, lerp, mixColor, rand, smooth, wobble } from "./random.ts";
import { wavyOutline } from "./smoke.ts";
import { BLAST_REACH, blastPush, THROWN_AT } from "../moves/blownAway.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const TAU = Math.PI * 2;
// Earth gravity for a 300 px tall figure (objectMoves.ts GRAVITY), scaled with the figure (a zoomed-out scene
// falls the same way, only smaller).
const GRAVITY_PER_HEIGHT = 2000 / 300;
export const gravityFor = (height: number) => GRAVITY_PER_HEIGHT * height;

// ---- How far a blast pushes -------------------------------------------------------------------------------------
// ONE RULE FOR ANYTHING A BLAST HITS — people and things obey the same blast: the PUSH is the body's own rule
// (moves/blownAway.ts blastPush): strength / (1 + (distance / BLAST_REACH heights)^2), full right at it, half at
// BLAST_REACH heights. A push of THROWN_AT or more throws a person (blown away); anything is thrown at LAUNCH_SPEED
// heights a second x the push (blownAway.ts's launch speed) — and light things faster (lightness: smaller bits
// fly farther).
export { BLAST_REACH, THROWN_AT };
export const LAUNCH_SPEED = 4.4;
export const blastPushAt = (strength: number, distance: number, height: number) => blastPush(strength, distance, 0, height);
// The speed (px/s) a blast gives something `distance` px from it.
export const blastSpeed = (strength: number, distance: number, height: number) => LAUNCH_SPEED * height * blastPushAt(strength, distance, height);
// How far (px) from a blast of `strength` people are still thrown (blown away): a stronger blast reaches farther.
export const blastReach = (strength: number, height: number) => (strength <= THROWN_AT ? 0 : BLAST_REACH * height * Math.sqrt(strength / THROWN_AT - 1));
// How much faster a piece `len` px long is thrown than a person (x): a crate's plank about 1.3x, small bits up to 1.7x.
export const lightness = (len: number, height: number) => clamp(1.1 * Math.sqrt((0.3 * height) / Math.max(1, len)), 1, 1.7);

// ---- The explosion -----------------------------------------------------------------------------------------------
// Ground explosion phases (seconds at speed 1, for a grenade). FAST, THEN SLOW (Arthur, 2026-10-06): the impact
// picture (the bright fireball with debris and dirt streaks) stays; from it the explosion grows ABNORMALLY FAST — the
// stem and cap shoot up to full size in about 0.2 s (GROW_SECONDS is its time constant) — then SNAPS to almost
// still; only when it starts to disintegrate (BREAK_AT) does it go slow: the smoke RIPS OPEN (holes and tears showing
// orange-yellow hot smoke inside — never red), drifts apart and fades, DISINTEGRATE seconds (about 5) for all of its
// smokes (cloud, stem, ground dust).
export const FLASH_SECONDS = 0.12;
export const FIREBALL_SECONDS = 0.45;
export const GROW_SECONDS = 0.07;
// When the growth has SNAPPED to its stop (98.6% grown); the tears start right after it and open slowly through
// the hold, before the break-up (BREAK_AT).
export const GROWN_AT = 0.3;
export const BREAK_AT = 0.9;
// (Arthur: it is gone about 3 SECONDS after the stop — breaking up and fading together.)
export const DISINTEGRATE = 2.4;
export const EXPLOSION_SECONDS = BREAK_AT + DISINTEGRATE;
// The explosion's default size (x the figure's height): Arthur — "about twice as big" as a first guess.
export const EXPLOSION_SIZE = 0.6;
// The smoke shades (young → old), a little warm (dust in it): dark, middle, light.
export const SMOKE_DARK = "#4d4640", SMOKE_MID = "#7b736b", SMOKE_LIGHT = "#b9b2aa";
export const DIRT = "#5c4330", DIRT_LIGHT = "#8a6a4b", DUST = "#ab9478", STONE = "#77736d";
// The dust jets shooting up out of the ground cloud: gray, see-through.
export const DUST_SPIKE = "#8d877f";
// HOT SMOKE (inside the rips as it breaks up): ORANGE and YELLOW only — never red (Arthur: red looks weird there).
export const HOT_ORANGE = FIRE_ORANGE, HOT_YELLOW = FIRE_YELLOW;
// THE STEM (Arthur): thick — STEM_WIDE x R across at the bottom — keeping that thickness, and WIDENING very slightly
// ("by a hair") going up: STEM_WIDEN more at the top.
export const STEM_WIDE = 0.54, STEM_WIDEN = 0.07;
export const stemWidth = (s: number, R: number) => R * STEM_WIDE * (1 + STEM_WIDEN * clamp(s, 0, 1));
// NO TWO EXPLOSIONS ALIKE: each stem has its own few bumps (where and how big, by its seed), between its foot and top.
export function stemBumps(s: number, seed: number) {
  let k = 1;
  const n = 2 + Math.floor(rand(seed, 0, 240) * 3);
  for (let b = 0; b < n; b += 1) k += (0.12 + 0.22 * rand(seed, b, 241)) * Math.exp(-(((s - (0.18 + 0.64 * rand(seed, b, 242))) / 0.07) ** 2));
  return k;
}

// Where the cap cloud is (its middle) and how big, `u` seconds after the blast (x R, the explosion's size).
// (Grows abnormally fast — about 90% in 0.16 s — then nearly stops. SMOOTH, NOT ROBOTIC: smoke never freezes — from
// the stop on it keeps rising and spreading very slowly (HOLD_DRIFT x R a second: about 0.05 figure heights a second,
// a hundredth of the burst's speed), its edges billowing every picture.)
// (KEEPS GROWING SLOWLY, Arthur: a slow-walk pace, clearly visible — the cap about 0.15 figure heights a second taller,
// the cloud about 0.1 wider — the whole time until it is gone.)
export const HOLD_DRIFT = { rise: 0.25, grow: 0.07 };
export function capAt(u: number, R: number) {
  const rise = 1 - Math.exp(-Math.max(0, u) / GROW_SECONDS), drift = Math.max(0, u - GROWN_AT * 0.5);
  return { y: R * (0.6 + 2.6 * rise + HOLD_DRIFT.rise * drift), r: R * (0.5 + 0.62 * rise + HOLD_DRIFT.grow * drift) };
}
// How far the break-up has gone (0 → 1, slowly) and how much of the smoke is left (1 → 0 by `end`).
export const breakUp = (u: number) => smooth((u - BREAK_AT) / (DISINTEGRATE * 0.7));
export function smokeLeft(u: number, end: number) {
  const from = BREAK_AT + 0.45 * Math.max(0.5, end - BREAK_AT);
  return 1 - smooth((u - from) / Math.max(0.1, end - from));
}

// THE PEBBLE symbol (still things are symbols: a pebble keeps its shape while it flies): made at PEBBLE_SIZE (its box
// height), PEBBLE_ASPECT wide.
export const PEBBLE_SIZE = 24, PEBBLE_ASPECT = 1.25;
// Things thrown out (dirt clods and stones — "Pebble" symbols): where piece i is at time u (seconds), landing and
// lying on the ground. `O` = the blast spot on the ground. Exported so the tests can follow them.
export function debrisAt(i: number, u: number, O: Point, R: number, height: number, seed: number) {
  const a = -Math.PI / 2 + (rand(seed, i, 61) - 0.5) * 2.2; // within about 63 degrees of straight up
  const v = R * (3 + 3.2 * rand(seed, i, 62));
  const vx = Math.cos(a) * v, vy = Math.sin(a) * v, g = gravityFor(height);
  const size = R * (0.035 + 0.04 * rand(seed, i, 63)); // its half height
  const tLand = (-2 * vy) / g; // when it is back down on the ground
  const t = Math.min(u, tLand);
  const landed = u >= tLand;
  const turn = (rand(seed, i, 64) - 0.5) * 800 * t, rotation = landed ? lerp(turn, 0, smooth((u - tLand) / 0.15)) : turn;
  const scale = (2 * size) / PEBBLE_SIZE, r = (rotation * Math.PI) / 180;
  const half = (scale * (Math.abs(Math.cos(r)) * PEBBLE_SIZE + Math.abs(Math.sin(r)) * PEBBLE_SIZE * PEBBLE_ASPECT)) / 2;
  const x = O.x + vx * t, y = Math.min(O.y - half, O.y - size + vy * t + (g * t * t) / 2);
  return { x: landed ? x + vx * 0.04 * (1 - Math.exp(-(u - tLand) * 8)) : x, y, size, scale, rotation, landed, tLand };
}

function star(cx: number, cy: number, outer: number, inner: number, n: number, seed: number, t: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 2 * n; i += 1) {
    const a = (i / (2 * n)) * TAU + 0.3 * rand(seed, i, 71), r = (i % 2 === 0 ? outer * (0.75 + 0.4 * rand(seed, i, 72)) : inner) * (1 + 0.08 * wobble(seed, i, t, 9));
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}
// A ROUND ZIGZAG edge (an air burst's fireball): points all round, every other one sticking out a random amount,
// flickering — the same all the way round (no up or down).
function zigzagBall(cx: number, cy: number, r: number, n: number, seed: number, t: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 2 * n; i += 1) {
    const a = (i / (2 * n)) * TAU + 0.15 * rand(seed, i, 111), k = i % 2 === 0 ? 1.05 + 0.3 * rand(seed, i, 112) : 0.78 + 0.08 * rand(seed, i, 113);
    out.push(cx + Math.cos(a) * r * k * (1 + 0.06 * wobble(seed, i, t, 8)), cy + Math.sin(a) * r * k * (1 + 0.06 * wobble(seed, i + 50, t, 8)));
  }
  return out;
}
function keepAboveGround(shapes: Shape[], groundY: number): Shape[] {
  for (const s of shapes) {
    if (s.kind === "circle") s.y = Math.min(s.y, groundY - s.r);
    else if (s.kind === "rect") s.h = Math.max(0, Math.min(s.h, groundY - s.y));
    else if (s.kind !== "symbol") {
      const pad = s.kind === "line" ? s.width / 2 : s.stroke ? (s.width ?? 2) / 2 : 0;
      for (let i = 1; i < s.points.length; i += 2) s.points[i] = Math.min(s.points[i], groundY - pad);
    }
  }
  return shapes;
}

// HOT SPOTS — TEARS IN THE SMOKE (Arthur): only 2–3 per explosion. Each is a tear IN one gray cloud piece — it sits
// inside that piece, moves and turns with it and fades with it (never its own floating cloud) — showing hot smoke of
// ONE flat color, orange OR yellow (picked per spot; never red). TIMING: the tearing starts right after the explosion
// has snapped to its stop (TEAR.at), before the break-up; each tear starts as a thin crack and opens SLOWLY, little by
// little, through the hold (TEAR.open seconds), shrinks back a little (TEAR.back), then disintegrates together with
// the gray smoke. While the hot smoke tears its way out the gray thins away (grayLeft).
// (Arthur: the tearing starts right AT the explosion — as soon as the cloud shows, its blobs are already tearing open.)
export const CLOUD_SHOWS = 0.05;
// (They open over about half a second — little by little, picture by picture — to their full size, about a third of
// their piece across, by the time the explosion stops; then they shrink back a little.)
export const TEAR = { at: CLOUD_SHOWS, open: 0.45, shrink: 0.6, back: 0.15 };
export const tearOpen = (u: number) => (u < TEAR.at ? 0 : smooth((u - TEAR.at) / TEAR.open) * (1 - TEAR.back * smooth((u - TEAR.at - TEAR.open) / TEAR.shrink)));
// How much of the gray smoke is left as it breaks up (1 → 0.5): it gets see-through. (Dense through the hold, so the
// blobs torn in it show bright and clear; they share its fade.)
export const grayLeft = (u: number) => 1 - 0.5 * smooth((u - BREAK_AT) / (DISINTEGRATE * 0.8));
// A gray cloud piece (a wavy blob: its middle, radii, turn, tail taper and curl, outline seed).
export type CloudPiece = { x: number; y: number; rx: number; ry: number; ang: number; taper: number; curl: number; seed: number };
export const pieceOutline = (p: CloudPiece, u: number, turb: number) => wavyOutline(p.x, p.y, p.rx, p.ry, p.ang, p.seed, u, turb, p.taper, p.curl);
// Which pieces get a hot spot (2 or 3 of the first `pieces`, by the seed) and each spot's one color.
export function hotSpotParents(seed: number, pieces: number) {
  const k = Math.min(pieces, 2 + (rand(seed, 0, 150) < 0.5 ? 1 : 0));
  const order = Array.from({ length: Math.min(pieces, 6) }, (_, i) => i).sort((a, b) => rand(seed, a, 151) - rand(seed, b, 151));
  return order.slice(0, k).map((parent, j) => ({ parent, color: rand(seed, j, 152) < 0.5 ? HOT_ORANGE : HOT_YELLOW, j }));
}
// The hot spot j inside its parent piece at `u` (null before it tears): a crack along the piece that opens slowly.
export function hotSpotIn(p: CloudPiece, j: number, u: number, seed: number): number[] | null {
  const open = tearOpen(u);
  if (open <= 0) return null;
  // (hot smoke: it drifts and wobbles a little inside its piece from the heat)
  const ox = ((rand(seed, j, 153) - 0.5) * 0.2 + 0.05 * wobble(seed + 310, j, u, 1.6)) * p.rx, oy = ((rand(seed, j, 154) - 0.5) * 0.2 + 0.05 * wobble(seed + 320, j, u, 1.6)) * p.ry, c = Math.cos(p.ang), s = Math.sin(p.ang);
  const rx = p.rx * (0.28 + 0.07 * rand(seed, j, 155)) * (0.15 + 0.85 * open), ry = p.ry * ((0.2 + 0.08 * rand(seed, j, 156)) * Math.pow(open, 1.3) + 0.02);
  return wavyOutline(p.x + ox * c - oy * s, p.y + ox * s + oy * c, rx, ry, p.ang + (rand(seed, j, 157) - 0.5) * 0.3, seed + 300 + j, u, 0.4);
}

// DUST SPIKES (Arthur): gray, see-through jets of dust shooting out of the ground cloud — 2–4 of them, each pointing
// AWAY from the blast, starting out at the EDGE of the ground cloud with a clear gap from the stem (never at its base,
// never in it); random sizes and spacing (some closer together, some a bit nearer the stem), thick (SPIKE_WIDE x the
// figure height), rough and uneven. Most about HALF a figure tall; about a quarter of explosions (by their seed) have
// one as tall as a figure or a bit more. They shoot out fast, then fade with the dust. Spike i: its base (on the
// ground cloud's edge), lean (radians from straight up, + = right), full length and width.
export const SPIKE_WIDE = 0.14;
// x the figure height: the clear gap between the stem's edge and the nearest edge of a spike.
export const SPIKE_GAP = 0.17;
export const hasBigSpikes = (seed: number) => rand(seed, 0, 201) < 0.25;
export function dustSpikes(O: Point, R: number, height: number, seed: number) {
  // (how many, by the seed: 2 most of the time, 3 now and then, 4 rarely — bigger blasts would get more)
  const r = rand(seed, 2, 207), n = r < 0.6 ? 2 : r < 0.9 ? 3 : 4, first = rand(seed, 3, 207) < 0.5 ? -1 : 1;
  const bigOne = hasBigSpikes(seed) ? Math.floor(rand(seed, 4, 207) * n) : -1;
  // (the stem's widest at its foot, its bumps included)
  const stemHalf = (stemWidth(0, R) * 1.4) / 2;
  return Array.from({ length: n }, (_, i) => {
    const big = i === bigOne, side = i % 2 === 0 ? first : -first;
    const wide = height * SPIKE_WIDE * (big ? 1.4 : 1) * (0.75 + 0.5 * rand(seed, i, 206));
    const deg = 22 + 33 * rand(seed, i, 203); // up from the ground, leaning out
    const out = stemHalf + SPIKE_GAP * height + wide * 0.6 + R * 0.55 * rand(seed, i, 204); // out at the ground cloud's edge
    return {
      x: O.x + side * out, y: O.y - R * 0.06, angle: side > 0 ? deg : 180 - deg,
      lean: (side * (90 - deg) * Math.PI) / 180,
      tall: height * (big ? 1 + 0.25 * rand(seed, i, 205) : 0.3 + 0.4 * rand(seed, i, 205)),
      wide,
      bend: (rand(seed, i, 209) - 0.5) * 0.15,
    };
  });
}
// A spike's outline: NOT a perfect spike — a slightly bent, bumpy, uneven jet of dust (each side its own bumps, a
// ragged rounded tip), changing a little every picture.
export function spikeOutline(sp: ReturnType<typeof dustSpikes>[number], i: number, tall: number, wide: number, seed: number, u: number): number[] {
  const ux = Math.sin(sp.lean), uy = -Math.cos(sp.lean), nx = -uy, ny = ux, left: number[] = [], right: number[] = [];
  const bumps = (side: number, s: number) => {
    let b = 0;
    for (let k = 0; k < 3; k += 1) b += (0.3 / (k + 1)) * Math.sin(TAU * ((2 + k * 1.7 + rand(seed, i * 7 + side, 210 + k)) * s + rand(seed, i * 7 + side, 220 + k))) * (0.8 + 0.4 * rand(seed, i, 230 + k));
    return 1 + b + 0.08 * wobble(seed + 90 + i * 2 + side, Math.round(s * 12), u, 3);
  };
  const M = 12;
  for (let m = 0; m <= M; m += 1) {
    const s = m / M, along = s * tall, off = sp.bend * tall * s * s;
    const core = Math.max(0.12, Math.pow(1 - s, 0.75));
    const bx = sp.x + ux * along + nx * off, by = sp.y + uy * along + ny * off;
    const hl = (wide / 2) * core * bumps(0, s), hr = (wide / 2) * core * bumps(1, s);
    left.push(bx - nx * hl, by - ny * hl); right.unshift(bx + nx * hr, by + ny * hr);
  }
  return [...left, ...right];
}

// NO TWO EXPLOSIONS ALIKE: the cap's blobs (how many, where, how big, its overall width and height) come from its seed.
const CAP_BLOBS = [
  { dx: 0, dy: 0.15, rx: 1.05, ry: 0.55, shade: 0 },
  { dx: -0.55, dy: 0.05, rx: 0.6, ry: 0.48, shade: 1 },
  { dx: 0.55, dy: 0.08, rx: 0.62, ry: 0.46, shade: 1 },
  { dx: -0.2, dy: -0.28, rx: 0.62, ry: 0.5, shade: 1 },
  { dx: 0.28, dy: -0.25, rx: 0.58, ry: 0.48, shade: 2 },
  { dx: -0.02, dy: -0.48, rx: 0.48, ry: 0.36, shade: 2 },
  { dx: -0.6, dy: -0.15, rx: 0.42, ry: 0.36, shade: 2 },
  { dx: 0.62, dy: -0.12, rx: 0.4, ry: 0.34, shade: 1 },
];
export function capBlobs(seed: number) {
  const n = 5 + Math.floor(rand(seed, 0, 140) * 4), wide = 0.85 + 0.35 * rand(seed, 0, 141), tall = 0.85 + 0.3 * rand(seed, 0, 142);
  return CAP_BLOBS.slice(0, n).map((b, i) => ({
    dx: (b.dx + (rand(seed, i, 143) - 0.5) * 0.3) * wide, dy: (b.dy + (rand(seed, i, 144) - 0.5) * 0.2) * tall,
    rx: b.rx * (0.8 + 0.4 * rand(seed, i, 145)) * wide, ry: b.ry * (0.8 + 0.4 * rand(seed, i, 146)) * tall, shade: b.shade,
  }));
}

// THE CAP CLOUD's gray pieces and its 2–3 hot spots (each with the piece it is torn in). Exported for the tests.
export function capCloud(u: number, O: Point, R: number, seed: number, turb: number, fade: number) {
  const cap = capAt(u, R), brk = breakUp(u), cx = O.x, cy = O.y - cap.y;
  const shades = [SMOKE_DARK, SMOKE_MID, SMOKE_LIGHT], appear = smooth((u - 0.05) / 0.15);
  const pieces: CloudPiece[] = capBlobs(seed).map((b, i) => {
    const out = 1 + brk * (0.6 + 0.5 * rand(seed, i, 41));
    return {
      // (billowing: each blob drifts round its place a little, all the time)
      x: cx + (b.dx * out + 0.07 * wobble(seed + 40, i, u, 1.6)) * cap.r * 1.3, y: cy + (b.dy * out - brk * 0.35 * rand(seed, i, 42) + 0.05 * wobble(seed + 45, i, u, 1.4)) * cap.r,
      rx: b.rx * cap.r * (1 - 0.3 * brk), ry: b.ry * cap.r * (1 - 0.35 * brk), ang: (rand(seed, i, 43) - 0.5) * 0.5, taper: brk * 0.6, curl: (rand(seed, i, 44) - 0.5) * brk, seed: seed + 50 + i,
    };
  });
  const alpha = fade * grayLeft(u) * appear;
  const blobs = pieces.map((p, i) => ({ piece: p, shape: { kind: "poly", points: pieceOutline(p, u, turb), fill: shades[capBlobs(seed)[i].shade], alpha } as Shape }));
  return { blobs, spots: spotsIn(pieces, u, seed, pieces.map(() => alpha)) };
}
// The hot spots torn in some of these pieces: one flat color each. A spot SHARES ITS PIECE'S FADE exactly: its alpha =
// its own (spotAlpha, 1 once torn) x its piece's alpha (`alphas`), every picture — as see-through as its gray piece, and
// gone at the same moment.
export const spotAlpha = (u: number) => smooth((u - TEAR.at) / 0.1);
function spotsIn(pieces: CloudPiece[], u: number, seed: number, alphas: number[]) {
  const out: { parent: number; shape: Shape }[] = [];
  for (const h of hotSpotParents(seed, pieces.length)) {
    const pts = hotSpotIn(pieces[h.parent], h.j, u, seed);
    const a = spotAlpha(u) * alphas[h.parent];
    if (pts && a > 0.005) out.push({ parent: h.parent, shape: { kind: "poly", points: pts, fill: h.color, alpha: a } });
  }
  return out;
}

// THE STEM'S PIECES (Arthur's dad: "it breaks into stacked perfect squares"): the stem is one column until it
// disintegrates; then it breaks along IRREGULAR cut lines — each at its own height (not evenly spaced), tilted its own
// way, jagged — into chunks of varied shapes: one stays roughly a block, one pinches into a triangle, one rounds off
// like a lump, with wobbly edges; they drift apart, turn a little and fade. Each piece: its outline, a lighter streak,
// its shape kind and how far it has broken off (`gap`). Exported for the tests (`cuts`: the cut lines).
export const STEM_PIECES = 4;
export function stemCuts(stemH: number, R: number, seed: number) {
  const cuts: number[][] = [];
  for (let c = 1; c < STEM_PIECES; c += 1) {
    const s = (c + (rand(seed, c, 250) - 0.5) * 0.55) / STEM_PIECES, tilt = (rand(seed, c, 251) - 0.5) * 0.9 * stemWidth(s, R) * (rand(seed, c, 252) < 0.5 ? -1 : 1);
    const pts: number[] = [];
    for (let m = 0; m <= 4; m += 1) pts.push(m / 4, s + (tilt * (m / 4 - 0.5) + (m > 0 && m < 4 ? (rand(seed, c * 7 + m, 253) - 0.5) * 0.35 * stemWidth(s, R) : 0)) / stemH);
    cuts.push(pts); // (pairs: across the stem 0..1, height along it 0..1)
  }
  return cuts;
}
export function stemPieces(u: number, O: Point, R: number, stemH: number, seed: number) {
  const gap = smooth((u - BREAK_AT - 0.2) / (DISINTEGRATE * 0.6));
  const cuts = stemCuts(stemH, R, seed);
  // where a point (across 0..1, along s) of the unbroken stem is
  const at = (q: number, s: number, side: number) => {
    const w = stemWidth(s, R) * stemBumps(s, seed) * (1 + 0.06 * wobble(seed + 30, Math.round(s * 24) + side, u, 3));
    const drift = R * 0.16 * wobble(seed + 31, 1, u + s * 2, 1.3) * s; // (the stem sways a little, all the time)
    return [O.x + drift + (q - 0.5) * w, O.y - s * stemH];
  };
  const edgeOf = (k: number, fromQ: number) => { // the cut line k (0 = the ground, STEM_PIECES = the top), left → right
    if (k === 0 || k === STEM_PIECES) { const s = k === 0 ? 0 : 1; return [0, 0.5, 1].flatMap((q) => at(q, s, 0)); }
    const c = cuts[k - 1], pts: number[] = [];
    for (let i = 0; i < c.length; i += 2) pts.push(...at(c[i], c[i + 1], i));
    return pts;
  };
  const out: { points: number[]; streak: number[]; kind: number; gap: number }[] = [];
  for (let j = 0; j < STEM_PIECES; j += 1) {
    const bottom = edgeOf(j, 0), top = edgeOf(j + 1, 0);
    // (the cut's height at its left end, middle and right end)
    const cutS = (k: number, idx: number) => (k === 0 ? 0 : k === STEM_PIECES ? 1 : cuts[k - 1][idx]);
    const sb = cutS(j, 5), st = cutS(j + 1, 5);
    // the sides: wobbly, from the bottom cut's end up to the top cut's end on that side
    const right: number[] = [], left: number[] = [];
    for (let m = 1; m < 5; m += 1) { right.push(...at(1, lerp(cutS(j, 9), cutS(j + 1, 9), m / 5), 1)); left.unshift(...at(0, lerp(cutS(j, 1), cutS(j + 1, 1), m / 5), 2)); }
    // outline: bottom (left → right), up the right side, top (right → left), down the left side
    const topRev: number[] = []; for (let i = top.length - 2; i >= 0; i -= 2) topRev.push(top[i], top[i + 1]);
    const pts = [...bottom, ...right, ...topRev, ...left];
    const kind = Math.floor(rand(seed, j, 254) * 3); // 0 a block, 1 a triangle, 2 a lump
    const n = pts.length / 2;
    let cx = 0, cy = 0; for (let i = 0; i < n; i += 1) { cx += pts[2 * i]; cy += pts[2 * i + 1]; } cx /= n; cy /= n;
    if (gap > 0) {
      const g = gap, turn = (rand(seed, j, 255) - 0.5) * 0.8 * g, ct = Math.cos(turn), sn = Math.sin(turn);
      const avg = pts.reduce((sum, v, i) => sum + (i % 2 ? 0 : Math.hypot(v - cx, pts[i + 1] - cy)), 0) / n;
      const topY = Math.min(...pts.filter((_, i) => i % 2 === 1));
      for (let i = 0; i < n; i += 1) {
        let dx = pts[2 * i] - cx, dy = pts[2 * i + 1] - cy;
        if (kind === 1 && pts[2 * i + 1] < (topY + cy) / 2) { dx *= 1 - 0.85 * g; } // pinches to a point: a triangle
        if (kind === 2) { const d = Math.hypot(dx, dy) || 1, k = Math.pow(avg / d, 0.8 * g); dx *= k; dy *= k; } // rounds off
        const shrink = 1 - 0.25 * g;
        pts[2 * i] = cx + (dx * ct - dy * sn) * shrink; pts[2 * i + 1] = cy + (dx * sn + dy * ct) * shrink;
      }
      // drifting apart: sideways a little and up (the higher, the more), each its own way
      const mx = g * R * 0.3 * (rand(seed, j, 256) - 0.5), my = -g * R * 0.12 * (j + rand(seed, j, 257));
      for (let i = 0; i < n; i += 1) { pts[2 * i] += mx; pts[2 * i + 1] += my; }
      cx += mx; cy += my;
    }
    out.push({ points: pts, streak: [cx - R * 0.06, cy + stemH * (st - sb) * 0.3, cx - R * 0.05, cy - stemH * (st - sb) * 0.3], kind, gap });
  }
  return out;
}

// THE GROUND EXPLOSION in shapes at `u` seconds (speed already applied). `R` = its size (px), `O` = the spot on the
// ground, `D` = how long it lasts (it is all faded by then).
export function groundExplosion(u: number, O: Point, R: number, D: number, height: number, seed: number, turb = 0.6): { back: Shape[]; front: Shape[] } {
  const back: Shape[] = [], front: Shape[] = [];
  const end = Math.max(BREAK_AT + 1, D), fade = smokeLeft(u, end), brk = breakUp(u);
  // The scorch mark it leaves on the ground (stays).
  if (u > 0.08) back.push({ kind: "poly", points: groundBand(O.x, O.y, R * 0.75, R * 0.05), fill: "#3a3029", alpha: 0.55 * smooth((u - 0.08) / 0.3) });
  // Light on the ground: a thin dim warm line, bright in the flash, gone as the fire goes.
  back.push(...groundLight(O.x, O.y, R * (1.6 + 1.2 * smooth(u / 0.2)), R * 0.06, "#ffb347", 0.55 * (1 - smooth(u / FIREBALL_SECONDS))));
  // THE DUST SKIRT: low wavy dust rolling out along the ground both ways; it stays at the bottom and fades with the
  // rest of the smoke.
  for (let i = 0; i < 5; i += 1) {
    const side = i - 2, spread = R * (0.25 + 1.35 * (1 - Math.exp(-u / 0.35)) + 0.12 * brk);
    const x = O.x + side * spread * 0.45, rx = R * (0.32 + 0.25 * smooth(u / 0.4)) * (1 - 0.15 * Math.abs(side) / 2), ry = R * (0.14 + 0.08 * smooth(u / 0.5));
    back.push({ kind: "poly", points: wavyOutline(x, O.y - ry * 0.55, rx, ry, 0, seed + 20 + i, u, turb), fill: i % 2 ? DUST : mixColor(DUST, SMOKE_LIGHT, 0.4), alpha: 0.85 * fade * smooth(u / 0.06) });
  }
  // DUST SPIKES jetting up out of the ground cloud: fast up, then slowly widening and fading with the dust.
  if (u > 0.02) for (const [i, sp] of dustSpikes(O, R, height, seed).entries()) {
    const grow = 1 - Math.exp(-u / (0.06 + 0.04 * rand(seed, i, 211))), tall = sp.tall * grow * (1 + 0.06 * Math.max(0, u - 0.3)), wide = sp.wide * (1 + 0.5 * smooth((u - 0.3) / 2.5));
    back.push({ kind: "poly", points: spikeOutline(sp, i, tall, wide, seed, u), fill: DUST_SPIKE, alpha: (0.5 + 0.18 * rand(seed, i, 212)) * fade * (1 - 0.4 * brk) });
  }
  const cap = capAt(u, R);
  // THE STEM: a thick wavy column from the ground up into the cap (gray-brown, a lighter streak), the same thickness
  // at the bottom and very slightly wider going up; it rips open, then breaks into pieces that drift apart and fade.
  const stemTop = O.y - cap.y + cap.r * 0.35, stemH = O.y - stemTop;
  if (u > 0.06) {
    const a = fade * grayLeft(u) * smooth((u - 0.06) / 0.12);
    for (const piece of stemPieces(u, O, R, stemH, seed)) {
      back.push({ kind: "poly", points: piece.points, fill: SMOKE_MID, alpha: a * (1 - 0.4 * piece.gap) });
      // (one solid flat gray with its bumpy edges: no light line down its middle — Arthur: "it looks like road markings")
    }
  }
  // THE CAP: a big cloud on top, wider than tall, made of a few wavy blobs in 3 flat shades (dark underneath,
  // middle, light on top), fire inside it at first; then 2–3 of its pieces TEAR open (one flat orange or yellow hot
  // spot each), its pieces drift out and up and fade.
  if (u > 0.05) {
    const cx = O.x, cy = O.y - cap.y;
    const cloud = capCloud(u, O, R, seed, turb, fade);
    for (const b of cloud.blobs) back.push(b.shape);
    // fire still in the cloud right after the impact (red, orange, yellow), shrinking away before it breaks up
    const hot = 1 - smooth((u - 0.15) / 0.55);
    if (hot > 0.02) {
      const layers = [{ c: FIRE_RED, k: 1 }, { c: FIRE_ORANGE, k: 0.68 }, { c: FIRE_YELLOW, k: 0.36 }];
      layers.forEach((L, j) => {
        if (j === 2 && u > 0.5) return;
        const rr = cap.r * 0.75 * L.k * hot;
        if (rr > 1) front.push({ kind: "poly", points: wavyOutline(cx, cy + cap.r * 0.18, rr * 1.25, rr * 0.8, 0, seed + 60 + j, u * 1.6, 1), fill: L.c, alpha: 0.95, glow: j === 0 ? R * 0.15 : undefined });
      });
    }
    // the hot spots: tears inside their own cloud pieces
    for (const sp of cloud.spots) back.push(sp.shape);
  }
  // THE FIREBALL at the ground (layered flame: red outside, orange, a big yellow middle that flashes then shrinks),
  // swelling fast, then rising into the cap and going.
  const fb = u / FIREBALL_SECONDS;
  if (fb < 1) {
    const r = R * 0.62 * smooth(u / 0.08) * (1 - 0.6 * smooth((fb - 0.35) / 0.65));
    const y = O.y - r * 0.55 - (capAt(u, R).y - R * 0.5) * smooth(fb);
    const flash = 1 - smooth(u / 0.2);
    const layers = [
      { fill: FIRE_RED, w: 1, h: 1, glow: R * 0.25 },
      { fill: FIRE_ORANGE, w: 0.84, h: 0.9, glow: 0 },
      { fill: FIRE_YELLOW, w: 0.45 + 0.4 * flash, h: 0.5 + 0.4 * flash, glow: 0 },
    ];
    if (r > 1) layers.forEach((L, j) => {
      const pts = flameOutline({ x: O.x, y: y + r * 0.35, ang: -Math.PI / 2, h: r * 1.7 * L.h, w: r * 2.2 * L.w, body: FLAME_BODY.ball, teeth: 5 - j, tips: 5 - j, round: 0.6, rough: 0.55 + 0.3 * turb, rise: 0.5, flow: 4, back: 1, seed: seed + j * 23, layer: j, t: u });
      front.push({ kind: "poly", points: pts, fill: L.fill, alpha: 1 - smooth((fb - 0.75) / 0.25), glow: L.glow || undefined });
    });
  }
  // THE FLASH: a bright starburst (pale yellow, a white middle, a glow), only for the first moment.
  if (u < FLASH_SECONDS) {
    const k = 1 - u / FLASH_SECONDS, r = R * (1.1 + 0.6 * (u / FLASH_SECONDS));
    front.push({ kind: "poly", points: star(O.x, O.y - R * 0.35, r, r * 0.45, 9, seed, u), fill: "#fff3b0", alpha: 0.9 * k, glow: R * 0.5 });
    front.push({ kind: "circle", x: O.x, y: O.y - R * 0.35, r: R * 0.42 * (0.6 + 0.4 * k), fill: "#ffffff", alpha: k });
  }
  // DIRT SPRAY: brown streaks shooting out in the first moment.
  if (u < 0.3) for (let i = 0; i < 7; i += 1) {
    const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.4 + 0.15 * (rand(seed, i, 81) - 0.5), d0 = R * (0.4 + 1.6 * smooth(u / 0.3)), d1 = d0 + R * (0.5 + 0.4 * rand(seed, i, 82)) * (1 - u / 0.3);
    front.push({ kind: "line", points: [O.x + Math.cos(a) * d0, O.y + Math.sin(a) * d0, O.x + Math.cos(a) * d1, O.y + Math.sin(a) * d1], stroke: i % 2 ? DIRT : DIRT_LIGHT, width: R * 0.06, alpha: 1 - smooth((u - 0.15) / 0.15) });
  }
  // DEBRIS: pebbles (the "Pebble" symbol: they keep their shape) thrown up and out; they fall (gravity), land and lie
  // there, then fade.
  for (let i = 0; i < 14; i += 1) {
    const d = debrisAt(i, u, O, R, height, seed);
    const a = 1 - smooth((u - Math.max(d.tLand + 0.6, end * 0.6)) / 0.6);
    if (a <= 0.01) continue;
    front.push({ kind: "symbol", name: "Pebble", x: d.x, y: d.y, scale: d.scale, rotation: d.rotation, alpha: a });
  }
  return { back: keepAboveGround(back, O.y), front: keepAboveGround(front, O.y) };
}

// THE AIR EXPLOSION: bursts EQUALLY in all directions (no up or down, no stem): a flash, a round fireball with a
// random zigzag edge (red, orange, a yellow middle) that grows abnormally fast and snaps to a stop, a ring of wavy
// smoke clouds all round it, sparks flying out evenly; then 2–3 of its pieces tear open (one flat orange or yellow hot
// spot each, never red), it drifts out evenly and fades over about 5 s.
export function airExplosion(u: number, O: Point, R: number, D: number, seed: number, turb = 0.6): Shape[] {
  const out: Shape[] = [];
  const end = Math.max(BREAK_AT + 1, D), fade = smokeLeft(u, end), brk = breakUp(u);
  const grow = 1 - Math.exp(-Math.max(0, u) / GROW_SECONDS), size = R * (grow + 0.04 * Math.max(0, u - BREAK_AT));
  // (NOT A SUNFLOWER — Arthur, Oct 7: "it evenly turns out like a sunflower ... that's physically impossible": the smoke
  // is a LUMPY, OVERLAPPING mass — clumps of different sizes at uneven angles, some close in, some further out, drifting
  // out at different speeds — that still reaches about as far every way; never a neat ring of petals round a middle.)
  const N = 13, shades = [SMOKE_DARK, SMOKE_MID, SMOKE_LIGHT];
  if (u > 0.04) {
    const appear = smooth((u - 0.04) / 0.12), pieces: CloudPiece[] = [];
    for (let i = 0; i < N; i += 1) {
      const a = ((i + 0.5 + 0.7 * (rand(seed, i, 131) - 0.5)) / N) * TAU, reach = 0.45 + 0.4 * rand(seed, i, 133);
      const d = size * reach * (1 + brk * (0.45 + 0.3 * rand(seed, i, 134))), r = size * (0.3 + 0.32 * rand(seed, i, 132)) * (1 - 0.25 * brk);
      pieces.push({ x: O.x + Math.cos(a) * d, y: O.y + Math.sin(a) * d, rx: r * (0.85 + 0.3 * rand(seed, i, 135)), ry: r * (0.7 + 0.3 * rand(seed, i, 136)), ang: a + 0.6 * (rand(seed, i, 137) - 0.5), taper: brk * 0.5, curl: 0, seed: seed + 160 + i });
    }
    // (the clumps' middle kept on the blast — uneven clumps, but not a lopsided cloud: it still went off evenly)
    const mx = pieces.reduce((t, p) => t + p.x, 0) / N - O.x, my = pieces.reduce((t, p) => t + p.y, 0) / N - O.y;
    for (const p of pieces) { p.x -= mx; p.y -= my; }
    // (the core: a lumpy middle a little off centre, under the clumps)
    const cx = O.x + size * 0.08 * (rand(seed, 0, 171) - 0.5), cy = O.y + size * 0.08 * (rand(seed, 0, 172) - 0.5), core = size * 0.62 * (1 - 0.3 * brk);
    out.push({ kind: "poly", points: wavyOutline(cx, cy, core, core * 0.9, 0, seed + 170, u, turb), fill: SMOKE_MID, alpha: fade * grayLeft(u) * appear });
    pieces.forEach((p, i) => out.push({ kind: "poly", points: pieceOutline(p, u, turb), fill: shades[Math.floor(rand(seed, i, 138) * 3)], alpha: fade * grayLeft(u) * appear }));
    // 2–3 hot spots, each a tear in one of the ring's pieces
    for (const sp of spotsIn(pieces, u, seed, pieces.map(() => fade * grayLeft(u) * appear))) out.push(sp.shape);
  }
  const fb = u / FIREBALL_SECONDS;
  if (fb < 1) {
    const r = R * 0.9 * smooth(u / 0.06) * (1 - 0.5 * smooth((fb - 0.4) / 0.6)), a = 1 - smooth((fb - 0.7) / 0.3);
    [[FIRE_RED, 1], [FIRE_ORANGE, 0.78], [FIRE_YELLOW, 0.5 + 0.3 * (1 - smooth(u / 0.2))]].forEach(([c, k], j) => {
      if (r > 1) out.push({ kind: "poly", points: zigzagBall(O.x, O.y, r * (k as number), 11 - j * 2, seed + 190 + j, u), fill: c as string, alpha: a, glow: j === 0 ? R * 0.25 : undefined });
    });
  }
  if (u < FLASH_SECONDS) {
    const k = 1 - u / FLASH_SECONDS;
    out.push({ kind: "poly", points: star(O.x, O.y, R * 1.3, R * 0.55, 10, seed, u), fill: "#fff3b0", alpha: 0.9 * k, glow: R * 0.5 });
    out.push({ kind: "circle", x: O.x, y: O.y, r: R * 0.45 * (0.6 + 0.4 * k), fill: "#ffffff", alpha: k });
  }
  // (sparks thrown out every way — at uneven angles and speeds, not spokes of a wheel)
  for (let i = 0; i < 18; i += 1) {
    const v = u / (0.4 + 0.25 * rand(seed, i, 139));
    if (v >= 1) continue;
    const a = ((i + rand(seed, i, 135)) / 18) * TAU, d = R * (0.5 + (0.8 + 0.9 * rand(seed, i, 140)) * (1 - (1 - v) ** 2));
    out.push({ kind: "circle", x: O.x + Math.cos(a) * d, y: O.y + Math.sin(a) * d, r: Math.max(2, R * (0.025 + 0.03 * rand(seed, i, 141))), fill: i % 2 ? HOT_ORANGE : HOT_YELLOW, alpha: 1 - smooth((v - 0.6) / 0.4) });
  }
  return out;
}

const explosion: EffectRecipe = {
  id: "explosion",
  about: "An EXPLOSION at the anchor. A GROUND explosion (default; a grenade, not a nuke): a quick bright flash and a fireball at the ground, then a THICK STEM (the same thickness at the bottom, very slightly wider going up) rising under a big CLOUD like a small mushroom (almost a tree shape: wavy layered gray-brown smoke), dirt streaks and Pebble symbols thrown out that fall and land, a low dust skirt along the ground with 3–4 thick, rough, see-through gray DUST SPIKES jetting out of it, spaced out round the blast and all pointing AWAY from it (most half a figure tall; about a quarter of explosions also one taller than a figure), a thin dim light on the ground and a scorch mark. It grows ABNORMALLY FAST from the impact (full size in about 0.2 s), SNAPS to almost still; right then 2–3 of its cloud pieces start to TEAR open, slowly, each showing one flat hot color (orange or yellow, never red) inside that piece, while the gray thins; the tears shrink back a little, then it all breaks up and fades over about 5 s. `air: true` = an AIR explosion: it bursts EQUALLY in all directions (a round zigzag fireball, a ring of smoke clouds, sparks), rips open the same way and fades. Pair it with a small screen shake (`shake` at its start). Knobs: size (x height, default 0.6 = a grenade: about twice the size you'd guess), strength (1 = a grenade: how far it pushes, see blast push), speed, turbulence, seed. Things it breaks: crateBreak; people near it are blown away (blownAway) if inside its reach (a stronger blast reaches farther).",
  draw(ctx, p) {
    const speed = clamp(num(p.speed, 1), 0.2, 4), u = ctx.t * speed, seed = num(p.seed, 5);
    const R = num(p.size, EXPLOSION_SIZE) * ctx.height, turb = clamp(num(p.turbulence, 0.6), 0, 1);
    if (p.air === true) return airExplosion(u, ctx.at, R * 0.8, ctx.duration * speed, seed, turb);
    const O = { x: ctx.at.x, y: ctx.groundY };
    const { back, front } = groundExplosion(u, O, R, ctx.duration * speed, ctx.height, seed, turb);
    // (The track's own layer decides behind/in front of the figures; the smoke column sits behind its fire.)
    return [...back, ...front];
  },
};

// ---- The grenade: held, thrown, bouncing, rolling, settling ------------------------------------------------------
// The "Grenade" symbol: made at GRENADE_SIZE (its box height, stage units), GRENADE_ASPECT wide (x the height).
export const GRENADE_SIZE = 40;
export const GRENADE_ASPECT = 0.8;
// On a figure: the grenade is this tall (x the figure's height) — a little bigger than real, so it reads.
export const GRENADE_LENGTH = 0.1;
export const GRENADE_OLIVE = "#5f6f2f", GRENADE_DARK = "#2c3416";

// The grenade in its own box (w x h): an olive oval body with a segmented ("pineapple") grid, a shadow side and a
// highlight, the metal fuse on top, the spoon lever down its side and the pin ring.
export function grenadeShapes(size: number, w: number, h: number, color = GRENADE_OLIVE, color2 = GRENADE_DARK): Shape[] {
  const lw = size * 0.05, cx = w * 0.47, cy = h * 0.62, rx = w * 0.36, ry = h * 0.35;
  const oval = (x: number, y: number, a: number, b: number, n = 20) => { const o: number[] = []; for (let i = 0; i < n; i += 1) { const t = (i / n) * TAU; o.push(x + Math.cos(t) * a, y + Math.sin(t) * b); } return o; };
  const light = mixColor(color, "#ffffff", 0.35), shadow = mixColor(color, color2, 0.45), metal = "#9aa1a8", metalDark = "#4b5058";
  const out: Shape[] = [];
  // the spoon lever behind the body's right side (a metal strip from the fuse down the side)
  const spoon = [cx + rx * 0.25, cy - ry - h * 0.08, cx + rx * 0.85, cy - ry * 0.95, cx + rx * 1.12, cy - ry * 0.45, cx + rx * 1.12, cy + ry * 0.2];
  out.push({ kind: "line", points: spoon, stroke: metalDark, width: size * 0.09 + lw });
  out.push({ kind: "line", points: spoon, stroke: metal, width: size * 0.09 });
  // the body: dark edge, the shadow side, the olive body pushed up-left, a highlight
  out.push({ kind: "poly", points: oval(cx, cy, rx, ry), fill: shadow, stroke: color2, width: lw });
  out.push({ kind: "poly", points: oval(cx - rx * 0.08, cy - ry * 0.07, rx * 0.86, ry * 0.86), fill: color });
  // the segments: rows (curved, the body is round) and columns
  for (const k of [-0.5, 0, 0.5]) {
    const y = cy + k * ry, half = rx * Math.sqrt(1 - k * k) * 0.97, pts: number[] = [];
    for (let m = 0; m <= 8; m += 1) { const s = m / 8 - 0.5; pts.push(cx + 2 * s * half, y + ry * 0.12 * (1 - 4 * s * s)); }
    out.push({ kind: "line", points: pts, stroke: color2, width: size * 0.035 });
  }
  for (const k of [-0.55, 0, 0.55]) {
    const pts: number[] = [];
    for (let m = 0; m <= 10; m += 1) { const s = -0.97 + (1.94 * m) / 10, y = cy + s * ry; pts.push(cx + k * rx * Math.sqrt(1 - s * s), y); }
    out.push({ kind: "line", points: pts, stroke: color2, width: size * 0.035 });
  }
  out.push({ kind: "poly", points: oval(cx - rx * 0.4, cy - ry * 0.45, rx * 0.22, ry * 0.15), fill: light, alpha: 0.75 });
  // the fuse on top: a metal neck and its cap
  const nw = w * 0.3, top = cy - ry - h * 0.12;
  out.push({ kind: "rect", x: cx - nw / 2, y: top, w: nw, h: h * 0.15, fill: metal, stroke: metalDark, width: lw * 0.8 });
  out.push({ kind: "rect", x: cx - nw * 0.35, y: top - h * 0.06, w: nw * 0.7, h: h * 0.07, fill: "#7d838a", stroke: metalDark, width: lw * 0.7 });
  // the pin ring (left of the fuse) on its pin
  const ringR = w * 0.12, rcx = cx - nw / 2 - ringR * 0.85, rcy = top + h * 0.02;
  out.push({ kind: "line", points: [rcx + ringR * 0.8, rcy + ringR * 0.3, cx - nw * 0.2, top + h * 0.08], stroke: metalDark, width: size * 0.04 });
  out.push({ kind: "circle", x: rcx, y: rcy, r: ringR, stroke: metalDark, width: size * 0.055 + lw * 0.6 });
  out.push({ kind: "circle", x: rcx, y: rcy, r: ringR, stroke: "#c4cad0", width: size * 0.055 });
  return out;
}

// The grenade's scale for a figure `height` px tall (the placed symbol's `scale`).
export const grenadeScale = (height: number) => (GRENADE_LENGTH * height) / GRENADE_SIZE;
// Half its size when lying on its side / standing (px): the ground contact height for a turn of `deg`.
export function grenadeHalfExtent(height: number, deg: number) {
  const L = GRENADE_LENGTH * height, W = L * GRENADE_ASPECT, a = (deg * Math.PI) / 180;
  return (Math.abs(Math.cos(a)) * L + Math.abs(Math.sin(a)) * W) / 2 * 0.86; // (the oval body, not its box corners)
}

// THE GRENADE'S PATH after it leaves the hand: a gravity arc from the release spot `from` to the ground at `landX`
// (topping out `apex` px above the higher end), then BOUNCES, each lower than the last (the ground takes most of the
// fall: `bounciness` of the falling speed comes back up), then it ROLLS a little, slowing, turning as it rolls, and
// SETTLES lying on its side. Times are seconds after the release.
export type GrenadeSegment = { kind: "arc"; t0: number; t1: number; x0: number; y0: number; vx: number; vy: number; rot0: number; spin: number } | { kind: "roll"; t0: number; t1: number; x0: number; v0: number; a: number; rot0: number; rot1: number };
export type GrenadePath = { segments: GrenadeSegment[]; land: number; bounces: { t: number; height: number }[]; settle: number; restX: number; restRotation: number };
// EVEN A SHORT TOSS IS A REAL THROW WITH AN ARC (Arthur, 2026-10-06: "he tossed it straight up and it dropped straight
// down"): a thrown thing leaves the hand going forward and up at about THROW_ANGLE degrees (the angle that throws
// farthest for the effort) — never straight up and down. `arcApex` = how high the arc tops out above the higher end
// for that angle, from the release spot to where it lands. An overhand throw goes out flatter (about 40 degrees, the
// angle that throws farthest for the effort); an underhand toss is a lob (about 55 degrees: released at hip height,
// rising — the same lob as a ball's underhand toss, throwCatch.ts).
export const THROW_ANGLE = { overhand: 40, underhand: 55 };
export function launchAngle(from: Point, landX: number, restY: number, apex: number, height: number) {
  const g = gravityFor(height), top = Math.min(from.y, restY) - apex;
  const vy = Math.sqrt(2 * g * Math.max(1e-6, from.y - top)), T = vy / g + Math.sqrt((2 * Math.max(1e-6, restY - top)) / g);
  return (Math.atan2(vy, Math.abs(landX - from.x) / T) * 180) / Math.PI;
}
export function arcApex(from: Point, landX: number, groundY: number, height: number, angle = THROW_ANGLE.overhand) {
  const restY = groundY - grenadeHalfExtent(height, 90);
  let lo = 0, hi = 10 * height;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (launchAngle(from, landX, restY, mid, height) < angle) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
// THE EFFORT MATCHES THE FLIGHT: given `velocity` (px/s: the hand's own speed and direction as it lets go), it flies
// from there under gravity and lands wherever that takes it (a hard throw far, a soft toss short); otherwise it is
// aimed at `landX` on an arc (`apex`, or `angle`).
export function grenadePath(o: { from: Point; landX?: number; velocity?: Point; groundY: number; height: number; apex?: number; angle?: number; spin?: number; bounciness?: number; maxBounces?: number }): GrenadePath {
  const g = gravityFor(o.height), e = o.bounciness ?? 0.4, minHop = 0.01 * o.height;
  const restY = o.groundY - grenadeHalfExtent(o.height, 90);
  let vx0: number, vy0: number, T: number, landX: number;
  if (o.velocity) {
    vx0 = o.velocity.x; vy0 = o.velocity.y;
    T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * g * Math.max(0, restY - o.from.y))) / g; landX = o.from.x + vx0 * T;
  } else {
    landX = o.landX ?? o.from.x + o.height;
    const top = Math.min(o.from.y, restY) - (o.apex ?? arcApex(o.from, landX, o.groundY, o.height, o.angle));
    vy0 = -Math.sqrt(2 * g * Math.max(1, o.from.y - top)); T = -vy0 / g + Math.sqrt((2 * Math.max(1, restY - top)) / g); vx0 = (landX - o.from.x) / T;
  }
  const dir = Math.sign(vx0) || 1;
  const segments: GrenadeSegment[] = [];
  const spin0 = dir * (o.spin ?? 540); // degrees a second: tumbling end over end in the air
  segments.push({ kind: "arc", t0: 0, t1: T, x0: o.from.x, y0: o.from.y, vx: vx0, vy: vy0, rot0: 0, spin: spin0 });
  let t = T, x = landX, vx = vx0, vyDown = vy0 + g * T, rot = spin0 * T;
  const bounces: { t: number; height: number }[] = [];
  for (let k = 0; k < (o.maxBounces ?? 3); k += 1) {
    const up = e * vyDown, hop = (up * up) / (2 * g);
    if (hop < minHop) break;
    vx *= 0.5; // the ground drags it (a heavy little thing on dirt: it doesn't skip far)
    const dt = (2 * up) / g, spin = dir * Math.min(Math.abs(spin0), (Math.abs(vx) / grenadeHalfExtent(o.height, 90)) * (180 / Math.PI) * 0.8);
    bounces.push({ t, height: hop });
    segments.push({ kind: "arc", t0: t, t1: t + dt, x0: x, y0: restY, vx, vy: -up, rot0: rot, spin });
    t += dt; x += vx * dt; rot += spin * dt; vyDown = up;
  }
  // ROLL: slowing to a stop, turning as it rolls, ending lying on its side (an odd multiple of 90 degrees).
  vx *= 0.8;
  const rEff = grenadeHalfExtent(o.height, 90) * 1.1, natural = Math.abs(vx) * 0.25; // (about a quarter second's worth)
  const natTurn = (natural / rEff) * (180 / Math.PI);
  let rot1 = rot + dir * natTurn;
  rot1 = 90 + 180 * Math.round((rot1 - 90) / 180);
  if ((rot1 - rot) * dir < 20) rot1 += dir * 180;
  const dist = (Math.abs(rot1 - rot) * Math.PI / 180) * rEff;
  const v0 = Math.max(Math.abs(vx), 1) * dir, dur = clamp((2 * dist) / Math.abs(v0), 0.35, 0.8);
  const a = Math.abs(v0) / dur; // slowing evenly to a stop at `dur`
  const travel = (Math.abs(v0) * dur) / 2;
  segments.push({ kind: "roll", t0: t, t1: t + dur, x0: x, v0, a, rot0: rot, rot1 });
  return { segments, land: T, bounces, settle: t + dur, restX: x + dir * travel, restRotation: rot1 };
}
// Where the grenade is `t` seconds after the release: its middle and turn (degrees, clockwise).
export function grenadeAt(path: GrenadePath, t: number, groundY: number, height: number): { x: number; y: number; rotation: number } {
  const g = gravityFor(height);
  const seg = path.segments.find((s) => t <= s.t1) ?? path.segments[path.segments.length - 1];
  const tt = clamp(t, seg.t0, seg.t1) - seg.t0;
  let x: number, y: number, rotation: number;
  if (seg.kind === "arc") {
    x = seg.x0 + seg.vx * tt; y = seg.y0 + seg.vy * tt + (g * tt * tt) / 2; rotation = seg.rot0 + seg.spin * tt;
  } else {
    const dur = seg.t1 - seg.t0, dir = Math.sign(seg.v0) || 1, v = Math.abs(seg.v0);
    const d = v * tt - (v / dur) * tt * tt / 2, total = (v * dur) / 2, u = total > 0 ? d / total : 1;
    x = seg.x0 + dir * d; rotation = lerp(seg.rot0, seg.rot1, u); y = groundY;
  }
  // never below the ground: its lowest point rests on it at most
  y = Math.min(y, groundY - grenadeHalfExtent(height, rotation));
  return { x, y, rotation };
}

const grenade: EffectRecipe = {
  id: "grenade",
  about: "The Grenade symbol (an olive oval with a segmented grid, the spoon lever and the pin ring). HELD (`mode: \"held\"`, anchor = the hand, target = the elbow of that arm): in the hand, just past it along the forearm, kept nearly upright. THROWN (`mode: \"flight\"`, anchor = where it left the hand; `vx`, `vy` = the hand's own velocity as it let go, in figure heights a second — it flies from there under gravity and lands where that takes it; or else target = where it first hits the ground): a gravity arc leaving the hand forward and up — about 40 degrees overhand, a 55-degree lob underhand (`angle`; even a short toss is a real arc; `apex` x height above the higher end overrides it), BOUNCES lower each time, rolls a little turning as it rolls and SETTLES on its side — then it lies there until the track ends (end it when it explodes). Overhand throws land far, underhand tosses near.",
  draw(ctx, p) {
    const scale = grenadeScale(ctx.height);
    if (p.mode === "flight") {
      const target = ctx.target ?? { x: ctx.at.x + ctx.height, y: ctx.groundY };
      const velocity = typeof p.vx === "number" && typeof p.vy === "number" ? { x: p.vx * ctx.height, y: p.vy * ctx.height } : undefined;
      const path = grenadePath({ from: ctx.at, landX: target.x, velocity, groundY: ctx.groundY, height: ctx.height, apex: typeof p.apex === "number" ? p.apex * ctx.height : undefined, angle: typeof p.angle === "number" ? p.angle : undefined, spin: num(p.spin, 540), bounciness: num(p.bounciness, 0.4) });
      const at = grenadeAt(path, ctx.t, ctx.groundY, ctx.height);
      return [{ kind: "symbol", name: "Grenade", x: at.x, y: at.y, scale, rotation: at.rotation }];
    }
    const hand = ctx.at, elbow = ctx.target ?? { x: hand.x, y: hand.y - 1 };
    const dx = hand.x - elbow.x, dy = hand.y - elbow.y, L = Math.hypot(dx, dy) || 1;
    const out = (GRENADE_LENGTH * GRENADE_ASPECT * ctx.height) / 2 * 0.8;
    // (nearly upright in the hand, leaning a little with the forearm)
    const lean = clamp(((Math.atan2(dx, -dy) * 180) / Math.PI) * 0.2, -35, 35);
    return [{ kind: "symbol", name: "Grenade", x: hand.x + (dx / L) * out, y: hand.y + (dy / L) * out, scale, rotation: lean }];
  },
};

// ---- The military cap: an accessory symbol on the head ------------------------------------------------------------
export const CAP_SIZE = 40;
export const CAP_ASPECT = 2.5;
export const CAP_OLIVE = "#56602e", CAP_DARK = "#262b12";
// The crown (the part over the head) in the cap's box: x from `left` to `right` (x the box width), y from `top` to
// `bottom` (x the box height); the peak sticks out forward past `right`.
export const CAP_CROWN = { left: 0.03, right: 0.738, top: 0.08, bottom: 0.86 };
// The cap in its own box (w x h), its peak (visor) to the RIGHT (the way the figure faces; flip it for left):
// a flat-topped olive crown with seams and a darker band, a short stiff visor, an outline and a highlight.
export function militaryCapShapes(size: number, w: number, h: number, color = CAP_OLIVE, color2 = CAP_DARK): Shape[] {
  const lw = size * 0.05, light = mixColor(color, "#ffffff", 0.3), band = mixColor(color, color2, 0.35), visor = mixColor(color, color2, 0.55);
  const L = w * CAP_CROWN.left, Rt = w * CAP_CROWN.right, top = h * CAP_CROWN.top, bottom = h * CAP_CROWN.bottom;
  const out: Shape[] = [];
  // the visor (sticks out forward, a little down)
  out.push({ kind: "poly", points: [Rt - w * 0.06, bottom - h * 0.2, w * 0.97, bottom - h * 0.02, w * 0.96, bottom + h * 0.08, Rt - w * 0.08, bottom + h * 0.06], fill: visor, stroke: color2, width: lw });
  // the crown: a flat top, the back a little lower than the front
  const crown = [L, bottom, L + w * 0.012, top + h * 0.1, L + w * 0.06, top, Rt - w * 0.05, top - h * 0.02, Rt, top + h * 0.06, Rt, bottom];
  out.push({ kind: "poly", points: crown, fill: color, stroke: color2, width: lw });
  // the band round the bottom
  out.push({ kind: "poly", points: [L, bottom - h * 0.22, Rt, bottom - h * 0.22, Rt, bottom, L, bottom], fill: band, stroke: color2, width: lw * 0.8 });
  // seams down the crown, a highlight along the top, a little badge on the front
  for (const s of [0.36, 0.62]) out.push({ kind: "line", points: [L + (Rt - L) * s, top + h * 0.04, L + (Rt - L) * (s + 0.02), bottom - h * 0.24], stroke: color2, width: lw * 0.6, alpha: 0.7 });
  out.push({ kind: "line", points: [L + w * 0.08, top + h * 0.1, Rt - w * 0.1, top + h * 0.08], stroke: light, width: h * 0.08, alpha: 0.7 });
  out.push({ kind: "rect", x: Rt - w * 0.12, y: top + h * 0.26, w: w * 0.06, h: h * 0.18, fill: color2, alpha: 0.85 });
  return out;
}
// x the figure's height: the default head radius (rig.ts HEAD_RADIUS.normal).
const HEAD = 0.07;
// ACCESSORIES COVER THE BODY PART (Arthur, 2026-10-06: the head poked out of the cap): the cap sits DOWN over the
// top of the head — its crown as wide as the head and its outline and a bit more (CROWN_WIDE x the head radius) and
// reaching down to CROWN_DOWN head radii above the head's middle (it covers about the top third of the head) — its
// peak forward. Sized and placed from the head radius every picture, turning with the head. (Only if the user asks
// for a small hat perched on top may it look like that.)
export const CROWN_WIDE = 2.5, CROWN_DOWN = 0.25;
const capTall = CROWN_WIDE / ((CAP_CROWN.right - CAP_CROWN.left) * CAP_ASPECT); // box height, x the head radius
// Where the cap's box middle is: forward and up from the head's middle (x the head radius), and its box height.
export const CAP_ON_HEAD = {
  forward: ((0.5 - (CAP_CROWN.left + CAP_CROWN.right) / 2) * CAP_ASPECT) * capTall,
  up: CROWN_DOWN + (CAP_CROWN.bottom - 0.5) * capTall,
  tall: capTall,
};
// (`outline` = the head's line width: the cap covers the outline too, however thick the lines are.)
export function capPlacement(head: Point, neck: Point, facing: string | undefined, headRadius: number, outline = 0) {
  const ux0 = head.x - neck.x, uy0 = head.y - neck.y, L = Math.hypot(ux0, uy0) || 1, ux = ux0 / L, uy = uy0 / L;
  const side = facing === "left" ? -1 : 1;
  const fx = side * -uy, fy = side * ux; // forward: a quarter turn from "up the head", the way the face points
  const r = headRadius + outline / 2;
  const x = head.x + fx * CAP_ON_HEAD.forward * r + ux * CAP_ON_HEAD.up * r, y = head.y + fy * CAP_ON_HEAD.forward * r + uy * CAP_ON_HEAD.up * r;
  const rotation = (Math.atan2(ux, -uy) * 180) / Math.PI;
  return { x, y, rotation, flipX: side < 0, scale: (CAP_ON_HEAD.tall * r) / CAP_SIZE };
}
const militaryCap: EffectRecipe = {
  id: "militaryCap",
  about: "The Military cap symbol worn on a figure's head (anchor = its head, target = its neck; layer \"top\" so it is over the head): placed every picture on top of the head, following the head's place and tilt, its peak the way the figure faces. `headSize` = the head radius x height (default 0.07), `outline` = the head's line width (px). Put it on with the character's `wears: [\"militaryCap\"]` (it then stays on in every picture).",
  draw(ctx, p) {
    const neck = ctx.target ?? { x: ctx.at.x, y: ctx.at.y + 1 };
    const c = capPlacement(ctx.at, neck, ctx.facing, num(p.headSize, HEAD) * ctx.height, num(p.outline, 0));
    return [{ kind: "symbol", name: "Military cap", x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, ...(c.flipX ? { flipX: true } : {}) }];
  },
};

// ---- A wooden crate that breaks apart in a blast -------------------------------------------------------------------
// Before the blast it is the "Wooden crate" symbol (a still thing). In the blast it BREAKS APART (a puff of splinters,
// drawn), and DEBRIS ARE SYMBOLS (Arthur): each flying piece keeps its shape, so it is a "Wood plank" or a "Wood chip"
// symbol placed, turned and sized every picture — thrown away from the blast and up (the same push as a person),
// spinning; it falls, clatters and settles lying flat on the ground.
export const CRATE = "#b07a3c", CRATE_DARK = "#7a4f22", CRATE_EDGE = "#4a2e12";
// The debris symbols, made at these sizes (box height, stage units) and shapes (width x the height): a plank is a long
// board with grain and one splintered end, a chip a small splinter.
export const PLANK = { size: 20, aspect: 6 }, CHIP = { size: 12, aspect: 3 };
export type CratePiece = { x: number; y: number; len: number; thick: number; rot: number; chip: boolean };
// The crate's pieces where they sit in the crate (box `s` px, its bottom middle at `at`): 4 planks across the
// front, the frame (top, bottom, two sides) and the cross brace.
export function cratePieces(at: Point, s: number): CratePiece[] {
  const f = s * 0.12, x0 = at.x - s / 2, y0 = at.y - s, out: CratePiece[] = [];
  const plank = (x: number, y: number, len: number, rot: number) => out.push({ x, y, len, thick: len / PLANK.aspect, rot, chip: false });
  for (let i = 0; i < 4; i += 1) plank(at.x, y0 + f + ((s - 2 * f) * (i + 0.5)) / 4, s - 2 * f, 0);
  plank(at.x, y0 + f / 2, s, 0);
  plank(at.x, at.y - f / 2, s, 0);
  plank(x0 + f / 2, y0 + s / 2, s - 2 * f, 90);
  plank(x0 + s - f / 2, y0 + s / 2, s - 2 * f, 90);
  plank(at.x, y0 + s / 2, s, 45);
  // and small splintered bits (Wood chips)
  for (let i = 0; i < 6; i += 1) { const len = s * (0.16 + 0.05 * (i % 3)); out.push({ x: at.x + (i / 5 - 0.5) * s * 0.7, y: y0 + s * (0.3 + 0.4 * ((i * 7) % 5) / 4), len, thick: len / CHIP.aspect, rot: (i * 47) % 180, chip: true }); }
  return out;
}
const halfDown = (len: number, thick: number, deg: number) => { const a = (deg * Math.PI) / 180; return (Math.abs(Math.sin(a)) * len + Math.abs(Math.cos(a)) * thick) / 2; };
// THROWN BY A BLAST (any piece of anything it breaks; Arthur: "the blast should throw its pieces like it throws a
// person"): pushed away from the blast and UP into the air in an arc (blastSpeed x lightness: higher and farther the
// closer and lighter it is), spinning; gravity brings it down; it hits the ground, bounces (clatters) lower each time,
// skids and settles lying flat. Where piece i is `u` seconds after the blast.
export function crateBreakPiece(piece: CratePiece, i: number, u: number, blast: Point, strength: number, groundY: number, height: number, seed: number) {
  const g = gravityFor(height);
  const dx = piece.x - blast.x, d = Math.hypot(dx, piece.y - groundY);
  const v = blastSpeed(strength, d, height) * lightness(piece.len, height) * (0.85 + 0.3 * rand(seed, i, 91));
  const up = ((48 + 22 * rand(seed, i, 92)) * Math.PI) / 180, dir = Math.sign(dx) || 1;
  let vx = dir * Math.cos(up) * v, vy = -Math.sin(up) * v, spin = (rand(seed, i, 93) < 0.5 ? -1 : 1) * (360 + 540 * rand(seed, i, 94)) * clamp(v / height, 0.4, 2.5);
  const rest = piece.thick / 2;
  let t0 = 0, x0 = piece.x, y0 = piece.y, rot0 = piece.rot, peakY = piece.y;
  // flight, then up to 2 bounces (each lower: the ground takes most of it), each a gravity arc
  for (let k = 0; k < 3; k += 1) {
    const yEnd = groundY - rest;
    const T = (-vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, yEnd - y0))) / g;
    peakY = Math.min(peakY, vy < 0 ? y0 - (vy * vy) / (2 * g) : y0);
    if (u < t0 + T) {
      const tt = u - t0, rot = rot0 + spin * tt;
      const y = Math.min(y0 + vy * tt + (g * tt * tt) / 2, groundY - halfDown(piece.len, piece.thick, rot));
      return { x: x0 + vx * tt, y, rot, landed: k > 0, tLand: k === 0 ? Infinity : t0, peakY, settled: false };
    }
    const vDown = vy + g * T;
    x0 += vx * T; rot0 += spin * T; t0 += T; y0 = yEnd;
    const hop = (0.3 * vDown) ** 2 / (2 * g);
    if (hop < 0.015 * height || k === 2) break;
    vy = -0.3 * vDown; vx *= 0.55; spin *= 0.5;
  }
  // skids a little (friction) and settles lying flat
  const flat = 180 * Math.round(rot0 / 180), k = u - t0 >= 0.8 ? 1 : (1 - Math.exp(-(u - t0) * 7)) / (1 - Math.exp(-0.8 * 7));
  const rot = lerp(rot0, flat, smooth((u - t0) / 0.18));
  return { x: x0 + (vx / 7) * k * 0.6, y: groundY - halfDown(piece.len, piece.thick, rot), rot, landed: true, tLand: t0, peakY, settled: u - t0 > 0.6 };
}
// THE DEBRIS SYMBOLS' shapes in their own boxes (w x h). A Wood plank: a board (flat wood color, a dark edge), a
// darker grain line, a nail hole, one end square and one splintered. A Wood chip: a small splinter, pointed at both
// ends. A Pebble: a rough gray-brown stone with a shadow and a highlight.
export function woodPlankShapes(size: number, w: number, h: number, color = CRATE, color2 = CRATE_EDGE): Shape[] {
  const lw = size * 0.08, p = lw / 2 + size * 0.02, x0 = p, x1 = w - p, y0 = p, y1 = h - p, jag = (y1 - y0) * 0.9;
  return [
    { kind: "poly", points: [x0, y0, x1, y0, x1 - jag * 0.6, y0 + (y1 - y0) * 0.3, x1, y0 + (y1 - y0) * 0.55, x1 - jag, y1, x0, y1], fill: color, stroke: color2, width: lw },
    { kind: "line", points: [x0 + (x1 - x0) * 0.08, y0 + (y1 - y0) * 0.38, x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.45, x1 - jag * 1.4, y0 + (y1 - y0) * 0.36], stroke: mixColor(color, color2, 0.45), width: lw * 0.7 },
    { kind: "line", points: [x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.72, x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.7], stroke: mixColor(color, color2, 0.3), width: lw * 0.5 },
    { kind: "circle", x: x0 + (y1 - y0) * 0.6, y: (y0 + y1) / 2, r: (y1 - y0) * 0.12, fill: "#3a3a3a" },
  ];
}
export function woodChipShapes(size: number, w: number, h: number, color = CRATE, color2 = CRATE_EDGE): Shape[] {
  const lw = size * 0.1, p = lw / 2 + size * 0.03;
  return [
    { kind: "poly", points: [p, h * 0.55, w * 0.3, p, w - p, h * 0.35, w * 0.72, h - p, w * 0.25, h * 0.85], fill: color, stroke: color2, width: lw },
    { kind: "line", points: [w * 0.2, h * 0.58, w * 0.75, h * 0.45], stroke: mixColor(color, color2, 0.45), width: lw * 0.6 },
  ];
}
export function pebbleShapes(size: number, w: number, h: number, color = STONE, color2 = "#3f3c39"): Shape[] {
  const lw = size * 0.07, p = lw / 2 + size * 0.02, cx = w / 2, cy = h / 2, rx = w / 2 - p, ry = h / 2 - p, pts: number[] = [];
  const k = [1, 0.86, 0.97, 0.9, 1, 0.84, 0.95, 0.88];
  for (let i = 0; i < k.length; i += 1) { const a = (i / k.length) * TAU; pts.push(cx + Math.cos(a) * rx * k[i], cy + Math.sin(a) * ry * k[i]); }
  return [
    { kind: "poly", points: pts, fill: color, stroke: color2, width: lw },
    { kind: "poly", points: pts.map((v, j) => (j % 2 ? cy + (v - cy) * 0.55 + ry * 0.3 : cx + (v - cx) * 0.75 + rx * 0.12)), fill: mixColor(color, color2, 0.35), alpha: 0.8 },
    { kind: "circle", x: cx - rx * 0.35, y: cy - ry * 0.35, r: Math.min(rx, ry) * 0.22, fill: mixColor(color, "#ffffff", 0.45), alpha: 0.8 },
  ];
}
const crateBreak: EffectRecipe = {
  id: "crateBreak",
  about: "A wooden crate standing on the ground (anchor = its bottom middle) that a blast (target = the blast spot; `breakAt` = seconds into the track) BREAKS APART: before, the Wooden crate symbol; then a puff of splinters and its pieces — Wood plank and Wood chip symbols (debris keep their shape while they fly) — are thrown up and away from the blast like a person is (closer and lighter = higher and farther), spinning, fall, clatter and settle lying flat on the ground, never below it. `size` = the crate x height (default 0.3).",
  draw(ctx, p) {
    const s = num(p.size, 0.3) * ctx.height, at = { x: ctx.at.x, y: ctx.groundY }, breakAt = num(p.breakAt, 0), seed = num(p.seed, 3);
    if (ctx.t < breakAt) return [{ kind: "symbol", name: "Wooden crate", x: at.x, y: at.y - s / 2, scale: s / 100 }];
    const blast = ctx.target ?? { x: at.x - s, y: ctx.groundY };
    const u = ctx.t - breakAt, out: Shape[] = [];
    cratePieces(at, s).forEach((piece, i) => {
      const q = crateBreakPiece(piece, i, u, blast, num(p.strength, 1), ctx.groundY, ctx.height, seed);
      const made = piece.chip ? CHIP : PLANK;
      out.push({ kind: "symbol", name: piece.chip ? "Wood chip" : "Wood plank", x: q.x, y: q.y, scale: piece.len / (made.size * made.aspect), rotation: q.rot });
    });
    // a puff of splinters at the moment it breaks
    if (u < 0.35) for (let i = 0; i < 6; i += 1) {
      const a = Math.atan2(at.y - s / 2 - blast.y, at.x - blast.x) + (rand(seed, i, 97) - 0.5) * 2, d = s * (0.3 + 1.6 * smooth(u / 0.35));
      const x = at.x + Math.cos(a) * d, y = at.y - s / 2 + Math.sin(a) * d;
      out.push({ kind: "line", points: [x, y, x + Math.cos(a) * s * 0.12, y + Math.sin(a) * s * 0.12], stroke: CRATE_DARK, width: Math.max(1.5, s * 0.03), alpha: 1 - smooth(u / 0.35) });
    }
    return keepAboveGround(out, ctx.groundY);
  },
};

export const RECIPES: EffectRecipe[] = [explosion, grenade, militaryCap, crateBreak];
export type { EffectContext, EffectParams };

// How well a placed cap covers a head (ACCESSORIES COVER THE BODY PART): in head radii, how far the crown reaches
// past the head's outline on each side (`left`, `right`) and above it (`over`), and how far down it comes below the
// head's top (`down`). `stroke` = the head outline's width. (The tests check every picture with it.)
export function capCoverOf(cap: { x: number; y: number; scale?: number; rotation?: number; flipX?: boolean }, head: Point, r: number, stroke: number) {
  const k = cap.scale ?? 1, a = (-(cap.rotation ?? 0) * Math.PI) / 180, w = CAP_ASPECT * CAP_SIZE, h = CAP_SIZE;
  const dx = head.x - cap.x, dy = head.y - cap.y;
  let lx = (dx * Math.cos(a) - dy * Math.sin(a)) / k;
  const ly = (dx * Math.sin(a) + dy * Math.cos(a)) / k;
  if (cap.flipX) lx = -lx;
  const cx = lx + w / 2, cy = ly + h / 2, rho = (r + stroke / 2) / k, R0 = r / k;
  return {
    left: (cx - rho - CAP_CROWN.left * w) / R0,
    right: (CAP_CROWN.right * w - (cx + rho)) / R0,
    over: (cy - rho - CAP_CROWN.top * h) / R0,
    down: (CAP_CROWN.bottom * h - (cy - R0)) / R0,
  };
}
