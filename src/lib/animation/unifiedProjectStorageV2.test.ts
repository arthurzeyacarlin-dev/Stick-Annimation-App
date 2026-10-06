import assert from "node:assert/strict";
import { test } from "node:test";
import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2";
import type { UnifiedEncodedAssetV2, UnifiedProjectHeadV2, UnifiedProjectStorageAdapterV2, UnifiedProjectVersionV2 } from "./unifiedProjectStorageV2";

// Node has no ImageData; a minimal stand-in is enough for the reopen (compact frame) check.
class TestImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
}
(globalThis as unknown as { ImageData: typeof TestImageData }).ImageData = TestImageData;

const {
  compressUnifiedProjectStorageV2, createUnifiedProjectStorageV2, digestUnifiedProjectV2, hydrateUnifiedProjectStorageV2, prepareUnifiedProjectStorageV2,
} = await import("./unifiedProjectStorageV2.ts");
const { packAccountProject, unpackAccountProject } = await import("../account/projectBundle.ts");
const { createNativeUnifiedProjectV2 } = await import("./unifiedWorkspaceFactoryV2.ts");
const { compactRasterFromCrop, getRasterReferenceSize } = await import("./compactRasterBitmap.ts");

// The app's drawing canvas (measured by the lead): compact AI frames remember this full size.
const CANVAS = { width: 3035, height: 5759 };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// A stick-figure-like frame: thick round-capped lines with soft (anti-aliased) edges on a clear
// background, like the AI Animator's compact frame pictures.
const stickFrame = (width: number, height: number, seed: number, color = [37, 99, 235]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const line = (x0: number, y0: number, x1: number, y1: number, thickness: number) => {
    const half = thickness / 2, dx = x1 - x0, dy = y1 - y0, lengthSq = dx * dx + dy * dy || 1;
    const left = Math.max(0, Math.floor(Math.min(x0, x1) - half - 1)), right = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + half + 1));
    const top = Math.max(0, Math.floor(Math.min(y0, y1) - half - 1)), bottom = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + half + 1));
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / lengthSq));
      const distance = Math.hypot(x + 0.5 - (x0 + t * dx), y + 0.5 - (y0 + t * dy));
      const alpha = Math.round(255 * Math.max(0, Math.min(1, half + 0.5 - distance)));
      const i = (y * width + x) * 4;
      if (alpha > data[i + 3]) { data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = alpha; }
    }
  };
  const cx = width / 2 + Math.sin(seed) * width * 0.1, hip = height * 0.55, neck = height * 0.25, t = 9;
  line(cx, hip, cx + Math.sin(seed * 0.7) * 10, neck, t);
  line(cx, hip, cx - 40 - (seed % 7) * 3, height * 0.75, t); line(cx - 40 - (seed % 7) * 3, height * 0.75, cx - 50, height * 0.95, t);
  line(cx, hip, cx + 35 + (seed % 5) * 4, height * 0.76, t); line(cx + 35 + (seed % 5) * 4, height * 0.76, cx + 60, height * 0.94, t);
  line(cx, neck, cx + 70 + (seed % 9) * 5, neck + 40, t); line(cx + 70 + (seed % 9) * 5, neck + 40, cx + 140, neck - 10 + seed % 20, t);
  line(cx, neck, cx - 60, neck + 70, t); line(cx - 60, neck + 70, cx - 20 - seed % 30, neck + 120, t);
  return data;
};

// Deterministic "noise" (does not compress): the worst case for the compressor.
const noise = (length: number, seed: number) => {
  const data = new Uint8ClampedArray(length);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < length; i += 1) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; data[i] = state & 255; }
  return data;
};

// A project shaped like a saved AI scene: one keyframe per picture, cropped boxes placed in the
// full canvas (x, y, stageWidth, stageHeight), and hold cells pointing at earlier keyframes.
const sceneProject = (pictures: { width: number; height: number; data: Uint8ClampedArray }[], holdsAfterEach = 1): UnifiedAnimationProjectV2 => {
  const project = createNativeUnifiedProjectV2("2026-10-05T00:00:00.000Z");
  const layer = project.document.layers[0];
  let n = 1;
  layer.cells = [];
  pictures.forEach((picture, index) => {
    const cellId = uuid(n++);
    layer.cells.push({
      cellId, cellType: "keyframe", ownerCellId: cellId,
      content: { soundAttachment: null, items: [{
        itemId: uuid(n++), kind: "drawing-raster/v1", strokes: [], shapes: [],
        bitmap: { width: picture.width, height: picture.height, data: picture.data, x: 1200 + (index % 5) * 7, y: 2600 + (index % 3) * 5, stageWidth: CANVAS.width, stageHeight: CANVAS.height },
        tweenEndBitmap: null, motionTween: null, sourceTransform: null,
      }] },
    });
    for (let hold = 0; hold < holdsAfterEach; hold += 1) layer.cells.push({ cellId: uuid(n++), cellType: "hold", ownerCellId: cellId, content: null });
  });
  return project;
};

// In-memory stand-in for the browser's database (stores exactly the records it is given).
const memoryAdapter = () => {
  const heads = new Map<string, UnifiedProjectHeadV2>();
  const versions = new Map<string, UnifiedProjectVersionV2>();
  const assets = new Map<string, UnifiedEncodedAssetV2>();
  const key = (projectId: string, revision: number, digest: string) => `${projectId}:${revision}:${digest}`;
  const adapter: UnifiedProjectStorageAdapterV2 = {
    listHeads: async () => [...heads.values()],
    listLegacyProjects: async () => [],
    readHead: async projectId => heads.get(projectId) ?? null,
    readLegacyProject: async () => null,
    readVersions: async projectId => [...versions.values()].filter(version => version.projectId === projectId),
    readVersion: async (projectId, revision, digest) => versions.get(key(projectId, revision, digest)) ?? null,
    readAssets: async ids => ids.map(id => { const asset = assets.get(id); if (!asset) throw new Error("asset_missing"); return { ...asset, bytes: asset.bytes.slice() }; }),
    stage: async input => {
      versions.set(key(input.version.projectId, input.version.revision, input.version.projectDigest), structuredClone(input.version));
      for (const asset of input.assets) if (!assets.has(asset.assetId)) assets.set(asset.assetId, { ...asset, bytes: asset.bytes.slice() });
    },
    publish: async head => { heads.set(head.projectId, structuredClone(head)); },
  };
  return { adapter, assets };
};

const sameBytes = (left: ArrayBufferView, right: ArrayBufferView) =>
  Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(Buffer.from(right.buffer, right.byteOffset, right.byteLength));
const bitmapsOf = (project: UnifiedAnimationProjectV2) => project.document.layers.flatMap(layer => layer.cells.flatMap(cell =>
  (cell.content?.items ?? []).flatMap(item => item.kind === "drawing-raster/v1" && item.bitmap ? [item.bitmap] : [])));

test("stick-figure frames: compressed save -> open gives back the exact same bytes, digest and project", async () => {
  const pictures = Array.from({ length: 12 }, (_, i) => ({ width: 420, height: 600, data: stickFrame(420, 600, i) }));
  const project = sceneProject(pictures);
  const prepared = await prepareUnifiedProjectStorageV2(project);
  const written = await compressUnifiedProjectStorageV2(prepared);
  assert.deepEqual({ ...written.version, storedByteLength: 0 }, { ...prepared.version, storedByteLength: 0 }, "only storedByteLength changes (digest, ids, metadata stay)");
  assert.ok(written.assets.every(asset => asset.compression === "deflate"), "every frame picture is stored compressed");
  const raw = prepared.assets.reduce((total, asset) => total + asset.byteLength, 0);
  const stored = written.assets.reduce((total, asset) => total + asset.bytes.byteLength, 0);
  assert.equal(written.version.storedByteLength, prepared.version.metadataByteLength + stored, "storedByteLength = bytes actually stored");
  assert.equal(prepared.version.storedByteLength, prepared.version.metadataByteLength + raw);
  assert.ok(stored * 10 < raw, `stored ${stored} bytes is less than a tenth of raw ${raw}`);
  const reopened = await hydrateUnifiedProjectStorageV2(written.version, written.assets);
  assert.deepEqual(reopened, project);
  bitmapsOf(reopened).forEach((bitmap, i) => {
    assert.ok(bitmap.data instanceof Uint8ClampedArray);
    assert.ok(sameBytes(bitmap.data, pictures[i].data), `frame ${i} pixel-identical`);
  });
  assert.equal(await digestUnifiedProjectV2(reopened), prepared.version.projectDigest);
});

test("random (incompressible) and tiny pictures are stored raw, and still round-trip exactly", async () => {
  const pictures = [{ width: 100, height: 80, data: noise(100 * 80 * 4, 7) }, { width: 2, height: 2, data: noise(16, 9) }, { width: 300, height: 200, data: stickFrame(300, 200, 3) }];
  const project = sceneProject(pictures, 0);
  const prepared = await prepareUnifiedProjectStorageV2(project);
  const written = await compressUnifiedProjectStorageV2(prepared);
  const byLength = new Map(written.assets.map(asset => [asset.byteLength, asset]));
  assert.equal(byLength.get(100 * 80 * 4)?.compression, undefined, "noise does not get smaller, so it stays raw");
  assert.equal(byLength.get(16)?.compression, undefined, "tiny pictures are not worth compressing");
  assert.equal(byLength.get(300 * 200 * 4)?.compression, "deflate");
  const reopened = await hydrateUnifiedProjectStorageV2(written.version, written.assets);
  bitmapsOf(reopened).forEach((bitmap, i) => assert.ok(sameBytes(bitmap.data, pictures[i].data)));
});

test("old saves (raw typed-array and data-url records, no compression tag) still open unchanged", async () => {
  const project = sceneProject([{ width: 64, height: 32, data: stickFrame(64, 32, 1) }, { width: 64, height: 32, data: stickFrame(64, 32, 2) }], 0);
  project.document.layers[0].cells[0].content!.soundAttachment = {
    id: "sound-1", title: "Boom", description: "", timingFeel: null, intensityFeel: null,
    audioDataUrl: "data:audio/wav;base64,UklGRgQAAABXQVZF", sourceTask: "generate-sounds", attachedAt: "2026-10-05T00:00:00.000Z",
  };
  const prepared = await prepareUnifiedProjectStorageV2(project);
  assert.deepEqual(new Set(prepared.assets.map(asset => asset.encoding)), new Set(["typed-array", "data-url"]));
  const oldRecords = prepared.assets.map(({ assetId, sha256, byteLength, encoding, bytes }) => ({ assetId, sha256, byteLength, encoding, bytes }));
  assert.deepEqual(await hydrateUnifiedProjectStorageV2(prepared.version, oldRecords), project);
  // Raw and compressed records can sit side by side as long as storedByteLength counts what is
  // really stored; a storedByteLength that does not match the records is refused.
  const written = await compressUnifiedProjectStorageV2(prepared);
  const typed = written.assets.findIndex(asset => asset.compression === "deflate");
  const mixed = written.assets.map((asset, i) => i === typed ? oldRecords[i] : asset);
  const mixedStored = written.version.storedByteLength - written.assets[typed].bytes.byteLength + oldRecords[typed].byteLength;
  assert.deepEqual(await hydrateUnifiedProjectStorageV2({ ...written.version, storedByteLength: mixedStored }, mixed), project);
  await assert.rejects(hydrateUnifiedProjectStorageV2(written.version, mixed), { message: "version_mismatch" });
  await assert.rejects(hydrateUnifiedProjectStorageV2({ ...written.version, storedByteLength: written.version.storedByteLength + 1 }, written.assets), { message: "version_mismatch" });
});

test("broken or hostile compressed records are refused (never wrong pixels, never unbounded growth)", async () => {
  const project = sceneProject([{ width: 200, height: 200, data: stickFrame(200, 200, 4) }], 0);
  const prepared = await prepareUnifiedProjectStorageV2(project);
  const [asset] = (await compressUnifiedProjectStorageV2(prepared)).assets;
  assert.equal(asset.compression, "deflate");
  const tryOpen = (changed: Partial<UnifiedEncodedAssetV2>) => hydrateUnifiedProjectStorageV2(prepared.version, [{ ...asset, ...changed }]);
  const flipped = asset.bytes.slice(); flipped[Math.floor(flipped.length / 2)] ^= 0x55;
  await assert.rejects(tryOpen({ bytes: flipped }), /asset_digest_mismatch|decode_failed/);
  await assert.rejects(tryOpen({ compressedByteLength: asset.bytes.byteLength + 1 }), { message: "asset_missing" });
  await assert.rejects(tryOpen({ compression: "gzip" as never }), { message: "asset_missing" });
  await assert.rejects(tryOpen({ compression: undefined }), { message: "asset_missing" }, "compressed bytes read as raw are refused");
  await assert.rejects(tryOpen({ encoding: "data-url" }), { message: "asset_missing" });
  // Claims a smaller picture than the stream really holds: decompression stops at the claimed size.
  const zeros = (await compressUnifiedProjectStorageV2(await prepareUnifiedProjectStorageV2(sceneProject([{ width: 1000, height: 1000, data: new Uint8ClampedArray(4_000_000) }], 0)))).assets[0];
  assert.ok(zeros.bytes.byteLength < 10_000, "4 MB of empty pixels squeeze to a few KB");
  await assert.rejects(tryOpen({ bytes: zeros.bytes, compressedByteLength: zeros.bytes.byteLength }), { message: "asset_digest_mismatch" });
  // A record claiming more than an opened project may hold is refused before decompressing.
  await assert.rejects(tryOpen({ byteLength: 2_000_000_000 }), { message: "project_too_large" });
});

// The old-format (v1, raw) account bundle exactly as the code before compression built it.
const oldStyleBundle = async (project: UnifiedAnimationProjectV2) => {
  const prepared = await prepareUnifiedProjectStorageV2(project);
  const header = new TextEncoder().encode(JSON.stringify({ format: "diamond-account-project-bundle/v1", version: prepared.version,
    assets: prepared.assets.map(({ assetId, sha256, byteLength, encoding }) => ({ assetId, sha256, byteLength, encoding })) }));
  const bundle = new Uint8Array(await new Blob([new Uint8Array(4), header, ...prepared.assets.map(asset => asset.bytes as BlobPart)]).arrayBuffer());
  new DataView(bundle.buffer).setUint32(0, header.byteLength, false);
  return bundle;
};
const bundleHeader = (bytes: Uint8Array) => {
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, false);
  return { length, header: JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) };
};

test("a project over the old 128 MiB raw size saves (compressed, v2) and reopens pixel-identical; truly too-large still says project_too_large", async () => {
  const width = 512, height = 512; // 1 MiB per picture, like one AI fight frame
  const pictures = Array.from({ length: 140 }, (_, i) => ({ width, height, data: stickFrame(width, height, i) }));
  const project = sceneProject(pictures, 1);
  const prepared = await prepareUnifiedProjectStorageV2(project);
  assert.ok(prepared.version.storedByteLength > 134_217_728, "raw size is over the old limit");
  const packed = await packAccountProject(project);
  const bytes = new Uint8Array(await packed.body.arrayBuffer());
  const { length, header } = bundleHeader(bytes);
  assert.equal(header.format, "diamond-account-project-bundle/v2");
  assert.ok(header.assets.every((asset: { compression?: string }) => asset.compression === "deflate"));
  assert.equal(packed.version.projectDigest, prepared.version.projectDigest, "same digest as the raw project");
  assert.ok(packed.version.storedByteLength < 134_217_728 / 10, `stored ${packed.version.storedByteLength} bytes`);
  assert.ok(packed.version.storedByteLength <= 140_000_000, "fits the account database's stored_byte_length check");
  assert.ok(bytes.byteLength < 140_000_000 / 10, `bundle ${bytes.byteLength} bytes`);
  const unpacked = await unpackAccountProject(Buffer.from(bytes));
  assert.deepEqual(unpacked.project, project);
  bitmapsOf(unpacked.project).forEach((bitmap, i) => assert.ok(sameBytes(bitmap.data, pictures[i].data), `frame ${i} pixel-identical`));
  assert.equal(await digestUnifiedProjectV2(unpacked.project), prepared.version.projectDigest);
  // A v2 bundle relabelled as v1 is refused (compression is only allowed in v2).
  header.format = "diamond-account-project-bundle/v1";
  const forgedHeader = new TextEncoder().encode(JSON.stringify(header));
  const forged = new Uint8Array(await new Blob([new Uint8Array(4), forgedHeader, bytes.subarray(4 + length)]).arrayBuffer());
  new DataView(forged.buffer).setUint32(0, forgedHeader.byteLength, false);
  await assert.rejects(unpackAccountProject(forged), { message: "bundle_invalid" });
  // Pictures that do not compress cannot hide over the limit.
  const noisy = sceneProject(Array.from({ length: 130 }, (_, i) => ({ width, height, data: noise(width * height * 4, i + 1) })), 0);
  await assert.rejects(packAccountProject(noisy), { message: "project_too_large" });
});

test("projects that fit raw are saved exactly as before (v1, byte-for-byte), and old bundles still open", async () => {
  for (const project of [sceneProject(Array.from({ length: 4 }, (_, i) => ({ width: 300, height: 400, data: stickFrame(300, 400, i) }))), createNativeUnifiedProjectV2("2026-10-05T00:00:00.000Z")]) {
    const packed = new Uint8Array(await (await packAccountProject(project)).body.arrayBuffer());
    const old = await oldStyleBundle(project);
    assert.equal(bundleHeader(packed).header.format, "diamond-account-project-bundle/v1");
    assert.ok(Buffer.from(packed).equals(Buffer.from(old)), "same bytes as the bundle the old code made");
    assert.deepEqual((await unpackAccountProject(old)).project, project);
  }
});

test("browser-database save path is unchanged: raw records, same 128 MiB limit, reads back identical", async () => {
  const pictures = Array.from({ length: 3 }, (_, i) => ({ width: 380, height: 520, data: stickFrame(380, 520, i) }));
  const project = sceneProject(pictures, 1);
  project.revision = 1;
  const { adapter, assets } = memoryAdapter();
  const storage = createUnifiedProjectStorageV2(adapter);
  await storage.write(project, null);
  assert.ok([...assets.values()].every(asset => asset.compression === undefined && asset.bytes.byteLength === asset.byteLength));
  assert.deepEqual(await storage.read(project.projectId), project);
  const big = sceneProject(Array.from({ length: 129 }, (_, i) => ({ width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4).fill(i + 1) })), 0);
  big.revision = 1;
  await assert.rejects(storage.write(big, null), { message: "project_too_large" });
});

test("reopen after a compressed save: identical project, holds stay holds, compact frames stay compact", async () => {
  const pictures = Array.from({ length: 6 }, (_, i) => ({ width: 380, height: 520, data: stickFrame(380, 520, i * 3) }));
  const project = sceneProject(pictures, 2);
  const written = await compressUnifiedProjectStorageV2(await prepareUnifiedProjectStorageV2(project));
  assert.ok(written.assets.every(asset => asset.compression === "deflate"));
  const reopened = await hydrateUnifiedProjectStorageV2(written.version, written.assets);
  assert.deepEqual(reopened, project);
  const cells = reopened.document.layers[0].cells;
  assert.equal(cells.filter(cell => cell.cellType === "hold").length, 12, "holds stay holds (no extra pictures)");
  // Reopen places each saved box back as a compact picture that remembers the full canvas size
  // (same call AnimationWorkspace makes when a project opens).
  for (const bitmap of bitmapsOf(reopened)) {
    const compact = compactRasterFromCrop({ width: bitmap.width, height: bitmap.height, data: bitmap.data, x: bitmap.x ?? 0, y: bitmap.y ?? 0,
      reference: { width: bitmap.stageWidth ?? bitmap.width, height: bitmap.stageHeight ?? bitmap.height } });
    assert.deepEqual(getRasterReferenceSize(compact), CANVAS);
    assert.ok(compact.width * compact.height * 20 < CANVAS.width * CANVAS.height, `compact ${compact.width}x${compact.height}, not the full canvas`);
  }
});
