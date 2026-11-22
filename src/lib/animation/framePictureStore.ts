import { copyRasterReferenceSize } from "./compactRasterBitmap.ts";
import { copyBitmapPaintCoverage } from "./unifiedRasterPaintCoverageV1.ts";

// (Nov 14, light memory) A frame picture is a raw bitmap of 4-7 MB. Every version of a long AI animation that is no
// longer on the canvas was still kept whole by the undo steps, by the project as it was opened and by the last save
// (measured: 965 pictures = 4.6 GB for an animation of 258). A picture that is NOT on the canvas is kept PACKED here:
// runs of equal pixels are written once (lossless; real frames get 5-6 times smaller, packing 4-9 ms, unpacking
// 2-3 ms). The picture object itself stays where it is - only its pixel memory is let go - so everything that just
// holds or compares pictures is untouched. Whoever needs the pixels asks this file and gets the exact same bytes.
// ONLY for pictures that are never changed in place (compact frame pictures: an edit replaces them).

type PackedPixels = { words: Uint32Array; byteLength: number };
type PixelPicture = { width: number; height: number; data: Uint8ClampedArray };

// Several picture objects can share one pixel buffer (the project as opened and the editor's frame), so the packed
// pixels are remembered for the BUFFER. A buffer whose memory was let go is still the same object for all of them.
// (The tables live on the page itself, not in this file: in development this file can be loaded again while a project is
// open, and the packed pixels of its pictures must not be forgotten with the old copy of the file.)
type Tables = {
  packedOf: WeakMap<ArrayBufferLike, PackedPixels>; sameAs: WeakMap<ArrayBufferLike, ArrayBufferLike>;
  leftRaw: WeakSet<ArrayBufferLike>; sharedPacked: Map<string, WeakRef<Uint32Array>>;
  counts: { packedCount: number; packedBytes: number; freedBytes: number; sharedCount: number };
};
const tables = ((globalThis as { __diamondFramePictureTables?: Tables }).__diamondFramePictureTables ??= {
  packedOf: new WeakMap(), sameAs: new WeakMap(), leftRaw: new WeakSet(), sharedPacked: new Map(),
  counts: { packedCount: 0, packedBytes: 0, freedBytes: 0, sharedCount: 0 },
});
const packedOf = tables.packedOf;
// Pictures known to hold the same pixels (a copy and what it was copied from): comparing them reads nothing.
const sameAs = tables.sameAs;
// The same picture is often kept more than once (a version put on the canvas again, the frames an edit did not change):
// equal packed pixels are held ONCE. Found by a quick fingerprint, then checked word for word.
const sharedPacked = tables.sharedPacked;
const fingerprint = (words: Uint32Array, byteLength: number) => {
  let a = 0x811c9dc5, b = words.length;
  for (let index = 0; index < words.length; index += 1) { a = Math.imul(a ^ words[index], 0x01000193); b = (b + (a >>> 7) + words[index]) | 0; }
  return `${byteLength}:${words.length}:${a >>> 0}:${b >>> 0}`;
};
const sameWords = (left: Uint32Array, right: Uint32Array) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
};
const shareWords = (words: Uint32Array, byteLength: number): { words: Uint32Array; shared: boolean } => {
  const key = fingerprint(words, byteLength);
  const held = sharedPacked.get(key)?.deref();
  if (held && sameWords(held, words)) return { words: held, shared: true };
  sharedPacked.set(key, new WeakRef(words));
  if (sharedPacked.size > 20000) for (const [k, ref] of sharedPacked) if (!ref.deref()) sharedPacked.delete(k);
  return { words, shared: false };
};

// Buffers that were looked at and left as they are (they would hardly get smaller): not tried again.
const leftRaw = tables.leftRaw;
const counts = tables.counts;

const LITERAL = 0x80000000;

export const packPixelWords = (words: Uint32Array): Uint32Array => {
  const total = words.length;
  const out = new Uint32Array(total + (total >>> 6) + 16);
  let o = 0, i = 0;
  while (i < total) {
    const value = words[i];
    let j = i + 1;
    while (j < total && words[j] === value) j += 1;
    if (j - i >= 2) { out[o++] = j - i; out[o++] = value; i = j; continue; }
    let k = i + 1;
    while (k < total && !(k + 1 < total && words[k] === words[k + 1])) k += 1;
    out[o++] = (LITERAL | (k - i)) >>> 0;
    out.set(words.subarray(i, k), o);
    o += k - i;
    i = k;
  }
  return out.slice(0, o);
};

export const unpackPixelWords = (packed: Uint32Array, total: number): Uint32Array => {
  const out = new Uint32Array(total);
  let o = 0, i = 0;
  while (i < packed.length) {
    const control = packed[i++];
    if (control >= LITERAL) { const length = control - LITERAL; out.set(packed.subarray(i, i + length), o); i += length; o += length; }
    else { out.fill(packed[i++], o, o + control); o += control; }
  }
  if (o !== total) throw new Error("frame_picture_unpack_failed");
  return out;
};

export const isPixelDataPacked = (data: { buffer: ArrayBufferLike } | null | undefined): boolean =>
  Boolean(data && packedOf.has(data.buffer));

// true = there is nothing (more) to do for this data: it is packed, or it was looked at and is better left as it is.
export const isPixelDataSettled = (data: { buffer: ArrayBufferLike }): boolean => packedOf.has(data.buffer) || leftRaw.has(data.buffer);

export const isFramePicturePacked = (picture: { data: { buffer?: ArrayBufferLike } } | null | undefined): boolean =>
  Boolean(picture && picture.data.buffer && packedOf.has(picture.data.buffer));

// Packs the pixels and lets their memory go. Returns the bytes freed (0 = left as it was: too small to matter, a
// picture whose array is only a part of its buffer, or a browser that cannot let a buffer go).
export const packPixelData = (data: Uint8ClampedArray): number => {
  const buffer = data.buffer;
  if (packedOf.has(buffer) || leftRaw.has(buffer)) return 0;
  const transfer = (buffer as ArrayBuffer & { transfer?: () => ArrayBuffer }).transfer;
  if (!(buffer instanceof ArrayBuffer) || typeof transfer !== "function" ||
    data.byteOffset !== 0 || data.byteLength !== buffer.byteLength || buffer.byteLength < 65536 || buffer.byteLength % 4 !== 0) { leftRaw.add(buffer); return 0; }
  const byteLength = buffer.byteLength;
  const packed = packPixelWords(new Uint32Array(buffer, 0, byteLength >>> 2));
  if (packed.byteLength * 2 > byteLength) { leftRaw.add(buffer); return 0; }   // (hardly smaller: not worth an unpack later)
  const { words, shared } = shareWords(packed, byteLength);
  packedOf.set(buffer, { words, byteLength });
  transfer.call(buffer);   // (the pixels move to a buffer nobody holds: their memory is freed; `buffer` stays as the key)
  counts.packedCount += 1; counts.freedBytes += byteLength;
  if (shared) counts.sharedCount += 1; else counts.packedBytes += words.byteLength;
  return byteLength - (shared ? 0 : words.byteLength);
};

const unpackedBytes = (buffer: ArrayBufferLike): Uint8ClampedArray | null => {
  const packed = packedOf.get(buffer);
  if (!packed) return null;
  return new Uint8ClampedArray(unpackPixelWords(packed.words, packed.byteLength >>> 2).buffer);
};

// A few unpacked pictures are kept for a moment (the same picture is often asked for twice in a row).
const RECENT_LIMIT = 6;
const recent = new Map<ArrayBufferLike, Uint8ClampedArray>();
const recentBytes = (buffer: ArrayBufferLike): Uint8ClampedArray | null => {
  const held = recent.get(buffer);
  recent.delete(buffer);
  // (a stand-in that was itself put on a frame and packed later has let its pixels go: unpacked again)
  if (held && held.byteLength > 0) { recent.set(buffer, held); return held; }
  const bytes = unpackedBytes(buffer);
  if (!bytes) return null;
  recent.set(buffer, bytes);
  if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value as ArrayBufferLike);
  return bytes;
};

// How many bytes a picture's pixels are (a packed picture's own array reads as empty: its memory was let go).
export const pixelDataByteLength = (data: Uint8ClampedArray): number => packedOf.get(data.buffer)?.byteLength ?? data.byteLength;

// The pixels of a picture's data array, for READING: the array itself, or the unpacked bytes of a packed picture.
export const readablePixelData = (data: Uint8ClampedArray): Uint8ClampedArray => recentBytes(data.buffer) ?? data;

// A picture for READING (drawing, comparing, copying from): the picture itself, or a stand-in with the unpacked
// pixels of a packed picture (same size, same reference size, same brush history).
const standIns = new WeakMap<Uint8ClampedArray, ImageData>();
export const framePixels = <T extends ImageData>(picture: T): T => {
  const bytes = recentBytes(picture.data.buffer);
  if (!bytes) return picture;
  let standIn = standIns.get(bytes);
  if (!standIn || standIn.width !== picture.width || standIn.height !== picture.height) {
    standIn = copyRasterReferenceSize(picture, copyBitmapPaintCoverage(picture, new ImageData(bytes as ImageDataArray, picture.width, picture.height)));
    standIns.set(bytes, standIn);
    rememberSamePixels(standIn, picture);
  }
  return standIn as T;
};

// A NEW picture with the pixels of a packed one (its own memory; the packed one stays packed). null = not packed.
export const unpackedFramePictureCopy = (picture: PixelPicture): ImageData | null => {
  const bytes = unpackedBytes(picture.data.buffer);
  if (!bytes) return null;
  const copy = new ImageData(bytes as ImageDataArray, picture.width, picture.height);
  rememberSamePixels(copy, picture);
  return copy;
};

// `copy` was just made from `source` pixel for pixel (and neither is ever changed in place).
const rootOf = (buffer: ArrayBufferLike) => { let root = buffer; for (let next = sameAs.get(root); next; next = sameAs.get(root)) root = next; return root; };
export const rememberSamePixels = (copy: PixelPicture, source: PixelPicture) => {
  const root = rootOf(source.data.buffer);
  if (root !== copy.data.buffer) sameAs.set(copy.data.buffer, root);
};

// true / false when it is known without reading every pixel; null = the caller compares the pixels itself.
export const knownSamePixels = (left: PixelPicture, right: PixelPicture): boolean | null => {
  const a = left.data.buffer, b = right.data.buffer;
  if (a === b || rootOf(a) === rootOf(b)) return true;
  const pa = packedOf.get(a), pb = packedOf.get(b);
  if (!pa || !pb) return null;
  return pa.words === pb.words || (pa.byteLength === pb.byteLength && sameWords(pa.words, pb.words));
};

export const framePictureStoreStats = () => ({ ...counts });

// true = this picture's pixel memory is gone and nothing here can give it back. It cannot happen while the page runs
// normally; whoever is about to SAVE such a picture must stop instead of saving an empty frame over a drawing.
export const arePixelsLost = (picture: { width: number; height: number; data: { byteLength: number; buffer: ArrayBufferLike } }): boolean =>
  picture.width > 0 && picture.height > 0 && picture.data.byteLength === 0 && !packedOf.has(picture.data.buffer);
