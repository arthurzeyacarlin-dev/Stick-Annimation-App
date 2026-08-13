export const STICK_PROJECT_SCHEMA_VERSION = 1 as const;
export const STICK_PROJECT_TYPE = "stick-figure" as const;
export const STICK_HUMANOID_TEMPLATE_ID = "humanoid-11-v1" as const;
export const STICK_LINE_HEAD_RULE = "line-head-80-v1" as const;
export const STICK_CANONICAL_DOCUMENT_BYTE_LIMIT = 262_144;
export const STICK_MAX_TIMELINE_CELLS = 240;

export const STICK_JOINT_ROLES = [
  "head",
  "neck",
  "hip",
  "leftElbow",
  "leftHand",
  "rightElbow",
  "rightHand",
  "leftKnee",
  "leftFoot",
  "rightKnee",
  "rightFoot",
] as const;

export type StickJointRoleV1 = (typeof STICK_JOINT_ROLES)[number];

export const STICK_SEGMENT_ROLE_PAIRS = [
  ["head", "neck"],
  ["neck", "hip"],
  ["neck", "leftElbow"],
  ["leftElbow", "leftHand"],
  ["neck", "rightElbow"],
  ["rightElbow", "rightHand"],
  ["hip", "leftKnee"],
  ["leftKnee", "leftFoot"],
  ["hip", "rightKnee"],
  ["rightKnee", "rightFoot"],
] as const satisfies readonly (readonly [StickJointRoleV1, StickJointRoleV1])[];

export type StickPointV1 = {
  jointId: string;
  x: number;
  y: number;
};

export type StickJointDefinitionV1 = {
  jointId: string;
  role: StickJointRoleV1;
};

export type StickSegmentDefinitionV1 = {
  segmentId: string;
  fromJointId: string;
  toJointId: string;
};

export type StickRigV1 = {
  rigId: string;
  templateId: typeof STICK_HUMANOID_TEMPLATE_ID;
  joints: StickJointDefinitionV1[];
  segments: StickSegmentDefinitionV1[];
};

export type StickFigureV1 = {
  figureId: string;
  rigId: string;
  label: string;
};

export type StickPoseV1 = {
  poseId: string;
  figureId: string;
  rigId: string;
  points: StickPointV1[];
};

export type StickEmptyCellV1 = {
  frameId: string;
  index: number;
  cellType: "empty";
};

export type StickKeyframeCellV1 = {
  frameId: string;
  index: number;
  cellType: "keyframe";
  poses: StickPoseV1[];
};

export type StickHoldCellV1 = {
  frameId: string;
  index: number;
  cellType: "hold";
  ownerFrameId: string;
};

export type StickTimelineCellV1 = StickEmptyCellV1 | StickKeyframeCellV1 | StickHoldCellV1;

export type StickTimelineLayerV1 = {
  layerId: string;
  name: string;
  cells: StickTimelineCellV1[];
};

export type StickCoordinateSpaceV1 = {
  kind: "stick-integer-stage-v1";
  id: string;
  width: number;
  height: number;
  origin: "top-left";
  xAxis: "right";
  yAxis: "down";
};

export type StickProjectDocumentV1 = {
  schemaVersion: typeof STICK_PROJECT_SCHEMA_VERSION;
  projectType: typeof STICK_PROJECT_TYPE;
  projectId: string;
  documentRevision: number;
  title: string;
  coordinateSpace: StickCoordinateSpaceV1;
  fps: number;
  rigs: StickRigV1[];
  figures: StickFigureV1[];
  layers: StickTimelineLayerV1[];
};

export type StickEditorViewStateV1 = {
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
};

export type StickSetJointActionV1 = {
  actionVersion: 1;
  type: "set-joint";
  targetFrameIndex: number;
  jointRole: StickJointRoleV1;
  point: {x: number; y: number};
};

export type StickHoldPoseThroughActionV1 = {
  actionVersion: 1;
  type: "hold-pose-through";
  targetFrameIndex: number;
};

export type StickInsertBlankKeyframeActionV1 = {
  actionVersion: 1;
  type: "insert-blank-keyframe";
  targetFrameIndex: number;
};

export type StickStartPoseFromPreviousActionV1 = {
  actionVersion: 1;
  type: "start-pose-from-previous";
  targetFrameIndex: number;
  newPoseId: string;
};

export type StickManualActionV1 =
  | StickSetJointActionV1
  | StickHoldPoseThroughActionV1
  | StickInsertBlankKeyframeActionV1
  | StickStartPoseFromPreviousActionV1;

export type StickAnimationContentV1 = {
  contentVersion: 1;
  coordinateSpace: StickCoordinateSpaceV1;
  fps: number;
  rigTemplate: typeof STICK_HUMANOID_TEMPLATE_ID;
  jointRoleOrder: StickJointRoleV1[];
  segmentRolePairs: {from: StickJointRoleV1; to: StickJointRoleV1}[];
  figureLabel: string;
  lineHeadRule: typeof STICK_LINE_HEAD_RULE;
  timeline: Array<
    | {
        index: number;
        cellType: "keyframe";
        pointsByRole: Array<{role: StickJointRoleV1; x: number; y: number}>;
      }
    | {index: number; cellType: "hold"; ownerIndex: number}
  >;
};

export type StickResolvedRenderInputV1 = {
  renderInputVersion: 1;
  displayedFrame: number;
  ownerFrameIndex: number;
  rigTemplate: typeof STICK_HUMANOID_TEMPLATE_ID;
  pointsByRole: Array<{role: StickJointRoleV1; x: number; y: number}>;
  segmentsByRole: Array<{
    from: StickJointRoleV1;
    to: StickJointRoleV1;
    fromPoint: {x: number; y: number};
    toPoint: {x: number; y: number};
  }>;
  lineHead: {
    rule: typeof STICK_LINE_HEAD_RULE;
    styleToken: "normal-body-line";
    from: {x: number; y: number};
    to: {x: number; y: number};
    length: 80;
  };
};

export type StickContractErrorCodeV1 =
  | "invalid_type"
  | "invalid_value"
  | "unknown_field"
  | "missing_field"
  | "unsupported_version"
  | "invalid_identifier"
  | "duplicate_identifier"
  | "dangling_reference"
  | "invalid_topology"
  | "invalid_timeline"
  | "unsafe_size"
  | "non_canonical_string"
  | "non_finite_number"
  | "unsupported_project_state"
  | "content_projection_failed";

export type StickContractErrorV1 = {
  code: StickContractErrorCodeV1;
  path: string;
  message: string;
};

export type StickContractResult<T> =
  | {ok: true; value: T}
  | {ok: false; error: StickContractErrorV1};

class StickContractValidationError extends Error {
  readonly detail: StickContractErrorV1;

  constructor(code: StickContractErrorCodeV1, path: string, message: string) {
    super(message);
    this.name = "StickContractValidationError";
    this.detail = {code, path, message};
  }
}

const fail = (code: StickContractErrorCodeV1, path: string, message: string): never => {
  throw new StickContractValidationError(code, path, message);
};

const capture = <T>(operation: () => T): StickContractResult<T> => {
  try {
    return {ok: true, value: operation()};
  } catch (error) {
    if (error instanceof StickContractValidationError) {
      return {ok: false, error: error.detail};
    }
    throw error;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isWellFormedUtf16 = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const expectDenseArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    return fail("invalid_type", path, "Expected an array.");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return fail("invalid_type", `${path}[${index}]`, "Sparse arrays are not allowed.");
    }
  }
  const extraKeys = Reflect.ownKeys(value).filter((key) => {
    if (key === "length") return false;
    return typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length;
  });
  if (extraKeys.length > 0) {
    return fail("unknown_field", path, "Arrays may contain indexed values only.");
  }
  return value;
};

const expectObject = (value: unknown, keys: readonly string[], path: string): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    return fail("invalid_type", path, "Expected a plain object.");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      return fail("unknown_field", path, "Symbol keys are not allowed.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      return fail("invalid_type", `${path}.${key}`, "Accessors are not allowed.");
    }
    if (!keys.includes(key)) {
      return fail("unknown_field", `${path}.${key}`, `Unknown field ${key}.`);
    }
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return fail("missing_field", `${path}.${key}`, `Missing field ${key}.`);
    }
  }
  return value;
};

const expectLiteral = <T extends string | number>(value: unknown, expected: T, path: string): T => {
  if (value !== expected) {
    const code = path.toLowerCase().includes("version") ? "unsupported_version" : "invalid_value";
    return fail(code, path, `Expected ${JSON.stringify(expected)}.`);
  }
  return expected;
};

const expectCanonicalString = (
  value: unknown,
  path: string,
  options: {minScalars?: number; maxScalars?: number; ascii?: boolean} = {},
) => {
  if (typeof value !== "string") {
    return fail("invalid_type", path, "Expected a string.");
  }
  if (!isWellFormedUtf16(value) || value.normalize("NFC") !== value) {
    return fail("non_canonical_string", path, "String must be well-formed UTF-16 and NFC.");
  }
  if (options.ascii && !/^[\x20-\x7e]*$/.test(value)) {
    return fail("non_canonical_string", path, "String must use printable ASCII.");
  }
  const scalarLength = [...value].length;
  if (scalarLength < (options.minScalars ?? 0) || scalarLength > (options.maxScalars ?? Number.MAX_SAFE_INTEGER)) {
    return fail("unsafe_size", path, "String length is outside the supported range.");
  }
  return value;
};

const expectSafeInteger = (
  value: unknown,
  path: string,
  options: {min?: number; max?: number; allowNegativeZero?: boolean} = {},
) => {
  if (typeof value !== "number") {
    return fail("invalid_type", path, "Expected a number.");
  }
  if (!Number.isFinite(value)) {
    return fail("non_finite_number", path, "Numbers must be finite.");
  }
  if (!Number.isSafeInteger(value)) {
    return fail("invalid_value", path, "Expected a safe integer.");
  }
  if (!options.allowNegativeZero && Object.is(value, -0)) {
    return fail("invalid_value", path, "Negative zero is not canonical for this field.");
  }
  if (value < (options.min ?? Number.MIN_SAFE_INTEGER) || value > (options.max ?? Number.MAX_SAFE_INTEGER)) {
    return fail("invalid_value", path, "Number is outside the supported range.");
  }
  return value;
};

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isLowercaseUuidV4 = (value: unknown): value is string =>
  typeof value === "string" && UUID_V4_PATTERN.test(value);

const expectUuid = (value: unknown, path: string) => {
  if (!isLowercaseUuidV4(value)) {
    return fail("invalid_identifier", path, "Expected a lowercase RFC 4122 UUID v4.");
  }
  return value;
};

const DERIVED_POSE_ID_PATTERN = /^pose_[0-9a-f]{32}$/;

export const isStickPoseId = (value: unknown): value is string =>
  isLowercaseUuidV4(value) || (typeof value === "string" && DERIVED_POSE_ID_PATTERN.test(value));

const expectPoseId = (value: unknown, path: string) => {
  if (!isStickPoseId(value)) {
    return fail("invalid_identifier", path, "Expected a UUID v4 or deterministic V1 pose ID.");
  }
  return value;
};

export const isSha256Digest = (value: unknown): value is string =>
  typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);

const expectJointRole = (value: unknown, path: string): StickJointRoleV1 => {
  if (typeof value !== "string" || !(STICK_JOINT_ROLES as readonly string[]).includes(value)) {
    return fail("invalid_value", path, "Unknown humanoid joint role.");
  }
  return value as StickJointRoleV1;
};

const parseCoordinateSpace = (value: unknown, path: string): StickCoordinateSpaceV1 => {
  const object = expectObject(value, ["kind", "id", "width", "height", "origin", "xAxis", "yAxis"], path);
  return {
    kind: expectLiteral(object.kind, "stick-integer-stage-v1", `${path}.kind`),
    id: expectCanonicalString(object.id, `${path}.id`, {minScalars: 1, maxScalars: 64, ascii: true}),
    width: expectSafeInteger(object.width, `${path}.width`, {min: 1, max: 8192}),
    height: expectSafeInteger(object.height, `${path}.height`, {min: 1, max: 8192}),
    origin: expectLiteral(object.origin, "top-left", `${path}.origin`),
    xAxis: expectLiteral(object.xAxis, "right", `${path}.xAxis`),
    yAxis: expectLiteral(object.yAxis, "down", `${path}.yAxis`),
  };
};

const parseRig = (value: unknown, path: string): StickRigV1 => {
  const object = expectObject(value, ["rigId", "templateId", "joints", "segments"], path);
  const jointValues = expectDenseArray(object.joints, `${path}.joints`);
  const segmentValues = expectDenseArray(object.segments, `${path}.segments`);
  if (jointValues.length !== STICK_JOINT_ROLES.length || segmentValues.length !== STICK_SEGMENT_ROLE_PAIRS.length) {
    return fail("invalid_topology", path, "humanoid-11-v1 requires exactly 11 joints and 10 segments.");
  }
  const joints = jointValues.map((joint, index): StickJointDefinitionV1 => {
    const jointPath = `${path}.joints[${index}]`;
    const entry = expectObject(joint, ["jointId", "role"], jointPath);
    const role = expectJointRole(entry.role, `${jointPath}.role`);
    if (role !== STICK_JOINT_ROLES[index]) {
      return fail("invalid_topology", `${jointPath}.role`, "Joint roles must use the humanoid-11-v1 order.");
    }
    return {jointId: expectUuid(entry.jointId, `${jointPath}.jointId`), role};
  });
  const jointIdByRole = new Map(joints.map((joint) => [joint.role, joint.jointId]));
  const segments = segmentValues.map((segment, index): StickSegmentDefinitionV1 => {
    const segmentPath = `${path}.segments[${index}]`;
    const entry = expectObject(segment, ["segmentId", "fromJointId", "toJointId"], segmentPath);
    const expectedPair = STICK_SEGMENT_ROLE_PAIRS[index];
    const fromJointId = expectUuid(entry.fromJointId, `${segmentPath}.fromJointId`);
    const toJointId = expectUuid(entry.toJointId, `${segmentPath}.toJointId`);
    if (fromJointId !== jointIdByRole.get(expectedPair[0]) || toJointId !== jointIdByRole.get(expectedPair[1])) {
      return fail("invalid_topology", segmentPath, "Segment endpoints must use the humanoid-11-v1 connection order.");
    }
    return {segmentId: expectUuid(entry.segmentId, `${segmentPath}.segmentId`), fromJointId, toJointId};
  });
  return {
    rigId: expectUuid(object.rigId, `${path}.rigId`),
    templateId: expectLiteral(object.templateId, STICK_HUMANOID_TEMPLATE_ID, `${path}.templateId`),
    joints,
    segments,
  };
};

const parseFigure = (value: unknown, path: string): StickFigureV1 => {
  const object = expectObject(value, ["figureId", "rigId", "label"], path);
  return {
    figureId: expectUuid(object.figureId, `${path}.figureId`),
    rigId: expectUuid(object.rigId, `${path}.rigId`),
    label: expectCanonicalString(object.label, `${path}.label`, {minScalars: 1, maxScalars: 80}),
  };
};

const parsePose = (
  value: unknown,
  path: string,
  coordinateSpace: StickCoordinateSpaceV1,
  rig: StickRigV1 | undefined,
  figure: StickFigureV1 | undefined,
): StickPoseV1 => {
  const object = expectObject(value, ["poseId", "figureId", "rigId", "points"], path);
  if (!rig || !figure) {
    return fail("dangling_reference", path, "A pose requires the document's figure and rig.");
  }
  const figureId = expectUuid(object.figureId, `${path}.figureId`);
  const rigId = expectUuid(object.rigId, `${path}.rigId`);
  if (figureId !== figure.figureId || rigId !== rig.rigId) {
    return fail("dangling_reference", path, "Pose figure/rig references do not resolve.");
  }
  const pointValues = expectDenseArray(object.points, `${path}.points`);
  if (pointValues.length !== rig.joints.length) {
    return fail("invalid_topology", `${path}.points`, "A complete pose needs exactly one point per rig joint.");
  }
  const points = pointValues.map((point, index): StickPointV1 => {
    const pointPath = `${path}.points[${index}]`;
    const entry = expectObject(point, ["jointId", "x", "y"], pointPath);
    const jointId = expectUuid(entry.jointId, `${pointPath}.jointId`);
    if (jointId !== rig.joints[index].jointId) {
      return fail("invalid_topology", `${pointPath}.jointId`, "Pose points must follow the rig-joint order.");
    }
    return {
      jointId,
      x: expectSafeInteger(entry.x, `${pointPath}.x`, {min: 0, max: coordinateSpace.width - 1}),
      y: expectSafeInteger(entry.y, `${pointPath}.y`, {min: 0, max: coordinateSpace.height - 1}),
    };
  });
  return {
    poseId: expectPoseId(object.poseId, `${path}.poseId`),
    figureId,
    rigId,
    points,
  };
};

const registerId = (registry: Map<string, string>, id: string, kind: string, path: string) => {
  const existing = registry.get(id);
  if (existing) {
    return fail("duplicate_identifier", path, `Identifier is already used by ${existing}.`);
  }
  registry.set(id, kind);
};

const parseDocument = (value: unknown): StickProjectDocumentV1 => {
  const root = expectObject(
    value,
    ["schemaVersion", "projectType", "projectId", "documentRevision", "title", "coordinateSpace", "fps", "rigs", "figures", "layers"],
    "$",
  );
  const coordinateSpace = parseCoordinateSpace(root.coordinateSpace, "$.coordinateSpace");
  const rigValues = expectDenseArray(root.rigs, "$.rigs");
  const figureValues = expectDenseArray(root.figures, "$.figures");
  const layerValues = expectDenseArray(root.layers, "$.layers");
  if (rigValues.length > 1 || figureValues.length > 1 || rigValues.length !== figureValues.length) {
    return fail("unsafe_size", "$.rigs", "V1 permits zero or one matching rig/figure pair.");
  }
  if (layerValues.length !== 1) {
    return fail("unsafe_size", "$.layers", "V1 requires exactly one layer.");
  }
  const rigs = rigValues.map((entry, index) => parseRig(entry, `$.rigs[${index}]`));
  const figures = figureValues.map((entry, index) => parseFigure(entry, `$.figures[${index}]`));
  if (rigs[0] && figures[0] && figures[0].rigId !== rigs[0].rigId) {
    return fail("dangling_reference", "$.figures[0].rigId", "Figure rig reference does not resolve.");
  }
  const poseLocations: Array<{pose: StickPoseV1; path: string}> = [];
  const layers = layerValues.map((layerValue, layerIndex): StickTimelineLayerV1 => {
    const layerPath = `$.layers[${layerIndex}]`;
    const layer = expectObject(layerValue, ["layerId", "name", "cells"], layerPath);
    const cellValues = expectDenseArray(layer.cells, `${layerPath}.cells`);
    if (cellValues.length < 1 || cellValues.length > STICK_MAX_TIMELINE_CELLS) {
      return fail("unsafe_size", `${layerPath}.cells`, "Timeline cell count is outside V1 safety bounds.");
    }
    const cells = cellValues.map((cellValue, cellIndex): StickTimelineCellV1 => {
      const cellPath = `${layerPath}.cells[${cellIndex}]`;
      if (!isPlainObject(cellValue)) {
        return fail("invalid_type", cellPath, "Expected a timeline cell object.");
      }
      const index = expectSafeInteger(cellValue.index, `${cellPath}.index`, {min: 0, max: STICK_MAX_TIMELINE_CELLS - 1});
      if (index !== cellIndex) {
        return fail("invalid_timeline", `${cellPath}.index`, "Timeline indexes must be contiguous and ordered.");
      }
      if (cellValue.cellType === "empty") {
        const entry = expectObject(cellValue, ["frameId", "index", "cellType"], cellPath);
        return {
          frameId: expectUuid(entry.frameId, `${cellPath}.frameId`),
          index,
          cellType: expectLiteral(entry.cellType, "empty", `${cellPath}.cellType`),
        };
      }
      if (cellValue.cellType === "keyframe") {
        const entry = expectObject(cellValue, ["frameId", "index", "cellType", "poses"], cellPath);
        const poseValues = expectDenseArray(entry.poses, `${cellPath}.poses`);
        if (poseValues.length > 1) {
          return fail("unsafe_size", `${cellPath}.poses`, "V1 permits at most one pose per keyframe.");
        }
        const poses = poseValues.map((poseValue, poseIndex) => {
          const posePath = `${cellPath}.poses[${poseIndex}]`;
          const pose = parsePose(poseValue, posePath, coordinateSpace, rigs[0], figures[0]);
          poseLocations.push({pose, path: posePath});
          return pose;
        });
        return {
          frameId: expectUuid(entry.frameId, `${cellPath}.frameId`),
          index,
          cellType: expectLiteral(entry.cellType, "keyframe", `${cellPath}.cellType`),
          poses,
        };
      }
      if (cellValue.cellType === "hold") {
        const entry = expectObject(cellValue, ["frameId", "index", "cellType", "ownerFrameId"], cellPath);
        return {
          frameId: expectUuid(entry.frameId, `${cellPath}.frameId`),
          index,
          cellType: expectLiteral(entry.cellType, "hold", `${cellPath}.cellType`),
          ownerFrameId: expectUuid(entry.ownerFrameId, `${cellPath}.ownerFrameId`),
        };
      }
      return fail("invalid_value", `${cellPath}.cellType`, "Unknown timeline cell type.");
    });
    return {
      layerId: expectUuid(layer.layerId, `${layerPath}.layerId`),
      name: expectCanonicalString(layer.name, `${layerPath}.name`, {minScalars: 1, maxScalars: 80}),
      cells,
    };
  });
  const document: StickProjectDocumentV1 = {
    schemaVersion: expectLiteral(root.schemaVersion, STICK_PROJECT_SCHEMA_VERSION, "$.schemaVersion"),
    projectType: expectLiteral(root.projectType, STICK_PROJECT_TYPE, "$.projectType"),
    projectId: expectUuid(root.projectId, "$.projectId"),
    documentRevision: expectSafeInteger(root.documentRevision, "$.documentRevision", {min: 0}),
    title: expectCanonicalString(root.title, "$.title", {minScalars: 1, maxScalars: 100}),
    coordinateSpace,
    fps: expectSafeInteger(root.fps, "$.fps", {min: 1, max: 55}),
    rigs,
    figures,
    layers,
  };

  const idRegistry = new Map<string, string>();
  registerId(idRegistry, document.projectId, "project", "$.projectId");
  for (const [rigIndex, rig] of document.rigs.entries()) {
    registerId(idRegistry, rig.rigId, "rig", `$.rigs[${rigIndex}].rigId`);
    for (const [jointIndex, joint] of rig.joints.entries()) {
      registerId(idRegistry, joint.jointId, "joint", `$.rigs[${rigIndex}].joints[${jointIndex}].jointId`);
    }
    for (const [segmentIndex, segment] of rig.segments.entries()) {
      registerId(idRegistry, segment.segmentId, "segment", `$.rigs[${rigIndex}].segments[${segmentIndex}].segmentId`);
    }
  }
  for (const [figureIndex, figure] of document.figures.entries()) {
    registerId(idRegistry, figure.figureId, "figure", `$.figures[${figureIndex}].figureId`);
  }
  for (const [layerIndex, layer] of document.layers.entries()) {
    registerId(idRegistry, layer.layerId, "layer", `$.layers[${layerIndex}].layerId`);
    const frameById = new Map(layer.cells.map((cell) => [cell.frameId, cell]));
    for (const [cellIndex, cell] of layer.cells.entries()) {
      registerId(idRegistry, cell.frameId, "frame", `$.layers[${layerIndex}].cells[${cellIndex}].frameId`);
      if (cell.cellType === "hold") {
        const owner = frameById.get(cell.ownerFrameId);
        if (!owner || owner.cellType !== "keyframe" || owner.index >= cell.index || owner.poses.length !== 1) {
          return fail(
            "invalid_timeline",
            `$.layers[${layerIndex}].cells[${cellIndex}].ownerFrameId`,
            "A hold must reference an earlier posed keyframe in the same layer.",
          );
        }
      }
    }
  }
  for (const {pose, path} of poseLocations) {
    registerId(idRegistry, pose.poseId, "pose", `${path}.poseId`);
  }
  if (document.rigs.length === 0) {
    if (poseLocations.length !== 0 || document.layers[0].cells.some((cell) => cell.cellType === "hold")) {
      return fail("invalid_topology", "$.layers[0].cells", "A document without a rig/figure may contain only empty or blank keyframes.");
    }
  } else if (poseLocations.length === 0) {
    return fail("invalid_topology", "$.layers[0].cells", "A document with a rig/figure requires at least one complete pose.");
  }
  const canonicalByteLength = new TextEncoder().encode(canonicalJson(document)).byteLength;
  if (canonicalByteLength > STICK_CANONICAL_DOCUMENT_BYTE_LIMIT) {
    return fail("unsafe_size", "$", "Canonical document exceeds the V1 byte limit.");
  }
  return document;
};

export const parseStickProjectDocument = (value: unknown): StickContractResult<StickProjectDocumentV1> =>
  capture(() => parseDocument(value));

export const parseStickEditorViewState = (
  value: unknown,
  document: StickProjectDocumentV1,
): StickContractResult<StickEditorViewStateV1> =>
  capture(() => {
    const parsedDocument = parseDocument(document);
    const object = expectObject(value, ["activeLayerId", "currentFrameIndex", "selectedTimelineIndex"], "$view");
    const activeLayerId = expectUuid(object.activeLayerId, "$view.activeLayerId");
    if (activeLayerId !== parsedDocument.layers[0].layerId) {
      return fail("dangling_reference", "$view.activeLayerId", "Active layer does not resolve.");
    }
    const maxIndex = parsedDocument.layers[0].cells.length - 1;
    return {
      activeLayerId,
      currentFrameIndex: expectSafeInteger(object.currentFrameIndex, "$view.currentFrameIndex", {min: 0, max: maxIndex}),
      selectedTimelineIndex: expectSafeInteger(object.selectedTimelineIndex, "$view.selectedTimelineIndex", {min: 0, max: maxIndex}),
    };
  });

const parseManualAction = (value: unknown, allowDerivedPoseId = false): StickManualActionV1 => {
  if (!isPlainObject(value)) {
    return fail("invalid_type", "$action", "Expected a manual action object.");
  }
  if (value.type === "set-joint") {
    const object = expectObject(value, ["actionVersion", "type", "targetFrameIndex", "jointRole", "point"], "$action");
    const point = expectObject(object.point, ["x", "y"], "$action.point");
    return {
      actionVersion: expectLiteral(object.actionVersion, 1, "$action.actionVersion"),
      type: expectLiteral(object.type, "set-joint", "$action.type"),
      targetFrameIndex: expectSafeInteger(object.targetFrameIndex, "$action.targetFrameIndex", {min: 0, max: 239}),
      jointRole: expectJointRole(object.jointRole, "$action.jointRole"),
      point: {
        x: expectSafeInteger(point.x, "$action.point.x", {min: 0, max: 8191}),
        y: expectSafeInteger(point.y, "$action.point.y", {min: 0, max: 8191}),
      },
    };
  }
  if (value.type === "hold-pose-through") {
    const object = expectObject(value, ["actionVersion", "type", "targetFrameIndex"], "$action");
    return {
      actionVersion: expectLiteral(object.actionVersion, 1, "$action.actionVersion"),
      type: expectLiteral(object.type, "hold-pose-through", "$action.type"),
      targetFrameIndex: expectSafeInteger(object.targetFrameIndex, "$action.targetFrameIndex", {min: 0, max: 239}),
    };
  }
  if (value.type === "insert-blank-keyframe") {
    const object = expectObject(value, ["actionVersion", "type", "targetFrameIndex"], "$action");
    return {
      actionVersion: expectLiteral(object.actionVersion, 1, "$action.actionVersion"),
      type: expectLiteral(object.type, "insert-blank-keyframe", "$action.type"),
      targetFrameIndex: expectSafeInteger(object.targetFrameIndex, "$action.targetFrameIndex", {min: 0, max: 239}),
    };
  }
  if (value.type === "start-pose-from-previous") {
    const object = expectObject(value, ["actionVersion", "type", "targetFrameIndex", "newPoseId"], "$action");
    return {
      actionVersion: expectLiteral(object.actionVersion, 1, "$action.actionVersion"),
      type: expectLiteral(object.type, "start-pose-from-previous", "$action.type"),
      targetFrameIndex: expectSafeInteger(object.targetFrameIndex, "$action.targetFrameIndex", {min: 0, max: 239}),
      newPoseId: allowDerivedPoseId
        ? expectPoseId(object.newPoseId, "$action.newPoseId")
        : expectUuid(object.newPoseId, "$action.newPoseId"),
    };
  }
  return fail("invalid_value", "$action.type", "Unsupported manual action.");
};

export const parseStickManualAction = (value: unknown): StickContractResult<StickManualActionV1> =>
  capture(() => parseManualAction(value));

const validateJsonCompatible = (value: unknown, path: string, seen: Set<object>) => {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    expectCanonicalString(value, path);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("non_finite_number", path, "Canonical JSON numbers must be finite.");
    return;
  }
  if (typeof value !== "object") {
    fail("invalid_type", path, "Value is not JSON-compatible.");
  }
  const objectValue = value as object;
  if (seen.has(objectValue)) fail("invalid_type", path, "Cyclic values are not JSON-compatible.");
  seen.add(objectValue);
  if (Array.isArray(value)) {
    const array = expectDenseArray(value, path);
    array.forEach((entry, index) => validateJsonCompatible(entry, `${path}[${index}]`, seen));
  } else {
    if (!isPlainObject(value)) fail("invalid_type", path, "Expected a plain JSON object.");
    const plainValue = value as Record<string, unknown>;
    for (const key of Reflect.ownKeys(plainValue)) {
      if (typeof key !== "string") fail("unknown_field", path, "Symbol keys are not allowed.");
      const stringKey = String(key);
      const descriptor = Object.getOwnPropertyDescriptor(plainValue, stringKey);
      if (!descriptor || !("value" in descriptor)) return fail("invalid_type", `${path}.${stringKey}`, "Accessors are not allowed.");
      expectCanonicalString(stringKey, `${path}.<key>`);
      validateJsonCompatible(descriptor.value, `${path}.${stringKey}`, seen);
    }
  }
  seen.delete(objectValue);
};

const canonicalize = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(Object.is(value, -0) ? 0 : value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
};

export const canonicalJson = (value: unknown) => {
  validateJsonCompatible(value, "$", new Set());
  return canonicalize(value);
};

export const canonicalUtf8 = (value: unknown) => new TextEncoder().encode(canonicalJson(value));

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const requireWebCrypto = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto SHA-256 is unavailable in this runtime.");
  }
  return globalThis.crypto.subtle;
};

export const digestBytes = async (bytes: Uint8Array) => {
  const digest = await requireWebCrypto().digest("SHA-256", bytes as BufferSource);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
};

export const digestCanonical = async (value: unknown) => digestBytes(canonicalUtf8(value));

const DERIVED_ID_DOMAIN = "diamond-animator/stick-ai-content-id/v1";
export const STICK_DERIVED_POSE_SLOTS = ["pose:1", "pose:2"] as const;
export type StickDerivedPoseSlotV1 = (typeof STICK_DERIVED_POSE_SLOTS)[number];

export const buildDerivedPoseIdPreimage = (projectId: string, transactionId: string, slot: StickDerivedPoseSlotV1) => {
  expectUuid(projectId, "$projectId");
  expectUuid(transactionId, "$transactionId");
  if (!(STICK_DERIVED_POSE_SLOTS as readonly string[]).includes(slot) || slot.includes("\0")) {
    return fail("invalid_identifier", "$slot", "Unknown deterministic pose slot.");
  }
  const separator = new Uint8Array([0]);
  const parts = [DERIVED_ID_DOMAIN, projectId, transactionId, slot].map((part) => new TextEncoder().encode(part));
  const length = parts.reduce((total, part) => total + part.byteLength, 0) + 3;
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part, index) => {
    result.set(part, offset);
    offset += part.byteLength;
    if (index < parts.length - 1) {
      result.set(separator, offset);
      offset += 1;
    }
  });
  return result;
};

export const deriveStickPoseId = async (projectId: string, transactionId: string, slot: StickDerivedPoseSlotV1) => {
  const fullDigest = await digestBytes(buildDerivedPoseIdPreimage(projectId, transactionId, slot));
  return `pose_${fullDigest.slice("sha256:".length, "sha256:".length + 32)}`;
};

export const deepFreeze = <T>(value: T, seen = new Set<object>()): T => {
  if (value !== null && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
    }
    Object.freeze(value);
  }
  return value;
};

export const cloneCanonical = <T>(value: T): T => JSON.parse(canonicalJson(value)) as T;

export const STICK_WAVE_FIXED_POINTS = {
  head: {x: 960, y: 240},
  neck: {x: 960, y: 340},
  hip: {x: 960, y: 620},
  leftElbow: {x: 820, y: 460},
  leftHand: {x: 760, y: 580},
  leftKnee: {x: 900, y: 800},
  leftFoot: {x: 840, y: 980},
  rightKnee: {x: 1020, y: 800},
  rightFoot: {x: 1080, y: 980},
} as const;

export const STICK_WAVE_STARTER_POINTS = {
  ...STICK_WAVE_FIXED_POINTS,
  rightElbow: {x: 1100, y: 460},
  rightHand: {x: 1160, y: 580},
} as const;

export const STICK_WAVE_APPLIED_RIGHT_ARM_POINTS = [
  {rightElbow: {x: 1080, y: 360}, rightHand: {x: 1160, y: 260}},
  {rightElbow: {x: 1080, y: 300}, rightHand: {x: 1020, y: 220}},
  {rightElbow: {x: 1120, y: 300}, rightHand: {x: 1280, y: 220}},
] as const;

const waveProfilePoints = (profileIndex: 0 | 1 | 2) => ({
  ...STICK_WAVE_FIXED_POINTS,
  ...STICK_WAVE_APPLIED_RIGHT_ARM_POINTS[profileIndex],
});

const pointsByRole = (document: StickProjectDocumentV1, pose: StickPoseV1) =>
  document.rigs[0].joints.map((joint, index) => ({role: joint.role, x: pose.points[index].x, y: pose.points[index].y}));

export const deriveStickLineHead = (head: {x: number; y: number}) => ({
  rule: STICK_LINE_HEAD_RULE,
  styleToken: "normal-body-line" as const,
  from: {x: head.x - 40, y: head.y},
  to: {x: head.x + 40, y: head.y},
  length: 80 as const,
});

export const resolveStickPoseAtIndex = (
  documentInput: StickProjectDocumentV1,
  index: number,
): StickContractResult<{ownerFrameIndex: number; pose: StickPoseV1}> =>
  capture(() => {
    const document = parseDocument(documentInput);
    const cell = document.layers[0].cells[index];
    if (!cell) fail("invalid_timeline", "$index", "Frame index is outside the timeline.");
    if (cell.cellType === "keyframe" && cell.poses.length === 1) {
      return {ownerFrameIndex: cell.index, pose: cell.poses[0]};
    }
    if (cell.cellType === "hold") {
      const owner = document.layers[0].cells.find((candidate) => candidate.frameId === cell.ownerFrameId);
      if (owner?.cellType === "keyframe" && owner.poses.length === 1) {
        return {ownerFrameIndex: owner.index, pose: owner.poses[0]};
      }
    }
    return fail("invalid_timeline", `$index[${index}]`, "Frame does not resolve a complete pose.");
  });

const matchesRolePoints = (
  document: StickProjectDocumentV1,
  pose: StickPoseV1,
  expected: Partial<Record<StickJointRoleV1, {x: number; y: number}>>,
) => {
  const actual = pointsByRole(document, pose);
  return actual.every((point) => {
    const expectedPoint = expected[point.role];
    return !expectedPoint || (point.x === expectedPoint.x && point.y === expectedPoint.y);
  });
};

const matchesExactWaveProfile = (
  document: StickProjectDocumentV1,
  pose: StickPoseV1,
  profileIndex: 0 | 1 | 2,
) => matchesRolePoints(document, pose, waveProfilePoints(profileIndex));

const isCompleteWaveKeyframe = (
  document: StickProjectDocumentV1,
  index: number,
  profileIndex: 0 | 1 | 2,
) => {
  const cell = document.layers[0].cells[index];
  return cell?.cellType === "keyframe" && cell.poses.length === 1 && matchesExactWaveProfile(document, cell.poses[0], profileIndex);
};

const isEmptyCell = (document: StickProjectDocumentV1, index: number) =>
  document.layers[0].cells[index]?.cellType === "empty";

const isBlankKeyframe = (document: StickProjectDocumentV1, index: number) => {
  const cell = document.layers[0].cells[index];
  return cell?.cellType === "keyframe" && cell.poses.length === 0;
};

const isHoldOwnedBy = (document: StickProjectDocumentV1, index: number, ownerIndex: number) => {
  const cell = document.layers[0].cells[index];
  const owner = document.layers[0].cells[ownerIndex];
  return cell?.cellType === "hold" && owner?.cellType === "keyframe" && cell.ownerFrameId === owner.frameId;
};

const everyIndex = (indexes: readonly number[], predicate: (index: number) => boolean) => indexes.every(predicate);

const hasExactHoldStepState = (document: StickProjectDocumentV1, targetFrameIndex: number) => {
  if (targetFrameIndex === 3) {
    return isCompleteWaveKeyframe(document, 0, 0) && everyIndex([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], (index) => isEmptyCell(document, index));
  }
  if (targetFrameIndex === 7) {
    return isCompleteWaveKeyframe(document, 0, 0) &&
      everyIndex([1, 2, 3], (index) => isHoldOwnedBy(document, index, 0)) &&
      isCompleteWaveKeyframe(document, 4, 1) &&
      everyIndex([5, 6, 7, 8, 9, 10, 11], (index) => isEmptyCell(document, index));
  }
  if (targetFrameIndex === 11) {
    return isCompleteWaveKeyframe(document, 0, 0) &&
      everyIndex([1, 2, 3], (index) => isHoldOwnedBy(document, index, 0)) &&
      isCompleteWaveKeyframe(document, 4, 1) &&
      everyIndex([5, 6, 7], (index) => isHoldOwnedBy(document, index, 4)) &&
      isCompleteWaveKeyframe(document, 8, 2) &&
      everyIndex([9, 10, 11], (index) => isEmptyCell(document, index));
  }
  return false;
};

const hasExactBlankStepState = (document: StickProjectDocumentV1, targetFrameIndex: number) => {
  if (targetFrameIndex === 4) {
    return isCompleteWaveKeyframe(document, 0, 0) &&
      everyIndex([1, 2, 3], (index) => isHoldOwnedBy(document, index, 0)) &&
      everyIndex([4, 5, 6, 7, 8, 9, 10, 11], (index) => isEmptyCell(document, index));
  }
  if (targetFrameIndex === 8) {
    return isCompleteWaveKeyframe(document, 0, 0) &&
      everyIndex([1, 2, 3], (index) => isHoldOwnedBy(document, index, 0)) &&
      isCompleteWaveKeyframe(document, 4, 1) &&
      everyIndex([5, 6, 7], (index) => isHoldOwnedBy(document, index, 4)) &&
      everyIndex([8, 9, 10, 11], (index) => isEmptyCell(document, index));
  }
  return false;
};

const hasExactStartStepState = (document: StickProjectDocumentV1, targetFrameIndex: number) => {
  if (targetFrameIndex === 4) {
    return isCompleteWaveKeyframe(document, 0, 0) &&
      everyIndex([1, 2, 3], (index) => isHoldOwnedBy(document, index, 0)) &&
      isBlankKeyframe(document, 4) &&
      everyIndex([5, 6, 7, 8, 9, 10, 11], (index) => isEmptyCell(document, index));
  }
  if (targetFrameIndex === 8) {
    return isCompleteWaveKeyframe(document, 0, 0) &&
      everyIndex([1, 2, 3], (index) => isHoldOwnedBy(document, index, 0)) &&
      isCompleteWaveKeyframe(document, 4, 1) &&
      everyIndex([5, 6, 7], (index) => isHoldOwnedBy(document, index, 4)) &&
      isBlankKeyframe(document, 8) &&
      everyIndex([9, 10, 11], (index) => isEmptyCell(document, index));
  }
  return false;
};

export const isStickWaveStarter = (documentInput: StickProjectDocumentV1): boolean => {
  const parsed = parseStickProjectDocument(documentInput);
  if (!parsed.ok) return false;
  const document = parsed.value;
  const first = document.layers[0].cells[0];
  return (
    document.documentRevision === 0 &&
    document.title === "Untitled Stick Project" &&
    document.coordinateSpace.id === "stick-stage-1920x1080-v1" &&
    document.coordinateSpace.width === 1920 &&
    document.coordinateSpace.height === 1080 &&
    document.fps === 12 &&
    document.rigs.length === 1 &&
    document.figures.length === 1 &&
    document.figures[0].label === "Stick Figure 1" &&
    document.layers.length === 1 &&
    document.layers[0].cells.length === 12 &&
    first?.cellType === "keyframe" &&
    first.poses.length === 1 &&
    matchesRolePoints(document, first.poses[0], STICK_WAVE_STARTER_POINTS) &&
    document.layers[0].cells.slice(1).every((cell) => cell.cellType === "empty")
  );
};

const mutateManualAction = (document: StickProjectDocumentV1, action: StickManualActionV1) => {
  const layer = document.layers[0];
  const cell = layer.cells[action.targetFrameIndex];
  if (!cell) fail("unsupported_project_state", "$action.targetFrameIndex", "Target frame does not exist.");
  if (action.type === "set-joint") {
    const resolved = resolveStickPoseAtIndex(document, action.targetFrameIndex);
    if (!resolved.ok) return fail("unsupported_project_state", "$action.targetFrameIndex", "Target frame has no editable pose.");
    if (action.point.x >= document.coordinateSpace.width || action.point.y >= document.coordinateSpace.height) {
      fail("invalid_value", "$action.point", "Joint point is outside the document stage.");
    }
    const owner: StickTimelineCellV1 = layer.cells[resolved.value.ownerFrameIndex];
    if (owner.cellType !== "keyframe" || owner.poses.length !== 1) {
      return fail("invalid_timeline", "$action.targetFrameIndex", "Controlling keyframe is invalid.");
    }
    const jointIndex = document.rigs[0].joints.findIndex((joint) => joint.role === action.jointRole);
    owner.poses[0].points[jointIndex] = {
      ...owner.poses[0].points[jointIndex],
      x: action.point.x,
      y: action.point.y,
    };
    return;
  }
  if (action.type === "hold-pose-through") {
    if (!hasExactHoldStepState(document, action.targetFrameIndex)) {
      fail("unsupported_project_state", "$action.targetFrameIndex", "Hold target is not the exact next allowed wave span.");
    }
    const ownerIndex = action.targetFrameIndex === 3 ? 0 : action.targetFrameIndex === 7 ? 4 : 8;
    const owner = layer.cells[ownerIndex];
    if (owner.cellType !== "keyframe" || owner.poses.length !== 1) fail("unsupported_project_state", "$action.targetFrameIndex", "Expected wave owner is missing.");
    for (let index = ownerIndex + 1; index <= action.targetFrameIndex; index += 1) {
      const target = layer.cells[index];
      if (target.cellType !== "empty") fail("unsupported_project_state", `$action.targetFrameIndex[${index}]`, "Hold span contains authored content.");
      layer.cells[index] = {frameId: target.frameId, index: target.index, cellType: "hold", ownerFrameId: owner.frameId};
    }
    return;
  }
  if (action.type === "insert-blank-keyframe") {
    if (!hasExactBlankStepState(document, action.targetFrameIndex)) {
      fail("unsupported_project_state", "$action.targetFrameIndex", "Blank keyframe is not the exact next allowed wave step.");
    }
    layer.cells[action.targetFrameIndex] = {frameId: cell.frameId, index: cell.index, cellType: "keyframe", poses: []};
    return;
  }
  if (!hasExactStartStepState(document, action.targetFrameIndex)) {
    return fail("unsupported_project_state", "$action.targetFrameIndex", "Target is not the exact allowed blank-keyframe progression.");
  }
  if (cell.cellType !== "keyframe" || cell.poses.length !== 0) {
    return fail("unsupported_project_state", "$action.targetFrameIndex", "Target is not a blank keyframe.");
  }
  const previous = resolveStickPoseAtIndex(document, action.targetFrameIndex - 1);
  if (!previous.ok) return fail("unsupported_project_state", "$action.targetFrameIndex", "Previous frame has no complete pose.");
  cell.poses = [{...cloneCanonical(previous.value.pose), poseId: action.newPoseId}];
};

export const applyStickManualActions = (
  documentInput: StickProjectDocumentV1,
  actionInputs: readonly StickManualActionV1[],
  revisionMode: "per-action" | "single" = "per-action",
  poseIdMode: "manual-uuid" | "allow-derived" = "manual-uuid",
): StickContractResult<StickProjectDocumentV1> =>
  capture(() => {
    const document = cloneCanonical(parseDocument(documentInput));
    const actions = actionInputs.map((action) => parseManualAction(action, poseIdMode === "allow-derived"));
    for (const action of actions) {
      mutateManualAction(document, action);
      if (revisionMode === "per-action") document.documentRevision += 1;
    }
    if (revisionMode === "single" && actions.length > 0) document.documentRevision += 1;
    return parseDocument(document);
  });

export const applyStickManualAction = (
  document: StickProjectDocumentV1,
  action: StickManualActionV1,
): StickContractResult<StickProjectDocumentV1> => applyStickManualActions(document, [action], "per-action");

const preservesWaveStarterIdentity = (document: StickProjectDocumentV1, starter: StickProjectDocumentV1) => {
  const first = document.layers[0].cells[0];
  const starterFirst = starter.layers[0].cells[0];
  return (
    document.projectId === starter.projectId &&
    document.title === starter.title &&
    canonicalJson(document.coordinateSpace) === canonicalJson(starter.coordinateSpace) &&
    document.fps === starter.fps &&
    canonicalJson(document.rigs) === canonicalJson(starter.rigs) &&
    canonicalJson(document.figures) === canonicalJson(starter.figures) &&
    document.layers[0].layerId === starter.layers[0].layerId &&
    document.layers[0].name === starter.layers[0].name &&
    canonicalJson(document.layers[0].cells.map((cell) => cell.frameId)) === canonicalJson(starter.layers[0].cells.map((cell) => cell.frameId)) &&
    first?.cellType === "keyframe" &&
    starterFirst?.cellType === "keyframe" &&
    first.poses.length === 1 &&
    starterFirst.poses.length === 1 &&
    first.poses[0].poseId === starterFirst.poses[0].poseId &&
    first.poses[0].figureId === starterFirst.poses[0].figureId &&
    first.poses[0].rigId === starterFirst.poses[0].rigId
  );
};

export const isStickManualWaveApplied = (
  documentInput: StickProjectDocumentV1,
  starterInput: StickProjectDocumentV1,
): boolean => {
  const parsed = parseStickProjectDocument(documentInput);
  const parsedStarter = parseStickProjectDocument(starterInput);
  if (!parsed.ok || !parsedStarter.ok || !isStickWaveStarter(parsedStarter.value)) return false;
  const document = parsed.value;
  const cells = document.layers[0].cells;
  const holdOwners = new Map([
    [1, 0], [2, 0], [3, 0],
    [5, 4], [6, 4], [7, 4],
    [9, 8], [10, 8], [11, 8],
  ]);
  return (
    document.documentRevision > parsedStarter.value.documentRevision &&
    preservesWaveStarterIdentity(document, parsedStarter.value) &&
    cells.length === 12 &&
    isCompleteWaveKeyframe(document, 0, 0) &&
    isCompleteWaveKeyframe(document, 4, 1) &&
    isCompleteWaveKeyframe(document, 8, 2) &&
    cells.filter((cell) => cell.cellType === "keyframe").length === 3 &&
    cells.filter((cell) => cell.cellType === "hold").length === 9 &&
    [...holdOwners].every(([index, ownerIndex]) => {
      const cell = cells[index];
      return cell.cellType === "hold" && cell.ownerFrameId === cells[ownerIndex].frameId;
    })
  );
};

export const projectStickAnimationContent = (
  documentInput: StickProjectDocumentV1,
): StickContractResult<StickAnimationContentV1> =>
  capture(() => {
    const document = parseDocument(documentInput);
    if (document.rigs.length !== 1 || document.figures.length !== 1) {
      return fail("content_projection_failed", "$", "Animation content requires one figure and rig.");
    }
    const timeline: StickAnimationContentV1["timeline"] = document.layers[0].cells.map((cell) => {
      if (cell.cellType === "keyframe" && cell.poses.length === 1) {
        return {index: cell.index, cellType: "keyframe" as const, pointsByRole: pointsByRole(document, cell.poses[0])};
      }
      if (cell.cellType === "hold") {
        const owner = document.layers[0].cells.find((candidate) => candidate.frameId === cell.ownerFrameId);
        if (!owner) return fail("content_projection_failed", "$.layers[0].cells", "Hold owner is missing.");
        return {index: cell.index, cellType: "hold" as const, ownerIndex: owner.index};
      }
      return fail("content_projection_failed", `$.layers[0].cells[${cell.index}]`, "Content projection cannot include empty or blank cells.");
    });
    return {
      contentVersion: 1,
      coordinateSpace: cloneCanonical(document.coordinateSpace),
      fps: document.fps,
      rigTemplate: STICK_HUMANOID_TEMPLATE_ID,
      jointRoleOrder: [...STICK_JOINT_ROLES],
      segmentRolePairs: STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => ({from, to})),
      figureLabel: document.figures[0].label,
      lineHeadRule: STICK_LINE_HEAD_RULE,
      timeline,
    };
  });

export const buildStickResolvedRenderInput = (
  documentInput: StickProjectDocumentV1,
  frameIndex: number,
): StickContractResult<StickResolvedRenderInputV1> =>
  capture(() => {
    const document = parseDocument(documentInput);
    const resolved = resolveStickPoseAtIndex(document, frameIndex);
    if (!resolved.ok) return fail(resolved.error.code, resolved.error.path, resolved.error.message);
    const rolePoints = pointsByRole(document, resolved.value.pose);
    const pointMap = new Map(rolePoints.map((point) => [point.role, {x: point.x, y: point.y}]));
    const head = pointMap.get("head");
    if (!head) return fail("invalid_topology", "$", "Head point is missing.");
    return {
      renderInputVersion: 1,
      displayedFrame: frameIndex + 1,
      ownerFrameIndex: resolved.value.ownerFrameIndex,
      rigTemplate: STICK_HUMANOID_TEMPLATE_ID,
      pointsByRole: rolePoints,
      segmentsByRole: STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => ({
        from,
        to,
        fromPoint: pointMap.get(from)!,
        toPoint: pointMap.get(to)!,
      })),
      lineHead: deriveStickLineHead(head),
    };
  });

export const isStickJointManuallyEditable = (
  document: StickProjectDocumentV1,
  frameIndex: number,
  role: StickJointRoleV1,
) =>
  (STICK_JOINT_ROLES as readonly string[]).includes(role) && resolveStickPoseAtIndex(document, frameIndex).ok;
