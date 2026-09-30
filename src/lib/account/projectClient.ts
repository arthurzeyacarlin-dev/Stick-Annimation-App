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

export const writeAccountProjectV2 = async (ownerId: string, candidate: UnifiedAnimationProjectV2, expectedRevision: number | null) => {
  const { body, version } = await packAccountProject(candidate);
  const expected = { projectId: version.projectId, revision: version.revision, projectDigest: version.projectDigest };
  let response: Response | null = null;
  try {
    response = await boundedFetch("/api/account/projects", {
      method: "POST",
      headers: { ...ownerHeaders(ownerId), "Content-Type": "application/octet-stream", "X-Expected-Revision": expectedRevision === null ? "new" : String(expectedRevision) },
      body,
    }, 60_000);
    if (response.ok) {
      const payload = await response.json() as { receipt?: unknown };
      if (sameReceipt(payload.receipt, ownerId, expected)) return candidate;
      failure("account_project_receipt_mismatch");
    }
  } catch {
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
  throw new Error("account_project_not_saved");
};

export const readAccountProjectV2 = async (ownerId: string, projectId: string) => {
  const response = await boundedFetch(`/api/account/projects/${encodeURIComponent(projectId)}`, { headers: ownerHeaders(ownerId) }, 60_000);
  if (!response.ok) failure(response.status === 404 ? "account_project_not_found" : "account_project_read_failed");
  const { project, version } = await unpackAccountProject(new Uint8Array(await response.arrayBuffer()));
  if (project.projectId !== projectId || version.projectId !== projectId ||
    response.headers.get("x-project-revision") !== String(version.revision) ||
    response.headers.get("x-project-digest") !== version.projectDigest) failure("account_project_readback_failed");
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
