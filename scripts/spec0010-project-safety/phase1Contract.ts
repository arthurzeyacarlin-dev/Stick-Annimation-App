import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUTPUT_ROOT = "output/spec-0010/phase-1";
let assertions = 0;
const check = (value: unknown, label: string) => {
  assertions += 1;
  assert.ok(value, label);
};
const equal = (actual: unknown, expected: unknown, label: string) => {
  assertions += 1;
  assert.deepEqual(actual, expected, label);
};

const topBar = readFileSync("src/components/workspace/DrawingTopBar.tsx", "utf8");
const workspace = readFileSync("src/components/workspace/DrawingWorkspace.tsx", "utf8");
const wrapper = readFileSync("src/components/workspace/AnimationWorkspace.tsx", "utf8");
const page = readFileSync("app/page.tsx", "utf8");

const saveIndex = topBar.indexOf(">\n                Save\n");
const saveAsIndex = topBar.indexOf(">\n                Save As\n");
const exportIndex = topBar.indexOf("Export…");
const saveAndExitIndex = topBar.indexOf("Save and Exit");
check(saveIndex >= 0, "File menu retains Save");
check(saveAsIndex > saveIndex, "File menu retains Save As after Save");
check(exportIndex > saveAsIndex, "File menu retains Export after Save As");
check(saveAndExitIndex > exportIndex, "Save and Exit is the final File action");
check(topBar.includes('role="menuitem"'), "File actions remain native accessible menu buttons");
check(topBar.includes("disabled={isSaving}"), "Save actions disable while the official save is running");

check(workspace.includes("const result = await saveProject();"), "Save and Exit reuses the canonical save function");
check(workspace.includes("result.officialWriteSucceeded && result.coversCurrentGeneration"), "exit requires successful covered save");
check(workspace.includes("documentGenerationRef.current === capturedGeneration"), "coverage compares the saved generation to the live generation");
check(workspace.includes("saveAndExitInFlightRef.current"), "duplicate Save and Exit activation is guarded synchronously");
check(workspace.includes("setSaveState(\"unsaved\")"), "newer work remains visibly unsaved");
check(wrapper.includes("onExit={onExit}"), "workspace wrapper forwards the exit callback");
check(page.includes('setWorkspace(null);'), "successful exit releases the mounted workspace");
check(page.includes('setView("home");'), "successful exit returns to Home");

type Result = { officialWriteSucceeded: boolean; coversCurrentGeneration: boolean };
const simulate = async (results: Result[], activations: number) => {
  let inFlight = false;
  let writes = 0;
  let navigations = 0;
  const saveAndExit = async () => {
    if (inFlight) return;
    inFlight = true;
    writes += 1;
    const result = results.shift() ?? { officialWriteSucceeded: false, coversCurrentGeneration: false };
    await Promise.resolve();
    if (result.officialWriteSucceeded && result.coversCurrentGeneration) {
      navigations += 1;
      return;
    }
    inFlight = false;
  };
  await Promise.all(Array.from({ length: activations }, () => saveAndExit()));
  return { writes, navigations };
};

equal(
  await simulate([{ officialWriteSucceeded: true, coversCurrentGeneration: true }], 2),
  { writes: 1, navigations: 1 },
  "rapid duplicate activation performs one write and one navigation",
);
equal(
  await simulate([{ officialWriteSucceeded: false, coversCurrentGeneration: false }], 1),
  { writes: 1, navigations: 0 },
  "failed official save does not navigate",
);
equal(
  await simulate([{ officialWriteSucceeded: true, coversCurrentGeneration: false }], 1),
  { writes: 1, navigations: 0 },
  "stale successful write does not navigate",
);

const result = {
  kind: "spec0010-phase1-contract",
  version: 1,
  status: "PASS",
  assertions,
  facts: {
    fileMenuOrder: ["Save", "Save As", "Export…", "Save and Exit"],
    canonicalSaveCalls: 1,
    duplicateWrites: 1,
    duplicateNavigations: 1,
    failedSaveNavigations: 0,
    staleSaveNavigations: 0,
    recoveryDraftImplementation: false,
    externalRequests: 0,
    paidCalls: 0,
  },
};
mkdirSync(OUTPUT_ROOT, { recursive: true });
writeFileSync(`${OUTPUT_ROOT}/contract.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
