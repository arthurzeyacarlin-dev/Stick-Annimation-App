import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "output/spec-0011/phase-2/proof-manifest.json");
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
  assert.equal(candidate.schemaVersion, "spec0011-phase2-proof/v1");
  assert.equal(candidate.status, "PASS");
  assert.equal(candidate.authorizedBaseSha, "e6f6b1d7887bbbfaed7a9b00b8b472c5b28fe834");
  assert.equal(candidate.headSha, candidate.authorizedBaseSha);
  assert.equal(candidate.localMainSha, candidate.authorizedBaseSha);
  assert.equal(candidate.originMainSha, candidate.authorizedBaseSha);
  assert.equal(candidate.indexEmpty, true);
  assert.equal(candidate.detachedHead, true);
  assert.equal(candidate.humanAcceptance, "pending Arthur");
  assert.equal(candidate.boundaries.controlPlaneUpdated, false);
  assert.equal(candidate.boundaries.gitPublication, false);
  assert.equal(candidate.boundaries.staged, false);
  assert.equal(candidate.boundaries.committed, false);
  assert.equal(candidate.boundaries.pushed, false);
  assert.equal(candidate.boundaries.deployed, false);
  assert.equal(candidate.boundaries.phase2Implemented, true);
  assert.equal(candidate.boundaries.phase3Implemented, false);
  assert.equal(candidate.boundaries.aiClientResponseHandlingChanged, true);
  assert.equal(candidate.boundaries.aiProviderSourceChanged, false);
  assert.equal(candidate.boundaries.aiPromptModelJobToolBehaviorChanged, false);
  assert.equal(candidate.boundaries.providerCalled, true);
  assert.deepEqual(candidate.actualDirtyPaths, candidate.dirtyPathAllowlist);
  assert.equal(candidate.sourceArtifacts.length, candidate.dirtyPathAllowlist.length);
  for (const artifact of [...candidate.sourceArtifacts, ...candidate.evidenceArtifacts, ...candidate.commandReceipts]) {
    const bytes = readFileSync(resolve(root, artifact.path));
    assert.equal(bytes.byteLength, artifact.byteLength, `${artifact.path} byte length`);
    assert.equal(sha256(bytes), artifact.sha256, `${artifact.path} digest`);
  }
  assert.ok(candidate.commandReceipts.every((receipt: { path: string }) => JSON.parse(readFileSync(resolve(root, receipt.path), "utf8")).passed === true));
  assert.ok(candidate.browserEvidence.assertions >= 100);
  assert.equal(candidate.browserEvidence.requests.blocked, 0);
  assert.equal(candidate.browserEvidence.requests.providerOrPaid, 0);
  assert.deepEqual(candidate.browserEvidence.errors.page, []);
  assert.deepEqual(candidate.browserEvidence.errors.unexpectedConsole, []);
  assert.equal(candidate.browserEvidence.storage.unchanged, true);
  assert.deepEqual(candidate.browserEvidence.storage.before, candidate.browserEvidence.storage.after);
  assert.equal(candidate.browserEvidence.audio.contexts, candidate.browserEvidence.audio.closes);
  assert.equal(candidate.browserEvidence.sourceInvalidation.after.contexts, candidate.browserEvidence.sourceInvalidation.after.closes);
  assert.ok(candidate.browserEvidence.performance.p95.viewerOpen <= 1_000);
  assert.ok(candidate.browserEvidence.performance.p95.playAcknowledgement <= 100);
  assert.ok(candidate.browserEvidence.performance.p95.seekCanvasUpdate <= 250);
  assert.ok(candidate.browserEvidence.performance.longTasks.maximumMilliseconds <= 250);
  assert.equal(candidate.browserEvidence.aiAnimator.productionRoute.status, 404);
  assert.ok(candidate.browserEvidence.aiAnimator.productionRoute.contentType.toLowerCase().includes("application/json"));
  assert.equal(candidate.browserEvidence.aiAnimator.productionRoute.providerInvoked, false);
  assert.equal(candidate.browserEvidence.aiAnimator.exactHi.message, "hi");
  assert.equal(candidate.browserEvidence.aiAnimator.exactHi.naturalReplyVisible, true);
  assert.equal(candidate.browserEvidence.aiAnimator.exactHi.providerInvoked, false);
  assert.equal(candidate.manualLiveTerraEvidence.status, "PASS");
  assert.equal(candidate.manualLiveTerraEvidence.message, "hi");
  assert.equal(candidate.manualLiveTerraEvidence.submit.status, 202);
  assert.equal(candidate.manualLiveTerraEvidence.submit.contentType, "application/json");
  assert.equal(candidate.manualLiveTerraEvidence.poll.terminalStatus, 200);
  assert.equal(candidate.manualLiveTerraEvidence.poll.contentType, "application/json");
  assert.equal(candidate.manualLiveTerraEvidence.provider.calls, 1);
  assert.equal(candidate.manualLiveTerraEvidence.provider.model, "gpt-5.6-terra");
  assert.equal(candidate.manualLiveTerraEvidence.rawParserTextVisible, false);
  assert.equal(candidate.manualLiveTerraEvidence.animationChanged, false);
  assert.equal(candidate.manualLiveTerraEvidence.environmentContentsRead, false);
  assert.equal(candidate.buildEvidence.status, "PASS");
  assert.equal(candidate.buildEvidence.fullBuild.status, "INHERITED_BASELINE_FAILURE");
  assert.equal(candidate.buildEvidence.fullBuild.exactUntouchedPath, "app/dev/ai-costs/lifetime/page.tsx");
  assert.equal(candidate.buildEvidence.focusedBuild.status, "PASS");
  assert.deepEqual(candidate.buildEvidence.focusedBuild.routes, ["app/page.tsx", "app/api/ai-animator/route.ts"]);
  assert.equal(candidate.geometryEvidence.productGeometryChanged, false);
  assert.equal(candidate.geometryEvidence.toleranceWeakened, false);
  assert.ok(Math.abs(candidate.geometryEvidence.exportFrame3NormalizedX - candidate.geometryEvidence.correctedUniformExpectedX) <= candidate.geometryEvidence.acceptedTolerance);
  assert.ok(candidate.audioEvidence.maximumDecodeConcurrency <= 2);
  assert.equal(candidate.acceptedDataFacts.viewerStorageWrites, 0);
  assert.equal(candidate.acceptedDataFacts.recoveryWrites, 0);
  assert.equal(candidate.acceptedDataFacts.automatedExternalRequests, 0);
  assert.equal(candidate.acceptedDataFacts.automatedProviderRequests, 0);
  assert.equal(candidate.acceptedDataFacts.liveProviderRequests, 1);
  assert.equal(candidate.acceptedDataFacts.paidCalls, 1);
  assert.equal(candidate.acceptedDataFacts.liveEstimatedCostUsd, 0.001238);
  assert.equal(candidate.acceptedDataFacts.creditChanges, 0);
  assert.equal(candidate.reviewEnvironment.envTracked, false);
  assert.equal(candidate.reviewEnvironment.envIgnored, true);
  assert.equal(candidate.reviewEnvironment.envContentsReadByProof, false);
  assert.equal(candidate.reviewEnvironment.envContentsRecorded, false);
  assert.equal(candidate.reviewEnvironment.envByteIdentityProven, false);
  return true;
};

check(validate(manifest), "manifest validates against its contract");
equal(git("rev-parse", "HEAD"), manifest.authorizedBaseSha, "live HEAD remains the authorized base");
equal(git("rev-parse", "main"), manifest.authorizedBaseSha, "live main remains the authorized base");
equal(git("rev-parse", "origin/main"), manifest.authorizedBaseSha, "live origin/main remains the authorized base");
equal(git("diff", "--cached", "--name-only"), "", "live index remains empty");
equal(actualDirtyPaths(), manifest.dirtyPathAllowlist, "live dirty paths equal the allowlist");

const mutations: Array<[string, (candidate: typeof manifest) => void]> = [
  ["base", candidate => { candidate.authorizedBaseSha = "0".repeat(40); }],
  ["path-set", candidate => { candidate.actualDirtyPaths = candidate.actualDirtyPaths.slice(1); }],
  ["source-hash", candidate => { candidate.sourceArtifacts[0].sha256 = "0".repeat(64); }],
  ["artifact-hash", candidate => { candidate.evidenceArtifacts[0].sha256 = "0".repeat(64); }],
  ["project-recovery-digest", candidate => { candidate.browserEvidence.storage.after = { altered: true }; }],
  ["request-ledger", candidate => { candidate.browserEvidence.requests.blocked = 1; }],
  ["performance", candidate => { candidate.browserEvidence.performance.p95.playAcknowledgement = 101; }],
  ["audio-cleanup", candidate => { candidate.browserEvidence.audio.closes -= 1; }],
  ["geometry-tolerance", candidate => { candidate.geometryEvidence.toleranceWeakened = true; }],
  ["ai-route-content-type", candidate => { candidate.browserEvidence.aiAnimator.productionRoute.contentType = "text/html"; }],
  ["live-hi-provider-count", candidate => { candidate.manualLiveTerraEvidence.provider.calls = 2; }],
  ["ai-client-boundary", candidate => { candidate.boundaries.aiProviderSourceChanged = true; }],
  ["acceptance", candidate => { candidate.humanAcceptance = "accepted"; }],
  ["control-plane", candidate => { candidate.boundaries.controlPlaneUpdated = true; }],
  ["publication", candidate => { candidate.boundaries.gitPublication = true; }],
  ["phase3", candidate => { candidate.boundaries.phase3Implemented = true; }],
];
for (const [label, mutate] of mutations) {
  const candidate = structuredClone(manifest);
  mutate(candidate);
  let rejected = false;
  try { validate(candidate); } catch { rejected = true; }
  check(rejected, `validator rejects ${label} mutation`);
}

const validation = {
  schemaVersion: "spec0011-phase2-validation/v1",
  status: "VALID",
  validatedManifestSha256: sha256(readFileSync(manifestPath)),
  assertions,
  rejectedMutationClasses: mutations.map(([label]) => label),
  liveHead: git("rev-parse", "HEAD"),
  liveMain: git("rev-parse", "main"),
  liveOriginMain: git("rev-parse", "origin/main"),
  liveIndexEmpty: git("diff", "--cached", "--name-only") === "",
  liveDirtyPaths: actualDirtyPaths(),
  validatedAt: new Date().toISOString(),
};
const output = resolve(root, "output/spec-0011/phase-2/validation.json");
writeFileSync(output, `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify(validation));
