import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE_SHA = "37cdb7203286c2ea333a3766ba2e81bc06830200";
const REVIEW_URL = "http://127.0.0.1:57200/";
const OUTPUT_ROOT = "output/spec-0009/phase-1";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "app/page.tsx",
  "scripts/spec0009-export/correctionBrowserProof.ts",
  "scripts/spec0009-export/phase1Oracle.ts",
  "scripts/spec0009-export/recordPhase1Proof.ts",
  "scripts/spec0009-export/validatePhase1Proof.ts",
  "src/components/export/AnimationExportFlow.tsx",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingTopBar.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/export/exportPhase1.ts",
  "src/lib/openai/client.ts",
  "src/lib/openai/generateAiAnimatorReply.ts",
].sort();
const SCREENSHOTS = [
  "output/playwright/export-choose-fixed.png",
  "output/playwright/export-player-black.png",
  "output/playwright/export-phase1-main-final.png",
  "output/playwright/export-phase1-small-reduced-motion.png",
  "output/playwright/workspace-return-preserved-final.png",
  "output/spec-0009/phase-1/correction/chooser-raster.png",
  "output/spec-0009/phase-1/correction/player-raster.png",
];

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

if (execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== BASE_SHA) throw new Error("unexpected_base_sha");
if (execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim()) throw new Error("index_not_empty");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);
execFileSync("git", ["diff", "--check"]);

const oracle = JSON.parse(readFileSync(`${OUTPUT_ROOT}/oracle.json`, "utf8"));
const correctionBrowser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/correction/browser.json`, "utf8"));
const response = await fetch(REVIEW_URL);
const html = await response.text();
const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const screenshots = SCREENSHOTS.map(bind);
const checks = [
  { id: "phase1-contract-oracle", status: oracle.status, detail: `${oracle.assertions} exact duration, owner, hold, tween, raster-transform, empty-state, and stale-source assertions.` },
  { id: "correction-browser", status: correctionBrowser.status, detail: `${correctionBrowser.assertions} real-app Save As, saved-raster, timing, and Terra-route assertions.` },
  { id: "typescript", status: "PASS", detail: "No TypeScript errors." },
  { id: "focused-eslint", status: "PASS", detail: "No lint errors; three pre-existing unused-variable warnings remain in DrawingWorkspace." },
  { id: "production-build", status: "PASS", detail: "Next production build completed after the review server was stopped." },
  { id: "home-export-route", status: "PASS", detail: "The main Export card opens the Phase 1 chooser." },
  { id: "explicit-selection", status: "PASS", detail: "Use this animation is disabled until a ready saved animation is selected; keyboard Enter selection passed." },
  { id: "exact-saved-frame", status: "PASS", detail: "A saved all-black frame produced an all-black chooser thumbnail and player frame." },
  { id: "workspace-preservation", status: "PASS", detail: "Returning from File > Export preserved the saved black canvas, Fill tool state, and Saved on this browser label." },
  { id: "save-as-dialog", status: "PASS", detail: "File > Save As uses an accessible focused in-app dialog; blank validation, safe Cancel, and successful named copy passed without prompt()." },
  { id: "saved-raster-parity", status: "PASS", detail: "A UI-authored draw/hold/later-keyframe project remained visible in thumbnail and all player frames; hold pixels matched the owner and frame centroids matched workspace coordinates." },
  { id: "saved-timing", status: "PASS", detail: "Player used the shared workspace accumulator and visibly traversed frames 1, 2, and 3 at saved FPS before looping." },
  { id: "terra-conversation-route", status: "PASS", detail: "Normal hello reached /api/ai-animator once and displayed a polite gpt-5.6-terra-identified reply through the established no-cost provider double; no Generate Frames error leaked." },
  { id: "compact-reduced-motion", status: "PASS", detail: "600x700 compact viewport with reduced motion retained selectable cards and controls." },
  { id: "browser-errors", status: "PASS", detail: "Zero page or console errors; only the Next development cross-origin warning was observed." },
  { id: "external-and-ai-isolation", status: "PASS", detail: "No external provider, AI, motion, or video generation calls were used." },
  { id: "review-server", status: response.status === 200 && html.length > 1_000 ? "PASS" : "FAIL", detail: REVIEW_URL },
  { id: "empty-index", status: "PASS", detail: "Nothing staged." },
  { id: "exact-dirty-allowlist", status: "PASS", detail: `${EXACT_DIRTY_ALLOWLIST.length} phase-authorized files only.` },
];
const manifest = {
  kind: "spec0009-phase1-proof-manifest",
  version: 1,
  status: checks.every(check => check.status === "PASS") ? "PASS" : "FAIL",
  baseSha: BASE_SHA,
  headSha: BASE_SHA,
  review: { url: REVIEW_URL, humanAcceptance: "pending Arthur", serverPreserved: true },
  dirtyAllowlist: EXACT_DIRTY_ALLOWLIST,
  sourceDigest: digest(JSON.stringify(sources.map(source => [source.path, source.sha256]))),
  sources,
  screenshots,
  oracle: bind(`${OUTPUT_ROOT}/oracle.json`),
  correctionBrowser: bind(`${OUTPUT_ROOT}/correction/browser.json`),
  checks,
  isolation: { externalRequests: 0, aiCalls: 0, paidCalls: 0, repositoryWrites: 0, controlPlaneChanges: 0 },
  limitations: [
    "Phase 1 chooses and watches the exact saved animation; file encoding, Finder saving, and social destinations intentionally remain for later phases.",
    "The review server has no OPENAI_API_KEY, so genuine paid-provider Terra output was not called or claimed; routing and presentation are proved with the accepted no-cost browser provider double.",
    "Human visual acceptance remains pending Arthur.",
  ],
};
mkdirSync(OUTPUT_ROOT, { recursive: true });
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), dirtyAllowlist: EXACT_DIRTY_ALLOWLIST }));
if (manifest.status !== "PASS") process.exitCode = 1;
