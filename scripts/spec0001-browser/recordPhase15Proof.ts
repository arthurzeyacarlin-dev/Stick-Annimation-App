import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readdirSync, writeFileSync} from "node:fs";
import {basename, dirname, resolve} from "node:path";
import {
  BASE_COMMIT,
  FIXTURE_ROOT,
  OUTPUT_ROOT,
  PHASE,
  PHASE15_AUTHORIZED_PATHS,
  SPEC_ID,
  bindFile,
  readJson,
  repositoryPath,
  sha256Bytes,
  strictObject,
  type JsonObject,
} from "./browserTesterContract.ts";

const ROOT = process.cwd();
type Command = {name: string; argv: string[]; cwd: "."; env: Record<string, string>; expectedExitCode: number; privacy: "sanitized"; lintBaseline?: {errors: number; warnings: number; phasePathFindings: number}};

const args = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  assert.ok(match && !args.has(match[1]), `Unsupported or duplicate argument: ${argument}`);
  args.set(match[1], match[2]);
}
for (const key of ["base", "commands", "output"]) assert.ok(args.has(key), `Missing --${key}.`);
assert.equal(args.get("base"), BASE_COMMIT);
assert.equal(args.get("commands"), `${FIXTURE_ROOT}/phase-1.5-proof-commands.json`);
assert.equal(args.get("output"), `${OUTPUT_ROOT}/proof-manifest.json`);

const git = (...argv: string[]) => {
  const result = spawnSync("git", argv, {cwd: ROOT, encoding: "utf8", shell: false});
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed`);
  return result.stdout.trim();
};
assert.equal(git("rev-parse", "HEAD"), BASE_COMMIT);
assert.equal(git("diff", "--cached", "--name-only"), "");

const output = args.get("output")!;
const outputDirectory = dirname(repositoryPath(ROOT, output));
if (existsSync(outputDirectory)) {
  assert.deepEqual(readdirSync(outputDirectory), [], "Phase 1.5 proof output root must start empty.");
} else mkdirSync(outputDirectory, {recursive: true, mode: 0o700});

const configPath = args.get("commands")!;
const config = strictObject(readJson(ROOT, configPath), ["baseCommit", "commands", "configVersion", "phase"], "Proof command config");
assert.equal(config.configVersion, 1);
assert.equal(config.phase, PHASE);
assert.equal(config.baseCommit, BASE_COMMIT);
assert.ok(Array.isArray(config.commands) && config.commands.length === 7);
const commands = config.commands as Command[];
const expectedArgv = [
  ["node", "--experimental-strip-types", "scripts/spec0001-browser/validatePhase15.ts"],
  ["node", "--experimental-strip-types", "scripts/validateStickFigureAiContracts.ts"],
  ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
  ["npm", "run", "lint"],
  ["git", "diff", "--check"],
  ["npm", "run", "test:spec0001-browser"],
  ["git", "status", "--short", "--branch"],
];
commands.forEach((command, index) => {
  assert.deepEqual(Object.keys(command).sort(), (index === 3 ? ["argv", "cwd", "env", "expectedExitCode", "lintBaseline", "name", "privacy"] : ["argv", "cwd", "env", "expectedExitCode", "name", "privacy"]).sort());
  assert.deepEqual(command.argv, expectedArgv[index]);
  assert.equal(command.cwd, ".");
  assert.deepEqual(command.env, {});
  assert.equal(command.privacy, "sanitized");
  assert.equal(command.expectedExitCode, index === 3 ? 1 : 0);
  assert.ok(!["sh", "bash", "zsh"].includes(command.argv[0]) && !command.argv.includes("-c"));
});

const receipts = [];
let commandsPassed = true;
let observedLint = {errors: -1, warnings: -1, phasePathFindings: -1};
const addedLinesByPath = new Map<string, Set<number>>();
for (const path of PHASE15_AUTHORIZED_PATHS.filter((value) => /\.[cm]?[jt]sx?$/.test(value))) {
  const diff = spawnSync("git", ["diff", "--unified=0", BASE_COMMIT, "--", path], {cwd: ROOT, encoding: "utf8", shell: false});
  assert.equal(diff.status, 0, diff.stderr || `Unable to inspect lint attribution for ${path}`);
  const lines = new Set<number>();
  for (const match of diff.stdout.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line += 1) lines.add(line);
  }
  addedLinesByPath.set(path, lines);
}
for (const [order, command] of commands.entries()) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const result = spawnSync(command.argv[0], command.argv.slice(1), {
    cwd: ROOT,
    env: {...process.env, ...command.env},
    encoding: "buffer",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "");
  const exitCode = result.status ?? 255;
  if (command.lintBaseline) {
    const text = Buffer.concat([stdout, stderr]).toString("utf8");
    const summary = /6 errors?[, ]+73 warnings?|79 problems \(6 errors, 73 warnings\)/.test(text);
    let currentPath: string | null = null;
    let phasePathFindings = 0;
    for (const line of text.split("\n")) {
      if (line.startsWith(`${ROOT}/`)) {
        currentPath = line.slice(ROOT.length + 1);
        continue;
      }
      const finding = /^\s*(\d+):(\d+)\s+(?:error|warning)\s+/.exec(line);
      if (!finding || !currentPath || !addedLinesByPath.has(currentPath)) continue;
      if (addedLinesByPath.get(currentPath)!.has(Number(finding[1]))) phasePathFindings += 1;
    }
    observedLint = {errors: summary ? 6 : -1, warnings: summary ? 73 : -1, phasePathFindings};
  }
  const passed = exitCode === command.expectedExitCode && (!command.lintBaseline || JSON.stringify(observedLint) === JSON.stringify(command.lintBaseline));
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
    durationMs: Math.max(0, Math.round(performance.now() - start)),
    exitCode,
    expectedExitCode: command.expectedExitCode,
    passed,
    stdout: {encoding: "base64", byteLength: stdout.byteLength, sha256: sha256Bytes(stdout), data: stdout.toString("base64")},
    stderr: {encoding: "base64", byteLength: stderr.byteLength, sha256: sha256Bytes(stderr), data: stderr.toString("base64")},
    lintBaseline: command.lintBaseline ? observedLint : null,
  };
  const receiptPath = `${OUTPUT_ROOT}/receipts/${String(order).padStart(3, "0")}-${basename(command.name)}.json`;
  mkdirSync(dirname(repositoryPath(ROOT, receiptPath)), {recursive: true, mode: 0o700});
  writeFileSync(repositoryPath(ROOT, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  receipts.push(bindFile(ROOT, receiptPath));
}

const browserPath = `${OUTPUT_ROOT}/browser/result.json`;
assert.ok(existsSync(repositoryPath(ROOT, browserPath)), "Browser result evidence is missing.");
const browserEvidence = readJson(ROOT, browserPath) as JsonObject;
const listFiles = (directory: string): string[] => readdirSync(resolve(ROOT, directory), {withFileTypes: true})
  .flatMap((entry) => entry.isDirectory() ? listFiles(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
const artifactPaths = [
  configPath,
  "package.json", "package-lock.json", "src/components/workspace/DrawingCanvas.tsx", "src/components/workspace/stickfigure/StickFigureWorkspace.tsx",
  "scripts/runSpec0001BrowserProof.ts",
  "scripts/spec0001-browser/browserTesterContract.ts", "scripts/spec0001-browser/networkDeny.cjs",
  "scripts/spec0001-browser/validatePhase15.ts", "scripts/spec0001-browser/recordPhase15Proof.ts",
  "scripts/spec0001-browser/validatePhase15Proof.ts", "scripts/spec0001-browser/finalizePhase15Closeout.ts",
  ...readdirSync(resolve(ROOT, FIXTURE_ROOT), {withFileTypes: true}).filter((entry) => entry.isFile()).map((entry) => `${FIXTURE_ROOT}/${entry.name}`),
  ...readdirSync(resolve(ROOT, `${FIXTURE_ROOT}/fonts`), {withFileTypes: true}).map((entry) => `${FIXTURE_ROOT}/fonts/${entry.name}`),
  ...listFiles(`${OUTPUT_ROOT}/browser`),
].sort().filter((path, index, values) => index === 0 || path !== values[index - 1]);
const artifacts = artifactPaths.map((path) => bindFile(ROOT, path));
assert.equal(artifacts.length, 49, "Phase 1.5 proof must bind exactly 49 artifacts.");
const manifest = {
  manifestVersion: 1,
  specId: SPEC_ID,
  phase: PHASE,
  baseCommit: BASE_COMMIT,
  headCommit: git("rev-parse", "HEAD"),
  recordedAt: new Date().toISOString(),
  runtime: {nodeVersion: process.version, npmVersion: spawnSync("npm", ["--version"], {encoding: "utf8"}).stdout.trim(), playwrightCoreVersion: "1.62.1", browserVersion: browserEvidence.browserVersion},
  commandConfig: bindFile(ROOT, configPath),
  receipts,
  artifacts,
  browserEvidence: bindFile(ROOT, browserPath),
  commandsPassed,
  lintBaseline: observedLint,
  git: {indexEmpty: git("diff", "--cached", "--name-only") === "", statusSha256: sha256Bytes(git("status", "--short", "--branch"))},
};
writeFileSync(repositoryPath(ROOT, output), `${JSON.stringify(manifest, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
console.log(`Recorded ${receipts.length} Phase 1.5 receipts at ${output}; result ${commandsPassed ? "PASS" : "FAIL"}.`);
if (!commandsPassed) process.exitCode = 1;
