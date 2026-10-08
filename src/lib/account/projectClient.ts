"use client";

import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import { createUnifiedProjectRepositoryV2 } from "../animation/unifiedProjectRepositoryV2.ts";
import type { ProjectSourceReader } from "../animation/unifiedProjectSourceReader.ts";
import { packAccountProject, unpackAccountProject } from "./projectBundle.ts";

type Receipt = {
  ownerId: string;
  projectId: string;
  revision: number;
  projectDigest: string;
  storedByteLength: number;
};
type ListedHead = {
  projectId: string;
  title: string;
  updatedAt: string;
  activeRevision: number;
  projectDigest: string;
  provenance: UnifiedAnimationProjectV2["provenance"];
};

const failure = (code: string): never => { throw new Error(code); };
const isReceipt = (value: unknown): value is Receipt => {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<Receipt>;
  return typeof receipt.ownerId === "string" && typeof receipt.projectId === "string" &&
    Number.isSafeInteger(receipt.revision) && typeof receipt.projectDigest === "string" &&
    /^[0-9a-f]{64}$/.test(receipt.projectDigest) && Number.isSafeInteger(receipt.storedByteLength);
};
const sameReceipt = (value: unknown, ownerId: string, version: { projectId: string; revision: number; projectDigest: string }) =>
  isReceipt(value) && value.ownerId === ownerId && value.projectId === version.projectId &&
  value.revision === version.revision && value.projectDigest === version.projectDigest;

const boundedFetch = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { window.clearTimeout(timer); }
};

const ownerHeaders = (ownerId: string) => ({ "X-Account-Owner": ownerId });

const readHeadReceipt = async (ownerId: string, projectId: string): Promise<Receipt | null> => {
  const response = await boundedFetch(`/api/account/projects/${encodeURIComponent(projectId)}?head=1`, { headers: ownerHeaders(ownerId) }, 4_000);
  if (response.status === 404) return null;
  if (!response.ok) failure("account_project_read_failed");
  const body = await response.json() as { receipt?: unknown };
  return isReceipt(body.receipt) ? body.receipt : failure("account_project_read_failed");
};

// Project bundles go straight between the browser and the private Supabase Storage
// bucket through short-lived signed links (Vercel caps request/response bodies at
// ~4.5 MB). The app server only sees metadata and verifies uploaded parts itself.
const MAX_BUNDLE_BYTES = 140_000_000;
const MAX_PARTS = 32;
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (bytes: Uint8Array) => hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
const gzipBlob = async (body: Blob) =>
  new Uint8Array(await new Response(body.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const gunzipBounded = async (compressed: Uint8Array, expectedLength: number) => {
  const reader = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const out = new Uint8Array(expectedLength);
  let offset = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > expectedLength) {
      await reader.cancel().catch(() => undefined);
      failure("account_project_readback_failed");
    }
    out.set(value, offset);
    offset += value.byteLength;
  }
  if (offset !== expectedLength) failure("account_project_readback_failed");
  return out;
};
const isSignedStorageUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch { return false; }
};
const runLimited = async <T>(items: T[], limit: number, task: (item: T, index: number) => Promise<void>) => {
  for (let start = 0; start < items.length; start += limit) {
    await Promise.all(items.slice(start, start + limit).map((item, offset) => task(item, start + offset)));
  }
};

type UploadMetadata = {
  projectId: string; revision: number; projectDigest: string; expectedRevision: number | null;
  bundleSha256: string; rawByteLength: number; compressedByteLength: number;
};
type PrepareResult =
  | { status: "committed"; receipt: unknown }
  | { status: "stored" }
  | { status: "upload"; attempt: string; partBytes: number; parts: Array<{ path: string; signedUrl: string }> };

const postProjectMetadata = (ownerId: string, body: Record<string, unknown>, timeoutMs: number) =>
  boundedFetch("/api/account/projects", {
    method: "POST",
    headers: { ...ownerHeaders(ownerId), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);

const uploadParts = async (compressed: Uint8Array, prepared: Extract<PrepareResult, { status: "upload" }>) => {
  if (!Number.isSafeInteger(prepared.partBytes) || prepared.partBytes < 1 || !Array.isArray(prepared.parts) ||
    prepared.parts.length < 1 || prepared.parts.length > MAX_PARTS ||
    prepared.parts.length !== Math.ceil(compressed.byteLength / prepared.partBytes) ||
    !prepared.parts.every(part => part && isSignedStorageUrl(part.signedUrl))) failure("account_project_upload_failed");
  await runLimited(prepared.parts, 4, async (part, index) => {
    const bytes = compressed.subarray(index * prepared.partBytes, (index + 1) * prepared.partBytes);
    const response = await boundedFetch(part.signedUrl, {
      method: "PUT", credentials: "omit",
      headers: { "Content-Type": "application/octet-stream", "x-upsert": "false" },
      body: bytes as BodyInit,
    }, 120_000);
    if (!response.ok) failure("account_project_upload_failed");
  });
};

export const writeAccountProjectV2 = async (ownerId: string, candidate: UnifiedAnimationProjectV2, expectedRevision: number | null) => {
  const { body, version } = await packAccountProject(candidate);
  const expected = { projectId: version.projectId, revision: version.revision, projectDigest: version.projectDigest };
  const compressed = await gzipBlob(body);
  if (compressed.byteLength > MAX_BUNDLE_BYTES) failure("project_too_large");
  const metadata: UploadMetadata = {
    ...expected, expectedRevision, bundleSha256: await sha256Hex(compressed),
    rawByteLength: body.size, compressedByteLength: compressed.byteLength,
  };
  let response: Response | null = null;
  try {
    response = await postProjectMetadata(ownerId, { action: "prepare", ...metadata }, 15_000);
    if (response.ok) {
      const prepared = await response.json() as PrepareResult;
      if (prepared.status === "committed") {
        if (sameReceipt(prepared.receipt, ownerId, expected)) return candidate;
        failure("account_project_receipt_mismatch");
      }
      let attempt: string | null = null;
      if (prepared.status === "upload") {
        await uploadParts(compressed, prepared);
        attempt = prepared.attempt;
      } else if (prepared.status !== "stored") failure("account_project_upload_failed");
      response = await postProjectMetadata(ownerId, { action: "commit", ...metadata, attempt }, 120_000);
      if (response.ok) {
        const payload = await response.json() as { receipt?: unknown };
        if (sameReceipt(payload.receipt, ownerId, expected)) return candidate;
        failure("account_project_receipt_mismatch");
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === "project_too_large") throw error;
    // A network failure may happen after the head commit. Reconcile once below.
  }
  try {
    const committed = await readHeadReceipt(ownerId, version.projectId);
    if (sameReceipt(committed, ownerId, expected)) return candidate;
    if (committed) failure("stale_revision");
  } catch (error) {
    if (error instanceof Error && error.message === "stale_revision") throw error;
  }
  if (response?.status === 409) failure("stale_revision");
  if (response?.status === 413) failure("project_too_large");
  throw new Error("account_project_not_saved");
};

type DownloadPayload = {
  receipt?: unknown;
  download?: { parts?: unknown; bundleSha256?: unknown; compressedByteLength?: unknown; rawByteLength?: unknown };
};

export const readAccountProjectV2 = async (ownerId: string, projectId: string) => {
  const response = await boundedFetch(`/api/account/projects/${encodeURIComponent(projectId)}`, { headers: ownerHeaders(ownerId) }, 15_000);
  if (!response.ok) failure(response.status === 404 ? "account_project_not_found" : "account_project_read_failed");
  const payload = await response.json() as DownloadPayload;
  const receipt = payload.receipt;
  const download = payload.download;
  if (!isReceipt(receipt) || receipt.ownerId !== ownerId || receipt.projectId !== projectId || !download ||
    !Array.isArray(download.parts) || download.parts.length < 1 || download.parts.length > MAX_PARTS ||
    !download.parts.every(isSignedStorageUrl) ||
    typeof download.bundleSha256 !== "string" || !/^[0-9a-f]{64}$/.test(download.bundleSha256) ||
    !Number.isSafeInteger(download.compressedByteLength) || (download.compressedByteLength as number) < 1 ||
    (download.compressedByteLength as number) > MAX_BUNDLE_BYTES ||
    !Number.isSafeInteger(download.rawByteLength) || (download.rawByteLength as number) < 5 ||
    (download.rawByteLength as number) > MAX_BUNDLE_BYTES) failure("account_project_read_failed");
  const urls = download!.parts as string[];
  const compressedLength = download!.compressedByteLength as number;
  const pieces: Uint8Array[] = new Array(urls.length);
  await runLimited(urls, 4, async (url, index) => {
    const part = await boundedFetch(url, { credentials: "omit" }, 120_000);
    if (!part.ok) failure("account_project_read_failed");
    pieces[index] = new Uint8Array(await part.arrayBuffer());
  });
  const compressed = new Uint8Array(compressedLength);
  let offset = 0;
  for (const piece of pieces) {
    if (offset + piece.byteLength > compressedLength) failure("account_project_readback_failed");
    compressed.set(piece, offset);
    offset += piece.byteLength;
  }
  if (offset !== compressedLength || await sha256Hex(compressed) !== download!.bundleSha256) failure("account_project_readback_failed");
  const raw = await gunzipBounded(compressed, download!.rawByteLength as number);
  const { project, version } = await unpackAccountProject(raw);
  if (project.projectId !== projectId || version.projectId !== projectId ||
    !sameReceipt(receipt, ownerId, version)) failure("account_project_readback_failed");
  const head = await readHeadReceipt(ownerId, projectId);
  if (!sameReceipt(head, ownerId, version)) failure("source_changed");
  return project;
};

export const listAccountProjectsV2 = async (ownerId: string): Promise<ListedHead[]> => {
  const response = await boundedFetch("/api/account/projects", { headers: ownerHeaders(ownerId) }, 15_000);
  if (!response.ok) failure("account_project_read_failed");
  const payload = await response.json() as { projects?: unknown };
  const projects = payload.projects;
  if (!Array.isArray(projects) || projects.length > 64) throw new Error("account_project_read_failed");
  return projects.map((value: unknown) => {
    const row = value as Partial<ListedHead>;
    if (!row || typeof row.projectId !== "string" || typeof row.title !== "string" ||
      typeof row.updatedAt !== "string" || !Number.isSafeInteger(row.activeRevision) ||
      typeof row.projectDigest !== "string" || !/^[0-9a-f]{64}$/.test(row.projectDigest)) failure("account_project_read_failed");
    return row as ListedHead;
  });
};

export const createAccountProjectSourceReader = (ownerId: string): ProjectSourceReader => ({
  async list() {
    const heads = await listAccountProjectsV2(ownerId);
    return heads.map(head => ({
      locator: `unified-v2:${head.projectId}`, sourceKind: "unified-v2" as const,
      sourceId: head.projectId, title: head.title, updatedAt: new Date(head.updatedAt).toISOString(),
      canonicalRevision: head.activeRevision, canonicalDigest: head.projectDigest,
      canonicalAdoptionKey: null,
      read: async () => failure("native_v2_direct_read"),
    }));
  },
  readNativeProject: projectId => readAccountProjectV2(ownerId, projectId),
});

export const createAccountProjectRepositoryV2 = (ownerId: string) => createUnifiedProjectRepositoryV2({
  storage: {
    read: projectId => readAccountProjectV2(ownerId, projectId),
    write: (candidate, expectedRevision) => writeAccountProjectV2(ownerId, candidate, expectedRevision),
    deleteProject: async (projectId, expectedRevision, expectedDigest) => {
      const response = await boundedFetch(`/api/account/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE", headers: { ...ownerHeaders(ownerId), "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision, expectedDigest }),
      }, 15_000);
      if (!response.ok) failure(response.status === 409 ? "stale_revision" : "account_project_write_failed");
      const value = await response.json() as { projectId?: unknown; deletedAssetIds?: unknown };
      if (value.projectId !== projectId || !Array.isArray(value.deletedAssetIds)) failure("account_project_readback_failed");
      return { projectId, deletedAssetIds: [] };
    },
  },
});
