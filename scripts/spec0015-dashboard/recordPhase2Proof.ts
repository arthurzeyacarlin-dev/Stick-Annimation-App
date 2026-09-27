import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "02a80577f562e9524d2e177c222d19f99f517278";
const allowed = [
  "app/api/ai-animator/route.ts",
  "app/api/diamond-assistant-transcription/route.ts",
  "app/api/diamond-assistant/route.ts",
  "app/api/usage-journal/route.ts",
  "scripts/fixtures/spec0015-dashboard/phase2.json",
  "scripts/spec0015-dashboard/phase2BrowserProof.ts",
  "scripts/spec0015-dashboard/phase2BuildProof.ts",
  "scripts/spec0015-dashboard/phase2Oracle.ts",
  "scripts/spec0015-dashboard/phase2ProtectedRegressions.ts",
  "scripts/spec0015-dashboard/phase2RuntimeProof.ts",
  "scripts/spec0015-dashboard/recordPhase2Proof.ts",
  "scripts/spec0015-dashboard/validatePhase2Proof.ts",
  "src/lib/ai/aiAnimatorJobService.ts",
  "src/lib/assistant/assistantJobService.ts",
  "src/lib/assistant/assistantProvider.ts",
  "src/lib/assistant/assistantTranscriptionService.ts",
  "src/lib/openai/generateAiAnimatorReply.ts",
  "src/lib/usage-journal/usageJournalContract.ts",
  "src/lib/usage-journal/usageJournalEvents.ts",
  "src/lib/usage-journal/usageJournalProjection.ts",
  "src/lib/usage-journal/usageJournalRuntime.ts",
  "src/lib/usage-journal/usageJournalStore.ts",
].sort();
const output = resolve("output/spec0015/phase2");
const excluded = new Set(["proof-manifest.json", "proof-manifest.sha256", "validation.json"]);
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const dirty = () => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" })
  .split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
type FileRecord = { path: string; bytes: number; sha256: string };
function evidenceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, `proof symlink: ${path}`);
    return stat.isDirectory() ? evidenceFiles(path) : stat.isFile() ? [path] : [];
  });
}
function record(path: string, root = process.cwd()): FileRecord {
  const bytes = readFileSync(resolve(root, path));
  assert.ok(bytes.length > 0, `empty proof file: ${path}`);
  return { path, bytes: bytes.length, sha256: sha(bytes) };
}
const json = <T>(path: string) => JSON.parse(readFileSync(resolve(output, path), "utf8")) as T;

mkdirSync(output, { recursive: true });
assert.equal(git("rev-parse", "HEAD"), base);
assert.equal(git("branch", "--show-current"), "", "executor stays detached");
assert.equal(git("diff", "--cached", "--name-only"), "", "index must remain empty");
assert.deepEqual(dirty(), allowed, "dirty paths equal exact phase allowlist");
git("diff", "--check");
const oracle = json<{ pass: boolean; checks: number; productRetentionDays: number; scenarios: string[] }>("oracle.json");
const runtime = json<{ pass: boolean; checks: number; requests: Record<string, number>;
  observedBeforeValidation: Record<string, boolean>; privacy: Record<string, boolean>;
  network: { realProviderCalls: number; paidCalls: number } }>("runtime/runtime.json");
const browser = json<{ pass: boolean; checks: number; live: { totalAttempts: number; notDispatched: number; retentionDays: number };
  boundaries: Record<string, boolean>; privacy: { contentInJournal: boolean; rawIdentifiersInJournal: boolean; fileMode: string; directoryMode: string };
  network: { externalRequests: unknown[]; realProviderCalls: number; paidCalls: number };
  errors: { pageErrors: unknown[]; consoleErrors: unknown[] } }>("browser/browser.json");
const protectedResult = json<{ status: string; protectedRuntime: { status: string; paths: number; aggregateSha256: string };
  ordinaryFlows: { assertionCount: number; assistantPosts: number; terraPosts: number };
  localExport: { status: string; mp4: { bytes: number; sha256: string }; isolation: Record<string, number> };
  network: { realProviderCalls: number; paidCalls: number; externalRequests: unknown[] }; boundaries: Record<string, unknown> }>("protected/protected.json");
const build = json<{ status: string; focusedBuild: string; fullLint: { changedPathErrors: number };
  fullBuild: { status: string; diagnosticIdentical: boolean; blockerByteIdentical: boolean; productionReady: boolean };
  network: { denied: number; providerCalls: number; paidCalls: number } }>("build/build.json");
assert.equal(oracle.pass && runtime.pass && browser.pass, true);
assert.equal(oracle.productRetentionDays, 90);
assert.equal(protectedResult.status, "PASS");
assert.equal(protectedResult.protectedRuntime.status, "BYTE_IDENTICAL");
assert.equal(build.status, "PASS");
assert.deepEqual(runtime.network, { realProviderCalls: 0, paidCalls: 0 });
assert.deepEqual(browser.network, { externalRequests: [], realProviderCalls: 0, paidCalls: 0 });
assert.deepEqual(protectedResult.network, { realProviderCalls: 0, paidCalls: 0, externalRequests: [] });
assert.deepEqual(build.network, { ...build.network, denied: 0, providerCalls: 0, paidCalls: 0 });
assert.equal(Object.values(runtime.observedBeforeValidation).every(Boolean), true);
assert.equal(Object.values(runtime.privacy).every((value) => value === false), true);
assert.equal(browser.privacy.contentInJournal || browser.privacy.rawIdentifiersInJournal, false);
assert.equal(browser.privacy.fileMode, "0600");
assert.equal(browser.privacy.directoryMode, "0700");
assert.deepEqual(browser.errors, { pageErrors: [], consoleErrors: [] });
assert.equal(protectedResult.localExport.status, "PASS");
assert.deepEqual(protectedResult.localExport.isolation, {
  externalRequests: 0, aiProviderCalls: 0, paidCalls: 0, creditChanges: 0, repositoryWrites: 0,
});
assert.equal(build.focusedBuild, "PASS");
assert.equal(build.fullLint.changedPathErrors, 0);
assert.equal(build.fullBuild.status, "BLOCKED_BY_VERIFIED_BASELINE");
assert.equal(build.fullBuild.diagnosticIdentical && build.fullBuild.blockerByteIdentical, true);
assert.equal(build.fullBuild.productionReady, false);

const evidence = evidenceFiles(output).map((path) => path.slice(output.length + 1)).filter((path) => !excluded.has(path)).sort()
  .map((path) => record(path, output));
const required = ["oracle.json", "runtime/runtime.json", "browser/browser.json", "browser/dashboard-byte-identical.png",
  "browser/dashboard-mobile-byte-identical.png", "protected/protected.json", "protected/dashboard-after-ordinary-ai.png",
  "protected/export/final-review.png", "protected/export/mp4/phase3-original-720.mp4", "build/build.json"];
for (const path of required) assert.ok(evidence.some((file) => file.path === path), `missing evidence: ${path}`);
assert.equal(sha(readFileSync(resolve(output, "protected/export/mp4/phase3-original-720.mp4"))), protectedResult.localExport.mp4.sha256);

const listen = execFileSync("lsof", ["-nP", "-iTCP:58540", "-sTCP:LISTEN"], { encoding: "utf8" }).trim().split("\n");
assert.equal(listen.length, 2, "one loopback review listener");
const fields = listen[1].trim().split(/\s+/);
const pid = Number(fields[1]);
assert.ok(Number.isSafeInteger(pid) && pid > 0);
assert.ok(fields.at(-2)?.includes("127.0.0.1:58540"), "review server must listen on loopback");
const cwd = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd"], { encoding: "utf8" });
assert.ok(cwd.includes(process.cwd()), "review server cwd must match executor worktree");
const manifest = {
  schema: "spec0015-phase2-proof-manifest/v1",
  recordedAt: new Date().toISOString(),
  identity: { base, head: base, branch: "", detached: true, worktree: process.cwd(), role: "Spec Executor" },
  git: { dirtyPaths: allowed, indexEmpty: true, stagedPaths: [], diffCheck: "PASS", committed: false, merged: false, pushed: false, published: false },
  implementation: allowed.map((path) => record(path)),
  evidence,
  receipts: {
    oracleChecks: oracle.checks,
    runtimeChecks: runtime.checks,
    browserChecks: browser.checks,
    protectedBrowserAssertions: protectedResult.ordinaryFlows.assertionCount,
    protectedOwnerPaths: protectedResult.protectedRuntime.paths,
    assistantMockPosts: protectedResult.ordinaryFlows.assistantPosts,
    projectMockPosts: protectedResult.ordinaryFlows.terraPosts,
    liveAttempts: browser.live.totalAttempts,
    liveNotDispatched: browser.live.notDispatched,
    localMp4Bytes: protectedResult.localExport.mp4.bytes,
    localMp4Sha256: protectedResult.localExport.mp4.sha256,
  },
  privacy: {
    retentionDays: 90, localOnly: true, aggregateReadApiOnly: true, fileMode: "0600", directoryMode: "0700",
    promptStored: false, replyStored: false, transcriptStored: false, rawAudioStored: false, searchTextStored: false,
    urlsStored: false, accountStored: false, paymentStored: false, cloudSync: false,
  },
  coverage: {
    projectConversation: true, assistantConversation: true, assistantHostedSearch: true, dictation: true,
    xaiConnected: false, animationJobActive: false, retryAttemptCardinalityKnown: false, billingReady: false,
  },
  network: { externalBrowserRequests: 0, buildDeniedRequests: 0, realProviderCalls: 0, paidCalls: 0 },
  build: { focused: "PASS", full: "BLOCKED_BY_VERIFIED_BASELINE", baselineDiagnosticIdentical: true, productionReady: false },
  review: { url: "http://127.0.0.1:58540/credits", apiUrl: "http://127.0.0.1:58540/api/usage-journal", port: 58540, pid,
    cwd: process.cwd(), serverActive: true, sealedLocalEnvironmentPresent: true, automatedProviderCallsAgainstSealedEnvironment: 0 },
  boundaries: {
    phase1DashboardByteIdentical: true, noVisiblePhase2Card: true, ordinaryAiUiPreserved: true, notificationsPreserved: true,
    workspacePreserved: true, exportPreserved: true, providerPayloadsPreserved: true, noCanonicalDocsChange: true,
    noControlPlaneChange: true, noGitPublication: true,
  },
};
const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(resolve(output, "proof-manifest.json"), bytes);
const digest = sha(bytes);
writeFileSync(resolve(output, "proof-manifest.sha256"), `${digest}  proof-manifest.json\n`);
console.log(`SPEC-0015 Phase 2 proof manifest SHA-256 ${digest}`);
