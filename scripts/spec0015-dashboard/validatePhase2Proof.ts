import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "02a80577f562e9524d2e177c222d19f99f517278";
const allowed = [
  "app/api/ai-animator/route.ts", "app/api/diamond-assistant-transcription/route.ts", "app/api/diamond-assistant/route.ts",
  "app/api/usage-journal/route.ts", "scripts/fixtures/spec0015-dashboard/phase2.json",
  "scripts/spec0015-dashboard/phase2BrowserProof.ts", "scripts/spec0015-dashboard/phase2BuildProof.ts",
  "scripts/spec0015-dashboard/phase2Oracle.ts", "scripts/spec0015-dashboard/phase2ProtectedRegressions.ts",
  "scripts/spec0015-dashboard/phase2RuntimeProof.ts", "scripts/spec0015-dashboard/recordPhase2Proof.ts",
  "scripts/spec0015-dashboard/validatePhase2Proof.ts", "src/lib/ai/aiAnimatorJobService.ts",
  "src/lib/assistant/assistantJobService.ts", "src/lib/assistant/assistantProvider.ts",
  "src/lib/assistant/assistantTranscriptionService.ts", "src/lib/openai/generateAiAnimatorReply.ts",
  "src/lib/usage-journal/usageJournalContract.ts", "src/lib/usage-journal/usageJournalEvents.ts",
  "src/lib/usage-journal/usageJournalProjection.ts", "src/lib/usage-journal/usageJournalRuntime.ts",
  "src/lib/usage-journal/usageJournalStore.ts",
].sort();
const output = resolve("output/spec0015/phase2");
const manifestPath = resolve(output, "proof-manifest.json");
const excluded = new Set(["proof-manifest.json", "proof-manifest.sha256", "validation.json"]);
const required = ["oracle.json", "runtime/runtime.json", "browser/browser.json", "browser/dashboard-byte-identical.png",
  "browser/dashboard-mobile-byte-identical.png", "protected/protected.json", "protected/dashboard-after-ordinary-ai.png",
  "protected/export/final-review.png", "protected/export/mp4/phase3-original-720.mp4", "build/build.json"];
type FileRecord = { path: string; bytes: number; sha256: string };
type Manifest = {
  schema: string;
  identity: { base: string; head: string; branch: string; detached: boolean; worktree: string; role: string };
  git: { dirtyPaths: string[]; indexEmpty: boolean; stagedPaths: string[]; diffCheck: string; committed: boolean; merged: boolean; pushed: boolean; published: boolean };
  implementation: FileRecord[];
  evidence: FileRecord[];
  receipts: { oracleChecks: number; runtimeChecks: number; browserChecks: number; protectedBrowserAssertions: number; protectedOwnerPaths: number;
    assistantMockPosts: number; projectMockPosts: number; liveAttempts: number; liveNotDispatched: number; localMp4Bytes: number; localMp4Sha256: string };
  privacy: Record<string, string | number | boolean>;
  coverage: Record<string, boolean>;
  network: { externalBrowserRequests: number; buildDeniedRequests: number; realProviderCalls: number; paidCalls: number };
  build: { focused: string; full: string; baselineDiagnosticIdentical: boolean; productionReady: boolean };
  review: { url: string; apiUrl: string; port: number; pid: number; cwd: string; serverActive: boolean; sealedLocalEnvironmentPresent: boolean; automatedProviderCallsAgainstSealedEnvironment: number };
  boundaries: Record<string, boolean>;
};
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const dirty = () => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" })
  .split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
function evidenceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, `proof symlink: ${path}`);
    return stat.isDirectory() ? evidenceFiles(path) : stat.isFile() ? [path] : [];
  });
}
function validate(manifest: Manifest, checkFiles: boolean) {
  assert.equal(manifest.schema, "spec0015-phase2-proof-manifest/v1");
  assert.deepEqual(manifest.identity, { base, head: base, branch: "", detached: true, worktree: process.cwd(), role: "Spec Executor" });
  assert.deepEqual(manifest.git, { dirtyPaths: allowed, indexEmpty: true, stagedPaths: [], diffCheck: "PASS",
    committed: false, merged: false, pushed: false, published: false });
  assert.deepEqual(manifest.implementation.map((item) => item.path).sort(), allowed);
  assert.equal(manifest.implementation.length, allowed.length);
  assert.equal(new Set(manifest.implementation.map((item) => item.path)).size, allowed.length);
  assert.equal(new Set(manifest.evidence.map((item) => item.path)).size, manifest.evidence.length);
  for (const item of [...manifest.implementation, ...manifest.evidence]) {
    assert.ok(item.bytes > 0);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
  }
  for (const path of required) assert.ok(manifest.evidence.some((item) => item.path === path), `missing evidence: ${path}`);
  assert.ok(manifest.receipts.oracleChecks >= 54 && manifest.receipts.runtimeChecks >= 40 && manifest.receipts.browserChecks >= 34);
  assert.ok(manifest.receipts.protectedBrowserAssertions >= 48 && manifest.receipts.protectedOwnerPaths >= 27);
  assert.equal(manifest.receipts.assistantMockPosts, 10);
  assert.equal(manifest.receipts.projectMockPosts, 7);
  assert.equal(manifest.receipts.liveAttempts, 3);
  assert.equal(manifest.receipts.liveNotDispatched, 3);
  assert.ok(manifest.receipts.localMp4Bytes > 0);
  assert.match(manifest.receipts.localMp4Sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.privacy, { retentionDays: 90, localOnly: true, aggregateReadApiOnly: true, fileMode: "0600", directoryMode: "0700",
    promptStored: false, replyStored: false, transcriptStored: false, rawAudioStored: false, searchTextStored: false,
    urlsStored: false, accountStored: false, paymentStored: false, cloudSync: false });
  assert.deepEqual(manifest.coverage, { projectConversation: true, assistantConversation: true, assistantHostedSearch: true, dictation: true,
    xaiConnected: false, animationJobActive: false, retryAttemptCardinalityKnown: false, billingReady: false });
  assert.deepEqual(manifest.network, { externalBrowserRequests: 0, buildDeniedRequests: 0, realProviderCalls: 0, paidCalls: 0 });
  assert.deepEqual(manifest.build, { focused: "PASS", full: "BLOCKED_BY_VERIFIED_BASELINE", baselineDiagnosticIdentical: true, productionReady: false });
  assert.deepEqual(manifest.review, { url: "http://127.0.0.1:58540/credits", apiUrl: "http://127.0.0.1:58540/api/usage-journal", port: 58540,
    pid: manifest.review.pid, cwd: process.cwd(), serverActive: true, sealedLocalEnvironmentPresent: true,
    automatedProviderCallsAgainstSealedEnvironment: 0 });
  assert.ok(manifest.review.pid > 0);
  assert.deepEqual(manifest.boundaries, { phase1DashboardByteIdentical: true, noVisiblePhase2Card: true, ordinaryAiUiPreserved: true,
    notificationsPreserved: true, workspacePreserved: true, exportPreserved: true, providerPayloadsPreserved: true,
    noCanonicalDocsChange: true, noControlPlaneChange: true, noGitPublication: true });
  if (!checkFiles) return;
  assert.equal(git("rev-parse", "HEAD"), base);
  assert.equal(git("branch", "--show-current"), "");
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.deepEqual(dirty(), allowed);
  git("diff", "--check");
  for (const item of manifest.implementation) {
    const bytes = readFileSync(item.path);
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(sha(bytes), item.sha256, item.path);
  }
  const actualEvidence = evidenceFiles(output).map((path) => path.slice(output.length + 1)).filter((path) => !excluded.has(path)).sort();
  assert.deepEqual(manifest.evidence.map((item) => item.path).sort(), actualEvidence);
  for (const item of manifest.evidence) {
    const bytes = readFileSync(resolve(output, item.path));
    assert.equal(bytes.length, item.bytes, item.path);
    assert.equal(sha(bytes), item.sha256, item.path);
  }
  const sidecar = readFileSync(resolve(output, "proof-manifest.sha256"), "utf8").trim().split(/\s+/)[0];
  assert.equal(sidecar, sha(readFileSync(manifestPath)));
  const oracle = JSON.parse(readFileSync(resolve(output, "oracle.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(resolve(output, "runtime/runtime.json"), "utf8"));
  const browser = JSON.parse(readFileSync(resolve(output, "browser/browser.json"), "utf8"));
  const protectedResult = JSON.parse(readFileSync(resolve(output, "protected/protected.json"), "utf8"));
  const build = JSON.parse(readFileSync(resolve(output, "build/build.json"), "utf8"));
  assert.equal(oracle.pass && runtime.pass && browser.pass, true);
  assert.equal(oracle.productRetentionDays, 90);
  assert.deepEqual(runtime.network, { realProviderCalls: 0, paidCalls: 0 });
  assert.deepEqual(browser.network, { externalRequests: [], realProviderCalls: 0, paidCalls: 0 });
  assert.deepEqual(protectedResult.network, { realProviderCalls: 0, paidCalls: 0, externalRequests: [] });
  assert.equal(protectedResult.protectedRuntime.status, "BYTE_IDENTICAL");
  assert.equal(protectedResult.localExport.status, "PASS");
  assert.equal(build.status, "PASS");
  assert.equal(build.fullBuild.status, "BLOCKED_BY_VERIFIED_BASELINE");
  assert.equal(manifest.receipts.localMp4Sha256, sha(readFileSync(resolve(output, "protected/export/mp4/phase3-original-720.mp4"))));
  const listen = execFileSync("lsof", ["-nP", "-iTCP:58540", "-sTCP:LISTEN"], { encoding: "utf8" });
  assert.ok(listen.includes(` ${manifest.review.pid} `) && listen.includes("127.0.0.1:58540"));
  const cwd = execFileSync("lsof", ["-a", "-p", String(manifest.review.pid), "-d", "cwd"], { encoding: "utf8" });
  assert.ok(cwd.includes(process.cwd()));
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
validate(manifest, true);
const mutations: Array<[string, (value: Manifest) => void]> = [
  ["source bytes", (value) => { value.implementation[0].sha256 = "wrong"; }],
  ["missing browser receipt", (value) => { value.evidence = value.evidence.filter((item) => item.path !== "browser/browser.json"); }],
  ["unlisted dirty path", (value) => { value.git.dirtyPaths.push("docs/CURRENT_STATE.md"); }],
  ["raw prompt retained", (value) => { value.privacy.promptStored = true; }],
  ["retention widened", (value) => { value.privacy.retentionDays = 365; }],
  ["external request", (value) => { value.network.externalBrowserRequests = 1; }],
  ["real provider call", (value) => { value.network.realProviderCalls = 1; }],
  ["paid call", (value) => { value.network.paidCalls = 1; }],
  ["false billing readiness", (value) => { value.coverage.billingReady = true; }],
  ["false production readiness", (value) => { value.build.productionReady = true; }],
  ["dashboard regression", (value) => { value.boundaries.phase1DashboardByteIdentical = false; }],
  ["publication leak", (value) => { value.git.pushed = true; }],
];
const rejected: string[] = [];
if (process.argv.includes("--self-test")) {
  for (const [name, mutate] of mutations) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validate(candidate, false), `validator must reject ${name}`);
    rejected.push(name);
  }
}
const result = { schema: "spec0015-phase2-validation/v1", status: "PASS", manifestSha256: sha(readFileSync(manifestPath)),
  implementationPaths: allowed.length, evidenceFiles: manifest.evidence.length, dirtyAllowlistExact: true, indexEmpty: true,
  mutationsRejected: rejected.length, mutations: rejected };
writeFileSync(resolve(output, "validation.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`SPEC-0015 Phase 2 proof validation PASS (${rejected.length} negative mutations rejected)`);
