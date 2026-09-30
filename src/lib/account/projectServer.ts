import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import { getSupabaseAdminClient } from "../dbAdmin";
import { unpackAccountProject } from "./projectBundle";

const HEADS = "diamond_p4u_heads";
const VERSIONS = "diamond_p4u_versions";
const BUCKET = "diamond-p4u-content";
export const ACCOUNT_PROJECT_PART_BYTES = 5 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 140_000_000;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

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
  const unpacked = await unpackAccountProject(raw);
  if (unpacked.version.projectId !== version.project_id || unpacked.version.revision !== version.revision ||
    unpacked.version.projectDigest !== version.project_digest) fail("account_project_readback_failed");
  return raw;
};

export const readAccountProjectBundle = async (ownerId: string, projectId: string) => {
  const head = await readHeadRow(ownerId, projectId);
  if (!head) throw new Error("account_project_not_found");
  const version = await readVersionRow(ownerId, projectId, head.active_revision, head.project_digest);
  if (!version) throw new Error("account_project_readback_failed");
  return readVerifiedBundle(ownerId, version);
};

const publishHead = async (ownerId: string, project: Awaited<ReturnType<typeof unpackAccountProject>>["project"],
  projectDigest: string, storedByteLength: number, expectedRevision: number | null, prior: StoredHead | null) => {
  const row = {
    owner_id: ownerId, project_id: project.projectId, title: project.title,
    created_at: project.createdAt, updated_at: project.updatedAt,
    active_revision: project.revision, project_digest: projectDigest,
    stored_byte_length: storedByteLength, provenance: project.provenance ?? null,
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
  const { project, version } = await unpackAccountProject(raw);
  assertScope(ownerId, project.projectId);
  if (project.provenance?.kind === "legacy-adoption") fail("account_project_import_forbidden");
  if (project.revision !== (expectedRevision ?? 0) + 1) fail("stale_revision");
  const prior = await readHeadRow(ownerId, project.projectId, true);
  if (prior && prior.deleted_at) fail("account_project_deleted");
  if (prior?.active_revision === project.revision && prior.project_digest === version.projectDigest) {
    return accountProjectHeadReceipt(ownerId, project.projectId);
  }
  if (expectedRevision === null ? Boolean(prior) : !prior || prior.active_revision !== expectedRevision) fail("stale_revision");
  if (!prior && (await listAccountProjectHeads(ownerId)).length >= 64) fail("project_limit_reached");

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
  return publishHead(ownerId, project, version.projectDigest, version.storedByteLength, expectedRevision, prior);
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
  return { projectId, deletedAssetIds: [] as string[] };
};
