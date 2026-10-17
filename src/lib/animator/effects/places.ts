// BACKGROUNDS MADE FROM THE WORDS (Arthur, Oct 16: "when a story says a place, the background must clearly read as that place").
// Before this, a place word drew NOTHING by itself (17 of 20 place stories on the Oct 16 sheet were a blank white page) and there
// was no wall, floor, building, ring or window piece at all, so a kitchen, a classroom, a gym or a boxing ring could never be made.
// The `place` background piece builds a WHOLE place from its words ("a kitchen", "a street at night", "a city rooftop"):
//   - THE PLACE BOOK below: each place is outdoors (sky + far scenery + its ground) or indoors (a back wall + its floor), with a
//     few things that belong there (drawn from the everyday-things picture book, or the wall things here: windows, boards...).
//   - ONE LOOK RULE for every place, never per test word:
//     * the ground / floor top is the ground line, so every floor thing STANDS ON IT (bottom on the line — nothing floats), and
//       wall things HANG on the back wall above head height;
//     * things go to the two SIDES of the page (the middle is the figures' stage); it is all one background layer, drawn BEHIND
//       the figures, so nothing ever covers them;
//     * THE TIME OF DAY LIGHTS EVERYTHING: night = a dark sky with stars and a moon, the ground and every thing darkened and
//       cooled, lamps and windows glowing; sunset = warm; an indoor room at night keeps its lamps on (a little dimmer) and its
//       windows show the night;
//     * colors are calm and darker toward the floor's front, so dark stick figures always read on top.
//   - The place is STILL (drawn at t = 0): it never jumps; weather and wind pieces (rain, wind trees) can be added on top.
// A word that names no place in the book draws nothing (never a random wrong place).
import { EVERYDAY } from "./everydayThings.ts";
import { mixColor, rand } from "./random.ts";
import type { Shape } from "./types.ts";

type Stage = { width: number; groundY: number; height: number };
type Params = Record<string, unknown>;
type Draw = (p: Params, t: number, s: Stage) => Shape[];
export type BaseRecipes = { sky: Draw; sun: Draw; clouds: Draw; hills: Draw; trees: Draw; grass: Draw };

export type Time = "day" | "sunset" | "night";
type Thing = { id: string; side: -1 | 1; at?: number; size?: number; wall?: boolean; color?: string };
type Floor = { color: string; style?: "plain" | "boards" | "tiles" | "road" | "court" | "lines"; line?: string };
export type Place = {
  id: string; words: RegExp; indoor: boolean; floor: Floor;
  wall?: string;                           // indoors: the back wall's color
  far?: "hills" | "city" | "cityLow" | "sea" | "lake" | "trees" | "forest" | "dunes" | "snowHills" | "fields" | "fence" | "chainFence" | "crowd";
  time?: Time; things: Thing[];
};

const T = (id: string, side: -1 | 1, at?: number, extra: Partial<Thing> = {}): Thing => ({ id, side, at, ...extra });
const GRASS: Floor = { color: "#5cb85c" };

// THE PLACE BOOK (most specific first; the first whose words match wins). `at` = how far out to the side (0 = page middle,
// 1 = page edge; default 0.72); `wall` = hangs on the back wall.
export const PLACES: Place[] = [
  { id: "boxingRing", words: /\b(boxing|wrestling|fighting|mma|title) ?(ring|match|arena)|\b(in|into|inside|around) the ring\b|\barena\b|\bcage fight/i, indoor: true, wall: "#2b2d3a", floor: { color: "#dfe7ef", style: "plain" }, far: "crowd",
    things: [T("ringPost", -1, 0.62), T("ringPost", 1, 0.62), T("spotlight", -1, 0.4, { wall: true }), T("spotlight", 1, 0.4, { wall: true })] },
  { id: "rooftop", words: /\broof ?tops?\b|\bon (the |a )?roof\b|\bskyscraper roof/i, indoor: false, floor: { color: "#8a8378", style: "lines", line: "#6f695f" }, far: "cityLow", time: "night",
    things: [T("vent", -1, 0.78), T("antenna", 1, 0.8), T("waterTank", 1, 0.55)] },
  { id: "basketballCourt", words: /\b(basketball|tennis|volleyball|outdoor) court|shoot(s|ing)? hoops|\bbasketball game/i, indoor: false, floor: { color: "#c8763c", style: "court", line: "#f4efe6" }, far: "chainFence",
    things: [T("basketballHoop", -1, 0.76), T("basketballHoop", 1, 0.76)] },
  { id: "gym", words: /\bgym(nasium)?\b|\bfitness\b|\bweight ?room|lift(s|ing)? weights|\bworkout room/i, indoor: true, wall: "#c9d3dc", floor: { color: "#3d4148", style: "tiles", line: "#30343a" },
    things: [T("mirror", -1, 0.45, { wall: true }), T("weightRack", -1, 0.75), T("weightBench", 1, 0.72), T("clock", 1, 0.5, { wall: true }), T("punchingBag", 1, 0.92)] },
  { id: "classroom", words: /\bclass ?rooms?\b|\bschool\b|\blesson\b|\bteacher\b/i, indoor: true, wall: "#e6e2c8", floor: { color: "#b98d5a", style: "boards", line: "#9a7146" },
    things: [T("chalkboard", -1, 0, { wall: true }), T("clock", 1, 0.62, { wall: true }), T("desk", -1, 0.8), T("desk", 1, 0.8), T("poster", -1, 0.72, { wall: true })] },
  { id: "kitchen", words: /\bkitchens?\b|\bcook(s|ing)?\b|\bbak(e|es|ing)\b/i, indoor: true, wall: "#f1e6c8", floor: { color: "#d9d4cc", style: "tiles", line: "#b9b2a8" },
    things: [T("cabinets", -1, 0.62, { wall: true }), T("counter", -1, 0.8), T("stove", -1, 0.5), T("fridge", 1, 0.86), T("window", 1, 0.5, { wall: true }), T("table", 1, 0.62)] },
  { id: "office", words: /\boffices?\b|\bcubicle|\bat (his|her|their|the|a) desk|\bworkplace\b/i, indoor: true, wall: "#dfe3e8", floor: { color: "#7d8a99", style: "plain" },
    things: [T("window", -1, 0.55, { wall: true }), T("clock", 1, 0.45, { wall: true }), T("desk", 1, 0.72), T("chair", 1, 0.52), T("plant", -1, 0.86), T("bookshelf", -1, 0.62)] },
  { id: "bedroom", words: /\bbed ?rooms?\b|\bwakes? up\b|\bgo(es)? to (bed|sleep)\b/i, indoor: true, wall: "#c9dcef", floor: { color: "#a77b52", style: "boards", line: "#8a6240" },
    things: [T("bed", -1, 0.66), T("window", 1, 0.55, { wall: true }), T("poster", -1, 0.55, { wall: true }), T("lamp", 1, 0.82)] },
  { id: "livingRoom", words: /\bliving ?rooms?\b|\blounge\b|\binside (the|a|his|her|their) house\b|\bat home\b|\bindoors\b|\bfamily room/i, indoor: true, wall: "#ecdcc0", floor: { color: "#a77b52", style: "boards", line: "#8a6240" },
    things: [T("couch", -1, 0.66), T("tv", 1, 0.74), T("window", -1, 0.3, { wall: true }), T("picture", 1, 0.42, { wall: true }), T("lamp", -1, 0.92)] },
  { id: "library", words: /\blibrar(y|ies)\b|\bbookstore\b/i, indoor: true, wall: "#e7dcc6", floor: { color: "#8c5a3a", style: "boards", line: "#734a30" },
    things: [T("bookshelf", -1, 0.8), T("bookshelf", -1, 0.55), T("bookshelf", 1, 0.8), T("table", 1, 0.5)] },
  { id: "restaurant", words: /\brestaurant|\bcaf(e|é)\b|\bdiner\b|\bcoffee shop/i, indoor: true, wall: "#e9d2b4", floor: { color: "#8f3b2e", style: "tiles", line: "#76301f" },
    things: [T("window", 1, 0.5, { wall: true }), T("picture", -1, 0.5, { wall: true }), T("table", -1, 0.75), T("chair", -1, 0.92), T("table", 1, 0.75), T("chair", 1, 0.58)] },
  { id: "playground", words: /\bplay ?grounds?\b|\b(on|down|up) the slide\b|\bon the swings?\b|\bswing ?set\b|\bsee-?saw/i, indoor: false, floor: { color: "#6cbf5a" }, far: "trees",
    things: [T("slide", -1, 0.74), T("swings", 1, 0.74)] },
  { id: "campsite", words: /\bcamp ?(site|ground|fire)s?\b|\bcamping\b|\bbonfire|\btent\b/i, indoor: false, floor: { color: "#5f8a45" }, far: "forest", time: "night",
    things: [T("tent", -1, 0.7), T("campfire", 1, 0.45, { size: 1.6 }), T("tree", 1, 0.9)] },
  { id: "beach", words: /\bbeach(es)?\b|\bseaside\b|\bshore\b|\bcoast\b|\bocean\b|\bsea\b|\bsurf(ing|er)?\b/i, indoor: false, floor: { color: "#ead08f" }, far: "sea",
    things: [T("umbrella", -1, 0.74, { size: 1.0 }), T("palm", 1, 0.85)] },
  { id: "lake", words: /\blakes?\b|\bpond\b|\briver(side|bank)?\b|\bfish(es|ing)\b|\bdock\b/i, indoor: false, floor: GRASS, far: "lake",
    things: [T("tree", -1, 0.85), T("bush", 1, 0.8)] },
  { id: "desert", words: /\bdeserts?\b|\bsahara\b|\bdunes?\b|\bwasteland\b/i, indoor: false, floor: { color: "#e3c27e" }, far: "dunes",
    things: [T("cactus", -1, 0.78), T("cactus", 1, 0.66, { size: 0.7 }), T("rock", 1, 0.9)] },
  { id: "snow", words: /\bsnow(y|ball|man|fall)?\b|\bwinter\b|\bski(ing|ers?)?\b|\bmountains?\b|\barctic\b|\bigloo/i, indoor: false, floor: { color: "#f3f7fb" }, far: "snowHills",
    things: [T("pine", -1, 0.8), T("pine", 1, 0.86), T("snowman", 1, 0.6)] },
  { id: "forest", words: /\bforests?\b|\bwoods\b|\bjungle\b|\btrail\b|\bhik(e|es|er|ing)\b/i, indoor: false, floor: { color: "#4f8f3f" }, far: "forest",
    things: [T("tree", -1, 0.62), T("pine", -1, 0.9), T("tree", 1, 0.66), T("bush", 1, 0.9)] },
  { id: "farm", words: /\bfarms?\b|\bbarn(yard)?\b|\bfarmers?\b|\b(corn|wheat|hay|farm) ?fields?\b|\branch\b/i, indoor: false, floor: { color: "#7a9a45" }, far: "fields",
    things: [T("barn", -1, 0.78), T("fenceRun", 1, 0.7), T("tree", 1, 0.92)] },
  { id: "backyard", words: /\bback ?yards?\b|\bfront ?yards?\b|\byard\b|\bgarden\b|\blawn\b/i, indoor: false, floor: GRASS, far: "fence",
    things: [T("house", -1, 0.8), T("tree", 1, 0.82), T("bush", 1, 0.55)] },
  { id: "parkingLot", words: /\bparking (lot|garage)|\bcar park\b|\bgas station/i, indoor: false, floor: { color: "#5e5f63", style: "lines", line: "#e8e3c8" }, far: "city",
    things: [T("streetlamp", -1, 0.75), T("streetlamp", 1, 0.75)] },
  { id: "street", words: /\bstreets?\b|\bcity\b|\btown\b|\bdowntown\b|\bsidewalk\b|\balley\b|\broad\b|\bavenue\b|\bcrosswalk\b/i, indoor: false, floor: { color: "#6b6c70", style: "road", line: "#f1d25a" }, far: "city",
    things: [T("streetlamp", -1, 0.7), T("streetlamp", 1, 0.7), T("trashCan", 1, 0.9), T("hydrant", -1, 0.9)] },
  { id: "park", words: /\bparks?\b|\bmeadow\b|\bpicnic\b|\b(soccer|football|sports) field\b/i, indoor: false, floor: GRASS, far: "hills",
    things: [T("tree", -1, 0.82), T("bench", -1, 0.55), T("tree", 1, 0.88), T("trashCan", 1, 0.62)] },
];

const GLOWS = /^(campfire|lantern|candle)$/;
const NIGHT = /\bnight|midnight|\bevening\b|\bdusk\b|\bdark\b|moon ?light|\bstarry\b/i;
const SUNSET = /\bsun ?set|\bsun ?rise|\bdawn\b|\bgolden hour\b|\btwilight\b/i;
const DAY = /\bmorning|\bnoon\b|\bafternoon|\bday ?time|\bsunny\b|\bdaylight\b/i;

// The place a sentence names (the first in the book that matches), or null.
// THE PLACE WITH THE MOST MATCHING WORDS WINS (Oct 17 R1b — "a frozen snowy lake shore" was drawn as a sunny BEACH: the first place
// in the list matching any word won, and "shore" came first). Ties keep the list order. Frozen / icy / ice = a snowy place.
const FROZEN = /\bfrozen\b|\bicy\b|\bice\b/gi;
export function placeOf(words: unknown): Place | null {
  const w = String(words ?? ""), id = w.replace(/[^a-z]/gi, "").toLowerCase();
  const exact = PLACES.find((p) => p.id.toLowerCase() === id);
  if (exact) return exact;
  let best: Place | null = null, most = 0;
  for (const p of PLACES) {
    const n = (w.match(new RegExp(p.words.source, "gi")) ?? []).length + (p.id === "snow" ? 2 * (w.match(FROZEN) ?? []).length : 0);
    if (n > most) { best = p; most = n; }
  }
  return best;
}
// The time the words say (or the place's own usual time, or day).
export function timeOf(words: unknown, place?: Place | null): Time {
  const w = String(words ?? "");
  return NIGHT.test(w) ? "night" : SUNSET.test(w) ? "sunset" : DAY.test(w) ? "day" : place?.time ?? "day";
}

// ------------------------------------------------------------------ drawing helpers
const NIGHT_TINT = "#0f1a33";
const rect = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Extract<Shape, { kind: "rect" }>> = {}): Shape => ({ kind: "rect", x, y, w, h, fill, ...extra });
const poly = (points: number[], fill: string, stroke?: string, width?: number): Shape => ({ kind: "poly", points, fill, ...(stroke ? { stroke, width: width ?? 3 } : {}) });
const line = (points: number[], stroke: string, width: number, alpha?: number): Shape => ({ kind: "line", points, stroke, width, ...(alpha !== undefined ? { alpha } : {}) });
const circle = (x: number, y: number, r: number, fill: string, alpha?: number): Shape => ({ kind: "circle", x, y, r, fill, ...(alpha !== undefined ? { alpha } : {}) });

// The everyday thing's PARTS (its height = 1, middle at 0,0) as shapes standing with the bottom on `baseY` at x.
function everyday(id: string, x: number, baseY: number, H: number, size?: number, flip = false): Shape[] {
  const thing = EVERYDAY.find((e) => e.id === id);
  if (!thing) return [];
  const S = (size ?? thing.size) * H, out: Shape[] = [];
  // (the parts' lowest point sits ON the ground: never floating, never sunk)
  const lowest = Math.max(...thing.parts.map((p) => (p.shape === "line" ? Math.max(p.y, p.y + p.h) : p.y + (p.shape === "circle" ? p.w : p.h) / 2)));
  const cy = baseY - lowest * S, outline = "#333333", width = Math.max(2.5, 0.022 * S);
  for (const p of thing.parts) {
    const m = flip ? -1 : 1, px = x + m * p.x * S, py = cy + p.y * S, w = Math.abs(p.w) * S, h = Math.abs(p.h) * S;
    if (p.shape === "line") { out.push(line([px, py, px + m * p.w * S, py + p.h * S], p.color, Math.max(width, 0.03 * S))); continue; }
    const pts: number[] = [];
    if (p.shape === "circle" || p.shape === "ellipse") {
      const rx = w / 2, ry = p.shape === "circle" ? w / 2 : h / 2;
      for (let i = 0; i < 20; i += 1) pts.push(px + rx * Math.cos((i / 20) * 2 * Math.PI), py + ry * Math.sin((i / 20) * 2 * Math.PI));
    } else if (p.shape === "triangle") pts.push(px, py - h / 2, px + w / 2, py + h / 2, px - w / 2, py + h / 2);
    else {
      const r = p.shape === "round" ? Math.min(w, h) * 0.3 : 0;
      for (const [qx, qy, a0] of [[px + w / 2 - r, py - h / 2 + r, -90], [px + w / 2 - r, py + h / 2 - r, 0], [px - w / 2 + r, py + h / 2 - r, 90], [px - w / 2 + r, py - h / 2 + r, 180]])
        for (let i = 0; i < (r > 0 ? 4 : 1); i += 1) { const u = ((a0 + (90 * i) / 3) * Math.PI) / 180; pts.push(qx + r * Math.cos(u), qy + r * Math.sin(u)); }
    }
    out.push(poly(pts, p.color, outline, width));
  }
  return out;
}

// Things drawn here (not in the everyday book): scenery-sized or wall-hung. `x` = middle, `g` = ground line (floor things stand
// on it), `H` = the figure's height, `wallTop`: where a wall thing's TOP goes (wall things hang above head height).
function sceneryThing(id: string, x: number, g: number, H: number, time: Time, seed: number, size = 1): { shapes: Shape[]; lit: Shape[] } {
  const night = time === "night", lit: Shape[] = [], S = H * size;
  const head = g - 1.12 * H; // above the figures' heads
  switch (id) {
    case "tree": case "pine": {
      const h = 1.7 * S, trunk = "#6e4424", leaves = id === "pine" ? "#2f7a3e" : "#3f9b4a";
      if (id === "pine") return { shapes: [rect(x - 0.05 * S, g - 0.3 * h, 0.1 * S, 0.3 * h, trunk), poly([x, g - h, x + 0.36 * S, g - 0.5 * h, x + 0.2 * S, g - 0.5 * h, x + 0.45 * S, g - 0.22 * h, x - 0.45 * S, g - 0.22 * h, x - 0.2 * S, g - 0.5 * h, x - 0.36 * S, g - 0.5 * h], leaves, "#1f5a2c", 3)], lit };
      return { shapes: [rect(x - 0.06 * S, g - 0.5 * h, 0.12 * S, 0.5 * h, trunk), circle(x, g - 0.72 * h, 0.36 * S, leaves), circle(x - 0.24 * S, g - 0.6 * h, 0.26 * S, mixColor(leaves, "#000000", 0.08)), circle(x + 0.25 * S, g - 0.62 * h, 0.27 * S, mixColor(leaves, "#ffffff", 0.06))], lit };
    }
    case "palm": {
      const h = 1.9 * S, pts = [x, g, x - 0.05 * S, g, x + 0.12 * S, g - h, x + 0.2 * S, g - h];
      const fronds = [-150, -115, -70, -30, 10].map((a) => { const r = (a * Math.PI) / 180, ex = x + 0.16 * S + Math.cos(r) * 0.6 * S, ey = g - h + Math.sin(r) * 0.25 * S + 0.18 * S; return line([x + 0.16 * S, g - h, (x + 0.16 * S + ex) / 2, g - h - 0.12 * S, ex, ey], "#2f8a3e", 0.09 * S); });
      return { shapes: [poly(pts, "#9a6a3a", "#6e4424", 3), ...fronds], lit };
    }
    case "bush": return { shapes: [circle(x - 0.18 * S, g - 0.12 * S, 0.2 * S, "#3f8f45"), circle(x + 0.15 * S, g - 0.12 * S, 0.22 * S, "#4a9e4f"), circle(x, g - 0.24 * S, 0.22 * S, "#52a857"), rect(x - 0.4 * S, g - 0.12 * S, 0.8 * S, 0.12 * S, "#3f8f45")], lit };
    case "cactus": {
      const c = "#4f9a4a", d = "#2f6a2e";
      return { shapes: [rect(x - 0.07 * S, g - 0.9 * S, 0.14 * S, 0.9 * S, c, { stroke: d, width: 3 }), rect(x - 0.25 * S, g - 0.62 * S, 0.1 * S, 0.3 * S, c, { stroke: d, width: 3 }), rect(x - 0.25 * S, g - 0.38 * S, 0.2 * S, 0.08 * S, c), rect(x + 0.15 * S, g - 0.75 * S, 0.1 * S, 0.3 * S, c, { stroke: d, width: 3 }), rect(x + 0.05 * S, g - 0.5 * S, 0.2 * S, 0.08 * S, c)], lit };
    }
    case "rock": return { shapes: [poly([x - 0.3 * S, g, x - 0.22 * S, g - 0.16 * S, x - 0.02 * S, g - 0.24 * S, x + 0.2 * S, g - 0.17 * S, x + 0.3 * S, g], "#9b8a72", "#6e604e", 3)], lit };
    case "snowman": return { shapes: [circle(x, g - 0.2 * S, 0.2 * S, "#ffffff"), circle(x, g - 0.5 * S, 0.14 * S, "#ffffff"), circle(x, g - 0.72 * S, 0.1 * S, "#ffffff"), poly([x, g - 0.72 * S, x + 0.14 * S, g - 0.7 * S, x, g - 0.68 * S], "#f08a24"), circle(x - 0.03 * S, g - 0.76 * S, 0.012 * S, "#222222"), circle(x + 0.04 * S, g - 0.76 * S, 0.012 * S, "#222222")], lit };
    case "streetlamp": {
      const h = 1.55 * S, out = [rect(x - 0.025 * S, g - h, 0.05 * S, h, "#3b3f46"), rect(x - 0.06 * S, g - 0.04 * S, 0.12 * S, 0.04 * S, "#3b3f46"), rect(x - 0.025 * S, g - h, 0.22 * S, 0.035 * S, "#3b3f46")];
      const lx = x + 0.17 * S, ly = g - h + 0.06 * S;
      out.push(poly([lx - 0.07 * S, ly - 0.025 * S, lx + 0.07 * S, ly - 0.025 * S, lx + 0.045 * S, ly + 0.03 * S, lx - 0.045 * S, ly + 0.03 * S], "#2c3036"));
      lit.push(circle(lx, ly + 0.035 * S, 0.035 * S, night ? "#fff1b0" : "#e8e4d0"));
      // (at night the lamp lights a soft cone and a pool of light on the ground below it)
      if (night) lit.push(poly([lx - 0.045 * S, ly + 0.03 * S, lx + 0.045 * S, ly + 0.03 * S, lx + 0.32 * S, g, lx - 0.32 * S, g], "#ffe9a0", undefined), { kind: "rect", x: lx - 0.42 * S, y: g, w: 0.84 * S, h: 0.06 * S, fill: "#ffe9a0", alpha: 0.25 });
      if (night) (lit[lit.length - 2] as { alpha?: number }).alpha = 0.16;
      return { shapes: out, lit };
    }
    case "hydrant": return { shapes: [rect(x - 0.06 * S, g - 0.24 * S, 0.12 * S, 0.24 * S, "#c8352b", { stroke: "#7a1f18", width: 3 }), circle(x, g - 0.25 * S, 0.07 * S, "#c8352b"), rect(x - 0.1 * S, g - 0.18 * S, 0.2 * S, 0.05 * S, "#a82a22")], lit };
    case "vent": return { shapes: [rect(x - 0.3 * S, g - 0.4 * S, 0.6 * S, 0.4 * S, "#9aa1a8", { stroke: "#5d636a", width: 3 }), ...[0, 1, 2, 3].map((k) => line([x - 0.22 * S, g - (0.32 - 0.08 * k) * S, x + 0.22 * S, g - (0.32 - 0.08 * k) * S], "#6d737a", 3))], lit };
    case "antenna": return { shapes: [line([x, g, x, g - 1.3 * S], "#4a4e55", 5), line([x - 0.2 * S, g - 1.1 * S, x + 0.2 * S, g - 1.1 * S], "#4a4e55", 4), line([x - 0.13 * S, g - 0.9 * S, x + 0.13 * S, g - 0.9 * S], "#4a4e55", 4)], lit: night ? [circle(x, g - 1.32 * S, 0.025 * S, "#ff3b30")] : [] };
    case "waterTank": return { shapes: [line([x - 0.22 * S, g, x - 0.18 * S, g - 0.45 * S], "#5d4630", 6), line([x + 0.22 * S, g, x + 0.18 * S, g - 0.45 * S], "#5d4630", 6), rect(x - 0.28 * S, g - 0.95 * S, 0.56 * S, 0.5 * S, "#8a5a36", { stroke: "#5d3a22", width: 3 }), poly([x - 0.32 * S, g - 0.95 * S, x, g - 1.15 * S, x + 0.32 * S, g - 0.95 * S], "#6e4424")], lit };
    case "slide": return { shapes: [line([x - 0.45 * S, g, x - 0.45 * S, g - 0.85 * S], "#555555", 6), line([x - 0.25 * S, g, x - 0.25 * S, g - 0.85 * S], "#555555", 6), ...[0.2, 0.4, 0.6].map((k) => line([x - 0.45 * S, g - k * S, x - 0.25 * S, g - k * S], "#777777", 4)), rect(x - 0.48 * S, g - 0.88 * S, 0.26 * S, 0.05 * S, "#e4572e"), poly([x - 0.25 * S, g - 0.88 * S, x - 0.2 * S, g - 0.86 * S, x + 0.55 * S, g - 0.04 * S, x + 0.5 * S, g], "#f6c945", "#b8902a", 3)], lit };
    case "swings": return { shapes: [line([x - 0.55 * S, g, x - 0.45 * S, g - 1.0 * S, x + 0.45 * S, g - 1.0 * S, x + 0.55 * S, g], "#2f5fb3", 7), line([x - 0.2 * S, g - 1.0 * S, x - 0.2 * S, g - 0.3 * S], "#555555", 2), line([x - 0.02 * S, g - 1.0 * S, x - 0.02 * S, g - 0.3 * S], "#555555", 2), rect(x - 0.24 * S, g - 0.3 * S, 0.26 * S, 0.04 * S, "#e4572e"), line([x + 0.15 * S, g - 1.0 * S, x + 0.15 * S, g - 0.36 * S], "#555555", 2), line([x + 0.33 * S, g - 1.0 * S, x + 0.33 * S, g - 0.36 * S], "#555555", 2), rect(x + 0.11 * S, g - 0.36 * S, 0.26 * S, 0.04 * S, "#e4572e")], lit };
    case "barn": {
      const w = 1.3 * S, h = 0.8 * S;
      return { shapes: [rect(x - w / 2, g - h, w, h, "#b23a2e", { stroke: "#6e1f17", width: 3 }), poly([x - w / 2 - 0.05 * S, g - h, x, g - h - 0.45 * S, x + w / 2 + 0.05 * S, g - h], "#7a2a22", "#4d1712", 3), rect(x - 0.22 * S, g - 0.5 * S, 0.44 * S, 0.5 * S, "#f2ead8"), line([x - 0.22 * S, g - 0.5 * S, x + 0.22 * S, g, x + 0.22 * S, g - 0.5 * S, x - 0.22 * S, g], "#b23a2e", 5)], lit: night ? [] : [] };
    }
    case "fenceRun": {
      const out: Shape[] = [], w = 1.0 * S;
      out.push(rect(x - w / 2, g - 0.36 * S, w, 0.05 * S, "#e6d3b0", { stroke: "#9a8460", width: 2 }), rect(x - w / 2, g - 0.18 * S, w, 0.05 * S, "#e6d3b0", { stroke: "#9a8460", width: 2 }));
      for (let k = 0; k <= 4; k += 1) out.push(rect(x - w / 2 + (k / 4) * w - 0.03 * S, g - 0.45 * S, 0.06 * S, 0.45 * S, "#d9c39a", { stroke: "#9a8460", width: 2 }));
      return { shapes: out, lit };
    }
    case "ringPost": {
      // a corner post with its pad; the three ropes run from it along the BACK of the ring (behind the fighters)
      const h = 0.62 * H, out: Shape[] = [rect(x - 0.035 * H, g - h, 0.07 * H, h, "#c9ccd2", { stroke: "#5c6068", width: 3 }), rect(x - 0.05 * H, g - h + 0.08 * H, 0.1 * H, 0.42 * H, "#c0392b")];
      return { shapes: out, lit };
    }
    case "punchingBag": {
      const top = head - 0.35 * H;
      return { shapes: [line([x, -2000, x, top + 0.02 * H], "#444444", 4), ...everyday("punchingBag", x, top + 0.75 * H, H)], lit };
    }
    case "weightRack": {
      const out: Shape[] = [rect(x - 0.32 * S, g - 0.55 * S, 0.64 * S, 0.05 * S, "#3b3f46"), line([x - 0.3 * S, g, x - 0.3 * S, g - 0.55 * S], "#3b3f46", 6), line([x + 0.3 * S, g, x + 0.3 * S, g - 0.55 * S], "#3b3f46", 6), rect(x - 0.32 * S, g - 0.25 * S, 0.64 * S, 0.05 * S, "#3b3f46")];
      for (const [yy, n] of [[0.6, 4], [0.3, 3]] as const) for (let k = 0; k < n; k += 1) { const dx = x - 0.24 * S + (k / Math.max(1, n - 1)) * 0.48 * S; out.push(rect(dx - 0.05 * S, g - yy * S - 0.04 * S, 0.1 * S, 0.04 * S, "#222222"), circle(dx - 0.05 * S, g - yy * S - 0.02 * S, 0.035 * S, "#111111"), circle(dx + 0.05 * S, g - yy * S - 0.02 * S, 0.035 * S, "#111111")); }
      return { shapes: out, lit };
    }
    case "weightBench": return { shapes: [rect(x - 0.4 * S, g - 0.24 * S, 0.8 * S, 0.07 * S, "#c0392b", { stroke: "#6e1f17", width: 3 }), line([x - 0.3 * S, g - 0.18 * S, x - 0.3 * S, g], "#3b3f46", 6), line([x + 0.3 * S, g - 0.18 * S, x + 0.3 * S, g], "#3b3f46", 6), line([x - 0.42 * S, g - 0.22 * S, x - 0.42 * S, g - 0.62 * S], "#3b3f46", 5), line([x - 0.75 * S, g - 0.62 * S, x - 0.1 * S, g - 0.62 * S], "#8a8f96", 5), circle(x - 0.75 * S, g - 0.62 * S, 0.11 * S, "#111111"), circle(x - 0.1 * S, g - 0.62 * S, 0.11 * S, "#111111")], lit };
    case "counter": {
      const w = 1.1 * S, h = 0.36 * H;
      return { shapes: [rect(x - w / 2, g - h, w, h, "#8b5a2b", { stroke: "#5d3a1c", width: 3 }), rect(x - w / 2 - 0.02 * H, g - h - 0.03 * H, w + 0.04 * H, 0.035 * H, "#d8d2c4", { stroke: "#8e887c", width: 2 }), ...[-0.25, 0.25].map((k) => rect(x + k * w - 0.2 * w, g - h + 0.05 * H, 0.4 * w, h - 0.08 * H, "#9c6a38", { stroke: "#5d3a1c", width: 2 }))], lit };
    }
    case "fridge": {
      const w = 0.32 * H, h = 0.68 * H;
      return { shapes: [rect(x - w / 2, g - h, w, h, "#eef1f4", { stroke: "#8c939b", width: 3 }), line([x - w / 2, g - 0.62 * h, x + w / 2, g - 0.62 * h], "#8c939b", 3), line([x - w / 2 + 0.03 * H, g - 0.9 * h, x - w / 2 + 0.03 * H, g - 0.72 * h], "#8c939b", 4), line([x - w / 2 + 0.03 * H, g - 0.55 * h, x - w / 2 + 0.03 * H, g - 0.35 * h], "#8c939b", 4)], lit };
    }
    case "cabinets": {
      const w = 0.95 * H, h = 0.24 * H, y = head - 0.32 * H;
      return { shapes: [rect(x - w / 2, y, w, h, "#9c6a38", { stroke: "#5d3a1c", width: 3 }), line([x, y, x, y + h], "#5d3a1c", 3), circle(x - 0.04 * H, y + h * 0.7, 0.012 * H, "#d9c39a"), circle(x + 0.04 * H, y + h * 0.7, 0.012 * H, "#d9c39a")], lit };
    }
    case "bookshelf": {
      const w = 0.5 * H, h = 0.75 * H, out: Shape[] = [rect(x - w / 2, g - h, w, h, "#7a4b2a", { stroke: "#4d2e18", width: 3 })];
      for (let r = 0; r < 4; r += 1) {
        const y0 = g - h + 0.04 * H + r * (h - 0.06 * H) / 4, sh = (h - 0.06 * H) / 4 - 0.025 * H;
        out.push(rect(x - w / 2 + 0.025 * H, y0, w - 0.05 * H, sh, "#4d2e18"));
        let bx = x - w / 2 + 0.03 * H;
        for (let b = 0; bx < x + w / 2 - 0.06 * H; b += 1) { const bw = (0.03 + 0.02 * rand(seed, r * 9 + b, 1)) * H, bh = sh * (0.7 + 0.28 * rand(seed, r * 9 + b, 2)); out.push(rect(bx, y0 + sh - bh, bw, bh, ["#c0392b", "#2f5fb3", "#3f9b45", "#f6c945", "#8e44ad"][Math.floor(rand(seed, r * 9 + b, 3) * 5)])); bx += bw + 0.006 * H; }
      }
      return { shapes: out, lit };
    }
    case "plant": return { shapes: [poly([x - 0.08 * S, g - 0.2 * S, x + 0.08 * S, g - 0.2 * S, x + 0.06 * S, g, x - 0.06 * S, g], "#b5653a", "#7a4022", 3), circle(x, g - 0.32 * S, 0.12 * S, "#3f9b45"), circle(x - 0.08 * S, g - 0.26 * S, 0.08 * S, "#4aa850"), circle(x + 0.08 * S, g - 0.27 * S, 0.08 * S, "#36883c")], lit };
    case "lamp": {
      const h = 0.62 * S, out: Shape[] = [rect(x - 0.08 * S, g - 0.03 * S, 0.16 * S, 0.03 * S, "#3a3a3a"), line([x, g, x, g - h], "#3a3a3a", 4), poly([x - 0.1 * S, g - h - 0.12 * S, x + 0.1 * S, g - h - 0.12 * S, x + 0.14 * S, g - h + 0.02 * S, x - 0.14 * S, g - h + 0.02 * S], "#f2e3b8", "#a8986a", 2)];
      return { shapes: out, lit: night ? [circle(x, g - h - 0.05 * S, 0.35 * S, "#ffe9a0", 0.22)] : [] };
    }
    case "bed": return { shapes: everyday("bed", x, g, H), lit };
    // ---- wall things (hang above head height)
    case "window": {
      const w = 0.6 * H, h = 0.45 * H, y = head - 0.48 * H, glass = night ? "#18234a" : time === "sunset" ? "#f2a66b" : "#a9d8f5";
      const out: Shape[] = [rect(x - w / 2 - 0.02 * H, y - 0.02 * H, w + 0.04 * H, h + 0.04 * H, "#f4f1ea", { stroke: "#9a958a", width: 3 }), rect(x - w / 2, y, w, h, glass, { fill2: night ? "#2b3a78" : mixColor(glass, "#ffffff", 0.4) })];
      if (night) out.push(circle(x + 0.15 * w, y + 0.28 * h, 0.06 * H, "#f4f1de"), circle(x - 0.25 * w, y + 0.2 * h, 0.006 * H, "#fffbe6"), circle(x - 0.05 * w, y + 0.5 * h, 0.005 * H, "#fffbe6"));
      else out.push(circle(x - 0.18 * w, y + 0.6 * h, 0.07 * H, "#ffffff", 0.8), circle(x - 0.08 * w, y + 0.56 * h, 0.06 * H, "#ffffff", 0.8));
      out.push(line([x, y, x, y + h], "#f4f1ea", 0.025 * H), line([x - w / 2, y + h / 2, x + w / 2, y + h / 2], "#f4f1ea", 0.025 * H), rect(x - w / 2 - 0.05 * H, y + h + 0.02 * H, w + 0.1 * H, 0.03 * H, "#e6e1d6", { stroke: "#9a958a", width: 2 }));
      return { shapes: [], lit: out }; // (a window shows the sky's own light: never darkened by the room)
    }
    case "chalkboard": {
      const w = 1.5 * H, h = 0.5 * H, y = head - 0.52 * H;
      return { shapes: [rect(x - w / 2 - 0.03 * H, y - 0.03 * H, w + 0.06 * H, h + 0.06 * H, "#8b5a2b"), rect(x - w / 2, y, w, h, "#2f4f3a"), line([x - 0.6 * H, y + 0.14 * H, x - 0.25 * H, y + 0.14 * H], "#e8efe9", 4, 0.8), line([x - 0.6 * H, y + 0.24 * H, x - 0.1 * H, y + 0.24 * H], "#e8efe9", 4, 0.8), line([x + 0.15 * H, y + 0.12 * H, x + 0.3 * H, y + 0.3 * H], "#e8efe9", 4, 0.8), line([x + 0.3 * H, y + 0.12 * H, x + 0.15 * H, y + 0.3 * H], "#e8efe9", 4, 0.8), rect(x - w / 2, y + h + 0.03 * H, w, 0.025 * H, "#7a4b2a")], lit };
    }
    case "clock": { const r = 0.09 * H, y = head - 0.3 * H; return { shapes: [circle(x, y, r, "#333333"), circle(x, y, r * 0.86, "#ffffff"), line([x, y, x, y - r * 0.6], "#222222", 4), line([x, y, x + r * 0.45, y + r * 0.1], "#222222", 4)], lit }; }
    case "poster": { const w = 0.28 * H, h = 0.38 * H, y = head - 0.42 * H; return { shapes: [rect(x - w / 2, y, w, h, "#f6c945", { stroke: "#8a7020", width: 2 }), circle(x, y + 0.14 * H, 0.07 * H, "#e4572e"), rect(x - 0.09 * H, y + 0.26 * H, 0.18 * H, 0.03 * H, "#2f5fb3")], lit }; }
    case "picture": { const w = 0.36 * H, h = 0.26 * H, y = head - 0.36 * H; return { shapes: [rect(x - w / 2, y, w, h, "#7a4b2a"), rect(x - w / 2 + 0.025 * H, y + 0.025 * H, w - 0.05 * H, h - 0.05 * H, "#a9d8f5", { fill2: "#d4eefc" }), poly([x - w / 2 + 0.025 * H, y + h - 0.025 * H, x - 0.04 * H, y + 0.1 * H, x + 0.05 * H, y + h - 0.025 * H], "#5f9e5a"), poly([x, y + h - 0.025 * H, x + 0.08 * H, y + 0.13 * H, x + w / 2 - 0.025 * H, y + h - 0.025 * H], "#79c26f")], lit }; }
    case "mirror": { const w = 0.7 * H, h = 0.7 * H, y = head - 0.25 * H; return { shapes: [rect(x - w / 2, y, w, h, "#cfe3ee", { fill2: "#eef6fa", stroke: "#8c939b", width: 4 }), line([x - 0.2 * w, y + 0.15 * h, x - 0.05 * w, y + 0.05 * h], "#ffffff", 5, 0.8)], lit }; }
    case "spotlight": { const y = head - 0.62 * H; return { shapes: [rect(x - 0.06 * H, y - 0.04 * H, 0.12 * H, 0.08 * H, "#3b3f46")], lit: [circle(x, y + 0.04 * H, 0.03 * H, "#fff6cf"), { ...poly([x - 0.03 * H, y + 0.05 * H, x + 0.03 * H, y + 0.05 * H, x + 0.45 * H * -Math.sign(x - 960) + 0.3 * H, g, x + 0.45 * H * -Math.sign(x - 960) - 0.3 * H, g], "#fff6cf"), alpha: 0.14 }] }; }
    default: return { shapes: [], lit };
  }
}

// THE FAR SCENERY behind the ground line (outdoors) or on the back wall (the crowd at a ring).
function farScenery(kind: Place["far"], s: Stage, time: Time, seed: number, base: BaseRecipes, x0: number, x1: number): { shapes: Shape[]; lit: Shape[] } {
  const g = s.groundY, H = s.height, out: Shape[] = [], lit: Shape[] = [], night = time === "night";
  switch (kind) {
    case "hills": return { shapes: base.hills({ seed, h: 1.1 * H }, 0, s), lit };
    case "snowHills": return { shapes: base.hills({ seed, h: 2.0 * H, color: "#dfe8f1", color2: "#f6f9fc", count: 2 }, 0, s), lit };
    case "dunes": return { shapes: base.hills({ seed, h: 0.7 * H, color: "#d9b46a", color2: "#ecd29a", count: 2 }, 0, s), lit };
    case "fields": {
      out.push(...base.hills({ seed, h: 0.7 * H, color: "#8fbf5a", color2: "#b8d98a", count: 2 }, 0, s));
      for (let k = 0; k < 6; k += 1) out.push(line([x0, g - 4 - k * 0.035 * H, x1, g - 4 - k * 0.035 * H], "#6f8f3a", 3, 0.5));
      return { shapes: out, lit };
    }
    case "trees": case "forest": {
      if (kind === "forest") out.push(...base.trees({ seed: seed + 3, count: 9, size: 1.9, w: x1 - x0, x: (x0 + x1) / 2, color: "#2f7a3e", shape: "mixed" }, 0, { ...s, groundY: g - 0.06 * H }));
      out.push(...base.trees({ seed, count: kind === "forest" ? 6 : 4, size: kind === "forest" ? 1.5 : 1.1, w: x1 - x0, x: (x0 + x1) / 2, color: "#4a9e4f" }, 0, { ...s, groundY: g - 0.02 * H }).map((sh) => ({ ...sh, alpha: 0.9 })));
      return { shapes: out, lit };
    }
    case "sea": case "lake": {
      const top = g - (kind === "sea" ? 0.42 : 0.3) * H, water = kind === "sea" ? "#2f8fd8" : "#3f9fd0";
      if (kind === "lake") out.push(...base.hills({ seed, h: 0.9 * H, y: top }, 0, s), ...base.trees({ seed: seed + 5, count: 10, size: 0.5, w: x1 - x0, x: (x0 + x1) / 2, color: "#3f8f45" }, 0, { ...s, groundY: top + 2 }));
      out.push(rect(x0, top, x1 - x0, g - top + 2, water, { fill2: mixColor(water, "#0b3a66", 0.35) }));
      for (let k = 0; k < 14; k += 1) { const lx = x0 + rand(seed, k, 1) * (x1 - x0), ly = top + (0.15 + 0.75 * rand(seed, k, 2)) * (g - top), lw = (0.08 + 0.12 * rand(seed, k, 3)) * H; out.push(line([lx, ly, lx + lw, ly], "#ffffff", 3, 0.35)); }
      out.push(line([x0, top + 1, x1, top + 1], mixColor(water, "#ffffff", 0.5), 3));
      return { shapes: out, lit };
    }
    case "city": case "cityLow": {
      // buildings of different heights and widths, each with rows of windows (lit windows at night)
      const low = kind === "cityLow", bottom = low ? g - 0.05 * H : g;
      let bx = x0, k = 0;
      while (bx < x1) {
        const w = (0.45 + 0.5 * rand(seed, k, 1)) * H, h = (low ? 0.6 + 1.3 * rand(seed, k, 2) : 1.2 + 1.6 * rand(seed, k, 2)) * H;
        const shade = ["#7d8696", "#8f97a5", "#6f7a8c", "#9aa0aa", "#a58f7d"][Math.floor(rand(seed, k, 3) * 5)];
        out.push(rect(bx, bottom - h, w - 6, h, shade, { stroke: mixColor(shade, "#000000", 0.3), width: 2 }));
        const cols = Math.max(2, Math.floor(w / (0.16 * H))), rows = Math.floor(h / (0.2 * H));
        for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
          const on = rand(seed, k * 97 + r * 13 + c, 4) < (night ? 0.3 : 0);
          const win = rect(bx + (c + 0.3) * ((w - 6) / cols), bottom - h + (r + 0.35) * (h / rows), 0.4 * ((w - 6) / cols), 0.4 * (h / rows), on ? "#ffd970" : night ? "#2a3550" : "#cfe6f5");
          (on ? lit : out).push(win);
        }
        bx += w; k += 1;
      }
      if (!low) out.push(rect(x0, g - 0.06 * H, x1 - x0, 0.06 * H, "#a9a9ad", { stroke: "#77777b", width: 2 })); // the sidewalk's back edge
      return { shapes: out, lit };
    }
    case "fence": case "chainFence": {
      const top = g - (kind === "fence" ? 0.45 : 0.75) * H;
      if (kind === "fence") {
        out.push(rect(x0, top + 0.1 * H, x1 - x0, 0.04 * H, "#d9c39a"), rect(x0, top + 0.3 * H, x1 - x0, 0.04 * H, "#d9c39a"));
        for (let x = x0; x < x1; x += 0.13 * H) out.push(poly([x, g, x, top + 0.04 * H, x + 0.045 * H, top, x + 0.09 * H, top + 0.04 * H, x + 0.09 * H, g], "#efe2c4", "#b39d74", 2));
      } else {
        out.push(rect(x0, top, x1 - x0, g - top, "#c9ced4", { alpha: 0.18 }));
        for (let x = x0; x < x1; x += 0.08 * H) out.push(line([x, top, x + (g - top) * 0.5, g], "#8c939b", 2, 0.6), line([x + (g - top) * 0.5, top, x, g], "#8c939b", 2, 0.6));
        for (let x = x0; x < x1; x += 1.2 * H) out.push(line([x, g, x, top - 0.03 * H], "#6d737a", 7));
        out.push(line([x0, top, x1, top], "#6d737a", 6));
      }
      return { shapes: out, lit };
    }
    case "crowd": {
      // a dark arena: rows of dim heads in the stands, the ring's ropes along the back
      for (let row = 0; row < 3; row += 1) for (let x = x0 + (row % 2) * 0.06 * H; x < x1; x += 0.13 * H) {
        const y = g - (0.95 + row * 0.22) * H;
        out.push(circle(x, y, 0.055 * H, mixColor("#3a3d4c", "#000000", row * 0.15)), rect(x - 0.06 * H, y + 0.04 * H, 0.12 * H, 0.14 * H, mixColor("#3a3d4c", "#000000", row * 0.15)));
      }
      return { shapes: out, lit };
    }
    default: return { shapes: out, lit };
  }
}

// THE PLACE PIECE. params: `place` (words, e.g. "kitchen" or the whole sentence), `time` (day / sunset / night; default from the
// words, else the place's usual time), `seed`.
export function drawPlace(p: Params, _t: number, s: Stage, base: BaseRecipes, page: { left: number; right: number }): Shape[] {
  const place = placeOf(p.place);
  if (!place) return [];
  const words = String(p.place ?? ""), time: Time = p.time === "night" || p.time === "sunset" || p.time === "day" ? p.time : timeOf(words, place);
  const seed = typeof p.seed === "number" ? p.seed : 1, g = s.groundY, H = s.height, night = time === "night";
  const x0 = page.left, x1 = page.right, bottom = Math.max((s.width * 9) / 16, g + 60) + 1200;
  const skyShapes: Shape[] = [], back: Shape[] = [], ground: Shape[] = [], things: Shape[] = [], lit: Shape[] = [];
  // 1. sky or wall
  if (!place.indoor) {
    skyShapes.push(...base.sky({ time, seed, ...(night ? { color: "#0b1030", color2: "#3a4a82", stars: true } : {}) }, 0, s));
    if (night) skyShapes.push(...base.sun({ moon: true, x: s.width * 0.78, y: g - 2.1 * H, size: 0.22 }, 0, s));
    else if (time === "sunset") skyShapes.push(...base.sun({ x: s.width * 0.8, y: g - 0.75 * H, size: 0.35, color: "#ff9a4a", color2: "#ffd0a0" }, 0, s));
    // (the clouds drift in front of the sky, never over the sun's face: the sun is drawn after them)
    else skyShapes.push(...base.clouds({ seed, count: 3, y: g - 2.55 * H, h: 0.5 * H, size: 0.9 }, 0, s), ...base.sun({ x: s.width * 0.84, y: g - 2.05 * H, size: 0.26 }, 0, s));
  } else {
    const wall = place.wall ?? "#e6e0d0";
    back.push(rect(x0, -1200, x1 - x0, g + 1200, wall, { fill2: mixColor(wall, "#000000", 0.12) }));
    back.push(rect(x0, g - 0.06 * H, x1 - x0, 0.06 * H, mixColor(wall, "#5a4a3a", 0.45))); // the baseboard
  }
  const far = farScenery(place.far, s, time, seed, base, x0, x1);
  back.push(...far.shapes);
  // 2. the ground / floor (its top = the ground line)
  const f = place.floor, deep = mixColor(f.color, "#000000", 0.28);
  ground.push(rect(x0, g, x1 - x0, bottom - g, f.color, { fill2: deep }), rect(x0, g, x1 - x0, 6, mixColor(f.color, "#ffffff", 0.3)));
  const lineCol = f.line ?? mixColor(f.color, "#000000", 0.2);
  if (f.style === "boards") for (let k = 1; k < 6; k += 1) ground.push(line([x0, g + k * k * 0.018 * H + 6, x1, g + k * k * 0.018 * H + 6], lineCol, 2, 0.6));
  if (f.style === "tiles") { for (let k = 1; k < 5; k += 1) ground.push(line([x0, g + k * k * 0.022 * H, x1, g + k * k * 0.022 * H], lineCol, 2, 0.7)); for (let x = Math.ceil(x0 / 160) * 160; x < x1; x += 160) ground.push(line([x, g, 960 + (x - 960) * 1.6, g + 0.6 * H], lineCol, 2, 0.7)); }
  if (f.style === "road") { ground.push(rect(x0, g, x1 - x0, 0.09 * H, "#a9a9ad"), line([x0, g + 0.09 * H, x1, g + 0.09 * H], "#77777b", 4)); for (let x = Math.floor(x0 / 240) * 240; x < x1; x += 240) ground.push(rect(x, g + 0.32 * H, 120, 0.025 * H, lineCol)); }
  if (f.style === "lines") for (let x = Math.floor(x0 / 260) * 260; x < x1; x += 260) ground.push(line([x, g + 0.05 * H, x - 0.25 * H, g + 0.6 * H], lineCol, 4, 0.7));
  if (f.style === "court") ground.push(line([x0, g + 0.12 * H, x1, g + 0.12 * H], lineCol, 5), line([960, g, 960, g + 0.6 * H], lineCol, 5));
  if (place.id === "boxingRing") {
    // the ring: a raised canvas floor with its apron skirt, the three ropes along the back between the corner posts
    ground.push(rect(x0, g + 0.18 * H, x1 - x0, bottom, "#1f2b4a"), rect(x0, g + 0.18 * H, x1 - x0, 0.03 * H, "#c0392b"));
  }
  if (!place.indoor && f.color === GRASS.color) ground.push(...base.grass({ seed, count: 26, size: 0.07 }, 0, s));
  // 3. the things that belong here, at the two sides; floor things stand on the ground line, wall things hang above the heads
  const half = (x1 - x0) / 2, mid = (x0 + x1) / 2, inner = Math.min(half, s.width / 2);
  for (const [k, th] of place.things.entries()) {
    const x = mid + th.side * (th.at ?? 0.72) * inner;
    const every = EVERYDAY.find((e) => e.id === th.id);
    // (THINGS FACE THE MIDDLE: the picture book draws side-view things facing right, so a thing on the right side is mirrored —
    // a hoop's rim, a chair's seat, a stove's door all turn toward where the figures are)
    if (every && !th.wall) {
      const S = (th.size !== undefined ? every.size * th.size : every.size) * H;
      // (A THING THAT MAKES LIGHT GLOWS IN THE DARK: a fire, a lantern, a candle keeps its bright colors at night and lights a soft
      // warm glow round it)
      const glows = night && GLOWS.test(th.id);
      if (glows) for (const [k, r] of [2.2, 1.6, 1.1].entries()) lit.push({ ...circle(x, g - 0.4 * S, r * S, "#ffc46b"), alpha: 0.07 + 0.04 * k });
      (glows ? lit : things).push(...everyday(th.id, x, g, H, S / H, th.side > 0));
      continue;
    }
    const made = sceneryThing(th.id, x, g, H, time, seed + k, th.size ?? 1);
    things.push(...made.shapes); lit.push(...made.lit);
  }
  if (place.id === "boxingRing") {
    const posts = place.things.filter((th) => th.id === "ringPost").map((th) => mid + th.side * (th.at ?? 0.72) * inner).sort((a, b) => a - b);
    if (posts.length === 2) for (const [k, c] of ["#c0392b", "#f4f4f4", "#2f5fb3"].entries()) things.push(line([posts[0], g - (0.52 - k * 0.15) * H, posts[1], g - (0.52 - k * 0.15) * H], c, 0.022 * H));
  }
  // 4. THE TIME OF DAY LIGHTS EVERYTHING (the sky and the glowing things keep their own light)
  const tint = night ? (place.indoor ? 0.3 : 0.58) : time === "sunset" ? 0.18 : 0;
  const to = time === "sunset" ? "#7a3c5a" : NIGHT_TINT;
  const lightShape = (sh: Shape): Shape => {
    if (!tint) return sh;
    const c = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? mixColor(v, to, tint) : v);
    return { ...sh, ...("fill" in sh ? { fill: c(sh.fill) } : {}), ...("fill2" in sh && sh.fill2 ? { fill2: c(sh.fill2) } : {}), ...("stroke" in sh && sh.stroke ? { stroke: c(sh.stroke) } : {}) } as Shape;
  };
  // (layer by layer, back to front: sky → far scenery and its lit windows → ground → things and their lamps / windows)
  const glow = (list: Shape[]) => list.filter((sh) => !(sh.kind === "rect" && sh.w === 0));
  return [...skyShapes, ...back.map(lightShape), ...glow(far.lit), ...ground.map(lightShape), ...things.map(lightShape), ...glow(lit)];
}

// The place's indoors-or-not (for the back-wall rule: a thing "onWall" in a room hangs on its back wall).
export const placeIsIndoors = (words: unknown) => placeOf(words)?.indoor ?? false;
// (a thing from the picture book standing on the ground at x — exported for the tests' NOTHING FLOATS check)
export const standingThing = everyday;
