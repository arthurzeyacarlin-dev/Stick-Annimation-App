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
  review: { url: string; serverPid: number; port: number; command: string; humanAcceptance: string; serverPreserved: boolean };
  lifecycle: { controlPlaneUpdated: boolean; gitPublication: boolean; phase4Started: boolean };
};

const manifestPath = "output/spec-0010/phase-3/proof-manifest.json";
const baseSha = "337433b37716fdd71ecc2a9d0239e239519ef655";
const exactDirtyAllowlist = [
  "app/page.tsx",
  "scripts/spec0010-project-safety/phase3BrowserProof.ts",
  "scripts/spec0010-project-safety/phase3Contract.ts",
  "scripts/spec0010-project-safety/phase3GateProof.ts",
  "scripts/spec0010-project-safety/phase3Oracle.ts",
  "scripts/spec0010-project-safety/recordPhase3Proof.ts",
  "scripts/spec0010-project-safety/validatePhase3Proof.ts",
  "src/components/recovery/ProjectRecoveryPrompt.tsx",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/lib/animation/projectRecoveryStorageV1.ts",
  "src/lib/animation/unifiedWorkspaceBootstrap.ts",
].sort();
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
let assertions = 0;
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bind = (path: string) => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: digest(bytes) }; };
const dirtyPaths = () => execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .toString("utf8").split("\0").filter(Boolean).map(record => record.slice(3)).sort();

const errors = (candidate: Manifest, options: { liveBindings?: boolean; liveGit?: boolean } = {}) => {
  const found: string[] = [];
  if (candidate.kind !== "spec0010-phase3-proof-manifest" || candidate.version !== 1 || candidate.specId !== "SPEC-0010" || candidate.phase !== 3 || candidate.status !== "PASS" || candidate.integrity !== "VALID") found.push("identity");
  if (candidate.baseSha !== baseSha || candidate.headSha !== candidate.baseSha) found.push("base");
  if (!candidate.indexEmpty) found.push("index");
  if (JSON.stringify(candidate.exactDirtyPaths) !== JSON.stringify(exactDirtyAllowlist)) found.push("scope_contract");
  if (JSON.stringify(candidate.sources.map(source => source.path)) !== JSON.stringify(exactDirtyAllowlist)) found.push("source_scope");
  if ((options.liveGit ?? true) && JSON.stringify(candidate.exactDirtyPaths) !== JSON.stringify(dirtyPaths())) found.push("scope");
  if (new Set(candidate.exactDirtyPaths).size !== candidate.exactDirtyPaths.length) found.push("scope_duplicates");
  if (candidate.sourceDigest !== digest(JSON.stringify(candidate.sources.map(source => [source.path, source.sha256])))) found.push("source_digest");
  if (candidate.receiptDigest !== digest(JSON.stringify(candidate.receipts.map(receipt => [receipt.path, receipt.sha256])))) found.push("receipt_digest");
  if (candidate.screenshotDigest !== digest(JSON.stringify(candidate.screenshots.map(screenshot => [screenshot.path, screenshot.sha256])))) found.push("screenshot_digest");
  if (options.liveBindings ?? true) for (const binding of [...candidate.sources, ...candidate.receipts, ...candidate.screenshots]) if (JSON.stringify(binding) !== JSON.stringify(bind(binding.path))) found.push(`binding:${binding.path}`);
  if (candidate.checks.length < 19 || candidate.checks.some(check => check.status !== "PASS" && check.status !== "BASELINE_UNCHANGED")) found.push("checks");
  const requiredEvidence = [
    "noDraftHomeUnchanged", "validPromptDecision", "clickTimeRevalidation", "exactPersistedStateRehydration",
    "matchingSourceIdentityPreserved", "staleSourceDetached", "missingSourceDetached", "invalidRecoveryDisabled",
    "corruptDraftDiscardable", "quotaFailurePreservesLastGood", "concurrentSingleWinner", "matchingSaveExactClear",
    "detachedSaveCreatesSeparateProject", "saveAsRegression", "saveAndExitRegression", "openRegression", "exportRegression",
    "protectedWorkspaceRegressions", "confirmedDiscardOfficialIsolation", "discardFailureContinueHome", "compactReducedMotionKeyboard",
  ];
  if (requiredEvidence.some(key => candidate.evidence[key] !== "PASS")) found.push("evidence");
  if (candidate.evidence.recoverWritesOfficialBytes !== 0) found.push("official_writes");
  if (typeof candidate.evidence.startupElapsedMs !== "number" || candidate.evidence.startupElapsedMs >= 3_000) found.push("startup_time");
  const heap = candidate.evidence.startupUsedJsHeapBytes;
  if (heap !== null && (typeof heap !== "number" || heap > 335_544_320)) found.push("startup_heap");
  const zeroIsolation = ["externalRequests", "providerRequests", "aiCalls", "paidCalls", "creditChanges", "liveTerraCalls", "terraSourceChanges", "exportSourceChanges", "controlPlaneChanges", "dependencyChanges"];
  if (zeroIsolation.some(key => candidate.isolation[key] !== 0)) found.push("isolation");
  if (candidate.review.url !== "http://127.0.0.1:57630/" || candidate.review.port !== 57630 || candidate.review.command !== "npm run dev -- --port 57630" || !Number.isSafeInteger(candidate.review.serverPid) || candidate.review.serverPid <= 0 || candidate.review.humanAcceptance !== "pending Arthur" || !candidate.review.serverPreserved) found.push("review");
  if (candidate.lifecycle.controlPlaneUpdated || candidate.lifecycle.gitPublication || candidate.lifecycle.phase4Started) found.push("lifecycle");
  return found;
};

assert.deepEqual(errors(manifest), []);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), baseSha); assertions += 1;
assert.equal(execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" }).trim(), ""); assertions += 1;
execFileSync("git", ["diff", "--check"]); assertions += 1;
execFileSync("git", ["diff", "--cached", "--check"]); assertions += 1;
process.kill(manifest.review.serverPid, 0); assertions += 1;

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
reject("screenshot-binding", candidate => { candidate.screenshots[0].sha256 = "0".repeat(64); });
reject("assertion", candidate => { candidate.checks[0].status = "FAIL"; });
reject("official-write", candidate => { candidate.evidence.recoverWritesOfficialBytes = 1; });
reject("performance", candidate => { candidate.evidence.startupElapsedMs = 3_000; });
reject("network", candidate => { candidate.isolation.externalRequests = 1; });
reject("cost", candidate => { candidate.isolation.paidCalls = 1; });
reject("ai-source", candidate => { candidate.isolation.terraSourceChanges = 1; });
reject("review", candidate => { candidate.review.port = 57631; });
reject("lifecycle", candidate => { candidate.lifecycle.gitPublication = true; });

const response = await fetch(manifest.review.url);
assert.equal(response.status, 200); assertions += 1;
assert.ok((await response.text()).length > 1_000); assertions += 1;

const result = {
  status: "VALID", assertions, rejectedMutations, manifest: bind(manifestPath),
  manifestSha256: digest(readFileSync(manifestPath)), exactDirtyPaths: manifest.exactDirtyPaths,
  reviewUrl: manifest.review.url, serverPid: manifest.review.serverPid,
};
writeFileSync("output/spec-0010/phase-3/validation.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
