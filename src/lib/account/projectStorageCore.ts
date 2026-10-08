// Account project storage (SPEC-0015 Phase 4, online beta 2026-10-08).
// The app server only handles small JSON (metadata). The browser uploads the
// gzipped project bundle straight to the private Supabase Storage bucket with
// short-lived signed upload URLs, and downloads it with short-lived signed
// download URLs, so no request/response passes Vercel's ~4.5 MB body limit.
// Before a version is committed, the server downloads the uploaded parts itself
// and checks size, SHA-256, gzip, the bundle format and the project identity.
// No "server-only" import here so node --test can run it with a mocked client;
// only projectServer.ts (server-only) wires it to the service-role client.
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unpackAccountProject } from "./projectBundle.ts";

const HEADS = "diamond_p4u_heads";
const VERSIONS = "diamond_p4u_versions";
export const ACCOUNT_PROJECT_BUCKET = "diamond-p4u-content";
export const ACCOUNT_PROJECT_PART_BYTES = 5 * 1024 * 1024;
export const ACCOUNT_PROJECT_MAX_PARTS = 32;
const MAX_BUNDLE_BYTES = 140_000_000;
const MAX_PROJECTS = 64;
// Signed download links only need to live long enough for the browser to start the read.
export const ACCOUNT_PROJECT_DOWNLOAD_URL_SECONDS = 300;
const gunzipAsync = promisify(gunzip);

// TODO(billing, not enforced yet): per-plan cloud storage quotas. No billing exists yet,
// so nothing reads this; when plans ship, prepareAccountProjectUpload should sum the
// owner's stored_byte_length (+ the new upload) and refuse with "storage_quota_reached".
export const ACCOUNT_STORAGE_QUOTA_BYTES_TODO = {
  trial: 200 * 1024 * 1024,
  starter: 1024 * 1024 * 1024,
  creator: 5 * 1024 * 1024 * 1024,
  studio: 20 * 1024 * 1024 * 1024,
} as const;

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
export type AccountProjectReceipt = {
  ownerId: string;
  projectId: string;
  revision: number;
  projectDigest: string;
  storedByteLength: number;
};
export type AccountProjectUploadInput = {
  projectId: string;
  revision: number;
  projectDigest: string;
  expectedRevision: number | null;
  bundleSha256: string;
  rawByteLength: number;
  compressedByteLength: number;
};
export type AccountProjectCommitInput = AccountProjectUploadInput & { attempt: string | null };
export type AccountProjectPrepareResult =
  | { status: "committed"; receipt: AccountProjectReceipt }
  | { status: "stored" }
  | { status: "upload"; attempt: string; partBytes: number; parts: Array<{ path: string; signedUrl: string }> };

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fail = (code: string): never => { throw new Error(code); };
const validOwner = (ownerId: string) => /^[a-zA-Z0-9_-]{1,256}$/.test(ownerId);
const validProject = (projectId: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(projectId);
const validDigest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const validAttempt = (value: unknown): value is string => typeof value === "string" && validProject(value);
const assertScope = (ownerId: string, projectId?: string) => {
  if (!validOwner(ownerId) || projectId !== undefined && !validProject(projectId)) fail("account_project_invalid_scope");
};
const partPath = (ownerId: string, projectId: string, revision: number, attempt: string, index: number) =>
  `${ownerId}/${projectId}/${revision}/${attempt}/${index}.gzpart`;

const intIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

/** Validates the JSON the browser sends for prepare/commit. Throws account_project_invalid_request. */
export const parseAccountProjectUploadBody = (body: unknown): { action: "prepare" | "commit"; input: AccountProjectCommitInput } => {
  const invalid = () => fail("account_project_invalid_request");
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid();
  const value = body as Record<string, unknown>;
  if (value.action !== "prepare" && value.action !== "commit") return invalid();
  if (typeof value.projectId !== "string" || !intIn(value.revision, 1, 9_999_999_999) ||
    !validDigest(value.projectDigest) || !validDigest(value.bundleSha256) ||
    !(value.expectedRevision === null || intIn(value.expectedRevision, 1, 9_999_999_999)) ||
    !intIn(value.rawByteLength, 5, MAX_BUNDLE_BYTES) || !intIn(value.compressedByteLength, 1, MAX_BUNDLE_BYTES)) return invalid();
  if (value.action === "commit" && !(value.attempt === null || validAttempt(value.attempt))) return invalid();
  return {
    action: value.action,
    input: {
      projectId: value.projectId, revision: value.revision as number, projectDigest: value.projectDigest as string,
      expectedRevision: value.expectedRevision as number | null, bundleSha256: value.bundleSha256 as string,
      rawByteLength: value.rawByteLength as number, compressedByteLength: value.compressedByteLength as number,
      attempt: value.action === "commit" ? value.attempt as string | null : null,
    },
  };
};

// options.partBytes exists only so tests can exercise multi-part bundles with small projects.
export const createAccountProjectStore = (db: () => SupabaseClient, options: { partBytes?: number } = {}) => {
  const bucket = () => db().storage.from(ACCOUNT_PROJECT_BUCKET);
  const partBytes = options.partBytes ?? ACCOUNT_PROJECT_PART_BYTES;
  const partCountFor = (compressedByteLength: number) => Math.ceil(compressedByteLength / partBytes);

  const readHeadRow = async (ownerId: string, projectId: string, includeDeleted = false): Promise<StoredHead | null> => {
    assertScope(ownerId, projectId);
    let query = db().from(HEADS).select("*").eq("owner_id", ownerId).eq("project_id", projectId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) fail("account_project_read_failed");
    return data as StoredHead | null;
  };

  const accountProjectHeadReceipt = async (ownerId: string, projectId: string): Promise<AccountProjectReceipt | null> => {
    const head = await readHeadRow(ownerId, projectId);
    return head ? {
      ownerId: head.owner_id,
      projectId: head.project_id,
      revision: head.active_revision,
      projectDigest: head.project_digest,
      storedByteLength: head.stored_byte_length,
    } : null;
  };

  const accountProjectBelongsToOwner = async (ownerId: string, projectId: string) =>
    Boolean(await readHeadRow(ownerId, projectId));

  const listAccountProjectHeads = async (ownerId: string) => {
    assertScope(ownerId);
    const { data, error } = await db().from(HEADS)
      .select("project_id,title,created_at,updated_at,active_revision,project_digest,stored_byte_length,provenance")
      .eq("owner_id", ownerId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(MAX_PROJECTS + 1);
    if (error) fail("account_project_read_failed");
    if ((data?.length ?? 0) > MAX_PROJECTS) fail("project_limit_reached");
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

  // Shape checks on a version row before any of its paths are trusted (read or signed).
  const assertVersionShape = (ownerId: string, version: StoredVersion, failure: string) => {
    if (!Array.isArray(version.part_paths) || version.part_paths.length < 1 || version.part_paths.length > ACCOUNT_PROJECT_MAX_PARTS ||
      !validDigest(version.bundle_sha256) || version.owner_id !== ownerId ||
      !Number.isSafeInteger(version.raw_byte_length) || version.raw_byte_length > MAX_BUNDLE_BYTES ||
      !Number.isSafeInteger(version.compressed_byte_length) || version.compressed_byte_length > MAX_BUNDLE_BYTES ||
      version.part_paths.length !== partCountFor(version.compressed_byte_length)) fail(failure);
    for (const path of version.part_paths) {
      if (typeof path !== "string" || !path.startsWith(`${ownerId}/${version.project_id}/`) || path.includes("..")) fail(failure);
    }
  };

  // Server-side proof that the stored parts are exactly the declared bundle.
  const readVerifiedBundle = async (ownerId: string, version: StoredVersion, failure = "account_project_readback_failed") => {
    assertVersionShape(ownerId, version, failure);
    const parts: Buffer[] = new Array(version.part_paths.length);
    for (let start = 0; start < version.part_paths.length; start += 4) {
      await Promise.all(version.part_paths.slice(start, start + 4).map(async (path, offset) => {
        const { data, error } = await bucket().download(path);
        if (error || !data) fail(failure);
        const bytes = Buffer.from(await data!.arrayBuffer());
        if (bytes.byteLength < 1 || bytes.byteLength > partBytes) fail(failure);
        parts[start + offset] = bytes;
      }));
    }
    const compressed = Buffer.concat(parts);
    if (compressed.byteLength !== version.compressed_byte_length || digest(compressed) !== version.bundle_sha256) fail(failure);
    let raw: Buffer;
    try { raw = await gunzipAsync(compressed, { maxOutputLength: MAX_BUNDLE_BYTES }); }
    catch { return fail(failure); }
    if (raw.byteLength !== version.raw_byte_length) fail(failure);
    let unpacked: Awaited<ReturnType<typeof unpackAccountProject>>;
    try { unpacked = await unpackAccountProject(raw); }
    catch { return fail(failure); }
    if (unpacked.version.projectId !== version.project_id || unpacked.version.revision !== version.revision ||
      unpacked.version.projectDigest !== version.project_digest) fail(failure);
    return unpacked;
  };

  /** Signed download links for the active version. The browser re-checks size + SHA-256. */
  const accountProjectDownload = async (ownerId: string, projectId: string) => {
    const head = await readHeadRow(ownerId, projectId);
    if (!head) return fail("account_project_not_found");
    const version = await readVersionRow(ownerId, projectId, head.active_revision, head.project_digest);
    if (!version) return fail("account_project_readback_failed");
    assertVersionShape(ownerId, version, "account_project_readback_failed");
    const { data, error } = await bucket().createSignedUrls(version.part_paths, ACCOUNT_PROJECT_DOWNLOAD_URL_SECONDS);
    if (error || !Array.isArray(data) || data.length !== version.part_paths.length) return fail("account_project_read_failed");
    const parts = version.part_paths.map((path, index) => {
      const signed = data[index];
      if (!signed || signed.error || signed.path !== path || typeof signed.signedUrl !== "string") fail("account_project_read_failed");
      return signed.signedUrl as string;
    });
    return {
      receipt: {
        ownerId, projectId, revision: head.active_revision,
        projectDigest: head.project_digest, storedByteLength: head.stored_byte_length,
      } satisfies AccountProjectReceipt,
      download: {
        parts, partBytes, bundleSha256: version.bundle_sha256,
        compressedByteLength: version.compressed_byte_length, rawByteLength: version.raw_byte_length,
      },
    };
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
    return receipt!;
  };

  // Owner, revision, deleted and project-limit checks shared by prepare and commit.
  // Returns the head row, or a receipt when this exact version is already the head.
  const checkWritable = async (ownerId: string, input: AccountProjectUploadInput) => {
    assertScope(ownerId, input.projectId);
    if (input.revision !== (input.expectedRevision ?? 0) + 1) fail("stale_revision");
    if (partCountFor(input.compressedByteLength) > ACCOUNT_PROJECT_MAX_PARTS) fail("project_too_large");
    const prior = await readHeadRow(ownerId, input.projectId, true);
    if (prior && prior.deleted_at) fail("account_project_deleted");
    if (prior?.active_revision === input.revision && prior.project_digest === input.projectDigest) {
      return { prior, receipt: await accountProjectHeadReceipt(ownerId, input.projectId) };
    }
    if (input.expectedRevision === null ? Boolean(prior) : !prior || prior.active_revision !== input.expectedRevision) fail("stale_revision");
    if (!prior && (await listAccountProjectHeads(ownerId)).length >= MAX_PROJECTS) fail("project_limit_reached");
    return { prior, receipt: null };
  };

  /** Step 1: check the owner may write this version, then hand out signed upload links. */
  const prepareAccountProjectUpload = async (ownerId: string, input: AccountProjectUploadInput): Promise<AccountProjectPrepareResult> => {
    const { receipt } = await checkWritable(ownerId, input);
    if (receipt) return { status: "committed", receipt };
    if (await readVersionRow(ownerId, input.projectId, input.revision, input.projectDigest)) return { status: "stored" };
    const attempt = randomUUID();
    const count = partCountFor(input.compressedByteLength);
    const parts = await Promise.all(Array.from({ length: count }, async (_, index) => {
      const path = partPath(ownerId, input.projectId, input.revision, attempt, index);
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data || typeof data.signedUrl !== "string") fail("account_project_upload_failed");
      return { path, signedUrl: data!.signedUrl };
    }));
    return { status: "upload", attempt, partBytes, parts };
  };

  /** Step 2: after the browser uploaded, verify the parts on the server, then commit version + head. */
  const commitAccountProjectUpload = async (ownerId: string, input: AccountProjectCommitInput) => {
    const { prior, receipt } = await checkWritable(ownerId, input);
    if (receipt) return receipt;
    let stored = await readVersionRow(ownerId, input.projectId, input.revision, input.projectDigest);
    let unpacked: Awaited<ReturnType<typeof readVerifiedBundle>>;
    if (stored) {
      unpacked = await readVerifiedBundle(ownerId, stored);
    } else {
      if (!validAttempt(input.attempt)) return fail("account_project_invalid_request");
      const count = partCountFor(input.compressedByteLength);
      stored = {
        project_id: input.projectId, owner_id: ownerId, revision: input.revision,
        project_digest: input.projectDigest, bundle_sha256: input.bundleSha256,
        raw_byte_length: input.rawByteLength, compressed_byte_length: input.compressedByteLength,
        part_paths: Array.from({ length: count }, (_, index) => partPath(ownerId, input.projectId, input.revision, input.attempt!, index)),
      };
      try {
        unpacked = await readVerifiedBundle(ownerId, stored, "account_project_upload_invalid");
        if (unpacked.project.provenance?.kind === "legacy-adoption") fail("account_project_import_forbidden");
      } catch (error) {
        // Best effort: do not keep parts that will never be committed.
        await bucket().remove(stored.part_paths).catch(() => undefined);
        throw error;
      }
      const { error } = await db().from(VERSIONS).insert(stored);
      if (error && !await readVersionRow(ownerId, input.projectId, input.revision, input.projectDigest)) fail("account_project_write_failed");
    }
    const { project, version } = unpacked;
    if (project.provenance?.kind === "legacy-adoption") fail("account_project_import_forbidden");
    return publishHead(ownerId, project, version.projectDigest, version.storedByteLength, input.expectedRevision, prior);
  };

  const deleteAccountProject = async (ownerId: string, projectId: string, expectedRevision: number, expectedDigest: string) => {
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

  return {
    accountProjectHeadReceipt, accountProjectBelongsToOwner, listAccountProjectHeads,
    accountProjectDownload, prepareAccountProjectUpload, commitAccountProjectUpload, deleteAccountProject,
  };
};

/** HTTP status for an error code thrown above (shared by both project routes). */
export const accountProjectErrorStatus = (code: string) =>
  code === "account_project_not_found" ? 404 :
  code === "stale_revision" ? 409 :
  code === "account_project_import_forbidden" ? 403 :
  code === "project_too_large" ? 413 :
  code === "account_project_upload_invalid" ? 422 :
  code === "bundle_invalid" || code === "account_project_invalid_scope" || code === "account_project_invalid_request" ? 400 : 503;
