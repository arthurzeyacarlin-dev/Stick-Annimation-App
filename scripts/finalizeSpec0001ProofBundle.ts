import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";
import {
  PHASE2_CLOSEOUT_PATHS,
  PHASE4_CLOSEOUT_PATHS,
  assertEmptyProofIndex,
  assertNoHiddenIndexFlags,
  assertNoProofRelevantGitEnvironment,
  assertPhaseCloseoutPaths,
  buildTrackedStateInventory,
  validateCloseoutManifest,
  validateLiveTuple,
  validatePhase7LiveProofManifest,
  validateProofManifestForCloseout,
  sortProofPaths,
  type LiveTuple,
} from "./validateSpec0001ProofBundle.ts";

const ROOT = process.cwd();
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DECISION_PATTERN = /^[0-9a-f]{64}$/;
const CORRECTION_PURPOSE = "phase-2-ui-restoration-correction";
const CORRECTION_BASE = "1f9746a6188e5e13aca1fbd62bea2e1e27bba627";
const CORRECTION_PROOF_PATH = "output/spec-0001/phase-2/proof-manifest.json";
const CORRECTION_OUTPUT_PATH = "output/spec-0001/phase-2-ui-restoration-correction/proof-closeout-manifest.json";
const CORRECTION_ACCEPTED_PROOF_SHA256 = "sha256:edda3028b9fbe2759e31059455f16cc3ee02ac9b242149107454071dae62de90";
const CORRECTION_FINALIZER_PATH = "scripts/finalizeSpec0001ProofBundle.ts";

const CORRECTION_TECHNICAL_PATHS = sortProofPaths([
  "scripts/fixtures/spec0001-browser/v1/phase-2-action-registry.json",
  "scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json",
  "scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json",
  "scripts/fixtures/stick-ai/v1/phase-2-proof-commands.json",
  "scripts/fixtures/stick-ai/v1/stick-editable-timeline-alias-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-editable-timeline-cases.json",
  "scripts/fixtures/stick-ai/v1/stick-ui-restoration-reference.json",
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
  "src/lib/stickfigure/stickTimeline.ts",
]);

const CORRECTION_CLOSEOUT_PATHS = sortProofPaths([
  "docs/CURRENT_STATE.md",
  "docs/DECISIONS.md",
  "docs/SESSION_HANDOFF.md",
  "docs/TODO.md",
  "docs/changelog.md",
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "project/project_structure.txt",
]);

const CORRECTION_CHANGED_PATHS = sortProofPaths([
  ...CORRECTION_TECHNICAL_PATHS,
  ...CORRECTION_CLOSEOUT_PATHS,
  CORRECTION_FINALIZER_PATH,
]);

const CORRECTION_RUNTIME_PATHS = sortProofPaths([
  "src/components/workspace/stickfigure/StickFigureCanvas.tsx",
  "src/components/workspace/stickfigure/StickFigureRightPanel.tsx",
  "src/components/workspace/stickfigure/StickFigureTimelineRow.tsx",
  "src/components/workspace/stickfigure/StickFigureToolBar.tsx",
  "src/components/workspace/stickfigure/StickFigureTopBar.tsx",
  "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "src/components/workspace/stickfigure/types.ts",
  "src/lib/stickfigure/stickTimeline.ts",
]);

const CORRECTION_PROTECTED_RUNTIME_PATHS = sortProofPaths([
  "app/page.tsx",
  "src/components/open-project/OpenProjectBrowser.tsx",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingRightPanel.tsx",
  "src/components/workspace/DrawingTimelineRow.tsx",
  "src/components/workspace/DrawingToolBar.tsx",
  "src/components/workspace/DrawingTopBar.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/drawingProjectAudioCodec.ts",
  "src/lib/drawingProjectIndexedDb.ts",
  "src/lib/drawingProjectRasterCodec.ts",
  "src/lib/drawingProjectStorage.ts",
  "src/lib/drawingProjectV1Compatibility.ts",
  "src/lib/drawingProjectV2Canonical.ts",
  "src/lib/drawingProjectV2Contract.ts",
  "src/lib/drawingProjectV2Repository.ts",
]);

const CORRECTION_PROTECTED_GROUPS = [
  "drawing-generate-frames",
  "drawing-undo-redo-play-pause",
  "home-new-drawing",
  "home-new-stick",
  "stick-creator-back",
];

const CORRECTION_EVIDENCE_PATHS = sortProofPaths([
  "output/spec-0001/phase-2-ui-restoration-correction/browser/action-ledger.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/checkpoint-ledger.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/cleanup.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/console-ledger.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/network-ledger.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/regression-ledger.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/request-ledger.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/runner-result.json",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/screenshots/compact-01-fresh-stick.png",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/screenshots/compact-02-stick-after-creator.png",
  "output/spec-0001/phase-2-ui-restoration-correction/browser/storage-ledger.json",
  "output/spec-0001/phase-2-ui-restoration-correction/direct-browser/compact-1024x768-acceptance.png",
  "output/spec-0001/phase-2-ui-restoration-correction/direct-browser/desktop-1440x900-acceptance.png",
  "output/spec-0001/phase-2-ui-restoration-correction/direct-browser/desktop-1440x900-fresh-stick-tools-and-add-limb.png",
  "output/spec-0001/phase-2-ui-restoration-correction/direct-browser/desktop-1440x900-fresh-stick-tools.png",
  "output/spec-0001/phase-2-ui-restoration-correction/direct-browser/desktop-1440x900-fresh-stick.png",
  "output/spec-0001/phase-2-ui-restoration-correction/direct-browser/desktop-1440x900-required-correction.png",
]);

const SPEC0002_FROZEN_BINDINGS = [
  {name: "runner", path: "scripts/runSpec0001BrowserProof.ts", sha256: "b15c9024146fa3155d319f67864e618afa72d6567ec62091aa34bd12ea42560d"},
  {name: "contract", path: "scripts/spec0001-browser/browserTesterContract.ts", sha256: "e055e80b5e64c90eed4cdf02241504c5752d91a7e67401b82523538d121b9028"},
  {name: "plan", path: "scripts/fixtures/spec0001-browser/v1/phase-1.5-browser-plan.json", sha256: "6eaca77480f1d5dabd16264ecb8b11fadc366689712bc8e4b9ada0cbabde7143"},
  {name: "phase1Validator", path: "scripts/validateSpec0002Proof.ts", sha256: "1b12cdc360f14b3cfb16ff0d8718ec222bcfcd35b9449a87c59506ae371fd1d9"},
] as const;
const CURRENT_SPEC0001_RUNNER_SHA256 = "17056ea7b6bedcc297f57f3a7fc3f681a52ace23567921097ddf9bdf82ed97da";

const sha256Bytes = (bytes: Uint8Array | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fileBinding = (path: string) => {
  const bytes = readFileSync(resolve(ROOT, path));
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8"});
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};

const gitBuffer = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "buffer", shell: false, maxBuffer: 256 * 1024 * 1024});
  if (result.status !== 0) throw new Error(Buffer.from(result.stderr ?? "").toString("utf8") || `git ${argv.join(" ")} failed`);
  return Buffer.from(result.stdout ?? "");
};

const nulList = (value: string) => value.split("\0").filter(Boolean);

const currentChangedPaths = (base: string) => sortProofPaths([...new Set([
  ...nulList(git("diff", "--name-only", "-z", base)),
  ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
])]);

const repositoryPath = (path: string, label: string) => {
  const absolute = resolve(ROOT, path);
  const local = relative(ROOT, absolute);
  if (local === ".." || local.startsWith(`..${sep}`)) throw new Error(`${label} escapes the repository.`);
  return absolute;
};

type JsonObject = Record<string, unknown>;
type FileBinding = {path: string; sha256: string; byteLength: number};

const strictCorrectionObject = (value: unknown, keys: readonly string[], label: string): JsonObject => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const object = value as JsonObject;
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return object;
};

const parseCorrectionJson = (path: string) => JSON.parse(readFileSync(repositoryPath(path, "Correction JSON"), "utf8")) as unknown;

const validateCorrectionBindingShape = (value: unknown, label: string): FileBinding => {
  const binding = strictCorrectionObject(value, ["path", "sha256", "byteLength"], label);
  assert.equal(typeof binding.path, "string", `${label} path must be a string.`);
  repositoryPath(binding.path as string, label);
  assert.equal(typeof binding.sha256, "string", `${label} SHA must be a string.`);
  assert.match(binding.sha256 as string, HASH_PATTERN, `${label} SHA is invalid.`);
  assert.ok(Number.isSafeInteger(binding.byteLength) && (binding.byteLength as number) >= 0, `${label} byte length is invalid.`);
  return {path: binding.path as string, sha256: binding.sha256 as string, byteLength: binding.byteLength as number};
};

const validateCurrentCorrectionBinding = (value: unknown, label: string) => {
  const binding = validateCorrectionBindingShape(value, label);
  assert.deepEqual(binding, fileBinding(binding.path), `${label} does not match current bytes.`);
  return binding;
};

const baseFileBinding = (base: string, path: string): FileBinding => {
  const bytes = gitBuffer("show", `${base}:${path}`);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const validateBaseCorrectionBinding = (value: unknown, base: string, label: string) => {
  const binding = validateCorrectionBindingShape(value, label);
  assert.deepEqual(binding, baseFileBinding(base, binding.path), `${label} does not match exact base bytes.`);
  return binding;
};

const rejectSymlinkComponents = (path: string) => {
  const absolute = repositoryPath(path, "Path");
  let current = ROOT;
  for (const part of relative(ROOT, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Symlink path component rejected: ${relative(ROOT, current)}`);
  }
};

const parseArgs = () => {
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    if (values.has(match[1])) throw new Error(`Duplicate --${match[1]} argument.`);
    values.set(match[1], match[2]);
  }
  for (const key of ["phase", "base", "proof", "output"]) if (!values.has(key)) throw new Error(`Missing --${key}=...`);
  return {
    phase: Number(values.get("phase")),
    base: values.get("base")!,
    proof: values.get("proof")!,
    output: values.get("output")!,
    liveProof: values.get("live-proof"),
    decision: values.get("authorization-decision-digest"),
  };
};

const parseCorrectionArgs = () => {
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported correction argument: ${argument}`);
    if (values.has(match[1])) throw new Error(`Duplicate correction --${match[1]} argument.`);
    values.set(match[1], match[2]);
  }
  assert.deepEqual([...values.keys()].sort(), ["base", "output", "phase", "proof", "purpose"], "Correction finalizer arguments must be exact.");
  assert.equal(values.get("purpose"), CORRECTION_PURPOSE, "Correction finalizer purpose is invalid.");
  assert.equal(values.get("phase"), "2", "Correction finalizer phase must be 2.");
  assert.equal(values.get("base"), CORRECTION_BASE, "Correction finalizer base is invalid.");
  assert.equal(values.get("proof"), CORRECTION_PROOF_PATH, "Correction finalizer proof path is invalid.");
  assert.equal(values.get("output"), CORRECTION_OUTPUT_PATH, "Correction finalizer output path is invalid.");
  return {
    purpose: values.get("purpose")!,
    phase: 2 as const,
    base: values.get("base")!,
    proof: values.get("proof")!,
    output: values.get("output")!,
  };
};

const phaseOneAllowed = new Set([
  "src/lib/stickfigure/stickProjectContract.ts",
  "src/lib/ai/stickFigureAiContract.ts",
  "scripts/validateStickFigureAiContracts.ts",
  "scripts/validateSpec0001ProofBundle.ts",
  "scripts/recordSpec0001ProofBundle.ts",
  "scripts/finalizeSpec0001ProofBundle.ts",
  ...[
    "fresh-stick-project.json", "manual-wave-actions.json", "manual-wave-applied-project.json",
    "manual-ai-content-equivalence.json", "wave-request.json", "wave-provider-plan.json", "wave-command-batch.json",
    "wave-command-results.json", "wave-applied-project.json", "non-wave-document-cases.json",
    "stick-manual-edit-capability-cases.json", "stick-line-head-vectors.json", "canonical-hash-vectors.json",
    "derived-id-vectors.json", "prompt-normalization-cases.json", "invalid-contract-cases.json",
    "proof-manifest.schema.json", "proof-closeout-manifest.schema.json", "proof-command-receipt.schema.json",
    "phase7-live-proof-manifest.schema.json", "phase-1-proof-commands.json",
  ].map((name) => `scripts/fixtures/stick-ai/v1/${name}`),
  "docs/specs/0001-first-reversible-ai-stick-animation.md",
  "docs/specs/README.md",
  "docs/CURRENT_STATE.md",
  "docs/TODO.md",
  "docs/SESSION_HANDOFF.md",
  "docs/changelog.md",
  "project/project_structure.txt",
]);

const listFilesRecursively = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Proof output may not contain symlinks: ${relative(ROOT, absolute)}`);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else if (entry.isFile()) files.push(relative(ROOT, absolute));
    else throw new Error(`Unsupported proof artifact type: ${relative(ROOT, absolute)}`);
  }
  return files.sort();
};

const proofArtifactInventory = (proofPath: string, closeoutPath: string) => {
  const directory = dirname(resolve(ROOT, proofPath));
  return listFilesRecursively(directory)
    .filter((path) => path !== closeoutPath && !path.endsWith(".tmp"))
    .sort()
    .map(fileBinding);
};

const parseLiveManifest = (path: string, decision: string) => {
  const value = JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as Record<string, unknown>;
  return validatePhase7LiveProofManifest(value, decision);
};

const parseCatastrophicCleanupReceipt = (decision: string, sibling: boolean) => {
  const path = sibling
    ? `output/spec-0001/phase-7-live/${decision}/live/live-proof-cleanup-receipt.json`
    : `output/spec-0001/phase-7/live/${decision}/live-proof-cleanup-receipt.json`;
  rejectSymlinkComponents(path);
  if (!existsSync(resolve(ROOT, path))) throw new Error("Catastrophic live closeout requires the strict cleanup receipt.");
  const value = JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(value).sort(), ["cleanupVersion", "kind", "authorizationDecisionDigest", "observedArtifactSha256", "observedArtifactAbsent", "cleanupSucceeded", "residualArtifactCount", "privacy"].sort(), "Cleanup receipt fields must be exact.");
  assert.equal(value.cleanupVersion, 1);
  assert.equal(value.kind, "stick-ai-live-proof-cleanup-receipt");
  assert.equal(value.authorizationDecisionDigest, decision);
  assert.ok((value.observedArtifactAbsent === true && value.observedArtifactSha256 === null) || (value.observedArtifactAbsent === false && typeof value.observedArtifactSha256 === "string" && HASH_PATTERN.test(value.observedArtifactSha256)), "Cleanup observed-artifact tuple is invalid.");
  assert.equal(value.cleanupSucceeded, true);
  assert.equal(value.residualArtifactCount, 0);
  assert.equal(value.privacy, "sanitized-no-content");
  return {
    cleanupReceipt: fileBinding(path),
    observedArtifactSha256: value.observedArtifactSha256 as string | null,
    observedArtifactAbsent: value.observedArtifactAbsent as boolean,
    cleanupSucceeded: true as const,
    residualArtifactCount: 0 as const,
  };
};

const buildLiveTuple = (phase: number, liveProof: string | undefined, decisionInput: string | undefined, proofPath?: string): LiveTuple => {
  if (phase !== 7) {
    if (liveProof !== undefined || decisionInput !== undefined) throw new Error("Live-proof arguments are Phase 7-only.");
    return {liveProofInput: "none", authorizationDecisionDigest: null, liveProofManifestSha256: null, liveProviderProof: "unperformed", liveProofEvidenceQuality: "not_attempted", liveCounts: null, possibleCharge: null, catastrophicEvidence: null};
  }
  if (liveProof === undefined || decisionInput === undefined) throw new Error("Phase 7 requires both live-proof and authorization-decision-digest arguments.");
  if (liveProof === "none" && decisionInput === "none") {
    return {liveProofInput: "none", authorizationDecisionDigest: null, liveProofManifestSha256: null, liveProviderProof: "unperformed", liveProofEvidenceQuality: "not_attempted", liveCounts: null, possibleCharge: null, catastrophicEvidence: null};
  }
  if (liveProof === "none" && DECISION_PATTERN.test(decisionInput)) {
    const sibling = proofPath?.startsWith(`output/spec-0001/phase-7-live/${decisionInput}/`) ?? false;
    return {liveProofInput: "none", authorizationDecisionDigest: decisionInput, liveProofManifestSha256: null, liveProviderProof: "failed", liveProofEvidenceQuality: "catastrophic_unproven", liveCounts: "unknown", possibleCharge: "unknown", catastrophicEvidence: parseCatastrophicCleanupReceipt(decisionInput, sibling)};
  }
  if (liveProof === "none" || decisionInput === "none" || !DECISION_PATTERN.test(decisionInput)) throw new Error("Live proof and decision arguments are inconsistent.");
  const implementationPath = `output/spec-0001/phase-7/live/${decisionInput}/live-proof-manifest.json`;
  const siblingPath = `output/spec-0001/phase-7-live/${decisionInput}/live/live-proof-manifest.json`;
  if (liveProof !== implementationPath && liveProof !== siblingPath) throw new Error("Live proof path is outside the two decision-bound roots.");
  rejectSymlinkComponents(liveProof);
  const manifest = parseLiveManifest(liveProof, decisionInput);
  const binding = fileBinding(liveProof);
  const tuple: LiveTuple = {
    liveProofInput: liveProof,
    authorizationDecisionDigest: decisionInput,
    liveProofManifestSha256: binding.sha256,
    liveProviderProof: manifest.liveProofStatus as "completed" | "failed",
    liveProofEvidenceQuality: "validated_manifest",
    liveCounts: manifest.counts as Exclude<LiveTuple["liveCounts"], null | "unknown">,
    possibleCharge: (manifest.result as Record<string, unknown>).possibleCharge as boolean,
    catastrophicEvidence: null,
  };
  validateLiveTuple(phase, tuple);
  return tuple;
};

const assertCorrectionChangedPaths = (paths: readonly string[]) => {
  assert.deepEqual(paths, CORRECTION_CHANGED_PATHS, "Correction final diff must equal the exact 29-path technical/control-plane/finalizer ceiling.");
};

const assertCorrectionRepositoryGate = (input: {base: string; head: string; changedPaths: readonly string[]; stagedPaths: readonly string[]}) => {
  assert.equal(input.base, CORRECTION_BASE, "Correction repository base is invalid.");
  assert.equal(input.head, CORRECTION_BASE, "Correction finalization must occur before publication on the exact accepted base/HEAD.");
  assert.deepEqual(input.stagedPaths, [], "Correction Git index contains staged paths.");
  assertCorrectionChangedPaths(input.changedPaths);
};

const currentCorrectionEvidenceInventory = (closeoutPath = CORRECTION_OUTPUT_PATH) => {
  const root = resolve(ROOT, `output/spec-0001/${CORRECTION_PURPOSE}`);
  const observedPaths = sortProofPaths(listFilesRecursively(root).filter((path) => path !== closeoutPath));
  assert.deepEqual(observedPaths, CORRECTION_EVIDENCE_PATHS, "Correction evidence contains a missing, extra, or diagnostic-only artifact.");
  return observedPaths.map(fileBinding);
};

const validateCorrectionRunnerResult = (value: unknown) => {
  const runner = strictCorrectionObject(value, [
    "resultVersion", "specId", "proofPurpose", "status", "recordedAt", "productPhaseClaimed", "runtime", "derivedGitState",
    "baseCommit", "headCommit", "observedDirtyPaths", "dirtyExpectedPaths", "cleanExpectedPaths", "selectedExpectedPaths",
    "authorization", "bindings", "execution", "evidence", "network", "cleanup",
  ], "correction browser runner result");
  assert.equal(runner.resultVersion, 2);
  assert.equal(runner.specId, "SPEC-0001");
  assert.equal(runner.proofPurpose, "phase-2");
  assert.equal(runner.status, "passed");
  assert.ok(typeof runner.recordedAt === "string" && !Number.isNaN(Date.parse(runner.recordedAt)), "Correction runner timestamp is invalid.");
  assert.equal(runner.productPhaseClaimed, true);
  assert.equal(runner.derivedGitState, "dirty-executor");
  assert.equal(runner.baseCommit, CORRECTION_BASE);
  assert.equal(runner.headCommit, CORRECTION_BASE);
  for (const key of ["observedDirtyPaths", "dirtyExpectedPaths", "selectedExpectedPaths"] as const) {
    assert.deepEqual(runner[key], CORRECTION_TECHNICAL_PATHS, `Correction runner ${key} differs from the accepted 20-path state.`);
  }
  assert.deepEqual(runner.cleanExpectedPaths, []);
  const execution = strictCorrectionObject(runner.execution, ["selectedActionIds", "actionCount", "checkpointCount", "screenshotCount", "protectedRegressionGroups"], "correction runner execution");
  assert.ok(Array.isArray(execution.selectedActionIds) && execution.selectedActionIds.length === 15, "Correction runner must bind 15 selected actions.");
  assert.equal(execution.actionCount, 15);
  assert.equal(execution.checkpointCount, 0);
  assert.equal(execution.screenshotCount, 2);
  assert.deepEqual(execution.protectedRegressionGroups, CORRECTION_PROTECTED_GROUPS);
  const evidence = strictCorrectionObject(runner.evidence, ["ledgerKinds", "screenshotIds", "protectedRegressionGroups"], "correction runner evidence");
  assert.deepEqual(evidence.screenshotIds, ["compact-01-fresh-stick", "compact-02-stick-after-creator"]);
  assert.deepEqual(evidence.protectedRegressionGroups, CORRECTION_PROTECTED_GROUPS);
  const network = strictCorrectionObject(runner.network, ["browserNonLoopbackAttempts", "serverNonLoopbackAttempts", "childNonLoopbackAttempts"], "correction runner network");
  assert.deepEqual(network, {browserNonLoopbackAttempts: 0, serverNonLoopbackAttempts: 0, childNonLoopbackAttempts: 0});
  const cleanup = strictCorrectionObject(runner.cleanup, ["anchorRestored", "sourceRestored", "browserContextsOpen", "activeGates", "activeIntercepts", "openChildProcesses", "openPorts", "residualPaths"], "correction runner cleanup");
  assert.deepEqual(cleanup, {anchorRestored: true, sourceRestored: true, browserContextsOpen: 0, activeGates: 0, activeIntercepts: 0, openChildProcesses: 0, openPorts: 0, residualPaths: []});
  return runner;
};

const validateCorrectionTechnicalManifest = (manifestPath: string) => {
  assert.equal(manifestPath, CORRECTION_PROOF_PATH, "Correction technical manifest path is invalid.");
  const proofBinding = fileBinding(manifestPath);
  assert.equal(proofBinding.sha256, CORRECTION_ACCEPTED_PROOF_SHA256, "Correction technical manifest SHA does not match Arthur's accepted proof.");
  const manifest = strictCorrectionObject(parseCorrectionJson(manifestPath), [
    "manifestVersion", "specId", "phase", "baseCommit", "headCommit", "recordedAt", "runtime", "commandConfig", "receipts",
    "artifacts", "bindings", "evidence", "commandsPassed", "lintRegression",
  ], "correction technical manifest");
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.specId, "SPEC-0001");
  assert.equal(manifest.phase, 2);
  assert.equal(manifest.baseCommit, CORRECTION_BASE);
  assert.equal(manifest.headCommit, CORRECTION_BASE);
  assert.equal(manifest.commandsPassed, true);
  assert.ok(typeof manifest.recordedAt === "string" && !Number.isNaN(Date.parse(manifest.recordedAt)), "Correction technical-manifest timestamp is invalid.");

  const configBinding = validateCurrentCorrectionBinding(manifest.commandConfig, "correction command-config binding");
  assert.equal(configBinding.path, "scripts/fixtures/stick-ai/v1/phase-2-proof-commands.json");
  const config = strictCorrectionObject(parseCorrectionJson(configBinding.path), ["configVersion", "phase", "baseCommit", "bindings", "browserEvidenceInput", "commands"], "correction proof command config");
  assert.equal(config.configVersion, 2);
  assert.equal(config.phase, 2);
  assert.equal(config.baseCommit, CORRECTION_BASE);
  assert.ok(Array.isArray(config.commands) && config.commands.length === 6, "Correction command config must contain six commands.");
  assert.ok(Array.isArray(manifest.receipts) && manifest.receipts.length === 6, "Correction technical manifest must contain six receipts.");
  const receiptPaths = new Set<string>();
  (manifest.receipts as unknown[]).forEach((value, index) => {
    const binding = validateCurrentCorrectionBinding(value, `correction receipt binding ${index}`);
    assert.ok(!receiptPaths.has(binding.path), `Duplicate correction receipt path ${binding.path}.`);
    receiptPaths.add(binding.path);
    const receipt = parseCorrectionJson(binding.path) as JsonObject;
    const command = (config.commands as JsonObject[])[index];
    assert.equal(receipt.receiptVersion, 2, `Correction receipt ${index} version is invalid.`);
    assert.equal(receipt.order, index, `Correction receipt ${index} order is invalid.`);
    assert.equal(receipt.name, command.name, `Correction receipt ${index} command name differs.`);
    assert.deepEqual(receipt.argv, command.argv, `Correction receipt ${index} argv differs.`);
    assert.equal(receipt.expectedExitCode, command.expectedExitCode, `Correction receipt ${index} expected exit differs.`);
    assert.equal(receipt.exitCode, command.expectedExitCode, `Correction receipt ${index} exit differs.`);
    assert.equal(receipt.passed, true, `Correction receipt ${index} did not pass.`);
  });

  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, "Correction technical artifact inventory is missing.");
  const artifactBindings = new Map<string, FileBinding>();
  for (const [index, value] of (manifest.artifacts as unknown[]).entries()) {
    const shape = validateCorrectionBindingShape(value, `correction technical artifact ${index}`);
    assert.ok(!artifactBindings.has(shape.path), `Duplicate correction technical artifact ${shape.path}.`);
    const binding = shape.path === CORRECTION_FINALIZER_PATH
      ? validateBaseCorrectionBinding(value, CORRECTION_BASE, `archived correction finalizer artifact ${index}`)
      : validateCurrentCorrectionBinding(value, `correction technical artifact ${index}`);
    artifactBindings.set(binding.path, binding);
  }
  const bindings = strictCorrectionObject(manifest.bindings, ["sources", "fixtures", "schemas", "harness", "plans"], "correction technical bindings");
  for (const kind of ["sources", "fixtures", "schemas", "harness", "plans"] as const) {
    assert.ok(Array.isArray(bindings[kind]), `Correction technical ${kind} bindings must be an array.`);
    for (const [index, value] of (bindings[kind] as unknown[]).entries()) {
      const shape = validateCorrectionBindingShape(value, `correction ${kind} binding ${index}`);
      assert.deepEqual(shape, artifactBindings.get(shape.path), `Correction ${kind} binding ${shape.path} is absent from or differs from artifacts.`);
    }
  }
  const technicalPathBindings = CORRECTION_TECHNICAL_PATHS.map((path) => {
    const binding = artifactBindings.get(path);
    assert.ok(binding !== undefined, `Accepted technical path is absent from manifest artifacts: ${path}`);
    assert.deepEqual(binding, fileBinding(path), `Accepted technical path hash changed: ${path}`);
    return binding;
  });

  const evidence = strictCorrectionObject(manifest.evidence, [
    "evidenceVersion", "browserStatus", "runnerResult", "derivedGitState", "baseCommit", "headCommit", "observedDirtyPaths",
    "dirtyExpectedPaths", "cleanExpectedPaths", "selectedExpectedPaths", "authorization", "bindings",
  ], "correction technical evidence");
  assert.equal(evidence.evidenceVersion, 2);
  assert.equal(evidence.browserStatus, "captured");
  assert.equal(evidence.derivedGitState, "dirty-executor");
  assert.equal(evidence.baseCommit, CORRECTION_BASE);
  assert.equal(evidence.headCommit, CORRECTION_BASE);
  for (const key of ["observedDirtyPaths", "dirtyExpectedPaths", "selectedExpectedPaths"] as const) {
    assert.deepEqual(evidence[key], CORRECTION_TECHNICAL_PATHS, `Correction manifest ${key} differs from the accepted 20-path state.`);
  }
  assert.deepEqual(evidence.cleanExpectedPaths, []);
  const runnerBinding = validateCurrentCorrectionBinding(evidence.runnerResult, "correction runner-result binding");
  assert.deepEqual(runnerBinding, artifactBindings.get(runnerBinding.path), "Correction runner result differs from technical artifacts.");
  const runner = validateCorrectionRunnerResult(parseCorrectionJson(runnerBinding.path));
  const lint = manifest.lintRegression as JsonObject;
  assert.equal(lint.passed, true, "Correction measured lint receipt did not pass.");
  assert.deepEqual(lint.changedLineFindings, [], "Correction measured lint has changed-line findings.");
  assert.deepEqual(lint.newFileFindings, [], "Correction measured lint has new-file findings.");
  const lintNetwork = lint.network as JsonObject;
  assert.equal(lintNetwork.nonLoopbackAttemptCount, 0, "Correction measured lint recorded a non-loopback attempt.");
  const lintCleanup = lint.cleanup as JsonObject;
  assert.equal(lintCleanup.temporaryRootRemoved, true, "Correction measured lint temporary root was not removed.");
  return {manifest, proofBinding, technicalPathBindings, runnerBinding, runner};
};

const buildCorrectionProtectedRuntimeAudit = (base: string, changedPaths: readonly string[]) => {
  assert.equal(base, CORRECTION_BASE);
  const baseRuntimePaths = git("ls-tree", "-r", "--name-only", base, "app/page.tsx", "src/components/open-project", "src/components/workspace", "src/lib")
    .split("\n")
    .filter((path) => /^(?:app\/page\.tsx|src\/components\/open-project\/OpenProjectBrowser\.tsx|src\/components\/workspace\/Drawing[^/]*\.tsx|src\/lib\/drawingProject[^/]*\.ts)$/.test(path));
  assert.deepEqual(sortProofPaths(baseRuntimePaths), CORRECTION_PROTECTED_RUNTIME_PATHS, "Protected runtime discovery differs from the exact SPEC-0002/Drawing/Open/storage set.");
  const changedRuntimePaths = sortProofPaths(changedPaths.filter((path) => path === "app/page.tsx" || path.startsWith("src/")));
  assert.deepEqual(changedRuntimePaths, CORRECTION_RUNTIME_PATHS, "Correction contains an unexpected runtime or shared-dependency change.");
  const changedProtectedPaths = changedPaths.filter((path) => CORRECTION_PROTECTED_RUNTIME_PATHS.includes(path));
  assert.deepEqual(changedProtectedPaths, [], "Correction changed a protected Drawing/SPEC-0002/Open/storage/app runtime path.");
  const binaryDiff = spawnSync("git", ["diff", "--binary", "--exit-code", base, "--", ...CORRECTION_PROTECTED_RUNTIME_PATHS], {cwd: ROOT, encoding: "buffer", shell: false, maxBuffer: 256 * 1024 * 1024});
  assert.equal(binaryDiff.status, 0, Buffer.from(binaryDiff.stderr ?? "").toString("utf8") || "Protected runtime binary diff is nonzero.");
  assert.equal(Buffer.from(binaryDiff.stdout ?? "").byteLength, 0, "Protected runtime binary diff emitted output.");
  const bindings = CORRECTION_PROTECTED_RUNTIME_PATHS.map((path) => {
    const baseBinding = baseFileBinding(base, path);
    const currentBinding = fileBinding(path);
    assert.deepEqual(currentBinding, baseBinding, `Protected runtime bytes changed: ${path}`);
    return {
      path,
      baseSha256: baseBinding.sha256,
      currentSha256: currentBinding.sha256,
      byteLength: currentBinding.byteLength,
      identical: true,
    };
  });
  return {
    auditVersion: 1,
    baseCommit: base,
    protectedPaths: bindings,
    changedProtectedPaths: [],
    changedRuntimePaths,
    relevantSharedDependencyChangedPaths: [],
    binaryDiffEmpty: true,
  };
};

type NotApplicablePrerequisites = {
  frozenRunnerSha256: string;
  currentRunnerSha256: string;
  otherFrozenMismatches: readonly string[];
  changedProtectedPaths: readonly string[];
  relevantSharedDependencyChangedPaths: readonly string[];
  protectedGroups: readonly string[];
  humanSaveEvidencePresent: boolean;
  publishedSpec0002RecordPresent: boolean;
  runnerPassed: boolean;
  browserNonLoopbackAttempts: number;
  serverNonLoopbackAttempts: number;
  childNonLoopbackAttempts: number;
};

const assertCorrectionNotApplicablePrerequisites = (input: NotApplicablePrerequisites) => {
  assert.equal(input.frozenRunnerSha256, SPEC0002_FROZEN_BINDINGS[0].sha256, "Frozen SPEC-0002 runner hash is invalid.");
  assert.equal(input.currentRunnerSha256, CURRENT_SPEC0001_RUNNER_SHA256, "Current SPEC-0001 runner hash is invalid.");
  assert.notEqual(input.currentRunnerSha256, input.frozenRunnerSha256, "SPEC-0002 command may be not-applicable only when its runner hash is obsolete.");
  assert.deepEqual(input.otherFrozenMismatches, [], "SPEC-0002 command has a frozen mismatch other than the obsolete runner hash.");
  assert.deepEqual(input.changedProtectedPaths, [], "SPEC-0002 not-applicable disposition requires zero protected-runtime diff.");
  assert.deepEqual(input.relevantSharedDependencyChangedPaths, [], "SPEC-0002 not-applicable disposition requires zero relevant shared-dependency diff.");
  assert.deepEqual(input.protectedGroups, CORRECTION_PROTECTED_GROUPS, "SPEC-0002 replacement protected groups are incomplete or reordered.");
  assert.equal(input.humanSaveEvidencePresent, true, "Arthur's current Drawing Save verification record is missing.");
  assert.equal(input.publishedSpec0002RecordPresent, true, "Published SPEC-0002 proof record is missing.");
  assert.equal(input.runnerPassed, true, "Current correction browser runner did not pass.");
  assert.equal(input.browserNonLoopbackAttempts, 0, "Correction browser made a non-loopback request.");
  assert.equal(input.serverNonLoopbackAttempts, 0, "Correction server made a non-loopback request.");
  assert.equal(input.childNonLoopbackAttempts, 0, "Correction child process made a non-loopback request.");
};

const buildCorrectionProtectedProofDisposition = (
  protectedAudit: ReturnType<typeof buildCorrectionProtectedRuntimeAudit>,
  technical: ReturnType<typeof validateCorrectionTechnicalManifest>,
) => {
  const contractPath = "scripts/spec0002-browser/browserProofContract.ts";
  const contractSource = readFileSync(resolve(ROOT, contractPath), "utf8");
  const observedFrozenBindings = SPEC0002_FROZEN_BINDINGS.map((binding) => {
    assert.ok(contractSource.includes(`path: "${binding.path}", sha256: "${binding.sha256}"`), `SPEC-0002 frozen ${binding.name} binding changed.`);
    const current = fileBinding(binding.path);
    return {...binding, currentSha256: current.sha256.slice("sha256:".length), currentByteLength: current.byteLength, matches: current.sha256 === `sha256:${binding.sha256}`};
  });
  const runner = observedFrozenBindings[0];
  assert.equal(runner.name, "runner");
  const otherFrozenMismatches = observedFrozenBindings.slice(1).filter((binding) => !binding.matches).map((binding) => binding.name);
  const sessionHandoffPath = "docs/SESSION_HANDOFF.md";
  const currentStatePath = "docs/CURRENT_STATE.md";
  const spec0002Path = "docs/specs/0002-lossless-local-drawing-save-and-reopen.md";
  const handoff = readFileSync(resolve(ROOT, sessionHandoffPath), "utf8");
  const currentState = readFileSync(resolve(ROOT, currentStatePath), "utf8");
  const spec0002 = readFileSync(resolve(ROOT, spec0002Path), "utf8");
  const humanPhrase = "Arthur's current human Drawing Save verification";
  const publishedSpec0002Phase2Sha = "0a5ea38f8146641430d37ddc272fa0b1169181252b596e0ba14886c2bb4f2657";
  const publishedSpec0002Commit = "af89b26c89d83eb61f77d91b4a50c105b7c12079";
  const humanSaveEvidencePresent = handoff.includes(humanPhrase) && currentState.includes(humanPhrase);
  const publishedSpec0002RecordPresent = spec0002.includes(publishedSpec0002Phase2Sha) && spec0002.includes(publishedSpec0002Commit);
  const network = technical.runner.network as JsonObject;
  const prerequisites: NotApplicablePrerequisites = {
    frozenRunnerSha256: runner.sha256,
    currentRunnerSha256: runner.currentSha256,
    otherFrozenMismatches,
    changedProtectedPaths: protectedAudit.changedProtectedPaths,
    relevantSharedDependencyChangedPaths: protectedAudit.relevantSharedDependencyChangedPaths,
    protectedGroups: (technical.runner.execution as JsonObject).protectedRegressionGroups as string[],
    humanSaveEvidencePresent,
    publishedSpec0002RecordPresent,
    runnerPassed: technical.runner.status === "passed",
    browserNonLoopbackAttempts: network.browserNonLoopbackAttempts as number,
    serverNonLoopbackAttempts: network.serverNonLoopbackAttempts as number,
    childNonLoopbackAttempts: network.childNonLoopbackAttempts as number,
  };
  assertCorrectionNotApplicablePrerequisites(prerequisites);
  return {
    dispositionVersion: 1,
    command: "SPEC-0002 historical browser command",
    disposition: "not-applicable",
    passed: false,
    reason: "obsolete-spec0001-runner-hash-only",
    frozenContract: fileBinding(contractPath),
    frozenBindings: observedFrozenBindings,
    protectedRuntimeBinaryDiffEmpty: true,
    relevantSharedDependencyDiffEmpty: true,
    publishedSpec0002ProofRecord: fileBinding(spec0002Path),
    publishedSpec0002Phase2ManifestSha256: publishedSpec0002Phase2Sha,
    publishedSpec0002Commit,
    humanDrawingSaveEvidence: [
      {record: fileBinding(sessionHandoffPath), exactPhrase: humanPhrase},
      {record: fileBinding(currentStatePath), exactPhrase: humanPhrase},
    ],
    protectedBrowserEvidence: {
      runnerResult: technical.runnerBinding,
      actionCount: 15,
      screenshotCount: 2,
      protectedRegressionGroups: CORRECTION_PROTECTED_GROUPS,
      nonLoopbackAttemptCounts: {browser: 0, server: 0, child: 0},
    },
    diagnosticAlternativeHarnesses: "excluded-not-pass-not-product-failure",
  };
};

const validateCorrectionCloseoutManifest = (closeoutPath: string) => {
  assert.equal(closeoutPath, CORRECTION_OUTPUT_PATH, "Correction closeout path is invalid.");
  assertNoProofRelevantGitEnvironment(process.env);
  assertNoHiddenIndexFlags();
  assertEmptyProofIndex();
  const closeout = strictCorrectionObject(parseCorrectionJson(closeoutPath), [
    "closeoutVersion", "kind", "purpose", "specId", "phase", "baseCommit", "headCommit", "finalizedAt", "technicalManifest",
    "acceptedTechnicalManifestSha256", "technicalPathBindings", "finalizerSource", "changedPaths", "trackedStateDigest",
    "trackedStateInventory", "indexEmpty", "protectedRuntimeAudit", "protectedProofDisposition", "correctionEvidenceInventory",
  ], "correction closeout manifest");
  assert.equal(closeout.closeoutVersion, 1);
  assert.equal(closeout.kind, "spec0001-phase-2-ui-restoration-correction-closeout");
  assert.equal(closeout.purpose, CORRECTION_PURPOSE);
  assert.equal(closeout.specId, "SPEC-0001");
  assert.equal(closeout.phase, 2);
  assert.equal(closeout.baseCommit, CORRECTION_BASE);
  const head = git("rev-parse", "HEAD").trim();
  assert.equal(closeout.headCommit, head, "Correction closeout HEAD changed.");
  assert.ok(typeof closeout.finalizedAt === "string" && !Number.isNaN(Date.parse(closeout.finalizedAt)), "Correction closeout timestamp is invalid.");
  assert.equal(closeout.acceptedTechnicalManifestSha256, CORRECTION_ACCEPTED_PROOF_SHA256);
  const technical = validateCorrectionTechnicalManifest(CORRECTION_PROOF_PATH);
  assert.deepEqual(validateCurrentCorrectionBinding(closeout.technicalManifest, "correction closeout technical manifest"), technical.proofBinding);
  assert.deepEqual(closeout.technicalPathBindings, technical.technicalPathBindings, "Correction closeout technical path bindings changed.");
  assert.deepEqual(validateCurrentCorrectionBinding(closeout.finalizerSource, "correction closeout finalizer source"), fileBinding(CORRECTION_FINALIZER_PATH));
  const changedPaths = currentChangedPaths(CORRECTION_BASE);
  const stagedPaths = nulList(git("diff", "--cached", "--name-only", "-z"));
  assertCorrectionRepositoryGate({base: closeout.baseCommit as string, head, changedPaths, stagedPaths});
  assert.deepEqual(closeout.changedPaths, changedPaths, "Correction closeout changed-path inventory changed.");
  const state = buildTrackedStateInventory(CORRECTION_BASE);
  assert.equal(closeout.trackedStateDigest, state.digest, "Correction tracked-state digest changed.");
  assert.deepEqual(closeout.trackedStateInventory, state.entries, "Correction tracked-state inventory changed.");
  assert.equal(closeout.indexEmpty, true);
  const protectedAudit = buildCorrectionProtectedRuntimeAudit(CORRECTION_BASE, changedPaths);
  assert.deepEqual(closeout.protectedRuntimeAudit, protectedAudit, "Correction protected-runtime audit changed.");
  const disposition = buildCorrectionProtectedProofDisposition(protectedAudit, technical);
  assert.deepEqual(closeout.protectedProofDisposition, disposition, "Correction protected-proof disposition changed.");
  assert.deepEqual(closeout.correctionEvidenceInventory, currentCorrectionEvidenceInventory(closeoutPath), "Correction evidence inventory changed.");
  return closeout;
};

const runCorrectionFinalizer = () => {
  assertNoProofRelevantGitEnvironment(process.env);
  const args = parseCorrectionArgs();
  rejectSymlinkComponents(args.proof);
  rejectSymlinkComponents(dirname(args.output));
  if (existsSync(resolve(ROOT, args.output)) && lstatSync(resolve(ROOT, args.output)).isSymbolicLink()) throw new Error("Correction closeout output may not be a symlink.");
  const head = git("rev-parse", "HEAD").trim();
  assertEmptyProofIndex();
  assertNoHiddenIndexFlags();
  const changedPaths = currentChangedPaths(args.base);
  const stagedPaths = nulList(git("diff", "--cached", "--name-only", "-z"));
  assertCorrectionRepositoryGate({base: args.base, head, changedPaths, stagedPaths});
  const stateBefore = buildTrackedStateInventory(args.base);
  const technical = validateCorrectionTechnicalManifest(args.proof);
  const protectedAudit = buildCorrectionProtectedRuntimeAudit(args.base, changedPaths);
  const disposition = buildCorrectionProtectedProofDisposition(protectedAudit, technical);
  const evidenceInventory = currentCorrectionEvidenceInventory(args.output);
  assert.equal(git("rev-parse", "HEAD").trim(), head, "Correction HEAD changed during finalization.");
  assertEmptyProofIndex();
  assertNoHiddenIndexFlags();
  assert.deepEqual(currentChangedPaths(args.base), changedPaths, "Correction changed paths changed during finalization.");
  const stateAfterValidation = buildTrackedStateInventory(args.base);
  assert.equal(stateAfterValidation.digest, stateBefore.digest, "Correction tracked state changed during validation.");
  assert.deepEqual(stateAfterValidation.entries, stateBefore.entries, "Correction tracked-state inventory changed during validation.");
  if (existsSync(resolve(ROOT, args.output))) {
    validateCorrectionCloseoutManifest(args.output);
    console.log(`Validated existing ${CORRECTION_PURPOSE} closeout at ${args.output}.`);
    return;
  }
  const closeout = {
    closeoutVersion: 1,
    kind: "spec0001-phase-2-ui-restoration-correction-closeout",
    purpose: args.purpose,
    specId: "SPEC-0001",
    phase: args.phase,
    baseCommit: args.base,
    headCommit: head,
    finalizedAt: new Date().toISOString(),
    technicalManifest: technical.proofBinding,
    acceptedTechnicalManifestSha256: CORRECTION_ACCEPTED_PROOF_SHA256,
    technicalPathBindings: technical.technicalPathBindings,
    finalizerSource: fileBinding(CORRECTION_FINALIZER_PATH),
    changedPaths,
    trackedStateDigest: stateBefore.digest,
    trackedStateInventory: stateBefore.entries,
    indexEmpty: true,
    protectedRuntimeAudit: protectedAudit,
    protectedProofDisposition: disposition,
    correctionEvidenceInventory: evidenceInventory,
  };
  writeFileSync(resolve(ROOT, args.output), `${JSON.stringify(closeout, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  validateCorrectionCloseoutManifest(args.output);
  console.log(`Finalized and independently validated ${CORRECTION_PURPOSE} closeout at ${args.output}.`);
  console.log(`Tracked/non-ignored state digest: ${stateBefore.digest}; index empty; ${changedPaths.length} exact changed paths.`);
};

export const runCorrectionFinalizerSelfTest = () => {
  assertNoProofRelevantGitEnvironment(process.env);
  const head = git("rev-parse", "HEAD").trim();
  const changedPaths = currentChangedPaths(CORRECTION_BASE);
  assertCorrectionRepositoryGate({base: CORRECTION_BASE, head, changedPaths, stagedPaths: []});
  const technical = validateCorrectionTechnicalManifest(CORRECTION_PROOF_PATH);
  const protectedAudit = buildCorrectionProtectedRuntimeAudit(CORRECTION_BASE, changedPaths);
  buildCorrectionProtectedProofDisposition(protectedAudit, technical);
  currentCorrectionEvidenceInventory();
  const acceptedRunner = parseCorrectionJson(technical.runnerBinding.path) as JsonObject;
  assert.throws(() => validateCorrectionRunnerResult({...acceptedRunner, status: "failed"}), "Failed raw runner evidence must reject.");
  assert.throws(() => validateCorrectionRunnerResult({...acceptedRunner, unexpected: true}), "Extra raw runner evidence field must reject.");
  assert.throws(() => assertCorrectionChangedPaths(CORRECTION_CHANGED_PATHS.slice(1)), "Missing correction path must reject.");
  assert.throws(() => assertCorrectionChangedPaths(sortProofPaths([...CORRECTION_CHANGED_PATHS, "unauthorized/extra.txt"])), "Extra correction path must reject.");
  assert.throws(() => assertCorrectionRepositoryGate({base: CORRECTION_BASE, head, changedPaths, stagedPaths: [CORRECTION_FINALIZER_PATH]}), "Staged correction path must reject.");
  assert.throws(() => assertCorrectionRepositoryGate({base: CORRECTION_BASE, head: "0".repeat(40), changedPaths, stagedPaths: []}), "Wrong correction HEAD must reject.");
  const validPrerequisites: NotApplicablePrerequisites = {
    frozenRunnerSha256: SPEC0002_FROZEN_BINDINGS[0].sha256,
    currentRunnerSha256: CURRENT_SPEC0001_RUNNER_SHA256,
    otherFrozenMismatches: [],
    changedProtectedPaths: [],
    relevantSharedDependencyChangedPaths: [],
    protectedGroups: CORRECTION_PROTECTED_GROUPS,
    humanSaveEvidencePresent: true,
    publishedSpec0002RecordPresent: true,
    runnerPassed: true,
    browserNonLoopbackAttempts: 0,
    serverNonLoopbackAttempts: 0,
    childNonLoopbackAttempts: 0,
  };
  assertCorrectionNotApplicablePrerequisites(validPrerequisites);
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, currentRunnerSha256: SPEC0002_FROZEN_BINDINGS[0].sha256}), "Matching SPEC-0002 runner hash must reject not-applicable.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, otherFrozenMismatches: ["contract"]}), "Second frozen mismatch must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, changedProtectedPaths: ["app/page.tsx"]}), "Protected diff must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, relevantSharedDependencyChangedPaths: ["src/shared.ts"]}), "Shared-dependency diff must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, protectedGroups: CORRECTION_PROTECTED_GROUPS.slice(1)}), "Missing protected group must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, humanSaveEvidencePresent: false}), "Missing human Save evidence must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, publishedSpec0002RecordPresent: false}), "Missing published SPEC-0002 proof must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, runnerPassed: false}), "Failed correction runner must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, browserNonLoopbackAttempts: 1}), "Browser egress must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, serverNonLoopbackAttempts: 1}), "Server egress must reject.");
  assert.throws(() => assertCorrectionNotApplicablePrerequisites({...validPrerequisites, childNonLoopbackAttempts: 1}), "Child egress must reject.");
  console.log("SPEC-0001 Phase 2 UI-restoration correction finalizer self-test passed (positive live validation plus 17 fail-closed negative cases)." );
};

export const runFinalizerSelfTest = () => {
  assertNoProofRelevantGitEnvironment(process.env);
  assert.throws(() => assertNoProofRelevantGitEnvironment({...process.env, GIT_WORK_TREE: "/tmp/forbidden-worktree"}));
  assertPhaseCloseoutPaths(2, PHASE2_CLOSEOUT_PATHS);
  assert.throws(() => assertPhaseCloseoutPaths(2, PHASE2_CLOSEOUT_PATHS.slice(0, -1)));
  assert.throws(() => assertPhaseCloseoutPaths(2, sortProofPaths([...PHASE2_CLOSEOUT_PATHS, "unauthorized/extra.txt"])));
  assertPhaseCloseoutPaths(4, PHASE4_CLOSEOUT_PATHS);
  assert.throws(() => assertPhaseCloseoutPaths(4, PHASE4_CLOSEOUT_PATHS.slice(0, -1)));
  assert.throws(() => assertPhaseCloseoutPaths(4, sortProofPaths([...PHASE4_CLOSEOUT_PATHS, "unauthorized/extra.txt"])));
  const noLive = buildLiveTuple(1, undefined, undefined);
  validateLiveTuple(1, noLive);
  assert.throws(() => buildLiveTuple(1, "none", "none"));
  assert.throws(() => buildLiveTuple(7, undefined, undefined));
  assert.throws(() => buildLiveTuple(7, "none", undefined));
  assert.throws(() => buildLiveTuple(7, undefined, "none"));
  assert.throws(() => buildLiveTuple(7, "outside/live-proof-manifest.json", "a".repeat(64)));
  assert.throws(() => buildLiveTuple(7, "none", "invalid"));
  assert.throws(() => buildLiveTuple(7, "none", "a".repeat(64)));
  assert.throws(() => repositoryPath("../../escape", "test"));
  console.log("SPEC-0001 proof finalizer self-test passed (closeout ceiling/Git environment/live arguments/tuple/roots/path escapes rejected)." );
};

const main = () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-test") return runFinalizerSelfTest();
  if (process.argv.length === 3 && process.argv[2] === "--self-test-correction") return runCorrectionFinalizerSelfTest();
  if (process.argv.slice(2).some((argument) => argument.startsWith("--purpose="))) return runCorrectionFinalizer();
  assertNoProofRelevantGitEnvironment(process.env);
  const args = parseArgs();
  if (!Number.isSafeInteger(args.phase) || args.phase < 1 || args.phase > 7) throw new Error("Phase must be 1..7.");
  if (!/^[0-9a-f]{40}$/.test(args.base)) throw new Error("Base must be a full lowercase Git SHA.");
  const ordinaryProof = `output/spec-0001/phase-${args.phase}/proof-manifest.json`;
  const ordinaryOutput = `output/spec-0001/phase-${args.phase}/proof-closeout-manifest.json`;
  const siblingMatch = args.phase === 7
    ? /^output\/spec-0001\/phase-7-live\/([0-9a-f]{64})\/offline-proof-manifest\.json$/.exec(args.proof)
    : null;
  const siblingOutput = siblingMatch
    ? `output/spec-0001/phase-7-live/${siblingMatch[1]}/proof-closeout-manifest.json`
    : null;
  const ordinaryRoot = args.proof === ordinaryProof && args.output === ordinaryOutput;
  const siblingRoot = siblingOutput !== null && args.output === siblingOutput;
  if (!ordinaryRoot && !siblingRoot) throw new Error("Proof/closeout paths must use an exact ordinary or Phase 7 live-only root.");
  if (siblingMatch && args.decision !== siblingMatch[1]) throw new Error("Live-only proof root decision does not match the required decision argument.");
  rejectSymlinkComponents(args.proof);
  rejectSymlinkComponents(dirname(args.output));
  if (existsSync(resolve(ROOT, args.output)) && lstatSync(resolve(ROOT, args.output)).isSymbolicLink()) throw new Error("Closeout output may not be a symlink.");
  const liveTuple = buildLiveTuple(args.phase, args.liveProof, args.decision, args.proof);
  validateLiveTuple(args.phase, liveTuple);
  const head = git("rev-parse", "HEAD").trim();
  if (head !== args.base) throw new Error("Finalization must occur before Git publication on the exact phase base.");
  assertEmptyProofIndex();
  assertNoHiddenIndexFlags();
  const allowlistedPaths = currentChangedPaths(args.base);
  assertPhaseCloseoutPaths(args.phase, allowlistedPaths);
  if (args.phase === 1) {
    const outside = allowlistedPaths.filter((path) => !phaseOneAllowed.has(path));
    if (outside.length > 0) throw new Error(`Phase 1 final diff contains unauthorized paths: ${outside.join(", ")}`);
  }
  const stateBeforeValidation = buildTrackedStateInventory(args.base);
  const proof = validateProofManifestForCloseout(args.proof, liveTuple.liveProofInput === "none" ? [] : [liveTuple.liveProofInput]);
  if (proof.phase !== args.phase || proof.baseCommit !== args.base) throw new Error("Proof phase/base mismatch.");
  assert.equal(git("rev-parse", "HEAD").trim(), head, "Repository HEAD changed during finalization.");
  assertEmptyProofIndex();
  assertNoHiddenIndexFlags();
  const pathsAfterValidation = currentChangedPaths(args.base);
  assert.deepEqual(pathsAfterValidation, allowlistedPaths, "Final diff changed during proof validation.");
  assertPhaseCloseoutPaths(args.phase, pathsAfterValidation);
  const state = buildTrackedStateInventory(args.base);
  assert.equal(state.digest, stateBeforeValidation.digest, "Tracked/non-ignored repository bytes changed during proof validation.");
  assert.deepEqual(state.entries, stateBeforeValidation.entries, "Tracked/non-ignored repository inventory changed during proof validation.");
  const closeout = {
    closeoutVersion: 1,
    specId: "SPEC-0001",
    phase: args.phase,
    baseCommit: args.base,
    headCommit: head,
    finalizedAt: new Date().toISOString(),
    proofManifest: fileBinding(args.proof),
    trackedStateDigest: state.digest,
    trackedStateInventory: state.entries,
    indexEmpty: true,
    allowlistedPaths,
    artifactInventory: proofArtifactInventory(args.proof, args.output),
    ...liveTuple,
  };
  writeFileSync(resolve(ROOT, args.output), `${JSON.stringify(closeout, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  validateCloseoutManifest(args.output);
  console.log(`Finalized read-only tracked-state closeout at ${args.output}.`);
  console.log(`Tracked/non-ignored state digest: ${state.digest}; index empty; ${allowlistedPaths.length} allowlisted changed paths.`);
};

main();
