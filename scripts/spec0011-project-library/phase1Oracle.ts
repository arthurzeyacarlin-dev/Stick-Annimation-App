import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ProjectSource, ProjectSourceReader } from "../../src/lib/animation/unifiedProjectSourceReader.ts";
import type { ProjectCollectionEntry } from "../../src/lib/animation/unifiedProjectCollection.ts";
import { createProjectLibraryController } from "../../src/lib/project-library/projectLibraryController.ts";
import {
  formatProjectDuration,
  projectClassificationLabel,
  projectFailureMessage,
  resolveCanonicalPosterFrameIndex,
  type ProjectLibrarySnapshot,
} from "../../src/lib/project-library/projectLibraryModel.ts";
import { createPhase1LegacyFixtureTransport } from "./phase1Fixtures.ts";
import { memorySourceReader } from "../spec0006-unified/phase2FixtureFactory.ts";

let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const fixtures = await createPhase1LegacyFixtureTransport();
const baseReader = memorySourceReader(fixtures.sources);
const unifiedSource: ProjectSource = {
  locator: "unified-v1:0",
  sourceKind: "unified-v1",
  sourceId: fixtures.unified.project.projectId,
  title: fixtures.unified.project.title,
  updatedAt: fixtures.unified.project.updatedAt,
  read: async () => ({
    sourceKind: "unified-v1",
    candidate: {
      project: structuredClone(fixtures.unified.project),
      resolvedAssets: fixtures.unified.resolvedAssets.map(asset => ({
        assetId: asset.assetId,
        bytes: Uint8Array.from(Buffer.from(asset.bytesBase64, "base64")),
      })),
    },
  }),
};
const reader: ProjectSourceReader = {
  list: async () => [...await baseReader.list(), unifiedSource],
};
const before = digest(fixtures.transport);
const controller = createProjectLibraryController(() => reader);
const entries = await controller.list();

equal(entries.length, 5, "all supported read-only legacy fixture sources remain listed once");
equal(new Set(entries.map(entry => entry.sourceKind)), new Set(["drawing-v1", "drawing-v2", "stick-v1", "stick-v2", "unified-v1"]), "all supported legacy source kinds are present");
for (const entry of entries) {
  equal(entry.classification, "legacy", `${entry.sourceKind} is truthfully classified as legacy`);
  equal(projectClassificationLabel(entry), "Protected legacy source", `${entry.sourceKind} receives the protected legacy label`);
  check(Boolean(entry.sourceId && entry.locator && entry.candidateDigest && entry.sourceDigest), `${entry.sourceKind} retains stable source identity and digests`);
}

const snapshots: Array<{ entry: ProjectCollectionEntry; project: ProjectLibrarySnapshot }> = [];
const nodeEvaluableEntries = entries.filter(entry => entry.sourceKind === "drawing-v1" || entry.sourceKind === "unified-v1");
await controller.evaluateVisibleQueue(nodeEvaluableEntries, (entry, result) => {
  if ("error" in result) throw result.error;
  snapshots.push({ entry, project: result.project });
});
equal(snapshots.length, nodeEvaluableEntries.length, "bounded queue evaluates every DOM-independent valid entry");
for (const { entry, project } of snapshots) {
  equal(project.snapshot.entry.locator, entry.locator, `${entry.sourceKind} snapshot stays bound to its exact locator`);
  equal(project.snapshot.durationSeconds, project.snapshot.frameCount / project.snapshot.project.document.fps, `${entry.sourceKind} duration is exact frameCount / FPS`);
  equal(project.posterFrameIndex, resolveCanonicalPosterFrameIndex(project.snapshot), `${entry.sourceKind} poster frame is deterministic`);
  check(project.snapshot.project.document.logicalStage.width > 0 && project.snapshot.project.document.logicalStage.height > 0, `${entry.sourceKind} exposes validated logical stage dimensions`);
}

let activeLists = 0;
let maximumActiveLists = 0;
const delayedReader: ProjectSourceReader = {
  list: async () => {
    activeLists += 1;
    maximumActiveLists = Math.max(maximumActiveLists, activeLists);
    await new Promise(resolve => setTimeout(resolve, 20));
    activeLists -= 1;
    return reader.list();
  },
};
const delayedController = createProjectLibraryController(() => delayedReader);
let settled = 0;
await delayedController.evaluateVisibleQueue(
  Array.from({ length: 12 }, (_, index) => nodeEvaluableEntries[index % nodeEvaluableEntries.length]),
  (_entry, result) => {
    if ("error" in result) throw result.error;
    settled += 1;
  },
);
equal(settled, 12, "queue settles all requested evaluations");
equal(maximumActiveLists, 4, "snapshot evaluation concurrency never exceeds four");

equal(formatProjectDuration(0), "0:00", "zero duration is shown as m:ss");
equal(formatProjectDuration(65.9), "1:05", "minute duration is shown as m:ss");
equal(formatProjectDuration(3_661.2), "1:01:01", "long duration is shown as h:mm:ss");
equal(projectFailureMessage(new Error("source_changed")).message, "Project changed or was deleted. Refresh and try again.", "source changes remain explicit and retryable");
check(projectFailureMessage(new Error("asset_missing")).message.includes("corrupt"), "missing assets remain truthfully visible as corrupt");
check(projectFailureMessage(new Error("duplicate_identity")).message.includes("Conflicting"), "identity conflicts remain truthfully visible");
equal(digest(fixtures.transport), before, "listing and evaluation do not mutate legacy fixture bytes");

console.log(JSON.stringify({ status: "PASS", assertions, entries: entries.length, maximumConcurrentEvaluations: maximumActiveLists }));
