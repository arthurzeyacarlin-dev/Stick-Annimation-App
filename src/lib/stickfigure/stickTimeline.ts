import {
  STICK_HUMANOID_TEMPLATE_ID,
  STICK_JOINT_ROLES,
  STICK_PROJECT_SCHEMA_VERSION,
  STICK_PROJECT_TYPE,
  STICK_SEGMENT_ROLE_PAIRS,
  STICK_WAVE_STARTER_POINTS,
  applyStickManualAction,
  cloneCanonical,
  deepFreeze,
  digestCanonical,
  parseStickProjectDocument,
  resolveStickPoseAtIndex,
} from "./stickProjectContract.ts";
import type {
  StickEditorSnapshotV1,
  StickJointRoleV1,
  StickManualActionV1,
  StickPointV1,
  StickProjectDocumentV1,
  StickTimelineCellV1,
  StickWorkspaceBootstrapRootV1,
  StickWorkspaceRootPhase2V1,
} from "./stickProjectContract.ts";
import {
  cloneStickFigureFrameContent,
  createEmptyStickFigureFrameContent,
  isStickFigureFrameContentEmpty,
} from "../../components/workspace/stickfigure/types.ts";
import type {StickFigureFrameContent} from "../../components/workspace/stickfigure/types.ts";

export type StickCompletedJointEditV1 = {
  baseWorkspaceInstanceId: string;
  projectId: string;
  baseRevision: number;
  baseWorkspaceGeneration: number;
  selectedFrameId: string;
  selectedFrameIndex: number;
  controllingFrameId: string;
  controllingFrameIndex: number;
  poseId: string;
  jointId: string;
  jointRole: StickJointRoleV1;
  from: {x: number; y: number};
  to: {x: number; y: number};
  preStateDigest: string;
};

export type StickResolvedTimelinePoseV1 = {
  selectedCell: StickTimelineCellV1;
  controllingCell: Extract<StickTimelineCellV1, {cellType: "keyframe"}>;
  controllingFrameIndex: number;
  pose: Extract<StickTimelineCellV1, {cellType: "keyframe"}>["poses"][number];
  spanStartIndex: number;
  spanEndIndex: number;
};

export type StickDocumentPublicationOperationV1 = {
  operationId: string;
  workspaceInstanceId: string;
  baseProjectId: string;
  baseDocumentRevision: number;
  baseDocumentDigest: string;
  baseWorkspaceGeneration: number;
  candidateSnapshot: StickEditorSnapshotV1;
  lockCreator: boolean;
};

export const newStickUuid = () => globalThis.crypto.randomUUID().toLowerCase();

export const createStickWaveStarterV1 = (
  idFactory: () => string = newStickUuid,
): StickProjectDocumentV1 => {
  const projectId = idFactory();
  const rigId = idFactory();
  const figureId = idFactory();
  const layerId = idFactory();
  const jointIds = STICK_JOINT_ROLES.map(() => idFactory());
  const frameIds = Array.from({length: 12}, () => idFactory());
  const poseId = idFactory();
  const joints = STICK_JOINT_ROLES.map((role, index) => ({jointId: jointIds[index], role}));
  const points: StickPointV1[] = STICK_JOINT_ROLES.map((role, index) => ({
    jointId: jointIds[index],
    x: STICK_WAVE_STARTER_POINTS[role].x,
    y: STICK_WAVE_STARTER_POINTS[role].y,
  }));
  const roleIndex = new Map(STICK_JOINT_ROLES.map((role, index) => [role, index]));
  const document: StickProjectDocumentV1 = {
    schemaVersion: STICK_PROJECT_SCHEMA_VERSION,
    projectType: STICK_PROJECT_TYPE,
    projectId,
    documentRevision: 0,
    title: "Untitled Stick Project",
    coordinateSpace: {
      kind: "stick-integer-stage-v1",
      id: "stick-stage-1920x1080-v1",
      width: 1920,
      height: 1080,
      origin: "top-left",
      xAxis: "right",
      yAxis: "down",
    },
    fps: 12,
    rigs: [{
      rigId,
      templateId: STICK_HUMANOID_TEMPLATE_ID,
      joints,
      segments: STICK_SEGMENT_ROLE_PAIRS.map(([from, to]) => ({
        segmentId: idFactory(),
        fromJointId: jointIds[roleIndex.get(from)!],
        toJointId: jointIds[roleIndex.get(to)!],
      })),
    }],
    figures: [{figureId, rigId, label: "Stick Figure 1"}],
    layers: [{
      layerId,
      name: "Layer 1",
      cells: frameIds.map((frameId, index): StickTimelineCellV1 => index === 0
        ? {frameId, index, cellType: "keyframe", poses: [{poseId, figureId, rigId, points}]}
        : {frameId, index, cellType: "empty"}),
    }],
  };
  const parsed = parseStickProjectDocument(document);
  if (!parsed.ok) throw new Error(`Built-in Stick starter is invalid: ${parsed.error.message}`);
  return parsed.value;
};

export const resolveStickTimelinePose = (
  document: StickProjectDocumentV1,
  selectedFrameIndex: number,
): StickResolvedTimelinePoseV1 | null => {
  const selectedCell = document.layers[0]?.cells[selectedFrameIndex];
  if (!selectedCell) return null;
  const resolved = resolveStickPoseAtIndex(document, selectedFrameIndex);
  if (!resolved.ok) return null;
  const controllingCell = document.layers[0].cells[resolved.value.ownerFrameIndex];
  if (controllingCell.cellType !== "keyframe" || controllingCell.poses.length !== 1) return null;
  let spanEndIndex = controllingCell.index;
  while (spanEndIndex + 1 < document.layers[0].cells.length) {
    const next = document.layers[0].cells[spanEndIndex + 1];
    if (next.cellType !== "hold" || next.ownerFrameId !== controllingCell.frameId) break;
    spanEndIndex += 1;
  }
  return {
    selectedCell,
    controllingCell,
    controllingFrameIndex: controllingCell.index,
    pose: resolved.value.pose,
    spanStartIndex: controllingCell.index,
    spanEndIndex,
  };
};

export const applyStickTimelineAction = (
  document: StickProjectDocumentV1,
  action: StickManualActionV1,
): StickProjectDocumentV1 | null => {
  const result = applyStickManualAction(document, action);
  return result.ok ? result.value : null;
};

export const applyCompletedStickJointEdit = (
  root: StickWorkspaceRootPhase2V1,
  edit: StickCompletedJointEditV1,
): StickProjectDocumentV1 | null => {
  if (root.rootStatus !== "mounted" || root.documentPublication.status !== "ready") return null;
  const current = root.editorRoot.current;
  const document = current.snapshot.document;
  if (
    root.workspaceInstanceId !== edit.baseWorkspaceInstanceId ||
    root.workspaceGeneration !== edit.baseWorkspaceGeneration ||
    document.projectId !== edit.projectId ||
    document.documentRevision !== edit.baseRevision ||
    current.documentDigest !== edit.preStateDigest ||
    root.documentPublication.currentDocumentDigest !== edit.preStateDigest
  ) return null;
  const selected = document.layers[0].cells[edit.selectedFrameIndex];
  const resolved = resolveStickTimelinePose(document, edit.selectedFrameIndex);
  const point = resolved?.pose.points.find((candidate) => candidate.jointId === edit.jointId);
  if (
    !selected || selected.frameId !== edit.selectedFrameId || !resolved ||
    resolved.controllingFrameIndex !== edit.controllingFrameIndex ||
    resolved.controllingCell.frameId !== edit.controllingFrameId ||
    resolved.pose.poseId !== edit.poseId || !point ||
    point.x !== edit.from.x || point.y !== edit.from.y ||
    (edit.from.x === edit.to.x && edit.from.y === edit.to.y)
  ) return null;
  return applyStickTimelineAction(document, {
    actionVersion: 1,
    type: "set-joint",
    targetFrameIndex: edit.selectedFrameIndex,
    jointRole: edit.jointRole,
    point: edit.to,
  });
};

export const createStickBootstrapRoot = (
  document: StickProjectDocumentV1,
  source: "new" | "fixture",
  savedBaseline: "none" | "candidate_document",
  operationId = newStickUuid(),
  workspaceInstanceId = newStickUuid(),
): StickWorkspaceBootstrapRootV1 => {
  if (source === "new" && savedBaseline !== "none") throw new Error("New Stick bootstrap cannot carry a saved baseline.");
  return {
    rootStatus: "bootstrapping",
    bootstrapSource: source,
    bootstrapSavedBaseline: savedBaseline,
    workspaceInstanceId,
    editorRoot: null,
    workspaceGeneration: 0,
    documentPublication: {
      status: "pending",
      operationId,
      candidateProjectId: document.projectId,
      candidateDocumentRevision: document.documentRevision,
    },
    lastSavedDocumentDigest: null,
    creatorEntryLocked: source === "fixture",
  };
};

export const completeStickBootstrap = (
  root: StickWorkspaceBootstrapRootV1,
  candidate: StickProjectDocumentV1,
  operationId: string,
  digest: string,
): StickWorkspaceRootPhase2V1 => {
  if (
    root.documentPublication.status !== "pending" ||
    root.documentPublication.operationId !== operationId ||
    root.documentPublication.candidateProjectId !== candidate.projectId ||
    root.documentPublication.candidateDocumentRevision !== candidate.documentRevision
  ) return root;
  const snapshot = deepFreeze({
    document: cloneCanonical(candidate),
    viewState: {activeLayerId: candidate.layers[0].layerId, currentFrameIndex: 0, selectedTimelineIndex: 0},
  });
  return {
    rootStatus: "mounted",
    workspaceInstanceId: root.workspaceInstanceId,
    editorRoot: {current: {snapshot, documentDigest: digest}},
    workspaceGeneration: root.bootstrapSource === "new" ? 0 : 1,
    documentPublication: {
      status: "ready",
      operationId: null,
      projectId: candidate.projectId,
      documentRevision: candidate.documentRevision,
      currentDocumentDigest: digest,
    },
    lastSavedDocumentDigest: root.bootstrapSavedBaseline === "candidate_document" ? digest : null,
    creatorEntryLocked: root.creatorEntryLocked,
  };
};

export const failStickBootstrap = (
  root: StickWorkspaceBootstrapRootV1,
  operationId: string,
): StickWorkspaceBootstrapRootV1 => root.documentPublication.status === "pending" && root.documentPublication.operationId === operationId
  ? {...root, documentPublication: {...root.documentPublication, status: "failed", errorCode: "document_digest_failed"}}
  : root;

export const beginStickDocumentPublication = (
  root: StickWorkspaceRootPhase2V1,
  candidateSnapshotInput: StickEditorSnapshotV1,
  operationId = newStickUuid(),
  lockCreator = true,
): {root: StickWorkspaceRootPhase2V1; operation: StickDocumentPublicationOperationV1 | null} => {
  if (root.rootStatus !== "mounted" || root.documentPublication.status !== "ready") return {root, operation: null};
  const current = root.editorRoot.current;
  const candidateSnapshot = deepFreeze(cloneCanonical(candidateSnapshotInput));
  const operation = deepFreeze({
    operationId,
    workspaceInstanceId: root.workspaceInstanceId,
    baseProjectId: current.snapshot.document.projectId,
    baseDocumentRevision: current.snapshot.document.documentRevision,
    baseDocumentDigest: current.documentDigest,
    baseWorkspaceGeneration: root.workspaceGeneration,
    candidateSnapshot,
    lockCreator,
  });
  return {
    root: {
      ...root,
      documentPublication: {
        status: "pending",
        operationId,
        baseProjectId: operation.baseProjectId,
        baseDocumentRevision: operation.baseDocumentRevision,
        baseDocumentDigest: operation.baseDocumentDigest,
        baseWorkspaceGeneration: operation.baseWorkspaceGeneration,
        candidateProjectId: candidateSnapshot.document.projectId,
        candidateDocumentRevision: candidateSnapshot.document.documentRevision,
      },
    },
    operation,
  };
};

const publicationMatches = (
  root: StickWorkspaceRootPhase2V1,
  operation: StickDocumentPublicationOperationV1,
) => root.rootStatus === "mounted" && root.documentPublication.status === "pending" &&
  root.workspaceInstanceId === operation.workspaceInstanceId &&
  root.documentPublication.operationId === operation.operationId &&
  root.documentPublication.baseProjectId === operation.baseProjectId &&
  root.documentPublication.baseDocumentRevision === operation.baseDocumentRevision &&
  root.documentPublication.baseDocumentDigest === operation.baseDocumentDigest &&
  root.documentPublication.baseWorkspaceGeneration === operation.baseWorkspaceGeneration &&
  root.editorRoot.current.snapshot.document.projectId === operation.baseProjectId &&
  root.editorRoot.current.snapshot.document.documentRevision === operation.baseDocumentRevision &&
  root.editorRoot.current.documentDigest === operation.baseDocumentDigest &&
  root.workspaceGeneration === operation.baseWorkspaceGeneration;

export const completeStickDocumentPublication = (
  root: StickWorkspaceRootPhase2V1,
  operation: StickDocumentPublicationOperationV1,
  digest: string,
): StickWorkspaceRootPhase2V1 => {
  if (!publicationMatches(root, operation) || root.rootStatus !== "mounted") return root;
  const document = operation.candidateSnapshot.document;
  return {
    ...root,
    editorRoot: {current: {snapshot: operation.candidateSnapshot, documentDigest: digest}},
    workspaceGeneration: root.workspaceGeneration + 1,
    documentPublication: {
      status: "ready",
      operationId: null,
      projectId: document.projectId,
      documentRevision: document.documentRevision,
      currentDocumentDigest: digest,
    },
    creatorEntryLocked: root.creatorEntryLocked || operation.lockCreator,
  };
};

export const failStickDocumentPublication = (
  root: StickWorkspaceRootPhase2V1,
  operation: StickDocumentPublicationOperationV1,
): StickWorkspaceRootPhase2V1 => {
  if (!publicationMatches(root, operation) || root.rootStatus !== "mounted") return root;
  return {
    ...root,
    documentPublication: {
      status: "failed",
      operationId: operation.operationId,
      publishedProjectId: operation.baseProjectId,
      publishedDocumentRevision: operation.baseDocumentRevision,
      errorCode: "document_digest_failed",
    },
  };
};

export const retryStickDocumentPublication = async (
  root: StickWorkspaceRootPhase2V1,
): Promise<StickWorkspaceRootPhase2V1> => {
  if (root.rootStatus !== "mounted" || root.documentPublication.status !== "failed") return root;
  const current = root.editorRoot.current;
  const digest = await digestCanonical(current.snapshot.document);
  if (root.documentPublication.status !== "failed") return root;
  return {
    ...root,
    documentPublication: {
      status: "ready",
      operationId: null,
      projectId: current.snapshot.document.projectId,
      documentRevision: current.snapshot.document.documentRevision,
      currentDocumentDigest: digest,
    },
  };
};

export const updateStickViewState = (
  root: StickWorkspaceRootPhase2V1,
  nextViewState: StickEditorSnapshotV1["viewState"],
): StickWorkspaceRootPhase2V1 => root.rootStatus === "mounted" && root.documentPublication.status === "ready"
  ? {...root, editorRoot: {current: {...root.editorRoot.current, snapshot: {...root.editorRoot.current.snapshot, viewState: cloneCanonical(nextViewState)}}}}
  : root;

export const projectPointFromClient = (
  client: {x: number; y: number},
  stage: {left: number; top: number; scale: number},
) => ({x: (client.x - stage.left) / stage.scale, y: (client.y - stage.top) / stage.scale});

export const roundedClampedJointPoint = (
  pointerProject: {x: number; y: number},
  offset: {x: number; y: number},
  coordinateSpace: {width: number; height: number},
) => ({
  x: Math.min(coordinateSpace.width - 1, Math.max(0, Math.round(pointerProject.x + offset.x))),
  y: Math.min(coordinateSpace.height - 1, Math.max(0, Math.round(pointerProject.y + offset.y))),
});

export const nextManualWaveActionAvailability = (document: StickProjectDocumentV1) => {
  const can = (action: StickManualActionV1) => applyStickManualAction(document, action).ok;
  return {
    holdThrough: [3, 7, 11].filter((targetFrameIndex) => can({actionVersion: 1, type: "hold-pose-through", targetFrameIndex})),
    insertBlank: [4, 8].filter((targetFrameIndex) => can({actionVersion: 1, type: "insert-blank-keyframe", targetFrameIndex})),
    startFromPrevious: [4, 8].filter((targetFrameIndex) => can({actionVersion: 1, type: "start-pose-from-previous", targetFrameIndex, newPoseId: "00000000-0000-4000-8000-000000000999"})),
  };
};

export const rootDocument = (root: StickWorkspaceRootPhase2V1) => root.rootStatus === "mounted"
  ? root.editorRoot.current.snapshot.document
  : null;

export const rootReady = (root: StickWorkspaceRootPhase2V1) =>
  root.rootStatus === "mounted" && root.documentPublication.status === "ready";

export type EditableStickFrameKind = "frame" | "keyframe" | "tween";
export type EditableStickCellType = "empty" | "keyframe" | "blank-keyframe" | "hold" | "tween";

export type EditableStickTimelineFrame = {
  id: number;
  kind: EditableStickFrameKind;
  cellType: EditableStickCellType;
  stateId: number;
  isBlank: boolean;
  hasTweenEndpoint: false;
  content?: StickFigureFrameContent;
};

export type EditableStickTimelineLayer = {
  id: string;
  name: string;
  frames: EditableStickTimelineFrame[];
};

export type EditableStickTimelineState = {
  fps: number;
  layers: EditableStickTimelineLayer[];
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  nextFrameId: number;
  nextStateId: number;
  nextLayerNumber: number;
};

export type EditableStickResolvedContent = {
  layer: EditableStickTimelineLayer;
  selectedFrame: EditableStickTimelineFrame;
  selectedIndex: number;
  ownerFrame: EditableStickTimelineFrame;
  ownerIndex: number;
  spanEndIndex: number;
  content: StickFigureFrameContent;
};

const editableFrame = (
  id: number,
  cellType: EditableStickCellType,
  stateId: number,
  content?: StickFigureFrameContent,
): EditableStickTimelineFrame => ({
  id,
  kind: cellType === "keyframe" || cellType === "blank-keyframe" ? "keyframe" : "frame",
  cellType,
  stateId,
  isBlank: cellType === "blank-keyframe",
  hasTweenEndpoint: false,
  ...(content ? {content: cloneStickFigureFrameContent(content)} : {}),
});

const emptyEditableFrame = (id: number) => editableFrame(id, "empty", id);

export const cloneEditableStickFrame = (frame: EditableStickTimelineFrame): EditableStickTimelineFrame => ({
  ...frame,
  ...(frame.content ? {content: cloneStickFigureFrameContent(frame.content)} : {}),
});

export const cloneEditableStickTimelineState = (state: EditableStickTimelineState): EditableStickTimelineState => ({
  ...state,
  layers: state.layers.map((layer) => ({...layer, frames: layer.frames.map(cloneEditableStickFrame)})),
});

export const createFreshEditableStickTimelineState = (): EditableStickTimelineState => ({
  fps: 12,
  layers: [{
    id: "stick-layer-1",
    name: "Layer 1",
    frames: [editableFrame(1, "blank-keyframe", 1, createEmptyStickFigureFrameContent())],
  }],
  activeLayerId: "stick-layer-1",
  currentFrameIndex: 0,
  selectedTimelineIndex: 0,
  nextFrameId: 2,
  nextStateId: 2,
  nextLayerNumber: 2,
});

const isEditableStateStart = (frame?: EditableStickTimelineFrame | null) =>
  frame?.cellType === "keyframe" || frame?.cellType === "blank-keyframe";

const editableStateStartIndex = (frames: EditableStickTimelineFrame[], index: number) => {
  const frame = frames[index];
  if (!frame || frame.cellType === "empty") return -1;
  if (isEditableStateStart(frame)) return index;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = frames[cursor];
    if (candidate.stateId !== frame.stateId || candidate.cellType === "empty") return -1;
    if (isEditableStateStart(candidate)) return cursor;
  }
  return -1;
};

const editableSpanEndIndex = (frames: EditableStickTimelineFrame[], ownerIndex: number) => {
  const owner = frames[ownerIndex];
  if (!owner || !isEditableStateStart(owner)) return ownerIndex;
  let end = ownerIndex;
  while (end + 1 < frames.length && frames[end + 1].cellType === "hold" && frames[end + 1].stateId === owner.stateId) end += 1;
  return end;
};

export const resolveEditableStickContent = (
  state: EditableStickTimelineState,
  layerId: string,
  index: number,
): EditableStickResolvedContent | null => {
  const layer = state.layers.find((candidate) => candidate.id === layerId);
  const selectedFrame = layer?.frames[index];
  if (!layer || !selectedFrame || selectedFrame.cellType === "empty") return null;
  const ownerIndex = editableStateStartIndex(layer.frames, index);
  const ownerFrame = layer.frames[ownerIndex];
  if (ownerIndex < 0 || !ownerFrame || !isEditableStateStart(ownerFrame) || !ownerFrame.content) return null;
  return {
    layer,
    selectedFrame,
    selectedIndex: index,
    ownerFrame,
    ownerIndex,
    spanEndIndex: editableSpanEndIndex(layer.frames, ownerIndex),
    content: ownerFrame.content,
  };
};

export const getEditableStickPlaybackFrameCount = (state: EditableStickTimelineState) =>
  Math.max(1, ...state.layers.map((layer) => Math.max(1, layer.frames.length)));

const ensureEditableFrameIndex = (state: EditableStickTimelineState, frames: EditableStickTimelineFrame[], targetIndex: number) => {
  while (frames.length <= targetIndex) frames.push(emptyEditableFrame(state.nextFrameId++));
};

const previousEditableOwner = (frames: EditableStickTimelineFrame[], targetIndex: number) => {
  for (let index = Math.min(targetIndex, frames.length - 1); index >= 0; index -= 1) {
    const ownerIndex = editableStateStartIndex(frames, index);
    if (ownerIndex >= 0) return ownerIndex;
  }
  return -1;
};

const normalizeEditableSelection = (state: EditableStickTimelineState) => {
  const maxIndex = Math.max(0, getEditableStickPlaybackFrameCount(state) - 1);
  state.currentFrameIndex = Math.max(0, Math.min(state.currentFrameIndex, maxIndex));
  state.selectedTimelineIndex = Math.max(0, Math.min(state.selectedTimelineIndex, maxIndex));
  if (!state.layers.some((layer) => layer.id === state.activeLayerId)) state.activeLayerId = state.layers[0]?.id ?? "stick-layer-1";
};

export const insertEditableStickTimelineFrame = (
  source: EditableStickTimelineState,
  layerId: string,
  kind: "frame" | "keyframe",
  targetIndex: number,
  options?: {blank?: boolean},
): EditableStickTimelineState | null => {
  const state = cloneEditableStickTimelineState(source);
  const layer = state.layers.find((candidate) => candidate.id === layerId);
  if (!layer || targetIndex < 0) return null;
  ensureEditableFrameIndex(state, layer.frames, targetIndex);
  const target = layer.frames[targetIndex];
  let nextIndex = targetIndex;
  if (kind === "frame") {
    if (target.cellType === "empty") {
      const ownerIndex = previousEditableOwner(layer.frames, targetIndex - 1);
      if (ownerIndex < 0) {
        const content = createEmptyStickFigureFrameContent();
        layer.frames[targetIndex] = editableFrame(target.id, "blank-keyframe", state.nextStateId++, content);
      } else {
        const owner = layer.frames[ownerIndex];
        const sourceEnd = editableSpanEndIndex(layer.frames, ownerIndex);
        for (let index = sourceEnd + 1; index <= targetIndex; index += 1) {
          const existing = layer.frames[index];
          layer.frames[index] = editableFrame(existing?.id ?? state.nextFrameId++, "hold", owner.stateId);
        }
      }
    } else {
      const ownerIndex = editableStateStartIndex(layer.frames, targetIndex);
      if (ownerIndex < 0) return null;
      const owner = layer.frames[ownerIndex];
      const insertIndex = editableSpanEndIndex(layer.frames, ownerIndex) + 1;
      layer.frames.splice(insertIndex, 0, editableFrame(state.nextFrameId++, "hold", owner.stateId));
      nextIndex = insertIndex;
    }
  } else {
    const resolved = resolveEditableStickContent(state, layerId, targetIndex) ?? (() => {
      const ownerIndex = previousEditableOwner(layer.frames, targetIndex - 1);
      return ownerIndex >= 0 ? resolveEditableStickContent(state, layerId, ownerIndex) : null;
    })();
    const content = options?.blank || !resolved ? createEmptyStickFigureFrameContent() : cloneStickFigureFrameContent(resolved.content);
    const cellType = options?.blank || isStickFigureFrameContentEmpty(content) ? "blank-keyframe" : "keyframe";
    const newStateId = state.nextStateId++;
    if (target.cellType === "empty") {
      layer.frames[targetIndex] = editableFrame(target.id, cellType, newStateId, content);
    } else {
      const previousStateId = target.stateId;
      const insertIndex = targetIndex + 1;
      layer.frames.splice(insertIndex, 0, editableFrame(state.nextFrameId++, cellType, newStateId, content));
      for (let index = insertIndex + 1; index < layer.frames.length; index += 1) {
        const trailing = layer.frames[index];
        if (trailing.cellType !== "hold" || trailing.stateId !== previousStateId) break;
        layer.frames[index] = editableFrame(trailing.id, "hold", newStateId);
      }
      nextIndex = insertIndex;
    }
  }
  state.activeLayerId = layerId;
  state.currentFrameIndex = nextIndex;
  state.selectedTimelineIndex = nextIndex;
  normalizeEditableSelection(state);
  return state;
};

export const removeEditableStickTimelineFrame = (
  source: EditableStickTimelineState,
  layerId: string,
  targetIndex: number,
): EditableStickTimelineState | null => {
  const state = cloneEditableStickTimelineState(source);
  const layer = state.layers.find((candidate) => candidate.id === layerId);
  if (!layer) return null;
  const ownerIndex = editableStateStartIndex(layer.frames, targetIndex);
  if (ownerIndex < 0) return null;
  const endIndex = editableSpanEndIndex(layer.frames, ownerIndex);
  const removedCount = endIndex - ownerIndex + 1;
  layer.frames.splice(ownerIndex, removedCount);
  if (layer.frames.length === 0) layer.frames.push(editableFrame(state.nextFrameId++, "blank-keyframe", state.nextStateId++, createEmptyStickFigureFrameContent()));
  const repair = (value: number) => value >= ownerIndex && value <= endIndex ? ownerIndex : value > endIndex ? value - removedCount : value;
  state.currentFrameIndex = repair(state.currentFrameIndex);
  state.selectedTimelineIndex = repair(state.selectedTimelineIndex);
  state.activeLayerId = layerId;
  normalizeEditableSelection(state);
  return state;
};

export const copyEditableStickTimelineFrame = (
  state: EditableStickTimelineState,
  layerId: string,
  targetIndex: number,
) => {
  const resolved = resolveEditableStickContent(state, layerId, targetIndex);
  return resolved ? cloneStickFigureFrameContent(resolved.content) : null;
};

export const pasteEditableStickTimelineFrame = (
  source: EditableStickTimelineState,
  layerId: string,
  targetIndex: number,
  clipboard: StickFigureFrameContent,
): EditableStickTimelineState | null => {
  const state = cloneEditableStickTimelineState(source);
  const layer = state.layers.find((candidate) => candidate.id === layerId);
  if (!layer || targetIndex < 0) return null;
  ensureEditableFrameIndex(state, layer.frames, targetIndex);
  const target = layer.frames[targetIndex];
  const previousStateId = target.cellType === "empty" ? null : target.stateId;
  const content = cloneStickFigureFrameContent(clipboard);
  const stateId = state.nextStateId++;
  layer.frames[targetIndex] = editableFrame(target.id, isStickFigureFrameContentEmpty(content) ? "blank-keyframe" : "keyframe", stateId, content);
  if (previousStateId !== null) {
    for (let index = targetIndex + 1; index < layer.frames.length; index += 1) {
      const trailing = layer.frames[index];
      if (trailing.cellType !== "hold" || trailing.stateId !== previousStateId) break;
      layer.frames[index] = editableFrame(trailing.id, "hold", stateId);
    }
  }
  state.activeLayerId = layerId;
  state.currentFrameIndex = targetIndex;
  state.selectedTimelineIndex = targetIndex;
  normalizeEditableSelection(state);
  return state;
};

export const resizeEditableStickTimelineSpan = (
  source: EditableStickTimelineState,
  layerId: string,
  stateId: number,
  nextEndIndex: number,
): EditableStickTimelineState | null => {
  const state = cloneEditableStickTimelineState(source);
  const layer = state.layers.find((candidate) => candidate.id === layerId);
  const ownerIndex = layer?.frames.findIndex((frame) => isEditableStateStart(frame) && frame.stateId === stateId) ?? -1;
  if (!layer || ownerIndex < 0 || nextEndIndex < ownerIndex) return null;
  const previousEnd = editableSpanEndIndex(layer.frames, ownerIndex);
  if (nextEndIndex === previousEnd) return null;
  if (nextEndIndex > previousEnd) {
    ensureEditableFrameIndex(state, layer.frames, nextEndIndex);
    for (let index = previousEnd + 1; index <= nextEndIndex; index += 1) {
      if (layer.frames[index].cellType !== "empty") return null;
    }
    for (let index = previousEnd + 1; index <= nextEndIndex; index += 1) layer.frames[index] = editableFrame(layer.frames[index].id, "hold", stateId);
  } else {
    layer.frames.splice(nextEndIndex + 1, previousEnd - nextEndIndex);
  }
  state.activeLayerId = layerId;
  state.currentFrameIndex = Math.min(state.currentFrameIndex, nextEndIndex);
  state.selectedTimelineIndex = nextEndIndex;
  normalizeEditableSelection(state);
  return state;
};

export const addEditableStickLayer = (source: EditableStickTimelineState): EditableStickTimelineState => {
  const state = cloneEditableStickTimelineState(source);
  const layerId = `stick-layer-${state.nextLayerNumber}`;
  const layer = {
    id: layerId,
    name: `Layer ${state.nextLayerNumber}`,
    frames: [editableFrame(state.nextFrameId++, "blank-keyframe", state.nextStateId++, createEmptyStickFigureFrameContent())],
  };
  state.nextLayerNumber += 1;
  const activeIndex = state.layers.findIndex((candidate) => candidate.id === state.activeLayerId);
  state.layers.splice(activeIndex >= 0 ? activeIndex + 1 : state.layers.length, 0, layer);
  state.activeLayerId = layerId;
  state.currentFrameIndex = 0;
  state.selectedTimelineIndex = 0;
  return state;
};

export const deleteEditableStickLayer = (
  source: EditableStickTimelineState,
  layerId: string,
): EditableStickTimelineState | null => {
  if (source.layers.length <= 1) return null;
  const state = cloneEditableStickTimelineState(source);
  const index = state.layers.findIndex((candidate) => candidate.id === layerId);
  if (index < 0) return null;
  state.layers.splice(index, 1);
  state.activeLayerId = state.layers[Math.min(index, state.layers.length - 1)].id;
  normalizeEditableSelection(state);
  return state;
};

export const replaceEditableStickResolvedContent = (
  source: EditableStickTimelineState,
  layerId: string,
  selectedIndex: number,
  nextContent: StickFigureFrameContent,
): EditableStickTimelineState | null => {
  const state = cloneEditableStickTimelineState(source);
  const resolved = resolveEditableStickContent(state, layerId, selectedIndex);
  if (!resolved) return null;
  resolved.ownerFrame.content = cloneStickFigureFrameContent(nextContent);
  resolved.ownerFrame.cellType = isStickFigureFrameContentEmpty(nextContent) ? "blank-keyframe" : "keyframe";
  resolved.ownerFrame.kind = "keyframe";
  resolved.ownerFrame.isBlank = resolved.ownerFrame.cellType === "blank-keyframe";
  state.activeLayerId = layerId;
  return state;
};
