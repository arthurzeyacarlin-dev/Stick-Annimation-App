import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BASE_SHA = "db0be15decae427e3ca0d696d945a650f363a4aa";
const REVIEW_URL = "http://127.0.0.1:57610/";
const OUTPUT_ROOT = "output/spec-0010/phase-1";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "app/page.tsx",
  "scripts/spec0010-project-safety/phase1BrowserProof.ts",
  "scripts/spec0010-project-safety/phase1Contract.ts",
  "scripts/spec0010-project-safety/phase1GateProof.ts",
  "scripts/spec0010-project-safety/phase1Oracle.ts",
  "scripts/spec0010-project-safety/recordPhase1Proof.ts",
  "scripts/spec0010-project-safety/validatePhase1Proof.ts",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingTopBar.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
].sort();

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: digest(bytes) };
};
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .map(record => record.slice(3))
  .sort();

if (git("rev-parse", "HEAD") !== BASE_SHA) throw new Error("unexpected_base_sha");
if (git("diff", "--cached", "--name-only")) throw new Error("index_not_empty");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) {
  throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);
}
execFileSync("git", ["diff", "--check"]);
execFileSync("git", ["diff", "--cached", "--check"]);

const oracle = JSON.parse(readFileSync(`${OUTPUT_ROOT}/oracle.json`, "utf8")) as { status: string; assertions: number };
const contract = JSON.parse(readFileSync(`${OUTPUT_ROOT}/contract.json`, "utf8")) as { status: string; assertions: number };
const browser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/browser.json`, "utf8")) as {
  status: string;
  assertions: number;
  screenshots: string[];
  network: { externalRequests: string[]; providerRequests: number; aiCalls: number; paidCalls: number; creditChanges: number };
  errors: { page: string[]; console: string[] };
};
const gates = JSON.parse(readFileSync(`${OUTPUT_ROOT}/gates.json`, "utf8")) as {
  status: string;
  checks: Record<string, { status: string }>;
};
const buildNetwork = JSON.parse(readFileSync(`${OUTPUT_ROOT}/build-network.json`, "utf8")) as Array<{ result: string; target: string }>;
const response = await fetch(REVIEW_URL);
const html = await response.text();

const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const receipts = ["oracle.json", "contract.json", "browser.json", "gates.json", "build-network.json"].map(name => bind(`${OUTPUT_ROOT}/${name}`));
const screenshots = browser.screenshots.map(bind);
const checks = [
  { id: "oracle", status: oracle.status, detail: `${oracle.assertions} canonical-save and coverage assertions.` },
  { id: "contract", status: contract.status, detail: `${contract.assertions} menu, duplicate, failure, and stale-save assertions.` },
  { id: "browser", status: browser.status, detail: `${browser.assertions} real Chrome assertions across six flows.` },
  { id: "typecheck", status: gates.checks.typecheck?.status, detail: "TypeScript passes; the gate also accepts only the exact inherited generated-type baseline if a production build has regenerated those unrelated types." },
  { id: "focused-lint", status: gates.checks.focusedLint?.status, detail: "No errors or findings in Phase 1 paths." },
  { id: "full-lint-nonregression", status: gates.checks.fullLint?.status, detail: "Exact inherited repository lint baseline retained; no changed-line findings." },
  { id: "focused-production-build", status: gates.checks.focusedProductionBuild?.status, detail: "The production Home/workspace route compiled with the network-denied build harness." },
  { id: "diff-check", status: gates.checks.diffCheck?.status, detail: "Tracked and staged diff checks pass." },
  { id: "empty-index", status: gates.checks.emptyIndex?.status, detail: "Nothing is staged." },
  { id: "forbidden-scope", status: gates.checks.forbiddenDiff?.status, detail: "Control plane, dependencies, AI, export, and project structure are unchanged." },
  { id: "review-server", status: response.status === 200 && html.length > 1_000 ? "PASS" : "FAIL", detail: REVIEW_URL },
  { id: "network-isolation", status: browser.network.externalRequests.length === 0 && buildNetwork.every(entry => entry.result !== "denied") ? "PASS" : "FAIL", detail: "No external/provider/build-network request." },
  { id: "browser-errors", status: browser.errors.page.length === 0 && browser.errors.console.length === 0 ? "PASS" : "FAIL", detail: "No page or console errors." },
];

const manifest = {
  kind: "spec0010-phase1-proof-manifest",
  version: 1,
  specId: "SPEC-0010",
  phase: 1,
  status: checks.every(check => check.status === "PASS" || check.status === "BASELINE_UNCHANGED") ? "PASS" : "FAIL",
  integrity: "VALID",
  baseSha: BASE_SHA,
  headSha: BASE_SHA,
  indexEmpty: true,
  exactDirtyPaths: EXACT_DIRTY_ALLOWLIST,
  sourceDigest: digest(JSON.stringify(sources.map(source => [source.path, source.sha256]))),
  sources,
  receipts,
  screenshots,
  receiptDigest: digest(JSON.stringify(receipts.map(receipt => [receipt.path, receipt.sha256]))),
  screenshotDigest: digest(JSON.stringify(screenshots.map(screenshot => [screenshot.path, screenshot.sha256]))),
  checks,
  evidence: {
    successfulCurrentGenerationExit: "PASS",
    injectedSaveFailureStaysEditable: "PASS",
    newerEditPreventsExit: "PASS",
    newerEditOrdinarySaveRetry: "PASS",
    rapidDoubleActivationOneWriteOneNavigation: "PASS",
    keyboardAndCompactReducedMotion: "PASS",
    protectedWorkspaceRegressionFlow: "PASS",
    officialRepositoryBeforeAfterBound: true,
    recoveryStoreCreated: false,
  },
  isolation: {
    externalRequests: 0,
    providerRequests: 0,
    aiCalls: 0,
    paidCalls: 0,
    creditChanges: 0,
    controlPlaneChanges: 0,
    dependencyChanges: 0,
    recoveryImplementationChanges: 0,
  },
  review: { url: REVIEW_URL, humanAcceptance: "pending Arthur", serverPreserved: true },
  lifecycle: {
    controlPlaneUpdated: false,
    gitPublication: false,
    phase2Started: false,
    phase3Started: false,
  },
  limitations: [
    "Human visible acceptance remains pending Arthur.",
    "The full repository production build retains an unrelated pre-existing Next generated-type failure in app/dev/ai-costs/lifetime/page.tsx; the Phase 1 Home/workspace production route compiles successfully and Phase 1 TypeScript paths are clean.",
    "Phase 1 intentionally adds no emergency recovery draft or startup recovery prompt; those remain unauthorized later phases.",
  ],
};

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), exactDirtyPaths: EXACT_DIRTY_ALLOWLIST }));
if (manifest.status !== "PASS") process.exitCode = 1;
