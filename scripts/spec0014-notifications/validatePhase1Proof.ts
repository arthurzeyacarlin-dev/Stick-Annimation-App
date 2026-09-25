import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "a5ca805b220357b5e8128bb6b76ea408e30fa790";
const branch = "codex/spec0014-phase1-notification-correction";
const allowedPaths = [
  "app/layout.tsx", "src/lib/notifications/notificationContracts.ts", "src/lib/notifications/notificationStorage.ts", "src/lib/notifications/notificationNavigation.ts",
  "src/components/notifications/NotificationCenterProvider.tsx", "src/components/notifications/NotificationTrigger.tsx", "src/components/notifications/notificationCenter.module.css",
  "src/components/chrome/AIcreditspage.tsx", "src/components/assistant/DiamondAssistantScreen.tsx", "src/components/assistant/diamondAssistant.module.css",
  "scripts/fixtures/spec0014-notifications/phase-1/contract.json", "scripts/spec0014-notifications/phase1Oracle.ts", "scripts/spec0014-notifications/phase1StorageProof.ts",
  "scripts/spec0014-notifications/phase1BrowserProof.ts", "scripts/spec0014-notifications/phase1ProtectedRegressions.ts", "scripts/spec0014-notifications/phase1BuildProof.ts",
  "scripts/spec0014-notifications/recordPhase1Proof.ts", "scripts/spec0014-notifications/validatePhase1Proof.ts", "scripts/spec0014-notifications/phase1ReviewSetup.ts",
].sort();
const outputRoot = resolve("output/spec0014/phase1");
const manifestPath = resolve(outputRoot, "manifest.json");
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
type Manifest = ReturnType<JSON["parse"]>;

function currentDirtyPaths() {
  return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).split("\n").filter(Boolean).map(line => line.slice(3)).sort();
}
function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `evidence symlink: ${path}`);
    return stat.isDirectory() ? filesUnder(path) : stat.isFile() ? [path] : [];
  });
}
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); }
function validate(candidate: Manifest, checkFiles: boolean) {
  equal(candidate.schema, "spec0014-phase1-proof-manifest/v1", "schema");
  equal(candidate.identity.base, base, "base"); equal(candidate.identity.head, base, "head"); equal(candidate.identity.branch, branch, "branch");
  equal(candidate.identity.worktree, process.cwd(), "worktree"); equal(candidate.identity.role, "Spec Executor", "role"); equal(candidate.identity.implementationPathCount, 19, "implementation count");
  equal(candidate.git.dirtyPaths, allowedPaths, "dirty allowlist"); equal(candidate.git.indexEmpty, true, "empty index"); equal(candidate.git.stagedPaths, [], "staged paths");
  for (const flag of ["committed", "merged", "pushed", "published", "deployed"]) equal(candidate.git[flag], false, `git ${flag}`);
  equal(candidate.implementation.length, 19, "implementation records");
  equal(candidate.implementation.map((entry: { path: string }) => entry.path).sort(), allowedPaths, "implementation paths");
  equal(new Set(candidate.implementation.map((entry: { path: string }) => entry.path)).size, 19, "unique implementation paths");
  equal(candidate.exactCounts, { activeEventTypes: 7, dormantEventTypes: 3, productTriggers: 2, implementationPaths: 19, maximumRows: 500, maximumSerializedDurableBytes: 2 * 1024 * 1024 }, "exact counts");
  assert.ok(candidate.receipts.names.includes("contract-seven-active-terminal-vectors"));
  for (const receipt of ["storage-500-rows", "storage-501st-unread-rejected", "storage-read-only-pruning", "storage-corrupt-quarantine-preserved", "storage-corrupt-key-collision-preserved", "storage-2mib-boundary", "storage-web-lock-and-lease-takeover", "storage-fallback-active-lease", "storage-version-fault-recovery", "production-two-bell-trigger-counts", "visibility-and-arrival-exact-match-matrix", "two-tab-web-lock-and-fallback-convergence", "reload-and-full-chromium-restart-persistence", "ordinary-review-server-ready"]) assert.ok(candidate.receipts.names.includes(receipt), `missing receipt ${receipt}`);
  for (const receipt of ["assistant-workflow", "assistant-search-retry", "assistant-dictation", "terra-workspace"]) assert.ok(candidate.receipts.names.includes(`protected-browser:${receipt}`), `missing protected browser receipt ${receipt}`);
  equal(candidate.receipts.count, candidate.receipts.names.length, "receipt count");
  equal(candidate.receipts.protectedBrowserCount, 4, "protected browser receipt count");
  assert.ok(candidate.receipts.contractAssertions >= 35 && candidate.receipts.storageAssertions >= 29 && candidate.receipts.uiAssertions >= 30, "assertion floors");
  equal(candidate.networkAndProviders, { browserExternalRequests: 0, protectedRequests: 0, buildDeniedRequests: 0, reviewExternalRequests: 0, providerRequests: 0, paidCalls: 0, liveAiCalls: 0 }, "network/provider ledger");
  equal(candidate.protectedRuntime.status, "BYTE_IDENTICAL", "protected runtime"); assert.match(candidate.protectedRuntime.protectedTreeSha256, /^[a-f0-9]{64}$/);
  equal(candidate.lifecycle.fixtureServerClosed, true, "fixture server closure"); equal(candidate.lifecycle.fixturePortClosed, true, "fixture port closure"); equal(candidate.lifecycle.fixtureHostRemoved, true, "fixture copy removal"); equal(candidate.lifecycle.fixtureRouteAbsent, true, "fixture route removal"); equal(candidate.lifecycle.disposableProfileRemoved, true, "profile cleanup"); equal(candidate.lifecycle.ordinaryReviewServerActive, true, "ordinary review active"); equal(candidate.lifecycle.ordinaryReviewUrl, "http://127.0.0.1:58420", "review URL"); equal(candidate.lifecycle.ordinaryNotificationStateEmpty, true, "ordinary state"); equal(candidate.lifecycle.providerKeyPresentOnly, true, "key-only env");
  equal(candidate.proofClaims.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE", "full build honesty"); equal(candidate.proofClaims.defaultTurbopackBuild.status, "OBSERVED_FAILURE", "default build honesty"); equal(candidate.proofClaims.defaultTurbopackBuild.productionReadyClaim, false, "default build claim"); equal(candidate.proofClaims.fullWebpackProductionBuild.status, "BLOCKED_BY_VERIFIED_BASELINE", "Webpack build honesty"); equal(candidate.proofClaims.fullWebpackProductionBuild.diagnosticIdentical, true, "Webpack baseline diagnostic"); equal(candidate.proofClaims.fullWebpackProductionBuild.blockedPath, "app/dev/ai-costs/lifetime/page.tsx", "Webpack blocking path"); assert.match(candidate.proofClaims.fullWebpackProductionBuild.blockedSourceSha256, /^[a-f0-9]{64}$/, "Webpack blocking source hash"); equal(candidate.proofClaims.fullWebpackProductionBuild.blockedSourceByteIdenticalToBase, true, "Webpack blocking source identity"); equal(candidate.proofClaims.fullWebpackProductionBuild.productionReadyClaim, false, "Webpack production claim"); equal(candidate.proofClaims.ordinaryReviewMode, "NORMAL_NEXT_DEV_WEBPACK", "review mode honesty"); equal(candidate.proofClaims.nativeBrowserZoom200, "UNPROVEN", "native zoom honesty"); equal(candidate.proofClaims.nativeOsWindowFocus, "UNPROVEN", "native OS focus honesty"); equal(candidate.proofClaims.cdpPageScaleFactor2, "SUPPLEMENTAL_ONLY", "page scale honesty"); equal(candidate.proofClaims.physicalMicrophone, "UNPROVEN_NOT_REQUESTED", "microphone honesty"); equal(candidate.proofClaims.physicalDeviceAndNonChromium, "UNPROVEN", "physical/non-Chromium honesty"); equal(candidate.proofClaims.hashAuthenticationAgainstWriterRewrite, false, "hash authentication honesty");
  for (const value of Object.values(candidate.boundaries)) equal(value, false, "boundary must remain unchanged/disconnected");
  assert.ok(candidate.evidence.length >= 12, "evidence inventory is incomplete");
  equal(new Set(candidate.evidence.map((entry: { path: string }) => entry.path)).size, candidate.evidence.length, "unique evidence paths");
  for (const required of ["oracle.json", "browser-proof.json", "storage-proof.json", "protected-regressions/result.json", "build/result.json", "review/review-setup.json"]) assert.ok(candidate.evidence.some((entry: { path: string }) => entry.path === required), `missing evidence ${required}`);
  for (const entry of candidate.implementation as Array<{ path: string; bytes: number; sha256: string }>) { assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `invalid implementation byte count ${entry.path}`); assert.match(entry.sha256, /^[a-f0-9]{64}$/, `invalid hash ${entry.path}`); }
  for (const entry of candidate.evidence as Array<{ path: string; bytes: number; sha256: string }>) { assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `invalid evidence byte count ${entry.path}`); assert.match(entry.sha256, /^[a-f0-9]{64}$/, `invalid hash ${entry.path}`); }
  if (checkFiles) {
    equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), base, "live HEAD");
    equal(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), branch, "live branch");
    equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "live index");
    equal(currentDirtyPaths(), allowedPaths, "live dirty allowlist");
    execFileSync("git", ["diff", "--check"], { stdio: "pipe" });
    for (const entry of candidate.implementation as Array<{ path: string; bytes: number; sha256: string }>) { const bytes = readFileSync(entry.path); equal(bytes.byteLength, entry.bytes, `bytes ${entry.path}`); equal(sha256(bytes), entry.sha256, `hash ${entry.path}`); }
    for (const entry of candidate.evidence as Array<{ path: string; bytes: number; sha256: string }>) { const bytes = readFileSync(resolve(outputRoot, entry.path)); equal(bytes.byteLength, entry.bytes, `evidence bytes ${entry.path}`); equal(sha256(bytes), entry.sha256, `evidence hash ${entry.path}`); }
    const excluded = new Set(["manifest.json", "manifest.sha256", "validation.json", "review/server.log"]);
    const liveEvidence = filesUnder(outputRoot).map(path => path.slice(outputRoot.length + 1)).filter(path => !excluded.has(path)).sort();
    equal(candidate.evidence.map((entry: { path: string }) => entry.path).sort(), liveEvidence, "complete evidence inventory");

    const readEvidence = (path: string): ReturnType<JSON["parse"]> => JSON.parse(readFileSync(resolve(outputRoot, path), "utf8"));
    const oracle = readEvidence("oracle.json"); const browser = readEvidence("browser-proof.json"); const storage = readEvidence("storage-proof.json"); const protectedResult = readEvidence("protected-regressions/result.json"); const build = readEvidence("build/result.json"); const review = readEvidence("review/review-setup.json");
    for (const [name, receipt] of Object.entries({ oracle, browser, storage, protectedResult, review })) equal(receipt.status, "PASS", `${name} receipt status`); equal(build.status, "BLOCKED_BY_VERIFIED_BASELINE", "build receipt status");
    equal(oracle.activeVectors.length, 7, "seven active receipt vectors"); equal(oracle.assertions, candidate.receipts.contractAssertions, "contract assertion binding"); equal(oracle.limits.hashesAuthenticateWriters, false, "local-integrity limitation"); equal(oracle.limits.productionProducersConnected, false, "producer boundary");
    equal(browser.productionTriggers, { home: 1, assistant: 1, credits: 0, tutorials: 0, openProject: 0, myProjects: 0, export: 0, workspace: 0 }, "two-bell receipt");
    equal(browser.productionUi.screenshots.sort(), ["production-assistant-empty-compact.png", "production-assistant-empty-desktop.png", "production-home-empty-compact.png", "production-home-empty-desktop.png"], "production screenshot set"); equal(browser.productionUi.accessibility.every((receipt: { violations: unknown[] }) => receipt.violations.length === 0), true, "production empty-panel Axe receipts"); equal(browser.productionUi.surfaceDepartureUnmounted, true, "surface-departure unmount receipt");
    equal(browser.storage.assertions, candidate.receipts.storageAssertions, "storage assertion binding"); equal(browser.ui.assertions, candidate.receipts.uiAssertions, "UI assertion binding"); equal(browser.storage.receipts, storage.receipts, "storage receipt copy"); equal(browser.providerRequests, 0, "browser providers"); equal(browser.networkRequests.external, 0, "browser external requests"); equal(browser.limitations.nativeBrowserZoom200, "UNPROVEN", "browser zoom receipt honesty"); equal(browser.limitations.nativeOsWindowFocus, "UNPROVEN", "window focus receipt honesty"); equal(browser.fixture.serverClosed, true, "fixture server receipt"); equal(browser.fixture.routeRemoved, true, "fixture route receipt");
    equal(browser.ui.screenshots.sort(), ["fixture-assistant-populated-compact.png", "fixture-assistant-populated-desktop.png", "fixture-home-populated-desktop.png"], "populated screenshot set"); equal(browser.ui.accessibility.every((receipt: { violations: unknown[] }) => receipt.violations.length === 0), true, "populated-panel Axe receipts");
    equal(protectedResult.receiptCount, 16, "protected static receipt count"); equal(protectedResult.browserReceiptCount, 4, "protected browser receipt count"); equal(protectedResult.browserReceipts.map((receipt: { name: string }) => receipt.name).sort(), ["assistant-dictation", "assistant-search-retry", "assistant-workflow", "terra-workspace"], "protected browser names"); equal(protectedResult.realProviderCalls, 0, "protected providers"); equal(protectedResult.networkRequestCount, 0, "protected network"); equal(protectedResult.protectedServersSequentialAndClosed, true, "protected server lifecycle"); equal(protectedResult.protectedServerMode, "NORMAL_NEXT_DEV_WEBPACK", "protected server mode"); equal(protectedResult.browserEvidenceExecution, "HASH_VERIFIED_SAME_TURN_PASSING_RECEIPT_REUSE", "protected browser receipt reuse honesty");
    const exportAdapter = protectedResult.receipts.find((receipt: { path: string }) => receipt.path === "scripts/spec0009-export/phase3Oracle.ts"); equal(exportAdapter.adaptation.assertionsRemoved, 0, "Export adapter assertions"); equal(exportAdapter.adaptation.adaptedSha256, sha256(readFileSync(exportAdapter.adaptation.adaptedPath)), "Export adapter hash"); equal(exportAdapter.sourceSha256, sha256(readFileSync(exportAdapter.path)), "Export source hash");
    for (const receipt of protectedResult.browserReceipts as Array<{ name: string; sourcePath: string; originalSha256: string; adaptedPath: string; adaptedSha256: string; resultPath: string; resultSha256: string; exitCode: number; execution: string; realProviderCalls: number }>) {
      equal(receipt.originalSha256, sha256(readFileSync(receipt.sourcePath)), `${receipt.name} original hash`); equal(receipt.adaptedSha256, sha256(readFileSync(receipt.adaptedPath)), `${receipt.name} adapted hash`); equal(receipt.resultSha256, sha256(readFileSync(receipt.resultPath)), `${receipt.name} result hash`); equal(receipt.exitCode, 0, `${receipt.name} exit`); equal(receipt.realProviderCalls, 0, `${receipt.name} providers`);
      const result: ReturnType<JSON["parse"]> = JSON.parse(readFileSync(receipt.resultPath, "utf8")); equal(result.status, "PASS", `${receipt.name} status`); if (receipt.name === "terra-workspace") { equal(result.realProviderCalls, undefined, "Terra historical provider field"); equal(result.capturedRequests, 18, "Terra deterministic requests"); equal(result.externalRequests, [], "Terra external requests"); } else equal(result.realProviderCalls, 0, `${receipt.name} result providers`); equal(receipt.execution, "REUSED_SAME_TURN_PASSING_RECEIPT_WITH_IDENTICAL_ORIGINAL_ADAPTED_AND_RESULT_HASHES", `${receipt.name} execution receipt`); for (const field of ["errors", "network", "forbidden", "externalRequests"]) if (Array.isArray(result[field])) equal(result[field], [], `${receipt.name} ${field}`);
    }
    equal(build.commands.map((command: { label: string }) => command.label), ["typescript", "focused-lint", "full-lint", "focused-build", "default-turbopack-build", "full-webpack-build-current", "full-webpack-build-base"], "build command names"); equal(build.commands.filter((command: { label: string }) => ["typescript", "focused-lint", "focused-build"].includes(command.label)).every((command: { status: string; exitCode: number }) => command.status === "PASS" && command.exitCode === 0), true, "passing required checks"); equal(build.commands.find((command: { label: string }) => command.label === "full-lint")?.status, "MEASURED_BASELINE", "full lint status"); equal(build.commands.find((command: { label: string }) => command.label === "default-turbopack-build")?.status, "OBSERVED_FAILURE", "default build command status"); equal(build.commands.filter((command: { label: string }) => command.label.startsWith("full-webpack-build-")).every((command: { status: string; exitCode: number }) => command.status === "BLOCKED_BY_VERIFIED_BASELINE" && command.exitCode !== 0), true, "baseline-blocked Webpack builds"); equal(build.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE", "full build receipt"); equal(build.defaultTurbopackBuild.status, "OBSERVED_FAILURE", "default build receipt"); equal(build.fullWebpackProductionBuild.diagnosticIdentical, true, "full build diagnostics"); equal(build.fullWebpackProductionBuild.blockedSourceByteIdenticalToBase, true, "full build source identity"); equal(build.fullWebpackProductionBuild.productionReadyClaim, false, "full build production claim"); equal(build.fullLint.inheritedErrorDiagnosticsEqual, true, "full lint baseline comparison"); equal(build.fullLint.focusedImplementationErrors, 0, "focused lint errors"); equal(build.network.denied, 0, "build network"); equal(build.providerRequests, 0, "build provider");
    equal(review.reviewUrl, "http://127.0.0.1:58420", "review URL receipt"); equal(review.process.mode, "NORMAL_NEXT_DEV_WEBPACK", "review mode receipt"); equal(review.process.productionReadyClaim, false, "review production claim"); equal(review.fixtureLifecycle.fixtureServerClosed, true, "review fixture closure"); equal(review.fixtureLifecycle.fixturePortClosed, true, "review fixture port"); equal(review.fixtureLifecycle.fixtureHostRemoved, true, "review fixture copy"); equal(review.fixtureLifecycle.fixtureRouteAbsent, true, "review fixture route"); equal(review.environment.copiedOnlyOpenAiApiKey, true, "review key-only env"); equal(review.environment.keyDisplayed, false, "review key privacy"); equal(review.environment.keyHashed, false, "review key hash privacy"); equal(review.ordinaryState, { homeUnread: 0, assistantUnread: 0 }, "review empty state"); equal(review.network.externalRequests, 0, "review external requests"); equal(review.network.providerRequests, 0, "review providers");
  }
}

const manifestBytes = readFileSync(manifestPath);
const manifestSha256 = sha256(manifestBytes);
const sidecar = readFileSync(resolve(outputRoot, "manifest.sha256"), "utf8").trim();
equal(sidecar, `${manifestSha256}  manifest.json`, "manifest sidecar");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest;
validate(manifest, true);

const receiptGraph: ReturnType<JSON["parse"]> = {
  oracle: JSON.parse(readFileSync(resolve(outputRoot, "oracle.json"), "utf8")),
  browser: JSON.parse(readFileSync(resolve(outputRoot, "browser-proof.json"), "utf8")),
  protectedResult: JSON.parse(readFileSync(resolve(outputRoot, "protected-regressions/result.json"), "utf8")),
  build: JSON.parse(readFileSync(resolve(outputRoot, "build/result.json"), "utf8")),
  review: JSON.parse(readFileSync(resolve(outputRoot, "review/review-setup.json"), "utf8")),
};
function validateReceiptGraph(graph: ReturnType<JSON["parse"]>) {
  for (const receipt of [graph.oracle, graph.browser, graph.protectedResult, graph.review]) equal(receipt.status, "PASS", "receipt graph status"); equal(graph.build.status, "BLOCKED_BY_VERIFIED_BASELINE", "receipt graph build status");
  equal(graph.oracle.activeVectors.length, 7, "receipt graph active vectors");
  equal(graph.browser.productionTriggers, { home: 1, assistant: 1, credits: 0, tutorials: 0, openProject: 0, myProjects: 0, export: 0, workspace: 0 }, "receipt graph bells");
  equal(graph.browser.providerRequests, 0, "receipt graph browser provider"); equal(graph.browser.networkRequests.external, 0, "receipt graph browser external");
  equal(graph.protectedResult.browserReceiptCount, 4, "receipt graph protected browser count"); equal(graph.protectedResult.browserReceipts.map((receipt: { name: string }) => receipt.name).sort(), ["assistant-dictation", "assistant-search-retry", "assistant-workflow", "terra-workspace"], "receipt graph protected browser names"); equal(graph.protectedResult.realProviderCalls, 0, "receipt graph protected providers");
  equal(graph.build.fullProductionBuild, "BLOCKED_BY_VERIFIED_BASELINE", "receipt graph full build"); equal(graph.build.fullWebpackProductionBuild.diagnosticIdentical, true, "receipt graph full build diagnostic"); equal(graph.build.fullWebpackProductionBuild.blockedSourceByteIdenticalToBase, true, "receipt graph full build source"); equal(graph.build.fullLint.inheritedErrorDiagnosticsEqual, true, "receipt graph lint baseline"); equal(graph.build.providerRequests, 0, "receipt graph build providers");
  equal(graph.review.process.mode, "NORMAL_NEXT_DEV_WEBPACK", "receipt graph review mode"); equal(graph.review.fixtureLifecycle, { fixtureServerClosed: true, fixturePortClosed: true, fixtureHostRemoved: true, fixtureRouteAbsent: true }, "receipt graph fixture lifecycle"); equal(graph.review.network.externalRequests, 0, "receipt graph review external"); equal(graph.review.network.providerRequests, 0, "receipt graph review providers");
}
validateReceiptGraph(receiptGraph);

const mutations: Array<[string, (candidate: Manifest) => void]> = [
  ["missing-path", candidate => { candidate.implementation.pop(); }],
  ["altered-source-hash", candidate => { candidate.implementation[0].sha256 = "0".repeat(64); }],
  ["missing-evidence", candidate => { candidate.evidence = candidate.evidence.filter((entry: { path: string }) => entry.path !== "browser-proof.json"); }],
  ["altered-evidence-hash", candidate => { candidate.evidence[0].sha256 = "f".repeat(64); }],
  ["missing-receipt", candidate => { candidate.receipts.names = candidate.receipts.names.filter((name: string) => name !== "storage-500-rows"); candidate.receipts.count -= 1; }],
  ["false-full-build-pass", candidate => { candidate.proofClaims.fullProductionBuild = "PASS"; }],
  ["false-native-zoom", candidate => { candidate.proofClaims.nativeBrowserZoom200 = "PASS"; }],
  ["false-native-focus", candidate => { candidate.proofClaims.nativeOsWindowFocus = "PASS"; }],
  ["false-provider", candidate => { candidate.networkAndProviders.providerRequests = 1; }],
  ["false-publication", candidate => { candidate.git.published = true; }],
  ["wrong-count", candidate => { candidate.exactCounts.productTriggers = 3; }],
  ["scope-expansion", candidate => { candidate.git.dirtyPaths.push("app/page.tsx"); }],
  ["hash-authentication-claim", candidate => { candidate.proofClaims.hashAuthenticationAgainstWriterRewrite = true; }],
];
const rejected: string[] = [];
for (const [name, mutate] of mutations) {
  const candidate = structuredClone(manifest); mutate(candidate);
  assert.throws(() => validate(candidate, true), Error, `mutation must reject: ${name}`);
  rejected.push(name);
}
for (const [name, mutate] of [
  ["receipt-false-pass", (graph: ReturnType<JSON["parse"]>) => { graph.browser.status = "FAIL"; }],
  ["receipt-false-full-build-pass", (graph: ReturnType<JSON["parse"]>) => { graph.build.status = "PASS"; graph.build.fullProductionBuild = "PASS"; }],
  ["receipt-missing-protected-browser", (graph: ReturnType<JSON["parse"]>) => { graph.protectedResult.browserReceipts.pop(); graph.protectedResult.browserReceiptCount = 3; }],
  ["receipt-provider-claim", (graph: ReturnType<JSON["parse"]>) => { graph.protectedResult.realProviderCalls = 1; }],
  ["receipt-lifecycle-claim", (graph: ReturnType<JSON["parse"]>) => { graph.review.fixtureLifecycle.fixturePortClosed = false; }],
] as const) {
  const candidate = structuredClone(receiptGraph); mutate(candidate); assert.throws(() => validateReceiptGraph(candidate), Error, `receipt mutation must reject: ${name}`); rejected.push(name);
}

const result = { schema: "spec0014-phase1-proof-validation/v1", status: "PASS", manifestSha256, implementationPaths: 19, evidenceFiles: manifest.evidence.length, receipts: manifest.receipts.count, mutationRejections: rejected, indexEmpty: true, dirtyAllowlistExact: true };
writeFileSync(resolve(outputRoot, "validation.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`SPEC-0014 Phase 1 manifest VALID ${manifestSha256} (${rejected.length} mutations rejected)\n`);
