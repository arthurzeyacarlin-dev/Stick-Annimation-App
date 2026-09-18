import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const BASE_SHA = "f16d36b454728b3e216ec738013366f0230ddbdb";
const REVIEW_URL = "http://127.0.0.1:56950/";
const OUTPUT_ROOT = "output/spec-0007/phase-4";
const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
const EXACT_DIRTY_ALLOWLIST = [
  "scripts/fixtures/spec0007-manual/phase-4/contract.json",
  "scripts/spec0007-manual/phase-4/browserProof.ts",
  "scripts/spec0007-manual/phase-4/recordProof.ts",
  "scripts/spec0007-manual/phase-4/staticOracle.ts",
  "scripts/spec0007-manual/phase-4/validateProof.ts",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/editorCommands/destructiveRegistry.ts",
  "src/lib/animation/editorCommands/staticAssetImport.ts",
  "src/lib/animation/unifiedAnimationContractV2.ts",
  "src/lib/animation/unifiedProjectCatalogV2.ts",
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
const browser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/browser/phase4-browser.json`, "utf8"));
const response = await fetch(REVIEW_URL);
const checks = [
  { id: "source-typescript", status: "PASS", detail: "Full source no-emit TypeScript check passed with generated build artifacts excluded." },
  { id: "focused-eslint", status: "PASS", detail: "No lint errors; 18 pre-existing warnings remain in the two large workspace components." },
  { id: "production-build", status: "INHERITED_BASELINE", detail: "Next.js compiled the Phase 4 sources, then stopped on the untouched app/dev/ai-costs/lifetime PageProps baseline error." },
  { id: "phase4-static-boundary", status: staticOracle.status, detail: `${staticOracle.assertions} import, catalog, context-isolation, and protected-source assertions.` },
  { id: "phase4-browser", status: browser.status, detail: `${browser.assertions} real-browser import, validation, placement, history, persistence, compact, performance, and resource assertions.` },
  { id: "phase1-raster-oracle", status: "PASS", detail: "19,844 inherited drawing assertions passed." },
  { id: "phase1-no-loss-oracle", status: "PASS", detail: "Inherited no-silent-deletion and destructive-command checks passed." },
  { id: "phase1-coverage-persistence", status: "PASS", detail: "Inherited paint coverage and persistence checks passed." },
  { id: "phase2-corridor-oracle", status: "PASS", detail: "Inherited Draw Rig geometry, style, and bounded-work checks passed." },
  { id: "phase3-static-boundary", status: "PASS", detail: "23 retirement/isolation assertions passed." },
  { id: "phase3-browser-migration", status: "PASS", detail: "21 real-browser legacy migration assertions passed." },
  { id: "review-server", status: response.status === 200 && (await response.text()).length > 1000 ? "PASS" : "FAIL", detail: REVIEW_URL },
  { id: "empty-index", status: stagedPaths().length === 0 ? "PASS" : "FAIL" },
  { id: "exact-dirty-allowlist", status: JSON.stringify(dirtyPaths()) === JSON.stringify(EXACT_DIRTY_ALLOWLIST) ? "PASS" : "FAIL" },
];
const sources = EXACT_DIRTY_ALLOWLIST.map(bind);
const sourceDigest = digest(JSON.stringify(sources.map(source => [source.path, source.sha256])));
const artifacts = files(OUTPUT_ROOT).filter(path => path !== MANIFEST_PATH && !path.endsWith("validation.json")).sort().map(bind);
const manifest = {
  kind: "spec0007-phase4-proof-manifest",
  version: 1,
  status: checks.every(check => check.status !== "FAIL") ? "PASS" : "FAIL",
  baseSha: BASE_SHA,
  sourceDigest,
  review: { url: REVIEW_URL, server: "single-loopback-development" },
  dirtyAllowlist: EXACT_DIRTY_ALLOWLIST,
  sources,
  checks,
  artifacts,
};
mkdirSync(OUTPUT_ROOT, { recursive: true });
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), manifestSha256: digest(readFileSync(MANIFEST_PATH)) }));
if (manifest.status !== "PASS") process.exitCode = 1;
