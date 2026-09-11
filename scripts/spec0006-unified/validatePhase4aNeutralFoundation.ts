import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertUnifiedAnimationProjectV2 } from "../../src/lib/animation/unifiedAnimationContractV2.ts";
import { createUnifiedWorkspaceRootV2, addOrReplaceItem, undoUnified, redoUnified } from "../../src/lib/animation/unifiedTimelineReducer.ts";
import { createPhase4aNeutralFixture } from "./phase4aNeutralFixtureFactory.ts";
import { assertNeutralOwnerOracle } from "./phase4aNeutralOracle.ts";

const cases = JSON.parse(readFileSync("scripts/fixtures/spec0006-unified/v2/phase4a-neutral-storage-cases.json", "utf8"));
let assertions = 0;
for (let index = 0; index < cases.validCaseCount; index += 1) {
  const project = createPhase4aNeutralFixture();
  project.document.fps = 1 + (index % 55);
  assertUnifiedAnimationProjectV2(project); assertions += 1;
  assertNeutralOwnerOracle(project); assertions += 3;
}
for (let index = 0; index < cases.invalidCaseCount; index += 1) {
  const project = createPhase4aNeutralFixture();
  project.document.fps = index % 2 ? 0 : 56;
  assert.throws(() => assertUnifiedAnimationProjectV2(project)); assertions += 1;
}
const fixture = createPhase4aNeutralFixture();
let root = createUnifiedWorkspaceRootV2(fixture.document);
const layerId = root.document.layers[0].layerId;
const replacement = structuredClone(root.document.layers[0].cells[0].content!.items[2]);
replacement.itemId = root.document.layers[0].cells[0].content!.items[2].itemId;
root = addOrReplaceItem(root, layerId, 0, replacement); assertions += 1;
const undone = undoUnified(root); assertions += 1;
const redone = redoUnified(undone); assertions += 1;
assert.deepEqual(redone.document, root.document); assertions += 1;
console.log(JSON.stringify({ status: "PASS", assertions, validCases: cases.validCaseCount, invalidCases: cases.invalidCaseCount, itemKinds: cases.requiredItemKinds }));
