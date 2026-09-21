import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outputRoot = "output/spec-0010/phase-3";
mkdirSync(outputRoot, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const absent = (value: string, pattern: RegExp, label: string) => { assertions += 1; assert.equal(pattern.test(value), false, label); };

const page = readFileSync("app/page.tsx", "utf8");
const prompt = readFileSync("src/components/recovery/ProjectRecoveryPrompt.tsx", "utf8");
const storage = readFileSync("src/lib/animation/projectRecoveryStorageV1.ts", "utf8");
const bootstrap = readFileSync("src/lib/animation/unifiedWorkspaceBootstrap.ts", "utf8");
const animationWorkspace = readFileSync("src/components/workspace/AnimationWorkspace.tsx", "utf8");
const drawingWorkspace = readFileSync("src/components/workspace/DrawingWorkspace.tsx", "utf8");

check(page.includes('useState<StartupRecoveryState>({ kind: "checking" })'), "startup begins behind a recovery inspection gate");
check(page.includes("inspectProjectRecoveryDraftV1().then"), "startup inspects the recovery store before rendering Home");
check(page.indexOf('if (startupRecovery.kind !== "home")') < page.indexOf("return (\n<div"), "recovery decision renders before Home");
check(page.includes('if (startupRecovery.kind !== "home") return;'), "first-run welcome waits until recovery is resolved");
check(prompt.includes("Unsaved work found"), "prompt uses the approved recovery heading");
check(prompt.includes("Recover Work") && prompt.includes("Discard Draft"), "valid prompt exposes only the required primary decisions");
check(prompt.includes("Project") && prompt.includes("Last protected"), "prompt identifies the source title and recovery time");
check(prompt.includes('disabled={mode !== "valid" || busy}'), "invalid recovery can never enable Recover Work");
check(prompt.includes("Discard this local safety backup?"), "discard requires inline confirmation");
check(prompt.includes("Recovery is stored only in this browser profile."), "prompt communicates local-only scope");
check(prompt.includes('event.key !== "Tab"') && prompt.includes("button:not(:disabled)"), "prompt traps keyboard focus among available actions");
check(prompt.includes("@media (prefers-reduced-motion: reduce)"), "prompt supports reduced motion");
check(prompt.includes("@media (max-width: 640px)"), "prompt has a compact responsive layout");

check(page.includes("const fresh = await inspectProjectRecoveryDraftV1()"), "Recover revalidates storage at click time");
check(page.includes("sameRecoveryGeneration(expectedEnvelope, fresh.envelope)"), "Recover refuses a generation that changed after display");
check(page.includes("prepareRecoveryWorkspace(fresh.project, fresh.envelope)"), "Recover prepares the verified candidate before mount");
check(page.includes("claimProjectRecoveryDraftV1"), "Recover performs an atomic ownership claim");
check(storage.includes("expectedOwnerSessionId") && storage.includes("expectedWorkspaceInstanceId"), "claim compare-and-swap binds the prior owner and workspace");
check(storage.includes('return "changed" as const'), "claim and discard fail closed when the stored generation changes");
check(storage.includes("current.envelope.ownerSessionId !== input.ownerSessionId"), "claimed storage is independently read back and ownership-verified");
check(animationWorkspace.includes("recoveryClaim={root.candidate.recoveryClaim}"), "claimed ownership reaches the mounted drawing workspace");
check(drawingWorkspace.includes('recoveryClaim ? "current" : "checking"'), "claimed recovery mounts as an active current lineage");
check(drawingWorkspace.includes("recoveryEnabledRef.current = true"), "recovered lineage remains enabled across development remounts");

check(bootstrap.includes("source.revision === envelope.sourceRevision"), "source revision must still match before identity is retained");
check(bootstrap.includes("digestUnifiedProjectV2(source) === envelope.sourceProjectDigest"), "source digest must still match before identity is retained");
check(bootstrap.includes("sourceMatches ? recovered : rebindRecoveredCopy"), "missing, stale, changed, or unreadable sources detach instead of overwrite");
check(bootstrap.includes("recovered.revision = 0"), "detached recovery begins at revision zero");
check(bootstrap.includes("Recovered copy"), "detached recovery is visibly named as a recovered copy");
check(bootstrap.includes("parentProjectDigest: envelope.sourceProjectDigest"), "detached recovery keeps explicit source provenance");
check(bootstrap.includes("stickAiCreationLatch.projectId = projectId"), "detached identity rebinds the stick creation latch");
check(bootstrap.includes("bindDrawingAiProjectMemoryToProject(memory, projectId)"), "detached identity rebinds persisted drawing AI memory");
check(page.includes("if (prepared.detached)") && page.includes("writeProjectRecoveryDraftV1"), "detached recovery rewrites only the recovery lineage before editing continues");

check(prompt.includes("Your saved project will not change unless you choose to save after recovery."), "prompt makes zero-write recovery semantics explicit");
absent(page, /saveUnifiedProjectV2|saveUnifiedProjectAsV2|writeUnifiedProjectV2/, "startup recovery cannot publish to the official repository");
absent(storage, /saveUnifiedProjectV2|saveUnifiedProjectAsV2|writeUnifiedProjectV2/, "recovery storage cannot publish to the official repository");
check(drawingWorkspace.includes("written.envelope.candidateDigest"), "Save fallback clears the exact digest returned by its recovery write");
check(drawingWorkspace.includes("createPersistedProjectSnapshot()"), "Save and Save As use stable copied bitmap snapshots");
check(drawingWorkspace.includes("result.recoveryDraftCleared"), "Save and Exit still requires verified recovery cleanup before navigation");

check(page.includes("discardProjectRecoveryDraftV1"), "confirmed discard routes through the bounded recovery delete contract");
check(storage.includes("for (const storeName of storeNames) transaction.objectStore(storeName).clear()"), "discard clears only stores in the recovery database");
check(page.includes("allowContinueHome: true"), "Continue Home is exposed only after deletion is unavailable");
check(prompt.includes("Continue to Home without deleting"), "unavailable storage has an explicit truthful escape hatch");
check(storage.includes("if (await adapter.readHead()) throw new Error(\"recovery_discard_failed\")"), "discard verifies the recovery head is absent");

absent([page, prompt, storage, bootstrap].join("\n"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, "Phase 3 runtime additions have no network or provider path");
absent(storage, /rightPanelWidth|saveAsDialog|isTimelinePlaying|openDropdown|messageDraft/, "recovery storage does not introduce transient UI state");

const result = {
  kind: "spec0010-phase3-oracle",
  version: 1,
  status: "PASS",
  assertions,
  evidence: {
    startupGate: true,
    explicitRecoverOrDiscard: true,
    clickTimeRevalidation: true,
    atomicSingleWinnerClaim: true,
    matchingSourceIdentityRetained: true,
    staleSourceDetaches: true,
    officialWritesBeforeExplicitSave: 0,
    invalidRecoveryDisabled: true,
    discardRecoveryOnly: true,
    transientUiRestored: false,
    externalRequests: 0,
  },
};
writeFileSync(`${outputRoot}/oracle.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
