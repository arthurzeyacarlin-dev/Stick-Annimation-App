import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const path = resolve(root, "output/spec-0011/phase-3/proof-manifest.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const actualDirtyPaths = () => [...new Set([
  ...git("ls-files", "-m").split("\n").filter(Boolean),
  ...git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean),
])].sort();
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };

const validate = (candidate: typeof manifest) => {
  assert.equal(candidate.schemaVersion, "spec0011-phase3-proof/v1");
  assert.equal(candidate.status, "PASS");
  assert.equal(candidate.authorizedBaseSha, "b57ff995df9bb351dacb9a6a79b8cbd23203e988");
  assert.equal(candidate.headSha, candidate.authorizedBaseSha);
  assert.equal(candidate.localMainSha, candidate.authorizedBaseSha);
  assert.equal(candidate.originMainSha, candidate.authorizedBaseSha);
  assert.equal(candidate.detachedHead, true);
  assert.equal(candidate.indexEmpty, true);
  assert.deepEqual(candidate.actualDirtyPaths, candidate.dirtyPathAllowlist);
  assert.equal(candidate.sourceArtifacts.length, candidate.dirtyPathAllowlist.length);
  for (const artifact of [...candidate.sourceArtifacts, ...candidate.evidenceArtifacts, ...candidate.commandReceipts]) {
    const bytes = readFileSync(resolve(root, artifact.path));
    assert.equal(bytes.byteLength, artifact.byteLength, `${artifact.path} size`);
    assert.equal(sha256(bytes), artifact.sha256, `${artifact.path} hash`);
  }
  assert.ok(candidate.commandReceipts.every((receipt: { path: string }) => JSON.parse(readFileSync(resolve(root, receipt.path), "utf8")).passed === true));
  assert.equal(candidate.browserEvidence.assertions >= 39, true);
  assert.equal(candidate.browserEvidence.externalRequests, 0);
  assert.equal(candidate.browserEvidence.providerRequests, 0);
  assert.equal(candidate.browserEvidence.aiRequests, 0);
  assert.equal(candidate.browserEvidence.paidRequests, 0);
  assert.deepEqual(candidate.browserEvidence.pageErrors, []);
  assert.deepEqual(candidate.browserEvidence.consoleErrors, []);
  assert.ok(candidate.browserEvidence.performanceReceipts.some((receipt: { p95?: { searchMs: number; sortMs: number; menuMs: number } }) =>
    receipt.p95 && receipt.p95.searchMs <= 100 && receipt.p95.sortMs <= 100 && receipt.p95.menuMs <= 100));
  const storage = Object.fromEntries(candidate.browserEvidence.storageReceipts.map((receipt: { label: string; snapshot: unknown }) => [receipt.label, receipt.snapshot]));
  assert.equal(storage["recovery-conflict-injected"].indexed["diamond-animation-project-recovery-v1"].heads.count, 1);
  assert.equal(storage["recovery-conflict-cleared"].indexed["diamond-animation-project-recovery-v1"].heads.count, 0);
  assert.equal(storage["after-verified-delete"].indexed["diamond-animation-unified-v2"].assets.digest, storage["before-recovery-conflict"].indexed["diamond-animation-unified-v2"].assets.digest);
  assert.equal(candidate.buildEvidence.status, "PASS");
  assert.equal(candidate.buildEvidence.fullBuild.status, "INHERITED_BASELINE_FAILURE");
  assert.equal(candidate.buildEvidence.focusedBuild.status, "PASS");
  assert.equal(candidate.protectedBaseline.unchanged, true);
  assert.deepEqual(candidate.protectedBaseline.changedPaths, []);
  assert.equal(candidate.acceptedDataFacts.automatedExternalRequests, 0);
  assert.equal(candidate.acceptedDataFacts.automatedProviderRequests, 0);
  assert.equal(candidate.acceptedDataFacts.paidCalls, 0);
  assert.equal(candidate.acceptedDataFacts.creditChanges, 0);
  assert.equal(candidate.humanAcceptance, "pending Arthur");
  for (const key of ["controlPlaneUpdated", "gitPublication", "staged", "committed", "pushed", "deployed", "playerChanged", "exportChanged", "editorTimelineChanged", "recoveryPolicyChanged", "packageDependencyChanged", "aiTerraChanged", "providerCalled"]) assert.equal(candidate.boundaries[key], false);
  assert.equal(candidate.boundaries.phase3Implemented, true);
  return true;
};

check(validate(manifest), "manifest validates");
equal(git("rev-parse", "HEAD"), manifest.authorizedBaseSha, "HEAD remains exact base");
equal(git("rev-parse", "main"), manifest.authorizedBaseSha, "main remains exact base");
equal(git("rev-parse", "origin/main"), manifest.authorizedBaseSha, "origin/main remains exact base");
equal(git("diff", "--cached", "--name-only"), "", "index remains empty");
equal(actualDirtyPaths(), manifest.dirtyPathAllowlist, "dirty allowlist remains exact");

const mutations: Array<[string, (candidate: typeof manifest) => void]> = [
  ["base", value => { value.authorizedBaseSha = "0".repeat(40); }],
  ["path-set", value => { value.actualDirtyPaths = value.actualDirtyPaths.slice(1); }],
  ["source-hash", value => { value.sourceArtifacts[0].sha256 = "0".repeat(64); }],
  ["artifact-hash", value => { value.evidenceArtifacts[0].sha256 = "0".repeat(64); }],
  ["project-recovery-digest", value => { value.browserEvidence.storageReceipts[2].snapshot.indexed["diamond-animation-project-recovery-v1"].heads.count = 0; }],
  ["request-ledger", value => { value.browserEvidence.externalRequests = 1; }],
  ["performance", value => { value.browserEvidence.performanceReceipts = []; }],
  ["protected-baseline", value => { value.protectedBaseline.unchanged = false; }],
  ["acceptance", value => { value.humanAcceptance = "accepted"; }],
  ["control-plane", value => { value.boundaries.controlPlaneUpdated = true; }],
  ["publication", value => { value.boundaries.gitPublication = true; }],
  ["provider", value => { value.boundaries.providerCalled = true; }],
];
for (const [label, mutate] of mutations) {
  const candidate = structuredClone(manifest);
  mutate(candidate);
  let rejected = false;
  try { validate(candidate); } catch { rejected = true; }
  check(rejected, `reject ${label} mutation`);
}

const validation = {
  schemaVersion: "spec0011-phase3-validation/v1", status: "VALID",
  validatedManifestSha256: sha256(readFileSync(path)), assertions,
  rejectedMutationClasses: mutations.map(([label]) => label),
  liveHead: git("rev-parse", "HEAD"), liveMain: git("rev-parse", "main"), liveOriginMain: git("rev-parse", "origin/main"),
  liveIndexEmpty: git("diff", "--cached", "--name-only") === "", liveDirtyPaths: actualDirtyPaths(), validatedAt: new Date().toISOString(),
};
writeFileSync(resolve(root, "output/spec-0011/phase-3/validation.json"), `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(validation));
