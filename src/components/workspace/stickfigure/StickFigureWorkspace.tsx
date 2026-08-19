import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {canonicalJson, digestCanonical} from "../../../lib/stickfigure/stickProjectContract";
import {
  commitEditableStickHistory,
  createEditableStickHistoryRoot,
  editableStickDocumentFromTimeline,
  editableStickTimelineFromSnapshot,
  editableStickViewFromTimeline,
  redoEditableStickHistory,
  replaceEditableStickCurrentView,
  resolveEditableStickOnionOverlays,
  undoEditableStickHistory,
  verifyEditableStickEditorVersion,
  type EditableStickEditorHistoryRootV1,
  type EditableStickProjectSnapshotV1,
} from "../../../lib/stickfigure/stickProjectHistory";
import {
  saveStickProject,
  stickStorageErrorMessage,
  validateEditableStickProjectDocument,
  validateEditableStickProjectViewState,
  type StickSavedProjectRecordV1,
} from "../../../lib/stickProjectStorage";
import {advancePlaybackAccumulator, getClampedPlaybackFrameDurationMs} from "../timelinePlayback";
import {
  addEditableStickLayer,
  cloneEditableStickTimelineState,
  copyEditableStickTimelineFrame,
  createFreshEditableStickTimelineState,
  deleteEditableStickLayer,
  getEditableStickPlaybackFrameCount,
  insertEditableStickTimelineFrame,
  pasteEditableStickTimelineFrame,
  removeEditableStickTimelineFrame,
  replaceEditableStickResolvedContent,
  resizeEditableStickTimelineSpan,
  resolveEditableStickContent,
  type EditableStickTimelineState,
} from "../../../lib/stickfigure/stickTimeline";
import {StickFigureCanvas} from "./StickFigureCanvas";
import {StickFigureRightPanel, type StickFigureRightPanelTab} from "./StickFigureRightPanel";
import {StickFigureTimelineRow, type TimelineFrameKind} from "./StickFigureTimelineRow";
import {StickFigureToolBar, type StickFigureToolName} from "./StickFigureToolBar";
import {StickFigureTopBar} from "./StickFigureTopBar";
import {
  cloneStickFigureFrameContent,
  createEmptyStickFigureFrameContent,
  type StickFigureFrameContent,
  type StickFigurePoint,
  type StickFigureSelection,
  type StickFigureStructureSegmentDraft,
  type StickFigureStructureTool,
} from "./types";

type StickFigureWorkspaceProps = {
  onOpenStickFigureCreator: () => void;
  initialProject?: StickSavedProjectRecordV1 | null;
};

type StickPublicationState =
  | {status: "ready"}
  | {status: "pending"; operationId: string; baseDigest: string; baseGeneration: number}
  | {status: "failed"};

type StickMountedWorkspaceRoot = {
  workspaceInstanceId: string;
  editorRoot: EditableStickEditorHistoryRootV1;
  workspaceGeneration: number;
  documentPublication: StickPublicationState;
  lastSavedDocumentDigest: string | null;
};

type PendingDocumentPublication = {
  operationId: string;
  baseWorkspaceInstanceId: string;
  baseDocumentDigest: string;
  baseWorkspaceGeneration: number;
  candidateEditorRoot: EditableStickEditorHistoryRootV1;
};

type PendingMountedOpen = {
  operationId: string;
  baseRoot: StickMountedWorkspaceRoot;
  candidateEditorRoot: EditableStickEditorHistoryRootV1;
};

const DEFAULT_STICK_CAMERA_ZOOM = 0.85;
const DEFAULT_STICK_CAMERA_PAN: StickFigurePoint = {x: 0, y: 0};
const MIN_STICK_CAMERA_ZOOM = 0.5;
const MAX_STICK_CAMERA_ZOOM = 3;
const clampStickCameraZoom = (zoom: number) => Math.min(MAX_STICK_CAMERA_ZOOM, Math.max(MIN_STICK_CAMERA_ZOOM, zoom));
const formatStickCameraZoom = (zoom: number) => `${Math.round(zoom * 100)}%`;
const newWorkspaceId = () => globalThis.crypto.randomUUID().toLowerCase();
const isPlainRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const deterministicWorkspaceId = async (operationId: string) => {
  const hex = (await digestCanonical(operationId)).slice("sha256:".length);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const newProjectSnapshot = (): EditableStickProjectSnapshotV1 => {
  const timeline = createFreshEditableStickTimelineState();
  return {
    document: editableStickDocumentFromTimeline(timeline, {
      projectId: newWorkspaceId(),
      documentRevision: 0,
      title: "Unnamed stick figure project",
    }),
    viewState: editableStickViewFromTimeline(timeline),
  };
};

export function StickFigureWorkspace({onOpenStickFigureCreator, initialProject = null}: StickFigureWorkspaceProps) {
  const initialSnapshotRef = useRef<EditableStickProjectSnapshotV1 | null>(null);
  if (!initialSnapshotRef.current) {
    initialSnapshotRef.current = initialProject
      ? {document: initialProject.document, viewState: initialProject.reopenState}
      : newProjectSnapshot();
  }
  const initialTimelineRef = useRef(editableStickTimelineFromSnapshot(initialSnapshotRef.current));
  const [workspaceRoot, setWorkspaceRoot] = useState<StickMountedWorkspaceRoot | null>(null);
  const workspaceRootRef = useRef<StickMountedWorkspaceRoot | null>(null);
  const timelineRef = useRef(initialTimelineRef.current);
  const isTimelinePlayingRef = useRef(false);
  const clipboardRef = useRef<StickFigureFrameContent | null>(null);
  const readyDocumentPublicationCountRef = useRef(0);
  const workspaceRootTransitionCountRef = useRef(0);
  const mountedOpenRef = useRef<{status: string | null; operationId: string | null}>({status: null, operationId: null});
  const pendingDocumentPublicationRef = useRef<PendingDocumentPublication | null>(null);
  const pendingMountedOpenRef = useRef<PendingMountedOpen | null>(null);
  const [hasCopiedFrame, setHasCopiedFrame] = useState(false);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [isOnionEnabled, setIsOnionEnabled] = useState(false);
  const onionEnabledRef = useRef(false);
  const onionOverlaysRef = useRef<ReturnType<typeof resolveEditableStickOnionOverlays>>([]);
  const [selection, setSelection] = useState<StickFigureSelection>({target: "workspace"});
  const [selectedStructureJointId, setSelectedStructureJointId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<StickFigureToolName | null>("Select");
  const [rightPanelTab, setRightPanelTab] = useState<StickFigureRightPanelTab>("Properties");
  const [canvasMovementEnabled, setCanvasMovementEnabled] = useState(false);
  const [stickCameraZoom, setStickCameraZoom] = useState(DEFAULT_STICK_CAMERA_ZOOM);
  const [stickZoomInputValue, setStickZoomInputValue] = useState(formatStickCameraZoom(DEFAULT_STICK_CAMERA_ZOOM));
  const [stickCameraPan, setStickCameraPan] = useState<StickFigurePoint>(DEFAULT_STICK_CAMERA_PAN);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState("#f5f5f5");
  const [structureTool, setStructureTool] = useState<StickFigureStructureTool>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const installRoot = useCallback((next: StickMountedWorkspaceRoot) => {
    workspaceRootTransitionCountRef.current += 1;
    workspaceRootRef.current = next;
    timelineRef.current = editableStickTimelineFromSnapshot(next.editorRoot.current.snapshot);
    setWorkspaceRoot(next);
  }, []);

  useEffect(() => {
    let alive = true;
    void createEditableStickHistoryRoot(initialSnapshotRef.current!).then((editorRoot) => {
      if (!alive) return;
      installRoot({
        workspaceInstanceId: newWorkspaceId(),
        editorRoot,
        workspaceGeneration: initialProject ? 1 : 0,
        documentPublication: {status: "ready"},
        lastSavedDocumentDigest: initialProject ? editorRoot.current.documentDigest : null,
      });
      readyDocumentPublicationCountRef.current += 1;
    });
    return () => { alive = false; };
  }, [initialProject, installRoot]);

  useEffect(() => { isTimelinePlayingRef.current = isTimelinePlaying; }, [isTimelinePlaying]);

  const timeline = workspaceRoot
    ? editableStickTimelineFromSnapshot(workspaceRoot.editorRoot.current.snapshot)
    : initialTimelineRef.current;
  timelineRef.current = timeline;
  const isReady = workspaceRoot?.documentPublication.status === "ready";

  const publishView = useCallback((nextTimeline: EditableStickTimelineState) => {
    const current = workspaceRootRef.current;
    if (!current || current.documentPublication.status !== "ready") return false;
    installRoot({...current, editorRoot: replaceEditableStickCurrentView(current.editorRoot, editableStickViewFromTimeline(nextTimeline))});
    return true;
  }, [installRoot]);

  const publishAuthored = useCallback(async (nextTimeline: EditableStickTimelineState) => {
    const base = workspaceRootRef.current;
    if (!base || base.documentPublication.status !== "ready" || isTimelinePlayingRef.current) return false;
    const currentDocument = base.editorRoot.current.snapshot.document;
    const nextDocument = editableStickDocumentFromTimeline(nextTimeline, {
      projectId: currentDocument.projectId,
      documentRevision: currentDocument.documentRevision + 1,
      title: currentDocument.title,
    });
    if (canonicalJson({...currentDocument, documentRevision: nextDocument.documentRevision}) === canonicalJson(nextDocument)) return false;
    const operationId = newWorkspaceId();
    installRoot({...base, documentPublication: {
      status: "pending",
      operationId,
      baseDigest: base.editorRoot.current.documentDigest,
      baseGeneration: base.workspaceGeneration,
    }});
    try {
      const editorRoot = await commitEditableStickHistory(base.editorRoot, {
        document: nextDocument,
        viewState: editableStickViewFromTimeline(nextTimeline),
      });
      const live = workspaceRootRef.current;
      if (!live || live.workspaceInstanceId !== base.workspaceInstanceId || live.documentPublication.status !== "pending" ||
        live.documentPublication.operationId !== operationId || live.documentPublication.baseDigest !== base.editorRoot.current.documentDigest ||
        live.documentPublication.baseGeneration !== base.workspaceGeneration) return false;
      installRoot({...live, editorRoot, workspaceGeneration: base.workspaceGeneration + 1, documentPublication: {status: "ready"}});
      readyDocumentPublicationCountRef.current += 1;
      setSaveError(null);
      return true;
    } catch {
      const live = workspaceRootRef.current;
      if (live?.documentPublication.status === "pending" && live.documentPublication.operationId === operationId) {
        installRoot({...live, documentPublication: {status: "failed"}});
      }
      return false;
    }
  }, [installRoot]);

  const mutateTimeline = useCallback((mutation: (current: EditableStickTimelineState) => EditableStickTimelineState | null) => {
    const root = workspaceRootRef.current;
    if (!root || root.documentPublication.status !== "ready" || isTimelinePlayingRef.current) return false;
    const next = mutation(cloneEditableStickTimelineState(timelineRef.current));
    if (!next) return false;
    void publishAuthored(next);
    return true;
  }, [publishAuthored]);

  const updateContent = useCallback((
    mutate: (content: StickFigureFrameContent) => boolean,
    selectedIndex = timelineRef.current.currentFrameIndex,
  ) => mutateTimeline((current) => {
    const resolved = resolveEditableStickContent(current, current.activeLayerId, selectedIndex);
    if (!resolved) return null;
    const content = cloneStickFigureFrameContent(resolved.content);
    if (!mutate(content)) return null;
    return replaceEditableStickResolvedContent(current, current.activeLayerId, selectedIndex, content);
  }), [mutateTimeline]);

  const authoredPlaybackFrameCount = useMemo(() => getEditableStickPlaybackFrameCount(timeline), [timeline]);
  const activeResolved = useMemo(
    () => resolveEditableStickContent(timeline, timeline.activeLayerId, timeline.currentFrameIndex),
    [timeline],
  );
  const activeContent = activeResolved?.content ?? createEmptyStickFigureFrameContent();
  const backgroundContents = useMemo(
    () => timeline.layers
      .filter((layer) => layer.id !== timeline.activeLayerId)
      .map((layer) => resolveEditableStickContent(timeline, layer.id, timeline.currentFrameIndex)?.content ?? null)
      .filter((content): content is StickFigureFrameContent => content !== null),
    [timeline],
  );
  const onionOverlays = useMemo(() => isOnionEnabled && !isTimelinePlaying
    ? resolveEditableStickOnionOverlays(timeline, timeline.selectedTimelineIndex)
    : [], [isOnionEnabled, isTimelinePlaying, timeline]);
  onionEnabledRef.current = isOnionEnabled;
  onionOverlaysRef.current = onionOverlays;
  const selectedStructureJoint = useMemo(
    () => activeContent.structureGraph.joints.find((joint) => joint.id === selectedStructureJointId) ?? null,
    [activeContent, selectedStructureJointId],
  );
  const selectedStructureJointConnectionCount = useMemo(() => selectedStructureJoint
    ? activeContent.structureGraph.limbs.reduce(
        (count, limb) => count + (limb.startJointId === selectedStructureJoint.id || limb.endJointId === selectedStructureJoint.id ? 1 : 0), 0,
      )
    : 0, [activeContent, selectedStructureJoint]);

  useEffect(() => {
    if (!isTimelinePlaying || authoredPlaybackFrameCount <= 1) return;
    let animationFrame = 0;
    let lastTimestamp = 0;
    let accumulatorMs = 0;
    const tick = (timestamp: number) => {
      if (!isTimelinePlayingRef.current) return;
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
        animationFrame = window.requestAnimationFrame(tick);
        return;
      }
      const advanced = advancePlaybackAccumulator(
        accumulatorMs,
        timestamp - lastTimestamp,
        getClampedPlaybackFrameDurationMs(timelineRef.current.fps),
      );
      accumulatorMs = advanced.accumulatorMs;
      lastTimestamp = timestamp;
      if (advanced.steps > 0) {
        const current = cloneEditableStickTimelineState(timelineRef.current);
        for (let step = 0; step < advanced.steps; step += 1) {
          const count = getEditableStickPlaybackFrameCount(current);
          current.currentFrameIndex = current.currentFrameIndex >= count - 1 ? 0 : current.currentFrameIndex + 1;
          current.selectedTimelineIndex = current.currentFrameIndex;
        }
        publishView(current);
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [authoredPlaybackFrameCount, isTimelinePlaying, publishView]);

  const switchToFrame = useCallback((index: number) => {
    if (isTimelinePlayingRef.current) return;
    const current = cloneEditableStickTimelineState(timelineRef.current);
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, getEditableStickPlaybackFrameCount(current) - 1)));
    current.currentFrameIndex = nextIndex;
    current.selectedTimelineIndex = nextIndex;
    publishView(current);
    setSelection({target: "workspace"});
    setSelectedStructureJointId(null);
  }, [publishView]);
  const selectTimelinePosition = useCallback((index: number) => {
    const current = cloneEditableStickTimelineState(timelineRef.current);
    current.selectedTimelineIndex = Math.max(0, index);
    publishView(current);
  }, [publishView]);
  const activateLayer = useCallback((layerId: string) => {
    const current = timelineRef.current;
    if (!current.layers.some((layer) => layer.id === layerId) || current.activeLayerId === layerId) return;
    const next = cloneEditableStickTimelineState(current);
    next.activeLayerId = layerId;
    publishView(next);
    setSelection({target: "workspace"});
    setSelectedStructureJointId(null);
  }, [publishView]);

  const addLayer = useCallback(() => { mutateTimeline((current) => addEditableStickLayer(current)); }, [mutateTimeline]);
  const deleteActiveLayer = useCallback(() => {
    if (timelineRef.current.layers.length <= 1 || !window.confirm("Delete the active layer?")) return;
    mutateTimeline((current) => deleteEditableStickLayer(current, current.activeLayerId));
  }, [mutateTimeline]);
  const addTimelineFrame = useCallback((layerId: string, kind: TimelineFrameKind, targetIndex: number, options?: {blank?: boolean}) => {
    if (kind !== "tween") mutateTimeline((current) => insertEditableStickTimelineFrame(current, layerId, kind, targetIndex, options));
    setSelection({target: "workspace"});
  }, [mutateTimeline]);
  const removeTimelineFrame = useCallback((layerId: string, targetIndex: number) => {
    mutateTimeline((current) => removeEditableStickTimelineFrame(current, layerId, targetIndex));
    setSelection({target: "workspace"});
  }, [mutateTimeline]);
  const copyTimelineFrame = useCallback((layerId: string, targetIndex: number) => {
    if (isTimelinePlayingRef.current) return;
    const content = copyEditableStickTimelineFrame(timelineRef.current, layerId, targetIndex);
    if (!content) return;
    clipboardRef.current = content;
    setHasCopiedFrame(true);
  }, []);
  const pasteTimelineFrame = useCallback((layerId: string, targetIndex: number) => {
    if (!clipboardRef.current) return;
    const clipboard = clipboardRef.current;
    mutateTimeline((current) => pasteEditableStickTimelineFrame(current, layerId, targetIndex, clipboard));
    setSelection({target: "workspace"});
  }, [mutateTimeline]);
  const resizeTimelineSpan = useCallback((layerId: string, stateId: number, spanType: "frame" | "tween", nextEndIndex: number) => {
    if (spanType === "frame") mutateTimeline((current) => resizeEditableStickTimelineSpan(current, layerId, stateId, nextEndIndex));
  }, [mutateTimeline]);

  const handlePlay = useCallback(() => {
    if (!isReady || getEditableStickPlaybackFrameCount(timelineRef.current) <= 1) return;
    setStructureTool("idle");
    setIsTimelinePlaying(true);
  }, [isReady]);
  const activateSelectTool = useCallback(() => {
    setSelection({target: "workspace"});
    setActiveTool("Select");
    setStructureTool("idle");
    setRightPanelTab("Properties");
  }, []);
  const activateStructureLimbTool = useCallback(() => {
    if (!isReady || isTimelinePlayingRef.current ||
      !resolveEditableStickContent(timelineRef.current, timelineRef.current.activeLayerId, timelineRef.current.currentFrameIndex)) return;
    setSelection({target: "workspace"});
    setSelectedStructureJointId(null);
    setActiveTool(null);
    setCanvasMovementEnabled(false);
    setStructureTool("addLimb");
    setRightPanelTab("Stick Figure Tools");
  }, [isReady]);
  const selectStructureJoint = useCallback((jointId: string | null) => {
    setSelection({target: "workspace"});
    setRightPanelTab("Properties");
    setSelectedStructureJointId(jointId);
  }, []);

  const resetStickCanvasView = useCallback(() => {
    setStickCameraZoom(DEFAULT_STICK_CAMERA_ZOOM);
    setStickZoomInputValue(formatStickCameraZoom(DEFAULT_STICK_CAMERA_ZOOM));
    setStickCameraPan(DEFAULT_STICK_CAMERA_PAN);
  }, []);
  const updateStickCameraZoom = useCallback((zoom: number) => {
    const clamped = clampStickCameraZoom(zoom);
    setStickCameraZoom(clamped);
    setStickZoomInputValue(formatStickCameraZoom(clamped));
  }, []);
  const applyStickZoomInput = useCallback(() => {
    const match = stickZoomInputValue.match(/-?\d+(\.\d+)?/);
    if (!match || !Number.isFinite(Number(match[0]))) {
      setStickZoomInputValue(formatStickCameraZoom(stickCameraZoom));
      return;
    }
    updateStickCameraZoom(Number(match[0]) / 100);
  }, [stickCameraZoom, stickZoomInputValue, updateStickCameraZoom]);
  const clearCanvas = useCallback(() => {
    if (!window.confirm("Clear the current canvas? This will remove the visible artwork on this canvas.")) return;
    setSelection({target: "workspace"});
    setSelectedStructureJointId(null);
    updateContent((content) => {
      if (content.figures.length === 0 && content.structureGraph.joints.length === 0 && content.structureGraph.limbs.length === 0) return false;
      content.figures = [];
      content.structureGraph = {joints: [], limbs: [], activeJointId: null};
      return true;
    });
  }, [updateContent]);
  const setCanvasMovement = useCallback((enabled: boolean) => {
    setCanvasMovementEnabled(enabled);
    setRightPanelTab("Properties");
    if (enabled) setSelectedStructureJointId(null);
  }, []);
  const moveJoint = useCallback((jointId: string, point: StickFigurePoint) => {
    updateContent((content) => {
      const joint = content.structureGraph.joints.find((candidate) => candidate.id === jointId);
      if (!joint || (joint.x === point.x && joint.y === point.y)) return false;
      joint.x = point.x;
      joint.y = point.y;
      content.structureGraph.activeJointId = null;
      return true;
    });
  }, [updateContent]);
  const commitSegment = useCallback((draft: StickFigureStructureSegmentDraft) => {
    if (Math.hypot(draft.endPoint.x - draft.startPoint.x, draft.endPoint.y - draft.startPoint.y) < 18) return;
    updateContent((content) => {
      const graph = content.structureGraph;
      let nextJoint = Math.max(0, ...graph.joints.map((joint) => Number(joint.id.match(/^stick-joint-(\d+)$/)?.[1] ?? 0))) + 1;
      const nextLimb = Math.max(0, ...graph.limbs.map((limb) => Number(limb.id.match(/^stick-limb-(\d+)$/)?.[1] ?? 0))) + 1;
      const resolveJoint = (existingId: string | null | undefined, point: StickFigurePoint) => {
        if (existingId && graph.joints.some((joint) => joint.id === existingId)) return existingId;
        const id = `stick-joint-${nextJoint++}`;
        graph.joints.push({id, x: point.x, y: point.y});
        return id;
      };
      const startJointId = resolveJoint(draft.startJointId, draft.startPoint);
      const endJointId = resolveJoint(draft.endJointId, draft.endPoint);
      if (startJointId === endJointId || graph.limbs.some((limb) =>
        (limb.startJointId === startJointId && limb.endJointId === endJointId) ||
        (limb.startJointId === endJointId && limb.endJointId === startJointId))) return false;
      graph.limbs.push({id: `stick-limb-${nextLimb}`, startJointId, endJointId});
      graph.activeJointId = null;
      return true;
    });
  }, [updateContent]);

  const traverseHistory = useCallback(async (direction: "undo" | "redo") => {
    const base = workspaceRootRef.current;
    if (!base || base.documentPublication.status !== "ready" || isTimelinePlayingRef.current) return;
    if ((direction === "undo" ? base.editorRoot.undo : base.editorRoot.redo).length === 0) return;
    const editorRoot = direction === "undo"
      ? await undoEditableStickHistory(base.editorRoot)
      : await redoEditableStickHistory(base.editorRoot);
    if (!editorRoot) return;
    const ready = workspaceRootRef.current;
    if (!ready || ready.documentPublication.status !== "ready" || ready.workspaceInstanceId !== base.workspaceInstanceId ||
      ready.workspaceGeneration !== base.workspaceGeneration || ready.editorRoot.current.documentDigest !== base.editorRoot.current.documentDigest) return;
    const operationId = newWorkspaceId();
    installRoot({...ready, documentPublication: {
      status: "pending",
      operationId,
      baseDigest: base.editorRoot.current.documentDigest,
      baseGeneration: base.workspaceGeneration,
    }});
    const live = workspaceRootRef.current;
    if (!live || live.documentPublication.status !== "pending" || live.documentPublication.operationId !== operationId ||
      live.documentPublication.baseDigest !== base.editorRoot.current.documentDigest || live.documentPublication.baseGeneration !== base.workspaceGeneration ||
      live.workspaceInstanceId !== base.workspaceInstanceId) return;
    installRoot({...live, editorRoot, workspaceGeneration: base.workspaceGeneration + 1, documentPublication: {status: "ready"}});
    readyDocumentPublicationCountRef.current += 1;
    setSaveError(null);
  }, [installRoot]);

  const handleSave = useCallback(() => {
    const captured = workspaceRootRef.current;
    if (!captured || captured.documentPublication.status !== "ready") return;
    const {document, viewState} = captured.editorRoot.current.snapshot;
    const capturedDigest = captured.editorRoot.current.documentDigest;
    void saveStickProject(window.localStorage, document, viewState).then((result) => {
      if (!result.ok) {
        setSaveError(stickStorageErrorMessage(result.error));
        return;
      }
      const live = workspaceRootRef.current;
      if (live && live.workspaceInstanceId === captured.workspaceInstanceId &&
        live.editorRoot.current.snapshot.document.projectId === document.projectId) {
        installRoot({...live, lastSavedDocumentDigest: capturedDigest});
      }
      setSaveError(null);
    });
  }, [installRoot]);

  const readCheckpoint = useCallback(async () => {
    const current = timelineRef.current;
    const root = workspaceRootRef.current;
    const previous = onionOverlaysRef.current.find((overlay) => overlay.side === "previous") ?? null;
    const next = onionOverlaysRef.current.find((overlay) => overlay.side === "next") ?? null;
    const storedBytes = window.localStorage.getItem("da_saved_stick_projects_v1");
    return {
      checkpointVersion: 1,
      rootStatus: root?.documentPublication.status ?? "mounting",
      documentDigestStatus: root?.documentPublication.status ?? "mounting",
      editorRootDigest: root ? await digestCanonical(root.editorRoot.current) : null,
      workspaceRootDigest: root ? await digestCanonical(root) : null,
      documentDigest: root?.editorRoot.current.documentDigest ?? null,
      documentRevision: root?.editorRoot.current.snapshot.document.documentRevision ?? null,
      viewDigest: root ? await digestCanonical(root.editorRoot.current.snapshot.viewState) : null,
      historyRootDigest: root ? await digestCanonical({undo: root.editorRoot.undo, redo: root.editorRoot.redo}) : null,
      undoDepth: root?.editorRoot.undo.length ?? 0,
      redoDepth: root?.editorRoot.redo.length ?? 0,
      lastSavedDocumentDigest: root?.lastSavedDocumentDigest ?? null,
      dirty: root ? root.lastSavedDocumentDigest !== root.editorRoot.current.documentDigest : null,
      workspaceInstanceDigest: root ? await digestCanonical(root.workspaceInstanceId) : null,
      workspaceGeneration: root?.workspaceGeneration ?? null,
      storageDigest: storedBytes === null ? null : await digestCanonical(storedBytes),
      currentFrameIndex: current.currentFrameIndex,
      selectedTimelineIndex: current.selectedTimelineIndex,
      gestureState: null,
      dragPreviewPoint: null,
      completedEditCount: root?.editorRoot.current.snapshot.document.documentRevision ?? 0,
      playbackState: isTimelinePlayingRef.current ? "playing" : "paused",
      playbackFrameIndex: current.currentFrameIndex,
      playbackControlAvailable: Boolean(root?.documentPublication.status === "ready" && getEditableStickPlaybackFrameCount(current) > 1),
      mountedOpenStatus: mountedOpenRef.current.status,
      mountedOpenOperationDigest: mountedOpenRef.current.operationId ? await digestCanonical(mountedOpenRef.current.operationId) : null,
      onionEnabled: onionEnabledRef.current,
      previousOnionRenderInputDigest: previous ? await digestCanonical({content: previous.content, tint: previous.tint}) : null,
      nextOnionRenderInputDigest: next ? await digestCanonical({content: next.content, tint: next.tint}) : null,
      readyDocumentPublicationCount: readyDocumentPublicationCountRef.current,
      workspaceRootTransitionCount: workspaceRootTransitionCountRef.current,
    };
  }, []);

  const spec0001Phase2BrowserPortsV1 = {
    mountDocument: async () => ({accepted: false, outcome: "unsupported_fixture"}),
    dispatchCompletedJointEdit: async () => ({accepted: false, outcome: "use_visible_canvas"}),
    beginDocumentPublication: async () => ({accepted: false, outcome: "history_free"}),
    completeDocumentPublication: async () => ({accepted: false, outcome: "history_free"}),
    readCheckpoint,
  };
  void spec0001Phase2BrowserPortsV1;

  const mountEditorHistoryRoot = async (fixture: unknown, operationId: string) => {
    if (!isPlainRecord(fixture) || !hasExactKeys(fixture, [
      "kind", "mountVersion", "editorHistoryRoot", "savedBaselineMode", "expectedWorkspaceGeneration", "workspaceInstancePolicy",
    ]) || fixture.kind !== "stick-workspace-history-mount-v1" || fixture.mountVersion !== 1 ||
      fixture.savedBaselineMode !== "none" && fixture.savedBaselineMode !== "current_document" ||
      fixture.expectedWorkspaceGeneration !== 1 || fixture.workspaceInstancePolicy !== "new_deterministic_uuid" ||
      !isPlainRecord(fixture.editorHistoryRoot) || !hasExactKeys(fixture.editorHistoryRoot, ["current", "undo", "redo"]) ||
      !Array.isArray(fixture.editorHistoryRoot.undo) || !Array.isArray(fixture.editorHistoryRoot.redo) ||
      fixture.editorHistoryRoot.undo.length > 128 || fixture.editorHistoryRoot.redo.length > 128) {
      return {accepted: false, outcomeCode: "fixture_rejected", errorCode: "invalid_request"};
    }
    const candidate = fixture.editorHistoryRoot as unknown as EditableStickEditorHistoryRootV1;
    const versions = [candidate.current, ...candidate.undo, ...candidate.redo];
    for (const version of versions) {
      if (!isPlainRecord(version) || !hasExactKeys(version, ["snapshot", "documentDigest"]) ||
        typeof version.documentDigest !== "string" || !isPlainRecord(version.snapshot) ||
        !hasExactKeys(version.snapshot, ["document", "viewState"]) ||
        !validateEditableStickProjectDocument(version.snapshot.document) ||
        !validateEditableStickProjectViewState(version.snapshot.viewState, version.snapshot.document) ||
        !(await verifyEditableStickEditorVersion(version as EditableStickEditorHistoryRootV1["current"]))) {
        return {accepted: false, outcomeCode: "fixture_rejected", errorCode: "invalid_request"};
      }
    }
    setIsTimelinePlaying(false);
    setIsOnionEnabled(false);
    setSelection({target: "workspace"});
    setSelectedStructureJointId(null);
    setStructureTool("idle");
    clipboardRef.current = null;
    setHasCopiedFrame(false);
    pendingDocumentPublicationRef.current = null;
    pendingMountedOpenRef.current = null;
    mountedOpenRef.current = {status: null, operationId: null};
    installRoot({
      workspaceInstanceId: await deterministicWorkspaceId(operationId),
      editorRoot: JSON.parse(canonicalJson(candidate)) as EditableStickEditorHistoryRootV1,
      workspaceGeneration: 1,
      documentPublication: {status: "ready"},
      lastSavedDocumentDigest: fixture.savedBaselineMode === "current_document" ? candidate.current.documentDigest : null,
    });
    readyDocumentPublicationCountRef.current += 1;
    setSaveError(null);
    return {accepted: true, outcomeCode: "mounted", errorCode: null};
  };

  const preparedFpsCandidate = async (
    root: StickMountedWorkspaceRoot,
    mutation: unknown,
    expectedDocumentDigest: unknown,
  ) => {
    if (!isPlainRecord(mutation) || !hasExactKeys(mutation, ["operation", "fps"]) ||
      mutation.operation !== "set_fps" || !Number.isSafeInteger(mutation.fps) ||
      Number(mutation.fps) < 1 || Number(mutation.fps) > 55 ||
      typeof expectedDocumentDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(expectedDocumentDigest)) return null;
    const snapshot = JSON.parse(canonicalJson(root.editorRoot.current.snapshot)) as EditableStickProjectSnapshotV1;
    snapshot.document.fps = Number(mutation.fps);
    snapshot.document.documentRevision += 1;
    const observedDigest = await digestCanonical(snapshot.document);
    if (observedDigest !== expectedDocumentDigest || observedDigest === root.editorRoot.current.documentDigest) return null;
    return {snapshot, observedDigest};
  };

  const dispatchEditorTransaction = async (fixture: unknown) => {
    if (!isPlainRecord(fixture) || !hasExactKeys(fixture, [
      "fixtureVersion", "kind", "transactionVersion", "baseDocumentDigest", "baseWorkspaceGeneration",
      "mutation", "expectedDocumentDigest", "cases",
    ]) || fixture.fixtureVersion !== 1 || fixture.kind !== "stick-editor-transaction-v1" || fixture.transactionVersion !== 1 ||
      typeof fixture.baseDocumentDigest !== "string" || !Number.isSafeInteger(fixture.baseWorkspaceGeneration) ||
      !Array.isArray(fixture.cases)) {
      return {accepted: false, outcomeCode: "transaction_rejected", errorCode: "invalid_request"};
    }
    const base = workspaceRootRef.current;
    if (!base || base.documentPublication.status !== "ready") {
      return {accepted: false, outcomeCode: "transaction_rejected", errorCode: "document_not_ready"};
    }
    if (base.editorRoot.current.documentDigest !== fixture.baseDocumentDigest ||
      base.workspaceGeneration !== fixture.baseWorkspaceGeneration) {
      return {accepted: true, outcomeCode: "stale_noop", errorCode: null};
    }
    const candidate = await preparedFpsCandidate(base, fixture.mutation, fixture.expectedDocumentDigest);
    if (!candidate) return {accepted: false, outcomeCode: "transaction_rejected", errorCode: "invalid_request"};
    const editorRoot = await commitEditableStickHistory(base.editorRoot, candidate.snapshot);
    const live = workspaceRootRef.current;
    if (!live || live.workspaceInstanceId !== base.workspaceInstanceId || live.documentPublication.status !== "ready" ||
      live.editorRoot.current.documentDigest !== base.editorRoot.current.documentDigest || live.workspaceGeneration !== base.workspaceGeneration) {
      return {accepted: true, outcomeCode: "stale_noop", errorCode: null};
    }
    installRoot({...live, editorRoot, workspaceGeneration: live.workspaceGeneration + 1, documentPublication: {status: "ready"}});
    readyDocumentPublicationCountRef.current += 1;
    return {accepted: true, outcomeCode: "committed", errorCode: null};
  };

  const beginDocumentPublication = async (fixture: unknown, operationId: string) => {
    if (!isPlainRecord(fixture) || !hasExactKeys(fixture, [
      "fixtureVersion", "kind", "publicationVersion", "baseDocumentDigest", "baseWorkspaceGeneration",
      "mutation", "expectedDocumentDigest", "entryLimit", "byteLimit", "cases",
    ]) || fixture.fixtureVersion !== 1 || fixture.kind !== "stick-document-publication-plan-v1" || fixture.publicationVersion !== 1 ||
      typeof fixture.baseDocumentDigest !== "string" || !Number.isSafeInteger(fixture.baseWorkspaceGeneration) ||
      fixture.entryLimit !== 128 || fixture.byteLimit !== 16_777_216 || !Array.isArray(fixture.cases)) {
      return {accepted: false, outcomeCode: "publication_rejected", errorCode: "invalid_request"};
    }
    const base = workspaceRootRef.current;
    if (!base || base.documentPublication.status !== "ready" || pendingDocumentPublicationRef.current) {
      return {accepted: false, outcomeCode: "publication_rejected", errorCode: "document_not_ready"};
    }
    if (base.editorRoot.current.documentDigest !== fixture.baseDocumentDigest || base.workspaceGeneration !== fixture.baseWorkspaceGeneration) {
      return {accepted: false, outcomeCode: "publication_rejected", errorCode: "stale_document"};
    }
    const candidate = await preparedFpsCandidate(base, fixture.mutation, fixture.expectedDocumentDigest);
    if (!candidate) return {accepted: false, outcomeCode: "publication_rejected", errorCode: "invalid_request"};
    const candidateEditorRoot = await commitEditableStickHistory(base.editorRoot, candidate.snapshot);
    const live = workspaceRootRef.current;
    if (!live || live.workspaceInstanceId !== base.workspaceInstanceId || live.documentPublication.status !== "ready" ||
      live.editorRoot.current.documentDigest !== base.editorRoot.current.documentDigest || live.workspaceGeneration !== base.workspaceGeneration) {
      return {accepted: false, outcomeCode: "publication_rejected", errorCode: "stale_document"};
    }
    pendingDocumentPublicationRef.current = {
      operationId,
      baseWorkspaceInstanceId: base.workspaceInstanceId,
      baseDocumentDigest: base.editorRoot.current.documentDigest,
      baseWorkspaceGeneration: base.workspaceGeneration,
      candidateEditorRoot,
    };
    installRoot({...live, documentPublication: {
      status: "pending", operationId, baseDigest: base.editorRoot.current.documentDigest, baseGeneration: base.workspaceGeneration,
    }});
    return {accepted: true, outcomeCode: "publication_pending", errorCode: null};
  };

  const completeDocumentPublication = async (fixture: unknown) => {
    if (!isPlainRecord(fixture) || !hasExactKeys(fixture, [
      "fixtureVersion", "kind", "completionVersion", "targetOperationId", "action", "expectedDocumentDigest", "cases",
    ]) || fixture.fixtureVersion !== 1 || fixture.kind !== "stick-document-publication-completion-v1" || fixture.completionVersion !== 1 ||
      typeof fixture.targetOperationId !== "string" || fixture.action !== "resolve" ||
      typeof fixture.expectedDocumentDigest !== "string" || !Array.isArray(fixture.cases)) {
      return {accepted: false, outcomeCode: "tamper_rejected", errorCode: "invalid_request"};
    }
    const pending = pendingDocumentPublicationRef.current;
    const live = workspaceRootRef.current;
    if (!pending || pending.operationId !== fixture.targetOperationId || !live || live.documentPublication.status !== "pending" ||
      live.documentPublication.operationId !== fixture.targetOperationId || live.workspaceInstanceId !== pending.baseWorkspaceInstanceId ||
      live.editorRoot.current.documentDigest !== pending.baseDocumentDigest || live.workspaceGeneration !== pending.baseWorkspaceGeneration) {
      return {accepted: true, outcomeCode: "stale_noop", errorCode: null};
    }
    if (pending.candidateEditorRoot.current.documentDigest !== fixture.expectedDocumentDigest ||
      !(await verifyEditableStickEditorVersion(pending.candidateEditorRoot.current))) {
      pendingDocumentPublicationRef.current = null;
      installRoot({...live, documentPublication: {status: "failed"}});
      return {accepted: false, outcomeCode: "tamper_rejected", errorCode: "document_digest_failed"};
    }
    pendingDocumentPublicationRef.current = null;
    installRoot({...live, editorRoot: pending.candidateEditorRoot, workspaceGeneration: live.workspaceGeneration + 1, documentPublication: {status: "ready"}});
    readyDocumentPublicationCountRef.current += 1;
    return {accepted: true, outcomeCode: "publication_ready", errorCode: null};
  };

  const beginMountedOpen = async (fixture: unknown, operationId: string) => {
    if (isTimelinePlayingRef.current) {
      return {accepted: false, outcomeCode: "mounted_open_rejected", errorCode: "playback_must_be_paused"};
    }
    if (!isPlainRecord(fixture) || !hasExactKeys(fixture, [
      "fixtureVersion", "kind", "candidateVersion", "baseDocumentDigest", "baseWorkspaceGeneration", "candidateIdentity",
      "expectedDocumentDigest", "purpose", "frameOffsets", "expectedOnionSides",
    ]) || fixture.fixtureVersion !== 1 || fixture.kind !== "stick-mounted-open-candidate-v1" || fixture.candidateVersion !== 1 ||
      typeof fixture.baseDocumentDigest !== "string" || !Number.isSafeInteger(fixture.baseWorkspaceGeneration) ||
      !isPlainRecord(fixture.candidateIdentity) || !hasExactKeys(fixture.candidateIdentity, ["projectId", "documentRevision", "title", "fps"]) ||
      typeof fixture.candidateIdentity.projectId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(fixture.candidateIdentity.projectId) ||
      fixture.candidateIdentity.documentRevision !== 0 || typeof fixture.candidateIdentity.title !== "string" ||
      !Number.isSafeInteger(fixture.candidateIdentity.fps) || typeof fixture.expectedDocumentDigest !== "string" ||
      typeof fixture.purpose !== "string" || !Array.isArray(fixture.frameOffsets) || !Array.isArray(fixture.expectedOnionSides)) {
      return {accepted: false, outcomeCode: "mounted_open_rejected", errorCode: "invalid_open_candidate"};
    }
    const base = workspaceRootRef.current;
    if (!base || base.documentPublication.status !== "ready" || pendingMountedOpenRef.current ||
      base.editorRoot.current.documentDigest !== fixture.baseDocumentDigest || base.workspaceGeneration !== fixture.baseWorkspaceGeneration) {
      return {accepted: false, outcomeCode: "mounted_open_rejected", errorCode: "stale_mounted_open"};
    }
    const snapshot = JSON.parse(canonicalJson(base.editorRoot.current.snapshot)) as EditableStickProjectSnapshotV1;
    snapshot.document = {
      ...snapshot.document,
      projectId: fixture.candidateIdentity.projectId,
      documentRevision: fixture.candidateIdentity.documentRevision,
      title: fixture.candidateIdentity.title,
      fps: Number(fixture.candidateIdentity.fps),
    };
    if (!validateEditableStickProjectDocument(snapshot.document) || !validateEditableStickProjectViewState(snapshot.viewState, snapshot.document) ||
      await digestCanonical(snapshot.document) !== fixture.expectedDocumentDigest) {
      return {accepted: false, outcomeCode: "mounted_open_rejected", errorCode: "document_digest_failed"};
    }
    const candidateEditorRoot = await createEditableStickHistoryRoot(snapshot);
    const live = workspaceRootRef.current;
    if (!live || live.workspaceInstanceId !== base.workspaceInstanceId || live.documentPublication.status !== "ready" ||
      live.editorRoot.current.documentDigest !== base.editorRoot.current.documentDigest || live.workspaceGeneration !== base.workspaceGeneration) {
      return {accepted: false, outcomeCode: "mounted_open_rejected", errorCode: "stale_mounted_open"};
    }
    pendingMountedOpenRef.current = {operationId, baseRoot: live, candidateEditorRoot};
    mountedOpenRef.current = {status: "pending", operationId};
    installRoot({...live, documentPublication: {
      status: "pending", operationId, baseDigest: live.editorRoot.current.documentDigest, baseGeneration: live.workspaceGeneration,
    }});
    return {accepted: true, outcomeCode: "mounted_open_pending", errorCode: null};
  };

  const completeMountedOpen = async (fixture: unknown) => {
    if (!isPlainRecord(fixture) || !hasExactKeys(fixture, [
      "fixtureVersion", "kind", "completionVersion", "targetOperationId", "action", "expectedDocumentDigest",
      "purpose", "layers", "frames", "fps", "waveEligible",
    ]) || fixture.fixtureVersion !== 1 || fixture.kind !== "stick-mounted-open-completion-v1" || fixture.completionVersion !== 1 ||
      typeof fixture.targetOperationId !== "string" || fixture.action !== "apply" || typeof fixture.expectedDocumentDigest !== "string" ||
      typeof fixture.purpose !== "string" || !Number.isSafeInteger(fixture.layers) || !Number.isSafeInteger(fixture.frames) ||
      !Number.isSafeInteger(fixture.fps) || fixture.waveEligible !== false) {
      return {accepted: false, outcomeCode: "mounted_open_failed", errorCode: "invalid_open_candidate"};
    }
    const pending = pendingMountedOpenRef.current;
    const live = workspaceRootRef.current;
    if (!pending || pending.operationId !== fixture.targetOperationId || !live || live.documentPublication.status !== "pending" ||
      live.documentPublication.operationId !== fixture.targetOperationId || live.workspaceInstanceId !== pending.baseRoot.workspaceInstanceId ||
      live.editorRoot.current.documentDigest !== pending.baseRoot.editorRoot.current.documentDigest ||
      live.workspaceGeneration !== pending.baseRoot.workspaceGeneration) {
      return {accepted: true, outcomeCode: "mounted_open_stale", errorCode: "stale_mounted_open"};
    }
    if (pending.candidateEditorRoot.current.documentDigest !== fixture.expectedDocumentDigest ||
      !(await verifyEditableStickEditorVersion(pending.candidateEditorRoot.current))) {
      pendingMountedOpenRef.current = null;
      mountedOpenRef.current = {status: "failed", operationId: fixture.targetOperationId};
      installRoot({...pending.baseRoot, documentPublication: {status: "ready"}});
      return {accepted: false, outcomeCode: "mounted_open_failed", errorCode: "document_digest_failed"};
    }
    pendingMountedOpenRef.current = null;
    pendingDocumentPublicationRef.current = null;
    mountedOpenRef.current = {status: "applied", operationId: fixture.targetOperationId};
    setIsTimelinePlaying(false);
    setIsOnionEnabled(false);
    setSelection({target: "workspace"});
    setSelectedStructureJointId(null);
    setStructureTool("idle");
    clipboardRef.current = null;
    setHasCopiedFrame(false);
    installRoot({
      workspaceInstanceId: await deterministicWorkspaceId(fixture.targetOperationId),
      editorRoot: pending.candidateEditorRoot,
      workspaceGeneration: 1,
      documentPublication: {status: "ready"},
      lastSavedDocumentDigest: pending.candidateEditorRoot.current.documentDigest,
    });
    readyDocumentPublicationCountRef.current += 1;
    return {accepted: true, outcomeCode: "mounted_open_applied", errorCode: null};
  };

  const cancelMountedOpen = async (fixture: unknown) => {
    if (!isPlainRecord(fixture) || !hasExactKeys(fixture, [
      "fixtureVersion", "kind", "cancelVersion", "targetOperationId", "storageVersion", "projects",
    ]) || fixture.fixtureVersion !== 1 || fixture.kind !== "stick-mounted-open-cancel-v1" || fixture.cancelVersion !== 1 ||
      typeof fixture.targetOperationId !== "string" || fixture.storageVersion !== 1 || !Array.isArray(fixture.projects)) {
      return {accepted: true, outcomeCode: "already_terminal", errorCode: null};
    }
    const pending = pendingMountedOpenRef.current;
    if (!pending || pending.operationId !== fixture.targetOperationId) {
      return {accepted: true, outcomeCode: "already_terminal", errorCode: null};
    }
    pendingMountedOpenRef.current = null;
    mountedOpenRef.current = {status: "cancelled", operationId: fixture.targetOperationId};
    installRoot({...pending.baseRoot, documentPublication: {status: "ready"}});
    return {accepted: true, outcomeCode: "mounted_open_cancelled", errorCode: null};
  };

  const spec0001Phase3BrowserPortsV1 = {
    mountEditorHistoryRoot,
    dispatchEditorTransaction,
    beginDocumentPublication,
    completeDocumentPublication,
    beginMountedOpen,
    completeMountedOpen,
    cancelMountedOpen,
    readCheckpoint,
  };
  void spec0001Phase3BrowserPortsV1;

  /* SPEC0001_BROWSER_DRIVER_ANCHOR_V1 */

  const isDirty = workspaceRoot ? workspaceRoot.lastSavedDocumentDigest !== workspaceRoot.editorRoot.current.documentDigest : true;
  const statusText = saveError ?? (isDirty ? "Unsaved changes" : "Saved on this browser");
  const statusDisclosure = !saveError && !isDirty
    ? "Saved only in this browser. This version does not cloud-sync, appear on another device, or automatically recover after data is cleared or lost."
    : undefined;

  return (
    <div style={{height: "100vh", background: "rgb(26, 27, 36)", display: "flex", flexDirection: "column", overflow: "hidden"}}>
      <StickFigureTopBar
        projectTitle={workspaceRoot?.editorRoot.current.snapshot.document.title ?? "Unnamed stick figure project"}
        onSave={handleSave}
        onUndo={() => void traverseHistory("undo")}
        onRedo={() => void traverseHistory("redo")}
        canUndo={Boolean(isReady && workspaceRoot?.editorRoot.undo.length)}
        canRedo={Boolean(isReady && workspaceRoot?.editorRoot.redo.length)}
        statusText={statusText}
        statusDisclosure={statusDisclosure}
      />
      <StickFigureTimelineRow
        fps={timeline.fps}
        isPlaying={isTimelinePlaying}
        isOnionEnabled={isOnionEnabled}
        currentFrameIndex={timeline.currentFrameIndex}
        selectedTimelineIndex={timeline.selectedTimelineIndex}
        activeLayerId={timeline.activeLayerId}
        layers={timeline.layers}
        onFpsChange={(fps) => mutateTimeline((current) => {
          const nextFps = Math.max(1, Math.min(55, fps));
          if (current.fps === nextFps) return null;
          current.fps = nextFps;
          return current;
        })}
        onCurrentFrameChange={switchToFrame}
        onTimelinePositionSelect={selectTimelinePosition}
        onActiveLayerChange={activateLayer}
        onAddLayer={addLayer}
        onDeleteLayer={deleteActiveLayer}
        canDeleteLayer={timeline.layers.length > 1}
        onToggleOnion={() => setIsOnionEnabled((current) => !current)}
        onPlay={handlePlay}
        onPause={() => setIsTimelinePlaying(false)}
        onAddFrame={addTimelineFrame}
        onRemoveFrame={removeTimelineFrame}
        onCopyFrame={copyTimelineFrame}
        onPasteFrame={pasteTimelineFrame}
        canPasteFrame={hasCopiedFrame}
        onResizeTimelineSpan={resizeTimelineSpan}
      />
      <div style={{flex: 1, minHeight: 0, display: "flex"}}>
        <StickFigureCanvas
          figures={activeContent.figures}
          backgroundContents={backgroundContents}
          selection={selection}
          onSelectFigure={(figureId) => setSelection({target: "figure", figureId})}
          activeTool={activeTool}
          structureTool={structureTool}
          structureGraph={activeContent.structureGraph}
          selectedStructureJointId={selectedStructureJointId}
          onionOverlays={onionOverlays}
          canvasMovementEnabled={canvasMovementEnabled}
          cameraZoom={stickCameraZoom}
          cameraPan={stickCameraPan}
          canvasBackgroundColor={canvasBackgroundColor}
          onCommitStructureSegment={commitSegment}
          onSelectStructureJoint={selectStructureJoint}
          onCommitStructureJointMove={moveJoint}
          onCameraZoomChange={updateStickCameraZoom}
          onCameraPanChange={setStickCameraPan}
        />
        <StickFigureRightPanel
          activeTab={rightPanelTab}
          onActiveTabChange={setRightPanelTab}
          activeTool={activeTool}
          structureTool={structureTool}
          structureJointCount={activeContent.structureGraph.joints.length}
          structureLimbCount={activeContent.structureGraph.limbs.length}
          selectedStructureJoint={selectedStructureJoint}
          selectedStructureJointConnectionCount={selectedStructureJointConnectionCount}
          canvasMovementEnabled={canvasMovementEnabled}
          zoomInputValue={stickZoomInputValue}
          canvasBackgroundColor={canvasBackgroundColor}
          onActivateStructureLimb={activateStructureLimbTool}
          onOpenStickFigureCreator={onOpenStickFigureCreator}
          onCanvasMovementChange={setCanvasMovement}
          onClearStructureSelection={() => selectStructureJoint(null)}
          onZoomInputChange={setStickZoomInputValue}
          onApplyZoomInput={applyStickZoomInput}
          onResetCanvasView={resetStickCanvasView}
          onClearCanvasContent={clearCanvas}
          onCanvasBackgroundColorChange={setCanvasBackgroundColor}
        />
      </div>
      <StickFigureToolBar activeTool={activeTool} onSelectTool={activateSelectTool} />
      <output data-testid="stick-editable-timeline-state" style={{position: "absolute", left: -10000}}>
        {timeline.layers.length}:{authoredPlaybackFrameCount}:{timeline.currentFrameIndex}:{timeline.selectedTimelineIndex}
      </output>
    </div>
  );
}
