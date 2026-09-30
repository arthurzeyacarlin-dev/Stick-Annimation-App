import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import {
  hydrateUnifiedProjectStorageV2,
  prepareUnifiedProjectStorageV2,
  type UnifiedEncodedAssetV2,
  type UnifiedProjectVersionV2,
} from "../animation/unifiedProjectStorageV2.ts";

const MAX_BUNDLE_BYTES = 140_000_000;
const MAX_HEADER_BYTES = 16_000_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

type BundleHeader = {
  format: "diamond-account-project-bundle/v1";
  version: UnifiedProjectVersionV2;
  assets: Array<Omit<UnifiedEncodedAssetV2, "bytes">>;
};

const invalid = (): never => { throw new Error("bundle_invalid"); };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const packAccountProject = async (project: UnifiedAnimationProjectV2) => {
  const prepared = await prepareUnifiedProjectStorageV2(project);
  const header: BundleHeader = {
    format: "diamond-account-project-bundle/v1",
    version: prepared.version,
    assets: prepared.assets.map(({ assetId, sha256, byteLength, encoding }) => ({ assetId, sha256, byteLength, encoding })),
  };
  const headerBytes = encoder.encode(JSON.stringify(header));
  if (headerBytes.byteLength < 1 || headerBytes.byteLength > MAX_HEADER_BYTES) invalid();
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, headerBytes.byteLength, false);
  const body = new Blob([prefix, headerBytes, ...prepared.assets.map(asset => asset.bytes as BlobPart)], {
    type: "application/octet-stream",
  });
  if (body.size > MAX_BUNDLE_BYTES) throw new Error("project_too_large");
  return { body, version: prepared.version };
};

export const unpackAccountProject = async (bytes: Uint8Array) => {
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_BUNDLE_BYTES) invalid();
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  if (headerLength < 1 || headerLength > MAX_HEADER_BYTES || 4 + headerLength > bytes.byteLength) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headerLength))); }
  catch { invalid(); }
  if (!record(parsed) || parsed.format !== "diamond-account-project-bundle/v1" ||
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
      assetIds.has(entry.assetId) || offset + entry.byteLength > bytes.byteLength) invalid();
    assetIds.add(entry.assetId);
    // Buffer.slice() aliases its full pooled ArrayBuffer. Always copy the
    // exact asset range into a plain Uint8Array before V2 hydration.
    assets.push({ ...entry, bytes: Uint8Array.from(bytes.subarray(offset, offset + entry.byteLength)) });
    offset += entry.byteLength;
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
