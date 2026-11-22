import assert from "node:assert/strict";
import { test } from "node:test";

// Node has no ImageData; a minimal stand-in is enough for these pixel checks.
class TestImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
}
(globalThis as unknown as { ImageData: typeof TestImageData }).ImageData = TestImageData;

const { captureRasterReferencePatch, compactRaster, compactRasterFromCrop, expandRaster, getRasterReferenceSize, compactOrigin, mergeRasterReferencePatch } = await import("./compactRasterBitmap.ts");
const { bitmapCenterOffset } = await import("./unifiedStageGeometry.ts");

const paint = (image: { width: number; data: Uint8ClampedArray }, x: number, y: number, value: number) => {
  const i = (y * image.width + x) * 4;
  image.data[i] = value; image.data[i + 1] = value + 1; image.data[i + 2] = value + 2; image.data[i + 3] = 255;
};

for (const [W, H] of [[101, 77], [100, 80], [1201, 1601]] as const) {
  test(`compact -> expand gives back the same full picture (${W}x${H})`, () => {
    const full = new ImageData(W, H);
    const dots: [number, number][] = [[Math.floor(W / 2) - 3, Math.floor(H / 2) + 2], [Math.floor(W / 2) + 9, Math.floor(H / 2) - 7], [Math.floor(W / 3), Math.floor(H / 2)]];
    dots.forEach(([x, y], i) => paint(full, x, y, 10 + i * 10));
    const compact = compactRaster(full as ImageData);
    assert.ok(compact.width < W && compact.height < H, "picture got smaller");
    assert.deepEqual(getRasterReferenceSize(compact), { width: W, height: H });
    const back = expandRaster(compact);
    assert.equal(back.width, W); assert.equal(back.height, H);
    assert.deepEqual(Array.from(back.data), Array.from(full.data));
  });
}

test("a compact picture shows in exactly the same canvas place as the full one", () => {
  const W = 999, H = 601;
  const full = new ImageData(W, H);
  paint(full, 480, 250, 50);
  const compact = compactRaster(full as ImageData);
  for (const canvasSize of [999, 1000, 1200, 1501]) {
    const fullAt = bitmapCenterOffset(canvasSize, W) + 480;
    const cx = 480 - compactOrigin(W, compact.width);
    const compactAt = bitmapCenterOffset(canvasSize, compact.width) + cx;
    assert.equal(compactAt, fullAt);
    assert.equal(compact.data[((250 - compactOrigin(H, compact.height)) * compact.width + cx) * 4 + 3], 255);
  }
});

test("building from a saved crop matches compacting the full picture", () => {
  const W = 400, H = 300;
  const full = new ImageData(W, H);
  paint(full, 150, 120, 70); paint(full, 260, 200, 90);
  const crop = new Uint8ClampedArray(111 * 81 * 4);
  for (let row = 0; row < 81; row += 1) crop.set(full.data.subarray(((120 + row) * W + 150) * 4, ((120 + row) * W + 261) * 4), row * 111 * 4);
  const fromCrop = compactRasterFromCrop({ width: 111, height: 81, data: crop, x: 150, y: 120, reference: { width: W, height: H } });
  const fromFull = compactRaster(full as ImageData);
  assert.equal(fromCrop.width, fromFull.width); assert.equal(fromCrop.height, fromFull.height);
  assert.deepEqual(Array.from(fromCrop.data), Array.from(fromFull.data));
});

test("an empty picture becomes a tiny one that still remembers its full size", () => {
  const compact = compactRaster(new ImageData(500, 400) as ImageData);
  assert.ok(compact.width <= 2 && compact.height <= 2);
  assert.deepEqual(getRasterReferenceSize(compact), { width: 500, height: 400 });
});

test("a small patch edits an old large reference without expanding it", () => {
  const full = new ImageData(1200, 800);
  paint(full, 600, 400, 20);
  const compact = compactRaster(full as ImageData);
  const patch = new ImageData(32, 32);
  paint(patch, 4, 5, 90);
  const merged = mergeRasterReferencePatch(compact, patch, { left: 700, top: 440, width: 32, height: 32 }, { width: 1200, height: 800 });
  assert.deepEqual(getRasterReferenceSize(merged), { width: 1200, height: 800 });
  assert.ok(merged.width < 1200 && merged.height < 800, "the old full canvas was not allocated");
  const first = captureRasterReferencePatch(merged, { left: 600, top: 400, width: 1, height: 1 }, { width: 1200, height: 800 });
  const second = captureRasterReferencePatch(merged, { left: 704, top: 445, width: 1, height: 1 }, { width: 1200, height: 800 });
  assert.equal(first.data[0], 20);
  assert.equal(second.data[0], 90);
});

// (Nov 14) The save path's box of painted pixels: the fast reader must give exactly the box the old pixel-by-pixel loop gave.
test("paintedBounds = the old every-pixel loop (alpha > 0), on every kind of picture", async () => {
  const { paintedBounds } = await import("./compactRasterBitmap.ts");
  const slow = (data: Uint8ClampedArray, width: number, height: number) => {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    return right < left || bottom < top ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
  };
  let state = 12345;
  const random = (limit: number) => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % limit; };
  for (let round = 0; round < 400; round += 1) {
    const width = 1 + random(40), height = 1 + random(40);
    const data = new Uint8ClampedArray(width * height * 4);
    // Colour without alpha is NOT paint (the old loop looked at alpha only).
    for (let i = 0; i < random(6); i += 1) data.set([200, 100, 50, 0], (random(height) * width + random(width)) * 4);
    for (let i = 0; i < random(5); i += 1) data.set([random(256), random(256), random(256), 1 + random(255)], (random(height) * width + random(width)) * 4);
    assert.deepEqual(paintedBounds(data, width, height), slow(data, width, height), `round ${round} (${width}x${height})`);
  }
  // A view that does not start on a 4-byte border (never an ImageData's, but never a wrong box either).
  const shifted = new Uint8ClampedArray(new ArrayBuffer(4 * 12 + 1), 1, 4 * 12);
  shifted.set([1, 2, 3, 9], (1 * 4 + 2) * 4);
  assert.deepEqual(paintedBounds(shifted, 4, 3), { left: 2, top: 1, width: 1, height: 1 });
  assert.equal(paintedBounds(new Uint8ClampedArray(0), 0, 0), null);
});
