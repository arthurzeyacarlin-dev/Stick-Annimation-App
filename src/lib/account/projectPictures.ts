import { assertUnifiedAnimationProjectV2, type UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import { assertStructuredSymbolDigestsV2 } from "../animation/unifiedProjectCatalogV2.ts";
import {
  compressUnifiedAssetV2,
  hydrateUnifiedProjectStorageV2,
  prepareUnifiedProjectStorageV2,
  storedAssetByteLength,
  type UnifiedEncodedAssetV2,
} from "../animation/unifiedProjectStorageV2.ts";
import { packAccountProjectManifest, unpackAccountProjectManifest, type AccountProjectAssetEntry, type AccountProjectManifest } from "./projectBundle.ts";
import type { AccountProjectLocalStore, LocalProject, LocalProjectHead } from "./projectLocalStore.ts";

// (Nov 14) PICTURE-BY-PICTURE SAVING. A long AI animation is hundreds of frame pictures (over 1 GB opened). Packing
// them into one bundle froze the page for minutes and could not be sent at all. Here a project is saved as:
//   1. stage: each picture is fingerprinted, packed and written to the browser's own store, ONE AT A TIME (a picture
//      the browser already holds is not packed again); then the project description, which only names its pictures.
//      From this moment the save cannot be lost: it is "pending" in the browser until the account confirms it.
//   2. push: the account says which pictures it does not hold; only those are sent, each in its own small request
//      that retries by itself; then the small description is sent, and the account makes it the saved version.
// Opening is the reverse: the description first, then each picture from the browser's store when it is there.

export type AccountProjectReceipt = { projectId: string; revision: number; projectDigest: string };

// How the pictures and the description reach the account (projectClient.ts gives the real one; tests give their own).
export type AccountProjectTransport = {
  missing: (projectId: string, assets: AccountProjectAssetEntry[]) => Promise<string[]>;
  putAsset: (projectId: string, asset: UnifiedEncodedAssetV2) => Promise<void>;
  getAsset: (projectId: string, entry: AccountProjectAssetEntry) => Promise<Uint8Array>;
  // Sends the description; resolves when the account holds this exact version (throws the save's error otherwise).
  commit: (manifest: Uint8Array, receipt: AccountProjectReceipt, expectedRevision: number | null) => Promise<void>;
};

const PARALLEL_REQUESTS = 6;   // (a browser sends at most 6 requests to one address at a time)
const TRIES = 4;

// An error that trying again cannot fix (the account said no): everything else (no network, a busy server) is retried.
export class AccountProjectRefused extends Error {}

const retrying = async <T>(work: () => Promise<T>, wait: (ms: number) => Promise<void>): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try { return await work(); }
    catch (error) {
      if (error instanceof AccountProjectRefused || attempt >= TRIES) throw error;
      await wait(500 * 2 ** (attempt - 1));
    }
  }
};

// Runs `work` over the items a few at a time; the first failure stops the rest.
const each = async <T>(items: readonly T[], work: (item: T) => Promise<void>) => {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL_REQUESTS, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
};

const headOf = (ownerId: string, manifest: AccountProjectManifest, expectedRevision: number | null, state: LocalProjectHead["state"]): LocalProjectHead => {
  const project = manifest.version.encodedProject as Pick<UnifiedAnimationProjectV2, "title" | "updatedAt" | "provenance">;
  return {
    ownerId, projectId: manifest.version.projectId, state, expectedRevision,
    revision: manifest.version.revision, projectDigest: manifest.version.projectDigest,
    title: project.title, updatedAt: project.updatedAt, provenance: project.provenance, assetIds: manifest.version.assetIds,
  };
};

// 1. STAGE: the project, picture by picture, into the browser's store. Returns what is now safely held there.
export const stageAccountProject = async (store: AccountProjectLocalStore, ownerId: string, candidate: UnifiedAnimationProjectV2,
  expectedRevision: number | null): Promise<LocalProject> => {
  await assertStructuredSymbolDigestsV2(assertUnifiedAnimationProjectV2(candidate).document.catalogs.symbols);
  const held = await store.assetEntries();
  const entries = new Map<string, AccountProjectAssetEntry>();
  const prepared = await prepareUnifiedProjectStorageV2(candidate, {}, undefined, async (asset, read) => {
    const known = held.get(asset.assetId);
    if (known && known.byteLength === asset.byteLength && known.encoding === asset.encoding) { entries.set(asset.assetId, known); return; }
    const raw = read();
    const { bytes, ...entry } = await compressUnifiedAssetV2({ ...asset, bytes: raw });
    // (`raw` is only lent for this call: a picture that is stored as it is gets its own copy)
    await store.putAsset({ ...entry, bytes: bytes === raw ? raw.slice() : bytes });
    entries.set(asset.assetId, entry);
  });
  const assets = prepared.version.assetIds.map(assetId => entries.get(assetId)!);
  const version = { ...prepared.version, storedByteLength: assets.reduce((total, asset) => total + storedAssetByteLength(asset), prepared.version.metadataByteLength) };
  const project = { head: headOf(ownerId, { version, assets }, expectedRevision, "pending"), manifest: packAccountProjectManifest({ version, assets }) };
  await store.putProject(project);
  return project;
};

// 2. PUSH: what the browser holds, to the account. Sends only the pictures the account does not have yet.
export const pushAccountProject = async (store: AccountProjectLocalStore, transport: AccountProjectTransport, project: LocalProject,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) => {
  const manifest = await unpackAccountProjectManifest(project.manifest);
  if (!manifest) throw new Error("bundle_invalid");
  const { projectId } = project.head;
  const send = async (assetIds: readonly string[]) => each(assetIds, async assetId => {
    const asset = await store.getAsset(assetId);
    if (!asset) throw new Error("account_project_not_saved");   // (the browser lost this picture: the next save packs it again)
    await retrying(() => transport.putAsset(projectId, asset), wait);
  });
  await send(await retrying(() => transport.missing(projectId, manifest.assets), wait));
  await transport.commit(project.manifest, project.head, project.head.expectedRevision);
  await store.putProject({ head: { ...project.head, state: "saved" }, manifest: project.manifest });
};

// (Nov 15, live: the Mac ran out of memory in the middle of a save; 27 of its 502 pictures never reached the browser's store, and
// the project answered "couldn't be opened" in that browser for good) Does the browser still hold EVERY picture of this save?
// A save it no longer holds whole can never be finished from here.
export const holdsLocalAccountProject = async (store: AccountProjectLocalStore, project: LocalProject) => {
  const held = await store.assetEntries();
  return project.head.assetIds.every(assetId => held.has(assetId));
};

// OPEN: a project description + its pictures, each from the browser's store when it is there, from the account otherwise
// (and then kept in the store). Every picture's fingerprint is checked while the project is put together.
export const openAccountProjectManifest = async (store: AccountProjectLocalStore, transport: AccountProjectTransport, ownerId: string,
  manifestBytes: Uint8Array, manifest: AccountProjectManifest, wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) => {
  const { projectId } = manifest.version;
  const load = async (useStore: boolean) => {
    const assets: UnifiedEncodedAssetV2[] = new Array(manifest.assets.length);
    await each(manifest.assets.map((entry, index) => ({ entry, index })), async ({ entry, index }) => {
      const held = useStore ? await store.getAsset(entry.assetId).catch(() => null) : null;
      if (held && storedAssetByteLength(held) === storedAssetByteLength(entry) && held.compression === entry.compression) { assets[index] = held; return; }
      const asset = { ...entry, bytes: await retrying(() => transport.getAsset(projectId, entry), wait) };
      assets[index] = asset;
      await store.putAsset(asset).catch(() => undefined);
    });
    return hydrateUnifiedProjectStorageV2(manifest.version, assets);
  };
  // A picture damaged in the browser's store is taken from the account again.
  const project = await load(true).catch(error => error instanceof Error && /^(asset_|decode_failed|version_mismatch)/.test(error.message) ? load(false) : Promise.reject(error));
  await store.putProject({ head: headOf(ownerId, manifest, null, "saved"), manifest: manifestBytes }).catch(() => undefined);
  return project;
};

// POSTER: the project with only its first `cells` frames' pictures; every later frame picture is a clear 1 x 1 stand-in
// and the frames' small preview pictures are left out. The home screen and the project list show ONE frame of a
// project: opening all 600 pictures of an animation for that (5 GB) is what froze and crashed them. `complete` = no
// picture had to be left out. `projectDigest` is the whole project's fingerprint (the description's own).
const CLEAR_PIXEL = new Uint8Array(4);
const sha256Hex = async (bytes: Uint8Array) =>
  [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(byte => byte.toString(16).padStart(2, "0")).join("");
type Encoded = Record<string, unknown>;
const isEncoded = (value: unknown): value is Encoded => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const openAccountProjectPoster = async (store: AccountProjectLocalStore, transport: AccountProjectTransport, manifest: AccountProjectManifest, cells: number,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) => {
  const clear: UnifiedEncodedAssetV2 = await sha256Hex(CLEAR_PIXEL).then(sha256 => ({ assetId: `sha256:${sha256}`, sha256, byteLength: 4, encoding: "typed-array", bytes: CLEAR_PIXEL }));
  const encoded = structuredClone(manifest.version.encodedProject) as Encoded;
  let complete = true;
  const standIn = (holder: Encoded, key: string) => {
    const bitmap = holder[key];
    if (!isEncoded(bitmap)) return;
    complete = false;
    holder[key] = { width: 1, height: 1, data: { __unifiedAssetRef: clear.assetId, encoding: "typed-array", constructorName: "Uint8ClampedArray", byteLength: 4 },
      x: bitmap.x, y: bitmap.y, stageWidth: bitmap.stageWidth, stageHeight: bitmap.stageHeight };
  };
  for (const layer of list((encoded.document as Encoded | undefined)?.layers)) {
    list((layer as Encoded).cells).forEach((cell, index) => {
      if (index < cells) return;
      for (const item of list(((cell as Encoded).content as Encoded | null)?.items)) {
        if (!isEncoded(item) || item.kind !== "drawing-raster/v1") continue;
        standIn(item, "bitmap"); standIn(item, "tweenEndBitmap");
        if (isEncoded(item.motionTween)) standIn(item.motionTween, "spriteBitmap");
      }
    });
  }
  for (const layer of list(((encoded.compatibility as Encoded | undefined)?.drawingData as Encoded | undefined)?.layers)) {
    for (const frame of list((layer as Encoded).timelineFrames)) if (isEncoded(frame)) {
      if (isEncoded(frame.previewUrl)) frame.previewUrl = null;
      if (isEncoded(frame.tweenEndPreviewUrl)) frame.tweenEndPreviewUrl = null;
    }
  }
  const needed = new Set<string>();
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (isEncoded(value)) { if (typeof value.__unifiedAssetRef === "string") needed.add(value.__unifiedAssetRef); else Object.values(value).forEach(collect); }
  };
  collect(encoded);
  const entries = manifest.assets.filter(entry => needed.has(entry.assetId) && entry.assetId !== clear.assetId);
  const assets: UnifiedEncodedAssetV2[] = new Array(entries.length);
  await each(entries.map((entry, index) => ({ entry, index })), async ({ entry, index }) => {
    const held = await store.getAsset(entry.assetId).catch(() => null);
    if (held && storedAssetByteLength(held) === storedAssetByteLength(entry) && held.compression === entry.compression) { assets[index] = held; return; }
    assets[index] = { ...entry, bytes: await retrying(() => transport.getAsset(manifest.version.projectId, entry), wait) };
    await store.putAsset(assets[index]).catch(() => undefined);
  });
  const project = await hydrateUnifiedProjectStorageV2({ ...manifest.version, encodedProject: encoded }, [...assets, clear], {}, true);
  return { project, projectDigest: manifest.version.projectDigest, complete };
};

// A project that was opened from a one-file bundle (v1 / v2) is kept in the browser's store too, as it was stored, so
// opening it again on this computer needs no download either.
export const keepOpenedAccountProject = async (store: AccountProjectLocalStore, ownerId: string, version: AccountProjectManifest["version"], assets: readonly UnifiedEncodedAssetV2[]) => {
  const held = await store.assetEntries();
  for (const asset of assets) if (!held.has(asset.assetId)) await store.putAsset(asset);
  const manifest = { version, assets: assets.map(asset => { const entry: Partial<UnifiedEncodedAssetV2> = { ...asset }; delete entry.bytes; return entry as AccountProjectAssetEntry; }) };
  await store.putProject({ head: headOf(ownerId, manifest, null, "saved"), manifest: packAccountProjectManifest(manifest) });
};

// The project as the browser holds it (for a version the account has confirmed or is about to): null when the browser
// does not hold all of it.
export const openLocalAccountProject = async (store: AccountProjectLocalStore, project: LocalProject) => {
  try {
    const manifest = await unpackAccountProjectManifest(project.manifest);
    if (!manifest) return null;
    const assets: UnifiedEncodedAssetV2[] = [];
    for (const entry of manifest.assets) {
      const held = await store.getAsset(entry.assetId);
      if (!held || held.compression !== entry.compression || storedAssetByteLength(held) !== storedAssetByteLength(entry)) return null;
      assets.push(held);
    }
    return await hydrateUnifiedProjectStorageV2(manifest.version, assets);
  } catch { return null; }
};
