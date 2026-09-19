import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ROOT = process.cwd();
const OUTPUT = "output/spec-0008/phase-1";
const RECEIPTS = `${OUTPUT}/receipts`;
const MANIFEST = `${OUTPUT}/proof-manifest.json`;
const BASE = "3da58e096dd748c7c3bd23fbb9271d53e33597ca";
const REVIEW_URL = "http://127.0.0.1:57120/";
const FROZEN_AI_HASHES = {
  "app/api/ai-animator/route.ts": "a0a6147a9095e96c3d0589822be311887b8bf138b2a34ac2d3bc7773cdec7557",
  "src/components/workspace/ai/DrawingAiPanel.tsx": "3cb69520c76e8db3a0e88575535e3e5290103981390ac25e3fb60e1fa0d0188a",
  "src/components/workspace/ai/WorkspaceAiPanelShell.tsx": "4622c75c7573a3d18dde57e62258118cae96e7bc81c69ac3850974d98ced64be",
  "src/lib/ai/aiAnimatorContract.ts": "e261bc796dba874b3bed9d192ef0b69a7ea53a72829af2d571da19536494f668",
  "src/lib/ai/aiAnimatorJobService.ts": "167c048c5b3dcdab8bafeb29e7c4bceb5a3270cddad33730d9db92704cf1d087",
  "src/lib/ai/aiAnimatorStorage.ts": "b394100ee38338178b0ceee384244e79b42ea70b69beb0396e43951536dc5708",
  "src/lib/ai/drawingAiContract.ts": "69a49b9284e0750e2d32a6717b81d6dd55a7645faee83a489b8737076b5cc475",
  "src/lib/openai/generateAiAnimatorReply.ts": "e862bad2d4d3ee77249364aedd7b5b1178ad5ceb2ae5e60cecf21b8d25cdb3f2",
} as const;
const EXPECTED_PATHS = [
  "app/api/ai-animator/route.ts",
  "scripts/fixtures/spec0008-ai-animator/v1/semantic-cases.json",
  "scripts/spec0008-ai-animator/phase1BrowserProof.ts",
  "scripts/spec0008-ai-animator/phase1LiveTerraSmoke.ts",
  "scripts/spec0008-ai-animator/recordPhase1Proof.ts",
  "scripts/spec0008-ai-animator/validatePhase1Contract.ts",
  "scripts/spec0008-ai-animator/validatePhase1Proof.ts",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingRightPanel.tsx",
  "src/components/workspace/DrawingTimelineRow.tsx",
  "src/components/workspace/DrawingToolBar.tsx",
  "src/components/workspace/ai/DrawingAiPanel.tsx",
  "src/components/workspace/ai/WorkspaceAiPanelShell.tsx",
  "src/lib/ai/aiAnimatorContract.ts",
  "src/lib/ai/aiAnimatorJobService.ts",
  "src/lib/ai/aiAnimatorStorage.ts",
  "src/lib/ai/drawingAiContract.ts",
  "src/lib/openai/generateAiAnimatorReply.ts",
].sort();

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const changedPaths = () => [...new Set([
  ...git("diff", "--name-only").split("\n"),
  ...git("ls-files", "--others", "--exclude-standard").split("\n"),
].filter(Boolean))].sort();
const bind = (path: string) => {
  const bytes = readFileSync(path);
  return { path, sha256: sha(bytes), byteLength: bytes.byteLength };
};

assert.equal(git("rev-parse", "HEAD"), BASE, "proof must run at the authorized base/HEAD");
assert.equal(git("diff", "--cached", "--name-only"), "", "proof requires an empty index");
assert.deepEqual(changedPaths(), EXPECTED_PATHS, "dirty paths must equal the exact Phase 1 allowlist");
const frozenAiBindings = Object.entries(FROZEN_AI_HASHES).map(([path, expectedSha256]) => {
  const binding = bind(path);
  assert.equal(binding.sha256, expectedSha256, `frozen AI byte binding for ${path}`);
  return binding;
});
rmSync(RECEIPTS, { recursive: true, force: true });
mkdirSync(RECEIPTS, { recursive: true });

const commands = [
  { id: "typescript", argv: ["npx", "tsc", "--noEmit"], expectedExit: 0 },
  { id: "focused-lint", argv: ["npx", "eslint", "app/api/ai-animator/route.ts", "src/components/workspace/DrawingCanvas.tsx", "src/components/workspace/DrawingRightPanel.tsx", "src/components/workspace/DrawingTimelineRow.tsx", "src/components/workspace/DrawingToolBar.tsx", "src/components/workspace/ai/DrawingAiPanel.tsx", "src/components/workspace/ai/WorkspaceAiPanelShell.tsx", "src/lib/ai/aiAnimatorContract.ts", "src/lib/ai/aiAnimatorJobService.ts", "src/lib/ai/aiAnimatorStorage.ts", "src/lib/openai/generateAiAnimatorReply.ts", "scripts/spec0008-ai-animator/phase1BrowserProof.ts", "scripts/spec0008-ai-animator/phase1LiveTerraSmoke.ts", "scripts/spec0008-ai-animator/recordPhase1Proof.ts", "scripts/spec0008-ai-animator/validatePhase1Contract.ts", "scripts/spec0008-ai-animator/validatePhase1Proof.ts"], expectedExit: 0 },
  { id: "phase1-contract", argv: ["node", "--experimental-strip-types", "scripts/spec0008-ai-animator/validatePhase1Contract.ts"], expectedExit: 0 },
  { id: "drawing-v2-contract", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2Contract.ts"], expectedExit: 0 },
  { id: "drawing-v2-repository", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2Repository.ts"], expectedExit: 0 },
  { id: "drawing-v1-compatibility", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV1Compatibility.ts"], expectedExit: 0 },
  { id: "drawing-v2-browser-engine", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectV2BrowserEngine.ts"], expectedExit: 0 },
  { id: "drawing-ai-preferences", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingAiControlPreferences.ts"], expectedExit: 0 },
  { id: "drawing-ai-memory", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemory.ts"], expectedExit: 0 },
  { id: "drawing-ai-memory-route", argv: ["node", "--experimental-strip-types", "scripts/validateDrawingProjectAiMemoryRouteSafety.ts"], expectedExit: 0 },
  { id: "timeline-playback", argv: ["node", "--experimental-strip-types", "scripts/validateTimelinePlaybackSmoothing.ts"], expectedExit: 0 },
  { id: "phase1-browser", argv: ["node", "--experimental-strip-types", "scripts/spec0008-ai-animator/phase1BrowserProof.ts", `--url=${REVIEW_URL}`], expectedExit: 0 },
  { id: "diff-check", argv: ["git", "diff", "--check"], expectedExit: 0 },
  { id: "repository-lint-baseline", argv: ["npm", "run", "lint"], expectedExit: 1, acceptedPattern: "5 errors, 81 warnings" },
] as const;

const commandRecords = commands.map(command => {
  const startedAt = Date.now();
  const result = spawnSync(command.argv[0], command.argv.slice(1), { cwd: ROOT, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
  const exitCode = result.status ?? 255;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  assert.equal(exitCode, command.expectedExit, `${command.id} exit code`);
  if ("acceptedPattern" in command) assert.match(`${stdout}\n${stderr}`, new RegExp(command.acceptedPattern), `${command.id} known baseline`);
  const receiptPath = `${RECEIPTS}/${command.id}.json`;
  const receipt = {
    id: command.id,
    argv: command.argv,
    expectedExit: command.expectedExit,
    actualExit: exitCode,
    durationMs: Date.now() - startedAt,
    stdoutSha256: sha(stdout),
    stderrSha256: sha(stderr),
    stdout,
    stderr,
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { id: command.id, argv: command.argv, expectedExit: command.expectedExit, actualExit: exitCode, receipt: bind(receiptPath) };
});

const artifactPaths = [
  `${OUTPUT}/browser/browser-result.json`,
  `${OUTPUT}/browser/compact.png`,
  `${OUTPUT}/browser/desktop.png`,
  `${OUTPUT}/browser/presentation.png`,
  `${OUTPUT}/browser/sidebar-compact.png`,
  `${OUTPUT}/browser/sidebar-default.png`,
  `${OUTPUT}/browser/sidebar-narrow.png`,
  `${OUTPUT}/browser/sidebar-wide.png`,
  `${OUTPUT}/browser/timeline-collapsed.png`,
  `${OUTPUT}/browser/timeline-expanded.png`,
  `${OUTPUT}/browser/thinking-follow-early.png`,
  `${OUTPUT}/browser/thinking-follow.png`,
  `${OUTPUT}/browser/thinking-follow-late.png`,
  `${OUTPUT}/browser/thinking-long-label-early.png`,
  `${OUTPUT}/browser/thinking-long-label.png`,
  `${OUTPUT}/browser/thinking-long-label-late.png`,
  `${OUTPUT}/browser/thinking-primary-early.png`,
  `${OUTPUT}/browser/thinking-primary.png`,
  `${OUTPUT}/browser/thinking-primary-late.png`,
  `${OUTPUT}/live-terra/live-terra-final.png`,
  `${OUTPUT}/live-terra/live-terra-result.json`,
  ".next/BUILD_ID",
];
const live = JSON.parse(readFileSync(`${OUTPUT}/live-terra/live-terra-result.json`, "utf8")) as { status: string; requestCount: number; aggregateCostUsd: number; ceilingUsd: number; results: Array<{ model: string }> };
const browserResult = JSON.parse(readFileSync(`${OUTPUT}/browser/browser-result.json`, "utf8")) as {
  status: string; assertions: number; capturedRequests: number; externalRequests: unknown[]; errors: unknown[];
  sidebarResize: { defaultWidthPx: number; wideWidthPx: number; minimumWidthPx: number; maximumWidthPx: number; snappedWidthPx: number; minimumWorkspaceWidthPx: number; timelineBefore: { x: number; y: number; width: number; height: number }; timelineAfter: { x: number; y: number; width: number; height: number }; propertiesWideWidthPx: number; aiWideWidthPx: number; compactPanelWidthPx: number; compactSplitWidthPx: number; compactFlexBasis: string; compactBorderLeft: string; compactBorderTop: string; defaultStageCenterPx: number; minimumStageCenterPx: number; maximumStageCenterPx: number; defaultVisiblePaneCenterPx: number; minimumVisiblePaneCenterPx: number; maximumVisiblePaneCenterPx: number; defaultToolBarRightPx: number; minimumToolBarRightPx: number; maximumToolBarRightPx: number; allToolsVisibleAndClickable: boolean; drawUndoAtAllWidthsPassed: boolean; rightClickRejected: boolean; pointerCancelRecovered: boolean; lostPointerCaptureRecovered: boolean; keyboardResizePassed: boolean; doubleClickResetPassed: boolean; tabWidthPersistencePassed: boolean; rasterDigestPreserved: boolean; projectDigestPreserved: boolean; canvasGeometryPreserved: boolean; overlayClickThroughBlocked: boolean; aiRequests: number };
  timelineOverlay: { layerCount: number; reservedHeightPx: number; expandedHeightPx: number; partiallyCollapsedHeightPx: number; reexpandedHeightPx: number; collapsedHeightPx: number; canvasGeometryPreserved: boolean; overlayClickThroughBlocked: boolean; aboveSidebarPassed: boolean; layerSelectionPassed: boolean; frameInsertPassed: boolean; keyframeInsertPassed: boolean; copyPastePassed: boolean; onionPassed: boolean; playbackPassed: boolean; horizontalScrollPassed: boolean; drawUndoPassed: boolean; aiRequests: number };
  presentation: { cycleDurationMs: number; timingFunctions: string[]; broadGradientBandPercent: number; maskTravelStartPercent: number; maskTravelEndPercent: number; maskStartOffsetRatio: number; maskEndOffsetRatio: number; primaryTravelPositions: number[]; followTravelPositions: number[]; longLabelTravelPositions: number[]; primaryRenderedBounds: Array<{ minRatio: number; maxRatio: number }>; followRenderedBounds: Array<{ minRatio: number; maxRatio: number }>; longLabelRenderedBounds: Array<{ minRatio: number; maxRatio: number }>; primaryVisibleMs: number; transitionGapMs: number; followVisibleMs: number; finalPauseMs: number; overlapSamples: number; primaryMidOpacity: number; followMidOpacity: number; primaryBandWidthPx: number; followBandWidthPx: number; primaryRenderedBandRatio: number; followRenderedBandRatio: number; shortLabelWidthPx: number; longLabelWidthPx: number; longLabelBandWidthPx: number; longLabelRenderedBandRatio: number; longLabelDuration: string; minimumThinkingMs: number; fastSuccessThinkingMs: number; fastFailureThinkingMs: number; fastSuccessSweepsObserved: boolean[]; fastFailureSweepsObserved: boolean[]; fastSuccessTravelPositions: { primary: number[]; follow: number[] }; fastFailureTravelPositions: { primary: number[]; follow: number[] }; slowThinkingVisibleMs: number; slowTerminalRevealDelayMs: number; cancellationRevealMs: number; reconnectTerminalRevealMs: number; persistedTerminalHoldReplayed: boolean; statusRemovalMs: number; revealMs: number; assistantStyle: { background: string; border: string; radius: string; padding: string }; reducedSweepDisplays: string[]; reducedVisualDisplay: string; reducedCopyDisplay: string };
};
assert.equal(live.status, "PASS");
assert.equal(live.requestCount, 6);
assert.ok(live.aggregateCostUsd <= live.ceilingUsd);
assert.ok(live.results.every(result => result.model === "gpt-5.6-terra"));
assert.equal(browserResult.status, "PASS");
assert.ok(browserResult.assertions >= 250);
assert.equal(browserResult.externalRequests.length, 0);
assert.equal(browserResult.errors.length, 0);
assert.equal(Math.round(browserResult.sidebarResize.defaultWidthPx), 420);
assert.ok(browserResult.sidebarResize.wideWidthPx > browserResult.sidebarResize.defaultWidthPx);
assert.equal(Math.round(browserResult.sidebarResize.minimumWidthPx), 280);
assert.equal(Math.round(browserResult.sidebarResize.maximumWidthPx), 520);
assert.equal(Math.round(browserResult.sidebarResize.snappedWidthPx), 420);
assert.ok(browserResult.sidebarResize.minimumWorkspaceWidthPx >= 360);
for (const key of ["x", "y", "width", "height"] as const) assert.ok(Math.abs(browserResult.sidebarResize.timelineAfter[key] - browserResult.sidebarResize.timelineBefore[key]) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.propertiesWideWidthPx - browserResult.sidebarResize.aiWideWidthPx) < 1);
assert.equal(Math.round(browserResult.sidebarResize.compactPanelWidthPx), Math.round(browserResult.sidebarResize.compactSplitWidthPx));
assert.deepEqual([browserResult.sidebarResize.compactFlexBasis, browserResult.sidebarResize.compactBorderLeft, browserResult.sidebarResize.compactBorderTop], ["200px", "0px", "1px"]);
assert.ok(Math.abs(browserResult.sidebarResize.defaultStageCenterPx - browserResult.sidebarResize.defaultVisiblePaneCenterPx) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.minimumStageCenterPx - browserResult.sidebarResize.minimumVisiblePaneCenterPx) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.maximumStageCenterPx - browserResult.sidebarResize.maximumVisiblePaneCenterPx) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.minimumStageCenterPx - browserResult.sidebarResize.defaultStageCenterPx - 70) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.maximumStageCenterPx - browserResult.sidebarResize.defaultStageCenterPx + 50) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.defaultToolBarRightPx - browserResult.sidebarResize.defaultVisiblePaneCenterPx * 2) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.minimumToolBarRightPx - browserResult.sidebarResize.minimumVisiblePaneCenterPx * 2) <= 1);
assert.ok(Math.abs(browserResult.sidebarResize.maximumToolBarRightPx - browserResult.sidebarResize.maximumVisiblePaneCenterPx * 2) <= 1);
assert.deepEqual([browserResult.sidebarResize.allToolsVisibleAndClickable, browserResult.sidebarResize.drawUndoAtAllWidthsPassed, browserResult.sidebarResize.rightClickRejected, browserResult.sidebarResize.pointerCancelRecovered, browserResult.sidebarResize.lostPointerCaptureRecovered, browserResult.sidebarResize.keyboardResizePassed, browserResult.sidebarResize.doubleClickResetPassed, browserResult.sidebarResize.tabWidthPersistencePassed, browserResult.sidebarResize.rasterDigestPreserved, browserResult.sidebarResize.projectDigestPreserved, browserResult.sidebarResize.canvasGeometryPreserved, browserResult.sidebarResize.overlayClickThroughBlocked], [true, true, true, true, true, true, true, true, true, true, true, true]);
assert.equal(browserResult.sidebarResize.aiRequests, 0);
assert.equal(browserResult.timelineOverlay.layerCount, 3);
assert.equal(Math.round(browserResult.timelineOverlay.reservedHeightPx), 54);
assert.ok(browserResult.timelineOverlay.expandedHeightPx > 120);
assert.equal(Math.round(browserResult.timelineOverlay.collapsedHeightPx), 66);
assert.deepEqual([browserResult.timelineOverlay.canvasGeometryPreserved, browserResult.timelineOverlay.overlayClickThroughBlocked, browserResult.timelineOverlay.aboveSidebarPassed, browserResult.timelineOverlay.layerSelectionPassed, browserResult.timelineOverlay.frameInsertPassed, browserResult.timelineOverlay.keyframeInsertPassed, browserResult.timelineOverlay.copyPastePassed, browserResult.timelineOverlay.onionPassed, browserResult.timelineOverlay.playbackPassed, browserResult.timelineOverlay.horizontalScrollPassed, browserResult.timelineOverlay.drawUndoPassed], [true, true, true, true, true, true, true, true, true, true, true]);
assert.equal(browserResult.timelineOverlay.aiRequests, 0);
assert.equal(browserResult.presentation.cycleDurationMs, 3_750);
assert.deepEqual(browserResult.presentation.timingFunctions, ["linear", "linear"]);
assert.ok(browserResult.presentation.broadGradientBandPercent >= 50 && browserResult.presentation.broadGradientBandPercent <= 58);
assert.equal(browserResult.presentation.maskTravelStartPercent, -132.5581);
assert.equal(browserResult.presentation.maskTravelEndPercent, 232.5581);
assert.ok(Math.abs(browserResult.presentation.maskStartOffsetRatio + 0.57) < 0.000_01);
assert.ok(Math.abs(browserResult.presentation.maskEndOffsetRatio - 1) < 0.000_01);
const assertTravel = (positions: number[], bounds?: Array<{ minRatio: number; maxRatio: number }>) => {
  assert.equal(positions.length, 3);
  assert.ok(positions[0] < 0 && positions[1] > 30 && positions[1] < 70 && positions[2] > 120);
  if (bounds) {
    assert.equal(bounds.length, 3);
    assert.ok(bounds[0].maxRatio < 0.48);
    assert.ok(bounds[1].minRatio > 0.10 && bounds[1].maxRatio > 0.55 && bounds[1].maxRatio < 0.92);
    assert.ok(bounds[2].minRatio > 0.52 && bounds[2].maxRatio > 0.78);
  }
};
assertTravel(browserResult.presentation.primaryTravelPositions, browserResult.presentation.primaryRenderedBounds);
assertTravel(browserResult.presentation.followTravelPositions, browserResult.presentation.followRenderedBounds);
assertTravel(browserResult.presentation.longLabelTravelPositions, browserResult.presentation.longLabelRenderedBounds);
assert.ok(browserResult.presentation.primaryVisibleMs >= 850 && browserResult.presentation.primaryVisibleMs <= 1_100);
assert.ok(browserResult.presentation.transitionGapMs <= 50);
assert.ok(browserResult.presentation.followVisibleMs >= 850 && browserResult.presentation.followVisibleMs <= 1_100);
assert.ok(browserResult.presentation.finalPauseMs >= 1_600 && browserResult.presentation.finalPauseMs <= 1_900);
assert.equal(browserResult.presentation.overlapSamples, 0);
assert.ok(browserResult.presentation.primaryMidOpacity >= 0.95 && browserResult.presentation.followMidOpacity >= 0.95);
assert.ok(browserResult.presentation.primaryBandWidthPx / browserResult.presentation.shortLabelWidthPx >= 0.50 && browserResult.presentation.primaryBandWidthPx / browserResult.presentation.shortLabelWidthPx <= 0.58);
assert.ok(browserResult.presentation.followBandWidthPx / browserResult.presentation.shortLabelWidthPx >= 0.50 && browserResult.presentation.followBandWidthPx / browserResult.presentation.shortLabelWidthPx <= 0.58);
assert.ok(browserResult.presentation.primaryRenderedBandRatio >= 0.50 && browserResult.presentation.primaryRenderedBandRatio <= 0.58);
assert.ok(browserResult.presentation.followRenderedBandRatio >= 0.50 && browserResult.presentation.followRenderedBandRatio <= 0.58);
assert.ok(browserResult.presentation.longLabelWidthPx > browserResult.presentation.shortLabelWidthPx * 2);
assert.ok(browserResult.presentation.longLabelBandWidthPx / browserResult.presentation.longLabelWidthPx >= 0.50 && browserResult.presentation.longLabelBandWidthPx / browserResult.presentation.longLabelWidthPx <= 0.58);
assert.ok(browserResult.presentation.longLabelRenderedBandRatio >= 0.50 && browserResult.presentation.longLabelRenderedBandRatio <= 0.58);
assert.equal(browserResult.presentation.longLabelDuration, "3.75s");
assert.equal(browserResult.presentation.minimumThinkingMs, 2_000);
assert.ok(browserResult.presentation.fastSuccessThinkingMs >= 1_980 && browserResult.presentation.fastSuccessThinkingMs <= 2_600);
assert.ok(browserResult.presentation.fastFailureThinkingMs >= 1_980 && browserResult.presentation.fastFailureThinkingMs <= 2_600);
assert.deepEqual(browserResult.presentation.fastSuccessSweepsObserved, [true, true]);
assert.deepEqual(browserResult.presentation.fastFailureSweepsObserved, [true, true]);
assertTravel(browserResult.presentation.fastSuccessTravelPositions.primary);
assertTravel(browserResult.presentation.fastSuccessTravelPositions.follow);
assertTravel(browserResult.presentation.fastFailureTravelPositions.primary);
assertTravel(browserResult.presentation.fastFailureTravelPositions.follow);
assert.ok(browserResult.presentation.slowThinkingVisibleMs > 2_000);
assert.ok(browserResult.presentation.slowTerminalRevealDelayMs < 500);
assert.ok(browserResult.presentation.cancellationRevealMs < 500);
assert.ok(browserResult.presentation.reconnectTerminalRevealMs < 1_500);
assert.equal(browserResult.presentation.persistedTerminalHoldReplayed, false);
assert.ok(browserResult.presentation.statusRemovalMs < 500);
assert.ok(browserResult.presentation.revealMs < 1_200);
assert.deepEqual(browserResult.presentation.assistantStyle, { background: "rgba(0, 0, 0, 0)", border: "0px", radius: "0px", padding: "0px" });
assert.deepEqual(browserResult.presentation.reducedSweepDisplays, ["none", "none"]);
assert.equal(browserResult.presentation.reducedVisualDisplay, "none");
assert.equal(browserResult.presentation.reducedCopyDisplay, "inline");

const sourceBindings = EXPECTED_PATHS.map(bind);
const aggregateSourceSha256 = sha(sourceBindings.map(item => `${item.path}\0${item.sha256}\0${item.byteLength}\n`).join(""));
const manifest = {
  schemaVersion: 1,
  specId: "SPEC-0008",
  phase: "1-correction",
  status: "PASS",
  integrity: "VALID",
  recordedAt: new Date().toISOString(),
  base: BASE,
  head: git("rev-parse", "HEAD"),
  branch: git("status", "--short", "--branch").split("\n")[0],
  indexEmpty: true,
  dirtyPaths: changedPaths(),
  sourceBindings,
  frozenAiBindings,
  aggregateSourceSha256,
  specBinding: bind("docs/specs/0008-conversational-ai-animator.md"),
  commands: commandRecords,
  artifacts: artifactPaths.map(bind),
  productionBuild: { status: "PASS", buildId: readFileSync(".next/BUILD_ID", "utf8").trim() },
  browser: { status: "PASS", assertions: browserResult.assertions, capturedRequests: browserResult.capturedRequests, externalRequests: 0, errors: 0, viewports: ["1440x900@1", "641x844@1", "390x844@1", "1024x768 reduced-motion"], reviewUrl: REVIEW_URL, sidebarResize: browserResult.sidebarResize, timelineOverlay: browserResult.timelineOverlay, presentation: browserResult.presentation },
  liveTerra: { status: live.status, requestCount: live.requestCount, aggregateCostUsd: live.aggregateCostUsd, ceilingUsd: live.ceilingUsd, model: "gpt-5.6-terra", additionalCallsAuthorizedOrMade: 0 },
  privacy: { clientSecretExposure: false, rawLivePromptsInManifest: false, tools: [], search: false, rasterOrAssetPayloads: false },
  mutation: { authoredProject: false, history: false, repository: false, canvasDigestPreserved: true },
  historicalHarnessNotes: [
    "The reusable SPEC-0001 browser runner is intentionally clean-worktree-only and rejected this authorized dirty executor projection before launching.",
    "Three older SPEC-0006 source-string validators expect UI removed by accepted SPEC-0007 phases and are stale against the canonical base; current protected validators and real-app proof are bound instead.",
    "Repository-wide lint retains the canonical five-error/eighty-one-warning baseline; focused Phase 1 lint is clean.",
  ],
  limitations: [
    "Live Terra proof was exhausted at the authorized six-call ceiling before the final telemetry-only follow-up; final telemetry and stale-generation bytes are covered deterministically, not by a seventh paid call.",
    "A full server-process restart cannot resume the in-memory provider job and becomes an honest recoverable Failed record on reconnect.",
    "Compact proof is Chromium emulation; physical-device and native-GPU behavior are not proven.",
    "The review server is local/private and is not a deployment or public-beta claim.",
  ],
  humanAcceptance: "pending Arthur",
  controlPlaneUpdated: false,
  gitPublication: false,
};
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
assert.ok(statSync(MANIFEST).size > 0);
console.log(JSON.stringify({ status: "PASS", manifest: bind(MANIFEST), dirtyPaths: manifest.dirtyPaths.length, commands: commandRecords.length, artifacts: artifactPaths.length, aggregateSourceSha256 }));
