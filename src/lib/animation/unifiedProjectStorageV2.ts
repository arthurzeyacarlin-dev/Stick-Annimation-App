import { assertUnifiedAnimationProjectV2, type UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2";

const DB_NAME = "diamond-animation-unified-v2";
const DB_VERSION = 1;
const STORE = "projects";

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error ?? new Error("storage_read_failed"));
});

const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "projectId" });
  };
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(open.error ?? new Error("storage_read_failed"));
});

const completion = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("storage_write_failed"));
});

export async function listUnifiedProjectsV2(): Promise<UnifiedAnimationProjectV2[]> {
  const db = await database();
  try {
    const transaction = db.transaction(STORE, "readonly");
    const records = await request(transaction.objectStore(STORE).getAll());
    return records.map(record => structuredClone(assertUnifiedAnimationProjectV2(record as UnifiedAnimationProjectV2)));
  } finally { db.close(); }
}

export async function readUnifiedProjectV2(projectId: string): Promise<UnifiedAnimationProjectV2> {
  const db = await database();
  try {
    const transaction = db.transaction(STORE, "readonly");
    const record = await request(transaction.objectStore(STORE).get(projectId));
    if (!record) throw new Error("source_changed");
    return structuredClone(assertUnifiedAnimationProjectV2(record as UnifiedAnimationProjectV2));
  } finally { db.close(); }
}

export async function writeUnifiedProjectV2(project: UnifiedAnimationProjectV2, expectedRevision: number | null): Promise<UnifiedAnimationProjectV2> {
  const candidate = structuredClone(assertUnifiedAnimationProjectV2(project));
  const seen = new Set<ArrayBuffer>();
  let assetBytes = 0;
  const metadataBytes = new TextEncoder().encode(JSON.stringify(candidate, (_key, value) => {
    if (ArrayBuffer.isView(value)) {
      const buffer = value.buffer as ArrayBuffer;
      if (!seen.has(buffer)) { seen.add(buffer); assetBytes += value.byteLength; }
      return { byteLength: value.byteLength };
    }
    return value;
  })).byteLength;
  const bytes = metadataBytes + assetBytes;
  if (bytes > 134_217_728) throw new Error("project_too_large");
  const db = await database();
  try {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const current = await request(store.get(candidate.projectId)) as UnifiedAnimationProjectV2 | undefined;
    if (expectedRevision !== null && (!current || current.revision !== expectedRevision)) { transaction.abort(); throw new Error("stale_revision"); }
    if (expectedRevision === null && current) { transaction.abort(); throw new Error("duplicate_identity"); }
    store.put(candidate);
    await completion(transaction);
  } finally { db.close(); }
  const readback = await readUnifiedProjectV2(candidate.projectId);
  if (readback.projectId !== candidate.projectId || readback.revision !== candidate.revision || readback.document.layers.length !== candidate.document.layers.length) throw new Error("readback_failed");
  return readback;
}

export { DB_NAME as UNIFIED_PROJECT_DATABASE_V2 };
