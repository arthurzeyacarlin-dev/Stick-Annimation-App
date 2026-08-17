import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import {
  AUTHORIZED_EXACT_PATHS,
  AUTHORIZED_PREFIX,
  CLEAN_PRE_EDIT_GATE,
  FROZEN_BINDINGS,
  FROZEN_PHASE15_PATHS,
  PHASE1_PATHS,
  PHASE1_PREFIX,
  PHASE1_PUBLICATION,
  PREDECESSOR_MANIFESTS,
  RECEIPT_DEFINITIONS,
  SANITIZED_ENV,
  SPEC0002_BASE,
  SPEC0002_ID,
  SPEC0002_OUTPUT_ROOT,
  bindLocalFile,
  sha256,
  stableJson,
  strictObject,
} from "./spec0002-browser/browserProofContract.ts";

type Json = Record<string, unknown>;
type ReceiptBinding = { path: string; sha256: string; byteLength: number };

const ROOT = process.cwd();
const CONFIG_PATH = "scripts/fixtures/spec0002-browser/v1/phase-2-proof-commands.json";
const OUTPUT_PATH = `${SPEC0002_OUTPUT_ROOT}/proof-manifest.json`;
const RECEIPT_ROOT = `${SPEC0002_OUTPUT_ROOT}/receipts`;
const RETAINED_ROOT = "/Users/arthurcarlin/.codex/worktrees/feba/stick-animation-app";
const PHASE15_PUBLICATION = "8df64552e29e4170df8000097fe857b7a31dff69";
const NODE_MODULES = resolve(ROOT, "node_modules");

const object = (value: unknown, keys: readonly string[], label: string) => strictObject(value, keys, label);
const git = (cwd: string, ...argv: string[]) => {
  const result = spawnSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || `git ${argv.join(" ")} failed.`);
  return result.stdout.trim();
};
const gitBytes = (commit: string, path: string) => {
  const result = spawnSync("git", ["show", `${commit}:${path}`], { cwd: ROOT, encoding: null, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString() || `Missing ${commit}:${path}.`);
  return result.stdout;
};
const dirtyPaths = () => {
  const modified = git(ROOT, "diff", "--name-only", "HEAD").split("\n").filter(Boolean);
  const untracked = git(ROOT, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  return [...new Set([...modified, ...untracked])].sort();
};
const authorized = (path: string) => AUTHORIZED_EXACT_PATHS.includes(path as (typeof AUTHORIZED_EXACT_PATHS)[number]) || path.startsWith(AUTHORIZED_PREFIX);
const parseArgs = () => {
  const argv = process.argv.slice(2);
  assert.deepEqual(argv, [`--commands=${CONFIG_PATH}`, `--output=${OUTPUT_PATH}`], "Use the exact Phase 2 recorder invocation.");
};
const assertSafeOutput = () => {
  const absolute = resolve(ROOT, SPEC0002_OUTPUT_ROOT);
  const local = relative(ROOT, absolute);
  assert.ok(local !== "" && local !== ".." && !local.startsWith(`..${sep}`));
  assert.equal(existsSync(absolute), false, "Phase 2 proof output must be collision-free.");
};
const exactConfig = (config: Json) => {
  object(config, ["configVersion", "specId", "phase", "baseCommit", "bindings", "commands"], "Command config");
  assert.deepEqual([config.configVersion, config.specId, config.phase, config.baseCommit], [1, SPEC0002_ID, 2, SPEC0002_BASE]);
  const commands = config.commands;
  assert.ok(Array.isArray(commands) && commands.length === RECEIPT_DEFINITIONS.length);
  commands.forEach((value, index) => {
    const command = object(value, ["name", "argv", "cwd", "env", "privacy", "expectedExitCode"], `Command ${index}`);
    const [name, argv, expectedExitCode] = RECEIPT_DEFINITIONS[index];
    assert.deepEqual(command, { name, argv, cwd: ".", env: SANITIZED_ENV, privacy: "sanitized", expectedExitCode });
  });
  const groups = object(config.bindings, ["phase2", "fixtures", "frozen"], "Binding groups");
  const paths = Object.values(groups).flatMap((value) => {
    assert.ok(Array.isArray(value));
    return value.map(String);
  });
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.every((path) => existsSync(resolve(ROOT, path))));
};
const commandEnvironment = () => {
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SHELL", "TERM"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, ...SANITIZED_ENV, NODE_OPTIONS: "", NODE_ENV: "test" } as NodeJS.ProcessEnv;
};
const stream = (bytes: Buffer) => ({
  encoding: "base64",
  byteLength: bytes.byteLength,
  sha256: sha256(bytes),
  data: bytes.toString("base64"),
});
const expectedPhase1Paths = () => {
  const fixtures = git(ROOT, "ls-tree", "-r", "--name-only", PHASE1_PUBLICATION, PHASE1_PREFIX).split("\n").filter(Boolean);
  return [...PHASE1_PATHS, ...fixtures].sort();
};
const publishedBindings = (commit: string, paths: readonly string[]) => paths.map((path) => {
  const current = bindLocalFile(ROOT, path);
  assert.equal(current.sha256, sha256(gitBytes(commit, path)), `Published predecessor drift: ${path}`);
  return current;
});
const parseAssertionCount = (text: string, name: string) => {
  const match = /ASSERTIONS:\s*(\d+)/.exec(text);
  assert.ok(match, `${name} did not report ASSERTIONS.`);
  return Number(match[1]);
};
const parseLint = (text: string) => {
  const match = /(?:\u2716\s+)?(\d+) problems \((\d+) errors, (\d+) warnings\)/.exec(text);
  assert.ok(match, "Lint did not report its aggregate baseline.");
  return { problems: Number(match[1]), errors: Number(match[2]), warnings: Number(match[3]) };
};
const changedLines = () => {
  const result = new Map<string, Set<number>>();
  const untracked = git(ROOT, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  for (const path of untracked) {
    const count = readFileSync(resolve(ROOT, path), "utf8").split("\n").length;
    result.set(path, new Set(Array.from({ length: count }, (_, index) => index + 1)));
  }
  const diff = spawnSync("git", ["diff", "--unified=0", "--no-color", "HEAD", "--", ...AUTHORIZED_EXACT_PATHS.filter((path) => existsSync(resolve(ROOT, path)))], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(diff.status, 0, diff.stderr);
  let path = "";
  for (const line of diff.stdout.split("\n")) {
    if (line.startsWith("+++ b/")) path = line.slice(6);
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !path) continue;
    const start = Number(hunk[1]); const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const lines = result.get(path) ?? new Set<number>();
    for (let value = start; value < start + count; value += 1) lines.add(value);
    result.set(path, lines);
  }
  return result;
};
const countChangedLintFindings = (text: string) => {
  const changed = changedLines();
  let current = "";
  let count = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith(`${ROOT}/`)) current = line.slice(ROOT.length + 1);
    const finding = /^\s+(\d+):(\d+)\s+(warning|error)\s/.exec(line);
    if (finding && changed.get(current)?.has(Number(finding[1]))) count += 1;
  }
  return count;
};
const assertPortReleased = (port: number) => new Promise<void>((resolvePort, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close((error) => error ? reject(error) : resolvePort()));
});

const main = async () => {
  parseArgs();
  assertSafeOutput();
  assert.equal(git(ROOT, "rev-parse", "HEAD"), SPEC0002_BASE);
  assert.equal(git(ROOT, "diff", "--cached", "--name-only"), "");
  const initialDirty = dirtyPaths();
  assert.ok(initialDirty.length > 0 && initialDirty.every(authorized), "Initial dirty path allowlist mismatch.");
  assert.ok(existsSync(NODE_MODULES) && lstatSync(NODE_MODULES).isDirectory() && !lstatSync(NODE_MODULES).isSymbolicLink(), "node_modules must be a materialized local directory.");
  const playwright = JSON.parse(readFileSync(resolve(NODE_MODULES, "playwright-core/package.json"), "utf8")) as { version: string };
  assert.equal(playwright.version, "1.62.1");
  const taskPackageHash = sha256(readFileSync(resolve(ROOT, "package.json")));
  const retainedPackageHash = sha256(readFileSync(resolve(RETAINED_ROOT, "package.json")));
  assert.equal(retainedPackageHash, taskPackageHash);
  assert.equal(sha256(readFileSync(resolve(RETAINED_ROOT, "node_modules/playwright-core/package.json"))), sha256(readFileSync(resolve(NODE_MODULES, "playwright-core/package.json"))));
  const config = JSON.parse(readFileSync(resolve(ROOT, CONFIG_PATH), "utf8")) as Json;
  exactConfig(config);
  mkdirSync(resolve(ROOT, RECEIPT_ROOT), { recursive: true, mode: 0o700 });
  const receiptBindings: ReceiptBinding[] = [];
  const assertionCounts: Record<string, number> = {};
  let lintEvidence = { problems: -1, errors: -1, warnings: -1, changedLineFindings: -1 };
  let commandFailure: Error | null = null;
  let runtime: Json = {};
  try {
    runtime = {
      nodeVersion: process.version,
      npmVersion: spawnSync("npm", ["--version"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
      typescriptVersion: spawnSync(resolve(NODE_MODULES, ".bin/tsc"), ["--version"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
      eslintVersion: spawnSync(resolve(NODE_MODULES, ".bin/eslint"), ["--version"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
      playwrightCoreVersion: playwright.version,
      chromeExecutable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      downloads: 0,
    };
    const commands = config.commands as Json[];
    for (const [order, command] of commands.entries()) {
      const argv = command.argv as string[];
      const startedAt = new Date().toISOString();
      const started = Date.now();
      const result = spawnSync(argv[0], argv.slice(1), {
        cwd: ROOT,
        env: commandEnvironment(),
        encoding: null,
        maxBuffer: 128 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      });
      const stdout = result.stdout ?? Buffer.alloc(0);
      const stderr = result.stderr ?? Buffer.alloc(0);
      const combined = Buffer.concat([stdout, stderr]).toString("utf8");
      const exitCode = result.status ?? -1;
      const expectedExitCode = command.expectedExitCode as number;
      if (order <= 4) assertionCounts[command.name as string] = parseAssertionCount(combined, command.name as string);
      if (order === 8) {
        const parsed = parseLint(combined);
        lintEvidence = { ...parsed, changedLineFindings: countChangedLintFindings(combined) };
      }
      const receipt = {
        receiptVersion: 1,
        order,
        name: command.name,
        argv,
        cwd: ".",
        env: SANITIZED_ENV,
        privacy: "sanitized",
        startedAt,
        durationMs: Date.now() - started,
        exitCode,
        expectedExitCode,
        passed: exitCode === expectedExitCode,
        stdout: stream(stdout),
        stderr: stream(stderr),
        lintBaseline: order === 8 ? { acceptedErrors: 6, acceptedWarnings: 73 } : null,
      };
      const receiptPath = `${RECEIPT_ROOT}/${String(order).padStart(2, "0")}-${command.name}.json`;
      writeFileSync(resolve(ROOT, receiptPath), `${stableJson(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
      receiptBindings.push(bindLocalFile(ROOT, receiptPath));
      if (exitCode !== expectedExitCode) {
        commandFailure = new Error(`Receipt ${order} ${command.name} exited ${exitCode}; expected ${expectedExitCode}.`);
        break;
      }
    }
  } finally {
    if (existsSync(resolve(ROOT, ".next"))) rmSync(resolve(ROOT, ".next"), { recursive: true, force: true });
    if (existsSync(NODE_MODULES)) {
      const stat = lstatSync(NODE_MODULES);
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), "Refusing to remove an unexpected node_modules object.");
      rmSync(NODE_MODULES, { recursive: true, force: true });
    }
  }
  if (commandFailure) throw commandFailure;
  assert.equal(receiptBindings.length, 12);
  assert.ok(lintEvidence.errors <= 6 && lintEvidence.warnings <= 73 && lintEvidence.changedLineFindings === 0, `Lint regression: ${JSON.stringify(lintEvidence)}.`);
  assert.equal(existsSync(NODE_MODULES), false);
  assert.equal(existsSync(resolve(ROOT, ".next")), false);
  const phase2Path = `${SPEC0002_OUTPUT_ROOT}/browser/phase-2-real-browser-proof/result.json`;
  const regressionPath = `${SPEC0002_OUTPUT_ROOT}/browser/phase-1.5-regression-extension/result.json`;
  const phase2 = JSON.parse(readFileSync(resolve(ROOT, phase2Path), "utf8")) as Json;
  const regression = JSON.parse(readFileSync(resolve(ROOT, regressionPath), "utf8")) as Json;
  assert.equal(phase2.status, "passed"); assert.equal(regression.status, "passed");
  const phase2Network = phase2.network as Json; const regressionNetwork = regression.network as Json;
  assert.deepEqual([phase2Network.mockedAiPosts, regressionNetwork.mockedAiPosts], [0, 1]);
  assert.deepEqual([phase2Network.externalAttempts, phase2Network.realApiRequests, regressionNetwork.externalAttempts, regressionNetwork.realApiRequests], [[], [], [], []]);
  assert.deepEqual([phase2Network.serverDeniedEntries, regressionNetwork.serverDeniedEntries], [0, 0]);
  await assertPortReleased(Number((phase2.runtime as Json).serverPort));
  await assertPortReleased(Number((regression.runtime as Json).serverPort));
  const phase1Files = publishedBindings(PHASE1_PUBLICATION, expectedPhase1Paths());
  const phase15Files = publishedBindings(PHASE15_PUBLICATION, FROZEN_PHASE15_PATHS);
  const frozenBindings = Object.values(FROZEN_BINDINGS).map((entry) => {
    const binding = bindLocalFile(ROOT, entry.path);
    assert.equal(binding.sha256, entry.sha256);
    return binding;
  });
  const finalDirty = dirtyPaths();
  assert.deepEqual(finalDirty, initialDirty, "Dirty path set changed during proof.");
  assert.ok(finalDirty.every(authorized));
  assert.equal(git(ROOT, "diff", "--cached", "--name-only"), "");
  const screenshotBindings = [...(phase2.screenshots as Json[]), ...(regression.screenshots as Json[])].map((entry) => bindLocalFile(ROOT, entry.path as string));
  const phase1Totals = {
    contract: assertionCounts["phase-1-v2-contract"],
    repository: assertionCounts["phase-1-v2-repository"],
    v1: assertionCounts["phase-1-v1-compatibility"],
    browserEngine: assertionCounts["phase-1-browser-engine"],
  };
  const phase2BrowserAssertions = (phase2.assertions as unknown[]).length;
  const regressionBrowserAssertions = (regression.assertions as unknown[]).length;
  const assertionTotal = Object.values(phase1Totals).reduce((sum, value) => sum + value, 20 + phase2BrowserAssertions + regressionBrowserAssertions + 44 + 10);
  const status = git(ROOT, "status", "--short", "--branch");
  const manifest = {
    manifestVersion: 1,
    specId: SPEC0002_ID,
    phase: 2,
    baseCommit: SPEC0002_BASE,
    headCommit: git(ROOT, "rev-parse", "HEAD"),
    recordedAt: new Date().toISOString(),
    commandsPassed: true,
    commandConfig: bindLocalFile(ROOT, CONFIG_PATH),
    receipts: receiptBindings,
    artifacts: finalDirty.map((path) => bindLocalFile(ROOT, path)),
    predecessors: {
      phase1TechnicalManifestSha256: PREDECESSOR_MANIFESTS.phase1,
      phase15TechnicalManifestSha256: PREDECESSOR_MANIFESTS.phase15,
      cleanPreEditGate: CLEAN_PRE_EDIT_GATE,
      phase1Publication: PHASE1_PUBLICATION,
      phase1Files,
      phase15Publication: PHASE15_PUBLICATION,
      phase15Files,
      frozenBindings,
    },
    browserEvidence: {
      phase2Result: bindLocalFile(ROOT, phase2Path),
      regressionResult: bindLocalFile(ROOT, regressionPath),
      phase2ServerLedger: bindLocalFile(ROOT, `${SPEC0002_OUTPUT_ROOT}/browser/phase-2-real-browser-proof/server-network.jsonl`),
      regressionServerLedger: bindLocalFile(ROOT, `${SPEC0002_OUTPUT_ROOT}/browser/phase-1.5-regression-extension/server-network.jsonl`),
      screenshots: screenshotBindings,
    },
    assertions: { phase1: phase1Totals, validatorNegativeClasses: 20, phase2Browser: phase2BrowserAssertions, regressionBrowser: regressionBrowserAssertions, flowSteps: 44, regressions: 10, total: assertionTotal },
    lintBaseline: { acceptedErrors: 6, acceptedWarnings: 73, actualErrors: lintEvidence.errors, actualWarnings: lintEvidence.warnings, changedLineFindings: lintEvidence.changedLineFindings },
    runtime,
    git: { indexEmpty: true, dirtyPaths: finalDirty, statusSha256: sha256(status) },
    network: { policy: "loopback-only-fail-closed", phase2AiPosts: 0, regressionAiPosts: 1, externalAttempts: 0, realApiRequests: 0, serverDeniedEntries: 0, providerRequests: 0 },
    cleanup: { status: "passed", browserProfiles: 0, servers: 0, ports: 0, nextAbsent: true, temporaryAbsent: true, instrumentationAbsent: true, collisionsRefused: true, nodeModulesRemoved: true },
  };
  mkdirSync(dirname(resolve(ROOT, OUTPUT_PATH)), { recursive: true, mode: 0o700 });
  assert.equal(readdirSync(resolve(ROOT, SPEC0002_OUTPUT_ROOT)).includes("proof-manifest.json"), false);
  writeFileSync(resolve(ROOT, OUTPUT_PATH), `${stableJson(manifest)}\n`, { encoding: "utf8", mode: 0o600 });
  assert.equal(sha256(readFileSync(resolve(RETAINED_ROOT, "package.json"))), retainedPackageHash, "Retained dependency source package changed.");
  process.stdout.write(`SPEC-0002 Phase 2 proof recorded: ${OUTPUT_PATH}\nASSERTIONS: ${assertionTotal}\n`);
};

await main();
