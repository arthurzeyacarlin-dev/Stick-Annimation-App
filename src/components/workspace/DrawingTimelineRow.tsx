import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import {
  DRAWING_AI_SOUND_OPTION_DRAG_TYPE,
  isDrawingAiSoundOption,
  type DrawingAiSoundOption,
} from "@/src/lib/ai/drawingAiContract";
import { workspaceColors } from "./workspaceTheme";

export type TimelineFrameKind = "frame" | "keyframe" | "tween";

export type TimelineFrameCellType = "empty" | "keyframe" | "blank-keyframe" | "hold" | "tween";

export type TimelineFrame = {
  id: number;
  kind: TimelineFrameKind;
  cellType: TimelineFrameCellType;
  stateId: number;
  isBlank?: boolean;
  hasTweenEndpoint?: boolean;
  soundAttachment?: {
    id: string;
  } | null;
};

export type TimelineLayer = {
  id: string;
  name: string;
  frames: TimelineFrame[];
};

type DrawingTimelineRowProps = {
  responsiveLayout?: boolean;
  fps: number;
  isPlaying: boolean;
  isOnionEnabled: boolean;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  activeLayerId: string;
  layers: TimelineLayer[];
  canPasteFrame?: boolean;
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
  onCopyFrame?: (layerId: string, targetIndex: number) => void;
  onPasteFrame?: (layerId: string, targetIndex: number) => void;
  onRemoveSoundAttachment?: (layerId: string, targetIndex: number) => void;
  onResizeTimelineSpan: (layerId: string, stateId: number, spanType: "frame" | "tween", nextEndIndex: number) => void;
  onSoundOptionDrop?: (layerId: string, frameIndex: number, option: DrawingAiSoundOption) => void;
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

// Compact pill controls. Rest/selected only: pointer hover comes from workspaceTheme.module.css.
const timelineButtonStyle: CSSProperties = {
  height: 30,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  boxSizing: "border-box",
  borderRadius: 9,
  border: `1px solid ${workspaceColors.border}`,
  background: workspaceColors.panel,
  color: workspaceColors.textSecondary,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const timelineSelectedButtonStyle: CSSProperties = {
  ...timelineButtonStyle,
  border: `1px solid ${workspaceColors.selectedBorder}`,
  background: workspaceColors.selectedFill,
  color: "#eaf3ff",
};

const contextMenuItemStyle = (enabled: boolean, tone: "default" | "danger" = "default"): CSSProperties => ({
  width: "100%",
  minHeight: 30,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid transparent",
  background: "transparent",
  color:
    tone === "danger"
      ? enabled
        ? workspaceColors.danger
        : "rgba(255,138,149,0.38)"
      : enabled
        ? workspaceColors.textSecondary
        : "rgba(201,214,234,0.36)",
  fontSize: 12,
  fontWeight: 500,
  textAlign: "left",
  cursor: enabled ? "pointer" : "not-allowed",
});

const FRAME_CELL_WIDTH = 17;
const TIMELINE_RULER_HEIGHT = 10;
const TIMELINE_RULER_INTERVAL = 5;
const TIMELINE_MAX_FRAME_RANGE = 10000;
const TIMELINE_SCROLL_END_PADDING = FRAME_CELL_WIDTH * 2;
// Frames are gray with black keyframe dots (classic animation-app look) on a navy lane.
// Current frame: dull blue outline. Hover: bright #0066FF outline via data-hover="outline".
const TIMELINE_LANE_BACKGROUND = workspaceColors.chrome;
const TIMELINE_EMPTY_SLOT_FILL = "#071120";
const TIMELINE_EMPTY_SLOT_BORDER = workspaceColors.divider;
const TIMELINE_SELECTED_SLOT_OUTLINE = `2px solid ${workspaceColors.selectedBorder}`;
const TIMELINE_SELECTED_SLOT_BORDER = workspaceColors.selectedBorder;
const TIMELINE_FRAME_SPAN_FILL = "rgb(124,128,136)";
const TIMELINE_FRAME_SPAN_BORDER = "rgba(20,22,28,0.88)";
const TIMELINE_FRAME_SPAN_LINE = "rgb(158,164,172)";
const TIMELINE_TWEEN_SPAN_FILL = "rgb(83,97,129)";
const TIMELINE_TWEEN_SPAN_BORDER = "rgba(39,55,82,0.9)";
const TIMELINE_TWEEN_SPAN_LINE = "rgb(116,172,246)";
const TIMELINE_SOUND_SLOT_FILL = "rgba(88, 44, 168, 0.92)";
const TIMELINE_SOUND_SLOT_BORDER = "rgba(58, 26, 116, 1)";
const TIMELINE_KEYFRAME_DOT = "#111111";
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

const readDroppedSoundOption = (event: DragEvent<HTMLElement>): DrawingAiSoundOption | null => {
  const serializedSoundOption = event.dataTransfer.getData(DRAWING_AI_SOUND_OPTION_DRAG_TYPE);
  if (!serializedSoundOption) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(serializedSoundOption);
    return isDrawingAiSoundOption(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
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

type TimelineLaneHandlers = {
  activateTimelineSlot: (layerId: string, clientX: number, source: TimelineActivationSource) => void;
  getTimelineIndexFromClientX: (clientX: number) => number;
  openContextMenu: (event: MouseEvent, targetIndex: number, targetLayerId: string) => void;
  dropSoundOption: (layerId: string, frameIndex: number, option: DrawingAiSoundOption) => void;
  startResize: (state: TimelineResizeState) => void;
};

type TimelineLayerLaneProps = {
  layer: TimelineLayer;
  isOverlay: boolean;
  isActiveLayer: boolean;
  showActiveBackground: boolean;
  // Only meaningful on the current layer (-1 elsewhere), so other layers' rows don't redraw on every click.
  selectedTimelineIndex: number;
  highlightedStartIndex: number;
  highlightedEndIndex: number;
  rulerWidth: number;
  canDropSound: boolean;
  handlers: TimelineLaneHandlers;
};

// One layer's row of frame cells. Memoized (SPEED, Arthur): clicking a frame or switching layers only
// redraws the rows that actually look different (the old and the new current layer), instead of
// rebuilding every cell of every layer on every click. What the row looks like is unchanged.
const TimelineLayerLane = memo(function TimelineLayerLane({
  layer,
  isOverlay,
  isActiveLayer,
  showActiveBackground,
  selectedTimelineIndex,
  highlightedStartIndex,
  highlightedEndIndex,
  rulerWidth,
  canDropSound,
  handlers,
}: TimelineLayerLaneProps) {
  const layerFrames = layer.frames;
  const realFrameRowWidth = layerFrames.length * FRAME_CELL_WIDTH;
  const highlightedSpanBounds: TimelineSpanBounds | null =
    highlightedStartIndex >= 0 ? { startIndex: highlightedStartIndex, endIndex: highlightedEndIndex } : null;
  const tweenLineSegments = useMemo(() => getTweenLineSegments(layerFrames), [layerFrames]);

  return (
    <div
      data-timeline-layer-active={isActiveLayer ? "true" : "false"}
      style={{
        width: rulerWidth,
        minWidth: rulerWidth,
        height: TIMELINE_LAYER_ROW_HEIGHT,
        position: "relative",
        background: showActiveBackground ? "rgba(15,42,82,0.55)" : "transparent",
        borderBottom: `1px solid ${workspaceColors.divider}`,
      }}
    >
      <div
        data-timeline-layer-row={layer.id}
        style={{
          position: "relative",
          width: rulerWidth,
          minWidth: rulerWidth,
          height: "100%",
        }}
        onClick={(event) => {
          handlers.activateTimelineSlot(layer.id, event.clientX, "row-background");
        }}
        onContextMenu={(event) => {
          if (event.target !== event.currentTarget) return;
          const targetIndex = handlers.getTimelineIndexFromClientX(event.clientX);
          handlers.openContextMenu(event, targetIndex, layer.id);
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

            const spanSourceFrame =
              !isEmpty && !isTween ? layerFrames[stateStartIndex] ?? frame : isTween ? layerFrames[tweenSpanStartIndex] ?? frame : frame;
            const hasSoundAttachment = Boolean(frame.soundAttachment ?? spanSourceFrame.soundAttachment);

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
            const showsSpanLine = !hasSoundAttachment && !isEmpty && !isTween && (isHold || continuesFromLeft || continuesRight);
            const resolvedFill = hasSoundAttachment ? TIMELINE_SOUND_SLOT_FILL : spanFill;
            const resolvedBorder = hasSoundAttachment ? TIMELINE_SOUND_SLOT_BORDER : spanBorder;
            const isCurrentSlot = isSelectedTimelineSlot;
            const isInHighlightedSpan =
              highlightedSpanBounds !== null &&
              index >= highlightedSpanBounds.startIndex &&
              index <= highlightedSpanBounds.endIndex;
            const restFill = isEmpty && !hasSoundAttachment ? TIMELINE_EMPTY_SLOT_FILL : resolvedFill;
            // The current slot keeps its white/empty fill and gets a dull blue outline.
            const frameBackground = restFill;
            const interiorSeam = frameBackground;
            const borderTopColor = isCurrentSlot || isInHighlightedSpan
              ? TIMELINE_SELECTED_SLOT_BORDER
              : isEmpty && !hasSoundAttachment
                ? TIMELINE_EMPTY_SLOT_BORDER
                : resolvedBorder;
            const borderBottomColor = borderTopColor;
            const borderLeftColor =
              isCurrentSlot || (isInHighlightedSpan && index === highlightedSpanBounds?.startIndex)
                ? TIMELINE_SELECTED_SLOT_BORDER
                : hasSoundAttachment
                  ? continuesFromLeft
                    ? "transparent"
                    : resolvedBorder
                  : isEmpty
                    ? previousFrame?.cellType === "empty"
                      ? interiorSeam
                      : TIMELINE_EMPTY_SLOT_BORDER
                    : continuesFromLeft
                      ? interiorSeam
                      : resolvedBorder;
            const borderRightColor =
              isCurrentSlot || (isInHighlightedSpan && index === highlightedSpanBounds?.endIndex)
                ? TIMELINE_SELECTED_SLOT_BORDER
                : hasSoundAttachment
                  ? continuesRight && !showResizeEdge
                    ? "transparent"
                    : resolvedBorder
                  : !isEmpty
                    ? continuesRight && !showResizeEdge
                      ? interiorSeam
                      : resolvedBorder
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
                onDragOver={(event) => {
                  if (!canDropSound) {
                    return;
                  }

                  if (!Array.from(event.dataTransfer.types).includes(DRAWING_AI_SOUND_OPTION_DRAG_TYPE)) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(event) => {
                  if (!canDropSound) {
                    return;
                  }

                  const droppedSoundOption = readDroppedSoundOption(event);
                  if (!droppedSoundOption) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  handlers.dropSoundOption(layer.id, index, droppedSoundOption);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  handlers.activateTimelineSlot(layer.id, event.clientX, "frame-button");
                }}
                onContextMenu={(event) => handlers.openContextMenu(event, index, layer.id)}
                data-hover="outline"
                data-timeline-current={isCurrentSlot ? "true" : undefined}
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
                  // Fill and borders live on the button itself so the theme's
                  // hover outline (data-hover="outline") paints above them.
                  background: frameBackground,
                  borderTop: `1px solid ${borderTopColor}`,
                  borderBottom: `1px solid ${borderBottomColor}`,
                  borderLeft: `1px solid ${borderLeftColor}`,
                  borderRight: `${showResizeEdge ? 2 : 1}px solid ${borderRightColor}`,
                  borderRadius: 0,
                  outline: isCurrentSlot ? TIMELINE_SELECTED_SLOT_OUTLINE : undefined,
                  outlineOffset: isCurrentSlot ? -2 : undefined,
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
                        background: TIMELINE_KEYFRAME_DOT,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {showResizeEdge && (
                    <div
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handlers.activateTimelineSlot(layer.id, event.clientX, "resize-edge");
                        handlers.startResize({
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
              background: "transparent",
              border: TIMELINE_SELECTED_SLOT_OUTLINE,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
});

export function DrawingTimelineRow({
  responsiveLayout = false,
  fps,
  isPlaying,
  isOnionEnabled,
  currentFrameIndex,
  selectedTimelineIndex,
  activeLayerId,
  layers,
  canPasteFrame = false,
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
  onRemoveSoundAttachment,
  onResizeTimelineSpan,
  onSoundOptionDrop,
}: DrawingTimelineRowProps) {
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
  }, [isExpanded]);

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
    const menuHeight = targetLayerExists ? 304 : 274;
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
  // The ruler's frame numbers (about 1000 of them) only change when the ruler's length or spacing
  // changes, so they are built once here instead of on every frame click (SPEED, Arthur).
  const rulerLabelElements = useMemo(() => {
    const build = (panel: "overlay" | "baseline") =>
      Array.from({ length: rulerLabelCount }, (_, index) => {
        const tickNumber = (index + 1) * rulerLabelInterval;
        const tickPosition = tickNumber * FRAME_CELL_WIDTH - FRAME_CELL_WIDTH / 2;
        const labelWidthEstimate = String(tickNumber).length * 5 + 2;
        const labelLeft = Math.min(3, rulerWidth - tickPosition - labelWidthEstimate - 1);

        return (
          <div
            key={`${panel}-ruler-${tickNumber}`}
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
                background: workspaceColors.label,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: labelLeft,
                top: 1,
                color: workspaceColors.label,
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
      });
    return { overlay: build("overlay"), baseline: build("baseline") };
  }, [rulerLabelCount, rulerLabelInterval, rulerWidth]);
  const hasHorizontalOverflow = scrollableContentWidth > visibleTimelineWidth + 1;
  const maxTimelineScrollLeft = Math.max(0, scrollableContentWidth - visibleTimelineWidth);
  const scrollbarHeight = TIMELINE_BOTTOM_SCROLLBAR_HEIGHT;
  const collapsedRowsHeight = TIMELINE_MIN_PANEL_ROWS_HEIGHT;
  const resizeEdgeHeight = layers.length > 1 ? TIMELINE_RESIZE_EDGE_HEIGHT : 0;
  const collapsedRightPanelHeight = TIMELINE_RULER_HEIGHT + collapsedRowsHeight + scrollbarHeight;
  const rightPanelHeight = TIMELINE_RULER_HEIGHT + timelineRowsHeight + scrollbarHeight + resizeEdgeHeight;
  // Desktop reserves only the collapsed strip. Expanded lanes remain an
  // interactive overlay over the unchanged workspace below. Compact layout
  // still reserves the full panel height through its media-query grid row.
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

  // The layer rows are memoized, so they get one stable set of handlers that always calls the
  // latest versions (updated right after every render, before any click can happen).
  const laneHandlerTargetsRef = useRef({ activateTimelineSlot, getTimelineIndexFromClientX, openContextMenu, onSoundOptionDrop });
  useLayoutEffect(() => {
    laneHandlerTargetsRef.current = { activateTimelineSlot, getTimelineIndexFromClientX, openContextMenu, onSoundOptionDrop };
  });
  const laneHandlers = useMemo<TimelineLaneHandlers>(() => ({
    activateTimelineSlot: (layerId, clientX, source) => laneHandlerTargetsRef.current.activateTimelineSlot(layerId, clientX, source),
    getTimelineIndexFromClientX: (clientX) => laneHandlerTargetsRef.current.getTimelineIndexFromClientX(clientX),
    openContextMenu: (event, targetIndex, targetLayerId) => laneHandlerTargetsRef.current.openContextMenu(event, targetIndex, targetLayerId),
    dropSoundOption: (layerId, frameIndex, option) => laneHandlerTargetsRef.current.onSoundOptionDrop?.(layerId, frameIndex, option),
    startResize: (state) => setResizeState(state),
  }), []);

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
  const canCopyContextTarget = useMemo(() => {
    if (!contextMenu) return false;
    const targetLayer = layers.find((layer) => layer.id === contextMenu.targetLayerId);
    const targetFrame = targetLayer?.frames[contextMenu.targetIndex];
    return Boolean(targetFrame && targetFrame.cellType !== "empty");
  }, [contextMenu, layers]);
  const canRemoveSoundAttachmentTarget = useMemo(() => {
    if (!contextMenu) return false;
    const targetLayer = layers.find((layer) => layer.id === contextMenu.targetLayerId);
    const targetFrame = targetLayer?.frames[contextMenu.targetIndex];
    return Boolean(targetFrame?.soundAttachment);
  }, [contextMenu, layers]);
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
    panelResizeEdgeHeight,
  }: {
    rowsHeight: number;
    renderedLayers: TimelineLayer[];
    panelHeight: number;
    attachInteractionRefs: boolean;
    isOverlay: boolean;
    panelResizeEdgeHeight: number;
  }) => {
    const rowLanesHeight = renderedLayers.length * TIMELINE_LAYER_ROW_HEIGHT;
    const showVerticalOverflow = rowsHeight > TIMELINE_MIN_PANEL_ROWS_HEIGHT && rowLanesHeight > rowsHeight + 1;

    return (
      <div
        data-timeline-panel={isOverlay ? "overlay" : "baseline"}
        style={{
          position: isOverlay ? "absolute" : "relative",
          left: 0,
          top: 0,
          width: "100%",
          height: panelHeight,
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: `${TIMELINE_RULER_HEIGHT}px ${rowsHeight}px ${TIMELINE_BOTTOM_SCROLLBAR_HEIGHT}px ${panelResizeEdgeHeight}px`,
          background: TIMELINE_LANE_BACKGROUND,
          zIndex: isOverlay ? 20 : 1,
          border: isOverlay ? `1px solid ${workspaceColors.border}` : "none",
          borderRadius: isOverlay ? "0 0 10px 10px" : 0,
          boxShadow: isOverlay ? "0 16px 32px rgba(0,0,0,0.45)" : "none",
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
            background: workspaceColors.divider,
            pointerEvents: "none",
            zIndex: 3,
          }}
        />

        <div
          style={{
            position: "relative",
            overflow: "hidden",
            background: workspaceColors.chrome,
            borderBottom: `1px solid ${workspaceColors.divider}`,
            borderTop: `1px solid ${workspaceColors.divider}`,
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
                    background: "#3d5a82",
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
                    background: "#557399",
                    pointerEvents: "none",
                  }}
                />
              ))}

              {rulerLabelElements[isOverlay ? "overlay" : "baseline"]}
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
            background: TIMELINE_LANE_BACKGROUND,
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
                const isActiveLayer = layer.id === activeLayerId;
                const highlightedSpanBounds = isActiveLayer
                  ? getHighlightedSpanBounds(layer.frames, currentFrameIndex, selectedTimelineIndex)
                  : null;

                return (
                  <TimelineLayerLane
                    key={`${isOverlay ? "overlay" : "baseline"}-${layer.id}`}
                    layer={layer}
                    isOverlay={isOverlay}
                    isActiveLayer={isActiveLayer}
                    showActiveBackground={isActiveLayer && renderedLayers.length > 1}
                    selectedTimelineIndex={isActiveLayer ? selectedTimelineIndex : -1}
                    highlightedStartIndex={highlightedSpanBounds?.startIndex ?? -1}
                    highlightedEndIndex={highlightedSpanBounds?.endIndex ?? -1}
                    rulerWidth={rulerWidth}
                    canDropSound={Boolean(onSoundOptionDrop)}
                    handlers={laneHandlers}
                  />
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
            background: workspaceColors.chrome,
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

        {panelResizeEdgeHeight > 0 && (
          <div
            data-timeline-panel-resizer="true"
            style={{
              width: "100%",
              height: resizeEdgeHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "ns-resize",
              borderTop: `1px solid ${workspaceColors.divider}`,
              background: workspaceColors.chrome,
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
                background: "#3a5a85",
                boxShadow: `0 5px 0 ${workspaceColors.border}`,
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
      className={responsiveLayout ? "drawing-timeline" : undefined}
      style={{
        "--timeline-panel-height": `${rightPanelHeight}px`,
        position: "relative",
        zIndex: 12,
        overflow: "visible",
        minHeight: baselinePanelHeight,
        height: baselinePanelHeight,
        display: "grid",
        gridTemplateColumns: "max-content minmax(0, 1fr)",
        columnGap: 10,
        padding: "0 0 0 14px",
        background: workspaceColors.chrome,
        borderBottom: `1px solid ${workspaceColors.divider}`,
        flexShrink: 0,
      } as CSSProperties}
    >
      <style>{`
        @media (max-width: 640px) {
          .drawing-timeline {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: auto var(--timeline-panel-height);
            height: auto !important;
            min-height: 0 !important;
            padding-left: 0 !important;
          }

          .drawing-timeline .drawing-timeline-controls {
            grid-column: 1 !important;
            min-width: 0;
            overflow-x: auto;
            padding-inline: 10px;
          }

          .drawing-timeline .drawing-timeline-controls > * {
            flex-shrink: 0;
          }

          .drawing-timeline .drawing-timeline-frames {
            grid-column: 1 !important;
            margin-left: 0 !important;
            height: var(--timeline-panel-height) !important;
          }
        }

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
          background: #163058;
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
          background: #3a5a85;
        }

        .timeline-bottom-scrollbar-slider::-moz-range-track {
          height: 3px;
          background: #163058;
          border-radius: 999px;
        }

        .timeline-bottom-scrollbar-slider::-moz-range-thumb {
          width: 28px;
          height: 6px;
          border: none;
          border-radius: 999px;
          background: #3a5a85;
        }
      `}</style>

      <div
        className="drawing-timeline-controls"
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
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: workspaceColors.label,
            fontWeight: 700,
            userSelect: "none",
            whiteSpace: "nowrap",
            marginRight: 2,
          }}
        >
          Timeline
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            height: 30,
            boxSizing: "border-box",
            padding: "0 4px 0 10px",
            borderRadius: 9,
            border: `1px solid ${workspaceColors.border}`,
            background: workspaceColors.panel,
            color: workspaceColors.textSecondary,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: workspaceColors.label,
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
            onChange={(event) => setFpsInputValue(event.target.value)}
            onBlur={commitFps}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitFps();
              }
            }}
            style={{
              width: 46,
              height: 22,
              boxSizing: "border-box",
              padding: "0 4px",
              borderRadius: 6,
              border: `1px solid ${workspaceColors.divider}`,
              background: workspaceColors.inset,
              color: workspaceColors.textPrimary,
              fontSize: 12,
              fontWeight: 700,
              textAlign: "center",
              outline: "none",
            }}
          />
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 0 2px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={onAddLayer}
            style={timelineButtonStyle}
          >
            + Layer
          </button>
          <button
            type="button"
            onClick={onToggleOnion}
            aria-pressed={isOnionEnabled}
            style={isOnionEnabled ? timelineSelectedButtonStyle : timelineButtonStyle}
          >
            Onion
          </button>
          <button
            type="button"
            onClick={isPlaying ? onPause : onPlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            style={{
              ...(isPlaying ? timelineSelectedButtonStyle : timelineButtonStyle),
              minWidth: 76,
              justifyContent: "center",
            }}
          >
            {isPlaying ? (
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                <rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
                <rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                <path d="M3 1.6v8.8a.6.6 0 0 0 .9.52l7.2-4.4a.6.6 0 0 0 0-1.04L3.9 1.08A.6.6 0 0 0 3 1.6Z" fill="currentColor" />
              </svg>
            )}
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>
        </div>
      </div>

      <div
        className="drawing-timeline-frames"
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
          attachInteractionRefs: layers.length <= 1,
          isOverlay: false,
          panelResizeEdgeHeight: 0,
        })}
        {layers.length > 1 &&
          renderTimelineRightPanel({
            rowsHeight: timelineRowsHeight,
            renderedLayers: isExpanded ? layers : activeLayer ? [activeLayer] : layers.slice(0, 1),
            panelHeight: rightPanelHeight,
            attachInteractionRefs: true,
            isOverlay: true,
            panelResizeEdgeHeight: resizeEdgeHeight,
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
              borderRadius: 12,
              border: `1px solid ${workspaceColors.divider}`,
              background: workspaceColors.panel,
              boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
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
                style={contextMenuItemStyle(true)}
              >
                {item.label}
              </button>
            ))}
            {onCopyFrame && (
              <button
                type="button"
                onClick={() => runMenuAction(() => onCopyFrame(contextMenu.targetLayerId, contextMenu.targetIndex))}
                disabled={!canCopyContextTarget}
                style={contextMenuItemStyle(canCopyContextTarget)}
              >
                Copy Frame
              </button>
            )}
            {onPasteFrame && (
              <button
                type="button"
                onClick={() => runMenuAction(() => onPasteFrame(contextMenu.targetLayerId, contextMenu.targetIndex))}
                disabled={!canPasteFrame}
                style={contextMenuItemStyle(canPasteFrame)}
              >
                Paste Frame
              </button>
            )}
            <button
              type="button"
              onClick={() => runMenuAction(() => onRemoveFrame(contextMenu.targetLayerId, contextMenu.targetIndex))}
              disabled={!canRemoveContextTarget}
              style={contextMenuItemStyle(canRemoveContextTarget, "danger")}
            >
              Remove Frame
            </button>
            {onRemoveSoundAttachment && (
              <button
                type="button"
                onClick={() => runMenuAction(() => onRemoveSoundAttachment(contextMenu.targetLayerId, contextMenu.targetIndex))}
                disabled={!canRemoveSoundAttachmentTarget}
                style={contextMenuItemStyle(canRemoveSoundAttachmentTarget, "danger")}
              >
                Remove Attached Sound
              </button>
            )}
            {showsDeleteLayerAction && (
              <button
                type="button"
                onClick={() => {
                  if (!canDeleteContextLayer) return;
                  runMenuAction(onDeleteLayer);
                }}
                disabled={!canDeleteContextLayer}
                style={contextMenuItemStyle(canDeleteContextLayer, "danger")}
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
