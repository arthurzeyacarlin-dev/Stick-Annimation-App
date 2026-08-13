import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {basename, dirname, relative, resolve, sep} from "node:path";

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
  configVersion: 1;
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
const sha256Bytes = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fileBinding = (path: string) => {
  const bytes = readFileSync(resolve(ROOT, path));
  return {path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength};
};

const parseArgs = () => {
  const values = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
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
  };
};

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8"});
  if (result.status !== 0) throw new Error(result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
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

const nulList = (value: string) => value.split("\0").filter(Boolean);

const collectArtifacts = (configPath: string, commands: CommandConfig[], bindingPaths: string[], browserEvidenceInput: string | null) => {
  const paths = new Set<string>([
    configPath,
    "scripts/recordSpec0001ProofBundle.ts",
    "scripts/validateSpec0001ProofBundle.ts",
    "scripts/finalizeSpec0001ProofBundle.ts",
    "scripts/fixtures/stick-ai/v1/proof-manifest.schema.json",
    "scripts/fixtures/stick-ai/v1/proof-closeout-manifest.schema.json",
    "scripts/fixtures/stick-ai/v1/proof-command-receipt.schema.json",
    "scripts/fixtures/stick-ai/v1/phase7-live-proof-manifest.schema.json",
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
  return [...paths].filter((path) => !path.startsWith("output/") && existsSync(resolve(ROOT, path))).sort().map(fileBinding);
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

const headCommit = git("rev-parse", "HEAD");
if (headCommit !== args.base) throw new Error(`HEAD ${headCommit} does not equal authorized base ${args.base}.`);
const configBytes = readFileSync(resolve(ROOT, args.commands));
const config = JSON.parse(configBytes.toString("utf8")) as ProofCommandConfig;
if (config.configVersion !== 1 || config.phase !== args.phase || config.baseCommit !== args.base) {
  throw new Error("Command configuration phase/base/version mismatch.");
}
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
