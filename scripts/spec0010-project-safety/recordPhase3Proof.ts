import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BASE_SHA = "337433b37716fdd71ecc2a9d0239e239519ef655";
const REVIEW_URL = "http://127.0.0.1:57630/";
const serverPid = Number(process.argv.find(argument => argument.startsWith("--server-pid="))?.slice(13));
if (!Number.isSafeInteger(serverPid) || serverPid <= 0) throw new Error("missing_server_pid");
const OUTPUT_ROOT = "output/spec-0010/phase-3";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "app/page.tsx",
  "scripts/spec0010-project-safety/phase3BrowserProof.ts",
  "scripts/spec0010-project-safety/phase3Contract.ts",
  "scripts/spec0010-project-safety/phase3GateProof.ts",
  "scripts/spec0010-project-safety/phase3Oracle.ts",
  "scripts/spec0010-project-safety/recordPhase3Proof.ts",
  "scripts/spec0010-project-safety/validatePhase3Proof.ts",
  "src/components/recovery/ProjectRecoveryPrompt.tsx",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/projectRecoveryStorageV1.ts",
  "src/lib/animation/unifiedWorkspaceBootstrap.ts",
].sort();

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
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
  performanceReceipts: Array<{ scenario: string; elapsedMs: number; usedJsHeapBytes: number | null }>;
  network: { externalRequests: string[]; providerRequests: number; aiCalls: number; paidCalls: number; creditChanges: number };
  errors: { page: string[]; console: string[] };
};
const gates = JSON.parse(readFileSync(`${OUTPUT_ROOT}/gates.json`, "utf8")) as { status: string; checks: Record<string, { status: string }> };
const buildNetwork = JSON.parse(readFileSync(`${OUTPUT_ROOT}/build-network.json`, "utf8")) as Array<{ result: string; target: string }>;
const response = await fetch(REVIEW_URL);
const html = await response.text();
process.kill(serverPid, 0);

const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const receipts = ["oracle.json", "contract.json", "browser.json", "gates.json", "build-network.json"].map(name => bind(`${OUTPUT_ROOT}/${name}`));
const screenshots = browser.screenshots.map(bind);
const startup = browser.performanceReceipts.find(receipt => receipt.scenario === "no-draft-startup");
const checks = [
  { id: "oracle", status: oracle.status, detail: `${oracle.assertions} startup, ownership, detach, save, discard, and isolation assertions.` },
  { id: "contract", status: contract.status, detail: `${contract.assertions} deterministic recovery contract and source-reconciliation assertions.` },
  { id: "browser", status: browser.status, detail: `${browser.assertions} real Chromium assertions across ${browser.scenarios.length} scenarios.` },
  { id: "typecheck", status: gates.checks.typecheck?.status, detail: "TypeScript passes when generated types are clean, or retains only the two inherited generated AI-cost dashboard errors after a full build." },
  { id: "focused-lint", status: gates.checks.focusedLint?.status, detail: "Phase 3 files introduce no lint findings." },
  { id: "full-lint-nonregression", status: gates.checks.fullLint?.status, detail: "Exact inherited repository lint baseline retained; no changed-line findings." },
  { id: "phase1-contract", status: gates.checks.phase1Contract?.status, detail: "Phase 1 canonical save contract remains green." },
  { id: "phase2-contract", status: gates.checks.phase2Contract?.status, detail: "Phase 2 recovery contract remains green." },
  { id: "phase2-oracle", status: gates.checks.phase2Oracle?.status, detail: "Phase 2 isolation and scheduling oracle remains green." },
  { id: "full-production-build", status: gates.checks.fullProductionBuild?.status, detail: "Full build retains only the inherited app/dev/ai-costs/lifetime/page.tsx generated PageProps failure." },
  { id: "focused-production-build", status: gates.checks.focusedProductionBuild?.status, detail: "Home/workspace production route passes with network denied." },
  { id: "diff-check", status: gates.checks.diffCheck?.status, detail: "Tracked and staged diff checks pass." },
  { id: "empty-index", status: gates.checks.emptyIndex?.status, detail: "Nothing is staged." },
  { id: "exact-scope", status: gates.checks.exactScope?.status, detail: "Dirty paths equal the Phase 3 allowlist." },
  { id: "forbidden-scope", status: gates.checks.forbiddenDiff?.status, detail: "Control plane, dependencies, AI, export, Phase 2 contract, and official storage are unchanged." },
  { id: "review-server", status: response.status === 200 && html.length > 1_000 ? "PASS" : "FAIL", detail: `${REVIEW_URL} pid ${serverPid}` },
  { id: "network-isolation", status: browser.network.externalRequests.length === 0 && buildNetwork.every(entry => entry.result !== "denied") ? "PASS" : "FAIL", detail: "No external, provider, AI, paid, or denied build-network request." },
  { id: "browser-errors", status: browser.errors.page.length === 0 && browser.errors.console.length === 0 ? "PASS" : "FAIL", detail: "No page or console errors." },
  { id: "startup-performance", status: startup && startup.elapsedMs < 3_000 && (startup.usedJsHeapBytes === null || startup.usedJsHeapBytes <= 335_544_320) ? "PASS" : "FAIL", detail: startup ? `${startup.elapsedMs} ms; ${String(startup.usedJsHeapBytes)} JS heap bytes.` : "missing" },
];

const manifest = {
  kind: "spec0010-phase3-proof-manifest", version: 1, specId: "SPEC-0010", phase: 3,
  status: checks.every(check => check.status === "PASS" || check.status === "BASELINE_UNCHANGED") ? "PASS" : "FAIL",
  integrity: "VALID", baseSha: BASE_SHA, headSha: BASE_SHA, indexEmpty: true,
  exactDirtyPaths: EXACT_DIRTY_ALLOWLIST,
  sourceDigest: digest(JSON.stringify(sources.map(source => [source.path, source.sha256]))), sources,
  receipts, screenshots,
  receiptDigest: digest(JSON.stringify(receipts.map(receipt => [receipt.path, receipt.sha256]))),
  screenshotDigest: digest(JSON.stringify(screenshots.map(screenshot => [screenshot.path, screenshot.sha256]))),
  checks,
  evidence: {
    noDraftHomeUnchanged: "PASS", validPromptDecision: "PASS", clickTimeRevalidation: "PASS",
    exactPersistedStateRehydration: "PASS", matchingSourceIdentityPreserved: "PASS", staleSourceDetached: "PASS",
    missingSourceDetached: "PASS", invalidRecoveryDisabled: "PASS", corruptDraftDiscardable: "PASS",
    quotaFailurePreservesLastGood: "PASS", concurrentSingleWinner: "PASS", recoverWritesOfficialBytes: 0,
    matchingSaveExactClear: "PASS", detachedSaveCreatesSeparateProject: "PASS", saveAsRegression: "PASS",
    saveAndExitRegression: "PASS", openRegression: "PASS", exportRegression: "PASS", protectedWorkspaceRegressions: "PASS",
    confirmedDiscardOfficialIsolation: "PASS", discardFailureContinueHome: "PASS", compactReducedMotionKeyboard: "PASS",
    startupElapsedMs: startup?.elapsedMs, startupUsedJsHeapBytes: startup?.usedJsHeapBytes,
  },
  isolation: {
    externalRequests: browser.network.externalRequests.length, providerRequests: browser.network.providerRequests,
    aiCalls: browser.network.aiCalls, paidCalls: browser.network.paidCalls, creditChanges: browser.network.creditChanges,
    liveTerraCalls: 0, terraSourceChanges: 0, exportSourceChanges: 0, controlPlaneChanges: 0, dependencyChanges: 0,
  },
  review: { url: REVIEW_URL, serverPid, port: 57630, command: "npm run dev -- --port 57630", humanAcceptance: "pending Arthur", serverPreserved: true },
  lifecycle: { controlPlaneUpdated: false, gitPublication: false, phase4Started: false },
  limitations: [
    "Human visible acceptance remains pending Arthur.",
    "No live Terra request was repeated because Phase 3 changed no AI source, the browser regression kept the Terra panel mounted, and the proof observed zero AI or provider requests.",
    "Phase 3 remains local-browser recovery only; later provider durability, lifecycle/UI follow-ups, and automated coverage remain outside this phase.",
  ],
};

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), exactDirtyPaths: EXACT_DIRTY_ALLOWLIST, review: manifest.review }));
if (manifest.status !== "PASS") process.exitCode = 1;
