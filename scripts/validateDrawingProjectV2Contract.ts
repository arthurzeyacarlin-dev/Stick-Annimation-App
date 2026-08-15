import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  DRAWING_PROJECT_DELETE_FAILED_CODES,
  DRAWING_PROJECT_V2_ERROR_CODES,
  DRAWING_PROJECT_V2_LIMITS,
  DrawingProjectV2Error,
  assertHydratedRgbaCapacityTotal,
  assertProjectHydrationCapacity,
  calculateProjectHydratedRgbaByteLength,
  parseDrawingProjectDeleteFailedCode,
  parseDrawingProjectDocumentV2,
  parseDrawingProjectV2ErrorCode,
  parseDrawingProjectVersionRecordV2,
  type DrawingProjectRasterAssetV2,
  type DrawingProjectVersionRecordV2,
} from "../src/lib/drawingProjectV2Contract.ts";
import {
  assertCollectionCapacity,
  assertProjectStoredCapacity,
  calculateDocumentDigest,
  calculateStoredByteLength,
  canonicalJsonStringify,
  sha256Hex,
  verifyRecordCanonicalFields,
} from "../src/lib/drawingProjectV2Canonical.ts";
import {
  assertCanonicalAudioBase64Length,
  createCanonicalWavDataUrl,
  hydrateDrawingSoundAttachment,
  parseCanonicalWavDataUrl,
  snapshotDrawingSoundAttachment,
} from "../src/lib/drawingProjectAudioCodec.ts";
import {
  encodeDrawingRasterAsset,
  preflightDrawingPng,
  verifyDrawingProjectRasters,
  verifyDrawingRasterAsset,
  type DrawingProjectRasterStageCounts,
} from "../src/lib/drawingProjectRasterCodec.ts";
import {
  TEST_WAV_BYTES,
  concatenateBytes,
  createRasterAsset,
  createVersionRecord,
  pngChunk,
} from "./fixtures/drawing-persistence/v2/fixtureFactory.ts";

let assertions = 0;
const equal = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.equal(actual, expected, message); };
const deepEqual = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const ok = (value: unknown, message?: string) => { assertions += 1; assert.ok(value, message); };
const expectCode = async (operation: () => unknown | Promise<unknown>, code: string, stage?: string) => {
  assertions += 1;
  try {
    await operation();
    assert.fail(`Expected ${code}.`);
  } catch (error) {
    assert.ok(error instanceof DrawingProjectV2Error && error.code === code && (stage === undefined || error.stage === stage), `Expected ${code}${stage ? ` at ${stage}` : ""}.`);
  }
};

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/drawing-persistence/v2/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;

const deepFreeze = (value: unknown) => {
  if (value === null || typeof value !== "object" || value instanceof Blob || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
};

const clone = <T>(value: T): T => structuredClone(value);
const counts = (): DrawingProjectRasterStageCounts => ({ blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 });

const independentCanonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(independentCanonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("Independent canonical oracle received unsupported data.");
  const recordValue = value as Record<string, unknown>;
  return `{${Object.keys(recordValue).sort().map((key) => `${JSON.stringify(key)}:${independentCanonicalJson(recordValue[key])}`).join(",")}}`;
};

const independentStoredDescriptor = (record: DrawingProjectVersionRecordV2, storedByteLength: number) => ({
  kind: record.kind,
  schemaVersion: record.schemaVersion,
  projectId: record.projectId,
  storageRevision: record.storageRevision,
  storedByteLength,
  documentDigest: record.documentDigest,
  document: record.document,
  assets: record.assets.map((asset) => asset.kind === "raster-png"
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
      }),
});

const independentStoredByteLength = (record: DrawingProjectVersionRecordV2, storedByteLength: number) => {
  const descriptorJson = independentCanonicalJson(independentStoredDescriptor(record, storedByteLength));
  const descriptorUtf8Bytes = Buffer.byteLength(descriptorJson, "utf8");
  const assetBytes = record.assets.reduce((sum, asset) => sum + asset.bytes.size, 0);
  return { descriptorJson, descriptorUtf8Bytes, assetBytes, storedByteLength: descriptorUtf8Bytes + assetBytes };
};

const assetWithBytes = async (asset: DrawingProjectRasterAssetV2, bytes: Uint8Array): Promise<DrawingProjectRasterAssetV2> => ({
  ...asset,
  encodedByteLength: bytes.byteLength,
  encodedSha256: await sha256Hex(bytes),
  bytes: new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
});

const ihdrData = (width: number, height: number, profile = [8, 6, 0, 0, 0]) => {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data.set(profile, 8);
  return data;
};

const structuredPng = (input: {
  width?: number;
  height?: number;
  profile?: number[];
  ancillary?: Array<[string, number]>;
  idatCount?: number;
  idatBytes?: Uint8Array;
  includeIend?: boolean;
  trailing?: Uint8Array;
}) => {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [pngChunk("IHDR", ihdrData(input.width ?? 1, input.height ?? 1, input.profile))];
  for (const [type, length] of input.ancillary ?? []) chunks.push(pngChunk(type, new Uint8Array(length)));
  for (let index = 0; index < (input.idatCount ?? 1); index += 1) chunks.push(pngChunk("IDAT", Uint8Array.from(input.idatBytes ?? new Uint8Array([1]))));
  if (input.includeIend !== false) chunks.push(pngChunk("IEND", new Uint8Array()));
  if (input.trailing) chunks.push(Uint8Array.from(input.trailing));
  return concatenateBytes(signature, ...chunks);
};

const pngFromChunks = (...chunks: Uint8Array[]) => concatenateBytes(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks);

for (const name of [
  "canonical-vectors.json",
  "valid-projects.json",
  "invalid-contract-cases.json",
  "capacity-cases.json",
  "raster-byte-vectors.json",
  "png-preflight-cases.json",
  "audio-cases.json",
]) {
  equal(fixture(name).fixtureVersion, 1, `${name} version`);
}

const invalidContractFixture = fixture("invalid-contract-cases.json") as {
  stableErrorCodes: string[];
  deleteFailedCodes: string[];
};
deepEqual([...DRAWING_PROJECT_V2_ERROR_CODES], invalidContractFixture.stableErrorCodes, "stable error-code set and order are exact");
equal(new Set(DRAWING_PROJECT_V2_ERROR_CODES).size, 22, "stable error codes are unique");
deepEqual([...DRAWING_PROJECT_DELETE_FAILED_CODES], invalidContractFixture.deleteFailedCodes, "Delete failed-code union is exact");
for (const code of invalidContractFixture.stableErrorCodes) equal(parseDrawingProjectV2ErrorCode(code), code);
for (const code of invalidContractFixture.deleteFailedCodes) equal(parseDrawingProjectDeleteFailedCode(code), code);
await expectCode(() => parseDrawingProjectV2ErrorCode("candidate_readback_failed"), "invalid_record", "error.code");
await expectCode(() => parseDrawingProjectDeleteFailedCode("quota_exceeded"), "invalid_record", "delete.error.code");
assertions += 1;
assert.throws(
  () => new DrawingProjectV2Error("candidate_readback_failed" as never, "forged", "forged"),
  { name: "TypeError", message: "Unknown Drawing project error code." },
);

const canonicalA = canonicalJsonStringify({ z: 1, a: "é", nested: { b: true, a: null } });
const canonicalB = canonicalJsonStringify({ nested: { a: null, b: true }, a: "é", z: 1 });
equal(canonicalA, canonicalB);
equal(canonicalA, '{"a":"é","nested":{"a":null,"b":true},"z":1}');
const browserDigest = await sha256Hex(new TextEncoder().encode(canonicalA));
const nodeDigest = createHash("sha256").update(new TextEncoder().encode(canonicalA)).digest("hex");
equal(browserDigest, nodeDigest, "Web Crypto and node:crypto cross-check");
await expectCode(() => canonicalJsonStringify(-0), "invalid_record");
await expectCode(() => canonicalJsonStringify(Number.NaN), "invalid_record");
await expectCode(() => canonicalJsonStringify("\ud800"), "invalid_record");
const hole = new Array(1);
await expectCode(() => canonicalJsonStringify(hole), "invalid_record");
await expectCode(() => canonicalJsonStringify(new Date()), "invalid_record");
const cyclic: { self?: unknown } = {};
cyclic.self = cyclic;
await expectCode(() => canonicalJsonStringify(cyclic), "invalid_record");

const record = await createVersionRecord();
deepFreeze(record);
const beforeRecord = canonicalJsonStringify({
  ...record,
  assets: record.assets.map((asset) => ({ ...asset, bytes: { size: asset.bytes.size, type: asset.bytes.type } })),
});
equal(parseDrawingProjectVersionRecordV2(record), record);
equal(await verifyRecordCanonicalFields(record), record);
equal(await calculateDocumentDigest(record.document, record.assets), record.documentDigest);
equal(calculateStoredByteLength(record), record.storedByteLength);
equal(canonicalJsonStringify({ ...record, assets: record.assets.map((asset) => ({ ...asset, bytes: { size: asset.bytes.size, type: asset.bytes.type } })) }), beforeRecord, "parser did not mutate frozen input");

const canonicalFixture = fixture("canonical-vectors.json") as {
  storedByteLengthGoldens: Array<{
    name: string;
    projectId: string;
    textCharacters?: number;
    descriptorUtf8Bytes: number;
    assetBytes: number;
    storedByteLength: number;
    descriptorSha256?: string;
  }>;
};
const representativeGolden = canonicalFixture.storedByteLengthGoldens[0];
const representativeOracle = independentStoredByteLength(record, representativeGolden.storedByteLength);
equal(record.projectId, representativeGolden.projectId);
equal(representativeOracle.descriptorUtf8Bytes, representativeGolden.descriptorUtf8Bytes);
equal(representativeOracle.assetBytes, representativeGolden.assetBytes);
equal(representativeOracle.storedByteLength, representativeGolden.storedByteLength);
equal(record.storedByteLength, representativeGolden.storedByteLength);
equal(createHash("sha256").update(representativeOracle.descriptorJson, "utf8").digest("hex"), representativeGolden.descriptorSha256);
const mismatchedStoredLength = clone(record);
mismatchedStoredLength.storedByteLength -= 1;
await expectCode(() => verifyRecordCanonicalFields(mismatchedStoredLength), "invalid_record", "record.storedByteLength");

for (const golden of canonicalFixture.storedByteLengthGoldens.slice(1)) {
  const digitRecord = await createVersionRecord(golden.projectId);
  digitRecord.document.layers[0].timelineFrames[0].textObjects[0].text = "x".repeat(golden.textCharacters!);
  digitRecord.documentDigest = await calculateDocumentDigest(digitRecord.document, digitRecord.assets);
  digitRecord.storedByteLength = calculateStoredByteLength(digitRecord);
  const independent = independentStoredByteLength(digitRecord, golden.storedByteLength);
  equal(independent.descriptorUtf8Bytes, golden.descriptorUtf8Bytes, `${golden.name} independent descriptor bytes`);
  equal(independent.assetBytes, golden.assetBytes, `${golden.name} independent asset bytes`);
  equal(independent.storedByteLength, golden.storedByteLength, `${golden.name} independent complete-record bytes`);
  equal(digitRecord.storedByteLength, golden.storedByteLength, `${golden.name} fixed point`);
  equal((await verifyRecordCanonicalFields(digitRecord)).storedByteLength, golden.storedByteLength);
}

const unknown = clone(record) as unknown as Record<string, unknown>;
unknown.future = true;
await expectCode(() => parseDrawingProjectVersionRecordV2(unknown), "invalid_record");
const wrongVersion = clone(record);
(wrongVersion as { schemaVersion: number }).schemaVersion = 3;
await expectCode(() => parseDrawingProjectVersionRecordV2(wrongVersion), "unsupported_version");
const duplicateAsset = clone(record);
duplicateAsset.assets.push(duplicateAsset.assets[0]);
await expectCode(() => parseDrawingProjectVersionRecordV2(duplicateAsset), "invalid_record");
const dangling = clone(record);
dangling.document.layers[0].timelineFrames[0].bitmap = { assetId: "missing" };
await expectCode(() => parseDrawingProjectVersionRecordV2(dangling), "asset_missing");
const missingAudio = clone(record);
missingAudio.document.layers[0].timelineFrames[0].soundAttachment!.audioDataUrl = { assetId: "missing-audio" };
await expectCode(() => parseDrawingProjectVersionRecordV2(missingAudio), "asset_missing");
const unreferenced = clone(record);
unreferenced.document.layers[0].timelineFrames[0].soundAttachment = null;
await expectCode(() => parseDrawingProjectVersionRecordV2(unreferenced), "invalid_record");
const blankContent = clone(record.document);
blankContent.layers[0].timelineFrames[2].bitmap = { assetId: "raster-primary" };
await expectCode(() => parseDrawingProjectDocumentV2(blankContent), "invalid_record");
const endpointMismatch = clone(record.document);
endpointMismatch.layers[0].timelineFrames[1].hasTweenEndpoint = false;
await expectCode(() => parseDrawingProjectDocumentV2(endpointMismatch), "invalid_record");
const nonNfc = clone(record.document);
nonNfc.layers[0].name = "e\u0301";
await expectCode(() => parseDrawingProjectDocumentV2(nonNfc), "invalid_record");
const extraSound = clone(record.document);
(extraSound.layers[0].timelineFrames[0].soundAttachment as unknown as Record<string, unknown>).optionId = "invented";
await expectCode(() => parseDrawingProjectDocumentV2(extraSound), "invalid_record");

equal(assertProjectStoredCapacity(DRAWING_PROJECT_V2_LIMITS.projectStoredBytes), 134_217_728);
await expectCode(() => assertProjectStoredCapacity(DRAWING_PROJECT_V2_LIMITS.projectStoredBytes + 1), "project_too_large");
equal(assertHydratedRgbaCapacityTotal(DRAWING_PROJECT_V2_LIMITS.projectHydratedRgbaBytes), 536_870_912);
await expectCode(() => assertHydratedRgbaCapacityTotal(DRAWING_PROJECT_V2_LIMITS.projectHydratedRgbaBytes + 1), "project_too_large");
equal(assertCollectionCapacity({ activeProjectCount: 64, activeStoredBytes: 536_870_912, replacingStoredBytes: 0, candidateStoredBytes: 0 }), 536_870_912);
await expectCode(() => assertCollectionCapacity({ activeProjectCount: 64, activeStoredBytes: 536_870_912, replacingStoredBytes: 0, candidateStoredBytes: 1 }), "collection_too_large");
await expectCode(() => assertCollectionCapacity({ activeProjectCount: 65, activeStoredBytes: 0, replacingStoredBytes: 0, candidateStoredBytes: 0 }), "project_limit_reached");

const hugeAsset = {
  ...record.assets[0],
  assetId: "huge",
  width: 16_384,
  height: 4_096,
  rgbaByteLength: 268_435_456,
} as DrawingProjectRasterAssetV2;
const smallAsset = { ...record.assets[0], assetId: "small" } as DrawingProjectRasterAssetV2;
const boundaryDocument = clone(record.document);
boundaryDocument.layers[0].timelineFrames[0].bitmap = { assetId: "huge" };
boundaryDocument.layers[0].timelineFrames[1].tweenEndBitmap = { assetId: "huge" };
boundaryDocument.layers[0].timelineFrames[1].motionTween!.spriteBitmap = null;
equal(calculateProjectHydratedRgbaByteLength(boundaryDocument, [hugeAsset]), 536_870_912, "repeated references count logically");
equal(assertProjectHydrationCapacity(boundaryDocument, [hugeAsset]), 536_870_912);
const overDocument = clone(boundaryDocument);
overDocument.layers[0].timelineFrames[1].motionTween!.spriteBitmap = { assetId: "small" };
await expectCode(() => assertProjectHydrationCapacity(overDocument, [hugeAsset, smallAsset]), "project_too_large", "project.hydration-preflight");

const raster = await createRasterAsset();
const encoded = new Uint8Array(await raster.bytes.arrayBuffer());
deepEqual(preflightDrawingPng(encoded, raster), { width: 1, height: 1, chunkCount: 3, idatChunkCount: 1 });
const at4090 = structuredPng({ idatCount: 4_090 });
const at4090Asset = await assetWithBytes(raster, at4090);
equal(preflightDrawingPng(at4090, at4090Asset).idatChunkCount, 4_090);
const at4091 = structuredPng({ idatCount: 4_091 });
await expectCode(() => preflightDrawingPng(at4091, raster), "unsupported_png");
const at4096 = structuredPng({ ancillary: [["cHRM", 32], ["gAMA", 4], ["sRGB", 1], ["pHYs", 9]], idatCount: 4_090 });
const at4096Asset = await assetWithBytes(raster, at4096);
equal(preflightDrawingPng(at4096, at4096Asset).chunkCount, 4_096);
const badSignature = encoded.slice();
badSignature[0] = 0;
await expectCode(() => preflightDrawingPng(badSignature, raster), "invalid_png");
await expectCode(() => preflightDrawingPng(encoded.subarray(0, 20), raster), "invalid_png");
const badCrc = encoded.slice();
badCrc[29] ^= 1;
await expectCode(() => preflightDrawingPng(badCrc, raster), "invalid_png");
const badProfile = structuredPng({ profile: [8, 2, 0, 0, 0] });
await expectCode(() => preflightDrawingPng(badProfile, raster), "unsupported_png");
const badDimensions = structuredPng({ width: 2 });
await expectCode(() => preflightDrawingPng(badDimensions, raster), "invalid_png");
const zeroDimensions = structuredPng({ width: 0 });
await expectCode(() => preflightDrawingPng(zeroDimensions, raster), "invalid_png");
const emptyIdat = structuredPng({ idatBytes: new Uint8Array() });
await expectCode(() => preflightDrawingPng(emptyIdat, raster), "unsupported_png");
const trailing = structuredPng({ trailing: new Uint8Array([1]) });
await expectCode(() => preflightDrawingPng(trailing, raster), "invalid_png");
const noIend = structuredPng({ includeIend: false });
await expectCode(() => preflightDrawingPng(noIend, raster), "invalid_png");
const unknownChunk = concatenateBytes(
  new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", ihdrData(1, 1)),
  pngChunk("tEXt", new Uint8Array([1])),
  pngChunk("IDAT", new Uint8Array([1])),
  pngChunk("IEND", new Uint8Array()),
);
await expectCode(() => preflightDrawingPng(unknownChunk, raster), "unsupported_png");
const missingIhdr = pngFromChunks(pngChunk("IDAT", new Uint8Array([1])), pngChunk("IEND", new Uint8Array()));
await expectCode(() => preflightDrawingPng(missingIhdr, raster), "invalid_png");
const shortIhdr = pngFromChunks(pngChunk("IHDR", new Uint8Array(12)), pngChunk("IDAT", new Uint8Array([1])), pngChunk("IEND", new Uint8Array()));
await expectCode(() => preflightDrawingPng(shortIhdr, raster), "invalid_png");
const duplicateIhdr = pngFromChunks(pngChunk("IHDR", ihdrData(1, 1)), pngChunk("IHDR", ihdrData(1, 1)), pngChunk("IDAT", new Uint8Array([1])), pngChunk("IEND", new Uint8Array()));
await expectCode(() => preflightDrawingPng(duplicateIhdr, raster), "unsupported_png");
for (const profile of [[16, 6, 0, 0, 0], [8, 2, 0, 0, 0], [8, 6, 1, 0, 0], [8, 6, 0, 1, 0], [8, 6, 0, 0, 1]]) {
  await expectCode(() => preflightDrawingPng(structuredPng({ profile }), raster), "unsupported_png");
}
const missingIdat = pngFromChunks(pngChunk("IHDR", ihdrData(1, 1)), pngChunk("IEND", new Uint8Array()));
await expectCode(() => preflightDrawingPng(missingIdat, raster), "unsupported_png");
const nonemptyIend = pngFromChunks(pngChunk("IHDR", ihdrData(1, 1)), pngChunk("IDAT", new Uint8Array([1])), pngChunk("IEND", new Uint8Array([1])));
await expectCode(() => preflightDrawingPng(nonemptyIend, raster), "invalid_png");
const plte = pngFromChunks(pngChunk("IHDR", ihdrData(1, 1)), pngChunk("PLTE", new Uint8Array([0, 0, 0])), pngChunk("IDAT", new Uint8Array([1])), pngChunk("IEND", new Uint8Array()));
await expectCode(() => preflightDrawingPng(plte, raster), "unsupported_png");
const duplicateGamma = structuredPng({ ancillary: [["gAMA", 4], ["gAMA", 4]] });
await expectCode(() => preflightDrawingPng(duplicateGamma, raster), "unsupported_png");
const wrongGammaLength = structuredPng({ ancillary: [["gAMA", 3]] });
await expectCode(() => preflightDrawingPng(wrongGammaLength, raster), "unsupported_png");
const nonconsecutiveIdat = pngFromChunks(
  pngChunk("IHDR", ihdrData(1, 1)),
  pngChunk("IDAT", new Uint8Array([1])),
  pngChunk("gAMA", new Uint8Array(4)),
  pngChunk("IDAT", new Uint8Array([1])),
  pngChunk("IEND", new Uint8Array()),
);
await expectCode(() => preflightDrawingPng(nonconsecutiveIdat, raster), "unsupported_png");
const malformedType = encoded.slice();
malformedType[12] = 48;
await expectCode(() => preflightDrawingPng(malformedType, raster), "invalid_png");
const at4097 = structuredPng({ ancillary: [["cHRM", 32], ["gAMA", 4], ["sRGB", 1], ["pHYs", 9]], idatCount: 4_091 });
await expectCode(() => preflightDrawingPng(at4097, raster), "unsupported_png");
const bomb = structuredPng({ width: 16_384, height: 16_384 });
await expectCode(() => preflightDrawingPng(bomb, { width: 16_384, height: 16_384, rgbaByteLength: 268_435_456 }), "invalid_png");

const successCounts = counts();
const verified = await verifyDrawingRasterAsset(raster, async () => ({
  width: 1,
  height: 1,
  rgba: new Uint8Array([17, 34, 51, 255]),
  release: () => undefined,
}), successCounts);
deepEqual([...verified.rgba], [17, 34, 51, 255]);
deepEqual(successCounts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 1, releases: 1 });
const lengthCounts = counts();
await expectCode(() => verifyDrawingRasterAsset({ ...raster, encodedByteLength: raster.encodedByteLength + 1 }, async () => { throw new Error(); }, lengthCounts), "asset_digest_mismatch");
deepEqual(lengthCounts, { blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 });
const digestCounts = counts();
await expectCode(() => verifyDrawingRasterAsset({ ...raster, encodedSha256: "0".repeat(64) }, async () => { throw new Error(); }, digestCounts), "asset_digest_mismatch");
deepEqual(digestCounts, { blobReads: 1, pngPreflights: 0, nativeDecodes: 0, releases: 0 });
const signatureCounts = counts();
const badSignatureAsset = await assetWithBytes(raster, badSignature);
await expectCode(() => verifyDrawingRasterAsset(badSignatureAsset, async () => { throw new Error(); }, signatureCounts), "invalid_png");
deepEqual(signatureCounts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 0, releases: 0 });
const crcCounts = counts();
const badCrcAsset = await assetWithBytes(raster, badCrc);
await expectCode(() => verifyDrawingRasterAsset(badCrcAsset, async () => { throw new Error(); }, crcCounts), "invalid_png");
deepEqual(crcCounts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 0, releases: 0 });
const profileCounts = counts();
const badProfileAsset = await assetWithBytes(raster, badProfile);
await expectCode(() => verifyDrawingRasterAsset(badProfileAsset, async () => { throw new Error(); }, profileCounts), "unsupported_png");
deepEqual(profileCounts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 0, releases: 0 });
const corruptDeflate = await assetWithBytes(raster, structuredPng({ idatBytes: new Uint8Array([0xff, 0xff]) }));
const corruptCounts = counts();
await expectCode(() => verifyDrawingRasterAsset(corruptDeflate, async () => { throw new Error("native rejected deflate"); }, corruptCounts), "decode_failed");
deepEqual(corruptCounts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 1, releases: 0 });
const dimensionCounts = counts();
await expectCode(() => verifyDrawingRasterAsset(raster, async () => ({ width: 2, height: 1, rgba: new Uint8Array(8), release: () => undefined }), dimensionCounts), "asset_digest_mismatch");
deepEqual(dimensionCounts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 1, releases: 1 });
const rgbaCounts = counts();
await expectCode(() => verifyDrawingRasterAsset(raster, async () => ({ width: 1, height: 1, rgba: new Uint8Array([0, 0, 0, 0]) }), rgbaCounts), "asset_digest_mismatch");
deepEqual(rgbaCounts, { blobReads: 1, pngPreflights: 1, nativeDecodes: 1, releases: 0 });
let forbiddenDecoderCalls = 0;
const aggregateCounts = counts();
await expectCode(() => verifyDrawingProjectRasters(overDocument, [hugeAsset, smallAsset], async () => {
  forbiddenDecoderCalls += 1;
  return { width: 1, height: 1, rgba: new Uint8Array(4) };
}, aggregateCounts), "project_too_large");
equal(forbiddenDecoderCalls, 0);
deepEqual(aggregateCounts, { blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 });
await expectCode(() => encodeDrawingRasterAsset({ assetId: "encode-fail", width: 1, height: 1, rgba: new Uint8Array(4) }, async () => { throw new Error("injected"); }), "encode_failed");

class OversizedSentinelBlob extends Blob {
  reads = 0;

  override get size() {
    return DRAWING_PROJECT_V2_LIMITS.projectStoredBytes + 1;
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    this.reads += 1;
    throw new Error("UNSAFE_READ_REACHED");
  }
}

const oversizedEncoderBlob = new OversizedSentinelBlob([new Uint8Array([1])], { type: "image/png" });
const oversizedEncoderCounts = counts();
await expectCode(
  () => encodeDrawingRasterAsset(
    { assetId: "encode-over-limit", width: 1, height: 1, rgba: new Uint8Array(4) },
    async () => oversizedEncoderBlob,
    oversizedEncoderCounts,
  ),
  "project_too_large",
  "raster.encoded-length",
);
equal(oversizedEncoderBlob.reads, 0, "over-limit encoder Blob is never read");
deepEqual(oversizedEncoderCounts, { blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 });

const oversizedStoredBlob = new OversizedSentinelBlob([new Uint8Array([1])], { type: "image/png" });
const oversizedStoredCounts = counts();
let oversizedStoredDecoderCalls = 0;
await expectCode(
  () => verifyDrawingRasterAsset(
    { ...raster, encodedByteLength: DRAWING_PROJECT_V2_LIMITS.projectStoredBytes + 1, bytes: oversizedStoredBlob },
    async () => {
      oversizedStoredDecoderCalls += 1;
      throw new Error("UNSAFE_DECODE_REACHED");
    },
    oversizedStoredCounts,
  ),
  "project_too_large",
  "raster.encoded-length",
);
equal(oversizedStoredBlob.reads, 0, "over-limit stored Blob is never read");
equal(oversizedStoredDecoderCalls, 0, "over-limit stored Blob is never decoded");
deepEqual(oversizedStoredCounts, { blobReads: 0, pngPreflights: 0, nativeDecodes: 0, releases: 0 });

const largerRgba = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
const largerRaster = await createRasterAsset("raster-larger", 2, 1, largerRgba);
const orderDocument = clone(record.document);
orderDocument.layers[0].timelineFrames[0].bitmap = { assetId: raster.assetId };
orderDocument.layers[0].timelineFrames[1].tweenEndBitmap = { assetId: largerRaster.assetId };
orderDocument.layers[0].timelineFrames[1].motionTween!.spriteBitmap = null;
const decodeOrder: string[] = [];
const decodedByDigest = new Map([[raster.encodedSha256, new Uint8Array([17, 34, 51, 255])], [largerRaster.encodedSha256, largerRgba]]);
await verifyDrawingProjectRasters(orderDocument, [raster, largerRaster], async (bytes, expected) => {
  const digest = await sha256Hex(bytes);
  decodeOrder.push(digest === largerRaster.encodedSha256 ? "raster-larger" : "raster-primary");
  return { width: expected.width, height: expected.height, rgba: decodedByDigest.get(digest)! };
});
deepEqual(decodeOrder, ["raster-larger", "raster-primary"]);

const liveSound = {
  id: "sound-live",
  title: "Wave",
  description: "Exact ten fields",
  timingFeel: "late",
  intensityFeel: "soft",
  audioDataUrl: createCanonicalWavDataUrl(TEST_WAV_BYTES),
  contentType: "sfx" as const,
  speechText: "boom",
  sourceTask: "generate-sounds" as const,
  attachedAt: "2026-08-15T01:02:03.000Z",
};
const soundSnapshot = await snapshotDrawingSoundAttachment(liveSound);
ok(soundSnapshot.asset);
equal(soundSnapshot.asset!.mimeType, "audio/wav");
deepEqual(new Uint8Array(await soundSnapshot.asset!.bytes.arrayBuffer()), TEST_WAV_BYTES);
deepEqual(await hydrateDrawingSoundAttachment(soundSnapshot.attachment, soundSnapshot.asset), liveSound);
deepEqual(parseCanonicalWavDataUrl(liveSound.audioDataUrl), TEST_WAV_BYTES);
const nullSound = { ...liveSound, audioDataUrl: null, contentType: "voice-placeholder" as const, speechText: null };
const nullSnapshot = await snapshotDrawingSoundAttachment(nullSound);
equal(nullSnapshot.asset, null);
deepEqual(await hydrateDrawingSoundAttachment(nullSnapshot.attachment, null), nullSound);
await expectCode(() => snapshotDrawingSoundAttachment({ ...liveSound, optionId: "unknown" }), "invalid_record");
for (const field of ["durationSeconds", "source", "mimeType", "future"]) {
  await expectCode(() => snapshotDrawingSoundAttachment({ ...liveSound, [field]: "unknown" }), "invalid_record");
}
await expectCode(() => snapshotDrawingSoundAttachment({ ...liveSound, sourceTask: "other" }), "unsupported_version");
await expectCode(() => snapshotDrawingSoundAttachment({ ...liveSound, contentType: "future" }), "unsupported_version");
for (const url of [
  "https://example.invalid/sound.wav",
  "blob:https://example.invalid/id",
  "data:image/png;base64,AAAA",
  "data:audio/mp3;base64,AAAA",
]) await expectCode(() => snapshotDrawingSoundAttachment({ ...liveSound, audioDataUrl: url }), "unsupported_version");
for (const url of [
  "data:audio/wav;base64,AAA",
  "data:audio/wav;base64,AAAA\n",
  "data:audio/wav;base64,AAAA====",
  "data:audio/wav;charset=utf-8;base64,AAAA",
]) await expectCode(() => snapshotDrawingSoundAttachment({ ...liveSound, audioDataUrl: url }), url.includes("charset") ? "unsupported_version" : "invalid_record");
equal(assertCanonicalAudioBase64Length(DRAWING_PROJECT_V2_LIMITS.audioBase64Characters), 44_739_244);
await expectCode(() => assertCanonicalAudioBase64Length(DRAWING_PROJECT_V2_LIMITS.audioBase64Characters + 4), "project_too_large");
await expectCode(() => hydrateDrawingSoundAttachment(soundSnapshot.attachment, { ...soundSnapshot.asset!, byteLength: soundSnapshot.asset!.byteLength + 1 }), "asset_digest_mismatch");
await expectCode(() => hydrateDrawingSoundAttachment(soundSnapshot.attachment, { ...soundSnapshot.asset!, sha256: "0".repeat(64) }), "asset_digest_mismatch");
await expectCode(() => hydrateDrawingSoundAttachment(soundSnapshot.attachment, { ...soundSnapshot.asset!, bytes: new Blob([TEST_WAV_BYTES], { type: "audio/mp3" }) }), "unsupported_version");
await expectCode(() => hydrateDrawingSoundAttachment(soundSnapshot.attachment, null), "asset_missing");

console.log(`SPEC-0002 V2 contract validator passed. ASSERTIONS: ${assertions}`);
