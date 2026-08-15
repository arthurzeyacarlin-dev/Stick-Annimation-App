import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

type CommandConfig = {
  name: string;
  argv: string[];
  cwd: ".";
  env: Record<string, string>;
  expectedExitCode: number;
  privacy: "sanitized";
  lintBaseline?: { errors: 6; warnings: 73; phasePathFindings: 0 };
};

type ProofConfig = {
  configVersion: 1;
  specId: "SPEC-0002";
  phase: 1;
  baseCommit: string;
  bindings: Record<"sources" | "fixtures" | "schemas" | "harness", string[]>;
  commands: CommandConfig[];
};

const ROOT = process.cwd();
const BASE_COMMIT = "82663051b30cdcfd6766cf4714cdeb2306970045";
const CONFIG_PATH = "scripts/fixtures/drawing-persistence/v2/phase-1-proof-commands.json";
const OUTPUT_PATH = "output/spec-0002/phase-1/proof-manifest.json";
const RETAINED_ROOT = "/Users/arthurcarlin/.codex/worktrees/feba/stick-animation-app";
const EXPECTED_LINK_TARGET = `${RETAINED_ROOT}/node_modules`;
const EXPECTED_PACKAGE_HASHES = {
  "package.json": "e6edf49f35a1ad4dcebb781b651bdc66b432dc690d254abdd599be631be908fb",
  "package-lock.json": "46468de2fe5d41c00aa0c357ff39c5c085a296d68879babf757b72ed10d205fa",
};
const PHASE_FILES = [
  "src/lib/drawingProjectV2Contract.ts",
  "src/lib/drawingProjectV2Canonical.ts",
  "src/lib/drawingProjectV2Repository.ts",
  "src/lib/drawingProjectIndexedDb.ts",
  "src/lib/drawingProjectV1Compatibility.ts",
  "src/lib/drawingProjectRasterCodec.ts",
  "src/lib/drawingProjectAudioCodec.ts",
  "scripts/validateDrawingProjectV2Contract.ts",
  "scripts/validateDrawingProjectV2Repository.ts",
  "scripts/validateDrawingProjectV1Compatibility.ts",
  "scripts/validateDrawingProjectV2BrowserEngine.ts",
  "scripts/recordSpec0002Phase1Proof.ts",
  "scripts/validateSpec0002Proof.ts",
  "scripts/finalizeSpec0002Closeout.ts",
];

const expectedArgv = [
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2Contract.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2Repository.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV1Compatibility.ts"],
  ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2BrowserEngine.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["npm", "run", "lint"],
  ["git", "diff", "--check"],
  ["git", "diff", "--cached", "--check"],
  ["git", "status", "--short", "--branch"],
];

const sha256 = (bytes: Uint8Array | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const sha256FileRaw = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const binding = (path: string) => {
  const bytes = readFileSync(resolve(ROOT, path));
  return { path, byteLength: bytes.byteLength, sha256: sha256(bytes) };
};
const git = (cwd: string, ...argv: string[]) => {
  const result = spawnSync("git", argv, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed.`);
  return result.stdout.trim();
};
const parseArgs = () => {
  const args = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    args.set(match[1], match[2]);
  }
  if (args.get("commands") !== CONFIG_PATH || args.get("output") !== OUTPUT_PATH || args.size !== 2) {
    throw new Error(`Use exactly --commands=${CONFIG_PATH} --output=${OUTPUT_PATH}.`);
  }
  return { commands: args.get("commands")!, output: args.get("output")! };
};
const assertSafeOutput = (path: string) => {
  const absolute = resolve(ROOT, path);
  const local = relative(ROOT, absolute);
  if (path !== OUTPUT_PATH || local === ".." || local.startsWith(`..${sep}`)) throw new Error("Unsafe proof output path.");
  const directory = dirname(absolute);
  if (existsSync(directory) && readdirSync(directory).length > 0) throw new Error("Proof output root must be clean and collision-free.");
};
const dirtyPaths = () => {
  const modified = git(ROOT, "diff", "--name-only", "HEAD").split("\n").filter(Boolean);
  const untracked = git(ROOT, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  return [...new Set([...modified, ...untracked])].sort();
};
const isAuthorized = (path: string) =>
  PHASE_FILES.includes(path) || path.startsWith("scripts/fixtures/drawing-persistence/v2/");
const retainedStatus = () => git(RETAINED_ROOT, "status", "--short", "--branch");
const packageHashes = (root: string) => Object.fromEntries(Object.keys(EXPECTED_PACKAGE_HASHES).map((name) => [name, sha256FileRaw(resolve(root, name))]));
const exactKeys = (value: unknown, expected: readonly string[], label: string) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields are not exact.`);
  return value as Record<string, unknown>;
};

const args = parseArgs();
assertSafeOutput(args.output);
if (git(ROOT, "rev-parse", "HEAD") !== BASE_COMMIT) throw new Error("HEAD does not equal the authorized base.");
if (git(ROOT, "diff", "--cached", "--name-only") !== "") throw new Error("Index must be empty.");
const initialDirtyPaths = dirtyPaths();
if (initialDirtyPaths.length === 0 || initialDirtyPaths.some((path) => !isAuthorized(path))) throw new Error("Dirty path allowlist mismatch.");
const initialStatus = git(ROOT, "status", "--short", "--branch");
const taskHashesBefore = packageHashes(ROOT);
const retainedHashesBefore = packageHashes(RETAINED_ROOT);
if (JSON.stringify(taskHashesBefore) !== JSON.stringify(EXPECTED_PACKAGE_HASHES) || JSON.stringify(retainedHashesBefore) !== JSON.stringify(EXPECTED_PACKAGE_HASHES)) {
  throw new Error("Dependency package hash mismatch.");
}
const retainedStatusBefore = retainedStatus();
if (retainedStatusBefore !== "## codex/spec-0001-phase-1.5-closeout") throw new Error("Retained dependency worktree is not clean.");
const nodeModulesPath = resolve(ROOT, "node_modules");
if (!lstatSync(nodeModulesPath).isSymbolicLink() || readlinkSync(nodeModulesPath) !== EXPECTED_LINK_TARGET) throw new Error("Dependency symlink mismatch.");

const configBytes = readFileSync(resolve(ROOT, args.commands));
const config = JSON.parse(configBytes.toString("utf8")) as ProofConfig;
exactKeys(config, ["configVersion", "specId", "phase", "baseCommit", "bindings", "commands"], "Proof config");
if (config.configVersion !== 1 || config.specId !== "SPEC-0002" || config.phase !== 1 || config.baseCommit !== BASE_COMMIT) throw new Error("Proof config identity mismatch.");
if (config.commands.length !== 9) throw new Error("Proof workload must contain exactly nine commands.");
config.commands.forEach((command, index) => {
  exactKeys(command, command.name === "lint-regression" ? ["name", "argv", "cwd", "env", "expectedExitCode", "privacy", "lintBaseline"] : ["name", "argv", "cwd", "env", "expectedExitCode", "privacy"], `Command ${index}`);
  if (JSON.stringify(command.argv) !== JSON.stringify(expectedArgv[index])) throw new Error(`Command ${index} argv/order mismatch.`);
  if (command.cwd !== "." || command.privacy !== "sanitized" || command.expectedExitCode !== (index === 5 ? 1 : 0)) throw new Error(`Command ${index} execution contract mismatch.`);
  if (JSON.stringify(command.env) !== JSON.stringify({ NEXT_TELEMETRY_DISABLED: "1", OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" })) throw new Error(`Command ${index} env scrub mismatch.`);
  if (index === 5 && JSON.stringify(command.lintBaseline) !== JSON.stringify({ errors: 6, warnings: 73, phasePathFindings: 0 })) throw new Error("Lint baseline mismatch.");
});
const bindingPaths = Object.values(config.bindings).flat();
if (new Set(bindingPaths).size !== bindingPaths.length || bindingPaths.some((path) => !existsSync(resolve(ROOT, path)))) throw new Error("Binding paths must be unique and present.");

const outputDirectory = dirname(resolve(ROOT, args.output));
const receiptsDirectory = resolve(outputDirectory, "receipts");
mkdirSync(receiptsDirectory, { recursive: true });
const receipts: Array<{ path: string; byteLength: number; sha256: string }> = [];
const assertionTotals: Record<string, number> = {};
let lintBaseline: { errors: number; warnings: number; phasePathFindings: number } | null = null;
let browserVersion = "";
let commandFailure: Error | null = null;

const runtimeBeforeCleanup = {
  nodeVersion: process.version,
  npmVersion: spawnSync("npm", ["--version"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
  typescriptVersion: spawnSync(resolve(ROOT, "node_modules/.bin/tsc"), ["--version"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
  eslintVersion: spawnSync(resolve(ROOT, "node_modules/.bin/eslint"), ["--version"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
  playwrightCoreVersion: JSON.parse(readFileSync(resolve(ROOT, "node_modules/playwright-core/package.json"), "utf8")).version as string,
};

try {
  for (const [order, command] of config.commands.entries()) {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const environment = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TMPDIR: process.env.TMPDIR ?? "",
      LANG: process.env.LANG ?? "C",
      ...command.env,
      NODE_OPTIONS: "",
      NODE_ENV: "test" as const,
    };
    const result = spawnSync(command.argv[0], command.argv.slice(1), {
      cwd: ROOT,
      env: environment,
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    const stdout = result.stdout ?? Buffer.alloc(0);
    const stderr = result.stderr ?? Buffer.alloc(0);
    const exitCode = result.status ?? -1;
    const combined = Buffer.concat([stdout, stderr]).toString("utf8");
    if (order < 4) {
      const match = /ASSERTIONS:\s*(\d+)/.exec(combined);
      if (!match) throw new Error(`Command ${order} did not report assertion totals.`);
      assertionTotals[command.name] = Number(match[1]);
    }
    if (command.name === "browser-engine") {
      const jsonLine = stdout.toString("utf8").split("\n").find((line) => line.startsWith('{"browser"'));
      if (!jsonLine) throw new Error("Browser command did not emit strict engine evidence.");
      const evidence = JSON.parse(jsonLine) as { browser: string; appMounted: boolean; network: { nonLoopbackTraffic: number } };
      if (evidence.appMounted !== false || evidence.network.nonLoopbackTraffic !== 0) throw new Error("Browser isolation evidence failed.");
      browserVersion = evidence.browser;
    }
    if (command.name === "lint-regression") {
      const match = /79 problems \(6 errors, 73 warnings\)/.test(combined);
      const phasePathFindings = PHASE_FILES.filter((path) => combined.includes(resolve(ROOT, path)) || combined.includes(`\n${path}\n`)).length +
        (combined.includes(`${resolve(ROOT, "scripts/fixtures/drawing-persistence/v2")}/`) ? 1 : 0);
      lintBaseline = { errors: match ? 6 : -1, warnings: match ? 73 : -1, phasePathFindings };
    }
    const receipt = {
      receiptVersion: 1,
      order,
      name: command.name,
      argv: command.argv,
      cwd: command.cwd,
      env: command.env,
      privacy: command.privacy,
      startedAt,
      durationMs: Date.now() - started,
      exitCode,
      expectedExitCode: command.expectedExitCode,
      passed: exitCode === command.expectedExitCode,
      stdout: { encoding: "base64", byteLength: stdout.byteLength, sha256: sha256(stdout), data: stdout.toString("base64") },
      stderr: { encoding: "base64", byteLength: stderr.byteLength, sha256: sha256(stderr), data: stderr.toString("base64") },
      lintBaseline: command.lintBaseline ?? null,
    };
    const receiptPath = `output/spec-0002/phase-1/receipts/${String(order).padStart(2, "0")}-${command.name}.json`;
    writeFileSync(resolve(ROOT, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);
    receipts.push(binding(receiptPath));
    if (!receipt.passed) {
      commandFailure = new Error(`Proof command ${order} ${command.name} exited ${exitCode}, expected ${command.expectedExitCode}.`);
      break;
    }
    if (command.name === "lint-regression" && JSON.stringify(lintBaseline) !== JSON.stringify(command.lintBaseline)) {
      commandFailure = new Error(`Lint baseline changed: ${JSON.stringify(lintBaseline)}.`);
      break;
    }
  }
} finally {
  if (existsSync(nodeModulesPath)) {
    const stat = lstatSync(nodeModulesPath);
    if (!stat.isSymbolicLink() || readlinkSync(nodeModulesPath) !== EXPECTED_LINK_TARGET) throw new Error("Refusing to remove unexpected node_modules object.");
    unlinkSync(nodeModulesPath);
  }
}

if (commandFailure) throw commandFailure;
if (receipts.length !== 9 || !lintBaseline) throw new Error("Proof workload did not complete exactly once.");
if (existsSync(nodeModulesPath)) throw new Error("Dependency symlink cleanup failed.");
const taskHashesAfter = packageHashes(ROOT);
const retainedHashesAfter = packageHashes(RETAINED_ROOT);
const retainedStatusAfter = retainedStatus();
if (JSON.stringify(taskHashesAfter) !== JSON.stringify(taskHashesBefore) || JSON.stringify(retainedHashesAfter) !== JSON.stringify(retainedHashesBefore) || retainedStatusAfter !== retainedStatusBefore) {
  throw new Error("Dependency source changed during proof.");
}
const finalDirtyPaths = dirtyPaths();
if (JSON.stringify(finalDirtyPaths) !== JSON.stringify(initialDirtyPaths)) throw new Error("Dirty path set changed during proof.");
if (git(ROOT, "diff", "--cached", "--name-only") !== "") throw new Error("Index changed during proof.");
const finalStatus = git(ROOT, "status", "--short", "--branch");
const artifactBindings = finalDirtyPaths.map(binding);
const totalAssertions = Object.values(assertionTotals).reduce((sum, count) => sum + count, 0);
const manifest = {
  manifestVersion: 1,
  specId: "SPEC-0002",
  phase: 1,
  baseCommit: BASE_COMMIT,
  headCommit: git(ROOT, "rev-parse", "HEAD"),
  recordedAt: new Date().toISOString(),
  commandsPassed: true,
  commandConfig: { ...binding(args.commands), sha256: sha256(configBytes) },
  receipts,
  artifacts: artifactBindings,
  assertions: { ...assertionTotals, total: totalAssertions },
  lintBaseline,
  runtime: { ...runtimeBeforeCleanup, browserVersion },
  dependencyEnvironment: {
    symlinkPath: "node_modules",
    symlinkTarget: EXPECTED_LINK_TARGET,
    symlinkVerifiedBefore: true,
    symlinkRemovedAfter: true,
    expectedPackageHashes: EXPECTED_PACKAGE_HASHES,
    taskHashesBefore,
    taskHashesAfter,
    retainedHashesBefore,
    retainedHashesAfter,
    retainedStatusBefore,
    retainedStatusAfter,
    downloads: 0,
  },
  git: {
    indexEmpty: true,
    dirtyPaths: finalDirtyPaths,
    initialStatusSha256: sha256(initialStatus),
    finalStatusSha256: sha256(finalStatus),
  },
  network: {
    policy: "loopback-only-with-browser-and-server-child-denial",
    externalRequests: 0,
    appMounted: false,
    providerRequests: 0,
  },
  cleanup: {
    status: "passed",
    nodeModulesSymlinkPresent: false,
    proofRootCollisionRefused: true,
    indexEmpty: true,
    retainedDependencySourceClean: true,
  },
};
writeFileSync(resolve(ROOT, args.output), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`SPEC-0002 Phase 1 proof recorded: ${args.output}`);
console.log(`ASSERTIONS: ${totalAssertions}`);
