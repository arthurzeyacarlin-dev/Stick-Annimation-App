import assert from "node:assert/strict";
import { createNativeUnifiedProjectV2 } from "../../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";
import { createUnifiedProjectRepositoryV2 } from "../../../src/lib/animation/unifiedProjectRepositoryV2.ts";
import { packAccountProject, unpackAccountProject } from "../../../src/lib/account/projectBundle.ts";
import { createAccountProjectSourceReader } from "../../../src/lib/account/projectClient.ts";
import { digestUnifiedProjectV2 } from "../../../src/lib/animation/unifiedProjectStorageV2.ts";

const base = createNativeUnifiedProjectV2("2026-09-29T00:00:00.000Z");
const secondCellId = crypto.randomUUID();
base.document.layers[0].cells.push({
  cellId: secondCellId, cellType: "keyframe", ownerCellId: secondCellId,
  content: { items: [], soundAttachment: null },
});
base.document.reopenState.currentFrameIndex = 1;

const records = new Map();
let writes = 0;
const storage = {
  async read(projectId) {
    const value = records.get(projectId);
    if (!value) throw new Error("not_found");
    return structuredClone(value);
  },
  async write(candidate, expectedRevision) {
    const current = records.get(candidate.projectId);
    if (expectedRevision === null ? Boolean(current) : !current || current.revision !== expectedRevision) {
      throw new Error("stale_revision");
    }
    const { body, version } = await packAccountProject(candidate);
    const unpacked = await unpackAccountProject(new Uint8Array(await body.arrayBuffer()));
    assert.equal(unpacked.version.projectDigest, version.projectDigest);
    assert.equal(await digestUnifiedProjectV2(unpacked.project), version.projectDigest);
    records.set(candidate.projectId, unpacked.project);
    writes += 1;
    return structuredClone(unpacked.project);
  },
  async deleteProject(projectId, revision, expectedDigest) {
    const current = records.get(projectId);
    if (!current || current.revision !== revision || await digestUnifiedProjectV2(current) !== expectedDigest) {
      throw new Error("stale_revision");
    }
    records.delete(projectId);
    return { projectId, deletedAssetIds: [] };
  },
};
const repository = createUnifiedProjectRepositoryV2({ storage });
const first = await repository.save(base);
assert.equal(first.revision, 1);
assert.equal(first.document.layers[0].cells.length, 2);
const edited = structuredClone(first);
edited.document.layers[0].cells[1].content.items.push({
  itemId: crypto.randomUUID(), kind: "drawing-text/v1", text: "second frame", x: 20, y: 20,
  color: "#000000", fontSize: 24, rotation: 0, width: 300, flipX: false, flipY: false,
  fontFamily: "Arial", bold: false, italic: false,
});
const second = await repository.save(edited);
assert.equal(second.revision, 2);
assert.equal((await repository.open(second.projectId)).document.layers[0].cells[1].content.items[0].text, "second frame");
await assert.rejects(repository.save(first), { message: "stale_revision" });
assert.equal((await repository.open(second.projectId)).revision, 2);
const copy = await repository.saveAs(second, "Separate account copy");
assert.notEqual(copy.projectId, second.projectId);
assert.equal(copy.revision, 1);
const renamed = await repository.rename(copy.projectId, copy.revision, await digestUnifiedProjectV2(copy), "Renamed copy");
assert.equal(renamed.title, "Renamed copy");
await repository.deleteProject(renamed.projectId, renamed.revision, await digestUnifiedProjectV2(renamed));
assert.equal(records.has(renamed.projectId), false);
assert.equal((await repository.open(second.projectId)).revision, 2);

// PostgREST serializes timestamptz with +00:00, while the bundled project
// retains the authored Z suffix. Listing must normalize them before the
// library's exact source/updatedAt check.
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
try {
  globalThis.window = globalThis;
  globalThis.fetch = async () => Response.json({ projects: [{
    projectId: second.projectId, title: second.title,
    updatedAt: second.updatedAt.replace(/Z$/, "+00:00"),
    activeRevision: second.revision, projectDigest: await digestUnifiedProjectV2(second),
  }] });
  const listed = await createAccountProjectSourceReader("owner-A").list();
  assert.equal(listed[0].updatedAt, second.updatedAt);
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

process.stdout.write(JSON.stringify({
  firstSave: true, editedMultiFrameSave: true, reopen: true, staleWritePreservedHead: true,
  saveAs: true, rename: true, delete: true, accountTimestampNormalized: true, writes,
}) + "\n");
