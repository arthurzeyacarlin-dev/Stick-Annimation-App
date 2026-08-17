import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync} from "node:fs";
import {basename, dirname, relative, resolve, sep} from "node:path";
import {
  COMPATIBILITY_OUTPUT_ROOT,
  CORRECTION_PATHS,
  type ExtensionResult,
} from "./browserTesterExtensionContract.ts";

type JsonObject = Record<string, unknown>;
type FileBinding = {path: string; sha256: string; byteLength: number};
type Command = {
  name: string;
  argv: string[];
  cwd: ".";
  env: Record<string, string>;
  expectedExitCode: number;
  privacy: "sanitized";
  capturesLintMeasurement?: true;
};

const ROOT = process.cwd();
const REAL_ROOT = realpathSync(ROOT);
const BASE_COMMIT = "8b663d2b80144e9aeba9ea0ecf0f78ccefa78926";
const PRE_EDIT_RESULT_SHA256 = "sha256:47e9e63508ce28f1acf4afcec53180420418182e7e43ab977bd2ec58cded7585";
const PRE_EDIT_RESULT_BYTE_LENGTH = 79799;
const COMMAND_CONFIG_PATH = "scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-proof-commands.json";
const MANIFEST_PATH = `${COMPATIBILITY_OUTPUT_ROOT}/proof-manifest.json`;
const GIT_EXECUTABLE = "/usr/bin/git";
const BROWSER_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TYPESCRIPT_EXECUTABLE = "node_modules/typescript/bin/tsc";
const NPM_PACKAGE_JSON = resolve(dirname(process.execPath), "../lib/node_modules/npm/package.json");
const RECEIPT_NAMES = [
  "compatibility-self-test",
  "shared-proof-self-test",
  "closeout-self-test",
  "phase-1-contract-regression",
  "typescript",
  "lint-regression",
  "diff-check",
  "synthetic-browser",
  "status",
] as const;
const EXPECTED_ARGV = [
  ["node", "--experimental-strip-types", "scripts/spec0001-browser/validatePhase15Compatibility.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/validateSpec0001ProofBundle.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/spec0001-browser/finalizePhase15CompatibilityCloseout.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${BASE_COMMIT}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--plan=scripts/fixtures/spec0001-browser/v2/phase-1.5-compatibility-browser-plan.json"],
  ["git", "status", "--short", "--branch"],
] as const;
const SYNTHETIC_FILES = [
  "synthetic/runner-result.json",
  "synthetic/action-ledger.json",
  "synthetic/negative-ledger.json",
  "synthetic/checkpoint-ledger.json",
  "synthetic/storage-ledger.json",
  "synthetic/request-ledger.json",
  "synthetic/network-ledger.json",
  "synthetic/console-ledger.json",
  "synthetic/regression-ledger.json",
  "synthetic/cleanup.json",
  "synthetic/screenshots/phase-1.5-compatibility.png",
] as const;

const sha256Bytes = (value: Uint8Array | string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};
const repositoryPath = (path: string) => {
  const absolute = resolve(REAL_ROOT, path);
  const local = relative(REAL_ROOT, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `Path escapes repository: ${path}`);
  let cursor = REAL_ROOT;
  for (const part of local.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor)) {
      assert.equal(lstatSync(cursor).isSymbolicLink(), false, `Symlink path rejected: ${relative(REAL_ROOT, cursor)}`);
      assert.equal(realpathSync(cursor), resolve(REAL_ROOT, relative(REAL_ROOT, cursor)), `Real path escaped repository: ${relative(REAL_ROOT, cursor)}`);
    }
  }
  return absolute;
};
const bindFile = (path: string): FileBinding => {
  const absolute = repositoryPath(path);
  assert.equal(lstatSync(absolute).isFile(), true, `Proof binding must be a regular file: ${path}`);
  const bytes = readFileSync(absolute);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};
const strictObject = (value: unknown, keys: readonly string[], label: string) => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value as JsonObject).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return value as JsonObject;
};
const proofEnvironment = () => {
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "HOME", "USER", "LOGNAME", "SHELL", "TERM"]) if (process.env[key]) env[key] = process.env[key];
  env.PATH = "/usr/bin:/bin:/opt/homebrew/bin";
  env.NODE_NO_WARNINGS = "1";
  return env;
};
const gitEnvironment = () => {
  const env = proofEnvironment();
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
};
const ensureDirectory = (path: string) => {
  const absolute = repositoryPath(path);
  let cursor = REAL_ROOT;
  for (const part of relative(REAL_ROOT, absolute).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) mkdirSync(cursor, {mode: 0o700});
    assert.equal(lstatSync(cursor).isSymbolicLink(), false, `Proof directory symlink rejected: ${relative(REAL_ROOT, cursor)}`);
    assert.equal(lstatSync(cursor).isDirectory(), true, `Proof directory component is not a directory: ${relative(REAL_ROOT, cursor)}`);
    assert.equal(realpathSync(cursor), resolve(REAL_ROOT, relative(REAL_ROOT, cursor)), `Proof directory escaped repository: ${relative(REAL_ROOT, cursor)}`);
  }
  return absolute;
};
const writeExclusive = (path: string, bytes: string) => {
  ensureDirectory(relative(REAL_ROOT, dirname(repositoryPath(path))));
  writeFileSync(repositoryPath(path), bytes, {encoding: "utf8", mode: 0o600, flag: "wx"});
  return bindFile(path);
};
const git = (...argv: string[]) => {
  const result = spawnSync(GIT_EXECUTABLE, argv, {cwd: ROOT, encoding: "utf8", shell: false, env: gitEnvironment()});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout;
};
const trustedCommand = (command: Command) => {
  if (command.argv[0] === "node") return {executable: process.execPath, logicalId: "node:process.execPath", argv: command.argv.slice(1), normalizedArgv: command.argv.slice(1)};
  if (command.argv[0] === "git") return {executable: GIT_EXECUTABLE, logicalId: "system:/usr/bin/git", argv: command.argv.slice(1), normalizedArgv: command.argv.slice(1)};
  if (command.argv[0] === "./node_modules/.bin/tsc") return {
    executable: process.execPath,
    logicalId: "node:process.execPath",
    argv: [repositoryPath(TYPESCRIPT_EXECUTABLE), ...command.argv.slice(1)],
    normalizedArgv: [TYPESCRIPT_EXECUTABLE, ...command.argv.slice(1)],
  };
  throw new Error(`Command executable is outside the trusted compatibility set: ${command.argv[0]}`);
};
const bindExecutable = (path: string, logicalId: string) => {
  const resolved = realpathSync(path);
  const status = lstatSync(resolved);
  assert.equal(status.isFile(), true, `Trusted executable must resolve to a regular file: ${logicalId}`);
  assert.equal(status.isSymbolicLink(), false, `Trusted executable may not resolve to a symlink: ${logicalId}`);
  const bytes = readFileSync(resolved);
  return {logicalId, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};
const bindExternalFile = (path: string) => {
  const resolved = realpathSync(path);
  assert.equal(resolved, path, `External proof dependency may not resolve through a symlink: ${path}`);
  const status = lstatSync(resolved);
  assert.ok(status.isFile() && !status.isSymbolicLink(), `External proof dependency must be a regular file: ${path}`);
  const bytes = readFileSync(resolved);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};
const bindEnvironment = (environment: NodeJS.ProcessEnv, gitMode: boolean) => {
  const exact = Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === "string").sort(([left], [right]) => left.localeCompare(right)));
  return {
    policy: gitMode ? "proof-scrubbed-git-v2" : "proof-scrubbed-v2",
    keys: Object.keys(exact),
    sha256: sha256Bytes(stableJson(exact)),
  };
};
const nulList = (value: string) => value.split("\0").filter(Boolean);
const observedDirtyPaths = () => [...new Set([
  ...nulList(git("diff", "--name-only", "-z")),
  ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
])].sort();
const sourceState = () => {
  const files = CORRECTION_PATHS.map(bindFile);
  return {
    headCommit: git("rev-parse", "HEAD").trim(),
    indexEmpty: git("diff", "--cached", "--name-only").trim() === "",
    observedDirtyPaths: observedDirtyPaths(),
    files,
    sha256: sha256Bytes(stableJson(files)),
  };
};
const listFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Proof output may not contain symlinks: ${relative(ROOT, absolute)}`);
    if (entry.isDirectory()) return listFiles(absolute);
    assert.ok(entry.isFile(), `Unsupported proof output type: ${relative(ROOT, absolute)}`);
    return [relative(ROOT, absolute)];
  }).sort();
};
const capturedBytes = (bytes: Buffer) => ({
  encoding: "base64" as const,
  byteLength: bytes.byteLength,
  sha256: sha256Bytes(bytes),
  data: bytes.toString("base64"),
});
const assertSanitizedOutput = (bytes: Buffer, label: string) => {
  const text = bytes.toString("utf8");
  assert.doesNotMatch(text, /(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|authorization|secret)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,})/i, `${label} contains secret-shaped output.`);
  for (const sensitive of [REAL_ROOT, process.env.HOME, process.env.TMPDIR].filter((value): value is string => typeof value === "string" && value.length > 4)) assert.equal(text.includes(sensitive), false, `${label} contains an absolute private path.`);
};

const parseArgs = () => {
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    assert.ok(match && !values.has(match[1]), `Unsupported or duplicate argument: ${argument}`);
    values.set(match[1], match[2]);
  }
  assert.deepEqual([...values.keys()].sort(), ["base", "commands", "output"], "Recorder arguments must be exact.");
  assert.equal(values.get("base"), BASE_COMMIT);
  assert.equal(values.get("commands"), COMMAND_CONFIG_PATH);
  assert.equal(values.get("output"), MANIFEST_PATH);
  return {base: values.get("base")!, commands: values.get("commands")!, output: values.get("output")!};
};

const validateConfig = (value: unknown) => {
  const config = strictObject(value, ["baseCommit", "commands", "configVersion", "outputRoot", "phase", "preEditNoPlan", "specId"], "Compatibility command config");
  assert.equal(config.configVersion, 2);
  assert.equal(config.specId, "SPEC-0001");
  assert.equal(config.phase, "1.5-compatibility");
  assert.equal(config.baseCommit, BASE_COMMIT);
  assert.equal(config.outputRoot, COMPATIBILITY_OUTPUT_ROOT);
  const preflight = strictObject(config.preEditNoPlan, [
    "cleanupPassed", "driverMessageCount", "nonLoopbackAttemptCount", "operationCount", "realApiRouteRequestCount",
    "requestCount", "resultByteLength", "resultSha256", "screenshotCount",
  ], "Pre-edit no-plan evidence");
  assert.equal(preflight.resultSha256, PRE_EDIT_RESULT_SHA256, "Pre-edit no-plan result SHA drifted.");
  assert.equal(preflight.resultByteLength, PRE_EDIT_RESULT_BYTE_LENGTH, "Pre-edit no-plan result byte length drifted.");
  assert.deepEqual({
    operationCount: preflight.operationCount,
    screenshotCount: preflight.screenshotCount,
    driverMessageCount: preflight.driverMessageCount,
    requestCount: preflight.requestCount,
    nonLoopbackAttemptCount: preflight.nonLoopbackAttemptCount,
    realApiRouteRequestCount: preflight.realApiRouteRequestCount,
    cleanupPassed: preflight.cleanupPassed,
  }, {operationCount: 40, screenshotCount: 13, driverMessageCount: 4, requestCount: 1, nonLoopbackAttemptCount: 0, realApiRouteRequestCount: 0, cleanupPassed: true});
  assert.ok(Array.isArray(config.commands) && config.commands.length === 9);
  const commands = (config.commands as unknown[]).map((entry, index) => {
    const hasLint = index === 5;
    const command = strictObject(entry, hasLint
      ? ["argv", "capturesLintMeasurement", "cwd", "env", "expectedExitCode", "name", "privacy"]
      : ["argv", "cwd", "env", "expectedExitCode", "name", "privacy"], `Command ${index + 1}`) as unknown as Command;
    assert.equal(command.name, RECEIPT_NAMES[index]);
    assert.deepEqual(command.argv, EXPECTED_ARGV[index]);
    assert.equal(command.cwd, ".");
    assert.deepEqual(command.env, {});
    assert.equal(command.expectedExitCode, 0);
    assert.equal(command.privacy, "sanitized");
    assert.ok(!["sh", "bash", "zsh"].includes(command.argv[0]) && !command.argv.includes("-c"));
    if (hasLint) assert.equal(command.capturesLintMeasurement, true);
    return command;
  });
  return {commands, preflight};
};

const main = () => {
  const args = parseArgs();
  assert.equal(lstatSync(GIT_EXECUTABLE).isFile(), true, "Trusted Git executable is missing.");
  assert.equal(lstatSync(repositoryPath(TYPESCRIPT_EXECUTABLE)).isFile(), true, "Trusted TypeScript executable is missing.");
  assert.equal(git("rev-parse", "HEAD").trim(), args.base, "Recorder must run at the correction base commit.");
  assert.equal(git("diff", "--cached", "--name-only").trim(), "", "Git index must be empty.");
  assert.deepEqual(observedDirtyPaths(), [...CORRECTION_PATHS], "Recorder dirty set must be the exact frozen 23 paths.");
  for (const path of CORRECTION_PATHS) {
    const absolute = repositoryPath(path);
    assert.equal(lstatSync(absolute).isFile(), true, `Authorized implementation path must be a regular file: ${path}`);
  }
  assert.ok(!existsSync(repositoryPath(COMPATIBILITY_OUTPUT_ROOT)), "Compatibility proof output root must not exist before recording.");

  const configBytes = readFileSync(repositoryPath(args.commands));
  const configValue = JSON.parse(configBytes.toString("utf8")) as unknown;
  const {commands, preflight} = validateConfig(configValue);
  ensureDirectory(`${COMPATIBILITY_OUTPUT_ROOT}/receipts`);

  const receiptBindings: FileBinding[] = [];
  let commandsPassed = true;
  let lintRegression: unknown = null;
  const beforeCommands = sourceState();
  for (const [index, command] of commands.entries()) {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const invocation = trustedCommand(command);
    const gitMode = command.argv[0] === "git";
    const effectiveEnvironment = {...(gitMode ? gitEnvironment() : proofEnvironment()), ...command.env};
    const result = spawnSync(invocation.executable, invocation.argv, {
      cwd: ROOT,
      env: effectiveEnvironment,
      encoding: "buffer",
      shell: false,
      maxBuffer: 128 * 1024 * 1024,
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "");
    assertSanitizedOutput(Buffer.concat([stdout, stderr]), `Command ${index + 1}`);
    const exitCode = result.status ?? 255;
    let receiptLint: unknown = null;
    if (command.capturesLintMeasurement) {
      assert.equal(exitCode, 0, "Lint measurement command failed before emitting trusted JSON.");
      receiptLint = JSON.parse(stdout.toString("utf8"));
      lintRegression = receiptLint;
    }
    const passed = exitCode === command.expectedExitCode;
    commandsPassed &&= passed;
    const receipt = {
      receiptVersion: 2,
      name: command.name,
      order: index + 1,
      argv: command.argv,
      cwd: command.cwd,
      env: command.env,
      execution: {
        policy: "closed-executable-v1",
        executable: bindExecutable(invocation.executable, invocation.logicalId),
        argv: invocation.normalizedArgv,
        environment: bindEnvironment(effectiveEnvironment, gitMode),
      },
      privacy: command.privacy,
      startedAt,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      exitCode,
      expectedExitCode: command.expectedExitCode,
      passed,
      stdout: capturedBytes(stdout),
      stderr: capturedBytes(stderr),
      lintRegression: receiptLint,
    };
    const receiptPath = `${COMPATIBILITY_OUTPUT_ROOT}/receipts/${String(index + 1).padStart(2, "0")}-${basename(command.name)}.json`;
    receiptBindings.push(writeExclusive(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`));
  }

  assert.equal(commandsPassed, true, "One or more compatibility proof commands failed.");
  assert.ok(lintRegression !== null, "Lint regression receipt is missing.");
  const afterCommands = sourceState();
  assert.deepEqual(afterCommands, beforeCommands, "Compatibility commands changed the frozen implementation/Git state.");
  const runnerResultPath = `${COMPATIBILITY_OUTPUT_ROOT}/synthetic/runner-result.json`;
  const runnerResult = JSON.parse(readFileSync(repositoryPath(runnerResultPath), "utf8")) as ExtensionResult;
  const resultObject = runnerResult as unknown as JsonObject;
  const resultRuntime = strictObject(resultObject.runtime, ["browserExecutable", "browserVersion", "nodeVersion", "playwrightCoreVersion"], "Runner result runtime");
  assert.deepEqual(resultRuntime.browserExecutable, bindExternalFile(BROWSER_EXECUTABLE), "Runner browser executable binding drifted before recording.");
  const bindings = strictObject(resultObject.bindings, ["adapter", "catalog", "plan", "registry"], "Runner result bindings");
  const authorization = strictObject(resultObject.authorization, ["authorizationId", "materializationKind"], "Runner authorization");
  const expectedOutputFiles = [
    ...receiptBindings.map((binding) => binding.path),
    ...SYNTHETIC_FILES.map((path) => `${COMPATIBILITY_OUTPUT_ROOT}/${path}`),
  ].sort();
  assert.deepEqual(listFiles(repositoryPath(COMPATIBILITY_OUTPUT_ROOT)), expectedOutputFiles, "Pre-manifest output tree must contain exactly 20 artifacts.");
  const artifacts = [...expectedOutputFiles, ...CORRECTION_PATHS].sort().map(bindFile);
  assert.equal(artifacts.length, 43);

  assert.equal(lstatSync(NPM_PACKAGE_JSON).isFile(), true, "npm package metadata is missing.");
  const npmPackage = JSON.parse(readFileSync(NPM_PACKAGE_JSON, "utf8")) as {version?: unknown};
  assert.ok(typeof npmPackage.version === "string" && npmPackage.version.length > 0, "npm package version is missing.");
  const manifest = {
    manifestVersion: 2,
    specId: "SPEC-0001",
    phase: "1.5-compatibility",
    baseCommit: BASE_COMMIT,
    headCommit: git("rev-parse", "HEAD").trim(),
    recordedAt: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      npmVersion: npmPackage.version,
      playwrightCoreVersion: (resultObject.runtime as JsonObject).playwrightCoreVersion,
      browserVersion: (resultObject.runtime as JsonObject).browserVersion,
      browserExecutable: resultRuntime.browserExecutable,
      environmentPolicy: "proof-scrubbed-v2",
    },
    preEditNoPlan: preflight,
    commandConfig: {path: args.commands, sha256: sha256Bytes(configBytes), byteLength: configBytes.byteLength},
    receipts: receiptBindings,
    artifacts,
    testerExtension: {
      result: bindFile(runnerResultPath),
      authorizationId: authorization.authorizationId,
      materializationKind: authorization.materializationKind,
      derivedGitState: resultObject.derivedGitState,
      observedDirtyPaths: resultObject.observedDirtyPaths,
      dirtyExpectedPaths: resultObject.dirtyExpectedPaths,
      cleanExpectedPaths: resultObject.cleanExpectedPaths,
      selectedExpectedPaths: resultObject.selectedExpectedPaths,
      catalog: bindings.catalog,
      plan: bindings.plan,
      registry: bindings.registry,
      adapter: bindings.adapter,
    },
    lintRegression,
    gitState: {before: beforeCommands, after: afterCommands, unchanged: true},
    network: resultObject.network,
    cleanup: {passed: true, residualPaths: (resultObject.cleanup as JsonObject).residualPaths},
    commandsPassed: true,
  };
  writeExclusive(args.output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Recorded 9 compatibility receipts and 43 bound artifacts at ${args.output}.`);
};

main();
