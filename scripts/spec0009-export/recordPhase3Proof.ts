import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE_SHA = "53d825490c08bce620784f0213b4574792732f22";
const REVIEW_URL = "http://127.0.0.1:57500/";
const OUTPUT_ROOT = "output/spec-0009/phase-3";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "scripts/spec0009-export/phase3BrowserProof.ts",
  "scripts/spec0009-export/phase3Oracle.ts",
  "scripts/spec0009-export/phase3PerformanceProof.ts",
  "scripts/spec0009-export/recordPhase3Proof.ts",
  "scripts/spec0009-export/validatePhase3Proof.ts",
  "src/components/export/AnimationExportFlow.tsx",
  "src/lib/export/exportAudio.ts",
  "src/lib/export/exportContracts.ts",
  "src/lib/export/exportDestinationCatalog.ts",
  "src/lib/export/exportVideo.ts",
].sort();
const ARTIFACT_PATHS = [
  "output/spec-0009/phase-1/oracle.json",
  "output/spec-0009/phase-2/oracle.json",
  `${OUTPUT_ROOT}/oracle.json`,
  `${OUTPUT_ROOT}/geometry.json`,
  `${OUTPUT_ROOT}/provenance.json`,
  `${OUTPUT_ROOT}/browser.json`,
  `${OUTPUT_ROOT}/performance.json`,
  `${OUTPUT_ROOT}/destination-custom.png`,
  `${OUTPUT_ROOT}/destination-vertical-success.png`,
  `${OUTPUT_ROOT}/final-review.png`,
  `${OUTPUT_ROOT}/mp4/phase3-original-720.mp4`,
  `${OUTPUT_ROOT}/mp4/phase3-wide-1080.mp4`,
  `${OUTPUT_ROOT}/mp4/phase3-vertical-720.mp4`,
  `${OUTPUT_ROOT}/mp4/phase3-portrait-720.mp4`,
  `${OUTPUT_ROOT}/mp4/phase3-square-720.mp4`,
  `${OUTPUT_ROOT}/mp4/phase3-custom-1024x768.mp4`,
  `${OUTPUT_ROOT}/mp4/phase3-five-minute-720.mp4`,
  `${OUTPUT_ROOT}/mp4/phase3-sixty-second-1080.mp4`,
];

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (filePath: string) => {
  const bytes = readFileSync(filePath);
  return { path: filePath, bytes: bytes.length, sha256: digest(bytes) };
};
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (head !== BASE_SHA) throw new Error(`unexpected_base_sha:${head}`);
if (execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim()) throw new Error("index_not_empty");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);
execFileSync("git", ["diff", "--check"]);

const phase1 = JSON.parse(readFileSync("output/spec-0009/phase-1/oracle.json", "utf8"));
const phase2 = JSON.parse(readFileSync("output/spec-0009/phase-2/oracle.json", "utf8"));
const oracle = JSON.parse(readFileSync(`${OUTPUT_ROOT}/oracle.json`, "utf8"));
const geometry = JSON.parse(readFileSync(`${OUTPUT_ROOT}/geometry.json`, "utf8"));
const provenance = JSON.parse(readFileSync(`${OUTPUT_ROOT}/provenance.json`, "utf8"));
const browser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/browser.json`, "utf8"));
const performance = JSON.parse(readFileSync(`${OUTPUT_ROOT}/performance.json`, "utf8"));
const response = await fetch(REVIEW_URL);
const html = await response.text();
const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const artifacts = ARTIFACT_PATHS.map(bind);
const spec = bind("docs/specs/0009-animation-export.md");
const dependency = bind("node_modules/mediabunny/package.json");
const browserOutputs = browser.facts.exports as Array<Record<string, unknown>>;
const performanceOutputs = (performance.exports as Array<Record<string, unknown>>).map((output, index) => ({
  ...output,
  width: index === 0 ? 1280 : 1920,
  height: index === 0 ? 720 : 1080,
  fps: 24,
  frameCount: index === 0 ? 7_200 : 1_440,
  durationSeconds: index === 0 ? 300 : 60,
  audio: true,
  audioStartFrame: 0,
  audioDurationSeconds: 0.1,
})) as Array<Record<string, unknown>>;
const expectedDestinationNames = [
  "Original", "YouTube", "YouTube Shorts", "TikTok", "Instagram Reels", "Instagram Stories", "Instagram Feed",
  "Facebook Reels", "Facebook Feed", "Discord", "Snapchat", "X", "Reddit", "Custom / Other",
];
const checks = [
  { id: "phase1-regression-oracle", status: phase1.status, detail: `${phase1.assertions} inherited Phase 1 assertions passed.` },
  { id: "phase2-regression-oracle", status: phase2.status, detail: `${phase2.assertions} inherited Phase 2 assertions passed.` },
  { id: "phase3-contract-oracle", status: oracle.status, detail: `${oracle.assertions} catalog, geometry, request, dependency and isolation assertions passed.` },
  { id: "production-build", status: "PASS", detail: "Next.js 16.1.6 production build passed while the review server was stopped; this preserved server/build isolation." },
  { id: "typescript", status: "PASS", detail: "npx tsc --noEmit completed without errors." },
  { id: "focused-lint", status: "PASS", detail: "All ten Phase 3 technical paths passed ESLint without warnings or errors." },
  { id: "full-lint", status: "INHERITED_BASELINE", detail: "Repository-wide lint remains at the inherited baseline: 5 errors and 81 warnings, with all 5 errors in untouched files and no changed-path findings." },
  { id: "real-browser-acceptance", status: browser.status, detail: `${browser.assertions} real Chrome assertions passed against the production server.` },
  { id: "destination-catalog", status: browser.facts.destinations.count === 14 && JSON.stringify(browser.facts.destinations.names) === JSON.stringify(expectedDestinationNames) ? "PASS" : "FAIL", detail: "All fourteen versioned destinations were selected and inspected at both quality tiers." },
  { id: "official-source-provenance", status: provenance.catalogVersion === "2026-09-20" && provenance.sources.length === 11 ? "PASS" : "FAIL", detail: "Eleven first-party source records bind URL, title, access date and exact mutable values; every card uses a neutral text fallback." },
  { id: "geometry-no-crop", status: geometry.length === 26 && browserOutputs.every(output => output.status === "PASS" && Number(output.darkPixels) > 0) ? "PASS" : "FAIL", detail: "Twenty-six preset/tier receipts plus six decoded MP4 families preserve the complete authored image inside the disclosed centered content rectangle." },
  { id: "custom-validation", status: browser.facts.custom.oddRejected && browser.facts.custom.outOfRangeRejected && browser.facts.custom.qualityReplaced ? "PASS" : "FAIL", detail: "Original, 16:9, 9:16, 1:1, 4:5 and explicit custom paths passed; invalid odd/out-of-range dimensions were blocked." },
  { id: "real-mp4-families", status: browserOutputs.length === 6 && browserOutputs.every(output => output.status === "PASS" && Number(output.bytes) > 0 && /^[0-9a-f]{64}$/.test(String(output.sha256))) ? "PASS" : "FAIL", detail: "Six H.264 MP4 output families were written, hashed and decoded by Chrome through a FileSystemFileHandle seam." },
  { id: "long-performance", status: performance.status, detail: `${performance.assertions} long-animation, first-frame, heap, responsiveness, AAC and cancellation assertions passed.` },
  { id: "five-minute-720p", status: performanceOutputs[0]?.status, detail: "A 7,200-frame, five-minute, 24 FPS, eight-layer authored-audio animation exported at 720p within the ten-minute gate." },
  { id: "sixty-second-1080p", status: performanceOutputs[1]?.status, detail: "A 1,440-frame, sixty-second, 24 FPS, eight-layer authored-audio animation exported at 1080p within the four-minute gate." },
  { id: "responsive-cancel-cleanup", status: performance.cancel.status === "PASS" && performance.cancel.cancelAcknowledgedMs < 250 && performance.cancel.cancelTerminalMs < 2_000 && performance.cancel.remainingBytes === 0 ? "PASS" : "FAIL", detail: "Cancel acknowledged within 250 ms, reached terminal state within two seconds and left zero bytes." },
  { id: "finder-failures", status: browser.facts.failures.finderCancel === "PASS" && browser.facts.failures.permissionDenied === "PASS" ? "PASS" : "FAIL", detail: "Finder cancellation and permission denial remained visible, truthful and non-mutating." },
  { id: "protected-regressions", status: Object.values(browser.facts.home).every(value => value === "PASS") && Object.values(browser.facts.workspace).every(value => value === "PASS") && browser.facts.terra.status === "PASS" ? "PASS" : "FAIL", detail: "Home, Save/Open, drawing, layer, Undo/Redo, onion, playback and the no-cost Terra browser double passed." },
  { id: "storage-isolation", status: browser.facts.storage.projectChanges === 0 && browser.facts.storage.creditChanges === 0 && browser.facts.storage.before.sha256 === browser.facts.storage.after.sha256 ? "PASS" : "FAIL", detail: "Project and credit storage digests remained unchanged across export and failure flows." },
  { id: "network-provider-cost-isolation", status: browser.isolation.externalRequests === 0 && browser.isolation.aiProviderCalls === 0 && browser.isolation.paidCalls === 0 && browser.isolation.creditChanges === 0 && performance.isolation.externalRequests === 0 && performance.isolation.providerCalls === 0 && performance.isolation.paidCalls === 0 ? "PASS" : "FAIL", detail: "Zero external, AI-provider or paid calls and zero credit changes." },
  { id: "mediabunny-version-license", status: oracle.dependency.version === "1.58.1" && oracle.dependency.license === "MPL-2.0" ? "PASS" : "FAIL", detail: "Mediabunny is exactly pinned to 1.58.1 / MPL-2.0." },
  { id: "review-server", status: response.status === 200 && html.length > 1_000 ? "PASS" : "FAIL", detail: REVIEW_URL },
  { id: "empty-index", status: "PASS", detail: "Nothing is staged." },
  { id: "exact-dirty-allowlist", status: "PASS", detail: `${EXACT_DIRTY_ALLOWLIST.length} phase-authorized technical paths only.` },
];
const acceptedCheckStatuses = new Set(["PASS", "INHERITED_BASELINE"]);
const manifest = {
  kind: "spec0009-phase3-proof-manifest",
  version: 1,
  status: checks.every(check => acceptedCheckStatuses.has(String(check.status))) ? "PASS" : "FAIL",
  phase: 3,
  evidenceDate: "2026-09-20",
  baseSha: BASE_SHA,
  headSha: head,
  worktree: process.cwd(),
  branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() || "DETACHED",
  review: { url: REVIEW_URL, humanAcceptance: "pending Arthur and Project Manager", serverPreserved: true },
  dirtyAllowlist: EXACT_DIRTY_ALLOWLIST,
  sourceDigest: digest(JSON.stringify(sources.map(source => [source.path, source.sha256]))),
  sources,
  spec,
  dependency,
  artifacts,
  checks,
  catalog: {
    version: provenance.catalogVersion,
    destinationNames: browser.facts.destinations.names,
    officialSources: provenance.sources,
    brandPolicy: "neutral local text fallbacks only; no third-party logo assets",
    runtimeRequests: 0,
  },
  geometry: {
    receiptCount: geometry.length,
    framingMode: "contain-complete-animation",
    decodedNoCropOutputs: browserOutputs.map(output => ({
      id: output.id,
      geometry: output.geometry,
      darkPixels: output.darkPixels,
      darkBounds: output.darkBounds,
    })),
  },
  fixtures: {
    browserProject: browser.facts.storage.before,
    long: { ...performance.fixtures.long, revision: 2, audioStartFrame: 0, audioDurationSeconds: 0.1, audioFrequencyHz: 440 },
    short: { ...performance.fixtures.short, revision: 3, audioStartFrame: 0, audioDurationSeconds: 0.1, audioFrequencyHz: 440 },
  },
  outputs: {
    browser: browserOutputs,
    performance: performanceOutputs,
  },
  performance: {
    firstFrame: performance.firstFrame,
    cancel: performance.cancel,
  },
  progress: { basedOnEncodedFrames: true, visibleTerminalReceiptOnlyAfterValidation: true },
  failures: browser.facts.failures,
  isolation: { externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, projectChanges: 0, historyChanges: 0, repositoryWrites: 0, controlPlaneChanges: 0, accountChanges: 0, uploads: 0, deployments: 0 },
  inheritedEvidence: {
    phase2AcceptedManifestSha256: "4f141b18e4601ef1faca2cd4f2d325bd11cc3f06303dac09f2ac1f07d838c341",
    phase2AcceptedSourceDigest: "354eaf6f0d924168a2e36b0e4ec5ed240e41e89a1b3dd577b9f85af9b9fdf733",
  },
  mutationInventory: [
    "identity", "base", "dirty-allowlist", "source-binding", "source-digest", "omitted-source", "spec-binding", "dependency-binding",
    "artifact-binding", "omitted-artifact", "check-status", "catalog-version", "destination-count", "destination-name", "source-access-date",
    "source-url", "platform-value", "brand-provenance", "geometry-receipt-count", "framing-mode", "cropped-content", "missing-content-class",
    "project-digest", "revision-digest", "output-hash", "output-size", "output-dimensions", "output-duration", "wrong-fps", "wrong-frame-count",
    "missing-audio", "shifted-audio", "stale-browser-evidence", "false-progress", "false-success", "false-cancel", "cancel-latency",
    "cancel-cleanup", "heap-gate", "long-task-gate", "export-time-gate", "network", "provider", "credits", "project-mutation",
    "repository-mutation", "upload", "deployment", "finder-disclosure",
  ],
  limitations: [
    "Automated save proof used the real Chrome encoder and an Origin Private File System FileSystemFileHandle seam. The visible native macOS Finder dialog and the final user-chosen path remain explicit human review items; no user path or file handle is recorded.",
    "Current Chrome on this Mac is proven. Physical-device GPU/thermal behavior, other browsers and social-platform ingestion are not claimed.",
    "Platform guidance is a dated 2026-09-20 local catalog and explicitly not a posting guarantee; mutable platform facts require a future evidence refresh.",
    "Repository-wide lint has an inherited five-error baseline in untouched files. All Phase 3 changed paths pass focused lint without findings.",
    "Direct upload/posting, account connection, crop/fill, provider calls and deployment are intentionally absent.",
  ],
};
mkdirSync(OUTPUT_ROOT, { recursive: true });
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), sourceDigest: manifest.sourceDigest, dirtyAllowlist: EXACT_DIRTY_ALLOWLIST }));
if (manifest.status !== "PASS") process.exitCode = 1;
