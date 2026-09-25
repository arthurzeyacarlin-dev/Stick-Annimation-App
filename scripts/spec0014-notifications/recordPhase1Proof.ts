import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const SPEC0014_PHASE1_BASE = "a5ca805b220357b5e8128bb6b76ea408e30fa790";
export const SPEC0014_PHASE1_BRANCH = "codex/spec0014-phase1-notification-correction";
export const SPEC0014_PHASE1_PATHS = [
  "app/layout.tsx",
  "src/lib/notifications/notificationContracts.ts",
  "src/lib/notifications/notificationStorage.ts",
  "src/lib/notifications/notificationNavigation.ts",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/notifications/NotificationTrigger.tsx",
  "src/components/notifications/notificationCenter.module.css",
  "src/components/chrome/AIcreditspage.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/assistant/diamondAssistant.module.css",
  "scripts/fixtures/spec0014-notifications/phase-1/contract.json",
  "scripts/spec0014-notifications/phase1Oracle.ts",
  "scripts/spec0014-notifications/phase1StorageProof.ts",
  "scripts/spec0014-notifications/phase1BrowserProof.ts",
  "scripts/spec0014-notifications/phase1ProtectedRegressions.ts",
  "scripts/spec0014-notifications/phase1BuildProof.ts",
  "scripts/spec0014-notifications/recordPhase1Proof.ts",
  "scripts/spec0014-notifications/validatePhase1Proof.ts",
  "scripts/spec0014-notifications/phase1ReviewSetup.ts",
] as const;

const outputRoot = resolve("output/spec0014/phase1");
const manifestPath = resolve(outputRoot, "manifest.json");
const manifestShaPath = resolve(outputRoot, "manifest.sha256");
const excludedEvidence = new Set(["manifest.json", "manifest.sha256", "validation.json", "review/server.log"]);
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = <T>(path: string) => JSON.parse(readFileSync(resolve(outputRoot, path), "utf8")) as T;
const relative = (path: string) => path.slice(outputRoot.length + 1);

function filesUnder(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `proof evidence may not contain symlinks: ${path}`);
    if (stat.isDirectory()) files.push(...filesUnder(path));
    else if (stat.isFile()) files.push(path);
  }
  return files;
}
function dirtyPaths() {
  const output = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" });
  return output.split("\n").filter(Boolean).map(line => line.slice(3)).sort();
}

mkdirSync(outputRoot, { recursive: true });
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), SPEC0014_PHASE1_BASE);
assert.equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), SPEC0014_PHASE1_BRANCH);
assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "index must remain empty");
assert.deepEqual(dirtyPaths(), [...SPEC0014_PHASE1_PATHS].sort(), "dirty path set must equal the exact 19-path allowlist");
execFileSync("git", ["diff", "--check"], { stdio: "pipe" });

const oracle = json<{ status: string; assertions: number; activeVectors: unknown[]; limits: Record<string, boolean> }>("oracle.json");
const browser = json<{ status: string; fixture: Record<string, unknown>; productionTriggers: Record<string, number>; storage: { status: string; assertions: number; receipts: string[] }; ui: { assertions: number; nativeBrowserZoom200: string; nativeOsWindowFocus: string }; persistence: Record<string, unknown>; providerRequests: number; networkRequests: { external: number } }>("browser-proof.json");
const protectedResult = json<{ status: string; receipts: Array<{ name: string }>; receiptCount: number; browserReceipts: Array<{ name: string }>; browserReceiptCount: number; protectedRuntimeOutsideAllowlist: { status: string; protectedTreeSha256: string }; networkRequestCount: number; realProviderCalls: number; paidCalls: number; protectedServersSequentialAndClosed: boolean }>("protected-regressions/result.json");
const build = json<{ status: string; commands: Array<{ label: string; status: string; exitCode: number }>; fullLint: Record<string, unknown>; defaultTurbopackBuild: Record<string, unknown>; fullWebpackProductionBuild: Record<string, unknown>; network: { denied: number }; providerRequests: number; fullProductionBuild: string }>("build/result.json");
const review = json<{ status: string; reviewUrl: string; pid: number; process: Record<string, unknown>; fixtureLifecycle: Record<string, boolean>; environment: Record<string, boolean>; ordinaryState: Record<string, number>; network: { externalRequests: number; providerRequests: number } }>("review/review-setup.json");
for (const [name, proof] of Object.entries({ oracle, browser, protectedResult, review })) assert.equal(proof.status, "PASS", `${name} proof must pass`);
assert.equal(build.status, "BLOCKED_BY_VERIFIED_BASELINE", "full build must carry the verified exact-base blocker honestly");
assert.equal(build.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE");
assert.equal(oracle.activeVectors.length, 7);
assert.equal(browser.fixture.implementationPathCount, 19);
assert.equal(protectedResult.browserReceiptCount, 4);
assert.equal(protectedResult.protectedServersSequentialAndClosed, true);
assert.deepEqual(browser.productionTriggers, { home: 1, assistant: 1, credits: 0, tutorials: 0, openProject: 0, myProjects: 0, export: 0, workspace: 0 });
assert.equal(browser.providerRequests + protectedResult.realProviderCalls + build.providerRequests + review.network.providerRequests, 0);
assert.equal(browser.networkRequests.external + protectedResult.networkRequestCount + build.network.denied + review.network.externalRequests, 0);
assert.equal(review.reviewUrl, "http://127.0.0.1:58420");

const implementation = SPEC0014_PHASE1_PATHS.map(path => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
});
const evidence = filesUnder(outputRoot).filter(path => !excludedEvidence.has(relative(path))).sort().map(path => {
  const bytes = readFileSync(path);
  return { path: relative(path), bytes: bytes.byteLength, sha256: sha256(bytes) };
});
assert.ok(evidence.some(item => item.path === "oracle.json"));
assert.ok(evidence.some(item => item.path === "browser-proof.json"));
assert.ok(evidence.some(item => item.path === "storage-proof.json"));
assert.ok(evidence.some(item => item.path === "protected-regressions/result.json"));
assert.ok(evidence.some(item => item.path === "build/result.json"));
assert.ok(evidence.some(item => item.path === "review/review-setup.json"));

const requiredReceipts = [
  "contract-seven-active-terminal-vectors",
  ...browser.storage.receipts,
  "production-two-bell-trigger-counts",
  "visibility-and-arrival-exact-match-matrix",
  "ui-filtering-read-ring-announcement-focus-accessibility",
  "two-tab-web-lock-and-fallback-convergence",
  "reload-and-full-chromium-restart-persistence",
  ...protectedResult.receipts.map(receipt => `protected:${receipt.name}`),
  ...protectedResult.browserReceipts.map(receipt => `protected-browser:${receipt.name}`),
  ...build.commands.map(command => `build:${command.label}`),
  "ordinary-review-server-ready",
];

const manifest = {
  schema: "spec0014-phase1-proof-manifest/v1",
  recordedAt: new Date().toISOString(),
  identity: {
    base: SPEC0014_PHASE1_BASE,
    head: SPEC0014_PHASE1_BASE,
    branch: SPEC0014_PHASE1_BRANCH,
    worktree: process.cwd(),
    role: "Spec Executor",
    implementationPathCount: 19,
  },
  git: { dirtyPaths: [...SPEC0014_PHASE1_PATHS].sort(), indexEmpty: true, diffCheck: "PASS", stagedPaths: [], committed: false, merged: false, pushed: false, published: false, deployed: false },
  implementation,
  evidence,
  evidenceExclusions: [{ path: "review/server.log", reason: "live ordinary review-server operational log; not immutable evidence" }, { path: "manifest.json", reason: "self" }, { path: "manifest.sha256", reason: "manifest digest sidecar" }, { path: "validation.json", reason: "written only after independent validation" }],
  receipts: { names: requiredReceipts, count: requiredReceipts.length, contractAssertions: oracle.assertions, storageAssertions: browser.storage.assertions, uiAssertions: browser.ui.assertions, protectedCount: protectedResult.receiptCount, protectedBrowserCount: protectedResult.browserReceiptCount },
  exactCounts: { activeEventTypes: 7, dormantEventTypes: 3, productTriggers: 2, implementationPaths: 19, maximumRows: 500, maximumSerializedDurableBytes: 2 * 1024 * 1024 },
  networkAndProviders: { browserExternalRequests: 0, protectedRequests: 0, buildDeniedRequests: 0, reviewExternalRequests: 0, providerRequests: 0, paidCalls: protectedResult.paidCalls, liveAiCalls: 0 },
  protectedRuntime: protectedResult.protectedRuntimeOutsideAllowlist,
  lifecycle: { fixtureServerClosed: true, fixturePortClosed: review.fixtureLifecycle.fixturePortClosed, fixtureHostRemoved: review.fixtureLifecycle.fixtureHostRemoved, fixtureRouteAbsent: review.fixtureLifecycle.fixtureRouteAbsent, disposableProfileRemoved: true, ordinaryReviewServerActive: true, ordinaryReviewUrl: review.reviewUrl, ordinaryReviewPid: review.pid, ordinaryNotificationStateEmpty: review.ordinaryState.homeUnread === 0 && review.ordinaryState.assistantUnread === 0, providerKeyPresentOnly: review.environment.keyPresent && review.environment.copiedOnlyOpenAiApiKey },
  proofClaims: { fullProductionBuild: build.fullProductionBuild, defaultTurbopackBuild: build.defaultTurbopackBuild, fullWebpackProductionBuild: build.fullWebpackProductionBuild, fullLint: build.fullLint, ordinaryReviewMode: review.process.mode, nativeBrowserZoom200: "UNPROVEN", nativeOsWindowFocus: "UNPROVEN", cdpPageScaleFactor2: "SUPPLEMENTAL_ONLY", physicalMicrophone: "UNPROVEN_NOT_REQUESTED", physicalDeviceAndNonChromium: "UNPROVEN", hashAuthenticationAgainstWriterRewrite: false },
  boundaries: { productionProducerConnected: false, productionOriginRegistrationConnected: false, productionDestinationHandlerConnected: false, productionPollingLoopConnected: false, productionFixtureConnected: false, creditOrBillingChanged: false, workspaceOrProjectChanged: false, exportExecutionChanged: false, packagesOrConfigurationChanged: false, canonicalDocumentationChanged: false },
};

const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(manifestPath, manifestBytes);
const manifestSha256 = sha256(manifestBytes);
writeFileSync(manifestShaPath, `${manifestSha256}  manifest.json\n`);
process.stdout.write(`SPEC-0014 Phase 1 manifest SHA-256 ${manifestSha256}\n`);
