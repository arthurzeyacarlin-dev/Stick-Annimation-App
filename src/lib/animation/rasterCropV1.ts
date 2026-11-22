import { compactOrigin, getRasterReferenceSize, paintedBounds } from "./compactRasterBitmap.ts";
import { readablePixelData } from "./framePictureStore.ts";

// (Nov 14, saving long animations) A saved picture is the tight box of a frame picture's painted pixels. The save used
// to COPY that box out of every frame picture for every save: one more copy of the whole animation in memory (5 GB for
// a 25 s full-page scene) and a read of every pixel, each time. A raster crop is the same box NOT copied: it remembers
// where it sits in the frame picture, and its bytes are read out only when a save really needs them (a picture the
// account already holds is never read again). Anything that just asks for `data` still gets the exact same bytes.
export type RasterCrop = {
  source: Uint8ClampedArray;   // the frame picture's own pixels (not copied)
  sourceWidth: number;
  left: number; top: number; width: number; height: number;
};

const crops = new WeakMap<object, RasterCrop>();
const boundsOf = new WeakMap<Uint8ClampedArray, ReturnType<typeof paintedBounds>>();
const digestOf = new WeakMap<Uint8ClampedArray, RasterCrop & { sha256: string }>();
const openedDigestOf = new WeakMap<object, string>();

// The fingerprint a saved picture's bytes were checked against when the project was opened (set by the opening code).
export const rememberOpenedPictureDigest = (bytes: object, sha256: string) => { openedDigestOf.set(bytes, sha256); };

// The crop a saved-picture object stands for; null = an ordinary picture that holds its own bytes.
export const rasterCropOf = (bitmap: unknown): RasterCrop | null =>
  bitmap !== null && typeof bitmap === "object" ? crops.get(bitmap) ?? null : null;

// The crop's bytes, row by row, into `target` (exactly width * height * 4 bytes) or into a new array.
export const readRasterCrop = <T extends Uint8Array | Uint8ClampedArray = Uint8ClampedArray>(crop: RasterCrop, target?: T): T => {
  const rowBytes = crop.width * 4;
  const out = target ?? new Uint8ClampedArray(rowBytes * crop.height) as T;
  const source = readablePixelData(crop.source);   // (a picture that is no longer on the canvas is kept packed: framePictureStore.ts)
  for (let row = 0; row < crop.height; row += 1) {
    const start = ((crop.top + row) * crop.sourceWidth + crop.left) * 4;
    out.set(source.subarray(start, start + rowBytes), row * rowBytes);
  }
  return out;
};

// A saved-picture object for the crop: { width, height, data, ...rest } where `data` is read from the frame picture
// when asked for. ONLY for a picture that is never changed in place (a compact frame picture: an edit replaces it).
export const rasterCropBitmap = <T extends object>(crop: RasterCrop, rest: T) => {
  const bitmap = { width: crop.width, height: crop.height, get data() { return readRasterCrop(crop); }, ...rest };
  crops.set(bitmap, crop);
  return bitmap;
};

// The painted box of a picture that is never changed in place: found once, then remembered for that picture.
export const stablePaintedBounds = (data: Uint8ClampedArray, width: number, height: number) => {
  if (!boundsOf.has(data)) boundsOf.set(data, paintedBounds(readablePixelData(data), width, height));
  return boundsOf.get(data) ?? null;
};

// (Nov 14, opening long animations) A project is opened as its saved pictures; the editor then builds its own frame
// picture from each one. Both used to stay in memory for as long as the project was open (twice 5 GB for a 25 s
// full-page scene: the page ran out of memory). Once a frame picture exists, the saved picture can be the same box
// read from it: this returns that stand-in for `saved` (same fields, same bytes when asked), so the opened copy of the
// bytes is let go. null = `frame` is not a compact frame picture (it may be changed in place): keep `saved` as it is.
export const savedPictureInFrame = <T extends { width: number; height: number; data: Uint8ClampedArray; x?: number; y?: number }>(
  saved: T, frame: { width: number; height: number; data: Uint8ClampedArray }) => {
  const reference = getRasterReferenceSize(frame);
  if (!reference) return null;
  const left = (saved.x ?? 0) - compactOrigin(reference.width, frame.width), top = (saved.y ?? 0) - compactOrigin(reference.height, frame.height);
  if (left < 0 || top < 0 || left + saved.width > frame.width || top + saved.height > frame.height) return null;
  const { width, height, data: _bytes, ...rest } = saved;
  void _bytes;
  // (the saved picture was the painted box of this frame when it was saved, and its fingerprint was just checked: the
  // next save need not look for the box again, nor read the picture to know it is unchanged)
  const crop = { source: frame.data, sourceWidth: frame.width, left, top, width, height };
  if (!boundsOf.has(frame.data)) boundsOf.set(frame.data, { left, top, width, height });
  const sha256 = openedDigestOf.get(saved.data);
  if (sha256 && !digestOf.has(frame.data)) digestOf.set(frame.data, { ...crop, sha256 });
  return rasterCropBitmap(crop, rest) as unknown as T;
};

// The fingerprint of a crop's bytes, remembered for its frame picture (same picture, same box = same bytes).
export const knownRasterCropDigest = (crop: RasterCrop) => {
  const known = digestOf.get(crop.source);
  return known && known.sourceWidth === crop.sourceWidth && known.left === crop.left && known.top === crop.top &&
    known.width === crop.width && known.height === crop.height ? known.sha256 : null;
};
export const rememberRasterCropDigest = (crop: RasterCrop, sha256: string) => { digestOf.set(crop.source, { ...crop, sha256 }); };
