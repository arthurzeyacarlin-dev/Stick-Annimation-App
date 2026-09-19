import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Binding = { path: string; sha256: string; byteLength: number };
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
type Manifest = {
  schemaVersion: number; specId: string; phase: string; status: string; integrity: string; base: string; head: string;
  indexEmpty: boolean; dirtyPaths: string[]; sourceBindings: Binding[]; frozenAiBindings: Binding[]; aggregateSourceSha256: string; specBinding: Binding;
  commands: Array<{ id: string; expectedExit: number; actualExit: number; receipt: Binding }>;
  artifacts: Binding[]; productionBuild: { status: string; buildId: string };
  browser: { status: string; assertions: number; externalRequests: number; errors: number; reviewUrl: string; sidebarResize: { defaultWidthPx: number; wideWidthPx: number; minimumWidthPx: number; maximumWidthPx: number; snappedWidthPx: number; minimumWorkspaceWidthPx: number; timelineBefore: { x: number; y: number; width: number; height: number }; timelineAfter: { x: number; y: number; width: number; height: number }; propertiesWideWidthPx: number; aiWideWidthPx: number; compactPanelWidthPx: number; compactSplitWidthPx: number; compactFlexBasis: string; compactBorderLeft: string; compactBorderTop: string; defaultStageCenterPx: number; minimumStageCenterPx: number; maximumStageCenterPx: number; defaultVisiblePaneCenterPx: number; minimumVisiblePaneCenterPx: number; maximumVisiblePaneCenterPx: number; defaultToolBarRightPx: number; minimumToolBarRightPx: number; maximumToolBarRightPx: number; allToolsVisibleAndClickable: boolean; drawUndoAtAllWidthsPassed: boolean; rightClickRejected: boolean; pointerCancelRecovered: boolean; lostPointerCaptureRecovered: boolean; keyboardResizePassed: boolean; doubleClickResetPassed: boolean; tabWidthPersistencePassed: boolean; rasterDigestPreserved: boolean; projectDigestPreserved: boolean; canvasGeometryPreserved: boolean; overlayClickThroughBlocked: boolean; aiRequests: number }; timelineOverlay: { layerCount: number; reservedHeightPx: number; expandedHeightPx: number; partiallyCollapsedHeightPx: number; reexpandedHeightPx: number; collapsedHeightPx: number; canvasGeometryPreserved: boolean; overlayClickThroughBlocked: boolean; aboveSidebarPassed: boolean; layerSelectionPassed: boolean; frameInsertPassed: boolean; keyframeInsertPassed: boolean; copyPastePassed: boolean; onionPassed: boolean; playbackPassed: boolean; horizontalScrollPassed: boolean; drawUndoPassed: boolean; aiRequests: number }; presentation: { cycleDurationMs: number; timingFunctions: string[]; broadGradientBandPercent: number; maskTravelStartPercent: number; maskTravelEndPercent: number; maskStartOffsetRatio: number; maskEndOffsetRatio: number; primaryTravelPositions: number[]; followTravelPositions: number[]; longLabelTravelPositions: number[]; primaryRenderedBounds: Array<{ minRatio: number; maxRatio: number }>; followRenderedBounds: Array<{ minRatio: number; maxRatio: number }>; longLabelRenderedBounds: Array<{ minRatio: number; maxRatio: number }>; primaryVisibleMs: number; transitionGapMs: number; followVisibleMs: number; finalPauseMs: number; overlapSamples: number; primaryMidOpacity: number; followMidOpacity: number; primaryBandWidthPx: number; followBandWidthPx: number; primaryRenderedBandRatio: number; followRenderedBandRatio: number; shortLabelWidthPx: number; longLabelWidthPx: number; longLabelBandWidthPx: number; longLabelRenderedBandRatio: number; longLabelDuration: string; minimumThinkingMs: number; fastSuccessThinkingMs: number; fastFailureThinkingMs: number; fastSuccessSweepsObserved: boolean[]; fastFailureSweepsObserved: boolean[]; fastSuccessTravelPositions: { primary: number[]; follow: number[] }; fastFailureTravelPositions: { primary: number[]; follow: number[] }; slowThinkingVisibleMs: number; slowTerminalRevealDelayMs: number; cancellationRevealMs: number; reconnectTerminalRevealMs: number; persistedTerminalHoldReplayed: boolean; statusRemovalMs: number; revealMs: number; assistantStyle: { background: string; border: string; radius: string; padding: string }; reducedSweepDisplays: string[]; reducedVisualDisplay: string; reducedCopyDisplay: string } };
  liveTerra: { status: string; requestCount: number; aggregateCostUsd: number; ceilingUsd: number; model: string; additionalCallsAuthorizedOrMade: number };
  privacy: { clientSecretExposure: boolean; rawLivePromptsInManifest: boolean; tools: unknown[]; search: boolean; rasterOrAssetPayloads: boolean };
  mutation: { authoredProject: boolean; history: boolean; repository: boolean; canvasDigestPreserved: boolean };
  humanAcceptance: string; controlPlaneUpdated: boolean; gitPublication: boolean;
};

const PATH = "output/spec-0008/phase-1/proof-manifest.json";
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const bind = (path: string): Binding => { const bytes = readFileSync(path); return { path, sha256: sha(bytes), byteLength: bytes.byteLength }; };
const changedPaths = () => [...new Set([...git("diff", "--name-only").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].sort();
const sameBinding = (actual: Binding, label: string) => assert.deepEqual(bind(actual.path), actual, label);

const validate = (manifest: Manifest) => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.specId, "SPEC-0008");
  assert.equal(manifest.phase, "1-correction");
  assert.equal(manifest.status, "PASS");
  assert.equal(manifest.integrity, "VALID");
  assert.equal(manifest.base, "3da58e096dd748c7c3bd23fbb9271d53e33597ca");
  assert.equal(manifest.head, git("rev-parse", "HEAD"));
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.equal(manifest.indexEmpty, true);
  assert.deepEqual(manifest.dirtyPaths, changedPaths());
  assert.deepEqual(manifest.sourceBindings.map(item => item.path).sort(), manifest.dirtyPaths);
  manifest.sourceBindings.forEach(item => sameBinding(item, `source ${item.path}`));
  assert.deepEqual(manifest.frozenAiBindings.map(item => item.path), Object.keys(FROZEN_AI_HASHES));
  manifest.frozenAiBindings.forEach(item => {
    sameBinding(item, `frozen AI ${item.path}`);
    assert.equal(item.sha256, FROZEN_AI_HASHES[item.path as keyof typeof FROZEN_AI_HASHES]);
  });
  const aggregate = sha(manifest.sourceBindings.map(item => `${item.path}\0${item.sha256}\0${item.byteLength}\n`).join(""));
  assert.equal(manifest.aggregateSourceSha256, aggregate);
  sameBinding(manifest.specBinding, "spec binding");
  assert.ok(manifest.commands.length >= 14);
  for (const command of manifest.commands) {
    assert.equal(command.actualExit, command.expectedExit, `${command.id} result`);
    sameBinding(command.receipt, `receipt ${command.id}`);
    const receipt = JSON.parse(readFileSync(command.receipt.path, "utf8")) as { id: string; expectedExit: number; actualExit: number };
    assert.equal(receipt.id, command.id);
    assert.equal(receipt.actualExit, receipt.expectedExit);
  }
  manifest.artifacts.forEach(item => sameBinding(item, `artifact ${item.path}`));
  assert.equal(manifest.productionBuild.status, "PASS");
  assert.equal(readFileSync(".next/BUILD_ID", "utf8").trim(), manifest.productionBuild.buildId);
  assert.equal(manifest.browser.status, "PASS");
  assert.ok(manifest.browser.assertions >= 250);
  assert.equal(manifest.browser.externalRequests, 0);
  assert.equal(manifest.browser.errors, 0);
  assert.equal(manifest.browser.reviewUrl, "http://127.0.0.1:57120/");
  assert.equal(Math.round(manifest.browser.sidebarResize.defaultWidthPx), 420);
  assert.ok(manifest.browser.sidebarResize.wideWidthPx > manifest.browser.sidebarResize.defaultWidthPx);
  assert.equal(Math.round(manifest.browser.sidebarResize.minimumWidthPx), 280);
  assert.equal(Math.round(manifest.browser.sidebarResize.maximumWidthPx), 520);
  assert.equal(Math.round(manifest.browser.sidebarResize.snappedWidthPx), 420);
  assert.ok(manifest.browser.sidebarResize.minimumWorkspaceWidthPx >= 360);
  for (const key of ["x", "y", "width", "height"] as const) assert.ok(Math.abs(manifest.browser.sidebarResize.timelineAfter[key] - manifest.browser.sidebarResize.timelineBefore[key]) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.propertiesWideWidthPx - manifest.browser.sidebarResize.aiWideWidthPx) < 1);
  assert.equal(Math.round(manifest.browser.sidebarResize.compactPanelWidthPx), Math.round(manifest.browser.sidebarResize.compactSplitWidthPx));
  assert.deepEqual([manifest.browser.sidebarResize.compactFlexBasis, manifest.browser.sidebarResize.compactBorderLeft, manifest.browser.sidebarResize.compactBorderTop], ["200px", "0px", "1px"]);
  assert.ok(Math.abs(manifest.browser.sidebarResize.defaultStageCenterPx - manifest.browser.sidebarResize.defaultVisiblePaneCenterPx) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.minimumStageCenterPx - manifest.browser.sidebarResize.minimumVisiblePaneCenterPx) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.maximumStageCenterPx - manifest.browser.sidebarResize.maximumVisiblePaneCenterPx) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.minimumStageCenterPx - manifest.browser.sidebarResize.defaultStageCenterPx - 70) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.maximumStageCenterPx - manifest.browser.sidebarResize.defaultStageCenterPx + 50) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.defaultToolBarRightPx - manifest.browser.sidebarResize.defaultVisiblePaneCenterPx * 2) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.minimumToolBarRightPx - manifest.browser.sidebarResize.minimumVisiblePaneCenterPx * 2) <= 1);
  assert.ok(Math.abs(manifest.browser.sidebarResize.maximumToolBarRightPx - manifest.browser.sidebarResize.maximumVisiblePaneCenterPx * 2) <= 1);
  assert.deepEqual([manifest.browser.sidebarResize.allToolsVisibleAndClickable, manifest.browser.sidebarResize.drawUndoAtAllWidthsPassed, manifest.browser.sidebarResize.rightClickRejected, manifest.browser.sidebarResize.pointerCancelRecovered, manifest.browser.sidebarResize.lostPointerCaptureRecovered, manifest.browser.sidebarResize.keyboardResizePassed, manifest.browser.sidebarResize.doubleClickResetPassed, manifest.browser.sidebarResize.tabWidthPersistencePassed, manifest.browser.sidebarResize.rasterDigestPreserved, manifest.browser.sidebarResize.projectDigestPreserved, manifest.browser.sidebarResize.canvasGeometryPreserved, manifest.browser.sidebarResize.overlayClickThroughBlocked], [true, true, true, true, true, true, true, true, true, true, true, true]);
  assert.equal(manifest.browser.sidebarResize.aiRequests, 0);
  assert.equal(manifest.browser.timelineOverlay.layerCount, 3);
  assert.equal(Math.round(manifest.browser.timelineOverlay.reservedHeightPx), 54);
  assert.ok(manifest.browser.timelineOverlay.expandedHeightPx > 120);
  assert.equal(Math.round(manifest.browser.timelineOverlay.collapsedHeightPx), 66);
  assert.deepEqual([manifest.browser.timelineOverlay.canvasGeometryPreserved, manifest.browser.timelineOverlay.overlayClickThroughBlocked, manifest.browser.timelineOverlay.aboveSidebarPassed, manifest.browser.timelineOverlay.layerSelectionPassed, manifest.browser.timelineOverlay.frameInsertPassed, manifest.browser.timelineOverlay.keyframeInsertPassed, manifest.browser.timelineOverlay.copyPastePassed, manifest.browser.timelineOverlay.onionPassed, manifest.browser.timelineOverlay.playbackPassed, manifest.browser.timelineOverlay.horizontalScrollPassed, manifest.browser.timelineOverlay.drawUndoPassed], [true, true, true, true, true, true, true, true, true, true, true]);
  assert.equal(manifest.browser.timelineOverlay.aiRequests, 0);
  assert.equal(manifest.browser.presentation.cycleDurationMs, 3_750);
  assert.deepEqual(manifest.browser.presentation.timingFunctions, ["linear", "linear"]);
  assert.ok(manifest.browser.presentation.broadGradientBandPercent >= 50 && manifest.browser.presentation.broadGradientBandPercent <= 58);
  assert.equal(manifest.browser.presentation.maskTravelStartPercent, -132.5581);
  assert.equal(manifest.browser.presentation.maskTravelEndPercent, 232.5581);
  assert.ok(Math.abs(manifest.browser.presentation.maskStartOffsetRatio + 0.57) < 0.000_01);
  assert.ok(Math.abs(manifest.browser.presentation.maskEndOffsetRatio - 1) < 0.000_01);
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
  assertTravel(manifest.browser.presentation.primaryTravelPositions, manifest.browser.presentation.primaryRenderedBounds);
  assertTravel(manifest.browser.presentation.followTravelPositions, manifest.browser.presentation.followRenderedBounds);
  assertTravel(manifest.browser.presentation.longLabelTravelPositions, manifest.browser.presentation.longLabelRenderedBounds);
  assert.ok(manifest.browser.presentation.primaryVisibleMs >= 850 && manifest.browser.presentation.primaryVisibleMs <= 1_100);
  assert.ok(manifest.browser.presentation.transitionGapMs <= 50);
  assert.ok(manifest.browser.presentation.followVisibleMs >= 850 && manifest.browser.presentation.followVisibleMs <= 1_100);
  assert.ok(manifest.browser.presentation.finalPauseMs >= 1_600 && manifest.browser.presentation.finalPauseMs <= 1_900);
  assert.equal(manifest.browser.presentation.overlapSamples, 0);
  assert.ok(manifest.browser.presentation.primaryMidOpacity >= 0.95 && manifest.browser.presentation.followMidOpacity >= 0.95);
  assert.ok(manifest.browser.presentation.primaryBandWidthPx / manifest.browser.presentation.shortLabelWidthPx >= 0.50 && manifest.browser.presentation.primaryBandWidthPx / manifest.browser.presentation.shortLabelWidthPx <= 0.58);
  assert.ok(manifest.browser.presentation.followBandWidthPx / manifest.browser.presentation.shortLabelWidthPx >= 0.50 && manifest.browser.presentation.followBandWidthPx / manifest.browser.presentation.shortLabelWidthPx <= 0.58);
  assert.ok(manifest.browser.presentation.primaryRenderedBandRatio >= 0.50 && manifest.browser.presentation.primaryRenderedBandRatio <= 0.58);
  assert.ok(manifest.browser.presentation.followRenderedBandRatio >= 0.50 && manifest.browser.presentation.followRenderedBandRatio <= 0.58);
  assert.ok(manifest.browser.presentation.longLabelWidthPx > manifest.browser.presentation.shortLabelWidthPx * 2);
  assert.ok(manifest.browser.presentation.longLabelBandWidthPx / manifest.browser.presentation.longLabelWidthPx >= 0.50 && manifest.browser.presentation.longLabelBandWidthPx / manifest.browser.presentation.longLabelWidthPx <= 0.58);
  assert.ok(manifest.browser.presentation.longLabelRenderedBandRatio >= 0.50 && manifest.browser.presentation.longLabelRenderedBandRatio <= 0.58);
  assert.equal(manifest.browser.presentation.longLabelDuration, "3.75s");
  assert.equal(manifest.browser.presentation.minimumThinkingMs, 2_000);
  assert.ok(manifest.browser.presentation.fastSuccessThinkingMs >= 1_980 && manifest.browser.presentation.fastSuccessThinkingMs <= 2_600);
  assert.ok(manifest.browser.presentation.fastFailureThinkingMs >= 1_980 && manifest.browser.presentation.fastFailureThinkingMs <= 2_600);
  assert.deepEqual(manifest.browser.presentation.fastSuccessSweepsObserved, [true, true]);
  assert.deepEqual(manifest.browser.presentation.fastFailureSweepsObserved, [true, true]);
  assertTravel(manifest.browser.presentation.fastSuccessTravelPositions.primary);
  assertTravel(manifest.browser.presentation.fastSuccessTravelPositions.follow);
  assertTravel(manifest.browser.presentation.fastFailureTravelPositions.primary);
  assertTravel(manifest.browser.presentation.fastFailureTravelPositions.follow);
  assert.ok(manifest.browser.presentation.slowThinkingVisibleMs > 2_000);
  assert.ok(manifest.browser.presentation.slowTerminalRevealDelayMs < 500);
  assert.ok(manifest.browser.presentation.cancellationRevealMs < 500);
  assert.ok(manifest.browser.presentation.reconnectTerminalRevealMs < 1_500);
  assert.equal(manifest.browser.presentation.persistedTerminalHoldReplayed, false);
  assert.ok(manifest.browser.presentation.statusRemovalMs < 500);
  assert.ok(manifest.browser.presentation.revealMs < 1_200);
  assert.deepEqual(manifest.browser.presentation.assistantStyle, { background: "rgba(0, 0, 0, 0)", border: "0px", radius: "0px", padding: "0px" });
  assert.deepEqual(manifest.browser.presentation.reducedSweepDisplays, ["none", "none"]);
  assert.equal(manifest.browser.presentation.reducedVisualDisplay, "none");
  assert.equal(manifest.browser.presentation.reducedCopyDisplay, "inline");
  assert.equal(manifest.liveTerra.status, "PASS");
  assert.equal(manifest.liveTerra.requestCount, 6);
  assert.ok(manifest.liveTerra.aggregateCostUsd <= manifest.liveTerra.ceilingUsd);
  assert.equal(manifest.liveTerra.model, "gpt-5.6-terra");
  assert.equal(manifest.liveTerra.additionalCallsAuthorizedOrMade, 0);
  assert.deepEqual(manifest.privacy, { clientSecretExposure: false, rawLivePromptsInManifest: false, tools: [], search: false, rasterOrAssetPayloads: false });
  assert.deepEqual(manifest.mutation, { authoredProject: false, history: false, repository: false, canvasDigestPreserved: true });
  assert.equal(manifest.humanAcceptance, "pending Arthur");
  assert.equal(manifest.controlPlaneUpdated, false);
  assert.equal(manifest.gitPublication, false);
};

const manifest = JSON.parse(readFileSync(PATH, "utf8")) as Manifest;
validate(manifest);
const clone = () => structuredClone(manifest);
let mutationRejections = 0;
const rejects = (mutate: (candidate: Manifest) => void) => {
  const candidate = clone(); mutate(candidate); assert.throws(() => validate(candidate)); mutationRejections += 1;
};
rejects(value => { value.base = "f".repeat(40); });
rejects(value => { value.dirtyPaths = value.dirtyPaths.slice(1); });
rejects(value => { value.sourceBindings[0].sha256 = "0".repeat(64); });
rejects(value => { value.frozenAiBindings[0].sha256 = "0".repeat(64); });
rejects(value => { value.aggregateSourceSha256 = "0".repeat(64); });
rejects(value => { value.specBinding.sha256 = "0".repeat(64); });
rejects(value => { value.commands[0].actualExit = 7; });
rejects(value => { value.commands[0].receipt.byteLength += 1; });
rejects(value => { value.artifacts[0].sha256 = "0".repeat(64); });
rejects(value => { value.productionBuild.buildId = "forged"; });
rejects(value => { value.browser.externalRequests = 1; });
rejects(value => { value.browser.sidebarResize.maximumWidthPx = 1_200; });
rejects(value => { value.browser.sidebarResize.compactFlexBasis = "420px"; });
rejects(value => { value.browser.sidebarResize.rasterDigestPreserved = false; });
rejects(value => { value.browser.sidebarResize.canvasGeometryPreserved = false; });
rejects(value => { value.browser.sidebarResize.minimumStageCenterPx = value.browser.sidebarResize.defaultStageCenterPx; });
rejects(value => { value.browser.sidebarResize.defaultToolBarRightPx -= 20; });
rejects(value => { value.browser.sidebarResize.allToolsVisibleAndClickable = false; });
rejects(value => { value.browser.sidebarResize.drawUndoAtAllWidthsPassed = false; });
rejects(value => { value.browser.timelineOverlay.reservedHeightPx = 142; });
rejects(value => { value.browser.timelineOverlay.overlayClickThroughBlocked = false; });
rejects(value => { value.browser.timelineOverlay.aboveSidebarPassed = false; });
rejects(value => { value.browser.timelineOverlay.keyframeInsertPassed = false; });
rejects(value => { value.browser.timelineOverlay.drawUndoPassed = false; });
rejects(value => { value.browser.presentation.cycleDurationMs = 2_200; });
rejects(value => { value.browser.presentation.broadGradientBandPercent = 8; });
rejects(value => { value.browser.presentation.maskTravelStartPercent = 0; });
rejects(value => { value.browser.presentation.primaryTravelPositions = [0, 50, 100]; });
rejects(value => { value.browser.presentation.longLabelRenderedBounds[2].minRatio = 0.2; });
rejects(value => { value.browser.presentation.transitionGapMs = 500; });
rejects(value => { value.browser.presentation.primaryRenderedBandRatio = 0.08; });
rejects(value => { value.browser.presentation.minimumThinkingMs = 250; });
rejects(value => { value.browser.presentation.fastFailureThinkingMs = 500; });
rejects(value => { value.browser.presentation.cancellationRevealMs = 2_000; });
rejects(value => { value.browser.presentation.statusRemovalMs = 2_000; });
rejects(value => { value.liveTerra.model = "gpt-5.4"; });
rejects(value => { value.liveTerra.requestCount = 7; });
rejects(value => { value.privacy.clientSecretExposure = true; });
rejects(value => { value.mutation.authoredProject = true; });
rejects(value => { value.controlPlaneUpdated = true; });

console.log(JSON.stringify({ status: "PASS", integrity: "VALID", manifest: bind(PATH), mutationRejections }));
