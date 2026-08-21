import {createHash} from "node:crypto";
import {lstatSync, readFileSync, realpathSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";
import type tsTypes from "typescript";
import {BROWSER_EXECUTABLE} from "./browserTesterContract.ts";

type TypeScriptRuntime = typeof import("typescript");
const localRequire = createRequire(import.meta.url);
let typescriptRuntime: TypeScriptRuntime | null = null;
const loadTypeScriptRuntime = () => typescriptRuntime ??= localRequire("typescript") as TypeScriptRuntime;

export const CORRECTION_BASE_COMMIT = "8b663d2b80144e9aeba9ea0ecf0f78ccefa78926" as const;
export const COMPATIBILITY_OUTPUT_ROOT = "output/spec-0001/phase-1.5-compatibility" as const;
export const CATALOG_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json" as const;
export const COMPATIBILITY_PLAN_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-browser-plan.json" as const;
export const COMPATIBILITY_REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-action-registry.json" as const;
export const COMPATIBILITY_ADAPTER_PATH = "scripts/spec0001-browser/actions/phase15CompatibilitySynthetic.ts" as const;

export const sortProofPaths = (paths: readonly string[]) => [...paths]
  .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));

export const CORRECTION_PATHS = [
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-action-registry.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-browser-plan.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-closeout.schema.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-negative-cases.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-proof-commands.json",
  "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-proof-manifest.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorization.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-plan.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-registry.schema.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-result.schema.json",
  "scripts/fixtures/stick-ai/v1/proof-command-receipt-v2.schema.json",
  "scripts/fixtures/stick-ai/v1/proof-manifest-v2.schema.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/actions/phase15CompatibilitySynthetic.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/spec0001-browser/finalizePhase15CompatibilityCloseout.ts",
  "scripts/spec0001-browser/recordPhase15CompatibilityProof.ts",
  "scripts/spec0001-browser/validatePhase15Compatibility.ts",
  "scripts/spec0001-browser/validatePhase15CompatibilityProof.ts",
  "scripts/spec0001-proof/measureSpec0001LintRegression.ts",
  "scripts/validateSpec0001ProofBundle.ts",
] as const;

export const PHASE2_PATHS = [
  "scripts/finalizeSpec0001ProofBundle.ts",
  "scripts/fixtures/spec0001-browser/v1/phase-2-action-registry.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json",
  "scripts/fixtures/stick-ai/v1/phase-2-proof-commands.json",
  "scripts/fixtures/stick-ai/v1/stick-control-disposition-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-correction-affordance-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-document-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-editable-timeline-alias-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-editable-timeline-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-gesture-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-manual-wave-build-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-pose-aliasing-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-ui-restoration-reference.json",
  "scripts/fixtures/stick-ai/v1/wave-any-joint-corrections.json",
  "scripts/fixtures/stick-ai/v1/wave-cell-resolution.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/spec0001-browser/actions/phase2.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/validateStickPoseTimeline.ts",
  "src/components/workspace/stickfigure/StickFigureCanvas.tsx",
  "src/components/workspace/stickfigure/StickFigureRightPanel.tsx",
  "src/components/workspace/stickfigure/StickFigureTimelineRow.tsx",
  "src/components/workspace/stickfigure/StickFigureToolBar.tsx",
  "src/components/workspace/stickfigure/StickFigureTopBar.tsx",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "src/components/workspace/stickfigure/types.ts",
  "src/lib/stickfigure/stickProjectContract.ts",
  "src/lib/stickfigure/stickTimeline.ts",
] as const;

export const PHASE3_PATHS = sortProofPaths([
  "app/page.tsx",
  "scripts/fixtures/spec0001-browser/v1/phase-3-action-registry.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/spec0001-browser/v3/tester-extension-authorization.schema.json",
  "scripts/fixtures/spec0001-browser/v3/tester-extension-plan.schema.json",
  "scripts/fixtures/spec0001-browser/v3/tester-extension-registry.schema.json",
  "scripts/fixtures/spec0001-browser/v3/tester-extension-result.schema.json",
  "scripts/fixtures/stick-ai/v1/manual-wave-saved-project.json",
  "scripts/fixtures/stick-ai/v1/non-wave-saved-project.json",
  "scripts/fixtures/stick-ai/v1/phase-3-browser-proof-plan.json",
  "scripts/fixtures/stick-ai/v1/phase-3-proof-commands.json",
  "scripts/fixtures/stick-ai/v1/stick-history-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-history-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-manual-action-history-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-saved-projects.json",
  "scripts/fixtures/stick-ai/v1/stick-storage-cases.json",
  "scripts/fixtures/stick-ai/v1/wave-editor-history-root.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/actions/phase3.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/validateDrawingProjectAiMemory.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/validateStickHistoryPersistence.ts",
  "src/components/open-project/OpenProjectBrowser.tsx",
  "src/components/workspace/stickfigure/StickFigureCanvas.tsx",
  "src/components/workspace/stickfigure/StickFigureTopBar.tsx",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "src/lib/stickProjectStorage.ts",
  "src/lib/stickfigure/stickProjectContract.ts",
  "src/lib/stickfigure/stickProjectHistory.ts",
]);

export const PHASE3_DIRTY_PATHS = PHASE3_PATHS.filter((path) => path !== "src/lib/stickfigure/stickProjectContract.ts");

export const PHASE3_CLOSEOUT_RECORD_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/DECISIONS.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "project/project_structure.txt",
] as const;

export const PHASE3_CLOSEOUT_PATHS = sortProofPaths([...PHASE3_DIRTY_PATHS, ...PHASE3_CLOSEOUT_RECORD_PATHS]);

export const PHASE4_BASE_COMMIT = "62f046adff7418d2e644365fc04bd5d6312dcca9" as const;

export const PHASE4_PATHS = sortProofPaths([
  "scripts/finalizeSpec0001ProofBundle.ts",
  "scripts/fixtures/spec0001-browser/v1/phase-4-action-registry.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/spec0001-browser/v4/tester-extension-authorization.schema.json",
  "scripts/fixtures/spec0001-browser/v4/tester-extension-plan.schema.json",
  "scripts/fixtures/spec0001-browser/v4/tester-extension-registry.schema.json",
  "scripts/fixtures/spec0001-browser/v4/tester-extension-result.schema.json",
  "scripts/fixtures/stick-ai/v1/phase-4-browser-proof-plan.json",
  "scripts/fixtures/stick-ai/v1/phase-4-proof-commands.json",
  "scripts/fixtures/stick-ai/v1/stick-command-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-command-transaction-cases.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/actions/phase4.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/validateStickFigureCommandTransaction.ts",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "src/lib/ai/stickFigureAiContract.ts",
  "src/lib/ai/stickFigureCommandExecutor.ts",
  "src/lib/stickfigure/stickProjectContract.ts",
  "src/lib/stickfigure/stickProjectHistory.ts",
]);

export const PHASE4_DIRTY_PATHS = PHASE4_PATHS;

export const PHASE4_CLOSEOUT_RECORD_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/DECISIONS.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "project/project_structure.txt",
] as const;

export const PHASE4_CLOSEOUT_PATHS = sortProofPaths([...PHASE4_DIRTY_PATHS, ...PHASE4_CLOSEOUT_RECORD_PATHS]);

export const PHASE5_BASE_COMMIT = "a2b4f3e0fc492df9cd63bda32554e382a344cdb6" as const;
export const PHASE5_PLAN_PATH = "scripts/fixtures/stick-ai/v1/phase-5-browser-proof-plan.json" as const;
export const PHASE5_REGISTRY_PATH = "scripts/fixtures/stick-ai/v1/stick-ai-raw-route-cases.json" as const;
export const PHASE5_OUTPUT_ROOT = "output/spec-0001/phase-5" as const;
export const PHASE5_ROUTE_OPERATION_FAMILIES = ["guarded-http", "runner-environment"] as const;

export const PHASE5_PATHS = sortProofPaths([
  ".env.example",
  "app/api/ai/route.ts",
  "scripts/finalizeSpec0001ProofBundle.ts",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/spec0001-browser/v5/tester-extension-authorization.schema.json",
  "scripts/fixtures/spec0001-browser/v5/tester-extension-plan.schema.json",
  "scripts/fixtures/spec0001-browser/v5/tester-extension-registry.schema.json",
  "scripts/fixtures/spec0001-browser/v5/tester-extension-result.schema.json",
  "scripts/fixtures/stick-ai/v1/phase-5-browser-proof-plan.json",
  "scripts/fixtures/stick-ai/v1/phase-5-proof-commands.json",
  "scripts/fixtures/stick-ai/v1/stick-ai-availability-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-ai-mock-server-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-ai-raw-route-cases.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/validateStickFigureAiMockRoute.ts",
  "src/lib/ai/stickFigureAiAvailability.ts",
  "src/lib/ai/stickFigureAiContract.ts",
  "src/lib/ai/stickFigureAiMockServer.ts",
  "src/lib/ai/stickFigureAiServerDispatch.ts",
  "src/lib/ai/strictStickJson.ts",
  "src/lib/stickfigure/stickProjectContract.ts",
]);

export const PHASE5_OPTIONAL_CONTRACT_PATHS = sortProofPaths([
  "src/lib/ai/stickFigureAiContract.ts",
  "src/lib/stickfigure/stickProjectContract.ts",
]);

export const PHASE5_DIRTY_PATHS = PHASE5_PATHS.filter((path) => !PHASE5_OPTIONAL_CONTRACT_PATHS.includes(path));

export const PHASE5_CLOSEOUT_RECORD_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/DECISIONS.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "project/project_structure.txt",
] as const;

export const PHASE5_CLOSEOUT_PATHS = sortProofPaths([...PHASE5_DIRTY_PATHS, ...PHASE5_CLOSEOUT_RECORD_PATHS]);

export const PHASE6_BASE_COMMIT = "f46ed3b13e6bca3a09c9b2926c972bea8c331f2c" as const;
export const PHASE6_PLAN_PATH = "scripts/fixtures/stick-ai/v2/phase-6-browser-proof-plan.json" as const;
export const PHASE6_REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v6/phase-6-action-registry.json" as const;
export const PHASE6_ADAPTER_PATH = "scripts/spec0001-browser/actions/phase6.ts" as const;
export const PHASE6_OUTPUT_ROOT = "output/spec-0001/phase-6" as const;
export const PHASE6_OPERATION_FAMILIES = ["guarded-http", "protected-regression", "runner-environment", "screenshot", "visible-role"] as const;
export const PHASE6_PATHS = sortProofPaths([
  "scripts/finalizeSpec0001ProofBundle.ts",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/spec0001-browser/v6/phase-6-action-registry.json",
  "scripts/fixtures/spec0001-browser/v6/tester-extension-authorization.schema.json",
  "scripts/fixtures/spec0001-browser/v6/tester-extension-plan.schema.json",
  "scripts/fixtures/spec0001-browser/v6/tester-extension-registry.schema.json",
  "scripts/fixtures/spec0001-browser/v6/tester-extension-result.schema.json",
  "scripts/fixtures/stick-ai/v2/phase-6-browser-proof-plan.json",
  "scripts/fixtures/stick-ai/v2/phase-6-proof-commands.json",
  "scripts/fixtures/stick-ai/v2/stick-ai-creator-preservation-cases.json",
  "scripts/fixtures/stick-ai/v2/stick-ai-intent-cases.json",
  "scripts/fixtures/stick-ai/v2/stick-ai-ui-cases.json",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/actions/phase6.ts",
  "scripts/spec0001-browser/browserTesterExtensionContract.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/validateStickFigureAiUiAdapter.ts",
  "src/components/workspace/ai/WorkspaceAiPanelShell.tsx",
  "src/components/workspace/stickfigure/StickFigureAiPanel.tsx",
  "src/components/workspace/stickfigure/StickFigureRightPanel.tsx",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "src/lib/ai/stickFigureAiContract.ts",
  "src/lib/ai/stickFigureAiIntentMatcher.ts",
  "src/lib/ai/stickFigureAiMockServer.ts",
  "src/lib/ai/stickFigureAiWorkspaceAdapter.ts",
]);

export const PHASE6_CLOSEOUT_RECORD_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/DECISIONS.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "project/project_structure.txt",
] as const;

export const phase6CloseoutPathsForTechnicalSubset = (technicalPaths: readonly string[]) => {
  const canonicalTechnicalPaths = sortProofPaths([...new Set(technicalPaths)]);
  exact(technicalPaths, canonicalTechnicalPaths, "Phase 6 manifest-bound technical paths");
  for (const path of canonicalTechnicalPaths) if (!PHASE6_PATHS.includes(path)) fail(`Phase 6 manifest-bound technical path is outside the authorization ceiling: ${path}.`);
  return sortProofPaths([...canonicalTechnicalPaths, ...PHASE6_CLOSEOUT_RECORD_PATHS]);
};

export const PHASE2_CLOSEOUT_RECORD_PATHS = [
  "docs/CURRENT_STATE.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/architecture.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "docs/testing_workflow.md",
  "project/project_structure.txt",
] as const;

export const PHASE2_CLOSEOUT_PATHS = sortProofPaths([...PHASE2_PATHS, ...PHASE2_CLOSEOUT_RECORD_PATHS]);

export const OPERATION_FAMILIES = [
  "checkpoint", "fixture", "pointer", "protected-regression", "runner-environment",
  "screenshot", "visible-role", "visible-testid", "workspace-driver",
] as const;
export type OperationFamily = typeof OPERATION_FAMILIES[number];
export type AuthorizationId = "phase-1.5-compatibility-synthetic/v1" | "phase-2/v1" | "phase-3/v1" | "phase-4/v1";
export type Phase5AuthorizationId = "phase-5/v1";
export type Phase6AuthorizationId = "phase-6/v1";
export type DerivedGitStateName = "dirty-executor" | "clean-committed";
export type Digest = `sha256:${string}`;

export type FileBinding = {path: string; byteLength: number; sha256: Digest};
export type ExternalFileBinding = {path: typeof BROWSER_EXECUTABLE; byteLength: number; sha256: Digest};
export type BrowserProofCli =
  | {mode: "legacy"; runBase: string | null}
  | {mode: "extension"; planPath: string};

export type Phase4DriverOperation =
  | "beginStickRequest"
  | "abortStickRequest"
  | "previewStickCommand"
  | "cancelStickPreview"
  | "applyStickCommand"
  | "beginApplyPublication"
  | "completeApplyPublication"
  | "redeliverStickCommand"
  | "executeInjectedTransactionFailure"
  | "armNextVisibleApplyFailure"
  | "readCheckpoint";

export type StickPhase4CheckpointV1 = {
  checkpointVersion: 4;
  rootStatus: "mounting" | "ready" | "pending" | "failed";
  documentDigestStatus: "mounting" | "ready" | "pending" | "failed";
  editorRootDigest: Digest | null;
  workspaceRootDigest: Digest | null;
  documentDigest: Digest | null;
  documentRevision: number | null;
  viewDigest: Digest | null;
  historyRootDigest: Digest | null;
  undoDepth: number;
  redoDepth: number;
  lastSavedDocumentDigest: Digest | null;
  dirty: boolean | null;
  workspaceInstanceDigest: Digest | null;
  workspaceGeneration: number | null;
  storageDigest: Digest | null;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  gestureState: null;
  dragPreviewPoint: null;
  completedEditCount: number;
  playbackState: "paused" | "playing";
  playbackFrameIndex: number;
  playbackControlAvailable: boolean;
  mountedOpenStatus: string | null;
  mountedOpenOperationDigest: Digest | null;
  onionEnabled: boolean;
  previousOnionRenderInputDigest: Digest | null;
  nextOnionRenderInputDigest: Digest | null;
  readyDocumentPublicationCount: number;
  workspaceRootTransitionCount: number;
  aiRootDigest: Digest | null;
  aiCanonicalDocumentDigest: Digest | null;
  aiCanonicalHistoryRootDigest: Digest | null;
  aiWorkspaceInstanceDigest: Digest | null;
  aiWorkspaceGeneration: number | null;
  transactionStateDigest: Digest | null;
  activeTransactionPhase: "idle" | "requesting" | "preview_ready" | "committing";
  activeTransactionDigest: Digest | null;
  terminalLedgerDigest: Digest;
  terminalLedgerLength: number;
  pendingApplyOperationDigest: Digest | null;
  lastCommandOutcomeCode: string | null;
  lastCommandResultDigest: Digest | null;
  commandRootTransitionCount: number;
};

export type StickPhase4PortResultV1 = {
  outcomeCode: string;
  errorCode: string | null;
};

export type ProtectedRegressionGroup =
  | "home-new-drawing"
  | "home-new-stick"
  | "stick-creator-back"
  | "drawing-generate-frames"
  | "drawing-undo-redo-play-pause";

export type NormalizedAction =
  | {actionId: string; family: "visible-role"; operation: "click" | "fill" | "press" | "assert-visible" | "assert-hidden" | "assert-enabled" | "assert-disabled"; role: string; accessibleName: string; input: null | {text: string} | {key: "Enter" | "Escape" | "Space"}}
  | {actionId: string; family: "visible-testid"; operation: "click" | "assert-visible" | "assert-enabled" | "assert-disabled"; testId: string}
  | {actionId: string; family: "pointer"; operation: "down" | "move" | "up" | "cancel"; targetId: string; pointerId: number; button: 0; point: {x: number; y: number}; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "workspace-driver"; operation: "mountDocument" | "dispatchCompletedJointEdit" | "mountEditorHistoryRoot" | "dispatchEditorTransaction" | "beginDocumentPublication" | "completeDocumentPublication" | "beginMountedOpen" | "completeMountedOpen" | "cancelMountedOpen" | Phase4DriverOperation; fixtureId: string | null; operationId: string; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "runner-environment"; operation: "installEnvironmentPlan" | "releaseEnvironmentGate" | "readEnvironmentCheckpoint" | "clearEnvironmentPlan"; fixtureId: string | null; operationId: string; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "checkpoint"; channel: "workspace-driver" | "runner-environment"; checkpointId: string; expectedEvidenceDigest: Digest}
  | {actionId: string; family: "screenshot"; screenshotId: string}
  | {actionId: string; family: "protected-regression"; group: ProtectedRegressionGroup};

export type ExtensionPlan = {
  planVersion: 2 | 3 | 4;
  specId: "SPEC-0001";
  proofPurpose: "phase-1.5-compatibility-synthetic" | "phase-2" | "phase-3" | "phase-4";
  authorizationId: AuthorizationId;
  baseCommit: string;
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  outputRoot: string;
  operationFamilies: OperationFamily[];
  registry: FileBinding;
  contexts: {contextId: string; viewport: {width: 1024 | 1440; height: 768 | 900}}[];
  steps: {stepId: string; actionId: string; contextId: string}[];
  evidence: {
    ledgerKinds: ("action" | "negative" | "checkpoint" | "storage" | "request" | "network" | "console" | "regression" | "cleanup")[];
    screenshotIds: string[];
    protectedRegressionGroups: ProtectedRegressionGroup[];
    productPhaseClaimed: boolean;
  };
};

export type ExtensionRegistry = {
  registryVersion: 2 | 3 | 4;
  specId: "SPEC-0001";
  authorizationId: AuthorizationId;
  operationFamilies: OperationFamily[];
  adapter: FileBinding;
  fixtures: (
    | {fixtureId: string; fixtureKind: string; sourceKind: "adapter-built-in"; expectedFixtureDigest: Digest}
    | {fixtureId: string; fixtureKind: string; sourceKind: "repository-json"; binding: FileBinding; expectedFixtureDigest: Digest}
  )[];
  actions: NormalizedAction[];
};

export type AdapterDeclaration = {
  declarationVersion: 1;
  adapterId: string;
  authorizationId: AuthorizationId;
  adapterKind: "in-memory-phase2-shaped-synthetic/v1" | "phase-2-product-ports/v1" | "phase-3-product-ports/v1" | "phase-4-product-ports/v1";
  executionProfile: "synthetic-state-machine/v1" | "phase2-workspace-ports/v1" | "phase3-workspace-ports/v1" | "phase4-workspace-ports/v1";
  workspacePortBinding: null | "spec0001Phase2BrowserPortsV1" | "spec0001Phase3BrowserPortsV1" | "spec0001Phase4BrowserPortsV1";
  productPhaseClaimed: boolean;
  driverOperations: {operation: string; fixtureKinds: string[]}[];
  environmentOperations: {operation: string; fixtureKinds: string[]}[];
  pointerTargets: {targetId: string; targetKind: "authorized-canvas"}[];
  checkpointKinds: ("workspace" | "environment")[];
};

export type DerivedGitState = {
  derivedGitState: DerivedGitStateName;
  baseCommit: string;
  headCommit: string;
  observedDirtyPaths: string[];
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  selectedExpectedPaths: string[];
};

export type ExtensionResult = {
  resultVersion: 2 | 3 | 4;
  specId: "SPEC-0001";
  proofPurpose: "phase-1.5-compatibility-synthetic" | "phase-2" | "phase-3" | "phase-4";
  status: "passed";
  recordedAt: string;
  productPhaseClaimed: boolean;
  runtime: {nodeVersion: string; playwrightCoreVersion: "1.62.1"; browserVersion: string; browserExecutable: ExternalFileBinding};
  derivedGitState: DerivedGitStateName;
  baseCommit: string;
  headCommit: string;
  observedDirtyPaths: string[];
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  selectedExpectedPaths: string[];
  authorization: {authorizationId: AuthorizationId; materializationKind: "materialized" | "deferred"};
  bindings: {catalog: FileBinding; plan: FileBinding; registry: FileBinding; adapter: FileBinding};
  execution: {selectedActionIds: string[]; actionCount: number; checkpointCount: number; screenshotCount: number; protectedRegressionGroups: ProtectedRegressionGroup[]};
  evidence: {ledgerKinds: string[]; screenshotIds: string[]; protectedRegressionGroups: ProtectedRegressionGroup[]};
  network: {browserNonLoopbackAttempts: 0; serverNonLoopbackAttempts: 0; childNonLoopbackAttempts: 0};
  cleanup: {anchorRestored: true; sourceRestored: true; browserContextsOpen: 0; activeGates: 0; activeIntercepts: 0; openChildProcesses: 0; openPorts: 0; residualPaths: []};
};

export type Phase5RouteOperationKind = "marked-availability-get" | "marked-raw-stick-post" | "marker-free-drawing-fallthrough-post";
export type Phase5HeaderTuple = readonly [string, string];
export type Phase5RouteCase = {
  caseId: string;
  operationKind: Phase5RouteOperationKind;
  request: {method: "GET" | "POST"; path: "/api/ai"; headers: Phase5HeaderTuple[]; body: {encoding: "base64"; byteLength: number; sha256: Digest; data: string}};
  expected: {
    outcome: "exact-response" | "legacy-fallthrough";
    status: number;
    headers: Phase5HeaderTuple[];
    body: null | {byteLength: number; sha256: Digest};
    legacyCheckpoint: null | {checkpointKind: string; expectedJsonFields: Record<string, unknown>};
    logAssertions: {forbiddenSubstrings: string[]; rawBodyMustNotAppear: true};
    nonLoopbackAttempts: 0;
  };
};

export type Phase5RoutePlan = {
  planVersion: 5;
  specId: "SPEC-0001";
  proofPurpose: "phase-5";
  authorizationId: Phase5AuthorizationId;
  baseCommit: typeof PHASE5_BASE_COMMIT;
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  outputRoot: typeof PHASE5_OUTPUT_ROOT;
  operationFamilies: (typeof PHASE5_ROUTE_OPERATION_FAMILIES)[number][];
  registry: FileBinding;
  selectedCaseIds: string[];
  evidence: {
    routePath: "/api/ai";
    requestTransport: "guarded-node-loopback-http-exact-bytes/v1";
    exactRequestBytes: true;
    exactResponseBindings: true;
    legacyDrawingFallthrough: true;
    sanitizedServerLogs: true;
    browserPageOperations: 0;
    screenshotClaims: 0;
    nonLoopbackAttempts: 0;
    cleanupFields: string[];
  };
};

export type Phase5RouteRegistry = {
  registryVersion: 5;
  specId: "SPEC-0001";
  authorizationId: Phase5AuthorizationId;
  operationFamilies: (typeof PHASE5_ROUTE_OPERATION_FAMILIES)[number][];
  cases: Phase5RouteCase[];
};

export type Phase5Authorization = {
  authorizationId: Phase5AuthorizationId;
  proofPurpose: "phase-5";
  materializationKind: "deferred";
  plan: {path: typeof PHASE5_PLAN_PATH; schemaPath: "scripts/fixtures/spec0001-browser/v5/tester-extension-plan.schema.json"; planVersion: 5};
  registry: {path: typeof PHASE5_REGISTRY_PATH; schemaPath: "scripts/fixtures/spec0001-browser/v5/tester-extension-registry.schema.json"; registryVersion: 5};
  resultSchema: {path: "scripts/fixtures/spec0001-browser/v5/tester-extension-result.schema.json"; resultVersion: 5};
  operationFamilies: (typeof PHASE5_ROUTE_OPERATION_FAMILIES)[number][];
  outputRoot: typeof PHASE5_OUTPUT_ROOT;
  pathCeiling: string[];
};

export type ValidatedPhase5RouteGraph = {
  authorizationId: Phase5AuthorizationId;
  materializationKind: "deferred";
  outputRoot: typeof PHASE5_OUTPUT_ROOT;
  pathCeiling: readonly string[];
  operationFamilies: readonly (typeof PHASE5_ROUTE_OPERATION_FAMILIES)[number][];
  catalogBinding: FileBinding;
  planBinding: FileBinding;
  registryBinding: FileBinding;
  plan: Phase5RoutePlan;
  registry: Phase5RouteRegistry;
  git: DerivedGitState;
};

export type Phase5RouteCaseEvidence = {
  caseId: string;
  operationKind: Phase5RouteOperationKind;
  request: {method: "GET" | "POST"; path: "/api/ai"; headerSha256: Digest; bodyByteLength: number; bodySha256: Digest};
  response: {status: number; selectedHeaders: Phase5HeaderTuple[]; bodyByteLength: number; bodySha256: Digest};
  legacyCheckpoint: null | {checkpointKind: string; matched: true};
  logs: {byteLength: number; sha256: Digest; forbiddenSubstringsAbsent: true; rawBodyAbsent: true};
  nonLoopbackAttempts: 0;
};

export type Phase5RouteResult = {
  resultVersion: 5;
  specId: "SPEC-0001";
  proofPurpose: "phase-5";
  status: "passed";
  recordedAt: string;
  productPhaseClaimed: true;
  runtime: ExtensionResult["runtime"];
  derivedGitState: DerivedGitStateName;
  baseCommit: string;
  headCommit: string;
  observedDirtyPaths: string[];
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  selectedExpectedPaths: string[];
  authorization: {authorizationId: Phase5AuthorizationId; materializationKind: "deferred"};
  bindings: {catalog: FileBinding; plan: FileBinding; registry: FileBinding};
  execution: {selectedCaseIds: string[]; caseCount: number; operationKinds: Phase5RouteOperationKind[]};
  evidence: {
    routePath: "/api/ai";
    requestTransport: "guarded-node-loopback-http-exact-bytes/v1";
    cases: Phase5RouteCaseEvidence[];
    realApiRouteRequests: number;
    browserPageOperations: 0;
    browserMockedApiResponses: 0;
    screenshotClaims: 0;
    sanitizedServerLogs: true;
  };
  network: {browserNonLoopbackAttempts: 0; serverNonLoopbackAttempts: 0; childNonLoopbackAttempts: 0; runnerNonLoopbackAttempts: 0; runnerLoopbackRequests: number};
  cleanup: ExtensionResult["cleanup"] & {residualProfiles: []};
};

export type Phase6Action = {
  actionId: string;
  kind: "visible-preview-cancel" | "visible-rejection" | "visible-apply-regression" | "visible-invalid-response" | "visible-project-switch" | "protected-regression";
  caseId: string | null;
};
export type Phase6Plan = {
  planVersion: 6;
  specId: "SPEC-0001";
  proofPurpose: "phase-6";
  authorizationId: Phase6AuthorizationId;
  baseCommit: typeof PHASE6_BASE_COMMIT;
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  outputRoot: typeof PHASE6_OUTPUT_ROOT;
  operationFamilies: (typeof PHASE6_OPERATION_FAMILIES)[number][];
  registry: FileBinding;
  selectedActionIds: string[];
  evidence: Record<string, unknown>;
};
export type Phase6Registry = {
  registryVersion: 6;
  specId: "SPEC-0001";
  authorizationId: Phase6AuthorizationId;
  operationFamilies: (typeof PHASE6_OPERATION_FAMILIES)[number][];
  adapter: FileBinding;
  fixtures: FileBinding[];
  actions: Phase6Action[];
};
export type Phase6Authorization = {
  authorizationId: Phase6AuthorizationId;
  proofPurpose: "phase-6";
  materializationKind: "deferred";
  plan: {path: typeof PHASE6_PLAN_PATH; schemaPath: "scripts/fixtures/spec0001-browser/v6/tester-extension-plan.schema.json"; planVersion: 6};
  registry: {path: typeof PHASE6_REGISTRY_PATH; schemaPath: "scripts/fixtures/spec0001-browser/v6/tester-extension-registry.schema.json"; registryVersion: 6};
  adapter: {path: typeof PHASE6_ADAPTER_PATH; grammarId: "spec0001-browser-adapter-declaration/v1"; declarationVersion: 1};
  resultSchema: {path: "scripts/fixtures/spec0001-browser/v6/tester-extension-result.schema.json"; resultVersion: 6};
  operationFamilies: (typeof PHASE6_OPERATION_FAMILIES)[number][];
  outputRoot: typeof PHASE6_OUTPUT_ROOT;
  pathCeiling: string[];
};
export type ValidatedPhase6Graph = {
  authorizationId: Phase6AuthorizationId;
  materializationKind: "deferred";
  outputRoot: typeof PHASE6_OUTPUT_ROOT;
  pathCeiling: readonly string[];
  operationFamilies: readonly (typeof PHASE6_OPERATION_FAMILIES)[number][];
  catalogBinding: FileBinding;
  planBinding: FileBinding;
  registryBinding: FileBinding;
  adapterBinding: FileBinding;
  plan: Phase6Plan;
  registry: Phase6Registry;
  git: DerivedGitState;
};

export type Phase6Result = {
  resultVersion: 6;
  specId: "SPEC-0001";
  proofPurpose: "phase-6";
  status: "passed";
  recordedAt: string;
  productPhaseClaimed: true;
  runtime: ExtensionResult["runtime"];
  derivedGitState: DerivedGitStateName;
  baseCommit: string;
  headCommit: string;
  observedDirtyPaths: string[];
  dirtyExpectedPaths: string[];
  cleanExpectedPaths: [];
  selectedExpectedPaths: string[];
  authorization: {authorizationId: Phase6AuthorizationId; materializationKind: "deferred"};
  bindings: {catalog: FileBinding; plan: FileBinding; registry: FileBinding; adapter: FileBinding};
  execution: {selectedActionIds: string[]; acceptedVisibleCaseCount: 15; visibleRejectionCount: 13; guardedRejectedCaseCount: 36; completeApplyCount: 1};
  evidence: {previewCopy: string; actions: unknown[]; screenshots: Array<FileBinding & {id: string; viewport: {width: 1440; height: 900} | {width: 1024; height: 768}}> ; realApiRouteRequests: number; drawingInterceptedRequests: number};
  network: {browserNonLoopbackAttempts: 0; serverNonLoopbackAttempts: 0; childNonLoopbackAttempts: 0; runnerNonLoopbackAttempts: 0};
  cleanup: ExtensionResult["cleanup"] & {residualProfiles: []};
};

type MaterializationKind = "materialized" | "deferred";
export type ValidatedAuthorization = {
  authorizationId: AuthorizationId;
  proofPurpose: "phase-1.5-compatibility-synthetic" | "phase-2" | "phase-3" | "phase-4";
  materializationKind: MaterializationKind;
  plan: {path: string; schemaPath: string; planVersion: 2 | 3 | 4; byteLength?: number; sha256?: Digest};
  registry: {path: string; schemaPath: string; registryVersion: 2 | 3 | 4; byteLength?: number; sha256?: Digest};
  adapter: {path: string; grammarId: "spec0001-browser-adapter-declaration/v1"; declarationVersion: 1; byteLength?: number; sha256?: Digest};
  resultSchema: {path: string; resultVersion: 2 | 3 | 4};
  operationFamilies: OperationFamily[];
  outputRoot: string;
  pathCeiling: string[];
};
export type ValidatedAuthorizationCatalog = {catalogVersion: 2; specId: "SPEC-0001"; authorizations: [ValidatedAuthorization, ValidatedAuthorization, ValidatedAuthorization, ValidatedAuthorization, Phase5Authorization, Phase6Authorization]};

export type ValidatedTesterExtension = {
  authorizationId: AuthorizationId;
  materializationKind: MaterializationKind;
  outputRoot: string;
  pathCeiling: readonly string[];
  operationFamilies: readonly OperationFamily[];
  catalogBinding: FileBinding;
  planBinding: FileBinding;
  registryBinding: FileBinding;
  adapterBinding: FileBinding;
  plan: ExtensionPlan;
  registry: ExtensionRegistry;
  adapter: AdapterDeclaration;
  git: DerivedGitState;
};

type JsonRecord = Record<string, unknown>;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const HANDLE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/;

const fail = (message: string): never => { throw new Error(message); };
const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const object = (value: unknown, keys: readonly string[], label: string): JsonRecord => {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const record: JsonRecord = value;
  const observed = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) fail(`${label} fields mismatch: ${observed.join(", ")}.`);
  return record;
};
const string = (value: unknown, label: string): string => typeof value === "string" && value.length > 0 ? value : fail(`${label} must be a nonempty string.`);
const integer = (value: unknown, label: string): number => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : fail(`${label} must be a safe nonnegative integer.`);
const array = (value: unknown, label: string): unknown[] => Array.isArray(value) ? value : fail(`${label} must be an array.`);
const enumeration = <T extends string>(value: unknown, values: readonly T[], label: string): T => typeof value === "string" && values.includes(value as T) ? value as T : fail(`${label} is invalid.`);
const exact = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} mismatch.`);
};
const unique = <T>(values: T[], label: string): T[] => {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates.`);
  return values;
};
const canonicalStrings = (value: unknown, label: string): string[] => {
  const values = unique(array(value, label).map((entry, index) => string(entry, `${label}[${index}]`)), label);
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  exact(values, sorted, `${label} canonical order`);
  return values;
};

const canonicalProofPaths = (value: unknown, label: string): string[] => {
  const values = unique(array(value, label).map((entry, index) => string(entry, `${label}[${index}]`)), label);
  exact(values, sortProofPaths(values), `${label} canonical proof-path order`);
  return values;
};

export const assertSafeRepositoryPath = (value: unknown, label = "repository path"): string => {
  const path = string(value, label);
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/") || path.endsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(`${label} is not a safe repository-relative path.`);
  }
  return path;
};

const digest = (value: unknown, label: string): Digest => {
  const result = string(value, label);
  if (!DIGEST_PATTERN.test(result)) fail(`${label} must be a lowercase SHA-256 digest.`);
  return result as Digest;
};
const gitSha = (value: unknown, label: string): string => {
  const result = string(value, label);
  if (!SHA_PATTERN.test(result)) fail(`${label} must be a lowercase Git SHA.`);
  return result;
};
const handle = (value: unknown, label: string): string => {
  const result = string(value, label);
  if (result.normalize("NFC") !== result || !HANDLE_PATTERN.test(result)) fail(`${label} must be a bounded NFC ASCII handle.`);
  return result;
};

const digestOrNull = (value: unknown, label: string): Digest | null => value === null ? null : digest(value, label);
const integerOrNull = (value: unknown, label: string): number | null => value === null ? null : integer(value, label);

export const validatePhase4CheckpointValue = (value: unknown, label = "Phase 4 checkpoint"): StickPhase4CheckpointV1 => {
  const record = object(value, [
    "checkpointVersion", "rootStatus", "documentDigestStatus", "editorRootDigest", "workspaceRootDigest", "documentDigest",
    "documentRevision", "viewDigest", "historyRootDigest", "undoDepth", "redoDepth", "lastSavedDocumentDigest", "dirty",
    "workspaceInstanceDigest", "workspaceGeneration", "storageDigest", "currentFrameIndex", "selectedTimelineIndex", "gestureState",
    "dragPreviewPoint", "completedEditCount", "playbackState", "playbackFrameIndex", "playbackControlAvailable", "mountedOpenStatus",
    "mountedOpenOperationDigest", "onionEnabled", "previousOnionRenderInputDigest", "nextOnionRenderInputDigest",
    "readyDocumentPublicationCount", "workspaceRootTransitionCount", "aiRootDigest", "aiCanonicalDocumentDigest",
    "aiCanonicalHistoryRootDigest", "aiWorkspaceInstanceDigest", "aiWorkspaceGeneration", "transactionStateDigest",
    "activeTransactionPhase", "activeTransactionDigest", "terminalLedgerDigest", "terminalLedgerLength", "pendingApplyOperationDigest",
    "lastCommandOutcomeCode", "lastCommandResultDigest", "commandRootTransitionCount",
  ], label);
  exact(record.checkpointVersion, 4, `${label}.checkpointVersion`);
  const rootStatus = enumeration(record.rootStatus, ["mounting", "ready", "pending", "failed"] as const, `${label}.rootStatus`);
  const documentDigestStatus = enumeration(record.documentDigestStatus, ["mounting", "ready", "pending", "failed"] as const, `${label}.documentDigestStatus`);
  exact(documentDigestStatus, rootStatus, `${label} root/digest status`);
  const dirty = record.dirty === null || typeof record.dirty === "boolean" ? record.dirty : fail(`${label}.dirty is invalid.`);
  const playbackControlAvailable = typeof record.playbackControlAvailable === "boolean" ? record.playbackControlAvailable : fail(`${label}.playbackControlAvailable is invalid.`);
  const onionEnabled = typeof record.onionEnabled === "boolean" ? record.onionEnabled : fail(`${label}.onionEnabled is invalid.`);
  exact(record.gestureState, null, `${label}.gestureState`);
  exact(record.dragPreviewPoint, null, `${label}.dragPreviewPoint`);
  const mountedOpenStatus = record.mountedOpenStatus === null ? null : handle(record.mountedOpenStatus, `${label}.mountedOpenStatus`);
  const lastCommandOutcomeCode = record.lastCommandOutcomeCode === null ? null : handle(record.lastCommandOutcomeCode, `${label}.lastCommandOutcomeCode`);
  const activeTransactionPhase = enumeration(record.activeTransactionPhase, ["idle", "requesting", "preview_ready", "committing"] as const, `${label}.activeTransactionPhase`);
  const activeTransactionDigest = digestOrNull(record.activeTransactionDigest, `${label}.activeTransactionDigest`);
  const pendingApplyOperationDigest = digestOrNull(record.pendingApplyOperationDigest, `${label}.pendingApplyOperationDigest`);
  exact(activeTransactionDigest === null, activeTransactionPhase === "idle", `${label} active phase/digest nullability`);
  exact(pendingApplyOperationDigest === null, activeTransactionPhase !== "committing", `${label} committing gate nullability`);
  const terminalLedgerLength = integer(record.terminalLedgerLength, `${label}.terminalLedgerLength`);
  if (terminalLedgerLength > 128) fail(`${label}.terminalLedgerLength exceeds 128.`);
  const workspaceGeneration = integerOrNull(record.workspaceGeneration, `${label}.workspaceGeneration`);
  const aiWorkspaceGeneration = integerOrNull(record.aiWorkspaceGeneration, `${label}.aiWorkspaceGeneration`);
  const documentDigest = digestOrNull(record.documentDigest, `${label}.documentDigest`);
  const aiCanonicalDocumentDigest = digestOrNull(record.aiCanonicalDocumentDigest, `${label}.aiCanonicalDocumentDigest`);
  const workspaceInstanceDigest = digestOrNull(record.workspaceInstanceDigest, `${label}.workspaceInstanceDigest`);
  const aiWorkspaceInstanceDigest = digestOrNull(record.aiWorkspaceInstanceDigest, `${label}.aiWorkspaceInstanceDigest`);
  const result: StickPhase4CheckpointV1 = {
    checkpointVersion: 4,
    rootStatus,
    documentDigestStatus,
    editorRootDigest: digestOrNull(record.editorRootDigest, `${label}.editorRootDigest`),
    workspaceRootDigest: digestOrNull(record.workspaceRootDigest, `${label}.workspaceRootDigest`),
    documentDigest,
    documentRevision: integerOrNull(record.documentRevision, `${label}.documentRevision`),
    viewDigest: digestOrNull(record.viewDigest, `${label}.viewDigest`),
    historyRootDigest: digestOrNull(record.historyRootDigest, `${label}.historyRootDigest`),
    undoDepth: integer(record.undoDepth, `${label}.undoDepth`),
    redoDepth: integer(record.redoDepth, `${label}.redoDepth`),
    lastSavedDocumentDigest: digestOrNull(record.lastSavedDocumentDigest, `${label}.lastSavedDocumentDigest`),
    dirty,
    workspaceInstanceDigest,
    workspaceGeneration,
    storageDigest: digestOrNull(record.storageDigest, `${label}.storageDigest`),
    currentFrameIndex: integer(record.currentFrameIndex, `${label}.currentFrameIndex`),
    selectedTimelineIndex: integer(record.selectedTimelineIndex, `${label}.selectedTimelineIndex`),
    gestureState: null,
    dragPreviewPoint: null,
    completedEditCount: integer(record.completedEditCount, `${label}.completedEditCount`),
    playbackState: enumeration(record.playbackState, ["paused", "playing"] as const, `${label}.playbackState`),
    playbackFrameIndex: integer(record.playbackFrameIndex, `${label}.playbackFrameIndex`),
    playbackControlAvailable,
    mountedOpenStatus,
    mountedOpenOperationDigest: digestOrNull(record.mountedOpenOperationDigest, `${label}.mountedOpenOperationDigest`),
    onionEnabled,
    previousOnionRenderInputDigest: digestOrNull(record.previousOnionRenderInputDigest, `${label}.previousOnionRenderInputDigest`),
    nextOnionRenderInputDigest: digestOrNull(record.nextOnionRenderInputDigest, `${label}.nextOnionRenderInputDigest`),
    readyDocumentPublicationCount: integer(record.readyDocumentPublicationCount, `${label}.readyDocumentPublicationCount`),
    workspaceRootTransitionCount: integer(record.workspaceRootTransitionCount, `${label}.workspaceRootTransitionCount`),
    aiRootDigest: digestOrNull(record.aiRootDigest, `${label}.aiRootDigest`),
    aiCanonicalDocumentDigest,
    aiCanonicalHistoryRootDigest: digestOrNull(record.aiCanonicalHistoryRootDigest, `${label}.aiCanonicalHistoryRootDigest`),
    aiWorkspaceInstanceDigest,
    aiWorkspaceGeneration,
    transactionStateDigest: digestOrNull(record.transactionStateDigest, `${label}.transactionStateDigest`),
    activeTransactionPhase,
    activeTransactionDigest,
    terminalLedgerDigest: digest(record.terminalLedgerDigest, `${label}.terminalLedgerDigest`),
    terminalLedgerLength,
    pendingApplyOperationDigest,
    lastCommandOutcomeCode,
    lastCommandResultDigest: digestOrNull(record.lastCommandResultDigest, `${label}.lastCommandResultDigest`),
    commandRootTransitionCount: integer(record.commandRootTransitionCount, `${label}.commandRootTransitionCount`),
  };
  if (rootStatus === "ready") for (const [field, fieldValue] of Object.entries({
    editorRootDigest: result.editorRootDigest,
    workspaceRootDigest: result.workspaceRootDigest,
    documentDigest: result.documentDigest,
    documentRevision: result.documentRevision,
    viewDigest: result.viewDigest,
    historyRootDigest: result.historyRootDigest,
    workspaceInstanceDigest: result.workspaceInstanceDigest,
    workspaceGeneration: result.workspaceGeneration,
  })) if (fieldValue === null) fail(`${label}.${field} is required while ready.`);
  const hasAiRoot = result.aiRootDigest !== null;
  for (const [field, fieldValue] of Object.entries({
    aiCanonicalDocumentDigest: result.aiCanonicalDocumentDigest,
    aiCanonicalHistoryRootDigest: result.aiCanonicalHistoryRootDigest,
    aiWorkspaceInstanceDigest: result.aiWorkspaceInstanceDigest,
    aiWorkspaceGeneration: result.aiWorkspaceGeneration,
    transactionStateDigest: result.transactionStateDigest,
  })) exact(fieldValue !== null, hasAiRoot, `${label}.${field} AI-root nullability`);
  if (!hasAiRoot) {
    exact(result.activeTransactionPhase, "idle", `${label} absent AI root active phase`);
    exact(result.activeTransactionDigest, null, `${label} absent AI root active digest`);
    exact(result.pendingApplyOperationDigest, null, `${label} absent AI root pending publication`);
    exact(result.lastCommandOutcomeCode, null, `${label} absent AI root last outcome`);
    exact(result.lastCommandResultDigest, null, `${label} absent AI root last result`);
  }
  if (result.lastCommandOutcomeCode === "requesting") {
    exact(result.lastCommandResultDigest, null, `${label} requesting command result`);
  } else {
    exact(result.lastCommandResultDigest === null, result.lastCommandOutcomeCode === null, `${label} last command tuple nullability`);
  }
  return result;
};

const parseBinding = (value: unknown, label: string): FileBinding => {
  const record = object(value, ["path", "byteLength", "sha256"], label);
  return {path: assertSafeRepositoryPath(record.path, `${label}.path`), byteLength: integer(record.byteLength, `${label}.byteLength`), sha256: digest(record.sha256, `${label}.sha256`)};
};

const parseBrowserExecutableBinding = (value: unknown, label: string): ExternalFileBinding => {
  const record = object(value, ["path", "byteLength", "sha256"], label);
  exact(record.path, BROWSER_EXECUTABLE, `${label}.path`);
  const byteLength = integer(record.byteLength, `${label}.byteLength`);
  if (byteLength === 0) fail(`${label}.byteLength must be positive.`);
  return {path: BROWSER_EXECUTABLE, byteLength, sha256: digest(record.sha256, `${label}.sha256`)};
};

const sha256 = (bytes: Uint8Array): Digest => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const safeAbsolutePath = (root: string, repositoryPath: string): string => {
  const safe = assertSafeRepositoryPath(repositoryPath);
  const realRoot = realpathSync(root);
  const absolute = resolve(realRoot, safe);
  if (absolute !== realRoot && !absolute.startsWith(`${realRoot}${sep}`)) fail(`Path escapes repository root: ${safe}.`);
  let cursor = realRoot;
  for (const part of safe.split("/")) {
    cursor = resolve(cursor, part);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(`Symlink path is forbidden: ${safe}.`);
  }
  return absolute;
};

export const bindRepositoryFile = (root: string, path: string): FileBinding => {
  const safe = assertSafeRepositoryPath(path);
  const bytes = readFileSync(safeAbsolutePath(root, safe));
  return {path: safe, byteLength: bytes.byteLength, sha256: sha256(bytes)};
};

const verifyBinding = (root: string, binding: FileBinding, label: string) => exact(bindRepositoryFile(root, binding.path), binding, label);

const bindBrowserExecutable = (): ExternalFileBinding => {
  const stat = lstatSync(BROWSER_EXECUTABLE);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("Browser executable must be a regular non-symlink file.");
  exact(realpathSync(BROWSER_EXECUTABLE), BROWSER_EXECUTABLE, "browser executable real path");
  const bytes = readFileSync(BROWSER_EXECUTABLE);
  return {path: BROWSER_EXECUTABLE, byteLength: bytes.byteLength, sha256: sha256(bytes)};
};

const duplicateJsonKeys = (fileName: string, source: string) => {
  const ts = loadTypeScriptRuntime();
  const parsed = ts.parseJsonText(fileName, source);
  const diagnostics = (parsed as tsTypes.JsonSourceFile & {parseDiagnostics?: readonly tsTypes.Diagnostic[]}).parseDiagnostics ?? [];
  if (diagnostics.length > 0) fail(`${fileName} is not valid strict JSON.`);
  const visit = (node: tsTypes.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set<string>();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) throw new Error(`${fileName} contains unsupported JSON syntax.`);
        const assignment: tsTypes.PropertyAssignment = property;
        const name = assignment.name;
        const key = ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isIdentifier(name) ? name.text : fail(`${fileName} contains a computed JSON key.`);
        if (names.has(key)) fail(`${fileName} contains duplicate JSON key ${key}.`);
        names.add(key);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
};

export const parseStrictJson = (source: string, label = "JSON document"): unknown => {
  let value: unknown;
  try { value = JSON.parse(source) as unknown; } catch { return fail(`${label} is not strict JSON.`); }
  duplicateJsonKeys(label, source);
  return value;
};

const readStrictJson = (root: string, path: string): unknown => {
  const source = readFileSync(safeAbsolutePath(root, path), "utf8");
  return parseStrictJson(source, path);
};

export const parseBrowserProofCli = (argv: string[]): BrowserProofCli => {
  let runBase: string | null = null;
  let planPath: string | null = null;
  const seen = new Set<string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (match === null) throw new Error(`Unsupported browser-proof argument: ${argument}`);
    const key = match[1] ?? fail(`Missing browser-proof argument key: ${argument}`);
    const argumentValue = match[2] ?? fail(`Missing browser-proof argument value: ${argument}`);
    if (seen.has(key)) fail(`Duplicate browser-proof argument: ${argument}`);
    seen.add(key);
    if (key === "run-base") runBase = gitSha(argumentValue, "--run-base");
    else if (key === "plan") planPath = assertSafeRepositoryPath(argumentValue, "--plan");
    else fail(`Unsupported browser-proof argument: ${argument}`);
  }
  if (runBase !== null && planPath !== null) fail("--run-base cannot be combined with --plan.");
  return planPath === null ? {mode: "legacy", runBase} : {mode: "extension", planPath};
};

const PLAN_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-plan.schema.json";
const REGISTRY_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-registry.schema.json";
const RESULT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v2/tester-extension-result.schema.json";
const PHASE2_PLAN_PATH = "scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json";
const PHASE2_REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v1/phase-2-action-registry.json";
const PHASE2_ADAPTER_PATH = "scripts/spec0001-browser/actions/phase2.ts";
const PHASE3_PLAN_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v3/tester-extension-plan.schema.json";
const PHASE3_REGISTRY_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v3/tester-extension-registry.schema.json";
const PHASE3_RESULT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v3/tester-extension-result.schema.json";
const PHASE3_PLAN_PATH = "scripts/fixtures/stick-ai/v1/phase-3-browser-proof-plan.json";
const PHASE3_REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v1/phase-3-action-registry.json";
const PHASE3_ADAPTER_PATH = "scripts/spec0001-browser/actions/phase3.ts";
const PHASE4_PLAN_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v4/tester-extension-plan.schema.json";
const PHASE4_REGISTRY_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v4/tester-extension-registry.schema.json";
const PHASE4_RESULT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v4/tester-extension-result.schema.json";
const PHASE4_PLAN_PATH = "scripts/fixtures/stick-ai/v1/phase-4-browser-proof-plan.json";
const PHASE4_REGISTRY_PATH = "scripts/fixtures/spec0001-browser/v1/phase-4-action-registry.json";
const PHASE4_ADAPTER_PATH = "scripts/spec0001-browser/actions/phase4.ts";
const PHASE5_PLAN_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v5/tester-extension-plan.schema.json" as const;
const PHASE5_REGISTRY_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v5/tester-extension-registry.schema.json" as const;
const PHASE5_RESULT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v5/tester-extension-result.schema.json" as const;
const PHASE6_PLAN_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v6/tester-extension-plan.schema.json" as const;
const PHASE6_REGISTRY_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v6/tester-extension-registry.schema.json" as const;
const PHASE6_RESULT_SCHEMA_PATH = "scripts/fixtures/spec0001-browser/v6/tester-extension-result.schema.json" as const;

const parseCatalogFile = (value: unknown, label: string, expected: {path: string; schemaPath: string; versionKey: "planVersion" | "registryVersion"; version: 2 | 3 | 4}, materialized: boolean) => {
  const keys = materialized ? ["path", "schemaPath", expected.versionKey, "byteLength", "sha256"] : ["path", "schemaPath", expected.versionKey];
  const record = object(value, keys, label);
  exact(assertSafeRepositoryPath(record.path, `${label}.path`), expected.path, `${label}.path`);
  exact(assertSafeRepositoryPath(record.schemaPath, `${label}.schemaPath`), expected.schemaPath, `${label}.schemaPath`);
  exact(record[expected.versionKey], expected.version, `${label}.${expected.versionKey}`);
  return {
    path: expected.path,
    schemaPath: expected.schemaPath,
    [expected.versionKey]: expected.version,
    ...(materialized ? {byteLength: integer(record.byteLength, `${label}.byteLength`), sha256: digest(record.sha256, `${label}.sha256`)} : {}),
  } as ValidatedAuthorization["plan"] | ValidatedAuthorization["registry"];
};

const parseCatalogAdapter = (value: unknown, expectedPath: string, materialized: boolean) => {
  const keys = materialized ? ["path", "grammarId", "declarationVersion", "byteLength", "sha256"] : ["path", "grammarId", "declarationVersion"];
  const record = object(value, keys, "authorization.adapter");
  exact(assertSafeRepositoryPath(record.path), expectedPath, "authorization.adapter.path");
  exact(record.grammarId, "spec0001-browser-adapter-declaration/v1", "authorization.adapter.grammarId");
  exact(record.declarationVersion, 1, "authorization.adapter.declarationVersion");
  return {
    path: expectedPath,
    grammarId: "spec0001-browser-adapter-declaration/v1" as const,
    declarationVersion: 1 as const,
    ...(materialized ? {byteLength: integer(record.byteLength, "authorization.adapter.byteLength"), sha256: digest(record.sha256, "authorization.adapter.sha256")} : {}),
  };
};

const parseAuthorization = (value: unknown, expectedId: AuthorizationId): ValidatedAuthorization => {
  const record = object(value, ["authorizationId", "proofPurpose", "materializationKind", "plan", "registry", "adapter", "resultSchema", "operationFamilies", "outputRoot", "pathCeiling"], `authorization ${expectedId}`);
  exact(record.authorizationId, expectedId, "authorizationId");
  const synthetic = expectedId === "phase-1.5-compatibility-synthetic/v1";
  const phase3 = expectedId === "phase-3/v1";
  const phase4 = expectedId === "phase-4/v1";
  const materialized = synthetic;
  const proofPurpose = synthetic ? "phase-1.5-compatibility-synthetic" : phase4 ? "phase-4" : phase3 ? "phase-3" : "phase-2";
  exact(record.proofPurpose, proofPurpose, "authorization.proofPurpose");
  exact(record.materializationKind, materialized ? "materialized" : "deferred", "authorization.materializationKind");
  const planPath = synthetic ? COMPATIBILITY_PLAN_PATH : phase4 ? PHASE4_PLAN_PATH : phase3 ? PHASE3_PLAN_PATH : PHASE2_PLAN_PATH;
  const registryPath = synthetic ? COMPATIBILITY_REGISTRY_PATH : phase4 ? PHASE4_REGISTRY_PATH : phase3 ? PHASE3_REGISTRY_PATH : PHASE2_REGISTRY_PATH;
  const adapterPath = synthetic ? COMPATIBILITY_ADAPTER_PATH : phase4 ? PHASE4_ADAPTER_PATH : phase3 ? PHASE3_ADAPTER_PATH : PHASE2_ADAPTER_PATH;
  const version = phase4 ? 4 : phase3 ? 3 : 2;
  const planSchemaPath = phase4 ? PHASE4_PLAN_SCHEMA_PATH : phase3 ? PHASE3_PLAN_SCHEMA_PATH : PLAN_SCHEMA_PATH;
  const registrySchemaPath = phase4 ? PHASE4_REGISTRY_SCHEMA_PATH : phase3 ? PHASE3_REGISTRY_SCHEMA_PATH : REGISTRY_SCHEMA_PATH;
  const resultSchemaPath = phase4 ? PHASE4_RESULT_SCHEMA_PATH : phase3 ? PHASE3_RESULT_SCHEMA_PATH : RESULT_SCHEMA_PATH;
  const plan = parseCatalogFile(record.plan, "authorization.plan", {path: planPath, schemaPath: planSchemaPath, versionKey: "planVersion", version}, materialized) as ValidatedAuthorization["plan"];
  const registry = parseCatalogFile(record.registry, "authorization.registry", {path: registryPath, schemaPath: registrySchemaPath, versionKey: "registryVersion", version}, materialized) as ValidatedAuthorization["registry"];
  const adapter = parseCatalogAdapter(record.adapter, adapterPath, materialized);
  const resultSchemaRecord = object(record.resultSchema, ["path", "resultVersion"], "authorization.resultSchema");
  exact(resultSchemaRecord.path, resultSchemaPath, "authorization.resultSchema.path");
  exact(resultSchemaRecord.resultVersion, version, "authorization.resultSchema.resultVersion");
  const operationFamilies = canonicalStrings(record.operationFamilies, "authorization.operationFamilies").map((entry) => enumeration(entry, OPERATION_FAMILIES, "authorization operation family"));
  exact(operationFamilies, [...OPERATION_FAMILIES], "authorization operation families");
  const outputRoot = assertSafeRepositoryPath(record.outputRoot, "authorization.outputRoot");
  exact(outputRoot, synthetic ? COMPATIBILITY_OUTPUT_ROOT : phase4 ? "output/spec-0001/phase-4" : phase3 ? "output/spec-0001/phase-3" : "output/spec-0001/phase-2-ui-restoration-correction", "authorization.outputRoot");
  const pathCeiling = (phase3 || phase4 ? canonicalProofPaths : canonicalStrings)(record.pathCeiling, "authorization.pathCeiling").map((path) => assertSafeRepositoryPath(path));
  exact(pathCeiling, synthetic ? [...CORRECTION_PATHS] : phase4 ? PHASE4_PATHS : phase3 ? PHASE3_PATHS : [...PHASE2_PATHS], "authorization.pathCeiling");
  return {
    authorizationId: expectedId,
    proofPurpose,
    materializationKind: materialized ? "materialized" : "deferred",
    plan,
    registry,
    adapter,
    resultSchema: {path: resultSchemaPath, resultVersion: version},
    operationFamilies,
    outputRoot,
    pathCeiling,
  };
};

const parsePhase5Authorization = (value: unknown): Phase5Authorization => {
  const record = object(value, ["authorizationId", "proofPurpose", "materializationKind", "plan", "registry", "resultSchema", "operationFamilies", "outputRoot", "pathCeiling"], "authorization phase-5/v1");
  exact(record.authorizationId, "phase-5/v1", "Phase 5 authorizationId");
  exact(record.proofPurpose, "phase-5", "Phase 5 proofPurpose");
  exact(record.materializationKind, "deferred", "Phase 5 materializationKind");
  const planRecord = object(record.plan, ["path", "schemaPath", "planVersion"], "Phase 5 authorization.plan");
  exact(planRecord, {path: PHASE5_PLAN_PATH, schemaPath: PHASE5_PLAN_SCHEMA_PATH, planVersion: 5}, "Phase 5 authorization.plan");
  const registryRecord = object(record.registry, ["path", "schemaPath", "registryVersion"], "Phase 5 authorization.registry");
  exact(registryRecord, {path: PHASE5_REGISTRY_PATH, schemaPath: PHASE5_REGISTRY_SCHEMA_PATH, registryVersion: 5}, "Phase 5 authorization.registry");
  const resultSchemaRecord = object(record.resultSchema, ["path", "resultVersion"], "Phase 5 authorization.resultSchema");
  exact(resultSchemaRecord, {path: PHASE5_RESULT_SCHEMA_PATH, resultVersion: 5}, "Phase 5 authorization.resultSchema");
  const operationFamilies = canonicalStrings(record.operationFamilies, "Phase 5 authorization.operationFamilies")
    .map((entry) => enumeration(entry, PHASE5_ROUTE_OPERATION_FAMILIES, "Phase 5 authorization operation family"));
  exact(operationFamilies, [...PHASE5_ROUTE_OPERATION_FAMILIES], "Phase 5 authorization operation families");
  const outputRoot = assertSafeRepositoryPath(record.outputRoot, "Phase 5 authorization.outputRoot");
  exact(outputRoot, PHASE5_OUTPUT_ROOT, "Phase 5 authorization.outputRoot");
  const pathCeiling = canonicalProofPaths(record.pathCeiling, "Phase 5 authorization.pathCeiling").map((path) => assertSafeRepositoryPath(path));
  exact(pathCeiling, PHASE5_PATHS, "Phase 5 authorization.pathCeiling");
  return {
    authorizationId: "phase-5/v1",
    proofPurpose: "phase-5",
    materializationKind: "deferred",
    plan: {path: PHASE5_PLAN_PATH, schemaPath: PHASE5_PLAN_SCHEMA_PATH, planVersion: 5},
    registry: {path: PHASE5_REGISTRY_PATH, schemaPath: PHASE5_REGISTRY_SCHEMA_PATH, registryVersion: 5},
    resultSchema: {path: PHASE5_RESULT_SCHEMA_PATH, resultVersion: 5},
    operationFamilies,
    outputRoot: PHASE5_OUTPUT_ROOT,
    pathCeiling,
  };
};

const parsePhase6Authorization = (value: unknown): Phase6Authorization => {
  const record = object(value, ["authorizationId", "proofPurpose", "materializationKind", "plan", "registry", "adapter", "resultSchema", "operationFamilies", "outputRoot", "pathCeiling"], "authorization phase-6/v1");
  exact(record.authorizationId, "phase-6/v1", "Phase 6 authorizationId");
  exact(record.proofPurpose, "phase-6", "Phase 6 proofPurpose");
  exact(record.materializationKind, "deferred", "Phase 6 materializationKind");
  const plan = object(record.plan, ["path", "schemaPath", "planVersion"], "Phase 6 authorization.plan");
  exact(plan, {path: PHASE6_PLAN_PATH, schemaPath: PHASE6_PLAN_SCHEMA_PATH, planVersion: 6}, "Phase 6 authorization.plan");
  const registry = object(record.registry, ["path", "schemaPath", "registryVersion"], "Phase 6 authorization.registry");
  exact(registry, {path: PHASE6_REGISTRY_PATH, schemaPath: PHASE6_REGISTRY_SCHEMA_PATH, registryVersion: 6}, "Phase 6 authorization.registry");
  const adapter = object(record.adapter, ["path", "grammarId", "declarationVersion"], "Phase 6 authorization.adapter");
  exact(adapter, {path: PHASE6_ADAPTER_PATH, grammarId: "spec0001-browser-adapter-declaration/v1", declarationVersion: 1}, "Phase 6 authorization.adapter");
  const resultSchema = object(record.resultSchema, ["path", "resultVersion"], "Phase 6 authorization.resultSchema");
  exact(resultSchema, {path: PHASE6_RESULT_SCHEMA_PATH, resultVersion: 6}, "Phase 6 authorization.resultSchema");
  const operationFamilies = canonicalStrings(record.operationFamilies, "Phase 6 authorization operationFamilies")
    .map((entry) => enumeration(entry, PHASE6_OPERATION_FAMILIES, "Phase 6 operation family"));
  exact(operationFamilies, [...PHASE6_OPERATION_FAMILIES], "Phase 6 authorization operationFamilies");
  exact(record.outputRoot, PHASE6_OUTPUT_ROOT, "Phase 6 authorization.outputRoot");
  const pathCeiling = canonicalProofPaths(record.pathCeiling, "Phase 6 authorization.pathCeiling").map((path) => assertSafeRepositoryPath(path));
  exact(pathCeiling, PHASE6_PATHS, "Phase 6 authorization.pathCeiling");
  return {
    authorizationId: "phase-6/v1", proofPurpose: "phase-6", materializationKind: "deferred",
    plan: {path: PHASE6_PLAN_PATH, schemaPath: PHASE6_PLAN_SCHEMA_PATH, planVersion: 6},
    registry: {path: PHASE6_REGISTRY_PATH, schemaPath: PHASE6_REGISTRY_SCHEMA_PATH, registryVersion: 6},
    adapter: {path: PHASE6_ADAPTER_PATH, grammarId: "spec0001-browser-adapter-declaration/v1", declarationVersion: 1},
    resultSchema: {path: PHASE6_RESULT_SCHEMA_PATH, resultVersion: 6},
    operationFamilies, outputRoot: PHASE6_OUTPUT_ROOT, pathCeiling,
  };
};

export const validateAuthorizationCatalogValue = (value: unknown): ValidatedAuthorizationCatalog => {
  const record = object(value, ["catalogVersion", "specId", "authorizations"], "tester extension authorization catalog");
  exact(record.catalogVersion, 2, "catalogVersion");
  exact(record.specId, "SPEC-0001", "catalog specId");
  const authorizations = array(record.authorizations, "catalog authorizations");
  exact(authorizations.length, 6, "catalog authorization count");
  return {
    catalogVersion: 2,
    specId: "SPEC-0001",
    authorizations: [
      parseAuthorization(authorizations[0], "phase-1.5-compatibility-synthetic/v1"),
      parseAuthorization(authorizations[1], "phase-2/v1"),
      parseAuthorization(authorizations[2], "phase-3/v1"),
      parseAuthorization(authorizations[3], "phase-4/v1"),
      parsePhase5Authorization(authorizations[4]),
      parsePhase6Authorization(authorizations[5]),
    ],
  };
};

const parsePhase5Headers = (value: unknown, label: string): Phase5HeaderTuple[] => {
  const headers = array(value, label).map((entry, index): Phase5HeaderTuple => {
    const tuple = array(entry, `${label}[${index}]`);
    exact(tuple.length, 2, `${label}[${index}] length`);
    const name = string(tuple[0], `${label}[${index}] name`);
    const headerValue = string(tuple[1], `${label}[${index}] value`);
    if (!/^[a-z0-9-]+$/.test(name)) fail(`${label}[${index}] name must be lowercase ASCII.`);
    if (/[^\x20-\x7e]/.test(headerValue)) fail(`${label}[${index}] value must be printable ASCII.`);
    return [name, headerValue];
  });
  unique(headers.map(([name]) => name), `${label} names`);
  exact(headers.map(([name]) => name), [...headers.map(([name]) => name)].sort(), `${label} canonical order`);
  return headers;
};

const parsePhase5RouteCase = (value: unknown, index: number): Phase5RouteCase => {
  const record = object(value, ["caseId", "operationKind", "request", "expected"], `Phase 5 registry cases[${index}]`);
  const caseId = handle(record.caseId, `Phase 5 registry cases[${index}].caseId`);
  const operationKind = enumeration(record.operationKind, ["marked-availability-get", "marked-raw-stick-post", "marker-free-drawing-fallthrough-post"] as const, `Phase 5 case ${caseId} operationKind`);
  const requestRecord = object(record.request, ["method", "path", "headers", "body"], `Phase 5 case ${caseId} request`);
  const method = enumeration(requestRecord.method, ["GET", "POST"] as const, `Phase 5 case ${caseId} method`);
  if ((operationKind === "marked-availability-get") !== (method === "GET")) fail(`Phase 5 case ${caseId} operation/method mismatch.`);
  exact(requestRecord.path, "/api/ai", `Phase 5 case ${caseId} path`);
  const headers = parsePhase5Headers(requestRecord.headers, `Phase 5 case ${caseId} request headers`);
  const bodyRecord = object(requestRecord.body, ["encoding", "byteLength", "sha256", "data"], `Phase 5 case ${caseId} request body`);
  exact(bodyRecord.encoding, "base64", `Phase 5 case ${caseId} body encoding`);
  const bodyData = typeof bodyRecord.data === "string" ? bodyRecord.data : fail(`Phase 5 case ${caseId} body data must be a string.`);
  const bodyBytes = Buffer.from(bodyData, "base64");
  exact(bodyBytes.toString("base64"), bodyData, `Phase 5 case ${caseId} canonical base64`);
  const body = {
    encoding: "base64" as const,
    byteLength: integer(bodyRecord.byteLength, `Phase 5 case ${caseId} body byteLength`),
    sha256: digest(bodyRecord.sha256, `Phase 5 case ${caseId} body sha256`),
    data: bodyData,
  };
  exact(body.byteLength, bodyBytes.byteLength, `Phase 5 case ${caseId} bound request length`);
  exact(body.sha256, sha256(bodyBytes), `Phase 5 case ${caseId} bound request digest`);
  if (method === "GET") exact(body.byteLength, 0, `Phase 5 case ${caseId} GET body length`);
  const contentLength = headers.find(([name]) => name === "content-length")?.[1];
  if (method === "POST") exact(contentLength, String(body.byteLength), `Phase 5 case ${caseId} content-length`);

  const expectedRecord = object(record.expected, ["outcome", "status", "headers", "body", "legacyCheckpoint", "logAssertions", "nonLoopbackAttempts"], `Phase 5 case ${caseId} expected`);
  const outcome = enumeration(expectedRecord.outcome, ["exact-response", "legacy-fallthrough"] as const, `Phase 5 case ${caseId} outcome`);
  exact(outcome, operationKind === "marker-free-drawing-fallthrough-post" ? "legacy-fallthrough" : "exact-response", `Phase 5 case ${caseId} operation/outcome`);
  const status = integer(expectedRecord.status, `Phase 5 case ${caseId} status`);
  if (status < 100 || status > 599) fail(`Phase 5 case ${caseId} status is outside the HTTP range.`);
  const expectedHeaders = parsePhase5Headers(expectedRecord.headers, `Phase 5 case ${caseId} expected headers`);
  let expectedBody: Phase5RouteCase["expected"]["body"];
  if (expectedRecord.body === null) {
    expectedBody = null;
  } else {
    const expectedBodyRecord = object(expectedRecord.body, ["byteLength", "sha256"], `Phase 5 case ${caseId} expected body`);
    expectedBody = {byteLength: integer(expectedBodyRecord.byteLength, `Phase 5 case ${caseId} expected body length`), sha256: digest(expectedBodyRecord.sha256, `Phase 5 case ${caseId} expected body digest`)};
  }
  if (outcome === "exact-response" && expectedBody === null) fail(`Phase 5 exact-response case ${caseId} requires a body binding.`);
  let legacyCheckpoint: Phase5RouteCase["expected"]["legacyCheckpoint"];
  if (expectedRecord.legacyCheckpoint === null) {
    legacyCheckpoint = null;
  } else {
    const checkpointRecord = object(expectedRecord.legacyCheckpoint, ["checkpointKind", "expectedJsonFields"], `Phase 5 case ${caseId} legacy checkpoint`);
    if (!isRecord(checkpointRecord.expectedJsonFields)) fail(`Phase 5 case ${caseId} expectedJsonFields must be an object.`);
    const expectedJsonFields = checkpointRecord.expectedJsonFields as Record<string, unknown>;
    legacyCheckpoint = {checkpointKind: handle(checkpointRecord.checkpointKind, `Phase 5 case ${caseId} checkpointKind`), expectedJsonFields};
  }
  exact(legacyCheckpoint === null, outcome === "exact-response", `Phase 5 case ${caseId} checkpoint/outcome`);
  const logRecord = object(expectedRecord.logAssertions, ["forbiddenSubstrings", "rawBodyMustNotAppear"], `Phase 5 case ${caseId} log assertions`);
  const forbiddenSubstrings = array(logRecord.forbiddenSubstrings, `Phase 5 case ${caseId} forbiddenSubstrings`).map((entry, forbiddenIndex) => string(entry, `Phase 5 case ${caseId} forbiddenSubstrings[${forbiddenIndex}]`));
  unique(forbiddenSubstrings, `Phase 5 case ${caseId} forbiddenSubstrings`);
  exact(logRecord.rawBodyMustNotAppear, true, `Phase 5 case ${caseId} raw-body log rule`);
  exact(expectedRecord.nonLoopbackAttempts, 0, `Phase 5 case ${caseId} non-loopback attempts`);
  return {
    caseId,
    operationKind,
    request: {method, path: "/api/ai", headers, body},
    expected: {outcome, status, headers: expectedHeaders, body: expectedBody, legacyCheckpoint, logAssertions: {forbiddenSubstrings, rawBodyMustNotAppear: true}, nonLoopbackAttempts: 0},
  };
};

export const validatePhase5RouteRegistryValue = (value: unknown): Phase5RouteRegistry => {
  const record = object(value, ["registryVersion", "specId", "authorizationId", "operationFamilies", "cases"], "Phase 5 route registry");
  exact(record.registryVersion, 5, "Phase 5 registryVersion");
  exact(record.specId, "SPEC-0001", "Phase 5 registry specId");
  exact(record.authorizationId, "phase-5/v1", "Phase 5 registry authorizationId");
  const operationFamilies = canonicalStrings(record.operationFamilies, "Phase 5 registry operationFamilies")
    .map((entry) => enumeration(entry, PHASE5_ROUTE_OPERATION_FAMILIES, "Phase 5 registry operation family"));
  exact(operationFamilies, [...PHASE5_ROUTE_OPERATION_FAMILIES], "Phase 5 registry operationFamilies");
  const cases = array(record.cases, "Phase 5 registry cases").map(parsePhase5RouteCase);
  if (cases.length === 0) fail("Phase 5 route registry must contain at least one case.");
  unique(cases.map((entry) => entry.caseId), "Phase 5 route case IDs");
  const observedKinds = [...new Set(cases.map((entry) => entry.operationKind))].sort();
  exact(observedKinds, ["marked-availability-get", "marked-raw-stick-post", "marker-free-drawing-fallthrough-post"].sort(), "Phase 5 route operation coverage");
  return {registryVersion: 5, specId: "SPEC-0001", authorizationId: "phase-5/v1", operationFamilies, cases};
};

export const validatePhase5RoutePlanValue = (value: unknown): Phase5RoutePlan => {
  const record = object(value, ["planVersion", "specId", "proofPurpose", "authorizationId", "baseCommit", "dirtyExpectedPaths", "cleanExpectedPaths", "outputRoot", "operationFamilies", "registry", "selectedCaseIds", "evidence"], "Phase 5 route plan");
  exact(record.planVersion, 5, "Phase 5 planVersion");
  exact(record.specId, "SPEC-0001", "Phase 5 plan specId");
  exact(record.proofPurpose, "phase-5", "Phase 5 plan proofPurpose");
  exact(record.authorizationId, "phase-5/v1", "Phase 5 plan authorizationId");
  exact(record.baseCommit, PHASE5_BASE_COMMIT, "Phase 5 plan baseCommit");
  const dirtyExpectedPaths = canonicalProofPaths(record.dirtyExpectedPaths, "Phase 5 dirtyExpectedPaths").map((path) => assertSafeRepositoryPath(path));
  if (dirtyExpectedPaths.length < PHASE5_DIRTY_PATHS.length || dirtyExpectedPaths.length > PHASE5_PATHS.length) fail("Phase 5 dirtyExpectedPaths count is outside the 22–24 boundary.");
  for (const path of PHASE5_DIRTY_PATHS) if (!dirtyExpectedPaths.includes(path)) fail(`Missing mandatory Phase 5 dirty path: ${path}.`);
  for (const path of dirtyExpectedPaths) if (!PHASE5_PATHS.includes(path)) fail(`Unauthorized Phase 5 dirty path: ${path}.`);
  exact(record.cleanExpectedPaths, [], "Phase 5 cleanExpectedPaths");
  exact(record.outputRoot, PHASE5_OUTPUT_ROOT, "Phase 5 outputRoot");
  const operationFamilies = canonicalStrings(record.operationFamilies, "Phase 5 plan operationFamilies")
    .map((entry) => enumeration(entry, PHASE5_ROUTE_OPERATION_FAMILIES, "Phase 5 plan operation family"));
  exact(operationFamilies, [...PHASE5_ROUTE_OPERATION_FAMILIES], "Phase 5 plan operationFamilies");
  const registry = parseBinding(record.registry, "Phase 5 plan registry binding");
  exact(registry.path, PHASE5_REGISTRY_PATH, "Phase 5 plan registry path");
  const selectedCaseIds = array(record.selectedCaseIds, "Phase 5 selectedCaseIds").map((entry, index) => handle(entry, `Phase 5 selectedCaseIds[${index}]`));
  if (selectedCaseIds.length === 0) fail("Phase 5 selectedCaseIds must be nonempty.");
  unique(selectedCaseIds, "Phase 5 selectedCaseIds");
  const evidenceRecord = object(record.evidence, ["routePath", "requestTransport", "exactRequestBytes", "exactResponseBindings", "legacyDrawingFallthrough", "sanitizedServerLogs", "browserPageOperations", "screenshotClaims", "nonLoopbackAttempts", "cleanupFields"], "Phase 5 plan evidence");
  const expectedEvidence = {
    routePath: "/api/ai",
    requestTransport: "guarded-node-loopback-http-exact-bytes/v1",
    exactRequestBytes: true,
    exactResponseBindings: true,
    legacyDrawingFallthrough: true,
    sanitizedServerLogs: true,
    browserPageOperations: 0,
    screenshotClaims: 0,
    nonLoopbackAttempts: 0,
    cleanupFields: ["anchorRestored", "sourceRestored", "browserContextsOpen", "activeGates", "activeIntercepts", "openChildProcesses", "openPorts", "residualPaths", "residualProfiles"],
  } as const;
  exact(evidenceRecord, expectedEvidence, "Phase 5 plan evidence");
  return {planVersion: 5, specId: "SPEC-0001", proofPurpose: "phase-5", authorizationId: "phase-5/v1", baseCommit: PHASE5_BASE_COMMIT, dirtyExpectedPaths, cleanExpectedPaths: [], outputRoot: PHASE5_OUTPUT_ROOT, operationFamilies, registry, selectedCaseIds, evidence: {...expectedEvidence, cleanupFields: [...expectedEvidence.cleanupFields]}};
};

export const validatePhase6RegistryValue = (value: unknown): Phase6Registry => {
  const record = object(value, ["registryVersion", "specId", "authorizationId", "operationFamilies", "adapter", "fixtures", "actions"], "Phase 6 registry");
  exact(record.registryVersion, 6, "Phase 6 registryVersion");
  exact(record.specId, "SPEC-0001", "Phase 6 registry specId");
  exact(record.authorizationId, "phase-6/v1", "Phase 6 registry authorizationId");
  const operationFamilies = canonicalStrings(record.operationFamilies, "Phase 6 registry operationFamilies")
    .map((entry) => enumeration(entry, PHASE6_OPERATION_FAMILIES, "Phase 6 registry operation family"));
  exact(operationFamilies, [...PHASE6_OPERATION_FAMILIES], "Phase 6 registry operationFamilies");
  const adapter = parseBinding(record.adapter, "Phase 6 registry adapter");
  exact(adapter.path, PHASE6_ADAPTER_PATH, "Phase 6 adapter path");
  const fixtures = array(record.fixtures, "Phase 6 registry fixtures").map((entry, index) => parseBinding(entry, `Phase 6 fixture ${index}`));
  exact(fixtures.map((entry) => entry.path), [
    "scripts/fixtures/stick-ai/v2/stick-ai-intent-cases.json",
    "scripts/fixtures/stick-ai/v2/stick-ai-ui-cases.json",
    "scripts/fixtures/stick-ai/v2/stick-ai-creator-preservation-cases.json",
  ], "Phase 6 fixture paths");
  const actions = array(record.actions, "Phase 6 registry actions").map((entry, index): Phase6Action => {
    const action = object(entry, ["actionId", "kind", "caseId"], `Phase 6 action ${index}`);
    return {
      actionId: handle(action.actionId, `Phase 6 action ${index} ID`),
      kind: enumeration(action.kind, ["visible-preview-cancel", "visible-rejection", "visible-apply-regression", "visible-invalid-response", "visible-project-switch", "protected-regression"] as const, `Phase 6 action ${index} kind`),
      caseId: action.caseId === null ? null : handle(action.caseId, `Phase 6 action ${index} caseId`),
    };
  });
  exact(actions.length, 33, "Phase 6 action count");
  unique(actions.map((entry) => entry.actionId), "Phase 6 action IDs");
  exact(actions.filter((entry) => entry.kind === "visible-preview-cancel").map((entry) => entry.caseId), Array.from({length: 15}, (_, index) => `A${String(index + 1).padStart(2, "0")}`), "Phase 6 accepted visible case set");
  exact(actions.filter((entry) => entry.kind === "visible-rejection").map((entry) => entry.caseId), ["R01","R05","R10","R12","R17","R19","R22","R24","R26","R29","R30","R31","R35"], "Phase 6 visible rejection set");
  return {registryVersion: 6, specId: "SPEC-0001", authorizationId: "phase-6/v1", operationFamilies, adapter, fixtures, actions};
};

export const validatePhase6PlanValue = (value: unknown): Phase6Plan => {
  const record = object(value, ["planVersion", "specId", "proofPurpose", "authorizationId", "baseCommit", "dirtyExpectedPaths", "cleanExpectedPaths", "outputRoot", "operationFamilies", "registry", "selectedActionIds", "evidence"], "Phase 6 plan");
  exact(record.planVersion, 6, "Phase 6 planVersion");
  exact(record.specId, "SPEC-0001", "Phase 6 plan specId");
  exact(record.proofPurpose, "phase-6", "Phase 6 plan proofPurpose");
  exact(record.authorizationId, "phase-6/v1", "Phase 6 plan authorizationId");
  exact(record.baseCommit, PHASE6_BASE_COMMIT, "Phase 6 plan baseCommit");
  const dirtyExpectedPaths = canonicalProofPaths(record.dirtyExpectedPaths, "Phase 6 dirtyExpectedPaths").map((path) => assertSafeRepositoryPath(path));
  exact(dirtyExpectedPaths, PHASE6_PATHS.filter((path) => path !== "src/components/workspace/ai/WorkspaceAiPanelShell.tsx"), "Phase 6 correction exact dirty subset within the 26-path ceiling");
  exact(record.cleanExpectedPaths, [], "Phase 6 cleanExpectedPaths");
  exact(record.outputRoot, PHASE6_OUTPUT_ROOT, "Phase 6 outputRoot");
  const operationFamilies = canonicalStrings(record.operationFamilies, "Phase 6 plan operationFamilies")
    .map((entry) => enumeration(entry, PHASE6_OPERATION_FAMILIES, "Phase 6 plan operation family"));
  exact(operationFamilies, [...PHASE6_OPERATION_FAMILIES], "Phase 6 plan operationFamilies");
  const registry = parseBinding(record.registry, "Phase 6 plan registry");
  exact(registry.path, PHASE6_REGISTRY_PATH, "Phase 6 plan registry path");
  const selectedActionIds = array(record.selectedActionIds, "Phase 6 selectedActionIds").map((entry, index) => handle(entry, `Phase 6 selected action ${index}`));
  exact(selectedActionIds.length, 33, "Phase 6 selected action count");
  unique(selectedActionIds, "Phase 6 selected action IDs");
  const evidence = object(record.evidence, ["viewports", "previewCopy", "acceptedVisibleCaseCount", "representativeVisibleRejectionCount", "completeApplyCount", "screenshotIds", "nonLoopbackAttempts"], "Phase 6 plan evidence");
  exact(evidence.viewports, [{width: 1440, height: 900}, {width: 1024, height: 768}], "Phase 6 proof viewports");
  exact(evidence.previewCopy, "Understood: one stick figure, a three-pose wave, 12 frames at 12 FPS. No changes have been made.", "Phase 6 preview copy");
  exact(evidence.acceptedVisibleCaseCount, 15, "Phase 6 accepted visible count");
  exact(evidence.representativeVisibleRejectionCount, 13, "Phase 6 rejection visible count");
  exact(evidence.completeApplyCount, 1, "Phase 6 complete Apply count");
  exact(evidence.nonLoopbackAttempts, 0, "Phase 6 non-loopback attempts");
  return {planVersion: 6, specId: "SPEC-0001", proofPurpose: "phase-6", authorizationId: "phase-6/v1", baseCommit: PHASE6_BASE_COMMIT, dirtyExpectedPaths, cleanExpectedPaths: [], outputRoot: PHASE6_OUTPUT_ROOT, operationFamilies, registry, selectedActionIds, evidence: evidence as Record<string, unknown>};
};

const parseOperationFamilies = (value: unknown, label: string): OperationFamily[] => {
  const values = canonicalStrings(value, label).map((entry) => enumeration(entry, OPERATION_FAMILIES, `${label} entry`));
  exact(values, [...OPERATION_FAMILIES], label);
  return values;
};

const parseRegressionGroups = (value: unknown, label: string): ProtectedRegressionGroup[] => {
  const accepted = ["drawing-generate-frames", "drawing-undo-redo-play-pause", "home-new-drawing", "home-new-stick", "stick-creator-back"] as const;
  return canonicalStrings(value, label).map((entry) => enumeration(entry, accepted, `${label} entry`));
};

export const validateExtensionPlanValue = (value: unknown): ExtensionPlan => {
  const record = object(value, ["planVersion", "specId", "proofPurpose", "authorizationId", "baseCommit", "dirtyExpectedPaths", "cleanExpectedPaths", "outputRoot", "operationFamilies", "registry", "contexts", "steps", "evidence"], "extension plan");
  exact(record.specId, "SPEC-0001", "plan specId");
  const authorizationId = enumeration(record.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1", "phase-3/v1", "phase-4/v1"] as const, "plan authorizationId");
  const synthetic = authorizationId === "phase-1.5-compatibility-synthetic/v1";
  const phase3 = authorizationId === "phase-3/v1";
  const phase4 = authorizationId === "phase-4/v1";
  const planVersion = phase4 ? 4 : phase3 ? 3 : 2;
  exact(record.planVersion, planVersion, "planVersion");
  const proofPurpose = synthetic ? "phase-1.5-compatibility-synthetic" : phase4 ? "phase-4" : phase3 ? "phase-3" : "phase-2";
  exact(record.proofPurpose, proofPurpose, "plan proofPurpose");
  const baseCommit = gitSha(record.baseCommit, "plan baseCommit");
  if (synthetic) exact(baseCommit, CORRECTION_BASE_COMMIT, "correction baseCommit");
  if (phase3) exact(baseCommit, "54234b7c7b95201e274975a804859fa9c36806a1", "Phase 3 baseCommit");
  if (phase4) exact(baseCommit, PHASE4_BASE_COMMIT, "Phase 4 baseCommit");
  const dirtyExpectedPaths = (phase3 || phase4 ? canonicalProofPaths : canonicalStrings)(record.dirtyExpectedPaths, "plan dirtyExpectedPaths").map((path) => assertSafeRepositoryPath(path));
  if (synthetic) exact(dirtyExpectedPaths, [...CORRECTION_PATHS], "correction dirtyExpectedPaths");
  else if (phase3) {
    exact(dirtyExpectedPaths, PHASE3_DIRTY_PATHS, "Phase 3 dirtyExpectedPaths");
  } else if (phase4) {
    exact(dirtyExpectedPaths, PHASE4_DIRTY_PATHS, "Phase 4 dirtyExpectedPaths");
  } else {
    if (dirtyExpectedPaths.length === 0) fail("Phase 2 dirtyExpectedPaths must be nonempty.");
    if (!dirtyExpectedPaths.includes(PHASE2_PLAN_PATH) || !dirtyExpectedPaths.includes(PHASE2_REGISTRY_PATH) || !dirtyExpectedPaths.includes(PHASE2_ADAPTER_PATH)) fail("Phase 2 dirtyExpectedPaths must include its plan, registry, and adapter.");
    for (const path of dirtyExpectedPaths) if (!(PHASE2_PATHS as readonly string[]).includes(path)) fail(`Unauthorized Phase 2 dirty path: ${path}.`);
  }
  exact(record.cleanExpectedPaths, [], "plan cleanExpectedPaths");
  const outputRoot = assertSafeRepositoryPath(record.outputRoot, "plan outputRoot");
  exact(outputRoot, synthetic ? COMPATIBILITY_OUTPUT_ROOT : phase4 ? "output/spec-0001/phase-4" : phase3 ? "output/spec-0001/phase-3" : "output/spec-0001/phase-2-ui-restoration-correction", "plan outputRoot");
  const operationFamilies = parseOperationFamilies(record.operationFamilies, "plan operationFamilies");
  const registry = parseBinding(record.registry, "plan registry binding");
  exact(registry.path, synthetic ? COMPATIBILITY_REGISTRY_PATH : phase4 ? PHASE4_REGISTRY_PATH : phase3 ? PHASE3_REGISTRY_PATH : PHASE2_REGISTRY_PATH, "plan registry path");
  const contexts = array(record.contexts, "plan contexts").map((entry, index) => {
    const context = object(entry, ["contextId", "viewport"], `plan contexts[${index}]`);
    const viewport = object(context.viewport, ["width", "height"], `plan contexts[${index}].viewport`);
    const width: 1024 | 1440 = viewport.width === 1024 || viewport.width === 1440 ? viewport.width : fail("viewport width is invalid.");
    const height: 768 | 900 = viewport.height === 768 || viewport.height === 900 ? viewport.height : fail("viewport height is invalid.");
    if ((width === 1024 && height !== 768) || (width === 1440 && height !== 900)) fail("Unsupported viewport pair.");
    return {contextId: handle(context.contextId, "contextId"), viewport: {width, height}};
  });
  unique(contexts.map((entry) => entry.contextId), "plan context IDs");
  if (contexts.length === 0) fail("Plan must contain at least one context.");
  const steps = array(record.steps, "plan steps").map((entry, index) => {
    const step = object(entry, ["stepId", "actionId", "contextId"], `plan steps[${index}]`);
    const result = {stepId: handle(step.stepId, "stepId"), actionId: handle(step.actionId, "actionId"), contextId: handle(step.contextId, "step contextId")};
    if (!contexts.some((context) => context.contextId === result.contextId)) fail(`Unknown step context ${result.contextId}.`);
    return result;
  });
  unique(steps.map((entry) => entry.stepId), "plan step IDs");
  if (steps.length === 0) fail("Plan must contain at least one step.");
  const evidenceRecord = object(record.evidence, ["ledgerKinds", "screenshotIds", "protectedRegressionGroups", "productPhaseClaimed"], "plan evidence");
  const ledgerKinds = canonicalStrings(evidenceRecord.ledgerKinds, "plan ledgerKinds").map((entry) => enumeration(entry, ["action", "negative", "checkpoint", "storage", "request", "network", "console", "regression", "cleanup"] as const, "ledger kind"));
  const screenshotIds = canonicalStrings(evidenceRecord.screenshotIds, "plan screenshotIds").map((entry) => handle(entry, "screenshotId"));
  const protectedRegressionGroups = parseRegressionGroups(evidenceRecord.protectedRegressionGroups, "plan protectedRegressionGroups");
  const productPhaseClaimed = typeof evidenceRecord.productPhaseClaimed === "boolean" ? evidenceRecord.productPhaseClaimed : fail("plan productPhaseClaimed must be boolean.");
  if (productPhaseClaimed !== !synthetic) fail("plan productPhaseClaimed mismatch.");
  return {planVersion, specId: "SPEC-0001", proofPurpose, authorizationId, baseCommit, dirtyExpectedPaths, cleanExpectedPaths: [], outputRoot, operationFamilies, registry, contexts, steps, evidence: {ledgerKinds, screenshotIds, protectedRegressionGroups, productPhaseClaimed}};
};

const PHASE2_DRIVER_OPERATIONS = ["mountDocument", "dispatchCompletedJointEdit", "beginDocumentPublication", "completeDocumentPublication", "readCheckpoint"] as const;
const PHASE3_DRIVER_OPERATIONS = ["mountEditorHistoryRoot", "dispatchEditorTransaction", "beginDocumentPublication", "completeDocumentPublication", "beginMountedOpen", "completeMountedOpen", "cancelMountedOpen", "readCheckpoint"] as const;
const PHASE4_DRIVER_OPERATIONS = [
  "beginStickRequest", "abortStickRequest", "previewStickCommand", "cancelStickPreview", "applyStickCommand",
  "beginApplyPublication", "completeApplyPublication", "redeliverStickCommand", "executeInjectedTransactionFailure",
  "armNextVisibleApplyFailure", "mountEditorHistoryRoot", "beginMountedOpen", "completeMountedOpen", "readCheckpoint",
] as const;
const DRIVER_OPERATIONS = [...PHASE2_DRIVER_OPERATIONS, ...PHASE3_DRIVER_OPERATIONS, ...PHASE4_DRIVER_OPERATIONS] as const;
const ENVIRONMENT_OPERATIONS = ["installEnvironmentPlan", "releaseEnvironmentGate", "readEnvironmentCheckpoint", "clearEnvironmentPlan"] as const;
const FIXTURE_KINDS = [
  "stick-browser-environment-gate-release-v1", "stick-browser-environment-plan-v1", "stick-completed-joint-edit-v1",
  "stick-document-publication-completion-v1", "stick-document-publication-plan-v1", "stick-workspace-document-mount-v1",
  "stick-workspace-history-mount-v1", "stick-editor-transaction-v1", "stick-mounted-open-candidate-v1", "stick-mounted-open-completion-v1",
  "stick-mounted-open-cancel-v1",
  "stick-active-request-v1", "stick-request-abort-v1", "stick-command-envelope-v1", "stick-preview-cancel-v1",
  "stick-command-apply-v1", "stick-command-apply-publication-plan-v1", "stick-command-apply-publication-completion-v1",
  "stick-command-redelivery-v1", "stick-injected-transaction-failure-v1", "stick-next-visible-apply-failure-v1",
] as const;
const DRIVER_FIXTURE_KINDS: Record<typeof DRIVER_OPERATIONS[number], readonly string[]> = {
  mountDocument: ["stick-workspace-document-mount-v1"],
  dispatchCompletedJointEdit: ["stick-completed-joint-edit-v1"],
  beginDocumentPublication: ["stick-document-publication-plan-v1"],
  completeDocumentPublication: ["stick-document-publication-completion-v1"],
  readCheckpoint: [],
  mountEditorHistoryRoot: ["stick-workspace-history-mount-v1"],
  dispatchEditorTransaction: ["stick-editor-transaction-v1"],
  beginMountedOpen: ["stick-mounted-open-candidate-v1"],
  completeMountedOpen: ["stick-mounted-open-completion-v1"],
  cancelMountedOpen: ["stick-mounted-open-cancel-v1"],
  beginStickRequest: ["stick-active-request-v1"],
  abortStickRequest: ["stick-request-abort-v1"],
  previewStickCommand: ["stick-command-envelope-v1"],
  cancelStickPreview: ["stick-preview-cancel-v1"],
  applyStickCommand: ["stick-command-apply-v1"],
  beginApplyPublication: ["stick-command-apply-publication-plan-v1"],
  completeApplyPublication: ["stick-command-apply-publication-completion-v1"],
  redeliverStickCommand: ["stick-command-redelivery-v1"],
  executeInjectedTransactionFailure: ["stick-injected-transaction-failure-v1"],
  armNextVisibleApplyFailure: ["stick-next-visible-apply-failure-v1"],
};
const ENVIRONMENT_FIXTURE_KINDS: Record<typeof ENVIRONMENT_OPERATIONS[number], readonly string[]> = {
  installEnvironmentPlan: ["stick-browser-environment-plan-v1"],
  releaseEnvironmentGate: ["stick-browser-environment-gate-release-v1"],
  readEnvironmentCheckpoint: [],
  clearEnvironmentPlan: [],
};
const PHASE2_READABLE_FIXTURE_PATHS = [
  "scripts/fixtures/stick-ai/v1/fresh-stick-project.json",
  "scripts/fixtures/stick-ai/v1/manual-wave-actions.json",
  "scripts/fixtures/stick-ai/v1/manual-wave-applied-project.json",
  "scripts/fixtures/stick-ai/v1/stick-control-disposition-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-correction-affordance-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-document-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-gesture-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-manual-wave-build-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-pose-aliasing-cases.json",
  "scripts/fixtures/stick-ai/v1/wave-any-joint-corrections.json",
  "scripts/fixtures/stick-ai/v1/wave-applied-project.json",
  "scripts/fixtures/stick-ai/v1/wave-cell-resolution.json",
] as const;
const PHASE3_READABLE_FIXTURE_PATHS = [
  "scripts/fixtures/stick-ai/v1/manual-wave-saved-project.json",
  "scripts/fixtures/stick-ai/v1/non-wave-saved-project.json",
  "scripts/fixtures/stick-ai/v1/stick-history-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-history-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-manual-action-history-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-saved-projects.json",
  "scripts/fixtures/stick-ai/v1/stick-storage-cases.json",
  "scripts/fixtures/stick-ai/v1/wave-editor-history-root.json",
] as const;
const PHASE4_READABLE_FIXTURE_PATHS = [
  "scripts/fixtures/stick-ai/v1/stick-command-publication-race-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-command-transaction-cases.json",
] as const;
export const PHASE4_MATERIALIZED_FIXTURE_PATHS = [
  "scripts/fixtures/stick-ai/v1/fresh-stick-project.json",
  "scripts/fixtures/stick-ai/v1/wave-command-batch.json",
] as const;

const parseInput = (value: unknown): null | {text: string} | {key: "Enter" | "Escape" | "Space"} => {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error("visible-role input must be null or an object.");
  const record: JsonRecord = value;
  if (Object.keys(record).length !== 1) fail("visible-role input must have exactly one field.");
  if ("text" in record) return {text: string(record.text, "visible-role input text")};
  if ("key" in record) return {key: enumeration(record.key, ["Enter", "Escape", "Space"] as const, "visible-role input key")};
  return fail("visible-role input field is invalid.");
};

const parseAction = (value: unknown, index: number): NormalizedAction => {
  if (!isRecord(value)) throw new Error(`registry actions[${index}] must be an object.`);
  const actionValue: JsonRecord = value;
  const family = enumeration(actionValue.family, OPERATION_FAMILIES, `registry actions[${index}].family`);
  const actionId = handle(actionValue.actionId, `registry actions[${index}].actionId`);
  if (family === "visible-role") {
    const record = object(actionValue, ["actionId", "family", "operation", "role", "accessibleName", "input"], `visible-role action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, ["click", "fill", "press", "assert-visible", "assert-hidden", "assert-enabled", "assert-disabled"] as const, "visible-role operation"), role: handle(record.role, "visible-role role"), accessibleName: string(record.accessibleName, "visible-role accessibleName"), input: parseInput(record.input)};
  }
  if (family === "visible-testid") {
    const record = object(actionValue, ["actionId", "family", "operation", "testId"], `visible-testid action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, ["click", "assert-visible", "assert-enabled", "assert-disabled"] as const, "visible-testid operation"), testId: handle(record.testId, "visible-testid testId")};
  }
  if (family === "pointer") {
    const record = object(actionValue, ["actionId", "family", "operation", "targetId", "pointerId", "button", "point", "expectedEvidenceDigest"], `pointer action ${actionId}`);
    const point = object(record.point, ["x", "y"], "pointer point");
    exact(record.button, 0, "pointer button");
    return {actionId, family, operation: enumeration(record.operation, ["down", "move", "up", "cancel"] as const, "pointer operation"), targetId: handle(record.targetId, "pointer targetId"), pointerId: integer(record.pointerId, "pointer pointerId"), button: 0, point: {x: integer(point.x, "pointer x"), y: integer(point.y, "pointer y")}, expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "pointer expectedEvidenceDigest")};
  }
  if (family === "workspace-driver") {
    const record = object(actionValue, ["actionId", "family", "operation", "fixtureId", "operationId", "expectedEvidenceDigest"], `workspace-driver action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, DRIVER_OPERATIONS, "workspace-driver operation"), fixtureId: record.fixtureId === null ? null : handle(record.fixtureId, "workspace-driver fixtureId"), operationId: handle(record.operationId, "workspace-driver operationId"), expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "workspace-driver expectedEvidenceDigest")};
  }
  if (family === "runner-environment") {
    const record = object(actionValue, ["actionId", "family", "operation", "fixtureId", "operationId", "expectedEvidenceDigest"], `runner-environment action ${actionId}`);
    return {actionId, family, operation: enumeration(record.operation, ENVIRONMENT_OPERATIONS, "runner-environment operation"), fixtureId: record.fixtureId === null ? null : handle(record.fixtureId, "runner-environment fixtureId"), operationId: handle(record.operationId, "runner-environment operationId"), expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "runner-environment expectedEvidenceDigest")};
  }
  if (family === "checkpoint") {
    const record = object(actionValue, ["actionId", "family", "channel", "checkpointId", "expectedEvidenceDigest"], `checkpoint action ${actionId}`);
    return {actionId, family, channel: enumeration(record.channel, ["workspace-driver", "runner-environment"] as const, "checkpoint channel"), checkpointId: handle(record.checkpointId, "checkpointId"), expectedEvidenceDigest: digest(record.expectedEvidenceDigest, "checkpoint expectedEvidenceDigest")};
  }
  if (family === "screenshot") {
    const record = object(actionValue, ["actionId", "family", "screenshotId"], `screenshot action ${actionId}`);
    return {actionId, family, screenshotId: handle(record.screenshotId, "screenshotId")};
  }
  if (family === "protected-regression") {
    const record = object(actionValue, ["actionId", "family", "group"], `protected-regression action ${actionId}`);
    return {actionId, family, group: parseRegressionGroups([record.group], "protected regression group")[0]};
  }
  return fail(`Operation family ${family} is not directly actionable.`);
};

export const validateExtensionRegistryValue = (value: unknown): ExtensionRegistry => {
  const record = object(value, ["registryVersion", "specId", "authorizationId", "operationFamilies", "adapter", "fixtures", "actions"], "extension registry");
  exact(record.specId, "SPEC-0001", "registry specId");
  const authorizationId = enumeration(record.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1", "phase-3/v1", "phase-4/v1"] as const, "registry authorizationId");
  const phase3 = authorizationId === "phase-3/v1";
  const phase4 = authorizationId === "phase-4/v1";
  const registryVersion = phase4 ? 4 : phase3 ? 3 : 2;
  exact(record.registryVersion, registryVersion, "registryVersion");
  const operationFamilies = parseOperationFamilies(record.operationFamilies, "registry operationFamilies");
  const adapter = parseBinding(record.adapter, "registry adapter binding");
  exact(adapter.path, authorizationId === "phase-1.5-compatibility-synthetic/v1" ? COMPATIBILITY_ADAPTER_PATH : phase4 ? PHASE4_ADAPTER_PATH : phase3 ? PHASE3_ADAPTER_PATH : PHASE2_ADAPTER_PATH, "registry adapter path");
  const fixtures = array(record.fixtures, "registry fixtures").map((entry, index): ExtensionRegistry["fixtures"][number] => {
    if (!isRecord(entry)) throw new Error(`registry fixtures[${index}] must be an object.`);
    const fixtureValue: JsonRecord = entry;
    const sourceKind = enumeration(fixtureValue.sourceKind, ["adapter-built-in", "repository-json"] as const, "fixture sourceKind");
    const fixture = object(fixtureValue, sourceKind === "adapter-built-in" ? ["fixtureId", "fixtureKind", "sourceKind", "expectedFixtureDigest"] : ["fixtureId", "fixtureKind", "sourceKind", "binding", "expectedFixtureDigest"], `registry fixtures[${index}]`);
    const fixtureId = handle(fixture.fixtureId, "fixtureId");
    const fixtureKind = enumeration(fixture.fixtureKind, FIXTURE_KINDS, "fixtureKind");
    const expectedFixtureDigest = digest(fixture.expectedFixtureDigest, "expectedFixtureDigest");
    if (sourceKind === "adapter-built-in") {
      const syntheticFixtureDigests: Readonly<Record<string, Digest>> = {
        "synthetic-environment-plan": "sha256:9736d7bc6612adf2474772037c4ff02352fce6b2f0cd708f9f47ef9449d8fba3",
        "synthetic-gate-release": "sha256:49080f0adeaf24ae4e32cab32b7173e6ad29f0066530a894fda237529b35b595",
        "synthetic-joint-edit": "sha256:62946809dfb4bd8f7e4fead629e994ef4870d78d70087409954a3d59d5e9bbd1",
        "synthetic-publication-completion": "sha256:8a679641bb30e17a4fbc7ec2937fbf4f58d0ec1862c4b9304947a6fa2c1dee3d",
        "synthetic-publication-plan": "sha256:ca2c0458c54ef6fd88ffa34bd203dc721e0f6f2594420381b5a4b2c91693c36f",
        "synthetic-wave-document": "sha256:b412a05aca94327c04b0cfd4945469b4d8f8c5b5b3385139b680ac3491795475",
      };
      const trustedDigest = syntheticFixtureDigests[fixtureId] ?? fail(`Unknown built-in synthetic fixture: ${fixtureId}`);
      exact(expectedFixtureDigest, trustedDigest, `built-in fixture digest ${fixtureId}`);
      return {fixtureId, fixtureKind, sourceKind, expectedFixtureDigest};
    }
    const binding = parseBinding(fixture.binding, `fixture ${fixtureId} binding`);
    exact(expectedFixtureDigest, binding.sha256, `repository fixture digest ${fixtureId}`);
    return {fixtureId, fixtureKind, sourceKind, binding, expectedFixtureDigest};
  });
  unique(fixtures.map((entry) => entry.fixtureId), "registry fixture IDs");
  const actions = array(record.actions, "registry actions").map(parseAction);
  unique(actions.map((entry) => entry.actionId), "registry action IDs");
  if (actions.length === 0) fail("Registry must contain at least one action.");
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.fixtureId));
  for (const action of actions) if ((action.family === "workspace-driver" || action.family === "runner-environment") && action.fixtureId !== null && !fixtureIds.has(action.fixtureId)) fail(`Action ${action.actionId} references unknown fixture ${action.fixtureId}.`);
  return {registryVersion, specId: "SPEC-0001", authorizationId, operationFamilies, adapter, fixtures, actions};
};

const adapterLiteral = (expression: tsTypes.Expression, label: string): unknown => {
  const ts = loadTypeScriptRuntime();
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(expression)) return expression.elements.map((entry, index) => adapterLiteral(entry, `${label}[${index}]`));
  if (ts.isObjectLiteralExpression(expression)) {
    const result: JsonRecord = {};
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) throw new Error(`${label} permits property assignments only.`);
      const assignment: tsTypes.PropertyAssignment = property;
      const name = assignment.name;
      const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : fail(`${label} contains a computed or unsupported property name.`);
      if (key === "__proto__" || key === "prototype" || key === "constructor") fail(`${label} contains forbidden prototype key ${key}.`);
      if (Object.hasOwn(result, key)) fail(`${label} contains duplicate property ${key}.`);
      result[key] = adapterLiteral(assignment.initializer, `${label}.${key}`);
    }
    return result;
  }
  return fail(`${label} contains forbidden executable or unknown syntax (${ts.SyntaxKind[expression.kind]}).`);
};

const validateAdapterValue = (value: unknown): AdapterDeclaration => {
  const record = object(value, ["declarationVersion", "adapterId", "authorizationId", "adapterKind", "executionProfile", "workspacePortBinding", "productPhaseClaimed", "driverOperations", "environmentOperations", "pointerTargets", "checkpointKinds"], "adapter declaration");
  exact(record.declarationVersion, 1, "adapter declarationVersion");
  const authorizationId = enumeration(record.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1", "phase-3/v1", "phase-4/v1"] as const, "adapter authorizationId");
  const synthetic = authorizationId === "phase-1.5-compatibility-synthetic/v1";
  const phase3 = authorizationId === "phase-3/v1";
  const phase4 = authorizationId === "phase-4/v1";
  const adapterKind = enumeration(record.adapterKind, ["in-memory-phase2-shaped-synthetic/v1", "phase-2-product-ports/v1", "phase-3-product-ports/v1", "phase-4-product-ports/v1"] as const, "adapterKind");
  exact(adapterKind, synthetic ? "in-memory-phase2-shaped-synthetic/v1" : phase4 ? "phase-4-product-ports/v1" : phase3 ? "phase-3-product-ports/v1" : "phase-2-product-ports/v1", "adapterKind/authorization binding");
  const executionProfile = enumeration(record.executionProfile, ["synthetic-state-machine/v1", "phase2-workspace-ports/v1", "phase3-workspace-ports/v1", "phase4-workspace-ports/v1"] as const, "adapter executionProfile");
  exact(executionProfile, synthetic ? "synthetic-state-machine/v1" : phase4 ? "phase4-workspace-ports/v1" : phase3 ? "phase3-workspace-ports/v1" : "phase2-workspace-ports/v1", "adapter execution profile");
  const workspacePortBinding = record.workspacePortBinding === null ? null : enumeration(record.workspacePortBinding, ["spec0001Phase2BrowserPortsV1", "spec0001Phase3BrowserPortsV1", "spec0001Phase4BrowserPortsV1"] as const, "adapter workspacePortBinding");
  exact(workspacePortBinding, synthetic ? null : phase4 ? "spec0001Phase4BrowserPortsV1" : phase3 ? "spec0001Phase3BrowserPortsV1" : "spec0001Phase2BrowserPortsV1", "adapter workspace port binding");
  const productPhaseClaimed = typeof record.productPhaseClaimed === "boolean" ? record.productPhaseClaimed : fail("adapter productPhaseClaimed must be boolean.");
  if (productPhaseClaimed !== !synthetic) fail("adapter productPhaseClaimed mismatch.");
  const parsePorts = (portsValue: unknown, operations: readonly string[], label: string) => array(portsValue, label).map((entry, index) => {
    const port = object(entry, ["operation", "fixtureKinds"], `${label}[${index}]`);
    const operation = enumeration(port.operation, operations, `${label} operation`);
    const fixtureKinds = canonicalStrings(port.fixtureKinds, `${label} fixtureKinds`).map((kind) => enumeration(kind, FIXTURE_KINDS, `${label} fixture kind`));
    return {operation, fixtureKinds};
  });
  const expectedDriverOperations = phase4 ? PHASE4_DRIVER_OPERATIONS : phase3 ? PHASE3_DRIVER_OPERATIONS : PHASE2_DRIVER_OPERATIONS;
  const driverOperations = parsePorts(record.driverOperations, expectedDriverOperations, "adapter driverOperations");
  const environmentOperations = parsePorts(record.environmentOperations, ENVIRONMENT_OPERATIONS, "adapter environmentOperations");
  unique(driverOperations.map((entry) => entry.operation), "adapter driver operations");
  unique(environmentOperations.map((entry) => entry.operation), "adapter environment operations");
  exact([...driverOperations.map((entry) => entry.operation)].sort(), [...expectedDriverOperations].sort(), "adapter driver operation set");
  exact([...environmentOperations.map((entry) => entry.operation)].sort(), [...ENVIRONMENT_OPERATIONS].sort(), "adapter environment operation set");
  for (const entry of driverOperations) exact(entry.fixtureKinds, DRIVER_FIXTURE_KINDS[entry.operation as typeof DRIVER_OPERATIONS[number]], `adapter fixture kinds for ${entry.operation}`);
  for (const entry of environmentOperations) exact(entry.fixtureKinds, ENVIRONMENT_FIXTURE_KINDS[entry.operation as typeof ENVIRONMENT_OPERATIONS[number]], `adapter fixture kinds for ${entry.operation}`);
  const pointerTargets = array(record.pointerTargets, "adapter pointerTargets").map((entry, index) => {
    const target = object(entry, ["targetId", "targetKind"], `adapter pointerTargets[${index}]`);
    exact(target.targetKind, "authorized-canvas", "pointer target kind");
    return {targetId: handle(target.targetId, "pointer targetId"), targetKind: "authorized-canvas" as const};
  });
  unique(pointerTargets.map((entry) => entry.targetId), "adapter pointer targets");
  const checkpointKinds = canonicalStrings(record.checkpointKinds, "adapter checkpointKinds").map((entry) => enumeration(entry, ["workspace", "environment"] as const, "checkpoint kind"));
  return {declarationVersion: 1, adapterId: handle(record.adapterId, "adapterId"), authorizationId, adapterKind, executionProfile, workspacePortBinding, productPhaseClaimed, driverOperations, environmentOperations, pointerTargets, checkpointKinds};
};

export const parseAdapterDeclarationSource = (source: string, fileName = "browser adapter declaration"): AdapterDeclaration => {
  const ts = loadTypeScriptRuntime();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia || token === ts.SyntaxKind.ShebangTrivia) fail(`${fileName} comments and shebangs are forbidden.`);
  }
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (parsed as tsTypes.SourceFile & {parseDiagnostics?: readonly tsTypes.Diagnostic[]}).parseDiagnostics ?? [];
  if (diagnostics.length > 0) fail(`${fileName} contains TypeScript parse diagnostics.`);
  const statement = parsed.statements[0];
  if (parsed.statements.length !== 1 || statement === undefined || !ts.isExportAssignment(statement) || statement.isExportEquals) throw new Error(`${fileName} must contain exactly one default export declaration.`);
  const exported = statement.expression;
  if (!ts.isAsExpression(exported) || exported.type.getText(parsed) !== "const") throw new Error(`${fileName} must default-export one object literal using 'as const'.`);
  const literal = exported.expression;
  if (!ts.isObjectLiteralExpression(literal)) throw new Error(`${fileName} must export a literal object.`);
  return validateAdapterValue(adapterLiteral(literal, "adapter"));
};

const gitBuffer = (root: string, argv: string[], acceptedStatuses: readonly number[] = [0]): Buffer => {
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "HOME", "USER", "LOGNAME"]) if (process.env[key]) env[key] = process.env[key];
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_OPTIONAL_LOCKS = "0";
  const result = spawnSync("/usr/bin/git", argv, {cwd: root, encoding: "buffer", shell: false, maxBuffer: 16 * 1024 * 1024, env});
  const status = result.status ?? 255;
  if (!acceptedStatuses.includes(status)) fail(Buffer.from(result.stderr ?? []).toString("utf8") || `git ${argv.join(" ")} failed.`);
  return Buffer.from(result.stdout ?? []);
};
const gitText = (root: string, argv: string[], acceptedStatuses: readonly number[] = [0]) => gitBuffer(root, argv, acceptedStatuses).toString("utf8").trim();
const nulList = (bytes: Buffer): string[] => bytes.toString("utf8").split("\0").filter(Boolean);

export const compareIndexToHeadEntries = (indexBytes: Buffer, headBytes: Buffer): string[] => {
  const grouped = (records: string[], label: "index" | "HEAD") => {
    const entries = new Map<string, string[]>();
    for (const record of records) {
      const separator = record.indexOf("\t");
      if (separator < 1) fail(`${label} entry is malformed.`);
      const metadata = record.slice(0, separator).split(" ");
      const path = assertSafeRepositoryPath(record.slice(separator + 1), `${label} entry path`);
      if (label === "index") {
        if (metadata.length !== 3 || !/^[0-7]{6}$/.test(metadata[0]) || !/^[0-9a-f]{40,64}$/.test(metadata[1]) || !/^[0-3]$/.test(metadata[2])) fail("Index entry metadata is malformed.");
        const values = entries.get(path) ?? [];
        values.push(`${metadata[0]} ${metadata[1]} ${metadata[2]}`);
        entries.set(path, values);
      } else {
        if (metadata.length !== 3 || !/^[0-7]{6}$/.test(metadata[0]) || !/^(?:blob|commit)$/.test(metadata[1]) || !/^[0-9a-f]{40,64}$/.test(metadata[2])) fail("HEAD tree entry metadata is malformed.");
        if (entries.has(path)) fail(`HEAD tree contains a duplicate path: ${path}`);
        entries.set(path, [`${metadata[0]} ${metadata[2]} 0`]);
      }
    }
    for (const values of entries.values()) values.sort((left, right) => left.localeCompare(right));
    return entries;
  };
  const index = grouped(nulList(indexBytes), "index");
  const head = grouped(nulList(headBytes), "HEAD");
  return [...new Set([...index.keys(), ...head.keys()])]
    .filter((path) => JSON.stringify(index.get(path) ?? []) !== JSON.stringify(head.get(path) ?? []))
    .sort((left, right) => left.localeCompare(right));
};

export type GitObservationOverride = {
  headCommit: string;
  stagedPaths: string[];
  hiddenIndexPaths: string[];
  trackedDirtyPaths: string[];
  untrackedPaths: string[];
  baseIsStrictAncestor: boolean;
  committedChangedPaths: string[];
};

export type ExtensionValidationMode = "technical" | "phase-2-closeout" | "phase-3-closeout" | "phase-4-closeout" | "phase-5-closeout" | "phase-6-closeout";

const validateObservationOverride = (value: GitObservationOverride): GitObservationOverride => ({
  headCommit: gitSha(value.headCommit, "observation headCommit"),
  stagedPaths: canonicalStrings(value.stagedPaths, "observation stagedPaths").map((entry) => assertSafeRepositoryPath(entry)),
  hiddenIndexPaths: canonicalStrings(value.hiddenIndexPaths, "observation hiddenIndexPaths").map((entry) => assertSafeRepositoryPath(entry)),
  trackedDirtyPaths: canonicalStrings(value.trackedDirtyPaths, "observation trackedDirtyPaths").map((entry) => assertSafeRepositoryPath(entry)),
  untrackedPaths: canonicalStrings(value.untrackedPaths, "observation untrackedPaths").map((entry) => assertSafeRepositoryPath(entry)),
  baseIsStrictAncestor: typeof value.baseIsStrictAncestor === "boolean" ? value.baseIsStrictAncestor : fail("observation baseIsStrictAncestor must be boolean."),
  committedChangedPaths: canonicalStrings(value.committedChangedPaths, "observation committedChangedPaths").map((entry) => assertSafeRepositoryPath(entry)),
});

const observeGit = (root: string, baseCommit: string): GitObservationOverride => {
  const headCommit = gitSha(gitText(root, ["rev-parse", "HEAD"]), "HEAD");
  const indexMismatchPaths = compareIndexToHeadEntries(
    gitBuffer(root, ["ls-files", "--stage", "-z"]),
    gitBuffer(root, ["ls-tree", "-r", "--full-tree", "-z", "HEAD"]),
  );
  const stagedPaths = [...new Set([...nulList(gitBuffer(root, ["diff", "--cached", "--name-only", "-z"])), ...indexMismatchPaths])].sort((left, right) => left.localeCompare(right));
  const trackedDirtyPaths = [...new Set(nulList(gitBuffer(root, ["diff", "--name-only", "-z"])))].sort((left, right) => left.localeCompare(right));
  const untrackedPaths = [...new Set(nulList(gitBuffer(root, ["ls-files", "--others", "--exclude-standard", "-z"])))].sort((left, right) => left.localeCompare(right));
  const hiddenIndexPaths = nulList(gitBuffer(root, ["ls-files", "-v", "-z"]))
    .filter((entry) => entry.length > 2 && (entry[0] === "S" || entry[0] === entry[0].toLowerCase()))
    .map((entry) => entry.slice(2))
    .sort((left, right) => left.localeCompare(right));
  const ancestorResult = spawnSync("/usr/bin/git", ["merge-base", "--is-ancestor", baseCommit, headCommit], {
    cwd: root,
    encoding: "buffer",
    shell: false,
    env: {PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0"} as unknown as NodeJS.ProcessEnv,
  });
  if (ancestorResult.status !== 0 && ancestorResult.status !== 1) fail(Buffer.from(ancestorResult.stderr ?? []).toString("utf8") || "Unable to establish base ancestry.");
  const committedChangedPaths = headCommit === baseCommit ? [] : [...new Set(nulList(gitBuffer(root, ["diff", "--name-only", "-z", `${baseCommit}..${headCommit}`])))].sort((left, right) => left.localeCompare(right));
  return {headCommit, stagedPaths, hiddenIndexPaths, trackedDirtyPaths, untrackedPaths, baseIsStrictAncestor: ancestorResult.status === 0 && baseCommit !== headCommit, committedChangedPaths};
};

export const deriveGitState = (root: string, plan: ExtensionPlan | Phase5RoutePlan | Phase6Plan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  if (observation.stagedPaths.length > 0) fail(`Staged paths are forbidden: ${observation.stagedPaths.join(", ")}.`);
  if (observation.hiddenIndexPaths.length > 0) fail(`Hidden index flags are forbidden: ${observation.hiddenIndexPaths.join(", ")}.`);
  const dirtyPaths = [...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])];
  const observedDirtyPaths = plan.authorizationId === "phase-3/v1" || plan.authorizationId === "phase-4/v1" || plan.authorizationId === "phase-5/v1" || plan.authorizationId === "phase-6/v1"
    ? sortProofPaths(dirtyPaths)
    : dirtyPaths.sort((left, right) => left.localeCompare(right));
  for (const path of observedDirtyPaths) if (!ceiling.includes(path)) fail(`Observed dirty path is outside the authorization ceiling: ${path}.`);
  if (observedDirtyPaths.length > 0) {
    exact(observation.headCommit, plan.baseCommit, "dirty executor HEAD/base");
    exact(observedDirtyPaths, plan.dirtyExpectedPaths, "dirty executor observed paths");
    return {derivedGitState: "dirty-executor", baseCommit: plan.baseCommit, headCommit: observation.headCommit, observedDirtyPaths, dirtyExpectedPaths: [...plan.dirtyExpectedPaths], cleanExpectedPaths: [], selectedExpectedPaths: [...plan.dirtyExpectedPaths]};
  }
  if (!observation.baseIsStrictAncestor) fail("Clean committed state requires baseCommit to be a strict ancestor of HEAD.");
  const committedProjection = observation.committedChangedPaths.filter((path) => ceiling.includes(path));
  const ceilingProjection = plan.authorizationId === "phase-3/v1" || plan.authorizationId === "phase-4/v1" || plan.authorizationId === "phase-5/v1" || plan.authorizationId === "phase-6/v1"
    ? sortProofPaths(committedProjection)
    : committedProjection.sort((left, right) => left.localeCompare(right));
  const allowedPhase2CloseoutOnly = plan.authorizationId === "phase-2/v1" ? ["scripts/finalizeSpec0001ProofBundle.ts"] : [];
  const unexpectedCeilingPaths = ceilingProjection.filter((path) => !plan.dirtyExpectedPaths.includes(path) && !allowedPhase2CloseoutOnly.includes(path));
  exact(unexpectedCeilingPaths, [], "clean committed unexpected ceiling projection");
  const projection = ceilingProjection.filter((path) => plan.dirtyExpectedPaths.includes(path));
  exact(projection, plan.dirtyExpectedPaths, "clean committed ceiling projection");
  return {derivedGitState: "clean-committed", baseCommit: plan.baseCommit, headCommit: observation.headCommit, observedDirtyPaths: [], dirtyExpectedPaths: [...plan.dirtyExpectedPaths], cleanExpectedPaths: [], selectedExpectedPaths: []};
};

export const derivePhase2CloseoutGraphGitState = (root: string, plan: ExtensionPlan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  exact(plan.authorizationId, "phase-2/v1", "closeout plan authorizationId");
  exact(ceiling, [...PHASE2_PATHS], "closeout technical path ceiling");
  exact(plan.dirtyExpectedPaths, [...PHASE2_PATHS], "closeout recorded technical paths");
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  exact(observation.stagedPaths, [], "closeout staged paths");
  exact(observation.hiddenIndexPaths, [], "closeout hidden index paths");
  exact(observation.headCommit, plan.baseCommit, "closeout HEAD/base");
  exact(observation.baseIsStrictAncestor, false, "closeout base ancestry");
  exact(observation.committedChangedPaths, [], "closeout committed paths");
  const observedCloseoutPaths = sortProofPaths([...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])]);
  exact(observedCloseoutPaths, PHASE2_CLOSEOUT_PATHS, "closeout observed paths");
  return {
    derivedGitState: "dirty-executor",
    baseCommit: plan.baseCommit,
    headCommit: plan.baseCommit,
    observedDirtyPaths: [...plan.dirtyExpectedPaths],
    dirtyExpectedPaths: [...plan.dirtyExpectedPaths],
    cleanExpectedPaths: [],
    selectedExpectedPaths: [...plan.dirtyExpectedPaths],
  };
};

export const derivePhase3CloseoutGraphGitState = (root: string, plan: ExtensionPlan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  exact(plan.authorizationId, "phase-3/v1", "Phase 3 closeout plan authorizationId");
  exact(ceiling, PHASE3_PATHS, "Phase 3 closeout technical path ceiling");
  exact(plan.dirtyExpectedPaths, PHASE3_DIRTY_PATHS, "Phase 3 closeout recorded technical paths");
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  exact(observation.stagedPaths, [], "Phase 3 closeout staged paths");
  exact(observation.hiddenIndexPaths, [], "Phase 3 closeout hidden index paths");
  exact(observation.headCommit, plan.baseCommit, "Phase 3 closeout HEAD/base");
  exact(observation.baseIsStrictAncestor, false, "Phase 3 closeout base ancestry");
  exact(observation.committedChangedPaths, [], "Phase 3 closeout committed paths");
  const observedCloseoutPaths = sortProofPaths([...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])]);
  exact(observedCloseoutPaths, PHASE3_CLOSEOUT_PATHS, "Phase 3 closeout observed paths");
  return {
    derivedGitState: "dirty-executor",
    baseCommit: plan.baseCommit,
    headCommit: plan.baseCommit,
    observedDirtyPaths: [...plan.dirtyExpectedPaths],
    dirtyExpectedPaths: [...plan.dirtyExpectedPaths],
    cleanExpectedPaths: [],
    selectedExpectedPaths: [...plan.dirtyExpectedPaths],
  };
};

export const derivePhase4CloseoutGraphGitState = (root: string, plan: ExtensionPlan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  exact(plan.authorizationId, "phase-4/v1", "Phase 4 closeout plan authorizationId");
  exact(ceiling, PHASE4_PATHS, "Phase 4 closeout technical path ceiling");
  exact(plan.dirtyExpectedPaths, PHASE4_DIRTY_PATHS, "Phase 4 closeout recorded technical paths");
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  exact(observation.stagedPaths, [], "Phase 4 closeout staged paths");
  exact(observation.hiddenIndexPaths, [], "Phase 4 closeout hidden index paths");
  exact(observation.headCommit, plan.baseCommit, "Phase 4 closeout HEAD/base");
  exact(observation.baseIsStrictAncestor, false, "Phase 4 closeout base ancestry");
  exact(observation.committedChangedPaths, [], "Phase 4 closeout committed paths");
  const observedCloseoutPaths = sortProofPaths([...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])]);
  exact(observedCloseoutPaths, PHASE4_CLOSEOUT_PATHS, "Phase 4 closeout observed paths");
  return {
    derivedGitState: "dirty-executor",
    baseCommit: plan.baseCommit,
    headCommit: plan.baseCommit,
    observedDirtyPaths: [...plan.dirtyExpectedPaths],
    dirtyExpectedPaths: [...plan.dirtyExpectedPaths],
    cleanExpectedPaths: [],
    selectedExpectedPaths: [...plan.dirtyExpectedPaths],
  };
};

export const derivePhase5CloseoutGraphGitState = (root: string, plan: Phase5RoutePlan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  exact(plan.authorizationId, "phase-5/v1", "Phase 5 closeout plan authorizationId");
  exact(ceiling, PHASE5_PATHS, "Phase 5 closeout technical path ceiling");
  const allowedDirtySets = [
    PHASE5_DIRTY_PATHS,
    sortProofPaths([...PHASE5_DIRTY_PATHS, PHASE5_OPTIONAL_CONTRACT_PATHS[0]]),
    sortProofPaths([...PHASE5_DIRTY_PATHS, PHASE5_OPTIONAL_CONTRACT_PATHS[1]]),
    PHASE5_PATHS,
  ];
  if (!allowedDirtySets.some((paths) => JSON.stringify(paths) === JSON.stringify(plan.dirtyExpectedPaths))) fail("Phase 5 closeout recorded technical paths mismatch.");
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  exact(observation.stagedPaths, [], "Phase 5 closeout staged paths");
  exact(observation.hiddenIndexPaths, [], "Phase 5 closeout hidden index paths");
  exact(observation.headCommit, plan.baseCommit, "Phase 5 closeout HEAD/base");
  exact(observation.baseIsStrictAncestor, false, "Phase 5 closeout base ancestry");
  exact(observation.committedChangedPaths, [], "Phase 5 closeout committed paths");
  const expectedCloseoutPaths = sortProofPaths([...plan.dirtyExpectedPaths, ...PHASE5_CLOSEOUT_RECORD_PATHS]);
  const observedCloseoutPaths = sortProofPaths([...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])]);
  exact(observedCloseoutPaths, expectedCloseoutPaths, "Phase 5 closeout observed paths");
  return {
    derivedGitState: "dirty-executor",
    baseCommit: plan.baseCommit,
    headCommit: plan.baseCommit,
    observedDirtyPaths: [...plan.dirtyExpectedPaths],
    dirtyExpectedPaths: [...plan.dirtyExpectedPaths],
    cleanExpectedPaths: [],
    selectedExpectedPaths: [...plan.dirtyExpectedPaths],
  };
};

export const derivePhase6CloseoutGraphGitState = (root: string, plan: Phase6Plan, ceiling: readonly string[], observationOverride?: GitObservationOverride): DerivedGitState => {
  exact(plan.authorizationId, "phase-6/v1", "Phase 6 closeout plan authorizationId");
  exact(ceiling, PHASE6_PATHS, "Phase 6 closeout technical path ceiling");
  phase6CloseoutPathsForTechnicalSubset(plan.dirtyExpectedPaths);
  const observation = observationOverride === undefined ? observeGit(root, plan.baseCommit) : validateObservationOverride(observationOverride);
  exact(observation.stagedPaths, [], "Phase 6 closeout staged paths");
  exact(observation.hiddenIndexPaths, [], "Phase 6 closeout hidden index paths");
  exact(observation.headCommit, plan.baseCommit, "Phase 6 closeout HEAD/base");
  exact(observation.baseIsStrictAncestor, false, "Phase 6 closeout base ancestry");
  exact(observation.committedChangedPaths, [], "Phase 6 closeout committed paths");
  const expectedCloseoutPaths = phase6CloseoutPathsForTechnicalSubset(plan.dirtyExpectedPaths);
  const observedCloseoutPaths = sortProofPaths([...new Set([...observation.trackedDirtyPaths, ...observation.untrackedPaths])]);
  exact(observedCloseoutPaths, expectedCloseoutPaths, "Phase 6 closeout observed paths");
  return {
    derivedGitState: "dirty-executor",
    baseCommit: plan.baseCommit,
    headCommit: plan.baseCommit,
    observedDirtyPaths: [...plan.dirtyExpectedPaths],
    dirtyExpectedPaths: [...plan.dirtyExpectedPaths],
    cleanExpectedPaths: [],
    selectedExpectedPaths: [...plan.dirtyExpectedPaths],
  };
};

const validateResultBindingGroup = (value: unknown) => {
  const record = object(value, ["catalog", "plan", "registry", "adapter"], "result bindings");
  return {catalog: parseBinding(record.catalog, "result catalog binding"), plan: parseBinding(record.plan, "result plan binding"), registry: parseBinding(record.registry, "result registry binding"), adapter: parseBinding(record.adapter, "result adapter binding")};
};

export const validateExtensionResult = (value: unknown, root: string, verifyBindings = true, validationMode: ExtensionValidationMode = "technical"): ExtensionResult => {
  const record = object(value, ["resultVersion", "specId", "proofPurpose", "status", "recordedAt", "productPhaseClaimed", "runtime", "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths", "dirtyExpectedPaths", "cleanExpectedPaths", "selectedExpectedPaths", "authorization", "bindings", "execution", "evidence", "network", "cleanup"], "extension result");
  exact(record.specId, "SPEC-0001", "result specId");
  exact(record.status, "passed", "result status");
  const authorizationRecord = object(record.authorization, ["authorizationId", "materializationKind"], "result authorization");
  const authorizationId = enumeration(authorizationRecord.authorizationId, ["phase-1.5-compatibility-synthetic/v1", "phase-2/v1", "phase-3/v1", "phase-4/v1"] as const, "result authorizationId");
  const synthetic = authorizationId === "phase-1.5-compatibility-synthetic/v1";
  const phase3 = authorizationId === "phase-3/v1";
  const phase4 = authorizationId === "phase-4/v1";
  const resultVersion = phase4 ? 4 : phase3 ? 3 : 2;
  exact(record.resultVersion, resultVersion, "resultVersion");
  const proofPurpose = synthetic ? "phase-1.5-compatibility-synthetic" : phase4 ? "phase-4" : phase3 ? "phase-3" : "phase-2";
  exact(record.proofPurpose, proofPurpose, "result proofPurpose");
  exact(authorizationRecord.materializationKind, synthetic ? "materialized" : "deferred", "result materializationKind");
  const recordedAt = typeof record.recordedAt === "string" ? record.recordedAt : fail("result recordedAt must be a string.");
  if (Number.isNaN(Date.parse(recordedAt))) fail("result recordedAt must be an ISO-compatible timestamp.");
  const productPhaseClaimed = typeof record.productPhaseClaimed === "boolean" ? record.productPhaseClaimed : fail("result productPhaseClaimed must be boolean.");
  if (productPhaseClaimed !== !synthetic) fail("result productPhaseClaimed mismatch.");
  const runtimeRecord = object(record.runtime, ["nodeVersion", "playwrightCoreVersion", "browserVersion", "browserExecutable"], "result runtime");
  const runtime = {nodeVersion: string(runtimeRecord.nodeVersion, "result nodeVersion"), playwrightCoreVersion: enumeration(runtimeRecord.playwrightCoreVersion, ["1.62.1"] as const, "result playwrightCoreVersion"), browserVersion: string(runtimeRecord.browserVersion, "result browserVersion"), browserExecutable: parseBrowserExecutableBinding(runtimeRecord.browserExecutable, "result browserExecutable")};
  if (verifyBindings) exact(runtime.browserExecutable, bindBrowserExecutable(), "result browser executable binding");
  const derivedGitState = enumeration(record.derivedGitState, ["dirty-executor", "clean-committed"] as const, "result derivedGitState");
  const baseCommit = gitSha(record.baseCommit, "result baseCommit");
  const headCommit = gitSha(record.headCommit, "result headCommit");
  const parseResultPaths = phase3 || phase4 ? canonicalProofPaths : canonicalStrings;
  const observedDirtyPaths = parseResultPaths(record.observedDirtyPaths, "result observedDirtyPaths").map((entry) => assertSafeRepositoryPath(entry));
  const dirtyExpectedPaths = parseResultPaths(record.dirtyExpectedPaths, "result dirtyExpectedPaths").map((entry) => assertSafeRepositoryPath(entry));
  exact(record.cleanExpectedPaths, [], "result cleanExpectedPaths");
  const selectedExpectedPaths = parseResultPaths(record.selectedExpectedPaths, "result selectedExpectedPaths").map((entry) => assertSafeRepositoryPath(entry));
  exact(selectedExpectedPaths, derivedGitState === "dirty-executor" ? dirtyExpectedPaths : [], "result selectedExpectedPaths");
  exact(observedDirtyPaths, selectedExpectedPaths, "result observed/selected paths");
  if (derivedGitState === "dirty-executor") exact(headCommit, baseCommit, "result dirty HEAD/base");
  const bindings = validateResultBindingGroup(record.bindings);
  exact(bindings.catalog.path, CATALOG_PATH, "result catalog path");
  exact(bindings.plan.path, synthetic ? COMPATIBILITY_PLAN_PATH : phase4 ? PHASE4_PLAN_PATH : phase3 ? PHASE3_PLAN_PATH : PHASE2_PLAN_PATH, "result plan path");
  exact(bindings.registry.path, synthetic ? COMPATIBILITY_REGISTRY_PATH : phase4 ? PHASE4_REGISTRY_PATH : phase3 ? PHASE3_REGISTRY_PATH : PHASE2_REGISTRY_PATH, "result registry path");
  exact(bindings.adapter.path, synthetic ? COMPATIBILITY_ADAPTER_PATH : phase4 ? PHASE4_ADAPTER_PATH : phase3 ? PHASE3_ADAPTER_PATH : PHASE2_ADAPTER_PATH, "result adapter path");
  if (verifyBindings) for (const [name, binding] of Object.entries(bindings)) verifyBinding(root, binding, `result ${name} binding`);
  const executionRecord = object(record.execution, ["selectedActionIds", "actionCount", "checkpointCount", "screenshotCount", "protectedRegressionGroups"], "result execution");
  const selectedActionIds = array(executionRecord.selectedActionIds, "result selectedActionIds").map((entry, index) => handle(entry, `selectedActionIds[${index}]`));
  unique(selectedActionIds, "selectedActionIds");
  const actionCount = integer(executionRecord.actionCount, "result actionCount");
  exact(actionCount, selectedActionIds.length, "result actionCount");
  const protectedRegressionGroups = parseRegressionGroups(executionRecord.protectedRegressionGroups, "result protectedRegressionGroups");
  const execution = {selectedActionIds, actionCount, checkpointCount: integer(executionRecord.checkpointCount, "result checkpointCount"), screenshotCount: integer(executionRecord.screenshotCount, "result screenshotCount"), protectedRegressionGroups};
  const evidenceRecord = object(record.evidence, ["ledgerKinds", "screenshotIds", "protectedRegressionGroups"], "result evidence");
  const evidence = {ledgerKinds: canonicalStrings(evidenceRecord.ledgerKinds, "result ledgerKinds"), screenshotIds: canonicalStrings(evidenceRecord.screenshotIds, "result screenshotIds").map((entry) => handle(entry, "result screenshotId")), protectedRegressionGroups: parseRegressionGroups(evidenceRecord.protectedRegressionGroups, "result evidence protectedRegressionGroups")};
  exact(evidence.protectedRegressionGroups, execution.protectedRegressionGroups, "result regression evidence");
  exact(execution.screenshotCount, evidence.screenshotIds.length, "result screenshot evidence count");
  const networkRecord = object(record.network, ["browserNonLoopbackAttempts", "serverNonLoopbackAttempts", "childNonLoopbackAttempts"], "result network");
  exact(networkRecord, {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0}, "result network denial");
  const cleanupRecord = object(record.cleanup, ["anchorRestored", "sourceRestored", "browserContextsOpen", "activeGates", "activeIntercepts", "openChildProcesses", "openPorts", "residualPaths"], "result cleanup");
  exact(cleanupRecord, {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []}, "result cleanup");
  const validated: ExtensionResult = {resultVersion, specId: "SPEC-0001", proofPurpose, status: "passed", recordedAt, productPhaseClaimed, runtime, derivedGitState, baseCommit, headCommit, observedDirtyPaths, dirtyExpectedPaths, cleanExpectedPaths: [], selectedExpectedPaths, authorization: {authorizationId, materializationKind: synthetic ? "materialized" : "deferred"}, bindings, execution, evidence, network: {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0}, cleanup: {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []}};
  if (verifyBindings) {
    const graph = loadTesterExtensionGraph(root, bindings.plan.path, validationMode);
    exact(validated.authorization, {authorizationId: graph.authorizationId, materializationKind: graph.materializationKind}, "result/graph authorization");
    exact(validated.bindings, {catalog: graph.catalogBinding, plan: graph.planBinding, registry: graph.registryBinding, adapter: graph.adapterBinding}, "result/graph bindings");
    exact({derivedGitState: validated.derivedGitState, baseCommit: validated.baseCommit, headCommit: validated.headCommit, observedDirtyPaths: validated.observedDirtyPaths, dirtyExpectedPaths: validated.dirtyExpectedPaths, cleanExpectedPaths: validated.cleanExpectedPaths, selectedExpectedPaths: validated.selectedExpectedPaths}, graph.git, "result/graph Git state");
    exact(validated.execution.selectedActionIds, graph.plan.steps.map((step) => step.actionId), "result/plan selected actions");
    exact(validated.execution.protectedRegressionGroups, graph.plan.evidence.protectedRegressionGroups, "result/plan regression groups");
    exact(validated.evidence, {ledgerKinds: graph.plan.evidence.ledgerKinds, screenshotIds: graph.plan.evidence.screenshotIds, protectedRegressionGroups: graph.plan.evidence.protectedRegressionGroups}, "result/plan evidence");
    exact(validated.productPhaseClaimed, graph.plan.evidence.productPhaseClaimed, "result/plan product claim");
  }
  return validated;
};

export const validatePhase5RouteResult = (value: unknown, root: string, verifyBindings = true, validationMode: "technical" | "phase-5-closeout" = "technical"): Phase5RouteResult => {
  const record = object(value, ["resultVersion", "specId", "proofPurpose", "status", "recordedAt", "productPhaseClaimed", "runtime", "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths", "dirtyExpectedPaths", "cleanExpectedPaths", "selectedExpectedPaths", "authorization", "bindings", "execution", "evidence", "network", "cleanup"], "Phase 5 route result");
  exact(record.resultVersion, 5, "Phase 5 resultVersion");
  exact(record.specId, "SPEC-0001", "Phase 5 result specId");
  exact(record.proofPurpose, "phase-5", "Phase 5 result proofPurpose");
  exact(record.status, "passed", "Phase 5 result status");
  exact(record.productPhaseClaimed, true, "Phase 5 product claim");
  const recordedAt = typeof record.recordedAt === "string" ? record.recordedAt : fail("Phase 5 recordedAt must be a string.");
  if (Number.isNaN(Date.parse(recordedAt))) fail("Phase 5 recordedAt must be an ISO-compatible timestamp.");
  const runtimeRecord = object(record.runtime, ["nodeVersion", "playwrightCoreVersion", "browserVersion", "browserExecutable"], "Phase 5 result runtime");
  const runtime = {nodeVersion: string(runtimeRecord.nodeVersion, "Phase 5 nodeVersion"), playwrightCoreVersion: enumeration(runtimeRecord.playwrightCoreVersion, ["1.62.1"] as const, "Phase 5 playwrightCoreVersion"), browserVersion: string(runtimeRecord.browserVersion, "Phase 5 browserVersion"), browserExecutable: parseBrowserExecutableBinding(runtimeRecord.browserExecutable, "Phase 5 browserExecutable")};
  if (verifyBindings) exact(runtime.browserExecutable, bindBrowserExecutable(), "Phase 5 browser executable binding");
  const derivedGitState = enumeration(record.derivedGitState, ["dirty-executor", "clean-committed"] as const, "Phase 5 derivedGitState");
  const baseCommit = gitSha(record.baseCommit, "Phase 5 result baseCommit");
  const headCommit = gitSha(record.headCommit, "Phase 5 result headCommit");
  const observedDirtyPaths = canonicalProofPaths(record.observedDirtyPaths, "Phase 5 observedDirtyPaths").map((path) => assertSafeRepositoryPath(path));
  const dirtyExpectedPaths = canonicalProofPaths(record.dirtyExpectedPaths, "Phase 5 result dirtyExpectedPaths").map((path) => assertSafeRepositoryPath(path));
  exact(record.cleanExpectedPaths, [], "Phase 5 result cleanExpectedPaths");
  const selectedExpectedPaths = canonicalProofPaths(record.selectedExpectedPaths, "Phase 5 selectedExpectedPaths").map((path) => assertSafeRepositoryPath(path));
  exact(selectedExpectedPaths, derivedGitState === "dirty-executor" ? dirtyExpectedPaths : [], "Phase 5 selectedExpectedPaths");
  exact(observedDirtyPaths, selectedExpectedPaths, "Phase 5 observed/selected paths");
  if (derivedGitState === "dirty-executor") exact(headCommit, baseCommit, "Phase 5 dirty HEAD/base");
  const authorizationRecord = object(record.authorization, ["authorizationId", "materializationKind"], "Phase 5 result authorization");
  exact(authorizationRecord, {authorizationId: "phase-5/v1", materializationKind: "deferred"}, "Phase 5 result authorization");
  const bindingsRecord = object(record.bindings, ["catalog", "plan", "registry"], "Phase 5 result bindings");
  const bindings = {catalog: parseBinding(bindingsRecord.catalog, "Phase 5 result catalog binding"), plan: parseBinding(bindingsRecord.plan, "Phase 5 result plan binding"), registry: parseBinding(bindingsRecord.registry, "Phase 5 result registry binding")};
  exact(bindings.catalog.path, CATALOG_PATH, "Phase 5 result catalog path");
  exact(bindings.plan.path, PHASE5_PLAN_PATH, "Phase 5 result plan path");
  exact(bindings.registry.path, PHASE5_REGISTRY_PATH, "Phase 5 result registry path");
  if (verifyBindings) for (const [name, binding] of Object.entries(bindings)) verifyBinding(root, binding, `Phase 5 result ${name} binding`);
  const executionRecord = object(record.execution, ["selectedCaseIds", "caseCount", "operationKinds"], "Phase 5 result execution");
  const selectedCaseIds = array(executionRecord.selectedCaseIds, "Phase 5 result selectedCaseIds").map((entry, index) => handle(entry, `Phase 5 result selectedCaseIds[${index}]`));
  unique(selectedCaseIds, "Phase 5 result selectedCaseIds");
  const caseCount = integer(executionRecord.caseCount, "Phase 5 result caseCount");
  exact(caseCount, selectedCaseIds.length, "Phase 5 result caseCount");
  const operationKinds = array(executionRecord.operationKinds, "Phase 5 result operationKinds").map((entry, index) => enumeration(entry, ["marked-availability-get", "marked-raw-stick-post", "marker-free-drawing-fallthrough-post"] as const, `Phase 5 result operationKinds[${index}]`));
  exact(operationKinds, ["marked-availability-get", "marked-raw-stick-post", "marker-free-drawing-fallthrough-post"], "Phase 5 result operationKinds");
  const evidenceRecord = object(record.evidence, ["routePath", "requestTransport", "cases", "realApiRouteRequests", "browserPageOperations", "browserMockedApiResponses", "screenshotClaims", "sanitizedServerLogs"], "Phase 5 result evidence");
  exact(evidenceRecord.routePath, "/api/ai", "Phase 5 result routePath");
  exact(evidenceRecord.requestTransport, "guarded-node-loopback-http-exact-bytes/v1", "Phase 5 request transport");
  exact(evidenceRecord.browserPageOperations, 0, "Phase 5 browser page operations");
  exact(evidenceRecord.browserMockedApiResponses, 0, "Phase 5 browser mocked responses");
  exact(evidenceRecord.screenshotClaims, 0, "Phase 5 screenshot claims");
  exact(evidenceRecord.sanitizedServerLogs, true, "Phase 5 sanitized server logs");
  const graph = verifyBindings ? loadPhase5RouteGraph(root, bindings.plan.path, validationMode) : null;
  const registry = graph?.registry ?? validatePhase5RouteRegistryValue(readStrictJson(root, PHASE5_REGISTRY_PATH));
  exact(selectedCaseIds, registry.cases.map((entry) => entry.caseId), "Phase 5 result/registry cases");
  const evidenceCases = array(evidenceRecord.cases, "Phase 5 result evidence cases").map((entry, index): Phase5RouteCaseEvidence => {
    const expectedCase = registry.cases[index] ?? fail(`Unexpected Phase 5 evidence case ${index}.`);
    const caseRecord = object(entry, ["caseId", "operationKind", "request", "response", "legacyCheckpoint", "logs", "nonLoopbackAttempts"], `Phase 5 evidence case ${index}`);
    exact(caseRecord.caseId, expectedCase.caseId, `Phase 5 evidence case ${index} ID`);
    exact(caseRecord.operationKind, expectedCase.operationKind, `Phase 5 evidence case ${index} operationKind`);
    const requestRecord = object(caseRecord.request, ["method", "path", "headerSha256", "bodyByteLength", "bodySha256"], `Phase 5 evidence case ${index} request`);
    const expectedHeaderDigest = sha256(Buffer.from(JSON.stringify(expectedCase.request.headers), "utf8"));
    exact(requestRecord, {method: expectedCase.request.method, path: "/api/ai", headerSha256: expectedHeaderDigest, bodyByteLength: expectedCase.request.body.byteLength, bodySha256: expectedCase.request.body.sha256}, `Phase 5 evidence case ${index} request binding`);
    const responseRecord = object(caseRecord.response, ["status", "selectedHeaders", "bodyByteLength", "bodySha256"], `Phase 5 evidence case ${index} response`);
    const selectedHeaders = parsePhase5Headers(responseRecord.selectedHeaders, `Phase 5 evidence case ${index} response headers`);
    exact(responseRecord.status, expectedCase.expected.status, `Phase 5 evidence case ${index} response status`);
    exact(selectedHeaders, expectedCase.expected.headers, `Phase 5 evidence case ${index} response headers`);
    const bodyByteLength = integer(responseRecord.bodyByteLength, `Phase 5 evidence case ${index} response body length`);
    const bodySha256 = digest(responseRecord.bodySha256, `Phase 5 evidence case ${index} response body digest`);
    if (expectedCase.expected.body !== null) exact({byteLength: bodyByteLength, sha256: bodySha256}, expectedCase.expected.body, `Phase 5 evidence case ${index} response body binding`);
    let legacyCheckpoint: Phase5RouteCaseEvidence["legacyCheckpoint"];
    if (caseRecord.legacyCheckpoint === null) legacyCheckpoint = null;
    else {
      const checkpointRecord = object(caseRecord.legacyCheckpoint, ["checkpointKind", "matched"], `Phase 5 evidence case ${index} checkpoint`);
      exact(checkpointRecord.matched, true, `Phase 5 evidence case ${index} checkpoint matched`);
      const checkpointKind = handle(checkpointRecord.checkpointKind, `Phase 5 evidence case ${index} checkpointKind`);
      legacyCheckpoint = {checkpointKind, matched: true};
    }
    exact(legacyCheckpoint, expectedCase.expected.legacyCheckpoint === null ? null : {checkpointKind: expectedCase.expected.legacyCheckpoint.checkpointKind, matched: true}, `Phase 5 evidence case ${index} legacy checkpoint`);
    const logsRecord = object(caseRecord.logs, ["byteLength", "sha256", "forbiddenSubstringsAbsent", "rawBodyAbsent"], `Phase 5 evidence case ${index} logs`);
    const logs = {byteLength: integer(logsRecord.byteLength, `Phase 5 evidence case ${index} log length`), sha256: digest(logsRecord.sha256, `Phase 5 evidence case ${index} log digest`), forbiddenSubstringsAbsent: logsRecord.forbiddenSubstringsAbsent as true, rawBodyAbsent: logsRecord.rawBodyAbsent as true};
    exact(logsRecord.forbiddenSubstringsAbsent, true, `Phase 5 evidence case ${index} forbidden log strings`);
    exact(logsRecord.rawBodyAbsent, true, `Phase 5 evidence case ${index} raw-body log rule`);
    exact(caseRecord.nonLoopbackAttempts, 0, `Phase 5 evidence case ${index} non-loopback attempts`);
    return {caseId: expectedCase.caseId, operationKind: expectedCase.operationKind, request: {method: expectedCase.request.method, path: "/api/ai", headerSha256: expectedHeaderDigest, bodyByteLength: expectedCase.request.body.byteLength, bodySha256: expectedCase.request.body.sha256}, response: {status: expectedCase.expected.status, selectedHeaders, bodyByteLength, bodySha256}, legacyCheckpoint, logs, nonLoopbackAttempts: 0};
  });
  exact(evidenceCases.length, registry.cases.length, "Phase 5 evidence case count");
  const realApiRouteRequests = integer(evidenceRecord.realApiRouteRequests, "Phase 5 real route request count");
  exact(realApiRouteRequests, registry.cases.length, "Phase 5 real route request count");
  const networkRecord = object(record.network, ["browserNonLoopbackAttempts", "serverNonLoopbackAttempts", "childNonLoopbackAttempts", "runnerNonLoopbackAttempts", "runnerLoopbackRequests"], "Phase 5 result network");
  exact(networkRecord, {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0, runnerNonLoopbackAttempts: 0, runnerLoopbackRequests: registry.cases.length}, "Phase 5 result network denial");
  const cleanupRecord = object(record.cleanup, ["anchorRestored", "sourceRestored", "browserContextsOpen", "activeGates", "activeIntercepts", "openChildProcesses", "openPorts", "residualPaths", "residualProfiles"], "Phase 5 result cleanup");
  const expectedCleanup = {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: [], residualProfiles: []} as const;
  exact(cleanupRecord, expectedCleanup, "Phase 5 result cleanup");
  if (graph !== null) {
    exact({derivedGitState, baseCommit, headCommit, observedDirtyPaths, dirtyExpectedPaths, cleanExpectedPaths: [], selectedExpectedPaths}, graph.git, "Phase 5 result/graph Git state");
    exact(bindings, {catalog: graph.catalogBinding, plan: graph.planBinding, registry: graph.registryBinding}, "Phase 5 result/graph bindings");
    exact(selectedCaseIds, graph.plan.selectedCaseIds, "Phase 5 result/plan selected cases");
  }
  return {
    resultVersion: 5, specId: "SPEC-0001", proofPurpose: "phase-5", status: "passed", recordedAt, productPhaseClaimed: true,
    runtime, derivedGitState, baseCommit, headCommit, observedDirtyPaths, dirtyExpectedPaths, cleanExpectedPaths: [], selectedExpectedPaths,
    authorization: {authorizationId: "phase-5/v1", materializationKind: "deferred"}, bindings,
    execution: {selectedCaseIds, caseCount, operationKinds},
    evidence: {routePath: "/api/ai", requestTransport: "guarded-node-loopback-http-exact-bytes/v1", cases: evidenceCases, realApiRouteRequests, browserPageOperations: 0, browserMockedApiResponses: 0, screenshotClaims: 0, sanitizedServerLogs: true},
    network: {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0, runnerNonLoopbackAttempts: 0, runnerLoopbackRequests: registry.cases.length},
    cleanup: {...expectedCleanup, residualPaths: [], residualProfiles: []},
  };
};

const trackedAtHead = (root: string, path: string) => {
  const result = spawnSync("/usr/bin/git", ["ls-files", "--error-unmatch", "--", path], {
    cwd: root,
    encoding: "buffer",
    shell: false,
    env: {PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0"} as unknown as NodeJS.ProcessEnv,
  });
  if (result.status !== 0) fail(`Clean committed extension byte is not tracked at HEAD: ${path}.`);
};

export const loadTesterExtensionGraph = (root: string, planPath: string, validationMode: ExtensionValidationMode = "technical", observation?: GitObservationOverride): ValidatedTesterExtension => {
  const safePlanPath = assertSafeRepositoryPath(planPath, "selected plan path");
  const catalog = validateAuthorizationCatalogValue(readStrictJson(root, CATALOG_PATH));
  const authorization = catalog.authorizations.find((entry): entry is ValidatedAuthorization => entry.authorizationId !== "phase-5/v1" && entry.authorizationId !== "phase-6/v1" && entry.plan.path === safePlanPath) ?? fail(`Browser plan path is not registered: ${safePlanPath}.`);
  const plan = validateExtensionPlanValue(readStrictJson(root, safePlanPath));
  exact(plan.authorizationId, authorization.authorizationId, "plan/catalog authorizationId");
  exact(plan.outputRoot, authorization.outputRoot, "plan/catalog outputRoot");
  exact(plan.operationFamilies, authorization.operationFamilies, "plan/catalog operation families");
  exact(plan.dirtyExpectedPaths.every((path) => authorization.pathCeiling.includes(path)), true, "plan/catalog dirty ceiling");
  const catalogBinding = bindRepositoryFile(root, CATALOG_PATH);
  const planBinding = bindRepositoryFile(root, safePlanPath);
  const registryBinding = bindRepositoryFile(root, authorization.registry.path);
  const adapterBinding = bindRepositoryFile(root, authorization.adapter.path);
  if (authorization.materializationKind === "materialized") {
    exact(planBinding, {path: authorization.plan.path, byteLength: authorization.plan.byteLength, sha256: authorization.plan.sha256}, "materialized plan binding");
    exact(registryBinding, {path: authorization.registry.path, byteLength: authorization.registry.byteLength, sha256: authorization.registry.sha256}, "materialized registry binding");
    exact(adapterBinding, {path: authorization.adapter.path, byteLength: authorization.adapter.byteLength, sha256: authorization.adapter.sha256}, "materialized adapter binding");
  }
  exact(plan.registry, registryBinding, "plan/registry binding");
  const registry = validateExtensionRegistryValue(readStrictJson(root, registryBinding.path));
  exact(registry.authorizationId, authorization.authorizationId, "registry/catalog authorizationId");
  exact(registry.operationFamilies, authorization.operationFamilies, "registry/catalog operation families");
  exact(registry.adapter, adapterBinding, "registry/adapter binding");
  const adapterSource = readFileSync(safeAbsolutePath(root, adapterBinding.path), "utf8");
  const adapter = parseAdapterDeclarationSource(adapterSource, adapterBinding.path);
  exact(adapter.authorizationId, authorization.authorizationId, "adapter/catalog authorizationId");
  for (const fixture of registry.fixtures) {
    if (fixture.sourceKind === "repository-json") {
      if (authorization.authorizationId !== "phase-2/v1" && authorization.authorizationId !== "phase-3/v1" && authorization.authorizationId !== "phase-4/v1") fail("Repository-backed fixtures require a product-phase authorization.");
      const readablePaths = authorization.authorizationId === "phase-4/v1" ? PHASE4_READABLE_FIXTURE_PATHS : authorization.authorizationId === "phase-3/v1" ? PHASE3_READABLE_FIXTURE_PATHS : PHASE2_READABLE_FIXTURE_PATHS;
      if (!(readablePaths as readonly string[]).includes(fixture.binding.path)) fail(`Fixture binding path is not phase-authorized: ${fixture.binding.path}.`);
      verifyBinding(root, fixture.binding, `fixture ${fixture.fixtureId}`);
      readStrictJson(root, fixture.binding.path);
    }
  }
  const actionsById = new Map(registry.actions.map((action) => [action.actionId, action]));
  for (const step of plan.steps) if (!actionsById.has(step.actionId)) fail(`Plan references unknown action ${step.actionId}.`);
  const selectedActionIds = plan.steps.map((step) => step.actionId);
  if (new Set(selectedActionIds).size !== selectedActionIds.length) fail("Plan may invoke each registered action at most once.");
  const driverOperations = new Set(adapter.driverOperations.map((entry) => entry.operation));
  const environmentOperations = new Set(adapter.environmentOperations.map((entry) => entry.operation));
  const pointerTargets = new Set(adapter.pointerTargets.map((entry) => entry.targetId));
  const fixturesById = new Map(registry.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  for (const action of registry.actions) {
    if (action.family === "workspace-driver") {
      if (!driverOperations.has(action.operation)) fail(`Driver operation ${action.operation} is not declared by the adapter.`);
      const expectedKinds = DRIVER_FIXTURE_KINDS[action.operation];
      if (expectedKinds.length === 0) {
        if (action.fixtureId !== null) fail(`Driver operation ${action.operation} forbids a fixture.`);
      } else {
        const fixtureId = action.fixtureId ?? fail(`Driver operation ${action.operation} requires a fixture.`);
        const fixture = fixturesById.get(fixtureId) ?? fail(`Driver operation ${action.operation} references unknown fixture ${fixtureId}.`);
        if (!expectedKinds.includes(fixture.fixtureKind)) fail(`Driver operation ${action.operation} fixture kind mismatch.`);
        const declaredPort = adapter.driverOperations.find((entry) => entry.operation === action.operation);
        if (!declaredPort?.fixtureKinds.includes(fixture.fixtureKind)) fail(`Adapter does not authorize fixture kind ${fixture.fixtureKind} for ${action.operation}.`);
      }
    }
    if (action.family === "runner-environment") {
      if (!environmentOperations.has(action.operation)) fail(`Environment operation ${action.operation} is not declared by the adapter.`);
      const expectedKinds = ENVIRONMENT_FIXTURE_KINDS[action.operation];
      if (expectedKinds.length === 0) {
        if (action.fixtureId !== null) fail(`Environment operation ${action.operation} forbids a fixture.`);
      } else {
        const fixtureId = action.fixtureId ?? fail(`Environment operation ${action.operation} requires a fixture.`);
        const fixture = fixturesById.get(fixtureId) ?? fail(`Environment operation ${action.operation} references unknown fixture ${fixtureId}.`);
        if (!expectedKinds.includes(fixture.fixtureKind)) fail(`Environment operation ${action.operation} fixture kind mismatch.`);
        const declaredPort = adapter.environmentOperations.find((entry) => entry.operation === action.operation);
        if (!declaredPort?.fixtureKinds.includes(fixture.fixtureKind)) fail(`Adapter does not authorize fixture kind ${fixture.fixtureKind} for ${action.operation}.`);
      }
    }
    if (action.family === "pointer" && !pointerTargets.has(action.targetId)) fail(`Pointer target ${action.targetId} is not declared by the adapter.`);
  }
  const git = validationMode === "phase-2-closeout"
    ? derivePhase2CloseoutGraphGitState(root, plan, authorization.pathCeiling, observation)
    : validationMode === "phase-3-closeout"
      ? derivePhase3CloseoutGraphGitState(root, plan, authorization.pathCeiling, observation)
      : validationMode === "phase-4-closeout"
        ? derivePhase4CloseoutGraphGitState(root, plan, authorization.pathCeiling, observation)
      : deriveGitState(root, plan, authorization.pathCeiling, observation);
  if (git.derivedGitState === "clean-committed") for (const path of [CATALOG_PATH, planBinding.path, registryBinding.path, adapterBinding.path]) trackedAtHead(root, path);
  return {authorizationId: authorization.authorizationId, materializationKind: authorization.materializationKind, outputRoot: authorization.outputRoot, pathCeiling: authorization.pathCeiling, operationFamilies: authorization.operationFamilies, catalogBinding, planBinding, registryBinding, adapterBinding, plan, registry, adapter, git};
};

export const loadPhase5RouteGraph = (root: string, planPath: string, validationMode: "technical" | "phase-5-closeout" = "technical", observation?: GitObservationOverride): ValidatedPhase5RouteGraph => {
  const safePlanPath = assertSafeRepositoryPath(planPath, "selected Phase 5 plan path");
  exact(safePlanPath, PHASE5_PLAN_PATH, "selected Phase 5 plan path");
  const catalog = validateAuthorizationCatalogValue(readStrictJson(root, CATALOG_PATH));
  const authorization = catalog.authorizations[4];
  exact(authorization.authorizationId, "phase-5/v1", "Phase 5 catalog authorizationId");
  exact(authorization.plan.path, safePlanPath, "Phase 5 plan/catalog path");
  const plan = validatePhase5RoutePlanValue(readStrictJson(root, safePlanPath));
  exact(plan.authorizationId, authorization.authorizationId, "Phase 5 plan/catalog authorizationId");
  exact(plan.outputRoot, authorization.outputRoot, "Phase 5 plan/catalog outputRoot");
  exact(plan.operationFamilies, authorization.operationFamilies, "Phase 5 plan/catalog operation families");
  exact(plan.dirtyExpectedPaths.every((path) => authorization.pathCeiling.includes(path)), true, "Phase 5 plan/catalog dirty ceiling");
  const catalogBinding = bindRepositoryFile(root, CATALOG_PATH);
  const planBinding = bindRepositoryFile(root, safePlanPath);
  const registryBinding = bindRepositoryFile(root, authorization.registry.path);
  exact(plan.registry, registryBinding, "Phase 5 plan/registry binding");
  const registry = validatePhase5RouteRegistryValue(readStrictJson(root, registryBinding.path));
  exact(registry.authorizationId, authorization.authorizationId, "Phase 5 registry/catalog authorizationId");
  exact(registry.operationFamilies, authorization.operationFamilies, "Phase 5 registry/catalog operation families");
  exact(plan.selectedCaseIds, registry.cases.map((entry) => entry.caseId), "Phase 5 selected route cases");
  const git = validationMode === "phase-5-closeout"
    ? derivePhase5CloseoutGraphGitState(root, plan, authorization.pathCeiling, observation)
    : deriveGitState(root, plan, authorization.pathCeiling, observation);
  if (git.derivedGitState === "clean-committed") for (const path of [CATALOG_PATH, planBinding.path, registryBinding.path]) trackedAtHead(root, path);
  return {authorizationId: "phase-5/v1", materializationKind: "deferred", outputRoot: PHASE5_OUTPUT_ROOT, pathCeiling: authorization.pathCeiling, operationFamilies: authorization.operationFamilies, catalogBinding, planBinding, registryBinding, plan, registry, git};
};

export const loadPhase6Graph = (root: string, planPath: string, validationMode: "technical" | "phase-6-closeout" = "technical", observation?: GitObservationOverride): ValidatedPhase6Graph => {
  const safePlanPath = assertSafeRepositoryPath(planPath, "selected Phase 6 plan path");
  exact(safePlanPath, PHASE6_PLAN_PATH, "selected Phase 6 plan path");
  const catalog = validateAuthorizationCatalogValue(readStrictJson(root, CATALOG_PATH));
  const authorization = catalog.authorizations[5];
  exact(authorization.authorizationId, "phase-6/v1", "Phase 6 catalog authorizationId");
  const plan = validatePhase6PlanValue(readStrictJson(root, safePlanPath));
  const catalogBinding = bindRepositoryFile(root, CATALOG_PATH);
  const planBinding = bindRepositoryFile(root, safePlanPath);
  const registryBinding = bindRepositoryFile(root, authorization.registry.path);
  const adapterBinding = bindRepositoryFile(root, authorization.adapter.path);
  exact(plan.registry, registryBinding, "Phase 6 plan/registry binding");
  const registry = validatePhase6RegistryValue(readStrictJson(root, registryBinding.path));
  exact(registry.adapter, adapterBinding, "Phase 6 registry/adapter binding");
  for (const fixture of registry.fixtures) verifyBinding(root, fixture, `Phase 6 fixture ${fixture.path}`);
  exact(plan.selectedActionIds, registry.actions.map((entry) => entry.actionId), "Phase 6 selected actions");
  const git = validationMode === "phase-6-closeout"
    ? derivePhase6CloseoutGraphGitState(root, plan, authorization.pathCeiling, observation)
    : deriveGitState(root, plan, authorization.pathCeiling, observation);
  return {
    authorizationId: "phase-6/v1", materializationKind: "deferred", outputRoot: PHASE6_OUTPUT_ROOT,
    pathCeiling: authorization.pathCeiling, operationFamilies: authorization.operationFamilies,
    catalogBinding, planBinding, registryBinding, adapterBinding, plan, registry, git,
  };
};

export const validatePhase6Result = (value: unknown, root: string, verifyBindings = true, validationMode: "technical" | "phase-6-closeout" = "technical"): Phase6Result => {
  const record = object(value, ["resultVersion", "specId", "proofPurpose", "status", "recordedAt", "productPhaseClaimed", "runtime", "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths", "dirtyExpectedPaths", "cleanExpectedPaths", "selectedExpectedPaths", "authorization", "bindings", "execution", "evidence", "network", "cleanup"], "Phase 6 result");
  exact(record.resultVersion, 6, "Phase 6 resultVersion");
  exact(record.specId, "SPEC-0001", "Phase 6 specId");
  exact(record.proofPurpose, "phase-6", "Phase 6 proofPurpose");
  exact(record.status, "passed", "Phase 6 status");
  exact(record.productPhaseClaimed, true, "Phase 6 product claim");
  const recordedAt = string(record.recordedAt, "Phase 6 recordedAt");
  if (Number.isNaN(Date.parse(recordedAt))) fail("Phase 6 recordedAt must be an ISO-compatible timestamp.");
  const runtimeRecord = object(record.runtime, ["nodeVersion", "playwrightCoreVersion", "browserVersion", "browserExecutable"], "Phase 6 runtime");
  const runtime = {nodeVersion: string(runtimeRecord.nodeVersion, "Phase 6 nodeVersion"), playwrightCoreVersion: enumeration(runtimeRecord.playwrightCoreVersion, ["1.62.1"] as const, "Phase 6 playwrightCoreVersion"), browserVersion: string(runtimeRecord.browserVersion, "Phase 6 browserVersion"), browserExecutable: parseBrowserExecutableBinding(runtimeRecord.browserExecutable, "Phase 6 browserExecutable")};
  if (verifyBindings) exact(runtime.browserExecutable, bindBrowserExecutable(), "Phase 6 browser executable binding");
  const derivedGitState = enumeration(record.derivedGitState, ["dirty-executor", "clean-committed"] as const, "Phase 6 derivedGitState");
  const baseCommit = gitSha(record.baseCommit, "Phase 6 baseCommit");
  const headCommit = gitSha(record.headCommit, "Phase 6 headCommit");
  const observedDirtyPaths = canonicalProofPaths(record.observedDirtyPaths, "Phase 6 observed paths").map((path) => assertSafeRepositoryPath(path));
  const dirtyExpectedPaths = canonicalProofPaths(record.dirtyExpectedPaths, "Phase 6 dirty paths").map((path) => assertSafeRepositoryPath(path));
  exact(record.cleanExpectedPaths, [], "Phase 6 clean paths");
  const selectedExpectedPaths = canonicalProofPaths(record.selectedExpectedPaths, "Phase 6 selected paths").map((path) => assertSafeRepositoryPath(path));
  exact(selectedExpectedPaths, derivedGitState === "dirty-executor" ? dirtyExpectedPaths : [], "Phase 6 selected paths");
  exact(observedDirtyPaths, selectedExpectedPaths, "Phase 6 observed/selected paths");
  const authorizationRecord = object(record.authorization, ["authorizationId", "materializationKind"], "Phase 6 authorization");
  exact(authorizationRecord, {authorizationId: "phase-6/v1", materializationKind: "deferred"}, "Phase 6 authorization");
  const bindingsRecord = object(record.bindings, ["catalog", "plan", "registry", "adapter"], "Phase 6 bindings");
  const bindings = {catalog: parseBinding(bindingsRecord.catalog, "Phase 6 catalog binding"), plan: parseBinding(bindingsRecord.plan, "Phase 6 plan binding"), registry: parseBinding(bindingsRecord.registry, "Phase 6 registry binding"), adapter: parseBinding(bindingsRecord.adapter, "Phase 6 adapter binding")};
  const graph = verifyBindings ? loadPhase6Graph(root, bindings.plan.path, validationMode) : null;
  if (graph) {
    exact(bindings, {catalog: graph.catalogBinding, plan: graph.planBinding, registry: graph.registryBinding, adapter: graph.adapterBinding}, "Phase 6 graph bindings");
    exact({derivedGitState, baseCommit, headCommit, observedDirtyPaths, dirtyExpectedPaths, cleanExpectedPaths: [], selectedExpectedPaths}, graph.git, "Phase 6 graph Git state");
  }
  const executionRecord = object(record.execution, ["selectedActionIds", "acceptedVisibleCaseCount", "visibleRejectionCount", "guardedRejectedCaseCount", "completeApplyCount"], "Phase 6 execution");
  const selectedActionIds = array(executionRecord.selectedActionIds, "Phase 6 action IDs").map((entry, index) => handle(entry, `Phase 6 action ${index}`));
  if (graph) exact(selectedActionIds, graph.plan.selectedActionIds, "Phase 6 selected actions");
  exact(executionRecord.acceptedVisibleCaseCount, 15, "Phase 6 accepted visible count");
  exact(executionRecord.visibleRejectionCount, 13, "Phase 6 visible rejection count");
  exact(executionRecord.guardedRejectedCaseCount, 36, "Phase 6 guarded rejection count");
  exact(executionRecord.completeApplyCount, 1, "Phase 6 complete Apply count");
  const evidenceRecord = object(record.evidence, ["previewCopy", "actions", "screenshots", "realApiRouteRequests", "drawingInterceptedRequests"], "Phase 6 evidence");
  const actions = array(evidenceRecord.actions, "Phase 6 evidence actions");
  const screenshots = array(evidenceRecord.screenshots, "Phase 6 screenshots").map((entry, index) => {
    const screenshotRecord = object(entry, ["path", "sha256", "byteLength", "id", "viewport"], `Phase 6 screenshot ${index}`);
    const binding = parseBinding({path: screenshotRecord.path, sha256: screenshotRecord.sha256, byteLength: screenshotRecord.byteLength}, `Phase 6 screenshot ${index} binding`);
    if (verifyBindings) verifyBinding(root, binding, `Phase 6 screenshot ${index} binding`);
    const id = handle(screenshotRecord.id, `Phase 6 screenshot ${index} ID`);
    const viewport = object(screenshotRecord.viewport, ["width", "height"], `Phase 6 screenshot ${index} viewport`);
    const normalizedViewport = viewport.width === 1440 && viewport.height === 900
      ? {width: 1440 as const, height: 900 as const}
      : viewport.width === 1024 && viewport.height === 768
        ? {width: 1024 as const, height: 768 as const}
        : fail(`Phase 6 screenshot ${index} viewport is unsupported.`);
    return {...binding, id, viewport: normalizedViewport};
  });
  const realApiRouteRequests = integer(evidenceRecord.realApiRouteRequests, "Phase 6 real API route requests");
  const drawingInterceptedRequests = integer(evidenceRecord.drawingInterceptedRequests, "Phase 6 Drawing intercepted requests");
  if (graph) {
    exact(evidenceRecord.previewCopy, graph.plan.evidence.previewCopy, "Phase 6 preview copy");
    exact(screenshots.map((entry) => entry.id), graph.plan.evidence.screenshotIds, "Phase 6 screenshots");
  }
  if (actions.length < selectedActionIds.length) fail("Phase 6 evidence is missing selected actions.");
  if (realApiRouteRequests < 1) fail("Phase 6 did not exercise the real /api/ai route.");
  exact(drawingInterceptedRequests, 1, "Phase 6 Drawing intercepted request count");
  const networkRecord = object(record.network, ["browserNonLoopbackAttempts", "serverNonLoopbackAttempts", "childNonLoopbackAttempts", "runnerNonLoopbackAttempts"], "Phase 6 network");
  exact(networkRecord, {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0, runnerNonLoopbackAttempts: 0}, "Phase 6 network denial");
  const cleanupRecord = object(record.cleanup, ["anchorRestored", "sourceRestored", "browserContextsOpen", "activeGates", "activeIntercepts", "openChildProcesses", "openPorts", "residualPaths", "residualProfiles"], "Phase 6 cleanup");
  exact(cleanupRecord, {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: [], residualProfiles: []}, "Phase 6 cleanup");
  return {resultVersion: 6, specId: "SPEC-0001", proofPurpose: "phase-6", status: "passed", recordedAt, productPhaseClaimed: true, runtime, derivedGitState, baseCommit, headCommit, observedDirtyPaths, dirtyExpectedPaths, cleanExpectedPaths: [], selectedExpectedPaths, authorization: {authorizationId: "phase-6/v1", materializationKind: "deferred"}, bindings, execution: {selectedActionIds, acceptedVisibleCaseCount: 15, visibleRejectionCount: 13, guardedRejectedCaseCount: 36, completeApplyCount: 1}, evidence: {previewCopy: evidenceRecord.previewCopy as string, actions, screenshots, realApiRouteRequests, drawingInterceptedRequests}, network: {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0, runnerNonLoopbackAttempts: 0}, cleanup: {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: [], residualProfiles: []}};
};
