import assert from "node:assert/strict";
import { test } from "node:test";
import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2";
import type { UnifiedEncodedAssetV2 } from "./unifiedProjectStorageV2";
import type { ProjectRecoveryEnvelopeV1 } from "./projectRecoveryContractV1";
import type { ProjectRecoveryCandidateV1, ProjectRecoveryOwnerV1, ProjectRecoveryStorageAdapterV1 } from "./projectRecoveryStorageV1";

// Node has no ImageData; the project contract module only needs the name to exist.
(globalThis as unknown as { ImageData: unknown }).ImageData ??= class { width = 0; height = 0; data = new Uint8ClampedArray(); };

const { prepareUnifiedProjectStorageV2, digestUnifiedProjectV2 } = await import("./unifiedProjectStorageV2.ts");
const {
  createProjectRecoveryStorageV1, decodeAccountRecoveryWireV1, encodeAccountRecoveryWireV1, reconcileRecoveryAssetFormsV1, withStoredByteLengthDeltaV1,
} = await import("./projectRecoveryStorageV1.ts");
const { PROJECT_RECOVERY_BYTE_LIMIT_V1 } = await import("./projectRecoveryContractV1.ts");
const { createNativeUnifiedProjectV2 } = await import("./unifiedWorkspaceFactoryV2.ts");

const LIMIT = PROJECT_RECOVERY_BYTE_LIMIT_V1;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// A stick-figure-like frame (thick soft lines on a clear background), like the AI Animator's pictures.
const stickFrame = (width: number, height: number, seed: number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const half = 4.5, dx = x1 - x0, dy = y1 - y0, lengthSq = dx * dx + dy * dy || 1;
    for (let y = Math.max(0, Math.floor(Math.min(y0, y1) - 6)); y <= Math.min(height - 1, Math.ceil(Math.max(y0, y1) + 6)); y += 1) {
      for (let x = Math.max(0, Math.floor(Math.min(x0, x1) - 6)); x <= Math.min(width - 1, Math.ceil(Math.max(x0, x1) + 6)); x += 1) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / lengthSq));
        const alpha = Math.round(255 * Math.max(0, Math.min(1, half + 0.5 - Math.hypot(x + 0.5 - (x0 + t * dx), y + 0.5 - (y0 + t * dy)))));
        const i = (y * width + x) * 4;
        if (alpha > data[i + 3]) { data[i] = 37; data[i + 1] = 99; data[i + 2] = 235; data[i + 3] = alpha; }
      }
    }
  };
  const cx = width / 2 + Math.sin(seed) * width * 0.1, hip = height * 0.55, neck = height * 0.25;
  line(cx, hip, cx, neck); line(cx, hip, cx - 40 - (seed % 7) * 3, height * 0.95); line(cx, hip, cx + 35 + (seed % 5) * 4, height * 0.94);
  line(cx, neck, cx + 70 + (seed % 9) * 5, neck + 40 - (seed % 20)); line(cx, neck, cx - 60, neck + 70 + (seed % 30));
  return data;
};
const noise = (length: number, seed: number) => {
  const data = new Uint8ClampedArray(length);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < length; i += 1) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; data[i] = state & 255; }
  return data;
};

// One keyframe per picture + one hold after it, like a saved AI scene.
// `sameAs`: a later edit of that project (same project and layer ids).
const sceneProject = (pictures: Uint8ClampedArray[], sameAs?: UnifiedAnimationProjectV2, side = 512): UnifiedAnimationProjectV2 => {
  const project = createNativeUnifiedProjectV2("2026-10-05T00:00:00.000Z");
  const layer = project.document.layers[0];
  if (sameAs) {
    project.projectId = project.document.projectId = sameAs.projectId;
    layer.layerId = project.document.reopenState.activeLayerId = sameAs.document.layers[0].layerId;
  }
  let n = 1;
  layer.cells = [];
  for (const data of pictures) {
    const cellId = uuid(n++);
    layer.cells.push({ cellId, cellType: "keyframe", ownerCellId: cellId, content: { soundAttachment: null, items: [{
      itemId: uuid(n++), kind: "drawing-raster/v1", strokes: [], shapes: [],
      bitmap: { width: side, height: side, data, x: 1200, y: 2600, stageWidth: 3035, stageHeight: 5759 },
      tweenEndBitmap: null, motionTween: null, sourceTransform: null,
    }] } });
    layer.cells.push({ cellId: uuid(n++), cellType: "hold", ownerCellId: cellId, content: null });
  }
  return project;
};
const bitmapsOf = (project: UnifiedAnimationProjectV2) => project.document.layers.flatMap(layer => layer.cells.flatMap(cell =>
  (cell.content?.items ?? []).flatMap(item => item.kind === "drawing-raster/v1" && item.bitmap ? [item.bitmap.data] : [])));
const sameBytes = (left: ArrayBufferView, right: ArrayBufferView) =>
  Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(Buffer.from(right.buffer, right.byteOffset, right.byteLength));
const wireHeader = (bytes: Uint8Array) => {
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, false);
  return { length, header: JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) };
};

type Wire = { owner: ProjectRecoveryOwnerV1; candidate: ProjectRecoveryCandidateV1; assets: UnifiedEncodedAssetV2[] };

// Behaves like the signed-in (account) adapter: the published draft lives as ONE encoded wire
// record (encodeAccountRecoveryWireV1 bytes); every read decodes those bytes.
const accountLikeAdapter = () => {
  let published: Uint8Array | null = null;
  let staged: Wire | null = null;
  const current = () => published ? decodeAccountRecoveryWireV1(published) : null;
  const source = () => staged ?? current();
  const adapter: ProjectRecoveryStorageAdapterV1 = {
    readHead: async () => structuredClone(source()?.candidate.envelope ?? null),
    readCandidate: async (sequence, digest) => {
      const wire = source();
      return wire && wire.candidate.draftSequence === sequence && wire.candidate.candidateDigest === digest ? structuredClone(wire.candidate) : null;
    },
    readAssets: async ids => {
      const wire = source();
      if (!wire) throw new Error("recovery_asset_missing");
      const byId = new Map(wire.assets.map(asset => [asset.assetId, asset]));
      return ids.map(id => { const asset = byId.get(id); if (!asset) throw new Error("recovery_asset_missing"); return { ...asset, bytes: asset.bytes.slice() }; });
    },
    stage: async input => { staged = { owner: structuredClone(input.owner), candidate: structuredClone(input.candidate), assets: input.assets.map(asset => ({ ...asset, bytes: asset.bytes.slice() })) }; },
    publish: async () => {
      if (!staged) throw new Error("recovery_conflict");
      published = encodeAccountRecoveryWireV1({ ...staged, candidate: { ...staged.candidate, envelope: { ...staged.candidate.envelope, status: "current" } } });
      staged = null;
    },
    abandon: async () => { staged = null; },
    clear: async input => {
      const wire = current();
      if (!wire) return "none";
      const envelope = wire.candidate.envelope;
      if (envelope.ownerSessionId !== input.ownerSessionId || envelope.workspaceInstanceId !== input.workspaceInstanceId ||
        envelope.workspaceGeneration !== input.workspaceGeneration || envelope.candidateDigest !== input.candidateDigest) return "not-matched";
      published = null;
      return "cleared";
    },
  };
  return { adapter, wire: () => published, setWire: (bytes: Uint8Array) => { published = bytes; } };
};

// Behaves like the signed-out (browser database) adapter: ONE record per asset id, shared by the
// current draft and the staged one, reconciled with the same helpers the real adapter uses.
const sharedRecordAdapter = () => {
  let head: ProjectRecoveryEnvelopeV1 | null = null;
  const candidates = new Map<string, ProjectRecoveryCandidateV1>();
  const records = new Map<string, UnifiedEncodedAssetV2>();
  const key = (sequence: number, digest: string) => `${sequence}:${digest}`;
  const prune = (keep: Set<string>) => { for (const id of [...records.keys()]) if (!keep.has(id)) records.delete(id); };
  const adapter: ProjectRecoveryStorageAdapterV1 = {
    readHead: async () => structuredClone(head),
    readCandidate: async (sequence, digest) => structuredClone(candidates.get(key(sequence, digest)) ?? null),
    readAssets: async ids => ids.map(id => { const asset = records.get(id); if (!asset) throw new Error("recovery_asset_missing"); return { ...asset, bytes: asset.bytes.slice() }; }),
    stage: async input => {
      for (const asset of input.assets) {
        const existing = records.get(asset.assetId);
        if (existing && (existing.sha256 !== asset.sha256 || existing.byteLength !== asset.byteLength)) throw new Error("recovery_asset_mismatch");
      }
      const headIds = new Set(head?.assetBindings.map(binding => binding.assetId) ?? []);
      const forms = reconcileRecoveryAssetFormsV1(records, input.assets, headIds);
      for (const asset of forms.write) records.set(asset.assetId, { ...asset, bytes: asset.bytes.slice() });
      if (head && forms.currentDelta !== 0) {
        const headKey = key(head.draftSequence, head.candidateDigest);
        const adjusted = withStoredByteLengthDeltaV1(candidates.get(headKey)!, forms.currentDelta);
        candidates.set(headKey, adjusted);
        head = adjusted.envelope;
      }
      candidates.set(key(input.candidate.draftSequence, input.candidate.candidateDigest), withStoredByteLengthDeltaV1(structuredClone(input.candidate), forms.stagedDelta));
    },
    publish: async input => {
      const candidate = candidates.get(key(input.draftSequence, input.candidateDigest))!;
      head = { ...candidate.envelope, status: "current" };
      candidates.clear();
      candidates.set(key(input.draftSequence, input.candidateDigest), { ...candidate, envelope: head });
      prune(new Set(head.assetBindings.map(binding => binding.assetId)));
    },
    abandon: async input => {
      candidates.delete(key(input.draftSequence, input.candidateDigest));
      prune(new Set(head?.assetBindings.map(binding => binding.assetId) ?? []));
    },
    clear: async () => "none",
  };
  return { adapter, records };
};

let sequence = 0;
const writeDraft = (storage: ReturnType<typeof createProjectRecoveryStorageV1>, candidate: UnifiedAnimationProjectV2, source: UnifiedAnimationProjectV2, generation: number) => {
  sequence += 1;
  return storage.write({
    candidate, sourceProject: source, ownerSessionId: "session-1", workspaceInstanceId: "workspace-1",
    draftSequence: sequence, workspaceGeneration: generation, lastMeaningfulEditAt: "2026-10-05T00:00:00.000Z", now: "2026-10-05T00:00:01.000Z",
  });
};

// ~135 MiB of 512x512 frame pictures: bigger than the 128 MiB a safety backup may store raw
// (Arthur's ~40 s "Energetic fight" was ≈475 AI frames and also over that size).
const BIG_FRAMES = Array.from({ length: 135 }, (_, i) => stickFrame(512, 512, i));

test("a big draft (over 128 MiB raw) is backed up compressed, restores pixel-identical, and Save can clear it", async () => {
  const project = sceneProject(BIG_FRAMES);
  const raw = await prepareUnifiedProjectStorageV2(project);
  assert.ok(raw.version.storedByteLength > LIMIT, `raw size ${raw.version.storedByteLength} is over the limit`);
  const { adapter, wire } = accountLikeAdapter();
  const storage = createProjectRecoveryStorageV1(adapter);
  const written = await writeDraft(storage, project, project, 7);
  assert.equal(written.envelope.candidateDigest, raw.version.projectDigest, "same digest as the uncompressed project");
  assert.ok(written.envelope.storedByteLength <= LIMIT && written.envelope.storedByteLength < raw.version.storedByteLength / 10,
    `stored ${written.envelope.storedByteLength} bytes`);
  const { header } = wireHeader(wire()!);
  assert.equal(header.schema, "account-project-recovery/v2");
  assert.ok(header.assets.every((asset: { compression?: string }) => asset.compression === "deflate"));
  assert.ok(wire()!.byteLength < 140 * 1024 * 1024, "fits the account recovery namespace limit");
  const restored = await storage.readCurrent();
  assert.deepEqual(restored!.project, project);
  bitmapsOf(restored!.project).forEach((data, i) => assert.ok(sameBytes(data, BIG_FRAMES[i]), `frame ${i} pixel-identical`));
  // The bug: after Save, the workspace clears the backup with the digest of the saved candidate.
  assert.equal(await storage.clear({ ownerSessionId: "session-1", workspaceInstanceId: "workspace-1", workspaceGeneration: 7,
    candidateDigest: await digestUnifiedProjectV2(project) }), "cleared");
  assert.equal(wire(), null);
});

test("small drafts are written exactly as before (v1 wire, byte-for-byte) and old drafts still restore", async () => {
  const project = sceneProject(BIG_FRAMES.slice(0, 4));
  const { adapter, wire, setWire } = accountLikeAdapter();
  const storage = createProjectRecoveryStorageV1(adapter);
  await writeDraft(storage, project, project, 1);
  const bytes = wire()!;
  const { header } = wireHeader(bytes);
  assert.equal(header.schema, "account-project-recovery/v1");
  assert.ok(header.assets.every((asset: object) => Object.keys(asset).join() === "assetId,sha256,byteLength,encoding"), "old four asset fields only");
  // The same wire built the way the code before compression built it.
  const prepared = await prepareUnifiedProjectStorageV2(project);
  const oldHeader = new TextEncoder().encode(JSON.stringify({ schema: "account-project-recovery/v1", owner: header.owner, candidate: header.candidate,
    assets: prepared.assets.map(asset => ({ assetId: asset.assetId, sha256: asset.sha256, byteLength: asset.byteLength, encoding: asset.encoding })) }));
  const old = new Uint8Array(await new Blob([new Uint8Array(4), oldHeader, ...prepared.assets.map(asset => asset.bytes as BlobPart)]).arrayBuffer());
  new DataView(old.buffer).setUint32(0, oldHeader.byteLength, false);
  assert.ok(Buffer.from(bytes).equals(Buffer.from(old)), "same bytes as the old code");
  setWire(old);
  assert.deepEqual((await storage.readCurrent())!.project, project, "an old draft restores");
});

test("broken or forged backups are refused; a draft too big even compressed is refused", async () => {
  const project = sceneProject(BIG_FRAMES.slice(0, 3));
  const { adapter, wire, setWire } = accountLikeAdapter();
  const storage = createProjectRecoveryStorageV1(adapter);
  const { prepareUnifiedProjectStorageV2: prepare, compressUnifiedProjectStorageV2: compress } = await import("./unifiedProjectStorageV2.ts");
  await writeDraft(storage, project, project, 1);
  const good = decodeAccountRecoveryWireV1(wire()!);
  // Build a compressed wire for the same draft and then damage it in different ways.
  const compressed = await compress(await prepare(project));
  const candidate = { ...good.candidate, envelope: { ...good.candidate.envelope, storedByteLength: compressed.version.storedByteLength },
    version: { ...good.candidate.version, storedByteLength: compressed.version.storedByteLength } };
  const v2 = encodeAccountRecoveryWireV1({ ...good, candidate, assets: compressed.assets });
  setWire(v2);
  assert.deepEqual((await storage.readCurrent())!.project, project, "a valid compressed wire restores");
  const reencode = (change: (header: { schema: string; assets: Record<string, unknown>[] }) => void, body?: Uint8Array) => {
    const { length, header } = wireHeader(v2);
    change(header);
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const out = new Uint8Array(4 + headerBytes.byteLength + (body ?? v2.subarray(4 + length)).byteLength);
    new DataView(out.buffer).setUint32(0, headerBytes.byteLength, false);
    out.set(headerBytes, 4); out.set(body ?? v2.subarray(4 + length), 4 + headerBytes.byteLength);
    return out;
  };
  assert.throws(() => decodeAccountRecoveryWireV1(reencode(header => { header.schema = "account-project-recovery/v1"; })), { message: "recovery_invalid_record" }, "compression only in v2");
  assert.throws(() => decodeAccountRecoveryWireV1(reencode(header => { header.assets[0].compression = "gzip"; })), { message: "recovery_invalid_record" });
  assert.throws(() => decodeAccountRecoveryWireV1(reencode(header => { header.assets[0].compressedByteLength = LIMIT + 1; })), { message: "recovery_invalid_record" });
  assert.throws(() => decodeAccountRecoveryWireV1(reencode(header => { header.assets[0].encoding = "data-url"; })), { message: "recovery_invalid_record" });
  const { length } = wireHeader(v2);
  const flipped = v2.slice(4 + length); flipped[Math.floor(flipped.length / 2)] ^= 0x55;
  setWire(reencode(() => undefined, flipped));
  await assert.rejects(storage.readCurrent(), /asset_digest_mismatch|decode_failed/, "damaged pixels never restore");
  const inspected = await storage.inspect();
  assert.equal(inspected.kind, "invalid");
  // Pictures that do not compress cannot hide over the limit.
  const noisy = sceneProject(Array.from({ length: 130 }, (_, i) => noise(512 * 512 * 4, i + 1)));
  await assert.rejects(writeDraft(createProjectRecoveryStorageV1(accountLikeAdapter().adapter), noisy, noisy, 1), { message: "project_too_large" });
});

test("reconcile: one record per picture, the smaller stored form wins, sizes only shrink", () => {
  const raw = { assetId: "sha256:a", sha256: "a", byteLength: 1000, encoding: "typed-array" as const, bytes: new Uint8Array(1000) };
  const packed = { ...raw, compression: "deflate" as const, compressedByteLength: 40, bytes: new Uint8Array(40) };
  const fresh = { ...raw, assetId: "sha256:b", sha256: "b" };
  // Current draft stores "a" raw; the new draft (now too big) wants it compressed.
  let forms = reconcileRecoveryAssetFormsV1(new Map([["sha256:a", raw]]), [packed, fresh], new Set(["sha256:a"]));
  assert.deepEqual(forms.write.map(asset => [asset.assetId, asset.compression]), [["sha256:a", "deflate"], ["sha256:b", undefined]]);
  assert.equal(forms.currentDelta, -960, "the current draft's stored size drops by the bytes saved");
  assert.equal(forms.stagedDelta, 0);
  // Current draft stores "a" compressed; the new draft (small again) would store it raw: keep compressed.
  forms = reconcileRecoveryAssetFormsV1(new Map([["sha256:a", packed]]), [raw], new Set(["sha256:a"]));
  assert.deepEqual(forms.write, []);
  assert.equal(forms.stagedDelta, -960);
  assert.equal(forms.currentDelta, 0);
  // Same form: nothing to do.
  forms = reconcileRecoveryAssetFormsV1(new Map([["sha256:a", raw]]), [raw], new Set(["sha256:a"]));
  assert.deepEqual([forms.write.length, forms.stagedDelta, forms.currentDelta], [0, 0, 0]);
});

test("signed-out backups across the size limit: grow past 128 MiB, then shrink, with shared pictures", async () => {
  const { adapter, records } = sharedRecordAdapter();
  const storage = createProjectRecoveryStorageV1(adapter);
  const small = sceneProject(BIG_FRAMES.slice(0, 120));
  const first = await writeDraft(storage, small, small, 1);
  assert.ok([...records.values()].every(asset => asset.compression === undefined), "a draft that fits is stored raw, as before");
  assert.ok(first.envelope.storedByteLength > 120 * 1024 * 1024);
  const big = sceneProject(BIG_FRAMES, small);
  const second = await writeDraft(storage, big, small, 2);
  assert.ok(second.envelope.storedByteLength <= LIMIT, `grown draft stored ${second.envelope.storedByteLength} bytes`);
  assert.ok([...records.values()].every(asset => asset.compression === "deflate"), "shared pictures were re-stored compressed");
  assert.deepEqual((await storage.readCurrent())!.project, big);
  const shrunk = sceneProject(BIG_FRAMES.slice(0, 100), small);
  const third = await writeDraft(storage, shrunk, small, 3);
  assert.ok(third.envelope.storedByteLength < 100 * 1024 * 1024 / 10, "shrunk draft keeps the smaller compressed records");
  const restored = (await storage.readCurrent())!.project;
  assert.deepEqual(restored, shrunk);
  bitmapsOf(restored).forEach((data, i) => assert.ok(sameBytes(data, BIG_FRAMES[i]), `frame ${i} pixel-identical`));
});
