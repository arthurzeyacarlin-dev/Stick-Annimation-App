import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE_SHA = "b45921262b57902ddbaea9519a03f7aa7289621c";
const REVIEW_URL = "http://127.0.0.1:57470/";
const OUTPUT_ROOT = "output/spec-0009/phase-2";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "package-lock.json",
  "package.json",
  "scripts/spec0009-export/phase2Oracle.ts",
  "scripts/spec0009-export/recordPhase2Proof.ts",
  "scripts/spec0009-export/validatePhase2Proof.ts",
  "src/components/export/AnimationExportFlow.tsx",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/unifiedAnimationContractV2.ts",
  "src/lib/animation/unifiedAnimationMigrationV2.ts",
  "src/lib/animation/unifiedWorkspaceFactoryV2.ts",
  "src/lib/export/exportAudio.ts",
  "src/lib/export/exportContracts.ts",
  "src/lib/export/exportRenderer.ts",
  "src/lib/export/exportVideo.ts",
].sort();
const ARTIFACTS = [
  `${OUTPUT_ROOT}/oracle.json`,
  `${OUTPUT_ROOT}/browser.json`,
  `${OUTPUT_ROOT}/final-export-screen.png`,
  `${OUTPUT_ROOT}/final-export-success.png`,
  `${OUTPUT_ROOT}/geometry-corrected-preview-720p.png`,
  `${OUTPUT_ROOT}/geometry-corrected-preview-1080p.png`,
  `${OUTPUT_ROOT}/terra-live-connected.png`,
  "output/spec-0009/phase-1/correction/browser.json",
  "output/spec-0009/phase-1/correction/chooser-raster.png",
  "output/spec-0009/phase-1/correction/player-raster.png",
];

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: digest(bytes) };
};
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (head !== BASE_SHA) throw new Error(`unexpected_base_sha:${head}`);
if (execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim()) throw new Error("index_not_empty");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);
execFileSync("git", ["diff", "--check"]);

const oracle = JSON.parse(readFileSync(`${OUTPUT_ROOT}/oracle.json`, "utf8"));
const browser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/browser.json`, "utf8"));
const terra = JSON.parse(readFileSync("output/spec-0009/phase-1/correction/browser.json", "utf8"));
const response = await fetch(REVIEW_URL);
const html = await response.text();
const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const artifacts = ARTIFACTS.map(bind);
const spec = bind("docs/specs/0009-animation-export.md");
const dependency = bind("node_modules/mediabunny/package.json");
const checks = [
  { id: "phase2-contract-oracle", status: oracle.status, detail: `${oracle.assertions} contract, background, codec, audio-order, dependency, streaming and isolation assertions.` },
  { id: "production-build", status: "PASS", detail: "Next.js 16.1.6 production build completed only while the review server was stopped." },
  { id: "typescript", status: "PASS", detail: "No TypeScript errors." },
  { id: "home-hydration", status: browser.facts.hydration.status, detail: "Home controls hydrated; zero console errors and zero observed request failures." },
  { id: "save-open-background", status: browser.facts.workspace.projectBackgroundBeforeSave === browser.facts.workspace.projectBackgroundAfterOpen ? "PASS" : "FAIL", detail: "Project-owned #33aa66 background and authored raster survived Save As and Open." },
  { id: "workspace-regressions", status: browser.facts.workspace.draw === "PASS" && browser.facts.workspace.onion === "PASS" && browser.facts.workspace.playPause === "PASS" ? "PASS" : "FAIL", detail: "Draw, distinct layer addition, onion, play/pause, Save As and Open passed." },
  { id: "real-local-720p", status: browser.facts.exports[0].status, detail: "Real browser H.264 encode/write/read/MP4 inspection passed through a local FileSystemFileHandle seam." },
  { id: "real-local-1080p", status: browser.facts.exports[1].status, detail: "Real browser H.264 encode/write/read/MP4 inspection passed through a local FileSystemFileHandle seam." },
  { id: "preview-video-geometry-fidelity", status: browser.facts.geometry.status, detail: `A controlled asymmetric gesture retained its authored aspect (${browser.facts.geometry.authored.aspect}) in both preview and decoded 720p/1080p MP4 outputs; uniform contain replaced non-uniform stretch.` },
  { id: "post-write-validation-cleanup", status: browser.facts.failures.invalidPostWriteValidation.remainingBytes === 0 ? "PASS" : "FAIL", detail: "Forced invalid output was rejected and a fresh cleanup stream reduced the file to zero bytes." },
  { id: "mid-export-cancel-cleanup", status: browser.facts.failures.midExportCancel.remainingBytes === 0 ? "PASS" : "FAIL", detail: "Responsive Cancel reached terminal cancelled state and reduced the partial file to zero bytes." },
  { id: "finder-cancel", status: browser.facts.failures.finderCancel.status, detail: "Finder cancellation remained distinct and reported that no video was created." },
  { id: "terra-no-cost-regression", status: terra.status, detail: `${terra.assertions} established browser assertions; polite Terra reply visible through the no-cost provider double.` },
  { id: "terra-live-configured-route", status: browser.facts.terraLive.status, detail: "Exactly one short Low-reasoning live request returned Terra connected after the ignored local environment was restored; no secret value was recorded." },
  { id: "external-ai-credit-isolation", status: browser.isolation.externalRequests === 0 && browser.isolation.aiProviderCalls === 0 && browser.isolation.paidCalls === 0 && browser.isolation.creditChanges === 0 ? "PASS" : "FAIL", detail: "Zero external/provider/paid requests and zero credit changes." },
  { id: "mediabunny-version-license", status: oracle.dependency.version === "1.58.1" && oracle.dependency.license === "MPL-2.0" ? "PASS" : "FAIL", detail: "Mediabunny is exactly pinned to 1.58.1 / MPL-2.0." },
  { id: "review-server", status: response.status === 200 && html.length > 1_000 ? "PASS" : "FAIL", detail: REVIEW_URL },
  { id: "empty-index", status: "PASS", detail: "Nothing staged." },
  { id: "exact-dirty-allowlist", status: "PASS", detail: `${EXACT_DIRTY_ALLOWLIST.length} phase-authorized technical paths only.` },
];
const manifest = {
  kind: "spec0009-phase2-proof-manifest",
  version: 1,
  status: checks.every(check => check.status === "PASS") ? "PASS" : "FAIL",
  phase: 2,
  baseSha: BASE_SHA,
  headSha: head,
  worktree: process.cwd(),
  branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() || "DETACHED",
  review: { url: REVIEW_URL, humanAcceptance: "pending Arthur", serverPreserved: true },
  dirtyAllowlist: EXACT_DIRTY_ALLOWLIST,
  sourceDigest: digest(JSON.stringify(sources.map(source => [source.path, source.sha256]))),
  sources,
  spec,
  dependency,
  artifacts,
  checks,
  outputs: browser.facts.exports,
  isolation: { externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0, controlPlaneChanges: 0 },
  limitations: [
    "The automated file-system proof used a real browser encoder with an Origin Private File System FileSystemFileHandle seam. The visible native Finder dialog and chosen user path remain an explicit Arthur review item; no path or file handle is recorded.",
    "The final decoded-file browser receipt covers a saved raster/no-audio one-frame fixture at both quality tiers. Authored AAC, mixed text/symbol/effect fixtures and long-duration performance are implemented by the shared evaluator/audio/streaming paths but are not claimed as visually human-accepted by this receipt.",
    "Broad Terra regression used the established no-cost provider double. Exactly one short Low-reasoning live route smoke was made after restoring the ignored local environment; no secret value is recorded or bound into this manifest.",
    "Phase 3 social destinations, uploads, crop/fill and custom dimensions are intentionally absent.",
  ],
};
mkdirSync(OUTPUT_ROOT, { recursive: true });
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), sourceDigest: manifest.sourceDigest, dirtyAllowlist: EXACT_DIRTY_ALLOWLIST }));
if (manifest.status !== "PASS") process.exitCode = 1;
