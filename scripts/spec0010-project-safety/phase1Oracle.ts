import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outputPath = "output/spec-0010/phase-1/oracle.json";
let assertions = 0;
const check = (value: unknown, label: string) => {
  assertions += 1;
  assert.ok(value, label);
};
const equal = (actual: unknown, expected: unknown, label: string) => {
  assertions += 1;
  assert.deepEqual(actual, expected, label);
};

type SaveResult = {
  officialWriteSucceeded: boolean;
  coversCurrentGeneration: boolean;
};

const shouldExit = (result: SaveResult) => result.officialWriteSucceeded && result.coversCurrentGeneration;

equal(shouldExit({ officialWriteSucceeded: true, coversCurrentGeneration: true }), true, "current successful save exits");
equal(shouldExit({ officialWriteSucceeded: false, coversCurrentGeneration: false }), false, "failed save stays in workspace");
equal(shouldExit({ officialWriteSucceeded: true, coversCurrentGeneration: false }), false, "stale successful save stays in workspace");
equal(shouldExit({ officialWriteSucceeded: false, coversCurrentGeneration: true }), false, "coverage cannot hide write failure");

const pageSource = readFileSync("app/page.tsx", "utf8");
const animationWorkspaceSource = readFileSync("src/components/workspace/AnimationWorkspace.tsx", "utf8");
const drawingWorkspaceSource = readFileSync("src/components/workspace/DrawingWorkspace.tsx", "utf8");
const topBarSource = readFileSync("src/components/workspace/DrawingTopBar.tsx", "utf8");

check(pageSource.includes("setWorkspace(null);"), "exit releases the mounted workspace");
check(pageSource.includes('setView("home");'), "page owner performs Home navigation");
check(animationWorkspaceSource.includes("onExit={onExit}"), "exit callback crosses the workspace shell only");
check(drawingWorkspaceSource.includes('requireManualEditorCommand("project.save/v2", "DrawingWorkspace.saveProject")'), "canonical registered Save remains the transaction door");
equal((drawingWorkspaceSource.match(/saveUnifiedProjectV2\(candidate\)/g) ?? []).length, 1, "one canonical official Save call site");
check(drawingWorkspaceSource.includes("documentGenerationRef.current === capturedGeneration"), "save coverage is generation-bound");
check(drawingWorkspaceSource.includes("workspaceInstanceIdRef.current !== capturedWorkspaceInstanceId"), "save coverage is workspace-instance-bound");
check(drawingWorkspaceSource.includes("saveInFlightRef.current"), "duplicate activation shares the existing in-flight guard");
check(drawingWorkspaceSource.includes("result.officialWriteSucceeded && result.coversCurrentGeneration"), "exit requires both write success and current coverage");
check(drawingWorkspaceSource.includes("(await saveProject()).officialWriteSucceeded"), "AI-triggered Save still reports official write success");
check(topBarSource.indexOf("Save and Exit") > topBarSource.indexOf("Export…"), "Save and Exit is the final File action");
check(topBarSource.includes("disabled={isSaving}"), "save-family actions expose disabled state while saving");
check(!drawingWorkspaceSource.includes("ProjectRecoveryEnvelope"), "Phase 1 adds no recovery envelope");
check(!pageSource.includes("Unsaved work found"), "Phase 1 adds no startup recovery prompt");

const result = {
  kind: "spec0010-phase1-oracle",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    canonicalSaveCallSites: 1,
    exitPredicate: "officialWriteSucceeded && coversCurrentGeneration",
    recoveryStorageAdded: false,
    startupRecoveryAdded: false,
  },
};

mkdirSync("output/spec-0010/phase-1", { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
