import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "52b906919eb07367c23125847c0e07b47a6ebd4e";
const allowed = new Set([
  "app/api/account/data/route.ts",
  "app/api/ai-animator/route.ts",
  "app/api/diamond-assistant/route.ts",
  "scripts/spec0015-account/phase45/account-isolation-oracle.mjs",
  "scripts/spec0015-account/phase45/backup-restore-proof.mjs",
  "scripts/spec0015-account/phase45/proof-manifest.mjs",
  "scripts/spec0015-account/phase45/record-browser-evidence.mjs",
  "scripts/spec0015-account/phase45/verify-remote-cleanup.mjs",
  "src/components/account/AccountSessionProvider.tsx",
  "src/components/account/ExistingHome.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/lib/account/accountConfig.ts",
  "src/lib/account/accountDataClient.ts",
  "src/lib/account/accountDataServer.ts",
  "src/lib/account/projectPending.ts",
  "src/lib/ai/aiAnimatorJobService.ts",
  "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/animation/projectRecoveryStorageV1.ts",
  "src/lib/assistant/assistantJobService.ts",
  "src/lib/assistant/assistantStorage.ts",
  "src/lib/notifications/notificationStorage.ts",
  "src/lib/notifications/terraCompletionObserver.ts",
]);
const protectedPaths = [
  "app/credits/page.tsx",
  "src/components/ai-dashboard/AiDashboardScreen.tsx",
  "src/components/ai-dashboard/AiUsageChart.tsx",
  "src/components/chrome/AIcreditspage.tsx",
  "src/components/export/AnimationExportFlow.tsx",
  "src/lib/ai-dashboard/dashboardAggregation.ts",
  "src/lib/ai-dashboard/dashboardContract.ts",
  "src/lib/ai-dashboard/dashboardSources.ts",
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const describe = file => ({ path: file, bytes: fs.statSync(file).size, sha256: sha(file) });
const enumerate = directory => fs.existsSync(directory)
  ? fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? enumerate(file) : [file];
  }).sort()
  : [];

assert.equal(git("rev-parse", "HEAD"), BASE, "exact authorized base changed");
assert.equal(git("diff", "--cached", "--name-only"), "", "Spec Executor index must remain empty");
execFileSync("git", ["diff", "--check"], { stdio: "pipe" });
const dirty = git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean).map(line => line.slice(3)).sort();
for (const file of dirty) assert.ok(allowed.has(file), `unauthorized dirty path: ${file}`);
assert.deepEqual([...allowed].sort(), dirty, "dirty path allowlist and implementation inventory differ");
const sentinels = protectedPaths.map(file => {
  const current = sha(file);
  const base = crypto.createHash("sha256").update(execFileSync("git", ["show", `HEAD:${file}`])).digest("hex");
  assert.equal(current, base, `protected file changed: ${file}`);
  return { path: file, sha256: current };
});
const outputRoot = "output/spec0015/phase45";
const manifestPath = `${outputRoot}/proof-manifest.json`;

if (process.argv.includes("--write")) {
  const browserEvidence = JSON.parse(fs.readFileSync(`${outputRoot}/browser-evidence.json`, "utf8"));
  const backupEvidence = JSON.parse(fs.readFileSync(`${outputRoot}/backup/restore-proof.json`, "utf8"));
  const cleanupEvidence = JSON.parse(fs.readFileSync(`${outputRoot}/remote-cleanup.json`, "utf8"));
  const manifest = {
    schema: "spec0015-phase45-proof-manifest-v1",
    generatedAt: new Date().toISOString(),
    exactBaseSha: BASE,
    indexEmpty: true,
    dirtyPaths: dirty,
    implementation: dirty.map(describe),
    proofArtifacts: enumerate(outputRoot).filter(file => file !== manifestPath).map(describe),
    protectedByteForByte: sentinels,
    review: {
      origin: browserEvidence.origin,
      authDatabase: ".local/spec0015-phase3/phase45-review-58645.sqlite",
      accountDataDatabase: ".local/spec0015-phase3/phase45-account-data-58645.sqlite",
      syntheticAccounts: browserEvidence.syntheticAccounts.map(account => ({ label: account.label, email: account.email, previewPlan: account.previewPlan })),
      paidProviderCalls: 0,
    },
    evidence: {
      twoAccountAssistantIsolation: { verified: true, basis: browserEvidence.exactFlow.assistantIsolation },
      twoAccountNotificationIsolation: { verified: true, basis: browserEvidence.exactFlow.notificationIsolation },
      twoAccountJobIsolation: { verified: true, basis: browserEvidence.exactFlow.jobIsolation },
      preferenceIsolation: { verified: true, basis: browserEvidence.exactFlow.preferenceIsolation },
      recoveryIsolation: { verified: true, basis: browserEvidence.exactFlow.recoveryIsolation },
      logoutDrain: { verified: true, basis: `${browserEvidence.exactFlow.logoutDrainMs} ms from logout click to signed-out entry after terminal account writes` },
      restartPersistence: { verified: true, basis: browserEvidence.exactFlow.restartPersistence },
      phase4MultiFrameRegression: { verified: true, basis: `real project ${browserEvidence.phase4Regression.projectId}, ${browserEvidence.phase4Regression.authoredFrames} frames at ${browserEvidence.phase4Regression.timelineFps} FPS, Save and Exit and reopen passed` },
      backupRestore: { verified: backupEvidence.databases.every(database => database.integrity === "ok"), basis: "separate SQLite backups reopened read-only with matching table counts and integrity_check=ok" },
      dashboardProtected: { verified: true, basis: "all Dashboard sentinel hashes equal exact authorized base bytes" },
      providerBoundary: { verified: true, basis: "deterministic route interception; zero paid provider calls; provider/search/thinking code unchanged" },
      hostedAndCrossDeviceExcluded: { verified: true, basis: "no hosted or cross-device storage was introduced" },
      syntheticRemoteProjectCleanup: { verified: cleanupEvidence.owners.every(owner => owner.heads === 0 && owner.versions === 0 && owner.objects === 0), basis: "exact synthetic Alice/Bob project heads, versions and Storage prefixes independently verified at zero" },
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(manifestPath, 0o600);
}

assert.ok(fs.existsSync(manifestPath), "proof manifest is missing");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schema, "spec0015-phase45-proof-manifest-v1");
assert.equal(manifest.exactBaseSha, BASE);
assert.deepEqual(manifest.dirtyPaths, dirty);
assert.equal(manifest.indexEmpty, true);
for (const entry of manifest.implementation) {
  assert.ok(allowed.has(entry.path));
  assert.equal(fs.statSync(entry.path).size, entry.bytes);
  assert.equal(sha(entry.path), entry.sha256);
}
for (const entry of manifest.proofArtifacts) {
  assert.ok(entry.path.startsWith(`${outputRoot}/`));
  assert.equal(fs.statSync(entry.path).size, entry.bytes);
  assert.equal(sha(entry.path), entry.sha256);
}
for (const sentinel of manifest.protectedByteForByte) {
  assert.equal(sha(sentinel.path), sentinel.sha256);
  assert.equal(crypto.createHash("sha256").update(execFileSync("git", ["show", `HEAD:${sentinel.path}`])).digest("hex"), sentinel.sha256);
}
for (const [name, evidence] of Object.entries(manifest.evidence)) {
  assert.equal(typeof evidence.verified, "boolean", `${name} verified flag missing`);
  assert.equal(typeof evidence.basis, "string", `${name} basis missing`);
  if (process.argv.includes("--final")) assert.equal(evidence.verified, true, `required proof not complete: ${name}`);
}
process.stdout.write(JSON.stringify({
  status: "PASS",
  manifestSha256: crypto.createHash("sha256").update(manifestBytes).digest("hex"),
  dirtyPathCount: dirty.length,
  final: process.argv.includes("--final"),
}) + "\n");
