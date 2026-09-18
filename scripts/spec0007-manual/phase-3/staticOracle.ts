import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const output = "output/spec-0007/phase-3";
mkdirSync(`${output}/receipts`, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const source = (path: string) => readFileSync(path, "utf8");

const rightPanel = source("src/components/workspace/DrawingRightPanel.tsx");
const workspace = source("src/components/workspace/DrawingWorkspace.tsx");
const animation = source("src/components/workspace/AnimationWorkspace.tsx");
const bootstrap = source("src/lib/animation/unifiedWorkspaceBootstrap.ts");
const migration = source("src/lib/animation/legacyRigRetirementV3.ts");
const contract = source("src/lib/animation/unifiedAnimationContractV2.ts");
const storage = source("src/lib/animation/unifiedProjectStorageV2.ts");

for (const label of ["Stick Figure Tools", "Rig Tools", "Add Limb", "Select / Move Joint", "Stick Figure Creator", "Rig Builder"]) {
  check(!rightPanel.includes(label), `right panel retires ${label}`);
}
equal(workspace.includes("StickFigureCreatorWorkspace"), false, "ordinary workspace does not import or mount Creator");
equal(workspace.includes('kind: "stick-rig/v1"'), false, "ordinary Save cannot create a rig item");
check(workspace.includes("stickByCell: {}"), "ordinary Save clears retired compatibility data");
equal(animation.includes('item.kind === "stick-rig/v1"'), false, "ordinary mount projection does not hydrate rig items");
check(bootstrap.match(/retireLegacyRigsV3/g)?.length === 3, "bootstrap imports migration and invokes it for native plus legacy paths");
check(migration.includes("assertStructuredSymbolDigestsV2"), "migration validates symbol payload digests before conversion");
check(migration.includes("assertDrawingOnlyUnifiedProjectV2"), "migration rejects partial retirement");
check(migration.includes("if (!hasRetiredContent(project)) return project"), "no-rig projects use exact unchanged fast path");
check(migration.includes("sourceCategory: definition.sourceCategory === \"Stick Figure Symbol\" ? \"Drawing Symbol\" : \"Mixed Symbol\""), "rig and mixed symbol categories retire correctly");
check(migration.includes("candidate.compatibility.stickByCell = {}"), "compatibility rig map is cleared");
check(migration.includes("convertedOwnerCellIds") && migration.includes("outputContentDigest") && migration.includes("recovery"), "versioned receipt binds conversion and recovery");
check(contract.includes("assertDrawingOnlyUnifiedProjectV2"), "post-migration contract prohibits active rig content");
check(storage.includes("legacyRecovery.version") && storage.includes("immutable version and its assets remain addressable"), "first save preserves exact direct-record predecessor");

const protectedPaths = [
  "src/lib/animation/editorCommands/drawRigCorridor.ts",
  "src/lib/animation/editorCommands/rasterGesture.ts",
  "src/components/workspace/DrawingToolBar.tsx",
  "src/components/workspace/DrawingTimelineRow.tsx",
];
for (const path of protectedPaths) {
  const changed = execFileSync("git", ["diff", "--name-only", "HEAD", "--", path], { encoding: "utf8" }).trim();
  equal(changed, "", `${path} is byte-unchanged`);
}

const result = { status: "PASS", assertions, protectedPaths };
writeFileSync(`${output}/receipts/static-oracle.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
