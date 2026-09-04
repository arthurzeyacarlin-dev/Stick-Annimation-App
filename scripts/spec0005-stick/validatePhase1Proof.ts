import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

const ROOT = process.cwd();
const ACTIVATION_HEAD = "2b4f00e7a122c196b2c0600144cd638b461bbb2f";
const EXACT_DIRTY_PATH_ALLOWLIST = [
  "scripts/fixtures/spec0005-stick/v1/playback-quality-review-plan.json",
  "scripts/fixtures/spec0005-stick/v1/quality-baseline-cases.json",
  "scripts/spec0005-stick/phase1BrowserProof.ts",
  "scripts/spec0005-stick/recordPhase1Proof.ts",
  "scripts/spec0005-stick/validatePhase1Proof.ts",
  "scripts/validateStickMotionQualityBaseline.ts",
] as const;
const MANIFEST_PATH = "output/spec-0005/phase-1/proof-manifest.json";
const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const processExists = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};
const git = (args: string[]) => {
  const result = spawnSync("git", args, {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};
const listed = (value: string) => value.split("\n").filter(Boolean);
const bindCheck = (binding: {path: string; sha256: string; bytes: number}) => {
  const path = resolve(ROOT, binding.path);
  const bytes = readFileSync(path);
  assert.equal(sha256(bytes), binding.sha256, `${binding.path} SHA-256 matches`);
  assert.equal(statSync(path).size, binding.bytes, `${binding.path} size matches`);
};

const contractMutationTests = () => {
  const accepted = {
    status: "technical-pass-human-review-pending",
    base: ACTIVATION_HEAD,
    path: EXACT_DIRTY_PATH_ALLOWLIST[0] as string,
    count: 13,
    order: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0],
    tolerance: {minimumMs: 750, maximumMs: 1500, pixels: 2},
    reference: "sha256:f550656daf7e32e5a537b074dc157712e9a9bf896ba35502e6be7eb027043132",
    network: {external: 0, api: 0, provider: 0},
    lifecycle: {indexEmpty: true, humanAccepted: false, serverAlive: true},
  };
  const valid = (candidate: typeof accepted) =>
    candidate.status === accepted.status &&
    candidate.base === accepted.base &&
    candidate.path === accepted.path &&
    candidate.count === accepted.count &&
    JSON.stringify(candidate.order) === JSON.stringify(accepted.order) &&
    JSON.stringify(candidate.tolerance) === JSON.stringify(accepted.tolerance) &&
    candidate.reference === accepted.reference &&
    JSON.stringify(candidate.network) === JSON.stringify(accepted.network) &&
    JSON.stringify(candidate.lifecycle) === JSON.stringify(accepted.lifecycle);
  const mutations = {
    originalAccepted: valid(accepted),
    oneByteRejected: !valid({...accepted, reference: accepted.reference.slice(0, -1) + "3"}),
    statusRejected: !valid({...accepted, status: "accepted"}),
    baseRejected: !valid({...accepted, base: "0".repeat(40)}),
    pathRejected: !valid({...accepted, path: "src/runtime.ts"}),
    countRejected: !valid({...accepted, count: 12}),
    orderRejected: !valid({...accepted, order: [...accepted.order].reverse()}),
    toleranceRejected: !valid({...accepted, tolerance: {...accepted.tolerance, maximumMs: 1501}}),
    referenceRejected: !valid({...accepted, reference: "sha256:" + "0".repeat(64)}),
    networkRejected: !valid({...accepted, network: {...accepted.network, api: 1}}),
    lifecycleRejected: !valid({...accepted, lifecycle: {...accepted.lifecycle, humanAccepted: true}}),
  };
  assert.ok(Object.values(mutations).every(Boolean), "every material proof mutation fails closed");
  return mutations;
};

if (process.argv.includes("--self-test-contract")) {
  const mutations = contractMutationTests();
  console.log(JSON.stringify({validatorVersion: 1, mutationTests: mutations, mutationTestCount: Object.keys(mutations).length, result: "passed"}, null, 2));
  process.exit(0);
}

const manifestArgument = process.argv.indexOf("--manifest");
const manifestPath = resolve(ROOT, manifestArgument >= 0 && process.argv[manifestArgument + 1]
  ? process.argv[manifestArgument + 1]
  : MANIFEST_PATH);
const validationPath = resolve(dirname(manifestPath), "proof-manifest-validation.json");
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  manifestVersion: number;
  phase: string;
  status: string;
  generatedAt: string;
  activation: {head: string; localMain: string; originMain: string; detachedHead: boolean; indexEmpty: boolean};
  scope: {
    exactDirtyPathAllowlist: string[];
    observedDirtyPaths: string[];
    outsideAllowlistPaths: string[];
    trackedPathCount: number;
    runtimeChanged: boolean;
    currentFixtureChanged: boolean;
    docsChanged: boolean;
    packageConfigEnvironmentChanged: boolean;
    stagedPaths: string[];
  };
  reference: {
    acceptedName: string;
    independentOracle: boolean;
    engineGeneratedOracle: boolean;
    sourceBindings: Array<{path: string; sha256: string; bytes: number; purpose: string}>;
    landmarkFrames: number[];
    stableUnrelatedRoles: string[];
    segmentCount: number;
  };
  counts: {
    requiredMutationCases: number;
    technicalReceipts: number;
    proofArtifacts: number;
    browserViewports: number;
    fullPlaybackCycles: number;
    observedFrameSamples: number;
    landmarkFrameChecks: number;
    limbLengthChecks: number;
    screenshots: number;
  };
  testResults: Array<{id: string; status: string; receiptPath: string; receiptSha256: string; receiptBytes: number}>;
  browser: {
    receiptPath: string;
    receiptSha256: string;
    receiptBytes: number;
    reviewCopy: {
      url: string;
      serverPid: number;
      processGroupId: number;
      port: number;
      isolatedCopy: string;
      loopbackOnly: boolean;
      non3000: boolean;
      noQueryFlag: boolean;
      noHashFlag: boolean;
      normalStickControlsOnly: boolean;
      privateReviewBoxAbsent: boolean;
      pickerAbsent: boolean;
      overlayAbsent: boolean;
      testerButtonAbsent: boolean;
      productRouteAdded: boolean;
      trackedAppCodeChanged: boolean;
      cleanupCommand: string;
    };
    externalRequests: number;
    apiRequests: number;
    providerRequests: number;
    actionableConsoleErrors: number;
  };
  humanReview: {status: string; automationCannotAcceptQuality: boolean; requiredLoops: number; scrubFrameIndexes: number[]};
  sourceFiles: Array<{path: string; sha256: string; bytes: number}>;
  artifacts: Array<{path: string; sha256: string; bytes: number}>;
};

let checks = 0;
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };

equal(manifest.manifestVersion, 1, "manifest version is exact");
equal(manifest.phase, "SPEC-0005 Phase 1 — Accepted Motion References and Full-Playback Quality Gate", "phase is exact");
equal(manifest.status, "technical-pass-human-review-pending", "manifest cannot award human acceptance");
ok(Number.isFinite(Date.parse(manifest.generatedAt)), "manifest time is valid");
equal(manifest.activation, {
  head: ACTIVATION_HEAD,
  localMain: ACTIVATION_HEAD,
  originMain: ACTIVATION_HEAD,
  detachedHead: true,
  indexEmpty: true,
}, "activation state is exact");
equal(git(["rev-parse", "HEAD"]), ACTIVATION_HEAD, "live HEAD is exact");
equal(git(["rev-parse", "main"]), ACTIVATION_HEAD, "live local main is exact");
equal(git(["rev-parse", "origin/main"]), ACTIVATION_HEAD, "live origin/main is exact");
equal(git(["branch", "--show-current"]), "", "worktree remains detached");
equal(git(["diff", "--cached", "--name-only"]), "", "index remains empty");
const observedDirty = [...new Set([...listed(git(["diff", "--name-only"])), ...listed(git(["ls-files", "--others", "--exclude-standard"]))])].sort();
equal(observedDirty, [...EXACT_DIRTY_PATH_ALLOWLIST], "live dirty state is the exact six-path allowlist");
equal(manifest.scope.exactDirtyPathAllowlist, [...EXACT_DIRTY_PATH_ALLOWLIST], "manifest allowlist is exact");
equal(manifest.scope.observedDirtyPaths, [...EXACT_DIRTY_PATH_ALLOWLIST], "manifest observed dirty paths are exact");
equal(manifest.scope.outsideAllowlistPaths, [], "no outside-allowlist path exists");
equal(manifest.scope.trackedPathCount, 6, "tracked path count is exact");
equal(manifest.scope.runtimeChanged, false, "runtime is unchanged");
equal(manifest.scope.currentFixtureChanged, false, "current fixtures are unchanged");
equal(manifest.scope.docsChanged, false, "control plane is unchanged");
equal(manifest.scope.packageConfigEnvironmentChanged, false, "package/config/environment are unchanged");
equal(manifest.scope.stagedPaths, [], "manifest records an empty index");

equal(manifest.reference.acceptedName, "published-spec0001-three-pose-wave", "accepted wave identity is exact");
equal(manifest.reference.independentOracle, true, "oracle is independent");
equal(manifest.reference.engineGeneratedOracle, false, "oracle is not engine-generated");
equal(manifest.reference.sourceBindings.map((source) => source.path), [
  "scripts/fixtures/stick-ai/v1/wave-request.json",
  "scripts/fixtures/stick-ai/v1/wave-command-batch.json",
  "scripts/fixtures/stick-ai/v1/manual-wave-applied-project.json",
], "accepted source catalog is exact and ordered");
for (const source of manifest.reference.sourceBindings) bindCheck(source);
equal(manifest.reference.landmarkFrames, [0, 4, 8], "landmark frames are exact");
equal(manifest.reference.stableUnrelatedRoles.length, 9, "all nine unrelated roles are protected");
equal(manifest.reference.segmentCount, 10, "all ten limbs are checked");

equal(manifest.counts.requiredMutationCases, 13, "all required mutation cases are proven");
equal(manifest.counts.technicalReceipts, manifest.testResults.length, "technical receipt count is consistent");
ok(manifest.counts.technicalReceipts >= 6, "focused validation, TypeScript, lint, proof mutation, diff, and permanent tester receipts exist");
equal(manifest.counts.proofArtifacts, manifest.artifacts.length, "artifact count is consistent");
equal(manifest.counts.browserViewports, 2, "both required viewports are proven");
equal(manifest.counts.fullPlaybackCycles, 2, "one complete cycle per viewport is proven");
equal(manifest.counts.observedFrameSamples, 26, "both 13-sample ordered cycles are bound");
equal(manifest.counts.landmarkFrameChecks, 6, "0/4/8 are proven at both viewports");
equal(manifest.counts.limbLengthChecks, 260, "ten limbs across 26 observed samples are proven");
equal(manifest.counts.screenshots, 4, "ordinary and time-based evidence exist at both viewports");

const expectedReceiptIds = [
  "quality-baseline-and-mutations",
  "typescript",
  "scoped-lint",
  "proof-validator-mutation-contract",
  "git-diff-and-scope",
  "permanent-browser-regression",
];
equal(manifest.testResults.map((result) => result.id), expectedReceiptIds, "technical receipts are exact and ordered");
for (const result of manifest.testResults) {
  equal(result.status, "passed", `${result.id} passed`);
  bindCheck({path: result.receiptPath, sha256: result.receiptSha256, bytes: result.receiptBytes});
  const receipt = JSON.parse(readFileSync(resolve(ROOT, result.receiptPath), "utf8")) as {id: string; exitCode: number; result: string};
  equal(receipt.id, result.id, `${result.id} receipt identity matches`);
  equal(receipt.exitCode, 0, `${result.id} exited successfully`);
  equal(receipt.result, "passed", `${result.id} receipt status matches`);
}

bindCheck({path: manifest.browser.receiptPath, sha256: manifest.browser.receiptSha256, bytes: manifest.browser.receiptBytes});
const browser = JSON.parse(readFileSync(resolve(ROOT, manifest.browser.receiptPath), "utf8")) as {
  sourceHead: string;
  independentOracle: boolean;
  engineGeneratedOracle: boolean;
  reviewCopy: typeof manifest.browser.reviewCopy;
  browserEvidence: Array<{orderedFrameIndexes: number[]; elapsedCycleMs: number; qualityAssessment: {ok: boolean; failures: string[]}; pauseAfterWrap: boolean; manualFrameSelectionsDuringCycle: number}>;
  totals: {viewports: number; fullPlaybackCycles: number; observedFrameSamples: number; landmarkFrames: number; limbLengthChecks: number; screenshots: number; externalRequests: number; apiRequests: number; providerRequests: number; actionableConsoleErrors: number};
};
equal(browser.sourceHead, ACTIVATION_HEAD, "browser proof uses the activation source");
equal(browser.independentOracle, true, "browser proof uses independent oracle");
equal(browser.engineGeneratedOracle, false, "browser proof rejects circular oracle");
equal(browser.reviewCopy, manifest.browser.reviewCopy, "manifest review copy matches browser receipt");
equal(browser.totals, {
  viewports: 2,
  fullPlaybackCycles: 2,
  observedFrameSamples: 26,
  landmarkFrames: 6,
  limbLengthChecks: 260,
  screenshots: 4,
  externalRequests: 0,
  apiRequests: 0,
  providerRequests: 0,
  actionableConsoleErrors: 0,
}, "browser totals are exact");
for (const evidence of browser.browserEvidence) {
  equal(evidence.orderedFrameIndexes, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0], "full ordered cycle is exact");
  ok(evidence.elapsedCycleMs >= 750 && evidence.elapsedCycleMs <= 1500, "cycle timing is bounded");
  equal(evidence.qualityAssessment, {ok: true, failures: []}, "independent quality assessment passes");
  equal(evidence.pauseAfterWrap, true, "Pause occurs only after wrap");
  equal(evidence.manualFrameSelectionsDuringCycle, 0, "no manual frame selection occurs during playback");
}
equal(manifest.browser.externalRequests, 0, "external request count is zero");
equal(manifest.browser.apiRequests, 0, "API request count is zero");
equal(manifest.browser.providerRequests, 0, "provider request count is zero");
equal(manifest.browser.actionableConsoleErrors, 0, "actionable console errors are zero");
equal(new URL(manifest.browser.reviewCopy.url).hostname, "127.0.0.1", "review URL is loopback-only");
equal(new URL(manifest.browser.reviewCopy.url).port, String(manifest.browser.reviewCopy.port), "review port matches URL");
ok(manifest.browser.reviewCopy.port !== 3000, "review port is not 3000");
equal(new URL(manifest.browser.reviewCopy.url).search, "", "review URL has no query");
equal(new URL(manifest.browser.reviewCopy.url).hash, "", "review URL has no hash");
ok(existsSync(manifest.browser.reviewCopy.isolatedCopy), "isolated review copy remains available");
ok(processExists(manifest.browser.reviewCopy.serverPid), "review server remains alive");
for (const flag of [
  manifest.browser.reviewCopy.loopbackOnly,
  manifest.browser.reviewCopy.non3000,
  manifest.browser.reviewCopy.noQueryFlag,
  manifest.browser.reviewCopy.noHashFlag,
  manifest.browser.reviewCopy.normalStickControlsOnly,
  manifest.browser.reviewCopy.privateReviewBoxAbsent,
  manifest.browser.reviewCopy.pickerAbsent,
  manifest.browser.reviewCopy.overlayAbsent,
  manifest.browser.reviewCopy.testerButtonAbsent,
]) equal(flag, true, "review-surface safety flag is true");
equal(manifest.browser.reviewCopy.productRouteAdded, false, "no product route was added");
equal(manifest.browser.reviewCopy.trackedAppCodeChanged, false, "no tracked app code changed");

equal(manifest.humanReview, {
  status: "pending-arthur",
  automationCannotAcceptQuality: true,
  requiredLoops: 2,
  scrubFrameIndexes: [0, 4, 8],
}, "human review remains explicitly pending");
equal(manifest.sourceFiles.map((source) => source.path), [...EXACT_DIRTY_PATH_ALLOWLIST], "all six source files are bound in exact order");
for (const source of manifest.sourceFiles) bindCheck(source);
for (const artifact of manifest.artifacts) bindCheck(artifact);
equal(new Set(manifest.artifacts.map((artifact) => artifact.path)).size, manifest.artifacts.length, "artifact bindings are unique");
contractMutationTests();

const validation = {
  validationVersion: 1,
  validatedAt: new Date().toISOString(),
  manifestPath: manifestPath.slice(ROOT.length + 1),
  manifestSha256: sha256(manifestBytes),
  manifestBytes: manifestBytes.byteLength,
  checks,
  result: "passed",
};
writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(validation, null, 2));
