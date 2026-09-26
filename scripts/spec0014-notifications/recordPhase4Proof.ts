import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const SPEC0014_PHASE4_BASE = "57f3a8560dc61f79db87c13dbff7285684b74793";
export const SPEC0014_PHASE4_PATHS = [
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

const outputRoot = resolve("output/spec0014/phase4");
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
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();

mkdirSync(outputRoot, { recursive: true });
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), SPEC0014_PHASE4_BASE);
assert.equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), "", "authorized Phase 4 executor stays detached");
assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "index must remain empty");
assert.deepEqual(dirtyPaths(), [...SPEC0014_PHASE4_PATHS].sort(), "dirty paths must equal the exact Phase 4 allowlist");
execFileSync("git", ["diff", "--check"], { stdio: "pipe" });

const oracle = json<{ status: string; assertions: number; providerRequests: number; paidCalls: number }>("oracle.json");
const browser = json<{ status: string; assertions: number; offlineBellLatencyMs: number; network: { externalRequests: unknown[]; providerRequests: number; realProviderCalls: number; paidCalls: number }; errors: unknown[]; limitations: Record<string, string> }>("browser/result.json");
const protectedResult = json<{ status: string; protectedRuntime: { status: string; paths: number; aggregateSha256: string }; acceptedPhase2: { oracleAssertions: number; browserAssertions: number; assistantExplicitPosts: number; terraExplicitPosts: number }; export: Record<string, boolean>; networkRequestCount: number; realProviderCalls: number; paidCalls: number }>("protected-regressions/result.json");
const build = json<{ status: string; fullProductionBuild: string; fullLint: Record<string, unknown>; defaultTurbopackBuild: Record<string, unknown>; fullWebpackProductionBuild: Record<string, unknown>; network: { denied: number }; providerRequests: number }>("build/result.json");
const review = json<{ status: string; reviewUrl: string; pid: number; process: { mode: string; port: number; pid: number }; fixtureLifecycle: Record<string, boolean>; environment: Record<string, boolean>; ordinaryState: { homeUnread: number; assistantUnread: number }; network: { externalRequests: number; providerRequests: number } }>("review/review-setup.json");
for (const [name, proof] of Object.entries({ oracle, browser, protectedResult, review })) assert.equal(proof.status, "PASS", `${name} proof must pass`);
assert.equal(build.status, "BLOCKED_BY_VERIFIED_BASELINE");
assert.equal(build.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE");
assert.deepEqual(browser.network.externalRequests, []);
assert.deepEqual(browser.errors, []);
assert.equal(oracle.providerRequests + browser.network.realProviderCalls + protectedResult.realProviderCalls + build.providerRequests + review.network.providerRequests, 0);
assert.equal(browser.network.paidCalls + protectedResult.paidCalls + oracle.paidCalls, 0);
assert.equal(protectedResult.networkRequestCount + build.network.denied + review.network.externalRequests, 0);
assert.equal(review.reviewUrl, "http://127.0.0.1:58480");

const implementation = SPEC0014_PHASE4_PATHS.map(path => { const bytes = readFileSync(path); return { path, bytes: bytes.byteLength, sha256: sha256(bytes) }; });
const evidence = filesUnder(outputRoot).filter(path => !excludedEvidence.has(relative(path))).sort().map(path => { const bytes = readFileSync(path); return { path: relative(path), bytes: bytes.byteLength, sha256: sha256(bytes) }; });
for (const required of ["oracle.json", "browser/result.json", "protected-regressions/result.json", "build/result.json", "review/review-setup.json"]) assert.ok(evidence.some(item => item.path === required), `missing evidence ${required}`);

const manifest = {
  schema: "spec0014-phase4-proof-manifest/v1",
  recordedAt: new Date().toISOString(),
  identity: { base: SPEC0014_PHASE4_BASE, head: SPEC0014_PHASE4_BASE, branch: "", detached: true, worktree: process.cwd(), role: "Spec Executor", implementationPathCount: SPEC0014_PHASE4_PATHS.length },
  git: { dirtyPaths: [...SPEC0014_PHASE4_PATHS].sort(), indexEmpty: true, diffCheck: "PASS", stagedPaths: [], committed: false, merged: false, pushed: false, published: false, deployed: false },
  implementation,
  evidence,
  evidenceExclusions: [
    { path: "review/server.log", reason: "live normal review server log is mutable operational state" },
    { path: "manifest.json", reason: "self" },
    { path: "manifest.sha256", reason: "digest sidecar" },
    { path: "validation.json", reason: "written after independent validation" }
  ],
  receipts: { oracleAssertions: oracle.assertions, browserAssertions: browser.assertions, phase2OracleAssertions: protectedResult.acceptedPhase2.oracleAssertions, phase2BrowserAssertions: protectedResult.acceptedPhase2.browserAssertions, assistantExplicitPosts: protectedResult.acceptedPhase2.assistantExplicitPosts, terraExplicitPosts: protectedResult.acceptedPhase2.terraExplicitPosts, offlineBellLatencyMs: browser.offlineBellLatencyMs },
  networkAndProviders: { browserExternalRequests: 0, deterministicProviderFailureProbes: browser.network.providerRequests, protectedRequests: 0, buildDeniedRequests: 0, reviewExternalRequests: 0, realProviderCalls: 0, paidCalls: 0, liveAiCalls: 0, automaticResubmits: 0 },
  protectedRuntime: protectedResult.protectedRuntime,
  lifecycle: { ordinaryReviewServerActive: true, ordinaryReviewUrl: review.reviewUrl, ordinaryReviewPid: review.pid, ordinaryReviewMode: review.process.mode, ordinaryNotificationStateEmpty: review.ordinaryState.homeUnread === 0 && review.ordinaryState.assistantUnread === 0, fixtureRouteAbsent: review.fixtureLifecycle.fixtureRouteAbsent, providerKeyPresentOnly: review.environment.keyPresent && review.environment.copiedOnlyOpenAiApiKey },
  ownerCorrection: { supersedesPlanDuringExecution: true, pageWideWarningRemoved: true, existingBellCount: 2, offlineVisibleInHome: true, offlineVisibleInAssistant: true, offlineBellColor: "red", sharedIncidentAndReadState: true, restorationNotificationAdded: true, restorationRequiresExplicitAcknowledgement: true, assistantOtherEventsRemainReplyOnly: true, canonicalDocsPendingCpa: true },
  proofClaims: { browserOfflineOnly: true, oneRowPerIncident: true, crossTabAndReloadDedupe: true, onlinePublishesSingleRestoration: true, restorationPersistsUntilAcknowledged: true, offlinePreservesUnreadRestoration: true, silentInitialOnlineReconciliation: true, readDoesNotClearOfflineSignal: true, providerFailureDoesNotImplyOffline: true, dormantEventsEmitZero: true, exportNotificationsEmitZero: true, fullProductionBuild: build.fullProductionBuild, defaultTurbopackBuild: build.defaultTurbopackBuild, fullWebpackProductionBuild: build.fullWebpackProductionBuild, fullLint: build.fullLint, limitations: browser.limitations },
  boundaries: { assistantTerraAcceptedFlowsPreserved: true, exportRuntimeByteIdentical: protectedResult.export.runtimeByteIdentical, exportNotificationProducerAdded: false, backgroundExportAdded: false, aiAnimationProducerAdded: false, lowUsageProducerAdded: false, updaterProducerAdded: false, providerOrModelChanged: false, searchChanged: false, citationsChanged: false, dictationChanged: false, toolsChanged: false, limitsChanged: false, canonicalDocumentationChanged: false }
};
const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(manifestPath, bytes);
const digest = sha256(bytes);
writeFileSync(resolve(outputRoot, "manifest.sha256"), `${digest}  manifest.json\n`);
process.stdout.write(`SPEC-0014 Phase 4 manifest SHA-256 ${digest}\n`);
