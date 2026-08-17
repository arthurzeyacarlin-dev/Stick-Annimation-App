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
  createStickBootstrapRoot,
  createStickWaveStarterV1,
  failStickBootstrap,
  failStickDocumentPublication,
  projectPointFromClient,
  resolveStickTimelinePose,
  retryStickDocumentPublication,
  roundedClampedJointPoint,
} from "../src/lib/stickfigure/stickTimeline.ts";

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

const correctionCopy = readJson<{editableRoles: string[]; lineHead: {storedShape: boolean; separateHitTarget: boolean}; highlightCases: Array<{alwaysOnRole: null; persistedSelection: boolean}>}>(`${fixtureRoot}/stick-correction-affordance-cases.json`);
equal(correctionCopy.editableRoles, STICK_JOINT_ROLES, "Correction affordance roles drifted.");
equal(correctionCopy.lineHead, {...correctionCopy.lineHead, storedShape: false, separateHitTarget: false}, "Line head must not be stored or separately targeted.");
check(correctionCopy.highlightCases.every((item) => item.alwaysOnRole === null && item.persistedSelection === false), "Permanent role highlights are forbidden.");
const controls = readJson<{cases: unknown[]; alwaysUnavailable: string[]; creatorLockedCopy: string}>(`${fixtureRoot}/stick-control-disposition-cases.json`);
equal(controls.cases.length, 8, "Control disposition matrix drifted.");
check(controls.alwaysUnavailable.includes("Undo") && controls.alwaysUnavailable.includes("Save") && controls.alwaysUnavailable.includes("Add Limb"), "Unavailable controls are incomplete.");
equal(controls.creatorLockedCopy, "Creator opens a separate workspace and cannot return to this Workspace session. Return Home and start a new Stick project to use Creator.", "Creator lock copy drifted.");

console.log(`Stick pose timeline validation PASS: ${assertions} assertions, 13 manual actions, 12 cell resolutions, 22 all-joint correction cases, 0 history entries.`);
