import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { gzip, gunzip, inflate } from "node:zlib";
import { getSupabaseAdminClient } from "../dbAdmin";
import { accountProjectAssetEntry, readAccountProjectIdentity, unpackAccountProject, unpackAccountProjectManifest, type AccountProjectAssetEntry } from "./projectBundle";
import { purgeOlderSaves, purgeProjectFolder, type PurgeBucket } from "./projectFilePurge";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { v1EngineConfig } from "../ai/v1Animator/v1EngineCli";

const HEADS = "diamond_p4u_heads";
const VERSIONS = "diamond_p4u_versions";
const BUCKET = "diamond-p4u-content";
export const ACCOUNT_PROJECT_PART_BYTES = 5 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 140_000_000;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
// (Nov 14, picture-by-picture saving) A long animation's pictures are saved one by one, once each, under
// <owner>/<project>/assets/<fingerprint>.<raw|deflate>; the saved version is then only the project description (bundle v3).
const ASSET_STORED_BYTES_LIMIT = 45_000_000;          // one picture, as stored
const ASSET_OPENED_BYTES_LIMIT = 134_217_728;         // one picture, unpacked (the whole drawing world is about 70 MB)
const PROJECT_STORED_BYTES_LIMIT = 1_073_741_824;     // one project's description + pictures, as stored
// The heads table still checks stored_byte_length <= 140,000,000 (migration 20260929124642): a larger project is
// written as that ceiling until the check is widened.
const HEAD_STORED_BYTES_CEILING = 140_000_000;

type StoredHead = {
  project_id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  active_revision: number;
  project_digest: string;
  stored_byte_length: number;
  provenance: unknown;
  deleted_at: string | null;
};
type StoredVersion = {
  project_id: string;
  owner_id: string;
  revision: number;
  project_digest: string;
  bundle_sha256: string;
  raw_byte_length: number;
  compressed_byte_length: number;
  part_paths: string[];
};

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fail = (code: string): never => { throw new Error(code); };
// (Nov 20, Arthur: his project "said unavailable" - every save of it was refused 413 account_storage_full while he tested long animations in
// the app copy) the app copy may set its own per-account limit (DIAMOND_OWNER_BYTES_LIMIT, bytes); the product default stays 2 GiB
const OWNER_PROJECT_BYTES_LIMIT = Number(process.env.DIAMOND_OWNER_BYTES_LIMIT) > 0 ? Number(process.env.DIAMOND_OWNER_BYTES_LIMIT) : 2 * 1024 * 1024 * 1024;
const validOwner = (ownerId: string) => /^[a-zA-Z0-9_-]{1,256}$/.test(ownerId);
const validProject = (projectId: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(projectId);
const validDigest = (value: string) => /^[0-9a-f]{64}$/.test(value);
const assertScope = (ownerId: string, projectId?: string) => {
  if (!validOwner(ownerId) || projectId && !validProject(projectId)) fail("account_project_invalid_scope");
};
const db = () => getSupabaseAdminClient();

const readHeadRow = async (ownerId: string, projectId: string, includeDeleted = false): Promise<StoredHead | null> => {
  assertScope(ownerId, projectId);
  let query = db().from(HEADS).select("*").eq("owner_id", ownerId).eq("project_id", projectId);
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) fail("account_project_read_failed");
  return data as StoredHead | null;
};

export const accountProjectHeadReceipt = async (ownerId: string, projectId: string) => {
  const head = await readHeadRow(ownerId, projectId);
  return head ? {
    ownerId: head.owner_id,
    projectId: head.project_id,
    revision: head.active_revision,
    projectDigest: head.project_digest,
    storedByteLength: head.stored_byte_length,
  } : null;
};

export const accountProjectBelongsToOwner = async (ownerId: string, projectId: string) =>
  Boolean(await readHeadRow(ownerId, projectId));

export const listAccountProjectHeads = async (ownerId: string) => {
  assertScope(ownerId);
  const { data, error } = await db().from(HEADS)
    .select("project_id,title,created_at,updated_at,active_revision,project_digest,stored_byte_length,provenance")
    .eq("owner_id", ownerId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(65);
  if (error) fail("account_project_read_failed");
  if ((data?.length ?? 0) > 64) fail("project_limit_reached");
  return (data ?? []).map(row => ({
    projectId: row.project_id as string,
    title: row.title as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    activeRevision: row.active_revision as number,
    projectDigest: row.project_digest as string,
    storedByteLength: row.stored_byte_length as number,
    provenance: row.provenance,
  }));
};

const readVersionRow = async (ownerId: string, projectId: string, revision: number, projectDigest: string): Promise<StoredVersion | null> => {
  const { data, error } = await db().from(VERSIONS).select("*")
    .eq("owner_id", ownerId).eq("project_id", projectId).eq("revision", revision)
    .eq("project_digest", projectDigest).maybeSingle();
  if (error) fail("account_project_read_failed");
  return data as StoredVersion | null;
};

type SavedProject = Pick<Awaited<ReturnType<typeof unpackAccountProject>>["project"], "projectId" | "revision" | "title" | "createdAt" | "updatedAt" | "provenance">;

// A bundle of either kind, opened as far as the server needs: a one-file bundle (v1 / v2) is opened whole, exactly as
// before; a project description (v3) is checked against itself and names its pictures (`assets`).
const openBundle = async (raw: Uint8Array) => {
  const manifest = await unpackAccountProjectManifest(raw);
  if (!manifest) return { ...(await unpackAccountProject(raw)) as { project: SavedProject; version: StoredProjectVersion }, assets: null };
  const project = manifest.version.encodedProject as SavedProject;
  const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (typeof project.title !== "string" || Buffer.byteLength(project.title) < 1 || Buffer.byteLength(project.title) > 512 ||
    !validDate(project.createdAt) || !validDate(project.updatedAt) || project.revision < 1) fail("bundle_invalid");
  return { project, version: manifest.version, assets: manifest.assets };
};
type StoredProjectVersion = Awaited<ReturnType<typeof unpackAccountProject>>["version"];

const assetFolder = (ownerId: string, projectId: string) => `${ownerId}/${projectId}/assets`;
export const accountProjectAssetName = (asset: Pick<AccountProjectAssetEntry, "sha256" | "compression">) => `${asset.sha256}.${asset.compression ?? "raw"}`;
const validAssetName = (name: string) => /^[0-9a-f]{64}\.(raw|deflate)$/.test(name);
const storedLength = (asset: AccountProjectAssetEntry) => asset.compressedByteLength ?? asset.byteLength;

// Every picture stored for one project: name -> stored bytes.
const listStoredAssets = async (ownerId: string, projectId: string) => {
  assertScope(ownerId, projectId);
  const stored = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db().storage.from(BUCKET).list(assetFolder(ownerId, projectId), { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) throw new Error("account_project_read_failed");
    for (const item of data) stored.set(item.name, Number((item.metadata as { size?: unknown } | null)?.size ?? -1));
    if (data.length < 1000) return stored;
  }
};

// Which of these pictures the account does not hold yet (by fingerprint and stored size).
export const missingAccountProjectAssets = async (ownerId: string, projectId: string, entries: readonly unknown[]) => {
  if (entries.length > 100_000) fail("bundle_invalid");
  const assets = entries.map(entry => accountProjectAssetEntry(entry));
  const stored = await listStoredAssets(ownerId, projectId);
  return assets.filter(asset => stored.get(accountProjectAssetName(asset)) !== storedLength(asset)).map(asset => asset.assetId);
};

// At most 2 GiB of pictures an hour for one account (an account holds 2 GiB in all): pictures sent without ever
// saving a project cannot fill the storage.
const HOUR_MS = 3_600_000;
const uploadedThisHour = new Map<string, { since: number; bytes: number }>();
const countUpload = (ownerId: string, bytes: number) => {
  const now = Date.now();
  const entry = uploadedThisHour.get(ownerId);
  const current = entry && now - entry.since < HOUR_MS ? entry : { since: now, bytes: 0 };
  if (current.bytes + bytes > OWNER_PROJECT_BYTES_LIMIT) fail("account_storage_full");
  current.bytes += bytes;
  uploadedThisHour.set(ownerId, current);
};

// Saves ONE picture. It is stored only when its bytes really are what its name (its fingerprint) says.
export const saveAccountProjectAsset = async (ownerId: string, projectId: string, entry: unknown, bytes: Uint8Array) => {
  assertScope(ownerId, projectId);
  const asset = accountProjectAssetEntry(entry);
  if (bytes.byteLength > ASSET_STORED_BYTES_LIMIT || asset.byteLength > ASSET_OPENED_BYTES_LIMIT) fail("project_too_large");
  if (bytes.byteLength !== storedLength(asset)) fail("bundle_invalid");
  let opened: Uint8Array = bytes;
  if (asset.compression) {
    try { opened = await inflateAsync(bytes, { maxOutputLength: Math.max(1, asset.byteLength) }); }
    catch { fail("bundle_invalid"); }
  }
  if (opened.byteLength !== asset.byteLength || digest(opened) !== asset.sha256) fail("bundle_invalid");
  countUpload(ownerId, bytes.byteLength);
  const { error } = await db().storage.from(BUCKET).upload(`${assetFolder(ownerId, projectId)}/${accountProjectAssetName(asset)}`, Buffer.from(bytes), {
    contentType: "application/octet-stream", upsert: true,
  });
  if (error) fail("account_project_upload_failed");
};

// Reads ONE picture as it is stored (the app checks its fingerprint when it opens the project).
export const readAccountProjectAsset = async (ownerId: string, projectId: string, name: string) => {
  assertScope(ownerId, projectId);
  if (!validAssetName(name)) fail("account_project_invalid_scope");
  const { data, error } = await db().storage.from(BUCKET).download(`${assetFolder(ownerId, projectId)}/${name}`);
  if (error || !data) throw new Error("account_project_not_found");
  return new Uint8Array(await data.arrayBuffer());
};

const readVerifiedBundle = async (ownerId: string, version: StoredVersion) => {
  if (!Array.isArray(version.part_paths) || version.part_paths.length < 1 || version.part_paths.length > 32 ||
    !validDigest(version.bundle_sha256) || version.owner_id !== ownerId ||
    !Number.isSafeInteger(version.raw_byte_length) || version.raw_byte_length > MAX_BUNDLE_BYTES ||
    !Number.isSafeInteger(version.compressed_byte_length) || version.compressed_byte_length > MAX_BUNDLE_BYTES) fail("account_project_readback_failed");
  const parts: Buffer[] = [];
  for (const path of version.part_paths) {
    if (typeof path !== "string" || !path.startsWith(`${ownerId}/${version.project_id}/`) || path.includes("..")) fail("account_project_readback_failed");
    const { data, error } = await db().storage.from(BUCKET).download(path);
    if (error || !data) throw new Error("account_project_readback_failed");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > ACCOUNT_PROJECT_PART_BYTES) fail("account_project_readback_failed");
    parts.push(bytes);
  }
  const compressed = Buffer.concat(parts);
  if (compressed.byteLength !== version.compressed_byte_length || digest(compressed) !== version.bundle_sha256) fail("account_project_readback_failed");
  let raw: Buffer;
  try { raw = await gunzipAsync(compressed, { maxOutputLength: MAX_BUNDLE_BYTES }); }
  catch { throw new Error("account_project_readback_failed"); }
  if (raw.byteLength !== version.raw_byte_length) fail("account_project_readback_failed");
  // (Nov 14) These are, byte for byte (bundle_sha256), the bytes that were opened whole and checked when they were saved.
  // Opening every picture again on each read (1 GB for an AI animation) is what made opening take a minute and ran the
  // server out of memory; the header says which version this is, and the app checks every picture when it opens it.
  const identity = readAccountProjectIdentity(raw);
  if (identity.projectId !== version.project_id || identity.revision !== version.revision ||
    identity.projectDigest !== version.project_digest) fail("account_project_readback_failed");
  return raw;
};

// (Nov 14) For a project's poster: its saved bundle only when that is small (a long project's description, or a small
// project whole). null = a big one-file bundle (saved before Nov 14): nothing is downloaded for it here.
export const readAccountProjectDescription = async (ownerId: string, projectId: string) => {
  const head = await readHeadRow(ownerId, projectId);
  if (!head) throw new Error("account_project_not_found");
  const version = await readVersionRow(ownerId, projectId, head.active_revision, head.project_digest);
  if (!version) throw new Error("account_project_readback_failed");
  return version.raw_byte_length > 16_000_004 ? null : readVerifiedBundle(ownerId, version);
};

export const readAccountProjectBundle = async (ownerId: string, projectId: string) => {
  const head = await readHeadRow(ownerId, projectId);
  if (!head) throw new Error("account_project_not_found");
  const version = await readVersionRow(ownerId, projectId, head.active_revision, head.project_digest);
  if (!version) throw new Error("account_project_readback_failed");
  return readVerifiedBundle(ownerId, version);
};

const publishHead = async (ownerId: string, project: SavedProject,
  projectDigest: string, storedByteLength: number, expectedRevision: number | null, prior: StoredHead | null) => {
  const row = {
    owner_id: ownerId, project_id: project.projectId, title: project.title,
    created_at: project.createdAt, updated_at: project.updatedAt,
    active_revision: project.revision, project_digest: projectDigest,
    stored_byte_length: Math.min(storedByteLength, HEAD_STORED_BYTES_CEILING), provenance: project.provenance ?? null,
    deleted_at: null,
  };
  if (expectedRevision === null) {
    const { error } = await db().from(HEADS).insert(row);
    if (error) fail("stale_revision");
  } else {
    if (!prior || prior.active_revision !== expectedRevision) throw new Error("stale_revision");
    const { data, error } = await db().from(HEADS).update(row)
      .eq("owner_id", ownerId).eq("project_id", project.projectId)
      .eq("active_revision", expectedRevision).eq("project_digest", prior.project_digest)
      .is("deleted_at", null).select("project_id").maybeSingle();
    if (error) fail("account_project_write_failed");
    if (!data) fail("stale_revision");
  }
  const receipt = await accountProjectHeadReceipt(ownerId, project.projectId);
  if (!receipt || receipt.revision !== project.revision || receipt.projectDigest !== projectDigest) fail("account_project_readback_failed");
  return receipt;
};

export const saveAccountProjectBundle = async (ownerId: string, raw: Uint8Array, expectedRevision: number | null) => {
  assertScope(ownerId);
  if (raw.byteLength < 5 || raw.byteLength > MAX_BUNDLE_BYTES) fail("project_too_large");
  const { project, version, assets } = await openBundle(raw);
  assertScope(ownerId, project.projectId);
  if (project.provenance?.kind === "legacy-adoption") fail("account_project_import_forbidden");
  if (project.revision !== (expectedRevision ?? 0) + 1) fail("stale_revision");
  const prior = await readHeadRow(ownerId, project.projectId, true);
  if (prior && prior.deleted_at) fail("account_project_deleted");
  if (prior?.active_revision === project.revision && prior.project_digest === version.projectDigest) {
    return accountProjectHeadReceipt(ownerId, project.projectId);
  }
  if (expectedRevision === null ? Boolean(prior) : !prior || prior.active_revision !== expectedRevision) fail("stale_revision");
  const heads = await listAccountProjectHeads(ownerId);
  if (!prior && heads.length >= 64) fail("project_limit_reached");
  // (Nov 12 security) 2 GB of saved projects per account: the other projects' stored bytes plus this bundle (uncompressed, so never too lenient)
  // (Nov 14) a project description (v3) counts with its pictures: what the project really stores
  const projectBytes = assets ? version.storedByteLength : raw.byteLength;
  if (assets && !(projectBytes <= PROJECT_STORED_BYTES_LIMIT)) fail("project_too_large");
  if (heads.reduce((sum, head) => sum + (head.projectId === project.projectId ? 0 : head.storedByteLength), 0) + projectBytes > OWNER_PROJECT_BYTES_LIMIT) fail("account_storage_full");
  let storedPictures: string[] | null = null;
  if (assets) {
    // The description is saved only when the account really holds every picture it names.
    const stored = await listStoredAssets(ownerId, project.projectId);
    if (assets.some(asset => stored.get(accountProjectAssetName(asset)) !== storedLength(asset))) fail("account_project_pictures_missing");
    storedPictures = [...stored.keys()];
  }

  let stored = await readVersionRow(ownerId, project.projectId, project.revision, version.projectDigest);
  if (stored) {
    await readVerifiedBundle(ownerId, stored);
  } else {
    const compressed = await gzipAsync(raw, { level: 1 });
    if (compressed.byteLength > MAX_BUNDLE_BYTES) fail("project_too_large");
    const attempt = randomUUID();
    const paths: string[] = [];
    const pieces: Array<{ path: string; bytes: Buffer }> = [];
    for (let offset = 0, index = 0; offset < compressed.byteLength; offset += ACCOUNT_PROJECT_PART_BYTES, index += 1) {
      const path = `${ownerId}/${project.projectId}/${project.revision}/${attempt}/${index}.gzpart`;
      paths.push(path);
      pieces.push({ path, bytes: compressed.subarray(offset, offset + ACCOUNT_PROJECT_PART_BYTES) });
    }
    for (let start = 0; start < pieces.length; start += 4) {
      await Promise.all(pieces.slice(start, start + 4).map(async piece => {
        const { error } = await db().storage.from(BUCKET).upload(piece.path, piece.bytes, {
          contentType: "application/octet-stream", upsert: false,
        });
        if (error) fail("account_project_upload_failed");
      }));
    }
    stored = {
      project_id: project.projectId, owner_id: ownerId, revision: project.revision,
      project_digest: version.projectDigest, bundle_sha256: digest(compressed),
      raw_byte_length: raw.byteLength, compressed_byte_length: compressed.byteLength,
      part_paths: paths,
    };
    await readVerifiedBundle(ownerId, stored);
    const { error } = await db().from(VERSIONS).insert(stored);
    if (error) fail("account_project_write_failed");
  }
  const receipt = await publishHead(ownerId, project, version.projectDigest, version.storedByteLength, expectedRevision, prior);
  // (Nov 16) the save is done and answered for; now what only older saves of this project used is removed. It can never fail a save.
  await removeOlderSaveFiles(ownerId, project.projectId, project.revision, version.projectDigest, prior,
    assets ? assets.map(asset => accountProjectAssetName(asset)) : null, storedPictures).catch(() => undefined);
  return receipt;
};

// (Nov 16, Arthur: "it clears up some space") A project he keeps used to store every picture of every save it ever had. After a
// save: the pictures of this save and of the save before it stay; pictures only older saves used, and descriptions older than the
// save before, are removed (projectFilePurge.ts says how, and why nothing the project needs can go). The names the save before
// used are remembered from that save; after a server restart they are read from its stored description, and when that cannot be
// read no picture is removed this time.
const savedPictureNames = new Map<string, { revision: number; digest: string; names: string[] | null }>();
const OLDER_SAVES_MS = 4000;   // at most this long after a save; the rest goes at the next save
const removeOlderSaveFiles = async (ownerId: string, projectId: string, revision: number, projectDigest: string, prior: StoredHead | null,
  names: string[] | null, storedPictures: string[] | null) => {
  const key = `${ownerId}/${projectId}`, until = Date.now() + OLDER_SAVES_MS;
  const remembered = savedPictureNames.get(key);
  savedPictureNames.set(key, { revision, digest: projectDigest, names });
  let before: string[] | null | undefined;          // undefined = not known: no picture is removed
  if (!prior) before = [];
  else if (remembered && remembered.revision === prior.active_revision && remembered.digest === prior.project_digest) before = remembered.names;
  else {
    const version = await readVersionRow(ownerId, projectId, prior.active_revision, prior.project_digest).catch(() => null);
    if (version && version.raw_byte_length <= 16_000_004) {
      const manifest = await readVerifiedBundle(ownerId, version).then(raw => unpackAccountProjectManifest(raw)).catch(() => undefined);
      before = manifest === undefined ? undefined : manifest ? manifest.assets.map(asset => accountProjectAssetName(asset)) : null;
    }
  }
  // Pictures are only cleaned when this save AND the one before are both known picture-by-picture saves.
  const pictures = names && before ? storedPictures ?? [] : [];
  return purgeOlderSaves(purgeBucket(), key, {
    revision, keep: new Set([...(names ?? []), ...(before ?? [])]), storedPictures: pictures, until,
    stillCurrent: async () => { const head = await readHeadRow(ownerId, projectId); return Boolean(head && head.active_revision === revision && head.project_digest === projectDigest); },
  });
};

export const deleteAccountProject = async (ownerId: string, projectId: string, expectedRevision: number, expectedDigest: string) => {
  const head = await readHeadRow(ownerId, projectId);
  if (!head) throw new Error("account_project_not_found");
  if (head.active_revision !== expectedRevision || head.project_digest !== expectedDigest) fail("stale_revision");
  const { data, error } = await db().from(HEADS).update({ deleted_at: new Date().toISOString() })
    .eq("owner_id", ownerId).eq("project_id", projectId).eq("active_revision", expectedRevision)
    .eq("project_digest", expectedDigest).is("deleted_at", null).select("project_id").maybeSingle();
  if (error) fail("account_project_write_failed");
  if (!data) fail("stale_revision");
  // (Nov 16) the project is gone from the list at once; its stored files are removed right after, without making him wait.
  void removeDeletedAccountProjectFiles(ownerId).catch(() => undefined);
  return { projectId, deletedAssetIds: [] as string[] };
};

// (Nov 16, Arthur: "delete some projects, it clears up some space") Until today Delete only hid a project and every file it had
// stored stayed for good. Now the stored files of every DELETED project of this account are really removed: the one just deleted,
// and the ones deleted before today (so the space they still hold comes back too). A project is only ever named here when its own
// row says it is deleted, and that is asked again right before its files go. One sweep at a time for an account; a sweep that is
// cut short (the storage refuses, the server stops) loses nothing: the next Delete goes on where it stopped.
const purgeBucket = (): PurgeBucket => ({
  list: async (folder, offset, limit) => {
    const { data, error } = await db().storage.from(BUCKET).list(folder, { limit, offset, sortBy: { column: "name", order: "asc" } });
    return error || !data ? null : data.map(item => ({ name: item.name, id: item.id ?? null }));
  },
  remove: async paths => !(await db().storage.from(BUCKET).remove(paths)).error,
});
const sweeping = new Map<string, Promise<number>>();
const emptied = new Set<string>();   // deleted projects this server already found empty: not listed again on every Delete
export const removeDeletedAccountProjectFiles = (ownerId: string): Promise<number> => {
  assertScope(ownerId);
  const running = sweeping.get(ownerId);
  if (running) return running;
  const sweep = (async () => {
    const { data, error } = await db().from(HEADS).select("project_id").eq("owner_id", ownerId).not("deleted_at", "is", null).limit(1000);
    if (error) fail("account_project_read_failed");
    let removed = 0;
    for (const row of data ?? []) {
      const projectId = row.project_id as string;
      if (!validProject(projectId) || emptied.has(`${ownerId}/${projectId}`)) continue;
      removed += await purgeProjectFolder(purgeBucket(), `${ownerId}/${projectId}`,
        async () => Boolean((await readHeadRow(ownerId, projectId, true))?.deleted_at));
      // (Nov 20: 4.5 GB of the AI Animator's working pictures stayed on disk for projects deleted for good) its engine folder goes too
      try {
        const engine = v1EngineConfig();
        if (engine && (await readHeadRow(ownerId, projectId, true))?.deleted_at) rmSync(join(engine.outDir, projectId), { recursive: true, force: true });
      } catch { /* the stored files are gone either way; a folder left is retried on the next Delete */ }
      emptied.add(`${ownerId}/${projectId}`);
    }
    return removed;
  })().finally(() => sweeping.delete(ownerId));
  sweeping.set(ownerId, sweep);
  return sweep;
};

// SPEC-0020 Phase 1 (Delete my account): marks every project of one account as deleted, exactly like the
// library's own Delete does for one project. Called only from the account-deletion hook in auth.ts.
export const deleteAllAccountProjects = async (ownerId: string) => {
  assertScope(ownerId);
  const { error } = await db().from(HEADS).update({ deleted_at: new Date().toISOString() })
    .eq("owner_id", ownerId).is("deleted_at", null);
  if (error) fail("account_project_delete_failed");
};
