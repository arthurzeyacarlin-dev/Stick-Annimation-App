import assert from "node:assert/strict";

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type StoreKeyPath = string | readonly string[];
type StoredEntry = {key: unknown; value: unknown};
type StoreState = {keyPath: StoreKeyPath; entries: Map<string, StoredEntry>};
type DatabaseState = {name: string; version: number; stores: Map<string, StoreState>};

const clone = <T>(value: T): T => structuredClone(value);
const keyToken = (value: unknown) => JSON.stringify(value);
const plainRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("IndexedDB record is not an object.");
  return value as Record<string, unknown>;
};
const extractKey = (value: unknown, keyPath: StoreKeyPath) => {
  const record = plainRecord(value);
  return Array.isArray(keyPath) ? keyPath.map((key) => record[key]) : record[keyPath as string];
};

class DeterministicRequest<T> extends EventTarget {
  result!: T;
  error: DOMException | null = null;

  succeed(value: T) {
    this.result = value;
    this.dispatchEvent(new Event("success"));
  }

  fail(error: DOMException) {
    this.error = error;
    this.dispatchEvent(new Event("error"));
  }
}

class DeterministicTransaction extends EventTarget {
  error: DOMException | null = null;
  #active = true;
  #pendingRequests = 0;
  #completionTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #allowedStores: Set<string>;
  readonly #database: DatabaseState;
  readonly #factory: DeterministicIndexedDbFactory;

  constructor(factory: DeterministicIndexedDbFactory, database: DatabaseState, storeNames: readonly string[]) {
    super();
    this.#factory = factory;
    this.#database = database;
    this.#allowedStores = new Set(storeNames);
    this.#factory.transactionOpened();
    this.#scheduleCompletion();
  }

  objectStore(name: string) {
    if (!this.#active || !this.#allowedStores.has(name)) {
      this.#factory.unexpectedOperation();
      throw new DOMException(`Object store ${name} is unavailable.`, "NotFoundError");
    }
    const store = this.#database.stores.get(name);
    if (!store) {
      this.#factory.unexpectedOperation();
      throw new DOMException(`Object store ${name} does not exist.`, "NotFoundError");
    }
    return new DeterministicObjectStore(this, store) as unknown as IDBObjectStore;
  }

  beginRequest() {
    if (!this.#active) throw new DOMException("Transaction is inactive.", "TransactionInactiveError");
    this.#pendingRequests += 1;
    this.#factory.requestOpened();
    let settled = false;
    return () => {
      if (settled) {
        this.#factory.unexpectedOperation();
        return;
      }
      settled = true;
      this.#pendingRequests -= 1;
      this.#factory.requestClosed();
      this.#scheduleCompletion();
    };
  }

  fail(error: DOMException) {
    if (!this.#active) return;
    this.error = error;
    this.#factory.transactionFailed();
    this.dispatchEvent(new Event("error"));
    this.#active = false;
    this.dispatchEvent(new Event("abort"));
    this.#factory.transactionClosed();
  }

  #scheduleCompletion() {
    if (!this.#active || this.#completionTimer !== null) return;
    this.#completionTimer = setTimeout(() => {
      this.#completionTimer = null;
      if (!this.#active || this.#pendingRequests !== 0) return;
      this.#active = false;
      this.dispatchEvent(new Event("complete"));
      this.#factory.transactionClosed();
    }, 0);
  }
}

class DeterministicCursor {
  readonly #request: DeterministicCursorRequest;
  readonly #store: StoreState;
  readonly #token: string;

  constructor(request: DeterministicCursorRequest, store: StoreState, token: string) {
    this.#request = request;
    this.#store = store;
    this.#token = token;
  }

  get value() {
    const entry = this.#store.entries.get(this.#token);
    if (!entry) throw new DOMException("Cursor entry disappeared.", "InvalidStateError");
    return clone(entry.value);
  }

  delete() {
    return this.#request.deleteCurrent(this.#token);
  }

  continue() {
    this.#request.continue();
  }
}

class DeterministicCursorRequest extends DeterministicRequest<IDBCursorWithValue | null> {
  readonly #transaction: DeterministicTransaction;
  readonly #store: StoreState;
  readonly #tokens: string[];
  readonly #finish: () => void;
  #index = 0;
  #continued = false;

  constructor(transaction: DeterministicTransaction, store: StoreState) {
    super();
    this.#transaction = transaction;
    this.#store = store;
    this.#tokens = [...store.entries.keys()].sort();
    this.#finish = transaction.beginRequest();
    queueMicrotask(() => this.#deliver());
  }

  continue() {
    if (this.#continued) throw new DOMException("Cursor already continued.", "InvalidStateError");
    this.#continued = true;
    this.#index += 1;
    queueMicrotask(() => this.#deliver());
  }

  deleteCurrent(token: string) {
    return requestFor(this.#transaction, () => {
      this.#store.entries.delete(token);
      return undefined;
    });
  }

  #deliver() {
    this.#continued = false;
    while (this.#index < this.#tokens.length && !this.#store.entries.has(this.#tokens[this.#index])) this.#index += 1;
    if (this.#index >= this.#tokens.length) {
      this.succeed(null);
      this.#finish();
      return;
    }
    this.succeed(new DeterministicCursor(this, this.#store, this.#tokens[this.#index]) as unknown as IDBCursorWithValue);
  }
}

const requestFor = <T>(transaction: DeterministicTransaction, operation: () => T) => {
  const request = new DeterministicRequest<T>();
  const finish = transaction.beginRequest();
  queueMicrotask(() => {
    try {
      request.succeed(operation());
    } catch (error) {
      const mapped = error instanceof DOMException ? error : new DOMException(error instanceof Error ? error.message : "IndexedDB request failed.", "UnknownError");
      request.fail(mapped);
      transaction.fail(mapped);
    } finally {
      finish();
    }
  });
  return request as unknown as IDBRequest<T>;
};

class DeterministicObjectStore {
  readonly #transaction: DeterministicTransaction;
  readonly #store: StoreState;

  constructor(transaction: DeterministicTransaction, store: StoreState) {
    this.#transaction = transaction;
    this.#store = store;
  }

  get(key: IDBValidKey | IDBKeyRange) {
    return requestFor(this.#transaction, () => {
      const entry = this.#store.entries.get(keyToken(key));
      return entry ? clone(entry.value) : undefined;
    });
  }

  getAll() {
    return requestFor(this.#transaction, () => [...this.#store.entries]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, entry]) => clone(entry.value)));
  }

  add(value: unknown) {
    return requestFor(this.#transaction, () => {
      const key = extractKey(value, this.#store.keyPath);
      const token = keyToken(key);
      if (this.#store.entries.has(token)) throw new DOMException("Key already exists.", "ConstraintError");
      this.#store.entries.set(token, {key: clone(key), value: clone(value)});
      return clone(key);
    });
  }

  put(value: unknown) {
    return requestFor(this.#transaction, () => {
      const key = extractKey(value, this.#store.keyPath);
      this.#store.entries.set(keyToken(key), {key: clone(key), value: clone(value)});
      return clone(key);
    });
  }

  delete(key: IDBValidKey | IDBKeyRange) {
    return requestFor(this.#transaction, () => {
      this.#store.entries.delete(keyToken(key));
      return undefined;
    });
  }

  openCursor() {
    return new DeterministicCursorRequest(this.#transaction, this.#store) as unknown as IDBRequest<IDBCursorWithValue | null>;
  }
}

class DeterministicDatabase {
  readonly #factory: DeterministicIndexedDbFactory;
  readonly #state: DatabaseState;
  #closed = false;

  constructor(factory: DeterministicIndexedDbFactory, state: DatabaseState) {
    this.#factory = factory;
    this.#state = state;
    this.#factory.connectionOpened();
  }

  get objectStoreNames() {
    const names = [...this.#state.stores.keys()].sort();
    return {
      contains: (name: string) => names.includes(name),
      item: (index: number) => names[index] ?? null,
      get length() { return names.length; },
      [Symbol.iterator]: function* () { yield* names; },
    } as unknown as DOMStringList;
  }

  createObjectStore(name: string, options: IDBObjectStoreParameters = {}) {
    if (this.#state.stores.has(name) || options.keyPath === null || options.keyPath === undefined) {
      this.#factory.unexpectedOperation();
      throw new DOMException(`Invalid object store ${name}.`, "ConstraintError");
    }
    const keyPath = Array.isArray(options.keyPath) ? [...options.keyPath] : options.keyPath;
    const store: StoreState = {keyPath, entries: new Map()};
    this.#state.stores.set(name, store);
    return {name, keyPath} as unknown as IDBObjectStore;
  }

  transaction(storeNames: string | string[]) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    for (const name of names) {
      if (!this.#state.stores.has(name)) {
        this.#factory.unexpectedOperation();
        throw new DOMException(`Unknown object store ${name}.`, "NotFoundError");
      }
    }
    return new DeterministicTransaction(this.#factory, this.#state, names) as unknown as IDBTransaction;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#factory.connectionClosed();
  }
}

class DeterministicIndexedDbFactory {
  readonly #databases = new Map<string, DatabaseState>();
  activeConnectionCount = 0;
  activeTransactionCount = 0;
  pendingRequestCount = 0;
  openRequestCount = 0;
  deleteRequestCount = 0;
  transactionFailureCount = 0;
  unexpectedOperationCount = 0;

  open(name: string, version = 1) {
    this.openRequestCount += 1;
    const request = new DeterministicRequest<IDBDatabase>();
    queueMicrotask(() => {
      let state = this.#databases.get(name);
      const upgrade = state === undefined;
      if (!state) {
        state = {name, version, stores: new Map()};
        this.#databases.set(name, state);
      }
      const database = new DeterministicDatabase(this, state);
      request.result = database as unknown as IDBDatabase;
      if (upgrade) request.dispatchEvent(new Event("upgradeneeded"));
      queueMicrotask(() => request.succeed(database as unknown as IDBDatabase));
    });
    return request as unknown as IDBOpenDBRequest;
  }

  deleteDatabase(name: string) {
    this.deleteRequestCount += 1;
    const request = new DeterministicRequest<undefined>();
    queueMicrotask(() => {
      if (this.activeConnectionCount !== 0 || this.activeTransactionCount !== 0 || this.pendingRequestCount !== 0) {
        request.dispatchEvent(new Event("blocked"));
        return;
      }
      this.#databases.delete(name);
      request.succeed(undefined);
    });
    return request as unknown as IDBOpenDBRequest;
  }

  snapshot(name: string) {
    const state = this.#databases.get(name);
    if (!state) return null;
    return Object.fromEntries([...state.stores]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([storeName, store]) => [storeName, [...store.entries]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, entry]) => clone(entry.value))]));
  }

  hasDatabase(name: string) {
    return this.#databases.has(name);
  }

  connectionOpened() { this.activeConnectionCount += 1; }
  connectionClosed() { this.activeConnectionCount -= 1; }
  transactionOpened() { this.activeTransactionCount += 1; }
  transactionClosed() { this.activeTransactionCount -= 1; }
  requestOpened() { this.pendingRequestCount += 1; }
  requestClosed() { this.pendingRequestCount -= 1; }
  transactionFailed() { this.transactionFailureCount += 1; }
  unexpectedOperation() { this.unexpectedOperationCount += 1; }
}

const deleteDatabase = (factory: DeterministicIndexedDbFactory, name: string) => new Promise<void>((resolve, reject) => {
  const request = factory.deleteDatabase(name);
  request.addEventListener("success", () => resolve(), {once: true});
  request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB delete failed.")), {once: true});
  request.addEventListener("blocked", () => reject(new Error("IndexedDB delete was blocked.")), {once: true});
});

const localStorageValues = new Map<string, string>();
let localStorageGetCount = 0;
let localStorageSetCount = 0;
let localStorageRemoveCount = 0;
const localStorageMock: LocalStorageLike = {
  getItem: (key) => {
    localStorageGetCount += 1;
    return localStorageValues.get(key) ?? null;
  },
  setItem: (key, value) => {
    localStorageSetCount += 1;
    localStorageValues.set(key, value);
  },
  removeItem: (key) => {
    localStorageRemoveCount += 1;
    localStorageValues.delete(key);
  },
};

const indexedDbMock = new DeterministicIndexedDbFactory();
const deterministicProjectIds = [
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];
const nativeCrypto = globalThis.crypto;
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
const installGlobal = (name: string, value: unknown) => {
  originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
};
const restoreGlobals = () => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
};

installGlobal("indexedDB", indexedDbMock as unknown as IDBFactory);
installGlobal("window", {localStorage: localStorageMock});
installGlobal("navigator", {locks: undefined});
installGlobal("crypto", {
  subtle: nativeCrypto.subtle,
  randomUUID: () => {
    const id = deterministicProjectIds.shift();
    if (!id) throw new Error("Deterministic project ID source exhausted.");
    return id;
  },
});

const unhandledRejections: unknown[] = [];
const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
process.on("unhandledRejection", onUnhandledRejection);

const baseProjectData = {
  version: 1 as const,
  activeTool: "Select" as const,
  brushSize: 4,
  eraserSize: 12,
  fillColor: "#000000",
  timelineFps: 12,
  shapeType: "Square" as const,
  activeLayerId: "layer-1",
  currentFrameIndex: 0,
  selectedTimelineIndex: 0,
  isOnionEnabled: false,
  layers: [{
    id: "layer-1",
    name: "Layer 1",
    orderIndex: 0,
    timelineFrames: [{
      id: 1,
      kind: "keyframe" as const,
      cellType: "keyframe" as const,
      stateId: 1,
      bitmap: null,
      previewUrl: null,
      tweenEndBitmap: null,
      tweenEndPreviewUrl: null,
      motionTween: null,
    }],
  }],
  nextTimelineFrameId: 2,
  nextLayerNumber: 2,
};

const makeMemory = (goal: string, sideColor: string, ownerProjectId: string | null = null) => ({
  version: 1 as const,
  ownerProjectId,
  taskType: "generate-frames" as const,
  interactionMode: "tweak" as const,
  currentGoal: goal,
  contextSummary: `${sideColor} figure update`,
  lastPrompt: `Make the right figure ${sideColor}.`,
  lastUpdatedAt: "2026-08-18T00:00:00.000Z",
  generateFramesState: {
    ownerProjectId,
    subjectType: "mixed" as const,
    subjects: [
      {id: "attacker", type: "character" as const, role: "attacker" as const, side: "left" as const, color: "black"},
      {id: "defender", type: "character" as const, role: "defender" as const, side: "right" as const, color: sideColor},
    ],
    motionType: "punch" as const,
    tone: "serious" as const,
    forceLevel: "medium" as const,
    animationPhase: "progression" as const,
    frameCount: 8,
    fps: 12,
    modifiers: [],
    sceneSetting: "forest",
    sceneDescriptors: [],
    sceneProps: ["trees"],
    recentEdits: ["Change the right figure to blue."],
  },
  recentEdits: ["Change the right figure to blue."],
});

const projectAId = "00000000-0000-4000-8000-000000000001";
const projectBId = "00000000-0000-4000-8000-000000000002";
const projectAMemory = makeMemory("Forest duel", "blue");
const projectBMemory = makeMemory("City chase", "red");
let closeDrawingProjectStorage: (() => Promise<void>) | null = null;

try {
  const drawingProjectStorageModuleUrl = new URL("../src/lib/drawingProjectStorage.ts", import.meta.url);
  const drawingProjectIndexedDbModuleUrl = new URL("../src/lib/drawingProjectIndexedDb.ts", import.meta.url);
  const storageModule = await import(drawingProjectStorageModuleUrl.href) as typeof import("../src/lib/drawingProjectStorage");
  const indexedDbModule = await import(drawingProjectIndexedDbModuleUrl.href) as typeof import("../src/lib/drawingProjectIndexedDb");
  const {
    saveStoredDrawingProject,
    getStoredDrawingProject,
    listStoredDrawingProjects,
    deleteStoredDrawingProject,
    updateStoredDrawingProjectAiMemory,
  } = storageModule;
  closeDrawingProjectStorage = storageModule.closeDrawingProjectStorage;
  const indexedDbContract = indexedDbModule.DRAWING_PROJECT_INDEXED_DB;
  const activeDatabaseName = indexedDbContract.name;

  const oldSynchronousCall = listStoredDrawingProjects();
  assert.equal(oldSynchronousCall instanceof Promise, true, "Drawing catalog must remain asynchronous.");
  assert.throws(
    () => (oldSynchronousCall as unknown as {map: (callback: (value: unknown) => unknown) => unknown[]}).map((value) => value),
    TypeError,
    "The former unawaited listStoredDrawingProjects().map call must fail.",
  );
  assert.deepEqual(await oldSynchronousCall, [], "The awaited initial catalog must be empty.");

  const projectA = await saveStoredDrawingProject({
    id: projectAId,
    name: "Project A",
    data: baseProjectData,
    previewDataUrl: null,
    aiMemory: projectAMemory,
  });
  assert.equal(projectA.status, "saved");
  assert.equal(projectA.project.id, projectAId);
  assert.equal(projectA.head.activeStorageRevision, 1);

  const reopenedA = await getStoredDrawingProject(projectA.project.id);
  assert.equal(reopenedA?.kind, "v2");
  assert.equal(reopenedA?.project.aiMemory?.currentGoal, "Forest duel");
  assert.equal(reopenedA?.project.aiMemory?.generateFramesState?.subjects?.[1]?.color, "blue");
  assert.equal(reopenedA?.project.aiMemory?.ownerProjectId, projectA.project.id);
  assert.equal(reopenedA?.project.aiMemory?.generateFramesState?.ownerProjectId, projectA.project.id);

  const projectB = await saveStoredDrawingProject({
    id: projectBId,
    name: "Project B",
    data: baseProjectData,
    previewDataUrl: null,
    aiMemory: projectBMemory,
  });
  assert.equal(projectB.status, "saved");
  assert.equal(projectB.project.id, projectBId);

  let foreignUpdateCode: unknown = null;
  try {
    await updateStoredDrawingProjectAiMemory(projectB.project.id, {
      ...projectBMemory,
      ownerProjectId: projectA.project.id,
      currentGoal: "Foreign overwrite",
    });
  } catch (error) {
    foreignUpdateCode = error !== null && typeof error === "object" ? (error as {code?: unknown}).code : null;
  }
  assert.equal(foreignUpdateCode, "invalid_record", "Foreign project memory must reject with the typed invalid_record code.");
  const reopenedBAfterRejectedUpdate = await getStoredDrawingProject(projectB.project.id);
  assert.equal(reopenedBAfterRejectedUpdate?.project.aiMemory?.currentGoal, "City chase");

  const revisedBMemory = makeMemory("City chase revised", "red", projectB.project.id);
  const updatedMemory = await updateStoredDrawingProjectAiMemory(projectB.project.id, revisedBMemory);
  assert.equal(updatedMemory?.ownerProjectId, projectB.project.id);
  assert.equal(updatedMemory?.currentGoal, "City chase revised");

  const reopenedB = await getStoredDrawingProject(projectB.project.id);
  assert.equal(reopenedB?.project.aiMemory?.currentGoal, "City chase revised");
  assert.equal(reopenedB?.project.aiMemory?.ownerProjectId, projectB.project.id);
  assert.equal(reopenedB?.project.aiMemory?.generateFramesState?.ownerProjectId, projectB.project.id);
  assert.equal(reopenedA?.project.aiMemory?.currentGoal, "Forest duel", "Project A memory must remain isolated from Project B updates.");

  const updatedB = await saveStoredDrawingProject({
    id: projectB.project.id,
    name: "Project B Updated",
    data: baseProjectData,
    previewDataUrl: null,
    aiMemory: reopenedB?.project.aiMemory ?? null,
    expectedRevision: projectB.head.activeStorageRevision,
    createdAt: projectB.head.createdAt,
  });
  assert.equal(updatedB.status, "saved");
  assert.equal(updatedB.head.activeStorageRevision, 2);
  assert.equal(updatedB.project.id, projectB.project.id);

  const projectBSaveAs = await saveStoredDrawingProject({
    name: "Project B Save As",
    data: baseProjectData,
    previewDataUrl: null,
    aiMemory: reopenedB?.project.aiMemory ?? null,
  });
  assert.notEqual(projectBSaveAs.project.id, projectB.project.id);
  assert.equal(projectBSaveAs.project.aiMemory?.currentGoal, "City chase revised");
  assert.equal(projectBSaveAs.project.aiMemory?.ownerProjectId, projectBSaveAs.project.id);
  assert.equal(projectBSaveAs.project.aiMemory?.generateFramesState?.ownerProjectId, projectBSaveAs.project.id);

  const catalogBeforeDelete = await listStoredDrawingProjects();
  assert.equal(catalogBeforeDelete.length, 3);
  assert.deepEqual(new Set(catalogBeforeDelete.map((entry) => entry.kind)), new Set(["v2"]));
  const projectAEntry = catalogBeforeDelete.find((entry) => entry.projectId === projectA.project.id);
  assert.ok(projectAEntry && projectAEntry.kind === "v2", "Project A must be represented by a typed V2 catalog entry.");

  const snapshotBeforeDelete = indexedDbMock.snapshot(activeDatabaseName);
  assert.ok(snapshotBeforeDelete, "IndexedDB database must exist after Save.");
  assert.deepEqual(Object.keys(snapshotBeforeDelete).sort(), Object.values(indexedDbContract.stores).sort());
  assert.equal(snapshotBeforeDelete[indexedDbContract.stores.heads].length, 3);
  assert.equal(snapshotBeforeDelete[indexedDbContract.stores.versions].length, 3);
  assert.equal(snapshotBeforeDelete[indexedDbContract.stores.auxiliary].length, 3);
  assert.equal(snapshotBeforeDelete[indexedDbContract.stores.previews].length, 0);
  assert.equal(snapshotBeforeDelete[indexedDbContract.stores.tombstones].length, 0);
  assert.equal(localStorageValues.size, 0, "Canonical Drawing V2 records and auxiliary memory must not come from localStorage.");
  assert.equal(localStorageSetCount, 0, "The V2 Save/update flow must not write localStorage.");
  assert.ok(localStorageGetCount > 0, "The current legacy-maintenance boundary must still read the localStorage mock.");
  assert.equal(localStorageRemoveCount, 0);

  const deletedA = await deleteStoredDrawingProject(projectAEntry);
  assert.equal(deletedA.status, "deleted");
  assert.equal(await getStoredDrawingProject(projectA.project.id), null);
  const remainingCatalog = await listStoredDrawingProjects();
  assert.equal(remainingCatalog.length, 2);
  assert.equal(remainingCatalog.some((entry) => entry.projectId === projectA.project.id), false);

  const snapshotAfterDelete = indexedDbMock.snapshot(activeDatabaseName);
  assert.ok(snapshotAfterDelete);
  assert.equal(snapshotAfterDelete[indexedDbContract.stores.heads].length, 2);
  assert.equal(snapshotAfterDelete[indexedDbContract.stores.versions].length, 2);
  assert.equal(snapshotAfterDelete[indexedDbContract.stores.auxiliary].length, 2, "Delete must remove the matching auxiliary memory record.");
  assert.equal(snapshotAfterDelete[indexedDbContract.stores.tombstones].length, 1);

  for (const entry of remainingCatalog) {
    const deletion = await deleteStoredDrawingProject(entry);
    assert.equal(deletion.status, "deleted");
  }
  assert.deepEqual(await listStoredDrawingProjects(), []);

  await storageModule.closeDrawingProjectStorage();
  closeDrawingProjectStorage = null;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(indexedDbMock.activeConnectionCount, 0, "Every IndexedDB connection must be closed.");
  assert.equal(indexedDbMock.activeTransactionCount, 0, "Every IndexedDB transaction must be terminal.");
  assert.equal(indexedDbMock.pendingRequestCount, 0, "Every IndexedDB request must be terminal.");
  assert.equal(indexedDbMock.transactionFailureCount, 0, "Unexpected IndexedDB transaction failure occurred.");
  assert.equal(indexedDbMock.unexpectedOperationCount, 0, "The deterministic IndexedDB contract was incomplete or bypassed.");
  assert.ok(indexedDbMock.openRequestCount > 1, "The real storage module must open its adapter and auxiliary-memory connections.");

  await deleteDatabase(indexedDbMock, activeDatabaseName);
  assert.equal(indexedDbMock.deleteRequestCount, 1);
  assert.equal(indexedDbMock.hasDatabase(activeDatabaseName), false, "The test database must leave no residual state.");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(unhandledRejections, [], "Unhandled promise rejection escaped the validator.");

  console.log(JSON.stringify({
    allChecksPassed: true,
    validatorVersion: 2,
    oldSynchronousMapRejected: true,
    awaitedIndexedDbContractPassed: true,
    typedSaveAndDeleteContractsPassed: true,
    memoryIsolationPassed: true,
    indexedDbOnlyPersistencePassed: true,
    residualDatabaseState: false,
    unexpectedIndexedDbOperations: indexedDbMock.unexpectedOperationCount,
    unhandledPromiseRejections: unhandledRejections.length,
    savedProjectCountBeforeDelete: catalogBeforeDelete.length,
  }, null, 2));
} finally {
  if (closeDrawingProjectStorage) await closeDrawingProjectStorage().catch(() => undefined);
  process.off("unhandledRejection", onUnhandledRejection);
  restoreGlobals();
}
