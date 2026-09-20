import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import type { ProjectCollectionEntry } from "../../src/lib/animation/unifiedProjectCollection.ts";
import { createNativeUnifiedProjectV2 } from "../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";
import {
  exportCollectionEntryIdentityMatches,
  formatExportDuration,
  getExportAuthoredFrameCount,
  resolveExportAuthoringTransform,
  resolveExportOwnerCell,
  resolveExportRasterPlacement,
  resolveExportTweenProgress,
} from "../../src/lib/export/exportPhase1.ts";
import type { UnifiedDrawingRasterItemV2, UnifiedRasterBitmapV2 } from "../../src/lib/animation/unifiedAnimationContentV2.ts";

let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  assertions += 1;
  assert.deepEqual(actual, expected, label);
};

const project = createNativeUnifiedProjectV2("2026-09-20T00:00:00.000Z");
const layer = project.document.layers[0];
const owner = layer.cells[0];

equal(getExportAuthoredFrameCount(project), 1, "blank keyframe is an authored frame");
layer.cells.push(
  { cellId: crypto.randomUUID(), cellType: "hold", ownerCellId: owner.cellId, content: null },
  { cellId: crypto.randomUUID(), cellType: "tween", ownerCellId: owner.cellId, content: null },
  { cellId: crypto.randomUUID(), cellType: "tween", ownerCellId: owner.cellId, content: null },
  { cellId: crypto.randomUUID(), cellType: "empty", ownerCellId: null, content: null },
);
equal(getExportAuthoredFrameCount(project), 4, "trailing empty cells do not extend export duration");
equal(resolveExportOwnerCell(layer, 1)?.cellId, owner.cellId, "hold resolves its exact owner");
equal(resolveExportTweenProgress(layer, 2), 1 / 3, "first tween frame progress");
equal(resolveExportTweenProgress(layer, 3), 2 / 3, "last tween frame progress");
equal(resolveExportTweenProgress(layer, 1), null, "non-tween has no tween progress");

const bitmap = (x: number, y: number): UnifiedRasterBitmapV2 => ({
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]),
  x,
  y,
  stageWidth: 4600,
  stageHeight: 2588,
});
const raster: UnifiedDrawingRasterItemV2 = {
  itemId: crypto.randomUUID(),
  kind: "drawing-raster/v1",
  strokes: [],
  shapes: [],
  bitmap: bitmap(2300, 1294),
  tweenEndBitmap: bitmap(2602, 1294),
  motionTween: {
    mode: "position",
    stageWidth: 4600,
    stageHeight: 2588,
    spriteBitmap: bitmap(0, 0),
    startOrigin: { x: 2000, y: 1200 },
    endOrigin: { x: 2602, y: 1502 },
  },
  sourceTransform: null,
};
owner.cellType = "keyframe";
owner.content = { items: [raster], soundAttachment: null, dormantSourceContent: null };
const authoredPlacement = resolveExportRasterPlacement(layer, 0, raster);
const heldPlacement = resolveExportRasterPlacement(layer, 1, raster);
const firstTweenPlacement = resolveExportRasterPlacement(layer, 2, raster);
const lastTweenPlacement = resolveExportRasterPlacement(layer, 3, raster);
equal(authoredPlacement?.x, 2300, "authored raster keeps its saved full-world x origin");
equal(heldPlacement?.x, 2300, "hold reuses its exact owner raster origin");
equal(firstTweenPlacement?.x, 2201, "first tween raster rounds the workspace interpolation origin");
equal(firstTweenPlacement?.y, 1301, "first tween raster interpolates y in authoring space");
equal(lastTweenPlacement?.x, 2401, "last tween raster rounds the workspace interpolation origin");
equal(lastTweenPlacement?.y, 1401, "last tween raster interpolates y in authoring space");
const transform = resolveExportAuthoringTransform(960, 540, 4600, 2588);
equal(Math.round((transform.offsetX + 2300 * transform.scaleX) * 1000) / 1000, 480, "authoring-world center maps to export center x");
equal(Math.round((transform.offsetY + 1294 * transform.scaleY) * 1000) / 1000, 270, "authoring-world center maps to export center y");
equal(resolveExportRasterPlacement(layer, 2, { ...raster, tweenEndBitmap: null }), null, "incomplete tween stays blank like workspace playback");

const emptyProject = createNativeUnifiedProjectV2("2026-09-20T00:00:00.000Z");
emptyProject.document.layers[0].cells = [{ cellId: crypto.randomUUID(), cellType: "empty", ownerCellId: null, content: null }];
equal(getExportAuthoredFrameCount(emptyProject), 0, "empty animation stays empty instead of inventing a frame");
equal(formatExportDuration(0), "0.0s", "zero duration label");
equal(formatExportDuration(1 / 12), "0.1s", "sub-second duration label");
equal(formatExportDuration(65.25), "1:05.3", "minute duration label");

const entry: ProjectCollectionEntry = {
  id: "unified-v2:one",
  locator: "unified-v2:one",
  title: "One",
  updatedAt: "2026-09-20T00:00:00.000Z",
  classification: "canonical",
  sourceKind: "unified-v2",
  sourceId: project.projectId,
  sourceDigest: project.projectId,
  candidateDigest: project.projectId,
  error: null,
  protectedSource: false,
  provenanceKey: null,
};
equal(exportCollectionEntryIdentityMatches(entry, { ...entry }), true, "unchanged saved source remains selectable");
for (const [field, value] of [
  ["locator", "unified-v2:other"],
  ["sourceId", crypto.randomUUID()],
  ["sourceDigest", "changed"],
  ["candidateDigest", "changed"],
  ["updatedAt", "2026-09-20T00:00:01.000Z"],
] as const) {
  equal(exportCollectionEntryIdentityMatches(entry, { ...entry, [field]: value }), false, `stale ${field} is rejected`);
}

const result = {
  kind: "spec0009-phase1-oracle",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    authoredFrameCount: 4,
    exactDurationSeconds: 4 / project.document.fps,
    staleIdentityMutationsRejected: 5,
    rasterParityAssertions: 9,
    externalRequests: 0,
    repositoryWrites: 0,
    aiCalls: 0,
  },
};
mkdirSync("output/spec-0009/phase-1", { recursive: true });
writeFileSync("output/spec-0009/phase-1/oracle.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
