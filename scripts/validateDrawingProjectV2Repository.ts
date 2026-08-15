import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DRAWING_PROJECT_DELETE_FAILED_CODES,
  DrawingProjectV2Error,
  parseDrawingProjectHeadV2,
  type DrawingProjectHeadV2,
  type DrawingProjectLegacyDeleteTombstoneV1,
  type DrawingProjectVersionRecordV2,
} from "../src/lib/drawingProjectV2Contract.ts";
import { canonicalJsonStringify, createStoredRecordDescriptor } from "../src/lib/drawingProjectV2Canonical.ts";
import {
  createDrawingProjectV2Repository,
  type DrawingProjectIndexedRepositoryAdapter,
  type DrawingProjectManagedState,
} from "../src/lib/drawingProjectV2Repository.ts";
import {
  classifyDrawingProjectV1RawRoot,
  type DrawingProjectLegacyMaintenanceResult,
} from "../src/lib/drawingProjectV1Compatibility.ts";
import { createLegacyProject, createVersionRecord } from "./fixtures/drawing-persistence/v2/fixtureFactory.ts";

let assertions = 0;
const equal = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.equal(actual, expected, message); };
const deepEqual = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const ok = (actual: unknown, message?: string) => { assertions += 1; assert.ok(actual, message); };
const expectCode = async (operation: () => Promise<unknown>, code: string) => {
  assertions += 1;
  try {
    await operation();
    assert.fail(`Expected ${code}.`);
  } catch (error) {
    assert.ok(error instanceof DrawingProjectV2Error && error.code === code, `Expected ${code}, received ${error instanceof DrawingProjectV2Error ? error.code : String(error)}.`);
  }
};

const caseFixture = JSON.parse(readFileSync(new URL("./fixtures/drawing-persistence/v2/repository-cases.json", import.meta.url), "utf8"));
equal(caseFixture.fixtureVersion, 1);
ok(caseFixture.cases.length >= 18);

const key = (projectId: string, revision: number) => `${projectId}\u0000${revision}`;
const clone = <T>(value: T): T => structuredClone(value);

const collectObjectGraph = (value: unknown, output: object[] = [], seen = new Set<object>()) => {
  if (value === null || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  output.push(value);
  if (!(value instanceof Blob)) for (const child of Object.values(value)) collectObjectGraph(child, output, seen);
  return output;
};

const snapshotCallerInput = async (document: DrawingProjectVersionRecordV2["document"], assets: DrawingProjectVersionRecordV2["assets"]) => {
  const objects = collectObjectGraph({ document, assets }).slice(1);
  return {
    objects,
    states: objects.map((value) => ({ frozen: Object.isFrozen(value), extensible: Object.isExtensible(value) })),
    value: canonicalJsonStringify({
      document,
      assets: assets.map((asset) => ({
        ...asset,
        bytes: { size: asset.bytes.size, type: asset.bytes.type },
      })),
    }),
    blobBytes: await Promise.all(assets.map(async (asset) => [...new Uint8Array(await asset.bytes.arrayBuffer())])),
  };
};

const assertCallerInputUnchanged = async (
  document: DrawingProjectVersionRecordV2["document"],
  assets: DrawingProjectVersionRecordV2["assets"],
  before: Awaited<ReturnType<typeof snapshotCallerInput>>,
  label: string,
) => {
  const after = await snapshotCallerInput(document, assets);
  equal(after.objects.length, before.objects.length, `${label}: object count`);
  after.objects.forEach((value, index) => equal(value, before.objects[index], `${label}: identity ${index}`));
  deepEqual(after.states, before.states, `${label}: frozen/extensible state`);
  equal(after.value, before.value, `${label}: values`);
  deepEqual(after.blobBytes, before.blobBytes, `${label}: Blob bytes`);
};

class MemoryIndexedAdapter implements DrawingProjectIndexedRepositoryAdapter {
  heads = new Map<string, DrawingProjectHeadV2>();
  versions = new Map<string, DrawingProjectVersionRecordV2>();
  tombstones = new Map<string, DrawingProjectLegacyDeleteTombstoneV1>();
  previews = new Map<string, unknown>();
  auxiliary = new Map<string, unknown>();
  calls: string[] = [];
  failStage: string | null = null;
  forceStalePublish = false;
  mutateReadBack = false;
  tombstoneReadFailure = false;
  deleteErrorCode: ConstructorParameters<typeof DrawingProjectV2Error>[0] | null = null;

  async cleanupOrphanVersions() {
    this.calls.push("cleanup-orphans");
    if (this.failStage === "cleanup-orphans") throw new DrawingProjectV2Error("transaction_aborted", "mock.cleanup", "injected");
    const active = new Set([...this.heads.values()].map((head) => key(head.projectId, head.activeStorageRevision)));
    let removed = 0;
    for (const versionKey of [...this.versions.keys()]) if (!active.has(versionKey)) { this.versions.delete(versionKey); removed += 1; }
    return removed;
  }

  async stageCandidate(record: DrawingProjectVersionRecordV2) {
    this.calls.push("stage");
    if (this.failStage === "stage") throw new DrawingProjectV2Error("transaction_aborted", "mock.stage", "injected");
    if (this.failStage === "quota") throw new DOMException("quota", "QuotaExceededError");
    const versionKey = key(record.projectId, record.storageRevision);
    if (this.versions.has(versionKey)) throw new DrawingProjectV2Error("storage_write_failed", "mock.stage", "immutable collision");
    this.versions.set(versionKey, clone(record));
  }

  async readVersion(projectId: string, revision: number) {
    this.calls.push("read-version");
    if (this.failStage === "read") throw new DrawingProjectV2Error("storage_read_failed", "mock.read", "injected");
    const value = this.versions.get(key(projectId, revision));
    if (!value) return null;
    const cloned = clone(value);
    if (this.mutateReadBack) cloned.document.fillColor = "#ffffff";
    return cloned;
  }

  async removeVersion(projectId: string, revision: number) {
    this.calls.push("remove-version");
    this.versions.delete(key(projectId, revision));
  }

  async publishHeadCas(expectedRevision: number | null, head: DrawingProjectHeadV2) {
    this.calls.push("publish-head");
    if (this.failStage === "publish") throw new DrawingProjectV2Error("transaction_aborted", "mock.publish", "injected");
    const current = this.heads.get(head.projectId) ?? null;
    if (this.forceStalePublish || (current?.activeStorageRevision ?? null) !== expectedRevision) return "stale" as const;
    this.heads.set(head.projectId, clone(head));
    return "committed" as const;
  }

  async cleanupProjectVersions(projectId: string, activeRevision: number) {
    this.calls.push("cleanup-project");
    if (this.failStage === "cleanup-project") throw new DrawingProjectV2Error("transaction_aborted", "mock.cleanup-project", "injected");
    let removed = 0;
    for (const [versionKey, record] of [...this.versions]) if (record.projectId === projectId && record.storageRevision !== activeRevision) { this.versions.delete(versionKey); removed += 1; }
    return removed;
  }

  async getManagedState(): Promise<DrawingProjectManagedState> {
    this.calls.push("managed-state");
    if (this.failStage === "managed-state") throw new DrawingProjectV2Error("storage_read_failed", "mock.managed", "injected");
    return {
      heads: [...this.heads.values()].map(clone),
      tombstones: [...this.tombstones.values()].map(clone),
      activeStoredBytes: [...this.heads.values()].reduce((sum, head) => sum + head.activeStoredByteLength, 0),
      companionStoredBytes: 0,
      tombstoneStoredBytes: this.tombstones.size * 128,
    };
  }

  async getHead(projectId: string) {
    this.calls.push("get-head");
    return clone(this.heads.get(projectId) ?? null);
  }

  async listHeads() {
    this.calls.push("list-heads");
    return [...this.heads.values()].map(clone);
  }

  async listTombstones() {
    this.calls.push("list-tombstones");
    if (this.tombstoneReadFailure) throw new DrawingProjectV2Error("storage_read_failed", "mock.tombstones", "injected");
    return [...this.tombstones.values()].map(clone);
  }

  async deleteAuthoritativeV2(input: { projectId: string; expectedRevision: number; tombstone: DrawingProjectLegacyDeleteTombstoneV1 }) {
    this.calls.push("delete-v2");
    if (this.deleteErrorCode) throw new DrawingProjectV2Error(this.deleteErrorCode, "mock.delete", "injected");
    if (this.failStage === "delete") throw new DrawingProjectV2Error("transaction_aborted", "mock.delete", "injected");
    const current = this.heads.get(input.projectId);
    if (!current) return "not-found" as const;
    if (current.activeStorageRevision !== input.expectedRevision) return "stale" as const;
    const nextHeads = new Map(this.heads);
    const nextVersions = new Map(this.versions);
    const nextTombstones = new Map(this.tombstones);
    nextHeads.delete(input.projectId);
    for (const [versionKey, record] of nextVersions) if (record.projectId === input.projectId) nextVersions.delete(versionKey);
    nextTombstones.set(input.projectId, clone(input.tombstone));
    this.heads = nextHeads;
    this.versions = nextVersions;
    this.tombstones = nextTombstones;
    this.previews.delete(input.projectId);
    this.auxiliary.delete(input.projectId);
    return "committed" as const;
  }

  async putLegacyOnlyTombstone(tombstone: DrawingProjectLegacyDeleteTombstoneV1) {
    this.calls.push("legacy-tombstone");
    if (this.failStage === "legacy-tombstone") throw new DrawingProjectV2Error("transaction_aborted", "mock.legacy", "injected");
    if (this.heads.has(tombstone.projectId)) return "v2-exists" as const;
    this.tombstones.set(tombstone.projectId, clone(tombstone));
    return "committed" as const;
  }

  async removeTombstone(projectId: string) {
    this.calls.push("remove-tombstone");
    if (this.failStage === "remove-tombstone") throw new DrawingProjectV2Error("transaction_aborted", "mock.remove-tombstone", "injected");
    this.tombstones.delete(projectId);
  }

  stateDigest() {
    return canonicalJsonStringify({
      heads: [...this.heads].sort(),
      versions: [...this.versions].sort().map(([versionKey, record]) => [versionKey, createStoredRecordDescriptor(record)]),
      tombstones: [...this.tombstones].sort(),
      previews: [...this.previews].sort(),
      auxiliary: [...this.auxiliary].sort(),
    });
  }
}

const fixtureRecord = await createVersionRecord("project-fixture", 1);
const adapter = new MemoryIndexedAdapter();
const repository = createDrawingProjectV2Repository(adapter);
const prepareDocument = clone(fixtureRecord.document);
const prepareAssets = clone(fixtureRecord.assets);
const prepareCallerBefore = await snapshotCallerInput(prepareDocument, prepareAssets);
const prepared = await repository.prepareRecord({
  projectId: fixtureRecord.projectId,
  storageRevision: 1,
  document: prepareDocument,
  assets: prepareAssets,
});
await assertCallerInputUnchanged(prepareDocument, prepareAssets, prepareCallerBefore, "prepare success preserves caller");
equal(prepared.documentDigest, fixtureRecord.documentDigest);
equal(prepared.storedByteLength, fixtureRecord.storedByteLength);
ok(Object.isFrozen(prepared));
ok(Object.isFrozen(prepared.document));
ok(Object.isFrozen(prepared.assets));
ok(collectObjectGraph(prepared).every((value) => Object.isFrozen(value)), "candidate graph, including cloned Blobs, is deeply frozen");
ok(prepared.document !== prepareDocument);
ok(prepared.document.layers !== prepareDocument.layers);
ok(prepared.assets !== prepareAssets);
ok(prepared.assets[0] !== prepareAssets[0]);
ok(prepared.assets[0].bytes !== prepareAssets[0].bytes);

const preparedFillColor = prepared.document.fillColor;
prepareDocument.fillColor = "#abcdef";
equal(prepared.document.fillColor, preparedFillColor, "later caller mutation cannot change candidate");
const callerFillColor = prepareDocument.fillColor;
let candidateMutationRejected = false;
try {
  prepared.document.fillColor = "#fedcba";
} catch {
  candidateMutationRejected = true;
}
equal(candidateMutationRejected, true, "candidate mutation is rejected");
equal(prepareDocument.fillColor, callerFillColor, "candidate mutation cannot change caller");

for (const failure of ["invalid", "capacity", "digest"] as const) {
  const failureDocument = clone(fixtureRecord.document);
  const failureAssets = clone(fixtureRecord.assets);
  if (failure === "invalid") failureAssets.push(failureAssets[0]);
  if (failureAssets[0].kind !== "raster-png") assert.fail("Expected raster fixture.");
  if (failure === "capacity") failureAssets[0].encodedByteLength = 134_217_729;
  if (failure === "digest") failureAssets[0].encodedSha256 = "0".repeat(64);
  const before = await snapshotCallerInput(failureDocument, failureAssets);
  await expectCode(
    () => repository.prepareRecord({ projectId: `prepare-${failure}`, storageRevision: 1, document: failureDocument, assets: failureAssets }),
    failure === "capacity" ? "project_too_large" : failure === "digest" ? "asset_digest_mismatch" : "invalid_record",
  );
  await assertCallerInputUnchanged(failureDocument, failureAssets, before, `prepare ${failure} failure preserves caller`);
}

const saveOne = await repository.save({
  projectId: "project-fixture",
  title: "First save",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:01.000Z",
  expectedRevision: null,
  document: fixtureRecord.document,
  assets: fixtureRecord.assets,
});
equal(saveOne.status, "saved");
equal(saveOne.head.activeStorageRevision, 1);
equal(parseDrawingProjectHeadV2(adapter.heads.get("project-fixture")).title, "First save");
deepEqual(adapter.calls.slice(0, 6), ["cleanup-orphans", "managed-state", "stage", "read-version", "publish-head", "cleanup-project"]);
equal(adapter.versions.size, 1);

adapter.calls.length = 0;
const saveTwo = await repository.save({
  projectId: "project-fixture",
  title: "Second save",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:02.000Z",
  expectedRevision: 1,
  document: fixtureRecord.document,
  assets: fixtureRecord.assets,
});
equal(saveTwo.head.activeStorageRevision, 2);
equal(adapter.versions.size, 1, "old version garbage-collected after publication");
ok(adapter.versions.has(key("project-fixture", 2)));

const lastGood = adapter.stateDigest();
adapter.forceStalePublish = true;
const staleCallerBefore = await snapshotCallerInput(fixtureRecord.document, fixtureRecord.assets);
await expectCode(() => repository.save({
  projectId: "project-fixture",
  title: "Stale",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:03.000Z",
  expectedRevision: 2,
  document: fixtureRecord.document,
  assets: fixtureRecord.assets,
}), "stale_revision");
await assertCallerInputUnchanged(fixtureRecord.document, fixtureRecord.assets, staleCallerBefore, "stale publication preserves caller");
adapter.forceStalePublish = false;
equal(adapter.stateDigest(), lastGood, "stale save preserves last-good and removes candidate");

adapter.mutateReadBack = true;
const readBackCallerBefore = await snapshotCallerInput(fixtureRecord.document, fixtureRecord.assets);
await expectCode(() => repository.save({
  projectId: "project-fixture",
  title: "Bad readback",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:04.000Z",
  expectedRevision: 2,
  document: fixtureRecord.document,
  assets: fixtureRecord.assets,
}), "candidate_readback_mismatch");
await assertCallerInputUnchanged(fixtureRecord.document, fixtureRecord.assets, readBackCallerBefore, "read-back mismatch preserves caller");
adapter.mutateReadBack = false;
equal(adapter.stateDigest(), lastGood, "readback mismatch preserves last-good");

for (const [stage, code] of [["stage", "transaction_aborted"], ["quota", "quota_exceeded"], ["publish", "transaction_aborted"]] as const) {
  adapter.failStage = stage;
  const failureCallerBefore = await snapshotCallerInput(fixtureRecord.document, fixtureRecord.assets);
  await expectCode(() => repository.save({
    projectId: "project-fixture",
    title: stage,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:05.000Z",
    expectedRevision: 2,
    document: fixtureRecord.document,
    assets: fixtureRecord.assets,
  }), code);
  await assertCallerInputUnchanged(fixtureRecord.document, fixtureRecord.assets, failureCallerBefore, `${stage} preserves caller`);
  equal(adapter.stateDigest(), lastGood, `${stage} preserves all records`);
  adapter.failStage = null;
}

const orphan = clone(fixtureRecord);
orphan.projectId = "orphan";
adapter.versions.set(key("orphan", 1), orphan);
equal(await adapter.cleanupOrphanVersions(), 1);
equal(adapter.versions.has(key("orphan", 1)), false);

let generated = 0;
const copied = await repository.saveAs({
  title: "Copy",
  createdAt: "2026-08-15T00:01:00.000Z",
  updatedAt: "2026-08-15T00:01:00.000Z",
  document: fixtureRecord.document,
  assets: fixtureRecord.assets,
  createProjectId: () => generated++ === 0 ? "project-fixture" : "project-copy",
});
equal(copied.head.projectId, "project-copy");
equal(copied.head.activeStorageRevision, 1);
ok(adapter.heads.has("project-fixture"), "Save As preserves source");
equal(copied.head.documentDigest, adapter.heads.get("project-fixture")!.documentDigest);

const collisionCallerBefore = await snapshotCallerInput(fixtureRecord.document, fixtureRecord.assets);
await expectCode(() => repository.saveAs({
  title: "Collision exhausted",
  createdAt: "2026-08-15T00:01:30.000Z",
  updatedAt: "2026-08-15T00:01:30.000Z",
  document: fixtureRecord.document,
  assets: fixtureRecord.assets,
  createProjectId: () => "project-fixture",
}), "id_collision");
await assertCallerInputUnchanged(fixtureRecord.document, fixtureRecord.assets, collisionCallerBefore, "Save As collision preserves caller");

const renamed = await repository.rename({
  projectId: "project-copy",
  title: "Renamed copy",
  updatedAt: "2026-08-15T00:02:00.000Z",
  expectedRevision: 1,
});
equal(renamed.head.title, "Renamed copy");
equal(renamed.head.activeStorageRevision, 2);
equal(renamed.head.documentDigest, copied.head.documentDigest);

const neighborBeforeDelete = adapter.heads.get("project-fixture");
adapter.previews.set("project-copy", { projectId: "project-copy", marker: "target-preview" });
adapter.previews.set("project-fixture", { projectId: "project-fixture", marker: "neighbor-preview" });
adapter.auxiliary.set("project-copy", { projectId: "project-copy", marker: "target-auxiliary" });
adapter.auxiliary.set("project-fixture", { projectId: "project-fixture", marker: "neighbor-auxiliary" });
const pendingMaintenance = async (): Promise<DrawingProjectLegacyMaintenanceResult> => ({ status: "pending", legacyPresence: "unknown", code: "maintenance_required" });
const pendingRepository = createDrawingProjectV2Repository(adapter, { legacyMaintainer: pendingMaintenance });
const deleted = await pendingRepository.deleteV2({ projectId: "project-copy", expectedRevision: 2, legacyRecordDigest: "1".repeat(64) });
equal(deleted.status, "deleted");
if (deleted.status !== "deleted") assert.fail("Expected committed delete.");
equal(deleted.legacyCleanup, "pending");
equal(adapter.heads.has("project-copy"), false);
equal([...adapter.versions.values()].some((value) => value.projectId === "project-copy"), false);
equal(adapter.tombstones.has("project-copy"), true);
deepEqual(adapter.heads.get("project-fixture"), neighborBeforeDelete, "V2 neighbor preserved");
equal(adapter.previews.has("project-copy"), false);
equal(adapter.auxiliary.has("project-copy"), false);
deepEqual(adapter.previews.get("project-fixture"), { projectId: "project-fixture", marker: "neighbor-preview" });
deepEqual(adapter.auxiliary.get("project-fixture"), { projectId: "project-fixture", marker: "neighbor-auxiliary" });

const legacyCopy = createLegacyProject("project-copy");
const classifiedCopy = await classifyDrawingProjectV1RawRoot(JSON.stringify([legacyCopy]));
if (classifiedCopy.status !== "valid-array") assert.fail("Legacy fixture should classify.");
const catalog = await pendingRepository.loadCatalog(classifiedCopy);
equal(catalog.entries.some((entry) => entry.projectId === "project-copy"), false, "tombstone hides same-ID legacy card");
equal(catalog.entries.some((entry) => entry.projectId === "project-fixture"), true);
adapter.tombstoneReadFailure = true;
await expectCode(() => pendingRepository.loadCatalog(classifiedCopy), "storage_read_failed");
adapter.tombstoneReadFailure = false;

const beforeStaleDelete = adapter.stateDigest();
const staleDelete = await pendingRepository.deleteV2({ projectId: "project-fixture", expectedRevision: 999, legacyRecordDigest: null });
deepEqual(staleDelete, { status: "failed", code: "stale_revision" });
equal(adapter.stateDigest(), beforeStaleDelete);
adapter.failStage = "delete";
const abortedDelete = await pendingRepository.deleteV2({ projectId: "project-fixture", expectedRevision: 2, legacyRecordDigest: null });
deepEqual(abortedDelete, { status: "failed", code: "transaction_aborted" });
equal(adapter.stateDigest(), beforeStaleDelete);
adapter.failStage = null;

for (const code of DRAWING_PROJECT_DELETE_FAILED_CODES) {
  adapter.deleteErrorCode = code;
  const before = adapter.stateDigest();
  const expected = code === "legacy_corrupt" || code === "legacy_read_failed" ? "transaction_aborted" : code;
  deepEqual(
    await pendingRepository.deleteV2({ projectId: "project-fixture", expectedRevision: 2, legacyRecordDigest: null }),
    { status: "failed", code: expected },
    `V2 Delete maps injected ${code} within its exact branch semantics`,
  );
  equal(adapter.stateDigest(), before, `Delete ${code} preserves authoritative state`);
}
for (const [injected, expected] of [
  ["quota_exceeded", "storage_write_failed"],
  ["project_too_large", "transaction_aborted"],
  ["candidate_readback_mismatch", "transaction_aborted"],
] as const) {
  adapter.deleteErrorCode = injected;
  deepEqual(
    await pendingRepository.deleteV2({ projectId: "project-fixture", expectedRevision: 2, legacyRecordDigest: null }),
    { status: "failed", code: expected },
    `Delete normalizes disallowed ${injected}`,
  );
}
adapter.deleteErrorCode = null;

const legacyOnly = createLegacyProject("legacy-only");
const classifiedLegacyOnly = await classifyDrawingProjectV1RawRoot(JSON.stringify([legacyOnly]));
if (classifiedLegacyOnly.status !== "valid-array") assert.fail("Legacy-only fixture should classify.");
const legacyEntry = classifiedLegacyOnly.entries[0];
const legacyBefore = adapter.stateDigest();
deepEqual(await pendingRepository.deleteLegacyOnly({
  classifiedEntry: legacyEntry,
  capturedRootDigest: classifiedLegacyOnly.rootDigest,
  verifyExactTarget: async () => false,
}), { status: "failed", code: "legacy_corrupt" });
equal(adapter.stateDigest(), legacyBefore);
const legacyDeleted = await pendingRepository.deleteLegacyOnly({
  classifiedEntry: legacyEntry,
  capturedRootDigest: classifiedLegacyOnly.rootDigest,
  verifyExactTarget: async () => true,
});
equal(legacyDeleted.status, "deleted");
equal(adapter.tombstones.has("legacy-only"), true);

const cleanAdapter = new MemoryIndexedAdapter();
const cleanRecord = await createVersionRecord("clean-delete", 1);
const cleanRepositoryBase = createDrawingProjectV2Repository(cleanAdapter);
await cleanRepositoryBase.save({
  projectId: "clean-delete",
  title: "Clean",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  expectedRevision: null,
  document: cleanRecord.document,
  assets: cleanRecord.assets,
});
const cleanedRepository = createDrawingProjectV2Repository(cleanAdapter, {
  legacyMaintainer: async () => ({ status: "cleaned", legacyPresence: "absent" }),
});
const cleanDelete = await cleanedRepository.deleteV2({ projectId: "clean-delete", expectedRevision: 1, legacyRecordDigest: "2".repeat(64) });
equal(cleanDelete.status, "deleted");
if (cleanDelete.status !== "deleted") assert.fail("Expected clean delete.");
equal(cleanDelete.legacyCleanup, "cleaned");
equal(cleanAdapter.tombstones.size, 0, "successful cleanup removes tombstone in separate transaction");

const notNeededAdapter = new MemoryIndexedAdapter();
const notNeededRecord = await createVersionRecord("not-needed-delete", 1);
await createDrawingProjectV2Repository(notNeededAdapter).save({
  projectId: "not-needed-delete", title: "Not needed", createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z", expectedRevision: null,
  document: notNeededRecord.document, assets: notNeededRecord.assets,
});
const notNeededDelete = await createDrawingProjectV2Repository(notNeededAdapter, {
  legacyMaintainer: async () => ({ status: "not-needed", legacyPresence: "absent" }),
}).deleteV2({ projectId: "not-needed-delete", expectedRevision: 1, legacyRecordDigest: "3".repeat(64) });
equal(notNeededDelete.status, "deleted");
if (notNeededDelete.status !== "deleted") assert.fail("Expected not-needed delete.");
equal(notNeededDelete.legacyCleanup, "not-needed");
equal(notNeededAdapter.tombstones.size, 0);

const throwingMaintenanceAdapter = new MemoryIndexedAdapter();
const throwingMaintenanceRecord = await createVersionRecord("throwing-maintenance", 1);
await createDrawingProjectV2Repository(throwingMaintenanceAdapter).save({
  projectId: "throwing-maintenance", title: "Throwing maintenance", createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z", expectedRevision: null,
  document: throwingMaintenanceRecord.document, assets: throwingMaintenanceRecord.assets,
});
const throwingMaintenanceDelete = await createDrawingProjectV2Repository(throwingMaintenanceAdapter, {
  legacyMaintainer: async () => { throw new Error("post-commit maintenance failed"); },
}).deleteV2({ projectId: "throwing-maintenance", expectedRevision: 1, legacyRecordDigest: "5".repeat(64) });
equal(throwingMaintenanceDelete.status, "deleted", "post-commit maintenance exception cannot retract Delete");
if (throwingMaintenanceDelete.status !== "deleted") assert.fail("Expected committed Delete.");
equal(throwingMaintenanceDelete.legacyCleanup, "pending");
equal(throwingMaintenanceAdapter.heads.has("throwing-maintenance"), false);
equal(throwingMaintenanceAdapter.tombstones.has("throwing-maintenance"), true);

const removalFailureAdapter = new MemoryIndexedAdapter();
const removalFailureRecord = await createVersionRecord("removal-failure", 1);
await createDrawingProjectV2Repository(removalFailureAdapter).save({
  projectId: "removal-failure", title: "Removal failure", createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z", expectedRevision: null,
  document: removalFailureRecord.document, assets: removalFailureRecord.assets,
});
removalFailureAdapter.failStage = "remove-tombstone";
const removalFailure = await createDrawingProjectV2Repository(removalFailureAdapter, {
  legacyMaintainer: async () => ({ status: "cleaned", legacyPresence: "absent" }),
}).deleteV2({ projectId: "removal-failure", expectedRevision: 1, legacyRecordDigest: "4".repeat(64) });
equal(removalFailure.status, "deleted");
if (removalFailure.status !== "deleted") assert.fail("Expected committed delete with pending removal.");
equal(removalFailure.legacyCleanup, "pending");
equal(removalFailureAdapter.tombstones.has("removal-failure"), true);

const reservedAdapter = new MemoryIndexedAdapter();
reservedAdapter.tombstones.set("reserved-id", { kind: "diamond-drawing-legacy-delete-tombstone", schemaVersion: 1, projectId: "reserved-id", legacyRecordDigest: null });
const reservedRepository = createDrawingProjectV2Repository(reservedAdapter);
const reservedRecord = await createVersionRecord("reserved-id", 1);
await expectCode(() => reservedRepository.save({
  projectId: "reserved-id", title: "Reserved", createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z", expectedRevision: null,
  document: reservedRecord.document, assets: reservedRecord.assets,
}), "maintenance_required");
equal(reservedAdapter.heads.size, 0);
equal(reservedAdapter.versions.size, 0);
let reservedIdAttempt = 0;
const collisionSafe = await reservedRepository.saveAs({
  title: "Collision safe", createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
  document: reservedRecord.document, assets: reservedRecord.assets,
  createProjectId: () => reservedIdAttempt++ === 0 ? "reserved-id" : "fresh-id",
});
equal(collisionSafe.head.projectId, "fresh-id");

const legacyFailureAdapter = new MemoryIndexedAdapter();
legacyFailureAdapter.failStage = "legacy-tombstone";
const legacyFailureRepository = createDrawingProjectV2Repository(legacyFailureAdapter, { legacyMaintainer: pendingMaintenance });
const legacyFailureBefore = legacyFailureAdapter.stateDigest();
const legacyFailure = await legacyFailureRepository.deleteLegacyOnly({
  classifiedEntry: legacyEntry,
  capturedRootDigest: classifiedLegacyOnly.rootDigest,
  verifyExactTarget: async () => true,
});
deepEqual(legacyFailure, { status: "failed", code: "transaction_aborted" });
equal(legacyFailureAdapter.stateDigest(), legacyFailureBefore);

const maintenanceAdapter = new MemoryIndexedAdapter();
for (let index = 9; index >= 0; index -= 1) maintenanceAdapter.tombstones.set(`pending-${index}`, {
  kind: "diamond-drawing-legacy-delete-tombstone",
  schemaVersion: 1,
  projectId: `pending-${index}`,
  legacyRecordDigest: `${index}`.repeat(64),
});
const maintenanceCalls: string[] = [];
const maintenanceRepository = createDrawingProjectV2Repository(maintenanceAdapter, {
  legacyMaintainer: async (projectId) => {
    maintenanceCalls.push(projectId);
    return { status: "pending", legacyPresence: "present", code: "maintenance_required" };
  },
});
const maintenanceLegacy = await classifyDrawingProjectV1RawRoot(JSON.stringify(Array.from({ length: 10 }, (_, index) => createLegacyProject(`pending-${index}`))));
await maintenanceRepository.runBoundedMaintenance(maintenanceLegacy);
deepEqual(maintenanceCalls, ["pending-0", "pending-1", "pending-2", "pending-3", "pending-4", "pending-5", "pending-6", "pending-7"]);
equal(new Set(maintenanceCalls).size, 8);

console.log(`SPEC-0002 V2 repository validator passed. ASSERTIONS: ${assertions}`);
