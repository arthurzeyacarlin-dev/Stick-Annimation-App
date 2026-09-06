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

export type StickBodySafetyFailureReason = typeof STICK_BODY_SAFETY_FAILURE_REASONS[number];
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
