import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, lstatSync, readFileSync, readdirSync} from "node:fs";
import {
  SPEC0003_AUTHORIZED_PATHS,
  SPEC0003_BASE_COMMIT,
  SPEC0003_COMMANDS_PATH,
  SPEC0003_CONTRACT_PATH,
  SPEC0003_EXPECTED_CONTEXTS,
  SPEC0003_MANIFEST_PATH,
  SPEC0003_PRODUCT_RUNTIME_REFERENCE,
  SPEC0003_PROOF_ROOT,
  SPEC0003_SCHEMA_PATH,
  assertExactSpec0003StickAvailabilityRecords,
  expectedContractFixture,
  repositoryPath,
  sortPaths,
  strictObject,
  validateFileBinding,
  validateSpec0003StickAvailabilityRequest,
  type JsonObject,
  type Spec0003StickAvailabilityRecord,
} from "./spec0003TesterCompatibilityContract.ts";

const ROOT = process.cwd();
const GIT = "/usr/bin/git";
const LEGACY_BROWSER_ROOT = "output/spec-0001/phase-1.5/browser";
const EVIDENCE_ROOT = `${SPEC0003_PROOF_ROOT}/evidence/permanent-browser`;
const RECEIPT_NAMES = [
  "contract-self-test", "typescript", "lint-regression", "diff-check", "cached-diff-check",
  "phase-3-registration", "phase-4-registration", "phase-5-registration", "phase-6-registration",
  "permanent-no-plan-browser", "status",
] as const;

const environment = () => ({
  PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  LANG: process.env.LANG,
  LC_ALL: process.env.LC_ALL,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
} as unknown as NodeJS.ProcessEnv);
const git = (...argv: string[]) => {
  const result = spawnSync(GIT, argv, {cwd: ROOT, env: environment(), encoding: "utf8", shell: false});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};
const nulList = (value: string) => value.split("\0").filter(Boolean);
const dirtyPaths = () => sortPaths([...new Set([
  ...nulList(git("diff", "--name-only", "-z")),
  ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
])]);
const readJson = (path: string) => JSON.parse(readFileSync(repositoryPath(ROOT, path), "utf8")) as unknown;
const parseNdjson = (path: string) => readFileSync(repositoryPath(ROOT, path), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as JsonObject);
const listFiles = (path: string): string[] => {
  const absolute = repositoryPath(ROOT, path);
  if (!existsSync(absolute)) return [];
  if (lstatSync(absolute).isFile()) return [path];
  return readdirSync(absolute).sort().flatMap((name) => listFiles(`${path}/${name}`));
};

const expectedCommands = () => {
  const config = strictObject(readJson(SPEC0003_COMMANDS_PATH), ["baseCommit", "commands", "configVersion", "outputRoot", "prerequisiteId", "productRuntimeReferenceCommit", "specId"], "Command config");
  assert.equal(config.baseCommit, SPEC0003_BASE_COMMIT);
  assert.equal(config.productRuntimeReferenceCommit, SPEC0003_PRODUCT_RUNTIME_REFERENCE);
  assert.ok(Array.isArray(config.commands));
  return config.commands.map((value, index) => {
    const command = strictObject(value, ["argv", "expectedExitCode", "name"], `Command ${index}`);
    assert.equal(command.name, RECEIPT_NAMES[index]);
    assert.equal(command.expectedExitCode, 0);
    assert.ok(Array.isArray(command.argv));
    return command as {name: string; argv: string[]; expectedExitCode: number};
  });
};

const assertReceiptBindings = (manifestReceipts: unknown, commands: ReturnType<typeof expectedCommands>) => {
  assert.ok(Array.isArray(manifestReceipts));
  assert.equal(manifestReceipts.length, RECEIPT_NAMES.length);
  const bindings = manifestReceipts.map((value, index) => validateFileBinding(ROOT, value, `${SPEC0003_PROOF_ROOT}/receipts/${RECEIPT_NAMES[index]}.json`));
  for (const [index, binding] of bindings.entries()) {
    const receipt = strictObject(readJson(binding.path), ["argv", "exitCode", "expectedExitCode", "name", "passed", "receiptVersion", "signal", "stderrSha256", "stderrTail", "stdoutSha256", "stdoutTail"], `Receipt ${index}`);
    assert.equal(receipt.receiptVersion, 1);
    assert.equal(receipt.name, RECEIPT_NAMES[index]);
    assert.deepEqual(receipt.argv, commands[index]!.argv);
    assert.equal(receipt.exitCode, 0);
    assert.equal(receipt.expectedExitCode, 0);
    assert.equal(receipt.signal, null);
    assert.equal(receipt.passed, true);
  }
  return bindings;
};

const assertRunnerDiffScoped = () => {
  const source = readFileSync(repositoryPath(ROOT, "scripts/runSpec0001BrowserProof.ts"), "utf8");
  const ids = ["availability-import", "availability-ledger", "availability-route", "availability-context", "availability-final-assertion", "availability-real-route-count", "availability-baseline"];
  for (const id of ids) {
    assert.equal(source.split(`SPEC0003_D0031_BEGIN:${id}`).length, 2);
    assert.equal(source.split(`SPEC0003_D0031_END:${id}`).length, 2);
  }
  const diff = git("diff", "--unified=0", SPEC0003_BASE_COMMIT, "--", "scripts/runSpec0001BrowserProof.ts");
  assert.ok(diff.includes("validateSpec0003StickAvailabilityRequest"));
  assert.ok(diff.includes("assertExactSpec0003StickAvailabilityRecords"));
  assert.ok(!/compatibilityBrowserRoute|runVersion2Proof|runPhase[3456]BrowserProof/.test(diff));
};

const validateAvailabilityEvidence = (manifestRecords: unknown) => {
  assert.ok(Array.isArray(manifestRecords));
  assertExactSpec0003StickAvailabilityRecords(manifestRecords as Spec0003StickAvailabilityRecord[]);
  const ledgerRecords = parseNdjson(`${EVIDENCE_ROOT}/browser-network.ndjson`)
    .filter((entry) => entry.kind === "spec0003-stick-availability/v1")
    .map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "at" && key !== "kind")) as Spec0003StickAvailabilityRecord);
  assertExactSpec0003StickAvailabilityRecords(ledgerRecords);
  assert.deepEqual(manifestRecords, ledgerRecords);
  return ledgerRecords;
};

const validateManifest = (manifestPath: string) => {
  const value = readJson(manifestPath);
  const schema = strictObject(readJson(SPEC0003_SCHEMA_PATH), ["$defs", "$id", "$schema", "additionalProperties", "properties", "required", "type"], "Proof manifest schema");
  assert.equal(schema.$id, "diamond-animator/spec0003/permanent-tester-prerequisite-proof-v1");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["manifestVersion", "specId", "prerequisiteId", "baseCommit", "headCommit", "productRuntimeReferenceCommit", "recordedAt", "commandConfig", "contract", "receipts", "artifacts", "gitState", "permanentTester", "lintRegression", "registrations", "cleanup", "commandsPassed"]);
  const manifest = strictObject(value, [
    "artifacts", "baseCommit", "cleanup", "commandConfig", "commandsPassed", "contract", "gitState", "headCommit",
    "lintRegression", "manifestVersion", "permanentTester", "prerequisiteId", "productRuntimeReferenceCommit",
    "receipts", "recordedAt", "registrations", "specId",
  ], "Proof manifest");
  assert.equal(manifest.baseCommit, SPEC0003_BASE_COMMIT);
  assert.equal(manifest.headCommit, SPEC0003_BASE_COMMIT);
  assert.equal(manifest.productRuntimeReferenceCommit, SPEC0003_PRODUCT_RUNTIME_REFERENCE);
  assert.equal(git("rev-parse", "HEAD").trim(), SPEC0003_BASE_COMMIT);
  assert.equal(git("diff", "--cached", "--name-only").trim(), "");
  assert.deepEqual(dirtyPaths(), [...SPEC0003_AUTHORIZED_PATHS]);
  assert.deepEqual(readJson(SPEC0003_CONTRACT_PATH), expectedContractFixture());
  validateFileBinding(ROOT, manifest.commandConfig, SPEC0003_COMMANDS_PATH);
  validateFileBinding(ROOT, manifest.contract, SPEC0003_CONTRACT_PATH);
  const commands = expectedCommands();
  const receipts = assertReceiptBindings(manifest.receipts, commands);

  const gitState = strictObject(manifest.gitState, ["dirtyPaths", "hiddenFlags", "indexEmpty", "productRuntimeChangedPaths", "runnerDiffScoped"], "Git state");
  assert.deepEqual(gitState.dirtyPaths, [...SPEC0003_AUTHORIZED_PATHS]);
  assert.deepEqual(gitState.hiddenFlags, []);
  assert.deepEqual(git("ls-files", "-v").split("\n").filter((line) => /^[a-z]/.test(line)), []);
  const runtimeChanges = git("diff", "--name-only", SPEC0003_PRODUCT_RUNTIME_REFERENCE, "--", "app", "src", "public", "package.json", "package-lock.json").trim().split("\n").filter(Boolean);
  assert.deepEqual(runtimeChanges, []);
  assert.deepEqual(gitState.productRuntimeChangedPaths, []);
  assertRunnerDiffScoped();

  assert.ok(Array.isArray(manifest.artifacts));
  const artifacts = manifest.artifacts.map((binding) => validateFileBinding(ROOT, binding));
  const artifactPaths = artifacts.map((binding) => binding.path);
  assert.deepEqual(artifactPaths, [...SPEC0003_AUTHORIZED_PATHS, ...listFiles(EVIDENCE_ROOT)], "Artifact inventory must be exact and ordered.");
  assert.equal(new Set(artifactPaths).size, artifactPaths.length, "Artifact bindings must be unique.");
  for (const binding of receipts) assert.equal(artifactPaths.includes(binding.path), false, "Receipts must remain in the ordered receipt list, not be duplicated as artifacts.");

  const permanent = strictObject(manifest.permanentTester, [
    "availabilityExchanges", "browserNonLoopbackAttemptCount", "consoleErrorCount", "drawingPostCount", "driverMessageCount",
    "negativeCaseCount", "operationCount", "policyViolationCount", "realApiRouteRequestCount", "result", "screenshotCount",
  ], "Permanent tester evidence");
  validateFileBinding(ROOT, permanent.result, `${EVIDENCE_ROOT}/result.json`);
  validateAvailabilityEvidence(permanent.availabilityExchanges);
  const result = readJson(`${EVIDENCE_ROOT}/result.json`) as JsonObject;
  const network = result.network as JsonObject;
  const cleanup = result.cleanup as JsonObject;
  const consoleEvidence = result.console as JsonObject;
  assert.equal((result.operations as unknown[]).length, 40);
  assert.equal((result.screenshots as unknown[]).length, 13);
  assert.equal((result.driverMessages as unknown[]).length, 4);
  assert.equal((result.requestRecords as unknown[]).length, 1);
  assert.equal((readJson(`${EVIDENCE_ROOT}/negative-cases.json`) as {results: unknown[]}).results.length, 37);
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
  assert.deepEqual(manifest.registrations, ["phase-3", "phase-4", "phase-5", "phase-6"]);
  assert.deepEqual(manifest.lintRegression, {baseCommit: SPEC0003_BASE_COMMIT, passed: true});
  assert.deepEqual(manifest.cleanup, {passed: true, legacyOutputRemoved: true, nextBuildPresent: false, residualProfiles: 0, residualPorts: 0});
  assert.equal(manifest.commandsPassed, true);
  assert.equal(existsSync(repositoryPath(ROOT, LEGACY_BROWSER_ROOT)), false);
  assert.equal(existsSync(repositoryPath(ROOT, ".next")), false);
  return {receiptCount: receipts.length, artifactCount: artifacts.length, availabilityCount: 4};
};

const selfTest = () => {
  const origin = "http://127.0.0.1:43111";
  const records = SPEC0003_EXPECTED_CONTEXTS.map((context, index) => validateSpec0003StickAvailabilityRequest({
    order: index + 1,
    context,
    expectedOrigin: origin,
    url: `${origin}/api/ai`,
    method: "GET",
    workspaceHeader: "stick-figure",
    acceptHeader: "application/json",
    body: null,
  }));
  assertExactSpec0003StickAvailabilityRecords(records);
  assert.throws(() => validateSpec0003StickAvailabilityRequest({...records[0]!, expectedOrigin: origin, url: `${origin}/api/ai?x=1`} as never), /search|Expected values/);
  assert.throws(() => validateSpec0003StickAvailabilityRequest({order: 1, context: "stick-1024x768", expectedOrigin: origin, url: `${origin}/api/ai`, method: "GET", workspaceHeader: "stick-figure", acceptHeader: "application/json", body: null}), /context\/order/);
  assert.throws(() => validateSpec0003StickAvailabilityRequest({order: 1, context: "stick-1440x900", expectedOrigin: origin, url: `${origin}/api/ai`, method: "POST", workspaceHeader: "stick-figure", acceptHeader: "application/json", body: null}));
  assert.throws(() => validateSpec0003StickAvailabilityRequest({order: 1, context: "stick-1440x900", expectedOrigin: origin, url: `${origin}/api/ai`, method: "GET", workspaceHeader: "drawing", acceptHeader: "application/json", body: null}));
  assert.throws(() => assertExactSpec0003StickAvailabilityRecords(records.slice(0, 3)));
  assert.throws(() => assertExactSpec0003StickAvailabilityRecords([...records].reverse()));
  assert.deepEqual(readJson(SPEC0003_CONTRACT_PATH), expectedContractFixture());
  assert.deepEqual(sortPaths([...SPEC0003_AUTHORIZED_PATHS].reverse()), [...SPEC0003_AUTHORIZED_PATHS]);
  console.log("SPEC-0003 D-0031 validator self-test PASS: exact four-request contract plus missing, extra, reordered, queried, wrong-context, wrong-method, and wrong-header rejection.");
};

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--self-test") selfTest();
else {
  assert.ok(args.length <= 1 && (args.length === 0 || args[0]!.startsWith("--manifest=")), "Use no arguments, --manifest=<path>, or --self-test.");
  const manifestPath = args[0]?.slice("--manifest=".length) || SPEC0003_MANIFEST_PATH;
  const result = validateManifest(manifestPath);
  console.log(`SPEC-0003 D-0031 proof validation PASS: ${result.receiptCount} receipts, ${result.artifactCount} artifacts, ${result.availabilityCount} exact availability GETs, one Drawing POST, zero real/non-loopback requests.`);
}
