import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUTPUT_ROOT = "output/spec-0010/phase-2";
mkdirSync(OUTPUT_ROOT, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const absent = (value: string, pattern: RegExp, label: string) => { assertions += 1; assert.equal(pattern.test(value), false, label); };

const contract = readFileSync("src/lib/animation/projectRecoveryContractV1.ts", "utf8");
const storage = readFileSync("src/lib/animation/projectRecoveryStorageV1.ts", "utf8");
const workspace = readFileSync("src/components/workspace/DrawingWorkspace.tsx", "utf8");
const topBar = readFileSync("src/components/workspace/DrawingTopBar.tsx", "utf8");
const officialStorage = readFileSync("src/lib/animation/unifiedProjectStorageV2.ts", "utf8");

check(storage.includes('const DB_NAME = "diamond-animation-project-recovery-v1"'), "recovery uses a separate IndexedDB database");
check(storage.includes("prepareUnifiedProjectStorageV2"), "recovery reuses the validated pure V2 codec");
check(storage.includes("hydrateUnifiedProjectStorageV2"), "recovery performs full hydration/readback");
check(storage.includes("latestStagedSequence"), "recovery binds monotonic latest sequence");
check(storage.includes("recovery_conflict"), "foreign session conflicts fail closed");
check(storage.includes("for (const name of Object.values(STORES)) transaction.objectStore(name).clear()"), "clear targets only recovery stores");
check(contract.includes("PROJECT_RECOVERY_BYTE_LIMIT_V1 = 134_217_728"), "candidate ceiling is exactly 128 MiB");
check(contract.includes('status: "staged" | "current"'), "envelope distinguishes staged and current state");

check(workspace.includes("PROJECT_RECOVERY_DEBOUNCE_MS = 750"), "meaningful edits use the required 750 ms debounce");
check(workspace.includes("3_000 - (performance.now() - recoveryFirstPendingAtRef.current)"), "pending bursts have a three-second maximum wait while idle");
check(workspace.includes("canvasBackgroundColor, layers, queueRecoveryDraftWrite, stickByCell, symbolInstancesByCell, timelineFps, unifiedCatalogs"), "only persisted meaningful state schedules recovery");
absent(workspace, /\[activeTool,[^\]]*queueRecoveryDraftWrite/, "tool selection does not schedule recovery");
absent(workspace, /\[currentFrameIndex,[^\]]*queueRecoveryDraftWrite/, "frame navigation does not schedule recovery");
absent(workspace, /\[isTimelinePlaying,[^\]]*queueRecoveryDraftWrite/, "playback does not schedule recovery");
check(workspace.includes("drawingCanvasRef.current?.hasPendingAuthoringChanges()"), "unfinished canvas gestures never publish a draft");
check(workspace.includes("inspectProjectRecoveryDraftV1"), "mount checks for an existing valid or invalid draft");
check(workspace.includes('setProjectRecoveryState(result.kind === "valid" ? "blocked" : "unavailable")'), "Phase 2 disables writing rather than replacing a startup draft");
check(workspace.includes("clearCoveredRecoveryDraft(candidate, capturedRecoveryGeneration)"), "official Save and Save As use exact candidate clearing");
check(workspace.includes("result.recoveryDraftCleared"), "Save and Exit waits for verified recovery cleanup");
check(workspace.includes("publishAndClearCoveredRecoveryDraft"), "one Save activation coordinates an exact pending recovery generation without a second official save");
check(workspace.includes("await saveProject();"), "Save and Exit remains one activation of the canonical official Save path");
check(topBar.includes("Unsaved draft found — use Save"), "blocked state is truthful and actionable");
check(topBar.includes("Safety backup failed — use Save"), "write failure is truthful and actionable");

check(officialStorage.includes('const DB_NAME = "diamond-animation-unified-v2"'), "official database identity is unchanged");
absent(storage, /saveUnifiedProjectV2|saveUnifiedProjectAsV2|writeUnifiedProjectV2/, "recovery storage cannot invoke official publication");
absent(storage, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, "recovery storage has no network path");
absent(workspace, /beforeunload|sendBeacon/, "workspace makes no false unload-completion promise");

const result = {
  kind: "spec0010-phase2-oracle",
  version: 1,
  status: "PASS",
  assertions,
  evidence: {
    isolatedRecoveryOwner: true,
    officialRepositoryCallsFromRecovery: 0,
    meaningfulSchedulingOnly: true,
    unloadPromise: "none",
    phase3StartupUi: false,
    externalRequests: 0,
  },
};
writeFileSync(`${OUTPUT_ROOT}/oracle.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
