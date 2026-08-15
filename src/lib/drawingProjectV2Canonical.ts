import {
  DRAWING_PROJECT_V2_LIMITS,
  DrawingProjectV2Error,
  parseDrawingProjectVersionRecordV2,
  type DrawingProjectAssetV2,
  type DrawingProjectDocumentV2,
  type DrawingProjectVersionRecordV2,
} from "./drawingProjectV2Contract.ts";

const hasLoneSurrogate = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
};

const canonicalString = (value: string, stage: string) => {
  if (hasLoneSurrogate(value) || value.normalize("NFC") !== value) {
    throw new DrawingProjectV2Error("invalid_record", stage, "Canonical strings must be NFC without lone surrogates.");
  }
  return JSON.stringify(value);
};

const canonicalValue = (value: unknown, stage: string, seen: Set<object>): string => {
  if (value === null) return "null";
  if (typeof value === "string") return canonicalString(value, stage);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new DrawingProjectV2Error("invalid_record", stage, "Canonical numbers must be finite and may not be negative zero.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object" || value === undefined) {
    throw new DrawingProjectV2Error("invalid_record", stage, "Unsupported canonical value.");
  }
  if (value instanceof Blob || value instanceof Date || value instanceof Map || value instanceof Set) {
    throw new DrawingProjectV2Error("invalid_record", stage, "Canonical JSON accepts only plain data.");
  }
  if (seen.has(value)) throw new DrawingProjectV2Error("invalid_record", stage, "Canonical JSON cannot contain cycles.");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new DrawingProjectV2Error("invalid_record", `${stage}[${index}]`, "Canonical arrays cannot contain holes.");
        }
      }
      return `[${value.map((entry, index) => canonicalValue(entry, `${stage}[${index}]`, seen)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new DrawingProjectV2Error("invalid_record", stage, "Canonical objects must be plain.");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${canonicalString(key, `${stage}.key`)}:${canonicalValue(record[key], `${stage}.${key}`, seen)}`).join(",")}}`;
  } finally {
    seen.delete(value);
  }
};

export const canonicalJsonStringify = (value: unknown) => canonicalValue(value, "$", new Set());

export const canonicalJsonBytes = (value: unknown) => new TextEncoder().encode(canonicalJsonStringify(value));

export const sha256Hex = async (bytes: Uint8Array | ArrayBuffer): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new DrawingProjectV2Error("storage_read_failed", "sha256", "Web Crypto SHA-256 is unavailable.");
  const digestInput = bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes).buffer;
  const digest = await subtle.digest("SHA-256", digestInput);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const sha256CanonicalJson = async (value: unknown) => sha256Hex(canonicalJsonBytes(value));

export type DrawingProjectAssetSemanticManifestEntry =
  | { assetId: string; kind: "raster-png"; width: number; height: number; rgbaByteLength: number; rgbaSha256: string }
  | { assetId: string; kind: "audio"; mimeType: "audio/wav"; byteLength: number; sha256: string };

export const createAssetSemanticManifest = (assets: readonly DrawingProjectAssetV2[]): DrawingProjectAssetSemanticManifestEntry[] =>
  [...assets]
    .sort((left, right) => (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0))
    .map((asset) =>
      asset.kind === "raster-png"
        ? {
            assetId: asset.assetId,
            kind: asset.kind,
            width: asset.width,
            height: asset.height,
            rgbaByteLength: asset.rgbaByteLength,
            rgbaSha256: asset.rgbaSha256,
          }
        : {
            assetId: asset.assetId,
            kind: asset.kind,
            mimeType: asset.mimeType,
            byteLength: asset.byteLength,
            sha256: asset.sha256,
          },
    );

export const calculateDocumentDigest = async (document: DrawingProjectDocumentV2, assets: readonly DrawingProjectAssetV2[]) =>
  sha256CanonicalJson({ document, assets: createAssetSemanticManifest(assets) });

type DrawingProjectStoredRecordInput = Omit<DrawingProjectVersionRecordV2, "storedByteLength"> & { storedByteLength?: number };

export const createStoredRecordDescriptor = (
  record: DrawingProjectStoredRecordInput,
  storedByteLength: number = record.storedByteLength as number,
) => {
  if (!Number.isSafeInteger(storedByteLength) || storedByteLength < 1) {
    throw new DrawingProjectV2Error("invalid_record", "record.storedByteLength", "Stored byte length must be a positive safe integer.");
  }
  return {
    kind: record.kind,
    schemaVersion: record.schemaVersion,
    projectId: record.projectId,
    storageRevision: record.storageRevision,
    storedByteLength,
    documentDigest: record.documentDigest,
    document: record.document,
    assets: record.assets.map((asset) =>
      asset.kind === "raster-png"
        ? {
            assetId: asset.assetId,
            kind: asset.kind,
            width: asset.width,
            height: asset.height,
            rgbaByteLength: asset.rgbaByteLength,
            rgbaSha256: asset.rgbaSha256,
            encodedByteLength: asset.encodedByteLength,
            encodedSha256: asset.encodedSha256,
            bytes: { byteLength: asset.encodedByteLength, sha256: asset.encodedSha256 },
          }
        : {
            assetId: asset.assetId,
            kind: asset.kind,
            mimeType: asset.mimeType,
            byteLength: asset.byteLength,
            sha256: asset.sha256,
            bytes: { byteLength: asset.byteLength, sha256: asset.sha256 },
          },
    ),
  };
};

const calculateStoredAssetByteLength = (record: DrawingProjectStoredRecordInput) => {
  let total = 0;
  for (const asset of record.assets) {
    const byteLength = asset.kind === "raster-png" ? asset.encodedByteLength : asset.byteLength;
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new DrawingProjectV2Error("invalid_record", "capacity.project.assets", "Asset byte length must be a non-negative safe integer.");
    }
    if (total > Number.MAX_SAFE_INTEGER - byteLength) {
      throw new DrawingProjectV2Error("project_too_large", "capacity.project", "Stored asset byte length overflow.");
    }
    total += byteLength;
  }
  return total;
};

export const calculateStoredByteLength = (record: DrawingProjectStoredRecordInput) => {
  const assetByteLength = calculateStoredAssetByteLength(record);
  let candidate = 1;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const metadataLength = canonicalJsonBytes(createStoredRecordDescriptor(record, candidate)).byteLength;
    if (metadataLength > Number.MAX_SAFE_INTEGER - assetByteLength) {
      throw new DrawingProjectV2Error("project_too_large", "capacity.project", "Stored byte length overflow.");
    }
    const next = metadataLength + assetByteLength;
    if (!Number.isSafeInteger(next) || next < 1) {
      throw new DrawingProjectV2Error("project_too_large", "capacity.project", "Stored byte length overflow.");
    }
    if (next === candidate) return next;
    candidate = next;
  }
  throw new DrawingProjectV2Error("project_too_large", "capacity.project", "Stored byte length did not converge safely.");
};

export const assertProjectStoredCapacity = (storedByteLength: number) => {
  if (!Number.isSafeInteger(storedByteLength) || storedByteLength < 1 || storedByteLength > DRAWING_PROJECT_V2_LIMITS.projectStoredBytes) {
    throw new DrawingProjectV2Error("project_too_large", "capacity.project", "Project stored-byte limit exceeded.");
  }
  return storedByteLength;
};

export const assertCollectionCapacity = (input: {
  activeProjectCount: number;
  activeStoredBytes: number;
  replacingStoredBytes: number;
  candidateStoredBytes: number;
  companionStoredBytes?: number;
  tombstoneStoredBytes?: number;
}) => {
  const { activeProjectCount, activeStoredBytes, replacingStoredBytes, candidateStoredBytes } = input;
  const companionStoredBytes = input.companionStoredBytes ?? 0;
  const tombstoneStoredBytes = input.tombstoneStoredBytes ?? 0;
  for (const [name, value] of Object.entries({ activeProjectCount, activeStoredBytes, replacingStoredBytes, candidateStoredBytes, companionStoredBytes, tombstoneStoredBytes })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new DrawingProjectV2Error("invalid_record", `capacity.${name}`, "Capacity values must be non-negative safe integers.");
  }
  if (activeProjectCount > DRAWING_PROJECT_V2_LIMITS.projectCount) {
    throw new DrawingProjectV2Error("project_limit_reached", "capacity.collection", "Drawing project count exceeds the limit.");
  }
  let total = activeStoredBytes - replacingStoredBytes;
  for (const value of [candidateStoredBytes, companionStoredBytes, tombstoneStoredBytes]) {
    if (total > Number.MAX_SAFE_INTEGER - value) throw new DrawingProjectV2Error("collection_too_large", "capacity.collection", "Collection byte sum overflow.");
    total += value;
  }
  if (total > DRAWING_PROJECT_V2_LIMITS.collectionStoredBytes) {
    throw new DrawingProjectV2Error("collection_too_large", "capacity.collection", "Managed collection byte limit exceeded.");
  }
  return total;
};

export const verifyRecordCanonicalFields = async (recordValue: unknown) => {
  const record = parseDrawingProjectVersionRecordV2(recordValue);
  const documentDigest = await calculateDocumentDigest(record.document, record.assets);
  if (record.documentDigest !== documentDigest) {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "record.documentDigest", "Document digest mismatch.");
  }
  const storedByteLength = calculateStoredByteLength(record);
  assertProjectStoredCapacity(storedByteLength);
  if (record.storedByteLength !== storedByteLength) {
    throw new DrawingProjectV2Error("invalid_record", "record.storedByteLength", "Stored byte length mismatch.");
  }
  return record;
};
