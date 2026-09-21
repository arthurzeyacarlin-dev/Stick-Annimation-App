import assert from "node:assert/strict";
import type { ProjectCollectionEntry } from "../../src/lib/animation/unifiedProjectCollection.ts";
import { createUnifiedProjectRepositoryV2 } from "../../src/lib/animation/unifiedProjectRepositoryV2.ts";
import { createUnifiedProjectStorageV2, digestUnifiedProjectV2 } from "../../src/lib/animation/unifiedProjectStorageV2.ts";
import { normalizeProjectManagementTitleV2 } from "../../src/lib/animation/unifiedProjectManagementV2.ts";
import { filterAndSortProjectEntries } from "../../src/lib/project-library/projectLibraryModel.ts";
import { createPhase6Project, Phase6MemoryStorageAdapter } from "../spec0006-unified/phase6FixtureFactory.ts";

let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions += 1; };
const check = (value: unknown, label: string) => { assert.ok(value, label); assertions += 1; };
const rejects = async (run: () => Promise<unknown>, code: string) => { await assert.rejects(run, { message: code }); assertions += 1; };
const throws = (run: () => unknown, code: string) => { assert.throws(run, { message: code }); assertions += 1; };

const entry = (id: string, title: string, updatedAt: string | null): ProjectCollectionEntry => ({
  id,
  locator: id,
  title,
  updatedAt,
  classification: id.startsWith("invalid") ? "invalid" : "canonical",
  sourceKind: "unified-v2",
  sourceId: id,
  sourceDigest: id.padEnd(64, "0").slice(0, 64),
  candidateDigest: id.padEnd(64, "0").slice(0, 64),
  sourceRevision: 1,
  error: id.startsWith("invalid") ? "invalid_record" : null,
  protectedSource: false,
  provenanceKey: null,
});

const entries = [
  entry("project-b", "Zulu", "2026-09-20T10:00:00.000Z"),
  entry("project-a", "Cafe\u0301", "2026-09-21T10:00:00.000Z"),
  entry("project-c", "alpha", "not-a-date"),
  entry("invalid-d", "Damaged alpha", null),
];

equal(filterAndSortProjectEntries(entries, "CAFÉ", "name-asc").map(value => value.id), ["project-a"], "search is NFC and case insensitive");
equal(filterAndSortProjectEntries(entries, "alpha", "name-asc").map(value => value.id), ["project-c", "invalid-d"], "matching invalid entries remain visible");
equal(filterAndSortProjectEntries(entries, "", "updated-desc").map(value => value.id), ["project-a", "project-b", "invalid-d", "project-c"], "newest sort keeps invalid dates last with stable identity ties");
equal(filterAndSortProjectEntries(entries, "", "updated-asc").map(value => value.id), ["project-b", "project-a", "invalid-d", "project-c"], "oldest sort keeps invalid dates last");
equal(filterAndSortProjectEntries(entries, "", "name-asc").map(value => value.title), ["alpha", "Cafe\u0301", "Damaged alpha", "Zulu"], "name A to Z is locale aware");
equal(filterAndSortProjectEntries(entries, "", "name-desc").map(value => value.title), ["Zulu", "Damaged alpha", "Cafe\u0301", "alpha"], "name Z to A is locale aware");

equal(normalizeProjectManagementTitleV2("  Cafe\u0301  "), "Café", "title is NFC normalized and Unicode-trimmed");
equal(normalizeProjectManagementTitleV2("Same visible title"), "Same visible title", "duplicate visible titles are valid");
throws(() => normalizeProjectManagementTitleV2(""), "invalid_title_length");
throws(() => normalizeProjectManagementTitleV2("line\nbreak"), "invalid_title");
throws(() => normalizeProjectManagementTitleV2("hidden\u202Ename"), "invalid_title");
throws(() => normalizeProjectManagementTitleV2("bad\ud800"), "invalid_title");
throws(() => normalizeProjectManagementTitleV2("x".repeat(513)), "invalid_title_length");

class Phase3MemoryAdapter extends Phase6MemoryStorageAdapter {
  async deleteProject(input: { projectId: string; expectedRevision: number; expectedDigest: string }) {
    const head = this.heads.get(input.projectId);
    if (!head) throw new Error("source_changed");
    if (head.activeRevision !== input.expectedRevision || head.projectDigest !== input.expectedDigest) throw new Error("stale_revision");
    this.heads.delete(input.projectId);
    for (const [key, version] of this.versions) if (version.projectId === input.projectId) this.versions.delete(key);
    const remainingVersions = [...this.versions.values()].map(value => structuredClone(value));
    const referenced = new Set(remainingVersions.flatMap(version => version.assetIds));
    const deletedAssetIds: string[] = [];
    for (const assetId of this.assets.keys()) {
      if (!referenced.has(assetId)) { this.assets.delete(assetId); deletedAssetIds.push(assetId); }
    }
    return { deletedAssetIds: deletedAssetIds.sort(), remainingVersions };
  }
}

const adapter = new Phase3MemoryAdapter();
const storage = createUnifiedProjectStorageV2(adapter);
const ids = ["82f4deaf-f75d-40da-a513-b77454bb45c1"];
let tick = 0;
const repository = createUnifiedProjectRepositoryV2({
  storage,
  createId: () => ids.shift() ?? crypto.randomUUID(),
  now: () => `2026-09-21T12:00:0${tick++}.000Z`,
});
const seed = await createPhase6Project();
const saved = await repository.save(seed);
const savedDigest = await digestUnifiedProjectV2(saved);
const beforeRename = structuredClone(saved);
const renamed = await repository.rename(saved.projectId, saved.revision, savedDigest, "Renamed safely");
equal(renamed.projectId, beforeRename.projectId, "rename preserves project ID");
equal(renamed.revision, beforeRename.revision + 1, "rename publishes exactly one next revision");
equal(renamed.title, "Renamed safely", "rename updates title");
const comparableBefore = structuredClone(beforeRename) as Record<string, unknown>;
const comparableAfter = structuredClone(renamed) as Record<string, unknown>;
for (const key of ["title", "updatedAt", "revision"]) { delete comparableBefore[key]; delete comparableAfter[key]; }
equal(comparableAfter, comparableBefore, "rename preserves authoring content, identity, provenance, createdAt, and auxiliary state");
await rejects(() => repository.rename(saved.projectId, saved.revision, savedDigest, "Stale rename"), "stale_revision");
await rejects(() => repository.save(beforeRename), "stale_revision");
await rejects(() => repository.deleteProject(saved.projectId, saved.revision, savedDigest), "stale_revision");

const duplicate = await repository.saveAs(renamed, "Independent copy");
check(duplicate.projectId !== renamed.projectId, "duplicate gets a new project ID");
equal(duplicate.revision, 1, "duplicate starts at revision one");
equal(duplicate.provenance?.kind, "copy", "duplicate records copy provenance");
equal(duplicate.provenance?.kind === "copy" ? duplicate.provenance.parentProjectId : null, renamed.projectId, "copy provenance binds parent ID");
const sharedAssets = [...adapter.versions.values()].filter(version => [renamed.projectId, duplicate.projectId].includes(version.projectId)).flatMap(version => version.assetIds);
check(new Set(sharedAssets).size < sharedAssets.length, "native source and duplicate physically share content-addressed assets");

const renamedDigest = await digestUnifiedProjectV2(renamed);
await repository.deleteProject(renamed.projectId, renamed.revision, renamedDigest);
await rejects(() => storage.read(renamed.projectId), "source_changed");
equal((await storage.read(duplicate.projectId)).title, "Independent copy", "deleting source retains and hydrates the independent copy");
for (const assetId of new Set([...adapter.versions.values()].flatMap(version => version.assetIds))) check(adapter.assets.has(assetId), `shared asset ${assetId} remains`);

console.log(JSON.stringify({
  kind: "spec0011-phase3-oracle",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    searchAndSortChoices: 4,
    renameRevision: renamed.revision,
    duplicateRevision: duplicate.revision,
    sharedAssetReferences: sharedAssets.length,
    remainingProjects: adapter.heads.size,
  },
}));
