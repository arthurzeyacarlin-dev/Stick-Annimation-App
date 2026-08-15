import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

type JsonObject = Record<string, unknown>;
type FileBinding = { path: string; byteLength: number; sha256: string };

const ROOT = process.cwd();
const MANIFEST_PATH = "output/spec-0002/phase-1/proof-manifest.json";
const CONFIG_PATH = "scripts/fixtures/drawing-persistence/v2/phase-1-proof-commands.json";
const BASE_COMMIT = "82663051b30cdcfd6766cf4714cdeb2306970045";
const RETAINED_ROOT = "/Users/arthurcarlin/.codex/worktrees/feba/stick-animation-app";
const EXPECTED_PACKAGE_HASHES = {
  "package.json": "e6edf49f35a1ad4dcebb781b651bdc66b432dc690d254abdd599be631be908fb",
  "package-lock.json": "46468de2fe5d41c00aa0c357ff39c5c085a296d68879babf757b72ed10d205fa",
};
const RECEIPT_NAMES = ["v2-contract", "v2-repository", "v1-compatibility", "browser-engine", "typescript", "lint-regression", "diff-check", "cached-diff-check", "status"];
const EXPECTED_ARGV = [
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
const rawFileHash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const git = (cwd: string, ...argv: string[]) => {
  const result = spawnSync("git", argv, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const exactObject = (value: unknown, keys: readonly string[], label: string): JsonObject => {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert.deepEqual(Object.keys(value as object).sort(), [...keys].sort(), `${label} fields must be exact.`);
  return value as JsonObject;
};
const readJson = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as unknown;
const validateBinding = (value: unknown, label: string, verifyFile = true): FileBinding => {
  const binding = exactObject(value, ["path", "byteLength", "sha256"], label);
  assert.equal(typeof binding.path, "string");
  assert.ok(Number.isSafeInteger(binding.byteLength) && Number(binding.byteLength) >= 0);
  assert.match(String(binding.sha256), /^sha256:[0-9a-f]{64}$/);
  const local = relative(ROOT, resolve(ROOT, binding.path as string));
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`), `${label} escapes the repository.`);
  if (verifyFile) {
    const bytes = readFileSync(resolve(ROOT, binding.path as string));
    assert.equal(bytes.byteLength, binding.byteLength);
    assert.equal(sha256(bytes), binding.sha256);
  }
  return binding as unknown as FileBinding;
};
const currentDirtyPaths = () => {
  const modified = git(ROOT, "diff", "--name-only", "HEAD").split("\n").filter(Boolean);
  const untracked = git(ROOT, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  return [...new Set([...modified, ...untracked])].sort();
};
const decodeStream = (value: unknown, label: string) => {
  const stream = exactObject(value, ["encoding", "byteLength", "sha256", "data"], label);
  assert.equal(stream.encoding, "base64");
  const bytes = Buffer.from(String(stream.data), "base64");
  assert.equal(bytes.byteLength, stream.byteLength);
  assert.equal(sha256(bytes), stream.sha256);
  return bytes;
};

export const validateSpec0002ProofManifest = (
  path: string,
  options: { verifyFiles?: boolean; allowAdditionalDirtyPaths?: string[] } = {},
) => {
  const verifyFiles = options.verifyFiles ?? true;
  assert.equal(path, MANIFEST_PATH);
  const manifest = exactObject(
    readJson(path),
    ["manifestVersion", "specId", "phase", "baseCommit", "headCommit", "recordedAt", "commandsPassed", "commandConfig", "receipts", "artifacts", "assertions", "lintBaseline", "runtime", "dependencyEnvironment", "git", "network", "cleanup"],
    "Manifest",
  );
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.specId, "SPEC-0002");
  assert.equal(manifest.phase, 1);
  assert.equal(manifest.baseCommit, BASE_COMMIT);
  assert.equal(manifest.headCommit, BASE_COMMIT);
  assert.equal(manifest.commandsPassed, true);
  assert.match(String(manifest.recordedAt), /^\d{4}-\d{2}-\d{2}T/);

  const configBinding = validateBinding(manifest.commandConfig, "Command config binding", verifyFiles);
  assert.equal(configBinding.path, CONFIG_PATH);
  const config = exactObject(readJson(CONFIG_PATH), ["configVersion", "specId", "phase", "baseCommit", "bindings", "commands"], "Command config");
  assert.equal(config.configVersion, 1);
  assert.equal(config.specId, "SPEC-0002");
  assert.equal(config.phase, 1);
  assert.equal(config.baseCommit, BASE_COMMIT);
  assert.ok(Array.isArray(config.commands) && config.commands.length === 9);

  assert.ok(Array.isArray(manifest.receipts) && manifest.receipts.length === 9);
  const parsedAssertions: Record<string, number> = {};
  let parsedBrowserVersion = "";
  for (const [index, receiptBindingValue] of (manifest.receipts as unknown[]).entries()) {
    const receiptBinding = validateBinding(receiptBindingValue, `Receipt binding ${index}`, verifyFiles);
    assert.equal(receiptBinding.path, `output/spec-0002/phase-1/receipts/${String(index).padStart(2, "0")}-${RECEIPT_NAMES[index]}.json`);
    const receipt = exactObject(
      readJson(receiptBinding.path),
      ["receiptVersion", "order", "name", "argv", "cwd", "env", "privacy", "startedAt", "durationMs", "exitCode", "expectedExitCode", "passed", "stdout", "stderr", "lintBaseline"],
      `Receipt ${index}`,
    );
    assert.equal(receipt.receiptVersion, 1);
    assert.equal(receipt.order, index);
    assert.equal(receipt.name, RECEIPT_NAMES[index]);
    assert.deepEqual(receipt.argv, EXPECTED_ARGV[index]);
    assert.equal(receipt.cwd, ".");
    assert.equal(receipt.privacy, "sanitized");
    assert.equal(receipt.exitCode, index === 5 ? 1 : 0);
    assert.equal(receipt.expectedExitCode, index === 5 ? 1 : 0);
    assert.equal(receipt.passed, true);
    assert.ok(Number.isSafeInteger(receipt.durationMs) && Number(receipt.durationMs) >= 0);
    assert.deepEqual(receipt.env, { NEXT_TELEMETRY_DISABLED: "1", OPENAI_API_KEY: "", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" });
    const stdout = decodeStream(receipt.stdout, `Receipt ${index} stdout`);
    decodeStream(receipt.stderr, `Receipt ${index} stderr`);
    if (index < 4) {
      const match = /ASSERTIONS:\s*(\d+)/.exec(stdout.toString("utf8"));
      assert.ok(match);
      parsedAssertions[RECEIPT_NAMES[index]] = Number(match[1]);
    }
    if (index === 3) {
      const evidenceLine = stdout.toString("utf8").split("\n").find((line) => line.startsWith('{"browser"'));
      assert.ok(evidenceLine);
      const evidence = exactObject(JSON.parse(evidenceLine!), ["browser", "result", "network", "appMounted"], "Browser evidence");
      assert.equal(evidence.appMounted, false);
      const network = exactObject(evidence.network, ["browserLedger", "serverDenials", "nonLoopbackTraffic"], "Browser network evidence");
      assert.equal(network.nonLoopbackTraffic, 0);
      parsedBrowserVersion = String(evidence.browser);
    }
    if (index === 5) assert.deepEqual(receipt.lintBaseline, { errors: 6, warnings: 73, phasePathFindings: 0 });
    else assert.equal(receipt.lintBaseline, null);
  }

  const assertionsValue = exactObject(manifest.assertions, ["v2-contract", "v2-repository", "v1-compatibility", "browser-engine", "total"], "Assertion totals");
  assert.deepEqual(
    Object.fromEntries(Object.entries(assertionsValue).filter(([key]) => key !== "total")),
    parsedAssertions,
  );
  assert.equal(assertionsValue.total, Object.values(parsedAssertions).reduce((sum, value) => sum + value, 0));
  assert.deepEqual(manifest.lintBaseline, { errors: 6, warnings: 73, phasePathFindings: 0 });

  const runtime = exactObject(manifest.runtime, ["nodeVersion", "npmVersion", "typescriptVersion", "eslintVersion", "playwrightCoreVersion", "browserVersion"], "Runtime");
  assert.equal(runtime.nodeVersion, process.version);
  assert.equal(runtime.typescriptVersion, "Version 5.9.3");
  assert.equal(runtime.eslintVersion, "v9.39.2");
  assert.equal(runtime.playwrightCoreVersion, "1.62.1");
  assert.equal(runtime.browserVersion, parsedBrowserVersion);

  const dependency = exactObject(
    manifest.dependencyEnvironment,
    ["symlinkPath", "symlinkTarget", "symlinkVerifiedBefore", "symlinkRemovedAfter", "expectedPackageHashes", "taskHashesBefore", "taskHashesAfter", "retainedHashesBefore", "retainedHashesAfter", "retainedStatusBefore", "retainedStatusAfter", "downloads"],
    "Dependency environment",
  );
  assert.equal(dependency.symlinkPath, "node_modules");
  assert.equal(dependency.symlinkTarget, `${RETAINED_ROOT}/node_modules`);
  assert.equal(dependency.symlinkVerifiedBefore, true);
  assert.equal(dependency.symlinkRemovedAfter, true);
  assert.equal(dependency.downloads, 0);
  for (const key of ["expectedPackageHashes", "taskHashesBefore", "taskHashesAfter", "retainedHashesBefore", "retainedHashesAfter"] as const) {
    assert.deepEqual(dependency[key], EXPECTED_PACKAGE_HASHES);
  }
  assert.equal(dependency.retainedStatusBefore, "## codex/spec-0001-phase-1.5-closeout");
  assert.equal(dependency.retainedStatusAfter, dependency.retainedStatusBefore);

  const gitEvidence = exactObject(manifest.git, ["indexEmpty", "dirtyPaths", "initialStatusSha256", "finalStatusSha256"], "Git evidence");
  assert.equal(gitEvidence.indexEmpty, true);
  assert.ok(Array.isArray(gitEvidence.dirtyPaths));
  assert.deepEqual(gitEvidence.dirtyPaths, [...(gitEvidence.dirtyPaths as string[])].sort());
  assert.match(String(gitEvidence.initialStatusSha256), /^sha256:[0-9a-f]{64}$/);
  assert.match(String(gitEvidence.finalStatusSha256), /^sha256:[0-9a-f]{64}$/);

  assert.ok(Array.isArray(manifest.artifacts));
  const artifactPaths = (manifest.artifacts as unknown[]).map((value, index) => validateBinding(value, `Artifact ${index}`, verifyFiles).path);
  assert.deepEqual(artifactPaths, [...artifactPaths].sort());
  assert.equal(new Set(artifactPaths).size, artifactPaths.length);
  assert.deepEqual(artifactPaths, gitEvidence.dirtyPaths);
  assert.ok(!artifactPaths.some((artifactPath) => artifactPath.startsWith("output/")), "Manifest must not bind itself or proof output.");

  const network = exactObject(manifest.network, ["policy", "externalRequests", "appMounted", "providerRequests"], "Network policy");
  assert.deepEqual(network, { policy: "loopback-only-with-browser-and-server-child-denial", externalRequests: 0, appMounted: false, providerRequests: 0 });
  const cleanup = exactObject(manifest.cleanup, ["status", "nodeModulesSymlinkPresent", "proofRootCollisionRefused", "indexEmpty", "retainedDependencySourceClean"], "Cleanup");
  assert.deepEqual(cleanup, { status: "passed", nodeModulesSymlinkPresent: false, proofRootCollisionRefused: true, indexEmpty: true, retainedDependencySourceClean: true });

  if (verifyFiles) {
    assert.equal(git(ROOT, "rev-parse", "HEAD"), BASE_COMMIT);
    assert.equal(git(ROOT, "diff", "--cached", "--name-only"), "");
    const current = currentDirtyPaths();
    const recorded = gitEvidence.dirtyPaths as string[];
    const allowedAdditional = new Set(options.allowAdditionalDirtyPaths ?? []);
    assert.deepEqual(current.filter((pathValue) => !recorded.includes(pathValue)).filter((pathValue) => !allowedAdditional.has(pathValue)), []);
    assert.deepEqual(recorded.filter((pathValue) => !current.includes(pathValue)), []);
    assert.equal(existsSync(resolve(ROOT, "node_modules")), false);
    for (const [name, hash] of Object.entries(EXPECTED_PACKAGE_HASHES)) {
      assert.equal(rawFileHash(resolve(ROOT, name)), hash);
      assert.equal(rawFileHash(resolve(RETAINED_ROOT, name)), hash);
    }
    assert.equal(git(RETAINED_ROOT, "status", "--short", "--branch"), "## codex/spec-0001-phase-1.5-closeout");
  }
  return manifest;
};

const runSelfTests = (path: string) => {
  const original = readJson(path) as JsonObject;
  const validateMutation = (value: JsonObject) => {
    exactObject(value, ["manifestVersion", "specId", "phase", "baseCommit", "headCommit", "recordedAt", "commandsPassed", "commandConfig", "receipts", "artifacts", "assertions", "lintBaseline", "runtime", "dependencyEnvironment", "git", "network", "cleanup"], "Mutated manifest");
    assert.equal(value.commandsPassed, true);
    assert.deepEqual(value.commandConfig, original.commandConfig);
    assert.ok(Array.isArray(value.receipts) && value.receipts.length === 9);
    (value.receipts as unknown[]).forEach((entry, index) => {
      const receipt = validateBinding(entry, `Mutated receipt ${index}`, false);
      assert.equal(receipt.path, `output/spec-0002/phase-1/receipts/${String(index).padStart(2, "0")}-${RECEIPT_NAMES[index]}.json`);
      assert.deepEqual(entry, (original.receipts as unknown[])[index]);
    });
    assert.deepEqual(value.lintBaseline, { errors: 6, warnings: 73, phasePathFindings: 0 });
    const assertionValue = value.assertions as JsonObject;
    assert.equal(assertionValue.total, Object.entries(assertionValue).filter(([key]) => key !== "total").reduce((sum, [, count]) => sum + Number(count), 0));
    assert.deepEqual(value.assertions, original.assertions);
    assert.deepEqual(value.cleanup, { status: "passed", nodeModulesSymlinkPresent: false, proofRootCollisionRefused: true, indexEmpty: true, retainedDependencySourceClean: true });
    assert.deepEqual(value.network, { policy: "loopback-only-with-browser-and-server-child-denial", externalRequests: 0, appMounted: false, providerRequests: 0 });
    const artifacts = (value.artifacts as FileBinding[]).map((entry) => entry.path);
    assert.deepEqual(artifacts, [...artifacts].sort());
    assert.deepEqual(value.artifacts, original.artifacts);
    assert.ok(!(value.artifacts as FileBinding[]).some((entry) => entry.path === path));
  };
  const expectRejected = (mutate: (value: JsonObject) => void) => {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => validateMutation(value));
  };
  const mutations: Array<(value: JsonObject) => void> = [
    (value) => { delete value.cleanup; },
    (value) => { value.extra = true; },
    (value) => { (value.receipts as unknown[]).pop(); },
    (value) => { const receipts = value.receipts as unknown[]; [receipts[0], receipts[1]] = [receipts[1], receipts[0]]; },
    (value) => { ((value.receipts as JsonObject[])[0]).sha256 = `sha256:${"0".repeat(64)}`; },
    (value) => { (value.commandConfig as JsonObject).sha256 = `sha256:${"0".repeat(64)}`; },
    (value) => { (value.artifacts as unknown[]).pop(); },
    (value) => { (value.assertions as JsonObject).total = 1; },
    (value) => { value.lintBaseline = { errors: 0, warnings: 0, phasePathFindings: 0 }; },
    (value) => { (value.cleanup as JsonObject).nodeModulesSymlinkPresent = true; },
    (value) => { (value.network as JsonObject).externalRequests = 1; },
    (value) => { (value.artifacts as JsonObject[]).push({ path, byteLength: 0, sha256: `sha256:${"0".repeat(64)}` }); },
  ];
  mutations.forEach(expectRejected);
  return mutations.length;
};

const main = () => {
  if (process.argv.length !== 3 || process.argv[2] !== MANIFEST_PATH) throw new Error(`Usage: node --experimental-strip-types scripts/validateSpec0002Proof.ts ${MANIFEST_PATH}`);
  validateSpec0002ProofManifest(process.argv[2]);
  const selfTests = runSelfTests(process.argv[2]);
  console.log(`SPEC-0002 Phase 1 proof validated. SELF_TESTS: ${selfTests}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
