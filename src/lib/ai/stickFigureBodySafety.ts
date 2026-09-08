import {
  STICK_HUMANOID_TEMPLATE_ID,
  STICK_JOINT_ROLES,
  STICK_SEGMENT_ROLE_PAIRS,
  canonicalJson,
  cloneCanonical,
  deepFreeze,
  digestCanonical,
  deriveStickLineHead,
  isSha256Digest,
  parseStickProjectDocument,
  type StickJointRoleV1,
  type StickProjectDocumentV1,
} from "../stickfigure/stickProjectContract.ts";

export const STICK_BODY_SAFETY_SELECTION_CONTRACT_VERSION = "stick.body-safety-selection/v1" as const;
export const STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION = "stick.body-safety-completion/v1" as const;
export const STICK_BODY_SAFETY_SELECTION_RESULT_VERSION = "stick.body-safety-selection-result/v1" as const;
export const STICK_BODY_SAFETY_STAGE_ID = "stick-stage-1920x1080-v1" as const;
export const STICK_BODY_SAFETY_FAILURE_REASONS = [
  "non_finite_geometry",
  "segment_length",
  "stage_bounds",
  "elbow_bend",
  "knee_bend",
  "branch_singularity",
  "branch_flip",
  "torso_head",
  "body_crossing",
  "clearance",
  "support_contact",
  "continuity",
  "overshoot",
  "loop_snap",
  "unrequested_motion",
  "recovery",
  "balance",
  "semantic_continuity",
  "no_safe_sequence",
  "integration_bypass",
] as const;

export type StickBodySafetyFailureReason = typeof STICK_BODY_SAFETY_FAILURE_REASONS[number] |
  "facing_projection" | "limb_plane" | "backward_bend" | "joint_guide_clearance" | "flexion_band" |
  "projected_branch_transition" | "context_transition" | "base_pose_mismatch" | "composition_unrequested" |
  "forbidden_extra_movement" | "naturalness_unproven" | "unsupported_owner_phase";
export type StickBodySafetyStage = "important_pose" | "final_frame" | "final_animation" | "integration";
export type StickBodySafetyChain = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export type StickBodySafetyLimbIntent = "unspecified" | "relax" | "recover" | "balance" | "act" | "guard" | "support" | "step" | "swing";
export type StickBodySafetyMotionPhase = "rest" | "moving" | "support_transition" | "takeoff" | "landing" | "contact" | "recovery" | "settle";
export type StickBodySafetyPosture = "neutral" | "lower" | "compress" | "hinge";
export type StickBodySafetySupport = "both" | "left" | "right" | "airborne";
export type StickBodySafetyPoint = {x: number; y: number};
export type StickBodySafetyPointMap = Record<StickJointRoleV1, StickBodySafetyPoint>;

export type StickBodySafetyFrameContextV1 = {
  posture: StickBodySafetyPosture;
  motionPhase: StickBodySafetyMotionPhase;
  impact: boolean;
  support: StickBodySafetySupport;
  limbIntents: Record<StickBodySafetyChain, StickBodySafetyLimbIntent>;
  plantedAnchors: {leftFoot: StickBodySafetyPoint | null; rightFoot: StickBodySafetyPoint | null};
  targetEffectors: Partial<Record<StickJointRoleV1, StickBodySafetyPoint>>;
  path: {role: StickJointRoleV1; start: StickBodySafetyPoint; end: StickBodySafetyPoint; corridorH: number} | null;
  balanceErrorX: number;
  actingDisplacementH: number;
  rootDisplacementH: number;
  landmarks: string[];
};

export type StickBodySafetyImportantPoseV1 = {
  frameIndex: number;
  seed: StickBodySafetyPointMap;
  activeChains: StickBodySafetyChain[];
  context: StickBodySafetyFrameContextV1;
};

export type StickBodySafetyFinalFrameV1 = {
  frameIndex: number;
  points: StickBodySafetyPointMap;
  context: StickBodySafetyFrameContextV1;
};

export type StickBodySafetyAnimationIntentV1 = {
  movementKind: "hold" | "movement";
  loop: boolean;
  actingEffectors: StickJointRoleV1[];
  requiredLandmarks: string[];
  expectedPeakFrames: number[];
};

export type StickBodySafetyBindingV1 = {
  projectId: string;
  transactionId: string;
  baseDocumentRevision: number;
  baseDocumentDigest: string;
};

export type StickBodySafetyNeutralMetricsV1 = {
  topology: typeof STICK_HUMANOID_TEMPLATE_ID;
  stage: typeof STICK_BODY_SAFETY_STAGE_ID;
  standingBodyHeight: number;
  groundY: number;
  neutralPoints: StickBodySafetyPointMap;
  segmentLengths: Array<{from: StickJointRoleV1; to: StickJointRoleV1; length: number}>;
};

export type StickBodySafetySelectionRequestV1 = {
  contractVersion: typeof STICK_BODY_SAFETY_SELECTION_CONTRACT_VERSION;
  binding: StickBodySafetyBindingV1;
  neutralMetrics: StickBodySafetyNeutralMetricsV1;
  importantPoses: StickBodySafetyImportantPoseV1[];
  animationIntent: StickBodySafetyAnimationIntentV1;
};

export type StickBodySafetyCheckedSelectionV1 = {
  contractVersion: typeof STICK_BODY_SAFETY_SELECTION_RESULT_VERSION;
  binding: StickBodySafetyBindingV1;
  requestDigest: string;
  selectionDigest: string;
  selectedImportantPoses: Array<{
    frameIndex: number;
    points: StickBodySafetyPointMap;
    context: StickBodySafetyFrameContextV1;
    branchSigns: Record<StickBodySafetyChain, -1 | 0 | 1>;
  }>;
  qualification: {
    topology: typeof STICK_HUMANOID_TEMPLATE_ID;
    stage: typeof STICK_BODY_SAFETY_STAGE_ID;
    importantPoseCount: number;
    ikSolutionsEnumerated: number;
    wholeBodyCandidatesConsidered: number;
    standingBodyHeight: number;
    groundY: number;
  };
};

export type StickBodySafetySelectionResult =
  | {ok: true; value: Readonly<StickBodySafetyCheckedSelectionV1>}
  | {ok: false; error: StickBodySafetyFailure};

export type StickBodySafetyCompletionInputV1 = {
  contractVersion: typeof STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION;
  selectionRequest: StickBodySafetySelectionRequestV1;
  checkedSelection: StickBodySafetyCheckedSelectionV1;
  finalFrames: StickBodySafetyFinalFrameV1[];
  candidateDocument: StickProjectDocumentV1;
  animationIntent: StickBodySafetyAnimationIntentV1;
};

export type StickBodySafetyFailure = {
  reason: StickBodySafetyFailureReason;
  stage: StickBodySafetyStage;
  message: string;
  frameIndex: number | null;
  transitionIndex: number | null;
  roles: StickJointRoleV1[];
};

export type StickBodySafetyQualifiedOutputV1 = {
  contractVersion: typeof STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION;
  binding: StickBodySafetyBindingV1;
  requestDigest: string;
  selectionDigest: string;
  document: StickProjectDocumentV1;
  selectedImportantPoses: Array<{
    frameIndex: number;
    points: StickBodySafetyPointMap;
    branchSigns: Record<StickBodySafetyChain, -1 | 0 | 1>;
  }>;
  qualification: {
    topology: typeof STICK_HUMANOID_TEMPLATE_ID;
    stage: typeof STICK_BODY_SAFETY_STAGE_ID;
    importantPoseCount: number;
    finalFrameCount: number;
    ikSolutionsEnumerated: number;
    wholeBodyCandidatesConsidered: number;
    standingBodyHeight: number;
    groundY: number;
  };
};

export type StickBodySafetyResult =
  | {ok: true; value: Readonly<StickBodySafetyQualifiedOutputV1>}
  | {ok: false; error: StickBodySafetyFailure};

type Metrics = {
  neutral: StickBodySafetyPointMap;
  lengths: Map<string, number>;
  standingBodyHeight: number;
  groundY: number;
  width: number;
  height: number;
};

type Candidate = {
  points: StickBodySafetyPointMap;
  context: StickBodySafetyFrameContextV1;
  branchSigns: Record<StickBodySafetyChain, -1 | 0 | 1>;
  staticCost: number[];
  bytes: string;
  requiresStationaryQualification: boolean;
};

const CHAINS = ["leftArm", "rightArm", "leftLeg", "rightLeg"] as const;
const LIMB_INTENTS = ["unspecified", "relax", "recover", "balance", "act", "guard", "support", "step", "swing"] as const;
const MOTION_PHASES = ["rest", "moving", "support_transition", "takeoff", "landing", "contact", "recovery", "settle"] as const;
const POSTURES = ["neutral", "lower", "compress", "hinge"] as const;
const SUPPORTS = ["both", "left", "right", "airborne"] as const;
const CHAIN_ROLES: Record<StickBodySafetyChain, {root: StickJointRoleV1; joint: StickJointRoleV1; effector: StickJointRoleV1}> = {
  leftArm: {root: "neck", joint: "leftElbow", effector: "leftHand"},
  rightArm: {root: "neck", joint: "rightElbow", effector: "rightHand"},
  leftLeg: {root: "hip", joint: "leftKnee", effector: "leftFoot"},
  rightLeg: {root: "hip", joint: "rightKnee", effector: "rightFoot"},
};
const ROLE_ORDER = new Map(STICK_JOINT_ROLES.map((role, index) => [role, index]));

const failure = (
  reason: StickBodySafetyFailureReason,
  stage: StickBodySafetyStage,
  message: string,
  frameIndex: number | null = null,
  transitionIndex: number | null = null,
  roles: StickJointRoleV1[] = [],
): {ok: false; error: StickBodySafetyFailure} => ({
  ok: false,
  error: {reason, stage, message, frameIndex, transitionIndex, roles: [...roles].sort((a, b) => ROLE_ORDER.get(a)! - ROLE_ORDER.get(b)!)},
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (!isPlainRecord(value)) return false;
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== "string")) return false;
  const expected = [...keys].sort();
  const actual = (own as string[]).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) return false;
  return actual.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor && descriptor.enumerable);
  });
};
const finitePoint = (value: unknown): value is StickBodySafetyPoint =>
  exactKeys(value, ["x", "y"]) && Number.isFinite(value.x) && Number.isFinite(value.y);
const denseArray = (value: unknown): value is unknown[] => Array.isArray(value) && Object.keys(value).length === value.length;
const enumValue = <T extends string>(value: unknown, allowed: readonly T[]): value is T => typeof value === "string" && allowed.includes(value as T);
const safeFrameIndex = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < 24;
const finiteNonNegative = (value: unknown): value is number => Number.isFinite(value) && (value as number) >= 0;
const containsNonFiniteDataNumber = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) continue;
    if (containsNonFiniteDataNumber(descriptor.value, seen)) return true;
  }
  return false;
};

const parsePointMap = (value: unknown): StickBodySafetyPointMap | null => {
  if (!exactKeys(value, STICK_JOINT_ROLES)) return null;
  const result = {} as StickBodySafetyPointMap;
  for (const role of STICK_JOINT_ROLES) {
    if (!finitePoint(value[role])) return null;
    result[role] = {x: value[role].x, y: value[role].y};
  }
  return result;
};

const parseContext = (value: unknown): StickBodySafetyFrameContextV1 | null => {
  if (!exactKeys(value, [
    "posture", "motionPhase", "impact", "support", "limbIntents", "plantedAnchors", "targetEffectors",
    "path", "balanceErrorX", "actingDisplacementH", "rootDisplacementH", "landmarks",
  ])) return null;
  if (!enumValue(value.posture, POSTURES) || !enumValue(value.motionPhase, MOTION_PHASES) || typeof value.impact !== "boolean" ||
    !enumValue(value.support, SUPPORTS) || !Number.isFinite(value.balanceErrorX) || !finiteNonNegative(value.actingDisplacementH) ||
    !finiteNonNegative(value.rootDisplacementH)) return null;
  const limbIntents = value.limbIntents;
  if (!exactKeys(limbIntents, CHAINS) || !CHAINS.every((chain) => enumValue(limbIntents[chain], LIMB_INTENTS))) return null;
  const plantedAnchors = value.plantedAnchors;
  if (!exactKeys(plantedAnchors, ["leftFoot", "rightFoot"]) ||
    !(["leftFoot", "rightFoot"] as const).every((role) => plantedAnchors[role] === null || finitePoint(plantedAnchors[role]))) return null;
  if (!isPlainRecord(value.targetEffectors)) return null;
  const targetEffectors: Partial<Record<StickJointRoleV1, StickBodySafetyPoint>> = {};
  for (const key of Reflect.ownKeys(value.targetEffectors)) {
    if (typeof key !== "string" || !(STICK_JOINT_ROLES as readonly string[]).includes(key) || !finitePoint(value.targetEffectors[key])) return null;
    targetEffectors[key as StickJointRoleV1] = {...value.targetEffectors[key]};
  }
  let path: StickBodySafetyFrameContextV1["path"] = null;
  const pathValue = value.path;
  if (pathValue !== null) {
    if (!exactKeys(pathValue, ["role", "start", "end", "corridorH"]) ||
      !enumValue(pathValue.role, STICK_JOINT_ROLES) || !finitePoint(pathValue.start) || !finitePoint(pathValue.end) ||
      !finiteNonNegative(pathValue.corridorH) || pathValue.corridorH > 1) return null;
    path = {role: pathValue.role, start: {...pathValue.start}, end: {...pathValue.end}, corridorH: pathValue.corridorH};
  }
  const landmarks = value.landmarks;
  if (!denseArray(landmarks) || landmarks.length > 32 ||
    landmarks.some((entry) => typeof entry !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(entry)) ||
    new Set(landmarks).size !== landmarks.length) return null;
  return {
    posture: value.posture,
    motionPhase: value.motionPhase,
    impact: value.impact,
    support: value.support,
    limbIntents: Object.fromEntries(CHAINS.map((chain) => [chain, limbIntents[chain]])) as Record<StickBodySafetyChain, StickBodySafetyLimbIntent>,
    plantedAnchors: {
      leftFoot: plantedAnchors.leftFoot === null ? null : {...plantedAnchors.leftFoot as StickBodySafetyPoint},
      rightFoot: plantedAnchors.rightFoot === null ? null : {...plantedAnchors.rightFoot as StickBodySafetyPoint},
    },
    targetEffectors,
    path,
    balanceErrorX: value.balanceErrorX as number,
    actingDisplacementH: value.actingDisplacementH,
    rootDisplacementH: value.rootDisplacementH,
    landmarks: [...landmarks] as string[],
  };
};

const invalidIntegration = (message: string) =>
  (failure("integration_bypass", "integration", message) as {ok: false; error: StickBodySafetyFailure}).error;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const parseBinding = (value: unknown): StickBodySafetyBindingV1 | null => {
  if (!exactKeys(value, ["projectId", "transactionId", "baseDocumentRevision", "baseDocumentDigest"]) ||
    typeof value.projectId !== "string" || !UUID.test(value.projectId) || typeof value.transactionId !== "string" || !UUID.test(value.transactionId) ||
    !Number.isSafeInteger(value.baseDocumentRevision) || (value.baseDocumentRevision as number) < 0 ||
    typeof value.baseDocumentDigest !== "string" || !isSha256Digest(value.baseDocumentDigest)) return null;
  return {
    projectId: value.projectId,
    transactionId: value.transactionId,
    baseDocumentRevision: value.baseDocumentRevision as number,
    baseDocumentDigest: value.baseDocumentDigest,
  };
};

const parseAnimationIntent = (value: unknown): StickBodySafetyAnimationIntentV1 | null => {
  if (!exactKeys(value, ["movementKind", "loop", "actingEffectors", "requiredLandmarks", "expectedPeakFrames"])) return null;
  if ((value.movementKind !== "hold" && value.movementKind !== "movement") || typeof value.loop !== "boolean" ||
    !denseArray(value.actingEffectors) || value.actingEffectors.some((role) => !enumValue(role, STICK_JOINT_ROLES)) ||
    new Set(value.actingEffectors).size !== value.actingEffectors.length || !denseArray(value.requiredLandmarks) ||
    value.requiredLandmarks.some((entry) => typeof entry !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(entry)) ||
    new Set(value.requiredLandmarks).size !== value.requiredLandmarks.length || !denseArray(value.expectedPeakFrames) ||
    value.expectedPeakFrames.some((entry) => !safeFrameIndex(entry)) || new Set(value.expectedPeakFrames).size !== value.expectedPeakFrames.length) return null;
  return {
    movementKind: value.movementKind,
    loop: value.loop,
    actingEffectors: [...value.actingEffectors] as StickJointRoleV1[],
    requiredLandmarks: [...value.requiredLandmarks] as string[],
    expectedPeakFrames: [...value.expectedPeakFrames] as number[],
  };
};

const parseImportantPoses = (value: unknown): StickBodySafetyImportantPoseV1[] | null => {
  if (!denseArray(value) || value.length < 1 || value.length > 8) return null;
  const importantPoses: StickBodySafetyImportantPoseV1[] = [];
  for (const entry of value) {
    if (!exactKeys(entry, ["frameIndex", "seed", "activeChains", "context"]) || !safeFrameIndex(entry.frameIndex) || !denseArray(entry.activeChains) ||
      entry.activeChains.length > 4 || entry.activeChains.some((chain) => !enumValue(chain, CHAINS)) || new Set(entry.activeChains).size !== entry.activeChains.length) return null;
    const seed = parsePointMap(entry.seed);
    const context = parseContext(entry.context);
    if (!seed || !context) return null;
    importantPoses.push({frameIndex: entry.frameIndex, seed, activeChains: [...entry.activeChains] as StickBodySafetyChain[], context});
  }
  return importantPoses.some((entry, index) => index > 0 && entry.frameIndex <= importantPoses[index - 1].frameIndex) ? null : importantPoses;
};

const parseNeutralMetrics = (value: unknown): StickBodySafetyNeutralMetricsV1 | null => {
  if (!exactKeys(value, ["topology", "stage", "standingBodyHeight", "groundY", "neutralPoints", "segmentLengths"]) ||
    value.topology !== STICK_HUMANOID_TEMPLATE_ID || value.stage !== STICK_BODY_SAFETY_STAGE_ID ||
    !Number.isFinite(value.standingBodyHeight) || (value.standingBodyHeight as number) <= 0 || !Number.isFinite(value.groundY) ||
    !denseArray(value.segmentLengths) || value.segmentLengths.length !== STICK_SEGMENT_ROLE_PAIRS.length) return null;
  const neutralPoints = parsePointMap(value.neutralPoints);
  if (!neutralPoints) return null;
  const segmentLengths: StickBodySafetyNeutralMetricsV1["segmentLengths"] = [];
  for (let index = 0; index < STICK_SEGMENT_ROLE_PAIRS.length; index += 1) {
    const entry = value.segmentLengths[index];
    const expected = STICK_SEGMENT_ROLE_PAIRS[index];
    if (!exactKeys(entry, ["from", "to", "length"]) || entry.from !== expected[0] || entry.to !== expected[1] ||
      !Number.isFinite(entry.length) || (entry.length as number) <= 0) return null;
    segmentLengths.push({from: expected[0], to: expected[1], length: entry.length as number});
  }
  return {
    topology: STICK_HUMANOID_TEMPLATE_ID,
    stage: STICK_BODY_SAFETY_STAGE_ID,
    standingBodyHeight: value.standingBodyHeight as number,
    groundY: value.groundY as number,
    neutralPoints,
    segmentLengths,
  };
};

const parseSelectionRequest = (input: unknown): StickBodySafetySelectionRequestV1 | StickBodySafetyFailure => {
  try { canonicalJson(input); } catch {
    return containsNonFiniteDataNumber(input)
      ? (failure("non_finite_geometry", "integration", "Safety selection contains a non-finite numeric operand.") as {ok: false; error: StickBodySafetyFailure}).error
      : invalidIntegration("Safety selection must be strict finite dense canonical JSON.");
  }
  if (!exactKeys(input, ["contractVersion", "binding", "neutralMetrics", "importantPoses", "animationIntent"]) ||
    input.contractVersion !== STICK_BODY_SAFETY_SELECTION_CONTRACT_VERSION) return invalidIntegration("Safety selection fields do not match the closed selection contract.");
  const binding = parseBinding(input.binding);
  const neutralMetrics = parseNeutralMetrics(input.neutralMetrics);
  const importantPoses = parseImportantPoses(input.importantPoses);
  const animationIntent = parseAnimationIntent(input.animationIntent);
  if (!binding || !neutralMetrics || !importantPoses || !animationIntent) return invalidIntegration("Safety selection data is outside the closed selection contract.");
  return {contractVersion: STICK_BODY_SAFETY_SELECTION_CONTRACT_VERSION, binding, neutralMetrics, importantPoses, animationIntent};
};

const parseCheckedSelection = (value: unknown): StickBodySafetyCheckedSelectionV1 | null => {
  if (!exactKeys(value, ["contractVersion", "binding", "requestDigest", "selectionDigest", "selectedImportantPoses", "qualification"]) ||
    value.contractVersion !== STICK_BODY_SAFETY_SELECTION_RESULT_VERSION || typeof value.requestDigest !== "string" || !isSha256Digest(value.requestDigest) ||
    typeof value.selectionDigest !== "string" || !isSha256Digest(value.selectionDigest) || !denseArray(value.selectedImportantPoses)) return null;
  const binding = parseBinding(value.binding);
  if (!binding) return null;
  const selectedImportantPoses: StickBodySafetyCheckedSelectionV1["selectedImportantPoses"] = [];
  for (const entry of value.selectedImportantPoses) {
    if (!exactKeys(entry, ["frameIndex", "points", "context", "branchSigns"]) || !safeFrameIndex(entry.frameIndex)) return null;
    const branchValue = entry.branchSigns;
    if (!exactKeys(branchValue, CHAINS)) return null;
    for (const chain of CHAINS) {
      if (branchValue[chain] !== -1 && branchValue[chain] !== 0 && branchValue[chain] !== 1) return null;
    }
    const points = parsePointMap(entry.points);
    const context = parseContext(entry.context);
    if (!points || !context) return null;
    selectedImportantPoses.push({frameIndex: entry.frameIndex, points, context, branchSigns: {...branchValue} as Record<StickBodySafetyChain, -1 | 0 | 1>});
  }
  const qualification = value.qualification;
  if (!exactKeys(qualification, ["topology", "stage", "importantPoseCount", "ikSolutionsEnumerated", "wholeBodyCandidatesConsidered", "standingBodyHeight", "groundY"]) ||
    qualification.topology !== STICK_HUMANOID_TEMPLATE_ID || qualification.stage !== STICK_BODY_SAFETY_STAGE_ID ||
    !Number.isSafeInteger(qualification.importantPoseCount) || !Number.isSafeInteger(qualification.ikSolutionsEnumerated) ||
    !Number.isSafeInteger(qualification.wholeBodyCandidatesConsidered) || !Number.isFinite(qualification.standingBodyHeight) || !Number.isFinite(qualification.groundY)) return null;
  return {
    contractVersion: STICK_BODY_SAFETY_SELECTION_RESULT_VERSION,
    binding,
    requestDigest: value.requestDigest,
    selectionDigest: value.selectionDigest,
    selectedImportantPoses,
    qualification: cloneCanonical(qualification) as StickBodySafetyCheckedSelectionV1["qualification"],
  };
};

const parseFinalFrames = (value: unknown): StickBodySafetyFinalFrameV1[] | StickBodySafetyFailure => {
  if (!denseArray(value) || value.length < 1 || value.length > 24) return invalidIntegration("Final-frame count is outside the bounded completion contract.");
  const finalFrames: StickBodySafetyFinalFrameV1[] = [];
  for (const entry of value) {
    if (!exactKeys(entry, ["frameIndex", "points", "context"]) || !safeFrameIndex(entry.frameIndex)) return invalidIntegration("Final-frame data is outside the closed completion contract.");
    const points = parsePointMap(entry.points);
    const context = parseContext(entry.context);
    if (!points || !context || STICK_JOINT_ROLES.some((role) => !Number.isSafeInteger(points[role].x) || !Number.isSafeInteger(points[role].y))) {
      return (failure("non_finite_geometry", "final_frame", "Final frames require finite integer geometry.", entry.frameIndex as number) as {ok: false; error: StickBodySafetyFailure}).error;
    }
    finalFrames.push({frameIndex: entry.frameIndex as number, points, context});
  }
  return finalFrames.some((entry, index) => entry.frameIndex !== index)
    ? invalidIntegration("Final-frame indexes must be complete, zero-based, and ordered.")
    : finalFrames;
};

const parseCompletionInput = (input: unknown): StickBodySafetyCompletionInputV1 | StickBodySafetyFailure => {
  try { canonicalJson(input); } catch {
    return containsNonFiniteDataNumber(input)
      ? (failure("non_finite_geometry", "integration", "Safety completion contains a non-finite numeric operand.") as {ok: false; error: StickBodySafetyFailure}).error
      : invalidIntegration("Safety completion must be strict finite dense canonical JSON.");
  }
  if (!exactKeys(input, ["contractVersion", "selectionRequest", "checkedSelection", "finalFrames", "candidateDocument", "animationIntent"]) ||
    input.contractVersion !== STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION) return invalidIntegration("Safety completion fields do not match the closed completion contract.");
  const selectionRequest = parseSelectionRequest(input.selectionRequest);
  const checkedSelection = parseCheckedSelection(input.checkedSelection);
  const finalFrames = parseFinalFrames(input.finalFrames);
  const animationIntent = parseAnimationIntent(input.animationIntent);
  if ("reason" in selectionRequest) return selectionRequest;
  if (!checkedSelection || "reason" in finalFrames || !animationIntent) return "reason" in finalFrames ? finalFrames : invalidIntegration("Safety completion data is outside the closed completion contract.");
  return {
    contractVersion: STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION,
    selectionRequest,
    checkedSelection,
    finalFrames,
    candidateDocument: input.candidateDocument as StickProjectDocumentV1,
    animationIntent,
  };
};

const distance = (a: StickBodySafetyPoint, b: StickBodySafetyPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const segmentKey = (from: StickJointRoleV1, to: StickJointRoleV1) => `${from}:${to}`;
const angle = (a: StickBodySafetyPoint, b: StickBodySafetyPoint) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const wrap = (value: number) => {
  let result = ((value + 180) % 360 + 360) % 360 - 180;
  if (result === -180) result = 180;
  return result;
};
const bend = (points: StickBodySafetyPointMap, chain: StickBodySafetyChain) => {
  const {root, joint, effector} = CHAIN_ROLES[chain];
  return wrap(angle(points[joint], points[effector]) - angle(points[root], points[joint]));
};
const sign = (value: number): -1 | 0 | 1 => value < 0 ? -1 : value > 0 ? 1 : 0;
const clonePoints = (points: StickBodySafetyPointMap): StickBodySafetyPointMap =>
  Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {...points[role]}])) as StickBodySafetyPointMap;
const roundedPoints = (points: StickBodySafetyPointMap): StickBodySafetyPointMap =>
  Object.fromEntries(STICK_JOINT_ROLES.map((role) => [role, {x: Math.round(points[role].x), y: Math.round(points[role].y)}])) as StickBodySafetyPointMap;
const samePoints = (left: StickBodySafetyPointMap, right: StickBodySafetyPointMap) =>
  STICK_JOINT_ROLES.every((role) => left[role].x === right[role].x && left[role].y === right[role].y);

const metricsFromStarter = (starterInput: StickProjectDocumentV1): Metrics | StickBodySafetyFailure => {
  const parsed = parseStickProjectDocument(starterInput);
  if (!parsed.ok || parsed.value.coordinateSpace.id !== STICK_BODY_SAFETY_STAGE_ID || parsed.value.coordinateSpace.width !== 1920 ||
    parsed.value.coordinateSpace.height !== 1080 || parsed.value.rigs.length !== 1 || parsed.value.figures.length !== 1 ||
    parsed.value.rigs[0].templateId !== STICK_HUMANOID_TEMPLATE_ID) {
    return (failure("integration_bypass", "integration", "Body safety accepts only the built-in humanoid-11-v1 stage.") as {ok: false; error: StickBodySafetyFailure}).error;
  }
  const first = parsed.value.layers[0]?.cells[0];
  if (first?.cellType !== "keyframe" || first.poses.length !== 1) {
    return (failure("integration_bypass", "integration", "The transported-neutral starter pose is missing.") as {ok: false; error: StickBodySafetyFailure}).error;
  }
  const neutral = Object.fromEntries(parsed.value.rigs[0].joints.map((joint, index) => [joint.role, {
    x: first.poses[0].points[index].x,
    y: first.poses[0].points[index].y,
  }])) as StickBodySafetyPointMap;
  const lengths = new Map<string, number>();
  for (const [from, to] of STICK_SEGMENT_ROLE_PAIRS) {
    const value = distance(neutral[from], neutral[to]);
    if (!Number.isFinite(value) || value <= 0) return (failure("segment_length", "integration", "Neutral segment length is invalid.", null, null, [from, to]) as {ok: false; error: StickBodySafetyFailure}).error;
    lengths.set(segmentKey(from, to), value);
    lengths.set(segmentKey(to, from), value);
  }
  const groundY = Math.max(neutral.leftFoot.y, neutral.rightFoot.y);
  const standingBodyHeight = groundY - neutral.head.y;
  if (!Number.isFinite(standingBodyHeight) || standingBodyHeight <= 0) {
    return (failure("non_finite_geometry", "integration", "Standing body height is invalid.") as {ok: false; error: StickBodySafetyFailure}).error;
  }
  return {neutral, lengths, standingBodyHeight, groundY, width: 1920, height: 1080};
};

const neutralMetricsFromMetrics = (metrics: Metrics): StickBodySafetyNeutralMetricsV1 => ({
  topology: STICK_HUMANOID_TEMPLATE_ID,
  stage: STICK_BODY_SAFETY_STAGE_ID,
  standingBodyHeight: metrics.standingBodyHeight,
  groundY: metrics.groundY,
  neutralPoints: clonePoints(metrics.neutral),
  segmentLengths: STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => ({from, to, length: metrics.lengths.get(segmentKey(from, to))!})),
});

const validateSelectionBinding = async (
  request: StickBodySafetySelectionRequestV1,
  starter: StickProjectDocumentV1,
  metrics: Metrics,
): Promise<StickBodySafetyFailure | null> => {
  const starterDigest = await digestCanonical(starter);
  if (request.binding.projectId !== starter.projectId || request.binding.baseDocumentRevision !== starter.documentRevision ||
    request.binding.baseDocumentDigest !== starterDigest) {
    return invalidIntegration("Safety selection binding does not match the exact starter document.");
  }
  if (canonicalJson(request.neutralMetrics) !== canonicalJson(neutralMetricsFromMetrics(metrics))) {
    return invalidIntegration("Safety selection neutral metrics do not match the recomputed starter metrics.");
  }
  return null;
};

const enumerateTwoCircle = (
  root: StickBodySafetyPoint,
  effector: StickBodySafetyPoint,
  firstLength: number,
  secondLength: number,
  epsilon: number,
) => {
  const dx = effector.x - root.x;
  const dy = effector.y - root.y;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d <= epsilon || d > firstLength + secondLength + epsilon || d < Math.abs(firstLength - secondLength) - epsilon) return [];
  const a = (firstLength * firstLength - secondLength * secondLength + d * d) / (2 * d);
  const hSquared = Math.max(0, firstLength * firstLength - a * a);
  const h = Math.sqrt(hSquared);
  const base = {x: root.x + a * dx / d, y: root.y + a * dy / d};
  if (h <= epsilon) return [base];
  const offset = {x: -dy * h / d, y: dx * h / d};
  return [
    {x: base.x + offset.x, y: base.y + offset.y},
    {x: base.x - offset.x, y: base.y - offset.y},
  ].sort((left, right) => left.x - right.x || left.y - right.y);
};

const orientation = (a: StickBodySafetyPoint, b: StickBodySafetyPoint, c: StickBodySafetyPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: StickBodySafetyPoint, b: StickBodySafetyPoint, p: StickBodySafetyPoint, epsilon: number) =>
  p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon &&
  p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon && Math.abs(orientation(a, b, p)) <= epsilon;
const segmentsTouch = (a: StickBodySafetyPoint, b: StickBodySafetyPoint, c: StickBodySafetyPoint, d: StickBodySafetyPoint, epsilon: number) => {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true;
  return onSegment(a, b, c, epsilon) || onSegment(a, b, d, epsilon) || onSegment(c, d, a, epsilon) || onSegment(c, d, b, epsilon);
};
const pointSegmentDistance = (point: StickBodySafetyPoint, from: StickBodySafetyPoint, to: StickBodySafetyPoint) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, from);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return distance(point, {x: from.x + dx * t, y: from.y + dy * t});
};

const transportedNeutral = (metrics: Metrics, points: StickBodySafetyPointMap, role: StickJointRoleV1) => ({
  x: metrics.neutral[role].x + points.hip.x - metrics.neutral.hip.x,
  y: metrics.neutral[role].y + points.hip.y - metrics.neutral.hip.y,
});
const rmsFromNeutral = (metrics: Metrics, points: StickBodySafetyPointMap, roles = STICK_JOINT_ROLES as readonly StickJointRoleV1[]) =>
  Math.sqrt(roles.reduce((sum, role) => sum + distance(points[role], transportedNeutral(metrics, points, role)) ** 2, 0) / Math.max(1, roles.length));
const branchSigns = (points: StickBodySafetyPointMap) => Object.fromEntries(CHAINS.map((chain) => [chain, sign(bend(points, chain))])) as Record<StickBodySafetyChain, -1 | 0 | 1>;
const isStrictStationaryRestContext = (context: StickBodySafetyFrameContextV1) =>
  context.posture === "neutral" && (context.motionPhase === "rest" || context.motionPhase === "settle") &&
  !context.impact && context.support === "both" && context.rootDisplacementH === 0 && context.plantedAnchors.leftFoot !== null &&
  context.plantedAnchors.rightFoot !== null && (["leftLeg", "rightLeg"] as const).every((chain) => {
    const intent = context.limbIntents[chain];
    return intent === "unspecified" || intent === "relax" || intent === "recover";
  });

const validateFrame = (
  points: StickBodySafetyPointMap,
  context: StickBodySafetyFrameContextV1,
  metrics: Metrics,
  stage: "important_pose" | "final_frame",
  frameIndex: number,
  straightQualification: "none" | "endpoint_rest" | "stationary_rest",
): StickBodySafetyFailure | null => {
  const epsilonDistance = 1e-9 * metrics.standingBodyHeight;
  const epsilonAngle = 1e-9;
  for (const role of STICK_JOINT_ROLES) {
    if (!Number.isFinite(points[role].x) || !Number.isFinite(points[role].y)) {
      return (failure("non_finite_geometry", stage, "A joint contains non-finite geometry.", frameIndex, null, [role]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  for (const [from, to] of STICK_SEGMENT_ROLE_PAIRS) {
    const actualLength = distance(points[from], points[to]);
    const tolerance = stage === "final_frame" ? 2 : 1e-6;
    if ((stage === "final_frame" && actualLength < 2 - epsilonDistance) ||
      Math.abs(actualLength - metrics.lengths.get(segmentKey(from, to))!) > tolerance + epsilonDistance) {
      return (failure("segment_length", stage, "A segment violates the neutral-length tolerance.", frameIndex, null, [from, to]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  for (const role of STICK_JOINT_ROLES) {
    const point = points[role];
    if (point.x < 0 || point.x > metrics.width - 1 || point.y < 0 || point.y > metrics.height - 1) {
      return (failure("stage_bounds", stage, "A joint is outside the fixed stage.", frameIndex, null, [role]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  const lineHead = deriveStickLineHead(points.head);
  if (lineHead.from.x < 0 || lineHead.to.x > metrics.width - 1 || lineHead.from.y < 0 || lineHead.to.y > metrics.height - 1) {
    return (failure("stage_bounds", stage, "The complete derived line head is outside the fixed stage.", frameIndex, null, ["head"]) as {ok: false; error: StickBodySafetyFailure}).error;
  }
  for (const chain of ["leftArm", "rightArm"] as const) {
    const value = Math.abs(bend(points, chain));
    if (value <= epsilonAngle) return (failure("branch_singularity", stage, "An elbow is in a straight-through singularity.", frameIndex, null, [CHAIN_ROLES[chain].joint]) as {ok: false; error: StickBodySafetyFailure}).error;
    if (value < 8 - epsilonAngle || value > 150 + epsilonAngle) {
      return (failure("elbow_bend", stage, "An elbow is outside the 8..150 degree corridor.", frameIndex, null, [CHAIN_ROLES[chain].joint]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  for (const chain of ["leftLeg", "rightLeg"] as const) {
    const value = Math.abs(bend(points, chain));
    const intent = context.limbIntents[chain];
    const role = CHAIN_ROLES[chain];
    const anchor = context.plantedAnchors[role.effector as "leftFoot" | "rightFoot"];
    const exceptionSemantics = intent === "unspecified" || intent === "relax" || intent === "recover";
    const straightGeometry = anchor !== null && Math.abs(points[role.effector].x - anchor.x) <= 2 && Math.abs(points[role.effector].y - anchor.y) <= 2 &&
      distance(points[role.joint], transportedNeutral(metrics, points, role.joint)) <= 0.03 * metrics.standingBodyHeight + epsilonDistance &&
      distance(points.hip, transportedNeutral(metrics, points, "hip")) <= 0.04 * metrics.standingBodyHeight + epsilonDistance;
    const forbiddenPhase = context.motionPhase === "moving" || context.motionPhase === "support_transition" || context.motionPhase === "takeoff" ||
      context.motionPhase === "landing" || context.motionPhase === "contact" || intent === "step" || intent === "swing" || intent === "support" || intent === "act";
    const straightAllowed = value <= 2 + epsilonAngle && exceptionSemantics && straightGeometry && !forbiddenPhase &&
      straightQualification !== "none" && isStrictStationaryRestContext(context);
    if (value <= epsilonAngle && forbiddenPhase) {
      return (failure("branch_singularity", stage, "A moving knee is in a straight-through singularity.", frameIndex, null, [role.joint]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
    if (!straightAllowed && (value < 6 - epsilonAngle || value > 125 + epsilonAngle)) {
      return (failure("knee_bend", stage, "A knee is outside its moving corridor or straight-neutral exception.", frameIndex, null, [role.joint]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
    if (value > 2 + epsilonAngle && value < 6 - epsilonAngle) {
      return (failure("knee_bend", stage, "A knee is inside the forbidden 2..6 degree dead corridor.", frameIndex, null, [role.joint]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  const torsoLean = Math.abs(wrap(angle(points.hip, points.neck) - -90));
  const headTorso = Math.abs(wrap(angle(points.neck, points.head) - angle(points.hip, points.neck)));
  const torsoLimit = context.posture === "hinge" ? 50 : 30;
  if (torsoLean > torsoLimit + epsilonAngle || headTorso > 20 + epsilonAngle || points.head.y >= points.neck.y) {
    return (failure("torso_head", stage, "Torso/head alignment is outside its anatomical corridor.", frameIndex, null, ["head", "neck", "hip"]) as {ok: false; error: StickBodySafetyFailure}).error;
  }
  const headSegment = {from: points.neck, to: points.head};
  const headLine = {from: lineHead.from, to: lineHead.to};
  const headRoles = new Set<string>(["head", "neck"]);
  const headForbiddenSegments = STICK_SEGMENT_ROLE_PAIRS.filter(([from, to]) => !headRoles.has(from) && !headRoles.has(to));
  for (const [from, to] of headForbiddenSegments) {
    if (segmentsTouch(points[from], points[to], headSegment.from, headSegment.to, epsilonDistance) ||
      segmentsTouch(points[from], points[to], headLine.from, headLine.to, epsilonDistance)) {
      return (failure("torso_head", stage, "A non-adjacent limb crosses the neck/head geometry.", frameIndex, null, [from, to, "head", "neck"]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  for (let left = 0; left < STICK_SEGMENT_ROLE_PAIRS.length; left += 1) {
    for (let right = left + 1; right < STICK_SEGMENT_ROLE_PAIRS.length; right += 1) {
      const [a, b] = STICK_SEGMENT_ROLE_PAIRS[left];
      const [c, d] = STICK_SEGMENT_ROLE_PAIRS[right];
      const shared = a === c || a === d ? a : b === c || b === d ? b : null;
      if (shared) {
        const leftOther = a === shared ? b : a;
        const rightOther = c === shared ? d : c;
        const leftVector = {x: points[leftOther].x - points[shared].x, y: points[leftOther].y - points[shared].y};
        const rightVector = {x: points[rightOther].x - points[shared].x, y: points[rightOther].y - points[shared].y};
        const cross = leftVector.x * rightVector.y - leftVector.y * rightVector.x;
        const dot = leftVector.x * rightVector.x + leftVector.y * rightVector.y;
        if (Math.abs(cross) <= epsilonDistance && dot > epsilonDistance * epsilonDistance) {
          return (failure("body_crossing", stage, "Adjacent body segments overlap beyond their shared endpoint.", frameIndex, null, [a, b, c, d]) as {ok: false; error: StickBodySafetyFailure}).error;
        }
        continue;
      }
      if (segmentsTouch(points[a], points[b], points[c], points[d], epsilonDistance)) {
        return (failure("body_crossing", stage, "Non-adjacent body segments intersect or touch.", frameIndex, null, [a, b, c, d]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
  }
  for (const chain of ["leftArm", "rightArm"] as const) {
    const handRole = CHAIN_ROLES[chain].effector;
    const hand = points[handRole];
    const guardTarget = context.targetEffectors[handRole];
    const guard = context.limbIntents[chain] === "guard" && guardTarget !== undefined &&
      pointSegmentDistance(guardTarget, points.hip, points.neck) <= 0.03 * metrics.standingBodyHeight + epsilonDistance;
    const torsoFloor = (guard ? 0.015 : 0.03) * metrics.standingBodyHeight;
    if (pointSegmentDistance(hand, points.hip, points.neck) < torsoFloor - epsilonDistance ||
      distance(hand, points.head) < 0.055 * metrics.standingBodyHeight - epsilonDistance ||
      pointSegmentDistance(hand, headLine.from, headLine.to) < 0.055 * metrics.standingBodyHeight - epsilonDistance) {
      return (failure("clearance", stage, "A hand violates torso/head clearance.", frameIndex, null, [handRole, "head", "neck", "hip"]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  if (context.support === "airborne") {
    return (failure("support_contact", stage, "Airborne support is unavailable before the mechanics phase.", frameIndex, null, ["leftFoot", "rightFoot"]) as {ok: false; error: StickBodySafetyFailure}).error;
  }
  const supported = context.support === "both" ? ["leftFoot", "rightFoot"] as const : context.support === "left" ? ["leftFoot"] as const : ["rightFoot"] as const;
  for (const foot of supported) {
    const anchor = context.plantedAnchors[foot];
    if (!anchor || Math.abs(points[foot].x - anchor.x) > 2 || Math.abs(points[foot].y - anchor.y) > 2 || Math.abs(points[foot].y - metrics.groundY) > 2) {
      return (failure("support_contact", stage, "A declared planted foot lacks matching ground contact.", frameIndex, null, [foot]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  const unsupportedFoot = context.support === "left" ? "rightFoot" : context.support === "right" ? "leftFoot" : null;
  if (unsupportedFoot && context.plantedAnchors[unsupportedFoot] !== null) {
    return (failure("support_contact", stage, "An unsupported foot may not retain a planted tag.", frameIndex, null, [unsupportedFoot]) as {ok: false; error: StickBodySafetyFailure}).error;
  }
  const penetrated = STICK_JOINT_ROLES.find((role) => points[role].y > metrics.groundY + 2);
  if (penetrated) return (failure("support_contact", stage, "A joint penetrates below the ground tolerance.", frameIndex, null, [penetrated]) as {ok: false; error: StickBodySafetyFailure}).error;
  const balanceX = (2 * points.hip.x + points.neck.x + points.head.x) / 4;
  if (context.support === "both") {
    const left = context.plantedAnchors.leftFoot!;
    const right = context.plantedAnchors.rightFoot!;
    if (balanceX < Math.min(left.x, right.x) - 0.12 * metrics.standingBodyHeight - epsilonDistance ||
      balanceX > Math.max(left.x, right.x) + 0.12 * metrics.standingBodyHeight + epsilonDistance) {
      return (failure("balance", stage, "The conservative double-support balance floor is violated.", frameIndex, null, ["hip", "neck", "head", "leftFoot", "rightFoot"]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  } else {
    const foot = context.support === "left" ? "leftFoot" : "rightFoot";
    if (Math.abs(balanceX - context.plantedAnchors[foot]!.x) > 0.16 * metrics.standingBodyHeight + epsilonDistance) {
      return (failure("balance", stage, "The conservative single-support balance floor is violated.", frameIndex, null, ["hip", "neck", "head", foot]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  const relaxedCorridors: Array<[StickBodySafetyChain, StickJointRoleV1, number, StickJointRoleV1, number]> = [
    ["leftArm", "leftElbow", 0.05, "leftHand", 0.08],
    ["rightArm", "rightElbow", 0.05, "rightHand", 0.08],
    ["leftLeg", "leftKnee", 0.04, "leftFoot", 0.02],
    ["rightLeg", "rightKnee", 0.04, "rightFoot", 0.02],
  ];
  for (const [chain, joint, jointLimit, effector, effectorLimit] of relaxedCorridors) {
    if (context.limbIntents[chain] !== "unspecified" && context.limbIntents[chain] !== "relax") continue;
    if (distance(points[joint], transportedNeutral(metrics, points, joint)) > jointLimit * metrics.standingBodyHeight + epsilonDistance ||
      distance(points[effector], transportedNeutral(metrics, points, effector)) > effectorLimit * metrics.standingBodyHeight + epsilonDistance) {
      return (failure("unrequested_motion", stage, "A relaxed or unspecified limb leaves its transported-neutral corridor.", frameIndex, null, [joint, effector]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  if (context.posture !== "lower" && context.posture !== "compress" && points.hip.y - metrics.neutral.hip.y > 0.05 * metrics.standingBodyHeight + epsilonDistance) {
    return (failure("unrequested_motion", stage, "The hip lowers without lower/compress intent.", frameIndex, null, ["hip"]) as {ok: false; error: StickBodySafetyFailure}).error;
  }
  const armsUnrequested = (["leftArm", "rightArm"] as const).every((chain) => context.limbIntents[chain] === "unspecified" || context.limbIntents[chain] === "relax");
  if (armsUnrequested && points.leftElbow.y < points.neck.y + 0.08 * metrics.standingBodyHeight &&
    points.rightElbow.y < points.neck.y + 0.08 * metrics.standingBodyHeight && points.leftHand.y < points.leftElbow.y &&
    points.rightHand.y < points.rightElbow.y && points.leftElbow.x < points.neck.x && points.rightElbow.x > points.neck.x) {
    return (failure("unrequested_motion", stage, "Unrequested limbs form a W-arm gesture.", frameIndex, null, ["leftElbow", "leftHand", "rightElbow", "rightHand"]) as {ok: false; error: StickBodySafetyFailure}).error;
  }
  const neutralHeadTorso = wrap(angle(metrics.neutral.neck, metrics.neutral.head) - angle(metrics.neutral.hip, metrics.neutral.neck));
  if (Math.abs(wrap((angle(points.neck, points.head) - angle(points.hip, points.neck)) - neutralHeadTorso)) > 8 + epsilonAngle) {
    return (failure("unrequested_motion", stage, "Head-to-torso motion was not requested.", frameIndex, null, ["head", "neck", "hip"]) as {ok: false; error: StickBodySafetyFailure}).error;
  }
  for (const chain of CHAINS) {
    if (context.limbIntents[chain] !== "balance") continue;
    const effector = CHAIN_ROLES[chain].effector;
    const neutralEffector = transportedNeutral(metrics, points, effector);
    const displacement = distance(points[effector], neutralEffector) / metrics.standingBodyHeight;
    const dx = points[effector].x - neutralEffector.x;
    const ceiling = 0.6 * Math.max(context.actingDisplacementH, context.rootDisplacementH);
    if (displacement > 0.12 + 1e-9 || displacement > ceiling + 1e-9 ||
      (Math.abs(context.balanceErrorX) <= 0.01 * metrics.standingBodyHeight && displacement > 1e-9) ||
      (context.balanceErrorX > 0.01 * metrics.standingBodyHeight && dx >= -epsilonDistance) ||
      (context.balanceErrorX < -0.01 * metrics.standingBodyHeight && dx <= epsilonDistance)) {
      return (failure("balance", stage, "A balance limb is not a small proportional opposing correction.", frameIndex, null, [effector]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  return null;
};

const candidateStaticCost = (candidate: StickBodySafetyPointMap, context: StickBodySafetyFrameContextV1, metrics: Metrics) => {
  const targets = Object.entries(context.targetEffectors) as Array<[StickJointRoleV1, StickBodySafetyPoint]>;
  const targetError = targets.reduce((sum, [role, target]) => sum + distance(candidate[role], target), 0) / metrics.standingBodyHeight;
  const recoveryError = CHAINS.filter((chain) => context.limbIntents[chain] === "recover").reduce((sum, chain) => {
    const {joint, effector} = CHAIN_ROLES[chain];
    return sum + distance(candidate[joint], transportedNeutral(metrics, candidate, joint)) + distance(candidate[effector], transportedNeutral(metrics, candidate, effector));
  }, 0) / metrics.standingBodyHeight;
  const balanceX = (2 * candidate.hip.x + candidate.neck.x + candidate.head.x) / 4;
  const supportError = context.support === "both"
    ? Math.max(0, Math.min(context.plantedAnchors.leftFoot!.x, context.plantedAnchors.rightFoot!.x) - balanceX,
      balanceX - Math.max(context.plantedAnchors.leftFoot!.x, context.plantedAnchors.rightFoot!.x)) / metrics.standingBodyHeight
    : Math.abs(balanceX - context.plantedAnchors[context.support === "left" ? "leftFoot" : "rightFoot"]!.x) / metrics.standingBodyHeight;
  const unrequested = Math.max(...CHAINS.filter((chain) => context.limbIntents[chain] === "unspecified" || context.limbIntents[chain] === "relax").flatMap((chain) => {
    const {joint, effector} = CHAIN_ROLES[chain];
    return [distance(candidate[joint], transportedNeutral(metrics, candidate, joint)), distance(candidate[effector], transportedNeutral(metrics, candidate, effector))];
  }), 0) / metrics.standingBodyHeight;
  return [targetError, recoveryError, supportError, unrequested, rmsFromNeutral(metrics, candidate) / metrics.standingBodyHeight];
};

const enumerateImportantCandidates = (
  pose: StickBodySafetyImportantPoseV1,
  metrics: Metrics,
  endpoint: boolean,
) => {
  let candidates = [clonePoints(pose.seed)];
  let ikSolutionsEnumerated = 0;
  const epsilon = 1e-9 * metrics.standingBodyHeight;
  for (const chain of pose.activeChains) {
    const {root, joint, effector} = CHAIN_ROLES[chain];
    const solutions = enumerateTwoCircle(
      pose.seed[root], pose.seed[effector], metrics.lengths.get(segmentKey(root, joint))!, metrics.lengths.get(segmentKey(joint, effector))!, epsilon,
    );
    ikSolutionsEnumerated += solutions.length;
    if (solutions.length === 0) return {candidates: [] as Candidate[], ikSolutionsEnumerated, firstFailure: null as StickBodySafetyFailure | null};
    candidates = candidates.flatMap((candidate) => solutions.map((solution) => ({...clonePoints(candidate), [joint]: {...solution}})));
    if (candidates.length > 16) return {candidates: [] as Candidate[], ikSolutionsEnumerated, firstFailure: (failure("integration_bypass", "integration", "Whole-body candidate enumeration exceeded 16 combinations.") as {ok: false; error: StickBodySafetyFailure}).error};
  }
  const unique = [...new Map(candidates.map((points) => [canonicalJson(points), points])).values()];
  const valid: Candidate[] = [];
  let firstFailure: StickBodySafetyFailure | null = null;
  for (const points of unique) {
    const issue = validateFrame(points, pose.context, metrics, "important_pose", pose.frameIndex, endpoint ? "endpoint_rest" : "stationary_rest");
    if (issue) {
      firstFailure ??= issue;
      continue;
    }
    valid.push({
      points,
      context: pose.context,
      branchSigns: branchSigns(points),
      staticCost: candidateStaticCost(points, pose.context, metrics),
      bytes: canonicalJson(points),
      requiresStationaryQualification: !endpoint && (["leftLeg", "rightLeg"] as const).some((chain) => Math.abs(bend(points, chain)) <= 2 + 1e-9),
    });
  }
  return {candidates: valid, ikSolutionsEnumerated, firstFailure};
};

const compareCost = (left: {cost: number[]; tie: string}, right: {cost: number[]; tie: string}) => {
  const length = Math.max(left.cost.length, right.cost.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left.cost[index] ?? 0) - (right.cost[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return left.tie < right.tie ? -1 : left.tie > right.tie ? 1 : 0;
};
const pathDominates = (left: {cost: number[]; tie: string}, right: {cost: number[]; tie: string}) => {
  let strictlyBetter = false;
  for (let index = 0; index < Math.max(left.cost.length, right.cost.length); index += 1) {
    const leftValue = left.cost[index] ?? 0;
    const rightValue = right.cost[index] ?? 0;
    if (leftValue > rightValue) return false;
    if (leftValue < rightValue) strictlyBetter = true;
  }
  return strictlyBetter || left.tie <= right.tie;
};
const transitionCost = (from: Candidate, to: Candidate, metrics: Metrics) => {
  let maxTurn = 0;
  let travel = 0;
  for (const chain of CHAINS) {
    const fromSign = from.branchSigns[chain];
    const toSign = to.branchSigns[chain];
    if (fromSign !== 0 && toSign !== 0 && fromSign !== toSign) {
      return {failure: (failure("branch_flip", "important_pose", "A two-bone chain changes signed branch.", null, null, [CHAIN_ROLES[chain].joint]) as {ok: false; error: StickBodySafetyFailure}).error};
    }
    maxTurn = Math.max(maxTurn, Math.abs(wrap(bend(to.points, chain) - bend(from.points, chain))) / 180);
  }
  for (const role of STICK_JOINT_ROLES) travel += distance(from.points[role], to.points[role]) / metrics.standingBodyHeight;
  return {cost: [maxTurn, travel]};
};

const selectImportantSequence = (
  sets: Candidate[][],
  metrics: Metrics,
): {selected: Candidate[]; failure: StickBodySafetyFailure | null} => {
  type Path = {selected: Candidate[]; cost: number[]; tie: string};
  let pathsByCandidate: Path[][] = sets[0].map((candidate) => [{
    selected: [candidate],
    cost: [candidate.staticCost[0], 0, candidate.staticCost[1], candidate.staticCost[2], candidate.staticCost[3], candidate.staticCost[4], 0],
    tie: candidate.bytes,
  }]);
  let firstFailure: StickBodySafetyFailure | null = null;
  for (let poseIndex = 1; poseIndex < sets.length; poseIndex += 1) {
    const nextByCandidate: Path[][] = sets[poseIndex].map(() => []);
    for (let candidateIndex = 0; candidateIndex < sets[poseIndex].length; candidateIndex += 1) {
      const candidate = sets[poseIndex][candidateIndex];
      for (const path of pathsByCandidate.flat()) {
        const prior = path.selected.at(-1)!;
        if (prior.requiresStationaryQualification) {
          const beforePrior = path.selected.at(-2);
          if (!beforePrior || !samePoints(beforePrior.points, prior.points) || !samePoints(prior.points, candidate.points) ||
            !isStrictStationaryRestContext(beforePrior.context) || !isStrictStationaryRestContext(prior.context) ||
            !isStrictStationaryRestContext(candidate.context)) {
            firstFailure ??= (failure("knee_bend", "important_pose", "An interior straight-neutral knee is not identical to both adjacent selected poses.", poseIndex - 1) as {ok: false; error: StickBodySafetyFailure}).error;
            continue;
          }
        }
        const transition = transitionCost(prior, candidate, metrics);
        if (transition.failure) {
          firstFailure ??= {...transition.failure, frameIndex: poseIndex};
          continue;
        }
        const recoverChains = CHAINS.filter((chain) => candidate.context.limbIntents[chain] === "recover");
        if (recoverChains.length > 0) {
          const recoverRoles = recoverChains.flatMap((chain) => [CHAIN_ROLES[chain].joint, CHAIN_ROLES[chain].effector]);
          const before = rmsFromNeutral(metrics, prior.points, recoverRoles);
          const after = rmsFromNeutral(metrics, candidate.points, recoverRoles);
          if (after > 0.06 * metrics.standingBodyHeight && before - after < 0.005 * metrics.standingBodyHeight - 1e-9 * metrics.standingBodyHeight) {
            firstFailure ??= (failure("recovery", "important_pose", "Recovery does not converge toward transported neutral.", poseIndex, poseIndex - 1, recoverRoles) as {ok: false; error: StickBodySafetyFailure}).error;
            continue;
          }
          const supportedRoles = new Set<StickJointRoleV1>(candidate.context.support === "both"
            ? ["leftFoot", "rightFoot"] : candidate.context.support === "left" ? ["leftFoot"] : ["rightFoot"]);
          const movesAway = recoverRoles.filter((role) => !supportedRoles.has(role)).find((role) => distance(candidate.points[role], transportedNeutral(metrics, candidate.points, role)) -
            distance(prior.points[role], transportedNeutral(metrics, prior.points, role)) > 0.02 * metrics.standingBodyHeight + 1e-9 * metrics.standingBodyHeight);
          if (movesAway) {
            firstFailure ??= (failure("recovery", "important_pose", "A recovery role moves farther from rest.", poseIndex, poseIndex - 1, [movesAway]) as {ok: false; error: StickBodySafetyFailure}).error;
            continue;
          }
        }
        const cost = [...path.cost];
        cost[0] += candidate.staticCost[0];
        cost[1] = Math.max(cost[1], transition.cost[0]);
        cost[2] += candidate.staticCost[1];
        cost[3] += candidate.staticCost[2];
        cost[4] = Math.max(cost[4], candidate.staticCost[3]);
        cost[5] += candidate.staticCost[4];
        cost[6] += transition.cost[1];
        const next = {selected: [...path.selected, candidate], cost, tie: `${path.tie}\0${candidate.bytes}`};
        const frontier = nextByCandidate[candidateIndex];
        if (frontier.some((existing) => pathDominates(existing, next))) continue;
        nextByCandidate[candidateIndex] = frontier.filter((existing) => !pathDominates(next, existing));
        nextByCandidate[candidateIndex].push(next);
      }
    }
    pathsByCandidate = nextByCandidate;
    if (pathsByCandidate.every((frontier) => frontier.length === 0)) return {selected: [], failure: firstFailure};
  }
  const paths = pathsByCandidate.flat();
  paths.sort(compareCost);
  return {selected: paths[0]?.selected ?? [], failure: firstFailure};
};

const validateFinalSequence = (
  frames: StickBodySafetyFinalFrameV1[],
  metrics: Metrics,
  intent: StickBodySafetyAnimationIntentV1,
) => {
  const previousSigns: Partial<Record<StickBodySafetyChain, -1 | 1>> = {};
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const endpoint = index === 0 || index === frames.length - 1;
    const stationary = !endpoint && samePoints(frames[index - 1].points, frame.points) && samePoints(frame.points, frames[index + 1].points) &&
      isStrictStationaryRestContext(frames[index - 1].context) && isStrictStationaryRestContext(frame.context) &&
      isStrictStationaryRestContext(frames[index + 1].context);
    const issue = validateFrame(frame.points, frame.context, metrics, "final_frame", frame.frameIndex,
      endpoint ? "endpoint_rest" : stationary ? "stationary_rest" : "none");
    if (issue) return issue;
    const signs = branchSigns(frame.points);
    for (const chain of CHAINS) {
      if (signs[chain] === 0) continue;
      if (previousSigns[chain] !== undefined && previousSigns[chain] !== signs[chain]) {
        return (failure("branch_flip", "final_frame", "A final-frame two-bone branch changes sign.", index, index - 1, [CHAIN_ROLES[chain].joint]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
      previousSigns[chain] = signs[chain] as -1 | 1;
    }
    if (frame.context.path) {
      const {role, start, end, corridorH} = frame.context.path;
      const vector = {x: end.x - start.x, y: end.y - start.y};
      const lengthSquared = vector.x * vector.x + vector.y * vector.y;
      if (lengthSquared <= 0) return (failure("overshoot", "final_frame", "A declared path has coincident endpoints.", index, null, [role]) as {ok: false; error: StickBodySafetyFailure}).error;
      const relative = {x: frame.points[role].x - start.x, y: frame.points[role].y - start.y};
      const projection = (relative.x * vector.x + relative.y * vector.y) / lengthSquared;
      const perpendicular = Math.abs(relative.x * vector.y - relative.y * vector.x) / Math.sqrt(lengthSquared);
      const corridor = (corridorH || 0.12) * metrics.standingBodyHeight;
      if (projection < -0.03 - 1e-9 || projection > 1.03 + 1e-9 || perpendicular > corridor + 1e-9 * metrics.standingBodyHeight) {
        return (failure("overshoot", "final_frame", "A final path sample overshoots its transition corridor.", index, null, [role]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
    if (index === 0) continue;
    const previous = frames[index - 1];
    for (const foot of ["leftFoot", "rightFoot"] as const) {
      const wasSupported = previous.context.support === "both" || previous.context.support === (foot === "leftFoot" ? "left" : "right");
      const isSupported = frame.context.support === "both" || frame.context.support === (foot === "leftFoot" ? "left" : "right");
      const previousAnchor = previous.context.plantedAnchors[foot];
      const currentAnchor = frame.context.plantedAnchors[foot];
      if (wasSupported && isSupported && previousAnchor && currentAnchor &&
        (Math.abs(previousAnchor.x - currentAnchor.x) > 2 || Math.abs(previousAnchor.y - currentAnchor.y) > 2)) {
        return (failure("support_contact", "final_frame", "A continuously supported foot changes its planted anchor without release.", index, index - 1, [foot]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
    const recoverChains = CHAINS.filter((chain) => frame.context.limbIntents[chain] === "recover");
    if (recoverChains.length > 0) {
      const recoverRoles = recoverChains.flatMap((chain) => [CHAIN_ROLES[chain].joint, CHAIN_ROLES[chain].effector]);
      const before = rmsFromNeutral(metrics, previous.points, recoverRoles);
      const after = rmsFromNeutral(metrics, frame.points, recoverRoles);
      if (after > 0.06 * metrics.standingBodyHeight && before - after < 0.005 * metrics.standingBodyHeight - 1e-9 * metrics.standingBodyHeight) {
        return (failure("recovery", "final_frame", "Rounded recovery frames do not converge toward transported neutral.", index, index - 1, recoverRoles) as {ok: false; error: StickBodySafetyFailure}).error;
      }
      const supportedRoles = new Set<StickJointRoleV1>(frame.context.support === "both"
        ? ["leftFoot", "rightFoot"] : frame.context.support === "left" ? ["leftFoot"] : ["rightFoot"]);
      const movesAway = recoverRoles.filter((role) => !supportedRoles.has(role)).find((role) => distance(frame.points[role], transportedNeutral(metrics, frame.points, role)) -
        distance(previous.points[role], transportedNeutral(metrics, previous.points, role)) > 0.02 * metrics.standingBodyHeight + 1e-9 * metrics.standingBodyHeight);
      if (movesAway) {
        return (failure("recovery", "final_frame", "A rounded recovery role moves farther from rest.", index, index - 1, [movesAway]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
    const impact = previous.context.impact || frame.context.impact || previous.context.motionPhase === "contact" || frame.context.motionPhase === "contact";
    for (const role of STICK_JOINT_ROLES) {
      const effector = role === "leftHand" || role === "rightHand" || role === "leftFoot" || role === "rightFoot";
      const cap = (impact ? (effector ? 0.30 : 0.20) : (effector ? 0.18 : 0.12)) * metrics.standingBodyHeight;
      if (distance(previous.points[role], frame.points[role]) > cap + 1e-9 * metrics.standingBodyHeight) {
        return (failure("continuity", "final_frame", "Adjacent final-frame joint travel exceeds its continuity cap.", index, index - 1, [role]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
    for (const chain of CHAINS) {
      const cap = impact ? 55 : 35;
      if (Math.abs(wrap(bend(frame.points, chain) - bend(previous.points, chain))) > cap + 1e-9) {
        return (failure("continuity", "final_frame", "Adjacent bend change exceeds its continuity cap.", index, index - 1, [CHAIN_ROLES[chain].joint]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
    const previousHead = wrap(angle(previous.points.neck, previous.points.head) - angle(previous.points.hip, previous.points.neck));
    const currentHead = wrap(angle(frame.points.neck, frame.points.head) - angle(frame.points.hip, frame.points.neck));
    if (Math.abs(wrap(currentHead - previousHead)) > 8 + 1e-9) {
      return (failure("torso_head", "final_frame", "Adjacent head-to-torso change exceeds 8 degrees.", index, index - 1, ["head", "neck", "hip"]) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  if (intent.loop && frames.length > 1) {
    const first = frames[0].points;
    const last = frames.at(-1)!.points;
    for (const role of STICK_JOINT_ROLES) {
      const effector = role === "leftHand" || role === "rightHand" || role === "leftFoot" || role === "rightFoot";
      const cap = (effector ? 0.10 : 0.06) * metrics.standingBodyHeight;
      if (distance(last[role], first[role]) > cap + 1e-9 * metrics.standingBodyHeight) {
        return (failure("loop_snap", "final_animation", "The declared loop snaps from last frame to first.", null, frames.length - 1, [role]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
    for (const chain of CHAINS) {
      if (Math.abs(wrap(bend(last, chain) - bend(first, chain))) > 25 + 1e-9) {
        return (failure("loop_snap", "final_animation", "The declared loop has an excessive bend snap.", null, frames.length - 1, [CHAIN_ROLES[chain].joint]) as {ok: false; error: StickBodySafetyFailure}).error;
      }
    }
  }
  const landmarks = new Set(frames.flatMap((frame) => frame.context.landmarks));
  const missing = intent.requiredLandmarks.find((landmark) => !landmarks.has(landmark));
  if (missing) return (failure("semantic_continuity", "final_animation", `Requested landmark '${missing}' is absent from final frames.`) as {ok: false; error: StickBodySafetyFailure}).error;
  if (intent.expectedPeakFrames.some((frameIndex, index) => frameIndex <= 0 || frameIndex >= frames.length - 1 ||
    (index > 0 && frameIndex <= intent.expectedPeakFrames[index - 1]))) {
    return (failure("semantic_continuity", "final_animation", "Expected peak frames must be unique increasing interior final frames.") as {ok: false; error: StickBodySafetyFailure}).error;
  }
  if (intent.movementKind === "movement") {
    let maximumTravel = 0;
    for (const role of intent.actingEffectors) {
      for (let left = 0; left < frames.length; left += 1) for (let right = left + 1; right < frames.length; right += 1) {
        maximumTravel = Math.max(maximumTravel, distance(frames[left].points[role], frames[right].points[role]));
      }
    }
    if (maximumTravel < 0.08 * metrics.standingBodyHeight - 1e-9 * metrics.standingBodyHeight) {
      return (failure("semantic_continuity", "final_animation", "The acting effector never travels the minimum 0.08H.", null, null, intent.actingEffectors) as {ok: false; error: StickBodySafetyFailure}).error;
    }
  }
  const peakThreshold = 0.01 * metrics.standingBodyHeight;
  const actualPeakFrames: number[] = [];
  if (intent.actingEffectors.length > 0) {
    const excursion = frames.map((frame) => Math.sqrt(intent.actingEffectors.reduce((sum, role) =>
      sum + distance(frame.points[role], frames[0].points[role]) ** 2, 0) / intent.actingEffectors.length));
    for (let start = 1; start < excursion.length - 1; start += 1) {
      let end = start;
      while (end + 1 < excursion.length - 1 && Math.abs(excursion[end + 1] - excursion[start]) <= 1) end += 1;
      if (excursion[start] - excursion[start - 1] > peakThreshold && excursion[end] - excursion[end + 1] > peakThreshold) {
        actualPeakFrames.push(Math.floor((start + end) / 2));
      }
      start = end;
    }
  }
  if (actualPeakFrames.length !== intent.expectedPeakFrames.length ||
    actualPeakFrames.some((frameIndex, index) => frameIndex !== intent.expectedPeakFrames[index])) {
    return (failure("semantic_continuity", "final_animation", "Geometry-derived acting peaks do not match the declared peak frames.") as {ok: false; error: StickBodySafetyFailure}).error;
  }
  return null;
};

const documentPoints = (document: StickProjectDocumentV1, frameIndex: number): StickBodySafetyPointMap | null => {
  const cell = document.layers[0]?.cells[frameIndex];
  if (cell?.cellType !== "keyframe" || cell.poses.length !== 1) return null;
  return Object.fromEntries(document.rigs[0].joints.map((joint, index) => [joint.role, {
    x: cell.poses[0].points[index].x,
    y: cell.poses[0].points[index].y,
  }])) as StickBodySafetyPointMap;
};

const selectFromParsedRequest = async (
  request: StickBodySafetySelectionRequestV1,
  starterInput: StickProjectDocumentV1,
): Promise<StickBodySafetySelectionResult> => {
  const metricsResult = metricsFromStarter(starterInput);
  if ("reason" in metricsResult) return {ok: false, error: metricsResult};
  const metrics = metricsResult;
  const bindingIssue = await validateSelectionBinding(request, starterInput, metrics);
  if (bindingIssue) return {ok: false, error: bindingIssue};
  const candidateSets: Candidate[][] = [];
  let ikSolutionsEnumerated = 0;
  let wholeBodyCandidatesConsidered = 0;
  for (let index = 0; index < request.importantPoses.length; index += 1) {
    const pose = request.importantPoses[index];
    const result = enumerateImportantCandidates(pose, metrics, index === 0 || index === request.importantPoses.length - 1);
    ikSolutionsEnumerated += result.ikSolutionsEnumerated;
    wholeBodyCandidatesConsidered += result.candidates.length;
    if (result.firstFailure?.reason === "integration_bypass") return {ok: false, error: result.firstFailure};
    if (result.candidates.length === 0) {
      return result.firstFailure
        ? {ok: false, error: result.firstFailure}
        : failure("no_safe_sequence", "important_pose", "No finite two-circle solution exists for an active chain.", pose.frameIndex);
    }
    candidateSets.push(result.candidates);
  }
  const selection = selectImportantSequence(candidateSets, metrics);
  if (selection.selected.length === 0) {
    return selection.failure ? {ok: false, error: selection.failure} : failure("no_safe_sequence", "important_pose", "No complete safe important-pose sequence exists.");
  }
  const requestDigest = await digestCanonical(request);
  const selectedImportantPoses = selection.selected.map((candidate, index) => ({
    frameIndex: request.importantPoses[index].frameIndex,
    points: clonePoints(candidate.points),
    context: cloneCanonical(candidate.context),
    branchSigns: {...candidate.branchSigns},
  }));
  const qualification: StickBodySafetyCheckedSelectionV1["qualification"] = {
    topology: STICK_HUMANOID_TEMPLATE_ID,
    stage: STICK_BODY_SAFETY_STAGE_ID,
    importantPoseCount: request.importantPoses.length,
    ikSolutionsEnumerated,
    wholeBodyCandidatesConsidered,
    standingBodyHeight: metrics.standingBodyHeight,
    groundY: metrics.groundY,
  };
  const digestPayload = {
    contractVersion: STICK_BODY_SAFETY_SELECTION_RESULT_VERSION,
    binding: cloneCanonical(request.binding),
    requestDigest,
    selectedImportantPoses,
    qualification,
  };
  const output: StickBodySafetyCheckedSelectionV1 = {...digestPayload, selectionDigest: await digestCanonical(digestPayload)};
  return {ok: true, value: deepFreeze(cloneCanonical(output))};
};

/** Selects deterministic unrounded important poses without accepting final frames or a candidate document. */
export const selectStickBodySafetyImportantPoses = async (
  requestValue: unknown,
  starterInput: StickProjectDocumentV1,
): Promise<StickBodySafetySelectionResult> => {
  try {
    const request = parseSelectionRequest(requestValue);
    return "reason" in request ? {ok: false, error: request} : await selectFromParsedRequest(request, starterInput);
  } catch {
    return failure("integration_bypass", "integration", "Body-safety selection failed closed on invalid input.");
  }
};

/** Rechecks selection from its original request, then qualifies the rounded document as one frozen unit. */
export const finalizeStickBodySafetyCandidate = async (
  completionValue: unknown,
  starterInput: StickProjectDocumentV1,
): Promise<StickBodySafetyResult> => {
  try {
    const parsedInput = parseCompletionInput(completionValue);
    if ("reason" in parsedInput) return {ok: false, error: parsedInput};
    const reselection = await selectFromParsedRequest(parsedInput.selectionRequest, starterInput);
    if (!reselection.ok) return reselection;
    if (canonicalJson(parsedInput.checkedSelection) !== canonicalJson(reselection.value)) {
      return failure("integration_bypass", "integration", "Checked selection bytes do not match deterministic reselection.");
    }
    if (canonicalJson(parsedInput.animationIntent) !== canonicalJson(parsedInput.selectionRequest.animationIntent)) {
      return failure("integration_bypass", "integration", "Completion intent does not match the selection request intent.");
    }
    const metricsResult = metricsFromStarter(starterInput);
    if ("reason" in metricsResult) return {ok: false, error: metricsResult};
    const metrics = metricsResult;
    for (let index = 0; index < parsedInput.checkedSelection.selectedImportantPoses.length; index += 1) {
      const selected = parsedInput.checkedSelection.selectedImportantPoses[index];
      const final = parsedInput.finalFrames[selected.frameIndex];
      if (!final || !samePoints(roundedPoints(selected.points), final.points) || canonicalJson(selected.context) !== canonicalJson(final.context)) {
        return failure("integration_bypass", "integration", "Selected important poses are not bound to the final rounded frames.", selected.frameIndex);
      }
    }
    const finalIssue = validateFinalSequence(parsedInput.finalFrames, metrics, parsedInput.animationIntent);
    if (finalIssue) return {ok: false, error: finalIssue};
    const documentResult = parseStickProjectDocument(parsedInput.candidateDocument);
    if (!documentResult.ok || documentResult.value.projectId !== parsedInput.selectionRequest.binding.projectId ||
      documentResult.value.documentRevision !== starterInput.documentRevision + 1 || documentResult.value.coordinateSpace.id !== STICK_BODY_SAFETY_STAGE_ID ||
      documentResult.value.rigs[0]?.templateId !== STICK_HUMANOID_TEMPLATE_ID || documentResult.value.layers[0]?.cells.length !== parsedInput.finalFrames.length) {
      return failure("integration_bypass", "integration", "Candidate document identity/topology does not match the safety-qualified sequence.");
    }
    for (let index = 0; index < parsedInput.finalFrames.length; index += 1) {
      const points = documentPoints(documentResult.value, index);
      if (!points || !samePoints(points, parsedInput.finalFrames[index].points)) {
        return failure("integration_bypass", "integration", "Candidate document bytes differ from the qualified final frames.", index);
      }
    }
    const output: StickBodySafetyQualifiedOutputV1 = {
      contractVersion: STICK_BODY_SAFETY_COMPLETION_CONTRACT_VERSION,
      binding: cloneCanonical(parsedInput.selectionRequest.binding),
      requestDigest: parsedInput.checkedSelection.requestDigest,
      selectionDigest: parsedInput.checkedSelection.selectionDigest,
      document: cloneCanonical(documentResult.value),
      selectedImportantPoses: parsedInput.checkedSelection.selectedImportantPoses.map((selected) => ({
        frameIndex: selected.frameIndex,
        points: clonePoints(selected.points),
        branchSigns: {...selected.branchSigns},
      })),
      qualification: {
        topology: STICK_HUMANOID_TEMPLATE_ID,
        stage: STICK_BODY_SAFETY_STAGE_ID,
        importantPoseCount: parsedInput.selectionRequest.importantPoses.length,
        finalFrameCount: parsedInput.finalFrames.length,
        ikSolutionsEnumerated: parsedInput.checkedSelection.qualification.ikSolutionsEnumerated,
        wholeBodyCandidatesConsidered: parsedInput.checkedSelection.qualification.wholeBodyCandidatesConsidered,
        standingBodyHeight: metrics.standingBodyHeight,
        groundY: metrics.groundY,
      },
    };
    return {ok: true, value: deepFreeze(cloneCanonical(output))};
  } catch {
    return failure("integration_bypass", "integration", "Body-safety completion failed closed on invalid input.");
  }
};

// V2 is a safety classifier, never a pose generator or naturalness selector. V1 above
// remains independently testable history; only the V2 completion has Preview authority.
export type StickBodySafetyLimbV2 = {
  movementRole: "active" | "passive_relax" | "passive_balance" | "support" | "recover";
  targetRegion: "none" | {height: "low" | "middle" | "shoulder" | "high"; direction: "forward" | "inward" | "outward" | "center"; reach: "near" | "medium" | "far"};
  limbPlane: "frontal" | "sagittal_near" | "sagittal_far";
  jointGuide: "neutral" | "forward" | "outward" | "toward_hip";
  flexionBand: "extended" | "comfortable" | "folded" | "near_extension_limit" | "near_flexion_limit";
};
type ContactV2 = "leftFoot" | "rightFoot" | "leftHand" | "rightHand" | "hip";
export type StickBodySafetyFrameContextV2 = {
  facing: "front" | "left" | "right";
  supportMode: "grounded" | "airborne";
  supportContacts: Record<ContactV2, StickBodySafetyPoint | null>;
  limbs: Record<StickBodySafetyChain, StickBodySafetyLimbV2>;
  posture: StickBodySafetyPosture;
  motionPhase: StickBodySafetyMotionPhase | "step" | "swing";
  rootGoal: "hold" | "shift_left" | "shift_right" | "rise" | "lower" | "travel";
  torsoLine: "upright" | "toward_action" | "away_from_action" | "compress" | "extend" | "hinge";
  headLine: "follow_torso" | "look_toward_action" | "neutral";
  activePartIds: string[];
  requiredOutcomes: string[];
  forbiddenExtraMovement: string[];
};
export type StickBodySafetyLandmarkV2 = {
  landmarkId: string;
  frameIndex: number;
  kind: "true_key_pose" | "pass_through_guide" | "plane_transition" | "hold" | "contact" | "impact";
  context: StickBodySafetyFrameContextV2;
  candidates: StickBodySafetyPointMap[];
};
export type StickBodySafetyPartV2 = {
  partId: string;
  semanticKind: "effector_reach" | "effector_oscillation" | "posture_change" | "locomotion" | "airborne_transfer" | "facing_change" | "impact" | "recovery" | "hold";
  affectedRoles: StickBodySafetyChain[];
  requiredOutcomeIds: string[];
};
export type StickBodySafetySegmentV2 = {
  fromLandmarkId: string; toLandmarkId: string; activePartIds: string[];
  facingTransition: "hold" | "turn_left" | "turn_right" | "through_front";
  supportTransition: "hold" | "release" | "acquire" | "airborne";
  pathIntent: "natural_arc" | "direct_mechanical" | "ballistic";
  exitIntent: "continue" | "settle" | "return_to_base" | "continue_cycle";
};
export type StickBodySafetySelectionRequestV2 = {
  contractVersion: "stick.body-safety-selection/v2";
  binding: StickBodySafetyBindingV1;
  animationRequestDigest: string;
  basePoseBinding: {sourceFrameId: string; sourceFrameDigest: string; context: StickBodySafetyFrameContextV2};
  frameCount: number; fps: number; motionStyle: "natural_smooth" | "mechanical_robotic" | "mechanical_stepped";
  requestedParts: StickBodySafetyPartV2[];
  landmarks: StickBodySafetyLandmarkV2[];
  segments: StickBodySafetySegmentV2[];
  completion: {kind: "hold_last" | "return_to_base" | "continue_sequence"; continuingPartIds: string[]; outgoingContext: StickBodySafetyFrameContextV2};
};
export type StickBodySafetyQualifiedGraphV2 = {
  contractVersion: "stick.body-safety-selection-result/v2";
  binding: StickBodySafetyBindingV1;
  requestDigest: string;
  animationRequestDigest: string;
  candidates: StickBodySafetyPointMap[][];
  edges: Array<Array<{from: number; to: number}>>;
  ikSolutionsEnumerated: number;
};
export type StickBodySafetyFinalFrameV2 = {
  frameIndex: number;
  sourcePoints: StickBodySafetyPointMap;
  points: StickBodySafetyPointMap;
  context: StickBodySafetyFrameContextV2;
};
export type StickBodySafetyCompletionInputV2 = {
  contractVersion: "stick.body-safety-completion/v2";
  selectionRequest: StickBodySafetySelectionRequestV2;
  qualifiedGraph: StickBodySafetyQualifiedGraphV2;
  selectedIndexes: number[];
  finalFrames: StickBodySafetyFinalFrameV2[];
  candidateDocument: StickProjectDocumentV1;
};
export type StickBodySafetyQualifiedOutputV2 = {
  contractVersion: "stick.body-safety-completion/v2";
  binding: StickBodySafetyBindingV1;
  requestDigest: string;
  animationRequestDigest: string;
  document: StickProjectDocumentV1;
  requiredOwnerPhase: 3 | 4 | 5 | 6 | 7 | null;
};
export type StickBodySafetyResultV2 = {ok: true; value: Readonly<StickBodySafetyQualifiedOutputV2>} | {ok: false; error: StickBodySafetyFailure};
type GraphResultV2 = {ok: true; value: Readonly<StickBodySafetyQualifiedGraphV2>} | {ok: false; error: StickBodySafetyFailure};
const CONTACTS_V2 = ["leftFoot", "rightFoot", "leftHand", "rightHand", "hip"] as const;
const OUTCOMES_V2 = ["reach_apex", "compression_bottom", "support_shift_complete", "wave_inward_apex", "wave_outward_apex", "punch_extension", "push_up_bottom", "jump_anticipation", "takeoff", "flight_apex", "landing_contact", "stride_contact", "stride_pass", "turn_complete", "settled_transition", "base_pose_restored"] as const;
const FORBIDDEN_V2 = ["other_arm_gesture", "clap", "unrequested_wave", "unrequested_hop", "unrequested_head_motion", "foot_lift", "root_travel", "extra_peak", "pre_action", "crab_projection", "neutral_reset"] as const;
const PARTS_V2 = ["effector_reach", "effector_oscillation", "posture_change", "locomotion", "airborne_transfer", "facing_change", "impact", "recovery", "hold"] as const;
const BANDS_V2 = ["extended", "comfortable", "folded", "near_extension_limit", "near_flexion_limit"] as const;
const BAND_LIMITS_V2 = {arm: [[15,60],[45,110],[95,140],[8,20],[140,150]], leg: [[10,35],[25,80],[70,115],[6,14],[115,125]]};
const setOfV2 = (value: unknown, allowed: readonly string[], min = 0, max = allowed.length): value is string[] =>
  denseArray(value) && value.length >= min && value.length <= max && new Set(value).size === value.length && value.every(v => typeof v === "string" && allowed.includes(v));
const slugV2 = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
const issueV2 = (reason: StickBodySafetyFailureReason, stage: StickBodySafetyStage, message: string, frameIndex: number | null = null) =>
  failure(reason, stage, message, frameIndex).error;

const parseContextV2 = (value: unknown): StickBodySafetyFrameContextV2 | null => {
  if (!exactKeys(value, ["facing", "supportMode", "supportContacts", "limbs", "posture", "motionPhase", "rootGoal", "torsoLine", "headLine", "activePartIds", "requiredOutcomes", "forbiddenExtraMovement"]) ||
    !enumValue(value.facing, ["front", "left", "right"]) || !enumValue(value.supportMode, ["grounded", "airborne"]) ||
    !exactKeys(value.supportContacts, CONTACTS_V2) || !exactKeys(value.limbs, CHAINS) || !enumValue(value.posture, POSTURES) ||
    !enumValue(value.motionPhase, [...MOTION_PHASES, "step", "swing"]) || !enumValue(value.rootGoal, ["hold", "shift_left", "shift_right", "rise", "lower", "travel"]) ||
    !enumValue(value.torsoLine, ["upright", "toward_action", "away_from_action", "compress", "extend", "hinge"]) || !enumValue(value.headLine, ["follow_torso", "look_toward_action", "neutral"]) ||
    !denseArray(value.activePartIds) || value.activePartIds.length > 4 || !value.activePartIds.every(slugV2) || new Set(value.activePartIds).size !== value.activePartIds.length ||
    !setOfV2(value.requiredOutcomes, OUTCOMES_V2, 0, 4) || !setOfV2(value.forbiddenExtraMovement, FORBIDDEN_V2, 1)) return null;
  for (const contact of CONTACTS_V2) if (value.supportContacts[contact] !== null && !finitePoint(value.supportContacts[contact])) return null;
  for (const chain of CHAINS) {
    const limb = value.limbs[chain];
    if (!exactKeys(limb, ["movementRole", "targetRegion", "limbPlane", "jointGuide", "flexionBand"]) ||
      !enumValue(limb.movementRole, ["active", "passive_relax", "passive_balance", "support", "recover"]) ||
      !enumValue(limb.limbPlane, ["frontal", "sagittal_near", "sagittal_far"]) || !enumValue(limb.jointGuide, ["neutral", "forward", "outward", "toward_hip"]) ||
      !enumValue(limb.flexionBand, BANDS_V2)) return null;
    if (limb.movementRole === "active") {
      if (!exactKeys(limb.targetRegion, ["height", "direction", "reach"]) || !enumValue(limb.targetRegion.height, ["low", "middle", "shoulder", "high"]) ||
        !enumValue(limb.targetRegion.direction, ["forward", "inward", "outward", "center"]) || !enumValue(limb.targetRegion.reach, ["near", "medium", "far"])) return null;
    } else if (limb.targetRegion !== "none") return null;
  }
  return cloneCanonical(value) as StickBodySafetyFrameContextV2;
};

const parseRequestV2 = (input: unknown): StickBodySafetySelectionRequestV2 | StickBodySafetyFailure => {
  try {
    if (new TextEncoder().encode(canonicalJson(input)).length > 1_048_576) return invalidIntegration("The bounded safety candidate graph is too large.");
  } catch { return invalidIntegration("V2 safety requires finite dense plain JSON data."); }
  if (!exactKeys(input, ["contractVersion", "binding", "animationRequestDigest", "basePoseBinding", "frameCount", "fps", "motionStyle", "requestedParts", "landmarks", "segments", "completion"]) ||
    input.contractVersion !== "stick.body-safety-selection/v2" || !parseBinding(input.binding) || typeof input.animationRequestDigest !== "string" || !isSha256Digest(input.animationRequestDigest) ||
    !Number.isSafeInteger(input.frameCount) || (input.frameCount as number) < 8 || (input.frameCount as number) > 24 || ![12,24].includes(input.fps as number) ||
    !enumValue(input.motionStyle, ["natural_smooth", "mechanical_robotic", "mechanical_stepped"]) ||
    !exactKeys(input.basePoseBinding, ["sourceFrameId", "sourceFrameDigest", "context"]) || typeof input.basePoseBinding.sourceFrameId !== "string" || !UUID.test(input.basePoseBinding.sourceFrameId) ||
    typeof input.basePoseBinding.sourceFrameDigest !== "string" || !isSha256Digest(input.basePoseBinding.sourceFrameDigest) || !parseContextV2(input.basePoseBinding.context)) return invalidIntegration("Invalid bound V2 request fields.");
  if (!denseArray(input.requestedParts) || input.requestedParts.length < 1 || input.requestedParts.length > 8) return invalidIntegration("Invalid requested parts.");
  const partIds: string[] = [];
  for (const part of input.requestedParts) {
    if (!exactKeys(part, ["partId", "semanticKind", "affectedRoles", "requiredOutcomeIds"]) || !slugV2(part.partId) || partIds.includes(part.partId) ||
      !enumValue(part.semanticKind, PARTS_V2) || !setOfV2(part.affectedRoles, CHAINS, 1) || !setOfV2(part.requiredOutcomeIds, OUTCOMES_V2)) return invalidIntegration("Invalid semantic part declaration.");
    partIds.push(part.partId);
  }
  if (!denseArray(input.landmarks) || input.landmarks.length < 2 || input.landmarks.length > 12) return invalidIntegration("Invalid landmark count.");
  const ids: string[] = [];
  for (const landmark of input.landmarks) {
    if (!exactKeys(landmark, ["landmarkId", "frameIndex", "kind", "context", "candidates"]) || !slugV2(landmark.landmarkId) || ids.includes(landmark.landmarkId) ||
      !safeFrameIndex(landmark.frameIndex) || !enumValue(landmark.kind, ["true_key_pose", "pass_through_guide", "plane_transition", "hold", "contact", "impact"]) ||
      !parseContextV2(landmark.context) || !denseArray(landmark.candidates) || landmark.candidates.length < 1 || landmark.candidates.length > 32 ||
      landmark.candidates.some(p => !parsePointMap(p))) return invalidIntegration("Invalid landmark/candidate declaration.");
    ids.push(landmark.landmarkId);
  }
  if (!denseArray(input.segments) || input.segments.length !== ids.length - 1) return issueV2("context_transition", "integration", "Every adjacent landmark needs exactly one transition.");
  for (const s of input.segments) {
    if (!exactKeys(s, ["fromLandmarkId", "toLandmarkId", "activePartIds", "facingTransition", "supportTransition", "pathIntent", "exitIntent"]) ||
      !setOfV2(s.activePartIds, partIds, 0, 4) || !enumValue(s.facingTransition, ["hold", "turn_left", "turn_right", "through_front"]) ||
      !enumValue(s.supportTransition, ["hold", "release", "acquire", "airborne"]) || !enumValue(s.pathIntent, ["natural_arc", "direct_mechanical", "ballistic"]) ||
      !enumValue(s.exitIntent, ["continue", "settle", "return_to_base", "continue_cycle"])) return issueV2("context_transition", "integration", "Invalid declared transition.");
  }
  if (!exactKeys(input.completion, ["kind", "continuingPartIds", "outgoingContext"]) || !enumValue(input.completion.kind, ["hold_last", "return_to_base", "continue_sequence"]) ||
    !setOfV2(input.completion.continuingPartIds, partIds) || !parseContextV2(input.completion.outgoingContext)) return invalidIntegration("Invalid completion declaration.");
  return cloneCanonical(input) as StickBodySafetySelectionRequestV2;
};

const contextIssueV2 = (request: StickBodySafetySelectionRequestV2): StickBodySafetyFailure | null => {
  const first = request.landmarks[0], last = request.landmarks.at(-1)!;
  const bad = (message: string) => issueV2("context_transition", "integration", message);
  if (first.frameIndex !== 0 || last.frameIndex !== request.frameCount - 1 || canonicalJson(request.basePoseBinding.context) !== canonicalJson(first.context) ||
    canonicalJson(request.completion.outgoingContext) !== canonicalJson(last.context)) return bad("Base, final frame and outgoing context must match their exact landmarks.");
  const parts = new Map(request.requestedParts.map(p => [p.partId, p]));
  for (const landmark of request.landmarks) {
    const ctx = landmark.context;
    if (!setOfV2(ctx.activePartIds, [...parts.keys()], 0, 4)) return issueV2("composition_unrequested", "integration", "A landmark names an unrequested part.");
    const affected = new Set(ctx.activePartIds.flatMap(id => parts.get(id)!.affectedRoles));
    for (const chain of CHAINS) {
      const limb = ctx.limbs[chain], end = CHAIN_ROLES[chain].effector as ContactV2;
      if (limb.movementRole === "active" && !affected.has(chain)) return issueV2("composition_unrequested", "integration", "An active chain has no requested part.");
      if (limb.movementRole === "support" && ctx.supportContacts[end] === null) return bad("A support limb has no matching contact declaration.");
      if (limb.flexionBand.startsWith("near_") && limb.movementRole !== "active" &&
        !ctx.activePartIds.some(id => parts.get(id)!.affectedRoles.includes(chain) &&
          parts.get(id)!.requiredOutcomeIds.some(outcome => ctx.requiredOutcomes.includes(outcome)))) {
        return issueV2("flexion_band", "important_pose", "A passive/support near-limit endpoint is not independently required.", landmark.frameIndex);
      }
    }
    if ((ctx.supportMode === "airborne") !== CONTACTS_V2.every(c => ctx.supportContacts[c] === null)) return bad("Support mode and complete contact set disagree.");
    if (landmark.kind === "impact" && !["contact", "landing"].includes(ctx.motionPhase) || landmark.kind === "contact" && !["contact", "landing", "support_transition"].includes(ctx.motionPhase)) return bad("Contact/impact kind and motion phase disagree.");
  }
  for (const part of request.requestedParts) {
    if (!request.landmarks.some(l => l.context.activePartIds.includes(part.partId)) ||
      part.requiredOutcomeIds.some(outcome => !request.landmarks.some(l => l.context.activePartIds.includes(part.partId) && l.context.requiredOutcomes.includes(outcome)))) {
      return issueV2("composition_unrequested", "integration", "A requested part or its required outcome is absent.");
    }
  }
  for (let i = 0; i < request.segments.length; i++) {
    const s = request.segments[i], a = request.landmarks[i], b = request.landmarks[i+1], ac = a.context, bc = b.context;
    if (s.fromLandmarkId !== a.landmarkId || s.toLandmarkId !== b.landmarkId || b.frameIndex <= a.frameIndex) return bad("Transition order does not match adjacent landmarks.");
    const active = [...new Set([...ac.activePartIds, ...bc.activePartIds])].sort();
    if (canonicalJson([...s.activePartIds].sort()) !== canonicalJson(active)) return bad("Transition active parts do not match its endpoints.");
    const turn = ac.facing !== bc.facing;
    if ((s.facingTransition === "hold") === turn || turn && ac.facing !== "front" && bc.facing !== "front" ||
      s.facingTransition === "turn_left" && bc.facing !== "left" || s.facingTransition === "turn_right" && bc.facing !== "right" ||
      s.facingTransition === "through_front" && bc.facing !== "front") return bad("Facing transition is missing, contradictory, or skips front.");
    const released = CONTACTS_V2.filter(c => ac.supportContacts[c] && !bc.supportContacts[c]);
    const acquired = CONTACTS_V2.filter(c => !ac.supportContacts[c] && bc.supportContacts[c]);
    const expected = ac.supportMode === "airborne" || bc.supportMode === "airborne" ? "airborne" : released.length ? "release" : acquired.length ? "acquire" : "hold";
    if (s.supportTransition !== expected || released.length && acquired.length) return bad("Support transition does not describe its actual release/acquisition.");
    for (const c of CONTACTS_V2) if (ac.supportContacts[c] && bc.supportContacts[c] && canonicalJson(ac.supportContacts[c]) !== canonicalJson(bc.supportContacts[c])) return bad("A continuously supported contact changes anchor.");
    if (s.exitIntent === "return_to_base" && i !== request.segments.length-1 || s.exitIntent === "continue_cycle" && request.completion.kind !== "continue_sequence") return bad("Exit intent contradicts completion.");
  }
  const endExit = request.segments.at(-1)!.exitIntent;
  if (request.completion.kind === "return_to_base" && endExit !== "return_to_base" || request.completion.kind === "hold_last" && endExit !== "settle" ||
    request.completion.kind === "continue_sequence" && endExit !== "continue_cycle") return bad("Final exit does not implement the declared completion.");
  if (request.completion.kind === "continue_sequence") {
    if (!request.completion.continuingPartIds.length || canonicalJson([...request.completion.continuingPartIds].sort()) !== canonicalJson([...last.context.activePartIds].sort())) return bad("Continuation loses the outgoing active parts.");
  } else if (request.completion.continuingPartIds.length) return bad("A non-continuing sequence has outgoing active parts.");
  return null;
};

const restExceptionV2 = (points: StickBodySafetyPointMap, context: StickBodySafetyFrameContextV2, chain: StickBodySafetyChain, metrics: Metrics, stationary: boolean) => {
  if (!stationary || !chain.endsWith("Leg") || !["rest", "settle"].includes(context.motionPhase)) return false;
  const limb = context.limbs[chain], {joint, effector} = CHAIN_ROLES[chain], anchor = context.supportContacts[effector as ContactV2];
  if(context.posture!=="neutral"||context.supportMode!=="grounded"||!context.supportContacts.leftFoot||!context.supportContacts.rightFoot||
    context.rootGoal!=="hold"||limb.flexionBand!=="extended"||distance(points.hip,metrics.neutral.hip)>1e-9*metrics.standingBodyHeight||
    (["leftLeg","rightLeg"]as const).some(c=>!["passive_relax","recover"].includes(context.limbs[c].movementRole)))return false;
  return Math.abs(bend(points, chain)) <= 2 + 1e-9 && ["passive_relax", "recover"].includes(limb.movementRole) && limb.jointGuide === "neutral" && anchor !== null &&
    Math.abs(points[effector].x-anchor.x) <= 2 && Math.abs(points[effector].y-anchor.y) <= 2 &&
    distance(points[effector], transportedNeutral(metrics, points, effector)) <= 2 + 1e-9*metrics.standingBodyHeight &&
    distance(points[joint], transportedNeutral(metrics, points, joint)) <= .03*metrics.standingBodyHeight + 1e-9*metrics.standingBodyHeight;
};

const projectionIssueV2 = (points: StickBodySafetyPointMap, context: StickBodySafetyFrameContextV2, metrics: Metrics, stage: "important_pose" | "final_frame", frameIndex: number, stationary: boolean) => {
  const H = metrics.standingBodyHeight, epsilon = 1e-9*H;
  const torso = {x: points.neck.x-points.hip.x, y: points.neck.y-points.hip.y};
  const torsoLength = Math.hypot(torso.x, torso.y);
  const right = {x: -torso.y/torsoLength, y: torso.x/torsoLength};
  for (const chain of CHAINS) {
    const limb = context.limbs[chain], {root, joint, effector} = CHAIN_ROLES[chain], leg = chain.endsWith("Leg");
    const bad = (reason: StickBodySafetyFailureReason, message: string) => ({...issueV2(reason, stage, message, frameIndex), roles: [joint]});
    if ((context.facing === "front") !== (limb.limbPlane === "frontal")) return bad("facing_projection", "Facing and limb projection are incompatible.");
    if (restExceptionV2(points, context, chain, metrics, stationary)) continue;
    const chord = {x: points[effector].x-points[root].x, y: points[effector].y-points[root].y}, chordLength = Math.hypot(chord.x,chord.y);
    const value = Math.abs(bend(points, chain));
    // D-0052: retain the exact zero-chord/tangent failure before band checks or IK normalization.
    if (chordLength <= epsilon || value <= 1e-9) return bad("branch_singularity", "The two-bone chord is zero or tangent.");
    let clearance = 0;
    if (leg || limb.movementRole === "active") {
      if (limb.jointGuide === "neutral" || leg && limb.jointGuide !== "forward") return bad("limb_plane", "An active/flexed chain requires its anatomical guide.");
      let guide: StickBodySafetyPoint;
      if (!leg && limb.jointGuide === "toward_hip") guide = {x: -torso.x/torsoLength, y: -torso.y/torsoLength};
      else {
        const direction = leg ? (context.facing === "front" ? (chain === "leftLeg" ? 1 : -1) : context.facing === "right" ? 1 : -1)
          : limb.jointGuide === "forward" ? (context.facing === "right" ? 1 : context.facing === "left" ? -1 : 0) : chain === "leftArm" ? 1 : -1;
        guide = {x: right.x*direction, y: right.y*direction};
      }
      const d = {x: chord.x/chordLength, y: chord.y/chordLength}, parallel = guide.x*d.x+guide.y*d.y;
      const perpendicular = {x: guide.x-parallel*d.x, y: guide.y-parallel*d.y}, size = Math.hypot(perpendicular.x,perpendicular.y);
      if (size <= 1e-9) return bad("facing_projection", "The guide cannot distinguish chord sides.");
      clearance = ((points[joint].x-points[root].x)*perpendicular.x + (points[joint].y-points[root].y)*perpendicular.y)/size;
    }
    if (value < (leg ? 6 : 8)-1e-9 || value > (leg ? 125 : 150)+1e-9) return bad(leg ? "knee_bend" : "elbow_bend", "The hard flexion corridor is violated.");
    const [minimum, maximum] = BAND_LIMITS_V2[leg ? "leg" : "arm"][BANDS_V2.indexOf(limb.flexionBand)];
    if (value < minimum-1e-9 || value > maximum+1e-9 || limb.flexionBand.startsWith("near_") && !context.requiredOutcomes.length) return bad("flexion_band", "The requested flexion band or near-limit obligation is not satisfied.");
    if (leg || limb.movementRole === "active") {
      if (clearance < -epsilon) return bad("backward_bend", "The joint lies opposite its body-local guide.");
      if (Math.abs(clearance) <= epsilon) return bad("branch_singularity", "The projected joint is singular.");
      if (limb.flexionBand !== "near_extension_limit" && clearance < (leg ? .015 : .01)*H-epsilon) return bad("joint_guide_clearance", "Positive joint-guide clearance is insufficient.");
    }
  }
  return null;
};

const validateFrameV2 = (points: StickBodySafetyPointMap, context: StickBodySafetyFrameContextV2, metrics: Metrics, stage: "important_pose" | "final_frame", frameIndex: number, stationary: boolean): StickBodySafetyFailure | null => {
  const H = metrics.standingBodyHeight, e = 1e-9*H;
  const bad = (reason: StickBodySafetyFailureReason, message: string) => issueV2(reason, stage, message, frameIndex);
  for (const role of STICK_JOINT_ROLES) if (!Number.isFinite(points[role].x) || !Number.isFinite(points[role].y)) return bad("non_finite_geometry", "Non-finite joint geometry.");
  for (const [a,b] of STICK_SEGMENT_ROLE_PAIRS) {
    const length = distance(points[a],points[b]);
    if (length <= e || stage === "final_frame" && length < 2-e || Math.abs(length-metrics.lengths.get(segmentKey(a,b))!) > (stage === "final_frame" ? 2 : 1e-6)+e) return bad("segment_length", "Segment length differs from the bound base.");
  }
  if (STICK_JOINT_ROLES.some(r => points[r].x < 0 || points[r].x > 1919 || points[r].y < 0 || points[r].y > 1079) || points.head.x < 40 || points.head.x > 1879) return bad("stage_bounds", "Joint or derived head lies outside the stage.");
  const projected = projectionIssueV2(points, context, metrics, stage, frameIndex, stationary);
  if (projected) return projected;
  const headAngle = wrap(angle(points.neck,points.head)-angle(points.hip,points.neck));
  if (Math.abs(wrap(angle(points.hip,points.neck)+90)) > (context.posture === "hinge" ? 50 : 30)+1e-9 || Math.abs(headAngle) > 20+1e-9 || points.head.y >= points.neck.y) return bad("torso_head", "Torso/head alignment is unsafe.");
  const line = deriveStickLineHead(points.head);
  for (let i=0; i<STICK_SEGMENT_ROLE_PAIRS.length; i++) {
    const [a,b] = STICK_SEGMENT_ROLE_PAIRS[i];
    if (!["head","neck"].includes(a) && !["head","neck"].includes(b) && (segmentsTouch(points[a],points[b],points.neck,points.head,e) || segmentsTouch(points[a],points[b],line.from,line.to,e))) return bad("torso_head", "A limb crosses the neck or derived head.");
    for (let j=i+1; j<STICK_SEGMENT_ROLE_PAIRS.length; j++) {
      const [c,d] = STICK_SEGMENT_ROLE_PAIRS[j], shared = a===c || a===d ? a : b===c || b===d ? b : null;
      if (shared) {
        const left=points[a===shared?b:a],right=points[c===shared?d:c],root=points[shared];
        if (Math.abs(orientation(root,left,right)) <= e && (left.x-root.x)*(right.x-root.x)+(left.y-root.y)*(right.y-root.y) > e*e) return bad("body_crossing", "Adjacent segments overlap.");
      } else if (segmentsTouch(points[a],points[b],points[c],points[d],e)) return bad("body_crossing", "Non-adjacent segments intersect.");
    }
  }
  for (const hand of ["leftHand","rightHand"] as const) if (pointSegmentDistance(points[hand],points.hip,points.neck) < .03*H-e || distance(points[hand],points.head) < .055*H-e || pointSegmentDistance(points[hand],line.from,line.to) < .055*H-e) return bad("clearance", "Hand clearance is unsafe.");
  const planted = CONTACTS_V2.filter(c => context.supportContacts[c] !== null);
  if ((context.supportMode === "airborne") !== (planted.length === 0)) return bad("support_contact", "Support declarations disagree.");
  for (const role of planted) {
    const anchor = context.supportContacts[role]!;
    if (Math.abs(points[role].x-anchor.x) > 2 || Math.abs(points[role].y-anchor.y) > 2 || Math.abs(points[role].y-metrics.groundY) > 2) return bad("support_contact", "A planted contact does not match ground geometry.");
  }
  if (STICK_JOINT_ROLES.some(r => points[r].y > metrics.groundY+2)) return bad("support_contact", "A joint penetrates ground.");
  const balanceX=(2*points.hip.x+points.neck.x+points.head.x)/4;
  const xs=planted.map(c=>context.supportContacts[c]!.x), margin=(planted.length===1?.16:.12)*H;
  if (planted.length && (balanceX < Math.min(...xs)-margin-e || balanceX > Math.max(...xs)+margin+e)) return bad("balance", "The support balance floor is violated.");
  const supportCenter=planted.length ? (Math.min(...xs)+Math.max(...xs))/2 : balanceX;
  const supportError=balanceX-supportCenter;
  const actingDisplacement = Math.max(0,...CHAINS.filter(c=>context.limbs[c].movementRole==="active").map(c=>distance(points[CHAIN_ROLES[c].effector],transportedNeutral(metrics,points,CHAIN_ROLES[c].effector))));
  for (const chain of CHAINS) {
    const limb=context.limbs[chain],{joint,effector}=CHAIN_ROLES[chain],leg=chain.endsWith("Leg");
    if (limb.movementRole === "passive_relax" && (distance(points[joint],transportedNeutral(metrics,points,joint)) > (leg?.04:.05)*H+e || distance(points[effector],transportedNeutral(metrics,points,effector)) > (leg?.02:.08)*H+e)) return bad("unrequested_motion", "A relaxed limb leaves its transported-base corridor.");
    if (limb.movementRole === "passive_balance") {
      const neutral=transportedNeutral(metrics,points,effector),displacement=distance(points[effector],neutral),dx=points[effector].x-neutral.x;
      if (displacement > .12*H+e || displacement > .6*Math.max(actingDisplacement,distance(points.hip,metrics.neutral.hip))+e ||
        Math.abs(supportError) <= .01*H && displacement > e || supportError > .01*H && dx >= -e || supportError < -.01*H && dx <= e) return bad("balance", "A balance limb is not a proportional opposing correction.");
    }
  }
  if (context.posture !== "lower" && context.posture !== "compress" && points.hip.y-metrics.neutral.hip.y > .05*H+e) return bad("unrequested_motion", "Unrequested root lowering.");
  if(context.limbs.leftArm.movementRole!=="active"&&context.limbs.rightArm.movementRole!=="active"&&
    points.leftElbow.y<points.neck.y+.08*H&&points.rightElbow.y<points.neck.y+.08*H&&
    points.leftHand.y<points.leftElbow.y&&points.rightHand.y<points.rightElbow.y&&
    (points.leftElbow.x-points.neck.x)*(points.rightElbow.x-points.neck.x)<0)return bad("unrequested_motion","An unrequested W-arm pose is forbidden.");
  if (context.headLine !== "look_toward_action" && Math.abs(wrap(headAngle-wrap(angle(metrics.neutral.neck,metrics.neutral.head)-angle(metrics.neutral.hip,metrics.neutral.neck)))) > 8+1e-9) return bad("unrequested_motion", "Unrequested head motion.");
  return null;
};

const transitionIssueV2 = (
  from: StickBodySafetyPointMap, to: StickBodySafetyPointMap,
  a: StickBodySafetyLandmarkV2, b: StickBodySafetyLandmarkV2, metrics: Metrics,
  stage: "important_pose" | "final_frame", frameIndex: number, span: number,
): StickBodySafetyFailure | null => {
  const H=metrics.standingBodyHeight,e=1e-9*H;
  const bad=(reason:StickBodySafetyFailureReason,message:string)=>issueV2(reason,stage,message,frameIndex);
  const impact=a.kind==="impact"||b.kind==="impact"||a.kind==="contact"||b.kind==="contact";
  for(const chain of CHAINS){
    const before=bend(from,chain),after=bend(to,chain),{joint,effector}=CHAIN_ROLES[chain];
    if(Math.abs(before)>2+1e-9&&Math.abs(after)>2+1e-9&&Math.sign(before)!==Math.sign(after)){
      if(a.kind!=="plane_transition"&&b.kind!=="plane_transition")return bad("branch_flip","Undeclared projected branch change.");
      if(a.context.limbs[chain].movementRole!=="active"||b.context.limbs[chain].movementRole!=="active"||
        a.context.supportContacts[effector as ContactV2]||b.context.supportContacts[effector as ContactV2]||
        a.context.limbs[chain].limbPlane===b.context.limbs[chain].limbPlane||impact||b.frameIndex-a.frameIndex<2||
        Math.abs(before)<12-1e-9||Math.abs(before)>30+1e-9||Math.abs(after)<12-1e-9||Math.abs(after)>30+1e-9||
        distance(from[joint],to[joint])>.035*H*span+e||Math.abs(wrap(after-before))>35+1e-9) return bad("projected_branch_transition","Projected transition violates plane, contact, flexion, duration or travel constraints.");
    }
    if(stage==="final_frame"&&Math.abs(wrap(after-before))>(impact?55:35)+1e-9)return bad("continuity","Final bend changes too quickly.");
  }
  const recoveryRoles=CHAINS.filter(c=>b.context.limbs[c].movementRole==="recover").flatMap(c=>[CHAIN_ROLES[c].joint,CHAIN_ROLES[c].effector]);
  if(a.context.facing===b.context.facing&&a.kind!=="plane_transition"&&b.kind!=="plane_transition"&&CHAINS.some(c=>a.context.limbs[c].limbPlane!==b.context.limbs[c].limbPlane))return bad("context_transition","A plane change has no explicit transition landmark.");
  if(recoveryRoles.length){
    const before=rmsFromNeutral(metrics,from,recoveryRoles),after=rmsFromNeutral(metrics,to,recoveryRoles);
    if(after>.06*H&&before-after<.005*H-e||recoveryRoles.some(r=>!b.context.supportContacts[r as ContactV2]&&distance(to[r],transportedNeutral(metrics,to,r))-distance(from[r],transportedNeutral(metrics,from,r))>.02*H+e))return bad("recovery","Recovery moves away from or fails to converge to the bound base.");
  }
  if(stage==="final_frame"){
    for(const role of STICK_JOINT_ROLES){const effector=role.endsWith("Hand")||role.endsWith("Foot"),cap=(impact?(effector?.30:.20):(effector?.18:.12))*H;if(distance(from[role],to[role])>cap+e)return bad("continuity","Final joint travel exceeds the continuity cap.");}
    const headA=wrap(angle(from.neck,from.head)-angle(from.hip,from.neck)),headB=wrap(angle(to.neck,to.head)-angle(to.hip,to.neck));
    if(Math.abs(wrap(headB-headA))>8+1e-9)return bad("torso_head","Final head-to-torso change exceeds eight degrees.");
  }
  return null;
};

const qualifyParsedV2 = async (request: StickBodySafetySelectionRequestV2, starter: StickProjectDocumentV1): Promise<GraphResultV2> => {
  const metrics=metricsFromStarter(starter);
  if("reason" in metrics)return {ok:false,error:metrics};
  if(request.binding.projectId!==starter.projectId||request.binding.baseDocumentRevision!==starter.documentRevision||request.binding.baseDocumentDigest!==await digestCanonical(starter))return failure("integration_bypass","integration","V2 selection does not bind the exact project.");
  const first=starter.layers[0].cells[0];
  if(request.basePoseBinding.sourceFrameId!==first.frameId||request.basePoseBinding.sourceFrameDigest!==await digestCanonical(first))return failure("base_pose_mismatch","integration","The bound source frame differs from the starting frame.");
  const contextIssue=contextIssueV2(request);if(contextIssue)return {ok:false,error:contextIssue};
  const candidateSets:StickBodySafetyPointMap[][]=[];
  const edges:StickBodySafetyQualifiedGraphV2["edges"]=[];
  let ikSolutionsEnumerated=0;
  for(let index=0;index<request.landmarks.length;index++){
    const landmark=request.landmarks[index],stationary=landmark.kind==="hold"||index===0||index===request.landmarks.length-1;
    let earliest:StickBodySafetyFailure|null=null;const safe:StickBodySafetyPointMap[]=[];
    // Active chains come only from the complete semantic role set. There is no caller
    // activeChains switch capable of skipping IK qualification.
    const active=CHAINS.filter(c=>landmark.context.limbs[c].movementRole==="active");
    for(const seed of landmark.candidates){
      const preflight=validateFrameV2(seed,landmark.context,metrics,"important_pose",landmark.frameIndex,stationary);
      if(preflight&&["non_finite_geometry","segment_length","stage_bounds","branch_singularity","facing_projection"].includes(preflight.reason)){earliest??=preflight;continue;}
      let expanded=[clonePoints(seed)];
      for(const chain of active){
        const {root,joint,effector}=CHAIN_ROLES[chain];
        const solutions=enumerateTwoCircle(seed[root],seed[effector],metrics.lengths.get(segmentKey(root,joint))!,metrics.lengths.get(segmentKey(joint,effector))!,1e-9*metrics.standingBodyHeight);
        ikSolutionsEnumerated+=solutions.length;
        if(!solutions.length){earliest??=issueV2(distance(seed[root],seed[effector])<=1e-9*metrics.standingBodyHeight?"branch_singularity":"no_safe_sequence","important_pose","No finite active-chain circle solution.",landmark.frameIndex);expanded=[];break;}
        expanded=expanded.flatMap(p=>solutions.map(j=>({...clonePoints(p),[joint]:{...j}})));
      }
      for(const points of expanded){
        const issue=validateFrameV2(points,landmark.context,metrics,"important_pose",landmark.frameIndex,stationary);
        if(issue){earliest??=issue;continue;}
        if(index===0&&STICK_JOINT_ROLES.some(r=>distance(points[r],metrics.neutral[r])>1e-6)){earliest??=issueV2("base_pose_mismatch","important_pose","Landmark zero is not the exact bound base pose.",0);continue;}
        if(index===request.landmarks.length-1&&request.completion.kind==="return_to_base"&&STICK_JOINT_ROLES.some(r=>distance(points[r],metrics.neutral[r])>2)){earliest??=issueV2("base_pose_mismatch","final_animation","The selected completion does not restore the bound base.",landmark.frameIndex);continue;}
        if(!safe.some(p=>canonicalJson(p)===canonicalJson(points)))safe.push(points);
      }
    }
    if(!safe.length)return {ok:false,error:earliest??issueV2("no_safe_sequence","important_pose","No candidate survives whole-body qualification.",landmark.frameIndex)};
    safe.sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b),"en"));
    candidateSets.push(safe);
    if(index){
      const prior=request.landmarks[index-1],connections:Array<{from:number;to:number}>=[];
      let earliestTransition:StickBodySafetyFailure|null=null;
      candidateSets[index-1].forEach((a,from)=>safe.forEach((b,to)=>{
        const issue=transitionIssueV2(a,b,prior,landmark,metrics,"important_pose",landmark.frameIndex,landmark.frameIndex-prior.frameIndex);
        if(issue){earliestTransition??=issue;return;}
        if(index>1&&CHAINS.some(c=>restExceptionV2(a,prior.context,c,metrics,true))&&(!samePoints(a,b)||!edges[index-2].some(edge=>edge.to===from&&samePoints(candidateSets[index-2][edge.from],a)))){earliestTransition??=issueV2("knee_bend","important_pose","An interior straight knee is not a stationary interval.",prior.frameIndex);return;}
        connections.push({from,to});
      }));
      if(!connections.length)return {ok:false,error:earliestTransition??issueV2("no_safe_sequence","important_pose","No safe adjacent candidate edge.",landmark.frameIndex)};
      edges.push(connections);
    }
  }
  // Keep exactly edges belonging to at least one complete path. Reachability, rather
  // than a local winner or naturalness cost, determines membership.
  let reachable=new Set(candidateSets[0].map((_,i)=>i));
  for(let i=0;i<edges.length;i++){edges[i]=edges[i].filter(e=>reachable.has(e.from));reachable=new Set(edges[i].map(e=>e.to));}
  if(!reachable.size)return failure("no_safe_sequence","important_pose","No complete safe sequence exists.");
  for(let i=edges.length-1;i>=0;i--){edges[i]=edges[i].filter(e=>reachable.has(e.to));reachable=new Set(edges[i].map(e=>e.from));}
  const value:StickBodySafetyQualifiedGraphV2={contractVersion:"stick.body-safety-selection-result/v2",binding:cloneCanonical(request.binding),requestDigest:await digestCanonical(request),animationRequestDigest:request.animationRequestDigest,candidates:candidateSets,edges,ikSolutionsEnumerated};
  return {ok:true,value:deepFreeze(cloneCanonical(value))};
};

/** Qualifies every supplied branch/context before any bake; never selects a natural winner. */
export const qualifyStickBodySafetyCandidateSequencesV2 = async (requestValue: unknown, starterInput: StickProjectDocumentV1): Promise<GraphResultV2> => {
  try {
    const request=parseRequestV2(requestValue);
    if("reason" in request)return {ok:false,error:request};
    return await qualifyParsedV2(request,deepFreeze(cloneCanonical(starterInput)));
  } catch {return failure("integration_bypass","integration","V2 qualification failed closed.");}
};

const ownerPhaseV2 = (request: StickBodySafetySelectionRequestV2): StickBodySafetyQualifiedOutputV2["requiredOwnerPhase"] => {
  let owner:StickBodySafetyQualifiedOutputV2["requiredOwnerPhase"]=null;
  const defer=(phase:3|4|5|6|7)=>{if(owner===null||phase>owner)owner=phase;};
  for(const p of request.requestedParts){
    if(p.semanticKind!=="hold")defer(3);
    if(p.semanticKind==="impact"||p.semanticKind==="airborne_transfer")defer(4);
    if(p.semanticKind==="locomotion"||p.semanticKind==="facing_change")defer(6);
    if(p.semanticKind==="effector_oscillation")defer(7);
  }
  const outcomeOwners:Record<typeof OUTCOMES_V2[number],3|4|6|7|null>={reach_apex:3,compression_bottom:3,support_shift_complete:3,wave_inward_apex:7,wave_outward_apex:7,punch_extension:7,push_up_bottom:7,jump_anticipation:4,takeoff:4,flight_apex:4,landing_contact:4,stride_contact:6,stride_pass:6,turn_complete:6,settled_transition:3,base_pose_restored:null};
  for(const l of request.landmarks){
    if(l.kind!=="hold")defer(3);
    if(l.kind==="contact"||l.kind==="impact"||l.context.supportMode==="airborne"||l.context.supportContacts.leftHand||l.context.supportContacts.rightHand||l.context.supportContacts.hip)defer(4);
    if(["step","swing"].includes(l.context.motionPhase)||l.context.rootGoal==="travel")defer(6);
    for(const outcome of l.context.requiredOutcomes){const phase=outcomeOwners[outcome as typeof OUTCOMES_V2[number]];if(phase)defer(phase);}
  }
  for(const s of request.segments){if(s.supportTransition!=="hold")defer(4);if(s.facingTransition!=="hold")defer(6);if(s.pathIntent!=="natural_arc")defer(5);}
  if(request.motionStyle!=="natural_smooth")defer(5);
  if(request.completion.kind==="continue_sequence")defer(6);
  return owner;
};

/** Recomputes graph, selected path, contexts, rounding and protected project bytes as one unit. */
export const finalizeStickBodySafetyCandidateV2 = async (completionValue: unknown, starterInput: StickProjectDocumentV1): Promise<StickBodySafetyResultV2> => {
  try {
    canonicalJson(completionValue);
    if(!exactKeys(completionValue,["contractVersion","selectionRequest","qualifiedGraph","selectedIndexes","finalFrames","candidateDocument"])||completionValue.contractVersion!=="stick.body-safety-completion/v2")return failure("integration_bypass","integration","Only the closed V2 completion is accepted.");
    const frozen=deepFreeze(cloneCanonical(completionValue)),starter=deepFreeze(cloneCanonical(starterInput));
    const request=parseRequestV2(frozen.selectionRequest);if("reason" in request)return {ok:false,error:request};
    const recomputed=await qualifyParsedV2(request,starter);if(!recomputed.ok)return recomputed;
    if(canonicalJson(frozen.qualifiedGraph)!==canonicalJson(recomputed.value))return failure("integration_bypass","integration","Qualification graph differs from independent recomputation.");
    const indexes=frozen.selectedIndexes;
    if(!denseArray(indexes)||indexes.length!==request.landmarks.length||indexes.some((n,i)=>!Number.isSafeInteger(n)||(n as number)<0||(n as number)>=recomputed.value.candidates[i].length))return failure("integration_bypass","integration","Selected path is outside the qualified graph.");
    const selected=(indexes as number[]).map((n,i)=>recomputed.value.candidates[i][n]);
    if(recomputed.value.edges.some((edges,i)=>!edges.some(e=>e.from===indexes[i]&&e.to===indexes[i+1])))return failure("integration_bypass","integration","Selected path crosses an unqualified edge.");
    const metrics=metricsFromStarter(starter);if("reason" in metrics)return {ok:false,error:metrics};
    if(!denseArray(frozen.finalFrames)||frozen.finalFrames.length!==request.frameCount)return failure("integration_bypass","integration","Final frames do not match the requested count.");
    const frames:StickBodySafetyFinalFrameV2[]=[];
    for(let i=0;i<frozen.finalFrames.length;i++){
      const raw=frozen.finalFrames[i];
      if(!exactKeys(raw,["frameIndex","sourcePoints","points","context"])||raw.frameIndex!==i||!parsePointMap(raw.sourcePoints)||!parsePointMap(raw.points)||!parseContextV2(raw.context))return failure("integration_bypass","integration","Invalid final frame fields.",i);
      const frame=cloneCanonical(raw) as StickBodySafetyFinalFrameV2;
      const ownerIndex=request.landmarks.findLastIndex(l=>l.frameIndex<=i),landmark=request.landmarks[ownerIndex];
      if(canonicalJson(frame.context)!==canonicalJson(landmark.context))return failure("context_transition","final_frame","Final context is not derived from the original landmark sequence.",i);
      if(!samePoints(roundedPoints(frame.sourcePoints),frame.points)||STICK_JOINT_ROLES.some(r=>!Number.isSafeInteger(frame.points[r].x)||!Number.isSafeInteger(frame.points[r].y)))return failure("integration_bypass","final_frame","Final points differ from exact per-axis rounding.",i);
      const endpoint=i===0||i===request.frameCount-1;
      const stationary=endpoint||i>0&&samePoints(frames[i-1].points,frame.points)&&i+1<request.frameCount&&isPlainRecord(frozen.finalFrames[i+1])&&samePoints(frame.points,(frozen.finalFrames[i+1] as StickBodySafetyFinalFrameV2).points);
      const issue=validateFrameV2(frame.sourcePoints,frame.context,metrics,"important_pose",i,stationary)??validateFrameV2(frame.points,frame.context,metrics,"final_frame",i,stationary);
      if(issue)return {ok:false,error:{...issue,stage:"final_frame"}};
      if(i){
        const prevIndex=request.landmarks.findLastIndex(l=>l.frameIndex<=i-1),a=request.landmarks[prevIndex];
        const transition=transitionIssueV2(frames[i-1].points,frame.points,a,landmark,metrics,"final_frame",i,1);
        if(transition)return {ok:false,error:transition};
        if(CHAINS.some(c=>Math.abs(bend(frames[i-1].points,c))>2&&Math.abs(bend(frame.points,c))>2&&Math.sign(bend(frames[i-1].points,c))!==Math.sign(bend(frame.points,c))&&
          (i<2||distance(frames[i-2].points[CHAIN_ROLES[c].joint],frames[i-1].points[CHAIN_ROLES[c].joint])<=1e-9*metrics.standingBodyHeight)))return failure("projected_branch_transition","final_frame","A projected transition has only one moving final-frame step.",i);
      }
      frames.push(frame);
    }
    for(let i=0;i<selected.length;i++)if(!samePoints(frames[request.landmarks[i].frameIndex].points,roundedPoints(selected[i]))||!STICK_JOINT_ROLES.every(r=>distance(frames[request.landmarks[i].frameIndex].sourcePoints[r],selected[i][r])<=1e-6))return failure("integration_bypass","integration","Final important pose differs from the selected candidate.",request.landmarks[i].frameIndex);
    for(let n=1;n<request.landmarks.length;n++){
      const start=request.landmarks[n-1].frameIndex,end=request.landmarks[n].frameIndex;
      for(let i=start+1;i<end;i++)for(const role of STICK_JOINT_ROLES){
        const a=frames[start].points[role],b=frames[end].points[role],p=frames[i].points[role],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
        const t=len>1e-9*metrics.standingBodyHeight?((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len):0;
        const deviation=len>1e-9*metrics.standingBodyHeight?Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/len:distance(p,a);
        if(t<-.03-1e-9||t>1.03+1e-9||deviation>.12*metrics.standingBodyHeight+1e-9*metrics.standingBodyHeight)return failure("overshoot","final_animation","A final path overshoots its declared endpoints or corridor.",i);
      }
    }
    if(request.segments.at(-1)!.exitIntent==="continue_cycle"){
      const a=frames.at(-1)!.points,b=frames[0].points,H=metrics.standingBodyHeight;
      if(STICK_JOINT_ROLES.some(r=>distance(a[r],b[r])>(r.endsWith("Hand")||r.endsWith("Foot")?.10:.06)*H+1e-9*H)||CHAINS.some(c=>Math.abs(wrap(bend(a,c)-bend(b,c)))>25+1e-9))return failure("loop_snap","final_animation","The final-to-first step exceeds the loop closure cap.");
    }
    if(request.completion.kind==="return_to_base"&&STICK_JOINT_ROLES.some(r=>distance(frames.at(-1)!.points[r],roundedPoints(metrics.neutral)[r])>2))return failure("base_pose_mismatch","final_animation","Completion does not restore the exact bound base.");
    const requiredOwnerPhase=ownerPhaseV2(request);
    if(requiredOwnerPhase===null){
      // Phase 2 can complete only a stationary hold. This one condition proves every
      // forbidden extra absent and prevents semantic labels from enabling later motion.
      if(frames.some(f=>!samePoints(f.points,frames[0].points))||request.landmarks.some(l=>canonicalJson(l.context)!==canonicalJson(request.landmarks[0].context)))return failure("forbidden_extra_movement","final_animation","A stationary hold contains movement or a semantic change.");
    }
    const parsed=parseStickProjectDocument(frozen.candidateDocument);
    if(!parsed.ok)return failure("integration_bypass","integration","Candidate is not a valid ordinary project.");
    const document=parsed.value;
    const expected={...cloneCanonical(starter),documentRevision:starter.documentRevision+1,fps:request.fps,layers:[{...cloneCanonical(starter.layers[0]),cells:document.layers[0]?.cells}]};
    if(canonicalJson(document)!==canonicalJson(expected)||document.layers[0].cells.length!==request.frameCount)return failure("integration_bypass","integration","Protected project metadata or requested timing changed.");
    for(let i=0;i<frames.length;i++){
      const cell=document.layers[0].cells[i],points=documentPoints(document,i);
      if(cell.cellType!=="keyframe"||!points||!samePoints(points,frames[i].points)||cell.poses[0].figureId!==starter.figures[0].figureId||cell.poses[0].rigId!==starter.rigs[0].rigId||starter.layers[0].cells[i]&&cell.frameId!==starter.layers[0].cells[i].frameId)return failure("integration_bypass","integration","Document frame, figure, rig or coordinates differ from the checked candidate.",i);
    }
    return {ok:true,value:deepFreeze(cloneCanonical({contractVersion:"stick.body-safety-completion/v2",binding:request.binding,requestDigest:recomputed.value.requestDigest,animationRequestDigest:request.animationRequestDigest,document,requiredOwnerPhase}))};
  } catch {return failure("integration_bypass","integration","V2 finalization failed closed.");}
};
