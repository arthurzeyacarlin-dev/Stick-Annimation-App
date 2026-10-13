import { bitmapCenterOffset } from "./unifiedStageGeometry.ts";
import { attachBitmapPaintCoverage, cropPaintCoverage, getBitmapPaintCoverage } from "./unifiedRasterPaintCoverageV1.ts";

export const AUTHORING_CANVAS_BYTE_BUDGET = 32 * 1024 * 1024;
export const AUTHORING_CANVAS_PIXEL_BUDGET = AUTHORING_CANVAS_BYTE_BUDGET / 4;
export const AUTHORING_VIEWPORT_MARGIN_PX = 96;

export type AuthoringSurfaceViewport = {
  worldLeft: number;
  worldTop: number;
  worldWidth: number;
  worldHeight: number;
  fullWorldWidth: number;
  fullWorldHeight: number;
  referenceLeft: number;
  referenceTop: number;
  referenceSpanWidth: number;
  referenceSpanHeight: number;
  referenceWidth: number;
  referenceHeight: number;
  pixelWidth: number;
  pixelHeight: number;
};

type ViewportInput = {
  hostWidth: number;
  hostHeight: number;
  worldScale: number;
  zoom: number;
  panX: number;
  panY: number;
  devicePixelRatio: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const createAuthoringSurfaceViewport = ({
  hostWidth,
  hostHeight,
  worldScale,
  zoom,
  panX,
  panY,
  devicePixelRatio,
}: ViewportInput): AuthoringSurfaceViewport => {
  const safeHostWidth = Math.max(1, hostWidth);
  const safeHostHeight = Math.max(1, hostHeight);
  const safeWorldScale = Math.max(1, worldScale);
  const safeZoom = Math.max(0.01, zoom);
  const safeDpr = Math.max(1, devicePixelRatio);
  const fullWorldWidth = safeHostWidth * safeWorldScale;
  const fullWorldHeight = safeHostHeight * safeWorldScale;
  const worldCenterX = fullWorldWidth / 2;
  const worldCenterY = fullWorldHeight / 2;
  const visibleWidth = Math.min(fullWorldWidth, safeHostWidth / safeZoom);
  const visibleHeight = Math.min(fullWorldHeight, safeHostHeight / safeZoom);
  const visibleLeft = clamp(
    worldCenterX + (-safeHostWidth / 2 - panX) / safeZoom,
    0,
    Math.max(0, fullWorldWidth - visibleWidth),
  );
  const visibleTop = clamp(
    worldCenterY + (-safeHostHeight / 2 - panY) / safeZoom,
    0,
    Math.max(0, fullWorldHeight - visibleHeight),
  );
  const margin = AUTHORING_VIEWPORT_MARGIN_PX / safeZoom;
  let worldLeft = Math.max(0, visibleLeft - margin);
  let worldTop = Math.max(0, visibleTop - margin);
  let worldRight = Math.min(fullWorldWidth, visibleLeft + visibleWidth + margin);
  let worldBottom = Math.min(fullWorldHeight, visibleTop + visibleHeight + margin);
  const referenceWidth = Math.max(1, Math.floor(fullWorldWidth * safeDpr));
  const referenceHeight = Math.max(1, Math.floor(fullWorldHeight * safeDpr));
  const referenceLeft = Math.max(0, Math.floor(worldLeft * referenceWidth / fullWorldWidth));
  const referenceTop = Math.max(0, Math.floor(worldTop * referenceHeight / fullWorldHeight));
  const referenceRight = Math.min(referenceWidth, Math.ceil(worldRight * referenceWidth / fullWorldWidth));
  const referenceBottom = Math.min(referenceHeight, Math.ceil(worldBottom * referenceHeight / fullWorldHeight));
  const referenceSpanWidth = Math.max(1, referenceRight - referenceLeft);
  const referenceSpanHeight = Math.max(1, referenceBottom - referenceTop);
  worldLeft = referenceLeft * fullWorldWidth / referenceWidth;
  worldTop = referenceTop * fullWorldHeight / referenceHeight;
  worldRight = referenceRight * fullWorldWidth / referenceWidth;
  worldBottom = referenceBottom * fullWorldHeight / referenceHeight;
  const worldWidth = Math.max(1, worldRight - worldLeft);
  const worldHeight = Math.max(1, worldBottom - worldTop);
  const desiredPixels = referenceSpanWidth * referenceSpanHeight;
  const budgetScale = desiredPixels > AUTHORING_CANVAS_PIXEL_BUDGET
    ? Math.sqrt(AUTHORING_CANVAS_PIXEL_BUDGET / desiredPixels)
    : 1;
  let pixelWidth = Math.max(1, Math.floor(referenceSpanWidth * budgetScale));
  let pixelHeight = Math.max(1, Math.floor(referenceSpanHeight * budgetScale));
  while (pixelWidth * pixelHeight > AUTHORING_CANVAS_PIXEL_BUDGET) {
    if (pixelWidth >= pixelHeight) pixelWidth -= 1;
    else pixelHeight -= 1;
  }

  return {
    worldLeft,
    worldTop,
    worldWidth,
    worldHeight,
    fullWorldWidth,
    fullWorldHeight,
    referenceLeft,
    referenceTop,
    referenceSpanWidth,
    referenceSpanHeight,
    referenceWidth,
    referenceHeight,
    pixelWidth,
    pixelHeight,
  };
};

const canvasViewports = new WeakMap<HTMLCanvasElement, AuthoringSurfaceViewport>();
const bitmapCanvases = new WeakMap<ImageData, HTMLCanvasElement>();
const mutablePatchCanvases = new WeakMap<ImageData, HTMLCanvasElement>();

export const setAuthoringSurfaceViewport = (canvas: HTMLCanvasElement, viewport: AuthoringSurfaceViewport) => {
  canvasViewports.set(canvas, viewport);
};

export const getAuthoringSurfaceViewport = (canvas: HTMLCanvasElement | null | undefined) =>
  canvas ? canvasViewports.get(canvas) ?? null : null;

const bitmapCanvas = (bitmap: ImageData) => {
  let canvas = bitmapCanvases.get(bitmap);
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(bitmap, 0, 0);
  bitmapCanvases.set(bitmap, canvas);
  return canvas;
};

export const drawRasterBitmapToAuthoringSurface = (
  ctx: CanvasRenderingContext2D,
  bitmap: ImageData,
  viewport: AuthoringSurfaceViewport,
) => {
  const source = bitmapCanvas(bitmap);
  if (!source) return;
  const scaleX = ctx.canvas.width / viewport.referenceSpanWidth;
  const scaleY = ctx.canvas.height / viewport.referenceSpanHeight;
  const left = bitmapCenterOffset(viewport.referenceWidth, bitmap.width);
  const top = bitmapCenterOffset(viewport.referenceHeight, bitmap.height);
  const targetLeft = (left - viewport.referenceLeft) * scaleX;
  const targetTop = (top - viewport.referenceTop) * scaleY;
  if (
    Math.abs(scaleX - 1) <= 1e-6 && Math.abs(scaleY - 1) <= 1e-6 &&
    Number.isInteger(targetLeft) && Number.isInteger(targetTop)
  ) {
    ctx.putImageData(bitmap, targetLeft, targetTop);
    return;
  }
  ctx.drawImage(
    source,
    targetLeft,
    targetTop,
    bitmap.width * scaleX,
    bitmap.height * scaleY,
  );
};

export const drawReferencePatchToAuthoringSurface = (
  ctx: CanvasRenderingContext2D,
  patch: ImageData,
  left: number,
  top: number,
  viewport: AuthoringSurfaceViewport,
) => {
  const scaleX = ctx.canvas.width / viewport.referenceSpanWidth;
  const scaleY = ctx.canvas.height / viewport.referenceSpanHeight;
  const targetLeft = (left - viewport.referenceLeft) * scaleX;
  const targetTop = (top - viewport.referenceTop) * scaleY;
  if (
    Math.abs(scaleX - 1) <= 1e-6 && Math.abs(scaleY - 1) <= 1e-6 &&
    Number.isInteger(targetLeft) && Number.isInteger(targetTop)
  ) {
    ctx.putImageData(patch, targetLeft, targetTop);
    return;
  }

  // Brush preview tiles are mutated in place for every pointer sample. They
  // cannot use bitmapCanvas(), whose cache is only safe for immutable saved
  // bitmaps; doing so redraws the first stale tile and breaks strokes into
  // gaps and blobs. Reuse the temporary canvas, but refresh its pixels.
  let source = mutablePatchCanvases.get(patch);
  if (!source) {
    source = document.createElement("canvas");
    source.width = patch.width;
    source.height = patch.height;
    mutablePatchCanvases.set(patch, source);
  }
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return;
  sourceCtx.putImageData(patch, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6;
  if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    targetLeft,
    targetTop,
    patch.width * scaleX,
    patch.height * scaleY,
  );
  ctx.restore();
};

export const authoringSurfaceWorldTransform = (
  ctx: CanvasRenderingContext2D,
  viewport: AuthoringSurfaceViewport,
) => {
  const scaleX = ctx.canvas.width / viewport.worldWidth;
  const scaleY = ctx.canvas.height / viewport.worldHeight;
  ctx.setTransform(scaleX, 0, 0, scaleY, -viewport.worldLeft * scaleX, -viewport.worldTop * scaleY);
};

export const renderRasterBitmapsToAuthoringSurface = (
  canvas: HTMLCanvasElement | null,
  bitmaps: ReadonlyArray<ImageData | null>,
) => {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const viewport = getAuthoringSurfaceViewport(canvas);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!viewport) {
    for (const bitmap of bitmaps) {
      if (!bitmap) continue;
      ctx.putImageData(bitmap, bitmapCenterOffset(canvas.width, bitmap.width), bitmapCenterOffset(canvas.height, bitmap.height));
    }
    ctx.restore();
    return;
  }

  const scaleX = canvas.width / viewport.referenceSpanWidth;
  const scaleY = canvas.height / viewport.referenceSpanHeight;
  ctx.imageSmoothingEnabled = Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6;
  if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = "high";
  for (const bitmap of bitmaps) {
    if (!bitmap) continue;
    drawRasterBitmapToAuthoringSurface(ctx, bitmap, viewport);
  }
  ctx.restore();
};

export const projectRasterCoverageToAuthoringSurface = (
  canvas: HTMLCanvasElement,
  bitmap: ImageData | null | undefined,
) => {
  const viewport = getAuthoringSurfaceViewport(canvas);
  const coverage = getBitmapPaintCoverage(bitmap);
  if (!viewport || !bitmap || !coverage) return null;
  const scaleX = canvas.width / viewport.referenceSpanWidth;
  const scaleY = canvas.height / viewport.referenceSpanHeight;
  if (Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6) return null;
  const bitmapLeft = bitmapCenterOffset(viewport.referenceWidth, bitmap.width);
  const bitmapTop = bitmapCenterOffset(viewport.referenceHeight, bitmap.height);
  return cropPaintCoverage(
    coverage,
    viewport.referenceLeft - bitmapLeft,
    viewport.referenceTop - bitmapTop,
    canvas.width,
    canvas.height,
  );
};

export const captureAuthoringSurfaceReferencePatch = (canvas: HTMLCanvasElement) => {
  const viewport = getAuthoringSurfaceViewport(canvas);
  const ctx = canvas.getContext("2d");
  if (!viewport || !ctx) return null;
  // At normal editing zoom this is a byte-exact crop of the legacy authoring
  // stage. At a very wide zoom, brush tiles still save exactly, but a command
  // that needs a full readback must wait until the view is closer.
  if (canvas.width !== viewport.referenceSpanWidth || canvas.height !== viewport.referenceSpanHeight) return null;
  const bitmap = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const coverage = getBitmapPaintCoverage(canvas);
  if (coverage) attachBitmapPaintCoverage(bitmap, coverage);
  return {
    bitmap,
    rect: {
      left: viewport.referenceLeft,
      top: viewport.referenceTop,
      width: canvas.width,
      height: canvas.height,
    },
    reference: { width: viewport.referenceWidth, height: viewport.referenceHeight },
  };
};
