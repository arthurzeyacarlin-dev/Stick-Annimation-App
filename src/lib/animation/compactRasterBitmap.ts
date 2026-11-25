import { bitmapCenterOffset, pixelSpaceScale, samePixelSpace } from "./unifiedStageGeometry.ts";
import { attachBitmapPaintCoverage, cropPaintCoverage, getBitmapPaintCoverage, patchPaintCoverage, type UnifiedRasterPaintCoverageV1 } from "./unifiedRasterPaintCoverageV1.ts";
import { framePixels } from "./framePictureStore.ts";

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

// (Nov 24, lag) The same, for a picture that carries brush history: the box also STARTS on the brush history's 32-pixel
// grid (it gets at most 31 clear pixels bigger on each side). Brush history is kept in 32-pixel tiles; with the box on
// that grid the tiles are carried over as they are. Off the grid, every stroke had to rebuild the brush history of the
// whole picture pixel by pixel, several times (measured: 0.35 s of frozen page per stroke on a full drawing).
const TILE = 32;
const centeredLengthOnGrid = (full: number, start: number, end: number) => {
  const middle = Math.floor(full / 2);
  const needed = Math.max(1, middle - start, end - middle);
  const half = needed + (((middle - needed) % TILE) + TILE) % TILE;
  return half * 2 >= full ? full : half * 2;
};

// The alpha byte of a pixel read as one 32-bit word (whatever the computer's byte order).
const ALPHA_MASK = new Uint32Array(new Uint8Array([0, 0, 0, 255]).buffer)[0];

// (Nov 14) The smallest box that holds every pixel that is not fully clear (alpha > 0); null = nothing painted.
// The save path asks this for every frame picture of the project, on the page's own thread, so it reads one whole
// pixel at a time and, inside the painted rows, only each row's two ends as far as the box found so far.
export function paintedBounds(data: Uint8ClampedArray, width: number, height: number): { left: number; top: number; width: number; height: number } | null {
  const total = width * height;
  const words = data.byteOffset % 4 === 0 ? new Uint32Array(data.buffer, data.byteOffset, total) : new Uint32Array(data.slice(0, total * 4).buffer);
  let first = 0;
  while (first < total && (words[first] & ALPHA_MASK) === 0) first += 1;
  if (first === total) return null;
  let last = total - 1;
  while ((words[last] & ALPHA_MASK) === 0) last -= 1;
  const top = Math.floor(first / width), bottom = Math.floor(last / width);
  let left = width, right = -1;
  for (let y = top; y <= bottom; y += 1) {
    const row = y * width;
    let x = 0;
    while (x < left && (words[row + x] & ALPHA_MASK) === 0) x += 1;
    left = x;
    x = width - 1;
    while (x > right && (words[row + x] & ALPHA_MASK) === 0) x -= 1;
    right = x;
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

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
  const length = source.paintCoverage ? centeredLengthOnGrid : centeredLength;
  const width = length(reference.width, left, right);
  const height = length(reference.height, top, bottom);
  const originX = compactOrigin(reference.width, width), originY = compactOrigin(reference.height, height);
  const out = new ImageData(width, height);
  for (let row = 0; row < source.height; row += 1) {
    out.data.set(source.data.subarray(row * source.width * 4, (row + 1) * source.width * 4), ((source.y - originY + row) * width + (source.x - originX)) * 4);
  }
  if (source.paintCoverage) attachBitmapPaintCoverage(out, cropPaintCoverage(source.paintCoverage, originX, originY, width, height));
  return setRasterReferenceSize(out, reference);
}

// ---- ONE PIXEL SPACE (Nov 23) ---------------------------------------------------------------------------------------
// A picture's "reference size" is also the pixel space its pixels are in. New pictures are all in the stage pixel space
// (unifiedStageGeometry.ts). A picture saved before that is in the space of the screen it was made on. Such a picture is
// never laid into another space pixel for pixel (that was the bug: it changed size and place). Whoever reads or changes
// a picture says which space it works in, and gets the picture IN that space: the same picture, the same size and place
// on the stage, drawn with that space's pixels. A picture nobody changes keeps its own saved pixels untouched.

// For every target pixel along one axis: which source pixels it reads, and how much of each (a tent as wide as one
// target pixel; pixels outside the picture count as clear).
const axisTaps = (sourceStart: number, sourceLength: number, targetStart: number, targetLength: number, sourceMiddle: number, targetMiddle: number, scale: number) => {
  const radius = Math.max(1, 1 / scale), most = Math.ceil(radius * 2) + 2;
  const first = new Int32Array(targetLength), count = new Int32Array(targetLength), weights = new Float32Array(targetLength * most);
  for (let index = 0; index < targetLength; index += 1) {
    const center = sourceMiddle + (targetStart + index + 0.5 - targetMiddle) / scale;
    let total = 0, taken = 0, begin = 0;
    for (let source = Math.floor(center - radius); source <= Math.ceil(center + radius); source += 1) {
      const weight = 1 - Math.abs(source + 0.5 - center) / radius;
      if (weight <= 1e-9) continue;
      total += weight;
      const local = source - sourceStart;
      if (local < 0 || local >= sourceLength) continue;
      if (taken === 0) begin = local;
      weights[index * most + taken] = weight;
      taken += 1;
    }
    first[index] = begin; count[index] = taken;
    if (total > 0) for (let tap = 0; tap < taken; tap += 1) weights[index * most + tap] /= total;
  }
  return { first, count, weights, most };
};

// The painted box of a picture, drawn again in another space (same middle point, `scale` target pixels per source pixel).
// `box` is where the box sits in its own space. Returns the new box and where it sits in the target space.
export function resampleRasterBox(
  data: Uint8ClampedArray, box: { left: number; top: number; width: number; height: number },
  from: RasterSize, to: RasterSize, scale: number,
): { data: Uint8ClampedArray; left: number; top: number; width: number; height: number } {
  const place = (start: number, end: number, fromLength: number, toLength: number) => {
    const low = Math.max(0, Math.floor(toLength / 2 + (start - fromLength / 2) * scale + 1e-6));
    const high = Math.min(toLength, Math.ceil(toLength / 2 + (end - fromLength / 2) * scale - 1e-6));
    return { low, length: Math.max(0, high - low) };
  };
  const across = place(box.left, box.left + box.width, from.width, to.width), down = place(box.top, box.top + box.height, from.height, to.height);
  const width = across.length, height = down.length;
  const out = new Uint8ClampedArray(width * height * 4);
  if (!width || !height || !box.width || !box.height) return { data: out, left: across.low, top: down.low, width, height };
  const xs = axisTaps(box.left, box.width, across.low, width, from.width / 2, to.width / 2, scale);
  const ys = axisTaps(box.top, box.height, down.low, height, from.height / 2, to.height / 2, scale);
  // across first (colours weighted by how solid they are, so a clear neighbour never darkens an edge), then down
  const rows = new Float32Array(width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const sourceRow = y * box.width * 4, targetRow = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      const base = x * xs.most, start = sourceRow + xs.first[x] * 4;
      for (let tap = 0; tap < xs.count[x]; tap += 1) {
        const at = start + tap * 4, alpha = data[at + 3];
        if (alpha === 0) continue;
        const weight = xs.weights[base + tap] * alpha;
        r += data[at] * weight; g += data[at + 1] * weight; b += data[at + 2] * weight; a += weight;
      }
      const to4 = targetRow + x * 4;
      rows[to4] = r; rows[to4 + 1] = g; rows[to4 + 2] = b; rows[to4 + 3] = a;
    }
  }
  for (let y = 0; y < height; y += 1) {
    const base = y * ys.most, firstRow = ys.first[y], taps = ys.count[y];
    for (let x = 0; x < width; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let tap = 0; tap < taps; tap += 1) {
        const at = ((firstRow + tap) * width + x) * 4, weight = ys.weights[base + tap];
        r += rows[at] * weight; g += rows[at + 1] * weight; b += rows[at + 2] * weight; a += rows[at + 3] * weight;
      }
      if (a < 0.5) continue;
      const to4 = (y * width + x) * 4;
      out[to4] = r / a; out[to4 + 1] = g / a; out[to4 + 2] = b / a; out[to4 + 3] = a;   // (the array rounds to the nearest whole value)
    }
  }
  return { data: out, left: across.low, top: down.low, width, height };
}

// The few pictures last asked for in another space (the frame on the canvas, its neighbours): asking again is free and
// gives the very same picture. Kept small on purpose - a picture drawn again is as big as a frame picture.
const SPACE_CACHE_BYTES = 96 * 1024 * 1024;
type SpaceCacheEntry = { source: object; width: number; height: number; picture: ImageData };
const spaceCache: SpaceCacheEntry[] = ((globalThis as { __diamondRasterSpaceCache?: SpaceCacheEntry[] }).__diamondRasterSpaceCache ??= []);

type PixelPicture = { width: number; height: number; data: Uint8ClampedArray };

// The space a picture's pixels are in, when it is known to differ from full size (a compact picture). null = the picture
// is as big as its space, or was made by the caller in the caller's own space.
export const rasterSpaceOf = (bitmap: object | null | undefined): RasterSize | null => getRasterReferenceSize(bitmap);

// The picture in `space`. A picture already in that space (every picture made since Nov 23) is returned as it is.
export function rasterInSpace<T extends PixelPicture>(bitmap: T, space: RasterSize): T | ImageData;
export function rasterInSpace<T extends PixelPicture>(bitmap: T | null | undefined, space: RasterSize): T | ImageData | null;
export function rasterInSpace<T extends PixelPicture>(bitmap: T | null | undefined, space: RasterSize): T | ImageData | null {
  if (!bitmap) return null;
  const own = rasterSpaceOf(bitmap);
  if (!own || samePixelSpace(own, space)) return bitmap;
  const cachedAt = spaceCache.findIndex((entry) => entry.source === bitmap && entry.width === space.width && entry.height === space.height);
  if (cachedAt >= 0) {
    const [entry] = spaceCache.splice(cachedAt, 1);
    spaceCache.push(entry);
    return entry.picture;
  }
  const pixels = framePixels(bitmap as unknown as ImageData).data;
  const painted = paintedBounds(pixels, bitmap.width, bitmap.height);
  let picture: ImageData;
  if (!painted) {
    picture = compactRasterFromCrop({ width: 0, height: 0, data: new Uint8ClampedArray(0), x: Math.floor(space.width / 2), y: Math.floor(space.height / 2), reference: space });
  } else {
    const crop = new Uint8ClampedArray(painted.width * painted.height * 4);
    for (let row = 0; row < painted.height; row += 1) {
      const start = ((painted.top + row) * bitmap.width + painted.left) * 4;
      crop.set(pixels.subarray(start, start + painted.width * 4), row * painted.width * 4);
    }
    const box = { left: compactOrigin(own.width, bitmap.width) + painted.left, top: compactOrigin(own.height, bitmap.height) + painted.top, width: painted.width, height: painted.height };
    const drawn = resampleRasterBox(crop, box, own, space, pixelSpaceScale(own, space));
    picture = compactRasterFromCrop({ width: drawn.width, height: drawn.height, data: drawn.data, x: drawn.left, y: drawn.top, reference: space });
  }
  spaceCache.push({ source: bitmap, width: space.width, height: space.height, picture });
  let held = spaceCache.reduce((sum, entry) => sum + entry.picture.data.byteLength, 0);
  while (spaceCache.length > 1 && held > SPACE_CACHE_BYTES) held -= spaceCache.shift()!.picture.data.byteLength;
  return picture;
}

// Where a picture's own box sits in `space`, without drawing it again (for showing it: the screen scales it).
export function rasterBoxInSpace(bitmap: { width: number; height: number }, space: RasterSize): { left: number; top: number; width: number; height: number } {
  const own = rasterSpaceOf(bitmap);
  if (!own || samePixelSpace(own, space)) {
    return { left: bitmapCenterOffset(space.width, bitmap.width), top: bitmapCenterOffset(space.height, bitmap.height), width: bitmap.width, height: bitmap.height };
  }
  const scale = pixelSpaceScale(own, space);
  return {
    left: space.width / 2 + (compactOrigin(own.width, bitmap.width) - own.width / 2) * scale,
    top: space.height / 2 + (compactOrigin(own.height, bitmap.height) - own.height / 2) * scale,
    width: bitmap.width * scale, height: bitmap.height * scale,
  };
}

// A FULL-SIZE picture (as big as the space it was saved in) in `space`, full size again. Only a motion tween's pictures
// are kept full size; they are few, so a project saved on an older screen gets them drawn in the stage pixel space once,
// when it opens. (Brush history is measured in the old pixels and is not carried over.)
export function fullRasterInSpace<T extends PixelPicture>(picture: T, space: RasterSize): T | PixelPicture {
  const own = { width: picture.width, height: picture.height };
  if (samePixelSpace(own, space)) return picture;
  const out = { width: space.width, height: space.height, data: new Uint8ClampedArray(space.width * space.height * 4) };
  const painted = paintedBounds(picture.data, picture.width, picture.height);
  if (!painted) return out;
  const crop = new Uint8ClampedArray(painted.width * painted.height * 4);
  for (let row = 0; row < painted.height; row += 1) {
    const start = ((painted.top + row) * picture.width + painted.left) * 4;
    crop.set(picture.data.subarray(start, start + painted.width * 4), row * painted.width * 4);
  }
  const drawn = resampleRasterBox(crop, painted, own, space, pixelSpaceScale(own, space));
  for (let row = 0; row < drawn.height; row += 1) {
    out.data.set(drawn.data.subarray(row * drawn.width * 4, (row + 1) * drawn.width * 4), ((drawn.top + row) * space.width + drawn.left) * 4);
  }
  return out;
}

// A motion tween (its moving picture and the two places it moves between) in `space`.
export function motionTweenInSpace<S extends PixelPicture, T extends { stageWidth: number; stageHeight: number; spriteBitmap: S | null; startOrigin: { x: number; y: number } | null; endOrigin: { x: number; y: number } | null }>(
  tween: T, space: RasterSize,
): T | (Omit<T, "spriteBitmap"> & { spriteBitmap: S | PixelPicture | null }) {
  const own = { width: tween.stageWidth, height: tween.stageHeight };
  if (samePixelSpace(own, space)) return tween;
  const scale = pixelSpaceScale(own, space);
  const point = (origin: { x: number; y: number }) => ({ x: Math.round(space.width / 2 + (origin.x - own.width / 2) * scale), y: Math.round(space.height / 2 + (origin.y - own.height / 2) * scale) });
  const sprite = tween.spriteBitmap, start = tween.startOrigin;
  if (!sprite || !start) {
    return { ...tween, stageWidth: space.width, stageHeight: space.height, startOrigin: start ? point(start) : null, endOrigin: tween.endOrigin ? point(tween.endOrigin) : null };
  }
  const drawn = resampleRasterBox(sprite.data, { left: start.x, top: start.y, width: sprite.width, height: sprite.height }, own, space, scale);
  const startOrigin = { x: drawn.left, y: drawn.top };
  const endOrigin = tween.endOrigin
    ? { x: startOrigin.x + Math.round((tween.endOrigin.x - start.x) * scale), y: startOrigin.y + Math.round((tween.endOrigin.y - start.y) * scale) }
    : null;
  return { ...tween, stageWidth: space.width, stageHeight: space.height, spriteBitmap: { width: drawn.width, height: drawn.height, data: drawn.data }, startOrigin, endOrigin };
}

// Shrinks a picture (full-size or already compact) to its smallest centered box. Lossless.
export function compactRaster(bitmap: ImageData): ImageData {
  const reference = resolveRasterReferenceSize(bitmap);
  const { width, height } = bitmap;
  const data = framePixels(bitmap).data;   // (a packed picture's pixels are read through framePictureStore.ts)
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
  const data = framePixels(bitmap).data;
  for (let row = 0; row < bitmap.height; row += 1) {
    out.data.set(data.subarray(row * bitmap.width * 4, (row + 1) * bitmap.width * 4), ((y + row) * reference.width + x) * 4);
  }
  const coverage = getBitmapPaintCoverage(bitmap);
  if (coverage) attachBitmapPaintCoverage(out, cropPaintCoverage(coverage, -x, -y, reference.width, reference.height));
  return out;
}

// Reads a box from the full centered coordinate space without expanding a compact bitmap.
export function captureRasterReferencePatch(
  bitmap: ImageData | null,
  rect: { left: number; top: number; width: number; height: number },
  reference: RasterSize,
): ImageData {
  const out = new ImageData(rect.width, rect.height);
  bitmap = rasterInSpace(bitmap, reference);
  if (!bitmap) return out;
  const sourceLeft = compactOrigin(reference.width, bitmap.width);
  const sourceTop = compactOrigin(reference.height, bitmap.height);
  const left = Math.max(rect.left, sourceLeft);
  const top = Math.max(rect.top, sourceTop);
  const right = Math.min(rect.left + rect.width, sourceLeft + bitmap.width);
  const bottom = Math.min(rect.top + rect.height, sourceTop + bitmap.height);
  const data = framePixels(bitmap).data;
  for (let y = top; y < bottom; y += 1) {
    const sourceStart = ((y - sourceTop) * bitmap.width + left - sourceLeft) * 4;
    const targetStart = ((y - rect.top) * rect.width + left - rect.left) * 4;
    out.data.set(data.subarray(sourceStart, sourceStart + (right - left) * 4), targetStart);
  }
  const coverage = getBitmapPaintCoverage(bitmap);
  if (coverage) {
    attachBitmapPaintCoverage(out, cropPaintCoverage(
      coverage,
      rect.left - sourceLeft,
      rect.top - sourceTop,
      rect.width,
      rect.height,
    ));
  }
  return out;
}

// Applies a reference-coordinate patch and keeps the result compact. This is the
// memory-safe replacement for expanding a sparse frame to its old full stage.
export function mergeRasterReferencePatch(
  bitmap: ImageData | null,
  patch: ImageData,
  rect: { left: number; top: number; width: number; height: number },
  reference: RasterSize,
): ImageData {
  bitmap = rasterInSpace(bitmap, reference);
  const sourceLeft = bitmap ? compactOrigin(reference.width, bitmap.width) : Math.floor(reference.width / 2);
  const sourceTop = bitmap ? compactOrigin(reference.height, bitmap.height) : Math.floor(reference.height / 2);
  const sourceRight = bitmap ? sourceLeft + bitmap.width : sourceLeft;
  const sourceBottom = bitmap ? sourceTop + bitmap.height : sourceTop;
  const left = Math.min(sourceLeft, rect.left);
  const top = Math.min(sourceTop, rect.top);
  const right = Math.max(sourceRight, rect.left + rect.width);
  const bottom = Math.max(sourceBottom, rect.top + rect.height);
  const sourceCoverage = bitmap ? getBitmapPaintCoverage(bitmap) : null;
  const patchCoverage = getBitmapPaintCoverage(patch);
  const length = sourceCoverage || patchCoverage ? centeredLengthOnGrid : centeredLength;
  const width = length(reference.width, left, right);
  const height = length(reference.height, top, bottom);
  const originX = compactOrigin(reference.width, width);
  const originY = compactOrigin(reference.height, height);
  const out = new ImageData(width, height);
  if (bitmap) {
    const data = framePixels(bitmap).data;
    for (let y = 0; y < bitmap.height; y += 1) {
      out.data.set(
        data.subarray(y * bitmap.width * 4, (y + 1) * bitmap.width * 4),
        ((sourceTop - originY + y) * width + sourceLeft - originX) * 4,
      );
    }
  }
  for (let y = 0; y < rect.height; y += 1) {
    out.data.set(
      patch.data.subarray(y * rect.width * 4, (y + 1) * rect.width * 4),
      ((rect.top - originY + y) * width + rect.left - originX) * 4,
    );
  }
  const referenceCoverage = patchPaintCoverage(
    sourceCoverage ? cropPaintCoverage(sourceCoverage, -sourceLeft, -sourceTop, reference.width, reference.height) : null,
    patchCoverage,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    reference.width,
    reference.height,
  );
  if (referenceCoverage) {
    attachBitmapPaintCoverage(out, cropPaintCoverage(referenceCoverage, originX, originY, width, height));
  }
  return compactRaster(setRasterReferenceSize(out, reference));
}
