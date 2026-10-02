import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "ee93d10121b82fcb256174caa5d7d0ab08886ade";
const allowed = new Set([
  "app/api/account/usage/route.ts",
  "app/api/ai-animator/route.ts",
  "app/api/diamond-assistant-transcription/route.ts",
  "app/api/diamond-assistant/route.ts",
  "scripts/spec0015-account/phase5/cleanup-synthetic.mjs",
  "scripts/spec0015-account/phase5/proof-manifest.mjs",
  "scripts/spec0015-account/phase5/usage-oracle.mjs",
  "src/components/account/AccountEntry.tsx",
  "src/components/ai-dashboard/AiDashboardScreen.tsx",
  "src/lib/account/accountConfig.ts",
  "src/lib/account-usage/accountUsageProjection.ts",
  "src/lib/account-usage/accountUsageStore.ts",
  "src/lib/usage-journal/usageJournalRuntime.ts",
]);
const protectedPaths = [
  "src/components/account/ExistingHome.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/export/AnimationExportFlow.tsx",
  "src/lib/animation/unifiedProjectStorageV2.ts",
  "src/lib/assistant/assistantProvider.ts",
  "src/lib/openai/generateAiAnimatorReply.ts",
  "src/components/ai-dashboard/AiUsageChart.tsx",
  "src/lib/ai-dashboard/dashboardAggregation.ts",
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const file = name => ({ path: name, bytes: fs.statSync(name).size, sha256: sha(fs.readFileSync(name)) });
const output = path.resolve("output/spec0015/phase5/proof-manifest.json");

assert.equal(git("rev-parse", "HEAD"), BASE, "Phase 5 must retain its exact authorized base");
assert.equal(git("diff", "--cached", "--name-only"), "", "Spec Executor index must remain empty");
execFileSync("git", ["diff", "--check"]);
const dirty = git("status", "--porcelain=v1", "--untracked-files=all").split("\n")
  .filter(Boolean).map(line => line.slice(3)).sort();
assert.deepEqual(dirty, [...allowed].sort(), "Phase 5 dirty paths differ from the frozen allowlist");
const protectedHashes = protectedPaths.map(name => {
  const base = sha(execFileSync("git", ["show", `HEAD:${name}`]));
  assert.equal(sha(fs.readFileSync(name)), base, `protected source changed: ${name}`);
  return { path: name, sha256: base };
});

if (process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const manifest = {
    schema: "spec0015-phase5-implementation-proof-v1",
    generatedAt: new Date().toISOString(), exactBaseSha: BASE,
    indexEmpty: true, reviewOrigin: "http://127.0.0.1:58666/",
    dirtyPaths: dirty, implementation: dirty.map(file), protectedByteForByte: protectedHashes,
    evidence: {
      baselineNewProject: "Before Phase 5 edits, a fresh local account created New Project; initial save succeeded after restoring the existing ignored server-only Supabase connection.",
      projectRegression: "In the real browser, two distinct drawn keyframes saved, Save As created a named copy, Save and Exit returned Home, and Open Project reopened both frames; second account's library was empty. PM independently created New Project in B, saved/exited/reopened without invalid_record or save error.",
      phase45Regression: "In the real browser, B Assistant created a chat, returned a live reply, and the saved chat/reply reopened. PM saw Dictate enabled. Account menu logout and returning login completed. Phase 4.5 source paths and notifications internals remain byte-identical; notification delivery and live Dictate transcription were not independently exercised in this Phase 5 pass.",
      aiAndDashboard: "A real low-reasoning synthetic Assistant message returned a reply. Its account Dashboard displayed 1,520 known tokens and $0.0033 estimate, explicitly partial for unknown provider-internal retry coverage; 1,520 remained after logout/login.",
      authenticatedBoundary: "Unauthenticated GET /api/account/usage returned 401. A/B detached-job oracle checks owner-specific records and token totals.",
      technicalOracle: "node scripts/spec0015-account/phase5/usage-oracle.mjs: 25 checks PASS, including detached owner context, A/B separation, dictation cost without token invention, fail-open write, persistent owner-scoped gap after process restart, restricted file mode and bounded per-event write latency.",
      typecheck: "npx tsc --noEmit: PASS",
      lint: "Focused npx eslint on all changed TypeScript paths: PASS",
      build: "npm run build: PASS; optimized production bundle includes /api/account/usage",
      syntheticCleanup: "Exact two synthetic local accounts and their three identified remote test projects were removed after PM browser proof. Cleanup verified zero heads, versions, objects, local account/data/usage rows for both owners; localhost entry returned 200 afterward.",
      limitations: "This is local-installation account usage, not cross-device sync or billing. Legacy dormant /api/ai is not counted. Provider-internal retries may exceed measured usage; Dashboard remains partial. No browser microphone/dictation provider request, full outage, high-volume 5,000+ row browser load, or proof of zero regressions under all future conditions.",
    },
  };
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(output, 0o600);
}

assert.ok(fs.existsSync(output), "proof manifest missing");
const bytes = fs.readFileSync(output);
const manifest = JSON.parse(bytes);
assert.equal(manifest.schema, "spec0015-phase5-implementation-proof-v1");
assert.equal(manifest.exactBaseSha, BASE);
assert.equal(manifest.indexEmpty, true);
assert.deepEqual(manifest.dirtyPaths, dirty);
for (const entry of manifest.implementation) {
  assert.ok(allowed.has(entry.path));
  assert.deepEqual(file(entry.path), entry);
}
for (const entry of manifest.protectedByteForByte) {
  assert.equal(sha(fs.readFileSync(entry.path)), entry.sha256);
  assert.equal(sha(execFileSync("git", ["show", `HEAD:${entry.path}`])), entry.sha256);
}
process.stdout.write(JSON.stringify({ status: "PASS", manifestSha256: sha(bytes),
  dirtyPathCount: dirty.length, exactBaseSha: BASE }) + "\n");
