import {
  calculateDocumentDigest,
  calculateStoredByteLength,
  sha256Hex,
} from "../../src/lib/drawingProjectV2Canonical.ts";
import type {
  DrawingProjectAssetV2,
  DrawingProjectDocumentV2,
  DrawingProjectHeadV2,
  DrawingProjectVersionRecordV2,
} from "../../src/lib/drawingProjectV2Contract.ts";
import type { StoredDrawingProject } from "../../src/lib/drawingProjectStorage.ts";
import type { StickSavedProjectRecordV1 } from "../../src/lib/stickProjectStorage.ts";

export const SOURCE_PROJECT_ID = "60000000-0000-4000-8000-000000000001";
export const FIXTURE_TIME = "2026-09-09T00:00:00.000Z";
export const WAV_BYTES = Uint8Array.from([82, 73, 70, 70, 4, 0, 0, 0, 87, 65, 86, 69]);
export const PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
export const RGBA_BYTES = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 128]);

const clone = <T>(value: T): T => structuredClone(value);

export const createDrawingV1Fixture = (variation = 0): StoredDrawingProject => ({
  id: SOURCE_PROJECT_ID,
  name: variation % 2 === 0 ? "Unified migration é" : "Unified migration boundary",
  data: {
    version: 1,
    activeTool: (["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"] as const)[variation % 8],
    brushSize: variation,
    eraserSize: 1 + variation,
    fillColor: variation % 2 === 0 ? "#123456" : "rgba(1,2,3,0.5)",
    timelineFps: 1 + (variation % 55),
    shapeType: (["Square", "Triangle", "Circle"] as const)[variation % 3],
    activeLayerId: "drawing-layer-a",
    currentFrameIndex: variation % 4,
    selectedTimelineIndex: variation % 4,
    isOnionEnabled: variation % 2 === 0,
    layers: [{
      id: "drawing-layer-a",
      name: "Action layer",
      orderIndex: 7,
      timelineFrames: [
        {
          id: 10,
          kind: "keyframe",
          cellType: "keyframe",
          stateId: 10,
          isBlank: false,
          hasTweenEndpoint: false,
          bitmap: { width: 2, height: 2, data: Array.from(RGBA_BYTES) },
          previewUrl: null,
          tweenEndBitmap: null,
          tweenEndPreviewUrl: null,
          motionTween: null,
          soundAttachment: {
            id: "fixture-sound",
            title: "Exact WAV",
            description: "Read-only bytes",
            timingFeel: "snappy",
            intensityFeel: "medium",
            audioDataUrl: `data:audio/wav;base64,${Buffer.from(WAV_BYTES).toString("base64")}`,
            contentType: "sfx",
            speechText: null,
            sourceTask: "generate-sounds",
            attachedAt: FIXTURE_TIME,
          },
          textObjects: [{
            id: "fixture-text",
            text: "Exact text é",
            x: 12.5,
            y: 24.25,
            width: 140,
            flipX: true,
            flipY: false,
            rotation: 12,
            fontFamily: "Arial",
            fontSize: 24,
            color: "#abcdef",
            bold: true,
            italic: true,
          }],
        },
        {
          id: 11,
          kind: "tween",
          cellType: "tween",
          stateId: 11,
          isBlank: false,
          hasTweenEndpoint: true,
          bitmap: { width: 2, height: 2, data: Array.from(RGBA_BYTES) },
          previewUrl: null,
          tweenEndBitmap: { width: 2, height: 2, data: Array.from(RGBA_BYTES).reverse() },
          tweenEndPreviewUrl: null,
          motionTween: {
            mode: "position",
            stageWidth: 640,
            stageHeight: 360,
            spriteBitmap: { width: 2, height: 2, data: Array.from(RGBA_BYTES) },
            startOrigin: { x: 12.5, y: 24.25 },
            endOrigin: { x: 300.75, y: 180.5 },
          },
          soundAttachment: null,
          textObjects: [],
        },
        { id: 12, kind: "frame", cellType: "hold", stateId: 11, isBlank: false, hasTweenEndpoint: false, bitmap: null, previewUrl: null, tweenEndBitmap: null, tweenEndPreviewUrl: null, motionTween: null, soundAttachment: null, textObjects: [] },
        { id: 13, kind: "keyframe", cellType: "blank-keyframe", stateId: 13, isBlank: true, hasTweenEndpoint: false, bitmap: null, previewUrl: null, tweenEndBitmap: null, tweenEndPreviewUrl: null, motionTween: null, soundAttachment: null, textObjects: [] },
      ],
    }],
    nextTimelineFrameId: 14,
    nextLayerNumber: 9,
  },
  previewDataUrl: null,
  created_at: FIXTURE_TIME,
  updated_at: FIXTURE_TIME,
});

export const createDrawingV2Fixture = async (variation = 0): Promise<{ head: DrawingProjectHeadV2; record: DrawingProjectVersionRecordV2 }> => {
  const rasterSha = await sha256Hex(RGBA_BYTES);
  const encodedSha = await sha256Hex(PNG_BYTES);
  const audioSha = await sha256Hex(WAV_BYTES);
  const rasterAssetId = `raster-${rasterSha}`;
  const audioAssetId = `audio-${audioSha}`;
  const assets: DrawingProjectAssetV2[] = [
    {
      assetId: rasterAssetId,
      kind: "raster-png",
      width: 2,
      height: 2,
      rgbaByteLength: RGBA_BYTES.byteLength,
      rgbaSha256: rasterSha,
      encodedByteLength: PNG_BYTES.byteLength,
      encodedSha256: encodedSha,
      bytes: new Blob([PNG_BYTES.slice()], { type: "image/png" }),
    },
    {
      assetId: audioAssetId,
      kind: "audio",
      mimeType: "audio/wav",
      byteLength: WAV_BYTES.byteLength,
      sha256: audioSha,
      bytes: new Blob([WAV_BYTES.slice()], { type: "audio/wav" }),
    },
  ];
  const document: DrawingProjectDocumentV2 = {
    kind: "diamond-drawing-document",
    schemaVersion: 2,
    activeTool: variation % 2 === 0 ? "Brush" : "Knife",
    brushSize: 3 + variation,
    eraserSize: 9 + variation,
    fillColor: "#445566",
    timelineFps: 12 + (variation % 2) * 12,
    shapeType: "Circle",
    activeLayerId: "drawing-v2-layer",
    currentFrameIndex: 0,
    selectedTimelineIndex: 0,
    isOnionEnabled: true,
    nextTimelineFrameId: 3,
    nextLayerNumber: 2,
    layers: [{
      id: "drawing-v2-layer",
      name: "V2 layer",
      orderIndex: 0,
      timelineFrames: [{
        id: 1,
        kind: "keyframe",
        cellType: "keyframe",
        stateId: 1,
        isBlank: false,
        hasTweenEndpoint: false,
        bitmap: { assetId: rasterAssetId },
        tweenEndBitmap: null,
        motionTween: null,
        soundAttachment: {
          id: "v2-sound",
          title: "V2 WAV",
          description: "Exact encoded source",
          timingFeel: null,
          intensityFeel: null,
          audioDataUrl: { assetId: audioAssetId },
          contentType: "sfx",
          speechText: null,
          sourceTask: "generate-sounds",
          attachedAt: FIXTURE_TIME,
        },
        textObjects: [{ id: "v2-text", text: "V2", x: 1, y: 2, width: 30, flipX: false, flipY: true, rotation: 1, fontFamily: "Verdana", fontSize: 12, color: "#fff", bold: false, italic: true }],
      }, {
        id: 2,
        kind: "frame",
        cellType: "hold",
        stateId: 1,
        isBlank: false,
        hasTweenEndpoint: false,
        bitmap: null,
        tweenEndBitmap: null,
        motionTween: null,
        soundAttachment: null,
        textObjects: [],
      }],
    }],
  };
  const documentDigest = await calculateDocumentDigest(document, assets);
  const incomplete = { kind: "diamond-drawing-project" as const, schemaVersion: 2 as const, projectId: SOURCE_PROJECT_ID, storageRevision: 3, documentDigest, document, assets };
  const storedByteLength = calculateStoredByteLength(incomplete);
  const record: DrawingProjectVersionRecordV2 = { ...incomplete, storedByteLength };
  const head: DrawingProjectHeadV2 = {
    kind: "diamond-drawing-project-head",
    schemaVersion: 2,
    projectId: SOURCE_PROJECT_ID,
    title: `Drawing V2 ${variation}`,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    activeStorageRevision: 3,
    documentDigest,
    activeStoredByteLength: storedByteLength,
  };
  return { head, record };
};

const stickContent = (offset = 0) => ({
  figures: [{ id: "figure-a", name: "Editable figure", x: 960, y: 540, scale: 1, rotation: 0 }],
  structureGraph: {
    joints: [
      { id: "head", x: 960 + offset, y: 300 },
      { id: "neck", x: 960, y: 380 },
      { id: "hip", x: 960, y: 600 },
    ],
    limbs: [
      { id: "head-neck", startJointId: "head", endJointId: "neck" },
      { id: "neck-hip", startJointId: "neck", endJointId: "hip" },
    ],
    activeJointId: "head",
  },
});

export const createStickFixture = (recordVersion: 1 | 2, variation = 0): StickSavedProjectRecordV1 => {
  const document = {
    schemaVersion: 1 as const,
    projectType: "stick-figure" as const,
    projectId: SOURCE_PROJECT_ID,
    documentRevision: variation,
    title: `Stick ${recordVersion} ${variation}`,
    fps: 12 + (variation % 2) * 12,
    layers: [{
      id: "stick-layer-a",
      name: "Rig layer",
      frames: [
        { id: 1, kind: "keyframe" as const, cellType: "keyframe" as const, stateId: 1, isBlank: false, hasTweenEndpoint: false as const, content: stickContent(variation) },
        { id: 2, kind: "frame" as const, cellType: "hold" as const, stateId: 1, isBlank: false, hasTweenEndpoint: false as const },
        { id: 3, kind: "keyframe" as const, cellType: "blank-keyframe" as const, stateId: 3, isBlank: true, hasTweenEndpoint: false as const, content: { figures: [], structureGraph: { joints: [], limbs: [], activeJointId: null } } },
      ],
    }],
    nextFrameId: 4,
    nextStateId: 4,
    nextLayerNumber: 2,
  };
  const common = {
    projectId: SOURCE_PROJECT_ID,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    document,
    reopenState: { activeLayerId: "stick-layer-a", currentFrameIndex: variation % 3, selectedTimelineIndex: variation % 3 },
  };
  return recordVersion === 1
    ? { recordVersion: 1, ...common }
    : { recordVersion: 2, ...common, aiCreationLatch: { latchVersion: 1, projectId: SOURCE_PROJECT_ID, status: variation % 2 === 0 ? "unconsumed" : "consumed" } };
};

export const cloneFixture = clone;
