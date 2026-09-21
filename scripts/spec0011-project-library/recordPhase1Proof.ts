import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const baseSha = "0169c09cc8dbede616fdf099b31925669ec35f6e";
const manifestPath = resolve(root, "output/spec-0011/phase-1/proof-manifest.json");
const receiptsRoot = resolve(root, "output/spec-0011/phase-1/receipts");
mkdirSync(receiptsRoot, { recursive: true });

const allowlist = [
  "app/page.tsx",
  "scripts/spec0011-project-library/phase1BrowserProof.ts",
  "scripts/spec0011-project-library/phase1Fixtures.ts",
  "scripts/spec0011-project-library/phase1Oracle.ts",
  "scripts/spec0011-project-library/recordPhase1Proof.ts",
  "scripts/spec0011-project-library/validatePhase1Proof.ts",
  "src/components/export/AnimationExportFlow.tsx",
  "src/components/project-library/ProjectLibrary.tsx",
  "src/components/project-library/ProjectPoster.tsx",
  "src/components/project-library/projectLibrary.module.css",
  "src/components/project-player/CanonicalProjectPlayer.tsx",
  "src/components/project-player/ProjectMovieViewer.tsx",
  "src/components/project-player/projectPlayer.module.css",
  "src/lib/project-library/projectLibraryController.ts",
  "src/lib/project-library/projectLibraryModel.ts",
].sort();

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const fileBinding = (path: string) => {
  const absolute = resolve(root, path);
  const bytes = readFileSync(absolute);
  return { path, byteLength: bytes.byteLength, sha256: sha256(bytes) };
};
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const actualDirtyPaths = () => [...new Set([
  ...git("ls-files", "-m").split("\n").filter(Boolean),
  ...git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean),
])].sort();

type ReceiptExpectation = { exitCode: number; outputPattern?: RegExp; baseline?: string };
const runReceipt = (id: string, command: string, args: string[], expectation: ReceiptExpectation) => {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = `${stdout}\n${stderr}`;
  const passed = result.status === expectation.exitCode && (!expectation.outputPattern || expectation.outputPattern.test(combined));
  const receipt = {
    id,
    command: [command, ...args],
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    expectedExitCode: expectation.exitCode,
    expectedOutputPattern: expectation.outputPattern?.source ?? null,
    baseline: expectation.baseline ?? null,
    passed,
    stdout,
    stderr,
  };
  const path = resolve(receiptsRoot, `${id}.json`);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.ok(passed, `${id} did not meet its proof expectation`);
  return fileBinding(path.slice(root.length + 1));
};

assert.equal(git("rev-parse", "HEAD"), baseSha, "HEAD must remain at the exact authorized base");
assert.equal(git("diff", "--cached", "--name-only"), "", "index must remain empty");
assert.deepEqual(actualDirtyPaths(), allowlist, "dirty paths must exactly match the Phase 1 allowlist");

const receipts = [
  runReceipt("phase1-oracle", "node", ["--experimental-strip-types", "scripts/spec0011-project-library/phase1Oracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("typescript", "npx", ["tsc", "--noEmit"], { exitCode: 0 }),
  runReceipt("focused-lint", "npx", ["eslint", ...allowlist.filter(path => path.endsWith(".ts") || path.endsWith(".tsx"))], { exitCode: 0 }),
  runReceipt("production-build", "npm", ["run", "build"], { exitCode: 0, outputPattern: /Compiled successfully/ }),
  runReceipt("export-phase1-oracle", "node", ["--experimental-strip-types", "scripts/spec0009-export/phase1Oracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("export-phase2-oracle", "node", ["--experimental-strip-types", "scripts/spec0009-export/phase2Oracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("recovery-phase1-contract", "node", ["--experimental-strip-types", "scripts/spec0010-project-safety/phase1Contract.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("recovery-phase2-contract", "node", ["--experimental-strip-types", "scripts/spec0010-project-safety/phase2Contract.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("recovery-phase3-contract", "node", ["--experimental-strip-types", "scripts/spec0010-project-safety/phase3Contract.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("full-lint-baseline", "npm", ["run", "lint"], { exitCode: 1, outputPattern: /86 problems \(5 errors, 81 warnings\)/, baseline: "Inherited exact 5-error/81-warning repository baseline; focused Phase 1 paths are clean." }),
  runReceipt("inherited-export-browser-replay", "node", ["--experimental-strip-types", "scripts/spec0009-export/correctionBrowserProof.ts", "--url=http://127.0.0.1:57680/"], {
    exitCode: 1,
    outputPattern: /export frame 3 x matches workspace stage mapping: 0\.749406441925578 vs 0\.8215350990452878/,
    baseline: "Exact inherited planning-time mismatch reproduced after all preceding chooser/player assertions; SPEC-0011 records this as a Phase 2 reconciliation gate, not a Phase 1 regression.",
  }),
];

const browserResultPath = "output/spec-0011/phase-1/browser/result.json";
const browserResult = JSON.parse(readFileSync(resolve(root, browserResultPath), "utf8"));
assert.equal(browserResult.status, "PASS");
assert.equal(browserResult.externalRequests, 0);
assert.equal(browserResult.providerRequests, 0);
assert.equal(browserResult.aiRequests, 0);
assert.equal(browserResult.paidRequests, 0);
assert.ok(browserResult.storageReceipts.every((receipt: { writes: unknown[]; before: unknown; after: unknown }) => receipt.writes.length === 0 && JSON.stringify(receipt.before) === JSON.stringify(receipt.after)));
assert.ok(browserResult.performanceReceipts.every((receipt: Record<string, unknown>) => !Object.values(receipt).some(value => typeof value === "number" && !Number.isFinite(value))));

const screenshotPaths = [
  "compact-390x844-library.png",
  "compact-390x844-viewer.png",
  "desktop-library.png",
  "desktop-viewer.png",
  "narrow-320x568-library.png",
  "narrow-320x568-viewer.png",
  "zoom-200-percent-equivalent-library.png",
  "zoom-200-percent-equivalent-viewer.png",
].map(name => `output/spec-0011/phase-1/browser/${name}`);
const evidenceArtifacts = [browserResultPath, ...screenshotPaths].map(fileBinding);

const envSource = "/Users/arthurcarlin/Projects/stick-animation-app/.env.local";
const envTarget = resolve(root, ".env.local");
const envSourcePresent = existsSync(envSource);
const envTargetPresent = existsSync(envTarget);
const envByteIdentical = envSourcePresent && envTargetPresent
  ? spawnSync("cmp", ["-s", envSource, envTarget]).status === 0
  : !envSourcePresent;
assert.ok(envByteIdentical, "review-only .env.local must be byte-identical when the source exists");
assert.equal(git("ls-files", ".env.local"), "", ".env.local must remain ignored and untracked");

const manifest = {
  schemaVersion: "spec0011-phase1-proof/v1",
  status: "PASS",
  phase: "SPEC-0011 Phase 1 — Project Library / My Projects",
  generatedAt: new Date().toISOString(),
  executorOwnership: "sole Spec Executor in dedicated worktree",
  authorizedBaseSha: baseSha,
  headSha: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current") || null,
  detachedHead: spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: root }).status !== 0,
  indexEmpty: git("diff", "--cached", "--name-only") === "",
  dirtyPathAllowlist: allowlist,
  actualDirtyPaths: actualDirtyPaths(),
  sourceArtifacts: allowlist.map(fileBinding),
  evidenceArtifacts,
  commandReceipts: receipts,
  browserEvidence: {
    resultArtifact: fileBinding(browserResultPath),
    assertions: browserResult.assertions,
    operations: browserResult.operations,
    profiles: browserResult.profiles,
    storageReceipts: browserResult.storageReceipts,
    performanceReceipts: browserResult.performanceReceipts,
    externalRequests: browserResult.externalRequests,
    providerRequests: browserResult.providerRequests,
    aiRequests: browserResult.aiRequests,
    paidRequests: browserResult.paidRequests,
    pageErrors: browserResult.pageErrors,
    consoleErrors: browserResult.consoleErrors,
  },
  acceptedDataFacts: {
    collectionOwner: "existing unified V2 collection plus read-only legacy source reader",
    supportedLegacyKinds: ["drawing-v1", "drawing-v2", "stick-v1", "stick-v2", "unified-v1"],
    posterOwner: "loadExportProjectSnapshot + renderCanonicalExportFrame",
    sharedPlayerOwner: "CanonicalProjectPlayer",
    viewerStorageWrites: 0,
    recoveryWrites: 0,
    externalRequests: 0,
  },
  reviewEnvironment: {
    targetUrl: "http://127.0.0.1:57680/",
    envSourcePresent,
    envTargetPresent,
    envByteIdentical,
    envTracked: false,
    envContentsRecorded: false,
  },
  boundaries: {
    controlPlaneUpdated: false,
    gitPublication: false,
    staged: false,
    committed: false,
    pushed: false,
    deployed: false,
    phase2Implemented: false,
    phase3Implemented: false,
    aiSourceChanged: false,
    providerCalled: false,
  },
  humanAcceptance: "pending Arthur",
  proven: [
    "real native V2 plus all five supported legacy source kinds and one invalid record remain visible truthfully",
    "canonical posters and playback use the accepted saved snapshot/evaluator/compositor path",
    "desktop, 390x844 reduced motion, 320x568, keyboard, and 200%-zoom-equivalent CSS viewport have no horizontal overflow or obscured Close action",
    "list, poster, watch, seek, play, close, source-change failure/retry, and Export shared preview issue zero official/recovery writes and zero external/provider/AI/paid requests",
    "Open Project still enters the sole editable workspace and My Projects never mounts it",
    "Export Phase 1 and Phase 2 oracles pass and the inherited frame-3 replay reaches the exact pre-existing mismatch",
  ],
  notProven: [
    "physical phones/tablets and non-Chromium browsers",
    "native Finder interaction or new export encoding bytes in this phase (encoding code was not changed)",
    "Phase 2 synchronized audio/fullscreen/complete accessibility contract",
    "Phase 3 rename/duplicate/delete/search/sort/concurrency contract",
    "64 simultaneously hydrated native full-resolution projects; queue concurrency is deterministically capped at four",
  ],
  openRisks: [
    "The exact inherited SPEC-0009 frame-3 X-mapping proof mismatch remains the already-recorded Phase 2 entry/reconciliation gate.",
  ],
};

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const binding = fileBinding(manifestPath.slice(root.length + 1));
console.log(JSON.stringify({ status: "PASS", manifest: binding.path, byteLength: statSync(manifestPath).size, sha256: binding.sha256, dirtyPaths: allowlist.length, receipts: receipts.length, evidenceArtifacts: evidenceArtifacts.length }));
