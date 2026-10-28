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
  // Picture / text on this frame (a frame with none of these, and no stick or symbols, is shown see-through).
  hasDrawing?: boolean;
  hasText?: boolean;
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
  desktopRightInset?: number;
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
  onDeleteLayer: (layerId?: string) => void;
  /** SPEC-0020 Phase 4: layers hidden with the eye button (editor only), and the toggle. */
  hiddenLayerIds?: string[];
  onToggleLayerVisibility?: (layerId: string) => void;
  canDeleteLayer: boolean;
  onToggleOnion: () => void;
  onPlay: () => void;
  onPause: () => void;
  onAddFrame: (layerId: string, kind: TimelineFrameKind, targetIndex: number, options?: { blank?: boolean }) => void;
  onRemoveFrame: (layerId: string, targetIndex: number) => void;
  onCopyFrame?: (layerId: string, targetIndex: number) => void;
  onPasteFrame?: (layerId: string, targetIndex: number) => void;
  // Move the picked frames (layer id -> frame numbers) so they land before frame `insertIndex` of a layer. One Undo step.
  // sourceLayerId -> layerId it should land on (frames from several layers keep their layout).
  // "layerId:stateId" of frames that hold stick figures or symbols (so they are not shown as empty).
  contentStateKeys?: ReadonlySet<string>;
  onMoveFrames?: (picked: Record<string, number[]>, assignments: Record<string, string>, insertIndex: number, anchorLayerId?: string) => boolean;
  // Copy / paste the picked (blue) frames from the right-click menu. Copy returns how many frames it took.
  onCopyPickedFrames?: (picked: Record<string, number[]>) => number;
  onPastePickedFrames?: (assignments: Record<string, string>, insertIndex: number, anchorLayerId?: string) => boolean;
  onRemovePickedFrames?: (picked: Record<string, number[]>) => boolean;
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
  /** Phones (Arthur 2026-10-28): the list opens upward with its grab bar on top, so dragging up shows more layers. */
  opensUpward?: boolean;
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

const clampFps = (value: number) => Math.max(1, Math.min(60, Math.round(value)));

// Compact pill controls. Rest/selected only: pointer hover comes from workspaceTheme.module.css.
// SPEC-0020 Phase 4 (Arthur): Add layer / Onion skin are bare symbols (no box). Hover turns the symbol the
// accent color (workspaceTheme.module.css, data-hover="icon"); Onion skin stays the accent color while it's on.
const timelineIconButtonStyle = (isOn: boolean): CSSProperties => ({
  width: 30,
  height: 30,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: isOn ? "var(--da-hover, #0066ff)" : "var(--da-text-2, #c9d6ea)",
  cursor: "pointer",
});

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
  color: "var(--da-on-selected, #eaf3ff)",
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
// Workspace makeover (Arthur 2026-10-26): a taller, pro ruler — ticks rise from a baseline, numbers sit above.
const TIMELINE_RULER_HEIGHT = 18;
const TIMELINE_RULER_INTERVAL = 5;
const TIMELINE_MAX_FRAME_RANGE = 10000;
const TIMELINE_SCROLL_END_PADDING = FRAME_CELL_WIDTH * 2;
// Frames are gray with black keyframe dots (classic animation-app look) on a navy lane.
// Current frame: dull blue outline. Hover: bright var(--da-hover, #0066FF) outline via data-hover="outline".
const TIMELINE_LANE_BACKGROUND = workspaceColors.chrome;
const TIMELINE_EMPTY_SLOT_FILL = "var(--da-panel, #071120)";
const TIMELINE_EMPTY_SLOT_BORDER = workspaceColors.divider;
const TIMELINE_SELECTED_SLOT_OUTLINE = `2px solid ${workspaceColors.selectedBorder}`;
const TIMELINE_SELECTED_SLOT_BORDER = workspaceColors.selectedBorder;
const TIMELINE_FRAME_SPAN_FILL = "rgb(124,128,136)";
// A blank keyframe (nothing drawn) is still a real frame, shown a little see-through.
const TIMELINE_BLANK_SPAN_FILL = "rgba(124, 128, 136, 0.4)";
const TIMELINE_FRAME_SPAN_BORDER = "rgba(20,22,28,0.88)";
const TIMELINE_FRAME_SPAN_LINE = "rgb(158,164,172)";
// The hold line on a see-through (blank) frame: same line, a little brighter so it still reads.
const TIMELINE_BLANK_SPAN_LINE = "rgb(176,182,192)";
const TIMELINE_TWEEN_SPAN_FILL = "rgb(83,97,129)";
const TIMELINE_TWEEN_SPAN_BORDER = "rgba(39,55,82,0.9)";
const TIMELINE_TWEEN_SPAN_LINE = "rgb(116,172,246)";
const TIMELINE_SOUND_SLOT_FILL = "rgba(88, 44, 168, 0.92)";
const TIMELINE_SOUND_SLOT_BORDER = "rgba(58, 26, 116, 1)";
const TIMELINE_KEYFRAME_DOT = "#111111";
const TIMELINE_SPAN_DOT_LINE_GAP = 14;
const TIMELINE_LEFT_RAIL_HEIGHT = 62;
const TIMELINE_LAYER_ROW_HEIGHT = 38;
const LAYER_CONTROLS_WIDTH = 62;
const layerControlButtonStyle: CSSProperties = {
  width: 26,
  height: 26,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "var(--da-text-2, #c9d6ea)",
  cursor: "pointer",
};
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
  // Frames of this layer picked with box / Shift / Cmd-click (null = none). Same object until the picking changes.
  selectedFrames: ReadonlySet<number> | null;
  contentStateKeys: ReadonlySet<string> | undefined;
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
  selectedFrames,
  contentStateKeys,
  rulerWidth,
  canDropSound,
  handlers,
}: TimelineLayerLaneProps) {
  const layerFrames = layer.frames;
  // Empty placeholder cells after the last real frame (left over from an Undo or a delete) are not drawn.
  let lastRealFrameIndex = -1;
  for (let index = layerFrames.length - 1; index >= 0; index -= 1) {
    if (layerFrames[index].cellType !== "empty") { lastRealFrameIndex = index; break; }
  }
  const visibleFrameCount = lastRealFrameIndex + 1;
  const realFrameRowWidth = visibleFrameCount * FRAME_CELL_WIDTH;
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
        // Workspace makeover: the current layer is a soft blue band, matching its controls on the left.
        background: showActiveBackground ? "rgba(0,102,255,0.08)" : "transparent",
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
          {layerFrames.slice(0, visibleFrameCount).map((frame, index) => {
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
            // Nothing drawn, written or placed on this frame: it is a blank frame, shown a little see-through.
            const isBlankSpan =
              !isEmpty && !isTween && !hasSoundAttachment &&
              (spanSourceFrame.cellType === "blank-keyframe" ||
                spanSourceFrame.isBlank === true ||
                (!spanSourceFrame.hasDrawing && !spanSourceFrame.hasText && !contentStateKeys?.has(`${layer.id}:${spanSourceFrame.stateId}`)));
            const restFill = isEmpty && !hasSoundAttachment ? TIMELINE_EMPTY_SLOT_FILL : isBlankSpan ? TIMELINE_BLANK_SPAN_FILL : resolvedFill;
            // The current slot keeps its white/empty fill and gets a dull blue outline.
            const isPicked = selectedFrames?.has(index) ?? false;
            const frameBackground = restFill;
            const interiorSeam = isBlankSpan ? "transparent" : frameBackground;
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
                        background: isBlankSpan ? TIMELINE_BLANK_SPAN_LINE : spanLineColor,
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

        {isActiveLayer && selectedTimelineIndex >= visibleFrameCount && (
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
  desktopRightInset = 0,
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
  hiddenLayerIds = [],
  onToggleLayerVisibility,
  canDeleteLayer,
  onToggleOnion,
  onPlay,
  onPause,
  onAddFrame,
  onRemoveFrame,
  onCopyFrame,
  onPasteFrame,
  contentStateKeys,
  onMoveFrames,
  onCopyPickedFrames,
  onPastePickedFrames,
  onRemovePickedFrames,
  onRemoveSoundAttachment,
  onResizeTimelineSpan,
  onSoundOptionDrop,
}: DrawingTimelineRowProps) {
  const [fpsInputValue, setFpsInputValue] = useState(String(fps));
  const [contextMenu, setContextMenu] = useState<TimelineContextMenuState>(null);

  // Pass 1 (Arthur): pick many frames. Box = press on a frame and drag across frames / layers.
  // Shift-click = range, Cmd/Ctrl-click = add or remove one, Esc or a plain click = clear. Nothing moves yet.
  const [picked, setPicked] = useState<Record<string, number[]>>({});
  const pickedByLayer = useMemo(() => {
    const map = new Map<string, ReadonlySet<number>>();
    for (const [layerId, list] of Object.entries(picked)) if (list.length) map.set(layerId, new Set(list));
    return map;
  }, [picked]);
  const [copiedPickedCount, setCopiedPickedCount] = useState(0);
  const copiedPickedLayersRef = useRef<string[]>([]);
  // Frames from several layers keep their layout: the layer you drop on takes the grabbed layer's frames and the
  // layers above / below it take the frames of the layers above / below the grabbed one.
  const assignLayers = (sourceIds: string[], anchorId: string, targetId: string) => {
    const order = layers.map((layer) => layer.id);
    const anchorPos = order.indexOf(anchorId);
    const targetPos = order.indexOf(targetId);
    const result: Record<string, string> = {};
    if (anchorPos < 0 || targetPos < 0) { sourceIds.forEach((id) => { result[id] = targetId; }); return result; }
    const positions = sourceIds.map((id) => order.indexOf(id)).filter((pos) => pos >= 0);
    let shift = targetPos - anchorPos;
    if (positions.length) {
      shift = Math.max(-Math.min(...positions), Math.min(order.length - 1 - Math.max(...positions), shift));
    }
    sourceIds.forEach((id) => {
      const pos = order.indexOf(id);
      result[id] = pos < 0 ? targetId : order[Math.max(0, Math.min(order.length - 1, pos + shift))];
    });
    return result;
  };
  const pickedLayerIdsInOrder = (map: Record<string, number[]>) =>
    layers.map((layer) => layer.id).filter((id) => (map[id]?.length ?? 0) > 0);
  // One rectangle per block of picked frames: neighbouring layers with the same picked frame numbers share one box.
  const pickedBoxes = (rendered: TimelineLayer[]) => {
    type Box = { row: number; rows: number; start: number; end: number };
    const boxes: Box[] = [];
    rendered.forEach((layer, row) => {
      const list = picked[layer.id];
      if (!list?.length) return;
      const sorted = list.slice().sort((a, b) => a - b);
      let start = sorted[0];
      let previous = sorted[0];
      const flush = (from: number, to: number) => {
        const above = boxes.find((box) => box.row + box.rows === row && box.start === from && box.end === to);
        if (above) above.rows += 1;
        else boxes.push({ row, rows: 1, start: from, end: to });
      };
      for (let k = 1; k < sorted.length; k += 1) {
        if (sorted[k] === previous + 1) { previous = sorted[k]; continue; }
        flush(start, previous);
        start = sorted[k];
        previous = sorted[k];
      }
      flush(start, previous);
    });
    return boxes;
  };
  const pickAnchorRef = useRef<{ layerId: string; index: number } | null>(null);
  // While picked frames are being dragged: the blue drop line and a small "N frames" stack under the mouse.
  const [moveUi, setMoveUi] = useState<{ line: { left: number; top: number; height: number } | null; x: number; y: number; count: number } | null>(null);
  const swallowClickRef = useRef(false);
  const clearPicked = useCallback(() => setPicked((current) => (Object.keys(current).length ? {} : current)), []);

  const buildPicked = useCallback((order: string[], from: { layerId: string; index: number }, to: { layerId: string; index: number }) => {
    const a = order.indexOf(from.layerId);
    const b = order.indexOf(to.layerId);
    if (a < 0 || b < 0) return null;
    const result: Record<string, number[]> = {};
    const firstFrame = Math.min(from.index, to.index);
    const lastFrame = Math.max(from.index, to.index);
    for (let row = Math.min(a, b); row <= Math.max(a, b); row += 1) {
      const layer = layers.find((item) => item.id === order[row]);
      if (!layer) continue;
      const list: number[] = [];
      for (let index = firstFrame; index <= lastFrame && index < layer.frames.length; index += 1) list.push(index);
      if (list.length) result[layer.id] = list;
    }
    return result;
  }, [layers]);

  const cellOf = (target: EventTarget | null) => {
    const cell = target instanceof Element ? target.closest<HTMLElement>("[data-timeline-cell]") : null;
    if (!cell) return null;
    const layerId = cell.dataset.layerId;
    const index = Number(cell.dataset.frameIndex);
    return layerId && Number.isFinite(index) ? { layerId, index } : null;
  };

  const onPickPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey) return;
    const start = cellOf(event.target);
    if (!start) return;
    // Pressing on a frame that is already picked: dragging carries ALL picked frames to a new place.
    if (pickedByLayer.get(start.layerId)?.has(start.index)) {
      if (!onMoveFrames) return;
      const pickedNow = picked;
      const count = Object.values(pickedNow).reduce((sum, list) => sum + list.length, 0);
      const px = event.clientX;
      const py = event.clientY;
      let carrying = false;
      let drop: { layerId: string; index: number } | null = null;
      const computeDrop = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y);
        const cellEl = el instanceof Element ? el.closest<HTMLElement>("[data-timeline-cell]") : null;
        if (cellEl && cellEl.dataset.layerId) {
          const rect = cellEl.getBoundingClientRect();
          const frameNumber = Number(cellEl.dataset.frameIndex);
          const rightHalf = x >= rect.left + rect.width / 2;
          return {
            target: { layerId: cellEl.dataset.layerId, index: rightHalf ? frameNumber + 1 : frameNumber },
            line: { left: (rightHalf ? rect.right : rect.left) - 2, top: rect.top, height: rect.height },
          };
        }
        // Open space: no frame under the mouse. Use the layer row the mouse is in and snap to just after its last
        // frame (never leave a gap before the new frames).
        // Find the layer lane that is really under the mouse (the element on top), not just any row at this height.
        let lane: Element | null = el;
        let sameLayer: HTMLElement[] = [];
        for (let depth = 0; lane && depth < 6; depth += 1, lane = lane.parentElement) {
          const inside = Array.from(lane.querySelectorAll<HTMLElement>("[data-timeline-cell]"));
          if (inside.length && new Set(inside.map((cell) => cell.dataset.layerId)).size === 1) { sameLayer = inside; break; }
        }
        if (!sameLayer.length) return null;
        const layerId = sameLayer[0].dataset.layerId;
        if (!layerId) return null;
        const last = sameLayer.reduce((best, cell) => (Number(cell.dataset.frameIndex) > Number(best.dataset.frameIndex) ? cell : best), sameLayer[0]);
        const lastRect = last.getBoundingClientRect();
        if (x < lastRect.right) return null;
        return {
          target: { layerId, index: Number(last.dataset.frameIndex) + 1 },
          line: { left: lastRect.right - 2, top: lastRect.top, height: lastRect.height },
        };
      };
      const onMove = (moveEvent: PointerEvent) => {
        if (!carrying && Math.hypot(moveEvent.clientX - px, moveEvent.clientY - py) < 6) return;
        carrying = true;
        const found = computeDrop(moveEvent.clientX, moveEvent.clientY);
        drop = found ? found.target : null;
        setMoveUi({ line: found ? found.line : null, x: moveEvent.clientX, y: moveEvent.clientY, count });
      };
      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setMoveUi(null);
        if (!carrying && Math.hypot(upEvent.clientX - px, upEvent.clientY - py) >= 6) carrying = true;
        if (carrying) {
          const atRelease = computeDrop(upEvent.clientX, upEvent.clientY);
          if (atRelease) drop = atRelease.target;
          swallowClickRef.current = true;
          window.setTimeout(() => { swallowClickRef.current = false; }, 0);
          if (drop && onMoveFrames(pickedNow, assignLayers(pickedLayerIdsInOrder(pickedNow), start.layerId, drop.layerId), drop.index, drop.layerId)) clearPicked();
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      return;
    }
    const container = event.currentTarget;
    const order: string[] = [];
    container.querySelectorAll<HTMLElement>("[data-timeline-cell]").forEach((cell) => {
      const id = cell.dataset.layerId;
      if (id && !order.includes(id)) order.push(id);
    });
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    const move = (moveEvent: PointerEvent) => {
      if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
      dragging = true;
      const over = cellOf(document.elementFromPoint(moveEvent.clientX, moveEvent.clientY));
      if (!over) return;
      const next = buildPicked(order, start, over);
      if (next) setPicked(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (dragging) {
        swallowClickRef.current = true;
        window.setTimeout(() => { swallowClickRef.current = false; }, 0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onPickClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (swallowClickRef.current) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    const cell = cellOf(event.target);
    if (!cell) return;
    if (event.shiftKey && pickAnchorRef.current) {
      event.stopPropagation();
      event.preventDefault();
      const order: string[] = [];
      event.currentTarget.querySelectorAll<HTMLElement>("[data-timeline-cell]").forEach((el) => {
        const id = el.dataset.layerId;
        if (id && !order.includes(id)) order.push(id);
      });
      const next = buildPicked(order, pickAnchorRef.current, cell);
      if (next) setPicked(next);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.stopPropagation();
      event.preventDefault();
      pickAnchorRef.current = cell;
      setPicked((current) => {
        const list = new Set(current[cell.layerId] ?? []);
        if (list.has(cell.index)) list.delete(cell.index); else list.add(cell.index);
        return { ...current, [cell.layerId]: [...list].sort((x, y) => x - y) };
      });
      return;
    }
    pickAnchorRef.current = cell;
    clearPicked();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target0 = event.target instanceof HTMLElement ? event.target : null;
      const typing0 = !!target0 && (target0.tagName === "INPUT" || target0.tagName === "TEXTAREA" || target0.tagName === "SELECT" || target0.isContentEditable);
      if (!typing0 && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        const letter = event.key.toLowerCase();
        const hasPicked = Object.values(picked).some((list) => list.length);
        if (letter === "c") {
          // Frames picked: copy the frames. Nothing picked: leave Copy alone (drawing selections keep working).
          if (hasPicked && onCopyPickedFrames) {
            event.preventDefault();
            copiedPickedLayersRef.current = pickedLayerIdsInOrder(picked);
            setCopiedPickedCount(onCopyPickedFrames(picked));
          } else if (copiedPickedCount !== 0) {
            setCopiedPickedCount(0);
          }
          return;
        }
        if (letter === "v" && copiedPickedCount > 0 && onPastePickedFrames) {
          // Paste the copied frames right after the current frame, on the layer that is open.
          event.preventDefault();
          const sources = copiedPickedLayersRef.current;
          onPastePickedFrames(assignLayers(sources, sources[0] ?? activeLayerId, activeLayerId), selectedTimelineIndex + 1, activeLayerId);
          return;
        }
      }
      if (event.key === "Escape") { clearPicked(); return; }
      if ((event.key === "Delete" || event.key === "Backspace") && onRemovePickedFrames) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
        if (!Object.values(picked).some((list) => list.length)) return;
        event.preventDefault();
        if (onRemovePickedFrames(picked)) clearPicked();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeLayerId, clearPicked, copiedPickedCount, onCopyPickedFrames, onPastePickedFrames, onRemovePickedFrames, picked, selectedTimelineIndex]);
  useEffect(() => { clearPicked(); }, [activeLayerId, clearPicked]);
  const [visibleTimelineWidth, setVisibleTimelineWidth] = useState(0);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [resizeState, setResizeState] = useState<TimelineResizeState | null>(null);
  const [panelResizeState, setPanelResizeState] = useState<TimelinePanelResizeState | null>(null);
  const [timelineRowsHeight, setTimelineRowsHeight] = useState(TIMELINE_MIN_PANEL_ROWS_HEIGHT);
  // SPEC-0020 Phase 7 (Arthur's "empty layer disappears after reopening"): the layer was never lost — a reopened
  // project started with the timeline folded to one row, which only shows the active layer. Starting the count
  // at 1 makes a project that opens with 2+ layers unfold to show them, the same as adding a layer does.
  const previousLayerCountRef = useRef(1);
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
    // Arthur 2026-10-13: on phones the scroll position wasn't always reported, so ticks vanished when scrolling.
    // Drawing every tick up to 3000 frames is cheap and always right; longer timelines keep the windowed version.
    if (logicalTimelineFrameCount <= 3000) return { firstVisibleTick: 1, lastVisibleTick: logicalTimelineFrameCount };
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
                bottom: 0,
                width: 1,
                height: 10,
                background: "#6a7fa3",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: labelLeft,
                top: 0,
                color: "#9aabc8",
                fontSize: 10,
                fontWeight: 600,
                lineHeight: "10px",
                fontVariantNumeric: "tabular-nums",
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

      const deltaY = panelResizeState.opensUpward ? panelResizeState.startY - event.clientY : event.clientY - panelResizeState.startY;
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
    // SPEC-0020 Phase 4 (Arthur): with 2+ layers each layer row starts with an eye (show/hide) and a trash can
    // (delete); the frames move right to make room. One layer: no column.
    const layerControlsWidth = layers.length >= 2 ? LAYER_CONTROLS_WIDTH : 0;
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
            marginLeft: layerControlsWidth,
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
                borderBottom: "1px solid #1a2b45",
                boxSizing: "border-box",
              }}
            >
              {visibleMinorTickNumbers.map((tickNumber) => (
                <div
                  key={`${isOverlay ? "overlay" : "baseline"}-minor-${tickNumber}`}
                  style={{
                    position: "absolute",
                    left: tickNumber * FRAME_CELL_WIDTH - FRAME_CELL_WIDTH / 2,
                    bottom: 0,
                    width: 1,
                    height: 4,
                    background: "#3d5579",
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
                    bottom: 0,
                    width: 1,
                    height: 7,
                    background: "#5a7299",
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
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          {layerControlsWidth > 0 && (
            <div style={{ flex: `0 0 ${layerControlsWidth}px`, height: rowLanesHeight, background: workspaceColors.chrome, borderRight: `1px solid ${workspaceColors.divider}`, boxSizing: "border-box" }}>
              {renderedLayers.map((layer) => {
                const isHidden = hiddenLayerIds.includes(layer.id);
                return (
                  <div key={`${isOverlay ? "overlay" : "baseline"}-controls-${layer.id}`} data-layer-controls-active={layer.id === activeLayerId ? "true" : undefined} style={{ height: TIMELINE_LAYER_ROW_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, boxSizing: "border-box", borderBottom: `1px solid ${workspaceColors.divider}` }}>
                    <button type="button" data-hover="icon" data-tooltip={isHidden ? "Show layer" : "Hide layer"} data-tooltip-side="right"
                      aria-label={`${isHidden ? "Show" : "Hide"} ${layer.name}`} aria-pressed={isHidden}
                      onClick={() => onToggleLayerVisibility?.(layer.id)} style={layerControlButtonStyle}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
                        {isHidden && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                      </svg>
                    </button>
                    <button type="button" data-hover="icon" data-tooltip="Delete layer" data-tooltip-side="right"
                      aria-label={`Delete ${layer.name}`} onClick={() => onDeleteLayer(layer.id)} style={layerControlButtonStyle}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 7h16M9.5 7V4.8c0-.7.5-1.3 1.2-1.3h2.6c.7 0 1.2.6 1.2 1.3V7M6.5 7l.9 12.2c.1.9.8 1.6 1.7 1.6h5.8c.9 0 1.6-.7 1.7-1.6L17.5 7M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div
            ref={attachInteractionRefs ? frameLaneViewportRef : null}
            className="timeline-frame-main-scroll"
            onPointerDown={onPickPointerDown}
            onClickCapture={onPickClickCapture}
            onScroll={attachInteractionRefs ? (event) => setTimelineScrollLeft(event.currentTarget.scrollLeft) : undefined}
            style={{
              flex: 1,
              minWidth: 0,
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
                    selectedFrames={pickedByLayer.get(layer.id) ?? null}
                    contentStateKeys={contentStateKeys}
                    rulerWidth={rulerWidth}
                    canDropSound={Boolean(onSoundOptionDrop)}
                    handlers={laneHandlers}
                  />
                );
              })}
              {pickedBoxes(renderedLayers).map((box) => (
                <div
                  key={`${isOverlay ? "overlay" : "baseline"}-picked-${box.row}-${box.start}`}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: box.start * FRAME_CELL_WIDTH - 2,
                    top: box.row * TIMELINE_LAYER_ROW_HEIGHT - 2,
                    width: (box.end - box.start + 1) * FRAME_CELL_WIDTH + 4,
                    height: box.rows * TIMELINE_LAYER_ROW_HEIGHT + 4,
                    boxSizing: "border-box",
                    border: "2px solid #0066ff",
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                />
              ))}
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
                // Same screens as the "opens upward" rule in globals.css.
                opensUpward: window.matchMedia("(max-width: 600px), (max-height: 500px) and (orientation: landscape) and (max-width: 950px)").matches,
              });
            }}
          >
            <div
              style={{
                width: 36,
                height: 3,
                borderRadius: 999,
                background: "var(--da-c-3a5a85, #3a5a85)",
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
        // The timeline floats above the panel and canvas and runs the full width; nothing else moves (Arthur).
        "--timeline-desktop-right-inset": "0px",
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

        @media (min-width: 901px) {
          .drawing-timeline .drawing-timeline-frames {
            margin-right: var(--timeline-desktop-right-inset);
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
          background: var(--da-line, #163058);
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
          background: var(--da-c-3a5a85, #3a5a85);
        }

        .timeline-bottom-scrollbar-slider::-moz-range-track {
          height: 3px;
          background: var(--da-line, #163058);
          border-radius: 999px;
        }

        .timeline-bottom-scrollbar-slider::-moz-range-thumb {
          width: 28px;
          height: 6px;
          border: none;
          border-radius: 999px;
          background: var(--da-c-3a5a85, #3a5a85);
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
        {/* Workspace makeover: no "Timeline" label; the controls sit together as one transport group. */}

        <label
          className="drawing-fps"
          title="Frames per second"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            height: 30,
            boxSizing: "border-box",
            padding: "0 2px",
            border: 0,
            background: "transparent",
            color: workspaceColors.textSecondary,
            flexShrink: 0,
            cursor: "text",
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
            max={60}
            step={1}
            value={fpsInputValue}
            onChange={(event) => setFpsInputValue(event.target.value)}
            onBlur={commitFps}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitFps();
              }
            }}
            // SPEC-0020 Phase 4 (Arthur): one box only — the FPS field has no box of its own inside the outer one.
            style={{
              width: 34,
              height: 22,
              boxSizing: "border-box",
              padding: "0 2px",
              border: 0,
              background: "transparent",
              color: workspaceColors.textPrimary,
              fontSize: 12,
              fontWeight: 700,
              textAlign: "center",
              outline: "none",
            }}
          />
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 0 2px", flexShrink: 0 }}>
          {/* SPEC-0020 Phase 4 (Arthur): Layer and Onion are symbols only (Play keeps its word).
              Add layer = stacked squares fading back; Onion skin = a stick figure with fading "ghost" copies. */}
          <button
            type="button"
            onClick={onAddLayer}
            aria-label="Add layer"
            data-tooltip="Add layer"
            data-tooltip-side="below"
            data-hover="icon"
            style={timelineIconButtonStyle(false)}
          >
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
              <path d="M7.5 4.5V3.1c0-.9.7-1.6 1.6-1.6h6.8c.9 0 1.6.7 1.6 1.6v6.8c0 .9-.7 1.6-1.6 1.6H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
              <path d="M5 7.5V6.1c0-.9.7-1.6 1.6-1.6h6.8c.9 0 1.6.7 1.6 1.6v6.8c0 .9-.7 1.6-1.6 1.6H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              <rect x="2.5" y="7.5" width="10" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggleOnion}
            aria-pressed={isOnionEnabled}
            aria-label={isOnionEnabled ? "Onion skin on" : "Onion skin off"}
            data-tooltip={isOnionEnabled ? "Onion skin: on" : "Onion skin: off"}
            data-tooltip-side="below"
            data-hover="icon"
            style={timelineIconButtonStyle(isOnionEnabled)}
          >
            <svg aria-hidden="true" width="19" height="17" viewBox="0 0 24 20" fill="none" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <g opacity="0.28" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="4" r="2.2" /><path d="M5 6.4v6.4M5 8.6 2.4 11M5 8.6 7.6 11M5 12.8 3 18M5 12.8 7 18" /></g>
              <g opacity="0.55" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="4" r="2.2" /><path d="M11 6.4v6.4M11 8.6 8.4 11M11 8.6 13.6 11M11 12.8 9 18M11 12.8 13 18" /></g>
              <g stroke="currentColor" strokeWidth="1.8"><circle cx="17.5" cy="4" r="2.3" fill="currentColor" /><path d="M17.5 6.4v6.4M17.5 8.6 14.8 11M17.5 8.6 20.2 11M17.5 12.8 15.4 18M17.5 12.8 19.6 18" /></g>
            </svg>
          </button>
          <button
            type="button"
            onClick={isPlaying ? onPause : onPlay}
            className="drawing-play" data-hover="bright"
            aria-label={isPlaying ? "Pause" : "Play"}
            style={{
              ...(isPlaying ? timelineSelectedButtonStyle : timelineButtonStyle),
              minWidth: 76,
              justifyContent: "center",
            }}
          >
            {isPlaying ? (
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                <rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
                <rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                <path d="M3 1.6v8.8a.6.6 0 0 0 .9.52l7.2-4.4a.6.6 0 0 0 0-1.04L3.9 1.08A.6.6 0 0 0 3 1.6Z" fill="currentColor" />
              </svg>
            )}

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

        {moveUi?.line && (
          <div
            aria-hidden="true"
            style={{ position: "fixed", left: moveUi.line.left, top: moveUi.line.top - 2, width: 5, height: moveUi.line.height + 4, background: "#1f7bff", borderRadius: 3, boxShadow: "0 0 0 1px #ffffff, 0 0 10px 2px rgba(0, 102, 255, 0.85)", pointerEvents: "none", zIndex: 60 }}
          />
        )}
        {moveUi && (
          <div
            aria-hidden="true"
            style={{ position: "fixed", left: moveUi.x + 12, top: moveUi.y + 12, padding: "3px 8px", borderRadius: 6, background: "#0066ff", color: "#fff", font: "600 12px system-ui, sans-serif", pointerEvents: "none", zIndex: 61 }}
          >
            {moveUi.count} {moveUi.count === 1 ? "frame" : "frames"}
          </div>
        )}
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
            {onCopyFrame && (() => {
              const pickedCount = Object.values(picked).reduce((sum, list) => sum + list.length, 0);
              const targetIsPicked = !!pickedByLayer.get(contextMenu.targetLayerId)?.has(contextMenu.targetIndex);
              const many = targetIsPicked && pickedCount > 0 && !!onCopyPickedFrames;
              return (
                <button
                  type="button"
                  onClick={() => runMenuAction(() => {
                    if (many) { copiedPickedLayersRef.current = pickedLayerIdsInOrder(picked); setCopiedPickedCount(onCopyPickedFrames!(picked)); }
                    else { setCopiedPickedCount(0); onCopyFrame(contextMenu.targetLayerId, contextMenu.targetIndex); }
                  })}
                  disabled={!many && !canCopyContextTarget}
                  style={contextMenuItemStyle(many || canCopyContextTarget)}
                >
                  {many ? `Copy ${pickedCount} ${pickedCount === 1 ? "Frame" : "Frames"}` : "Copy Frame"}
                </button>
              );
            })()}
            {onPasteFrame && (
              <button
                type="button"
                onClick={() => runMenuAction(() => {
                  if (copiedPickedCount > 0 && onPastePickedFrames) {
                    const sources = copiedPickedLayersRef.current;
                    onPastePickedFrames(assignLayers(sources, sources[0] ?? contextMenu.targetLayerId, contextMenu.targetLayerId), contextMenu.targetIndex + 1, contextMenu.targetLayerId);
                }
                  else onPasteFrame(contextMenu.targetLayerId, contextMenu.targetIndex);
                })}
                disabled={!(copiedPickedCount > 0 || canPasteFrame)}
                style={contextMenuItemStyle(copiedPickedCount > 0 || canPasteFrame)}
              >
                {copiedPickedCount > 1 ? `Paste ${copiedPickedCount} Frames` : "Paste Frame"}
              </button>
            )}
            {(() => {
              const pickedCount = Object.values(picked).reduce((sum, list) => sum + list.length, 0);
              const targetIsPicked = !!pickedByLayer.get(contextMenu.targetLayerId)?.has(contextMenu.targetIndex);
              const many = targetIsPicked && pickedCount > 1 && !!onRemovePickedFrames;
              return (
                <button
                  type="button"
                  onClick={() => runMenuAction(() => {
                    if (many) { if (onRemovePickedFrames!(picked)) clearPicked(); }
                    else onRemoveFrame(contextMenu.targetLayerId, contextMenu.targetIndex);
                  })}
                  disabled={!many && !canRemoveContextTarget}
                  data-hover="danger"
                  style={contextMenuItemStyle(many || canRemoveContextTarget, "danger")}
                >
                  {many ? `Remove ${pickedCount} Frames` : "Remove Frame"}
                </button>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
