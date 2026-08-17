import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUTHORIZED_EXACT_PATHS,
  AUTHORIZED_PREFIX,
  CLEAN_PRE_EDIT_GATE,
  FLOW_STEP_IDS,
  FROZEN_ACTIONS,
  FROZEN_BINDINGS,
  FROZEN_DRAWING_PROMPT,
  FROZEN_PHASE15_PATHS,
  MANIFEST_KEYS,
  NEGATIVE_VALIDATOR_CLASSES,
  PHASE1_PATHS,
  PHASE1_PREFIX,
  PHASE1_PUBLICATION,
  PHASE2_BROWSER_ASSERTIONS,
  PREDECESSOR_MANIFESTS,
  REALISTIC_AUTHORING_BITMAP,
  RECEIPT_DEFINITIONS,
  REGRESSION_IDS,
  SANITIZED_ENV,
  SPEC0002_BASE,
  SPEC0002_ID,
  SPEC0002_MODES,
  SPEC0002_OUTPUT_ROOT,
  SPEC0002_PHASE,
  VIEWPORTS,
  bindLocalFile,
  sha256,
  stableJson,
  strictObject,
} from "./browserProofContract.ts";

type Json = Record<string, unknown>;
type Binding = { path: string; sha256: string; byteLength: number };
type EvidenceGraph = {
  manifest: Json;
  config: Json;
  receipts: Json[];
  phase2: Json;
  regression: Json;
};

const ROOT = process.cwd();
const MANIFEST_PATH = `${SPEC0002_OUTPUT_ROOT}/proof-manifest.json`;
const CONFIG_PATH = "scripts/fixtures/spec0002-browser/v1/phase-2-proof-commands.json";
const PHASE15_PUBLICATION = "8df64552e29e4170df8000097fe857b7a31dff69";
const HEX = /^[0-9a-f]{64}$/;

const object = (value: unknown, keys: readonly string[], label: string) => strictObject(value, keys, label);
const list = (value: unknown, label: string): unknown[] => {
  assert.ok(Array.isArray(value), `${label} must be an array.`);
  return value;
};
const exact = (actual: unknown, expected: unknown, label: string) => assert.deepEqual(actual, expected, `${label} mismatch.`);
const bindingShape = (value: unknown, label: string): Binding => {
  const binding = object(value, ["path", "sha256", "byteLength"], label);
  assert.equal(typeof binding.path, "string", `${label}.path must be a string.`);
  assert.match(binding.sha256 as string, HEX, `${label}.sha256 must be raw lowercase SHA-256.`);
  assert.ok(Number.isSafeInteger(binding.byteLength) && Number(binding.byteLength) >= 0, `${label}.byteLength must be non-negative.`);
  return binding as Binding;
};
const verifyBinding = (value: unknown, label: string) => {
  const binding = bindingShape(value, label);
  exact(bindLocalFile(ROOT, binding.path), binding, `${label} bytes`);
  return binding;
};
const readJson = (path: string): Json => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as Json;
const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed.`);
  return result.stdout.trim();
};
const gitBytes = (commit: string, path: string) => {
  const result = spawnSync("git", ["show", `${commit}:${path}`], { cwd: ROOT, encoding: null, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString() || `Missing ${commit}:${path}.`);
  return result.stdout;
};
const dirtyPaths = () => {
  const modified = git("diff", "--name-only", "HEAD").split("\n").filter(Boolean);
  const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  return [...new Set([...modified, ...untracked])].sort();
};
const authorized = (path: string) => AUTHORIZED_EXACT_PATHS.includes(path as (typeof AUTHORIZED_EXACT_PATHS)[number]) || path.startsWith(AUTHORIZED_PREFIX);
const expectedPhase1Paths = () => {
  const fixtures = git("ls-tree", "-r", "--name-only", PHASE1_PUBLICATION, PHASE1_PREFIX).split("\n").filter(Boolean);
  return [...PHASE1_PATHS, ...fixtures].sort();
};

const validateCommandConfig = (config: Json) => {
  object(config, ["configVersion", "specId", "phase", "baseCommit", "bindings", "commands"], "Command config");
  exact([config.configVersion, config.specId, config.phase, config.baseCommit], [1, SPEC0002_ID, 2, SPEC0002_BASE], "Command config identity");
  const groups = object(config.bindings, ["phase2", "fixtures", "frozen"], "Command binding groups");
  const expectedGroups = {
    phase2: [
      "scripts/spec0002-browser/browserProofContract.ts",
      "scripts/spec0002-browser/validatePhase2.ts",
      "scripts/runSpec0002BrowserProof.ts",
      "scripts/recordSpec0002Phase2Proof.ts",
    ],
    fixtures: [
      "scripts/fixtures/spec0002-browser/v1/legacy-full-project.json",
      "scripts/fixtures/spec0002-browser/v1/phase-2-browser-plan.json",
      "scripts/fixtures/spec0002-browser/v1/phase-2-proof-manifest.schema.json",
      "scripts/fixtures/spec0002-browser/v1/phase-2-validator-negative-cases.json",
    ],
    frozen: Object.values(FROZEN_BINDINGS).map((entry) => entry.path),
  };
  exact(groups, expectedGroups, "Command binding groups");
  const boundPaths = Object.values(groups).flatMap((value) => list(value, "Binding group").map(String));
  assert.equal(new Set(boundPaths).size, boundPaths.length, "Command binding paths must be unique.");
  assert.ok(boundPaths.every((path) => existsSync(resolve(ROOT, path))), "Every command binding must exist.");
  const commands = list(config.commands, "Commands");
  assert.equal(commands.length, RECEIPT_DEFINITIONS.length, "Exactly 12 commands are required.");
  commands.forEach((value, index) => {
    const command = object(value, ["name", "argv", "cwd", "env", "privacy", "expectedExitCode"], `Command ${index}`);
    const [name, argv, expectedExitCode] = RECEIPT_DEFINITIONS[index];
    exact(command, { name, argv, cwd: ".", env: SANITIZED_ENV, privacy: "sanitized", expectedExitCode }, `Command ${index}`);
  });
};

const validateStream = (value: unknown, label: string, verifyBytes: boolean) => {
  const stream = object(value, ["encoding", "byteLength", "sha256", "data"], label);
  assert.equal(stream.encoding, "base64");
  assert.match(stream.sha256 as string, HEX);
  const bytes = Buffer.from(stream.data as string, "base64");
  assert.equal(bytes.byteLength, stream.byteLength);
  if (verifyBytes) assert.equal(sha256(bytes), stream.sha256);
};

const validateReceipt = (value: Json, index: number, verifyBytes: boolean) => {
  const receipt = object(value, [
    "receiptVersion", "order", "name", "argv", "cwd", "env", "privacy", "startedAt", "durationMs", "exitCode",
    "expectedExitCode", "passed", "stdout", "stderr", "lintBaseline",
  ], `Receipt ${index}`);
  const [name, argv, expectedExitCode] = RECEIPT_DEFINITIONS[index];
  exact(
    [receipt.receiptVersion, receipt.order, receipt.name, receipt.argv, receipt.cwd, receipt.env, receipt.privacy, receipt.exitCode, receipt.expectedExitCode, receipt.passed],
    [1, index, name, argv, ".", SANITIZED_ENV, "sanitized", expectedExitCode, expectedExitCode, true],
    `Receipt ${index} contract`,
  );
  assert.match(receipt.startedAt as string, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(Number.isSafeInteger(receipt.durationMs) && Number(receipt.durationMs) >= 0);
  validateStream(receipt.stdout, `Receipt ${index} stdout`, verifyBytes);
  validateStream(receipt.stderr, `Receipt ${index} stderr`, verifyBytes);
  if (index === 8) exact(receipt.lintBaseline, { acceptedErrors: 6, acceptedWarnings: 73 }, "Lint receipt baseline");
  else assert.equal(receipt.lintBaseline, null);
};

const validateScenario = (value: unknown, viewport: string) => {
  const scenario = object(value, ["viewport", "idb", "fidelity", "race", "open", "legacy", "failures"], `Scenario ${viewport}`);
  assert.equal(scenario.viewport, viewport);
  const idb = object(scenario.idb, ["headsAfterSave", "versionsAfterSave", "rasterAssets", "audioAssets", "stagedReadBackVerified", "activeHeadCompleted", "deleteAbortPreservedHead", "tombstonesAfterDeletes", "authoritativeDeletesCompleted", "catalogTargetsHidden"], "IDB evidence");
  exact([idb.headsAfterSave, idb.versionsAfterSave, idb.rasterAssets, idb.audioAssets], [1, 1, 5, 1], "IDB counts");
  assert.ok(idb.stagedReadBackVerified && idb.activeHeadCompleted && idb.deleteAbortPreservedHead && idb.authoritativeDeletesCompleted && idb.catalogTargetsHidden);
  assert.ok(Number.isSafeInteger(idb.tombstonesAfterDeletes) && Number(idb.tombstonesAfterDeletes) >= 0);
  const fidelity = object(scenario.fidelity, ["layers", "framesPerLayer", "activeTool", "timelineFps", "text", "motionStartX", "motionEndX", "soundFields", "assetBytesAndDigestsVerified", "reopenVerified"], "Fidelity evidence");
  exact([fidelity.layers, fidelity.framesPerLayer, fidelity.activeTool, fidelity.timelineFps, fidelity.text], [2, [4, 4], "Eraser", 18, "Phase 2 exact text"], "Fidelity fields");
  exact([fidelity.motionStartX, fidelity.motionEndX, fidelity.soundFields], [12.5, 300.75, 10], "Motion/sound fidelity");
  assert.ok(fidelity.assetBytesAndDigestsVerified && fidelity.reopenVerified);
  exact(scenario.race, { savingVisible: true, editDuringSaveResult: "unsaved", secondSaveResult: "saved" }, "Save race evidence");
  exact(scenario.open, { hydratedBeforeMount: true, partialMountsOnReject: 0, previewRequired: false }, "Open evidence");
  const legacy = object(scenario.legacy, ["rawRootBeforeSha256", "rawRootAfterSha256", "targetRemovedAfterSave", "neighborSliceSha256", "neighborSlicePreserved", "unavailableEntriesVisible", "migrationBeforeCleanup"], "Legacy evidence");
  assert.match(legacy.rawRootBeforeSha256 as string, HEX); assert.match(legacy.rawRootAfterSha256 as string, HEX); assert.match(legacy.neighborSliceSha256 as string, HEX);
  assert.ok(legacy.targetRemovedAfterSave && legacy.neighborSlicePreserved && legacy.unavailableEntriesVisible && legacy.migrationBeforeCleanup);
  exact(scenario.failures, {
    corruptOpenPreservedEditor: true,
    unsupportedAudioPreservedEditor: true,
    encodeFailurePreservedEditor: true,
    tooLargePreservedEditor: true,
    deleteAbortPreservedCard: true,
    typedMessagesVisible: true,
  }, "Failure preservation evidence");
};

const realisticScenario = (value: unknown) => {
  const scenario = object(value, ["viewport", "canvas", "structure", "artwork", "persistence", "reopen", "errors"], "Realistic authoring scenario");
  assert.equal(scenario.viewport, REALISTIC_AUTHORING_BITMAP.viewport);
  exact(scenario.canvas, {
    width: REALISTIC_AUTHORING_BITMAP.width,
    height: REALISTIC_AUTHORING_BITMAP.height,
    rgbaByteLength: REALISTIC_AUTHORING_BITMAP.rgbaByteLength,
  }, "Realistic authoring bitmap");
  exact(scenario.structure, { cellTypes: ["keyframe", "hold", "keyframe"], owningBitmapCount: 2, heldFrameIndex: 1, onionEnabled: true }, "Realistic timeline structure");
  const artwork = object(scenario.artwork, ["firstKeyframeRgbaSha256", "secondKeyframeBeforeSaveRgbaSha256", "editedDuringSaveRgbaSha256", "firstSaveCapturedPreEdit", "secondSaveCapturedEdit"], "Realistic artwork evidence");
  for (const key of ["firstKeyframeRgbaSha256", "secondKeyframeBeforeSaveRgbaSha256", "editedDuringSaveRgbaSha256"] as const) assert.match(artwork[key] as string, HEX);
  assert.notEqual(artwork.firstKeyframeRgbaSha256, artwork.secondKeyframeBeforeSaveRgbaSha256);
  assert.notEqual(artwork.secondKeyframeBeforeSaveRgbaSha256, artwork.editedDuringSaveRgbaSha256);
  assert.ok(artwork.firstSaveCapturedPreEdit && artwork.secondSaveCapturedEdit);
  exact(scenario.persistence, { firstSaveRevision: 1, secondSaveRevision: 2, saveAsHeadCount: 2, preparationFailurePublished: false }, "Realistic persistence evidence");
  exact(scenario.reopen, { originalDigestMatched: true, copyDigestMatched: true, allArtworkDimensionsAndDigestsMatched: true, originalOnionOverlayOpaque: true, copyOnionOverlayOpaque: true }, "Realistic reopen evidence");
  exact(scenario.errors, { pageErrors: 0, rangeErrors: 0, invalidArrayLengthErrors: 0, nextOverlayErrors: 0 }, "Realistic error evidence");
};

const validateBrowserResult = (value: Json, mode: (typeof SPEC0002_MODES)[number], verifyBindings: boolean) => {
  const result = object(value, [
    "appMounted", "assertions", "baseCommit", "cleanup", "completedAt", "failure", "flowSteps", "frozenBindings", "frozenContract",
    "headCommit", "mode", "network", "phase", "phase2Scenarios", "realisticAuthoringScenario", "regressions", "requests", "resultVersion", "runtime", "screenshots",
    "serverOutputSha256", "specId", "startedAt", "status", "viewports",
  ], `${mode} result`);
  exact([result.resultVersion, result.specId, result.phase, result.mode, result.baseCommit, result.headCommit, result.status, result.failure, result.appMounted], [1, SPEC0002_ID, SPEC0002_PHASE, mode, SPEC0002_BASE, SPEC0002_BASE, "passed", null, true], `${mode} identity`);
  exact(result.viewports, VIEWPORTS, `${mode} viewports`);
  const assertions = list(result.assertions, `${mode} assertions`);
  assert.ok(assertions.length >= (mode === "phase-2-real-browser-proof" ? PHASE2_BROWSER_ASSERTIONS : 13));
  assertions.forEach((entry, index) => assert.equal(object(entry, ["id", "passed", "detail"], `${mode} assertion ${index}`).passed, true));
  const screenshots = list(result.screenshots, `${mode} screenshots`);
  assert.equal(screenshots.length, mode === "phase-2-real-browser-proof" ? 10 : 4);
  screenshots.forEach((entry, index) => {
    const shot = object(entry, ["id", "viewport", "path", "sha256", "byteLength"], `${mode} screenshot ${index}`);
    assert.ok(VIEWPORTS.some((viewport) => `${viewport.width}x${viewport.height}` === shot.viewport));
    if (verifyBindings) exact(bindLocalFile(ROOT, shot.path as string), { path: shot.path, sha256: shot.sha256, byteLength: shot.byteLength }, `${mode} screenshot binding`);
  });
  const flow = list(result.flowSteps, `${mode} flow`);
  if (mode === "phase-2-real-browser-proof") {
    assert.equal(flow.length, 44);
    for (const viewport of VIEWPORTS) {
      const id = `${viewport.width}x${viewport.height}`;
      const entries = flow.filter((entry) => object(entry, ["id", "viewport", "passed", "detail"], "Flow entry").viewport === id);
      exact(entries.map((entry) => (entry as Json).id), FLOW_STEP_IDS, `${id} flow IDs`);
      assert.ok(entries.every((entry) => (entry as Json).passed === true));
    }
    const scenarios = list(result.phase2Scenarios, "Phase 2 scenarios");
    assert.equal(scenarios.length, 2);
    VIEWPORTS.forEach((viewport, index) => validateScenario(scenarios[index], `${viewport.width}x${viewport.height}`));
    realisticScenario(result.realisticAuthoringScenario);
  } else {
    assert.equal(flow.length, 0);
    assert.equal(list(result.phase2Scenarios, "Regression scenarios").length, 0);
    assert.equal(result.realisticAuthoringScenario, null);
  }
  const regressions = list(result.regressions, `${mode} regressions`);
  assert.equal(regressions.length, REGRESSION_IDS.length);
  exact(regressions.map((entry) => object(entry, ["id", "passed", "detail"], "Regression").id), REGRESSION_IDS, `${mode} regression IDs`);
  if (mode === "phase-1.5-regression-extension") assert.ok(regressions.every((entry) => object(entry, ["id", "passed", "detail"], "Regression").passed === true));
  const network = object(result.network, ["externalAttempts", "realApiRequests", "mockedAiPosts", "mockedMemoryRequests", "serverLedgerEntries", "serverDeniedEntries"], `${mode} network`);
  exact(network.externalAttempts, [], `${mode} external attempts`); exact(network.realApiRequests, [], `${mode} real API requests`);
  assert.equal(network.mockedAiPosts, mode === "phase-2-real-browser-proof" ? 0 : 1);
  assert.equal(network.serverDeniedEntries, 0);
  const requests = list(result.requests, `${mode} requests`);
  const aiRequests = requests.filter((entry) => object(entry, ["method", "path", "mocked", "bodySha256"], "Request").mocked === "ai");
  assert.equal(aiRequests.length, mode === "phase-2-real-browser-proof" ? 0 : 1);
  if (aiRequests.length === 1) {
    const request = aiRequests[0] as Json;
    exact([request.method, request.path], ["POST", "/api/ai"], "AI request ownership");
    assert.match(request.bodySha256 as string, /^sha256:[0-9a-f]{64}$/);
  }
  const frozen = object(result.frozenContract, ["actionCount", "actionsSha256", "drawingPrompt", "phase15AuthorizedPathCount", "phase15AuthorizedPathsSha256"], "Frozen contract evidence");
  exact(frozen, {
    actionCount: FROZEN_ACTIONS.length,
    actionsSha256: sha256(stableJson(FROZEN_ACTIONS)),
    drawingPrompt: FROZEN_DRAWING_PROMPT,
    phase15AuthorizedPathCount: FROZEN_PHASE15_PATHS.length,
    phase15AuthorizedPathsSha256: sha256(stableJson(FROZEN_PHASE15_PATHS)),
  }, "Frozen contract evidence");
  const cleanup = object(result.cleanup, ["instrumentationAbsent", "nextAbsent", "profiles", "serverStopped", "temporaryAbsent"], `${mode} cleanup`);
  exact(cleanup, { instrumentationAbsent: true, nextAbsent: true, profiles: 0, serverStopped: true, temporaryAbsent: true }, `${mode} cleanup`);
};

const validateGraph = (graph: EvidenceGraph, verifyFiles: boolean) => {
  const manifest = object(graph.manifest, MANIFEST_KEYS, "Manifest");
  exact([manifest.manifestVersion, manifest.specId, manifest.phase, manifest.baseCommit, manifest.headCommit, manifest.commandsPassed], [1, SPEC0002_ID, 2, SPEC0002_BASE, SPEC0002_BASE, true], "Manifest identity");
  assert.match(manifest.recordedAt as string, /^\d{4}-\d{2}-\d{2}T/);
  validateCommandConfig(graph.config);
  const commandBinding = bindingShape(manifest.commandConfig, "Command config binding");
  assert.equal(commandBinding.path, CONFIG_PATH);
  if (verifyFiles) verifyBinding(commandBinding, "Command config binding");
  const receiptBindings = list(manifest.receipts, "Receipt bindings");
  assert.equal(receiptBindings.length, 12);
  assert.equal(graph.receipts.length, 12);
  receiptBindings.forEach((value, index) => {
    const binding = bindingShape(value, `Receipt binding ${index}`);
    assert.equal(binding.path, `${SPEC0002_OUTPUT_ROOT}/receipts/${String(index).padStart(2, "0")}-${RECEIPT_DEFINITIONS[index][0]}.json`);
    if (verifyFiles) verifyBinding(binding, `Receipt binding ${index}`);
    validateReceipt(graph.receipts[index], index, verifyFiles);
  });
  const artifactBindings = list(manifest.artifacts, "Artifacts").map((value, index) => bindingShape(value, `Artifact ${index}`));
  const artifactPaths = artifactBindings.map((entry) => entry.path);
  const gitState = object(manifest.git, ["indexEmpty", "dirtyPaths", "statusSha256"], "Git evidence");
  assert.equal(gitState.indexEmpty, true);
  assert.match(gitState.statusSha256 as string, HEX);
  exact(artifactPaths, gitState.dirtyPaths, "Artifact/dirty paths");
  assert.equal(new Set(artifactPaths).size, artifactPaths.length);
  assert.ok(artifactPaths.length > 0 && artifactPaths.every(authorized), "Dirty paths must stay inside the Phase 2 allowlist.");
  if (verifyFiles) {
    exact(artifactPaths, dirtyPaths(), "Current dirty paths");
    artifactBindings.forEach((entry, index) => verifyBinding(entry, `Artifact ${index}`));
    assert.equal(git("diff", "--cached", "--name-only"), "", "Index must be empty.");
  }
  const predecessors = object(manifest.predecessors, ["phase1TechnicalManifestSha256", "phase15TechnicalManifestSha256", "cleanPreEditGate", "phase1Publication", "phase1Files", "phase15Publication", "phase15Files", "frozenBindings"], "Predecessors");
  exact([predecessors.phase1TechnicalManifestSha256, predecessors.phase15TechnicalManifestSha256], [PREDECESSOR_MANIFESTS.phase1, PREDECESSOR_MANIFESTS.phase15], "Predecessor manifests");
  exact(predecessors.cleanPreEditGate, CLEAN_PRE_EDIT_GATE, "Clean pre-edit gate");
  exact([predecessors.phase1Publication, predecessors.phase15Publication], [PHASE1_PUBLICATION, PHASE15_PUBLICATION], "Predecessor publications");
  const phase1Files = list(predecessors.phase1Files, "Phase 1 files").map((value, index) => bindingShape(value, `Phase 1 file ${index}`));
  const phase15Files = list(predecessors.phase15Files, "Phase 1.5 files").map((value, index) => bindingShape(value, `Phase 1.5 file ${index}`));
  assert.ok(phase1Files.length > 0 && phase15Files.length > 0);
  if (verifyFiles) {
    exact(phase1Files.map((entry) => entry.path), expectedPhase1Paths(), "Phase 1 path inventory");
    exact(phase15Files.map((entry) => entry.path), FROZEN_PHASE15_PATHS, "Phase 1.5 path inventory");
    for (const entry of phase1Files) {
      verifyBinding(entry, `Phase 1 ${entry.path}`);
      assert.equal(entry.sha256, sha256(gitBytes(PHASE1_PUBLICATION, entry.path)), `Phase 1 publication drift: ${entry.path}`);
    }
    for (const entry of phase15Files) {
      verifyBinding(entry, `Phase 1.5 ${entry.path}`);
      assert.equal(entry.sha256, sha256(gitBytes(PHASE15_PUBLICATION, entry.path)), `Phase 1.5 publication drift: ${entry.path}`);
    }
  }
  const frozenBindings = list(predecessors.frozenBindings, "Frozen bindings").map((value, index) => bindingShape(value, `Frozen binding ${index}`));
  exact(frozenBindings.map((entry) => entry.path), Object.values(FROZEN_BINDINGS).map((entry) => entry.path), "Frozen path order");
  Object.values(FROZEN_BINDINGS).forEach((expected, index) => assert.equal(frozenBindings[index].sha256, expected.sha256));
  const browser = object(manifest.browserEvidence, ["phase2Result", "regressionResult", "phase2ServerLedger", "regressionServerLedger", "screenshots"], "Browser evidence");
  if (verifyFiles) {
    verifyBinding(browser.phase2Result, "Phase 2 result"); verifyBinding(browser.regressionResult, "Regression result");
    const phase2Ledger = verifyBinding(browser.phase2ServerLedger, "Phase 2 server ledger");
    const regressionLedger = verifyBinding(browser.regressionServerLedger, "Regression server ledger");
    for (const ledger of [phase2Ledger, regressionLedger]) {
      const entries = readFileSync(resolve(ROOT, ledger.path), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Json);
      assert.ok(entries.length > 0 && entries.every((entry) => entry.result === "allowed"));
    }
    list(browser.screenshots, "Browser screenshot bindings").forEach((entry, index) => verifyBinding(entry, `Browser screenshot ${index}`));
  } else {
    bindingShape(browser.phase2Result, "Phase 2 result"); bindingShape(browser.regressionResult, "Regression result");
    bindingShape(browser.phase2ServerLedger, "Phase 2 server ledger"); bindingShape(browser.regressionServerLedger, "Regression server ledger");
  }
  validateBrowserResult(graph.phase2, "phase-2-real-browser-proof", verifyFiles);
  validateBrowserResult(graph.regression, "phase-1.5-regression-extension", verifyFiles);
  const network = object(manifest.network, ["policy", "phase2AiPosts", "regressionAiPosts", "externalAttempts", "realApiRequests", "serverDeniedEntries", "providerRequests"], "Manifest network");
  exact(network, { policy: "loopback-only-fail-closed", phase2AiPosts: 0, regressionAiPosts: 1, externalAttempts: 0, realApiRequests: 0, serverDeniedEntries: 0, providerRequests: 0 }, "Manifest network");
  const lint = object(manifest.lintBaseline, ["acceptedErrors", "acceptedWarnings", "actualErrors", "actualWarnings", "changedLineFindings"], "Lint evidence");
  exact([lint.acceptedErrors, lint.acceptedWarnings, lint.changedLineFindings], [6, 73, 0], "Lint contract");
  assert.ok(Number(lint.actualErrors) <= 6 && Number(lint.actualWarnings) <= 73, "Lint baseline worsened.");
  const assertions = object(manifest.assertions, ["phase1", "validatorNegativeClasses", "phase2Browser", "regressionBrowser", "flowSteps", "regressions", "total"], "Assertion totals");
  assert.equal(assertions.validatorNegativeClasses, 20); assert.equal(assertions.phase2Browser, PHASE2_BROWSER_ASSERTIONS); assert.equal(assertions.regressionBrowser, 13); assert.equal(assertions.flowSteps, 44); assert.equal(assertions.regressions, 10);
  const phase1AssertionTotal = Object.values(assertions.phase1 as Json).map(Number).reduce((sum, value) => sum + value, 0);
  assert.equal(assertions.total, phase1AssertionTotal + 20 + PHASE2_BROWSER_ASSERTIONS + 13 + 44 + 10);
  const runtime = object(manifest.runtime, ["nodeVersion", "npmVersion", "typescriptVersion", "eslintVersion", "playwrightCoreVersion", "chromeExecutable", "downloads"], "Runtime");
  assert.equal(runtime.playwrightCoreVersion, "1.62.1"); assert.equal(runtime.chromeExecutable, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"); assert.equal(runtime.downloads, 0);
  const cleanup = object(manifest.cleanup, ["status", "browserProfiles", "servers", "ports", "nextAbsent", "temporaryAbsent", "instrumentationAbsent", "collisionsRefused", "nodeModulesRemoved"], "Manifest cleanup");
  exact(cleanup, { status: "passed", browserProfiles: 0, servers: 0, ports: 0, nextAbsent: true, temporaryAbsent: true, instrumentationAbsent: true, collisionsRefused: true, nodeModulesRemoved: true }, "Manifest cleanup");
  if (verifyFiles) {
    assert.equal(git("rev-parse", "HEAD"), SPEC0002_BASE);
    assert.equal(existsSync(resolve(ROOT, ".next")), false);
    assert.equal(existsSync(resolve(ROOT, "node_modules")), false);
  }
};

const syntheticBinding = (path: string): Binding => ({ path, sha256: "1".repeat(64), byteLength: 1 });
const syntheticResult = (mode: (typeof SPEC0002_MODES)[number]): Json => {
  const phase2 = mode === "phase-2-real-browser-proof";
  const screenshots = VIEWPORTS.flatMap((viewport) => Array.from({ length: phase2 ? 5 : 2 }, (_, index) => ({
    id: `${mode}-${viewport.width}x${viewport.height}-${index}`,
    viewport: `${viewport.width}x${viewport.height}`,
    path: `synthetic/${mode}-${viewport.width}x${viewport.height}-${index}.png`,
    sha256: "2".repeat(64), byteLength: 1,
  })));
  const flowSteps = phase2 ? VIEWPORTS.flatMap((viewport) => FLOW_STEP_IDS.map((id) => ({ id, viewport: `${viewport.width}x${viewport.height}`, passed: true, detail: id }))) : [];
  const scenario = (viewport: { width: number; height: number }) => ({
    viewport: `${viewport.width}x${viewport.height}`,
    idb: { headsAfterSave: 1, versionsAfterSave: 1, rasterAssets: 5, audioAssets: 1, stagedReadBackVerified: true, activeHeadCompleted: true, deleteAbortPreservedHead: true, tombstonesAfterDeletes: 0, authoritativeDeletesCompleted: true, catalogTargetsHidden: true },
    fidelity: { layers: 2, framesPerLayer: [4, 4], activeTool: "Eraser", timelineFps: 18, text: "Phase 2 exact text", motionStartX: 12.5, motionEndX: 300.75, soundFields: 10, assetBytesAndDigestsVerified: true, reopenVerified: true },
    race: { savingVisible: true, editDuringSaveResult: "unsaved", secondSaveResult: "saved" },
    open: { hydratedBeforeMount: true, partialMountsOnReject: 0, previewRequired: false },
    legacy: { rawRootBeforeSha256: "3".repeat(64), rawRootAfterSha256: "4".repeat(64), targetRemovedAfterSave: true, neighborSliceSha256: "5".repeat(64), neighborSlicePreserved: true, unavailableEntriesVisible: true, migrationBeforeCleanup: true },
    failures: { corruptOpenPreservedEditor: true, unsupportedAudioPreservedEditor: true, encodeFailurePreservedEditor: true, tooLargePreservedEditor: true, deleteAbortPreservedCard: true, typedMessagesVisible: true },
  });
  const aiCount = phase2 ? 0 : 1;
  const syntheticRealisticAuthoring = phase2 ? {
    viewport: REALISTIC_AUTHORING_BITMAP.viewport,
    canvas: { width: REALISTIC_AUTHORING_BITMAP.width, height: REALISTIC_AUTHORING_BITMAP.height, rgbaByteLength: REALISTIC_AUTHORING_BITMAP.rgbaByteLength },
    structure: { cellTypes: ["keyframe", "hold", "keyframe"], owningBitmapCount: 2, heldFrameIndex: 1, onionEnabled: true },
    artwork: { firstKeyframeRgbaSha256: "9".repeat(64), secondKeyframeBeforeSaveRgbaSha256: "a".repeat(64), editedDuringSaveRgbaSha256: "b".repeat(64), firstSaveCapturedPreEdit: true, secondSaveCapturedEdit: true },
    persistence: { firstSaveRevision: 1, secondSaveRevision: 2, saveAsHeadCount: 2, preparationFailurePublished: false },
    reopen: { originalDigestMatched: true, copyDigestMatched: true, allArtworkDimensionsAndDigestsMatched: true, originalOnionOverlayOpaque: true, copyOnionOverlayOpaque: true },
    errors: { pageErrors: 0, rangeErrors: 0, invalidArrayLengthErrors: 0, nextOverlayErrors: 0 },
  } : null;
  return {
    resultVersion: 1, specId: SPEC0002_ID, phase: SPEC0002_PHASE, mode, baseCommit: SPEC0002_BASE, headCommit: SPEC0002_BASE,
    startedAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(), status: "passed", failure: null, appMounted: true,
    viewports: VIEWPORTS, flowSteps, phase2Scenarios: phase2 ? VIEWPORTS.map(scenario) : [], realisticAuthoringScenario: syntheticRealisticAuthoring,
    regressions: REGRESSION_IDS.map((id) => ({ id, passed: true, detail: id })),
    assertions: Array.from({ length: phase2 ? PHASE2_BROWSER_ASSERTIONS : 13 }, (_, index) => ({ id: `A-${index}`, passed: true, detail: "passed" })),
    screenshots,
    requests: aiCount ? [{ method: "POST", path: "/api/ai", mocked: "ai", bodySha256: `sha256:${"6".repeat(64)}` }] : [],
    network: { externalAttempts: [], realApiRequests: [], mockedAiPosts: aiCount, mockedMemoryRequests: 0, serverLedgerEntries: 1, serverDeniedEntries: 0 },
    runtime: { chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", playwrightCore: "1.62.1", browserDownload: false, serverPort: 1 },
    frozenBindings: [],
    frozenContract: { actionCount: FROZEN_ACTIONS.length, actionsSha256: sha256(stableJson(FROZEN_ACTIONS)), drawingPrompt: FROZEN_DRAWING_PROMPT, phase15AuthorizedPathCount: FROZEN_PHASE15_PATHS.length, phase15AuthorizedPathsSha256: sha256(stableJson(FROZEN_PHASE15_PATHS)) },
    cleanup: { instrumentationAbsent: true, nextAbsent: true, profiles: 0, serverStopped: true, temporaryAbsent: true },
    serverOutputSha256: "7".repeat(64),
  };
};

const syntheticGraph = (): EvidenceGraph => {
  const config = readJson(CONFIG_PATH);
  const dirty = ["app/page.tsx", "scripts/runSpec0002BrowserProof.ts"].sort();
  const receipts = RECEIPT_DEFINITIONS.map(([name, argv, expectedExitCode], order) => ({
    receiptVersion: 1, order, name, argv, cwd: ".", env: SANITIZED_ENV, privacy: "sanitized", startedAt: new Date(0).toISOString(), durationMs: 1,
    exitCode: expectedExitCode, expectedExitCode, passed: true,
    stdout: { encoding: "base64", byteLength: 0, sha256: sha256(Buffer.alloc(0)), data: "" },
    stderr: { encoding: "base64", byteLength: 0, sha256: sha256(Buffer.alloc(0)), data: "" },
    lintBaseline: order === 8 ? { acceptedErrors: 6, acceptedWarnings: 73 } : null,
  }));
  const phase2 = syntheticResult("phase-2-real-browser-proof");
  const regression = syntheticResult("phase-1.5-regression-extension");
  const screenshots = [...(phase2.screenshots as unknown[]), ...(regression.screenshots as unknown[])].map((entry) => syntheticBinding((entry as Json).path as string));
  const phase1 = [syntheticBinding("src/lib/drawingProjectV2Contract.ts")];
  const phase15 = [syntheticBinding("scripts/runSpec0001BrowserProof.ts")];
  const frozen = Object.values(FROZEN_BINDINGS).map((entry) => ({ path: entry.path, sha256: entry.sha256, byteLength: 1 }));
  const phase1Totals = { contract: 182, repository: 506, v1: 80, browserEngine: 23 };
  const manifest: Json = {
    manifestVersion: 1, specId: SPEC0002_ID, phase: 2, baseCommit: SPEC0002_BASE, headCommit: SPEC0002_BASE, recordedAt: new Date(0).toISOString(), commandsPassed: true,
    commandConfig: syntheticBinding(CONFIG_PATH),
    receipts: RECEIPT_DEFINITIONS.map(([name], index) => syntheticBinding(`${SPEC0002_OUTPUT_ROOT}/receipts/${String(index).padStart(2, "0")}-${name}.json`)),
    artifacts: dirty.map(syntheticBinding),
    predecessors: { phase1TechnicalManifestSha256: PREDECESSOR_MANIFESTS.phase1, phase15TechnicalManifestSha256: PREDECESSOR_MANIFESTS.phase15, cleanPreEditGate: CLEAN_PRE_EDIT_GATE, phase1Publication: PHASE1_PUBLICATION, phase1Files: phase1, phase15Publication: PHASE15_PUBLICATION, phase15Files: phase15, frozenBindings: frozen },
    browserEvidence: { phase2Result: syntheticBinding("synthetic/phase2.json"), regressionResult: syntheticBinding("synthetic/regression.json"), phase2ServerLedger: syntheticBinding("synthetic/phase2-ledger.jsonl"), regressionServerLedger: syntheticBinding("synthetic/regression-ledger.jsonl"), screenshots },
    assertions: { phase1: phase1Totals, validatorNegativeClasses: 20, phase2Browser: PHASE2_BROWSER_ASSERTIONS, regressionBrowser: 13, flowSteps: 44, regressions: 10, total: Object.values(phase1Totals).reduce((sum, value) => sum + value, 20 + PHASE2_BROWSER_ASSERTIONS + 13 + 44 + 10) },
    lintBaseline: { acceptedErrors: 6, acceptedWarnings: 73, actualErrors: 5, actualWarnings: 72, changedLineFindings: 0 },
    runtime: { nodeVersion: process.version, npmVersion: "11", typescriptVersion: "5", eslintVersion: "9", playwrightCoreVersion: "1.62.1", chromeExecutable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", downloads: 0 },
    git: { indexEmpty: true, dirtyPaths: dirty, statusSha256: "8".repeat(64) },
    network: { policy: "loopback-only-fail-closed", phase2AiPosts: 0, regressionAiPosts: 1, externalAttempts: 0, realApiRequests: 0, serverDeniedEntries: 0, providerRequests: 0 },
    cleanup: { status: "passed", browserProfiles: 0, servers: 0, ports: 0, nextAbsent: true, temporaryAbsent: true, instrumentationAbsent: true, collisionsRefused: true, nodeModulesRemoved: true },
  };
  return { manifest, config, receipts, phase2, regression };
};

const selfTest = () => {
  const fixture = readJson("scripts/fixtures/spec0002-browser/v1/phase-2-validator-negative-cases.json");
  const fixtureObject = object(fixture, ["fixtureVersion", "classes"], "Negative fixture");
  assert.equal(fixtureObject.fixtureVersion, 1); exact(fixtureObject.classes, NEGATIVE_VALIDATOR_CLASSES, "Negative class fixture");
  validateGraph(syntheticGraph(), false);
  const mutations: Record<(typeof NEGATIVE_VALIDATOR_CLASSES)[number], (graph: EvidenceGraph) => void> = {
    "missing-top-level-field": (graph) => { delete graph.manifest.cleanup; },
    "extra-top-level-field": (graph) => { graph.manifest.extra = true; },
    "wrong-spec-phase-base-head": (graph) => { graph.manifest.phase = 3; },
    "command-config-binding-tamper": (graph) => { (graph.manifest.commandConfig as Json).sha256 = "bad"; },
    "receipt-missing-extra-reorder": (graph) => { (graph.manifest.receipts as unknown[]).reverse(); },
    "receipt-argv-env-exit-privacy-tamper": (graph) => { graph.receipts[0].privacy = "raw"; },
    "artifact-missing-extra-hash-tamper": (graph) => { ((graph.manifest.artifacts as unknown[])[0] as Json).sha256 = "bad"; },
    "dirty-path-mismatch": (graph) => { (graph.manifest.git as Json).dirtyPaths = ["app/page.tsx"]; },
    "unauthorized-dirty-path": (graph) => { (graph.manifest.artifacts as unknown[]).push(syntheticBinding("docs/TODO.md")); (graph.manifest.git as Json).dirtyPaths = (graph.manifest.artifacts as Json[]).map((entry) => entry.path); },
    "phase1-predecessor-tamper": (graph) => { (((graph.manifest.predecessors as Json).phase1Files as Json[])[0]).sha256 = "bad"; },
    "phase15-predecessor-tamper": (graph) => { (((graph.manifest.predecessors as Json).phase15Files as Json[])[0]).sha256 = "bad"; },
    "app-mounted-viewport-tamper": (graph) => { graph.phase2.appMounted = false; },
    "browser-action-accessibility-screenshot-tamper": (graph) => { (graph.phase2.flowSteps as unknown[]).pop(); },
    "idb-count-stage-partial-mount-tamper": (graph) => { (((graph.phase2.phase2Scenarios as Json[])[0]).idb as Json).headsAfterSave = 0; },
    "legacy-tombstone-catalog-neighbor-tamper": (graph) => { (((graph.phase2.phase2Scenarios as Json[])[0]).legacy as Json).neighborSlicePreserved = false; },
    "network-request-ledger-tamper": (graph) => { (graph.manifest.network as Json).phase2AiPosts = 1; },
    "cleanup-collision-instrumentation-tamper": (graph) => { (graph.manifest.cleanup as Json).instrumentationAbsent = false; },
    "missing-failed-regression": (graph) => { ((graph.regression.regressions as Json[])[0]).passed = false; },
    "false-commands-passed": (graph) => { graph.manifest.commandsPassed = false; },
    "worsened-lint": (graph) => { (graph.manifest.lintBaseline as Json).actualErrors = 7; },
  };
  const results = [];
  for (const name of NEGATIVE_VALIDATOR_CLASSES) {
    const graph = structuredClone(syntheticGraph());
    mutations[name](graph);
    assert.throws(() => validateGraph(graph, false), `${name} mutation was accepted.`);
    results.push({ name, status: "passed" });
  }
  assert.equal(results.length, 20);
  process.stdout.write(`SPEC-0002 Phase 2 validator self-test PASS: ${results.length} negative classes.\nASSERTIONS: ${results.length}\n`);
};

const validateManifest = () => {
  assert.equal(existsSync(resolve(ROOT, MANIFEST_PATH)), true, "Phase 2 manifest is missing.");
  const manifest = readJson(MANIFEST_PATH);
  const configBinding = bindingShape(manifest.commandConfig, "Command config binding");
  const config = readJson(configBinding.path);
  const receiptBindings = list(manifest.receipts, "Receipt bindings").map((value, index) => bindingShape(value, `Receipt binding ${index}`));
  const receipts = receiptBindings.map((entry) => readJson(entry.path));
  const browser = object(manifest.browserEvidence, ["phase2Result", "regressionResult", "phase2ServerLedger", "regressionServerLedger", "screenshots"], "Browser evidence");
  const phase2 = readJson(bindingShape(browser.phase2Result, "Phase 2 result").path);
  const regression = readJson(bindingShape(browser.regressionResult, "Regression result").path);
  validateGraph({ manifest, config, receipts, phase2, regression }, true);
  const digest = sha256(readFileSync(resolve(ROOT, MANIFEST_PATH)));
  process.stdout.write(`SPEC-0002 Phase 2 proof PASS: ${MANIFEST_PATH}\nSHA-256: ${digest}\nASSERTIONS: ${(manifest.assertions as Json).total}\n`);
};

const argv = process.argv.slice(2);
if (argv.length === 1 && argv[0] === "--self-test") selfTest();
else if (argv.length === 1 && argv[0] === `--manifest=${MANIFEST_PATH}`) validateManifest();
else throw new Error(`Use exactly --self-test or --manifest=${MANIFEST_PATH}.`);
