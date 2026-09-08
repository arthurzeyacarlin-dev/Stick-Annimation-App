import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";
import {
  STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION,
  STICK_BODY_SAFETY_FAILURE_REASONS,
  STICK_BODY_SAFETY_SELECTION_CONTRACT_VERSION,
  finalizeStickBodySafetyCandidate,
  finalizeStickBodySafetyCandidateV2,
  qualifyStickBodySafetyCandidateSequencesV2,
  type StickBodySafetyCompletionInputV2,
  selectStickBodySafetyImportantPoses,
  type StickBodySafetyAnimationIntentV1,
  type StickBodySafetyChain,
  type StickBodySafetyCheckedSelectionV1,
  type StickBodySafetyCompletionInputV1,
  type StickBodySafetyFailureReason,
  type StickBodySafetyFrameContextV1,
  type StickBodySafetyPoint,
  type StickBodySafetyPointMap,
  type StickBodySafetySelectionRequestV1,
} from "../src/lib/ai/stickFigureBodySafety.ts";
import {
  finalizeStickSpec0005MotionCandidate,
  materializeParsedStickAnimationMotionPlan,
} from "../src/lib/ai/stickFigureMotionEngine.ts";
import {
  StickFigureCommandTransactionV1,
  createStickCommandWorkspaceRoot,
} from "../src/lib/ai/stickFigureCommandExecutor.ts";
import {
  STICK_JOINT_ROLES,
  STICK_SEGMENT_ROLE_PAIRS,
  canonicalJson,
  cloneCanonical,
  digestCanonical,
  type StickJointRoleV1,
  type StickProjectDocumentV1,
} from "../src/lib/stickfigure/stickProjectContract.ts";
import {parseStickAnimationPlan, type StickAnimationPlanV1, type StickCommandBatchV1} from "../src/lib/ai/stickFigureAiContract.ts";
import {
  buildOracleCase, catalog as naturalCatalog, chains as naturalChains,
  chainRoles as naturalChainRoles, solveOracleChain,
  contextFor as naturalContextFor, oracleFinal, oracleFrame, oracleContextAt, oracleRequest,
  oracleOwner, propertyProbe, mirrorOracle, kneeGuideProbe, posedProject, roundPose,
  type NaturalRequest, type Pose, type Context, type OracleFinalFrame,
} from "./validateStickBodyNaturalSafety.ts";

type Catalog = {
  fixtureVersion: number;
  decision: string;
  selectionContractVersion: string;
  selectionResultVersion: string;
  completionContractVersion: string;
  stage: {width: number; height: number};
  propertyRun: {seed: number; candidateCount: number; mirrorCount: number};
  positiveCases: Array<{id: string; kind: string}>;
  negativeCases: Array<{id: string; kind: string; reason: StickBodySafetyFailureReason; stage: string}>;
  closedFailureReasons: StickBodySafetyFailureReason[];
  witnesses: {
    dualSafeArm: {target: StickBodySafetyPoint};
    torsoClearance: {target: StickBodySafetyPoint; branch: -1 | 1};
    headCrossing: {target: StickBodySafetyPoint; branch: -1 | 1; crouchDy: number};
    oppositeLegCrossing: {inset: number; leftBranch: -1 | 1; rightBranch: -1 | 1};
    rejectedReachBranch: {target: StickBodySafetyPoint; branch: -1 | 1; crouchDy: number};
    roundingOnlyCrossing: {baseAngle: number; delta: number; leftBend: number; rightBend: number};
  };
};
type FrameSpec = {
  points: StickBodySafetyPointMap;
  context?: StickBodySafetyFrameContextV1;
  important?: boolean;
  activeChains?: StickBodySafetyChain[];
  importantSeed?: StickBodySafetyPointMap;
};
type PendingSafetyInput = Omit<StickBodySafetyCompletionInputV1, "checkedSelection">;

const ROOT = process.cwd();
const readJson = <T,>(path: string) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;
const starter = readJson<StickProjectDocumentV1>("scripts/fixtures/stick-ai/v1/fresh-stick-project.json");
const planEnvelope = readJson<StickAnimationPlanV1>("scripts/fixtures/stick-ai/v3/wave.json");
const legacyEnvelope = readJson<StickCommandBatchV1>("scripts/fixtures/stick-ai/v1/wave-command-batch.json");
const starterDigest = await digestCanonical(starter);
const catalog = readJson<Catalog>("scripts/fixtures/spec0005-stick/v2/body-safety-cases.json");
assert.deepEqual(catalog.stage, {width: starter.coordinateSpace.width, height: starter.coordinateSpace.height});
const starterCell = starter.layers[0].cells[0];
assert.equal(starterCell.cellType, "keyframe");
const neutral = Object.fromEntries(starter.rigs[0].joints.map((joint, index) => [joint.role, {
  x: starterCell.cellType === "keyframe" ? starterCell.poses[0].points[index].x : 0,
  y: starterCell.cellType === "keyframe" ? starterCell.poses[0].points[index].y : 0,
}])) as StickBodySafetyPointMap;
const H = Math.max(neutral.leftFoot.y, neutral.rightFoot.y) - neutral.head.y;
const canonicalLengths = new Map(STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => [`${from}:${to}`, Math.hypot(
  neutral[to].x - neutral[from].x,
  neutral[to].y - neutral[from].y,
)]));

let assertions = 0;
const equal = <T,>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const ok = (actual: unknown, message: string) => {
  assert.ok(actual, message);
  assertions += 1;
};
const clonePoints = (points: StickBodySafetyPointMap): StickBodySafetyPointMap =>
  Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {...points[role]}])) as StickBodySafetyPointMap;
const roundPoints = (points: StickBodySafetyPointMap): StickBodySafetyPointMap =>
  Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {x: Math.round(points[role].x), y: Math.round(points[role].y)}])) as StickBodySafetyPointMap;
const translate = (points: StickBodySafetyPointMap, dx: number, dy = 0) => {
  const result = clonePoints(points);
  for (const role of STICK_JOINT_ROLES) {
    result[role].x += dx;
    result[role].y += dy;
  }
  return result;
};
const pointAt = (root: StickBodySafetyPoint, degrees: number, length: number): StickBodySafetyPoint => ({
  x: root.x + Math.cos(degrees * Math.PI / 180) * length,
  y: root.y + Math.sin(degrees * Math.PI / 180) * length,
});
const angle = (from: StickBodySafetyPoint, to: StickBodySafetyPoint) => Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
const wrap = (value: number) => {
  let result = ((value + 180) % 360 + 360) % 360 - 180;
  if (result === -180) result = 180;
  return result;
};
const bend = (root: StickBodySafetyPoint, joint: StickBodySafetyPoint, effector: StickBodySafetyPoint) =>
  wrap(angle(joint, effector) - angle(root, joint));
const solveJoint = (
  root: StickBodySafetyPoint,
  effector: StickBodySafetyPoint,
  firstLength: number,
  secondLength: number,
  desiredSign: -1 | 1,
) => {
  const dx = effector.x - root.x;
  const dy = effector.y - root.y;
  const d = Math.hypot(dx, dy);
  if (d <= 0 || d > firstLength + secondLength || d < Math.abs(firstLength - secondLength)) throw new Error("unreachable independent fixture joint");
  const a = (firstLength ** 2 - secondLength ** 2 + d ** 2) / (2 * d);
  const h = Math.sqrt(Math.max(0, firstLength ** 2 - a ** 2));
  const base = {x: root.x + a * dx / d, y: root.y + a * dy / d};
  const offset = {x: -dy * h / d, y: dx * h / d};
  const solutions = [
    {x: base.x + offset.x, y: base.y + offset.y},
    {x: base.x - offset.x, y: base.y - offset.y},
  ];
  return solutions.find((joint) => Math.sign(bend(root, joint, effector)) === desiredSign) ?? solutions[0];
};
const setChain = (
  points: StickBodySafetyPointMap,
  chain: StickBodySafetyChain,
  effector: StickBodySafetyPoint,
  sign: -1 | 1,
) => {
  const roles = chain === "leftArm" ? ["neck", "leftElbow", "leftHand"] as const
    : chain === "rightArm" ? ["neck", "rightElbow", "rightHand"] as const
      : chain === "leftLeg" ? ["hip", "leftKnee", "leftFoot"] as const
        : ["hip", "rightKnee", "rightFoot"] as const;
  const [root, joint, end] = roles;
  points[end] = {...effector};
  points[joint] = solveJoint(points[root], points[end], canonicalLengths.get(`${root}:${joint}`)!, canonicalLengths.get(`${joint}:${end}`)!, sign);
};
const articulatedArm = (source: StickBodySafetyPointMap, chain: "leftArm" | "rightArm", upperAngle: number, bendDegrees: number) => {
  const points = clonePoints(source);
  const side = chain === "leftArm" ? "left" : "right";
  const elbow = `${side}Elbow` as "leftElbow" | "rightElbow";
  const hand = `${side}Hand` as "leftHand" | "rightHand";
  points[elbow] = pointAt(points.neck, upperAngle, canonicalLengths.get(`neck:${elbow}`)!);
  points[hand] = pointAt(points[elbow], upperAngle + bendDegrees, canonicalLengths.get(`${elbow}:${hand}`)!);
  return points;
};
const crouch = (dy: number, leftSign: -1 | 1 = -1, rightSign: -1 | 1 = 1) => {
  const points = clonePoints(neutral);
  for (const role of ["head", "neck", "hip", "leftElbow", "leftHand", "rightElbow", "rightHand"] as const) points[role].y += dy;
  setChain(points, "leftLeg", neutral.leftFoot, leftSign);
  setChain(points, "rightLeg", neutral.rightFoot, rightSign);
  return points;
};
const shiftedCrouch = (dx: number, dy: number, leftSign: -1 | 1 = -1, rightSign: -1 | 1 = 1) => {
  const points = clonePoints(neutral);
  for (const role of ["head", "neck", "hip", "leftElbow", "leftHand", "rightElbow", "rightHand"] as const) {
    points[role].x += dx;
    points[role].y += dy;
  }
  setChain(points, "leftLeg", neutral.leftFoot, leftSign);
  setChain(points, "rightLeg", neutral.rightFoot, rightSign);
  return points;
};
const mirrorPoints = (points: StickBodySafetyPointMap): StickBodySafetyPointMap => {
  const axis = points.hip.x;
  const swapped = (role: StickJointRoleV1): StickJointRoleV1 => role.startsWith("left")
    ? `right${role.slice(4)}` as StickJointRoleV1
    : role.startsWith("right") ? `left${role.slice(5)}` as StickJointRoleV1 : role;
  return Object.fromEntries(STICK_JOINT_ROLES.map((role) => {
    const source = points[swapped(role)];
    return [role, {x: 2 * axis - source.x, y: source.y}];
  })) as StickBodySafetyPointMap;
};
const contextFor = (
  points: StickBodySafetyPointMap,
  overrides: Partial<StickBodySafetyFrameContextV1> = {},
): StickBodySafetyFrameContextV1 => ({
  posture: "neutral",
  motionPhase: "rest",
  impact: false,
  support: "both",
  limbIntents: {leftArm: "unspecified", rightArm: "unspecified", leftLeg: "unspecified", rightLeg: "unspecified"},
  plantedAnchors: {leftFoot: {...points.leftFoot}, rightFoot: {...points.rightFoot}},
  targetEffectors: {},
  path: null,
  balanceErrorX: 0,
  actingDisplacementH: 0,
  rootDisplacementH: 0,
  landmarks: [],
  ...cloneCanonical(overrides),
});
const makeDocument = (frames: StickBodySafetyPointMap[]): StickProjectDocumentV1 => {
  const document = cloneCanonical(starter);
  document.documentRevision = starter.documentRevision + 1;
  document.layers[0].cells = frames.map((points, frameIndex) => ({
    frameId: `10000000-0000-4000-8000-${String(frameIndex + 1).padStart(12, "0")}`,
    index: frameIndex,
    cellType: "keyframe" as const,
    poses: [{
      poseId: `20000000-0000-4000-8000-${String(frameIndex + 1).padStart(12, "0")}`,
      figureId: starter.figures[0].figureId,
      rigId: starter.rigs[0].rigId,
      points: starter.rigs[0].joints.map((joint) => ({jointId: joint.jointId, ...points[joint.role]})),
    }],
  }));
  return document;
};
const makeInput = (
  frames: FrameSpec[],
  intentOverrides: Partial<StickBodySafetyAnimationIntentV1> = {},
): PendingSafetyInput => {
  const normalized = frames.map((frame) => ({
    ...frame,
    points: roundPoints(frame.points),
    context: frame.context ?? contextFor(roundPoints(frame.points)),
  }));
  const importantIndexes = normalized.flatMap((frame, index) => frame.important === false ? [] : [index]);
  const finalFrames = normalized.map((frame, frameIndex) => ({frameIndex, points: frame.points, context: cloneCanonical(frame.context)}));
  const animationIntent: StickBodySafetyAnimationIntentV1 = {
    movementKind: "hold",
    loop: false,
    actingEffectors: [],
    requiredLandmarks: [],
    expectedPeakFrames: [],
    ...cloneCanonical(intentOverrides),
  };
  const selectionRequest: StickBodySafetySelectionRequestV1 = {
    contractVersion: STICK_BODY_SAFETY_SELECTION_CONTRACT_VERSION,
    binding: {
      projectId: starter.projectId,
      transactionId: planEnvelope.transactionId,
      baseDocumentRevision: starter.documentRevision,
      baseDocumentDigest: starterDigest,
    },
    neutralMetrics: {
      topology: "humanoid-11-v1",
      stage: "stick-stage-1920x1080-v1",
      standingBodyHeight: H,
      groundY: Math.max(neutral.leftFoot.y, neutral.rightFoot.y),
      neutralPoints: clonePoints(neutral),
      segmentLengths: STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => ({from, to, length: canonicalLengths.get(`${from}:${to}`)!})),
    },
    importantPoses: importantIndexes.map((frameIndex) => ({
      frameIndex,
      seed: clonePoints(frames[frameIndex].importantSeed ?? frames[frameIndex].points),
      activeChains: [...(frames[frameIndex].activeChains ?? [])],
      context: cloneCanonical(normalized[frameIndex].context),
    })),
    animationIntent: cloneCanonical(animationIntent),
  };
  return {
    contractVersion: STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION,
    selectionRequest,
    finalFrames,
    candidateDocument: makeDocument(finalFrames.map(({points}) => points)),
    animationIntent,
  };
};
const mutate = <T,>(value: T, change: (draft: T) => void): T => {
  const draft = cloneCanonical(value);
  change(draft);
  return draft;
};

const observedNegatives = new Map<string, {reason: string; stage: string}>();
const observedPositives = new Set<string>();
const completePending = async (input: PendingSafetyInput): Promise<StickBodySafetyCompletionInputV1 | {ok: false; error: {reason: StickBodySafetyFailureReason; stage: string; message: string}}> => {
  const selection = await selectStickBodySafetyImportantPoses(input.selectionRequest, starter);
  return selection.ok ? {...cloneCanonical(input), checkedSelection: cloneCanonical(selection.value)} : selection;
};
const evaluate = async (input: unknown) => {
  const keys = input && typeof input === "object" ? Object.keys(input).sort() : [];
  const pendingKeys = ["animationIntent", "candidateDocument", "contractVersion", "finalFrames", "selectionRequest"];
  if (canonicalJson(keys) === canonicalJson(pendingKeys)) {
    const completed = await completePending(input as PendingSafetyInput);
    return "ok" in completed ? completed : await finalizeStickBodySafetyCandidate(completed, starter);
  }
  return await finalizeStickBodySafetyCandidate(input, starter);
};
const expectPass = async (id: string, input: unknown) => {
  const result = await evaluate(input);
  assert.equal(result.ok, true, `${id} must pass: ${result.ok ? "" : canonicalJson(result.error)}`);
  assertions += 1;
  observedPositives.add(id);
  return result.ok ? result.value : null;
};
const expectFailure = async (id: string, input: unknown, reason: StickBodySafetyFailureReason, stage: string) => {
  const result = await evaluate(input);
  assert.equal(result.ok, false, `${id} must fail`);
  if (result.ok) throw new Error(`${id} unexpectedly passed`);
  equal(result.error.reason, reason, `${id} reason`);
  equal(result.error.stage, stage, `${id} stage`);
  observedNegatives.set(id, {reason, stage});
  return result.error;
};

equal(catalog.fixtureVersion, 2, "fixture version");
equal(catalog.decision, "D-0047", "correction decision");
equal(catalog.selectionContractVersion, STICK_BODY_SAFETY_SELECTION_CONTRACT_VERSION, "selection contract version");
equal(catalog.selectionResultVersion, "stick.body-safety-selection-result/v1", "selection result version");
equal(catalog.completionContractVersion, STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION, "completion contract version");
equal(catalog.closedFailureReasons, [...STICK_BODY_SAFETY_FAILURE_REASONS], "closed failure reason order");

const neutralInput = makeInput([{points: neutral}]);
const neutralOutput = await expectPass("stationary-neutral-straight-knees", makeInput([
  {points: neutral}, {points: neutral}, {points: neutral},
]));
ok(Object.isFrozen(neutralOutput), "qualified output is frozen");
ok(Object.isFrozen(neutralOutput?.document), "qualified document is frozen");
equal(canonicalJson(await evaluate(neutralInput)), canonicalJson(await evaluate(cloneCanonical(neutralInput))), "qualification is byte deterministic");

// A full neutral -> flexion -> neutral sequence independently constructs both leg branches,
// survives integer rounding, and derives its sole acting peak from final geometry.
const crouchFrames: FrameSpec[] = [];
for (let index = 0; index <= 16; index += 1) {
  const dy = (index <= 8 ? index : 16 - index) * 10;
  const points = dy === 0 ? clonePoints(neutral) : crouch(dy);
  const endpoint = index === 0 || index === 16;
  const context = contextFor(points, endpoint ? {} : {
    posture: "lower",
    motionPhase: "moving",
    limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
    actingDisplacementH: dy / H,
    rootDisplacementH: dy / H,
    landmarks: index === 8 ? ["compression"] : [],
  });
  crouchFrames.push({points, context, important: [0, 4, 8, 12, 16].includes(index)});
}
const crouchInput = makeInput(crouchFrames, {
  movementKind: "movement",
  loop: true,
  actingEffectors: ["hip"],
  requiredLandmarks: ["compression"],
  expectedPeakFrames: [8],
});
const crouchOutput = await expectPass("neutral-rest-to-safe-flexion", crouchInput);
equal(crouchOutput?.qualification.importantPoseCount, 5, "important flexion pose count");
equal(crouchOutput?.qualification.finalFrameCount, 17, "rounded final frame count");

const mirroredCrouch = mirrorPoints(crouch(40));
const mirroredContext = contextFor(mirroredCrouch, {
  posture: "lower",
  motionPhase: "rest",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  actingDisplacementH: 40 / H,
  rootDisplacementH: 40 / H,
});
await expectPass("safe-mirrored-arms-and-legs", makeInput([{points: mirroredCrouch, context: mirroredContext}]));
equal(roundPoints(mirroredCrouch), roundPoints(crouch(40)), "symmetric safe crouch is mirror invariant after rounding");
await expectPass("relaxed-unspecified-limbs", neutralInput);
await expectPass("double-support-balance-floor", neutralInput);

const singleSupport = shiftedCrouch(-8, 10);
const singleSupportContext = contextFor(singleSupport, {
  posture: "lower",
  motionPhase: "rest",
  support: "left",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  plantedAnchors: {leftFoot: {...singleSupport.leftFoot}, rightFoot: null},
  rootDisplacementH: Math.hypot(8, 10) / H,
});
await expectPass("single-support-balance-floor", makeInput([{points: singleSupport, context: singleSupportContext}]));

const balanceArm = clonePoints(neutral);
setChain(balanceArm, "leftArm", {x: neutral.leftHand.x - 5, y: neutral.leftHand.y - 20}, -1);
const balanceContext = contextFor(balanceArm, {
  limbIntents: {leftArm: "balance", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  balanceErrorX: 20,
  actingDisplacementH: 0.1,
  targetEffectors: {leftHand: {...balanceArm.leftHand}},
});
await expectPass("proportional-balance-response", makeInput([{points: balanceArm, context: balanceContext}]));
await expectPass("segment-preservation-before-after-rounding", makeInput([{points: crouch(30), context: contextFor(crouch(30), {
  posture: "lower",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
})}]));
equal(
  canonicalJson((await expectPass("no-op-contact-repair", neutralInput))?.document),
  canonicalJson((await expectPass("no-op-contact-repair-repeat", cloneCanonical(neutralInput)))?.document),
  "no-op repair path leaves qualified bytes unchanged",
);

// Find a deterministic reachable arm target for which both independently enumerated circle
// solutions are safe. This proves the runtime considered both branches, then lets prior-pose
// continuity select either branch without a fixed screen-side rule.
const dualTarget = catalog.witnesses.dualSafeArm.target;
const dualLeft = clonePoints(neutral);
const dualRight = clonePoints(neutral);
setChain(dualLeft, "leftArm", dualTarget, -1);
setChain(dualRight, "leftArm", dualTarget, 1);
const dualSolutions: [StickBodySafetyPointMap, StickBodySafetyPointMap] = [dualLeft, dualRight];
const dualContext = contextFor(dualSolutions[0], {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  targetEffectors: {leftHand: dualTarget},
});
const nearestDual = [...dualSolutions].sort((left, right) =>
  Math.hypot(left.leftElbow.x - neutral.leftElbow.x, left.leftElbow.y - neutral.leftElbow.y) -
  Math.hypot(right.leftElbow.x - neutral.leftElbow.x, right.leftElbow.y - neutral.leftElbow.y))[0];
const dualInput = makeInput([{points: nearestDual, context: dualContext, activeChains: ["leftArm"], importantSeed: nearestDual}]);
const dualOutput = await expectPass("both-ik-branches-enumerated", dualInput);
equal(dualOutput?.qualification.ikSolutionsEnumerated, 2, "both finite circle intersections are enumerated");
equal(dualOutput?.qualification.wholeBodyCandidatesConsidered, 2, "both safe whole-body branches are considered");

const continuityInput = (first: StickBodySafetyPointMap, second: StickBodySafetyPointMap) => makeInput([
  {points: first, context: dualContext},
  {points: second, context: dualContext, activeChains: ["leftArm"], importantSeed: second},
]);
const continuityLeft = await expectPass("continuity-selects-safe-branch-left", continuityInput(dualSolutions[0], dualSolutions[0]));
const continuityRight = await expectPass("continuity-selects-safe-branch-right", continuityInput(dualSolutions[1], dualSolutions[1]));
equal(Math.sign(continuityLeft!.selectedImportantPoses[1].branchSigns.leftArm), Math.sign(continuityLeft!.selectedImportantPoses[0].branchSigns.leftArm), "left prior branch is retained");
equal(Math.sign(continuityRight!.selectedImportantPoses[1].branchSigns.leftArm), Math.sign(continuityRight!.selectedImportantPoses[0].branchSigns.leftArm), "right prior branch is retained");
assert.notEqual(continuityLeft!.selectedImportantPoses[1].branchSigns.leftArm, continuityRight!.selectedImportantPoses[1].branchSigns.leftArm);
assertions += 1;
observedPositives.add("continuity-selects-safe-branch");

const recoveryFar = articulatedArm(neutral, "leftArm", 175, -70);
const recoveryNear = articulatedArm(neutral, "leftArm", 155, -45);
const recoveryStartContext = contextFor(recoveryFar, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
});
const recoveryEndContext = contextFor(recoveryNear, {
  motionPhase: "settle",
  limbIntents: {leftArm: "recover", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
});
await expectPass("monotonic-recovery", makeInput([
  {points: recoveryFar, context: recoveryStartContext},
  {points: recoveryNear, context: recoveryEndContext},
]));

// Basic important/final-frame witnesses used to bring up the complete named matrix below.
await expectFailure("impossible-reach", mutate(neutralInput, (draft) => {
  draft.selectionRequest.importantPoses[0].activeChains = ["leftArm"];
  draft.selectionRequest.importantPoses[0].seed.leftHand = {x: 1_500, y: 100};
}), "no_safe_sequence", "important_pose");
observedPositives.add("no-safe-candidate-no-preview");
await expectFailure("zero-length-segment", mutate(neutralInput, (draft) => {
  draft.selectionRequest.importantPoses[0].seed.leftHand = {...draft.selectionRequest.importantPoses[0].seed.leftElbow};
}), "segment_length", "important_pose");
await expectFailure("stretched-segment", mutate(neutralInput, (draft) => {
  draft.selectionRequest.importantPoses[0].seed.leftHand.x -= 40;
}), "segment_length", "important_pose");
const shortFinal = clonePoints(neutral);
shortFinal.head = {...shortFinal.neck};
await expectFailure("rounded-sub-two-pixel-segment", makeInput([
  {points: neutral},
  {points: shortFinal, important: false},
]), "segment_length", "final_frame");

const straightElbow = articulatedArm(neutral, "leftArm", 145, 0);
await expectFailure("straight-through-elbow-singularity", makeInput([{points: straightElbow, context: contextFor(straightElbow, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
})}]), "branch_singularity", "important_pose");
const tangentArm = clonePoints(neutral);
const tangentAngle = 150;
tangentArm.leftElbow = pointAt(tangentArm.neck, tangentAngle, canonicalLengths.get("neck:leftElbow")!);
tangentArm.leftHand = pointAt(tangentArm.leftElbow, tangentAngle, canonicalLengths.get("leftElbow:leftHand")!);
await expectFailure("active-tangent-elbow-singularity", makeInput([{points: tangentArm, context: contextFor(tangentArm, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  targetEffectors: {leftHand: {...tangentArm.leftHand}},
}), activeChains: ["leftArm"]}]), "branch_singularity", "important_pose");
await expectFailure("straight-through-knee-singularity", mutate(neutralInput, (draft) => {
  draft.selectionRequest.importantPoses[0].context.motionPhase = "moving";
  draft.selectionRequest.importantPoses[0].context.limbIntents.leftLeg = "act";
  draft.finalFrames[0].context = cloneCanonical(draft.selectionRequest.importantPoses[0].context);
}), "branch_singularity", "important_pose");

await expectFailure("elbow-branch-flip", makeInput([
  {points: dualSolutions[0], context: dualContext},
  {points: dualSolutions[1], context: dualContext, important: false},
]), "branch_flip", "final_frame");

const kneeBranchLeft = crouch(20, -1, 1);
const kneeBranchRight = crouch(20, 1, 1);
const kneeBranchContext = contextFor(kneeBranchLeft, {
  posture: "lower",
  motionPhase: "moving",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  actingDisplacementH: 20 / H,
  rootDisplacementH: 20 / H,
});
await expectPass("left-knee-negative-branch-safe", makeInput([{points: kneeBranchLeft, context: kneeBranchContext}]));
await expectPass("left-knee-positive-branch-safe", makeInput([{points: kneeBranchRight, context: kneeBranchContext}]));
for (const id of ["knee-branch-flip", "knee-inversion"] as const) {
  await expectFailure(id, makeInput([
    {points: kneeBranchLeft, context: kneeBranchContext},
    {points: kneeBranchRight, context: kneeBranchContext, important: false},
  ]), "branch_flip", "final_frame");
}
const kneeAtBend = (degrees: number) => {
  const points = clonePoints(neutral);
  const upperAngle = angle(points.hip, points.leftKnee);
  points.leftKnee = pointAt(points.hip, upperAngle, canonicalLengths.get("hip:leftKnee")!);
  points.leftFoot = pointAt(points.leftKnee, upperAngle - degrees, canonicalLengths.get("leftKnee:leftFoot")!);
  return points;
};
for (const [id, degrees] of [["moving-knee-near-lock", 1], ["knee-dead-corridor", 4]] as const) {
  const points = kneeAtBend(degrees);
  await expectFailure(id, makeInput([{points, context: contextFor(points, {
    motionPhase: "moving",
    support: "right",
    limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "relax"},
    plantedAnchors: {leftFoot: null, rightFoot: {...neutral.rightFoot}},
  })}]), "knee_bend", "important_pose");
}

const falselyRestingInterior = makeInput([
  {points: crouch(10), context: contextFor(crouch(10), {
    posture: "lower", motionPhase: "moving",
    limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  })},
  {points: neutral, context: contextFor(neutral)},
  {points: crouch(10), context: contextFor(crouch(10), {
    posture: "lower", motionPhase: "moving",
    limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  })},
]);
await expectFailure("rest-label-cannot-waive-moving-knee-floor", falselyRestingInterior, "knee_bend", "important_pose");
await expectFailure("straight-neutral-one-adjacent-only", makeInput([
  {points: neutral, context: contextFor(neutral)},
  {points: neutral, context: contextFor(neutral)},
  {points: crouch(10), context: contextFor(crouch(10), {
    posture: "lower",
    motionPhase: "moving",
    limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
    rootDisplacementH: 10 / H,
  })},
]), "knee_bend", "important_pose");
const invertedHead = clonePoints(neutral);
invertedHead.head = pointAt(invertedHead.neck, 90, canonicalLengths.get("head:neck")!);
await expectFailure("head-inversion", makeInput([{points: invertedHead}]), "torso_head", "important_pose");
const outsideStage = translate(neutral, 1_000);
await expectFailure("stage-bounds-rule", makeInput([{points: outsideStage, context: contextFor(outsideStage)}]), "stage_bounds", "important_pose");
const shallowElbow = articulatedArm(neutral, "leftArm", 145, -4);
await expectFailure("elbow-bend-rule", makeInput([{points: shallowElbow, context: contextFor(shallowElbow, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
})}]), "elbow_bend", "important_pose");
const nonFiniteInput = cloneCanonical(neutralInput) as unknown as Record<string, unknown>;
((((nonFiniteInput.selectionRequest as {importantPoses: Array<{seed: StickBodySafetyPointMap}>}).importantPoses)[0].seed.leftHand) as {x: number}).x = Number.POSITIVE_INFINITY;
await expectFailure("non-finite-geometry-rule", nonFiniteInput, "non_finite_geometry", "integration");

const torsoKink = clonePoints(neutral);
torsoKink.neck = pointAt(torsoKink.hip, -50, canonicalLengths.get("neck:hip")!);
torsoKink.head = pointAt(torsoKink.neck, -50, canonicalLengths.get("head:neck")!);
const neckDelta = {x: torsoKink.neck.x - neutral.neck.x, y: torsoKink.neck.y - neutral.neck.y};
for (const role of ["leftElbow", "leftHand", "rightElbow", "rightHand"] as const) {
  torsoKink[role].x += neckDelta.x;
  torsoKink[role].y += neckDelta.y;
}
await expectFailure("torso-kink", makeInput([{points: torsoKink}]), "torso_head", "important_pose");

const headLeft = clonePoints(neutral);
headLeft.head = pointAt(headLeft.neck, -97, canonicalLengths.get("head:neck")!);
const headRight = clonePoints(neutral);
headRight.head = pointAt(headRight.neck, -83, canonicalLengths.get("head:neck")!);
await expectFailure("head-snap", makeInput([
  {points: headLeft},
  {points: headRight, important: false},
]), "torso_head", "final_frame");

await expectFailure("recover-away-from-rest", makeInput([
  {points: recoveryNear, context: recoveryStartContext},
  {points: recoveryFar, context: recoveryEndContext},
]), "recovery", "important_pose");
await expectFailure("final-interior-recovery-away", makeInput([
  {points: recoveryNear, context: recoveryStartContext},
  {points: recoveryFar, context: recoveryEndContext, important: false},
]), "recovery", "final_frame");

const wArms = articulatedArm(articulatedArm(neutral, "leftArm", -160, 60), "rightArm", -20, -60);
await expectFailure("unspecified-w-arms", makeInput([{points: wArms}]), "unrequested_motion", "important_pose");

const droppedHip = shiftedCrouch(0, 50);
await expectFailure("unsolicited-hip-drop", makeInput([{points: droppedHip, context: contextFor(droppedHip, {
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
})}]), "unrequested_motion", "important_pose");

const falseContactPose = crouch(20);
const falseContactContext = contextFor(falseContactPose, {
  posture: "lower",
  motionPhase: "moving",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  plantedAnchors: {leftFoot: null, rightFoot: null},
});
await expectFailure("false-support-contact", makeInput([{points: falseContactPose, context: falseContactContext}]), "support_contact", "important_pose");

const movedFootPose = (kind: "slide" | "lift") => {
  const points = crouch(20);
  const target = kind === "slide"
    ? {x: neutral.leftFoot.x + 3, y: neutral.leftFoot.y}
    : {x: neutral.leftFoot.x, y: neutral.leftFoot.y - 3};
  setChain(points, "leftLeg", target, -1);
  return points;
};
for (const [id, kind] of [["planted-foot-slide", "slide"], ["planted-foot-lift", "lift"], ["contact-repair-only-fault", "lift"]] as const) {
  const fault = movedFootPose(kind);
  const faultContext = contextFor(fault, {
    posture: "lower",
    motionPhase: "moving",
    limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
    plantedAnchors: {leftFoot: {...neutral.leftFoot}, rightFoot: {...neutral.rightFoot}},
  });
  await expectFailure(id, makeInput([
    {points: kneeBranchLeft, context: kneeBranchContext},
    {points: fault, context: faultContext, important: false},
  ]), "support_contact", "final_frame");
}
const relabeledFoot = movedFootPose("slide");
const relabeledContext = contextFor(relabeledFoot, {
  posture: "lower",
  motionPhase: "moving",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  plantedAnchors: {leftFoot: {...relabeledFoot.leftFoot}, rightFoot: {...neutral.rightFoot}},
});
await expectFailure("planted-anchor-relabel-without-release", makeInput([
  {points: kneeBranchLeft, context: kneeBranchContext},
  {points: relabeledFoot, context: relabeledContext, important: false},
]), "support_contact", "final_frame");

const unbalanced = shiftedCrouch(90, 60);
const unbalancedContext = contextFor(unbalanced, {
  posture: "lower",
  support: "left",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  plantedAnchors: {leftFoot: {...neutral.leftFoot}, rightFoot: null},
  rootDisplacementH: Math.hypot(90, 60) / H,
});
await expectFailure("unbalanced-grounded-pose", makeInput([{points: unbalanced, context: unbalancedContext}]), "balance", "important_pose");

const jumpStart = dualSolutions[0];
const jumpContext = dualContext;
const translated100 = clonePoints(neutral);
const jumpEndContext = contextFor(translated100, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  targetEffectors: {leftHand: {...translated100.leftHand}},
});
await expectFailure("unexplained-joint-jump", makeInput([
  {points: jumpStart, context: jumpContext},
  {points: translated100, context: jumpEndContext, important: false},
]), "continuity", "final_frame");

const overshootContext = contextFor(neutral, {
  path: {role: "hip", start: {x: neutral.hip.x - 100, y: neutral.hip.y}, end: {x: neutral.hip.x - 50, y: neutral.hip.y}, corridorH: 0.12},
});
await expectFailure("path-overshoot", makeInput([{points: neutral, context: overshootContext}]), "overshoot", "final_frame");

const translated60 = clonePoints(neutral);
setChain(translated60, "leftArm", {x: 720, y: 505}, -1);
const loopArmContext = contextFor(translated60, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  targetEffectors: {leftHand: {...translated60.leftHand}},
});
await expectFailure("loop-last-first-teleport", makeInput([
  {points: neutral, context: jumpEndContext},
  {points: translated60, context: loopArmContext, important: false},
], {loop: true}), "loop_snap", "final_animation");

await expectFailure("missing-requested-landmark", makeInput([{points: neutral}], {requiredLandmarks: ["requested-contact"]}), "semantic_continuity", "final_animation");
await expectFailure("movement-below-minimum", makeInput([{points: neutral}], {
  movementKind: "movement",
  actingEffectors: ["rightHand"],
}), "semantic_continuity", "final_animation");

const extraArm = articulatedArm(neutral, "leftArm", 170, -70);
await expectFailure("extra-unrequested-gesture", makeInput([
  {points: neutral},
  {points: extraArm, important: false},
]), "unrequested_motion", "final_frame");

// Frozen fixture witnesses were selected before runtime assertions and are recomputed by the
// standalone independent oracle. Runtime tests never select a witness from kernel feedback.
const torsoClearancePoints = clonePoints(neutral);
setChain(torsoClearancePoints, "leftArm", catalog.witnesses.torsoClearance.target, catalog.witnesses.torsoClearance.branch);
const torsoClearanceWitness = {
  points: torsoClearancePoints,
  act: contextFor(torsoClearancePoints, {
    limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
    targetEffectors: {leftHand: catalog.witnesses.torsoClearance.target},
  }),
  guard: contextFor(torsoClearancePoints, {
    limbIntents: {leftArm: "guard", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
    targetEffectors: {leftHand: catalog.witnesses.torsoClearance.target},
  }),
};
await expectFailure("hand-through-torso", makeInput([{points: torsoClearanceWitness.points, context: torsoClearanceWitness.act}]), "clearance", "important_pose");
await expectPass("explicit-center-guard-clearance", makeInput([{points: torsoClearanceWitness.points, context: torsoClearanceWitness.guard}]));

const headPoints = crouch(catalog.witnesses.headCrossing.crouchDy);
setChain(headPoints, "leftArm", catalog.witnesses.headCrossing.target, catalog.witnesses.headCrossing.branch);
const headWitness = {points: headPoints, context: contextFor(headPoints, {
  posture: "lower", motionPhase: "moving",
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  targetEffectors: {leftHand: catalog.witnesses.headCrossing.target},
})};
await expectFailure("hand-through-head", makeInput([{points: headWitness.points, context: headWitness.context}]), "torso_head", "important_pose");

const crossedLegPoints = clonePoints(neutral);
const leftTarget = {x: neutral.hip.x + catalog.witnesses.oppositeLegCrossing.inset, y: neutral.leftFoot.y};
const rightTarget = {x: neutral.hip.x - catalog.witnesses.oppositeLegCrossing.inset, y: neutral.rightFoot.y};
setChain(crossedLegPoints, "leftLeg", leftTarget, catalog.witnesses.oppositeLegCrossing.leftBranch);
setChain(crossedLegPoints, "rightLeg", rightTarget, catalog.witnesses.oppositeLegCrossing.rightBranch);
const crossedLegs = {points: crossedLegPoints, context: contextFor(crossedLegPoints, {
  motionPhase: "moving",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  plantedAnchors: {leftFoot: leftTarget, rightFoot: rightTarget},
})};
await expectFailure("opposite-leg-crossing", makeInput([{points: crossedLegs.points, context: crossedLegs.context}]), "body_crossing", "important_pose");

const rejectedReachPoints = crouch(catalog.witnesses.rejectedReachBranch.crouchDy);
setChain(rejectedReachPoints, "leftArm", catalog.witnesses.rejectedReachBranch.target, catalog.witnesses.rejectedReachBranch.branch);
const rejectedReach = {points: rejectedReachPoints, context: contextFor(rejectedReachPoints, {
  posture: "lower", motionPhase: "moving",
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
  targetEffectors: {leftHand: catalog.witnesses.rejectedReachBranch.target},
})};
await expectFailure("rejected-reach-alternative-branch", makeInput([{points: rejectedReach.points, context: rejectedReach.context}]), "body_crossing", "important_pose");
await expectFailure("unsafe-interior-safe-endpoints", makeInput([
  {points: kneeBranchLeft, context: kneeBranchContext},
  {points: rejectedReach.points, context: rejectedReach.context, important: false},
  {points: kneeBranchLeft, context: kneeBranchContext, important: false},
]), "body_crossing", "final_frame");

// Adjacent segments may share their anatomical endpoint, but may not overlap beyond it.
const overlappingArms = clonePoints(neutral);
overlappingArms.leftElbow = pointAt(overlappingArms.neck, 40, canonicalLengths.get("neck:leftElbow")!);
overlappingArms.rightElbow = pointAt(overlappingArms.neck, 40, canonicalLengths.get("neck:rightElbow")!);
overlappingArms.leftHand = pointAt(overlappingArms.leftElbow, 100, canonicalLengths.get("leftElbow:leftHand")!);
overlappingArms.rightHand = pointAt(overlappingArms.rightElbow, -20, canonicalLengths.get("rightElbow:rightHand")!);
const overlapContext = contextFor(overlappingArms, {
  limbIntents: {leftArm: "act", rightArm: "act", leftLeg: "relax", rightLeg: "relax"},
});
await expectFailure("adjacent-segment-overlap", makeInput([{points: overlappingArms, context: overlapContext}]), "body_crossing", "important_pose");

// Subpixel-separated upper arms are safe before rounding, but both elbows round onto the
// torso ray and overlap it. The mandatory post-rounding pass must catch that new crossing.
const roundingSpec = catalog.witnesses.roundingOnlyCrossing;
const roundingPoints = clonePoints(neutral);
roundingPoints.leftElbow = pointAt(roundingPoints.neck, roundingSpec.baseAngle - roundingSpec.delta, canonicalLengths.get("neck:leftElbow")!);
roundingPoints.rightElbow = pointAt(roundingPoints.neck, roundingSpec.baseAngle + roundingSpec.delta, canonicalLengths.get("neck:rightElbow")!);
roundingPoints.leftHand = pointAt(roundingPoints.leftElbow, roundingSpec.baseAngle - roundingSpec.delta + roundingSpec.leftBend, canonicalLengths.get("leftElbow:leftHand")!);
roundingPoints.rightHand = pointAt(roundingPoints.rightElbow, roundingSpec.baseAngle + roundingSpec.delta + roundingSpec.rightBend, canonicalLengths.get("rightElbow:rightHand")!);
const roundingWitness = {points: roundingPoints, context: contextFor(roundingPoints, {
  limbIntents: {leftArm: "act", rightArm: "act", leftLeg: "relax", rightLeg: "relax"},
})};
const roundedOnlyPoints = roundPoints(roundingWitness.points);
ok(roundingWitness.points.leftElbow.x !== roundingWitness.points.rightElbow.x || roundingWitness.points.leftElbow.y !== roundingWitness.points.rightElbow.y, "unrounded elbows are distinct");
equal(roundedOnlyPoints.leftElbow, roundedOnlyPoints.rightElbow, "distinct elbows collapse to the same rounded point");
await expectFailure("rounding-only-fault", makeInput([{points: roundingWitness.points, context: roundingWitness.context}]), "body_crossing", "final_frame");

// Important-pose semantic context is part of the binding; relabeling the corresponding
// final frame cannot waive an act/recover/relax rule after selection.
await expectFailure("important-final-context-relabel", mutate(dualInput, (draft) => {
  draft.finalFrames[0].context.limbIntents.leftArm = "relax";
}), "integration_bypass", "integration");

const verticalBalance = clonePoints(neutral);
setChain(verticalBalance, "leftArm", {x: neutral.leftHand.x, y: neutral.leftHand.y - 20}, -1);
await expectFailure("zero-error-vertical-balance-gesture", makeInput([{points: verticalBalance, context: contextFor(verticalBalance, {
  limbIntents: {leftArm: "balance", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  balanceErrorX: 0,
  actingDisplacementH: 0.1,
})}]), "balance", "important_pose");

await expectFailure("undeclared-geometry-derived-peak", mutate(crouchInput, (draft) => {
  draft.animationIntent.expectedPeakFrames = [];
  draft.selectionRequest.animationIntent.expectedPeakFrames = [];
}), "semantic_continuity", "final_animation");
await expectFailure("wrong-geometry-derived-peak", mutate(crouchInput, (draft) => {
  draft.animationIntent.expectedPeakFrames = [7];
  draft.selectionRequest.animationIntent.expectedPeakFrames = [7];
}), "semantic_continuity", "final_animation");
const plateauPeakInput = mutate(crouchInput, (draft) => {
  draft.finalFrames[9].points = clonePoints(draft.finalFrames[8].points);
  draft.finalFrames[9].context = cloneCanonical(draft.finalFrames[8].context);
  draft.candidateDocument = makeDocument(draft.finalFrames.map(({points}) => points));
  draft.animationIntent.expectedPeakFrames = [];
  draft.selectionRequest.animationIntent.expectedPeakFrames = [];
});
await expectFailure("undeclared-plateau-peak", plateauPeakInput, "semantic_continuity", "final_animation");

// Independent finite toy graph: keeping one lexicographically best prefix per endpoint is
// wrong when a later max objective equalizes prefixes. A Pareto frontier matches brute force.
type ToyPath = {cost: [number, number, number]; id: string};
const toyPrefixes: ToyPath[] = [
  {cost: [0, 2, 9], id: "lex-prefix"},
  {cost: [0, 5, 1], id: "pareto-prefix"},
];
const extendToy = (path: ToyPath): ToyPath => ({cost: [path.cost[0], Math.max(path.cost[1], 8), path.cost[2] + 1], id: path.id});
const toyCompare = (left: ToyPath, right: ToyPath) => left.cost[0] - right.cost[0] || left.cost[1] - right.cost[1] || left.cost[2] - right.cost[2] || left.id.localeCompare(right.id);
const bruteToy = toyPrefixes.map(extendToy).sort(toyCompare)[0];
const onePrefixToy = extendToy([...toyPrefixes].sort(toyCompare)[0]);
equal(bruteToy.id, "pareto-prefix", "brute force retains the prefix that wins after a max objective equalizes");
equal(onePrefixToy.id, "lex-prefix", "one-prefix pruning demonstrably chooses the wrong toy path");
const source = readFileSync(resolve(ROOT, "src/lib/ai/stickFigureBodySafety.ts"), "utf8");
ok(source.includes("pathDominates") && source.includes("Path[][]"), "runtime selector retains per-candidate Pareto frontiers");
observedPositives.add("deterministic-sequence-bytes");

// Instrument the exact private selector source in memory (no file write/export) and compare
// it with exhaustive enumeration. The three-pose witness forces a later MAX turn to equalize
// prefixes, the precise case where one-prefix pruning loses the true lexicographic winner.
const contractUrl = pathToFileURL(resolve(ROOT, "src/lib/stickfigure/stickProjectContract.ts")).href;
const instrumentedSource = source
  .replace('"../stickfigure/stickProjectContract.ts"', JSON.stringify(contractUrl))
  .replace("const selectImportantSequence = (", "export const __selectImportantSequence = (");
const instrumentedJs = ts.transpileModule(instrumentedSource, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText;
const privateModule = await import(`data:text/javascript;base64,${Buffer.from(instrumentedJs).toString("base64")}`) as {
  __selectImportantSequence: (sets: unknown[][], metrics: unknown) => {selected: Array<{bytes: string}>};
};
const selectorPoints = (bendDegrees: number) => articulatedArm(neutral, "leftArm", 140, bendDegrees);
const selectorCandidate = (bendDegrees: number, rmsCost: number, bytes: string) => ({
  points: selectorPoints(bendDegrees),
  context: dualContext,
  branchSigns: {leftArm: 1, rightArm: 1, leftLeg: 0, rightLeg: 0},
  staticCost: [0, 0, 0, 0, rmsCost],
  bytes,
});
const prefixA = selectorCandidate(20, 9, "prefix-a");
const prefixB = selectorCandidate(70, 1, "prefix-b");
const middle = selectorCandidate(40, 0, "middle");
const last = selectorCandidate(100, 0, "last");
const exactSelection = privateModule.__selectImportantSequence([[prefixA, prefixB], [middle], [last]], {standingBodyHeight: H});
equal(exactSelection.selected.map(({bytes}) => bytes), ["prefix-b", "middle", "last"], "actual selector matches exhaustive later-MAX winner");
const tieSelection = privateModule.__selectImportantSequence([
  [{...prefixA, points: neutral, staticCost: [0, 0, 0, 0, 0], bytes: canonicalJson({candidate: "a"})},
    {...prefixA, points: neutral, staticCost: [0, 0, 0, 0, 0], bytes: canonicalJson({candidate: "b"})}],
], {standingBodyHeight: H});
equal(tieSelection.selected[0].bytes, canonicalJson({candidate: "a"}), "actual selector uses canonical candidate bytes as final tie-break");

const parseSource = (text: string, name: string) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const scanClosedRoute = (bodyText: string, motionText: string, executorText: string) => {
  const forbidden = new Set(["plannerIdentity", "actionLabel", "fixtureId", "promptText", "materializer", "trusted", "skipSafety"]);
  const bodyAst = parseSource(bodyText, "stickFigureBodySafety.ts");
  const motionAst = parseSource(motionText, "stickFigureMotionEngine.ts");
  const executorAst = parseSource(executorText, "stickFigureCommandExecutor.ts");
  const diagnostics = (file: ts.SourceFile) => (file as ts.SourceFile & {parseDiagnostics: readonly ts.Diagnostic[]}).parseDiagnostics;
  if ([...diagnostics(bodyAst), ...diagnostics(motionAst), ...diagnostics(executorAst)].length > 0) return false;
  let forbiddenBodyNode = false;
  let exportedCallable = "";
  let bodyCalls = 0;
  const walkBody = (node: ts.Node) => {
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && forbidden.has(node.text)) forbiddenBodyNode = true;
    if (ts.isVariableStatement(node) && node.modifiers?.some(({kind}) => kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
          exportedCallable += `${declaration.name.text};`;
        }
      }
    }
    ts.forEachChild(node, walkBody);
  };
  const walkMotion = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "finalizeStickBodySafetyCandidateV2") bodyCalls += 1;
    ts.forEachChild(node, walkMotion);
  };
  walkBody(bodyAst);
  walkMotion(motionAst);
  const executorHasClosedKindGuard = executorText.includes("this.#usesBodySafetyCompletion && parsed.value.kind !== \"stick-animation-plan\"");
  const executorAwaitsFinalDoor = executorText.includes("const finalized = await finalizeStickSpec0005MotionCandidate(");
  const rejectsCallerMaterializer = executorText.includes("hasBodySafetyCompletion && hasExplicitMaterializer");
  return !forbiddenBodyNode &&
    exportedCallable === "selectStickBodySafetyImportantPoses;finalizeStickBodySafetyCandidate;qualifyStickBodySafetyCandidateSequencesV2;finalizeStickBodySafetyCandidateV2;" &&
    bodyCalls === 1 && executorHasClosedKindGuard && executorAwaitsFinalDoor && rejectsCallerMaterializer;
};
const motionSource = readFileSync(resolve(ROOT, "src/lib/ai/stickFigureMotionEngine.ts"), "utf8");
const executorSource = readFileSync(resolve(ROOT, "src/lib/ai/stickFigureCommandExecutor.ts"), "utf8");
ok(scanClosedRoute(source, motionSource, executorSource), "AST/control-flow scan proves one closed exported completion route");
equal(scanClosedRoute(`${source}\nconst trusted = true;`, motionSource, executorSource), false, "AST scan rejects a forged trust mutation");
equal(scanClosedRoute(source, motionSource.replace("await finalizeStickBodySafetyCandidateV2(safetyCandidate, starter)", "({ok: true, value: safetyCandidate})"), executorSource), false, "AST scan rejects removal of the kernel call");
equal(scanClosedRoute(source, motionSource, executorSource.replace("parsed.value.kind !== \"stick-animation-plan\"", "false")), false, "control-flow scan rejects removal of wrong-kind fail-closed guard");

const swapRole = (role: StickJointRoleV1): StickJointRoleV1 => role.startsWith("left")
  ? `right${role.slice(4)}` as StickJointRoleV1
  : role.startsWith("right") ? `left${role.slice(5)}` as StickJointRoleV1 : role;
const mirrorContext = (context: StickBodySafetyFrameContextV1, axis: number): StickBodySafetyFrameContextV1 => {
  const mirrorPoint = (point: StickBodySafetyPoint): StickBodySafetyPoint => ({x: 2 * axis - point.x, y: point.y});
  const targets = Object.entries(context.targetEffectors).map(([role, point]) => [swapRole(role as StickJointRoleV1), mirrorPoint(point)]);
  return {
    ...cloneCanonical(context),
    support: context.support === "left" ? "right" : context.support === "right" ? "left" : context.support,
    limbIntents: {
      leftArm: context.limbIntents.rightArm,
      rightArm: context.limbIntents.leftArm,
      leftLeg: context.limbIntents.rightLeg,
      rightLeg: context.limbIntents.leftLeg,
    },
    plantedAnchors: {
      leftFoot: context.plantedAnchors.rightFoot ? mirrorPoint(context.plantedAnchors.rightFoot) : null,
      rightFoot: context.plantedAnchors.leftFoot ? mirrorPoint(context.plantedAnchors.leftFoot) : null,
    },
    targetEffectors: Object.fromEntries(targets),
    path: context.path ? {
      role: swapRole(context.path.role),
      start: mirrorPoint(context.path.start),
      end: mirrorPoint(context.path.end),
      corridorH: context.path.corridorH,
    } : null,
    balanceErrorX: -context.balanceErrorX,
  };
};

// Explicit normal/mirrored upper-corridor and completion-door witnesses. These complement
// the generated mirror matrix with named checks for every PM-audited anatomical family.
const hyperextendedElbow = articulatedArm(neutral, "leftArm", 145, -155);
const hyperextendedElbowContext = contextFor(hyperextendedElbow, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  targetEffectors: {leftHand: {...hyperextendedElbow.leftHand}},
});
await expectFailure("elbow-hyperextension", makeInput([{points: hyperextendedElbow, context: hyperextendedElbowContext}]), "elbow_bend", "important_pose");
const mirroredHyperextendedElbow = mirrorPoints(hyperextendedElbow);
await expectFailure("elbow-hyperextension-mirror", makeInput([{
  points: mirroredHyperextendedElbow,
  context: mirrorContext(hyperextendedElbowContext, hyperextendedElbow.hip.x),
}]), "elbow_bend", "important_pose");

const hyperextendedKnee = crouch(20);
const hyperextendedKneeUpperAngle = angle(hyperextendedKnee.hip, hyperextendedKnee.leftKnee);
hyperextendedKnee.leftKnee = pointAt(hyperextendedKnee.hip, hyperextendedKneeUpperAngle, canonicalLengths.get("hip:leftKnee")!);
hyperextendedKnee.leftFoot = pointAt(hyperextendedKnee.leftKnee, hyperextendedKneeUpperAngle - 130, canonicalLengths.get("leftKnee:leftFoot")!);
const hyperextendedKneeContext = contextFor(hyperextendedKnee, {
  motionPhase: "moving",
  support: "right",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "relax"},
  plantedAnchors: {leftFoot: null, rightFoot: {...neutral.rightFoot}},
});
await expectFailure("knee-hyperextension", makeInput([{points: hyperextendedKnee, context: hyperextendedKneeContext}]), "knee_bend", "important_pose");
const mirroredHyperextendedKnee = mirrorPoints(hyperextendedKnee);
await expectFailure("knee-hyperextension-mirror", makeInput([{
  points: mirroredHyperextendedKnee,
  context: mirrorContext(hyperextendedKneeContext, hyperextendedKnee.hip.x),
}]), "knee_bend", "important_pose");

const mirroredTorsoKink = mirrorPoints(torsoKink);
await expectFailure("torso-kink-mirror", makeInput([{
  points: mirroredTorsoKink,
  context: mirrorContext(contextFor(torsoKink), torsoKink.hip.x),
}]), "torso_head", "important_pose");
await expectFailure("elbow-branch-flip-mirror", makeInput([
  {points: mirrorPoints(dualSolutions[0]), context: mirrorContext(dualContext, dualSolutions[0].hip.x)},
  {points: mirrorPoints(dualSolutions[1]), context: mirrorContext(dualContext, dualSolutions[1].hip.x), important: false},
]), "branch_flip", "final_frame");
await expectFailure("knee-branch-flip-mirror", makeInput([
  {points: mirrorPoints(kneeBranchLeft), context: mirrorContext(kneeBranchContext, kneeBranchLeft.hip.x)},
  {points: mirrorPoints(kneeBranchRight), context: mirrorContext(kneeBranchContext, kneeBranchRight.hip.x), important: false},
]), "branch_flip", "final_frame");
await expectFailure("forbidden-intersection-mirror", makeInput([{
  points: mirrorPoints(rejectedReach.points),
  context: mirrorContext(rejectedReach.context, rejectedReach.points.hip.x),
}]), "body_crossing", "important_pose");
await expectFailure("unsafe-rounded-frame-mirror", makeInput([{
  points: mirrorPoints(roundingWitness.points),
  context: mirrorContext(roundingWitness.context, roundingWitness.points.hip.x),
}]), "body_crossing", "final_frame");

// Fixed-seed runtime property/metamorphic run. Expected classes come from the generator
// family, not engine output; every original and anatomical mirror must agree exactly.
let propertyState = catalog.propertyRun.seed >>> 0;
const propertyRandom = () => {
  propertyState = (Math.imul(propertyState, 1_664_525) + 1_013_904_223) >>> 0;
  return propertyState / 0x1_0000_0000;
};
const propertyFamilies = new Map<string, number>();
let propertyPasses = 0;
let propertyRejections = 0;
for (let index = 0; index < catalog.propertyRun.candidateCount; index += 1) {
  const family = index % 10;
  let points: StickBodySafetyPointMap;
  let context: StickBodySafetyFrameContextV1;
  let expected: StickBodySafetyFailureReason | null;
  let familyName: string;
  if (family === 0) {
    points = translate(neutral, Math.round((propertyRandom() * 2 - 1) * 220));
    context = contextFor(points);
    expected = null;
    familyName = "transported-neutral";
  } else if (family === 1) {
    const dy = 10 + propertyRandom() * 40;
    points = crouch(dy);
    context = contextFor(points, {
      posture: "lower", motionPhase: "moving",
      limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
      rootDisplacementH: dy / H,
    });
    expected = null;
    familyName = "flexed-support";
  } else if (family === 2) {
    points = articulatedArm(neutral, "leftArm", 136 + propertyRandom() * 7, -16 - propertyRandom() * 12);
    context = contextFor(points, {
      limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
      targetEffectors: {leftHand: {...points.leftHand}},
    });
    expected = null;
    familyName = "acting-arm-branch";
  } else if (family === 3) {
    points = clonePoints(neutral);
    points.leftHand.x += 3 + propertyRandom() * 20;
    context = contextFor(points);
    expected = "segment_length";
    familyName = "segment-length";
  } else if (family === 4) {
    points = translate(neutral, 1_000 + Math.round(propertyRandom() * 80));
    context = contextFor(points);
    expected = "stage_bounds";
    familyName = "stage-bounds";
  } else if (family === 5) {
    points = articulatedArm(neutral, "leftArm", 140, -(1 + propertyRandom() * 4));
    context = contextFor(points, {
      limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
    });
    expected = "elbow_bend";
    familyName = "elbow-corridor";
  } else if (family === 6) {
    points = crouch(20 + propertyRandom() * 20);
    context = contextFor(points, {
      posture: "lower", motionPhase: "moving",
      limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
      plantedAnchors: {leftFoot: null, rightFoot: null},
    });
    expected = "support_contact";
    familyName = "false-support";
  } else if (family === 7) {
    points = clonePoints(unbalanced);
    context = cloneCanonical(unbalancedContext);
    expected = "balance";
    familyName = "single-support-balance";
  } else if (family === 8) {
    points = clonePoints(invertedHead);
    context = contextFor(points);
    expected = "torso_head";
    familyName = "head-inversion";
  } else {
    points = articulatedArm(neutral, "leftArm", 168 + propertyRandom() * 8, -65 - propertyRandom() * 12);
    context = contextFor(points);
    expected = "unrequested_motion";
    familyName = "unrequested-arm";
  }
  propertyFamilies.set(familyName, (propertyFamilies.get(familyName) ?? 0) + 1);
  const mirroredPoints = mirrorPoints(points);
  const mirroredContext = mirrorContext(context, points.hip.x);
  for (const [variant, variantPoints, variantContext] of [
    ["original", points, context],
    ["mirror", mirroredPoints, mirroredContext],
  ] as const) {
    const result = await evaluate(makeInput([{points: variantPoints, context: variantContext}]));
    if (expected === null) {
      if (!result.ok) throw new Error(`property ${index} ${familyName} ${variant} unexpectedly failed ${canonicalJson(result.error)}`);
      propertyPasses += 1;
    } else {
      if (result.ok || result.error.reason !== expected || result.error.stage !== "important_pose") {
        throw new Error(`property ${index} ${familyName} ${variant} expected ${expected}/important_pose, got ${canonicalJson(result)}`);
      }
      propertyRejections += 1;
    }
    assertions += 1;
  }
}
equal(propertyFamilies.size, 10, "runtime property run covers ten geometry/semantic families");
equal(propertyPasses, 6_000, "three safe families and mirrors pass");
equal(propertyRejections, 14_000, "seven rejected families and mirrors fail exactly");

// Closed inputs cannot smuggle identity, labels, fixture switches, alternate materializers,
// or trust flags into the action-independent safety kernel.
for (const [id, key] of [
  ["planner-identity-bypass", "plannerIdentity"],
  ["action-label-bypass", "actionLabel"],
  ["fixture-id-bypass", "fixtureId"],
  ["prompt-text-bypass", "promptText"],
  ["alternate-materializer-bypass", "materializer"],
  ["forged-trust-bypass", "trusted"],
] as const) {
  await expectFailure(id, {...cloneCanonical(neutralInput), [key]: "forged"}, "integration_bypass", "integration");
}

const compareRuntimeMirrorPair = async (
  originalPoints: StickBodySafetyPointMap,
  originalContext: StickBodySafetyFrameContextV1,
  reflectedPoints: StickBodySafetyPointMap,
  reflectedContext: StickBodySafetyFrameContextV1,
) => {
  const expected = mirrorPoints(originalPoints);
  if (STICK_JOINT_ROLES.some((role) => Math.hypot(expected[role].x - reflectedPoints[role].x, expected[role].y - reflectedPoints[role].y) > 1e-6 * H)) {
    return {ok: false as const, error: {reason: "integration_bypass" as const, stage: "integration" as const}};
  }
  const original = await evaluate(makeInput([{points: originalPoints, context: originalContext}]));
  const reflected = await evaluate(makeInput([{points: reflectedPoints, context: reflectedContext}]));
  if (original.ok !== reflected.ok || (!original.ok && !reflected.ok && original.error.reason !== reflected.error.reason)) {
    return {ok: false as const, error: {reason: "integration_bypass" as const, stage: "integration" as const}};
  }
  return {ok: true as const};
};
const asymmetricControl = articulatedArm(neutral, "leftArm", 136, -24);
const asymmetricContext = contextFor(asymmetricControl, {
  limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "relax", rightLeg: "relax"},
  targetEffectors: {leftHand: {...asymmetricControl.leftHand}},
});
const validReflectedControl = mirrorPoints(asymmetricControl);
const validReflectedContext = mirrorContext(asymmetricContext, asymmetricControl.hip.x);
equal(await compareRuntimeMirrorPair(asymmetricControl, asymmetricContext, validReflectedControl, validReflectedContext), {ok: true}, "valid reflected-role runtime pair has symmetric disposition");
const invalidReflectedControl = Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {
  x: 2 * asymmetricControl.hip.x - asymmetricControl[role].x,
  y: asymmetricControl[role].y,
}])) as StickBodySafetyPointMap;
const invalidMirrorResult = await compareRuntimeMirrorPair(asymmetricControl, asymmetricContext, invalidReflectedControl, validReflectedContext);
equal(invalidMirrorResult, {ok: false, error: {reason: "integration_bypass", stage: "integration"}}, "real no-role-swap reflection fails mirror consistency");
observedNegatives.set("invalid-mirror-asymmetry", {reason: "integration_bypass", stage: "integration"});

// Exercise the real integration order. The test-local builder consumes only the checked
// selection geometry/context and delegates interpolation/rebuild to the existing motion engine.
const routingBase = crouch(20);
const routingAngles = [140, 147.5, 155, 162.5, 170, 162.5, 155, 147.5, 140];
const routingFrames: FrameSpec[] = routingAngles.map((upperAngle, frameIndex) => {
  const points = articulatedArm(routingBase, "leftArm", upperAngle, -50);
  return {
    points,
    important: frameIndex % 2 === 0,
    context: contextFor(points, {
      posture: "lower",
      motionPhase: "moving",
      limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
      targetEffectors: {leftHand: {...points.leftHand}},
      actingDisplacementH: Math.hypot(points.leftHand.x - routingBase.leftHand.x, points.leftHand.y - routingBase.leftHand.y) / H,
      rootDisplacementH: 20 / H,
      landmarks: frameIndex === 4 ? ["wave-peak"] : [],
    }),
  };
});
const routingPending = makeInput(routingFrames, {
  movementKind: "movement",
  loop: true,
  actingEffectors: ["leftHand"],
  requiredLandmarks: ["wave-peak"],
  expectedPeakFrames: [4],
});
const routingSelection = await selectStickBodySafetyImportantPoses(routingPending.selectionRequest, starter);
if (!routingSelection.ok) throw new Error(`routing selection failed: ${canonicalJson(routingSelection.error)}`);
equal(routingSelection.value.contractVersion, "stick.body-safety-selection-result/v1", "selection returns the checked selection contract");
ok(Object.isFrozen(routingSelection.value), "checked selection is frozen before motion bake");
equal(Object.hasOwn(routingPending.selectionRequest, "finalFrames"), false, "selection request excludes final frames");
equal(Object.hasOwn(routingPending.selectionRequest, "candidateDocument"), false, "selection request excludes candidate document");
observedPositives.add("selection-without-final-payload");

const bakeReturnedSelection = async (
  request: StickBodySafetySelectionRequestV1,
  checked: StickBodySafetyCheckedSelectionV1,
): Promise<StickBodySafetyCompletionInputV1> => {
  const finalFrameCount = checked.selectedImportantPoses.at(-1)!.frameIndex + 1;
  const commands: StickAnimationPlanV1["commands"] = [{type: "set_timing", commandVersion: 1, fps: 12, totalFrameCount: finalFrameCount}];
  for (const selected of checked.selectedImportantPoses) {
    commands.push({
      type: "create_key_pose",
      commandVersion: 1,
      poseName: `selected-${selected.frameIndex}`,
      frameIndex: selected.frameIndex,
      targetLayerId: starter.layers[0].layerId,
      targetRigId: starter.rigs[0].rigId,
      targetFigureId: starter.figures[0].figureId,
      joints: STICK_JOINT_ROLES.map((role) => ({role, ...selected.points[role]})),
    });
  }
  commands.push({type: "finish", commandVersion: 1});
  const testLocalPlan: StickAnimationPlanV1 = {
    ...cloneCanonical(planEnvelope),
    requestId: "00000000-0000-4000-8000-000000000711",
    transactionId: request.binding.transactionId,
    commands,
  };
  const baked = await materializeParsedStickAnimationMotionPlan(testLocalPlan, starter);
  if (!baked.ok) throw new Error(`test-local motion bake failed: ${canonicalJson(baked.error)}`);
  const selectedContexts = new Map(checked.selectedImportantPoses.map((selected) => [selected.frameIndex, selected.context]));
  const finalFrames = baked.value.layers[0].cells.map((cell, frameIndex) => {
    if (cell.cellType !== "keyframe") throw new Error("Motion bake did not emit independent keyframes.");
    const points = Object.fromEntries(starter.rigs[0].joints.map((joint, index) => [joint.role, {
      x: cell.poses[0].points[index].x,
      y: cell.poses[0].points[index].y,
    }])) as StickBodySafetyPointMap;
    const context = selectedContexts.get(frameIndex) ?? contextFor(points, {
      posture: "lower",
      motionPhase: "moving",
      limbIntents: {leftArm: "act", rightArm: "relax", leftLeg: "act", rightLeg: "act"},
      targetEffectors: {leftHand: {...points.leftHand}},
      actingDisplacementH: Math.hypot(points.leftHand.x - routingBase.leftHand.x, points.leftHand.y - routingBase.leftHand.y) / H,
      rootDisplacementH: 20 / H,
    });
    return {frameIndex, points, context: cloneCanonical(context)};
  });
  return {
    contractVersion: STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION,
    selectionRequest: cloneCanonical(request),
    checkedSelection: cloneCanonical(checked),
    finalFrames,
    candidateDocument: cloneCanonical(baked.value),
    animationIntent: cloneCanonical(request.animationIntent),
  };
};
const routingCompletion = await bakeReturnedSelection(routingPending.selectionRequest, routingSelection.value);
const expectedBinding = cloneCanonical(routingPending.selectionRequest.binding);
const bridged = await finalizeStickSpec0005MotionCandidate(routingCompletion, starter, planEnvelope);
equal(bridged.ok, false, "historical V1 remains numerically testable but is revoked at the SPEC-0005 door");

await expectFailure("stable-selection-final-frame-replacement", mutate(routingCompletion, (draft) => {
  draft.finalFrames[4].points.hip.x += 1;
}), "integration_bypass", "integration");
await expectFailure("checked-selected-branch-mutation", mutate(routingCompletion, (draft) => {
  draft.checkedSelection.selectedImportantPoses[2].branchSigns.leftArm = draft.checkedSelection.selectedImportantPoses[2].branchSigns.leftArm === 1 ? -1 : 1;
}), "integration_bypass", "integration");
await expectFailure("checked-selected-pose-mutation", mutate(routingCompletion, (draft) => {
  draft.checkedSelection.selectedImportantPoses[2].points.leftElbow.x += 0.25;
}), "integration_bypass", "integration");
await expectFailure("selection-request-mutation", mutate(routingCompletion, (draft) => {
  draft.selectionRequest.importantPoses[2].context.landmarks.push("request-tamper");
}), "integration_bypass", "integration");
const otherSelection = await selectStickBodySafetyImportantPoses(neutralInput.selectionRequest, starter);
if (!otherSelection.ok) throw new Error(`swap witness selection failed: ${canonicalJson(otherSelection.error)}`);
await expectFailure("swapped-checked-selection", mutate(routingCompletion, (draft) => {
  draft.checkedSelection = cloneCanonical(otherSelection.value);
}), "integration_bypass", "integration");
for (const [id, mutateBinding] of [
  ["binding-project-mismatch", (binding: typeof expectedBinding) => { binding.projectId = "00000000-0000-4000-8000-000000000099"; }],
  ["binding-transaction-mismatch", (binding: typeof expectedBinding) => { binding.transactionId = "00000000-0000-4000-8000-000000000099"; }],
  ["binding-revision-mismatch", (binding: typeof expectedBinding) => { binding.baseDocumentRevision += 1; }],
  ["binding-digest-mismatch", (binding: typeof expectedBinding) => { binding.baseDocumentDigest = `sha256:${"0".repeat(64)}`; }],
] as const) {
  await expectFailure(id, mutate(routingCompletion, (draft) => mutateBinding(draft.selectionRequest.binding)), "integration_bypass", "integration");
}
await expectFailure("request-digest-mismatch", mutate(routingCompletion, (draft) => {
  draft.checkedSelection.requestDigest = `sha256:${"1".repeat(64)}`;
}), "integration_bypass", "integration");
await expectFailure("selection-digest-mismatch", mutate(routingCompletion, (draft) => {
  draft.checkedSelection.selectionDigest = `sha256:${"2".repeat(64)}`;
}), "integration_bypass", "integration");
await expectFailure("completion-intent-mismatch", mutate(routingCompletion, (draft) => {
  draft.animationIntent.loop = false;
}), "integration_bypass", "integration");
const wrongDoorBinding = await finalizeStickSpec0005MotionCandidate(routingCompletion, starter, {
  ...expectedBinding,
  transactionId: "00000000-0000-4000-8000-000000000099",
});
equal(wrongDoorBinding.ok ? null : {reason: wrongDoorBinding.error.reason, stage: wrongDoorBinding.error.stage},
  {reason: "integration_bypass", stage: "integration"}, "async motion final door rejects active-envelope binding mismatch");
observedNegatives.set("final-door-binding-mismatch", {reason: "integration_bypass", stage: "integration"});

await expectFailure("airborne-phase2-rejected", makeInput([{points: crouch(20), context: contextFor(crouch(20), {
  posture: "lower",
  motionPhase: "takeoff",
  support: "airborne",
  limbIntents: {leftArm: "relax", rightArm: "relax", leftLeg: "swing", rightLeg: "swing"},
  plantedAnchors: {leftFoot: null, rightFoot: null},
  rootDisplacementH: 20 / H,
})}]), "support_contact", "important_pose");

// Selection is not a previewable completion, and caller-selected legacy/alternate routes are rejected.
{
  const root = await createStickCommandWorkspaceRoot(starter, "spec0005-selection-alone");
  const selectionOnly = new StickFigureCommandTransactionV1(root, {bodySafetyCompletion: routingSelection.value});
  const outcome = await selectionOnly.preview(planEnvelope);
  equal(outcome.outcomeCode, "failed", "selection alone never reaches Preview");
  equal(selectionOnly.readPreviewCandidate(planEnvelope.transactionId), null, "selection alone exposes no preview candidate");
  assert.throws(() => new StickFigureCommandTransactionV1(root, {
    bodySafetyCompletion: routingCompletion,
    animationPlanMaterializer: "phase-1-holds",
  }), /selects its finalizer internally/);
  assertions += 1;
  assert.throws(() => new StickFigureCommandTransactionV1(root, {
    animationPlanMaterializer: "spec-0005-body-safety-finalizer" as never,
    bodySafetyCandidate: routingCompletion,
  } as never), /Legacy body-safety candidate routing/);
  assertions += 1;
  observedNegatives.set("selection-alone-preview-bypass", {reason: "integration_bypass", stage: "integration"});
  observedNegatives.set("caller-materializer-bypass", {reason: "integration_bypass", stage: "integration"});
  observedNegatives.set("legacy-candidate-route-bypass", {reason: "integration_bypass", stage: "integration"});
}

// The executor rejects the wrong envelope kind before legacy command materialization and leaves no Preview candidate.
{
  const root = await createStickCommandWorkspaceRoot(starter, "spec0005-body-safety-wrong-kind");
  const machine = new StickFigureCommandTransactionV1(root, {bodySafetyCompletion: routingCompletion});
  const before = machine.snapshot();
  const outcome = await machine.preview(legacyEnvelope);
  equal(outcome.outcomeCode, "failed", "wrong envelope kind fails closed");
  equal(machine.readPreviewCandidate(legacyEnvelope.transactionId), null, "wrong envelope kind exposes no preview candidate");
  equal(outcome.root.editorRoot, before.editorRoot, "wrong envelope kind leaves project/history unchanged");
}

// A valid plan envelope reaches the safety candidate, while an unsafe candidate fails before Preview.
{
  const root = await createStickCommandWorkspaceRoot(starter, "spec0005-body-safety-plan");
  const machine = new StickFigureCommandTransactionV1(root, {bodySafetyCompletion: routingCompletion});
  const outcome = await machine.preview(planEnvelope);
  equal(outcome.outcomeCode, "failed", "historical V1 completion cannot reach corrected Preview");
  equal(machine.readPreviewCandidate(planEnvelope.transactionId), null, "historical V1 exposes no candidate");

  const unsafeRoot = await createStickCommandWorkspaceRoot(starter, "spec0005-body-safety-unsafe");
  const unsafe = mutate(routingCompletion, (draft) => { draft.selectionRequest.importantPoses[0].seed.leftHand.x -= 40; });
  const unsafeMachine = new StickFigureCommandTransactionV1(unsafeRoot, {bodySafetyCompletion: unsafe});
  const unsafeBefore = unsafeMachine.snapshot();
  const unsafeOutcome = await unsafeMachine.preview(planEnvelope);
  equal(unsafeOutcome.outcomeCode, "failed", "unsafe safety candidate fails before preview");
  equal(unsafeMachine.readPreviewCandidate(planEnvelope.transactionId), null, "unsafe candidate creates no preview");
  equal(unsafeOutcome.root.editorRoot, unsafeBefore.editorRoot, "unsafe preview failure is a project/history no-op");
}

// V2 expectations are imported from the separately authored, pre-runtime hash-frozen oracle.
const v2Source = source.replace('"../stickfigure/stickProjectContract.ts"', JSON.stringify(contractUrl)) + `
export const __frameV2 = (p, c, starter, stage = "important_pose", rest = false) => {
  const metrics = metricsFromStarter(starter);
  return "reason" in metrics ? metrics : validateFrameV2(p,c,metrics,stage,0,rest);
};`;
const v2Private = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(v2Source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText).toString("base64")}`) as {__frameV2:(p:Pose,c:Context,s:StickProjectDocumentV1,stage?:string,rest?:boolean)=>{reason:string;stage:string}|null};
const brief = (result: {ok:boolean;error?:{reason:string;stage:string}}) => result.ok ? null : {reason:result.error!.reason,stage:result.error!.stage};
const v2Fixed: Array<{id:string;qualification:unknown;final:unknown;owner:number|null}> = [];
const v2Completion = async (request:NaturalRequest,document:StickProjectDocumentV1,override?:OracleFinalFrame[]) => {
  const graph=await qualifyStickBodySafetyCandidateSequencesV2(request,document);
  if(!graph.ok) return {graph,completion:null};
  const indexes=[graph.value.edges[0][0].from];
  for(const edges of graph.value.edges)indexes.push(edges.find(e=>e.from===indexes.at(-1))!.to);
  const frames=override??Array.from({length:request.frameCount},(_,frameIndex)=>{
    const n=request.landmarks.findLastIndex(l=>l.frameIndex<=frameIndex),p=graph.value.candidates[n][indexes[n]];
    return {frameIndex,sourcePoints:cloneCanonical(p),points:roundPose(p),context:oracleContextAt(request,frameIndex)};
  });
  const candidate=cloneCanonical(document);candidate.documentRevision++;candidate.fps=request.fps;
  candidate.layers[0].cells=frames.map((f,i)=>({frameId:document.layers[0].cells[i]?.frameId??`30000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,index:i,cellType:"keyframe",poses:[{
    poseId:`40000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,figureId:document.figures[0].figureId,rigId:document.rigs[0].rigId,
    points:document.rigs[0].joints.map(j=>({jointId:j.jointId,...f.points[j.role]})),
  }]}));
  const completion:StickBodySafetyCompletionInputV2={contractVersion:"stick.body-safety-completion/v2",selectionRequest:cloneCanonical(request),qualifiedGraph:graph.value,selectedIndexes:indexes,finalFrames:frames,candidateDocument:candidate};
  return {graph,completion};
};
for(const test of naturalCatalog.fixedCases){
  const input=await buildOracleCase(test),prepared=await v2Completion(input.request,input.starter);
  const expected=test.expect==="safe"?null:{reason:test.expect,stage:test.stage};
  equal(brief(prepared.graph),expected,`${test.id}: v2 graph agrees with frozen analytical expectation`);
  if(!prepared.completion){
    const malformed={contractVersion:"stick.body-safety-completion/v2",selectionRequest:input.request,qualifiedGraph:{},selectedIndexes:[],finalFrames:[],candidateDocument:input.starter};
    equal(brief(await finalizeStickBodySafetyCandidateV2(malformed,input.starter)),expected,`${test.id}: finalizer retains original qualification cause`);
    v2Fixed.push({id:test.id,qualification:expected,final:expected,owner:null});continue;
  }
  const completion=prepared.completion,expectedFinal=oracleFinal(input.request,input.base,completion.finalFrames);
  const finalized=await finalizeStickBodySafetyCandidateV2(completion,input.starter);
  const isolatedPlaneJump=test.operation==="arm-plane"||test.operation==="leg-plane";
  equal(brief(finalized),isolatedPlaneJump?{reason:"projected_branch_transition",stage:"final_frame"}:expectedFinal,
    `${test.id}: final oracle plus explicit two-moving-step transition requirement`);
  if(finalized.ok)equal(finalized.value.requiredOwnerPhase,oracleOwner(input.request),`${test.id}: later semantics defer to named owner`);
  v2Fixed.push({id:test.id,qualification:null,final:brief(finalized),owner:finalized.ok?finalized.value.requiredOwnerPhase:null});
}
const v2Families:Record<string,number>={};let v2Accepted=0,v2Rejected=0;
for(let i=0;i<naturalCatalog.propertyCount;i++){
  const p=await propertyProbe(i),expected=oracleFrame(p.points,p.base,p.context)?.reason??"safe";
  equal(v2Private.__frameV2(p.points,p.context,posedProject(p.base))?.reason??"safe",expected,`V2 whole-body property ${i} ${p.family}`);
  const m=mirrorOracle(p.base,p.points,p.context);
  equal(v2Private.__frameV2(m.points,m.context,posedProject(m.base))?.reason??"safe",oracleFrame(m.points,m.base,m.context)?.reason??"safe",`V2 mirrored whole-body property ${i}`);
  v2Families[p.family]=(v2Families[p.family]??0)+1;if(expected==="safe")v2Accepted++;else v2Rejected++;
}
for(const clearance of naturalCatalog.guideThresholdsH){const p=kneeGuideProbe(clearance);equal(v2Private.__frameV2(p.points,p.context,posedProject(p.base))?.reason??"safe",oracleFrame(p.points,p.base,p.context)?.reason??"safe",`whole-body ${clearance}H guide boundary`);}
for(const degrees of naturalCatalog.nearExtensionKneeDegrees){const p=kneeGuideProbe(0,degrees);equal(v2Private.__frameV2(p.points,p.context,posedProject(p.base)),null,`near extension ${degrees} degrees`);}
let v2BandChecks=0;
for(const chain of ["leftArm","leftLeg"]as const){
  const base=naturalCatalog.frontBase,ctx=naturalContextFor(base),[root,joint,end]=naturalChainRoles[chain];
  ctx.limbs[chain].movementRole="active";ctx.limbs[chain].jointGuide=chain==="leftArm"?"outward":"forward";ctx.limbs[chain].targetRegion={height:"middle",direction:"outward",reach:"medium"};ctx.requiredOutcomes=["reach_apex"];
  if(chain==="leftLeg"){ctx.supportContacts.leftFoot=null;ctx.supportContacts.rightFoot=null;ctx.supportMode="airborne";ctx.limbs.rightLeg.movementRole="active";ctx.limbs.rightLeg.targetRegion={height:"middle",direction:"outward",reach:"medium"};}
  const names=["extended","comfortable","folded","near_extension_limit","near_flexion_limit"]as const;
  const limits=naturalCatalog.bandEdges[chain==="leftArm"?"arm":"leg"];
  for(let band=0;band<names.length;band++)for(const degrees of [limits[band][0]-.0001,limits[band][0],limits[band][1],limits[band][1]+.0001]){
    const p=cloneCanonical(base),a=(chain==="leftArm"?20:40)*Math.PI/180,b=a+degrees*Math.PI/180;
    const first=Math.hypot(base[root].x-base[joint].x,base[root].y-base[joint].y),second=Math.hypot(base[end].x-base[joint].x,base[end].y-base[joint].y);
    p[joint]={x:p[root].x+first*Math.cos(a),y:p[root].y+first*Math.sin(a)};p[end]={x:p[joint].x+second*Math.cos(b),y:p[joint].y+second*Math.sin(b)};ctx.limbs[chain].flexionBand=names[band];
    const expected=oracleFrame(p,base,ctx);equal(v2Private.__frameV2(p,ctx,posedProject(base))?.reason??"safe",expected?.reason??"safe",`${chain} ${names[band]} ${degrees} exact independent band boundary`);
    if(degrees===limits[band][0]||degrees===limits[band][1])equal(expected,null,`${chain} band edge is a complete safe body`);
    const m=mirrorOracle(base,p,ctx);equal(v2Private.__frameV2(m.points,m.context,posedProject(m.base))?.reason??"safe",expected?.reason??"safe",`${chain} band-edge anatomical mirror`);v2BandChecks+=2;
  }
}
for(const operation of ["arm-plane","leg-plane"]){
  const input=await buildOracleCase(naturalCatalog.fixedCases.find(c=>c.operation===operation)!);
  const chain=operation==="arm-plane"?"leftArm":"leftLeg",[root,joint,end]=naturalChainRoles[chain];
  // An independently constructed 13.7-degree corridor has enough clearance for
  // two rounded moving steps while retaining the unchanged near-extension band.
  input.base[joint].y-=1;input.request.landmarks[0].candidates=[cloneCanonical(input.base)];input.request.landmarks[1].candidates[0][joint].y+=1;
  input.starter=posedProject(input.base);input.request.binding.baseDocumentDigest=await digestCanonical(input.starter);input.request.basePoseBinding.sourceFrameDigest=await digestCanonical(input.starter.layers[0].cells[0]);
  const built=await v2Completion(input.request,input.starter);if(!built.completion)throw new Error("missing plane graph");
  const frames=cloneCanonical(built.completion.finalFrames),lengthA=Math.hypot(input.base[joint].x-input.base[root].x,input.base[joint].y-input.base[root].y),lengthB=Math.hypot(input.base[end].x-input.base[joint].x,input.base[end].y-input.base[joint].y);
  for(const [frame,dy,endDy]of [[9,.1,-.01],[10,.55,-.05]]){
    const p=frames[frame].sourcePoints;
    p[joint].y+=dy;p[joint].x=p[root].x+Math.sqrt(lengthA**2-(p[joint].y-p[root].y)**2);
    p[end].y+=endDy;p[end].x=p[joint].x+Math.sqrt(lengthB**2-(p[end].y-p[joint].y)**2);
    frames[frame].points=roundPose(p);
    equal(oracleFrame(p,input.base,frames[frame].context),null,`${operation}: intermediate source geometry independently safe`);
    equal(oracleFrame(frames[frame].points,input.base,frames[frame].context,"final_frame"),null,`${operation}: intermediate rounded geometry independently safe`);
  }
  const complete=await v2Completion(input.request,input.starter,frames);if(!complete.completion)throw new Error("missing plane completion");
  const result=await finalizeStickBodySafetyCandidateV2(complete.completion,input.starter);ok(result.ok,`${operation}: declared transition has multiple moving frames and passes every final cap: ${canonicalJson(result)}`);
  const oneStep=await finalizeStickBodySafetyCandidateV2(built.completion,input.starter);equal(brief(oneStep),{reason:"projected_branch_transition",stage:"final_frame"},`${operation}: one moving step is rejected`);
  const undeclared=cloneCanonical(input.request);undeclared.landmarks[1].kind="true_key_pose";
  equal(brief(await qualifyStickBodySafetyCandidateSequencesV2(undeclared,input.starter)),{reason:"branch_flip",stage:"important_pose"},`${operation}: undeclared plane change is rejected`);
  const tooShort=cloneCanonical(input.request),last=cloneCanonical(tooShort.landmarks[1]);tooShort.landmarks[1].frameIndex=1;last.landmarkId="finished";last.kind="hold";tooShort.landmarks.push(last);
  tooShort.segments[0].exitIntent="continue";tooShort.segments.push({...cloneCanonical(tooShort.segments[0]),fromLandmarkId:tooShort.landmarks[1].landmarkId,toLandmarkId:last.landmarkId,exitIntent:"settle"});
  equal(brief(await qualifyStickBodySafetyCandidateSequencesV2(tooShort,input.starter)),{reason:"projected_branch_transition",stage:"important_pose"},`${operation}: one-frame declared branch interval is rejected`);
}
{
  const base=naturalCatalog.frontBase,p=cloneCanonical(base),ctx=naturalContextFor(base);
  ctx.limbs.leftArm={movementRole:"active",targetRegion:{height:"middle",direction:"outward",reach:"medium"},limbPlane:"frontal",jointGuide:"outward",flexionBand:"comfortable"};
  const first=Math.hypot(base.neck.x-base.leftElbow.x,base.neck.y-base.leftElbow.y),second=Math.hypot(base.leftHand.x-base.leftElbow.x,base.leftHand.y-base.leftElbow.y);
  p.leftElbow=pointAt(p.neck,20,first);p.leftHand=pointAt(p.leftElbow,77,second);
  equal(oracleFrame(p,base,ctx),null,"57-degree guide-correct arm is a safe whole body");
  equal(v2Private.__frameV2(p,ctx,posedProject(base)),null,"57-degree guide-correct arm survives runtime");
  solveOracleChain(p,base,"leftArm",ctx,true);
  ok(Math.abs(Math.abs(bend(p.neck,p.leftElbow,p.leftHand))-57)<1e-9,"opposite branch retains exactly 57 degrees");
  equal(oracleFrame(p,base,ctx)?.reason,"backward_bend","57-degree numeric bend alone cannot establish anatomy");
  equal(v2Private.__frameV2(p,ctx,posedProject(base))?.reason,"backward_bend","runtime rejects the independently wrong 57-degree branch");
}
{
  const input=await buildOracleCase(naturalCatalog.fixedCases[0]),last=input.request.landmarks[1],p=last.candidates[0];
  for(const role of STICK_JOINT_ROLES.filter(r=>!r.endsWith("Knee")&&!r.endsWith("Foot")))p[role].y+=100;
  last.kind="impact";last.context.posture="compress";last.context.rootGoal="lower";last.context.motionPhase="contact";
  for(const c of ["leftLeg","rightLeg"]as const){last.context.limbs[c].flexionBand="folded";solveOracleChain(p,input.base,c,last.context);}
  input.request.completion.outgoingContext=cloneCanonical(last.context);
  const built=await v2Completion(input.request,input.starter);if(!built.completion)throw new Error("genuine impact graph rejected");
  equal(oracleFinal(input.request,input.base,built.completion.finalFrames),null,"100px compression and >35-degree knee change independently satisfy impact caps");
  const result=await finalizeStickBodySafetyCandidateV2(built.completion,input.starter);ok(result.ok,`genuine impact passes safety classification: ${canonicalJson(result)}`);if(result.ok)equal(result.value.requiredOwnerPhase,4,"genuine impact still waits for mechanics");
  const normal=cloneCanonical(input.request);normal.landmarks[1].kind="true_key_pose";normal.landmarks[1].context.motionPhase="moving";normal.completion.outgoingContext=cloneCanonical(normal.landmarks[1].context);
  const plain=await v2Completion(normal,input.starter);if(!plain.completion)throw new Error("ordinary comparison graph rejected");
  equal(brief(await finalizeStickBodySafetyCandidateV2(plain.completion,input.starter)),{reason:"continuity",stage:"final_frame"},"identical real motion without impact context fails ordinary caps");
}
{
  const probe=kneeGuideProbe(0,13),ctx=cloneCanonical(probe.context);ctx.facing="left";ctx.supportMode="airborne";
  for(const contact of ["leftFoot","rightFoot","leftHand","rightHand","hip"]as const)ctx.supportContacts[contact]=null;
  for(const c of naturalChains)ctx.limbs[c].limbPlane="sagittal_near";
  const seed=cloneCanonical(probe.points);for(const c of ["leftLeg","rightLeg"]as const)solveOracleChain(seed,probe.base,c,ctx);
  const base=roundPose(seed),document=posedProject(base),request=(await buildOracleCase(naturalCatalog.fixedCases[0])).request;
  request.binding.baseDocumentDigest=await digestCanonical(document);request.basePoseBinding={sourceFrameId:document.layers[0].cells[0].frameId,sourceFrameDigest:await digestCanonical(document.layers[0].cells[0]),context:cloneCanonical(ctx)};
  request.landmarks=(["left","front","right"]as const).map((facing,i)=>{
    const context=cloneCanonical(ctx);context.facing=facing;for(const c of naturalChains)context.limbs[c].limbPlane=facing==="front"?"frontal":"sagittal_near";
    const points=cloneCanonical(base);for(const c of ["leftLeg","rightLeg"]as const)solveOracleChain(points,base,c,context);
    return {landmarkId:`facing-${facing}`,frameIndex:[0,5,11][i],kind:i?"plane_transition"as const:"hold"as const,context,candidates:[points]};
  });
  request.segments=request.landmarks.slice(1).map((l,i)=>({fromLandmarkId:request.landmarks[i].landmarkId,toLandmarkId:l.landmarkId,activePartIds:["hold"],facingTransition:i?"turn_right":"through_front",supportTransition:"airborne",pathIntent:"natural_arc",exitIntent:i?"settle":"continue"}));
  request.completion.outgoingContext=cloneCanonical(request.landmarks.at(-1)!.context);
  equal(oracleRequest(request,base),null,"through-front pose, context, and transitions independently qualify");
  const graph=await qualifyStickBodySafetyCandidateSequencesV2(request,document);ok(graph.ok,`explicit through-front turn remains classifiable: ${canonicalJson(graph)}`);
  const forged=cloneCanonical(request);forged.segments[0].facingTransition="hold";equal(brief(await qualifyStickBodySafetyCandidateSequencesV2(forged,document)),{reason:"context_transition",stage:"integration"},"forged through-front transition is rejected");
  const supported=cloneCanonical(request);supported.requestedParts[0].requiredOutcomeIds=["reach_apex"];
  for(const landmark of supported.landmarks){landmark.context.supportMode="grounded";for(const c of ["leftLeg","rightLeg"]as const){landmark.context.limbs[c].movementRole="support";landmark.context.limbs[c].targetRegion="none";const end=naturalChainRoles[c][2];landmark.context.supportContacts[end as "leftFoot"|"rightFoot"]={...base[end]};}}
  supported.basePoseBinding.context=cloneCanonical(supported.landmarks[0].context);supported.completion.outgoingContext=cloneCanonical(supported.landmarks.at(-1)!.context);for(const s of supported.segments)s.supportTransition="hold";
  equal(brief(await qualifyStickBodySafetyCandidateSequencesV2(supported,document)),{reason:"projected_branch_transition",stage:"important_pose"},"declared turn cannot flip an independently required supported near-limit knee");
}

const holdPlan:StickAnimationPlanV1={...cloneCanonical(planEnvelope),commands:[
  {type:"set_timing",commandVersion:1,fps:12,totalFrameCount:12},
  {type:"create_key_pose",commandVersion:1,poseName:"stationary",frameIndex:0,targetLayerId:starter.layers[0].layerId,targetRigId:starter.rigs[0].rigId,targetFigureId:starter.figures[0].figureId,joints:STICK_JOINT_ROLES.map(role=>({role,...neutral[role]}))},
  {type:"hold_pose",commandVersion:1,poseName:"stationary",startFrameIndex:1,endFrameIndex:11},
  {type:"finish",commandVersion:1},
]};
const holdParsed=await parseStickAnimationPlan(holdPlan,starter);ok(holdParsed.ok,"stationary hold is a real parsed animation request");
if(!holdParsed.ok)throw new Error(holdParsed.error.message);
const holdRequest=(await buildOracleCase(naturalCatalog.fixedCases[0])).request;
holdRequest.binding={projectId:starter.projectId,transactionId:holdPlan.transactionId,baseDocumentRevision:starter.documentRevision,baseDocumentDigest:starterDigest};
holdRequest.animationRequestDigest=await digestCanonical(holdParsed.value);
const holdContext=naturalContextFor(neutral);
for(const c of naturalChains){holdContext.limbs[c].movementRole="passive_relax";holdContext.limbs[c].jointGuide="neutral";holdContext.limbs[c].flexionBand="extended";}
holdRequest.basePoseBinding={sourceFrameId:starterCell.frameId,sourceFrameDigest:await digestCanonical(starterCell),context:cloneCanonical(holdContext)};
for(const l of holdRequest.landmarks){l.candidates=[cloneCanonical(neutral)];l.context=cloneCanonical(holdContext);}
holdRequest.completion.outgoingContext=cloneCanonical(holdContext);
const holdPrepared=await v2Completion(holdRequest,starter);
if(!holdPrepared.completion)throw new Error(canonicalJson(holdPrepared.graph));
const holdCompletion=holdPrepared.completion;
for(const [id,change]of [
  ["non-neutral-rest",(c:Context)=>{c.posture="compress";}],
  ["single-contact-rest",(c:Context)=>{c.supportContacts.rightFoot=null;}],
  ["contradictory-rest-band",(c:Context)=>{c.limbs.leftLeg.flexionBand="comfortable";}],
]as const){
  const request=cloneCanonical(holdRequest);for(const l of request.landmarks)change(l.context);request.basePoseBinding.context=cloneCanonical(request.landmarks[0].context);request.completion.outgoingContext=cloneCanonical(request.landmarks[1].context);
  equal(brief(await qualifyStickBodySafetyCandidateSequencesV2(request,starter)),{reason:"branch_singularity",stage:"important_pose"},`${id}: cannot broaden the qualified straight-neutral exception`);
}
const holdDoor=await finalizeStickSpec0005MotionCandidate(holdCompletion,starter,holdParsed.value);
ok(holdDoor.ok,`stationary hold passes corrected completion door: ${canonicalJson(holdDoor)}`);
const makeMachine=async(completion:unknown=holdCompletion,options:Record<string,unknown>={})=>new StickFigureCommandTransactionV1(await createStickCommandWorkspaceRoot(starter,"v2-real-request"),{bodySafetyCompletion:completion,...options});
const noPreview=async(id:string,completion:unknown,plan=holdPlan,options:Record<string,unknown>={})=>{
  const machine=await makeMachine(completion,options),before=machine.snapshot(),outcome=await machine.preview(plan);
  equal([outcome.outcomeCode,machine.readPreviewCandidate(plan.transactionId),outcome.root.editorRoot],["failed",null,before.editorRoot],`${id}: no Preview and exact project/history no-op`);
};
const transactionCases=new Set<string>();
const attack=async(id:string,change:(c:StickBodySafetyCompletionInputV2,p:StickAnimationPlanV1)=>void)=>{const c=cloneCanonical(holdCompletion),p=cloneCanonical(holdPlan);change(c,p);await noPreview(id,c,p);transactionCases.add(id);};
await attack("request-id",(_,p)=>{p.requestId="00000000-0000-4000-8000-000000000098";});
await attack("request-command",(_,p)=>{const key=p.commands[1];if(key.type==="create_key_pose")key.joints[0].x++;});
await attack("request-fps",(_,p)=>{const t=p.commands[0];if(t.type==="set_timing")t.fps=24;});
await attack("request-count",(_,p)=>{const t=p.commands[0],h=p.commands[2];if(t.type==="set_timing")t.totalFrameCount=13;if(h.type==="hold_pose")h.endFrameIndex=12;});
await attack("request-result-substitution",c=>{c.selectionRequest.animationRequestDigest=`sha256:${"9".repeat(64)}`;});
const docAttacks:Record<string,(d:StickProjectDocumentV1)=>void>={title:d=>{d.title+=" forged";},fps:d=>{d.fps=24;},"layer-name":d=>{d.layers[0].name+=" forged";},"layer-id":d=>{d.layers[0].layerId="00000000-0000-4000-8000-000000000097";},"rig-id":d=>{d.rigs[0].rigId="00000000-0000-4000-8000-000000000097";},"figure-label":d=>{d.figures[0].label+=" forged";},"figure-id":d=>{d.figures[0].figureId="00000000-0000-4000-8000-000000000097";},"coordinate-space":d=>{d.coordinateSpace.width=1800 as never;}};
for(const [id,change]of Object.entries(docAttacks))await attack(id,c=>change(c.candidateDocument));
await attack("graph",c=>{c.qualifiedGraph.candidates[0][0].leftHand.x++;});
await attack("selection",c=>{c.selectedIndexes[0]=999;});
await attack("final-context",c=>{c.finalFrames[5].context.facing="left";});
await attack("final-rounding",c=>{c.finalFrames[5].points.leftKnee.x++;});
await attack("post-repair",c=>{const f=c.candidateDocument.layers[0].cells[5];if(f.cellType==="keyframe")f.poses[0].points[0].x++;});
for(const key of ["plannerIdentity","actionLabel","fixtureId","trusted","skipSafety","injury","deformation","activeChains"]){
  await attack(`unrecognized-${key}`,c=>{(c.selectionRequest as unknown as Record<string,unknown>)[key]=true;});
}
await noPreview("v1",routingCompletion);transactionCases.add("v1");
await noPreview("selection-only",holdPrepared.graph.ok?holdPrepared.graph.value:null);transactionCases.add("selection-only");
for(const [id,options]of Object.entries({materializer:{animationPlanMaterializer:"phase-1-holds"},trusted:{trusted:true},skip:{skipSafety:true},injury:{injuryMode:true},deformation:{allowDeformation:true}})){
  await assert.rejects(makeMachine(holdCompletion,options),TypeError);assertions++;transactionCases.add(id);
}
await noPreview("hasher-mutation",holdCompletion,holdPlan,{candidateHasher:async(d:StickProjectDocumentV1)=>{d.title="forged";return digestCanonical(d);}});transactionCases.add("hasher-mutation");
await noPreview("hasher-substitution",holdCompletion,holdPlan,{candidateHasher:async()=>`sha256:${"8".repeat(64)}`});transactionCases.add("hasher-substitution");
{
  const machine=await makeMachine(),before=machine.snapshot();equal((await machine.preview(holdPlan)).outcomeCode,"preview_ready","V2 successful Preview");
  equal(machine.snapshot().editorRoot,before.editorRoot,"Preview does not mutate project/history");
  const read=machine.readPreviewCandidate()!;read.title="external mutation";
  equal(machine.readPreviewCandidate(),holdCompletion.candidateDocument,"Preview read access is detached");
  equal((await machine.apply(holdPlan)).outcomeCode,"applied","V2 successful Apply");
  equal(machine.snapshot().editorRoot.current.snapshot.document,holdCompletion.candidateDocument,"Apply publishes exact checked bytes");
  equal(machine.snapshot().editorRoot.undo.length,before.editorRoot.undo.length+1,"Apply adds one undo entry");
  const applied=machine.snapshot();equal((await machine.apply(holdPlan)).outcomeCode,"duplicate","duplicate Apply is one-shot");equal(machine.snapshot(),applied,"duplicate does not mutate any state");transactionCases.add("duplicate");
  const conflict=cloneCanonical(holdPlan);conflict.requestId="00000000-0000-4000-8000-000000000096";equal((await machine.preview(conflict)).outcomeCode,"rejected","conflicting redelivery rejected");equal(machine.snapshot(),applied,"conflict leaves applied root exact");transactionCases.add("conflicting-redelivery");
  observedPositives.add("selection-motion-completion-preview");
}
for(const action of ["cancel","abort","stale","project-switch"]as const){
  const machine=await makeMachine();await machine.preview(holdPlan);const before=machine.snapshot();
  if(action==="cancel")await machine.cancelPreview(holdPlan);
  if(action==="abort")await machine.abortRequest(holdPlan);
  if(action==="stale")machine.setDocumentPublication("pending");
  if(action==="project-switch")await machine.replaceProject(starter,"replaced-workspace");
  const protectedRoot=machine.snapshot().editorRoot;const result=await machine.apply(holdPlan);
  ok(!["applied","preview_ready","preview_reused"].includes(result.outcomeCode),`${action} cannot Apply`);
  equal(machine.snapshot().editorRoot,protectedRoot,`${action} is project/history no-op`);
  if(action==="cancel"||action==="abort")equal(protectedRoot,before.editorRoot,`${action} preserves original root`);
  transactionCases.add(action);
}
{
  const machine=await makeMachine();await machine.preview(holdPlan);await machine.beginApplyPublication(holdPlan);
  const active=machine.snapshot().transactionState.active;if(active?.phase!=="committing")throw new Error("missing prepared Apply");
  const before=machine.snapshot().editorRoot,forged=cloneCanonical(holdPlan);forged.requestId="00000000-0000-4000-8000-000000000095";
  equal((await machine.completeApplyPublication(active.operationId,forged)).outcomeCode,"rejected","Apply publication rejects substituted envelope");equal(machine.snapshot().editorRoot,before,"substituted publication no-op");
}
for(const test of naturalCatalog.transactionMutations)ok(transactionCases.has(test),`${test}: catalogued transaction attack executed`);
for(const stop of ["abort","replace","rejecting-hasher"]as const){
  let release!:()=>void,entered!:()=>void;
  const waitForHash=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const machine=await makeMachine(holdCompletion,{candidateHasher:async(d:StickProjectDocumentV1)=>{entered();await gate;if(stop==="rejecting-hasher")throw new Error("late hash failure");return digestCanonical(d);}});
  const preview=machine.preview(holdPlan);await waitForHash;
  if(stop==="replace")await machine.replaceProject(starter,"async-replacement");else await machine.abortRequest(holdPlan);
  const protectedState=machine.snapshot();release();const result=await preview;
  ok(result.outcomeCode!=="preview_ready",`${stop}: late hash cannot revive Preview`);
  equal(machine.snapshot(),protectedState,`${stop}: async completion preserves exact root, view and transaction state`);
  equal(machine.readPreviewCandidate(),null,`${stop}: no leaked frozen candidate`);
}
for(const operation of ["zero-chord","parallel-guide","tangent"]){
  const request=cloneCanonical(holdRequest),last=request.landmarks[1],p=last.candidates[0],c=last.context;
  const length=Math.hypot(neutral.hip.x-neutral.leftKnee.x,neutral.hip.y-neutral.leftKnee.y);
  c.limbs.leftLeg={movementRole:"active",targetRegion:{height:"middle",direction:"outward",reach:"medium"},limbPlane:"frontal",jointGuide:"forward",flexionBand:"comfortable"};
  c.supportContacts.leftFoot=null;c.motionPhase="moving";last.kind="true_key_pose";
  if(operation==="zero-chord"){p.leftFoot={...p.hip};p.leftKnee={x:p.hip.x+length,y:p.hip.y};}
  if(operation==="parallel-guide"){p.leftFoot={x:p.hip.x+length,y:p.hip.y};p.leftKnee={x:p.hip.x+length/2,y:p.hip.y+Math.sqrt(3)*length/2};}
  if(operation==="tangent"){p.leftFoot={x:p.hip.x,y:p.hip.y+2*length};p.leftKnee={x:p.hip.x,y:p.hip.y+length};}
  request.segments[0].supportTransition="release";request.completion.outgoingContext=cloneCanonical(c);
  const completion={...cloneCanonical(holdCompletion),selectionRequest:request};
  const expected={reason:operation==="parallel-guide"?"facing_projection":"branch_singularity",stage:"important_pose"};
  equal(brief(await qualifyStickBodySafetyCandidateSequencesV2(request,starter)),expected,`${operation}: valid ordinary starter retains exact earliest cause`);
  equal(brief(await finalizeStickBodySafetyCandidateV2(completion,starter)),expected,`${operation}: recomputation retains exact cause`);
  equal(brief(await finalizeStickSpec0005MotionCandidate(completion,starter,holdPlan)),expected,`${operation}: sole door retains exact cause`);
  await noPreview(operation,completion);
}

// Owner deferral is exercised with parseable ordinary requests, not just invalid
// non-neutral starters. It cannot become an alternate successful Preview route.
for(const [owner,change]of [
  [3,(r:NaturalRequest)=>{r.requestedParts[0].semanticKind="effector_reach";}],
  [4,(r:NaturalRequest)=>{r.requestedParts[0].semanticKind="impact";}],
  [5,(r:NaturalRequest)=>{r.motionStyle="mechanical_stepped";}],
  [6,(r:NaturalRequest)=>{r.requestedParts[0].semanticKind="locomotion";}],
  [7,(r:NaturalRequest)=>{r.requestedParts[0].semanticKind="effector_oscillation";}],
]as const){
  const request=cloneCanonical(holdRequest);change(request);const built=await v2Completion(request,starter);if(!built.completion)throw new Error(canonicalJson(built.graph));
  const result=await finalizeStickSpec0005MotionCandidate(built.completion,starter,holdPlan);
  equal(brief(result),{reason:"unsupported_owner_phase",stage:"integration"},`safe owner ${owner} stops at sole door`);
  if(!result.ok)ok(result.error.message.includes(`Phase ${owner}`),`deferred owner ${owner} named`);
  await noPreview(`owner ${owner}`,built.completion);
}
{
  const release=await buildOracleCase(naturalCatalog.fixedCases.find(c=>c.operation==="release")!);
  const step=await buildOracleCase(naturalCatalog.fixedCases.find(c=>c.operation==="step")!);
  equal(release.request,step.request,"frozen release and step fixtures contain identical step semantics");
  release.request.landmarks[1].context.motionPhase="moving";release.request.completion.outgoingContext=cloneCanonical(release.request.landmarks[1].context);
  equal(oracleOwner(release.request),4,"pure release has mechanics ownership independently");
  const built=await v2Completion(release.request,release.starter);if(!built.completion)throw new Error("pure release did not qualify");
  const result=await finalizeStickBodySafetyCandidateV2(built.completion,release.starter);ok(result.ok,"pure release is safely classified");if(result.ok)equal(result.value.requiredOwnerPhase,4,"pure release waits for Phase 4");
}

for (const test of catalog.negativeCases) {
  equal(observedNegatives.get(test.id), {reason: test.reason, stage: test.stage}, `${test.id} is executed with its cataloged reason/stage`);
}
for (const test of catalog.positiveCases) {
  ok(observedPositives.has(test.id), `${test.id} has an executed positive assertion`);
}

console.log(JSON.stringify({
  validatorVersion: 1,
  phase: "SPEC-0005 Phase 2 body-safety integration",
  assertionCount: assertions,
  observedNamedNegatives: observedNegatives.size,
  catalogNamedNegatives: catalog.negativeCases.length,
  propertySeed: catalog.propertyRun.seed,
  propertyCandidates: catalog.propertyRun.candidateCount,
  mirroredCandidates: catalog.propertyRun.mirrorCount,
  propertyFamilies: Object.fromEntries(propertyFamilies),
  propertyPasses,
  propertyRejections,
  v2: {fixed:v2Fixed,propertyCandidates:naturalCatalog.propertyCount,mirroredCandidates:naturalCatalog.mirrorCount,seed:naturalCatalog.seed,propertyFamilies:v2Families,accepted:v2Accepted,rejected:v2Rejected,bandChecks:v2BandChecks,transactionCases:[...transactionCases].sort(),stationaryHoldPreviewApply:true},
  externalRequests: 0,
  providerRequests: 0,
  stage: catalog.stage,
  result: "passed",
}, null, 2));
