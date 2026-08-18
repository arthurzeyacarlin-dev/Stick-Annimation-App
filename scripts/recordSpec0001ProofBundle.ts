import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync} from "node:fs";
import {basename, dirname, relative, resolve, sep} from "node:path";
import {compareIndexToHeadEntries} from "./spec0001-browser/browserTesterExtensionContract.ts";
import {BROWSER_EXECUTABLE} from "./spec0001-browser/browserTesterContract.ts";

type CommandConfig = {
  name: string;
  argv: string[];
  cwd: ".";
  env: Record<string, string>;
  expectedExitCode: number;
  privacy: "sanitized";
  lintBaseline?: {errors: 6; warnings: 73; phasePathFindings: 0};
};

type ProofCommandConfig = {
  configVersion: 1 | 2;
  phase: number;
  baseCommit: string;
  bindings: {
    sources: string[];
    fixtures: string[];
    schemas: string[];
    harness: string[];
    plans: string[];
  };
  browserEvidenceInput: string | null;
  commands: CommandConfig[];
};

const ROOT = process.cwd();
const SYSTEM_GIT = "/usr/bin/git";
const FIXED_PROOF_PATH = "/usr/bin:/bin:/opt/homebrew/bin";
const PROOF_ENVIRONMENT_KEYS = ["HOME", "USER", "LOGNAME", "SHELL", "TERM", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"] as const;
const PROOF_RELEVANT_GIT_ENV = /^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG(?:$|_)|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|NAMESPACE|GRAFT_FILE|NO_REPLACE_OBJECTS|REPLACE_REF_BASE|SHALLOW_FILE|QUARANTINE_PATH|PREFIX|SUPER_PREFIX)$/;
const sha256Bytes = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fileBinding = (path: string) => {
  const bytes = readFileSync(resolve(ROOT, path));
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const safeV2Path = (path: string, requireLeaf = true) => {
  if (path.length === 0 || path.includes("\0") || path.includes("\\") || path.startsWith("/")) throw new Error(`Version 2 path is malformed: ${path}`);
  const absolute = resolve(ROOT, path);
  const local = relative(ROOT, absolute);
  if (local !== path || local === ".." || local.startsWith(`..${sep}`)) throw new Error(`Version 2 path escapes or is non-canonical: ${path}`);
  const rootReal = realpathSync(ROOT);
  let current = ROOT;
  const parts = local.split(sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    if (!existsSync(current)) {
      if (requireLeaf) throw new Error(`Version 2 path is missing: ${path}`);
      break;
    }
    const stats = lstatSync(current);
    if (stats.isSymbolicLink()) throw new Error(`Version 2 symlink component rejected: ${relative(ROOT, current)}`);
    if (index < parts.length - 1 && !stats.isDirectory()) throw new Error(`Version 2 parent is not a directory: ${relative(ROOT, current)}`);
    if (realpathSync(current) !== resolve(rootReal, relative(ROOT, current))) throw new Error(`Version 2 real path escaped the repository: ${relative(ROOT, current)}`);
  }
  return absolute;
};

const v2FileBinding = (path: string) => {
  const absolute = safeV2Path(path);
  if (!lstatSync(absolute).isFile()) throw new Error(`Version 2 binding is not a regular file: ${path}`);
  const bytes = readFileSync(absolute);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const v2BrowserExecutableBinding = () => {
  const stats = lstatSync(BROWSER_EXECUTABLE);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size <= 0) throw new Error("Version 2 browser executable must be a nonempty regular non-symlink file.");
  if (realpathSync(BROWSER_EXECUTABLE) !== BROWSER_EXECUTABLE) throw new Error("Version 2 browser executable real path drifted.");
  const bytes = readFileSync(BROWSER_EXECUTABLE);
  return {path: BROWSER_EXECUTABLE, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const ensureV2Directory = (path: string) => {
  const absolute = safeV2Path(path, false);
  let current = ROOT;
  for (const part of relative(ROOT, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (!existsSync(current)) mkdirSync(current, {mode: 0o700});
    const stats = lstatSync(current);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`Version 2 output directory component is unsafe: ${relative(ROOT, current)}`);
    const expectedReal = resolve(realpathSync(ROOT), relative(ROOT, current));
    if (realpathSync(current) !== expectedReal) throw new Error(`Version 2 output directory escaped the repository: ${relative(ROOT, current)}`);
  }
  return absolute;
};

const parseArgs = () => {
  const values = new Map<string, string>();
  const encounteredKeys: string[] = [];
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    encounteredKeys.push(match[1]);
    values.set(match[1], match[2]);
  }
  for (const key of ["phase", "base", "commands", "output"]) {
    if (!values.has(key)) throw new Error(`Missing --${key}=...`);
  }
  return {
    phase: Number(values.get("phase")),
    base: values.get("base")!,
    commands: values.get("commands")!,
    output: values.get("output")!,
    encounteredKeys,
  };
};

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8"});
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
};

const assertNoProofRelevantGitEnvironment = (environment: NodeJS.ProcessEnv) => {
  const redirected = Object.keys(environment).filter((key) => PROOF_RELEVANT_GIT_ENV.test(key)).sort();
  if (redirected.length > 0) throw new Error(`Proof-relevant Git environment variables are forbidden: ${redirected.join(", ")}`);
};

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
};

const v2Environment = (overrides: Record<string, string> = {}, gitMode = false) => {
  if (Object.keys(overrides).some((key) => /^GIT_/.test(key) || key === "NODE_OPTIONS" || key === "NODE_PATH")) throw new Error("Version 2 command environment may not define GIT_*, NODE_OPTIONS, or NODE_PATH.");
  const environment = {} as unknown as NodeJS.ProcessEnv;
  for (const key of PROOF_ENVIRONMENT_KEYS) if (typeof process.env[key] === "string") environment[key] = process.env[key];
  environment.PATH = FIXED_PROOF_PATH;
  Object.assign(environment, overrides);
  if (gitMode) {
    environment.GIT_CONFIG_NOSYSTEM = "1";
    environment.GIT_CONFIG_GLOBAL = "/dev/null";
    environment.GIT_OPTIONAL_LOCKS = "0";
  }
  return Object.fromEntries(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))) as NodeJS.ProcessEnv;
};

const gitV2 = (...argv: string[]) => {
  const result = spawnSync(SYSTEM_GIT, argv, {cwd: ROOT, encoding: "utf8", env: v2Environment({}, true), shell: false});
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
};

const gitV2Buffer = (...argv: string[]) => {
  const result = spawnSync(SYSTEM_GIT, argv, {cwd: ROOT, encoding: "buffer", env: v2Environment({}, true), shell: false, maxBuffer: 256 * 1024 * 1024});
  if (result.status !== 0) throw new Error(Buffer.from(result.stderr ?? "").toString("utf8") || `git ${argv.join(" ")} failed`);
  return Buffer.from(result.stdout ?? "");
};

type ClosedV2Execution = {
  executablePath: string;
  actualArgv: string[];
  environment: NodeJS.ProcessEnv;
  receipt: {
    policy: "closed-executable-v1";
    executable: {logicalId: "node:process.execPath" | "system:/usr/bin/git"; sha256: string; byteLength: number};
    argv: string[];
    environment: {policy: "proof-scrubbed-v2" | "proof-scrubbed-git-v2"; keys: string[]; sha256: string};
  };
};

const executableBindings = new Map<string, {logicalId: "node:process.execPath" | "system:/usr/bin/git"; sha256: string; byteLength: number}>();
const executableBinding = (path: string, logicalId: "node:process.execPath" | "system:/usr/bin/git") => {
  const cached = executableBindings.get(path);
  if (cached) return cached;
  const bytes = readFileSync(path);
  const binding = {logicalId, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
  executableBindings.set(path, binding);
  return binding;
};

const closeV2Command = (command: CommandConfig, boundPaths: readonly string[]): ClosedV2Execution => {
  const declared = command.argv;
  let executablePath: string;
  let logicalId: "node:process.execPath" | "system:/usr/bin/git";
  let actualArgv: string[];
  let normalizedArgv: string[];
  let gitMode = false;
  if (declared[0] === "node") {
    if (declared[1] !== "--experimental-strip-types" || declared.length < 3 || declared[2].startsWith("-")) throw new Error(`Version 2 command ${command.name} must use the exact Node strip-types prefix.`);
    const scriptIndex = 2;
    const scriptPath = declared[scriptIndex];
    if (!boundPaths.includes(scriptPath) || !/^scripts\/.+\.(?:cjs|js|mjs|ts)$/.test(scriptPath)) {
      throw new Error(`Version 2 command ${command.name} script is not an exact proof binding: ${scriptPath}`);
    }
    const local = relative(ROOT, resolve(ROOT, scriptPath));
    if (local === ".." || local.startsWith(`..${sep}`) || local !== scriptPath) throw new Error(`Version 2 command ${command.name} script path is unsafe.`);
    executablePath = process.execPath;
    logicalId = "node:process.execPath";
    actualArgv = declared.slice(1);
    normalizedArgv = [...actualArgv];
  } else if (declared[0] === "./node_modules/.bin/tsc") {
    if (JSON.stringify(declared.slice(1)) !== JSON.stringify(["--noEmit", "--incremental", "false"])) throw new Error("Version 2 TypeScript command must use the exact no-emit invocation.");
    executablePath = process.execPath;
    logicalId = "node:process.execPath";
    normalizedArgv = ["node_modules/typescript/bin/tsc", ...declared.slice(1)];
    actualArgv = [resolve(ROOT, normalizedArgv[0]), ...declared.slice(1)];
  } else if (declared[0] === "git") {
    const gitArgv = declared.slice(1);
    const allowed = JSON.stringify(gitArgv) === JSON.stringify(["diff", "--check"]) || JSON.stringify(gitArgv) === JSON.stringify(["status", "--short", "--branch"]);
    if (!allowed) throw new Error(`Version 2 command ${command.name} uses an unauthorized Git operation.`);
    executablePath = SYSTEM_GIT;
    logicalId = "system:/usr/bin/git";
    actualArgv = gitArgv;
    normalizedArgv = [...gitArgv];
    gitMode = true;
  } else throw new Error(`Version 2 command ${command.name} executable is outside the closed resolver: ${declared[0]}`);
  const environment = v2Environment(command.env, gitMode);
  const environmentRecord = Object.fromEntries(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right)));
  return {
    executablePath,
    actualArgv,
    environment,
    receipt: {
      policy: "closed-executable-v1",
      executable: executableBinding(executablePath, logicalId),
      argv: normalizedArgv,
      environment: {
        policy: gitMode ? "proof-scrubbed-git-v2" : "proof-scrubbed-v2",
        keys: Object.keys(environmentRecord),
        sha256: sha256Bytes(Buffer.from(stableJson(environmentRecord))),
      },
    },
  };
};

const assertSafeRelativePath = (path: string, expected: string) => {
  if (path !== expected || resolve(ROOT, path) !== resolve(ROOT, expected)) {
    throw new Error(`Output must be exactly ${expected}.`);
  }
  const relativePath = relative(ROOT, resolve(ROOT, path));
  if (relativePath.startsWith(`..${sep}`) || relativePath === "..") throw new Error("Path escapes the repository.");
};

const phaseOneExactCommands = [
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["node", "--experimental-strip-types", "scripts/validateSpec0001ProofBundle.ts", "--self-test"],
  ["node", "--experimental-strip-types", "scripts/finalizeSpec0001ProofBundle.ts", "--self-test"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["npm", "run", "lint"],
  ["git", "diff", "--check"],
  ["git", "status", "--short", "--branch"],
];

const phaseTwoExactCommands = (base: string) => [
  ["node", "--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${base}`],
  ["git", "diff", "--check"],
  ["node", "--experimental-strip-types", "scripts/runSpec0001BrowserProof.ts", "--plan=scripts/fixtures/stick-ai/v1/phase-2-browser-proof-plan.json"],
];

const nulList = (value: string) => value.split("\0").filter(Boolean);

const collectArtifacts = (configPath: string, commands: CommandConfig[], bindingPaths: string[], browserEvidenceInput: string | null, version: 1 | 2 = 1) => {
  const paths = new Set<string>([
    configPath,
    "scripts/recordSpec0001ProofBundle.ts",
    "scripts/validateSpec0001ProofBundle.ts",
    "scripts/finalizeSpec0001ProofBundle.ts",
    "scripts/fixtures/stick-ai/v1/proof-closeout-manifest.schema.json",
    "scripts/fixtures/stick-ai/v1/phase7-live-proof-manifest.schema.json",
    ...(version === 1
      ? [
        "scripts/fixtures/stick-ai/v1/proof-manifest.schema.json",
        "scripts/fixtures/stick-ai/v1/proof-command-receipt.schema.json",
      ]
      : [
        "scripts/spec0001-proof/measureSpec0001LintRegression.ts",
        "scripts/fixtures/stick-ai/v1/proof-manifest-v2.schema.json",
        "scripts/fixtures/stick-ai/v1/proof-command-receipt-v2.schema.json",
      ]),
    ...bindingPaths,
    ...(browserEvidenceInput ? [browserEvidenceInput] : []),
  ]);
  for (const command of commands) {
    for (const argument of command.argv) {
      const candidate = argument.startsWith("--") && argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : argument;
      const repositoryCandidate = candidate.replace(/^\.\//, "");
      if (!candidate.startsWith("-") && !repositoryCandidate.startsWith("node_modules/") && existsSync(resolve(ROOT, candidate))) {
        paths.add(repositoryCandidate);
      }
    }
  }
  return [...paths].filter((path) => !path.startsWith("output/") && existsSync(resolve(ROOT, path))).sort().map(version === 2 ? v2FileBinding : fileBinding);
};

const listFilesRecursively = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Proof output may not contain symlinks: ${relative(ROOT, absolute)}`);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else if (entry.isFile()) files.push(relative(ROOT, absolute));
    else throw new Error(`Unsupported proof artifact type: ${relative(ROOT, absolute)}`);
  }
  return files.sort();
};

const parseLintBaseline = (stdout: Buffer, stderr: Buffer, phaseSourcePaths: string[]) => {
  const output = Buffer.concat([stdout, stderr]).toString("utf8");
  const summary = /[✖x]\s+79 problems \(6 errors, 73 warnings\)/.test(output) || /6 errors?[, ]+73 warnings?/.test(output);
  const phasePathFindings = phaseSourcePaths.filter((path) => output.includes(resolve(ROOT, path)) || output.includes(`\n${path}\n`)).length;
  return {errors: summary ? 6 : -1, warnings: summary ? 73 : -1, phasePathFindings};
};

const exactKeys = (value: unknown, expected: readonly string[], label: string) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields must be exact.`);
  return value as Record<string, unknown>;
};

const validateBindingPathList = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) throw new Error(`${label} must be a string array.`);
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicate paths.`);
  for (const path of value) {
    const local = relative(ROOT, resolve(ROOT, path));
    if (local === ".." || local.startsWith(`..${sep}`) || !existsSync(resolve(ROOT, path))) throw new Error(`${label} contains an unsafe or missing path: ${path}`);
  }
  return value as string[];
};

const validateV2BindingPathList = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) throw new Error(`${label} must be a string array.`);
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicate paths.`);
  for (const path of value as string[]) {
    const absolute = safeV2Path(path);
    if (!lstatSync(absolute).isFile()) throw new Error(`${label} contains a non-regular file: ${path}`);
  }
  return value as string[];
};

const notApplicableBrowserEvidence = {
  evidenceVersion: 1,
  browserStatus: "not-applicable",
  notApplicableReason: "Phase 1 is an offline contract and proof-system phase with no browser harness or visible application flow.",
  browserVersion: null,
  browserPlan: null,
  operations: [],
  stateCheckpoints: [],
  storageCheckpoints: [],
  requestRecords: [],
  networkRecords: [],
  consoleRecords: [],
  screenshots: [],
  cleanup: {
    status: "not-applicable",
    reason: "No browser context, server, intercept, gate, screenshot, or proof-anchor instrumentation was created in Phase 1.",
    proofAnchor: {
      status: "not-applicable",
      targetPath: null,
      preimageSha256: null,
      replacementSha256: null,
      restoredSha256: null,
      instrumentationAttributableDiff: null,
    },
    isolatedContextCount: 0,
    closedContextCount: 0,
    activeGateCount: 0,
    activeInterceptCount: 0,
    childProcessCount: 0,
    openChildProcessCount: 0,
    residualArtifactPaths: [],
  },
} as const;

const requireStringArray = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${label} must be a string array.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicate values.`);
  return value as string[];
};

const requireFileBinding = (value: unknown, label: string) => {
  const binding = exactKeys(value, ["path", "sha256", "byteLength"], label);
  if (typeof binding.path !== "string" || !/^sha256:[0-9a-f]{64}$/.test(String(binding.sha256)) || !Number.isSafeInteger(binding.byteLength) || (binding.byteLength as number) < 0) {
    throw new Error(`${label} is invalid.`);
  }
  const observed = v2FileBinding(binding.path);
  if (observed.sha256 !== binding.sha256 || observed.byteLength !== binding.byteLength) throw new Error(`${label} does not match repository bytes.`);
  return observed;
};

const validateV2LintMeasurementForRecording = (value: unknown, baseCommit: string, headCommit: string) => {
  const measurement = exactKeys(value, [
    "measurementVersion", "specId", "baseCommit", "headCommit", "baseTree", "measuredAt", "runtime", "bindings",
    "base", "result", "changedJavaScriptPaths", "newJavaScriptPaths", "changedLineFindings", "newFileFindings",
    "gitState", "network", "cleanup", "passed",
  ], "Version 2 lint measurement");
  if (measurement.measurementVersion !== 2 || measurement.specId !== "SPEC-0001") throw new Error("Version 2 lint measurement identity mismatch.");
  if (measurement.baseCommit !== baseCommit || measurement.headCommit !== headCommit) throw new Error("Version 2 lint measurement Git binding mismatch.");
  if (!/^[0-9a-f]{40}$/.test(String(measurement.baseTree)) || typeof measurement.measuredAt !== "string" || Number.isNaN(Date.parse(measurement.measuredAt))) {
    throw new Error("Version 2 lint measurement base-tree/timestamp binding is invalid.");
  }
  exactKeys(measurement.runtime, ["nodeVersion", "eslintVersion"], "Version 2 lint runtime");
  const bindings = exactKeys(measurement.bindings, [
    "package", "packageLock", "eslintConfig", "networkGuard", "installedPackageLock", "eslintPackage",
    "eslintConfigNextPackage", "typescriptPackage", "dependencyTree", "measurer",
  ], "Version 2 lint bindings");
  for (const key of ["package", "packageLock", "eslintConfig", "networkGuard", "measurer"] as const) requireFileBinding(bindings[key], `Version 2 lint ${key} binding`);
  for (const key of ["installedPackageLock", "eslintPackage", "eslintConfigNextPackage", "typescriptPackage"] as const) {
    const binding = exactKeys(bindings[key], ["path", "sha256", "byteLength", "version"], `Version 2 lint ${key} binding`);
    requireFileBinding({path: binding.path, sha256: binding.sha256, byteLength: binding.byteLength}, `Version 2 lint ${key} file binding`);
    if (!(binding.version === null || (typeof binding.version === "string" && binding.version.length > 0))) throw new Error(`Version 2 lint ${key} version is invalid.`);
  }
  const dependencyTree = exactKeys(bindings.dependencyTree, ["path", "sha256", "entryCount", "byteLength"], "Version 2 lint dependency-tree binding");
  if (dependencyTree.path !== "node_modules" || !/^sha256:[0-9a-f]{64}$/.test(String(dependencyTree.sha256)) ||
    !Number.isSafeInteger(dependencyTree.entryCount) || (dependencyTree.entryCount as number) < 1 || !Number.isSafeInteger(dependencyTree.byteLength) || (dependencyTree.byteLength as number) < 1) {
    throw new Error("Version 2 lint dependency-tree binding is invalid.");
  }
  const validateMeasurement = (entry: unknown, label: string) => {
    const measured = exactKeys(entry, ["exitCode", "errors", "warnings", "rawOutput"], label);
    if (!(measured.exitCode === 0 || measured.exitCode === 1) || !Number.isSafeInteger(measured.errors) || (measured.errors as number) < 0 || !Number.isSafeInteger(measured.warnings) || (measured.warnings as number) < 0) {
      throw new Error(`${label} counts/exit are invalid.`);
    }
    const raw = exactKeys(measured.rawOutput, ["stdoutSha256", "stdoutByteLength", "stderrSha256", "stderrByteLength"], `${label} raw output`);
    if (!/^sha256:[0-9a-f]{64}$/.test(String(raw.stdoutSha256)) || !/^sha256:[0-9a-f]{64}$/.test(String(raw.stderrSha256)) ||
      !Number.isSafeInteger(raw.stdoutByteLength) || (raw.stdoutByteLength as number) < 0 || !Number.isSafeInteger(raw.stderrByteLength) || (raw.stderrByteLength as number) < 0) {
      throw new Error(`${label} raw-output binding is invalid.`);
    }
    return measured;
  };
  const base = validateMeasurement(measurement.base, "Version 2 lint base");
  const result = validateMeasurement(measurement.result, "Version 2 lint result");
  requireStringArray(measurement.changedJavaScriptPaths, "Version 2 lint changed paths");
  requireStringArray(measurement.newJavaScriptPaths, "Version 2 lint new paths");
  if (!Array.isArray(measurement.changedLineFindings) || measurement.changedLineFindings.length !== 0 || !Array.isArray(measurement.newFileFindings) || measurement.newFileFindings.length !== 0) {
    throw new Error("Version 2 lint must have zero changed-line and new-file findings.");
  }
  const gitState = exactKeys(measurement.gitState, ["beforeSha256", "afterSha256", "unchanged"], "Version 2 lint Git state");
  if (gitState.unchanged !== true || gitState.beforeSha256 !== gitState.afterSha256 || !/^sha256:[0-9a-f]{64}$/.test(String(gitState.beforeSha256))) throw new Error("Version 2 lint changed Git state.");
  const network = exactKeys(measurement.network, ["baseRecordCount", "resultRecordCount", "nonLoopbackAttemptCount"], "Version 2 lint network state");
  if (network.baseRecordCount !== 0 || network.resultRecordCount !== 0 || network.nonLoopbackAttemptCount !== 0) throw new Error("Version 2 lint attempted network access.");
  const cleanup = exactKeys(measurement.cleanup, ["temporaryRootRemoved"], "Version 2 lint cleanup");
  if (cleanup.temporaryRootRemoved !== true || measurement.passed !== true || (result.errors as number) > (base.errors as number) || (result.warnings as number) > (base.warnings as number)) {
    throw new Error("Version 2 lint comparison did not pass.");
  }
  return measurement;
};

const summarizeV2Evidence = (path: string, baseCommit: string, headCommit: string) => {
  const runnerResult = JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as Record<string, unknown>;
  const derivedGitState = runnerResult.derivedGitState;
  if (derivedGitState !== "dirty-executor" && derivedGitState !== "clean-committed") throw new Error("Version 2 runner result derived Git state is invalid.");
  if (runnerResult.baseCommit !== baseCommit || runnerResult.headCommit !== headCommit) throw new Error("Version 2 runner result Git binding mismatch.");
  const observedDirtyPaths = requireStringArray(runnerResult.observedDirtyPaths, "Runner observed dirty paths");
  const dirtyExpectedPaths = requireStringArray(runnerResult.dirtyExpectedPaths, "Runner dirty expectations");
  const cleanExpectedPaths = requireStringArray(runnerResult.cleanExpectedPaths, "Runner clean expectations");
  const selectedExpectedPaths = requireStringArray(runnerResult.selectedExpectedPaths, "Runner selected expectations");
  const authorization = exactKeys(runnerResult.authorization, ["authorizationId", "materializationKind"], "Runner authorization");
  if (authorization.authorizationId !== "phase-1.5-compatibility-synthetic/v1" && authorization.authorizationId !== "phase-2/v1") throw new Error("Runner authorization ID is invalid.");
  if (authorization.materializationKind !== "materialized" && authorization.materializationKind !== "deferred") throw new Error("Runner materialization kind is invalid.");
  const resultBindings = exactKeys(runnerResult.bindings, ["adapter", "catalog", "plan", "registry"], "Runner bindings");
  const bindings = {
    catalog: requireFileBinding(resultBindings.catalog, "Runner catalog binding"),
    plan: requireFileBinding(resultBindings.plan, "Runner plan binding"),
    registry: requireFileBinding(resultBindings.registry, "Runner registry binding"),
    adapter: requireFileBinding(resultBindings.adapter, "Runner adapter binding"),
  };
  return {
    evidenceVersion: 2,
    browserStatus: "captured",
    runnerResult: v2FileBinding(path),
    derivedGitState,
    baseCommit,
    headCommit,
    observedDirtyPaths,
    dirtyExpectedPaths,
    cleanExpectedPaths,
    selectedExpectedPaths,
    authorization: {
      authorizationId: authorization.authorizationId,
      materializationKind: authorization.materializationKind,
    },
    bindings,
  };
};

const recordV2 = (
  args: ReturnType<typeof parseArgs>,
  headCommit: string,
  configBytes: Buffer,
  configValue: unknown,
  outputDirectory: string,
) => {
  assertNoProofRelevantGitEnvironment(process.env);
  safeV2Path(args.commands);
  safeV2Path(relative(ROOT, outputDirectory), false);
  const indexMismatchPaths = compareIndexToHeadEntries(
    gitV2Buffer("ls-files", "--stage", "-z"),
    gitV2Buffer("ls-tree", "-r", "--full-tree", "-z", "HEAD"),
  );
  if (indexMismatchPaths.length > 0) throw new Error(`Version 2 proof requires an empty index; mismatched paths: ${indexMismatchPaths.join(", ")}`);
  const hiddenIndexPaths = nulList(gitV2Buffer("ls-files", "-v", "-z").toString("utf8"))
    .filter((entry) => entry.length > 2 && (entry[0] === "S" || entry[0] === entry[0].toLowerCase()))
    .map((entry) => entry.slice(2)).sort();
  if (hiddenIndexPaths.length > 0) throw new Error(`Version 2 proof rejects hidden index paths: ${hiddenIndexPaths.join(", ")}`);
  if (args.encounteredKeys.length !== 4 || new Set(args.encounteredKeys).size !== 4 || args.encounteredKeys.some((key) => !["phase", "base", "commands", "output"].includes(key))) {
    throw new Error("Version 2 proof requires exactly one each of --phase, --base, --commands, and --output with no unknown argument.");
  }
  if (args.phase < 2) throw new Error("Version 2 shared proof begins at Phase 2; historical Phase 1 remains version 1.");
  const config = exactKeys(configValue, ["configVersion", "phase", "baseCommit", "bindings", "browserEvidenceInput", "commands"], "Version 2 command configuration");
  if (config.configVersion !== 2 || config.phase !== args.phase || config.baseCommit !== args.base) throw new Error("Version 2 command configuration phase/base/version mismatch.");
  const bindingConfig = exactKeys(config.bindings, ["sources", "fixtures", "schemas", "harness", "plans"], "Version 2 command binding configuration");
  const bindingPathsByKind = {
    sources: validateV2BindingPathList(bindingConfig.sources, "Source bindings"),
    fixtures: validateV2BindingPathList(bindingConfig.fixtures, "Fixture bindings"),
    schemas: validateV2BindingPathList(bindingConfig.schemas, "Schema bindings"),
    harness: validateV2BindingPathList(bindingConfig.harness, "Harness bindings"),
    plans: validateV2BindingPathList(bindingConfig.plans, "Plan bindings"),
  };
  const allBindingPaths = Object.values(bindingPathsByKind).flat();
  if (new Set(allBindingPaths).size !== allBindingPaths.length) throw new Error("Version 2 evidence binding paths must be unique across categories.");
  const acceptedBrowserRoots = args.phase === 2
    ? ["output/spec-0001/phase-2/", "output/spec-0001/phase-2-ui-restoration-correction/"]
    : [`output/spec-0001/phase-${args.phase}/`];
  if (typeof config.browserEvidenceInput !== "string" || !acceptedBrowserRoots.some((root) => (config.browserEvidenceInput as string).startsWith(root)) ||
    relative(ROOT, resolve(ROOT, config.browserEvidenceInput)) !== config.browserEvidenceInput || config.browserEvidenceInput.includes("\\")) {
    throw new Error("Version 2 browserEvidenceInput must use the selected phase output root.");
  }
  if (!Array.isArray(config.commands) || config.commands.length < 1) throw new Error("Version 2 command configuration must declare commands.");
  const commands = config.commands.map((entry, index) => {
    const command = exactKeys(entry, ["name", "argv", "cwd", "env", "expectedExitCode", "privacy"], `Version 2 command ${index}`);
    if (typeof command.name !== "string" || command.name.length === 0 || !Array.isArray(command.argv) || command.argv.length < 1 || command.argv.some((argument) => typeof argument !== "string" || argument.length === 0)) {
      throw new Error(`Version 2 command ${index} identity/argv is invalid.`);
    }
    if (command.cwd !== "." || command.privacy !== "sanitized" || command.env === null || typeof command.env !== "object" || Array.isArray(command.env) || Object.values(command.env as Record<string, unknown>).some((value) => typeof value !== "string")) {
      throw new Error(`Version 2 command ${index} execution policy is invalid.`);
    }
    if (!Number.isInteger(command.expectedExitCode) || ["sh", "bash", "zsh"].includes((command.argv as string[])[0]) || (command.argv as string[]).includes("-c")) {
      throw new Error(`Version 2 command ${index} exit/shell policy is invalid.`);
    }
    if (Object.keys(command.env as Record<string, unknown>).some((key) => /^GIT_/.test(key) || key === "NODE_OPTIONS" || key === "NODE_PATH")) throw new Error(`Version 2 command ${index} may not define Git/Node redirection environment variables.`);
    return command as unknown as CommandConfig;
  });
  const lintCommands = commands.filter((command) => command.name === "lint-regression");
  if (lintCommands.length !== 1) throw new Error("Version 2 command configuration must contain exactly one lint-regression command.");
  const expectedLintArgv = ["node", "--experimental-strip-types", "scripts/spec0001-proof/measureSpec0001LintRegression.ts", `--base=${args.base}`];
  if (JSON.stringify(lintCommands[0].argv) !== JSON.stringify(expectedLintArgv) || lintCommands[0].expectedExitCode !== 0 || Object.keys(lintCommands[0].env).length !== 0) {
    throw new Error("Version 2 lint-regression command is not exact.");
  }
  if (args.phase === 2) {
    const expectedCommands = phaseTwoExactCommands(args.base);
    if (commands.length !== expectedCommands.length) throw new Error("Phase 2 proof requires exactly six commands.");
    commands.forEach((command, index) => {
      if (JSON.stringify(command.argv) !== JSON.stringify(expectedCommands[index])) throw new Error(`Phase 2 command ${index + 1} argv/order mismatch.`);
      if (command.expectedExitCode !== 0 || Object.keys(command.env).length !== 0) throw new Error(`Phase 2 command ${index + 1} must use empty declared env and expect exit 0.`);
    });
  }
  const executions = commands.map((command) => closeV2Command(command, allBindingPaths));

  const existingOutputFiles = listFilesRecursively(outputDirectory);
  if (existingOutputFiles.length > 0) throw new Error(`Proof output root must start empty; found: ${existingOutputFiles.join(", ")}`);
  ensureV2Directory(relative(ROOT, outputDirectory));
  const receipts = [];
  let commandsPassed = true;
  let lintRegression: Record<string, unknown> | null = null;
  for (const [order, command] of commands.entries()) {
    const execution = executions[order];
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const child = spawnSync(execution.executablePath, execution.actualArgv, {
      cwd: ROOT,
      env: execution.environment,
      encoding: "buffer",
      shell: false,
      maxBuffer: 64 * 1024 * 1024,
    });
    const durationMs = Math.max(0, Math.round(performance.now() - started));
    const stdout = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from(child.stdout ?? "");
    const stderr = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from(child.stderr ?? "");
    const exitCode = child.status ?? (child.error ? 255 : 254);
    let observedLint: Record<string, unknown> | null = null;
    if (command.name === "lint-regression") {
      try { observedLint = validateV2LintMeasurementForRecording(JSON.parse(stdout.toString("utf8")), args.base, headCommit); }
      catch (error) { throw new Error(`Version 2 lint receipt is invalid: ${error instanceof Error ? error.message : String(error)}`); }
      lintRegression = observedLint;
    }
    const passed = exitCode === command.expectedExitCode && (command.name !== "lint-regression" || observedLint?.passed === true);
    commandsPassed &&= passed;
    const receipt = {
      receiptVersion: 2,
      name: command.name,
      order,
      argv: command.argv,
      cwd: command.cwd,
      env: command.env,
      privacy: command.privacy,
      startedAt,
      durationMs,
      exitCode,
      expectedExitCode: command.expectedExitCode,
      passed,
      stdout: {encoding: "base64", byteLength: stdout.byteLength, sha256: sha256Bytes(stdout), data: stdout.toString("base64")},
      stderr: {encoding: "base64", byteLength: stderr.byteLength, sha256: sha256Bytes(stderr), data: stderr.toString("base64")},
      execution: execution.receipt,
      lintRegression: observedLint,
    };
    const receiptPath = relative(ROOT, resolve(outputDirectory, `${String(order).padStart(3, "0")}-${basename(command.name)}.json`));
    writeFileSync(resolve(ROOT, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
    receipts.push(v2FileBinding(receiptPath));
  }
  if (lintRegression === null) throw new Error("Version 2 lint measurement was not recorded.");
  const receiptPathSet = new Set(receipts.map((binding) => binding.path));
  const generatedArtifacts = listFilesRecursively(outputDirectory)
    .filter((path) => !receiptPathSet.has(path) && path !== args.output)
    .map(v2FileBinding);
  if (!existsSync(resolve(ROOT, config.browserEvidenceInput))) throw new Error("Version 2 browser evidence input was not produced by the ordered commands.");
  safeV2Path(config.browserEvidenceInput);
  const evidence = summarizeV2Evidence(config.browserEvidenceInput, args.base, headCommit);
  const runnerForRuntime = JSON.parse(readFileSync(resolve(ROOT, config.browserEvidenceInput), "utf8")) as Record<string, unknown>;
  const runnerRuntime = exactKeys(runnerForRuntime.runtime, ["browserExecutable", "browserVersion", "nodeVersion", "playwrightCoreVersion"], "Runner runtime");
  if (typeof runnerRuntime.browserVersion !== "string" || runnerRuntime.browserVersion.length === 0 || runnerRuntime.nodeVersion !== process.version || runnerRuntime.playwrightCoreVersion !== "1.62.1") {
    throw new Error("Version 2 runner runtime binding is invalid.");
  }
  const runnerBrowserExecutable = exactKeys(runnerRuntime.browserExecutable, ["path", "sha256", "byteLength"], "Runner browser executable binding");
  if (stableJson(runnerBrowserExecutable) !== stableJson(v2BrowserExecutableBinding())) throw new Error("Version 2 runner browser executable binding drifted.");
  const npmPackagePath = resolve(dirname(process.execPath), "../lib/node_modules/npm/package.json");
  const npmPackage = JSON.parse(readFileSync(npmPackagePath, "utf8")) as {version?: unknown};
  if (typeof npmPackage.version !== "string" || npmPackage.version.length === 0) throw new Error("Unable to bind the Node-runtime npm version.");
  const bindingManifest = Object.fromEntries(Object.entries(bindingPathsByKind).map(([kind, paths]) => [kind, paths.map(v2FileBinding)]));
  const artifacts = [...new Map(
    [
      ...collectArtifacts(args.commands, commands, allBindingPaths, config.browserEvidenceInput, 2),
      ...generatedArtifacts,
      v2FileBinding(config.browserEvidenceInput),
    ]
      .map((binding) => [binding.path, binding]),
  ).values()].sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    manifestVersion: 2,
    specId: "SPEC-0001",
    phase: args.phase,
    baseCommit: args.base,
    headCommit,
    recordedAt: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      npmVersion: npmPackage.version,
      browserVersion: runnerRuntime.browserVersion,
      browserExecutable: runnerBrowserExecutable,
      textEncoderAvailable: typeof TextEncoder === "function",
      webCryptoAvailable: Boolean(globalThis.crypto?.subtle),
    },
    commandConfig: {path: args.commands, sha256: sha256Bytes(configBytes), byteLength: configBytes.byteLength},
    receipts,
    artifacts,
    bindings: bindingManifest,
    evidence,
    commandsPassed,
    lintRegression,
  };
  writeFileSync(safeV2Path(args.output, false), `${JSON.stringify(manifest, null, 2)}\n`, {encoding: "utf8", mode: 0o600, flag: "wx"});
  console.log(`Recorded ${commands.length} version 2 executed command receipts at ${args.output}.`);
  console.log(`Phase ${args.phase} proof result: ${commandsPassed ? "PASS" : "FAIL"}; lint base ${(lintRegression.base as Record<string, unknown>).errors}/${(lintRegression.base as Record<string, unknown>).warnings}, result ${(lintRegression.result as Record<string, unknown>).errors}/${(lintRegression.result as Record<string, unknown>).warnings}.`);
  if (!commandsPassed) process.exitCode = 1;
};

const main = () => {
const args = parseArgs();
if (!Number.isSafeInteger(args.phase) || args.phase < 1 || args.phase > 7) throw new Error("Phase must be 1..7.");
if (!/^[0-9a-f]{40}$/.test(args.base)) throw new Error("Base must be a full lowercase Git SHA.");
const ordinaryOutput = `output/spec-0001/phase-${args.phase}/proof-manifest.json`;
const liveOnlyOutput = args.phase === 7
  ? /^output\/spec-0001\/phase-7-live\/[0-9a-f]{64}\/offline-proof-manifest\.json$/.test(args.output)
  : false;
if (args.output === ordinaryOutput) assertSafeRelativePath(args.output, ordinaryOutput);
else if (liveOnlyOutput) {
  const absolute = resolve(ROOT, args.output);
  const local = relative(ROOT, absolute);
  if (local === ".." || local.startsWith(`..${sep}`)) throw new Error("Live-only output escapes the repository.");
}
else throw new Error(`Output must use the exact Phase ${args.phase} ordinary proof root${args.phase === 7 ? " or a decision-bound live-only root" : ""}.`);
if (args.commands !== `scripts/fixtures/stick-ai/v1/phase-${args.phase}-proof-commands.json`) {
  throw new Error(`Phase ${args.phase} must use its checked-in command configuration.`);
}

const configBytes = readFileSync(resolve(ROOT, args.commands));
const configValue = JSON.parse(configBytes.toString("utf8")) as unknown;
const isVersion2 = (configValue as {configVersion?: unknown}).configVersion === 2;
if (isVersion2) assertNoProofRelevantGitEnvironment(process.env);
const headCommit = isVersion2 ? gitV2("rev-parse", "HEAD") : git("rev-parse", "HEAD");
if (headCommit !== args.base) throw new Error(`HEAD ${headCommit} does not equal authorized base ${args.base}.`);
if (isVersion2) {
  recordV2(args, headCommit, configBytes, configValue, dirname(resolve(ROOT, args.output)));
  return;
}
const config = configValue as ProofCommandConfig;
if (config.configVersion !== 1 || config.phase !== args.phase || config.baseCommit !== args.base) {
  throw new Error("Command configuration phase/base/version mismatch.");
}
if (args.phase !== 1) throw new Error("Version 1 shared proof is historical Phase 1 only; Phase 2 through Phase 7 require version 2.");
exactKeys(config, ["configVersion", "phase", "baseCommit", "bindings", "browserEvidenceInput", "commands"], "Command configuration");
const bindingConfig = exactKeys(config.bindings, ["sources", "fixtures", "schemas", "harness", "plans"], "Command binding configuration");
const bindingPathsByKind = {
  sources: validateBindingPathList(bindingConfig.sources, "Source bindings"),
  fixtures: validateBindingPathList(bindingConfig.fixtures, "Fixture bindings"),
  schemas: validateBindingPathList(bindingConfig.schemas, "Schema bindings"),
  harness: validateBindingPathList(bindingConfig.harness, "Harness bindings"),
  plans: validateBindingPathList(bindingConfig.plans, "Plan bindings"),
};
const allBindingPaths = Object.values(bindingPathsByKind).flat();
if (new Set(allBindingPaths).size !== allBindingPaths.length) throw new Error("Evidence binding paths must be unique across categories.");
if (!(config.browserEvidenceInput === null || (typeof config.browserEvidenceInput === "string" && config.browserEvidenceInput.startsWith("output/spec-0001/")))) {
  throw new Error("browserEvidenceInput must be null or a SPEC-0001 output path.");
}
if (config.commands.length < 1) throw new Error("Command configuration must declare at least one command.");
config.commands.forEach((command, index) => {
  if (!Array.isArray(command.argv) || command.argv.length < 1 || command.argv.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`Command ${index} argv must be a non-empty string array.`);
  }
  if (command.cwd !== "." || command.privacy !== "sanitized" || command.env === null || typeof command.env !== "object" || Array.isArray(command.env) || Object.values(command.env).some((value) => typeof value !== "string")) {
    throw new Error(`Command ${index} must use cwd '.', string environment overrides, and sanitized privacy.`);
  }
  if (!Number.isInteger(command.expectedExitCode)) throw new Error(`Command ${index} expected exit must be an integer.`);
  if (["sh", "bash", "zsh"].includes(command.argv[0]) || command.argv.includes("-c")) {
    throw new Error(`Command ${index} may not use a shell interpreter.`);
  }
  if (command.name === "lint-regression") {
    if (command.expectedExitCode !== 1 || JSON.stringify(command.lintBaseline) !== JSON.stringify({errors: 6, warnings: 73, phasePathFindings: 0})) {
      throw new Error("Lint command must record the known 6-error/73-warning baseline and zero Phase 1 findings.");
    }
  } else if (command.lintBaseline !== undefined) {
    throw new Error(`Command ${index} may not carry lint metadata.`);
  }
});
if (args.phase === 1) {
  if (config.browserEvidenceInput !== null) throw new Error("Phase 1 browser evidence must be honestly not applicable.");
  if (config.commands.length !== phaseOneExactCommands.length) throw new Error("Phase 1 command count mismatch.");
  config.commands.forEach((command, index) => {
    if (JSON.stringify(command.argv) !== JSON.stringify(phaseOneExactCommands[index])) throw new Error(`Phase 1 command ${index} argv/order mismatch.`);
    if (command.expectedExitCode !== (index === 4 ? 1 : 0)) throw new Error(`Phase 1 command ${index} expected exit mismatch.`);
    if (Object.keys(command.env).length !== 0) throw new Error(`Phase 1 command ${index} env additions must be empty.`);
  });
}

const outputDirectory = dirname(resolve(ROOT, args.output));
const existingOutputFiles = listFilesRecursively(outputDirectory);
if (existingOutputFiles.length > 0) {
  throw new Error(`Proof output root must start empty; found: ${existingOutputFiles.join(", ")}`);
}
mkdirSync(outputDirectory, {recursive: true, mode: 0o700});
const receipts = [];
let commandsPassed = true;
let lintBaseline = {errors: 6, warnings: 73, phasePathFindings: 0};
const phaseSourcePaths = [...new Set([
  ...nulList(git("diff", "--name-only", "-z", args.base)),
  ...nulList(git("ls-files", "--others", "--exclude-standard", "-z")),
])].filter((path) => /\.(?:ts|tsx)$/.test(path));

for (const [order, command] of config.commands.entries()) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const child = spawnSync(command.argv[0], command.argv.slice(1), {
    cwd: resolve(ROOT, command.cwd),
    env: {...process.env, ...command.env},
    encoding: "buffer",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Math.max(0, Math.round(performance.now() - started));
  const stdout = Buffer.isBuffer(child.stdout) ? child.stdout : Buffer.from(child.stdout ?? "");
  const stderr = Buffer.isBuffer(child.stderr) ? child.stderr : Buffer.from(child.stderr ?? "");
  const exitCode = child.status ?? (child.error ? 255 : 254);
  const observedLint = command.lintBaseline ? parseLintBaseline(stdout, stderr, phaseSourcePaths) : null;
  if (observedLint) lintBaseline = observedLint as typeof lintBaseline;
  const passed =
    exitCode === command.expectedExitCode &&
    (!command.lintBaseline || JSON.stringify(observedLint) === JSON.stringify(command.lintBaseline));
  commandsPassed &&= passed;
  const receipt = {
    receiptVersion: 1,
    name: command.name,
    order,
    argv: command.argv,
    cwd: command.cwd,
    env: command.env,
    privacy: command.privacy,
    startedAt,
    durationMs,
    exitCode,
    expectedExitCode: command.expectedExitCode,
    passed,
    stdout: {encoding: "base64", byteLength: stdout.byteLength, sha256: sha256Bytes(stdout), data: stdout.toString("base64")},
    stderr: {encoding: "base64", byteLength: stderr.byteLength, sha256: sha256Bytes(stderr), data: stderr.toString("base64")},
    lintBaseline: observedLint,
  };
  const receiptPath = relative(ROOT, resolve(outputDirectory, `${String(order).padStart(3, "0")}-${basename(command.name)}.json`));
  writeFileSync(resolve(ROOT, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  receipts.push(fileBinding(receiptPath));
}

const receiptPathSet = new Set(receipts.map((binding) => binding.path));
const generatedArtifacts = listFilesRecursively(outputDirectory)
  .filter((path) => !receiptPathSet.has(path) && path !== args.output)
  .map(fileBinding);
const evidence = config.browserEvidenceInput === null
  ? notApplicableBrowserEvidence
  : JSON.parse(readFileSync(resolve(ROOT, config.browserEvidenceInput), "utf8")) as unknown;
const npmVersionResult = spawnSync("npm", ["--version"], {cwd: ROOT, encoding: "utf8", shell: false});
if (npmVersionResult.status !== 0) throw new Error("Unable to record npm version.");
const bindingManifest = Object.fromEntries(
  Object.entries(bindingPathsByKind).map(([kind, paths]) => [kind, paths.map(fileBinding)]),
);
const manifest = {
  manifestVersion: 1,
  specId: "SPEC-0001",
  phase: args.phase,
  baseCommit: args.base,
  headCommit,
  recordedAt: new Date().toISOString(),
  runtime: {
    nodeVersion: process.version,
    npmVersion: npmVersionResult.stdout.trim(),
    browserVersion: config.browserEvidenceInput === null ? null : (evidence as {browserVersion?: unknown}).browserVersion ?? null,
    textEncoderAvailable: typeof TextEncoder === "function",
    webCryptoAvailable: Boolean(globalThis.crypto?.subtle),
  },
  commandConfig: {path: args.commands, sha256: sha256Bytes(configBytes), byteLength: configBytes.byteLength},
  receipts,
  artifacts: [...collectArtifacts(args.commands, config.commands, allBindingPaths, config.browserEvidenceInput), ...generatedArtifacts]
    .sort((left, right) => left.path.localeCompare(right.path)),
  bindings: bindingManifest,
  evidence,
  commandsPassed,
  lintBaseline,
};
writeFileSync(resolve(ROOT, args.output), `${JSON.stringify(manifest, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
console.log(`Recorded ${config.commands.length} executed command receipts at ${args.output}.`);
console.log(`Phase ${args.phase} proof result: ${commandsPassed ? "PASS" : "FAIL"}; lint baseline ${lintBaseline.errors} errors/${lintBaseline.warnings} warnings; phase findings ${lintBaseline.phasePathFindings}.`);
if (!commandsPassed) process.exitCode = 1;
};

main();
