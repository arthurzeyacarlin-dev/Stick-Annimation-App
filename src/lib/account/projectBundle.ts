import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import {
  compressUnifiedProjectStorageV2,
  hydrateUnifiedProjectStorageV2,
  prepareUnifiedProjectStorageV2,
  type UnifiedEncodedAssetV2,
  type UnifiedProjectVersionV2,
} from "../animation/unifiedProjectStorageV2.ts";

const MAX_BUNDLE_BYTES = 140_000_000;
const MAX_HEADER_BYTES = 16_000_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

// v1: every asset is stored raw. v2 (SPEC-0017): an asset entry may also say
// `compression: "deflate"` + `compressedByteLength` (frame pictures stored compressed).
// Only a project too large to store raw is compressed (v2); every project that could be saved
// before is still written as v1, byte-for-byte as before, so older app copies can still open it.
const BUNDLE_V1 = "diamond-account-project-bundle/v1";
const BUNDLE_V2 = "diamond-account-project-bundle/v2";

type BundleHeader = {
  format: typeof BUNDLE_V1 | typeof BUNDLE_V2;
  version: UnifiedProjectVersionV2;
  assets: Array<Omit<UnifiedEncodedAssetV2, "bytes">>;
};

const invalid = (): never => { throw new Error("bundle_invalid"); };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const packAccountProject = async (project: UnifiedAnimationProjectV2) => {
  // A too-large project's frame pictures travel and are stored compressed; its
  // version.storedByteLength is then the compressed size (what the account stores). Digest unchanged.
  const written = await compressUnifiedProjectStorageV2(await prepareUnifiedProjectStorageV2(project), { onlyIfTooLarge: true });
  const header: BundleHeader = {
    format: written.assets.some(asset => asset.compression) ? BUNDLE_V2 : BUNDLE_V1,
    version: written.version,
    assets: written.assets.map(({ assetId, sha256, byteLength, encoding, compression, compressedByteLength }) => compression
      ? { assetId, sha256, byteLength, encoding, compression, compressedByteLength }
      : { assetId, sha256, byteLength, encoding }),
  };
  const headerBytes = encoder.encode(JSON.stringify(header));
  if (headerBytes.byteLength < 1 || headerBytes.byteLength > MAX_HEADER_BYTES) invalid();
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, headerBytes.byteLength, false);
  const body = new Blob([prefix, headerBytes, ...written.assets.map(asset => asset.bytes as BlobPart)], {
    type: "application/octet-stream",
  });
  if (body.size > MAX_BUNDLE_BYTES) throw new Error("project_too_large");
  return { body, version: written.version };
};

export const unpackAccountProject = async (bytes: Uint8Array) => {
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_BUNDLE_BYTES) invalid();
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  if (headerLength < 1 || headerLength > MAX_HEADER_BYTES || 4 + headerLength > bytes.byteLength) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headerLength))); }
  catch { invalid(); }
  if (!record(parsed) || (parsed.format !== BUNDLE_V1 && parsed.format !== BUNDLE_V2) ||
    !record(parsed.version) || !Array.isArray(parsed.assets) || parsed.assets.length > 100_000) invalid();
  const header = parsed as BundleHeader;
  const assets: UnifiedEncodedAssetV2[] = [];
  const assetIds = new Set<string>();
  let offset = 4 + headerLength;
  for (const entry of header.assets) {
    if (!record(entry) || typeof entry.assetId !== "string" || !/^sha256:[0-9a-f]{64}$/.test(entry.assetId) ||
      typeof entry.sha256 !== "string" || entry.assetId !== `sha256:${entry.sha256}` ||
      !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 ||
      (entry.encoding !== "typed-array" && entry.encoding !== "data-url") ||
      assetIds.has(entry.assetId)) invalid();
    const compressed = entry.compression !== undefined || entry.compressedByteLength !== undefined;
    if (compressed && (header.format !== BUNDLE_V2 || entry.compression !== "deflate" || entry.encoding !== "typed-array" ||
      !Number.isSafeInteger(entry.compressedByteLength) || entry.compressedByteLength! < 0)) invalid();
    const length = compressed ? entry.compressedByteLength! : entry.byteLength;
    if (offset + length > bytes.byteLength) invalid();
    assetIds.add(entry.assetId);
    // Buffer.slice() aliases its full pooled ArrayBuffer. Always copy the
    // exact asset range into a plain Uint8Array before V2 hydration.
    const { assetId, sha256, byteLength, encoding } = entry;
    assets.push({
      assetId, sha256, byteLength, encoding,
      ...(compressed ? { compression: entry.compression, compressedByteLength: entry.compressedByteLength } : {}),
      bytes: Uint8Array.from(bytes.subarray(offset, offset + length)),
    });
    offset += length;
  }
  if (offset !== bytes.byteLength) invalid();
  const version = header.version;
  if (typeof version.projectId !== "string" || !Number.isSafeInteger(version.revision) ||
    typeof version.projectDigest !== "string" || !Array.isArray(version.assetIds) ||
    version.assetIds.length !== assets.length ||
    version.assetIds.some((id, index) => id !== assets[index].assetId)) invalid();
  const project = await hydrateUnifiedProjectStorageV2(version, assets);
  if (project.projectId !== version.projectId || project.revision !== version.revision) invalid();
  return { project, version };
};
