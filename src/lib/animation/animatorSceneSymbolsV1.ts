import type { FrameCharacter, FrameObject, ObjectLook, Scene } from "../animator/engine.ts";
import { drawHead, drawObjects } from "../animator/render.ts";
import { lookThickness } from "../animator/objects.ts";
import { FIGURE_COLORS } from "../animator/colors.ts";
import { fitAuthoredStage } from "./unifiedStageGeometry.ts";
import type { UnifiedBitmapSymbolDefinitionV2, UnifiedProjectCatalogsV2 } from "./unifiedAnimationContractV2";
import { addEngineLibrarySymbolV2, renderSymbolPngDataUrlV2 } from "./unifiedSymbolLibraryV2.ts";
import { drawShapes } from "../animator/effects/draw.ts";
import type { Shape } from "../animator/effects/types.ts";
import { placedSymbol, type MadeSymbol } from "../animator/symbolMaker.ts";

// SPEC-0017 (Arthur, 2026-10-04): an engine scene also makes Library symbols — the ball it used
// ("Basketball") and each figure's head ("Dark Lord's head", or "Blue stick figure head" when the
// figure has no real name). The frames then place one symbol instance per head/object per frame
// instead of drawing them into the frame pictures, so heads and balls are unerasable and reusable.
// Pure (no React); the picture drawing takes any 2D context, so it is testable in Node.

// ---- Where things go -----------------------------------------------------------------------
// The AI frame pictures put engine stage point (x, y) at page point
//   (pageWidth / 2 + (x - 960) * k,  y * k),   k = pageHeight / 1080   (applyAnimatorScene's map)
// while the symbol overlay (and Play and export) show symbol stage point (u, v) at
//   (offsetX + u * s,  offsetY + v * s),   s = min(pageWidth / 1920, pageHeight / 1080)  ("meet").
// So an engine point becomes the symbol point that lands on the same page pixel.
export function engineToSymbolStageV1(pageWidth: number, pageHeight: number) {
  const meet = fitAuthoredStage(pageWidth, pageHeight);
  if (!meet) return null;
  const k = pageHeight / 1080;
  return {
    // Stage-unit sizes from the engine, in symbol stage units.
    scale: k / meet.scale,
    point: (x: number, y: number) => ({
      x: (pageWidth / 2 + (x - 960) * k - meet.offsetX) / meet.scale,
      y: (y * k - meet.offsetY) / meet.scale,
    }),
  };
}

// ---- Names ---------------------------------------------------------------------------------
// The review test kit names its figures by role ("Mover", "Left", "Runner"...). Those, ids and
// color words are not real names, so such a figure's head is named by its color instead (even when
// marked as named by the user).
const PLACEHOLDER_NAMES = new Set([
  "mover", "left", "right", "runner", "catcher", "jumper", "waver", "squatter", "fast", "slow", "thrower",
  "figure", "stick figure", "character", "person", "player", "actor", "someone", "he", "she", "it", "they",
  ...Object.keys(FIGURE_COLORS), "grey",
]);

export function isRealCharacterNameV1(name: string | undefined, id: string) {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 2) return false;
  const key = trimmed.toLocaleLowerCase();
  if (key === id.trim().toLocaleLowerCase()) return false;
  if (PLACEHOLDER_NAMES.has(key)) return false;
  if (/^(figure|character|person|player|stick ?figure)\s*\d*$/i.test(trimmed) || /^[a-z]$/i.test(trimmed)) return false;
  return true;
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

const hexRgb = (color: string) => {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16));
};

// "#2563eb" → "Blue": the AI panel's Color menu names (FIGURE_COLORS); any other color gets the nearest one.
export function colorNameV1(color: string) {
  const rgb = hexRgb(color);
  if (!rgb) return "Black";
  let best = "black", bestDistance = Infinity;
  for (const [name, value] of Object.entries(FIGURE_COLORS)) {
    const other = hexRgb(value)!;
    // Weighted RGB distance (roughly how different two colors look).
    const distance = 2 * (rgb[0] - other[0]) ** 2 + 4 * (rgb[1] - other[1]) ** 2 + 3 * (rgb[2] - other[2]) ** 2;
    if (distance < bestDistance) { best = name; bestDistance = distance; }
  }
  return capitalize(best);
}

// SYMBOL NAMES (Arthur, 2026-10-06): a head is "<Color> stick figure head" ("Black stick figure head") unless
// the USER named the figure — `namedByUser: true` on the plan character (the AI director sets it when the user
// gave the name) — then "<name>'s head" ("Dark Lord's head"). Names the engine or a test scene made up ("Hero",
// "Officer", "Red (laser)") are never used. (Only the names of NEW symbols; existing ones are never renamed.)
export function headSymbolNameV1(character: { id: string; name?: string; namedByUser?: boolean; style: { color: string } }) {
  return character.namedByUser === true && isRealCharacterNameV1(character.name, character.id)
    ? `${character.name!.trim()}'s head`
    : `${colorNameV1(character.style.color)} stick figure head`;
}

const GENERIC_OBJECT_NAMES = new Set(["ball", "object", "box", "thing", "item"]);

export function objectSymbolNameV1(object: { id: string; name?: string; look: ObjectLook }) {
  const name = (object.name ?? "").trim();
  if (name.length >= 2 && name.toLocaleLowerCase() !== object.id.toLocaleLowerCase() && !GENERIC_OBJECT_NAMES.has(name.toLocaleLowerCase())) return capitalize(name);
  if (object.look.kind === "ball" && object.look.detail === "basketball") return "Basketball";
  return `${colorNameV1(object.look.color)} ${object.look.kind === "ball" ? "ball" : "box"}`;
}

// ---- NO NEAR-DUPLICATE SYMBOLS ---------------------------------------------------------------
// Arthur (2026-10-06): "a microscopic color change is not worth a symbol" — no "Leaf 2", "Laser eye 2" or
// "Red stick figure head 2" that looks nearly the same as the one already in the Library. A picture's LOOK is
// what it shows with the colors taken out and every length as a fraction of the thing's size (`form`,
// `numbers`), its colors in order, the thing's size (stage units) and the picture's box (stage units).
// Two looks are NEARLY THE SAME when they are the same kind of thing with the same parts (same form, every
// proportion within NEAR_SHAPE) and every color within NEAR_COLOR_DE (CIEDE2000: ~2 is just visible side by
// side; the two test reds #e2461c / #e02424 are 7.4 apart; the closest two figure colors, blue and purple, 15).
// A really different color (red vs blue) or shape keeps its own symbol.
export type SymbolLookV1 = { form: string; numbers: number[]; colors: string[]; size: number; boxWidth: number; boxHeight: number };
export const NEAR_COLOR_DE = 8;
const NEAR_SHAPE = 0.03;

const toLab = (rgb: number[]) => {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
// How different two colors look (CIEDE2000; Infinity when either isn't a #rgb / #rrggbb color).
export function colorDifferenceV1(colorA: string, colorB: string) {
  const p = hexRgb(colorA), q = hexRgb(colorB);
  if (!p || !q) return colorA.trim().toLocaleLowerCase() === colorB.trim().toLocaleLowerCase() ? 0 : Infinity;
  return rgbDifference(p, q);
}
function rgbDifference(p: number[], q: number[]) {
  const [L1, a1, b1] = toLab(p), [L2, a2, b2] = toLab(q), rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G), C1 = Math.hypot(ap1, b1), C2 = Math.hypot(ap2, b2);
  const hue = (x: number, y: number) => (x === 0 && y === 0 ? 0 : (Math.atan2(y, x) / rad + 360) % 360);
  const h1 = hue(ap1, b1), h2 = hue(ap2, b2);
  let dh = C1 * C2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (C1 + C2) / 2;
  let hb = h1 + h2;
  if (C1 * C2 !== 0) { if (Math.abs(h1 - h2) > 180) hb += h1 + h2 < 360 ? 360 : -360; hb /= 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T;
  const RT = -Math.sin(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

export function nearlySameLookV1(a: SymbolLookV1, b: SymbolLookV1) {
  return a.form === b.form && a.numbers.length === b.numbers.length && a.colors.length === b.colors.length
    && a.numbers.every((value, i) => Math.abs(value - b.numbers[i]) <= NEAR_SHAPE)
    && a.colors.every((color, i) => colorDifferenceV1(color, b.colors[i]) <= NEAR_COLOR_DE);
}

// The look of a made symbol's shapes (effects/types.ts Shapes), `size` = the symbol's height.
const LENGTH_KEYS = new Set(["x", "y", "r", "w", "h", "width", "glow", "points"]);
export function shapesLookV1(shapes: readonly Shape[], size: number, extra: number[], box: { width: number; height: number }): SymbolLookV1 {
  const form: unknown[] = [], numbers = [...extra], colors: string[] = [];
  for (const shape of shapes) {
    const part: unknown[] = [];
    for (const key of Object.keys(shape).sort()) {
      const value = (shape as Record<string, unknown>)[key], k = LENGTH_KEYS.has(key) ? 1 / size : 1;
      if (typeof value === "number") { part.push(key); numbers.push(value * k); }
      else if (Array.isArray(value)) { part.push(`${key}[${value.length}]`); for (const v of value) numbers.push(Number(v) * k); }
      else if (typeof value === "string" && hexRgb(value)) { part.push(key); colors.push(value); }
      else part.push([key, value]);
    }
    form.push(part);
  }
  return { form: JSON.stringify(form), numbers, colors, size, boxWidth: box.width, boxHeight: box.height };
}

// The looks of the Library pictures this app made (by picture), so a later one can be compared with them.
// Kept while the page is open — also when this code is reloaded while the app runs (one shared map on the page).
// After the page itself is reloaded (a recovered or reopened project) a Library symbol it doesn't know is compared
// by its PICTURE instead (picturesLookAlikeV1) and, when nearly the same, remembered here. (Nothing is saved.)
const MADE_LOOKS: Map<string, SymbolLookV1> = ((globalThis as { __animatorMadeSymbolLooks?: Map<string, SymbolLookV1> }).__animatorMadeSymbolLooks ??= new Map());
const nameKey = (name: string) => name.trim().normalize("NFC").toLocaleLowerCase();
// (tests: as after a page reload)
export const forgetMadeSymbolLooksV1 = () => MADE_LOOKS.clear();

// ---- Comparing two pictures (a Library symbol whose look isn't known) -------------------------
// Each picture's THING (its see-through-free box) is sampled on a PICTURE_GRID x PICTURE_GRID grid, so the same
// thing drawn bigger or smaller compares equal. Nearly the same = the same shape (the box's width/height within
// 6%, the average see-through difference per cell at most NEAR_PICTURE_SHAPE: a filled vs a hollow head differ by
// ~0.4) and the same colors (where both are solid, CIEDE2000 on average at most NEAR_COLOR_DE).
export type PicturePixelsV1 = { width: number; height: number; data: ArrayLike<number> };
const PICTURE_GRID = 24, NEAR_PICTURE_SHAPE = 0.08;
function sampleThing(p: PicturePixelsV1) {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y += 1) for (let x = 0; x < p.width; x += 1) {
    if (p.data[(y * p.width + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, n = PICTURE_GRID * PICTURE_GRID;
  const count = new Float64Array(n), alpha = new Float64Array(n), rgb = new Float64Array(n * 3);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const i = (y * p.width + x) * 4, a = p.data[i + 3] / 255;
    const c = Math.min(PICTURE_GRID - 1, Math.floor(((x - x0) * PICTURE_GRID) / w)) + PICTURE_GRID * Math.min(PICTURE_GRID - 1, Math.floor(((y - y0) * PICTURE_GRID) / h));
    count[c] += 1; alpha[c] += a;
    for (let k = 0; k < 3; k += 1) rgb[c * 3 + k] += p.data[i + k] * a;
  }
  return { w, h, count, alpha, rgb };
}
export function picturesLookAlikeV1(mine: PicturePixelsV1, theirs: PicturePixelsV1): { alike: boolean; scale: number } {
  const a = sampleThing(mine), b = sampleThing(theirs);
  if (!a || !b || Math.abs(a.w / a.h / (b.w / b.h) - 1) > 0.06) return { alike: false, scale: 1 };
  let shape = 0, colors = 0, solid = 0;
  for (let c = 0; c < a.count.length; c += 1) {
    const aa = a.count[c] ? a.alpha[c] / a.count[c] : 0, ba = b.count[c] ? b.alpha[c] / b.count[c] : 0;
    shape += Math.abs(aa - ba);
    if (aa >= 0.5 && ba >= 0.5) {
      const ca = [0, 1, 2].map(k => a.rgb[c * 3 + k] / a.alpha[c]), cb = [0, 1, 2].map(k => b.rgb[c * 3 + k] / b.alpha[c]);
      colors += rgbDifference(ca, cb); solid += 1;
    }
  }
  const alike = shape / a.count.length <= NEAR_PICTURE_SHAPE && solid > 0 && colors / solid <= NEAR_COLOR_DE;
  return { alike, scale: b.h / a.h };
}

// What a Library picture (not made in this page) is, when the app can show it: `getImage` = the app's decoded
// symbol pictures (DrawingWorkspace's symbol image cache); `draw` makes the new picture to compare with it.
export type SymbolImageSourceV1 = (definition: UnifiedBitmapSymbolDefinitionV2) => CanvasImageSource | null;
export type PictureToCompareV1 = { draw: (ctx: PictureContext) => void; widthPixels: number; heightPixels: number; createCanvas?: Parameters<typeof renderSymbolPngDataUrlV2>[3]; getImage?: SymbolImageSourceV1 };
function readPixels(compare: PictureToCompareV1, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): PicturePixelsV1 | null {
  const canvas = (compare.createCanvas ?? (() => document.createElement("canvas")))();
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx);
  return ctx.getImageData(0, 0, width, height);
}
function lookFromPicture(symbol: UnifiedBitmapSymbolDefinitionV2, look: SymbolLookV1, compare: PictureToCompareV1, mine: () => PicturePixelsV1 | null): SymbolLookV1 | null {
  try {
    const image = compare.getImage?.(symbol);
    if (!image) return null;
    const sized = image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
    const width = Math.round(Number(sized.naturalWidth || sized.width)), height = Math.round(Number(sized.naturalHeight || sized.height));
    if (!(width > 0 && height > 0 && width <= 4096 && height <= 4096)) return null;
    const theirs = readPixels(compare, width, height, ctx => ctx.drawImage(image, 0, 0, width, height));
    const ours = mine();
    if (!theirs || !ours) return null;
    const { alike, scale } = picturesLookAlikeV1(ours, theirs);
    if (!alike) return null;
    // (its thing is `scale` x the size of ours, in a picture of its own size, at the same pixels per unit)
    const known = { ...look, size: look.size * scale, boxWidth: width / SYMBOL_PICTURE_PIXELS_PER_UNIT, boxHeight: height / SYMBOL_PICTURE_PIXELS_PER_UNIT };
    MADE_LOOKS.set(symbol.assetSha256, known);
    return known;
  } catch {
    return null;
  }
}

// Adds an engine picture to the Library with Arthur's rules (addEngineLibrarySymbolV2: reuse an identical name +
// picture, otherwise "Name 2"; never change a symbol) plus NO NEAR-DUPLICATES: instead of a new "Name 2", a symbol
// under that name ("Name", "Name 2"...) that looks nearly the same is reused — known by its look, or (`compare`,
// after a reload) by its picture. `box`: the size (stage units) to place the symbol's picture at so the thing shows
// at this look's size. Never changes the catalogs given.
export function addLibrarySymbolWithLookV1(catalogs: UnifiedProjectCatalogsV2, input: Parameters<typeof addEngineLibrarySymbolV2>[1], look: SymbolLookV1, compare?: PictureToCompareV1) {
  const boxFor = (known: SymbolLookV1) => { const k = look.size / known.size; return { width: known.boxWidth * k, height: known.boxHeight * k }; };
  const added = addEngineLibrarySymbolV2(catalogs, input);
  if (added.status === "created") {
    const base = nameKey(input.name);
    let mine: PicturePixelsV1 | null | undefined;
    const minePixels = () => (mine === undefined ? (mine = compare ? readPixels(compare, compare.widthPixels, compare.heightPixels, ctx => compare.draw(ctx as unknown as PictureContext)) : null) : mine);
    for (const symbol of catalogs.symbols) {
      const key = nameKey(symbol.name);
      if (key !== base && !(key.startsWith(`${base} `) && /^\d+$/.test(key.slice(base.length + 1)))) continue;
      if (symbol.sourceCategory !== "Drawing Symbol" || symbol.structuredPayload) continue;
      const known = MADE_LOOKS.get(symbol.assetSha256) ?? (compare?.getImage ? lookFromPicture(symbol, look, compare, minePixels) : null);
      if (known && nearlySameLookV1(known, look)) return { catalogs, definition: symbol, status: "reused" as const, box: boxFor(known) };
    }
  }
  if (!MADE_LOOKS.has(added.definition.assetSha256)) MADE_LOOKS.set(added.definition.assetSha256, look);
  return { ...added, box: boxFor(MADE_LOOKS.get(added.definition.assetSha256)!) };
}

// ---- Pictures ------------------------------------------------------------------------------
// Pictures are drawn at a fixed 4 px per stage unit: sharp on any screen (a 1080-unit-tall page is
// at most ~2.5 px per unit on a 4K display), and the same picture every time, so a second scene
// with the same figure reuses the same Library symbol instead of adding "head 2".
export const SYMBOL_PICTURE_PIXELS_PER_UNIT = 4;
const PICTURE_PAD_UNITS = 2; // room for anti-aliased edges

type PictureContext = Parameters<typeof drawHead>[0];

export type AnimatorSymbolPictureV1 = {
  key: string;
  name: string;
  pixelSize: number; // square picture, pixels
  boxUnits: number; // the picture's side in engine stage units (pixelSize / pixels per unit)
  draw: (ctx: PictureContext) => void;
  look?: SymbolLookV1; // what it shows (NO NEAR-DUPLICATE SYMBOLS)
};

function headPicture(character: FrameCharacter, name: string): AnimatorSymbolPictureV1 {
  const ppu = SYMBOL_PICTURE_PIXELS_PER_UNIT;
  const extent = character.headRadius + character.style.thickness / 2 + PICTURE_PAD_UNITS;
  const pixelSize = Math.ceil(2 * extent * ppu);
  const boxUnits = pixelSize / ppu;
  const style = { ...character.style };
  // Its look: a filled head is a round dot (any size looks the same); a hollow one is a ring as thick as it is.
  const outer = 2 * character.headRadius + style.thickness, color = hexRgb(style.color) ? [style.color] : [];
  const look: SymbolLookV1 = {
    form: JSON.stringify(["head", style.headFilled === true, color.length ? null : style.color]),
    numbers: style.headFilled ? [] : [style.thickness / outer], colors: color, size: outer, boxWidth: boxUnits, boxHeight: boxUnits,
  };
  return {
    key: JSON.stringify(["head", name, style.color, style.thickness, style.headFilled, character.headRadius]),
    name, pixelSize, boxUnits, look,
    draw: (ctx) => drawHead(ctx, { style, headRadius: character.headRadius }, { x: boxUnits / 2, y: boxUnits / 2 }, { scale: ppu, offsetX: 0, offsetY: 0 }),
  };
}

function objectPicture(look: ObjectLook, name: string): AnimatorSymbolPictureV1 {
  const ppu = SYMBOL_PICTURE_PIXELS_PER_UNIT;
  const extent = look.size / 2 + lookThickness(look) / 2 + PICTURE_PAD_UNITS;
  const pixelSize = Math.ceil(2 * extent * ppu);
  const boxUnits = pixelSize / ppu;
  const stableLook = { ...look };
  const { size: _size, ...form } = stableLook;
  return {
    key: JSON.stringify(["object", name, stableLook]),
    name, pixelSize, boxUnits,
    look: shapesLookV1([form as unknown as Shape], 2 * (extent - PICTURE_PAD_UNITS), [], { width: boxUnits, height: boxUnits }),
    // drawObjects' own code for this look, upright and unsquashed.
    draw: (ctx) => drawObjects(ctx as Parameters<typeof drawObjects>[0], [{ id: "picture", x: boxUnits / 2, y: boxUnits / 2, rotation: 0, scaleX: 1, scaleY: 1, look: stableLook }], { scale: ppu, offsetX: 0, offsetY: 0 }),
  };
}

// ---- One instance per head / object per frame ----------------------------------------------
export type AnimatorSymbolPlacementV1 = {
  pictureKey: string;
  centerX: number; // symbol stage units
  centerY: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

const MIN_VISIBLE_UNITS = 0.01;

// Heads first, then objects on top (a held ball stays in front, as in drawFrame).
export function buildAnimatorSymbolTracksV1(
  scene: Pick<Scene, "characters" | "objects">,
  frames: readonly (readonly FrameCharacter[])[],
  objects: readonly (readonly FrameObject[])[] | undefined,
  page: { width: number; height: number },
) {
  const toSymbol = engineToSymbolStageV1(page.width, page.height);
  if (!toSymbol) return null;
  const pictures = new Map<string, AnimatorSymbolPictureV1>();
  const remember = (picture: AnimatorSymbolPictureV1) => {
    if (!pictures.has(picture.key)) pictures.set(picture.key, picture);
    return picture;
  };
  const characterNames = new Map(scene.characters.map(character => [character.id, character]));
  const objectNames = new Map((scene.objects ?? []).map(object => [object.id, object.name]));
  const placements = frames.map((characters, index) => {
    const list: AnimatorSymbolPlacementV1[] = [];
    for (const character of characters) {
      const who = characterNames.get(character.id);
      const picture = remember(headPicture(character, headSymbolNameV1({ id: character.id, name: who?.name, namedByUser: who?.namedByUser, style: character.style })));
      const center = toSymbol.point(character.skeleton.head.x, character.skeleton.head.y);
      const side = picture.boxUnits * toSymbol.scale;
      list.push({ pictureKey: picture.key, centerX: center.x, centerY: center.y, width: side, height: side, rotation: 0, flipX: false, flipY: false });
    }
    for (const object of objects?.[index] ?? []) {
      const picture = remember(objectPicture(object.look, objectSymbolNameV1({ id: object.id, name: objectNames.get(object.id), look: object.look })));
      const width = picture.boxUnits * Math.abs(object.scaleX) * toSymbol.scale;
      const height = picture.boxUnits * Math.abs(object.scaleY) * toSymbol.scale;
      if (!(width > MIN_VISIBLE_UNITS) || !(height > MIN_VISIBLE_UNITS)) continue; // shrunk to nothing
      const center = toSymbol.point(object.x, object.y);
      // The engine squashes along the stage axes after turning; a symbol stretches along its own
      // axes. They agree when the squash is even; during an uneven squash the ball is shown upright.
      const evenSquash = Math.abs(Math.abs(object.scaleX) - Math.abs(object.scaleY)) < 1e-9;
      list.push({
        pictureKey: picture.key, centerX: center.x, centerY: center.y, width, height,
        rotation: evenSquash ? object.rotation : 0,
        flipX: object.scaleX < 0, flipY: object.scaleY < 0,
      });
    }
    return list;
  });
  return { pictures, placements, sizeScale: toSymbol.scale };
}

// ---- Library symbols + placements for one scene ---------------------------------------------
// Makes each picture once (PNG), adds it to the Library with Arthur's naming rules (reuse an identical
// name + picture, or one that looks NEARLY THE SAME — addLibrarySymbolWithLookV1 —, otherwise "Name 2"), and
// returns the new catalogs plus, per frame, the placements and their symbol. Returns null (heads/objects then
// stay in the frame pictures) when there is nothing to make or anything fails. Never changes the catalogs given.
export function prepareAnimatorSceneSymbolsV1(
  scene: Pick<Scene, "characters" | "objects">,
  frames: readonly (readonly FrameCharacter[])[],
  objects: readonly (readonly FrameObject[])[] | undefined,
  page: { width: number; height: number },
  catalogs: UnifiedProjectCatalogsV2,
  createCanvas?: Parameters<typeof renderSymbolPngDataUrlV2>[3],
  // The app's decoded Library pictures, to compare a symbol it doesn't know the look of (after a reload).
  getImage?: SymbolImageSourceV1,
) {
  try {
    const tracks = buildAnimatorSymbolTracksV1(scene, frames, objects, page);
    if (!tracks || tracks.pictures.size === 0) return null;
    let nextCatalogs = catalogs;
    const definitions = new Map<string, UnifiedBitmapSymbolDefinitionV2>();
    const resize = new Map<string, number>();
    const pageScale = page.height / 1080;
    for (const picture of tracks.pictures.values()) {
      const pngDataUrl = renderSymbolPngDataUrlV2(picture.pixelSize, picture.pixelSize,
        (ctx) => picture.draw(ctx as unknown as PictureContext), createCanvas);
      // Dragged from the Library, it comes out the size it has in this scene.
      const dropSize = Math.max(1, Math.round(picture.boxUnits * pageScale));
      const input = { name: picture.name, pngDataUrl, width: dropSize, height: dropSize };
      const added = picture.look
        ? addLibrarySymbolWithLookV1(nextCatalogs, input, picture.look, { draw: picture.draw, widthPixels: picture.pixelSize, heightPixels: picture.pixelSize, createCanvas, getImage })
        : addEngineLibrarySymbolV2(nextCatalogs, input);
      nextCatalogs = added.catalogs;
      definitions.set(picture.key, added.definition);
      // A reused nearly-the-same picture drawn at another size: placed bigger or smaller so the head shows the same size.
      const reusedBox = (added as { box?: { width: number; height: number } }).box;
      if (reusedBox) resize.set(picture.key, reusedBox.width / picture.boxUnits);
    }
    const placements = tracks.placements.map(list => list.map(placement => {
      const k = resize.get(placement.pictureKey) ?? 1;
      return Math.abs(k - 1) < 1e-9 ? placement : { ...placement, width: placement.width * k, height: placement.height * k };
    }));
    return { catalogs: nextCatalogs, definitions, placements };
  } catch (error) {
    console.warn("[animator] Library symbols skipped; heads and objects are drawn into the frames.", error);
    return null;
  }
}

// ---- Original symbols (SPEC-0017 Phase 2C) --------------------------------------------------
// A prop the engine built from simple shapes (animator/symbolMaker.ts: "Spike", "Box", "Bat", or an
// invented one) becomes a normal Library symbol the same way heads and balls do: one PNG picture at
// SYMBOL_PICTURE_PIXELS_PER_UNIT, added with addLibrarySymbolWithLookV1 (Arthur's naming rules: reuse an
// identical or nearly-the-same one, otherwise "Name 2"). Nothing new is saved: a symbol is a picture + its size.
export function madeSymbolPictureV1(symbol: MadeSymbol): AnimatorSymbolPictureV1 & { widthPixels: number; heightPixels: number } {
  const ppu = SYMBOL_PICTURE_PIXELS_PER_UNIT;
  const widthPixels = Math.ceil((symbol.width + 2 * PICTURE_PAD_UNITS) * ppu);
  const heightPixels = Math.ceil((symbol.height + 2 * PICTURE_PAD_UNITS) * ppu);
  const shapes = symbol.shapes.map(shape => ({ ...shape }));
  return {
    key: JSON.stringify(["made", symbol.name, symbol.width, symbol.height, shapes]),
    name: symbol.name, pixelSize: Math.max(widthPixels, heightPixels), boxUnits: Math.max(widthPixels, heightPixels) / ppu,
    widthPixels, heightPixels,
    draw: (ctx) => drawShapes(ctx as unknown as CanvasRenderingContext2D, shapes, { scale: ppu, offsetX: PICTURE_PAD_UNITS * ppu, offsetY: PICTURE_PAD_UNITS * ppu }),
    look: shapesLookV1(shapes, symbol.height, [symbol.width / symbol.height], { width: widthPixels / ppu, height: heightPixels / ppu }),
  };
}

// Adds a made symbol to the Library. `pageHeight` (CSS px) sets the size it comes out when dragged from
// the Library, as for heads: engine stage units x pageHeight / 1080 (default: the stage size itself).
// NO NEAR-DUPLICATES: a symbol of that name this app made that looks nearly the same (same recipe and parts,
// colors only a shade apart) is reused instead of making "Name 2"; `box` = the size (stage units) to place the
// reused picture at. Never changes the catalogs it is given.
export function addMadeSymbolToLibraryV1(
  catalogs: UnifiedProjectCatalogsV2,
  symbol: MadeSymbol,
  options: { pageHeight?: number; createCanvas?: Parameters<typeof renderSymbolPngDataUrlV2>[3]; getImage?: SymbolImageSourceV1 } = {},
) {
  const picture = madeSymbolPictureV1(symbol);
  const pngDataUrl = renderSymbolPngDataUrlV2(picture.widthPixels, picture.heightPixels,
    (ctx) => picture.draw(ctx as unknown as PictureContext), options.createCanvas);
  const pageScale = (options.pageHeight ?? 1080) / 1080;
  const ppu = SYMBOL_PICTURE_PIXELS_PER_UNIT;
  return addLibrarySymbolWithLookV1(catalogs, {
    name: symbol.name, pngDataUrl,
    width: Math.max(1, Math.round((picture.widthPixels / ppu) * pageScale)),
    height: Math.max(1, Math.round((picture.heightPixels / ppu) * pageScale)),
  }, picture.look!, { draw: picture.draw, widthPixels: picture.widthPixels, heightPixels: picture.heightPixels, createCanvas: options.createCanvas, getImage: options.getImage });
}

// ---- Placed symbols from effects and backgrounds (STILL THINGS ARE SYMBOLS) ---------------------
// Arthur: "The light bulb should be a symbol. This water droplet should be a symbol. The spikes for parkour
// should be a symbol." The "symbol" shapes in a scene's effect and background pictures (toFrames.ts
// sceneEffectLayers, already slid with the centered animation) become Library symbols — each added once, by
// name and colors, with addMadeSymbolToLibraryV1 — plus one placement per picture, instead of being painted into
// every picture. A placement can't be see-through, so a symbol that fades out is placed only while it is at least
// half visible. Returns null (the symbols are then drawn into the pictures, as before) when there are none or
// anything fails. Never changes the catalogs it is given.
export type EffectSymbolPlacementsV1 = { back: AnimatorSymbolPlacementV1[]; front: AnimatorSymbolPlacementV1[] };
export function prepareEffectSymbolsV1(
  // `moving`: a moving background's own layers, each picture by picture (effects/movingBackground.ts: raindrops, leaves).
  // `top`: the layer over the heads (laser beams; the glowing "Laser eye" symbols are placed on it, over the beams).
  layers: { effects?: readonly { back: readonly Shape[]; front: readonly Shape[] }[]; background?: readonly (readonly Shape[])[]; moving?: readonly (readonly (readonly Shape[])[])[]; top?: readonly (readonly Shape[])[] },
  page: { width: number; height: number },
  catalogs: UnifiedProjectCatalogsV2,
  createCanvas?: Parameters<typeof renderSymbolPngDataUrlV2>[3],
  getImage?: SymbolImageSourceV1, // (as in prepareAnimatorSceneSymbolsV1)
) {
  const hasSymbol =(shapes: readonly Shape[]) => shapes.some(shape => shape.kind === "symbol");
  if (!layers.effects?.some(fx => hasSymbol(fx.back) || hasSymbol(fx.front)) && !layers.background?.some(hasSymbol) && !layers.moving?.some(layer => layer.some(hasSymbol)) && !layers.top?.some(hasSymbol)) return null;
  try {
    const toSymbol = engineToSymbolStageV1(page.width, page.height);
    if (!toSymbol) return null;
    let nextCatalogs = catalogs;
    const definitions = new Map<string, UnifiedBitmapSymbolDefinitionV2>();
    const pictureUnits = new Map<string, { width: number; height: number }>();
    const place = (shapes: readonly Shape[]) => {
      const list: AnimatorSymbolPlacementV1[] = [];
      for (const shape of shapes) {
        if (shape.kind !== "symbol" || !((shape.alpha ?? 1) >= 0.5)) continue;
        const key = JSON.stringify(["placed", shape.name, shape.color ?? null, shape.color2 ?? null]);
        let units = pictureUnits.get(key);
        if (!units) {
          const added = addMadeSymbolToLibraryV1(nextCatalogs, placedSymbol(shape), { pageHeight: page.height, createCanvas, getImage });
          nextCatalogs = added.catalogs;
          definitions.set(key, added.definition);
          // (its picture's size; a reused nearly-the-same one drawn at another size is placed so it shows this size)
          units = added.box;
          pictureUnits.set(key, units);
        }
        const k = (shape.scale ?? 1) * toSymbol.scale, width = units.width * k, height = units.height * k;
        if (!(width > MIN_VISIBLE_UNITS) || !(height > MIN_VISIBLE_UNITS)) continue;
        const center = toSymbol.point(shape.x, shape.y);
        list.push({ pictureKey: key, centerX: center.x, centerY: center.y, width, height, rotation: shape.rotation ?? 0, flipX: shape.flipX === true, flipY: false });
      }
      return list;
    };
    const effects: EffectSymbolPlacementsV1[] | undefined = layers.effects?.map(fx => ({ back: place(fx.back), front: place(fx.front) }));
    const background = layers.background?.map(place);
    const moving = layers.moving?.map(layer => layer.map(place));
    const top = layers.top?.map(place);
    return { catalogs: nextCatalogs, definitions, effects, background, moving, top };
  } catch (error) {
    console.warn("[animator] Effect symbols skipped; they are drawn into the frames.", error);
    return null;
  }
}
