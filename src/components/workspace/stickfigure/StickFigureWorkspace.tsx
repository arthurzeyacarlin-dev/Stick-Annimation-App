import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  canonicalJson,
  digestCanonical,
  parseStickProjectDocument,
} from "../../../lib/stickfigure/stickProjectContract";
import {
  STICK_COMMAND_FAILURE_POINTS,
  StickFigureCommandTransactionV1,
  createStickCommandWorkspaceRoot,
  type StickCommandFailurePointV1,
  type StickCommandOperationOutcomeV1,
  type StickCommandWorkspaceRootV1,
} from "../../../lib/ai/stickFigureCommandExecutor";
import {parseStickCommandInput, type StickCommandInputV1, type StickCommandResultV1} from "../../../lib/ai/stickFigureAiContract";
import {
  STICK_AI_EDITOR_RENDER_SPACE_V2,
  StickFigureAiWorkspaceAdapterV2,
  isStickAiCanonicalStructureGraphV2,
  stickAiPhase4FixtureV2,
} from "../../../lib/ai/stickFigureAiWorkspaceAdapter";
import {
  commitEditableStickHistory,
  consumeStickAiCreationLatch,
  createStickAiCreationLatch,
  createEditableStickHistoryRoot,
  editableStickTimelineFromCanonicalAnimation,
  editableStickDocumentFromTimeline,
  editableStickTimelineFromSnapshot,
  editableStickViewFromTimeline,
  isEligibleEditableStickAiStarter,
  isEligibleEditableStickWaveStarter,
  redoEditableStickHistory,
  replaceEditableStickCurrentView,
  resolveEditableStickOnionOverlays,
  undoEditableStickHistory,
  verifyEditableStickEditorVersion,
  type EditableStickEditorHistoryRootV1,
  type EditableStickProjectSnapshotV1,
  type StickAiCreationLatchV1,
} from "../../../lib/stickfigure/stickProjectHistory";
import {
  openStickSavedProject,
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
import {StickFigureCreatorWorkspace} from "./StickFigureCreatorWorkspace";
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
  aiCreationLatch: StickAiCreationLatchV1;
  workspaceGeneration: number;
  documentPublication: StickPublicationState;
  lastSavedDocumentDigest: string | null;
  phase4: Phase4MountedCommandState | null;
};

type Phase4MountedCommandState = {
  commandRoot: StickCommandWorkspaceRootV1;
  canonicalStarterDigest: string;
  baseWorkspaceInstanceId: string;
  baseWorkspaceGeneration: number;
  baseDocumentDigest: string;
  pendingApplyOperationId: string | null;
  lastCommandOutcomeCode: StickCommandOperationOutcomeV1["outcomeCode"] | null;
  lastCommandResult: StickCommandResultV1 | null;
  commandRootTransitionCount: number;
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

type InvalidatedPhase4Publication = {
  machine: StickFigureCommandTransactionV1;
  baseWorkspaceInstanceId: string;
  canonicalStarterDigest: string;
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

type StickAiStageProjection = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

const stableCoordinate = (value: number) => Math.round(value * 1000) / 1000;

const createStickAiStageProjection = (width: number, height: number): StickAiStageProjection | null => {
  if (!(width > 0) || !(height > 0)) return null;
  const scale = Math.min(
    width / STICK_AI_EDITOR_RENDER_SPACE_V2.width,
    height / STICK_AI_EDITOR_RENDER_SPACE_V2.height,
  );
  return {
    scale,
    offsetX: (width - STICK_AI_EDITOR_RENDER_SPACE_V2.width * scale) / 2,
    offsetY: (height - STICK_AI_EDITOR_RENDER_SPACE_V2.height * scale) / 2,
  };
};

const projectStickAiPoint = (point: StickFigurePoint, projection: StickAiStageProjection): StickFigurePoint => ({
  x: stableCoordinate(projection.offsetX + point.x * projection.scale),
  y: stableCoordinate(projection.offsetY + point.y * projection.scale),
});

const unprojectStickAiPoint = (point: StickFigurePoint, projection: StickAiStageProjection): StickFigurePoint => ({
  x: stableCoordinate((point.x - projection.offsetX) / projection.scale),
  y: stableCoordinate((point.y - projection.offsetY) / projection.scale),
});

const projectStickAiContent = (
  content: StickFigureFrameContent,
  projection: StickAiStageProjection | null,
): StickFigureFrameContent => {
  if (!projection || !isStickAiCanonicalStructureGraphV2(content.structureGraph)) return content;
  return {
    ...content,
    structureGraph: {
      ...content.structureGraph,
      joints: content.structureGraph.joints.map((joint) => ({...joint, ...projectStickAiPoint(joint, projection)})),
    },
  };
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
  const initialAiCreationLatchRef = useRef<StickAiCreationLatchV1 | null>(null);
  if (!initialAiCreationLatchRef.current) {
    initialAiCreationLatchRef.current = initialProject?.recordVersion === 2
      ? JSON.parse(canonicalJson(initialProject.aiCreationLatch)) as StickAiCreationLatchV1
      : createStickAiCreationLatch(
          initialSnapshotRef.current.document.projectId,
          initialProject ? "consumed" : "unconsumed",
        );
  }
  const initialTimelineRef = useRef(editableStickTimelineFromSnapshot(initialSnapshotRef.current));
  const [workspaceRoot, setWorkspaceRoot] = useState<StickMountedWorkspaceRoot | null>(null);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const workspaceRootRef = useRef<StickMountedWorkspaceRoot | null>(null);
  const timelineRef = useRef(initialTimelineRef.current);
  const isTimelinePlayingRef = useRef(false);
  const clipboardRef = useRef<StickFigureFrameContent | null>(null);
  const readyDocumentPublicationCountRef = useRef(0);
  const workspaceRootTransitionCountRef = useRef(0);
  const mountedOpenRef = useRef<{status: string | null; operationId: string | null}>({status: null, operationId: null});
  const pendingDocumentPublicationRef = useRef<PendingDocumentPublication | null>(null);
  const pendingMountedOpenRef = useRef<PendingMountedOpen | null>(null);
  const phase4ExecutorRef = useRef<StickFigureCommandTransactionV1 | null>(null);
  const invalidatedPhase4PublicationRef = useRef<InvalidatedPhase4Publication | null>(null);
  const phase4NextVisibleFailureRef = useRef<StickCommandFailurePointV1 | null>(null);
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
  const canvasColumnRef = useRef<HTMLDivElement | null>(null);
  const [stickStageSize, setStickStageSize] = useState<{width: number; height: number} | null>(null);

  const installRoot = useCallback((
    next: StickMountedWorkspaceRoot,
    phase4Machine: StickFigureCommandTransactionV1 | null | undefined = undefined,
  ) => {
    workspaceRootTransitionCountRef.current += 1;
    if (phase4Machine !== undefined) phase4ExecutorRef.current = phase4Machine;
    else if (next.phase4 === null) phase4ExecutorRef.current = null;
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
        aiCreationLatch: initialAiCreationLatchRef.current!,
        workspaceGeneration: initialProject ? 1 : 0,
        documentPublication: {status: "ready"},
        lastSavedDocumentDigest: initialProject ? editorRoot.current.documentDigest : null,
        phase4: null,
      });
      readyDocumentPublicationCountRef.current += 1;
    });
    return () => { alive = false; };
  }, [initialProject, installRoot]);

  useEffect(() => { isTimelinePlayingRef.current = isTimelinePlaying; }, [isTimelinePlaying]);

  useEffect(() => {
    if (isCreatorOpen) return;
    const stage = canvasColumnRef.current?.querySelector<HTMLElement>("[data-testid='stick-stage']") ?? null;
    if (!stage) return;
    const publishSize = () => {
      const width = stage.offsetWidth;
      const height = stage.offsetHeight;
      setStickStageSize((current) => current?.width === width && current.height === height ? current : {width, height});
    };
    publishSize();
    const observer = new ResizeObserver(publishSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [isCreatorOpen]);

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
  const stickAiStageProjection = useMemo(() => stickStageSize
    ? createStickAiStageProjection(stickStageSize.width, stickStageSize.height)
    : null, [stickStageSize]);
  const activeUsesStickAiProjection = isStickAiCanonicalStructureGraphV2(activeContent.structureGraph);
  const renderedActiveContent = useMemo(
    () => projectStickAiContent(activeContent, stickAiStageProjection),
    [activeContent, stickAiStageProjection],
  );
  const renderedBackgroundContents = useMemo(
    () => backgroundContents.map((content) => projectStickAiContent(content, stickAiStageProjection)),
    [backgroundContents, stickAiStageProjection],
  );
  const renderedOnionOverlays = useMemo(
    () => onionOverlays.map((overlay) => ({
      ...overlay,
      content: projectStickAiContent(overlay.content, stickAiStageProjection),
    })),
    [onionOverlays, stickAiStageProjection],
  );
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
    const documentPoint = activeUsesStickAiProjection && stickAiStageProjection
      ? unprojectStickAiPoint(point, stickAiStageProjection)
      : point;
    updateContent((content) => {
      const joint = content.structureGraph.joints.find((candidate) => candidate.id === jointId);
      if (!joint || (joint.x === documentPoint.x && joint.y === documentPoint.y)) return false;
      joint.x = documentPoint.x;
      joint.y = documentPoint.y;
      content.structureGraph.activeJointId = null;
      return true;
    });
  }, [activeUsesStickAiProjection, stickAiStageProjection, updateContent]);
  const commitSegment = useCallback((draft: StickFigureStructureSegmentDraft) => {
    if (Math.hypot(draft.endPoint.x - draft.startPoint.x, draft.endPoint.y - draft.startPoint.y) < 18) return;
    const documentDraft = activeUsesStickAiProjection && stickAiStageProjection ? {
      ...draft,
      startPoint: unprojectStickAiPoint(draft.startPoint, stickAiStageProjection),
      endPoint: unprojectStickAiPoint(draft.endPoint, stickAiStageProjection),
    } : draft;
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
      const startJointId = resolveJoint(documentDraft.startJointId, documentDraft.startPoint);
      const endJointId = resolveJoint(documentDraft.endJointId, documentDraft.endPoint);
      if (startJointId === endJointId || graph.limbs.some((limb) =>
        (limb.startJointId === startJointId && limb.endJointId === endJointId) ||
        (limb.startJointId === endJointId && limb.endJointId === startJointId))) return false;
      graph.limbs.push({id: `stick-limb-${nextLimb}`, startJointId, endJointId});
      graph.activeJointId = null;
      return true;
    });
  }, [activeUsesStickAiProjection, stickAiStageProjection, updateContent]);

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
    void saveStickProject(window.localStorage, document, viewState, {aiCreationLatch: captured.aiCreationLatch}).then((result) => {
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
    const legacyWorkspaceRoot = root ? {
      workspaceInstanceId: root.workspaceInstanceId,
      editorRoot: root.editorRoot,
      workspaceGeneration: root.workspaceGeneration,
      documentPublication: root.documentPublication,
      lastSavedDocumentDigest: root.lastSavedDocumentDigest,
    } : null;
    return {
      checkpointVersion: 1,
      rootStatus: root?.documentPublication.status ?? "mounting",
      documentDigestStatus: root?.documentPublication.status ?? "mounting",
      editorRootDigest: root ? await digestCanonical(root.editorRoot.current) : null,
      workspaceRootDigest: legacyWorkspaceRoot ? await digestCanonical(legacyWorkspaceRoot) : null,
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
    invalidatedPhase4PublicationRef.current = null;
    mountedOpenRef.current = {status: null, operationId: null};
    installRoot({
      workspaceInstanceId: await deterministicWorkspaceId(operationId),
      editorRoot: JSON.parse(canonicalJson(candidate)) as EditableStickEditorHistoryRootV1,
      aiCreationLatch: createStickAiCreationLatch(
        candidate.current.snapshot.document.projectId,
        isEligibleEditableStickWaveStarter(candidate) ? "unconsumed" : "consumed",
      ),
      workspaceGeneration: 1,
      documentPublication: {status: "ready"},
      lastSavedDocumentDigest: fixture.savedBaselineMode === "current_document" ? candidate.current.documentDigest : null,
      phase4: null,
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
    if (live.phase4?.pendingApplyOperationId && phase4ExecutorRef.current) {
      invalidatedPhase4PublicationRef.current = {
        machine: phase4ExecutorRef.current.fork(),
        baseWorkspaceInstanceId: live.workspaceInstanceId,
        canonicalStarterDigest: live.phase4.canonicalStarterDigest,
      };
    } else invalidatedPhase4PublicationRef.current = null;
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
      aiCreationLatch: createStickAiCreationLatch(pending.candidateEditorRoot.current.snapshot.document.projectId, "consumed"),
      workspaceGeneration: 1,
      documentPublication: {status: "ready"},
      lastSavedDocumentDigest: pending.candidateEditorRoot.current.documentDigest,
      phase4: null,
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

  const phase4FixtureInput = async (fixture: unknown) => {
    if (!isPlainRecord(fixture) || !("starter" in fixture) || !("envelope" in fixture)) return null;
    const starterResult = parseStickProjectDocument(fixture.starter);
    if (!starterResult.ok) return null;
    const envelopeResult = await parseStickCommandInput(fixture.envelope, starterResult.value);
    if (!envelopeResult.ok) return null;
    return {
      starter: starterResult.value,
      starterDigest: await digestCanonical(starterResult.value),
      envelope: envelopeResult.value,
    };
  };

  type Phase4MachineInput = {
    live: StickMountedWorkspaceRoot;
    machine: StickFigureCommandTransactionV1;
    envelope: StickCommandInputV1;
    starterDigest: string;
  };

  const phase4MachineInput = async (fixture: unknown): Promise<Phase4MachineInput | null> => {
    const parsed = await phase4FixtureInput(fixture);
    const visible = workspaceRootRef.current;
    if (!parsed || !visible || visible.documentPublication.status !== "ready" || isTimelinePlayingRef.current) return null;
    if (visible.phase4) {
      const machine = phase4ExecutorRef.current;
      if (!machine || visible.phase4.canonicalStarterDigest !== parsed.starterDigest ||
        canonicalJson(machine.snapshot()) !== canonicalJson(visible.phase4.commandRoot)) return null;
      return {live: visible, machine: machine.fork(), envelope: parsed.envelope, starterDigest: parsed.starterDigest};
    }
    if (!isEligibleEditableStickAiStarter(visible.editorRoot, visible.aiCreationLatch)) return null;
    const machine = new StickFigureCommandTransactionV1(
      await createStickCommandWorkspaceRoot(parsed.starter, `${visible.workspaceInstanceId}:phase4`, visible.workspaceGeneration),
    );
    invalidatedPhase4PublicationRef.current = null;
    const live = workspaceRootRef.current;
    if (!live || live.workspaceInstanceId !== visible.workspaceInstanceId || live.workspaceGeneration !== visible.workspaceGeneration ||
      live.documentPublication.status !== "ready" || live.editorRoot.current.documentDigest !== visible.editorRoot.current.documentDigest || live.phase4) return null;
    return {live, machine, envelope: parsed.envelope, starterDigest: parsed.starterDigest};
  };

  const phase4BaseMatches = (input: Phase4MachineInput, live: StickMountedWorkspaceRoot) =>
    live.workspaceInstanceId === input.live.workspaceInstanceId &&
    live.workspaceGeneration === input.live.workspaceGeneration &&
    live.documentPublication.status === "ready" &&
    live.editorRoot.current.documentDigest === input.live.editorRoot.current.documentDigest &&
    canonicalJson(live.aiCreationLatch) === canonicalJson(input.live.aiCreationLatch) &&
    canonicalJson(live.phase4?.commandRoot ?? null) === canonicalJson(input.live.phase4?.commandRoot ?? null);

  const phase4ApplyBaseMatches = (input: Phase4MachineInput, live: StickMountedWorkspaceRoot) => {
    if (!phase4BaseMatches(input, live)) return false;
    const phase4 = input.live.phase4;
    return phase4 === null || (
      live.workspaceInstanceId === phase4.baseWorkspaceInstanceId &&
      live.workspaceGeneration === phase4.baseWorkspaceGeneration &&
      live.editorRoot.current.documentDigest === phase4.baseDocumentDigest
    );
  };

  const phase4StateForOutcome = (
    input: Phase4MachineInput,
    outcome: StickCommandOperationOutcomeV1,
    pendingApplyOperationId: string | null,
  ): Phase4MountedCommandState => ({
    commandRoot: outcome.root,
    canonicalStarterDigest: input.starterDigest,
    baseWorkspaceInstanceId: input.live.phase4?.baseWorkspaceInstanceId ?? input.live.workspaceInstanceId,
    baseWorkspaceGeneration: input.live.phase4?.baseWorkspaceGeneration ?? input.live.workspaceGeneration,
    baseDocumentDigest: input.live.phase4?.baseDocumentDigest ?? input.live.editorRoot.current.documentDigest,
    pendingApplyOperationId,
    lastCommandOutcomeCode: outcome.outcomeCode,
    lastCommandResult: outcome.result,
    commandRootTransitionCount: (input.live.phase4?.commandRootTransitionCount ?? 0) + 1,
  });

  const phase4Response = (
    outcome: StickCommandOperationOutcomeV1,
    testerOutcomeCode: string = outcome.outcomeCode,
    testerErrorCode: string | null | "inherit" = "inherit",
  ) => ({
    accepted: outcome.outcomeCode !== "rejected" && outcome.outcomeCode !== "failed",
    outcomeCode: testerOutcomeCode,
    errorCode: testerErrorCode === "inherit" ? outcome.result?.error?.code ?? null : testerErrorCode,
  });

  const installPhase4Outcome = (
    input: Phase4MachineInput,
    machine: StickFigureCommandTransactionV1,
    outcome: StickCommandOperationOutcomeV1,
    pendingApplyOperationId: string | null,
  ) => {
    const live = workspaceRootRef.current;
    if (!live || !phase4BaseMatches(input, live)) return false;
    installRoot({...live, phase4: phase4StateForOutcome(input, outcome, pendingApplyOperationId)}, machine);
    return true;
  };

  const rejectPhase4VisibleRace = async (
    input: Phase4MachineInput,
    committingMachine: StickFigureCommandTransactionV1,
  ) => {
    const live = workspaceRootRef.current;
    const code = live?.workspaceInstanceId === input.live.workspaceInstanceId ? "stale_document" : "project_switched";
    const outcome = await committingMachine.rejectActive(input.envelope, code);
    if (live && code === "stale_document" && live.documentPublication.status === "ready" &&
      canonicalJson(live.phase4?.commandRoot ?? null) === canonicalJson(input.live.phase4?.commandRoot ?? null)) {
      installRoot({...live, phase4: phase4StateForOutcome(input, outcome, null)}, committingMachine);
    }
    return phase4Response(outcome, "rejected");
  };

  const publishPhase4AppliedOutcome = async (
    input: Phase4MachineInput,
    machine: StickFigureCommandTransactionV1,
    committingMachine: StickFigureCommandTransactionV1,
    outcome: StickCommandOperationOutcomeV1,
  ) => {
    if (outcome.outcomeCode !== "applied") {
      if (!installPhase4Outcome(input, machine, outcome, null)) return rejectPhase4VisibleRace(input, committingMachine);
      return phase4Response(outcome, outcome.outcomeCode === "failed" ? "transaction_failed" : outcome.outcomeCode);
    }
    const preparationLive = workspaceRootRef.current;
    if (!preparationLive || !phase4ApplyBaseMatches(input, preparationLive)) return rejectPhase4VisibleRace(input, committingMachine);
    const nextTimeline = editableStickTimelineFromCanonicalAnimation(
      outcome.root.editorRoot.current.snapshot.document,
      editableStickTimelineFromSnapshot(preparationLive.editorRoot.current.snapshot),
    );
    const currentDocument = preparationLive.editorRoot.current.snapshot.document;
    const nextDocument = editableStickDocumentFromTimeline(nextTimeline, {
      projectId: currentDocument.projectId,
      documentRevision: currentDocument.documentRevision + 1,
      title: currentDocument.title,
    });
    let editorRoot = await commitEditableStickHistory(preparationLive.editorRoot, {
      document: nextDocument,
      viewState: editableStickViewFromTimeline(nextTimeline),
    });
    const live = workspaceRootRef.current;
    if (!live || !phase4ApplyBaseMatches(input, live)) return rejectPhase4VisibleRace(input, committingMachine);
    editorRoot = replaceEditableStickCurrentView(editorRoot, live.editorRoot.current.snapshot.viewState);
    const consumedLatch = consumeStickAiCreationLatch(live.aiCreationLatch, currentDocument.projectId);
    if (!consumedLatch) return rejectPhase4VisibleRace(input, committingMachine);
    installRoot({
      ...live,
      editorRoot,
      aiCreationLatch: consumedLatch,
      workspaceGeneration: live.workspaceGeneration + 1,
      phase4: phase4StateForOutcome(input, outcome, null),
    }, machine);
    readyDocumentPublicationCountRef.current += 1;
    setSaveError(null);
    return phase4Response(outcome);
  };

  const beginStickRequest = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input) return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    const outcome = await input.machine.beginRequest(input.envelope);
    if (!installPhase4Outcome(input, input.machine, outcome, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    return phase4Response(outcome, outcome.outcomeCode === "requesting" ? "request_started" : outcome.outcomeCode, outcome.outcomeCode === "requesting" ? null : "inherit");
  };

  const abortStickRequest = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input) return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    const outcome = await input.machine.abortRequest(input.envelope);
    if (!installPhase4Outcome(input, input.machine, outcome, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    return phase4Response(outcome, outcome.outcomeCode === "aborted" ? "request_aborted" : outcome.outcomeCode);
  };

  const previewStickCommand = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input) return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    const outcome = await input.machine.preview(input.envelope);
    if (!installPhase4Outcome(input, input.machine, outcome, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    return phase4Response(outcome, outcome.outcomeCode === "preview_ready" ? "previewed" : outcome.outcomeCode);
  };

  const cancelStickPreview = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input) return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    const outcome = await input.machine.cancelPreview(input.envelope);
    if (!installPhase4Outcome(input, input.machine, outcome, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    return phase4Response(outcome, outcome.outcomeCode === "cancelled" ? "preview_cancelled" : outcome.outcomeCode);
  };

  const applyStickCommand = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input) return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    if (phase4NextVisibleFailureRef.current) {
      input.machine.armFailure(phase4NextVisibleFailureRef.current);
      phase4NextVisibleFailureRef.current = null;
    }
    const preview = await input.machine.preview(input.envelope);
    if (preview.outcomeCode !== "preview_ready" && preview.outcomeCode !== "preview_reused") {
      if (!installPhase4Outcome(input, input.machine, preview, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
      return phase4Response(preview, preview.outcomeCode === "failed" ? "transaction_failed" : preview.outcomeCode);
    }
    const pending = await input.machine.beginApplyPublication(input.envelope);
    if (pending.outcomeCode !== "apply_publication_pending") {
      if (!installPhase4Outcome(input, input.machine, pending, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
      return phase4Response(pending, pending.outcomeCode === "failed" ? "transaction_failed" : pending.outcomeCode);
    }
    const committingMachine = input.machine.fork();
    const active = pending.root.transactionState.active;
    if (!active || active.phase !== "committing") return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    const outcome = await input.machine.completeApplyPublication(active.operationId, input.envelope);
    return publishPhase4AppliedOutcome(input, input.machine, committingMachine, outcome);
  };

  const beginApplyPublication = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input) return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    const preview = await input.machine.preview(input.envelope);
    if (preview.outcomeCode !== "preview_ready" && preview.outcomeCode !== "preview_reused") {
      if (!installPhase4Outcome(input, input.machine, preview, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
      return phase4Response(preview);
    }
    const outcome = await input.machine.beginApplyPublication(input.envelope);
    const pendingApplyOperationId = outcome.root.transactionState.active?.phase === "committing"
      ? outcome.root.transactionState.active.operationId
      : null;
    if (!installPhase4Outcome(input, input.machine, outcome, pendingApplyOperationId)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    return phase4Response(outcome);
  };

  const completeApplyPublication = async (fixture: unknown) => {
    const parsedFixture = await phase4FixtureInput(fixture);
    const invalidatedFixture = invalidatedPhase4PublicationRef.current;
    if (parsedFixture && invalidatedFixture && parsedFixture.starterDigest === invalidatedFixture.canonicalStarterDigest &&
      workspaceRootRef.current?.workspaceInstanceId !== invalidatedFixture.baseWorkspaceInstanceId) {
      invalidatedPhase4PublicationRef.current = null;
      const outcome = await invalidatedFixture.machine.rejectActive(parsedFixture.envelope, "project_switched");
      return phase4Response(outcome, "rejected");
    }
    const input = await phase4MachineInput(fixture);
    if (!input) {
      const parsed = parsedFixture;
      const invalidated = invalidatedPhase4PublicationRef.current;
      if (parsed && invalidated && parsed.starterDigest === invalidated.canonicalStarterDigest &&
        workspaceRootRef.current?.workspaceInstanceId !== invalidated.baseWorkspaceInstanceId) {
        invalidatedPhase4PublicationRef.current = null;
        const outcome = await invalidated.machine.rejectActive(parsed.envelope, "project_switched");
        return phase4Response(outcome, "rejected");
      }
    }
    const operationId = input?.live.phase4?.pendingApplyOperationId ?? null;
    if (!input || !operationId) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    const committingMachine = input.machine.fork();
    const outcome = await input.machine.completeApplyPublication(operationId, input.envelope);
    return publishPhase4AppliedOutcome(input, input.machine, committingMachine, outcome);
  };

  const redeliverStickCommand = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input) return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    const outcome = await input.machine.redeliver(input.envelope);
    const testerOutcomeCode = outcome.outcomeCode === "cancelled" || outcome.outcomeCode === "failed" || outcome.outcomeCode === "rejected"
      ? "stored_terminal"
      : outcome.outcomeCode;
    if (!installPhase4Outcome(input, input.machine, outcome, input.live.phase4?.pendingApplyOperationId ?? null)) {
      return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    }
    return phase4Response(outcome, testerOutcomeCode);
  };

  const executeInjectedTransactionFailure = async (fixture: unknown) => {
    const input = await phase4MachineInput(fixture);
    if (!input || !isPlainRecord(fixture) || typeof fixture.failurePoint !== "string" ||
      !STICK_COMMAND_FAILURE_POINTS.includes(fixture.failurePoint as StickCommandFailurePointV1)) {
      return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    }
    input.machine.armFailure(fixture.failurePoint as StickCommandFailurePointV1);
    const outcome = await input.machine.apply(input.envelope);
    if (!installPhase4Outcome(input, input.machine, outcome, null)) return {accepted: false, outcomeCode: "rejected", errorCode: "stale_document"};
    return phase4Response(outcome, outcome.outcomeCode === "failed" ? "transaction_failed" : outcome.outcomeCode);
  };

  const armNextVisibleApplyFailure = async (fixture: unknown) => {
    if (!isPlainRecord(fixture) || typeof fixture.failurePoint !== "string" ||
      !STICK_COMMAND_FAILURE_POINTS.includes(fixture.failurePoint as StickCommandFailurePointV1)) {
      return {accepted: false, outcomeCode: "rejected", errorCode: "invalid_request"};
    }
    phase4NextVisibleFailureRef.current = fixture.failurePoint as StickCommandFailurePointV1;
    return {accepted: true, outcomeCode: "apply_failure_armed", errorCode: null};
  };

  const readPhase4Checkpoint = async () => {
    const legacy = await readCheckpoint();
    const phase4 = workspaceRootRef.current?.phase4 ?? null;
    const aiRoot = phase4?.commandRoot ?? null;
    const active = aiRoot?.transactionState.active ?? null;
    const terminalLedger = aiRoot?.transactionState.terminalLedger ?? [];
    return {
      ...legacy,
      checkpointVersion: 4,
      aiRootDigest: aiRoot ? await digestCanonical(aiRoot) : null,
      aiCanonicalDocumentDigest: aiRoot?.editorRoot.current.documentDigest ?? null,
      aiCanonicalHistoryRootDigest: aiRoot ? await digestCanonical(aiRoot.editorRoot) : null,
      aiWorkspaceInstanceDigest: aiRoot ? await digestCanonical(aiRoot.workspaceInstanceId) : null,
      aiWorkspaceGeneration: aiRoot?.workspaceGeneration ?? null,
      transactionStateDigest: aiRoot ? await digestCanonical(aiRoot.transactionState) : null,
      activeTransactionPhase: active?.phase ?? "idle",
      activeTransactionDigest: active ? await digestCanonical(active) : null,
      terminalLedgerDigest: await digestCanonical(terminalLedger),
      terminalLedgerLength: terminalLedger.length,
      pendingApplyOperationDigest: phase4?.pendingApplyOperationId
        ? await digestCanonical(phase4.pendingApplyOperationId)
        : null,
      lastCommandOutcomeCode: phase4?.lastCommandOutcomeCode ?? null,
      lastCommandResultDigest: phase4?.lastCommandResult
        ? await digestCanonical(phase4.lastCommandResult)
        : null,
      commandRootTransitionCount: phase4?.commandRootTransitionCount ?? 0,
      aiCreationLatchStatus: workspaceRootRef.current?.aiCreationLatch.status ?? null,
      aiCreationLatchDigest: workspaceRootRef.current
        ? await digestCanonical(workspaceRootRef.current.aiCreationLatch)
        : null,
    };
  };

  const resetSpec0004FreshProject = async (preservePendingForProjectSwitch = false) => {
    const current = workspaceRootRef.current;
    if (preservePendingForProjectSwitch && current?.phase4 && phase4ExecutorRef.current) {
      invalidatedPhase4PublicationRef.current = {
        machine: phase4ExecutorRef.current.fork(),
        baseWorkspaceInstanceId: current.workspaceInstanceId,
        canonicalStarterDigest: current.phase4.canonicalStarterDigest,
      };
    } else invalidatedPhase4PublicationRef.current = null;
    const snapshot = newProjectSnapshot();
    const editorRoot = await createEditableStickHistoryRoot(snapshot);
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
      workspaceInstanceId: newWorkspaceId(),
      editorRoot,
      aiCreationLatch: createStickAiCreationLatch(snapshot.document.projectId, "unconsumed"),
      workspaceGeneration: 0,
      documentPublication: {status: "ready"},
      lastSavedDocumentDigest: null,
      phase4: null,
    });
    readyDocumentPublicationCountRef.current += 1;
    setSaveError(null);
    return {accepted: true, outcomeCode: preservePendingForProjectSwitch ? "project_switched" : "fresh_project", errorCode: null};
  };

  const readSpec0004PreviewCandidate = async () => {
    const active = phase4ExecutorRef.current?.snapshot().transactionState.active;
    const document = active?.phase === "preview_ready"
      ? phase4ExecutorRef.current?.readPreviewCandidate(active.transactionId) ?? null
      : null;
    return document ? JSON.parse(canonicalJson(document)) : null;
  };

  const saveSpec0004Project = async () => {
    const captured = workspaceRootRef.current;
    if (!captured || captured.documentPublication.status !== "ready") {
      return {accepted: false, outcomeCode: "save_rejected", errorCode: "document_not_ready"};
    }
    const {document, viewState} = captured.editorRoot.current.snapshot;
    const result = await saveStickProject(window.localStorage, document, viewState, {aiCreationLatch: captured.aiCreationLatch});
    if (!result.ok) return {accepted: false, outcomeCode: "save_rejected", errorCode: result.error};
    const live = workspaceRootRef.current;
    if (!live || live.workspaceInstanceId !== captured.workspaceInstanceId ||
      live.editorRoot.current.snapshot.document.projectId !== document.projectId) {
      return {accepted: false, outcomeCode: "save_stale", errorCode: "stale_document"};
    }
    installRoot({...live, lastSavedDocumentDigest: captured.editorRoot.current.documentDigest});
    setSaveError(null);
    return {accepted: true, outcomeCode: "saved", errorCode: null};
  };

  const reopenSpec0004Project = async () => {
    const current = workspaceRootRef.current;
    const projectId = current?.editorRoot.current.snapshot.document.projectId;
    if (!projectId) return {accepted: false, outcomeCode: "open_rejected", errorCode: "project_not_found"};
    const opened = openStickSavedProject(window.localStorage, projectId);
    if (!opened.ok) return {accepted: false, outcomeCode: "open_rejected", errorCode: opened.error};
    const editorRoot = await createEditableStickHistoryRoot({document: opened.value.document, viewState: opened.value.reopenState});
    const latch = opened.value.recordVersion === 2
      ? opened.value.aiCreationLatch
      : createStickAiCreationLatch(projectId, "consumed");
    installRoot({
      workspaceInstanceId: newWorkspaceId(),
      editorRoot,
      aiCreationLatch: JSON.parse(canonicalJson(latch)) as StickAiCreationLatchV1,
      workspaceGeneration: 1,
      documentPublication: {status: "ready"},
      lastSavedDocumentDigest: editorRoot.current.documentDigest,
      phase4: null,
    });
    readyDocumentPublicationCountRef.current += 1;
    return {accepted: true, outcomeCode: "opened", errorCode: null};
  };

  const moveSpec0004Joint = async (jointIndex = 0, deltaX = 7, deltaY = 0) => {
    const current = cloneEditableStickTimelineState(timelineRef.current);
    const resolved = resolveEditableStickContent(current, current.activeLayerId, current.currentFrameIndex);
    const joint = resolved?.content.structureGraph.joints[jointIndex];
    if (!resolved || !joint) return {accepted: false, outcomeCode: "manual_edit_rejected", errorCode: "joint_not_found"};
    const content = cloneStickFigureFrameContent(resolved.content);
    const target = content.structureGraph.joints[jointIndex];
    target.x += deltaX;
    target.y += deltaY;
    const next = replaceEditableStickResolvedContent(current, current.activeLayerId, current.currentFrameIndex, content);
    if (!next) return {accepted: false, outcomeCode: "manual_edit_rejected", errorCode: "joint_not_found"};
    const accepted = await publishAuthored(next);
    return {accepted, outcomeCode: accepted ? "manual_edit_applied" : "manual_edit_rejected", errorCode: accepted ? null : "stale_document"};
  };

  const spec0004Phase1BrowserPortsV1 = {
    resetFreshProject: () => resetSpec0004FreshProject(false),
    switchProject: () => resetSpec0004FreshProject(true),
    previewFixture: previewStickCommand,
    cancelFixture: cancelStickPreview,
    applyFixture: applyStickCommand,
    beginApplyPublication,
    completeApplyPublication,
    readPreviewCandidate: readSpec0004PreviewCandidate,
    readCheckpoint: readPhase4Checkpoint,
    undo: async () => { await traverseHistory("undo"); return readPhase4Checkpoint(); },
    redo: async () => { await traverseHistory("redo"); return readPhase4Checkpoint(); },
    save: saveSpec0004Project,
    reopen: reopenSpec0004Project,
    moveJoint: moveSpec0004Joint,
    openCreator: async () => {
      setIsTimelinePlaying(false);
      setIsCreatorOpen(true);
      return {accepted: true, outcomeCode: "creator_opened", errorCode: null};
    },
  };
  void spec0004Phase1BrowserPortsV1;

  const spec0001Phase4BrowserPortsV1 = {
    mountEditorHistoryRoot,
    dispatchEditorTransaction,
    beginMountedOpen,
    completeMountedOpen,
    beginStickRequest,
    abortStickRequest,
    previewStickCommand,
    cancelStickPreview,
    applyStickCommand,
    beginApplyPublication,
    completeApplyPublication,
    redeliverStickCommand,
    executeInjectedTransactionFailure,
    armNextVisibleApplyFailure,
    readCheckpoint: readPhase4Checkpoint,
  };
  void spec0001Phase4BrowserPortsV1;

  const aiAdapterRef = useRef<StickFigureAiWorkspaceAdapterV2 | null>(null);
  if (!aiAdapterRef.current) {
    aiAdapterRef.current = new StickFigureAiWorkspaceAdapterV2({
      getSnapshot: () => {
        const current = workspaceRootRef.current;
        if (!current) return null;
        const document = current.editorRoot.current.snapshot.document;
        return {
          workspaceInstanceId: current.workspaceInstanceId,
          workspaceGeneration: current.workspaceGeneration,
          projectId: document.projectId,
          documentRevision: document.documentRevision,
          documentDigest: current.editorRoot.current.documentDigest,
          ready: current.documentPublication.status === "ready",
          eligible: isEligibleEditableStickAiStarter(current.editorRoot, current.aiCreationLatch),
          aiCreationConsumed: current.aiCreationLatch.status === "consumed",
          playing: isTimelinePlayingRef.current,
        };
      },
      preview: (envelope) => previewStickCommand(stickAiPhase4FixtureV2(envelope)),
      cancel: (envelope) => cancelStickPreview(stickAiPhase4FixtureV2(envelope)),
      apply: (envelope) => applyStickCommand(stickAiPhase4FixtureV2(envelope)),
    });
  }

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

  const openCreator = () => {
    if (typeof onOpenStickFigureCreator === "function") {
      setIsTimelinePlaying(false);
      setIsCreatorOpen(true);
    }
  };

  if (isCreatorOpen) return <StickFigureCreatorWorkspace onExit={() => setIsCreatorOpen(false)} />;

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
      <div ref={canvasColumnRef} style={{flex: 1, minHeight: 0, display: "flex"}}>
        <StickFigureCanvas
          figures={renderedActiveContent.figures}
          backgroundContents={renderedBackgroundContents}
          selection={selection}
          onSelectFigure={(figureId) => setSelection({target: "figure", figureId})}
          activeTool={activeTool}
          structureTool={structureTool}
          structureGraph={renderedActiveContent.structureGraph}
          selectedStructureJointId={selectedStructureJointId}
          onionOverlays={renderedOnionOverlays}
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
          aiAdapter={aiAdapterRef.current}
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
          onOpenStickFigureCreator={openCreator}
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
