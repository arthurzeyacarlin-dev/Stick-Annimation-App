import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  STICK_JOINT_ROLES,
  applyStickManualAction,
  buildStickResolvedRenderInput,
  canonicalJson,
  cloneCanonical,
  deriveStickLineHead,
  digestCanonical,
  isStickManualWaveApplied,
  isStickWaveStarter,
  parseStickProjectDocument,
  projectStickAnimationContent,
} from "../src/lib/stickfigure/stickProjectContract.ts";
import type {
  StickJointRoleV1,
  StickKeyframeCellV1,
  StickManualActionV1,
  StickProjectDocumentV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";
import {
  applyCompletedStickJointEdit,
  beginStickDocumentPublication,
  completeStickBootstrap,
  completeStickDocumentPublication,
  addEditableStickLayer,
  copyEditableStickTimelineFrame,
  createFreshEditableStickTimelineState,
  deleteEditableStickLayer,
  createStickBootstrapRoot,
  createStickWaveStarterV1,
  failStickBootstrap,
  failStickDocumentPublication,
  projectPointFromClient,
  getEditableStickPlaybackFrameCount,
  insertEditableStickTimelineFrame,
  pasteEditableStickTimelineFrame,
  removeEditableStickTimelineFrame,
  replaceEditableStickResolvedContent,
  resizeEditableStickTimelineSpan,
  resolveEditableStickContent,
  resolveStickTimelinePose,
  retryStickDocumentPublication,
  roundedClampedJointPoint,
} from "../src/lib/stickfigure/stickTimeline.ts";
import {cloneStickFigureFrameContent} from "../src/components/workspace/stickfigure/types.ts";
import type {StickFigureFrameContent} from "../src/components/workspace/stickfigure/types.ts";

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const fixtureRoot = "scripts/fixtures/stick-ai/v1";
let assertions = 0;
const check = (condition: unknown, message: string) => {assert.ok(condition, message); assertions += 1;};
const equal = (actual: unknown, expected: unknown, message: string) => {assert.deepEqual(actual, expected, message); assertions += 1;};
const expectOk = <T>(result: {ok: true; value: T} | {ok: false; error: unknown}, message: string): T => {
  check(result.ok, message);
  if (!result.ok) throw new Error(message);
  return result.value;
};

const starter = readJson<StickProjectDocumentV1>(`${fixtureRoot}/fresh-stick-project.json`);
const manualActions = readJson<StickManualActionV1[]>(`${fixtureRoot}/manual-wave-actions.json`);
const appliedFixture = readJson<StickProjectDocumentV1>(`${fixtureRoot}/manual-wave-applied-project.json`);
const buildCases = readJson<{
  expectedActionCount: number;
  expectedRevision: number;
  expectedContentDigest: string;
  expectedDocumentDigest: string;
  expectedRenderDigests: Record<string, string>;
  structuralCheckpoints: Array<{afterAction: number; cellTypes: string[]}>;
  invalidActions: StickManualActionV1[];
}>(`${fixtureRoot}/stick-manual-wave-build-cases.json`);

const idSequence = [
  "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004",
  ...Array.from({length: 11}, (_, index) => `00000000-0000-4000-8000-${String(201 + index).padStart(12, "0")}`),
  ...Array.from({length: 12}, (_, index) => `00000000-0000-4000-8000-${String(101 + index).padStart(12, "0")}`),
  "00000000-0000-4000-8000-000000000401",
  ...Array.from({length: 10}, (_, index) => `00000000-0000-4000-8000-${String(301 + index).padStart(12, "0")}`),
];
let idCursor = 0;
const constructedStarter = createStickWaveStarterV1(() => idSequence[idCursor++]);
equal(canonicalJson(constructedStarter), canonicalJson(starter), "Runtime starter must equal the Phase 1 starter fixture.");
check(isStickWaveStarter(constructedStarter), "Runtime starter must satisfy the exact starter predicate.");
check(parseStickProjectDocument(constructedStarter).ok, "Runtime starter must pass the strict document parser.");
equal(buildCases.expectedActionCount, manualActions.length, "Manual build action count drifted.");

const starterFrameIds = starter.layers[0].cells.map((cell) => cell.frameId);
const checkpointMap = new Map(buildCases.structuralCheckpoints.map((entry) => [entry.afterAction, entry.cellTypes]));
let manual = cloneCanonical(starter);
manualActions.forEach((action, index) => {
  const result = applyStickManualAction(manual, action);
  manual = expectOk(result, `Manual action ${index + 1} must succeed.`);
  equal(manual.layers[0].cells.map((cell) => cell.frameId), starterFrameIds, `Manual action ${index + 1} shifted frame IDs.`);
  const expectedTypes = checkpointMap.get(index + 1);
  if (expectedTypes) equal(manual.layers[0].cells.map((cell) => cell.cellType === "keyframe" && cell.poses.length === 0 ? "blank" : cell.cellType), expectedTypes, `Structural checkpoint ${index + 1} drifted.`);
});
equal(manual.documentRevision, buildCases.expectedRevision, "Manual build revision drifted.");
equal(canonicalJson(manual), canonicalJson(appliedFixture), "Manual build must equal the checked-in applied project.");
check(isStickManualWaveApplied(manual, starter), "Manual result must satisfy the exact applied-wave predicate.");
equal(await digestCanonical(manual), buildCases.expectedDocumentDigest, "Manual document digest drifted.");
const projected = expectOk(projectStickAnimationContent(manual), "Manual result must project complete animation content.");
equal(await digestCanonical(projected), buildCases.expectedContentDigest, "Manual content digest drifted.");
for (const index of [0, 4, 8]) {
  const render = expectOk(buildStickResolvedRenderInput(manual, index), `Frame ${index + 1} render input must resolve.`);
  equal(await digestCanonical(render), buildCases.expectedRenderDigests[String(index)], `Frame ${index + 1} render digest drifted.`);
}
for (const action of buildCases.invalidActions) {
  check(!applyStickManualAction(starter, action).ok, `Invalid starter action ${action.type}:${action.targetFrameIndex} must reject.`);
}

const resolution = readJson<{cases: Array<{index: number; ownerIndex: number; span: [number, number]}>}>(`${fixtureRoot}/wave-cell-resolution.json`);
for (const item of resolution.cases) {
  const resolved = resolveStickTimelinePose(manual, item.index);
  check(resolved, `Frame ${item.index + 1} must resolve.`);
  equal(resolved!.controllingFrameIndex, item.ownerIndex, `Frame ${item.index + 1} owner drifted.`);
  equal([resolved!.spanStartIndex + 1, resolved!.spanEndIndex + 1], item.span, `Frame ${item.index + 1} span drifted.`);
}

const keyCells = manual.layers[0].cells.filter((cell): cell is StickKeyframeCellV1 => cell.cellType === "keyframe" && cell.poses.length === 1);
equal(keyCells.length, 3, "Manual wave must have three posed keyframes.");
for (let left = 0; left < keyCells.length; left += 1) for (let right = left + 1; right < keyCells.length; right += 1) {
  check(keyCells[left].poses[0] !== keyCells[right].poses[0], "Pose objects must not alias.");
  for (let point = 0; point < 11; point += 1) check(keyCells[left].poses[0].points[point] !== keyCells[right].poses[0].points[point], "Joint point objects must not alias across poses.");
}
const aliasCases = readJson<{cases: Array<{poseIndex: number; jointRole: StickJointRoleV1; replacement: {x: number; y: number}; unchangedPoseIndexes: number[]}>}>(`${fixtureRoot}/stick-pose-aliasing-cases.json`);
for (const item of aliasCases.cases) {
  const candidate = cloneCanonical(manual);
  const candidateCells = candidate.layers[0].cells.filter((cell): cell is StickKeyframeCellV1 => cell.cellType === "keyframe" && cell.poses.length === 1);
  const originalBytes = keyCells.map((cell) => canonicalJson(cell.poses[0]));
  const roleIndex = candidate.rigs[0].joints.findIndex((joint) => joint.role === item.jointRole);
  candidateCells[item.poseIndex].poses[0].points[roleIndex] = {...candidateCells[item.poseIndex].poses[0].points[roleIndex], ...item.replacement};
  for (const unchanged of item.unchangedPoseIndexes) equal(canonicalJson(candidateCells[unchanged].poses[0]), originalBytes[unchanged], "Changing one clone mutated another pose.");
  equal(keyCells.map((cell) => canonicalJson(cell.poses[0])), originalBytes, "Changing a returned clone mutated the source document.");
}

const corrections = readJson<{roles: StickJointRoleV1[]; selectionCases: Array<{selectedFrameIndex: number; expectedOwnerIndex: number; delta: {x: number; y: number}}> }>(`${fixtureRoot}/wave-any-joint-corrections.json`);
equal(corrections.roles, STICK_JOINT_ROLES, "All-joint correction role order drifted.");
const baseDigest = await digestCanonical(manual);
const mounted = completeStickBootstrap(
  createStickBootstrapRoot(manual, "fixture", "none", "00000000-0000-4000-8000-000000008001", "00000000-0000-4000-8000-000000008002"),
  manual,
  "00000000-0000-4000-8000-000000008001",
  baseDigest,
);
check(mounted.rootStatus === "mounted", "Fixture bootstrap must mount.");
for (const role of corrections.roles) for (const selection of corrections.selectionCases) {
  const resolved = resolveStickTimelinePose(manual, selection.selectedFrameIndex)!;
  const joint = manual.rigs[0].joints.find((candidate) => candidate.role === role)!;
  const from = resolved.pose.points.find((candidate) => candidate.jointId === joint.jointId)!;
  const edit = {
    baseWorkspaceInstanceId: mounted.workspaceInstanceId,
    projectId: manual.projectId,
    baseRevision: manual.documentRevision,
    baseWorkspaceGeneration: mounted.workspaceGeneration,
    selectedFrameId: resolved.selectedCell.frameId,
    selectedFrameIndex: selection.selectedFrameIndex,
    controllingFrameId: resolved.controllingCell.frameId,
    controllingFrameIndex: resolved.controllingFrameIndex,
    poseId: resolved.pose.poseId,
    jointId: joint.jointId,
    jointRole: role,
    from: {x: from.x, y: from.y},
    to: {x: from.x + selection.delta.x, y: from.y + selection.delta.y},
    preStateDigest: baseDigest,
  } as const;
  const candidate = applyCompletedStickJointEdit(mounted, edit);
  check(candidate, `${role} must be editable from Frame ${selection.selectedFrameIndex + 1}.`);
  equal(resolveStickTimelinePose(candidate!, selection.selectedFrameIndex)!.controllingFrameIndex, selection.expectedOwnerIndex, "Held correction owner drifted.");
  equal(candidate!.documentRevision, manual.documentRevision + 1, "One correction must increment revision once.");
  const otherPoseBytesBefore = keyCells.filter((cell) => cell.index !== selection.expectedOwnerIndex).map((cell) => canonicalJson(cell.poses[0]));
  const otherPoseBytesAfter = candidate!.layers[0].cells.filter((cell): cell is StickKeyframeCellV1 => cell.cellType === "keyframe" && cell.poses.length === 1 && cell.index !== selection.expectedOwnerIndex).map((cell) => canonicalJson(cell.poses[0]));
  equal(otherPoseBytesAfter, otherPoseBytesBefore, "A correction changed a noncontrolling pose.");
}

const lineVectors = readJson<{vectors: Array<{head: {x: number; y: number}; expected: unknown}>}>(`${fixtureRoot}/stick-line-head-vectors.json`);
for (const item of lineVectors.vectors) equal(deriveStickLineHead(item.head), item.expected, "Line-head vector drifted.");

const gesture = readJson<{coordinateCases: Array<{client: {x: number; y: number}; stage: {left: number; top: number; scale: number}; offset: {x: number; y: number}; space: {width: number; height: number}; expected: {x: number; y: number}}> ; requiredGuards: string[]; requiredCancellationPaths: string[]; terminalSequences: unknown[]}>(`${fixtureRoot}/stick-gesture-cases.json`);
for (const item of gesture.coordinateCases) {
  const project = projectPointFromClient(item.client, item.stage);
  equal(roundedClampedJointPoint(project, item.offset, item.space), item.expected, "Gesture coordinate conversion drifted.");
}
equal(gesture.requiredGuards.length, 8, "Every pointer-down guard must be enumerated.");
equal(gesture.requiredCancellationPaths.length, 13, "Every cancellation path must be enumerated.");
equal(gesture.terminalSequences.length, 4, "Terminal ordering cases drifted.");

const publicationCases = readJson<{
  bootstrapCases: Array<{source: "new" | "fixture"; savedBaseline: "none" | "candidate_document"; creatorEntryLocked: boolean; generation: number}>;
  invalidBootstrapCases: Array<{source: "new" | "fixture"; savedBaseline: "none" | "candidate_document"; creatorEntryLocked: boolean}>;
  requiredCases: string[];
}>(`${fixtureRoot}/stick-document-publication-race-cases.json`);
equal(publicationCases.requiredCases, [
  "bootstrap-pending", "bootstrap-failed", "bootstrap-retry", "mounted-pending-old-document", "mounted-ready-atomic",
  "mounted-failed-old-document", "retry-last-published", "out-of-order-completion", "intervening-mutation", "project-switch",
  "tampered-current-digest",
], "Publication case inventory drifted.");
for (const [index, item] of publicationCases.bootstrapCases.entries()) {
  const operationId = `00000000-0000-4000-8000-${String(8100 + index).padStart(12, "0")}`;
  const workspaceId = `00000000-0000-4000-8000-${String(8200 + index).padStart(12, "0")}`;
  const bootstrap = createStickBootstrapRoot(starter, item.source, item.savedBaseline, operationId, workspaceId);
  check(bootstrap.documentPublication.status === "pending" && bootstrap.editorRoot === null, "Bootstrap must be status-only pending.");
  equal(bootstrap.creatorEntryLocked, item.creatorEntryLocked, "Bootstrap Creator lock drifted.");
  const ready = completeStickBootstrap(bootstrap, starter, operationId, await digestCanonical(starter));
  check(ready.rootStatus === "mounted", "Bootstrap case must mount atomically.");
  equal(ready.workspaceGeneration, item.generation, "Bootstrap generation drifted.");
  if (ready.rootStatus !== "mounted") throw new Error("Bootstrap case narrowing failed.");
  equal(ready.lastSavedDocumentDigest, item.savedBaseline === "candidate_document" ? ready.editorRoot.current.documentDigest : null, "Bootstrap baseline drifted.");
}
for (const item of publicationCases.invalidBootstrapCases) {
  if (item.source === "new" && item.savedBaseline === "candidate_document") {
    assert.throws(() => createStickBootstrapRoot(starter, item.source, item.savedBaseline), /saved baseline/); assertions += 1;
  } else {
    const derived = createStickBootstrapRoot(starter, item.source, item.savedBaseline);
    check(derived.creatorEntryLocked !== item.creatorEntryLocked, "Fixture bootstrap must derive the locked Creator state rather than accept an invalid override.");
  }
}
const failedBootstrapOperation = "00000000-0000-4000-8000-000000008301";
const failedBootstrap = failStickBootstrap(createStickBootstrapRoot(starter, "new", "none", failedBootstrapOperation), failedBootstrapOperation);
check(failedBootstrap.documentPublication.status === "failed" && failedBootstrap.editorRoot === null, "Bootstrap hash failure must remain status-only.");
const retryBootstrapOperation = "00000000-0000-4000-8000-000000008302";
const retryBootstrap = createStickBootstrapRoot(starter, "new", "none", retryBootstrapOperation, failedBootstrap.workspaceInstanceId);
const retriedBootstrap = completeStickBootstrap(retryBootstrap, starter, retryBootstrapOperation, await digestCanonical(starter));
check(retriedBootstrap.rootStatus === "mounted" && retriedBootstrap.workspaceInstanceId === failedBootstrap.workspaceInstanceId, "Bootstrap Retry must publish only a fresh matching operation in the same workspace.");

if (mounted.rootStatus !== "mounted") throw new Error("Mounted root narrowing failed.");
const candidateResult = expectOk(applyStickManualAction(manual, {actionVersion: 1, type: "set-joint", targetFrameIndex: 0, jointRole: "head", point: {x: 961, y: 241}}), "Publication candidate action must succeed.");
const begun = beginStickDocumentPublication(mounted, {...mounted.editorRoot.current.snapshot, document: candidateResult}, "00000000-0000-4000-8000-000000008003");
check(begun.operation && begun.root.rootStatus === "mounted" && begun.root.documentPublication.status === "pending", "Publication must enter pending.");
if (!begun.operation || begun.root.rootStatus !== "mounted") throw new Error("Publication begin narrowing failed.");
equal(canonicalJson(begun.root.editorRoot.current.snapshot.document), canonicalJson(manual), "Pending exposed candidate bytes.");
const candidateDigest = await digestCanonical(candidateResult);
const completed = completeStickDocumentPublication(begun.root, begun.operation, candidateDigest);
check(completed.rootStatus === "mounted" && completed.documentPublication.status === "ready", "Matching completion must publish ready.");
if (completed.rootStatus !== "mounted") throw new Error("Publication completion narrowing failed.");
equal(completed.workspaceGeneration, mounted.workspaceGeneration + 1, "Ready publication must increment generation once.");
equal(completed.editorRoot.current.documentDigest, candidateDigest, "Ready publication digest drifted.");
check(completeStickDocumentPublication(completed, begun.operation, candidateDigest) === completed, "Late duplicate completion must be a no-op.");
const supersedingCandidate = expectOk(applyStickManualAction(manual, {actionVersion: 1, type: "set-joint", targetFrameIndex: 0, jointRole: "neck", point: {x: 962, y: 342}}), "Superseding publication candidate must succeed.");
const superseding = beginStickDocumentPublication(mounted, {...mounted.editorRoot.current.snapshot, document: supersedingCandidate}, "00000000-0000-4000-8000-000000008004");
check(superseding.operation && superseding.root.rootStatus === "mounted", "Superseding publication must begin from the last ready root.");
if (!superseding.operation || superseding.root.rootStatus !== "mounted") throw new Error("Superseding publication narrowing failed.");
const supersedingReady = completeStickDocumentPublication(superseding.root, superseding.operation, await digestCanonical(supersedingCandidate));
check(supersedingReady.rootStatus === "mounted" && completeStickDocumentPublication(supersedingReady, begun.operation, candidateDigest) === supersedingReady, "Out-of-order completion must not replace the ready winner.");
const tamperedPending = {
  ...begun.root,
  editorRoot: {current: {...begun.root.editorRoot.current, documentDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}},
};
check(completeStickDocumentPublication(tamperedPending, begun.operation, candidateDigest) === tamperedPending, "Tampered current digest must reject completion by identity.");
const switchedBootstrap = createStickBootstrapRoot(starter, "fixture", "none", "00000000-0000-4000-8000-000000008005", "00000000-0000-4000-8000-000000008006");
const switched = completeStickBootstrap(switchedBootstrap, starter, "00000000-0000-4000-8000-000000008005", await digestCanonical(starter));
check(completeStickDocumentPublication(switched, begun.operation, candidateDigest) === switched, "Project/workspace switch must make the old completion a no-op.");
const failed = failStickDocumentPublication(begun.root, begun.operation);
check(failed.rootStatus === "mounted" && failed.documentPublication.status === "failed", "Hash failure must expose failed over old current.");
if (failed.rootStatus !== "mounted") throw new Error("Failed root narrowing failed.");
equal(canonicalJson(failed.editorRoot.current.snapshot.document), canonicalJson(manual), "Hash failure changed published bytes.");
const retried = await retryStickDocumentPublication(failed);
check(retried.rootStatus === "mounted" && retried.documentPublication.status === "ready", "Retry must restore ready.");
if (retried.rootStatus !== "mounted") throw new Error("Retry root narrowing failed.");
equal(retried.workspaceGeneration, failed.workspaceGeneration, "Retry must not increment generation.");

const editableCases = readJson<{
  fresh: {fps: number; layerCount: number; frameTypes: string[]; playbackFrameCount: number};
  operations: Array<{name: string; expectedTypes: string[]}>;
  invalidCases: string[];
}>(`${fixtureRoot}/stick-editable-timeline-cases.json`);
const aliasMatrix = readJson<{
  mutableCategories: string[];
  protectedOwners: string[];
  holdRule: string;
  insertRule: string;
}>(`${fixtureRoot}/stick-editable-timeline-alias-cases.json`);

const frameTypes = (state: ReturnType<typeof createFreshEditableStickTimelineState>, layerId = state.activeLayerId) =>
  state.layers.find((layer) => layer.id === layerId)!.frames.map((frame) => frame.cellType);
const expectedOperation = (name: string) => editableCases.operations.find((item) => item.name === name)!.expectedTypes;
const authoredContent: StickFigureFrameContent = {
  figures: [{id: "figure-1", name: "Figure 1", x: 20, y: 30, scale: 1, rotation: 0}],
  structureGraph: {
    joints: [{id: "joint-1", x: 100, y: 110}, {id: "joint-2", x: 160, y: 210}],
    limbs: [{id: "limb-1", startJointId: "joint-1", endJointId: "joint-2"}],
    activeJointId: "joint-2",
  },
};

let editable = createFreshEditableStickTimelineState();
equal(editable.fps, editableCases.fresh.fps, "Fresh editable FPS drifted.");
equal(editable.layers.length, editableCases.fresh.layerCount, "Fresh editable layer count drifted.");
equal(frameTypes(editable), editableCases.fresh.frameTypes, "Fresh editable timeline must contain one blank keyframe.");
equal(getEditableStickPlaybackFrameCount(editable), editableCases.fresh.playbackFrameCount, "Fresh playback span drifted.");
equal(resolveEditableStickContent(editable, editable.activeLayerId, 0)!.content, {figures: [], structureGraph: {joints: [], limbs: [], activeJointId: null}}, "Fresh editable content must be empty.");

editable = replaceEditableStickResolvedContent(editable, editable.activeLayerId, 0, authoredContent)!;
const originalAuthoredBytes = canonicalJson(resolveEditableStickContent(editable, editable.activeLayerId, 0)!.content);
editable = insertEditableStickTimelineFrame(editable, editable.activeLayerId, "frame", 0)!;
equal(frameTypes(editable), expectedOperation("insert-frame"), "Insert Frame must add one hold after the authored span.");
equal(resolveEditableStickContent(editable, editable.activeLayerId, 1)!.ownerIndex, 0, "Held frame owner drifted.");

editable = insertEditableStickTimelineFrame(editable, editable.activeLayerId, "keyframe", 0)!;
equal(frameTypes(editable), expectedOperation("insert-keyframe"), "Insert Keyframe shift/hold normalization drifted.");
const sourceContent = resolveEditableStickContent(editable, editable.activeLayerId, 0)!.content;
const clonedContent = resolveEditableStickContent(editable, editable.activeLayerId, 1)!.content;
check(sourceContent !== clonedContent, "Inserted keyframe content must not alias its source.");
check(sourceContent.figures !== clonedContent.figures && sourceContent.figures[0] !== clonedContent.figures[0], "Inserted figure containers must be deep independent.");
check(sourceContent.structureGraph !== clonedContent.structureGraph, "Inserted structure graph must be deep independent.");
check(sourceContent.structureGraph.joints !== clonedContent.structureGraph.joints && sourceContent.structureGraph.joints[0] !== clonedContent.structureGraph.joints[0], "Inserted joint containers must be deep independent.");
check(sourceContent.structureGraph.limbs !== clonedContent.structureGraph.limbs && sourceContent.structureGraph.limbs[0] !== clonedContent.structureGraph.limbs[0], "Inserted limb containers must be deep independent.");
const movedClone = cloneStickFigureFrameContent(clonedContent);
movedClone.figures[0].x += 9;
movedClone.structureGraph.joints[0].x += 17;
editable = replaceEditableStickResolvedContent(editable, editable.activeLayerId, 1, movedClone)!;
equal(canonicalJson(resolveEditableStickContent(editable, editable.activeLayerId, 0)!.content), originalAuthoredBytes, "Editing an inserted keyframe mutated its source.");

editable = insertEditableStickTimelineFrame(editable, editable.activeLayerId, "keyframe", 0, {blank: true})!;
equal(frameTypes(editable), expectedOperation("insert-blank-keyframe"), "Insert Blank Keyframe shift semantics drifted.");
equal(resolveEditableStickContent(editable, editable.activeLayerId, 1)!.content, {figures: [], structureGraph: {joints: [], limbs: [], activeJointId: null}}, "Blank keyframe must have empty content.");
editable = removeEditableStickTimelineFrame(editable, editable.activeLayerId, 1)!;
equal(frameTypes(editable), expectedOperation("remove-frame"), "Remove Frame must collapse exactly the resolved state span.");

const clipboard = copyEditableStickTimelineFrame(editable, editable.activeLayerId, 0)!;
check(clipboard !== resolveEditableStickContent(editable, editable.activeLayerId, 0)!.content, "Clipboard content must be detached.");
clipboard.figures[0].y += 5;
equal(canonicalJson(resolveEditableStickContent(editable, editable.activeLayerId, 0)!.content), originalAuthoredBytes, "Mutating the clipboard changed its source.");
const clipboardBytes = canonicalJson(clipboard);
editable = pasteEditableStickTimelineFrame(editable, editable.activeLayerId, 2, clipboard)!;
const pasted = resolveEditableStickContent(editable, editable.activeLayerId, 2)!.content;
check(pasted !== clipboard && pasted.figures !== clipboard.figures && pasted.figures[0] !== clipboard.figures[0], "Pasted figures must not alias the clipboard.");
check(pasted.structureGraph !== clipboard.structureGraph && pasted.structureGraph.joints[0] !== clipboard.structureGraph.joints[0] && pasted.structureGraph.limbs[0] !== clipboard.structureGraph.limbs[0], "Pasted graph members must not alias the clipboard.");
const changedPaste = cloneStickFigureFrameContent(pasted);
changedPaste.structureGraph.limbs[0].endJointId = "joint-1";
editable = replaceEditableStickResolvedContent(editable, editable.activeLayerId, 2, changedPaste)!;
equal(canonicalJson(clipboard), clipboardBytes, "Editing pasted content mutated the clipboard.");

let spanState = replaceEditableStickResolvedContent(createFreshEditableStickTimelineState(), "stick-layer-1", 0, authoredContent)!;
const spanStateId = spanState.layers[0].frames[0].stateId;
spanState = resizeEditableStickTimelineSpan(spanState, "stick-layer-1", spanStateId, 2)!;
equal(frameTypes(spanState), expectedOperation("span-extend"), "Span extension must create holds only.");
const heldEdit = cloneStickFigureFrameContent(resolveEditableStickContent(spanState, "stick-layer-1", 2)!.content);
heldEdit.structureGraph.joints[1].y += 31;
spanState = replaceEditableStickResolvedContent(spanState, "stick-layer-1", 2, heldEdit)!;
equal(resolveEditableStickContent(spanState, "stick-layer-1", 2)!.ownerIndex, 0, "Held edit must retain the controlling keyframe.");
equal(resolveEditableStickContent(spanState, "stick-layer-1", 0)!.content.structureGraph.joints[1].y, authoredContent.structureGraph.joints[1].y + 31, "Held edit must update its controlling keyframe.");
spanState = resizeEditableStickTimelineSpan(spanState, "stick-layer-1", spanStateId, 0)!;
equal(frameTypes(spanState), expectedOperation("span-collapse"), "Span collapse must remove only its holds.");

const firstLayerBytes = canonicalJson(resolveEditableStickContent(editable, editable.layers[0].id, 0)!.content);
const withLayer = addEditableStickLayer(editable);
equal(withLayer.layers.length, 2, "+ Layer must add exactly one layer.");
equal(frameTypes(withLayer, withLayer.activeLayerId), ["blank-keyframe"], "New layer must start with one blank keyframe.");
equal(canonicalJson(resolveEditableStickContent(withLayer, withLayer.layers[0].id, 0)!.content), firstLayerBytes, "Adding a layer mutated the prior layer.");
const afterDelete = deleteEditableStickLayer(withLayer, withLayer.activeLayerId)!;
equal(afterDelete.layers.length, 1, "Delete Layer must remove only the targeted layer.");
equal(afterDelete.activeLayerId, afterDelete.layers[0].id, "Delete Layer must repair the active layer.");

check(insertEditableStickTimelineFrame(editable, "missing-layer", "frame", 0) === null, "Unknown-layer insertion must reject.");
check(insertEditableStickTimelineFrame(editable, editable.activeLayerId, "frame", -1) === null, "Negative insertion index must reject.");
const emptyExtended = insertEditableStickTimelineFrame(createFreshEditableStickTimelineState(), "stick-layer-1", "keyframe", 3, {blank: true})!;
check(removeEditableStickTimelineFrame(emptyExtended, "stick-layer-1", 1) === null, "Removing an empty cell must reject.");
check(resizeEditableStickTimelineSpan(spanState, "stick-layer-1", spanStateId, -1) === null, "Resize before owner must reject.");
const authoredNeighbor = insertEditableStickTimelineFrame(replaceEditableStickResolvedContent(createFreshEditableStickTimelineState(), "stick-layer-1", 0, authoredContent)!, "stick-layer-1", "keyframe", 0)!;
check(resizeEditableStickTimelineSpan(authoredNeighbor, "stick-layer-1", authoredNeighbor.layers[0].frames[0].stateId, 1) === null, "Resize over authored content must reject.");
check(deleteEditableStickLayer(createFreshEditableStickTimelineState(), "stick-layer-1") === null, "Deleting the last layer must reject.");
equal(editableCases.invalidCases.length, 6, "Editable invalid-case inventory drifted.");
equal(aliasMatrix.mutableCategories.length, 7, "Alias matrix must enumerate every current mutable nested category.");
equal(aliasMatrix.protectedOwners.length, 5, "Alias matrix protected-owner inventory drifted.");

console.log(`Stick pose timeline validation PASS: ${assertions} assertions, rejected Phase 2 contract regression plus editable timeline isolation/alias/hold/layer vectors, 0 history entries.`);
