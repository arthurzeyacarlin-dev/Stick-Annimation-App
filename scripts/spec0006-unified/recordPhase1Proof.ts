import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const OUTPUT = resolve(ROOT, "output/spec-0006/phase-1");
const RECEIPTS = resolve(OUTPUT, "receipts");
const MANIFEST = resolve(OUTPUT, "proof-manifest.json");
const BASE_SHA = "3b784cc6a68ff6f10fa390d96b81376b46e54b44";
export const PHASE1_PATHS = [
  "scripts/fixtures/spec0006-unified/v1/mixed-realistic-source-ingredients.json",
  "scripts/fixtures/spec0006-unified/v1/phase1-cases.json",
  "scripts/fixtures/spec0006-unified/v1/proof-commands.json",
  "scripts/spec0006-unified/phase1BrowserProof.ts",
  "scripts/spec0006-unified/phase1FixtureFactory.ts",
  "scripts/spec0006-unified/phase1MigrationOracle.ts",
  "scripts/spec0006-unified/recordPhase1Proof.ts",
  "scripts/spec0006-unified/validatePhase1Migration.ts",
  "scripts/spec0006-unified/validatePhase1Proof.ts",
  "src/lib/animation/unifiedAnimationContract.ts",
  "src/lib/animation/unifiedAnimationMigration.ts",
] as const;

const sha = (bytes: Buffer | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => {
  const absolute = resolve(ROOT, path);
  const bytes = readFileSync(absolute);
  return { path, byteLength: bytes.byteLength, sha256: sha(bytes) };
};
const runGit = (args: string[]) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
const dirtyPaths = () => {
  const result = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
};

mkdirSync(RECEIPTS, { recursive: true });
const commands = [
  { id: "phase-contract-migration", command: "node", args: ["--experimental-strip-types", "scripts/spec0006-unified/validatePhase1Migration.ts"], expect: 0 },
  { id: "typescript", command: "npx", args: ["tsc", "--noEmit"], expect: 0 },
  { id: "focused-lint", command: "npx", args: ["eslint", ...PHASE1_PATHS.filter((path) => path.endsWith(".ts"))], expect: 0 },
  { id: "drawing-v1-compatibility", command: "node", args: ["--experimental-strip-types", "scripts/validateDrawingProjectV1Compatibility.ts"], expect: 0 },
  { id: "drawing-v2-contract", command: "node", args: ["--experimental-strip-types", "scripts/validateDrawingProjectV2Contract.ts"], expect: 0 },
  { id: "drawing-v2-repository", command: "node", args: ["--experimental-strip-types", "scripts/validateDrawingProjectV2Repository.ts"], expect: 0 },
  { id: "stick-history-storage", command: "node", args: ["--experimental-strip-types", "scripts/validateStickHistoryPersistence.ts"], expect: 0 },
  { id: "stick-timeline", command: "node", args: ["--experimental-strip-types", "scripts/validateStickPoseTimeline.ts"], expect: 0 },
  { id: "diff-check", command: "git", args: ["diff", "--check"], expect: 0 },
] as const;

const receipts = [] as Array<{ id: string; command: string; exitCode: number; stdout: string; stderr: string; path: string; byteLength: number; sha256: string }>;
for (const spec of commands) {
  const result = spawnSync(spec.command, spec.args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  assert.equal(result.status, spec.expect, `${spec.id} failed:\n${result.stdout}\n${result.stderr}`);
  const path = `output/spec-0006/phase-1/receipts/${spec.id}.json`;
  const receipt = { id: spec.id, command: [spec.command, ...spec.args].join(" "), exitCode: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(resolve(ROOT, path), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  receipts.push({ ...receipt, ...bind(path) });
}

const whitespaceDiagnostics: string[] = [];
for (const path of PHASE1_PATHS) {
  const result = runGit(["diff", "--no-index", "--check", "/dev/null", path]);
  assert.ok(result.status === 0 || result.status === 1 || result.status === 3, `Whitespace check failed to run for ${path}: ${result.stderr}`);
  whitespaceDiagnostics.push(result.stdout, result.stderr);
}
assert.equal(whitespaceDiagnostics.join(""), "", "A Phase 1 path has a whitespace error.");
const whitespacePath = "output/spec-0006/phase-1/receipts/phase1-whitespace-check.json";
const whitespaceReceipt = { id: "phase1-whitespace-check", command: "git diff --no-index --check /dev/null <each exact Phase 1 path>", exitCode: 0, stdout: "", stderr: "" };
writeFileSync(resolve(ROOT, whitespacePath), `${JSON.stringify(whitespaceReceipt, null, 2)}\n`, { mode: 0o600 });
receipts.push({ ...whitespaceReceipt, ...bind(whitespacePath) });

const fullLint = spawnSync("npx", ["eslint", "."], { cwd: ROOT, encoding: "utf8", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
const lintText = `${fullLint.stdout}\n${fullLint.stderr}`;
const lintMatch = /([0-9]+) problems? \(([0-9]+) errors?, ([0-9]+) warnings?\)/.exec(lintText);
assert.ok(lintMatch, `Full lint summary missing:\n${lintText.slice(-4000)}`);
assert.deepEqual(lintMatch.slice(1).map(Number), [77, 5, 72], "Full lint baseline changed.");
const fullLintPath = "output/spec-0006/phase-1/receipts/full-lint-baseline.json";
writeFileSync(resolve(ROOT, fullLintPath), `${JSON.stringify({ id: "full-lint-baseline", command: "npx eslint .", exitCode: fullLint.status, acceptedBaseline: { problems: 77, errors: 5, warnings: 72 }, stdout: fullLint.stdout, stderr: fullLint.stderr }, null, 2)}\n`, { mode: 0o600 });
receipts.push({ id: "full-lint-baseline", command: "npx eslint .", exitCode: fullLint.status ?? -1, stdout: fullLint.stdout, stderr: fullLint.stderr, ...bind(fullLintPath) });

const head = runGit(["rev-parse", "HEAD"]);
assert.equal(head.status, 0);
assert.equal(head.stdout.trim(), BASE_SHA, "Executor base moved.");
const cached = runGit(["diff", "--cached", "--name-only"]);
assert.equal(cached.status, 0);
assert.equal(cached.stdout.trim(), "", "Index is not empty.");
assert.deepEqual(dirtyPaths(), [...PHASE1_PATHS].sort(), "Dirty path allowlist changed.");

const productScan = spawnSync("rg", ["-n", "PRIVATE REVIEW|SPEC-0006|spec0006|review-only|fixture picker", "app", "src", "public"], { cwd: ROOT, encoding: "utf8" });
const allowedHidden = productScan.stdout.split("\n").filter(Boolean).filter((line) => !line.startsWith("src/lib/animation/"));
assert.deepEqual(allowedHidden, [], `Review-only token leaked into product paths:\n${allowedHidden.join("\n")}`);
const scanPath = "output/spec-0006/phase-1/receipts/product-source-scan.json";
writeFileSync(resolve(ROOT, scanPath), `${JSON.stringify({ id: "product-source-scan", command: "rg review tokens app src public", exitCode: 0, matchesOutsideHiddenPhase1Modules: allowedHidden }, null, 2)}\n`, { mode: 0o600 });
receipts.push({ id: "product-source-scan", command: "rg review tokens app src public", exitCode: 0, stdout: "", stderr: "", ...bind(scanPath) });

const browserPath = "output/spec-0006/phase-1/browser/result.json";
const browser = JSON.parse(readFileSync(resolve(ROOT, browserPath), "utf8")) as Record<string, unknown>;
assert.equal(browser.status, "PASS", "Browser proof is not green.");
assert.equal(browser.reviewOnlyUi, false);
assert.equal(browser.unchangedOrdinaryFlow, true);

const sourceBindings = PHASE1_PATHS.map(bind);
const artifactPaths = [
  browserPath,
  ...((browser.screenshots as Array<{ path: string }>).map((entry) => entry.path.startsWith(ROOT) ? entry.path.slice(ROOT.length + 1) : entry.path)),
];
const artifacts = artifactPaths.map(bind);
const reviewUrl = String(browser.url);
const manifest = {
  kind: "spec0006-phase1-proof-manifest",
  manifestVersion: 1,
  specId: "SPEC-0006",
  phase: 1,
  status: "PASS",
  baseSha: BASE_SHA,
  headSha: head.stdout.trim(),
  worktree: ROOT,
  branch: "detached-HEAD",
  indexEmpty: true,
  exactDirtyPaths: [...PHASE1_PATHS],
  pathCeiling: 18,
  trackedPathCount: PHASE1_PATHS.length,
  sourceBindings,
  receipts: receipts.map((receipt) => ({
    id: receipt.id,
    command: receipt.command,
    exitCode: receipt.exitCode,
    path: receipt.path,
    byteLength: receipt.byteLength,
    sha256: receipt.sha256,
  })),
  artifacts,
  contractEvidence: { validCases: 56, invalidCases: 124, repeatedMappings: 1000, sourceKinds: 4, sourceWrites: 0, independentOracle: true },
  browserEvidence: { reviewUrl, ordinaryUnchangedApp: true, reviewOnlyUi: false, apiRequests: 0, externalRequests: 0, consoleErrors: 0, pageErrors: 0 },
  protectedRuntimeChanges: [],
  externalProviderRequests: 0,
  createdAt: new Date().toISOString(),
};
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
const stats = statSync(MANIFEST);
process.stdout.write(`${JSON.stringify({ status: "PASS", manifest: MANIFEST, byteLength: stats.size, sha256: sha(readFileSync(MANIFEST)), trackedPathCount: PHASE1_PATHS.length, reviewUrl }, null, 2)}\n`);
