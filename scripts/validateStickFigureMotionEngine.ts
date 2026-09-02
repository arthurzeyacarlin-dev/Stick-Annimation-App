import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  StickFigureCommandTransactionV1,
  createStickCommandWorkspaceRoot,
  materializeStickAnimationPlan,
} from "../src/lib/ai/stickFigureCommandExecutor.ts";
import {
  STICK_PHASE2_HEAD_EDGE_MARGIN_PX,
  STICK_PHASE2_INPUT_LENGTH_MAX_RATIO,
  STICK_PHASE2_INPUT_LENGTH_MIN_RATIO,
  STICK_PHASE2_MAX_HIP_TRAVEL_PX,
  STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES,
  STICK_PHASE2_MOTION_MATERIALIZER,
  STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX,
  STICK_PHASE2_REBUILD_ORDER,
  assertIndependentBakedStickMotion,
  materializeStickAnimationMotionPlan,
} from "../src/lib/ai/stickFigureMotionEngine.ts";
import {
  STICK_JOINT_ROLES,
  STICK_SEGMENT_ROLE_PAIRS,
  canonicalJson,
  cloneCanonical,
  deriveStickLineHead,
  digestCanonical,
  parseStickProjectDocument,
  type StickJointRoleV1,
  type StickProjectDocumentV1,
  type StickTimelineCellV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";
import {
  editableStickTimelineFromCanonicalAnimation,
  redoCanonicalStickHistory,
  undoCanonicalStickHistory,
} from "../src/lib/stickfigure/stickProjectHistory.ts";
import {
  cloneEditableStickTimelineState,
  createFreshEditableStickTimelineState,
  replaceEditableStickResolvedContent,
  resolveEditableStickContent,
} from "../src/lib/stickfigure/stickTimeline.ts";
import {cloneStickFigureFrameContent} from "../src/components/workspace/stickfigure/types.ts";
import type {StickAnimationPlanV1} from "../src/lib/ai/stickFigureAiContract.ts";

const ROOT = process.cwd();
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;
const starter = readJson<StickProjectDocumentV1>("scripts/fixtures/stick-ai/v1/fresh-stick-project.json");

type GoldenCase = {
  name: string;
  sourcePlan: string;
  defaultCandidateDigest: string;
  motionCandidateDigest: string;
  importantFrameIndexes: number[];
  frames: Array<Array<[number, number]>>;
};

type MotionCases = {
  fixtureVersion: 2;
  jointRoleOrder: string[];
  easing: "3u^2-2u^3";
  validCases: GoldenCase[];
  invalidCases: string[];
};

const cases = readJson<MotionCases>("scripts/fixtures/spec0004-stick/v2/phase2-motion-cases.json");
let assertionCount = 0;
const check = (condition: unknown, message: string) => {
  assertionCount += 1;
  assert.ok(condition, message);
};
const equal = (actual: unknown, expected: unknown, message: string) => {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
};
const notEqual = (actual: unknown, expected: unknown, message: string) => {
  assertionCount += 1;
  assert.notDeepEqual(actual, expected, message);
};

const clonePlan = (plan: StickAnimationPlanV1) => cloneCanonical(plan);
const keyPoseCommands = (plan: StickAnimationPlanV1) => plan.commands.filter((command) => command.type === "create_key_pose");

const expectMotionRejection = async (id: string, plan: StickAnimationPlanV1) => {
  const result = await materializeStickAnimationMotionPlan(plan, starter);
  check(!result.ok, `${id} must fail closed`);
};

const angleDelta = (from: number, to: number) => {
  const tau = Math.PI * 2;
  let result = ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
  if (result === -Math.PI) result = Math.PI;
  return result;
};

const pointsByRole = (document: StickProjectDocumentV1, frameIndex: number) => {
  const cell = document.layers[0].cells[frameIndex];
  assert.equal(cell.cellType, "keyframe");
  return Object.fromEntries(document.rigs[0].joints.map((joint, index) => [
    joint.role,
    {x: cell.poses[0].points[index].x, y: cell.poses[0].points[index].y},
  ])) as Record<StickJointRoleV1, {x: number; y: number}>;
};

const canonicalLengths = (() => {
  const points = pointsByRole(starter, 0);
  return new Map(STICK_PHASE2_REBUILD_ORDER.map((segment) => [
    `${segment.parent}:${segment.child}`,
    Math.hypot(points[segment.child].x - points[segment.parent].x, points[segment.child].y - points[segment.parent].y),
  ]));
})();

const validateMotionGeometry = (document: StickProjectDocumentV1, importantIndexes: number[]) => {
  for (let frameIndex = 0; frameIndex < document.layers[0].cells.length; frameIndex += 1) {
    const points = pointsByRole(document, frameIndex);
    const lineHead = deriveStickLineHead(points.head);
    check(lineHead.from.x >= 0 && lineHead.to.x < document.coordinateSpace.width, `frame ${frameIndex} derived head stays in bounds`);
    for (const segment of STICK_PHASE2_REBUILD_ORDER) {
      const length = Math.hypot(
        points[segment.child].x - points[segment.parent].x,
        points[segment.child].y - points[segment.parent].y,
      );
      const canonical = canonicalLengths.get(`${segment.parent}:${segment.child}`)!;
      check(Math.abs(length - canonical) <= STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX, `frame ${frameIndex} ${segment.child} length tolerance`);
    }
  }
  for (let transitionIndex = 0; transitionIndex < importantIndexes.length - 1; transitionIndex += 1) {
    const firstIndex = importantIndexes[transitionIndex];
    const lastIndex = importantIndexes[transitionIndex + 1];
    const first = pointsByRole(document, firstIndex);
    const last = pointsByRole(document, lastIndex);
    const hipDx = last.hip.x - first.hip.x;
    const hipDy = last.hip.y - first.hip.y;
    for (let frameIndex = firstIndex; frameIndex <= lastIndex; frameIndex += 1) {
      const u = (frameIndex - firstIndex) / (lastIndex - firstIndex);
      const eased = 3 * u * u - 2 * u * u * u;
      const frame = pointsByRole(document, frameIndex);
      equal(frame.hip.x, Math.round(first.hip.x + hipDx * eased), `frame ${frameIndex} cubic-eased hip x`);
      equal(frame.hip.y, Math.round(first.hip.y + hipDy * eased), `frame ${frameIndex} cubic-eased hip y`);
    }
    for (const segment of STICK_PHASE2_REBUILD_ORDER) {
      const angleAt = (frameIndex: number) => {
        const frame = pointsByRole(document, frameIndex);
        return Math.atan2(
          frame[segment.child].y - frame[segment.parent].y,
          frame[segment.child].x - frame[segment.parent].x,
        );
      };
      const startAngle = angleAt(firstIndex);
      const endDelta = angleDelta(startAngle, angleAt(lastIndex));
      check(Math.abs(endDelta) * 180 / Math.PI <= STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES + 1, `${segment.child} shortest turn is bounded`);
      let previousProgress = -0.02;
      for (let frameIndex = firstIndex; frameIndex <= lastIndex; frameIndex += 1) {
        const progress = endDelta === 0 ? 0 : angleDelta(startAngle, angleAt(frameIndex)) / endDelta;
        check(progress >= previousProgress - 0.02, `${segment.child} turn is monotonic at frame ${frameIndex}`);
        check(progress >= -0.02 && progress <= 1.02, `${segment.child} turn has no overshoot at frame ${frameIndex}`);
        previousProgress = progress;
      }
    }
  }
};

equal(cases.fixtureVersion, 2, "Phase 2 fixture version");
equal(cases.jointRoleOrder, STICK_JOINT_ROLES, "exact 11-role order");
equal(STICK_PHASE2_REBUILD_ORDER.length, 10, "exact 10-segment rebuild tree");
equal(STICK_SEGMENT_ROLE_PAIRS.length, 10, "canonical rig has 10 segments");
equal(cases.easing, "3u^2-2u^3", "cubic smoothstep contract");
equal(STICK_PHASE2_INPUT_LENGTH_MIN_RATIO, 0.4, "minimum input ratio");
equal(STICK_PHASE2_INPUT_LENGTH_MAX_RATIO, 1.6, "maximum input ratio");
equal(STICK_PHASE2_MAX_HIP_TRAVEL_PX, 480, "hip travel bound");
equal(STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES, 170, "segment-turn bound");
equal(STICK_PHASE2_HEAD_EDGE_MARGIN_PX, 40, "head edge margin");
equal(cases.validCases.map((entry) => entry.name), ["wave", "jump", "bow", "dodge"], "fixed plan order");

const motionCandidates = new Map<string, StickProjectDocumentV1>();
for (const golden of cases.validCases) {
  const plan = readJson<StickAnimationPlanV1>(golden.sourcePlan);
  const defaultResult = await materializeStickAnimationPlan(plan, starter);
  check(defaultResult.ok, `${golden.name} Phase 1 default materializes`);
  if (!defaultResult.ok) continue;
  equal(await digestCanonical(defaultResult.value), golden.defaultCandidateDigest, `${golden.name} Phase 1 default digest is byte-compatible`);
  equal(defaultResult.value.layers[0].cells.map((cell) => cell.cellType), [
    "keyframe", "hold", "hold", "hold", "keyframe", "hold", "hold", "hold", "keyframe", "hold", "hold", "hold",
  ], `${golden.name} default retains Phase 1 holds`);

  const first = await materializeStickAnimationMotionPlan(plan, starter);
  const second = await materializeStickAnimationMotionPlan(plan, starter);
  check(first.ok && second.ok, `${golden.name} motion materializes twice`);
  if (!first.ok || !second.ok) continue;
  motionCandidates.set(golden.name, first.value);
  equal(await digestCanonical(first.value), golden.motionCandidateDigest, `${golden.name} exact motion digest`);
  equal(await digestCanonical(second.value), golden.motionCandidateDigest, `${golden.name} deterministic rerun digest`);
  check(assertIndependentBakedStickMotion(first.value), `${golden.name} independent ordinary keyframes`);
  equal(first.value.layers[0].cells.length, 12, `${golden.name} exact frame count`);
  equal(first.value.fps, 12, `${golden.name} exact FPS`);
  equal(first.value.layers[0].cells.map((cell) => cell.cellType), Array(12).fill("keyframe"), `${golden.name} zero holds/tweens`);
  const actualFrames = first.value.layers[0].cells.map((cell) => {
    assert.equal(cell.cellType, "keyframe");
    return cell.poses[0].points.map((point) => [point.x, point.y]);
  });
  equal(actualFrames, golden.frames, `${golden.name} exact normalized and in-between golden coordinates`);
  validateMotionGeometry(first.value, golden.importantFrameIndexes);
  for (const importantIndex of golden.importantFrameIndexes) {
    equal(actualFrames[importantIndex], golden.frames[importantIndex], `${golden.name} important frame ${importantIndex} exact normalized pose`);
  }
  for (let frameIndex = 9; frameIndex < 12; frameIndex += 1) {
    equal(actualFrames[frameIndex], actualFrames[8], `${golden.name} trailing frame ${frameIndex} looks identical`);
    const current: StickTimelineCellV1 = first.value.layers[0].cells[frameIndex];
    const owner: StickTimelineCellV1 = first.value.layers[0].cells[8];
    assert.equal(current.cellType, "keyframe");
    assert.equal(owner.cellType, "keyframe");
    notEqual(current.frameId, owner.frameId, `${golden.name} trailing frame ${frameIndex} unique frame ID`);
    notEqual(current.poses[0].poseId, owner.poses[0].poseId, `${golden.name} trailing frame ${frameIndex} unique pose ID`);
    check(current.poses[0] !== owner.poses[0] && current.poses[0].points !== owner.poses[0].points, `${golden.name} trailing frame ${frameIndex} unique objects`);
  }

  const editable = editableStickTimelineFromCanonicalAnimation(first.value, createFreshEditableStickTimelineState());
  equal(editable.layers[0].frames.map((frame) => frame.cellType), Array(12).fill("keyframe"), `${golden.name} editable projection has ordinary keyframes`);
  equal(new Set(editable.layers[0].frames.map((frame) => frame.id)).size, 12, `${golden.name} unique editable frame IDs`);
  equal(new Set(editable.layers[0].frames.map((frame) => frame.stateId)).size, 12, `${golden.name} unique editable state IDs`);
  const contentRefs = editable.layers[0].frames.map((frame) => frame.content);
  equal(new Set(contentRefs).size, 12, `${golden.name} unique editable content objects`);

  const edited = cloneEditableStickTimelineState(editable);
  edited.currentFrameIndex = 2;
  edited.selectedTimelineIndex = 2;
  const resolved = resolveEditableStickContent(edited, edited.activeLayerId, 2);
  check(Boolean(resolved), `${golden.name} in-between resolves for manual edit`);
  if (resolved) {
    const beforeDigests = await Promise.all(edited.layers[0].frames.map(async (_, index) => {
      const content = resolveEditableStickContent(edited, edited.activeLayerId, index)?.content ?? null;
      return digestCanonical(content);
    }));
    const changedContent = cloneStickFigureFrameContent(resolved.content);
    changedContent.structureGraph.joints[0].x += 17;
    const replaced = replaceEditableStickResolvedContent(edited, edited.activeLayerId, 2, changedContent);
    check(Boolean(replaced), `${golden.name} in-between manual edit applies`);
    if (replaced) {
      const afterDigests = await Promise.all(replaced.layers[0].frames.map(async (_, index) => {
        const content = resolveEditableStickContent(replaced, replaced.activeLayerId, index)?.content ?? null;
        return digestCanonical(content);
      }));
      notEqual(afterDigests[2], beforeDigests[2], `${golden.name} edited in-between digest changes`);
      equal(afterDigests.filter((digest, index) => index !== 2 && digest !== beforeDigests[index]), [], `${golden.name} unrelated frame digests stay exact`);
      equal(resolveEditableStickContent(replaced, replaced.activeLayerId, 2)?.content.structureGraph.joints[0].x,
        changedContent.structureGraph.joints[0].x, `${golden.name} manual stretch persists without regeneration`);
    }
  }

  const commandRoot = await createStickCommandWorkspaceRoot(starter, `phase2-${golden.name}`);
  const previewRootDigest = await digestCanonical(commandRoot);
  const motionMachine = new StickFigureCommandTransactionV1(commandRoot, {animationPlanMaterializer: STICK_PHASE2_MOTION_MATERIALIZER});
  const preview = await motionMachine.preview(plan);
  equal(preview.outcomeCode, "preview_ready", `${golden.name} opt-in transaction Preview`);
  equal(await digestCanonical(commandRoot), previewRootDigest, `${golden.name} caller root unchanged by Preview`);
  equal(await digestCanonical(motionMachine.readPreviewCandidate()), golden.motionCandidateDigest, `${golden.name} transaction uses motion materializer`);
  const fork = motionMachine.fork();
  equal(await digestCanonical(fork.readPreviewCandidate()), golden.motionCandidateDigest, `${golden.name} fork preserves motion option and candidate`);

  const cancelMachine = new StickFigureCommandTransactionV1(commandRoot, {animationPlanMaterializer: STICK_PHASE2_MOTION_MATERIALIZER});
  await cancelMachine.preview(plan);
  const beforeCancel = cancelMachine.snapshot().editorRoot.current.documentDigest;
  const cancelled = await cancelMachine.cancelPreview(plan);
  equal(cancelled.outcomeCode, "cancelled", `${golden.name} Cancel terminal`);
  equal(cancelMachine.snapshot().editorRoot.current.documentDigest, beforeCancel, `${golden.name} Cancel document no-op`);
  equal(cancelMachine.snapshot().editorRoot.undo.length, 0, `${golden.name} Cancel history no-op`);

  const applied = await motionMachine.apply(plan);
  equal(applied.outcomeCode, "applied", `${golden.name} Apply succeeds`);
  equal(applied.root.editorRoot.undo.length, 1, `${golden.name} Apply is one history change`);
  equal(applied.root.editorRoot.redo.length, 0, `${golden.name} Apply clears redo`);
  equal(applied.root.editorRoot.current.documentDigest, golden.motionCandidateDigest, `${golden.name} Apply publishes exact candidate`);
  const undone = await undoCanonicalStickHistory(applied.root.editorRoot);
  check(Boolean(undone), `${golden.name} canonical Undo available`);
  if (undone) {
    equal(undone.current.documentDigest, commandRoot.editorRoot.current.documentDigest, `${golden.name} Undo exact pre-Apply bytes`);
    const redone = await redoCanonicalStickHistory(undone);
    check(Boolean(redone), `${golden.name} canonical Redo available`);
    if (redone) equal(redone.current.documentDigest, golden.motionCandidateDigest, `${golden.name} Redo exact accepted bytes`);
  }
}

const wavePlan = readJson<StickAnimationPlanV1>("scripts/fixtures/stick-ai/v3/wave.json");

{
  const plan = clonePlan(wavePlan);
  keyPoseCommands(plan)[1].joints.pop();
  await expectMotionRejection("missing-joint", plan);
}
{
  const plan = clonePlan(wavePlan);
  keyPoseCommands(plan)[1].joints[0].role = "neck";
  await expectMotionRejection("duplicate-joint", plan);
}
{
  const plan = clonePlan(wavePlan);
  const pose = keyPoseCommands(plan)[1];
  pose.joints[0].x = pose.joints[1].x;
  pose.joints[0].y = pose.joints[1].y;
  await expectMotionRejection("zero-segment", plan);
}
{
  const plan = clonePlan(wavePlan);
  const pose = keyPoseCommands(plan)[1];
  pose.joints[0].x = pose.joints[1].x;
  pose.joints[0].y = pose.joints[1].y - 1;
  await expectMotionRejection("below-min-length", plan);
}
{
  const plan = clonePlan(wavePlan);
  const pose = keyPoseCommands(plan)[1];
  pose.joints[0].x = pose.joints[1].x;
  pose.joints[0].y = 0;
  await expectMotionRejection("above-max-length", plan);
}
{
  const plan = clonePlan(wavePlan);
  const pose = keyPoseCommands(plan)[1];
  pose.joints[0].x = pose.joints[1].x;
  pose.joints[0].y = pose.joints[1].y + 100;
  await expectMotionRejection("ambiguous-turn", plan);
}
{
  const plan = clonePlan(wavePlan);
  const pose = keyPoseCommands(plan)[1];
  pose.joints[0].x = pose.joints[1].x + 9;
  pose.joints[0].y = pose.joints[1].y + 100;
  await expectMotionRejection("turn-over-170", plan);
}
{
  const plan = clonePlan(wavePlan);
  const firstPose = plan.commands.findIndex((command) => command.type === "create_key_pose");
  const secondPose = plan.commands.findIndex((command, index) => index > firstPose && command.type === "create_key_pose");
  [plan.commands[firstPose], plan.commands[secondPose]] = [plan.commands[secondPose], plan.commands[firstPose]];
  await expectMotionRejection("pose-index-out-of-order", plan);
}
{
  const plan = clonePlan(wavePlan);
  keyPoseCommands(plan)[1].frameIndex = 1;
  await expectMotionRejection("pose-index-too-close", plan);
}
{
  const plan = clonePlan(wavePlan);
  keyPoseCommands(plan)[1].joints = cloneCanonical(keyPoseCommands(plan)[0].joints);
  await expectMotionRejection("identical-important-pose", plan);
}
{
  const plan = clonePlan(wavePlan);
  for (const joint of keyPoseCommands(plan)[1].joints) joint.x += 540;
  await expectMotionRejection("hip-over-480", plan);
}
{
  const plan = clonePlan(wavePlan);
  for (const joint of keyPoseCommands(plan)[0].joints) joint.x -= 760;
  const pose = keyPoseCommands(plan)[0];
  const leftHand = pose.joints[STICK_JOINT_ROLES.indexOf("leftHand")];
  leftHand.x = 0;
  leftHand.y = 500;
  await expectMotionRejection("normalized-out-of-bounds", plan);
}
{
  const plan = clonePlan(wavePlan);
  const poses = keyPoseCommands(plan);
  for (const pose of poses) for (const joint of pose.joints) joint.x -= 760;
  const configure = (pose: typeof poses[number], handY: number) => {
    const elbow = pose.joints[STICK_JOINT_ROLES.indexOf("leftElbow")];
    const hand = pose.joints[STICK_JOINT_ROLES.indexOf("leftHand")];
    elbow.x = 140;
    elbow.y = 460;
    hand.x = 73;
    hand.y = handY;
  };
  configure(poses[0], 576);
  configure(poses[1], 344);
  await expectMotionRejection("interpolation-out-of-bounds", plan);
}
{
  const plan = clonePlan(wavePlan) as StickAnimationPlanV1 & {motionController?: unknown};
  plan.motionController = {kind: "persistent"};
  await expectMotionRejection("hidden-motion-payload", plan);
}

const waveCandidate = motionCandidates.get("wave");
assert.ok(waveCandidate);
{
  const candidate = cloneCanonical(waveCandidate);
  candidate.layers[0].cells[1] = candidate.layers[0].cells[0];
  check(!assertIndependentBakedStickMotion(candidate), "shared-cell-object fails closed");
}
{
  const candidate = cloneCanonical(waveCandidate);
  const first = candidate.layers[0].cells[0];
  const second = candidate.layers[0].cells[1];
  assert.equal(first.cellType, "keyframe");
  assert.equal(second.cellType, "keyframe");
  second.poses[0] = first.poses[0];
  check(!assertIndependentBakedStickMotion(candidate), "shared-pose-object fails closed");
}
{
  const candidate = cloneCanonical(waveCandidate);
  const first = candidate.layers[0].cells[0];
  const second = candidate.layers[0].cells[1];
  assert.equal(first.cellType, "keyframe");
  assert.equal(second.cellType, "keyframe");
  second.poses[0].points = first.poses[0].points;
  check(!assertIndependentBakedStickMotion(candidate), "shared-points-array fails closed");
}
{
  const candidate = cloneCanonical(waveCandidate);
  const first = candidate.layers[0].cells[0];
  const second = candidate.layers[0].cells[1];
  assert.equal(first.cellType, "keyframe");
  assert.equal(second.cellType, "keyframe");
  second.poses[0].points[0] = first.poses[0].points[0];
  check(!assertIndependentBakedStickMotion(candidate), "shared-point-object fails closed");
}
{
  const root = await createStickCommandWorkspaceRoot(starter, "invalid-option");
  assertionCount += 1;
  assert.throws(() => new StickFigureCommandTransactionV1(root, {
    animationPlanMaterializer: "unknown-motion-mode" as typeof STICK_PHASE2_MOTION_MATERIALIZER,
  }), /Unknown Stick animation-plan materializer/, "unknown transaction option fails closed");
}
{
  const golden = cases.validCases[0];
  const tampered = clonePlan(wavePlan);
  keyPoseCommands(tampered)[1].joints[6].x += 1;
  const result = await materializeStickAnimationMotionPlan(tampered, starter);
  check(result.ok, "safe one-byte plan tamper can still form a bounded generic candidate");
  if (result.ok) notEqual(await digestCanonical(result.value), golden.motionCandidateDigest, "fixture tamper cannot satisfy the frozen golden digest");
}

equal(new Set(cases.invalidCases).size, cases.invalidCases.length, "invalid fixture IDs are unique");
equal(cases.invalidCases, [
  "missing-joint", "duplicate-joint", "zero-segment", "below-min-length", "above-max-length", "ambiguous-turn",
  "turn-over-170", "pose-index-out-of-order", "pose-index-too-close", "identical-important-pose", "hip-over-480",
  "normalized-out-of-bounds", "interpolation-out-of-bounds", "hidden-motion-payload", "shared-cell-object",
  "shared-pose-object", "shared-points-array", "shared-point-object", "transaction-option-invalid", "fixture-tamper",
], "complete invalid case catalog");

for (const candidate of motionCandidates.values()) {
  const parsed = parseStickProjectDocument(candidate);
  check(parsed.ok, "candidate passes the normal canonical document validator");
  if (parsed.ok) {
    const serialized = canonicalJson(parsed.value);
    check(!/(motionController|generatedOwner|aiOnly|regeneration|snapBack|lock|tween)/i.test(serialized), "candidate contains no hidden motion/AI controller data");
    check(!parsed.value.layers[0].cells.some((cell) => cell.cellType !== "keyframe"), "candidate contains no hold/tween/empty cells");
  }
}

const summary = {
  validatorVersion: 1,
  phase: "SPEC-0004 Phase 2",
  assertionCount,
  validFixtures: cases.validCases.map((entry) => entry.name),
  invalidCases: cases.invalidCases,
  topology: {jointCount: STICK_JOINT_ROLES.length, segmentCount: STICK_SEGMENT_ROLE_PAIRS.length},
  bounds: {
    inputLengthRatio: [STICK_PHASE2_INPUT_LENGTH_MIN_RATIO, STICK_PHASE2_INPUT_LENGTH_MAX_RATIO],
    outputLengthTolerancePx: STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX,
    hipTravelPx: STICK_PHASE2_MAX_HIP_TRAVEL_PX,
    segmentTurnDegrees: STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES,
    headEdgeMarginPx: STICK_PHASE2_HEAD_EDGE_MARGIN_PX,
  },
  externalRequests: 0,
  apiRequests: 0,
  providerRequests: 0,
};

console.log(JSON.stringify(summary, null, 2));
