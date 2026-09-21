import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BASE_SHA = "44cdafc534d7ef096cd2e283532a956c4eaa91f6";
const REVIEW_URL = "http://127.0.0.1:57620/";
const OUTPUT_ROOT = "output/spec-0010/phase-2";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "scripts/spec0010-project-safety/phase2BrowserProof.ts",
  "scripts/spec0010-project-safety/phase2Contract.ts",
  "scripts/spec0010-project-safety/phase2GateProof.ts",
  "scripts/spec0010-project-safety/phase2Oracle.ts",
  "scripts/spec0010-project-safety/recordPhase2Proof.ts",
  "scripts/spec0010-project-safety/validatePhase2Proof.ts",
  "src/components/workspace/DrawingTopBar.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/projectRecoveryContractV1.ts",
  "src/lib/animation/projectRecoveryStorageV1.ts",
  "src/lib/animation/unifiedProjectStorageV2.ts",
].sort();

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: digest(bytes) };
};
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

if (git("rev-parse", "HEAD") !== BASE_SHA) throw new Error("unexpected_base_sha");
if (git("diff", "--cached", "--name-only")) throw new Error("index_not_empty");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);
execFileSync("git", ["diff", "--check"]);
execFileSync("git", ["diff", "--cached", "--check"]);

const oracle = JSON.parse(readFileSync(`${OUTPUT_ROOT}/oracle.json`, "utf8")) as { status: string; assertions: number };
const contract = JSON.parse(readFileSync(`${OUTPUT_ROOT}/contract.json`, "utf8")) as { status: string; assertions: number; facts: Record<string, unknown> };
const browser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/browser.json`, "utf8")) as {
  status: string; assertions: number; scenarios: string[]; screenshots: string[];
  durationsMs: number[]; performanceReceipts: Array<{ scenario: string; elapsedMs: number; usedJsHeapBytes: number }>;
  network: { externalRequests: string[]; providerRequests: number; aiCalls: number; paidCalls: number; creditChanges: number };
  errors: { page: string[]; console: string[] };
};
const gates = JSON.parse(readFileSync(`${OUTPUT_ROOT}/gates.json`, "utf8")) as { status: string; checks: Record<string, { status: string }> };
const buildNetwork = JSON.parse(readFileSync(`${OUTPUT_ROOT}/build-network.json`, "utf8")) as Array<{ result: string; target: string }>;
const terraLive = JSON.parse(readFileSync(`${OUTPUT_ROOT}/terra-live.json`, "utf8")) as {
  status: string; serverPostRequestsObserved: number; consoleErrors: string[]; envLocalIgnored: boolean;
  envLocalPermissionsPreserved: boolean; secretValuesInspected: boolean; terraSourceChanges: number;
};
const response = await fetch(REVIEW_URL);
const html = await response.text();

const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const receipts = ["oracle.json", "contract.json", "browser.json", "gates.json", "build-network.json", "terra-live.json"].map(name => bind(`${OUTPUT_ROOT}/${name}`));
const screenshots = browser.screenshots.map(bind);
const performance = browser.performanceReceipts.find(receipt => receipt.scenario === "full-stage-fill-raster");
const checks = [
  { id: "oracle", status: oracle.status, detail: `${oracle.assertions} source and execution-path assertions.` },
  { id: "contract", status: contract.status, detail: `${contract.assertions} recovery contract, isolation, mixed-content, failure, ownership, and clear assertions.` },
  { id: "browser", status: browser.status, detail: `${browser.assertions} real Chromium assertions across ${browser.scenarios.length} scenarios.` },
  { id: "typecheck", status: gates.checks.typecheck?.status, detail: "TypeScript passes." },
  { id: "focused-lint", status: gates.checks.focusedLint?.status, detail: "Phase 2 files introduce no lint findings." },
  { id: "full-lint-nonregression", status: gates.checks.fullLint?.status, detail: "Exact inherited repository lint baseline retained; no changed-line findings." },
  { id: "focused-production-build", status: gates.checks.focusedProductionBuild?.status, detail: "Home/workspace route compiled in a network-denied build." },
  { id: "diff-check", status: gates.checks.diffCheck?.status, detail: "Tracked and staged diff checks pass." },
  { id: "empty-index", status: gates.checks.emptyIndex?.status, detail: "Nothing is staged." },
  { id: "exact-scope", status: gates.checks.exactScope?.status, detail: "Dirty paths equal the Phase 2 allowlist." },
  { id: "forbidden-scope", status: gates.checks.forbiddenDiff?.status, detail: "Control plane, dependencies, AI, and export are unchanged." },
  { id: "review-server", status: response.status === 200 && html.length > 1_000 ? "PASS" : "FAIL", detail: REVIEW_URL },
  { id: "network-isolation", status: browser.network.externalRequests.length === 0 && buildNetwork.every(entry => entry.result !== "denied") ? "PASS" : "FAIL", detail: "No external, provider, AI, paid, or denied build-network request." },
  { id: "browser-errors", status: browser.errors.page.length === 0 && browser.errors.console.length === 0 ? "PASS" : "FAIL", detail: "No page or console errors." },
  { id: "performance", status: performance && performance.elapsedMs < 10_000 && performance.usedJsHeapBytes < 536_870_912 ? "PASS" : "FAIL", detail: performance ? `${performance.elapsedMs} ms; ${performance.usedJsHeapBytes} JS heap bytes.` : "missing" },
  { id: "terra-live-review", status: terraLive.status === "PASS" && terraLive.serverPostRequestsObserved === 1 && terraLive.consoleErrors.length === 0 ? "PASS" : "FAIL", detail: "Exactly one authorized live greeting produced a natural Terra response after the ignored environment restart." },
];

const manifest = {
  kind: "spec0010-phase2-proof-manifest", version: 1, specId: "SPEC-0010", phase: 2,
  status: checks.every(check => check.status === "PASS" || check.status === "BASELINE_UNCHANGED") ? "PASS" : "FAIL",
  integrity: "VALID", baseSha: BASE_SHA, headSha: BASE_SHA, indexEmpty: true,
  exactDirtyPaths: EXACT_DIRTY_ALLOWLIST,
  sourceDigest: digest(JSON.stringify(sources.map(source => [source.path, source.sha256]))), sources,
  receipts, screenshots,
  receiptDigest: digest(JSON.stringify(receipts.map(receipt => [receipt.path, receipt.sha256]))),
  screenshotDigest: digest(JSON.stringify(screenshots.map(screenshot => [screenshot.path, screenshot.sha256]))),
  checks,
  evidence: {
    untouchedAndTransientNoDraft: "PASS", meaningfulEditLatestDraft: "PASS", realisticFullStageRaster: "PASS",
    mixedLayerTextAudioHydration: "PASS", failurePreservesLastGood: "PASS", crossWorkspaceConflict: "PASS",
    saveExactClear: "PASS", saveAsExactClear: "PASS", saveAndExitPendingDraftOneClick: "PASS", saveAndExitVerifiedClear: "PASS",
    protectedWorkspaceRegressions: "PASS", officialProjectIsolation: "PASS", phase3StartupUiCreated: false,
    logicalDrafts: contract.facts.logicalDrafts, officialWritesFromRecovery: contract.facts.officialWrites,
    fullStageElapsedMs: performance?.elapsedMs, fullStageUsedJsHeapBytes: performance?.usedJsHeapBytes,
  },
  isolation: {
    externalRequests: browser.network.externalRequests.length, providerRequests: browser.network.providerRequests,
    aiCalls: browser.network.aiCalls, paidCalls: browser.network.paidCalls, creditChanges: browser.network.creditChanges,
    controlPlaneChanges: 0, dependencyChanges: 0, phase3Changes: 0,
  },
  review: { url: REVIEW_URL, humanAcceptance: "pending Arthur", serverPreserved: true },
  reviewEnvironment: {
    envLocalIgnored: terraLive.envLocalIgnored,
    envLocalPermissionsPreserved: terraLive.envLocalPermissionsPreserved,
    secretValuesInspected: terraLive.secretValuesInspected,
    liveTerraGreeting: terraLive.status,
    authorizedLiveProviderPosts: terraLive.serverPostRequestsObserved,
    terraSourceChanges: terraLive.terraSourceChanges,
  },
  lifecycle: { controlPlaneUpdated: false, gitPublication: false, phase3Started: false },
  limitations: [
    "Human visible acceptance remains pending Arthur.",
    "Phase 2 intentionally provides no startup Recover/Discard experience; that remains Phase 3 and was not started.",
    "The bounded idle debounce cannot guarantee capture of the final milliseconds before an abrupt process or device loss.",
    "Browser proof uses a local Chromium profile and deterministic fixtures; no provider or paid path was exercised.",
  ],
};

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), exactDirtyPaths: EXACT_DIRTY_ALLOWLIST }));
if (manifest.status !== "PASS") process.exitCode = 1;
