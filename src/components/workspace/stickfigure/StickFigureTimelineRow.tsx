import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { StickFigureFrameContent } from "./types";

export type TimelineFrameKind = "frame" | "keyframe" | "tween";

export type TimelineFrameCellType = "empty" | "keyframe" | "blank-keyframe" | "hold" | "tween";

export type TimelineFrame = {
  id: number;
  kind: TimelineFrameKind;
  cellType: TimelineFrameCellType;
  stateId: number;
  isBlank?: boolean;
  hasTweenEndpoint?: boolean;
  content?: StickFigureFrameContent;
};

export type TimelineLayer = {
  id: string;
  name: string;
  frames: TimelineFrame[];
};

type TimelineRowProps = {
  fps: number;
  isPlaying: boolean;
  isOnionEnabled: boolean;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  activeLayerId: string;
  layers: TimelineLayer[];
  onFpsChange: (fps: number) => void;
  onCurrentFrameChange: (index: number) => void;
  onTimelinePositionSelect: (index: number) => void;
  onActiveLayerChange: (layerId: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: () => void;
  canDeleteLayer: boolean;
  onToggleOnion: () => void;
  onPlay: () => void;
  onPause: () => void;
  onAddFrame: (layerId: string, kind: TimelineFrameKind, targetIndex: number, options?: { blank?: boolean }) => void;
  onRemoveFrame: (layerId: string, targetIndex: number) => void;
  onCopyFrame: (layerId: string, targetIndex: number) => void;
  onPasteFrame: (layerId: string, targetIndex: number) => void;
  canPasteFrame: boolean;
  onResizeTimelineSpan: (layerId: string, stateId: number, spanType: "frame" | "tween", nextEndIndex: number) => void;
};

type TimelineContextMenuState = {
  left: number;
  top: number;
  targetIndex: number;
  targetLayerId: string;
  menuWidth: number;
} | null;

type TimelineResizeState = {
  pointerId: number;
  layerId: string;
  stateId: number;
  spanType: "frame" | "tween";
  minimumEndIndex: number;
};

type TimelinePanelResizeState = {
  pointerId: number;
  startY: number;
  startRowsHeight: number;
};

type TimelineSpanBounds = {
  startIndex: number;
  endIndex: number;
};

type TweenActivationSpan = {
  ownerIndex: number;
  spanStartIndex: number;
  spanEndIndex: number;
};

type TimelineActivationSource = "row-background" | "frame-button" | "resize-edge";

const clampFps = (value: number) => Math.max(1, Math.min(55, Math.round(value)));

const timelineButtonStyle = {
  minHeight: 26,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.74)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

const FRAME_CELL_WIDTH = 17;
const TIMELINE_RULER_HEIGHT = 10;
const TIMELINE_RULER_INTERVAL = 5;
const TIMELINE_MAX_FRAME_RANGE = 10000;
const TIMELINE_SCROLL_END_PADDING = FRAME_CELL_WIDTH * 2;
const TIMELINE_EMPTY_SLOT_FILL = "transparent";
const TIMELINE_EMPTY_SLOT_BORDER = "transparent";
const TIMELINE_SELECTED_SLOT_BORDER = "rgba(102,196,255,0.86)";
const TIMELINE_FRAME_SPAN_FILL = "rgb(124,128,136)";
const TIMELINE_FRAME_SPAN_BORDER = "rgba(20,22,28,0.88)";
const TIMELINE_FRAME_SPAN_LINE = "rgb(158,164,172)";
const TIMELINE_TWEEN_SPAN_FILL = "rgb(83,97,129)";
const TIMELINE_TWEEN_SPAN_BORDER = "rgba(39,55,82,0.9)";
const TIMELINE_TWEEN_SPAN_LINE = "rgb(116,172,246)";
const TIMELINE_SPAN_DOT_LINE_GAP = 14;
const TIMELINE_LEFT_RAIL_HEIGHT = 54;
const TIMELINE_LAYER_ROW_HEIGHT = 38;
const TIMELINE_BOTTOM_SCROLLBAR_HEIGHT = 6;
const TIMELINE_RESIZE_EDGE_HEIGHT = 12;
const TIMELINE_MIN_PANEL_ROWS_HEIGHT = TIMELINE_LAYER_ROW_HEIGHT;
const TIMELINE_AUTO_EXPAND_VISIBLE_ROWS = 3;

const getLayerVisualSpanType = (frames: TimelineFrame[], index: number): "frame" | "tween" | null => {
  const frame = frames[index];
  if (!frame || frame.cellType === "empty") return null;
  return frame.cellType === "tween" ? "tween" : "frame";
};

const getHighlightedSpanBounds = (
  frames: TimelineFrame[],
  currentFrameIndex: number,
  selectedTimelineIndex: number,
): TimelineSpanBounds | null => {
  const highlightedFrameIndex =
    selectedTimelineIndex < frames.length && frames[selectedTimelineIndex]?.cellType !== "empty"
      ? selectedTimelineIndex
      : currentFrameIndex;
  const highlightedFrame = highlightedFrameIndex >= 0 ? frames[highlightedFrameIndex] : undefined;
  const highlightedStateId = highlightedFrame && highlightedFrame.cellType !== "empty" ? highlightedFrame.stateId : null;
  const highlightedSpanType = highlightedStateId !== null ? getLayerVisualSpanType(frames, highlightedFrameIndex) : null;

  if (highlightedStateId === null || highlightedSpanType === null || highlightedFrameIndex < 0) {
    return null;
  }

  let startIndex = highlightedFrameIndex;
  let endIndex = highlightedFrameIndex;

  while (
    startIndex > 0 &&
    frames[startIndex - 1].cellType !== "empty" &&
    frames[startIndex - 1].stateId === highlightedStateId &&
    getLayerVisualSpanType(frames, startIndex - 1) === highlightedSpanType
  ) {
    startIndex -= 1;
  }

  while (
    endIndex + 1 < frames.length &&
    frames[endIndex + 1].cellType !== "empty" &&
    frames[endIndex + 1].stateId === highlightedStateId &&
    getLayerVisualSpanType(frames, endIndex + 1) === highlightedSpanType
  ) {
    endIndex += 1;
  }

  return { startIndex, endIndex };
};

const getTweenLineSegments = (frames: TimelineFrame[]) => {
  const segments: Array<{ startIndex: number; width: number }> = [];

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (!frame || frame.cellType !== "tween") {
      continue;
    }

    const previousFrame = frames[index - 1];
    if (previousFrame?.cellType === "tween" && previousFrame.stateId === frame.stateId) {
      continue;
    }

    let endIndex = index;
    while (endIndex + 1 < frames.length) {
      const nextFrame = frames[endIndex + 1];
      if (!nextFrame || nextFrame.cellType !== "tween" || nextFrame.stateId !== frame.stateId) {
        break;
      }
      endIndex += 1;
    }

    const width = (endIndex - index + 1) * FRAME_CELL_WIDTH - 16 - TIMELINE_SPAN_DOT_LINE_GAP;
    if (width > 0) {
      segments.push({ startIndex: index, width });
    }

    index = endIndex;
  }

  return segments;
};

const resolveTweenActivationSpan = (frames: TimelineFrame[], frameIndex: number): TweenActivationSpan | null => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType === "empty") {
    return null;
  }

  if (frame.cellType === "tween") {
    let spanStartIndex = frameIndex;
    while (
      spanStartIndex > 0 &&
      frames[spanStartIndex - 1].cellType === "tween" &&
      frames[spanStartIndex - 1].stateId === frame.stateId
    ) {
      spanStartIndex -= 1;
    }

    let spanEndIndex = frameIndex;
    while (
      spanEndIndex + 1 < frames.length &&
      frames[spanEndIndex + 1].cellType === "tween" &&
      frames[spanEndIndex + 1].stateId === frame.stateId
    ) {
      spanEndIndex += 1;
    }

    const ownerIndex = spanStartIndex - 1;
    const ownerFrame = ownerIndex >= 0 ? frames[ownerIndex] : null;
    if (!ownerFrame || ownerFrame.cellType === "empty" || ownerFrame.cellType === "tween" || ownerFrame.stateId !== frame.stateId) {
      return null;
    }

    return { ownerIndex, spanStartIndex, spanEndIndex };
  }

  const nextFrame = frames[frameIndex + 1];
  if (!nextFrame || nextFrame.cellType !== "tween" || nextFrame.stateId !== frame.stateId) {
    return null;
  }

  let spanEndIndex = frameIndex + 1;
  while (
    spanEndIndex + 1 < frames.length &&
    frames[spanEndIndex + 1].cellType === "tween" &&
    frames[spanEndIndex + 1].stateId === frame.stateId
  ) {
    spanEndIndex += 1;
  }

  return {
    ownerIndex: frameIndex,
    spanStartIndex: frameIndex + 1,
    spanEndIndex,
  };
};

export function StickFigureTimelineRow({
  fps,
  isPlaying,
  isOnionEnabled,
  currentFrameIndex,
  selectedTimelineIndex,
  activeLayerId,
  layers,
  onFpsChange,
  onCurrentFrameChange,
  onTimelinePositionSelect,
  onActiveLayerChange,
  onAddLayer,
  onDeleteLayer,
  canDeleteLayer,
  onToggleOnion,
  onPlay,
  onPause,
  onAddFrame,
  onRemoveFrame,
  onCopyFrame,
  onPasteFrame,
  canPasteFrame,
  onResizeTimelineSpan,
}: TimelineRowProps) {
  const [fpsInputValue, setFpsInputValue] = useState(String(fps));
  const [contextMenu, setContextMenu] = useState<TimelineContextMenuState>(null);
  const [visibleTimelineWidth, setVisibleTimelineWidth] = useState(0);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [resizeState, setResizeState] = useState<TimelineResizeState | null>(null);
  const [panelResizeState, setPanelResizeState] = useState<TimelinePanelResizeState | null>(null);
  const [timelineRowsHeight, setTimelineRowsHeight] = useState(TIMELINE_MIN_PANEL_ROWS_HEIGHT);
  const previousLayerCountRef = useRef(layers.length);
  const rowsViewportRef = useRef<HTMLDivElement | null>(null);
  const frameLaneViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFpsInputValue(String(fps));
  }, [fps]);

  const activeLayer = useMemo(() => layers.find((layer) => layer.id === activeLayerId) ?? layers[0] ?? null, [activeLayerId, layers]);
  const isExpanded = timelineRowsHeight > TIMELINE_MIN_PANEL_ROWS_HEIGHT + 2;
  const visibleLayers = useMemo(() => {
    if (!activeLayer) {
      return layers.slice(0, 1);
    }

    return isExpanded ? layers : [activeLayer];
  }, [activeLayer, isExpanded, layers]);
  const activeVisibleRowIndex = useMemo(
    () => Math.max(0, visibleLayers.findIndex((layer) => layer.id === activeLayerId)),
    [activeLayerId, visibleLayers],
  );

  useEffect(() => {
    const maxRowsHeight = Math.max(TIMELINE_MIN_PANEL_ROWS_HEIGHT, layers.length * TIMELINE_LAYER_ROW_HEIGHT);
    const previousLayerCount = previousLayerCountRef.current;
    setTimelineRowsHeight((currentHeight) => {
      if (layers.length <= 1) {
        return TIMELINE_MIN_PANEL_ROWS_HEIGHT;
      }

      const clampedHeight = Math.max(TIMELINE_MIN_PANEL_ROWS_HEIGHT, Math.min(currentHeight, maxRowsHeight));
      if (layers.length > previousLayerCount) {
        const targetVisibleRows = Math.min(TIMELINE_AUTO_EXPAND_VISIBLE_ROWS, layers.length);
        return Math.max(clampedHeight, targetVisibleRows * TIMELINE_LAYER_ROW_HEIGHT);
      }

      return clampedHeight;
    });
    previousLayerCountRef.current = layers.length;
  }, [layers.length]);

  useLayoutEffect(() => {
    const viewport = rowsViewportRef.current;
    if (!viewport) return;

    if (!isExpanded) {
      if (viewport.scrollTop !== 0) {
        viewport.scrollTop = 0;
      }
      return;
    }

    const activeRowTop = activeVisibleRowIndex * TIMELINE_LAYER_ROW_HEIGHT;
    const activeRowBottom = activeRowTop + TIMELINE_LAYER_ROW_HEIGHT;
    const currentTop = viewport.scrollTop;
    const currentBottom = currentTop + timelineRowsHeight;

    if (activeRowTop < currentTop) {
      viewport.scrollTop = activeRowTop;
    } else if (activeRowBottom > currentBottom) {
      viewport.scrollTop = activeRowBottom - timelineRowsHeight;
    }
  }, [activeVisibleRowIndex, isExpanded, timelineRowsHeight]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handlePointerDown);
    window.addEventListener("scroll", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handlePointerDown);
      window.removeEventListener("scroll", handlePointerDown, true);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    const viewport = frameLaneViewportRef.current;
    if (!viewport) return;

    const updateWidth = () => {
      setVisibleTimelineWidth(viewport.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const timelineActions = useMemo(
    () => [
      { label: "Onion", onClick: onToggleOnion, isActive: isOnionEnabled },
      { label: "Play", onClick: onPlay, isActive: isPlaying },
      { label: "Pause", onClick: onPause, isActive: !isPlaying },
    ],
    [isOnionEnabled, isPlaying, onPause, onPlay, onToggleOnion],
  );

  const commitFps = () => {
    const parsed = Number(fpsInputValue);
    const nextValue = clampFps(Number.isFinite(parsed) ? parsed : fps);
    setFpsInputValue(String(nextValue));
    if (nextValue !== fps) {
      onFpsChange(nextValue);
    }
  };

  const openContextMenu = (event: MouseEvent, targetIndex: number, targetLayerId: string) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 180;
    const targetLayerExists = layers.some((layer) => layer.id === targetLayerId);
    const menuHeight = targetLayerExists ? 292 : 262;
    const rawLeft = event.clientX + 6;
    const rawTop = event.clientY + 4;

    onActiveLayerChange(targetLayerId);
    onTimelinePositionSelect(targetIndex);

    setContextMenu({
      left: Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8)),
      top: Math.max(8, Math.min(rawTop, window.innerHeight - menuHeight - 8)),
      targetIndex,
      targetLayerId,
      menuWidth,
    });
  };

  const runMenuAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  const visibleFrameSpan = useMemo(() => Math.max(1, Math.ceil(visibleTimelineWidth / FRAME_CELL_WIDTH)), [visibleTimelineWidth]);
  const maxLayerFrameCount = useMemo(
    () => Math.max(1, ...layers.map((layer) => Math.max(1, layer.frames.length))),
    [layers],
  );
  const logicalTimelineFrameCount = useMemo(
    () => Math.max(TIMELINE_MAX_FRAME_RANGE, maxLayerFrameCount, visibleFrameSpan + 1),
    [maxLayerFrameCount, visibleFrameSpan],
  );

  const rulerLabelInterval = useMemo(() => {
    if (logicalTimelineFrameCount >= 5000) return 10;
    if (visibleFrameSpan <= 120) return TIMELINE_RULER_INTERVAL;
    if (visibleFrameSpan <= 240) return 10;
    if (visibleFrameSpan <= 480) return 25;
    if (visibleFrameSpan <= 960) return 50;
    return 100;
  }, [logicalTimelineFrameCount, visibleFrameSpan]);

  const rulerLabelCount = useMemo(
    () => Math.floor(logicalTimelineFrameCount / rulerLabelInterval),
    [logicalTimelineFrameCount, rulerLabelInterval],
  );

  const visibleTickRange = useMemo(() => {
    const firstVisibleTick = Math.max(1, Math.floor(timelineScrollLeft / FRAME_CELL_WIDTH) - 2);
    const lastVisibleTick = Math.min(
      logicalTimelineFrameCount,
      Math.ceil((timelineScrollLeft + visibleTimelineWidth) / FRAME_CELL_WIDTH) + 2,
    );

    return { firstVisibleTick, lastVisibleTick };
  }, [logicalTimelineFrameCount, timelineScrollLeft, visibleTimelineWidth]);

  const visibleMinorTickNumbers = useMemo(() => {
    const tickNumbers: number[] = [];

    for (let tickNumber = visibleTickRange.firstVisibleTick; tickNumber <= visibleTickRange.lastVisibleTick; tickNumber += 1) {
      if (tickNumber % rulerLabelInterval === 0 || tickNumber % TIMELINE_RULER_INTERVAL === 0) {
        continue;
      }
      tickNumbers.push(tickNumber);
    }

    return tickNumbers;
  }, [rulerLabelInterval, visibleTickRange]);

  const visibleMidpointTickNumbers = useMemo(() => {
    const tickNumbers: number[] = [];

    for (let tickNumber = visibleTickRange.firstVisibleTick; tickNumber <= visibleTickRange.lastVisibleTick; tickNumber += 1) {
      if (tickNumber % rulerLabelInterval === 0) {
        continue;
      }
      if (tickNumber % TIMELINE_RULER_INTERVAL === 0) {
        tickNumbers.push(tickNumber);
      }
    }

    return tickNumbers;
  }, [rulerLabelInterval, visibleTickRange]);

  const rulerWidth = useMemo(
    () => Math.max(logicalTimelineFrameCount * FRAME_CELL_WIDTH + TIMELINE_SCROLL_END_PADDING, visibleTimelineWidth),
    [logicalTimelineFrameCount, visibleTimelineWidth],
  );
  const scrollableContentWidth = rulerWidth;
  const hasHorizontalOverflow = scrollableContentWidth > visibleTimelineWidth + 1;
  const maxTimelineScrollLeft = Math.max(0, scrollableContentWidth - visibleTimelineWidth);
  const scrollbarHeight = TIMELINE_BOTTOM_SCROLLBAR_HEIGHT;
  const collapsedRowsHeight = TIMELINE_MIN_PANEL_ROWS_HEIGHT;
  const resizeEdgeHeight = layers.length > 1 ? TIMELINE_RESIZE_EDGE_HEIGHT : 0;
  const collapsedRightPanelHeight = TIMELINE_RULER_HEIGHT + collapsedRowsHeight + scrollbarHeight + resizeEdgeHeight;
  const rightPanelHeight = TIMELINE_RULER_HEIGHT + timelineRowsHeight + scrollbarHeight + resizeEdgeHeight;
  const baselinePanelHeight = Math.max(TIMELINE_LEFT_RAIL_HEIGHT, collapsedRightPanelHeight);

  useEffect(() => {
    const viewport = frameLaneViewportRef.current;
    const clampedScrollLeft = Math.min(timelineScrollLeft, maxTimelineScrollLeft);

    if (clampedScrollLeft !== timelineScrollLeft) {
      setTimelineScrollLeft(clampedScrollLeft);
      return;
    }

    if (viewport && Math.abs(viewport.scrollLeft - clampedScrollLeft) > 0.5) {
      viewport.scrollLeft = clampedScrollLeft;
    }
  }, [maxTimelineScrollLeft, timelineScrollLeft]);

  const setTimelineScrollPosition = (nextScrollLeft: number) => {
    const clampedScrollLeft = Math.max(0, Math.min(nextScrollLeft, maxTimelineScrollLeft));
    setTimelineScrollLeft(clampedScrollLeft);

    const viewport = frameLaneViewportRef.current;
    if (viewport && Math.abs(viewport.scrollLeft - clampedScrollLeft) > 0.5) {
      viewport.scrollLeft = clampedScrollLeft;
    }
  };

  const getTimelineIndexFromClientX = useCallback(
    (clientX: number) => {
      const viewport = frameLaneViewportRef.current;
      if (!viewport) return 0;

      const viewportBounds = viewport.getBoundingClientRect();
      const relativeX = clientX - viewportBounds.left + viewport.scrollLeft;
      return Math.max(0, Math.min(logicalTimelineFrameCount - 1, Math.floor(Math.max(0, relativeX) / FRAME_CELL_WIDTH)));
    },
    [logicalTimelineFrameCount],
  );

  const activateTimelineSlot = useCallback(
    (layerId: string, clientX: number, _source: TimelineActivationSource) => {
      void _source;
      const targetLayer = layers.find((layer) => layer.id === layerId) ?? null;
      const candidateIndex = getTimelineIndexFromClientX(clientX);
      const candidateFrame = targetLayer?.frames[candidateIndex];
      const tweenSpan =
        targetLayer && candidateFrame && candidateFrame.cellType !== "empty"
          ? resolveTweenActivationSpan(targetLayer.frames, candidateIndex)
          : null;
      let targetIndex = candidateIndex;
      let chosenMode: "START" | "END" | "SELECTION_ONLY" | "AUTHORED_FRAME" = candidateFrame?.cellType === "empty" ? "SELECTION_ONLY" : "AUTHORED_FRAME";

      if (tweenSpan) {
        if (candidateIndex === tweenSpan.ownerIndex) {
          targetIndex = tweenSpan.ownerIndex;
          chosenMode = "START";
        } else if (candidateFrame?.cellType === "tween") {
          targetIndex = candidateIndex;
          chosenMode = "END";
        } else if (candidateIndex > tweenSpan.ownerIndex && candidateIndex <= tweenSpan.spanEndIndex) {
          targetIndex = Math.max(candidateIndex, tweenSpan.spanStartIndex);
          chosenMode = "END";
        }
      }

      console.log("TWEEN_SWITCH_CLASSIFY", {
        clientX,
        candidateIndex,
        candidateCellType: candidateFrame?.cellType ?? null,
        ownerIndex: tweenSpan?.ownerIndex ?? null,
        spanStartIndex: tweenSpan?.spanStartIndex ?? null,
        spanEndIndex: tweenSpan?.spanEndIndex ?? null,
        chosenMode,
        chosenTargetIndex: targetIndex,
      });

      const targetFrame = targetLayer?.frames[targetIndex];
      const didSwitchCurrentFrame = Boolean(targetFrame && targetFrame.cellType !== "empty");
      const isTweenSpanActivation = Boolean(tweenSpan);

      onActiveLayerChange(layerId);
      onTimelinePositionSelect(targetIndex);

      if (isTweenSpanActivation || didSwitchCurrentFrame) {
        onCurrentFrameChange(targetIndex);
      }
    },
    [
      getTimelineIndexFromClientX,
      layers,
      onActiveLayerChange,
      onCurrentFrameChange,
      onTimelinePositionSelect,
    ],
  );

  useEffect(() => {
    if (!resizeState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== resizeState.pointerId) return;

      const nextEndIndex = Math.max(resizeState.minimumEndIndex, getTimelineIndexFromClientX(event.clientX));
      onResizeTimelineSpan(resizeState.layerId, resizeState.stateId, resizeState.spanType, nextEndIndex);
      onTimelinePositionSelect(nextEndIndex);
    };

    const clearResizeState = (event: PointerEvent) => {
      if (event.pointerId !== resizeState.pointerId) return;
      setResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", clearResizeState);
    window.addEventListener("pointercancel", clearResizeState);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", clearResizeState);
      window.removeEventListener("pointercancel", clearResizeState);
    };
  }, [getTimelineIndexFromClientX, onResizeTimelineSpan, onTimelinePositionSelect, resizeState]);

  useEffect(() => {
    if (!panelResizeState) return;

    const maxRowsHeight = Math.max(TIMELINE_MIN_PANEL_ROWS_HEIGHT, layers.length * TIMELINE_LAYER_ROW_HEIGHT);
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== panelResizeState.pointerId) return;

      const deltaY = event.clientY - panelResizeState.startY;
      const nextRowsHeight = Math.max(
        TIMELINE_MIN_PANEL_ROWS_HEIGHT,
        Math.min(maxRowsHeight, panelResizeState.startRowsHeight + deltaY),
      );
      setTimelineRowsHeight(nextRowsHeight <= TIMELINE_LAYER_ROW_HEIGHT * 1.15 ? TIMELINE_MIN_PANEL_ROWS_HEIGHT : nextRowsHeight);
    };

    const clearResizeState = (event: PointerEvent) => {
      if (event.pointerId !== panelResizeState.pointerId) return;
      setPanelResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", clearResizeState);
    window.addEventListener("pointercancel", clearResizeState);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", clearResizeState);
      window.removeEventListener("pointercancel", clearResizeState);
    };
  }, [layers.length, panelResizeState]);

  const canRemoveContextTarget = useMemo(() => {
    if (!contextMenu) return false;
    const targetLayer = layers.find((layer) => layer.id === contextMenu.targetLayerId);
    const targetFrame = targetLayer?.frames[contextMenu.targetIndex];
    return targetFrame?.cellType != null && targetFrame.cellType !== "empty";
  }, [contextMenu, layers]);
  const canCopyContextTarget = canRemoveContextTarget;
  const showsDeleteLayerAction = useMemo(() => {
    if (!contextMenu) return false;
    return layers.some((layer) => layer.id === contextMenu.targetLayerId);
  }, [contextMenu, layers]);
  const canDeleteContextLayer = useMemo(() => {
    if (!showsDeleteLayerAction || !canDeleteLayer) return false;
    return true;
  }, [canDeleteLayer, showsDeleteLayerAction]);

  const renderTimelineRightPanel = ({
    rowsHeight,
    renderedLayers,
    panelHeight,
    attachInteractionRefs,
    isOverlay,
  }: {
    rowsHeight: number;
    renderedLayers: TimelineLayer[];
    panelHeight: number;
    attachInteractionRefs: boolean;
    isOverlay: boolean;
  }) => {
    const rowLanesHeight = renderedLayers.length * TIMELINE_LAYER_ROW_HEIGHT;
    const showVerticalOverflow = rowsHeight > TIMELINE_MIN_PANEL_ROWS_HEIGHT && rowLanesHeight > rowsHeight + 1;

    return (
      <div
        style={{
          position: isOverlay ? "absolute" : "relative",
          left: 0,
          top: 0,
          width: "100%",
          height: panelHeight,
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: `${TIMELINE_RULER_HEIGHT}px ${rowsHeight}px ${TIMELINE_BOTTOM_SCROLLBAR_HEIGHT}px ${resizeEdgeHeight}px`,
          background: "rgb(26, 27, 36)",
          zIndex: isOverlay ? 20 : 1,
          border: isOverlay ? "1px solid rgba(255,255,255,0.1)" : "none",
          boxShadow: isOverlay ? "0 14px 28px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.03)" : "none",
          boxSizing: "border-box",
          pointerEvents: "auto",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1,
            height: TIMELINE_LEFT_RAIL_HEIGHT,
            background: "rgba(255,255,255,0.12)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />

        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background: "rgb(26, 27, 36)",
            borderBottom: "1px solid rgba(30,32,38,0.96)",
            borderTop: "1px solid rgba(255,255,255,0.16)",
          }}
        >
          <div
            style={{
              width: scrollableContentWidth,
              minWidth: scrollableContentWidth,
              position: "relative",
              height: "100%",
              transform: `translateX(${-timelineScrollLeft}px)`,
            }}
          >
            <div
              style={{
                position: "relative",
                width: rulerWidth,
                minWidth: rulerWidth,
                height: TIMELINE_RULER_HEIGHT,
              }}
            >
              {visibleMinorTickNumbers.map((tickNumber) => (
                <div
                  key={`${isOverlay ? "overlay" : "baseline"}-minor-${tickNumber}`}
                  style={{
                    position: "absolute",
                    left: tickNumber * FRAME_CELL_WIDTH - FRAME_CELL_WIDTH / 2,
                    top: 0,
                    width: 1,
                    height: 2,
                    background: "rgba(255,255,255,0.5)",
                    pointerEvents: "none",
                  }}
                />
              ))}

              {visibleMidpointTickNumbers.map((tickNumber) => (
                <div
                  key={`${isOverlay ? "overlay" : "baseline"}-midpoint-${tickNumber}`}
                  style={{
                    position: "absolute",
                    left: tickNumber * FRAME_CELL_WIDTH - FRAME_CELL_WIDTH / 2,
                    top: 0,
                    width: 1,
                    height: 5,
                    background: "rgba(255,255,255,0.54)",
                    pointerEvents: "none",
                  }}
                />
              ))}

              {Array.from({ length: rulerLabelCount }, (_, index) => {
                const tickNumber = (index + 1) * rulerLabelInterval;
                const tickPosition = tickNumber * FRAME_CELL_WIDTH - FRAME_CELL_WIDTH / 2;
                const labelWidthEstimate = String(tickNumber).length * 5 + 2;
                const labelLeft = Math.min(3, rulerWidth - tickPosition - labelWidthEstimate - 1);

                return (
                  <div
                    key={`${isOverlay ? "overlay" : "baseline"}-ruler-${tickNumber}`}
                    style={{
                      position: "absolute",
                      left: tickPosition,
                      top: 0,
                      width: 1,
                      height: TIMELINE_RULER_HEIGHT,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 1,
                        height: 6,
                        background: "rgba(255,255,255,0.34)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: labelLeft,
                        top: 1,
                        color: "rgba(255,255,255,0.56)",
                        fontSize: 8,
                        fontWeight: 700,
                        lineHeight: "8px",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tickNumber}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div
          ref={attachInteractionRefs ? rowsViewportRef : null}
          style={{
            position: "relative",
            height: rowsHeight,
            overflowY: showVerticalOverflow ? "auto" : "hidden",
            overflowX: "hidden",
            background: "rgb(26, 27, 36)",
          }}
        >
          <div
            ref={attachInteractionRefs ? frameLaneViewportRef : null}
            className="timeline-frame-main-scroll"
            onScroll={attachInteractionRefs ? (event) => setTimelineScrollLeft(event.currentTarget.scrollLeft) : undefined}
            style={{
              width: "100%",
              height: rowLanesHeight,
              overflowX: "auto",
              overflowY: "hidden",
              position: "relative",
            }}
          >
            <div style={{ width: rulerWidth, minWidth: rulerWidth, height: rowLanesHeight, position: "relative" }}>
              {renderedLayers.map((layer) => {
                const layerFrames = layer.frames;
                const realFrameRowWidth = layerFrames.length * FRAME_CELL_WIDTH;
                const isActiveLayer = layer.id === activeLayerId;
                const highlightedSpanBounds = isActiveLayer
                  ? getHighlightedSpanBounds(layerFrames, currentFrameIndex, selectedTimelineIndex)
                  : null;
                const tweenLineSegments = getTweenLineSegments(layerFrames);

                return (
                  <div
                    key={`${isOverlay ? "overlay" : "baseline"}-${layer.id}`}
                    style={{
                      width: rulerWidth,
                      minWidth: rulerWidth,
                      height: TIMELINE_LAYER_ROW_HEIGHT,
                      position: "relative",
                      background: "transparent",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: rulerWidth,
                        minWidth: rulerWidth,
                        height: "100%",
                      }}
                      onClick={(event) => {
                        activateTimelineSlot(layer.id, event.clientX, "row-background");
                      }}
                      onContextMenu={(event) => {
                        if (event.target !== event.currentTarget) return;
                        const targetIndex = getTimelineIndexFromClientX(event.clientX);
                        openContextMenu(event, targetIndex, layer.id);
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "stretch",
                          width: realFrameRowWidth,
                          minWidth: realFrameRowWidth,
                          height: "100%",
                          position: "relative",
                        }}
                      >
                        {layerFrames.map((frame, index) => {
                          const isSelectedTimelineSlot = isActiveLayer && index === selectedTimelineIndex;
                          const previousFrame = layerFrames[index - 1];
                          const nextFrame = layerFrames[index + 1];
                          const isEmpty = frame.cellType === "empty";
                          const isHold = frame.cellType === "hold";
                          const isTween = frame.cellType === "tween";
                          const previousVisualType = !previousFrame
                            ? null
                            : previousFrame.cellType === "empty"
                              ? null
                              : previousFrame.cellType === "tween"
                                ? "tween"
                                : "frame";
                          const nextVisualType = !nextFrame
                            ? null
                            : nextFrame.cellType === "empty"
                              ? null
                              : nextFrame.cellType === "tween"
                                ? "tween"
                                : "frame";
                          const visualType = isEmpty ? null : isTween ? "tween" : "frame";
                          const isTweenStart =
                            isTween && (!previousFrame || previousFrame.stateId !== frame.stateId || previousFrame.cellType !== "tween");
                          const isFrameStart =
                            !isEmpty &&
                            !isTween &&
                            (!previousFrame || previousFrame.stateId !== frame.stateId || previousFrame.cellType === "empty");

                          let stateStartIndex = index;
                          while (
                            stateStartIndex > 0 &&
                            layerFrames[stateStartIndex].cellType !== "keyframe" &&
                            layerFrames[stateStartIndex].cellType !== "blank-keyframe"
                          ) {
                            stateStartIndex -= 1;
                          }

                          let tweenSpanStartIndex = index;
                          while (
                            tweenSpanStartIndex > 0 &&
                            layerFrames[tweenSpanStartIndex - 1].cellType === "tween" &&
                            layerFrames[tweenSpanStartIndex - 1].stateId === frame.stateId
                          ) {
                            tweenSpanStartIndex -= 1;
                          }

                          const continuesFromLeft =
                            isTween
                              ? Boolean(previousFrame) && previousFrame.cellType === "tween"
                              : Boolean(previousFrame) &&
                                previousFrame.stateId === frame.stateId &&
                                previousVisualType === visualType &&
                                !isFrameStart &&
                                !isTweenStart;
                          const continuesRight =
                            isTween
                              ? Boolean(nextFrame) && nextFrame.cellType === "tween"
                              : Boolean(nextFrame) && nextFrame.stateId === frame.stateId && nextVisualType === visualType;
                          const isFrameSpanEnd =
                            !isEmpty && !isTween && (!nextFrame || nextFrame.stateId !== frame.stateId || nextVisualType !== "frame");
                          const isTweenSpanEnd =
                            isTween && (!nextFrame || nextFrame.stateId !== frame.stateId || nextFrame.cellType !== "tween");
                          const isTweenVisualEnd = isTween && (!nextFrame || nextFrame.cellType !== "tween");
                          const hasFrameDuration = isHold || continuesFromLeft || continuesRight;
                          const hasTweenDuration = isTween;
                          const showResizeEdge = (isFrameSpanEnd && hasFrameDuration) || (isTweenVisualEnd && hasTweenDuration);
                          const usesTweenSpanColors = isTween;
                          const spanFill = usesTweenSpanColors ? TIMELINE_TWEEN_SPAN_FILL : TIMELINE_FRAME_SPAN_FILL;
                          const spanBorder = usesTweenSpanColors ? TIMELINE_TWEEN_SPAN_BORDER : TIMELINE_FRAME_SPAN_BORDER;
                          const spanLineColor = usesTweenSpanColors ? TIMELINE_TWEEN_SPAN_LINE : TIMELINE_FRAME_SPAN_LINE;
                          const showsSpanLine = !isEmpty && !isTween && (isHold || continuesFromLeft || continuesRight);
                          const frameBackground = isEmpty ? TIMELINE_EMPTY_SLOT_FILL : spanFill;
                          const borderTopColor = isEmpty ? TIMELINE_EMPTY_SLOT_BORDER : spanBorder;
                          const borderBottomColor = isEmpty ? TIMELINE_EMPTY_SLOT_BORDER : spanBorder;
                          const borderLeftColor = isEmpty ? TIMELINE_EMPTY_SLOT_BORDER : continuesFromLeft ? spanFill : spanBorder;
                          const borderRightColor = !isEmpty
                            ? continuesRight && !showResizeEdge
                              ? spanFill
                              : spanBorder
                            : TIMELINE_EMPTY_SLOT_BORDER;
                          const tweenSpanHasVisibleDuration = isTween && (continuesFromLeft || continuesRight);
                          const showsTweenStartDot = isTween && (!previousFrame || previousFrame.cellType !== "tween");
                          const showsTweenEndDot = isTween && isTweenVisualEnd && tweenSpanHasVisibleDuration;
                          const showsDot = isTween ? showsTweenStartDot || showsTweenEndDot : !isEmpty && isFrameStart;
                          const spanLineLeft = continuesFromLeft ? -2 : showsTweenStartDot ? 16 : showsDot ? 16 : 2;
                          const spanLineRight = continuesRight ? -2 : showsTweenEndDot ? TIMELINE_SPAN_DOT_LINE_GAP : 4;

                          return (
                            <button
                              key={frame.id}
                              type="button"
                              data-timeline-cell="true"
                              data-layer-id={layer.id}
                              data-frame-index={index}
                              data-testid={`stick-frame-${index + 1}`}
                              aria-label={`Frame ${index + 1}, ${frame.cellType === "blank-keyframe" ? "blank keyframe" : frame.cellType}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                activateTimelineSlot(layer.id, event.clientX, "frame-button");
                              }}
                              onContextMenu={(event) => openContextMenu(event, index, layer.id)}
                              style={{
                                all: "unset",
                                width: FRAME_CELL_WIDTH,
                                flex: `0 0 ${FRAME_CELL_WIDTH}px`,
                                height: "100%",
                                position: "relative",
                                overflow: "hidden",
                                cursor: "pointer",
                                boxSizing: "border-box",
                                userSelect: "none",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  background: frameBackground,
                                  boxSizing: "border-box",
                                  borderTop: `1px solid ${borderTopColor}`,
                                  borderBottom: `1px solid ${borderBottomColor}`,
                                  borderLeft: `1px solid ${borderLeftColor}`,
                                  borderRight: `${showResizeEdge ? 2 : 1}px solid ${borderRightColor}`,
                                  borderRadius: 0,
                                }}
                              >
                                {showsSpanLine && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      left: spanLineLeft,
                                      right: spanLineRight,
                                      top: 22,
                                      height: 2,
                                      background: spanLineColor,
                                      borderRadius: 999,
                                      pointerEvents: "none",
                                    }}
                                  />
                                )}
                                {showsDot && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      left: "50%",
                                      top: 20,
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      transform: "translateX(-50%)",
                                      background: "rgba(10,10,12,0.95)",
                                      pointerEvents: "none",
                                    }}
                                  />
                                )}
                                {isEmpty && isSelectedTimelineSlot && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      border: `1px solid ${TIMELINE_SELECTED_SLOT_BORDER}`,
                                      pointerEvents: "none",
                                    }}
                                  />
                                )}
                                {showResizeEdge && (
                                  <div
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      activateTimelineSlot(layer.id, event.clientX, "resize-edge");
                                      setResizeState({
                                        pointerId: event.pointerId,
                                        layerId: layer.id,
                                        stateId: frame.stateId,
                                        spanType: isTweenSpanEnd ? "tween" : "frame",
                                        minimumEndIndex: isTweenSpanEnd ? tweenSpanStartIndex : stateStartIndex,
                                      });
                                    }}
                                    style={{
                                      position: "absolute",
                                      top: 0,
                                      right: 0,
                                      width: 6,
                                      bottom: 0,
                                      cursor: "ew-resize",
                                      background: "transparent",
                                    }}
                                  />
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {tweenLineSegments.map((segment) => (
                          <div
                            key={`${isOverlay ? "overlay" : "baseline"}-tween-line-${layer.id}-${segment.startIndex}`}
                            style={{
                              position: "absolute",
                              left: segment.startIndex * FRAME_CELL_WIDTH + 16,
                              top: 22,
                              width: segment.width,
                              height: 2,
                              background: TIMELINE_TWEEN_SPAN_LINE,
                              borderRadius: 999,
                              pointerEvents: "none",
                            }}
                          />
                        ))}

                        {highlightedSpanBounds && (
                          <div
                            style={{
                              position: "absolute",
                              left: highlightedSpanBounds.startIndex * FRAME_CELL_WIDTH,
                              top: 0,
                              width: (highlightedSpanBounds.endIndex - highlightedSpanBounds.startIndex + 1) * FRAME_CELL_WIDTH,
                              height: "100%",
                              boxSizing: "border-box",
                              border: `1px solid ${TIMELINE_SELECTED_SLOT_BORDER}`,
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </div>

                      {isActiveLayer && selectedTimelineIndex >= layerFrames.length && (
                        <div
                          style={{
                            position: "absolute",
                            left: selectedTimelineIndex * FRAME_CELL_WIDTH,
                            top: 0,
                            width: FRAME_CELL_WIDTH,
                            height: "100%",
                            boxSizing: "border-box",
                            border: `1px solid ${TIMELINE_SELECTED_SLOT_BORDER}`,
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            height: TIMELINE_BOTTOM_SCROLLBAR_HEIGHT,
            display: "flex",
            alignItems: "center",
            background: hasHorizontalOverflow ? "rgba(255,255,255,0.02)" : "transparent",
          }}
        >
          {hasHorizontalOverflow && (
            <input
              className="timeline-bottom-scrollbar-slider"
              type="range"
              min={0}
              max={Math.max(1, maxTimelineScrollLeft)}
              step={1}
              value={Math.min(timelineScrollLeft, maxTimelineScrollLeft)}
              onChange={(event) => setTimelineScrollPosition(Number(event.currentTarget.value))}
              onInput={(event) => setTimelineScrollPosition(Number(event.currentTarget.value))}
              style={{ pointerEvents: "auto" }}
            />
          )}
        </div>

        {resizeEdgeHeight > 0 && (
          <div
            style={{
              width: "100%",
              height: resizeEdgeHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "ns-resize",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
              zIndex: 7,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPanelResizeState({
                pointerId: event.pointerId,
                startY: event.clientY,
                startRowsHeight: rowsHeight,
              });
            }}
          >
            <div
              style={{
                width: 36,
                height: 3,
                borderRadius: 999,
                background: "rgba(255,255,255,0.22)",
                boxShadow: "0 5px 0 rgba(255,255,255,0.08)",
                pointerEvents: "none",
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        position: "relative",
        zIndex: 12,
        overflow: "visible",
        minHeight: baselinePanelHeight,
        height: baselinePanelHeight,
        display: "grid",
        gridTemplateColumns: "max-content minmax(0, 1fr)",
        columnGap: 10,
        padding: "0 0 0 14px",
        background: "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}
    >
      <style>{`
        .timeline-frame-main-scroll {
          scrollbar-width: none;
        }

        .timeline-frame-main-scroll::-webkit-scrollbar {
          display: none;
        }

        .timeline-bottom-scrollbar-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          margin: 0;
          padding: 0;
          background: transparent;
          cursor: pointer;
        }

        .timeline-bottom-scrollbar-slider:focus {
          outline: none;
        }

        .timeline-bottom-scrollbar-slider::-webkit-slider-runnable-track {
          height: 3px;
          background: rgba(255,255,255,0.02);
          border-radius: 999px;
        }

        .timeline-bottom-scrollbar-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 6px;
          margin-top: -1.5px;
          border: none;
          border-radius: 999px;
          background: rgba(255,255,255,0.34);
        }

        .timeline-bottom-scrollbar-slider::-moz-range-track {
          height: 3px;
          background: rgba(255,255,255,0.02);
          border-radius: 999px;
        }

        .timeline-bottom-scrollbar-slider::-moz-range-thumb {
          width: 28px;
          height: 6px;
          border: none;
          border-radius: 999px;
          background: rgba(255,255,255,0.34);
        }
      `}</style>

      <div
        style={{
          gridColumn: 1,
          height: TIMELINE_LEFT_RAIL_HEIGHT,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(180,220,255,0.72)",
            fontWeight: 800,
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          Timeline
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "6px 0",
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.74)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(180,220,255,0.66)",
              fontWeight: 700,
              userSelect: "none",
            }}
          >
            FPS
          </span>
          <input
            type="number"
            min={1}
            max={55}
            step={1}
            value={fpsInputValue}
            aria-label="Timeline FPS"
            disabled={isPlaying}
            onChange={(event) => setFpsInputValue(event.target.value)}
            onBlur={commitFps}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitFps();
              }
            }}
            style={{
              width: 48,
              height: 24,
              padding: "0 6px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(11,14,20,0.46)",
              color: "rgba(255,255,255,0.88)",
              fontSize: 12,
              fontWeight: 700,
              textAlign: "center",
              outline: "none",
            }}
          />
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 0 2px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={onAddLayer}
            disabled={isPlaying}
            style={{...timelineButtonStyle, cursor: isPlaying ? "not-allowed" : "pointer", opacity: isPlaying ? 0.55 : 1}}
          >
            + Layer
          </button>
          {timelineActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              style={{
                ...timelineButtonStyle,
                border: action.isActive ? "1px solid rgba(110,170,255,0.26)" : timelineButtonStyle.border,
                background: action.isActive ? "rgba(110,170,255,0.10)" : timelineButtonStyle.background,
                color: action.isActive ? "rgba(225,238,255,0.92)" : timelineButtonStyle.color,
                cursor: "pointer",
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          gridColumn: 2,
          flex: 1,
          minWidth: 0,
          height: collapsedRightPanelHeight,
          marginLeft: 12,
          position: "relative",
          overflow: "visible",
          alignSelf: "flex-start",
        }}
      >
        {renderTimelineRightPanel({
          rowsHeight: collapsedRowsHeight,
          renderedLayers: activeLayer ? [activeLayer] : layers.slice(0, 1),
          panelHeight: collapsedRightPanelHeight,
          attachInteractionRefs: !isExpanded,
          isOverlay: false,
        })}
        {isExpanded &&
          renderTimelineRightPanel({
            rowsHeight: timelineRowsHeight,
            renderedLayers: layers,
            panelHeight: rightPanelHeight,
            attachInteractionRefs: true,
            isOverlay: true,
          })}

        {contextMenu && (
          <div
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: contextMenu.left,
              top: contextMenu.top,
              width: contextMenu.menuWidth,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: 6,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(18,22,28,0.98)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.32)",
              zIndex: 9999,
            }}
          >
            {([
              { label: "Insert Frame", kind: "frame", blank: false },
              { label: "Insert Keyframe", kind: "keyframe", blank: false },
              { label: "Insert Blank Keyframe", kind: "keyframe", blank: true },
            ] as const).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() =>
                  runMenuAction(() => onAddFrame(contextMenu.targetLayerId, item.kind, contextMenu.targetIndex, { blank: item.blank }))
                }
                disabled={isPlaying}
                style={{
                  width: "100%",
                  minHeight: 30,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: isPlaying ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.84)",
                  fontSize: 12,
                  textAlign: "left",
                  cursor: isPlaying ? "not-allowed" : "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => runMenuAction(() => onCopyFrame(contextMenu.targetLayerId, contextMenu.targetIndex))}
              disabled={!canCopyContextTarget || isPlaying}
              style={{
                width: "100%",
                minHeight: 30,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: canCopyContextTarget && !isPlaying ? "rgba(255,255,255,0.84)" : "rgba(255,255,255,0.42)",
                fontSize: 12,
                textAlign: "left",
                cursor: canCopyContextTarget && !isPlaying ? "pointer" : "not-allowed",
              }}
            >
              Copy Frame
            </button>
            <button
              type="button"
              onClick={() => runMenuAction(() => onPasteFrame(contextMenu.targetLayerId, contextMenu.targetIndex))}
              disabled={!canPasteFrame || isPlaying}
              style={{
                width: "100%",
                minHeight: 30,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(110,170,255,0.22)",
                background: "rgba(255,255,255,0.04)",
                color: canPasteFrame && !isPlaying ? "rgba(194,225,255,0.96)" : "rgba(194,225,255,0.4)",
                fontSize: 12,
                textAlign: "left",
                cursor: canPasteFrame && !isPlaying ? "pointer" : "not-allowed",
              }}
            >
              Paste Frame
            </button>
            <button
              type="button"
              onClick={() => runMenuAction(() => onRemoveFrame(contextMenu.targetLayerId, contextMenu.targetIndex))}
              disabled={!canRemoveContextTarget || isPlaying}
              style={{
                width: "100%",
                minHeight: 30,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,120,120,0.18)",
                background: "rgba(255,255,255,0.04)",
                color: !canRemoveContextTarget || isPlaying ? "rgba(255,120,120,0.4)" : "rgba(255,120,120,0.96)",
                fontSize: 12,
                textAlign: "left",
                cursor: !canRemoveContextTarget || isPlaying ? "not-allowed" : "pointer",
              }}
            >
              Remove Frame
            </button>
            {showsDeleteLayerAction && (
              <button
                type="button"
                onClick={() => {
                  if (!canDeleteContextLayer) return;
                  runMenuAction(onDeleteLayer);
                }}
                disabled={!canDeleteContextLayer || isPlaying}
                style={{
                  width: "100%",
                  minHeight: 30,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,120,120,0.18)",
                  background: "rgba(255,255,255,0.04)",
                  color: canDeleteContextLayer && !isPlaying ? "rgba(255,120,120,0.96)" : "rgba(255,120,120,0.4)",
                  fontSize: 12,
                  textAlign: "left",
                  cursor: canDeleteContextLayer && !isPlaying ? "pointer" : "not-allowed",
                }}
              >
                Delete Layer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
