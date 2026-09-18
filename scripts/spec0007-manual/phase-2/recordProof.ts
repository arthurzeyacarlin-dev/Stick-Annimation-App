import { readFileSync, readdirSync } from "node:fs";
import {
  BASE_SHA,
  EXACT_DIRTY_ALLOWLIST,
  MANIFEST_PATH,
  OUTPUT_ROOT,
  REVIEW_URL,
  bind,
  currentHead,
  currentSourceDigest,
  digest,
  dirtyPaths,
  protectedV1SourcesMatch,
  sourceBindings,
  stagedPaths,
  writeJson,
  type ProofManifest,
  type RegressionReceipt,
} from "./proofContract.ts";

const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = `${directory}/${entry.name}`;
  return entry.isDirectory() ? files(path) : [path];
});
if (currentHead() !== BASE_SHA) throw new Error("unexpected_base_sha");
if (stagedPaths().length) throw new Error("index_not_empty");
if (JSON.stringify(dirtyPaths()) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) throw new Error(`unexpected_dirty_paths:${JSON.stringify(dirtyPaths())}`);

const sourceDigest = currentSourceDigest();
const regressions = JSON.parse(readFileSync(`${OUTPUT_ROOT}/receipts/regressions.json`, "utf8")) as RegressionReceipt;
const browser = JSON.parse(readFileSync(`${OUTPUT_ROOT}/browser/draw-rig.json`, "utf8")) as {
  status: string;
  assertions: number;
  sourceDigestBefore: string;
  sourceDigestAfter: string;
  matrix: unknown[];
  strengthMetrics: unknown[];
  structuredRigMentions: unknown[];
  saveOpenExport: { exported: { executed: boolean; nonWhitePixels: number } };
};
const oracle = JSON.parse(readFileSync(`${OUTPUT_ROOT}/commands/phase2-corridor-oracle.stdout.txt`, "utf8")) as { status: string; assertions: number; strengthCases: unknown[]; strengthFailures: unknown[]; rasterMatrix: unknown[] };
const phase1Ledger = regressions.commands.find(command => command.id === "phase1-full-regression-ledger");
const build = regressions.commands.find(command => command.id === "production-build");
const fullLint = regressions.commands.find(command => command.id === "repository-eslint");
const checks: ProofManifest["checks"] = [
  { id: "exact-clean-base", status: currentHead() === BASE_SHA ? "PASS" : "FAIL" },
  { id: "empty-index", status: stagedPaths().length === 0 ? "PASS" : "FAIL" },
  { id: "exact-dirty-allowlist", status: JSON.stringify(dirtyPaths()) === JSON.stringify(EXACT_DIRTY_ALLOWLIST) ? "PASS" : "FAIL" },
  { id: "production-build", status: build?.status ?? "FAIL", detail: build?.detail },
  { id: "phase2-oracle", status: oracle.status === "PASS" && oracle.assertions >= 788 && oracle.strengthCases.length === 9 && oracle.strengthFailures.length === 0 && oracle.rasterMatrix.length === 20 ? "PASS" : "FAIL" },
  { id: "phase2-browser", status: browser.status === "PASS" && browser.assertions >= 193 && browser.strengthMetrics.length === 9 && browser.matrix.length === 20 ? "PASS" : "FAIL" },
  { id: "protected-v1-integration-hashes", status: protectedV1SourcesMatch() ? "PASS" : "FAIL" },
  { id: "save-open-export", status: browser.saveOpenExport.exported.executed && browser.saveOpenExport.exported.nonWhitePixels > 0 ? "PASS" : "FAIL" },
  { id: "raster-only-no-rig-data", status: browser.structuredRigMentions.length === 0 ? "PASS" : "FAIL" },
  { id: "phase1-full-regression-ledger", status: phase1Ledger?.status ?? "FAIL", detail: phase1Ledger?.detail },
  { id: "repository-eslint-baseline", status: fullLint?.status ?? "FAIL", detail: fullLint?.detail },
  { id: "source-stability", status: regressions.sourceDigestBefore === sourceDigest && regressions.sourceDigestAfter === sourceDigest && browser.sourceDigestBefore === sourceDigest && browser.sourceDigestAfter === sourceDigest ? "PASS" : "FAIL" },
];
const artifacts = files(OUTPUT_ROOT)
  .filter(path => path !== MANIFEST_PATH && !path.endsWith("/validation.json"))
  .sort()
  .map(bind);
const manifest: ProofManifest = {
  kind: "spec0007-phase2-proof-manifest",
  version: 1,
  status: regressions.status === "PASS" && checks.every(check => check.status !== "FAIL") ? "PASS" : "FAIL",
  baseSha: BASE_SHA,
  review: { url: REVIEW_URL, server: "single-loopback-development" },
  sourceDigest,
  sources: sourceBindings(),
  dirtyAllowlist: EXACT_DIRTY_ALLOWLIST,
  checks,
  artifacts,
};
writeJson(MANIFEST_PATH, manifest);
console.log(JSON.stringify({ status: manifest.status, manifest: bind(MANIFEST_PATH), manifestSha256: digest(readFileSync(MANIFEST_PATH)) }));
if (manifest.status !== "PASS") process.exitCode = 1;
