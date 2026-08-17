import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {relative, resolve, sep} from "node:path";

type JsonObject = Record<string, unknown>;
type LintMessage = {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  fatal?: boolean;
};
type LintFile = {
  filePath: string;
  errorCount: number;
  warningCount: number;
  fatalErrorCount?: number;
  messages: LintMessage[];
};

const ROOT = process.cwd();
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SCRIPT_PATH = "scripts/spec0001-proof/measureSpec0001LintRegression.ts";
const NETWORK_GUARD_PATH = "scripts/spec0001-browser/networkDeny.cjs";
const JAVASCRIPT_PATH_PATTERN = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const PROOF_RELEVANT_GIT_ENV = /^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG(?:$|_)|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|NAMESPACE|GRAFT_FILE|NO_REPLACE_OBJECTS|REPLACE_REF_BASE|SHALLOW_FILE|QUARANTINE_PATH|PREFIX|SUPER_PREFIX)$/;

const sha256Bytes = (bytes: Uint8Array | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const exactObject = (value: unknown, keys: readonly string[], label: string) => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return value as JsonObject;
};

const assertNoProofRelevantGitEnvironment = (environment: NodeJS.ProcessEnv) => {
  const redirected = Object.keys(environment).filter((key) => PROOF_RELEVANT_GIT_ENV.test(key)).sort();
  assert.deepEqual(redirected, [], `Proof-relevant Git environment variables are forbidden: ${redirected.join(", ")}`);
};

const scrubGitEnvironment = (environment: NodeJS.ProcessEnv = process.env) => {
  const scrubbed = {} as unknown as NodeJS.ProcessEnv;
  for (const key of ["HOME", "USER", "LOGNAME", "SHELL", "TERM", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"] as const) if (typeof environment[key] === "string") scrubbed[key] = environment[key];
  scrubbed.PATH = "/usr/bin:/bin:/opt/homebrew/bin";
  scrubbed.GIT_CONFIG_NOSYSTEM = "1";
  scrubbed.GIT_CONFIG_GLOBAL = "/dev/null";
  scrubbed.GIT_OPTIONAL_LOCKS = "0";
  return scrubbed;
};

const parseArgs = () => {
  const argumentsList = process.argv.slice(2);
  assert.equal(argumentsList.length, 1, "Use exactly --base=<full-lowercase-git-sha>.");
  const match = /^--base=([0-9a-f]{40})$/.exec(argumentsList[0]);
  assert.ok(match, "Use exactly --base=<full-lowercase-git-sha>.");
  return {base: match[1]};
};

const run = (command: string, argv: string[], options: {cwd?: string; encoding?: "utf8" | "buffer"; env?: NodeJS.ProcessEnv; input?: Buffer} = {}) => {
  const result = spawnSync(command, argv, {
    cwd: options.cwd ?? ROOT,
    encoding: options.encoding ?? "utf8",
    env: options.env ?? process.env,
    input: options.input,
    shell: false,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
};

const gitText = (...argv: string[]) => {
  const result = run("/usr/bin/git", argv, {encoding: "utf8", env: scrubGitEnvironment()});
  assert.equal(result.status, 0, String(result.stderr || `git ${argv.join(" ")} failed`));
  return String(result.stdout);
};

const gitBuffer = (...argv: string[]) => {
  const result = run("/usr/bin/git", argv, {encoding: "buffer", env: scrubGitEnvironment()});
  assert.equal(result.status, 0, Buffer.from(result.stderr ?? "").toString("utf8") || `git ${argv.join(" ")} failed`);
  return Buffer.from(result.stdout ?? "");
};

const safePath = (root: string, path: string, label: string) => {
  assert.ok(path.length > 0 && !path.includes("\0"), `${label} is empty or malformed.`);
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `${label} escapes its root: ${path}`);
  return absolute;
};

const currentFileBinding = (path: string) => {
  const absolute = safePath(ROOT, path, "Binding path");
  const stats = lstatSync(absolute);
  assert.ok(stats.isFile() && !stats.isSymbolicLink(), `Binding must be a regular file: ${path}`);
  const bytes = readFileSync(absolute);
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const baseBlob = (base: string, path: string) => gitBuffer("show", `${base}:${path}`);

const sourceBinding = (base: string, path: string) => {
  const current = currentFileBinding(path);
  const historical = baseBlob(base, path);
  assert.equal(historical.byteLength, current.byteLength, `${path} differs in length from the authorized base.`);
  assert.equal(sha256Bytes(historical), current.sha256, `${path} differs from the authorized base.`);
  return current;
};

const dependencyBinding = (path:
  | "node_modules/.package-lock.json"
  | "node_modules/eslint/package.json"
  | "node_modules/eslint-config-next/package.json"
  | "node_modules/typescript/package.json") => {
  const binding = currentFileBinding(path);
  if (path === "node_modules/.package-lock.json") return {...binding, version: null};
  const packageValue = exactObject(JSON.parse(readFileSync(resolve(ROOT, path), "utf8")), Object.keys(JSON.parse(readFileSync(resolve(ROOT, path), "utf8"))), path);
  assert.ok(typeof packageValue.version === "string" && packageValue.version.length > 0, `${path} has no package version.`);
  return {...binding, version: packageValue.version as string};
};

const dependencyTreeBinding = () => {
  const dependencyRoot = resolve(ROOT, "node_modules");
  const digest = createHash("sha256");
  let entryCount = 0;
  let byteLength = 0;
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(directory, entry.name);
      const path = relative(dependencyRoot, absolute);
      const stats = lstatSync(absolute);
      if (entry.isDirectory()) {
        digest.update(`D\0${path}\0${stats.mode & 0o777}\0`);
        entryCount += 1;
        walk(absolute);
      } else if (entry.isSymbolicLink()) {
        const target = readlinkSync(absolute);
        digest.update(`L\0${path}\0${stats.mode & 0o777}\0${target}\0`);
        entryCount += 1;
        byteLength += Buffer.byteLength(target);
      } else if (entry.isFile()) {
        const bytes = readFileSync(absolute);
        digest.update(`F\0${path}\0${stats.mode & 0o777}\0${bytes.byteLength}\0`);
        digest.update(bytes);
        digest.update("\0");
        entryCount += 1;
        byteLength += bytes.byteLength;
      } else {
        throw new Error(`Unsupported dependency-tree entry: node_modules/${path}`);
      }
    }
  };
  walk(dependencyRoot);
  return {path: "node_modules", sha256: `sha256:${digest.digest("hex")}`, entryCount, byteLength};
};

const assertInstalledVersionsMatchLock = (dependencies: ReturnType<typeof dependencyBinding>[]) => {
  const lock = exactObject(JSON.parse(readFileSync(resolve(ROOT, "package-lock.json"), "utf8")), ["name", "version", "lockfileVersion", "requires", "packages"], "package-lock.json");
  assert.equal(lock.lockfileVersion, 3, "package-lock.json must remain lockfileVersion 3.");
  const packages = lock.packages as JsonObject;
  assert.ok(packages !== null && typeof packages === "object" && !Array.isArray(packages), "package-lock.json packages are invalid.");
  for (const dependency of dependencies.filter((entry) => entry.version !== null)) {
    const packagePath = dependency.path.replace(/\/package\.json$/, "");
    const locked = packages[packagePath] as JsonObject | undefined;
    assert.ok(locked && locked.version === dependency.version, `${dependency.path} does not match package-lock.json.`);
  }
};

const materializeBase = (base: string, directory: string) => {
  const archive = gitBuffer("archive", "--format=tar", base);
  const extracted = run("/usr/bin/tar", ["-xf", "-", "-C", directory], {encoding: "buffer", input: archive});
  assert.equal(extracted.status, 0, Buffer.from(extracted.stderr ?? "").toString("utf8") || "Unable to materialize the base archive.");
  const dependencyLink = resolve(directory, "node_modules");
  assert.ok(!existsSync(dependencyLink), "Base archive unexpectedly contains node_modules.");
  symlinkSync(resolve(ROOT, "node_modules"), dependencyLink, "dir");
};

const parseLintOutput = (stdout: Buffer, stderr: Buffer, root: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error(`ESLint JSON output could not be parsed (sha256 ${sha256Bytes(stdout)}).`);
  }
  assert.ok(Array.isArray(parsed), "ESLint JSON output must be an array.");
  const normalizedRoot = realpathSync(root);
  const files = parsed.map((entry, index) => {
    const file = entry as Partial<LintFile>;
    assert.ok(typeof file.filePath === "string" && file.filePath.length > 0, `ESLint result ${index} has no file path.`);
    assert.ok(Number.isSafeInteger(file.errorCount) && (file.errorCount as number) >= 0, `ESLint result ${index} error count is invalid.`);
    assert.ok(Number.isSafeInteger(file.warningCount) && (file.warningCount as number) >= 0, `ESLint result ${index} warning count is invalid.`);
    assert.equal(file.fatalErrorCount ?? 0, 0, `ESLint result ${index} contains a fatal parse/config error.`);
    assert.ok(Array.isArray(file.messages), `ESLint result ${index} messages are invalid.`);
    const path = relative(normalizedRoot, resolve(normalizedRoot, file.filePath));
    assert.ok(path !== ".." && !path.startsWith(`..${sep}`), `ESLint result ${index} escapes its measured root.`);
    return {...file, filePath: path} as LintFile;
  });
  return {
    files,
    counts: {
      errors: files.reduce((sum, entry) => sum + entry.errorCount, 0),
      warnings: files.reduce((sum, entry) => sum + entry.warningCount, 0),
    },
    rawOutput: {
      stdoutSha256: sha256Bytes(stdout),
      stdoutByteLength: stdout.byteLength,
      stderrSha256: sha256Bytes(stderr),
      stderrByteLength: stderr.byteLength,
    },
  };
};

const runLint = (cwd: string, ledgerPath: string) => {
  const eslintBin = resolve(ROOT, "node_modules/eslint/bin/eslint.js");
  assert.ok(existsSync(eslintBin), "The locked worktree-local ESLint binary is missing.");
  const guard = resolve(cwd, NETWORK_GUARD_PATH);
  assert.ok(existsSync(guard), "The base/current network guard is missing.");
  const env = {} as unknown as NodeJS.ProcessEnv;
  for (const key of ["HOME", "USER", "LOGNAME", "SHELL", "TERM", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"] as const) if (typeof process.env[key] === "string") env[key] = process.env[key];
  env.PATH = "/usr/bin:/bin:/opt/homebrew/bin";
  Object.assign(env, {
    CI: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_OPTIONS: `--require=${guard}`,
    SPEC0001_NETWORK_LEDGER: ledgerPath,
    SPEC0001_REPOSITORY_ROOT: cwd,
  });
  const result = run(process.execPath, [eslintBin, ".", "--format", "json", "--no-cache"], {cwd, encoding: "buffer", env});
  assert.ok(result.status === 0 || result.status === 1, `ESLint exited ${result.status}; expected only lint status 0 or 1.`);
  const stdout = Buffer.from(result.stdout ?? "");
  const stderr = Buffer.from(result.stderr ?? "");
  const parsed = parseLintOutput(stdout, stderr, cwd);
  return {...parsed, exitCode: result.status};
};

const nulList = (value: string) => value.split("\0").filter(Boolean);

const currentJavaScriptChanges = (base: string) => {
  const tracked = nulList(gitText("diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "--no-renames", base, "--"));
  const untracked = nulList(gitText("ls-files", "--others", "--exclude-standard", "-z"));
  const paths = [...new Set([...tracked, ...untracked])]
    .filter((path) => JAVASCRIPT_PATH_PATTERN.test(path) && existsSync(safePath(ROOT, path, "Changed source path")))
    .sort();
  const newPaths = paths.filter((path) => {
    const result = run("/usr/bin/git", ["cat-file", "-e", `${base}:${path}`], {encoding: "buffer", env: scrubGitEnvironment()});
    return result.status !== 0;
  });
  return {paths, newPaths};
};

const changedLineRanges = (base: string, paths: string[], newPaths: Set<string>) => {
  const result = new Map<string, Array<{start: number; end: number}>>();
  for (const path of paths) {
    if (newPaths.has(path)) continue;
    const diff = run("/usr/bin/git", ["diff", "--no-ext-diff", "--no-color", "--unified=0", "--no-renames", base, "--", path], {encoding: "utf8", env: scrubGitEnvironment()});
    assert.ok(diff.status === 0 || diff.status === 1, `Unable to compute changed lines for ${path}.`);
    const ranges: Array<{start: number; end: number}> = [];
    for (const line of String(diff.stdout).split("\n")) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) continue;
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      if (count > 0) ranges.push({start, end: start + count - 1});
    }
    result.set(path, ranges);
  }
  return result;
};

const findingFor = (path: string, message: LintMessage) => {
  assert.ok(Number.isSafeInteger(message.line) && (message.line as number) > 0, `Lint finding in ${path} has no valid line.`);
  assert.ok(Number.isSafeInteger(message.severity) && (message.severity === 1 || message.severity === 2), `Lint finding in ${path} has invalid severity.`);
  return {
    path,
    line: message.line as number,
    endLine: Number.isSafeInteger(message.endLine) && (message.endLine as number) >= (message.line as number) ? message.endLine as number : message.line as number,
    column: Number.isSafeInteger(message.column) && (message.column as number) > 0 ? message.column as number : 1,
    endColumn: Number.isSafeInteger(message.endColumn) && (message.endColumn as number) > 0 ? message.endColumn as number : null,
    severity: message.severity,
    ruleId: message.ruleId,
    messageSha256: sha256Bytes(message.message),
  };
};

const collectFocusedFindings = (files: LintFile[], changedPaths: string[], newPaths: string[], ranges: Map<string, Array<{start: number; end: number}>>) => {
  const changedSet = new Set(changedPaths);
  const newSet = new Set(newPaths);
  const changedLineFindings: ReturnType<typeof findingFor>[] = [];
  const newFileFindings: ReturnType<typeof findingFor>[] = [];
  for (const file of files) {
    if (!changedSet.has(file.filePath)) continue;
    for (const message of file.messages) {
      const finding = findingFor(file.filePath, message);
      if (newSet.has(file.filePath)) newFileFindings.push(finding);
      else if ((ranges.get(file.filePath) ?? []).some((range) => finding.line <= range.end && finding.endLine >= range.start)) changedLineFindings.push(finding);
    }
  }
  const order = (left: ReturnType<typeof findingFor>, right: ReturnType<typeof findingFor>) =>
    left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column || left.messageSha256.localeCompare(right.messageSha256);
  return {changedLineFindings: changedLineFindings.sort(order), newFileFindings: newFileFindings.sort(order)};
};

const readNetworkRecords = (path: string) => {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error(`Network ledger line ${index} is invalid.`); }
    return value;
  });
};

const repositoryStateDigest = () => {
  const index = gitBuffer("ls-files", "--stage", "-z");
  const flags = gitBuffer("ls-files", "-v", "-z");
  const tracked = nulList(gitText("ls-files", "-z"));
  const trackedSet = new Set(tracked);
  const untracked = nulList(gitText("ls-files", "--others", "--exclude-standard", "-z"));
  const paths = [...new Set([...tracked, ...untracked])].sort();
  const digest = createHash("sha256");
  digest.update("spec0001-git-visible-state-v2\0index\0");
  digest.update(index);
  digest.update("\0flags\0");
  digest.update(flags);
  digest.update("\0worktree\0");
  for (const path of paths) {
    const absolute = safePath(ROOT, path, "Git-visible state path");
    const kind = trackedSet.has(path) ? "tracked" : "untracked";
    let stats;
    try { stats = lstatSync(absolute); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        digest.update(`${kind}\0${path}\0missing\0`);
        continue;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      const target = readlinkSync(absolute);
      digest.update(`${kind}\0${path}\0symlink\0${stats.mode & 0o777}\0${Buffer.byteLength(target)}\0${target}\0`);
    } else if (stats.isFile()) {
      const bytes = readFileSync(absolute);
      digest.update(`${kind}\0${path}\0file\0${stats.mode & 0o777}\0${bytes.byteLength}\0`);
      digest.update(bytes);
      digest.update("\0");
    } else throw new Error(`Git-visible state path must be a file or symlink: ${path}`);
  }
  return `sha256:${digest.digest("hex")}`;
};

const main = () => {
  assertNoProofRelevantGitEnvironment(process.env);
  const {base} = parseArgs();
  assert.match(base, GIT_SHA_PATTERN);
  assert.equal(gitText("cat-file", "-t", base).trim(), "commit", "Authorized base is not a commit.");
  assert.ok(existsSync(resolve(ROOT, "node_modules")), "The worktree-local offline dependency tree is missing.");
  const stateBefore = repositoryStateDigest();
  const headCommit = gitText("rev-parse", "HEAD").trim();
  assert.match(headCommit, GIT_SHA_PATTERN, "HEAD is not a full Git SHA.");
  const bindings = {
    package: sourceBinding(base, "package.json"),
    packageLock: sourceBinding(base, "package-lock.json"),
    eslintConfig: sourceBinding(base, "eslint.config.mjs"),
    networkGuard: sourceBinding(base, NETWORK_GUARD_PATH),
    installedPackageLock: dependencyBinding("node_modules/.package-lock.json"),
    eslintPackage: dependencyBinding("node_modules/eslint/package.json"),
    eslintConfigNextPackage: dependencyBinding("node_modules/eslint-config-next/package.json"),
    typescriptPackage: dependencyBinding("node_modules/typescript/package.json"),
    dependencyTree: dependencyTreeBinding(),
    measurer: currentFileBinding(SCRIPT_PATH),
  };
  assertInstalledVersionsMatchLock([bindings.eslintPackage, bindings.eslintConfigNextPackage, bindings.typescriptPackage]);

  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "spec0001-lint-v2-"));
  const baseRoot = resolve(temporaryRoot, "base");
  const baseLedger = resolve(temporaryRoot, "base-network.jsonl");
  const resultLedger = resolve(temporaryRoot, "result-network.jsonl");
  let report: JsonObject | null = null;
  try {
    // The archive is an exact commit snapshot; this does not register a worktree or touch the index.
    mkdirSync(baseRoot, {mode: 0o700});
    materializeBase(base, baseRoot);
    const baseMeasurement = runLint(baseRoot, baseLedger);
    const resultMeasurement = runLint(ROOT, resultLedger);
    assert.deepEqual(dependencyTreeBinding(), bindings.dependencyTree, "Lint measurement mutated the installed dependency tree.");
    const baseNetworkRecords = readNetworkRecords(baseLedger);
    const resultNetworkRecords = readNetworkRecords(resultLedger);
    assert.deepEqual(baseNetworkRecords, [], "Base lint attempted network access.");
    assert.deepEqual(resultNetworkRecords, [], "Result lint attempted network access.");

    const changes = currentJavaScriptChanges(base);
    const newPathSet = new Set(changes.newPaths);
    const ranges = changedLineRanges(base, changes.paths, newPathSet);
    const focused = collectFocusedFindings(resultMeasurement.files, changes.paths, changes.newPaths, ranges);
    const passed =
      resultMeasurement.counts.errors <= baseMeasurement.counts.errors &&
      resultMeasurement.counts.warnings <= baseMeasurement.counts.warnings &&
      focused.changedLineFindings.length === 0 &&
      focused.newFileFindings.length === 0;

    report = {
      measurementVersion: 2,
      specId: "SPEC-0001",
      baseCommit: base,
      headCommit,
      baseTree: gitText("rev-parse", `${base}^{tree}`).trim(),
      measuredAt: new Date().toISOString(),
      runtime: {nodeVersion: process.version, eslintVersion: bindings.eslintPackage.version},
      bindings,
      base: {exitCode: baseMeasurement.exitCode, ...baseMeasurement.counts, rawOutput: baseMeasurement.rawOutput},
      result: {exitCode: resultMeasurement.exitCode, ...resultMeasurement.counts, rawOutput: resultMeasurement.rawOutput},
      changedJavaScriptPaths: changes.paths,
      newJavaScriptPaths: changes.newPaths,
      ...focused,
      gitState: {beforeSha256: stateBefore, afterSha256: "pending", unchanged: false},
      network: {baseRecordCount: 0, resultRecordCount: 0, nonLoopbackAttemptCount: 0},
      cleanup: {temporaryRootRemoved: false},
      passed,
    };
  } finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
  }

  assert.ok(report !== null, "Lint measurement did not produce a report.");
  const stateAfter = repositoryStateDigest();
  const gitState = report.gitState as JsonObject;
  gitState.afterSha256 = stateAfter;
  gitState.unchanged = stateAfter === stateBefore;
  const cleanup = report.cleanup as JsonObject;
  cleanup.temporaryRootRemoved = !existsSync(temporaryRoot);
  assert.equal(gitState.unchanged, true, "Lint measurement changed the repository or index state.");
  assert.equal(cleanup.temporaryRootRemoved, true, "Lint measurement left its temporary root behind.");
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== true) process.exitCode = 1;
};

main();
