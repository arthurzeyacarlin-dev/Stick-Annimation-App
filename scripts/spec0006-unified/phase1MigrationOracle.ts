import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// This deliberately independent oracle traverses adversarial JSON-shaped fixture data.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;

const canonical = (value: any): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};

const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

const sourceAssetFactsV1 = (source: AnyRecord) => {
  const facts = new Map<string, { kind: string; byteLength: number; sha256: string; width?: number; height?: number }>();
  const visitBitmap = (bitmap: AnyRecord | null | undefined) => {
    if (!bitmap) return;
    const bytes = Uint8Array.from(bitmap.data);
    facts.set(`raster-rgba-${sha(bytes)}`, { kind: "drawing-raster-rgba", byteLength: bytes.byteLength, sha256: sha(bytes), width: bitmap.width, height: bitmap.height });
  };
  for (const layer of source.data.layers) for (const frame of layer.timelineFrames) {
    visitBitmap(frame.bitmap);
    visitBitmap(frame.tweenEndBitmap);
    visitBitmap(frame.motionTween?.spriteBitmap);
    if (frame.soundAttachment?.audioDataUrl) {
      const bytes = Uint8Array.from(Buffer.from(frame.soundAttachment.audioDataUrl.split(",")[1], "base64"));
      facts.set(`audio-${sha(bytes)}`, { kind: "drawing-audio-wav", byteLength: bytes.byteLength, sha256: sha(bytes) });
    }
  }
  return facts;
};

const assertCells = (sourceCells: AnyRecord[], candidateCells: AnyRecord[], kind: "drawing" | "stick") => {
  assert.equal(candidateCells.length, sourceCells.length);
  sourceCells.forEach((sourceCell, index) => {
    const cell = candidateCells[index];
    assert.equal(cell.sourceCellId, String(sourceCell.id));
    assert.equal(cell.sourceStateId, sourceCell.stateId);
    assert.equal(cell.kind, sourceCell.kind);
    assert.equal(cell.cellType, sourceCell.cellType);
    if (sourceCell.cellType === "hold") assert.equal(typeof cell.ownerCellId, "string");
    if (sourceCell.cellType === "empty") assert.equal(cell.payload, null);
    if (kind === "stick" && sourceCell.content) assert.equal(canonical(cell.payload), canonical(sourceCell.content));
  });
};

export const independentlyAssertDrawingV1Migration = (source: AnyRecord, candidate: AnyRecord) => {
  let assertions = 0;
  const equal = (left: unknown, right: unknown) => { assertions += 1; assert.deepEqual(left, right); };
  equal(candidate.provenance.sourceKind, "drawing-v1");
  equal(candidate.provenance.sourceProjectId, source.id);
  equal(candidate.provenance.sourceRecordDigest, sha(canonical(source)));
  equal(candidate.title, source.name);
  equal(candidate.document.fps, source.data.timelineFps);
  equal(candidate.document.reopenState.currentFrameIndex, source.data.currentFrameIndex);
  equal(candidate.document.reopenState.selectedTimelineIndex, source.data.selectedTimelineIndex);
  equal(candidate.document.reopenState.onionEnabled, source.data.isOnionEnabled);
  equal(candidate.document.drawingState.activeTool, source.data.activeTool);
  equal(candidate.document.drawingState.brushSize, source.data.brushSize);
  equal(candidate.document.drawingState.eraserSize, source.data.eraserSize);
  equal(candidate.document.drawingState.fillColor, source.data.fillColor);
  equal(candidate.document.drawingState.shapeType, source.data.shapeType);
  equal(candidate.document.layers.length, source.data.layers.length);
  const sourceLayers = [...source.data.layers].sort((a, b) => a.orderIndex - b.orderIndex);
  sourceLayers.forEach((layer, index) => {
    const mapped = candidate.document.layers[index];
    equal(mapped.sourceLayerId, layer.id);
    equal(mapped.sourceOrderIndex, layer.orderIndex);
    equal(mapped.name, layer.name);
    assertions += layer.timelineFrames.length * 5;
    assertCells(layer.timelineFrames, mapped.cells, "drawing");
    layer.timelineFrames.forEach((frame: AnyRecord, frameIndex: number) => {
      const payload = mapped.cells[frameIndex].payload;
      if (!payload) return;
      equal(payload.textObjects, (frame.textObjects ?? []).map((text: AnyRecord) => ({ flipX: false, flipY: false, rotation: 0, ...text })));
      if (frame.motionTween) {
        equal(payload.motionTween.stageWidth, frame.motionTween.stageWidth);
        equal(payload.motionTween.stageHeight, frame.motionTween.stageHeight);
        equal(payload.motionTween.startOrigin, frame.motionTween.startOrigin);
        equal(payload.motionTween.endOrigin, frame.motionTween.endOrigin);
      }
      if (frame.soundAttachment) {
        equal(payload.soundAttachment.title, frame.soundAttachment.title);
        equal(payload.soundAttachment.description, frame.soundAttachment.description);
      }
    });
  });
  const facts = sourceAssetFactsV1(source);
  equal(candidate.assets.length, facts.size);
  for (const asset of candidate.assets) {
    const fact = facts.get(asset.assetId);
    assert.ok(fact, `Unexpected migrated asset ${asset.assetId}`);
    assertions += 3;
    assert.equal(asset.kind, fact.kind);
    assert.equal(asset.byteLength, fact.byteLength);
    assert.equal(asset.sha256, fact.sha256);
  }
  return assertions;
};

export const independentlyAssertDrawingV2Migration = (head: AnyRecord, record: AnyRecord, candidate: AnyRecord) => {
  let assertions = 0;
  const equal = (left: unknown, right: unknown) => { assertions += 1; assert.deepEqual(left, right); };
  equal(candidate.provenance.sourceKind, "drawing-v2");
  equal(candidate.provenance.sourceProjectId, head.projectId);
  equal(candidate.title, head.title);
  equal(candidate.sourceRevision, record.storageRevision);
  equal(candidate.document.fps, record.document.timelineFps);
  equal(candidate.document.layers.length, record.document.layers.length);
  record.document.layers.forEach((layer: AnyRecord, index: number) => {
    const mapped = candidate.document.layers[index];
    equal(mapped.sourceLayerId, layer.id);
    equal(mapped.name, layer.name);
    assertions += layer.timelineFrames.length * 5;
    assertCells(layer.timelineFrames, mapped.cells, "drawing");
    layer.timelineFrames.forEach((frame: AnyRecord, frameIndex: number) => {
      const payload = mapped.cells[frameIndex].payload;
      if (frame.textObjects && payload) equal(payload.textObjects, frame.textObjects);
    });
  });
  equal(candidate.assets.length, record.assets.length);
  record.assets.forEach((sourceAsset: AnyRecord) => {
    const digest = sourceAsset.kind === "raster-png" ? sourceAsset.encodedSha256 : sourceAsset.sha256;
    const mapped = candidate.assets.find((asset: AnyRecord) => asset.sha256 === digest);
    assertions += 1;
    assert.ok(mapped, `Source asset digest ${digest} is preserved`);
    equal(mapped.byteLength, sourceAsset.kind === "raster-png" ? sourceAsset.encodedByteLength : sourceAsset.byteLength);
    if (sourceAsset.kind === "raster-png") {
      equal(mapped.rgbaSha256, sourceAsset.rgbaSha256);
      equal(mapped.rgbaByteLength, sourceAsset.rgbaByteLength);
    }
  });
  return assertions;
};

export const independentlyAssertStickMigration = (source: AnyRecord, candidate: AnyRecord) => {
  let assertions = 0;
  const equal = (left: unknown, right: unknown) => { assertions += 1; assert.deepEqual(left, right); };
  equal(candidate.provenance.sourceKind, source.recordVersion === 1 ? "stick-v1" : "stick-v2");
  equal(candidate.provenance.sourceProjectId, source.projectId);
  equal(candidate.provenance.sourceRecordDigest, sha(canonical(source)));
  equal(candidate.title, source.document.title);
  equal(candidate.document.fps, source.document.fps);
  equal(candidate.document.stickState.documentRevision, source.document.documentRevision);
  equal(candidate.document.stickState.nextFrameId, source.document.nextFrameId);
  equal(candidate.document.stickState.nextStateId, source.document.nextStateId);
  equal(candidate.document.stickState.nextLayerNumber, source.document.nextLayerNumber);
  equal(candidate.document.layers.length, source.document.layers.length);
  source.document.layers.forEach((layer: AnyRecord, index: number) => {
    const mapped = candidate.document.layers[index];
    equal(mapped.sourceLayerId, layer.id);
    equal(mapped.name, layer.name);
    assertions += layer.frames.length * 5;
    assertCells(layer.frames, mapped.cells, "stick");
  });
  equal(candidate.assets, []);
  equal(candidate.document.reopenState.currentFrameIndex, source.reopenState.currentFrameIndex);
  equal(candidate.document.reopenState.selectedTimelineIndex, source.reopenState.selectedTimelineIndex);
  equal(candidate.auxiliary.stickAiCreationLatch.status, source.recordVersion === 2 ? source.aiCreationLatch.status : "consumed");
  assert.notEqual(candidate.projectId, source.projectId);
  assertions += 1;
  return assertions;
};

export const independentCanonicalDigest = (value: unknown) => sha(canonical(value));
