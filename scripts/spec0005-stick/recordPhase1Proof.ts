import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {relative, resolve, sep} from "node:path";

const ROOT = process.cwd();
const ACTIVATION_HEAD = "2b4f00e7a122c196b2c0600144cd638b461bbb2f";
const OUTPUT_ROOT = resolve(ROOT, "output/spec-0005/phase-1");
const TECHNICAL_ROOT = resolve(OUTPUT_ROOT, "technical");
const BROWSER_RECEIPT_PATH = "output/spec-0005/phase-1/browser/browser-proof.json";
const MANIFEST_PATH = resolve(OUTPUT_ROOT, "proof-manifest.json");
const EXACT_DIRTY_PATH_ALLOWLIST = [
  "scripts/fixtures/spec0005-stick/v1/playback-quality-review-plan.json",
  "scripts/fixtures/spec0005-stick/v1/quality-baseline-cases.json",
  "scripts/spec0005-stick/phase1BrowserProof.ts",
  "scripts/spec0005-stick/recordPhase1Proof.ts",
  "scripts/spec0005-stick/validatePhase1Proof.ts",
  "scripts/validateStickMotionQualityBaseline.ts",
] as const;
const dependencyRootArgument = process.argv.find((argument) => argument.startsWith("--dependency-root="));
const DEPENDENCY_ROOT = resolve(dependencyRootArgument?.slice("--dependency-root=".length) || resolve(ROOT, "node_modules"));

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
  result: "passed";
  details: Record<string, unknown>;
};

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
const dirtyPaths = () => [...new Set([...listed(git(["diff", "--name-only"])), ...listed(git(["ls-files", "--others", "--exclude-standard"]))])].sort();
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
const runCommand = (id: string, command: string, args: string[], cwd = ROOT, details: Record<string, unknown> = {}) => {
  const started = Date.now();
  const execution = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {...process.env, NEXT_TELEMETRY_DISABLED: "1"},
    maxBuffer: 256 * 1024 * 1024,
  });
  if (execution.error) throw execution.error;
  const exitCode = execution.status ?? -1;
  const stdout = execution.stdout ?? "";
  const stderr = execution.stderr ?? "";
  assert.equal(exitCode, 0, `${id} failed:\n${stdout}\n${stderr}`);
  const finished = Date.now();
  const receipt: CommandReceipt = {
    receiptVersion: 1,
    id,
    command: [command, ...args],
    cwd,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    exitCode,
    stdout,
    stderr,
    result: "passed",
    details,
  };
  return {receipt, binding: writeReceipt(receipt)};
};
const recordInternalCheck = (id: string, stdout: string, details: Record<string, unknown>) => {
  const now = new Date().toISOString();
  const receipt: CommandReceipt = {
    receiptVersion: 1,
    id,
    command: ["internal-exact-git-scope-check"],
    cwd: ROOT,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    exitCode: 0,
    stdout,
    stderr: "",
    result: "passed",
    details,
  };
  return {receipt, binding: writeReceipt(receipt)};
};

const makeResultVerificationCopy = () => {
  const copy = mkdtempSync(resolve(tmpdir(), "diamond-spec0005-phase1-result-check-"));
  cpSync(ROOT, copy, {
    recursive: true,
    filter: (source) => {
      const local = source.slice(ROOT.length).replace(/^\//, "");
      return ![".git", ".next", "node_modules", "output"].includes(local.split("/")[0]);
    },
  });
  symlinkSync(realpathSync(DEPENDENCY_ROOT), resolve(copy, "node_modules"), "dir");
  return copy;
};

const runResultCopyCommand = (id: string, executable: string, args: string[]) => {
  const copy = makeResultVerificationCopy();
  try {
    return runCommand(id, executable, args, copy, {executionSource: "isolated copy of the exact six-path result", temporaryCopyRemoved: true});
  } finally {
    if (existsSync(copy) && copy.startsWith(resolve(tmpdir(), "diamond-spec0005-phase1-result-check-"))) rmSync(copy, {recursive: true, force: true});
  }
};

const runPermanentBrowserRegression = () => {
  const container = mkdtempSync(resolve(tmpdir(), "diamond-spec0005-phase1-permanent-tester-"));
  const clone = resolve(container, "clean-activation");
  try {
    const cloned = spawnSync("git", ["clone", "--no-hardlinks", "--quiet", ROOT, clone], {cwd: container, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
    assert.equal(cloned.status, 0, `permanent tester clone failed: ${cloned.stderr}`);
    assert.equal(spawnSync("git", ["rev-parse", "HEAD"], {cwd: clone, encoding: "utf8"}).stdout.trim(), ACTIVATION_HEAD);
    const overlay = resolve(clone, "node_modules");
    mkdirSync(overlay);
    for (const entry of readdirSync(DEPENDENCY_ROOT).sort()) {
      const source = resolve(DEPENDENCY_ROOT, entry);
      const target = resolve(overlay, entry);
      if (entry === "next") cpSync(realpathSync(source), target, {recursive: true});
      else symlinkSync(realpathSync(source), target);
    }
    const result = runCommand(
      "permanent-browser-regression",
      process.execPath,
      ["--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", `--run-base=${ACTIVATION_HEAD}`],
      clone,
      {executionSource: "clean temporary clone of the exact activation base; Phase 1 changes no runtime", temporaryCloneRemoved: true},
    );
    const testerPath = resolve(clone, "output/spec-0001/phase-1.5/browser/result.json");
    assert.ok(existsSync(testerPath), "permanent tester result is present");
    const testerBytes = readFileSync(testerPath);
    const durableTesterPath = resolve(TECHNICAL_ROOT, "permanent-browser-result.json");
    writeFileSync(durableTesterPath, testerBytes);
    result.receipt.details = {
      ...result.receipt.details,
      testerResultSha256: sha256(testerBytes),
      testerResultBytes: testerBytes.byteLength,
      testerResultPath: safeRelative(durableTesterPath),
      testerResult: JSON.parse(testerBytes.toString("utf8")),
    };
    result.binding = writeReceipt(result.receipt);
    return {result, testerBinding: bind(safeRelative(durableTesterPath))};
  } finally {
    if (existsSync(container) && container.startsWith(resolve(tmpdir(), "diamond-spec0005-phase1-permanent-tester-"))) {
      rmSync(container, {recursive: true, force: true});
    }
  }
};

const main = () => {
  assert.ok(existsSync(resolve(DEPENDENCY_ROOT, "typescript/bin/tsc")), "dependency root contains TypeScript");
  assert.ok(existsSync(resolve(DEPENDENCY_ROOT, "eslint/bin/eslint.js")), "dependency root contains ESLint");
  assert.equal(git(["rev-parse", "HEAD"]), ACTIVATION_HEAD, "proof runs at exact activation HEAD");
  assert.equal(git(["rev-parse", "main"]), ACTIVATION_HEAD, "local main remains exact");
  assert.equal(git(["rev-parse", "origin/main"]), ACTIVATION_HEAD, "origin/main remains exact");
  assert.equal(git(["branch", "--show-current"]), "", "phase worktree remains detached");
  assert.equal(git(["diff", "--cached", "--name-only"]), "", "index is empty");
  assert.deepEqual(dirtyPaths(), [...EXACT_DIRTY_PATH_ALLOWLIST], "exact six-path dirty allowlist is present");
  assert.equal(git(["diff", "--check"]), "", "diff whitespace check passes");
  assert.ok(existsSync(resolve(ROOT, BROWSER_RECEIPT_PATH)), "full-playback browser proof runs before manifest recording");

  if (existsSync(TECHNICAL_ROOT)) rmSync(TECHNICAL_ROOT, {recursive: true, force: true});
  mkdirSync(TECHNICAL_ROOT, {recursive: true});
  const results: Array<{receipt: CommandReceipt; binding: ReturnType<typeof bind>}> = [];
  results.push(runCommand("quality-baseline-and-mutations", process.execPath, ["--experimental-strip-types", "scripts/validateStickMotionQualityBaseline.ts"]));
  results.push(runResultCopyCommand("typescript", process.execPath, [resolve(DEPENDENCY_ROOT, "typescript/bin/tsc"), "--noEmit", "--incremental", "false"]));
  results.push(runResultCopyCommand("scoped-lint", process.execPath, [
    resolve(DEPENDENCY_ROOT, "eslint/bin/eslint.js"),
    "scripts/spec0005-stick/phase1BrowserProof.ts",
    "scripts/spec0005-stick/recordPhase1Proof.ts",
    "scripts/spec0005-stick/validatePhase1Proof.ts",
    "scripts/validateStickMotionQualityBaseline.ts",
  ]));
  results.push(runCommand("proof-validator-mutation-contract", process.execPath, ["--experimental-strip-types", "scripts/spec0005-stick/validatePhase1Proof.ts", "--self-test-contract"]));
  const diffCheck = git(["diff", "--check"]);
  const staged = listed(git(["diff", "--cached", "--name-only"]));
  const observed = dirtyPaths();
  assert.equal(diffCheck, "");
  assert.deepEqual(staged, []);
  assert.deepEqual(observed, [...EXACT_DIRTY_PATH_ALLOWLIST]);
  results.push(recordInternalCheck("git-diff-and-scope", JSON.stringify({diffCheck: "passed", staged, observed}, null, 2), {
    head: ACTIVATION_HEAD,
    localMain: git(["rev-parse", "main"]),
    originMain: git(["rev-parse", "origin/main"]),
    detachedHead: git(["branch", "--show-current"]) === "",
    exactDirtyPaths: observed,
    runtimeChanged: false,
    docsChanged: false,
    packageConfigEnvironmentChanged: false,
  }));
  const permanent = runPermanentBrowserRegression();
  results.push(permanent.result);

  const browserBytes = readFileSync(resolve(ROOT, BROWSER_RECEIPT_PATH));
  const browser = JSON.parse(browserBytes.toString("utf8")) as {
    reviewCopy: Record<string, unknown> & {serverPid: number; isolatedCopy: string};
    totals: {viewports: number; fullPlaybackCycles: number; observedFrameSamples: number; landmarkFrames: number; limbLengthChecks: number; screenshots: number; externalRequests: number; apiRequests: number; providerRequests: number; actionableConsoleErrors: number};
  };
  assert.ok(processExists(browser.reviewCopy.serverPid), "review server remains alive at manifest recording");
  assert.ok(existsSync(browser.reviewCopy.isolatedCopy), "review copy remains available at manifest recording");
  assert.deepEqual({
    externalRequests: browser.totals.externalRequests,
    apiRequests: browser.totals.apiRequests,
    providerRequests: browser.totals.providerRequests,
    actionableConsoleErrors: browser.totals.actionableConsoleErrors,
  }, {externalRequests: 0, apiRequests: 0, providerRequests: 0, actionableConsoleErrors: 0});

  const qualityCatalog = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0005-stick/v1/quality-baseline-cases.json"), "utf8")) as {
    provenance: {acceptedReferenceSources: Array<{path: string; sha256: string; purpose: string}>};
    acceptedWave: {name: string; landmarkFrameIndexes: number[]; unrelatedStableRoles: string[]; segmentRolePairs: unknown[]};
    requiredMutationCases: unknown[];
  };
  const sourceBindings = qualityCatalog.provenance.acceptedReferenceSources.map((source) => ({
    ...source,
    bytes: statSync(resolve(ROOT, source.path)).size,
  }));
  for (const source of sourceBindings) assert.equal(sha256(readFileSync(resolve(ROOT, source.path))), source.sha256);

  const browserArtifacts = [
    BROWSER_RECEIPT_PATH,
    "output/spec-0005/phase-1/browser/review-server.log",
    ...readdirSync(resolve(OUTPUT_ROOT, "browser"))
      .filter((name) => name.endsWith(".png"))
      .sort()
      .map((name) => `output/spec-0005/phase-1/browser/${name}`),
  ];
  const artifacts = [
    ...results.map((result) => result.binding),
    permanent.testerBinding,
    ...browserArtifacts.map(bind),
  ];
  assert.equal(new Set(artifacts.map((artifact) => artifact.path)).size, artifacts.length, "artifact paths are unique");

  const manifest = {
    manifestVersion: 1,
    phase: "SPEC-0005 Phase 1 — Accepted Motion References and Full-Playback Quality Gate",
    status: "technical-pass-human-review-pending",
    generatedAt: new Date().toISOString(),
    activation: {
      head: ACTIVATION_HEAD,
      localMain: git(["rev-parse", "main"]),
      originMain: git(["rev-parse", "origin/main"]),
      detachedHead: git(["branch", "--show-current"]) === "",
      indexEmpty: git(["diff", "--cached", "--name-only"]) === "",
    },
    scope: {
      exactDirtyPathAllowlist: [...EXACT_DIRTY_PATH_ALLOWLIST],
      observedDirtyPaths: dirtyPaths(),
      outsideAllowlistPaths: dirtyPaths().filter((path) => !EXACT_DIRTY_PATH_ALLOWLIST.includes(path as typeof EXACT_DIRTY_PATH_ALLOWLIST[number])),
      trackedPathCount: EXACT_DIRTY_PATH_ALLOWLIST.length,
      runtimeChanged: false,
      currentFixtureChanged: false,
      docsChanged: false,
      packageConfigEnvironmentChanged: false,
      stagedPaths: listed(git(["diff", "--cached", "--name-only"])),
    },
    reference: {
      acceptedName: qualityCatalog.acceptedWave.name,
      independentOracle: true,
      engineGeneratedOracle: false,
      sourceBindings,
      landmarkFrames: qualityCatalog.acceptedWave.landmarkFrameIndexes,
      stableUnrelatedRoles: qualityCatalog.acceptedWave.unrelatedStableRoles,
      segmentCount: qualityCatalog.acceptedWave.segmentRolePairs.length,
    },
    counts: {
      requiredMutationCases: qualityCatalog.requiredMutationCases.length,
      technicalReceipts: results.length,
      proofArtifacts: artifacts.length,
      browserViewports: browser.totals.viewports,
      fullPlaybackCycles: browser.totals.fullPlaybackCycles,
      observedFrameSamples: browser.totals.observedFrameSamples,
      landmarkFrameChecks: browser.totals.landmarkFrames,
      limbLengthChecks: browser.totals.limbLengthChecks,
      screenshots: browser.totals.screenshots,
    },
    testResults: results.map((result) => ({
      id: result.receipt.id,
      status: result.receipt.result,
      receiptPath: result.binding.path,
      receiptSha256: result.binding.sha256,
      receiptBytes: result.binding.bytes,
    })),
    browser: {
      receiptPath: BROWSER_RECEIPT_PATH,
      receiptSha256: sha256(browserBytes),
      receiptBytes: browserBytes.byteLength,
      reviewCopy: browser.reviewCopy,
      externalRequests: browser.totals.externalRequests,
      apiRequests: browser.totals.apiRequests,
      providerRequests: browser.totals.providerRequests,
      actionableConsoleErrors: browser.totals.actionableConsoleErrors,
    },
    humanReview: {
      status: "pending-arthur",
      automationCannotAcceptQuality: true,
      requiredLoops: 2,
      scrubFrameIndexes: [0, 4, 8],
    },
    sourceFiles: EXACT_DIRTY_PATH_ALLOWLIST.map(bind),
    artifacts,
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(MANIFEST_PATH, bytes);
  console.log("SPEC-0005 Phase 1 technical proof manifest recorded.");
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Manifest SHA-256: ${sha256(bytes)}`);
  console.log(`Manifest bytes: ${Buffer.byteLength(bytes)}`);
  console.log(`Review URL: ${String(browser.reviewCopy.url)}`);
};

main();
