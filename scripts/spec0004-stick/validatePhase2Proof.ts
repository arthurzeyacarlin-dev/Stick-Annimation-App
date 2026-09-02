import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync, statSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

const ROOT = process.cwd();
const ACTIVATION_HEAD = "70bf7b0799bcff8d703525bcb50c378b8a122ebf";
const EXACT_DIRTY_PATH_ALLOWLIST = [
  "scripts/fixtures/spec0004-stick/v2/browser-viewports.json",
  "scripts/fixtures/spec0004-stick/v2/phase2-motion-cases.json",
  "scripts/spec0004-stick/phase2BrowserProof.ts",
  "scripts/spec0004-stick/recordPhase2Proof.ts",
  "scripts/spec0004-stick/validatePhase2Proof.ts",
  "scripts/validateStickFigureMotionEngine.ts",
  "src/lib/ai/stickFigureCommandExecutor.ts",
  "src/lib/ai/stickFigureMotionEngine.ts",
] as const;
const manifestArgument = process.argv.indexOf("--manifest");
const manifestPath = resolve(ROOT, manifestArgument >= 0 && process.argv[manifestArgument + 1]
  ? process.argv[manifestArgument + 1]
  : "output/spec-0004/phase-2/proof-manifest.json");
const validationPath = resolve(dirname(manifestPath), "proof-manifest-validation.json");
const manifestBytes = readFileSync(manifestPath);
const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  manifestVersion: number;
  phase: string;
  activation: {head: string; localMain: string; indexEmpty: boolean; detachedHead: boolean};
  scope: {
    exactDirtyPathAllowlist: string[];
    outsideAllowlistPaths: string[];
    docsChanged: boolean;
    packageConfigEnvironmentChanged: boolean;
    stagedPaths: string[];
    trackedPathCount: number;
  };
  counts: {
    unitAssertions: number;
    validFixturePlans: number;
    invalidRejectionCases: number;
    technicalTestReceipts: number;
    browserFixtures: number;
    browserViewports: number;
    browserFlows: number;
    browserScreenshots: number;
    proofArtifacts: number;
  };
  deterministicMotion: {
    materializer: string;
    normalChatConnected: boolean;
    defaultPhase1RouteChanged: boolean;
    fixedPlans: string[];
    everyOutputCell: string;
    easing: string;
    shortestTurn: boolean;
    outputJointCount: number;
    outputSegmentCount: number;
    hiddenMotionData: boolean;
  };
  testResults: Array<{
    id: string;
    status: string;
    receiptPath: string;
    receiptSha256: string;
    receiptBytes: number;
  }>;
  browser: {
    receiptPath: string;
    receiptSha256: string;
    receiptBytes: number;
    reviewCopies: Array<{
      fixture: string;
      url: string;
      serverPid: number;
      noQueryFlag: boolean;
      permanentProductRouteAdded: boolean;
      permanentProductImportAdded: boolean;
      publicReviewAssetAdded: boolean;
      visibleTesterUiAdded: boolean;
    }>;
    fixtureCount: number;
    externalRequests: number;
    apiRequests: number;
    providerRequests: number;
    visibleReviewContract: Record<string, boolean>;
  };
  artifacts: Array<{path: string; sha256: string; bytes: number}>;
};

let checks = 0;
const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const ok = (value: unknown, message: string) => {
  assert.ok(value, message);
  checks += 1;
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
  equal(sha256(bytes), binding.sha256, `${binding.path} SHA matches`);
  equal(statSync(path).size, binding.bytes, `${binding.path} size matches`);
};

equal(manifest.manifestVersion, 2, "manifest version is exact");
equal(manifest.phase, "SPEC-0004 Phase 2 — Deterministic Local Pose and Smooth Motion Engine", "manifest phase is exact");
equal(manifest.activation.head, ACTIVATION_HEAD, "activation HEAD is exact");
equal(manifest.activation.localMain, ACTIVATION_HEAD, "local main remains at the activation HEAD");
equal(manifest.activation.indexEmpty, true, "manifest records an empty index");
equal(manifest.activation.detachedHead, true, "manifest records detached phase worktree HEAD");
equal(manifest.scope.exactDirtyPathAllowlist, [...EXACT_DIRTY_PATH_ALLOWLIST], "manifest exact dirty allowlist is fixed");
equal(manifest.scope.trackedPathCount, 8, "tracked path ceiling is exact");
equal(manifest.scope.outsideAllowlistPaths, [], "manifest records no outside-allowlist path");
equal(manifest.scope.docsChanged, false, "manifest records no docs mutation");
equal(manifest.scope.packageConfigEnvironmentChanged, false, "manifest records no package/config/environment mutation");
equal(manifest.scope.stagedPaths, [], "manifest records no staged path");

equal(manifest.counts.unitAssertions, 1734, "complete deterministic assertion count is exact");
equal(manifest.counts.validFixturePlans, 4, "all four fixed plans are proven");
equal(manifest.counts.invalidRejectionCases, 20, "complete motion rejection matrix is proven");
equal(manifest.counts.technicalTestReceipts, manifest.testResults.length, "technical receipt count is self-consistent");
ok(manifest.counts.technicalTestReceipts >= 10, "focused, TypeScript, lint, and permanent-browser receipts are present");
equal(manifest.counts.browserFixtures, 4, "browser proof covers four fixtures");
equal(manifest.counts.browserViewports, 2, "browser proof covers both frozen viewports");
equal(manifest.counts.browserFlows, 40, "browser proof covers ten required flows for each fixture");
equal(manifest.counts.browserScreenshots, 8, "browser proof includes normal preview and applied screenshots for each fixture");
equal(manifest.counts.proofArtifacts, manifest.artifacts.length, "artifact count is self-consistent");

equal(manifest.deterministicMotion, {
  materializer: "phase-2-baked-motion",
  normalChatConnected: false,
  defaultPhase1RouteChanged: false,
  fixedPlans: ["wave", "jump", "bow", "dodge"],
  everyOutputCell: "ordinary-independent-keyframe",
  easing: "3u^2-2u^3",
  shortestTurn: true,
  outputJointCount: 11,
  outputSegmentCount: 10,
  hiddenMotionData: false,
}, "manifest records the exact Phase 2 engine contract");

const expectedReceiptIds = [
  "motion-engine-validator",
  "phase1-command-transaction-regression",
  "phase1-ai-contract-regression",
  "phase1-ui-adapter-regression",
  "stick-history-persistence-regression",
  "stick-pose-timeline-regression",
  "typescript",
  "focused-lint",
  "full-lint-non-regression",
  "permanent-browser-regression",
];
equal(manifest.testResults.map((result) => result.id), expectedReceiptIds, "technical receipts are exact and ordered");
for (const result of manifest.testResults) {
  ok(result.status === "passed" || result.status === "accepted-identical-baseline", `${result.id} has an accepted status`);
  bindCheck({path: result.receiptPath, sha256: result.receiptSha256, bytes: result.receiptBytes});
  const receipt = JSON.parse(readFileSync(resolve(ROOT, result.receiptPath), "utf8")) as {
    id: string;
    exitCode: number;
    result: string;
    details: Record<string, unknown>;
  };
  equal(receipt.id, result.id, `${result.id} receipt identity matches`);
  equal(receipt.result, result.status, `${result.id} receipt status matches`);
  if (result.id === "full-lint-non-regression") {
    equal(receipt.exitCode, 1, "full lint retains the known nonzero baseline");
    equal(receipt.details, {errors: 5, warnings: 72, total: 77, phase2Findings: 0}, "full lint baseline is exact with zero Phase 2 findings");
  } else {
    equal(receipt.exitCode, 0, `${result.id} exits successfully`);
  }
  if (result.id === "permanent-browser-regression") {
    equal(receipt.details.temporaryCloneRemoved, true, "permanent tester temporary clone cleanup is recorded");
    equal(receipt.details.executionSource, "clean temporary clone of the exact activation base", "permanent tester base is explicit");
    ok(typeof receipt.details.testerResultSha256 === "string", "permanent tester result digest is recorded");
  }
}

for (const artifact of manifest.artifacts) bindCheck(artifact);
equal(new Set(manifest.artifacts.map((artifact) => artifact.path)).size, manifest.artifacts.length, "artifact paths are unique");
equal(manifest.browser.fixtureCount, 4, "browser receipt covers exact fixture count");
equal(manifest.browser.externalRequests, 0, "browser proof has zero external requests");
equal(manifest.browser.apiRequests, 0, "browser proof has zero API requests");
equal(manifest.browser.providerRequests, 0, "browser proof has zero provider requests");
ok(Object.values(manifest.browser.visibleReviewContract).every(Boolean), "all invisible-helper review guarantees are true");
bindCheck({path: manifest.browser.receiptPath, sha256: manifest.browser.receiptSha256, bytes: manifest.browser.receiptBytes});

const browser = JSON.parse(readFileSync(resolve(ROOT, manifest.browser.receiptPath), "utf8")) as {
  sourceHead: string;
  reviewCopies: typeof manifest.browser.reviewCopies;
  browserEvidence: Array<{
    fixture: string;
    frameCount: number;
    keyframeCount: number;
    manualDifference: {frameIndex: number; jointIndex: number};
    flows: string[];
    network: {totalRequests: number; loopbackRequests: number; externalRequests: number; apiRequests: number; providerRequests: number};
  }>;
  totals: {fixtures: number; viewports: number; flows: number; screenshots: number; externalRequests: number; apiRequests: number; providerRequests: number};
  visibleReviewContract: Record<string, boolean>;
};
equal(browser.sourceHead, ACTIVATION_HEAD, "browser source HEAD is exact");
equal(browser.reviewCopies, manifest.browser.reviewCopies, "manifest review copies exactly match browser receipt");
equal(browser.visibleReviewContract, manifest.browser.visibleReviewContract, "visible review contract matches browser receipt");
equal(browser.totals, {
  fixtures: 4,
  viewports: 2,
  flows: 40,
  screenshots: 8,
  externalRequests: 0,
  apiRequests: 0,
  providerRequests: 0,
}, "browser totals are exact");
equal(browser.browserEvidence.map((entry) => entry.fixture), ["wave", "jump", "bow", "dodge"], "browser evidence has exact fixed plan order");
for (const evidence of browser.browserEvidence) {
  equal([evidence.frameCount, evidence.keyframeCount], [12, 12], `${evidence.fixture} visibly has twelve ordinary keyframes`);
  equal(evidence.manualDifference, {frameIndex: 2, jointIndex: 0}, `${evidence.fixture} changes exactly one in-between joint manually`);
  equal(evidence.network, {totalRequests: evidence.network.totalRequests, loopbackRequests: evidence.network.loopbackRequests, externalRequests: 0, apiRequests: 0, providerRequests: 0}, `${evidence.fixture} network ledger is local-only`);
  equal(evidence.flows.length, 10, `${evidence.fixture} completes all ten required browser flows`);
}

for (const review of manifest.browser.reviewCopies) {
  const url = new URL(review.url);
  equal(url.hostname, "127.0.0.1", `${review.fixture} review URL is loopback-only`);
  ok(url.port !== "" && url.port !== "3000", `${review.fixture} review URL is non-3000`);
  equal(url.search, "", `${review.fixture} review URL has no query flag`);
  equal(review.noQueryFlag, true, `${review.fixture} review receipt records no query flag`);
  equal(review.permanentProductRouteAdded, false, `${review.fixture} review adds no product route`);
  equal(review.permanentProductImportAdded, false, `${review.fixture} review adds no product import`);
  equal(review.publicReviewAssetAdded, false, `${review.fixture} review adds no public asset`);
  equal(review.visibleTesterUiAdded, false, `${review.fixture} review adds no visible tester UI`);
  process.kill(review.serverPid, 0);
  checks += 1;
  const response = await fetch(review.url);
  equal(response.ok, true, `${review.fixture} review copy responds during independent validation`);
  const html = await response.text();
  ok(!/PRIVATE REVIEW|__spec0004_review|spec0004-review\.js/i.test(html), `${review.fixture} returned HTML contains no former review overlay or query helper`);
}

equal(git(["rev-parse", "HEAD"]), ACTIVATION_HEAD, "live HEAD matches manifest activation");
equal(git(["rev-parse", "main"]), ACTIVATION_HEAD, "live local main remains at activation");
equal(git(["rev-parse", "--abbrev-ref", "HEAD"]), "HEAD", "live worktree remains detached");
equal(git(["diff", "--cached", "--name-only"]), "", "live index is empty");
const changed = listed(git(["diff", "--name-only"]));
const untracked = listed(git(["ls-files", "--others", "--exclude-standard"]));
equal([...new Set([...changed, ...untracked])].sort(), [...EXACT_DIRTY_PATH_ALLOWLIST], "live dirty paths exactly match allowlist");
equal(git(["diff", "--check"]), "", "live diff passes whitespace validation");
equal(changed.filter((path) => path.startsWith("docs/") || path === "AGENTS.md" || path === "project/project_structure.txt"), [], "canonical control plane is untouched");
equal(changed.filter((path) => /^(?:package(?:-lock)?\.json|next\.config|tsconfig|eslint\.config|\.env)/.test(path)), [], "package/config/environment files are untouched");

const executorSource = readFileSync(resolve(ROOT, "src/lib/ai/stickFigureCommandExecutor.ts"), "utf8");
const engineSource = readFileSync(resolve(ROOT, "src/lib/ai/stickFigureMotionEngine.ts"), "utf8");
ok(executorSource.includes('options.animationPlanMaterializer ?? "phase-1-holds"'), "executor constructor preserves Phase 1 as the default route");
ok(executorSource.includes("STICK_PHASE2_MOTION_MATERIALIZER"), "executor exposes the separately named Phase 2 transaction option");
ok(!/fetch\(|XMLHttpRequest|openai|anthropic|provider|apiKey/i.test(engineSource), "motion engine contains no external/API/provider path");

const validation = {
  receiptVersion: 2,
  phase: manifest.phase,
  validatedAt: new Date().toISOString(),
  manifestPath: manifestPath.slice(ROOT.length + 1),
  manifestSha256: sha256(manifestBytes),
  manifestBytes: manifestBytes.byteLength,
  artifactCount: manifest.artifacts.length,
  technicalReceiptCount: manifest.testResults.length,
  independentChecks: checks,
  exactDirtyPathAllowlist: [...EXACT_DIRTY_PATH_ALLOWLIST],
  result: "passed",
};
writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
console.log(`SPEC-0004 Phase 2 proof manifest validation passed (${checks} checks).`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Manifest SHA-256: ${validation.manifestSha256}`);
console.log(`Manifest bytes: ${validation.manifestBytes}`);
console.log(`Artifacts: ${validation.artifactCount}; technical receipts: ${validation.technicalReceiptCount}.`);
console.log(`Validation receipt: ${validationPath}`);
