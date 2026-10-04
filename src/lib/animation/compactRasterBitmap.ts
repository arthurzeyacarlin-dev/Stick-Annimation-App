import { bitmapCenterOffset } from "./unifiedStageGeometry.ts";
import { attachBitmapPaintCoverage, cropPaintCoverage, getBitmapPaintCoverage, type UnifiedRasterPaintCoverageV1 } from "./unifiedRasterPaintCoverageV1.ts";

// SPEC-0017 compact frames.
// A frame picture used to be the full "authoring world" size (about 21x the visible page).
// A compact picture is the smallest box, centered on the same middle point, that holds every
// painted pixel. Because the editor always draws frame pictures centered, a compact picture
// shows in exactly the same place. Each compact picture remembers the full size it stands for
// ("reference size") so saving and export see exactly what they saw before.

export type RasterSize = { width: number; height: number };

const referenceSizes = new WeakMap<object, RasterSize>();

export const getRasterReferenceSize = (bitmap: object | null | undefined): RasterSize | null =>
  bitmap ? referenceSizes.get(bitmap) ?? null : null;

export const setRasterReferenceSize = <T extends { width: number; height: number }>(bitmap: T, reference: RasterSize | null | undefined): T => {
  if (reference && (reference.width > bitmap.width || reference.height > bitmap.height)) {
    referenceSizes.set(bitmap, { width: Math.max(reference.width, bitmap.width), height: Math.max(reference.height, bitmap.height) });
  } else {
    referenceSizes.delete(bitmap);
  }
  return bitmap;
};

export const copyRasterReferenceSize = <T extends { width: number; height: number }>(source: object | null | undefined, target: T): T =>
  setRasterReferenceSize(target, getRasterReferenceSize(source));

// Full size a picture stands for: its reference size if it is compact, otherwise its own size.
export const resolveRasterReferenceSize = (bitmap: { width: number; height: number }): RasterSize =>
  getRasterReferenceSize(bitmap) ?? { width: bitmap.width, height: bitmap.height };

// Smallest centered length that holds [start, end) inside a full length.
const centeredLength = (full: number, start: number, end: number) => {
  const middle = Math.floor(full / 2);
  const half = Math.max(1, middle - start, end - middle);
  return Math.min(full, half * 2);
};

// Where the compact box starts, measured in full-size pixels (matches bitmapCenterOffset placement).
export const compactOrigin = (full: number, compact: number) => bitmapCenterOffset(full, compact);

type CropSource = {
  width: number; height: number; data: Uint8ClampedArray; x: number; y: number;
  reference: RasterSize; paintCoverage?: UnifiedRasterPaintCoverageV1 | null;
};

// Builds a compact centered picture from a cropped area of a full-size picture.
export function compactRasterFromCrop(source: CropSource): ImageData {
  const { reference } = source;
  let left = source.x, top = source.y, right = source.x + source.width, bottom = source.y + source.height;
  // Brush history must survive too, so the box also covers every brush-history tile.
  for (const tile of source.paintCoverage?.tiles ?? []) {
    left = Math.min(left, tile.x); top = Math.min(top, tile.y);
    right = Math.max(right, Math.min(reference.width, tile.x + 32)); bottom = Math.max(bottom, Math.min(reference.height, tile.y + 32));
  }
  const width = centeredLength(reference.width, left, right);
  const height = centeredLength(reference.height, top, bottom);
  const originX = compactOrigin(reference.width, width), originY = compactOrigin(reference.height, height);
  const out = new ImageData(width, height);
  for (let row = 0; row < source.height; row += 1) {
    out.data.set(source.data.subarray(row * source.width * 4, (row + 1) * source.width * 4), ((source.y - originY + row) * width + (source.x - originX)) * 4);
  }
  if (source.paintCoverage) attachBitmapPaintCoverage(out, cropPaintCoverage(source.paintCoverage, originX, originY, width, height));
  return setRasterReferenceSize(out, reference);
}

// Shrinks a picture (full-size or already compact) to its smallest centered box. Lossless.
export function compactRaster(bitmap: ImageData): ImageData {
  const reference = resolveRasterReferenceSize(bitmap);
  const { width, height, data } = bitmap;
  let left = width, top = height, right = -1, bottom = -1;
  const words = new Uint32Array(data.buffer, data.byteOffset, width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let first = -1, last = -1;
    for (let x = 0; x < width; x += 1) if (words[row + x] !== 0) { first = x; break; }
    if (first < 0) continue;
    for (let x = width - 1; x >= first; x -= 1) if (words[row + x] !== 0) { last = x; break; }
    left = Math.min(left, first); right = Math.max(right, last);
    top = Math.min(top, y); bottom = y;
  }
  // Position of this picture inside its reference size (it is itself centered there).
  const baseX = compactOrigin(reference.width, width), baseY = compactOrigin(reference.height, height);
  const coverage = getBitmapPaintCoverage(bitmap);
  const hasPaint = right >= left;
  const cropLeft = hasPaint ? left : Math.floor(width / 2), cropTop = hasPaint ? top : Math.floor(height / 2);
  const cropWidth = hasPaint ? right - left + 1 : 0, cropHeight = hasPaint ? bottom - top + 1 : 0;
  const crop = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let row = 0; row < cropHeight; row += 1) {
    const start = ((cropTop + row) * width + cropLeft) * 4;
    crop.set(data.subarray(start, start + cropWidth * 4), row * cropWidth * 4);
  }
  const compact = compactRasterFromCrop({
    width: cropWidth, height: cropHeight, data: crop, x: baseX + cropLeft, y: baseY + cropTop, reference,
    paintCoverage: coverage ? cropPaintCoverage(coverage, -baseX, -baseY, reference.width, reference.height) : null,
  });
  return compact.width === width && compact.height === height && !coverage ? bitmap : compact;
}

// Puts a compact picture back into its full reference size (for code that needs the full size).
export function expandRaster(bitmap: ImageData): ImageData {
  const reference = getRasterReferenceSize(bitmap);
  if (!reference) return bitmap;
  const out = new ImageData(reference.width, reference.height);
  const x = compactOrigin(reference.width, bitmap.width), y = compactOrigin(reference.height, bitmap.height);
  for (let row = 0; row < bitmap.height; row += 1) {
    out.data.set(bitmap.data.subarray(row * bitmap.width * 4, (row + 1) * bitmap.width * 4), ((y + row) * reference.width + x) * 4);
  }
  const coverage = getBitmapPaintCoverage(bitmap);
  if (coverage) attachBitmapPaintCoverage(out, cropPaintCoverage(coverage, -x, -y, reference.width, reference.height));
  return out;
}
