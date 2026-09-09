import { DRAWING_PROJECT_INDEXED_DB } from "../drawingProjectIndexedDb.ts";
import { readDrawingProjectV1Storage } from "../drawingProjectV1Compatibility.ts";
import { STICK_PROJECT_STORAGE_KEY, STICK_PROJECT_STORAGE_BYTE_LIMIT, STICK_PROJECT_STORAGE_RECORD_LIMIT } from "../stickProjectStorage.ts";
import type { UnifiedLegacyMigrationSourceV1 } from "./unifiedAnimationMigration.ts";
import type { DrawingProjectHeadV2, DrawingProjectVersionRecordV2 } from "../drawingProjectV2Contract.ts";

export type ProjectSource = {
  locator: string;
  sourceKind: UnifiedLegacyMigrationSourceV1["sourceKind"];
  sourceId: string;
  title: string;
  updatedAt: string | null;
  error?: string;
  read: () => Promise<UnifiedLegacyMigrationSourceV1>;
};
export type ProjectSourceReader = { list: () => Promise<ProjectSource[]> };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const label = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.slice(0, 512) : fallback;
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const unavailable = (locator: string, sourceKind: ProjectSource["sourceKind"], error: string): ProjectSource => ({
  locator, sourceKind, sourceId: locator, title: `${sourceKind.startsWith("drawing") ? "Drawing" : "Stick"} projects unavailable`, updatedAt: null, error,
  read: async () => { throw new Error(error); },
});
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});

// A missing database is an empty collection. Aborting the implicit upgrade
// prevents even schema creation on New/Open; no maintenance or write port exists.
const existingDatabase = () => new Promise<IDBDatabase | null>((resolve, reject) => {
  const pending = window.indexedDB.open(DRAWING_PROJECT_INDEXED_DB.name);
  let absent = false;
  pending.onupgradeneeded = () => { absent = true; pending.transaction?.abort(); };
  pending.onerror = () => absent ? resolve(null) : reject(pending.error);
  pending.onblocked = () => reject(new Error("storage_read_failed"));
  pending.onsuccess = () => resolve(pending.result);
});
const readDatabase = async <T>(read: (database: IDBDatabase) => Promise<T>, empty: T): Promise<T> => {
  const database = await existingDatabase();
  if (!database) return empty;
  try { return await read(database); } finally { database.close(); }
};

export const createBrowserProjectSourceReader = (): ProjectSourceReader => ({
  async list() {
    const sources: ProjectSource[] = [];
    const legacy = await readDrawingProjectV1Storage({ getItem: (key) => window.localStorage.getItem(key) });
    if (legacy.status === "read-failed" || legacy.status === "corrupt-root") {
      sources.push(unavailable("drawing-v1:root", "drawing-v1", legacy.status === "read-failed" ? "storage_read_failed" : "invalid_record"));
    } else {
      for (const entry of legacy.entries) {
        const value = object(entry.value);
        sources.push({
          locator: `drawing-v1:${entry.index}`, sourceKind: "drawing-v1", sourceId: entry.projectId ?? `invalid-${entry.index}`,
          title: label(value.name, "Unavailable Drawing project"), updatedAt: date(value.updated_at),
          ...(entry.code ? { error: entry.code } : {}),
          read: async () => ({ sourceKind: "drawing-v1", project: entry.value }),
        });
      }
    }
    try {
      const raw = window.localStorage.getItem(STICK_PROJECT_STORAGE_KEY);
      if (raw !== null) {
        const envelope = object(JSON.parse(raw));
        if (envelope.storageVersion !== 1 || Object.keys(envelope).sort().join() !== "projects,storageVersion" || !Array.isArray(envelope.projects) || envelope.projects.length > STICK_PROJECT_STORAGE_RECORD_LIMIT || new TextEncoder().encode(raw).byteLength > STICK_PROJECT_STORAGE_BYTE_LIMIT) throw new Error("invalid_record");
        envelope.projects.forEach((project: unknown, index: number) => {
          const value = object(project);
          const sourceKind = value.recordVersion === 2 ? "stick-v2" : "stick-v1";
          sources.push({
            locator: `stick:${index}`, sourceKind, sourceId: label(value.projectId, `invalid-${index}`),
            title: label(object(value.document).title, "Unavailable Stick project"), updatedAt: date(value.updatedAt),
            read: async () => ({ sourceKind, project }),
          });
        });
      }
    } catch (error) {
      sources.push(unavailable("stick:root", "stick-v1", error instanceof SyntaxError || error instanceof Error && error.message === "invalid_record" ? "invalid_record" : "storage_read_failed"));
    }
    try {
      const heads = await readDatabase(async (database) => request(database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.heads, "readonly").objectStore(DRAWING_PROJECT_INDEXED_DB.stores.heads).getAll()), [] as unknown[]);
      for (const [index, rawHead] of heads.entries()) {
        const head = object(rawHead);
        sources.push({
          locator: `drawing-v2:${label(head.projectId, `invalid-${index}`)}`, sourceKind: "drawing-v2", sourceId: label(head.projectId, `invalid-${index}`),
          title: label(head.title, "Unavailable Drawing project"), updatedAt: date(head.updatedAt),
          read: async () => readDatabase(async (database) => {
            const names = DRAWING_PROJECT_INDEXED_DB.stores;
            const transaction = database.transaction([names.heads, names.versions, names.auxiliary], "readonly");
            // All three requests are captured in the same readonly transaction.
            const [currentHead, record, auxiliary] = await Promise.all([
              request(transaction.objectStore(names.heads).get(head.projectId as IDBValidKey)),
              request(transaction.objectStore(names.versions).get([head.projectId, head.activeStorageRevision] as IDBValidKey)),
              request(transaction.objectStore(names.auxiliary).get(head.projectId as IDBValidKey)),
            ]);
            if (!currentHead || !record) throw new Error("asset_missing");
            return { sourceKind: "drawing-v2" as const, head: currentHead as DrawingProjectHeadV2, record: record as DrawingProjectVersionRecordV2, aiMemory: object(auxiliary).aiMemory ?? null };
          }, null).then((value) => { if (!value) throw new Error("source_changed"); return value; }),
        });
      }
    } catch {
      sources.push(unavailable("drawing-v2:root", "drawing-v2", "storage_read_failed"));
    }
    return sources;
  },
});
