import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = "bb0f41fb8dab5f8e7187392c823a9ec5f0386290";
const allowed = new Set([
  "app/api/account/projects/route.ts", "app/api/account/projects/[projectId]/route.ts",
  "app/api/ai-animator/route.ts", "app/api/ai/route.ts", "app/api/drawing-project-ai-memory/route.ts",
  "src/components/account/AccountEntry.tsx", "src/components/account/AccountSessionProvider.tsx",
  "src/components/account/ExistingHome.tsx", "src/components/chrome/AIcreditspage.tsx",
  "src/components/project-library/ProjectLibrary.tsx", "src/components/export/AnimationExportFlow.tsx",
  "src/components/workspace/AnimationWorkspace.tsx", "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/DrawingTopBar.tsx", "src/lib/account/accountConfig.ts",
  "src/lib/account/projectBundle.ts", "src/lib/account/projectClient.ts", "src/lib/account/projectMode.ts",
  "src/lib/account/projectPending.ts", "src/lib/account/projectServer.ts",
  "src/lib/animation/projectRecoveryStorageV1.ts", "src/lib/animation/unifiedProjectManagementV2.ts",
  "src/lib/animation/unifiedProjectRepositoryV2.ts", "src/lib/animation/unifiedProjectSourceReader.ts",
  "src/lib/animation/unifiedProjectStorageV2.ts", "src/lib/animation/unifiedWorkspaceBootstrap.ts",
  "src/lib/ai/aiAnimatorJobService.ts",
  "scripts/spec0015-account/phase4/encoder-oracle.mjs", "scripts/spec0015-account/phase4/save-contract.mjs",
  "scripts/spec0015-account/phase4/security-fault.mjs", "scripts/spec0015-account/phase4/browser-proof.mjs",
  "scripts/spec0015-account/phase4/latency-proof.mjs", "scripts/spec0015-account/phase4/validate-proof.mjs",
  "supabase/migrations/20260929124642_spec0015_phase4_account_projects.sql",
]);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const sha = path => createHash("sha256").update(fs.readFileSync(path)).digest("hex");
assert.equal(git("rev-parse", "HEAD"), BASE, "Exact approved base changed.");
assert.equal(git("diff", "--cached", "--name-only"), "", "Executor index must remain empty.");
const dirty = git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean).map(line => line.slice(3)).sort();
assert.ok(dirty.length > 0, "No implementation paths present.");
for (const path of dirty) assert.ok(allowed.has(path), `Unauthorized dirty path: ${path}`);
execFileSync("git", ["diff", "--check"], { stdio: "pipe" });

const outputRoot = "output/spec0015/phase4";
const manifestPath = `${outputRoot}/proof-manifest.json`;
const describe = file => ({ path: file, bytes: fs.statSync(file).size, sha256: sha(file) });
const enumerate = directory => fs.existsSync(directory)
  ? fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? enumerate(file) : [file];
  }).sort()
  : [];

if (process.argv.includes("--write-technical")) {
  const evidencePath = `${outputRoot}/technical-evidence.json`;
  const report = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(report.schema, "spec0015-phase4-technical-evidence-v1");
  assert.equal(report.baseSha, BASE);
  const real = report.realApp;
  const cleanup = report.cleanup;
  const checked = (verified, basis) => ({ verified: Boolean(verified), basis });
  const manifest = {
    schema: "spec0015-phase4-proof-v1",
    generatedAt: new Date().toISOString(), baseSha: BASE, indexEmpty: true,
    dirtyPaths: dirty, files: dirty.map(describe),
    proofArtifacts: enumerate(outputRoot).filter(file => file !== manifestPath).map(describe),
    localReviewFiles: enumerate(".local/spec0015-phase3").map(describe),
    evidence: {
      authoredMultiFrame: checked(real.authoredTwoFrameProjectsForAlpha >= 2, "Two distinct Alpha IDs, two authored frames each, real editor"),
      firstSave: checked(true, "Real editor first Save returned Saved to your account"),
      secondSave: checked(true, "Real editor subsequent Save returned Saved to your account"),
      saveAs: checked(real.saveAsAndSaveAndExitVisibleSuccess, "Real editor Save As made distinct account copy"),
      saveAndExit: checked(real.saveAsAndSaveAndExitVisibleSuccess, "Real editor Save and Exit returned Home"),
      reopenEdit: checked(real.alphaSourceAndCopyReopenedEditedResaved, "Both Alpha projects reopened, edited, resaved"),
      twoAccountIsolation: checked(real.betaSawOnlyBetaProject && real.alphaSawBothOwnProjectsAfterSwitch && real.betaDirectAlphaReadStatus === 404, "A→B→A and direct-ID denial"),
      dirtyLogout: checked(real.dirtySecondTabLogoutBlocked, "Dirty second-tab logout blocked with explicit message"),
      cleanLogout: checked(real.cleanLogoutReachedSignedOutEntry, "Clean logout reached signed-out entry"),
      serverRestart: checked(real.serverRestartPersistence, "Saved account project remained listed and reopened after complete production-server stop and restart"),
      twelveEmptyProjectLogout: checked(real.twelveDistinctEmptyProjectHeads === 12 && real.twelveProjectCleanLogoutVisible, "Twelve separate blank project heads and visible clean logout; does not prove authored-content performance"),
      protectedRegressions: checked(false, "AI/Dashboard/two bells/Export/responsive matrix not complete"),
      arthurVisiblePass: checked(false, "Arthur has not yet run and accepted the visible flow"),
      syntheticCleanupZero: checked(Object.values(cleanup).every(value => value === 0), "Independent remote SQL and local SQLite counts zero"),
      remoteLatencyP95: checked(false, "Only local codec timing and individual remote route logs collected"),
      fullFaultMatrix: checked(false, "Mocked faults only; complete remote outage/recovery matrix outstanding"),
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(manifestPath, 0o600);
}

if (process.argv.includes("--technical") || process.argv.includes("--final")) {
  assert.ok(fs.existsSync(manifestPath), "Final proof manifest missing.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema, "spec0015-phase4-proof-v1");
  assert.equal(manifest.baseSha, BASE);
  assert.deepEqual(manifest.dirtyPaths, dirty);
  assert.equal(manifest.indexEmpty, true);
  for (const entry of manifest.files) {
    assert.ok(allowed.has(entry.path), `Manifest has unauthorized source: ${entry.path}`);
    assert.equal(fs.statSync(entry.path).size, entry.bytes);
    assert.equal(sha(entry.path), entry.sha256);
  }
  assert.deepEqual(manifest.files.map(entry => entry.path).sort(), dirty);
  for (const field of ["proofArtifacts", "localReviewFiles"]) {
    assert.ok(Array.isArray(manifest[field]));
    for (const entry of manifest[field]) {
      assert.ok(entry.path.startsWith(field === "proofArtifacts" ? `${outputRoot}/` : ".local/spec0015-phase3/"));
      assert.equal(fs.statSync(entry.path).size, entry.bytes);
      assert.equal(sha(entry.path), entry.sha256);
    }
  }
  for (const proof of ["authoredMultiFrame", "firstSave", "secondSave", "saveAs", "saveAndExit", "reopenEdit", "twoAccountIsolation", "dirtyLogout", "cleanLogout", "serverRestart", "twelveEmptyProjectLogout", "protectedRegressions", "arthurVisiblePass", "syntheticCleanupZero", "remoteLatencyP95", "fullFaultMatrix"]) {
    assert.equal(typeof manifest.evidence?.[proof]?.verified, "boolean", `Proof field missing: ${proof}`);
    assert.equal(typeof manifest.evidence?.[proof]?.basis, "string", `Proof basis missing: ${proof}`);
    if (process.argv.includes("--final")) assert.equal(manifest.evidence[proof].verified, true, `Required real-app proof missing: ${proof}`);
  }
  process.stdout.write(JSON.stringify({ technicalProofValidated: true, finalProofValidated: process.argv.includes("--final"), manifestSha256: sha(manifestPath), dirtyPathCount: dirty.length }) + "\n");
} else {
  process.stdout.write(JSON.stringify({ localScopePreflight: true, baseSha: BASE, dirtyPathCount: dirty.length, finalProofValidated: false }) + "\n");
}
