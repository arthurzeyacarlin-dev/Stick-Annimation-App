import { drawScaledDrawingTextObject, type DrawingTextObject } from "@/src/components/workspace/drawingText";
import type { UnifiedAnimationItemV2, UnifiedRasterBitmapV2 } from "@/src/lib/animation/unifiedAnimationContentV2";
import type { UnifiedAnimationProjectV2, UnifiedBitmapSymbolDefinitionV2 } from "@/src/lib/animation/unifiedAnimationContractV2";
import {
  EXPORT_AUTHORING_WORLD_SCALE,
  resolveExportOwnerCell,
  resolveExportRasterPlacement,
  type ExportRasterPlacement,
} from "./exportPhase1";
import { resolveExportRasterTransform, resolveUniformContainTransform } from "./exportContracts";

export const DEFAULT_PROJECT_BACKGROUND = "#ffffff" as const;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

const loadSymbolImage = (definition: UnifiedBitmapSymbolDefinitionV2) => {
  const cached = imageCache.get(definition.definitionDigest);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("export_symbol_decode_failed"));
    image.src = definition.pngDataUrl;
  });
  imageCache.set(definition.definitionDigest, pending);
  return pending;
};

const createBitmapCanvas = (bitmap: UnifiedRasterBitmapV2) => {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("export_canvas_unavailable");
  context.putImageData(new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height), 0, 0);
  return canvas;
};

const drawBitmap = (
  context: CanvasRenderingContext2D,
  placement: ExportRasterPlacement,
  outputWidth: number,
  outputHeight: number,
) => {
  const source = createBitmapCanvas(placement.bitmap);
  const transform = resolveExportRasterTransform(
    outputWidth,
    outputHeight,
    placement.referenceWidth,
    placement.referenceHeight,
    EXPORT_AUTHORING_WORLD_SCALE,
  );
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    transform.offsetX + placement.x * transform.scaleX,
    transform.offsetY + placement.y * transform.scaleY,
    placement.bitmap.width * transform.scaleX,
    placement.bitmap.height * transform.scaleY,
  );
};

const asDrawingText = (item: UnifiedAnimationItemV2): DrawingTextObject | null => {
  if (item.kind !== "drawing-text/v1") return null;
  const supported = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New"] as const;
  return {
    id: item.itemId,
    text: item.text,
    x: item.x,
    y: item.y,
    width: item.width,
    flipX: item.flipX,
    flipY: item.flipY,
    rotation: item.rotation,
    fontFamily: supported.includes(item.fontFamily as (typeof supported)[number])
      ? item.fontFamily as (typeof supported)[number]
      : "Arial",
    fontSize: item.fontSize,
    color: item.color,
    bold: item.bold,
    italic: item.italic,
  };
};

export const resolveProjectBackground = (project: UnifiedAnimationProjectV2) =>
  project.document.background?.color ?? DEFAULT_PROJECT_BACKGROUND;

export async function renderCanonicalExportFrame(
  canvas: HTMLCanvasElement,
  project: UnifiedAnimationProjectV2,
  frameIndex: number,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("export_canvas_unavailable");
  const stage = project.document.logicalStage;
  const stageTransform = resolveUniformContainTransform(canvas.width, canvas.height, stage.width, stage.height);

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = resolveProjectBackground(project);
  context.fillRect(0, 0, canvas.width, canvas.height);

  const definitions = new Map(project.document.catalogs.symbols.map(definition => [definition.definitionId, definition]));
  const layers = [...project.document.layers]
    .filter(layer => layer.visible)
    .sort((left, right) => right.orderIndex - left.orderIndex);

  for (const layer of layers) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    const frame = layer.cells[frameIndex] ?? null;
    const owner = resolveExportOwnerCell(layer, frameIndex);
    if (!frame || !owner?.content) continue;
    const firstRaster = owner.content.items.find(item => item.kind === "drawing-raster/v1");
    const rasterPlacement = firstRaster?.kind === "drawing-raster/v1"
      ? resolveExportRasterPlacement(layer, frameIndex, firstRaster)
      : null;
    const rasterReference = rasterPlacement ?? (firstRaster?.kind === "drawing-raster/v1" && firstRaster.motionTween
      ? { referenceWidth: firstRaster.motionTween.stageWidth, referenceHeight: firstRaster.motionTween.stageHeight }
      : firstRaster?.kind === "drawing-raster/v1" && firstRaster.bitmap
        ? {
            referenceWidth: firstRaster.bitmap.stageWidth ?? firstRaster.bitmap.width,
            referenceHeight: firstRaster.bitmap.stageHeight ?? firstRaster.bitmap.height,
          }
        : null);

    for (const item of owner.content.items) {
      if (item.kind === "drawing-raster/v1") {
        const placement = item === firstRaster ? rasterPlacement : resolveExportRasterPlacement(layer, frameIndex, item);
        if (placement) {
          drawBitmap(context, placement, canvas.width, canvas.height);
        }
        continue;
      }
      if (item.kind === "drawing-text/v1") {
        const text = asDrawingText(item);
        if (text) {
          const transform = rasterReference
            ? resolveExportRasterTransform(
                canvas.width,
                canvas.height,
                rasterReference.referenceWidth,
                rasterReference.referenceHeight,
                EXPORT_AUTHORING_WORLD_SCALE,
              )
            : stageTransform;
          drawScaledDrawingTextObject(context, text, transform);
        }
        continue;
      }
      if (item.kind === "symbol-instance/v1") {
        const definition = definitions.get(item.definitionId);
        if (!definition || definition.definitionDigest !== item.definitionDigest) throw new Error("export_symbol_definition_missing");
        const image = await loadSymbolImage(definition);
        const width = item.width * stageTransform.scaleX;
        const height = item.height * stageTransform.scaleY;
        const x = stageTransform.offsetX + item.x * stageTransform.scaleX;
        const y = stageTransform.offsetY + item.y * stageTransform.scaleY;
        context.save();
        context.imageSmoothingEnabled = true;
        context.translate(x + width / 2, y + height / 2);
        context.rotate((item.rotation * Math.PI) / 180);
        context.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
        continue;
      }
      throw new Error("export_unsupported_item");
    }
  }
  context.restore();
}
