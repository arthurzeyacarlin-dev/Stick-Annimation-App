"use client";

import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import { createUnifiedProjectRepositoryV2 } from "../animation/unifiedProjectRepositoryV2.ts";
import type { ProjectSourceReader } from "../animation/unifiedProjectSourceReader.ts";
import { packAccountProject, splitAccountProjectBundle, unpackAccountProjectManifest } from "./projectBundle.ts";
import { hydrateUnifiedProjectStorageV2 } from "../animation/unifiedProjectStorageV2.ts";
import { rasterCropOf } from "../animation/rasterCropV1.ts";
import { measureSaveStepV1 } from "../animation/projectSaveStatusV1.ts";
import { createBrowserProjectStore, type AccountProjectLocalStore, type LocalProject } from "./projectLocalStore.ts";
import { ownerWriteLockName } from "./projectPending";
import {
  AccountProjectRefused, holdsLocalAccountProject, keepOpenedAccountProject, openAccountProjectManifest, openAccountProjectPoster, openLocalAccountProject, pushAccountProject, stageAccountProject,
  type AccountProjectReceipt, type AccountProjectTransport,
} from "./projectPictures.ts";

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

// Sends one bundle (a small project whole, or a long project's description) and resolves once the account holds exactly
// this version.
const commitAccountProject = async (ownerId: string, body: Blob | Uint8Array, expected: AccountProjectReceipt, expectedRevision: number | null) => {
  let response: Response | null = null;
  try {
    response = await boundedFetch("/api/account/projects", {
      method: "POST",
      headers: { ...ownerHeaders(ownerId), "Content-Type": "application/octet-stream", "X-Expected-Revision": expectedRevision === null ? "new" : String(expectedRevision) },
      body: body as BodyInit,
    }, 300_000); // (Nov 14, live: saving an AI animation took exactly 60 s on the server and the save was called failed at 60 s) a big project gets 5 minutes
    if (response.ok) {
      const payload = await response.json() as { receipt?: unknown };
      if (sameReceipt(payload.receipt, ownerId, expected)) return;
      failure("account_project_receipt_mismatch");
    }
  } catch {
    // A network failure may happen after the head commit. Reconcile once below.
  }
  try {
    const committed = await readHeadReceipt(ownerId, expected.projectId);
    if (sameReceipt(committed, ownerId, expected)) return;
    if (committed) failure("stale_revision");
  } catch (error) {
    if (error instanceof Error && error.message === "stale_revision") throw error;
  }
  if (response?.status === 409) failure("stale_revision");
  // (Nov 4 PM12) too many projects is said as itself, so the editor shows its own limit message instead of a general "not saved"
  if (response?.status === 422) failure("project_limit_reached");
  throw new Error("account_project_not_saved");
};

// (Nov 14) PICTURE-BY-PICTURE SAVING (projectPictures.ts): a project with more than this many bytes of pictures is saved
// picture by picture, each picture once; a smaller one is still sent whole in one bundle, exactly as before.
const PICTURE_SAVING_FROM_BYTES = 16 * 1024 * 1024;
const pictureBytes = (value: unknown): number =>
  ArrayBuffer.isView(value) ? value.byteLength
    : rasterCropOf(value) ? rasterCropOf(value)!.width * rasterCropOf(value)!.height * 4
    : typeof value === "string" ? (value.startsWith("data:") ? value.length : 0)
    : value !== null && typeof value === "object" ? Object.values(value).reduce((total: number, entry) => total + pictureBytes(entry), 0)
    : 0;

let browserStore: AccountProjectLocalStore | null = null;
const localStore = () => browserStore ??= createBrowserProjectStore();

// The account's answer to a picture request. A plain "no" (4xx) is final; anything else is tried again.
const answered = async (response: Response) => {
  if (response.ok) return response;
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
    throw new AccountProjectRefused(response.status === 413 ? "project_too_large" : "account_project_not_saved");
  }
  throw new Error("account_project_not_saved");
};
// A request that never got an answer (no network, the server away) is the save's own "not saved": it is tried again.
const reached = (request: Promise<Response>) => request.catch(() => failure("account_project_not_saved"));
const transportFor = (ownerId: string): AccountProjectTransport => {
  const assets = (projectId: string) => `/api/account/projects/${encodeURIComponent(projectId)}/assets`;
  const name = (asset: { sha256: string; compression?: string }) => `${asset.sha256}.${asset.compression ?? "raw"}`;
  return {
    missing: async (projectId, entries) => {
      const response = await answered(await reached(boundedFetch(assets(projectId), {
        method: "POST", headers: { ...ownerHeaders(ownerId), "Content-Type": "application/json" }, body: JSON.stringify({ assets: entries }),
      }, 60_000)));
      const body = await response.json() as { missing?: unknown };
      return Array.isArray(body.missing) ? body.missing as string[] : failure("account_project_not_saved");
    },
    putAsset: async (projectId, asset) => {
      await answered(await reached(boundedFetch(`${assets(projectId)}/${name(asset)}`, {
        method: "PUT", body: asset.bytes as BodyInit,
        headers: { ...ownerHeaders(ownerId), "Content-Type": "application/octet-stream", "X-Asset-Byte-Length": String(asset.byteLength), "X-Asset-Encoding": asset.encoding },
      }, 120_000)));
    },
    getAsset: async (projectId, entry) => {
      const response = await boundedFetch(`${assets(projectId)}/${name(entry)}`, { headers: ownerHeaders(ownerId) }, 120_000);
      if (!response.ok) throw response.status === 404 ? new AccountProjectRefused("account_project_read_failed") : new Error("account_project_read_failed");
      return new Uint8Array(await response.arrayBuffer());
    },
    commit: (manifest, receipt, expectedRevision) => commitAccountProject(ownerId, manifest, receipt, expectedRevision),
  };
};

// While a save is being written into the browser's store, no other tab clears unused pictures out of it.
const STORE_LOCK = "diamond-account-projects-store";
const whileStoring = <T>(work: () => Promise<T>): Promise<T> =>
  typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(STORE_LOCK, { mode: "shared" }, work) as Promise<T> : work();
const pruneWhenIdle = () => {
  if (typeof navigator === "undefined" || !navigator.locks) return;
  void navigator.locks.request(STORE_LOCK, { mode: "exclusive", ifAvailable: true }, lock => lock ? localStore().prune() : undefined).catch(() => undefined);
};

export const writeAccountProjectV2 = async (ownerId: string, candidate: UnifiedAnimationProjectV2, expectedRevision: number | null) => {
  if (pictureBytes(candidate) < PICTURE_SAVING_FROM_BYTES) {
    const { body, version } = await packAccountProject(candidate);
    await commitAccountProject(ownerId, body, version, expectedRevision);
    await localStore().deleteProject(ownerId, candidate.projectId).catch(() => undefined);
    return candidate;
  }
  await whileStoring(async () => {
    const stageStart = performance.now();
    const staged = await stageAccountProject(localStore(), ownerId, candidate, expectedRevision);
    measureSaveStepV1("pictures", stageStart);
    const sendStart = performance.now();
    await pushAccountProject(localStore(), transportFor(ownerId), staged);
    measureSaveStepV1("send", sendStart);
  });
  pruneWhenIdle();
  return candidate;
};

// The home screen shows this sentence when a save could not be kept (see finishPendingSave).
export const ACCOUNT_SAVE_DROPPED_EVENT = "diamond-account-save-dropped";
const saySaveDropped = (title: string, neverSaved: boolean) => {
  if (typeof window === "undefined") return;
  const message = neverSaved
    ? `The browser closed before "${title}" was saved for the first time, so it could not be kept.`
    : `The browser closed before the last change to "${title}" was saved. It opens as it was last saved.`;
  window.dispatchEvent(new CustomEvent(ACCOUNT_SAVE_DROPPED_EVENT, { detail: { message } }));
};

// A save the browser still holds for the account (the tab was closed, or the network or the server went away before the
// account confirmed it): finish it now. Nothing is lost in between: it stays in the browser's store until this works.
const finishing = new Map<string, Promise<void>>();
const finishPendingSave = (ownerId: string, pending: LocalProject) => {
  const key = `${ownerId}\n${pending.head.projectId}`;
  const running = finishing.get(key) ?? whileStoring(async () => {
    const store = localStore();
    const head = await readHeadReceipt(ownerId, pending.head.projectId);
    if (sameReceipt(head, ownerId, pending.head)) {
      await store.putProject({ head: { ...pending.head, state: "saved" }, manifest: pending.manifest });
    } else if (!await holdsLocalAccountProject(store, pending)) {
      // (Nov 15) The browser died while this save was being stored, so some of its pictures are in no store at all: it can
      // never be finished. It is dropped and said plainly; the project is the version the account last saved, which opens.
      await store.deleteProject(ownerId, pending.head.projectId);
      saySaveDropped(pending.head.title, pending.head.expectedRevision === null);
    } else if ((head?.revision ?? null) === pending.head.expectedRevision) {
      await pushAccountProject(store, transportFor(ownerId), pending);
    } else {
      // The account went on without this save (the project was changed on another computer, or deleted): the work
      // is kept as a project of its own instead of being dropped.
      const project = await openLocalAccountProject(store, pending);
      if (project) await createAccountProjectRepositoryV2(ownerId).saveAs(project, `${project.title} (recovered)`);
      await store.deleteProject(ownerId, pending.head.projectId);
    }
  }).finally(() => finishing.delete(key));
  finishing.set(key, running);
  return running;
};

// Finishes every save this browser still holds for the account, unless a project is being edited or saved right now
// (in this or another tab): that editor's own save is the newer one.
const finishPendingSaves = (ownerId: string) => {
  if (typeof navigator === "undefined" || !navigator.locks) return;
  void navigator.locks.request(ownerWriteLockName(ownerId), { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) return;
    const store = localStore();
    for (const head of await store.listHeads(ownerId)) {
      const project = head.state === "pending" ? await store.getProject(ownerId, head.projectId) : null;
      if (project?.head.state === "pending") await finishPendingSave(ownerId, project).catch(() => undefined);
    }
  }).catch(() => undefined);
};

// A one-file bundle (every project saved before Nov 14, and every small project): opened exactly as before, then kept
// in the browser's store so the next open on this computer downloads nothing.
const openAccountProjectBundle = async (ownerId: string, bytes: Uint8Array) => {
  const { version, assets } = splitAccountProjectBundle(bytes);
  const project = await hydrateUnifiedProjectStorageV2(version, assets);
  if (project.projectId !== version.projectId || project.revision !== version.revision) failure("bundle_invalid");
  await whileStoring(() => keepOpenedAccountProject(localStore(), ownerId, version, assets)).catch(() => undefined);
  return { project, version };
};

// The project as the browser's store holds it, once any save still pending for it is finished.
const heldAccountProject = async (ownerId: string, projectId: string) => {
  const store = localStore();
  const local = await store.getProject(ownerId, projectId).catch(() => null);
  if (local?.head.state !== "pending") return local;
  await finishPendingSave(ownerId, local);
  return store.getProject(ownerId, projectId).catch(() => null);
};

// (Nov 14) What a project's poster needs (the home screen, the project list): only its first `cells` frames' pictures.
// The description comes from the browser's store when that holds the account's version, else from the account.
// null = a big one-file bundle the browser has not opened yet: it has to be opened whole.
export const readAccountProjectPosterV2 = async (ownerId: string, projectId: string, cells: number) => {
  const local = await heldAccountProject(ownerId, projectId);
  let bytes = local && sameReceipt(await readHeadReceipt(ownerId, projectId), ownerId, local.head) ? local.manifest : null;
  if (!bytes) {
    const response = await boundedFetch(`/api/account/projects/${encodeURIComponent(projectId)}?description=1`, { headers: ownerHeaders(ownerId) }, 60_000);
    if (response.status === 204) return null;
    if (!response.ok) failure(response.status === 404 ? "account_project_not_found" : "account_project_read_failed");
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const manifest = await unpackAccountProjectManifest(bytes);
  if (manifest) return openAccountProjectPoster(localStore(), transportFor(ownerId), manifest, cells);
  const { project, version } = await openAccountProjectBundle(ownerId, bytes);
  return { project, projectDigest: version.projectDigest, complete: true };
};

export const readAccountProjectV2 = async (ownerId: string, projectId: string) => {
  const store = localStore();
  const local = await heldAccountProject(ownerId, projectId);
  if (local) {
    // The version the account holds is the one this browser already has: no picture is downloaded again.
    const held = sameReceipt(await readHeadReceipt(ownerId, projectId), ownerId, local.head) ? await openLocalAccountProject(store, local) : null;
    if (held) return held;
  }
  const response = await boundedFetch(`/api/account/projects/${encodeURIComponent(projectId)}`, { headers: ownerHeaders(ownerId) }, 300_000); // (Nov 14, live: opening took 26-60 s, and at 60 s "This project couldn't be opened")
  if (!response.ok) failure(response.status === 404 ? "account_project_not_found" : "account_project_read_failed");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const manifest = await unpackAccountProjectManifest(bytes);
  const { project, version } = manifest
    ? { project: await openAccountProjectManifest(store, transportFor(ownerId), ownerId, bytes, manifest), version: manifest.version }
    : await openAccountProjectBundle(ownerId, bytes);
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
  const listed = projects.map((value: unknown) => {
    const row = value as Partial<ListedHead>;
    if (!row || typeof row.projectId !== "string" || typeof row.title !== "string" ||
      typeof row.updatedAt !== "string" || !Number.isSafeInteger(row.activeRevision) ||
      typeof row.projectDigest !== "string" || !/^[0-9a-f]{64}$/.test(row.projectDigest)) failure("account_project_read_failed");
    return row as ListedHead;
  });
  // (Nov 14) A save this browser still holds for the account shows in the list at once (a project the account has never
  // seen, or the newer version of one it has); opening it finishes the save first. All of them are also finished now, in
  // the background. A project the account no longer lists is dropped from the browser's store.
  const held = await localStore().listHeads(ownerId).catch(() => []);
  const stored = held.some(head => head.state === "pending") ? await localStore().assetEntries().catch(() => null) : null;
  for (const head of held) {
    if (head.state === "pending" && stored && !head.assetIds.every(assetId => stored.has(assetId))) continue;   // (Nov 15: it is dropped just below, by finishPendingSaves)
    const row = listed.find(entry => entry.projectId === head.projectId);
    const shown = { projectId: head.projectId, title: head.title, updatedAt: head.updatedAt, activeRevision: head.revision, projectDigest: head.projectDigest, provenance: head.provenance };
    if (head.state === "saved") { if (!row) void localStore().deleteProject(ownerId, head.projectId).catch(() => undefined); }
    else if (!row && head.expectedRevision === null) listed.unshift(shown);
    else if (row && row.activeRevision === head.expectedRevision) Object.assign(row, shown);
  }
  finishPendingSaves(ownerId);
  pruneWhenIdle();
  return listed;
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
  readPosterProject: (projectId, cells) => readAccountProjectPosterV2(ownerId, projectId, cells),
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
      await localStore().deleteProject(ownerId, projectId).catch(() => undefined);
      return { projectId, deletedAssetIds: [] };
    },
  },
});
