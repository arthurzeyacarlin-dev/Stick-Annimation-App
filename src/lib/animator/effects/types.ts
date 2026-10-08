// EFFECTS (SPEC-0017 Phase 2C): fire, water, lightning, smoke, light, powers and backgrounds, made by RECIPES the
// way the moves are — never hand-drawn frames. A recipe turns a moment in time into simple SHAPES (circles,
// polygons, lines) in stage pixels. Recipes are pure: the same moment and knobs always give the same shapes, so an
// effect looks the same at 8, 12 or 24 pictures a second and can be remade at any frame rate.
//
// ORIGINAL EFFECTS (Arthur: "blue fire, purple lightning, and original effects... that it was never told
// before"): every recipe takes the same knobs — colors, size, speed, direction, turbulence, spread — so a new
// effect is a new mix of knobs on the rules the engine knows (fire rises and flickers, water falls and splashes,
// smoke drifts and breaks apart, lightning branches), never a picture someone drew.
import type { JointName } from "../rig.ts";

export type Point = { x: number; y: number };

// One drawable piece. Colors are CSS colors; alpha 0..1 multiplies the color's own alpha.
export type Shape =
  | { kind: "circle"; x: number; y: number; r: number; fill?: string; stroke?: string; width?: number; alpha?: number; glow?: number }
  | { kind: "poly"; points: number[]; fill?: string; stroke?: string; width?: number; alpha?: number; glow?: number }
  | { kind: "line"; points: number[]; stroke: string; width: number; alpha?: number; glow?: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: string; fill2?: string; stroke?: string; width?: number; alpha?: number }
  | TextShape
  | SymbolShape;

// WORDS (text.ts): a line of text filling its BOX — `points` = the box's 4 corners (top-left, top-right, bottom-right,
// bottom-left, in stage px), so it moves, turns, squashes and stretches with its box and everything that moves or
// measures shapes by their points handles it. `size` = the letters' height (font px) when the box is its natural size
// (text.ts textBox); drawn in the engine's heavy rounded cartoon font (text.ts TEXT_FONT), filled `fill` (top) fading
// to `fill2` (bottom), with a thick `stroke` outline `width` px wide so it reads on any background.
export type TextShape = { kind: "text"; text: string; points: number[]; size: number; fill?: string; fill2?: string; stroke?: string; width?: number; alpha?: number; glow?: number };

// STILL THINGS ARE SYMBOLS (Arthur): a piece that keeps the same look from picture to picture and only moves
// (a droplet, a bulb, a spike) is a named made symbol (symbolMaker.ts placedSymbol: "Light bulb", "Water
// droplet", "Spike"), placed here: its box's CENTER at (x, y) in stage px, `scale` x its made size, turned
// `rotation` degrees clockwise. `color`/`color2` = its colors (default: the symbol's own). The app makes it one
// Library symbol placed once per picture; draw.ts draws its shapes (so the frame viewer and tests see it).
// `flipX`: mirrored left-right in its own box (before the turn), like a flipped Library placement.
export type SymbolShape = { kind: "symbol"; name: string; x: number; y: number; scale?: number; rotation?: number; flipX?: boolean; alpha?: number; color?: string; color2?: string };

// Where an effect comes from or goes to: a fixed stage point, or a joint of a character (it follows the
// hand/foot/head as the figure moves), with an offset in stage px.
// `onHead` (laser eyes): a spot ON THE FACE instead of the joint — `forward` x head radius toward where the face
// points and `up` x head radius up the head, turning with the head and flipping with the facing (then dx, dy).
export type Anchor = Point | { character: string; joint: JointName; dx?: number; dy?: number; onHead?: { forward: number; up: number } } | ObjectAnchor;
// ON THE THROWN THING (Arthur, 2026-10-07: "the effects are supposed to be WITH the purple ball when he throws it"): an
// effect anchored to an OBJECT follows it every picture (a glow round an energy ball, in the hand and in flight);
// `landing: true` = a burst WHERE AND WHEN it lands or hits: the effect starts at that moment (keeping its length) at
// that spot (index.ts objectLanding).
export type ObjectAnchor = { object: string; dx?: number; dy?: number; landing?: boolean };

// The knobs every effect understands (each recipe uses the ones that make sense for it).
export type EffectParams = {
  color?: string; // main color (fire core, water, bolt)
  color2?: string; // second color (fire tips, foam, glow)
  size?: number; // x the figure's height (default per recipe)
  speed?: number; // 1 = normal
  direction?: number; // degrees: 0 = right, 90 = down, -90 = up, 180 = left
  intensity?: number; // 0..1+ how strong
  turbulence?: number; // 0..1 how wild
  spread?: number; // degrees of the cone / how wide it spreads
  seed?: number;
  [knob: string]: unknown;
};

// One effect on the timeline: from `start` to `end` (scene seconds), at `anchor` (and toward `target`).
// `layer`: drawn behind the figures ("back") or in front ("front", the default) — both under the heads in the app,
// whose head symbols sit on top of each picture — or "top": OVER THE HEADS (laser beams coming out of the eyes), on
// its own layer just above the AI layer in the app ("AI: <title> lasers"; only a scene that has one).
// `behind`: times (seconds, [from, to]) when the effect is drawn behind the figures although its layer is "front" — a
// held sword on the far side of a turn (BEHIND THE BODY ON THE FAR SIDE).
export type EffectTrack = { kind: string; start: number; end: number; anchor: Anchor; target?: Anchor; params?: EffectParams; layer?: "back" | "front" | "top"; fit?: EffectFit; behind?: [number, number][] };
// ON THE PAGE (explosions, 2026-10-06): an effect at a FIXED spot far from everyone (a grenade exploding far away) can
// say how much room it takes, so the page fit and the centering count it like a figure: from `left` to `right` (x the
// figure height, + = right of its anchor) and from `top` (x height, above its anchor) down to the ground.
// Only effects that say so; every other effect is drawn where it is, exactly as before (stageFit.ts effectFitBounds).
export type EffectFit = { left: number; right: number; top: number };

// What a recipe is told at one picture.
export type EffectContext = {
  t: number; // seconds since the effect started
  duration: number; // its whole length (end - start)
  fps: number;
  at: Point; // the anchor's stage position now
  target?: Point; // the target's stage position now
  height: number; // figure height in px (sizes are x this)
  groundY: number;
  stageWidth: number;
  facing?: "left" | "right" | "front"; // the way the anchor's character faces (an anchor on a figure only)
};

export type EffectRecipe = {
  id: string;
  about: string; // one line for the AI lessons
  staysWhenGone?: boolean; // its figure left the pictures (moves/transform.ts): it stays where it last saw it
  draw: (ctx: EffectContext, params: EffectParams) => Shape[];
};

// A BACKGROUND (its own layer, behind everything): simple pieces and their moving parts.
export type BackgroundPiece = { kind: string; params?: EffectParams & { x?: number; y?: number; w?: number; h?: number; count?: number } };
export type BackgroundSpec = { pieces: BackgroundPiece[]; seed?: number };
export type BackgroundRecipe = {
  id: string;
  about: string;
  // `t` = scene seconds (moving parts drift with it).
  draw: (piece: BackgroundPiece, t: number, stage: { width: number; groundY: number; height: number }) => Shape[];
};

// Per picture: shapes behind the figures (background + "back" effects) and in front.
// `top` (only when a "top" track draws): over everything, heads included.
export type EffectFrame = { background: Shape[]; back: Shape[]; front: Shape[]; top?: Shape[] };
