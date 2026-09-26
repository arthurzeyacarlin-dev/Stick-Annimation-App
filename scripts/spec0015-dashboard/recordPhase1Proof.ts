import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "1c45a016da73e86356ed65720209181468bad37d";
const allowed = [
  "app/credits/page.tsx",
  "scripts/fixtures/spec0015-dashboard/phase1.json",
  "scripts/spec0015-dashboard/phase1BrowserProof.ts",
  "scripts/spec0015-dashboard/phase1BuildProof.ts",
  "scripts/spec0015-dashboard/phase1Oracle.ts",
  "scripts/spec0015-dashboard/phase1ProtectedRegressions.ts",
  "scripts/spec0015-dashboard/recordPhase1Proof.ts",
  "scripts/spec0015-dashboard/validatePhase1Proof.ts",
  "src/components/ai-dashboard/AiDashboard.module.css",
  "src/components/ai-dashboard/AiDashboardScreen.tsx",
  "src/components/ai-dashboard/AiUsageChart.tsx",
  "src/lib/ai-dashboard/dashboardAggregation.ts",
  "src/lib/ai-dashboard/dashboardContract.ts",
  "src/lib/ai-dashboard/dashboardSources.ts",
].sort();
const output = resolve("output/spec0015/phase1");
const excluded = new Set(["proof-manifest.json", "proof-manifest.sha256", "validation.json"]);
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const dirty = () => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" })
  .split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
type FileRecord = { path: string; bytes: number; sha256: string };
function evidenceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, `proof symlink: ${path}`);
    return stat.isDirectory() ? evidenceFiles(path) : stat.isFile() ? [path] : [];
  });
}
function record(path: string, root = process.cwd()): FileRecord {
  const bytes = readFileSync(resolve(root, path));
  assert.ok(bytes.length > 0, `empty proof file: ${path}`);
  return { path, bytes: bytes.length, sha256: sha(bytes) };
}
const json = <T>(path: string) => JSON.parse(readFileSync(resolve(output, path), "utf8")) as T;
mkdirSync(output, { recursive: true });
assert.equal(git("rev-parse", "HEAD"), base);
assert.equal(git("branch", "--show-current"), "", "executor stays detached");
assert.equal(git("diff", "--cached", "--name-only"), "", "index must remain empty");
assert.deepEqual(dirty(), allowed, "dirty paths equal exact phase allowlist");
git("diff", "--check");
const oracle = json<{ pass: boolean; checks: number }>("oracle.json");
const browser = json<{ pass: boolean; assertions: number; attemptedExternal: unknown[]; pageErrors: unknown[]; consoleErrors: unknown[];
  activeIntervals: { fixtureReceipts: number; quarter: number; minute: number; hour: number; day: number; week: number;
    resetStart: number; noPublicDemo: boolean; noDashboardDownload: boolean };
  presentation: { hoverOnVisibleBarOnly: boolean; whiteBarOutline: boolean; popupInsidePlot: boolean; mouseLeaveClears: boolean;
    desktopClickDoesNotPin: boolean; keyboardNamesAndFocus: boolean; touchToggle: boolean; noUnderChartDetail: boolean;
    mobileAndZoom: boolean; intervalSpendComparison: boolean };
  performance: { terraLedgers: number; refreshMs: number; filterMs: number }; partial: Record<string, boolean>; deletionRestoresEmpty: boolean }>("browser.json");
const protectedResult = json<{ status: string; protectedRuntime: { status: string; paths: number; aggregateSha256: string };
  ordinaryFlows: { assertionCount: number; assistantPosts: number; terraPosts: number; dashboardIntegration: { combinedDashboard: number; projectDashboard: number; assistantDashboard: number; hostedSearchCalls: number } };
  localExport: { status: string; assertions: number; mp4: { bytes: number; sha256: string }; isolation: { externalRequests: number; aiProviderCalls: number; paidCalls: number; creditChanges: number; repositoryWrites: number } };
  network: { realProviderCalls: number; paidCalls: number; externalRequests: unknown[] } }>("protected/protected.json");
const build = json<{ status: string; focusedBuild: string; fullLint: { inheritedDiagnosticsEqual: boolean; changedPathErrors: number };
  fullBuild: { status: string; diagnosticIdentical: boolean; blockerByteIdentical: boolean; productionReady: boolean };
  network: { denied: number; providerCalls: number } }>("build/build.json");
assert.equal(oracle.pass, true);
assert.ok(oracle.checks >= 72);
assert.equal(browser.pass, true);
assert.ok(browser.assertions >= 52);
assert.deepEqual(browser.attemptedExternal, []);
assert.deepEqual(browser.pageErrors, []);
assert.deepEqual(browser.consoleErrors, []);
assert.deepEqual(browser.activeIntervals, { fixtureReceipts: 17, quarter: 16, minute: 1, hour: 7, day: 2, week: 2,
  resetStart: Date.parse("2026-09-21T00:00:00Z"), noPublicDemo: true, noDashboardDownload: true });
assert.deepEqual(browser.presentation, { hoverOnVisibleBarOnly: true, whiteBarOutline: true, popupInsidePlot: true,
  mouseLeaveClears: true, desktopClickDoesNotPin: true, keyboardNamesAndFocus: true, touchToggle: true,
  noUnderChartDetail: true, mobileAndZoom: true, intervalSpendComparison: true });
assert.ok(browser.performance.terraLedgers >= 101 && browser.performance.refreshMs < 2000 && browser.performance.filterMs < 200);
assert.ok(Object.values(browser.partial).every(Boolean) && browser.deletionRestoresEmpty);
assert.equal(protectedResult.status, "PASS");
assert.equal(protectedResult.protectedRuntime.status, "BYTE_IDENTICAL");
assert.ok(protectedResult.protectedRuntime.paths >= 28 && protectedResult.ordinaryFlows.assertionCount >= 48);
assert.equal(protectedResult.ordinaryFlows.assistantPosts, 10);
assert.equal(protectedResult.ordinaryFlows.dashboardIntegration.hostedSearchCalls, 1);
assert.equal(protectedResult.localExport.status, "PASS");
assert.deepEqual(protectedResult.localExport.isolation, { externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0 });
assert.equal(sha(readFileSync(resolve(output, "protected/export/mp4/phase3-original-720.mp4"))), protectedResult.localExport.mp4.sha256);
assert.ok(protectedResult.localExport.mp4.bytes > 0);
assert.deepEqual(protectedResult.network, { realProviderCalls: 0, paidCalls: 0, externalRequests: [] });
assert.equal(protectedResult.ordinaryFlows.dashboardIntegration.combinedDashboard,
  protectedResult.ordinaryFlows.dashboardIntegration.projectDashboard + protectedResult.ordinaryFlows.dashboardIntegration.assistantDashboard);
assert.equal(json<{ fixtureReceipts: number }>("oracle.json").fixtureReceipts, 17);
assert.equal(build.status, "PASS");
assert.equal(build.focusedBuild, "PASS");
assert.deepEqual(build.fullLint, { ...build.fullLint, inheritedDiagnosticsEqual: true, changedPathErrors: 0 });
assert.equal(build.fullBuild.status, "BLOCKED_BY_VERIFIED_BASELINE");
assert.equal(build.fullBuild.diagnosticIdentical && build.fullBuild.blockerByteIdentical, true);
assert.equal(build.fullBuild.productionReady, false);
assert.deepEqual(build.network, { ...build.network, denied: 0, providerCalls: 0 });

const requiredScreens = ["desktop-dashboard.png", "desktop-chart.png", "desktop-project-chart.png", "desktop-assistant-chart.png",
  "desktop-hover-first.png", "desktop-hover-decrease.png", "desktop-hover-increase.png", "desktop-hover-reset.png",
  "desktop-hover-right-edge.png", "mobile-tap-tooltip.png", "zoom-200-hover.png",
  "mobile-dashboard.png", "mobile-320-dashboard.png", "mobile-partial.png", "mobile-real-receipts.png", "tablet-dashboard.png", "zoom-200-dashboard.png",
  "protected/dashboard-after-ordinary-ai.png", "protected/export/final-review.png"];
const evidence = evidenceFiles(output).map((path) => path.slice(output.length + 1)).filter((path) => !excluded.has(path)).sort().map((path) => record(path, output));
for (const path of ["oracle.json", "browser.json", "protected/protected.json", "protected/result.json", "protected/export/browser.json",
  "protected/export/mp4/phase3-original-720.mp4", "build/build.json", ...requiredScreens]) {
  assert.ok(evidence.some((file) => file.path === path), `missing evidence: ${path}`);
}
const listen = execFileSync("lsof", ["-nP", "-iTCP:58525", "-sTCP:LISTEN"], { encoding: "utf8" }).trim().split("\n");
assert.equal(listen.length, 2, "one loopback review listener");
const pid = Number(listen[1].trim().split(/\s+/)[1]);
assert.ok(Number.isSafeInteger(pid) && pid > 0);
const cwd = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd"], { encoding: "utf8" });
assert.ok(cwd.includes(process.cwd()), "review server cwd must match executor worktree");
const manifest = {
  schema: "spec0015-phase1-proof-manifest/v1", recordedAt: new Date().toISOString(),
  identity: { base, head: base, branch: "", detached: true, worktree: process.cwd(), role: "Spec Executor" },
  git: { dirtyPaths: allowed, indexEmpty: true, stagedPaths: [], diffCheck: "PASS", committed: false, merged: false, pushed: false, published: false },
  implementation: allowed.map((path) => record(path)), evidence,
  receipts: { oracleChecks: oracle.checks, browserAssertions: browser.assertions,
    protectedBrowserAssertions: protectedResult.ordinaryFlows.assertionCount, protectedOwnerPaths: protectedResult.protectedRuntime.paths,
    assistantMockPosts: protectedResult.ordinaryFlows.assistantPosts, projectMockPosts: protectedResult.ordinaryFlows.terraPosts,
    corpusRefreshMs: browser.performance.refreshMs, corpusFilterMs: browser.performance.filterMs,
    localMp4Bytes: protectedResult.localExport.mp4.bytes, localMp4Sha256: protectedResult.localExport.mp4.sha256 },
  network: { externalBrowserRequests: 0, buildDeniedRequests: 0, realProviderCalls: 0, paidCalls: 0 },
  build: { focused: "PASS", full: "BLOCKED_BY_VERIFIED_BASELINE", baselineDiagnosticIdentical: true, productionReady: false },
  ownerCorrection: { activeQuarterIntervals: 16, fixtureReceipts: 17, publicDemoRemoved: true,
    dashboardOnlyHomeLinkRemoved: true, dashboardDownloadAbsent: true, ordinaryExportUntouched: true,
    hoverOnlyBarDetails: true, noPersistentDesktopDetail: true, keyboardAndTouchDetails: true,
    idleClockNoNewBars: true, mondayResetSmallBlue: true,
    canonicalSpecReconciliationPendingCPA: true },
  review: { url: "http://127.0.0.1:58525/credits", port: 58525, pid, cwd: process.cwd(), serverActive: true },
  boundaries: { dashboardOnly: true, realReceiptsDefault: true, publicDemoAbsent: true, displayOnlyPreview: true,
    noAiAdmissionChange: true, noSourceWritesFromDashboard: true, noNotificationOwnerChange: true, noExportChange: true,
    noCanonicalDocsChange: true, noProviderRouteChange: true, noFinancialIntegration: true },
};
const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(resolve(output, "proof-manifest.json"), bytes);
const digest = sha(bytes);
writeFileSync(resolve(output, "proof-manifest.sha256"), `${digest}  proof-manifest.json\n`);
console.log(`SPEC-0015 Phase 1 proof manifest SHA-256 ${digest}`);
