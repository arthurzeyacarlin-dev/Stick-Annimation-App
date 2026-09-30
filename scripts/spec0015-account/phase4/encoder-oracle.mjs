import assert from "node:assert/strict";
import { createNativeUnifiedProjectV2 } from "../../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";
import { assertUnifiedAnimationProjectV2 } from "../../../src/lib/animation/unifiedAnimationContractV2.ts";
import { createPaintCoverageWriter } from "../../../src/lib/animation/unifiedRasterPaintCoverageV1.ts";
import { hydrateUnifiedProjectStorageV2, prepareUnifiedProjectStorageV2 } from "../../../src/lib/animation/unifiedProjectStorageV2.ts";
import { packAccountProject, unpackAccountProject } from "../../../src/lib/account/projectBundle.ts";

const coverageWriter = createPaintCoverageWriter(null, 2, 2);
coverageWriter.set(0, 0, {
  key: { variant: "Brush", color: "#224466", opacityByte: 255 },
  base: [0, 0, 0, 0], coverage: 255, pigment: [34, 68, 102],
});
const sharedCoverage = coverageWriter.finish();
assert.ok(sharedCoverage);

const project = createNativeUnifiedProjectV2("2026-09-29T00:00:00.000Z");
const layer = project.document.layers[0];
layer.cells = [0, 1].map(index => {
  const cellId = crypto.randomUUID();
  return {
    cellId, cellType: "keyframe", ownerCellId: cellId,
    content: { soundAttachment: null, items: [{
      itemId: crypto.randomUUID(), kind: "drawing-raster/v1", strokes: [], shapes: [],
      bitmap: { width: 2, height: 2, data: new Uint8ClampedArray([34 + index, 68, 102, 255, ...Array(12).fill(0)]), paintCoverage: sharedCoverage },
      tweenEndBitmap: null, motionTween: null, sourceTransform: null,
    }] },
  };
});
project.document.reopenState.currentFrameIndex = 1;
assertUnifiedAnimationProjectV2(project);

const prepared = await prepareUnifiedProjectStorageV2(project);
const hydrated = await hydrateUnifiedProjectStorageV2(prepared.version, prepared.assets);
const repeated = await prepareUnifiedProjectStorageV2(hydrated);
assert.equal(repeated.version.projectDigest, prepared.version.projectDigest);
assert.equal(prepared.assets.length, 3);
const bundle = await packAccountProject(project);
const bufferBacked = Buffer.from(await bundle.body.arrayBuffer());
const unpackedBuffer = await unpackAccountProject(bufferBacked);
assert.equal(unpackedBuffer.version.projectDigest, prepared.version.projectDigest);
assert.equal(unpackedBuffer.project.document.layers[0].cells[0].content.items[0].bitmap.data.byteLength, 16);
assert.equal((await prepareUnifiedProjectStorageV2(unpackedBuffer.project)).version.projectDigest, prepared.version.projectDigest);

const distinct = structuredClone(project);
const otherWriter = createPaintCoverageWriter(null, 2, 2);
otherWriter.set(1, 1, {
  key: { variant: "Pencil", color: "#114477", opacityByte: 255 },
  base: [0, 0, 0, 0], coverage: 255, pigment: [17, 68, 119],
});
distinct.document.layers[0].cells[1].content.items[0].bitmap.paintCoverage = otherWriter.finish();
distinct.document.layers[0].cells[1].content.items[0].bitmap.data[15] = 255;
assertUnifiedAnimationProjectV2(distinct);
const preparedDistinct = await prepareUnifiedProjectStorageV2(distinct);
assert.notEqual(preparedDistinct.version.projectDigest, prepared.version.projectDigest);
const hydratedDistinct = await hydrateUnifiedProjectStorageV2(preparedDistinct.version, preparedDistinct.assets);
assert.equal((await prepareUnifiedProjectStorageV2(hydratedDistinct)).version.projectDigest, preparedDistinct.version.projectDigest);

const cyclic = createNativeUnifiedProjectV2();
cyclic.self = cyclic;
await assert.rejects(prepareUnifiedProjectStorageV2(cyclic), { message: "encode_failed" });
const unsupported = createNativeUnifiedProjectV2();
unsupported.extra = () => undefined;
await assert.rejects(prepareUnifiedProjectStorageV2(unsupported), { message: "encode_failed" });

process.stdout.write(JSON.stringify({
  sharedCoverageRoundTrip: true,
  bufferBackedBundleRoundTrip: true,
  distinctCoverageRoundTrip: true,
  genuineCycleRejected: true,
  unsupportedValueRejected: true,
  projectDigest: prepared.version.projectDigest,
  assetCount: prepared.assets.length,
}) + "\n");
