import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

const ROOT = process.cwd();
const ACTIVATION_HEAD = "1861db92e8f599afa811b0ab6fdd46cc475f9f1c";
const MANIFEST_PATH = "output/spec-0005/phase-2/d0047-correction/proof-manifest.json";
const HISTORICAL_MANIFEST_SHA256 = "sha256:ea7ab9c5a142843b109ad49924f4709660347265099740312a666eca07972cd4";
const EXACT_DIRTY_PATH_ALLOWLIST = [
  "scripts/fixtures/spec0005-stick/v2/body-safety-cases.json",
  "scripts/spec0005-stick/recordPhase2SafetyProof.ts",
  "scripts/spec0005-stick/validatePhase2SafetyProof.ts",
  "scripts/validateStickBodySafety.ts",
  "scripts/validateStickBodySafetyIntegration.ts",
  "src/lib/ai/stickFigureBodySafety.ts",
  "src/lib/ai/stickFigureCommandExecutor.ts",
  "src/lib/ai/stickFigureMotionEngine.ts",
] as const;
const PREFLIGHT_RECEIPT_IDS = [
  "independent-body-safety-oracle",
  "body-safety-integration",
  "motion-quality-baseline",
  "ai-contracts",
  "command-transaction",
  "motion-engine",
  "action-timing",
  "ai-ui-adapter",
  "history-persistence",
  "pose-timeline",
  "typescript",
  "scoped-lint",
  "full-lint-known-baseline",
  "git-diff-and-scope",
  "permanent-browser-regression",
  "review-server-reuse",
] as const;
const EXPECTED_RECEIPT_IDS = [
  ...PREFLIGHT_RECEIPT_IDS.slice(0, 13),
  "proof-validator-mutation-contract",
  ...PREFLIGHT_RECEIPT_IDS.slice(13),
] as const;

type Binding = {path: string; sha256: string; bytes: number};
type ReceiptSummary = {id: string; status: string; receiptPath: string; receiptSha256: string; receiptBytes: number};

const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git = (args: string[]) => {
  const result = spawnSync("git", args, {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};
const listed = (value: string) => value.split("\n").filter(Boolean);
const liveDirtyPaths = () => [...new Set([
  ...listed(git(["diff", "--name-only"])),
  ...listed(git(["ls-files", "--others", "--exclude-standard"])),
])].sort();
const processExists = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};
const bindCheck = (binding: Binding) => {
  const absolute = resolve(ROOT, binding.path);
  assert.ok(existsSync(absolute), `${binding.path} exists`);
  const bytes = readFileSync(absolute);
  assert.equal(sha256(bytes), binding.sha256, `${binding.path} SHA-256 matches`);
  assert.equal(statSync(absolute).size, binding.bytes, `${binding.path} byte count matches`);
};

const manifestIndex = process.argv.indexOf("--manifest");
const manifestPath = resolve(ROOT, manifestIndex >= 0 && process.argv[manifestIndex + 1]
  ? process.argv[manifestIndex + 1]
  : MANIFEST_PATH);
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  manifestVersion: number;
  manifestKind: "mutation-preflight" | "final";
  phase: string;
  status: string;
  generatedAt: string;
  activation: {head: string; localMain: string; originMain: string; detachedHead: boolean; indexEmpty: boolean};
  scope: {
    exactDirtyPathAllowlist: string[];
    observedDirtyPaths: string[];
    outsideAllowlistPaths: string[];
    trackedPathCount: number;
    docsChanged: boolean;
    packageConfigEnvironmentChanged: boolean;
    stagedPaths: string[];
  };
  safetyContract: {
    fixtureVersion: number;
    decision: string;
    selectionContractVersion: string;
    selectionResultVersion: string;
    completionContractVersion: string;
    stage: {width: number; height: number; standingBodyHeight: number; groundY: number};
    positiveCatalogCases: number;
    negativeCatalogCases: number;
    closedFailureReasons: number;
    propertySeed: number;
    propertyCandidates: number;
    mirroredCandidates: number;
    independentOracle: boolean;
    independentOracleImportsRuntimeKernel: boolean;
    runtimeFinalizer: string;
    runtimeSelector: string;
    selectionExcludesFinalFramesAndDocument: boolean;
    completionRerunsSelection: boolean;
    commandExecutorSelectsFinalDoorInternally: boolean;
    airbornePhase2Rejected: boolean;
    roundedOutputValidated: boolean;
    noTrustedBypass: boolean;
  };
  counts: {technicalReceipts: number; proofArtifacts: number; integrationAssertions: number; observedNamedNegatives: number};
  testResults: ReceiptSummary[];
  permanentBrowser: {
    executionSource: string;
    baseCommit: string;
    exactRunsThisCorrection: number;
    receiptReusedAfterSafetyAudit: boolean;
    historicalInitialFailure: Binding;
    result: Binding;
    status: string;
    externalAttempts: number;
    realApiRouteRequests: number;
    cleanupPassed: boolean;
  };
  reviewServer: {
    url: string;
    hostname: string;
    port: number;
    path: string;
    search: string;
    hash: string;
    serverPid: number;
    processGroupId: number;
    worktree: string;
    sourceHead: string;
    sourceDirtyPaths: string[];
    launchMode: string;
    purpose: string;
    phase2SafetyDemonstrated: boolean;
    newMotionReviewed: boolean;
    ordinaryRootOnly: boolean;
    normalControlsOnly: boolean;
    fixturePickerAbsent: boolean;
    privateReviewUiAbsent: boolean;
    noQueryFlag: boolean;
    noHashFlag: boolean;
    non3000: boolean;
    loopbackOnly: boolean;
    recorderExternalRequests: number;
    recorderProviderRequests: number;
    rootStatus: number;
    rootBytes: number;
    reused: boolean;
    processEvidence: {launcherPid: number; listenerPid: number; launcherCommand: string; listenerCommand: string; cwd: string};
  };
  historicalProof: Binding;
  basisReconciliation: Binding;
  humanReview: {status: string; automationCannotAccept: boolean; scope: string};
  sourceFiles: Binding[];
  artifacts: Binding[];
};

if (process.argv.includes("--mutation-suite")) {
  assert.equal(manifest.manifestKind, "mutation-preflight", "mutation suite requires the real preflight manifest");
  const script = resolve(ROOT, "scripts/spec0005-stick/validatePhase2SafetyProof.ts");
  const mutationRoot = resolve(dirname(manifestPath), "mutation-cases");
  if (existsSync(mutationRoot)) rmSync(mutationRoot, {recursive: true, force: true});
  mkdirSync(mutationRoot, {recursive: true});
  const flipDigest = (value: string) => `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;
  const mutations: Array<[string, (candidate: typeof manifest) => void]> = [
    ["one-byte-source-hash", (candidate) => { candidate.sourceFiles[0].sha256 = flipDigest(candidate.sourceFiles[0].sha256); }],
    ["source-byte-count", (candidate) => { candidate.sourceFiles[0].bytes += 1; }],
    ["artifact-hash", (candidate) => { candidate.artifacts[0].sha256 = flipDigest(candidate.artifacts[0].sha256); }],
    ["artifact-byte-count", (candidate) => { candidate.artifacts[0].bytes += 1; }],
    ["status", (candidate) => { candidate.status = "accepted"; }],
    ["base", (candidate) => { candidate.activation.head = "0".repeat(40); }],
    ["path", (candidate) => { candidate.scope.exactDirtyPathAllowlist[0] = "src/unrelated.ts"; }],
    ["count", (candidate) => { candidate.counts.integrationAssertions -= 1; }],
    ["order", (candidate) => { candidate.testResults.reverse(); }],
    ["tolerance", (candidate) => { candidate.safetyContract.stage.width -= 1; }],
    ["reference", (candidate) => { candidate.safetyContract.runtimeFinalizer = "alternateFinalizer"; }],
    ["network", (candidate) => { candidate.reviewServer.loopbackOnly = false; }],
    ["lifecycle", (candidate) => { candidate.activation.indexEmpty = false; }],
    ["review-identity", (candidate) => { candidate.reviewServer.worktree = "/tmp/not-the-worktree"; }],
    ["review-url", (candidate) => { candidate.reviewServer.url = "http://127.0.0.1:3000/"; }],
    ["review-claim", (candidate) => { candidate.reviewServer.phase2SafetyDemonstrated = true; }],
    ["review-purpose", (candidate) => { candidate.reviewServer.purpose = "phase-2-demonstration"; }],
    ["historical-binding", (candidate) => { candidate.historicalProof.sha256 = flipDigest(candidate.historicalProof.sha256); }],
    ["selector-reference", (candidate) => { candidate.safetyContract.runtimeSelector = "alternateSelector"; }],
    ["two-stage-claim", (candidate) => { candidate.safetyContract.completionRerunsSelection = false; }],
  ];
  const execute = (path: string) => spawnSync(process.execPath, [
    "--experimental-strip-types",
    script,
    "--manifest",
    path,
    "--check-only",
  ], {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  const original = execute(manifestPath);
  assert.equal(original.status, 0, `the real preflight manifest must pass the actual validator: ${original.stderr}`);
  const results: Array<{id: string; rejected: true; exitCode: number}> = [];
  for (const [id, mutate] of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    const path = resolve(mutationRoot, `${id}.json`);
    writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`);
    const execution = execute(path);
    assert.notEqual(execution.status, 0, `${id} mutation must be rejected by the actual validator`);
    results.push({id, rejected: true, exitCode: execution.status ?? -1});
  }
  rmSync(mutationRoot, {recursive: true, force: true});
  console.log(JSON.stringify({
    validatorVersion: 1,
    validationPath: "actual validatePhase2SafetyProof.ts manifest path",
    originalRealPreflightAccepted: true,
    mutationTestCount: results.length,
    mutations: results,
    acceptedRuntimeEdited: false,
    result: "passed",
  }, null, 2));
  process.exit(0);
}

let checks = 0;
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const ok = (actual: unknown, message: string) => { assert.ok(actual, message); checks += 1; };

equal(manifest.manifestVersion, 2, "manifest version is exact");
ok(manifest.manifestKind === "mutation-preflight" || manifest.manifestKind === "final", "manifest kind is closed");
equal(manifest.phase, "SPEC-0005 Phase 2 — D-0047 Two-Stage Body-Safety Correction", "phase identity is exact");
equal(manifest.status, "technical-pass-owner-pm-review-pending", "technical proof cannot award owner/PM acceptance");
ok(Number.isFinite(Date.parse(manifest.generatedAt)), "generated timestamp is valid");
equal(manifest.activation, {
  head: ACTIVATION_HEAD,
  localMain: ACTIVATION_HEAD,
  originMain: ACTIVATION_HEAD,
  detachedHead: true,
  indexEmpty: true,
}, "activation tuple is exact");
equal(git(["rev-parse", "HEAD"]), ACTIVATION_HEAD, "live HEAD remains exact");
equal(git(["rev-parse", "main"]), ACTIVATION_HEAD, "local main remains exact");
equal(git(["rev-parse", "origin/main"]), ACTIVATION_HEAD, "origin main remains exact");
equal(git(["branch", "--show-current"]), "", "worktree remains detached");
equal(git(["diff", "--cached", "--name-only"]), "", "index remains empty");
equal(liveDirtyPaths(), [...EXACT_DIRTY_PATH_ALLOWLIST], "live dirty state is the exact eight-path allowlist");
equal(manifest.scope.exactDirtyPathAllowlist, [...EXACT_DIRTY_PATH_ALLOWLIST], "manifest dirty allowlist is exact");
equal(manifest.scope.observedDirtyPaths, [...EXACT_DIRTY_PATH_ALLOWLIST], "manifest observed paths are exact");
equal(manifest.scope.outsideAllowlistPaths, [], "no outside-allowlist tracked path exists");
equal(manifest.scope.trackedPathCount, 8, "tracked path count is exact");
equal(manifest.scope.docsChanged, false, "control-plane documents remain untouched");
equal(manifest.scope.packageConfigEnvironmentChanged, false, "package/config/environment remain untouched");
equal(manifest.scope.stagedPaths, [], "manifest records empty index");

equal(manifest.safetyContract, {
  fixtureVersion: 2,
  decision: "D-0047",
  selectionContractVersion: "stick.body-safety-selection/v1",
  selectionResultVersion: "stick.body-safety-selection-result/v1",
  completionContractVersion: "stick.body-safety-completion/v1",
  stage: {width: 1920, height: 1080, standingBodyHeight: 740, groundY: 980},
  positiveCatalogCases: 16,
  negativeCatalogCases: 68,
  closedFailureReasons: 20,
  propertySeed: 1592594996,
  propertyCandidates: 10_000,
  mirroredCandidates: 10_000,
  independentOracle: true,
  independentOracleImportsRuntimeKernel: false,
  runtimeFinalizer: "finalizeStickBodySafetyCandidate",
  runtimeSelector: "selectStickBodySafetyImportantPoses",
  selectionExcludesFinalFramesAndDocument: true,
  completionRerunsSelection: true,
  commandExecutorSelectsFinalDoorInternally: true,
  airbornePhase2Rejected: true,
  roundedOutputValidated: true,
  noTrustedBypass: true,
}, "frozen safety contract is exact");
const expectedReceiptIds = manifest.manifestKind === "mutation-preflight" ? [...PREFLIGHT_RECEIPT_IDS] : [...EXPECTED_RECEIPT_IDS];
equal(manifest.counts.technicalReceipts, expectedReceiptIds.length, "all required technical receipts exist");
equal(manifest.counts.technicalReceipts, manifest.testResults.length, "receipt count is consistent");
equal(manifest.counts.integrationAssertions, 20_305, "integration assertion count is exact");
equal(manifest.counts.observedNamedNegatives, 81, "named runtime negatives are exact");
equal(manifest.counts.proofArtifacts, manifest.artifacts.length, "artifact count is consistent");
equal(manifest.testResults.map((entry) => entry.id), expectedReceiptIds, "technical receipt order is exact");
for (const summary of manifest.testResults) {
  equal(summary.status, "passed", `${summary.id} passed`);
  bindCheck({path: summary.receiptPath, sha256: summary.receiptSha256, bytes: summary.receiptBytes});
  const receipt = JSON.parse(readFileSync(resolve(ROOT, summary.receiptPath), "utf8")) as {id: string; result: string; exitCode: number};
  equal(receipt.id, summary.id, `${summary.id} receipt identity matches`);
  equal(receipt.result, "passed", `${summary.id} receipt result matches`);
  if (summary.id === "full-lint-known-baseline") equal(receipt.exitCode, 1, "full lint records the known nonzero baseline");
  else equal(receipt.exitCode, 0, `${summary.id} exited successfully`);
}

equal(manifest.permanentBrowser.executionSource, "clean isolated clone of exact activation base", "permanent browser source is isolated");
equal(manifest.permanentBrowser.baseCommit, ACTIVATION_HEAD, "permanent browser base is exact");
equal(manifest.permanentBrowser.exactRunsThisCorrection, 1, "permanent browser ran exactly once for the correction");
equal(manifest.permanentBrowser.receiptReusedAfterSafetyAudit, true, "post-audit proof rerun reused the single browser receipt");
bindCheck(manifest.permanentBrowser.historicalInitialFailure);
const failedAttempt = JSON.parse(readFileSync(resolve(ROOT, manifest.permanentBrowser.historicalInitialFailure.path), "utf8")) as {
  status: string;
  phase2RuntimeIncluded: boolean;
  assertionLocation: string;
  expectedScreenshotSha256: string;
  actualScreenshotSha256: string;
  readOnlyDiagnosis: {retainedScreenshotAvailable: boolean; retainedServerLogAvailable: boolean; rootCauseStatus: string};
  disposition: string;
};
equal(failedAttempt.status, "failed", "the first permanent tester attempt is honestly retained as failed");
equal(failedAttempt.phase2RuntimeIncluded, false, "the failed attempt excluded Phase 2 runtime bytes");
equal(failedAttempt.assertionLocation, "scripts/runSpec0001BrowserProof.ts:1868 runDrawingFlow", "failed assertion location is exact");
ok(failedAttempt.expectedScreenshotSha256 !== failedAttempt.actualScreenshotSha256, "failed canvas hashes remain unequal");
equal(failedAttempt.readOnlyDiagnosis.retainedScreenshotAvailable, false, "failed clone retained no screenshot artifact");
equal(failedAttempt.readOnlyDiagnosis.retainedServerLogAvailable, false, "failed clone retained no server log artifact");
ok(failedAttempt.readOnlyDiagnosis.rootCauseStatus.startsWith("unproven"), "failed-attempt root cause remains honestly unproven");
equal(failedAttempt.disposition, "not accepted as proof; read-only diagnosis required before one bounded unchanged retry", "failed attempt was not promoted to proof");
equal(manifest.permanentBrowser.status, "passed", "permanent browser passed");
equal(manifest.permanentBrowser.externalAttempts, 0, "permanent browser saw no external attempts");
equal(manifest.permanentBrowser.realApiRouteRequests, 0, "permanent browser made no real API requests");
equal(manifest.permanentBrowser.cleanupPassed, true, "permanent browser cleaned its resources");
bindCheck(manifest.permanentBrowser.result);
const permanentResult = JSON.parse(readFileSync(resolve(ROOT, manifest.permanentBrowser.result.path), "utf8")) as {
  status: string;
  headCommit: string;
  runBaseline: {baselineCommit: string};
  network: {nonLoopbackAttempts: number; realApiRouteRequests: number; policyViolations: unknown[]};
  cleanup: {status: string; openBrowserContexts: number; openServers: number; residualPorts: number; anchorRestored: boolean};
};
equal(permanentResult.status, "passed", "permanent result status is passed");
equal(permanentResult.headCommit, ACTIVATION_HEAD, "permanent result head is exact");
equal(permanentResult.runBaseline.baselineCommit, ACTIVATION_HEAD, "permanent tester run-base is exact");
equal(permanentResult.network.nonLoopbackAttempts, 0, "permanent result has zero non-loopback attempts");
equal(permanentResult.network.realApiRouteRequests, 0, "permanent result has zero real API route requests");
equal(permanentResult.network.policyViolations, [], "permanent result has no network policy violation");
equal(permanentResult.cleanup, {
  status: "passed",
  openBrowserContexts: 0,
  openServers: 0,
  residualProfiles: 0,
  residualPorts: 0,
  nextBuildPresent: false,
  temporaryFontSetupPresent: false,
  anchorRestored: true,
}, "permanent browser cleanup is exact");

const reviewUrl = new URL(manifest.reviewServer.url);
equal(reviewUrl.protocol, "http:", "review protocol is ordinary HTTP");
equal(reviewUrl.hostname, "127.0.0.1", "review server is loopback-only");
equal(reviewUrl.port, String(manifest.reviewServer.port), "review URL port matches");
equal(reviewUrl.pathname, "/", "review uses the ordinary root route");
equal(reviewUrl.search, "", "review URL has no query");
equal(reviewUrl.hash, "", "review URL has no hash");
ok(manifest.reviewServer.port !== 3000, "review port is not 3000");
equal(manifest.reviewServer.reused, true, "the one existing root server was reused");
ok(processExists(manifest.reviewServer.serverPid), "review PID remains alive");
const liveProcess = spawnSync("ps", ["-ww", "-o", "pgid=", "-o", "command=", "-p", String(manifest.reviewServer.serverPid)], {encoding: "utf8"});
equal(liveProcess.status, 0, "review process is independently visible to ps");
const liveProcessLine = liveProcess.stdout.trim();
const liveProcessMatch = /^(\d+)\s+(.+)$/.exec(liveProcessLine);
ok(liveProcessMatch, "review process line contains PGID and command");
equal(Number(liveProcessMatch![1]), manifest.reviewServer.processGroupId, "live process group matches manifest");
equal(liveProcessLine, manifest.reviewServer.processEvidence.listenerCommand, "live process command matches manifest");
ok(/next-server|next\/dist\/server/.test(liveProcessMatch![2]), "live command is the bound forked Next server");
const liveLauncher = spawnSync("ps", ["-ww", "-o", "pgid=", "-o", "command=", "-p", String(manifest.reviewServer.processEvidence.launcherPid)], {encoding: "utf8"});
equal(liveLauncher.status, 0, "review launcher is independently visible to ps");
const liveLauncherMatch = /^(\d+)\s+(.+)$/.exec(liveLauncher.stdout.trim());
ok(liveLauncherMatch, "review launcher line contains PGID and command");
equal(Number(liveLauncherMatch![1]), manifest.reviewServer.processGroupId, "launcher process group matches manifest");
equal(liveLauncher.stdout.trim(), manifest.reviewServer.processEvidence.launcherCommand, "launcher command matches manifest");
ok(liveLauncherMatch![2].includes("next/dist/bin/next") && liveLauncherMatch![2].includes(String(manifest.reviewServer.port)), "launcher command binds the exact Next path and port");
const liveCwd = spawnSync("lsof", ["-a", "-p", String(manifest.reviewServer.serverPid), "-d", "cwd", "-Fn"], {encoding: "utf8"});
equal(liveCwd.status, 0, "review cwd is independently visible to lsof");
const liveCwdPath = liveCwd.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
equal(liveCwdPath ? resolve(liveCwdPath) : null, manifest.reviewServer.processEvidence.cwd, "live review cwd matches manifest");
const liveListener = spawnSync("lsof", ["-a", "-p", String(manifest.reviewServer.serverPid), "-nP", `-iTCP:${manifest.reviewServer.port}`, "-sTCP:LISTEN", "-Fp", "-Fn"], {encoding: "utf8"});
equal(liveListener.status, 0, "review listener is independently visible to lsof");
const listenerPid = Number(liveListener.stdout.split("\n").find((line) => line.startsWith("p"))?.slice(1));
const listenerName = liveListener.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? "";
equal(listenerPid, manifest.reviewServer.processEvidence.listenerPid, "live listener PID matches manifest");
ok(listenerName.includes(`127.0.0.1:${manifest.reviewServer.port}`), "listener is bound to exact loopback port");
equal(manifest.reviewServer.worktree, ROOT, "review server is sourced directly from this worktree");
equal(manifest.reviewServer.sourceHead, ACTIVATION_HEAD, "review source head is exact");
equal(manifest.reviewServer.sourceDirtyPaths, [...EXACT_DIRTY_PATH_ALLOWLIST], "review source dirty paths are exact");
equal(manifest.reviewServer.launchMode, "reused-existing-next-development-webpack-direct-worktree", "review launch mode is exact");
equal(manifest.reviewServer.purpose, "ordinary-existing-app-regression-smoke-only", "review purpose is narrowly scoped");
equal(manifest.reviewServer.phase2SafetyDemonstrated, false, "ordinary root does not claim Phase 2 safety demonstration");
equal(manifest.reviewServer.newMotionReviewed, false, "ordinary root does not claim review of a new motion");
for (const [name, flag] of Object.entries({
  ordinaryRootOnly: manifest.reviewServer.ordinaryRootOnly,
  normalControlsOnly: manifest.reviewServer.normalControlsOnly,
  fixturePickerAbsent: manifest.reviewServer.fixturePickerAbsent,
  privateReviewUiAbsent: manifest.reviewServer.privateReviewUiAbsent,
  noQueryFlag: manifest.reviewServer.noQueryFlag,
  noHashFlag: manifest.reviewServer.noHashFlag,
  non3000: manifest.reviewServer.non3000,
  loopbackOnly: manifest.reviewServer.loopbackOnly,
})) equal(flag, true, `${name} is true`);
equal(manifest.reviewServer.recorderExternalRequests, 0, "review recorder issued no external requests");
equal(manifest.reviewServer.recorderProviderRequests, 0, "review recorder issued no provider requests");
equal(manifest.reviewServer.rootStatus, 200, "ordinary root returned 200");
ok(manifest.reviewServer.rootBytes > 0, "ordinary root response is non-empty");
const response = await fetch(manifest.reviewServer.url, {redirect: "manual"});
equal(response.status, 200, "live ordinary review root remains reachable");
await response.arrayBuffer();

bindCheck(manifest.historicalProof);
equal(manifest.historicalProof.path, "output/spec-0005/phase-2/proof-manifest.json", "historical proof path is unchanged");
equal(manifest.historicalProof.sha256, HISTORICAL_MANIFEST_SHA256, "historical proof SHA is exact");
equal(manifest.historicalProof.bytes, 17_826, "historical proof size is exact");
bindCheck(manifest.basisReconciliation);
equal(manifest.basisReconciliation.path, "output/spec-0005/phase-2/d0047-correction/basis-reconciliation.json", "basis reconciliation is bound inside correction output");

equal(manifest.humanReview, {
  status: "pending-arthur-and-project-manager",
  automationCannotAccept: true,
  scope: "ordinary existing-app regression smoke only; Phase 2 safety is proven technically, not demonstrated by this root page",
}, "human review remains explicitly pending");
equal(manifest.sourceFiles.map((entry) => entry.path), [...EXACT_DIRTY_PATH_ALLOWLIST], "all eight source paths are bound in exact order");
for (const binding of manifest.sourceFiles) bindCheck(binding);
for (const binding of manifest.artifacts) bindCheck(binding);
equal(new Set(manifest.artifacts.map((entry) => entry.path)).size, manifest.artifacts.length, "artifact paths are unique");

const validation = {
  validationVersion: 1,
  validatedAt: new Date().toISOString(),
  manifestPath: manifestPath.slice(ROOT.length + 1),
  manifestSha256: sha256(manifestBytes),
  manifestBytes: manifestBytes.byteLength,
  checks,
  result: "passed",
};
const validationPath = resolve(dirname(manifestPath), "proof-manifest-validation.json");
if (!process.argv.includes("--check-only")) writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(validation, null, 2));
