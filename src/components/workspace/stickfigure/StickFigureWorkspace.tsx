import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  advancePlaybackAccumulator,
  getClampedPlaybackFrameDurationMs,
} from "../timelinePlayback";
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
} from "../../../lib/stickfigure/stickTimeline";
import type {
  EditableStickTimelineState,
} from "../../../lib/stickfigure/stickTimeline";
import {StickFigureCanvas} from "./StickFigureCanvas";
import {StickFigureRightPanel} from "./StickFigureRightPanel";
import type {StickFigureRightPanelTab} from "./StickFigureRightPanel";
import {StickFigureTimelineRow} from "./StickFigureTimelineRow";
import type {TimelineFrameKind} from "./StickFigureTimelineRow";
import {StickFigureToolBar} from "./StickFigureToolBar";
import type {StickFigureToolName} from "./StickFigureToolBar";
import {StickFigureTopBar} from "./StickFigureTopBar";
import {
  cloneStickFigureFrameContent,
  createEmptyStickFigureFrameContent,
} from "./types";
import type {
  StickFigureFrameContent,
  StickFigurePoint,
  StickFigureSelection,
  StickFigureStructureSegmentDraft,
  StickFigureStructureTool,
} from "./types";

type StickFigureWorkspaceProps = {
  onOpenStickFigureCreator: () => void;
};

const DEFAULT_STICK_CAMERA_ZOOM = 0.85;
const DEFAULT_STICK_CAMERA_PAN: StickFigurePoint = {x: 0, y: 0};
const MIN_STICK_CAMERA_ZOOM = 0.5;
const MAX_STICK_CAMERA_ZOOM = 3;
const clampStickCameraZoom = (zoom: number) => Math.min(MAX_STICK_CAMERA_ZOOM, Math.max(MIN_STICK_CAMERA_ZOOM, zoom));
const formatStickCameraZoom = (zoom: number) => `${Math.round(zoom * 100)}%`;

const contentSignature = (content: StickFigureFrameContent | null) => content
  ? JSON.stringify({
      figures: content.figures,
      joints: content.structureGraph.joints,
      limbs: content.structureGraph.limbs,
    })
  : null;

export function StickFigureWorkspace({onOpenStickFigureCreator}: StickFigureWorkspaceProps) {
  const [timeline, setTimelineState] = useState<EditableStickTimelineState>(createFreshEditableStickTimelineState);
  const timelineRef = useRef(timeline);
  const isTimelinePlayingRef = useRef(false);
  const nextStructureJointIdRef = useRef(1);
  const nextStructureLimbIdRef = useRef(1);
  const clipboardRef = useRef<StickFigureFrameContent | null>(null);
  const [hasCopiedFrame, setHasCopiedFrame] = useState(false);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [isOnionEnabled, setIsOnionEnabled] = useState(false);
  const [selection, setSelection] = useState<StickFigureSelection>({target: "workspace"});
  const [activeTool, setActiveTool] = useState<StickFigureToolName | null>("Select");
  const [rightPanelTab, setRightPanelTab] = useState<StickFigureRightPanelTab>("Properties");
  const [canvasMovementEnabled, setCanvasMovementEnabled] = useState(false);
  const [stickCameraZoom, setStickCameraZoom] = useState(DEFAULT_STICK_CAMERA_ZOOM);
  const [stickZoomInputValue, setStickZoomInputValue] = useState(formatStickCameraZoom(DEFAULT_STICK_CAMERA_ZOOM));
  const [stickCameraPan, setStickCameraPan] = useState<StickFigurePoint>(DEFAULT_STICK_CAMERA_PAN);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState("#f5f5f5");
  const [structureTool, setStructureTool] = useState<StickFigureStructureTool>("idle");

  const publishTimeline = useCallback((next: EditableStickTimelineState | null) => {
    if (!next || next === timelineRef.current) return false;
    timelineRef.current = next;
    setTimelineState(next);
    return true;
  }, []);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  useEffect(() => {
    isTimelinePlayingRef.current = isTimelinePlaying;
  }, [isTimelinePlaying]);

  const authoredPlaybackFrameCount = useMemo(() => getEditableStickPlaybackFrameCount(timeline), [timeline]);
  const renderFrameIndex = timeline.currentFrameIndex;
  const activeResolved = useMemo(
    () => resolveEditableStickContent(timeline, timeline.activeLayerId, renderFrameIndex),
    [renderFrameIndex, timeline],
  );
  const activeContent = activeResolved?.content ?? createEmptyStickFigureFrameContent();
  const backgroundContents = useMemo(
    () => timeline.layers
      .filter((layer) => layer.id !== timeline.activeLayerId)
      .map((layer) => resolveEditableStickContent(timeline, layer.id, renderFrameIndex)?.content ?? null)
      .filter((content): content is StickFigureFrameContent => content !== null),
    [renderFrameIndex, timeline],
  );
  const selectedStructureJoint = useMemo(
    () => activeContent.structureGraph.joints.find((joint) => joint.id === activeContent.structureGraph.activeJointId) ?? null,
    [activeContent],
  );
  const selectedStructureJointConnectionCount = useMemo(() => {
    if (!selectedStructureJoint) return 0;
    return activeContent.structureGraph.limbs.reduce(
      (count, limb) => count + (limb.startJointId === selectedStructureJoint.id || limb.endJointId === selectedStructureJoint.id ? 1 : 0),
      0,
    );
  }, [activeContent, selectedStructureJoint]);

  const updateResolvedContent = useCallback((
    mutate: (content: StickFigureFrameContent) => boolean,
    selectedIndex = timelineRef.current.currentFrameIndex,
  ) => {
    if (isTimelinePlayingRef.current) return false;
    const current = timelineRef.current;
    const resolved = resolveEditableStickContent(current, current.activeLayerId, selectedIndex);
    if (!resolved) return false;
    const content = cloneStickFigureFrameContent(resolved.content);
    if (!mutate(content)) return false;
    return publishTimeline(replaceEditableStickResolvedContent(current, current.activeLayerId, selectedIndex, content));
  }, [publishTimeline]);

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
      const {accumulatorMs: nextAccumulator, steps} = advancePlaybackAccumulator(
        accumulatorMs,
        timestamp - lastTimestamp,
        getClampedPlaybackFrameDurationMs(timelineRef.current.fps),
      );
      accumulatorMs = nextAccumulator;
      lastTimestamp = timestamp;
      if (steps > 0) {
        const current = cloneEditableStickTimelineState(timelineRef.current);
        for (let step = 0; step < steps; step += 1) {
          const count = getEditableStickPlaybackFrameCount(current);
          current.currentFrameIndex = current.currentFrameIndex >= count - 1 ? 0 : current.currentFrameIndex + 1;
          current.selectedTimelineIndex = current.currentFrameIndex;
        }
        publishTimeline(current);
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [authoredPlaybackFrameCount, isTimelinePlaying, publishTimeline]);

  const switchToFrame = useCallback((index: number) => {
    if (isTimelinePlayingRef.current) return;
    const current = cloneEditableStickTimelineState(timelineRef.current);
    const maxIndex = Math.max(0, getEditableStickPlaybackFrameCount(current) - 1);
    const nextIndex = Math.max(0, Math.min(index, maxIndex));
    current.currentFrameIndex = nextIndex;
    current.selectedTimelineIndex = nextIndex;
    publishTimeline(current);
    setSelection({target: "workspace"});
  }, [publishTimeline]);

  const selectTimelinePosition = useCallback((index: number) => {
    const current = cloneEditableStickTimelineState(timelineRef.current);
    current.selectedTimelineIndex = Math.max(0, index);
    publishTimeline(current);
  }, [publishTimeline]);

  const activateLayer = useCallback((layerId: string) => {
    const current = timelineRef.current;
    if (!current.layers.some((layer) => layer.id === layerId) || current.activeLayerId === layerId) return;
    const next = cloneEditableStickTimelineState(current);
    next.activeLayerId = layerId;
    publishTimeline(next);
    setSelection({target: "workspace"});
  }, [publishTimeline]);

  const addLayer = useCallback(() => {
    if (isTimelinePlayingRef.current) return;
    publishTimeline(addEditableStickLayer(timelineRef.current));
  }, [publishTimeline]);

  const deleteActiveLayer = useCallback(() => {
    if (isTimelinePlayingRef.current || timelineRef.current.layers.length <= 1) return;
    if (!window.confirm("Delete the active layer?")) return;
    publishTimeline(deleteEditableStickLayer(timelineRef.current, timelineRef.current.activeLayerId));
  }, [publishTimeline]);

  const addTimelineFrame = useCallback((layerId: string, kind: TimelineFrameKind, targetIndex: number, options?: {blank?: boolean}) => {
    if (isTimelinePlayingRef.current || kind === "tween") return;
    publishTimeline(insertEditableStickTimelineFrame(timelineRef.current, layerId, kind, targetIndex, options));
    setSelection({target: "workspace"});
  }, [publishTimeline]);

  const removeTimelineFrame = useCallback((layerId: string, targetIndex: number) => {
    if (isTimelinePlayingRef.current) return;
    publishTimeline(removeEditableStickTimelineFrame(timelineRef.current, layerId, targetIndex));
    setSelection({target: "workspace"});
  }, [publishTimeline]);

  const copyTimelineFrame = useCallback((layerId: string, targetIndex: number) => {
    if (isTimelinePlayingRef.current) return;
    const content = copyEditableStickTimelineFrame(timelineRef.current, layerId, targetIndex);
    if (!content) return;
    clipboardRef.current = content;
    setHasCopiedFrame(true);
  }, []);

  const pasteTimelineFrame = useCallback((layerId: string, targetIndex: number) => {
    if (isTimelinePlayingRef.current || !clipboardRef.current) return;
    publishTimeline(pasteEditableStickTimelineFrame(timelineRef.current, layerId, targetIndex, clipboardRef.current));
    setSelection({target: "workspace"});
  }, [publishTimeline]);

  const resizeTimelineSpan = useCallback((layerId: string, stateId: number, spanType: "frame" | "tween", nextEndIndex: number) => {
    if (isTimelinePlayingRef.current || spanType === "tween") return;
    publishTimeline(resizeEditableStickTimelineSpan(timelineRef.current, layerId, stateId, nextEndIndex));
  }, [publishTimeline]);

  const handlePlayTimeline = useCallback(() => {
    if (getEditableStickPlaybackFrameCount(timelineRef.current) <= 1) return;
    setStructureTool("idle");
    setIsTimelinePlaying(true);
  }, []);

  const handlePauseTimeline = useCallback(() => setIsTimelinePlaying(false), []);

  const activateSelectTool = useCallback(() => {
    setSelection({target: "workspace"});
    setActiveTool("Select");
    setStructureTool("idle");
    setRightPanelTab("Properties");
  }, []);

  const activateStructureLimbTool = useCallback(() => {
    if (isTimelinePlayingRef.current || !resolveEditableStickContent(timelineRef.current, timelineRef.current.activeLayerId, timelineRef.current.currentFrameIndex)) return;
    setSelection({target: "workspace"});
    setActiveTool(null);
    setCanvasMovementEnabled(false);
    setStructureTool("addLimb");
    setRightPanelTab("Stick Figure Tools");
    updateResolvedContent((content) => {
      if (content.structureGraph.activeJointId === null) return false;
      content.structureGraph.activeJointId = null;
      return true;
    });
  }, [updateResolvedContent]);

  const selectStructureJoint = useCallback((jointId: string | null) => {
    setSelection({target: "workspace"});
    setRightPanelTab("Properties");
    updateResolvedContent((content) => {
      if (content.structureGraph.activeJointId === jointId) return false;
      content.structureGraph.activeJointId = jointId;
      return true;
    });
  }, [updateResolvedContent]);

  const clearStructureSelection = useCallback(() => selectStructureJoint(null), [selectStructureJoint]);

  const resetStickCanvasView = useCallback(() => {
    setStickCameraZoom(DEFAULT_STICK_CAMERA_ZOOM);
    setStickZoomInputValue(formatStickCameraZoom(DEFAULT_STICK_CAMERA_ZOOM));
    setStickCameraPan(DEFAULT_STICK_CAMERA_PAN);
  }, []);

  const updateStickCameraZoom = useCallback((nextZoom: number) => {
    const clampedZoom = clampStickCameraZoom(nextZoom);
    setStickCameraZoom(clampedZoom);
    setStickZoomInputValue(formatStickCameraZoom(clampedZoom));
  }, []);

  const applyStickZoomInput = useCallback(() => {
    const match = stickZoomInputValue.match(/-?\d+(\.\d+)?/);
    if (!match) {
      setStickZoomInputValue(formatStickCameraZoom(stickCameraZoom));
      return;
    }
    const parsedPercent = Number(match[0]);
    if (!Number.isFinite(parsedPercent)) {
      setStickZoomInputValue(formatStickCameraZoom(stickCameraZoom));
      return;
    }
    updateStickCameraZoom(parsedPercent / 100);
  }, [stickCameraZoom, stickZoomInputValue, updateStickCameraZoom]);

  const clearStickCanvasContent = useCallback(() => {
    if (!window.confirm("Clear the current canvas? This will remove the visible artwork on this canvas.")) return;
    setSelection({target: "workspace"});
    updateResolvedContent((content) => {
      if (content.figures.length === 0 && content.structureGraph.joints.length === 0 && content.structureGraph.limbs.length === 0) return false;
      content.figures = [];
      content.structureGraph = {joints: [], limbs: [], activeJointId: null};
      return true;
    });
  }, [updateResolvedContent]);

  const setStickCanvasMovementEnabled = useCallback((enabled: boolean) => {
    setCanvasMovementEnabled(enabled);
    setRightPanelTab("Properties");
    if (enabled) selectStructureJoint(null);
  }, [selectStructureJoint]);

  const moveStructureJoint = useCallback((jointId: string, point: StickFigurePoint) => {
    updateResolvedContent((content) => {
      const joint = content.structureGraph.joints.find((candidate) => candidate.id === jointId);
      if (!joint) return false;
      const changed = joint.x !== point.x || joint.y !== point.y || content.structureGraph.activeJointId !== jointId;
      joint.x = point.x;
      joint.y = point.y;
      content.structureGraph.activeJointId = jointId;
      return changed;
    });
  }, [updateResolvedContent]);

  const commitStructureSegment = useCallback((draft: StickFigureStructureSegmentDraft) => {
    if (Math.hypot(draft.endPoint.x - draft.startPoint.x, draft.endPoint.y - draft.startPoint.y) < 18) return false;
    return updateResolvedContent((content) => {
      const graph = content.structureGraph;
      const resolveJointId = (existingId: string | null | undefined, point: StickFigurePoint) => {
        if (existingId && graph.joints.some((joint) => joint.id === existingId)) return existingId;
        const id = `stick-joint-${nextStructureJointIdRef.current++}`;
        graph.joints.push({id, x: point.x, y: point.y});
        return id;
      };
      const startJointId = resolveJointId(draft.startJointId, draft.startPoint);
      const endJointId = resolveJointId(draft.endJointId, draft.endPoint);
      if (startJointId === endJointId) return false;
      if (graph.limbs.some((limb) =>
        (limb.startJointId === startJointId && limb.endJointId === endJointId) ||
        (limb.startJointId === endJointId && limb.endJointId === startJointId)
      )) {
        graph.activeJointId = endJointId;
        return true;
      }
      graph.limbs.push({id: `stick-limb-${nextStructureLimbIdRef.current++}`, startJointId, endJointId});
      graph.activeJointId = endJointId;
      return true;
    });
  }, [updateResolvedContent]);

  const selectFigure = useCallback((figureId: string) => setSelection({target: "figure", figureId}), []);

  const readCheckpoint = useCallback(async () => {
    const current = timelineRef.current;
    return {
      fps: current.fps,
      layerCount: current.layers.length,
      activeLayerId: current.activeLayerId,
      currentFrameIndex: current.currentFrameIndex,
      selectedFrameIndex: current.selectedTimelineIndex,
      isPlaying: isTimelinePlayingRef.current,
      cellTypes: current.layers.map((layer) => layer.frames.map((frame) => frame.cellType)),
      contentSignatures: current.layers.map((layer) => layer.frames.map((_, index) =>
        contentSignature(resolveEditableStickContent(current, layer.id, index)?.content ?? null))),
      hasClipboard: clipboardRef.current !== null,
      creatorEntryLocked: false,
      historyDepth: 0,
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

  /* SPEC0001_BROWSER_DRIVER_ANCHOR_V1 */

  const unavailableHistoryAction = () => {};

  return (
    <div style={{height: "100vh", background: "rgb(26, 27, 36)", display: "flex", flexDirection: "column", overflow: "hidden"}}>
      <StickFigureTopBar
        projectTitle="Unnamed stick figure project"
        onUndo={unavailableHistoryAction}
        onRedo={unavailableHistoryAction}
        canUndo={false}
        canRedo={false}
      />
      <StickFigureTimelineRow
        fps={timeline.fps}
        isPlaying={isTimelinePlaying}
        isOnionEnabled={isOnionEnabled}
        currentFrameIndex={timeline.currentFrameIndex}
        selectedTimelineIndex={timeline.selectedTimelineIndex}
        activeLayerId={timeline.activeLayerId}
        layers={timeline.layers}
        onFpsChange={(fps) => {
          const next = cloneEditableStickTimelineState(timelineRef.current);
          next.fps = Math.max(1, Math.min(55, fps));
          publishTimeline(next);
        }}
        onCurrentFrameChange={switchToFrame}
        onTimelinePositionSelect={selectTimelinePosition}
        onActiveLayerChange={activateLayer}
        onAddLayer={addLayer}
        onDeleteLayer={deleteActiveLayer}
        canDeleteLayer={timeline.layers.length > 1}
        onToggleOnion={() => setIsOnionEnabled((current) => !current)}
        onPlay={handlePlayTimeline}
        onPause={handlePauseTimeline}
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
          onSelectFigure={selectFigure}
          activeTool={activeTool}
          structureTool={structureTool}
          structureGraph={activeContent.structureGraph}
          canvasMovementEnabled={canvasMovementEnabled}
          cameraZoom={stickCameraZoom}
          cameraPan={stickCameraPan}
          canvasBackgroundColor={canvasBackgroundColor}
          onCommitStructureSegment={commitStructureSegment}
          onSelectStructureJoint={selectStructureJoint}
          onMoveStructureJoint={moveStructureJoint}
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
          onCanvasMovementChange={setStickCanvasMovementEnabled}
          onClearStructureSelection={clearStructureSelection}
          onZoomInputChange={setStickZoomInputValue}
          onApplyZoomInput={applyStickZoomInput}
          onResetCanvasView={resetStickCanvasView}
          onClearCanvasContent={clearStickCanvasContent}
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
