import type { UnifiedProjectAssetV2 } from "../unifiedAnimationContractV2.ts";
import { createProjectAssetV2 } from "../unifiedProjectCatalogV2.ts";

export const STATIC_ASSET_IMPORT_LIMITS = Object.freeze({
  maximumBatchFiles: 32,
  maximumEncodedBytes: 16_777_216,
  maximumDimension: 8_192,
  maximumDecodedPixels: 33_554_432,
  maximumDecodedRgbaBytes: 134_217_728,
});

export type SupportedStaticAssetMime = "image/png" | "image/jpeg" | "image/webp";
export type StaticAssetInspection = {
  mimeType: SupportedStaticAssetMime;
  formatLabel: "PNG" | "JPEG" | "WebP";
  width: number;
  height: number;
};

export class StaticAssetImportError extends Error {
  readonly code: string;
  readonly fileName: string | null;
  constructor(code: string, fileName: string | null = null) {
    super(code);
    this.name = "StaticAssetImportError";
    this.code = code;
    this.fileName = fileName;
  }
}

const fail = (code: string, fileName: string | null = null): never => {
  throw new StaticAssetImportError(code, fileName);
};
const u16be = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];
const u16le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u24le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
const u32be = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
const u32le = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const extensionMime = (name: string): SupportedStaticAssetMime | null => {
  const extension = name.trim().toLocaleLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
};

const detectedMime = (bytes: Uint8Array): SupportedStaticAssetMime | null => {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
};

const inspectPng = (bytes: Uint8Array) => {
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail("asset_corrupt");
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const next = offset + 12 + length;
    if (next > bytes.length) fail("asset_truncated");
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) fail("asset_corrupt");
      width = u32be(bytes, offset + 8);
      height = u32be(bytes, offset + 12);
      sawHeader = true;
    } else if (type === "IHDR") {
      fail("asset_corrupt");
    }
    if (type === "acTL") fail("asset_animated");
    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      if (length !== 0 || next !== bytes.length) fail("asset_corrupt");
      sawEnd = true;
      break;
    }
    offset = next;
  }
  if (!sawHeader || !sawImageData || !sawEnd) fail("asset_truncated");
  return { width, height };
};

const JPEG_START_OF_FRAME = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const inspectJpeg = (bytes: Uint8Array) => {
  if (bytes.length < 4 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) fail("asset_truncated");
  let offset = 2;
  let width = 0;
  let height = 0;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) fail("asset_corrupt");
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) fail("asset_truncated");
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) fail("asset_truncated");
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) fail("asset_truncated");
    if (JPEG_START_OF_FRAME.has(marker)) {
      if (length < 7) fail("asset_corrupt");
      height = u16be(bytes, offset + 3);
      width = u16be(bytes, offset + 5);
    }
    if (marker === 0xda) break;
    offset += length;
  }
  if (!width || !height) fail("asset_corrupt");
  return { width, height };
};

const inspectWebp = (bytes: Uint8Array) => {
  if (bytes.length < 20 || u32le(bytes, 4) + 8 !== bytes.length) fail("asset_truncated");
  let offset = 12;
  let width = 0;
  let height = 0;
  let sawImagePayload = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail("asset_truncated");
    const type = ascii(bytes, offset, 4);
    const length = u32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    const next = dataOffset + length + (length % 2);
    if (next > bytes.length) fail("asset_truncated");
    if (type === "ANIM" || type === "ANMF") fail("asset_animated");
    if (type === "VP8X") {
      if (length !== 10) fail("asset_corrupt");
      if ((bytes[dataOffset] & 0x02) !== 0) fail("asset_animated");
      width = u24le(bytes, dataOffset + 4) + 1;
      height = u24le(bytes, dataOffset + 7) + 1;
    } else if (type === "VP8 ") {
      if (length < 10 || bytes[dataOffset + 3] !== 0x9d || bytes[dataOffset + 4] !== 0x01 || bytes[dataOffset + 5] !== 0x2a) fail("asset_corrupt");
      const payloadWidth = u16le(bytes, dataOffset + 6) & 0x3fff;
      const payloadHeight = u16le(bytes, dataOffset + 8) & 0x3fff;
      if (width && (width !== payloadWidth || height !== payloadHeight)) fail("asset_dimension_mismatch");
      width = payloadWidth;
      height = payloadHeight;
      sawImagePayload = true;
    } else if (type === "VP8L") {
      if (length < 5 || bytes[dataOffset] !== 0x2f) fail("asset_corrupt");
      const b1 = bytes[dataOffset + 1], b2 = bytes[dataOffset + 2], b3 = bytes[dataOffset + 3], b4 = bytes[dataOffset + 4];
      const payloadWidth = 1 + b1 + ((b2 & 0x3f) << 8);
      const payloadHeight = 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10);
      if (width && (width !== payloadWidth || height !== payloadHeight)) fail("asset_dimension_mismatch");
      width = payloadWidth;
      height = payloadHeight;
      sawImagePayload = true;
    }
    offset = next;
  }
  if (offset !== bytes.length || !sawImagePayload || !width || !height) fail("asset_corrupt");
  return { width, height };
};

const assertDimensions = (width: number, height: number) => {
  const limits = STATIC_ASSET_IMPORT_LIMITS;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail("asset_zero_dimension");
  if (width > limits.maximumDimension || height > limits.maximumDimension) fail("asset_dimension_limit");
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > limits.maximumDecodedPixels || pixels * 4 > limits.maximumDecodedRgbaBytes) fail("asset_decode_limit");
};

export function inspectStaticAssetBytes(input: { name: string; mimeType: string; declaredSize: number; bytes: Uint8Array }): StaticAssetInspection {
  const { name, mimeType, declaredSize, bytes } = input;
  const limits = STATIC_ASSET_IMPORT_LIMITS;
  if (!name.trim()) fail("asset_name_required", name);
  if (!Number.isSafeInteger(declaredSize) || declaredSize !== bytes.byteLength) fail("asset_size_mismatch", name);
  if (declaredSize < 1) fail("asset_empty", name);
  if (declaredSize > limits.maximumEncodedBytes) fail("asset_file_limit", name);
  const byExtension = extensionMime(name);
  const bySignature = detectedMime(bytes);
  if (!byExtension || !bySignature || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) fail("asset_unsupported_type", name);
  if (byExtension !== bySignature || mimeType !== bySignature) fail("asset_type_mismatch", name);
  const supportedMime = bySignature as SupportedStaticAssetMime;
  let dimensions: { width: number; height: number };
  try {
    dimensions = supportedMime === "image/png" ? inspectPng(bytes) : supportedMime === "image/jpeg" ? inspectJpeg(bytes) : inspectWebp(bytes);
  } catch (error) {
    if (error instanceof StaticAssetImportError) throw new StaticAssetImportError(error.code, name);
    throw error;
  }
  assertDimensions(dimensions.width, dimensions.height);
  return {
    mimeType: supportedMime,
    formatLabel: supportedMime === "image/png" ? "PNG" : supportedMime === "image/jpeg" ? "JPEG" : "WebP",
    ...dimensions,
  };
}

const digestBytes = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return `sha256:${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("")}`;
};

const decodeWithRevokedObjectUrl = (file: File) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  const finish = () => URL.revokeObjectURL(objectUrl);
  image.onload = () => {
    const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
    finish();
    resolve(dimensions);
  };
  image.onerror = () => {
    finish();
    reject(new StaticAssetImportError("asset_decode_failed", file.name));
  };
  image.src = objectUrl;
});

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new StaticAssetImportError("asset_read_failed", file.name));
  reader.onerror = () => reject(new StaticAssetImportError("asset_read_failed", file.name));
  reader.readAsDataURL(file);
});

const randomUuid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export async function prepareStaticAssetBatchV2(
  files: readonly File[],
  existingAssets: readonly UnifiedProjectAssetV2[],
  dependencies: {
    decode?: (file: File) => Promise<{ width: number; height: number }>;
    createId?: () => string;
  } = {},
) {
  const limits = STATIC_ASSET_IMPORT_LIMITS;
  if (files.length < 1) fail("asset_batch_empty");
  if (files.length > limits.maximumBatchFiles) fail("asset_batch_limit");
  const existingNames = new Set(existingAssets.map(asset => asset.name.trim().toLocaleLowerCase()));
  const existingDigests = new Set(existingAssets.map(asset => asset.assetSha256));
  const batchNames = new Set<string>();
  for (const file of files) {
    const normalizedName = file.name.trim().toLocaleLowerCase();
    if (!normalizedName) fail("asset_name_required", file.name);
    if (existingNames.has(normalizedName) || batchNames.has(normalizedName)) fail("asset_duplicate_name", file.name);
    batchNames.add(normalizedName);
    if (file.size < 1) fail("asset_empty", file.name);
    if (file.size > limits.maximumEncodedBytes) fail("asset_file_limit", file.name);
    if (!extensionMime(file.name) || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) fail("asset_unsupported_type", file.name);
  }

  const preflight: Array<{ file: File; inspection: StaticAssetInspection; digest: string }> = [];
  const batchDigests = new Set<string>();
  // Complete signature, structure, dimensions, and digest preflight for every
  // file before any browser decoder or catalog mutation is allowed to run.
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspection = inspectStaticAssetBytes({ name: file.name, mimeType: file.type, declaredSize: file.size, bytes });
    const digest = await digestBytes(bytes);
    if (existingDigests.has(digest) || batchDigests.has(digest)) fail("asset_duplicate_content", file.name);
    batchDigests.add(digest);
    preflight.push({ file, inspection, digest });
  }

  const decode = dependencies.decode ?? decodeWithRevokedObjectUrl;
  for (const candidate of preflight) {
    let decoded: { width: number; height: number } | null = null;
    try {
      decoded = await decode(candidate.file);
    } catch (error) {
      if (error instanceof StaticAssetImportError) throw error;
      fail("asset_decode_failed", candidate.file.name);
    }
    if (!decoded || decoded.width !== candidate.inspection.width || decoded.height !== candidate.inspection.height) fail("asset_dimension_mismatch", candidate.file.name);
  }

  const assets: UnifiedProjectAssetV2[] = [];
  for (const candidate of preflight) {
    const dataUrl = await readFileAsDataUrl(candidate.file);
    const expectedPrefix = `data:${candidate.inspection.mimeType};base64,`;
    if (!dataUrl.startsWith(expectedPrefix)) fail("asset_type_mismatch", candidate.file.name);
    const sourceBytes = new Uint8Array(await candidate.file.arrayBuffer());
    const asset = await createProjectAssetV2({
      assetId: (dependencies.createId ?? randomUuid)(),
      name: candidate.file.name,
      kind: "image",
      mimeType: candidate.inspection.mimeType,
      byteLength: candidate.file.size,
      width: candidate.inspection.width,
      height: candidate.inspection.height,
      dataUrl,
      sourceBytes,
    });
    if (asset.assetSha256 !== candidate.digest) fail("asset_hash_mismatch", candidate.file.name);
    assets.push(asset);
  }
  return assets;
}

export const assetImportErrorMessage = (error: unknown) => {
  const failure = error instanceof StaticAssetImportError ? error : new StaticAssetImportError("asset_import_failed");
  const file = failure.fileName ? ` “${failure.fileName}”` : "";
  const messages: Record<string, string> = {
    asset_batch_empty: "Choose at least one image.",
    asset_batch_limit: "Import up to 32 images at a time.",
    asset_name_required: `The image${file} needs a file name.`,
    asset_duplicate_name: `An asset named${file} already exists. Rename it before importing.`,
    asset_duplicate_content: `The image${file} is already in Assets.`,
    asset_empty: `The image${file} is empty.`,
    asset_file_limit: `The image${file} is larger than 16 MB.`,
    asset_unsupported_type: `The file${file} is not a supported static PNG, JPEG, or WebP image.`,
    asset_type_mismatch: `The file name, file type, and image data do not agree for${file}.`,
    asset_animated: `Animated images are not supported for${file}. Import a static PNG, JPEG, or WebP instead.`,
    asset_dimension_limit: `The image${file} is larger than 8192 pixels on one side.`,
    asset_decode_limit: `The decoded image${file} is too large to use safely.`,
    asset_zero_dimension: `The image${file} has no usable width or height.`,
    asset_truncated: `The image${file} is incomplete or truncated.`,
    asset_corrupt: `The image${file} is corrupt or unsupported.`,
    asset_decode_failed: `The image${file} could not be decoded. Nothing was imported.`,
    asset_dimension_mismatch: `The stored dimensions and decoded dimensions do not agree for${file}.`,
    asset_hash_mismatch: `The image${file} changed while it was being imported. Nothing was imported.`,
    asset_read_failed: `The image${file} could not be read. Nothing was imported.`,
  };
  return messages[failure.code] ?? "The image batch could not be imported. Nothing was changed.";
};
