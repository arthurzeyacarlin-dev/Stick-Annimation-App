import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// The verifier treats the proof manifest as untrusted JSON and validates every accessed field.
/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = process.cwd();
const MANIFEST_PATH = "output/spec-0006/phase-1/proof-manifest.json";
const EXACT_PATHS = [
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
const manifestBytes = readFileSync(resolve(ROOT, MANIFEST_PATH));
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, any>;
let checks = 0;
const equal = (actual: unknown, expected: unknown, message?: string) => { checks += 1; assert.deepEqual(actual, expected, message); };
const ok = (value: unknown, message?: string) => { checks += 1; assert.ok(value, message); };

equal(manifest.kind, "spec0006-phase1-proof-manifest");
equal(manifest.manifestVersion, 1);
equal(manifest.specId, "SPEC-0006");
equal(manifest.phase, 1);
equal(manifest.status, "PASS");
equal(manifest.baseSha, "3b784cc6a68ff6f10fa390d96b81376b46e54b44");
equal(manifest.headSha, manifest.baseSha);
equal(manifest.indexEmpty, true);
equal(manifest.pathCeiling, 18);
equal(manifest.trackedPathCount, 11);
equal(manifest.exactDirtyPaths, [...EXACT_PATHS]);
equal(manifest.contractEvidence, { validCases: 56, invalidCases: 124, repeatedMappings: 1000, sourceKinds: 4, sourceWrites: 0, independentOracle: true });
equal(manifest.browserEvidence.ordinaryUnchangedApp, true);
equal(manifest.browserEvidence.reviewOnlyUi, false);
equal(manifest.browserEvidence.apiRequests, 0);
equal(manifest.browserEvidence.externalRequests, 0);
equal(manifest.browserEvidence.consoleErrors, 0);
equal(manifest.browserEvidence.pageErrors, 0);
equal(manifest.protectedRuntimeChanges, []);
equal(manifest.externalProviderRequests, 0);
ok(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(manifest.browserEvidence.reviewUrl), "review URL is clickable loopback");

const validateBindings = (bindings: Array<{ path: string; byteLength: number; sha256: string }>, label: string) => {
  const seen = new Set<string>();
  for (const binding of bindings) {
    checks += 4;
    assert.equal(typeof binding.path, "string", `${label} path`);
    assert.equal(seen.has(binding.path), false, `${label} duplicate ${binding.path}`);
    seen.add(binding.path);
    const bytes = readFileSync(resolve(ROOT, binding.path));
    assert.equal(bytes.byteLength, binding.byteLength, `${label} size ${binding.path}`);
    assert.equal(sha(bytes), binding.sha256, `${label} hash ${binding.path}`);
  }
  return seen;
};
const sources = validateBindings(manifest.sourceBindings, "source");
equal([...sources].sort(), [...EXACT_PATHS].sort());
const receipts = validateBindings(manifest.receipts, "receipt");
ok(receipts.size >= 11, "all command/source-scan receipts are bound");
for (const receipt of manifest.receipts) {
  const parsed = JSON.parse(readFileSync(resolve(ROOT, receipt.path), "utf8"));
  if (receipt.id === "full-lint-baseline") equal(parsed.acceptedBaseline, { problems: 77, errors: 5, warnings: 72 });
  else equal(parsed.exitCode, 0, `${receipt.id} exit code`);
}
const artifacts = validateBindings(manifest.artifacts, "artifact");
ok(artifacts.has("output/spec-0006/phase-1/browser/result.json"), "browser result bound");
ok([...artifacts].filter((path) => path.endsWith(".png")).length >= 4, "four ordinary screenshots bound");

const git = (args: string[]) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
equal(status.status, 0);
const dirty = status.stdout.trim().split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
equal(dirty, [...EXACT_PATHS].sort(), "exact dirty allowlist");
const cached = git(["diff", "--cached", "--name-only"]);
equal(cached.status, 0);
equal(cached.stdout.trim(), "", "index empty");
const diffCheck = git(["diff", "--check"]);
equal(diffCheck.status, 0);
equal(diffCheck.stdout.trim(), "");
const head = git(["rev-parse", "HEAD"]);
equal(head.stdout.trim(), manifest.baseSha);

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  manifestPath: MANIFEST_PATH,
  manifestByteLength: statSync(resolve(ROOT, MANIFEST_PATH)).size,
  manifestSha256: sha(manifestBytes),
  checks,
  exactDirtyPaths: dirty,
  reviewUrl: manifest.browserEvidence.reviewUrl,
}, null, 2)}\n`);
