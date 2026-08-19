import {
  canonicalJson,
  cloneCanonical,
  digestCanonical,
  type StickEditorSnapshotV1,
  type StickEditorVersionV1,
  type StickProjectDocumentV1,
} from "./stickProjectContract.ts";
import {
  cloneEditableStickTimelineState,
  createFreshEditableStickTimelineState,
  resolveEditableStickContent,
  type EditableStickTimelineLayer,
  type EditableStickTimelineState,
} from "./stickTimeline.ts";
import {isStickFigureFrameContentEmpty, type StickFigureFrameContent} from "../../components/workspace/stickfigure/types.ts";

export const STICK_HISTORY_ENTRY_LIMIT = 128;
export const STICK_HISTORY_BYTE_LIMIT = 16_777_216;
export const STICK_ONION_PREVIOUS_TINT = "rgba(92, 63, 158, 0.58)";
export const STICK_ONION_NEXT_TINT = "rgba(44, 122, 91, 0.56)";

export type EditableStickProjectDocumentV1 = {
  schemaVersion: 1;
  projectType: "stick-figure";
  projectId: string;
  documentRevision: number;
  title: string;
  fps: number;
  layers: EditableStickTimelineLayer[];
  nextFrameId: number;
  nextStateId: number;
  nextLayerNumber: number;
};

export type EditableStickProjectViewStateV1 = {
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
};

export type EditableStickProjectSnapshotV1 = {
  document: EditableStickProjectDocumentV1;
  viewState: EditableStickProjectViewStateV1;
};

export type EditableStickEditorVersionV1 = {
  snapshot: EditableStickProjectSnapshotV1;
  documentDigest: string;
};

export type EditableStickEditorHistoryRootV1 = {
  current: EditableStickEditorVersionV1;
  undo: EditableStickEditorVersionV1[];
  redo: EditableStickEditorVersionV1[];
};

const cloneValue = <T,>(value: T): T => JSON.parse(canonicalJson(value)) as T;

export const editableStickDocumentFromTimeline = (
  timeline: EditableStickTimelineState,
  identity: Pick<EditableStickProjectDocumentV1, "projectId" | "documentRevision" | "title">,
): EditableStickProjectDocumentV1 => ({
  schemaVersion: 1,
  projectType: "stick-figure",
  projectId: identity.projectId,
  documentRevision: identity.documentRevision,
  title: identity.title,
  fps: timeline.fps,
  layers: cloneEditableStickTimelineState(timeline).layers,
  nextFrameId: timeline.nextFrameId,
  nextStateId: timeline.nextStateId,
  nextLayerNumber: timeline.nextLayerNumber,
});

export const editableStickViewFromTimeline = (
  timeline: EditableStickTimelineState,
): EditableStickProjectViewStateV1 => ({
  activeLayerId: timeline.activeLayerId,
  currentFrameIndex: timeline.currentFrameIndex,
  selectedTimelineIndex: timeline.selectedTimelineIndex,
});

export const editableStickTimelineFromSnapshot = (
  snapshot: EditableStickProjectSnapshotV1,
): EditableStickTimelineState => cloneEditableStickTimelineState({
  fps: snapshot.document.fps,
  layers: snapshot.document.layers,
  activeLayerId: snapshot.viewState.activeLayerId,
  currentFrameIndex: snapshot.viewState.currentFrameIndex,
  selectedTimelineIndex: snapshot.viewState.selectedTimelineIndex,
  nextFrameId: snapshot.document.nextFrameId,
  nextStateId: snapshot.document.nextStateId,
  nextLayerNumber: snapshot.document.nextLayerNumber,
});

export const digestEditableStickDocument = (document: EditableStickProjectDocumentV1) =>
  digestCanonical(document);

export const createEditableStickEditorVersion = async (
  snapshot: EditableStickProjectSnapshotV1,
): Promise<EditableStickEditorVersionV1> => ({
  snapshot: cloneValue(snapshot),
  documentDigest: await digestEditableStickDocument(snapshot.document),
});

export const createEditableStickHistoryRoot = async (
  snapshot: EditableStickProjectSnapshotV1,
): Promise<EditableStickEditorHistoryRootV1> => ({
  current: await createEditableStickEditorVersion(snapshot),
  undo: [],
  redo: [],
});

/** The exact visible empty project on which the first bounded AI wave is allowed to start. */
export const isEligibleEditableStickWaveStarter = (
  root: EditableStickEditorHistoryRootV1,
): boolean => {
  if (root.undo.length !== 0 || root.redo.length !== 0 || root.current.snapshot.document.documentRevision !== 0) return false;
  const current = root.current.snapshot.document;
  const expected = editableStickDocumentFromTimeline(createFreshEditableStickTimelineState(), {
    projectId: current.projectId,
    documentRevision: 0,
    title: current.title,
  });
  return canonicalJson(current) === canonicalJson(expected);
};

/** Projects the validated canonical wave into the existing Phase 3 editable model without publishing it. */
export const editableStickTimelineFromCanonicalWave = (
  document: StickProjectDocumentV1,
  current: EditableStickTimelineState,
): EditableStickTimelineState => {
  const rig = document.rigs[0];
  const figure = document.figures[0];
  const layer = document.layers[0];
  if (!rig || !figure || !layer) throw new Error("Phase 4 candidate is missing its built-in Stick identity.");
  const stateIdByFrameId = new Map<string, number>();
  let nextStateId = 1;
  const frames = layer.cells.map((cell, index) => {
    const id = index + 1;
    if (cell.cellType === "keyframe") {
      const stateId = nextStateId++;
      stateIdByFrameId.set(cell.frameId, stateId);
      const pose = cell.poses[0];
      const content: StickFigureFrameContent = {
        figures: [],
        structureGraph: {
          joints: pose.points.map((point) => ({
            id: point.jointId,
            x: Math.round(point.x * 0.5),
            y: Math.round(point.y * 0.55),
          })),
          limbs: rig.segments.map((segment) => ({
            id: segment.segmentId,
            startJointId: segment.fromJointId,
            endJointId: segment.toJointId,
          })),
          activeJointId: null,
        },
      };
      return {id, kind: "keyframe" as const, cellType: "keyframe" as const, stateId, isBlank: false, hasTweenEndpoint: false as const, content};
    }
    if (cell.cellType === "hold") {
      const stateId = stateIdByFrameId.get(cell.ownerFrameId);
      if (!stateId) throw new Error("Phase 4 candidate contains a hold without an earlier owner.");
      return {id, kind: "frame" as const, cellType: "hold" as const, stateId, isBlank: false, hasTweenEndpoint: false as const};
    }
    return {id, kind: "frame" as const, cellType: "empty" as const, stateId: nextStateId++, isBlank: false, hasTweenEndpoint: false as const};
  });
  const activeLayerId = current.activeLayerId;
  const maxIndex = Math.max(0, frames.length - 1);
  return {
    fps: document.fps,
    layers: [{id: activeLayerId, name: current.layers.find((candidate) => candidate.id === activeLayerId)?.name ?? "Layer 1", frames}],
    activeLayerId,
    currentFrameIndex: Math.min(current.currentFrameIndex, maxIndex),
    selectedTimelineIndex: Math.min(current.selectedTimelineIndex, maxIndex),
    nextFrameId: frames.length + 1,
    nextStateId,
    nextLayerNumber: Math.max(2, current.nextLayerNumber),
  };
};

export const editableStickHistoryVersionByteLength = (version: EditableStickEditorVersionV1) =>
  new TextEncoder().encode(canonicalJson(version)).byteLength;

export const pruneEditableStickHistoryStack = (
  stack: EditableStickEditorVersionV1[],
): EditableStickEditorVersionV1[] => {
  const next = stack.map(cloneValue);
  let byteLength = next.reduce((total, version) => total + editableStickHistoryVersionByteLength(version), 0);
  while (next.length > STICK_HISTORY_ENTRY_LIMIT || byteLength > STICK_HISTORY_BYTE_LIMIT) {
    const removed = next.shift();
    if (!removed) break;
    byteLength -= editableStickHistoryVersionByteLength(removed);
  }
  return next;
};

export const commitEditableStickHistory = async (
  root: EditableStickEditorHistoryRootV1,
  snapshot: EditableStickProjectSnapshotV1,
): Promise<EditableStickEditorHistoryRootV1> => ({
  current: await createEditableStickEditorVersion(snapshot),
  undo: pruneEditableStickHistoryStack([...root.undo, root.current]),
  redo: [],
});

export const verifyEditableStickEditorVersion = async (
  version: EditableStickEditorVersionV1,
) => (await digestEditableStickDocument(version.snapshot.document)) === version.documentDigest;

export const undoEditableStickHistory = async (
  root: EditableStickEditorHistoryRootV1,
): Promise<EditableStickEditorHistoryRootV1 | null> => {
  const target = root.undo.at(-1);
  if (!target || !(await verifyEditableStickEditorVersion(target))) return null;
  return {
    current: cloneValue(target),
    undo: root.undo.slice(0, -1).map(cloneValue),
    redo: pruneEditableStickHistoryStack([...root.redo, root.current]),
  };
};

export const redoEditableStickHistory = async (
  root: EditableStickEditorHistoryRootV1,
): Promise<EditableStickEditorHistoryRootV1 | null> => {
  const target = root.redo.at(-1);
  if (!target || !(await verifyEditableStickEditorVersion(target))) return null;
  return {
    current: cloneValue(target),
    undo: pruneEditableStickHistoryStack([...root.undo, root.current]),
    redo: root.redo.slice(0, -1).map(cloneValue),
  };
};

/**
 * Phase 4's command executor works on the strict Phase 1 Stick document.  It
 * deliberately uses the same bounded history rules as the visible Phase 3
 * editor instead of growing an AI-only undo stack.
 */
export type CanonicalStickEditorHistoryRootV1 = {
  current: StickEditorVersionV1;
  undo: StickEditorVersionV1[];
  redo: StickEditorVersionV1[];
};

export const createCanonicalStickEditorVersion = async (
  snapshot: StickEditorSnapshotV1,
): Promise<StickEditorVersionV1> => ({
  snapshot: cloneCanonical(snapshot),
  documentDigest: await digestCanonical(snapshot.document),
});

export const canonicalStickHistoryVersionByteLength = (version: StickEditorVersionV1) =>
  new TextEncoder().encode(canonicalJson(version)).byteLength;

export const pruneCanonicalStickHistoryStack = (
  stack: StickEditorVersionV1[],
): StickEditorVersionV1[] => {
  const next = stack.map(cloneCanonical);
  let byteLength = next.reduce((total, version) => total + canonicalStickHistoryVersionByteLength(version), 0);
  while (next.length > STICK_HISTORY_ENTRY_LIMIT || byteLength > STICK_HISTORY_BYTE_LIMIT) {
    const removed = next.shift();
    if (!removed) break;
    byteLength -= canonicalStickHistoryVersionByteLength(removed);
  }
  return next;
};

export const createCanonicalStickHistoryRoot = async (
  snapshot: StickEditorSnapshotV1,
): Promise<CanonicalStickEditorHistoryRootV1> => ({
  current: await createCanonicalStickEditorVersion(snapshot),
  undo: [],
  redo: [],
});

export const commitCanonicalStickHistory = async (
  root: CanonicalStickEditorHistoryRootV1,
  snapshot: StickEditorSnapshotV1,
): Promise<CanonicalStickEditorHistoryRootV1> => ({
  current: await createCanonicalStickEditorVersion(snapshot),
  undo: pruneCanonicalStickHistoryStack([...root.undo, root.current]),
  redo: [],
});

export const verifyCanonicalStickEditorVersion = async (version: StickEditorVersionV1) =>
  (await digestCanonical(version.snapshot.document)) === version.documentDigest;

export const undoCanonicalStickHistory = async (
  root: CanonicalStickEditorHistoryRootV1,
): Promise<CanonicalStickEditorHistoryRootV1 | null> => {
  const target = root.undo.at(-1);
  if (!target || !(await verifyCanonicalStickEditorVersion(target))) return null;
  return {
    current: cloneCanonical(target),
    undo: root.undo.slice(0, -1).map(cloneCanonical),
    redo: pruneCanonicalStickHistoryStack([...root.redo, root.current]),
  };
};

export const redoCanonicalStickHistory = async (
  root: CanonicalStickEditorHistoryRootV1,
): Promise<CanonicalStickEditorHistoryRootV1 | null> => {
  const target = root.redo.at(-1);
  if (!target || !(await verifyCanonicalStickEditorVersion(target))) return null;
  return {
    current: cloneCanonical(target),
    undo: pruneCanonicalStickHistoryStack([...root.undo, root.current]),
    redo: root.redo.slice(0, -1).map(cloneCanonical),
  };
};

export const replaceEditableStickCurrentView = (
  root: EditableStickEditorHistoryRootV1,
  viewState: EditableStickProjectViewStateV1,
): EditableStickEditorHistoryRootV1 => ({
  ...root,
  current: {
    ...root.current,
    snapshot: {...root.current.snapshot, viewState: cloneValue(viewState)},
  },
});

export type EditableStickOnionOverlayV1 = {
  side: "previous" | "next";
  sourceIndex: number;
  content: StickFigureFrameContent;
  tint: typeof STICK_ONION_PREVIOUS_TINT | typeof STICK_ONION_NEXT_TINT;
};

const visibleContentSignature = (content: StickFigureFrameContent) => canonicalJson({
  figures: content.figures,
  structureGraph: {
    joints: content.structureGraph.joints,
    limbs: content.structureGraph.limbs,
  },
});

export const resolveEditableStickOnionOverlays = (
  timeline: EditableStickTimelineState,
  anchorIndex = timeline.selectedTimelineIndex,
): EditableStickOnionOverlayV1[] => {
  const layer = timeline.layers.find((candidate) => candidate.id === timeline.activeLayerId);
  if (!layer || anchorIndex < 0 || anchorIndex >= layer.frames.length) return [];
  const current = resolveEditableStickContent(timeline, layer.id, anchorIndex);
  const currentSignature = current && !isStickFigureFrameContentEmpty(current.content)
    ? visibleContentSignature(current.content)
    : null;
  const find = (side: "previous" | "next") => {
    const step = side === "previous" ? -1 : 1;
    for (let index = anchorIndex + step; index >= 0 && index < layer.frames.length; index += step) {
      const frame = layer.frames[index];
      if (!frame || frame.cellType === "empty" || frame.cellType === "blank-keyframe") return null;
      const resolved = resolveEditableStickContent(timeline, layer.id, index);
      if (!resolved || isStickFigureFrameContentEmpty(resolved.content)) return null;
      if (current && resolved.ownerFrame.id === current.ownerFrame.id) continue;
      const signature = visibleContentSignature(resolved.content);
      if (signature === currentSignature) continue;
      return {index, content: resolved.content, signature};
    }
    return null;
  };
  const previous = find("previous");
  const next = find("next");
  const overlays: EditableStickOnionOverlayV1[] = [];
  if (previous) overlays.push({side: "previous", sourceIndex: previous.index, content: cloneValue(previous.content), tint: STICK_ONION_PREVIOUS_TINT});
  if (next && next.signature !== previous?.signature) overlays.push({side: "next", sourceIndex: next.index, content: cloneValue(next.content), tint: STICK_ONION_NEXT_TINT});
  return overlays;
};
