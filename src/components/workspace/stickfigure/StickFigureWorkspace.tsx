import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  advancePlaybackAccumulator,
  getAuthoredPlaybackFrameCount,
  getClampedPlaybackFrameDurationMs,
} from "../timelinePlayback";
import { collapseTimelineRange } from "../timelineStructure";
import { StickFigureCanvas } from "./StickFigureCanvas";
import { StickFigureRightPanel } from "./StickFigureRightPanel";
import type { StickFigureRightPanelTab } from "./StickFigureRightPanel";
import { StickFigureTimelineRow } from "./StickFigureTimelineRow";
import type { TimelineFrame, TimelineFrameKind, TimelineLayer } from "./StickFigureTimelineRow";
import { StickFigureToolBar } from "./StickFigureToolBar";
import type { StickFigureToolName } from "./StickFigureToolBar";
import { StickFigureTopBar } from "./StickFigureTopBar";
import type {
  StickFigureFigureItem,
  StickFigurePoint,
  StickFigureSelection,
  StickFigureStructureGraph,
  StickFigureStructureSegmentDraft,
  StickFigureStructureTool,
} from "./types";

type StickFigureTimelineLayer = TimelineLayer;
type StickFigureWorkspaceHistoryEntry = {
  layers: StickFigureTimelineLayer[];
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
};

type StickFigureTimelineDraftState = {
  layers: StickFigureTimelineLayer[];
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
};

const DEFAULT_STICK_CAMERA_ZOOM = 0.85;
const DEFAULT_STICK_CAMERA_PAN: StickFigurePoint = { x: 0, y: 0 };
const MIN_STICK_CAMERA_ZOOM = 0.5;
const MAX_STICK_CAMERA_ZOOM = 3;

const clampStickCameraZoom = (zoom: number) => Math.min(MAX_STICK_CAMERA_ZOOM, Math.max(MIN_STICK_CAMERA_ZOOM, zoom));
const formatStickCameraZoom = (zoom: number) => `${Math.round(zoom * 100)}%`;

const createTimelineFrame = (
  id: number,
  kind: TimelineFrame["kind"],
  cellType: TimelineFrame["cellType"],
  stateId: number,
): TimelineFrame => ({
  id,
  kind,
  cellType,
  stateId,
  isBlank: cellType === "blank-keyframe",
  hasTweenEndpoint: false,
});

const createEmptyTimelineFrame = (id: number) => createTimelineFrame(id, "frame", "empty", id);

const ensureFramesLength = (frames: TimelineFrame[], length: number, nextFrameIdRef: MutableRefObject<number>) => {
  const nextFrames = [...frames];

  while (nextFrames.length < length) {
    nextFrames.push(createEmptyTimelineFrame(nextFrameIdRef.current++));
  }

  return nextFrames;
};

const findPreviousFilledFrameIndex = (frames: TimelineFrame[], targetIndex: number) => {
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (frames[index] && frames[index].cellType !== "empty") {
      return index;
    }
  }

  return -1;
};

const isFrameStateStart = (frame?: Pick<TimelineFrame, "cellType"> | null) =>
  frame?.cellType === "keyframe" || frame?.cellType === "blank-keyframe";

const cloneTimelineFrame = (frame: TimelineFrame): TimelineFrame => ({ ...frame });

const cloneTimelineLayer = (layer: StickFigureTimelineLayer): StickFigureTimelineLayer => ({
  ...layer,
  frames: layer.frames.map(cloneTimelineFrame),
});

const cloneTimelineLayers = (layers: StickFigureTimelineLayer[]) => layers.map(cloneTimelineLayer);

const findStateStartIndex = (frames: TimelineFrame[], stateId: number) => {
  const explicitStateStartIndex = frames.findIndex((frame) => frame.stateId === stateId && isFrameStateStart(frame));
  if (explicitStateStartIndex >= 0) {
    return explicitStateStartIndex;
  }

  return frames.findIndex((frame, index) => {
    if (frame.stateId !== stateId || frame.cellType === "empty") {
      return false;
    }

    const previousFrame = frames[index - 1];
    return index === 0 || !previousFrame || previousFrame.cellType === "empty" || previousFrame.stateId !== stateId;
  });
};

const resolveStateStartIndex = (frames: TimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex];
  if (!frame) return -1;

  return findStateStartIndex(frames, frame.stateId);
};

const getFrameDurationEndIndex = (frames: TimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex];
  if (!frame) return frameIndex;

  let endIndex = frameIndex;
  while (endIndex + 1 < frames.length && frames[endIndex + 1].stateId === frame.stateId && frames[endIndex + 1].cellType !== "empty") {
    endIndex += 1;
  }

  return endIndex;
};

const reassignTrailingStateCells = (frames: TimelineFrame[], insertedIndex: number, fromStateId: number, toStateId: number) => {
  for (let index = insertedIndex + 1; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.stateId !== fromStateId || isFrameStateStart(frame) || frame.cellType === "empty") {
      break;
    }

    frames[index] = {
      ...frame,
      stateId: toStateId,
      kind: "frame",
      cellType: "hold",
    };
  }
};

const fillTimelineRangeWithFrameSpan = (
  frames: TimelineFrame[],
  startIndex: number,
  endIndex: number,
  stateId: number,
  nextFrameIdRef: MutableRefObject<number>,
) => {
  for (let index = startIndex; index <= endIndex; index += 1) {
    const existingFrame = frames[index];
    const spanFrame =
      existingFrame && existingFrame.cellType === "empty"
        ? createTimelineFrame(existingFrame.id, "frame", "hold", stateId)
        : createTimelineFrame(nextFrameIdRef.current++, "frame", "hold", stateId);

    if (existingFrame && existingFrame.cellType === "empty") {
      frames[index] = spanFrame;
      continue;
    }

    if (existingFrame) {
      frames.splice(index, 0, spanFrame);
      continue;
    }

    frames.push(spanFrame);
  }
};

const getAuthoredPlaybackFrameCountForLayers = (layers: StickFigureTimelineLayer[]) =>
  getAuthoredPlaybackFrameCount(layers.map((layer) => layer.frames));

type StickFigureWorkspaceProps = {
  onOpenStickFigureCreator: () => void;
};

export function StickFigureWorkspace({ onOpenStickFigureCreator }: StickFigureWorkspaceProps) {
  const nextFrameIdRef = useRef(2);
  const nextStateIdRef = useRef(2);
  const nextLayerIdRef = useRef(2);
  const nextStructureJointIdRef = useRef(1);
  const nextStructureLimbIdRef = useRef(1);
  const layersRef = useRef<StickFigureTimelineLayer[]>([]);
  const currentFrameIndexRef = useRef(0);
  const selectedTimelineIndexRef = useRef(0);
  const activeLayerIdRef = useRef("stick-layer-1");
  const isTimelinePlayingRef = useRef(false);
  const [timelineFps, setTimelineFps] = useState(12);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [isOnionEnabled, setIsOnionEnabled] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState(0);
  const [activeLayerId, setActiveLayerId] = useState("stick-layer-1");
  const [layers, setLayers] = useState<StickFigureTimelineLayer[]>([
    {
      id: "stick-layer-1",
      name: "Layer 1",
      frames: [createTimelineFrame(1, "keyframe", "keyframe", 1)],
    },
  ]);
  const [figures] = useState<StickFigureFigureItem[]>([]);
  const [selection, setSelection] = useState<StickFigureSelection>({ target: "workspace" });
  const [activeTool, setActiveTool] = useState<StickFigureToolName | null>("Select");
  const [rightPanelTab, setRightPanelTab] = useState<StickFigureRightPanelTab>("Properties");
  const [canvasMovementEnabled, setCanvasMovementEnabled] = useState(false);
  const [stickCameraZoom, setStickCameraZoom] = useState(DEFAULT_STICK_CAMERA_ZOOM);
  const [stickZoomInputValue, setStickZoomInputValue] = useState(formatStickCameraZoom(DEFAULT_STICK_CAMERA_ZOOM));
  const [stickCameraPan, setStickCameraPan] = useState<StickFigurePoint>(DEFAULT_STICK_CAMERA_PAN);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState("#f5f5f5");
  const [structureTool, setStructureTool] = useState<StickFigureStructureTool>("idle");
  const [structureGraph, setStructureGraph] = useState<StickFigureStructureGraph>({
    joints: [],
    limbs: [],
    activeJointId: null,
  });
  const [undoStack, setUndoStack] = useState<StickFigureWorkspaceHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<StickFigureWorkspaceHistoryEntry[]>([]);
  const undoStackRef = useRef<StickFigureWorkspaceHistoryEntry[]>([]);
  const redoStackRef = useRef<StickFigureWorkspaceHistoryEntry[]>([]);
  const authoredPlaybackFrameCount = useMemo(() => getAuthoredPlaybackFrameCountForLayers(layers), [layers]);
  const selectedStructureJoint = useMemo(
    () => structureGraph.joints.find((joint) => joint.id === structureGraph.activeJointId) ?? null,
    [structureGraph.activeJointId, structureGraph.joints],
  );
  const selectedStructureJointConnectionCount = useMemo(() => {
    if (!selectedStructureJoint) {
      return 0;
    }

    return structureGraph.limbs.reduce(
      (count, limb) =>
        count +
        (limb.startJointId === selectedStructureJoint.id || limb.endJointId === selectedStructureJoint.id ? 1 : 0),
      0,
    );
  }, [selectedStructureJoint, structureGraph.limbs]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    currentFrameIndexRef.current = currentFrameIndex;
  }, [currentFrameIndex]);

  useEffect(() => {
    selectedTimelineIndexRef.current = selectedTimelineIndex;
  }, [selectedTimelineIndex]);

  useEffect(() => {
    activeLayerIdRef.current = activeLayerId;
  }, [activeLayerId]);

  useEffect(() => {
    isTimelinePlayingRef.current = isTimelinePlaying;
  }, [isTimelinePlaying]);

  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  useEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  const applyFrameSelection = useCallback((nextCurrentFrameIndex: number, nextSelectedFrameIndex = nextCurrentFrameIndex) => {
    currentFrameIndexRef.current = nextCurrentFrameIndex;
    setCurrentFrameIndex(nextCurrentFrameIndex);
    selectedTimelineIndexRef.current = nextSelectedFrameIndex;
    setSelectedTimelineIndex(nextSelectedFrameIndex);
  }, []);

  const selectTimelinePosition = useCallback((nextIndex: number) => {
    const clampedIndex = Math.max(0, nextIndex);
    selectedTimelineIndexRef.current = clampedIndex;
    setSelectedTimelineIndex(clampedIndex);
  }, []);

  const applyActiveLayer = useCallback((nextLayerId: string) => {
    activeLayerIdRef.current = nextLayerId;
    setActiveLayerId(nextLayerId);
  }, []);

  const createHistoryEntry = useCallback(
    (): StickFigureWorkspaceHistoryEntry => ({
      layers: cloneTimelineLayers(layersRef.current),
      activeLayerId: activeLayerIdRef.current,
      currentFrameIndex: currentFrameIndexRef.current,
      selectedTimelineIndex: selectedTimelineIndexRef.current,
    }),
    [],
  );

  const commitTimelineStructureChange = useCallback(
    (mutateDraft: (draft: StickFigureTimelineDraftState) => boolean) => {
      if (isTimelinePlayingRef.current) {
        return;
      }

      const previousEntry = createHistoryEntry();

      const draft: StickFigureTimelineDraftState = {
        layers: cloneTimelineLayers(layersRef.current),
        activeLayerId: activeLayerIdRef.current,
        currentFrameIndex: currentFrameIndexRef.current,
        selectedTimelineIndex: selectedTimelineIndexRef.current,
      };

      if (!mutateDraft(draft)) {
        return;
      }

      const resolvedActiveLayerId = draft.layers.some((layer) => layer.id === draft.activeLayerId)
        ? draft.activeLayerId
        : draft.layers[0]?.id ?? "stick-layer-1";
      const maxFrameIndex = Math.max(0, getAuthoredPlaybackFrameCountForLayers(draft.layers) - 1);
      const nextCurrentFrameIndex = Math.max(0, Math.min(draft.currentFrameIndex, maxFrameIndex));
      const nextSelectedFrameIndex = Math.max(0, Math.min(draft.selectedTimelineIndex, maxFrameIndex));

      const nextUndoStack = [...undoStackRef.current, previousEntry];
      undoStackRef.current = nextUndoStack;
      redoStackRef.current = [];
      setUndoStack(nextUndoStack);
      setRedoStack([]);
      layersRef.current = draft.layers;
      setLayers(draft.layers);
      applyActiveLayer(resolvedActiveLayerId);
      applyFrameSelection(nextCurrentFrameIndex, nextSelectedFrameIndex);
    },
    [applyActiveLayer, applyFrameSelection, createHistoryEntry],
  );

  const activateLayer = useCallback(
    (layerId: string) => {
      const nextLayer = layersRef.current.find((layer) => layer.id === layerId);
      if (!nextLayer || nextLayer.id === activeLayerIdRef.current) {
        return;
      }

      applyActiveLayer(nextLayer.id);
    },
    [applyActiveLayer],
  );

  useEffect(() => {
    const maxAuthoredIndex = Math.max(0, authoredPlaybackFrameCount - 1);
    const shouldClampCurrentFrame = currentFrameIndexRef.current > maxAuthoredIndex;
    const shouldClampSelectedFrame = selectedTimelineIndexRef.current > maxAuthoredIndex;
    const shouldStopPlayback = authoredPlaybackFrameCount <= 1 && isTimelinePlayingRef.current;

    if (!shouldClampCurrentFrame && !shouldClampSelectedFrame && !shouldStopPlayback) {
      return;
    }

    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      if (shouldClampCurrentFrame) {
        applyFrameSelection(maxAuthoredIndex, Math.min(selectedTimelineIndexRef.current, maxAuthoredIndex));
      } else if (shouldClampSelectedFrame) {
        selectedTimelineIndexRef.current = maxAuthoredIndex;
        setSelectedTimelineIndex(maxAuthoredIndex);
      }

      if (shouldStopPlayback) {
        setIsTimelinePlaying(false);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [applyFrameSelection, authoredPlaybackFrameCount]);

  useEffect(() => {
    if (!isTimelinePlaying || authoredPlaybackFrameCount <= 1) {
      return undefined;
    }

    let frameId = 0;
    let lastTimestamp = 0;
    let accumulatorMs = 0;

    const tick = (timestamp: number) => {
      if (!isTimelinePlayingRef.current) {
        return;
      }

      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      const frameDurationMs = getClampedPlaybackFrameDurationMs(timelineFps);
      const { accumulatorMs: nextAccumulatorMs, steps } = advancePlaybackAccumulator(
        accumulatorMs,
        timestamp - lastTimestamp,
        frameDurationMs,
      );

      accumulatorMs = nextAccumulatorMs;
      lastTimestamp = timestamp;

      if (steps > 0) {
        let nextIndex = currentFrameIndexRef.current;
        let shouldStopPlayback = false;

        for (let step = 0; step < steps; step += 1) {
          const frameCount = getAuthoredPlaybackFrameCountForLayers(layersRef.current);
          if (frameCount <= 1) {
            shouldStopPlayback = true;
            break;
          }

          nextIndex = nextIndex >= frameCount - 1 ? 0 : nextIndex + 1;
        }

        if (shouldStopPlayback) {
          setIsTimelinePlaying(false);
          return;
        }

        applyFrameSelection(nextIndex);
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [applyFrameSelection, authoredPlaybackFrameCount, isTimelinePlaying, timelineFps]);

  const switchToFrame = useCallback(
    (index: number) => {
      const frameCount = getAuthoredPlaybackFrameCountForLayers(layersRef.current);
      const maxFrameIndex = Math.max(0, frameCount - 1);
      const nextIndex = Math.max(0, Math.min(index, maxFrameIndex));
      applyFrameSelection(nextIndex);
    },
    [applyFrameSelection],
  );

  const handlePlayTimeline = useCallback(() => {
    const frameCount = getAuthoredPlaybackFrameCountForLayers(layersRef.current);
    const clampedIndex = Math.max(0, Math.min(currentFrameIndexRef.current, frameCount - 1));

    applyFrameSelection(clampedIndex);

    if (frameCount <= 1) {
      setIsTimelinePlaying(false);
      return;
    }

    setIsTimelinePlaying(true);
  }, [applyFrameSelection]);

  const handlePauseTimeline = useCallback(() => {
    setIsTimelinePlaying(false);
  }, []);

  const addLayer = useCallback(() => {
    commitTimelineStructureChange((draft) => {
      const nextLayerId = `stick-layer-${nextLayerIdRef.current++}`;
      draft.layers = [
        ...draft.layers,
        {
          id: nextLayerId,
          name: `Layer ${draft.layers.length + 1}`,
          frames: [createTimelineFrame(nextFrameIdRef.current++, "keyframe", "keyframe", nextStateIdRef.current++)],
        },
      ];
      draft.activeLayerId = nextLayerId;
      return true;
    });
  }, [commitTimelineStructureChange]);

  const deleteActiveLayer = useCallback(() => {
    commitTimelineStructureChange((draft) => {
      if (draft.layers.length <= 1) {
        return false;
      }

      const layerIdToDelete = draft.activeLayerId;
      const nextLayers = draft.layers.filter((layer) => layer.id !== layerIdToDelete);
      if (nextLayers.length === draft.layers.length) {
        return false;
      }

      draft.layers = nextLayers;
      draft.activeLayerId = nextLayers[0]?.id ?? "stick-layer-1";
      return true;
    });
  }, [commitTimelineStructureChange]);

  const addTimelineFrame = useCallback((
    layerId: string,
    kind: TimelineFrameKind,
    targetIndex: number,
    options?: { blank?: boolean },
  ) => {
    const nextTargetIndex = Math.max(0, targetIndex);
    const normalizedKind = kind === "keyframe" ? "keyframe" : "frame";
    commitTimelineStructureChange((draft) => {
      const layerIndex = draft.layers.findIndex((layer) => layer.id === layerId);
      if (layerIndex < 0) {
        return false;
      }

      const layer = draft.layers[layerIndex];
      const nextFrames = ensureFramesLength(layer.frames, nextTargetIndex + 1, nextFrameIdRef);
      const targetFrame = nextFrames[nextTargetIndex];
      let nextSelectedIndex = nextTargetIndex;

      if (!targetFrame || targetFrame.cellType === "empty") {
        if (normalizedKind === "keyframe") {
          const targetFrameId = targetFrame?.id ?? nextFrameIdRef.current++;
          nextFrames[nextTargetIndex] = createTimelineFrame(
            targetFrameId,
            "keyframe",
            options?.blank ? "blank-keyframe" : "keyframe",
            nextStateIdRef.current++,
          );
        } else {
          const previousFilledFrameIndex = findPreviousFilledFrameIndex(nextFrames, nextTargetIndex);
          if (previousFilledFrameIndex < 0) {
            const targetFrameId = targetFrame?.id ?? nextFrameIdRef.current++;
            nextFrames[nextTargetIndex] = createTimelineFrame(targetFrameId, "keyframe", "keyframe", nextStateIdRef.current++);
          } else {
            const sourceEndIndex = getFrameDurationEndIndex(nextFrames, previousFilledFrameIndex);
            fillTimelineRangeWithFrameSpan(
              nextFrames,
              sourceEndIndex + 1,
              nextTargetIndex,
              nextFrames[previousFilledFrameIndex].stateId,
              nextFrameIdRef,
            );
          }
        }
      } else if (normalizedKind === "frame") {
        const insertIndex = getFrameDurationEndIndex(nextFrames, nextTargetIndex) + 1;
        fillTimelineRangeWithFrameSpan(nextFrames, insertIndex, insertIndex, targetFrame.stateId, nextFrameIdRef);
        nextSelectedIndex = insertIndex;
      } else {
        const insertIndex = nextTargetIndex + 1;
        const nextFrameId = nextFrameIdRef.current++;
        const nextStateId = nextStateIdRef.current++;
        nextFrames.splice(
          insertIndex,
          0,
          createTimelineFrame(nextFrameId, "keyframe", options?.blank ? "blank-keyframe" : "keyframe", nextStateId),
        );
        reassignTrailingStateCells(nextFrames, insertIndex, targetFrame.stateId, nextStateId);
        nextSelectedIndex = insertIndex;
      }

      draft.layers[layerIndex] = { ...layer, frames: nextFrames };
      draft.activeLayerId = layerId;
      draft.currentFrameIndex = nextSelectedIndex;
      draft.selectedTimelineIndex = nextSelectedIndex;
      return true;
    });
  }, [commitTimelineStructureChange]);

  const removeTimelineFrame = useCallback((layerId: string, targetIndex: number) => {
    commitTimelineStructureChange((draft) => {
      const layerIndex = draft.layers.findIndex((layer) => layer.id === layerId);
      if (layerIndex < 0) {
        return false;
      }

      const layer = draft.layers[layerIndex];
      const clampedTarget = Math.max(0, Math.min(targetIndex, layer.frames.length - 1));
      const targetFrame = layer.frames[clampedTarget];
      if (!targetFrame || targetFrame.cellType === "empty") {
        return false;
      }

      let removeStartIndex = clampedTarget;
      let removeEndIndex = clampedTarget;

      if (isFrameStateStart(targetFrame)) {
        removeEndIndex = getFrameDurationEndIndex(layer.frames, clampedTarget);
      } else if (targetFrame.cellType === "hold") {
        removeStartIndex = resolveStateStartIndex(layer.frames, clampedTarget);
        removeEndIndex = getFrameDurationEndIndex(layer.frames, removeStartIndex);
      }

      const { frames: nextFrames, removedFrameCount } = collapseTimelineRange(
        layer.frames,
        removeStartIndex,
        removeEndIndex,
        () => createEmptyTimelineFrame(nextFrameIdRef.current++),
      );

      if (removedFrameCount === 0) {
        return false;
      }

      if (draft.currentFrameIndex >= removeStartIndex && draft.currentFrameIndex <= removeEndIndex) {
        draft.currentFrameIndex = removeStartIndex;
      } else if (draft.currentFrameIndex > removeEndIndex) {
        draft.currentFrameIndex -= removedFrameCount;
      }

      if (draft.selectedTimelineIndex >= removeStartIndex && draft.selectedTimelineIndex <= removeEndIndex) {
        draft.selectedTimelineIndex = removeStartIndex;
      } else if (draft.selectedTimelineIndex > removeEndIndex) {
        draft.selectedTimelineIndex -= removedFrameCount;
      }

      draft.layers[layerIndex] = { ...layer, frames: nextFrames };
      draft.activeLayerId = layerId;
      return true;
    });
  }, [commitTimelineStructureChange]);

  const resizeTimelineSpan = useCallback((layerId: string, stateId: number, _spanType: "frame" | "tween", nextEndIndex: number) => {
    commitTimelineStructureChange((draft) => {
      const layerIndex = draft.layers.findIndex((layer) => layer.id === layerId);
      if (layerIndex < 0) {
        return false;
      }

      const layer = draft.layers[layerIndex];
      const nextFrames = ensureFramesLength(layer.frames, nextEndIndex + 1, nextFrameIdRef);
      const startIndex = nextFrames.findIndex((frame) => frame.stateId === stateId && frame.cellType !== "empty");
      if (startIndex < 0) {
        return false;
      }

      let previousEndIndex = startIndex;
      for (let index = startIndex + 1; index < nextFrames.length; index += 1) {
        if (nextFrames[index].stateId !== stateId) {
          break;
        }
        previousEndIndex = index;
      }

      if (nextEndIndex === previousEndIndex) {
        return false;
      }

      for (let index = startIndex + 1; index < nextFrames.length; index += 1) {
        if (index <= nextEndIndex) {
          nextFrames[index] = createTimelineFrame(
            nextFrameIdRef.current++,
            "frame",
            "hold",
            stateId,
          );
        } else if (nextFrames[index].stateId !== stateId) {
          break;
        }
      }

      if (nextEndIndex < previousEndIndex) {
        const removeStartIndex = nextEndIndex + 1;
        const removeEndIndex = previousEndIndex;
        const { frames: collapsedFrames, removedFrameCount } = collapseTimelineRange(
          nextFrames,
          removeStartIndex,
          removeEndIndex,
          () => createEmptyTimelineFrame(nextFrameIdRef.current++),
        );

        if (removedFrameCount > 0) {
          if (draft.currentFrameIndex >= removeStartIndex && draft.currentFrameIndex <= removeEndIndex) {
            draft.currentFrameIndex = nextEndIndex;
          } else if (draft.currentFrameIndex > removeEndIndex) {
            draft.currentFrameIndex -= removedFrameCount;
          }

          if (draft.selectedTimelineIndex >= removeStartIndex && draft.selectedTimelineIndex <= removeEndIndex) {
            draft.selectedTimelineIndex = nextEndIndex;
          } else if (draft.selectedTimelineIndex > removeEndIndex) {
            draft.selectedTimelineIndex -= removedFrameCount;
          }
        }

        draft.layers[layerIndex] = { ...layer, frames: collapsedFrames };
      } else {
        draft.layers[layerIndex] = { ...layer, frames: nextFrames };
      }

      draft.activeLayerId = layerId;
      return true;
    });
  }, [commitTimelineStructureChange]);

  const selectFigure = (figureId: string) => {
    setSelection({ target: "figure", figureId });
  };

  const activateSelectTool = useCallback(() => {
    setSelection({ target: "workspace" });
    setActiveTool("Select");
    setStructureTool("idle");
    setRightPanelTab("Properties");
  }, []);

  const activateStructureLimbTool = useCallback(() => {
    setSelection({ target: "workspace" });
    setActiveTool(null);
    setCanvasMovementEnabled(false);
    setStructureTool("addLimb");
    setRightPanelTab("Stick Figure Tools");
    setStructureGraph((current) =>
      current.activeJointId === null
        ? current
        : {
            ...current,
            activeJointId: null,
          },
    );
  }, []);

  const selectStructureJoint = useCallback((jointId: string | null) => {
    setSelection({ target: "workspace" });
    setRightPanelTab("Properties");
    setStructureGraph((current) => {
      if (current.activeJointId === jointId) {
        return current;
      }

      return {
        ...current,
        activeJointId: jointId,
      };
    });
  }, []);

  const clearStructureSelection = useCallback(() => {
    selectStructureJoint(null);
  }, [selectStructureJoint]);

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
    if (!window.confirm("Clear the current canvas? This will remove the visible artwork on this canvas.")) {
      return;
    }

    setSelection({ target: "workspace" });
    setStructureGraph({ joints: [], limbs: [], activeJointId: null });
  }, []);

  const setStickCanvasMovementEnabled = useCallback((enabled: boolean) => {
    setCanvasMovementEnabled(enabled);
    setRightPanelTab("Properties");

    if (!enabled) {
      return;
    }

    setStructureGraph((current) =>
      current.activeJointId === null
        ? current
        : {
            ...current,
            activeJointId: null,
          },
    );
  }, []);

  const moveStructureJoint = useCallback((jointId: string, point: StickFigureStructureSegmentDraft["startPoint"]) => {
    setStructureGraph((current) => {
      let didMove = false;
      const nextJoints = current.joints.map((joint) => {
        if (joint.id !== jointId) {
          return joint;
        }

        if (joint.x === point.x && joint.y === point.y) {
          return joint;
        }

        didMove = true;
        return {
          ...joint,
          x: point.x,
          y: point.y,
        };
      });

      if (!didMove) {
        return current.activeJointId === jointId ? current : { ...current, activeJointId: jointId };
      }

      return {
        ...current,
        joints: nextJoints,
        activeJointId: jointId,
      };
    });
  }, []);

  const commitStructureSegment = useCallback((draft: StickFigureStructureSegmentDraft) => {
    const segmentLength = Math.hypot(draft.endPoint.x - draft.startPoint.x, draft.endPoint.y - draft.startPoint.y);
    if (segmentLength < 18) {
      return false;
    }

    let didCommit = false;

    setStructureGraph((current) => {
      const jointsById = new Map(current.joints.map((joint) => [joint.id, joint]));
      const nextJoints = [...current.joints];

      const resolveJointId = (existingId: string | null | undefined, point: StickFigureStructureSegmentDraft["startPoint"]) => {
        if (existingId && jointsById.has(existingId)) {
          return existingId;
        }

        const nextJointId = `stick-joint-${nextStructureJointIdRef.current++}`;
        const nextJoint = {
          id: nextJointId,
          x: point.x,
          y: point.y,
        };

        jointsById.set(nextJointId, nextJoint);
        nextJoints.push(nextJoint);
        return nextJointId;
      };

      const startJointId = resolveJointId(draft.startJointId, draft.startPoint);
      const endJointId = resolveJointId(draft.endJointId, draft.endPoint);

      if (startJointId === endJointId) {
        return current;
      }

      const limbAlreadyExists = current.limbs.some(
        (limb) =>
          (limb.startJointId === startJointId && limb.endJointId === endJointId) ||
          (limb.startJointId === endJointId && limb.endJointId === startJointId),
      );
      if (limbAlreadyExists) {
        return {
          ...current,
          activeJointId: endJointId,
        };
      }

      didCommit = true;

      return {
        joints: nextJoints,
        limbs: [
          ...current.limbs,
          {
            id: `stick-limb-${nextStructureLimbIdRef.current++}`,
            startJointId,
            endJointId,
          },
        ],
        activeJointId: endJointId,
      };
    });

    return didCommit;
  }, []);

  const unavailableHistoryAction = useCallback(() => {
    // Stick Figure top-bar undo/redo is intentionally reserved for future content history.
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        background: "rgb(26, 27, 36)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <StickFigureTopBar
        projectTitle="Unnamed stick figure project"
        onUndo={unavailableHistoryAction}
        onRedo={unavailableHistoryAction}
        canUndo={false}
        canRedo={false}
      />
      <StickFigureTimelineRow
        fps={timelineFps}
        isPlaying={isTimelinePlaying}
        isOnionEnabled={isOnionEnabled}
        currentFrameIndex={currentFrameIndex}
        selectedTimelineIndex={selectedTimelineIndex}
        activeLayerId={activeLayerId}
        layers={layers}
        onFpsChange={(nextFps) => setTimelineFps(Math.max(1, Math.min(55, nextFps)))}
        onCurrentFrameChange={switchToFrame}
        onTimelinePositionSelect={selectTimelinePosition}
        onActiveLayerChange={activateLayer}
        onAddLayer={addLayer}
        onDeleteLayer={deleteActiveLayer}
        canDeleteLayer={layers.length > 1}
        onToggleOnion={() => setIsOnionEnabled((current) => !current)}
        onPlay={handlePlayTimeline}
        onPause={handlePauseTimeline}
        onAddFrame={addTimelineFrame}
        onRemoveFrame={removeTimelineFrame}
        onResizeTimelineSpan={resizeTimelineSpan}
      />
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <StickFigureCanvas
          figures={figures}
          selection={selection}
          onSelectFigure={selectFigure}
          activeTool={activeTool}
          structureTool={structureTool}
          structureGraph={structureGraph}
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
          structureJointCount={structureGraph.joints.length}
          structureLimbCount={structureGraph.limbs.length}
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
    </div>
  );
}
