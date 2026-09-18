import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BASE_SHA,
  EXACT_DIRTY_ALLOWLIST,
  MANIFEST_PATH,
  REVIEW_URL,
  bind,
  currentHead,
  currentSourceDigest,
  dirtyPaths,
  protectedV1SourcesMatch,
  stagedPaths,
  writeJson,
  type ProofManifest,
} from "./proofContract.ts";

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ProofManifest;
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };

equal(manifest.kind, "spec0007-phase2-proof-manifest", "manifest kind");
equal(manifest.version, 1, "manifest version");
equal(manifest.status, "PASS", "manifest status");
equal(manifest.baseSha, BASE_SHA, "base SHA");
equal(currentHead(), BASE_SHA, "live base SHA");
equal(stagedPaths(), [], "empty index");
equal(dirtyPaths(), EXACT_DIRTY_ALLOWLIST, "exact dirty allowlist");
equal(manifest.dirtyAllowlist, EXACT_DIRTY_ALLOWLIST, "recorded dirty allowlist");
equal(manifest.sourceDigest, currentSourceDigest(), "live source digest");
equal(manifest.sources.map(value => bind(value.path)), manifest.sources, "source file bindings");
equal(manifest.review, { url: REVIEW_URL, server: "single-loopback-development" }, "single stable review server");
check(manifest.checks.length >= 11 && manifest.checks.every(value => value.status !== "FAIL"), "all manifest checks pass or record the inherited baseline");
equal(manifest.checks.filter(value => value.status === "INHERITED_BASELINE").map(value => value.id).sort(), ["phase1-full-regression-ledger", "production-build", "repository-eslint-baseline"], "only the exact untouched build/lint failures and retired Phase 5 spelling check are inherited baseline");
equal(manifest.artifacts.map(value => bind(value.path)), manifest.artifacts, "artifact bindings");
equal(new Set(manifest.artifacts.map(value => value.path)).size, manifest.artifacts.length, "artifact paths are unique");

const browser = JSON.parse(readFileSync("output/spec-0007/phase-2/browser/draw-rig.json", "utf8")) as {
  status: string; assertions: number; matrix: unknown[]; strengthMetrics: unknown[]; errors: unknown[]; structuredRigMentions: unknown[];
  saveOpenExport: { saved: { digest: string }; reopened: { digest: string }; exported: { executed: boolean; nonWhitePixels: number } };
  transitions: unknown;
  longSession: { cycles: number; empty: { digest: string }; after: { digest: string }; heapBefore: number | null; heapAfter: number | null };
};
equal(browser.status, "PASS", "browser status");
check(browser.assertions >= 193, "browser assertion floor");
equal(browser.strengthMetrics.length, 9, "nine stronger-stick browser comparisons");
equal(browser.matrix.length, 20, "five variants by four transparencies");
equal(browser.errors, [], "browser errors");
equal(browser.structuredRigMentions, [], "no structured rig data");
equal(browser.saveOpenExport.reopened.digest, browser.saveOpenExport.saved.digest, "save/open raster identity");
check(browser.saveOpenExport.exported.executed && browser.saveOpenExport.exported.nonWhitePixels > 0, "export contains Draw Rig pixels");
check(Boolean(browser.transitions), "frame/layer/playback transitions recorded");
equal(browser.longSession.cycles, 32, "long-session cycle count");
equal(browser.longSession.after.digest, browser.longSession.empty.digest, "long-session exact raster cleanup");
if (browser.longSession.heapBefore !== null && browser.longSession.heapAfter !== null) check(browser.longSession.heapAfter - browser.longSession.heapBefore < 128 * 1024 * 1024, "long-session settled heap bound");

const oracle = JSON.parse(readFileSync("output/spec-0007/phase-2/commands/phase2-corridor-oracle.stdout.txt", "utf8")) as { status: string; assertions: number; cases: unknown[]; strengthCases: unknown[]; strengthFailures: unknown[]; linearRuns: Array<{ workPerSample: number; liveStateSlots: number }>; rasterMatrix: unknown[] };
equal(oracle.status, "PASS", "oracle status");
check(oracle.assertions >= 788, "oracle assertion floor");
check(oracle.cases.length >= 11, "named geometry cases");
equal(oracle.strengthCases.length, 9, "named stronger-stick cases");
equal(oracle.strengthFailures, [], "no stronger-stick failure");
check(oracle.linearRuns.every(value => value.workPerSample <= 14 && value.liveStateSlots === 5), "linear work and bounded live state");
equal(oracle.rasterMatrix.length, 20, "raster oracle matrix");
check(protectedV1SourcesMatch(), "DrawingCanvas and rasterGesture retain their accepted V1 hashes");

const response = await fetch(REVIEW_URL);
equal(response.status, 200, "review server response");
check((await response.text()).length > 1000, "review server serves the built app");
const validation = { status: "PASS", assertions, manifest: bind(MANIFEST_PATH), reviewUrl: REVIEW_URL };
writeJson("output/spec-0007/phase-2/validation.json", validation);
console.log(JSON.stringify(validation));
