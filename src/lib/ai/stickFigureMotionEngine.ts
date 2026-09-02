import {
  assertNoAiOnlyStickRepresentation,
  assertStickTopologyIsFixed,
  parseStickAnimationPlan,
  type StickAiContractResult,
  type StickAnimationCreateKeyPoseCommandV1,
  type StickAnimationPlanV1,
} from "./stickFigureAiContract.ts";
import {
  STICK_JOINT_ROLES,
  cloneCanonical,
  parseStickProjectDocument,
  projectStickAnimationContent,
  type StickJointRoleV1,
  type StickPointV1,
  type StickPoseV1,
  type StickProjectDocumentV1,
  type StickTimelineCellV1,
} from "../stickfigure/stickProjectContract.ts";

export const STICK_PHASE2_MOTION_MATERIALIZER = "phase-2-baked-motion" as const;
export const STICK_PHASE2_INPUT_LENGTH_MIN_RATIO = 0.4;
export const STICK_PHASE2_INPUT_LENGTH_MAX_RATIO = 1.6;
export const STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX = 2;
export const STICK_PHASE2_MAX_HIP_TRAVEL_PX = 480;
export const STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES = 170;
export const STICK_PHASE2_HEAD_EDGE_MARGIN_PX = 40;

type RolePoint = {x: number; y: number};
type RolePointMap = Record<StickJointRoleV1, RolePoint>;

type MotionSegment = {
  parent: StickJointRoleV1;
  child: StickJointRoleV1;
};

/** The fixed parent-first order used for normalization and every in-between rebuild. */
export const STICK_PHASE2_REBUILD_ORDER = [
  {parent: "hip", child: "neck"},
  {parent: "neck", child: "head"},
  {parent: "neck", child: "leftElbow"},
  {parent: "leftElbow", child: "leftHand"},
  {parent: "neck", child: "rightElbow"},
  {parent: "rightElbow", child: "rightHand"},
  {parent: "hip", child: "leftKnee"},
  {parent: "leftKnee", child: "leftFoot"},
  {parent: "hip", child: "rightKnee"},
  {parent: "rightKnee", child: "rightFoot"},
] as const satisfies readonly MotionSegment[];

type MotionError = StickAiContractResult<never>;
const motionFailure = (path: string, message: string): MotionError => ({
  ok: false,
  error: {code: "transaction_failed", path, message},
});

const rolePointsFromPose = (document: StickProjectDocumentV1, pose: StickPoseV1): RolePointMap => {
  const result = {} as RolePointMap;
  document.rigs[0].joints.forEach((joint, index) => {
    result[joint.role] = {x: pose.points[index].x, y: pose.points[index].y};
  });
  return result;
};

const rolePointsFromCommand = (command: StickAnimationCreateKeyPoseCommandV1): RolePointMap => {
  const result = {} as RolePointMap;
  command.joints.forEach((joint) => { result[joint.role] = {x: joint.x, y: joint.y}; });
  return result;
};

const segmentKey = ({parent, child}: MotionSegment) => `${parent}:${child}`;
const lengthBetween = (points: RolePointMap, segment: MotionSegment) => {
  const parent = points[segment.parent];
  const child = points[segment.child];
  return Math.hypot(child.x - parent.x, child.y - parent.y);
};
const angleBetween = (points: RolePointMap, segment: MotionSegment) => {
  const parent = points[segment.parent];
  const child = points[segment.child];
  return Math.atan2(child.y - parent.y, child.x - parent.x);
};

const buildCanonicalLengths = (starter: StickProjectDocumentV1) => {
  const firstCell = starter.layers[0]?.cells[0];
  if (firstCell?.cellType !== "keyframe" || firstCell.poses.length !== 1) {
    return motionFailure("$starter.layers[0].cells[0]", "The built-in starter pose is missing.");
  }
  const starterPoints = rolePointsFromPose(starter, firstCell.poses[0]);
  const lengths = new Map<string, number>();
  for (const segment of STICK_PHASE2_REBUILD_ORDER) {
    const length = lengthBetween(starterPoints, segment);
    if (!Number.isFinite(length) || length <= 0) {
      return motionFailure("$starter.rigs[0]", "The built-in starter contains a zero or invalid segment.");
    }
    lengths.set(segmentKey(segment), length);
  }
  return {ok: true as const, value: lengths};
};

const rebuildRolePoints = (
  hip: RolePoint,
  angles: Map<string, number>,
  canonicalLengths: Map<string, number>,
) => {
  const points = {hip: {x: hip.x, y: hip.y}} as RolePointMap;
  for (const segment of STICK_PHASE2_REBUILD_ORDER) {
    const parent = points[segment.parent];
    const key = segmentKey(segment);
    const angle = angles.get(key);
    const length = canonicalLengths.get(key);
    if (!parent || angle === undefined || length === undefined) {
      return motionFailure("$motion", "The fixed motion tree could not be rebuilt.");
    }
    points[segment.child] = {
      x: parent.x + Math.cos(angle) * length,
      y: parent.y + Math.sin(angle) * length,
    };
  }
  return {ok: true as const, value: points};
};

const roundedRolePoints = (points: RolePointMap): RolePointMap => {
  const result = {} as RolePointMap;
  for (const role of STICK_JOINT_ROLES) result[role] = {x: Math.round(points[role].x), y: Math.round(points[role].y)};
  return result;
};

const pointsAreSafe = (points: RolePointMap, starter: StickProjectDocumentV1) => {
  const maxX = starter.coordinateSpace.width - 1;
  const maxY = starter.coordinateSpace.height - 1;
  for (const role of STICK_JOINT_ROLES) {
    const point = points[role];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > maxX || point.y < 0 || point.y > maxY) {
      return false;
    }
  }
  const head = points.head;
  return head.x >= STICK_PHASE2_HEAD_EDGE_MARGIN_PX && head.x <= maxX - STICK_PHASE2_HEAD_EDGE_MARGIN_PX;
};

type NormalizedImportantPose = {
  frameIndex: number;
  points: RolePointMap;
  hip: RolePoint;
  angles: Map<string, number>;
};

const normalizeImportantPose = (
  command: StickAnimationCreateKeyPoseCommandV1,
  starter: StickProjectDocumentV1,
  canonicalLengths: Map<string, number>,
): StickAiContractResult<NormalizedImportantPose> => {
  const inputPoints = rolePointsFromCommand(command);
  const angles = new Map<string, number>();
  for (const segment of STICK_PHASE2_REBUILD_ORDER) {
    const key = segmentKey(segment);
    const canonicalLength = canonicalLengths.get(key);
    const inputLength = lengthBetween(inputPoints, segment);
    if (!canonicalLength || !Number.isFinite(inputLength) || inputLength <= 0) {
      return motionFailure(`$plan.frame[${command.frameIndex}]`, "An important pose contains a zero or invalid segment.");
    }
    const ratio = inputLength / canonicalLength;
    if (ratio < STICK_PHASE2_INPUT_LENGTH_MIN_RATIO || ratio > STICK_PHASE2_INPUT_LENGTH_MAX_RATIO) {
      return motionFailure(`$plan.frame[${command.frameIndex}]`, "An important-pose segment is outside the 40–160% input bound.");
    }
    angles.set(key, angleBetween(inputPoints, segment));
  }
  const rebuilt = rebuildRolePoints(inputPoints.hip, angles, canonicalLengths);
  if (!rebuilt.ok) return rebuilt;
  if (!pointsAreSafe(rebuilt.value, starter)) {
    return motionFailure(`$plan.frame[${command.frameIndex}]`, "Normalized important-pose geometry is outside the stage or head margin.");
  }
  return {
    ok: true,
    value: {
      frameIndex: command.frameIndex,
      points: roundedRolePoints(rebuilt.value),
      hip: {x: inputPoints.hip.x, y: inputPoints.hip.y},
      angles,
    },
  };
};

const shortestSignedTurn = (from: number, to: number) => {
  const tau = Math.PI * 2;
  let delta = ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
  if (delta === -Math.PI) delta = Math.PI;
  return delta;
};

const sameRolePoints = (left: RolePointMap, right: RolePointMap) =>
  STICK_JOINT_ROLES.every((role) => left[role].x === right[role].x && left[role].y === right[role].y);

const validateImportantPosePair = (
  from: NormalizedImportantPose,
  to: NormalizedImportantPose,
): StickAiContractResult<Map<string, number>> => {
  if (to.frameIndex - from.frameIndex < 2) {
    return motionFailure("$plan.commands", "Adjacent important poses must be at least two frame indexes apart.");
  }
  if (sameRolePoints(from.points, to.points)) {
    return motionFailure("$plan.commands", "Adjacent normalized important poses must differ.");
  }
  if (Math.hypot(to.hip.x - from.hip.x, to.hip.y - from.hip.y) > STICK_PHASE2_MAX_HIP_TRAVEL_PX) {
    return motionFailure("$plan.commands", "Adjacent important poses move the hip farther than 480 pixels.");
  }
  const deltas = new Map<string, number>();
  for (const segment of STICK_PHASE2_REBUILD_ORDER) {
    const key = segmentKey(segment);
    const startAngle = from.angles.get(key);
    const endAngle = to.angles.get(key);
    if (startAngle === undefined || endAngle === undefined) return motionFailure("$motion", "A segment angle is missing.");
    const delta = shortestSignedTurn(startAngle, endAngle);
    const degrees = Math.abs(delta) * 180 / Math.PI;
    if (Math.abs(degrees - 180) < 1e-9) {
      return motionFailure("$plan.commands", "An ambiguous 180-degree segment flip is not allowed.");
    }
    if (degrees > STICK_PHASE2_MAX_SEGMENT_TURN_DEGREES) {
      return motionFailure("$plan.commands", "A segment turn exceeds 170 degrees.");
    }
    deltas.set(key, delta);
  }
  return {ok: true, value: deltas};
};

const smoothstep = (u: number) => 3 * u * u - 2 * u * u * u;

const deriveMotionHex = async (plan: StickAnimationPlanV1, slot: string) => {
  const bytes = new TextEncoder().encode([
    "diamond-animator/spec-0004-phase-2/v1",
    plan.projectId,
    plan.transactionId,
    slot,
  ].join("\0"));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const deriveMotionFrameId = async (plan: StickAnimationPlanV1, frameIndex: number) => {
  const hex = await deriveMotionHex(plan, `frame:${frameIndex}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const deriveMotionPoseId = async (plan: StickAnimationPlanV1, frameIndex: number) =>
  `pose_${(await deriveMotionHex(plan, `pose:${frameIndex}`)).slice(0, 32)}`;

const posePoints = (
  starter: StickProjectDocumentV1,
  points: RolePointMap,
): StickPointV1[] => starter.rigs[0].joints.map((joint) => ({
  jointId: joint.jointId,
  x: points[joint.role].x,
  y: points[joint.role].y,
}));

const segmentLengthsMatch = (
  document: StickProjectDocumentV1,
  pose: StickPoseV1,
  canonicalLengths: Map<string, number>,
) => {
  const points = rolePointsFromPose(document, pose);
  return STICK_PHASE2_REBUILD_ORDER.every((segment) => {
    const canonicalLength = canonicalLengths.get(segmentKey(segment));
    return canonicalLength !== undefined && Math.abs(lengthBetween(points, segment) - canonicalLength) <= STICK_PHASE2_OUTPUT_LENGTH_TOLERANCE_PX;
  });
};

/** Checks ordinary-keyframe ownership without canonicalizing away reference aliasing first. */
export const assertIndependentBakedStickMotion = (document: StickProjectDocumentV1) => {
  const cells = document?.layers?.[0]?.cells;
  if (!Array.isArray(cells) || cells.length === 0) return false;
  const cellObjects = new Set<object>();
  const poseObjects = new Set<object>();
  const pointArrays = new Set<object>();
  const pointObjects = new Set<object>();
  const frameIds = new Set<string>();
  const poseIds = new Set<string>();
  for (const cell of cells) {
    if (cellObjects.has(cell) || cell.cellType !== "keyframe" || cell.poses.length !== 1 || frameIds.has(cell.frameId)) return false;
    cellObjects.add(cell);
    frameIds.add(cell.frameId);
    const pose = cell.poses[0];
    if (poseObjects.has(pose) || pointArrays.has(pose.points) || poseIds.has(pose.poseId)) return false;
    poseObjects.add(pose);
    pointArrays.add(pose.points);
    poseIds.add(pose.poseId);
    if (pose.points.length !== STICK_JOINT_ROLES.length) return false;
    for (const point of pose.points) {
      if (pointObjects.has(point)) return false;
      pointObjects.add(point);
    }
  }
  const parsed = parseStickProjectDocument(document);
  return parsed.ok && assertStickTopologyIsFixed(parsed.value) && assertNoAiOnlyStickRepresentation(parsed.value) &&
    projectStickAnimationContent(parsed.value).ok;
};

/** Materializes a parsed Phase 1 plan as complete independent Phase 2 keyframes. */
export const materializeParsedStickAnimationMotionPlan = async (
  plan: StickAnimationPlanV1,
  starter: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickProjectDocumentV1>> => {
  const timing = plan.commands[0];
  if (timing?.type !== "set_timing") return motionFailure("$plan.commands[0]", "Timing is missing.");
  const canonicalLengthsResult = buildCanonicalLengths(starter);
  if (!canonicalLengthsResult.ok) return canonicalLengthsResult;
  const canonicalLengths = canonicalLengthsResult.value;
  const importantCommands = plan.commands.filter((command): command is StickAnimationCreateKeyPoseCommandV1 => command.type === "create_key_pose");
  if (importantCommands.length === 0 || importantCommands[0].frameIndex !== 0) {
    return motionFailure("$plan.commands", "The first important pose must be at frame zero.");
  }
  const normalized: NormalizedImportantPose[] = [];
  for (const command of importantCommands) {
    const result = normalizeImportantPose(command, starter, canonicalLengths);
    if (!result.ok) return result;
    if (normalized.at(-1) && result.value.frameIndex <= normalized.at(-1)!.frameIndex) {
      return motionFailure("$plan.commands", "Important-pose frame indexes must strictly increase.");
    }
    normalized.push(result.value);
  }

  const framePoints: RolePointMap[] = [];
  for (let poseIndex = 0; poseIndex < normalized.length - 1; poseIndex += 1) {
    const from = normalized[poseIndex];
    const to = normalized[poseIndex + 1];
    const deltasResult = validateImportantPosePair(from, to);
    if (!deltasResult.ok) return deltasResult;
    let hasMeaningfulInterior = false;
    for (let frameIndex = from.frameIndex; frameIndex <= to.frameIndex; frameIndex += 1) {
      if (poseIndex > 0 && frameIndex === from.frameIndex) continue;
      if (frameIndex === from.frameIndex) {
        framePoints[frameIndex] = cloneCanonical(from.points);
        continue;
      }
      if (frameIndex === to.frameIndex) {
        framePoints[frameIndex] = cloneCanonical(to.points);
        continue;
      }
      const u = (frameIndex - from.frameIndex) / (to.frameIndex - from.frameIndex);
      const eased = smoothstep(u);
      const hip = {
        x: from.hip.x + (to.hip.x - from.hip.x) * eased,
        y: from.hip.y + (to.hip.y - from.hip.y) * eased,
      };
      const angles = new Map<string, number>();
      for (const segment of STICK_PHASE2_REBUILD_ORDER) {
        const key = segmentKey(segment);
        angles.set(key, from.angles.get(key)! + deltasResult.value.get(key)! * eased);
      }
      const rebuilt = rebuildRolePoints(hip, angles, canonicalLengths);
      if (!rebuilt.ok) return rebuilt;
      if (!pointsAreSafe(rebuilt.value, starter)) {
        return motionFailure(`$motion.frames[${frameIndex}]`, "An interpolated pose is outside the stage or head margin.");
      }
      const rounded = roundedRolePoints(rebuilt.value);
      framePoints[frameIndex] = rounded;
      if (!sameRolePoints(rounded, from.points) && !sameRolePoints(rounded, to.points)) hasMeaningfulInterior = true;
    }
    if (!hasMeaningfulInterior) {
      return motionFailure("$plan.commands", "A transition has no meaningful interior in-between.");
    }
  }
  const finalPose = normalized.at(-1)!;
  if (normalized.length === 1) framePoints[finalPose.frameIndex] = cloneCanonical(finalPose.points);
  for (let frameIndex = finalPose.frameIndex + 1; frameIndex < timing.totalFrameCount; frameIndex += 1) {
    framePoints[frameIndex] = cloneCanonical(finalPose.points);
  }
  if (framePoints.length !== timing.totalFrameCount ||
    Array.from({length: timing.totalFrameCount}, (_, index) => framePoints[index]).some((points) => !points)) {
    return motionFailure("$motion.frames", "The motion engine did not fill the exact requested timeline.");
  }

  const frameIds = await Promise.all(framePoints.map((_, frameIndex) =>
    starter.layers[0].cells[frameIndex]?.frameId ?? deriveMotionFrameId(plan, frameIndex),
  ));
  const poseIds = await Promise.all(framePoints.map((_, frameIndex) => deriveMotionPoseId(plan, frameIndex)));
  const cells: StickTimelineCellV1[] = framePoints.map((points, index) => ({
    frameId: frameIds[index],
    index,
    cellType: "keyframe",
    poses: [{
      poseId: poseIds[index],
      figureId: starter.figures[0].figureId,
      rigId: starter.rigs[0].rigId,
      points: posePoints(starter, points),
    }],
  }));
  const candidate: StickProjectDocumentV1 = {
    ...cloneCanonical(starter),
    documentRevision: starter.documentRevision + 1,
    fps: timing.fps,
    layers: [{...cloneCanonical(starter.layers[0]), cells}],
  };
  if (!assertIndependentBakedStickMotion(candidate)) {
    return motionFailure("$document", "The motion candidate is not complete independent ordinary Stick data.");
  }
  const parsed = parseStickProjectDocument(candidate);
  if (!parsed.ok) return {ok: false, error: parsed.error};
  for (const cell of parsed.value.layers[0].cells) {
    if (cell.cellType !== "keyframe" || !segmentLengthsMatch(parsed.value, cell.poses[0], canonicalLengths)) {
      return motionFailure("$document", "A baked frame exceeds the two-pixel canonical-length tolerance.");
    }
    if (!pointsAreSafe(rolePointsFromPose(parsed.value, cell.poses[0]), starter)) {
      return motionFailure("$document", "A baked frame is outside the stage or head margin.");
    }
  }
  return {ok: true, value: parsed.value};
};

/** Separately named, hidden Phase 2 entry point. The Phase 1 materializer remains unchanged. */
export const materializeStickAnimationMotionPlan = async (
  value: unknown,
  starter: StickProjectDocumentV1,
): Promise<StickAiContractResult<StickProjectDocumentV1>> => {
  const parsed = await parseStickAnimationPlan(value, starter);
  return parsed.ok ? materializeParsedStickAnimationMotionPlan(parsed.value, starter) : parsed;
};
