import type { FrameCharacter, FrameObject, ObjectLook, Scene } from "../animator/engine.ts";
import { drawHead, drawObjects } from "../animator/render.ts";
import { lookThickness } from "../animator/objects.ts";
import { FIGURE_COLORS } from "../animator/colors.ts";
import { fitAuthoredStage } from "./unifiedStageGeometry.ts";
import type { UnifiedBitmapSymbolDefinitionV2, UnifiedProjectCatalogsV2 } from "./unifiedAnimationContractV2";
import { addEngineLibrarySymbolV2, renderSymbolPngDataUrlV2 } from "./unifiedSymbolLibraryV2.ts";

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
// color words are not real names, so such a figure's head is named by its color instead.
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

export function headSymbolNameV1(character: { id: string; name?: string; style: { color: string } }) {
  return isRealCharacterNameV1(character.name, character.id)
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
};

function headPicture(character: FrameCharacter, name: string): AnimatorSymbolPictureV1 {
  const ppu = SYMBOL_PICTURE_PIXELS_PER_UNIT;
  const extent = character.headRadius + character.style.thickness / 2 + PICTURE_PAD_UNITS;
  const pixelSize = Math.ceil(2 * extent * ppu);
  const boxUnits = pixelSize / ppu;
  const style = { ...character.style };
  return {
    key: JSON.stringify(["head", name, style.color, style.thickness, style.headFilled, character.headRadius]),
    name, pixelSize, boxUnits,
    draw: (ctx) => drawHead(ctx, { style, headRadius: character.headRadius }, { x: boxUnits / 2, y: boxUnits / 2 }, { scale: ppu, offsetX: 0, offsetY: 0 }),
  };
}

function objectPicture(look: ObjectLook, name: string): AnimatorSymbolPictureV1 {
  const ppu = SYMBOL_PICTURE_PIXELS_PER_UNIT;
  const extent = look.size / 2 + lookThickness(look) / 2 + PICTURE_PAD_UNITS;
  const pixelSize = Math.ceil(2 * extent * ppu);
  const boxUnits = pixelSize / ppu;
  const stableLook = { ...look };
  return {
    key: JSON.stringify(["object", name, stableLook]),
    name, pixelSize, boxUnits,
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
  const characterNames = new Map(scene.characters.map(character => [character.id, character.name]));
  const objectNames = new Map((scene.objects ?? []).map(object => [object.id, object.name]));
  const placements = frames.map((characters, index) => {
    const list: AnimatorSymbolPlacementV1[] = [];
    for (const character of characters) {
      const picture = remember(headPicture(character, headSymbolNameV1({ id: character.id, name: characterNames.get(character.id), style: character.style })));
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
// Makes each picture once (PNG), adds it to the Library with Arthur's naming rules (reuse only an
// identical name + picture, otherwise "Name 2"), and returns the new catalogs plus, per frame, the
// placements and their symbol. Returns null (heads/objects then stay in the frame pictures) when
// there is nothing to make or anything fails. Never changes the catalogs it is given.
export function prepareAnimatorSceneSymbolsV1(
  scene: Pick<Scene, "characters" | "objects">,
  frames: readonly (readonly FrameCharacter[])[],
  objects: readonly (readonly FrameObject[])[] | undefined,
  page: { width: number; height: number },
  catalogs: UnifiedProjectCatalogsV2,
  createCanvas?: Parameters<typeof renderSymbolPngDataUrlV2>[3],
) {
  try {
    const tracks = buildAnimatorSymbolTracksV1(scene, frames, objects, page);
    if (!tracks || tracks.pictures.size === 0) return null;
    let nextCatalogs = catalogs;
    const definitions = new Map<string, UnifiedBitmapSymbolDefinitionV2>();
    const pageScale = page.height / 1080;
    for (const picture of tracks.pictures.values()) {
      const pngDataUrl = renderSymbolPngDataUrlV2(picture.pixelSize, picture.pixelSize,
        (ctx) => picture.draw(ctx as unknown as PictureContext), createCanvas);
      // Dragged from the Library, it comes out the size it has in this scene.
      const dropSize = Math.max(1, Math.round(picture.boxUnits * pageScale));
      const added = addEngineLibrarySymbolV2(nextCatalogs, { name: picture.name, pngDataUrl, width: dropSize, height: dropSize });
      nextCatalogs = added.catalogs;
      definitions.set(picture.key, added.definition);
    }
    return { catalogs: nextCatalogs, definitions, placements: tracks.placements };
  } catch (error) {
    console.warn("[animator] Library symbols skipped; heads and objects are drawn into the frames.", error);
    return null;
  }
}
