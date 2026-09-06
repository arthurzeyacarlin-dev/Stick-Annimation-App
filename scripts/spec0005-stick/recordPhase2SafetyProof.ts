import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {relative, resolve, sep} from "node:path";

const ROOT = process.cwd();
const ACTIVATION_HEAD = "1861db92e8f599afa811b0ab6fdd46cc475f9f1c";
const HISTORICAL_MANIFEST_PATH = resolve(ROOT, "output/spec-0005/phase-2/proof-manifest.json");
const HISTORICAL_MANIFEST_SHA256 = "sha256:ea7ab9c5a142843b109ad49924f4709660347265099740312a666eca07972cd4";
const OUTPUT_ROOT = resolve(ROOT, "output/spec-0005/phase-2/d0047-correction");
const TECHNICAL_ROOT = resolve(OUTPUT_ROOT, "technical");
const REVIEW_ROOT = resolve(OUTPUT_ROOT, "unused-review-server-construction");
const MANIFEST_PATH = resolve(OUTPUT_ROOT, "proof-manifest.json");
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
const dependencyArgument = process.argv.find((argument) => argument.startsWith("--dependency-root="));
const DEPENDENCY_ROOT = resolve(dependencyArgument?.slice("--dependency-root=".length) || resolve(ROOT, "node_modules"));
let retainedReviewProcessGroupId: number | null = null;

type Binding = {path: string; sha256: string; bytes: number};
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
type PermanentBrowserResult = {
  status: string;
  headCommit: string;
  runBaseline: {baselineCommit: string};
  network: {nonLoopbackAttempts: number; realApiRouteRequests: number; policyViolations: unknown[]};
  cleanup: {status: string; openBrowserContexts: number; openServers: number; residualPorts: number; anchorRestored: boolean};
};

const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git = (args: string[], cwd = ROOT) => {
  const result = spawnSync("git", args, {cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
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
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `path escapes worktree: ${absolute}`);
  return local;
};
const bind = (path: string): Binding => {
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
  executable: string,
  args: string[],
  cwd = ROOT,
  details: Record<string, unknown> = {},
) => {
  const started = Date.now();
  const execution = spawnSync(executable, args, {
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
    command: [executable, ...args],
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
const runKnownLintBaseline = (cwd: string) => {
  const started = Date.now();
  const args = [resolve(DEPENDENCY_ROOT, "eslint/bin/eslint.js"), "."];
  const execution = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: {...process.env, NEXT_TELEMETRY_DISABLED: "1"},
    maxBuffer: 256 * 1024 * 1024,
  });
  if (execution.error) throw execution.error;
  const stdout = execution.stdout ?? "";
  const stderr = execution.stderr ?? "";
  assert.equal(execution.status, 1, "full lint must retain its known baseline exit code");
  assert.match(`${stdout}\n${stderr}`, /77 problems \(5 errors, 72 warnings\)/, "full lint baseline must remain exactly 5 errors and 72 warnings");
  for (const path of EXACT_DIRTY_PATH_ALLOWLIST) assert.ok(!`${stdout}\n${stderr}`.includes(resolve(cwd, path)), `full lint introduced a finding in ${path}`);
  const finished = Date.now();
  const receipt: CommandReceipt = {
    receiptVersion: 1,
    id: "full-lint-known-baseline",
    command: [process.execPath, ...args],
    cwd,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - started,
    exitCode: 1,
    stdout,
    stderr,
    result: "passed",
    details: {expectedExistingErrors: 5, expectedExistingWarnings: 72, changedPathFindings: 0},
  };
  return {receipt, binding: writeReceipt(receipt)};
};
const recordInternalCheck = (id: string, details: Record<string, unknown>) => {
  const at = new Date().toISOString();
  const receipt: CommandReceipt = {
    receiptVersion: 1,
    id,
    command: ["internal-exact-git-scope-check"],
    cwd: ROOT,
    startedAt: at,
    finishedAt: at,
    durationMs: 0,
    exitCode: 0,
    stdout: `${JSON.stringify(details, null, 2)}\n`,
    stderr: "",
    result: "passed",
    details,
  };
  return {receipt, binding: writeReceipt(receipt)};
};

const makeResultCopy = () => {
  const copy = mkdtempSync(resolve(tmpdir(), "diamond-spec0005-phase2-result-"));
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
const withResultCopy = <T>(run: (copy: string) => T) => {
  const copy = makeResultCopy();
  try {
    return run(copy);
  } finally {
    if (existsSync(copy) && copy.startsWith(resolve(tmpdir(), "diamond-spec0005-phase2-result-"))) {
      rmSync(copy, {recursive: true, force: true});
    }
  }
};

const runPermanentBrowserRegression = () => {
  const container = mkdtempSync(resolve(tmpdir(), "diamond-spec0005-phase2-permanent-"));
  const clone = resolve(container, "clean-activation");
  try {
    const cloned = spawnSync("git", ["clone", "--no-hardlinks", "--quiet", ROOT, clone], {
      cwd: container,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(cloned.status, 0, `permanent tester clone failed: ${cloned.stderr}`);
    assert.equal(git(["rev-parse", "HEAD"], clone), ACTIVATION_HEAD, "permanent tester clone uses exact activation base");
    assert.equal(git(["status", "--porcelain"], clone), "", "permanent tester clone starts clean");
    const overlay = resolve(clone, "node_modules");
    mkdirSync(overlay);
    for (const entry of readdirSync(DEPENDENCY_ROOT).sort()) {
      const source = resolve(DEPENDENCY_ROOT, entry);
      const target = resolve(overlay, entry);
      if (entry === "next") cpSync(realpathSync(source), target, {recursive: true});
      else symlinkSync(realpathSync(source), target);
    }
    const run = runCommand(
      "permanent-browser-regression",
      process.execPath,
      ["--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", `--run-base=${ACTIVATION_HEAD}`],
      clone,
      {
        executionSource: "clean isolated clone of exact activation base",
        activationBase: ACTIVATION_HEAD,
        dirtyImplementationExcluded: true,
        temporaryCloneRemoved: true,
      },
    );
    const resultPath = resolve(clone, "output/spec-0001/phase-1.5/browser/result.json");
    assert.ok(existsSync(resultPath), "permanent browser result exists");
    const resultBytes = readFileSync(resultPath);
    const durablePath = resolve(TECHNICAL_ROOT, "permanent-browser-result.json");
    writeFileSync(durablePath, resultBytes);
    const parsed = JSON.parse(resultBytes.toString("utf8")) as PermanentBrowserResult;
    assert.equal(parsed.status, "passed");
    assert.equal(parsed.headCommit, ACTIVATION_HEAD);
    assert.equal(parsed.runBaseline.baselineCommit, ACTIVATION_HEAD);
    assert.equal(parsed.network.nonLoopbackAttempts, 0);
    assert.equal(parsed.network.realApiRouteRequests, 0);
    assert.deepEqual(parsed.network.policyViolations, []);
    assert.equal(parsed.cleanup.status, "passed");
    assert.equal(parsed.cleanup.openBrowserContexts, 0);
    assert.equal(parsed.cleanup.openServers, 0);
    assert.equal(parsed.cleanup.residualPorts, 0);
    assert.equal(parsed.cleanup.anchorRestored, true);
    run.receipt.details = {
      ...run.receipt.details,
      resultPath: safeRelative(durablePath),
      resultSha256: sha256(resultBytes),
      resultBytes: resultBytes.byteLength,
      status: parsed.status,
      externalAttempts: parsed.network.nonLoopbackAttempts,
      realApiRouteRequests: parsed.network.realApiRouteRequests,
      cleanupPassed: parsed.cleanup.status === "passed",
    };
    run.binding = writeReceipt(run.receipt);
    return {run, resultBinding: bind(safeRelative(durablePath)), parsed};
  } finally {
    if (existsSync(container) && container.startsWith(resolve(tmpdir(), "diamond-spec0005-phase2-permanent-"))) {
      rmSync(container, {recursive: true, force: true});
    }
  }
};

const restorePermanentBrowserRegression = (saved: {receiptBytes: Buffer; resultBytes: Buffer}) => {
  const receipt = JSON.parse(saved.receiptBytes.toString("utf8")) as CommandReceipt;
  const parsed = JSON.parse(saved.resultBytes.toString("utf8")) as PermanentBrowserResult;
  assert.equal(receipt.id, "permanent-browser-regression");
  assert.equal(receipt.result, "passed");
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.details.activationBase, ACTIVATION_HEAD);
  assert.equal(receipt.details.resultSha256, sha256(saved.resultBytes));
  assert.equal(parsed.status, "passed");
  assert.equal(parsed.headCommit, ACTIVATION_HEAD);
  assert.equal(parsed.runBaseline.baselineCommit, ACTIVATION_HEAD);
  assert.equal(parsed.network.nonLoopbackAttempts, 0);
  assert.equal(parsed.network.realApiRouteRequests, 0);
  assert.deepEqual(parsed.network.policyViolations, []);
  assert.equal(parsed.cleanup.status, "passed");
  const resultPath = resolve(TECHNICAL_ROOT, "permanent-browser-result.json");
  writeFileSync(resultPath, saved.resultBytes);
  const run = {receipt, binding: writeReceipt(receipt)};
  return {run, resultBinding: bind(safeRelative(resultPath)), parsed};
};

const allocatePort = () => new Promise<number>((resolvePort, rejectPort) => {
  const server = createServer();
  server.unref();
  server.once("error", rejectPort);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    server.close((error) => error ? rejectPort(error) : resolvePort(port));
  });
});
const prepareReviewFontMock = () => {
  const fixture = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0001-browser/v1/next-font-google-response.json"), "utf8")) as {
    responses: Array<{url: string; family: string; faces: Array<{file: string; subset: string; unicodeRange: string}>}>;
  };
  const responseMap: Record<string, string> = {};
  for (const response of fixture.responses) {
    responseMap[response.url] = response.faces.map((face) => {
      const fontPath = resolve(ROOT, face.file).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
      return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${fontPath}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
    }).join("\n");
  }
  const path = resolve(REVIEW_ROOT, "next-font-responses.cjs");
  writeFileSync(path, `"use strict";\nmodule.exports = ${JSON.stringify(responseMap, null, 2)};\n`);
  return path;
};
const waitForReviewRoot = async (url: string, pid: number) => {
  const deadline = Date.now() + 120_000;
  let last = "not started";
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      throw new Error(`review server process exited before readiness: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      const response = await fetch(url, {redirect: "manual"});
      const body = await response.text();
      if (response.status === 200) return {status: response.status, bytes: Buffer.byteLength(body)};
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`review server did not become ready: ${last}`);
};
const startReviewServer = async () => {
  mkdirSync(REVIEW_ROOT, {recursive: true});
  const liveLogPath = resolve(REVIEW_ROOT, "review-server-live.log");
  const networkLiveLogPath = resolve(REVIEW_ROOT, "review-server-network-live.ndjson");
  const priorFailurePath = resolve(REVIEW_ROOT, "prior-startup-failures.json");
  writeFileSync(liveLogPath, "");
  writeFileSync(networkLiveLogPath, "");
  writeFileSync(priorFailurePath, `${JSON.stringify({
    evidenceVersion: 1,
    attempts: [1, 2].map((attempt) => ({
      attempt,
      status: "failed",
      phase2RuntimeReachedReadyState: false,
      retainedProcess: false,
      failureCode: "SPEC0001_NETWORK_DENIED",
      deniedPrimitive: "child_process.fork",
      deniedTarget: resolve(realpathSync(resolve(DEPENDENCY_ROOT, "next")), "dist/server/lib/start-server.js"),
      cause: "the proof recorder configured the guard with the worktree overlay root instead of the symlink-resolved Next dependency root",
    })).concat([{
      attempt: 3,
      status: "failed",
      phase2RuntimeReachedReadyState: true,
      retainedProcess: false,
      failureCode: "REVIEW_LISTENER_IDENTITY_ASSUMPTION",
      deniedPrimitive: "not_applicable",
      deniedTarget: "not_applicable",
      cause: "the proof recorder assumed the Next launcher PID was also the forked listener PID; the owned process group was terminated after the evidence assertion failed",
    }, {
      attempt: 4,
      status: "failed",
      phase2RuntimeReachedReadyState: true,
      retainedProcess: false,
      failureCode: "BLOCKED_NEXT_VERSION_CHECK",
      deniedPrimitive: "fetch",
      deniedTarget: "https://registry.npmjs.org",
      cause: "the outbound guard blocked Next development mode's background version metadata fetch; no network bytes left the process, but the proof requires zero attempts",
    }]),
    correction: "derive the trusted Next child-process root from realpath(node_modules/next)/../.., bind launcher and listener separately, and use the repository-proven scoped Next version/telemetry suppression; HTTP, HTTPS, DNS, net, and TLS denial remain unchanged",
  }, null, 2)}\n`);
  const fontMockPath = prepareReviewFontMock();
  const frameworkPreloadPath = resolve(REVIEW_ROOT, "next-development-network-suppression.cjs");
  writeFileSync(frameworkPreloadPath, `"use strict";
const fs = require("node:fs");
const path = require("node:path");
const dependencyRoot = process.env.SPEC0001_REPOSITORY_ROOT;
const reviewWorktree = process.env.SPEC0005_REVIEW_WORKTREE;
const ledger = process.env.SPEC0001_NETWORK_LEDGER;
const record = (entry) => { if (ledger) fs.appendFileSync(ledger, JSON.stringify({...entry, pid: process.pid, at: new Date().toISOString()}) + "\\n"); };
const nextVersionTarget = "https://registry.npmjs.org/-/package/next/dist-tags";
const nextVersionModule = require.resolve(dependencyRoot + "/node_modules/next/dist/server/dev/hot-reloader-shared-utils.js");
const nextVersionExports = require(nextVersionModule);
if (Object.keys(nextVersionExports).sort().join(",") !== "getVersionInfo,matchNextPageBundleRequest" || typeof nextVersionExports.matchNextPageBundleRequest !== "function") throw new Error("Review Next version-info module shape drifted.");
const installedNextVersion = require(dependencyRoot + "/node_modules/next/package.json").version;
const getVersionInfo = async () => { record({result: "suppressed", primitive: "framework.next.getVersionInfo", target: nextVersionTarget}); return {installed: installedNextVersion, staleness: "unknown"}; };
require.cache[nextVersionModule].exports = {__esModule: true, getVersionInfo, matchNextPageBundleRequest: nextVersionExports.matchNextPageBundleRequest};
const telemetryModule = require.resolve(dependencyRoot + "/node_modules/next/dist/telemetry/storage.js");
const telemetryExports = require(telemetryModule);
if (Object.keys(telemetryExports).join(",") !== "Telemetry" || typeof telemetryExports.Telemetry !== "function") throw new Error("Review Next telemetry module shape drifted.");
const OriginalTelemetry = telemetryExports.Telemetry;
const wrap = (instance) => { const prior = instance.flushDetached; if (typeof prior !== "function") throw new Error("Review Next telemetry instance shape drifted."); instance.flushDetached = function(mode, dir) { if (process.env.NEXT_TELEMETRY_DISABLED === "1" && mode === "dev" && path.resolve(String(dir || "")) === path.resolve(reviewWorktree)) { record({result: "suppressed", primitive: "framework.next.telemetry.flushDetached", target: "dev:review-worktree"}); return; } return prior.call(this, mode, dir); }; return instance; };
class ReviewTelemetry extends OriginalTelemetry { constructor(options) { super(options); return wrap(this); } }
require.cache[telemetryModule].exports = {__esModule: true, Telemetry: ReviewTelemetry};
`);
  const port = await allocatePort();
  assert.notEqual(port, 3000);
  const nextCli = resolve(DEPENDENCY_ROOT, "next/dist/bin/next");
  const launchArgs = [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)];
  const logFd = openSync(liveLogPath, "a");
  const safeEnvironment = {} as NodeJS.ProcessEnv;
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SHELL", "TERM"]) {
    if (process.env[key]) safeEnvironment[key] = process.env[key];
  }
  Object.assign(safeEnvironment, {
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMockPath,
    NODE_OPTIONS: `--require=${resolve(ROOT, "scripts/spec0001-browser/networkDeny.cjs")} --require=${frameworkPreloadPath}`,
    SPEC0001_NETWORK_LEDGER: networkLiveLogPath,
    SPEC0001_REPOSITORY_ROOT: resolve(realpathSync(resolve(DEPENDENCY_ROOT, "next")), "..", ".."),
    SPEC0005_REVIEW_WORKTREE: ROOT,
    OPENAI_API_KEY: "",
    OPENAI_ORG_ID: "",
    OPENAI_PROJECT_ID: "",
    DIAMOND_STICK_AI_V1_MODE: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
  });
  const child = spawn(process.execPath, launchArgs, {
    cwd: ROOT,
    env: safeEnvironment,
    detached: true,
    shell: false,
    stdio: ["ignore", logFd, logFd],
  });
  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  });
  closeSync(logFd);
  assert.ok(Number.isSafeInteger(child.pid) && (child.pid ?? 0) > 1, "review server has a positive PID");
  const pid = child.pid!;
  child.unref();
  try {
    const url = `http://127.0.0.1:${port}/`;
    const root = await waitForReviewRoot(url, pid);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    const launcherPs = spawnSync("ps", ["-ww", "-o", "pgid=", "-o", "command=", "-p", String(pid)], {encoding: "utf8"});
    assert.equal(launcherPs.status, 0, "review launcher process group is readable");
    const launcherMatch = /^(\d+)\s+(.+)$/.exec(launcherPs.stdout.trim());
    assert.ok(launcherMatch, "review launcher exposes PGID and command");
    const processGroupId = Number(launcherMatch[1]);
    const launcherPsCommand = launcherMatch[2];
    assert.equal(processGroupId, pid, "detached review server owns its process group");
    assert.ok(launcherPsCommand.includes("next/dist/bin/next") && launcherPsCommand.includes(String(port)), "review launcher command is exact");
    const listenerCheck = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp", "-Fn"], {encoding: "utf8"});
    assert.equal(listenerCheck.status, 0, "review listener is readable");
    const listenerPid = Number(listenerCheck.stdout.split("\n").find((line) => line.startsWith("p"))?.slice(1));
    const listener = listenerCheck.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? "";
    assert.ok(Number.isSafeInteger(listenerPid) && listenerPid > 1, "review listener has a positive PID");
    assert.ok(listener.includes(`127.0.0.1:${port}`), "review listener is bound to exact loopback port");
    const serverPs = spawnSync("ps", ["-ww", "-o", "pgid=", "-o", "command=", "-p", String(listenerPid)], {encoding: "utf8"});
    assert.equal(serverPs.status, 0, "review listener process is readable");
    const serverMatch = /^(\d+)\s+(.+)$/.exec(serverPs.stdout.trim());
    assert.ok(serverMatch, "review listener exposes PGID and command");
    assert.equal(Number(serverMatch[1]), processGroupId, "review listener belongs to the detached launcher process group");
    const psCommand = serverMatch[2];
    const cwdCheck = spawnSync("lsof", ["-a", "-p", String(listenerPid), "-d", "cwd", "-Fn"], {encoding: "utf8"});
    assert.equal(cwdCheck.status, 0, "review listener cwd is readable");
    const cwd = cwdCheck.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
    assert.equal(cwd ? resolve(cwd) : null, realpathSync(ROOT), "review listener cwd is the direct worktree");
    const startupPrefixPath = resolve(REVIEW_ROOT, "review-server-startup-prefix.log");
    const networkPrefixPath = resolve(REVIEW_ROOT, "review-server-network-startup-prefix.ndjson");
    writeFileSync(startupPrefixPath, readFileSync(liveLogPath));
    writeFileSync(networkPrefixPath, readFileSync(networkLiveLogPath));
    const networkEntries = readFileSync(networkLiveLogPath, "utf8").split("\n").filter(Boolean)
      .map((line) => JSON.parse(line) as {result?: string; target?: string});
    const deniedCount = networkEntries.filter((entry) => entry.result === "denied").length;
    const suppressedCount = networkEntries.filter((entry) => entry.result === "suppressed").length;
    const nonLoopbackCount = networkEntries.filter((entry) => entry.target &&
      entry.result !== "suppressed" && !entry.target.includes("127.0.0.1") && !entry.target.includes("::1") &&
      !entry.target.includes("next-internal-node-child")).length;
    assert.equal(deniedCount, 0, "review startup has no denied external attempt");
    assert.equal(nonLoopbackCount, 0, "review startup has no non-loopback target");
    const requestLedgerPath = resolve(REVIEW_ROOT, "recorder-request-ledger.json");
    writeFileSync(requestLedgerPath, `${JSON.stringify({
      ledgerVersion: 1,
      requests: [{method: "GET", url, status: root.status, responseBytes: root.bytes, destination: "loopback"}],
      externalRequests: 0,
      providerRequests: 0,
    }, null, 2)}\n`);
    retainedReviewProcessGroupId = processGroupId;
    return {
      url,
      hostname: "127.0.0.1",
      port,
      path: "/",
      search: "",
      hash: "",
      serverPid: listenerPid,
      processGroupId,
      worktree: realpathSync(ROOT),
      sourceHead: ACTIVATION_HEAD,
      sourceDirtyPaths: dirtyPaths(),
      launchMode: "next-development-webpack-direct-worktree",
      launchCommand: [process.execPath, ...launchArgs],
      environmentPolicy: "scrubbed allowlist; provider credentials blank; deterministic local font fixture; scoped Next version/telemetry suppression before network; outbound network guard installed",
      purpose: "ordinary-existing-app-regression-smoke-only",
      phase2SafetyDemonstrated: false,
      newMotionReviewed: false,
      ordinaryRootOnly: true,
      normalControlsOnly: true,
      fixturePickerAbsent: true,
      privateReviewUiAbsent: true,
      noQueryFlag: true,
      noHashFlag: true,
      non3000: true,
      loopbackOnly: true,
      recorderExternalRequests: 0,
      recorderProviderRequests: 0,
      rootStatus: root.status,
      processEvidence: {launcherPid: pid, launcherPsCommand, psCommand, cwd: realpathSync(ROOT), listener, listenerPid},
      networkInspection: {entryCount: networkEntries.length, deniedCount, suppressedCount, nonLoopbackCount},
      cleanupCommand: `kill -- -${processGroupId}`,
      logPolicy: {
        liveLogPath: safeRelative(liveLogPath),
        startupPrefix: bind(safeRelative(startupPrefixPath)),
        startupPrefixBytes: statSync(startupPrefixPath).size,
        appendOnlyAfterPrefix: true,
        networkLiveLogPath: safeRelative(networkLiveLogPath),
        networkStartupPrefix: bind(safeRelative(networkPrefixPath)),
        networkStartupPrefixBytes: statSync(networkPrefixPath).size,
      },
      immutableArtifacts: [fontMockPath, frameworkPreloadPath, priorFailurePath, startupPrefixPath, networkPrefixPath, requestLedgerPath].map((path) => bind(safeRelative(path))),
    };
  } catch (error) {
    try { process.kill(-pid, "SIGTERM"); } catch {}
    retainedReviewProcessGroupId = null;
    throw error;
  }
};

const reuseExistingReviewServer = async () => {
  const historical = JSON.parse(readFileSync(HISTORICAL_MANIFEST_PATH, "utf8")) as {
    reviewServer: {url: string; serverPid: number; processGroupId: number; processEvidence: {launcherPid: number; listenerPid: number}};
  };
  const url = new URL(historical.reviewServer.url);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.notEqual(url.port, "3000");
  assert.equal(url.pathname, "/");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  const launcherPid = historical.reviewServer.processEvidence.launcherPid;
  const listenerPid = historical.reviewServer.processEvidence.listenerPid;
  assert.equal(historical.reviewServer.serverPid, listenerPid);
  process.kill(launcherPid, 0);
  process.kill(listenerPid, 0);
  const launcher = spawnSync("ps", ["-ww", "-o", "pgid=", "-o", "command=", "-p", String(launcherPid)], {encoding: "utf8"});
  const listener = spawnSync("ps", ["-ww", "-o", "pgid=", "-o", "command=", "-p", String(listenerPid)], {encoding: "utf8"});
  assert.equal(launcher.status, 0);
  assert.equal(listener.status, 0);
  assert.ok(launcher.stdout.includes("next/dist/bin/next") && launcher.stdout.includes(url.port));
  assert.ok(listener.stdout.includes("next-server"));
  const cwdCheck = spawnSync("lsof", ["-a", "-p", String(listenerPid), "-d", "cwd", "-Fn"], {encoding: "utf8"});
  assert.equal(cwdCheck.status, 0);
  const cwd = cwdCheck.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  assert.equal(cwd ? resolve(cwd) : null, realpathSync(ROOT));
  const socketCheck = spawnSync("lsof", ["-nP", `-iTCP:${url.port}`, "-sTCP:LISTEN", "-Fp", "-Fn"], {encoding: "utf8"});
  assert.equal(socketCheck.status, 0);
  assert.ok(socketCheck.stdout.includes(`p${listenerPid}`));
  assert.ok(socketCheck.stdout.includes(`n127.0.0.1:${url.port}`));
  const response = await fetch(url, {redirect: "manual"});
  const body = await response.text();
  assert.equal(response.status, 200);
  return {
    url: url.href,
    hostname: url.hostname,
    port: Number(url.port),
    path: url.pathname,
    search: url.search,
    hash: url.hash,
    serverPid: listenerPid,
    processGroupId: historical.reviewServer.processGroupId,
    worktree: realpathSync(ROOT),
    sourceHead: ACTIVATION_HEAD,
    sourceDirtyPaths: dirtyPaths(),
    launchMode: "reused-existing-next-development-webpack-direct-worktree",
    purpose: "ordinary-existing-app-regression-smoke-only",
    phase2SafetyDemonstrated: false,
    newMotionReviewed: false,
    ordinaryRootOnly: true,
    normalControlsOnly: true,
    fixturePickerAbsent: true,
    privateReviewUiAbsent: true,
    noQueryFlag: true,
    noHashFlag: true,
    non3000: true,
    loopbackOnly: true,
    recorderExternalRequests: 0,
    recorderProviderRequests: 0,
    rootStatus: response.status,
    rootBytes: Buffer.byteLength(body),
    reused: true,
    processEvidence: {launcherPid, listenerPid, launcherCommand: launcher.stdout.trim(), listenerCommand: listener.stdout.trim(), cwd: realpathSync(ROOT)},
    immutableArtifacts: [] as Binding[],
  };
};

// Retained only as non-executed historical recorder code; D-0047 always uses the bound server above.
void restorePermanentBrowserRegression;
void startReviewServer;
void retainedReviewProcessGroupId;

const main = async () => {
  assert.ok(existsSync(resolve(DEPENDENCY_ROOT, "typescript/bin/tsc")), "dependency root contains TypeScript");
  assert.ok(existsSync(resolve(DEPENDENCY_ROOT, "eslint/bin/eslint.js")), "dependency root contains ESLint");
  assert.ok(existsSync(resolve(DEPENDENCY_ROOT, "playwright-core/package.json")), "dependency root contains permanent browser dependency");
  assert.equal(git(["rev-parse", "HEAD"]), ACTIVATION_HEAD, "proof starts at exact activation HEAD");
  assert.equal(git(["rev-parse", "main"]), ACTIVATION_HEAD, "local main remains exact");
  assert.equal(git(["rev-parse", "origin/main"]), ACTIVATION_HEAD, "origin main remains exact");
  assert.equal(git(["branch", "--show-current"]), "", "worktree remains detached");
  assert.equal(git(["diff", "--cached", "--name-only"]), "", "index is empty");
  assert.deepEqual(dirtyPaths(), [...EXACT_DIRTY_PATH_ALLOWLIST], "exact eight-path dirty allowlist is present");
  assert.equal(git(["diff", "--check"]), "", "diff whitespace check passes");
  assert.deepEqual(readdirSync(ROOT).filter((name) => /^\.env/.test(name)), [".env.example"], "no runtime environment file is present");
  const historicalManifestBinding = bind(safeRelative(HISTORICAL_MANIFEST_PATH));
  assert.equal(historicalManifestBinding.sha256, HISTORICAL_MANIFEST_SHA256, "historical proof manifest remains byte-identical");
  assert.equal(historicalManifestBinding.bytes, 17_826, "historical proof manifest size remains exact");
  const basisReconciliationBinding = bind("output/spec-0005/phase-2/d0047-correction/basis-reconciliation.json");
  const existingPermanentReceipt = resolve(TECHNICAL_ROOT, "permanent-browser-regression.json");
  const existingPermanentResult = resolve(TECHNICAL_ROOT, "permanent-browser-result.json");
  const savedPermanent = existsSync(existingPermanentReceipt) && existsSync(existingPermanentResult)
    ? {receiptBytes: readFileSync(existingPermanentReceipt), resultBytes: readFileSync(existingPermanentResult)}
    : null;
  if (existsSync(TECHNICAL_ROOT)) rmSync(TECHNICAL_ROOT, {recursive: true, force: true});
  if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH, {force: true});
  mkdirSync(TECHNICAL_ROOT, {recursive: true});
  const historicalFailedPermanentAttemptBinding = bind("output/spec-0005/phase-2/technical/permanent-browser-failed-attempt.json");
  const results: Array<{receipt: CommandReceipt; binding: Binding}> = [];
  results.push(runCommand("independent-body-safety-oracle", process.execPath, ["--experimental-strip-types", "scripts/validateStickBodySafety.ts"]));
  results.push(runCommand("body-safety-integration", process.execPath, ["--experimental-strip-types", "scripts/validateStickBodySafetyIntegration.ts"]));
  results.push(runCommand("motion-quality-baseline", process.execPath, ["--experimental-strip-types", "scripts/validateStickMotionQualityBaseline.ts"]));
  results.push(runCommand("ai-contracts", process.execPath, ["--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"]));
  results.push(runCommand("command-transaction", process.execPath, ["--experimental-strip-types", "scripts/validateStickFigureCommandTransaction.ts"]));
  results.push(runCommand("motion-engine", process.execPath, ["--experimental-strip-types", "scripts/validateStickFigureMotionEngine.ts"]));
  results.push(runCommand("action-timing", process.execPath, ["--experimental-strip-types", "scripts/validateStickFigureActionTiming.ts"]));
  results.push(runCommand("ai-ui-adapter", process.execPath, ["--experimental-strip-types", "scripts/validateStickFigureAiUiAdapter.ts"]));
  results.push(runCommand("history-persistence", process.execPath, ["--experimental-strip-types", "scripts/validateStickHistoryPersistence.ts"]));
  results.push(runCommand("pose-timeline", process.execPath, ["--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"]));
  withResultCopy((copy) => {
    results.push(runCommand("typescript", process.execPath, [resolve(DEPENDENCY_ROOT, "typescript/bin/tsc"), "--noEmit", "--incremental", "false"], copy, {
      executionSource: "isolated copy of exact eight-path result",
      temporaryCopyRemoved: true,
    }));
    results.push(runCommand("scoped-lint", process.execPath, [
      resolve(DEPENDENCY_ROOT, "eslint/bin/eslint.js"),
      ...EXACT_DIRTY_PATH_ALLOWLIST.filter((path) => path.endsWith(".ts")),
    ], copy, {changedPathFindings: 0, temporaryCopyRemoved: true}));
    results.push(runKnownLintBaseline(copy));
  });
  const observed = dirtyPaths();
  assert.equal(git(["diff", "--check"]), "");
  assert.deepEqual(observed, [...EXACT_DIRTY_PATH_ALLOWLIST]);
  assert.deepEqual(listed(git(["diff", "--cached", "--name-only"])), []);
  results.push(recordInternalCheck("git-diff-and-scope", {
    head: ACTIVATION_HEAD,
    localMain: git(["rev-parse", "main"]),
    originMain: git(["rev-parse", "origin/main"]),
    detachedHead: true,
    indexEmpty: true,
    diffCheck: "passed",
    exactDirtyPaths: observed,
    docsChanged: false,
    packageConfigEnvironmentChanged: false,
  }));
  const permanent = savedPermanent ? restorePermanentBrowserRegression(savedPermanent) : runPermanentBrowserRegression();
  results.push(permanent.run);

  const reviewServer = await reuseExistingReviewServer();
  results.push(recordInternalCheck("review-server-reuse", {
    url: reviewServer.url,
    serverPid: reviewServer.serverPid,
    processGroupId: reviewServer.processGroupId,
    rootStatus: reviewServer.rootStatus,
    rootBytes: reviewServer.rootBytes,
    singleExistingServerReused: true,
    noReplacementStarted: true,
  }));
  const oracle = JSON.parse(results[0].receipt.stdout) as {
    propertySeed: number;
    propertyCandidates: number;
    mirroredCandidates: number;
    positiveCatalogCases: number;
    negativeCatalogCases: number;
    closedFailureReasons: number;
    importsRuntimeSafetyKernel: boolean;
    stage: {width: number; height: number};
  };
  const integration = JSON.parse(results[1].receipt.stdout) as {assertionCount: number; observedNamedNegatives: number; stage: {width: number; height: number}};
  assert.deepEqual({
    propertySeed: oracle.propertySeed,
    propertyCandidates: oracle.propertyCandidates,
    mirroredCandidates: oracle.mirroredCandidates,
    positiveCatalogCases: oracle.positiveCatalogCases,
    negativeCatalogCases: oracle.negativeCatalogCases,
    closedFailureReasons: oracle.closedFailureReasons,
    importsRuntimeSafetyKernel: oracle.importsRuntimeSafetyKernel,
    stage: oracle.stage,
  }, {
    propertySeed: 1592594996,
    propertyCandidates: 10_000,
    mirroredCandidates: 10_000,
    positiveCatalogCases: 16,
    negativeCatalogCases: 68,
    closedFailureReasons: 20,
    importsRuntimeSafetyKernel: false,
    stage: {width: 1920, height: 1080},
  });
  assert.deepEqual(integration.stage, oracle.stage, "runtime integration and independent oracle bind the same stage");
  assert.equal(integration.assertionCount, 20_305);
  assert.equal(integration.observedNamedNegatives, 81);

  const makeManifest = (
    manifestKind: "mutation-preflight" | "final",
    receiptResults: typeof results,
    artifacts: Binding[],
  ) => ({
    manifestVersion: 2,
    manifestKind,
    phase: "SPEC-0005 Phase 2 — D-0047 Two-Stage Body-Safety Correction",
    status: "technical-pass-owner-pm-review-pending",
    generatedAt: new Date().toISOString(),
    activation: {
      head: ACTIVATION_HEAD,
      localMain: git(["rev-parse", "main"]),
      originMain: git(["rev-parse", "origin/main"]),
      detachedHead: true,
      indexEmpty: true,
    },
    scope: {
      exactDirtyPathAllowlist: [...EXACT_DIRTY_PATH_ALLOWLIST],
      observedDirtyPaths: dirtyPaths(),
      outsideAllowlistPaths: dirtyPaths().filter((path) => !EXACT_DIRTY_PATH_ALLOWLIST.includes(path as typeof EXACT_DIRTY_PATH_ALLOWLIST[number])),
      trackedPathCount: 8,
      docsChanged: false,
      packageConfigEnvironmentChanged: false,
      stagedPaths: listed(git(["diff", "--cached", "--name-only"])),
    },
    safetyContract: {
      fixtureVersion: 2,
      decision: "D-0047",
      selectionContractVersion: "stick.body-safety-selection/v1",
      selectionResultVersion: "stick.body-safety-selection-result/v1",
      completionContractVersion: "stick.body-safety-completion/v1",
      stage: {...oracle.stage, standingBodyHeight: 740, groundY: 980},
      positiveCatalogCases: oracle.positiveCatalogCases,
      negativeCatalogCases: oracle.negativeCatalogCases,
      closedFailureReasons: oracle.closedFailureReasons,
      propertySeed: oracle.propertySeed,
      propertyCandidates: oracle.propertyCandidates,
      mirroredCandidates: oracle.mirroredCandidates,
      independentOracle: true,
      independentOracleImportsRuntimeKernel: oracle.importsRuntimeSafetyKernel,
      runtimeFinalizer: "finalizeStickBodySafetyCandidate",
      runtimeSelector: "selectStickBodySafetyImportantPoses",
      selectionExcludesFinalFramesAndDocument: true,
      completionRerunsSelection: true,
      commandExecutorSelectsFinalDoorInternally: true,
      airbornePhase2Rejected: true,
      roundedOutputValidated: true,
      noTrustedBypass: true,
    },
    counts: {
      technicalReceipts: receiptResults.length,
      proofArtifacts: artifacts.length,
      integrationAssertions: integration.assertionCount,
      observedNamedNegatives: integration.observedNamedNegatives,
    },
    testResults: receiptResults.map((result) => ({
      id: result.receipt.id,
      status: result.receipt.result,
      receiptPath: result.binding.path,
      receiptSha256: result.binding.sha256,
      receiptBytes: result.binding.bytes,
    })),
    permanentBrowser: {
      executionSource: "clean isolated clone of exact activation base",
      baseCommit: ACTIVATION_HEAD,
      exactRunsThisCorrection: 1,
      receiptReusedAfterSafetyAudit: savedPermanent !== null,
      historicalInitialFailure: historicalFailedPermanentAttemptBinding,
      result: permanent.resultBinding,
      status: permanent.parsed.status,
      externalAttempts: permanent.parsed.network.nonLoopbackAttempts,
      realApiRouteRequests: permanent.parsed.network.realApiRouteRequests,
      cleanupPassed: permanent.parsed.cleanup.status === "passed",
    },
    reviewServer: Object.fromEntries(Object.entries(reviewServer).filter(([key]) => key !== "immutableArtifacts")),
    historicalProof: historicalManifestBinding,
    basisReconciliation: basisReconciliationBinding,
    humanReview: {
      status: "pending-arthur-and-project-manager",
      automationCannotAccept: true,
      scope: "ordinary existing-app regression smoke only; Phase 2 safety is proven technically, not demonstrated by this root page",
    },
    sourceFiles: EXACT_DIRTY_PATH_ALLOWLIST.map(bind),
    artifacts,
  });

  const preflightArtifacts = [
    ...results.map((result) => result.binding),
    permanent.resultBinding,
    historicalManifestBinding,
    historicalFailedPermanentAttemptBinding,
    basisReconciliationBinding,
    ...reviewServer.immutableArtifacts,
  ];
  assert.equal(new Set(preflightArtifacts.map((artifact) => artifact.path)).size, preflightArtifacts.length, "preflight artifact paths are unique");
  const preflightPath = resolve(TECHNICAL_ROOT, "mutation-preflight-manifest.json");
  writeFileSync(preflightPath, `${JSON.stringify(makeManifest("mutation-preflight", results, preflightArtifacts), null, 2)}\n`);
  const preflightBinding = bind(safeRelative(preflightPath));
  const mutationResult = runCommand("proof-validator-mutation-contract", process.execPath, [
    "--experimental-strip-types",
    "scripts/spec0005-stick/validatePhase2SafetyProof.ts",
    "--manifest",
    safeRelative(preflightPath),
    "--mutation-suite",
  ], ROOT, {
    actualValidatorPath: "scripts/spec0005-stick/validatePhase2SafetyProof.ts",
    realPreflightManifest: preflightBinding,
    acceptedRuntimeEdited: false,
  });
  results.splice(13, 0, mutationResult);
  const artifacts = [
    ...results.map((result) => result.binding),
    permanent.resultBinding,
    historicalManifestBinding,
    historicalFailedPermanentAttemptBinding,
    basisReconciliationBinding,
    preflightBinding,
    ...reviewServer.immutableArtifacts,
  ];
  assert.equal(new Set(artifacts.map((artifact) => artifact.path)).size, artifacts.length, "final artifact paths are unique");
  const manifest = makeManifest("final", results, artifacts);
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(MANIFEST_PATH, bytes);
  console.log("SPEC-0005 Phase 2 technical proof manifest recorded.");
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log(`Manifest SHA-256: ${sha256(bytes)}`);
  console.log(`Manifest bytes: ${Buffer.byteLength(bytes)}`);
  console.log(`Review URL: ${reviewServer.url}`);
  console.log(`Review PID/PGID: ${reviewServer.serverPid}/${reviewServer.processGroupId}`);
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
