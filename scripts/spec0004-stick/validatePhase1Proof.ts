import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync, statSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

const ROOT = process.cwd();
const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const manifestArgument = process.argv.indexOf("--manifest");
const manifestPath = resolve(ROOT, manifestArgument >= 0 && process.argv[manifestArgument + 1]
  ? process.argv[manifestArgument + 1]
  : "output/spec-0004/phase-1/proof-manifest.json");
const validationPath = resolve(dirname(manifestPath), "proof-manifest-validation.json");
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  manifestVersion: number;
  phase: string;
  activation: {head: string; localMain: string; indexEmpty: boolean};
  scope: {
    exactDirtyPathAllowlist: string[];
    outsideAllowlistPaths: string[];
    docsChanged: boolean;
    stagedPaths: string[];
  };
  counts: {
    unitAssertions: number;
    invalidRejectionCases: number;
    validFixturePlans: number;
    technicalTestReceipts: number;
    browserScreenshots: number;
    browserFlows: number;
    proofArtifacts: number;
  };
  testResults: Array<{
    status: string;
    receiptPath: string;
    receiptSha256: string;
    receiptBytes: number;
  }>;
  browser: {
    receiptPath: string;
    receiptSha256: string;
    receiptBytes: number;
    reviewUrl: string;
    serverPid: number;
    fixtureCount: number;
    externalRequests: number;
    apiRequests: number;
    providerRequests: number;
  };
  artifacts: Array<{path: string; sha256: string; bytes: number}>;
};

let checks = 0;
const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const ok = (value: unknown, message: string) => {
  assert.ok(value, message);
  checks += 1;
};
const git = (args: string[]) => {
  const result = spawnSync("git", args, {cwd: ROOT, encoding: "utf8"});
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};

equal(manifest.manifestVersion, 1, "manifest version is exact");
equal(manifest.phase, "SPEC-0004 Phase 1 — Safe One-Time Animation Builder", "manifest phase is exact");
equal(manifest.activation.head, "9fae072359f3c0d10f1ed2bcee8da9ebc11d54ec", "activation HEAD is exact");
equal(manifest.activation.localMain, manifest.activation.head, "local main remains at activation HEAD");
equal(manifest.activation.indexEmpty, true, "manifest records empty index");
equal(manifest.scope.outsideAllowlistPaths, [], "manifest records no outside-allowlist path");
equal(manifest.scope.docsChanged, false, "manifest records no docs mutation");
equal(manifest.scope.stagedPaths, [], "manifest records no staged path");
equal(manifest.counts.validFixturePlans, 4, "manifest proves all four fixtures");
ok(manifest.counts.invalidRejectionCases >= 24, "manifest contains the complete rejection matrix");
ok(manifest.counts.unitAssertions >= 700, "manifest contains the full unit proof");
ok(manifest.counts.browserScreenshots >= 11, "manifest contains required visible screenshots");
ok(manifest.counts.browserFlows >= 12, "manifest contains required browser flows");
equal(manifest.counts.technicalTestReceipts, manifest.testResults.length, "technical receipt count is self-consistent");
equal(manifest.counts.proofArtifacts, manifest.artifacts.length, "artifact count is self-consistent");

for (const result of manifest.testResults) {
  ok(result.status === "passed" || result.status === "accepted-identical-baseline", "technical test status is accepted");
  const path = resolve(ROOT, result.receiptPath);
  const bytes = readFileSync(path);
  equal(sha256(bytes), result.receiptSha256, `${result.receiptPath} SHA matches`);
  equal(statSync(path).size, result.receiptBytes, `${result.receiptPath} size matches`);
}
for (const artifact of manifest.artifacts) {
  const path = resolve(ROOT, artifact.path);
  const bytes = readFileSync(path);
  equal(sha256(bytes), artifact.sha256, `${artifact.path} SHA matches`);
  equal(statSync(path).size, artifact.bytes, `${artifact.path} size matches`);
}

const browserBytes = readFileSync(resolve(ROOT, manifest.browser.receiptPath));
equal(sha256(browserBytes), manifest.browser.receiptSha256, "browser receipt SHA matches");
equal(browserBytes.byteLength, manifest.browser.receiptBytes, "browser receipt size matches");
equal(manifest.browser.fixtureCount, 4, "browser receipt covers four fixtures");
equal(manifest.browser.externalRequests, 0, "browser receipt proves zero external requests");
equal(manifest.browser.apiRequests, 0, "browser receipt proves zero API requests");
equal(manifest.browser.providerRequests, 0, "browser receipt proves zero provider requests");
const reviewUrl = new URL(manifest.browser.reviewUrl);
equal(reviewUrl.hostname, "127.0.0.1", "review copy is loopback-only");
ok(reviewUrl.port !== "" && reviewUrl.port !== "3000", "review copy is on an explicit non-3000 port");
process.kill(manifest.browser.serverPid, 0);
checks += 1;
const response = await fetch(manifest.browser.reviewUrl);
equal(response.ok, true, "review copy responds successfully during independent validation");

equal(git(["rev-parse", "HEAD"]), manifest.activation.head, "live HEAD matches manifest");
equal(git(["rev-parse", "main"]), manifest.activation.localMain, "live local main matches manifest");
equal(git(["diff", "--cached", "--name-only"]), "", "live index is empty");
const changed = git(["diff", "--name-only"]).split("\n").filter(Boolean);
const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
equal([...new Set([...changed, ...untracked])].sort(), manifest.scope.exactDirtyPathAllowlist, "live exact dirty paths match manifest");
equal(git(["diff", "--check"]), "", "live diff passes whitespace validation");

const validation = {
  receiptVersion: 1,
  phase: manifest.phase,
  validatedAt: new Date().toISOString(),
  manifestPath: manifestPath.slice(ROOT.length + 1),
  manifestSha256: sha256(manifestBytes),
  manifestBytes: manifestBytes.byteLength,
  artifactCount: manifest.artifacts.length,
  technicalReceiptCount: manifest.testResults.length,
  independentChecks: checks,
  result: "passed",
};
const validationBytes = `${JSON.stringify(validation, null, 2)}\n`;
writeFileSync(validationPath, validationBytes);
console.log(`SPEC-0004 Phase 1 proof manifest validation passed (${checks} checks).`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Manifest SHA-256: ${validation.manifestSha256}`);
console.log(`Manifest bytes: ${validation.manifestBytes}`);
console.log(`Artifacts: ${validation.artifactCount}; technical receipts: ${validation.technicalReceiptCount}.`);
console.log(`Validation receipt: ${validationPath}`);
