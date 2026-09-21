import type { ProjectRecoveryInspectionV1 } from "./projectRecoveryStorageV1.ts";
import { inspectProjectRecoveryDraftV1 } from "./projectRecoveryStorageV1.ts";
import { listProjectCollection, type ProjectCollectionEntry } from "./unifiedProjectCollection.ts";
import { createUnifiedProjectRepositoryV2 } from "./unifiedProjectRepositoryV2.ts";
import { digestUnifiedProjectV2 } from "./unifiedProjectStorageV2.ts";
import { createBrowserProjectSourceReader, type ProjectSourceReader } from "./unifiedProjectSourceReader.ts";
import { prepareCollectionWorkspace } from "./unifiedWorkspaceBootstrap.ts";
import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2.ts";

const INVALIDATION_CHANNEL = "diamond-animation-projects-v2";
const INVALIDATION_STORAGE_KEY = "diamond-animation-projects-v2:invalidation";
const LEASE_PREFIX = "diamond-animation-project-open-v1:";
const LEASE_SESSION_KEY = "diamond-animation-project-open-session-v1";
const LEASE_TTL_MS = 15_000;
const LEASE_HEARTBEAT_MS = 5_000;

type ProjectRepositoryV2 = ReturnType<typeof createUnifiedProjectRepositoryV2>;

export type ProjectManagementCommandKind = "rename" | "duplicate" | "delete";
export type ProjectManagementInvalidationV2 = {
  kind: ProjectManagementCommandKind;
  projectId: string;
  revision: number | null;
  digest: string | null;
  deleted: boolean;
};

export type ProjectManagementSuccessV2 = {
  ok: true;
  kind: ProjectManagementCommandKind;
  project: UnifiedAnimationProjectV2 | null;
  deletedProjectId: string | null;
};

export type ProjectManagementFailureV2 = {
  ok: false;
  code: string;
  message: string;
};

export type ProjectManagementResultV2 = ProjectManagementSuccessV2 | ProjectManagementFailureV2;

type ProjectOpenLeaseRecordV1 = {
  projectId: string;
  sessionId: string;
  leaseId: string;
  kind: "viewer" | "editor";
  expiresAt: number;
};

const projectLockName = (projectId: string) => `diamond-animation-project-operation-v2:${projectId}`;
const openLockName = (projectId: string) => `diamond-animation-project-open-v1:${projectId}`;
const leaseStorageKey = (record: Pick<ProjectOpenLeaseRecordV1, "projectId" | "leaseId">) =>
  `${LEASE_PREFIX}${encodeURIComponent(record.projectId)}:${record.leaseId}`;

const getSessionId = () => {
  try {
    const existing = sessionStorage.getItem(LEASE_SESSION_KEY);
    if (existing) return existing;
    const created = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(LEASE_SESSION_KEY, created);
    return created;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

const writeLease = (record: ProjectOpenLeaseRecordV1) => {
  try { localStorage.setItem(leaseStorageKey(record), JSON.stringify(record)); } catch { /* Web Lock still protects capable browsers. */ }
};

const removeLease = (record: ProjectOpenLeaseRecordV1) => {
  try { localStorage.removeItem(leaseStorageKey(record)); } catch { /* best effort */ }
};

const activeLeaseRecords = (projectId: string) => {
  const active: ProjectOpenLeaseRecordV1[] = [];
  const now = Date.now();
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(LEASE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as ProjectOpenLeaseRecordV1 | null;
        if (!parsed || typeof parsed.projectId !== "string" || typeof parsed.expiresAt !== "number") continue;
        if (parsed.expiresAt <= now) {
          localStorage.removeItem(key);
          continue;
        }
        if (parsed.projectId === projectId) active.push(parsed);
      } catch {
        // A malformed lease cannot become authority. Leave unrelated storage untouched.
      }
    }
  } catch {
    // Web Locks remain authoritative where available.
  }
  return active;
};

export const acquireProjectOpenLeaseV2 = (projectId: string, kind: "viewer" | "editor") => {
  const record: ProjectOpenLeaseRecordV1 = {
    projectId,
    sessionId: getSessionId(),
    leaseId: globalThis.crypto?.randomUUID?.() ?? `lease-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    expiresAt: Date.now() + LEASE_TTL_MS,
  };
  let stopped = false;
  let releaseWebLock: (() => void) | null = null;
  const refresh = () => {
    record.expiresAt = Date.now() + LEASE_TTL_MS;
    writeLease(record);
  };
  refresh();
  const heartbeat = window.setInterval(refresh, LEASE_HEARTBEAT_MS);
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks) {
    void locks.request(openLockName(projectId), { mode: "shared" }, async () => {
      if (stopped) return;
      await new Promise<void>(resolve => { releaseWebLock = resolve; });
    }).catch(() => undefined);
  }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(heartbeat);
    removeLease(record);
    releaseWebLock?.();
  };
  window.addEventListener("pagehide", stop, { once: true });
  return () => {
    window.removeEventListener("pagehide", stop);
    stop();
  };
};

const withExclusiveLock = async <T>(name: string, unavailableCode: string, operation: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return operation();
  let acquired = false;
  let value: T | undefined;
  await locks.request(name, { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) return;
    acquired = true;
    value = await operation();
  });
  if (!acquired) throw new Error(unavailableCode);
  return value as T;
};

const withDeleteLeaseGuard = async <T>(projectId: string, operation: () => Promise<T>) => {
  return withExclusiveLock(openLockName(projectId), "open_project_conflict", async () => {
    if (activeLeaseRecords(projectId).length > 0) throw new Error("open_project_conflict");
    return operation();
  });
};

const hasUnpairedSurrogate = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
};

export const normalizeProjectManagementTitleV2 = (input: string) => {
  if (hasUnpairedSurrogate(input)) throw new Error("invalid_title");
  const normalized = input.normalize("NFC");
  if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(normalized)) throw new Error("invalid_title");
  const title = normalized.replace(/^\s+|\s+$/gu, "");
  const byteLength = new TextEncoder().encode(title).byteLength;
  if (byteLength < 1 || byteLength > 512) throw new Error("invalid_title_length");
  return title;
};

const entriesMatch = (left: ProjectCollectionEntry, right: ProjectCollectionEntry) =>
  left.locator === right.locator &&
  left.sourceKind === right.sourceKind &&
  left.sourceId === right.sourceId &&
  left.classification === right.classification &&
  left.sourceDigest === right.sourceDigest &&
  left.candidateDigest === right.candidateDigest &&
  left.sourceRevision === right.sourceRevision &&
  left.updatedAt === right.updatedAt;

const errorMessage = (code: string) => {
  if (code === "invalid_title" || code === "invalid_title_length") return "Use a project name from 1 to 512 bytes without line breaks, control characters, or hidden direction controls.";
  if (code === "source_changed" || code === "stale_revision") return "Project changed in another tab. The latest saved version is shown now.";
  if (code === "open_project_conflict") return "Close this project in every editor or viewer, then try Delete again.";
  if (code === "recovery_conflict") return "Unsaved recovery work belongs to this project. Recover, discard, or save that work before deleting.";
  if (code === "protected_legacy") return "Open and save a native copy before managing this legacy project.";
  if (code === "invalid_record") return "This project cannot be managed safely because its exact local identity is unavailable.";
  if (code === "project_busy") return "Another project operation is already running. Refresh and try again.";
  if (code === "project_limit_reached" || code === "collection_too_large" || code === "project_too_large") return "The copy could not be saved because local project storage is full.";
  if (code === "delete_verification_failed") return "The project operation could not be fully verified. Refresh before taking another action.";
  return "The project operation failed safely. Existing saved work was not reported as changed.";
};

const failureResult = (error: unknown): ProjectManagementFailureV2 => {
  const code = error instanceof Error ? error.message : "storage_write_failed";
  return { ok: false, code, message: errorMessage(code) };
};

export const broadcastProjectManagementInvalidationV2 = (event: ProjectManagementInvalidationV2) => {
  try {
    const channel = new BroadcastChannel(INVALIDATION_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch { /* focus/visibility re-read is the fallback */ }
  try {
    localStorage.setItem(INVALIDATION_STORAGE_KEY, JSON.stringify({ ...event, nonce: crypto.randomUUID() }));
    localStorage.removeItem(INVALIDATION_STORAGE_KEY);
  } catch { /* no correctness depends on notification delivery */ }
};

export const subscribeProjectManagementInvalidationV2 = (listener: (event: ProjectManagementInvalidationV2) => void) => {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(INVALIDATION_CHANNEL);
    channel.addEventListener("message", event => listener(event.data as ProjectManagementInvalidationV2));
  } catch { channel = null; }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== INVALIDATION_STORAGE_KEY || !event.newValue) return;
    try { listener(JSON.parse(event.newValue) as ProjectManagementInvalidationV2); } catch { /* ignore malformed invalidation */ }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
};

export type ProjectManagementCommandOwnerOptionsV2 = {
  createReader?: () => ProjectSourceReader;
  repository?: ProjectRepositoryV2;
  inspectRecovery?: () => Promise<ProjectRecoveryInspectionV1>;
  notify?: (event: ProjectManagementInvalidationV2) => void;
};

export const createProjectManagementCommandOwnerV2 = (options: ProjectManagementCommandOwnerOptionsV2 = {}) => {
  const createReader = options.createReader ?? createBrowserProjectSourceReader;
  const repository = options.repository ?? createUnifiedProjectRepositoryV2();
  const inspectRecovery = options.inspectRecovery ?? inspectProjectRecoveryDraftV1;
  const notify = options.notify ?? broadcastProjectManagementInvalidationV2;

  const currentEntry = async (entry: ProjectCollectionEntry) => {
    const current = (await listProjectCollection(createReader())).find(candidate => candidate.locator === entry.locator);
    if (!current || !entriesMatch(entry, current)) throw new Error("source_changed");
    return current;
  };

  const publish = (event: ProjectManagementInvalidationV2) => {
    try { notify(event); } catch { /* invalidation is advisory */ }
  };

  return {
    async rename(entry: ProjectCollectionEntry, requestedTitle: string): Promise<ProjectManagementResultV2> {
      try {
        const title = normalizeProjectManagementTitleV2(requestedTitle);
        return await withExclusiveLock(projectLockName(entry.sourceId), "project_busy", async () => {
          const current = await currentEntry(entry);
          if (current.sourceKind !== "unified-v2" || current.classification !== "canonical") throw new Error("protected_legacy");
          if (!Number.isSafeInteger(current.sourceRevision) || !current.sourceDigest) throw new Error("invalid_record");
          const project = await repository.rename(current.sourceId, current.sourceRevision!, current.sourceDigest, title);
          publish({ kind: "rename", projectId: project.projectId, revision: project.revision, digest: await digestUnifiedProjectV2(project), deleted: false });
          return { ok: true, kind: "rename", project, deletedProjectId: null };
        });
      } catch (error) { return failureResult(error); }
    },

    async duplicate(entry: ProjectCollectionEntry, requestedTitle: string): Promise<ProjectManagementResultV2> {
      try {
        const title = normalizeProjectManagementTitleV2(requestedTitle);
        return await withExclusiveLock(projectLockName(entry.sourceId), "project_busy", async () => {
          const current = await currentEntry(entry);
          if (current.classification === "invalid") throw new Error("invalid_record");
          const candidate = await prepareCollectionWorkspace(createReader(), current);
          if (current.sourceKind === "unified-v2" && (
            candidate.editor.project.revision !== current.sourceRevision ||
            await digestUnifiedProjectV2(candidate.editor.project) !== current.sourceDigest
          )) throw new Error("source_changed");
          const project = await repository.saveAs(candidate.editor.project, title);
          publish({ kind: "duplicate", projectId: project.projectId, revision: project.revision, digest: await digestUnifiedProjectV2(project), deleted: false });
          return { ok: true, kind: "duplicate", project, deletedProjectId: null };
        });
      } catch (error) { return failureResult(error); }
    },

    async delete(entry: ProjectCollectionEntry): Promise<ProjectManagementResultV2> {
      try {
        return await withExclusiveLock(projectLockName(entry.sourceId), "project_busy", async () => {
          const current = await currentEntry(entry);
          if (current.sourceKind !== "unified-v2" || current.classification !== "canonical") throw new Error("protected_legacy");
          if (!Number.isSafeInteger(current.sourceRevision) || !current.sourceDigest) throw new Error("invalid_record");
          const recovery = await inspectRecovery();
          if (recovery.kind !== "none" && recovery.envelope?.sourceProjectId === current.sourceId) throw new Error("recovery_conflict");
          return withDeleteLeaseGuard(current.sourceId, async () => {
            await repository.deleteProject(current.sourceId, current.sourceRevision!, current.sourceDigest!);
            publish({ kind: "delete", projectId: current.sourceId, revision: null, digest: null, deleted: true });
            return { ok: true, kind: "delete", project: null, deletedProjectId: current.sourceId };
          });
        });
      } catch (error) { return failureResult(error); }
    },
  };
};
