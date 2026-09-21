import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const baseSha = "b57ff995df9bb351dacb9a6a79b8cbd23203e988";
const outputRoot = resolve(root, "output/spec-0011/phase-3");
const manifestPath = resolve(outputRoot, "proof-manifest.json");
const receiptsRoot = resolve(outputRoot, "receipts");
mkdirSync(receiptsRoot, { recursive: true });

const allowlist = [
  "app/page.tsx",
  "scripts/spec0011-project-library/phase3BrowserProof.ts",
  "scripts/spec0011-project-library/phase3Oracle.ts",
  "scripts/spec0011-project-library/recordPhase3Proof.ts",
  "scripts/spec0011-project-library/validatePhase3Proof.ts",
  "src/components/open-project/OpenProjectBrowser.tsx",
  "src/components/project-library/ProjectLibrary.tsx",
  "src/components/project-library/projectLibrary.module.css",
  "src/lib/animation/unifiedProjectCollection.ts",
  "src/lib/animation/unifiedProjectManagementV2.ts",
  "src/lib/animation/unifiedProjectRepositoryV2.ts",
  "src/lib/animation/unifiedProjectSourceReader.ts",
  "src/lib/animation/unifiedProjectStorageV2.ts",
  "src/lib/project-library/projectLibraryModel.ts",
].sort();

const focusedPaths = allowlist.filter(path => path.endsWith(".ts") || path.endsWith(".tsx"));
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const fileBinding = (path: string) => {
  const bytes = readFileSync(resolve(root, path));
  return { path, byteLength: bytes.byteLength, sha256: sha256(bytes) };
};
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const actualDirtyPaths = () => [...new Set([
  ...git("ls-files", "-m").split("\n").filter(Boolean),
  ...git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean),
])].sort();

const runReceipt = (id: string, command: string, args: string[], outputPattern?: RegExp) => {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const passed = result.status === 0 && (!outputPattern || outputPattern.test(`${stdout}\n${stderr}`));
  const receipt = { id, command: [command, ...args], startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, passed, stdout, stderr };
  const path = `output/spec-0011/phase-3/receipts/${id}.json`;
  writeFileSync(resolve(root, path), `${JSON.stringify(receipt, null, 2)}\n`);
  assert.ok(passed, `${id} failed`);
  return fileBinding(path);
};

assert.equal(git("rev-parse", "HEAD"), baseSha);
assert.equal(git("rev-parse", "main"), baseSha);
assert.equal(git("rev-parse", "origin/main"), baseSha);
assert.equal(git("diff", "--cached", "--name-only"), "");
assert.deepEqual(actualDirtyPaths(), allowlist);

const receipts = [
  runReceipt("phase3-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0011-project-library/phase3Oracle.ts"], /"status":"PASS"/),
  runReceipt("phase1-library-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0011-project-library/phase1Oracle.ts"], /"status":"PASS"/),
  runReceipt("phase2-player-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0011-project-library/phase2Oracle.ts"], /"status":"PASS"/),
  runReceipt("phase2-audio-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0011-project-library/phase2AudioOracle.ts"], /"status":"PASS"/),
  runReceipt("export-phase1-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0009-export/phase1Oracle.ts"], /"status":"PASS"/),
  runReceipt("export-phase2-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0009-export/phase2Oracle.ts"], /"status":"PASS"/),
  runReceipt("recovery-phase1-contract", process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase1Contract.ts"], /"status":"PASS"/),
  runReceipt("recovery-phase2-contract", process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase2Contract.ts"], /"status":"PASS"/),
  runReceipt("recovery-phase3-contract", process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase3Contract.ts"], /"status":"PASS"/),
  runReceipt("typescript", resolve(root, "node_modules/.bin/tsc"), ["--noEmit", "--incremental", "false"]),
  runReceipt("focused-lint", resolve(root, "node_modules/.bin/eslint"), focusedPaths),
  runReceipt("diff-check", "git", ["diff", "--check"]),
];

const browserPath = "output/spec-0011/phase-3/browser/result.json";
const buildPath = "output/spec-0011/phase-2/build/result.json";
const browser = JSON.parse(readFileSync(resolve(root, browserPath), "utf8"));
const build = JSON.parse(readFileSync(resolve(root, buildPath), "utf8"));
assert.equal(browser.status, "PASS");
assert.ok(browser.assertions >= 39);
assert.equal(browser.externalRequests, 0);
assert.equal(browser.providerRequests, 0);
assert.equal(browser.aiRequests, 0);
assert.equal(browser.paidRequests, 0);
assert.deepEqual(browser.pageErrors, []);
assert.deepEqual(browser.consoleErrors, []);
assert.ok(browser.performanceReceipts.some((receipt: { p95?: { searchMs: number; sortMs: number; menuMs: number } }) =>
  receipt.p95 && receipt.p95.searchMs <= 100 && receipt.p95.sortMs <= 100 && receipt.p95.menuMs <= 100));
assert.equal(build.status, "PASS");
assert.equal(build.fullBuild.status, "INHERITED_BASELINE_FAILURE");
assert.equal(build.fullBuild.exactUntouchedPath, "app/dev/ai-costs/lifetime/page.tsx");
assert.equal(build.focusedBuild.status, "PASS");

const storageByLabel = Object.fromEntries(browser.storageReceipts.map((receipt: { label: string; snapshot: unknown }) => [receipt.label, receipt.snapshot]));
const injectedRecovery = storageByLabel["recovery-conflict-injected"].indexed["diamond-animation-project-recovery-v1"];
const clearedRecovery = storageByLabel["recovery-conflict-cleared"].indexed["diamond-animation-project-recovery-v1"];
const beforeDelete = storageByLabel["before-recovery-conflict"].indexed["diamond-animation-unified-v2"];
const afterDelete = storageByLabel["after-verified-delete"].indexed["diamond-animation-unified-v2"];
const finalState = storageByLabel["final-after-independent-edit-save-export"].indexed["diamond-animation-unified-v2"];
assert.equal(injectedRecovery.heads.count, 1);
assert.equal(clearedRecovery.heads.count, 0);
assert.equal(afterDelete.heads.count, beforeDelete.heads.count - 1);
assert.equal(afterDelete.assets.digest, beforeDelete.assets.digest);
assert.equal(afterDelete.assetMetadata.digest, beforeDelete.assetMetadata.digest);
assert.equal(finalState.heads.count, afterDelete.heads.count);
assert.equal(finalState.versions.count, afterDelete.versions.count + 1);

const protectedFamilies = [
  "package.json", "package-lock.json", "app/api", "src/components/project-player", "src/components/workspace",
  "src/lib/project-player", "src/lib/export", "src/lib/animation/projectRecoveryStorageV1.ts",
];
const protectedChangedPaths = git("diff", "--name-only", baseSha, "--", ...protectedFamilies).split("\n").filter(Boolean);
assert.deepEqual(protectedChangedPaths, []);

const screenshots = [
  "desktop-open-project-shared-shell.png", "compact-390x844-my-projects.png",
  "narrow-320x568-my-projects.png", "zoom-200-percent-equivalent-my-projects.png",
].map(name => `output/spec-0011/phase-3/browser/${name}`);
const evidenceArtifacts = [browserPath, buildPath, ...screenshots].map(fileBinding);

const manifest = {
  schemaVersion: "spec0011-phase3-proof/v1",
  status: "PASS",
  phase: "SPEC-0011 Phase 3 — Shared Management and Polish",
  generatedAt: new Date().toISOString(),
  executorOwnership: "sole Phase 3 Spec Executor in the dedicated detached worktree",
  authorizedBaseSha: baseSha,
  headSha: git("rev-parse", "HEAD"),
  localMainSha: git("rev-parse", "main"),
  originMainSha: git("rev-parse", "origin/main"),
  branch: git("branch", "--show-current") || null,
  detachedHead: spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: root }).status !== 0,
  indexEmpty: true,
  dirtyPathAllowlist: allowlist,
  actualDirtyPaths: actualDirtyPaths(),
  sourceArtifacts: allowlist.map(fileBinding),
  evidenceArtifacts,
  commandReceipts: receipts,
  sourceDigest: sha256(allowlist.map(path => `${path}\0${fileBinding(path).sha256}\0${fileBinding(path).byteLength}`).join("\n")),
  browserEvidence: {
    resultArtifact: fileBinding(browserPath), assertions: browser.assertions, operations: browser.operations,
    screenshots: browser.screenshots, profiles: browser.profiles, performanceReceipts: browser.performanceReceipts,
    storageReceipts: browser.storageReceipts, requestLedger: browser.requestLedger,
    externalRequests: browser.externalRequests, providerRequests: browser.providerRequests,
    aiRequests: browser.aiRequests, paidRequests: browser.paidRequests,
    pageErrors: browser.pageErrors, consoleErrors: browser.consoleErrors,
  },
  buildEvidence: build,
  protectedBaseline: { baseSha, families: protectedFamilies, changedPaths: protectedChangedPaths, unchanged: true },
  acceptedDataFacts: {
    sharedShells: ["My Projects / Watch", "Open Project / Edit"],
    managementOwnerCount: 1,
    sortChoices: 4,
    acceptedCollectionBound: 64,
    recoveryHeadsDuringConflict: injectedRecovery.heads.count,
    recoveryHeadsAfterClear: clearedRecovery.heads.count,
    headsRemovedByDelete: beforeDelete.heads.count - afterDelete.heads.count,
    sharedAssetDigestBeforeDelete: beforeDelete.assets.digest,
    sharedAssetDigestAfterDelete: afterDelete.assets.digest,
    automatedExternalRequests: 0,
    automatedProviderRequests: 0,
    paidCalls: 0,
    creditChanges: 0,
  },
  reviewEnvironment: {
    targetUrl: "http://127.0.0.1:57840/", productionFocusedBuild: true,
    expectedSingleReviewServer: true, physicalDeviceProof: false, nonChromiumProof: false,
  },
  boundaries: {
    controlPlaneUpdated: false, gitPublication: false, staged: false, committed: false, pushed: false, deployed: false,
    phase3Implemented: true, playerChanged: false, exportChanged: false, editorTimelineChanged: false,
    recoveryPolicyChanged: false, packageDependencyChanged: false, aiTerraChanged: false, providerCalled: false,
  },
  humanAcceptance: "pending Arthur",
  proven: [
    "My Projects and Open Project share one authoritative shell while preserving Watch versus Edit behavior.",
    "Local NFC/case-insensitive search, four stable sorts, matching invalid entries, and compact 64-project metadata rendering pass.",
    "Rename is metadata-only with exact CAS; unsafe titles and concurrent stale writes fail safely.",
    "Native and protected-legacy duplicates produce independent V2 heads/history while content-addressed assets remain deduplicated.",
    "Delete blocks open viewer/editor and recovery conflicts, removes one exact native head/history, and retains shared asset bytes.",
    "Visible overflow, pointer context, Shift+F10, menu keyboard navigation, dialog focus, focus return, and non-bubbling routes pass.",
    "Real Chromium passes desktop, 390x844 reduced motion, 320x568 forced colors, and 720x450 200%-zoom-equivalent layouts with zero serious/critical Axe findings.",
    "Search/sort/menu p95 stays below 100 ms and the compact 64-project shell is usable below 2 seconds.",
    "Save/Open/Save As/Save and Exit/Undo/Redo, recovery separation, player, and Export regression evidence passes without modifying protected owners.",
    "All automated network/provider/AI/paid counters are zero.",
  ],
  notProven: [
    "Physical phone/tablet devices and non-Chromium browsers.",
    "Native operating-system context-menu presentation beyond the in-app accessible menu routes.",
    "A clean full-repository production build; compilation still reaches the inherited untouched app/dev/ai-costs/lifetime PageProps failure, while the focused production build passes.",
  ],
  openRisks: [
    "BroadcastChannel delivery is advisory by design; correctness falls back to authoritative storage re-read on storage/focus/visibility events.",
    "Physical-device and non-Chromium behavior awaits later human/platform coverage.",
  ],
};

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const binding = fileBinding("output/spec-0011/phase-3/proof-manifest.json");
console.log(JSON.stringify({ status: "PASS", manifest: binding.path, byteLength: statSync(manifestPath).size, sha256: binding.sha256, sourceDigest: manifest.sourceDigest, dirtyPaths: allowlist.length, receipts: receipts.length, evidenceArtifacts: evidenceArtifacts.length }));
