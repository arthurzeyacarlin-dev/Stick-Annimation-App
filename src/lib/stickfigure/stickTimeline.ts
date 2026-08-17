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
