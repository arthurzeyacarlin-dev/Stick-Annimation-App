import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {dirname, relative, resolve} from "node:path";
import {tmpdir} from "node:os";
import {
  SPEC0003_AUTHORIZED_PATHS,
  SPEC0003_BASE_COMMIT,
  SPEC0003_COMMANDS_PATH,
  SPEC0003_CONTRACT_PATH,
  SPEC0003_MANIFEST_PATH,
  SPEC0003_PRODUCT_RUNTIME_REFERENCE,
  SPEC0003_PROOF_ROOT,
  assertExactSpec0003StickAvailabilityRecords,
  bindFile,
  repositoryPath,
  sha256Bytes,
  sortPaths,
  strictObject,
  type FileBinding,
  type JsonObject,
  type Spec0003StickAvailabilityRecord,
} from "./spec0003TesterCompatibilityContract.ts";

type ProofCommand = {name: string; argv: string[]; expectedExitCode: number};

const ROOT = process.cwd();
const LEGACY_BROWSER_ROOT = "output/spec-0001/phase-1.5/browser";
const EVIDENCE_ROOT = `${SPEC0003_PROOF_ROOT}/evidence/permanent-browser`;
const RECEIPT_ROOT = `${SPEC0003_PROOF_ROOT}/receipts`;
const GIT = "/usr/bin/git";
const REGISTRATION_PROJECTIONS: Record<string, {base: string; result: string; plan: string}> = {
  "phase-3-registration": {base: "54234b7c7b95201e274975a804859fa9c36806a1", result: "3fe3a5487389647b67216e9466121e00f1a73856", plan: "scripts/fixtures/stick-ai/v1/phase-3-browser-proof-plan.json"},
  "phase-4-registration": {base: "62f046adff7418d2e644365fc04bd5d6312dcca9", result: "71841e96499f7627139c53d87114bba65e19d29d", plan: "scripts/fixtures/stick-ai/v1/phase-4-browser-proof-plan.json"},
  "phase-5-registration": {base: "a2b4f3e0fc492df9cd63bda32554e382a344cdb6", result: "9bbcc1df2fe4c79c0947601d0ea6274a85732d85", plan: "scripts/fixtures/stick-ai/v1/phase-5-browser-proof-plan.json"},
  "phase-6-registration": {base: "f46ed3b13e6bca3a09c9b2926c972bea8c331f2c", result: "caa6c2d946780f384d0a8c58f4ea75a771483bcd", plan: "scripts/fixtures/stick-ai/v2/phase-6-browser-proof-plan.json"},
};

const proofEnvironment = () => {
  const environment = {} as NodeJS.ProcessEnv;
  for (const key of ["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TERM"]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  environment.PATH = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  environment.NODE_NO_WARNINGS = "1";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_CONFIG_GLOBAL = "/dev/null";
  environment.GIT_OPTIONAL_LOCKS = "0";
  return environment;
};

const git = (...argv: string[]) => {
  const result = spawnSync(GIT, argv, {cwd: ROOT, env: proofEnvironment(), encoding: "utf8", shell: false});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};
const nulList = (value: string) => value.split("\0").filter(Boolean);
const dirtyPaths = () => sortPaths([...new Set([
  ...nulList(git("diff", "--name-only", "-z")),
  ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
])]);
const ensureDirectory = (path: string) => {
  const absolute = repositoryPath(ROOT, path);
  mkdirSync(absolute, {recursive: true, mode: 0o700});
  assert.equal(lstatSync(absolute).isDirectory(), true);
  return absolute;
};
const writeExclusiveJson = (path: string, value: unknown) => {
  ensureDirectory(relative(ROOT, dirname(repositoryPath(ROOT, path))));
  writeFileSync(repositoryPath(ROOT, path), `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  return bindFile(ROOT, path);
};
const readJson = (path: string) => JSON.parse(readFileSync(repositoryPath(ROOT, path), "utf8")) as unknown;
const copyTree = (source: string, destination: string): string[] => {
  const sourceAbsolute = repositoryPath(ROOT, source);
  assert.equal(lstatSync(sourceAbsolute).isSymbolicLink(), false, `Symlink evidence rejected: ${source}`);
  if (lstatSync(sourceAbsolute).isFile()) {
    ensureDirectory(relative(ROOT, dirname(repositoryPath(ROOT, destination))));
    copyFileSync(sourceAbsolute, repositoryPath(ROOT, destination));
    return [destination];
  }
  ensureDirectory(destination);
  return readdirSync(sourceAbsolute).sort().flatMap((name) => copyTree(`${source}/${name}`, `${destination}/${name}`));
};
const listFiles = (path: string): string[] => {
  const absolute = repositoryPath(ROOT, path);
  if (!existsSync(absolute)) return [];
  assert.equal(lstatSync(absolute).isSymbolicLink(), false);
  if (lstatSync(absolute).isFile()) return [path];
  return readdirSync(absolute).sort().flatMap((name) => listFiles(`${path}/${name}`));
};

const assertRunnerDiffScoped = () => {
  const current = readFileSync(repositoryPath(ROOT, "scripts/runSpec0001BrowserProof.ts"), "utf8");
  const ids = ["availability-import", "availability-ledger", "availability-route", "availability-context", "availability-final-assertion", "availability-real-route-count", "availability-baseline"];
  for (const id of ids) {
    assert.equal(current.split(`SPEC0003_D0031_BEGIN:${id}`).length, 2, `Missing or repeated runner scope marker: ${id}`);
    assert.equal(current.split(`SPEC0003_D0031_END:${id}`).length, 2, `Missing or repeated runner scope marker: ${id}`);
  }
  const diff = git("diff", "--unified=0", SPEC0003_BASE_COMMIT, "--", "scripts/runSpec0001BrowserProof.ts");
  assert.ok(diff.includes("validateSpec0003StickAvailabilityRequest"));
  assert.ok(diff.includes("assertExactSpec0003StickAvailabilityRecords"));
  assert.ok(!/compatibilityBrowserRoute|runVersion2Proof|runPhase[3456]BrowserProof/.test(diff), "Runner diff escaped the no-plan availability path.");
};

const validateCommandConfig = () => {
  const config = strictObject(readJson(SPEC0003_COMMANDS_PATH), ["baseCommit", "commands", "configVersion", "outputRoot", "prerequisiteId", "productRuntimeReferenceCommit", "specId"], "Proof command config");
  assert.equal(config.configVersion, 1);
  assert.equal(config.specId, "SPEC-0003");
  assert.equal(config.prerequisiteId, "D-0031");
  assert.equal(config.baseCommit, SPEC0003_BASE_COMMIT);
  assert.equal(config.productRuntimeReferenceCommit, SPEC0003_PRODUCT_RUNTIME_REFERENCE);
  assert.equal(config.outputRoot, SPEC0003_PROOF_ROOT);
  assert.ok(Array.isArray(config.commands));
  const commands = config.commands.map((value, index) => {
    const command = strictObject(value, ["argv", "expectedExitCode", "name"], `Command ${index}`) as unknown as ProofCommand;
    assert.ok(Array.isArray(command.argv) && command.argv.every((entry) => typeof entry === "string"));
    assert.equal(command.expectedExitCode, 0);
    return command;
  });
  assert.deepEqual(commands.map((command) => command.name), [
    "contract-self-test", "typescript", "lint-regression", "diff-check", "cached-diff-check",
    "phase-3-registration", "phase-4-registration", "phase-5-registration", "phase-6-registration",
    "permanent-no-plan-browser", "status",
  ]);
  return commands;
};

const prepareRegistrationProjection = (name: string) => {
  const projection = REGISTRATION_PROJECTIONS[name];
  assert.ok(projection, `Unknown registration projection: ${name}`);
  const temporaryRoot = mkdtempSync(`${tmpdir()}/spec0003-${name}-`);
  const clone = spawnSync(GIT, ["clone", "--quiet", "--shared", "--no-checkout", ROOT, temporaryRoot], {cwd: ROOT, env: proofEnvironment(), encoding: "utf8", shell: false});
  assert.equal(clone.status, 0, clone.stderr || `Unable to create ${name} proof clone.`);
  const checkout = spawnSync(GIT, ["checkout", "--quiet", "--detach", projection.base], {cwd: temporaryRoot, env: proofEnvironment(), encoding: "utf8", shell: false});
  assert.equal(checkout.status, 0, checkout.stderr || `Unable to select ${name} base.`);
  const planBytes = spawnSync(GIT, ["show", `${projection.result}:${projection.plan}`], {cwd: temporaryRoot, env: proofEnvironment(), encoding: "buffer", shell: false});
  assert.equal(planBytes.status, 0, Buffer.from(planBytes.stderr ?? []).toString("utf8"));
  const plan = JSON.parse(Buffer.from(planBytes.stdout ?? []).toString("utf8")) as {baseCommit: string; dirtyExpectedPaths: string[]};
  assert.equal(plan.baseCommit, projection.base);
  assert.ok(Array.isArray(plan.dirtyExpectedPaths) && plan.dirtyExpectedPaths.length > 0);
  for (const path of plan.dirtyExpectedPaths) {
    const file = spawnSync(GIT, ["show", `${projection.result}:${path}`], {cwd: temporaryRoot, env: proofEnvironment(), encoding: "buffer", shell: false});
    assert.equal(file.status, 0, Buffer.from(file.stderr ?? []).toString("utf8") || `Unable to project ${path}.`);
    mkdirSync(dirname(resolve(temporaryRoot, path)), {recursive: true, mode: 0o700});
    writeFileSync(resolve(temporaryRoot, path), Buffer.from(file.stdout ?? []), {mode: 0o600});
  }
  symlinkSync(repositoryPath(ROOT, "node_modules"), resolve(temporaryRoot, "node_modules"), "dir");
  return temporaryRoot;
};

const runCommand = (command: ProofCommand) => {
  let commandRoot = ROOT;
  let temporaryRoot: string | null = null;
  if (REGISTRATION_PROJECTIONS[command.name]) {
    temporaryRoot = prepareRegistrationProjection(command.name);
    commandRoot = temporaryRoot;
  }
  const result = spawnSync(command.argv[0]!, command.argv.slice(1), {
    cwd: commandRoot,
    env: proofEnvironment(),
    encoding: "utf8",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (temporaryRoot !== null) rmSync(temporaryRoot, {recursive: true, force: true});
  const receipt = {
    receiptVersion: 1,
    name: command.name,
    argv: command.argv,
    exitCode: result.status,
    expectedExitCode: command.expectedExitCode,
    signal: result.signal,
    stdoutSha256: sha256Bytes(result.stdout ?? ""),
    stderrSha256: sha256Bytes(result.stderr ?? ""),
    stdoutTail: String(result.stdout ?? "").slice(-4000),
    stderrTail: String(result.stderr ?? "").slice(-4000),
    passed: result.status === command.expectedExitCode && result.signal === null,
  };
  const binding = writeExclusiveJson(`${RECEIPT_ROOT}/${String(command.name).replace(/[^a-z0-9-]/g, "-")}.json`, receipt);
  assert.equal(receipt.passed, true, `${command.name} failed:\n${receipt.stdoutTail}\n${receipt.stderrTail}`);
  return binding;
};

const parseAvailabilityLedger = () => {
  const lines = readFileSync(repositoryPath(ROOT, `${EVIDENCE_ROOT}/browser-network.ndjson`), "utf8").trim().split("\n").filter(Boolean);
  const records = lines.map((line) => JSON.parse(line) as JsonObject)
    .filter((entry) => entry.kind === "spec0003-stick-availability/v1")
    .map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "at" && key !== "kind")) as Spec0003StickAvailabilityRecord);
  assertExactSpec0003StickAvailabilityRecords(records);
  return records;
};

const main = () => {
  assert.equal(git("rev-parse", "HEAD").trim(), SPEC0003_BASE_COMMIT);
  assert.equal(git("diff", "--cached", "--name-only").trim(), "", "Proof requires an empty index.");
  assert.deepEqual(dirtyPaths(), [...SPEC0003_AUTHORIZED_PATHS]);
  assert.equal(existsSync(repositoryPath(ROOT, SPEC0003_PROOF_ROOT)), false, "Refusing prerequisite proof-output collision.");
  assert.equal(existsSync(repositoryPath(ROOT, LEGACY_BROWSER_ROOT)), false, "Refusing permanent-tester output collision.");
  const productRuntimeChangedPaths = git("diff", "--name-only", SPEC0003_PRODUCT_RUNTIME_REFERENCE, "--", "app", "src", "public", "package.json", "package-lock.json").trim().split("\n").filter(Boolean);
  assert.deepEqual(productRuntimeChangedPaths, [], "Product/runtime bytes changed since the protected reference.");
  const hiddenFlags = git("ls-files", "-v").split("\n").filter((line) => /^[a-z]/.test(line));
  assert.deepEqual(hiddenFlags, [], "Git hidden/assume-unchanged flags are forbidden.");
  assertRunnerDiffScoped();
  const commands = validateCommandConfig();
  ensureDirectory(RECEIPT_ROOT);
  const receipts = commands.map(runCommand);

  assert.equal(existsSync(repositoryPath(ROOT, `${LEGACY_BROWSER_ROOT}/result.json`)), true, "Permanent tester result is missing.");
  copyTree(LEGACY_BROWSER_ROOT, EVIDENCE_ROOT);
  const result = strictObject(readJson(`${EVIDENCE_ROOT}/result.json`), [
    "browserExecutable", "browserVersion", "cleanup", "console", "dependency", "drawingSettlements", "driverMessages", "failureDrill",
    "fontFixture", "fontRequests", "fontResponses", "headCommit", "historicalProofBase", "negativeCases", "negativeEvidence",
    "network", "operations", "phase", "plan", "productSource", "production", "recordedAt", "requestRecords",
    "resultVersion", "runBaseline", "screenshots", "source", "specId", "status",
  ], "Permanent tester result");
  const network = result.network as JsonObject;
  const cleanup = result.cleanup as JsonObject;
  const consoleEvidence = result.console as JsonObject;
  const negative = readJson(`${EVIDENCE_ROOT}/negative-cases.json`) as {results: unknown[]};
  const availabilityExchanges = parseAvailabilityLedger();
  assert.equal((result.operations as unknown[]).length, 40);
  assert.equal((result.screenshots as unknown[]).length, 13);
  assert.equal((result.driverMessages as unknown[]).length, 4);
  assert.equal((result.requestRecords as unknown[]).length, 1);
  assert.equal(negative.results.length, 37);
  assert.equal(network.realApiRouteRequests, 0);
  assert.equal(network.nonLoopbackAttempts, 0);
  assert.deepEqual(network.policyViolations, []);
  assert.equal(consoleEvidence.errorCount, 0);
  assert.equal(cleanup.status, "passed");
  assert.equal(cleanup.openBrowserContexts, 0);
  assert.equal(cleanup.openServers, 0);
  assert.equal(cleanup.residualProfiles, 0);
  assert.equal(cleanup.residualPorts, 0);
  assert.equal(cleanup.nextBuildPresent, false);

  rmSync(repositoryPath(ROOT, LEGACY_BROWSER_ROOT), {recursive: true, force: false});
  assert.equal(existsSync(repositoryPath(ROOT, LEGACY_BROWSER_ROOT)), false);
  assert.equal(existsSync(repositoryPath(ROOT, ".next")), false);
  const evidenceBindings = listFiles(EVIDENCE_ROOT).map((path) => bindFile(ROOT, path));
  const trackedBindings = SPEC0003_AUTHORIZED_PATHS.map((path) => bindFile(ROOT, path));
  const artifacts = [...trackedBindings, ...evidenceBindings] as FileBinding[];
  const manifest = {
    manifestVersion: 1,
    specId: "SPEC-0003",
    prerequisiteId: "D-0031",
    baseCommit: SPEC0003_BASE_COMMIT,
    headCommit: git("rev-parse", "HEAD").trim(),
    productRuntimeReferenceCommit: SPEC0003_PRODUCT_RUNTIME_REFERENCE,
    recordedAt: new Date().toISOString(),
    commandConfig: bindFile(ROOT, SPEC0003_COMMANDS_PATH),
    contract: bindFile(ROOT, SPEC0003_CONTRACT_PATH),
    receipts,
    artifacts,
    gitState: {indexEmpty: true, hiddenFlags, dirtyPaths: dirtyPaths(), productRuntimeChangedPaths, runnerDiffScoped: true},
    permanentTester: {
      result: bindFile(ROOT, `${EVIDENCE_ROOT}/result.json`),
      availabilityExchanges,
      operationCount: 40,
      screenshotCount: 13,
      driverMessageCount: 4,
      drawingPostCount: 1,
      negativeCaseCount: 37,
      realApiRouteRequestCount: 0,
      browserNonLoopbackAttemptCount: 0,
      policyViolationCount: 0,
      consoleErrorCount: 0,
    },
    lintRegression: {baseCommit: SPEC0003_BASE_COMMIT, passed: true},
    registrations: ["phase-3", "phase-4", "phase-5", "phase-6"],
    cleanup: {passed: true, legacyOutputRemoved: true, nextBuildPresent: false, residualProfiles: 0, residualPorts: 0},
    commandsPassed: true,
  };
  writeExclusiveJson(SPEC0003_MANIFEST_PATH, manifest);
  console.log(`SPEC-0003 D-0031 proof recorded: ${receipts.length} receipts, ${artifacts.length} artifacts, four Stick availability GETs, one Drawing POST, and zero real/non-loopback requests.`);
};

main();
