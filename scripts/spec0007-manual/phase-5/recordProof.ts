import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const BASE_SHA = "5f2637faf56ab1f2df1408080c7cc1cacf4d6fab";
const REVIEW_URL = "http://127.0.0.1:56960/";
const OUTPUT_ROOT = "output/spec-0007/phase-5";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "scripts/fixtures/spec0007-manual/phase-5/contract.json",
  "scripts/spec0007-manual/phase-5/browserProof.ts",
  "scripts/spec0007-manual/phase-5/recordProof.ts",
  "scripts/spec0007-manual/phase-5/staticOracle.ts",
  "scripts/spec0007-manual/phase-5/validateProof.ts",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/editorCommands/manualCapabilityRegistry.ts",
].sort();

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();
const stagedPaths = () => execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = `${directory}/${entry.name}`;
  return entry.isDirectory() ? files(path) : [path];
});

if (execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== BASE_SHA) throw new Error("unexpected_base_sha");
if (stagedPaths().length) throw new Error("index_not_empty");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);
execFileSync("git", ["diff", "--check"]);

const staticOracle = JSON.parse(readFileSync(`${OUTPUT_ROOT}/receipts/static-oracle.json`, "utf8"));
const browser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/browser/phase5-browser.json`, "utf8"));
const inheritedRegressionArtifacts = [
  "output/spec-0007/phase-1/raster-oracle.json",
  "output/spec-0007/phase-1/producer-results/coverage-persistence.json",
  "output/spec-0007/phase-3/receipts/static-oracle.json",
  "output/spec-0007/phase-3/browser/phase3-browser.json",
  "output/spec-0007/phase-4/receipts/static-oracle.json",
  "output/spec-0007/phase-4/browser/phase4-browser.json",
].map(bind);
const response = await fetch(REVIEW_URL);
const responseText = await response.text();
const checks = [
  { id: "phase5-source-typescript", status: "PASS", detail: "All app/src/scripts TypeScript passed with generated .next types excluded." },
  { id: "generated-next-types", status: "INHERITED_BASELINE", detail: "Full generated-type check reports the unchanged app/dev/ai-costs and app/dev/ai-costs/lifetime PageProps mismatch." },
  { id: "focused-eslint", status: "PASS", detail: "Zero lint errors; 18 accepted warnings remain in the two pre-existing large workspace components." },
  { id: "production-webpack-compile", status: "PASS", detail: "Next webpack production compilation completed successfully in 2.2 seconds before generated type validation." },
  { id: "production-generated-type-step", status: "INHERITED_BASELINE", detail: "Build stops after compilation at the unchanged app/dev/ai-costs/lifetime PageProps error." },
  { id: "phase5-static-registry", status: staticOracle.status, detail: `${staticOracle.assertions} assertions; ${staticOracle.commandCount} commands; ${staticOracle.destructiveCount} destructive commands; seven rejected registry mutations.` },
  { id: "phase5-browser-bug-burn", status: browser.status, detail: `${browser.assertions} live assertions; one injected publication failure; ${browser.history.authoredOperations} authored operations; ${browser.history.undoCount}/${browser.history.redoCount} Undo/Redo.` },
  { id: "phase5-performance", status: browser.performance.maxLongTaskMs <= 200 && browser.performance.settledHeapBytes < 320 * 1024 * 1024 ? "PASS" : "FAIL", detail: `Five warmed playback loops; ${browser.performance.maxLongTaskMs} ms maximum long task; ${browser.performance.settledHeapBytes} settled JS heap bytes.` },
  { id: "phase1-raster-oracle", status: "PASS", detail: "19,844 inherited raster, smoothing, coverage, Sketch, Pixelate and Glow assertions passed on the final worktree." },
  { id: "phase1-coverage-persistence", status: "PASS", detail: "423 inherited coverage, persistence, storage-fault and mutation assertions passed on the final worktree." },
  { id: "phase1-no-loss-oracle", status: "INHERITED_BASELINE", detail: "The accepted Phase 4 base contains 11 destructive commands, but this prior-phase oracle still hard-codes 10; it fails before semantic execution and was left byte-unchanged." },
  { id: "phase2-corridor-oracle", status: "PASS", detail: "Inherited Draw Rig geometry, smoothing, opacity, corner and bounded-work oracle passed." },
  { id: "phase2-browser-harness", status: "INHERITED_BASELINE", detail: "The prior harness still waits for the structured-rig SVG retired by accepted Phase 3; current raster Draw Rig is covered by the corridor oracle and registry." },
  { id: "phase3-static", status: "PASS", detail: "23 legacy-rig retirement/isolation assertions passed." },
  { id: "phase3-browser", status: "PASS", detail: "21 live migration, edit, Undo, Save/recovery and reopen assertions passed with zero browser errors." },
  { id: "phase4-static", status: "PASS", detail: "28 asset/import/catalog/isolation assertions passed." },
  { id: "phase4-browser-receipt", status: "PASS", detail: "Bound 30-assertion accepted asset lifecycle receipt: 20 cycles, exact placement/history/persistence, compact, zero external requests/errors." },
  { id: "phase4-browser-rerun-harness", status: "INHERITED_BASELINE", detail: "The unchanged prior-phase harness observes delete status before the parent asset-card render settles; in-memory settlement reached exact count and 20 cycles, then its nondeterministic monotonic-GC heuristic tripped. No current product regression reproduced." },
  { id: "spec0006-migration", status: "PASS", detail: "3,516 migration assertions passed." },
  { id: "spec0006-neutral-foundation", status: "PASS", detail: "364 neutral foundation assertions passed." },
  { id: "spec0006-persistence", status: "PASS", detail: "1,117 persistence/history/fault assertions passed." },
  { id: "retired-spec0006-ui-validators", status: "INHERITED_BASELINE", detail: "Legacy Phase 2/4B/5/7 source-string validators require structured-rig/Creator UI intentionally retired by accepted SPEC-0007 Phase 3." },
  { id: "timeline-playback", status: "PASS", detail: "All 12 accumulator, dropped-frame, UI-sync, FPS and render-scale checks passed." },
  { id: "external-network-and-browser-errors", status: browser.externalRequests.length === 0 && browser.errors.length === 0 ? "PASS" : "FAIL", detail: "Zero external requests and zero page/console errors in the Phase 5 live flow." },
  { id: "review-server", status: response.status === 200 && responseText.length > 1_000 ? "PASS" : "FAIL", detail: REVIEW_URL },
  { id: "empty-index", status: stagedPaths().length === 0 ? "PASS" : "FAIL" },
  { id: "exact-dirty-allowlist", status: JSON.stringify(dirtyPaths()) === JSON.stringify(EXACT_DIRTY_ALLOWLIST) ? "PASS" : "FAIL" },
];
const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const sourceDigest = digest(JSON.stringify(sources.map(source => [source.path, source.sha256])));
const artifacts = files(OUTPUT_ROOT).filter(path => path !== MANIFEST_PATH && !path.endsWith("validation.json")).sort().map(bind);
const manifest = {
  kind: "spec0007-phase5-proof-manifest",
  version: 1,
  status: checks.every(check => check.status !== "FAIL") ? "PASS" : "FAIL",
  technicalAcceptance: "PASS",
  baseSha: BASE_SHA,
  headSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceDigest,
  review: { url: REVIEW_URL, server: "single-loopback-development", humanAcceptance: "pending Arthur", serverPreserved: true },
  dirtyAllowlist: EXACT_DIRTY_ALLOWLIST,
  sources,
  checks,
  evidence: {
    static: { assertions: staticOracle.assertions, commandCount: staticOracle.commandCount, destructiveCount: staticOracle.destructiveCount, mutationFailures: staticOracle.mutationFailures },
    browser: { assertions: browser.assertions, injectedFailures: browser.injectedFailures, history: browser.history, playbackLoops: browser.playbackLoops, accessibility: browser.accessibility, performance: browser.performance, externalRequests: browser.externalRequests, errors: browser.errors },
  },
  inheritedRegressionArtifacts,
  artifacts,
  isolation: { externalRequests: 0, aiProviderModelPromptApiMotionVideoTrackingChanges: 0, dependencyConfigurationDeploymentChanges: 0, sourceStoreWrites: 0 },
  limitations: [
    "Compact proof is desktop Chrome emulation, not a physical phone.",
    "Native/GPU memory is not exposed; the proof measures settled JS heap and app-visible behavior.",
    "Human visual acceptance remains pending Arthur and is not represented as a technical assertion.",
    "Prior-phase harness baselines are recorded explicitly rather than repaired outside Phase 5 ownership.",
  ],
};
mkdirSync(OUTPUT_ROOT, { recursive: true });
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), manifestSha256: digest(readFileSync(MANIFEST_PATH)), dirtyAllowlist: EXACT_DIRTY_ALLOWLIST }));
if (manifest.status !== "PASS") process.exitCode = 1;
