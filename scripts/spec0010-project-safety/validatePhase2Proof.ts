import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

type Binding = { path: string; bytes: number; sha256: string };
type Check = { id: string; status: string; detail: string };
type Manifest = {
  kind: string; version: number; specId: string; phase: number; status: string; integrity: string;
  baseSha: string; headSha: string; indexEmpty: boolean; exactDirtyPaths: string[];
  sourceDigest: string; sources: Binding[]; receipts: Binding[]; screenshots: Binding[];
  receiptDigest: string; screenshotDigest: string; checks: Check[]; evidence: Record<string, unknown>;
  isolation: Record<string, number>;
  review: { url: string; humanAcceptance: string; serverPreserved: boolean };
  reviewEnvironment: { envLocalIgnored: boolean; envLocalPermissionsPreserved: boolean; secretValuesInspected: boolean; liveTerraGreeting: string; authorizedLiveProviderPosts: number; terraSourceChanges: number };
  lifecycle: { controlPlaneUpdated: boolean; gitPublication: boolean; phase3Started: boolean };
};

const MANIFEST_PATH = "output/spec-0010/phase-2/proof-manifest.json";
const BASE_SHA = "44cdafc534d7ef096cd2e283532a956c4eaa91f6";
const EXACT_DIRTY_ALLOWLIST = [
  "scripts/spec0010-project-safety/phase2BrowserProof.ts",
  "scripts/spec0010-project-safety/phase2Contract.ts",
  "scripts/spec0010-project-safety/phase2GateProof.ts",
  "scripts/spec0010-project-safety/phase2Oracle.ts",
  "scripts/spec0010-project-safety/recordPhase2Proof.ts",
  "scripts/spec0010-project-safety/validatePhase2Proof.ts",
  "src/components/workspace/DrawingTopBar.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/projectRecoveryContractV1.ts",
  "src/lib/animation/projectRecoveryStorageV1.ts",
  "src/lib/animation/unifiedProjectStorageV2.ts",
].sort();
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
let assertions = 0;
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

const errors = (candidate: Manifest, options: { liveBindings?: boolean; liveGit?: boolean } = {}) => {
  const found: string[] = [];
  if (candidate.kind !== "spec0010-phase2-proof-manifest" || candidate.version !== 1 || candidate.specId !== "SPEC-0010" || candidate.phase !== 2 || candidate.status !== "PASS" || candidate.integrity !== "VALID") found.push("identity");
  if (candidate.baseSha !== BASE_SHA || candidate.headSha !== candidate.baseSha) found.push("base");
  if (!candidate.indexEmpty) found.push("index");
  if (JSON.stringify(candidate.exactDirtyPaths) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) found.push("scope_contract");
  if (JSON.stringify(candidate.sources.map(source => source.path)) !== JSON.stringify(EXACT_DIRTY_ALLOWLIST)) found.push("source_scope");
  if ((options.liveGit ?? true) && JSON.stringify(candidate.exactDirtyPaths) !== JSON.stringify(dirtyPaths())) found.push("scope");
  if (new Set(candidate.exactDirtyPaths).size !== candidate.exactDirtyPaths.length) found.push("scope_duplicates");
  if (candidate.sourceDigest !== digest(JSON.stringify(candidate.sources.map(source => [source.path, source.sha256])))) found.push("source_digest");
  if (candidate.receiptDigest !== digest(JSON.stringify(candidate.receipts.map(receipt => [receipt.path, receipt.sha256])))) found.push("receipt_digest");
  if (candidate.screenshotDigest !== digest(JSON.stringify(candidate.screenshots.map(screenshot => [screenshot.path, screenshot.sha256])))) found.push("screenshot_digest");
  if (options.liveBindings ?? true) for (const binding of [...candidate.sources, ...candidate.receipts, ...candidate.screenshots]) if (JSON.stringify(binding) !== JSON.stringify(bind(binding.path))) found.push(`binding:${binding.path}`);
  if (candidate.checks.length < 15 || candidate.checks.some(check => check.status !== "PASS" && check.status !== "BASELINE_UNCHANGED")) found.push("checks");
  const requiredEvidence = ["untouchedAndTransientNoDraft", "meaningfulEditLatestDraft", "realisticFullStageRaster", "mixedLayerTextAudioHydration", "failurePreservesLastGood", "crossWorkspaceConflict", "saveExactClear", "saveAsExactClear", "saveAndExitPendingDraftOneClick", "saveAndExitVerifiedClear", "protectedWorkspaceRegressions", "officialProjectIsolation"];
  if (requiredEvidence.some(key => candidate.evidence[key] !== "PASS")) found.push("evidence");
  if (candidate.evidence.phase3StartupUiCreated !== false || candidate.evidence.logicalDrafts !== 1 || candidate.evidence.officialWritesFromRecovery !== 0) found.push("storage");
  if (typeof candidate.evidence.fullStageElapsedMs !== "number" || candidate.evidence.fullStageElapsedMs >= 10_000 || typeof candidate.evidence.fullStageUsedJsHeapBytes !== "number" || candidate.evidence.fullStageUsedJsHeapBytes >= 536_870_912) found.push("performance");
  const zeroIsolation = ["externalRequests", "providerRequests", "aiCalls", "paidCalls", "creditChanges", "controlPlaneChanges", "dependencyChanges", "phase3Changes"];
  if (zeroIsolation.some(key => candidate.isolation[key] !== 0)) found.push("isolation");
  if (candidate.review.url !== "http://127.0.0.1:57620/" || candidate.review.humanAcceptance !== "pending Arthur" || !candidate.review.serverPreserved) found.push("review");
  if (!candidate.reviewEnvironment.envLocalIgnored || !candidate.reviewEnvironment.envLocalPermissionsPreserved || candidate.reviewEnvironment.secretValuesInspected || candidate.reviewEnvironment.liveTerraGreeting !== "PASS" || candidate.reviewEnvironment.authorizedLiveProviderPosts !== 1 || candidate.reviewEnvironment.terraSourceChanges !== 0) found.push("review_environment");
  if (candidate.lifecycle.controlPlaneUpdated || candidate.lifecycle.gitPublication || candidate.lifecycle.phase3Started) found.push("lifecycle");
  return found;
};

assert.deepEqual(errors(manifest), []);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), BASE_SHA); assertions += 1;
assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), ""); assertions += 1;
execFileSync("git", ["diff", "--check"]); assertions += 1;
execFileSync("git", ["diff", "--cached", "--check"]); assertions += 1;

const rejectedMutations: string[] = [];
const reject = (name: string, mutate: (candidate: Manifest) => void) => {
  const candidate = structuredClone(manifest); mutate(candidate); assertions += 1;
  assert.ok(errors(candidate, { liveBindings: false, liveGit: false }).length > 0, `${name} mutation rejected`);
  rejectedMutations.push(name);
};
reject("identity", candidate => { candidate.status = "FAIL"; });
reject("base", candidate => { candidate.baseSha = "0".repeat(40); });
reject("scope", candidate => { candidate.exactDirtyPaths.pop(); });
reject("source-binding", candidate => { candidate.sources[0].sha256 = "0".repeat(64); });
reject("artifact-binding", candidate => { candidate.receipts[0].sha256 = "0".repeat(64); });
reject("assertion", candidate => { candidate.checks[0].status = "FAIL"; });
reject("storage", candidate => { candidate.evidence.logicalDrafts = 2; });
reject("performance", candidate => { candidate.evidence.fullStageElapsedMs = 10_000; });
reject("network", candidate => { candidate.isolation.externalRequests = 1; });
reject("cost", candidate => { candidate.isolation.paidCalls = 1; });
reject("review-environment", candidate => { candidate.reviewEnvironment.authorizedLiveProviderPosts = 2; });
reject("phase3", candidate => { candidate.evidence.phase3StartupUiCreated = true; });
reject("lifecycle", candidate => { candidate.lifecycle.gitPublication = true; });

const response = await fetch(manifest.review.url);
assert.equal(response.status, 200); assertions += 1;
assert.ok((await response.text()).length > 1_000); assertions += 1;

const result = {
  status: "VALID", assertions, rejectedMutations, manifest: bind(MANIFEST_PATH),
  manifestSha256: digest(readFileSync(MANIFEST_PATH)), exactDirtyPaths: manifest.exactDirtyPaths, reviewUrl: manifest.review.url,
};
writeFileSync("output/spec-0010/phase-2/validation.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
