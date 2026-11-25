import { AUTHORED_STAGE, bitmapCenterOffset } from "./unifiedStageGeometry.ts";
import { rasterInSpace } from "./compactRasterBitmap.ts";
import { attachBitmapPaintCoverage, cropPaintCoverage, getBitmapPaintCoverage } from "./unifiedRasterPaintCoverageV1.ts";
import { framePixels } from "./framePictureStore.ts";

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

// hostWidth x hostHeight: the page (the 16:9 stage as shown on screen, CSS pixels). viewWidth x viewHeight: the whole
// canvas area around it that can be seen (same middle point); left out = the page itself.
type ViewportInput = {
  hostWidth: number;
  hostHeight: number;
  viewWidth?: number;
  viewHeight?: number;
  worldScale: number;
  zoom: number;
  panX: number;
  panY: number;
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
  viewWidth,
  viewHeight,
}: ViewportInput): AuthoringSurfaceViewport => {
  const safeHostWidth = Math.max(1, hostWidth);
  const safeHostHeight = Math.max(1, hostHeight);
  const safeWorldScale = Math.max(1, worldScale);
  const safeZoom = Math.max(0.01, zoom);
  const safeViewWidth = Math.max(safeHostWidth, viewWidth ?? 0);
  const safeViewHeight = Math.max(safeHostHeight, viewHeight ?? 0);
  const fullWorldWidth = safeHostWidth * safeWorldScale;
  const fullWorldHeight = safeHostHeight * safeWorldScale;
  const worldCenterX = fullWorldWidth / 2;
  const worldCenterY = fullWorldHeight / 2;
  const visibleWidth = Math.min(fullWorldWidth, safeViewWidth / safeZoom);
  const visibleHeight = Math.min(fullWorldHeight, safeViewHeight / safeZoom);
  const visibleLeft = clamp(
    worldCenterX + (-safeViewWidth / 2 - panX) / safeZoom,
    0,
    Math.max(0, fullWorldWidth - visibleWidth),
  );
  const visibleTop = clamp(
    worldCenterY + (-safeViewHeight / 2 - panY) / safeZoom,
    0,
    Math.max(0, fullWorldHeight - visibleHeight),
  );
  // THE STAGE PIXEL SPACE: the drawing world is always the same pixels (the 1920x1080 stage x the world scale),
  // whatever the window size or the screen's sharpness. The screen only scales how it is shown.
  const referenceWidth = Math.round(AUTHORED_STAGE.width * safeWorldScale);
  const referenceHeight = Math.round(AUTHORED_STAGE.height * safeWorldScale);
  const spanWith = (margin: number) => {
    const left = Math.max(0, visibleLeft - margin), top = Math.max(0, visibleTop - margin);
    const right = Math.min(fullWorldWidth, visibleLeft + visibleWidth + margin), bottom = Math.min(fullWorldHeight, visibleTop + visibleHeight + margin);
    // (Nov 24, lag) The window starts on the brush history's 32-pixel grid (at most 31 pixels more margin on the left and
    // top). Off the grid, the brush history of the whole picture was rebuilt pixel by pixel after every single stroke to
    // fit the window (measured: a quarter of a second of frozen page per stroke); on the grid its tiles are used as they are.
    const gridStart = (value: number) => value - value % 32;
    const referenceLeft = gridStart(Math.max(0, Math.floor(left * referenceWidth / fullWorldWidth)));
    const referenceTop = gridStart(Math.max(0, Math.floor(top * referenceHeight / fullWorldHeight)));
    const referenceRight = Math.min(referenceWidth, Math.ceil(right * referenceWidth / fullWorldWidth));
    const referenceBottom = Math.min(referenceHeight, Math.ceil(bottom * referenceHeight / fullWorldHeight));
    return { referenceLeft, referenceTop, referenceRight, referenceBottom };
  };
  // The margin around what is seen is a comfort for panning. Where the exact canvas would not fit the memory budget
  // with it (a small or tall screen shows a lot of the world), it is given up first, so drawing stays exact.
  let span = spanWith(AUTHORING_VIEWPORT_MARGIN_PX / safeZoom);
  if ((span.referenceRight - span.referenceLeft) * (span.referenceBottom - span.referenceTop) > AUTHORING_CANVAS_PIXEL_BUDGET) span = spanWith(0);
  const { referenceLeft, referenceTop, referenceRight, referenceBottom } = span;
  const referenceSpanWidth = Math.max(1, referenceRight - referenceLeft);
  const referenceSpanHeight = Math.max(1, referenceBottom - referenceTop);
  const worldLeft = referenceLeft * fullWorldWidth / referenceWidth;
  const worldTop = referenceTop * fullWorldHeight / referenceHeight;
  const worldRight = referenceRight * fullWorldWidth / referenceWidth;
  const worldBottom = referenceBottom * fullWorldHeight / referenceHeight;
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

const bitmapCanvas = (picture: ImageData) => {
  // (light memory) a packed picture is drawn from its unpacked stand-in; its ready-made canvas lives as long as that stand-in
  const bitmap = framePixels(picture);
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
  picture: ImageData,
  viewport: AuthoringSurfaceViewport,
) => {
  // (a picture saved in another pixel space is shown - and from here on edited - in the stage pixel space)
  const bitmap = rasterInSpace(picture, { width: viewport.referenceWidth, height: viewport.referenceHeight });
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
    ctx.putImageData(framePixels(bitmap), targetLeft, targetTop);
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
      ctx.putImageData(framePixels(bitmap), bitmapCenterOffset(canvas.width, bitmap.width), bitmapCenterOffset(canvas.height, bitmap.height));
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
  picture: ImageData | null | undefined,
) => {
  const viewport = getAuthoringSurfaceViewport(canvas);
  const bitmap = viewport ? rasterInSpace(picture, { width: viewport.referenceWidth, height: viewport.referenceHeight }) : picture;
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
