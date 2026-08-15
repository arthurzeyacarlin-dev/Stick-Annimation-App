import {
  DRAWING_PROJECT_V2_LIMITS,
  DrawingProjectV2Error,
  assertProjectHydrationCapacity,
  type DrawingProjectAssetV2,
  type DrawingProjectDocumentV2,
  type DrawingProjectRasterAssetV2,
} from "./drawingProjectV2Contract.ts";
import { sha256Hex } from "./drawingProjectV2Canonical.ts";

export type DrawingProjectRasterStageCounts = {
  blobReads: number;
  pngPreflights: number;
  nativeDecodes: number;
  releases: number;
};

export type DecodedDrawingRaster = {
  width: number;
  height: number;
  rgba: Uint8Array;
  release?: () => void;
};

export type DrawingRasterNativeDecoder = (
  encodedBytes: Uint8Array,
  expected: { width: number; height: number },
) => Promise<DecodedDrawingRaster>;

export type DrawingRasterNativeEncoder = (input: {
  width: number;
  height: number;
  rgba: Uint8Array;
}) => Promise<Blob>;

export type DrawingPngPreflight = {
  width: number;
  height: number;
  chunkCount: number;
  idatChunkCount: number;
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const ALLOWED_ANCILLARY = new Map([
  ["cHRM", 32],
  ["gAMA", 4],
  ["sRGB", 1],
  ["pHYs", 9],
]);

const invalidPng = (message: string): never => {
  throw new DrawingProjectV2Error("invalid_png", "raster.png-preflight", message);
};

const unsupportedPng = (message: string): never => {
  throw new DrawingProjectV2Error("unsupported_png", "raster.png-preflight", message);
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export const crc32Png = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const readUint32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0);

const chunkType = (bytes: Uint8Array, offset: number) => {
  let type = "";
  for (let index = 0; index < 4; index += 1) {
    const byte = bytes[offset + index];
    if (!((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) invalidPng("Chunk type is not ASCII alphabetic.");
    type += String.fromCharCode(byte);
  }
  return type;
};

export const preflightDrawingPng = (
  bytes: Uint8Array,
  expected: Pick<DrawingProjectRasterAssetV2, "width" | "height" | "rgbaByteLength">,
): DrawingPngPreflight => {
  if (bytes.byteLength < PNG_SIGNATURE.length || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) invalidPng("Bad PNG signature.");
  let cursor: number = PNG_SIGNATURE.length;
  let chunkCount = 0;
  let idatChunkCount = 0;
  let sawIhdr = false;
  let sawIdat = false;
  let endedIdat = false;
  let sawIend = false;
  const ancillarySeen = new Set<string>();
  let width = 0;
  let height = 0;

  while (cursor < bytes.byteLength) {
    if (sawIend) invalidPng("Bytes follow IEND.");
    if (bytes.byteLength - cursor < 12) invalidPng("Truncated PNG chunk framing.");
    const length = readUint32(bytes, cursor);
    const typeOffset = cursor + 4;
    const type = chunkType(bytes, typeOffset);
    const dataOffset = typeOffset + 4;
    if (length > bytes.byteLength - dataOffset - 4) invalidPng("PNG chunk length exceeds available bytes.");
    const crcOffset = dataOffset + length;
    const nextCursor = crcOffset + 4;
    if (!Number.isSafeInteger(nextCursor) || nextCursor <= cursor) invalidPng("PNG cursor arithmetic overflow.");
    const actualCrc = readUint32(bytes, crcOffset);
    const expectedCrc = crc32Png(bytes.subarray(typeOffset, crcOffset));
    if (actualCrc !== expectedCrc) invalidPng(`Bad CRC for ${type}.`);
    chunkCount += 1;
    if (chunkCount > 4_096) unsupportedPng("PNG has too many chunks.");

    if (!sawIhdr) {
      if (type !== "IHDR") invalidPng("IHDR must be the first chunk.");
      if (length !== 13) invalidPng("IHDR length must be 13.");
      sawIhdr = true;
      width = readUint32(bytes, dataOffset);
      height = readUint32(bytes, dataOffset + 4);
      if (width < 1 || height < 1 || width > DRAWING_PROJECT_V2_LIMITS.rasterDimension || height > DRAWING_PROJECT_V2_LIMITS.rasterDimension) {
        invalidPng("IHDR dimensions are outside the accepted range.");
      }
      if (width !== expected.width || height !== expected.height) invalidPng("IHDR dimensions do not match the asset record.");
      if (bytes[dataOffset + 8] !== 8 || bytes[dataOffset + 9] !== 6 || bytes[dataOffset + 10] !== 0 || bytes[dataOffset + 11] !== 0 || bytes[dataOffset + 12] !== 0) {
        unsupportedPng("PNG profile must be non-interlaced RGBA8 with standard compression/filter methods.");
      }
      if (width > Math.floor(DRAWING_PROJECT_V2_LIMITS.rasterRgbaBytes / 4 / height)) invalidPng("Decoded RGBA multiplication exceeds the limit.");
      if (width * height * 4 !== expected.rgbaByteLength || expected.rgbaByteLength > DRAWING_PROJECT_V2_LIMITS.rasterRgbaBytes) {
        invalidPng("Decoded RGBA byte length does not match the record.");
      }
    } else if (type === "IHDR") {
      unsupportedPng("Duplicate IHDR chunk.");
    } else if (ALLOWED_ANCILLARY.has(type)) {
      if (sawIdat || endedIdat) unsupportedPng("Ancillary chunks must precede IDAT.");
      if (ancillarySeen.has(type)) unsupportedPng(`Duplicate ${type} chunk.`);
      if (length !== ALLOWED_ANCILLARY.get(type)) unsupportedPng(`Unsupported ${type} length.`);
      ancillarySeen.add(type);
    } else if (type === "IDAT") {
      if (endedIdat) unsupportedPng("IDAT chunks must be consecutive.");
      if (length === 0) unsupportedPng("IDAT chunks must be non-empty.");
      sawIdat = true;
      idatChunkCount += 1;
      if (idatChunkCount > 4_090) unsupportedPng("PNG has too many IDAT chunks.");
    } else if (type === "IEND") {
      if (!sawIdat) unsupportedPng("PNG is missing IDAT.");
      if (length !== 0) invalidPng("IEND must be empty.");
      sawIend = true;
    } else {
      if (sawIdat) endedIdat = true;
      unsupportedPng(`Unsupported PNG chunk ${type}.`);
    }

    if (sawIdat && type !== "IDAT" && type !== "IEND") endedIdat = true;
    cursor = nextCursor;
  }
  if (!sawIhdr) invalidPng("PNG is missing IHDR.");
  if (!sawIdat) unsupportedPng("PNG is missing IDAT.");
  if (!sawIend) invalidPng("PNG is missing IEND.");
  if (cursor !== bytes.byteLength) invalidPng("PNG framing does not consume all bytes.");
  return { width, height, chunkCount, idatChunkCount };
};

const readAndPreflight = async (asset: DrawingProjectRasterAssetV2, counts: DrawingProjectRasterStageCounts) => {
  if (asset.encodedByteLength > DRAWING_PROJECT_V2_LIMITS.projectStoredBytes || asset.bytes.size > DRAWING_PROJECT_V2_LIMITS.projectStoredBytes) {
    throw new DrawingProjectV2Error("project_too_large", "raster.encoded-length", "Raster encoded bytes exceed the project limit.");
  }
  if (asset.bytes.size !== asset.encodedByteLength || asset.encodedByteLength < 1) {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "raster.encoded-length", "Raster Blob length does not match its record.");
  }
  counts.blobReads += 1;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await asset.bytes.arrayBuffer());
  } catch {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "raster.blob-read", "Raster Blob could not be read.");
  }
  if (bytes.byteLength > DRAWING_PROJECT_V2_LIMITS.projectStoredBytes) {
    throw new DrawingProjectV2Error("project_too_large", "raster.encoded-length", "Raster encoded bytes exceed the project limit.");
  }
  if (bytes.byteLength !== asset.encodedByteLength || (await sha256Hex(bytes)) !== asset.encodedSha256) {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "raster.encoded-digest", "Raster encoded digest mismatch.");
  }
  counts.pngPreflights += 1;
  preflightDrawingPng(bytes, asset);
  return bytes;
};

export const verifyDrawingRasterAsset = async (
  asset: DrawingProjectRasterAssetV2,
  decoder: DrawingRasterNativeDecoder,
  counts: DrawingProjectRasterStageCounts,
) => {
  const encoded = await readAndPreflight(asset, counts);
  counts.nativeDecodes += 1;
  let decoded: DecodedDrawingRaster;
  try {
    decoded = await decoder(encoded, { width: asset.width, height: asset.height });
  } catch {
    throw new DrawingProjectV2Error("decode_failed", "raster.native-decode", "Native PNG decode failed.");
  }
  try {
    if (decoded.width !== asset.width || decoded.height !== asset.height || decoded.rgba.byteLength !== asset.rgbaByteLength) {
      throw new DrawingProjectV2Error("asset_digest_mismatch", "raster.decoded-shape", "Decoded raster shape mismatch.");
    }
    if ((await sha256Hex(decoded.rgba)) !== asset.rgbaSha256) {
      throw new DrawingProjectV2Error("asset_digest_mismatch", "raster.decoded-digest", "Decoded RGBA digest mismatch.");
    }
    return { width: decoded.width, height: decoded.height, rgba: new Uint8Array(decoded.rgba) };
  } finally {
    if (decoded.release) {
      decoded.release();
      counts.releases += 1;
    }
  }
};

const referencedRasterIds = (document: DrawingProjectDocumentV2) => {
  const ids = new Set<string>();
  for (const layer of document.layers) {
    for (const frame of layer.timelineFrames) {
      if (frame.bitmap) ids.add(frame.bitmap.assetId);
      if (frame.tweenEndBitmap) ids.add(frame.tweenEndBitmap.assetId);
      if (frame.motionTween?.spriteBitmap) ids.add(frame.motionTween.spriteBitmap.assetId);
    }
  }
  return ids;
};

export const verifyDrawingProjectRasters = async (
  document: DrawingProjectDocumentV2,
  assets: readonly DrawingProjectAssetV2[],
  decoder: DrawingRasterNativeDecoder,
  counts: DrawingProjectRasterStageCounts = { blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 },
) => {
  assertProjectHydrationCapacity(document, assets);
  const referencedIds = referencedRasterIds(document);
  const rasters = assets
    .filter((asset): asset is DrawingProjectRasterAssetV2 => asset.kind === "raster-png" && referencedIds.has(asset.assetId))
    .sort((left, right) => right.rgbaByteLength - left.rgbaByteLength || (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0));
  const materializations = new Map<string, { width: number; height: number; rgba: Uint8Array }>();
  for (const raster of rasters) materializations.set(raster.assetId, await verifyDrawingRasterAsset(raster, decoder, counts));
  return { materializations, counts };
};

export const encodeDrawingRasterAsset = async (
  input: { assetId: string; width: number; height: number; rgba: Uint8Array },
  encoder: DrawingRasterNativeEncoder,
  counts: DrawingProjectRasterStageCounts = { blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 },
): Promise<DrawingProjectRasterAssetV2> => {
  if (!Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width < 1 || input.height < 1 || input.width > DRAWING_PROJECT_V2_LIMITS.rasterDimension || input.height > DRAWING_PROJECT_V2_LIMITS.rasterDimension) {
    throw new DrawingProjectV2Error("invalid_record", "raster.encode-input", "Raster dimensions are invalid.");
  }
  if (input.width > Math.floor(DRAWING_PROJECT_V2_LIMITS.rasterRgbaBytes / 4 / input.height) || input.rgba.byteLength !== input.width * input.height * 4) {
    throw new DrawingProjectV2Error("project_too_large", "raster.encode-input", "Raster RGBA length is invalid.");
  }
  let blob: Blob;
  try {
    blob = await encoder(input);
  } catch {
    throw new DrawingProjectV2Error("encode_failed", "raster.native-encode", "Native PNG encode failed.");
  }
  if (!(blob instanceof Blob) || blob.size < 1) throw new DrawingProjectV2Error("encode_failed", "raster.native-encode", "Native encoder returned no PNG bytes.");
  if (blob.size > DRAWING_PROJECT_V2_LIMITS.projectStoredBytes) {
    throw new DrawingProjectV2Error("project_too_large", "raster.encoded-length", "Native encoder output exceeds the project limit.");
  }
  counts.blobReads += 1;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    throw new DrawingProjectV2Error("encode_failed", "raster.encoded-read", "Native encoder output could not be read.");
  }
  if (bytes.byteLength > DRAWING_PROJECT_V2_LIMITS.projectStoredBytes) {
    throw new DrawingProjectV2Error("project_too_large", "raster.encoded-length", "Native encoder output exceeds the project limit.");
  }
  if (bytes.byteLength !== blob.size) {
    throw new DrawingProjectV2Error("encode_failed", "raster.encoded-read", "Native encoder output length changed during read.");
  }
  const asset: DrawingProjectRasterAssetV2 = {
    assetId: input.assetId,
    kind: "raster-png",
    width: input.width,
    height: input.height,
    rgbaByteLength: input.rgba.byteLength,
    rgbaSha256: await sha256Hex(input.rgba),
    encodedByteLength: bytes.byteLength,
    encodedSha256: await sha256Hex(bytes),
    bytes: new Blob([bytes], { type: "image/png" }),
  };
  counts.pngPreflights += 1;
  preflightDrawingPng(bytes, asset);
  return asset;
};
