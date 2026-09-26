import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPEC0014_PHASE4_BASE = "57f3a8560dc61f79db87c13dbff7285684b74793";
const SPEC0014_PHASE4_PATHS = [
  "scripts/fixtures/spec0014-notifications/phase-4/contract.json",
  "scripts/spec0014-notifications/phase4BrowserProof.ts",
  "scripts/spec0014-notifications/phase4BuildProof.ts",
  "scripts/spec0014-notifications/phase4Oracle.ts",
  "scripts/spec0014-notifications/phase4ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase4ReviewSetup.ts",
  "scripts/spec0014-notifications/recordPhase4Proof.ts",
  "scripts/spec0014-notifications/validatePhase4Proof.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "src/components/notifications/notificationCenter.module.css",
  "src/lib/notifications/notificationContracts.ts",
  "src/lib/notifications/notificationStorage.ts",
  "src/lib/notifications/offlineIncidentObserver.ts"
] as const;

type FileRecord = { path: string; bytes: number; sha256: string };
type Manifest = {
  schema: string;
  identity: { base: string; head: string; branch: string; detached: boolean; worktree: string; role: string; implementationPathCount: number };
  git: { dirtyPaths: string[]; indexEmpty: boolean; diffCheck: string; stagedPaths: string[]; committed: boolean; merged: boolean; pushed: boolean; published: boolean; deployed: boolean };
  implementation: FileRecord[];
  evidence: FileRecord[];
  networkAndProviders: { browserExternalRequests: number; deterministicProviderFailureProbes: number; protectedRequests: number; buildDeniedRequests: number; reviewExternalRequests: number; realProviderCalls: number; paidCalls: number; liveAiCalls: number; automaticResubmits: number };
  protectedRuntime: { status: string; paths: number; aggregateSha256: string };
  lifecycle: { ordinaryReviewServerActive: boolean; ordinaryReviewUrl: string; ordinaryReviewPid: number; ordinaryReviewMode: string; ordinaryNotificationStateEmpty: boolean; fixtureRouteAbsent: boolean; providerKeyPresentOnly: boolean };
  ownerCorrection: Record<string, boolean | number | string>;
  proofClaims: Record<string, boolean | string | object>;
  boundaries: Record<string, boolean>;
};
const outputRoot = resolve("output/spec0014/phase4");
const manifestPath = resolve(outputRoot, "manifest.json");
const excludedEvidence = new Set(["manifest.json", "manifest.sha256", "validation.json", "review/server.log"]);
const allowed = [...SPEC0014_PHASE4_PATHS].sort();
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const clone = (value: Manifest): Manifest => structuredClone(value);
const currentDirty = () => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
function evidenceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `evidence symlink: ${path}`);
    return stat.isDirectory() ? evidenceFiles(path) : stat.isFile() ? [path] : [];
  });
}
function validate(candidate: Manifest, files: boolean) {
  assert.equal(candidate.schema, "spec0014-phase4-proof-manifest/v1");
  assert.deepEqual(candidate.identity, { base: SPEC0014_PHASE4_BASE, head: SPEC0014_PHASE4_BASE, branch: "", detached: true, worktree: process.cwd(), role: "Spec Executor", implementationPathCount: 14 });
  assert.deepEqual(candidate.git.dirtyPaths, allowed);
  assert.equal(candidate.git.indexEmpty, true);
  assert.equal(candidate.git.diffCheck, "PASS");
  assert.deepEqual(candidate.git.stagedPaths, []);
  for (const key of ["committed", "merged", "pushed", "published", "deployed"] as const) assert.equal(candidate.git[key], false, key);
  assert.equal(candidate.implementation.length, 14);
  assert.deepEqual(candidate.implementation.map(item => item.path).sort(), allowed);
  assert.equal(new Set(candidate.implementation.map(item => item.path)).size, 14);
  for (const item of [...candidate.implementation, ...candidate.evidence]) { assert.ok(item.bytes > 0); assert.match(item.sha256, /^[a-f0-9]{64}$/); }
  assert.deepEqual(candidate.networkAndProviders, { browserExternalRequests: 0, deterministicProviderFailureProbes: 1, protectedRequests: 0, buildDeniedRequests: 0, reviewExternalRequests: 0, realProviderCalls: 0, paidCalls: 0, liveAiCalls: 0, automaticResubmits: 0 });
  assert.equal(candidate.protectedRuntime.status, "BYTE_IDENTICAL");
  assert.ok(candidate.protectedRuntime.paths >= 15);
  assert.match(candidate.protectedRuntime.aggregateSha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.lifecycle.ordinaryReviewServerActive, true);
  assert.equal(candidate.lifecycle.ordinaryReviewUrl, "http://127.0.0.1:58480");
  assert.equal(candidate.lifecycle.ordinaryReviewMode, "NORMAL_NEXT_DEV_WEBPACK");
  assert.equal(candidate.lifecycle.ordinaryNotificationStateEmpty, true);
  assert.equal(candidate.lifecycle.fixtureRouteAbsent, true);
  assert.equal(candidate.lifecycle.providerKeyPresentOnly, true);
  assert.deepEqual(candidate.ownerCorrection, { supersedesPlanDuringExecution: true, pageWideWarningRemoved: true, existingBellCount: 2, offlineVisibleInHome: true, offlineVisibleInAssistant: true, offlineBellColor: "red", sharedIncidentAndReadState: true, restorationNotificationAdded: true, restorationRequiresExplicitAcknowledgement: true, assistantOtherEventsRemainReplyOnly: true, canonicalDocsPendingCpa: true });
  for (const key of ["browserOfflineOnly", "oneRowPerIncident", "crossTabAndReloadDedupe", "onlinePublishesSingleRestoration", "restorationPersistsUntilAcknowledged", "offlinePreservesUnreadRestoration", "silentInitialOnlineReconciliation", "readDoesNotClearOfflineSignal", "providerFailureDoesNotImplyOffline", "dormantEventsEmitZero", "exportNotificationsEmitZero"] as const) assert.equal(candidate.proofClaims[key], true, key);
  assert.equal(candidate.proofClaims.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE");
  for (const key of ["assistantTerraAcceptedFlowsPreserved", "exportRuntimeByteIdentical"] as const) assert.equal(candidate.boundaries[key], true, key);
  for (const key of ["exportNotificationProducerAdded", "backgroundExportAdded", "aiAnimationProducerAdded", "lowUsageProducerAdded", "updaterProducerAdded", "providerOrModelChanged", "searchChanged", "citationsChanged", "dictationChanged", "toolsChanged", "limitsChanged", "canonicalDocumentationChanged"] as const) assert.equal(candidate.boundaries[key], false, key);
  if (!files) return;
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), SPEC0014_PHASE4_BASE);
  assert.equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), "");
  assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "");
  assert.deepEqual(currentDirty(), allowed);
  execFileSync("git", ["diff", "--check"], { stdio: "pipe" });
  for (const item of candidate.implementation) { const bytes = readFileSync(item.path); assert.equal(bytes.byteLength, item.bytes); assert.equal(sha256(bytes), item.sha256); }
  const actualEvidence = evidenceFiles(outputRoot).map(path => path.slice(outputRoot.length + 1)).filter(path => !excludedEvidence.has(path)).sort();
  assert.deepEqual(candidate.evidence.map(item => item.path).sort(), actualEvidence);
  for (const item of candidate.evidence) { const bytes = readFileSync(resolve(outputRoot, item.path)); assert.equal(bytes.byteLength, item.bytes); assert.equal(sha256(bytes), item.sha256); }
  const sidecar = readFileSync(resolve(outputRoot, "manifest.sha256"), "utf8").trim().split(/\s+/)[0];
  assert.equal(sidecar, sha256(readFileSync(manifestPath)));
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
validate(manifest, true);
const mutations: Array<[string, (value: Manifest) => void]> = [
  ["wrong base", value => { value.identity.base = "0".repeat(40); }],
  ["scope expansion", value => { value.git.dirtyPaths.push("docs/CURRENT_STATE.md"); }],
  ["bad implementation hash", value => { value.implementation[0].sha256 = "invalid"; }],
  ["publication", value => { value.git.pushed = true; }],
  ["false offline source", value => { value.proofClaims.browserOfflineOnly = false; }],
  ["duplicate incident", value => { value.proofClaims.oneRowPerIncident = false; }],
  ["missing restoration", value => { value.proofClaims.onlinePublishesSingleRestoration = false; }],
  ["restoration auto-dismiss", value => { value.proofClaims.restorationPersistsUntilAcknowledged = false; }],
  ["restoration auto-retirement", value => { value.proofClaims.offlinePreservesUnreadRestoration = false; }],
  ["provider inference", value => { value.proofClaims.providerFailureDoesNotImplyOffline = false; }],
  ["dormant producer", value => { value.proofClaims.dormantEventsEmitZero = false; }],
  ["Export notification", value => { value.boundaries.exportNotificationProducerAdded = true; }],
  ["real provider call", value => { value.networkAndProviders.realProviderCalls = 1; }],
  ["canonical docs edit", value => { value.boundaries.canonicalDocumentationChanged = true; }]
];
const rejected: string[] = [];
for (const [name, mutate] of mutations) { const candidate = clone(manifest); mutate(candidate); assert.throws(() => validate(candidate, false), `mutation must be rejected: ${name}`); rejected.push(name); }
const result = { schema: "spec0014-phase4-validation/v1", status: "PASS", manifestSha256: sha256(readFileSync(manifestPath)), implementationPaths: 14, evidenceFiles: manifest.evidence.length, mutationsRejected: rejected.length, mutations: rejected, dirtyAllowlistExact: true, indexEmpty: true };
writeFileSync(resolve(outputRoot, "validation.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`SPEC-0014 Phase 4 proof validation PASS (${rejected.length} mutations rejected)\n`);
