import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { bitmapCenterOffset } from "../../src/lib/animation/unifiedStageGeometry.ts";
import type { UnifiedAnimationDocumentV2 } from "../../src/lib/animation/unifiedAnimationContractV2.ts";
import { assertUnifiedAnimationDocumentV2 } from "../../src/lib/animation/unifiedAnimationContractV2.ts";
import {
  appendProjectAssetsV2,
  appendSymbolDefinitionV2,
  classifyUnifiedSymbolSourceV2,
  createBitmapSymbolDefinitionV2,
  createProjectAssetV2,
  removeSymbolDefinitionV2,
  assertStructuredSymbolDigestsV2,
  resolveStructuredSymbolGeometryV2,
} from "../../src/lib/animation/unifiedProjectCatalogV2.ts";

const PROJECT_ID = "0ce0bd48-b1f9-4a74-aa59-a35ce534bf6d";
const LAYER_ID = "96d6e64e-45d2-40cf-9c42-2073e5a2fbe0";
const CELL_ID = "65efb5be-20d8-4cc9-8093-cb7f456e4ef4";
const DEFINITION_ID = "3ca39c3c-2bb4-4355-96af-c25bdab3d509";
const INSTANCE_ID = "90a77e69-7b5a-4c58-bf82-080b5df0656d";
const IMAGE_ASSET_ID = "21a5be35-b91c-4c8b-b36d-87eedfdafc67";
const FILE_ASSET_ID = "db66217a-3f7c-4d20-9525-b77162b5fcc2";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+QyXnWQAAAABJRU5ErkJggg==";

const expectThrow = (operation: () => unknown, message: string) => {
  assert.throws(operation, { message });
};

export async function runPhase5CatalogOracle() {
  for (const source of [1, 2, 1661, 5106, 5455]) {
    for (const middle of [3, 4, 5107, 5454, 5455]) {
      for (const target of [1, 2, 5106, 5455]) {
        assert.equal(bitmapCenterOffset(middle, source) + bitmapCenterOffset(target, middle), bitmapCenterOffset(target, source), "resize path must not accumulate pixel drift");
      }
      assert.equal(bitmapCenterOffset(middle, source) + bitmapCenterOffset(source, middle), 0, "resize round trip");
    }
  }
  assert.deepEqual(
    [
      classifyUnifiedSymbolSourceV2(true, false),
      classifyUnifiedSymbolSourceV2(false, true),
      classifyUnifiedSymbolSourceV2(true, true),
    ],
    ["Drawing Symbol", "Stick Figure Symbol", "Drawing and Stick Figure Symbol"],
  );

  const definition = await createBitmapSymbolDefinitionV2({
    definitionId: DEFINITION_ID,
    name: "Sword",
    sourceCategory: "Drawing and Stick Figure Symbol",
    width: 96,
    height: 28,
    pngDataUrl: PNG,
    structuredPayload: {
      version: 1,
      joints: [{ id: "a", x: 0.1, y: 0.2 }, { id: "b", x: 0.8, y: 0.9 }],
      limbs: [{ id: "ab", startJointId: "a", endJointId: "b" }],
      drawingPngDataUrl: PNG,
    },
  });
  const emptyCatalogs = { symbols: [], assets: [] };
  const withSymbol = appendSymbolDefinitionV2(emptyCatalogs, definition);
  assert.equal(emptyCatalogs.symbols.length, 0);
  assert.equal(withSymbol.symbols[0], definition);
  assert.match(definition.assetSha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(definition.definitionDigest, /^sha256:[0-9a-f]{64}$/);

  expectThrow(
    () => appendSymbolDefinitionV2(withSymbol, { ...definition, definitionId: crypto.randomUUID(), name: " sword " }),
    "duplicate_symbol_name",
  );
  expectThrow(
    () => appendSymbolDefinitionV2(withSymbol, { ...definition, definitionId: crypto.randomUUID(), name: "Blade" }),
    "duplicate_symbol_content",
  );
  expectThrow(
    () => removeSymbolDefinitionV2(withSymbol, definition.definitionId, new Set([definition.definitionId])),
    "symbol_definition_referenced",
  );
  assert.equal(removeSymbolDefinitionV2(withSymbol, definition.definitionId, new Set()).symbols.length, 0);

  const imageAsset = await createProjectAssetV2({
    assetId: IMAGE_ASSET_ID,
    name: "reference.png",
    kind: "image",
    mimeType: "image/png",
    byteLength: 4,
    width: 1,
    height: 1,
    dataUrl: PNG,
    sourceBytes: Uint8Array.of(1, 2, 3, 4),
  });
  const fileAsset = await createProjectAssetV2({
    assetId: FILE_ASSET_ID,
    name: "notes.txt",
    kind: "file",
    mimeType: "text/plain",
    byteLength: 3,
    width: null,
    height: null,
    dataUrl: "data:text/plain;base64,YWJj",
    sourceBytes: Uint8Array.of(97, 98, 99),
  });
  const catalogs = appendProjectAssetsV2(withSymbol, [imageAsset, fileAsset]);
  assert.equal(imageAsset.dataUrl, PNG);
  assert.equal(fileAsset.dataUrl, null);
  assert.equal(fileAsset.width, null);
  assert.equal(fileAsset.height, null);
  expectThrow(
    () => appendProjectAssetsV2(catalogs, [{ ...fileAsset, assetId: crypto.randomUUID(), name: "NOTES.TXT" }]),
    "duplicate_asset_name",
  );

  const document: UnifiedAnimationDocumentV2 = {
    kind: "diamond-animation-document",
    schemaVersion: 2,
    projectId: PROJECT_ID,
    logicalStage: { width: 1920, height: 1080, origin: "top-left", xAxis: "right", yAxis: "down" },
    fps: 12,
    layers: [{
      layerId: LAYER_ID,
      name: "Layer 1",
      orderIndex: 0,
      visible: true,
      locked: false,
      cells: [{
        cellId: CELL_ID,
        cellType: "keyframe",
        ownerCellId: CELL_ID,
        content: {
          soundAttachment: null,
          items: [{
            itemId: INSTANCE_ID,
            kind: "symbol-instance/v1",
            definitionId: definition.definitionId,
            definitionDigest: definition.definitionDigest,
            x: 120,
            y: 260,
            width: 96,
            height: 28,
            rotation: 0,
            flipX: false,
            flipY: false,
          }],
        },
      }],
    }],
    catalogs,
    toolState: { drawingTool: "Select", stickTool: "select" },
    reopenState: { activeLayerId: LAYER_ID, currentFrameIndex: 0, onionEnabled: false },
  };
  assert.equal(assertUnifiedAnimationDocumentV2(document), document);
  const invalidImageDimensionsDocument = structuredClone(document);
  invalidImageDimensionsDocument.catalogs.assets[0].width = 0;
  expectThrow(() => assertUnifiedAnimationDocumentV2(invalidImageDimensionsDocument), "invalid_record");
  const invalidAssetKindDocument = structuredClone(document);
  (invalidAssetKindDocument.catalogs.assets[0] as { kind: string }).kind = "future";
  expectThrow(() => assertUnifiedAnimationDocumentV2(invalidAssetKindDocument), "invalid_record");
  const mismatchedDigestDocument = structuredClone(document);
  const mismatchedItem = mismatchedDigestDocument.layers[0].cells[0].content!.items[0];
  assert.equal(mismatchedItem.kind, "symbol-instance/v1");
  if (mismatchedItem.kind === "symbol-instance/v1") {
    mismatchedItem.definitionDigest = `sha256:${"0".repeat(64)}`;
  }
  expectThrow(() => assertUnifiedAnimationDocumentV2(mismatchedDigestDocument), "invalid_record");

  await assertStructuredSymbolDigestsV2([definition]);
  const before = JSON.stringify(definition);
  const baseline = { x: 120, y: 200, width: 100, height: 80 };
  const original = resolveStructuredSymbolGeometryV2(definition, baseline)!;
  const wide = resolveStructuredSymbolGeometryV2(definition, { ...baseline, width: 200 })!;
  const tall = resolveStructuredSymbolGeometryV2(definition, { ...baseline, height: 160 })!;
  const corner = resolveStructuredSymbolGeometryV2(definition, { ...baseline, width: 200, height: 160 })!;
  assert.deepEqual(wide.joints.map(j => j.y), original.joints.map(j => j.y));
  assert.deepEqual(tall.joints.map(j => j.x), original.joints.map(j => j.x));
  assert.deepEqual(corner.joints.map(j => j.x), wide.joints.map(j => j.x));
  assert.deepEqual(corner.joints.map(j => j.y), tall.joints.map(j => j.y));
  assert.equal(JSON.stringify(definition), before);
  assert.equal(wide.limbs[0].start, wide.joints[0]);
  for (const mutate of [
    (d: typeof definition) => { d.structuredPayload!.joints[0].x += 0.01; },
    (d: typeof definition) => { delete d.structuredPayload; },
    (d: typeof definition) => { d.structuredPayload!.drawingPngDataUrl = PNG.replace("QyXn", "QyXm"); },
    (d: typeof definition) => { d.pngDataUrl = PNG.replace("QyXn", "QyXm"); },
  ]) {
    const changed = structuredClone(definition); mutate(changed);
    await assert.rejects(() => assertStructuredSymbolDigestsV2([changed]), { message: "invalid_record" });
  }
  for (const mutate of [
    (d: typeof definition) => { d.structuredPayload!.joints[0].x = NaN; },
    (d: typeof definition) => { d.structuredPayload!.joints[0].x = -0.1; },
    (d: typeof definition) => { d.structuredPayload!.joints[0].x = 1.1; },
    (d: typeof definition) => { d.structuredPayload!.limbs[0].endJointId = "missing"; },
    (d: typeof definition) => { d.structuredPayload!.joints.push({ ...d.structuredPayload!.joints[0] }); },
    (d: typeof definition) => { Object.assign(d.structuredPayload!, { version: 2 }); },
    (d: typeof definition) => { Object.assign(d.structuredPayload!, { unexpected: true }); },
    (d: typeof definition) => { d.structuredPayload!.drawingPngDataUrl = null; },
  ]) {
    const changed = structuredClone(document); mutate(changed.catalogs.symbols[0]);
    expectThrow(() => assertUnifiedAnimationDocumentV2(changed), "invalid_record");
  }
  const missingPayload = { ...definition }; delete missingPayload.structuredPayload;
  await assert.rejects(() => createBitmapSymbolDefinitionV2(missingPayload), { message: "structured_symbol_required" });
  // Actual old hash layout, without an extension, remains readable as raster.
  const legacy = { ...missingPayload, definitionDigest: `sha256:${await (async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ name: definition.name, sourceCategory: definition.sourceCategory,
      width: definition.width, height: definition.height, assetSha256: definition.assetSha256 }));
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
  })()}` };
  await assertStructuredSymbolDigestsV2([legacy]);
  assert.equal(resolveStructuredSymbolGeometryV2(legacy, baseline), null);
  return { assertions: 168, symbolDigest: definition.definitionDigest, assetDigests: [imageAsset.assetSha256, fileAsset.assetSha256] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runPhase5CatalogOracle();
  console.log(JSON.stringify({ status: "PASS", ...result }));
}
