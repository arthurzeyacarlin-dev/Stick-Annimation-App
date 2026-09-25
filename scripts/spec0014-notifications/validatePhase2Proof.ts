import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPEC0014_PHASE2_BASE = "acd4031cade0e4e960223190a8c1645d007d61af";
const SPEC0014_PHASE2_BRANCH = "codex/spec0014-phase2-ai-completion-review";
const SPEC0014_PHASE2_PATHS = [
  "app/page.tsx", "src/components/assistant/AssistantConversation.tsx", "src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/useAssistantSessions.ts",
  "src/components/notifications/NotificationCenterProvider.tsx", "src/components/notifications/NotificationTrigger.tsx", "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx", "src/components/workspace/ai/WorkspaceAiPanelShell.tsx", "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/notifications/notificationNavigation.ts", "src/lib/notifications/assistantCompletionObserver.ts", "src/lib/notifications/terraCompletionObserver.ts",
  "scripts/fixtures/spec0014-notifications/phase-2/contract.json", "scripts/spec0014-notifications/phase2BrowserProof.ts", "scripts/spec0014-notifications/phase2Oracle.ts",
  "scripts/spec0014-notifications/phase2ProtectedRegressions.ts", "scripts/spec0014-notifications/phase2BuildProof.ts", "scripts/spec0014-notifications/phase2ReviewSetup.ts",
  "scripts/spec0014-notifications/recordPhase2Proof.ts", "scripts/spec0014-notifications/validatePhase2Proof.ts",
] as const;

type FileRecord = { path: string; bytes: number; sha256: string };
type Manifest = {
  schema: string;
  identity: { base: string; head: string; branch: string; worktree: string; role: string; implementationPathCount: number };
  git: { dirtyPaths: string[]; indexEmpty: boolean; diffCheck: string; stagedPaths: string[]; committed: boolean; merged: boolean; pushed: boolean; published: boolean; deployed: boolean };
  implementation: FileRecord[];
  evidence: FileRecord[];
  receipts: { oracleAssertions: number; browserAssertions: number; protectedStaticReceipts: number; protectedBrowserReceipts: number; assistantExplicitPosts: number; terraExplicitPosts: number };
  networkAndProviders: { browserExternalRequests: number; protectedRequests: number; buildDeniedRequests: number; reviewExternalRequests: number; providerRequests: number; paidCalls: number; liveAiCalls: number; automaticResubmits: number };
  protectedRuntime: { status: string; protectedTreeSha256: string };
  lifecycle: { ordinaryReviewServerActive: boolean; ordinaryReviewUrl: string; ordinaryReviewPid: number; ordinaryReviewMode: string; ordinaryNotificationStateEmpty: boolean; fixtureRouteAbsent: boolean; providerKeyPresentOnly: boolean };
  proofClaims: { fullProductionBuild: string; defaultTurbopackBuild: Record<string, unknown>; fullWebpackProductionBuild: Record<string, unknown>; exactSourceTargeting: boolean; sourceCommitBeforeNotification: boolean; oneSharedEventAcrossViews: boolean; noMountReplay: boolean; twoTabAndReloadConvergence: boolean };
  boundaries: Record<string, boolean>;
};

const outputRoot = resolve("output/spec0014/phase2");
const manifestPath = resolve(outputRoot, "manifest.json");
const excludedEvidence = new Set(["manifest.json", "manifest.sha256", "validation.json", "review/server.log"]);
const allowed = [...SPEC0014_PHASE2_PATHS].sort();
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
  assert.equal(candidate.schema, "spec0014-phase2-proof-manifest/v1");
  assert.deepEqual(candidate.identity, { base: SPEC0014_PHASE2_BASE, head: SPEC0014_PHASE2_BASE, branch: SPEC0014_PHASE2_BRANCH, worktree: process.cwd(), role: "Spec Executor", implementationPathCount: 21 });
  assert.deepEqual(candidate.git.dirtyPaths, allowed);
  assert.equal(candidate.git.indexEmpty, true);
  assert.equal(candidate.git.diffCheck, "PASS");
  assert.deepEqual(candidate.git.stagedPaths, []);
  for (const key of ["committed", "merged", "pushed", "published", "deployed"] as const) assert.equal(candidate.git[key], false, key);
  assert.equal(candidate.implementation.length, 21);
  assert.deepEqual(candidate.implementation.map(item => item.path).sort(), allowed);
  assert.equal(new Set(candidate.implementation.map(item => item.path)).size, 21);
  for (const item of candidate.implementation) { assert.ok(item.bytes > 0); assert.match(item.sha256, /^[a-f0-9]{64}$/); }
  for (const item of candidate.evidence) assert.match(item.sha256, /^[a-f0-9]{64}$/);
  assert.ok(candidate.receipts.oracleAssertions >= 35);
  assert.equal(candidate.receipts.browserAssertions, 42);
  assert.ok(candidate.receipts.protectedStaticReceipts >= 15);
  assert.equal(candidate.receipts.protectedBrowserReceipts, 4);
  assert.equal(candidate.receipts.assistantExplicitPosts, 9);
  assert.equal(candidate.receipts.terraExplicitPosts, 7);
  assert.deepEqual(candidate.networkAndProviders, { browserExternalRequests: 0, protectedRequests: 0, buildDeniedRequests: 0, reviewExternalRequests: 0, providerRequests: 0, paidCalls: 0, liveAiCalls: 0, automaticResubmits: 0 });
  assert.equal(candidate.protectedRuntime.status, "BYTE_IDENTICAL");
  assert.match(candidate.protectedRuntime.protectedTreeSha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.lifecycle.ordinaryReviewServerActive, true);
  assert.equal(candidate.lifecycle.ordinaryReviewUrl, "http://127.0.0.1:58440");
  assert.equal(candidate.lifecycle.ordinaryReviewMode, "NORMAL_NEXT_DEV_WEBPACK");
  assert.equal(candidate.lifecycle.ordinaryNotificationStateEmpty, true);
  assert.equal(candidate.lifecycle.fixtureRouteAbsent, true);
  assert.equal(candidate.lifecycle.providerKeyPresentOnly, true);
  assert.equal(candidate.proofClaims.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE");
  assert.equal(candidate.proofClaims.exactSourceTargeting, true);
  assert.equal(candidate.proofClaims.sourceCommitBeforeNotification, true);
  assert.equal(candidate.proofClaims.oneSharedEventAcrossViews, true);
  assert.equal(candidate.proofClaims.noMountReplay, true);
  assert.equal(candidate.proofClaims.twoTabAndReloadConvergence, true);
  for (const key of ["rootAssistantObserverConnected", "rootTerraObserverConnected", "assistantOnlyFilteringPreserved", "terraHomeOnlyFilteringPreserved"] as const) assert.equal(candidate.boundaries[key], true, key);
  for (const key of ["exportPhase3Changed", "offlinePhase4Changed", "animationMutationChanged", "providerOrModelChanged", "searchChanged", "dictationChanged", "creditsChanged", "canonicalDocumentationChanged"] as const) assert.equal(candidate.boundaries[key], false, key);
  if (!files) return;
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), SPEC0014_PHASE2_BASE);
  assert.equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), SPEC0014_PHASE2_BRANCH);
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
  ["schema", value => { value.schema = "wrong"; }],
  ["identity", value => { value.identity.head = "0".repeat(40); }],
  ["dirty allowlist", value => { value.git.dirtyPaths.push("docs/CURRENT_STATE.md"); }],
  ["publication", value => { value.git.pushed = true; }],
  ["implementation hash", value => { value.implementation[0].sha256 = "invalid"; }],
  ["provider call", value => { value.networkAndProviders.providerRequests = 1; }],
  ["automatic resubmit", value => { value.networkAndProviders.automaticResubmits = 1; }],
  ["source ordering", value => { value.proofClaims.sourceCommitBeforeNotification = false; }],
  ["exact targeting", value => { value.proofClaims.exactSourceTargeting = false; }],
  ["duplicate convergence", value => { value.proofClaims.twoTabAndReloadConvergence = false; }],
  ["export scope", value => { value.boundaries.exportPhase3Changed = true; }],
  ["offline scope", value => { value.boundaries.offlinePhase4Changed = true; }],
];
const rejected: string[] = [];
for (const [name, mutate] of mutations) {
  const candidate = clone(manifest); mutate(candidate);
  assert.throws(() => validate(candidate, false), `mutation must be rejected: ${name}`);
  rejected.push(name);
}
const result = { schema: "spec0014-phase2-validation/v1", status: "PASS", manifestSha256: sha256(readFileSync(manifestPath)), implementationPaths: 21, evidenceFiles: manifest.evidence.length, mutationsRejected: rejected.length, mutations: rejected, dirtyAllowlistExact: true, indexEmpty: true };
writeFileSync(resolve(outputRoot, "validation.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`SPEC-0014 Phase 2 proof validation PASS (${rejected.length} mutations rejected)\n`);
