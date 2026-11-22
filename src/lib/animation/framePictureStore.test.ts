import assert from "node:assert/strict";
import { test } from "node:test";

// Node has no ImageData; a minimal stand-in is enough for these pixel checks.
class TestImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
    if (typeof a === "number") { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.width = b; this.height = c ?? a.length / 4 / b; this.data = a; }
  }
}
(globalThis as unknown as { ImageData: typeof TestImageData }).ImageData = TestImageData;

const { compactRasterFromCrop, getRasterReferenceSize } = await import("./compactRasterBitmap.ts");
const store = await import("./framePictureStore.ts");
const { rasterCropBitmap, readRasterCrop, stablePaintedBounds } = await import("./rasterCropV1.ts");

// A picture like an AI frame: clear margins, flat shapes, a soft (every pixel different) edge band.
const picture = (width: number, height: number, seed: number) => {
  const image = new ImageData(width, height);
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) >>> 0) & 0xff;
  for (let y = 40; y < height - 40; y += 1) {
    for (let x = 60; x < width - 60; x += 1) {
      const i = (y * width + x) * 4;
      const soft = x % 97 < 3;
      image.data[i] = soft ? next() : 20; image.data[i + 1] = soft ? next() : 160; image.data[i + 2] = soft ? next() : 70; image.data[i + 3] = soft ? next() | 1 : 255;
    }
  }
  return image;
};

test("pack -> unpack gives back every pixel word (runs, literals, edges of the array)", () => {
  for (const words of [
    new Uint32Array(0), new Uint32Array([7]), new Uint32Array([7, 7]), new Uint32Array([1, 2, 3]), new Uint32Array([1, 2, 2, 3, 3, 3, 4]),
    new Uint32Array(5000).fill(0xffffffff), Uint32Array.from({ length: 5000 }, (_, i) => (i * 2654435761) >>> 0),
    Uint32Array.from({ length: 5000 }, (_, i) => (i % 50 < 30 ? 9 : i)), new Uint32Array([0x80000000, 0x80000000, 0x80000001, 5]),
  ]) {
    assert.deepEqual(store.unpackPixelWords(store.packPixelWords(words), words.length), words);
  }
});

test("a packed picture lets its memory go and still gives back the same pixels", () => {
  const image = compactRasterFromCrop({ ...picture(400, 300, 1), x: 500, y: 400, reference: { width: 4000, height: 3000 } });
  const before = image.data.slice();
  const width = image.width, height = image.height;
  const freed = store.packPixelData(image.data);
  assert.ok(freed > before.byteLength / 2, "a flat picture gets much smaller");
  assert.equal(image.data.byteLength, 0, "the picture's own pixel memory is gone");
  assert.equal(image.width, width); assert.equal(image.height, height);
  assert.ok(store.isFramePicturePacked(image));
  const shown = store.framePixels(image);
  assert.notEqual(shown, image);
  assert.deepEqual(shown.data, before);
  assert.deepEqual(getRasterReferenceSize(shown), getRasterReferenceSize(image), "the stand-in stands for the same full size");
  assert.equal(store.framePixels(image), shown, "asked twice in a row: the same stand-in");
  const copy = store.unpackedFramePictureCopy(image)!;
  assert.deepEqual(copy.data, before);
  assert.notEqual(copy.data.buffer, shown.data.buffer, "a copy has its own memory");
  assert.equal(store.packPixelData(image.data), 0, "packed once");
});

test("pictures that share one pixel buffer are packed together", () => {
  const first = picture(300, 200, 2);
  const before = first.data.slice();
  const second = new ImageData(first.data as never, first.width, first.height);
  store.packPixelData(first.data);
  assert.ok(store.isFramePicturePacked(second));
  assert.deepEqual(store.framePixels(second).data, before);
});

test("a picture that would hardly get smaller is left as it is, and not tried again", () => {
  const noisy = new ImageData(200, 200);
  for (let i = 0; i < noisy.data.length; i += 1) noisy.data[i] = (i * 7919 + (i >> 3)) & 0xff;
  assert.equal(store.packPixelData(noisy.data), 0);
  assert.equal(noisy.data.byteLength, 200 * 200 * 4);
  assert.ok(store.isPixelDataSettled(noisy.data));
  assert.ok(!store.isFramePicturePacked(noisy));
});

test("same pixels are known without reading: a copy and its source, and two packed pictures", () => {
  const a = picture(300, 200, 3), b = picture(300, 200, 3), c = picture(300, 200, 4);
  assert.equal(store.knownSamePixels(a, b), null, "two raw pictures: the caller compares");
  const copyOfA = new ImageData(a.data.slice() as never, a.width, a.height);
  store.rememberSamePixels(copyOfA, a);
  assert.equal(store.knownSamePixels(copyOfA, a), true);
  const copyOfCopy = new ImageData(a.data.slice() as never, a.width, a.height);
  store.rememberSamePixels(copyOfCopy, copyOfA);
  assert.equal(store.knownSamePixels(copyOfCopy, a), true);
  store.packPixelData(a.data); store.packPixelData(b.data); store.packPixelData(c.data);
  assert.equal(store.knownSamePixels(a, b), true);
  assert.equal(store.knownSamePixels(a, c), false);
  assert.equal(store.knownSamePixels(store.unpackedFramePictureCopy(a)!, a), true, "an unpacked copy is known to equal its packed source");
});

test("a saved picture (a box read from its frame) gives the same bytes after its frame was packed", () => {
  const frame = picture(500, 400, 5);
  const bounds = stablePaintedBounds(frame.data, frame.width, frame.height)!;
  const crop = { source: frame.data, sourceWidth: frame.width, ...bounds };
  const saved = rasterCropBitmap(crop, { x: bounds.left, y: bounds.top });
  const before = readRasterCrop(crop);
  store.packPixelData(frame.data);
  assert.deepEqual(readRasterCrop(crop), before);
  assert.deepEqual(saved.data, before);
  assert.deepEqual(stablePaintedBounds(frame.data, frame.width, frame.height), bounds, "its painted box is remembered");
});

test("the same picture kept twice is held once; a different one is not mixed up with it", () => {
  const a = picture(320, 240, 9), again = picture(320, 240, 9), other = picture(320, 240, 10);
  const beforeA = a.data.slice(), beforeOther = other.data.slice();
  const before = store.framePictureStoreStats();
  store.packPixelData(a.data); store.packPixelData(again.data); store.packPixelData(other.data);
  const after = store.framePictureStoreStats();
  assert.equal(after.packedCount - before.packedCount, 3);
  assert.equal(after.sharedCount - before.sharedCount, 1, "the second copy of the same picture takes no memory of its own");
  assert.deepEqual(store.framePixels(again).data, beforeA);
  assert.deepEqual(store.framePixels(other).data, beforeOther);
  assert.equal(store.knownSamePixels(a, again), true);
  assert.equal(store.knownSamePixels(a, other), false);
});

test("a packed picture still knows how many bytes its pixels are", () => {
  const frame = picture(500, 400, 11);
  store.packPixelData(frame.data);
  assert.equal(frame.data.byteLength, 0);
  assert.equal(store.pixelDataByteLength(frame.data), 500 * 400 * 4);
  assert.equal(store.pixelDataByteLength(picture(10, 10, 1).data), 400);
});
