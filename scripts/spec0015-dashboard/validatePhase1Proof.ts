import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "1c45a016da73e86356ed65720209181468bad37d";
const allowed = [
  "app/credits/page.tsx", "scripts/fixtures/spec0015-dashboard/phase1.json",
  "scripts/spec0015-dashboard/phase1BrowserProof.ts", "scripts/spec0015-dashboard/phase1BuildProof.ts",
  "scripts/spec0015-dashboard/phase1Oracle.ts", "scripts/spec0015-dashboard/phase1ProtectedRegressions.ts",
  "scripts/spec0015-dashboard/recordPhase1Proof.ts", "scripts/spec0015-dashboard/validatePhase1Proof.ts",
  "src/components/ai-dashboard/AiDashboard.module.css", "src/components/ai-dashboard/AiDashboardScreen.tsx",
  "src/components/ai-dashboard/AiUsageChart.tsx", "src/lib/ai-dashboard/dashboardAggregation.ts",
  "src/lib/ai-dashboard/dashboardContract.ts", "src/lib/ai-dashboard/dashboardSources.ts",
].sort();
const output = resolve("output/spec0015/phase1");
const manifestPath = resolve(output, "proof-manifest.json");
const excluded = new Set(["proof-manifest.json", "proof-manifest.sha256", "validation.json"]);
const required = ["oracle.json", "browser.json", "protected/protected.json", "protected/result.json", "build/build.json",
  "desktop-dashboard.png", "desktop-chart.png", "desktop-project-chart.png", "desktop-assistant-chart.png",
  "desktop-hover-first.png", "desktop-hover-decrease.png", "desktop-hover-increase.png", "desktop-hover-reset.png",
  "desktop-hover-right-edge.png", "mobile-tap-tooltip.png", "zoom-200-hover.png",
  "mobile-dashboard.png", "mobile-320-dashboard.png", "mobile-partial.png", "mobile-real-receipts.png", "zoom-200-dashboard.png",
  "tablet-dashboard.png", "protected/dashboard-after-ordinary-ai.png", "protected/export/final-review.png",
  "protected/export/browser.json", "protected/export/mp4/phase3-original-720.mp4"];
type FileRecord = { path: string; bytes: number; sha256: string };
type Manifest = {
  schema: string;
  identity: { base: string; head: string; branch: string; detached: boolean; worktree: string; role: string };
  git: { dirtyPaths: string[]; indexEmpty: boolean; stagedPaths: string[]; diffCheck: string; committed: boolean; merged: boolean; pushed: boolean; published: boolean };
  implementation: FileRecord[]; evidence: FileRecord[];
  receipts: { oracleChecks: number; browserAssertions: number; protectedBrowserAssertions: number; protectedOwnerPaths: number;
    assistantMockPosts: number; projectMockPosts: number; corpusRefreshMs: number; corpusFilterMs: number;
    localMp4Bytes: number; localMp4Sha256: string };
  network: { externalBrowserRequests: number; buildDeniedRequests: number; realProviderCalls: number; paidCalls: number };
  build: { focused: string; full: string; baselineDiagnosticIdentical: boolean; productionReady: boolean };
  ownerCorrection: { activeQuarterIntervals: number; fixtureReceipts: number; publicDemoRemoved: boolean;
    dashboardOnlyHomeLinkRemoved: boolean; dashboardDownloadAbsent: boolean; ordinaryExportUntouched: boolean;
    hoverOnlyBarDetails: boolean; noPersistentDesktopDetail: boolean; keyboardAndTouchDetails: boolean;
    idleClockNoNewBars: boolean; mondayResetSmallBlue: boolean;
    canonicalSpecReconciliationPendingCPA: boolean };
  review: { url: string; port: number; pid: number; cwd: string; serverActive: boolean };
  boundaries: Record<string, boolean>;
};
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const dirty = () => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" })
  .split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
function evidenceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, `proof symlink: ${path}`);
    return stat.isDirectory() ? evidenceFiles(path) : stat.isFile() ? [path] : [];
  });
}
function validate(manifest: Manifest, checkFiles: boolean) {
  assert.equal(manifest.schema, "spec0015-phase1-proof-manifest/v1");
  assert.deepEqual(manifest.identity, { base, head: base, branch: "", detached: true, worktree: process.cwd(), role: "Spec Executor" });
  assert.deepEqual(manifest.git, { dirtyPaths: allowed, indexEmpty: true, stagedPaths: [], diffCheck: "PASS",
    committed: false, merged: false, pushed: false, published: false });
  assert.deepEqual(manifest.implementation.map((item) => item.path).sort(), allowed);
  assert.equal(manifest.implementation.length, 14);
  assert.equal(new Set(manifest.implementation.map((item) => item.path)).size, 14);
  assert.equal(new Set(manifest.evidence.map((item) => item.path)).size, manifest.evidence.length);
  for (const item of [...manifest.implementation, ...manifest.evidence]) {
    assert.ok(item.bytes > 0);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
  }
  for (const path of required) assert.ok(manifest.evidence.some((item) => item.path === path), `missing screenshot or receipt: ${path}`);
  assert.ok(manifest.receipts.oracleChecks >= 72 && manifest.receipts.browserAssertions >= 52 && manifest.receipts.protectedBrowserAssertions >= 48);
  assert.ok(manifest.receipts.protectedOwnerPaths >= 28);
  assert.equal(manifest.receipts.assistantMockPosts, 10);
  assert.equal(manifest.receipts.projectMockPosts, 7);
  assert.ok(manifest.receipts.corpusRefreshMs < 2000 && manifest.receipts.corpusFilterMs < 200);
  assert.ok(manifest.receipts.localMp4Bytes > 0);
  assert.match(manifest.receipts.localMp4Sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.network, { externalBrowserRequests: 0, buildDeniedRequests: 0, realProviderCalls: 0, paidCalls: 0 });
  assert.deepEqual(manifest.build, { focused: "PASS", full: "BLOCKED_BY_VERIFIED_BASELINE", baselineDiagnosticIdentical: true, productionReady: false });
  assert.deepEqual(manifest.ownerCorrection, { activeQuarterIntervals: 16, fixtureReceipts: 17, publicDemoRemoved: true,
    dashboardOnlyHomeLinkRemoved: true, dashboardDownloadAbsent: true, ordinaryExportUntouched: true,
    hoverOnlyBarDetails: true, noPersistentDesktopDetail: true, keyboardAndTouchDetails: true,
    idleClockNoNewBars: true, mondayResetSmallBlue: true,
    canonicalSpecReconciliationPendingCPA: true });
  assert.equal(manifest.review.url, "http://127.0.0.1:58525/credits");
  assert.equal(manifest.review.port, 58525);
  assert.equal(manifest.review.cwd, process.cwd());
  assert.ok(manifest.review.pid > 0 && manifest.review.serverActive);
  assert.deepEqual(manifest.boundaries, { dashboardOnly: true, realReceiptsDefault: true, publicDemoAbsent: true, displayOnlyPreview: true,
    noAiAdmissionChange: true, noSourceWritesFromDashboard: true, noNotificationOwnerChange: true, noExportChange: true,
    noCanonicalDocsChange: true, noProviderRouteChange: true, noFinancialIntegration: true });
  if (!checkFiles) return;
  assert.equal(git("rev-parse", "HEAD"), base);
  assert.equal(git("branch", "--show-current"), "");
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.deepEqual(dirty(), allowed);
  git("diff", "--check");
  for (const item of manifest.implementation) {
    const bytes = readFileSync(item.path);
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(sha(bytes), item.sha256, item.path);
  }
  const actualEvidence = evidenceFiles(output).map((path) => path.slice(output.length + 1)).filter((path) => !excluded.has(path)).sort();
  assert.deepEqual(manifest.evidence.map((item) => item.path).sort(), actualEvidence);
  for (const item of manifest.evidence) {
    const bytes = readFileSync(resolve(output, item.path));
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(sha(bytes), item.sha256, item.path);
  }
  const sidecar = readFileSync(resolve(output, "proof-manifest.sha256"), "utf8").trim().split(/\s+/)[0];
  assert.equal(sidecar, sha(readFileSync(manifestPath)));
  const browser = JSON.parse(readFileSync(resolve(output, "browser.json"), "utf8"));
  const oracle = JSON.parse(readFileSync(resolve(output, "oracle.json"), "utf8"));
  const protectedResult = JSON.parse(readFileSync(resolve(output, "protected/protected.json"), "utf8"));
  const build = JSON.parse(readFileSync(resolve(output, "build/build.json"), "utf8"));
  assert.equal(browser.pass && oracle.pass, true);
  assert.deepEqual(browser.attemptedExternal, []);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.consoleErrors, []);
  assert.deepEqual(browser.activeIntervals, { fixtureReceipts: 17, quarter: 16, minute: 1, hour: 7, day: 2, week: 2,
    resetStart: Date.parse("2026-09-21T00:00:00Z"), noPublicDemo: true, noDashboardDownload: true });
  assert.deepEqual(browser.presentation, { hoverOnVisibleBarOnly: true, whiteBarOutline: true, popupInsidePlot: true,
    mouseLeaveClears: true, desktopClickDoesNotPin: true, keyboardNamesAndFocus: true, touchToggle: true,
    noUnderChartDetail: true, mobileAndZoom: true, intervalSpendComparison: true });
  assert.deepEqual(protectedResult.network, { realProviderCalls: 0, paidCalls: 0, externalRequests: [] });
  assert.equal(protectedResult.protectedRuntime.status, "BYTE_IDENTICAL");
  assert.equal(protectedResult.localExport.status, "PASS");
  assert.deepEqual(protectedResult.localExport.isolation, { externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0 });
  assert.equal(manifest.receipts.localMp4Sha256, sha(readFileSync(resolve(output, "protected/export/mp4/phase3-original-720.mp4"))));
  assert.equal(manifest.receipts.localMp4Bytes, protectedResult.localExport.mp4.bytes);
  assert.equal(build.status, "PASS");
  assert.equal(build.fullBuild.status, "BLOCKED_BY_VERIFIED_BASELINE");
  assert.equal(build.fullBuild.diagnosticIdentical && build.fullBuild.blockerByteIdentical, true);
  assert.equal(build.network.denied, 0);
  assert.equal(manifest.receipts.oracleChecks, oracle.checks);
  assert.equal(manifest.receipts.browserAssertions, browser.assertions);
  assert.equal(manifest.receipts.protectedBrowserAssertions, protectedResult.ordinaryFlows.assertionCount);
  assert.equal(manifest.receipts.corpusRefreshMs, browser.performance.refreshMs);
  const listen = execFileSync("lsof", ["-nP", "-iTCP:58525", "-sTCP:LISTEN"], { encoding: "utf8" });
  assert.ok(listen.includes(` ${manifest.review.pid} `) && listen.includes("127.0.0.1:58525"));
  const cwd = execFileSync("lsof", ["-a", "-p", String(manifest.review.pid), "-d", "cwd"], { encoding: "utf8" });
  assert.ok(cwd.includes(process.cwd()));
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
validate(manifest, true);
const mutations: Array<[string, (value: Manifest) => void]> = [
  ["source bytes", (value) => { value.implementation.find((item) => item.path === "app/credits/page.tsx")!.sha256 = "wrong"; }],
  ["fixture hash", (value) => { value.implementation.find((item) => item.path.endsWith("phase1.json"))!.sha256 = "wrong"; }],
  ["missing screenshot", (value) => { value.evidence = value.evidence.filter((item) => item.path !== "desktop-project-chart.png"); }],
  ["unlisted dirty path", (value) => { value.git.dirtyPaths.push("docs/CURRENT_STATE.md"); }],
  ["external request", (value) => { value.network.externalBrowserRequests = 1; }],
  ["real provider call", (value) => { value.network.realProviderCalls = 1; }],
  ["paid call", (value) => { value.network.paidCalls = 1; }],
  ["false production readiness", (value) => { value.build.productionReady = true; }],
  ["public Demo regression", (value) => { value.ownerCorrection.publicDemoRemoved = false; }],
  ["scope leakage", (value) => { value.boundaries.noNotificationOwnerChange = false; }],
];
const rejected: string[] = [];
if (process.argv.includes("--self-test")) {
  for (const [name, mutate] of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validate(candidate, false), `validator must reject ${name}`);
    rejected.push(name);
  }
}
const result = { schema: "spec0015-phase1-validation/v1", status: "PASS", manifestSha256: sha(readFileSync(manifestPath)),
  implementationPaths: allowed.length, evidenceFiles: manifest.evidence.length, dirtyAllowlistExact: true, indexEmpty: true,
  mutationsRejected: rejected.length, mutations: rejected };
writeFileSync(resolve(output, "validation.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`SPEC-0015 Phase 1 proof validation PASS (${rejected.length} negative mutations rejected)`);
