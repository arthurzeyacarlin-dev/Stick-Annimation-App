import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "output/spec-0011/phase-1/proof-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
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
  assert.equal(candidate.schemaVersion, "spec0011-phase1-proof/v1");
  assert.equal(candidate.status, "PASS");
  assert.equal(candidate.authorizedBaseSha, "0169c09cc8dbede616fdf099b31925669ec35f6e");
  assert.equal(candidate.headSha, candidate.authorizedBaseSha);
  assert.equal(candidate.indexEmpty, true);
  assert.equal(candidate.detachedHead, true);
  assert.equal(candidate.humanAcceptance, "pending Arthur");
  assert.equal(candidate.boundaries.controlPlaneUpdated, false);
  assert.equal(candidate.boundaries.gitPublication, false);
  assert.equal(candidate.boundaries.phase2Implemented, false);
  assert.equal(candidate.boundaries.phase3Implemented, false);
  assert.equal(candidate.browserEvidence.externalRequests, 0);
  assert.equal(candidate.browserEvidence.providerRequests, 0);
  assert.equal(candidate.browserEvidence.aiRequests, 0);
  assert.equal(candidate.browserEvidence.paidRequests, 0);
  assert.deepEqual(candidate.browserEvidence.pageErrors, []);
  assert.deepEqual(candidate.browserEvidence.consoleErrors, []);
  assert.deepEqual(candidate.actualDirtyPaths, candidate.dirtyPathAllowlist);
  assert.equal(candidate.sourceArtifacts.length, candidate.dirtyPathAllowlist.length);
  for (const artifact of [...candidate.sourceArtifacts, ...candidate.evidenceArtifacts, ...candidate.commandReceipts]) {
    const bytes = readFileSync(resolve(root, artifact.path));
    assert.equal(bytes.byteLength, artifact.byteLength, `${artifact.path} byte length`);
    assert.equal(sha256(bytes), artifact.sha256, `${artifact.path} digest`);
  }
  assert.ok(candidate.browserEvidence.storageReceipts.every((receipt: { writes: unknown[]; before: unknown; after: unknown }) => receipt.writes.length === 0 && JSON.stringify(receipt.before) === JSON.stringify(receipt.after)));
  assert.ok(candidate.browserEvidence.performanceReceipts.length >= 2);
  assert.ok(candidate.reviewEnvironment.envByteIdentical);
  assert.equal(candidate.reviewEnvironment.envTracked, false);
  return true;
};

check(validate(manifest), "manifest validates against its contract");
equal(git("rev-parse", "HEAD"), manifest.authorizedBaseSha, "live HEAD remains the authorized base");
equal(git("diff", "--cached", "--name-only"), "", "live index remains empty");
equal(actualDirtyPaths(), manifest.dirtyPathAllowlist, "live dirty paths equal the allowlist");

const mutations: Array<[string, (candidate: typeof manifest) => void]> = [
  ["base", candidate => { candidate.authorizedBaseSha = "0".repeat(40); }],
  ["path-set", candidate => { candidate.actualDirtyPaths = candidate.actualDirtyPaths.slice(1); }],
  ["source-hash", candidate => { candidate.sourceArtifacts[0].sha256 = "0".repeat(64); }],
  ["artifact-hash", candidate => { candidate.evidenceArtifacts[0].sha256 = "0".repeat(64); }],
  ["project-recovery-digest", candidate => { candidate.browserEvidence.storageReceipts[0].after = { altered: true }; }],
  ["request-ledger", candidate => { candidate.browserEvidence.externalRequests = 1; }],
  ["performance", candidate => { candidate.browserEvidence.performanceReceipts = []; }],
  ["acceptance", candidate => { candidate.humanAcceptance = "accepted"; }],
  ["control-plane", candidate => { candidate.boundaries.controlPlaneUpdated = true; }],
  ["publication", candidate => { candidate.boundaries.gitPublication = true; }],
];
for (const [label, mutate] of mutations) {
  const candidate = structuredClone(manifest);
  mutate(candidate);
  let rejected = false;
  try { validate(candidate); } catch { rejected = true; }
  check(rejected, `validator rejects ${label} mutation`);
}

const validation = {
  schemaVersion: "spec0011-phase1-validation/v1",
  status: "VALID",
  validatedManifestSha256: sha256(readFileSync(manifestPath)),
  assertions,
  rejectedMutationClasses: mutations.map(([label]) => label),
  liveHead: git("rev-parse", "HEAD"),
  liveIndexEmpty: git("diff", "--cached", "--name-only") === "",
  liveDirtyPaths: actualDirtyPaths(),
  validatedAt: new Date().toISOString(),
};
const output = resolve(root, "output/spec-0011/phase-1/validation.json");
writeFileSync(output, `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(validation));
