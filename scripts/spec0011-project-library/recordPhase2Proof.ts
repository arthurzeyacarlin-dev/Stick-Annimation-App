import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const baseSha = "e6f6b1d7887bbbfaed7a9b00b8b472c5b28fe834";
const manifestPath = resolve(root, "output/spec-0011/phase-2/proof-manifest.json");
const receiptsRoot = resolve(root, "output/spec-0011/phase-2/receipts");
mkdirSync(receiptsRoot, { recursive: true });

const allowlist = [
  "scripts/spec0011-project-library/phase2AudioOracle.ts",
  "scripts/spec0011-project-library/phase2BrowserProof.ts",
  "scripts/spec0011-project-library/phase2BuildGate.ts",
  "scripts/spec0011-project-library/phase2Oracle.ts",
  "scripts/spec0011-project-library/recordPhase2Proof.ts",
  "scripts/spec0011-project-library/validatePhase2Proof.ts",
  "src/components/project-library/ProjectLibrary.tsx",
  "src/components/project-player/CanonicalProjectPlayer.tsx",
  "src/components/project-player/ProjectMovieViewer.tsx",
  "src/components/project-player/projectPlayer.module.css",
  "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/lib/export/exportAudio.ts",
  "src/lib/project-player/projectPlayerAudio.ts",
  "src/lib/project-player/projectPlayerClock.ts",
  "src/lib/project-player/projectPlayerGeometry.ts",
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
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1" },
  });
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
assert.equal(git("rev-parse", "main"), baseSha, "local main must remain at the exact authorized base");
assert.equal(git("rev-parse", "origin/main"), baseSha, "origin/main must remain at the exact authorized base");
assert.equal(git("diff", "--cached", "--name-only"), "", "index must remain empty");
assert.deepEqual(actualDirtyPaths(), allowlist, "dirty paths must exactly match the Phase 2 allowlist");

const phase2Scripts = [
  "scripts/spec0011-project-library/phase2AudioOracle.ts",
  "scripts/spec0011-project-library/phase2BrowserProof.ts",
  "scripts/spec0011-project-library/phase2BuildGate.ts",
  "scripts/spec0011-project-library/phase2Oracle.ts",
  "scripts/spec0011-project-library/recordPhase2Proof.ts",
  "scripts/spec0011-project-library/validatePhase2Proof.ts",
  "src/components/project-library/ProjectLibrary.tsx",
  "src/components/project-player/CanonicalProjectPlayer.tsx",
  "src/components/project-player/ProjectMovieViewer.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/lib/export/exportAudio.ts",
  "src/lib/project-player/projectPlayerAudio.ts",
  "src/lib/project-player/projectPlayerClock.ts",
  "src/lib/project-player/projectPlayerGeometry.ts",
];
const receipts = [
  runReceipt("phase2-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0011-project-library/phase2Oracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("phase2-audio-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0011-project-library/phase2AudioOracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("phase1-library-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0011-project-library/phase1Oracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("typescript", resolve("node_modules/.bin/tsc"), ["--noEmit", "--incremental", "false"], { exitCode: 0 }),
  runReceipt("focused-lint", resolve("node_modules/.bin/eslint"), phase2Scripts, { exitCode: 0 }),
  runReceipt("export-phase1-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0009-export/phase1Oracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("export-phase2-oracle", process.execPath, ["--experimental-strip-types", "scripts/spec0009-export/phase2Oracle.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("recovery-phase1-contract", process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase1Contract.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("recovery-phase2-contract", process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase2Contract.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("recovery-phase3-contract", process.execPath, ["--experimental-strip-types", "scripts/spec0010-project-safety/phase3Contract.ts"], { exitCode: 0, outputPattern: /"status":"PASS"/ }),
  runReceipt("diff-check", "git", ["diff", "--check"], { exitCode: 0 }),
  runReceipt("full-lint-baseline", resolve("node_modules/.bin/eslint"), ["."], {
    exitCode: 1,
    outputPattern: /86 problems \(5 errors, 81 warnings\)/,
    baseline: "Inherited exact 5-error/81-warning repository baseline; focused Phase 2 paths are clean.",
  }),
];

const oraclePath = "output/spec-0011/phase-2/oracle/result.json";
const audioOraclePath = "output/spec-0011/phase-2/audio-oracle/result.json";
const buildResultPath = "output/spec-0011/phase-2/build/result.json";
const browserResultPath = "output/spec-0011/phase-2/browser/result.json";
const requestLedgerPath = "output/spec-0011/phase-2/browser/requests.json";
const manualTerraHiPath = "output/spec-0011/phase-2/browser/manual-terra-hi.json";
const oracle = JSON.parse(readFileSync(resolve(root, oraclePath), "utf8"));
const audioOracle = JSON.parse(readFileSync(resolve(root, audioOraclePath), "utf8"));
const buildResult = JSON.parse(readFileSync(resolve(root, buildResultPath), "utf8"));
const browserResult = JSON.parse(readFileSync(resolve(root, browserResultPath), "utf8"));
const requestLedger = JSON.parse(readFileSync(resolve(root, requestLedgerPath), "utf8")) as Array<{ disposition: string; url: string }>;
const manualTerraHi = JSON.parse(readFileSync(resolve(root, manualTerraHiPath), "utf8"));

assert.equal(oracle.status, "PASS");
assert.equal(oracle.inheritedMismatch.productGeometryChanged, false);
assert.equal(oracle.inheritedMismatch.toleranceWeakened, false);
assert.ok(Math.abs(oracle.inheritedMismatch.exportFrame3NormalizedX - oracle.inheritedMismatch.correctedUniformExpectedX) <= oracle.inheritedMismatch.acceptedTolerance);
assert.equal(audioOracle.status, "PASS");
assert.ok(audioOracle.facts.maximumDecodeConcurrency <= 2);
assert.equal(audioOracle.facts.paidCalls, 0);
assert.equal(buildResult.status, "PASS");
assert.equal(buildResult.fullBuild.status, "INHERITED_BASELINE_FAILURE");
assert.equal(buildResult.fullBuild.exactUntouchedPath, "app/dev/ai-costs/lifetime/page.tsx");
assert.equal(buildResult.focusedBuild.status, "PASS");
assert.deepEqual(buildResult.focusedBuild.routes, ["app/page.tsx", "app/api/ai-animator/route.ts"]);
assert.equal(buildResult.fullBuild.deniedNetworkRequests, 0);
assert.equal(buildResult.focusedBuild.deniedNetworkRequests, 0);
assert.equal(browserResult.status, "PASS");
assert.ok(browserResult.assertions >= 100);
assert.equal(browserResult.requests.blocked, 0);
assert.equal(browserResult.requests.providerOrPaid, 0);
assert.equal(requestLedger.length, browserResult.requests.total);
assert.equal(requestLedger.filter(entry => entry.disposition === "blocked").length, 0);
assert.deepEqual(browserResult.errors.page, []);
assert.deepEqual(browserResult.errors.unexpectedConsole, []);
assert.equal(browserResult.storage.unchanged, true);
assert.deepEqual(browserResult.storage.before, browserResult.storage.after);
assert.equal(browserResult.audio.contexts, browserResult.audio.closes);
assert.equal(browserResult.sourceInvalidation.after.contexts, browserResult.sourceInvalidation.after.closes);
assert.ok(browserResult.performance.p95.viewerOpen <= 1_000);
assert.ok(browserResult.performance.p95.playAcknowledgement <= 100);
assert.ok(browserResult.performance.p95.seekCanvasUpdate <= 250);
assert.ok(browserResult.performance.longTasks.maximumMilliseconds <= 250);
assert.equal(browserResult.aiAnimator.productionRoute.status, 404);
assert.ok(browserResult.aiAnimator.productionRoute.contentType.toLowerCase().includes("application/json"));
assert.equal(browserResult.aiAnimator.productionRoute.providerInvoked, false);
assert.equal(browserResult.aiAnimator.exactHi.message, "hi");
assert.equal(browserResult.aiAnimator.exactHi.naturalReplyVisible, true);
assert.equal(browserResult.aiAnimator.exactHi.providerInvoked, false);
assert.equal(manualTerraHi.status, "PASS");
assert.equal(manualTerraHi.message, "hi");
assert.equal(manualTerraHi.submit.status, 202);
assert.equal(manualTerraHi.submit.contentType, "application/json");
assert.equal(manualTerraHi.poll.terminalStatus, 200);
assert.equal(manualTerraHi.poll.contentType, "application/json");
assert.equal(manualTerraHi.provider.calls, 1);
assert.equal(manualTerraHi.provider.model, "gpt-5.6-terra");
assert.equal(manualTerraHi.rawParserTextVisible, false);
assert.equal(manualTerraHi.animationChanged, false);
assert.equal(manualTerraHi.environmentContentsRead, false);

const screenshotPaths = [
  "desktop-unobstructed.png",
  "desktop-fullscreen-unobstructed.png",
  "compact-reduced.png",
  "narrow.png",
  "zoom-200.png",
  "high-contrast.png",
  "terra-hi-natural-reply.png",
].map(name => `output/spec-0011/phase-2/browser/${name}`);
const evidenceArtifacts = [
  oraclePath,
  audioOraclePath,
  buildResultPath,
  "output/spec-0011/phase-2/build/full-network.jsonl",
  "output/spec-0011/phase-2/build/focused-network.jsonl",
  browserResultPath,
  requestLedgerPath,
  manualTerraHiPath,
  ...screenshotPaths,
].map(fileBinding);

assert.equal(git("ls-files", ".env.local"), "", ".env.local must remain ignored and untracked");
assert.equal(git("check-ignore", ".env.local"), ".env.local", ".env.local must remain covered by Git ignore rules");

const manifest = {
  schemaVersion: "spec0011-phase2-proof/v1",
  status: "PASS",
  phase: "SPEC-0011 Phase 2 — Movie Viewer",
  generatedAt: new Date().toISOString(),
  executorOwnership: "sole Spec Executor in dedicated worktree",
  authorizedBaseSha: baseSha,
  headSha: git("rev-parse", "HEAD"),
  localMainSha: git("rev-parse", "main"),
  originMainSha: git("rev-parse", "origin/main"),
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
    requestLedgerArtifact: fileBinding(requestLedgerPath),
    assertions: browserResult.assertions,
    operations: browserResult.operations,
    screenshots: browserResult.screenshots,
    storage: browserResult.storage,
    audio: browserResult.audio,
    sourceInvalidation: browserResult.sourceInvalidation,
    performance: browserResult.performance,
    aiAnimator: browserResult.aiAnimator,
    requests: browserResult.requests,
    errors: browserResult.errors,
  },
  buildEvidence: buildResult,
  manualLiveTerraEvidence: manualTerraHi,
  geometryEvidence: oracle.inheritedMismatch,
  audioEvidence: audioOracle.facts,
  acceptedDataFacts: {
    clockOwner: "one monotonic media-time anchor; AudioContext.currentTime when scheduled, performance.now otherwise",
    frameRule: "min(frameCount - 1, floor(mediaTime * savedFps))",
    audioSchedule: "existing Export attachment owner at frameIndex / savedFps",
    rendererOwner: "renderCanonicalExportFrame committed through a generation-safe scratch canvas",
    viewerStorageWrites: 0,
    recoveryWrites: 0,
    automatedExternalRequests: 0,
    automatedProviderRequests: 0,
    liveProviderRequests: 1,
    paidCalls: 1,
    liveEstimatedCostUsd: manualTerraHi.provider.estimatedCostUsd,
    creditChanges: 0,
  },
  reviewEnvironment: {
    targetUrl: "http://127.0.0.1:57760/",
    productionFocusedBuild: true,
    envTracked: false,
    envIgnored: true,
    envContentsReadByProof: false,
    envContentsRecorded: false,
    envByteIdentityProven: false,
  },
  boundaries: {
    controlPlaneUpdated: false,
    gitPublication: false,
    staged: false,
    committed: false,
    pushed: false,
    deployed: false,
    phase2Implemented: true,
    phase3Implemented: false,
    aiClientResponseHandlingChanged: true,
    aiProviderSourceChanged: false,
    aiPromptModelJobToolBehaviorChanged: false,
    providerCalled: true,
  },
  humanAcceptance: "pending Arthur",
  proven: [
    "one monotonic clock drives frame, time, seek, completion, replay, hidden-page reconciliation, and synchronized saved-audio scheduling",
    "real saved audio scheduling decodes unique assets at concurrency <=2, mixes overlaps, uses mid-clip offsets, trims at duration, stops on pause/seek/invalidation/close, and discloses blocked/corrupt states",
    "desktop, fullscreen, 390x844 reduced motion, 320x568, 200%-zoom-equivalent, dark, high-DPI, and forced-high-contrast browser profiles retain contain geometry and reachable controls",
    "the control strip participates in layout below the animation with no gradient, and blue/yellow authored bottom-edge pixels remain visible in desktop, fullscreen, compact, zoomed, and high-contrast profiles",
    "play-to-end exposes Replay and activating Replay visibly returns to frame 1 while preserving the existing monotonic clock and audio scheduling",
    "the focused production build includes both Home and /api/ai-animator; a provider-free loopback probe returns a structured application/json 404 rather than Next HTML",
    "the exact deterministic hi flow receives JSON 202/200 responses and shows a natural Terra reply; a deterministic HTML failure shows a safe message without parser text or response markup",
    "one authorized live hi used gpt-5.6-terra medium, returned JSON 202 then terminal JSON 200, showed a natural greeting, changed no animation, and incurred an estimated $0.001238",
    "focus order/trap/return, keyboard controls, exact surface toggling, control inactivity reveal/hide, live status, Fullscreen API failure, and Axe serious/critical checks pass",
    "official project and recovery digests remain byte-identical across watch/play/seek/fullscreen/failure/close; a disposable source invalidation closes the viewer and releases audio",
    "five open/play/seek/close cycles meet viewer/play/seek, long-task, heap, and audio-context cleanup ceilings in the accepted production Chromium profile",
    "Save, Save As, Save and Exit, recovery separation, protected workspace controls, Open Project, and the shared Export player path remain available",
    "the inherited SPEC-0009 frame-3 mismatch is stale independent-axis proof math; uniform contain matches within the unchanged 0.025 tolerance and product geometry was not changed",
  ],
  notProven: [
    "physical phones/tablets and non-Chromium browsers",
    "native operating-system audio output and permission UI beyond deterministic AudioContext scheduling/failure injection",
    "native Finder interaction or newly encoded output bytes; encoder and destination owners were intentionally untouched",
    "a fully hydrated 64-project full-resolution collection in this Phase 2 run; the accepted Phase 1 queue bound remains four",
    "the untouched full-repository production build, which still stops at the inherited app/dev/ai-costs/lifetime/page.tsx PageProps searchParams type failure after successful compilation",
  ],
  openRisks: [
    "The repository-wide build remains red only at the exact inherited untouched dev AI-cost route type baseline; the production Home route focused build passes with denied network count zero.",
    "The review server has the inherited missing-favicon 404; it is the only accepted console error and is outside Phase 2.",
  ],
};

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const binding = fileBinding(manifestPath.slice(root.length + 1));
console.log(JSON.stringify({ status: "PASS", manifest: binding.path, byteLength: statSync(manifestPath).size, sha256: binding.sha256, dirtyPaths: allowlist.length, receipts: receipts.length, evidenceArtifacts: evidenceArtifacts.length }));
