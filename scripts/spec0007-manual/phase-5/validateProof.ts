import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MANIFEST_PATH = "output/spec-0007/phase-5/proof-manifest.json";
const BASE_SHA = "5f2637faf56ab1f2df1408080c7cc1cacf4d6fab";
const EXPECTED_DIRTY = [
  "scripts/fixtures/spec0007-manual/phase-5/contract.json",
  "scripts/spec0007-manual/phase-5/browserProof.ts",
  "scripts/spec0007-manual/phase-5/recordProof.ts",
  "scripts/spec0007-manual/phase-5/staticOracle.ts",
  "scripts/spec0007-manual/phase-5/validateProof.ts",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/editorCommands/manualCapabilityRegistry.ts",
].sort();
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

type Candidate = typeof manifest;
const validationErrors = (candidate: Candidate) => {
  const errors: string[] = [];
  if (candidate.kind !== "spec0007-phase5-proof-manifest") errors.push("kind");
  if (candidate.version !== 1) errors.push("version");
  if (candidate.status !== "PASS" || candidate.technicalAcceptance !== "PASS") errors.push("status");
  if (candidate.baseSha !== BASE_SHA || candidate.headSha !== BASE_SHA) errors.push("base");
  if (JSON.stringify(candidate.dirtyAllowlist) !== JSON.stringify(EXPECTED_DIRTY)) errors.push("dirty_allowlist");
  if (candidate.sources.length !== EXPECTED_DIRTY.length) errors.push("source_count");
  if (candidate.sources.some((source: { path: string; bytes: number; sha256: string }) => JSON.stringify(bind(source.path)) !== JSON.stringify(source))) errors.push("source_binding");
  const expectedSourceDigest = digest(JSON.stringify(candidate.sources.map((source: { path: string; sha256: string }) => [source.path, source.sha256])));
  if (candidate.sourceDigest !== expectedSourceDigest) errors.push("source_digest");
  if (candidate.artifacts.some((artifact: { path: string; bytes: number; sha256: string }) => JSON.stringify(bind(artifact.path)) !== JSON.stringify(artifact))) errors.push("artifact_binding");
  if (candidate.inheritedRegressionArtifacts.some((artifact: { path: string; bytes: number; sha256: string }) => JSON.stringify(bind(artifact.path)) !== JSON.stringify(artifact))) errors.push("regression_binding");
  if (candidate.checks.some((entry: { status: string }) => entry.status === "FAIL")) errors.push("failed_check");
  return errors;
};

equal(validationErrors(manifest), [], "manifest validates against live files");
equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), BASE_SHA, "live base SHA");
equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), "", "empty index");
equal(dirtyPaths(), EXPECTED_DIRTY, "exact dirty allowlist");
equal(new Set(manifest.sources.map((source: { path: string }) => source.path)).size, EXPECTED_DIRTY.length, "unique source paths");
equal(new Set(manifest.artifacts.map((artifact: { path: string }) => artifact.path)).size, manifest.artifacts.length, "unique artifact paths");
check(manifest.checks.length >= 25, "complete check inventory");
check(manifest.checks.filter((entry: { status: string }) => entry.status === "INHERITED_BASELINE").length >= 1, "inherited baselines are explicit");

const staticOracle = JSON.parse(readFileSync("output/spec-0007/phase-5/receipts/static-oracle.json", "utf8"));
equal(staticOracle.status, "PASS", "static status");
equal(staticOracle.assertions, 155, "static assertion count");
equal(staticOracle.commandCount, 40, "closed command count");
equal(staticOracle.destructiveCount, 11, "closed destructive count");
equal(staticOracle.mutationFailures, ["removed-command", "renamed-command", "deletion-misclassified", "no-loss-bypassed", "history-bypassed", "manual-mapping-removed", "handler-mapping-altered"], "negative registry mutations");
equal(staticOracle.rollbackMarkers, { baseRestoresVisibleBitmap: false, currentRestoresVisibleBitmap: true }, "base defect and fix source binding");

const browser = JSON.parse(readFileSync("output/spec-0007/phase-5/browser/phase5-browser.json", "utf8"));
equal(browser.status, "PASS", "browser status");
check(browser.assertions >= 51, "browser assertion floor");
equal(browser.injectedFailures, 1, "one deterministic coordinator failure");
equal(browser.history.authoredOperations, 160, "history operation floor fixture");
check(browser.history.undoCount >= 160 && browser.history.redoCount === browser.history.undoCount, "full Undo/Redo cap traversal");
equal(browser.history.root.painted, 0, "Undo root is exact blank");
equal(browser.playbackLoops, 5, "five warmed playback loops");
check(browser.performance.maxLongTaskMs <= 200, "strict long-task ceiling");
check(browser.performance.settledHeapBytes < 320 * 1024 * 1024, "strict heap ceiling");
equal(browser.accessibility.seriousAxe, [], "zero critical/serious Axe findings");
check(browser.accessibility.compactOverflow.width <= browser.accessibility.compactOverflow.client + 1, "compact no-overflow bound");
equal(browser.externalRequests, [], "zero external requests");
equal(browser.errors, [], "zero browser errors");

const rejectedMutations: string[] = [];
const reject = (id: string, mutate: (candidate: Candidate) => void) => {
  const candidate = structuredClone(manifest);
  mutate(candidate);
  assertions += 1;
  assert.ok(validationErrors(candidate).length > 0, `${id}: altered manifest rejected`);
  rejectedMutations.push(id);
};
reject("base-sha", candidate => { candidate.baseSha = "0".repeat(40); });
reject("dirty-allowlist", candidate => { candidate.dirtyAllowlist.pop(); });
reject("source-hash", candidate => { candidate.sources[0].sha256 = "0".repeat(64); });
reject("source-digest", candidate => { candidate.sourceDigest = "0".repeat(64); });
reject("artifact-hash", candidate => { candidate.artifacts[0].sha256 = "0".repeat(64); });
reject("regression-hash", candidate => { candidate.inheritedRegressionArtifacts[0].sha256 = "0".repeat(64); });
reject("failed-check", candidate => { candidate.checks[0].status = "FAIL"; });
reject("status", candidate => { candidate.status = "FAIL"; });

const response = await fetch(manifest.review.url);
equal(response.status, 200, "review server response");
check((await response.text()).length > 1_000, "review server serves the app");
const result = { status: "VALID", assertions, rejectedMutations, manifest: bind(MANIFEST_PATH), manifestSha256: digest(readFileSync(MANIFEST_PATH)), reviewUrl: manifest.review.url };
mkdirSync("output/spec-0007/phase-5", { recursive: true });
writeFileSync("output/spec-0007/phase-5/validation.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
