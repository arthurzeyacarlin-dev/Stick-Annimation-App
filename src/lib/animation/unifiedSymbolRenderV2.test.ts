import assert from "node:assert/strict";
import { test } from "node:test";
import type { UnifiedSymbolInstanceItemV2 } from "./unifiedAnimationContentV2";
import type { UnifiedBitmapSymbolDefinitionV2 } from "./unifiedAnimationContractV2";

const {
  createSymbolImageCacheV2,
  drawSymbolInstancesV2,
  indexSymbolDefinitionsV2,
  resolveSymbolInstanceMatrixV2,
  resolveSymbolStagePresentationV2,
  symbolInstancesAtFrameV2,
} = await import("./unifiedSymbolRenderV2.ts");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const definition = (id: string, overrides: Partial<UnifiedBitmapSymbolDefinitionV2> = {}): UnifiedBitmapSymbolDefinitionV2 => ({
  definitionId: id, name: `Symbol ${id}`, sourceCategory: "Drawing Symbol", width: 40, height: 20,
  pngDataUrl: `${PNG}#${id}`, assetSha256: `sha256:${"a".repeat(64)}`, definitionDigest: `sha256:${id.padEnd(64, "0")}`, ...overrides,
});
const instance = (def: UnifiedBitmapSymbolDefinitionV2, overrides: Partial<UnifiedSymbolInstanceItemV2> = {}): UnifiedSymbolInstanceItemV2 => ({
  itemId: `item-${def.definitionId}`, kind: "symbol-instance/v1", definitionId: def.definitionId, definitionDigest: def.definitionDigest,
  x: 100, y: 200, width: 300, height: 150, rotation: 0, flipX: false, flipY: false, ...overrides,
});

// The editor overlay: <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet"> with
// translate(c) rotate(r) scale(flip) translate(-c) on each instance. Map one stage point that way.
const overlayPoint = (rect: { left: number; top: number; width: number; height: number }, item: UnifiedSymbolInstanceItemV2, px: number, py: number) => {
  const cx = item.x + item.width / 2, cy = item.y + item.height / 2;
  const fx = item.flipX ? -1 : 1, fy = item.flipY ? -1 : 1;
  const dx = (px - cx) * fx, dy = (py - cy) * fy;
  const r = (item.rotation * Math.PI) / 180;
  const sx = cx + dx * Math.cos(r) - dy * Math.sin(r), sy = cy + dx * Math.sin(r) + dy * Math.cos(r);
  const scale = Math.min(rect.width / 1920, rect.height / 1080);
  return { x: rect.left + (rect.width - 1920 * scale) / 2 + sx * scale, y: rect.top + (rect.height - 1080 * scale) / 2 + sy * scale };
};
const applyMatrix = ([a, b, c, d, e, f]: number[], x: number, y: number) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
const close = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ""} ${actual} != ${expected}`);

test("stage fit matches the overlay's 'meet' fit on wide, tall and exact pages", () => {
  for (const rect of [{ left: 0, top: 0, width: 1600, height: 900 }, { left: 10, top: 20, width: 800, height: 900 }, { left: 0, top: 0, width: 2000, height: 600 }]) {
    const p = resolveSymbolStagePresentationV2(rect)!;
    const scale = Math.min(rect.width / 1920, rect.height / 1080);
    close(p.scale, scale);
    close(p.offsetX, rect.left + (rect.width - 1920 * scale) / 2);
    close(p.offsetY, rect.top + (rect.height - 1080 * scale) / 2);
  }
  assert.equal(resolveSymbolStagePresentationV2({ left: 0, top: 0, width: 0, height: 100 }), null);
});

test("each instance lands exactly where the canvas overlay draws it (move, size, rotate, flip)", () => {
  const def = definition("a");
  const rect = { left: 0, top: 0, width: 1234, height: 777 };
  const presentation = resolveSymbolStagePresentationV2(rect)!;
  for (const overrides of [{}, { rotation: 37 }, { rotation: -90, flipX: true }, { rotation: 200, flipY: true, flipX: true, x: -50, width: 12 }]) {
    const item = instance(def, overrides);
    const matrix = resolveSymbolInstanceMatrixV2(item, presentation);
    // Corners of the box, given in the instance's own centered units.
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.25, 0.75]]) {
      const local = { x: (u - 0.5) * item.width, y: (v - 0.5) * item.height };
      const got = applyMatrix(matrix, local.x, local.y);
      const want = overlayPoint(rect, item, item.x + u * item.width, item.y + v * item.height);
      close(got.x, want.x, "x"); close(got.y, want.y, "y");
    }
  }
});

test("an unrotated instance covers the same rectangle as export's uniform-contain mapping", async () => {
  const { resolveUniformContainTransform } = await import("../export/exportContracts.ts");
  const def = definition("e");
  const item = instance(def, { x: 300, y: 120, width: 500, height: 260 });
  const out = resolveUniformContainTransform(1280, 720, 1920, 1080);
  const matrix = resolveSymbolInstanceMatrixV2(item, resolveSymbolStagePresentationV2({ left: 0, top: 0, width: 1280, height: 720 })!);
  const topLeft = applyMatrix(matrix, -item.width / 2, -item.height / 2), bottomRight = applyMatrix(matrix, item.width / 2, item.height / 2);
  close(topLeft.x, out.offsetX + item.x * out.scaleX); close(topLeft.y, out.offsetY + item.y * out.scaleY);
  close(bottomRight.x, out.offsetX + (item.x + item.width) * out.scaleX); close(bottomRight.y, out.offsetY + (item.y + item.height) * out.scaleY);
});

test("playback finds the same instances as the canvas: holds and tweens share their owner's cell", () => {
  const def = definition("h");
  const ball = instance(def);
  const byCell = { "layer-1:7": [ball], "layer-1:9": [] };
  const frames = [{ stateId: 7 }, { stateId: 7 }, { stateId: 9 }, { stateId: 11 }];
  assert.deepEqual(symbolInstancesAtFrameV2(byCell, "layer-1", frames, 0), [ball]);
  assert.deepEqual(symbolInstancesAtFrameV2(byCell, "layer-1", frames, 1), [ball]);
  assert.equal(symbolInstancesAtFrameV2(byCell, "layer-1", frames, 2), undefined);
  assert.equal(symbolInstancesAtFrameV2(byCell, "layer-1", frames, 3), undefined);
  assert.equal(symbolInstancesAtFrameV2(byCell, "layer-2", frames, 0), undefined);
  assert.equal(symbolInstancesAtFrameV2(byCell, "layer-1", frames, 99), undefined);
});

const recordingContext = () => {
  const calls: unknown[][] = [];
  let depth = 0, maxDepth = 0;
  const ctx = {
    calls,
    get depth() { return depth; },
    get maxDepth() { return maxDepth; },
    strokeStyle: "" as string, fillStyle: "" as string, lineWidth: 1, lineCap: "butt" as CanvasLineCap, lineJoin: "miter" as CanvasLineJoin,
    imageSmoothingEnabled: false,
    save() { depth += 1; maxDepth = Math.max(maxDepth, depth); calls.push(["save"]); },
    restore() { depth -= 1; calls.push(["restore"]); },
    transform(...args: number[]) { calls.push(["transform", ...args]); },
    drawImage(image: unknown, ...args: number[]) { calls.push(["drawImage", image, ...args, ctx.imageSmoothingEnabled]); },
    beginPath() { calls.push(["beginPath"]); },
    moveTo(x: number, y: number) { calls.push(["moveTo", x, y]); },
    lineTo(x: number, y: number) { calls.push(["lineTo", x, y]); },
    arc(x: number, y: number, r: number) { calls.push(["arc", x, y, r]); },
    stroke() { calls.push(["stroke", ctx.lineWidth, ctx.strokeStyle]); },
    fill() { calls.push(["fill"]); },
  };
  return ctx;
};

test("draws ready symbols, skips missing/changed definitions and pictures still decoding", () => {
  const ready = definition("r");
  const decoding = definition("d");
  const ctx = recordingContext();
  const presentation = { scale: 0.5, offsetX: 10, offsetY: 20 };
  const picture = { tag: "picture" } as unknown as CanvasImageSource;
  const items = [
    instance(ready),
    instance(ready, { itemId: "changed", definitionDigest: `sha256:${"f".repeat(64)}` }),
    instance(definition("missing")),
    instance(decoding),
  ];
  const drawn = drawSymbolInstancesV2(ctx, items, indexSymbolDefinitionsV2([ready, decoding]), presentation,
    def => def.definitionId === "r" ? picture : null);
  assert.equal(drawn, 1);
  const draws = ctx.calls.filter(call => call[0] === "drawImage");
  assert.deepEqual(draws, [["drawImage", picture, -150, -75, 300, 150, true]]);
  const transform = ctx.calls.find(call => call[0] === "transform")!;
  assert.deepEqual(transform.slice(1), resolveSymbolInstanceMatrixV2(items[0], presentation));
  assert.equal(ctx.depth, 0, "save/restore stay balanced");
  const firstSave = ctx.calls.findIndex(call => call[0] === "save"), draw = ctx.calls.findIndex(call => call[0] === "drawImage");
  assert.ok(firstSave >= 0 && firstSave < draw, "smoothing/transform changes happen inside save/restore");
});

test("stick-figure symbols draw their limbs and joints like the overlay, even with no picture", () => {
  const rig = definition("s", {
    sourceCategory: "Stick Figure Symbol",
    structuredPayload: { version: 1, joints: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 1, y: 1 }], limbs: [{ id: "l", startJointId: "a", endJointId: "b" }], drawingPngDataUrl: null },
  });
  const ctx = recordingContext();
  let asked = 0;
  const drawn = drawSymbolInstancesV2(ctx, [instance(rig)], indexSymbolDefinitionsV2([rig]), { scale: 1, offsetX: 0, offsetY: 0 }, () => { asked += 1; return null; });
  assert.equal(drawn, 1);
  assert.equal(asked, 0, "no picture is requested when the rig has none");
  assert.deepEqual(ctx.calls.filter(call => call[0] === "moveTo" || call[0] === "lineTo"), [["moveTo", -150, -75], ["lineTo", 150, 75]]);
  assert.deepEqual(ctx.calls.filter(call => call[0] === "arc"), [["arc", -150, -75, 14], ["arc", 150, 75, 14]]);
  assert.ok(ctx.calls.some(call => call[0] === "stroke" && call[1] === 14 && call[2] === "#101218"));
});

test("picture cache decodes each symbol once, never blocks, forgets deleted symbols and survives bad pictures", async () => {
  const loads: string[] = [];
  const cache = createSymbolImageCacheV2<{ url: string }>(async url => {
    loads.push(url);
    if (url.includes("#bad")) throw new Error("decode failed");
    return { url };
  });
  const a = definition("a"), b = definition("b"), bad = definition("bad");
  assert.equal(cache.get(a), null, "first ask starts decoding and returns nothing yet");
  await cache.warm([a, b, bad]);
  assert.deepEqual(cache.get(a), { url: a.pngDataUrl });
  assert.deepEqual(cache.get(b), { url: b.pngDataUrl });
  assert.equal(cache.get(bad), null);
  for (let frame = 0; frame < 100; frame += 1) { cache.get(a); cache.get(b); cache.get(bad); }
  await cache.warm([a, b, bad]);
  assert.deepEqual(loads.sort(), [a.pngDataUrl, b.pngDataUrl, bad.pngDataUrl].sort(), "decoded once each, no retries");
  await cache.warm([a]);
  assert.equal(cache.size(), 1, "deleted symbols are forgotten");
});

test("drawing cost per frame stays tiny (no decoding, no per-symbol allocation of pictures)", () => {
  const defs = Array.from({ length: 20 }, (_, index) => definition(`p${index}`));
  const items = Array.from({ length: 60 }, (_, index) => instance(defs[index % defs.length], { itemId: `i${index}`, rotation: index * 7 }));
  const index = indexSymbolDefinitionsV2(defs);
  assert.equal(indexSymbolDefinitionsV2(defs), index, "lookup table is built once per catalog");
  const picture = {} as CanvasImageSource;
  const noop = () => undefined;
  const ctx = { save: noop, restore: noop, transform: noop, drawImage: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, stroke: noop, fill: noop,
    strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "butt" as CanvasLineCap, lineJoin: "miter" as CanvasLineJoin, imageSmoothingEnabled: false };
  const presentation = { scale: 0.6, offsetX: 3, offsetY: 4 };
  const frames = 2000;
  const start = performance.now();
  for (let frame = 0; frame < frames; frame += 1) drawSymbolInstancesV2(ctx, items, index, presentation, () => picture);
  const perFrameMs = (performance.now() - start) / frames;
  // 60 symbols on screen: the script part must stay far below one 60 fps frame (16.7 ms).
  assert.ok(perFrameMs < 1, `script time per frame with 60 symbols: ${perFrameMs.toFixed(4)} ms`);
});

test("each instance can get its own placement (drawingCanvas instances follow the drawings); null skips it", () => {
  const def = definition("q");
  const ctx = recordingContext();
  const picture = {} as CanvasImageSource;
  const near = { scale: 2, offsetX: 0, offsetY: 0 }, far = { scale: 1, offsetX: 50, offsetY: 60 };
  const items = [instance(def, { itemId: "a" }), instance(def, { itemId: "b", drawingCanvas: { width: 800, height: 600 } }), instance(def, { itemId: "c" })];
  const drawn = drawSymbolInstancesV2(ctx, items, indexSymbolDefinitionsV2([def]), item => item.itemId === "c" ? null : item.drawingCanvas ? far : near, () => picture);
  assert.equal(drawn, 2);
  const transforms = ctx.calls.filter(call => call[0] === "transform").map(call => call.slice(1));
  assert.deepEqual(transforms, [resolveSymbolInstanceMatrixV2(items[0], near), resolveSymbolInstanceMatrixV2(items[1], far)]);
});
