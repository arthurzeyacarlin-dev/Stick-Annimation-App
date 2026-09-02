import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {relative, resolve, sep} from "node:path";

const ROOT = process.cwd();
const ACTIVATION_HEAD = "70bf7b0799bcff8d703525bcb50c378b8a122ebf";
const OUTPUT_ROOT = resolve(ROOT, "output/spec-0004/phase-2");
const TECHNICAL_ROOT = resolve(OUTPUT_ROOT, "technical");
const BROWSER_RECEIPT_PATH = "output/spec-0004/phase-2/browser/browser-proof.json";
const MANIFEST_PATH = resolve(OUTPUT_ROOT, "proof-manifest.json");
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

type CommandReceipt = {
  receiptVersion: 1;
  id: string;
  command: string[];
  cwd: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  result: "passed" | "accepted-identical-baseline";
  details: Record<string, unknown>;
};

const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git = (args: string[]) => {
  const result = spawnSync("git", args, {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};
const listed = (value: string) => value.split("\n").filter(Boolean);
const dirtyPaths = () => [...new Set([
  ...listed(git(["diff", "--name-only"])),
  ...listed(git(["ls-files", "--others", "--exclude-standard"])),
])].sort();
const safeRelative = (absolute: string) => {
  const local = relative(ROOT, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Proof path escapes repository: ${absolute}`);
  return local;
};
const bind = (path: string) => {
  const absolute = resolve(ROOT, path);
  const bytes = readFileSync(absolute);
  return {path, sha256: sha256(bytes), bytes: statSync(absolute).size};
};
const writeReceipt = (receipt: CommandReceipt) => {
  const path = resolve(TECHNICAL_ROOT, `${receipt.id}.json`);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return bind(safeRelative(path));
};

const runCommand = (
  id: string,
  command: string,
  args: string[],
  options: {
    cwd?: string;
    accept?: (result: {exitCode: number; stdout: string; stderr: string}) => {result: CommandReceipt["result"]; details: Record<string, unknown>};
  } = {},
) => {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const execution = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: {...process.env, NEXT_TELEMETRY_DISABLED: "1"},
    maxBuffer: 256 * 1024 * 1024,
  });
  if (execution.error) throw execution.error;
  const exitCode = execution.status ?? -1;
  const stdout = execution.stdout ?? "";
  const stderr = execution.stderr ?? "";
  const accepted = options.accept
    ? options.accept({exitCode, stdout, stderr})
    : (() => {
        assert.equal(exitCode, 0, `${id} failed:\n${stdout}\n${stderr}`);
        return {result: "passed" as const, details: {}};
      })();
  const finished = Date.now();
  const receipt: CommandReceipt = {
    receiptVersion: 1,
    id,
    command: [command, ...args],
    cwd: options.cwd ?? ROOT,
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    exitCode,
    stdout,
    stderr,
    result: accepted.result,
    details: accepted.details,
  };
  return {receipt, binding: writeReceipt(receipt)};
};

const runPermanentBrowserRegression = () => {
  const container = mkdtempSync(resolve(tmpdir(), "diamond-spec0004-phase2-permanent-tester-"));
  const clone = resolve(container, "clean-base");
  try {
    const cloneResult = spawnSync("git", ["clone", "--no-hardlinks", "--quiet", ROOT, clone], {
      cwd: container,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(cloneResult.status, 0, `temporary clean clone failed: ${cloneResult.stderr}`);
    assert.equal(
      spawnSync("git", ["rev-parse", "HEAD"], {cwd: clone, encoding: "utf8"}).stdout.trim(),
      ACTIVATION_HEAD,
      "permanent tester clone must use the exact Phase 2 activation base",
    );
    const dependencySource = resolve(ROOT, "node_modules");
    const dependencyOverlay = resolve(clone, "node_modules");
    mkdirSync(dependencyOverlay);
    for (const entry of readdirSync(dependencySource).sort()) {
      const source = resolve(dependencySource, entry);
      const target = resolve(dependencyOverlay, entry);
      if (entry === "next") {
        cpSync(realpathSync(source), target, {recursive: true});
      } else {
        symlinkSync(realpathSync(source), target);
      }
    }
    const result = runCommand(
      "permanent-browser-regression",
      process.execPath,
      ["--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", `--run-base=${ACTIVATION_HEAD}`],
      {cwd: clone},
    );
    const testerResultPath = resolve(clone, "output/spec-0001/phase-1.5/browser/result.json");
    assert.ok(existsSync(testerResultPath), "permanent browser tester result is missing");
    const testerResultBytes = readFileSync(testerResultPath);
    const testerResult = JSON.parse(testerResultBytes.toString("utf8")) as Record<string, unknown>;
    result.receipt.details = {
      ...result.receipt.details,
      executionSource: "clean temporary clone of the exact activation base",
      currentPhase2RuntimeCoverage: "current modified runtime is covered by the separate Phase 2 browser receipt; protected untouched Home/Drawing/Stick/Creator paths are covered here",
      testerResultSha256: sha256(testerResultBytes),
      testerResultBytes: testerResultBytes.byteLength,
      testerResult,
      temporaryCloneRemoved: true,
    };
    result.binding = writeReceipt(result.receipt);
    return result;
  } finally {
    if (existsSync(container) && container.startsWith(resolve(tmpdir(), "diamond-spec0004-phase2-permanent-tester-"))) {
      rmSync(container, {recursive: true, force: true});
    }
  }
};

const main = async () => {
  assert.equal(git(["rev-parse", "HEAD"]), ACTIVATION_HEAD, "Phase 2 proof must run at the exact activation HEAD");
  assert.equal(git(["diff", "--cached", "--name-only"]), "", "Git index must be empty before proof recording");
  assert.deepEqual(dirtyPaths(), [...EXACT_DIRTY_PATH_ALLOWLIST], "exact Phase 2 dirty path allowlist must be present before proof recording");
  assert.equal(git(["diff", "--check"]), "", "tracked diff must pass whitespace validation before proof recording");
  assert.ok(existsSync(resolve(ROOT, BROWSER_RECEIPT_PATH)), "run the Phase 2 browser proof before recording the manifest");

  if (existsSync(TECHNICAL_ROOT)) rmSync(TECHNICAL_ROOT, {recursive: true, force: true});
  mkdirSync(TECHNICAL_ROOT, {recursive: true});
  const results: Array<ReturnType<typeof runCommand>> = [];

  const motion = runCommand("motion-engine-validator", process.execPath, [
    "--experimental-strip-types",
    "scripts/validateStickFigureMotionEngine.ts",
  ]);
  results.push(motion);
  const motionJsonStart = motion.receipt.stdout.indexOf("{");
  assert.ok(motionJsonStart >= 0, "motion validator JSON result is missing");
  const motionResult = JSON.parse(motion.receipt.stdout.slice(motionJsonStart)) as {
    assertionCount: number;
    validFixtures: string[];
    invalidCases: string[];
    externalRequests: number;
    apiRequests: number;
    providerRequests: number;
  };
  assert.equal(motionResult.assertionCount, 1734, "motion validator assertion count is exact");
  assert.deepEqual(motionResult.validFixtures, ["wave", "jump", "bow", "dodge"], "motion validator covers exact fixed plan set");
  assert.equal(motionResult.invalidCases.length, 20, "motion validator rejection matrix is complete");
  assert.deepEqual(
    [motionResult.externalRequests, motionResult.apiRequests, motionResult.providerRequests],
    [0, 0, 0],
    "motion validator makes zero network/provider requests",
  );

  for (const [id, path] of [
    ["phase1-command-transaction-regression", "scripts/validateStickFigureCommandTransaction.ts"],
    ["phase1-ai-contract-regression", "scripts/validateStickFigureAiContracts.ts"],
    ["phase1-ui-adapter-regression", "scripts/validateStickFigureAiUiAdapter.ts"],
    ["stick-history-persistence-regression", "scripts/validateStickHistoryPersistence.ts"],
    ["stick-pose-timeline-regression", "scripts/validateStickPoseTimeline.ts"],
  ] as const) {
    results.push(runCommand(id, process.execPath, ["--experimental-strip-types", path]));
  }

  results.push(runCommand("typescript", resolve(ROOT, "node_modules/.bin/tsc"), ["--noEmit", "--incremental", "false"]));
  results.push(runCommand("focused-lint", resolve(ROOT, "node_modules/.bin/eslint"), [
    "src/lib/ai/stickFigureMotionEngine.ts",
    "src/lib/ai/stickFigureCommandExecutor.ts",
    "scripts/validateStickFigureMotionEngine.ts",
    "scripts/spec0004-stick/phase2BrowserProof.ts",
    "scripts/spec0004-stick/recordPhase2Proof.ts",
    "scripts/spec0004-stick/validatePhase2Proof.ts",
  ]));
  results.push(runCommand("full-lint-non-regression", "npm", ["run", "lint"], {
    accept: ({exitCode, stdout, stderr}) => {
      const combined = `${stdout}\n${stderr}`;
      const match = /✖\s+77 problems \(5 errors, 72 warnings\)/.exec(combined);
      assert.equal(exitCode, 1, "full lint must retain the accepted nonzero historical baseline");
      assert.ok(match, `full lint must remain at the exact accepted 5-error/72-warning baseline:\n${combined}`);
      for (const path of EXACT_DIRTY_PATH_ALLOWLIST.filter((value) => /\.[cm]?[jt]sx?$/.test(value))) {
        assert.ok(!combined.includes(resolve(ROOT, path)), `full lint reports a new Phase 2 finding in ${path}`);
      }
      return {
        result: "accepted-identical-baseline",
        details: {errors: 5, warnings: 72, total: 77, phase2Findings: 0},
      };
    },
  }));
  results.push(runPermanentBrowserRegression());

  assert.equal(git(["rev-parse", "HEAD"]), ACTIVATION_HEAD, "technical verification must not move HEAD");
  assert.equal(git(["diff", "--cached", "--name-only"]), "", "technical verification must leave the index empty");
  assert.deepEqual(dirtyPaths(), [...EXACT_DIRTY_PATH_ALLOWLIST], "technical verification must preserve the exact dirty allowlist");
  assert.equal(git(["diff", "--check"]), "", "tracked diff passes final whitespace validation");

  const browserBytes = readFileSync(resolve(ROOT, BROWSER_RECEIPT_PATH));
  const browser = JSON.parse(browserBytes.toString("utf8")) as {
    receiptVersion: 2;
    sourceHead: string;
    reviewCopies: Array<{
      fixture: FixtureName;
      url: string;
      serverPid: number;
      noQueryFlag: boolean;
      permanentProductRouteAdded: boolean;
      permanentProductImportAdded: boolean;
      publicReviewAssetAdded: boolean;
      visibleTesterUiAdded: boolean;
    }>;
    browserEvidence: Array<{
      fixture: FixtureName;
      frameCount: number;
      keyframeCount: number;
      flows: string[];
      screenshots: Array<{path: string; sha256: string; bytes: number}>;
      network: {externalRequests: number; apiRequests: number; providerRequests: number};
    }>;
    totals: {fixtures: number; viewports: number; flows: number; screenshots: number; externalRequests: number; apiRequests: number; providerRequests: number};
    visibleReviewContract: Record<string, boolean>;
  };
  assert.equal(browser.sourceHead, ACTIVATION_HEAD, "browser proof source HEAD is exact");
  assert.deepEqual(browser.reviewCopies.map((entry) => entry.fixture), ["wave", "jump", "bow", "dodge"], "browser proof has exact four review copies");
  assert.deepEqual(
    [browser.totals.externalRequests, browser.totals.apiRequests, browser.totals.providerRequests],
    [0, 0, 0],
    "browser proof makes zero external/API/provider requests",
  );
  assert.ok(Object.values(browser.visibleReviewContract).every(Boolean), "browser proof records the complete invisible-helper contract");
  for (const review of browser.reviewCopies) {
    assert.ok(Number.isSafeInteger(review.serverPid) && review.serverPid > 0, `${review.fixture} review PID is valid`);
    process.kill(review.serverPid, 0);
    const url = new URL(review.url);
    assert.equal(url.hostname, "127.0.0.1", `${review.fixture} review is loopback-only`);
    assert.ok(url.port !== "" && url.port !== "3000", `${review.fixture} review uses an explicit non-3000 port`);
    assert.equal(url.search, "", `${review.fixture} review has no query flag`);
    assert.equal(review.noQueryFlag, true, `${review.fixture} receipt records no query flag`);
    assert.equal(review.permanentProductRouteAdded, false, `${review.fixture} adds no product route`);
    assert.equal(review.permanentProductImportAdded, false, `${review.fixture} adds no product import`);
    assert.equal(review.publicReviewAssetAdded, false, `${review.fixture} adds no public review asset`);
    assert.equal(review.visibleTesterUiAdded, false, `${review.fixture} adds no visible tester UI`);
    const response = await fetch(review.url);
    assert.equal(response.ok, true, `${review.fixture} review copy responds during manifest recording`);
  }

  const screenshotBindings = browser.browserEvidence.flatMap((entry) => entry.screenshots.map((screenshot) => {
    const binding = bind(screenshot.path);
    assert.deepEqual(binding, screenshot, `${screenshot.path} browser binding is exact`);
    return binding;
  }));
  const browserBinding = bind(BROWSER_RECEIPT_PATH);
  const artifacts = [
    browserBinding,
    ...screenshotBindings,
    ...results.map((result) => result.binding),
  ].sort((left, right) => left.path.localeCompare(right.path));
  assert.equal(new Set(artifacts.map((artifact) => artifact.path)).size, artifacts.length, "proof artifact paths are unique");

  const manifest = {
    manifestVersion: 2,
    phase: "SPEC-0004 Phase 2 — Deterministic Local Pose and Smooth Motion Engine",
    generatedAt: new Date().toISOString(),
    activation: {
      head: ACTIVATION_HEAD,
      localMain: git(["rev-parse", "main"]),
      indexEmpty: true,
      detachedHead: git(["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD",
    },
    scope: {
      exactDirtyPathAllowlist: [...EXACT_DIRTY_PATH_ALLOWLIST],
      outsideAllowlistPaths: [],
      docsChanged: false,
      packageConfigEnvironmentChanged: false,
      stagedPaths: [],
      trackedPathCount: EXACT_DIRTY_PATH_ALLOWLIST.length,
    },
    counts: {
      unitAssertions: motionResult.assertionCount,
      validFixturePlans: motionResult.validFixtures.length,
      invalidRejectionCases: motionResult.invalidCases.length,
      technicalTestReceipts: results.length,
      browserFixtures: browser.totals.fixtures,
      browserViewports: browser.totals.viewports,
      browserFlows: browser.totals.flows,
      browserScreenshots: browser.totals.screenshots,
      proofArtifacts: artifacts.length,
    },
    deterministicMotion: {
      materializer: "phase-2-baked-motion",
      normalChatConnected: false,
      defaultPhase1RouteChanged: false,
      fixedPlans: motionResult.validFixtures,
      everyOutputCell: "ordinary-independent-keyframe",
      easing: "3u^2-2u^3",
      shortestTurn: true,
      outputJointCount: 11,
      outputSegmentCount: 10,
      hiddenMotionData: false,
    },
    testResults: results.map((result) => ({
      id: result.receipt.id,
      status: result.receipt.result,
      receiptPath: result.binding.path,
      receiptSha256: result.binding.sha256,
      receiptBytes: result.binding.bytes,
    })),
    browser: {
      receiptPath: browserBinding.path,
      receiptSha256: browserBinding.sha256,
      receiptBytes: browserBinding.bytes,
      reviewCopies: browser.reviewCopies,
      fixtureCount: browser.totals.fixtures,
      externalRequests: browser.totals.externalRequests,
      apiRequests: browser.totals.apiRequests,
      providerRequests: browser.totals.providerRequests,
      visibleReviewContract: browser.visibleReviewContract,
    },
    artifacts,
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(MANIFEST_PATH, bytes);
  console.log(`SPEC-0004 Phase 2 technical proof manifest recorded (${results.length} technical receipts, ${artifacts.length} bound artifacts).`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Manifest SHA-256: ${sha256(bytes)}`);
};

type FixtureName = "wave" | "jump" | "bow" | "dodge";

await main();
