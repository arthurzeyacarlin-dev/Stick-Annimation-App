import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const SPEC0014_PHASE2_BASE = "acd4031cade0e4e960223190a8c1645d007d61af";
export const SPEC0014_PHASE2_BRANCH = "codex/spec0014-phase2-ai-completion-review";
export const SPEC0014_PHASE2_PATHS = [
  "app/page.tsx",
  "src/components/assistant/AssistantConversation.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/useAssistantSessions.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/components/workspace/ai/WorkspaceAiPanelShell.tsx",
  "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/notifications/notificationNavigation.ts",
  "src/lib/notifications/assistantCompletionObserver.ts",
  "src/lib/notifications/terraCompletionObserver.ts",
  "scripts/fixtures/spec0014-notifications/phase-2/contract.json",
  "scripts/spec0014-notifications/phase2BrowserProof.ts",
  "scripts/spec0014-notifications/phase2Oracle.ts",
  "scripts/spec0014-notifications/phase2ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase2BuildProof.ts",
  "scripts/spec0014-notifications/phase2ReviewSetup.ts",
  "scripts/spec0014-notifications/recordPhase2Proof.ts",
  "scripts/spec0014-notifications/validatePhase2Proof.ts",
] as const;

const outputRoot = resolve("output/spec0014/phase2");
const manifestPath = resolve(outputRoot, "manifest.json");
const excludedEvidence = new Set(["manifest.json", "manifest.sha256", "validation.json", "review/server.log"]);
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const relative = (path: string) => path.slice(outputRoot.length + 1);
const json = <T>(path: string) => JSON.parse(readFileSync(resolve(outputRoot, path), "utf8")) as T;

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `proof evidence may not contain symlinks: ${path}`);
    return stat.isDirectory() ? filesUnder(path) : stat.isFile() ? [path] : [];
  });
}
function dirtyPaths() {
  return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
}

mkdirSync(outputRoot, { recursive: true });
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), SPEC0014_PHASE2_BASE);
assert.equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), SPEC0014_PHASE2_BRANCH, "authorized worktree must own the exact Phase 2 review branch");
assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "index must remain empty");
assert.deepEqual(dirtyPaths(), [...SPEC0014_PHASE2_PATHS].sort(), "dirty path set must equal the exact Phase 2 allowlist");
execFileSync("git", ["diff", "--check"], { stdio: "pipe" });

const oracle = json<{ status: string; assertions: number }>("oracle.json");
const browser = json<{ status: string; assertionCount: number; assistantPosts: number; terraPosts: number; realProviderCalls: number; paidCalls: number; externalRequests: unknown[]; errors: unknown[]; limitations: Record<string, string> }>("browser/result.json");
const protectedResult = json<{ status: string; receiptCount: number; browserReceiptCount: number; networkRequestCount: number; realProviderCalls: number; paidCalls: number; protectedRuntimeOutsideAllowlist: { status: string; protectedTreeSha256: string } }>("protected-regressions/result.json");
const build = json<{ status: string; commands: Array<{ label: string; status: string; exitCode: number }>; fullLint: Record<string, unknown>; defaultTurbopackBuild: Record<string, unknown>; fullWebpackProductionBuild: Record<string, unknown>; network: { denied: number }; providerRequests: number; fullProductionBuild: string }>("build/result.json");
const review = json<{ status: string; reviewUrl: string; pid: number; process: { mode: string; port: number; pid: number }; fixtureLifecycle: Record<string, boolean>; environment: Record<string, boolean>; ordinaryState: { homeUnread: number; assistantUnread: number }; network: { externalRequests: number; providerRequests: number } }>("review/review-setup.json");
for (const [name, proof] of Object.entries({ oracle, browser, protectedResult, review })) assert.equal(proof.status, "PASS", `${name} proof must pass`);
assert.equal(build.status, "BLOCKED_BY_VERIFIED_BASELINE");
assert.equal(build.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE");
assert.equal(browser.assertionCount, 42);
assert.equal(browser.assistantPosts, 9);
assert.equal(protectedResult.browserReceiptCount, 4);
assert.deepEqual(browser.externalRequests, []);
assert.deepEqual(browser.errors, []);
assert.equal(browser.realProviderCalls + protectedResult.realProviderCalls + build.providerRequests + review.network.providerRequests, 0);
assert.equal(protectedResult.networkRequestCount + build.network.denied + review.network.externalRequests, 0);
assert.equal(review.reviewUrl, "http://127.0.0.1:58440");

const implementation = SPEC0014_PHASE2_PATHS.map(path => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
});
const evidence = filesUnder(outputRoot).filter(path => !excludedEvidence.has(relative(path))).sort().map(path => {
  const bytes = readFileSync(path);
  return { path: relative(path), bytes: bytes.byteLength, sha256: sha256(bytes) };
});
for (const required of ["oracle.json", "browser/result.json", "protected-regressions/result.json", "build/result.json", "review/review-setup.json"]) assert.ok(evidence.some(item => item.path === required), `missing evidence ${required}`);

const manifest = {
  schema: "spec0014-phase2-proof-manifest/v1",
  recordedAt: new Date().toISOString(),
  identity: { base: SPEC0014_PHASE2_BASE, head: SPEC0014_PHASE2_BASE, branch: SPEC0014_PHASE2_BRANCH, worktree: process.cwd(), role: "Spec Executor", implementationPathCount: SPEC0014_PHASE2_PATHS.length },
  git: { dirtyPaths: [...SPEC0014_PHASE2_PATHS].sort(), indexEmpty: true, diffCheck: "PASS", stagedPaths: [], committed: false, merged: false, pushed: false, published: false, deployed: false },
  implementation,
  evidence,
  evidenceExclusions: [
    { path: "review/server.log", reason: "live normal review server log is mutable operational state" },
    { path: "manifest.json", reason: "self" },
    { path: "manifest.sha256", reason: "digest sidecar" },
    { path: "validation.json", reason: "written after independent validation" },
  ],
  receipts: { oracleAssertions: oracle.assertions, browserAssertions: browser.assertionCount, protectedStaticReceipts: protectedResult.receiptCount, protectedBrowserReceipts: protectedResult.browserReceiptCount, assistantExplicitPosts: browser.assistantPosts, terraExplicitPosts: browser.terraPosts },
  networkAndProviders: { browserExternalRequests: 0, protectedRequests: 0, buildDeniedRequests: 0, reviewExternalRequests: 0, providerRequests: 0, paidCalls: browser.paidCalls + protectedResult.paidCalls, liveAiCalls: 0, automaticResubmits: 0 },
  protectedRuntime: protectedResult.protectedRuntimeOutsideAllowlist,
  lifecycle: { ordinaryReviewServerActive: true, ordinaryReviewUrl: review.reviewUrl, ordinaryReviewPid: review.pid, ordinaryReviewMode: review.process.mode, ordinaryNotificationStateEmpty: review.ordinaryState.homeUnread === 0 && review.ordinaryState.assistantUnread === 0, fixtureRouteAbsent: review.fixtureLifecycle.fixtureRouteAbsent, providerKeyPresentOnly: review.environment.keyPresent && review.environment.copiedOnlyOpenAiApiKey },
  proofClaims: { fullProductionBuild: build.fullProductionBuild, defaultTurbopackBuild: build.defaultTurbopackBuild, fullWebpackProductionBuild: build.fullWebpackProductionBuild, fullLint: build.fullLint, exactSourceTargeting: true, sourceCommitBeforeNotification: true, oneSharedEventAcrossViews: true, noMountReplay: true, twoTabAndReloadConvergence: true, limitations: browser.limitations },
  boundaries: { rootAssistantObserverConnected: true, rootTerraObserverConnected: true, assistantOnlyFilteringPreserved: true, terraHomeOnlyFilteringPreserved: true, exportPhase3Changed: false, offlinePhase4Changed: false, animationMutationChanged: false, providerOrModelChanged: false, searchChanged: false, dictationChanged: false, creditsChanged: false, canonicalDocumentationChanged: false },
};

const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(manifestPath, bytes);
const digest = sha256(bytes);
writeFileSync(resolve(outputRoot, "manifest.sha256"), `${digest}  manifest.json\n`);
process.stdout.write(`SPEC-0014 Phase 2 manifest SHA-256 ${digest}\n`);
