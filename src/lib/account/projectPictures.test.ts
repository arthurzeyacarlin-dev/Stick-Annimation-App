import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2";
import type { UnifiedEncodedAssetV2 } from "../animation/unifiedProjectStorageV2";
import type { AccountProjectAssetEntry } from "./projectBundle";
import type { AccountProjectLocalStore } from "./projectLocalStore";
import type { AccountProjectTransport } from "./projectPictures";

// (Nov 14) Picture-by-picture saving: the save, the save after a small edit, the interrupted save, and opening.
// Node has no ImageData; the storage code only needs it to exist.
class TestImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
}
(globalThis as unknown as { ImageData: typeof TestImageData }).ImageData = TestImageData;

const { digestUnifiedProjectV2, prepareUnifiedProjectStorageV2 } = await import("../animation/unifiedProjectStorageV2.ts");
const { createUnifiedProjectRepositoryV2 } = await import("../animation/unifiedProjectRepositoryV2.ts");
const { createNativeUnifiedProjectV2 } = await import("../animation/unifiedWorkspaceFactoryV2.ts");
const { packAccountProject, unpackAccountProject, unpackAccountProjectManifest, packAccountProjectManifest } = await import("./projectBundle.ts");
const { createMemoryProjectStore } = await import("./projectLocalStore.ts");
const { AccountProjectRefused, holdsLocalAccountProject, keepOpenedAccountProject, openAccountProjectManifest, openAccountProjectPoster, openLocalAccountProject, pushAccountProject, stageAccountProject } = await import("./projectPictures.ts");
const { splitAccountProjectBundle } = await import("./projectBundle.ts");
const { rasterCropBitmap, rasterCropOf, savedPictureInFrame, stablePaintedBounds } = await import("../animation/rasterCropV1.ts");
const { compactRasterFromCrop, paintedBounds } = await import("../animation/compactRasterBitmap.ts");

const OWNER = "owner-1";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const noWait = async () => undefined;

// One frame picture like the AI Animator's: soft-edged colour shapes on a clear background, different for every seed.
const picture = (seed: number, width = 160, height = 120) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const distance = Math.hypot(x - width / 2 - Math.sin(seed) * 30, y - height / 2 - Math.cos(seed * 1.7) * 20);
    const alpha = Math.round(255 * Math.max(0, Math.min(1, (28 + (seed % 5)) - distance)));
    if (alpha > 0) data.set([(x * 3 + seed * 11) & 255, (y * 5 + seed * 7) & 255, (x + y + seed) & 255, alpha], (y * width + x) * 4);
  }
  return { width, height, data };
};

// A project shaped like a saved AI animation: one keyframe per picture (with its small preview), in the full canvas.
const animation = (count: number): UnifiedAnimationProjectV2 => {
  const project = createNativeUnifiedProjectV2("2026-11-14T00:00:00.000Z");
  let n = 1;
  project.document.layers[0].cells = Array.from({ length: count }, (_, index) => {
    const cellId = uuid(n++);
    return {
      cellId, cellType: "keyframe" as const, ownerCellId: cellId,
      content: { soundAttachment: null, items: [{
        itemId: uuid(n++), kind: "drawing-raster/v1" as const, strokes: [], shapes: [],
        bitmap: { ...picture(index), x: 1200 + index, y: 2600, stageWidth: 3035, stageHeight: 5759 },
        tweenEndBitmap: null, motionTween: null, sourceTransform: null,
      }] },
    };
  });
  return project;
};
const bitmapsOf = (project: UnifiedAnimationProjectV2) => project.document.layers.flatMap(layer => layer.cells.flatMap(cell =>
  (cell.content?.items ?? []).flatMap(item => item.kind === "drawing-raster/v1" && item.bitmap ? [item.bitmap] : [])));
const pixelHashes = (project: UnifiedAnimationProjectV2) => bitmapsOf(project).map(bitmap => createHash("sha256").update(bitmap.data).digest("hex"));

// The account, as the real server keeps it: pictures by name (checked against their fingerprint), and one saved
// description per project, accepted only when every picture it names is held and the revision follows.
const account = () => {
  const pictures = new Map<string, Uint8Array>();
  const heads = new Map<string, { revision: number; projectDigest: string; manifest: Uint8Array }>();
  const log = { missing: 0, put: [] as string[], get: [] as string[], commits: 0 };
  let failPutsAfter = Number.POSITIVE_INFINITY, failNextPuts = 0;
  const name = (entry: Pick<AccountProjectAssetEntry, "sha256" | "compression">) => `${entry.sha256}.${entry.compression ?? "raw"}`;
  const storedLength = (entry: AccountProjectAssetEntry) => entry.compressedByteLength ?? entry.byteLength;
  const holds = (projectId: string, entry: AccountProjectAssetEntry) => pictures.get(`${projectId}/${name(entry)}`)?.byteLength === storedLength(entry);
  const transport: AccountProjectTransport = {
    missing: async (projectId, assets) => { log.missing += 1; return assets.filter(entry => !holds(projectId, entry)).map(entry => entry.assetId); },
    putAsset: async (projectId, asset: UnifiedEncodedAssetV2) => {
      if (log.put.length >= failPutsAfter) throw new Error("server_down");
      if (failNextPuts > 0) { failNextPuts -= 1; throw new Error("network_blip"); }
      const opened = asset.compression ? inflateSync(asset.bytes) : asset.bytes;
      if (opened.byteLength !== asset.byteLength || createHash("sha256").update(opened).digest("hex") !== asset.sha256) throw new AccountProjectRefused("bundle_invalid");
      pictures.set(`${projectId}/${name(asset)}`, asset.bytes.slice());
      log.put.push(asset.assetId);
    },
    getAsset: async (projectId, entry) => {
      const bytes = pictures.get(`${projectId}/${name(entry)}`);
      if (!bytes) throw new AccountProjectRefused("account_project_read_failed");
      log.get.push(entry.assetId);
      return bytes.slice();
    },
    commit: async (bytes, receipt, expectedRevision) => {
      const manifest = await unpackAccountProjectManifest(bytes);
      if (!manifest) throw new Error("bundle_invalid");
      const { projectId, revision, projectDigest } = manifest.version;
      const prior = heads.get(projectId) ?? null;
      if (prior?.revision === revision && prior.projectDigest === projectDigest) return;
      if (revision !== (expectedRevision ?? 0) + 1 || (prior?.revision ?? null) !== expectedRevision) throw new Error("stale_revision");
      if (manifest.assets.some(entry => !holds(projectId, entry))) throw new Error("account_project_pictures_missing");
      assert.deepEqual({ projectId, revision, projectDigest }, { projectId: receipt.projectId, revision: receipt.revision, projectDigest: receipt.projectDigest });
      heads.set(projectId, { revision, projectDigest, manifest: bytes.slice() });
      log.commits += 1;
    },
  };
  return { transport, log, heads, pictures, breakAfterPuts: (count: number) => { failPutsAfter = count; }, blip: (count: number) => { failNextPuts = count; } };
};

// A store that counts what is written into it.
const countingStore = () => {
  const inner = createMemoryProjectStore();
  const packed: string[] = [];
  const store: AccountProjectLocalStore = { ...inner, putAsset: async asset => { packed.push(asset.assetId); await inner.putAsset(asset); } };
  return { store, packed };
};

// The editor's save, through the same repository the app uses.
const editor = (store: AccountProjectLocalStore, transport: AccountProjectTransport) => createUnifiedProjectRepositoryV2({
  storage: {
    read: async () => { throw new Error("not_used"); },
    write: async (candidate, expectedRevision) => {
      await pushAccountProject(store, transport, await stageAccountProject(store, OWNER, candidate, expectedRevision), noWait);
      return candidate;
    },
  },
});
const openFromAccount = async (store: AccountProjectLocalStore, server: ReturnType<typeof account>, projectId: string) => {
  const bytes = server.heads.get(projectId)!.manifest;
  return openAccountProjectManifest(store, server.transport, OWNER, bytes, (await unpackAccountProjectManifest(bytes))!, noWait);
};

test("a long animation is saved picture by picture, each picture once, and opens identical on another computer", async () => {
  const server = account(), { store, packed } = countingStore();
  const saved = await editor(store, server.transport).save(animation(40));
  assert.equal(saved.revision, 1);
  assert.equal(packed.length, 40, "every picture was packed into the browser's store once");
  assert.equal(server.log.put.length, 40, "every picture was sent once, in its own request");
  assert.equal(server.log.commits, 1);
  assert.equal((await store.getProject(OWNER, saved.projectId))!.head.state, "saved");
  assert.ok(server.heads.get(saved.projectId)!.manifest.byteLength < 60_000, "the saved description is small: it only names its pictures");

  const elsewhere = createMemoryProjectStore();
  const opened = await openFromAccount(elsewhere, server, saved.projectId);
  assert.deepEqual(opened, saved);
  assert.deepEqual(pixelHashes(opened), pixelHashes(saved), "identical picture for picture");
  assert.equal(await digestUnifiedProjectV2(opened), await digestUnifiedProjectV2(saved));
  assert.equal(server.log.get.length, 40);

  // The computer that made it holds every picture already: nothing is downloaded.
  server.log.get.length = 0;
  const local = await openLocalAccountProject(store, (await store.getProject(OWNER, saved.projectId))!);
  assert.deepEqual(local, saved);
  assert.deepEqual(await openFromAccount(store, server, saved.projectId), saved);
  assert.equal(server.log.get.length, 0, "opened from the browser's own store");
});

test("saving again after a small edit packs and sends only the changed picture", async () => {
  const server = account(), { store, packed } = countingStore();
  const repository = editor(store, server.transport);
  const first = await repository.save(animation(30));
  packed.length = 0; server.log.put.length = 0;

  const edited = structuredClone(first);
  const bitmap = bitmapsOf(edited)[7];
  bitmap.data.set([255, 0, 0, 255], (60 * bitmap.width + 80) * 4);   // one pixel of one picture
  const second = await repository.save(edited);
  assert.equal(second.revision, 2);
  assert.equal(packed.length, 1, "only the changed picture was packed");
  assert.equal(server.log.put.length, 1, "only the changed picture was sent");
  assert.deepEqual(pixelHashes(await openFromAccount(createMemoryProjectStore(), server, second.projectId)), pixelHashes(second));

  // Saving with nothing changed sends no picture at all.
  packed.length = 0; server.log.put.length = 0;
  await repository.save(second);
  assert.deepEqual([packed.length, server.log.put.length], [0, 0]);
});

test("a save cut off in the middle loses nothing: it stays in the browser and is finished later with only what was left", async () => {
  const server = account(), { store } = countingStore();
  server.breakAfterPuts(12);   // the server goes away after 12 of the 36 pictures
  const project = animation(36);
  await assert.rejects(editor(store, server.transport).save(project), /server_down/);
  assert.equal(server.heads.size, 0, "the account never saw a half-saved project");

  // ... the tab is closed. Later (a new page, the same browser storage): the save is still there, whole.
  const pending = (await store.listHeads(OWNER))[0];
  assert.deepEqual([pending.state, pending.revision, pending.expectedRevision], ["pending", 1, null]);
  const held = await store.getProject(OWNER, pending.projectId);
  const fromBrowser = await openLocalAccountProject(store, held!);
  assert.deepEqual(pixelHashes(fromBrowser!), pixelHashes(project), "every picture of the unsaved work is in the browser's store");

  // The server is back: the save is finished, sending only the pictures it did not get.
  server.breakAfterPuts(Number.POSITIVE_INFINITY);
  await pushAccountProject(store, server.transport, held!, noWait);
  assert.equal(server.log.put.length, 36, "12 before the cut + the 24 that were left");
  assert.equal(new Set(server.log.put).size, 36, "no picture was sent twice");
  assert.equal((await store.getProject(OWNER, pending.projectId))!.head.state, "saved");
  assert.deepEqual(pixelHashes(await openFromAccount(createMemoryProjectStore(), server, pending.projectId)), pixelHashes(project));
});

test("a save whose pictures the browser lost is known as not whole, and the account's last saved version still opens", async () => {
  // (Nov 15, live) the Mac ran out of memory in the middle of a save: its description was stored, 3 of its pictures were not.
  const server = account(), inner = createMemoryProjectStore();
  const first = await editor(inner, server.transport).save(animation(20));
  const edited = structuredClone(first);
  for (const index of [2, 9, 15]) bitmapsOf(edited)[index].data.set([255, 0, 0, 255], (60 * 160 + 80) * 4);
  let lose = false; const lost = new Set<string>();
  const dying: AccountProjectLocalStore = { ...inner, putAsset: async asset => { if (lose) { lost.add(asset.assetId); return; } await inner.putAsset(asset); } };
  lose = true; server.breakAfterPuts(server.log.put.length);   // the pictures of this save reach neither the store nor the account
  await assert.rejects(editor(dying, server.transport).save(edited));
  assert.equal(lost.size, 3);

  // ... a new page, the same browser storage:
  const pending = (await inner.getProject(OWNER, first.projectId))!;
  assert.deepEqual([pending.head.state, pending.head.expectedRevision, pending.head.revision], ["pending", 1, 2]);
  assert.equal(await holdsLocalAccountProject(inner, pending), false, "the save is not whole: it can never be finished");
  assert.equal(await openLocalAccountProject(inner, pending), null);
  server.breakAfterPuts(Number.POSITIVE_INFINITY);
  await assert.rejects(pushAccountProject(inner, server.transport, pending, noWait), /account_project_not_saved/);   // (what locked the project before the fix)

  // Dropped: the account's last saved version is the project, and it opens identical.
  await inner.deleteProject(OWNER, first.projectId);
  assert.equal(server.heads.get(first.projectId)!.revision, 1);
  assert.deepEqual(pixelHashes(await openFromAccount(inner, server, first.projectId)), pixelHashes(first));

  // A whole pending save is still whole (the save cut off by the server, as before).
  const other = createMemoryProjectStore(), down = account(); down.breakAfterPuts(4);
  await assert.rejects(editor(other, down.transport).save(animation(10)), /server_down/);
  assert.equal(await holdsLocalAccountProject(other, (await other.getProject(OWNER, (await other.listHeads(OWNER))[0].projectId))!), true);
});

test("a picture upload that fails is tried again by itself; a plain refusal is not", async () => {
  const server = account(), { store } = countingStore();
  server.blip(3);   // three requests in a row fail, then the network is back
  const saved = await editor(store, server.transport).save(animation(5));
  assert.equal(server.log.put.length, 5);
  assert.equal(server.heads.get(saved.projectId)!.revision, 1);

  // A picture whose bytes are not what its name says is refused by the account and never stored.
  const broken = account(), other = countingStore();
  const staged = await stageAccountProject(other.store, OWNER, animation(3), null);
  const victim = (await other.store.getAsset(staged.head.assetIds[0]))!;
  const damaged = victim.bytes.slice(); damaged[damaged.length >> 1] ^= 0x5a;
  await other.store.putAsset({ ...victim, bytes: damaged });
  await assert.rejects(pushAccountProject(other.store, broken.transport, staged, noWait));
  assert.equal(broken.heads.size, 0);
});

test("a picture damaged in the browser's store is taken from the account again", async () => {
  const server = account(), { store } = countingStore();
  const saved = await editor(store, server.transport).save(animation(8));
  const victim = (await store.getAsset((await store.getProject(OWNER, saved.projectId))!.head.assetIds[3]))!;
  const damaged = victim.bytes.slice(); damaged[damaged.length >> 1] ^= 0x5a;
  await store.putAsset({ ...victim, bytes: damaged });
  assert.equal(await openLocalAccountProject(store, (await store.getProject(OWNER, saved.projectId))!), null, "never opened with a wrong picture");
  assert.deepEqual(pixelHashes(await openFromAccount(store, server, saved.projectId)), pixelHashes(saved));
});

test("the editor can go on changing a picture while it is being saved: what is saved is one true state of each picture", async () => {
  const project = animation(6);
  const seen: string[] = [];
  const prepared = await prepareUnifiedProjectStorageV2(project, {}, undefined, async (asset, read) => {
    assert.equal(createHash("sha256").update(read()).digest("hex"), asset.sha256, "the bytes handed over match their fingerprint");
    seen.push(asset.assetId);
    for (const bitmap of bitmapsOf(project)) bitmap.data.fill(seen.length);   // the editor scribbles over every picture meanwhile
  });
  assert.equal(seen.length, 6);
  assert.deepEqual(prepared.assets, [], "no picture is kept in memory by the walk");
  assert.deepEqual(prepared.version.assetIds, [...seen].sort());
});

test("the project description checks itself, old bundles are still bundles, and the two are never mixed up", async () => {
  const store = createMemoryProjectStore();
  const project = animation(4);
  project.revision = 1;
  const staged = await stageAccountProject(store, OWNER, project, null);
  const manifest = (await unpackAccountProjectManifest(staged.manifest))!;
  assert.equal(manifest.version.projectDigest, await digestUnifiedProjectV2(project), "the same fingerprint as the one-file save");
  await assert.rejects(unpackAccountProject(staged.manifest), { message: "bundle_invalid" });

  const tampered = (change: (value: typeof manifest) => void) => {
    const copy = structuredClone(manifest);
    change(copy);
    return unpackAccountProjectManifest(packAccountProjectManifest(copy));
  };
  await assert.rejects(tampered(copy => { (copy.version.encodedProject as { title: string }).title = "Changed"; }), { message: "bundle_invalid" });
  await assert.rejects(tampered(copy => { copy.version.storedByteLength += 1; }), { message: "bundle_invalid" });
  await assert.rejects(tampered(copy => { copy.assets[0].byteLength += 4; }), { message: "bundle_invalid" });
  await assert.rejects(tampered(copy => { copy.version.revision = 2; }), { message: "bundle_invalid" });
  const withBody = new Uint8Array(staged.manifest.byteLength + 1); withBody.set(staged.manifest);
  await assert.rejects(unpackAccountProjectManifest(withBody), { message: "bundle_invalid" });

  // A one-file bundle (every project saved before Nov 14, and every small project still) is not a description...
  const bundle = new Uint8Array(await (await packAccountProject(project)).body.arrayBuffer());
  assert.equal(await unpackAccountProjectManifest(bundle), null);
  // ... and opens exactly as before.
  assert.deepEqual((await unpackAccountProject(bundle)).project, project);

  // A one-file bundle is opened whole (on the server too): it may still not claim more than 1 GiB of pictures.
  const header = JSON.parse(new TextDecoder().decode(bundle.subarray(4, 4 + new DataView(bundle.buffer).getUint32(0, false))));
  header.assets[0].byteLength = 2_000_000_000;
  const claimed = new TextEncoder().encode(JSON.stringify(header));
  const hostile = new Uint8Array(4 + claimed.byteLength);
  new DataView(hostile.buffer).setUint32(0, claimed.byteLength, false); hostile.set(claimed, 4);
  await assert.rejects(unpackAccountProject(hostile), { message: "project_too_large" });
});

test("a project saved before Nov 14 (one bundle) opens as before, is then kept in the browser, and goes picture by picture from its next save", async () => {
  // The bundle exactly as the old code saved it ...
  const old = animation(12);
  old.revision = 3;
  const bundle = new Uint8Array(await (await packAccountProject(old)).body.arrayBuffer());
  // ... opens exactly as before,
  assert.deepEqual((await unpackAccountProject(bundle)).project, old);
  // and what was downloaded is kept: the next open on this computer needs no download at all.
  const { store, packed } = countingStore();
  const { version, assets } = splitAccountProjectBundle(bundle);
  await keepOpenedAccountProject(store, OWNER, version, assets);
  const held = (await store.getProject(OWNER, old.projectId))!;
  assert.deepEqual([held.head.state, held.head.revision, held.head.projectDigest], ["saved", 3, version.projectDigest]);
  assert.deepEqual(await openLocalAccountProject(store, held), old);
  assert.deepEqual(pixelHashes((await openLocalAccountProject(store, held))!), pixelHashes(old));

  // Its next save is picture by picture; the pictures the browser already holds are not packed again.
  packed.length = 0;
  const server = account();
  const edited = structuredClone(old);
  bitmapsOf(edited)[2].data.set([9, 9, 9, 255], 400);
  const staged = await stageAccountProject(store, OWNER, { ...edited, revision: 4 }, 3);
  assert.equal(packed.length, 1, "only the edited picture was packed");
  assert.ok(await unpackAccountProjectManifest(staged.manifest));
  assert.equal(server.heads.size, 0);
});

// (Nov 14, 606 pictures) The editor's frame pictures are bigger than what is saved (the saved picture is the tight box of
// the painted pixels). The save no longer copies that box out of every frame for every save.
const framePicture = (seed: number) => {
  // A frame picture as the editor holds it: the painted part sits somewhere inside a larger clear box.
  const inner = picture(seed, 120, 90), width = 400, height = 300, left = 37 + seed % 50, top = 21 + seed % 30;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < inner.height; row += 1) data.set(inner.data.subarray(row * inner.width * 4, (row + 1) * inner.width * 4), ((top + row) * width + left) * 4);
  return { width, height, data };
};
// The same animation built the way the editor's save snapshot builds it: `copied` = the old way (the tight box copied out),
// otherwise the new way (the box left in the frame picture).
const snapshot = (frames: { width: number; height: number; data: Uint8ClampedArray }[], copied: boolean) => {
  const project = animation(frames.length);
  bitmapsOf(project).forEach((bitmap, index) => {
    const frame = frames[index], bounds = (copied ? paintedBounds : stablePaintedBounds)(frame.data, frame.width, frame.height)!;
    const crop = { source: frame.data, sourceWidth: frame.width, ...bounds };
    const stage = { x: bounds.left + 1000, y: bounds.top + 2000, stageWidth: 3035, stageHeight: 5759 };
    const saved = rasterCropBitmap(crop, stage);
    (project.document.layers[0].cells[index].content!.items[0] as { bitmap: unknown }).bitmap = copied ? { width: saved.width, height: saved.height, data: saved.data, ...stage } : saved;
  });
  return project;
};

test("a picture left in its frame is saved as exactly the bytes the old copy had, read once, and never read again when nothing changed", async () => {
  const frames = Array.from({ length: 24 }, (_, index) => framePicture(index));
  const oldWay = snapshot(frames, true), newWay = snapshot(frames, false);
  assert.ok(bitmapsOf(newWay).every(bitmap => rasterCropOf(bitmap)), "no picture was copied out of its frame");
  assert.deepEqual(pixelHashes(newWay), pixelHashes(oldWay), "anything that asks for the picture's bytes gets the same bytes");

  const server = account(), { store, packed } = countingStore();
  const repository = editor(store, server.transport);
  const first = await repository.save(newWay);
  assert.equal(packed.length, 24);
  const reference = await stageAccountProject(createMemoryProjectStore(), OWNER, { ...oldWay, revision: 1 }, null);
  assert.deepEqual((await store.getProject(OWNER, first.projectId))!.head.assetIds, reference.head.assetIds, "the same fingerprints as the old copies");
  const opened = await openFromAccount(createMemoryProjectStore(), server, first.projectId);
  assert.deepEqual(pixelHashes(opened), pixelHashes(oldWay), "saved and opened again: identical picture for picture");

  // Saving again: the pictures are not read at all (their frame pictures were fingerprinted already).
  let reads = 0;
  for (const frame of frames) {
    const subarray = frame.data.subarray.bind(frame.data);
    frame.data.subarray = ((...range: [number?, number?]) => { reads += 1; return subarray(...range); }) as typeof frame.data.subarray;
  }
  packed.length = 0; server.log.put.length = 0;
  // (the editor's next snapshot of the same project: new objects, the same frame pictures)
  const again = (saved: UnifiedAnimationProjectV2) => {
    const next = snapshot(frames, false);
    return { ...next, projectId: saved.projectId, revision: saved.revision, document: { ...next.document, projectId: saved.projectId } };
  };
  const second = await repository.save(again(first));
  assert.deepEqual([second.revision, reads, packed.length, server.log.put.length], [2, 0, 0, 0]);

  // One frame is edited (the editor REPLACES a compact picture, it never changes it in place): only that one is read and sent.
  frames[5] = framePicture(99);
  const third = await repository.save(again(second));
  assert.deepEqual([third.revision, packed.length, server.log.put.length], [3, 1, 1]);
  assert.equal(reads, 0, "no untouched frame picture was read");
});

test("no size wall for the whole project: only one picture is limited (and a one-file bundle, as before)", async () => {
  const { hydrateUnifiedProjectStorageV2: hydrate } = await import("../animation/unifiedProjectStorageV2.ts");
  const store = createMemoryProjectStore();
  const staged = await stageAccountProject(store, OWNER, { ...animation(3), revision: 1 }, null);
  const manifest = (await unpackAccountProjectManifest(staged.manifest))!;
  const assets = await Promise.all(manifest.assets.map(async entry => (await store.getAsset(entry.assetId))!));
  await hydrate(manifest.version, assets);
  await assert.rejects(hydrate(manifest.version, [{ ...assets[0], byteLength: 300_000_000 }, ...assets.slice(1)]), { message: "project_too_large" });
});

test("a poster opens only the first frames of a long animation, on any computer, and knows the whole project's fingerprint", async () => {
  const server = account(), { store } = countingStore();
  const saved = await editor(store, server.transport).save(animation(40));
  const manifest = (await unpackAccountProjectManifest(server.heads.get(saved.projectId)!.manifest))!;

  // Another computer (nothing held): 2 frames are downloaded, not 40.
  const poster = await openAccountProjectPoster(createMemoryProjectStore(), server.transport, manifest, 2, noWait);
  assert.equal(server.log.get.length, 2);
  assert.deepEqual([poster.complete, poster.projectDigest], [false, await digestUnifiedProjectV2(saved)]);
  const shown = bitmapsOf(poster.project), whole = bitmapsOf(saved);
  assert.equal(shown.length, 40, "every frame is still there (the length of the animation is right)");
  assert.deepEqual(pixelHashes(poster.project).slice(0, 2), pixelHashes(saved).slice(0, 2), "the frames it shows are the real pictures");
  assert.ok(shown.slice(2).every((bitmap, index) => bitmap.width === 1 && bitmap.height === 1 && bitmap.data.every(byte => byte === 0) && bitmap.x === whole[index + 2].x));
  assert.equal(poster.project.title, saved.title);

  // Asked for more frames than there are: the whole project, exactly.
  const all = await openAccountProjectPoster(store, server.transport, manifest, 64, noWait);
  assert.equal(all.complete, true);
  assert.deepEqual(pixelHashes(all.project), pixelHashes(saved));
});

test("opening holds one copy: each saved picture becomes a box of its frame picture, and the next save reads nothing", async () => {
  // A saved long animation, opened on the computer that made it ...
  const server = account(), { store, packed } = countingStore();
  const saved = await editor(store, server.transport).save(animation(20));
  const opened = (await openLocalAccountProject(store, (await store.getProject(OWNER, saved.projectId))!))!;
  const before = pixelHashes(opened);

  // ... and the editor builds its frame pictures exactly as AnimationWorkspace does, letting each opened picture go.
  const frames = bitmapsOf(opened).map(bitmap => compactRasterFromCrop({ width: bitmap.width, height: bitmap.height, data: bitmap.data, x: bitmap.x ?? 0, y: bitmap.y ?? 0,
    reference: { width: bitmap.stageWidth!, height: bitmap.stageHeight! }, paintCoverage: null }));
  opened.document.layers[0].cells.forEach((cell, index) => {
    const raster = cell.content!.items[0] as { bitmap: NonNullable<ReturnType<typeof bitmapsOf>[number]> };
    const inFrame = savedPictureInFrame(raster.bitmap, frames[index]);
    assert.ok(inFrame, "a compact frame picture can stand in for its saved picture");
    assert.deepEqual({ ...inFrame, data: null }, { ...raster.bitmap, data: null }, "the same picture record");
    raster.bitmap = inFrame!;
  });
  assert.ok(bitmapsOf(opened).every(bitmap => rasterCropOf(bitmap)), "no opened copy of the bytes is kept");
  assert.deepEqual(pixelHashes(opened), before, "the project still gives exactly the same bytes for every picture");
  assert.equal(await digestUnifiedProjectV2(opened), await digestUnifiedProjectV2(saved), "the same project, by its fingerprint");

  // The first save after opening: no frame picture is read (its box and fingerprint are known from the open).
  let reads = 0;
  for (const frame of frames) {
    const subarray = frame.data.subarray.bind(frame.data);
    frame.data.subarray = ((...range: [number?, number?]) => { reads += 1; return subarray(...range); }) as typeof frame.data.subarray;
  }
  packed.length = 0; server.log.put.length = 0;
  const again = await editor(store, server.transport).save(opened);
  assert.deepEqual([again.revision, reads, packed.length, server.log.put.length], [2, 0, 0, 0]);
  assert.deepEqual(pixelHashes(await openFromAccount(createMemoryProjectStore(), server, again.projectId)), before);

  // A picture that is not a compact frame picture (it could be changed in place) keeps its own bytes.
  const plain = bitmapsOf(saved)[0];
  assert.equal(savedPictureInFrame(plain, { width: plain.width, height: plain.height, data: plain.data }), null);
});

// (Nov 14, light memory) A frame picture that is not at the playhead is kept packed (framePictureStore.ts): its own pixel
// array reads as empty. A save must still find, check and store exactly the same bytes.
test("frames that were packed before the save: the project is valid, saves the same fingerprints and opens identical", async () => {
  const { packPixelData, isPixelDataPacked } = await import("../animation/framePictureStore.ts");
  const frames = Array.from({ length: 12 }, (_, index) => framePicture(100 + index));
  const oldWay = snapshot(frames, true);   // (the tight boxes copied out while the frames are still raw)
  const reference = await stageAccountProject(createMemoryProjectStore(), OWNER, { ...oldWay, revision: 1 }, null);
  const hashes = pixelHashes(oldWay);
  const newWay = snapshot(frames, false);
  for (const frame of frames) packPixelData(frame.data);
  assert.ok(frames.every(frame => isPixelDataPacked(frame.data) && frame.data.byteLength === 0), "every frame picture was packed");
  assert.deepEqual(pixelHashes(newWay), hashes, "a packed frame still gives the same bytes");

  const server = account(), { store } = countingStore();
  const repository = editor(store, server.transport);
  const first = await repository.save(newWay);
  assert.deepEqual((await store.getProject(OWNER, first.projectId))!.head.assetIds, reference.head.assetIds, "the same fingerprints as before packing");
  const opened = await openFromAccount(createMemoryProjectStore(), server, first.projectId);
  assert.deepEqual(pixelHashes(opened), hashes, "saved and opened again: identical picture for picture");

  // a snapshot made AFTER packing (the editor's next save of the same frames) is the same project again
  const next = snapshot(frames, false);
  const second = await repository.save({ ...next, projectId: first.projectId, revision: first.revision, document: { ...next.document, projectId: first.projectId } });
  assert.deepEqual((await store.getProject(OWNER, second.projectId))!.head.assetIds, reference.head.assetIds);
});
