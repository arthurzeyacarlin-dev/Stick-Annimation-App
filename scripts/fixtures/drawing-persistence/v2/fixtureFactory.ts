import { deflateSync } from "node:zlib";

import {
  type DrawingProjectAudioAssetV2,
  type DrawingProjectDocumentV2,
  type DrawingProjectRasterAssetV2,
  type DrawingProjectVersionRecordV2,
} from "../../../../src/lib/drawingProjectV2Contract.ts";
import {
  calculateDocumentDigest,
  calculateStoredByteLength,
  sha256Hex,
} from "../../../../src/lib/drawingProjectV2Canonical.ts";
import { crc32Png } from "../../../../src/lib/drawingProjectRasterCodec.ts";

const uint32 = (value: number) => new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);

export const pngChunk = (type: string, data: Uint8Array) => {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.byteLength);
  const chunk = new Uint8Array(12 + data.byteLength);
  chunk.set(uint32(data.byteLength), 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.set(uint32(crc32Png(crcInput)), 8 + data.byteLength);
  return chunk;
};

export const concatenateBytes = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};

export const createPngBytes = (width: number, height: number, rgba: Uint8Array) => {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr.set(uint32(width), 0);
  ihdr.set(uint32(height), 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * width * 4;
    const targetOffset = row * (1 + width * 4);
    scanlines[targetOffset] = 0;
    scanlines.set(rgba.subarray(sourceOffset, sourceOffset + width * 4), targetOffset + 1);
  }
  return concatenateBytes(signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", Uint8Array.from(deflateSync(scanlines))), pngChunk("IEND", new Uint8Array()));
};

export const createRasterAsset = async (
  assetId = "raster-primary",
  width = 1,
  height = 1,
  rgba = new Uint8Array([17, 34, 51, 255]),
): Promise<DrawingProjectRasterAssetV2> => {
  const encoded = createPngBytes(width, height, rgba);
  return {
    assetId,
    kind: "raster-png",
    width,
    height,
    rgbaByteLength: rgba.byteLength,
    rgbaSha256: await sha256Hex(rgba),
    encodedByteLength: encoded.byteLength,
    encodedSha256: await sha256Hex(encoded),
    bytes: new Blob([encoded], { type: "image/png" }),
  };
};

export const TEST_WAV_BYTES = new Uint8Array([
  82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
  16, 0, 0, 0, 1, 0, 1, 0, 64, 31, 0, 0, 128, 62, 0, 0,
  2, 0, 16, 0, 100, 97, 116, 97, 0, 0, 0, 0,
]);

export const createAudioAsset = async (assetId = "audio-primary"): Promise<DrawingProjectAudioAssetV2> => ({
  assetId,
  kind: "audio",
  mimeType: "audio/wav",
  byteLength: TEST_WAV_BYTES.byteLength,
  sha256: await sha256Hex(TEST_WAV_BYTES),
  bytes: new Blob([TEST_WAV_BYTES], { type: "audio/wav" }),
});

export const createRepresentativeDocument = (
  rasterAssetId = "raster-primary",
  audioAssetId = "audio-primary",
): DrawingProjectDocumentV2 => ({
  kind: "diamond-drawing-document",
  schemaVersion: 2,
  activeTool: "Brush",
  brushSize: 12,
  eraserSize: 24,
  fillColor: "#123456",
  timelineFps: 12,
  shapeType: "Circle",
  activeLayerId: "layer-α",
  currentFrameIndex: 1,
  selectedTimelineIndex: 1,
  isOnionEnabled: true,
  layers: [
    {
      id: "layer-α",
      name: "Ink α",
      orderIndex: 0,
      timelineFrames: [
        {
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
            id: "sound-1",
            title: "Exact wave",
            description: "Fixture audio",
            timingFeel: "snappy",
            intensityFeel: null,
            audioDataUrl: { assetId: audioAssetId },
            contentType: "sfx",
            speechText: null,
            sourceTask: "generate-sounds",
            attachedAt: "2026-08-15T00:00:00.000Z",
          },
          textObjects: [
            {
              id: "text-1",
              text: "Café 🎬",
              x: 10.5,
              y: 20.25,
              width: 260,
              flipX: false,
              flipY: true,
              rotation: 12.5,
              fontFamily: "Arial",
              fontSize: 42,
              color: "#101418",
              bold: true,
              italic: false,
            },
          ],
        },
        {
          id: 2,
          kind: "tween",
          cellType: "tween",
          stateId: 1,
          isBlank: false,
          hasTweenEndpoint: true,
          bitmap: null,
          tweenEndBitmap: { assetId: rasterAssetId },
          motionTween: {
            mode: "position",
            stageWidth: 1280,
            stageHeight: 720,
            spriteBitmap: { assetId: rasterAssetId },
            startOrigin: { x: 12.25, y: 14.5 },
            endOrigin: { x: 300.75, y: 220.125 },
          },
          soundAttachment: null,
          textObjects: [],
        },
        {
          id: 3,
          kind: "keyframe",
          cellType: "blank-keyframe",
          stateId: 3,
          isBlank: true,
          hasTweenEndpoint: false,
          bitmap: null,
          tweenEndBitmap: null,
          motionTween: null,
          soundAttachment: null,
          textObjects: [],
        },
        {
          id: 4,
          kind: "frame",
          cellType: "hold",
          stateId: 3,
          isBlank: false,
          hasTweenEndpoint: false,
          bitmap: null,
          tweenEndBitmap: null,
          motionTween: null,
          soundAttachment: null,
          textObjects: [],
        },
      ],
    },
    {
      id: "layer-2",
      name: "Color",
      orderIndex: 1,
      timelineFrames: [
        { id: 5, kind: "keyframe", cellType: "keyframe", stateId: 5, isBlank: false, hasTweenEndpoint: false, bitmap: null, tweenEndBitmap: null, motionTween: null, soundAttachment: null, textObjects: [] },
        { id: 6, kind: "frame", cellType: "empty", stateId: 5, isBlank: false, hasTweenEndpoint: false, bitmap: null, tweenEndBitmap: null, motionTween: null, soundAttachment: null, textObjects: [] },
        { id: 7, kind: "frame", cellType: "hold", stateId: 5, isBlank: false, hasTweenEndpoint: false, bitmap: null, tweenEndBitmap: null, motionTween: null, soundAttachment: null, textObjects: [] },
        { id: 8, kind: "frame", cellType: "empty", stateId: 5, isBlank: false, hasTweenEndpoint: false, bitmap: null, tweenEndBitmap: null, motionTween: null, soundAttachment: null, textObjects: [] },
      ],
    },
  ],
  nextTimelineFrameId: 9,
  nextLayerNumber: 3,
});

export const createVersionRecord = async (
  projectId = "project-fixture",
  storageRevision = 1,
): Promise<DrawingProjectVersionRecordV2> => {
  const raster = await createRasterAsset();
  const audio = await createAudioAsset();
  const document = createRepresentativeDocument(raster.assetId, audio.assetId);
  const documentDigest = await calculateDocumentDigest(document, [raster, audio]);
  const base = {
    kind: "diamond-drawing-project" as const,
    schemaVersion: 2 as const,
    projectId,
    storageRevision,
    documentDigest,
    document,
    assets: [raster, audio],
  };
  return { ...base, storedByteLength: calculateStoredByteLength(base) };
};

export const createLegacyProject = (id = "legacy-project") => ({
  id,
  name: `Legacy ${id}`,
  data: {
    version: 1,
    activeTool: "Brush",
    brushSize: 10,
    eraserSize: 20,
    fillColor: "#000000",
    timelineFps: 12,
    shapeType: "Square",
    activeLayerId: "legacy-layer",
    currentFrameIndex: 0,
    selectedTimelineIndex: 0,
    isOnionEnabled: false,
    layers: [
      {
        id: "legacy-layer",
        name: "Layer 1",
        orderIndex: 0,
        timelineFrames: [
          {
            id: 1,
            kind: "keyframe",
            cellType: "keyframe",
            stateId: 1,
            bitmap: null,
            previewUrl: null,
            tweenEndBitmap: null,
            tweenEndPreviewUrl: null,
            motionTween: null,
            soundAttachment: {
              id: "legacy-sound",
              title: "Legacy",
              description: "Defaults fixture",
              sourceTask: "generate-sounds",
              attachedAt: "2026-08-15T00:00:00.000Z",
            },
            textObjects: [],
          },
        ],
      },
    ],
    nextTimelineFrameId: 2,
    nextLayerNumber: 2,
  },
  previewDataUrl: null,
  aiMemory: null,
  created_at: "2026-08-15T00:00:00.000Z",
  updated_at: "2026-08-15T00:00:00.000Z",
});
