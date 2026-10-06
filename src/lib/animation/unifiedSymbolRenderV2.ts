import type { UnifiedSymbolInstanceItemV2 } from "./unifiedAnimationContentV2";
import type { UnifiedBitmapSymbolDefinitionV2 } from "./unifiedAnimationContractV2";
import { resolveStructuredSymbolGeometryV2 } from "./unifiedProjectCatalogV2.ts";
import { fitAuthoredStage, type StagePresentation } from "./unifiedStageGeometry.ts";

// Draws Library symbol instances onto a 2D canvas (used by the editor's Play view).
// It follows the editor's symbol overlay exactly: the 1920x1080 stage is fitted
// whole and centered (SVG viewBox "meet", same as export), and each instance is
// moved to its center, rotated, then flipped. Pictures are decoded once and kept,
// so drawing a frame never decodes or allocates per symbol.

export type SymbolTargetRectV2 = { left: number; top: number; width: number; height: number };

export function resolveSymbolStagePresentationV2(rect: SymbolTargetRectV2): StagePresentation | null {
  const fitted = fitAuthoredStage(rect.width, rect.height);
  if (!fitted || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
  return { scale: fitted.scale, offsetX: rect.left + fitted.offsetX, offsetY: rect.top + fitted.offsetY };
}

// The editor's drawing canvas is the "authoring world": 4.6x the page each way, at device pixels.
export const AUTHORING_WORLD_SCALE_V2 = 4.6;

// Drawing-canvas pixels per stage unit for an instance placed against a drawing canvas of this
// size: the stage fitted whole in that moment's page (page = canvas / 4.6), around the canvas middle.
export const referenceStageScaleV2 = (drawingCanvas: { width: number; height: number }, worldScale = AUTHORING_WORLD_SCALE_V2) =>
  Math.min(drawingCanvas.width / worldScale / 1920, drawingCanvas.height / worldScale / 1080);

// Where an instance is drawn in a view. Instances without `drawingCanvas` use the view's normal
// stage fit (`base`). Instances with it are drawn like drawings: `view.perCanvasPixel` is the
// view's size of one drawing-canvas pixel and (centerX, centerY) the view's page middle.
export function instancePresentationV2(
  instance: Pick<UnifiedSymbolInstanceItemV2, "drawingCanvas">,
  base: StagePresentation,
  view: { centerX: number; centerY: number; perCanvasPixel: number } | null,
): StagePresentation {
  if (!instance.drawingCanvas || !view || !(view.perCanvasPixel > 0)) return base;
  const scale = referenceStageScaleV2(instance.drawingCanvas) * view.perCanvasPixel;
  if (!(scale > 0) || !Number.isFinite(scale)) return base;
  return { scale, offsetX: view.centerX - 960 * scale, offsetY: view.centerY - 540 * scale };
}

export const symbolDefinitionRasterUrlV2 = (definition: UnifiedBitmapSymbolDefinitionV2): string | null =>
  definition.structuredPayload ? definition.structuredPayload.drawingPngDataUrl : definition.pngDataUrl;

// Canvas transform(a, b, c, d, e, f) that maps the instance's own box (centered on 0,0,
// in stage units) to target pixels: stage fit, then translate(center) rotate flip.
export function resolveSymbolInstanceMatrixV2(
  instance: Pick<UnifiedSymbolInstanceItemV2, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">,
  presentation: StagePresentation,
): [number, number, number, number, number, number] {
  const radians = (instance.rotation * Math.PI) / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const flipX = instance.flipX ? -1 : 1, flipY = instance.flipY ? -1 : 1;
  const scale = presentation.scale;
  const centerX = instance.x + instance.width / 2, centerY = instance.y + instance.height / 2;
  return [
    scale * cos * flipX,
    scale * sin * flipX,
    -scale * sin * flipY,
    scale * cos * flipY,
    presentation.offsetX + scale * centerX,
    presentation.offsetY + scale * centerY,
  ];
}

// The instances the canvas shows for one layer at one frame: the canvas keys them by
// `${layerId}:${frame.stateId}`, and hold/tween frames share their owner's stateId.
export function symbolInstancesAtFrameV2(
  instancesByCell: Readonly<Record<string, UnifiedSymbolInstanceItemV2[]>>,
  layerId: string,
  frames: ReadonlyArray<{ stateId: number }>,
  frameIndex: number,
): UnifiedSymbolInstanceItemV2[] | undefined {
  const frame = frames[frameIndex];
  const instances = frame ? instancesByCell[`${layerId}:${frame.stateId}`] : undefined;
  return instances?.length ? instances : undefined;
}

const definitionIndexCache = new WeakMap<readonly UnifiedBitmapSymbolDefinitionV2[], ReadonlyMap<string, UnifiedBitmapSymbolDefinitionV2>>();

// One lookup table per catalog array (catalog updates always create a new array).
export function indexSymbolDefinitionsV2(symbols: readonly UnifiedBitmapSymbolDefinitionV2[]) {
  let index = definitionIndexCache.get(symbols);
  if (!index) {
    index = new Map(symbols.map(definition => [definition.definitionId, definition]));
    definitionIndexCache.set(symbols, index);
  }
  return index;
}

export type SymbolDrawContextV2 = {
  save(): void;
  restore(): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  stroke(): void;
  fill(): void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  imageSmoothingEnabled: boolean;
};

// Same look as the overlay's structured (rig) symbols: 14 stage-unit dark limbs and joints.
const STRUCTURED_SYMBOL_COLOR = "#101218";
const STRUCTURED_SYMBOL_WIDTH = 14;

// Returns how many instances were drawn (missing/changed definitions are skipped, like the overlay).
export function drawSymbolInstancesV2(
  ctx: SymbolDrawContextV2,
  instances: readonly UnifiedSymbolInstanceItemV2[],
  definitionsById: ReadonlyMap<string, UnifiedBitmapSymbolDefinitionV2>,
  presentationOrResolver: StagePresentation | ((instance: UnifiedSymbolInstanceItemV2) => StagePresentation | null),
  getImage: (definition: UnifiedBitmapSymbolDefinitionV2) => CanvasImageSource | null,
) {
  let drawn = 0;
  for (const instance of instances) {
    const presentation = typeof presentationOrResolver === "function" ? presentationOrResolver(instance) : presentationOrResolver;
    if (!presentation) continue;
    const definition = definitionsById.get(instance.definitionId);
    if (!definition || definition.definitionDigest !== instance.definitionDigest) continue;
    if (!(instance.width > 0) || !(instance.height > 0)) continue;
    const image = symbolDefinitionRasterUrlV2(definition) ? getImage(definition) : null;
    const geometry = resolveStructuredSymbolGeometryV2(definition, {
      x: -instance.width / 2, y: -instance.height / 2, width: instance.width, height: instance.height,
    });
    if (!image && !geometry) continue;
    ctx.save();
    ctx.transform(...resolveSymbolInstanceMatrixV2(instance, presentation));
    if (image) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, -instance.width / 2, -instance.height / 2, instance.width, instance.height);
    }
    if (geometry) {
      ctx.strokeStyle = STRUCTURED_SYMBOL_COLOR;
      ctx.fillStyle = STRUCTURED_SYMBOL_COLOR;
      ctx.lineWidth = STRUCTURED_SYMBOL_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const limb of geometry.limbs) {
        ctx.beginPath(); ctx.moveTo(limb.start.x, limb.start.y); ctx.lineTo(limb.end.x, limb.end.y); ctx.stroke();
      }
      for (const joint of geometry.joints) {
        ctx.beginPath(); ctx.arc(joint.x, joint.y, STRUCTURED_SYMBOL_WIDTH, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    drawn += 1;
  }
  return drawn;
}

type SymbolImageEntryV2<Image> = { url: string; image: Image | null; ready: Promise<void> };

// Ready once loaded ("load" also fires in a background tab, where decode() can wait for a long time).
const loadImageElement = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("symbol_image_decode_failed"));
  image.src = url;
});

// Decoded symbol pictures, keyed by definition digest. `get` never blocks: a picture that
// is still decoding is simply skipped for that frame. `warm` decodes the whole catalog
// ahead of time (and forgets deleted symbols) so playback starts with every picture ready.
export function createSymbolImageCacheV2<Image = HTMLImageElement>(
  load: (url: string) => Promise<Image> = loadImageElement as unknown as (url: string) => Promise<Image>,
) {
  const entries = new Map<string, SymbolImageEntryV2<Image>>();
  const ensure = (definition: UnifiedBitmapSymbolDefinitionV2) => {
    const url = symbolDefinitionRasterUrlV2(definition);
    if (!url) return null;
    const existing = entries.get(definition.definitionDigest);
    if (existing && existing.url === url) return existing;
    const entry: SymbolImageEntryV2<Image> = { url, image: null, ready: Promise.resolve() };
    entries.set(definition.definitionDigest, entry);
    entry.ready = load(url).then(
      image => { if (entries.get(definition.definitionDigest) === entry) entry.image = image; },
      () => { /* A picture that cannot be decoded is not drawn (same as the overlay). */ },
    );
    return entry;
  };
  return {
    get: (definition: UnifiedBitmapSymbolDefinitionV2): Image | null => ensure(definition)?.image ?? null,
    warm: async (definitions: readonly UnifiedBitmapSymbolDefinitionV2[]) => {
      const keep = new Set(definitions.map(definition => definition.definitionDigest));
      for (const key of [...entries.keys()]) if (!keep.has(key)) entries.delete(key);
      await Promise.all(definitions.map(definition => ensure(definition)?.ready));
    },
    size: () => entries.size,
  };
}
