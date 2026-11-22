import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import {
  compressUnifiedProjectStorageV2,
  hydrateUnifiedProjectStorageV2,
  prepareUnifiedProjectStorageV2,
  storedAssetByteLength,
  type UnifiedEncodedAssetV2,
  type UnifiedProjectVersionV2,
} from "../animation/unifiedProjectStorageV2.ts";

const MAX_BUNDLE_BYTES = 140_000_000;
const MAX_HEADER_BYTES = 16_000_000;
// A one-file bundle is opened whole, on the server too: its pictures may grow back to 1 GiB at most (as before Nov 14).
const MAX_BUNDLE_OPENED_BYTES = 1_073_741_824;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

// v1: every asset is stored raw. v2 (SPEC-0017): an asset entry may also say
// `compression: "deflate"` + `compressedByteLength` (frame pictures stored compressed).
// Only a project too large to store raw is compressed (v2); every project that could be saved
// before is still written as v1, byte-for-byte as before, so older app copies can still open it.
// v3 (Nov 14, picture-by-picture saving): the project DESCRIPTION alone. It names every picture by its
// fingerprint; the pictures themselves are saved one by one, once each (projectPictures.ts), never in the bundle.
const BUNDLE_V1 = "diamond-account-project-bundle/v1";
const BUNDLE_V2 = "diamond-account-project-bundle/v2";
const BUNDLE_V3 = "diamond-account-project-bundle/v3";

export type AccountProjectAssetEntry = Omit<UnifiedEncodedAssetV2, "bytes">;
export type AccountProjectManifest = { version: UnifiedProjectVersionV2; assets: AccountProjectAssetEntry[] };

type BundleHeader = {
  format: typeof BUNDLE_V1 | typeof BUNDLE_V2 | typeof BUNDLE_V3;
  version: UnifiedProjectVersionV2;
  assets: AccountProjectAssetEntry[];
};

const invalid = (): never => { throw new Error("bundle_invalid"); };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// One asset entry of a header, checked: its name is its fingerprint, and it may only say it is compressed where that is allowed.
export const accountProjectAssetEntry = (entry: unknown, compressionAllowed = true): AccountProjectAssetEntry => {
  if (!record(entry) || typeof entry.assetId !== "string" || !/^sha256:[0-9a-f]{64}$/.test(entry.assetId) ||
    typeof entry.sha256 !== "string" || entry.assetId !== `sha256:${entry.sha256}` ||
    !Number.isSafeInteger(entry.byteLength) || (entry.byteLength as number) < 0 ||
    (entry.encoding !== "typed-array" && entry.encoding !== "data-url")) invalid();
  const { assetId, sha256, byteLength, encoding, compression, compressedByteLength } = entry as AccountProjectAssetEntry;
  if (compression === undefined && compressedByteLength === undefined) return { assetId, sha256, byteLength, encoding };
  if (!compressionAllowed || compression !== "deflate" || encoding !== "typed-array" ||
    !Number.isSafeInteger(compressedByteLength) || compressedByteLength! < 0) invalid();
  return { assetId, sha256, byteLength, encoding, compression, compressedByteLength };
};

const packHeader = (header: BundleHeader) => {
  const headerBytes = encoder.encode(JSON.stringify(header));
  if (headerBytes.byteLength < 1 || headerBytes.byteLength > MAX_HEADER_BYTES) invalid();
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, headerBytes.byteLength, false);
  return [prefix, headerBytes];
};

const readHeader = (bytes: Uint8Array) => {
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_BUNDLE_BYTES) invalid();
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  if (headerLength < 1 || headerLength > MAX_HEADER_BYTES || 4 + headerLength > bytes.byteLength) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headerLength))); }
  catch { invalid(); }
  if (!record(parsed) || (parsed.format !== BUNDLE_V1 && parsed.format !== BUNDLE_V2 && parsed.format !== BUNDLE_V3) ||
    !record(parsed.version) || !Array.isArray(parsed.assets) || parsed.assets.length > 100_000) invalid();
  const header = parsed as BundleHeader;
  const assetIds = new Set<string>();
  const assets = header.assets.map(entry => {
    const checked = accountProjectAssetEntry(entry, header.format !== BUNDLE_V1);
    if (assetIds.has(checked.assetId)) invalid();
    assetIds.add(checked.assetId);
    return checked;
  });
  const version = header.version;
  if (typeof version.projectId !== "string" || !Number.isSafeInteger(version.revision) ||
    typeof version.projectDigest !== "string" || !Array.isArray(version.assetIds) ||
    version.assetIds.length !== assets.length ||
    version.assetIds.some((id, index) => id !== assets[index].assetId)) invalid();
  return { format: header.format, version, assets, bodyOffset: 4 + headerLength };
};

// Which project version a bundle of either kind says it holds (its header only: nothing is opened).
export const readAccountProjectIdentity = (bytes: Uint8Array) => {
  const { version } = readHeader(bytes);
  return { projectId: version.projectId, revision: version.revision, projectDigest: version.projectDigest };
};

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
  const body = new Blob([...packHeader(header), ...written.assets.map(asset => asset.bytes as BlobPart)], {
    type: "application/octet-stream",
  });
  if (body.size > MAX_BUNDLE_BYTES) throw new Error("project_too_large");
  return { body, version: written.version };
};

// A one-file bundle (v1 / v2) taken apart: its description and each picture as it is stored. Nothing is opened yet.
export const splitAccountProjectBundle = (bytes: Uint8Array) => {
  const { format, version, assets: entries, bodyOffset } = readHeader(bytes);
  if (format === BUNDLE_V3) invalid();
  if (entries.reduce((total, entry) => total + entry.byteLength, 0) > MAX_BUNDLE_OPENED_BYTES) throw new Error("project_too_large");
  const assets: UnifiedEncodedAssetV2[] = [];
  let offset = bodyOffset;
  for (const entry of entries) {
    const length = storedAssetByteLength(entry);
    if (offset + length > bytes.byteLength) invalid();
    // Buffer.slice() aliases its full pooled ArrayBuffer. Always copy the
    // exact asset range into a plain Uint8Array before V2 hydration.
    assets.push({ ...entry, bytes: Uint8Array.from(bytes.subarray(offset, offset + length)) });
    offset += length;
  }
  if (offset !== bytes.byteLength) invalid();
  return { version, assets };
};

export const unpackAccountProject = async (bytes: Uint8Array) => {
  const { version, assets } = splitAccountProjectBundle(bytes);
  const project = await hydrateUnifiedProjectStorageV2(version, assets);
  if (project.projectId !== version.projectId || project.revision !== version.revision) invalid();
  return { project, version };
};

// The project description alone (v3). `assets` says how each picture is stored; the pictures are not in it.
export const packAccountProjectManifest = ({ version, assets }: AccountProjectManifest) => {
  const byId = new Map(assets.map(asset => [asset.assetId, asset]));
  const header: BundleHeader = { format: BUNDLE_V3, version, assets: version.assetIds.map(assetId => byId.get(assetId) ?? invalid()) };
  const [prefix, headerBytes] = packHeader(header);
  const bytes = new Uint8Array(4 + headerBytes.byteLength);
  bytes.set(prefix); bytes.set(headerBytes, 4);
  return bytes;
};

const sha256Hex = async (bytes: Uint8Array) =>
  [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(byte => byte.toString(16).padStart(2, "0")).join("");

// Reads a project description (v3). null = these bytes are a one-file bundle (v1 / v2): open it with unpackAccountProject.
// A description is accepted only when it agrees with itself: its fingerprint is the fingerprint of its own text, every
// picture it shows is in its list with the same size and kind, and its sizes add up. (The pictures are checked one by
// one where they are saved and again when the project is opened.)
export const unpackAccountProjectManifest = async (bytes: Uint8Array): Promise<AccountProjectManifest | null> => {
  const { format, version, assets, bodyOffset } = readHeader(bytes);
  if (format !== BUNDLE_V3) return null;
  if (bodyOffset !== bytes.byteLength) invalid();
  const encodedJson = encoder.encode(JSON.stringify(version.encodedProject));
  const byId = new Map(assets.map(asset => [asset.assetId, asset]));
  const used = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { for (const entry of value) visit(entry); return; }
    if (!record(value)) return;
    if (typeof value.__unifiedAssetRef !== "string") { for (const entry of Object.values(value)) visit(entry); return; }
    const asset = byId.get(value.__unifiedAssetRef);
    if (!asset || asset.encoding !== value.encoding || asset.byteLength !== value.byteLength) invalid();
    used.add(asset!.assetId);
  };
  visit(version.encodedProject);
  const project = version.encodedProject;
  if (used.size !== assets.length || !record(project) || project.projectId !== version.projectId || project.revision !== version.revision ||
    version.metadataByteLength !== encodedJson.byteLength ||
    version.storedByteLength !== assets.reduce((total, asset) => total + storedAssetByteLength(asset), encodedJson.byteLength) ||
    version.projectDigest !== await sha256Hex(encodedJson)) invalid();
  return { version, assets };
};
