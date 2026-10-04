import assert from "node:assert/strict";
import { test } from "node:test";

// Node has no ImageData; a minimal stand-in is enough for these pixel checks.
class TestImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
}
(globalThis as unknown as { ImageData: typeof TestImageData }).ImageData = TestImageData;

const { compactRaster, compactRasterFromCrop, expandRaster, getRasterReferenceSize, compactOrigin } = await import("./compactRasterBitmap.ts");
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
